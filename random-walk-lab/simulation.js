(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RandomWalkCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MODELS = Object.freeze(['lattice', 'independent', 'gaussian', 'biased', 'persistent', 'confined', 'selfAvoiding']);
  const DEFAULT_CONFIG = Object.freeze({ dims: 2, walkers: 512, steps: 2000, seed: 42, stepLength: 1, model: 'lattice', bias: 0.3, persistence: 0.85, radius: 10 });
  const LIMITS = Object.freeze({
    dims: Object.freeze({ min: 1, max: 100 }),
    walkers: Object.freeze({ min: 16, max: 4096 }),
    steps: Object.freeze({ min: 100, max: 20000 }),
    seed: Object.freeze({ min: 0, max: 4294967295 }),
    stepLength: Object.freeze({ min: 0.001, max: 1000 }),
    bias: Object.freeze({ min: 0, max: 1 }),
    persistence: Object.freeze({ min: 0, max: 1 }),
    radius: Object.freeze({ min: 1, max: 100 }),
    maxOperations: 20000000,
    selfAvoiding: Object.freeze({ maxDims: 10, maxWalkers: 512, maxSteps: 1000, maxVisits: 200000 })
  });

  function validateConfig(input = {}, checkBudget = true) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new RangeError('シミュレーション設定を指定してください。');
    }
    const config = {};
    const labels = { dims: '次元', walkers: '試行数', steps: 'ステップ数', seed: 'シード', stepLength: '歩幅の尺度', bias: 'バイアス', persistence: '持続確率', radius: '領域の半幅' };
    for (const key of Object.keys(DEFAULT_CONFIG)) {
      const value = input[key] === undefined ? DEFAULT_CONFIG[key] : input[key];
      if (key === 'model') {
        if (!MODELS.includes(value)) throw new RangeError('有効なランダムウォークのモデルを選んでください。');
        config.model = value;
        continue;
      }
      const limit = LIMITS[key];
      const integer = !['stepLength', 'bias', 'persistence'].includes(key);
      if (typeof value !== 'number' || !Number.isFinite(value) || value < limit.min || value > limit.max || (integer && !Number.isInteger(value))) {
        throw new RangeError(`${labels[key]}は ${limit.min}〜${limit.max} の${integer ? '整数' : '数値'}にしてください。`);
      }
      config[key] = value;
    }
    if (!checkBudget) return Object.freeze(config);
    if (config.walkers * config.steps > LIMITS.maxOperations) {
      throw new RangeError('試行数 × ステップ数を 20,000,000 以下にしてください。');
    }
    if (['independent', 'gaussian'].includes(config.model) && config.dims * config.walkers * config.steps > LIMITS.maxOperations) {
      throw new RangeError('このモデルでは 次元 × 試行数 × ステップ数を 20,000,000 以下にしてください。');
    }
    if (config.model === 'selfAvoiding') {
      const limits = LIMITS.selfAvoiding;
      if (config.dims > limits.maxDims || config.walkers > limits.maxWalkers || config.steps > limits.maxSteps) {
        throw new RangeError('自己回避の成長モデルは 10次元・512試行・1,000ステップ以下にしてください。');
      }
      if (config.walkers * (config.steps + 1) > limits.maxVisits) {
        throw new RangeError('自己回避の記憶量を抑えるため、試行数 × (ステップ数 + 1) を 200,000 以下にしてください。');
      }
      if (2 * config.dims * config.dims * config.walkers * config.steps > LIMITS.maxOperations) {
        throw new RangeError('自己回避の計算量を抑えるため、2 × 次元² × 試行数 × ステップ数を 20,000,000 以下にしてください。');
      }
    }
    return Object.freeze(config);
  }

  const persistentTables = new Map();
  function persistentMSD(t, p) {
    if (p === 0) return t;
    if (p === 1) return t * t;
    let table = persistentTables.get(p);
    if (!table) {
      if (persistentTables.size >= 8) persistentTables.delete(persistentTables.keys().next().value);
      table = { values: [0], correlationSum: 0 };
      persistentTables.set(p, table);
    }
    // S(n+1)-S(n) = 1 + 2 sum(k=1..n) p^k. The recurrence avoids
    // cancellation when p is very close to 1. Time is discrete; interpolate
    // between exact integer expectations only for smooth graph coordinates.
    const upper = Math.ceil(t);
    while (table.values.length <= upper) {
      table.values.push(table.values[table.values.length - 1] + 1 + 2 * table.correlationSum);
      table.correlationSum = p * (1 + table.correlationSum);
    }
    const lower = Math.floor(t);
    return table.values[lower] + (t - lower) * (table.values[upper] - table.values[lower]);
  }

  function theoreticalMSD(t, input = {}) {
    const config = validateConfig(input, false);
    if (!Number.isFinite(t) || t < 0 || t > LIMITS.steps.max) throw new RangeError('理論値の時刻は 0〜20,000 にしてください。');
    const square = config.stepLength ** 2;
    switch (config.model) {
      case 'independent': return config.dims * t * square;
      case 'biased': return ((1 - config.bias ** 2) * t + config.bias ** 2 * t * t) * square;
      case 'persistent': return persistentMSD(t, config.persistence) * square;
      case 'confined':
      case 'selfAvoiding': return null;
      default: return t * square;
    }
  }

  function modelInfo(input = {}) {
    const config = validateConfig(input, false);
    const info = {
      lattice: ['格子ウォーク', '1本の軸を等確率で選び、正負のどちらかへL進みます。', 0.5, 'MSD = L²t', '1ステップの全長はL。次元を変えてもRMSの理論指数は1/2です。'],
      independent: ['全軸独立ウォーク', '各時刻に、すべての軸を独立に±L進みます。', 0.5, 'MSD = NL²t', '1ステップの全長は√N L。RMSの係数は√N倍になり、指数は1/2です。'],
      gaussian: ['ガウス歩幅', '各軸に分散L²/Nの独立な正規乱数を加えます。', 0.5, 'MSD = L²t', '歩幅は毎回変動します。1ステップの平均二乗長をL²にそろえています。'],
      biased: ['ドリフトあり', '確率bで+x₁へ進み、残りは等確率の格子ステップを選びます。', config.bias === 0 ? 0.5 : config.bias === 1 ? 1 : null, 'MSD = L²[(1−b²)t + b²t²]', 'b=0は拡散、b=1は直進。0<b<1では拡散からドリフトへ移り、単一の指数では表せません。'],
      persistent: ['方向が持続', '最初の方向は等確率。以降は確率pで前の方向を保ち、残りは全方向から選び直します。', config.persistence === 0 ? 0.5 : config.persistence === 1 ? 1 : null, 'MSD = L²[t + 2Σ(t−k)pᵏ]', '和はk=1〜t−1。p=1は直進、p<1は長時間で拡散。整数時刻の厳密値の間は補間します。'],
      confined: ['有限領域', '各軸の±RLを越える格子ステップを拒否し、その時刻は留まります。', null, '有限領域：理論曲線なし', `R=${config.radius}。長時間のMSDはNL²R(R+1)/3へ近づきます。単一の指数は定めません。`],
      selfAvoiding: ['自己回避の成長', '未訪問の隣接点から等確率に選んで進み、行き止まりでは停止します。', null, '成長モデル：既知指数との比較なし', 'Kinetic growth walkです。平衡の自己回避歩行とは異なり、停止した試行も平均に含めます。']
    }[config.model];
    return Object.freeze({ name: info[0], description: info[1], exponentRMS: info[2], theoryLabel: info[3], theoryNote: info[4] });
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
    const { dims, walkers, steps, stepLength, model } = config;
    const random = createRng(config.seed);
    // Coordinates are in units of L, preserving legacy lattice positions and
    // seed sequences. Only Gaussian increments need floating-point positions.
    const positions = model === 'gaussian' ? new Float64Array(dims * walkers) : new Int32Array(dims * walkers);
    const radiiSquared = new Float64Array(walkers);
    const axisSquaredSums = new Float64Array(dims);
    const previousDirections = model === 'persistent' ? new Int16Array(walkers) : null;
    const visited = model === 'selfAvoiding' ? Array.from({ length: walkers }, () => new Set([Array(dims).fill(0).join(',')])) : null;
    const nextChoices = model === 'selfAvoiding' ? Array.from({ length: walkers }, () => Array.from({ length: 2 * dims }, (_, direction) => direction)) : null;
    const latestCoordinates = Array.from({ length: Math.min(8, walkers) }, () => new Float64Array(dims));
    let activeCount = walkers;
    const points = [{ t: 0, rms: 0, msd: 0, meanDistance: 0, axisMSD: Array(dims).fill(0), activeCount }];
    const trajectories = Array.from({ length: latestCoordinates.length }, () => [{ t: 0, x: 0, y: 0, z: 0, r: 0, coords: new Float64Array(dims) }]);
    const times = sampleTimes(steps);
    const trajectoryInterval = Math.max(1, Math.ceil(steps / 800));
    let step = 0;
    let nextSample = 0;
    let spareNormal = null;

    function normal() {
      if (spareNormal !== null) {
        const value = spareNormal;
        spareNormal = null;
        return value;
      }
      // Box–Muller; 1-U is in (0,1], so log(0) is impossible even for seed 0.
      const radius = Math.sqrt(-2 * Math.log(1 - random()));
      const angle = 2 * Math.PI * random();
      spareNormal = radius * Math.sin(angle);
      return radius * Math.cos(angle);
    }

    function move(walker, axis, delta) {
      const coordinate = walker * dims + axis;
      const oldPosition = positions[coordinate];
      const newPosition = oldPosition + delta;
      positions[coordinate] = newPosition;
      const change = model === 'gaussian' ? newPosition * newPosition - oldPosition * oldPosition : 2 * oldPosition * delta + delta * delta;
      radiiSquared[walker] += change;
      axisSquaredSums[axis] += change;
    }

    function latticeMove(walker, direction) {
      const axis = Math.floor(direction / 2);
      const delta = direction % 2 === 0 ? -1 : 1;
      if (model === 'confined' && Math.abs(positions[walker * dims + axis] + delta) > config.radius) return;
      move(walker, axis, delta);
    }

    function growthMove(walker) {
      const options = nextChoices[walker];
      if (!options.length) return;
      latticeMove(walker, options[Math.floor(random() * options.length)]);
      const offset = walker * dims;
      const coordinates = Array.from(positions.subarray(offset, offset + dims));
      visited[walker].add(coordinates.join(','));
      options.length = 0;
      for (let direction = 0; direction < 2 * dims; direction += 1) {
        const axis = Math.floor(direction / 2);
        const delta = direction % 2 === 0 ? -1 : 1;
        coordinates[axis] += delta;
        if (!visited[walker].has(coordinates.join(','))) options.push(direction);
        coordinates[axis] -= delta;
      }
      if (!options.length) activeCount -= 1;
    }

    function snapshot() {
      let sumSquared = 0;
      let sumDistance = 0;
      for (let walker = 0; walker < walkers; walker += 1) {
        sumSquared += Math.max(0, radiiSquared[walker]);
        sumDistance += Math.sqrt(Math.max(0, radiiSquared[walker]));
      }
      const msd = sumSquared / walkers * stepLength * stepLength;
      const axisMSD = Array.from(axisSquaredSums, value => Math.max(0, value) / walkers * stepLength * stepLength);
      return { t: step, rms: Math.sqrt(msd), msd, meanDistance: sumDistance / walkers * stepLength, axisMSD, activeCount };
    }

    function updateLatestCoordinates() {
      for (let walker = 0; walker < latestCoordinates.length; walker += 1) {
        for (let axis = 0; axis < dims; axis += 1) latestCoordinates[walker][axis] = positions[walker * dims + axis] * stepLength;
      }
    }

    function recordTrajectories() {
      for (let walker = 0; walker < trajectories.length; walker += 1) {
        const offset = walker * dims;
        const coords = Float64Array.from(positions.subarray(offset, offset + dims), value => value * stepLength);
        trajectories[walker].push({
          t: step,
          x: positions[offset] * stepLength,
          y: dims >= 2 ? positions[offset + 1] * stepLength : 0,
          z: dims >= 3 ? positions[offset + 2] * stepLength : 0,
          r: Math.sqrt(Math.max(0, radiiSquared[walker])) * stepLength,
          coords
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
          if (model === 'independent' || model === 'gaussian') {
            for (let axis = 0; axis < dims; axis += 1) {
              move(walker, axis, model === 'independent' ? (random() < 0.5 ? -1 : 1) : normal() / Math.sqrt(dims));
            }
          } else if (model === 'selfAvoiding') {
            growthMove(walker);
          } else {
            let direction;
            if (model === 'biased' && config.bias > 0 && (config.bias === 1 || random() < config.bias)) {
              direction = 1;
            } else if (model === 'persistent' && step > 0 && config.persistence > 0 && (config.persistence === 1 || random() < config.persistence)) {
              direction = previousDirections[walker];
            } else {
              direction = Math.floor(random() * (2 * dims));
            }
            if (previousDirections) previousDirections[walker] = direction;
            latticeMove(walker, direction);
          }
        }
        step += 1;
        if (step === times[nextSample]) {
          points.push(snapshot());
          nextSample += 1;
        }
        if (step % trajectoryInterval === 0 || step === steps) recordTrajectories();
      }
      updateLatestCoordinates();
      return snapshot();
    }

    return Object.freeze({
      config, points, trajectories, positions, latestCoordinates, advance, snapshot,
      get step() { return step; },
      get done() { return step === steps; },
      get activeCount() { return activeCount; }
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
    const axisColumns = Array.from({ length: config.dims }, (_, axis) => `axis_msd_${axis + 1}`);
    const rows = [['t', 'rms', 'msd', 'mean_distance', 'theory_rms', 'theory_msd', 'dims', 'walkers', 'step_length', 'seed', 'model', 'bias', 'persistence', 'radius', 'active_count', ...axisColumns].join(',')];
    for (const point of points) {
      const theory = theoreticalMSD(point.t, config);
      rows.push([point.t, point.rms, point.msd, point.meanDistance,
        theory === null ? '' : Math.sqrt(theory), theory === null ? '' : theory,
        config.dims, config.walkers, config.stepLength, config.seed,
        config.model, config.bias, config.persistence, config.radius, point.activeCount, ...point.axisMSD].join(','));
    }
    return rows.join('\r\n') + '\r\n';
  }

  return Object.freeze({ DEFAULT_CONFIG, LIMITS, MODELS, validateConfig, createRng, createSimulation, theoreticalMSD, modelInfo, fitPowerLaw, toCSV });
});
