const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../random-walk-lab/simulation.js');

function complete(config) {
  const simulation = core.createSimulation(config);
  simulation.advance(simulation.config.steps);
  return simulation;
}

test('validates defaults, numerical bounds, seeds and work budget', () => {
  assert.deepEqual(core.validateConfig(), { dims: 2, walkers: 512, steps: 2000, seed: 42, stepLength: 1, model: 'lattice', bias: 0.3, persistence: 0.85, radius: 10 });
  assert.equal(core.validateConfig({ seed: 0 }).seed, 0);
  assert.equal(core.validateConfig({ seed: 4294967295 }).seed, 4294967295);
  assert.equal(core.validateConfig({ dims: 100, walkers: 1000, steps: 20000 }).steps, 20000);
  assert.equal(core.validateConfig({ walkers: 4096, steps: 100, stepLength: 0.001 }).walkers, 4096);
  for (const config of [null, [], { dims: 0 }, { dims: 101 }, { dims: 1.5 }, { dims: '2' },
    { walkers: 15 }, { walkers: 4097 }, { steps: 99 }, { steps: 20001 },
    { seed: -1 }, { seed: 4294967296 }, { seed: 0.5 }, { seed: NaN },
    { stepLength: 0 }, { stepLength: Infinity }, { stepLength: 1001 }, { stepLength: null },
    { walkers: 4096, steps: 20000 }]) {
    assert.throws(() => core.validateConfig(config), RangeError);
  }
});

test('seeded RNG is reproducible, bounded and nondegenerate for seed zero', () => {
  const first = core.createRng(0);
  const second = core.createRng(0);
  const other = core.createRng(1);
  const values = Array.from({ length: 1000 }, () => first());
  assert.deepEqual(values, Array.from({ length: 1000 }, () => second()));
  assert.notDeepEqual(values, Array.from({ length: 1000 }, () => other()));
  assert.ok(values.every(value => value >= 0 && value < 1));
  assert.ok(new Set(values).size > 990);
  assert.throws(() => core.createRng(-1), RangeError);
});

test('incremental execution exactly matches a single run and clamps at the end', () => {
  const config = { dims: 7, walkers: 64, steps: 1079, seed: 0, stepLength: 0.3 };
  const whole = complete(config);
  const incremental = core.createSimulation(config);
  assert.deepEqual(incremental.advance(0), { t: 0, rms: 0, msd: 0, meanDistance: 0, axisMSD: Array(7).fill(0), activeCount: 64 });
  while (!incremental.done) incremental.advance(17);
  assert.equal(incremental.step, config.steps);
  assert.deepEqual(incremental.snapshot(), whole.snapshot());
  assert.deepEqual(incremental.points, whole.points);
  assert.deepEqual(incremental.trajectories, whole.trajectories);
  assert.deepEqual(incremental.positions, whole.positions);
  const recorded = incremental.points.length;
  assert.deepEqual(incremental.advance(100), whole.snapshot());
  assert.equal(incremental.points.length, recorded);
  for (const count of [-1, NaN, Infinity, 0.5, '1']) assert.throws(() => incremental.advance(count), RangeError);
});

test('every lattice move has length one, including 100-dimensional walks', () => {
  for (const dims of [1, 2, 3, 100]) {
    const simulation = core.createSimulation({ dims, walkers: 16, steps: 100, stepLength: 2.5 });
    let previous = simulation.positions.slice();
    for (let step = 1; step <= 10; step += 1) {
      simulation.advance(1);
      for (let walker = 0; walker < 16; walker += 1) {
        let squaredMove = 0;
        let squaredDistance = 0;
        for (let axis = 0; axis < dims; axis += 1) {
          const coordinate = walker * dims + axis;
          squaredMove += (simulation.positions[coordinate] - previous[coordinate]) ** 2;
          squaredDistance += simulation.positions[coordinate] ** 2;
        }
        assert.equal(squaredMove, 1);
        if (walker < 8) assert.ok(Math.abs(simulation.trajectories[walker].at(-1).r - Math.sqrt(squaredDistance) * 2.5) < 1e-12);
      }
      previous = simulation.positions.slice();
      if (step === 1) {
        assert.equal(simulation.snapshot().rms, 2.5);
        assert.equal(simulation.snapshot().msd, 6.25);
        assert.equal(simulation.snapshot().meanDistance, 2.5);
      }
    }
  }
});

test('incremental squared-distance statistics agree with full N-dimensional coordinates', () => {
  const simulation = complete({ dims: 13, walkers: 1024, steps: 1000, stepLength: 0.37 });
  let sumSquared = 0;
  let sumDistance = 0;
  for (let walker = 0; walker < 1024; walker += 1) {
    let squared = 0;
    for (let axis = 0; axis < 13; axis += 1) squared += simulation.positions[walker * 13 + axis] ** 2;
    sumSquared += squared;
    sumDistance += Math.sqrt(squared);
  }
  const snapshot = simulation.snapshot();
  assert.ok(Math.abs(snapshot.msd - sumSquared / 1024 * 0.37 ** 2) < 1e-10);
  assert.ok(Math.abs(snapshot.meanDistance - sumDistance / 1024 * 0.37) < 1e-10);
  assert.ok(snapshot.meanDistance <= snapshot.rms);
});

test('MSD is t and RMS exponent is 1/2 in dimensions 1, 2, 3, 10 and 100', () => {
  for (const dims of [1, 2, 3, 10, 100]) {
    const simulation = complete({ dims, walkers: 4096, steps: 1000, seed: 20260914 });
    const final = simulation.snapshot();
    assert.ok(Math.abs(final.msd / 1000 - 1) < 0.065, `${dims}D MSD=${final.msd}`);
    const fit = core.fitPowerLaw(simulation.points, 'rms', 20, 1000);
    assert.ok(Math.abs(fit.exponent - 0.5) < 0.025, `${dims}D exponent=${fit.exponent}`);
    assert.ok(fit.rSquared > 0.99);
    const msdFit = core.fitPowerLaw(simulation.points, 'msd', 20, 1000);
    assert.ok(Math.abs(msdFit.exponent - 2 * fit.exponent) < 1e-12);
  }
});

test('changing step length scales distances without changing walks or exponent', () => {
  const unit = complete({ dims: 4, walkers: 128, steps: 500, stepLength: 1 });
  const scaled = complete({ dims: 4, walkers: 128, steps: 500, stepLength: 3.25 });
  assert.deepEqual(unit.positions, scaled.positions);
  assert.ok(Math.abs(scaled.snapshot().rms / unit.snapshot().rms - 3.25) < 1e-12);
  assert.ok(Math.abs(scaled.snapshot().msd / unit.snapshot().msd - 3.25 ** 2) < 1e-12);
  assert.ok(Math.abs(core.fitPowerLaw(scaled.points).exponent - core.fitPowerLaw(unit.points).exponent) < 1e-12);
});

test('power-law fit recovers known exponents, range boundaries and rejects sparse data', () => {
  for (const exponent of [-0.5, 0, 0.5, 1, 2]) {
    const points = Array.from({ length: 20 }, (_, index) => ({ t: 2 ** index, value: 3.7 * (2 ** index) ** exponent }));
    const fit = core.fitPowerLaw(points, 'value', 4, 1024);
    assert.equal(fit.count, 9);
    assert.ok(Math.abs(fit.exponent - exponent) < 1e-12);
    assert.ok(Math.abs(fit.prefactor - 3.7) < 1e-12);
    assert.ok(Math.abs(fit.rSquared - 1) < 1e-12);
  }
  assert.equal(core.fitPowerLaw([{ t: 0, rms: 0 }, { t: 1, rms: 1 }, { t: 2, rms: NaN }, { t: 3, rms: -1 }]), null);
  assert.equal(core.fitPowerLaw([{ t: 1, rms: 1 }, { t: 1, rms: 2 }, { t: 1, rms: 3 }]), null);
  assert.throws(() => core.fitPowerLaw([], 'rms', 5, 1), RangeError);
});

test('sample storage is bounded, sorted and includes zero and exact final time', () => {
  const simulation = complete({ dims: 100, walkers: 16, steps: 19999 });
  assert.ok(simulation.points.length <= 183);
  assert.equal(simulation.points[0].t, 0);
  assert.equal(simulation.points.at(-1).t, 19999);
  assert.ok(simulation.points.every((point, index) => !index || point.t > simulation.points[index - 1].t));
  assert.equal(simulation.trajectories.length, 8);
  for (const path of simulation.trajectories) {
    assert.ok(path.length <= 802);
    assert.equal(path[0].t, 0);
    assert.equal(path.at(-1).t, 19999);
    assert.ok(path.every((point, index) => !index || point.t > path[index - 1].t));
  }
});

test('CSV keeps numerical results, theoretical values and reproducibility parameters', () => {
  const simulation = complete({ dims: 5, walkers: 16, steps: 100, seed: 0, stepLength: 2 });
  const lines = core.toCSV(simulation).trim().split('\r\n');
  assert.equal(lines[0], 't,rms,msd,mean_distance,theory_rms,theory_msd,dims,walkers,step_length,seed,model,bias,persistence,radius,active_count,axis_msd_1,axis_msd_2,axis_msd_3,axis_msd_4,axis_msd_5');
  assert.equal(lines.length, simulation.points.length + 1);
  const last = lines.at(-1).split(',').map(Number);
  assert.equal(last[0], 100);
  assert.equal(last[1], simulation.snapshot().rms);
  assert.deepEqual(last.slice(4, 10), [20, 400, 5, 16, 2, 0]);
  assert.equal(lines.at(-1).split(',')[10], 'lattice');
  assert.ok(Math.abs(last.slice(15).reduce((sum, value) => sum + value, 0) - simulation.snapshot().msd) < 1e-12);
});

test('legacy seed42 lattice coordinates and scalar results remain exactly unchanged', () => {
  const simulation = complete();
  const hash = require('node:crypto').createHash('sha256').update(Buffer.from(simulation.positions.buffer)).digest('hex');
  assert.equal(hash, 'e6f8dbc583e6eb15d7f3033c04731a5e7cb1a542d78e5622d6c05d307dc142c3');
  assert.equal(simulation.snapshot().msd, 2191.19140625);
  assert.equal(simulation.snapshot().rms, 46.81016349309197);
  assert.equal(simulation.snapshot().meanDistance, 41.81221410206743);
});

test('model parameters and model-specific work and memory bounds fail before allocation', () => {
  for (const config of [{ model: 'unknown' }, { model: null }, { bias: -0.01 }, { bias: 1.01 },
    { persistence: NaN }, { persistence: 1.01 }, { radius: 0 }, { radius: 1.5 }, { radius: 101 },
    { model: 'independent', dims: 100, walkers: 512, steps: 1000 },
    { model: 'gaussian', dims: 100, walkers: 512, steps: 1000 },
    { model: 'selfAvoiding', dims: 11, walkers: 16, steps: 100 },
    { model: 'selfAvoiding', dims: 2, walkers: 513, steps: 100 },
    { model: 'selfAvoiding', dims: 2, walkers: 16, steps: 1001 },
    { model: 'selfAvoiding', dims: 2, walkers: 512, steps: 1000 },
    { model: 'selfAvoiding', dims: 10, walkers: 128, steps: 1000 }]) {
    assert.throws(() => core.createSimulation(config), RangeError);
  }
  assert.equal(core.validateConfig({ model: 'gaussian', dims: 100, walkers: 1000, steps: 200 }).dims, 100);
  assert.equal(core.validateConfig({ model: 'selfAvoiding', dims: 10, walkers: 128, steps: 500 }).steps, 500);
  assert.equal(core.validateConfig({ model: 'selfAvoiding', dims: 1, walkers: 199, steps: 1000 }).walkers, 199);
});

test('theoretical MSD covers exact limits and a stable persistent correlation sum', () => {
  for (const dims of [1, 3, 100]) {
    assert.equal(core.theoreticalMSD(100, { dims, stepLength: 2 }), 400);
    assert.equal(core.theoreticalMSD(100, { dims, stepLength: 2, model: 'independent' }), dims * 400);
    assert.equal(core.theoreticalMSD(100, { dims, stepLength: 2, model: 'gaussian' }), 400);
    for (const model of ['biased', 'persistent']) {
      const parameter = model === 'biased' ? 'bias' : 'persistence';
      assert.equal(core.theoreticalMSD(100, { model, dims, stepLength: 2, [parameter]: 0 }), 400);
      assert.equal(core.theoreticalMSD(100, { model, dims, stepLength: 2, [parameter]: 1 }), 40000);
    }
  }
  for (const p of [0.1, 0.85, 0.999999999999]) {
    const t = 100;
    let expected = t;
    for (let lag = 1; lag < t; lag += 1) expected += 2 * (t - lag) * p ** lag;
    assert.ok(Math.abs(core.theoreticalMSD(t, { model: 'persistent', persistence: p }) - expected) < 1e-8);
  }
  const almostStraight = core.theoreticalMSD(20000, { model: 'persistent', persistence: 1 - 1e-12 });
  assert.ok(almostStraight <= 400000000 && almostStraight > 399999990);
  assert.equal(core.theoreticalMSD(100, { model: 'confined' }), null);
  assert.equal(core.theoreticalMSD(100, { model: 'selfAvoiding' }), null);
  assert.equal(core.modelInfo({ model: 'biased', bias: 0.3 }).exponentRMS, null);
  assert.equal(core.modelInfo({ model: 'persistent', persistence: 0.85 }).exponentRMS, null);
  assert.equal(core.modelInfo({ model: 'selfAvoiding' }).exponentRMS, null);
  assert.throws(() => core.theoreticalMSD(Infinity), RangeError);
});

test('zero bias and zero persistence reproduce the legacy lattice sequence', () => {
  const config = { dims: 3, walkers: 64, steps: 200, seed: 0 };
  const lattice = complete(config);
  const unbiased = complete({ ...config, model: 'biased', bias: 0 });
  const memoryless = complete({ ...config, model: 'persistent', persistence: 0 });
  assert.deepEqual(unbiased.positions, lattice.positions);
  assert.deepEqual(memoryless.positions, lattice.positions);
  assert.deepEqual(unbiased.points, lattice.points);
  assert.deepEqual(memoryless.points, lattice.points);
});

test('full bias and full persistence are exactly ballistic in any dimension', () => {
  for (const model of ['biased', 'persistent']) {
    const simulation = complete({ model, dims: 10, walkers: 64, steps: 300, stepLength: 0.25, bias: 1, persistence: 1 });
    assert.equal(simulation.snapshot().rms, 75);
    assert.equal(simulation.snapshot().msd, 5625);
    assert.equal(core.fitPowerLaw(simulation.points).exponent, 1);
    for (const path of simulation.trajectories) {
      assert.ok(path.every(point => Math.abs(point.r - point.t * 0.25) < 1e-12));
      if (model === 'biased') assert.ok(path.every(point => point.coords[0] === point.t * 0.25 && point.coords.slice(1).every(value => value === 0)));
    }
  }
});

test('independent-axis and Gaussian variants have their specified MSD normalization', () => {
  for (const model of ['independent', 'gaussian']) {
    const simulation = complete({ model, dims: 5, walkers: 4096, steps: 500, seed: 19 });
    const theory = core.theoreticalMSD(500, simulation.config);
    assert.ok(Math.abs(simulation.snapshot().msd / theory - 1) < 0.04, `${model}: ${simulation.snapshot().msd} / ${theory}`);
    const expectedAxis = theory / 5;
    // A single-axis sample second moment has relative standard error ≈√(2/M).
    // Use five standard errors when checking several axes simultaneously.
    assert.ok(simulation.snapshot().axisMSD.every(value => Math.abs(value / expectedAxis - 1) < 5 * Math.sqrt(2 / 4096)));
    const first = simulation.points.find(point => point.t === 1);
    if (model === 'independent') {
      assert.equal(first.msd, 5);
      assert.deepEqual(first.axisMSD, [1, 1, 1, 1, 1]);
    } else {
      assert.ok(simulation.positions instanceof Float64Array);
      assert.ok(simulation.positions.some(value => !Number.isInteger(value)));
      assert.ok(Math.abs(first.msd - 1) < 0.05);
    }
  }
});

test('biased and persistent ensembles agree with their crossover MSD curves', () => {
  for (const model of ['biased', 'persistent']) {
    const simulation = complete({ model, dims: 3, walkers: 4096, steps: 700, bias: 0.2, persistence: 0.85, seed: 20260914 });
    for (const time of [100, 300, 700]) {
      const point = simulation.points.reduce((closest, candidate) => Math.abs(candidate.t - time) < Math.abs(closest.t - time) ? candidate : closest);
      const theory = core.theoreticalMSD(point.t, simulation.config);
      assert.ok(Math.abs(point.msd / theory - 1) < 0.065, `${model} t=${point.t} got=${point.msd} theory=${theory}`);
    }
  }
});

test('confined proposals stay within the box and approach the uniform stationary MSD', () => {
  const simulation = complete({ model: 'confined', dims: 3, walkers: 4096, steps: 1000, radius: 2, stepLength: 0.5 });
  assert.ok(simulation.positions.every(value => Math.abs(value) <= 2));
  assert.ok(simulation.trajectories.every(path => path.every(point => point.coords.every(value => Math.abs(value) <= 1))));
  const plateau = 3 * 0.5 ** 2 * 2 * 3 / 3;
  assert.ok(Math.abs(simulation.snapshot().msd / plateau - 1) < 0.05);
  assert.equal(simulation.activeCount, 4096);
  assert.equal(core.theoreticalMSD(1000, simulation.config), null);
});

test('kinetic growth never revisits until trapping, then remains frozen in the ensemble', () => {
  const simulation = complete({ model: 'selfAvoiding', dims: 2, walkers: 128, steps: 300, seed: 0 });
  assert.ok(simulation.activeCount < 128);
  assert.ok(simulation.points.every((point, index) => !index || point.activeCount <= simulation.points[index - 1].activeCount));
  for (const path of simulation.trajectories) {
    const visited = new Set();
    let trapped = null;
    for (const point of path) {
      const key = Array.from(point.coords).join(',');
      if (trapped !== null) assert.equal(key, trapped);
      else if (visited.has(key)) {
        assert.equal(key, Array.from(path[point.t - 1].coords).join(','));
        trapped = key;
      }
      visited.add(key);
    }
  }
  const oneDimensional = complete({ model: 'selfAvoiding', dims: 1, walkers: 16, steps: 100 });
  assert.equal(oneDimensional.activeCount, 16);
  assert.equal(oneDimensional.snapshot().msd, 10000);
  assert.equal(core.modelInfo(oneDimensional.config).exponentRMS, null);
});

test('all variants retain chunk determinism, full coordinates and axis statistics', () => {
  for (const model of core.MODELS) {
    const config = { model, dims: 3, walkers: 17, steps: 300, stepLength: 0.37, seed: 0 };
    const whole = complete(config);
    const partial = core.createSimulation(config);
    while (!partial.done) partial.advance(7);
    assert.deepEqual(partial.points, whole.points, model);
    assert.deepEqual(partial.trajectories, whole.trajectories, model);
    assert.deepEqual(partial.positions, whole.positions, model);
    let totalSquared = 0;
    for (const position of whole.positions) totalSquared += (position * 0.37) ** 2;
    const snapshot = whole.snapshot();
    assert.ok(Math.abs(snapshot.msd - totalSquared / 17) < 1e-8, model);
    assert.ok(Math.abs(snapshot.axisMSD.reduce((sum, value) => sum + value, 0) - snapshot.msd) < 1e-8, model);
    for (let walker = 0; walker < 8; walker += 1) {
      const final = whole.trajectories[walker].at(-1);
      assert.deepEqual(final.coords, whole.latestCoordinates[walker]);
      assert.equal(final.x, final.coords[0]);
      assert.equal(final.y, final.coords[1]);
      assert.equal(final.z, final.coords[2]);
      assert.ok(Math.abs(Math.hypot(...final.coords) - final.r) < 1e-8, model);
    }
  }
});

test('latest full coordinates advance between saved trajectory points and do not alias history', () => {
  const simulation = core.createSimulation({ dims: 100, walkers: 16, steps: 2000 });
  simulation.advance(1);
  assert.equal(simulation.trajectories[0].length, 1);
  assert.equal(simulation.latestCoordinates[0].length, 100);
  assert.equal(Math.hypot(...simulation.latestCoordinates[0]), 1);
  assert.ok(simulation.trajectories[0][0].coords.every(value => value === 0));
  simulation.advance(2);
  const saved = simulation.trajectories[0].at(-1).coords.slice();
  simulation.advance(1);
  assert.deepEqual(simulation.trajectories[0].at(-1).coords, saved);
});

test('CSV omits nonexistent theory and retains model parameters and trapped counts', () => {
  const simulation = complete({ model: 'selfAvoiding', dims: 2, walkers: 16, steps: 100 });
  const rows = core.toCSV(simulation).trim().split('\r\n').map(row => row.split(','));
  const last = rows.at(-1);
  assert.equal(last[4], '');
  assert.equal(last[5], '');
  assert.equal(last[10], 'selfAvoiding');
  assert.equal(Number(last[14]), simulation.activeCount);
  assert.deepEqual(last.slice(15).map(Number), simulation.snapshot().axisMSD);
});
