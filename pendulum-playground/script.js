(function () {
  const els = {
    length: document.getElementById("length"),
    mass: document.getElementById("mass"),
    length2: document.getElementById("length2"),
    mass2: document.getElementById("mass2"),
    gravity: document.getElementById("gravity"),
    damping1: document.getElementById("damping1"),
    damping2: document.getElementById("damping2"),
    springK: document.getElementById("springK"),
    springK2: document.getElementById("springK2"),
    smallAngleMode: document.getElementById("smallAngleMode"),
    useSpring: document.getElementById("useSpring"),
    radialDamping1: document.getElementById("radialDamping1"),
    radialDamping2: document.getElementById("radialDamping2"),
    theta0: document.getElementById("theta0"),
    omega0: document.getElementById("omega0"),
    r0: document.getElementById("r0"),
    vr0: document.getElementById("vr0"),
    enableSecond: document.getElementById("enableSecond"),
    theta02: document.getElementById("theta02"),
    omega02: document.getElementById("omega02"),
    r02: document.getElementById("r02"),
    vr02: document.getElementById("vr02"),
    dt: document.getElementById("dt"),
    timeScale: document.getElementById("timeScale"),
    applyBtn: document.getElementById("applyBtn"),
    toggleBtn: document.getElementById("toggleBtn"),
    resetBtn: document.getElementById("resetBtn"),
    captureBtn: document.getElementById("captureBtn"),
    toggleMotionBtn: document.getElementById("toggleMotionBtn"),
    togglePhaseBtn: document.getElementById("togglePhaseBtn"),
    toggleEnergyBtn: document.getElementById("toggleEnergyBtn"),
    togglePoincareBtn: document.getElementById("togglePoincareBtn"),
    status: document.getElementById("status"),
    tNow: document.getElementById("tNow"),
    rNow: document.getElementById("rNow"),
    thetaNow: document.getElementById("thetaNow"),
    omegaNow: document.getElementById("omegaNow"),
    rNow2: document.getElementById("rNow2"),
    thetaNow2: document.getElementById("thetaNow2"),
    omegaNow2: document.getElementById("omegaNow2"),
    metric2: document.getElementById("metric2"),
    motionSection: document.getElementById("motionSection"),
    simCanvas: document.getElementById("simCanvas"),
    phaseSection: document.getElementById("phaseSection"),
    phaseCanvas: document.getElementById("phaseCanvas"),
    poincareCanvas: document.getElementById("poincareCanvas"),
    poincareSection: document.getElementById("poincareSection"),
    energyCanvas: document.getElementById("energyCanvas"),
    energySection: document.getElementById("energySection"),
    equationMode: document.getElementById("equation-mode"),
    equationLagrangian: document.getElementById("equation-lagrangian"),
    equationImpl: document.getElementById("equation-impl")
  };

  const ctxSim = els.simCanvas.getContext("2d");
  const ctxPhase = els.phaseCanvas.getContext("2d");
  const ctxPoincare = els.poincareCanvas.getContext("2d");
  const ctxEnergy = els.energyCanvas.getContext("2d");
  const secondOnlyEls = Array.from(document.querySelectorAll("[data-second-only]"));

  const DPR = Math.max(1, window.devicePixelRatio || 1);
  const phaseHistory1 = [];
  const phaseHistory2 = [];
  const energyHistory = [];
  const poincarePoints = [];
  const bobTrail1 = [];
  const bobTrail2 = [];
  const MAX_BOB_TRAIL = 180;
  const MIN_LEN = 0.05;

  let params = null;
  let state = null;
  let isRunning = false;
  let wasRunningBeforeDrag = false;
  let draggingBobIndex = -1;
  let rafId = 0;
  let lastFrameTs = 0;
  let accumulator = 0;
  let pendulumGeom = null;
  let motionMaxReach = 1;
  let showMotionPlot = true;
  let showPhasePlot = true;
  let showEnergyPlot = true;
  let showPoincarePlot = true;

  function clampPositive(value, fallback) {
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  function toRad(deg) {
    return (deg * Math.PI) / 180;
  }

  function toDeg(rad) {
    return (rad * 180) / Math.PI;
  }

  function wrapAngle(rad) {
    let x = rad;
    while (x > Math.PI) x -= 2 * Math.PI;
    while (x < -Math.PI) x += 2 * Math.PI;
    return x;
  }

  function vecLen(x, y) {
    return Math.hypot(x, y);
  }

  function safeUnit(x, y) {
    const len = Math.max(1e-9, vecLen(x, y));
    return { ux: x / len, uy: y / len, len };
  }

  function parseParams() {
    const L01 = clampPositive(Number(els.length.value), 1.0);
    const L02 = clampPositive(Number(els.length2.value), 1.0);
    return {
      L01,
      L02,
      m1: clampPositive(Number(els.mass.value), 1.0),
      m2: clampPositive(Number(els.mass2.value), 1.0),
      g: clampPositive(Number(els.gravity.value), 9.81),
      cTheta1: Math.max(0, Number(els.damping1.value) || 0),
      cTheta2: Math.max(0, Number(els.damping2.value) || 0),
      k1: Math.max(0, Number(els.springK.value) || 0),
      k2: Math.max(0, Number(els.springK2.value) || 0),
      useSpring: !!els.useSpring.checked,
      smallAngleMode: !!els.smallAngleMode.checked && !els.useSpring.checked,
      cR1: Math.max(0, Number(els.radialDamping1.value) || 0),
      cR2: Math.max(0, Number(els.radialDamping2.value) || 0),
      theta0: toRad(Number(els.theta0.value) || 0),
      omega0: Number(els.omega0.value) || 0,
      r0: Math.max(MIN_LEN, Number(els.r0.value) || L01),
      vr0: Number(els.vr0.value) || 0,
      enableSecond: !!els.enableSecond.checked,
      theta02: toRad(Number(els.theta02.value) || 0),
      omega02: Number(els.omega02.value) || 0,
      r02: Math.max(MIN_LEN, Number(els.r02.value) || L02),
      vr02: Number(els.vr02.value) || 0,
      dt: clampPositive(Number(els.dt.value), 0.002),
      timeScale: clampPositive(Number(els.timeScale.value), 1.0)
    };
  }

  function updateInputViews(p) {
    els.length.value = p.L01;
    els.mass.value = p.m1;
    els.length2.value = p.L02;
    els.mass2.value = p.m2;
    els.gravity.value = p.g;
    els.damping1.value = p.cTheta1;
    els.damping2.value = p.cTheta2;
    els.springK.value = p.k1;
    els.springK2.value = p.k2;
    els.useSpring.checked = p.useSpring;
    els.smallAngleMode.checked = p.smallAngleMode;
    syncLinearizedAvailability();
    els.radialDamping1.value = p.cR1;
    els.radialDamping2.value = p.cR2;
    els.theta0.value = toDeg(p.theta0).toFixed(3);
    els.omega0.value = p.omega0.toFixed(6);
    els.r0.value = p.r0.toFixed(4);
    els.vr0.value = p.vr0.toFixed(6);
    els.enableSecond.checked = p.enableSecond;
    els.theta02.value = toDeg(p.theta02).toFixed(3);
    els.omega02.value = p.omega02.toFixed(6);
    els.r02.value = p.r02.toFixed(4);
    els.vr02.value = p.vr02.toFixed(6);
    els.dt.value = p.dt;
    els.timeScale.value = p.timeScale;
    syncSecondVisibility(p.enableSecond);
  }

  function syncLinearizedAvailability() {
    const locked = !!els.useSpring.checked;
    if (locked) {
      els.smallAngleMode.checked = false;
    }
    els.smallAngleMode.disabled = locked;
    els.smallAngleMode.title = locked ? "Use spring is ON, so linearized mode is unavailable." : "";
  }

  function syncSecondVisibility(enabled) {
    els.metric2.style.display = enabled ? "" : "none";
    for (const el of secondOnlyEls) {
      el.style.display = enabled ? "" : "none";
      const inputs = el.querySelectorAll("input, select, textarea, button");
      for (const input of inputs) {
        input.disabled = !enabled;
      }
    }
  }

  function polarToCartesian(r, theta, vr, omega) {
    const s = Math.sin(theta);
    const c = Math.cos(theta);
    const x = r * s;
    const y = r * c;
    const vx = vr * s + r * omega * c;
    const vy = vr * c - r * omega * s;
    return { x, y, vx, vy };
  }

  function getQ1FromCartesian(s) {
    const x = s.x1;
    const y = s.y1;
    const vx = s.vx1;
    const vy = s.vy1;
    const r = Math.max(MIN_LEN, vecLen(x, y));
    const theta = wrapAngle(Math.atan2(x, y));
    const vr = (x * vx + y * vy) / r;
    const omega = (y * vx - x * vy) / (r * r);
    return { r, theta, vr, omega };
  }

  function getQ2RelFromCartesian(s) {
    const dx = s.x2 - s.x1;
    const dy = s.y2 - s.y1;
    const dvx = s.vx2 - s.vx1;
    const dvy = s.vy2 - s.vy1;
    const r = Math.max(MIN_LEN, vecLen(dx, dy));
    const theta = wrapAngle(Math.atan2(dx, dy));
    const vr = (dx * dvx + dy * dvy) / r;
    const omega = (dy * dvx - dx * dvy) / (r * r);
    return { r, theta, vr, omega };
  }

  function initStateFromParams(p) {
    const c1 = polarToCartesian(p.r0, p.theta0, p.vr0, p.omega0);
    const c2rel = polarToCartesian(p.r02, p.theta02, p.vr02, p.omega02);
    const x1 = c1.x;
    const y1 = c1.y;
    const vx1 = c1.vx;
    const vy1 = c1.vy;
    const x2 = p.enableSecond ? x1 + c2rel.x : x1;
    const y2 = p.enableSecond ? y1 + c2rel.y : y1;
    const vx2 = p.enableSecond ? vx1 + c2rel.vx : vx1;
    const vy2 = p.enableSecond ? vy1 + c2rel.vy : vy1;
    return { x1, y1, vx1, vy1, x2, y2, vx2, vy2, t: 0 };
  }

  function derivCartesian(s, p) {
    const drag1 = p.cTheta1 + p.cR1;
    const drag2 = p.cTheta2 + p.cR2;
    const k1Eff = p.useSpring ? p.k1 : 0;
    const k2Eff = p.useSpring ? p.k2 : 0;
    const m1 = p.m1;
    const m2 = p.m2;

    const u1 = safeUnit(s.x1, s.y1);
    const stretch1 = u1.len - p.L01;
    const f1x = -k1Eff * stretch1 * u1.ux;
    const f1y = -k1Eff * stretch1 * u1.uy;

    let f2on1x = 0;
    let f2on1y = 0;
    let f1on2x = 0;
    let f1on2y = 0;

    if (p.enableSecond) {
      const dx = s.x2 - s.x1;
      const dy = s.y2 - s.y1;
      const u12 = safeUnit(dx, dy);
      const stretch12 = u12.len - p.L02;
      const fsx = k2Eff * stretch12 * u12.ux;
      const fsy = k2Eff * stretch12 * u12.uy;
      f2on1x = fsx;
      f2on1y = fsy;
      f1on2x = -fsx;
      f1on2y = -fsy;
    }

    let a1x;
    let a1y;
    let a2x;
    let a2y;

    if (p.smallAngleMode) {
      const q1 = getQ1FromCartesian(s);
      const t1x = Math.cos(q1.theta);
      const t1y = -Math.sin(q1.theta);
      const ft1 = -p.m1 * p.g * q1.theta;
      const fg1x = ft1 * t1x;
      const fg1y = ft1 * t1y;

      let fg2x = 0;
      let fg2y = 0;
      if (p.enableSecond) {
        const q2 = getQ2RelFromCartesian(s);
        const t2x = Math.cos(q2.theta);
        const t2y = -Math.sin(q2.theta);
        const ft2 = -p.m2 * p.g * q2.theta;
        fg2x = ft2 * t2x;
        fg2y = ft2 * t2y;
      }

      a1x = (f1x + f2on1x + fg1x) / m1 - drag1 * s.vx1;
      a1y = (f1y + f2on1y + fg1y) / m1 - drag1 * s.vy1;
      a2x = p.enableSecond ? (f1on2x + fg2x) / m2 - drag2 * s.vx2 : a1x;
      a2y = p.enableSecond ? (f1on2y + fg2y) / m2 - drag2 * s.vy2 : a1y;
    } else {
      a1x = (f1x + f2on1x) / m1 - drag1 * s.vx1;
      a1y = (f1y + f2on1y) / m1 + p.g - drag1 * s.vy1;
      a2x = p.enableSecond ? f1on2x / m2 - drag2 * s.vx2 : a1x;
      a2y = p.enableSecond ? f1on2y / m2 + p.g - drag2 * s.vy2 : a1y;
    }

    return {
      dx1: s.vx1,
      dy1: s.vy1,
      dvx1: a1x,
      dvy1: a1y,
      dx2: s.vx2,
      dy2: s.vy2,
      dvx2: a2x,
      dvy2: a2y
    };
  }

  function rk4StepSpring(s, p, h) {
    const k1 = derivCartesian(s, p);
    const s2 = {
      x1: s.x1 + 0.5 * h * k1.dx1, y1: s.y1 + 0.5 * h * k1.dy1,
      vx1: s.vx1 + 0.5 * h * k1.dvx1, vy1: s.vy1 + 0.5 * h * k1.dvy1,
      x2: s.x2 + 0.5 * h * k1.dx2, y2: s.y2 + 0.5 * h * k1.dy2,
      vx2: s.vx2 + 0.5 * h * k1.dvx2, vy2: s.vy2 + 0.5 * h * k1.dvy2
    };
    const k2 = derivCartesian(s2, p);
    const s3 = {
      x1: s.x1 + 0.5 * h * k2.dx1, y1: s.y1 + 0.5 * h * k2.dy1,
      vx1: s.vx1 + 0.5 * h * k2.dvx1, vy1: s.vy1 + 0.5 * h * k2.dvy1,
      x2: s.x2 + 0.5 * h * k2.dx2, y2: s.y2 + 0.5 * h * k2.dy2,
      vx2: s.vx2 + 0.5 * h * k2.dvx2, vy2: s.vy2 + 0.5 * h * k2.dvy2
    };
    const k3 = derivCartesian(s3, p);
    const s4 = {
      x1: s.x1 + h * k3.dx1, y1: s.y1 + h * k3.dy1,
      vx1: s.vx1 + h * k3.dvx1, vy1: s.vy1 + h * k3.dvy1,
      x2: s.x2 + h * k3.dx2, y2: s.y2 + h * k3.dy2,
      vx2: s.vx2 + h * k3.dvx2, vy2: s.vy2 + h * k3.dvy2
    };
    const k4 = derivCartesian(s4, p);

    s.x1 += (h / 6) * (k1.dx1 + 2 * k2.dx1 + 2 * k3.dx1 + k4.dx1);
    s.y1 += (h / 6) * (k1.dy1 + 2 * k2.dy1 + 2 * k3.dy1 + k4.dy1);
    s.vx1 += (h / 6) * (k1.dvx1 + 2 * k2.dvx1 + 2 * k3.dvx1 + k4.dvx1);
    s.vy1 += (h / 6) * (k1.dvy1 + 2 * k2.dvy1 + 2 * k3.dvy1 + k4.dvy1);
    s.x2 += (h / 6) * (k1.dx2 + 2 * k2.dx2 + 2 * k3.dx2 + k4.dx2);
    s.y2 += (h / 6) * (k1.dy2 + 2 * k2.dy2 + 2 * k3.dy2 + k4.dy2);
    s.vx2 += (h / 6) * (k1.dvx2 + 2 * k2.dvx2 + 2 * k3.dvx2 + k4.dvx2);
    s.vy2 += (h / 6) * (k1.dvy2 + 2 * k2.dvy2 + 2 * k3.dvy2 + k4.dvy2);
    s.t += h;

    if (!p.enableSecond) {
      s.x2 = s.x1;
      s.y2 = s.y1;
      s.vx2 = s.vx1;
      s.vy2 = s.vy1;
    }
  }

  function enforceRodConstraints(s, p) {
    const u1 = safeUnit(s.x1, s.y1);
    s.x1 = u1.ux * p.L01;
    s.y1 = u1.uy * p.L01;
    const vr1 = s.vx1 * u1.ux + s.vy1 * u1.uy;
    s.vx1 -= vr1 * u1.ux;
    s.vy1 -= vr1 * u1.uy;

    if (!p.enableSecond) return;

    const dx = s.x2 - s.x1;
    const dy = s.y2 - s.y1;
    const u12 = safeUnit(dx, dy);
    s.x2 = s.x1 + u12.ux * p.L02;
    s.y2 = s.y1 + u12.uy * p.L02;

    const rvx = s.vx2 - s.vx1;
    const rvy = s.vy2 - s.vy1;
    const vr2 = rvx * u12.ux + rvy * u12.uy;
    s.vx2 -= vr2 * u12.ux;
    s.vy2 -= vr2 * u12.uy;
  }

  function noSpringStateFromCartesian(s, p) {
    const q1 = getQ1FromCartesian(s);
    if (!p.enableSecond) {
      return { theta1: q1.theta, omega1: q1.omega, theta2: q1.theta, omega2: q1.omega };
    }
    const q2Rel = getQ2RelFromCartesian(s);
    return {
      theta1: q1.theta,
      omega1: q1.omega,
      theta2: q2Rel.theta,
      omega2: q2Rel.omega
    };
  }

  function noSpringCartesianFromState(u, p) {
    const s1 = Math.sin(u.theta1);
    const c1 = Math.cos(u.theta1);
    const s2 = Math.sin(u.theta2);
    const c2 = Math.cos(u.theta2);

    const x1 = p.L01 * s1;
    const y1 = p.L01 * c1;
    const vx1 = p.L01 * u.omega1 * c1;
    const vy1 = -p.L01 * u.omega1 * s1;

    if (!p.enableSecond) {
      return { x1, y1, vx1, vy1, x2: x1, y2: y1, vx2: vx1, vy2: vy1 };
    }

    const x2 = x1 + p.L02 * s2;
    const y2 = y1 + p.L02 * c2;
    const vx2 = vx1 + p.L02 * u.omega2 * c2;
    const vy2 = vy1 - p.L02 * u.omega2 * s2;
    return { x1, y1, vx1, vy1, x2, y2, vx2, vy2 };
  }

  function noSpringDeriv(u, p) {
    const m1 = p.m1;
    const m2 = p.m2;
    const L1 = p.L01;
    const L2 = p.L02;
    const g = p.g;
    const c1 = p.cTheta1;
    const c2 = p.cTheta2;

    if (!p.enableSecond) {
      const dtheta1 = u.omega1;
      const restoring1 = p.smallAngleMode ? u.theta1 : Math.sin(u.theta1);
      const domega1 = -(g / L1) * restoring1 - c1 * u.omega1;
      return { dtheta1, domega1, dtheta2: dtheta1, domega2: domega1 };
    }

    if (p.smallAngleMode) {
      // Small-angle linearized double pendulum (rigid rods, point masses).
      const domega1 = -(g / (m1 * L1)) * ((m1 + m2) * u.theta1 - m2 * u.theta2) - c1 * u.omega1;
      const domega2 = ((m1 + m2) * g / (m1 * L2)) * (u.theta1 - u.theta2) - c2 * u.omega2;
      return {
        dtheta1: u.omega1,
        domega1,
        dtheta2: u.omega2,
        domega2
      };
    }

    let alpha1;
    let alpha2;
    // Standard double-pendulum equations (massless rods).
    const d = u.theta1 - u.theta2;
    const sinD = Math.sin(d);
    const cosD = Math.cos(d);
    const den1 = L1 * (2 * m1 + m2 - m2 * Math.cos(2 * d));
    const den2 = L2 * (2 * m1 + m2 - m2 * Math.cos(2 * d));

    alpha1 =
      (
        -g * (2 * m1 + m2) * Math.sin(u.theta1)
        - m2 * g * Math.sin(u.theta1 - 2 * u.theta2)
        - 2 * sinD * m2 * (u.omega2 * u.omega2 * L2 + u.omega1 * u.omega1 * L1 * cosD)
      ) / den1;

    alpha2 =
      (
        2 * sinD * (
          u.omega1 * u.omega1 * L1 * (m1 + m2)
          + g * (m1 + m2) * Math.cos(u.theta1)
          + u.omega2 * u.omega2 * L2 * m2 * cosD
        )
      ) / den2;

    return {
      dtheta1: u.omega1,
      domega1: alpha1 - c1 * u.omega1,
      dtheta2: u.omega2,
      domega2: alpha2 - c2 * u.omega2
    };
  }

  function rk4StepNoSpring(s, p, h) {
    const u0 = noSpringStateFromCartesian(s, p);

    function addScaled(u, k, scale) {
      return {
        theta1: u.theta1 + scale * k.dtheta1,
        omega1: u.omega1 + scale * k.domega1,
        theta2: u.theta2 + scale * k.dtheta2,
        omega2: u.omega2 + scale * k.domega2
      };
    }

    const k1 = noSpringDeriv(u0, p);
    const k2 = noSpringDeriv(addScaled(u0, k1, 0.5 * h), p);
    const k3 = noSpringDeriv(addScaled(u0, k2, 0.5 * h), p);
    const k4 = noSpringDeriv(addScaled(u0, k3, h), p);

    const u1 = {
      theta1: u0.theta1 + (h / 6) * (k1.dtheta1 + 2 * k2.dtheta1 + 2 * k3.dtheta1 + k4.dtheta1),
      omega1: u0.omega1 + (h / 6) * (k1.domega1 + 2 * k2.domega1 + 2 * k3.domega1 + k4.domega1),
      theta2: u0.theta2 + (h / 6) * (k1.dtheta2 + 2 * k2.dtheta2 + 2 * k3.dtheta2 + k4.dtheta2),
      omega2: u0.omega2 + (h / 6) * (k1.domega2 + 2 * k2.domega2 + 2 * k3.domega2 + k4.domega2)
    };

    u1.theta1 = wrapAngle(u1.theta1);
    u1.theta2 = wrapAngle(u1.theta2);

    const c = noSpringCartesianFromState(u1, p);
    s.x1 = c.x1; s.y1 = c.y1; s.vx1 = c.vx1; s.vy1 = c.vy1;
    s.x2 = c.x2; s.y2 = c.y2; s.vx2 = c.vx2; s.vy2 = c.vy2;
    s.t += h;
  }

  function energyOneFromAbsolute(x, y, vx, vy, p) {
    const r = vecLen(x, y);
    const theta = Math.atan2(x, y);
    const k = 0.5 * p.m1 * (vx * vx + vy * vy);
    const ug = p.smallAngleMode ? 0.5 * p.m1 * p.g * r * theta * theta : -p.m1 * p.g * y;
    const us = p.useSpring ? 0.5 * p.k1 * (r - p.L01) * (r - p.L01) : 0;
    return { k, ug, us };
  }

  function energyTwoFromRelative(s, p) {
    const dx = s.x2 - s.x1;
    const dy = s.y2 - s.y1;
    const r = vecLen(dx, dy);
    const theta = Math.atan2(dx, dy);
    const k = 0.5 * p.m2 * (s.vx2 * s.vx2 + s.vy2 * s.vy2);
    const ug = p.smallAngleMode ? 0.5 * p.m2 * p.g * r * theta * theta : -p.m2 * p.g * s.y2;
    const us = p.useSpring ? 0.5 * p.k2 * (r - p.L02) * (r - p.L02) : 0;
    return { k, ug, us };
  }

  function pushHistory() {
    const q1 = getQ1FromCartesian(state);
    phaseHistory1.push({ theta: q1.theta, omega: q1.omega });
    bobTrail1.push({ x: state.x1, y: state.y1 });
    if (bobTrail1.length > MAX_BOB_TRAIL) bobTrail1.shift();

    const e1 = energyOneFromAbsolute(state.x1, state.y1, state.vx1, state.vy1, params);
    const e1Total = e1.k + e1.ug + e1.us;
    let e2Total = null;
    let k2 = null;
    let ug2 = null;
    let us2 = null;
    let kSum = e1.k;
    let ugSum = e1.ug;
    let usSum = e1.us;

    if (params.enableSecond) {
      const q2 = getQ2RelFromCartesian(state);
      phaseHistory2.push({ theta: q2.theta, omega: q2.omega });
      bobTrail2.push({ x: state.x2, y: state.y2 });
      if (bobTrail2.length > MAX_BOB_TRAIL) bobTrail2.shift();
      const e2 = energyTwoFromRelative(state, params);
      k2 = e2.k;
      ug2 = e2.ug;
      us2 = e2.us;
      e2Total = e2.k + e2.ug + e2.us;
      kSum += e2.k;
      ugSum += e2.ug;
      usSum += e2.us;
    }

    const eTotal = e2Total === null ? e1Total : (e1Total + e2Total);
    energyHistory.push({
      t: state.t,
      k1: e1.k,
      ug1: e1.ug,
      us1: e1.us,
      e1: e1Total,
      k2,
      ug2,
      us2,
      e2: e2Total,
      k: kSum,
      ug: ugSum,
      us: usSum,
      et: eTotal
    });
  }

  function samplePoincare(prevQ1, prevQ2, curQ1, curQ2) {
    const jumped = Math.abs(curQ1.theta - prevQ1.theta) > Math.PI;
    if (jumped) return;
    if (!(prevQ1.theta < 0 && curQ1.theta >= 0 && curQ1.omega > 0)) return;

    const denom = curQ1.theta - prevQ1.theta;
    const a = Math.abs(denom) < 1e-12 ? 0 : (-prevQ1.theta / denom);
    const clampedA = Math.max(0, Math.min(1, a));
    const theta = prevQ2.theta + clampedA * (curQ2.theta - prevQ2.theta);
    const omega = prevQ2.omega + clampedA * (curQ2.omega - prevQ2.omega);
    poincarePoints.push({ theta: wrapAngle(theta), omega });
  }

  function updateEquationView() {
    if (!els.equationMode || !els.equationLagrangian || !els.equationImpl || !params) return;
    function setMathBlock(el, tex) {
      el.textContent = `\\[${tex}\\]`;
    }
    function typesetMathBlocks() {
      if (window.MathJax && typeof window.MathJax.typesetPromise === "function") {
        window.MathJax.typesetPromise([els.equationLagrangian, els.equationImpl]).catch(() => {});
      }
    }

    if (params.useSpring) {
      if (params.enableSecond) {
        els.equationMode.textContent = "Mode: Spring (Cartesian), two bob chain";
        setMathBlock(els.equationLagrangian,
`\\begin{aligned}
q &= (x_1,y_1,x_2,y_2),\\;
r_1=\\sqrt{x_1^2+y_1^2},\\;
r_2=\\sqrt{(x_2-x_1)^2+(y_2-y_1)^2}\\\\
T &= \\tfrac12 m_1(\\dot x_1^2+\\dot y_1^2)+\\tfrac12 m_2(\\dot x_2^2+\\dot y_2^2)\\\\
U &= -m_1 g y_1 - m_2 g y_2 + \\tfrac12 k_1(r_1-L_1)^2 + \\tfrac12 k_2(r_2-L_2)^2\\\\
L &= T-U,\\qquad
\\frac{d}{dt}\\frac{\\partial L}{\\partial \\dot q_i}-\\frac{\\partial L}{\\partial q_i}=Q_i,\\;
Q_i=-c_{\\mathrm{eff}}\\dot q_i
\\end{aligned}`);
        setMathBlock(els.equationImpl,
`\\begin{aligned}
\\mathbf u_1&=(x_1,y_1)/r_1,\\quad \\mathbf u_{12}=(x_2-x_1,y_2-y_1)/r_2\\\\
\\mathbf F_{1s}&=-k_1(r_1-L_1)\\mathbf u_1,\\quad \\mathbf F_{12}=k_2(r_2-L_2)\\mathbf u_{12}\\\\
m_1\\ddot{\\mathbf r}_1 &= \\mathbf F_{1s}+\\mathbf F_{12}-c_{\\mathrm{eff}}m_1\\dot{\\mathbf r}_1+(0,m_1 g)\\\\
m_2\\ddot{\\mathbf r}_2 &= -\\mathbf F_{12}-c_{\\mathrm{eff}}m_2\\dot{\\mathbf r}_2+(0,m_2 g)
\\end{aligned}`);
        typesetMathBlocks();
      } else {
        els.equationMode.textContent = "Mode: Spring (Cartesian), single bob";
        setMathBlock(els.equationLagrangian,
`\\begin{aligned}
q&=(x_1,y_1),\\quad r_1=\\sqrt{x_1^2+y_1^2}\\\\
T&=\\tfrac12 m_1(\\dot x_1^2+\\dot y_1^2),\\quad
U=-m_1 g y_1+\\tfrac12 k_1(r_1-L_1)^2\\\\
L&=T-U,\\qquad
\\frac{d}{dt}\\frac{\\partial L}{\\partial \\dot q_i}-\\frac{\\partial L}{\\partial q_i}=Q_i,\\;
Q_i=-c_{\\mathrm{eff}}\\dot q_i
\\end{aligned}`);
        setMathBlock(els.equationImpl,
`\\begin{aligned}
\\mathbf u_1&=(x_1,y_1)/r_1,\\quad \\mathbf F_{1s}=-k_1(r_1-L_1)\\mathbf u_1\\\\
m_1\\ddot{\\mathbf r}_1&=\\mathbf F_{1s}-c_{\\mathrm{eff}}m_1\\dot{\\mathbf r}_1+(0,m_1 g)
\\end{aligned}`);
        typesetMathBlocks();
      }
      return;
    }

    if (!params.enableSecond) {
      if (params.smallAngleMode) {
        els.equationMode.textContent = "Mode: No-spring, single bob, linearized";
        setMathBlock(els.equationLagrangian,
`\\begin{aligned}
q&=\\theta_1\\\\
T&=\\tfrac12 m_1L_1^2\\omega_1^2,\\quad
U\\approx\\tfrac12 m_1 g L_1\\theta_1^2\\\\
L&=T-U,\\qquad
\\frac{d}{dt}\\frac{\\partial L}{\\partial \\omega_1}-\\frac{\\partial L}{\\partial \\theta_1}=-c\\omega_1
\\end{aligned}`);
        setMathBlock(els.equationImpl,
`\\begin{aligned}
\\dot\\theta_1&=\\omega_1\\\\
\\dot\\omega_1&=-\\frac{g}{L_1}\\theta_1-c\\omega_1
\\end{aligned}`);
      } else {
        els.equationMode.textContent = "Mode: No-spring, single bob, nonlinear";
        setMathBlock(els.equationLagrangian,
`\\begin{aligned}
q&=\\theta_1\\\\
T&=\\tfrac12 m_1L_1^2\\omega_1^2,\\quad
U=m_1 g L_1(1-\\cos\\theta_1)\\\\
L&=T-U,\\qquad
\\frac{d}{dt}\\frac{\\partial L}{\\partial \\omega_1}-\\frac{\\partial L}{\\partial \\theta_1}=-c\\omega_1
\\end{aligned}`);
        setMathBlock(els.equationImpl,
`\\begin{aligned}
\\dot\\theta_1&=\\omega_1\\\\
\\dot\\omega_1&=-\\frac{g}{L_1}\\sin\\theta_1-c\\omega_1
\\end{aligned}`);
      }
      typesetMathBlocks();
      return;
    }

    if (params.smallAngleMode) {
      els.equationMode.textContent = "Mode: No-spring, two bob linearized double pendulum";
      setMathBlock(els.equationLagrangian,
`\\begin{aligned}
T&\\approx\\tfrac12(m_1+m_2)L_1^2\\dot\\theta_1^2+\\tfrac12m_2L_2^2\\dot\\theta_2^2+m_2L_1L_2\\dot\\theta_1\\dot\\theta_2\\\\
U&\\approx\\tfrac12(m_1+m_2)gL_1\\theta_1^2+\\tfrac12m_2gL_2\\theta_2^2
\\end{aligned}`);
      setMathBlock(els.equationImpl,
`\\begin{aligned}
\\dot\\theta_1&=\\omega_1,\\quad \\dot\\theta_2=\\omega_2\\\\
\\dot\\omega_1&=-\\frac{g}{m_1L_1}\\left[(m_1+m_2)\\theta_1-m_2\\theta_2\\right]-c\\omega_1\\\\
\\dot\\omega_2&=\\frac{(m_1+m_2)g}{m_1L_2}(\\theta_1-\\theta_2)-c\\omega_2
\\end{aligned}`);
    } else {
      els.equationMode.textContent = "Mode: No-spring, two bob nonlinear double pendulum";
      setMathBlock(els.equationLagrangian,
`\\begin{aligned}
q&=(\\theta_1,\\theta_2),\\quad
T=\\tfrac12(m_1+m_2)L_1^2\\omega_1^2+\\tfrac12m_2L_2^2\\omega_2^2
+m_2L_1L_2\\omega_1\\omega_2\\cos(\\theta_1-\\theta_2)\\\\
U&=-(m_1+m_2)gL_1\\cos\\theta_1-m_2gL_2\\cos\\theta_2,\\quad
L=T-U\\\\
\\frac{d}{dt}\\frac{\\partial L}{\\partial \\omega_i}-\\frac{\\partial L}{\\partial \\theta_i}&=-c\\omega_i
\\end{aligned}`);
      setMathBlock(els.equationImpl,
`\\begin{aligned}
\\delta&=\\theta_1-\\theta_2,\\quad
\\mathrm{den}=2m_1+m_2-m_2\\cos(2\\delta)\\\\
\\dot\\theta_1&=\\omega_1,\\quad \\dot\\theta_2=\\omega_2\\\\
\\dot\\omega_1&=
\\frac{-g(2m_1+m_2)\\sin\\theta_1-m_2g\\sin(\\theta_1-2\\theta_2)-2m_2\\sin\\delta(\\omega_2^2L_2+\\omega_1^2L_1\\cos\\delta)}
{L_1\\,\\mathrm{den}}-c\\omega_1\\\\
\\dot\\omega_2&=
\\frac{2\\sin\\delta\\left[\\omega_1^2L_1(m_1+m_2)+g(m_1+m_2)\\cos\\theta_1+\\omega_2^2L_2m_2\\cos\\delta\\right]}
{L_2\\,\\mathrm{den}}-c\\omega_2
\\end{aligned}`);
    }
    typesetMathBlocks();
  }

  function resetSimulation() {
    params = parseParams();
    updateInputViews(params);
    updateEquationView();
    state = initStateFromParams(params);
    if (!params.useSpring) {
      enforceRodConstraints(state, params);
    }
    phaseHistory1.length = 0;
    phaseHistory2.length = 0;
    energyHistory.length = 0;
    poincarePoints.length = 0;
    bobTrail1.length = 0;
    bobTrail2.length = 0;
    accumulator = 0;
    motionMaxReach = Math.max(params.L01, params.enableSecond ? (params.L01 + params.L02) : params.L01, MIN_LEN);
    pushHistory();
    drawAll();
    updateReadout();
  }

  function updateReadout() {
    const q1 = getQ1FromCartesian(state);
    const q2 = getQ2RelFromCartesian(state);
    els.tNow.textContent = state.t.toFixed(3);
    els.rNow.textContent = q1.r.toFixed(3);
    els.thetaNow.textContent = toDeg(q1.theta).toFixed(2);
    els.omegaNow.textContent = q1.omega.toFixed(3);
    els.rNow2.textContent = q2.r.toFixed(3);
    els.thetaNow2.textContent = toDeg(q2.theta).toFixed(2);
    els.omegaNow2.textContent = q2.omega.toFixed(3);
  }

  function fitCanvas(canvas, ctx) {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(240, Math.floor(rect.width));
    const h = Math.max(140, Math.floor(rect.height));
    if (canvas.width !== Math.floor(w * DPR) || canvas.height !== Math.floor(h * DPR)) {
      canvas.width = Math.floor(w * DPR);
      canvas.height = Math.floor(h * DPR);
    }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    return { w, h };
  }

  function drawGrid(ctx, w, h, xTicks, yTicks) {
    ctx.save();
    ctx.strokeStyle = "#e5eef6";
    ctx.lineWidth = 1;
    for (let i = 1; i < xTicks; i += 1) {
      const x = (w * i) / xTicks;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let i = 1; i < yTicks; i += 1) {
      const y = (h * i) / yTicks;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTrail(ctx, trail, pivotX, pivotY, meterToPx, color) {
    if (trail.length < 2) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < trail.length; i += 1) {
      const p = trail[i];
      const x = pivotX + meterToPx * p.x;
      const y = pivotY + meterToPx * p.y;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawSpring(ctx, x0, y0, x1, y1, color) {
    const coils = 14;
    const amplitude = 5;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 1e-3) return;
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;
    const startPad = 10;
    const endPad = 16;
    const bodyLen = Math.max(8, len - startPad - endPad);

    function strokePath(strokeStyle, lineWidth) {
      ctx.save();
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + ux * startPad, y0 + uy * startPad);
      for (let i = 0; i <= coils; i += 1) {
        const t = i / coils;
        const bx = x0 + ux * (startPad + bodyLen * t);
        const by = y0 + uy * (startPad + bodyLen * t);
        const sign = i % 2 === 0 ? 1 : -1;
        ctx.lineTo(bx + sign * nx * amplitude, by + sign * ny * amplitude);
      }
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.restore();
    }

    strokePath("rgba(8, 26, 44, 0.5)", 5.2);
    const grad = ctx.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, color);
    grad.addColorStop(0.5, "#dce8f4");
    grad.addColorStop(1, color);
    strokePath(grad, 2.6);
  }

  function drawPendulum() {
    const { w, h } = fitCanvas(els.simCanvas, ctxSim);
    ctxSim.clearRect(0, 0, w, h);
    drawGrid(ctxSim, w, h, 8, 5);

    const vignette = ctxSim.createRadialGradient(w * 0.5, h * 0.48, Math.min(w, h) * 0.1, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
    vignette.addColorStop(0, "rgba(255,255,255,0)");
    vignette.addColorStop(1, "rgba(11,37,61,0.09)");
    ctxSim.fillStyle = vignette;
    ctxSim.fillRect(0, 0, w, h);

    const lengthRef = Math.max(params.L01, params.L02, MIN_LEN);
    const baseScale = (Math.min(w, h) * 0.36) / lengthRef;
    const pivotX = w * 0.5;
    const pivotY = h * 0.5;

    let currentReach = Math.max(
      vecLen(state.x1, state.y1),
      params.enableSecond ? vecLen(state.x2, state.y2) : 0,
      MIN_LEN
    );
    for (let i = 0; i < bobTrail1.length; i += 1) {
      const p = bobTrail1[i];
      currentReach = Math.max(currentReach, vecLen(p.x, p.y));
    }
    if (params.enableSecond) {
      for (let i = 0; i < bobTrail2.length; i += 1) {
        const p = bobTrail2[i];
        currentReach = Math.max(currentReach, vecLen(p.x, p.y));
      }
    }
    motionMaxReach = Math.max(motionMaxReach, currentReach);

    const maxDrawableRadius = Math.min(w * 0.45, h * 0.45);
    const fitScale = maxDrawableRadius / motionMaxReach;
    const meterToPx = Math.min(baseScale, fitScale);
    const bob1X = pivotX + meterToPx * state.x1;
    const bob1Y = pivotY + meterToPx * state.y1;
    const bob2X = pivotX + meterToPx * state.x2;
    const bob2Y = pivotY + meterToPx * state.y2;
    pendulumGeom = { pivotX, pivotY, meterToPx, bob1X, bob1Y, bob2X, bob2Y, bobR: 14 };

    drawTrail(ctxSim, bobTrail1, pivotX, pivotY, meterToPx, "rgba(12, 125, 123, 0.3)");
    if (params.enableSecond) drawTrail(ctxSim, bobTrail2, pivotX, pivotY, meterToPx, "rgba(221, 91, 39, 0.25)");

    ctxSim.save();
    ctxSim.fillStyle = "rgba(15, 44, 74, 0.24)";
    ctxSim.fillRect(pivotX - 38, pivotY - 7, 76, 14);
    ctxSim.restore();

    ctxSim.save();
    ctxSim.fillStyle = "#0f385e";
    ctxSim.beginPath();
    ctxSim.arc(pivotX, pivotY, 7, 0, Math.PI * 2);
    ctxSim.fill();
    ctxSim.strokeStyle = "#c8dff0";
    ctxSim.lineWidth = 1.4;
    ctxSim.stroke();
    ctxSim.restore();

    function drawRod(x0, y0, x1, y1, color) {
      ctxSim.save();
      ctxSim.strokeStyle = "rgba(8, 26, 44, 0.45)";
      ctxSim.lineWidth = 5;
      ctxSim.beginPath();
      ctxSim.moveTo(x0, y0);
      ctxSim.lineTo(x1, y1);
      ctxSim.stroke();
      ctxSim.restore();

      ctxSim.save();
      const grad = ctxSim.createLinearGradient(x0, y0, x1, y1);
      grad.addColorStop(0, color);
      grad.addColorStop(0.5, "#dce8f4");
      grad.addColorStop(1, color);
      ctxSim.strokeStyle = grad;
      ctxSim.lineWidth = 2.6;
      ctxSim.beginPath();
      ctxSim.moveTo(x0, y0);
      ctxSim.lineTo(x1, y1);
      ctxSim.stroke();
      ctxSim.restore();
    }

    if (params.useSpring) {
      drawSpring(ctxSim, pivotX, pivotY, bob1X, bob1Y, "#356992");
      if (params.enableSecond) drawSpring(ctxSim, bob1X, bob1Y, bob2X, bob2Y, "#9d6a36");
    } else {
      drawRod(pivotX, pivotY, bob1X, bob1Y, "#356992");
      if (params.enableSecond) drawRod(bob1X, bob1Y, bob2X, bob2Y, "#9d6a36");
    }

    function drawBob(x, y, color, label) {
      const r = 14;
      const shadow = ctxSim.createRadialGradient(x + 2, y + 4, 1, x + 2, y + 4, r + 12);
      shadow.addColorStop(0, "rgba(8, 20, 33, 0.22)");
      shadow.addColorStop(1, "rgba(8, 20, 33, 0)");
      ctxSim.save();
      ctxSim.fillStyle = shadow;
      ctxSim.beginPath();
      ctxSim.arc(x + 2, y + 4, r + 10, 0, Math.PI * 2);
      ctxSim.fill();
      ctxSim.restore();

      const grad = ctxSim.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.2, x, y, r);
      grad.addColorStop(0, "#f5fbff");
      grad.addColorStop(0.35, color);
      grad.addColorStop(1, "rgba(8, 38, 64, 0.95)");
      ctxSim.save();
      ctxSim.fillStyle = grad;
      ctxSim.beginPath();
      ctxSim.arc(x, y, r, 0, Math.PI * 2);
      ctxSim.fill();
      ctxSim.strokeStyle = "rgba(240, 248, 255, 0.72)";
      ctxSim.lineWidth = 1.2;
      ctxSim.stroke();
      ctxSim.beginPath();
      ctxSim.fillStyle = "rgba(255,255,255,0.6)";
      ctxSim.arc(x - r * 0.35, y - r * 0.35, r * 0.2, 0, Math.PI * 2);
      ctxSim.fill();
      ctxSim.restore();
      ctxSim.fillStyle = "#35536f";
      ctxSim.font = "700 12px 'Noto Sans JP', 'Noto Sans', sans-serif";
      ctxSim.fillText(label, x + 14, y - 10);
    }

    drawBob(bob1X, bob1Y, "#0c7d7b", "Bob1");
    if (params.enableSecond) drawBob(bob2X, bob2Y, "#dd5b27", "Bob2");
  }

  function drawPhaseSeries(ctx, series, color, xMap, yMap) {
    if (series.length < 2) return;
    const drawStep = Math.max(1, Math.ceil(series.length / 4000));
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    let prevTheta = null;
    for (let i = 0; i < series.length; i += drawStep) {
      const p = series[i];
      const x = xMap(p.theta);
      const y = yMap(p.omega);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        const dTheta = Math.abs(p.theta - prevTheta);
        if (dTheta > Math.PI) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      prevTheta = p.theta;
    }
    const last = series[series.length - 1];
    if (prevTheta !== null) {
      const dThetaLast = Math.abs(last.theta - prevTheta);
      if (dThetaLast > Math.PI) {
        ctx.moveTo(xMap(last.theta), yMap(last.omega));
      } else {
        ctx.lineTo(xMap(last.theta), yMap(last.omega));
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawPhase() {
    const { w, h } = fitCanvas(els.phaseCanvas, ctxPhase);
    ctxPhase.clearRect(0, 0, w, h);
    drawGrid(ctxPhase, w, h, 8, 6);

    const padL = 48;
    const padR = 16;
    const padT = 14;
    const padB = 30;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    let maxAbsOmega = 1.0;
    for (const p of phaseHistory1) maxAbsOmega = Math.max(maxAbsOmega, Math.abs(p.omega));
    for (const p of phaseHistory2) maxAbsOmega = Math.max(maxAbsOmega, Math.abs(p.omega));
    maxAbsOmega *= 1.1;

    function xMap(theta) {
      return padL + ((theta + Math.PI) / (2 * Math.PI)) * plotW;
    }
    function yMap(omega) {
      return padT + (1 - (omega + maxAbsOmega) / (2 * maxAbsOmega)) * plotH;
    }

    ctxPhase.save();
    ctxPhase.strokeStyle = "#cedbe8";
    ctxPhase.lineWidth = 1;
    ctxPhase.strokeRect(padL, padT, plotW, plotH);
    ctxPhase.restore();

    drawPhaseSeries(ctxPhase, phaseHistory1, "#0c7d7b", xMap, yMap);
    if (params.enableSecond) drawPhaseSeries(ctxPhase, phaseHistory2, "#dd5b27", xMap, yMap);
  }

  function drawEnergy() {
    const { w, h } = fitCanvas(els.energyCanvas, ctxEnergy);
    ctxEnergy.clearRect(0, 0, w, h);
    drawGrid(ctxEnergy, w, h, 8, 6);

    const padL = 52;
    const padR = 16;
    const padT = 14;
    const padB = 30;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    if (energyHistory.length < 2) return;

    const keys = ["k1", "ug1", "us1", "e1", "k2", "ug2", "us2", "e2", "et"];
    let yMin = Infinity;
    let yMax = -Infinity;
    for (const p of energyHistory) {
      for (const key of keys) {
        const v = p[key];
        if (v === null || !Number.isFinite(v)) continue;
        if (v < yMin) yMin = v;
        if (v > yMax) yMax = v;
      }
    }
    if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) return;
    if (Math.abs(yMax - yMin) < 1e-9) {
      const e = Math.max(1e-6, Math.abs(yMax) * 0.05);
      yMin -= e;
      yMax += e;
    } else {
      const pad = (yMax - yMin) * 0.08;
      yMin -= pad;
      yMax += pad;
    }
    const tMin = 0;
    const tMax = Math.max(1e-6, energyHistory[energyHistory.length - 1].t);
    const tSpan = Math.max(1e-6, tMax - tMin);

    function xMap(t) {
      return padL + ((t - tMin) / tSpan) * plotW;
    }
    function yMap(e) {
      return padT + (1 - (e - yMin) / (yMax - yMin)) * plotH;
    }

    function drawSeries(color, key) {
      const drawStep = Math.max(1, Math.ceil(energyHistory.length / 5000));
      ctxEnergy.save();
      ctxEnergy.strokeStyle = color;
      ctxEnergy.lineWidth = 2;
      ctxEnergy.beginPath();
      let started = false;
      for (let idx = 0; idx < energyHistory.length; idx += drawStep) {
        const p = energyHistory[idx];
        if (p[key] === null || !Number.isFinite(p[key])) continue;
        const x = xMap(p.t);
        const y = yMap(Math.max(yMin, Math.min(yMax, p[key])));
        if (!started) {
          ctxEnergy.moveTo(x, y);
          started = true;
        } else {
          ctxEnergy.lineTo(x, y);
        }
      }
      if (energyHistory.length > 1) {
        const last = energyHistory[energyHistory.length - 1];
        if (last[key] !== null && Number.isFinite(last[key])) {
          ctxEnergy.lineTo(xMap(last.t), yMap(Math.max(yMin, Math.min(yMax, last[key]))));
        }
      }
      ctxEnergy.stroke();
      ctxEnergy.restore();
    }

    drawSeries("#1f77b4", "k1");
    drawSeries("#2ca02c", "ug1");
    drawSeries("#9467bd", "us1");
    drawSeries("#0f4c81", "e1");
    drawSeries("#ff7f0e", "k2");
    drawSeries("#bcbd22", "ug2");
    drawSeries("#8c564b", "us2");
    drawSeries("#d62728", "e2");
    drawSeries("#111827", "et");
  }

  function drawPoincare() {
    const { w, h } = fitCanvas(els.poincareCanvas, ctxPoincare);
    ctxPoincare.clearRect(0, 0, w, h);
    drawGrid(ctxPoincare, w, h, 8, 6);

    const padL = 48;
    const padR = 16;
    const padT = 14;
    const padB = 30;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    let maxAbsOmega = 1.0;
    for (const p of poincarePoints) {
      maxAbsOmega = Math.max(maxAbsOmega, Math.abs(p.omega));
    }
    maxAbsOmega *= 1.05;

    function xMap(theta) {
      return padL + ((theta + Math.PI) / (2 * Math.PI)) * plotW;
    }
    function yMap(omega) {
      return padT + (1 - (omega + maxAbsOmega) / (2 * maxAbsOmega)) * plotH;
    }

    ctxPoincare.save();
    ctxPoincare.strokeStyle = "#cedbe8";
    ctxPoincare.lineWidth = 1;
    ctxPoincare.strokeRect(padL, padT, plotW, plotH);
    ctxPoincare.restore();

    ctxPoincare.save();
    ctxPoincare.fillStyle = "#6a3fb3";
    const drawStep = Math.max(1, Math.ceil(poincarePoints.length / 12000));
    for (let i = 0; i < poincarePoints.length; i += drawStep) {
      const p = poincarePoints[i];
      const x = xMap(p.theta);
      const y = yMap(p.omega);
      ctxPoincare.fillRect(x - 1, y - 1, 2, 2);
    }
    ctxPoincare.restore();

    ctxPoincare.fillStyle = "#4e6782";
    ctxPoincare.font = "12px sans-serif";
    ctxPoincare.fillText("-pi", padL - 8, h - 10);
    ctxPoincare.fillText("0", padL + plotW * 0.5 - 3, h - 10);
    ctxPoincare.fillText("pi", padL + plotW - 10, h - 10);
    ctxPoincare.fillText("theta", padL + plotW - 34, h - 10);
    ctxPoincare.fillText("omega", 6, padT + 8);
  }

  function drawAll() {
    if (showMotionPlot) drawPendulum();
    if (showPhasePlot) drawPhase();
    if (showPoincarePlot) drawPoincare();
    if (showEnergyPlot) drawEnergy();
  }

  function syncCardVisibility(sectionEl, buttonEl, visible, hideText, showText) {
    if (!sectionEl || !buttonEl) return;
    sectionEl.classList.toggle("is-collapsed", !visible);
    buttonEl.textContent = visible ? hideText : showText;
  }

  function runFrame(ts) {
    if (!lastFrameTs) lastFrameTs = ts;
    const frameSec = Math.min(0.05, (ts - lastFrameTs) / 1000);
    lastFrameTs = ts;

    if (isRunning) {
      accumulator += frameSec * params.timeScale;
      let safety = 0;
      while (accumulator >= params.dt && safety < 1200) {
        const prevQ1 = getQ1FromCartesian(state);
        const prevQ2 = params.enableSecond ? getQ2RelFromCartesian(state) : prevQ1;
        if (params.useSpring) {
          rk4StepSpring(state, params, params.dt);
        } else {
          rk4StepNoSpring(state, params, params.dt);
        }
        if (
          !Number.isFinite(state.x1) || !Number.isFinite(state.y1) ||
          !Number.isFinite(state.vx1) || !Number.isFinite(state.vy1) ||
          !Number.isFinite(state.x2) || !Number.isFinite(state.y2) ||
          !Number.isFinite(state.vx2) || !Number.isFinite(state.vy2)
        ) {
          resetSimulation();
          setRunning(false);
          els.status.textContent = "Numerical instability detected; reset performed.";
          break;
        }
        const curQ1 = getQ1FromCartesian(state);
        const curQ2 = params.enableSecond ? getQ2RelFromCartesian(state) : curQ1;
        samplePoincare(prevQ1, prevQ2, curQ1, curQ2);
        pushHistory();
        accumulator -= params.dt;
        safety += 1;
      }
      updateReadout();
      drawAll();
    }
    rafId = requestAnimationFrame(runFrame);
  }

  function setRunning(nextRunning) {
    isRunning = nextRunning;
    els.toggleBtn.textContent = isRunning ? "Pause" : "Start";
    els.status.textContent = isRunning ? "Running..." : "Paused.";
  }

  function eventToCanvasPoint(ev) {
    const rect = els.simCanvas.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }

  function setStateFromCanvasPoint(x, y, bobIndex) {
    if (!pendulumGeom) return;
    const mx = (x - pendulumGeom.pivotX) / pendulumGeom.meterToPx;
    const my = (y - pendulumGeom.pivotY) / pendulumGeom.meterToPx;
    if (bobIndex === 1) {
      const dx = mx - state.x1;
      const dy = my - state.y1;
      state.x1 = mx;
      state.y1 = my;
      state.vx1 = 0;
      state.vy1 = 0;
      if (params.enableSecond) {
        state.x2 += dx;
        state.y2 += dy;
        state.vx2 = 0;
        state.vy2 = 0;
      }
    } else if (bobIndex === 2 && params.enableSecond) {
      state.x2 = mx;
      state.y2 = my;
      state.vx2 = 0;
      state.vy2 = 0;
    }
    if (!params.useSpring) {
      enforceRodConstraints(state, params);
    }
    pushHistory();
    updateReadout();
    drawAll();
  }

  function setCurrentAsInitialInputs() {
    const q1 = getQ1FromCartesian(state);
    const q2 = getQ2RelFromCartesian(state);

    els.theta0.value = toDeg(q1.theta).toFixed(4);
    els.omega0.value = q1.omega.toFixed(6);
    els.r0.value = q1.r.toFixed(6);
    els.vr0.value = q1.vr.toFixed(6);

    els.theta02.value = toDeg(q2.theta).toFixed(4);
    els.omega02.value = q2.omega.toFixed(6);
    els.r02.value = q2.r.toFixed(6);
    els.vr02.value = q2.vr.toFixed(6);
  }

  function hitTestBob(x, y) {
    if (!pendulumGeom) return -1;
    const r2 = (pendulumGeom.bobR + 6) * (pendulumGeom.bobR + 6);
    const dx1 = x - pendulumGeom.bob1X;
    const dy1 = y - pendulumGeom.bob1Y;
    if (dx1 * dx1 + dy1 * dy1 <= r2) return 1;
    if (params.enableSecond) {
      const dx2 = x - pendulumGeom.bob2X;
      const dy2 = y - pendulumGeom.bob2Y;
      if (dx2 * dx2 + dy2 * dy2 <= r2) return 2;
    }
    return -1;
  }

  els.applyBtn.addEventListener("click", () => {
    resetSimulation();
    els.status.textContent = "Parameters applied and simulation reset.";
  });

  els.resetBtn.addEventListener("click", () => {
    resetSimulation();
    els.status.textContent = "Simulation reset to initial conditions.";
  });

  els.captureBtn.addEventListener("click", () => {
    setCurrentAsInitialInputs();
    els.status.textContent = "Current state copied to initial parameters.";
  });

  els.toggleBtn.addEventListener("click", () => {
    setRunning(!isRunning);
  });

  els.toggleMotionBtn.addEventListener("click", () => {
    showMotionPlot = !showMotionPlot;
    syncCardVisibility(els.motionSection, els.toggleMotionBtn, showMotionPlot, "Hide", "Show");
    drawAll();
    els.status.textContent = showMotionPlot ? "Motion is shown." : "Motion is hidden.";
  });

  els.togglePhaseBtn.addEventListener("click", () => {
    showPhasePlot = !showPhasePlot;
    syncCardVisibility(els.phaseSection, els.togglePhaseBtn, showPhasePlot, "Hide", "Show");
    drawAll();
    els.status.textContent = showPhasePlot ? "Phase plot is shown." : "Phase plot is hidden.";
  });

  els.toggleEnergyBtn.addEventListener("click", () => {
    showEnergyPlot = !showEnergyPlot;
    syncCardVisibility(els.energySection, els.toggleEnergyBtn, showEnergyPlot, "Hide", "Show");
    drawAll();
    els.status.textContent = showEnergyPlot ? "E vs Time is shown." : "E vs Time is hidden.";
  });

  els.togglePoincareBtn.addEventListener("click", () => {
    showPoincarePlot = !showPoincarePlot;
    syncCardVisibility(els.poincareSection, els.togglePoincareBtn, showPoincarePlot, "Hide", "Show");
    drawAll();
    els.status.textContent = showPoincarePlot ? "Poincare section is shown." : "Poincare section is hidden.";
  });

  els.enableSecond.addEventListener("change", () => {
    syncSecondVisibility(els.enableSecond.checked);
    resetSimulation();
    els.status.textContent = "Second bob setting applied.";
  });

  els.useSpring.addEventListener("change", () => {
    syncLinearizedAvailability();
    resetSimulation();
    els.status.textContent = els.useSpring.checked ? "Spring model enabled." : "Spring model disabled.";
  });

  els.smallAngleMode.addEventListener("change", () => {
    resetSimulation();
    els.status.textContent = els.smallAngleMode.checked ? "Linearized mode enabled (no-spring model)." : "Full sin(theta) mode enabled.";
  });

  window.addEventListener("resize", () => {
    drawAll();
  });

  els.simCanvas.addEventListener("pointerdown", (ev) => {
    const pt = eventToCanvasPoint(ev);
    const hit = hitTestBob(pt.x, pt.y);
    if (hit < 0) return;
    ev.preventDefault();
    wasRunningBeforeDrag = isRunning;
    if (isRunning) setRunning(false);
    draggingBobIndex = hit;
    els.simCanvas.setPointerCapture(ev.pointerId);
    setStateFromCanvasPoint(pt.x, pt.y, draggingBobIndex);
    els.status.textContent = `Dragging bob${draggingBobIndex}...`;
  });

  els.simCanvas.addEventListener("pointermove", (ev) => {
    if (draggingBobIndex < 0) return;
    const pt = eventToCanvasPoint(ev);
    setStateFromCanvasPoint(pt.x, pt.y, draggingBobIndex);
  });

  function endDrag(pointerId) {
    if (draggingBobIndex < 0) return;
    const dragged = draggingBobIndex;
    draggingBobIndex = -1;
    if (pointerId !== undefined) {
      try { els.simCanvas.releasePointerCapture(pointerId); } catch (_) {}
    }
    if (wasRunningBeforeDrag) {
      setRunning(true);
    } else {
      els.status.textContent = `Bob${dragged} moved by pointer drag.`;
    }
  }

  els.simCanvas.addEventListener("pointerup", (ev) => endDrag(ev.pointerId));
  els.simCanvas.addEventListener("pointercancel", (ev) => endDrag(ev.pointerId));

  resetSimulation();
  syncCardVisibility(els.motionSection, els.toggleMotionBtn, showMotionPlot, "Hide", "Show");
  syncCardVisibility(els.phaseSection, els.togglePhaseBtn, showPhasePlot, "Hide", "Show");
  syncCardVisibility(els.energySection, els.toggleEnergyBtn, showEnergyPlot, "Hide", "Show");
  syncCardVisibility(els.poincareSection, els.togglePoincareBtn, showPoincarePlot, "Hide", "Show");
  syncSecondVisibility(els.enableSecond.checked);
  setRunning(false);
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(runFrame);
})();
