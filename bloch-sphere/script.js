(function () {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const canvas = $("#blochCanvas");
  const ctx = canvas.getContext("2d");
  const thetaInput = $("#theta");
  const phiInput = $("#phi");
  const radiusInput = $("#radius");

  const state = {
    theta: 0,
    phi: 0,
    radius: 1,
    yaw: 0.60,
    pitch: -0.50,
    roll: 0.96,
    dragging: false,
    lastX: 0,
    lastY: 0,
    dpr: 1,
    width: 0,
    height: 0
  };

  const COLORS = {
    x: "#ff9d59",
    y: "#a993ff",
    z: "#45e3d6",
    vector: "#f5fbff",
    grid: "rgba(105, 154, 177, 0.25)",
    backGrid: "rgba(79, 112, 132, 0.10)",
    sphere: "rgba(48, 177, 182, 0.055)"
  };

  const presets = {
    zero: { theta: 0, phi: 0, radius: 1 },
    one: { theta: 180, phi: 0, radius: 1 },
    plus: { theta: 90, phi: 0, radius: 1 },
    "plus-i": { theta: 90, phi: 90, radius: 1 },
    mixed: { theta: 55, phi: 35, radius: 0 }
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function clean(value, digits = 3) {
    const threshold = 0.5 * Math.pow(10, -digits);
    return Math.abs(value) < threshold ? 0 : value;
  }

  function format(value, digits = 3) {
    return clean(value, digits).toFixed(digits);
  }

  function complex(re, im) {
    const r = clean(re);
    const i = clean(im);
    if (i === 0) return format(r);
    if (r === 0) return `${format(i)}i`;
    return `${format(r)}\n${i >= 0 ? "+" : "−"} ${format(Math.abs(i))}i`;
  }

  function blochVector() {
    const theta = state.theta * Math.PI / 180;
    const phi = state.phi * Math.PI / 180;
    return {
      x: state.radius * Math.sin(theta) * Math.cos(phi),
      y: state.radius * Math.sin(theta) * Math.sin(phi),
      z: state.radius * Math.cos(theta)
    };
  }

  function setRangeFill(input) {
    const ratio = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min));
    input.style.setProperty("--fill", `${ratio * 100}%`);
  }

  function entropy(radius) {
    if (radius >= 0.999999) return 0;
    const a = (1 + radius) / 2;
    const b = (1 - radius) / 2;
    const h = (p) => p <= 0 ? 0 : -p * Math.log2(p);
    return h(a) + h(b);
  }

  function amplitudeText() {
    const theta = state.theta * Math.PI / 180;
    const phi = state.phi * Math.PI / 180;
    const a = Math.cos(theta / 2);
    const b = Math.sin(theta / 2);
    const re = b * Math.cos(phi);
    const im = b * Math.sin(phi);
    let second = "";
    if (Math.abs(im) < 0.0005) {
      second = `${format(re)} |1⟩`;
    } else if (Math.abs(re) < 0.0005) {
      second = `${format(im)}i |1⟩`;
    } else {
      second = `(${format(re)} ${im >= 0 ? "+" : "−"} ${format(Math.abs(im))}i) |1⟩`;
    }
    return `|ψ⟩ = ${format(a)} |0⟩ + ${second}`;
  }

  function updateReadout() {
    const v = blochVector();
    const rho00 = (1 + v.z) / 2;
    const rho11 = (1 - v.z) / 2;
    const rho01re = v.x / 2;
    const rho01im = -v.y / 2;
    const pure = state.radius >= 0.9995;
    const fullyMixed = state.radius <= 0.0005;

    $("#thetaValue").textContent = `${Math.round(state.theta)}°`;
    $("#phiValue").textContent = `${Math.round(state.phi)}°`;
    $("#radiusValue").textContent = state.radius.toFixed(2);
    $("#xValue").textContent = format(v.x);
    $("#yValue").textContent = format(v.y);
    $("#zValue").textContent = format(v.z);
    $("#purityValue").textContent = ((1 + state.radius * state.radius) / 2).toFixed(3);
    $("#entropyValue").textContent = entropy(state.radius).toFixed(3);

    const p0 = rho00 * 100;
    const p1 = rho11 * 100;
    $("#p0Value").textContent = `${p0.toFixed(1)}%`;
    $("#p1Value").textContent = `${p1.toFixed(1)}%`;
    $("#p0Bar").style.width = `${p0}%`;
    $("#p1Bar").style.width = `${p1}%`;

    const cells = $("#densityMatrix").querySelectorAll("b");
    cells[0].textContent = format(rho00);
    cells[1].textContent = complex(rho01re, rho01im);
    cells[2].textContent = complex(rho01re, -rho01im);
    cells[3].textContent = format(rho11);

    const badge = $("#stateBadge");
    badge.classList.toggle("pure", pure);
    badge.classList.toggle("mixed", !pure);
    badge.lastChild.nodeValue = pure ? "PURE STATE" : (fullyMixed ? "MAXIMALLY MIXED" : "MIXED STATE");

    const ket = $("#ketReadout");
    ket.querySelector("span").textContent = pure ? "PURE STATE VECTOR" : (fullyMixed ? "DIRECTION UNDEFINED AT THE CENTER" : "EIGENSTATE DIRECTION — MIXEDNESS SET BY |r|");
    ket.querySelector("strong").textContent = fullyMixed ? "ρ = I / 2" : amplitudeText();

    [thetaInput, phiInput, radiusInput].forEach(setRangeFill);
    $$(".preset").forEach((button) => button.classList.remove("active"));
    draw();
  }

  function syncFromInputs() {
    state.theta = Number(thetaInput.value);
    state.phi = Number(phiInput.value);
    state.radius = Number(radiusInput.value);
    updateReadout();
  }

  function applyState(next, presetName) {
    state.theta = next.theta;
    state.phi = next.phi;
    state.radius = next.radius;
    thetaInput.value = String(next.theta);
    phiInput.value = String(next.phi);
    radiusInput.value = String(next.radius);
    updateReadout();
    if (presetName) {
      const target = $(`.preset[data-state="${presetName}"]`);
      if (target) target.classList.add("active");
    }
  }

  function rotate(point) {
    const cy = Math.cos(state.yaw);
    const sy = Math.sin(state.yaw);
    const cp = Math.cos(state.pitch);
    const sp = Math.sin(state.pitch);
    const cr = Math.cos(state.roll);
    const sr = Math.sin(state.roll);
    const x1 = point.x * cy + point.z * sy;
    const z1 = -point.x * sy + point.z * cy;
    const y1 = point.y * cp - z1 * sp;
    return {
      x: x1 * cr - y1 * sr,
      y: x1 * sr + y1 * cr,
      z: point.y * sp + z1 * cp
    };
  }

  function project(point, scale, cx, cy) {
    const p = rotate(point);
    const perspective = 3.7 / (3.7 - p.z * 0.34);
    return { x: cx + p.x * scale * perspective, y: cy - p.y * scale * perspective, z: p.z, f: perspective };
  }

  function line3d(a, b, options, scale, cx, cy) {
    const pa = project(a, scale, cx, cy);
    const pb = project(b, scale, cx, cy);
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.strokeStyle = options.color;
    ctx.lineWidth = options.width || 1;
    if (options.dash) ctx.setLineDash(options.dash);
    ctx.stroke();
    ctx.setLineDash([]);
    return { a: pa, b: pb };
  }

  function curve3d(points, color, width, scale, cx, cy, dash) {
    const projected = points.map((point) => project(point, scale, cx, cy));
    ctx.beginPath();
    projected.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    if (dash) ctx.setLineDash(dash);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function circlePoints(axis, offset, radius, segments = 72) {
    const points = [];
    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments * Math.PI * 2;
      if (axis === "z") points.push({ x: radius * Math.cos(t), y: radius * Math.sin(t), z: offset });
      if (axis === "y") points.push({ x: radius * Math.cos(t), y: offset, z: radius * Math.sin(t) });
      if (axis === "x") points.push({ x: offset, y: radius * Math.cos(t), z: radius * Math.sin(t) });
    }
    return points;
  }

  function arrow3d(from, to, color, scale, cx, cy) {
    const projected = line3d(from, to, { color, width: 2.4 }, scale, cx, cy);
    const dx = projected.b.x - projected.a.x;
    const dy = projected.b.y - projected.a.y;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    const size = 9;
    ctx.beginPath();
    ctx.moveTo(projected.b.x, projected.b.y);
    ctx.lineTo(projected.b.x - ux * size - uy * size * 0.5, projected.b.y - uy * size + ux * size * 0.5);
    ctx.lineTo(projected.b.x - ux * size + uy * size * 0.5, projected.b.y - uy * size - ux * size * 0.5);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    return projected.b;
  }

  function label(text, point, color, scale, cx, cy, dx = 0, dy = 0, fontScale = 1) {
    const p = project(point, scale, cx, cy);
    const baseFontSize = Math.max(12, Math.min(15, scale * 0.078));
    const fontSize = Math.max(10, baseFontSize * fontScale);
    ctx.fillStyle = color;
    ctx.font = `600 ${fontSize}px Consolas, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const halfWidth = ctx.measureText(text).width / 2;
    const safeX = clamp(p.x + dx, halfWidth + 5, state.width - halfWidth - 5);
    const safeY = clamp(p.y + dy, fontSize, state.height - fontSize);
    ctx.fillText(text, safeX, safeY);
  }

  function stateAxisLabel(name, formula, point, color, scale, cx, cy) {
    label(name, point, color, scale, cx, cy, 0, -8);
    label(formula, point, "rgba(224, 232, 239, 0.78)", scale, cx, cy, 0, 10, 0.78);
  }

  function draw() {
    if (!ctx || !state.width || !state.height) return;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.clearRect(0, 0, state.width, state.height);

    const cx = state.width / 2;
    const cy = state.height / 2 + 5;
    const scale = Math.min(state.width, state.height) * 0.34;

    const glow = ctx.createRadialGradient(cx, cy, scale * 0.15, cx, cy, scale * 1.25);
    glow.addColorStop(0, "rgba(45, 184, 180, 0.09)");
    glow.addColorStop(0.62, "rgba(20, 91, 108, 0.035)");
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(cx - scale * 1.4, cy - scale * 1.4, scale * 2.8, scale * 2.8);

    ctx.beginPath();
    ctx.arc(cx, cy, scale * 1.01, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.sphere;
    ctx.fill();

    [-0.75, -0.5, -0.25, 0.25, 0.5, 0.75].forEach((offset) => {
      const r = Math.sqrt(1 - offset * offset);
      curve3d(circlePoints("z", offset, r), COLORS.backGrid, 0.7, scale, cx, cy, [2, 4]);
    });
    for (let deg = 0; deg < 180; deg += 30) {
      const a = deg * Math.PI / 180;
      const points = [];
      for (let i = 0; i <= 72; i += 1) {
        const t = i / 72 * Math.PI * 2;
        points.push({ x: Math.cos(t) * Math.cos(a), y: Math.cos(t) * Math.sin(a), z: Math.sin(t) });
      }
      curve3d(points, COLORS.backGrid, 0.7, scale, cx, cy, [2, 4]);
    }

    curve3d(circlePoints("z", 0, 1), COLORS.grid, 1, scale, cx, cy);
    curve3d(circlePoints("y", 0, 1), COLORS.grid, 1, scale, cx, cy);
    curve3d(circlePoints("x", 0, 1), COLORS.grid, 1, scale, cx, cy);

    line3d({ x: -1.2, y: 0, z: 0 }, { x: 1.2, y: 0, z: 0 }, { color: "rgba(255,157,89,.46)", width: 1 }, scale, cx, cy);
    line3d({ x: 0, y: -1.2, z: 0 }, { x: 0, y: 1.2, z: 0 }, { color: "rgba(169,147,255,.46)", width: 1 }, scale, cx, cy);
    line3d({ x: 0, y: 0, z: -1.2 }, { x: 0, y: 0, z: 1.2 }, { color: "rgba(69,227,214,.48)", width: 1 }, scale, cx, cy);

    stateAxisLabel("+X  |+⟩", "(|0⟩ + |1⟩) / √2", { x: 1.28, y: 0, z: 0 }, COLORS.x, scale, cx, cy);
    stateAxisLabel("−X  |−⟩", "(|0⟩ − |1⟩) / √2", { x: -1.28, y: 0, z: 0 }, COLORS.x, scale, cx, cy);
    label("+Y", { x: 0, y: 1.28, z: 0 }, COLORS.y, scale, cx, cy);
    label("−Y", { x: 0, y: -1.28, z: 0 }, COLORS.y, scale, cx, cy);
    label("+Z  |0⟩", { x: 0, y: 0, z: 1.29 }, COLORS.z, scale, cx, cy);
    label("−Z  |1⟩", { x: 0, y: 0, z: -1.29 }, COLORS.z, scale, cx, cy);

    const v = blochVector();
    const tip = arrow3d({ x: 0, y: 0, z: 0 }, v, COLORS.vector, scale, cx, cy);
    const halo = 7 + state.radius * 2;
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, halo, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(69, 227, 214, .12)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 3.1, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.cyan;
    ctx.shadowColor = COLORS.cyan;
    ctx.shadowBlur = 13;
    ctx.fill();
    ctx.shadowBlur = 0;

    const origin = project({ x: 0, y: 0, z: 0 }, scale, cx, cy);
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = "#7d95a7";
    ctx.fill();
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    state.width = Math.max(1, rect.width);
    state.height = Math.max(1, rect.height);
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(state.width * state.dpr);
    canvas.height = Math.round(state.height * state.dpr);
    draw();
  }

  [thetaInput, phiInput, radiusInput].forEach((input) => input.addEventListener("input", syncFromInputs));

  $$(".preset").forEach((button) => {
    button.addEventListener("click", () => applyState(presets[button.dataset.state], button.dataset.state));
  });

  $("#randomPure").addEventListener("click", () => {
    const z = Math.random() * 2 - 1;
    applyState({ theta: Math.acos(z) * 180 / Math.PI, phi: Math.random() * 360, radius: 1 });
  });

  $("#randomMixed").addEventListener("click", () => {
    const z = Math.random() * 2 - 1;
    applyState({ theta: Math.acos(z) * 180 / Math.PI, phi: Math.random() * 360, radius: Math.random() * 0.92 });
  });

  canvas.addEventListener("pointerdown", (event) => {
    state.dragging = true;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!state.dragging) return;
    const dx = event.clientX - state.lastX;
    const dy = event.clientY - state.lastY;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    state.yaw += dx * 0.008;
    state.pitch = clamp(state.pitch + dy * 0.008, -1.35, 1.35);
    draw();
  });

  function endDrag(event) {
    state.dragging = false;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }

  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  window.addEventListener("resize", resizeCanvas, { passive: true });

  applyState(presets.zero, "zero");
  requestAnimationFrame(resizeCanvas);
})();
