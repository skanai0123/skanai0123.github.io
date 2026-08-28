const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../optics-bench/view.js');

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

test('placement clamps all four board edges with grid snapping enabled or disabled', () => {
  for (const snap of [true, false]) {
    assert.deepEqual(V.place(-10000, 10000, 25.4, snap), { x: 50, y: 550 });
    assert.deepEqual(V.place(10000, -10000, 25.4, snap), { x: 950, y: 50 });
  }
  assert.deepEqual(V.place(49.99, 550.01, 25.4, false), { x: 50, y: 550 });
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

test('nudging against each board edge clamps only the moving coordinate', () => {
  for (const snap of [true, false]) {
    assert.deepEqual(V.nudge({ x: 50, y: 325.25 }, -1, 0, 25.4, snap), { x: 50, y: 325.25 });
    assert.deepEqual(V.nudge({ x: 949.25, y: 325.25 }, 1, 0, 25.4, snap), { x: 950, y: 325.25 });
    assert.deepEqual(V.nudge({ x: 150.125, y: 50 }, 0, -1, 25.4, snap), { x: 150.125, y: 50 });
    assert.deepEqual(V.nudge({ x: 150.125, y: 549.5 }, 0, 1, 25.4, snap), { x: 150.125, y: 550 });
  }
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
  near(close.width, 109.6);
  near(close.height, 70.4);
  near(wide.width, 1644);
  near(wide.height, 1056);
  for (const result of [close, wide]) {
    const point = relativePoint(result, anchor);
    near(point.x, before.x);
    near(point.y, before.y);
  }
  nearView(V.zoomAt(close, 10, anchor), close);
  nearView(V.zoomAt(wide, 0.1, anchor), wide);
});

test('pan clamping keeps a visible board strip without changing viewport dimensions', () => {
  const leftTop = Object.freeze({ x: -1e6, y: -1e6, width: 274, height: 176 });
  const rightBottom = Object.freeze({ x: 1e6, y: 1e6, width: 274, height: 176 });
  assert.deepEqual(V.clampView(leftTop), { x: -234, y: -136, width: 274, height: 176 });
  assert.deepEqual(V.clampView(rightBottom), { x: 960, y: 560, width: 274, height: 176 });
  const interior = Object.freeze({ x: -100, y: -100, width: 274, height: 176 });
  assert.deepEqual(V.clampView(interior), interior);
});

test('zoom at extreme pan positions clamps the result before the board disappears', () => {
  nearView(V.zoomAt({ x: -508, y: -312, width: 548, height: 352 }, 2, { x: 0, y: 0 }),
    { x: -234, y: -136, width: 274, height: 176 });
  nearView(V.zoomAt({ x: 960, y: 560, width: 548, height: 352 }, 2, { x: 1000, y: 600 }),
    { x: 960, y: 560, width: 274, height: 176 });
});
