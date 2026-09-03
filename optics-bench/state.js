(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory(require("./optics.js"));
  else root.OpticsState = factory(root.Optics);
})(typeof window === "undefined" ? this : window, function (O) {
  "use strict";

  const FORMAT = "optics-bench", SCHEMA_VERSION = 2, MAX_BYTES = 256 * 1024;
  const COMPONENT_PREFIX = "Optics Bench component v1\n";
  const SELECTION_PREFIX = "Optics Bench selection v1\n";
  const DEFAULTS = Object.freeze({ format: FORMAT, schemaVersion: SCHEMA_VERSION, title: "無題の光学系", unit: "cm", gridStep: 10, snap: true, angleSnap: true });
  const UNITS = Object.freeze({ mm: 1, cm: 10, in: 25.4 });
  const SCENE_KEYS = new Set(["format", "schemaVersion", "title", "unit", "gridStep", "snap", "angleSnap", "elements", "fiberLinks"]);
  const FIBER_LINK_KEYS = new Set(["a", "b"]);
  const ELEMENT_KEYS = new Set(["id", "type", "x", "y", "angle", "aperture", "focal", "beamWidth", "wavelength", "wavelengthWidth", "spectralSamples", "power", "rayCount", "divergence", "polarization", "polAngle", "axisAngle", "designWavelength", "opening", "coreDiameter", "na", "transmission", "cutoff", "mode", "phase", "enabled", "label", "pixelCount", "pixelRows", "sensorHeight", "spotSize", "exposure", "autoExposure", "screenHeight", "screenPattern", "filterMode", "bandLow", "bandHigh", "opticalDensity"]);
  const ANGLE_KEYS = new Set(["angle", "polAngle", "axisAngle"]);
  const NUMERIC_KEYS = ["angle", "aperture", "focal", "beamWidth", "wavelength", "wavelengthWidth", "spectralSamples", "power", "rayCount", "divergence", "polAngle", "axisAngle", "designWavelength", "opening", "coreDiameter", "na", "transmission", "cutoff", "phase", "pixelCount", "pixelRows", "sensorHeight", "spotSize", "exposure", "screenHeight", "bandLow", "bandHigh", "opticalDensity"];
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
    const x = number(input.x, `${name}のX`, -O.COORDINATE_LIMIT, O.COORDINATE_LIMIT);
    const y = number(input.y, `${name}のY`, -O.COORDINATE_LIMIT, O.COORDINATE_LIMIT);
    const element = O.createElement(type, id, x, y);
    // v0.13.0以前の既定レーザーは12 mmで、保存時に既定値を省略していた。
    // 新規配置は5 mmだが、古い省略データの物理条件は変えない。
    if (type === "laser" && !own(input, "beamWidth")) element.beamWidth = O.DEFAULTS.beamWidth;
    // Positions in the file are physical millimetres, not grid indices.
    element.x = x;
    element.y = y;
    for (const key of NUMERIC_KEYS) {
      if (!own(input, key)) continue;
      const limit = O.PARAM_LIMITS[key];
      const value = number(input[key], `${name}の${key}`, limit.min, limit.max, ["rayCount", "spectralSamples", "pixelCount", "pixelRows"].includes(key));
      if (key === "focal" && Math.abs(value) < 1) fail(`${name}の焦点距離の絶対値は1 mm以上にしてください。`);
      // The range is already checked; avoid modulo rounding of valid decimal angles.
      element[key] = ANGLE_KEYS.has(key) && value === 360 ? 0 : value;
    }
    if (own(input, "polarization")) {
      if (!POLARIZATIONS.has(input.polarization)) fail(`${name}の偏光状態に対応していません。`);
      element.polarization = input.polarization;
    }
    if (own(input, "mode")) {
      if (!MODES.has(input.mode)) fail(`${name}のダイクロイックモードに対応していません。`);
      element.mode = input.mode;
    }
    if (own(input, "filterMode")) {
      if (!O.FILTER_MODES.includes(input.filterMode)) fail(`${name}のフィルター種別に対応していません。`);
      element.filterMode = input.filterMode;
    }
    if (own(input, "screenPattern")) {
      if (!O.SCREEN_PATTERNS.includes(input.screenPattern)) fail(`${name}のスクリーン画像に対応していません。`);
      element.screenPattern = input.screenPattern;
    }
    if (own(input, "enabled")) element.enabled = boolean(input.enabled, `${name}の有効状態`);
    if (own(input, "autoExposure")) element.autoExposure = boolean(input.autoExposure, `${name}の自動明るさ`);
    if (own(input, "label")) element.label = safeText(input.label, `${name}の名前`, 100);
    if (type === "iris" && element.opening > element.aperture) fail(`${name}のアイリス開口は部品径以下にしてください。`);
    if (type === "fiber" && element.coreDiameter > element.aperture) fail(`${name}のファイバーコア径は部品径以下にしてください。`);
    if (type === "concave" && !O.concaveGeometry(element)) fail(`${name}の凹面ミラーはfを正にし、有効径を4f（曲率半径Rの2倍）未満にしてください。`);
    if (type === "filter" && element.bandLow >= element.bandHigh) fail(`${name}の透過帯域は下限波長を上限波長より小さくしてください。`);
    if (type === "fluorescent" && element.wavelength < element.cutoff) fail(`${name}の蛍光波長は励起上限波長以上にしてください。`);
    if (["laser", "point", "white"].includes(type) && !O.validSourceBand(element)) fail(`${name}の光源帯域（中心波長±幅/2）は200〜2500 nm内にしてください。幅が数値精度より小さい場合は0を指定してください。`);
    return element;
  }

  function validateScene(input) {
    plainObject(input, "設計データ", SCENE_KEYS);
    if (input.format !== FORMAT) fail("Optics Bench形式のJSONを選んでください。");
    if (input.schemaVersion !== 1 && input.schemaVersion !== SCHEMA_VERSION) fail("この保存形式のバージョンには対応していません。");
    if (input.schemaVersion === 1 && own(input, "fiberLinks")) fail("保存形式1ではファイバー接続を指定できません。");
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
      elements: [],
      fiberLinks: []
    };
    if (!Array.isArray(input.elements)) fail("部品は配列で指定してください。");
    const ids = new Set();
    for (let index = 0; index < input.elements.length; index++) {
      scene.elements.push(validateElement(input.elements[index], index, ids));
    }
    scene.fiberLinks = validateFiberLinks(own(input, "fiberLinks") ? input.fiberLinks : [], scene.elements);
    return scene;
  }

  function validateFiberLinks(input, elements) {
    if (!Array.isArray(input)) fail("ファイバー接続は配列で指定してください。");
    const fibers = new Set(elements.filter(element => element.type === "fiber").map(element => element.id));
    const occupied = new Set(), links = [];
    for (let index = 0; index < input.length; index++) {
      const name = `ファイバー接続${index + 1}`, link = input[index];
      plainObject(link, name, FIBER_LINK_KEYS);
      if (!own(link, "a") || !own(link, "b")) fail(`${name}には両端のID（a・b）を指定してください。`);
      const a = number(link.a, `${name}のa`, 1, 1000000000, true);
      const b = number(link.b, `${name}のb`, 1, 1000000000, true);
      if (a === b) fail(`${name}は異なる2つの端面を指定してください。`);
      if (!fibers.has(a) || !fibers.has(b)) fail(`${name}は実在するファイバー端面同士を指定してください。`);
      if (occupied.has(a) || occupied.has(b)) fail("1つのファイバー端面には1本だけ接続できます。");
      occupied.add(a); occupied.add(b);
      links.push({ a, b });
    }
    return links;
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

  function documentRecord(scene) {
    // Do not introduce an unused phase key into older ordinary component files.
    // New half-wave/phase types still need a reader that supports those types.
    return { ...scene, elements: scene.elements.map(element => {
      const record = { ...element };
      // Preserve the old monochromatic record when the new settings are unused.
      if (record.type !== "white" && record.wavelengthWidth === 0) delete record.wavelengthWidth;
      if (record.type !== "white" && record.spectralSamples === O.DEFAULTS.spectralSamples) delete record.spectralSamples;
      if (record.type !== "phase" && record.phase === 0) delete record.phase;
      if (record.type === "camera") for (const key of ["pixelRows", "sensorHeight", "spotSize"]) {
        if (record[key] === O.DEFAULTS[key]) delete record[key];
      }
      if (record.type === "screen") for (const key of ["screenHeight", "screenPattern"]) {
        if (record[key] === O.createElement(record.type, 1, 0, 0)[key]) delete record[key];
      }
      if (record.type !== "camera") for (const key of ["pixelCount", "pixelRows", "sensorHeight", "spotSize", "exposure", "autoExposure"]) {
        if (record[key] === O.DEFAULTS[key]) delete record[key];
      }
      if (record.type !== "screen") for (const key of ["screenHeight", "screenPattern"]) {
        if (record[key] === O.DEFAULTS[key]) delete record[key];
      }
      if (record.type !== "filter") for (const key of ["filterMode", "bandLow", "bandHigh", "opticalDensity"]) {
        if (record[key] === O.DEFAULTS[key]) delete record[key];
      }
      return record;
    }) };
  }

  function serialize(scene) {
    const text = JSON.stringify(documentRecord(validateScene(scene)), null, 2) + "\n";
    if (byteLength(text) > MAX_BYTES) fail("保存データが256 KiBを超えています。");
    return text;
  }

  function serializeComponent(element) {
    const scene = defaultScene([element], { unit: "mm" });
    // Keep disconnected copies in a schema-1 wrapper; readers must also support the component type.
    delete scene.fiberLinks;
    scene.schemaVersion = 1;
    const text = COMPONENT_PREFIX + JSON.stringify(documentRecord(scene), null, 2) + "\n";
    if (byteLength(text) > MAX_BYTES) fail("部品のコピーデータは256 KiB以下にしてください。");
    return text;
  }

  function parseComponent(text) {
    if (typeof text !== "string") fail("部品のコピーデータをテキストで指定してください。");
    if (text.length > MAX_BYTES || byteLength(text) > MAX_BYTES) fail("部品のコピーデータは256 KiB以下にしてください。");
    // Native Windows clipboards can use CRLF. Normalize only the header separator.
    const lineEnd = text.indexOf("\n");
    const normalized = lineEnd > 0 && text[lineEnd - 1] === "\r" ? text.slice(0, lineEnd - 1) + text.slice(lineEnd) : text;
    if (!normalized.startsWith(COMPONENT_PREFIX)) fail("Optics Benchの部品コピー形式ではありません。");
    const scene = parse(normalized.slice(COMPONENT_PREFIX.length));
    if (scene.elements.length !== 1) fail("部品のコピーデータには1個の部品を指定してください。");
    return scene.elements[0];
  }

  function defaultScene(elements = [], overrides = {}) {
    return validateScene({ ...DEFAULTS, ...overrides, elements });
  }

  function serializeSelection(elements, fiberLinks = []) {
    if (elements.length === 1) return serializeComponent(elements[0]);
    if (!elements.length) fail("コピーする部品を選択してください。");
    const ids=new Set(elements.map(e=>e.id));
    const scene=defaultScene(elements,{unit:"mm",fiberLinks:fiberLinks.filter(l=>ids.has(l.a)&&ids.has(l.b))});
    const text=SELECTION_PREFIX+serialize(scene);
    if(byteLength(text)>MAX_BYTES)fail("部品のコピーデータは256 KiB以下にしてください。");
    return text;
  }
  function parseSelection(text) {
    if(typeof text!=="string" || text.length>MAX_BYTES || byteLength(text)>MAX_BYTES)fail("部品のコピーデータは256 KiB以下のテキストで指定してください。");
    const normalized=text.replace(/\r?\n/,"\n");
    if(normalized.startsWith(COMPONENT_PREFIX))return {elements:[parseComponent(text)],fiberLinks:[]};
    if(!normalized.startsWith(SELECTION_PREFIX))fail("Optics Benchの部品コピー形式ではありません。");
    const scene=parse(normalized.slice(SELECTION_PREFIX.length));
    if(!scene.elements.length)fail("コピーする部品がありません。");
    return {elements:scene.elements,fiberLinks:scene.fiberLinks};
  }

  function switchUnit(scene, unit) {
    unitScale(unit);
    return validateScene({ ...scene, unit, gridStep: defaultGridStep(unit) });
  }

  return Object.freeze({ FORMAT, SCHEMA_VERSION, COMPONENT_PREFIX, SELECTION_PREFIX, MAX_BYTES, DEFAULTS, defaults: DEFAULTS, UNITS,
    validateScene, parse, serialize, serializeComponent, parseComponent, serializeSelection, parseSelection, defaultScene, unitScale, defaultGridStep, fromDisplay, toDisplay, switchUnit });
});
