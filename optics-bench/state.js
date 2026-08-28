(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory(require("./optics.js"));
  else root.OpticsState = factory(root.Optics);
})(typeof window === "undefined" ? this : window, function (O) {
  "use strict";

  const FORMAT = "optics-bench", SCHEMA_VERSION = 1, MAX_BYTES = 256 * 1024;
  const MAX_ELEMENTS = O.MAX_ELEMENTS;
  const DEFAULTS = Object.freeze({ format: FORMAT, schemaVersion: SCHEMA_VERSION, title: "無題の光学系", unit: "cm", gridStep: 10, snap: true, angleSnap: true });
  const UNITS = Object.freeze({ mm: 1, cm: 10, in: 25.4 });
  const SCENE_KEYS = new Set(["format", "schemaVersion", "title", "unit", "gridStep", "snap", "angleSnap", "elements"]);
  const ELEMENT_KEYS = new Set(["id", "type", "x", "y", "angle", "aperture", "focal", "beamWidth", "wavelength", "power", "rayCount", "divergence", "polarization", "polAngle", "axisAngle", "designWavelength", "opening", "coreDiameter", "na", "transmission", "cutoff", "mode", "enabled", "label"]);
  const ANGLE_KEYS = new Set(["angle", "polAngle", "axisAngle"]);
  const NUMERIC_KEYS = ["angle", "aperture", "focal", "beamWidth", "wavelength", "power", "rayCount", "divergence", "polAngle", "axisAngle", "designWavelength", "opening", "coreDiameter", "na", "transmission", "cutoff"];
  const POLARIZATIONS = new Set(["linear", "right", "left", "unpolarized"]);
  const MODES = new Set(["longpass", "shortpass"]);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

  function fail(message) { throw new Error(message); }

  function plainObject(value, name, allowed) {
    if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      fail(`${name}はJSONオブジェクトで指定してください。`);
    }
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || !allowed.has(key)) fail(`${name}に未対応の項目「${String(key).slice(0, 40)}」があります。`);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !own(descriptor, "value")) fail(`${name}に読み込めない項目があります。`);
    }
  }

  function number(value, name, min, max, integer = false) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
      fail(`${name}は${min}〜${max}の${integer ? "整数" : "数値"}で指定してください。`);
    }
    return value;
  }

  function safeText(value, name, maximum) {
    if (typeof value !== "string" || value.length > maximum || /[<>\u0000-\u001f\u007f-\u009f]/u.test(value)) {
      fail(`${name}は${maximum}文字以内の通常のテキストで指定してください（HTML・制御文字は不可）。`);
    }
    return value;
  }

  function boolean(value, name) {
    if (typeof value !== "boolean") fail(`${name}はtrueまたはfalseで指定してください。`);
    return value;
  }

  function unitScale(unit) {
    if (typeof unit !== "string" || !own(UNITS, unit)) fail("単位はmm・cm・inのいずれかで指定してください。");
    return UNITS[unit];
  }

  function fromDisplay(value, unit) {
    number(value, "長さ", -Number.MAX_VALUE, Number.MAX_VALUE);
    const result = value * unitScale(unit);
    if (!Number.isFinite(result)) fail("長さが大きすぎます。");
    return result;
  }

  function toDisplay(value, unit) {
    number(value, "長さ", -Number.MAX_VALUE, Number.MAX_VALUE);
    return value / unitScale(unit);
  }

  function defaultGridStep(unit) { unitScale(unit); return unit === "in" ? 25.4 : 10; }

  function validateElement(input, index, ids) {
    const name = `部品${index + 1}`;
    plainObject(input, name, ELEMENT_KEYS);
    const id = number(input.id, `${name}のID`, 1, 1000000000, true);
    if (ids.has(id)) fail(`部品ID ${id} が重複しています。`);
    ids.add(id);
    const type = input.type;
    if (typeof type !== "string" || !own(O.TYPES, type)) fail(`${name}の部品種別に対応していません。`);
    const x = number(input.x, `${name}のX`, O.MARGIN, O.WIDTH - O.MARGIN);
    const y = number(input.y, `${name}のY`, O.MARGIN, O.HEIGHT - O.MARGIN);
    const element = O.createElement(type, id, x, y);
    // Positions in the file are physical millimetres, not grid indices.
    element.x = x;
    element.y = y;
    for (const key of NUMERIC_KEYS) {
      if (!own(input, key)) continue;
      const limit = O.PARAM_LIMITS[key];
      const value = number(input[key], `${name}の${key}`, limit.min, limit.max, key === "rayCount");
      if (key === "focal" && Math.abs(value) < 1) fail(`${name}の焦点距離の絶対値は1 mm以上にしてください。`);
      element[key] = ANGLE_KEYS.has(key) ? O.normalizeAngle(value) : value;
    }
    if (own(input, "polarization")) {
      if (!POLARIZATIONS.has(input.polarization)) fail(`${name}の偏光状態に対応していません。`);
      element.polarization = input.polarization;
    }
    if (own(input, "mode")) {
      if (!MODES.has(input.mode)) fail(`${name}のダイクロイックモードに対応していません。`);
      element.mode = input.mode;
    }
    if (own(input, "enabled")) element.enabled = boolean(input.enabled, `${name}の有効状態`);
    if (own(input, "label")) element.label = safeText(input.label, `${name}の名前`, 100);
    if (type === "iris" && element.opening > element.aperture) fail(`${name}のアイリス開口は部品径以下にしてください。`);
    if (type === "fiber" && element.coreDiameter > element.aperture) fail(`${name}のファイバーコア径は部品径以下にしてください。`);
    return element;
  }

  function validateScene(input) {
    plainObject(input, "設計データ", SCENE_KEYS);
    if (input.format !== FORMAT) fail("Optics Bench形式のJSONを選んでください。");
    if (input.schemaVersion !== SCHEMA_VERSION) fail("この保存形式のバージョンには対応していません。");
    const unit = own(input, "unit") ? input.unit : DEFAULTS.unit;
    unitScale(unit);
    const scene = {
      format: FORMAT,
      schemaVersion: SCHEMA_VERSION,
      title: own(input, "title") ? safeText(input.title, "設計名", 160) : DEFAULTS.title,
      unit,
      gridStep: own(input, "gridStep") ? number(input.gridStep, "グリッド間隔（mm）", 1, 254) : defaultGridStep(unit),
      snap: own(input, "snap") ? boolean(input.snap, "グリッド吸着") : DEFAULTS.snap,
      angleSnap: own(input, "angleSnap") ? boolean(input.angleSnap, "角度吸着") : DEFAULTS.angleSnap,
      elements: []
    };
    if (!Array.isArray(input.elements) || input.elements.length > MAX_ELEMENTS) fail(`部品は${MAX_ELEMENTS}個以下の配列で指定してください。`);
    const ids = new Set();
    for (let index = 0; index < input.elements.length; index++) {
      scene.elements.push(validateElement(input.elements[index], index, ids));
    }
    return scene;
  }

  function byteLength(text) {
    if (typeof TextEncoder === "function") return new TextEncoder().encode(text).length;
    // Exact UTF-8 byte count for valid strings, without a browser or Node dependency.
    let bytes = 0;
    for (const character of text) {
      const code = character.codePointAt(0);
      bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
    }
    return bytes;
  }

  function parse(text) {
    if (typeof text !== "string") fail("JSONテキストを読み込んでください。");
    if (text.length > MAX_BYTES || byteLength(text) > MAX_BYTES) fail("ファイルは256 KiB以下にしてください。");
    let input;
    try { input = JSON.parse(text.replace(/^\uFEFF/u, "")); }
    catch (_) { fail("JSONの書式が正しくありません。保存した.jsonファイルを選んでください。"); }
    return validateScene(input);
  }

  function serialize(scene) {
    const text = JSON.stringify(validateScene(scene), null, 2) + "\n";
    if (byteLength(text) > MAX_BYTES) fail("保存データが256 KiBを超えています。");
    return text;
  }

  function defaultScene(elements = [], overrides = {}) {
    return validateScene({ ...DEFAULTS, ...overrides, elements });
  }

  function switchUnit(scene, unit) {
    unitScale(unit);
    return validateScene({ ...scene, unit, gridStep: defaultGridStep(unit) });
  }

  return Object.freeze({ FORMAT, SCHEMA_VERSION, MAX_BYTES, MAX_ELEMENTS, DEFAULTS, defaults: DEFAULTS, UNITS,
    validateScene, parse, serialize, defaultScene, unitScale, defaultGridStep, fromDisplay, toDisplay, switchUnit });
});
