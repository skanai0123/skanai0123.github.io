const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const V = require('../optics-bench/view.js');
const D = require('../optics-bench/spatial.js');

const near = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};
const nearView = (actual, expected) => {
  for (const key of ['x', 'y', 'width', 'height']) near(actual[key], expected[key]);
};
const relativePoint = (view, point) => ({
  x: (point.x - view.x) / view.width,
  y: (point.y - view.y) / view.height
});

test('angle snapping selects the nearest 22.5 degree stop and wraps through zero', () => {
  for (let stop = 0; stop < 360; stop += 22.5) {
    near(V.snapAngle(stop), stop);
    near(V.snapAngle(stop + 360), stop);
    near(V.snapAngle(stop - 360), stop);
  }
  for (const [input, expected] of [
    [11.249999, 0], [11.25, 22.5], [11.250001, 22.5],
    [33.749999, 22.5], [33.75, 45],
    [348.749999, 337.5], [348.75, 0],
    [-11.25, 0], [-11.250001, 337.5]
  ]) near(V.snapAngle(input), expected);
});

test('disabled angle snapping preserves arbitrary angles while normalizing revolutions', () => {
  for (const [input, expected] of [
    [13.123456, 13.123456], [22.500001, 22.500001],
    [-13.125, 346.875], [720.2, 0.2], [359.999999, 359.999999]
  ]) near(V.snapAngle(input, false), expected);
});

test('grid placement snaps each coordinate independently on a 10 mm grid', () => {
  assert.deepEqual(V.place(114.9, 215.1, 10), { x: 110, y: 220 });
  assert.deepEqual(V.place(115.1, 214.9, 10), { x: 120, y: 210 });
  assert.deepEqual(V.place(115, 215, 10), { x: 120, y: 220 });
});

test('inch grid placement retains decimal millimetres and does not drift across repeated moves', () => {
  assert.deepEqual(V.place(77, 254, 25.4), { x: 76.2, y: 254 });
  assert.deepEqual(V.place(432, 280, 25.4), { x: 431.8, y: 279.4 });
  assert.deepEqual(V.place(114.3, 254, 25.4), { x: 127, y: 254 });
  let point = { x: 50.8, y: 76.2 };
  for (let move = 1; move <= 30; move++) {
    point = V.place(point.x + 25.4, point.y, 25.4);
    assert.deepEqual(point, { x: (move + 2) * 254 / 10, y: 76.2 });
  }
  assert.deepEqual(point, { x: 812.8, y: 76.2 });
});

test('decimal sub-inch grid midpoints use the same tie direction as centimetre snapping', () => {
  // 64.77 / 2.54 is 25.499999999999996 in binary floating point.
  // The physical midpoint between 63.5 and 66.04 mm must not flip its tie rule.
  near(V.place(64.77 - 1e-5, 300, 2.54).x, 63.5);
  near(V.place(64.77, 300, 2.54).x, 66.04);
  near(V.place(64.77 + 1e-5, 300, 2.54).x, 66.04);
});

test('unsnapped dragging preserves fractional positions independently of the grid', () => {
  const expected = { x: 123.456789, y: 234.567891 };
  assert.deepEqual(V.place(expected.x, expected.y, 25.4, false), expected);
  assert.deepEqual(V.place(expected.x, expected.y, 10, false), expected);
});

test('placement crosses former board edges and preserves negative and distant positions', () => {
  assert.deepEqual(V.place(-10000, 10000, 10), { x: -10000, y: 10000 });
  assert.deepEqual(V.place(10000, -10000, 10, false), { x: 10000, y: -10000 });
  assert.deepEqual(V.place(49.99, 550.01, 25.4, false), { x: 49.99, y: 550.01 });
  assert.deepEqual(V.place(-114.3, 114.3, 25.4), { x: -101.6, y: 127 });
});

test('marquee geometry works in every drag direction and group movement preserves spacing', () => {
  const O=require('../optics-bench/optics.js'),elements=[{id:1,x:10,y:10},{id:2,x:20,y:30},{id:3,x:40,y:40}];
  assert.deepEqual(V.marqueeRect({x:30,y:35},{x:5,y:5}),{x:5,y:5,width:25,height:30});
  assert.deepEqual(V.marqueeIds(elements,{x:5,y:5},{x:20,y:30}),[1,2]);
  assert.deepEqual(V.marqueeIds(elements,{x:20,y:30},{x:5,y:5}),[1,2]);
  const group=[{x:10.25,y:-20.5},{x:35.75,y:44.125}];
  assert.deepEqual(V.groupDelta(group,group[0],{x:63,y:83},10,true,'x'),{x:49.75,y:0});
  assert.deepEqual(V.groupDelta(group,group[0],{x:63,y:83},10,true,'y'),{x:0,y:100.5});
  const edge=[{x:O.COORDINATE_LIMIT-10,y:1},{x:O.COORDINATE_LIMIT,y:17.25}];
  assert.deepEqual(V.groupDelta(edge,edge[0],{x:O.COORDINATE_LIMIT+100,y:1},10,false),{x:0,y:0});
  assert.deepEqual(V.pasteGroupDelta(group,[],10,true),{x:0,y:0});
  const d=V.pasteGroupDelta(group,group,10,true);assert.ok(d);assert.notDeepEqual(d,{x:0,y:0});
  near((group[1].x+d.x)-(group[0].x+d.x),25.5);near((group[1].y+d.y)-(group[0].y+d.y),64.625);
});

test('keyboard nudging changes only the requested axis of an off-grid preset component', () => {
  const confocalLaser = Object.freeze({ x: 150, y: 325 });
  assert.deepEqual(V.nudge(confocalLaser, 1, 0, 10), { x: 160, y: 325 });
  assert.deepEqual(V.nudge(confocalLaser, -1, 0, 10), { x: 140, y: 325 });
  const vertical = Object.freeze({ x: 150.123456789, y: 320 });
  assert.deepEqual(V.nudge(vertical, 0, 1, 10), { x: 150.123456789, y: 330 });
  assert.deepEqual(V.nudge(vertical, 0, -1, 10), { x: 150.123456789, y: 310 });
});

test('inch nudges snap the moving coordinate without rounding or snapping the other coordinate', () => {
  const horizontal = Object.freeze({ x: 152.4, y: 325.123456789 });
  const moved = V.nudge(horizontal, 1, 0, 25.4);
  assert.deepEqual(moved, { x: 177.8, y: 325.123456789 });
  assert.deepEqual(V.nudge(moved, -1, 0, 25.4), horizontal);
  const vertical = Object.freeze({ x: 150.123456789, y: 254 });
  assert.deepEqual(V.nudge(vertical, 0, 1, 25.4), { x: 150.123456789, y: 279.4 });
});

test('Shift nudging multiplies the grid step or the unsnapped one-millimetre step by ten', () => {
  assert.deepEqual(V.nudge({ x: 150, y: 325 }, 1, 0, 10, true, 10), { x: 250, y: 325 });
  assert.deepEqual(V.nudge({ x: 152.4, y: 325 }, 1, 0, 25.4, true, 10), { x: 406.4, y: 325 });
  const free = Object.freeze({ x: 150.125, y: 325.375 });
  assert.deepEqual(V.nudge(free, 1, 0, 25.4, false), { x: 151.125, y: 325.375 });
  assert.deepEqual(V.nudge(free, 0, -1, 25.4, false, 10), { x: 150.125, y: 315.375 });
});

test('nudging crosses former board edges without changing the other coordinate', () => {
  assert.deepEqual(V.nudge({ x: 0, y: 325.25 }, -1, 0, 25.4), { x: -25.4, y: 325.25 });
  assert.deepEqual(V.nudge({ x: 990, y: 325.25 }, 1, 0, 25.4, false), { x: 991, y: 325.25 });
  assert.deepEqual(V.nudge({ x: 150.125, y: 0 }, 0, -1, 25.4), { x: 150.125, y: -25.4 });
  assert.deepEqual(V.nudge({ x: 150.125, y: 600 }, 0, 1, 25.4, false), { x: 150.125, y: 601 });
});

test('zoom keeps an off-centre cursor at the same relative viewport position', () => {
  const view = Object.freeze({ ...V.BASE_VIEW });
  const anchor = Object.freeze({ x: 225, y: 125 });
  const before = relativePoint(view, anchor);
  const zoomed = V.zoomAt(view, 2.4, anchor);
  const after = relativePoint(zoomed, anchor);
  near(after.x, before.x);
  near(after.y, before.y);
  near(zoomed.width, view.width / 2.4);
  near(zoomed.height, view.height / 2.4);
  assert.deepEqual(view, V.BASE_VIEW);
});

test('opposite zooms recover a panned viewport and preserve its existing aspect ratio', () => {
  const view = Object.freeze({ x: 125, y: 100, width: 640, height: 410 });
  const anchor = Object.freeze({ x: 450, y: 300 });
  const zoomed = V.zoomAt(view, 1.25, anchor);
  near(zoomed.height / zoomed.width, 410 / 640);
  nearView(V.zoomAt(zoomed, 1 / 1.25, anchor), view);
});

test('zoom limits preserve the anchor and stop further changes at either scale boundary', () => {
  const view = Object.freeze({ ...V.BASE_VIEW });
  const anchor = Object.freeze({ x: 500, y: 310 });
  const before = relativePoint(view, anchor);
  const close = V.zoomAt(view, 1e8, anchor);
  const wide = V.zoomAt(view, 1e-8, anchor);
  near(close.width, V.MIN_VIEW_WIDTH);
  near(close.height / close.width, view.height / view.width);
  near(wide.width, V.MAX_VIEW_WIDTH);
  near(wide.height / wide.width, view.height / view.width);
  for (const result of [close, wide]) {
    const point = relativePoint(result, anchor);
    near(point.x, before.x);
    near(point.y, before.y);
  }
  nearView(V.zoomAt(close, 10, anchor), close);
  nearView(V.zoomAt(wide, 0.1, anchor), wide);
});

test('pan is independent of the former board and preserves finite faraway viewports', () => {
  const leftTop = Object.freeze({ x: -1e6, y: -1e6, width: 274, height: 176 });
  const rightBottom = Object.freeze({ x: 1e6, y: 1e6, width: 274, height: 176 });
  assert.deepEqual(V.clampView(leftTop), leftTop);
  assert.deepEqual(V.clampView(rightBottom), rightBottom);
  const interior = Object.freeze({ x: -100, y: -100, width: 274, height: 176 });
  assert.deepEqual(V.clampView(interior), interior);
});

test('zoom at far pan positions does not pull the view back to the former table', () => {
  nearView(V.zoomAt({ x: -508, y: -312, width: 548, height: 352 }, 2, { x: 0, y: 0 }),
    { x: -254, y: -156, width: 274, height: 176 });
  nearView(V.zoomAt({ x: 960, y: 560, width: 548, height: 352 }, 2, { x: 1000, y: 600 }),
    { x: 980, y: 580, width: 274, height: 176 });
});

test('pasting into a vacant position preserves exact millimetres independently of the grid', () => {
  const source = Object.freeze({ x: 123.456789123, y: 325.123456789 });
  for (const grid of [10, 25.4, 254]) {
    for (const snap of [true, false]) {
      assert.deepEqual(V.pastePosition(source, [{ x: 300, y: 300 }], grid, snap), source);
    }
  }
});

test('repeated pastes find distinct centres without mutating existing components', () => {
  const source = Object.freeze({ x: 950, y: 550 });
  for (const snap of [true, false]) {
    const occupied = [source];
    for (let index = 0; index < 30; index++) {
      const before = JSON.stringify(occupied);
      const point = V.pastePosition(source, occupied, 25.4, snap);
      assert.ok(point && Number.isFinite(point.x) && Number.isFinite(point.y));
      assert.ok(occupied.every(p => Math.hypot(point.x - p.x, point.y - p.y) > 1e-6));
      assert.equal(JSON.stringify(occupied), before);
      occupied.push(point);
    }
  }
});

function fullCoarseGrid() {
  return [50, 254, 508, 762, 950].flatMap(x => [50, 254, 508, 550].map(y => ({ x, y })));
}

test('a crowded coarse grid still has room beyond the former table', () => {
  const occupied = fullCoarseGrid(), before = JSON.stringify(occupied);
  const point = V.pastePosition(occupied[0], occupied, 254);
  assert.ok(point && (point.x < 50 || point.x > 950 || point.y < 50 || point.y > 550));
  assert.equal(JSON.stringify(occupied), before);
});

test('spatial projection keeps bench coordinates orthographic and clips escaping rays to its table', () => {
  const flat = D.project({ x: 100, y: 0, z: 0 }, { azimuth: 0, elevation: 30 });
  near(flat.x, 100); near(flat.y, 0); near(flat.depth, 0);
  const depth = D.project({ x: 0, y: 100, z: 0 }, { azimuth: 0, elevation: 30 });
  near(depth.x, 0); near(depth.y, 50); near(depth.depth, 100);
  const raised = D.project({ x: 0, y: 100, z: 40 }, { azimuth: 0, elevation: 30 });
  near(raised.x, 0); near(raised.y, 50 - 20 * Math.sqrt(3));
  const turned = D.project({ x: 100, y: 0, z: 0 }, { azimuth: 90, elevation: 30 });
  near(turned.x, 0); near(turned.y, 50); near(turned.depth, 100);
  assert.deepEqual(D.camera({ azimuth: -10, elevation: 99 }), { azimuth: 350, elevation: 80 });
  const bounds = { x: 0, y: 0, width: 100, height: 80 };
  assert.deepEqual(D.clipSegment({ a: { x: -50, y: 40 }, b: { x: 150, y: 40 }, sourceId: 7 }, bounds),
    { a: { x: 0, y: 40 }, b: { x: 100, y: 40 }, sourceId: 7 });
  assert.equal(D.clipSegment({ a: { x: -10, y: -20 }, b: { x: 110, y: -20 } }, bounds), null);
  assert.equal(D.niceStep(43), 50); assert.equal(D.niceStep(0.43), 0.5);
  assert.deepEqual(D.zoomArea({x:10,y:20,width:200,height:100},2),{x:60,y:45,width:100,height:50});
  assert.deepEqual(D.zoomArea({x:10,y:20,width:200,height:100},99),{x:85,y:57.5,width:50,height:25});
  assert.deepEqual(D.zoomArea({x:10,y:20,width:200,height:100},0),{x:-90,y:-30,width:400,height:200});
});

// This double supplies event bubbling, focus, selectors and pointer capture only.
// The real controller, state codec, presets and optics run in one browser-like VM;
// only SVG drawing is replaced. Native clipboard events are dispatched explicitly
// after keydown, so tests do not mistake a prevented shortcut for a successful copy.
class EditorNode {
  constructor(tagName, document) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = document;
    this.children = []; this.parentNode = null; this.listeners = new Map();
    this.attributes = new Map(); this.dataset = {}; this.style = {};
    this.id = ''; this.className = ''; this.type = tagName === 'input' ? 'text' : '';
    this.value = ''; this.checked = false; this.disabled = false; this.hidden = false;
    this._text = ''; this.captures = new Set();
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); },
      remove: (...names) => { this.className = this.className.split(/\s+/).filter(name => !names.includes(name)).join(' '); },
      toggle: (name, force) => {
        const enabled = force ?? !this.classList.contains(name);
        this.classList[enabled ? 'add' : 'remove'](name); return enabled;
      }
    };
  }
  get textContent() { return this._text + this.children.map(n => n.textContent).join(''); }
  set textContent(text) { this.replaceChildren(); this._text = String(text); }
  get isContentEditable() {
    const local = this.getAttribute('contenteditable');
    return local === null ? Boolean(this.parentNode?.isContentEditable) : local !== 'false';
  }
  append(...nodes) {
    for (let node of nodes) {
      if (typeof node === 'string') node = this.ownerDocument.createTextNode(node);
      if (node.parentNode) node.remove();
      node.parentNode = this; this.children.push(node);
    }
  }
  appendChild(node) { this.append(node); return node; }
  prepend(...nodes) { this.append(...nodes); this.children = [...nodes, ...this.children.filter(child => !nodes.includes(child))]; }
  cloneNode(deep = false) {
    const copy = new EditorNode(this.tagName, this.ownerDocument);
    for (const [key, value] of this.attributes) copy.setAttribute(key, value);
    copy.id = this.id; copy.className = this.className; copy._text = this._text;
    if (deep) copy.append(...this.children.map(child => child.cloneNode(true)));
    return copy;
  }
  replaceChildren(...nodes) { for (const child of [...this.children]) child.remove(); this._text = ''; this.append(...nodes); }
  remove() {
    if (this.contains(this.ownerDocument?.activeElement)) this.ownerDocument.activeElement = this.ownerDocument.body;
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this);
    this.parentNode = null;
  }
  contains(node) { for (; node; node = node.parentNode) if (node === this) return true; return false; }
  setAttribute(name, value) {
    value = String(value); this.attributes.set(name, value);
    if (['id', 'type', 'class', 'value', 'min', 'max', 'step'].includes(name)) this[name === 'class' ? 'className' : name] = value;
    if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
  }
  getAttribute(name) {
    if (['id', 'type', 'class', 'value', 'min', 'max', 'step'].includes(name)) return this[name === 'class' ? 'className' : name] || null;
    if (name.startsWith('data-')) return this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] ?? null;
    return this.attributes.get(name) ?? null;
  }
  hasAttribute(name) { return this.getAttribute(name) !== null; }
  removeAttribute(name) { this.attributes.delete(name); }
  matches(selector) {
    return selector.split(',').some(part => {
      let excluded = false;
      part = part.trim().replace(/:not\(([^)]+)\)/g, (_, inner) => { excluded ||= this.matches(inner); return ''; });
      if (excluded || this.tagName.startsWith('#')) return false;
      const tag = part.match(/^[\w-]+/);
      if (tag && tag[0].toUpperCase() !== this.tagName) return false;
      const id = part.match(/#([\w-]+)/);
      if (id && id[1] !== this.id) return false;
      for (const match of part.matchAll(/\.([\w-]+)/g)) if (!this.classList.contains(match[1])) return false;
      for (const match of part.matchAll(/\[([\w-]+)(?:=["']?([^\]"']*)["']?)?\]/g)) {
        const value = this.getAttribute(match[1]);
        if (value === null || match[2] !== undefined && String(value) !== match[2]) return false;
      }
      return true;
    });
  }
  closest(selector) { for (let node = this; node; node = node.parentNode) if (node.matches(selector)) return node; return null; }
  querySelectorAll(selector) {
    return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(callback);
  }
  dispatch(type, properties = {}) {
    const event = {
      type, target: this, button: 0, pointerId: 1, isPrimary: true, detail: 1,
      clientX: 0, clientY: 0, defaultPrevented: false, bubbles: true,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.stopped = true; }, ...properties
    };
    const tasks = [];
    for (let current = this; current; current = event.bubbles && !event.stopped ? current.parentNode : null) {
      event.currentTarget = current;
      for (const callback of current.listeners.get(type) || []) {
        const result = callback(event); if (result?.then) tasks.push(result);
      }
    }
    event.done = Promise.all(tasks); return event;
  }
  focus() {
    const document = this.ownerDocument, old = document.activeElement;
    if (old === this) return;
    document.activeElement = this;
    old?.dispatch('focusout', { relatedTarget: this });
    this.dispatch('focusin', { relatedTarget: old });
  }
  click() { if (!this.disabled) return this.dispatch('click'); }
  select() { this.selectionStart = 0; this.selectionEnd = this.value.length; }
  getBoundingClientRect() { return { left: 0, top: 0, right: 200, bottom: 30, width: 200, height: 30 }; }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) { this.captures.delete(id); this.dispatch('lostpointercapture', { pointerId: id }); }
}

const clone = value => JSON.parse(JSON.stringify(value));
function editorHarness(options = {}) {
  const directory = path.join(__dirname, '../optics-bench');
  const document = new EditorNode('#document'); document.ownerDocument = document;
  document.createElement = tag => new EditorNode(tag, document);
  document.createElementNS = (_, tag) => document.createElement(tag);
  document.createTextNode = text => { const node = document.createElement('#text'); node.textContent = text; return node; };
  document.getElementById = id => document.querySelector('[id="' + id + '"]');
  document.body = document.createElement('body'); document.append(document.body); document.activeElement = document.body;
  for (const match of fs.readFileSync(path.join(directory, 'index.html'), 'utf8').matchAll(/<([a-z][\w:-]*)\b([^>]*\bid="[^"]+"[^>]*)>/gi)) {
    const node = document.createElement(match[1]);
    for (const attribute of match[2].matchAll(/([\w-]+)="([^"]*)"/g)) node.setAttribute(attribute[1], attribute[2]);
    node.checked = /\bchecked\b/.test(match[2]); node.hidden = /\bhidden\b/.test(match[2]); document.body.append(node);
  }
  const get = id => document.getElementById(id);
  get('properties').append(get('parameter-fields'));
  get('bench').append(get('elements'));
  for (const id of ['probe-close', 'probe-prev', 'probe-next', 'probe-overlap']) get('ray-inspector').append(get(id));
  const frames = new Map(), windowListeners = new Map();
  const location = new URL(options.href || 'https://skanai0123.github.io/optics-bench/'), sharedCopies = [], downloads = [], shortRequests = [];
  class HarnessURL extends URL {
    static createObjectURL(blob) { downloads.push(blob); return 'blob:optics-bench-' + downloads.length; }
    static revokeObjectURL() {}
  }
  let nextFrame = 1, lastScene, lastResult, selectedId, lastSelectedIds = [], selectionText = '', lastPreview = null, lastProbe = null, lastMarquee = null;
  const context = vm.createContext({
    document, console, performance: { now: () => 100 }, location, URL: HarnessURL, Blob,
    TextEncoder, TextDecoder, ReadableStream, CompressionStream, DecompressionStream, btoa, atob,
    navigator: { clipboard: options.noClipboard ? undefined : { async writeText(text) {
      if (options.denyClipboard) throw new Error('Permission denied'); sharedCopies.push(text);
    } } },
    fetch: options.shortUrl || options.shortenerFailure ? async (url, request) => {
      shortRequests.push({ url, request });
      if (options.shortenerFailure) throw new Error('offline');
      return { ok: true, status: 201, json: async () => ({ url: options.shortUrl }) };
    } : undefined,
    requestAnimationFrame(callback) { const id = nextFrame++; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    setTimeout() { return 1; }, clearTimeout() {},
    addEventListener(type, callback) {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(callback);
    },
    getSelection: () => ({ toString: () => selectionText, removeAllRanges() { selectionText = ''; } })
  });
  context.window = context;
  for (const file of ['optics.js', 'camera.js', 'coherence.js', 'state.js', 'share.js', 'presets.js', 'view.js', 'spatial.js']) {
    vm.runInContext(fs.readFileSync(path.join(directory, file), 'utf8'), context, { filename: file });
  }
  const componentNodes = new Map(); let viewport = { ...context.OpticsView.BASE_VIEW };
  context.OpticsView = { ...context.OpticsView, create: (_, onChange = () => {}) => ({
    draw(scene, selection, result, _labels, selectionIds = [selection]) {
      lastScene = clone(scene); lastResult = clone(result); selectedId = selection; lastSelectedIds = clone(selectionIds);
      for (const [id, node] of componentNodes) if (!scene.elements.some(e => e.id === id)) { node.remove(); componentNodes.delete(id); }
      for (const element of scene.elements) if (!componentNodes.has(element.id)) {
        const node = document.createElement('g'); node.dataset.elementId = String(element.id);
        get('elements').append(node); componentNodes.set(element.id, node);
      }
    },
    title: element => element.label || context.Optics.TYPES[element.type].label + ' ' + element.id,
    focus: id => componentNodes.get(id)?.focus(),
    point: event => ({ x: event.clientX, y: event.clientY }),
    inside: event => event.clientX >= 0 && event.clientX <= 1000 && event.clientY >= 0 && event.clientY <= 600,
    preview: element => { lastPreview = element ? clone(element) : null; },
    previewGroup: elements => { lastPreview = !elements.length ? null : elements.length === 1 ? clone(elements[0]) : clone(elements); },
    marquee: rect => { lastMarquee = rect ? clone(rect) : null; },
    markProbe: value => { lastProbe = clone(value); }, worldPerPixel: () => viewport.width / V.BASE_VIEW.width,
    getView: () => ({ ...viewport }), visibleBounds: () => ({ ...viewport }), setView: value => { viewport = { ...value }; onChange(); },
    fit: (elements = lastScene?.elements || [], fiberLinks = lastScene?.fiberLinks || []) => { viewport = V.fitView(elements, { width: 1000, height: 600 }, fiberLinks); onChange(); },
    zoom: (factor, anchor) => { viewport = context.OpticsView.zoomAt(viewport, factor, anchor || { x: viewport.x + viewport.width / 2, y: viewport.y + viewport.height / 2 }); onChange(); }
  }) };
  vm.runInContext(fs.readFileSync(path.join(directory, 'script.js'), 'utf8'), context, { filename: 'script.js' });
  function flush() {
    for (let count = 0; frames.size; count++) {
      assert.ok(count < 20, 'Rendering must settle.');
      const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback());
    }
  }
  function fire(type, target = document.activeElement, properties = {}) { const event = target.dispatch(type, properties); flush(); return event; }
  return {
    document, get, fire, scene: () => clone(lastScene), result: () => clone(lastResult), selectedId: () => selectedId, selectedIds: () => clone(lastSelectedIds),
    preview: () => clone(lastPreview), marquee: () => clone(lastMarquee), viewport: () => clone(viewport), probe: () => clone(lastProbe),
    location, sharedCopies, downloads, shortRequests,
    async ready() {
      for (let i = 0; get('share-panel').getAttribute('aria-busy') === 'true' && i < 1000; i++) await new Promise(resolve => setTimeout(resolve, 1));
      assert.notEqual(get('share-panel').getAttribute('aria-busy'), 'true'); flush();
    },
    windowEvent(type, properties = {}) {
      const event = { type, target: context, ...properties };
      event.done = Promise.all((windowListeners.get(type) || []).map(callback => callback(event))).then(flush);
      flush(); return event;
    },
    selected: () => clone(lastScene.elements.find(e => e.id === selectedId) || null),
    element: (type, id, extra = {}) => ({ ...clone(context.Optics.createElement(type, id, 200, 200)), ...extra }),
    component: id => componentNodes.get(id), select: id => { componentNodes.get(id).focus(); flush(); },
    click: id => fire('click', get(id)),
    add: type => fire('click', get('palette-buttons').querySelector('[data-add="' + type + '"]')),
    key: (key, properties = {}, target = document.activeElement) => fire('keydown', target, { key, ctrlKey: true, ...properties }),
    clipboard(type, text = '', properties = {}, target = document.activeElement) {
      const data = new Map([['text/plain', text]]);
      const clipboardData = { setData: (format, value) => data.set(format, value), getData: format => data.get(format) || '' };
      return { event: fire(type, target, { clipboardData, ...properties }), data };
    },
    selection: text => { selectionText = text; }, selectionText: () => selectionText,
    async load(elements, overrides = {}) {
      const scene = { ...clone(context.OpticsState.defaultScene()), ...overrides, elements };
      const text = JSON.stringify(scene), input = get('import-file');
      input.files = [{ size: Buffer.byteLength(text), text: async () => text }];
      await fire('change', input).done; flush();
      assert.equal(lastScene.elements.length, elements.length, get('status').textContent);
      get('bench').focus();
    },
    parseComponent: text => clone(context.OpticsState.parseComponent(text))
  };
}

test('share button copies a restorable snapshot without consuming undo or redo and invalidates on edits', async () => {
  const Q=require('../optics-bench/share.js'),P=require('../optics-bench/presets.js'),h=editorHarness();
  const linked=P.create('fiber-link');await h.load(linked.elements,{title:'共有する実験',fiberLinks:linked.fiberLinks,unit:'in',gridStep:6.35,snap:false});
  h.add('mirror');h.key('z');const before=h.scene();assert.equal(h.get('redo').disabled,false);
  await h.click('share-copy').done;
  const url=h.get('share-url').value;assert.equal(h.sharedCopies.at(-1),url);assert.match(h.get('share-status').textContent,/コピーしました/);
  assert.deepEqual(h.scene(),before);assert.equal(h.get('redo').disabled,false);
  assert.deepEqual(await Q.decode(new URL(url).hash),before);
  const recipient=editorHarness({href:url});await recipient.ready();assert.deepEqual(recipient.scene(),before);
  assert.match(recipient.get('share-status').textContent,/復元しました/);recipient.key('z');assert.notDeepEqual(recipient.scene(),before);
  h.key('y');assert.equal(h.get('share-url').value,'');assert.equal(h.get('share-result').hidden,true);assert.match(h.get('share-status').textContent,/作り直し/);
  await h.click('share-copy').done;assert.notEqual(h.sharedCopies.at(-1),url);
});

test('clipboard denial or missing API leaves a selectable URL and normal text-copy behavior', async () => {
  for(const option of [{denyClipboard:true},{noClipboard:true}]) {
    const h=editorHarness(option),before=h.scene();await h.click('share-copy').done;
    assert.match(h.get('share-status').textContent,/自動コピーできません/);assert.equal(h.document.activeElement,h.get('share-url'));
    assert.equal(h.get('share-url').selectionEnd,h.get('share-url').value.length);assert.equal(h.clipboard('copy').event.defaultPrevented,false);
    h.click('share-select');assert.equal(h.get('share-url').selectionStart,0);assert.deepEqual(h.scene(),before);
  }
});

test('share button prefers a hosted short URL and falls back to a long URL when unavailable', async () => {
  const Q = require('../optics-bench/share.js');
  const short = 'https://optics-bench-links.shun-kanai-a7.workers.dev/Abcdefgh_123';
  const online = editorHarness({ shortUrl: short });
  await online.click('share-copy').done;
  assert.equal(online.get('share-url').value, short);
  assert.equal(online.sharedCopies.at(-1), short);
  assert.match(online.get('share-status').textContent, /短縮共有リンク/);
  assert.equal(online.shortRequests.length, 1);
  assert.equal(online.shortRequests[0].url, Q.SHORT_LINK_API);
  assert.match(online.shortRequests[0].request.body, /^\{"hash":"#ob1=/);

  const offline = editorHarness({ shortenerFailure: true });
  await offline.click('share-copy').done;
  assert.match(offline.get('share-url').value, /^https:\/\/skanai0123\.github\.io\/optics-bench\/#ob1=/);
  assert.match(offline.get('share-status').textContent, /長いURLに切り替え/);
});

test('local sharing produces a public URL with an explicit publication warning and blocks invalid inputs', async () => {
  const h=editorHarness({href:'http://127.0.0.1:8877/optics-bench/?temporary=1'});
  await h.click('share-copy').done;assert.match(h.sharedCopies[0],/^https:\/\/skanai0123.github.io\/optics-bench\/#ob1=/);
  assert.match(h.get('share-status').textContent,/公開サイト用/);assert.ok(!h.sharedCopies[0].includes('temporary'));
  h.get('scene-title').value='<bad>';h.fire('input',h.get('scene-title'));await h.click('share-copy').done;
  assert.equal(h.sharedCopies.length,1);assert.match(h.get('status').textContent,/入力エラー/);
});

test('invalid share hashes preserve the current design and later valid hashes remain undoable', async () => {
  const Q=require('../optics-bench/share.js'),P=require('../optics-bench/presets.js'),h=editorHarness({href:'https://example.org/optics-bench/#ob1=broken'});
  const before=h.scene();await h.ready();assert.deepEqual(h.scene(),before);assert.match(h.get('share-status').textContent,/変更していません/);
  const next=P.create('camera-imaging');h.location.hash=await Q.encode(next);await h.windowEvent('hashchange').done;
  assert.deepEqual(h.scene(),next);assert.equal(h.get('camera-panel').hidden,false);
  h.key('z');assert.deepEqual(h.scene(),before);h.key('y');assert.deepEqual(h.scene(),next);
  h.location.hash='#guide';await h.windowEvent('hashchange').done;assert.deepEqual(h.scene(),next);
});

test('async share creation or restoration cannot overwrite intervening edits or newer navigation', async () => {
  const Q=require('../optics-bench/share.js'),P=require('../optics-bench/presets.js'),h=editorHarness();
  const copying=h.click('share-copy').done;h.add('mirror');await copying;
  assert.equal(h.sharedCopies.length,0);assert.equal(h.get('share-result').hidden,true);assert.match(h.get('share-status').textContent,/作り直し/);
  const draggingCopy=h.click('share-copy').done,selected=h.selected();
  h.fire('pointerdown',h.component(selected.id),{pointerId:92,clientX:selected.x,clientY:selected.y});
  await draggingCopy;assert.equal(h.sharedCopies.length,0);assert.match(h.get('share-status').textContent,/操作が始まった/);
  h.fire('pointercancel',h.document,{pointerId:92});
  h.location.hash=await Q.encode(P.create('camera-imaging'));const loading=h.windowEvent('hashchange').done;h.add('laser');const edited=h.scene();await loading;
  assert.deepEqual(h.scene(),edited);assert.match(h.get('share-status').textContent,/操作があった/);
  h.location.hash=await Q.encode(P.create('fiber-link'));const first=h.windowEvent('hashchange').done;
  const last=P.create('polarizing-splitter');h.location.hash=await Q.encode(last);const second=h.windowEvent('hashchange').done;
  await Promise.all([first,second]);assert.deepEqual(h.scene(),last);
  h.location.hash=await Q.encode(P.create('camera-imaging'));const cancelled=h.windowEvent('hashchange').done;
  h.location.hash='#guide';await h.windowEvent('hashchange').done;await cancelled;
  assert.deepEqual(h.scene(),last);assert.notEqual(h.get('share-panel').getAttribute('aria-busy'),'true');
});

test('controller new, palette addition and selection participate in Ctrl/Meta undo and redo', () => {
  const h = editorHarness(), starter = h.scene();
  assert.ok(starter.elements.length >= 3);
  assert.equal(h.get('element-select').getAttribute('size'), '6');
  assert.equal(h.get('element-select').children.length, starter.elements.length);
  assert.equal(h.get('component-list-count').textContent, starter.elements.length + '個');
  assert.match(h.get('element-select').children[0].textContent, /· X .*\/ Y .* cm/);
  assert.equal(h.get('undo').disabled, true);
  h.click('new-scene'); assert.equal(h.scene().elements.length, 0);
  h.add('laser'); const laser = h.selected(); h.add('mirror'); const both = h.scene();
  h.select(laser.id); assert.equal(h.get('element-select').value, String(laser.id));
  assert.equal(h.key('z').defaultPrevented, true);
  assert.deepEqual(h.scene().elements, [laser]);
  h.key('y'); assert.deepEqual(h.scene(), both); assert.equal(h.selectedId(), laser.id);
  h.key('z'); h.key('Z', { shiftKey: true }); assert.deepEqual(h.scene(), both);
  h.key('z', { ctrlKey: false, metaKey: true });
  h.key('Z', { ctrlKey: false, metaKey: true, shiftKey: true });
  assert.deepEqual(h.scene(), both);
  h.key('z', { ctrlKey: false, metaKey: true }); h.key('y', { ctrlKey: false, metaKey: true });
  assert.deepEqual(h.scene(), both);
  h.key('z'); h.key('z'); assert.equal(h.scene().elements.length, 0);
  h.key('z'); assert.deepEqual(h.scene(), starter);
});

test('the visible component list selects parts and follows movement, units, addition and deletion', () => {
  const h = editorHarness(), list = h.get('element-select'), initialCount = h.scene().elements.length;
  list.value = '1'; h.fire('change', list); assert.equal(h.selectedId(), 1);
  h.fire('pointerdown', h.component(1), { pointerId: 6, clientX: 150, clientY: 400 });
  h.fire('pointermove', h.document, { pointerId: 6, clientX: 230, clientY: 460 });
  h.fire('pointerup', h.document, { pointerId: 6, clientX: 230, clientY: 460 });
  assert.match(list.children[0].textContent, /· X 23 \/ Y 46 cm/);
  h.get('unit').value = 'mm'; h.fire('change', h.get('unit'));
  assert.match(list.children[0].textContent, /· X 230 \/ Y 460 mm/);
  h.add('iris'); assert.equal(list.children.length, initialCount + 1);
  assert.equal(h.get('component-list-count').textContent, initialCount + 1 + '個');
  h.click('delete'); assert.equal(list.children.length, initialCount);
  assert.equal(h.get('component-list-count').textContent, initialCount + '個');
});

test('the component list copies a spreadsheet-safe current-unit table and saves the same snapshot as CSV', async () => {
  const h=editorHarness(),elements=[
    h.element('laser',1,{x:25.4,y:-50.8,angle:22.5,label:'=SUM(1,1)'}),
    h.element('lens',2,{x:76.2,y:50.8,angle:45,label:'Lens, "A"',focal:76.2,aperture:25.4}),
    h.element('fiber',3,{x:101.6,y:0,label:'Input fiber'}),
    h.element('fiber',4,{x:152.4,y:0,label:'Output fiber'})
  ];
  await h.load(elements,{title:'Export / test',unit:'in',fiberLinks:[{a:3,b:4}]});
  const before=h.scene(),undoDisabled=h.get('undo').disabled;
  await h.click('component-list-copy').done;
  const table=h.sharedCopies.at(-1),rows=table.trimEnd().split('\r\n').map(row=>row.split('\t'));
  assert.deepEqual(rows[0],['ID','部品名','種類','状態','X (in)','Y (in)','角度 (deg)','主要仕様','接続先']);
  assert.equal(rows[1][1],"'=SUM(1,1)");assert.equal(rows[1][5],'-2');assert.equal(rows[1][6],'22.5');
  assert.match(rows[2][7],/D 1 in; f 3 in/);assert.equal(rows[3][8],'Output fiber');assert.equal(rows[4][8],'Input fiber');
  assert.match(h.get('component-list-status').textContent,/4個.*コピー/);assert.match(h.get('status').textContent,/Google Sheets/);
  assert.deepEqual(h.scene(),before);assert.equal(h.get('undo').disabled,undoDisabled);

  h.click('component-list-save');
  assert.equal(h.downloads.length,1);assert.equal(h.downloads[0].type,'text/csv;charset=utf-8');
  const csvBytes=Buffer.from(await h.downloads[0].arrayBuffer());assert.deepEqual([...csvBytes.subarray(0,3)],[0xef,0xbb,0xbf]);
  const csv=csvBytes.toString('utf8');
  assert.match(csv,/^\ufeff"ID","部品名","種類","状態","X \(in\)"/);
  assert.match(csv,/"'=SUM\(1,1\)"/);assert.match(csv,/"Lens, ""A"""/);assert.match(csv,/"D 1 in; f 3 in"/);
  assert.equal(h.get('component-list-save').download,'Export - test-parts.csv');
  assert.match(h.get('component-list-status').textContent,/4個.*CSV/);assert.deepEqual(h.scene(),before);
});

test('component-list copy provides a selectable fallback and empty lists disable both exports', async () => {
  const h=editorHarness({denyClipboard:true}),before=h.scene();
  await h.click('component-list-copy').done;
  const fallback=h.get('component-list-copy-fallback');
  assert.equal(fallback.hidden,false);assert.match(fallback.value,/^ID\t部品名\t種類/);
  assert.equal(h.document.activeElement,fallback);assert.equal(fallback.selectionStart,0);assert.equal(fallback.selectionEnd,fallback.value.length);
  assert.match(h.get('component-list-status').textContent,/Ctrl\+C/);assert.deepEqual(h.scene(),before);
  h.click('new-scene');assert.equal(h.get('component-list-copy').disabled,true);
  assert.equal(h.get('component-list-save').getAttribute('aria-disabled'),'true');assert.equal(fallback.hidden,true);
  const save=h.click('component-list-save');assert.equal(save.defaultPrevented,true);assert.equal(h.downloads.length,0);
});

test('palette parts expose the requested defaults in centimetres', () => {
  const h=editorHarness();h.click('new-scene');
  h.add('laser');assert.equal(h.selected().beamWidth,5);assert.equal(h.get('param-beamWidth').value,'0.5');
  h.add('mirror');assert.equal(h.selected().aperture,25);assert.equal(h.get('param-aperture').value,'2.5');
  h.add('lens');assert.equal(h.selected().focal,76.2);assert.equal(h.selected().aperture,25.4);
  assert.equal(h.get('param-focal').value,'7.62');assert.equal(h.get('param-aperture').value,'2.54');
  h.add('objective');assert.equal(h.selected().aperture,10);assert.equal(h.get('param-aperture').value,'1');
  h.add('fiber');assert.equal(h.selected().aperture,10);assert.equal(h.get('param-aperture').value,'1');
  for(const type of ['filter','polarizer','waveplate','halfwave','phase']){
    h.add(type);assert.equal(h.selected().aperture,25.4,type);assert.equal(h.get('param-aperture').value,'2.54',type);
  }
  h.get('unit').value='in';h.fire('change',h.get('unit'));
  assert.equal(h.get('param-aperture').value,'1');
  h.add('objective');assert.equal(h.get('param-aperture').value,'0.39370079');
  h.add('fiber');assert.equal(h.get('param-aperture').value,'0.39370079');
  h.add('lens');assert.equal(h.get('param-focal').value,'3');assert.equal(h.get('param-aperture').value,'1');
  for(const type of ['dichroic','splitter','pbs']){
    h.add(type);assert.equal(h.selected().aperture,36,type);assert.equal(h.get('param-aperture').value,'1.41732283',type);
  }
});

test('white source is a visible palette part with editable full-band defaults and a distinct body', () => {
  const h=editorHarness(),groups=h.get('palette-buttons').children,sourceGroup=groups[0];
  assert.equal(sourceGroup.children[0].textContent,'光源');
  assert.deepEqual(sourceGroup.querySelectorAll('.part-button').map(button=>button.dataset.add),['laser','white','point','doll']);
  h.click('new-scene');h.fire('click',sourceGroup.querySelector('[data-add="white"]'));
  const source=h.selected();assert.equal(source.type,'white');
  assert.deepEqual({wavelength:source.wavelength,wavelengthWidth:source.wavelengthWidth,spectralSamples:source.spectralSamples,
    polarization:source.polarization,rayCount:source.rayCount,divergence:source.divergence},
    {wavelength:550,wavelengthWidth:300,spectralSamples:31,polarization:'unpolarized',rayCount:21,divergence:30});
  assert.match(h.get('source-spectrum-summary').textContent,/400–700 nm.*空間 21 × 波長 31 = 651 本/);
  assert.equal(h.get('param-polarization').value,'unpolarized');assert.ok(h.get('param-divergence'));
  assert.equal(h.get('param-beamWidth'),null);assert.equal(h.result().rayCount,651);
  const {document,view}=drawingHarness(),scene=require('../optics-bench/state.js').defaultScene([source]);
  view.draw(scene,source.id,require('../optics-bench/optics.js').simulate(scene.elements));
  assert.ok(document.querySelector('[data-white-source="true"]'));
  assert.match(h.get('status').textContent,/白色光源/);
});

test('a luminous doll is directly placeable, editable and distinct in 2D, 3D and the source list', () => {
  const h=editorHarness();h.click('new-scene');h.add('doll');const doll=h.selected();
  assert.deepEqual({type:doll.type,aperture:doll.aperture,screenHeight:doll.screenHeight,screenPattern:doll.screenPattern,
    power:doll.power,rayCount:doll.rayCount,divergence:doll.divergence,polarization:doll.polarization},
    {type:'doll',aperture:60,screenHeight:90,screenPattern:'doll',power:1,rayCount:9,divergence:20,polarization:'unpolarized'});
  assert.equal(h.get('param-aperture').value,'6');assert.equal(h.get('param-screenHeight').value,'9');
  assert.equal(h.get('param-wavelength'),null);assert.match(h.get('selected-output').textContent,/60画点 × 9本.*450 \/ 620 \/ 650 nm/s);
  assert.equal(h.result().rayCount,540);assert.equal(h.result().sourcePower,1);
  assert.match(h.get('source-readout').textContent,/光る人形.*450 \/ 620 \/ 650 nm.*P 1/s);
  const drawn=drawingHarness(),drawScene=require('../optics-bench/state.js').defaultScene([doll]);
  drawn.view.draw(drawScene,doll.id,require('../optics-bench/optics.js').simulate(drawScene.elements));
  assert.ok(drawn.document.querySelector('[data-luminous-doll="true"]'));
  assert.ok(h.get('spatial-view').querySelector('[data-spatial-doll="true"]'));
  const height=h.get('param-screenHeight');height.value='12';h.fire('change',height);assert.equal(h.selected().screenHeight,120);
  h.get('bench').focus();h.key('z');assert.equal(h.selected().screenHeight,90);
});

test('the bench draws recognizable vector duck and doll targets on an image screen', () => {
  const O=require('../optics-bench/optics.js'),S=require('../optics-bench/state.js'),{document,view}=drawingHarness();
  const screen={...O.createElement('screen',1,300,300),screenPattern:'duck',screenHeight:75,label:'アヒル画像'};
  const scene=S.defaultScene([screen]); view.draw(scene,1,O.simulate(scene.elements));
  const node=document.querySelector('[data-element-id="1"]');
  assert.equal(node.querySelectorAll('ellipse').length,1); assert.ok(node.querySelectorAll('circle').length>=2);
  assert.equal(node.querySelectorAll('polygon').length,1); assert.match(node.textContent,/アヒル/);
  scene.elements[0].screenPattern='doll';scene.elements[0].label='人形ターゲット';view.draw(scene,1,O.simulate(scene.elements));
  assert.ok(node.querySelector('[data-doll-target="true"]')); assert.ok(node.querySelectorAll('path').length>=2); assert.match(node.textContent,/人形/);
});

test('the source readout selects and reorders drawing layers without moving non-source slots', async () => {
  const h=editorHarness();
  const laser=(id,wavelength)=>h.element('laser',id,{x:100,y:300,beamWidth:0,rayCount:1,wavelength,label:`L${id}`});
  await h.load([laser(1,450),h.element('blocker',9,{x:400,y:600}),laser(2,532),h.element('screen',8,{x:800,y:600}),laser(3,650)]);
  const sourceOrder=()=>h.get('source-readout').querySelectorAll('[data-select]').map(button=>Number(button.dataset.select));
  const segmentOrder=()=>h.result().segments.map(segment=>segment.sourceId);
  assert.deepEqual(sourceOrder(),[1,2,3]);assert.deepEqual(segmentOrder(),[1,2,3]);
  h.fire('click',h.get('source-readout').querySelectorAll('[data-select]')[1]);
  assert.equal(h.selectedId(),2);assert.equal(h.get('source-readout').querySelectorAll('.source-row')[1].classList.contains('is-selected'),true);
  assert.equal(h.get('source-order-back').disabled,false);assert.equal(h.get('source-order-front').disabled,false);
  const before=h.scene(),power=h.result().sourcePower;h.click('source-order-front');const reordered=h.scene();
  assert.deepEqual(sourceOrder(),[1,3,2]);assert.deepEqual(reordered.elements.map(element=>element.id),[1,9,3,8,2]);
  assert.deepEqual(segmentOrder(),[1,3,2]);
  assert.equal(h.result().sourcePower,power);assert.equal(h.selectedId(),2);assert.equal(h.get('source-order-front').disabled,true);
  assert.match(h.get('status').textContent,/1段手前/);h.key('z');assert.deepEqual(h.scene(),before);assert.deepEqual(sourceOrder(),[1,2,3]);
  h.key('y');assert.deepEqual(h.scene(),reordered);assert.deepEqual(sourceOrder(),[1,3,2]);
  h.click('source-order-back');assert.deepEqual(h.scene(),before);assert.deepEqual(sourceOrder(),[1,2,3]);assert.match(h.get('status').textContent,/1段奥/);
  h.key('z');assert.deepEqual(h.scene(),reordered);h.key('y');assert.deepEqual(h.scene(),before);
  h.fire('click',h.get('source-readout').querySelectorAll('[data-select]')[0]);assert.equal(h.get('source-order-back').disabled,true);
});

test('SVG ray strokes follow source array order so later sources draw in front', () => {
  const O=require('../optics-bench/optics.js'),S=require('../optics-bench/state.js'),{document,view}=drawingHarness();
  const laser=(id,wavelength)=>({...O.createElement('laser',id,100,300),beamWidth:0,rayCount:1,wavelength});
  const scene=S.defaultScene([laser(1,450),laser(2,532),laser(3,650)]);
  const colors=()=>document.getElementById('rays').children.map(line=>line.getAttribute('stroke'));
  const draw=()=>view.draw(scene,null,O.simulate(scene.elements,{viewBounds:{x:0,y:0,width:1000,height:600}}));
  draw();assert.deepEqual(colors(),[450,532,650].map(O.wavelengthColor));
  [scene.elements[1],scene.elements[2]]=[scene.elements[2],scene.elements[1]];
  draw();assert.deepEqual(colors(),[450,650,532].map(O.wavelengthColor));
});

test('the synchronized spatial preview changes viewpoint and zoom without editing the design', async () => {
  const h=editorHarness(),laser=h.element('laser',1,{x:100,y:300,beamWidth:0,rayCount:1,wavelength:450});
  await h.load([laser,h.element('lens',2,{x:400,y:300}),h.element('mirror',3,{x:650,y:300,angle:45})]);
  const svg=h.get('spatial-view'),table=()=>svg.querySelector('[data-spatial-table]').querySelector('path').getAttribute('d');
  const area=()=>svg.getAttribute('viewBox').split(/\s+/).map(Number);
  assert.ok(svg.querySelector('[data-spatial-grid]'));assert.ok(svg.querySelector('[data-spatial-axes]'));
  assert.equal(svg.querySelectorAll('[data-spatial-element-id]').length,3);assert.ok(svg.querySelectorAll('[data-spatial-ray]').length>=1);
  assert.match(h.get('spatial-stats').textContent,/3 parts.*100%/);assert.equal(svg.querySelectorAll('.spatial-label').length,3);
  const before=h.scene(),undo=h.get('undo').disabled,redo=h.get('redo').disabled,initialTable=table();
  const azimuth=h.get('spatial-azimuth');azimuth.value='120';h.fire('input',azimuth);
  assert.equal(h.get('spatial-azimuth-value').value,'120°');assert.notEqual(table(),initialTable);assert.deepEqual(h.scene(),before);
  const fitted=area(),zoom=h.get('spatial-zoom');zoom.value='200';h.fire('input',zoom);
  near(area()[2],fitted[2]/2,1e-3);near(area()[3],fitted[3]/2,1e-3);assert.equal(h.get('spatial-zoom-value').value,'200%');
  assert.match(svg.getAttribute('aria-label'),/拡大率200%/);assert.match(h.get('spatial-stats').textContent,/200%/);
  h.click('spatial-zoom-out');assert.equal(zoom.value,'160');h.click('spatial-zoom-in');assert.equal(zoom.value,'200');
  const ordinary=h.fire('wheel',svg,{shiftKey:false,deltaY:-120});assert.equal(ordinary.defaultPrevented,false);assert.equal(zoom.value,'200');
  const wheel=h.fire('wheel',svg,{shiftKey:true,deltaY:-120});assert.equal(wheel.defaultPrevented,true);assert.equal(zoom.value,'240');
  zoom.value='400';h.fire('input',zoom);near(area()[2],fitted[2]/4,1e-3);assert.equal(h.get('spatial-zoom-in').disabled,true);
  zoom.value='50';h.fire('input',zoom);near(area()[2],fitted[2]*2,1e-3);assert.equal(h.get('spatial-zoom-out').disabled,true);
  assert.equal(h.get('undo').disabled,undo);assert.equal(h.get('redo').disabled,redo);
  h.fire('click',svg.querySelector('[data-spatial-element-id="2"]'));assert.equal(h.selectedId(),2);assert.deepEqual(h.scene(),before);
  h.get('show-labels').checked=false;h.fire('change',h.get('show-labels'));assert.equal(svg.querySelectorAll('.spatial-label').length,0);
  h.click('spatial-reset');assert.equal(azimuth.value,'35');assert.equal(h.get('spatial-elevation').value,'30');
  assert.equal(zoom.value,'100');assert.equal(h.get('spatial-zoom-value').value,'100%');
  assert.match(h.get('status').textContent,/Undo履歴は変更していません/);assert.deepEqual(h.scene(),before);
});

test('the spatial SVG draws table depth, wavelength rays, fiber cable and an export without editor selection', () => {
  const O=require('../optics-bench/optics.js'),S=require('../optics-bench/state.js'),{svg,view,selected}=spatialHarness();
  const scene=S.defaultScene([
    {...O.createElement('laser',1,100,300),beamWidth:0,rayCount:1,wavelength:450},
    O.createElement('lens',2,400,300),O.createElement('fiber',3,650,300),{...O.createElement('fiber',4,800,420),angle:180}
  ],{fiberLinks:[{a:3,b:4}]});
  const result=O.simulate(scene.elements,{fiberLinks:scene.fiberLinks,viewBounds:{x:0,y:0,width:1000,height:600}});
  const stats=view.draw(scene,result,2,true,{azimuth:35,elevation:30});
  assert.deepEqual({elements:stats.elements,shown:stats.segmentsShown,total:stats.segmentsTotal},{elements:4,shown:stats.segmentsTotal,total:stats.segmentsTotal});
  assert.ok(svg.querySelector('[data-spatial-table]'));assert.ok(svg.querySelector('[data-spatial-fibers] path'));
  assert.equal(svg.querySelectorAll('[data-spatial-element-id]').length,4);assert.ok(svg.querySelectorAll('[data-spatial-ray]').length>=1);
  assert.equal(svg.querySelector('[data-spatial-element-id="2"]').classList.contains('is-selected'),true);
  assert.ok(svg.querySelectorAll('[data-spatial-ray]').some(line=>line.getAttribute('stroke')===O.wavelengthColor(450)));
  assert.ok(svg.getAttribute('viewBox').split(/\s+/).map(Number).every(Number.isFinite));
  svg.querySelector('[data-spatial-element-id="3"]').dispatch('click');assert.equal(selected(),3);
  const previous=global.XMLSerializer;let exported;
  global.XMLSerializer=class{serializeToString(node){exported=node;return '<svg/>';}};
  try{assert.equal(view.exportSvg(scene.title),'<svg/>');}finally{if(previous===undefined)delete global.XMLSerializer;else global.XMLSerializer=previous;}
  assert.equal(exported.querySelector('.spatial-selection'),null);assert.equal(exported.getAttribute('width'),'1400');
  assert.match(exported.children[0].textContent,/斜視3D光学図/);
});

test('the beam blocker stays in the optical-path palette group and remains placeable', () => {
  const h=editorHarness(),groups=h.get('palette-buttons').children;
  const optical=groups.find(group=>group.children[0].textContent==='光路');
  const detection=groups.find(group=>group.children[0].textContent==='検出・撮像');
  const blocker=optical.querySelector('[data-add="blocker"]');
  assert.ok(blocker);assert.equal(detection.querySelector('[data-add="blocker"]'),null);
  assert.equal(groups.flatMap(group=>group.querySelectorAll('.part-button')).length,22);
  h.click('new-scene');h.fire('click',blocker);
  assert.equal(h.selected().type,'blocker');assert.match(h.get('status').textContent,/ビームブロッカー/);
});

test('camera, screen and fluorescent plate stay in the second palette group and are directly placeable', () => {
  const h=editorHarness(),groups=h.get('palette-buttons').children,detection=groups[1];
  assert.equal(detection.children[0].textContent,'検出・撮像');
  for(const type of ['camera','screen','fluorescent'])assert.ok(detection.querySelector('[data-add="'+type+'"]'),type);
  h.click('new-scene');h.fire('click',detection.querySelector('[data-add="camera"]'));assert.equal(h.selected().type,'camera');
  h.fire('click',detection.querySelector('[data-add="fluorescent"]'));assert.equal(h.selected().type,'fluorescent');
  assert.match(h.get('status').textContent,/蛍光板/);
});

test('the 450 nm shortcut updates either source, beam spectrum and swatch as one undo step', async () => {
  const O = require('../optics-bench/optics.js');
  for (const type of ['laser', 'point']) {
    const h = editorHarness(), source = h.element(type, 1, { x: 100, y: 300, wavelength: 532, rayCount: 1, beamWidth: 0 });
    await h.load([source, h.element('screen', 2, { x: 800, y: 300 })]);
    h.select(1); const before = h.scene();
    const button = h.get('parameter-fields').querySelector('[data-wavelength="450"]');
    assert.ok(button, type + ' must offer a 450 nm shortcut');
    button.focus();
    assert.equal(h.key('Enter', { ctrlKey: false }, button).defaultPrevented, false);
    h.fire('click', button);
    assert.deepEqual(h.selected(), { ...source, wavelength: 450 });
    assert.equal(h.get('param-wavelength').value, '450');
    assert.equal(h.get('selected-wavelength-color').style.background, O.wavelengthColor(450));
    assert.ok(h.result().segments.length > 0);
    assert.ok(h.result().segments.every(segment => segment.wavelength === 450));
    assert.deepEqual(h.result().detectors.find(item => item.id === 2).powerByWavelength, { 450: 1 });
    const changed = h.scene();
    h.get('bench').focus(); h.key('z'); assert.deepEqual(h.scene(), before);
    h.key('y'); assert.deepEqual(h.scene(), changed);
  }
});

test('native copy and paste preserve every component parameter while allocating distinct IDs and positions', async () => {
  const h = editorHarness();
  const source = h.element('laser', 17, {
    x: 123.456789123, y: 325.123456789, angle: 13.125, aperture: 42, focal: -83.5,
    beamWidth: 9.25, wavelength: 789.25, power: 0.37, rayCount: 11, divergence: 21.5,
    polarization: 'left', polAngle: 14.75, axisAngle: 78.125, designWavelength: 810,
    opening: 7, coreDiameter: 0.08, na: 0.27, transmission: 0.3125,
    cutoff: 632.5, mode: 'shortpass', enabled: false, label: 'Custom laser ①'
  });
  await h.load([source], { unit: 'in', gridStep: 25.4 });
  const before = h.scene();
  for (const modifiers of [{}, { ctrlKey: false, metaKey: true }]) {
    for (const key of ['c', 'x', 'v']) assert.equal(h.key(key, modifiers).defaultPrevented, false);
  }
  assert.deepEqual(h.scene(), before, 'keydown must leave native clipboard dispatch enabled.');
  const copied = h.clipboard('copy');
  assert.equal(copied.event.defaultPrevented, true);
  const text = copied.data.get('text/plain');
  assert.ok(text.startsWith('Optics Bench component v1\n'));
  assert.deepEqual(h.parseComponent(text), source);
  assert.deepEqual(h.scene(), before);
  for (let paste = 0; paste < 2; paste++) {
    assert.equal(h.clipboard('paste', text).event.defaultPrevented, true);
    const added = h.selected();
    assert.notEqual(added.id, source.id);
    assert.deepEqual({ ...added, id: source.id, x: source.x, y: source.y }, source);
  }
  const elements = h.scene().elements;
  assert.equal(new Set(elements.map(e => e.id)).size, 3);
  assert.equal(new Set(elements.map(e => e.x + ',' + e.y)).size, 3);
  assert.deepEqual(elements[0], source);
});

test('successful cut is undoable with selection and all parameters, and paste reuses the vacant position', () => {
  const h = editorHarness(); h.click('new-scene'); h.add('laser'); const source = h.selected(); h.add('lens');
  h.select(source.id); const before = h.scene();
  const cut = h.clipboard('cut'), text = cut.data.get('text/plain');
  assert.deepEqual(h.parseComponent(text), source);
  const afterCut = h.scene(); assert.equal(afterCut.elements.length, 1);
  h.key('z'); assert.deepEqual(h.scene(), before); assert.equal(h.selectedId(), source.id);
  h.key('y'); assert.deepEqual(h.scene(), afterCut);
  h.clipboard('paste', text);
  assert.deepEqual({ ...h.selected(), id: source.id }, source);
  h.key('z'); assert.deepEqual(h.scene(), afterCut);
  h.key('z'); assert.deepEqual(h.scene(), before);
});

test('clipboard write/read failures and copying alone preserve the scene and the redo branch', () => {
  const h = editorHarness(); h.click('new-scene'); h.add('laser'); h.add('mirror');
  const later = h.scene(); h.key('z'); const before = h.scene();
  for (const clipboardData of [null, { setData() { throw new Error('Clipboard denied'); } }]) {
    assert.equal(h.clipboard('cut', '', { clipboardData }).event.defaultPrevented, true);
    assert.deepEqual(h.scene(), before); assert.equal(h.get('redo').disabled, false);
  }
  for (const clipboardData of [null, { getData() { throw new Error('Clipboard denied'); } }]) {
    h.clipboard('paste', '', { clipboardData });
    assert.deepEqual(h.scene(), before); assert.equal(h.get('redo').disabled, false);
  }
  h.clipboard('copy'); assert.equal(h.get('redo').disabled, false);
  h.key('y'); assert.deepEqual(h.scene(), later);
});

test('ordinary text and malformed component pastes do not consume redo or change the design', () => {
  const h = editorHarness(); h.click('new-scene'); h.add('laser'); h.add('mirror');
  const later = h.scene(); h.key('z'); const before = h.scene();
  for (const text of ['plain text', JSON.stringify(before), 'Optics Bench component v1\n{bad JSON}', '']) {
    h.clipboard('paste', text);
    assert.deepEqual(h.scene(), before); assert.equal(h.get('redo').disabled, false);
  }
  h.key('y'); assert.deepEqual(h.scene(), later);
});

test('the 80-component paste limit rejects without losing history', async () => {
  const h = editorHarness();
  await h.load(Array.from({ length: 80 }, (_, i) => h.element('blocker', i + 1, { x: 50 + i % 16 * 50, y: 50 + Math.floor(i / 16) * 100 })));
  h.click('rotate'); const later = h.scene(); h.key('z'); const before = h.scene();
  const text = h.clipboard('copy').data.get('text/plain'); h.clipboard('paste', text);
  assert.deepEqual(h.scene(), before); assert.equal(h.get('redo').disabled, false);
  assert.match(h.get('status').textContent, /80/);
  h.key('y'); assert.deepEqual(h.scene(), later);
});

test('pasting beyond a crowded coarse grid is one undo step', async () => {
  const h = editorHarness();
  await h.load(fullCoarseGrid().map((point, i) => h.element('blocker', i + 1, point)), { unit: 'mm', gridStep: 254 });
  h.click('rotate'); const later = h.scene(); h.key('z'); const before = h.scene();
  h.clipboard('paste', h.clipboard('copy').data.get('text/plain'));
  const pasted = h.scene(); assert.equal(pasted.elements.length, before.elements.length + 1);
  assert.ok(h.selected().x < 50 || h.selected().y < 50 || h.selected().x > 950 || h.selected().y > 550);
  assert.equal(h.get('redo').disabled, true);
  h.key('z'); assert.deepEqual(h.scene(), before); h.key('y'); assert.deepEqual(h.scene(), pasted);
});

test('a successful paste after undo clears redo, while copy preserves it', () => {
  const h = editorHarness(); h.click('new-scene'); h.add('laser'); h.add('mirror'); h.key('z');
  const text = h.clipboard('copy').data.get('text/plain'); assert.equal(h.get('redo').disabled, false);
  h.clipboard('paste', text); const pasted = h.scene();
  assert.equal(h.get('redo').disabled, true);
  h.key('y'); assert.deepEqual(h.scene(), pasted);
  h.key('z'); h.add('iris'); const edited = h.scene();
  assert.equal(h.get('redo').disabled, true);
  h.key('Z', { shiftKey: true }); assert.deepEqual(h.scene(), edited);
});

test('text, number, select, textarea and inherited contenteditable keep native editing shortcuts', () => {
  const h = editorHarness(); h.click('new-scene'); h.add('laser'); h.add('mirror'); h.key('z');
  const before = h.scene(), text = h.clipboard('copy').data.get('text/plain');
  const targets = [h.get('param-label'), h.get('param-wavelength'), h.get('element-select')];
  const textarea = h.document.createElement('textarea'); h.document.body.append(textarea); targets.push(textarea);
  const editable = h.document.createElement('div'), child = h.document.createElement('span');
  editable.setAttribute('contenteditable', 'true'); editable.append(child); h.document.body.append(editable); targets.push(child);
  for (const target of targets) {
    target.focus();
    for (const [key, properties] of [['z', {}], ['y', {}], ['Z', { shiftKey: true }], ['c', {}], ['x', {}], ['v', {}]]) {
      assert.equal(h.key(key, properties, target).defaultPrevented, false);
    }
    for (const type of ['copy', 'cut', 'paste']) {
      const dispatched = h.clipboard(type, text, {}, target);
      assert.equal(dispatched.event.defaultPrevented, false);
      assert.equal(dispatched.data.get('text/plain'), text);
    }
    // Clipboard events may target the document while a text control owns focus.
    assert.equal(h.clipboard('cut', text, {}, h.document).event.defaultPrevented, false);
    assert.deepEqual(h.scene(), before); assert.equal(h.get('redo').disabled, false);
  }
  h.get('bench').focus(); h.key('y'); assert.equal(h.scene().elements.length, 2);
});

test('range and checkbox focus allow editor undo and redo', () => {
  for (const id of ['param-angle-slider', 'param-enabled']) {
    const h = editorHarness(); h.click('new-scene'); h.add('laser'); const first = h.scene(); h.add('mirror'); const second = h.scene();
    h.get(id).focus(); assert.equal(h.key('z').defaultPrevented, true); assert.deepEqual(h.scene(), first);
    h.get(id).focus(); assert.equal(h.key('y').defaultPrevented, true); assert.deepEqual(h.scene(), second);
  }
});

test('pending placement, movement and range gestures cancel on first undo without undoing the preceding edit', () => {
  for (const kind of ['place', 'move', 'range']) {
    const h = editorHarness(); h.click('new-scene'); h.add('laser'); const earlier = h.scene(); h.add('mirror');
    const before = h.scene(), selected = h.selected(), text = h.clipboard('copy').data.get('text/plain');
    const target = kind === 'place' ? h.get('palette-buttons').querySelector('[data-add="iris"]') :
      kind === 'range' ? h.get('param-angle-slider') : h.component(selected.id);
    h.fire('pointerdown', target, { pointerId: 7, clientX: kind === 'range' ? 100 : selected.x, clientY: selected.y });
    h.fire('pointermove', h.document, { pointerId: 7, clientX: selected.x + 80, clientY: selected.y + 60 });
    if (kind !== 'place') assert.notDeepEqual(h.scene(), before);
    const pending = h.scene();
    for (const key of ['c', 'x', 'v']) assert.equal(h.key(key).defaultPrevented, true);
    for (const type of ['copy', 'cut', 'paste']) assert.equal(h.clipboard(type, text).event.defaultPrevented, false);
    assert.deepEqual(h.scene(), pending);
    assert.equal(h.key('z').defaultPrevented, true); assert.deepEqual(h.scene(), before);
    h.key('z'); assert.deepEqual(h.scene(), earlier);
  }
});

test('clipboard repeat, composition, Alt modifiers and already-handled events do not mutate the design', () => {
  const h = editorHarness(); h.click('new-scene'); h.add('laser'); const before = h.scene();
  for (const key of ['c', 'x', 'v', 'd']) assert.equal(h.key(key, { repeat: true }).defaultPrevented, true);
  for (const properties of [{ isComposing: true }, { keyCode: 229 }, { altKey: true }]) {
    assert.equal(h.key('z', properties).defaultPrevented, false);
  }
  h.key('z', { defaultPrevented: true });
  for (const type of ['copy', 'cut', 'paste']) {
    const event = h.clipboard(type, 'untouched', { defaultPrevented: true });
    assert.equal(event.data.get('text/plain'), 'untouched');
  }
  assert.deepEqual(h.scene(), before);
  assert.equal(h.key('d').defaultPrevented, true); assert.equal(h.scene().elements.length, 2);
});

test('selected page text is left to the native clipboard until the bench clears text selection', () => {
  const h = editorHarness(); h.click('new-scene'); h.add('mirror'); const before = h.scene();
  const text = h.clipboard('copy').data.get('text/plain'); h.selection('Selected guide text');
  for (const type of ['copy', 'cut', 'paste']) {
    const dispatched = h.clipboard(type, text);
    assert.equal(dispatched.event.defaultPrevented, false); assert.equal(dispatched.data.get('text/plain'), text);
  }
  assert.deepEqual(h.scene(), before);
  h.fire('pointerdown', h.get('bench'), { pointerId: 4, clientX: 100, clientY: 100 });
  assert.equal(h.selectionText(), '');
  h.fire('pointercancel', h.document, { pointerId: 4 });
  assert.equal(h.clipboard('copy').event.defaultPrevented, true);
  assert.deepEqual(h.scene(), before);
});

test('copy and cut with no selection are ignored, while pasting into a new design is undoable', async () => {
  const h = editorHarness(), source = h.element('lens', 37, { x: 333.123456789, y: 277.123456789, focal: -57.25, label: 'Transfer lens' });
  await h.load([source], { unit: 'in', gridStep: 25.4 });
  const text = h.clipboard('copy').data.get('text/plain'); h.click('new-scene');
  for (const type of ['copy', 'cut']) {
    const dispatched = h.clipboard(type, 'keep clipboard');
    assert.equal(dispatched.event.defaultPrevented, false); assert.equal(dispatched.data.get('text/plain'), 'keep clipboard');
  }
  h.clipboard('paste', text); const pasted = h.scene();
  assert.notEqual(h.selectedId(), source.id);
  assert.deepEqual({ ...h.selected(), id: source.id }, source);
  h.key('z'); assert.equal(h.scene().elements.length, 0);
  h.key('y'); assert.deepEqual(h.scene(), pasted);
});

test('parameter edits commit separately and undo does not remove the edited component', () => {
  const h = editorHarness(); h.click('new-scene'); h.add('mirror'); const before = h.scene();
  const input = h.get('param-angle'); input.focus(); input.value = '13.125'; h.fire('input', input);
  assert.equal(h.selected().angle, 13.125);
  h.get('bench').focus(); const changed = h.scene();
  h.key('z'); assert.deepEqual(h.scene(), before);
  h.key('y'); assert.deepEqual(h.scene(), changed);
});

test('Ctrl-drag previews a full-parameter copy and commits exactly one new component on release', async () => {
  const h = editorHarness(), source = h.element('laser', 73, {
    x: 150.125, y: 240.875, angle: 13.125, aperture: 42, focal: -83.5,
    beamWidth: 9.25, wavelength: 789.25, power: 0.37, rayCount: 11, divergence: 21.5,
    polarization: 'left', polAngle: 14.75, axisAngle: 78.125, designWavelength: 810,
    opening: 7, coreDiameter: 0.08, na: 0.27, transmission: 0.3125,
    cutoff: 632.5, mode: 'shortpass', enabled: false, label: 'Copied source ①'
  });
  await h.load([source], { unit: 'mm', gridStep: 10 });
  const before = h.scene();
  h.fire('pointerdown', h.component(source.id), { pointerId: 31, ctrlKey: true, clientX: 157.75, clientY: 236.125 });
  h.fire('pointermove', h.document, { pointerId: 31, ctrlKey: true, clientX: 482.625, clientY: 301.25 });
  // A resize forces the controller to expose its current scene to draw, even if
  // an implementation accidentally mutated it without scheduling a render.
  h.windowEvent('resize');
  assert.deepEqual(h.scene(), before);
  assert.ok(h.preview());
  assert.deepEqual({ x: h.preview().x, y: h.preview().y }, { x: 480, y: 310 });
  assert.equal(h.preview().label, source.label);
  h.fire('pointerup', h.document, { pointerId: 31, ctrlKey: true, clientX: 482.625, clientY: 301.25 });
  const copied = h.selected(), after = h.scene();
  assert.equal(after.elements.length, 2); assert.notEqual(copied.id, source.id);
  assert.deepEqual({ ...copied, id: source.id, x: source.x, y: source.y }, source);
  assert.deepEqual({ x: copied.x, y: copied.y }, { x: 480, y: 310 });
  assert.deepEqual(after.elements[0], source); assert.equal(h.preview(), null);
  assert.equal(h.get('bench').hasPointerCapture(31), false);
  h.key('z'); assert.deepEqual(h.scene(), before); assert.equal(h.selectedId(), source.id);
  h.key('y'); assert.deepEqual(h.scene(), after); assert.equal(h.selectedId(), copied.id);
});

test('Ctrl drag-copy stays latched while Meta or the Windows key alone performs an ordinary move', () => {
  const h = editorHarness(); h.click('new-scene'); h.add('mirror');
  const source = h.selected(), before = h.scene();
  h.fire('pointerdown', h.component(source.id), { pointerId: 8, ctrlKey: true, clientX: source.x, clientY: source.y });
  h.fire('pointermove', h.document, { pointerId: 8, ctrlKey: false, clientX: source.x + 80, clientY: source.y + 60 });
  h.windowEvent('resize'); assert.deepEqual(h.scene(), before);
  h.fire('pointerup', h.document, { pointerId: 8, ctrlKey: false, clientX: source.x + 80, clientY: source.y + 60 });
  assert.equal(h.scene().elements.length, 2);
  assert.deepEqual(h.scene().elements[0], source);
  assert.deepEqual({ x: h.selected().x, y: h.selected().y }, { x: source.x + 80, y: source.y + 60 });

  const m = editorHarness(); m.click('new-scene'); m.add('mirror'); const original = m.selected();
  m.fire('pointerdown', m.component(original.id), { pointerId: 9, metaKey: true, clientX: original.x, clientY: original.y });
  m.fire('pointermove', m.document, { pointerId: 9, metaKey: true, clientX: original.x + 80, clientY: original.y + 60 });
  m.fire('pointerup', m.document, { pointerId: 9, metaKey: true, clientX: original.x + 80, clientY: original.y + 60 });
  assert.equal(m.scene().elements.length, 1);
  assert.deepEqual({ x: m.selected().x, y: m.selected().y }, { x: original.x + 80, y: original.y + 60 });
});

test('pressing Ctrl after ordinary pointerdown switches the gesture to a copy', () => {
  const h = editorHarness(); h.click('new-scene'); h.add('mirror');
  const source = h.selected(), before = h.scene();
  h.fire('pointerdown', h.component(source.id), { pointerId: 9, clientX: source.x + 7, clientY: source.y - 3 });
  h.fire('pointermove', h.document, { pointerId: 9, ctrlKey: true, metaKey: true, clientX: source.x + 107, clientY: source.y + 57 });
  assert.deepEqual(h.scene(),before);assert.deepEqual(h.preview(),{...source,x:source.x+100,y:source.y+60});
  h.fire('pointerup', h.document, { pointerId: 9, clientX: source.x + 107, clientY: source.y + 57 });
  assert.deepEqual(h.scene().elements,[source,{...source,id:2,x:source.x+100,y:source.y+60}]);
  h.key('z'); assert.deepEqual(h.scene(), before);
});

test('Ctrl-click and sub-four-pixel jitter select without copying or consuming redo', () => {
  for (const [dx, dy] of [[0, 0], [3.99, 0], [2.5, 2.5]]) {
    const h = editorHarness(); h.click('new-scene'); h.add('laser'); h.add('mirror');
    const later = h.scene(); h.key('z'); const before = h.scene(), source = h.selected();
    h.fire('pointerdown', h.component(source.id), { pointerId: 11, ctrlKey: true, clientX: source.x, clientY: source.y });
    h.fire('pointermove', h.document, { pointerId: 11, ctrlKey: true, clientX: source.x + dx, clientY: source.y + dy });
    assert.equal(h.preview(), null);
    h.fire('pointerup', h.document, { pointerId: 11, ctrlKey: true, clientX: source.x + dx, clientY: source.y + dy });
    assert.deepEqual(h.scene(), before); assert.equal(h.selectedId(), source.id);
    assert.equal(h.get('redo').disabled, false);
    h.key('y'); assert.deepEqual(h.scene(), later);
  }
});

test('a four-pixel Ctrl-drag copies, including movement first reported by pointerup', async () => {
  const h = editorHarness(), source = h.element('mirror', 12);
  await h.load([source], { snap: false });
  h.fire('pointerdown', h.component(source.id), { pointerId: 12, ctrlKey: true, clientX: source.x, clientY: source.y });
  h.fire('pointerup', h.document, { pointerId: 12, ctrlKey: true, clientX: source.x + 4, clientY: source.y });
  assert.equal(h.scene().elements.length, 2);
  assert.deepEqual(h.scene().elements[0], source);
  assert.equal(h.selected().x, source.x + 4); assert.equal(h.selected().y, source.y);
});

test('drag copies apply grab offsets, inch snapping and free placement across old board edges', async () => {
  for (const settings of [
    { snap: true, unit: 'in', gridStep: 25.4, end: { x: 683.4567891, y: 355.2468135 } },
    { snap: false, unit: 'in', gridStep: 25.4, end: { x: 683.4567891, y: 355.2468135 } },
    { snap: true, unit: 'mm', gridStep: 10, end: { x: 2, y: 599 } }
  ]) {
    const h = editorHarness(), source = h.element('lens', 14, { x: 400.125, y: 250.875, angle: 17.321 });
    const { end, ...sceneSettings } = settings, offset = { x: 12.5, y: -7.25 };
    await h.load([source], sceneSettings); const before = h.scene();
    h.fire('pointerdown', h.component(source.id), { pointerId: 14, ctrlKey: true, clientX: source.x + offset.x, clientY: source.y + offset.y });
    h.fire('pointermove', h.document, { pointerId: 14, ctrlKey: true, clientX: end.x, clientY: end.y });
    const expected = V.place(end.x - offset.x, end.y - offset.y, settings.gridStep, settings.snap);
    assert.deepEqual({ x: h.preview().x, y: h.preview().y }, expected);
    h.windowEvent('resize'); assert.deepEqual(h.scene(), before);
    h.fire('pointerup', h.document, { pointerId: 14, ctrlKey: true, clientX: end.x, clientY: end.y });
    assert.deepEqual({ x: h.selected().x, y: h.selected().y }, expected);
    assert.deepEqual({ ...h.selected(), id: source.id, x: source.x, y: source.y }, source);
  }
});

test('wrong pointer IDs cannot move, release or cancel an in-progress Ctrl-drag copy', () => {
  const h = editorHarness(); h.click('new-scene'); h.add('lens'); const source = h.selected(), before = h.scene();
  h.fire('pointerdown', h.component(source.id), { pointerId: 15, ctrlKey: true, clientX: source.x, clientY: source.y });
  for (const type of ['pointermove', 'pointerup', 'pointercancel']) {
    h.fire(type, h.document, { pointerId: 99, ctrlKey: true, clientX: source.x + 60, clientY: source.y + 80 });
    assert.deepEqual(h.scene(), before); assert.equal(h.preview(), null);
    assert.equal(h.get('bench').hasPointerCapture(15), true);
  }
  h.fire('pointerup', h.document, { pointerId: 15, ctrlKey: true, clientX: source.x + 60, clientY: source.y + 80 });
  assert.equal(h.scene().elements.length, 2); assert.equal(h.get('bench').hasPointerCapture(15), false);
});

test('dropping a Ctrl-drag copy outside the visible viewport cancels and preserves redo', () => {
  for (const end of [{ x: -1, y: 300 }, { x: 1001, y: 300 }, { x: 300, y: -1 }, { x: 300, y: 601 }]) {
    const h = editorHarness(); h.click('new-scene'); h.add('laser'); h.add('mirror');
    const later = h.scene(); h.key('z'); const before = h.scene(), source = h.selected();
    h.fire('pointerdown', h.component(source.id), { pointerId: 16, ctrlKey: true, clientX: source.x, clientY: source.y });
    h.fire('pointermove', h.document, { pointerId: 16, ctrlKey: true, clientX: 700, clientY: 400 });
    assert.ok(h.preview());
    // Release itself must recheck containment rather than trusting the last move.
    h.fire('pointerup', h.document, { pointerId: 16, ctrlKey: true, clientX: end.x, clientY: end.y });
    h.windowEvent('resize'); assert.deepEqual(h.scene(), before); assert.equal(h.preview(), null);
    assert.equal(h.get('bench').hasPointerCapture(16), false); assert.equal(h.get('redo').disabled, false);
    h.fire('pointerup', h.document, { pointerId: 16, ctrlKey: true, clientX: 700, clientY: 400 });
    assert.deepEqual(h.scene(), before);
    h.key('y'); assert.deepEqual(h.scene(), later);
  }
});

test('Escape, pointer cancellation, lost capture, window blur and Ctrl+Z cancel copies without changing history', () => {
  for (const reason of ['escape', 'pointercancel', 'lostcapture', 'blur', 'undo']) {
    const h = editorHarness(); h.click('new-scene'); const empty = h.scene(); h.add('laser'); h.add('mirror');
    const later = h.scene(); h.key('z'); const before = h.scene(), source = h.selected();
    h.fire('pointerdown', h.component(source.id), { pointerId: 17, ctrlKey: true, clientX: source.x, clientY: source.y });
    h.fire('pointermove', h.document, { pointerId: 17, ctrlKey: true, clientX: source.x + 80, clientY: source.y + 60 });
    assert.ok(h.preview(), reason);
    if (reason === 'escape') h.key('Escape', { ctrlKey: false });
    else if (reason === 'undo') h.key('z');
    else if (reason === 'blur') h.windowEvent('blur');
    else if (reason === 'lostcapture') h.get('bench').releasePointerCapture(17);
    else h.fire('pointercancel', h.document, { pointerId: 17 });
    h.windowEvent('resize');
    assert.deepEqual(h.scene(), before, reason); assert.equal(h.preview(), null, reason);
    assert.equal(h.get('bench').hasPointerCapture(17), false, reason); assert.equal(h.get('redo').disabled, false, reason);
    h.fire('pointerup', h.document, { pointerId: 17, ctrlKey: true, clientX: source.x + 80, clientY: source.y + 60 });
    assert.deepEqual(h.scene(), before, reason);
    h.key('y'); assert.deepEqual(h.scene(), later, reason);
    h.key('z'); h.key('z'); assert.deepEqual(h.scene(), empty, reason);
  }
});

test('Ctrl copy drags at the 80-component limit do not fall back to moving the source', async () => {
  const h = editorHarness();
  await h.load(Array.from({ length: 80 }, (_, i) => h.element('blocker', i + 1, { x: 50 + i % 16 * 50, y: 50 + Math.floor(i / 16) * 100 })));
  h.click('rotate'); const later = h.scene(); h.key('z'); const before = h.scene(), source = h.selected();
  h.fire('pointerdown', h.component(source.id), { pointerId: 18, ctrlKey: true, clientX: source.x, clientY: source.y });
  h.fire('pointermove', h.document, { pointerId: 18, ctrlKey: true, clientX: source.x + 100, clientY: source.y + 80 });
  h.fire('pointerup', h.document, { pointerId: 18, ctrlKey: true, clientX: source.x + 100, clientY: source.y + 80 });
  h.windowEvent('resize');
  assert.deepEqual(h.scene(), before); assert.equal(h.preview(), null);
  assert.equal(h.get('redo').disabled, false); h.key('y'); assert.deepEqual(h.scene(), later);
  h.key('z');assert.deepEqual(h.scene(),before);
  h.fire('pointerdown',h.component(source.id),{pointerId:181,clientX:source.x,clientY:source.y});
  h.fire('pointermove',h.document,{pointerId:181,clientX:source.x+40,clientY:source.y+20});assert.notDeepEqual(h.scene(),before);
  h.fire('pointermove',h.document,{pointerId:181,ctrlKey:true,clientX:source.x+100,clientY:source.y+80});
  assert.deepEqual(h.scene(),before);assert.equal(h.preview(),null);assert.equal(h.get('bench').hasPointerCapture(181),false);
  assert.match(h.get('status').textContent,/最大80個/);h.fire('pointerup',h.document,{pointerId:181,clientX:source.x+100,clientY:source.y+80});
  assert.deepEqual(h.scene(),before);h.key('y');assert.deepEqual(h.scene(),later);
});

test('a committed Ctrl-drag replaces redo with one copy transaction and ignores duplicate pointerup', () => {
  const h = editorHarness(); h.click('new-scene'); h.add('laser'); h.add('mirror'); h.key('z');
  const before = h.scene(), source = h.selected();
  h.fire('pointerdown', h.component(source.id), { pointerId: 19, ctrlKey: true, clientX: source.x, clientY: source.y });
  h.fire('pointermove', h.document, { pointerId: 19, ctrlKey: true, clientX: source.x + 80, clientY: source.y + 60 });
  assert.equal(h.get('redo').disabled, false);
  const release = { pointerId: 19, ctrlKey: true, clientX: source.x + 80, clientY: source.y + 60 };
  h.fire('pointerup', h.document, release); const after = h.scene(), copiedId = h.selectedId();
  h.fire('pointerup', h.document, release);
  assert.deepEqual(h.scene(), after); assert.equal(after.elements.length, 2);
  assert.ok(after.elements.every(e => e.type === 'laser')); assert.equal(h.get('redo').disabled, true);
  h.key('y'); assert.deepEqual(h.scene(), after);
  h.key('z'); assert.deepEqual(h.scene(), before); assert.equal(h.selectedId(), source.id);
  h.key('y'); assert.deepEqual(h.scene(), after); assert.equal(h.selectedId(), copiedId);
});

test('Ctrl and Meta gestures on the rotation handle rotate the original rather than copying', () => {
  for (const modifier of ['ctrlKey', 'metaKey']) {
    const h = editorHarness(); h.click('new-scene'); h.add('mirror'); const source = h.selected(), before = h.scene();
    const handle = h.document.createElement('circle'); handle.dataset.rotate = 'true'; h.component(source.id).append(handle);
    h.fire('pointerdown', handle, { pointerId: 20, [modifier]: true, clientX: source.x + 60, clientY: source.y });
    h.fire('pointermove', h.document, { pointerId: 20, [modifier]: true, clientX: source.x, clientY: source.y + 60 });
    h.fire('pointerup', h.document, { pointerId: 20, [modifier]: true, clientX: source.x, clientY: source.y + 60 });
    assert.deepEqual(h.scene().elements, [{ ...source, angle: 90 }]); assert.equal(h.preview(), null);
    h.key('z'); assert.deepEqual(h.scene(), before);
  }
});

test('Ctrl and Meta preserve palette placement and background panning', () => {
  for (const modifier of ['ctrlKey', 'metaKey']) {
    const h = editorHarness(); h.click('new-scene'); h.add('laser'); const initial = h.scene();
    const palette = h.get('palette-buttons').querySelector('[data-add="iris"]');
    h.fire('pointerdown', palette, { pointerId: 21, [modifier]: true, clientX: 20, clientY: 100 });
    h.fire('pointermove', h.document, { pointerId: 21, [modifier]: true, clientX: 450.75, clientY: 370.125 });
    h.fire('pointerup', h.document, { pointerId: 21, [modifier]: true, clientX: 450.75, clientY: 370.125 });
    assert.equal(h.scene().elements.length, 2); assert.equal(h.selected().type, 'iris');
    assert.deepEqual({ x: h.selected().x, y: h.selected().y }, { x: 450, y: 370 });
    const placed = h.scene(), view = h.viewport();
    h.fire('pointerdown', h.get('bench'), { pointerId: 22, [modifier]: true, clientX: 50, clientY: 50 });
    h.fire('pointermove', h.document, { pointerId: 22, [modifier]: true, clientX: 80, clientY: 95 });
    h.fire('pointerup', h.document, { pointerId: 22, [modifier]: true, clientX: 80, clientY: 95 });
    assert.deepEqual(h.scene(), placed); assert.equal(h.preview(), null);
    assert.deepEqual(h.viewport(), { ...view, x: view.x - 30, y: view.y - 45 });
    h.key('z'); assert.deepEqual(h.scene(), initial);
  }
});

test('Shift-click toggles a multi-selection and the selection controls remain non-destructive', () => {
  const h=editorHarness();assert.deepEqual(h.selectedIds(),[3]);
  h.fire('pointerdown',h.component(2),{pointerId:31,shiftKey:true,clientX:550,clientY:400});
  h.fire('pointerup',h.document,{pointerId:31,shiftKey:true,clientX:550,clientY:400});
  assert.deepEqual(h.selectedIds(),[3,2]);assert.equal(h.selectedId(),2);assert.match(h.get('selection-summary').textContent,/2個選択中/);
  h.fire('pointerdown',h.component(3),{pointerId:32,shiftKey:true,clientX:550,clientY:200});
  h.fire('pointerup',h.document,{pointerId:32,shiftKey:true,clientX:550,clientY:200});assert.deepEqual(h.selectedIds(),[2]);
  h.click('select-all');assert.deepEqual(h.selectedIds(),[1,2,3,4]);
  const before=h.scene();h.click('clear-selection');assert.deepEqual(h.selectedIds(),[]);assert.deepEqual(h.scene(),before);
  assert.equal(h.get('undo').disabled,true);
  const viewport=h.viewport();h.click('pan-tool');assert.equal(h.get('pan-tool').getAttribute('aria-pressed'),'true');assert.equal(h.get('bench').classList.contains('pan-tool'),true);
  h.fire('pointerdown',h.get('bench'),{pointerId:33,clientX:100,clientY:100});h.fire('pointerup',h.document,{pointerId:33,clientX:140,clientY:125});
  assert.deepEqual(h.viewport(),{...viewport,x:viewport.x-40,y:viewport.y-25});assert.deepEqual(h.scene(),before);
  h.click('select-tool');assert.equal(h.get('bench').classList.contains('pan-tool'),false);
});

test('marquee selects by component center, adds with Shift and cancels without changing history', () => {
  const h=editorHarness();
  h.fire('pointerdown',h.get('bench'),{pointerId:41,clientX:500,clientY:150});h.fire('pointermove',h.document,{pointerId:41,clientX:600,clientY:450});
  assert.deepEqual(h.selectedIds(),[2,3]);assert.deepEqual(h.marquee(),{x:500,y:150,width:100,height:300});
  h.fire('pointerup',h.document,{pointerId:41,clientX:600,clientY:450});assert.equal(h.marquee(),null);
  h.fire('pointerdown',h.get('bench'),{pointerId:42,shiftKey:true,clientX:100,clientY:350});h.fire('pointermove',h.document,{pointerId:42,shiftKey:true,clientX:200,clientY:450});
  h.fire('pointerup',h.document,{pointerId:42,shiftKey:true,clientX:200,clientY:450});assert.deepEqual(h.selectedIds(),[2,3,1]);
  const before=h.scene();h.fire('pointerdown',h.get('bench'),{pointerId:43,clientX:0,clientY:0});h.fire('pointermove',h.document,{pointerId:43,clientX:1000,clientY:600});
  h.fire('pointercancel',h.document,{pointerId:43});assert.deepEqual(h.selectedIds(),[2,3,1]);assert.deepEqual(h.scene(),before);assert.equal(h.get('undo').disabled,true);
});

test('dragging a selection moves every member once and Shift locks the dominant axis', () => {
  const h=editorHarness();
  h.fire('pointerdown',h.component(2),{pointerId:51,shiftKey:true,clientX:550,clientY:400});h.fire('pointerup',h.document,{pointerId:51,shiftKey:true,clientX:550,clientY:400});
  const before=h.scene();h.fire('pointerdown',h.component(2),{pointerId:52,shiftKey:true,clientX:550,clientY:400});
  h.fire('pointermove',h.document,{pointerId:52,shiftKey:false,clientX:632,clientY:437});h.fire('pointerup',h.document,{pointerId:52,shiftKey:false,clientX:632,clientY:437});
  const moved=h.scene();assert.deepEqual(h.selectedIds(),[3,2]);assert.deepEqual(moved.elements.map(e=>[e.id,e.x,e.y]),[[1,150,400],[2,630,400],[3,630,200],[4,550,123.8]]);
  assert.match(h.get('status').textContent,/2個の部品を移動/);h.key('z');assert.deepEqual(h.scene(),before);assert.deepEqual(h.selectedIds(),[3,2]);
  h.key('y');assert.deepEqual(h.scene(),moved);assert.deepEqual(h.selectedIds(),[3,2]);
});

test('Shift pressed after a move starts locks the dominant axis and stays latched', () => {
  const h=editorHarness();h.click('new-scene');h.add('mirror');const source=h.selected(),before=h.scene();
  h.fire('pointerdown',h.component(source.id),{pointerId:521,clientX:source.x,clientY:source.y});
  h.fire('pointermove',h.document,{pointerId:521,clientX:source.x+30,clientY:source.y+20});
  assert.deepEqual({x:h.selected().x,y:h.selected().y},{x:source.x+30,y:source.y+20});
  h.fire('pointermove',h.document,{pointerId:521,shiftKey:true,clientX:source.x+82,clientY:source.y+37});
  h.fire('pointerup',h.document,{pointerId:521,clientX:source.x+82,clientY:source.y+37});
  assert.deepEqual({x:h.selected().x,y:h.selected().y},{x:source.x+80,y:source.y});
  h.key('z');assert.deepEqual(h.scene(),before);
});

test('Ctrl and Shift pressed after a drag starts switch it to an axis-locked copy', () => {
  const h=editorHarness();h.click('new-scene');h.add('laser');const source=h.selected(),before=h.scene();
  h.fire('pointerdown',h.component(source.id),{pointerId:53,clientX:source.x,clientY:source.y});
  h.fire('pointermove',h.document,{pointerId:53,clientX:source.x+30,clientY:source.y+20});
  assert.notDeepEqual(h.scene(),before);assert.equal(h.preview(),null);
  h.fire('pointermove',h.document,{pointerId:53,ctrlKey:true,shiftKey:true,clientX:source.x+82,clientY:source.y+37});
  assert.deepEqual(h.scene(),before);assert.deepEqual(h.preview(),{...source,x:source.x+80,y:source.y});
  h.fire('pointerup',h.document,{pointerId:53,clientX:source.x+82,clientY:source.y+37});
  const after=h.scene();assert.equal(after.elements.length,2);assert.deepEqual(after.elements[0],source);
  assert.deepEqual({...after.elements[1],id:source.id},{...source,x:source.x+80,y:source.y});
  assert.match(h.get('status').textContent,/複製/);h.key('z');assert.deepEqual(h.scene(),before);
});

test('group clipboard, deletion and Ctrl-drag preserve internal fiber connections and are undoable', async () => {
  const h=editorHarness(),a=h.element('fiber',1,{x:200,y:200}),b=h.element('fiber',2,{x:500,y:200,angle:180});
  await h.load([a,b],{fiberLinks:[{a:1,b:2}]});h.select(1);
  h.fire('pointerdown',h.component(2),{pointerId:61,shiftKey:true,clientX:500,clientY:200});h.fire('pointerup',h.document,{pointerId:61,shiftKey:true,clientX:500,clientY:200});
  const text=h.clipboard('copy').data.get('text/plain');assert.match(text,/^Optics Bench selection v1/);h.clipboard('paste',text);
  assert.equal(h.scene().elements.length,4);assert.equal(h.scene().fiberLinks.length,2);assert.equal(h.selectedIds().length,2);h.key('z');assert.equal(h.scene().elements.length,2);
  h.fire('pointerdown',h.component(1),{pointerId:60,clientX:200,clientY:200});h.fire('pointerup',h.document,{pointerId:60,clientX:200,clientY:200});
  h.fire('pointerdown',h.component(2),{pointerId:62,shiftKey:true,clientX:500,clientY:200});h.fire('pointerup',h.document,{pointerId:62,shiftKey:true,clientX:500,clientY:200});
  h.fire('pointerdown',h.component(1),{pointerId:63,ctrlKey:true,clientX:200,clientY:200});h.fire('pointermove',h.document,{pointerId:63,clientX:300,clientY:300});
  h.fire('pointerup',h.document,{pointerId:63,clientX:300,clientY:300});assert.equal(h.scene().elements.length,4);assert.equal(h.scene().fiberLinks.length,2);
  h.click('delete');assert.equal(h.scene().elements.length,2);h.key('z');assert.equal(h.scene().elements.length,4);
});

test('normal group drag keeps relative positions, while a click collapses to one component', () => {
  const h=editorHarness();h.click('select-all');const before=h.scene();
  h.fire('pointerdown',h.component(2),{pointerId:71,clientX:550,clientY:400});h.fire('pointermove',h.document,{pointerId:71,clientX:610,clientY:430});
  h.fire('pointerup',h.document,{pointerId:71,clientX:610,clientY:430});const moved=h.scene();
  for(let i=0;i<4;i++){near(moved.elements[i].x-before.elements[i].x,60);near(moved.elements[i].y-before.elements[i].y,30);}
  h.fire('pointerdown',h.component(1),{pointerId:72,clientX:210,clientY:430});h.fire('pointerup',h.document,{pointerId:72,clientX:210,clientY:430});assert.deepEqual(h.selectedIds(),[1]);
});

test('a cancelled group drag restores every position and the former multi-selection', () => {
  const h=editorHarness();h.click('select-all');const before=h.scene(),ids=h.selectedIds();
  h.fire('pointerdown',h.component(2),{pointerId:73,clientX:550,clientY:400});
  h.fire('pointermove',h.document,{pointerId:73,clientX:620,clientY:445});assert.notDeepEqual(h.scene(),before);
  h.fire('pointercancel',h.document,{pointerId:73});assert.deepEqual(h.scene(),before);assert.deepEqual(h.selectedIds(),ids);
  assert.equal(h.get('undo').disabled,true);
});

test('a blocked group nudge preserves the redo branch and component spacing', async () => {
  const O=require('../optics-bench/optics.js'),h=editorHarness(),limit=O.COORDINATE_LIMIT;
  await h.load([h.element('laser',1,{x:limit-50,y:100}),h.element('mirror',2,{x:limit,y:140})]);
  h.click('select-all');h.click('rotate');const later=h.scene();h.get('bench').focus();h.key('z');const before=h.scene();
  h.key('ArrowRight',{ctrlKey:false});assert.deepEqual(h.scene(),before);assert.equal(h.get('redo').disabled,false);
  assert.match(h.get('status').textContent,/上限/);h.key('y');assert.deepEqual(h.scene(),later);
});

test('source bandwidth controls update the full-band summary, bounds, sample count and detected power', async () => {
  const scene=require('../optics-bench/presets.js').create('broadband-filter'), h=editorHarness();
  await h.load(scene.elements,{unit:'mm'}); h.select(1);
  const set=(key,value)=>{const input=h.get('param-'+key);input.value=String(value);h.fire('change',input);};
  assert.match(h.get('source-spectrum-summary').textContent,/400–700 nm.*9 × 波長 30 = 270 本/);
  near(h.result().detectedPower,.2); assert.equal(h.get('param-spectralSamples').disabled,false);
  assert.equal(Number(h.get('param-wavelength').min),350); assert.equal(Number(h.get('param-wavelengthWidth').max),700);
  set('wavelengthWidth',0); assert.equal(h.get('param-spectralSamples').disabled,true);
  near(h.result().detectedPower,1); assert.equal(h.result().rayCount,9);
  assert.equal(h.selected().spectralSamples,30); assert.match(h.get('source-spectrum-summary').textContent,/単色：550 nm/);
  set('wavelengthWidth',300); set('spectralSamples',3); near(h.result().detectedPower,1/3); near(h.result().sourcePower,1);
  h.get('bench').focus();h.key('z');near(h.result().detectedPower,.2);h.key('y');near(h.result().detectedPower,1/3);
  h.get('unit').value='in'; h.fire('change',h.get('unit'));
  assert.equal(h.get('param-wavelengthWidth').value,'300');
  assert.equal(h.get('param-wavelengthWidth').closest('label').querySelector('.unit-label').textContent,'nm');
});

test('invalid source bands and sample counts preserve the last valid scene and calculation', async () => {
  const h=editorHarness();await h.load([h.element('laser',1,{wavelength:550,wavelengthWidth:300})]);h.select(1);
  const before=h.scene(), result=h.result();
  for(const [key,value] of [['wavelength',300],['wavelengthWidth',701],['wavelengthWidth',-1],['spectralSamples',2],['spectralSamples',3.5]]) {
    const input=h.get('param-'+key);input.value=String(value);h.fire('change',input);
    assert.equal(input.getAttribute('aria-invalid'),'true'); assert.deepEqual(h.scene(),before); assert.deepEqual(h.result(),result);
  }
  const width=h.get('param-wavelengthWidth');width.value='20';h.fire('change',width);
  assert.equal(width.getAttribute('aria-invalid'),null);assert.match(h.get('source-spectrum-summary').textContent,/540–560 nm/);
});

test('source bandwidth is retained by clipboard, history and shared-link restoration', async () => {
  for(const type of ['laser','point','white']) {
    const h=editorHarness(), source=h.element(type,1,{wavelength:550.25,wavelengthWidth:300.5,spectralSamples:30});
    await h.load([source]);h.select(1);
    const copy=h.clipboard('copy').data.get('text/plain');assert.deepEqual(h.parseComponent(copy),source);
    h.clipboard('paste',copy);assert.equal(h.selected().wavelengthWidth,300.5);assert.equal(h.selected().spectralSamples,30);
    h.key('z');assert.equal(h.scene().elements.length,1);h.key('y');assert.equal(h.scene().elements.length,2);
    await h.click('share-copy').done;const recipient=editorHarness({href:h.get('share-url').value});await recipient.ready();
    assert.deepEqual(recipient.scene(),h.scene());recipient.select(1);
    assert.match(recipient.get('source-spectrum-summary').textContent,/400–700.5 nm/);
  }
});

test('spectral display merges only coincident samples and never modifies probe or physics records', () => {
  const O=require('../optics-bench/optics.js'), source={...O.createElement('laser',1,100,300),rayCount:5,wavelength:550,wavelengthWidth:300,spectralSamples:3};
  const result=O.simulate([source]), before=JSON.stringify(result.segments), displayed=V.displaySegments(result.segments);
  assert.equal(displayed.length,5);for(const s of displayed)near(s.power,.2);
  assert.equal(JSON.stringify(result.segments),before);assert.equal(result.segments.length,15);
  assert.match(displayed[0].color,/^rgb\(/);assert.notEqual(displayed[0].color,O.wavelengthColor(650));
  const reversed=V.displaySegments([...result.segments].reverse());
  assert.deepEqual(reversed.map(s=>s.color),displayed.map(s=>s.color));
  const next={...source,id:2};assert.equal(V.displaySegments(O.simulate([source,next]).segments).length,10);
  const shifted={...result.segments[0],a:{...result.segments[0].a,x:101}};
  assert.equal(V.displaySegments([...result.segments,shifted]).length,6);
  assert.equal(V.displaySegments(O.simulate([{...source,wavelengthWidth:0}]).segments).length,5);
  const S=require('../optics-bench/state.js'),{view,document}=drawingHarness();view.draw(S.defaultScene([source]),1,result);
  assert.equal(document.getElementById('elements').children[0].querySelector('.element-info').textContent,'400–700 nm');
  assert.match(V.spectrumSwatch(source),/^linear-gradient/);assert.equal(V.spectrumSwatch({...source,wavelengthWidth:0}),O.wavelengthColor(550));
});

test('a broadband probe selects individual wavelengths and clears stale selection when sampling changes', async () => {
  const h=editorHarness();await h.load([h.element('laser',1,{x:100,y:300,wavelength:550,wavelengthWidth:300,spectralSamples:3,rayCount:1}),h.element('screen',2,{x:900,y:300})]);
  probeClick(h,500,300);assert.equal(h.get('probe-overlap').children.length,3);
  const choice=h.get('probe-overlap');choice.value='1';h.fire('change',choice);
  assert.equal(h.get('probe-wavelength').textContent,'550 nm');near(h.probe().segment.power,1/3);
  h.select(1);const width=h.get('param-wavelengthWidth');width.value='0';h.fire('change',width);
  assert.equal(h.probe(),null);assert.match(h.get('probe-status').textContent,/見つかりません|未検出|ありません/);
  probeClick(h,500,300);assert.equal(h.get('probe-wavelength').textContent,'550 nm');near(h.probe().segment.power,1);
});

test('filter inspector switches relevant fields without losing focus and updates camera power with undo', async () => {
  const P = require('../optics-bench/presets.js'), h = editorHarness(), scene = P.create('spectral-filter');
  await h.load(scene.elements); h.select(4);
  const mode = h.get('param-filterMode'), received = () => h.result().detectors.find(d=>d.id===5).power;
  const set = (key,value) => { const input=h.get('param-'+key); input.value=String(value); h.fire('change',input); };
  assert.equal(h.get('param-bandLow').disabled,false); assert.equal(h.get('param-cutoff').disabled,true);
  mode.focus();
  for (const [filterMode,power] of [['longpass',1],['shortpass',2],['bandpass',1],['nd',.3]]) {
    set('filterMode',filterMode); near(received(),power);
    assert.equal(h.document.activeElement,mode); assert.equal(h.get('param-filterMode'),mode);
    for (const [key,modes] of [['bandLow',['bandpass']],['bandHigh',['bandpass']],['cutoff',['longpass','shortpass']],['opticalDensity',['nd']]]) {
      const input=h.get('param-'+key), hidden=!modes.includes(filterMode);
      assert.equal(input.closest('[data-filter-modes]').hidden,hidden); assert.equal(input.disabled,hidden);
    }
  }
  set('filterMode','bandpass'); set('transmission',.6); near(received(),.6);
  set('filterMode','nd'); near(received(),.3); assert.equal(h.get('param-transmission').disabled,true);
  set('opticalDensity',2); near(received(),.03); assert.match(h.get('filter-summary').textContent,/1%/);
  h.get('bench').focus(); h.key('z'); near(received(),.3); h.key('y'); near(received(),.03);
  set('filterMode','bandpass'); near(received(),.6); assert.equal(h.selected().opticalDensity,2);
  h.click('new-scene'); h.add('filter'); assert.equal(h.selected().type,'filter'); assert.equal(h.selected().transmission,1);
});

test('filter invalid bands preserve the calculation and hidden fields reset safely on a mode change', async () => {
  const h=editorHarness(); await h.load([h.element('filter',1)],{unit:'mm'}); h.select(1);
  const before=h.scene(), result=h.result(), low=h.get('param-bandLow');
  low.focus(); low.value='600'; h.fire('change',low);
  assert.equal(low.getAttribute('aria-invalid'),'true'); assert.deepEqual(h.scene(),before); assert.deepEqual(h.result(),result);
  const mode=h.get('param-filterMode'); mode.focus(); mode.value='nd'; h.fire('change',mode);
  assert.equal(low.getAttribute('aria-invalid'),null); assert.equal(low.disabled,true); assert.equal(low.value,'500');
  assert.equal(h.get('input-error').textContent,'');
  const od=h.get('param-opticalDensity'); od.value='-1'; h.fire('change',od);
  assert.equal(od.getAttribute('aria-invalid'),'true'); assert.equal(h.selected().opticalDensity,1);
  od.value='1.25'; h.fire('change',od); assert.equal(od.getAttribute('aria-invalid'),null);
  h.get('unit').value='in'; h.fire('change',h.get('unit'));
  assert.equal(h.selected().bandLow,500); assert.equal(h.selected().bandHigh,560); assert.equal(h.get('param-opticalDensity').value,'1.25');
  h.get('param-filterMode').value='bandpass'; h.fire('change',h.get('param-filterMode'));
  assert.equal(h.get('param-bandLow').value,'500'); assert.equal(h.get('param-bandLow').closest('label').querySelector('.unit-label').textContent,'nm');
});

test('filter clipboard, history and shared-link restoration retain custom spectral and ND settings', async () => {
  const h=editorHarness(), filter=h.element('filter',1,{filterMode:'nd',opticalDensity:1.234,bandLow:450.125,bandHigh:650.5,transmission:.8});
  await h.load([filter]); h.select(1);
  const copy=h.clipboard('copy').data.get('text/plain'); assert.deepEqual(h.parseComponent(copy),filter);
  h.clipboard('paste',copy); assert.equal(h.scene().elements.length,2); assert.equal(h.selected().opticalDensity,1.234);
  h.key('z'); assert.equal(h.scene().elements.length,1); h.key('y'); assert.equal(h.selected().bandLow,450.125);
  await h.click('share-copy').done;
  const recipient=editorHarness({href:h.get('share-url').value}); await recipient.ready(); assert.deepEqual(recipient.scene(),h.scene());
  recipient.select(1); assert.match(recipient.get('filter-summary').textContent,/全波長/);
});

test('filter SVG distinguishes spectral modes from ND and shows the configured wavelengths', () => {
  const O=require('../optics-bench/optics.js'), S=require('../optics-bench/state.js'), {view,document}=drawingHarness();
  const filter={...O.createElement('filter',1,400,300),angle:22.5}, scene=S.defaultScene([filter]);
  for (const [mode,info] of [['bandpass','BP 500–560 nm'],['longpass','LP 600 nm'],['shortpass','SP 600 nm'],['nd','ND · OD 1']]) {
    scene.elements[0].filterMode=mode; view.draw(scene,1,O.simulate(scene.elements));
    const component=document.getElementById('elements').children[0];
    assert.equal(component.querySelector('.element-info').textContent,info);
    assert.ok(component.querySelectorAll('text').some(n=>n.textContent==='F'));
    assert.ok(component.querySelectorAll('rect').some(n=>n.getAttribute('fill')===(mode==='nd'?'#5d686b':'#356b64')));
  }
  const demo=require('../optics-bench/presets.js').create('spectral-filter'); view.draw(demo,4,O.simulate(demo.elements));
  for (const wavelength of [450,532,650]) {
    const labels=document.getElementById('elements').querySelectorAll('text').filter(n=>n.textContent===wavelength+' nm');
    assert.equal(labels.length,1,'source labels do not duplicate the visible wavelength');
  }
});

test('fluorescent inspector controls real converted power, wavelength, undo and detector readouts', async () => {
  const h=editorHarness();
  await h.load([
    h.element('laser',1,{x:100,y:300,wavelength:405,beamWidth:0,rayCount:1}),
    h.element('fluorescent',2,{x:400,y:300,cutoff:450,wavelength:600,transmission:.6,rayCount:1,divergence:1}),
    h.element('camera',3,{x:700,y:300,aperture:100,autoExposure:false})
  ]);
  h.select(2);const camera=()=>h.result().detectors.find(d=>d.id===3),plate=()=>h.result().detectors.find(d=>d.id===2);
  near(camera().power,.6);near(plate().emittedPower,.6);
  assert.equal(h.get('param-wavelength').min,'450');assert.equal(h.get('param-cutoff').max,'600');
  assert.match(h.get('hint-angle').textContent,/発光扇形.*360°/);
  assert.match(h.get('selected-output').textContent,/励起 P = 1.*蛍光 P = 0.6.*600 nm・無偏光/);
  const efficiency=h.get('param-transmission');efficiency.value='.5';h.fire('change',efficiency);near(camera().power,.5);
  h.get('bench').focus();h.key('z');near(camera().power,.6);
  h.select(2);const cutoff=h.get('param-cutoff');cutoff.value='400';h.fire('change',cutoff);near(camera().power,0);
  h.get('bench').focus();h.key('z');near(camera().power,.6);
  h.select(2);const wavelength=h.get('param-wavelength');wavelength.value='620';h.fire('change',wavelength);
  assert.deepEqual(Object.keys(camera().powerByWavelength),['620']);assert.match(h.get('selected-output').textContent,/620 nm・無偏光/);
});

test('fluorescent SVG has a distinct glowing plate and displays its conversion settings', () => {
  const O=require('../optics-bench/optics.js'),S=require('../optics-bench/state.js'),{view,document}=drawingHarness();
  const plate={...O.createElement('fluorescent',1,400,300),cutoff:450,wavelength:600,transmission:.6};
  const scene=S.defaultScene([plate]);view.draw(scene,1,O.simulate(scene.elements));
  const component=document.getElementById('elements').children[0];
  assert.ok(component.querySelector('[data-fluorescent-plate]'));
  assert.equal(component.querySelector('.element-info').textContent,'≤450→600 nm · η 60%');
  assert.ok(component.querySelectorAll('text').some(node=>node.textContent==='✺'));
});

test('concave focal and radius edits stay linked through units, undo, redo and component copying', async () => {
  const h = editorHarness(); await h.load([h.element('concave', 7)], { unit: 'mm' }); h.select(7);
  assert.equal(h.get('param-focal').value, '100'); assert.equal(h.get('param-radius').value, '200');
  const radius = h.get('param-radius'); radius.value = '500'; h.fire('change', radius);
  assert.equal(h.selected().focal, 250); assert.equal(h.get('param-focal').value, '250');
  assert.equal(Object.hasOwn(h.selected(), 'radius'), false);
  h.key('z'); assert.equal(h.selected().focal, 100); assert.equal(h.get('param-radius').value, '200');
  h.key('y'); assert.equal(h.get('param-radius').value, '500');
  h.get('unit').value = 'in'; h.fire('change', h.get('unit'));
  near(Number(h.get('param-radius').value), 500 / 25.4, 1e-7);
  h.get('param-focal').value = '10'; h.fire('change', h.get('param-focal'));
  near(h.selected().focal, 254); near(Number(h.get('param-radius').value), 20);
  const copy = h.clipboard('copy').data.get('text/plain'); near(h.parseComponent(copy).focal, 254);
  h.clipboard('paste', copy); assert.equal(h.scene().elements.length, 2); near(h.selected().focal, 254);
  assert.equal(h.get('param-radius').value, '20'); h.key('z'); assert.equal(h.scene().elements.length, 1);
  h.get('unit').value = 'cm'; h.fire('change', h.get('unit')); near(Number(h.get('param-radius').value), 50.8);
});

test('camera view follows real lens and sensor edits, persists while another part is selected, and undoes defocus', async () => {
  const P = require('../optics-bench/presets.js'), h = editorHarness(); await h.load(P.create('camera-imaging').elements, { unit:'mm' });
  assert.equal(h.get('camera-panel').hidden, false); assert.equal(h.get('camera-select').value, '5');
  assert.match(h.get('camera-stats').textContent, /受光P 3 · 183本 · 256×192画素/);
  assert.match(decodeURIComponent(h.get('camera-image').src), /2D SENSOR/);
  const focused = h.get('camera-image').src;
  h.select(5); h.get('param-x').value = '1400'; h.fire('change', h.get('param-x'));
  assert.notEqual(h.get('camera-image').src, focused); assert.match(h.get('camera-stats').textContent, /受光P 3/);
  h.key('z'); assert.equal(h.get('camera-image').src, focused);
  h.select(4); h.get('param-focal').value = '400'; h.fire('change', h.get('param-focal'));
  assert.notEqual(h.get('camera-image').src, focused); assert.equal(h.get('camera-select').value, '5');
  h.key('z'); assert.equal(h.get('camera-image').src, focused);
  h.get('unit').value='cm'; h.fire('change',h.get('unit'));
  assert.match(decodeURIComponent(h.get('camera-image').src), /-15 cm/);
  assert.match(h.get('camera-stats').textContent, /受光P 3/);
});

test('camera inspector edits a 2D sensor, rejects invalid resolution and preserves settings through undo and copy', async () => {
  const h = editorHarness(); await h.load([h.element('laser',1,{x:100,y:300}),h.element('camera',2,{x:500,y:300})],{unit:'mm'}); h.select(2);
  const cameraPath=()=>h.get('spatial-view').querySelector('[data-spatial-element-id="2"]').querySelector('path').getAttribute('d'), initialCameraPath=cameraPath();
  const pixels = h.get('param-pixelCount'); pixels.value='16.5'; h.fire('change',pixels);
  assert.equal(pixels.getAttribute('aria-invalid'),'true'); assert.equal(h.selected().pixelCount,256);
  pixels.value='64'; h.fire('change',pixels); assert.equal(pixels.hasAttribute('aria-invalid'),false);
  const rows=h.get('param-pixelRows'); rows.value='48'; h.fire('change',rows); assert.equal(h.selected().pixelRows,48);
  const height=h.get('param-sensorHeight'); height.value='12'; h.fire('change',height); assert.equal(h.selected().sensorHeight,12); assert.notEqual(cameraPath(),initialCameraPath);
  const spot=h.get('param-spotSize'); spot.value='2'; h.fire('change',spot); assert.equal(h.selected().spotSize,2);
  assert.match(h.get('camera-stats').textContent,/64×48画素 · センサー 24×12 mm · XY表示倍率 1:1/);
  const raw = h.result(); const auto=h.get('param-autoExposure'); auto.checked=false; h.fire('change',auto);
  h.get('param-exposure').value='3'; h.fire('change',h.get('param-exposure'));
  assert.deepEqual(h.result(),raw); assert.match(h.get('camera-status').textContent,/明るさ固定/);
  const copy=h.parseComponent(h.clipboard('copy').data.get('text/plain'));
  assert.equal(copy.pixelCount,64); assert.equal(copy.pixelRows,48); assert.equal(copy.sensorHeight,12); assert.equal(copy.spotSize,2);
  assert.equal(copy.exposure,3); assert.equal(copy.autoExposure,false);
  h.key('z'); assert.equal(h.selected().exposure,1);
  h.key('z'); assert.equal(h.selected().autoExposure,true);
});

test('screen image controls drive a real paraxial 2D camera preview and can return to detector-only mode', async () => {
  const P=require('../optics-bench/presets.js'),h=editorHarness(); await h.load(P.create('duck-camera').elements,{unit:'mm'}); h.select(1);
  assert.equal(h.get('param-screenPattern').value,'duck'); assert.equal(h.get('param-screenHeight').disabled,false);
  assert.equal(h.get('param-power').disabled,false); assert.match(h.get('selected-output').textContent,/83画点 × 9本/);
  assert.match(h.get('camera-stats').textContent,/受光P 1 · 747本/);
  assert.match(decodeURIComponent(h.get('camera-image').src),/Y: paraxial image/);
  assert.match(h.get('camera-status').textContent,/縦像位置を近軸追跡/);
  const screenPath=()=>h.get('spatial-view').querySelector('[data-spatial-element-id="1"]').querySelector('path').getAttribute('d');
  const initialPath=screenPath(),height=h.get('param-screenHeight'); height.value='60'; h.fire('change',height);
  assert.equal(h.selected().screenHeight,60); assert.notEqual(screenPath(),initialPath);
  const pattern=h.get('param-screenPattern');assert.ok(pattern.children.some(option=>option.value==='doll'&&/人形/.test(option.textContent)));
  pattern.value='doll';h.fire('change',pattern);assert.equal(h.selected().screenPattern,'doll');assert.match(h.get('selected-output').textContent,/60画点 × 9本/);
  assert.match(h.get('camera-stats').textContent,/受光P 1 · 540本/);
  assert.match(h.get('spatial-view').querySelector('[data-spatial-element-id="1"]').textContent,/人/);
  pattern.value='none'; h.fire('change',pattern);
  assert.equal(h.selected().screenPattern,'none'); assert.equal(h.get('param-screenHeight').disabled,true); assert.equal(h.get('param-power').disabled,true);
  assert.match(h.get('camera-stats').textContent,/受光P 0 · 0本/);
  h.get('bench').focus(); h.key('z'); assert.equal(h.selected().screenPattern,'doll'); assert.match(h.get('camera-stats').textContent,/受光P 1/);
  const copy=h.parseComponent(h.clipboard('copy').data.get('text/plain'));
  assert.equal(copy.screenPattern,'doll'); assert.equal(copy.screenHeight,60);
});

test('multiple cameras can be switched, disabled and deleted without retaining the previous image', async () => {
  const h=editorHarness(); await h.load([
    h.element('laser',1,{x:100,y:200}),h.element('camera',2,{x:500,y:200}),
    h.element('laser',3,{x:100,y:400,power:2,wavelength:450}),h.element('camera',4,{x:500,y:400})
  ]);
  h.get('camera-select').value='4'; h.fire('change',h.get('camera-select'));
  assert.equal(h.selectedId(),4); assert.match(h.get('camera-stats').textContent,/受光P 2/);
  const enabled=h.get('param-enabled'); enabled.checked=false; h.fire('change',enabled);
  assert.match(h.get('camera-status').textContent,/OFF/); assert.match(h.get('camera-stats').textContent,/受光P 0/);
  h.click('delete'); assert.equal(h.get('camera-select').value,'2'); assert.match(h.get('camera-stats').textContent,/受光P 1/);
  h.select(2); h.click('delete'); assert.equal(h.get('camera-panel').hidden,true);
  h.key('z'); assert.equal(h.get('camera-panel').hidden,false); assert.equal(h.get('camera-select').value,'2');
  h.click('new-scene'); h.add('camera'); assert.equal(h.selected().type,'camera'); assert.match(h.get('camera-status').textContent,/光が届いていません/);
});

test('concave invalid radius, focal and aperture input retains the previous calculation and can be repaired', async () => {
  const h = editorHarness(); await h.load([h.element('concave', 7)], { unit: 'mm' }); h.select(7);
  for (const [key, value] of [['radius', '40'], ['focal', '-100'], ['aperture', '301']]) {
    const before = h.scene(), input = h.get('param-' + key); input.value = value; h.fire('change', input);
    assert.deepEqual(h.scene(), before); assert.equal(input.getAttribute('aria-invalid'), 'true');
    input.value = key === 'radius' ? '200' : '100'; h.fire('change', input);
    assert.equal(input.hasAttribute('aria-invalid'), false);
  }
  assert.equal(h.get('input-error').textContent, '');
  assert.equal(h.get('param-focal').min, '1'); assert.equal(h.get('param-radius').max, '2000');
  h.add('concave'); assert.equal(h.selected().type, 'concave'); assert.equal(h.scene().elements.length, 2);
});

test('concave drawing, interaction bounds and focus guides follow the actual spherical sag and rotation', () => {
  const O = require('../optics-bench/optics.js'), S = require('../optics-bench/state.js');
  const { document, view } = drawingHarness();
  const mirror = { ...O.createElement('concave', 7, -500, 300), focal: 50, aperture: 199, angle: 22.5 };
  const scene = S.defaultScene([mirror]), arc = O.concaveGeometry(mirror);
  view.draw(scene, 7, O.simulate(scene.elements));
  const node = document.getElementById('elements').children[0], curve = node.querySelector('[data-concave-surface]');
  assert.ok(curve); assert.equal(curve.getAttribute('d'), `M ${-arc.sag} -99.5 A 100 100 0 0 1 ${-arc.sag} 99.5`);
  assert.equal(node.children[0].getAttribute('transform'), 'rotate(22.5)');
  const hit = node.querySelector('.element-hit'); assert.ok(Number(hit.getAttribute('x')) < -arc.sag);
  const guides = document.getElementById('guides'), texts = guides.querySelectorAll('text');
  assert.deepEqual(texts.map(n => n.textContent), ['F', 'C']);
  const fit = V.fitView([mirror], { width: 375, height: 600 });
  for (const p of [arc.a, arc.b, mirror]) {
    assert.ok(p.x > fit.x && p.x < fit.x + fit.width && p.y > fit.y && p.y < fit.y + fit.height);
  }
  scene.elements[0].focal = 100; view.draw(scene, 7, O.simulate(scene.elements));
  assert.match(document.getElementById('elements').querySelector('[data-concave-surface]').getAttribute('d'), /A 200 200/);
});

test('flat mirror drawing and dragging use the reflective surface centre as the grid anchor', async () => {
  const O = require('../optics-bench/optics.js'), S = require('../optics-bench/state.js');
  const { document, view } = drawingHarness();
  const mirror = { ...O.createElement('mirror', 7, 130, 250), x: 130, y: 250, angle: 45, aperture: 25, label: '片面ミラー' };
  const scene = S.defaultScene([mirror]); view.draw(scene, 7, O.simulate(scene.elements));
  const node = document.getElementById('elements').children[0], body = node.children[0];
  assert.equal(node.getAttribute('transform'), 'translate(130 250)');
  assert.equal(body.getAttribute('transform'), 'rotate(45)');
  const surface = body.querySelector('[data-mirror-surface="front"]');
  assert.deepEqual(['x1','x2','y1','y2'].map(key => Number(surface.getAttribute(key))), [0,0,-12.5,12.5]);
  const backing = body.querySelector('[data-mirror-backing]');
  assert.deepEqual(['x','y','width','height'].map(key => Number(backing.getAttribute(key))), [0,-12.5,8,25]);
  const snap = body.querySelector('[data-snap-center]');
  assert.deepEqual([Number(snap.getAttribute('cx')),Number(snap.getAttribute('cy'))], [0,0]);
  assert.equal(node.querySelector('.element-info').textContent, '表 225°側');
  assert.match(node.getAttribute('aria-label'), /X 130、Y 250 mm.*反射面は 225 度側/);
  view.preview(mirror); assert.ok(document.getElementById('placement').querySelector('[data-mirror-surface="front"]'));

  const h = editorHarness(); await h.load([h.element('mirror', 7, { x: 130, y: 250, angle: 45, aperture: 25 })], { gridStep: 10, snap: true });
  h.select(7);
  assert.match(h.get('hint-angle').textContent, /反射面から裏面へ向かう法線.*裏面入射は吸収/);
  assert.match(h.get('hint-aperture').textContent, /X\/Y座標は反射面の中心.*グリッド交点/);
  h.fire('pointerdown', h.component(7), { pointerId: 77, clientX: 130, clientY: 250 });
  h.fire('pointermove', h.document, { pointerId: 77, clientX: 147, clientY: 278 });
  h.fire('pointerup', h.document, { pointerId: 77, clientX: 147, clientY: 278 });
  assert.deepEqual({ x: h.selected().x, y: h.selected().y }, { x: 150, y: 280 });
});

test('drag copies preserve complete component records for all twenty-two optical types', async () => {
  const types = Object.keys(require('../optics-bench/optics.js').TYPES), h = editorHarness();
  assert.equal(types.length, 22);
  for (const [index, type] of types.entries()) {
    const source = h.element(type, 31, { angle: 21.3, enabled: false, label: index % 2 ? type + ' component' : '' });
    if (type === 'filter') Object.assign(source,{filterMode:'nd',opticalDensity:1.23,bandLow:450,bandHigh:650,transmission:.7});
    if (['laser','point','white'].includes(type)) Object.assign(source,{wavelength:550,wavelengthWidth:300,spectralSamples:30});
    await h.load([source], { unit: 'mm', snap: false });
    const before = h.scene();
    h.fire('pointerdown', h.component(source.id), { pointerId: 23, ctrlKey: true, clientX: source.x + 5, clientY: source.y - 8 });
    h.fire('pointermove', h.document, { pointerId: 23, ctrlKey: true, clientX: source.x + 105, clientY: source.y + 72 });
    assert.deepEqual(h.preview(), { ...source, x: source.x + 100, y: source.y + 80 }, type);
    h.windowEvent('resize'); assert.deepEqual(h.scene(), before, type);
    h.fire('pointerup', h.document, { pointerId: 23, ctrlKey: true, clientX: source.x + 105, clientY: source.y + 72 });
    assert.equal(h.scene().elements.length, 2, type);
    assert.notEqual(h.selectedId(), source.id, type);
    assert.deepEqual({ ...h.selected(), id: source.id }, { ...source, x: source.x + 100, y: source.y + 80 }, type);
    assert.deepEqual(h.scene().elements[0], source, type);
  }
});

test('copy release rechecks the component cap after another action fills the last slot', async () => {
  const h = editorHarness();
  await h.load(Array.from({ length: 79 }, (_, i) => h.element('blocker', i + 1, { x: 50 + i % 16 * 50, y: 50 + Math.floor(i / 16) * 100 })));
  const before = h.scene(), source = h.selected();
  h.fire('pointerdown', h.component(source.id), { pointerId: 24, ctrlKey: true, clientX: source.x, clientY: source.y });
  h.fire('pointermove', h.document, { pointerId: 24, ctrlKey: true, clientX: source.x + 100, clientY: source.y + 80 });
  assert.ok(h.preview());
  // A separate button action can occur while pointer capture is still active.
  h.click('duplicate'); const full = h.scene(); assert.equal(full.elements.length, 80);
  h.fire('pointerup', h.document, { pointerId: 24, ctrlKey: true, clientX: source.x + 100, clientY: source.y + 80 });
  h.windowEvent('resize'); assert.deepEqual(h.scene(), full);
  assert.equal(h.preview(), null); assert.equal(h.get('bench').hasPointerCapture(24), false);
  assert.deepEqual(h.scene().elements[0], source);
  h.key('z'); assert.deepEqual(h.scene(), before);
  h.key('y'); assert.deepEqual(h.scene(), full);
});

function spatialHarness() {
  const document=new EditorNode('#document');document.ownerDocument=document;
  document.createElementNS=(_,tag)=>new EditorNode(tag,document);
  const svg=document.createElementNS('','svg');svg.id='spatial-view';document.append(svg);
  let selectedId=null;const view=D.create(svg,id=>{selectedId=id;});
  return {document,svg,view,selected:()=>selectedId};
}

function drawingHarness() {
  const document = new EditorNode('#document'); document.ownerDocument = document;
  document.createElementNS = (_, tag) => new EditorNode(tag, document);
  document.getElementById = id => document.querySelector('[id="' + id + '"]');
  const bench = document.createElementNS('', 'svg'); bench.id = 'bench'; document.append(bench);
  for (const id of ['minor-grid', 'major-grid', 'minor-grid-path', 'major-grid-path', 'major-grid-fill', 'rulers',
    'elements', 'rays', 'ray-probe', 'guides', 'fiber-links', 'zoom-level', 'grid-readout', 'selection-marquee', 'placement', 'table-background', 'table-clip-rect']) {
    const node = document.createElementNS('', 'g'); node.id = id; bench.append(node);
  }
  return { document, bench, view: V.create(bench) };
}

test('fit includes remote rotated bodies, disabled components and fiber control points at desktop and mobile aspect ratios', () => {
  const O = require('../optics-bench/optics.js');
  const elements = [
    { ...O.createElement('lens', 1, -30000, -20000), aperture: 300, angle: 22.5 },
    { ...O.createElement('laser', 2, 50000, 30000), beamWidth: 200, angle: 90, enabled: false },
    { ...O.createElement('fiber', 3, -30100, -20000), angle: 180 },
    { ...O.createElement('fiber', 4, 50100, 30000), angle: 0 }
  ];
  for (const size of [{ width: 800, height: 530 }, { width: 350, height: 240 }]) {
    const fit = V.fitView(elements, size, [{ a: 3, b: 4 }]);
    near(fit.width / fit.height, size.width / size.height);
    const inside = p => assert.ok(p.x > fit.x && p.x < fit.x + fit.width && p.y > fit.y && p.y < fit.y + fit.height);
    for (const e of elements) {
      const b = O.elementBounds([e]); inside({ x: b.x, y: b.y }); inside({ x: b.x + b.width, y: b.y + b.height });
    }
    V.fiberCablePoints(elements[2], elements[3]).forEach(inside);
  }
  const extremes = [{ ...elements[0], x: 0, y: -O.COORDINATE_LIMIT }, { ...elements[1], x: 0, y: O.COORDINATE_LIMIT }];
  const wide = V.fitView(extremes, { width: 1000, height: 100 });
  const zoomed = V.zoomAt(wide, .8, { x: wide.x + wide.width / 2, y: wide.y + wide.height / 2 });
  assert.ok(zoomed.width >= wide.width, 'Zooming out after fitting safe coordinates must never zoom in.');
});

test('fit uses components rather than escaping rays and empty designs return to the default view', () => {
  const O = require('../optics-bench/optics.js'), S = require('../optics-bench/state.js');
  const { bench, view } = drawingHarness(); bench.getBoundingClientRect = () => ({ width: 800, height: 500, left: 0, top: 0, right: 800, bottom: 500 });
  const scene = S.defaultScene([O.createElement('laser', 1, 50000, -20000)]);
  const result = O.simulate(scene.elements, { viewBounds: { x: 1e8, y: 0, width: 1e6, height: 1e6 } });
  view.draw(scene, 1, result); view.fit(); const fit = view.getView();
  near(fit.x + fit.width / 2, 50000); near(fit.y + fit.height / 2, -20000);
  assert.ok(fit.width < 1000); assert.ok(fit.height < 1000);
  view.fit([]); assert.deepEqual(view.getView(), V.BASE_VIEW);
});

test('position editing accepts remote negative millimetres and fitting preserves undo and redo', async () => {
  const h = editorHarness();
  await h.load([h.element('laser', 1, { x: 100, y: 300 }), h.element('screen', 2, { x: 800, y: 300 })], { unit: 'mm' });
  for (const [id, x, y] of [[1, -2500, -800], [2, 4000, -800]]) {
    h.select(id);
    for (const [key, value] of [['x', x], ['y', y]]) {
      const field = h.get('param-' + key); field.value = String(value); h.fire('input', field); h.fire('change', field);
      assert.notEqual(field.getAttribute('aria-invalid'), 'true');
    }
  }
  const complete = h.scene(); near(h.result().detectedPower, 1);
  h.click('fit'); const fit = h.viewport();
  for (const e of complete.elements) assert.ok(e.x > fit.x && e.x < fit.x + fit.width && e.y > fit.y && e.y < fit.y + fit.height);
  h.get('bench').focus(); h.key('z'); const undone = h.scene(); assert.notDeepEqual(undone, complete);
  h.click('fit'); assert.deepEqual(h.scene(), undone); assert.equal(h.get('redo').disabled, false);
  h.key('y'); assert.deepEqual(h.scene(), complete); near(h.result().detectedPower, 1);
});

test('scene replacement fits the newly imported components rather than the previous drawing cache', async () => {
  const h = editorHarness(); await h.load([h.element('lens', 1, { x: -50000, y: -80000 })]);
  near(h.viewport().x + h.viewport().width / 2, -50000);
  await h.load([h.element('mirror', 1, { x: 90000, y: 40000 }), h.element('lens', 2, { x: 92000, y: 42000 })]);
  const expected = V.fitView(h.scene().elements, { width: 1000, height: 600 }); nearView(h.viewport(), expected);
  h.click('new-scene'); h.click('fit'); assert.deepEqual(h.viewport(), V.BASE_VIEW);
});

test('the grid fills a faraway viewport with bounded visible tick counts and signed labels', () => {
  const O = require('../optics-bench/optics.js'), S = require('../optics-bench/state.js');
  const { bench, document, view } = drawingHarness(); bench.getBoundingClientRect = () => ({ width: 800, height: 400, left: 0, top: 0, right: 800, bottom: 400 });
  const scene = S.defaultScene([]); view.draw(scene, null, O.simulate([]));
  for (const x of [-1e8, 1e8]) {
    view.setView({ x, y: x, width: 40000, height: 20000 });
    const visible = view.visibleBounds(), background = document.getElementById('table-background'), clip = document.getElementById('table-clip-rect');
    for (const key of ['x', 'y', 'width', 'height']) {
      near(Number(background.getAttribute(key)), visible[key]); assert.equal(clip.getAttribute(key), background.getAttribute(key));
    }
    const labels = document.getElementById('rulers').querySelectorAll('text');
    assert.ok(labels.length > 3 && labels.length < 40); assert.ok(labels.some(n => x < 0 ? n.textContent.startsWith('-') : !n.textContent.startsWith('-')));
  }
  view.setView({ x: -2e9, y: -1e9, width: V.MAX_VIEW_WIDTH, height: V.MAX_VIEW_WIDTH / 2 });
  assert.ok(document.getElementById('rulers').children.length < 40);
});

test('drop eligibility uses the visible viewport even when its coordinates are outside the old table', () => {
  const { bench, view } = drawingHarness();
  bench.getBoundingClientRect = () => ({ left: 20, top: 40, right: 820, bottom: 440, width: 800, height: 400 });
  bench.createSVGPoint = () => ({ x: 0, y: 0, matrixTransform: function () { return { x: this.x - 100000, y: this.y + 100000 }; } });
  bench.getScreenCTM = () => ({ inverse: () => ({}) });
  assert.equal(view.inside({ clientX: 400, clientY: 200 }), true);
  for (const event of [{ clientX: 19, clientY: 200 }, { clientX: 821, clientY: 200 }, { clientX: 400, clientY: 39 }, { clientX: 400, clientY: 441 }]) assert.equal(view.inside(event), false);
});

test('panning and zooming extend escaping rays without moving a selected probe in physical coordinates', async () => {
  const h = editorHarness(); await h.load([h.element('laser', 1, { x: 100, y: 300, rayCount: 1 })]);
  probeClick(h, 200, 300); const label = h.get('probe-position').textContent, key = h.probe().segment.key;
  for (let i = 0; i < 15; i++) h.click('zoom-out');
  assert.equal(h.get('probe-position').textContent, label); assert.equal(h.probe().segment.key, key);
  assert.ok(h.probe().segment.b.x > 1000);
  h.fire('pointerdown', h.get('bench'), { clientX: 500, clientY: 300 });
  h.fire('pointerup', h.document, { clientX: 200, clientY: 200 });
  assert.equal(h.get('probe-position').textContent, label);
});

test('ray picking projects onto finite segments, ranks proximity and keeps crossing and reverse rays separate', () => {
  const segments = [
    { a: { x: 0, y: 100 }, b: { x: 100, y: 100 } },
    { a: { x: 50, y: 50 }, b: { x: 50, y: 150 }, center: true },
    { a: { x: 100, y: 100 }, b: { x: 0, y: 100 } },
    { a: { x: 50, y: 100 }, b: { x: 50, y: 100 } }
  ];
  const hits = V.pickSegments(segments, { x: 50, y: 100 }, 6);
  assert.deepEqual(hits.map(h => h.index), [1, 0, 2]);
  hits.forEach(hit => near(hit.t, .5));
  assert.equal(V.pickSegments(segments, { x: 75, y: 107 }, 6).length, 0);
  assert.equal(V.pickSegments(segments, { x: 103, y: 104 }, 6).length, 2);
  near(V.pickSegments(segments, { x: 103, y: 104 }, 6)[0].t, 1);
  assert.equal(V.pickSegments(segments, { x: 107, y: 100 }, 6).length, 0);
});

test('polarization summaries distinguish linear, circular, elliptical, partial and undefined states', () => {
  assert.equal(V.polarizationState({ I: 0, Q: 0, U: 0, V: 0 }), null);
  assert.equal(V.polarizationState({ I: 1, Q: NaN, U: 0, V: 0 }), null);
  const unpolarized = V.polarizationState({ I: 1, Q: 0, U: 0, V: 0 });
  assert.equal(unpolarized.kind, 'unpolarized'); assert.equal(unpolarized.azimuth, null); assert.equal(unpolarized.ellipticity, null);
  for (const angle of [0, 22.5, 45, 90, 135, 179]) {
    const a = angle * Math.PI / 90, p = V.polarizationState({ I: 1, Q: Math.cos(a), U: Math.sin(a), V: 0 });
    assert.equal(p.kind, 'linear'); near(p.azimuth, angle); near(p.degree, 1); near(p.ellipticity, 0);
  }
  for (const sign of [-1, 1]) {
    const p = V.polarizationState({ I: 1e-15, Q: 0, U: 0, V: sign * 1e-15 });
    assert.equal(p.kind, 'circular'); assert.equal(p.azimuth, null); near(p.ellipticity, sign * 45);
  }
  // A 30-degree ellipse at 45-degree azimuth, with a 50% unpolarized fraction.
  const p = V.polarizationState({ I: 2, Q: 0, U: .5, V: Math.sqrt(3) / 2 });
  assert.equal(p.kind, 'elliptical'); near(p.azimuth, 45); near(p.ellipticity, 30); near(p.degree, .5);
});

function probeClick(h, x, y, end = {}) {
  h.fire('pointerdown', h.get('bench'), { clientX: x, clientY: y });
  h.fire('pointerup', h.document, { clientX: x, clientY: y, ...end });
}

test('clicking PBS input and outputs inspects local Stokes and per-ray power without changing the design or undo history', () => {
  const h = editorHarness(), starter = h.scene(); h.get('preset').value = 'polarizing-splitter'; h.click('load-preset');
  const before = h.scene(), selected = h.selectedId(), undo = h.get('undo').disabled;
  probeClick(h, 300, 350);
  assert.equal(h.get('ray-inspector').hidden, false); assert.equal(h.selectedId(), selected);
  near(h.probe().segment.stokes.U / h.probe().segment.power, 1);
  assert.equal(h.get('probe-wavelength').textContent, '532 nm');
  assert.equal(h.get('probe-polarization-name').textContent, '直線偏光');
  assert.match(h.get('probe-angles').textContent, /ψ 45°/);
  near(h.probe().segment.power, 1 / 17); assert.equal(h.get('probe-power').textContent, '0.05882');
  probeClick(h, 650, 350); near(h.probe().segment.stokes.Q / h.probe().segment.power, -1);
  assert.match(h.get('probe-angles').textContent, /ψ 90°/); near(h.probe().segment.power, .5 / 17);
  probeClick(h, 500, 240); near(h.probe().segment.stokes.Q / h.probe().segment.power, 1);
  assert.match(h.get('probe-direction').textContent, /^270°/);
  assert.deepEqual(h.scene(), before); assert.equal(h.get('undo').disabled, undo);
  h.key('z'); assert.equal(h.get('ray-inspector').hidden, true); assert.deepEqual(h.scene(), starter);
});

test('the probe follows a stable optical interval through parameter edits and clears stale readouts when it disappears', () => {
  const h = editorHarness(); h.get('preset').value = 'polarizing-splitter'; h.click('load-preset');
  probeClick(h, 500, 240); const key = h.probe().segment.key;
  h.select(1); const field = h.get('param-polAngle'); field.value = '0'; h.fire('input', field);
  assert.equal(h.probe().segment.key, key); near(h.probe().segment.power, 1 / 17);
  const wave = h.get('param-wavelength'); wave.value = '450'; h.fire('input', wave);
  assert.equal(h.get('probe-wavelength').textContent, '450 nm');
  field.value = '90'; h.fire('input', field);
  assert.equal(h.probe(), null); assert.equal(h.get('probe-data').hidden, true);
  assert.match(h.get('probe-status').textContent, /見つかりません/);
  field.value = '45'; h.fire('input', field);
  assert.equal(h.probe().segment.key, key); assert.equal(h.get('probe-data').hidden, false);
});

test('waveplate and polarizer interval probes show circular, unpolarized and analyzed states separately', async () => {
  const h = editorHarness();
  await h.load([
    h.element('laser', 1, { x: 100, y: 300, rayCount: 1, polarization: 'linear', polAngle: 45, wavelength: 532 }),
    h.element('waveplate', 2, { x: 400, y: 300, angle: 0, axisAngle: 0, designWavelength: 532 }),
    h.element('polarizer', 3, { x: 700, y: 300, angle: 0, axisAngle: 90 })
  ]);
  probeClick(h, 550, 300);
  assert.equal(h.get('probe-polarization-name').textContent, '左円偏光');
  assert.match(h.get('probe-angles').textContent, /ψ 未定義 \/ χ -45°/);
  near(Number(h.get('probe-ellipse').getAttribute('ry')), 32);
  probeClick(h, 820, 300); assert.match(h.get('probe-angles').textContent, /ψ 90°/); near(h.probe().segment.power, .5);
  h.select(1); const field = h.get('param-polarization'); field.value = 'unpolarized'; h.fire('change', field);
  probeClick(h, 250, 300); assert.equal(h.get('probe-polarization-name').textContent, '無偏光');
  assert.equal(h.get('probe-ellipse').getAttribute('visibility'), 'hidden');
  assert.match(h.get('probe-angles').textContent, /ψ 未定義 \/ χ 未定義/);
});

test('overlapping wavelengths and counterpropagating rays can be selected without summing their Stokes or power', async () => {
  const h = editorHarness();
  await h.load([
    h.element('laser', 1, { x: 100, y: 300, rayCount: 1, wavelength: 450, polAngle: 0 }),
    h.element('laser', 2, { x: 900, y: 300, rayCount: 1, angle: 180, wavelength: 633, polAngle: 90 })
  ]);
  probeClick(h, 500, 300);
  assert.equal(h.get('probe-overlap-label').hidden, false); assert.equal(h.get('probe-overlap').children.length, 2);
  const choice = h.get('probe-overlap'); choice.value = '1'; h.fire('change', choice);
  assert.equal(h.get('probe-wavelength').textContent, '633 nm');
  assert.match(h.get('probe-direction').textContent, /^180°/); assert.match(h.get('probe-angles').textContent, /ψ 90°/);
  near(h.probe().segment.power, 1); assert.equal(h.get('probe-power').textContent, '1');
});

test('small click jitter selects a ray while marquee, Space-pan, cancellation and component gestures keep their roles', () => {
  const h = editorHarness(), before = h.scene(), viewport = h.viewport();
  probeClick(h, 350, 400, { clientX: 352, clientY: 401 });
  assert.ok(h.probe()); assert.deepEqual(h.viewport(), viewport);
  h.click('probe-close'); assert.equal(h.document.activeElement, h.get('bench'));
  h.fire('pointerdown', h.get('bench'), { clientX: 350, clientY: 400 });
  h.fire('pointermove', h.document, { clientX: 400, clientY: 420 });
  h.fire('pointerup', h.document, { clientX: 400, clientY: 420 });
  assert.equal(h.probe(), null); assert.deepEqual(h.viewport(), viewport);
  assert.equal(h.marquee(),null);
  h.key(' ',{ctrlKey:false});
  h.fire('pointerdown', h.get('bench'), { clientX:350,clientY:400 });
  h.fire('pointermove',h.document,{clientX:400,clientY:420});
  h.fire('pointerup',h.document,{clientX:400,clientY:420});
  assert.notDeepEqual(h.viewport(),viewport);h.fire('keyup',h.document,{key:' '});
  h.fire('pointerdown', h.get('bench'), { clientX: 350, clientY: 400 });
  h.fire('pointercancel', h.document); assert.equal(h.probe(), null);
  h.fire('pointerdown', h.component(1), { clientX: 150, clientY: 400 });
  h.fire('pointerup', h.document, { clientX: 150, clientY: 400 });
  assert.equal(h.probe(), null); assert.deepEqual(h.scene(), before);
});

test('the visible distance tool measures a clicked path and keeps Ctrl-drag duplication available', () => {
  const h = editorHarness(), before = h.scene();
  const html = fs.readFileSync(path.join(__dirname, '../optics-bench/index.html'), 'utf8');
  assert.match(html, /id="interaction-hints">Ctrl＋部品ドラッグ：複製/);
  assert.match(h.get('selection-summary').textContent, /Ctrl＋ドラッグで複製/);

  h.click('measure-tool');
  assert.equal(h.get('measure-tool').getAttribute('aria-pressed'), 'true');
  assert.equal(h.get('select-tool').getAttribute('aria-pressed'), 'false');
  assert.equal(h.get('pan-tool').getAttribute('aria-pressed'), 'false');
  assert.equal(h.get('bench').classList.contains('measure-tool'), true);
  h.fire('pointerdown', h.get('bench'), { pointerId: 71, clientX: 350, clientY: 400 });
  h.fire('pointerup', h.document, { pointerId: 71, clientX: 350, clientY: 400 });
  assert.ok(h.probe());
  assert.equal(h.get('probe-path-length').textContent, '20 cm');
  assert.deepEqual(h.scene(), before);

  h.fire('pointerdown', h.component(1), { pointerId: 72, ctrlKey: true, clientX: 150, clientY: 400 });
  h.fire('pointermove', h.document, { pointerId: 72, ctrlKey: true, clientX: 230, clientY: 460 });
  h.fire('pointerup', h.document, { pointerId: 72, ctrlKey: true, clientX: 230, clientY: 460 });
  assert.equal(h.scene().elements.length, before.elements.length + 1);
  assert.deepEqual({ x: h.selected().x, y: h.selected().y }, { x: 230, y: 460 });

  h.click('select-tool');
  assert.equal(h.get('measure-tool').getAttribute('aria-pressed'), 'false');
  assert.equal(h.get('select-tool').getAttribute('aria-pressed'), 'true');
  assert.equal(h.get('bench').classList.contains('measure-tool'), false);
});

test('keyboard-entry controls cover all intervals, close safely and leave redo available', () => {
  const h = editorHarness(); h.add('mirror'); const added = h.scene(); h.key('z');
  assert.equal(h.get('redo').disabled, false);
  h.click('inspect-ray'); assert.equal(h.document.activeElement, h.get('probe-close'));
  const index = Number(h.get('probe-index').textContent.split(' / ')[0]);
  h.click('probe-next'); assert.equal(Number(h.get('probe-index').textContent.split(' / ')[0]), index + 1);
  h.click('probe-prev'); assert.equal(Number(h.get('probe-index').textContent.split(' / ')[0]), index);
  h.key('Escape', { ctrlKey: false }); assert.equal(h.probe(), null); assert.equal(h.get('ray-inspector').hidden, true);
  assert.equal(h.get('redo').disabled, false); h.key('y'); assert.deepEqual(h.scene(), added);
  h.click('inspect-ray'); probeClick(h, 100, 100); assert.equal(h.probe(), null);
  h.click('inspect-ray'); h.click('new-scene'); assert.equal(h.probe(), null); assert.equal(h.get('inspect-ray').disabled, true);
  assert.equal(h.get('measure-tool').disabled, true); assert.equal(h.get('select-tool').getAttribute('aria-pressed'), 'true');
});

test('ray picking uses screen-pixel tolerance and redraws its marker with zoom and physical units', async () => {
  const h = editorHarness(); await h.load([h.element('laser', 1, { x: 100, y: 300, rayCount: 1 })]);
  const k = h.viewport().width / V.BASE_VIEW.width;
  probeClick(h, 200, 300 + 5*k); assert.ok(h.probe()); assert.match(h.get('probe-position').textContent, /X 20 \/ Y 30 cm/);
  h.click('probe-close'); h.click('zoom-in'); probeClick(h, 200, 300 + 5*k); assert.equal(h.probe(), null);
  probeClick(h, 200, 300 + 4*k); assert.ok(h.probe());
  h.get('unit').value = 'in'; h.fire('change', h.get('unit')); assert.match(h.get('probe-position').textContent, /X 7.874 \/ Y 11.811 in/);
  const O = require('../optics-bench/optics.js'), S = require('../optics-bench/state.js');
  const { document, view } = drawingHarness(), scene = S.defaultScene([O.createElement('laser', 1, 100, 300)]);
  const result = O.simulate(scene.elements); view.draw(scene, 1, result); view.markProbe({ segment: result.segments[0], t: .5 });
  const group = document.getElementById('ray-probe'), radius = Number(group.querySelector('circle').getAttribute('r'));
  assert.equal(group.children.length, 4); view.zoom(2);
  near(Number(group.querySelector('circle').getAttribute('r')), radius / 2);
  view.markProbe(null); assert.equal(group.children.length, 0);
});

test('the ray probe measures cumulative distance along reflected paths and flags unmeasured fiber length', async () => {
  const h = editorHarness();
  await h.load([
    h.element('laser', 1, { x: 100, y: 300, beamWidth: 0, rayCount: 1 }),
    h.element('mirror', 2, { x: 400, y: 300, angle: 45 }),
    h.element('screen', 3, { x: 400, y: 100, angle: 90 })
  ]);
  probeClick(h, 400, 150);
  assert.equal(h.get('probe-path-length').textContent, '45 cm');
  assert.equal(h.get('probe-segment-distance').textContent, '15 cm');
  assert.match(h.get('probe-path-note').textContent, /空気.*n=1/);
  near(h.probe().segment.pathLengthStart, 300);

  h.get('unit').value = 'in'; h.fire('change', h.get('unit'));
  assert.equal(h.get('probe-path-length').textContent, '17.7165 in');
  assert.equal(h.get('probe-segment-distance').textContent, '5.9055 in');

  await h.load([
    h.element('laser', 1, { x: 100, y: 300, beamWidth: 0, rayCount: 1 }),
    h.element('fiber', 2, { x: 300, y: 300, angle: 0 }),
    h.element('fiber', 3, { x: 600, y: 300, angle: 180 }),
    h.element('screen', 4, { x: 800, y: 300 })
  ], { fiberLinks: [{ a: 2, b: 3 }] });
  probeClick(h, 700, 300);
  assert.equal(h.get('probe-path-length').textContent, '30 cm + ファイバー1区間（長さ未設定）');
  assert.equal(h.get('probe-segment-distance').textContent, '10 cm');
  assert.match(h.get('probe-path-note').textContent, /内部長と屈折率.*含みません/);
  assert.equal(h.probe().segment.unmeasuredFiberLinks, 1);
});

test('the distance tool measures between A and B across reflections in either click order and starts a new range on the third click', async () => {
  const h = editorHarness();
  await h.load([
    h.element('laser', 1, { x: 100, y: 300, beamWidth: 0, rayCount: 1 }),
    h.element('mirror', 2, { x: 400, y: 300, angle: 45 }),
    h.element('screen', 3, { x: 400, y: 100, angle: 90 })
  ]);
  const before = h.scene(); h.click('measure-tool');
  probeClick(h, 200, 300);
  assert.equal(h.get('probe-range').hidden, false);
  assert.match(h.get('probe-range-start').textContent, /光源から 10 cm/);
  assert.equal(h.get('probe-range-end').textContent, '同じ光路上をクリック');
  assert.equal(h.probe().range.end, null);

  probeClick(h, 300, 300);
  assert.equal(h.get('probe-range-distance').textContent, 'A–B  10 cm');
  assert.equal(h.probe().range.route.length, 1);
  probeClick(h, 200, 300);
  assert.equal(h.probe().range.end, null);
  probeClick(h, 400, 150);
  assert.equal(h.get('probe-range-distance').textContent, 'A–B  35 cm');
  assert.equal(h.probe().range.route.length, 2);
  assert.match(h.get('probe-range-end').textContent, /光源から 45 cm/);
  assert.deepEqual(h.scene(), before);

  probeClick(h, 400, 150);
  assert.equal(h.probe().range.end, null);
  assert.match(h.get('probe-range-start').textContent, /光源から 45 cm/);
  probeClick(h, 200, 300);
  assert.equal(h.get('probe-range-distance').textContent, 'A–B  35 cm');
  assert.equal(h.probe().range.route.length, 2);
  h.click('probe-range-restart');
  assert.equal(h.probe(), null); assert.equal(h.get('ray-inspector').hidden, true);
});

test('two-point distance rejects sibling splitter branches and flags unmeasured fiber sections', async () => {
  const h = editorHarness();
  await h.load([
    h.element('laser', 1, { x: 100, y: 300, beamWidth: 0, rayCount: 1 }),
    h.element('splitter', 2, { x: 400, y: 300, angle: 45 }),
    h.element('screen', 3, { x: 700, y: 300 }),
    h.element('screen', 4, { x: 400, y: 100, angle: 90 })
  ]);
  h.click('measure-tool'); probeClick(h, 400, 200); const startKey = h.probe().segment.key;
  probeClick(h, 600, 300);
  assert.equal(h.probe().segment.key, startKey);
  assert.equal(h.probe().range.end, null);
  assert.equal(h.get('probe-range-end').textContent, '同じ光路上をクリック');
  probeClick(h, 200, 300);
  assert.equal(h.get('probe-range-distance').textContent, 'A–B  30 cm');

  await h.load([
    h.element('laser', 1, { x: 100, y: 300, beamWidth: 0, rayCount: 1 }),
    h.element('fiber', 2, { x: 300, y: 300, angle: 0 }),
    h.element('fiber', 3, { x: 600, y: 300, angle: 180 }),
    h.element('screen', 4, { x: 800, y: 300 })
  ], { fiberLinks: [{ a: 2, b: 3 }] });
  h.click('measure-tool'); probeClick(h, 200, 300); probeClick(h, 700, 300);
  assert.equal(h.get('probe-range-distance').textContent, 'A–B  20 cm + ファイバー1区間');
  assert.match(h.get('probe-range-status').textContent, /内部長と屈折率が未設定/);
  assert.equal(h.probe().range.route.length, 2);
});

test('the SVG probe draws the full A-to-B route with labeled endpoints', () => {
  const O = require('../optics-bench/optics.js'), S = require('../optics-bench/state.js');
  const { document, view } = drawingHarness();
  const scene = S.defaultScene([
    { ...O.createElement('laser', 1, 100, 300), beamWidth: 0, rayCount: 1 },
    { ...O.createElement('mirror', 2, 400, 300), angle: 45 },
    { ...O.createElement('screen', 3, 400, 100), angle: 90 }
  ]);
  const result = O.simulate(scene.elements), [first, second] = result.segments;
  const start = { segment: first, t: 1 / 3, point: { x: 200, y: 300 } };
  const end = { segment: second, t: .75, point: { x: 400, y: 150 } };
  view.draw(scene, 1, result); view.markProbe({ segment: second, t: .75, range: {
    start, end, route: [{ segment: first, from: 1 / 3, to: 1 }, { segment: second, from: 0, to: .75 }]
  } });
  const group = document.getElementById('ray-probe');
  assert.equal(group.querySelectorAll('[data-probe-route="true"]').length, 4);
  assert.equal(group.querySelector('[data-probe-point="A"] text').textContent, 'A');
  assert.equal(group.querySelector('[data-probe-point="B"] text').textContent, 'B');
  assert.equal(group.querySelectorAll('path').length, 1);
});

test('SVG export removes the probe marker without mutating the live optical diagram', () => {
  const O = require('../optics-bench/optics.js'), S = require('../optics-bench/state.js');
  const { document, view } = drawingHarness(), scene = S.defaultScene([O.createElement('laser', 1, 100, 300)]);
  const result = O.simulate(scene.elements); view.draw(scene, 1, result); view.markProbe({ segment: result.segments[0], t: .3 });
  const previous = global.XMLSerializer; let exported;
  global.XMLSerializer = class { serializeToString(node) { exported = node; return '<svg/>'; } };
  try { view.exportSvg(scene.title); } finally {
    if (previous === undefined) delete global.XMLSerializer; else global.XMLSerializer = previous;
  }
  assert.equal(exported.querySelector('#ray-probe'), null);
  assert.equal(exported.querySelector('#rays').children.length, result.segments.length);
  const visible = view.visibleBounds();
  assert.equal(exported.getAttribute('viewBox'), `${visible.x} ${visible.y} ${visible.width} ${visible.height}`);
  assert.equal(exported.getAttribute('height'), String(Math.round(1400 * visible.height / visible.width)));
  assert.equal(document.getElementById('ray-probe').children.length, 4);
});

test('the SVG view distinguishes primary and secondary selections and omits editor overlays from export', () => {
  const O=require('../optics-bench/optics.js'),S=require('../optics-bench/state.js');
  const {document,view}=drawingHarness(),scene=S.defaultScene([O.createElement('laser',1,100,300),O.createElement('mirror',2,400,300)]);
  view.draw(scene,2,O.simulate(scene.elements),true,[1,2]);view.marquee({x:50,y:250,width:400,height:100});
  const [first,second]=document.getElementById('elements').children;
  assert.equal(first.classList.contains('is-selected'),true);assert.equal(first.classList.contains('is-primary'),false);
  assert.equal(second.classList.contains('is-selected'),true);assert.equal(second.classList.contains('is-primary'),true);
  assert.equal(first.getAttribute('aria-pressed'),'true');assert.equal(first.querySelector('.rotation-handle'),null);
  assert.ok(second.querySelector('.rotation-handle'));assert.equal(document.getElementById('selection-marquee').children.length,1);
  const previous=global.XMLSerializer;let exported;
  global.XMLSerializer=class{serializeToString(node){exported=node;return '<svg/>';}};
  try{view.exportSvg(scene.title);}finally{if(previous===undefined)delete global.XMLSerializer;else global.XMLSerializer=previous;}
  assert.equal(exported.querySelector('#selection-marquee'),null);assert.equal(exported.querySelector('.selection-ring'),null);
  assert.equal(document.getElementById('selection-marquee').children.length,1);
});

test('probe selection is ephemeral across scene imports and handles a disabled source without stale measurements', async () => {
  const h = editorHarness();
  await h.load([h.element('laser', 1, { x: 100, y: 300, rayCount: 1 })]);
  probeClick(h, 200, 300); const serialized = JSON.stringify(h.scene());
  assert.equal(serialized.includes('traceKey'), false); assert.equal(serialized.includes('probe'), false);
  h.select(1); const count = h.get('param-rayCount'); count.value = '3'; h.fire('input', count);
  assert.equal(h.get('probe-data').hidden, true);
  count.value = '1'; h.fire('input', count); assert.ok(h.probe());
  h.select(1); const enabled = h.get('param-enabled'); enabled.checked = false; h.fire('change', enabled);
  assert.equal(h.probe(), null); assert.equal(h.get('probe-data').hidden, true);
  assert.equal(h.get('probe-prev').disabled, true); assert.equal(h.get('probe-next').disabled, true);
  await h.load([h.element('laser', 1, { x: 100, y: 300, rayCount: 1, wavelength: 633 })]);
  assert.equal(h.get('ray-inspector').hidden, true); assert.equal(h.get('inspect-ray').disabled, false);
  probeClick(h, 200, 300); h.select(1); h.click('delete');
  assert.equal(h.get('ray-inspector').hidden, true);
});

test('fiber cables attach to the rear of both ends and redraw after movement, rotation, disable and disconnect', () => {
  const O = require('../optics-bench/optics.js'), S = require('../optics-bench/state.js');
  const { document, view } = drawingHarness();
  const a = { ...O.createElement('fiber', 1, 100, 200), label: 'Input' };
  const b = { ...O.createElement('fiber', 2, 800, 400), angle: 180, label: 'Output' };
  const scene = S.defaultScene([a, b], { fiberLinks: [{ a: 1, b: 2 }] });
  const draw = () => view.draw(scene, 1, O.simulate(scene.elements, { fiberLinks: scene.fiberLinks }));
  const cables = document.getElementById('fiber-links');
  draw();
  assert.equal(cables.children.length, 1);
  assert.equal(cables.querySelector('path').getAttribute('d'), 'M 148 200 C 368 200 532 400 752 400');
  assert.match(document.getElementById('elements').children[0].getAttribute('aria-label'), /接続先 Output/);
  scene.elements[1].x = 650; scene.elements[1].y = 450; scene.elements[1].angle = 90; draw();
  assert.match(cables.querySelector('path').getAttribute('d'), /650 498$/);
  assert.doesNotMatch(cables.querySelector('path').getAttribute('d'), /NaN|Infinity/);
  scene.elements[1].enabled = false; draw(); assert.equal(cables.children[0].getAttribute('opacity'), '0.4');
  scene.fiberLinks = []; draw(); assert.equal(cables.children.length, 0);
  assert.doesNotMatch(document.getElementById('elements').children[0].getAttribute('aria-label'), /接続先/);
});

test('NPBS and PBS render distinct identities, readable routing labels and a PBS body even with labels hidden', () => {
  const O = require('../optics-bench/optics.js'), S = require('../optics-bench/state.js');
  const { document, view } = drawingHarness();
  const scene = S.defaultScene([
    { ...O.createElement('splitter', 1, 300, 300), label: 'Branch A', transmission: 0.25 },
    { ...O.createElement('pbs', 2, 700, 300), label: 'Branch B' }
  ]);
  const draw = labels => view.draw(scene, 2, O.simulate(scene.elements), labels);
  draw(true);
  const elements = document.getElementById('elements'), npbs = elements.children[0], pbs = elements.children[1];
  assert.match(npbs.getAttribute('aria-label'), /Branch A、無偏光BS（NPBS）/);
  assert.match(pbs.getAttribute('aria-label'), /Branch B、偏光BS（PBS）/);
  assert.equal(npbs.querySelector('.element-info').textContent, 'NPBS · T 25%');
  assert.equal(pbs.querySelector('.element-info').textContent, 'PBS · p透過 / s反射');
  assert.equal(pbs.querySelector('.element-name').getAttribute('text-anchor'), 'middle');
  scene.elements[1].angle = 67.5; scene.elements[1].enabled = false; draw(true);
  assert.equal(pbs.children[0].getAttribute('transform'), 'rotate(67.5)');
  assert.equal(pbs.classList.contains('is-disabled'), true);
  for (const element of scene.elements) element.label = '';
  draw(true);
  assert.equal(npbs.querySelector('.element-name').textContent, 'NPBS 1');
  assert.equal(pbs.querySelector('.element-name').textContent, 'PBS 2');
  draw(false);
  assert.equal(pbs.querySelector('.element-info'), null);
  assert.ok(pbs.querySelectorAll('text').some(node => node.textContent === 'P'));
  assert.equal(npbs.querySelectorAll('text').length, 0);
  view.preview(scene.elements[1]);
  assert.ok(document.getElementById('placement').querySelectorAll('text').some(node => node.textContent === 'P'));
  for (const aperture of [2, 100, 300]) for (const angle of [0, 45, 90, 157.5]) {
    for (const e of scene.elements) { e.aperture = aperture; e.angle = angle; }
    draw(true);
    for (const node of [npbs,pbs]) {
      const body = node.children[0], face = body.querySelector('[data-bs-surface]'), prism = body.querySelector('[data-bs-prism]');
      assert.equal(prism.getAttribute('points'), `0,${-aperture/2} ${aperture/2},0 0,${aperture/2} ${-aperture/2},0`);
      assert.equal(Number(face.getAttribute('x1')), 0); assert.equal(Number(face.getAttribute('x2')), 0);
      assert.equal(Number(face.getAttribute('y2'))-Number(face.getAttribute('y1')), aperture);
      for (const selector of ['.element-hit','.selection-ring']) {
        const box = body.querySelector(selector); assert.ok(Number(box.getAttribute('x')) < -aperture/2);
        assert.ok(Number(box.getAttribute('width')) > aperture);
      }
      const extent = aperture/2*Math.max(Math.abs(O.direction(angle).x),Math.abs(O.direction(angle).y));
      assert.ok(Number(node.querySelector('.element-name').getAttribute('y')) > extent);
    }
    view.preview(scene.elements[1]);
    assert.equal(document.getElementById('placement').querySelector('[data-bs-prism]').getAttribute('points'), pbs.querySelector('[data-bs-prism]').getAttribute('points'));
  }
});

test('both beam splitter palette entries support pointer placement, keyboard placement and undo', () => {
  for (const type of ['splitter', 'pbs']) for (const action of ['drag', 'keyboard']) {
    const h = editorHarness(); h.click('new-scene');
    const before = h.scene(), button = h.get('palette-buttons').querySelector('[data-add="' + type + '"]');
    assert.match(button.getAttribute('aria-label'), type === 'pbs' ? /^偏光BS（PBS）$/ : /^無偏光BS（NPBS）$/);
    if (action === 'drag') {
      h.fire('pointerdown', button, { pointerId: 61, clientX: 20, clientY: 100 });
      h.fire('pointermove', h.document, { pointerId: 61, clientX: 455, clientY: 347 });
      assert.equal(h.preview().type, type);
      h.fire('pointerup', h.document, { pointerId: 61, clientX: 455, clientY: 347 });
      assert.deepEqual({ x: h.selected().x, y: h.selected().y }, { x: 460, y: 350 });
    } else {
      button.focus(); h.key('Enter', { ctrlKey: false });
    }
    assert.equal(h.scene().elements.length, 1); assert.equal(h.selected().type, type);
    assert.equal(h.selected().angle, 45); assert.equal(h.selected().aperture, 36);
    assert.match(h.get('hint-aperture').textContent, /厚さ0/); const added = h.scene();
    h.get('bench').focus(); h.key('z'); assert.deepEqual(h.scene(), before);
    h.key('y'); assert.deepEqual(h.scene(), added);
  }
});

test('the PBS preset responds to polarization editing and exposes complementary detector Stokes through undo and redo', () => {
  const h = editorHarness(), before = h.scene();
  h.get('preset').value = 'polarizing-splitter'; h.click('load-preset');
  const preset = h.scene(), detector = id => h.result().detectors.find(item => item.id === id);
  near(detector(3).power, 0.5); near(detector(4).power, 0.5);
  h.get('bench').focus(); h.key('z'); assert.deepEqual(h.scene(), before);
  h.key('y'); assert.deepEqual(h.scene(), preset);
  h.select(2);
  assert.equal(h.get('param-transmission'), null);
  assert.match(h.get('splitter-model').textContent, /p偏光（90°）.*s偏光（0°）/);
  assert.match(h.get('hint-angle').textContent, /面の法線/);
  h.select(1); const angle = h.get('param-polAngle'); angle.focus(); angle.value = '0'; h.fire('input', angle);
  h.get('bench').focus(); near(detector(3).power, 0); near(detector(4).power, 1);
  h.select(4); assert.match(h.get('selected-output').textContent, /Q\/I 1 · U\/I 0 · V\/I 0/);
  h.get('bench').focus(); h.key('z'); near(detector(3).power, 0.5); near(detector(4).power, 0.5);
  h.key('y'); near(detector(3).power, 0); near(detector(4).power, 1);
  h.select(1); const polarization = h.get('param-polarization'); polarization.focus(); polarization.value = 'right'; h.fire('change', polarization);
  h.get('bench').focus(); assert.equal(h.get('param-polAngle').disabled, true);
  near(detector(3).power, 0.5); near(detector(4).power, 0.5);
  h.select(3); assert.match(h.get('selected-output').textContent, /Q\/I -1 · U\/I 0 · V\/I 0/);
  h.select(2); const enabled = h.get('param-enabled'); enabled.checked = false; h.fire('change', enabled);
  near(detector(3).power, 1); near(detector(3).stokes.V, 1); near(detector(4).power, 0);
  h.get('bench').focus(); h.key('z'); near(detector(3).power, 0.5); near(detector(4).power, 0.5);
});

test('the legacy NPBS transmission control keeps its ratio for every source polarization and is undoable', async () => {
  const h = editorHarness();
  await h.load([
    h.element('laser', 1, { x: 150, y: 350, rayCount: 1, beamWidth: 0, polarization: 'right' }),
    h.element('splitter', 2, { x: 500, y: 350 }),
    h.element('screen', 3, { x: 820, y: 350 }),
    h.element('screen', 4, { x: 500, y: 150, angle: 90 })
  ]);
  const detector = id => h.result().detectors.find(item => item.id === id);
  h.select(2); assert.equal(h.get('splitter-model'), null);
  assert.match(h.get('hint-transmission').textContent, /偏光によらず/);
  const transmission = h.get('param-transmission'); transmission.focus(); transmission.value = '0.25'; h.fire('input', transmission);
  h.get('bench').focus(); near(detector(3).power, 0.25); near(detector(4).power, 0.75);
  near(detector(3).stokes.V / detector(3).power, 1); near(detector(4).stokes.V / detector(4).power, 1);
  h.key('z'); near(detector(3).power, 0.5); near(detector(4).power, 0.5);
  h.key('y'); near(detector(3).power, 0.25); near(detector(4).power, 0.75);
  for (const value of ['linear', 'unpolarized', 'left']) {
    h.select(1); const field = h.get('param-polarization'); field.focus(); field.value = value; h.fire('change', field);
    h.get('bench').focus(); near(detector(3).power, 0.25); near(detector(4).power, 0.75);
  }
});

async function fiberEditor(linked = false) {
  const h = editorHarness();
  await h.load([
    h.element('laser', 1, { x: 100, y: 300, beamWidth: 0, rayCount: 1, wavelength: 633, polarization: 'right' }),
    h.element('fiber', 2, { x: 300, y: 300, label: 'Input' }),
    h.element('fiber', 3, { x: 600, y: 300, angle: 180, label: 'Output' }),
    h.element('screen', 4, { x: 800, y: 300 })
  ], { fiberLinks: linked ? [{ a: 2, b: 3 }] : [] });
  h.select(2); return h;
}
function chooseFiber(h, partner) {
  const input = h.get('fiber-partner'); input.focus(); input.value = String(partner); h.fire('change', input);
  h.get('bench').focus();
}

test('the connection selector enables real optical transfer, reciprocal selection and separate emission readouts', async () => {
  const h = await fiberEditor(), before = h.scene();
  assert.equal(h.result().detectors.find(e => e.id === 4).power, 0);
  assert.equal(h.get('fiber-disconnect').disabled, true);
  chooseFiber(h, 3);
  assert.deepEqual(h.scene().fiberLinks, [{ a: 2, b: 3 }]);
  assert.deepEqual(h.scene().elements, before.elements);
  assert.equal(h.result().detectors.find(e => e.id === 4).power, 1);
  assert.equal(h.result().detectedPower, 1);
  assert.equal(h.get('fiber-disconnect').disabled, false);
  const connected = h.scene();
  h.click('fiber-select-partner'); assert.equal(h.selectedId(), 3); assert.equal(h.get('fiber-partner').value, '2');
  assert.match(h.get('selected-output').textContent, /この端面から出射 P = 1/);
  assert.match(h.get('selected-output').textContent, /出射偏光（理想伝送）：Q\/I 0 · U\/I 0 · V\/I 1/);
  assert.match(h.get('selected-output').textContent, /出射 633 nm : P 1/);
  h.get('bench').focus(); h.key('z'); assert.deepEqual(h.scene(), before);
  h.key('y'); assert.deepEqual(h.scene(), connected);
});

test('disconnecting a fiber is one undo step and restores its former reception-only behavior', async () => {
  const h = await fiberEditor(true), before = h.scene();
  h.click('fiber-disconnect'); const disconnected = h.scene();
  assert.deepEqual(disconnected.fiberLinks, []); assert.deepEqual(disconnected.elements, before.elements);
  assert.equal(h.result().detectors.find(e => e.id === 2).power, 1);
  assert.equal(h.result().detectors.find(e => e.id === 4).power, 0);
  assert.equal(h.get('fiber-partner').value, '0');
  h.get('bench').focus(); h.key('z'); assert.deepEqual(h.scene(), before);
  h.key('y'); assert.deepEqual(h.scene(), disconnected);
});

test('reconnecting frees the previous mate and occupied or invalid selections preserve the scene and redo', async () => {
  const h = await fiberEditor(true);
  h.add('fiber'); const replacementId = h.selectedId();
  h.select(2); chooseFiber(h, replacementId);
  assert.deepEqual(h.scene().fiberLinks, [{ a: 2, b: replacementId }]);
  h.select(3);
  assert.equal(h.get('fiber-partner').querySelector('[value="2"]').disabled, true);
  const valid = h.scene(); h.click('rotate'); const later = h.scene(); h.get('bench').focus(); h.key('z');
  for (const target of [2, replacementId, 3, 1, 999]) {
    chooseFiber(h, target); assert.deepEqual(h.scene(), valid);
    assert.equal(h.get('redo').disabled, false);
  }
  h.key('y'); assert.deepEqual(h.scene(), later);
});

test('deleting or cutting either fiber cleans up its connection and undo restores the pair', async () => {
  for (const action of ['delete', 'cut']) {
    const h = await fiberEditor(true), before = h.scene();
    if (action === 'delete') h.click('delete'); else h.clipboard('cut');
    assert.equal(h.scene().elements.length, 3); assert.deepEqual(h.scene().fiberLinks, []);
    h.get('bench').focus(); h.key('z'); assert.deepEqual(h.scene(), before);
    if (action === 'cut') {
      const text = h.clipboard('copy').data.get('text/plain');
      const component = JSON.parse(text.slice(text.indexOf('\n') + 1));
      assert.equal(component.schemaVersion, 1); assert.equal('fiberLinks' in component, false);
    }
  }
});

test('pasting, direct duplication and Ctrl-drag copy a fiber without copying or stealing its connection', async () => {
  for (const action of ['paste', 'duplicate', 'drag']) {
    const h = await fiberEditor(true), before = h.scene(), source = h.selected();
    if (action === 'paste') h.clipboard('paste', h.clipboard('copy').data.get('text/plain'));
    else if (action === 'duplicate') h.click('duplicate');
    else {
      h.fire('pointerdown', h.component(source.id), { pointerId: 45, ctrlKey: true, clientX: source.x, clientY: source.y });
      h.fire('pointerup', h.document, { pointerId: 45, ctrlKey: true, clientX: source.x + 70, clientY: source.y + 50 });
    }
    assert.equal(h.scene().elements.length, 5, action);
    assert.notEqual(h.selectedId(), source.id);
    assert.equal(h.get('fiber-partner').value, '0');
    assert.deepEqual(h.scene().fiberLinks, before.fiberLinks, action);
    assert.deepEqual(h.scene().elements.find(e => e.id === source.id), source);
    h.get('bench').focus(); h.key('z'); assert.deepEqual(h.scene(), before, action);
  }
});

test('fiber moves, rotations, unit changes and disabled mates preserve the saved pair', async () => {
  const h = await fiberEditor(true), before = h.scene(); h.select(3);
  const enabled = h.get('param-enabled'); enabled.checked = false; h.fire('change', enabled);
  assert.deepEqual(h.scene().fiberLinks, before.fiberLinks);
  assert.equal(h.result().fiberTransfers.length, 0);
  assert.match(h.get('fiber-link-info').textContent, /無効/);
  h.get('bench').focus(); h.key('z'); assert.equal(h.result().fiberTransfers.length, 1);
  const e = h.selected();
  h.fire('pointerdown', h.component(e.id), { pointerId: 46, clientX: e.x, clientY: e.y });
  h.fire('pointerup', h.document, { pointerId: 46, clientX: e.x + 50, clientY: e.y + 30 });
  assert.deepEqual(h.scene().fiberLinks, before.fiberLinks);
  h.click('rotate'); assert.deepEqual(h.scene().fiberLinks, before.fiberLinks);
  const unit = h.get('unit'); unit.value = 'in'; h.fire('change', unit);
  assert.deepEqual(h.scene().fiberLinks, before.fiberLinks);
});

test('new scenes and imported legacy scenes remove links while undo and valid v2 imports restore them', async () => {
  const h = await fiberEditor(true), before = h.scene();
  h.click('new-scene'); assert.deepEqual(h.scene().fiberLinks, []);
  h.get('bench').focus(); h.key('z'); assert.deepEqual(h.scene(), before);
  await h.load(before.elements, { schemaVersion: 1, fiberLinks: undefined });
  assert.equal(h.scene().schemaVersion, 2); assert.deepEqual(h.scene().fiberLinks, []);
  h.key('z'); assert.deepEqual(h.scene(), before);
  await h.load(before.elements, { fiberLinks: [{ a: 2, b: 4 }] });
  assert.match(h.get('status').textContent, /読み込みできません/); assert.deepEqual(h.scene(), before);
  await h.load(before.elements, { fiberLinks: before.fiberLinks });
  assert.deepEqual(h.scene().fiberLinks, before.fiberLinks);
  assert.equal(h.selectedId(), 2);
});

const coherenceRow = (h, id) => h.get('coherence-readout').querySelector('[data-detector-id="' + id + '"]');
async function interferenceEditor(id = 'quantum-eraser') {
  const h = editorHarness(), scene = require('../optics-bench/presets.js').create(id);
  await h.load(scene.elements); return h;
}

test('interference controls update phase continuously, keep one undo gesture and remain independent of angle snapping', async () => {
  const h = await interferenceEditor(), initial = h.scene(), slider = h.get('coherence-phase-slider');
  assert.equal(h.get('coherence-panel').hidden, false); assert.equal(h.get('coherence-results').hidden, false);
  assert.equal(coherenceRow(h, 7).children[1].textContent, '0.5');
  slider.focus(); h.fire('pointerdown', slider, { button: 0, pointerId: 71, clientX: 8 });
  for (const phase of [71, 137]) h.fire('pointermove', h.document, { pointerId: 71, clientX: 8+184*phase/360 });
  h.fire('pointerup', h.document, { pointerId: 71, clientX: 8+184*137/360 });
  h.fire('change', slider);
  assert.equal(h.scene().elements.find(e => e.type === 'phase').phase, 137);
  assert.equal(h.get('coherence-phase-value').value, '137');
  assert.match(h.get('coherence-plot').getAttribute('aria-label'), /137°/);
  h.key('z'); assert.deepEqual(h.scene(), initial); assert.equal(coherenceRow(h, 7).children[1].textContent, '0.5');
  h.key('y'); assert.equal(h.scene().elements.find(e => e.type === 'phase').phase, 137);
  h.key('ArrowRight', { ctrlKey: false }, slider); assert.equal(h.scene().elements.find(e => e.type === 'phase').phase, 138);
  h.key('z'); assert.equal(h.scene().elements.find(e => e.type === 'phase').phase, 137);
  const beforeCancel = h.scene();
  h.fire('pointerdown', slider, { button: 0, pointerId: 72, clientX: 100 });
  h.fire('pointermove', h.document, { pointerId: 72, clientX: 150 });
  assert.notDeepEqual(h.scene(), beforeCancel);
  h.key('Escape', { ctrlKey: false }, slider); assert.deepEqual(h.scene(), beforeCancel);
});

test('invalid interference phase values leave the design unchanged and numeric text editing keeps native shortcuts', async () => {
  const h = await interferenceEditor(), initial = h.scene(), input = h.get('coherence-phase-value'); input.focus();
  for (const value of ['', '-1', '361', 'NaN']) {
    input.value = value; h.fire('input', input);
    assert.deepEqual(h.scene(), initial); assert.equal(input.getAttribute('aria-invalid'), 'true');
  }
  input.value = '180'; h.fire('input', input); h.fire('change', input);
  assert.equal(input.getAttribute('aria-invalid'), null); assert.equal(coherenceRow(h, 7).children[1].textContent, '0');
  assert.equal(coherenceRow(h, 8).children[1].textContent, '0.5');
  assert.equal(h.key('z').defaultPrevented, false, 'number field retains native text undo');
  h.get('bench').focus(); h.key('z'); assert.deepEqual(h.scene(), initial);
});

test('eraser analyzers and marker can be changed in the normal inspector and the interference panel follows them', async () => {
  const h = await interferenceEditor();
  for (const id of [10, 11]) {
    h.select(id); const input = h.get('param-enabled'); input.checked = false; h.fire('change', input);
  }
  for (const id of [7, 8]) {
    assert.equal(coherenceRow(h, id).children[1].textContent, '0.5');
    assert.equal(coherenceRow(h, id).children[2].textContent, '0');
  }
  h.select(9); const input = h.get('param-enabled'); input.checked = false; h.fire('change', input);
  assert.equal(coherenceRow(h, 7).children[1].textContent, '1'); assert.equal(coherenceRow(h, 8).children[1].textContent, '0');
  h.get('bench').focus(); h.key('z'); assert.equal(coherenceRow(h, 7).children[2].textContent, '0');
});

test('phase inspector edits survive clipboard and import and unsupported optics clear old coherent results', async () => {
  const h = await interferenceEditor(); h.select(6);
  const input = h.get('param-phase'); input.value = '17.3125'; h.fire('change', input);
  assert.equal(h.get('coherence-phase-value').value, '17.3125'); assert.equal(h.get('param-phase-slider').step, '1');
  h.get('bench').focus(); const copied = h.clipboard('copy').data.get('text/plain');
  assert.equal(h.parseComponent(copied).phase, 17.3125);
  const saved = h.scene(); await h.load(saved.elements);
  assert.equal(h.get('coherence-results').hidden, false); assert.equal(h.get('coherence-phase-value').value, '17.3125');
  h.add('lens'); assert.equal(h.get('coherence-results').hidden, true);
  assert.equal(h.get('coherence-readout').children.length, 0); assert.equal(h.get('coherence-curves').children.length, 0);
  assert.match(h.get('coherence-status').textContent, /未対応/);
  h.get('bench').focus(); h.key('z'); assert.equal(h.get('coherence-results').hidden, false);
  h.click('new-scene'); assert.equal(h.get('coherence-panel').hidden, true);
  h.get('bench').focus(); h.key('z'); assert.equal(h.get('coherence-panel').hidden, false);
});

test('selecting between phase controls changes the scan target without editing or resetting the saved phase', async () => {
  const h = await interferenceEditor('mach-zehnder'), elements = h.scene().elements;
  elements.push(h.element('phase', 20, { x: 500, y: 450, phase: 90, label: 'Second phase' }));
  await h.load(elements); const before = h.scene();
  const select = h.get('coherence-phase-select'); select.value = '20'; h.fire('change', select);
  assert.deepEqual(h.scene(), before); assert.equal(h.get('coherence-phase-value').value, '90');
  const input = h.get('coherence-phase-value'); input.value = '180'; h.fire('input', input); h.fire('change', input);
  assert.equal(h.scene().elements.find(e => e.id === 20).phase, 180); assert.equal(h.scene().elements.find(e => e.id === 6).phase, 0);
  assert.equal(coherenceRow(h, 7).children[1].textContent, '0');
});

test('interference polarization quick toggles preserve keyboard focus and undo the actual element setting', async () => {
  const h = await interferenceEditor(), before = h.scene();
  const button = h.get('coherence-optics').querySelector('[data-optic-id="10"]'); button.focus(); h.fire('click', button);
  assert.equal(h.scene().elements.find(e => e.id === 10).enabled, false);
  assert.equal(button.getAttribute('aria-pressed'), 'false'); assert.equal(h.document.activeElement, button);
  assert.equal(coherenceRow(h, 7).children[2].textContent, '0');
  h.key('z'); assert.deepEqual(h.scene(), before); assert.equal(button.getAttribute('aria-pressed'), 'true');
  assert.equal(coherenceRow(h, 7).children[2].textContent, '1');
});
