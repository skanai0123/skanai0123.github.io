const test = require('node:test');
const assert = require('node:assert/strict');
const view = require('../random-walk-lab/visualization.js');

function close(actual, expected, epsilon = 1e-11) {
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} should be near ${expected}`);
}

test('the all-dimensional projection gives every one of 100 coordinates a distinct visible direction', () => {
  for (const dims of [1, 2, 3, 4, 5, 10, 100]) {
    const basis = view.createProjection(dims, 0.41, -0.31);
    assert.equal(basis.length, dims);
    const projectedAxes = basis.map((_, axis) => view.project(Array.from({ length: dims }, (_, i) => +(i === axis)), basis));
    assert.ok(projectedAxes.every(point => point.every(Number.isFinite) && Math.hypot(point[0], point[1]) > 1e-7));
    assert.equal(new Set(projectedAxes.map(point => point.map(value => value.toFixed(9)).join(','))).size, dims);
    if (dims >= 4) {
      const point = Array(dims).fill(0);
      point[dims - 1] = 50;
      assert.ok(Math.hypot(...view.project(point, basis)) > 0.1);
    }
  }
});

test('projection rows stay orthonormal through camera and dimensional tour rotations', () => {
  for (const dims of [3, 4, 6, 10, 100]) {
    for (const phase of [0, 0.2, 7.4, -50]) {
      const basis = view.createProjection(dims, 0.61, -1.17, phase);
      for (let row = 0; row < 3; row += 1) {
        for (let other = 0; other < 3; other += 1) {
          close(basis.reduce((sum, column) => sum + column[row] * column[other], 0), +(row === other));
        }
      }
    }
  }
});

test('camera rotation preserves projected 3D lengths while the tour reveals a different N-dimensional subspace', () => {
  const coords = [2, -3, 7, 11, -2, 1];
  const original = view.project(coords, view.createProjection(6));
  const rotated = view.project(coords, view.createProjection(6, 1.4, -0.3));
  close(Math.hypot(...original), Math.hypot(...rotated));
  const touring = view.project(coords, view.createProjection(6, 0, 0, 2.1));
  assert.ok(Math.abs(Math.hypot(...original) - Math.hypot(...touring)) > 0.05);
  assert.deepEqual(view.createProjection(6, 1, 2, 3), view.createProjection(6, 1, 2, 3));
});

test('orthogonal projection never inflates an N-dimensional distance', () => {
  for (const dims of [1, 2, 3, 4, 10, 100]) {
    const coords = Array.from({ length: dims }, (_, axis) => Math.sin(axis * 1.2 + 0.4) * 20);
    const projected = view.project(coords, view.createProjection(dims, 0.32, -0.41, 2));
    assert.ok(Math.hypot(...projected) <= Math.hypot(...coords) + 1e-10);
    if (dims <= 3) close(Math.hypot(...projected), Math.hypot(...coords));
  }
});

test('a tesseract contains 16 vertices and 32 distinct one-coordinate edges, with bounded geometry up to 6D', () => {
  for (let dims = 1; dims <= 6; dims += 1) {
    const { vertices, edges } = view.hypercube(dims);
    assert.equal(vertices.length, 2 ** dims);
    assert.equal(edges.length, dims * 2 ** (dims - 1));
    assert.equal(new Set(edges.map(edge => `${edge.from},${edge.to}`)).size, edges.length);
    for (const edge of edges) {
      const changes = vertices[edge.from].map((value, axis) => value !== vertices[edge.to][axis] ? axis : -1).filter(axis => axis >= 0);
      assert.deepEqual(changes, [edge.axis]);
    }
  }
  assert.throws(() => view.hypercube(7), RangeError);
});

test('dimension layouts contain every axis in order and bound labels without losing the last coordinate', () => {
  for (const dims of [1, 3, 4, 10, 37, 100]) {
    const layout = view.dimensionLayout(dims);
    assert.equal(layout.length, dims);
    assert.equal(layout[0].label, 'x1');
    assert.equal(layout[dims - 1].label, `x${dims}`);
    assert.ok(layout.filter(axis => axis.label).length <= 12);
    assert.ok(layout.every((axis, index) => axis.axis === index && axis.fraction >= 0 && axis.fraction <= 1));
  }
});

test('invalid dimensions, nonfinite angles and mismatched or nonfinite coordinates fail explicitly', () => {
  for (const dims of [0, 101, -1, 1.5, NaN, Infinity, '3']) assert.throws(() => view.createProjection(dims), RangeError);
  assert.throws(() => view.createProjection(3, NaN), RangeError);
  assert.throws(() => view.createProjection(3, 0, Infinity), RangeError);
  assert.throws(() => view.createProjection(3, 0, 0, NaN), RangeError);
  assert.throws(() => view.project([1, 2], view.createProjection(3)), RangeError);
  assert.throws(() => view.project([1, 2, NaN], view.createProjection(3)), RangeError);
});

function svgFixture(width) {
  const document = {
    createElementNS(namespace, tag) {
      return {
        ownerDocument: document, tag, children: [], attributes: {}, textContent: '',
        setAttribute(name, value) { this.attributes[name] = String(value); },
        appendChild(child) { this.children.push(child); },
        replaceChildren() { this.children = []; }
      };
    }
  };
  const svg = document.createElementNS('', 'svg');
  svg.clientWidth = width;
  return svg;
}

test('all views render finite geometry with a scrubbed time and an adaptive mobile canvas', () => {
  const simulation = {
    config: { dims: 100, stepLength: 1 },
    trajectories: Array.from({ length: 8 }, (_, walker) => Array.from({ length: 801 }, (_, sample) => ({
      t: sample * 25,
      coords: Array.from({ length: 100 }, (_, axis) => Math.sin((axis + walker) * 1.3 + sample * 0.04) * Math.sqrt(sample))
    })))
  };
  for (const mode of ['tour', 'space', 'parallel', 'heatmap']) {
    const svg = svgFixture(320);
    const result = view.render(svg, simulation, { mode, index: 20, yaw: 0.2, pitch: 0.3, phase: 1.5 });
    assert.equal(result.time, 500);
    assert.equal(result.dimensions, 100);
    assert.equal(svg.attributes.viewBox, '0 0 320 340');
    assert.equal(svg.attributes['data-view-mode'], mode);
    const nodes = [];
    const collect = node => { nodes.push(node); node.children.forEach(collect); };
    collect(svg);
    assert.ok(nodes.length < 350, `${mode} should not make one DOM node per coordinate sample`);
    assert.ok(nodes.every(node => Object.values(node.attributes).every(value => !/NaN|Infinity|undefined/.test(value))));
    if (mode === 'heatmap') assert.ok(nodes.filter(node => node.tag === 'path').length <= 33);
    if (mode === 'space') assert.match(result.note, /残り97軸/);
    if (mode === 'tour') assert.match(result.note, /全100座標/);
  }
});

test('the 10D independent-noise preset keeps trails large while the coordinate frame stays on canvas', () => {
  const core = require('../random-walk-lab/simulation.js');
  const simulation = core.createSimulation({ dims: 10, model: 'independent', walkers: 512, steps: 2000, seed: 42 });
  simulation.advance(2000);
  const svg = svgFixture(700);
  view.render(svg, simulation, { mode: 'tour', yaw: 35 * Math.PI / 180, pitch: 25 * Math.PI / 180 });
  const paths = svg.children.filter(node => node.attributes['data-walker'] !== undefined);
  const points = paths.flatMap(path => Array.from(path.attributes.d.matchAll(/[ML]([\d.-]+),([\d.-]+)/g), match => [Number(match[1]), Number(match[2])]));
  const ys = points.map(point => point[1]);
  const span = Math.max(...ys) - Math.min(...ys);
  assert.ok(span >= 180, `trails should fill meaningful vertical space, received ${span}px`);
  assert.ok(points.every(([x, y]) => x >= 20 && x <= 680 && y >= 45 && y <= 353));
  for (const line of svg.children.filter(node => node.tag === 'line')) {
    assert.ok(['x1', 'x2'].every(key => Number(line.attributes[key]) >= 20 && Number(line.attributes[key]) <= 680));
    assert.ok(['y1', 'y2'].every(key => Number(line.attributes[key]) >= 45 && Number(line.attributes[key]) <= 353));
  }
});
