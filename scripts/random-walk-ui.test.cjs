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
      this.clientWidth = 800;
      this.hidden = false;
      this.disabled = false;
      this.textContent = '';
      this._value = '';
    }
    get value() { return this._value; }
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
    'new-seed', 'reset-button', 'chart-tooltip'
  ];
  for (const id of fixedIds) { const node = new Node(); node.setAttribute('id', id); }
  ids.get('dimensions').value = '2';
  ids.get('walkers').value = '512';
  ids.get('steps').value = '2000';
  ids.get('seed').value = '42';
  ids.get('projection').value = 'plane';
  ids.get('time-scrubber').value = '0';
  ids.get('scaling-chart').parentElement = new Node();
  const groups = {};
  for (const [name, values] of Object.entries({ dims: [1, 2, 3, 10, 100], metric: ['rms', 'msd'], scale: ['log', 'linear'] })) {
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
  assert.equal(ui.get('projection').disabled, true);
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
  assert.deepEqual(ui.simulation.config, { dims: 100, walkers: 128, steps: 100, seed: 0, stepLength: 1 });
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
  assert.equal(ui.get('projection').disabled, true);
  ui.get('dimensions').value = '3';
  ui.get('settings-form').dispatch('submit');
  ui.finish();
  labels = descendants(ui.get('trajectory-chart')).map(node => node.textContent).join(' ');
  assert.match(labels, /x₁/);
  assert.match(labels, /x₂/);
  assert.doesNotMatch(labels, /x₃/);
  ui.get('projection').value = 'space';
  ui.get('projection').dispatch('change');
  const geometry = descendants(ui.get('trajectory-chart'));
  assert.match(geometry.map(node => node.textContent).join(' '), /x₃/);
  assert.ok(geometry.every(node => !/(?:NaN|Infinity)/.test(Object.values(node.attributes).join(' '))));
  assert.equal(geometry.filter(node => node.getAttribute('class') === 'trajectory-line').length, 8);
});

test('CSV exports active data despite pending settings and reset clears hover data', () => {
  const ui = browser();
  ui.finish();
  const original = ui.simulation;
  ui.get('dimensions').value = '10';
  ui.get('download-button').click();
  assert.equal(ui.exported, original);
  assert.deepEqual(ui.downloads, ['random-walk-2d-seed42-t2000.csv']);
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
