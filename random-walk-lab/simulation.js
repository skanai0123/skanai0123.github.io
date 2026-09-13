(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RandomWalkCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_CONFIG = Object.freeze({ dims: 2, walkers: 512, steps: 2000, seed: 42, stepLength: 1 });
  const LIMITS = Object.freeze({
    dims: Object.freeze({ min: 1, max: 100 }),
    walkers: Object.freeze({ min: 16, max: 4096 }),
    steps: Object.freeze({ min: 100, max: 20000 }),
    seed: Object.freeze({ min: 0, max: 4294967295 }),
    stepLength: Object.freeze({ min: 0.001, max: 1000 }),
    maxOperations: 20000000
  });

  function validateConfig(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new RangeError('シミュレーション設定を指定してください。');
    }
    const config = {};
    const labels = { dims: '次元', walkers: '試行数', steps: 'ステップ数', seed: 'シード', stepLength: '1歩の長さ' };
    for (const key of Object.keys(DEFAULT_CONFIG)) {
      const value = input[key] === undefined ? DEFAULT_CONFIG[key] : input[key];
      const limit = LIMITS[key];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < limit.min || value > limit.max || (key !== 'stepLength' && !Number.isInteger(value))) {
        throw new RangeError(`${labels[key]}は ${limit.min}〜${limit.max} の${key === 'stepLength' ? '数値' : '整数'}にしてください。`);
      }
      config[key] = value;
    }
    if (config.walkers * config.steps > LIMITS.maxOperations) {
      throw new RangeError('試行数 × ステップ数を 20,000,000 以下にしてください。');
    }
    return Object.freeze(config);
  }

  // Mulberry32: a reproducible 32-bit PRNG. Seed 0 is a valid, nondegenerate seed.
  function createRng(seed) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) {
      throw new RangeError('シードは 0〜4294967295 の整数にしてください。');
    }
    let state = seed >>> 0;
    return function random() {
      state = (state + 0x6D2B79F5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function sampleTimes(steps) {
    const times = new Set([1, steps]);
    for (let index = 0; index < 180; index += 1) {
      times.add(Math.round(Math.exp(Math.log(steps) * index / 179)));
    }
    return Array.from(times).sort((a, b) => a - b);
  }

  function createSimulation(input) {
    const config = validateConfig(input);
    const { dims, walkers, steps, stepLength } = config;
    const random = createRng(config.seed);
    // Integer lattice coordinates avoid roundoff accumulating in long trajectories.
    // Every step chooses exactly one of the 2N signed unit directions.
    const positions = new Int32Array(dims * walkers);
    const radiiSquared = new Float64Array(walkers);
    const points = [{ t: 0, rms: 0, msd: 0, meanDistance: 0 }];
    const trajectories = Array.from({ length: Math.min(8, walkers) }, () => [{ t: 0, x: 0, y: 0, z: 0, r: 0 }]);
    const times = sampleTimes(steps);
    const trajectoryInterval = Math.max(1, Math.ceil(steps / 800));
    let step = 0;
    let nextSample = 0;

    function snapshot() {
      let sumSquared = 0;
      let sumDistance = 0;
      for (let walker = 0; walker < walkers; walker += 1) {
        sumSquared += radiiSquared[walker];
        sumDistance += Math.sqrt(radiiSquared[walker]);
      }
      const msd = sumSquared / walkers * stepLength * stepLength;
      return { t: step, rms: Math.sqrt(msd), msd, meanDistance: sumDistance / walkers * stepLength };
    }

    function recordTrajectories() {
      for (let walker = 0; walker < trajectories.length; walker += 1) {
        const offset = walker * dims;
        trajectories[walker].push({
          t: step,
          x: positions[offset] * stepLength,
          y: dims >= 2 ? positions[offset + 1] * stepLength : 0,
          z: dims >= 3 ? positions[offset + 2] * stepLength : 0,
          r: Math.sqrt(radiiSquared[walker]) * stepLength
        });
      }
    }

    function advance(count = 1) {
      if (!Number.isSafeInteger(count) || count < 0) {
        throw new RangeError('進めるステップ数は 0 以上の整数にしてください。');
      }
      const end = Math.min(steps, step + count);
      while (step < end) {
        for (let walker = 0; walker < walkers; walker += 1) {
          const direction = Math.floor(random() * (2 * dims));
          const coordinate = walker * dims + Math.floor(direction / 2);
          const sign = direction % 2 === 0 ? -1 : 1;
          const oldPosition = positions[coordinate];
          positions[coordinate] = oldPosition + sign;
          radiiSquared[walker] += 2 * oldPosition * sign + 1;
        }
        step += 1;
        if (step === times[nextSample]) {
          points.push(snapshot());
          nextSample += 1;
        }
        if (step % trajectoryInterval === 0 || step === steps) recordTrajectories();
      }
      return snapshot();
    }

    return Object.freeze({
      config, points, trajectories, positions, advance, snapshot,
      get step() { return step; },
      get done() { return step === steps; }
    });
  }

  // Unweighted least squares on recorded log(t), log(y) pairs. Adjacent times
  // belong to the same ensemble, so R² is a fit diagnostic, not uncertainty.
  function fitPowerLaw(points, key = 'rms', start = 1, end = Infinity) {
    if (!Array.isArray(points) || !Number.isFinite(start) || start < 0 || typeof end !== 'number' || Number.isNaN(end) || end < start) {
      throw new RangeError('有効なデータとフィット範囲を指定してください。');
    }
    const data = points.filter(point => point && Number.isFinite(point.t) && point.t > 0 && point.t >= start && point.t <= end && Number.isFinite(point[key]) && point[key] > 0)
      .map(point => ({ x: Math.log(point.t), y: Math.log(point[key]) }));
    if (data.length < 3) return null;
    const count = data.length;
    const meanX = data.reduce((sum, point) => sum + point.x, 0) / count;
    const meanY = data.reduce((sum, point) => sum + point.y, 0) / count;
    let varianceX = 0;
    let covariance = 0;
    let varianceY = 0;
    for (const point of data) {
      const dx = point.x - meanX;
      const dy = point.y - meanY;
      varianceX += dx * dx;
      covariance += dx * dy;
      varianceY += dy * dy;
    }
    if (varianceX <= 0) return null;
    const exponent = covariance / varianceX;
    const prefactor = Math.exp(meanY - exponent * meanX);
    let residual = 0;
    for (const point of data) residual += (point.y - meanY - exponent * (point.x - meanX)) ** 2;
    const rSquared = varianceY > 0 ? Math.max(0, Math.min(1, 1 - residual / varianceY)) : 1;
    return { exponent, prefactor, rSquared, count };
  }

  function toCSV(simulation) {
    const { config, points } = simulation;
    const rows = ['t,rms,msd,mean_distance,theory_rms,theory_msd,dims,walkers,step_length,seed'];
    for (const point of points) {
      rows.push([point.t, point.rms, point.msd, point.meanDistance,
        config.stepLength * Math.sqrt(point.t), config.stepLength ** 2 * point.t,
        config.dims, config.walkers, config.stepLength, config.seed].join(','));
    }
    return rows.join('\r\n') + '\r\n';
  }

  return Object.freeze({ DEFAULT_CONFIG, LIMITS, validateConfig, createRng, createSimulation, fitPowerLaw, toCSV });
});
