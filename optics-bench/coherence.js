(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory(require("./optics.js"));
  else root.OpticsCoherence = factory(root.Optics);
})(typeof window === "undefined" ? this : window, function (O) {
  "use strict";

  // Optional ideal single-spatial-mode detector analysis. The geometric tracer
  // supplies REAL hit histories; moving/blocking an arm changes this calculation.
  // Independent lasers and the two eigenmodes of an unpolarized source add as
  // intensities. Only matching position AND direction interfere at a detector.
  const RAD = Math.PI / 180, TAU = 2 * Math.PI;
  const POSITION_TOLERANCE = 1e-5, DIRECTION_TOLERANCE = 1e-7;
  const SUPPORTED = new Set(["laser", "mirror", "splitter", "pbs", "polarizer", "waveplate", "halfwave", "phase", "iris", "filter", "blocker", "screen"]);
  const zero = () => [0, 0, 0, 0]; // [Re Es, Im Es, Re Ep, Im Ep]
  const add = (a, b) => a.map((value, i) => value + b[i]);
  const scale = (a, value) => a.map(entry => entry * value);
  const norm = a => a.reduce((sum, value) => sum + value * value, 0);
  const rotate = (a, phase) => {
    const c = Math.cos(phase), s = Math.sin(phase);
    return [a[0]*c-a[1]*s, a[0]*s+a[1]*c, a[2]*c-a[3]*s, a[2]*s+a[3]*c];
  };
  function project(a, angle) {
    const c = Math.cos(angle * RAD), s = Math.sin(angle * RAD);
    const re = c*a[0]+s*a[2], im = c*a[1]+s*a[3];
    return [c*re, c*im, s*re, s*im];
  }
  function retard(a, angle, phase) {
    return add(project(a, angle), rotate(project(a, angle + 90), phase));
  }
  function stokes(a) {
    return { I: norm(a), Q: a[0]**2+a[1]**2-a[2]**2-a[3]**2,
      U: 2*(a[0]*a[2]+a[1]*a[3]), V: 2*(a[1]*a[2]-a[0]*a[3]) };
  }
  function sourceModes(source) {
    const amplitude = Math.sqrt(source.power), half = amplitude / Math.sqrt(2);
    if (source.polarization === "unpolarized") return [[half, 0, 0, 0], [0, 0, half, 0]];
    if (source.polarization === "right" || source.polarization === "left") return [[half, 0, 0, source.polarization === "right" ? -half : half]];
    return [[amplitude * Math.cos(source.polAngle * RAD), 0, amplitude * Math.sin(source.polAngle * RAD), 0]];
  }

  function pathAmplitude(source, steps, byId, mode, phaseId) {
    let amplitude = mode, previous = source, length = 0, fixedPhase = 0, order = 0;
    for (const step of steps) {
      const e = byId.get(step.id);
      length += Math.hypot(step.point.x - previous.x, step.point.y - previous.y);
      previous = step.point;
      if (e.type === "phase") {
        if (e.id === phaseId) order++;
        else fixedPhase += e.phase * RAD;
      } else if (e.type === "polarizer") amplitude = project(amplitude, e.axisAngle);
      else if (e.type === "waveplate" || e.type === "halfwave") {
        amplitude = retard(amplitude, e.axisAngle, (e.type === "halfwave" ? Math.PI : Math.PI/2) * e.designWavelength/source.wavelength);
      } else if (e.type === "mirror") amplitude = scale(amplitude, -1);
      // No dispersive phase or coating response in this ideal filter model.
      else if (e.type === "filter") amplitude = scale(amplitude, Math.sqrt(O.filterTransmission(e, source.wavelength)));
      else if (e.type === "splitter") {
        // Symmetric lossless BS: t=sqrt(T), r=i*sqrt(1-T), both incidence ports.
        amplitude = step.side === "R" ? rotate(scale(amplitude, Math.sqrt(1-e.transmission)), Math.PI/2) : scale(amplitude, Math.sqrt(e.transmission));
      } else if (e.type === "pbs") {
        amplitude = step.side === "R" ? rotate(project(amplitude, 0), Math.PI/2) : project(amplitude, 90);
      }
    }
    // mm -> nm; reduce before converting to radians. The real travelled length
    // includes repeated passes (Michelson), and never viewport extension lines.
    fixedPhase += (length % (source.wavelength * 1e-6)) / (source.wavelength * 1e-6) * TAU;
    return { amplitude: rotate(amplitude, fixedPhase), order, length };
  }

  function analyze(elements, trace, selectedPhaseId) {
    const phases = elements.filter(e => e.type === "phase");
    if (!phases.length) return null;
    const phase = phases.find(e => e.id === selectedPhaseId) || phases[0];
    const fail = message => ({ valid: false, phaseId: phase.id, message, detectors: [] });
    const active = elements.filter(e => e.enabled && !O.isAnnotation(e)), sources = active.filter(e => e.type === "laser" && e.power > 0);
    if (active.some(e => !SUPPORTED.has(e.type))) return fail("干渉解析は平行な理想単一モード用です。点光源・白色光源・レンズ・凹面ミラー・対物・ファイバー・ダイクロイック・カメラ・蛍光板には未対応（通常の光線・カメラ像は非干渉で計算を継続）。");
    if (sources.some(e => e.rayCount !== 1 || e.beamWidth !== 0)) return fail("干渉解析ではレーザーの光線サンプル数を1、ビーム直径を0にしてください。1本の主光線で理想空間モードを表します。");
    if (sources.some(e => (e.wavelengthWidth ?? 0) > 0)) return fail("波長幅のある光源の干渉・時間コヒーレンスは未対応です。干渉解析では波長幅を0 nmにしてください。通常の光線・検出・カメラは帯域を分割して計算します。");
    if (!sources.length) return fail("有効なレーザーがありません。");
    if (trace.truncated || trace.discardedPower > 0) return fail("追跡の打ち切りがあるため干渉解析を停止しました。光路を簡単にしてください。");
    if (O.overlapping(active)) return fail("部品が重なっているため干渉解析を停止しました。素子を離してください。");
    if (!Array.isArray(trace.detectedPaths)) return fail("干渉解析用の光路履歴がありません。");
    const byId = new Map(elements.map(e => [e.id, e]));
    const records = active.filter(e => e.type === "screen").map(e => ({ id: e.id, groups: [], pathCount: 0 }));
    const detectorMap = new Map(records.map(d => [d.id, d]));
    for (const path of trace.detectedPaths) {
      const source = byId.get(path.sourceId), detector = detectorMap.get(path.detectorId);
      if (!source || !detector || !path.steps.length) return fail("光路履歴と部品が一致しません。");
      const point = path.steps[path.steps.length - 1].point;
      detector.pathCount++;
      const modes = sourceModes(source);
      for (let modeIndex = 0; modeIndex < modes.length; modeIndex++) {
        const amplitude = pathAmplitude(source, path.steps, byId, modes[modeIndex], phase.id);
        if (amplitude.length > 1e6) return fail("位相の数値精度を保つため、干渉解析の光路長は1 km以下にしてください。");
        let group = detector.groups.find(g => g.sourceId === source.id && g.modeIndex === modeIndex &&
          Math.hypot(g.point.x-point.x, g.point.y-point.y) <= POSITION_TOLERANCE &&
          Math.hypot(g.direction.x-path.direction.x, g.direction.y-path.direction.y) <= DIRECTION_TOLERANCE);
        if (!group) {
          group = { sourceId: source.id, modeIndex, point, direction: path.direction, orders: new Map(), paths: 0 };
          detector.groups.push(group);
        }
        group.paths++;
        group.orders.set(amplitude.order, add(group.orders.get(amplitude.order) || zero(), amplitude.amplitude));
      }
    }
    const evaluate = (record, degrees) => {
      const sum = { I: 0, Q: 0, U: 0, V: 0 };
      for (const group of record.groups) {
        let amplitude = zero();
        for (const [order, value] of group.orders) amplitude = add(amplitude, rotate(value, order*degrees*RAD));
        const s = stokes(amplitude);
        for (const key of Object.keys(sum)) sum[key] += s[key];
      }
      if (sum.I < 1e-24) return { I: 0, Q: 0, U: 0, V: 0 };
      return sum;
    };
    const detectors = records.map(record => {
      const samples = Array.from({ length: 181 }, (_, i) => ({ phase: i*2, power: evaluate(record, i*2).I }));
      const min = Math.min(...samples.map(s => s.power)), max = Math.max(...samples.map(s => s.power));
      const current = evaluate(record, phase.phase);
      return { id: record.id, power: current.I, stokes: current, min, max,
        visibility: max + min > 1e-12 ? (max-min)/(max+min) : null,
        pathCount: record.pathCount, matchedGroups: record.groups.filter(g => g.paths > 1).length, samples };
    });
    return { valid: true, phaseId: phase.id, phase: phase.phase, detectors,
      sourcePower: sources.reduce((sum, e) => sum + e.power, 0),
      message: !phase.enabled ? "位相シフターは無効です。走査しても位相は変わりません。" :
        !detectors.some(d => d.matchedGroups) ? "同じ検出位置・進行方向に重なる光路がありません。片腕の遮断や光軸ずれでは干渉しません。" :
        "同じレーザーから出た同一モードの複素振幅を合成しています。直交偏光では干渉項が消えます。" };
  }
  return Object.freeze({ analyze, sourceModes, project, retard, stokes, POSITION_TOLERANCE, DIRECTION_TOLERANCE });
});
