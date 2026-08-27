const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

// Exercise the actual page solver without requiring a browser or a test-only
// production API. Rendering is stubbed; the numeric code runs unchanged.
function loadTimer({ pageDefaults = false, model = pageDefaults ? 'immiscible' : 'legacy',
  random = () => 0, colorStorage = { getItem: () => null, setItem() {} } } = {}) {
  const html = readFileSync(join(__dirname, '../oil-timer-lab/index.html'), 'utf8');
  const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]).find((source) => source.includes('function computeOilMass'));
  const elements = new Map();
  let clock = 0;
  const drawingCalls = [];
  const context = {
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    rotate: angle => drawingCalls.push(['rotate', angle]),
    scale: (x, y) => drawingCalls.push(['scale', x, y]),
    clip: (path, rule) => drawingCalls.push(['clip', path, rule])
  };
  const noDraw = new Proxy(context, { get: (object, key) => object[key] || (() => ({ addColorStop() {} })) });
  const canvas = html.match(/<canvas[^>]*id="timerCanvas"[^>]*>/)[0];
  const element = (id) => {
    if (!elements.has(id)) {
      const tag = html.match(new RegExp(`<[^>]*\\bid="${id}"[^>]*>`))?.[0] || '';
      const attribute = (name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] || '';
      elements.set(id, {
      width: Number(canvas.match(/width="(\d+)"/)[1]),
      height: Number(canvas.match(/height="(\d+)"/)[1]),
      textContent: '', value: attribute('value'), min: attribute('min'), max: attribute('max'), step: attribute('step'), 'aria-pressed': attribute('aria-pressed'), handlers: {},
      addEventListener(type, handler) { this.handlers[type] = handler; },
      setAttribute(name, value) { this[name] = value; },
      setCustomValidity(message) { this.validationMessage = message; },
      getContext: () => noDraw
    });
    }
    return elements.get(id);
  };
  const document = { getElementById: element, createElement: () => element('offscreen'), addEventListener() {} };
  const source = script.replace(/\}\)\(\);\s*$/, `
    return { step, tick, computeOilMass, getMassFractions, advectConcentrationConservative, renderField, fieldImage,
      settleConcentration, settleDown, settleUp, settleRight, settleLeft,
      rotation, localGravity, applyForces, vesselViewScale, draw, barrierCells, stairs, wheel, reservoirLayout,
      project, pressureStats, flowFields, curvature, get flowLinks() { return flowLinks; },
      get wallRects() { return wallRects; }, get liquidCutoutPath() { return liquidCutoutPath; },
      get glassOutline() { return glassOutline; }, get running() { return running; },
      get model() { return flowModel; }, get vof() { return immiscible; },
      get parameters() { return { speed, surfaceTension, contactAngle, phaseSeparation, viscosity, waterViscosity, oilDensity, waterDensity, buoyancy }; },
      get c() { return flowModel === 'immiscible' ? immiscible.c : c; },
      get u() { return flowModel === 'immiscible' ? immiscible.u : u; },
      get v() { return flowModel === 'immiscible' ? immiscible.v : v; },
      get mask() { return flowModel === 'immiscible' ? immiscible.mask : mask; },
      get sim() { return flowModel === 'immiscible' ? { ...sim, nx: immiscible.nx, ny: immiscible.ny } : sim; },
      get fluidCells() { return flowModel === 'immiscible' ? immiscible.cells : fluidCells; },
      get fluidNeighbors() { return fluidNeighbors; } };
  })();`);
  const timer = new Function('document', 'Path2D', 'performance', 'requestAnimationFrame', 'OilTimerVOF', 'Math', 'sessionStorage', `return ${source.trim()}`)(
    document, class { moveTo() {} lineTo() {} arc() {} closePath() {} rect() {} }, { now: () => clock }, () => {}, require('../oil-timer-lab/vof.js'),
    Object.assign(Object.create(Math), { random }), colorStorage
  );
  const frameTick = timer.tick;
  timer.tick = ts => { clock = ts; frameTick(ts); };
  timer.setHidden = value => { document.hidden = value; };
  timer.drawingCalls = drawingCalls;
  timer.input = (id, value) => {
    const el = element(id);
    el.value = String(value);
    el.handlers.input({ target: el });
  };
  timer.click = (id) => element(id).handlers.click();
  timer.text = (id) => element(id).textContent;
  timer.attribute = (id, name) => element(id)[name];
  timer.value = (id) => element(id).value;
  timer.blur = (id) => element(id).handlers.blur();
  timer.click(model === 'immiscible' ? 'modelImmiscible' : 'modelLegacy');
  // Keep the existing physics regressions on explicit v0.3.1 reference
  // parameters, independent of the startup preset. Startup tests opt into
  // the real page defaults; this does not alter the production solver.
  if (!pageDefaults) {
    for (const [prefix, value] of Object.entries({ speed: 1, surface: 1.3, phase: 8, viscosity: 2, waterViscosity: 0.4, oilDensity: 1.3, waterDensity: 1, buoyancy: 0 })) {
      timer.input(prefix + 'Range', value);
    }
  }
  return timer;
}

function advance(timer, frames, fps = 60) {
  for (let frame = 0; frame < frames; frame += 1) timer.step(1 / fps);
}

function assertConserved(timer, initialMass) {
  const error = Math.abs(timer.computeOilMass() - initialMass);
  assert.ok(error < initialMass * 1e-9, `oil mass changed by ${error}`);
  for (let i = 0; i < timer.c.length; i += 1) {
    assert.ok(Number.isFinite(timer.c[i]) && timer.c[i] >= 0 && timer.c[i] <= 1, `invalid concentration at ${i}`);
    if (!timer.mask[i]) assert.equal(timer.c[i], 0, `oil entered a wall at ${i}`);
    assert.ok(Number.isFinite(timer.u[i]) && Number.isFinite(timer.v[i]), `invalid velocity at ${i}`);
  }
}

function assertSameField(actual, expected) {
  assert.equal(actual.length, expected.length);
  let maxError = 0;
  for (let i = 0; i < actual.length; i += 1) maxError = Math.max(maxError, Math.abs(actual[i] - expected[i]));
  assert.equal(maxError, 0, `concentration fields differ by up to ${maxError}`);
}

function seedFlatPool(timer) {
  const mass = timer.computeOilMass();
  const gravity = timer.localGravity();
  const sign = Math.sign((timer.parameters.oilDensity - timer.parameters.waterDensity) * (1 + timer.parameters.buoyancy)) || 1;
  const layers = new Map();
  for (const id of timer.fluidCells) {
    const height = sign * ((id % timer.sim.nx) * gravity.x + Math.floor(id / timer.sim.nx) * gravity.y);
    if (!layers.has(height)) layers.set(height, []);
    layers.get(height).push(id);
  }
  timer.c.fill(0); timer.u.fill(0); timer.v.fill(0);
  let remaining = mass;
  for (const height of [...layers.keys()].sort((a, b) => b - a)) {
    const cells = layers.get(height), fill = Math.min(1, remaining / cells.length);
    for (const id of cells) timer.c[id] = fill;
    remaining = Math.max(0, remaining - fill * cells.length);
  }
  return mass;
}

function bottomPoolSurface(timer) {
  // Follow the pool from the bottom, excluding detached drops above it.
  const surface = [], { nx, ny } = timer.sim;
  for (let i = nx / 2 - 18; i < nx / 2 + 18; i++) {
    let j = ny - 1;
    while (j > ny / 2 && !timer.mask[i + j * nx]) j--;
    if (timer.c[i + j * nx] < 0.5) continue;
    while (j > ny / 2 && timer.mask[i + j * nx] && timer.c[i + j * nx] >= 0.5) j--;
    if (!timer.mask[i + j * nx]) continue;
    const above = timer.c[i + j * nx], below = timer.c[i + (j + 1) * nx];
    surface.push(j + (0.5 - above) / (below - above));
  }
  return surface;
}

function upperBulbCellRipple(timer) {
  // The second difference isolates cell-scale banding from a broad surface
  // slope. Exclude the vessel wall so its shape cannot masquerade as a ripple.
  let squared = 0, samples = 0;
  const { nx } = timer.sim;
  for (let y = 40; y < 75; y++) for (let x = nx / 2 - 12; x < nx / 2 + 12; x++) {
    const id = x + y * nx;
    if (!timer.mask[id - 1] || !timer.mask[id] || !timer.mask[id + 1]) continue;
    const ripple = (timer.c[id - 1] - 2 * timer.c[id] + timer.c[id + 1]) / 4;
    squared += ripple * ripple;
    samples++;
  }
  return Math.sqrt(squared / samples);
}

function seedWallDrop(solver, radius = 7) {
  const {nx,ny,h} = solver;
  for (let j=0;j<ny;j++) for (let i=0;i<nx;i++) {
    let count=0;
    for (let y=0;y<8;y++) for (let x=0;x<8;x++) {
      if (Math.hypot((i+(x+0.5)/8-nx/2)*h,(j+(y+0.5)/8-ny)*h)<radius) count++;
    }
    solver.c[i+j*nx]=count/64;
  }
  solver.reconstruct();
}

function wallDropSize(solver) {
  const {nx,ny,h,c,mx,my,alpha}=solver;
  let footprint=0,height=0;
  for(let i=0;i<nx;i++) {
    const id=i+(ny-1)*nx, edge=alpha[id]-my[id];
    const cut=Math.max(0,Math.min(1,edge/mx[id]));
    // Ignore roundoff-scale films when measuring a zero-width wall trace;
    // c=1-1e-16 must not turn an otherwise full wall cell into a dry cell.
    const fraction=c[id]>=1-1e-10?1:c[id]<=1e-10?0:Math.abs(mx[id])<1e-12?(edge>=0?1:0):mx[id]>0?cut:1-cut;
    footprint+=h*fraction;
  }
  for(let j=0;j<ny;j++) height+=h*c[nx/2+j*nx];
  return {footprint,height};
}

test('requested page defaults initialize both controls and physics, and survive Reset', () => {
  const timer = loadTimer({ pageDefaults: true });
  const expected = { speed: 0.5, surfaceTension: 20, contactAngle: 140, phaseSeparation: 16, viscosity: 2, waterViscosity: 0.4, oilDensity: 1.1, waterDensity: 1, buoyancy: 0 };
  assert.deepEqual(timer.parameters, expected);
  assert.equal(timer.attribute('shapeRounded', 'aria-pressed'), 'true');
  for (const [name, value] of Object.entries(expected)) {
    const prefix = { surfaceTension: 'surface', phaseSeparation: 'phase' }[name] || name;
    assert.equal(Number(timer.value(prefix + 'Number')), value);
    assert.equal(Number(timer.value(prefix + 'Range')), value);
  }
  const initial = timer.c.slice(), mass = timer.computeOilMass();
  // The non-wetting wall delays the first drop; it is a different physical
  // boundary condition from the old neutral wall, not a faster-flow preset.
  advance(timer, 480);
  assertConserved(timer, mass);
  assert.ok(timer.getMassFractions().topFraction < 0.999, 'the new default should begin transferring oil');
  timer.click('resetBtn');
  assertSameField(timer.c, initial);
  assert.deepEqual(timer.parameters, expected);
});

test('oil colors change between loads without repeating the previous choice', () => {
  const memory=new Map(), colorStorage={ getItem:key=>memory.get(key)??null, setItem:(key,value)=>memory.set(key,value) };
  const rgb=timer=>Array.from(timer.fieldImage.data.slice(0,3));
  const first=loadTimer({colorStorage}), second=loadTimer({colorStorage});
  assert.notDeepEqual(rgb(first),rgb(second), 'even the same random sample must exclude the last color');
  assert.notEqual(first.attribute('timerCanvas','aria-label'),second.attribute('timerCanvas','aria-label'));
  // Each independent fresh load can select a different palette entry.
  const colors=new Set();
  for(let i=0;i<8;i++) colors.add(rgb(loadTimer({random:()=>i/8})).join(','));
  assert.equal(colors.size,8);
  memory.set('oil-timer-lab:last-oil-color','obsolete-color');
  assert.deepEqual(rgb(loadTimer({colorStorage})),rgb(first), 'stale saved names must not break selection');
});

test('oil color survives playback, reset, inversion, shape and model changes without altering physics or coverage', () => {
  const timers=[loadTimer({pageDefaults:true,random:()=>0}),loadTimer({pageDefaults:true,random:()=>0.5})];
  assert.notDeepEqual(timers[0].fieldImage.data.slice(0,3),timers[1].fieldImage.data.slice(0,3));
  for(const model of ['modelImmiscible','modelLegacy']) {
    for(const timer of timers) {timer.click(model);advance(timer,6);timer.renderField();}
    for(const key of ['c','u','v']) assertSameField(timers[0][key],timers[1][key]);
    for(let k=3;k<timers[0].fieldImage.data.length;k+=4) {
      assert.equal(timers[0].fieldImage.data[k],timers[1].fieldImage.data[k], 'color must not change interface opacity');
    }
  }
  const timer=timers[1], color=timer.fieldImage.data.slice(0,3), label=timer.attribute('timerCanvas','aria-label');
  for(const action of ['resetBtn','shapeWheel','modelImmiscible','flipBtn']) {
    timer.click(action);
    advance(timer,2);
    timer.draw();
    for(let k=0;k<timer.fieldImage.data.length;k+=4) assert.deepEqual(timer.fieldImage.data.subarray(k,k+3),color);
    assert.equal(timer.attribute('timerCanvas','aria-label'),label);
  }
  timer.click('toggleBtn');
  const before=timer.c.slice();
  advance(timer,2);timer.draw();
  assertSameField(timer.c,before);
  assert.deepEqual(timer.fieldImage.data.slice(0,3),color);
});

test('oil color selection tolerates unavailable storage and still starts the simulation', () => {
  const timer=loadTimer({pageDefaults:true,random:()=>0.7,colorStorage:{
    getItem(){throw new Error('Storage blocked');},setItem(){throw new Error('Storage blocked');}
  }});
  const mass=timer.computeOilMass();
  assert.ok(mass>0);
  assert.match(timer.attribute('timerCanvas','aria-label'),/oil$/);
  advance(timer,2);
  timer.renderField();
  assertConserved(timer,mass);
  assert.ok(timer.fieldImage.data.some((value,index)=>index%4===3&&value>0));
});

test('VOF geometric cuts preserve area for every normal quadrant and complementary swept slabs', () => {
  const { lineArea, lineAlpha, sweptArea } = require('../oil-timer-lab/vof.js');
  for (let direction = 0; direction < 32; direction++) {
    const angle = direction * Math.PI / 16;
    const nx = Math.cos(angle), ny = Math.sin(angle);
    for (const fraction of [0, 1e-9, 0.01, 0.2, 0.5, 0.8, 0.99, 1-1e-9, 1]) {
      const alpha = lineAlpha(nx, ny, fraction);
      assert.ok(Math.abs(lineArea(nx, ny, alpha) - fraction) < 1e-12);
      for (const horizontal of [true, false]) for (const width of [0.01, 0.23, 0.5]) {
        const first = sweptArea(nx, ny, alpha, width, horizontal, false);
        const second = sweptArea(nx, ny, alpha, 1-width, horizontal, true);
        assert.ok(first >= 0 && first <= Math.min(width, fraction) + 1e-12);
        assert.ok(Math.abs(first + second - fraction) < 1e-12, 'the cut partition creates or loses oil');
      }
    }
  }
});

test('VOF translation transports a round interface without spreading it into a concentration cloud', () => {
  const { Solver } = require('../oil-timer-lab/vof.js');
  const nx=64, ny=64, solver=new Solver({nx,ny,width:nx,mask:new Uint8Array(nx*ny).fill(1)});
  const disk = (i,j,cx,cy) => {
    let count=0;
    for(let y=0;y<8;y++) for(let x=0;x<8;x++) if(Math.hypot(i+(x+0.5)/8-cx,j+(y+0.5)/8-cy)<8) count++;
    return count/64;
  };
  for(let j=0;j<ny;j++) for(let i=0;i<nx;i++) solver.c[i+j*nx]=disk(i,j,20,24);
  const initialMass=solver.mass();
  // The moving disk stays far from the closed outer faces. Divergence is
  // zero throughout the occupied region during this translation benchmark.
  for(const {f} of solver.xFaces) solver.u[f]=0.4;
  for(const {f} of solver.yFaces) solver.v[f]=0.2;
  for(let step=0;step<100;step++) solver.advect(0.25);
  let mixed=0,error=0;
  for(let j=0;j<ny;j++) for(let i=0;i<nx;i++) {
    const value=solver.c[i+j*nx];
    assert.ok(value>=0&&value<=1);
    if(value>0.001&&value<0.999) mixed++;
    error+=Math.abs(value-disk(i,j,30,29));
  }
  assert.ok(Math.abs(solver.mass()/initialMass-1)<1e-12);
  assert.ok(mixed<100, `the interface spread across ${mixed} cells`);
  assert.ok(error/initialMass<0.03, `translation shape error ${error/initialMass}`);
  assert.ok(solver.stats.boundError<1e-12, 'bounds must come from geometric transport, not clipping away oil');
});

test('VOF pressure projection and geometric advection conserve oil in a closed domain', () => {
  const { Solver } = require('../oil-timer-lab/vof.js');
  const nx=32,ny=40,solver=new Solver({nx,ny,width:nx,mask:new Uint8Array(nx*ny).fill(1)});
  for(const id of solver.cells) solver.c[id]=id%nx>10&&id%nx<22&&Math.floor(id/nx)>15?1:0;
  for(const {f} of solver.xFaces) solver.u[f]=0.4*Math.sin(f*0.71);
  for(const {f} of solver.yFaces) solver.v[f]=0.3*Math.cos(f*0.37);
  solver.project();
  assert.ok(solver.stats.divergence<1e-10);
  const mass=solver.mass();
  for(let step=0;step<20;step++) solver.advect(0.2);
  assert.ok(Math.abs(solver.mass()/mass-1)<1e-11);
  assert.ok(solver.stats.boundError<1e-11);
});

test('VOF flat liquid interfaces remain at rest under gravity and surface tension', () => {
  const { Solver } = require('../oil-timer-lab/vof.js');
  const nx=32,ny=40,solver=new Solver({nx,ny,width:nx,mask:new Uint8Array(nx*ny).fill(1)});
  for(const id of solver.cells) solver.c[id]=Math.floor(id/nx)>24?1:Math.floor(id/nx)===24?0.37:0;
  const before=solver.c.slice(), mass=solver.mass();
  for(let frame=0;frame<40;frame++) solver.step(0.18);
  let maxChange=0, maxSpeed=0;
  for(const id of solver.cells) maxChange=Math.max(maxChange,Math.abs(solver.c[id]-before[id]));
  for(const velocity of [...solver.u,...solver.v]) maxSpeed=Math.max(maxSpeed,Math.abs(velocity));
  assert.ok(maxChange<1e-10, `a level interface moved by ${maxChange}`);
  assert.ok(maxSpeed<1e-10, `spurious velocity ${maxSpeed}`);
  assert.ok(Math.abs(solver.mass()/mass-1)<1e-12);
});

test('VOF oil-side contact angles orient every wall correctly without changing occupied area', () => {
  const {Solver,lineArea}=require('../oil-timer-lab/vof.js');
  const nx=32,ny=24,solver=new Solver({nx,ny,width:nx,mask:new Uint8Array(nx*ny).fill(1)});
  seedWallDrop(solver);
  const before=solver.c.slice();
  for(const angle of [15,60,90,140,165]) {
    solver.setContactAngle(angle);
    const cosine=Math.cos(angle*Math.PI/180);
    for(const [wx,wy] of [[1,0],[-1,0],[0,1],[0,-1],[Math.SQRT1_2,Math.SQRT1_2]]) {
      for(const sign of [-1,1]) {
        const [x,y]=solver.contactNormal(0.4*wx-sign*wy,0.4*wy+sign*wx,wx,wy);
        assert.ok(Math.abs(Math.hypot(x,y)-1)<1e-12);
        assert.ok(Math.abs(x*wx+y*wy-cosine)<1e-12, 'contact angle was measured through the wrong phase');
        assert.equal(Math.sign(-wy*x+wx*y),sign);
      }
    }
    let cutCells=0;
    for(const id of solver.cells) if(solver.c[id]>0 && solver.c[id]<1) {
      assert.ok(Math.abs(lineArea(solver.mx[id],solver.my[id],solver.alpha[id])-before[id])<1e-12);
      if(Math.floor(id/nx)===ny-1) {
        cutCells++;
        const length=Math.hypot(solver.mx[id],solver.my[id]);
        assert.ok(Math.abs(-solver.my[id]/length-cosine)<1e-12);
      }
    }
    assert.ok(cutCells>=2);
    assertSameField(solver.c,before);
  }
});

test('VOF sessile drops spread at 60 degrees and retract at 140 degrees toward circular-cap shapes', t => {
  const {Solver}=require('../oil-timer-lab/vof.js');
  const sizes=[];
  for(const angle of [60,90,140]) {
    const nx=48,ny=32,solver=new Solver({nx,ny,width:nx,mask:new Uint8Array(nx*ny).fill(1),contactAngle:angle});
    seedWallDrop(solver);
    const mass=solver.mass();
    for(let frame=0;frame<1500;frame++) solver.step(0.18,{surfaceTension:100,oilDensity:1,waterDensity:1,viscosity:5,waterViscosity:5});
    const size=wallDropSize(solver), theta=angle*Math.PI/180;
    const radius=Math.sqrt(mass/(theta-Math.sin(theta)*Math.cos(theta)));
    assert.ok(Math.abs(size.footprint-2*radius*Math.sin(theta))<1.5*solver.h, 'wall footprint misses the circular-cap solution by more than 1.5 cells');
    assert.ok(Math.abs(size.height-radius*(1-Math.cos(theta)))<0.75*solver.h);
    assert.ok(Math.abs(solver.mass()/mass-1)<1e-10);
    assert.ok(solver.stats.boundError<1e-10);
    assert.ok(solver.stats.divergence<1e-9);
    for(const value of solver.c) assert.ok(Number.isFinite(value)&&value>=0&&value<=1);
    sizes.push(size);
    t.diagnostic(JSON.stringify({angle,...size,massError:solver.mass()/mass-1}));
  }
  assert.ok(sizes[0].footprint>sizes[1].footprint+3 && sizes[1].footprint>sizes[2].footprint+3);
  assert.ok(sizes[0].height<sizes[1].height-1 && sizes[1].height<sizes[2].height-1);
});

test('VOF contact-angle changes cannot move oil without surface tension or alter a detached drop', () => {
  const {Solver}=require('../oil-timer-lab/vof.js');
  const nx=48,ny=40,mask=new Uint8Array(nx*ny).fill(1);
  const solver=new Solver({nx,ny,width:nx,mask});
  seedWallDrop(solver);
  const before=solver.c.slice();
  for(const contactAngle of [15,165]) {
    solver.step(0.18,{contactAngle,surfaceTension:0,oilDensity:1,waterDensity:1});
    for(let id=0;id<before.length;id++) assert.ok(Math.abs(solver.c[id]-before[id])<1e-12);
  }
  const fields=[60,140].map(contactAngle=>{
    const drop=new Solver({nx,ny,width:nx,mask,contactAngle});
    for(let j=0;j<ny;j++) for(let i=0;i<nx;i++) drop.c[i+j*nx]=Math.hypot(i+0.5-nx/2,j+0.5-ny/2)<6?1:0;
    for(let step=0;step<30;step++) drop.step(0.18,{surfaceTension:100,oilDensity:1,waterDensity:1});
    return drop.c;
  });
  assertSameField(fields[0],fields[1]);
});

test('oil contact angle updates a paused VOF interface and is ignored by Legacy', () => {
  const timer=loadTimer({pageDefaults:true});
  advance(timer,20);
  timer.click('toggleBtn');
  const before=timer.c.slice(), mass=timer.computeOilMass();
  for(const angle of [15,90,150,165]) {
    timer.input('contactAngleNumber',angle);
    assert.equal(timer.vof.contactAngle,angle);
    assert.equal(Number(timer.value('contactAngleRange')),angle);
    assertSameField(timer.c,before);
    assert.equal(timer.running,false);
    assertConserved(timer,mass);
  }
  timer.input('contactAngleRange',120);
  assert.equal(Number(timer.value('contactAngleNumber')),120);
  timer.click('resetBtn');
  assert.equal(timer.vof.contactAngle,120);
  const legacyFields=[15,165].map(angle=>{
    const old=loadTimer({pageDefaults:true});
    old.input('contactAngleNumber',angle);
    old.click('modelLegacy');
    assert.equal(old.attribute('contactAngleNumber','disabled'),true);
    advance(old,30);
    return old.c;
  });
  assertSameField(legacyFields[0],legacyFields[1]);
});

test('VOF extreme density, viscosity, surface forces and rotation remain conservative and bounded', () => {
  const { Solver } = require('../oil-timer-lab/vof.js');
  const nx=32,ny=40,solver=new Solver({nx,ny,width:nx,mask:new Uint8Array(nx*ny).fill(1)});
  for(const parameters of [
    {oilDensity:10,waterDensity:0.05,viscosity:50,waterViscosity:0,buoyancy:5,surfaceTension:200,contactAngle:15},
    {oilDensity:0.05,waterDensity:10,viscosity:0,waterViscosity:50,buoyancy:-5,surfaceTension:200,contactAngle:165},
    {oilDensity:1,waterDensity:1,viscosity:0,waterViscosity:0,buoyancy:-1,surfaceTension:0}
  ]) {
    solver.reset(20);
    const mass=solver.mass();
    for(let frame=0;frame<30;frame++) solver.step(0.18,{...parameters,gravity:{x:0.6,y:0.8},omega:0.3,alpha:0.2});
    for(const value of solver.c) assert.ok(Number.isFinite(value)&&value>=0&&value<=1);
    for(const velocity of [...solver.u,...solver.v]) assert.ok(Number.isFinite(velocity)&&Math.abs(velocity)<=6+1e-12);
    assert.ok(Math.abs(solver.mass()/mass-1)<1e-10);
    assert.ok(solver.stats.divergence<1e-8);
    assert.ok(solver.stats.boundError<1e-10);
    assert.ok(solver.stats.maxCfl<=0.45+1e-12);
  }
});

test('paddle impulses exchange angular momentum, dissipate slip, and never act as a motor', () => {
  const { PaddleWheel } = require('../oil-timer-lab/vof.js');
  for (const side of [-1, 1]) {
    const rotor = new PaddleWheel({ x:0, y:0, radius:10, hubRadius:1, damping:0 });
    const velocity = new Float64Array([2]);
    const ports = rotor.makePorts([{x:8*side,y:0,field:velocity,f:0,horizontal:false}],1);
    const momentum = () => ports[0].lever*velocity[0]+rotor.inertia*rotor.omega;
    const energy = () => 0.5*velocity[0]**2+0.5*rotor.inertia*rotor.omega**2;
    const beforeL = momentum(), beforeE = energy();
    rotor.couple(0.18,ports);
    assert.ok(rotor.omega*side>0, 'off-center flow must turn the wheel in the corresponding direction');
    assert.ok(velocity[0]<2, 'the fluid must receive the opposing impulse');
    assert.ok(Math.abs(momentum()-beforeL)<1e-12);
    assert.ok(energy()<beforeE);
    rotor.advance(0.18);
    assert.ok(rotor.angle*side>0);
    rotor.reset(); velocity.fill(0);
    for (let n=0;n<30;n++) { rotor.couple(0.18,ports); rotor.advance(0.18); }
    assert.equal(rotor.omega,0); assert.equal(rotor.angle,0);
    rotor.omega=0.2;
    const spinningE=energy();
    rotor.couple(0.18,ports);
    assert.ok(velocity[0]*side>0, 'a spinning wheel must also push resting fluid');
    assert.ok(energy()<spinningE);
    const before=[velocity[0],rotor.omega,rotor.angle];
    rotor.couple(0,ports);
    assert.deepEqual([velocity[0],rotor.omega,rotor.angle],before);
    rotor.reset(); rotor.couple(0.18,[],0.3);
    assert.ok(Math.abs(rotor.omega+0.054)<1e-12, 'support acceleration acts in the rotating vessel frame');
  }
});

test('VOF falling oil drives the paddle wheel in either direction without losing volume', t => {
  const { Solver, PaddleWheel } = require('../oil-timer-lab/vof.js');
  for (const side of [-1,1]) {
    const nx=48,ny=60,mask=new Uint8Array(nx*ny).fill(1);
    const rotor=new PaddleWheel({x:24,y:32,radius:12,hubRadius:2,thickness:1.2});
    for(let j=0;j<ny;j++) for(let i=0;i<nx;i++) if(Math.hypot(i+0.5-24,j+0.5-32)<2) mask[i+j*nx]=0;
    const solver=new Solver({nx,ny,width:nx,mask});
    solver.attachWheel(rotor);
    for(let j=0;j<ny;j++) for(let i=0;i<nx;i++) {
      if(Math.hypot(i+0.5-(24+side*8),j+0.5-14)<4) solver.c[i+j*nx]=1;
    }
    solver.reconstruct();
    const mass=solver.mass(), originalMask=solver.mask.slice();
    let maxRotation=0;
    for(let step=0;step<400;step++) {
      solver.step(0.18,{oilDensity:1.3,waterDensity:1,surfaceTension:4,viscosity:0.4,waterViscosity:0.4});
      maxRotation=Math.max(maxRotation,side*rotor.angle);
    }
    t.diagnostic(`side ${side}: angle ${rotor.angle}, peak directed angle ${maxRotation}`);
    assert.ok(maxRotation>0.1, 'a falling oil drop should turn the wheel, with no imposed motor or velocity');
    assert.ok(Math.abs(solver.mass()/mass-1)<1e-10);
    assert.ok(solver.stats.divergence<1e-8);
    assert.ok(solver.stats.boundError<1e-10);
    assert.deepEqual(solver.mask,originalMask, 'the moving paddles must not erase oil via a remasked cell');
  }
});

test('VOF rendering covers partial-cell oil accurately without grid seams or roundoff hairlines', () => {
  const { Solver } = require('../oil-timer-lab/vof.js');
  const nx=18,ny=18,solver=new Solver({nx,ny,width:nx,mask:new Uint8Array(nx*ny).fill(1)});
  const image={width:127,height:127,data:new Uint8ClampedArray(127*127*4)};
  const renderArea=()=>{
    solver.reconstruct(); solver.render(image);
    let area=0;
    for(let k=3;k<image.data.length;k+=4) area+=image.data[k]/255;
    return area*(nx/image.width)*(ny/image.height);
  };
  solver.c.fill(1-1e-12);
  renderArea();
  for(let k=3;k<image.data.length;k+=4) assert.equal(image.data[k],255,'full oil has grid seams');
  solver.c.fill(1e-12);
  renderArea();
  for(let k=3;k<image.data.length;k+=4) assert.equal(image.data[k],0,'roundoff oil draws a false hairline');
  solver.c.fill(0);
  solver.c[8+8*nx]=0.23;
  const before=solver.c.slice();
  assert.ok(Math.abs(renderArea()-0.23)<0.003, 'a sub-50% cell must still display its occupied oil area');
  assertSameField(solver.c,before);
});

test('the model selector defaults to VOF and preserves controls while resetting either model', () => {
  const timer=loadTimer({pageDefaults:true});
  timer.input('surfaceNumber',200);
  assert.equal(timer.parameters.surfaceTension,200);
  const parameters=timer.parameters, start=timer.c.slice();
  assert.equal(timer.model,'immiscible');
  assert.equal(timer.attribute('modelImmiscible','aria-pressed'),'true');
  assert.equal(timer.attribute('phaseNumber','disabled'),true);
  assert.equal(timer.attribute('contactAngleNumber','disabled'),false);
  assert.ok(timer.sim.nx>144 && timer.sim.ny>162);
  advance(timer,30);
  timer.click('modelLegacy');
  assert.equal(timer.model,'legacy');
  assert.equal(timer.sim.nx,144);
  assert.equal(timer.attribute('modelLegacy','aria-pressed'),'true');
  assert.equal(timer.attribute('phaseNumber','disabled'),false);
  assert.equal(timer.attribute('contactAngleNumber','disabled'),true);
  assert.deepEqual(timer.parameters,parameters);
  const legacyStart=timer.c.slice();
  advance(timer,30);
  timer.click('modelImmiscible');
  assertSameField(timer.c,start);
  assert.deepEqual(timer.parameters,parameters);
  timer.click('flipBtn');
  advance(timer,25);
  timer.click('modelLegacy');
  assertSameField(timer.c,legacyStart);
  assert.equal(timer.rotation.angle,0);
  assert.equal(timer.rotation.active,false);
});

test('VOF preserves oil through shape changes, paused inversions, and a return to Legacy', () => {
  const timer=loadTimer({pageDefaults:true});
  timer.input('surfaceNumber',200);
  assert.equal(timer.parameters.surfaceTension,200);
  for(const shape of ['Rounded','Straight','Wide','Stairs','Capsule','Twin','Pegboard','Wheel']) {
    timer.click('shape'+shape);
    const mass=timer.computeOilMass();
    advance(timer,30);
    timer.click('toggleBtn');
    const paused=timer.c.slice();
    advance(timer,10);
    assertSameField(timer.c,paused);
    timer.click('flipBtn');
    advance(timer,108);
    assert.equal(timer.rotation.angle,Math.PI);
    assert.equal(timer.running,false);
    assertConserved(timer,mass);
    assert.ok(timer.vof.stats.divergence<1e-8);
    assert.ok(timer.vof.stats.boundError<1e-10);
    timer.click('resetBtn');
    assert.equal(timer.rotation.angle,0);
    assert.equal(timer.vof.contactAngle,140);
  }
  timer.click('modelLegacy');
  assert.equal(timer.attribute('phaseRange','disabled'),false);
  assertConserved(timer,timer.computeOilMass());
});

test('the previous fast preset stays free of alternating columns and drains after inversion', t => {
  const timer = loadTimer({ pageDefaults: true, model: 'legacy' });
  // Keep the v0.3.3 update/striping regression on its original strong-drift
  // fixture. The slower drop preset has a different trajectory and timescale.
  timer.input('surfaceNumber', 8);
  timer.input('oilDensityNumber', 3);
  const mass = timer.computeOilMass();
  let checkedFlowStates = 0;
  for (let run = 0; run < 2; run++) {
    let frames = 0;
    while (timer.getMassFractions().topFraction > 1e-8 && frames < 6000) {
      advance(timer, 60);
      frames += 60;
      const top = timer.getMassFractions().topFraction;
      if (!run && top > 0.2 && top < 0.8) {
        const ripple = upperBulbCellRipple(timer);
        assert.ok(ripple < 0.005, `the coupled fast-preset flow developed alternating columns (${ripple})`);
        checkedFlowStates++;
      }
    }
    advance(timer, 240);
    assertConserved(timer, mass);
    const remaining = timer.getMassFractions().topFraction;
    t.diagnostic(`fast preset run ${run}: ${frames}+240 frames at 0.5x, ${remaining} left above`);
    assert.ok(remaining < 1e-8, 'the fast preset retained oil above');
    timer.tick(0);
    assert.equal(timer.text('etaText'), 'Transfer complete');
    if (!run) {
      timer.click('flipBtn');
      advance(timer, 108);
      assert.equal(timer.rotation.angle, Math.PI);
      assert.ok(timer.getMassFractions().topFraction > 0.5);
    }
  }
  assert.ok(checkedFlowStates >= 2, 'inspect more than one intermediate flow state');
});

test('wall-edge rendering has no transparent grid gaps and never modifies the solver fields', () => {
  const timer = loadTimer();
  const { width, height } = timer.fieldImage;
  assert.equal(width, 640);
  assert.equal(height, 720);
  for (const shape of ['Rounded', 'Straight', 'Wide', 'Stairs']) {
    timer.click('shape' + shape);
    for (let i = 0; i < timer.c.length; i += 1) timer.c[i] = timer.mask[i];
    const before = timer.c.slice();
    const uBefore = timer.u.slice(), vBefore = timer.v.slice();
    const maskBefore = timer.mask.slice();
    timer.renderField();
    let checkedWallSamples = 0;
    for (let j = 1; j < timer.sim.ny - 1; j += 1) {
      for (let i = 1; i < timer.sim.nx - 1; i += 1) {
        const id = i + j * timer.sim.nx;
        if (timer.mask[id]) continue;
        if ([id - 1, id + 1, id - timer.sim.nx, id + timer.sim.nx].some((n) => timer.mask[n])) {
          const x = Math.floor((i + 0.5) * width / timer.sim.nx);
          const y = Math.floor((j + 0.5) * height / timer.sim.ny);
          assert.equal(timer.fieldImage.data[(x + y * width) * 4 + 3], 255, `transparent ${shape} wall sample at ${i},${j}`);
          checkedWallSamples += 1;
        }
      }
    }
    assert.ok(checkedWallSamples > 0);
    assertSameField(timer.c, before);
    assertSameField(timer.u, uBefore);
    assertSameField(timer.v, vBefore);
    assert.deepEqual(timer.mask, maskBefore);
    assert.equal(timer.fieldImage.data[3], 0, 'distant exterior should stay transparent');
  }
});

test('flat and diagonal oil interfaces stay sharp at subcell positions even with a wide mixed layer', () => {
  const timer = loadTimer();
  const { width, height, data } = timer.fieldImage;
  const dx = width / timer.sim.nx, dy = height / timer.sim.ny;
  for (const thickness of [4 * dy, 16 * dy]) {
    for (const slope of [0, 0.37, -0.63]) {
      const surface = x => 550.3 + slope * (x - 320);
      for (let j = 0; j < timer.sim.ny; j += 1) {
        for (let i = 0; i < timer.sim.nx; i += 1) {
          const id = i + j * timer.sim.nx;
          timer.c[id] = timer.mask[id] ? Math.max(0, Math.min(1, 0.5 + ((j + 0.5) * dy - surface((i + 0.5) * dx)) / thickness)) : 0;
        }
      }
      const before = timer.c.slice();
      timer.renderField();
      for (let x = 300; x <= 340; x += 1) {
        let partialPixels = 0, firstOil = -1;
        const boundary = surface(x + 0.5);
        for (let y = Math.floor(boundary) - 12; y <= Math.ceil(boundary) + 12; y += 1) {
          const alpha = data[(x + y * width) * 4 + 3];
          if (alpha > 0 && alpha < 255) partialPixels += 1;
          if (alpha >= 128 && firstOil < 0) firstOil = y;
          if (y + 0.5 < boundary - 1) assert.equal(alpha, 0, 'water side is foggy');
          if (y + 0.5 > boundary + 1) assert.equal(alpha, 255, 'oil interior is translucent');
        }
        assert.ok(partialPixels >= 1 && partialPixels <= 2, `expected only antialiased edge pixels, got ${partialPixels}`);
        assert.ok(Math.abs(firstOil + 0.5 - boundary) <= 1, 'interface snapped to the simulation grid');
      }
      assertSameField(timer.c, before);
    }
  }
});

test('a diffuse round drop renders as a solid smooth silhouette without changing its concentration or mass', () => {
  const timer = loadTimer();
  const { width, height, data } = timer.fieldImage;
  const dx = width / timer.sim.nx, dy = height / timer.sim.ny;
  const cx = 320.3, cy = 545.7, radius = 35;
  for (let j = 0; j < timer.sim.ny; j += 1) {
    for (let i = 0; i < timer.sim.nx; i += 1) {
      const id = i + j * timer.sim.nx;
      const distance = Math.hypot((i + 0.5) * dx - cx, (j + 0.5) * dy - cy);
      timer.c[id] = timer.mask[id] ? Math.max(0, Math.min(1, 0.5 + (radius - distance) / 40)) : 0;
    }
  }
  const before = timer.c.slice(), mass = timer.computeOilMass();
  timer.renderField();
  let partialPixels = 0, area = 0;
  for (let y = 490; y < 601; y += 1) {
    for (let x = 265; x < 376; x += 1) {
      const distance = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const alpha = data[(x + y * width) * 4 + 3];
      if (distance < radius - 1) assert.equal(alpha, 255);
      if (distance > radius + 1) assert.equal(alpha, 0);
      if (alpha > 0 && alpha < 255) {
        partialPixels += 1;
        assert.ok(Math.abs(distance - radius) < 1, 'fuzzy halo exceeds an edge pixel');
      }
      area += alpha / 255;
    }
  }
  assert.ok(partialPixels > 100, 'round edges need subpixel antialiasing');
  assert.ok(Math.abs(area / (Math.PI * radius ** 2) - 1) < 0.02, 'contour shifted or lost its round shape');
  assertSameField(timer.c, before);
  assertConserved(timer, mass);
});

test('cached solver neighbors reflect walls and cannot cross closed diagonal corners', () => {
  const timer = loadTimer();
  const { nx, ny } = timer.sim;
  const fluid = (i, j) => i >= 0 && i < nx && j >= 0 && j < ny && timer.mask[i + j * nx] === 1;
  const offsets = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
  const expectedCells = Array.from(timer.mask.keys()).filter((id) => timer.mask[id]);
  assert.deepEqual(Array.from(timer.fluidCells), expectedCells);
  let closedCorners = 0;
  for (let q = 0; q < timer.fluidCells.length; q += 1) {
    const id = timer.fluidCells[q];
    const i = id % nx;
    const j = Math.floor(id / nx);
    for (let k = 0; k < offsets.length; k += 1) {
      const [di, dj] = offsets[k];
      const endpointOpen = fluid(i + di, j + dj);
      const cornerOpen = !di || !dj || (fluid(i + di, j) && fluid(i, j + dj));
      const expected = endpointOpen && cornerOpen ? id + di + dj * nx : id;
      assert.equal(timer.fluidNeighbors[q * 8 + k], expected, `wrong stencil at ${i},${j} offset ${di},${dj}`);
      if (endpointOpen && !cornerOpen) closedCorners += 1;
    }
  }
  assert.ok(closedCorners > 0, 'fixture must include diagonal links obstructed by walls');
});

test('switching vessels rebuilds connected, symmetric walls and resets the oil without resetting controls', () => {
  const timer = loadTimer();
  timer.input('speedRange', 0.75);
  const shapes = ['Straight', 'Wide', 'Rounded'];
  const masks = new Set();
  for (const shape of shapes) {
    timer.click('shape' + shape);
    const mass = timer.computeOilMass();
    assertConserved(timer, mass);
    assert.equal(timer.getMassFractions().topFraction, 1);
    timer.tick(0);
    assert.equal(timer.value('speedNumber'), '0.75');
    assert.equal(timer.attribute('shape' + shape, 'aria-pressed'), 'true');
    assert.match(timer.text('massErrorText'), /0\.0000%/);
    masks.add(Buffer.from(timer.mask).toString('base64'));
    const { nx, ny } = timer.sim;
    const rows = Array.from(timer.fluidCells, (id) => Math.floor(id / nx));
    const bottom = Math.max(...rows);
    const top = Math.min(...rows);
    for (const id of timer.fluidCells) {
      assert.equal(timer.mask[timer.mask.length - 1 - id], 1, 'inversion must preserve the wall mask');
      for (const [targets, direction] of [[timer.settleRight, 1], [timer.settleLeft, -1]]) {
        const target = targets[id];
        if (target < 0) continue;
        assert.equal(timer.mask[target], 1, 'sideways settling entered a wall');
        const dx = target % nx - id % nx;
        const dy = Math.floor(target / nx) - Math.floor(id / nx);
        assert.equal(Math.abs(dx) + Math.abs(dy), 1, 'sideways settling skipped across a wall');
        assert.ok(dx * direction >= 0, 'sideways settling moved against gravity');
      }
      for (const [targets, finalRow] of [[timer.settleDown, bottom], [timer.settleUp, top]]) {
        let current = id;
        let hops = 0;
        while (targets[current] >= 0 && hops <= nx + ny) {
          const target = targets[current];
          assert.ok(timer.mask[target], 'settling route entered a wall');
          const dx = Math.abs(target % nx - current % nx);
          const dy = Math.abs(Math.floor(target / nx) - Math.floor(current / nx));
          assert.equal(dx + dy, 1, 'settling may only exchange across a shared face');
          current = target;
          hops += 1;
        }
        assert.ok(hops <= nx + ny, 'settling route contains a loop');
        assert.equal(Math.floor(current / nx), finalRow, 'a grid ledge trapped the settling route');
      }
    }
    advance(timer, 10);
    const before = timer.c.slice();
    timer.click('shape' + shape);
    assertSameField(timer.c, before); // Re-selecting the current shape does not restart.
  }
  assert.equal(masks.size, shapes.length);
});

test('Stairs walls share the render clip and have connected drainage routes in both orientations', () => {
  const timer = loadTimer();
  timer.input('surfaceNumber', 8);
  timer.click('shapeStairs');
  assert.equal(timer.attribute('shapeStairs', 'aria-pressed'), 'true');
  assert.equal(timer.attribute('vesselHint', 'hidden'), false);
  assert.equal(timer.parameters.surfaceTension, 8);
  const { nx, ny } = timer.sim;
  const coverage = new Uint8Array(timer.mask.length);
  for (const { x, y, width, height } of timer.wallRects) {
    for (let j = y; j < y + height; j++) for (let i = x; i < x + width; i++) coverage[i + j * nx]++;
  }
  assert.deepEqual(coverage, timer.barrierCells, 'clip holes must cover each solid cell exactly once');
  assert.ok(coverage.some(value => value === 1));
  for (let id = 0; id < coverage.length; id++) {
    if (coverage[id]) assert.equal(timer.mask[id], 0, 'rendered glass must also be a solver wall');
    if (Math.floor(id / nx) >= timer.stairs.topFloor) assert.equal(timer.c[id], 0, 'seed oil only in the supply reservoir');
  }
  const bottom = Math.max(...Array.from(timer.fluidCells, id => Math.floor(id / nx)));
  const top = Math.min(...Array.from(timer.fluidCells, id => Math.floor(id / nx)));
  for (const id of timer.fluidCells) {
    for (const [targets, axis, direction] of [
      [timer.settleDown, 'y', 1], [timer.settleUp, 'y', -1],
      [timer.settleRight, 'x', 1], [timer.settleLeft, 'x', -1]
    ]) {
      const target = targets[id];
      if (target < 0) continue;
      const dx = target % nx - id % nx, dy = Math.floor(target / nx) - Math.floor(id / nx);
      assert.equal(timer.mask[target], 1);
      assert.equal(Math.abs(dx) + Math.abs(dy), 1, 'no wall shortcut');
      assert.ok((axis === 'x' ? dx : dy) * direction >= 0);
    }
    for (const [targets, finalRow] of [[timer.settleDown, bottom], [timer.settleUp, top]]) {
      let current = id, hops = 0;
      while (targets[current] >= 0 && hops < nx * ny) { current = targets[current]; hops++; }
      assert.ok(hops < nx * ny, 'a stair route must not loop');
      assert.equal(Math.floor(current / nx), finalRow, 'a stair or reservoir trapped a settling route');
    }
  }
  // Follow the inlet route: it lands on each successive flight, rather than
  // falling through the stepped corners or bypassing a flight at its lip.
  const route = [];
  for (let id = 45 + 35 * nx; id >= 0; id = timer.settleDown[id]) route.push(id);
  for (const [x, y] of [[70, 51], [72, 80], [70, 105]]) {
    assert.ok(route.includes(x + y * nx), `inlet route missed the tread at ${x},${y}`);
  }
  const before = timer.c.slice();
  timer.drawingCalls.length = 0;
  timer.draw();
  assert.ok(timer.drawingCalls.some(call => call[0] === 'clip' && call[1] === timer.liquidCutoutPath && call[2] === 'evenodd'));
  assertSameField(timer.c, before);
  timer.click('shapeRounded');
  assert.ok(timer.barrierCells.every(value => value === 0));
  assert.equal(timer.wallRects.length, 0);
  assert.equal(timer.attribute('vesselHint', 'hidden'), true);
});

test('new vessels have distinct connected masks, matching wall clips, and reversible controls in both models', () => {
  for (const model of ['legacy','immiscible']) {
    const timer=loadTimer({model}), masks=new Set();
    for (const shape of ['Capsule','Twin','Pegboard','Wheel']) {
      timer.click('shape'+shape);
      masks.add(Buffer.from(timer.mask).toString('base64'));
      assert.equal(timer.attribute('shape'+shape,'aria-pressed'),'true');
      assert.ok(timer.computeOilMass()>0);
      const {nx,ny}=timer.sim, seen=new Set([timer.fluidCells[0]]), queue=[timer.fluidCells[0]];
      for(let q=0;q<queue.length;q++) {
        const id=queue[q], i=id%nx, j=Math.floor(id/nx);
        for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const x=i+di,y=j+dj,next=x+y*nx;
          if(x>=0&&x<nx&&y>=0&&y<ny&&timer.mask[next]&&!seen.has(next)) {seen.add(next);queue.push(next);}
        }
      }
      assert.equal(seen.size,timer.fluidCells.length, `${model} ${shape}: pressure domain is disconnected`);
      for(let j=0;j<ny;j++) for(let i=0;i<nx;i++) {
        const wall=timer.barrierCells[Math.floor((i+0.5)*144/nx)+Math.floor((j+0.5)*162/ny)*144];
        if(wall) assert.equal(timer.mask[i+j*nx],0, `${shape}: oil grid disagrees with displayed internal glass`);
      }
      const mass=timer.computeOilMass();
      timer.draw();
      if(shape!=='Twin') assert.ok(timer.drawingCalls.some(call=>call[0]==='clip'&&call[1]===timer.liquidCutoutPath&&call[2]==='evenodd'));
      advance(timer,5);
      assertConserved(timer,mass);
      const before=timer.c.slice();
      timer.click('shape'+shape);
      assertSameField(timer.c,before);
    }
    assert.equal(masks.size,4);
    const invertMass=timer.computeOilMass();
    timer.wheel.omega=0.12;
    timer.click('toggleBtn');
    const pausedAngle=timer.wheel.angle;
    advance(timer,5);
    assert.equal(timer.wheel.angle,pausedAngle);
    timer.click('flipBtn');
    advance(timer,108);
    assert.equal(timer.rotation.angle,Math.PI);
    assert.equal(timer.running,false);
    assertConserved(timer,invertMass);
    assert.ok(Number.isFinite(timer.wheel.angle)&&Number.isFinite(timer.wheel.omega));
    timer.click('resetBtn');
    assert.equal(timer.wheel.angle,0); assert.equal(timer.wheel.omega,0);
    const other=model==='legacy'?'modelImmiscible':'modelLegacy';
    timer.click(other);
    assert.equal(timer.attribute('shapeWheel','aria-pressed'),'true');
    assert.equal(timer.wheel.angle,0); assert.equal(timer.wheel.omega,0);
  }
});

test('multi-chamber completion requires the destination reservoir, not just the lower half', () => {
  for (const model of ['legacy','immiscible']) for (const shape of ['Stairs','Twin','Pegboard','Wheel']) {
  const timer = loadTimer({model});
  timer.click('shape'+shape);
  const { nx,ny } = timer.sim;
  const cellAtRow = row => Math.floor(nx/2) + Math.floor(row*ny/162)*nx;
  timer.c.fill(0);
  timer.c[cellAtRow(98)] = 1;
  timer.tick(0);
  assert.equal(timer.getMassFractions().topFraction, 0);
  assert.equal(timer.getMassFractions().reservoirFraction, 0);
  assert.equal(timer.text('stateLabel'), 'RUNNING');
  assert.match(timer.text('progressText'), /Collected 0.0%/);
  timer.c.fill(0);
  timer.c[cellAtRow(140)] = 1;
  timer.tick(0);
  assert.equal(timer.text('stateLabel'), 'COMPLETE');
  timer.rotation.angle = Math.PI;
  timer.tick(0);
  assert.equal(timer.text('stateLabel'), 'RUNNING');
  timer.c.fill(0);
  timer.c[cellAtRow(20)] = 1;
  timer.tick(0);
  assert.equal(timer.text('stateLabel'), 'COMPLETE');
  timer.input('oilDensityNumber', 0.6);
  timer.tick(0);
  assert.equal(timer.text('stateLabel'), 'RUNNING', 'light oil must target the opposite reservoir');
  }
});

test('projected transport replaces outgoing oil in full cells in the same update', () => {
  // These link fluxes belong to Legacy, even though VOF is now the page default.
  const timer = loadTimer({ pageDefaults: true, model: 'legacy' });
  timer.input('surfaceNumber', 0);
  timer.c.fill(0);
  const a = 40 * timer.sim.nx + 70, b = a + 1;
  const d = a + timer.sim.nx, e = d + 1;
  // A closed, divergence-free circulation. Oil leaving a full cell must free
  // capacity for simultaneous inflow, rather than blocking its upstream cell.
  for (const [from, to] of [[a, b], [b, e], [e, d], [d, a]]) {
    const link = timer.flowLinks.find(link => (link.a === from && link.b === to) || (link.b === from && link.a === to));
    assert.ok(link);
    timer.flowFields[link.type][link.slot] = link.a === from ? 0.6 : -0.6;
  }
  timer.c[a] = timer.c[b] = timer.c[e] = 1;
  timer.advectConcentrationConservative(0.18);
  assertConserved(timer, 3);
  assert.ok(Math.abs(timer.c[a] - 0.892) < 1e-12, 'the trailing edge failed to move');
  assert.equal(timer.c[b], 1, 'simultaneous inflow/outflow changed a full interior cell');
  assert.equal(timer.c[e], 1, 'transport punched a hole in the leading full cell');
  assert.ok(Math.abs(timer.c[d] - 0.108) < 1e-12);
});

test('settling damps a grid-scale liquid-surface ripple instead of flipping its sign', () => {
  const timer = loadTimer({ pageDefaults: true, model: 'legacy' });
  // Retain the v0.3.3 strong-drift fixture: the later 1.1-density startup
  // preset relaxes more slowly and is not the original CFL regression.
  timer.input('oilDensityNumber', 3);
  timer.input('surfaceNumber', 8);
  const { nx } = timer.sim, row = 130;
  timer.c.fill(0);
  for (const id of timer.fluidCells) {
    const y = Math.floor(id / nx), x = id % nx;
    timer.c[id] = y > row ? 1 : y === row ? 0.5 + (x % 2 ? -0.01 : 0.01) : 0;
  }
  const mass = timer.computeOilMass();
  timer.settleConcentration(0.18);
  assertConserved(timer, mass);
  let ripple = 0;
  for (let x = nx / 2 - 6; x < nx / 2 + 6; x++) ripple = Math.max(ripple, Math.abs(timer.c[row * nx + x] - 0.5));
  assert.ok(ripple < 0.002, `a one-cell wavelength ripple persisted at amplitude ${ripple}`);
});

test('relative settling is conservative and follows the sign of the density contrast', () => {
  for (const density of [1.3, 0.6]) {
    const timer = loadTimer();
    timer.input('oilDensityRange', density);
    timer.c.fill(0);
    const startRow = timer.sim.ny / 2;
    timer.c[startRow * timer.sim.nx + timer.sim.nx / 2] = 1;
    for (let n = 0; n < 80; n += 1) timer.settleConcentration(0.18);
    assertConserved(timer, 1);
    let meanRow = 0;
    for (const id of timer.fluidCells) meanRow += timer.c[id] * Math.floor(id / timer.sim.nx);
    assert.ok(density > 1 ? meanRow > startRow + 5 : meanRow < startRow - 5);
  }
});

test('relative settling uses consistent time increments at default and capped drift speeds', () => {
  for (const density of [3, 10]) {
    const timers = [loadTimer({ pageDefaults: true, model: 'legacy' }), loadTimer({ pageDefaults: true, model: 'legacy' })];
    for (const timer of timers) {
      timer.input('oilDensityNumber', density);
      timer.c.fill(0);
      const { nx } = timer.sim;
      for (const id of timer.fluidCells) {
        if (Math.floor(id / nx) >= 122 && Math.floor(id / nx) <= 128) timer.c[id] = 0.2 + (id % 7) / 10;
      }
    }
    const mass = timers[0].computeOilMass();
    timers[0].settleConcentration(0.18);
    timers[1].settleConcentration(0.09);
    timers[1].settleConcentration(0.09);
    assertSameField(timers[0].c, timers[1].c);
    for (const timer of timers) assertConserved(timer, mass);
  }
});

test('a resting liquid layer stays level with the full coupled solver', () => {
  for (const [shape, angle, tension, density] of [
    ['Rounded', 0, 1.3, 1.3], ['Rounded', Math.PI, 8, 3],
    ['Rounded', Math.PI / 2, 1.3, 1.3], ['Stairs', 0, 1.3, 1.3]
  ]) {
    const timer = loadTimer();
    timer.click('shape' + shape);
    timer.rotation.angle = angle;
    timer.input('surfaceNumber', tension);
    timer.input('oilDensityNumber', density);
    const mass = seedFlatPool(timer), initial = timer.c.slice();
    timer.applyForces(0.18);
    for (const id of timer.fluidCells) assert.ok(Math.hypot(timer.u[id], timer.v[id]) < 1e-9, 'a flat layer generated a false gravity/capillary current');
    advance(timer, 180);
    assertConserved(timer, mass);
    let maxChange = 0, maxVelocity = 0;
    for (const id of timer.fluidCells) {
      maxChange = Math.max(maxChange, Math.abs(timer.c[id] - initial[id]));
      maxVelocity = Math.max(maxVelocity, Math.hypot(timer.u[id], timer.v[id]));
    }
    assert.ok(maxChange < 1e-6, `${shape} resting layer moved by ${maxChange}`);
    assert.ok(maxVelocity < 1e-5, `${shape} resting layer developed velocity ${maxVelocity}`);
  }
});

test('projected link fluxes are incompressible and preserve a uniform concentration', () => {
  for (const shape of ['Rounded', 'Straight', 'Wide', 'Stairs']) {
    const timer = loadTimer();
    timer.click('shape' + shape);
    timer.input('surfaceNumber', 0);
    for (const id of timer.fluidCells) {
      timer.u[id] = Math.sin(id * 0.12);
      timer.v[id] = Math.cos(id * 0.17);
      timer.c[id] = 0.4;
    }
    const mass = timer.computeOilMass();
    timer.project();
    const divergence = new Float64Array(timer.c.length);
    for (const link of timer.flowLinks) {
      const flux = timer.flowFields[link.type][link.slot];
      divergence[link.a] += flux; divergence[link.b] -= flux;
    }
    assert.ok(timer.pressureStats.residual < 1e-6, `${shape} pressure did not converge`);
    for (const id of timer.fluidCells) assert.ok(Math.abs(divergence[id]) < 1e-5);
    timer.advectConcentrationConservative(0.18);
    assertConserved(timer, mass);
    for (const id of timer.fluidCells) assert.ok(Math.abs(timer.c[id] - 0.4) < 1e-6, 'transport did not use the projected flux');
  }
});

test('constant capillary curvature balances pressure without generating circulation', () => {
  const timer = loadTimer();
  timer.input('oilDensityNumber', 3);
  timer.input('buoyancyNumber', -1);
  timer.input('surfaceNumber', 8);
  for (const id of timer.fluidCells) timer.c[id] = 0.5 + 0.5 * Math.sin(id * 0.03);
  timer.u.fill(0); timer.v.fill(0);
  const mass = timer.computeOilMass(), before = timer.c.slice();
  timer.applyForces(0.18);
  timer.curvature.fill(0.02); // Isolate the constant Laplace-pressure balance.
  timer.project(0.18);
  for (const id of timer.fluidCells) assert.ok(Math.hypot(timer.u[id], timer.v[id]) < 1e-5, 'constant capillary pressure drove a current');
  timer.advectConcentrationConservative(0.18);
  assertConserved(timer, mass);
  for (const id of timer.fluidCells) assert.ok(Math.abs(timer.c[id] - before[id]) < 1e-5);
});

test('the receiving oil levels into a liquid surface instead of a pile', t => {
  for (const [tension, density, separation] of [[1.3, 1.3, 8], [8, 3, 16]]) {
    const timer = loadTimer();
    timer.input('surfaceNumber', tension);
    timer.input('oilDensityNumber', density);
    timer.input('phaseNumber', separation);
    timer.c.fill(0);
    const { nx } = timer.sim;
    for (const id of timer.fluidCells) {
      const surface = 112 + Math.abs(id % nx - nx / 2 + 0.5) * 0.3;
      timer.c[id] = Math.max(0, Math.min(1, Math.floor(id / nx) + 1 - surface));
    }
    const mass = timer.computeOilMass();
    const initialSurface = bottomPoolSurface(timer);
    assert.ok(Math.max(...initialSurface) - Math.min(...initialSurface) > 4);
    advance(timer, 600);
    assertConserved(timer, mass);
    const surfaceRows = bottomPoolSurface(timer);
    assert.equal(surfaceRows.length, 36, 'oil never spread into the adjacent columns');
    const range = Math.max(...surfaceRows) - Math.min(...surfaceRows);
    t.diagnostic(`surface tension ${tension}: mound range ${range.toFixed(6)} grid cells after 600 frames`);
    assert.ok(range <= 1, `oil retained a sloped pile (${range} grid cells)`);
  }
});

test('oil mass is conserved while oil passes through the neck', () => {
  const timer = loadTimer();
  const mass = timer.computeOilMass();
  advance(timer, 120);
  assertConserved(timer, mass);
  assert.ok(timer.getMassFractions().topFraction < 0.99, 'oil did not pass through the neck');
});

test('flow speed changes simulated time, not the physics of each step', () => {
  const normal = loadTimer();
  const slow = loadTimer();
  const fast = loadTimer();
  slow.input('speedRange', 0.05);
  fast.input('speedRange', 10);
  advance(normal, 30);
  advance(slow, 600);
  advance(fast, 3);
  assertSameField(slow.c, normal.c);
  assertSameField(fast.c, normal.c);
});

test('expanded numeric inputs update the solver and stay synchronized with sliders', () => {
  const timer = loadTimer();
  const cases = [
    ['speed', 'speed', 7.5], ['surface', 'surfaceTension', 123.45], ['phase', 'phaseSeparation', 80],
    ['viscosity', 'viscosity', 40], ['waterViscosity', 'waterViscosity', 30],
    ['oilDensity', 'oilDensity', 8], ['waterDensity', 'waterDensity', 0.1], ['buoyancy', 'buoyancy', -3]
  ];
  for (const [prefix, key, value] of cases) {
    timer.input(prefix + 'Number', value);
    assert.equal(timer.parameters[key], value);
    assert.equal(Number(timer.value(prefix + 'Range')), value);
    const min = Number(timer.attribute(prefix + 'Range', 'min'));
    const max = Number(timer.attribute(prefix + 'Range', 'max'));
    for (const bound of [min, max]) {
      timer.input(prefix + 'Range', bound);
      assert.equal(timer.parameters[key], bound);
      assert.equal(Number(timer.value(prefix + 'Number')), bound);
    }
  }
  const before = timer.parameters;
  timer.click('shapeStraight');
  assert.deepEqual(timer.parameters, before);
});

test('empty, nonfinite, out-of-range and off-step drafts never corrupt the simulation', () => {
  const timer = loadTimer({pageDefaults:true});
  for (const prefix of ['speed', 'surface', 'contactAngle', 'phase', 'viscosity', 'waterViscosity', 'oilDensity', 'waterDensity', 'buoyancy']) {
    const before = timer.parameters;
    const validText = timer.value(prefix + 'Number');
    const min = Number(timer.attribute(prefix + 'Range', 'min'));
    const max = Number(timer.attribute(prefix + 'Range', 'max'));
    for (const draft of ['', 'NaN', 'Infinity', 'abc', min - 1, max + 1, min + 0.001]) {
      timer.input(prefix + 'Number', draft);
      assert.deepEqual(timer.parameters, before);
      assert.equal(timer.attribute(prefix + 'Number', 'aria-invalid'), 'true');
      timer.tick(0);
      assert.equal(timer.value(prefix + 'Number'), String(draft), 'rendering replaced an unfinished edit');
      timer.blur(prefix + 'Number');
      assert.equal(timer.value(prefix + 'Number'), validText);
      assert.equal(timer.attribute(prefix + 'Number', 'aria-invalid'), 'false');
    }
  }
  assertConserved(timer, timer.computeOilMass());
});

test('high-speed rendering limits work per frame without leaving a catch-up backlog', () => {
  const limited = loadTimer();
  const normal = loadTimer();
  limited.input('speedNumber', 10);
  assert.equal(limited.step(1 / 60, 3), true);
  advance(normal, 3);
  assertSameField(limited.c, normal.c);
  limited.input('speedNumber', 1);
  advance(limited, 1);
  advance(normal, 1);
  assertSameField(limited.c, normal.c);
  limited.input('speedNumber', 10);
  limited.tick(1000);
  assert.match(limited.text('runtimeText'), /Playback limited/);
  limited.click('toggleBtn');
  limited.tick(2000);
  assert.equal(limited.text('runtimeText'), '');
});

test('buoyancy can reverse or cancel the density force and completion follows that direction', () => {
  const timer = loadTimer();
  timer.c.fill(0);
  const id = (timer.sim.ny / 2 + 8) * timer.sim.nx + timer.sim.nx / 2;
  timer.c[id] = 1;
  timer.input('buoyancyNumber', -1);
  timer.input('surfaceNumber', 0);
  const before = timer.c.slice();
  for (let n = 0; n < 20; n += 1) timer.settleConcentration(0.18);
  advance(timer, 20);
  assertSameField(timer.c, before);
  timer.tick(0);
  assert.equal(timer.text('stateLabel'), 'BALANCED');
  assert.equal(timer.text('etaText'), 'ETA --');
  timer.input('buoyancyNumber', -3);
  timer.tick(0);
  assert.equal(timer.text('stateLabel'), 'RUNNING');
  for (let n = 0; n < 120; n += 1) timer.settleConcentration(0.18);
  assert.ok(timer.getMassFractions().topFraction > 1 - 1e-8);
  assertConserved(timer, 1);
  timer.tick(0);
  assert.equal(timer.text('stateLabel'), 'COMPLETE');
});

test('phase separation above the old range still changes conservative transport', () => {
  const timers = [20, 100].map((phase) => {
    const timer = loadTimer();
    timer.input('phaseNumber', phase);
    for (const id of timer.fluidCells) {
      timer.c[id] = ((id * 37) % 101) / 100;
      timer.u[id] = Math.sin(id);
      timer.v[id] = Math.cos(id);
    }
    const mass = timer.computeOilMass();
    timer.project(0);
    timer.advectConcentrationConservative(0.18);
    assertConserved(timer, mass);
    return timer;
  });
  let maxDifference = 0;
  for (let id = 0; id < timers[0].c.length; id += 1) maxDifference = Math.max(maxDifference, Math.abs(timers[0].c[id] - timers[1].c[id]));
  assert.ok(maxDifference > 0.001, 'phase separation was still saturated at the old cap');
});

test('surface tension above the old limit reaches both solvers without an implicit cap', () => {
  for (const model of ['immiscible', 'legacy']) {
    const fields = [20, 200].map(surface => {
      const timer = loadTimer({ pageDefaults: true, model });
      timer.input('surfaceNumber', surface);
      assert.equal(timer.parameters.surfaceTension, surface);
      assert.equal(Number(timer.value('surfaceRange')), surface);
      const mass = timer.computeOilMass();
      advance(timer, 40);
      assertConserved(timer, mass);
      return timer.c;
    });
    let difference = 0;
    for (let i = 0; i < fields[0].length; i++) difference = Math.max(difference, Math.abs(fields[1][i] - fields[0][i]));
    assert.ok(difference > 1e-6, `${model} still behaves as if surface tension were capped at 20`);
  }
});

test('extreme expanded settings preserve mass, bounds and finite velocities through inversion', () => {
  for (const [oil, water, oilVisc, waterVisc, bias] of [
    [10, 0.05, 0, 50, 5], [0.05, 10, 50, 50, 5], [10, 0.05, 50, 0, -5], [0.05, 0.05, 0, 0, 5]
  ]) {
    const timer = loadTimer();
    for (const [prefix, value] of [['oilDensity', oil], ['waterDensity', water], ['viscosity', oilVisc], ['waterViscosity', waterVisc], ['buoyancy', bias], ['surface', 200], ['phase', 100]]) {
      timer.input(prefix + 'Number', value);
    }
    assert.equal(timer.parameters.surfaceTension, 200);
    const mass = timer.computeOilMass();
    advance(timer, 30);
    assertConserved(timer, mass);
    timer.click('flipBtn');
    for (let n = 0; n < 8; n += 1) {
      advance(timer, 15);
      assertConserved(timer, mass);
    }
    assert.equal(timer.rotation.active, false);
    assertConserved(timer, mass);
    for (const id of timer.fluidCells) assert.ok(Math.hypot(timer.u[id], timer.v[id]) <= timer.sim.velocityCap + 1e-6);
  }
});

test('30, 60 and 120 Hz displays produce the same state after equal elapsed time', () => {
  const timers = [30, 60, 120].map((fps) => {
    const timer = loadTimer();
    advance(timer, fps, fps);
    return timer;
  });
  assertSameField(timers[0].c, timers[1].c);
  assertSameField(timers[2].c, timers[1].c);
});

test('a diagonal transport link cannot cut across solid wall corners', () => {
  const timer = loadTimer();
  timer.click('shapeStairs');
  timer.input('surfaceNumber', 0);
  timer.c.fill(0);
  timer.u.fill(0);
  timer.v.fill(0);
  const { nx } = timer.sim;
  // Use the actual geometry and cached projected links; changing only the
  // mask would leave the pressure operator and transport graph inconsistent.
  const a = timer.fluidCells.find(id => timer.mask[id + nx + 1] && (!timer.mask[id + 1] || !timer.mask[id + nx]));
  assert.notEqual(a, undefined);
  const b = a + nx + 1;
  assert.ok(!timer.flowLinks.some(link => link.a === a && link.b === b));
  timer.c[a] = 1;
  timer.u[a] = timer.v[a] = 1;
  timer.project(0);
  timer.advectConcentrationConservative(0.01);
  assert.equal(timer.c[b], 0);
  assertConserved(timer, 1);

  // An open diagonal in a closed circulation does carry oil directly.
  const diagonal = timer.flowLinks.find(link => link.dx === 1 && link.dy === 1);
  const corner = diagonal.a + 1;
  timer.c.fill(0);
  for (const field of timer.flowFields) field.fill(0);
  timer.c[diagonal.a] = 1;
  for (const [from, to] of [[diagonal.a, diagonal.b], [diagonal.b, corner], [corner, diagonal.a]]) {
    const link = timer.flowLinks.find(link => (link.a === from && link.b === to) || (link.b === from && link.a === to));
    assert.ok(link);
    timer.flowFields[link.type][link.slot] = link.a === from ? 0.1 : -0.1;
  }
  timer.advectConcentrationConservative(0.18);
  assert.ok(timer.c[diagonal.b] > 0);
  assertConserved(timer, 1);
});

test('two animated inversions preserve mass and reset restores the initial upright state', () => {
  const timer = loadTimer();
  const mass = timer.computeOilMass();
  advance(timer, 30);
  timer.click('flipBtn');
  advance(timer, 108);
  assert.equal(timer.rotation.angle, Math.PI);
  timer.click('flipBtn');
  advance(timer, 108);
  assert.equal(timer.rotation.angle, 0);
  assertConserved(timer, mass);
  timer.click('resetBtn');
  assert.equal(timer.computeOilMass(), mass);
  assert.equal(timer.getMassFractions().topFraction, 1);
});

test('inversion computes changing gravity and flow throughout the turn without swapping the fields', () => {
  const timer = loadTimer();
  advance(timer, 20);
  const initial = timer.c.slice();
  const mass = timer.computeOilMass();
  const mask = timer.mask.slice();
  timer.click('flipBtn');
  assertSameField(timer.c, initial);
  assert.equal(timer.rotation.angle, 0);
  assert.equal(timer.attribute('flipBtn', 'disabled'), true);
  for (let quarter = 1; quarter <= 4; quarter++) {
    advance(timer, 27);
    assertConserved(timer, mass);
    assert.deepEqual(timer.mask, mask);
    const angle = timer.rotation.angle;
    const g = timer.localGravity();
    assert.ok(Math.abs(Math.cos(angle) * g.x - Math.sin(angle) * g.y) < 1e-12, 'gravity tilted in world space');
    assert.ok(Math.abs(Math.sin(angle) * g.x + Math.cos(angle) * g.y - 1) < 1e-12);
    if (quarter === 2) {
      assert.ok(Math.abs(angle - Math.PI / 2) < 1e-12);
      assert.ok(timer.c.some((value, id) => Math.abs(value - initial[id]) > 0.01), 'fluid was frozen during rotation');
      timer.tick(0);
      assert.equal(timer.text('stateLabel'), 'TURNING');
      assert.match(timer.text('etaText'), /Rotation/);
      assert.match(timer.text('progressText'), /90°/);
    }
  }
  assert.equal(timer.rotation.active, false);
  assert.equal(timer.rotation.angle, Math.PI);
  assert.equal(timer.rotation.omega, 0);
  assert.equal(timer.rotation.alpha, 0);
  assert.equal(timer.attribute('flipBtn', 'disabled'), false);
});

test('sideways gravity acts on velocity and conservative oil settling in either direction', () => {
  for (const [angle, sign] of [[Math.PI / 2, 1], [3 * Math.PI / 2, -1]]) {
    const timer = loadTimer();
    timer.rotation.angle = angle;
    timer.input('surfaceNumber', 0);
    timer.c.fill(0);
    const startX = timer.sim.nx / 2;
    const id = 50 * timer.sim.nx + startX;
    timer.c[id] = 1;
    timer.applyForces(0.18);
    assert.ok(timer.u[id] * sign > 0);
    assert.equal(timer.v[id], 0);
    for (let n = 0; n < 40; n++) timer.settleConcentration(0.18);
    let meanX = 0;
    for (const cell of timer.fluidCells) meanX += (cell % timer.sim.nx) * timer.c[cell];
    assert.ok((meanX - startX) * sign > 5, 'settling ignored sideways gravity');
    assertConserved(timer, 1);
  }
});

test('rotation inertia moves equal-density liquid and follows the rotating-frame signs', () => {
  const timer = loadTimer();
  timer.input('surfaceNumber', 0);
  timer.input('oilDensityNumber', 1);
  timer.rotation.alpha = 0.1;
  const id = 50 * timer.sim.nx + timer.sim.nx / 2 + 8;
  timer.applyForces(0.1);
  assert.ok(timer.u[id] < 0 && timer.v[id] < 0, 'liquid did not lag clockwise wall acceleration');
  timer.u.fill(0);
  timer.v.fill(0);
  timer.rotation.alpha = 0;
  timer.rotation.omega = 0.1;
  timer.applyForces(0.1);
  assert.ok(timer.u[id] > 0 && timer.v[id] < 0, 'centrifugal acceleration did not point outward');
  const withoutFlow = timer.v[id];
  timer.u.fill(0);
  timer.v.fill(0);
  timer.u[id] = 1;
  timer.applyForces(0.1);
  assert.ok(Math.abs((timer.v[id] - withoutFlow) - (-0.02)) < 1e-6, 'Coriolis force has the wrong sign or magnitude');
});

test('turns have the same coupled trajectory at different playback speeds and display rates', () => {
  const timers = [[30, 0.05], [60, 1], [120, 10]].map(([fps, speed]) => {
    const timer = loadTimer();
    timer.input('speedNumber', speed);
    timer.click('flipBtn');
    advance(timer, fps * 0.9, fps);
    return timer;
  });
  for (const timer of timers) assert.ok(Math.abs(timer.rotation.angle - Math.PI / 2) < 1e-12);
  assertSameField(timers[0].c, timers[1].c);
  assertSameField(timers[2].c, timers[1].c);
  const capped = loadTimer();
  capped.click('flipBtn');
  assert.equal(capped.step(0.2, 3), true);
  assert.ok(Math.abs(capped.rotation.elapsed - 3 / 60) < 1e-12, 'animation ran ahead of computed physics');
});

test('pause, hidden pages, repeated clicks and reset keep rotation and fluid synchronized', () => {
  const timer = loadTimer();
  timer.click('toggleBtn');
  timer.click('flipBtn'); // A manual turn works from a paused state.
  assert.equal(timer.running, true);
  advance(timer, 30);
  timer.click('toggleBtn');
  const angle = timer.rotation.angle;
  const before = timer.c.slice();
  timer.click('flipBtn'); // Guard also protects against programmatic double-clicks.
  timer.tick(1000);
  timer.tick(2000);
  timer.step(1);
  assert.equal(timer.rotation.angle, angle);
  assertSameField(timer.c, before);
  assert.equal(timer.text('stateLabel'), 'TURN PAUSED');
  timer.click('toggleBtn');
  timer.setHidden(true);
  timer.tick(3000);
  assert.equal(timer.rotation.angle, angle);
  assertSameField(timer.c, before);
  timer.setHidden(false);
  advance(timer, 78);
  assert.equal(timer.rotation.active, false);
  assert.equal(timer.running, false, 'turn did not restore the previous pause');
  timer.click('flipBtn');
  advance(timer, 24);
  timer.click('resetBtn');
  assert.equal(timer.rotation.angle, 0);
  assert.equal(timer.rotation.active, false);
  assert.equal(timer.attribute('flipBtn', 'disabled'), false);
  assert.equal(timer.getMassFractions().topFraction, 1);
  timer.click('flipBtn');
  advance(timer, 20);
  timer.click('shapeWide');
  assert.equal(timer.rotation.angle, 0);
  assert.equal(timer.rotation.active, false);
  assert.equal(timer.getMassFractions().topFraction, 1);
});

test('all rotating vessel outlines fit the canvas and top/bottom readings use world space', () => {
  const timer = loadTimer();
  timer.rotation.angle = Math.PI;
  assert.equal(timer.getMassFractions().topFraction, 0);
  timer.rotation.angle = Math.PI / 2;
  assert.ok(Math.abs(timer.getMassFractions().topFraction - 0.5) < 1e-12);
  for (const shape of ['Rounded', 'Straight', 'Wide', 'Stairs', 'Capsule', 'Twin', 'Pegboard', 'Wheel']) {
    timer.click('shape' + shape);
    for (let n = 0; n <= 12; n++) {
      const angle = n * Math.PI / 12;
      timer.rotation.angle = angle;
      const scale = timer.vesselViewScale();
      for (const [x, y] of timer.glassOutline) {
        assert.ok(Math.abs(Math.cos(angle) * x - Math.sin(angle) * y) * scale <= 302 + 1e-9);
        assert.ok(Math.abs(Math.sin(angle) * x + Math.cos(angle) * y) * scale <= 342 + 1e-9);
      }
      timer.drawingCalls.length = 0;
      timer.draw();
      assert.ok(timer.drawingCalls.some(call => call[0] === 'rotate' && call[1] === angle));
      assert.ok(timer.drawingCalls.some(call => call[0] === 'scale' && call[1] === scale));
    }
  }
});

test('zero elapsed time and paused animation frames do not evolve the oil', () => {
  const timer = loadTimer();
  advance(timer, 15);
  const before = timer.c.slice();
  timer.step(0);
  assertSameField(timer.c, before);
  timer.click('toggleBtn');
  timer.tick(1000);
  timer.tick(2000);
  assertSameField(timer.c, before);
  assert.match(timer.text('stateLabel'), /PAUSED/);
  assert.match(timer.text('massErrorText'), /0\.0000%/);
});

test('equal densities without surface tension leave the resting fluid at rest', () => {
  const timer = loadTimer();
  timer.input('oilDensityRange', 1);
  timer.input('waterDensityRange', 1);
  timer.input('surfaceRange', 0);
  const before = timer.c.slice();
  advance(timer, 30);
  assertSameField(timer.c, before);
});

test('conservative transport stays bounded at the extreme interface settings', () => {
  for (const [tension, separation] of [[0, 0], [2, 20]]) {
    const timer = loadTimer();
    timer.input('surfaceRange', tension);
    timer.input('phaseRange', separation);
    for (let i = 0; i < timer.c.length; i += 1) {
      if (!timer.mask[i]) continue;
      timer.c[i] = ((i * 37) % 101) / 100;
      timer.u[i] = 4 * Math.sin(i);
      timer.v[i] = 4 * Math.cos(i);
    }
    const mass = timer.computeOilMass();
    timer.project(0);
    for (let i = 0; i < 30; i += 1) timer.advectConcentrationConservative(0.18);
    assertConserved(timer, mass);
  }
});

test('Stairs oil reaches every flight and drains fully before and after animated inversion', t => {
  const timer = loadTimer();
  timer.click('shapeStairs');
  const mass = timer.computeOilMass();
  const originalMask = timer.mask.slice();
  const visited = [false, false, false];
  for (let run = 0; run < 2; run++) {
    let frames = 0;
    // Removing spurious pressure currents changes the transit time. Keep the
    // strict complete-drain criterion, with time for head-driven films to drain.
    while (timer.getMassFractions().reservoirFraction < 1 - 1e-8 && frames < 10000) {
      advance(timer, 30);
      frames += 30;
      if (!run) for (const [flight, row] of [45, 72, 99].entries()) {
        let landingMass = 0;
        for (let i = 40; i < 104; i++) landingMass += timer.c[i + row * timer.sim.nx];
        if (landingMass > 0.5) visited[flight] = true;
      }
    }
    advance(timer, 120);
    assertConserved(timer, mass);
    const collected = timer.getMassFractions().reservoirFraction;
    t.diagnostic(`Stairs run ${run}: ${frames} frames, ${(collected * 100).toFixed(8)}% collected`);
    assert.ok(collected > 1 - 1e-8, `oil stayed on stairs after ${frames} frames (run ${run}, collected ${collected})`);
    assert.ok(visited.every(Boolean), 'oil must land on all three flights');
    timer.tick(0);
    assert.equal(timer.text('etaText'), 'Transfer complete');
    if (!run) {
      timer.click('flipBtn');
      advance(timer, 108);
      assert.equal(timer.rotation.angle, Math.PI);
      assert.deepEqual(timer.mask, originalMask, 'asymmetric stairs stay in vessel coordinates');
      assertConserved(timer, mass);
      assert.ok(timer.getMassFractions().reservoirFraction < 0.5);
    }
  }
});

for (const shape of ['Rounded', 'Straight', 'Wide']) {
  test(`${shape} vessel drains completely, including after inversion, without losing oil`, t => {
    const timer = loadTimer();
    timer.click('shape' + shape);
    const mass = timer.computeOilMass();
    for (let run = 0; run < 2; run += 1) {
      let frames = 0;
      while (timer.getMassFractions().topFraction > 1e-8 && frames < 1800) {
        advance(timer, 30);
        frames += 30;
      }
      advance(timer, 120); // Completion must persist, not be a transient crossing.
      assertConserved(timer, mass);
      t.diagnostic(`${shape} run ${run}: ${frames} frames, ${timer.getMassFractions().topFraction} left above`);
      assert.ok(timer.getMassFractions().topFraction < 1e-8, `${shape} retained oil after ${frames} frames (run ${run})`);
      let maxTop = 0;
      const g = timer.localGravity();
      for (const id of timer.fluidCells) {
        const y = (id % timer.sim.nx + 0.5 - timer.sim.nx / 2) * g.x + (Math.floor(id / timer.sim.nx) + 0.5 - timer.sim.ny / 2) * g.y;
        if (y < 0) maxTop = Math.max(maxTop, timer.c[id]);
      }
      assert.ok(maxTop < 1e-5, 'a visible pocket remained in the upper bulb');
      timer.tick(0);
      assert.equal(timer.text('etaText'), 'Transfer complete');
      if (!run) {
        timer.click('flipBtn');
        advance(timer, 108);
        assert.equal(timer.rotation.angle, Math.PI);
        assert.ok(timer.getMassFractions().topFraction > 0.5, 'inversion should return oil to the upper bulb');
      }
    }
  });
}
