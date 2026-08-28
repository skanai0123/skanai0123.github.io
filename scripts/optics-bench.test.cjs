const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('../optics-bench/optics.js');
const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const element = (type, id, x, y, angle = 0, focal = 125) => ({ ...O.createElement(type, id, x, y), angle, focal });
const atX = (points, x) => {
  const a = points.at(-2), b = points.at(-1);
  return a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x);
};

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
  const miss = O.traceRay({ x: 100, y: 351 }, { x: 1, y: 0 }, surfaces);
  assert.deepEqual(miss.hits, []);
  const edge = O.traceRay({ x: 100, y: 350 }, { x: 1, y: 0 }, surfaces, 1);
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
  const scene = [element('mirror', 1, 250, 300), element('mirror', 2, 750, 300)];
  const ray = O.traceRay({ x: 500, y: 300 }, { x: 1, y: 0 }, scene);
  assert.equal(ray.hits.length, O.MAX_INTERACTIONS);
  assert.equal(ray.limited, true);
  assert.ok(ray.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
});

test('grid snapping, free placement and boundary clamping preserve usable positions', () => {
  assert.deepEqual(O.position(313, 189), { x: 325, y: 200 });
  assert.deepEqual(O.position(313.23, 189.34, false), { x: 313.2, y: 189.3 });
  assert.deepEqual(O.position(-1000, 2000), { x: 50, y: 550 });
  assert.deepEqual(O.position(2000, -1000, false), { x: 950, y: 50 });
  assert.equal(O.normalizeAngle(-15), 345);
  assert.equal(O.normalizeAngle(360), 0);
});

test('crossed and collinear surfaces are flagged but separated default parts are not', () => {
  assert.equal(O.overlapping(O.initialElements()), false);
  assert.equal(O.overlapping([element('mirror', 1, 500, 300), element('lens', 2, 500, 325)]), true);
  assert.equal(O.overlapping([element('mirror', 1, 500, 300), element('lens', 2, 525, 300, 90)]), true);
  assert.equal(O.overlapping([element('mirror', 1, 500, 300), element('lens', 2, 600, 300)]), false);
  assert.equal(O.overlapping([element('mirror', 1, 500, 300), element('lens', 2, 550, 250, 90)]), true);
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
    near(segment.stokes.I, segment.power);
    assert.ok(Math.hypot(segment.stokes.Q, segment.stokes.U, segment.stokes.V) <= segment.power + 1e-9);
    for (const point of [segment.a, segment.b]) {
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
      assert.ok(point.x >= -1e-6 && point.x <= O.WIDTH + 1e-6 && point.y >= -1e-6 && point.y <= O.HEIGHT + 1e-6);
    }
  }
  conserve(result);
};

test('all supported part defaults are accepted by the physical simulator', () => {
  const types = ['laser', 'point', 'mirror', 'lens', 'iris', 'polarizer', 'waveplate',
    'dichroic', 'objective', 'fiber', 'blocker', 'splitter', 'screen'];
  assert.deepEqual(Object.keys(O.TYPES).sort(), types.sort());
  for (const type of types) {
    const result = O.simulate([part('laser', 1, 100, 300), part(type, 2, 400, 300)]);
    assert.ok(!result.warnings.some(warning => warning.includes('不正') || warning.includes('範囲外')), type);
    bounded(result);
  }
  assert.throws(() => O.createElement('__proto__', 1, 100, 100), /Unknown/);
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
  const cavity = O.simulate([source, part('mirror', 2, 250, 300, { angle: 0 }),
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
  const branches = O.simulate([source, part('mirror', 2, 250, 300, { angle: 0 }),
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
