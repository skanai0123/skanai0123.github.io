const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../optics-bench/coherence.js');
const P = require('../optics-bench/presets.js');
const O = require('../optics-bench/optics.js');
const K = require('../optics-bench/camera.js');
const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const element = (type, id, x, y, angle = 0, focal = 125) => ({ ...O.createElement(type, id, x, y), angle, focal });
const atX = (points, x) => {
  const a = points.at(-2), b = points.at(-1);
  return a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x);
};

test('probe keys remain stable when unrelated rays or PBS branches disappear', () => {
  const first = { ...element('laser', 1, 100, 100), rayCount: 1 };
  const source = { ...element('laser', 2, 100, 350), rayCount: 1, polAngle: 45 };
  const pbs = element('pbs', 3, 500, 350, 45);
  const before = O.simulate([first, source, pbs]).segments;
  const reflected = before.find(s => s.sourceId === 2 && Math.abs(s.a.x - 500) < 1e-8 && s.b.y < s.a.y);
  const transmitted = before.find(s => s.sourceId === 2 && Math.abs(s.a.x - 500) < 1e-8 && s.b.x > s.a.x);
  assert.ok(reflected && transmitted);
  first.power = 0; source.polAngle = 0;
  const after = O.simulate([first, source, pbs]).segments;
  const kept = after.find(s => s.key === reflected.key);
  assert.ok(kept); assert.notEqual(kept.branchId, reflected.branchId);
  near(kept.stokes.Q / kept.stokes.I, 1);
  assert.equal(after.some(s => s.key === transmitted.key), false);
  source.polAngle = 90;
  const opposite = O.simulate([first, source, pbs]).segments;
  assert.ok(opposite.some(s => s.key === transmitted.key));
  assert.equal(opposite.some(s => s.key === reflected.key), false);
});

test('repeated mirror passes have unique probe keys and preserve local polarization', () => {
  const source = { ...element('laser', 1, 500, 300), rayCount: 1, polarization: 'right' };
  const result = O.simulate([source, element('mirror', 2, 900, 300), element('mirror', 3, 100, 300, 180)], { maxInteractions: 8 });
  assert.equal(result.segments.length, 8);
  assert.equal(new Set(result.segments.map(s => s.key)).size, 8);
  for (const s of result.segments) near(s.stokes.V / s.stokes.I, 1);
});

test('ray segments accumulate geometric path distance through reflection and splitter branches', () => {
  const source = { ...element('laser', 1, 100, 300), beamWidth: 0, rayCount: 1 };
  const reflected = O.simulate([
    source, element('mirror', 2, 400, 300, 45), element('screen', 3, 400, 100, 90)
  ]);
  assert.deepEqual(reflected.segments.map(segment => segment.hitId), [2, 3]);
  assert.deepEqual(reflected.segments.map(segment => [segment.pathLengthStart, segment.pathLengthEnd]), [[0, 300], [300, 500]]);
  assert.ok(reflected.segments.every(segment => segment.unmeasuredFiberLinks === 0));

  const split = O.simulate([
    source, element('splitter', 2, 400, 300, 45),
    element('screen', 3, 700, 300), element('screen', 4, 400, 100, 90)
  ]);
  const input = split.segments.find(segment => segment.hitId === 2);
  const transmitted = split.segments.find(segment => segment.hitId === 3);
  const branchReflected = split.segments.find(segment => segment.hitId === 4);
  assert.deepEqual([input.pathLengthStart, input.pathLengthEnd], [0, 300]);
  assert.deepEqual([transmitted.pathLengthStart, transmitted.pathLengthEnd], [300, 600]);
  assert.deepEqual([branchReflected.pathLengthStart, branchReflected.pathLengthEnd], [300, 500]);
});

test('five parallel laser rays reach the edge; no laser produces no rays', () => {
  assert.deepEqual(O.traceScene([]), []);
  const rays = O.traceScene([{ ...element('laser', 1, 100, 300), beamWidth: 30 }]);
  assert.equal(rays.length, 5);
  assert.equal(rays.filter(ray => ray.center).length, 1);
  near(rays.at(-1).points[0].y - rays[0].points[0].y, 30);
  for (const ray of rays) { near(ray.points.at(-1).x, 1000); near(ray.points.at(-1).y, ray.points[0].y); }
});

test('mirror reflects toward the upper edge at 45 degrees and toward source at 0', () => {
  const origin = { x: 100, y: 300 };
  const ray = O.traceRay(origin, { x: 1, y: 0 }, [element('mirror', 2, 400, 300, 45)]);
  assert.deepEqual(ray.hits, [2]);
  near(ray.points.at(-1).x, 400); near(ray.points.at(-1).y, 0);
  const reverse = O.traceRay(origin, { x: 1, y: 0 }, [element('mirror', 2, 400, 300)]);
  near(reverse.points.at(-1).x, 0); near(reverse.points.at(-1).y, 300);
});

test('flat mirror reflects only at its front and absorbs backside incidence', () => {
  const mirror = element('mirror', 2, 400, 300, 0);
  const front = O.simulate([
    { ...element('laser', 1, 100, 300), rayCount: 1, beamWidth: 0 }, mirror
  ]);
  assert.equal(front.hitCount, 1); near(front.escapedPower, 1); near(front.absorbedPower, 0);
  assert.ok(front.segments.at(-1).b.x < front.segments.at(-1).a.x);

  const back = O.simulate([
    { ...element('laser', 1, 700, 300), angle: 180, rayCount: 1, beamWidth: 0 }, mirror
  ]);
  assert.equal(back.hitCount, 1); near(back.absorbedPower, 1); near(back.escapedPower, 0);
  assert.equal(back.segments.length, 1);
  assert.match(back.warnings.join(' '), /平面ミラーの裏面/);

  const legacy = O.traceRay({ x: 700, y: 300 }, { x: -1, y: 0 }, [mirror]);
  assert.deepEqual(legacy.hits, [2]); assert.equal(legacy.points.length, 2);
  near(legacy.points.at(-1).x, 400); near(legacy.points.at(-1).y, 300);
});

test('reflection conserves unit length and is reversible at arbitrary orientations', () => {
  for (const angle of [0, 13, 45, 90, 157, 270]) {
    const d = O.direction(27), n = O.direction(angle), out = O.reflect(d, n);
    near(Math.hypot(out.x, out.y), 1);
    const back = O.reflect(out, n);
    near(back.x, d.x); near(back.y, d.y);
  }
});

test('only the nearest forward surface within finite aperture affects a ray', () => {
  const surfaces = [element('mirror', 2, 600, 300), element('mirror', 3, 400, 300), element('mirror', 4, 50, 300)];
  const ray = O.traceRay({ x: 100, y: 300 }, { x: 1, y: 0 }, surfaces, 1);
  assert.deepEqual(ray.hits, [3]);
  const miss = O.traceRay({ x: 100, y: 313 }, { x: 1, y: 0 }, surfaces);
  assert.deepEqual(miss.hits, []);
  const edge = O.traceRay({ x: 100, y: 312.5 }, { x: 1, y: 0 }, surfaces, 1);
  assert.deepEqual(edge.hits, [3]);
});

test('parallel and self intersections do not create spurious hits', () => {
  assert.equal(O.intersect({ x: 10, y: 0 }, { x: 0, y: 1 }, { x: 20, y: 0 }, { x: 20, y: 100 }), null);
  assert.equal(O.intersect({ x: 20, y: 50 }, { x: 1, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 100 }), null);
});

test('convex lens focuses collimated light at f, from either side', () => {
  for (const sign of [-1, 1]) for (const f of [25, 125, 500]) {
    const lens = element('lens', 2, 500, 300, 0, f);
    for (const offset of [-15, 0, 15]) {
      const ray = O.traceRay({ x: 500 - sign * 200, y: 300 + offset }, { x: sign, y: 0 }, [lens]);
      assert.deepEqual(ray.hits, [2]);
      near(atX(ray.points, 500 + sign * f), 300);
    }
  }
});

test('a rotated and translated lens focuses on its own local axis', () => {
  for (const angle of [30, 90, 150, 225]) {
    const lens = element('lens', 2, 500, 300, angle, 100);
    const axis = O.direction(angle), tangent = { x: -axis.y, y: axis.x };
    const hit = { x: lens.x + 12 * tangent.x, y: lens.y + 12 * tangent.y };
    const out = O.refract(axis, hit, lens).ray;
    const target = { x: lens.x + 100 * axis.x, y: lens.y + 100 * axis.y };
    near((target.x - hit.x) * out.y - (target.y - hit.y) * out.x, 0);
  }
});

test('ray through the lens center is unchanged and lens is reciprocal', () => {
  const lens = element('lens', 2, 500, 300);
  const incoming = O.direction(5);
  const centered = O.refract(incoming, lens, lens).ray;
  near(centered.x, incoming.x); near(centered.y, incoming.y);
  const hit = { x: 500, y: 310 }, out = O.refract(incoming, hit, lens).ray;
  const back = O.refract({ x: -out.x, y: -out.y }, hit, lens).ray;
  near(back.x, -incoming.x); near(back.y, -incoming.y);
});

test('lens displacement and focal changes alter the outgoing ray', () => {
  const original = element('lens', 2, 400, 300);
  const a = O.traceRay({ x: 100, y: 310 }, { x: 1, y: 0 }, [original]);
  const b = O.traceRay({ x: 100, y: 310 }, { x: 1, y: 0 }, [{ ...original, focal: 250 }]);
  const c = O.traceRay({ x: 100, y: 310 }, { x: 1, y: 0 }, [{ ...original, y: 325 }]);
  assert.notEqual(a.points.at(-1).y, b.points.at(-1).y);
  assert.notEqual(a.points.at(-1).y, c.points.at(-1).y);
});

test('default laser-mirror-lens layout reaches the indicated focus', () => {
  const rays = O.traceScene(O.initialElements());
  for (const ray of rays) {
    assert.deepEqual(ray.hits, [2, 3]);
    const a = ray.points.at(-2), b = ray.points.at(-1);
    near(a.x + (b.x - a.x) * (75 - a.y) / (b.y - a.y), 550);
    assert.equal(ray.paraxialWarning, false);
    assert.equal(ray.limited, false);
  }
});

test('large incident and outgoing angles raise approximation warnings', () => {
  const lens = element('lens', 1, 500, 300);
  assert.equal(O.refract(O.direction(30), lens, lens).warning, true);
  assert.equal(O.refract(O.direction(0), { x: 500, y: 340 }, { ...lens, focal: 25 }).warning, true);
  assert.equal(O.refract(O.direction(0), lens, lens).warning, false);
});

test('repeated reflections stop at the interaction cap, with finite coordinates', () => {
  const scene = [element('mirror', 1, 250, 300, 180), element('mirror', 2, 750, 300)];
  const ray = O.traceRay({ x: 500, y: 300 }, { x: 1, y: 0 }, scene);
  assert.equal(ray.hits.length, O.MAX_INTERACTIONS);
  assert.equal(ray.limited, true);
  assert.ok(ray.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
});

test('grid snapping and free placement support negative and distant positions', () => {
  assert.deepEqual(O.position(313, 189), { x: 325, y: 200 });
  assert.deepEqual(O.position(313.23, 189.34, false), { x: 313.2, y: 189.3 });
  assert.deepEqual(O.position(-1000, 2000), { x: -1000, y: 2000 });
  assert.deepEqual(O.position(2000, -1000, false), { x: 2000, y: -1000 });
  assert.equal(O.normalizeAngle(-15), 345);
  assert.equal(O.normalizeAngle(360), 0);
});

test('crossed and collinear surfaces are flagged but separated default parts are not', () => {
  assert.equal(O.overlapping(O.initialElements()), false);
  assert.equal(O.overlapping([element('mirror', 1, 500, 300), element('lens', 2, 500, 325)]), true);
  assert.equal(O.overlapping([element('mirror', 1, 500, 300), element('lens', 2, 525, 300, 90)]), true);
  assert.equal(O.overlapping([element('mirror', 1, 500, 300), element('lens', 2, 600, 300)]), false);
  assert.equal(O.overlapping([element('mirror', 1, 500, 300), element('lens', 2, 550, 300, 90)]), true);
});

test('multiple independent lasers and rotated edge layouts remain bounded', () => {
  const scene = O.initialElements();
  scene.push(element('laser', 4, 50, 50, 225));
  assert.equal(O.traceScene(scene).length, 10);
  for (let angle = 0; angle < 360; angle += 7) {
    scene[0].angle = angle;
    for (const ray of O.traceScene(scene)) for (const point of ray.points) {
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
      assert.ok(point.x >= -1e-6 && point.x <= O.WIDTH + 1e-6 && point.y >= -1e-6 && point.y <= O.HEIGHT + 1e-6);
    }
  }
});

const part = (type, id, x, y, patch = {}) => ({ ...O.createElement(type, id, x, y), x, y, ...patch });
const detector = (result, id) => {
  const found = result.detectors.find(item => item.id === id);
  assert.ok(found, `Missing detector ${id}`);
  return found;
};
const conserve = result => near(result.sourcePower,
  result.escapedPower + result.absorbedPower + result.detectedPower + result.discardedPower, 1e-8);
const bounded = result => {
  for (const segment of result.segments) {
    assert.ok(segment.power >= 0 && Number.isFinite(segment.power));
    assert.ok(Number.isFinite(segment.pathLengthStart) && Number.isFinite(segment.pathLengthEnd));
    assert.ok(segment.pathLengthStart >= 0 && segment.pathLengthEnd >= segment.pathLengthStart);
    // Subtracting large cumulative lengths can lose a few low bits for sources
    // near the coordinate limit; one micrometre is far below displayed precision.
    near(segment.pathLengthEnd - segment.pathLengthStart, Math.hypot(segment.b.x - segment.a.x, segment.b.y - segment.a.y), 1e-6);
    assert.ok(Number.isSafeInteger(segment.unmeasuredFiberLinks) && segment.unmeasuredFiberLinks >= 0);
    near(segment.stokes.I, segment.power);
    assert.ok(Math.hypot(segment.stokes.Q, segment.stokes.U, segment.stokes.V) <= segment.power + 1e-9);
    for (const point of [segment.a, segment.b]) {
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
      const b = result.bounds;
      assert.ok(point.x >= b.x - 1e-6 && point.x <= b.x + b.width + 1e-6 && point.y >= b.y - 1e-6 && point.y <= b.y + b.height + 1e-6);
    }
  }
  conserve(result);
};

test('sources crossing the former origin and edges emit their entire sampled beam', () => {
  for (const [x, y] of [[0, 0], [-10000, -20000], [25000, 75000]]) {
    const result = O.simulate([part('laser', 1, x, y, { angle: 45, beamWidth: 200, rayCount: 61, polarization: 'right' })]);
    assert.equal(result.rayCount, 61); assert.equal(result.segments.length, 61);
    near(result.escapedPower, 1); near(result.discardedPower, 0);
    assert.equal(result.warnings.length, 0); bounded(result);
  }
});

test('offscreen negative and distant optics are traced independently of the viewport', () => {
  const elements = [part('laser', 1, -2500, -800, { polAngle: 45 }), part('pbs', 2, 2500, -800),
    part('screen', 3, 4000, -800), part('screen', 4, 2500, -3000, { angle: 90 })];
  const before = JSON.stringify(elements);
  for (const viewBounds of [{ x: -200, y: 0, width: 400, height: 200 }, { x: 1e6, y: -1e6, width: 3000, height: 2000 }]) {
    const result = O.simulate(elements, { viewBounds });
    near(detector(result, 3).power, .5); near(detector(result, 4).power, .5);
    near(detector(result, 3).stokes.Q, -.5); near(detector(result, 4).stokes.Q, .5);
    near(result.detectedPower, 1); assert.equal(result.truncated, false); bounded(result);
  }
  assert.equal(JSON.stringify(elements), before);
});

test('escaping rays extend into a distant viewport while retaining identity, power and polarization', () => {
  const elements = [part('laser', 1, 100, 300, { rayCount: 1, wavelength: 450, polarization: 'left' })];
  const first = O.simulate(elements), far = O.simulate(elements, { viewBounds: { x: 50000, y: 200, width: 400, height: 200 } });
  const a = first.segments[0], b = far.segments[0];
  near(b.b.x, 50400); near(b.b.y, 300); assert.equal(a.key, b.key);
  assert.deepEqual(a.stokes, b.stokes); assert.equal(b.wavelength, 450);
  near(first.escapedPower, far.escapedPower); bounded(far);
});

test('numerical coordinate guards reject unsafe input and invalid view bounds cannot poison tracing', () => {
  for (const x of [-O.COORDINATE_LIMIT, O.COORDINATE_LIMIT]) {
    const result = O.simulate([part('laser', 1, x, x, { rayCount: 1 })], { viewBounds: { x: Infinity, y: NaN, width: -1, height: 1e300 } });
    assert.equal(result.rayCount, 1); bounded(result);
  }
  for (const x of [Infinity, NaN, O.COORDINATE_LIMIT + 1, -O.COORDINATE_LIMIT - 1]) {
    const result = O.simulate([part('laser', 1, x, 0)]);
    assert.equal(result.rayCount, 0); assert.ok(result.warnings.length);
  }
});

test('all supported part defaults are accepted by the physical simulator', () => {
  const types = ['laser', 'point', 'mirror', 'concave', 'lens', 'iris', 'filter', 'polarizer', 'waveplate',
    'dichroic', 'objective', 'fiber', 'blocker', 'splitter', 'pbs', 'screen', 'camera', 'halfwave', 'phase'];
  assert.deepEqual(Object.keys(O.TYPES).sort(), types.sort());
  for (const type of types) {
    const result = O.simulate([part('laser', 1, 100, 300), part(type, 2, 400, 300)]);
    assert.ok(!result.warnings.some(warning => warning.includes('不正') || warning.includes('範囲外')), type);
    bounded(result);
  }
  assert.throws(() => O.createElement('__proto__', 1, 100, 100), /Unknown/);
});

test('new components use the requested centimetre-scale optical defaults', () => {
  assert.equal(O.createElement('laser',1,0,0).beamWidth,5);
  assert.equal(O.createElement('mirror',2,0,0).aperture,25);
  assert.equal(O.createElement('concave',3,0,0).aperture,100);
  for(const type of ['dichroic','splitter','pbs'])assert.equal(O.createElement(type,4,0,0).aperture,36,type);
  const initial=O.initialElements();assert.equal(initial[0].beamWidth,5);assert.equal(initial[1].aperture,25);
  const starter=P.create('starter');assert.equal(starter.elements[0].beamWidth,5);assert.equal(starter.elements[1].aperture,25);
});

test('laser sampling preserves selected width, wavelength, total power and detector moments', () => {
  const source = part('laser', 1, 100, 300, { beamWidth: 20, rayCount: 7, wavelength: 650, power: 3 });
  const result = O.simulate([source, part('screen', 2, 700, 300)]);
  assert.equal(result.rayCount, 7);
  assert.equal(result.segments.length, 7);
  assert.equal(result.hitCount, 7);
  for (const ray of result.segments) { near(ray.power, 3 / 7); assert.equal(ray.wavelength, 650); near(ray.b.x, 700); }
  const reading = detector(result, 2);
  near(reading.power, 3); near(reading.incidentPower, 3); near(reading.span, 20);
  near(reading.centroid.x, 700); near(reading.centroid.y, 300);
  near(reading.stokes.I, 3); near(reading.stokes.Q, 3); near(reading.powerByWavelength[650], 3);
  assert.equal(reading.acceptedHits, 7);
  bounded(result);
});

test('camera records actual front-face hit positions in its rotated sensor frame', () => {
  for (const angle of [0, 13.2, 90, 180, 270]) {
    const cam = part('camera', 2, 500, 300, { angle, pixelCount: 24 });
    const n = O.direction(angle), t = { x: -n.y, y: n.x };
    const source = part('laser', 1, cam.x-200*n.x+4*t.x, cam.y-200*n.y+4*t.y, { angle, rayCount: 1, beamWidth: 0, power: 2, wavelength: 450 });
    const result = O.simulate([source, cam]), d = detector(result, 2), frame = K.capture(cam, d);
    near(d.power, 2); assert.equal(d.samples.length, 1); near(d.samples[0].position, 4);
    assert.equal(d.samples[0].wavelength, 450); assert.equal(d.samples[0].sourceId, 1);
    near(frame.pixels[16].power, 2); near(frame.totalPower, d.power); bounded(result);
    const back = O.simulate([{ ...source, x: cam.x+200*n.x+4*t.x, y: cam.y+200*n.y+4*t.y, angle: O.normalizeAngle(angle+180) }, cam]);
    near(back.absorbedPower, 2); near(detector(back, 2).power, 0); assert.deepEqual(detector(back, 2).samples, []);
    assert.ok(back.warnings.some(w=>w.includes('裏面'))); bounded(back);
  }
});

test('camera includes both aperture endpoints, misses outside rays, and turns black when disabled or blocked', () => {
  const cam = part('camera', 2, 500, 300, { pixelCount: 24 });
  for (const h of [-12, 0, 12, 12.001]) {
    const source = part('laser', 1, 100, 300+h, { rayCount: 1, beamWidth: 0 });
    const result = O.simulate([source, cam]), frame = K.capture(cam, detector(result, 2));
    near(frame.totalPower, h <= 12 ? 1 : 0);
    if (h === -12) near(frame.pixels[0].power, 1);
    if (h === 12) near(frame.pixels[23].power, 1);
    assert.equal(K.capture({ ...cam, enabled: false }, detector(result, 2)).totalPower, 0); bounded(result);
  }
  const scene = P.create('camera-imaging'); scene.elements.push(part('blocker', 10, 600, 300, { aperture: 300 }));
  const result = O.simulate(scene.elements), frame = K.capture(scene.elements[4], result.detectors[0]);
  near(frame.totalPower, 0); near(result.absorbedPower, 3); assert.ok(frame.pixels.every(p=>p.color==='rgb(0,0,0)'));
});

test('camera imaging preset forms three inverted monochromatic point images and defocus broadens them', () => {
  const scene = P.create('camera-imaging'), before = JSON.stringify(scene), cam = scene.elements[4];
  const result = O.simulate(scene.elements), d = detector(result, 5), frame = K.capture(cam, d);
  near(d.power, 3); assert.equal(d.acceptedHits, 183); assert.equal(frame.pixels.filter(p=>p.power>0).length, 3);
  for (const [sourceId, position, wavelength] of [[1,120,450],[2,0,532],[3,-120,650]]) {
    const samples = d.samples.filter(s=>s.sourceId===sourceId); assert.equal(samples.length, 61);
    for (const sample of samples) { near(sample.position, position); assert.equal(sample.wavelength, wavelength); }
    near(samples.reduce((sum,s)=>sum+s.power,0), 1);
  }
  const defocused = P.create('camera-defocus'), blur = K.capture(defocused.elements[4], O.simulate(defocused.elements).detectors[0]);
  near(blur.totalPower, 3); assert.ok(blur.pixels.filter(p=>p.power>0).length > 15); assert.ok(blur.peakPower < frame.peakPower/4);
  assert.equal(JSON.stringify(scene), before); bounded(result);
});

test('camera cropping and displacement change the received image rather than painting a preset picture', () => {
  const scene = P.create('camera-imaging'), cam = scene.elements[4]; cam.aperture = 80;
  let result = O.simulate(scene.elements), d = result.detectors[0]; near(d.power, 1); near(result.escapedPower, 2);
  assert.ok(d.samples.every(s=>s.wavelength===532)); bounded(result);
  cam.y += 120; result = O.simulate(scene.elements); d = result.detectors[0]; near(d.power, 1);
  assert.ok(d.samples.every(s=>s.wavelength===450));
  assert.ok(d.samples.every(s=>Math.abs(s.position)<1e-8)); bounded(result);
});

test('camera brightness, color mixing and clipping are display-only and do not alter measured power', () => {
  const cam = part('camera', 1, 500, 300, { autoExposure: false, exposure: 1, pixelCount: 24 });
  const d = { samples: [{ position: 0, power: .25, wavelength: 450 }, { position: 0, power: .75, wavelength: 650 }] };
  const before = JSON.stringify(d), frame = K.capture(cam, d), gain = K.capture({ ...cam, exposure: 10 }, d);
  near(frame.totalPower, 1); near(gain.totalPower, 1); assert.equal(frame.clippedPixels, 0); assert.equal(gain.clippedPixels, 1);
  assert.notEqual(frame.pixels[12].color, gain.pixels[12].color);
  const dim = { samples: d.samples.map(s=>({ ...s, power:s.power/10 })) };
  assert.notEqual(K.capture(cam, dim).pixels[12].color, frame.pixels[12].color);
  assert.equal(K.capture({ ...cam, autoExposure:true }, dim).pixels[12].color, frame.pixels[12].color);
  assert.equal(JSON.stringify(d), before);
  const uv = K.capture(cam, { samples:[{ position:0, power:.3, wavelength:1064 }] }); near(uv.nonvisiblePower, .3);
});

test('camera pixel resolution redistributes the same finite ray power without inventing extra samples', () => {
  const scene = P.create('camera-defocus'), cam = scene.elements[4], d = O.simulate(scene.elements).detectors[0];
  for (const pixelCount of [16, 256, 1024]) {
    const frame = K.capture({ ...cam, pixelCount }, d); assert.equal(frame.pixels.length, pixelCount);
    assert.equal(frame.hits, 183); near(frame.pixels.reduce((sum,p)=>sum+p.power,0), 3); near(frame.pitch, cam.aperture/pixelCount);
  }
  for (const pixelCount of [-1, 1, 1025, 1e9, 16.5, NaN]) assert.throws(()=>K.capture({ ...cam, pixelCount }, d));
});

test('camera SVG exports the calculated sensor colors, calibrated positions and escaped titles', () => {
  const cam = part('camera', 1, 500, 300), frame = K.capture(cam, { samples: [{ position:0,power:1,wavelength:532 }] });
  const svg = K.svg(frame, '</title><script>alert(1)</script>', 'cm');
  assert.match(svg, /&lt;\/title&gt;&lt;script&gt;/); assert.ok(!svg.includes('<script>'));
  assert.match(svg, /1D/); assert.match(svg, /-1.2 cm/); assert.match(svg, /1.2 cm/);
  assert.ok(svg.includes(frame.pixels[128].color)); assert.ok(!/NaN|Infinity/.test(svg));
  assert.ok(!/NaN|Infinity/.test(K.svg(K.capture(cam), 'empty')));
});

test('concave mirrors intersect the spherical cap and obey the local reflection law with spherical aberration', () => {
  const mirror = part('concave', 2, 500, 300, { focal: 100, aperture: 100 });
  const radius = 200;
  for (const height of [1, 10, 45]) {
    const result = O.simulate([part('laser', 1, 100, 300 + height, { beamWidth: 0, rayCount: 1, power: 2, polarization: 'left' }), mirror]);
    assert.equal(result.hitCount, 1); assert.equal(result.segments.length, 2);
    const incoming = result.segments[0], outgoing = result.segments[1];
    const axial = Math.sqrt(radius * radius - height * height);
    near(incoming.b.x, mirror.x - radius + axial); near(incoming.b.y, mirror.y + height);
    const distance = Math.hypot(outgoing.b.x - outgoing.a.x, outgoing.b.y - outgoing.a.y);
    const dx = (outgoing.b.x - outgoing.a.x) / distance, dy = (outgoing.b.y - outgoing.a.y) / distance;
    near(dx, 1 - 2 * (axial / radius) ** 2); near(dy, -2 * axial * height / radius ** 2);
    const focusX = outgoing.a.x - height * dx / dy;
    near(focusX, mirror.x - radius + radius ** 2 / (2 * axial));
    assert.ok(focusX > mirror.x - mirror.focal); // Marginal rays focus nearer the vertex.
    assert.deepEqual(incoming.stokes, outgoing.stokes); near(outgoing.stokes.V, -2);
    near(result.escapedPower, 2); bounded(result);
  }
});

test('concave geometry follows arbitrary rotation and very large positive or negative translations', () => {
  for (const shift of [0, 9e8, -9e8]) for (const angle of [0, 22.5, 93.2, 180, 270]) {
    const axis = O.direction(angle), tangent = { x: -axis.y, y: axis.x };
    const mirror = part('concave', 2, shift + 500, -shift + 300, { angle, focal: 100, aperture: 100 });
    const source = part('laser', 1, mirror.x - 300 * axis.x + 10 * tangent.x, mirror.y - 300 * axis.y + 10 * tangent.y,
      { angle, beamWidth: 0, rayCount: 1 });
    const result = O.simulate([source, mirror]); assert.equal(result.hitCount, 1); assert.equal(result.truncated, false);
    const hit = result.segments[0].b, dx = hit.x - mirror.x, dy = hit.y - mirror.y;
    near(dx * axis.x + dy * axis.y, Math.sqrt(200 ** 2 - 10 ** 2) - 200, 2e-6);
    near(dx * tangent.x + dy * tangent.y, 10, 2e-6);
    near(result.escapedPower, 1); bounded(result);
  }
});

test('concave cap rejects the other circle hemisphere and aperture misses, and respects surface order', () => {
  const mirror = part('concave', 2, 500, 300, { focal: 100, aperture: 100 });
  const arc = O.concaveGeometry(mirror), axis = O.direction(0);
  assert.equal(O.intersectConcave({ x: 100, y: 351 }, axis, arc), null);
  assert.equal(O.intersectConcave({ x: 500, y: 300 }, axis, arc), null);
  const rim = O.intersectConcave({ x: 100, y: 350 }, axis, arc);
  near(rim.point.x, 500 - arc.sag); near(rim.point.y, 350);
  const source = part('laser', 1, 100, 310, { beamWidth: 0, rayCount: 1 });
  const first = O.simulate([source, mirror]); assert.ok(first.segments[0].b.x > 490);
  const behind = part('screen', 3, 500, 310, { aperture: 2 });
  near(detector(O.simulate([source, behind, mirror]), 3).power, 0);
  const before = O.simulate([source, mirror, { ...behind, x: 450 }]);
  near(detector(before, 3).power, 1); assert.equal(before.hitCount, 1);
  const missed = O.simulate([{ ...source, y: 351 }, mirror, part('screen', 4, 600, 351)]);
  near(detector(missed, 4).power, 1);
});

test('concave front reflects while the back absorbs, and disabling restores transmission', () => {
  for (const angle of [0, 180]) {
    const axis = O.direction(angle), mirror = part('concave', 2, 500, 300, { angle });
    const source = part('laser', 1, 500 + 200 * axis.x, 300 + 200 * axis.y, { angle: O.normalizeAngle(angle + 180), rayCount: 1, beamWidth: 0 });
    const result = O.simulate([source, mirror]); near(result.absorbedPower, 1); near(result.escapedPower, 0);
    assert.equal(result.hitCount, 1); assert.ok(result.warnings.some(s => s.includes('裏面'))); bounded(result);
    const disabled = O.simulate([source, { ...mirror, enabled: false }]); near(disabled.escapedPower, 1); assert.equal(disabled.hitCount, 0);
    const legacy = O.traceRay(source, O.direction(source.angle), [mirror]);
    assert.deepEqual(legacy.hits, [2]); assert.equal(legacy.points.length, 2);
  }
});

test('a deep concave cap can reflect repeatedly on itself without false zero-length hits', () => {
  for (const shift of [0, 9e8, -9e8]) {
    const source = part('laser', 1, shift + 100, -shift + 395, { rayCount: 1, beamWidth: 0 });
    const mirror = part('concave', 2, shift + 500, -shift + 300, { focal: 50, aperture: 199 });
    const result = O.simulate([source, mirror], { recordPaths: true });
    assert.equal(result.hitCount, 5); assert.equal(result.truncated, false); assert.deepEqual(result.warnings, []);
    assert.equal(new Set(result.segments.map(s => s.key)).size, 6);
    for (const segment of result.segments) assert.ok(Math.hypot(segment.b.x - segment.a.x, segment.b.y - segment.a.y) > 60);
    near(result.escapedPower, 1); bounded(result);
    const limited = O.simulate([source, mirror], { maxInteractions: 2 });
    assert.equal(limited.hitCount, 2); assert.equal(limited.truncated, true); near(limited.discardedPower, 1); bounded(limited);
  }
});

test('distant sources do not lose the small spherical-cap intersection by squared-distance cancellation', () => {
  const mirror = part('concave', 2, 5e8, 300, { focal: 1, aperture: 2 });
  const source = part('laser', 1, -5e8, 300.5, { rayCount: 1, beamWidth: 0 });
  const result = O.simulate([source, mirror]); assert.equal(result.hitCount, 1);
  near(result.segments[0].b.x - mirror.x, Math.sqrt(4 - .25) - 2, 1e-6);
  near(result.segments[0].b.y, 300.5); assert.equal(result.truncated, false); bounded(result);
});

test('overlap detection uses actual curved arcs for straight surfaces and other spherical caps', () => {
  const mirror = part('concave', 1, 500, 300, { focal: 50, aperture: 190 });
  const x = 400 + Math.sqrt(100 ** 2 - 80 ** 2);
  assert.equal(O.overlapping([mirror, part('blocker', 2, x, 380, { aperture: 2 })]), true);
  assert.equal(O.overlapping([mirror, part('blocker', 2, 500, 380, { aperture: 2 })]), false);
  // Crossing at the upper/lower cap, although their vertex planes are distinct.
  const other = part('concave', 2, 490, 340, { focal: 50, aperture: 190 });
  assert.equal(O.overlapping([mirror, other]), true);
  assert.equal(O.overlapping([mirror, { ...other, x: 800 }]), false);
  assert.equal(O.overlapping([mirror, { ...other, enabled: false }]), false);
  // Same sphere, overlapping arcs with different vertex angles.
  const rotated = part('concave', 3, 400 + 100 * Math.cos(Math.PI / 6), 350, { focal: 50, aperture: 100, angle: 30 });
  assert.equal(O.overlapping([mirror, rotated]), true);
  const opposite = part('concave', 3, 300, 300, { focal: 50, aperture: 100, angle: 180 });
  assert.equal(O.overlapping([mirror, opposite]), false);
});

test('concave focusing preset collects the return beam and exposes spherical aberration and defocus', () => {
  const scene = P.create('concave-focus'), before = JSON.stringify(scene);
  const result = O.simulate(scene.elements), reading = detector(result, 5);
  near(reading.power, .25); assert.equal(reading.hits, 17); near(reading.span, .0093882005523);
  near(result.absorbedPower, .5); near(result.escapedPower, .25); assert.deepEqual(result.warnings, []); bounded(result);
  assert.equal(JSON.stringify(scene), before);
  // Stay inside the common 100 mm BS aperture so this isolates mirror aberration.
  const widened = O.simulate(scene.elements.map(e => e.type === 'laser' ? { ...e, beamWidth: 60 } : e));
  assert.ok(detector(widened, 5).span > 8 * reading.span); near(detector(widened, 5).power, .25); bounded(widened);
  const overfilled = O.simulate(scene.elements.map(e => e.type === 'laser' ? { ...e, beamWidth: 90 } : e));
  // Four marginal rays bypass the BS on entry, then meet it on return.
  near(detector(overfilled, 5).power, 21 / 68); bounded(overfilled);
  const defocused = O.simulate(scene.elements.map(e => e.type === 'concave' ? { ...e, focal: 400 } : e));
  assert.ok(detector(defocused, 5).span > 7); near(detector(defocused, 5).power, .25);
});

test('point-source power is normalized within its finite fan; a full circle has no duplicate ray', () => {
  const source = part('point', 1, 100, 300, { rayCount: 9, divergence: 30, power: 2 });
  const result = O.simulate([source, part('screen', 2, 400, 300, { aperture: 300 })]);
  const reading = detector(result, 2);
  near(reading.power, 2); near(reading.span, 600 * Math.tan(15 * Math.PI / 180));
  near(reading.stokes.Q, 0); near(reading.stokes.U, 0); near(reading.stokes.V, 0);
  assert.ok(result.segments.every(ray => ray.a.x === 100 && ray.a.y === 300));
  const circle = O.simulate([part('point', 1, 500, 300, { rayCount: 8, divergence: 360 })]);
  const angles = circle.segments.map(ray => Math.atan2(ray.b.y - ray.a.y, ray.b.x - ray.a.x).toFixed(6));
  assert.equal(new Set(angles).size, 8);
  near(circle.escapedPower, 1);
  const single = O.simulate([part('point', 1, 500, 300, { rayCount: 1, angle: 30 })]);
  const ray = single.segments[0];
  near((ray.b.y - ray.a.y) / (ray.b.x - ray.a.x), Math.tan(Math.PI / 6));
  bounded(result); bounded(circle); bounded(single);
});

test('blockers and screens terminate rays; a finite blocker permits rays outside its body', () => {
  const source = part('laser', 1, 100, 300, { beamWidth: 20, rayCount: 5 });
  const stop = part('blocker', 2, 400, 300, { aperture: 12 });
  const screen = part('screen', 3, 600, 300);
  const result = O.simulate([source, stop, screen]);
  near(detector(result, 3).power, 2 / 5); near(result.absorbedPower, 3 / 5);
  assert.equal(result.segments.filter(ray => ray.hitId === 2).length, 3);
  assert.ok(result.segments.every(ray => ray.b.x <= 600));
  const all = O.simulate([source, { ...stop, aperture: 100 }, screen]);
  near(detector(all, 3).power, 0); near(all.absorbedPower, 1);
  assert.equal(all.segments.length, 5);
  bounded(result); bounded(all);
});

test('iris opening clips its actual ray heights and zero opening blocks even the center ray', () => {
  const source = part('laser', 1, 100, 300, { beamWidth: 20, rayCount: 5 });
  for (const [opening, transmitted] of [[0, 0], [5, 0.2], [10, 0.6], [20, 1]]) {
    const result = O.simulate([source, part('iris', 2, 400, 300, { opening }), part('screen', 3, 600, 300)]);
    near(detector(result, 3).power, transmitted);
    near(result.absorbedPower, 1 - transmitted);
    bounded(result);
  }
});

test('simulator lenses conserve power at a focus, reverse focus and diverging plane', () => {
  for (const [focal, sourceX, sourceAngle, screenX, expectedSpan] of
    [[100, 100, 0, 500, 0], [100, 700, 180, 300, 0], [-100, 100, 0, 500, 40]]) {
    const result = O.simulate([
      part('laser', 1, sourceX, 300, { angle: sourceAngle, beamWidth: 20 }),
      part('lens', 2, 400, 300, { focal }), part('screen', 3, screenX, 300)
    ]);
    const reading = detector(result, 3);
    near(reading.power, 1); near(reading.span, expectedSpan); near(reading.centroid.y, 300);
    bounded(result);
  }
});

test('ideal polarizer follows Malus law for arbitrary axes and transmits half of unpolarized light', () => {
  for (let sourceAngle = 0; sourceAngle < 180; sourceAngle += 15) {
    for (let axisAngle = 0; axisAngle < 180; axisAngle += 22.5) {
      const before = O.sourceStokes({ polarization: 'linear', polAngle: sourceAngle, power: 2 });
      const after = O.polarize(before, axisAngle);
      near(after.I, 2 * Math.cos((sourceAngle - axisAngle) * Math.PI / 180) ** 2);
      near(Math.hypot(after.Q, after.U, after.V), after.I);
      near(after.V, 0);
    }
  }
  const after = O.polarize(O.sourceStokes({ polarization: 'unpolarized', power: 3 }), 35);
  near(after.I, 1.5);
  near(O.polarize(O.sourceStokes({ polAngle: 0, power: 1 }), 90).I, 0);
});

test('polarizer spin is independent of its placement angle and sequential losses are accounted', () => {
  const source = part('laser', 1, 100, 300, { rayCount: 1 });
  const first = part('polarizer', 2, 300, 300, { angle: 22.5, axisAngle: 45 });
  const second = part('polarizer', 3, 500, 300, { angle: 45, axisAngle: 90 });
  const result = O.simulate([source, first, second, part('screen', 4, 700, 300)]);
  const reading = detector(result, 4);
  near(reading.power, 0.25); near(reading.stokes.Q, -0.25); near(result.absorbedPower, 0.75);
  assert.deepEqual(result.segments.map(ray => ray.hitId), [2, 3, 4]);
  near(result.segments[0].power, 1); near(result.segments[1].power, 0.5); near(result.segments[2].power, 0.25);
  bounded(result);
});

test('QWP signs follow the documented local Stokes convention and two QWPs form a half-wave plate', () => {
  const plusU = O.sourceStokes({ polarization: 'linear', polAngle: 45, power: 1 });
  const circular = O.retard(plusU, 0, Math.PI / 2);
  near(circular.Q, 0); near(circular.U, 0); near(circular.V, -1);
  near(O.sourceStokes({ polarization: 'right', power: 1 }).V, 1);
  near(O.sourceStokes({ polarization: 'left', power: 1 }).V, -1);
  const horizontal = O.sourceStokes({ polarization: 'linear', polAngle: 0, power: 1 });
  const first = O.retard(horizontal, 45, Math.PI / 2);
  near(first.Q, 0); near(first.U, 0); near(first.V, 1);
  const second = O.retard(first, 45, Math.PI / 2);
  near(second.Q, -1); near(second.U, 0); near(second.V, 0);
  assert.deepEqual(O.retard({ I: 2, Q: 0, U: 0, V: 0 }, 27, Math.PI / 2), { I: 2, Q: 0, U: 0, V: 0 });
});

test('retarders conserve total and polarized intensity and invert for arbitrary partial polarization', () => {
  const input = { I: 2, Q: 0.5, U: 1, V: 0.4 };
  for (const angle of [0, 17, 45, 90, 123, 270]) for (const phase of [0, 0.2, Math.PI / 2, Math.PI, 5.1]) {
    const output = O.retard(input, angle, phase);
    near(output.I, input.I);
    near(Math.hypot(output.Q, output.U, output.V), Math.hypot(input.Q, input.U, input.V));
    const restored = O.retard(output, angle, -phase);
    for (const key of ['I', 'Q', 'U', 'V']) near(restored[key], input[key]);
  }
});

test('waveplate retardance scales with design wavelength and the detector reports its output Stokes', () => {
  for (const wavelength of [532, 1064]) {
    const result = O.simulate([
      part('laser', 1, 100, 300, { wavelength }),
      part('waveplate', 2, 400, 300, { designWavelength: 532, axisAngle: 45 }),
      part('screen', 3, 600, 300)
    ]);
    const after = detector(result, 3).stokes;
    const phase = Math.PI / 2 * 532 / wavelength;
    near(after.I, 1); near(after.Q, Math.cos(phase)); near(after.U, 0); near(after.V, Math.sin(phase));
    bounded(result);
  }
});

test('ideal mirrors preserve local Stokes as the documented coating-phase approximation', () => {
  const result = O.simulate([
    part('laser', 1, 100, 300, { polarization: 'right', rayCount: 1 }),
    part('mirror', 2, 400, 300), part('screen', 3, 400, 100, { angle: 90 })
  ]);
  near(detector(result, 3).stokes.V, 1); near(detector(result, 3).power, 1);
  bounded(result);
});

test('source bands use uniform midpoint samples and preserve the monochromatic limit', () => {
  assert.deepEqual(O.sourceBand({wavelength:532,wavelengthWidth:20}),{min:522,max:542});
  assert.deepEqual(O.sourceSpectrum({wavelength:532}),[{wavelength:532,weight:1}]);
  assert.deepEqual(O.sourceSpectrum({wavelength:550,wavelengthWidth:300,spectralSamples:3}),
    [450,550,650].map(wavelength=>({wavelength,weight:1/3})));
  for (const spectralSamples of [3,17,30,61]) {
    const spectrum=O.sourceSpectrum({wavelength:1350,wavelengthWidth:2300,spectralSamples});
    assert.equal(spectrum.length,spectralSamples); near(spectrum.reduce((s,p)=>s+p.weight,0),1);
    near(spectrum.reduce((s,p)=>s+p.wavelength*p.weight,0),1350);
    assert.ok(spectrum.every(p=>p.wavelength>200 && p.wavelength<2500));
  }
  for (const changes of [{wavelengthWidth:-1},{wavelengthWidth:Infinity},{wavelength:200,wavelengthWidth:1},
    {wavelengthWidth:1e-15},{spectralSamples:2},{spectralSamples:62},{spectralSamples:3.5},{spectralSamples:1e12}]) {
    assert.throws(()=>O.sourceSpectrum({wavelength:550,wavelengthWidth:300,spectralSamples:17,...changes}));
  }
});

test('laser and point spectra repeat the spatial samples without multiplying total power', () => {
  for (const type of ['laser','point']) for (const spectralSamples of [3,17,61]) {
    const source=part(type,1,100,300,{power:2.4,rayCount:5,beamWidth:20,divergence:10,
      wavelength:550,wavelengthWidth:300,spectralSamples,polarization:'right'});
    const result=O.simulate([source]); assert.equal(result.rayCount,5*spectralSamples);
    near(result.sourcePower,2.4); near(result.escapedPower,2.4); assert.equal(result.truncated,false);
    const wavelengths=O.sourceSpectrum(source);
    for (const sample of wavelengths) {
      const segments=result.segments.filter(s=>s.wavelength===sample.wavelength);
      assert.equal(segments.length,5); near(segments.reduce((s,p)=>s+p.power,0),2.4/spectralSamples);
      for(const s of segments)near(s.stokes.V/s.stokes.I,1);
    }
    assert.equal(new Set(result.segments.map(s=>s.key)).size,result.segments.length); bounded(result);
  }
  const modern=part('laser',1,100,300,{spectralSamples:61}), legacy={...modern};
  delete legacy.wavelengthWidth; delete legacy.spectralSamples;
  assert.deepEqual(O.simulate([modern]),O.simulate([legacy]));
});

test('broadband filter preset has measured spectral throughput and a monochromatic limit', () => {
  const scene=P.create('broadband-filter'), [source,filter,camera]=scene.elements;
  for(const [filterMode,power,hits] of [['bandpass',.2,54],['longpass',1/3,90],['shortpass',2/3,180],['nd',.1,270]]) {
    filter.filterMode=filterMode;
    const result=O.simulate(scene.elements), received=detector(result,camera.id);
    near(received.power,power); assert.equal(received.acceptedHits,hits); near(result.absorbedPower,1-power);
    const frame=K.capture(camera,received); near(frame.totalPower,power); assert.equal(frame.hits,hits);
    assert.equal(result.warnings.length,0); bounded(result);
  }
  filter.filterMode='bandpass'; source.wavelengthWidth=0;
  const mono=O.simulate(scene.elements); near(detector(mono,3).power,1); assert.equal(detector(mono,3).acceptedHits,9);
  source.wavelengthWidth=300; filter.bandLow=500; filter.bandHigh=501;
  // A narrow band between sample wavelengths is not integrated analytically.
  near(detector(O.simulate(scene.elements),3).power,0);
});

test('each wavelength sees its own waveplate retardance and dichroic output', () => {
  const source=part('laser',1,100,300,{rayCount:1,wavelength:550,wavelengthWidth:300,spectralSamples:3});
  const plate=part('waveplate',2,250,300,{axisAngle:45,designWavelength:532});
  const scene=[source,plate,part('dichroic',3,400,300,{cutoff:600}),part('screen',4,700,300),part('screen',5,400,100,{angle:90})];
  const result=O.simulate(scene);
  assert.deepEqual(Object.keys(detector(result,4).powerByWavelength),['650']);
  assert.deepEqual(Object.keys(detector(result,5).powerByWavelength),['450','550']);
  for(const sample of O.sourceSpectrum(source)) {
    const segment=result.segments.find(s=>s.wavelength===sample.wavelength && Math.abs(s.a.x-250)<1e-6);
    assert.ok(segment); near(segment.stokes.Q,Math.cos(Math.PI/2*532/sample.wavelength)/3);
    near(segment.stokes.V,Math.sin(Math.PI/2*532/sample.wavelength)/3);
  }
  bounded(result);
});

test('fiber transfer retains the full source spectrum and camera adds its colors by power', () => {
  const source=part('laser',1,100,300,{rayCount:1,beamWidth:0,wavelength:550,wavelengthWidth:300,spectralSamples:3});
  const camera=part('camera',4,800,300,{autoExposure:false});
  const result=O.simulate([source,part('fiber',2,300,300),part('fiber',3,600,300,{angle:180}),camera],{fiberLinks:[{a:2,b:3}]});
  const received=detector(result,4); near(received.power,1);
  assert.deepEqual(Object.keys(received.powerByWavelength),['450','550','650']);
  const frame=K.capture(camera,received), pixel=frame.pixels.find(p=>p.power>0);
  const monochrome=K.capture(camera,{samples:[{position:0,power:1,wavelength:550}]});
  assert.notEqual(pixel.color,monochrome.pixels.find(p=>p.power>0).color);
  const individual=[450,550,650].map(wavelength=>K.capture(camera,{samples:[{position:0,power:1/3,wavelength}]}).pixels.find(p=>p.power>0));
  pixel.rgb.forEach((value,i)=>near(value,individual.reduce((sum,p)=>sum+p.rgb[i],0)));
  bounded(result);
});

test('spectral emission and segment budgets retain an explicit power ledger', () => {
  const source=part('laser',1,100,300,{wavelengthWidth:100,spectralSamples:61,rayCount:61});
  for(const options of [{maxRays:7},{maxSegments:11},{maxRays:1,maxSegments:1}]) {
    const result=O.simulate([source],options); assert.equal(result.truncated,true);
    assert.ok(result.discardedPower>0); near(result.sourcePower,1); bounded(result);
  }
  for(const patch of [{enabled:false},{power:0}])assert.equal(O.simulate([{...source,...patch}]).rayCount,0);
  for(const patch of [{wavelengthWidth:-1},{wavelengthWidth:700},{spectralSamples:2},{spectralSamples:3.5}]) {
    const result=O.simulate([{...source,...patch}]); assert.equal(result.rayCount,0);
    assert.ok(result.warnings.length); bounded(result);
  }
});

test('nonzero bandwidth explicitly stops interference instead of treating the band as its center', () => {
  const scene=P.create('mach-zehnder'), source=scene.elements.find(e=>e.type==='laser'), phase=scene.elements.find(e=>e.type==='phase');
  source.wavelengthWidth=20;
  const analysis=coherent(scene,phase.id); assert.equal(analysis.valid,false); assert.match(analysis.message,/波長幅/);
  bounded(O.simulate(scene.elements)); source.wavelengthWidth=0; assert.equal(coherent(scene,phase.id).valid,true);
  const extra=part('laser',99,50,50,{wavelengthWidth:20,beamWidth:0,rayCount:1,enabled:false}); scene.elements.push(extra);
  assert.equal(coherent(scene,phase.id).valid,true); extra.enabled=true; extra.power=0;
  assert.equal(coherent(scene,phase.id).valid,true);
});

test('spectral filters include exact band edges and absorb rejected wavelengths without reflected rays', () => {
  for (const filterMode of ['longpass', 'shortpass', 'bandpass']) {
    const filter = part('filter', 2, 400, 300, { filterMode, cutoff: 550, bandLow: 500, bandHigh: 560, transmission: .73, angle: 22.5 });
    for (const wavelength of [200, 499.999, 500, 532, 549.999, 550, 550.001, 560, 560.001, 2500]) {
      const passes = filterMode === 'longpass' ? wavelength >= 550 : filterMode === 'shortpass' ? wavelength <= 550 : wavelength >= 500 && wavelength <= 560;
      const result = O.simulate([part('laser', 1, 100, 300, { wavelength, rayCount: 1, beamWidth: 0 }), filter, part('screen', 3, 700, 300)]);
      near(O.filterTransmission(filter, wavelength), passes ? .73 : 0);
      near(detector(result, 3).power, passes ? .73 : 0);
      near(result.absorbedPower, passes ? .27 : 1); near(result.escapedPower, 0);
      assert.ok(result.segments.every(s => s.b.x > s.a.x && s.b.y === s.a.y));
      bounded(result);
    }
  }
});

test('ND optical densities add on stacking and preserve normalized Stokes across wavelengths', () => {
  for (const wavelength of [200, 450, 532, 650, 1064, 2500]) for (const polarization of ['linear', 'right', 'left', 'unpolarized']) {
    const source = part('laser', 1, 100, 300, { wavelength, polarization, polAngle: 31.2, power: 2.5, rayCount: 1 });
    const result = O.simulate([source,
      part('filter', 2, 300, 300, { filterMode: 'nd', opticalDensity: .3, transmission: 0 }),
      part('filter', 3, 500, 300, { filterMode: 'nd', opticalDensity: .7, transmission: .4 }), part('screen', 4, 700, 300)]);
    const expected = O.sourceStokes(source), received = detector(result, 4);
    for (const key of ['I', 'Q', 'U', 'V']) near(received.stokes[key], expected[key] * .1);
    near(received.power, .25); near(result.absorbedPower, 2.25); bounded(result);
  }
  for (const opticalDensity of [0, 1, 2, 6]) {
    const filter = part('filter', 2, 400, 300, { filterMode: 'nd', opticalDensity });
    const result = O.simulate([part('laser', 1, 100, 300), filter, part('screen', 3, 700, 300)]);
    near(detector(result, 3).power, 10 ** -opticalDensity); bounded(result);
  }
});

test('filter geometry is reciprocal and finite, and disabling bypasses wavelength blocking', () => {
  for (const reverse of [false, true]) for (const [offset, enabled, transmission, expected] of [[0,true,.4,.4],[11,true,.4,1],[0,false,0,1],[0,true,0,0]]) {
    const source = part('laser', 1, reverse ? 700 : 100, 300 + offset, { angle: reverse ? 180 : 0, rayCount: 1, beamWidth: 0 });
    const filter = part('filter', 2, 400, 300, { aperture: 20, enabled, transmission });
    const result = O.simulate([source, filter, part('screen', 3, reverse ? 100 : 700, 300)]);
    near(detector(result, 3).power, expected); near(result.absorbedPower, 1 - expected); bounded(result);
  }
});

test('filter preset selects measured colors and ND reduces all three camera samples', () => {
  const scene = P.create('spectral-filter'), filter = scene.elements.find(e => e.type === 'filter');
  for (const [filterMode, power, wavelengths] of [['bandpass',1,['532']],['longpass',1,['650']],['shortpass',2,['450','532']],['nd',.3,['450','532','650']]]) {
    filter.filterMode = filterMode;
    const result = O.simulate(scene.elements), received = detector(result, 5);
    near(received.power, power); near(result.sourcePower, 3); near(result.absorbedPower, 3 - power);
    assert.deepEqual(Object.keys(received.powerByWavelength), wavelengths); assert.equal(result.warnings.length, 0); bounded(result);
  }
});

test('invalid filter parameters are excluded by the simulator without breaking energy accounting', () => {
  for (const changes of [{filterMode:'not-a-filter'},{opticalDensity:-1},{opticalDensity:6.1},{bandLow:NaN},{bandHigh:2501},{bandLow:560,bandHigh:560},{bandLow:650,bandHigh:500}]) {
    const result = O.simulate([part('laser',1,100,300),part('filter',2,400,300,changes),part('screen',3,700,300)]);
    near(detector(result,3).power,1); assert.ok(result.warnings.some(w => /不正|範囲外/.test(w))); bounded(result);
  }
});

test('longpass and shortpass dichroics route the correct wavelengths without power loss', () => {
  const green = part('laser', 1, 100, 300, { wavelength: 532, power: 2, rayCount: 1 });
  const red = part('laser', 2, 100, 300, { wavelength: 650, power: 3, rayCount: 1 });
  for (const mode of ['longpass', 'shortpass']) {
    const result = O.simulate([green, red, part('dichroic', 3, 400, 300, { cutoff: 600, mode }),
      part('screen', 4, 700, 300), part('screen', 5, 400, 100, { angle: 90 })]);
    near(detector(result, 4).power, mode === 'longpass' ? 3 : 2);
    near(detector(result, 5).power, mode === 'longpass' ? 2 : 3);
    assert.deepEqual(Object.keys(detector(result, 4).powerByWavelength), [mode === 'longpass' ? '650' : '532']);
    assert.equal(result.truncated, false);
    bounded(result);
  }
});

test('the exact dichroic cutoff is transmitted in either mode', () => {
  for (const mode of ['longpass', 'shortpass']) {
    const result = O.simulate([part('laser', 1, 100, 300, { wavelength: 600, rayCount: 1 }),
      part('dichroic', 2, 400, 300, { cutoff: 600, mode }), part('screen', 3, 700, 300)]);
    near(detector(result, 3).power, 1);
    bounded(result);
  }
});

test('beam splitter branch powers and Stokes add to the incident values at all ratios', () => {
  for (const transmission of [0, 0.3, 0.5, 1]) {
    const result = O.simulate([
      part('laser', 1, 100, 300, { power: 2, polarization: 'right', rayCount: 1 }),
      part('splitter', 2, 400, 300, { transmission }),
      part('screen', 3, 700, 300), part('screen', 4, 400, 100, { angle: 90 })
    ]);
    near(detector(result, 3).power, 2 * transmission);
    near(detector(result, 4).power, 2 * (1 - transmission));
    near(detector(result, 3).stokes.V + detector(result, 4).stokes.V, 2);
    near(result.segments[0].power, 2);
    assert.equal(result.truncated, false);
    bounded(result);
  }
});

test('fiber requires the ray to hit its core and reports rejected aperture power separately', () => {
  const result = O.simulate([
    part('laser', 1, 100, 300, { beamWidth: 4, rayCount: 5 }),
    part('fiber', 2, 400, 300, { coreDiameter: 2 })
  ]);
  const reading = detector(result, 2);
  near(reading.power, 0.6); near(reading.acceptedPower, 0.6); near(reading.incidentPower, 1);
  assert.equal(reading.hits, 5); assert.equal(reading.acceptedHits, 3);
  near(reading.span, 2); near(reading.centroid.y, 300);
  near(reading.stokes.I, 0.6); near(result.absorbedPower, 0.4);
  assert.equal(result.segments.length, 5);
  bounded(result);
});

test('fiber acceptance uses sin of incidence angle in air and only the entrance side', () => {
  const source = part('laser', 1, 100, 300 - 300 * Math.tan(10 * Math.PI / 180), { angle: 10, rayCount: 1 });
  for (const [na, expected] of [[0.2, 1], [0.1, 0]]) {
    const result = O.simulate([source, part('fiber', 2, 400, 300, { na })]);
    near(detector(result, 2).power, expected);
    bounded(result);
  }
  const reverse = part('laser', 1, 700, 300, { angle: 180, rayCount: 1 });
  for (const [angle, expected] of [[0, 0], [180, 1]]) {
    const result = O.simulate([reverse, part('fiber', 2, 400, 300, { angle })]);
    near(detector(result, 2).power, expected);
    bounded(result);
  }
});

test('objective NA clips rays outside the approximate acceptance cone', () => {
  const source = part('laser', 1, 100, 300, { beamWidth: 20, rayCount: 5 });
  for (const [na, expected] of [[0.25, 0.6], [1, 1]]) {
    const result = O.simulate([source, part('objective', 2, 400, 300, { focal: 20, na }),
      part('screen', 3, 500, 300)]);
    near(detector(result, 3).power, expected);
    assert.equal(result.warnings.some(warning => warning.includes('NA')), na === 0.25);
    bounded(result);
  }
});

test('disabled sources and disabled blockers do not emit or intercept rays', () => {
  const source = part('laser', 1, 100, 300);
  const stop = part('blocker', 2, 400, 300, { enabled: false });
  const screen = part('screen', 3, 600, 300);
  const live = O.simulate([source, stop, screen]);
  near(detector(live, 3).power, 1);
  const dark = O.simulate([{ ...source, enabled: false }, stop, screen]);
  assert.equal(dark.rayCount, 0); assert.equal(dark.segments.length, 0);
  near(detector(dark, 3).power, 0);
  const zero = O.simulate([{ ...source, power: 0 }, screen]);
  assert.equal(zero.rayCount, 0);
  bounded(live); bounded(dark); bounded(zero);
});

test('invalid parameters and duplicate IDs are excluded explicitly without nonfinite rays', () => {
  const source = part('laser', 1, 100, 300, { rayCount: 1 });
  const invalid = [null, { type: '__proto__', id: 9, x: 300, y: 300 },
    part('mirror', 1, 400, 300), part('lens', 3, 400, 300, { focal: 0 }),
    part('laser', 4, Infinity, 300), part('point', 5, 200, 300, { rayCount: 1e9 }),
    part('iris', 6, 400, 300, { aperture: 2, opening: 3 }),
    part('fiber', 7, 400, 300, { coreDiameter: 100, aperture: 50 })];
  const result = O.simulate([source, ...invalid, part('screen', 8, 700, 300)]);
  near(detector(result, 8).power, 1);
  assert.ok(result.warnings.length >= 1);
  assert.equal(result.rayCount, 1);
  assert.deepEqual(result.segments.map(ray => ray.hitId), [8]);
  assert.equal(O.simulate(null).segments.length, 0);
  bounded(result);
});

test('interaction, segment and emission caps bound tracing and account for omitted power', () => {
  const source = part('laser', 1, 500, 300, { rayCount: 1 });
  const cavity = O.simulate([source, part('mirror', 2, 250, 300, { angle: 180 }),
    part('mirror', 3, 750, 300, { angle: 0 })]);
  assert.equal(cavity.hitCount, O.MAX_INTERACTIONS);
  assert.equal(cavity.truncated, true); near(cavity.discardedPower, 1);
  const samples = part('laser', 1, 100, 300, { rayCount: 9 });
  const lines = O.simulate([samples], { maxSegments: 3 });
  assert.equal(lines.segments.length, 3); assert.equal(lines.truncated, true);
  near(lines.escapedPower, 1 / 3); near(lines.discardedPower, 2 / 3);
  const rays = O.simulate([samples], { maxRays: 3 });
  assert.equal(rays.rayCount, 3); assert.equal(rays.truncated, true);
  near(rays.escapedPower, 1 / 3); near(rays.discardedPower, 2 / 3);
  const branches = O.simulate([source, part('mirror', 2, 250, 300, { angle: 180 }),
    part('splitter', 3, 750, 300, { angle: 0 })], { maxSegments: 10 });
  assert.equal(branches.segments.length, 10); assert.equal(branches.truncated, true);
  bounded(cavity); bounded(lines); bounded(rays); bounded(branches);
});

test('the source scene is unchanged by tracing and arbitrary rotations stay bounded', () => {
  const scene = [part('laser', 1, 100, 300), part('mirror', 2, 400, 300),
    part('lens', 3, 400, 100, { angle: 90, focal: 50 }), part('screen', 4, 700, 300)];
  const before = JSON.stringify(scene);
  for (const item of scene) Object.freeze(item);
  Object.freeze(scene);
  O.simulate(scene);
  assert.equal(JSON.stringify(scene), before);
  for (let angle = 0; angle < 360; angle += 11) {
    bounded(O.simulate([{ ...scene[0], x: 50, y: 50, beamWidth: 120, angle }, ...scene.slice(1)]));
  }
});

test('wavelength display follows blue, green and red order and identifies out-of-range proxies', () => {
  const channels = wavelength => O.wavelengthColor(wavelength).match(/\d+/g).map(Number);
  const blue = channels(450), green = channels(532), red = channels(650);
  assert.ok(blue[2] > blue[0] && blue[2] > blue[1]);
  assert.ok(green[1] > green[0] && green[1] > green[2]);
  assert.ok(red[0] > red[1] && red[0] > red[2]);
  assert.notEqual(O.wavelengthColor(355), O.wavelengthColor(1064));
  assert.notEqual(O.wavelengthColor(355), O.wavelengthColor(450));
  for (let wavelength = 380; wavelength <= 780; wavelength += 5) {
    assert.ok(channels(wavelength).every(channel => channel >= 0 && channel <= 255));
  }
});

test('angle snapping uses 22.5 degree intervals and the position helper accepts a custom grid', () => {
  near(O.snapAngle(24), 22.5); near(O.snapAngle(-20), 337.5); near(O.snapAngle(359), 0);
  assert.deepEqual(O.position(313, 189, true, 10), { x: 310, y: 190 });
  const inch = O.position(313, 189, true, 25.4);
  near(inch.x, 304.8); near(inch.y, 177.8);
});

const relayScene = () => [
  part('laser', 1, 100, 400, { beamWidth: 2, rayCount: 5 }),
  part('fiber', 2, 300, 400, { angle: 0, coreDiameter: 4, na: 0.3 }),
  part('fiber', 3, 650, 200, { angle: 180, coreDiameter: 4, na: 0.3 }),
  part('screen', 4, 850, 200)
];
const relayOptions = { fiberLinks: [{ a: 2, b: 3 }] };
const transferPower = result => result.fiberTransfers.reduce((sum, transfer) => sum + transfer.power, 0);
const nearPoint = (actual, expected) => { near(actual.x, expected.x); near(actual.y, expected.y); };
const segmentDirection = segment => {
  const dx = segment.b.x - segment.a.x, dy = segment.b.y - segment.a.y, length = Math.hypot(dx, dy);
  return { x: dx / length, y: dy / length };
};
const boundedRelay = result => {
  for (const transfer of result.fiberTransfers) {
    assert.ok(Number.isFinite(transfer.power) && transfer.power >= 0);
    assert.notEqual(transfer.fromId, transfer.toId);
    near(transfer.stokes.I, transfer.power);
    assert.ok(Math.hypot(transfer.stokes.Q, transfer.stokes.U, transfer.stokes.V) <= transfer.power + 1e-9);
  }
  bounded(result);
};

test('omitted or empty fiber links keep terminal detection and the legacy geometric APIs unchanged', () => {
  const scene = relayScene(), result = O.simulate(scene);
  assert.deepEqual(result, O.simulate(scene, { fiberLinks: [] }));
  assert.deepEqual(result.fiberTransfers, []);
  near(detector(result, 2).power, 1); near(detector(result, 4).power, 0);
  near(result.detectedPower, 1); assert.equal(result.segments.length, 5);
  const legacy = O.traceRay({ x: 100, y: 400 }, { x: 1, y: 0 }, scene);
  assert.deepEqual(legacy.hits, [2]); nearPoint(legacy.points.at(-1), { x: 300, y: 400 });
  assert.ok(O.traceScene(scene).every(ray => ray.hits.length === 1 && ray.hits[0] === 2));
  boundedRelay(result);
});

test('linked fibers retain the input monitor without double-counting terminal detected power', () => {
  const result = O.simulate(relayScene(), relayOptions);
  assert.equal(result.fiberTransfers.length, 5); near(transferPower(result), 1);
  assert.equal(result.rayCount, 5); assert.equal(result.hitCount, 10); assert.equal(result.branchCount, 5);
  near(detector(result, 2).power, 1); near(detector(result, 2).acceptedPower, 1);
  near(detector(result, 3).power, 0); assert.equal(detector(result, 3).hits, 0);
  near(detector(result, 4).power, 1); near(detector(result, 4).span, 2);
  near(result.detectedPower, 1); near(result.absorbedPower, 0); near(result.escapedPower, 0);
  assert.equal(result.warnings.length, 0);
  for (const transfer of result.fiberTransfers) {
    assert.equal(transfer.fromId, 2); assert.equal(transfer.toId, 3); assert.equal(transfer.sourceId, 1);
    assert.equal(transfer.wavelength, 532); near(transfer.power, 0.2);
  }
  assert.equal(result.segments.length, 10);
  assert.ok(result.segments.every(segment => segment.hitId === 2 || segment.hitId === 4));
  assert.ok(result.segments.filter(segment => segment.hitId === 2).every(segment =>
    segment.pathLengthStart === 0 && segment.pathLengthEnd === 200 && segment.unmeasuredFiberLinks === 0));
  for (const segment of result.segments.filter(segment => segment.hitId === 4)) {
    near(segment.a.x, 650); near(segment.b.x, 850);
    near(segment.pathLengthStart, 200); near(segment.pathLengthEnd, 400);
    assert.equal(segment.unmeasuredFiberLinks, 1);
  }
  boundedRelay(result);
});

test('one fiber pair relays independent sources in both directions', () => {
  const result = O.simulate([
    part('laser', 1, 250, 400, { beamWidth: 0, rayCount: 1, power: 2, wavelength: 532 }),
    part('fiber', 2, 300, 400, { angle: 0 }), part('fiber', 3, 650, 200, { angle: 180 }),
    part('screen', 4, 900, 200),
    part('laser', 5, 700, 200, { angle: 180, beamWidth: 0, rayCount: 1, power: 3, wavelength: 650 }),
    part('screen', 6, 100, 400)
  ], relayOptions);
  assert.deepEqual(result.fiberTransfers.map(({ fromId, toId, sourceId, wavelength, power }) =>
    ({ fromId, toId, sourceId, wavelength, power })), [
    { fromId: 2, toId: 3, sourceId: 1, wavelength: 532, power: 2 },
    { fromId: 3, toId: 2, sourceId: 5, wavelength: 650, power: 3 }
  ]);
  near(detector(result, 2).power, 2); near(detector(result, 3).power, 3);
  near(detector(result, 4).power, 2); near(detector(result, 6).power, 3);
  near(result.detectedPower, 5); boundedRelay(result);
});

test('fiber relays preserve signed height and transverse direction at arbitrary turns and are reciprocal', () => {
  for (const [inputAngle, outputAngle] of [[0, 0], [0, 90], [0, 180], [0, 270], [25, 112.5], [200, 317.2]]) {
    for (const height of [-2, 3]) {
      const a = part('fiber', 2, 300, 300, { angle: inputAngle, coreDiameter: 10, na: 0.3 });
      const b = part('fiber', 3, 750, 300, { angle: outputAngle, coreDiameter: 10, na: 0.3 });
      const normal = O.direction(inputAngle), tangent = { x: -normal.y, y: normal.x };
      const input = O.direction(inputAngle + 7), output = O.direction(outputAngle + 180 + 7);
      const outAxis = O.direction(outputAngle + 180), outTangent = { x: -outAxis.y, y: outAxis.x };
      const hit = { x: a.x + height * tangent.x, y: a.y + height * tangent.y };
      const start = { x: b.x + height * outTangent.x, y: b.y + height * outTangent.y };
      const source = part('laser', 1, hit.x - 60 * input.x, hit.y - 60 * input.y,
        { angle: inputAngle + 7, beamWidth: 0, rayCount: 1 });
      const forward = O.simulate([source, a, b], relayOptions);
      assert.equal(forward.fiberTransfers[0].fromId, 2); assert.equal(forward.fiberTransfers[0].toId, 3);
      nearPoint(forward.segments[0].b, hit); nearPoint(forward.segments[1].a, start);
      nearPoint(segmentDirection(forward.segments[1]), output);
      const reverseSource = part('laser', 1, start.x + 60 * output.x, start.y + 60 * output.y,
        { angle: outputAngle + 7, beamWidth: 0, rayCount: 1 });
      const reverse = O.simulate([reverseSource, a, b], relayOptions);
      assert.equal(reverse.fiberTransfers[0].fromId, 3); assert.equal(reverse.fiberTransfers[0].toId, 2);
      nearPoint(reverse.segments[0].b, start); nearPoint(reverse.segments[1].a, hit);
      nearPoint(segmentDirection(reverse.segments[1]), { x: -input.x, y: -input.y });
      boundedRelay(forward); boundedRelay(reverse);
    }
  }
});

test('linked fibers still reject input rays outside the core, NA or receiving side', () => {
  const scene = relayScene(); scene[0] = { ...scene[0], beamWidth: 4 }; scene[1].coreDiameter = 2;
  const clipped = O.simulate(scene, relayOptions);
  near(detector(clipped, 2).power, 0.6); near(detector(clipped, 4).power, 0.6);
  near(transferPower(clipped), 0.6); near(clipped.absorbedPower, 0.4);
  const aim = part('laser', 1, 100, 400 - 200 * Math.tan(10 * Math.PI / 180), { angle: 10, beamWidth: 0, rayCount: 1 });
  const angleRejected = O.simulate([aim, { ...scene[1], na: 0.1 }, scene[2], scene[3]], relayOptions);
  const backRejected = O.simulate([part('laser', 1, 400, 400, { angle: 180, beamWidth: 0, rayCount: 1 }),
    scene[1], scene[2], scene[3]], relayOptions);
  for (const result of [angleRejected, backRejected]) {
    assert.equal(result.fiberTransfers.length, 0); near(detector(result, 2).power, 0);
    near(detector(result, 4).power, 0); near(result.absorbedPower, 1); near(result.detectedPower, 0);
    boundedRelay(result);
  }
  boundedRelay(clipped);
});

test('the output core clips absolute ray heights without resizing the beam to the partner core', () => {
  for (const [coreDiameter, expectedPower, span] of [[2, 0.6, 2], [20, 1, 4]]) {
    const scene = relayScene(); scene[0].beamWidth = 4; scene[1].coreDiameter = 6; scene[2].coreDiameter = coreDiameter;
    const result = O.simulate(scene, relayOptions);
    near(detector(result, 2).power, 1); near(detector(result, 3).power, 0);
    near(detector(result, 4).power, expectedPower); near(detector(result, 4).span, span);
    near(transferPower(result), expectedPower); near(result.absorbedPower, 1 - expectedPower);
    near(result.detectedPower, expectedPower);
    assert.equal(result.warnings.some(warning => warning.includes('出射側ファイバー')), expectedPower < 1);
    boundedRelay(result);
  }
});

test('output NA acceptance uses the preserved transverse component including its boundary', () => {
  const scene = relayScene(), sine = Math.sin(10 * Math.PI / 180);
  scene[0] = part('laser', 1, 100, 400 - 200 * Math.tan(10 * Math.PI / 180), { angle: 10, beamWidth: 0, rayCount: 1 });
  for (const [na, expected] of [[sine - 1e-5, 0], [sine, 1], [sine + 1e-5, 1]]) {
    const result = O.simulate([scene[0], scene[1], { ...scene[2], na }, scene[3]], relayOptions);
    near(detector(result, 2).power, 1); near(detector(result, 4).power, expected);
    near(transferPower(result), expected); near(result.absorbedPower, 1 - expected); near(result.detectedPower, expected);
    assert.equal(result.fiberTransfers.length, expected); boundedRelay(result);
  }
});

test('fiber transfers preserve each source wavelength, power and complete Stokes vector', () => {
  const scene = relayScene();
  const sources = [
    part('laser', 1, 100, 400, { wavelength: 532, power: 2, rayCount: 1, beamWidth: 0, polAngle: 31 }),
    part('laser', 5, 100, 400, { wavelength: 1064, power: 3, rayCount: 1, beamWidth: 0, polarization: 'right' })
  ];
  const waveplate = part('waveplate', 6, 200, 400, { axisAngle: 17, designWavelength: 532 });
  const result = O.simulate([...sources, waveplate, ...scene.slice(1)], relayOptions);
  assert.equal(result.fiberTransfers.length, 2);
  const total = { I: 0, Q: 0, U: 0, V: 0 };
  for (const source of sources) {
    const transfer = result.fiberTransfers.find(item => item.sourceId === source.id);
    assert.ok(transfer); assert.equal(transfer.wavelength, source.wavelength); near(transfer.power, source.power);
    const expected = O.retard(O.sourceStokes(source), waveplate.axisAngle, Math.PI / 2 * 532 / source.wavelength);
    for (const key of ['I', 'Q', 'U', 'V']) { near(transfer.stokes[key], expected[key]); total[key] += expected[key]; }
    const outgoing = result.segments.find(segment => segment.sourceId === source.id && segment.hitId === 4);
    assert.equal(outgoing.wavelength, source.wavelength);
    for (const key of ['I', 'Q', 'U', 'V']) near(outgoing.stokes[key], expected[key]);
  }
  for (const key of ['I', 'Q', 'U', 'V']) near(detector(result, 4).stokes[key], total[key]);
  assert.deepEqual(detector(result, 4).powerByWavelength, { 532: 2, 1064: 3 });
  near(result.detectedPower, 5); boundedRelay(result);
});

test('successive fiber pairs relay a beam through multiple axes while counting its final detection once', () => {
  const result = O.simulate([
    part('laser', 1, 100, 400, { beamWidth: 4, rayCount: 5 }),
    part('fiber', 2, 300, 400, { angle: 0, coreDiameter: 10 }),
    part('fiber', 3, 500, 100, { angle: 270, coreDiameter: 10 }),
    part('fiber', 4, 500, 300, { angle: 90, coreDiameter: 10 }),
    part('fiber', 5, 700, 450, { angle: 180, coreDiameter: 10 }), part('screen', 6, 900, 450)
  ], { fiberLinks: [{ a: 2, b: 3 }, { a: 4, b: 5 }] });
  assert.equal(result.fiberTransfers.length, 10); near(transferPower(result), 2);
  assert.equal(result.segments.length, 15); assert.equal(result.hitCount, 15);
  near(detector(result, 2).power, 1); near(detector(result, 4).power, 1); near(detector(result, 6).power, 1);
  near(detector(result, 3).power, 0); near(detector(result, 5).power, 0);
  near(detector(result, 6).span, 4); near(result.detectedPower, 1); boundedRelay(result);
  assert.ok(result.segments.filter(segment => segment.hitId === 6).every(segment => segment.unmeasuredFiberLinks === 2));
});

test('splitter branches and fiber monitors preserve the same terminal energy ledger', () => {
  const result = O.simulate([
    part('laser', 1, 100, 300, { beamWidth: 0, rayCount: 1, polarization: 'right' }),
    part('fiber', 2, 300, 300), part('fiber', 3, 700, 450, { angle: 180 }),
    part('screen', 4, 900, 450), part('splitter', 5, 200, 300, { transmission: 0.3 }),
    part('screen', 6, 200, 100, { angle: 90 })
  ], relayOptions);
  near(detector(result, 2).power, 0.3); near(detector(result, 4).power, 0.3); near(detector(result, 6).power, 0.7);
  assert.equal(result.fiberTransfers.length, 1); near(result.fiberTransfers[0].power, 0.3);
  near(result.fiberTransfers[0].stokes.V, 0.3); near(result.detectedPower, 1); boundedRelay(result);
});

test('disabled partner ends and disconnected pairs revert to ordinary fiber termination', () => {
  for (const index of [1, 2]) {
    const scene = relayScene(); scene[index].enabled = false;
    const linked = O.simulate(scene, relayOptions), disconnected = O.simulate(scene, { fiberLinks: [] });
    assert.deepEqual(linked, disconnected); assert.deepEqual(linked.fiberTransfers, []);
    if (index === 2) { near(detector(linked, 2).power, 1); near(linked.detectedPower, 1); }
    else { near(linked.escapedPower, 1); near(linked.detectedPower, 0); }
    boundedRelay(linked);
  }
  const scene = relayScene(), connected = O.simulate(scene, relayOptions), removed = O.simulate(scene, { fiberLinks: [] });
  near(detector(connected, 4).power, 1); near(detector(removed, 4).power, 0); near(detector(removed, 2).power, 1);
  boundedRelay(connected); boundedRelay(removed);
});

test('invalid link types, IDs, targets and self-links are ignored with warnings', () => {
  const invalid = [null, {}, '2-3', 4, [null], [[]], [3], [{ a: 2 }], [{ a: '2', b: 3 }],
    [{ a: 0, b: 3 }], [{ a: -2, b: 3 }], [{ a: 2.5, b: 3 }], [{ a: 2, b: NaN }],
    [{ a: Infinity, b: 3 }], [{ a: 2, b: Number.MAX_SAFE_INTEGER + 1 }], [{ a: 2, b: 2 }],
    [{ a: 2, b: 99 }], [{ a: 2, b: 4 }], [{ a: 1, b: 3 }], [{ a: 2, b: 3, loss: 0.2 }],
    [Object.create({ a: 2, b: 3 })]];
  for (const fiberLinks of invalid) {
    const result = O.simulate(relayScene(), { fiberLinks });
    assert.equal(result.fiberTransfers.length, 0); near(detector(result, 2).power, 1); near(result.detectedPower, 1);
    assert.ok(result.warnings.some(warning => warning.includes('ファイバー接続')));
    boundedRelay(result);
  }
});

test('duplicate and multiply connected ends keep only the first valid fiber pair', () => {
  const scene = [...relayScene(), part('fiber', 5, 650, 500, { angle: 180, coreDiameter: 4 })];
  for (const extra of [{ a: 2, b: 3 }, { a: 3, b: 2 }, { a: 2, b: 5 }, { a: 3, b: 5 }]) {
    const result = O.simulate(scene, { fiberLinks: [{ a: 2, b: 3 }, extra] });
    near(detector(result, 4).power, 1); assert.equal(result.fiberTransfers.length, 5);
    assert.ok(result.fiberTransfers.every(transfer => transfer.fromId === 2 && transfer.toId === 3));
    assert.ok(result.warnings.some(warning => warning.includes('重複・多重'))); boundedRelay(result);
  }
  const disabled = O.simulate(scene.map(e => e.id === 3 ? { ...e, enabled: false } : e),
    { fiberLinks: [{ a: 2, b: 3 }, { a: 2, b: 5 }] });
  assert.equal(disabled.fiberTransfers.length, 0); near(detector(disabled, 2).power, 1); near(disabled.detectedPower, 1);
  boundedRelay(disabled);
});

test('fiber link validation is bounded by the exported maximum pair count', () => {
  assert.equal(O.MAX_FIBER_LINKS, O.MAX_ELEMENTS / 2);
  const fiberLinks = Array.from({ length: O.MAX_FIBER_LINKS }, () => ({ a: 2, b: 2 }));
  fiberLinks.push({ a: 2, b: 3 });
  const result = O.simulate(relayScene(), { fiberLinks });
  assert.equal(result.fiberTransfers.length, 0); near(detector(result, 2).power, 1);
  assert.ok(result.warnings.some(warning => warning.includes('接続の上限'))); boundedRelay(result);
});

test('fiber cycles obey interaction, segment and source-ray limits without double-counting monitored power', () => {
  const scene = [part('laser', 1, 200, 300, { beamWidth: 0, rayCount: 1 }),
    part('fiber', 2, 300, 300), part('fiber', 3, 100, 300, { angle: 180 })];
  for (const count of [1, 3, O.MAX_INTERACTIONS]) {
    const result = O.simulate(scene, { ...relayOptions, maxInteractions: count });
    assert.equal(result.fiberTransfers.length, count); assert.equal(result.hitCount, count);
    assert.equal(result.segments.length, count); assert.equal(result.truncated, true);
    near(detector(result, 2).power, count); near(detector(result, 3).power, 0);
    near(result.discardedPower, 1); near(result.detectedPower, 0); near(result.absorbedPower, 0);
    boundedRelay(result);
  }
  const lines = O.simulate(scene, { ...relayOptions, maxSegments: 2 });
  assert.equal(lines.segments.length, 2); assert.equal(lines.fiberTransfers.length, 2); near(lines.discardedPower, 1);
  const samples = O.simulate([{ ...scene[0], rayCount: 9 }, ...scene.slice(1)], { ...relayOptions, maxRays: 3, maxInteractions: 2 });
  assert.equal(samples.rayCount, 3); assert.equal(samples.fiberTransfers.length, 6); near(samples.discardedPower, 1);
  assert.equal(samples.truncated, true); boundedRelay(lines); boundedRelay(samples);
});

test('relay output positions beyond the former board continue tracing without losing their power', () => {
  for (const [x, y, angle] of [[50, 300, 90], [950, 300, 270], [500, 50, 180], [500, 550, 0]]) {
    const result = O.simulate([
      part('laser', 1, 100, 200, { beamWidth: 0, rayCount: 1 }),
      part('fiber', 2, 300, 300, { coreDiameter: 200, aperture: 200, na: 1 }),
      part('fiber', 3, x, y, { angle, coreDiameter: 200, aperture: 200, na: 1 })
    ], relayOptions);
    assert.equal(result.segments.length, 2); assert.equal(result.fiberTransfers.length, 1);
    near(detector(result, 2).power, 1); near(result.escapedPower, 1); near(result.detectedPower, 0);
    near(result.absorbedPower, 0); near(result.discardedPower, 0);
    assert.equal(result.warnings.some(warning => warning.includes('ボードの外')), false); boundedRelay(result);
  }
});

test('fiber simulation does not mutate elements or links and transfer Stokes are independent snapshots', () => {
  const scene = relayScene(), options = { fiberLinks: [{ a: 2, b: 3 }] };
  const before = JSON.stringify({ scene, options });
  scene.forEach(Object.freeze); Object.freeze(scene); options.fiberLinks.forEach(Object.freeze);
  Object.freeze(options.fiberLinks); Object.freeze(options);
  const first = O.simulate(scene, options), second = O.simulate(scene, options);
  assert.equal(JSON.stringify({ scene, options }), before); assert.deepEqual(first, second);
  boundedRelay(first); boundedRelay(second);
  const records = JSON.stringify({ segments: first.segments, detectors: first.detectors });
  first.fiberTransfers[0].stokes.Q = 999;
  assert.equal(JSON.stringify({ segments: first.segments, detectors: first.detectors }), records);
  assert.deepEqual(O.simulate(scene, options), second);
});

test('preset beam splitters use the palette size except the documented wide concave setup', () => {
  for (const preset of P.list) for (const bs of P.create(preset.id).elements.filter(e=>['splitter','pbs'].includes(e.type))) {
    assert.equal(bs.aperture, preset.id==='concave-focus'?100:36, preset.id);
  }
  const custom = part('splitter', 2, 500, 300, { aperture: 37 });
  const before = JSON.stringify(custom); O.simulate([custom]); assert.equal(JSON.stringify(custom), before);
});

test('both prism symbols act only at one zero-thickness splitting plane', () => {
  for (const type of ['splitter','pbs']) for (const aperture of [40, 100, 180]) {
    const source = part('laser', 1, 100, 310, { beamWidth: 0, rayCount: 1, polAngle: 45 });
    const bs = part(type, 2, 500, 300, { angle: 45, aperture });
    const result = O.simulate([source, bs, part('screen',3,800,310), part('screen',4,490,100,{angle:90})]);
    const incident = result.segments.find(s=>s.hitId===2), branches = result.segments.filter(s=>[3,4].includes(s.hitId));
    near(incident.b.x, 490); near(incident.b.y, 310); assert.equal(branches.length, 2);
    for (const branch of branches) { near(branch.a.x, incident.b.x); near(branch.a.y, incident.b.y); }
    assert.equal(result.segments.length, 3); near(detector(result,3).power,.5); near(detector(result,4).power,.5);
    near(detector(result,3).centroid.y,310); near(detector(result,4).centroid.x,490); bounded(result);
  }
});

const splitterBench = (type, source = {}, splitter = {}) => [
  part('laser', 1, 100, 300, { beamWidth: 0, rayCount: 1, ...source }),
  part(type, 2, 400, 300, splitter), part('screen', 3, 750, 300),
  part('screen', 4, 400, 100, { angle: 90 })
];
const purePBSReadings = (result, transmitted, reflected) => {
  for (const [id, power, sign] of [[3, transmitted, -1], [4, reflected, 1]]) {
    const reading = detector(result, id);
    near(reading.power, power); near(reading.stokes.I, power); near(reading.stokes.Q, sign * power);
    near(reading.stokes.U, 0); near(reading.stokes.V, 0);
  }
};

test('PBS reflects s, transmits p, and splits diagonal, circular and unpolarized inputs into pure orthogonal outputs', () => {
  for (const [source, transmitted, reflected] of [
    [{ polAngle: 0 }, 0, 1], [{ polAngle: 90 }, 1, 0],
    [{ polAngle: 45 }, 0.5, 0.5], [{ polAngle: 135 }, 0.5, 0.5],
    [{ polarization: 'right' }, 0.5, 0.5], [{ polarization: 'left' }, 0.5, 0.5],
    [{ polarization: 'unpolarized' }, 0.5, 0.5]
  ]) {
    const result = O.simulate(splitterBench('pbs', source));
    purePBSReadings(result, transmitted, reflected);
    near(result.detectedPower, 1); near(result.absorbedPower, 0); near(result.discardedPower, 0);
    const branches = Number(transmitted > 0) + Number(reflected > 0);
    assert.equal(result.branchCount, 1 + branches); assert.equal(result.segments.length, 1 + branches);
    assert.equal(detector(result, 3).hits, Number(transmitted > 0));
    assert.equal(detector(result, 4).hits, Number(reflected > 0));
    assert.equal(result.truncated, false); bounded(result);
  }
});

test('PBS obeys sin-squared p transmission and cos-squared s reflection throughout a polarization-angle sweep', () => {
  for (let polAngle = 0; polAngle < 360; polAngle += 7.5) {
    const result = O.simulate(splitterBench('pbs', { polAngle, power: 2.3 }));
    const angle = polAngle * Math.PI / 180;
    purePBSReadings(result, 2.3 * Math.sin(angle) ** 2, 2.3 * Math.cos(angle) ** 2);
    near(result.detectedPower, 2.3); bounded(result);
  }
});

test('PBS projects a partially polarized incoherent mixture without treating its U or V as extra power', () => {
  // This realizable mixture has aggregate (I,Q,U,V)=(1,.2,.3,.4).
  const sources = [
    part('laser', 1, 100, 300, { beamWidth: 0, rayCount: 1, power: 0.1, polarization: 'unpolarized' }),
    part('laser', 5, 100, 300, { beamWidth: 0, rayCount: 1, power: 0.2, polAngle: 0 }),
    part('laser', 6, 100, 300, { beamWidth: 0, rayCount: 1, power: 0.3, polAngle: 45 }),
    part('laser', 7, 100, 300, { beamWidth: 0, rayCount: 1, power: 0.4, polarization: 'right' })
  ];
  const result = O.simulate([...sources, ...splitterBench('pbs').slice(1)]);
  const incident = result.segments.filter(segment => segment.hitId === 2).reduce((sum, segment) => {
    for (const key of ['I', 'Q', 'U', 'V']) sum[key] += segment.stokes[key];
    return sum;
  }, { I: 0, Q: 0, U: 0, V: 0 });
  for (const [key, value] of Object.entries({ I: 1, Q: 0.2, U: 0.3, V: 0.4 })) near(incident[key], value);
  purePBSReadings(result, 0.4, 0.6); near(result.detectedPower, 1); near(result.absorbedPower, 0);
  assert.ok(result.segments.every(segment => sources.some(source => source.id === segment.sourceId)));
  bounded(result);
});

test('PBS placement and incidence side change geometric routing but never rotate the fixed local s and p axes', () => {
  const pointOn = (axis, distance) => ({ x: 500 + axis.x * distance, y: 300 + axis.y * distance });
  for (const placement of [0, 13, 37.2, 45, 90, 135, 225, 317.2]) {
    for (const side of [0, 180]) {
      const incidence = placement - 45 + side, incident = O.direction(incidence), reflected = O.direction(incidence - 90);
      const source = pointOn(incident, -100), tScreen = pointOn(incident, 100), rScreen = pointOn(reflected, 100);
      const result = O.simulate([
        part('laser', 1, source.x, source.y, { angle: incidence, polAngle: 31.7, beamWidth: 0, rayCount: 1 }),
        part('pbs', 2, 500, 300, { angle: placement }),
        part('screen', 3, tScreen.x, tScreen.y, { angle: incidence, aperture: 40 }),
        part('screen', 4, rScreen.x, rScreen.y, { angle: incidence - 90, aperture: 40 })
      ]);
      purePBSReadings(result, Math.sin(31.7 * Math.PI / 180) ** 2, Math.cos(31.7 * Math.PI / 180) ** 2);
      nearPoint(segmentDirection(result.segments.find(segment => segment.hitId === 3)), incident);
      nearPoint(segmentDirection(result.segments.find(segment => segment.hitId === 4)), reflected);
      near(result.detectedPower, 1); bounded(result);
    }
  }
});

test('PBS ignores the generic transmission and axis settings and has no modeled wavelength dependence', () => {
  for (const wavelength of [200, 532, 2500]) {
    for (const [transmission, axisAngle] of [[0, 0], [0.27, 37.2], [1, 123]]) {
      const result = O.simulate(splitterBench('pbs', { wavelength, polAngle: 37.2 }, { transmission, axisAngle }));
      purePBSReadings(result, Math.sin(37.2 * Math.PI / 180) ** 2, Math.cos(37.2 * Math.PI / 180) ** 2);
      assert.ok(result.segments.every(segment => segment.wavelength === wavelength)); bounded(result);
    }
  }
});

test('cascaded PBS elements pass already-separated p and s rays without repeated half-power losses', () => {
  const result = O.simulate([
    part('laser', 1, 100, 300, { beamWidth: 0, rayCount: 1, polAngle: 45 }),
    part('pbs', 2, 300, 300), part('pbs', 3, 500, 300), part('pbs', 4, 300, 100),
    part('screen', 5, 750, 300), part('screen', 6, 800, 100),
    part('screen', 7, 500, 200, { angle: 90 }), part('screen', 8, 300, 50, { angle: 90 })
  ]);
  near(detector(result, 5).power, 0.5); near(detector(result, 5).stokes.Q, -0.5);
  near(detector(result, 6).power, 0.5); near(detector(result, 6).stokes.Q, 0.5);
  assert.equal(detector(result, 7).hits, 0); assert.equal(detector(result, 8).hits, 0);
  assert.equal(result.segments.length, 5); assert.equal(result.branchCount, 5);
  near(result.detectedPower, 1); near(result.absorbedPower, 0); bounded(result);
});

test('polarizers after PBS arms analyze the projected states and account for the absorbed power', () => {
  const result = O.simulate([...splitterBench('pbs', { polAngle: 45 }),
    part('polarizer', 5, 500, 300, { axisAngle: 30 }),
    part('polarizer', 6, 400, 200, { angle: 90, axisAngle: 60 })]);
  near(detector(result, 3).power, 0.125); near(detector(result, 4).power, 0.125);
  near(detector(result, 3).stokes.Q, 0.0625); near(detector(result, 4).stokes.Q, -0.0625);
  near(result.detectedPower, 0.25); near(result.absorbedPower, 0.75); bounded(result);
});

test('PBS preserves source spectra and polarization through a downstream dichroic filter', () => {
  const result = O.simulate([
    part('laser', 1, 100, 300, { beamWidth: 0, rayCount: 1, wavelength: 405, power: 1, polAngle: 0 }),
    part('laser', 5, 100, 300, { beamWidth: 0, rayCount: 1, wavelength: 532, power: 2, polAngle: 45 }),
    part('laser', 6, 100, 300, { beamWidth: 0, rayCount: 1, wavelength: 1064, power: 3, polAngle: 90 }),
    part('pbs', 2, 400, 300), part('screen', 3, 850, 300), part('screen', 4, 400, 100, { angle: 90 }),
    part('dichroic', 7, 600, 300, { cutoff: 600, mode: 'longpass' }), part('screen', 8, 600, 100, { angle: 90 })
  ]);
  assert.deepEqual(detector(result, 3).powerByWavelength, { 1064: 3 });
  assert.deepEqual(detector(result, 4).powerByWavelength, { 405: 1, 532: 1 });
  assert.deepEqual(detector(result, 8).powerByWavelength, { 532: 1 });
  near(detector(result, 3).stokes.Q, -3); near(detector(result, 4).stokes.Q, 2); near(detector(result, 8).stokes.Q, -1);
  near(result.detectedPower, 6); near(result.absorbedPower, 0); bounded(result);
});

test('NPBS retains its adjustable power ratio and normalized Stokes for every source polarization', () => {
  for (const source of [{ polAngle: 0 }, { polAngle: 90 }, { polAngle: 45 }, { polAngle: 37.2 },
    { polarization: 'right' }, { polarization: 'left' }, { polarization: 'unpolarized' }]) {
    for (const transmission of [0, 0.2, 0.5, 1]) {
      for (const addRetarder of [false, true]) {
        const scene = splitterBench('splitter', { ...source, power: 2, wavelength: 633 }, { transmission, axisAngle: 123 });
        let expected = O.sourceStokes(scene[0]);
        if (addRetarder) {
          scene.push(part('waveplate', 5, 200, 300, { axisAngle: 17, designWavelength: 633 }));
          expected = O.retard(expected, 17, Math.PI / 2);
        }
        const result = O.simulate(scene);
        for (const [id, factor] of [[3, transmission], [4, 1 - transmission]]) {
          const reading = detector(result, id); near(reading.power, 2 * factor);
          for (const key of ['I', 'Q', 'U', 'V']) near(reading.stokes[key], expected[key] * factor);
        }
        near(result.detectedPower, 2); near(result.absorbedPower, 0); bounded(result);
      }
    }
  }
});

test('disabled PBS leaves the original polarization unchanged and a zero-power source emits no branches', () => {
  const result = O.simulate(splitterBench('pbs', { polarization: 'right' }, { enabled: false }));
  near(detector(result, 3).power, 1); near(detector(result, 3).stokes.V, 1); near(detector(result, 3).stokes.Q, 0);
  assert.equal(detector(result, 4).hits, 0); assert.equal(result.branchCount, 1); assert.equal(result.segments.length, 1);
  const dark = O.simulate(splitterBench('pbs', { power: 0 }));
  assert.equal(dark.rayCount, 0); assert.equal(dark.branchCount, 0); assert.equal(dark.segments.length, 0);
  bounded(result); bounded(dark);
});

test('rays missing a finite PBS surface bypass it without being projected', () => {
  const result = O.simulate(splitterBench('pbs', { polAngle: 0, beamWidth: 20, rayCount: 5 }, { aperture: 4 }));
  near(detector(result, 3).power, 0.8); near(detector(result, 3).stokes.Q, 0.8);
  near(detector(result, 4).power, 0.2); near(detector(result, 4).stokes.Q, 0.2);
  assert.equal(result.segments.filter(segment => segment.hitId === 2).length, 1);
  near(result.detectedPower, 1); near(result.absorbedPower, 0); bounded(result);
});

test('PBS branch budgets and repeated reflections terminate with all omitted power accounted for', () => {
  const scene = splitterBench('pbs', { polarization: 'unpolarized' });
  for (const [options, detected, discarded, truncated] of [
    [{ maxSegments: 1 }, 0, 1, true], [{ maxSegments: 2 }, 0.5, 0.5, true],
    [{ maxInteractions: 1 }, 0, 1, true], [{ minPower: 0.6 }, 0, 1, false]
  ]) {
    const result = O.simulate(scene, options);
    near(result.detectedPower, detected); near(result.discardedPower, discarded);
    assert.equal(result.truncated, truncated); bounded(result);
  }
  const samples = O.simulate(splitterBench('pbs', { polarization: 'unpolarized', beamWidth: 4, rayCount: 5 }), { maxRays: 2 });
  assert.equal(samples.rayCount, 2); near(samples.detectedPower, 0.4); near(samples.discardedPower, 0.6);
  const cavity = O.simulate([
    part('laser', 1, 500, 300, { beamWidth: 0, rayCount: 1, polarization: 'unpolarized' }),
    part('pbs', 2, 750, 300, { angle: 0 }), part('mirror', 3, 250, 300, { angle: 180 })
  ]);
  near(cavity.escapedPower, 0.5); near(cavity.discardedPower, 0.5); near(cavity.detectedPower, 0);
  assert.equal(cavity.hitCount, O.MAX_INTERACTIONS); assert.equal(cavity.truncated, true);
  bounded(samples); bounded(cavity);
});

test('PBS projected light crosses a fiber link without changing polarization or double-counting its monitor', () => {
  const result = O.simulate([
    part('laser', 1, 100, 300, { beamWidth: 0, rayCount: 1, polAngle: 45 }),
    part('pbs', 2, 400, 300), part('fiber', 3, 500, 300),
    part('fiber', 4, 650, 450, { angle: 180 }), part('screen', 5, 900, 450),
    part('screen', 6, 400, 100, { angle: 90 })
  ], { fiberLinks: [{ a: 3, b: 4 }] });
  assert.equal(result.fiberTransfers.length, 1);
  const transfer = result.fiberTransfers[0];
  assert.equal(transfer.sourceId, 1); assert.equal(transfer.wavelength, 532);
  near(transfer.power, 0.5); near(transfer.stokes.Q, -0.5); near(transfer.stokes.U, 0); near(transfer.stokes.V, 0);
  near(detector(result, 3).power, 0.5); near(detector(result, 5).power, 0.5); near(detector(result, 6).power, 0.5);
  near(detector(result, 5).stokes.Q, -0.5); near(detector(result, 6).stokes.Q, 0.5);
  near(result.detectedPower, 1); boundedRelay(result);
});

function coherent(scene, phaseId, traceOptions = {}) {
  return C.analyze(scene.elements, O.simulate(scene.elements, { recordPaths: true, ...traceOptions }), phaseId);
}
const component = (scene, id) => scene.elements.find(e => e.id === id);
const coherentDetector = (result, id) => {
  assert.equal(result.valid, true, result.message);
  const d = result.detectors.find(d => d.id === id); assert.ok(d); return d;
};

test('Jones modes, polarizers and retarders reproduce the existing Stokes convention including circular handedness', () => {
  for (const polarization of ['linear', 'right', 'left', 'unpolarized']) {
    const source = { ...O.createElement('laser', 1, 0, 0), polarization, polAngle: 31, power: 1.7 };
    for (const axis of [0, 22.5, 45, 90, 137]) for (const phase of [0, Math.PI/2, Math.PI, 1.731]) {
      const modes = C.sourceModes(source).map(a => C.retard(a, axis, phase));
      const sum = modes.map(C.stokes).reduce((a, b) => Object.fromEntries(Object.keys(a).map(k => [k, a[k]+b[k]])), { I: 0, Q: 0, U: 0, V: 0 });
      const expected = O.retard(O.sourceStokes(source), axis, phase);
      for (const key of ['I','Q','U','V']) near(sum[key], expected[key]);
      const projected = modes.map(a => C.stokes(C.project(a, 67))).reduce((a, b) => Object.fromEntries(Object.keys(a).map(k => [k, a[k]+b[k]])), { I: 0, Q: 0, U: 0, V: 0 });
      const expectedPolarized = O.polarize(expected, 67);
      for (const key of ['I','Q','U','V']) near(projected[key], expectedPolarized[key]);
    }
  }
});

test('a half-wave plate rotates linear polarization by twice its axis and its retardance scales with wavelength', () => {
  for (const wavelength of [405, 532, 650]) for (const axisAngle of [0, 22.5, 45, 79]) {
    const source = part('laser', 1, 100, 300, { wavelength, rayCount: 1 });
    const result = O.simulate([source, part('halfwave', 2, 400, 300, { axisAngle }), part('screen', 3, 800, 300)]);
    const expected = O.retard(O.sourceStokes(source), axisAngle, Math.PI*532/wavelength);
    for (const key of ['I','Q','U','V']) near(detector(result, 3).stokes[key], expected[key]);
    bounded(result);
  }
});

test('Mach-Zehnder output powers obey complementary fringes and conserve power for all input polarizations', () => {
  for (const polarization of ['linear', 'right', 'left', 'unpolarized']) {
    const scene = P.create('mach-zehnder'); component(scene, 1).polarization = polarization;
    for (const phi of [0, 17, 90, 180, 273.5, 360]) {
      component(scene, 6).phase = phi;
      const r = coherent(scene), a = coherentDetector(r, 7), b = coherentDetector(r, 8);
      near(a.power, (1+Math.cos(phi*Math.PI/180))/2); near(a.power+b.power, 1);
      near(a.visibility, 1); near(b.visibility, 1); assert.equal(a.pathCount, 2);
    }
  }
});

test('filters attenuate coherent amplitudes by sqrt(T), including blocked and disabled arms', () => {
  const scene = P.create('mach-zehnder'), filter = part('filter', 20, 550, 150, { filterMode: 'nd', opticalDensity: 2 });
  scene.elements.push(filter);
  for (const phi of [0, 90, 180]) {
    component(scene, 6).phase = phi;
    const result = coherent(scene), a = coherentDetector(result, 7), b = coherentDetector(result, 8);
    near(a.power, (1 + .01 + .2 * Math.cos(phi * Math.PI / 180)) / 4);
    near(a.power + b.power, .505); near(a.visibility, .2 / 1.01);
  }
  filter.filterMode = 'bandpass'; filter.bandLow = 550; filter.bandHigh = 560;
  for (const id of [7,8]) { const d = coherentDetector(coherent(scene), id); near(d.power, .25); near(d.visibility, 0); }
  filter.enabled = false; component(scene,6).phase = 0;
  near(coherentDetector(coherent(scene),7).power,1);
});

test('unbalanced splitter amplitudes reduce visibility according to 2 sqrt(T R)', () => {
  const scene = P.create('mach-zehnder'); component(scene, 2).transmission = .2;
  const r = coherent(scene), a = coherentDetector(r, 7), b = coherentDetector(r, 8);
  near(a.power, .9); near(b.power, .1); near(a.visibility, .8); near(a.max, .9); near(a.min, .1);
  for (const transmission of [0, 1]) {
    component(scene, 2).transmission = transmission;
    const single = coherent(scene);
    for (const d of single.detectors) { near(d.power, .5); near(d.visibility, 0); }
  }
});

test('orthogonal path markers remove interference and 45-degree analyzers restore it at half total power', () => {
  const scene = P.create('quantum-eraser');
  component(scene, 10).enabled = component(scene, 11).enabled = false;
  for (const phi of [0, 90, 180, 257]) {
    component(scene, 6).phase = phi;
    const r = coherent(scene);
    for (const d of r.detectors) { near(d.power, .5); near(d.visibility, 0); }
  }
  component(scene, 10).enabled = component(scene, 11).enabled = true;
  for (const phi of [0, 90, 180, 257]) {
    component(scene, 6).phase = phi;
    const r = coherent(scene), a = coherentDetector(r, 7), b = coherentDetector(r, 8);
    near(a.power, (1+Math.cos(phi*Math.PI/180))/4); near(a.power+b.power, .5);
    near(a.visibility, 1); near(b.visibility, 1);
  }
});

test('complementary eraser projections cancel their fringes and marker rotation changes visibility', () => {
  const scene = P.create('quantum-eraser');
  for (const phi of [0, 37, 90, 180, 241]) for (const axis of [0, 22.5, 45, 80]) {
    component(scene, 6).phase = phi; component(scene, 10).axisAngle = axis;
    const a = coherentDetector(coherent(scene), 7);
    near(a.power, (1+Math.sin(axis*Math.PI/90)*Math.cos(phi*Math.PI/180))/4);
    near(a.visibility, Math.abs(Math.sin(axis*Math.PI/90)));
    component(scene, 10).axisAngle = axis+90;
    near(a.power+coherentDetector(coherent(scene), 7).power, .5);
  }
  component(scene, 10).enabled = component(scene, 11).enabled = false;
  for (const axis of [0, 22.5, 45]) {
    component(scene, 9).axisAngle = axis;
    near(coherentDetector(coherent(scene), 7).visibility, Math.abs(Math.cos(axis*Math.PI/90)));
  }
});

test('Michelson counts the phase plate twice and mirror displacement twice in optical path length', () => {
  const scene = P.create('michelson');
  for (const phi of [0, 45, 90, 123, 180, 270, 360]) {
    component(scene, 5).phase = phi;
    const r = coherent(scene), a = coherentDetector(r, 6), b = coherentDetector(r, 7);
    near(a.power, (1+Math.cos(phi*Math.PI/90))/2); near(a.power+b.power, 1);
  }
  component(scene, 5).phase = 0;
  component(scene, 3).x += component(scene, 1).wavelength*1e-6/4;
  near(coherentDetector(coherent(scene), 6).power, 0, 1e-7);
  near(coherentDetector(coherent(scene), 7).power, 1, 1e-7);
});

test('coherent analysis follows moved and blocked real paths instead of the preset identity', () => {
  const blocked = P.create('mach-zehnder'); blocked.elements.push(part('blocker', 20, 550, 450));
  for (const d of coherent(blocked).detectors) { near(d.power, .25); near(d.visibility, 0); assert.equal(d.pathCount, 1); }
  const moved = P.create('mach-zehnder'); component(moved, 3).x += 20;
  const r = coherent(moved); assert.equal(r.valid, true);
  for (const d of r.detectors) { near(d.visibility, 0); assert.equal(d.matchedGroups, 0); }
  component(moved, 3).x -= 20; near(coherentDetector(coherent(moved), 7).visibility, 1);
});

test('independent lasers add intensity, while unpolarized modes retain their own path coherence', () => {
  const scene = P.create('mach-zehnder');
  scene.elements.push({ ...component(scene, 1), id: 30, x: 50 });
  const r = coherent(scene); near(coherentDetector(r, 7).power, 2); near(coherentDetector(r, 8).power, 0);
  component(scene, 1).polarization = component(scene, 30).polarization = 'unpolarized';
  near(coherentDetector(coherent(scene), 7).power, 2);
});

test('coherent PBS paths match Stokes projections without adding interference between orthogonal source modes', () => {
  for (const polarization of ['linear', 'right', 'left', 'unpolarized']) {
    const scene = { elements: [
      part('laser', 1, 100, 300, { polarization, polAngle: 23, beamWidth: 0, rayCount: 1 }),
      part('phase', 2, 200, 300, { phase: 37 }), part('pbs', 3, 400, 300, { angle: 45 }),
      part('screen', 4, 800, 300), part('screen', 5, 400, 100, { angle: 90 })
    ] };
    const trace = O.simulate(scene.elements, { recordPaths: true }), result = C.analyze(scene.elements, trace);
    for (const id of [4, 5]) {
      const d = coherentDetector(result, id), expected = detector(trace, id);
      for (const key of ['I','Q','U','V']) near(d.stokes[key], expected.stokes[key]);
      near(d.visibility, 0);
    }
  }
});

test('phase selection, disabled phase plates and viewport changes never use stale or screen-space paths', () => {
  const scene = P.create('mach-zehnder');
  scene.elements.push(part('phase', 20, 500, 450, { phase: 90 }));
  component(scene, 6).phase = 30;
  const before = JSON.stringify(scene), r = coherent(scene, 6);
  near(coherentDetector(r, 7).power, .75);
  const other = coherent(scene, 20); near(coherentDetector(other, 7).power, .75);
  assert.equal(other.phaseId, 20);
  const zoomed = coherent(scene, 6, { viewBounds: { x: -1e6, y: 1e6, width: 500, height: 300 } });
  assert.deepEqual(zoomed, r); assert.equal(JSON.stringify(scene), before);
  component(scene, 6).enabled = false;
  const disabled = coherent(scene, 6);
  for (const d of disabled.detectors) { near(d.visibility, 0); near(d.power, .5); }
});

test('unsupported sources, unsupported optics, overlapping parts and truncated paths stop coherent output explicitly', () => {
  for (const change of [
    s => { component(s, 1).rayCount = 9; }, s => { component(s, 1).beamWidth = 12; },
    s => { component(s, 1).type = 'point'; }, s => { component(s, 1).power = 0; }, s => { component(s, 1).power = 1e-10; },
    s => { s.elements.push(part('lens', 20, 550, 450)); },
    s => { s.elements.push(part('concave', 20, 550, 450)); },
    s => { s.elements.push(part('camera', 20, 550, 450)); },
    s => { s.elements.push(part('mirror', 20, 300, 150)); }
  ]) {
    const scene = P.create('mach-zehnder'); change(scene);
    const result = coherent(scene); assert.equal(result.valid, false); assert.deepEqual(result.detectors, []); assert.ok(result.message);
  }
  assert.equal(coherent(P.create('mach-zehnder'), 6, { maxSegments: 2 }).valid, false);
  assert.equal(C.analyze([], O.simulate([])), null);
});

test('terminal path history preserves beam-splitter sides and leaves ordinary geometric power unchanged', () => {
  const scene = P.create('quantum-eraser'), ordinary = O.simulate(scene.elements), recorded = O.simulate(scene.elements, { recordPaths: true });
  assert.deepEqual(ordinary.detectors, recorded.detectors); assert.deepEqual(ordinary.segments, recorded.segments);
  assert.equal(ordinary.detectedPaths.length, 0); assert.equal(recorded.detectedPaths.length, 4);
  for (const p of recorded.detectedPaths) {
    assert.equal(p.steps.at(-1).id, p.detectorId);
    assert.equal(p.steps.filter(s => ['R','T'].includes(s.side)).length, 2);
  }
});
