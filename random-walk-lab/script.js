(function () {
  'use strict';
  const Core = window.RandomWalkCore;
  const $ = id => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const colors = ['#287451', '#ca8243', '#5688a0', '#9074a1', '#8a9750', '#bc6973', '#47796e', '#af9c55'];
  const number = (value, digits = 2) => Number.isFinite(value) ? value.toLocaleString('ja-JP', { maximumFractionDigits: digits }) : '—';
  let simulation;
  let running = false;
  let frame = 0;
  let metric = 'rms';
  let scale = 'log';
  let followLatest = true;
  let lastPaint = -Infinity;
  let plot = null;

  function element(tag, attrs = {}, content) {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, value));
    if (content !== undefined) node.textContent = content;
    return node;
  }
  function add(parent, tag, attrs, content) {
    const node = element(tag, attrs, content);
    parent.appendChild(node);
    return node;
  }
  function linePath(points, x, y) {
    return points.map((point, i) => `${i ? 'L' : 'M'}${x(point).toFixed(2)},${y(point).toFixed(2)}`).join(' ');
  }
  function metricName() { return metric === 'rms' ? 'RMS距離' : '平均二乗変位'; }
  function theory(t) { return metric === 'rms' ? Math.sqrt(t) : t; }
  function setPressed(selector, selected, key) {
    document.querySelectorAll(selector).forEach(button => button.setAttribute('aria-pressed', String(button.dataset[key] === String(selected))));
  }
  function configuration() {
    return Core.validateConfig({ dims: $('dimensions').valueAsNumber, walkers: Number($('walkers').value), steps: $('steps').valueAsNumber, seed: $('seed').valueAsNumber, stepLength: 1 });
  }
  function dirtySettings() {
    setPressed('[data-dims]', $('dimensions').value, 'dims');
    let dirty = true;
    try {
      const config = configuration();
      dirty = !simulation || Object.keys(config).some(key => config[key] !== simulation.config[key]);
    } catch { /* Validation is shown on execution; keep the current experiment intact. */ }
    $('settings-note').textContent = dirty ? '設定を変更しました。「この設定で実行」で反映します。' : '';
  }
  function updateProjection() {
    const dims = simulation.config.dims;
    $('projection').disabled = dims < 3;
    const planeOption = $('projection').options?.[0];
    if (planeOption) planeOption.textContent = dims === 1 ? '1D表示' : '2D投影';
    if (dims < 3) $('projection').value = 'plane';
    const space = $('projection').value === 'space' && dims >= 3;
    $('projection-note').textContent = dims === 1
      ? '1次元：横軸は時刻、縦軸は位置 x₁。最初の8粒子を表示。'
      : space
        ? `${dims}次元のうち x₁・x₂・x₃ を3D投影。距離の集計には全${dims}次元・全粒子を使用。`
        : `${dims}次元のうち x₁・x₂ の平面を表示。距離の集計には全${dims}次元・全粒子を使用。`;
  }
  function fitResult() {
    const start = $('fit-start').valueAsNumber;
    const end = $('fit-end').valueAsNumber;
    const valid = Number.isInteger(start) && Number.isInteger(end) && start >= 1 && end > start && end <= simulation.config.steps;
    $('fit-start').setAttribute('aria-invalid', String(!valid));
    $('fit-end').setAttribute('aria-invalid', String(!valid));
    if (!valid) return { fit: null, start, end, message: `範囲は 1 ≤ 開始 < 終了 ≤ ${number(simulation.config.steps, 0)} の整数にしてください。` };
    const fit = Core.fitPowerLaw(simulation.points, metric, start, end);
    return { fit, start, end, message: fit ? `${number(start, 0)}〜${number(Math.min(end, simulation.step), 0)} step / ${fit.count}点の対数を最小二乗フィット。時刻間のデータは相関しています。` : '指定範囲に正の測定点が3点以上そろうと指数を表示します。' };
  }
  function renderSummary(fitting) {
    const current = simulation.snapshot();
    $('metric-badge').textContent = metric === 'rms' ? 'RMS' : 'MSD';
    $('exponent').textContent = fitting.fit ? fitting.fit.exponent.toFixed(3) : '—';
    $('scaling-statement').textContent = fitting.fit ? `${metricName()} ∝ 時間の ${fitting.fit.exponent.toFixed(3)} 乗` : 'フィットに必要なデータを待っています';
    $('theory-expression').innerHTML = metric === 'rms' ? '0.5 <span>= 1/2</span>' : '1.0 <span>= 1</span>';
    $('theory-note').textContent = metric === 'rms' ? '次元を変えても、指数は 1/2。' : '距離を二乗すると、時間に比例。';
    $('distance-label').textContent = `計算済み時刻の${metricName()}`;
    $('distance').textContent = number(current[metric]);
    $('distance-unit').textContent = metric === 'rms' ? '歩幅' : '歩幅²';
    $('step-label').textContent = number(current.t, 0);
    $('walkers-label').textContent = number(simulation.config.walkers, 0);
    $('active-dimension').textContent = `${simulation.config.dims} DIMENSION${simulation.config.dims === 1 ? '' : 'S'}`;
    $('fit-quality').textContent = fitting.fit ? `R² = ${fitting.fit.rSquared.toFixed(4)}` : 'R² —';
    $('fit-note').textContent = fitting.message;
    $('chart-subtitle').textContent = scale === 'log' ? '両対数グラフでは、直線の傾きが指数 α になります。' : '線形グラフで広がり方を観察。指数のフィットは対数空間で計算します。';
    $('progress').max = simulation.config.steps;
    $('progress').value = current.t;
    $('progress-text').textContent = `${Math.round(current.t / simulation.config.steps * 100)}%`;
    $('run-status').textContent = simulation.done ? '計算完了' : running ? '計算中' : current.t === 0 ? '実行待ち' : '一時停止中';
    $('pause-button').textContent = running ? '一時停止' : '再開';
    $('pause-button').disabled = simulation.done || current.t === 0 && !running;
    $('download-button').disabled = simulation.points.length < 2;
  }
  function ticks(max, logarithmic, min = 0) {
    if (logarithmic) {
      const values = [];
      for (let exponent = Math.floor(Math.log10(min)); exponent <= Math.ceil(Math.log10(max)); exponent++) {
        const value = 10 ** exponent;
        if (value >= min && value <= max) values.push(value);
      }
      return values;
    }
    const rough = max / 4;
    const power = 10 ** Math.floor(Math.log10(rough || 1));
    const step = [1, 2, 2.5, 5, 10].map(n => n * power).find(n => n >= rough) || power * 10;
    const values = [];
    for (let value = 0; value <= max * 1.000001; value += step) values.push(value);
    return values;
  }
  function renderScaling(fitting) {
    const svg = $('scaling-chart');
    const width = Math.max(320, svg.clientWidth || 800);
    const height = width < 500 ? 270 : 330;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.replaceChildren();
    add(svg, 'title', { id: 'chart-svg-title' }, `時間と${metricName()}の${scale === 'log' ? '両対数' : '線形'}グラフ`);
    add(svg, 'desc', { id: 'chart-svg-desc' }, `緑の実測、灰色の理論、黄土色のフィット。${fitting.fit ? `実測指数${fitting.fit.exponent.toFixed(3)}、` : ''}理論指数${metric === 'rms' ? '0.5' : '1'}。`);
    const left = 56, right = width - 22, top = 29, bottom = height - 43;
    const logarithmic = scale === 'log';
    const data = simulation.points.filter(point => !logarithmic || point.t > 0 && point[metric] > 0);
    const maxT = simulation.config.steps;
    const yMax = Math.max(theory(maxT) * 1.25, ...data.map(point => point[metric] * 1.12));
    const yMin = logarithmic ? Math.min(0.8, ...data.map(point => point[metric] * 0.8)) : 0;
    const x = t => left + (logarithmic ? Math.log10(Math.max(1, t)) / Math.log10(maxT) : t / maxT) * (right - left);
    const y = value => bottom - (logarithmic ? (Math.log10(Math.max(yMin, value)) - Math.log10(yMin)) / (Math.log10(yMax) - Math.log10(yMin)) : value / yMax) * (bottom - top);
    plot = { x, y, left, right, top, bottom, width, height, data };
    const grid = add(svg, 'g', { 'aria-hidden': 'true' });
    ticks(maxT, logarithmic, 1).forEach(value => {
      const px = x(value);
      add(grid, 'line', { x1: px, x2: px, y1: top, y2: bottom, class: 'chart-grid' });
      add(grid, 'text', { x: px, y: bottom + 19, 'text-anchor': 'middle', class: 'chart-label' }, number(value, 0));
    });
    ticks(yMax, logarithmic, yMin).forEach(value => {
      const py = y(value);
      add(grid, 'line', { x1: left, x2: right, y1: py, y2: py, class: 'chart-grid' });
      add(grid, 'text', { x: left - 10, y: py + 4, 'text-anchor': 'end', class: 'chart-label' }, number(value, 2));
    });
    add(grid, 'path', { d: `M${left},${top} V${bottom} H${right}`, class: 'chart-axis', fill: 'none' });
    add(grid, 'text', { x: left, y: 14, class: 'chart-title' }, `${metricName()} (${metric === 'rms' ? '歩幅' : '歩幅²'})`);
    add(grid, 'text', { x: (left + right) / 2, y: height - 5, 'text-anchor': 'middle', class: 'chart-title' }, `時間 t (step)${logarithmic ? '・対数軸' : ''}`);
    const theoryPoints = Array.from({ length: 150 }, (_, i) => {
      const t = logarithmic ? Math.exp(Math.log(maxT) * i / 149) : maxT * i / 149;
      return { t, value: theory(t) };
    });
    add(svg, 'path', { d: linePath(theoryPoints, point => x(point.t), point => y(point.value)), class: 'theory-line' });
    if (data.length) add(svg, 'path', { d: linePath(data, point => x(point.t), point => y(point[metric])), class: 'measured-line' });
    if (fitting.fit) {
      const start = Math.max(1, fitting.start), end = Math.min(simulation.step, fitting.end);
      const fitPoints = Array.from({ length: 80 }, (_, i) => {
        const t = Math.exp(Math.log(start) + (Math.log(end) - Math.log(start)) * i / 79);
        return { t, value: fitting.fit.prefactor * t ** fitting.fit.exponent };
      });
      const defs = add(svg, 'defs');
      add(add(defs, 'clipPath', { id: 'plot-clip' }), 'rect', { x: left, y: top, width: right - left, height: bottom - top });
      add(svg, 'path', { d: linePath(fitPoints, point => x(point.t), point => y(point.value)), class: 'fit-line', 'clip-path': 'url(#plot-clip)' });
    }
    add(svg, 'circle', { id: 'hover-point', r: 4, fill: '#287451', stroke: '#fff', 'stroke-width': 2, visibility: 'hidden' });
  }
  function renderTrajectories() {
    const svg = $('trajectory-chart');
    const width = Math.max(300, svg.clientWidth || 590), height = 290;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.replaceChildren();
    const paths = simulation.trajectories;
    const latest = paths[0].length - 1;
    $('time-scrubber').max = latest;
    if (followLatest) $('time-scrubber').value = latest;
    const index = Math.min(Number($('time-scrubber').value), latest);
    const time = paths[0][index].t;
    $('scrubber-label').textContent = number(time, 0);
    $('time-scrubber').setAttribute('aria-valuetext', `${time} ステップ`);
    $('time-scrubber').disabled = latest === 0;
    $('latest-button').disabled = index === latest;
    const dims = simulation.config.dims;
    const space = dims >= 3 && $('projection').value === 'space';
    const visible = paths.map(path => path.slice(0, index + 1));
    add(svg, 'title', {}, `${dims}次元の代表8粒子、時刻${time}ステップの${space ? '3D投影' : '軌跡'}`);
    add(svg, 'desc', {}, dims === 1 ? '横軸は時間、縦軸は位置。各色は1粒子です。' : '各色は1粒子。輪郭のある点は原点、小さな色付きの点は現在地です。');
    const left = 42, right = width - 23, top = 26, bottom = height - 34;
    const project = point => space ? { u: .82 * point.x - .57 * point.y, v: -.33 * point.x - .48 * point.y + .81 * point.z } : { u: point.x, v: point.y };
    let pointX, pointY, originX, originY;
    if (dims === 1) {
      const extent = Math.max(4, ...paths.flatMap(path => path.map(point => Math.abs(point.x)))) * 1.12;
      pointX = point => left + point.t / simulation.config.steps * (right - left);
      pointY = point => (top + bottom) / 2 - point.x / extent * (bottom - top) / 2;
      originX = left; originY = (top + bottom) / 2;
      for (const value of ticks(simulation.config.steps, false)) {
        const px = pointX({ t: value });
        add(svg, 'line', { x1: px, x2: px, y1: top, y2: bottom, class: 'chart-grid' });
        add(svg, 'text', { x: px, y: bottom + 19, class: 'chart-label', 'text-anchor': 'middle' }, number(value, 0));
      }
      [-1, 0, 1].forEach(sign => {
        const value = Math.round(extent * .7) * sign, py = pointY({ x: value });
        add(svg, 'line', { x1: left, x2: right, y1: py, y2: py, class: 'chart-grid' });
        add(svg, 'text', { x: left - 7, y: py + 4, class: 'chart-label', 'text-anchor': 'end' }, number(value, 0));
      });
      add(svg, 'text', { x: left, y: 15, class: 'chart-title' }, '位置 x₁');
      add(svg, 'text', { x: right, y: height - 3, class: 'chart-title', 'text-anchor': 'end' }, '時間 t (step)');
    } else {
      const extent = Math.max(3, ...paths.flatMap(path => path.flatMap(point => { const p = project(point); return [Math.abs(p.u), Math.abs(p.v)]; }))) * 1.18;
      const unit = Math.min(right - left, bottom - top) / (2 * extent);
      originX = (left + right) / 2; originY = (top + bottom) / 2;
      pointX = point => originX + project(point).u * unit;
      pointY = point => originY - project(point).v * unit;
      const gridStep = Math.max(1, 10 ** Math.floor(Math.log10(extent)));
      for (let value = -Math.floor(extent / gridStep) * gridStep; value <= extent; value += gridStep) {
        const px = originX + value * unit, py = originY - value * unit;
        add(svg, 'line', { x1: px, x2: px, y1: top, y2: bottom, class: 'chart-grid' });
        add(svg, 'line', { x1: left, x2: right, y1: py, y2: py, class: 'chart-grid' });
      }
      if (!space) {
        add(svg, 'line', { x1: left, x2: right, y1: originY, y2: originY, class: 'chart-axis' });
        add(svg, 'line', { x1: originX, x2: originX, y1: top, y2: bottom, class: 'chart-axis' });
        add(svg, 'text', { x: right - 2, y: originY - 6, class: 'chart-title', 'text-anchor': 'end' }, 'x₁');
        add(svg, 'text', { x: originX + 6, y: top + 7, class: 'chart-title' }, 'x₂');
        add(svg, 'text', { x: left, y: height - 9, class: 'chart-label' }, `1目盛 = ${gridStep} 歩幅 / 縦横同一縮尺`);
      } else {
        [{ x: extent * .9, y: 0, z: 0 }, { x: 0, y: extent * .9, z: 0 }, { x: 0, y: 0, z: extent * .9 }].forEach((point, i) => {
          add(svg, 'line', { x1: originX, y1: originY, x2: pointX(point), y2: pointY(point), stroke: '#8c9e92', 'stroke-width': 1.2, 'stroke-dasharray': '3 3' });
          add(svg, 'text', { x: pointX(point) + 5, y: pointY(point) - 4, class: 'chart-title' }, ['x₁', 'x₂', 'x₃'][i]);
        });
        add(svg, 'text', { x: left, y: height - 9, class: 'chart-label' }, '最初の3軸の固定角度投影');
      }
    }
    visible.forEach((path, i) => {
      add(svg, 'path', { d: linePath(path, pointX, pointY), class: 'trajectory-line', stroke: colors[i] });
      const endpoint = path[path.length - 1];
      add(svg, 'circle', { cx: pointX(endpoint), cy: pointY(endpoint), r: 3, fill: colors[i] });
    });
    add(svg, 'circle', { cx: originX, cy: originY, r: 4, fill: '#fff', stroke: '#213b2f', 'stroke-width': 1.4 });
  }
  function render() {
    $('chart-tooltip').hidden = true;
    const fitting = fitResult();
    renderSummary(fitting);
    renderScaling(fitting);
    renderTrajectories();
  }
  function tick(now) {
    if (!running) return;
    const deadline = performance.now() + 8;
    const chunk = Math.max(1, Math.floor(18000 / simulation.config.walkers));
    const end = Math.min(simulation.config.steps, simulation.step + Math.ceil(simulation.config.steps / 120));
    do { simulation.advance(Math.min(chunk, end - simulation.step)); } while (simulation.step < end && performance.now() < deadline);
    if (simulation.done) running = false;
    if (now - lastPaint > 70 || !running) { render(); lastPaint = now; }
    if (running) frame = requestAnimationFrame(tick);
  }
  function start(autoRun = true, keepConfig = false) {
    let config;
    try { config = keepConfig && simulation ? simulation.config : configuration(); }
    catch (error) { $('settings-error').textContent = error.message; $('settings-error').hidden = false; return; }
    cancelAnimationFrame(frame);
    $('settings-error').hidden = true;
    simulation = Core.createSimulation(config);
    followLatest = true;
    $('fit-start').value = Math.max(1, Math.round(config.steps * .02));
    $('fit-end').value = config.steps;
    $('fit-start').max = config.steps;
    $('fit-end').max = config.steps;
    running = autoRun;
    lastPaint = -Infinity;
    updateProjection();
    dirtySettings();
    render();
    if (running) frame = requestAnimationFrame(tick);
  }
  $('settings-form').addEventListener('submit', event => { event.preventDefault(); start(); });
  ['dimensions', 'walkers', 'steps', 'seed'].forEach(id => $(id).addEventListener('input', dirtySettings));
  document.querySelectorAll('[data-dims]').forEach(button => button.addEventListener('click', () => {
    $('dimensions').value = button.dataset.dims;
    dirtySettings();
  }));
  $('new-seed').addEventListener('click', () => {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    $('seed').value = values[0];
    dirtySettings();
  });
  $('pause-button').addEventListener('click', () => {
    if (simulation.done) return;
    running = !running;
    if (running) frame = requestAnimationFrame(tick);
    else cancelAnimationFrame(frame);
    render();
  });
  $('reset-button').addEventListener('click', () => start(false, true));
  document.querySelectorAll('[data-metric]').forEach(button => button.addEventListener('click', () => {
    metric = button.dataset.metric;
    setPressed('[data-metric]', metric, 'metric');
    $('chart-tooltip').hidden = true;
    render();
  }));
  document.querySelectorAll('[data-scale]').forEach(button => button.addEventListener('click', () => {
    scale = button.dataset.scale;
    setPressed('[data-scale]', scale, 'scale');
    $('chart-tooltip').hidden = true;
    render();
  }));
  ['fit-start', 'fit-end'].forEach(id => $(id).addEventListener('input', render));
  $('projection').addEventListener('change', () => { updateProjection(); renderTrajectories(); });
  $('time-scrubber').addEventListener('input', () => { followLatest = false; renderTrajectories(); });
  $('latest-button').addEventListener('click', () => { followLatest = true; renderTrajectories(); });
  $('scaling-chart').addEventListener('pointermove', event => {
    if (!plot || !plot.data.length) return;
    const svg = $('scaling-chart'), matrix = svg.getScreenCTM();
    if (!matrix) return;
    const pointer = svg.createSVGPoint(); pointer.x = event.clientX; pointer.y = event.clientY;
    const local = pointer.matrixTransform(matrix.inverse());
    if (local.x < plot.left || local.x > plot.right || local.y < plot.top || local.y > plot.bottom) { $('chart-tooltip').hidden = true; $('hover-point')?.setAttribute('visibility', 'hidden'); return; }
    const nearest = plot.data.reduce((best, point) => Math.abs(plot.x(point.t) - local.x) < Math.abs(plot.x(best.t) - local.x) ? point : best);
    const marker = $('hover-point');
    marker.setAttribute('cx', plot.x(nearest.t)); marker.setAttribute('cy', plot.y(nearest[metric])); marker.setAttribute('visibility', 'visible');
    $('chart-tooltip').textContent = `t = ${number(nearest.t, 0)} step\n${metricName()} = ${number(nearest[metric], 4)}\n理論 = ${number(theory(nearest.t), 4)}`;
    $('chart-tooltip').hidden = false;
  });
  $('scaling-chart').addEventListener('pointerleave', () => { $('chart-tooltip').hidden = true; $('hover-point')?.setAttribute('visibility', 'hidden'); });
  $('download-button').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob(['\uFEFF', Core.toCSV(simulation)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `random-walk-${simulation.config.dims}d-seed${simulation.config.seed}-t${simulation.step}.csv`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  let resizeFrame = 0;
  new ResizeObserver(() => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(() => { if (simulation) render(); }); }).observe($('scaling-chart').parentElement);
  start();
})();
