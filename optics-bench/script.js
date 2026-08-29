(function () {
  "use strict";
  const O = window.Optics, S = window.OpticsState, P = window.OpticsPresets, V = window.OpticsView, C = window.OpticsCoherence, K = window.OpticsCamera, Q = window.OpticsShare;
  const $ = id => document.getElementById(id), bench = $("bench"), view = V.create(bench, () => requestRender());
  const lengths = new Set(["x", "y", "aperture", "focal", "radius", "beamWidth", "opening", "coreDiameter"]);
  const angles = new Set(["angle", "polAngle", "axisAngle"]);
  const names = {
    x: "X", y: "Y", angle: "配置角度", aperture: "部品径 / 有効径", focal: "焦点距離 f", radius: "曲率半径 R",
    beamWidth: "ビーム直径", wavelength: "中心波長", wavelengthWidth: "波長幅 Δλ（全幅）", spectralSamples: "波長サンプル数", power: "相対パワー", rayCount: "光線サンプル数",
    divergence: "発光角（全角）", polarization: "偏光状態", polAngle: "偏光角",
    axisAngle: "軸角度", designWavelength: "設計波長", phase: "追加位相 φ", opening: "開口直径",
    coreDiameter: "コア直径", na: "開口数 NA", transmission: "透過率 T", cutoff: "境界波長", mode: "透過側", label: "部品名",
    pixelCount: "計算画素数", exposure: "表示ゲイン", filterMode: "フィルター種別",
    bandLow: "透過帯域の下限", bandHigh: "透過帯域の上限", opticalDensity: "光学濃度 OD"
  };
  const num = (v, digits = 6) => Number(v.toFixed(digits));
  const power = v => v === 0 ? "0" : v < 1e-4 ? v.toExponential(2) : String(Number(v.toPrecision(4)));
  const distance = v => {
    const converted = display(v);
    return (Math.abs(converted) >= 1e7 ? converted.toExponential(4) : num(converted, 4)) + " " + scene.unit;
  };
  const node = (tag, className, text) => {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  let scene = P.create("starter"), selectedId = 3, activePresetId = "starter", edited = false;
  let selectedIds = [3], pointerTool = "select", spaceHeld = false;
  let result, pending = null, suppressedClick = null, frame = 0, inspectorKey = "", optionsKey = "";
  let history = [], historyIndex = -1;
  let probe = null, probeHits = [];
  let coherence = null, phaseId = null, phaseOptionsKey = "";
  let cameraId = null, cameraOptionsKey = "", cameraSvg = "";
  let designRevision = 0, shareJob = 0, hashJob = 0, hashLoading = false;
  const selected = () => scene.elements.find(e => e.id === selectedId);
  const selectedElements = () => scene.elements.filter(e => selectedIds.includes(e.id));
  function setSelection(ids, primary = ids.at(-1)) {
    selectedIds = [...new Set(ids)].filter(id => scene.elements.some(e => e.id === id));
    selectedId = selectedIds.includes(primary) ? primary : selectedIds.at(-1) ?? null;
  }
  function rememberSelection() {
    if (history[historyIndex]) Object.assign(history[historyIndex], { selectedId, selectedIds: [...selectedIds] });
  }
  const label = e => view.title(e);
  const display = v => num(S.toDisplay(v, scene.unit), 8);
  const announce = message => { $("status").textContent = message; };
  const isSource = e => e.type === "laser" || e.type === "point";
  const fieldByKey = key => $("parameter-fields").querySelector('[data-key="' + key + '"]:not([type="range"])');
  const fieldValue = (element, key) => key === "radius" ? 2 * element.focal : element[key];
  const allocateId = () => { const ids = new Set(scene.elements.map(e => e.id)); let id = 1; while (ids.has(id)) id++; return id; };
  const fiberPartnerId = id => {
    const link = (scene.fiberLinks || []).find(item => item.a === id || item.b === id);
    return link ? (link.a === id ? link.b : link.a) : null;
  };
  function isTextEditing(target) {
    if (!target?.closest) return false;
    const input = target.closest("input,select,textarea");
    if (input) return !input.matches('input[type="range"],input[type="checkbox"],input[type="radio"],input[type="button"],input[type="submit"],input[type="reset"]');
    return Boolean(target.isContentEditable);
  }

  function checkpoint() {
    const text = S.serialize(scene);
    if (history[historyIndex]?.text !== text) {
      history = history.slice(0, historyIndex + 1);
      history.push({ text, selectedId, selectedIds: [...selectedIds], activePresetId, edited });
      if (history.length > 60) history.shift();
      historyIndex = history.length - 1;
    }
    $("undo").disabled = historyIndex <= 0;
    $("redo").disabled = historyIndex >= history.length - 1;
  }
  function undo(delta) {
    if (pending) { finishInteraction(true); return; }
    checkpoint();
    const index = historyIndex + delta;
    if (index < 0 || index >= history.length) return;
    const entry = history[index];
    clearProbe();
    scene = S.parse(entry.text); setSelection(entry.selectedIds || [entry.selectedId], entry.selectedId); activePresetId = entry.activePresetId; edited = entry.edited;
    historyIndex = index;
    invalidateShare();
    syncControls(); syncInspector(true); render();
    $("undo").disabled = historyIndex <= 0; $("redo").disabled = historyIndex >= history.length - 1;
    announce(delta < 0 ? "ひとつ前の設計に戻しました。" : "設計の変更をやり直しました。");
  }
  function markEdited() {
    edited = true;
    invalidateShare();
    // A live field edit must be undoable before the field loses focus.
    $("undo").disabled = false;
    $("redo").disabled = true;
  }
  function requestRender() { if (!frame) frame = requestAnimationFrame(() => { frame = 0; render(); }); }
  function updateOptions() {
    const key = JSON.stringify(scene.elements.map(e => [e.id, label(e), e.enabled]));
    if (key !== optionsKey) {
      optionsKey = key;
      $("element-select").replaceChildren(...scene.elements.map(e => {
        const option = node("option", "", label(e) + (e.enabled ? "" : "（無効）"));
        option.value = String(e.id); return option;
      }));
    }
    $("element-select").value = selected() ? String(selectedId) : "";
    $("element-select").disabled = !scene.elements.length;
  }
  function syncControls() {
    $("scene-title").value = scene.title;
    $("scene-title").removeAttribute("aria-invalid");
    $("unit").value = scene.unit; $("snap").checked = scene.snap; $("angle-snap").checked = scene.angleSnap;
    $("grid-step").value = String(display(scene.gridStep));
    $("grid-step").min = String(S.toDisplay(1, scene.unit));
    $("grid-step").max = String(S.toDisplay(254, scene.unit));
    $("grid-step").removeAttribute("aria-invalid");
    document.querySelectorAll(".display-unit").forEach(n => { n.textContent = scene.unit; });
    if (activePresetId) $("preset").value = activePresetId;
  }
  function bounds(key, e) {
    if (key === "x" || key === "y") return { min: -O.COORDINATE_LIMIT, max: O.COORDINATE_LIMIT };
    if (key === "radius") return { min: 2, max: 2 * O.PARAM_LIMITS.focal.max };
    const limits = { ...O.PARAM_LIMITS[key] };
    if (isSource(e) && key === "wavelength") { limits.min += e.wavelengthWidth / 2; limits.max -= e.wavelengthWidth / 2; }
    if (isSource(e) && key === "wavelengthWidth") limits.max = 2 * Math.min(e.wavelength - O.PARAM_LIMITS.wavelength.min, O.PARAM_LIMITS.wavelength.max - e.wavelength);
    if (key === "focal" && e.type === "concave") limits.min = 1;
    if (key === "opening" || key === "coreDiameter") limits.max = Math.min(limits.max, e.aperture);
    return limits;
  }
  function configureInput(input, e) {
    const key = input.dataset.key;
    if (["label", "enabled", "autoExposure", "polarization", "mode", "filterMode"].includes(key)) return;
    const limits = bounds(key, e), length = lengths.has(key);
    input.min = String(length ? S.toDisplay(limits.min, scene.unit) : limits.min);
    input.max = String(length ? S.toDisplay(limits.max, scene.unit) : limits.max);
    input.step = input.type === "range" && angles.has(key) ? String(scene.angleSnap ? 22.5 : 0.1) : ["rayCount", "spectralSamples", "pixelCount"].includes(key) || (key === "phase" && input.type === "range") ? "1" : key === "opticalDensity" && input.type === "range" ? "0.01" : "any";
    input.disabled = (key === "polAngle" && e.polarization !== "linear") || (key === "spectralSamples" && e.wavelengthWidth === 0) || Boolean(input.closest("[data-filter-modes]")?.hidden);
  }
  function makeField(key, options = {}) {
    const e = selected(), title = options.title || names[key];
    const wrap = node("label", "field", title), unit = lengths.has(key) ? scene.unit :
      angles.has(key) || key === "divergence" || key === "phase" ? "°" : ["wavelength", "wavelengthWidth", "designWavelength", "cutoff", "bandLow", "bandHigh"].includes(key) ? "nm" : "";
    if (unit) wrap.append(node("span", "unit-label", unit));
    const input = node(options.choices ? "select" : "input");
    input.id = "param-" + key; input.dataset.key = key; input.setAttribute("aria-label", title);
    if (options.choices) {
      options.choices.forEach(([value, text]) => { const option = node("option", "", text); option.value = value; input.append(option); });
    } else {
      input.type = options.text ? "text" : "number";
      if (options.text) input.maxLength = 100;
      else { input.required = true; input.inputMode = "decimal"; configureInput(input, e); }
    }
    if (angles.has(key) || options.range) {
      const row = node("div", "angle-control"), slider = node("input");
      slider.type = "range"; slider.id = "param-" + key + "-slider"; slider.dataset.key = key;
      slider.setAttribute("aria-label", title + "スライダー"); configureInput(slider, e);
      row.append(slider, input); wrap.append(row);
      if (angles.has(key)) {
        const ticks = node("div", "angle-ticks"); ["0°", "90°", "180°", "270°", "360°"].forEach(t => ticks.append(node("span", "", t))); wrap.append(ticks);
      }
    } else if (key === "wavelength") {
      const row = node("div", "wave-field"), swatch = node("span", "wave-swatch");
      swatch.id = "selected-wavelength-color"; swatch.setAttribute("aria-hidden", "true");
      row.append(input, swatch); wrap.append(row);
    } else wrap.append(input);
    if (options.hint) {
      const hint = node("div", "field-hint", options.hint);
      hint.id = "hint-" + key; wrap.append(hint); input.setAttribute("aria-describedby", hint.id);
    }
    return wrap;
  }
  function buildInspector(e) {
    const fields = $("parameter-fields"); fields.replaceChildren();
    if (!e) return;
    fields.append(makeField("label", { text: true }));
    const enabled = node("label", "element-enabled"), check = node("input");
    check.type = "checkbox"; check.dataset.key = "enabled"; check.id = "param-enabled";
    check.setAttribute("aria-label", "この部品を有効にする"); enabled.append(check, document.createTextNode("この部品を有効にする"));
    fields.append(enabled);
    const position = node("div", "position-fields"); position.append(makeField("x"), makeField("y")); fields.append(position);
    const angleHint = isSource(e) ? "発光方向。0°＝右、90°＝下。" :
      e.type === "fiber" ? "入射する光の進行方向。0°＝右向き入射。接続時の出射は反対向き（＋180°）。" :
      e.type === "concave" ? "頂点の法線。0°は凹面が左向き、180°は右向き。裏面は吸収。" :
      e.type === "camera" ? "受光する光の進行方向。0°は右向き入射を受光。裏面は吸収。" :
      ["mirror", "dichroic", "splitter", "pbs"].includes(e.type) ? "面の法線。45°で右向きの光を上へ反射。" : "光軸 / 面の法線。0°＝水平な光路。";
    fields.append(makeField("angle", { hint: angleHint + " 数値入力は任意角度。" }));
    fields.append(node("h3", "field-group-title", "光学パラメーター"));
    if (isSource(e)) {
      fields.append(makeField("wavelength", { hint: "帯域の中央。全帯域が200〜2500 nmに収まる範囲で設定できます。" }));
      const wavelengths = node("div", "wavelength-buttons");
      for (const nm of [405, 450, 488, 532, 561, 633, 650, 785, 1064]) {
        const b = node("button", "", String(nm)); b.type = "button"; b.dataset.wavelength = String(nm);
        b.title = nm + " nm"; wavelengths.append(b);
      }
      fields.append(wavelengths,
        makeField("wavelengthWidth", { hint: "中心波長±Δλ/2。0は単色。帯域内のパワー密度が均一な近似で、半値幅（FWHM）ではありません。" }),
        makeField("spectralSamples", { hint: "3〜61の整数。各等幅区間の中央波長を追跡します。狭いフィルターは分割数を増やして確認してください。" }));
      const spectrum = node("p", "param-note"); spectrum.id = "source-spectrum-summary"; fields.append(spectrum);
      fields.append(makeField("power", { hint: "全帯域・全光線を合わせた相対パワー。波長幅やサンプル数を変えても総パワーは一定。" }));
      if (e.type === "laser") fields.append(makeField("beamWidth", { hint: "平行光線の幅。Gaussianビームの1/e²径ではありません。" }));
      else fields.append(makeField("divergence", { hint: "2Dの角度サンプル。360°で全周発光。" }));
      fields.append(makeField("rayCount", { hint: "空間方向の本数。各波長で同じビーム幅・発光角をサンプルします。" }), makeField("polarization", { choices: [
        ["linear", "直線偏光"], ["right", "円偏光（V / I = +1）"], ["left", "円偏光（V / I = −1）"], ["unpolarized", "無偏光"]
      ] }), makeField("polAngle", { hint: "偏光の0°はベンチ面に垂直な方向。配置角度とは別です。" }));
    } else {
      const isBS = ["splitter", "pbs"].includes(e.type);
      fields.append(makeField("aperture", { title: e.type === "camera" ? "センサー幅" : isBS ? "分離面の長さ" : names.aperture,
        hint: isBS ? "プリズム中央の対角線の長さ。標準100 mm。外形は表示用で、光は厚さ0の分離面だけで反射・透過します。屈折・光路長の追加はありません。" : "この幅の外側を通る光線は部品に当たりません。" }));
      if (e.type === "camera") {
        fields.append(makeField("pixelCount", { hint: "16〜1024画素。1列分の受光位置を集計。光源のサンプル数とは別です。" }));
        const auto = node("label", "element-enabled"), check = node("input");
        check.id = "param-autoExposure"; check.type = "checkbox"; check.dataset.key = "autoExposure";
        check.setAttribute("aria-label", "カメラ像の明るさを自動調整");
        auto.append(check, document.createTextNode("像の明るさを自動調整"));
        fields.append(auto, makeField("exposure", { hint: "表示だけの倍率。自動OFFでは1画素P=1が基準。露光時間・感度・受光パワー自体は変えません。" }));
        fields.append(node("p", "param-note", "レンズを内蔵しないセンサー面です。外付けレンズで結像させ、下のカメラビューで像を確認できます。縦方向・回折・干渉・ノイズは未計算。"));
      }
      if (e.type === "lens" || e.type === "objective") fields.append(makeField("focal", { hint: "正＝集光、負＝発散。|f| ≥ " + display(1) + " " + scene.unit + "。近軸薄レンズモデル。" }));
      if (e.type === "concave") fields.append(
        makeField("focal", { hint: "正の近軸焦点距離。R = 2fで連動します。座標は鏡の頂点。Fは近軸焦点、Cは曲率中心。" }),
        makeField("radius", { hint: "半径の大きさ。変更するとf = R/2。有効径 < 2R。球面上で反射するため、太いビームは球面収差で一点に集まりません。" })
      );
      if (e.type === "iris") fields.append(makeField("opening", { range: true, hint: "0で閉鎖。開口内だけ光が通ります。" }));
      if (e.type === "filter") {
        fields.append(makeField("filterMode", { choices: [
          ["longpass", "ロングパス（LP）"], ["shortpass", "ショートパス（SP）"],
          ["bandpass", "バンドパス（BP）"], ["nd", "ND（全波長を減光）"]
        ] }));
        const filterField = (key, modes, options = {}) => {
          const field = makeField(key, options); field.dataset.filterModes = modes;
          fields.append(field);
        };
        filterField("cutoff", "longpass shortpass", { hint: "LPはこの波長以上、SPはこの波長以下を透過。境界波長も含みます。" });
        filterField("bandLow", "bandpass", { hint: "200〜2500 nm。下限 < 上限。両端の波長も透過します。" });
        filterField("bandHigh", "bandpass");
        filterField("transmission", "longpass shortpass bandpass", { range: true, title: "帯域内の透過率 T", hint: "0〜1のパワー比。透過帯域外は0。NDではこの値を使いません。" });
        filterField("opticalDensity", "nd", { range: true, hint: "T = 10⁻ᴼᴰ。OD 0＝100%、1＝10%、2＝1%。0〜6。" });
        const summary = node("p", "param-note"); summary.id = "filter-summary"; fields.append(summary);
        fields.append(node("p", "param-note", "透過しない光は吸収として集計する理想フィルター。反射光・膜厚・入射角による波長シフト・追加位相は未計算。透過光の偏光状態は保ちます。"));
      }
      if (["polarizer", "waveplate", "halfwave"].includes(e.type)) {
        fields.append(makeField("axisAngle", { title: e.type === "polarizer" ? "透過軸の角度" : "速軸の角度", hint: "偏光空間での軸。配置角度とは独立です。" }));
        if (e.type !== "polarizer") fields.append(makeField("designWavelength", { hint: "設計波長で位相差" + (e.type === "halfwave" ? "π" : "π/2") + "。その他は波長に反比例する理想モデル。" }));
      }
      if (e.type === "phase") fields.append(makeField("phase", { range: true, hint: "1回通るごとの共通位相。下の干渉解析で使用します。幾何光線・Stokes偏光は変えません。" }));
      if (e.type === "dichroic") fields.append(makeField("cutoff"), makeField("mode", { choices: [
        ["longpass", "長波長を透過（LP）"], ["shortpass", "短波長を透過（SP）"]
      ], hint: "反対側の波長は反射。境界で完全に切り替わる理想特性。" }));
      if (e.type === "objective" || e.type === "fiber") {
        if (e.type === "fiber") fields.append(makeField("coreDiameter"));
        fields.append(makeField("na", { hint: e.type === "fiber" ? "コア位置と空気中の入射角で判定。モード結合効率は未計算。" : "空気中の受入角制限。高NAの厳密な結像は未計算。" }));
      }
      if (e.type === "fiber") {
        fields.append(node("h3", "field-group-title", "ファイバー接続"));
        const wrap = node("label", "field", "接続先のファイバー"), input = node("select");
        input.id = "fiber-partner"; input.setAttribute("aria-label", "接続先のファイバー");
        input.setAttribute("aria-describedby", "fiber-link-info"); wrap.append(input); fields.append(wrap);
        const actions = node("div", "fiber-actions"), jump = node("button", "", "相手を選択"), disconnect = node("button", "", "切断");
        jump.type = disconnect.type = "button"; jump.id = "fiber-select-partner"; disconnect.id = "fiber-disconnect";
        actions.append(jump, disconnect); fields.append(actions);
        const info = node("p", "field-hint"); info.id = "fiber-link-info"; fields.append(info);
        fields.append(node("p", "param-note", "2つの端面を1対1で接続。双方向の理想伝送で、ケーブルの形や長さは光学計算に影響しません。"));
      }
      if (e.type === "splitter") fields.append(makeField("transmission", { range: true, hint: "偏光によらず透過率T、反射率1−Tで分岐。偏光状態を保つ理想NPBSです。位相差・干渉は未計算。" }));
      if (e.type === "pbs") {
        const note = node("div", "splitter-note"); note.id = "splitter-model";
        note.append(node("strong", "", "p透過 / s反射"),
          node("p", "", "p偏光（90°）は直進、s偏光（0°）は反射。偏光の0°はベンチ面に垂直な方向です。"),
          node("p", "", "無偏光・円偏光は各50%。線偏光は偏光角で分配します。理想素子のため損失・漏れ・位相差は含みません。"));
        fields.append(note);
      }
      if (e.type === "screen") fields.append(node("p", "param-note", "入射光を吸収して相対パワー・受光幅・偏光を読み出します。"));
      if (e.type === "blocker") fields.append(node("p", "param-note", "部品径の範囲に当たった光線を止めます。"));
    }
  }
  function syncInspector(force = false) {
    const e = selected(), key = e ? e.id + ":" + e.type + ":" + scene.unit : "empty";
    if (force || key !== inspectorKey) { inspectorKey = key; buildInspector(e); $("input-error").textContent = ""; }
    $("properties").hidden = !e; $("empty-selection").hidden = Boolean(e);
    $("selected-kind").textContent = e ? O.TYPES[e.type].short : "";
    $("selection-summary").textContent = selectedIds.length > 1 ? selectedIds.length + "個選択中 · 主選択：" + label(e) + "。数値編集・回転は主選択だけに作用します。" : e ? "1個選択中 · Shift＋クリックで追加・解除" : "空白をドラッグして範囲選択できます。";
    $("clear-selection").disabled = !selectedIds.length;
    $("select-all").disabled = !scene.elements.length;
    $("duplicate").textContent = selectedIds.length > 1 ? "複製（" + selectedIds.length + "）" : "複製";
    $("delete").textContent = selectedIds.length > 1 ? "削除（" + selectedIds.length + "）" : "削除";
    updateOptions();
    if (!e) return;
    if (e.type === "fiber") syncFiberConnection(e);
    if (isSource(e)) {
      const count = e.wavelengthWidth > 0 ? e.spectralSamples : 1;
      $("source-spectrum-summary").textContent = (e.wavelengthWidth > 0 ? "帯域：" : "単色：") + V.spectrumLabel(e) +
        " ／ 空間 " + e.rayCount + " × 波長 " + count + " = " + e.rayCount * count + " 本" +
        (e.wavelengthWidth > 0 ? "。分割幅 " + V.formatWavelength(e.wavelengthWidth / count) + " nm。波長間は非干渉。" : "。");
    }
    if (e.type === "filter") {
      for (const field of $("parameter-fields").querySelectorAll("[data-filter-modes]")) {
        field.hidden = !field.dataset.filterModes.split(" ").includes(e.filterMode);
        if (field.hidden) for (const input of field.querySelectorAll("[data-key]")) clearInputError(input);
      }
      const percent = power(100 * (e.filterMode === "nd" ? O.filterTransmission(e, 532) : e.transmission));
      $("filter-summary").textContent = e.filterMode === "nd" ? "全波長の透過率：" + percent + "%" :
        "透過帯域：" + (e.filterMode === "bandpass" ? e.bandLow + "〜" + e.bandHigh + " nm" : e.cutoff + " nm" + (e.filterMode === "longpass" ? "以上" : "以下")) + " ／ 透過率 " + percent + "%";
    }
    for (const input of $("parameter-fields").querySelectorAll("[data-key]")) {
      const k = input.dataset.key; configureInput(input, e);
      if (document.activeElement === input || input.hasAttribute("aria-invalid")) continue;
      if (input.type === "checkbox") input.checked = e[k];
      else {
        const value = fieldValue(e, k);
        input.value = String(lengths.has(k) ? display(value) : typeof value === "number" ? num(value) : value);
      }
    }
    if ($("selected-wavelength-color")) $("selected-wavelength-color").style.background = V.spectrumSwatch(e);
  }
  function syncFiberConnection(e) {
    const input = $("fiber-partner"); if (!input) return;
    const partnerId = fiberPartnerId(e.id), partner = scene.elements.find(item => item.id === partnerId);
    const candidates = scene.elements.filter(item => item.type === "fiber" && item.id !== e.id);
    const key = JSON.stringify(candidates.map(item => [item.id, label(item), item.enabled, fiberPartnerId(item.id)]));
    if (input.dataset.optionsKey !== key) {
      input.dataset.optionsKey = key;
      const empty = node("option", "", "未接続（受光のみ）"); empty.value = "0";
      input.replaceChildren(empty, ...candidates.map(item => {
        const occupied = fiberPartnerId(item.id), unavailable = occupied !== null && occupied !== e.id;
        const option = node("option", "", label(item) + " [#" + item.id + "]" + (unavailable ? "（接続済み）" : item.enabled ? "" : "（無効）"));
        option.value = String(item.id); option.disabled = unavailable; return option;
      }));
    }
    input.value = String(partnerId ?? 0);
    $("fiber-select-partner").disabled = $("fiber-disconnect").disabled = !partner;
    $("fiber-link-info").textContent = partner ?
      label(partner) + "と接続中。" + (!e.enabled || !partner.enabled ? "端面が無効のため伝送を停止しています。" :
        "この端面からは " + num(O.normalizeAngle(e.angle + 180)) + "° の方向へ出射します。") :
      candidates.length ? "接続先を選ぶとケーブルでつながります。接続済みの相手は先に切断してください。" : "ファイバーをもう1つ配置すると接続できます。";
  }
  function connectFiber(partnerId) {
    finishInteraction(true);
    const e = selected(); if (!e || e.type !== "fiber") return;
    try {
      const partner = scene.elements.find(item => item.id === partnerId);
      if (partnerId !== 0 && (!partner || partner.id === e.id || partner.type !== "fiber")) throw new Error("別のファイバーを選んでください。");
      if (partner && fiberPartnerId(partner.id) !== null && fiberPartnerId(partner.id) !== e.id) throw new Error("接続先はすでに使用中です。先に切断してください。");
      if ((fiberPartnerId(e.id) ?? 0) === partnerId) return;
      const fiberLinks = (scene.fiberLinks || []).filter(link => link.a !== e.id && link.b !== e.id);
      if (partner) fiberLinks.push({ a: e.id, b: partner.id });
      const next = S.validateScene({ ...scene, fiberLinks });
      checkpoint(); scene = next; markEdited(); checkpoint(); syncInspector(); render();
      announce(partner ? label(e) + "と" + label(partner) + "を接続しました。相手の端面から出射します。" : "ファイバーの接続を切断しました。「戻す」で復元できます。");
    } catch (error) { syncFiberConnection(e); announce("接続できませんでした。 " + error.message); }
  }
  function setInputError(input, message) {
    input.setAttribute("aria-invalid", "true");
    $("input-error").textContent = message + " 直前の有効値を使用しています。";
  }
  function clearInputError(input) {
    input.removeAttribute("aria-invalid");
    if (!$("parameter-fields").querySelector('[aria-invalid="true"]')) $("input-error").textContent = "";
  }
  function readField(input, e) {
    const key = input.dataset.key;
    if (input.type === "checkbox") return input.checked;
    if (["label", "polarization", "mode", "filterMode"].includes(key)) return input.value;
    let value = Number(input.value);
    if (input.value.trim() === "" || !Number.isFinite(value)) throw new Error((names[key] || key) + "を数値で入力してください。");
    if (lengths.has(key)) value = S.fromDisplay(value, scene.unit);
    const limits = bounds(key, e);
    if (value < limits.min - 1e-7 || value > limits.max + 1e-7 || ["rayCount", "spectralSamples", "pixelCount"].includes(key) && !Number.isInteger(value)) {
      throw new Error((names[key] || key) + "は " + input.min + "〜" + input.max + (["rayCount", "spectralSamples", "pixelCount"].includes(key) ? " の整数" : " の数値") + "を入力してください。");
    }
    value = Math.max(limits.min, Math.min(limits.max, value));
    if (key === "focal" && Math.abs(value) < 1) throw new Error("焦点距離の絶対値は " + display(1) + " " + scene.unit + " 以上にしてください。");
    if (angles.has(key)) value = input.type === "range" ? V.snapAngle(value, scene.angleSnap) : O.normalizeAngle(value);
    return value;
  }
  function applyField(input) {
    const e = selected();
    if (!e || !input.dataset.key) return false;
    const key = input.dataset.key;
    try {
      const value = readField(input, e);
      // R is a derived editor field: persist one authoritative focal length.
      const candidate = { ...e, [key === "radius" ? "focal" : key]: key === "radius" ? value / 2 : value };
      if (key === "aperture" && e.type === "iris" && candidate.aperture < e.opening) throw new Error("部品径は開口直径以上にしてください。");
      if (key === "aperture" && e.type === "fiber" && candidate.aperture < e.coreDiameter) throw new Error("部品径はコア直径以上にしてください。");
      scene = S.validateScene({ ...scene, elements: scene.elements.map(item => item.id === e.id ? candidate : item) });
      clearInputError(input); markEdited(); syncInspector(); requestRender(); return true;
    } catch (error) { setInputError(input, error.message); return false; }
  }
  function select(id, focus = false, extend = false) {
    checkpoint();
    setSelection(extend ? selectedIds.includes(id) ? selectedIds.filter(i => i !== id) : [...selectedIds,id] : [id], id);
    rememberSelection();
    syncInspector(); render(); if (focus && selectedId !== null) view.focus(selectedId);
  }
  function selectAll() {
    if (pending) return;
    checkpoint(); setSelection(scene.elements.map(e=>e.id),selectedId); rememberSelection();
    syncInspector(); render(); bench.focus({preventScroll:true});
  }
  function stokesText(s) {
    if (!s || s.I <= 1e-12) return "受光がないため偏光は未定義";
    return "Q/I " + num(s.Q / s.I, 3) + " · U/I " + num(s.U / s.I, 3) + " · V/I " + num(s.V / s.I, 3);
  }
  function renderReadouts() {
    const preset = P.list.find(p => p.id === activePresetId);
    $("setup-title").textContent = (scene.title || "自由配置") + (edited ? "（編集済み）" : "");
    $("setup-description").textContent = preset?.description || "部品を自由に配置して設計します。設定はJSONで保存・再開できます。";
    $("setup-notes").textContent = preset ? (edited ? "元のプリセット「" + preset.title + "」の説明： " : "") + preset.notes : "数値は幾何光学の目安です。実機設計では素子の仕様・収差・回折などを別途確認してください。";
    const sourceRows = scene.elements.filter(isSource).map(e => {
      const row = node("div", "source-row"), swatch = node("span", "wave-swatch");
      swatch.style.background = V.spectrumSwatch(e); swatch.setAttribute("aria-hidden", "true");
      const button = node("button", "", label(e)); button.type = "button"; button.dataset.select = String(e.id);
      row.append(swatch, button, node("span", "source-details", V.spectrumLabel(e) + " · " + (e.enabled ? "P " + power(e.power) : "OFF")));
      return row;
    });
    $("source-readout").replaceChildren(...(sourceRows.length ? sourceRows : [node("p", "subtle", "光源を配置してください。")]));
    const detectors = scene.elements.filter(e => ["fiber", "screen", "camera"].includes(e.type)), emitted = new Map(), forwarded = new Map();
    for (const transfer of result.fiberTransfers || []) {
      emitted.set(transfer.toId, (emitted.get(transfer.toId) || 0) + transfer.power);
      forwarded.set(transfer.fromId, (forwarded.get(transfer.fromId) || 0) + transfer.power);
    }
    const table = node("table", "detector-table"), head = node("thead"), tr = node("tr");
    ["部品", coherence ? "幾何P" : "受光P", "出射P", "受光線", "幅 " + scene.unit].forEach(t => tr.append(node("th", "", t))); head.append(tr); table.append(head);
    const body = node("tbody");
    for (const e of detectors) {
      const d = result.detectors.find(item => item.id === e.id), row = node("tr"), cell = node("td");
      const b = node("button", "", label(e)); b.type = "button"; b.dataset.select = String(e.id); cell.append(b);
      row.append(cell, node("td", "", e.enabled ? power(d?.power || 0) : "OFF"),
        node("td", "", e.type === "fiber" ? (e.enabled ? power(emitted.get(e.id) || 0) : "OFF") : "—"),
        node("td", "", String(d?.acceptedHits || 0)), node("td", "", d?.acceptedHits ? String(num(S.toDisplay(d.span, scene.unit), 4)) : "—"));
      body.append(row);
    }
    table.append(body);
    $("detector-readout").replaceChildren(detectors.length ? table : node("p", "subtle", "スクリーン・カメラ・ファイバーを光路に置くと受光を確認できます。"));
    const e = selected(), output = $("selected-output"); output.replaceChildren();
    if (!e) return;
    if (isSource(e)) {
      output.append(node("strong", "", "光源の設定偏光"), node("p", "stokes", stokesText(O.sourceStokes(e))));
    } else {
      const d = result.detectors.find(item => item.id === e.id);
      if (["fiber", "screen", "camera"].includes(e.type)) {
        output.append(node("strong", "", e.enabled ? (e.type === "fiber" ? "受光・伝送" : "検出結果") : "無効の部品"),
          node("p", "", (coherence ? "幾何 P = " : "受光 P = ") + power(d?.power || 0) + " / 入射 P = " + power(d?.incidentPower || 0)),
          node("p", "", "受光線 " + (d?.acceptedHits || 0) + " 本 / 入射線 " + (d?.hits || 0) + " 本"),
          node("p", "stokes", (e.type === "fiber" ? "受光偏光：" : "") + stokesText(d?.stokes)));
        if (e.type === "fiber") {
          output.append(node("p", "", "この端面から出射 P = " + power(emitted.get(e.id) || 0)),
            node("p", "", "相手へ転送 P = " + power(forwarded.get(e.id) || 0)));
          const outgoing = (result.fiberTransfers || []).filter(transfer => transfer.toId === e.id);
          if (outgoing.length) {
            const stokes = { I: 0, Q: 0, U: 0, V: 0 }, wavelengths = new Map();
            for (const transfer of outgoing) {
              for (const key of Object.keys(stokes)) stokes[key] += transfer.stokes[key];
              wavelengths.set(transfer.wavelength, (wavelengths.get(transfer.wavelength) || 0) + transfer.power);
            }
            output.append(node("p", "stokes", "出射偏光（理想伝送）：" + stokesText(stokes)));
            for (const [wavelength, p] of wavelengths) output.append(node("p", "", "出射 " + V.formatWavelength(wavelength) + " nm : P " + power(p)));
          }
        }
        if (d?.acceptedHits) {
          output.append(node("p", "", "重心 X " + display(d.centroid.x) + " / Y " + display(d.centroid.y) + " " + scene.unit));
          for (const [wavelength, p] of Object.entries(d.powerByWavelength || {})) output.append(node("p", "", V.formatWavelength(Number(wavelength)) + " nm : P " + power(p)));
        }
      } else if (e.type === "pbs") output.append(node("p", "", "分岐前後の光路をクリックして偏光を確認できます。透過pはQ/I = −1、反射sはQ/I = +1（光がある場合）。"));
      else if (["polarizer", "waveplate", "halfwave"].includes(e.type)) output.append(node("p", "", "素子の前後の光路をクリックして、偏光楕円・Q/I・U/I・V/Iを確認できます。"));
    }
  }
  function render() {
    result = O.simulate(scene.elements, { fiberLinks: scene.fiberLinks || [], viewBounds: view.visibleBounds(), recordPaths: scene.elements.some(e => e.type === "phase") });
    coherence = C.analyze(scene.elements, result, phaseId);
    view.draw(scene, selectedId, result, $("show-labels").checked, selectedIds);
    if (pending && (pending.kind === "move" || pending.kind === "rotate")) {
      for (const id of pending.kind === "move" ? selectedIds : [pending.id]) bench.querySelector('[data-element-id="' + id + '"]')?.classList.add("is-dragging");
    }
    updateOptions(); renderReadouts(); renderProbe(); renderCoherence(); renderCamera();
    $("element-count").textContent = String(scene.elements.length);
    $("ray-stats").textContent = result.rayCount + " rays · " + result.segments.length + " segments";
    for (const button of document.querySelectorAll("[data-add]")) button.disabled = scene.elements.length >= O.MAX_ELEMENTS;
    $("trace-warning").hidden = !result.warnings.length;
    $("trace-warning").textContent = result.warnings.join(" ");
  }
  function renderCoherence() {
    $("coherence-panel").hidden = !coherence;
    if (!coherence) return;
    phaseId = coherence.phaseId;
    const phase = scene.elements.find(e => e.id === phaseId), phases = scene.elements.filter(e => e.type === "phase");
    const options = JSON.stringify(phases.map(e => [e.id, label(e), e.enabled]));
    if (options !== phaseOptionsKey) {
      $("coherence-phase-select").replaceChildren(...phases.map(e => {
        const option = node("option", "", label(e) + (e.enabled ? "" : "（無効）")); option.value = String(e.id); return option;
      }));
      phaseOptionsKey = options;
    }
    $("coherence-phase-select").value = String(phaseId);
    const optics = scene.elements.filter(e => ["polarizer", "waveplate", "halfwave"].includes(e.type));
    $("coherence-optics-title").hidden = !optics.length;
    const controls = $("coherence-optics");
    for (const button of controls.querySelectorAll("[data-optic-id]")) {
      if (!optics.some(e => String(e.id) === button.dataset.opticId)) button.remove();
    }
    for (const e of optics) {
      let button = controls.querySelector('[data-optic-id="' + e.id + '"]');
      if (!button) { button = node("button"); button.type = "button"; button.dataset.opticId = String(e.id); controls.append(button); }
      button.textContent = (e.enabled ? "● " : "○ ") + label(e) + " · " + e.axisAngle + "° · " + (e.enabled ? "ON" : "OFF");
      button.setAttribute("aria-label", label(e) + "を入れる／外す"); button.setAttribute("aria-pressed", String(e.enabled));
    }
    $("coherence-phase-slider").value = String(phase.phase);
    if (document.activeElement !== $("coherence-phase-value")) {
      $("coherence-phase-value").value = String(phase.phase);
      $("coherence-phase-value").removeAttribute("aria-invalid");
      $("coherence-input-error").textContent = "";
    }
    $("coherence-status").textContent = coherence.message;
    $("coherence-results").hidden = !coherence.valid;
    if (!coherence.valid) { $("coherence-curves").replaceChildren(); $("coherence-readout").replaceChildren(); return; }
    const colors = ["#236e68", "#ab5c32", "#7956a3", "#246eab", "#92731c", "#a84673"];
    const svg = (tag, attributes = {}, text) => {
      const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
      for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
      if (text !== undefined) element.textContent = String(text);
      return element;
    };
    const top = 18, bottom = 212, left = 52, width = 566;
    const ceiling = Math.max(coherence.sourcePower, ...coherence.detectors.map(d => d.max), 1e-6);
    const px = degrees => left + width * degrees/360, py = p => bottom - (bottom-top)*p/ceiling;
    const chart = [], table = node("table", "detector-table"), head = node("thead"), heading = node("tr"), body = node("tbody");
    ["検出器", "干渉P", "走査V", "検出光路"].forEach(t => heading.append(node("th", "", t))); head.append(heading); table.append(head);
    for (let i = 0; i <= 4; i++) {
      const x = px(i*90), y = py(ceiling*i/4);
      chart.push(svg("path", { d: `M ${left} ${y} H ${left+width} M ${x} ${top} V ${bottom}`, stroke: "#e3e9df", fill: "none" }),
        svg("text", { x, y: 235, "text-anchor": "middle", fill: "#687c7c", "font-size": 11 }, i*90 + "°"),
        svg("text", { x: left-8, y: y+4, "text-anchor": "end", fill: "#687c7c", "font-size": 10 }, power(ceiling*i/4)));
    }
    chart.push(svg("text", { x: 12, y: 16, fill: "#486c5b", "font-size": 10 }, "P"));
    coherence.detectors.forEach((detector, i) => {
      const e = scene.elements.find(e => e.id === detector.id), color = colors[i % colors.length];
      chart.push(svg("path", { d: detector.samples.map((sample, j) => `${j ? "L" : "M"} ${px(sample.phase).toFixed(2)} ${py(sample.power).toFixed(2)}`).join(" "),
        fill: "none", stroke: color, "stroke-width": 2, "stroke-dasharray": i % 2 ? "7 3" : "none", "data-detector-id": detector.id }));
      chart.push(svg("circle", { cx: px(phase.phase), cy: py(detector.power), r: 4, fill: color, stroke: "#fff", "stroke-width": 1.5 }));
      const row = node("tr"), cell = node("td"), swatch = node("span", "coherence-swatch"), button = node("button", "", label(e));
      row.dataset.detectorId = String(e.id); swatch.style.background = color; button.type = "button"; button.dataset.select = String(e.id); cell.append(swatch, button);
      row.append(cell, node("td", "", power(detector.power)), node("td", "", detector.visibility === null ? "—" : num(detector.visibility, 3)), node("td", "", String(detector.pathCount)));
      body.append(row);
    });
    chart.push(svg("path", { d: `M ${px(phase.phase)} ${top} V ${bottom}`, fill: "none", stroke: "#80917d", "stroke-dasharray": "3 5", "stroke-width": 1 }));
    table.append(body);
    $("coherence-curves").replaceChildren(...chart);
    $("coherence-readout").replaceChildren(coherence.detectors.length ? table : node("p", "subtle", "スクリーンを置いて出力を検出してください。"));
    $("coherence-plot").setAttribute("aria-label", `追加位相 ${phase.phase}°。` + coherence.detectors.map(d => `${label(scene.elements.find(e => e.id === d.id))}：干渉P ${power(d.power)}、走査V ${d.visibility === null ? "未定義" : num(d.visibility, 3)}`).join("。"));
  }
  function renderCamera() {
    const cameras = scene.elements.filter(e => e.type === "camera");
    $("camera-panel").hidden = !cameras.length;
    if (!cameras.length) { cameraId = null; cameraOptionsKey = ""; cameraSvg = ""; $("camera-image").removeAttribute("src"); return; }
    if (selected()?.type === "camera") cameraId = selectedId;
    const camera = cameras.find(e => e.id === cameraId) || cameras[0]; cameraId = camera.id;
    const key = JSON.stringify(cameras.map(e => [e.id, label(e), e.enabled]));
    if (key !== cameraOptionsKey) {
      cameraOptionsKey = key;
      $("camera-select").replaceChildren(...cameras.map(e => { const o = node("option", "", label(e) + (e.enabled ? "" : "（OFF）")); o.value = String(e.id); return o; }));
    }
    $("camera-select").value = String(cameraId);
    const frame = K.capture(camera, result.detectors.find(d => d.id === cameraId));
    cameraSvg = K.svg(frame, label(camera), scene.unit);
    $("camera-image").src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(cameraSvg);
    $("camera-image").alt = label(camera) + "の1列分の像。非干渉の受光P " + power(frame.totalPower) + "、" + frame.hits + "本。";
    $("camera-stats").textContent = `受光P ${power(frame.totalPower)} · ${frame.hits}本 · ${camera.pixelCount}画素 · 1画素 ${display(frame.pitch)} ${scene.unit} · 最大P/画素 ${power(frame.peakPower)}`;
    $("camera-status").textContent = (!camera.enabled ? "カメラはOFFです。" : !frame.hits ? "光が届いていません。位置・向き・センサー幅と、手前の光学部品を確認してください。" :
      camera.autoExposure ? "明るさ自動：現在の最大画素を基準に表示。パワー比較には自動OFFを使用してください。" : "明るさ固定：1画素P=1を基準に表示。") +
      ` 表示ゲイン ×${camera.exposure}。` + (frame.clippedPixels ? ` 表示上限を超える画素：${frame.clippedPixels}。` : "") +
      (frame.nonvisiblePower ? " UV・IRは識別用の疑似色です。" : "") + (result.truncated ? " 光線追跡の打切りがあるため、像は未完の集計です。" : "");
  }
  $("camera-select").addEventListener("change", event => select(Number(event.target.value)));
  $("camera-edit").addEventListener("click", () => { if (cameraId !== null) select(cameraId, true); });
  $("camera-save").addEventListener("click", event => {
    render(); if (!cameraSvg) { event.preventDefault(); return; }
    download(cameraSvg, "image/svg+xml;charset=utf-8", "-camera.svg", event.currentTarget);
  });
  function setPhase(value) {
    const phase = scene.elements.find(e => e.type === "phase" && e.id === phaseId);
    if (!phase || !Number.isFinite(value) || value < 0 || value > 360) return false;
    if (phase.phase !== value) { phase.phase = value; markEdited(); syncInspector(); requestRender(); }
    return true;
  }
  $("coherence-phase-select").addEventListener("change", () => { phaseId = Number($("coherence-phase-select").value); renderCoherenceSelection(); });
  function renderCoherenceSelection() { coherence = C.analyze(scene.elements, result, phaseId); renderCoherence(); }
  for (const id of ["coherence-phase-slider", "coherence-phase-value"]) {
    const input = $(id);
    input.addEventListener("focus", checkpoint);
    input.addEventListener("pointerdown", checkpoint);
    input.addEventListener("input", () => {
      if (!input.value.trim() || !setPhase(Number(input.value))) {
        input.setAttribute("aria-invalid", "true"); $("coherence-input-error").textContent = "位相は0〜360°で入力してください。"; return;
      }
      input.removeAttribute("aria-invalid"); $("coherence-input-error").textContent = "";
    });
    input.addEventListener("change", checkpoint);
    input.addEventListener("focusout", checkpoint);
  }
  $("coherence-phase-slider").addEventListener("pointerdown", event => {
    if (event.button !== 0 || event.isPrimary === false || pending) return;
    const input = event.currentTarget;
    event.preventDefault(); checkpoint(); input.focus({ preventScroll: true });
    pending = { kind: "range", owner: input, input, pointerId: event.pointerId, before: S.serialize(scene), edited };
    input.setPointerCapture(event.pointerId); updateInteraction(event);
  });
  $("coherence-phase-slider").addEventListener("lostpointercapture", event => {
    if (pending?.kind === "range" && pending.owner === event.target) finishInteraction(true);
  });
  $("coherence-phase-slider").addEventListener("click", event => event.preventDefault());
  $("coherence-phase-slider").addEventListener("keydown", event => {
    if (pending || event.ctrlKey || event.metaKey || event.altKey) return;
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 }[event.key];
    if (step === undefined && event.key !== "Home" && event.key !== "End") return;
    const value = event.key === "Home" ? 0 : event.key === "End" ? 360 : Math.max(0, Math.min(360, Number(event.currentTarget.value) + step));
    event.preventDefault(); checkpoint(); setPhase(value); checkpoint();
  });
  $("coherence-phase-buttons").addEventListener("click", event => {
    const button = event.target.closest("[data-phase]"); if (!button) return;
    checkpoint(); setPhase(Number(button.dataset.phase)); checkpoint();
  });
  $("coherence-select-part").addEventListener("click", () => select(phaseId, true));
  $("coherence-optics").addEventListener("click", event => {
    const button = event.target.closest("[data-optic-id]");
    const element = button && scene.elements.find(e => String(e.id) === button.dataset.opticId);
    if (!element) return;
    checkpoint(); element.enabled = !element.enabled; markEdited(); checkpoint(); syncInspector(); render();
  });
  $("coherence-readout").addEventListener("click", event => {
    const button = event.target.closest("[data-select]"); if (button) select(Number(button.dataset.select), true);
  });

  function probeIndex() { return probe ? result.segments.findIndex(s => s.key === probe.key) : -1; }
  function clearProbe(focus = false) {
    const hadFocus = $("ray-inspector").contains(document.activeElement);
    probe = null; renderProbe();
    if (focus || hadFocus) bench.focus({ preventScroll: true });
  }
  function chooseProbe(index, t = .5, focus = false) {
    const segment = result.segments[index]; if (!segment) return;
    probe = { key: segment.key, t, distance: segment.hitId === null ? t * Math.hypot(segment.b.x - segment.a.x, segment.b.y - segment.a.y) : null }; renderProbe();
    $("ray-inspector").parentNode.scrollTop = 0;
    if (focus) $("probe-close").focus();
    announce("クリック位置までの光路距離と状態を表示しました。別の光路をクリックして比較できます。");
  }
  function inspectPoint(point) {
    const hits = V.pickSegments(result.segments, point, 6 * view.worldPerPixel());
    if (hits.length) chooseProbe(hits[0].index, hits[0].t);
    else clearProbe();
  }
  function renderProbe() {
    $("inspect-ray").disabled = !result.segments.length;
    $("inspect-ray").setAttribute("aria-expanded", String(Boolean(probe)));
    $("ray-inspector").hidden = !probe;
    if (!probe) { probeHits = []; view.markProbe(null); return; }
    const index = probeIndex(), s = result.segments[index];
    $("probe-data").hidden = !s;
    $("probe-index").textContent = (s ? index + 1 : "—") + " / " + result.segments.length;
    $("probe-prev").disabled = !result.segments.length || index === 0;
    $("probe-next").disabled = !result.segments.length || index === result.segments.length - 1;
    if (!s) {
      probeHits = []; view.markProbe(null);
      $("probe-status").textContent = "選択した区間の光路が見つかりません。遮断・無効化などを確認するか、別の光路をクリックしてください。";
      return;
    }
    // Escaping rays extend with the viewport; keep their probe at a physical
    // distance from the last surface instead of moving it when zooming/panning.
    const segmentLength = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
    const t = probe.distance === null ? probe.t : probe.distance / segmentLength;
    const segmentDistance = probe.distance === null ? Math.max(0, t * segmentLength) : Math.max(0, probe.distance);
    const at = { x: s.a.x + t * (s.b.x - s.a.x), y: s.a.y + t * (s.b.y - s.a.y) };
    probeHits = V.pickSegments(result.segments, at, 6 * view.worldPerPixel());
    $("probe-overlap-label").hidden = probeHits.length < 2;
    $("probe-overlap").replaceChildren(...probeHits.map(hit => {
      const ray = result.segments[hit.index], source = scene.elements.find(e => e.id === ray.sourceId);
      const direction = num(O.normalizeAngle(Math.atan2(ray.b.y - ray.a.y, ray.b.x - ray.a.x) * 180 / Math.PI), 1);
      const option = node("option", "", `区間${hit.index + 1} · ${V.formatWavelength(ray.wavelength)} nm · ${source ? label(source) : ray.sourceId} · ${direction}°`);
      option.value = String(hit.index); return option;
    }));
    $("probe-overlap").value = String(index);
    const pol = V.polarizationState(s.stokes), source = scene.elements.find(e => e.id === s.sourceId);
    const kind = pol?.kind, handed = pol?.v > 0 ? "右" : "左";
    const name = !pol ? "偏光は未定義" : kind === "unpolarized" ? "無偏光" :
      (pol.degree < 1 - 1e-6 ? "部分偏光 · " : "") + (kind === "linear" ? "直線偏光" : kind === "circular" ? handed + "円偏光" : handed + "楕円偏光");
    $("probe-status").textContent = `区間 ${index + 1}：${name} · ${V.formatWavelength(s.wavelength)} nm`;
    $("probe-wavelength").textContent = V.formatWavelength(s.wavelength) + " nm" + (s.wavelength < 380 ? " · UV（疑似色）" : s.wavelength > 780 ? " · IR（疑似色）" : "");
    $("probe-swatch").style.background = O.wavelengthColor(s.wavelength);
    $("probe-source").textContent = "光源：" + (source ? label(source) : s.sourceId);
    $("probe-polarization-name").textContent = name;
    $("probe-degree").textContent = pol ? "偏光度 " + num(pol.degree * 100, 2) + "%" : "偏光度 —";
    $("probe-angles").textContent = "ψ " + (pol?.azimuth != null ? num(pol.azimuth, 2) + "°" : "未定義") + " / χ " + (pol?.ellipticity != null ? num(pol.ellipticity, 2) + "°" : "未定義");
    const hasEllipse = pol && kind !== "unpolarized", linear = kind === "linear";
    // SVG's vertical axis is down; positive azimuth points from s toward +p (up).
    const transform = `rotate(${-pol?.azimuth || 0} 54 54)`;
    $("probe-ellipse").setAttribute("visibility", hasEllipse && !linear ? "visible" : "hidden");
    $("probe-linear").setAttribute("visibility", hasEllipse && linear ? "visible" : "hidden");
    $("probe-no-ellipse").setAttribute("visibility", hasEllipse ? "hidden" : "visible");
    $("probe-ellipse").setAttribute("ry", String(hasEllipse ? 32 * Math.abs(Math.tan(pol.ellipticity * Math.PI / 180)) : 0));
    $("probe-ellipse").setAttribute("transform", transform); $("probe-linear").setAttribute("transform", transform);
    $("probe-diagram").setAttribute("aria-label", name + "。" + $("probe-angles").textContent + "。s/p基準の偏光断面");
    $("probe-power").textContent = power(s.power);
    const fiberLinks = Number.isSafeInteger(s.unmeasuredFiberLinks) ? s.unmeasuredFiberLinks : 0;
    $("probe-path-length").textContent = distance((Number.isFinite(s.pathLengthStart) ? s.pathLengthStart : 0) + segmentDistance) +
      (fiberLinks ? ` + ファイバー${fiberLinks}区間（長さ未設定）` : "");
    $("probe-segment-distance").textContent = distance(segmentDistance);
    $("probe-path-note").textContent = fiberLinks ?
      `空気中の光線中心に沿う積算値です。ファイバー${fiberLinks}区間の内部長と屈折率は未設定のため、表示値に含みません。位相φも距離へ換算しません。` :
      "空気中の光線中心に沿う積算値です。薄い素子は厚さ0、空気はn=1。位相φは距離へ換算しません。";
    $("probe-position").textContent = "X " + num(display(at.x), 3) + " / Y " + num(display(at.y), 3) + " " + scene.unit;
    $("probe-direction").textContent = num(O.normalizeAngle(Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x) * 180 / Math.PI), 2) + "°（右0°・下90°）";
    $("probe-stokes").textContent = stokesText(s.stokes);
    view.markProbe({ segment: s, t });
  }
  function freeSpot() {
    const v = view.getView(), center = V.place(v.x + v.width / 2, v.y + v.height / 2, scene.gridStep, scene.snap);
    const candidates = [center];
    for (let radius = 75; radius <= 700; radius += 75) {
      for (let a = 0; a < 360; a += 45) {
        const d = O.direction(a);
        candidates.push(V.place(center.x + radius * d.x, center.y + radius * d.y, scene.gridStep, scene.snap));
      }
    }
    return candidates.find(p => scene.elements.every(e => Math.hypot(p.x - e.x, p.y - e.y) > 65)) || center;
  }
  function addElement(type, at) {
    checkpoint();
    if (scene.elements.length >= O.MAX_ELEMENTS) { announce("部品は最大" + O.MAX_ELEMENTS + "個までです。"); return; }
    const p = at || freeSpot(), e = { ...O.createElement(type, allocateId(), p.x, p.y), x: p.x, y: p.y };
    scene.elements.push(e); setSelection([e.id]); markEdited(); checkpoint(); syncInspector(); render(); view.focus(e.id);
    announce(label(e) + "を X " + display(e.x) + " / Y " + display(e.y) + " " + scene.unit + " に配置しました。");
  }
  function deleteSelected() {
    finishInteraction(true); checkpoint();
    const e = selected(), ids = [...selectedIds]; if (!e) return;
    clearProbe();
    scene.elements = scene.elements.filter(item => !ids.includes(item.id)); setSelection([scene.elements.at(-1)?.id]);
    if (scene.fiberLinks) scene.fiberLinks = scene.fiberLinks.filter(link => !ids.includes(link.a) && !ids.includes(link.b));
    markEdited(); checkpoint(); syncInspector(); render();
    if (selectedId !== null) view.focus(selectedId); else bench.focus({ preventScroll: true });
    announce((ids.length>1?ids.length+"個の部品":label(e)) + "を削除しました。「戻す」で復元できます。");
  }
  function insertCopies(sources, links, delta, rename = false) {
    if (scene.elements.length + sources.length > O.MAX_ELEMENTS) throw new Error("部品は最大" + O.MAX_ELEMENTS + "個までです。");
    const used=new Set(scene.elements.map(e=>e.id)), ids=new Map();
    const copies=sources.map(source=>{
      let id=1; while(used.has(id))id++; used.add(id); ids.set(source.id,id);
      return {...source,id,x:source.x+delta.x,y:source.y+delta.y,label:rename&&source.label?source.label.slice(0,96)+" 複製":source.label};
    });
    const copiedLinks=links.filter(l=>ids.has(l.a)&&ids.has(l.b)).map(l=>({a:ids.get(l.a),b:ids.get(l.b)}));
    const next=S.validateScene({...scene,elements:[...scene.elements,...copies],fiberLinks:[...scene.fiberLinks,...copiedLinks]});
    checkpoint(); scene=next; setSelection(copies.map(e=>e.id)); markEdited(); checkpoint(); syncInspector(); render(); view.focus(selectedId);
    return copies;
  }
  function duplicateSelected() {
    const sources=selectedElements(); if(!sources.length)return;
    try {
      const delta=V.pasteGroupDelta(sources,scene.elements,scene.gridStep,scene.snap);
      if(!delta)throw new Error("配置できる空き位置がありません。");
      const copies=insertCopies(sources,scene.fiberLinks,delta,true);
      announce((copies.length>1?copies.length+"個の部品":label(copies[0]))+"を複製しました。");
    } catch(error) { announce("複製できませんでした。 "+error.message); }
  }
  function componentClipboardEvent(event) {
    return !event.defaultPrevented && !pending && !isTextEditing(event.target) &&
      !isTextEditing(document.activeElement) && !window.getSelection()?.toString();
  }
  function copySelected(event, cut = false) {
    if (!componentClipboardEvent(event)) return;
    const e = selected(), sources=selectedElements(); if (!e) return;
    event.preventDefault();
    try {
      if (!event.clipboardData) throw new Error("クリップボードを利用できません。");
      event.clipboardData.setData("text/plain", S.serializeSelection(sources,scene.fiberLinks));
    } catch (_) {
      announce("部品をコピーできませんでした。現在の設計は変更していません。"); return;
    }
    // Only remove the source after the browser has accepted the clipboard data.
    if (cut) deleteSelected();
    announce((sources.length>1?sources.length+"個の部品":label(e)) + (cut ? "を切り取りました。Ctrl+Vで貼り付け、Ctrl+Zで復元できます。" : "をコピーしました。Ctrl+Vで貼り付けられます。"));
  }
  function pasteComponent(event) {
    if (!componentClipboardEvent(event)) return;
    event.preventDefault();
    try {
      if (!event.clipboardData) throw new Error("クリップボードを利用できません。");
      const source = S.parseSelection(event.clipboardData.getData("text/plain"));
      if (scene.elements.length + source.elements.length > O.MAX_ELEMENTS) throw new Error("部品は最大" + O.MAX_ELEMENTS + "個までです。");
      const delta = V.pasteGroupDelta(source.elements, scene.elements, scene.gridStep, scene.snap);
      if (!delta) throw new Error("配置できる空き位置がありません。グリッドを細かくするか位置吸着を解除してください。");
      const copies=insertCopies(source.elements,source.fiberLinks,delta);
      announce((copies.length>1?copies.length+"個の部品":label(copies[0])) + "を貼り付けました。「戻す」で取り消せます。");
    } catch (error) {
      announce("貼り付けできませんでした。 " + error.message);
    }
  }
  function rotateSelected(delta = 22.5) {
    checkpoint(); const e = selected(); if (!e) return;
    e.angle = O.normalizeAngle(e.angle + delta); markEdited(); checkpoint(); syncInspector(); render();
    announce("配置角度を " + num(e.angle) + "° にしました。");
  }
  function replaceScene(next, presetId = null) {
    finishInteraction(true); checkpoint();
    clearProbe();
    invalidateShare();
    scene = S.validateScene(next); setSelection([scene.fiberLinks[0]?.a ?? scene.elements.find(e => e.type === "lens")?.id ?? scene.elements[0]?.id ?? null]);
    activePresetId = presetId; edited = false; checkpoint(); syncControls(); syncInspector(true); view.fit(scene.elements, scene.fiberLinks || []); render();
  }

  const groups = [
    ["光源", ["laser", "point"]],
    ["光路", ["mirror", "concave", "lens", "objective", "iris", "filter", "dichroic", "splitter", "pbs"]],
    ["偏光・位相", ["polarizer", "waveplate", "halfwave", "phase"]],
    ["検出・終端", ["fiber", "camera", "screen", "blocker"]]
  ];
  for (const [heading, types] of groups) {
    const group = node("div", "palette-group"); group.append(node("h3", "", heading));
    for (const type of types) {
      const button = node("button", "part-button"); button.type = "button"; button.dataset.add = type;
      button.title = O.TYPES[type].label + "をドラッグで配置";
      const symbol = node("span", "part-symbol", V.symbols[type]); symbol.setAttribute("aria-hidden", "true");
      const caption = node("span", "part-label");
      if (type === "splitter" || type === "pbs") {
        caption.append(node("span", "", type === "splitter" ? "無偏光BS" : "偏光BS"), node("small", "part-code", O.TYPES[type].short));
        button.setAttribute("aria-label", O.TYPES[type].label);
      } else caption.textContent = O.TYPES[type].label;
      button.append(symbol, caption); group.append(button);
      button.addEventListener("pointerdown", event => {
        if (event.button !== 0 || event.isPrimary === false || pending || button.disabled) return;
        checkpoint(); suppressedClick = null;
        pending = { kind: "place", button, owner: button, type, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false, inside: false };
        button.classList.add("is-placing"); button.setPointerCapture(event.pointerId);
        $("placement-cursor").textContent = O.TYPES[type].label + "をテーブルへ";
      });
      button.addEventListener("lostpointercapture", () => { if (pending?.owner === button) finishInteraction(true); });
      button.addEventListener("click", event => {
        if (suppressedClick?.button === button && performance.now() < suppressedClick.until && event.detail !== 0) {
          suppressedClick = null; event.preventDefault(); return;
        }
        if (!pending) addElement(type);
      });
      button.addEventListener("keydown", event => {
        if (!["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        if (!event.repeat && !pending) addElement(type);
      });
    }
    $("palette-buttons").append(group);
  }
  function updateInteraction(event) {
    if (!pending || pending.pointerId !== event.pointerId) return;
    const p = pending;
    if (p.kind === "range") {
      const input = p.input, rect = input.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left - 8) / Math.max(1, rect.width - 16)));
      const min = Number(input.min), max = Number(input.max), step = Number(input.step);
      let value = min + fraction * (max - min);
      if (Number.isFinite(step) && step > 0) value = min + Math.round((value - min) / step) * step;
      input.value = String(Math.max(min, Math.min(max, value)));
      if (input.id === "coherence-phase-slider") setPhase(Number(input.value));
      else applyField(input);
      return;
    }
    if (p.kind === "pan") {
      if (!p.moved && Math.hypot(event.clientX - p.startX, event.clientY - p.startY) < 4) return;
      p.moved = true;
      const previous = view.point({ clientX: p.lastX, clientY: p.lastY }), current = view.point(event), v = view.getView();
      view.setView({ ...v, x: v.x - (current.x - previous.x), y: v.y - (current.y - previous.y) });
      p.lastX = event.clientX; p.lastY = event.clientY; return;
    }
    if (!p.moved && Math.hypot(event.clientX - p.startX, event.clientY - p.startY) < 4) return;
    p.moved = true;
    const point = view.point(event);
    if (p.kind === "marquee") {
      p.point=point;
      const ids=V.marqueeIds(scene.elements,p.start,p.point), next=p.additive?[...p.baseIds,...ids]:ids;
      setSelection(next,selectedIds.includes(p.primaryId)?p.primaryId:ids.at(-1));
      view.marquee(V.marqueeRect(p.start,p.point)); syncInspector(); requestRender(); return;
    }
    if (p.kind === "place" || p.kind === "copy") {
      const copying = p.kind === "copy";
      p.inside = view.inside(event);
      const target={x:point.x-(copying?p.offsetX:0),y:point.y-(copying?p.offsetY:0)};
      if(copying){
        if(p.shiftKey&&!p.axis)p.axis=Math.abs(target.x-p.anchor.x)>=Math.abs(target.y-p.anchor.y)?'x':'y';
        p.delta=V.groupDelta(p.sources,p.anchor,target,scene.gridStep,scene.snap,p.axis);
        view.previewGroup(p.inside?p.sources.map(e=>({...e,x:e.x+p.delta.x,y:e.y+p.delta.y})):[],"ここに複製");
      } else {
        p.point=V.place(target.x,target.y,scene.gridStep,scene.snap);
        view.preview(p.inside?{...O.createElement(p.type,1,p.point.x,p.point.y),...p.point}:null,"ここに配置");
      }
      $("placement-cursor").hidden = p.inside;
      $("placement-cursor").style.left = event.clientX + 14 + "px"; $("placement-cursor").style.top = event.clientY + 14 + "px";
      bench.classList.toggle("accepting-drop", p.inside); return;
    }
    const e = scene.elements.find(item => item.id === p.id);
    if (!e) return;
    if (p.kind === "move") {
      const target={x:point.x-p.offsetX,y:point.y-p.offsetY};
      if(p.shiftKey&&!p.axis)p.axis=Math.abs(target.x-p.anchor.x)>=Math.abs(target.y-p.anchor.y)?'x':'y';
      p.delta=V.groupDelta(p.sources,p.anchor,target,scene.gridStep,scene.snap,p.axis);
      for(const before of p.before){const member=scene.elements.find(item=>item.id===before.id);if(member)Object.assign(member,{x:before.x+p.delta.x,y:before.y+p.delta.y});}
    }
    else e.angle = V.snapAngle(Math.atan2(point.y - e.y, point.x - e.x) * 180 / Math.PI, scene.angleSnap);
    syncInspector(); requestRender();
  }
  function finishInteraction(cancel = false) {
    if (!pending) return;
    const p = pending; pending = null;
    if (p.owner.hasPointerCapture(p.pointerId)) p.owner.releasePointerCapture(p.pointerId);
    if (p.kind === "place") {
      view.preview(null); $("placement-cursor").hidden = true; bench.classList.remove("accepting-drop"); p.button.classList.remove("is-placing");
      if (cancel || p.moved) suppressedClick = { button: p.button, until: performance.now() + 1000 };
      if (!cancel && p.moved && p.inside) addElement(p.type, p.point);
      else if (p.moved || cancel) announce("配置を取り消しました。テーブル内へドラッグしてください。");
    } else if (p.kind === "copy") {
      view.previewGroup([]); $("placement-cursor").hidden = true; bench.classList.remove("accepting-drop", "is-copying");
      if (!cancel && p.moved && p.inside) {
        try { const copies=insertCopies(p.sources,p.links,p.delta); announce((copies.length>1?copies.length+"個の部品":label(copies[0]))+"を複製しました。「戻す」で取り消せます。"); }
        catch(error){announce("複製できませんでした。 "+error.message);}
      } else if (p.moved || cancel) announce("複製を取り消しました。元の部品は変更していません。");
      else { setSelection(p.clickIds,p.id); rememberSelection(); syncInspector(); render(); }
    } else if (p.kind === "marquee") {
      view.marquee(null);
      if(cancel)setSelection(p.baseIds,p.primaryId);
      else if(!p.moved){
        setSelection(p.baseIds,p.primaryId);
        if(!p.additive)inspectPoint(p.start);
      }
      rememberSelection();syncInspector();render();
    } else if (p.kind === "range") {
      if (cancel) { scene = S.parse(p.before); edited = p.edited; }
      checkpoint(); syncInspector(cancel); render();
    } else if (p.kind === "pan") {
      bench.classList.remove("is-panning"); if (cancel) view.setView(p.view);
      else if (!p.moved) inspectPoint(p.point);
    } else {
      const e = scene.elements.find(item => item.id === p.id);
      const changed=p.before.some(before=>{const member=scene.elements.find(item=>item.id===before.id);return member&&(member.x!==before.x||member.y!==before.y||member.angle!==before.angle);});
      if(cancel){for(const before of p.before){const member=scene.elements.find(item=>item.id===before.id);if(member)Object.assign(member,before);}setSelection(p.previousIds,p.previousPrimary);}
      else if(!p.moved){setSelection(p.clickIds,p.id);rememberSelection();}
      if (!cancel && p.moved && changed) { markEdited(); checkpoint(); }
      syncInspector(); render();
      if (p.moved) announce(cancel ? "操作を取り消しました。" : !changed ? "移動できる範囲の上限です。" : p.kind === "move" ?
        (p.sources.length>1?p.sources.length+"個の部品":label(e)) + "を移動しました。" : "配置角度を " + num(e.angle) + "° にしました。");
    }
  }
  bench.addEventListener("pointerdown", event => {
    if (event.button !== 0 || event.isPrimary === false || pending) return;
    event.preventDefault(); checkpoint();
    window.getSelection()?.removeAllRanges();
    const target = event.target.closest("[data-element-id]");
    if (target) {
      const id = Number(target.dataset.elementId), previousIds=[...selectedIds], previousPrimary=selectedId;
      const rotating=Boolean(event.target.closest("[data-rotate]")), copying=!rotating&&(event.ctrlKey||event.metaKey);
      const clickIds=event.shiftKey&&!copying?(previousIds.includes(id)?previousIds.filter(i=>i!==id):[...previousIds,id]):[id];
      if(previousIds.includes(id)&&!rotating)setSelection(previousIds,id);else setSelection([...previousIds.filter(i=>event.shiftKey&&!copying),id],id);
      syncInspector();render();view.focus(id);
      const e = selected(), p = view.point(event);
      // Latch the gesture when grabbed; releasing Ctrl before dropping still copies.
      const kind = rotating ? "rotate" : copying ? "copy" : "move", sources=selectedElements();
      if (kind === "copy" && scene.elements.length+sources.length>O.MAX_ELEMENTS) { announce("部品は最大" + O.MAX_ELEMENTS + "個までです。");setSelection(previousIds,previousPrimary);return; }
      pending = { kind, id, owner: bench, pointerId: event.pointerId,
        startX:event.clientX,startY:event.clientY,moved:false,offsetX:p.x-e.x,offsetY:p.y-e.y,anchor:{x:e.x,y:e.y},sources:sources.map(e=>({...e})),
        before:sources.map(e=>({id:e.id,x:e.x,y:e.y,angle:e.angle})),previousIds,previousPrimary,clickIds,shiftKey:event.shiftKey,axis:null,delta:{x:0,y:0} };
      if (kind === "copy") {
        pending.links=scene.fiberLinks.filter(l=>selectedIds.includes(l.a)&&selectedIds.includes(l.b)); pending.inside=false;
        bench.classList.add("is-copying"); $("placement-cursor").textContent = label(e) + "の複製をテーブルへ";
      }
    } else {
      bench.focus({ preventScroll: true });
      const point=view.point(event), pan=pointerTool==='pan'||spaceHeld||event.ctrlKey||event.metaKey;
      pending = pan ? {kind:"pan",owner:bench,pointerId:event.pointerId,lastX:event.clientX,lastY:event.clientY,startX:event.clientX,startY:event.clientY,moved:false,point,view:view.getView()} :
        {kind:"marquee",owner:bench,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,start:point,point,moved:false,additive:event.shiftKey,baseIds:[...selectedIds],primaryId:selectedId};
      if(pan)bench.classList.add("is-panning");else {view.marquee(V.marqueeRect(point,point));syncInspector();render();}
    }
    bench.setPointerCapture(event.pointerId);
  });
  // Document listeners cover pointer drivers that do not retain SVG capture.
  document.addEventListener("pointermove", updateInteraction);
  document.addEventListener("pointerup", event => { if (event.pointerId === pending?.pointerId) { updateInteraction(event); finishInteraction(); } });
  document.addEventListener("pointercancel", event => { if (event.pointerId === pending?.pointerId) finishInteraction(true); });
  bench.addEventListener("lostpointercapture", () => { if (pending?.owner === bench) finishInteraction(true); });
  window.addEventListener("blur", () => { spaceHeld=false; bench.classList.remove("space-pan"); finishInteraction(true); });
  bench.addEventListener("focusin", event => {
    const target = event.target.closest("[data-element-id]");
    if (target && !selectedIds.includes(Number(target.dataset.elementId))) select(Number(target.dataset.elementId));
  });
  bench.addEventListener("wheel", event => {
    if (!event.shiftKey || pending) return;
    event.preventDefault();
    const delta = event.deltaY || event.deltaX;
    if (delta) view.zoom(Math.max(.3, Math.min(3, Math.exp(-delta * .0015))), view.point(event));
  }, { passive: false });
  document.addEventListener("keydown", event => {
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape" && pending) { event.preventDefault(); finishInteraction(true); return; }
    if (isTextEditing(event.target)) return;
    if (event.key === "Escape" && probe) { event.preventDefault(); clearProbe(true); return; }
    if (event.key === "Escape" && selectedIds.length) { event.preventDefault(); checkpoint(); setSelection([]); rememberSelection(); syncInspector(); render(); bench.focus({ preventScroll: true }); return; }
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      if(key==="a"&&!isTextEditing(event.target)&&bench.contains(event.target)){event.preventDefault();selectAll();return;}
      if (key === "z" || (key === "y" && !event.shiftKey)) {
        event.preventDefault(); undo(key === "y" || event.shiftKey ? 1 : -1); return;
      }
      // Keep the native clipboard events; suppress repeated cuts/pastes and in-progress drags.
      if (["c", "x", "v"].includes(key)) {
        if (event.repeat || pending) event.preventDefault();
        return;
      }
      if (key === "d" && !event.shiftKey) {
        event.preventDefault(); if (!pending && !event.repeat) duplicateSelected(); return;
      }
    }
    if(event.key===" "&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&bench.contains(event.target)){
      event.preventDefault();spaceHeld=true;bench.classList.add("space-pan");return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey || pending || !bench.contains(event.target)) return;
    const e = selected(); if (!e) return;
    const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (moves[event.key]) {
      event.preventDefault(); checkpoint();
      const [dx, dy] = moves[event.key];
      const at=V.nudge(e,dx,dy,scene.gridStep,scene.snap,event.shiftKey?10:1),members=selectedElements();
      const delta=V.groupDelta(members,e,at,scene.gridStep,scene.snap);
      if(!delta.x&&!delta.y){announce("移動できる範囲の上限です。");return;}
      for(const member of members){member.x+=delta.x;member.y+=delta.y;}
      markEdited(); checkpoint(); syncInspector(); render();
      announce("X " + display(e.x) + " / Y " + display(e.y) + " " + scene.unit);
    } else if (key === "r") { event.preventDefault(); rotateSelected(event.shiftKey ? -22.5 : 22.5); }
    else if (["Delete", "Backspace"].includes(event.key)) { event.preventDefault(); deleteSelected(); }
    else if (event.key==="Enter") { event.preventDefault(); announce((selectedIds.length>1?selectedIds.length+"個の部品":label(e)) + "を選択中。矢印キーで移動できます。"); }
  });
  document.addEventListener("keyup",event=>{if(event.key===" "){spaceHeld=false;bench.classList.remove("space-pan");}});
  document.addEventListener("copy", event => copySelected(event));
  document.addEventListener("cut", event => copySelected(event, true));
  document.addEventListener("paste", pasteComponent);
  $("inspect-ray").addEventListener("click", () => {
    if (pending) return;
    const index = result.segments.findIndex(s => s.center);
    chooseProbe(index < 0 ? 0 : index, .5, true);
  });
  $("probe-close").addEventListener("click", () => clearProbe(true));
  $("probe-prev").addEventListener("click", () => chooseProbe(Math.max(0, probeIndex() - 1)));
  $("probe-next").addEventListener("click", () => chooseProbe(probeIndex() + 1));
  $("probe-overlap").addEventListener("change", () => {
    const hit = probeHits.find(item => item.index === Number($("probe-overlap").value));
    if (hit) chooseProbe(hit.index, hit.t);
  });

  $("properties").addEventListener("submit", event => event.preventDefault());
  // Explicit range gestures keep snapping, cancellation and undo consistent.
  $("parameter-fields").addEventListener("pointerdown", event => {
    const input = event.target;
    if (input.type !== "range" || input.disabled || event.button !== 0 || event.isPrimary === false || pending) return;
    event.preventDefault(); checkpoint(); input.focus({ preventScroll: true });
    pending = { kind: "range", owner: input, input, pointerId: event.pointerId, before: S.serialize(scene), edited };
    input.setPointerCapture(event.pointerId); updateInteraction(event);
  });
  $("parameter-fields").addEventListener("lostpointercapture", event => {
    if (pending?.kind === "range" && pending.owner === event.target) finishInteraction(true);
  });
  $("parameter-fields").addEventListener("keydown", event => {
    const input = event.target;
    if (input.type !== "range" || input.disabled || pending) return;
    const direction = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 }[event.key];
    if (direction === undefined && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault(); checkpoint();
    const min = Number(input.min), max = Number(input.max), step = Number(input.step) || (max - min) / 100;
    input.value = String(event.key === "Home" ? min : event.key === "End" ? max : Math.max(min, Math.min(max, Number(input.value) + direction * step)));
    applyField(input); checkpoint();
  });
  $("parameter-fields").addEventListener("input", event => applyField(event.target));
  $("parameter-fields").addEventListener("change", event => {
    if (event.target.id === "fiber-partner") { connectFiber(Number(event.target.value)); return; }
    if (applyField(event.target)) {
      const input = event.target, e = selected(), k = input.dataset.key;
      if (input.type !== "checkbox") input.value = String(lengths.has(k) ? display(fieldValue(e, k)) : fieldValue(e, k));
      checkpoint();
    }
  });
  $("parameter-fields").addEventListener("focusout", () => checkpoint());
  $("parameter-fields").addEventListener("click", event => {
    if (event.target.id === "fiber-disconnect") { connectFiber(0); return; }
    if (event.target.id === "fiber-select-partner") { const id = fiberPartnerId(selectedId); if (id !== null) select(id, true); return; }
    if (event.target.type === "range") { event.preventDefault(); return; }
    const b = event.target.closest("[data-wavelength]"); if (!b) return;
    checkpoint(); const input = fieldByKey("wavelength"); input.value = b.dataset.wavelength;
    if (applyField(input)) { checkpoint(); syncInspector(); }
  });
  $("element-select").addEventListener("change", event => select(Number(event.target.value)));
  $("select-tool").addEventListener("click",()=>{pointerTool="select";bench.classList.remove("pan-tool");$("select-tool").setAttribute("aria-pressed","true");$("pan-tool").setAttribute("aria-pressed","false");bench.focus({preventScroll:true});});
  $("pan-tool").addEventListener("click",()=>{pointerTool="pan";bench.classList.add("pan-tool");$("select-tool").setAttribute("aria-pressed","false");$("pan-tool").setAttribute("aria-pressed","true");bench.focus({preventScroll:true});});
  $("select-all").addEventListener("click",selectAll);
  $("clear-selection").addEventListener("click",()=>{checkpoint();setSelection([]);rememberSelection();syncInspector();render();bench.focus({preventScroll:true});});
  $("rotate").addEventListener("click", () => rotateSelected());
  $("duplicate").addEventListener("click", duplicateSelected);
  $("delete").addEventListener("click", deleteSelected);
  $("source-readout").addEventListener("click", event => { const b = event.target.closest("[data-select]"); if (b) select(Number(b.dataset.select), true); });
  $("detector-readout").addEventListener("click", event => { const b = event.target.closest("[data-select]"); if (b) select(Number(b.dataset.select), true); });
  $("undo").addEventListener("click", () => undo(-1)); $("redo").addEventListener("click", () => undo(1));
  $("zoom-in").addEventListener("click", () => view.zoom(1.25)); $("zoom-out").addEventListener("click", () => view.zoom(1 / 1.25));
  $("fit").addEventListener("click", () => view.fit());
  $("show-labels").addEventListener("change", render);
  $("unit").addEventListener("change", event => {
    checkpoint(); scene = S.switchUnit(scene, event.target.value); markEdited(); checkpoint();
    syncControls(); syncInspector(true); render();
    announce("表示を " + scene.unit + "、グリッドを " + display(scene.gridStep) + " " + scene.unit + " に変更しました。物理的な配置は変わりません。");
  });
  $("grid-step").addEventListener("input", event => {
    const input = event.target, value = Number(input.value), mm = value * S.unitScale(scene.unit);
    if (!input.value.trim() || !Number.isFinite(mm) || mm < 1 - 1e-7 || mm > 254 + 1e-7) {
      input.setAttribute("aria-invalid", "true"); announce("グリッドは " + display(1) + "〜" + display(254) + " " + scene.unit + "。直前の値を使用します。"); return;
    }
    input.removeAttribute("aria-invalid"); scene.gridStep = Math.max(1, Math.min(254, mm)); markEdited(); requestRender();
  });
  $("grid-step").addEventListener("change", checkpoint);
  $("grid-step").addEventListener("focusout", checkpoint);
  $("snap").addEventListener("change", () => {
    checkpoint(); scene.snap = $("snap").checked; markEdited(); checkpoint();
    announce(scene.snap ? "位置をグリッドに吸着します。数値入力は任意の位置を指定できます。" : "位置吸着を解除しました。");
  });
  $("angle-snap").addEventListener("change", () => {
    checkpoint(); scene.angleSnap = $("angle-snap").checked; markEdited(); checkpoint(); syncInspector();
    announce(scene.angleSnap ? "角度スライダーと回転ハンドルは22.5°に吸着します。数値入力は任意角度。" : "角度スライダーと回転ハンドルの吸着を解除しました。");
  });
  $("scene-title").addEventListener("input", event => {
    const input = event.target;
    try { scene = S.validateScene({ ...scene, title: input.value }); input.removeAttribute("aria-invalid"); markEdited(); requestRender(); }
    catch (error) { input.setAttribute("aria-invalid", "true"); announce(error.message); }
  });
  $("scene-title").addEventListener("change", () => { checkpoint(); requestRender(); });
  $("scene-title").addEventListener("focusout", checkpoint);
  for (const preset of P.list) {
    const option = node("option", "", preset.title); option.value = preset.id; $("preset").append(option);
  }
  $("load-preset").addEventListener("click", () => {
    const id = $("preset").value; replaceScene(P.create(id), id); announce("「" + scene.title + "」を配置しました。元の設計は「戻す」で復元できます。");
  });
  $("new-scene").addEventListener("click", () => {
    replaceScene(S.defaultScene([], { unit: scene.unit, gridStep: scene.gridStep, snap: scene.snap, angleSnap: scene.angleSnap }));
    announce("空のテーブルを用意しました。前の設計は「戻す」で復元できます。");
  });
  function download(contents, mime, extension, link) {
    const blob = new Blob([contents], { type: mime }), url = URL.createObjectURL(blob);
    link.href = url; link.download = (scene.title.trim().replace(/[\\/:*?"<>|]/g, "-") || "optics-bench").slice(0, 100) + extension;
    // Keep the user's actual link click as the download gesture.
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  $("export").addEventListener("click", event => {
    checkpoint(); download(S.serialize(scene), "application/json;charset=utf-8", ".json", event.currentTarget);
    announce("設計JSONのダウンロードを開始しました。部品と全パラメーターを保存します。");
  });
  $("export-svg").addEventListener("click", event => {
    render(); download(view.exportSvg(scene.title), "image/svg+xml;charset=utf-8", ".svg", event.currentTarget);
    announce("表示中の光学図をSVGでダウンロードします。編集用データはJSON保存してください。");
  });
  $("import").addEventListener("click", () => { $("import-file").value = ""; $("import-file").click(); });
  $("import-file").addEventListener("change", async event => {
    const file = event.target.files[0]; if (!file) return;
    $("import").disabled = true;
    try {
      if (file.size > S.MAX_BYTES) throw new Error("ファイルは256 KiB以下にしてください。");
      const next = S.parse(await file.text()); replaceScene(next);
      announce("「" + scene.title + "」を読み込みました（" + scene.elements.length + "部品）。");
    } catch (error) { announce("読み込みできませんでした。現在の設計は変更していません。 " + error.message); }
    finally { $("import").disabled = false; event.target.value = ""; }
  });
  function invalidateShare() {
    designRevision++; shareJob++;
    $("share-copy").disabled = false;
    $("share-panel").removeAttribute("aria-busy");
    if (!$("share-panel").hidden) $("share-status").textContent = "設計が変わりました。共有リンクを作り直してください。";
    $("share-url").value = ""; $("share-result").hidden = true;
  }
  $("share-copy").addEventListener("click", async () => {
    if (hashLoading) { announce("共有リンクの読み込みが終わってからコピーしてください。"); return; }
    if (pending) { announce("配置や設定の操作を終えてから共有してください。"); return; }
    if (document.querySelector('[aria-invalid="true"]')) { announce("入力エラーを直してから共有してください。"); return; }
    const token = ++shareJob, revision = designRevision;
    $("share-panel").hidden = false; $("share-result").hidden = true; $("share-url").value = "";
    $("share-panel").setAttribute("aria-busy", "true"); $("share-copy").disabled = true;
    $("share-status").textContent = "配置と設定を圧縮しています…";
    try {
      const destination = Q.target(window.location.href), hash = await Q.encode(scene);
      if (token !== shareJob || revision !== designRevision) return;
      if (pending) { $("share-status").textContent = "操作が始まったため共有リンクの生成を取り消しました。操作後に作り直してください。"; return; }
      const url = destination.url + hash;
      $("share-url").value = url; $("share-result").hidden = false;
      const warning = (destination.local ? " ローカル版から公開サイト用URLを作りました。この機能を公開するまでは相手側で復元できません。" : "") +
        (url.length > 8000 ? " 長いURLです。貼り付け先によっては途中で切れるため、開けることを確認してください。" : "");
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(url);
        if (token === shareJob) $("share-status").textContent = `共有リンクをコピーしました（${url.length.toLocaleString()}文字）。` + warning;
      } catch (_) {
        if (token === shareJob) {
          $("share-status").textContent = `自動コピーできませんでした（${url.length.toLocaleString()}文字）。下のURLを選択してCtrl+C／⌘Cでコピーしてください。` + warning;
          $("share-url").focus(); $("share-url").select();
        }
      }
    } catch (error) { if (token === shareJob) $("share-status").textContent = "共有リンクを作れませんでした。 " + error.message; }
    finally { if (token === shareJob) { $("share-copy").disabled = false; $("share-panel").removeAttribute("aria-busy"); } }
  });
  $("share-select").addEventListener("click", () => { $("share-url").focus(); $("share-url").select(); });
  $("share-close").addEventListener("click", () => { $("share-panel").hidden = true; $("share-copy").focus(); });
  async function loadSharedHash() {
    const token = ++hashJob, hash = window.location?.hash || '', revision = designRevision;
    if (hashLoading) {
      hashLoading = false; $("share-panel").removeAttribute("aria-busy"); $("share-copy").disabled = false;
      $("share-status").textContent = "共有リンクの読み込みを取り消しました。現在の設計は保持しています。";
    }
    if (!Q.isShareHash(hash)) return;
    hashLoading = true; shareJob++; $("share-copy").disabled = true;
    $("share-url").value = ""; $("share-result").hidden = true;
    $("share-panel").hidden = false; $("share-panel").setAttribute("aria-busy", "true");
    $("share-status").textContent = "共有リンクを読み込んでいます…";
    try {
      const next = await Q.decode(hash);
      if (token !== hashJob) return;
      if (revision !== designRevision || pending) {
        $("share-status").textContent = "読み込み中に操作があったため、現在の設計を保持しました。共有リンクを開き直すと復元できます。"; return;
      }
      replaceScene(next);
      $("share-status").textContent = `共有リンクから「${scene.title}」を復元しました（${scene.elements.length}部品）。編集後は新しいリンクを作ってください。`;
      announce("共有リンクの設計を復元しました。元の設計は「戻す」で復元できます。");
    } catch (error) {
      if (token === hashJob) $("share-status").textContent = "共有リンクを読み込めませんでした。現在の設計は変更していません。 " + error.message;
    } finally { if (token === hashJob) { hashLoading = false; $("share-copy").disabled = false; $("share-panel").removeAttribute("aria-busy"); } }
  }
  window.addEventListener("hashchange", loadSharedHash);
  window.addEventListener("resize", () => { if (result) requestRender(); });
  checkpoint(); syncControls(); syncInspector(); render();
  loadSharedHash();
})();
