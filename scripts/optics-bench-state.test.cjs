const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const O = require('../optics-bench/optics.js');
const S = require('../optics-bench/state.js');
const P = require('../optics-bench/presets.js');
const C = require('../optics-bench/coherence.js');
const Q = require('../optics-bench/share.js');
const { gzipSync } = require('node:zlib');

const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const clone = value => JSON.parse(JSON.stringify(value));
const basic = () => S.defaultScene([O.createElement('laser', 1, 150, 300)]);
const simulate = scene => O.simulate(scene.elements, { fiberLinks: scene.fiberLinks });
const detector = (result, id) => {
  const found = result.detectors.find(entry => entry.id === id);
  assert.ok(found, `detector ${id} exists`);
  return found;
};

test('new 5 mm lasers serialize explicitly while legacy omitted widths remain 12 mm', () => {
  const source=O.createElement('laser',1,100,300),saved=S.serialize(S.defaultScene([source]));
  assert.equal(source.beamWidth,5);assert.equal(JSON.parse(saved).elements[0].beamWidth,5);
  const legacy=JSON.parse(saved);delete legacy.elements[0].beamWidth;
  assert.equal(S.parse(JSON.stringify(legacy)).elements[0].beamWidth,12);
  legacy.elements[0].beamWidth=7.5;assert.equal(S.parse(JSON.stringify(legacy)).elements[0].beamWidth,7.5);
});
const endAt = (segment, x, y) => Math.abs(segment.b.x - x) < 1e-7 && Math.abs(segment.b.y - y) < 1e-7;

test('compressed share links round-trip every preset with exact settings and smaller payloads', async () => {
  for (const preset of P.list) {
    const scene = P.create(preset.id), before = S.serialize(scene), hash = await Q.encode(scene);
    assert.match(hash, /^#ob1=[A-Za-z0-9_-]+$/); assert.ok(hash.length < before.length);
    assert.equal(S.serialize(await Q.decode(hash)), before, preset.id); assert.equal(S.serialize(scene), before);
  }
});

test('source bandwidth and sampling survive design, component and compressed-link round trips', async () => {
  for (const type of ['laser','point','white']) {
    const source={...O.createElement(type,1,100,300),wavelength:550.125,wavelengthWidth:300.25,spectralSamples:30};
    const scene=S.defaultScene([source],{unit:'in'});
    assert.deepEqual(S.parse(S.serialize(scene)),scene);
    assert.deepEqual(S.parseComponent(S.serializeComponent(source)),source);
    assert.deepEqual(await Q.decode(await Q.encode(scene)),scene);
    assert.deepEqual(O.simulate(S.parse(S.serialize(scene)).elements),O.simulate(scene.elements));
  }
});

test('multi-component clipboard records retain precision and internal fiber links while single copies stay compatible', () => {
  const a={...O.createElement('fiber',7,100.125,200.25),label:'入力'},b={...O.createElement('fiber',9,500.75,600.5),angle:180,label:'出力'};
  const selection=S.serializeSelection([a,b],[{a:7,b:9}]);assert.match(selection,/^Optics Bench selection v1\n/);
  assert.deepEqual(S.parseSelection(selection),{elements:[a,b],fiberLinks:[{a:7,b:9}]});
  assert.deepEqual(S.parseSelection(selection.replace(/\n/g,'\r\n')),{elements:[a,b],fiberLinks:[{a:7,b:9}]});
  const one=S.serializeSelection([a],[{a:7,b:9}]);assert.match(one,/^Optics Bench component v1\n/);
  assert.deepEqual(S.parseSelection(one),{elements:[a],fiberLinks:[]});assert.deepEqual(S.parseComponent(one),a);
  assert.throws(()=>S.serializeSelection([],[]));assert.throws(()=>S.parseSelection('not optics'));
  assert.throws(()=>S.parseSelection(S.SELECTION_PREFIX+JSON.stringify({...S.defaultScene([a]),extra:true})));
});

test('legacy source records stay monochromatic and omit default spectral fields when saved', () => {
  const scene=basic(), record=JSON.parse(S.serialize(scene));
  assert.equal(Object.hasOwn(record.elements[0],'wavelengthWidth'),false);
  assert.equal(Object.hasOwn(record.elements[0],'spectralSamples'),false);
  const restored=S.parse(JSON.stringify(record)); assert.equal(restored.elements[0].wavelengthWidth,0);
  assert.equal(restored.elements[0].spectralSamples,17); assert.deepEqual(restored,scene);
  restored.elements[0].spectralSamples=61;
  assert.equal(S.parse(S.serialize(restored)).elements[0].spectralSamples,61);
});

test('source bands reject out-of-domain edges and invalid sampling without changing valid input', () => {
  for (const type of ['laser','point','white']) {
    const source=O.createElement(type,1,100,300);
    for (const changes of [{wavelengthWidth:-.1},{wavelengthWidth:2301},{wavelengthWidth:1e-15},
      {wavelength:200,wavelengthWidth:1},{wavelength:2500,wavelengthWidth:1},{spectralSamples:2},
      {spectralSamples:62},{spectralSamples:3.5},{wavelengthWidth:NaN},{spectralSamples:Infinity}]) {
      assert.throws(()=>S.defaultScene([{...source,...changes}]));
      assert.throws(()=>S.serializeComponent({...source,...changes}));
    }
    for(const changes of [{wavelength:200,wavelengthWidth:0},{wavelength:2500,wavelengthWidth:0},
      {wavelength:1350,wavelengthWidth:2300,spectralSamples:61}]) {
      const scene=S.defaultScene([{...source,...changes}]); assert.deepEqual(S.parse(S.serialize(scene)),scene);
    }
  }
});

test('share snapshots preserve all types, precision, unicode, disabled parts and fiber connections', async () => {
  const elements = Object.keys(O.TYPES).map((type,i)=>({ ...O.createElement(type,i+1,0,0),x:-10000.123456789+i*200,y:9876.123456789,
    label:'部品 '+type+' 🧪',enabled:i%2===0,angle:22.5123456789 }));
  const fiber=elements.find(e=>e.type==='fiber'),camera=elements.find(e=>e.type==='camera');
  elements.push({...fiber,id:99,x:9999});camera.pixelCount=512;camera.exposure=3.21;camera.autoExposure=false;
  const scene=S.defaultScene(elements,{title:'共有テスト 光学系 🧪',unit:'in',gridStep:6.35,snap:false,angleSnap:false,fiberLinks:[{a:fiber.id,b:99}]});
  const promise=Q.encode(scene), before=S.serialize(scene);scene.title='後の編集';
  assert.equal(S.serialize(await Q.decode(await promise)),before);
  assert.equal((await Q.decode(await Q.encode(S.defaultScene([])))).elements.length,0);
});

test('share links handle the maximum component count without rounding or exceeding their bound', async () => {
  const elements=Array.from({length:80},(_,i)=>({...O.createElement('laser',i+1,0,0),x:i*100.123456789,
    wavelength:400+i,label:'光源 '+i+' 測定用',power:i+0.123456789}));
  const scene=S.defaultScene(elements),hash=await Q.encode(scene);
  assert.ok(hash.length < Q.MAX_HASH_CHARS);assert.equal(S.serialize(await Q.decode(hash)),S.serialize(scene));
});

test('share decoder ignores ordinary anchors and rejects unsupported, broken and oversized encodings', async () => {
  for(const hash of ['', '#guide', '#components'])assert.equal(await Q.decode(hash),null);
  for(const hash of ['#ob2=AAAA','#ob1=','#ob1=A','#ob1=abc=','#ob1=abc%20','#ob1=abcd!', '#ob1='+ 'A'.repeat(Q.MAX_HASH_CHARS)])await assert.rejects(Q.decode(hash));
  const hash=await Q.encode(basic());await assert.rejects(Q.decode(hash.slice(0,-4)));
  const bytes=gzipSync(S.serialize(basic()));bytes[bytes.length-8]^=1;await assert.rejects(Q.decode(Q.PREFIX+bytes.toString('base64url')));
});

test('share decoder bounds expanded data and reuses strict schema and UTF-8 validation', async () => {
  const packed=value=>Q.PREFIX+gzipSync(value).toString('base64url');
  await assert.rejects(Q.decode(packed(' '.repeat(S.MAX_BYTES+1))),/256 KiB/);
  await assert.rejects(Q.decode(packed(Buffer.from([0xc3,0x28]))));
  for(const mutate of [s=>{s.elements[0].type='unknown';},s=>{s.elements[0].x=1e10;},s=>{s.elements[0].label='<script>';},
    s=>{s.elements[0].pixelCount=1e9;},s=>{s.fiberLinks=[{a:1,b:2}];},s=>{s.extra=true;},s=>{s.elements[0].__proto__={bad:true};}]) {
    const scene=JSON.parse(S.serialize(basic()));mutate(scene);
    // A changed JS prototype is not serialized; test an explicit JSON key instead.
    if(Object.getPrototypeOf(scene.elements[0])!==Object.prototype)Object.defineProperty(scene.elements[0],'__proto__',{value:{bad:true},enumerable:true});
    await assert.rejects(Q.decode(packed(JSON.stringify(scene))));
  }
});

test('share URL targets the published page from local files and loopback without carrying query data', () => {
  for(const href of ['file:///C:/work/optics-bench/index.html','http://127.0.0.1:8877/optics-bench/?secret=1#old','http://localhost:3000/','http://[::1]:8000/']) {
    assert.deepEqual(Q.target(href),{url:Q.PUBLIC_URL,local:true});
  }
  assert.deepEqual(Q.target('https://example.org/optics-bench/index.html?secret=1#old'),{url:'https://example.org/optics-bench/index.html',local:false});
  assert.throws(()=>Q.target('javascript:alert(1)'));
});

test('short-link client sends only the compressed hash and accepts the configured service URL', async () => {
  const hash = await Q.encode(basic()), calls = [];
  const short = 'https://optics-bench-links.shun-kanai-a7.workers.dev/Abcdefgh_123';
  const result = await Q.shorten(hash, async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 201, json: async () => ({ url: short }) };
  });
  assert.equal(result, short);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, Q.SHORT_LINK_API);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].options.body), { hash });
  assert.equal(typeof calls[0].options.signal, 'object');
});

test('short-link client rejects throttling, foreign redirects and malformed responses', async () => {
  const hash = await Q.encode(basic());
  await assert.rejects(Q.shorten(hash, async () => ({ ok: false, status: 429, json: async () => ({ error: 'rate_limited' }) })), /1分/);
  await assert.rejects(Q.shorten(hash, async () => ({ ok: true, status: 201, json: async () => ({ url: 'https://example.org/Abcdefgh_123' }) })), /不正な応答/);
  await assert.rejects(Q.shorten(hash, async () => ({ ok: true, status: 201, json: async () => ({ url: Q.SHORT_LINK_API + '?id=abc' }) })), /不正な応答/);
  await assert.rejects(Q.shorten(hash, async () => ({ ok: true, status: 201, json: async () => ({ url: 'not a URL' }) })), /不正な応答/);
  await assert.rejects(Q.shorten('#ob1=bad', null), /接続できません/);
});

test('missing native compression support produces an actionable error without corrupting a scene', async () => {
  const sandbox={OpticsState:S,TextEncoder,TextDecoder,atob,btoa};sandbox.window=sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../optics-bench/share.js'),'utf8'),sandbox);
  const before=S.serialize(basic());await assert.rejects(sandbox.OpticsShare.encode(basic()),/未対応/);
  await assert.rejects(sandbox.OpticsShare.decode(await Q.encode(basic())),/未対応/);assert.equal(S.serialize(basic()),before);
});

test('wide and negative coordinates survive design and clipboard round trips without changing schema', () => {
  for (const [x, y] of [[-25000.125, 180000.875], [-O.COORDINATE_LIMIT, O.COORDINATE_LIMIT]]) {
    const component = { ...O.createElement('laser', 1, x, y), x, y, wavelength: 450 };
    const scene = S.defaultScene([component], { unit: 'in', gridStep: 25.4 });
    assert.deepEqual(S.parse(S.serialize(scene)), scene);
    assert.deepEqual(S.parseComponent(S.serializeComponent(component)), component);
    assert.equal(scene.schemaVersion, 2);
    near(S.fromDisplay(S.toDisplay(x, 'in'), 'in'), x, 1e-6);
  }
});

test('all presets retain their measured optics after large translations across negative coordinates', () => {
  for (const item of P.list) {
    const scene = P.create(item.id), initial = simulate(scene);
    for (const [dx, dy] of [[-50000, 25000], [1000000, -200000]]) {
      const moved = S.defaultScene(scene.elements.map(e => ({ ...e, x: e.x + dx, y: e.y + dy })), { fiberLinks: scene.fiberLinks });
      const result = simulate(S.parse(S.serialize(moved)));
      near(result.detectedPower, initial.detectedPower); near(result.sourcePower, initial.sourcePower);
      near(result.absorbedPower, initial.absorbedPower); near(result.discardedPower, initial.discardedPower);
      assert.equal(result.truncated, false, item.id);
      for (const before of initial.detectors) {
        const after = detector(result, before.id); near(after.power, before.power);
        for (const key of ['I', 'Q', 'U', 'V']) near(after.stokes[key], before.stokes[key]);
        if (before.acceptedHits) {
          near(after.centroid.x - dx, before.centroid.x, 1e-5); near(after.centroid.y - dy, before.centroid.y, 1e-5);
          near(after.span, before.span, 1e-5);
        }
      }
    }
  }
});

test('JSON round trip preserves every component type, physical coordinates and user settings', () => {
  const elements = Object.keys(O.TYPES).map((type, index) => O.createElement(type, index + 1, 100 + 40 * index, 300));
  const scene = S.defaultScene(elements, { title: '実験系 λ532', unit: 'in', gridStep: 12.7, snap: false, angleSnap: false });
  scene.elements[0].x = 137.625;
  scene.elements[0].label = 'レーザー A / 入射';
  scene.elements[0].polAngle = 21.3;
  scene.elements[1].enabled = false;
  scene.elements[2].angle = 22.5;
  scene.elements[2].axisAngle = 68.4;
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
  assert.equal(scene.schemaVersion, 2);
  assert.deepEqual(scene.fiberLinks, []);
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
  for (const changes of [{ format: 'other' }, { schemaVersion: 3 }, { schemaVersion: '1' }, { elements: {} }, { unit: 'inch' }]) {
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
    x: [-O.COORDINATE_LIMIT - 1, O.COORDINATE_LIMIT + 1, Infinity, '150'], y: [-O.COORDINATE_LIMIT - 1, O.COORDINATE_LIMIT + 1, NaN], angle: [-0.1, 360.1],
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

test('schema-1 designs migrate without links and all design writers use schema 2', () => {
  const legacy = clone(P.create('starter'));
  legacy.schemaVersion = 1;
  delete legacy.fiberLinks;
  const original = clone(legacy), migrated = S.parse(JSON.stringify(legacy));
  assert.deepEqual(migrated, { ...legacy, schemaVersion: 2, fiberLinks: [] });
  assert.deepEqual(legacy, original);
  assert.equal(JSON.parse(S.serialize(legacy)).schemaVersion, 2);
  assert.deepEqual(S.parse(S.serialize(legacy)), migrated);
  const omitted = { ...migrated };
  delete omitted.fiberLinks;
  assert.deepEqual(S.validateScene(omitted).fiberLinks, []);
  for (const fiberLinks of [[], null, [{ a: 1, b: 2 }]]) {
    assert.throws(() => S.parse(JSON.stringify({ ...legacy, fiberLinks })), /保存形式1/);
  }
});

test('legacy splitter remains an adjustable NPBS through schema-1/2 imports and component copies', () => {
  for (const schemaVersion of [1, 2]) for (const transmission of [0.25, 0.7]) {
    const input = P.create('beam-splitter');
    input.schemaVersion = schemaVersion;
    if (schemaVersion === 1) delete input.fiberLinks;
    const splitter = input.elements.find(element => element.type === 'splitter');
    splitter.transmission = transmission;
    splitter.label = '以前のBS';
    const original = clone(input), restored = S.parse(JSON.stringify(input));
    const restoredSplitter = restored.elements.find(element => element.id === splitter.id);
    assert.equal(restored.schemaVersion, 2);
    assert.deepEqual(restoredSplitter, splitter);
    assert.deepEqual(S.parse(S.serialize(restored)).elements, restored.elements);
    const copied = S.parseComponent(S.serializeComponent(splitter));
    assert.deepEqual(copied, splitter);
    const payload = JSON.parse(S.serializeComponent(splitter).slice(S.COMPONENT_PREFIX.length));
    assert.equal(payload.schemaVersion, 1);
    assert.equal(payload.elements[0].type, 'splitter');
    for (const polAngle of [0, 90]) {
      restored.elements[0].polAngle = polAngle;
      const result = simulate(restored);
      near(detector(result, 4).power, transmission);
      near(detector(result, 5).power, 1 - transmission);
    }
    assert.deepEqual(input, original);
  }
});

test('PBS placement and settings survive design, unit and clipboard round trips without a schema change', () => {
  const scene = P.create('polarizing-splitter');
  const pbs = scene.elements.find(element => element.type === 'pbs');
  Object.assign(pbs, { x: 512.375, y: 284.625, angle: 37.2, aperture: 112.5, enabled: false, label: 'PBS A' });
  const original = clone(scene), restored = S.parse(S.serialize(scene));
  assert.equal(restored.schemaVersion, 2);
  assert.deepEqual(restored, original);
  const inches = S.switchUnit(scene, 'in');
  near(inches.gridStep, 25.4);
  assert.deepEqual(inches.elements, original.elements);
  assert.deepEqual(S.switchUnit(inches, 'cm').elements, original.elements);
  const clipboard = S.serializeComponent(pbs);
  assert.deepEqual(S.parseComponent(clipboard), pbs);
  assert.deepEqual(S.parseComponent(clipboard.replaceAll('\n', '\r\n')), pbs);
  // The old wrapper format does not make a new component type readable by older editors.
  const payload = JSON.parse(clipboard.slice(S.COMPONENT_PREFIX.length));
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.elements[0].type, 'pbs');
  restored.elements[1].angle = 0;
  inches.elements[1].label = '別のコピー';
  assert.deepEqual(scene, original);
});

test('PBS imports use the same strict field and range validation and cannot become a fiber endpoint', () => {
  const scene = P.create('polarizing-splitter'), original = clone(scene);
  for (const changes of [{ type: 'PBS' }, { x: Infinity }, { angle: NaN }, { aperture: 301 },
    { enabled: 'true' }, { label: '<script>unsafe</script>' }, { pbsAxis: 45 }]) {
    const invalid = clone(scene);
    Object.assign(invalid.elements[1], changes);
    assert.throws(() => S.validateScene(invalid));
    assert.throws(() => S.parse(JSON.stringify(invalid)));
    assert.throws(() => S.serializeComponent(invalid.elements[1]));
  }
  const linked = P.create('fiber-link');
  linked.elements.push({ ...scene.elements[1], id: 7 });
  linked.fiberLinks = [{ a: 3, b: 7 }];
  assert.throws(() => S.validateScene(linked), /ファイバー端面同士/);
  assert.deepEqual(scene, original);
});

test('fiber link arrays survive JSON and unit changes as independent copies', () => {
  const scene = P.create('fiber-link'), original = clone(scene);
  const validated = S.validateScene(scene), restored = S.parse(S.serialize(scene));
  assert.deepEqual(validated, scene);
  assert.deepEqual(restored, scene);
  const inches = S.switchUnit(scene, 'in');
  assert.equal(inches.unit, 'in');
  near(inches.gridStep, 25.4);
  assert.deepEqual(inches.elements, scene.elements);
  assert.deepEqual(inches.fiberLinks, scene.fiberLinks);
  assert.deepEqual(S.switchUnit(inches, 'cm').fiberLinks, scene.fiberLinks);
  const suppliedLinks = Object.freeze([Object.freeze({ a: 3, b: 4 })]);
  const fresh = S.defaultScene(scene.elements, { fiberLinks: suppliedLinks });
  assert.notStrictEqual(fresh.fiberLinks, suppliedLinks);
  assert.notStrictEqual(fresh.fiberLinks[0], suppliedLinks[0]);
  validated.fiberLinks[0].a = 999;
  restored.fiberLinks.length = 0;
  inches.fiberLinks[0].b = 999;
  fresh.fiberLinks[0].a = 4;
  assert.deepEqual(scene, original);
  assert.deepEqual(suppliedLinks, [{ a: 3, b: 4 }]);
  const disabled = clone(scene);
  disabled.elements.find(element => element.id === 4).enabled = false;
  assert.deepEqual(S.validateScene(disabled).fiberLinks, scene.fiberLinks);
});

test('40 fiber pairs fit the 80-component cap and a 41st link is rejected', () => {
  const elements = Array.from({ length: S.MAX_ELEMENTS }, (_, index) => O.createElement('fiber', index + 1, 500, 300));
  const fiberLinks = Array.from({ length: S.MAX_FIBER_LINKS }, (_, index) => ({ a: 2 * index + 1, b: 2 * index + 2 }));
  const scene = S.defaultScene(elements, { fiberLinks });
  const restored = S.parse(S.serialize(scene));
  assert.equal(restored.fiberLinks.length, 40);
  assert.deepEqual(restored.fiberLinks, fiberLinks);
  assert.throws(() => S.validateScene({ ...scene, fiberLinks: [...fiberLinks, { a: 1, b: 2 }] }), /40本以下/);
});

test('fiber links require distinct real fiber IDs and at most one cable per endpoint', () => {
  const scene = P.create('fiber-link');
  scene.elements.push(O.createElement('fiber', 7, 200, 100), O.createElement('fiber', 8, 250, 100));
  const original = clone(scene);
  const valid = [{ a: 4, b: 3 }, { a: 8, b: 7 }];
  assert.deepEqual(S.validateScene({ ...scene, fiberLinks: valid }).fiberLinks, valid);
  for (const fiberLinks of [null, undefined, {}, '[]', 0]) {
    assert.throws(() => S.validateScene({ ...scene, fiberLinks }));
  }
  for (const fiberLinks of [
    [null], [[]], [{}], [{ a: 3 }], [{ b: 4 }], [{ a: 3, b: 4, kind: 'cable' }],
    [{ a: 1, b: 4 }], [{ a: 3, b: 999 }], [{ a: 3, b: 3 }], [{ a: 3, b: '4' }],
    [{ a: 3, b: 4.1 }], [{ a: 0, b: 4 }], [{ a: 3, b: NaN }], [{ a: Infinity, b: 4 }],
    [{ a: 3, b: 1000000001 }], [{ a: 3, b: 4 }, { a: 3, b: 4 }],
    [{ a: 3, b: 4 }, { a: 4, b: 3 }], [{ a: 3, b: 4 }, { a: 7, b: 4 }]
  ]) {
    const invalid = { ...scene, fiberLinks };
    assert.throws(() => S.validateScene(invalid));
    assert.throws(() => S.parse(JSON.stringify(invalid)));
    assert.deepEqual(scene, original);
  }
});

test('fiber links reject dangerous keys, inherited records and getters without evaluating them', () => {
  const scene = P.create('fiber-link'), text = JSON.stringify({ ...scene, fiberLinks: [] });
  for (const record of [
    '{"a":3,"b":4,"__proto__":{"polluted":true}}',
    '{"a":3,"b":4,"constructor":{"prototype":{"polluted":true}}}',
    '{"a":3,"b":4,"html":"<script>alert(1)</script>"}',
    '{"a":{"value":3},"b":4}'
  ]) assert.throws(() => S.parse(text.replace('"fiberLinks":[]', `"fiberLinks":[${record}]`)));
  assert.equal({}.polluted, undefined);
  assert.throws(() => S.validateScene({ ...scene, fiberLinks: [Object.create({ a: 3, b: 4 })] }));
  let evaluated = false;
  const getter = { b: 4 };
  Object.defineProperty(getter, 'a', { enumerable: true, get() { evaluated = true; return 3; } });
  assert.throws(() => S.validateScene({ ...scene, fiberLinks: [getter] }), /読み込めない/);
  assert.equal(evaluated, false);
});

test('component clipboard snapshots preserve every parameter of all supported component types', () => {
  assert.equal(S.COMPONENT_PREFIX, 'Optics Bench component v1\n');
  for (const [index, type] of Object.keys(O.TYPES).entries()) {
    const element = Object.freeze({ ...O.createElement(type, index + 1, 150, 300),
      x: 147.125, y: 289.625, angle: 137.2, aperture: 72, focal: type === 'concave' ? 123.5 : -123.5, beamWidth: 31.25,
      wavelength: 633.8, power: 2.75, rayCount: 13, divergence: 41.7,
      polarization: ['linear', 'right', 'left', 'unpolarized'][index % 4], polAngle: 21.3,
      axisAngle: 68.4, designWavelength: 589.2, opening: 9.1, coreDiameter: 0.17, na: 0.37,
      transmission: 0.29, cutoff: 607.3, mode: 'shortpass', enabled: index % 2 === 0,
      label: `部品 ${type} A`
    });
    const text = S.serializeComponent(element);
    assert.ok(text.startsWith(S.COMPONENT_PREFIX));
    assert.deepEqual(S.parseComponent(text), element, type);
    const raw = JSON.parse(text.slice(S.COMPONENT_PREFIX.length));
    assert.equal(raw.schemaVersion, 1);
    assert.equal(Object.hasOwn(raw, 'fiberLinks'), false);
    const wrapper = S.parse(text.slice(S.COMPONENT_PREFIX.length));
    assert.equal(wrapper.schemaVersion, 2);
    assert.deepEqual(wrapper.fiberLinks, []);
    assert.equal(wrapper.unit, 'mm');
    assert.deepEqual(wrapper.elements, [element]);
  }
});

test('component copies are independent snapshots even after source or pasted components change', () => {
  const scene = P.create('confocal'), source = scene.elements.find(element => element.id === 4);
  const original = clone(source), text = S.serializeComponent(source);
  assert.deepEqual(source, original);
  source.wavelength = 1064;
  source.label = '変更後の光源';
  const first = S.parseComponent(text), second = S.parseComponent(text);
  assert.deepEqual(first, original);
  first.x = 250;
  first.label = '貼り付け先で編集';
  assert.deepEqual(second, original);
  assert.deepEqual(S.parseComponent(text), original);
  assert.equal(source.wavelength, 1064);
  assert.equal(source.label, '変更後の光源');
});

test('filter modes and inactive settings round-trip JSON, unit changes, clipboard and shared URLs', async () => {
  for (const filterMode of O.FILTER_MODES) {
    const filter = {...O.createElement('filter',1,-1200,300),filterMode,bandLow:450.123456789,bandHigh:532.987654321,cutoff:650.123456789,opticalDensity:1.23456789,transmission:.8123456789};
    for (const unit of ['mm','cm','in']) {
      const scene = S.defaultScene([filter], {unit});
      assert.deepEqual(S.parse(S.serialize(scene)),scene);
      assert.deepEqual(S.parseComponent(S.serializeComponent(filter)),filter);
      assert.deepEqual(await Q.decode(await Q.encode(scene)),scene);
      assert.deepEqual(S.switchUnit(scene,'in').elements,[filter]);
    }
  }
  const old = JSON.parse(S.serialize(basic())).elements[0];
  for (const key of ['filterMode','bandLow','bandHigh','opticalDensity']) assert.equal(Object.hasOwn(old,key),false);
  const restored = S.validateScene({...basic(),elements:[{id:1,type:'filter',x:0,y:0}]}).elements[0];
  assert.equal(restored.filterMode,'bandpass'); assert.equal(restored.transmission,1);
  assert.equal(restored.bandLow,500); assert.equal(restored.bandHigh,560);
});

test('filter validation rejects reversed bands, unknown modes and nonnumeric or out-of-range attenuation', () => {
  const filter = O.createElement('filter',1,500,300), scene = S.defaultScene([filter]), before = S.serialize(scene);
  for (const changes of [{filterMode:'notch'},{filterMode:null},{filterMode:['nd']},{bandLow:560},{bandHigh:500},
    {bandLow:199},{bandHigh:2501},{bandLow:'500'},{bandHigh:Infinity},{opticalDensity:-1},{opticalDensity:6.01},{opticalDensity:NaN},{opticalDensity:'1'},{transmission:1.1}]) {
    assert.throws(()=>S.validateScene({...scene,elements:[{...filter,...changes}]}));
    assert.equal(S.serialize(scene),before);
  }
  assert.throws(()=>S.validateScene({...scene,elements:[{...O.createElement('dichroic',1,0,0),mode:'nd'}]}),/ダイクロイック/);
});

test('fluorescent settings survive designs, component copies and links while invalid wavelength order is rejected', async () => {
  const plate = { ...O.createElement('fluorescent', 1, -500.125, 300.25), aperture: 82.5, cutoff: 455.25,
    wavelength: 612.75, transmission: .4321, rayCount: 37, divergence: 287.5, angle: 22.5, label: '蛍光変換板' };
  for (const unit of ['mm', 'cm', 'in']) {
    const scene = S.defaultScene([plate], { unit });
    assert.deepEqual(S.parse(S.serialize(scene)), scene);
    assert.deepEqual(S.parseComponent(S.serializeComponent(plate)), plate);
    assert.deepEqual(await Q.decode(await Q.encode(scene)), scene);
  }
  const scene = S.defaultScene([plate]), before = S.serialize(scene);
  for (const changes of [{ wavelength: 450 }, { cutoff: 700 }]) {
    assert.throws(() => S.validateScene({ ...scene, elements: [{ ...plate, ...changes }] }), /蛍光波長/);
    assert.equal(S.serialize(scene), before);
    assert.ok(O.simulate([{ ...plate, ...changes }]).warnings.some(warning => warning.includes('不正')));
  }
});

test('camera 2D sensor settings persist through JSON, units and component clipboard while older records keep their fields', () => {
  const camera = { ...O.createElement('camera', 1, -500, 300), pixelCount: 512, pixelRows: 320, sensorHeight:9.6, spotSize:.8, exposure: 2.5, autoExposure: false, aperture: 12.8, angle: 22.5 };
  for (const unit of ['mm','cm','in']) {
    const scene = S.defaultScene([camera], { unit }); assert.deepEqual(S.parse(S.serialize(scene)), scene);
    assert.deepEqual(S.parseComponent(S.serializeComponent(camera)), camera);
  }
  const ordinary = JSON.parse(S.serialize(P.create('starter')));
  assert.ok(ordinary.elements.every(e=>['pixelCount','pixelRows','sensorHeight','spotSize','exposure','autoExposure'].every(k=>!Object.hasOwn(e,k))));
  const sparse = { id:1,type:'camera',x:100,y:100 };
  const restored = S.validateScene({ ...S.defaultScene(), elements:[sparse] }).elements[0];
  assert.equal(restored.pixelCount,256); assert.equal(restored.pixelRows,192); assert.equal(restored.sensorHeight,18); assert.equal(restored.spotSize,1);
  assert.equal(restored.exposure,1); assert.equal(restored.autoExposure,true);
  const compatible=JSON.parse(S.serialize(S.defaultScene([O.createElement('camera',1,100,100)]))).elements[0];
  assert.ok(['pixelRows','sensorHeight','spotSize'].every(key=>!Object.hasOwn(compatible,key)));
});

test('camera malformed 2D sensor sizes, pixel counts, display gains and booleans are rejected without unsafe allocations', () => {
  const camera = O.createElement('camera',1,500,300), scene = S.defaultScene([camera]);
  for (const changes of [{pixelCount:1e9},{pixelCount:16.5},{pixelCount:0},{pixelRows:1e9},{pixelRows:16.5},{pixelRows:0},
    {sensorHeight:0},{sensorHeight:301},{spotSize:0},{spotSize:301},{exposure:0},{exposure:101},{exposure:NaN},{autoExposure:'false'}]) {
    const bad = { ...camera,...changes }; assert.throws(()=>S.validateScene({ ...scene,elements:[bad] }));
    assert.throws(()=>S.serializeComponent(bad));
    assert.ok(O.simulate([bad]).warnings.some(w=>w.includes('不正')));
  }
});

test('screen target images persist through scenes, components and sharing while old detector screens stay compatible', async () => {
  const screen = { ...O.createElement('screen', 1, -250, 300), aperture:88.5, screenHeight:66.25, screenPattern:'doll', power:2.5, rayCount:9, divergence:7.5, angle:22.5 };
  for (const unit of ['mm','cm','in']) {
    const scene = S.defaultScene([screen], { unit });
    assert.deepEqual(S.parse(S.serialize(scene)), scene);
    assert.deepEqual(S.parseComponent(S.serializeComponent(screen)), screen);
    assert.deepEqual(await Q.decode(await Q.encode(scene)), scene);
  }
  const sparse = { id:1,type:'screen',x:100,y:100 };
  const restored = S.validateScene({ ...S.defaultScene(), elements:[sparse] }).elements[0];
  assert.equal(restored.screenHeight,100); assert.equal(restored.screenPattern,'none');
  const compatible = JSON.parse(S.serialize(S.defaultScene([O.createElement('screen',1,100,100)]))).elements[0];
  assert.equal(Object.hasOwn(compatible,'screenHeight'),false); assert.equal(Object.hasOwn(compatible,'screenPattern'),false);
  const ordinary = JSON.parse(S.serialize(P.create('starter')));
  assert.ok(ordinary.elements.every(element => !Object.hasOwn(element,'screenHeight') && !Object.hasOwn(element,'screenPattern')));
});

test('passive image reflectance persists while removed luminous-doll records are rejected', async () => {
  const target={...O.createElement('screen',1,100,200),screenPattern:'doll',transmission:.72,screenHeight:90,rayCount:13,divergence:35.5,label:'受動人形ターゲット'};
  for(const unit of ['mm','cm','in']){
    const scene=S.defaultScene([target],{unit});assert.deepEqual(S.parse(S.serialize(scene)),scene);
    assert.deepEqual(S.parseComponent(S.serializeComponent(target)),target);
    assert.deepEqual(await Q.decode(await Q.encode(scene)),scene);
  }
  assert.equal(O.createElement('screen',2,100,200).transmission,1);
  assert.throws(()=>O.createElement('doll',1,100,200),/Unknown/);
  assert.throws(()=>S.validateScene({...S.defaultScene(),elements:[{id:1,type:'doll',x:100,y:200}]}),/部品種別/);
});

test('invalid screen target images and heights are rejected without affecting valid screens', () => {
  const screen = O.createElement('screen',1,500,300), scene = S.defaultScene([screen]);
  for (const changes of [{screenHeight:0},{screenHeight:301},{screenHeight:NaN},{screenPattern:'cat'},{screenPattern:1}]) {
    const bad = { ...screen,...changes };
    assert.throws(()=>S.validateScene({ ...scene,elements:[bad] }));
    assert.throws(()=>S.serializeComponent(bad));
    assert.ok(O.simulate([bad]).warnings.some(warning=>warning.includes('不正')));
  }
});

test('concave designs and copies store one focal length with derived curvature in every display unit', () => {
  const mirror = { ...O.createElement('concave', 8, -345.25, 712.75), x: -345.25, y: 712.75, focal: 123.456, aperture: 72, angle: 13.125, label: '凹面' };
  for (const unit of ['mm', 'cm', 'in']) {
    const scene = S.defaultScene([mirror], { unit }), text = S.serialize(scene), restored = S.parse(text);
    assert.equal(restored.schemaVersion, 2); assert.deepEqual(restored.elements, [mirror]);
    assert.equal(Object.hasOwn(JSON.parse(text).elements[0], 'radius'), false);
    near(O.concaveGeometry(restored.elements[0]).radius, 2 * mirror.focal);
    assert.deepEqual(S.parseComponent(S.serializeComponent(mirror)), mirror);
    near(S.fromDisplay(S.toDisplay(2 * mirror.focal, unit), unit), 2 * mirror.focal);
  }
});

test('invalid concave focal lengths and caps fail import and simulation without altering valid records', () => {
  const mirror = O.createElement('concave', 1, 500, 300), valid = S.defaultScene([mirror]);
  for (const changes of [{ focal: -100 }, { focal: 0 }, { focal: 25, aperture: 100 }, { focal: 20, aperture: 100 }]) {
    const bad = { ...mirror, ...changes };
    assert.throws(() => S.validateScene({ ...valid, elements: [bad] }));
    assert.throws(() => S.serializeComponent(bad));
    const result = O.simulate([O.createElement('laser', 2, 100, 300), bad]);
    assert.equal(result.hitCount, 0); assert.ok(result.warnings.some(w => w.includes('不正')));
  }
  for (const changes of [{ focal: 1, aperture: 2 }, { focal: 25.001, aperture: 100 }, { focal: 1000, aperture: 300 }]) {
    const good = { ...mirror, ...changes };
    assert.deepEqual(S.validateScene({ ...valid, elements: [good] }).elements, [good]);
  }
  assert.deepEqual(valid.elements, [mirror]);
});

test('a connected fiber is copied without cables and component readers accept either design schema', () => {
  const scene = P.create('fiber-link'), original = clone(scene);
  const fiber = scene.elements.find(element => element.id === 3);
  const copied = S.parseComponent(S.serializeComponent(fiber));
  assert.deepEqual(copied, fiber);
  const destination = S.defaultScene([copied]);
  assert.deepEqual(destination.fiberLinks, []);
  assert.deepEqual(S.parseComponent(S.COMPONENT_PREFIX + S.serialize(destination)), fiber);
  assert.throws(() => S.parseComponent(S.COMPONENT_PREFIX + JSON.stringify({ ...destination, fiberLinks: scene.fiberLinks })));
  assert.deepEqual(scene, original);
});

test('component clipboard requires the exact prefix and one valid component', () => {
  const json = S.serialize(basic());
  let coerced = false;
  const object = { toString() { coerced = true; return S.COMPONENT_PREFIX + json; } };
  for (const value of [null, undefined, 1, object, '', json, 'ordinary text',
    ' Optics Bench component v1\n' + json, 'Optics Bench component v1\r\r\n' + json,
    'Optics Bench component v0\r\n' + json, 'Optics Bench component v2\n' + json,
    'Other App component v1\r\n' + json, '\uFEFF' + S.COMPONENT_PREFIX + json]) {
    assert.throws(() => S.parseComponent(value));
  }
  assert.equal(coerced, false);
  for (const value of ['', '{', 'null', '[]', '42']) assert.throws(() => S.parseComponent(S.COMPONENT_PREFIX + value));
  const empty = S.defaultScene();
  const multiple = S.defaultScene([O.createElement('laser', 1, 150, 300), O.createElement('mirror', 2, 500, 300)]);
  for (const scene of [empty, multiple]) assert.throws(() => S.parseComponent(S.COMPONENT_PREFIX + S.serialize(scene)), /1個/);
});

test('component clipboard accepts LF and native Windows CRLF header separators', () => {
  const element = { ...basic().elements[0], label: 'コピーしたレーザー' };
  const text = S.serializeComponent(element);
  const crlfHeader = S.COMPONENT_PREFIX.replace('\n', '\r\n');
  assert.deepEqual(S.parseComponent(text), element);
  assert.deepEqual(S.parseComponent(crlfHeader + text.slice(S.COMPONENT_PREFIX.length)), element);
  assert.deepEqual(S.parseComponent(text.replaceAll('\n', '\r\n')), element);
});

test('component clipboard bounds the entire UTF-8 payload before parsing its JSON', () => {
  const element = basic().elements[0], valid = S.serializeComponent(element);
  const padding = S.MAX_BYTES - Buffer.byteLength(valid, 'utf8');
  const atLimit = valid + ' '.repeat(padding);
  assert.deepEqual(S.parseComponent(atLimit), element);
  assert.throws(() => S.parseComponent(atLimit + ' '), /256 KiB/);
  const oversizedCrlf = atLimit.replace(S.COMPONENT_PREFIX, S.COMPONENT_PREFIX.replace('\n', '\r\n'));
  assert.throws(() => S.parseComponent(oversizedCrlf), /256 KiB/, 'the original header byte is counted before normalization');
  assert.deepEqual(S.parseComponent(oversizedCrlf.slice(0, -1)), element);
  const multibyte = S.COMPONENT_PREFIX + 'あ'.repeat(Math.floor(S.MAX_BYTES / 3) + 1);
  assert.ok(multibyte.length < S.MAX_BYTES);
  assert.throws(() => S.parseComponent(multibyte), /256 KiB/);
});

test('component clipboard reuses strict validation for malicious and invalid element data', () => {
  const current = P.create('relay-4f'), original = clone(current);
  for (const changes of [{ x: Infinity }, { power: NaN }, { wavelength: 2501 }, { focal: 0 },
    { id: 0 }, { type: 'script' }, { enabled: 'false' }, { polarization: 'elliptic' },
    { label: '<img src=x onerror=alert(1)>' }, { label: { html: 'not text' } }, { unknown: true }]) {
    const element = { ...basic().elements[0], ...changes }, unchanged = { ...element };
    assert.throws(() => S.serializeComponent(element));
    assert.throws(() => S.parseComponent(S.COMPONENT_PREFIX + JSON.stringify({ ...basic(), elements: [element] })));
    assert.deepEqual(element, unchanged);
  }
  const valid = S.serializeComponent(basic().elements[0]);
  for (const payload of [
    valid.replace('"format":', '"__proto__":{"polluted":true},"format":'),
    valid.replace('"type":', '"constructor":{"prototype":{"polluted":true}},"type":'),
    valid.replace('"power": 1', '"power": 1e999'),
    valid.replace('"schemaVersion": 1', '"schemaVersion": 3'),
    valid.replace('"format": "optics-bench"', '"format": "other"')
  ]) assert.throws(() => S.parseComponent(payload));
  assert.equal({}.polluted, undefined);
  assert.deepEqual(current, original);
});

test('browser globals load without Node, DOM access or network APIs', () => {
  const context = vm.createContext({});
  for (const filename of ['optics.js', 'state.js', 'presets.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../optics-bench', filename), 'utf8'), context, { filename });
  }
  const result = vm.runInContext('OpticsState.parse(OpticsState.serialize(OpticsPresets.create("starter")))', context);
  assert.equal(result.format, 'optics-bench');
  assert.equal(result.elements.length, 4);
  const component = vm.runInContext('OpticsState.parseComponent(OpticsState.serializeComponent(OpticsPresets.create("starter").elements[0]))', context);
  assert.equal(component.type, 'laser');
  assert.equal(component.wavelength, 532);
});

test('preset factories return independent validated scenes and reject unknown IDs', () => {
  assert.equal(P.list.length, 29);
  assert.equal(new Set(P.list.map(entry => entry.id)).size, P.list.length);
  const a = P.create('starter'), b = P.create('starter');
  a.elements[0].x += 10;
  a.title = 'changed';
  assert.notEqual(a.elements[0].x, b.elements[0].x);
  assert.notEqual(a.title, b.title);
  assert.throws(() => P.create('unknown'));
  const connected = P.create('fiber-link');
  connected.fiberLinks[0].a = 999;
  assert.deepEqual(P.create('fiber-link').fiberLinks, [{ a: 3, b: 4 }]);
  for (const entry of P.list) {
    assert.ok(entry.description.length && entry.notes.length);
    assert.deepEqual(S.parse(S.serialize(P.create(entry.id))), P.create(entry.id));
  }
});

test('phase parameters round trip through scenes and native component copy without requiring preset metadata', () => {
  const scene = P.create('quantum-eraser'), phase = scene.elements.find(e => e.type === 'phase');
  for (const value of [0, 17.3125, 180, 360]) {
    phase.phase = value;
    const loaded = S.parse(S.serialize(scene));
    assert.deepEqual(loaded, scene); assert.deepEqual(S.parseComponent(S.serializeComponent(phase)), phase);
    const r = C.analyze(loaded.elements, O.simulate(loaded.elements, { recordPaths: true }));
    assert.equal(r.valid, true); near(r.detectors.find(d => d.id === 7).power, (1+Math.cos(value*Math.PI/180))/4);
  }
  for (const value of [-1, 360.01, NaN, Infinity, '90', null]) {
    const invalid = clone(scene); invalid.elements.find(e => e.type === 'phase').phase = value;
    assert.throws(() => S.validateScene(invalid));
  }
  for (const e of scene.elements) delete e.phase;
  assert.ok(S.validateScene(scene).elements.every(e => e.phase === 0), 'legacy records default to zero added phase');
  const ordinary = JSON.parse(S.serialize(P.create('starter')));
  assert.ok(ordinary.elements.every(e => !Object.hasOwn(e, 'phase')), 'ordinary zero-phase records keep their older field set');
});

test('new polarization and geometrical experiment presets match their stated measurements', () => {
  for (const [id, measurements] of [
    ['three-polarizers', [[5, .25, 12]]], ['malus-law', [[3, .75, 12]]],
    ['halfwave-attenuator', [[4, .5, 12], [5, .5, 12]]],
    ['circular-analyzer', [[4, 1, 12], [5, 0, 0]]],
    ['polarizer-chain', [[10, Math.cos(Math.PI/16)**16, 12]]],
    ['galilean-telescope', [[4, 1, 24]]], ['dichroic-combiner', [[4, 2, 12]]],
    ['iris-clipping', [[3, 11/21, 20]]],
    ['waveplate-colors', [405, 532, 650].map((wavelength, i) => [4+i*4, Math.sin(Math.PI/4*532/wavelength)**2, 12])]
  ]) {
    const result = simulate(P.create(id));
    for (const [elementId, power, span] of measurements) {
      const d = detector(result, elementId); near(d.power, power); near(d.span, span);
    }
  }
});

test('new preset experiments respond to the suggested polarizer, waveplate, filter and iris controls', () => {
  const three = P.create('three-polarizers'); three.elements.find(e => e.id === 3).enabled = false;
  near(detector(simulate(three), 5).power, 0);
  const malus = P.create('malus-law'); malus.elements[0].polarization = 'unpolarized';
  for (const axisAngle of [0, 45, 90]) { malus.elements[1].axisAngle = axisAngle; near(detector(simulate(malus), 3).power, .5); }
  const circular = P.create('circular-analyzer'); circular.elements[0].polarization = 'left';
  near(detector(simulate(circular), 4).power, 0); near(detector(simulate(circular), 5).power, 1);
  circular.elements[1].enabled = false;
  near(detector(simulate(circular), 4).power, .5); near(detector(simulate(circular), 5).power, .5);
  const combiner = P.create('dichroic-combiner');
  for (const wavelength of [450, 650]) near(detector(simulate(combiner), 4).powerByWavelength[wavelength], 1);
  combiner.elements.find(e => e.type === 'dichroic').mode = 'shortpass'; near(detector(simulate(combiner), 4).power, 0);
  const iris = P.create('iris-clipping');
  for (const [opening, expected] of [[0, 0], [40, 1], [80, 1]]) {
    iris.elements[1].opening = opening; near(detector(simulate(iris), 3).power, expected);
  }
});

for (const preset of P.list) test(`preset ${preset.id}: finite rays reach a useful detector without truncation`, () => {
  const scene = P.create(preset.id), result = simulate(scene);
  assert.ok(result.rayCount > 0);
  assert.ok(result.hitCount > 0);
  assert.equal(result.truncated, false);
  assert.deepEqual(result.warnings, preset.id === 'iris-clipping' ? ['アイリスで光線を遮断しました。透過率は追跡本数に依存する離散的な近似です。'] : []);
  assert.ok(result.detectors.some(entry => entry.power > 0));
  // A connected fiber is an input monitor, so only terminal detections belong in the power ledger.
  near(result.sourcePower, result.detectedPower + result.absorbedPower + result.escapedPower + result.discardedPower);
  for (const segment of result.segments) {
    assert.ok(Number.isFinite(segment.power) && segment.power >= 0);
    for (const point of [segment.a, segment.b]) {
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
      assert.ok(point.x >= result.bounds.x - 1e-6 && point.x <= result.bounds.x + result.bounds.width + 1e-6 && point.y >= result.bounds.y - 1e-6 && point.y <= result.bounds.y + result.bounds.height + 1e-6);
    }
  }
});

test('starter rays pass the mirror and lens and meet on the focal screen', () => {
  const scene = P.create('starter'), result = simulate(scene), screen = detector(result, 4);
  near(screen.power, 1);
  near(screen.centroid.x, 550); near(screen.centroid.y, 123.8); near(screen.span, 0);
  assert.equal(screen.acceptedHits, scene.elements[0].rayCount);
  assert.equal(result.segments.filter(segment => endAt(segment, 550, 123.8)).length, scene.elements[0].rayCount);
});

test('4F preset has the correct conjugate and Fourier spacings and inverted unit magnification', () => {
  const scene = P.create('relay-4f'), [source, l1, fourier, l2, screen] = scene.elements;
  near(l1.x - source.x, l1.focal);
  near(fourier.x - l1.x, l1.focal);
  near(l2.x - fourier.x, l2.focal);
  near(screen.x - l2.x, l2.focal);
  const measured = detector(simulate(scene), screen.id);
  near(measured.power, source.power);
  near(measured.centroid.y - l2.y, -(source.y - l1.y) * l2.focal / l1.focal);
  near(measured.span, 0);
});

test('beam expander produces a parallel 24 mm bundle from a 12 mm input', () => {
  const scene = P.create('beam-expander'), [source, l1, l2, screen] = scene.elements;
  near(l2.x - l1.x, l1.focal + l2.focal);
  const result = simulate(scene), measured = detector(result, screen.id);
  near(measured.span, source.beamWidth * Math.abs(l2.focal / l1.focal));
  near(measured.power, source.power);
  const output = result.segments.filter(segment => Math.abs(segment.a.x - l2.x) < 1e-7 && Math.abs(segment.b.x - screen.x) < 1e-7);
  assert.equal(output.length, source.rayCount);
  for (const segment of output) near(segment.a.y, segment.b.y);
});

test('quarter-wave plate opens crossed polarizers to 50%; disabling it restores extinction', () => {
  const scene = P.create('polarization');
  const measured = detector(simulate(scene), 5);
  near(measured.power, 0.5);
  near(measured.stokes.Q, -0.5); near(measured.stokes.U, 0); near(measured.stokes.V, 0);
  scene.elements.find(element => element.type === 'waveplate').enabled = false;
  near(detector(simulate(scene), 5).power, 0);
});

test('dichroic Longpass and Shortpass send both wavelengths to opposite ports', () => {
  const scene = P.create('dichroic');
  let result = simulate(scene);
  near(detector(result, 4).power, 1); near(detector(result, 5).power, 1);
  near(detector(result, 4).powerByWavelength['532'], 1);
  near(detector(result, 5).powerByWavelength['650'], 1);
  scene.elements.find(element => element.type === 'dichroic').mode = 'shortpass';
  result = simulate(scene);
  near(detector(result, 4).powerByWavelength['650'], 1);
  near(detector(result, 5).powerByWavelength['532'], 1);
});

test('fiber preset is focused and accepted; displacement and reduced NA lower collection', () => {
  const scene = P.create('fiber-coupling'), fiber = scene.elements.find(element => element.type === 'fiber');
  const measured = detector(simulate(scene), fiber.id);
  near(measured.power, 1); near(measured.span, 0);
  assert.equal(measured.acceptedHits, scene.elements[0].rayCount);
  fiber.y += 1;
  near(detector(simulate(scene), fiber.id).power, 0);
  fiber.y -= 1; fiber.na = 0.01;
  const restricted = detector(simulate(scene), fiber.id);
  assert.ok(restricted.power > 0 && restricted.power < measured.power);
  fiber.na = 0.12;
  scene.elements.find(element => element.type === 'iris').opening = 0;
  near(detector(simulate(scene), fiber.id).power, 0);
});

test('fiber-link preset transfers 17 rays and recollimates a 12 mm bundle without double-counting power', () => {
  const scene = P.create('fiber-link'), [source, inputLens, inputFiber, outputFiber, outputLens, screen] = scene.elements;
  assert.deepEqual(scene.fiberLinks, [{ a: inputFiber.id, b: outputFiber.id }]);
  near(inputFiber.x - inputLens.x, inputLens.focal);
  near(outputLens.x - outputFiber.x, outputLens.focal);
  const result = simulate(scene), measured = detector(result, screen.id);
  assert.equal(result.fiberTransfers.length, 17);
  near(result.fiberTransfers.reduce((sum, transfer) => sum + transfer.power, 0), source.power);
  for (const transfer of result.fiberTransfers) {
    assert.equal(transfer.fromId, inputFiber.id);
    assert.equal(transfer.toId, outputFiber.id);
    assert.equal(transfer.sourceId, source.id);
    assert.equal(transfer.wavelength, source.wavelength);
    near(transfer.stokes.I, transfer.power);
    near(transfer.stokes.Q, transfer.power);
    near(transfer.stokes.U, 0); near(transfer.stokes.V, 0);
  }
  near(measured.power, source.power);
  near(measured.powerByWavelength[String(source.wavelength)], source.power);
  near(measured.centroid.x, screen.x); near(measured.centroid.y, screen.y);
  near(measured.span, source.beamWidth);
  assert.equal(measured.acceptedHits, source.rayCount);
  for (const key of ['I', 'Q', 'U', 'V']) near(measured.stokes[key], key === 'I' || key === 'Q' ? source.power : 0);
  const parallel = result.segments.filter(segment => Math.abs(segment.a.x - outputLens.x) < 1e-7 && Math.abs(segment.b.x - screen.x) < 1e-7);
  assert.equal(parallel.length, source.rayCount);
  for (const segment of parallel) near(segment.a.y, segment.b.y);
  near(detector(result, inputFiber.id).power, source.power);
  assert.equal(detector(result, outputFiber.id).hits, 0);
  near(result.detectedPower, source.power);
  scene.fiberLinks = [{ a: outputFiber.id, b: inputFiber.id }];
  near(detector(simulate(scene), screen.id).power, source.power);
  scene.fiberLinks = [];
  const disconnected = simulate(scene);
  assert.deepEqual(disconnected.fiberTransfers, []);
  near(detector(disconnected, screen.id).power, 0);
  near(detector(disconnected, inputFiber.id).power, source.power);
  near(disconnected.detectedPower, source.power);
});

test('confocal preset separates excitation from independent point emission at a conjugate pinhole', () => {
  const scene = P.create('confocal'), emission = scene.elements.find(element => element.id === 4);
  const result = simulate(scene), measured = detector(result, 7);
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
  const closed = detector(simulate(scene), 7);
  assert.ok(closed.power > 0, 'the axial geometric ray remains transmitted');
  assert.ok(closed.power < 0.3 * defocus.power, 'the narrow pinhole rejects most defocus rays');
  scene.elements.find(element => element.type === 'iris').opening = 12;
  const open = detector(simulate(scene), 7);
  near(open.power, defocus.power);
  assert.ok(open.acceptedHits > closed.acceptedHits);
});

test('beam splitter preset conserves total detected power at 50/50 and 25/75', () => {
  const scene = P.create('beam-splitter'), splitter = scene.elements.find(element => element.type === 'splitter');
  for (const transmission of [0.5, 0.25]) {
    splitter.transmission = transmission;
    const result = simulate(scene);
    near(detector(result, 4).power, transmission);
    near(detector(result, 5).power, 1 - transmission);
    near(result.detectors.reduce((sum, entry) => sum + entry.power, 0), 1);
  }
});

test('PBS preset separates s and p Stokes states and switches ports with the laser polarization', () => {
  const scene = P.create('polarizing-splitter'), [source, pbs, pScreen, sScreen] = scene.elements;
  assert.equal(pbs.type, 'pbs');
  for (const [polarization, polAngle, pPower, sPower] of [
    ['linear', 45, 0.5, 0.5], ['linear', 0, 0, 1], ['linear', 90, 1, 0],
    ['unpolarized', 0, 0.5, 0.5], ['right', 0, 0.5, 0.5], ['left', 0, 0.5, 0.5]
  ]) {
    Object.assign(source, { polarization, polAngle });
    const result = simulate(scene);
    assert.deepEqual(result.warnings, []);
    assert.equal(result.truncated, false);
    near(result.detectedPower, source.power);
    for (const [screen, expectedPower, qSign] of [[pScreen, pPower, -1], [sScreen, sPower, 1]]) {
      const measured = detector(result, screen.id);
      near(measured.power, expectedPower);
      near(measured.stokes.I, expectedPower);
      near(measured.stokes.Q, qSign * expectedPower);
      near(measured.stokes.U, 0); near(measured.stokes.V, 0);
      assert.equal(measured.acceptedHits, expectedPower > 0 ? source.rayCount : 0);
      if (expectedPower > 0) {
        near(measured.centroid.x, screen.x); near(measured.centroid.y, screen.y);
        near(measured.span, source.beamWidth);
        near(measured.powerByWavelength[String(source.wavelength)], expectedPower);
      }
    }
  }
});
