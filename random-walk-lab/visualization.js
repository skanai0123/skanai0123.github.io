(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RandomWalkView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const PATH_COLORS = ['#b8f394', '#ffc078', '#76d5eb', '#d4a5f7', '#f4d96d', '#fd9ea9', '#88d7bb', '#b7beff'];
  const LIGHT_PATH_COLORS = ['#397944', '#b46b27', '#31859b', '#8460a8', '#99851e', '#ba596b', '#358b72', '#646da9'];
  let instance = 0;

  function dimensions(value) {
    if (!Number.isInteger(value) || value < 1 || value > 100) throw new RangeError('Dimensions must be an integer from 1 to 100.');
    return value;
  }

  function finite(value, name) {
    if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite.`);
    return value;
  }

  // Orthonormal rows make this a true orthogonal N -> 3 projection. Every
  // original axis participates; columns are its projected basis vectors.
  function createProjection(dims, yaw = 0, pitch = 0, phase = 0) {
    dimensions(dims);
    finite(yaw, 'Yaw'); finite(pitch, 'Pitch'); finite(phase, 'Phase');
    let basis;
    if (dims <= 3) {
      basis = Array.from({ length: dims }, (_, axis) => [+(axis === 0), +(axis === 1), +(axis === 2)]);
    } else {
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      const sphere = Array.from({ length: dims }, (_, axis) => {
        const z = 1 - 2 * (axis + 0.5) / dims;
        const radius = Math.sqrt(1 - z * z);
        return [radius * Math.cos(axis * goldenAngle), radius * Math.sin(axis * goldenAngle), z];
      });
      const rows = [0, 1, 2].map(component => sphere.map(vector => vector[component]));
      for (let row = 0; row < 3; row += 1) {
        for (let earlier = 0; earlier < row; earlier += 1) {
          const overlap = rows[row].reduce((sum, value, axis) => sum + value * rows[earlier][axis], 0);
          for (let axis = 0; axis < dims; axis += 1) rows[row][axis] -= overlap * rows[earlier][axis];
        }
        const norm = Math.hypot(...rows[row]);
        for (let axis = 0; axis < dims; axis += 1) rows[row][axis] /= norm;
      }
      basis = sphere.map((_, axis) => rows.map(row => row[axis]));
      // Givens rotations change which N-dimensional directions are visible,
      // not just the camera. Pair rotations preserve orthonormality.
      if (phase !== 0) {
        for (let axis = 0; axis < dims; axis += 1) {
          const next = (axis + 1) % dims;
          const angle = phase * (0.31 + (axis % 7) * 0.073);
          const cosine = Math.cos(angle), sine = Math.sin(angle);
          for (let component = 0; component < 3; component += 1) {
            const first = basis[axis][component], second = basis[next][component];
            basis[axis][component] = cosine * first + sine * second;
            basis[next][component] = -sine * first + cosine * second;
          }
        }
      }
    }
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    return basis.map(([x, y, z]) => {
      const rotatedX = cy * x + sy * z;
      const rotatedZ = -sy * x + cy * z;
      return [rotatedX, cp * y - sp * rotatedZ, sp * y + cp * rotatedZ];
    });
  }

  function project(coords, basis) {
    if (!coords || typeof coords.length !== 'number' || coords.length !== basis.length) throw new RangeError('Coordinates must match the projection dimensions.');
    const result = [0, 0, 0];
    for (let axis = 0; axis < basis.length; axis += 1) {
      const coordinate = finite(coords[axis], 'Coordinate');
      result[0] += coordinate * basis[axis][0];
      result[1] += coordinate * basis[axis][1];
      result[2] += coordinate * basis[axis][2];
    }
    return result;
  }

  function hypercube(dims) {
    dimensions(dims);
    if (dims > 6) throw new RangeError('Explicit hypercube geometry is limited to six dimensions.');
    const vertices = Array.from({ length: 2 ** dims }, (_, vertex) => Array.from({ length: dims }, (_, axis) => (vertex & (1 << axis)) ? 1 : -1));
    const edges = [];
    for (let vertex = 0; vertex < vertices.length; vertex += 1) {
      for (let axis = 0; axis < dims; axis += 1) {
        if (!(vertex & (1 << axis))) edges.push({ from: vertex, to: vertex | (1 << axis), axis });
      }
    }
    return { vertices, edges };
  }

  function dimensionLayout(dims) {
    dimensions(dims);
    const interval = Math.max(1, Math.ceil(dims / 10));
    return Array.from({ length: dims }, (_, axis) => ({
      axis,
      fraction: dims === 1 ? 0.5 : axis / (dims - 1),
      color: `hsl(${Math.round(65 + axis / Math.max(1, dims - 1) * 250)} 61% 72%)`,
      label: dims <= 12 || axis === 0 || axis === dims - 1 || (axis + 1) % interval === 0 ? `x${axis + 1}` : ''
    }));
  }

  function coordsOf(sample, dims) {
    if (sample.coords && sample.coords.length === dims) return sample.coords;
    if (dims <= 3) return [sample.x || 0, sample.y || 0, sample.z || 0].slice(0, dims);
    throw new RangeError('Full coordinate samples are required for high-dimensional visualization.');
  }

  function add(parent, name, attributes = {}, text) {
    const element = parent.ownerDocument.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
    if (text !== undefined) element.textContent = String(text);
    parent.appendChild(element);
    return element;
  }

  function label(parent, x, y, text, options = {}) {
    return add(parent, 'text', { x, y, fill: '#69816a', 'font-size': 11, 'font-family': 'inherit', ...options }, text);
  }

  function number(value) {
    if (value === 0) return '0';
    if (Math.abs(value) >= 10000 || Math.abs(value) < 0.01) return value.toExponential(1);
    return Number(value.toPrecision(3)).toString();
  }

  function dataFor(simulation, index) {
    const dims = dimensions(simulation.config.dims);
    const trajectories = simulation.trajectories.slice(0, 8);
    const length = Math.min(...trajectories.map(path => path.length));
    const selected = Math.max(0, Math.min(length - 1, Number.isFinite(index) ? Math.round(index) : length - 1));
    const time = length ? trajectories[0][selected].t : 0;
    let maximum = 0;
    for (const path of trajectories) {
      for (const sample of path) {
        for (const coordinate of coordsOf(sample, dims)) maximum = Math.max(maximum, Math.abs(coordinate));
      }
    }
    return { dims, trajectories, index: selected, time, maximum: maximum || simulation.config.stepLength || 1, length };
  }

  function renderProjection(svg, data, settings, width, height) {
    const { dims, trajectories, index, maximum, time } = data;
    const space = settings.mode === 'space';
    const visibleDims = space ? Math.min(dims, 3) : dims;
    const basis = createProjection(visibleDims, settings.yaw ?? -0.55, settings.pitch ?? 0.32, space ? 0 : settings.phase ?? 0);
    const colors = dimensionLayout(visibleDims);
    const points = trajectories.map(path => path.map(sample => project(Array.from(coordsOf(sample, dims)).slice(0, visibleDims), basis)));
    const cube = visibleDims <= 6 ? hypercube(visibleDims) : null;
    const unitVertices = cube ? cube.vertices.map(vertex => project(vertex, basis)) : [];
    const unitFrame = unitVertices.concat(basis.flatMap(axis => [axis.map(value => value * 1.3), axis.map(value => -value * 1.3)]));
    let minX = 0, maxX = 0, minY = 0, maxY = 0;
    const include = point => { minX = Math.min(minX, point[0]); maxX = Math.max(maxX, point[0]); minY = Math.min(minY, point[1]); maxY = Math.max(maxY, point[1]); };
    for (const path of points) for (const point of path) include(point);
    const traceSpan = Math.max(maxX - minX, maxY - minY) || maximum;
    const unitFrameX = Math.max(...unitFrame.map(point => Math.abs(point[0]))) || 1;
    const unitFrameY = Math.max(...unitFrame.map(point => Math.abs(point[1]))) || 1;
    // The frame is only a coordinate reference. Size it from the projected
    // trails, so unused high-dimensional directions cannot shrink the data.
    const frameSize = Math.min(Math.max(maxX - minX, traceSpan * 0.4) * 0.6 / unitFrameX, Math.max(maxY - minY, traceSpan * 0.4) * 0.6 / unitFrameY);
    const projectedVertices = unitVertices.map(vertex => vertex.map(value => value * frameSize));
    for (const point of unitFrame) include(point.map(value => value * frameSize));
    const bound = Math.max(maxX - minX, maxY - minY) || 1;
    const scale = Math.min((width - 76) / Math.max(maxX - minX, 0.001), (height - 116) / Math.max(maxY - minY, 0.001));
    const cx = width / 2 - (minX + maxX) / 2 * scale;
    const cy = height / 2 + 6 + (minY + maxY) / 2 * scale;
    const screen = point => [cx + point[0] * scale, cy - point[1] * scale];
    const id = `walk-view-${++instance}`;
    const defs = add(svg, 'defs');
    const gradient = add(defs, 'radialGradient', { id, cx: '46%', cy: '44%', r: '76%' });
    add(gradient, 'stop', { offset: '0%', 'stop-color': '#264c45' });
    add(gradient, 'stop', { offset: '100%', 'stop-color': '#102926' });
    add(svg, 'rect', { width, height, rx: 11, fill: `url(#${id})` });
    label(svg, 17, 26, space ? (dims <= 3 ? `${dims}D · 空間の軌跡` : `${dims}D → 最初の3軸`) : `${dims}D · 全座標を投影`, { fill: '#d3e6ca', 'font-size': 12, 'font-weight': 600 });
    label(svg, width - 16, 26, `t = ${time.toLocaleString()}`, { fill: '#9bb9a7', 'text-anchor': 'end' });
    const rings = add(svg, 'g', { fill: 'none', stroke: '#5b8c78', 'stroke-width': 0.6, opacity: 0.19 });
    for (const radius of [0.45, 0.75, 1]) add(rings, 'ellipse', { cx: width / 2, cy: height / 2 + 6, rx: (width - 65) / 2 * radius, ry: (height - 115) / 2 * radius });

    if (cube) {
      const face = cube.vertices.length >= 4 ? [0, 1, 3, 2].map(vertex => screen(projectedVertices[vertex])) : [];
      if (face.length) add(svg, 'polygon', { points: face.map(point => point.join(',')).join(' '), fill: '#8bdfbe', opacity: 0.045 });
      for (const edge of cube.edges.slice().sort((a, b) => (projectedVertices[a.from][2] + projectedVertices[a.to][2]) - (projectedVertices[b.from][2] + projectedVertices[b.to][2]))) {
        const start = screen(projectedVertices[edge.from]), end = screen(projectedVertices[edge.to]);
        const depth = (projectedVertices[edge.from][2] + projectedVertices[edge.to][2]) / (2 * bound);
        add(svg, 'line', { x1: start[0], y1: start[1], x2: end[0], y2: end[1], stroke: colors[edge.axis].color, 'stroke-width': depth > 0 ? 1.1 : 0.7, opacity: 0.19 + Math.max(0, depth) * 0.2 });
      }
      for (const point of projectedVertices) {
        const [x, y] = screen(point);
        add(svg, 'circle', { cx: x, cy: y, r: 1.6, fill: '#aad3b7', opacity: 0.45 });
      }
    } else {
      // A linear-size frame: every dimension contributes one signed ray.
      // A few coordinate planes reveal how independent directions overlap.
      for (let axis = 0; axis < visibleDims; axis += Math.max(1, Math.ceil(visibleDims / 9))) {
        const other = (axis + Math.floor(visibleDims / 3)) % visibleDims;
        const a = basis[axis], b = basis[other];
        const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([s, t]) => screen(a.map((value, component) => frameSize * 0.64 * (value * s + b[component] * t))));
        add(svg, 'polygon', { points: corners.map(point => point.join(',')).join(' '), fill: colors[axis].color, 'fill-opacity': 0.012, stroke: colors[axis].color, 'stroke-width': 0.6, 'stroke-opacity': 0.16 });
      }
    }

    for (let axis = 0; axis < visibleDims; axis += 1) {
      const extent = frameSize * (cube ? 1.2 : 1);
      const negative = screen(basis[axis].map(value => -value * extent));
      const positive = screen(basis[axis].map(value => value * extent));
      add(svg, 'line', { x1: negative[0], y1: negative[1], x2: positive[0], y2: positive[1], stroke: colors[axis].color, opacity: cube ? 0.33 : 0.42, 'stroke-width': cube ? 0.8 : 0.65, 'stroke-dasharray': cube ? '2 4' : 'none' });
      add(svg, 'circle', { cx: positive[0], cy: positive[1], r: visibleDims > 30 ? 1.5 : 2, fill: colors[axis].color, opacity: 0.65 });
      if (colors[axis].label) {
        const dx = positive[0] - cx, dy = positive[1] - cy;
        const length = Math.hypot(dx, dy) || 1;
        label(svg, positive[0] + dx / length * 13, positive[1] + dy / length * 13 + 3, colors[axis].label, { fill: colors[axis].color, 'font-size': 10, 'text-anchor': 'middle', opacity: 0.93 });
      }
    }
    add(svg, 'circle', { cx, cy, r: 3, fill: '#dcf0d9', opacity: 0.8 });
    points.forEach((path, walker) => {
      const active = path.slice(0, index + 1);
      const d = active.map((point, sample) => `${sample ? 'L' : 'M'}${screen(point).map(value => value.toFixed(2)).join(',')}`).join(' ');
      add(svg, 'path', { d, 'data-walker': walker, fill: 'none', stroke: PATH_COLORS[walker], 'stroke-width': walker === 0 ? 2 : 1.35, 'stroke-opacity': walker === 0 ? 0.95 : 0.63, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      const endpoint = active[active.length - 1];
      if (endpoint) {
        const [x, y] = screen(endpoint);
        add(svg, 'circle', { cx: x, cy: y, r: 5.7, fill: PATH_COLORS[walker], opacity: 0.12 });
        add(svg, 'circle', { cx: x, cy: y, r: 2.6, fill: PATH_COLORS[walker], stroke: '#142e2a', 'stroke-width': 0.8 });
      }
    });
    const frameText = cube ? (visibleDims === 4 ? '4次元の超立方体 · 16頂点 / 32辺' : `${visibleDims}次元の参照枠 · ${cube.vertices.length}頂点`) : `${visibleDims}本の座標軸 + 座標平面`;
    label(svg, 16, height - 28, frameText, { fill: '#8fae9b', 'font-size': 10 });
    label(svg, 16, height - 12, '枠は座標の目安です。粒子の移動を制限しません。', { fill: '#8fae9b', 'font-size': 10 });
    return space
      ? (dims > 3 ? `最初の3軸の空間投影です。残り${dims - 3}軸はこの表示では省略します。「全次元を3Dへ」ではすべての軸が反映されます。` : `${dims}次元の座標を回転して表示します。画面上の距離は視点で変わります。`)
      : `全${dims}座標を${dims > 3 ? '3次元へ線形投影してから' : ''}画面へ表示します。回転すると${dims > 3 ? '見える次元の組合せも' : '視点が'}変わります。投影上の距離・交差は元の空間とは一致しません。`;
  }

  function renderParallel(svg, data, width, height) {
    const { dims, trajectories, index, maximum, time } = data;
    const left = 47, right = width - 22, top = 65, bottom = height - 56;
    const layout = dimensionLayout(dims);
    const x = axis => left + layout[axis].fraction * (right - left);
    const y = coordinate => (top + bottom) / 2 - coordinate / maximum * (bottom - top) / 2;
    add(svg, 'rect', { width, height, rx: 11, fill: '#f5f8f1' });
    label(svg, 15, 26, `全${dims}座標の断面`, { fill: '#3e694c', 'font-size': 12, 'font-weight': 600 });
    label(svg, width - 15, 26, `t = ${time.toLocaleString()}`, { 'text-anchor': 'end' });
    label(svg, 15, 45, '横に並ぶ各軸が、独立した1つの次元です。', { 'font-size': 10 });
    for (const value of [-maximum, 0, maximum]) {
      add(svg, 'line', { x1: left, y1: y(value), x2: right, y2: y(value), stroke: value === 0 ? '#a7bba1' : '#dce6d5', 'stroke-width': 0.8, 'stroke-dasharray': value === 0 ? '4 3' : 'none' });
      label(svg, left - 8, y(value) + 4, number(value), { 'text-anchor': 'end', 'font-size': 10 });
    }
    for (const axis of layout) {
      add(svg, 'line', { x1: x(axis.axis), y1: top, x2: x(axis.axis), y2: bottom, stroke: '#c6d6bd', 'stroke-width': dims > 35 ? 0.5 : 1 });
      if (axis.label) label(svg, x(axis.axis), bottom + 18, axis.label, { 'text-anchor': 'middle', 'font-size': 10 });
    }
    trajectories.forEach((path, walker) => {
      const coords = coordsOf(path[index], dims);
      const d = Array.from(coords, (value, axis) => `${axis ? 'L' : 'M'}${x(axis).toFixed(2)},${y(value).toFixed(2)}`).join(' ');
      add(svg, 'path', { d, 'data-walker': walker, fill: 'none', stroke: LIGHT_PATH_COLORS[walker], 'stroke-width': walker === 0 ? 1.9 : 1.1, opacity: walker === 0 ? 0.95 : 0.6, 'stroke-linejoin': 'round' });
      if (dims <= 12) Array.from(coords).forEach((value, axis) => add(svg, 'circle', { cx: x(axis), cy: y(value), r: 2.2, fill: LIGHT_PATH_COLORS[walker], opacity: 0.85 }));
    });
    label(svg, 16, height - 14, `色 = 代表${trajectories.length}粒子　 /　 縦軸 = 各座標の位置`, { 'font-size': 10 });
    return `全${dims}次元を同じ縦スケールの平行座標で表示します。1本の色線が1粒子です。線を横につなぐ順序は次元番号で、移動経路ではありません。`;
  }

  function heatColor(value) {
    const low = [48, 111, 157], middle = [241, 244, 230], high = [183, 86, 48];
    const from = value < 0 ? low : middle, to = value < 0 ? middle : high;
    const fraction = value < 0 ? value + 1 : value;
    return `rgb(${from.map((channel, component) => Math.round(channel + (to[component] - channel) * fraction)).join(',')})`;
  }

  function renderHeatmap(svg, data, width, height) {
    const { dims, trajectories, maximum, time } = data;
    const path = trajectories[0];
    const left = 39, right = width - 16, top = 62, bottom = height - 67;
    const lastTime = path[path.length - 1].t || 1;
    const rowHeight = (bottom - top) / dims;
    const layout = dimensionLayout(dims);
    const bins = Array.from({ length: 33 }, () => []);
    const columns = Math.min(path.length, Math.max(1, Math.floor((right - left) / 2)));
    const cellWidth = (right - left) / columns;
    let sampleIndex = 0;
    for (let column = 0; column < columns; column += 1) {
      const targetTime = column / Math.max(1, columns - 1) * lastTime;
      while (sampleIndex + 1 < path.length && Math.abs(path[sampleIndex + 1].t - targetTime) <= Math.abs(path[sampleIndex].t - targetTime)) sampleIndex += 1;
      const sample = path[sampleIndex];
      const coords = coordsOf(sample, dims);
      for (let axis = 0; axis < dims; axis += 1) {
        const bin = Math.max(0, Math.min(32, Math.round((coords[axis] / maximum + 1) * 16)));
        bins[bin].push(`M${(left + column * cellWidth).toFixed(2)},${(top + axis * rowHeight).toFixed(2)}h${(cellWidth + 0.2).toFixed(2)}v${(rowHeight + 0.1).toFixed(2)}h-${(cellWidth + 0.2).toFixed(2)}z`);
      }
    }
    add(svg, 'rect', { width, height, rx: 11, fill: '#f5f8f1' });
    label(svg, 15, 26, `全${dims}座標の履歴`, { fill: '#3e694c', 'font-size': 12, 'font-weight': 600 });
    label(svg, width - 15, 26, `t = ${time.toLocaleString()}`, { 'text-anchor': 'end' });
    label(svg, 15, 45, '代表粒子1 · 各行が1次元、各列が保存時刻', { 'font-size': 10 });
    bins.forEach((commands, bin) => {
      if (commands.length) add(svg, 'path', { d: commands.join(''), fill: heatColor((bin - 16) / 16), 'shape-rendering': 'crispEdges' });
    });
    for (const axis of layout) {
      if (axis.label) label(svg, left - 6, top + (axis.axis + 0.5) * rowHeight + 3.4, axis.label, { 'text-anchor': 'end', 'font-size': 10 });
    }
    add(svg, 'rect', { x: left, y: top, width: right - left, height: bottom - top, fill: 'none', stroke: '#d2ddc9', 'stroke-width': 0.8 });
    const cursor = left + Math.min(1, time / lastTime) * (right - left);
    add(svg, 'line', { x1: cursor, y1: top - 3, x2: cursor, y2: bottom + 3, stroke: '#fff', 'stroke-width': 3, opacity: 0.9 });
    add(svg, 'line', { x1: cursor, y1: top - 3, x2: cursor, y2: bottom + 3, stroke: '#2e4e41', 'stroke-width': 1.1 });
    label(svg, left, bottom + 17, '0', { 'font-size': 10 });
    label(svg, right, bottom + 17, lastTime.toLocaleString(), { 'text-anchor': 'end', 'font-size': 10 });
    label(svg, (left + right) / 2, bottom + 17, '時間 t', { 'text-anchor': 'middle', 'font-size': 10 });
    const legendWidth = Math.min(120, width * 0.3), legendX = (width - legendWidth) / 2;
    for (let bin = 0; bin < 33; bin += 1) add(svg, 'rect', { x: legendX + legendWidth / 33 * bin, y: height - 26, width: legendWidth / 33 + 0.1, height: 7, fill: heatColor((bin - 16) / 16) });
    label(svg, legendX - 7, height - 19, `−${number(maximum)}`, { 'text-anchor': 'end', 'font-size': 10 });
    label(svg, legendX + legendWidth + 7, height - 19, `+${number(maximum)}`, { 'font-size': 10 });
    return `代表1粒子の全${dims}座標を行で表示します。青は負、白は0、橙は正の位置です。縦線が選択時刻です。横方向は保存時刻を画面幅に合わせて間引いています。`;
  }

  function render(svg, simulation, options = {}) {
    const mode = ['tour', 'space', 'parallel', 'heatmap'].includes(options.mode) ? options.mode : 'tour';
    const width = Math.max(320, Math.round(svg.clientWidth || 640));
    const height = width >= 560 ? 400 : 340;
    svg.replaceChildren();
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('data-view-mode', mode);
    const data = dataFor(simulation, options.index);
    svg.setAttribute('data-dimensions', data.dims);
    svg.setAttribute('data-time', data.time);
    add(svg, 'title', {}, `${data.dims}次元ランダムウォーク、${mode === 'parallel' ? '全座標の断面' : mode === 'heatmap' ? '全座標の履歴' : '軌跡の投影'}、時刻${data.time}`);
    if (!data.length) {
      label(svg, width / 2, height / 2, '計算すると軌跡を表示します', { 'text-anchor': 'middle' });
      return { note: '', time: 0, mode, dimensions: data.dims };
    }
    const note = mode === 'parallel' ? renderParallel(svg, data, width, height)
      : mode === 'heatmap' ? renderHeatmap(svg, data, width, height)
        : renderProjection(svg, data, { ...options, mode }, width, height);
    return { note, time: data.time, mode, dimensions: data.dims };
  }

  return Object.freeze({ createProjection, project, hypercube, dimensionLayout, render });
});
