const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../random-walk-lab/simulation.js');

function complete(config) {
  const simulation = core.createSimulation(config);
  simulation.advance(simulation.config.steps);
  return simulation;
}

test('validates defaults, numerical bounds, seeds and work budget', () => {
  assert.deepEqual(core.validateConfig(), { dims: 2, walkers: 512, steps: 2000, seed: 42, stepLength: 1 });
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
  assert.deepEqual(incremental.advance(0), { t: 0, rms: 0, msd: 0, meanDistance: 0 });
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
      if (step === 1) assert.deepEqual(simulation.snapshot(), { t: 1, rms: 2.5, msd: 6.25, meanDistance: 2.5 });
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
  assert.equal(lines[0], 't,rms,msd,mean_distance,theory_rms,theory_msd,dims,walkers,step_length,seed');
  assert.equal(lines.length, simulation.points.length + 1);
  const last = lines.at(-1).split(',').map(Number);
  assert.equal(last[0], 100);
  assert.equal(last[1], simulation.snapshot().rms);
  assert.deepEqual(last.slice(4), [20, 400, 5, 16, 2, 0]);
});
