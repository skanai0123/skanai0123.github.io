(function (root) {
  "use strict";

  // Millimetres; geometric angles are clockwise on the board. Polarization
  // angles belong to a separate local transverse reference frame.
  const WIDTH = 1000, HEIGHT = 600, GRID = 25, MARGIN = 50;
  // No physical table boundary. Keep a numerical guard (1000 km either side)
  // so coordinates remain precise enough for the existing millimetre model.
  const COORDINATE_LIMIT = 1e9;
  const EPS = 1e-7, MAX_INTERACTIONS = 40;
  const MAX_SEGMENTS = 12000, MAX_RAYS = 4096, MIN_POWER = 1e-9;
  const TYPES = Object.freeze({
    laser: { label: "レーザー", short: "LAS", color: "#ff8279" },
    point: { label: "点光源", short: "PT", color: "#ffba73" },
    white: { label: "白色光源", short: "WHITE", color: "#fff1b8" },
    mirror: { label: "ミラー", short: "M", color: "#a8becf" },
    concave: { label: "凹面ミラー", short: "CM", color: "#bdd0ec" },
    lens: { label: "レンズ", short: "L", color: "#70d5ee" },
    iris: { label: "アイリス", short: "IR", color: "#d4c5ac" },
    filter: { label: "フィルター", short: "FLT", color: "#91dec6" },
    polarizer: { label: "偏光子", short: "POL", color: "#afa1ff" },
    waveplate: { label: "λ/4板", short: "λ/4", color: "#e5a0ef" },
    halfwave: { label: "λ/2板", short: "λ/2", color: "#d39de9" },
    phase: { label: "位相シフター", short: "φ", color: "#f0d083" },
    dichroic: { label: "ダイクロイック", short: "DM", color: "#f3be68" },
    objective: { label: "対物レンズ", short: "OBJ", color: "#70d5ee" },
    fiber: { label: "ファイバー", short: "FIB", color: "#87d9a8" },
    blocker: { label: "ビームブロッカー", short: "STOP", color: "#b6b9c4" },
    splitter: { label: "無偏光BS（NPBS）", short: "NPBS", color: "#b4d5fb" },
    pbs: { label: "偏光BS（PBS）", short: "PBS", color: "#f7b6c7" },
    screen: { label: "スクリーン / 検出器", short: "DET", color: "#95e1bf" },
    camera: { label: "カメラ", short: "CAM", color: "#f1c992" },
    fluorescent: { label: "蛍光板", short: "FL", color: "#dfff79" },
    comment: { label: "コメント", short: "NOTE", color: "#f4d58b" },
    region: { label: "区切り", short: "AREA", color: "#8acfc1" }
  });
  const PARAM_LIMITS = Object.freeze({
    angle: { min: 0, max: 360 }, polAngle: { min: 0, max: 360 }, axisAngle: { min: 0, max: 360 },
    aperture: { min: 2, max: 300 }, focal: { min: -1000, max: 1000 },
    beamWidth: { min: 0, max: 200 }, wavelength: { min: 200, max: 2500 },
    wavelengthWidth: { min: 0, max: 2300 }, spectralSamples: { min: 3, max: 61 },
    power: { min: 0, max: 100 }, rayCount: { min: 1, max: 61 },
    divergence: { min: 1, max: 360 }, designWavelength: { min: 200, max: 2500 },
    opening: { min: 0, max: 300 }, coreDiameter: { min: 0.01, max: 200 },
    na: { min: 0.01, max: 1 }, transmission: { min: 0, max: 1 }, cutoff: { min: 200, max: 2500 },
    phase: { min: 0, max: 360 }, pixelCount: { min: 16, max: 1024 }, pixelRows: { min: 16, max: 512 },
    sensorHeight: { min: 2, max: 300 }, spotSize: { min: 0.01, max: 300 }, exposure: { min: 0.01, max: 100 },
    screenHeight: { min: 2, max: 300 },
    bandLow: { min: 200, max: 2500 }, bandHigh: { min: 200, max: 2500 }, opticalDensity: { min: 0, max: 6 }
  });
  const FILTER_MODES = Object.freeze(["longpass", "shortpass", "bandpass", "nd"]);
  const DEFAULTS = Object.freeze({
    angle: 0, focal: 100, aperture: 50, beamWidth: 12, wavelength: 532, wavelengthWidth: 0, spectralSamples: 17,
    power: 1, rayCount: 9, divergence: 20, polarization: "linear", polAngle: 0,
    axisAngle: 0, designWavelength: 532, opening: 20, coreDiameter: 1, na: 0.22,
    transmission: 0.5, cutoff: 600, mode: "longpass", phase: 0, enabled: true, label: "",
    pixelCount: 256, pixelRows: 192, sensorHeight: 18, spotSize: 1, exposure: 1, autoExposure: true,
    screenHeight: 100, screenPattern: "none",
    filterMode: "bandpass", bandLow: 500, bandHigh: 560, opticalDensity: 1
  });
  const TYPE_DEFAULTS = {
    laser: { beamWidth: 5 },
    point: { polarization: "unpolarized", rayCount: 21, divergence: 30, beamWidth: 0 },
    white: { wavelength: 550, wavelengthWidth: 300, spectralSamples: 31, polarization: "unpolarized", rayCount: 21, divergence: 30, beamWidth: 0 },
    mirror: { angle: 45, aperture: 25 }, concave: { focal: 100, aperture: 100 }, lens: { focal: 76.2, aperture: 25.4 },
    polarizer: { aperture: 25.4 }, waveplate: { axisAngle: 45, aperture: 25.4 }, halfwave: { axisAngle: 22.5, aperture: 25.4 },
    phase: { aperture: 25.4 }, dichroic: { angle: 45, aperture: 36 },
    objective: { focal: 50, aperture: 10, na: 0.35 }, fiber: { aperture: 10 },
    splitter: { angle: 45, aperture: 36 }, pbs: { angle: 45, aperture: 36 },
    blocker: { aperture: 100 }, screen: { aperture: 100, screenHeight: 100, screenPattern: "none", transmission: 1 }, camera: { aperture: 24, sensorHeight: 18, pixelRows: 192, spotSize: 1 },
    fluorescent: { aperture: 100, wavelength: 600, cutoff: 550, transmission: 0.6, rayCount: 21, divergence: 360 },
    filter: { aperture: 25.4, transmission: 1 },
    comment: { commentText: "コメントを入力", commentDisplay: "always" },
    region: { regionWidth: 400, regionHeight: 240, regionStyle: "area", regionColor: "sage" }
  };
  const isAnnotation = element => ["comment", "region"].includes(element.type);
  const REGION_COLORS = Object.freeze({ sage: "#8acfc1", blue: "#8cbfe8", amber: "#e9c17a", violet: "#bfaaeb", rose: "#e8a8b5", gray: "#b9c7cc" });
  const REGION_STYLES = Object.freeze({ area: "エリア枠", horizontal: "横の区切り線", vertical: "縦の区切り線" });
  const REGION_SIZE_LIMITS = Object.freeze({ min: 20, max: 10000000 });
  const isSource = element => ["laser", "point", "white"].includes(element.type);
  const isSpectralSource = element => ["laser", "point", "white"].includes(element.type);
  const isPatternScreen = element => element.type === "screen" && element.screenPattern !== "none";
  const SCREEN_PATTERNS = Object.freeze(["none", "duck", "doll", "checker", "bars"]);
  const PATTERN_MAPS = Object.freeze({
    duck: Object.freeze([
      "................", "..........yyyy..", ".........yyyyyy.", ".........yyy.yoo",
      "..yyy...yyyyyyy.", ".yyyyy.yyyyyyyy.", ".yyyyyyyyyyyyy..", "..yyyyyyyyyyy...",
      "...yyyyyyyyy....", "....yyyyyyy.....", ".....yy..yy.....", "................"
    ]),
    doll: Object.freeze([
      "......oooo......", ".....oooooo.....", ".....o.oo.o.....", "......oooo......",
      ".......oo.......", "....bbbbbbbb....", "..o.bbbbbbbb.o..", ".....bbbbbb.....",
      "......bbbb......", ".....rr..rr.....", "....rr....rr....", "...rr......rr..."
    ]),
    checker: Object.freeze(["ccwwccwwccww", "ccwwccwwccww", "wwccwwccwwcc", "wwccwwccwwcc", "ccwwccwwccww", "ccwwccwwccww", "wwccwwccwwcc", "wwccwwccwwcc"]),
    bars: Object.freeze(["bbbgggrrr", "bbbgggrrr", "bbbgggrrr", "bbbgggrrr", "bbbgggrrr", "bbbgggrrr"])
  });
  const PATTERN_WAVELENGTHS = Object.freeze({ y: 590, o: 620, c: 488, w: 550, b: 450, g: 532, r: 650 });
  const dot = (a, b) => a.x * b.x + a.y * b.y;
  const cross = (a, b) => a.x * b.y - a.y * b.x;
  const add = (a, b, scale = 1) => ({ x: a.x + b.x * scale, y: a.y + b.y * scale });
  const unit = v => {
    const length = Math.hypot(v.x, v.y);
    return length > 0 && Number.isFinite(length) ? { x: v.x / length, y: v.y / length } : { x: 1, y: 0 };
  };
  const direction = angle => ({ x: Math.cos(angle * Math.PI / 180), y: Math.sin(angle * Math.PI / 180) });
  const normalizeAngle = value => Number.isFinite(value) ? ((value % 360) + 360) % 360 : 0;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const snapAngle = (value, step = 22.5) => normalizeAngle(Math.round(value / step) * step);

  function position(x, y, snap = true, grid = GRID) {
    const step = Number.isFinite(grid) && grid > 0 ? grid : GRID;
    const quantize = value => snap ? Math.round(value / step) * step : Math.round(value * 10) / 10;
    return {
      x: clamp(quantize(Number.isFinite(x) ? x : WIDTH / 2), -COORDINATE_LIMIT, COORDINATE_LIMIT),
      y: clamp(quantize(Number.isFinite(y) ? y : HEIGHT / 2), -COORDINATE_LIMIT, COORDINATE_LIMIT)
    };
  }

  function createElement(type, id, x, y) {
    if (!Object.prototype.hasOwnProperty.call(TYPES, type)) throw new Error("Unknown optical element");
    return { id, type, ...position(x, y), ...DEFAULTS, ...(TYPE_DEFAULTS[type] || {}) };
  }

  function initialElements() {
    const laser = { ...createElement("laser", 1, 150, 400), beamWidth: 5, rayCount: 5 };
    const mirror = createElement("mirror", 2, 550, 400);
    const lens = { ...createElement("lens", 3, 550, 200), angle: 90 };
    return [laser, mirror, lens];
  }

  function sourceBand(source) {
    const half = (source.wavelengthWidth ?? 0) / 2;
    return { min: source.wavelength - half, max: source.wavelength + half };
  }

  function validSourceBand(source) {
    const width = source.wavelengthWidth ?? 0, band = sourceBand(source);
    return Number.isFinite(source.wavelength) && Number.isFinite(width) && width >= 0 &&
      band.min >= PARAM_LIMITS.wavelength.min && band.max <= PARAM_LIMITS.wavelength.max &&
      (width === 0 || band.min < band.max);
  }

  // Uniform spectral power density per nm, sampled at equal-bin midpoints.
  // Width is the full finite band, not Gaussian FWHM or a coherence model.
  function sourceSpectrum(source) {
    const width = source.wavelengthWidth ?? 0, count = width > 0 ? source.spectralSamples ?? DEFAULTS.spectralSamples : 1;
    if (!validSourceBand(source) || !Number.isInteger(count) || count < 1 ||
        count > PARAM_LIMITS.spectralSamples.max || (width > 0 && count < PARAM_LIMITS.spectralSamples.min)) {
      throw new Error("光源の波長帯域または波長サンプル数が不正です。");
    }
    return Array.from({ length: count }, (_, i) => ({
      wavelength: source.wavelength + ((i + .5) / count - .5) * width, weight: 1 / count
    }));
  }

  function screenPatternSamples(screen) {
    const rows = PATTERN_MAPS[screen?.screenPattern];
    if (!rows?.length) return [];
    const columns = rows[0].length, samples = [];
    for (let row = 0; row < rows.length; row++) for (let column = 0; column < columns; column++) {
      const code = rows[row][column], wavelength = PATTERN_WAVELENGTHS[code];
      if (!wavelength) continue;
      samples.push({
        u: (column + .5 - columns / 2) / columns * screen.aperture * .82,
        v: (rows.length / 2 - row - .5) / rows.length * screen.screenHeight * .82,
        wavelength, code
      });
    }
    const weight = samples.length ? 1 / samples.length : 0;
    return samples.map(sample => ({ ...sample, weight }));
  }

  // Ideal diffuse colour target. It preserves the incident wavelength and
  // applies a broad three-band reflectance to each coloured picture cell.
  // This is deliberately simpler than measured ink/paper spectra, but unlike
  // the former self-emitting target it produces no image light without input.
  function patternReflectance(code, wavelength) {
    if (!Number.isFinite(wavelength)) return 0;
    const bands = {
      y: [0.04, 0.9, 0.68], o: [0.02, 0.42, 0.96], c: [0.78, 0.88, 0.05],
      w: [0.9, 0.9, 0.9], b: [0.96, 0.12, 0.02], g: [0.08, 0.96, 0.08], r: [0.02, 0.08, 0.96]
    }[code];
    if (!bands) return 0;
    const anchors = [450, 550, 650];
    if (wavelength <= anchors[0]) return bands[0];
    if (wavelength >= anchors[2]) return bands[2];
    const index = wavelength <= anchors[1] ? 0 : 1;
    const fraction = (wavelength - anchors[index]) / (anchors[index + 1] - anchors[index]);
    return bands[index] + (bands[index + 1] - bands[index]) * fraction;
  }

  function patternDirections(count, divergence) {
    const side = Math.ceil(Math.sqrt(count)), coordinates = [];
    for (let row = 0; row < side; row++) for (let column = 0; column < side; column++) {
      const x = side === 1 ? 0 : column / (side - 1) - .5;
      const y = side === 1 ? 0 : .5 - row / (side - 1);
      coordinates.push({ x, y, radius: x * x + y * y, order: row * side + column });
    }
    coordinates.sort((a, b) => a.radius - b.radius || a.order - b.order);
    return coordinates.slice(0, count).map(({ x, y }) => ({ angle: x * divergence, verticalSlope: Math.tan(y * divergence * Math.PI / 180) }));
  }

  // Ideal, polarization-independent intensity transmission. Spectral edges
  // include their endpoints; rejected power is absorbed, never reflected.
  // ND uses OD alone, so switching modes retains the separate passband T.
  function filterTransmission(element, wavelength) {
    if (!Number.isFinite(wavelength)) return 0;
    if (element.filterMode === "nd") return 10 ** -element.opticalDensity;
    const pass = element.filterMode === "longpass" ? wavelength >= element.cutoff :
      element.filterMode === "shortpass" ? wavelength <= element.cutoff :
      element.filterMode === "bandpass" && wavelength >= element.bandLow && wavelength <= element.bandHigh;
    return pass ? element.transmission : 0;
  }

  function segment(element) {
    const n = direction(element.angle), tangent = { x: -n.y, y: n.x };
    return { a: add(element, tangent, -element.aperture / 2), b: add(element, tangent, element.aperture / 2), n, tangent };
  }

  // Spherical cap, not a powered plane. The vertex is the element position;
  // angle 0 opens to the left. f is the positive paraxial value, R = 2f.
  function concaveGeometry(element) {
    const radius = 2 * element.focal, half = element.aperture / 2;
    if (!(radius > 0 && half > 0 && half < radius)) return null;
    const n = direction(element.angle), tangent = { x: -n.y, y: n.x };
    const sag = half * half / (radius + Math.sqrt(radius * radius - half * half));
    const rim = add(element, n, -sag);
    return { vertex: { x: element.x, y: element.y }, radius, half, sag, n, tangent,
      a: add(rim, tangent, -half), b: add(rim, tangent, half) };
  }

  function geometryTolerance(...points) {
    return Math.max(EPS, ...points.map(p => Math.max(Math.abs(p.x), Math.abs(p.y)) * Number.EPSILON * 8));
  }

  function intersectConcave(origin, ray, arc, minDistance = EPS) {
    if (!arc) return null;
    const offset = { x: origin.x - arc.vertex.x, y: origin.y - arc.vertex.y };
    const dx = dot(ray, arc.n), dy = dot(ray, arc.tangent), norm = Math.hypot(dx, dy);
    if (!(norm > 0)) return null;
    const ux = dx / norm, uy = dy / norm;
    const x = dot(offset, arc.n) + arc.radius, y = dot(offset, arc.tangent);
    const along = x * ux + y * uy, perpendicular = x * uy - y * ux;
    const tolerance = geometryTolerance(origin, arc.vertex);
    // Closest approach avoids subtracting two large squared distances when
    // the source is far away. Construct the hit locally, then translate once.
    const discriminant = arc.radius * arc.radius - perpendicular * perpendicular;
    if (discriminant < -2 * arc.radius * tolerance) return null;
    const root = Math.sqrt(Math.max(0, discriminant));
    for (const sign of [-1, 1]) {
      const distance = -along + sign * root;
      if (distance <= (minDistance < 0 ? -tolerance : Math.max(minDistance, tolerance))) continue;
      const cx = perpendicular * uy + sign * root * ux;
      const cy = -perpendicular * ux + sign * root * uy;
      if (cx < arc.radius - arc.sag - tolerance || Math.abs(cy) > arc.half + tolerance) continue;
      const normal = unit(add({ x: arc.n.x * cx, y: arc.n.y * cx }, arc.tangent, cy));
      const axial = -cy * cy / (arc.radius + Math.max(0, cx));
      return { distance, point: add(add(arc.vertex, arc.n, axial), arc.tangent, cy), normal };
    }
    return null;
  }

  function opticalSurface(element, index) {
    const arc = element.type === "concave" ? concaveGeometry(element) : null;
    return { ...(arc || segment(element)), arc, element, index };
  }

  function intersect(origin, ray, a, b) {
    const edge = { x: b.x - a.x, y: b.y - a.y };
    const offset = { x: a.x - origin.x, y: a.y - origin.y };
    const denominator = cross(ray, edge);
    if (Math.abs(denominator) < EPS) return null;
    const distance = cross(offset, edge) / denominator;
    const along = cross(offset, ray) / denominator;
    if (distance <= EPS || along < -EPS || along > 1 + EPS) return null;
    return { distance, point: add(origin, ray, distance) };
  }

  function boundaryDistance(origin, ray, bounds = { x: 0, y: 0, width: WIDTH, height: HEIGHT }) {
    const values = [];
    if (ray.x > EPS) values.push((bounds.x + bounds.width - origin.x) / ray.x);
    if (ray.x < -EPS) values.push((bounds.x - origin.x) / ray.x);
    if (ray.y > EPS) values.push((bounds.y + bounds.height - origin.y) / ray.y);
    if (ray.y < -EPS) values.push((bounds.y - origin.y) / ray.y);
    return values.length ? Math.max(0, Math.min(...values)) : 0;
  }

  // Shared geometry for annotation fitting and SVG rendering. Text is plain
  // Unicode; count wide characters conservatively without a browser dependency.
  function commentLayout(element) {
    const lines = [];
    for (const paragraph of (element.commentText || "（本文なし）").replace(/\t/g, "    ").split("\n")) {
      let line = "", width = 0;
      for (const character of paragraph) {
        const advance = /^[\x20-\x7e]$/.test(character) && !/[MW@%&]/.test(character) ? 0.7 : 1;
        if (width + advance > 16) { lines.push(line); line = ""; width = 0; }
        line += character; width += advance;
      }
      lines.push(line);
    }
    return { x: 18, y: 18, width: 280, height: 44 + lines.length * 22, lines };
  }

  function regionGeometry(element) {
    const width = element.regionStyle === "vertical" ? 0 : element.regionWidth;
    const height = element.regionStyle === "horizontal" ? 0 : element.regionHeight;
    return { width, height, titleWidth: element.regionStyle === "vertical" ? 220 : Math.min(width, 250) };
  }

  function elementBounds(elements) {
    if (!elements.length) return { x: 0, y: 0, width: WIDTH, height: HEIGHT };
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const e of elements) {
      if (e.type === "region") {
        const box = regionGeometry(e);
        left = Math.min(left, e.x - 20); right = Math.max(right, e.x + Math.max(box.width, box.titleWidth) + 20);
        top = Math.min(top, e.y - 44); bottom = Math.max(bottom, e.y + box.height + 20);
        continue;
      }
      if (e.type === "comment") {
        const box = commentLayout(e);
        left = Math.min(left, e.x - 16); right = Math.max(right, e.x + box.x + box.width + 4);
        top = Math.min(top, e.y - 16); bottom = Math.max(bottom, e.y + box.y + box.height + 4);
        continue;
      }
      // Conservative rotation-independent envelope of the body and source fan.
      const sag = e.type === "concave" ? concaveGeometry(e)?.sag || 0 : 0;
      const radius = Math.max(40, Math.hypot(e.aperture / 2, sag) + 20, isSource(e) ? e.beamWidth / 2 + 8 : 0);
      left = Math.min(left, e.x - radius); right = Math.max(right, e.x + radius);
      top = Math.min(top, e.y - radius); bottom = Math.max(bottom, e.y + radius);
    }
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  function traceBounds(elements, viewBounds) {
    const scene = elementBounds(elements);
    let left = scene.x - 200, top = scene.y - 200, right = scene.x + scene.width + 200, bottom = scene.y + scene.height + 200;
    if (viewBounds && [viewBounds.x, viewBounds.y, viewBounds.width, viewBounds.height].every(Number.isFinite) && viewBounds.width > 0 && viewBounds.height > 0 &&
        Math.abs(viewBounds.x) <= COORDINATE_LIMIT * 256 && Math.abs(viewBounds.y) <= COORDINATE_LIMIT * 256 && viewBounds.width <= COORDINATE_LIMIT * 256 && viewBounds.height <= COORDINATE_LIMIT * 256) {
      left = Math.min(left, viewBounds.x); top = Math.min(top, viewBounds.y);
      right = Math.max(right, viewBounds.x + viewBounds.width); bottom = Math.max(bottom, viewBounds.y + viewBounds.height);
    }
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  function reflect(ray, normal) { return unit(add(ray, normal, -2 * dot(ray, normal))); }

  // Paraxial thin lens, u' = u - h/f; reverse incidence flips the local axis.
  // Negative f describes a diverging lens. No diffraction or aberrations.
  function refract(ray, point, element) {
    const axis = direction(element.angle);
    const sign = dot(ray, axis) >= 0 ? 1 : -1;
    const forward = { x: sign * axis.x, y: sign * axis.y };
    const tangent = { x: -forward.y, y: forward.x };
    const axial = dot(ray, forward);
    if (axial < EPS || !Number.isFinite(element.focal) || Math.abs(element.focal) < 1) return { ray: null, warning: true };
    const height = dot({ x: point.x - element.x, y: point.y - element.y }, tangent);
    const slope = dot(ray, tangent) / axial;
    const outgoing = slope - height / element.focal;
    const limit = Math.tan(15 * Math.PI / 180);
    return { ray: unit(add(forward, tangent, outgoing)), warning: Math.abs(slope) > limit || Math.abs(outgoing) > limit };
  }

  // I is ray power, not irradiance: focusing does not increase a ray's power.
  // Q = Ix-Iy, U = I(+45)-I(-45), V = IR-IL. Local x is out of the board.
  // COMSOL: https://doc.comsol.com/6.4/doc/com.comsol.help.roptics/roptics_ug_optics.6.65.html
  function sourceStokes(source, power = source.power === undefined ? 1 : source.power) {
    const I = Number.isFinite(power) ? Math.max(0, power) : 0;
    if (source.polarization === "unpolarized") return { I, Q: 0, U: 0, V: 0 };
    if (source.polarization === "right" || source.polarization === "left") {
      return { I, Q: 0, U: 0, V: source.polarization === "right" ? I : -I };
    }
    const angle = 2 * (Number.isFinite(source.polAngle) ? source.polAngle : 0) * Math.PI / 180;
    return { I, Q: I * Math.cos(angle), U: I * Math.sin(angle), V: 0 };
  }

  function scaleStokes(stokes, factor) {
    return { I: stokes.I * factor, Q: stokes.Q * factor, U: stokes.U * factor, V: stokes.V * factor };
  }

  // Ideal linear-polarizer Mueller matrix, including unpolarized I/2.
  function polarize(stokes, axisAngle) {
    const angle = 2 * axisAngle * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
    let I = clamp((stokes.I + stokes.Q * c + stokes.U * s) / 2, 0, stokes.I);
    if (I < stokes.I * 1e-14) I = 0;
    return { I, Q: I * c, U: I * s, V: 0 };
  }

  // Negative Rodrigues rotation: at fast-axis 0°, +U becomes -V for a QWP.
  // https://doc.comsol.com/5.6/doc/com.comsol.help.models.roptics.linear_wave_retarder/models.roptics.linear_wave_retarder.pdf
  function retard(stokes, axisAngle, phase) {
    const angle = 2 * axisAngle * Math.PI / 180;
    const c = Math.cos(angle), s = Math.sin(angle), co = Math.cos(phase), si = Math.sin(phase);
    const projection = c * stokes.Q + s * stokes.U;
    return {
      I: stokes.I,
      Q: stokes.Q * co + c * projection * (1 - co) - s * stokes.V * si,
      U: stokes.U * co + s * projection * (1 - co) + c * stokes.V * si,
      V: stokes.V * co - (c * stokes.U - s * stokes.Q) * si
    };
  }

  function wavelengthColor(wavelength) {
    if (!Number.isFinite(wavelength)) return "#aab8cb";
    // Outside the visible interval these are labelled display proxies, not visible UV/IR.
    if (wavelength < 380) return "#bd9cff";
    if (wavelength > 780) return "#f49bb2";
    let r = 0, g = 0, b = 0;
    if (wavelength < 440) { r = (440 - wavelength) / 60; b = 1; }
    else if (wavelength < 490) { g = (wavelength - 440) / 50; b = 1; }
    else if (wavelength < 510) { g = 1; b = (510 - wavelength) / 20; }
    else if (wavelength < 580) { r = (wavelength - 510) / 70; g = 1; }
    else if (wavelength < 645) { r = 1; g = (645 - wavelength) / 65; }
    else r = 1;
    const visibility = wavelength < 420 ? 0.45 + 0.55 * (wavelength - 380) / 40 :
      wavelength > 700 ? 0.45 + 0.55 * (780 - wavelength) / 80 : 1;
    const channel = value => Math.round(255 * Math.pow(clamp(value * visibility, 0, 1), 0.8));
    return `rgb(${channel(r)}, ${channel(g)}, ${channel(b)})`;
  }

  function surfaceVerticalHalf(element) {
    if (element.type === "camera") return element.sensorHeight / 2;
    if (element.type === "screen") return element.screenHeight / 2;
    return element.aperture / 2;
  }

  function nearestHit(origin, ray, surfaces, lastIndex, boundary, verticalStart, verticalSlope = 0) {
    let nearest = null;
    for (const surface of surfaces) {
      // A deep spherical cap can be struck twice; only discard its zero root.
      if (surface.index === lastIndex && !surface.arc) continue;
      const hit = surface.arc ? intersectConcave(origin, ray, surface.arc) : intersect(origin, ray, surface.a, surface.b);
      if (hit && Number.isFinite(verticalStart) && Math.abs(verticalStart + verticalSlope * hit.distance) > surfaceVerticalHalf(surface.element) + EPS) continue;
      if (hit && hit.distance < boundary - EPS && (!nearest || hit.distance < nearest.distance)) {
        nearest = { ...hit, surface, element: surface.element };
      }
    }
    return nearest;
  }

  function prepareElements(elements, warnings) {
    if (!Array.isArray(elements)) { warnings.add("素子の配列が不正です。"); return []; }
    const valid = [], ids = new Set();
    for (const raw of elements) {
      if (!raw || !Object.prototype.hasOwnProperty.call(TYPES, raw.type) ||
          !["number", "string"].includes(typeof raw.id) ||
          (typeof raw.id === "number" && !Number.isFinite(raw.id)) || ids.has(raw.id) ||
          !Number.isFinite(raw.x) || !Number.isFinite(raw.y) || Math.abs(raw.x) > COORDINATE_LIMIT || Math.abs(raw.y) > COORDINATE_LIMIT) {
        warnings.add("種類・ID・位置が不正な素子を計算から除外しました。"); continue;
      }
      const element = createElement(raw.type, raw.id, raw.x, raw.y);
      element.x = raw.x; element.y = raw.y;
      for (const key of Object.keys(DEFAULTS)) if (Object.prototype.hasOwnProperty.call(raw, key)) element[key] = raw[key];
      let invalid = false;
      for (const [key, limits] of Object.entries(PARAM_LIMITS)) {
        if (!Number.isFinite(element[key])) { invalid = true; break; }
        if (["angle", "polAngle", "axisAngle"].includes(key)) element[key] = normalizeAngle(element[key]);
        else if (element[key] < limits.min || element[key] > limits.max) { invalid = true; break; }
      }
      invalid ||= !Number.isInteger(element.rayCount) || !Number.isInteger(element.spectralSamples) || !Number.isInteger(element.pixelCount) || !Number.isInteger(element.pixelRows) || typeof element.autoExposure !== "boolean" || Math.abs(element.focal) < 1 ||
        (isSpectralSource(element) && !validSourceBand(element)) ||
        !["linear", "right", "left", "unpolarized"].includes(element.polarization) ||
        !["longpass", "shortpass"].includes(element.mode) || typeof element.enabled !== "boolean" ||
        !FILTER_MODES.includes(element.filterMode) || !SCREEN_PATTERNS.includes(element.screenPattern) ||
        (element.type === "filter" && element.bandLow >= element.bandHigh) ||
        (element.type === "fluorescent" && element.wavelength < element.cutoff) ||
        (element.type === "iris" && element.opening > element.aperture) ||
        (element.type === "fiber" && element.coreDiameter > element.aperture) ||
        (element.type === "concave" && !concaveGeometry(element));
      if (invalid) { warnings.add("範囲外または不正なパラメーターの素子を計算から除外しました。"); continue; }
      ids.add(element.id);
      valid.push(element);
    }
    return valid;
  }

  function prepareFiberLinks(links, elements, surfaces, warnings) {
    const pairs = new Map();
    if (links === undefined) return pairs;
    if (!Array.isArray(links)) { warnings.add("ファイバー接続の配列が不正です。接続を無視しました。"); return pairs; }
    const byId = new Map(elements.map(element => [element.id, element]));
    const surfaceById = new Map(surfaces.map(surface => [surface.element.id, surface]));
    const used = new Set();
    for (const link of links) {
      if (!link || typeof link !== "object" || Array.isArray(link) ||
          !Object.prototype.hasOwnProperty.call(link, "a") || !Object.prototype.hasOwnProperty.call(link, "b") ||
          Object.keys(link).some(key => key !== "a" && key !== "b") ||
          !Number.isSafeInteger(link.a) || link.a <= 0 || !Number.isSafeInteger(link.b) || link.b <= 0) {
        warnings.add("ファイバー接続の型またはIDが不正です。その接続を無視しました。"); continue;
      }
      const a = byId.get(link.a), b = byId.get(link.b);
      if (!a || !b || a.type !== "fiber" || b.type !== "fiber" || a.id === b.id) {
        warnings.add("ファイバー接続は異なる2つの有効な端面を指定してください。不正な接続を無視しました。"); continue;
      }
      if (used.has(a.id) || used.has(b.id)) {
        warnings.add("重複・多重のファイバー接続を無視しました。先に指定した接続を使用します。"); continue;
      }
      used.add(a.id); used.add(b.id);
      // Disabled ends keep their pairing but turn off the relay. Any active end
      // then behaves as the original receiving/terminating fiber.
      if (!a.enabled || !b.enabled) continue;
      pairs.set(a.id, surfaceById.get(b.id)); pairs.set(b.id, surfaceById.get(a.id));
    }
    return pairs;
  }

  function detectorRecord(element) {
    return { id: element.id, type: element.type, power: 0, incidentPower: 0, hits: 0, acceptedPower: 0,
      acceptedHits: 0, centroid: null, span: 0, stokes: { I: 0, Q: 0, U: 0, V: 0 }, powerByWavelength: {},
      _sumX: 0, _sumY: 0, _min: Infinity, _max: -Infinity,
      ...(element.type === "camera" ? { samples: [] } : {}),
      ...(element.type === "fluorescent" || isPatternScreen(element) ? { emittedPower: 0, emittedHits: 0 } : {}) };
  }

  function recordHit(detector, state, point, height, accepted) {
    detector.hits++;
    detector.incidentPower += state.stokes.I;
    if (!accepted) return;
    detector.acceptedHits++;
    if (detector.samples) detector.samples.push({ position: height, verticalPosition: state.vertical || 0, power: state.stokes.I,
      wavelength: state.wavelength, sourceId: state.sourceId,
      ...(typeof state.cameraProfile === "string" ? { cameraProfile: state.cameraProfile } : {}),
      ...(Number.isInteger(state.imagePointId) ? { imagePointId: state.imagePointId } : {}) });
    detector.power += state.stokes.I;
    detector.acceptedPower = detector.power;
    detector._sumX += state.stokes.I * point.x;
    detector._sumY += state.stokes.I * point.y;
    detector._min = Math.min(detector._min, height);
    detector._max = Math.max(detector._max, height);
    for (const key of ["I", "Q", "U", "V"]) detector.stokes[key] += state.stokes[key];
    detector.powerByWavelength[state.wavelength] = (detector.powerByWavelength[state.wavelength] || 0) + state.stokes.I;
  }

  // Bounded 2D sampler. Point power is normalized within its drawn fan, not 4pi.
  // Laser samples a uniform-width beam. No Fresnel phase or branch interference.
  function simulate(elements, options = {}) {
    const warnings = new Set();
    const prepared = prepareElements(elements, warnings), scene = prepared.filter(element => element.enabled && !isAnnotation(element));
    const extent = traceBounds(scene, options.viewBounds);
    const surfaces = scene.filter(element => !isSource(element)).map(opticalSurface);
    const fiberPairs = prepareFiberLinks(options.fiberLinks, prepared, surfaces, warnings);
    const detectors = scene.filter(element => ["screen", "fiber", "camera", "fluorescent"].includes(element.type)).map(detectorRecord);
    const detectorMap = new Map(detectors.map(detector => [detector.id, detector]));
    const cap = (value, fallback) => Number.isFinite(value) ? clamp(Math.floor(value), 1, fallback) : fallback;
    const maxInteractions = cap(options.maxInteractions, MAX_INTERACTIONS);
    const maxSegments = cap(options.maxSegments, MAX_SEGMENTS), maxRays = cap(options.maxRays, MAX_RAYS);
    const minPower = Number.isFinite(options.minPower) ? clamp(options.minPower, 0, 1) : MIN_POWER;
    const segments = [], fiberTransfers = [], detectedPaths = [], queue = [];
    const patternIllumination = new Map(), emittedPatterns = new Set();
    let rayCount = 0, hitCount = 0, branchCounter = 0, truncated = false;
    let sourcePower = 0, escapedPower = 0, absorbedPower = 0, detectedPower = 0, discardedPower = 0;
    let clippedByIris = false, clippedByNA = false, clippedByFiberOutput = false, paraxialWarning = false;

    function collectPatternIllumination(screen, state) {
      let entry = patternIllumination.get(screen.id);
      if (!entry) {
        entry = { screen, spectrum: new Map() };
        patternIllumination.set(screen.id, entry);
      }
      entry.spectrum.set(state.wavelength, (entry.spectrum.get(state.wavelength) || 0) + state.stokes.I);
    }

    function enqueuePatternEmission(screen, spectrum) {
      const samples = screenPatternSamples(screen), directions = patternDirections(screen.rayCount, screen.divergence);
      const detector = detectorMap.get(screen.id), surface = surfaces.find(candidate => candidate.element.id === screen.id);
      const incidentPower = [...spectrum.values()].reduce((sum, power) => sum + power, 0);
      let emittedPower = 0, emissionIndex = 0;
      if (samples.length && directions.length && screen.transmission > 0) {
        const base = direction(screen.angle), tangent = { x: -base.y, y: base.x };
        for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
          const sample = samples[sampleIndex], origin = add(screen, tangent, sample.u);
          for (const [wavelength, spectralPower] of spectrum) {
            const reflected = spectralPower * screen.transmission * sample.weight * patternReflectance(sample.code, wavelength);
            emittedPower += reflected;
            if (reflected <= minPower) { discardedPower += reflected; continue; }
            for (let directionIndex = 0; directionIndex < directions.length; directionIndex++) {
              const emitted = directions[directionIndex], power = reflected / directions.length;
              if (rayCount >= maxRays) { discardedPower += power; truncated = true; continue; }
              rayCount++;
              detector.emittedHits++;
              queue.push({ origin, ray: direction(screen.angle + emitted.angle), vertical: sample.v, verticalSlope: emitted.verticalSlope,
                stokes: { I: power, Q: 0, U: 0, V: 0 }, wavelength, sourceId: screen.id,
                imagePointId: sampleIndex, path: options.recordPaths ? [] : null,
                traceKey: `${screen.id}R:${sampleIndex}:${emissionIndex}:${directionIndex}`,
                branchId: ++branchCounter, center: emitted.angle === 0 && emitted.verticalSlope === 0,
                lastIndex: surface?.index ?? -1, interactions: 0, pathLength: 0, unmeasuredFiberLinks: 0, parentSegmentKey: null });
            }
            emissionIndex++;
          }
        }
      }
      detector.emittedPower += emittedPower;
      absorbedPower += Math.max(0, incidentPower - emittedPower);
    }

    for (const source of scene.filter(isSpectralSource)) {
      sourcePower += source.power;
      if (source.power === 0) continue;
      const count = source.rayCount, spectrum = sourceSpectrum(source), base = direction(source.angle), tangent = { x: -base.y, y: base.x };
      for (let i = 0; i < count; i++) {
        const fraction = count === 1 ? 0 : i / (count - 1) - 0.5;
        const origin = source.type === "laser" ? add(source, tangent, fraction * source.beamWidth) : { x: source.x, y: source.y };
        const offset = source.divergence === 360 ? (i - Math.floor(count / 2)) * 360 / count : fraction * source.divergence;
        const ray = source.type === "laser" ? base : direction(source.angle + offset);
        for (let j = 0; j < spectrum.length; j++) {
          const sample = spectrum[j], power = source.power * sample.weight / count;
          if (rayCount >= maxRays) { discardedPower += power; truncated = true; continue; }
          rayCount++;
          queue.push({ origin, ray, vertical: 0, verticalSlope: 0, stokes: sourceStokes(source, power), wavelength: sample.wavelength,
            sourceId: source.id, path: options.recordPaths ? [] : null,
            cameraProfile: source.type === "laser" ? `${source.id}:${j}` : null,
            traceKey: `${source.id}:${count}:${i}` + (spectrum.length > 1 ? `~${spectrum.length}:${j}` : ""),
            branchId: ++branchCounter, center: i === Math.floor(count / 2), lastIndex: -1, interactions: 0,
            pathLength: 0, unmeasuredFiberLinks: 0, parentSegmentKey: null });
        }
      }
    }

    queue.reverse();
    while (queue.length || patternIllumination.size) {
      if (!queue.length) {
        const pending = [...patternIllumination.values()];
        patternIllumination.clear();
        for (const entry of pending) {
          if (emittedPatterns.has(entry.screen.id)) {
            absorbedPower += [...entry.spectrum.values()].reduce((sum, power) => sum + power, 0);
            continue;
          }
          emittedPatterns.add(entry.screen.id);
          enqueuePatternEmission(entry.screen, entry.spectrum);
        }
        queue.reverse();
        if (!queue.length) break;
      }
      const state = queue.pop();
      while (true) {
        if (state.stokes.I <= minPower) { discardedPower += state.stokes.I; break; }
        if (state.interactions >= maxInteractions) { discardedPower += state.stokes.I; truncated = true; break; }
        if (segments.length >= maxSegments) {
          discardedPower += state.stokes.I + queue.reduce((sum, pending) => sum + pending.stokes.I, 0);
          truncated = true; queue.length = 0; break;
        }
        const boundary = boundaryDistance(state.origin, state.ray, extent);
        // Trace every optical surface, including those outside the viewport.
        // The finite extent only chooses where to draw an otherwise escaping ray.
        const nearest = nearestHit(state.origin, state.ray, surfaces, state.lastIndex, Infinity, state.vertical, state.verticalSlope);
        const end = nearest ? nearest.point : add(state.origin, state.ray, boundary);
        const segmentLength = Math.hypot(end.x - state.origin.x, end.y - state.origin.y);
        const verticalStart = state.vertical || 0, verticalEnd = verticalStart + (state.verticalSlope || 0) * segmentLength;
        const pathLengthStart = state.pathLength;
        state.pathLength += segmentLength;
        const segmentKey = `${state.traceKey}->${nearest ? nearest.element.id : 'edge'}`;
        segments.push({ a: { ...state.origin }, b: { ...end }, wavelength: state.wavelength,
          power: state.stokes.I, stokes: { ...state.stokes }, sourceId: state.sourceId,
          key: segmentKey, parentKey: state.parentSegmentKey,
          branchId: state.branchId, center: state.center, hitId: nearest ? nearest.element.id : null,
          // Millimetres along the traced centre line. Ideal thin surfaces add no
          // thickness; linked fibers are flagged separately because their length
          // and refractive index are not part of the current scene model.
          pathLengthStart, pathLengthEnd: state.pathLength, unmeasuredFiberLinks: state.unmeasuredFiberLinks,
          verticalStart, verticalEnd });
        state.parentSegmentKey = segmentKey;
        if (!nearest) { escapedPower += state.stokes.I; break; }
        hitCount++;
        state.interactions++;
        state.origin = end;
        state.vertical = verticalEnd;
        state.lastIndex = nearest.surface.index;
        const element = nearest.element, n = nearest.normal || nearest.surface.n;
        // Probe identity follows the sampled ray and its optical path, not the
        // queue's branch numbering, which changes when other branches vanish.
        state.traceKey += `/${element.id}`;
        // Optional immutable path history for the separate coherent-mode analysis.
        // These are the actual hit positions, not screen pixels or preset geometry.
        if (state.path) state.path = state.path.concat({ id: element.id, point: { ...end } });
        const height = dot({ x: end.x - element.x, y: end.y - element.y }, nearest.surface.tangent);

        if (["screen", "fiber", "camera"].includes(element.type)) {
          // Fiber angle is accepted propagation direction; air NA=sin(half-angle).
          // This is a geometric acceptance model, not single-mode overlap efficiency.
          const accepted = element.type === "screen" || (element.type === "camera" ? dot(state.ray, n) > EPS :
            Math.abs(height) <= element.coreDiameter / 2 + EPS && Math.abs(state.vertical || 0) <= element.coreDiameter / 2 + EPS &&
            dot(state.ray, n) > EPS && Math.hypot(cross(state.ray, n), state.verticalSlope || 0) <= element.na + EPS);
          if (element.type === "camera" && !accepted) warnings.add("カメラの裏面に当たった光は吸収しました。配置角度は受光する光の進行方向です。");
          recordHit(detectorMap.get(element.id), state, end, height, accepted);
          if (element.type === "screen" && element.screenPattern !== "none") {
            if (dot(state.ray, n) < -EPS && !emittedPatterns.has(element.id)) collectPatternIllumination(element, state);
            else {
              absorbedPower += state.stokes.I;
              if (dot(state.ray, n) >= -EPS) warnings.add("画像スクリーンの裏面に当たった照明光は吸収しました。画像をカメラ側へ向けてください。");
            }
            break;
          }
          if (accepted && state.path && element.type === "screen") detectedPaths.push({
            sourceId: state.sourceId, detectorId: element.id, steps: state.path, direction: { ...state.ray }
          });
          const output = accepted && element.type === "fiber" ? fiberPairs.get(element.id) : null;
          if (output) {
            // Ideal bidirectional geometric relay: preserve absolute transverse
            // height and ray components, without core-size rescaling, scrambling,
            // modal overlap, delay, bend loss, or polarization transformation.
            // The partner's receiving axis is reversed to obtain its output axis.
            const axial = dot(state.ray, n), transverse = dot(state.ray, nearest.surface.tangent);
            if (Math.abs(height) > output.element.coreDiameter / 2 + EPS || Math.abs(state.vertical || 0) > output.element.coreDiameter / 2 + EPS ||
                Math.hypot(transverse, state.verticalSlope || 0) > output.element.na + EPS) {
              absorbedPower += state.stokes.I; clippedByFiberOutput = true; break;
            }
            const forward = { x: -output.n.x, y: -output.n.y }, tangent = { x: -forward.y, y: forward.x };
            state.origin = add(output.element, tangent, height);
            state.ray = unit({ x: axial * forward.x + transverse * tangent.x, y: axial * forward.y + transverse * tangent.y });
            state.lastIndex = output.index;
            state.traceKey += `>${output.element.id}`;
            state.unmeasuredFiberLinks++;
            fiberTransfers.push({ fromId: element.id, toId: output.element.id, power: state.stokes.I,
              wavelength: state.wavelength, sourceId: state.sourceId, stokes: { ...state.stokes } });
            // The input detector is a pass-through monitor, not an additional
            // terminal detection. Only the eventual termination enters the ledger.
            continue;
          }
          if (accepted) detectedPower += state.stokes.I;
          else absorbedPower += state.stokes.I;
          break;
        }
        if (element.type === "fluorescent") {
          const detector = detectorMap.get(element.id);
          recordHit(detector, state, end, height, true);
          const emittedPower = state.wavelength <= element.cutoff ? state.stokes.I * element.transmission : 0;
          absorbedPower += state.stokes.I - emittedPower;
          detector.emittedPower += emittedPower;
          if (emittedPower === 0) break;
          const count = element.rayCount;
          for (let index = 0; index < count; index++) {
            const fraction = count === 1 ? 0 : index / (count - 1) - 0.5;
            const offset = element.divergence === 360 ? (index - Math.floor(count / 2)) * 360 / count : fraction * element.divergence;
            const power = emittedPower / count;
            if (rayCount >= maxRays) { discardedPower += power; truncated = true; continue; }
            rayCount++;
            detector.emittedHits++;
            queue.push({ ...state, origin: { ...end }, ray: direction(element.angle + offset), cameraProfile: null,
              stokes: { I: power, Q: 0, U: 0, V: 0 }, wavelength: element.wavelength,
              traceKey: `${state.traceKey}F${element.id}:${count}:${index}`, branchId: ++branchCounter,
              center: index === Math.floor(count / 2), lastIndex: nearest.surface.index });
          }
          break;
        }
        if (element.type === "blocker") { absorbedPower += state.stokes.I; break; }
        if (element.type === "iris") {
          if (element.opening === 0 || Math.abs(height) > element.opening / 2 + EPS || Math.abs(state.vertical || 0) > element.opening / 2 + EPS) {
            absorbedPower += state.stokes.I; clippedByIris = true; break;
          }
        } else if (element.type === "concave") {
          if (dot(state.ray, n) < 0) {
            absorbedPower += state.stokes.I;
            warnings.add("凹面ミラーの裏面に当たった光線は吸収しました。開いている側を入射光へ向けてください。");
            break;
          }
          state.ray = reflect(state.ray, n);
          state.verticalSlope -= (state.vertical || 0) / element.focal;
        } else if (element.type === "mirror") {
          // n points from the reflective plane into the backing. Rays arriving
          // from the front travel broadly along +n; backside incidence stops.
          if (dot(state.ray, n) < 0) {
            absorbedPower += state.stokes.I;
            warnings.add("平面ミラーの裏面に当たった光線は吸収しました。反射面を入射光へ向けてください。");
            break;
          }
          state.ray = reflect(state.ray, n);
        }
        else if (element.type === "dichroic") {
          // At the exact cutoff either selectable mode transmits the ray.
          const pass = element.mode === "longpass" ? state.wavelength >= element.cutoff : state.wavelength <= element.cutoff;
          if (!pass) state.ray = reflect(state.ray, n);
        } else if (element.type === "filter") {
          const after = scaleStokes(state.stokes, filterTransmission(element, state.wavelength));
          absorbedPower += state.stokes.I - after.I;
          state.stokes = after;
          if (after.I === 0) break;
        } else if (element.type === "lens" || element.type === "objective") {
          const result = refract(state.ray, end, element);
          paraxialWarning ||= result.warning;
          if (!result.ray) { absorbedPower += state.stokes.I; break; }
          if (element.type === "objective" && (Math.abs(cross(state.ray, n)) > element.na + EPS ||
              Math.abs(cross(result.ray, n)) > element.na + EPS || Math.abs(state.verticalSlope || 0) > element.na + EPS ||
              Math.abs((state.verticalSlope || 0) - (state.vertical || 0) / element.focal) > element.na + EPS)) {
            absorbedPower += state.stokes.I; clippedByNA = true; break;
          }
          state.ray = result.ray;
          state.verticalSlope -= (state.vertical || 0) / element.focal;
        } else if (element.type === "polarizer") {
          const after = polarize(state.stokes, element.axisAngle);
          absorbedPower += state.stokes.I - after.I;
          state.stokes = after;
        } else if (element.type === "waveplate" || element.type === "halfwave") {
          // Constant-birefringence zero-order approximation: retardance ~ 1/lambda.
          state.stokes = retard(state.stokes, element.axisAngle, (element.type === "halfwave" ? Math.PI : Math.PI / 2) * element.designWavelength / state.wavelength);
        } else if (element.type === "pbs") {
          // Fixed local s/p projection: out-of-board s is +Q and reflects;
          // in-plane p is -Q and transmits. Geometric placement does not rotate
          // these polarization axes. Ideal extinction, no coating phase/loss.
          const reflected = clamp((state.stokes.I + state.stokes.Q) / 2, 0, state.stokes.I);
          const transmitted = state.stokes.I - reflected;
          for (const [power, sign, ray] of [[reflected, 1, reflect(state.ray, n)], [transmitted, -1, state.ray]]) {
            if (power === 0) continue;
            const side = sign === 1 ? 'R' : 'T';
            queue.push({ ...state, ray, stokes: { I: power, Q: sign * power, U: 0, V: 0 },
              cameraProfile: typeof state.cameraProfile === "string" ? state.cameraProfile + side : null,
              path: branchPath(state.path, side), traceKey: state.traceKey + side, branchId: ++branchCounter });
          }
          break;
        } else if (element.type === "splitter") {
          for (const [fraction, ray, side] of [[1 - element.transmission, reflect(state.ray, n), 'R'], [element.transmission, state.ray, 'T']]) {
            if (fraction === 0) continue;
            queue.push({ ...state, ray, stokes: scaleStokes(state.stokes, fraction),
              cameraProfile: typeof state.cameraProfile === "string" ? state.cameraProfile + side : null,
              path: branchPath(state.path, side), traceKey: state.traceKey + side, branchId: ++branchCounter });
          }
          break;
        }
      }
    }

    for (const detector of detectors) {
      if (detector.power > 0) {
        detector.centroid = { x: detector._sumX / detector.power, y: detector._sumY / detector.power };
        detector.span = Math.max(0, detector._max - detector._min);
      }
      delete detector._sumX; delete detector._sumY; delete detector._min; delete detector._max;
    }
    if (paraxialWarning) warnings.add("薄レンズの近軸近似（角度±15°目安）を超える光線があります。");
    if (clippedByNA) warnings.add("対物レンズのNAで一部の光線を遮断しました。空気中の幾何光学近似です。");
    if (clippedByFiberOutput) warnings.add("出射側ファイバーのコア径またはNAで一部の光線を遮断しました。");
    if (clippedByIris) warnings.add("アイリスで光線を遮断しました。透過率は追跡本数に依存する離散的な近似です。");
    if (overlapping(scene)) warnings.add("素子が重なる・交差する位置では、光線が作用する順序が曖昧になります。");
    if (truncated) warnings.add("光線・線分・反射回数の上限に達したため、追跡の一部を打ち切りました。");
    return { segments, detectors, fiberTransfers, detectedPaths, bounds: extent, warnings: [...warnings], rayCount, hitCount, truncated,
      sourcePower, escapedPower, absorbedPower, detectedPower, discardedPower, branchCount: branchCounter };
  }

  function branchPath(path, side) {
    return path ? path.slice(0, -1).concat({ ...path[path.length - 1], side }) : null;
  }

  // Original geometric-demo API: one branch, no polarization, five samples.
  // New consumers must use simulate for power and all supported elements.
  function traceRay(origin, directionVector, elements, maxInteractions = MAX_INTERACTIONS) {
    let current = { ...origin }, ray = unit(directionVector), lastIndex = -1;
    const points = [{ ...current }], hits = [];
    const surfaces = elements.filter(element => !isSource(element) && !isAnnotation(element) && element.enabled !== false)
      .map(opticalSurface);
    let paraxialWarning = false;
    for (let count = 0; count < maxInteractions; count++) {
      const boundary = boundaryDistance(current, ray);
      const nearest = nearestHit(current, ray, surfaces, lastIndex, boundary);
      if (!nearest) {
        points.push(add(current, ray, boundary));
        return { points, hits, paraxialWarning, limited: false };
      }
      current = nearest.point;
      points.push(current);
      hits.push(nearest.element.id);
      const element = nearest.element;
      if (element.type === "concave") {
        if (dot(ray, nearest.normal) < 0) return { points, hits, paraxialWarning, limited: false };
        ray = reflect(ray, nearest.normal);
      } else if (element.type === "mirror") {
        if (dot(ray, nearest.surface.n) < 0) return { points, hits, paraxialWarning, limited: false };
        ray = reflect(ray, nearest.surface.n);
      }
      else if (element.type === "lens" || element.type === "objective") {
        const result = refract(ray, current, element);
        paraxialWarning ||= result.warning;
        if (!result.ray) return { points, hits, paraxialWarning, limited: false };
        ray = result.ray;
      } else if (["blocker", "screen", "fiber", "camera", "fluorescent"].includes(element.type) || (element.type === "iris" &&
          (element.opening === 0 || Math.abs(dot({ x: current.x - element.x, y: current.y - element.y }, nearest.surface.tangent)) > element.opening / 2 + EPS))) {
        return { points, hits, paraxialWarning, limited: false };
      }
      lastIndex = nearest.surface.index;
    }
    return { points, hits, paraxialWarning, limited: true };
  }

  function traceScene(elements) {
    const rays = [];
    for (const source of elements.filter(element => element.type === "laser" && element.enabled !== false)) {
      const ray = direction(source.angle), tangent = { x: -ray.y, y: ray.x };
      for (let index = 0; index < 5; index++) {
        const origin = add(source, tangent, (index - 2) * source.beamWidth / 4);
        rays.push({ sourceId: source.id, center: index === 2, ...traceRay(origin, ray, elements) });
      }
    }
    return rays;
  }

  function overlapping(elements) {
    const active = elements.filter(element => element.enabled !== false && !isAnnotation(element));
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i], b = active[j];
        if (isSource(a) && isSource(b)) continue;
        if (Math.hypot(a.x - b.x, a.y - b.y) < 1) return true;
        if (isSource(a) || isSource(b)) continue;
        if (a.type === "concave" || b.type === "concave") {
          if (curvedOverlap(a, b)) return true;
          continue;
        }
        const sa = segment(a), sb = segment(b);
        const onSurface = (point, surface, length) => {
          const delta = { x: point.x - surface.a.x, y: point.y - surface.a.y };
          const along = dot(delta, surface.tangent);
          return Math.abs(dot(delta, surface.n)) < EPS && along >= -EPS && along <= length + EPS;
        };
        if (onSurface(sa.a, sb, b.aperture) || onSurface(sa.b, sb, b.aperture) ||
            onSurface(sb.a, sa, a.aperture) || onSurface(sb.b, sa, a.aperture)) return true;
        const edge = { x: sa.b.x - sa.a.x, y: sa.b.y - sa.a.y };
        const hit = intersect(sa.a, unit(edge), sb.a, sb.b);
        if (hit && hit.distance <= a.aperture + EPS) return true;
        const delta = { x: b.x - a.x, y: b.y - a.y };
        if (Math.abs(cross(sa.tangent, sb.tangent)) < EPS && Math.abs(dot(delta, sa.n)) < EPS &&
            Math.abs(dot(delta, sa.tangent)) <= (a.aperture + b.aperture) / 2 + EPS) return true;
      }
    }
    return false;
  }

  function onArc(point, arc) {
    const delta = { x: point.x - arc.vertex.x, y: point.y - arc.vertex.y };
    const x = dot(delta, arc.n) + arc.radius, y = dot(delta, arc.tangent);
    const tolerance = geometryTolerance(point, arc.vertex);
    return x >= arc.radius - arc.sag - tolerance && Math.abs(y) <= arc.half + tolerance &&
      Math.abs(Math.hypot(x, y) - arc.radius) <= tolerance;
  }

  function curvedOverlap(a, b) {
    if (a.type !== "concave") return curvedOverlap(b, a);
    const arc = concaveGeometry(a);
    if (!arc) return false;
    if (b.type !== "concave") {
      const line = segment(b), hit = intersectConcave(line.a, line.tangent, arc, -EPS);
      return Boolean(hit && hit.distance <= b.aperture + geometryTolerance(a, b));
    }
    const other = concaveGeometry(b);
    if (!other) return false;
    const delta = { x: b.x - a.x + arc.radius * arc.n.x - other.radius * other.n.x,
      y: b.y - a.y + arc.radius * arc.n.y - other.radius * other.n.y };
    const distance = Math.hypot(delta.x, delta.y), tolerance = geometryTolerance(a, b);
    if (distance <= tolerance) {
      return Math.abs(arc.radius - other.radius) <= tolerance &&
        (onArc(arc.a, other) || onArc(arc.b, other) || onArc(other.a, arc) || onArc(other.b, arc));
    }
    if (distance > arc.radius + other.radius + tolerance || distance < Math.abs(arc.radius - other.radius) - tolerance) return false;
    const along = (distance * distance + arc.radius * arc.radius - other.radius * other.radius) / (2 * distance);
    const height = Math.sqrt(Math.max(0, arc.radius * arc.radius - along * along));
    const axis = unit(delta), tangent = { x: -axis.y, y: axis.x };
    const base = add(add(arc.vertex, arc.n, -arc.radius), axis, along);
    return [-1, 1].some(sign => { const p = add(base, tangent, sign * height); return onArc(p, arc) && onArc(p, other); });
  }

  const api = { WIDTH, HEIGHT, GRID, MARGIN, COORDINATE_LIMIT, MAX_INTERACTIONS, MAX_SEGMENTS, MAX_RAYS,
    TYPES, DEFAULTS, PARAM_LIMITS, FILTER_MODES, REGION_COLORS, REGION_STYLES, REGION_SIZE_LIMITS, isAnnotation, regionGeometry, direction, normalizeAngle, snapAngle, position,
    createElement, initialElements, commentLayout, elementBounds, traceBounds, segment, intersect, concaveGeometry, intersectConcave, reflect, refract, traceRay, traceScene, overlapping,
    simulate, sourceStokes, sourceBand, validSourceBand, sourceSpectrum, screenPatternSamples, patternReflectance, SCREEN_PATTERNS,
    polarize, retard, wavelengthColor, filterTransmission };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Optics = api;
})(typeof window === "undefined" ? this : window);
