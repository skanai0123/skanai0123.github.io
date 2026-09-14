const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../random-walk-lab/simulation.js');
const source = fs.readFileSync(path.join(__dirname, '../random-walk-lab/script.js'), 'utf8');

// Minimal DOM and controllable animation clock: exercise the actual controller
// and numerical core together, without adding browser dependencies.
function browser() {
  const ids = new Map();
  const downloads = [];
  const simulations = [];
  const callbacks = new Map();
  let frameId = 0;
  let clock = 0;
  let exported = null;
  class Node {
    constructor(tag = 'div') {
      this.tagName = tag;
      this.attributes = {};
      this.children = [];
      this.events = new Map();
      this.dataset = {};
      this.style = {};
      this.clientWidth = 800;
      this.hidden = false;
      this.disabled = false;
      this.textContent = '';
      this._value = '';
    }
    get value() { return this._value; }
    get ownerDocument() { return document; }
    set value(value) { this._value = String(value); }
    get valueAsNumber() { return this._value.trim() ? Number(this._value) : NaN; }
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name === 'id') ids.set(String(value), this);
    }
    getAttribute(name) { return this.attributes[name]; }
    appendChild(node) { this.children.push(node); node.parentElement = this; return node; }
    replaceChildren() {
      const removeIds = node => {
        if (node.attributes.id) ids.delete(node.attributes.id);
        node.children.forEach(removeIds);
      };
      this.children.forEach(removeIds);
      this.children = [];
    }
    remove() { this.parentElement.children = this.parentElement.children.filter(node => node !== this); }
    addEventListener(type, callback) {
      if (!this.events.has(type)) this.events.set(type, []);
      this.events.get(type).push(callback);
    }
    dispatch(type, extra = {}) {
      for (const callback of this.events.get(type) || []) callback({ preventDefault() {}, ...extra });
    }
    click() {
      if (this.disabled) return;
      if (this.tagName === 'a') downloads.push(this.download);
      this.dispatch('click');
    }
    getScreenCTM() { return { inverse() { return {}; } }; }
    createSVGPoint() { return { x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y }; } }; }
  }
  const fixedIds = [
    'dimensions', 'walkers', 'steps', 'seed', 'settings-note', 'projection', 'projection-note',
    'fit-start', 'fit-end', 'metric-badge', 'exponent', 'scaling-statement', 'theory-expression',
    'theory-note', 'distance-label', 'distance', 'distance-unit', 'step-label', 'walkers-label',
    'active-dimension', 'fit-quality', 'fit-note', 'chart-subtitle', 'progress', 'progress-text',
    'run-status', 'pause-button', 'download-button', 'scaling-chart', 'trajectory-chart',
    'time-scrubber', 'scrubber-label', 'latest-button', 'settings-error', 'settings-form',
    'new-seed', 'reset-button', 'chart-tooltip', 'model', 'bias', 'bias-field', 'persistence', 'persistence-field', 'radius', 'radius-field', 'model-description',
    'yaw', 'pitch', 'tour-toggle', 'view-controls', 'view-note', 'dimension-summary', 'pin-result', 'clear-comparisons', 'comparison-list'
  ];
  for (const id of fixedIds) { const node = new Node(); node.setAttribute('id', id); }
  ids.get('dimensions').value = '2';
  ids.get('walkers').value = '512';
  ids.get('steps').value = '2000';
  ids.get('seed').value = '42';
  ids.get('model').value = 'lattice';
  ids.get('bias').value = '.3';
  ids.get('persistence').value = '.85';
  ids.get('radius').value = '10';
  ids.get('yaw').value = '35';
  ids.get('pitch').value = '25';
  ids.get('projection').value = 'plane';
  ids.get('time-scrubber').value = '0';
  ids.get('scaling-chart').parentElement = new Node();
  const groups = {};
  for (const [name, values] of Object.entries({ dims: [1, 2, 3, 10, 100], metric: ['rms', 'msd'], scale: ['log', 'linear'], preset: ['normal', 'diffusion', 'drift', 'persistence', 'confined', 'selfAvoiding'] })) {
    groups[`[data-${name}]`] = values.map(value => { const node = new Node('button'); node.dataset[name] = String(value); return node; });
  }
  const document = {
    body: new Node('body'), getElementById: id => ids.get(id) || null,
    querySelectorAll: selector => groups[selector] || [],
    createElementNS: (namespace, tag) => new Node(tag), createElement: tag => new Node(tag)
  };
  const api = {
    ...core,
    createSimulation(config) { const simulation = core.createSimulation(config); simulations.push(simulation); return simulation; },
    toCSV(simulation) { exported = simulation; return core.toCSV(simulation); }
  };
  const context = vm.createContext({
    document, window: { RandomWalkCore: api, crypto: { getRandomValues(array) { array[0] = 123; return array; } } },
    performance: { now() { clock += 9; return clock; } },
    requestAnimationFrame(callback) { const id = ++frameId; callbacks.set(id, callback); return id; },
    cancelAnimationFrame(id) { callbacks.delete(id); },
    ResizeObserver: class { observe() {} },
    Blob, URL: { createObjectURL() { return 'blob:test'; }, revokeObjectURL() {} }, setTimeout(callback) { callback(); }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../random-walk-lab/visualization.js'), 'utf8'), context, { filename: 'random-walk-lab/visualization.js' });
  context.window.RandomWalkView = context.RandomWalkView;
  vm.runInContext(source, context, { filename: 'random-walk-lab/script.js' });
  const result = {
    get: id => ids.get(id),
    get simulation() { return simulations.at(-1); },
    get exported() { return exported; },
    get queuedFrames() { return callbacks.size; },
    downloads,
    button(name, value) { return groups[`[data-${name}]`].find(node => node.dataset[name] === String(value)); },
    frames(count = 1) {
      for (let i = 0; i < count && callbacks.size; i += 1) {
        const [id, callback] = callbacks.entries().next().value;
        callbacks.delete(id);
        clock += 100;
        callback(clock);
      }
    },
    finish() {
      let limit = 10000;
      while (callbacks.size && limit-- > 0) this.frames();
      assert.ok(limit > 0, 'animation must eventually finish');
    }
  };
  return result;
}

function descendants(node) { return node.children.flatMap(child => [child, ...descendants(child)]); }

test('initial run finishes and metric switching doubles the fitted exponent', () => {
  const ui = browser();
  assert.equal(ui.get('run-status').textContent, '計算中');
  assert.equal(ui.get('projection').disabled, false);
  ui.finish();
  assert.equal(ui.simulation.step, 2000);
  assert.equal(ui.get('run-status').textContent, '計算完了');
  assert.equal(ui.get('pause-button').disabled, true);
  assert.equal(ui.get('progress-text').textContent, '100%');
  const rmsExponent = Number(ui.get('exponent').textContent);
  assert.ok(rmsExponent > 0.45 && rmsExponent < 0.55);
  ui.button('metric', 'msd').click();
  assert.ok(Math.abs(Number(ui.get('exponent').textContent) - 2 * rmsExponent) <= 0.002);
  assert.equal(ui.get('distance-unit').textContent, '歩幅²');
  ui.button('scale', 'linear').click();
  assert.match(ui.get('chart-subtitle').textContent, /線形/);
  assert.ok(descendants(ui.get('scaling-chart')).every(node => !/(?:NaN|Infinity)/.test(Object.values(node.attributes).join(' '))));
});

test('invalid settings preserve the current run; valid submit applies all parameters', () => {
  const ui = browser();
  ui.frames(2);
  const original = ui.simulation;
  ui.get('dimensions').value = '101';
  ui.get('settings-form').dispatch('submit');
  assert.equal(ui.simulation, original);
  assert.equal(ui.get('settings-error').hidden, false);
  const before = original.step;
  ui.frames();
  assert.ok(original.step > before);
  ui.get('dimensions').value = '100';
  ui.get('walkers').value = '128';
  ui.get('steps').value = '100';
  ui.get('seed').value = '0';
  ui.get('settings-form').dispatch('submit');
  assert.notEqual(ui.simulation, original);
  assert.deepEqual(ui.simulation.config, core.validateConfig({ dims: 100, walkers: 128, steps: 100, seed: 0, stepLength: 1 }));
  assert.equal(ui.get('settings-error').hidden, true);
  assert.equal(ui.get('active-dimension').textContent, '100 DIMENSIONS');
  assert.equal(ui.get('projection').disabled, false);
  ui.finish();
  assert.equal(ui.simulation.step, 100);
});

test('pause/resume is deterministic and reset keeps the active configuration', () => {
  const ui = browser();
  ui.frames(4);
  const original = ui.simulation;
  const pausedStep = original.step;
  ui.get('pause-button').click();
  assert.equal(ui.get('run-status').textContent, '一時停止中');
  assert.equal(ui.queuedFrames, 0);
  ui.frames(4);
  assert.equal(original.step, pausedStep);
  ui.get('pause-button').click();
  ui.finish();
  const direct = core.createSimulation(original.config);
  direct.advance(direct.config.steps);
  assert.deepEqual(original.points, direct.points);
  ui.get('dimensions').value = '10';
  ui.get('dimensions').dispatch('input');
  ui.get('reset-button').click();
  assert.equal(ui.simulation.config.dims, 2);
  assert.equal(ui.simulation.step, 0);
  assert.equal(ui.get('dimensions').value, '10');
  assert.match(ui.get('settings-note').textContent, /設定を変更/);
  assert.equal(ui.get('run-status').textContent, '実行待ち');
  assert.equal(ui.queuedFrames, 0);
});

test('a run paused before its first step and a reset run can both resume', () => {
  const ui = browser();
  const original = ui.simulation;
  assert.equal(original.step, 0);
  ui.get('pause-button').click();
  assert.equal(ui.queuedFrames, 0);
  assert.equal(ui.get('pause-button').disabled, false);
  assert.equal(ui.get('pause-button').textContent, '再開');
  ui.get('pause-button').click();
  ui.frames();
  assert.equal(ui.simulation, original);
  assert.ok(original.step > 0);
  ui.get('dimensions').value = '101';
  ui.get('dimensions').dispatch('input');
  ui.get('reset-button').click();
  const reset = ui.simulation;
  assert.notEqual(reset, original);
  assert.equal(reset.step, 0);
  assert.equal(reset.config.dims, 2);
  assert.equal(ui.get('pause-button').disabled, false);
  ui.get('pause-button').click();
  ui.frames();
  assert.equal(ui.simulation, reset);
  assert.ok(reset.step > 0);
  assert.equal(ui.get('dimensions').value, '101');
});

test('fit bounds reject invalid intervals and withhold exponent for too few points', () => {
  const ui = browser();
  ui.finish();
  ui.get('fit-start').value = '2001';
  ui.get('fit-start').dispatch('input');
  assert.equal(ui.get('fit-start').getAttribute('aria-invalid'), 'true');
  assert.equal(ui.get('exponent').textContent, '—');
  ui.get('fit-start').value = '1';
  ui.get('fit-end').value = '2';
  ui.get('fit-end').dispatch('input');
  assert.equal(ui.get('fit-start').getAttribute('aria-invalid'), 'false');
  assert.equal(ui.get('exponent').textContent, '—');
  assert.match(ui.get('fit-note').textContent, /3点以上/);
  ui.get('fit-end').value = '2000';
  ui.get('fit-end').dispatch('input');
  assert.ok(Number.isFinite(Number(ui.get('exponent').textContent)));
  assert.match(ui.get('fit-note').textContent, /1〜2,000 step/);
});

test('scrubbing holds the selected trajectory time while calculation continues', () => {
  const ui = browser();
  ui.frames(6);
  ui.get('time-scrubber').value = '2';
  ui.get('time-scrubber').dispatch('input');
  const heldTime = ui.get('scrubber-label').textContent;
  const previousStep = ui.simulation.step;
  ui.frames(6);
  assert.ok(ui.simulation.step > previousStep);
  assert.equal(ui.get('scrubber-label').textContent, heldTime);
  assert.equal(ui.get('latest-button').disabled, false);
  ui.get('latest-button').click();
  assert.equal(Number(ui.get('scrubber-label').textContent.replaceAll(',', '')), ui.simulation.trajectories[0].at(-1).t);
  assert.equal(ui.get('latest-button').disabled, true);
});

test('1D, plane and 3D projection produce finite geometry and matching axis labels', () => {
  const ui = browser();
  ui.get('dimensions').value = '1';
  ui.get('steps').value = '100';
  ui.get('settings-form').dispatch('submit');
  ui.finish();
  let labels = descendants(ui.get('trajectory-chart')).map(node => node.textContent).join(' ');
  assert.match(labels, /位置 x₁/);
  assert.match(labels, /時間 t/);
  assert.equal(ui.get('projection').disabled, false);
  ui.get('dimensions').value = '3';
  ui.get('settings-form').dispatch('submit');
  ui.finish();
  assert.equal(ui.get('projection').value, 'space');
  ui.get('projection').value = 'plane';
  ui.get('projection').dispatch('change');
  labels = descendants(ui.get('trajectory-chart')).map(node => node.textContent).join(' ');
  assert.match(labels, /x₁/);
  assert.match(labels, /x₂/);
  assert.doesNotMatch(labels, /x₃/);
  ui.get('projection').value = 'space';
  ui.get('projection').dispatch('change');
  const geometry = descendants(ui.get('trajectory-chart'));
  assert.match(geometry.map(node => node.textContent).join(' '), /x3/);
  assert.ok(geometry.every(node => !/(?:NaN|Infinity)/.test(Object.values(node.attributes).join(' '))));
  assert.equal(geometry.filter(node => node.getAttribute('data-walker') !== undefined).length, 8);
});

test('CSV exports active data despite pending settings and reset clears hover data', () => {
  const ui = browser();
  ui.finish();
  const original = ui.simulation;
  ui.get('dimensions').value = '10';
  ui.get('download-button').click();
  assert.equal(ui.exported, original);
  assert.deepEqual(ui.downloads, ['random-walk-lattice-2d-seed42-t2000.csv']);
  ui.get('scaling-chart').dispatch('pointermove', { clientX: 250, clientY: 100 });
  assert.equal(ui.get('chart-tooltip').hidden, false);
  assert.equal(ui.get('hover-point').getAttribute('visibility'), 'visible');
  ui.get('scaling-chart').dispatch('pointermove', { clientX: 1, clientY: 1 });
  assert.equal(ui.get('chart-tooltip').hidden, true);
  assert.equal(ui.get('hover-point').getAttribute('visibility'), 'hidden');
  ui.get('scaling-chart').dispatch('pointermove', { clientX: 250, clientY: 100 });
  ui.get('reset-button').click();
  assert.equal(ui.get('chart-tooltip').hidden, true);
});

test('model controls and all six runnable examples apply safe settings without replacing invalid runs', () => {
  const ui = browser();
  for (const [preset, model] of [['normal', 'lattice'], ['diffusion', 'independent'], ['drift', 'biased'], ['persistence', 'persistent'], ['confined', 'confined'], ['selfAvoiding', 'selfAvoiding']]) {
    ui.button('preset', preset).click();
    assert.equal(ui.simulation.config.model, model);
    assert.equal(ui.get('settings-error').hidden, true);
    assert.equal(ui.get('bias-field').hidden, model !== 'biased');
    assert.equal(ui.get('persistence-field').hidden, model !== 'persistent');
    assert.equal(ui.get('radius-field').hidden, model !== 'confined');
    ui.frames(1);
  }
  const old = ui.simulation;
  ui.get('dimensions').value = '100';
  ui.get('settings-form').dispatch('submit');
  assert.equal(ui.simulation, old);
  assert.equal(ui.get('settings-error').hidden, false);
});

test('theory and CSV follow the active model across Gaussian, ballistic and confined experiments', () => {
  const ui = browser();
  ui.get('dimensions').value = '2'; ui.get('walkers').value = '128'; ui.get('steps').value = '100';
  for (const model of ['gaussian', 'independent', 'biased', 'persistent', 'confined']) {
    ui.get('model').value = model; ui.get('model').dispatch('change');
    ui.get('bias').value = '1'; ui.get('persistence').value = '1'; ui.get('radius').value = '2';
    ui.get('settings-form').dispatch('submit'); ui.finish();
    assert.equal(ui.simulation.config.model, model);
    assert.ok(Number.isFinite(Number(ui.get('exponent').textContent)));
    if (model === 'biased' || model === 'persistent') {
      assert.equal(ui.get('theory-expression').textContent, '1.0');
      assert.equal(ui.get('distance').textContent, '100');
    } else if (model === 'confined') {
      assert.equal(ui.get('theory-expression').textContent, '飽和');
      assert.ok(Number(ui.get('distance').textContent) <= Math.sqrt(8));
      assert.equal(descendants(ui.get('scaling-chart')).filter(node => node.getAttribute('class') === 'theory-line').length, 0);
    } else assert.equal(ui.get('theory-expression').textContent, '0.5');
    ui.get('download-button').click();
    assert.equal(ui.exported.config.model, model);
    assert.match(ui.downloads.at(-1), new RegExp(`random-walk-${model}-2d`));
  }
});

test('comparison curves survive reruns, use their saved fit ranges, support both metrics and enforce a four-result limit', () => {
  const ui = browser();
  ui.get('steps').value = '100'; ui.get('walkers').value = '128';
  for (const dims of [1, 2, 3, 4]) {
    ui.get('dimensions').value = dims; ui.get('settings-form').dispatch('submit'); ui.finish();
    ui.get('pin-result').click();
  }
  assert.equal(ui.get('comparison-list').children.length, 4);
  assert.equal(ui.get('pin-result').disabled, true);
  assert.equal(descendants(ui.get('scaling-chart')).filter(node => node.getAttribute('data-comparison') !== undefined).length, 4);
  const before = ui.get('comparison-list').children[0].children[0].textContent;
  ui.button('metric', 'msd').click();
  const after = ui.get('comparison-list').children[0].children[0].textContent;
  const alpha = label => Number(label.match(/α ([\d.]+)/)[1]);
  assert.ok(Math.abs(alpha(after) - 2 * alpha(before)) < .003);
  ui.get('comparison-list').children[0].children[1].click();
  assert.equal(ui.get('comparison-list').children.length, 3);
  ui.get('fit-start').value = '-100'; ui.get('fit-start').dispatch('input');
  assert.equal(ui.get('pin-result').disabled, true);
  ui.get('pin-result').click(); assert.equal(ui.get('comparison-list').children.length, 3);
  ui.get('clear-comparisons').click(); assert.equal(ui.get('comparison-list').children.length, 0);
});

test('comparison labels retain active model parameters, trial counts and saved fit windows', () => {
  const ui = browser();
  ui.get('steps').value = '100';
  ui.get('walkers').value = '128';
  const experiments = [
    { model: 'biased', parameter: 'bias', value: 0.2, start: 10, end: 70, label: 'b=0.2' },
    { model: 'biased', parameter: 'bias', value: 0.7, start: 20, end: 80, label: 'b=0.7' },
    { model: 'persistent', parameter: 'persistence', value: 0.95, start: 3, end: 100, label: 'p=0.95' },
    { model: 'confined', parameter: 'radius', value: 2, start: 5, end: 90, label: 'R=2' }
  ];
  for (const experiment of experiments) {
    ui.get('model').value = experiment.model;
    ui.get(experiment.parameter).value = experiment.value;
    ui.get('settings-form').dispatch('submit');
    ui.finish();
    ui.get('fit-start').value = experiment.start;
    ui.get('fit-end').value = experiment.end;
    ui.get('fit-end').dispatch('input');
    ui.get('pin-result').click();
  }
  // Changing current settings and metric must not rewrite saved conditions.
  ui.get('radius').value = '99';
  ui.get('fit-start').value = '1';
  ui.get('fit-end').value = '100';
  ui.button('metric', 'msd').click();
  const rows = ui.get('comparison-list').children;
  assert.equal(rows.length, experiments.length);
  experiments.forEach((experiment, index) => {
    const label = rows[index].children[0].textContent;
    assert.ok(label.includes(`(${experiment.label})`));
    assert.ok(label.includes('128試行'));
    assert.ok(label.includes(`フィット ${experiment.start}〜${experiment.end}歩`));
    assert.ok(rows[index].children[1].getAttribute('aria-label').includes(experiment.label));
  });
});

test('high-dimensional modes and rotation inspect all coordinates without changing the completed experiment', () => {
  const ui = browser();
  ui.get('dimensions').value = '10'; ui.get('steps').value = '100'; ui.get('walkers').value = '128';
  ui.get('settings-form').dispatch('submit'); ui.finish();
  assert.equal(ui.get('projection').value, 'tour');
  assert.equal(ui.get('trajectory-chart').getAttribute('data-dimensions'), '10');
  const points = JSON.stringify(ui.simulation.points);
  ui.get('tour-toggle').click(); ui.frames(3);
  assert.equal(ui.get('tour-toggle').getAttribute('aria-pressed'), 'true');
  assert.equal(JSON.stringify(ui.simulation.points), points);
  ui.get('projection').value = 'parallel'; ui.get('projection').dispatch('change');
  assert.equal(ui.get('tour-toggle').getAttribute('aria-pressed'), 'false');
  assert.equal(ui.queuedFrames, 0);
  assert.equal(descendants(ui.get('trajectory-chart')).filter(node => node.getAttribute('data-walker') !== undefined).length, 8);
  ui.get('projection').value = 'heatmap'; ui.get('projection').dispatch('change');
  assert.match(ui.get('projection-note').textContent, /全10座標/);
  ui.get('time-scrubber').value = '0'; ui.get('time-scrubber').dispatch('input');
  assert.equal(ui.get('trajectory-chart').getAttribute('data-time'), '0');
  assert.ok(descendants(ui.get('trajectory-chart')).every(node => !/(?:NaN|Infinity)/.test(Object.values(node.attributes).join(' '))));
});
