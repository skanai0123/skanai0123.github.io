const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const O = require('../optics-bench/optics.js');
const S = require('../optics-bench/state.js');
const P = require('../optics-bench/presets.js');

const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const clone = value => JSON.parse(JSON.stringify(value));
const basic = () => S.defaultScene([O.createElement('laser', 1, 150, 300)]);
const detector = (result, id) => {
  const found = result.detectors.find(entry => entry.id === id);
  assert.ok(found, `detector ${id} exists`);
  return found;
};
const endAt = (segment, x, y) => Math.abs(segment.b.x - x) < 1e-7 && Math.abs(segment.b.y - y) < 1e-7;

test('JSON round trip preserves every component type, physical coordinates and user settings', () => {
  const elements = Object.keys(O.TYPES).map((type, index) => O.createElement(type, index + 1, 100 + 40 * index, 300));
  const scene = S.defaultScene(elements, { title: '実験系 λ532', unit: 'in', gridStep: 12.7, snap: false, angleSnap: false });
  scene.elements[0].x = 137.625;
  scene.elements[0].label = 'レーザー A / 入射';
  scene.elements[1].enabled = false;
  scene.elements[2].angle = 22.5;
  const original = clone(scene);
  const restored = S.parse(S.serialize(scene));
  assert.deepEqual(restored, original);
  assert.deepEqual(scene, original);
  restored.elements[0].x = 200;
  assert.equal(scene.elements[0].x, 137.625);
});

test('optional fields receive safe defaults, full turns normalize, and UTF-8 BOM imports', () => {
  const minimal = { format: 'optics-bench', schemaVersion: 1, elements: [{ id: 1, type: 'laser', x: 137.5, y: 312.5, angle: 360, polAngle: 360 }] };
  const scene = S.parse('\uFEFF' + JSON.stringify(minimal));
  assert.equal(scene.title, S.DEFAULTS.title);
  assert.equal(scene.unit, 'cm');
  assert.equal(scene.gridStep, 10);
  assert.equal(scene.elements[0].angle, 0);
  assert.equal(scene.elements[0].polAngle, 0);
  assert.equal(scene.elements[0].x, 137.5);
  assert.equal(scene.elements[0].y, 312.5);
  assert.equal(scene.elements[0].enabled, true);
});

test('cm, mm and inch conversion never rescales an existing optical system', () => {
  const scene = P.create('beam-expander');
  const inches = S.switchUnit(scene, 'in');
  near(inches.gridStep, 25.4);
  assert.deepEqual(inches.elements, scene.elements);
  assert.equal(scene.unit, 'cm');
  assert.equal(S.switchUnit(inches, 'cm').gridStep, 10);
  near(S.fromDisplay(1, 'in'), 25.4);
  near(S.toDisplay(25.4, 'cm'), 2.54);
  near(S.fromDisplay(S.toDisplay(137.625, 'in'), 'in'), 137.625);
  near(S.toDisplay(13, 'mm'), 13);
  for (const unit of ['inch', '__proto__', '', null]) assert.throws(() => S.unitScale(unit));
  for (const value of [NaN, Infinity, '10', null]) assert.throws(() => S.fromDisplay(value, 'cm'));
  assert.throws(() => S.fromDisplay(Number.MAX_VALUE, 'in'));
});

test('empty scenes and the component cap round trip; excess components are rejected', () => {
  assert.deepEqual(S.parse(S.serialize(S.defaultScene())).elements, []);
  const maximum = S.defaultScene(Array.from({ length: S.MAX_ELEMENTS }, (_, i) => O.createElement('mirror', i + 1, 500, 300)));
  assert.equal(S.parse(S.serialize(maximum)).elements.length, S.MAX_ELEMENTS);
  maximum.elements.push(O.createElement('laser', S.MAX_ELEMENTS + 1, 150, 300));
  assert.throws(() => S.validateScene(maximum), /以下/);
});

test('malformed JSON, non-object input, unsupported formats and versions are rejected', () => {
  for (const text of ['', '{', 'null', '[]', '42', '"optics-bench"']) assert.throws(() => S.parse(text));
  assert.throws(() => S.parse({}));
  const scene = basic();
  for (const changes of [{ format: 'other' }, { schemaVersion: 2 }, { schemaVersion: '1' }, { elements: {} }, { unit: 'inch' }]) {
    assert.throws(() => S.parse(JSON.stringify({ ...scene, ...changes })));
  }
});

test('the 256 KiB file bound is measured in UTF-8 bytes, before parsing', () => {
  assert.throws(() => S.parse(' '.repeat(S.MAX_BYTES + 1)), /256 KiB/);
  const tooManyBytes = 'あ'.repeat(Math.floor(S.MAX_BYTES / 3) + 1);
  assert.ok(tooManyBytes.length < S.MAX_BYTES);
  assert.throws(() => S.parse(tooManyBytes), /256 KiB/);
});

test('unknown fields and prototype pollution payloads are never copied', () => {
  const scene = basic();
  assert.throws(() => S.parse(JSON.stringify({ ...scene, viewport: {} })), /未対応/);
  scene.elements[0].html = '<img src=x onerror=alert(1)>';
  assert.throws(() => S.parse(JSON.stringify(scene)), /未対応/);
  const text = S.serialize(basic());
  assert.throws(() => S.parse(text.replace('"format":', '"__proto__":{"polluted":true},"format":')), /未対応/);
  assert.throws(() => S.parse(text.replace('"type":', '"constructor":{"prototype":{"polluted":true}},"type":')), /未対応/);
  assert.equal({}.polluted, undefined);
  assert.throws(() => S.validateScene(Object.assign(Object.create({ polluted: true }), basic())), /JSONオブジェクト/);
});

test('validation does not evaluate data getters', () => {
  const scene = basic();
  let called = false;
  Object.defineProperty(scene, 'title', { enumerable: true, get() { called = true; return 'unsafe'; } });
  assert.throws(() => S.validateScene(scene), /読み込めない/);
  assert.equal(called, false);
});

test('labels and titles reject HTML, controls, objects and unbounded text', () => {
  for (const text of ['<script>alert(1)</script>', 'line\nbreak', 'nul\u0000', { text: 'wrong' }, 'x'.repeat(101)]) {
    const scene = basic(); scene.elements[0].label = text;
    assert.throws(() => S.validateScene(scene));
  }
  assert.throws(() => S.validateScene({ ...basic(), title: 'x'.repeat(161) }));
  assert.throws(() => S.validateScene({ ...basic(), title: '<b>unsafe</b>' }));
});

test('all numeric component fields enforce finite numeric ranges', () => {
  const values = {
    x: [-1, O.WIDTH, Infinity, '150'], y: [0, O.HEIGHT, NaN], angle: [-0.1, 360.1],
    aperture: [1, 301], focal: [-1001, -0.5, 0, 0.5, 1001], beamWidth: [-1, 201],
    wavelength: [199, 2501], power: [-0.1, 100.1], rayCount: [0, 62, 1.5], divergence: [0, 361],
    polAngle: [-1, 361], axisAngle: [-1, 361], designWavelength: [199, 2501],
    opening: [-1, 301], coreDiameter: [0, 201], na: [0, 1.1], transmission: [-0.1, 1.1], cutoff: [199, 2501]
  };
  for (const [key, invalids] of Object.entries(values)) for (const value of invalids) {
    const scene = basic(); scene.elements[0][key] = value;
    assert.throws(() => S.validateScene(scene), undefined, `${key}: ${value}`);
  }
  const overflow = S.serialize(basic()).replace('"power": 1', '"power": 1e999');
  assert.throws(() => S.parse(overflow));
});

test('IDs, enums and booleans have strict types and duplicate IDs fail atomically', () => {
  for (const changes of [
    { id: 0 }, { id: 1.5 }, { id: '1' }, { id: 1000000001 }, { type: '__proto__' }, { type: 'unknown' },
    { enabled: 'false' }, { polarization: 'elliptic' }, { mode: 'bandpass' }
  ]) {
    const scene = basic(); Object.assign(scene.elements[0], changes);
    assert.throws(() => S.validateScene(scene));
  }
  const current = P.create('relay-4f'), unchanged = clone(current);
  const broken = clone(current); broken.elements[1].id = broken.elements[0].id;
  assert.throws(() => S.parse(JSON.stringify(broken)), /重複/);
  assert.deepEqual(current, unchanged);
  for (const changes of [{ snap: 1 }, { angleSnap: 'true' }, { gridStep: 0 }, { gridStep: 255 }]) {
    assert.throws(() => S.validateScene({ ...basic(), ...changes }));
  }
});

test('iris and fiber dimensions cannot exceed their housings; unrelated apertures remain valid', () => {
  const iris = O.createElement('iris', 1, 300, 300);
  assert.throws(() => S.defaultScene([{ ...iris, aperture: 10, opening: 11 }]), /アイリス開口/);
  assert.equal(S.defaultScene([{ ...iris, aperture: 10, opening: 0 }]).elements[0].opening, 0);
  const fiber = O.createElement('fiber', 1, 300, 300);
  assert.throws(() => S.defaultScene([{ ...fiber, aperture: 10, coreDiameter: 11 }]), /コア径/);
  const lens = { ...O.createElement('lens', 1, 300, 300), aperture: 2, focal: -50 };
  assert.equal(S.parse(S.serialize(S.defaultScene([lens]))).elements[0].focal, -50);
});

test('browser globals load without Node, DOM access or network APIs', () => {
  const context = vm.createContext({});
  for (const filename of ['optics.js', 'state.js', 'presets.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../optics-bench', filename), 'utf8'), context, { filename });
  }
  const result = vm.runInContext('OpticsState.parse(OpticsState.serialize(OpticsPresets.create("starter")))', context);
  assert.equal(result.format, 'optics-bench');
  assert.equal(result.elements.length, 4);
});

test('preset factories return independent validated scenes and reject unknown IDs', () => {
  assert.equal(new Set(P.list.map(entry => entry.id)).size, P.list.length);
  const a = P.create('starter'), b = P.create('starter');
  a.elements[0].x += 10;
  a.title = 'changed';
  assert.notEqual(a.elements[0].x, b.elements[0].x);
  assert.notEqual(a.title, b.title);
  assert.throws(() => P.create('unknown'));
  for (const entry of P.list) {
    assert.ok(entry.description.length && entry.notes.length);
    assert.deepEqual(S.parse(S.serialize(P.create(entry.id))), P.create(entry.id));
  }
});

for (const preset of P.list) test(`preset ${preset.id}: finite rays reach a useful detector without truncation`, () => {
  const scene = P.create(preset.id), result = O.simulate(scene.elements);
  assert.ok(result.rayCount > 0);
  assert.ok(result.hitCount > 0);
  assert.equal(result.truncated, false);
  assert.deepEqual(result.warnings, []);
  assert.ok(result.detectors.some(entry => entry.power > 0));
  for (const segment of result.segments) {
    assert.ok(Number.isFinite(segment.power) && segment.power >= 0);
    for (const point of [segment.a, segment.b]) {
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
      assert.ok(point.x >= -1e-6 && point.x <= O.WIDTH + 1e-6 && point.y >= -1e-6 && point.y <= O.HEIGHT + 1e-6);
    }
  }
});

test('starter rays pass the mirror and lens and meet on the focal screen', () => {
  const scene = P.create('starter'), result = O.simulate(scene.elements), screen = detector(result, 4);
  near(screen.power, 1);
  near(screen.centroid.x, 550); near(screen.centroid.y, 75); near(screen.span, 0);
  assert.equal(screen.acceptedHits, scene.elements[0].rayCount);
  assert.equal(result.segments.filter(segment => endAt(segment, 550, 75)).length, scene.elements[0].rayCount);
});

test('4F preset has the correct conjugate and Fourier spacings and inverted unit magnification', () => {
  const scene = P.create('relay-4f'), [source, l1, fourier, l2, screen] = scene.elements;
  near(l1.x - source.x, l1.focal);
  near(fourier.x - l1.x, l1.focal);
  near(l2.x - fourier.x, l2.focal);
  near(screen.x - l2.x, l2.focal);
  const measured = detector(O.simulate(scene.elements), screen.id);
  near(measured.power, source.power);
  near(measured.centroid.y - l2.y, -(source.y - l1.y) * l2.focal / l1.focal);
  near(measured.span, 0);
});

test('beam expander produces a parallel 24 mm bundle from a 12 mm input', () => {
  const scene = P.create('beam-expander'), [source, l1, l2, screen] = scene.elements;
  near(l2.x - l1.x, l1.focal + l2.focal);
  const result = O.simulate(scene.elements), measured = detector(result, screen.id);
  near(measured.span, source.beamWidth * Math.abs(l2.focal / l1.focal));
  near(measured.power, source.power);
  const output = result.segments.filter(segment => Math.abs(segment.a.x - l2.x) < 1e-7 && Math.abs(segment.b.x - screen.x) < 1e-7);
  assert.equal(output.length, source.rayCount);
  for (const segment of output) near(segment.a.y, segment.b.y);
});

test('quarter-wave plate opens crossed polarizers to 50%; disabling it restores extinction', () => {
  const scene = P.create('polarization');
  const measured = detector(O.simulate(scene.elements), 5);
  near(measured.power, 0.5);
  near(measured.stokes.Q, -0.5); near(measured.stokes.U, 0); near(measured.stokes.V, 0);
  scene.elements.find(element => element.type === 'waveplate').enabled = false;
  near(detector(O.simulate(scene.elements), 5).power, 0);
});

test('dichroic Longpass and Shortpass send both wavelengths to opposite ports', () => {
  const scene = P.create('dichroic');
  let result = O.simulate(scene.elements);
  near(detector(result, 4).power, 1); near(detector(result, 5).power, 1);
  near(detector(result, 4).powerByWavelength['532'], 1);
  near(detector(result, 5).powerByWavelength['650'], 1);
  scene.elements.find(element => element.type === 'dichroic').mode = 'shortpass';
  result = O.simulate(scene.elements);
  near(detector(result, 4).powerByWavelength['650'], 1);
  near(detector(result, 5).powerByWavelength['532'], 1);
});

test('fiber preset is focused and accepted; displacement and reduced NA lower collection', () => {
  const scene = P.create('fiber-coupling'), fiber = scene.elements.find(element => element.type === 'fiber');
  const measured = detector(O.simulate(scene.elements), fiber.id);
  near(measured.power, 1); near(measured.span, 0);
  assert.equal(measured.acceptedHits, scene.elements[0].rayCount);
  fiber.y += 1;
  near(detector(O.simulate(scene.elements), fiber.id).power, 0);
  fiber.y -= 1; fiber.na = 0.01;
  const restricted = detector(O.simulate(scene.elements), fiber.id);
  assert.ok(restricted.power > 0 && restricted.power < measured.power);
  fiber.na = 0.12;
  scene.elements.find(element => element.type === 'iris').opening = 0;
  near(detector(O.simulate(scene.elements), fiber.id).power, 0);
});

test('confocal preset separates excitation from independent point emission at a conjugate pinhole', () => {
  const scene = P.create('confocal'), emission = scene.elements.find(element => element.id === 4);
  const result = O.simulate(scene.elements), measured = detector(result, 7);
  near(measured.power, emission.power);
  near(measured.powerByWavelength['650'], emission.power);
  assert.equal(measured.powerByWavelength['532'] || 0, 0);
  assert.equal(measured.acceptedHits, emission.rayCount);
  const pinholeHits = result.segments.filter(segment => segment.sourceId === 4 && endAt(segment, 600, 500));
  assert.equal(pinholeHits.length, emission.rayCount);
  const blockerHits = result.segments.filter(segment => segment.sourceId === 1 && Math.abs(segment.b.y - 70) < 1e-7);
  assert.equal(blockerHits.length, scene.elements[0].rayCount);
});

test('confocal pinhole rejects most sampled axial-defocus emission; opening it restores collection', () => {
  const scene = P.create('confocal');
  scene.elements.find(element => element.id === 1).enabled = false;
  scene.elements.find(element => element.id === 4).enabled = false;
  const defocus = scene.elements.find(element => element.id === 9); defocus.enabled = true;
  const closed = detector(O.simulate(scene.elements), 7);
  assert.ok(closed.power > 0, 'the axial geometric ray remains transmitted');
  assert.ok(closed.power < 0.3 * defocus.power, 'the narrow pinhole rejects most defocus rays');
  scene.elements.find(element => element.type === 'iris').opening = 12;
  const open = detector(O.simulate(scene.elements), 7);
  near(open.power, defocus.power);
  assert.ok(open.acceptedHits > closed.acceptedHits);
});

test('beam splitter preset conserves total detected power at 50/50 and 25/75', () => {
  const scene = P.create('beam-splitter'), splitter = scene.elements.find(element => element.type === 'splitter');
  for (const transmission of [0.5, 0.25]) {
    splitter.transmission = transmission;
    const result = O.simulate(scene.elements);
    near(detector(result, 4).power, transmission);
    near(detector(result, 5).power, 1 - transmission);
    near(result.detectors.reduce((sum, entry) => sum + entry.power, 0), 1);
  }
});
