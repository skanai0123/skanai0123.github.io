(function (root) {
  "use strict";

  // Millimetres; geometric angles are clockwise on the board. Polarization
  // angles belong to a separate local transverse reference frame.
  const WIDTH = 1000, HEIGHT = 600, GRID = 25, MARGIN = 50;
  const EPS = 1e-7, MAX_INTERACTIONS = 40, MAX_ELEMENTS = 80;
  const MAX_SEGMENTS = 12000, MAX_RAYS = 4096, MIN_POWER = 1e-9;
  const TYPES = Object.freeze({
    laser: { label: "レーザー", short: "LAS", color: "#ff8279" },
    point: { label: "点光源", short: "PT", color: "#ffba73" },
    mirror: { label: "ミラー", short: "M", color: "#a8becf" },
    lens: { label: "レンズ", short: "L", color: "#70d5ee" },
    iris: { label: "アイリス", short: "IR", color: "#d4c5ac" },
    polarizer: { label: "偏光子", short: "POL", color: "#afa1ff" },
    waveplate: { label: "λ/4板", short: "λ/4", color: "#e5a0ef" },
    dichroic: { label: "ダイクロイック", short: "DM", color: "#f3be68" },
    objective: { label: "対物レンズ", short: "OBJ", color: "#70d5ee" },
    fiber: { label: "ファイバー", short: "FIB", color: "#87d9a8" },
    blocker: { label: "ビームブロッカー", short: "STOP", color: "#b6b9c4" },
    splitter: { label: "ビームスプリッター", short: "BS", color: "#b4d5fb" },
    screen: { label: "スクリーン / 検出器", short: "DET", color: "#95e1bf" }
  });
  const PARAM_LIMITS = Object.freeze({
    angle: { min: 0, max: 360 }, polAngle: { min: 0, max: 360 }, axisAngle: { min: 0, max: 360 },
    aperture: { min: 2, max: 300 }, focal: { min: -1000, max: 1000 },
    beamWidth: { min: 0, max: 200 }, wavelength: { min: 200, max: 2500 },
    power: { min: 0, max: 100 }, rayCount: { min: 1, max: 61 },
    divergence: { min: 1, max: 360 }, designWavelength: { min: 200, max: 2500 },
    opening: { min: 0, max: 300 }, coreDiameter: { min: 0.01, max: 200 },
    na: { min: 0.01, max: 1 }, transmission: { min: 0, max: 1 }, cutoff: { min: 200, max: 2500 }
  });
  const DEFAULTS = Object.freeze({
    angle: 0, focal: 100, aperture: 50, beamWidth: 12, wavelength: 532,
    power: 1, rayCount: 9, divergence: 20, polarization: "linear", polAngle: 0,
    axisAngle: 0, designWavelength: 532, opening: 20, coreDiameter: 1, na: 0.22,
    transmission: 0.5, cutoff: 600, mode: "longpass", enabled: true, label: ""
  });
  const TYPE_DEFAULTS = {
    point: { polarization: "unpolarized", rayCount: 21, divergence: 30, beamWidth: 0 },
    mirror: { angle: 45, aperture: 100 }, lens: { aperture: 100 },
    waveplate: { axisAngle: 45 }, dichroic: { angle: 45, aperture: 100 },
    objective: { focal: 50, na: 0.35 }, splitter: { angle: 45, aperture: 100 },
    blocker: { aperture: 100 }, screen: { aperture: 100 }
  };
  const isSource = element => element.type === "laser" || element.type === "point";
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
      x: clamp(quantize(Number.isFinite(x) ? x : WIDTH / 2), MARGIN, WIDTH - MARGIN),
      y: clamp(quantize(Number.isFinite(y) ? y : HEIGHT / 2), MARGIN, HEIGHT - MARGIN)
    };
  }

  function createElement(type, id, x, y) {
    if (!Object.prototype.hasOwnProperty.call(TYPES, type)) throw new Error("Unknown optical element");
    return { id, type, ...position(x, y), ...DEFAULTS, ...(TYPE_DEFAULTS[type] || {}) };
  }

  function initialElements() {
    const laser = { ...createElement("laser", 1, 150, 400), beamWidth: 30, rayCount: 5 };
    const mirror = createElement("mirror", 2, 550, 400);
    const lens = { ...createElement("lens", 3, 550, 200), focal: 125, angle: 90 };
    return [laser, mirror, lens];
  }

  function segment(element) {
    const n = direction(element.angle), tangent = { x: -n.y, y: n.x };
    return { a: add(element, tangent, -element.aperture / 2), b: add(element, tangent, element.aperture / 2), n, tangent };
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

  function boundaryDistance(origin, ray) {
    const values = [];
    if (ray.x > EPS) values.push((WIDTH - origin.x) / ray.x);
    if (ray.x < -EPS) values.push(-origin.x / ray.x);
    if (ray.y > EPS) values.push((HEIGHT - origin.y) / ray.y);
    if (ray.y < -EPS) values.push(-origin.y / ray.y);
    return values.length ? Math.max(0, Math.min(...values)) : 0;
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

  function nearestHit(origin, ray, surfaces, lastIndex, boundary) {
    let nearest = null;
    for (const surface of surfaces) {
      if (surface.index === lastIndex) continue;
      const hit = intersect(origin, ray, surface.a, surface.b);
      if (hit && hit.distance < boundary - EPS && (!nearest || hit.distance < nearest.distance)) {
        nearest = { ...hit, surface, element: surface.element };
      }
    }
    return nearest;
  }

  function prepareElements(elements, warnings) {
    if (!Array.isArray(elements)) { warnings.add("素子の配列が不正です。"); return []; }
    const valid = [], ids = new Set();
    for (const raw of elements.slice(0, MAX_ELEMENTS)) {
      if (!raw || !Object.prototype.hasOwnProperty.call(TYPES, raw.type) ||
          !["number", "string"].includes(typeof raw.id) ||
          (typeof raw.id === "number" && !Number.isFinite(raw.id)) || ids.has(raw.id) ||
          !Number.isFinite(raw.x) || !Number.isFinite(raw.y) || raw.x < 0 || raw.x > WIDTH || raw.y < 0 || raw.y > HEIGHT) {
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
      invalid ||= !Number.isInteger(element.rayCount) || Math.abs(element.focal) < 1 ||
        !["linear", "right", "left", "unpolarized"].includes(element.polarization) ||
        !["longpass", "shortpass"].includes(element.mode) || typeof element.enabled !== "boolean" ||
        (element.type === "iris" && element.opening > element.aperture) ||
        (element.type === "fiber" && element.coreDiameter > element.aperture);
      if (invalid) { warnings.add("範囲外または不正なパラメーターの素子を計算から除外しました。"); continue; }
      ids.add(element.id);
      if (element.enabled) valid.push(element);
    }
    if (elements.length > MAX_ELEMENTS) warnings.add(`素子数の上限（${MAX_ELEMENTS}個）を超えた分を除外しました。`);
    return valid;
  }

  function detectorRecord(element) {
    return { id: element.id, type: element.type, power: 0, incidentPower: 0, hits: 0, acceptedPower: 0,
      acceptedHits: 0, centroid: null, span: 0, stokes: { I: 0, Q: 0, U: 0, V: 0 }, powerByWavelength: {},
      _sumX: 0, _sumY: 0, _min: Infinity, _max: -Infinity };
  }

  function recordHit(detector, state, point, height, accepted) {
    detector.hits++;
    detector.incidentPower += state.stokes.I;
    if (!accepted) return;
    detector.acceptedHits++;
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
    const scene = prepareElements(elements, warnings);
    const surfaces = scene.filter(element => !isSource(element)).map((element, index) => ({ ...segment(element), element, index }));
    const detectors = scene.filter(element => ["screen", "fiber"].includes(element.type)).map(detectorRecord);
    const detectorMap = new Map(detectors.map(detector => [detector.id, detector]));
    const cap = (value, fallback) => Number.isFinite(value) ? clamp(Math.floor(value), 1, fallback) : fallback;
    const maxInteractions = cap(options.maxInteractions, MAX_INTERACTIONS);
    const maxSegments = cap(options.maxSegments, MAX_SEGMENTS), maxRays = cap(options.maxRays, MAX_RAYS);
    const minPower = Number.isFinite(options.minPower) ? clamp(options.minPower, 0, 1) : MIN_POWER;
    const segments = [], queue = [];
    let rayCount = 0, hitCount = 0, branchCounter = 0, truncated = Array.isArray(elements) && elements.length > MAX_ELEMENTS;
    let sourcePower = 0, escapedPower = 0, absorbedPower = 0, detectedPower = 0, discardedPower = 0;
    let clippedByIris = false, clippedByNA = false, paraxialWarning = false;

    for (const source of scene.filter(isSource)) {
      sourcePower += source.power;
      if (source.power === 0) continue;
      const count = source.rayCount, base = direction(source.angle), tangent = { x: -base.y, y: base.x };
      for (let i = 0; i < count; i++) {
        const power = source.power / count;
        if (rayCount >= maxRays) { discardedPower += power; truncated = true; continue; }
        const fraction = count === 1 ? 0 : i / (count - 1) - 0.5;
        const origin = source.type === "laser" ? add(source, tangent, fraction * source.beamWidth) : { x: source.x, y: source.y };
        const offset = source.divergence === 360 ? (i - Math.floor(count / 2)) * 360 / count : fraction * source.divergence;
        const ray = source.type === "point" ? direction(source.angle + offset) : base;
        if (origin.x < 0 || origin.x > WIDTH || origin.y < 0 || origin.y > HEIGHT) {
          discardedPower += power;
          warnings.add("光源の幅がボードの外に出ているため、一部の光線を除外しました。");
          continue;
        }
        rayCount++;
        queue.push({ origin, ray, stokes: sourceStokes(source, power), wavelength: source.wavelength,
          sourceId: source.id, branchId: ++branchCounter, center: i === Math.floor(count / 2), lastIndex: -1, interactions: 0 });
      }
    }

    queue.reverse();
    while (queue.length) {
      const state = queue.pop();
      while (true) {
        if (state.stokes.I <= minPower) { discardedPower += state.stokes.I; break; }
        if (state.interactions >= maxInteractions) { discardedPower += state.stokes.I; truncated = true; break; }
        if (segments.length >= maxSegments) {
          discardedPower += state.stokes.I + queue.reduce((sum, pending) => sum + pending.stokes.I, 0);
          truncated = true; queue.length = 0; break;
        }
        const boundary = boundaryDistance(state.origin, state.ray);
        if (boundary <= EPS) { escapedPower += state.stokes.I; break; }
        const nearest = nearestHit(state.origin, state.ray, surfaces, state.lastIndex, boundary);
        const end = nearest ? nearest.point : add(state.origin, state.ray, boundary);
        segments.push({ a: { ...state.origin }, b: { ...end }, wavelength: state.wavelength,
          power: state.stokes.I, stokes: { ...state.stokes }, sourceId: state.sourceId,
          branchId: state.branchId, center: state.center, hitId: nearest ? nearest.element.id : null });
        if (!nearest) { escapedPower += state.stokes.I; break; }
        hitCount++;
        state.interactions++;
        state.origin = end;
        state.lastIndex = nearest.surface.index;
        const element = nearest.element, n = nearest.surface.n;
        const height = dot({ x: end.x - element.x, y: end.y - element.y }, nearest.surface.tangent);

        if (element.type === "screen" || element.type === "fiber") {
          // Fiber angle is accepted propagation direction; air NA=sin(half-angle).
          // This is a geometric acceptance model, not single-mode overlap efficiency.
          const accepted = element.type === "screen" || (Math.abs(height) <= element.coreDiameter / 2 + EPS &&
            dot(state.ray, n) > EPS && Math.abs(cross(state.ray, n)) <= element.na + EPS);
          recordHit(detectorMap.get(element.id), state, end, height, accepted);
          if (accepted) detectedPower += state.stokes.I;
          else absorbedPower += state.stokes.I;
          break;
        }
        if (element.type === "blocker") { absorbedPower += state.stokes.I; break; }
        if (element.type === "iris") {
          if (element.opening === 0 || Math.abs(height) > element.opening / 2 + EPS) {
            absorbedPower += state.stokes.I; clippedByIris = true; break;
          }
        } else if (element.type === "mirror") state.ray = reflect(state.ray, n);
        else if (element.type === "dichroic") {
          // At the exact cutoff either selectable mode transmits the ray.
          const pass = element.mode === "longpass" ? state.wavelength >= element.cutoff : state.wavelength <= element.cutoff;
          if (!pass) state.ray = reflect(state.ray, n);
        } else if (element.type === "lens" || element.type === "objective") {
          const result = refract(state.ray, end, element);
          paraxialWarning ||= result.warning;
          if (!result.ray) { absorbedPower += state.stokes.I; break; }
          if (element.type === "objective" && (Math.abs(cross(state.ray, n)) > element.na + EPS ||
              Math.abs(cross(result.ray, n)) > element.na + EPS)) {
            absorbedPower += state.stokes.I; clippedByNA = true; break;
          }
          state.ray = result.ray;
        } else if (element.type === "polarizer") {
          const after = polarize(state.stokes, element.axisAngle);
          absorbedPower += state.stokes.I - after.I;
          state.stokes = after;
        } else if (element.type === "waveplate") {
          // Constant-birefringence zero-order approximation: retardance ~ 1/lambda.
          state.stokes = retard(state.stokes, element.axisAngle, Math.PI / 2 * element.designWavelength / state.wavelength);
        } else if (element.type === "splitter") {
          for (const [fraction, ray] of [[1 - element.transmission, reflect(state.ray, n)], [element.transmission, state.ray]]) {
            if (fraction === 0) continue;
            queue.push({ ...state, ray, stokes: scaleStokes(state.stokes, fraction), branchId: ++branchCounter });
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
    if (clippedByIris) warnings.add("アイリスで光線を遮断しました。透過率は追跡本数に依存する離散的な近似です。");
    if (overlapping(scene)) warnings.add("素子が重なる・交差する位置では、光線が作用する順序が曖昧になります。");
    if (truncated) warnings.add("光線・線分・反射回数の上限に達したため、追跡の一部を打ち切りました。");
    return { segments, detectors, warnings: [...warnings], rayCount, hitCount, truncated,
      sourcePower, escapedPower, absorbedPower, detectedPower, discardedPower, branchCount: branchCounter };
  }

  // Original geometric-demo API: one branch, no polarization, five samples.
  // New consumers must use simulate for power and all supported elements.
  function traceRay(origin, directionVector, elements, maxInteractions = MAX_INTERACTIONS) {
    let current = { ...origin }, ray = unit(directionVector), lastIndex = -1;
    const points = [{ ...current }], hits = [];
    const surfaces = elements.filter(element => !isSource(element) && element.enabled !== false)
      .map((element, index) => ({ ...segment(element), element, index }));
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
      if (element.type === "mirror") ray = reflect(ray, nearest.surface.n);
      else if (element.type === "lens" || element.type === "objective") {
        const result = refract(ray, current, element);
        paraxialWarning ||= result.warning;
        if (!result.ray) return { points, hits, paraxialWarning, limited: false };
        ray = result.ray;
      } else if (["blocker", "screen", "fiber"].includes(element.type) || (element.type === "iris" &&
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
    const active = elements.filter(element => element.enabled !== false);
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i], b = active[j];
        if (isSource(a) && isSource(b)) continue;
        if (Math.hypot(a.x - b.x, a.y - b.y) < 1) return true;
        if (isSource(a) || isSource(b)) continue;
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

  const api = { WIDTH, HEIGHT, GRID, MARGIN, MAX_ELEMENTS, MAX_INTERACTIONS, MAX_SEGMENTS, MAX_RAYS,
    TYPES, DEFAULTS, PARAM_LIMITS, direction, normalizeAngle, snapAngle, position,
    createElement, initialElements, segment, intersect, reflect, refract, traceRay, traceScene, overlapping,
    simulate, sourceStokes, polarize, retard, wavelengthColor };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Optics = api;
})(typeof window === "undefined" ? this : window);
