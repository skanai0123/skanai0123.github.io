(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const canvas = $("atlasCanvas");
  const ctx = canvas.getContext("2d");
  const psiInput = $("psiInput");
  const chiInput = $("chiInput");
  const stokesInputs = [$("s1Input"), $("s2Input"), $("s3Input")];
  const stokesOutputs = [$("s1InputValue"), $("s2InputValue"), $("s3InputValue")];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const colors = {
    text: "rgba(238, 247, 243, 0.92)",
    muted: "rgba(175, 201, 202, 0.54)",
    faint: "rgba(100, 229, 219, 0.12)",
    grid: "rgba(100, 229, 219, 0.28)",
    cyan: "#64e5db",
    coral: "#ff765f"
  };

  const state = {
    psi: 0,
    chi: 0,
    yaw: -0.58,
    pitch: -0.25,
    phase: 0,
    dragging: false,
    moved: false,
    pointerId: null,
    lastX: 0,
    lastY: 0
  };

  const initialView = { yaw: -0.58, pitch: -0.25 };

  function degToRad(value) { return value * Math.PI / 180; }
  function radToDeg(value) { return value * 180 / Math.PI; }

  function stokesFromAngles(psiDeg, chiDeg) {
    const psi = degToRad(psiDeg);
    const chi = degToRad(chiDeg);
    return {
      x: Math.cos(2 * chi) * Math.cos(2 * psi),
      y: Math.cos(2 * chi) * Math.sin(2 * psi),
      z: Math.sin(2 * chi)
    };
  }

  function anglesFromStokes(point) {
    return {
      psi: radToDeg(0.5 * Math.atan2(point.y, point.x)),
      chi: radToDeg(0.5 * Math.asin(Math.max(-1, Math.min(1, point.z))))
    };
  }

  function prepareCanvas() {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { width: rect.width, height: rect.height, mobile: rect.width < 600 };
  }

  function getLayout(size) {
    if (size.mobile) {
      return {
        sphere: {
          cx: size.width / 2,
          cy: size.width * 0.49,
          radius: size.width * 0.335
        },
        dividerX: null,
        info: {
          x: 22,
          y: size.height * 0.59,
          height: size.height,
          width: size.width - 44,
          ellipseCx: size.width * 0.72,
          ellipseCy: size.height * 0.705,
          ellipseRadius: Math.min(size.width * 0.18, size.height * 0.12)
        }
      };
    }
    return {
      sphere: {
        cx: size.width * 0.32,
        cy: size.height * 0.50,
        radius: Math.min(size.height * 0.36, size.width * 0.245)
      },
      dividerX: size.width * 0.585,
      info: {
        x: size.width * 0.635,
        y: size.height * 0.12,
        height: size.height,
        width: size.width * 0.31,
        ellipseCx: size.width * 0.79,
        ellipseCy: size.height * 0.39,
        ellipseRadius: Math.min(size.height * 0.16, size.width * 0.105)
      }
    };
  }

  function rotatePoint(point) {
    const cy = Math.cos(state.yaw);
    const sy = Math.sin(state.yaw);
    const cp = Math.cos(state.pitch);
    const sp = Math.sin(state.pitch);
    const x1 = cy * point.x - sy * point.y;
    const y1 = sy * point.x + cy * point.y;
    return {
      x: x1,
      y: cp * y1 - sp * point.z,
      z: sp * y1 + cp * point.z
    };
  }

  function inverseView(point) {
    const cy = Math.cos(state.yaw);
    const sy = Math.sin(state.yaw);
    const cp = Math.cos(state.pitch);
    const sp = Math.sin(state.pitch);
    const y1 = cp * point.y + sp * point.z;
    const z1 = -sp * point.y + cp * point.z;
    return {
      x: cy * point.x + sy * y1,
      y: -sy * point.x + cy * y1,
      z: z1
    };
  }

  function project(point, sphere, scale = 1) {
    const rotated = rotatePoint(point);
    return {
      x: sphere.cx + rotated.x * sphere.radius * scale,
      y: sphere.cy - rotated.z * sphere.radius * scale,
      depth: rotated.y
    };
  }

  function latitudePoints(z) {
    const radius = Math.sqrt(Math.max(0, 1 - z * z));
    const points = [];
    for (let i = 0; i <= 144; i += 1) {
      const angle = i / 144 * Math.PI * 2;
      points.push({ x: radius * Math.cos(angle), y: radius * Math.sin(angle), z });
    }
    return points;
  }

  function longitudePoints(phi) {
    const points = [];
    for (let i = 0; i <= 144; i += 1) {
      const theta = i / 144 * Math.PI * 2;
      points.push({
        x: Math.cos(theta) * Math.cos(phi),
        y: Math.cos(theta) * Math.sin(phi),
        z: Math.sin(theta)
      });
    }
    return points;
  }

  function drawCurve(points, sphere, front) {
    let drawing = false;
    ctx.beginPath();
    points.forEach((point) => {
      const projected = project(point, sphere);
      const visible = front ? projected.depth >= -0.008 : projected.depth < 0.008;
      if (visible) {
        if (!drawing) ctx.moveTo(projected.x, projected.y);
        else ctx.lineTo(projected.x, projected.y);
        drawing = true;
      } else {
        drawing = false;
      }
    });
    ctx.stroke();
  }

  function drawAxis(sphere, vector, positiveLabel, negativeLabel) {
    const negative = project({ x: -vector.x, y: -vector.y, z: -vector.z }, sphere, 1.13);
    const positive = project(vector, sphere, 1.13);
    ctx.save();
    ctx.strokeStyle = "rgba(190, 239, 232, 0.23)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(negative.x, negative.y);
    ctx.lineTo(positive.x, positive.y);
    ctx.stroke();
    ctx.fillStyle = colors.text;
    ctx.font = "500 13px 'DM Mono', monospace";
    labelAxisEnd(positive, sphere, positiveLabel);
    labelAxisEnd(negative, sphere, negativeLabel);
    ctx.restore();
  }

  function labelAxisEnd(point, sphere, label) {
    const right = point.x >= sphere.cx;
    const lower = point.y >= sphere.cy;
    ctx.textAlign = right ? "left" : "right";
    ctx.textBaseline = lower ? "top" : "bottom";
    ctx.fillText(label, point.x + (right ? 6 : -6), point.y + (lower ? 5 : -5));
  }

  function drawSphere(sphere, mobile) {
    const gradient = ctx.createRadialGradient(
      sphere.cx - sphere.radius * 0.28,
      sphere.cy - sphere.radius * 0.32,
      sphere.radius * 0.04,
      sphere.cx,
      sphere.cy,
      sphere.radius * 1.05
    );
    gradient.addColorStop(0, "rgba(75, 214, 204, 0.12)");
    gradient.addColorStop(0.65, "rgba(28, 101, 117, 0.05)");
    gradient.addColorStop(1, "rgba(2, 14, 24, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(sphere.cx, sphere.cy, sphere.radius, 0, Math.PI * 2);
    ctx.fill();

    const curves = [
      latitudePoints(-0.5), latitudePoints(0), latitudePoints(0.5),
      longitudePoints(0), longitudePoints(Math.PI / 3), longitudePoints(2 * Math.PI / 3)
    ];

    ctx.save();
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = "rgba(100, 229, 219, 0.13)";
    ctx.lineWidth = 0.8;
    curves.forEach((curve) => drawCurve(curve, sphere, false));
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    curves.forEach((curve) => drawCurve(curve, sphere, true));
    ctx.restore();

    ctx.strokeStyle = "rgba(100, 229, 219, 0.62)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(sphere.cx, sphere.cy, sphere.radius, 0, Math.PI * 2);
    ctx.stroke();

    drawAxis(sphere, { x: 1, y: 0, z: 0 }, "+S₁  H", "V  −S₁");
    drawAxis(sphere, { x: 0, y: 1, z: 0 }, "+S₂  +45°", "−45°  −S₂");
    drawAxis(sphere, { x: 0, y: 0, z: 1 }, "+S₃  L", "R  −S₃");

    const selected = project(stokesFromAngles(state.psi, state.chi), sphere);
    ctx.save();
    ctx.setLineDash([3, 6]);
    ctx.strokeStyle = "rgba(255, 118, 95, 0.38)";
    ctx.beginPath();
    ctx.moveTo(sphere.cx, sphere.cy);
    ctx.lineTo(selected.x, selected.y);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = "rgba(255, 118, 95, 0.13)";
    ctx.beginPath();
    ctx.arc(selected.x, selected.y, mobile ? 14 : 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = selected.depth >= 0 ? colors.coral : "rgba(255, 118, 95, 0.54)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(selected.x, selected.y, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = selected.depth >= 0 ? colors.coral : "rgba(255, 118, 95, 0.64)";
    ctx.beginPath();
    ctx.arc(selected.x, selected.y, 3, 0, Math.PI * 2);
    ctx.fill();

  }

  function ellipsePoint(t, radius, psi, chi) {
    const a = Math.cos(chi);
    const b = Math.sin(chi);
    return {
      x: radius * (a * Math.cos(t) * Math.cos(psi) - b * Math.sin(t) * Math.sin(psi)),
      y: radius * (a * Math.cos(t) * Math.sin(psi) + b * Math.sin(t) * Math.cos(psi))
    };
  }

  function drawArrow(fromX, fromY, toX, toY) {
    const angle = Math.atan2(toY - fromY, toX - fromX);
    ctx.strokeStyle = colors.coral;
    ctx.fillStyle = colors.coral;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - 7 * Math.cos(angle - 0.5), toY - 7 * Math.sin(angle - 0.5));
    ctx.lineTo(toX - 7 * Math.cos(angle + 0.5), toY - 7 * Math.sin(angle + 0.5));
    ctx.closePath();
    ctx.fill();
  }

  function describeState() {
    const absChi = Math.abs(state.chi);
    if (absChi > 44.75) return state.chi > 0 ? { name: "左円偏光", symbol: "L" } : { name: "右円偏光", symbol: "R" };
    if (absChi < 0.25) {
      const normalized = ((state.psi % 180) + 180) % 180;
      if (normalized < 0.25 || normalized > 179.75) return { name: "水平直線偏光", symbol: "H" };
      if (Math.abs(normalized - 90) < 0.25) return { name: "垂直直線偏光", symbol: "V" };
      if (Math.abs(normalized - 45) < 0.25) return { name: "+45° 直線偏光", symbol: "+45" };
      if (Math.abs(normalized - 135) < 0.25) return { name: "−45° 直線偏光", symbol: "−45" };
      return { name: `${state.psi.toFixed(1)}° 直線偏光`, symbol: "LP" };
    }
    return state.chi > 0 ? { name: "左回り楕円偏光", symbol: "LE" } : { name: "右回り楕円偏光", symbol: "RE" };
  }

  function formatSigned(value) {
    if (Math.abs(value) < 0.0005) return "0.000";
    return `${value > 0 ? "+" : ""}${value.toFixed(3)}`;
  }

  function drawStokesBar(x, y, width, label, value) {
    ctx.fillStyle = colors.muted;
    ctx.font = "12px 'DM Mono', monospace";
    ctx.textAlign = "left";
    ctx.fillText(label, x, y - 7);
    ctx.textAlign = "right";
    ctx.fillStyle = colors.text;
    ctx.fillText(formatSigned(value), x + width, y - 7);
    const trackY = y + 3;
    ctx.fillStyle = "rgba(238, 247, 243, 0.10)";
    ctx.fillRect(x, trackY, width, 3);
    ctx.fillStyle = colors.cyan;
    if (value >= 0) ctx.fillRect(x + width / 2, trackY, value * width / 2, 3);
    else ctx.fillRect(x + width / 2 + value * width / 2, trackY, -value * width / 2, 3);
    ctx.fillStyle = "rgba(238, 247, 243, 0.25)";
    ctx.fillRect(x + width / 2, trackY - 3, 1, 9);
  }

  function drawInfoPanel(info, mobile) {
    const stokes = stokesFromAngles(state.psi, state.chi);
    const description = describeState();
    const x = info.x;
    const width = info.width;

    ctx.fillStyle = colors.muted;
    ctx.font = "12px 'DM Mono', monospace";
    ctx.textAlign = "left";
    ctx.fillText("CURRENT POLARIZATION", x, info.y);

    ctx.fillStyle = colors.text;
    const titleSize = mobile ? 19 : Math.max(18, Math.min(26, width / 8));
    ctx.font = `700 ${titleSize}px 'Noto Sans JP', sans-serif`;
    ctx.fillText(description.name, x, info.y + (mobile ? 28 : 38));
    ctx.fillStyle = colors.cyan;
    ctx.font = `500 ${mobile ? 15 : 18}px 'DM Mono', monospace`;
    ctx.textAlign = "right";
    ctx.fillText(description.symbol, x + width, info.y + (mobile ? 28 : 38));

    const ellipseCx = info.ellipseCx;
    const ellipseCy = info.ellipseCy;
    const ellipseRadius = info.ellipseRadius;
    ctx.strokeStyle = colors.faint;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ellipseCx - ellipseRadius * 1.25, ellipseCy);
    ctx.lineTo(ellipseCx + ellipseRadius * 1.25, ellipseCy);
    ctx.moveTo(ellipseCx, ellipseCy - ellipseRadius * 1.25);
    ctx.lineTo(ellipseCx, ellipseCy + ellipseRadius * 1.25);
    ctx.stroke();

    const psi = degToRad(state.psi);
    const chi = degToRad(state.chi);
    ctx.strokeStyle = colors.cyan;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 180; i += 1) {
      const point = ellipsePoint(i / 180 * Math.PI * 2, ellipseRadius, psi, chi);
      const px = ellipseCx + point.x;
      const py = ellipseCy - point.y;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    const current = ellipsePoint(state.phase, ellipseRadius, psi, chi);
    drawArrow(ellipseCx, ellipseCy, ellipseCx + current.x, ellipseCy - current.y);

    ctx.fillStyle = colors.muted;
    ctx.font = "11px 'DM Mono', monospace";
    ctx.textAlign = "left";
    ctx.fillText("E-FIELD TRAJECTORY", x, mobile ? info.y + 58 : info.y + 78);

    if (mobile) {
      const barY = info.y + 112;
      drawStokesBar(x, barY, width, "S₁  H / V", stokes.x);
      drawStokesBar(x, barY + 30, width, "S₂  +45° / −45°", stokes.y);
      drawStokesBar(x, barY + 60, width, "S₃  L / R", stokes.z);
      ctx.fillStyle = colors.muted;
      ctx.font = "11px 'DM Mono', monospace";
      ctx.textAlign = "left";
      ctx.fillText(`S = (${stokes.x.toFixed(2)}, ${stokes.y.toFixed(2)}, ${stokes.z.toFixed(2)})`, x, barY + 92);
    } else {
      const barY = info.height * 0.57;
      drawStokesBar(x, barY, width, "S₁  H / V", stokes.x);
      drawStokesBar(x, barY + 38, width, "S₂  +45° / −45°", stokes.y);
      drawStokesBar(x, barY + 76, width, "S₃  L / R", stokes.z);
      ctx.fillStyle = colors.muted;
      ctx.font = "11px 'DM Mono', monospace";
      ctx.textAlign = "left";
      ctx.fillText(`S = (${stokes.x.toFixed(2)}, ${stokes.y.toFixed(2)}, ${stokes.z.toFixed(2)})`, x, barY + 105);
      ctx.fillText("S₁ = cos 2χ cos 2ψ", x, barY + 130);
      ctx.fillText("S₂ = cos 2χ sin 2ψ", x, barY + 146);
      ctx.fillText("S₃ = sin 2χ", x, barY + 162);
    }
  }

  function draw() {
    const size = prepareCanvas();
    const layout = getLayout(size);
    ctx.clearRect(0, 0, size.width, size.height);

    if (layout.dividerX) {
      ctx.strokeStyle = "rgba(100, 229, 219, 0.13)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(layout.dividerX, size.height * 0.08);
      ctx.lineTo(layout.dividerX, size.height * 0.92);
      ctx.stroke();
    } else {
      ctx.strokeStyle = "rgba(100, 229, 219, 0.13)";
      ctx.beginPath();
      ctx.moveTo(20, size.height * 0.565);
      ctx.lineTo(size.width - 20, size.height * 0.565);
      ctx.stroke();
    }

    drawSphere(layout.sphere, size.mobile);
    drawInfoPanel(layout.info, size.mobile);
  }

  function updatePresetSelection() {
    document.querySelectorAll(".preset").forEach((button) => {
      const matches = Math.abs(Number(button.dataset.psi) - state.psi) < 0.25 && Math.abs(Number(button.dataset.chi) - state.chi) < 0.25;
      button.classList.toggle("is-active", matches);
    });
  }

  function renderState() {
    const stokes = stokesFromAngles(state.psi, state.chi);
    psiInput.value = String(state.psi);
    chiInput.value = String(state.chi);
    $("psiValue").textContent = `${state.psi.toFixed(1)}°`;
    $("chiValue").textContent = `${state.chi.toFixed(1)}°`;
    [stokes.x, stokes.y, stokes.z].forEach((value, index) => {
      stokesInputs[index].value = String(value);
      stokesOutputs[index].textContent = formatSigned(value);
    });
    updatePresetSelection();
    draw();
  }

  function setAngles(psi, chi) {
    state.psi = Math.max(-90, Math.min(90, Number(psi)));
    state.chi = Math.max(-45, Math.min(45, Number(chi)));
    renderState();
  }

  function setStokesComponent(index, rawValue) {
    const current = stokesFromAngles(state.psi, state.chi);
    const values = [current.x, current.y, current.z];
    const target = Math.max(-1, Math.min(1, Number(rawValue)));
    const remaining = Math.sqrt(Math.max(0, 1 - target * target));
    const otherIndices = [0, 1, 2].filter((item) => item !== index);
    const otherNorm = Math.hypot(values[otherIndices[0]], values[otherIndices[1]]);

    values[index] = target;
    if (otherNorm > 1e-8) {
      const scale = remaining / otherNorm;
      values[otherIndices[0]] *= scale;
      values[otherIndices[1]] *= scale;
    } else {
      values[otherIndices[0]] = remaining;
      values[otherIndices[1]] = 0;
    }

    const angles = anglesFromStokes({ x: values[0], y: values[1], z: values[2] });
    setAngles(angles.psi, angles.chi);
  }

  psiInput.addEventListener("input", () => setAngles(psiInput.value, chiInput.value));
  chiInput.addEventListener("input", () => setAngles(psiInput.value, chiInput.value));
  stokesInputs.forEach((input, index) => {
    input.addEventListener("input", () => setStokesComponent(index, input.value));
  });

  document.querySelectorAll(".mode-button").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.controlMode;
      document.querySelectorAll(".mode-button").forEach((item) => item.classList.toggle("is-active", item === button));
      $("angleControls").hidden = mode !== "angles";
      $("stokesControls").hidden = mode !== "stokes";
    });
  });

  document.querySelectorAll(".preset").forEach((button) => {
    button.addEventListener("click", () => setAngles(button.dataset.psi, button.dataset.chi));
  });

  $("showAntipode").addEventListener("click", () => {
    const point = stokesFromAngles(state.psi, state.chi);
    const antipode = anglesFromStokes({ x: -point.x, y: -point.y, z: -point.z });
    setAngles(Math.round(antipode.psi * 2) / 2, Math.round(antipode.chi * 2) / 2);
  });

  $("resetView").addEventListener("click", () => {
    state.yaw = initialView.yaw;
    state.pitch = initialView.pitch;
    draw();
  });

  function pointFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  canvas.addEventListener("pointerdown", (event) => {
    const point = pointFromEvent(event);
    const layout = getLayout(prepareCanvas());
    const dx = point.x - layout.sphere.cx;
    const dy = point.y - layout.sphere.cy;
    if (dx * dx + dy * dy > Math.pow(layout.sphere.radius * 1.18, 2)) return;
    state.dragging = true;
    state.moved = false;
    state.pointerId = event.pointerId;
    state.lastX = point.x;
    state.lastY = point.y;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!state.dragging || event.pointerId !== state.pointerId) return;
    const point = pointFromEvent(event);
    const dx = point.x - state.lastX;
    const dy = point.y - state.lastY;
    if (Math.abs(dx) + Math.abs(dy) > 2) state.moved = true;
    if (state.moved) {
      state.yaw += dx * 0.009;
      state.pitch = Math.max(-1.25, Math.min(1.25, state.pitch - dy * 0.009));
      draw();
    }
    state.lastX = point.x;
    state.lastY = point.y;
  });

  canvas.addEventListener("pointerup", (event) => {
    if (event.pointerId !== state.pointerId) return;
    const point = pointFromEvent(event);
    if (!state.moved) {
      const layout = getLayout(prepareCanvas());
      const u = (point.x - layout.sphere.cx) / layout.sphere.radius;
      const v = -(point.y - layout.sphere.cy) / layout.sphere.radius;
      const radius2 = u * u + v * v;
      if (radius2 <= 1) {
        const worldPoint = inverseView({ x: u, y: Math.sqrt(Math.max(0, 1 - radius2)), z: v });
        const angles = anglesFromStokes(worldPoint);
        setAngles(Math.round(angles.psi * 2) / 2, Math.round(angles.chi * 2) / 2);
      }
    }
    state.dragging = false;
    state.pointerId = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointercancel", () => {
    state.dragging = false;
    state.pointerId = null;
  });

  let lastFrame = performance.now();
  function animate(now) {
    const elapsed = Math.min(40, now - lastFrame);
    lastFrame = now;
    if (!reduceMotion) {
      state.phase = (state.phase + elapsed * 0.0018) % (Math.PI * 2);
      draw();
    }
    window.requestAnimationFrame(animate);
  }

  new ResizeObserver(draw).observe(canvas);
  renderState();
  window.requestAnimationFrame(animate);
})();
