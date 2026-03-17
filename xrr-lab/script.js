(function () {
  const els = {
    layerBody: document.getElementById("layer-body"),
    addLayerBtn: document.getElementById("add-layer-btn"),
    removeLayerBtn: document.getElementById("remove-layer-btn"),
    simulateBtn: document.getElementById("simulate-btn"),
    fileInput: document.getElementById("file-input"),
    qMin: document.getElementById("q-min"),
    qMax: document.getElementById("q-max"),
    qCount: document.getElementById("q-count"),
    background: document.getElementById("background"),
    scale: document.getElementById("scale"),
    raw4AngleMode: document.getElementById("raw4-angle-mode"),
    qShift: document.getElementById("q-shift"),
    dqOverQ: document.getElementById("dq-over-q"),
    footprintQ: document.getElementById("footprint-q"),
    weightMode: document.getElementById("weight-mode"),
    weightLogRMin: document.getElementById("weight-logr-min"),
    weightLogRMax: document.getElementById("weight-logr-max"),
    weightBoost: document.getElementById("weight-boost"),
    fitBackground: document.getElementById("fit-background"),
    fitScale: document.getElementById("fit-scale"),
    fitQShift: document.getElementById("fit-q-shift"),
    enableResolution: document.getElementById("enable-resolution"),
    enableFootprint: document.getElementById("enable-footprint"),
    enableCarpet: document.getElementById("enable-carpet"),
    fitIter: document.getElementById("fit-iter"),
    fitStarts: document.getElementById("fit-starts"),
    carpetSteps: document.getElementById("carpet-steps"),
    carpetTopk: document.getElementById("carpet-topk"),
    startSpread: document.getElementById("start-spread"),
    autoGlobalBtn: document.getElementById("auto-global-btn"),
    calcBtn: document.getElementById("calc-btn"),
    fitBtn: document.getElementById("fit-btn"),
    fitStopBtn: document.getElementById("fit-stop-btn"),
    exportBtn: document.getElementById("export-btn"),
    applyFitBtn: document.getElementById("apply-fit-btn"),
    status: document.getElementById("status"),
    fitProgress: document.getElementById("fit-progress"),
    dataSummary: document.getElementById("data-summary"),
    fitSummary: document.getElementById("fit-summary"),
    fitLayerBody: document.getElementById("fit-layer-body"),
    canvas: document.getElementById("plot-canvas")
  };

  const ctx = els.canvas.getContext("2d");
  const DPR = Math.max(1, window.devicePixelRatio || 1);
  const EPS = 1e-14;
  const MATERIAL_PRESETS = [
    { key: "custom", label: "Custom", sld: null },
    { key: "air", label: "Air", sld: 0.0 },
    { key: "water", label: "H2O", sld: 9.4 },
    { key: "polymer", label: "Polymer (generic)", sld: 8.5 },
    { key: "glass", label: "Glass (generic)", sld: 17.5 },
    { key: "c", label: "C", sld: 21.9 },
    { key: "sio2", label: "SiO2", sld: 18.9 },
    { key: "sion", label: "SiON", sld: 20.8 },
    { key: "si3n4", label: "Si3N4", sld: 30.5 },
    { key: "si", label: "Si", sld: 20.0 },
    { key: "sic", label: "SiC", sld: 36.0 },
    { key: "gaas", label: "GaAs", sld: 32.7 },
    { key: "ge", label: "Ge", sld: 33.1 },
    { key: "gan", label: "GaN", sld: 44.0 },
    { key: "aln", label: "AlN", sld: 40.0 },
    { key: "mgo", label: "MgO", sld: 35.7 },
    { key: "srtio3", label: "SrTiO3", sld: 50.8 },
    { key: "al2o3", label: "Al2O3", sld: 24.5 },
    { key: "hfo2", label: "HfO2", sld: 71.0 },
    { key: "tio2", label: "TiO2", sld: 38.0 },
    { key: "ta2o5", label: "Ta2O5", sld: 52.0 },
    { key: "py", label: "Py (NiFe)", sld: 70.0 },
    { key: "fe", label: "Fe", sld: 59.0 },
    { key: "co", label: "Co", sld: 63.0 },
    { key: "ni", label: "Ni", sld: 68.0 },
    { key: "cu", label: "Cu", sld: 66.5 },
    { key: "ti", label: "Ti", sld: 35.0 },
    { key: "ta", label: "Ta", sld: 69.0 },
    { key: "cr", label: "Cr", sld: 43.0 },
    { key: "ru", label: "Ru", sld: 73.0 },
    { key: "w", label: "W", sld: 92.0 },
    { key: "mo", label: "Mo", sld: 63.0 },
    { key: "nb", label: "Nb", sld: 42.0 },
    { key: "v", label: "V", sld: 33.0 },
    { key: "al", label: "Al", sld: 24.0 },
    { key: "ag", label: "Ag", sld: 87.0 },
    { key: "mn3sn", label: "Mn3Sn", sld: 64.0 },
    { key: "pt", label: "Pt", sld: 96.0 },
    { key: "au", label: "Au", sld: 117.0 },
    { key: "pd", label: "Pd", sld: 84.0 },
    { key: "ir", label: "Ir", sld: 120.0 }
  ];
  const MATERIAL_MAP = Object.fromEntries(MATERIAL_PRESETS.map((m) => [m.key, m]));

  const state = {
    layers: [],
    dataQ: [],
    dataR: [],
    fitQ: [],
    fitR: [],
    lastFit: null,
    fitting: false,
    stopRequested: false,
    loadedText: ""
  };

  function cloneLayers(layers) {
    return layers.map((x) => ({ ...x }));
  }

  function initLayers() {
    state.layers = [
      { id: "ambient", name: "Ambient", fixed: true, material: "air", sld: 0.0, thickness: 0, roughness: 5.0, fitSld: false, fitThickness: false, fitRoughness: true },
      { id: "film-1", name: "Film 1", fixed: false, material: "py", sld: 70.0, thickness: 200.0, roughness: 4.0, fitSld: true, fitThickness: true, fitRoughness: true },
      { id: "film-2", name: "Film 2", fixed: false, material: "sio2", sld: 18.9, thickness: 5000.0, roughness: 0.0, fitSld: false, fitThickness: true, fitRoughness: true },
      { id: "substrate", name: "Substrate", fixed: true, material: "si", sld: 20.0, thickness: 0, roughness: 0.0, fitSld: false, fitThickness: false, fitRoughness: false }
    ];
    renderLayerTable();
  }

  function setStatus(text, isError) {
    els.status.textContent = text;
    els.status.style.color = isError ? "#ff8d8d" : "";
  }

  function setFitProgress(text) {
    els.fitProgress.textContent = "Fit progress: " + text;
  }

  function updateDataSummary(extra) {
    if (!state.dataQ.length) {
      els.dataSummary.textContent = "Measured data: not loaded";
      return;
    }
    const qMin = Math.min(...state.dataQ);
    const qMax = Math.max(...state.dataQ);
    const suffix = extra ? " | " + extra : "";
    els.dataSummary.textContent =
      "Measured data: loaded (" + state.dataQ.length + " points, q=" + qMin.toFixed(4) + " to " + qMax.toFixed(4) + " A^-1)" + suffix;
  }

  function renderFitResult() {
    els.fitLayerBody.innerHTML = "";
    if (!state.lastFit || !state.lastFit.layers || state.lastFit.layers.length === 0) {
      els.fitSummary.textContent = "No fit result yet.";
      return;
    }
    const f = state.lastFit;
    els.fitSummary.textContent =
      "score=" + f.score.toExponential(3) +
      " | scale=" + f.scale.toFixed(6) +
      " | background=" + f.background.toExponential(4) +
      " | qShift=" + (f.qShift || 0).toExponential(3);
    for (const layer of f.layers) {
      const tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + layer.name + "</td>" +
        "<td>" + Number(layer.sld).toFixed(4) + "</td>" +
        "<td>" + Number(layer.thickness).toFixed(3) + "</td>" +
        "<td>" + Number(layer.roughness).toFixed(3) + "</td>";
      els.fitLayerBody.appendChild(tr);
    }
  }

  function filmCount() {
    return Math.max(0, state.layers.length - 2);
  }

  function addLayer() {
    const count = filmCount() + 1;
    const insertAt = state.layers.length - 1;
    state.layers.splice(insertAt, 0, {
      id: "film-" + count,
      name: "Film " + count,
      fixed: false,
      material: "custom",
      sld: 7.0,
      thickness: 80,
      roughness: 4,
      fitSld: true,
      fitThickness: true,
      fitRoughness: true
    });
    renumberFilmLayers();
    renderLayerTable();
    calculateAndPlot();
  }

  function removeLayer() {
    if (filmCount() <= 1) {
      setStatus("At least one film layer is required.", true);
      return;
    }
    state.layers.splice(state.layers.length - 2, 1);
    renumberFilmLayers();
    renderLayerTable();
    calculateAndPlot();
  }

  function renumberFilmLayers() {
    let idx = 1;
    for (let i = 1; i < state.layers.length - 1; i += 1) {
      state.layers[i].id = "film-" + idx;
      state.layers[i].name = "Film " + idx;
      idx += 1;
    }
  }

  function numInput(value, fallback, min) {
    const x = Number(value);
    if (!Number.isFinite(x)) return fallback;
    if (typeof min === "number" && x < min) return min;
    return x;
  }

  function renderLayerTable() {
    els.layerBody.innerHTML = "";
    for (let i = 0; i < state.layers.length; i += 1) {
      const layer = state.layers[i];
      const tr = document.createElement("tr");
      const materialValue = layer.material && MATERIAL_MAP[layer.material] ? layer.material : "custom";
      const materialOptions = MATERIAL_PRESETS.map((m) => `<option value="${m.key}" ${m.key === materialValue ? "selected" : ""}>${m.label}</option>`).join("");

      const cells = [
        layer.name,
        `<select data-key="material" data-idx="${i}">${materialOptions}</select>`,
        `<input type="number" min="0" step="any" data-key="sld" data-idx="${i}" value="${layer.sld}" />`,
        `<input type="number" min="0" step="any" data-key="thickness" data-idx="${i}" value="${layer.thickness}" ${layer.fixed ? "disabled" : ""} />`,
        `<input type="number" min="0" step="any" data-key="roughness" data-idx="${i}" value="${layer.roughness}" ${i === state.layers.length - 1 ? "disabled" : ""} />`,
        `<input type="checkbox" data-key="fitSld" data-idx="${i}" ${layer.fitSld ? "checked" : ""} ${layer.fixed ? "disabled" : ""} />`,
        `<input type="checkbox" data-key="fitThickness" data-idx="${i}" ${layer.fitThickness ? "checked" : ""} ${layer.fixed ? "disabled" : ""} />`,
        `<input type="checkbox" data-key="fitRoughness" data-idx="${i}" ${layer.fitRoughness ? "checked" : ""} ${i === state.layers.length - 1 ? "disabled" : ""} />`
      ];

      for (const cell of cells) {
        const td = document.createElement("td");
        td.innerHTML = cell;
        tr.appendChild(td);
      }
      els.layerBody.appendChild(tr);
    }
  }

  function handleLayerEdit(target) {
    const idx = Number(target.dataset.idx);
    const key = target.dataset.key;
    if (!Number.isFinite(idx) || !key) return;
    const layer = state.layers[idx];
    if (!layer) return;

    if (target.type === "checkbox") {
      layer[key] = !!target.checked;
    } else if (key === "material") {
      const materialKey = target.value;
      layer.material = MATERIAL_MAP[materialKey] ? materialKey : "custom";
      const preset = MATERIAL_MAP[layer.material];
      if (preset && Number.isFinite(preset.sld)) {
        layer.sld = preset.sld;
      }
      renderLayerTable();
    } else if (key === "sld") {
      layer.material = "custom";
      layer.sld = numInput(target.value, layer.sld, 0);
    } else if (key === "thickness") {
      layer.thickness = numInput(target.value, layer.thickness, 0);
    } else if (key === "roughness") {
      layer.roughness = numInput(target.value, layer.roughness, 0);
    }
    calculateAndPlot();
  }

  function c(re, im) {
    return { re, im };
  }

  function cAdd(a, b) {
    return { re: a.re + b.re, im: a.im + b.im };
  }

  function cSub(a, b) {
    return { re: a.re - b.re, im: a.im - b.im };
  }

  function cMul(a, b) {
    return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
  }

  function cDiv(a, b) {
    const den = b.re * b.re + b.im * b.im || 1e-30;
    return {
      re: (a.re * b.re + a.im * b.im) / den,
      im: (a.im * b.re - a.re * b.im) / den
    };
  }

  function cExp(z) {
    const e = Math.exp(z.re);
    return { re: e * Math.cos(z.im), im: e * Math.sin(z.im) };
  }

  function cSqrt(z) {
    const r = Math.hypot(z.re, z.im);
    const t = Math.atan2(z.im, z.re) * 0.5;
    return { re: Math.sqrt(r) * Math.cos(t), im: Math.sqrt(r) * Math.sin(t) };
  }

  function cAbs2(z) {
    return z.re * z.re + z.im * z.im;
  }

  function parrattReflectivity(q, layers, scale, background) {
    const n = layers.length - 1;
    if (n < 1) return background;

    const rho0 = layers[0].sld * 1e-6;
    const kz = new Array(layers.length);

    for (let j = 0; j < layers.length; j += 1) {
      const rho = layers[j].sld * 1e-6;
      const real = q * q * 0.25 - 4 * Math.PI * (rho - rho0);
      kz[j] = cSqrt(c(real, 0));
    }

    let x = c(0, 0);
    for (let j = n - 1; j >= 0; j -= 1) {
      const k1 = kz[j];
      const k2 = kz[j + 1];
      const sigma = Math.max(0, layers[j].roughness || 0);
      const fresnel = cDiv(cSub(k1, k2), cAdd(k1, k2));

      const kk = cMul(k1, k2);
      const roughFac = Math.exp(-2 * kk.re * sigma * sigma);
      const rf = cMul(fresnel, c(roughFac, 0));

      const phaseArg = cMul(c(0, 2 * Math.max(0, layers[j + 1].thickness || 0)), k2);
      const phase = cExp(phaseArg);
      const xe = cMul(x, phase);

      x = cDiv(cAdd(rf, xe), cAdd(c(1, 0), cMul(rf, xe)));
    }

    return Math.max(EPS, scale * cAbs2(x) + background);
  }

  function applyResolutionConvolution(qArr, rArr, dqOverQ) {
    if (!qArr.length || dqOverQ <= 0) return rArr.slice();
    const out = new Array(qArr.length);
    const maxWin = 48;
    for (let i = 0; i < qArr.length; i += 1) {
      const qi = qArr[i];
      const sigma = Math.max(1e-6, Math.abs(qi) * dqOverQ);
      const span = 3 * sigma;
      let sumW = 0;
      let sumY = 0;

      let jLeft = i;
      while (jLeft > 0 && qi - qArr[jLeft - 1] < span && i - jLeft < maxWin) jLeft -= 1;
      let jRight = i;
      while (jRight + 1 < qArr.length && qArr[jRight + 1] - qi < span && jRight - i < maxWin) jRight += 1;

      for (let j = jLeft; j <= jRight; j += 1) {
        const d = qArr[j] - qi;
        const w = Math.exp(-0.5 * (d * d) / (sigma * sigma));
        sumW += w;
        sumY += w * rArr[j];
      }
      out[i] = sumW > 0 ? sumY / sumW : rArr[i];
    }
    return out;
  }

  function correctedReflectivityAtQ(q, layers, scale, background, qShift, enableFootprint, footprintQ) {
    const qEff = Math.max(1e-7, q + qShift);
    let y = parrattReflectivity(qEff, layers, scale, background);
    if (enableFootprint) {
      const qFull = Math.max(1e-6, footprintQ);
      const fp = Math.min(1, qEff / qFull);
      y *= fp;
    }
    return Math.max(EPS, y);
  }

  function linspace(start, end, n) {
    if (n <= 1) return [start];
    const out = new Array(n);
    const step = (end - start) / (n - 1);
    for (let i = 0; i < n; i += 1) out[i] = start + i * step;
    return out;
  }

  function getQGrid() {
    const qMin = numInput(els.qMin.value, 0.005, 1e-5);
    const qMax = numInput(els.qMax.value, 0.3, qMin + 1e-4);
    const n = Math.max(50, Math.round(numInput(els.qCount.value, 500, 50)));
    return linspace(qMin, qMax, n);
  }

  function calculateModel(qArr) {
    const bg = Math.max(0, numInput(els.background.value, 1e-8, 0));
    const scale = Math.max(1e-8, numInput(els.scale.value, 1, 1e-8));
    const qShift = numInput(els.qShift.value, 0);
    const dqOverQ = Math.max(0, numInput(els.dqOverQ.value, 0.015, 0));
    const enableResolution = !!els.enableResolution.checked;
    const enableFootprint = !!els.enableFootprint.checked;
    const footprintQ = Math.max(1e-6, numInput(els.footprintQ.value, 0.02, 1e-6));
    const outRaw = new Array(qArr.length);
    for (let i = 0; i < qArr.length; i += 1) {
      outRaw[i] = correctedReflectivityAtQ(qArr[i], state.layers, scale, bg, qShift, enableFootprint, footprintQ);
    }
    return enableResolution ? applyResolutionConvolution(qArr, outRaw, dqOverQ) : outRaw;
  }

  function parseHeaderValue(lines, key) {
    for (const raw of lines) {
      const line = raw.trim();
      if (line.startsWith(key + "=")) {
        return line.slice(key.length + 1).trim();
      }
    }
    return "";
  }

  function parseDataText(text) {
    const lines = text.split(/\r?\n/);
    const isRaw4 = lines.length > 0 && lines[0].trim().startsWith(";RAW4.");
    const alphaAverage = Number(parseHeaderValue(lines, "AlphaAverage"));
    const alpha1 = Number(parseHeaderValue(lines, "Alpha1"));
    const wavelength = Number.isFinite(alphaAverage) && alphaAverage > 0
      ? alphaAverage
      : (Number.isFinite(alpha1) && alpha1 > 0 ? alpha1 : 1.5406);
    const angleMode = (els.raw4AngleMode.value || "2theta").toLowerCase();

    const q = [];
    const r = [];
    let inDataBlock = !isRaw4;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || line.startsWith("//") || line.startsWith("%")) continue;
      if (isRaw4) {
        if (line === "[Data]") {
          inDataBlock = true;
          continue;
        }
        if (!inDataBlock) continue;
        if (line.startsWith("[")) break;
      }

      const cols = line.split(/[,\t; ]+/).filter(Boolean);
      if (cols.length < 2) continue;
      const xv = Number(cols[0]);
      const yv = Number(cols[1]);
      if (!Number.isFinite(xv) || !Number.isFinite(yv) || xv <= 0 || yv <= 0) continue;

      if (isRaw4) {
        const thetaDeg = angleMode === "2theta" ? xv * 0.5 : xv;
        const thetaRad = (thetaDeg * Math.PI) / 180;
        const qv = (4 * Math.PI * Math.sin(thetaRad)) / wavelength;
        q.push(qv);
      } else {
        q.push(xv);
      }
      r.push(yv);
    }

    const rMax = r.length ? Math.max(...r) : 1;
    if (rMax > 0) {
      for (let i = 0; i < r.length; i += 1) r[i] /= rMax;
    }

    const idx = q.map((x, i) => i).sort((a, b) => q[a] - q[b]);
    state.dataQ = idx.map((i) => q[i]);
    state.dataR = idx.map((i) => r[i]);
    return { isRaw4, wavelength, normalized: rMax > 0 ? rMax : 1, angleMode };
  }

  function applyParamsToModel(paramDefs, vec, layersRef, baseBg, baseScale) {
    let bg = baseBg;
    let scale = baseScale;
    let qShift = numInput(els.qShift.value, 0);
    for (let i = 0; i < paramDefs.length; i += 1) {
      const def = paramDefs[i];
      if (def.scope === "layer") {
        layersRef[def.idx][def.key] = vec[i];
      } else if (def.scope === "global") {
        if (def.key === "background") bg = vec[i];
        if (def.key === "scale") scale = vec[i];
        if (def.key === "qShift") qShift = vec[i];
      }
    }
    return { bg, scale, qShift };
  }

  function residualWeightForPoint(dataR) {
    const mode = (els.weightMode.value || "uniform").toLowerCase();
    if (mode !== "logr-band") return 1;
    const logR = Math.log10(Math.max(EPS, dataR));
    const lo = numInput(els.weightLogRMin.value, -3.2);
    const hi = numInput(els.weightLogRMax.value, -1.8);
    const boost = Math.max(1, numInput(els.weightBoost.value, 3.0, 1));
    const low = Math.min(lo, hi);
    const high = Math.max(lo, hi);
    return logR >= low && logR <= high ? boost : 1;
  }

  function objectiveWithParams(paramDefs, vec, layersRef, baseBg, baseScale) {
    const globals = applyParamsToModel(paramDefs, vec, layersRef, baseBg, baseScale);
    if (state.dataQ.length === 0) return Infinity;
    const enableResolution = !!els.enableResolution.checked;
    const dqOverQ = Math.max(0, numInput(els.dqOverQ.value, 0.015, 0));
    const enableFootprint = !!els.enableFootprint.checked;
    const footprintQ = Math.max(1e-6, numInput(els.footprintQ.value, 0.02, 1e-6));
    const modelRaw = new Array(state.dataQ.length);
    for (let i = 0; i < state.dataQ.length; i += 1) {
      modelRaw[i] = correctedReflectivityAtQ(
        state.dataQ[i],
        layersRef,
        globals.scale,
        globals.bg,
        globals.qShift,
        enableFootprint,
        footprintQ
      );
    }
    const modelArr = enableResolution ? applyResolutionConvolution(state.dataQ, modelRaw, dqOverQ) : modelRaw;
    let sse = 0;
    let wsum = 0;
    for (let i = 0; i < state.dataQ.length; i += 1) {
      const model = modelArr[i];
      const dy = Math.log10(model + EPS) - Math.log10(state.dataR[i] + EPS);
      const w = residualWeightForPoint(state.dataR[i]);
      sse += w * dy * dy;
      wsum += w;
    }
    return sse / Math.max(EPS, wsum);
  }

  function clamp(x, lo, hi) {
    return Math.min(hi, Math.max(lo, x));
  }

  function buildParamDefs() {
    const defs = [];
    for (let i = 0; i < state.layers.length; i += 1) {
      const layer = state.layers[i];
      if (layer.fitSld) defs.push({ scope: "layer", idx: i, key: "sld", lo: 0.0, hi: 120.0 });
      if (layer.fitThickness) defs.push({ scope: "layer", idx: i, key: "thickness", lo: 1.0, hi: 10000.0 });
      if (layer.fitRoughness && i !== state.layers.length - 1) defs.push({ scope: "layer", idx: i, key: "roughness", lo: 0.0, hi: 25.0 });
    }
    if (els.fitBackground.checked) defs.push({ scope: "global", idx: -1, key: "background", lo: 1e-12, hi: 0.2 });
    if (els.fitScale.checked) defs.push({ scope: "global", idx: -1, key: "scale", lo: 1e-4, hi: 5.0 });
    if (els.fitQShift.checked) defs.push({ scope: "global", idx: -1, key: "qShift", lo: -0.03, hi: 0.03 });
    return defs;
  }

  function currentParamVec(defs, layersRef, baseBg, baseScale) {
    return defs.map((d) => {
      if (d.scope === "global") {
        if (d.key === "background") return baseBg;
        if (d.key === "scale") return baseScale;
        if (d.key === "qShift") return numInput(els.qShift.value, 0);
      }
      return layersRef[d.idx][d.key];
    });
  }

  function shuffledIndices(n) {
    return Array.from({ length: n }, (_, i) => i);
  }

  function halton(index, base) {
    let f = 1;
    let r = 0;
    let i = index;
    while (i > 0) {
      f /= base;
      r += f * (i % base);
      i = Math.floor(i / base);
    }
    return r;
  }

  function oneDimensionalGlobalSearch(defs, iters, layersRef, baseBg, baseScale, onProgress, shouldStop) {
    const d = defs[0];
    let lo = d.lo;
    let hi = d.hi;
    let bestX = lo;
    let bestScore = Infinity;
    const levels = 6;
    const pointsPerLevel = Math.max(80, Math.min(600, Math.round(iters / 2)));
    let progressCount = 0;
    const totalProgress = levels * pointsPerLevel;

    for (let level = 0; level < levels; level += 1) {
      if (typeof shouldStop === "function" && shouldStop()) {
        return { x: [bestX], score: bestScore, cancelled: true };
      }
      let localBestX = lo;
      let localBestScore = Infinity;
      for (let i = 0; i < pointsPerLevel; i += 1) {
        if (typeof shouldStop === "function" && shouldStop()) {
          return { x: [bestX], score: bestScore, cancelled: true };
        }
        const t = pointsPerLevel <= 1 ? 0 : i / (pointsPerLevel - 1);
        const x = lo + (hi - lo) * t;
        const score = objectiveWithParams(defs, [x], layersRef, baseBg, baseScale);
        if (score < localBestScore) {
          localBestScore = score;
          localBestX = x;
        }
        progressCount += 1;
        if (typeof onProgress === "function" && progressCount % 12 === 0) {
          onProgress(progressCount, totalProgress, bestScore < localBestScore ? bestScore : localBestScore, [localBestX]);
        }
      }

      if (localBestScore < bestScore) {
        bestScore = localBestScore;
        bestX = localBestX;
      }

      const span = hi - lo;
      const half = Math.max(span * 0.18, (d.hi - d.lo) * 1e-5);
      lo = Math.max(d.lo, bestX - half);
      hi = Math.min(d.hi, bestX + half);
    }

    return { x: [bestX], score: bestScore, cancelled: false };
  }

  function findThicknessParamIndices(defs) {
    const out = [];
    for (let i = 0; i < defs.length; i += 1) {
      const d = defs[i];
      if (d.scope === "layer" && d.key === "thickness") out.push(i);
    }
    return out;
  }

  function pushTopCandidate(top, candidate, topK) {
    top.push(candidate);
    top.sort((a, b) => a.score - b.score);
    if (top.length > topK) top.length = topK;
  }

  async function thicknessCarpetSeeds(defs, baseVec, layersRef, baseBg, baseScale, shouldStop) {
    const thicknessIdx = findThicknessParamIndices(defs);
    if (thicknessIdx.length === 0) return [];
    const steps = Math.max(7, Math.round(numInput(els.carpetSteps.value, 21, 7)));
    const topK = Math.max(1, Math.round(numInput(els.carpetTopk.value, 8, 1)));
    const seeds = [];

    if (thicknessIdx.length === 1) {
      const p0 = thicknessIdx[0];
      const d0 = defs[p0];
      for (let i = 0; i < steps; i += 1) {
        if (shouldStop()) break;
        const t = steps <= 1 ? 0 : i / (steps - 1);
        const vec = baseVec.slice();
        vec[p0] = d0.lo + (d0.hi - d0.lo) * t;
        const score = objectiveWithParams(defs, vec, layersRef, baseBg, baseScale);
        pushTopCandidate(seeds, { vec, score }, topK);
        if (i % 8 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      }
      return seeds.map((x) => x.vec);
    }

    const p0 = thicknessIdx[0];
    const p1 = thicknessIdx[1];
    const d0 = defs[p0];
    const d1 = defs[p1];
    const total = steps * steps;
    let done = 0;

    for (let i = 0; i < steps; i += 1) {
      if (shouldStop()) break;
      const t0 = steps <= 1 ? 0 : i / (steps - 1);
      const x0 = d0.lo + (d0.hi - d0.lo) * t0;
      for (let j = 0; j < steps; j += 1) {
        if (shouldStop()) break;
        const t1 = steps <= 1 ? 0 : j / (steps - 1);
        const x1 = d1.lo + (d1.hi - d1.lo) * t1;
        const vec = baseVec.slice();
        vec[p0] = x0;
        vec[p1] = x1;
        const score = objectiveWithParams(defs, vec, layersRef, baseBg, baseScale);
        pushTopCandidate(seeds, { vec, score }, topK);
        done += 1;
        if (done % 30 === 0) {
          setFitProgress("carpet scan " + done + "/" + total + " | best=" + seeds[0].score.toExponential(3));
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
    }
    return seeds.map((x) => x.vec);
  }

  function runLocalSearch(defs, x0, iters, layersRef, baseBg, baseScale, onProgress, shouldStop) {
    let x = x0.slice();
    let best = objectiveWithParams(defs, x, layersRef, baseBg, baseScale);
    const step = defs.map((d) => (d.hi - d.lo) * 0.18);

    for (let iter = 0; iter < iters; iter += 1) {
      if (typeof shouldStop === "function" && shouldStop()) {
        return { x, score: best, cancelled: true };
      }
      let improved = false;
      const order = shuffledIndices(defs.length);
      const shift = defs.length ? iter % defs.length : 0;
      for (let oi = 0; oi < order.length; oi += 1) {
        if (typeof shouldStop === "function" && shouldStop()) {
          return { x, score: best, cancelled: true };
        }
        const p = order[(oi + shift) % order.length];
        const d = defs[p];
        let localBest = best;
        let localVal = x[p];
        for (const delta of [step[p], -step[p], step[p] * 0.5, -step[p] * 0.5]) {
          const v = clamp(x[p] + delta, d.lo, d.hi);
          if (v === x[p]) continue;
          const trial = x.slice();
          trial[p] = v;
          const score = objectiveWithParams(defs, trial, layersRef, baseBg, baseScale);
          if (score < localBest) {
            localBest = score;
            localVal = v;
          }
        }
        if (localBest < best) {
          x[p] = localVal;
          best = localBest;
          improved = true;
        }
      }

      if (!improved) {
        for (let p = 0; p < step.length; p += 1) step[p] *= 0.72;
      }
      if (typeof onProgress === "function" && (iter % 12 === 0 || iter === iters - 1)) {
        onProgress(iter + 1, iters, best, x);
      }
      if (Math.max(...step) < 1e-5) break;
    }
    return { x, score: best, cancelled: false };
  }

  async function fitModel() {
    if (state.fitting) {
      setStatus("Fit is already running.", true);
      return;
    }
    if (state.dataQ.length === 0) {
      setStatus("Load measured data first.", true);
      return;
    }
    const defs = buildParamDefs();
    if (defs.length === 0) {
      setStatus("No fitting variables selected.", true);
      return;
    }

    state.fitting = true;
    state.stopRequested = false;
    els.fitStopBtn.disabled = false;
    setFitProgress("running");
    try {
      const starts = Math.max(1, Math.round(numInput(els.fitStarts.value, 6, 1)));
      const iters = Math.max(20, Math.round(numInput(els.fitIter.value, 250, 20)));
      const startSpread = clamp(numInput(els.startSpread.value, 0.6, 0.05), 0.05, 1.0);
      const workLayers = cloneLayers(state.layers);
      const baseBg = Math.max(1e-12, numInput(els.background.value, 1e-8, 1e-12));
      const baseScale = Math.max(1e-8, numInput(els.scale.value, 1, 1e-8));
      const base = currentParamVec(defs, workLayers, baseBg, baseScale);
      let bestAll = { x: base.slice(), score: objectiveWithParams(defs, base, workLayers, baseBg, baseScale) };
      const useCarpet = !!els.enableCarpet.checked;

      function previewBest(vec, score) {
        const previewLayers = cloneLayers(state.layers);
        const globals = applyParamsToModel(defs, vec, previewLayers, baseBg, baseScale);
        const enableResolution = !!els.enableResolution.checked;
        const dqOverQ = Math.max(0, numInput(els.dqOverQ.value, 0.015, 0));
        const enableFootprint = !!els.enableFootprint.checked;
        const footprintQ = Math.max(1e-6, numInput(els.footprintQ.value, 0.02, 1e-6));
        const qCalc = state.dataQ.length > 0 ? state.dataQ.slice() : getQGrid();
        const raw = qCalc.map((q) => correctedReflectivityAtQ(
          q,
          previewLayers,
          globals.scale,
          globals.bg,
          globals.qShift,
          enableFootprint,
          footprintQ
        ));
        state.fitQ = qCalc;
        state.fitR = enableResolution ? applyResolutionConvolution(qCalc, raw, dqOverQ) : raw;
        drawPlot();
        setFitProgress("best=" + score.toExponential(3));
      }

      if (defs.length === 1) {
        const out1d = oneDimensionalGlobalSearch(
          defs,
          iters,
          workLayers,
          baseBg,
          baseScale,
          (iterNow, iterTotal, localBest, vecNow) => {
            setFitProgress("1D global search | iter " + iterNow + "/" + iterTotal + " | best=" + localBest.toExponential(3));
            if (localBest < bestAll.score) {
              bestAll = { x: vecNow.slice(), score: localBest };
              previewBest(bestAll.x, bestAll.score);
            }
          },
          () => state.stopRequested
        );
        if (out1d.score < bestAll.score) bestAll = out1d;
      } else {
        const primeBases = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29];
        const preSeeds = [base.slice()];
        if (useCarpet) {
          const carpetSeeds = await thicknessCarpetSeeds(defs, base, workLayers, baseBg, baseScale, () => state.stopRequested);
          for (const svec of carpetSeeds) preSeeds.push(svec.slice());
          if (carpetSeeds.length > 0) {
            const score0 = objectiveWithParams(defs, carpetSeeds[0], workLayers, baseBg, baseScale);
            if (score0 < bestAll.score) {
              bestAll = { x: carpetSeeds[0].slice(), score: score0 };
              previewBest(bestAll.x, bestAll.score);
            }
          }
        }
        for (let s = 0; s < starts; s += 1) {
        if (state.stopRequested) break;
        const seed = s < preSeeds.length ? preSeeds[s].slice() : base.slice();
        if (s >= preSeeds.length) {
          for (let i = 0; i < defs.length; i += 1) {
            const d = defs[i];
            const span = d.hi - d.lo;
            const centerJitter = span * startSpread;
            const h = halton(s * (i + 2), primeBases[i % primeBases.length]);
            const u = (h - 0.5) * 2;
            seed[i] = clamp(base[i] + u * centerJitter, d.lo, d.hi);
          }
        }
        const out = runLocalSearch(defs, seed, iters, workLayers, baseBg, baseScale, (iterNow, iterTotal, localBest, vecNow) => {
          setFitProgress("start " + (s + 1) + "/" + starts + " | iter " + iterNow + "/" + iterTotal + " | local=" + localBest.toExponential(3) + " | global=" + bestAll.score.toExponential(3));
          if (localBest < bestAll.score) {
            bestAll = { x: vecNow.slice(), score: localBest };
            previewBest(bestAll.x, bestAll.score);
          }
        }, () => state.stopRequested);
        if (out.score < bestAll.score) bestAll = out;
        if (out.cancelled) break;
        setStatus("Fitting: start " + (s + 1) + "/" + starts + " | score=" + out.score.toExponential(3), false);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      }

      objectiveWithParams(defs, bestAll.x, workLayers, baseBg, baseScale);
      const bgIdx = defs.findIndex((d) => d.scope === "global" && d.key === "background");
      const bestBg = bgIdx >= 0 ? Math.max(1e-12, bestAll.x[bgIdx]) : baseBg;
      const scaleIdx = defs.findIndex((d) => d.scope === "global" && d.key === "scale");
      const bestScale = scaleIdx >= 0 ? Math.max(1e-8, bestAll.x[scaleIdx]) : baseScale;
      const qShiftIdx = defs.findIndex((d) => d.scope === "global" && d.key === "qShift");
      const bestQShift = qShiftIdx >= 0 ? bestAll.x[qShiftIdx] : numInput(els.qShift.value, 0);

      state.lastFit = {
        layers: cloneLayers(workLayers),
        background: bestBg,
        scale: bestScale,
        qShift: bestQShift,
        score: bestAll.score
      };

      const qCalc = state.dataQ.length > 0 ? state.dataQ.slice() : getQGrid();
      const enableResolution = !!els.enableResolution.checked;
      const dqOverQ = Math.max(0, numInput(els.dqOverQ.value, 0.015, 0));
      const enableFootprint = !!els.enableFootprint.checked;
      const footprintQ = Math.max(1e-6, numInput(els.footprintQ.value, 0.02, 1e-6));
      const raw = qCalc.map((q) => correctedReflectivityAtQ(
        q,
        state.lastFit.layers,
        state.lastFit.scale,
        state.lastFit.background,
        state.lastFit.qShift,
        enableFootprint,
        footprintQ
      ));
      state.fitQ = qCalc;
      state.fitR = enableResolution ? applyResolutionConvolution(qCalc, raw, dqOverQ) : raw;
      drawPlot();
      renderFitResult();
      if (state.stopRequested) {
        setStatus("Fit stopped. Best score so far=" + bestAll.score.toExponential(3), false);
        setFitProgress("stopped");
      } else {
        setStatus("Fit complete. Best score=" + bestAll.score.toExponential(3), false);
        setFitProgress("done");
      }
    } finally {
      state.fitting = false;
      state.stopRequested = false;
      els.fitStopBtn.disabled = true;
    }
  }

  function stopFit() {
    if (!state.fitting) {
      setStatus("No running fit to stop.", true);
      return;
    }
    state.stopRequested = true;
    setFitProgress("stop requested");
  }

  function applyFitToInitialModel() {
    if (!state.lastFit || !state.lastFit.layers) {
      setStatus("No fit result to apply.", true);
      return;
    }
    state.layers = cloneLayers(state.lastFit.layers);
    els.background.value = Math.max(1e-12, state.lastFit.background).toExponential(4);
    els.scale.value = Math.max(1e-8, state.lastFit.scale).toFixed(6);
    els.qShift.value = Number(state.lastFit.qShift || 0).toExponential(4);
    renderLayerTable();
    calculateAndPlot();
    setStatus("Applied fit result to initial model.", false);
  }

  function calculateAndPlot() {
    const qCalc = state.dataQ.length > 0 ? state.dataQ.slice() : getQGrid();
    const rCalc = calculateModel(qCalc);

    state.fitQ = qCalc;
    state.fitR = rCalc;
    drawPlot();
  }

  function drawPlot() {
    const w = Math.max(320, Math.floor(els.canvas.clientWidth || 900));
    const h = Math.max(240, Math.floor(els.canvas.clientHeight || 480));
    els.canvas.width = Math.floor(w * DPR);
    els.canvas.height = Math.floor(h * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    ctx.clearRect(0, 0, w, h);
    const m = { l: 62, r: 16, t: 18, b: 46 };
    const pw = w - m.l - m.r;
    const ph = h - m.t - m.b;
    if (pw < 80 || ph < 80) return;

    const qAll = state.fitQ.length ? state.fitQ : getQGrid();
    const rAll = [];
    if (state.fitR.length) rAll.push(...state.fitR);
    if (state.dataR.length) rAll.push(...state.dataR);
    if (rAll.length === 0) return;

    const xMin = Math.min(...qAll);
    const xMax = Math.max(...qAll);
    const yLogs = rAll.map((v) => Math.log10(Math.max(EPS, v)));
    const yMin = Math.max(-12, Math.min(...yLogs) - 0.3);
    const yMax = Math.min(0.2, Math.max(...yLogs) + 0.25);

    function px(x) {
      return m.l + ((x - xMin) / Math.max(1e-12, xMax - xMin)) * pw;
    }
    function py(y) {
      return m.t + (1 - (y - yMin) / Math.max(1e-12, yMax - yMin)) * ph;
    }

    ctx.strokeStyle = "rgba(140, 180, 190, 0.28)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 6; i += 1) {
      const y = yMin + ((yMax - yMin) * i) / 6;
      const yy = py(y);
      ctx.beginPath();
      ctx.moveTo(m.l, yy);
      ctx.lineTo(m.l + pw, yy);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(130, 170, 180, 0.42)";
    ctx.beginPath();
    ctx.moveTo(m.l, m.t + ph);
    ctx.lineTo(m.l + pw, m.t + ph);
    ctx.moveTo(m.l, m.t);
    ctx.lineTo(m.l, m.t + ph);
    ctx.stroke();

    ctx.fillStyle = "#c8dadd";
    ctx.font = "12px Noto Sans JP";
    ctx.textAlign = "center";
    ctx.fillText("q (A^-1)", m.l + pw * 0.5, h - 10);
    ctx.save();
    ctx.translate(16, m.t + ph * 0.5);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("log10(R)", 0, 0);
    ctx.restore();

    ctx.textAlign = "right";
    for (let i = 0; i <= 6; i += 1) {
      const y = yMin + ((yMax - yMin) * i) / 6;
      ctx.fillText(y.toFixed(2), m.l - 7, py(y) + 4);
    }

    if (state.fitQ.length && state.fitR.length) {
      ctx.strokeStyle = "#36dfc5";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (let i = 0; i < state.fitQ.length; i += 1) {
        const x = px(state.fitQ[i]);
        const y = py(Math.log10(Math.max(EPS, state.fitR[i])));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    if (state.dataQ.length && state.dataR.length) {
      ctx.fillStyle = "#f4b748";
      for (let i = 0; i < state.dataQ.length; i += 1) {
        const x = px(state.dataQ[i]);
        const y = py(Math.log10(Math.max(EPS, state.dataR[i])));
        ctx.fillRect(x - 2, y - 2, 4, 4);
      }
    }

    ctx.font = "12px Noto Sans JP";
    ctx.textAlign = "left";
    const legendX = m.l + 10;
    const legendY = m.t + 16;
    if (state.fitQ.length && state.fitR.length) {
      ctx.strokeStyle = "#36dfc5";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(legendX, legendY);
      ctx.lineTo(legendX + 18, legendY);
      ctx.stroke();
      ctx.fillStyle = "#d7ecef";
      ctx.fillText("Fit", legendX + 24, legendY + 4);
    }
    if (state.dataQ.length && state.dataR.length) {
      ctx.fillStyle = "#f4b748";
      ctx.fillRect(legendX, legendY + 10, 8, 8);
      ctx.fillStyle = "#d7ecef";
      ctx.fillText("Measured", legendX + 24, legendY + 18);
    } else {
      ctx.fillStyle = "#9ab4ba";
      ctx.fillText("No measured data loaded", legendX, legendY + 18);
    }
  }

  function generateSyntheticData() {
    const q = getQGrid();
    const clean = calculateModel(q);
    const noisy = clean.map((v) => {
      const rel = 0.04 * (Math.random() * 2 - 1);
      return Math.max(EPS, v * (1 + rel));
    });
    state.dataQ = q;
    state.dataR = noisy;
    calculateAndPlot();
    updateDataSummary("synthetic");
    setStatus("Synthetic data generated.", false);
  }

  function median(values) {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) return 0.5 * (sorted[mid - 1] + sorted[mid]);
    return sorted[mid];
  }

  function autoGuessGlobalParams() {
    if (!state.dataQ.length || !state.dataR.length) {
      setStatus("Load measured data first.", true);
      return;
    }
    const n = state.dataR.length;
    const tailStart = Math.max(0, Math.floor(n * 0.8));
    const tail = state.dataR.slice(tailStart).filter((v) => Number.isFinite(v) && v > 0);
    const bgGuess = clamp(median(tail.length ? tail : state.dataR), 1e-12, 0.2);

    const enableFootprint = !!els.enableFootprint.checked;
    const footprintQ = Math.max(1e-6, numInput(els.footprintQ.value, 0.02, 1e-6));
    const model0 = correctedReflectivityAtQ(state.dataQ[0], state.layers, 1.0, 0.0, 0.0, enableFootprint, footprintQ);
    const scaleGuess = clamp((state.dataR[0] - bgGuess) / Math.max(EPS, model0), 1e-4, 5.0);

    els.background.value = bgGuess.toExponential(4);
    els.scale.value = scaleGuess.toFixed(6);
    els.qShift.value = "0.0";
    calculateAndPlot();
    setStatus("Auto-guessed background/scale from measured data.", false);
  }

  function exportCsv() {
    if (!state.fitQ.length) {
      setStatus("No fit curve to export.", true);
      return;
    }
    const header = "q_A-1,data_R,fit_R";
    const lines = [header];
    for (let i = 0; i < state.fitQ.length; i += 1) {
      const q = state.fitQ[i];
      const fit = state.fitR[i];
      const data = i < state.dataR.length ? state.dataR[i] : "";
      lines.push([q, data, fit].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "xrr_fit.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  async function handleFileSelect(file) {
    if (!file) return;
    try {
      const text = await file.text();
      state.loadedText = text;
      const info = parseDataText(text);
      autoGuessGlobalParams();
      calculateAndPlot();
      updateDataSummary(info.isRaw4 ? "RAW4 converted from angle" : "q-R table");
      if (info.isRaw4) {
        setStatus(
          "Loaded " + state.dataQ.length + " points (RAW4: " + info.angleMode + "->q with lambda=" + info.wavelength.toFixed(5) + " A, normalized by max count " + info.normalized.toFixed(0) + ").",
          false
        );
      } else {
        setStatus("Loaded " + state.dataQ.length + " points (normalized by max value " + info.normalized.toExponential(2) + ").", false);
      }
    } catch (err) {
      setStatus("Failed to read file: " + (err && err.message ? err.message : "unknown error"), true);
    }
  }

  function reparseLoadedData() {
    if (!state.loadedText) return;
    try {
      const info = parseDataText(state.loadedText);
      autoGuessGlobalParams();
      calculateAndPlot();
      updateDataSummary(info.isRaw4 ? "RAW4 converted from angle" : "q-R table");
      if (info.isRaw4) {
        setStatus("Reparsed RAW4 using " + info.angleMode + " mode.", false);
      } else {
        setStatus("Reparsed loaded data.", false);
      }
    } catch (err) {
      setStatus("Failed to reparse data: " + (err && err.message ? err.message : "unknown error"), true);
    }
  }

  function bindEvents() {
    els.addLayerBtn.addEventListener("click", addLayer);
    els.removeLayerBtn.addEventListener("click", removeLayer);
    els.simulateBtn.addEventListener("click", generateSyntheticData);
    els.autoGlobalBtn.addEventListener("click", autoGuessGlobalParams);
    els.calcBtn.addEventListener("click", calculateAndPlot);
    els.fitBtn.addEventListener("click", fitModel);
    els.fitStopBtn.addEventListener("click", stopFit);
    els.exportBtn.addEventListener("click", exportCsv);
    els.applyFitBtn.addEventListener("click", applyFitToInitialModel);
    els.fileInput.addEventListener("change", (e) => handleFileSelect(e.target.files && e.target.files[0]));
    els.raw4AngleMode.addEventListener("change", reparseLoadedData);
    els.qShift.addEventListener("input", calculateAndPlot);
    els.dqOverQ.addEventListener("input", calculateAndPlot);
    els.footprintQ.addEventListener("input", calculateAndPlot);
    els.enableResolution.addEventListener("change", calculateAndPlot);
    els.enableFootprint.addEventListener("change", calculateAndPlot);
    els.layerBody.addEventListener("input", (e) => handleLayerEdit(e.target));
    els.layerBody.addEventListener("change", (e) => handleLayerEdit(e.target));
    window.addEventListener("resize", drawPlot);
  }

  initLayers();
  bindEvents();
  els.fitStopBtn.disabled = true;
  updateDataSummary("");
  setFitProgress("idle");
  renderFitResult();
  calculateAndPlot();
})();
