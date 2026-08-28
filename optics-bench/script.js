(function () {
  "use strict";
  const O = window.Optics, S = window.OpticsState, P = window.OpticsPresets, V = window.OpticsView;
  const $ = id => document.getElementById(id), bench = $("bench"), view = V.create(bench);
  const lengths = new Set(["x", "y", "aperture", "focal", "beamWidth", "opening", "coreDiameter"]);
  const angles = new Set(["angle", "polAngle", "axisAngle"]);
  const names = {
    x: "X", y: "Y", angle: "配置角度", aperture: "部品径 / 有効径", focal: "焦点距離 f",
    beamWidth: "ビーム直径", wavelength: "波長", power: "相対パワー", rayCount: "光線サンプル数",
    divergence: "発光角（全角）", polarization: "偏光状態", polAngle: "偏光角",
    axisAngle: "軸角度", designWavelength: "設計波長", opening: "開口直径",
    coreDiameter: "コア直径", na: "開口数 NA", transmission: "透過率 T", cutoff: "境界波長", mode: "透過側", label: "部品名"
  };
  const num = (v, digits = 6) => Number(v.toFixed(digits));
  const power = v => v === 0 ? "0" : v < 1e-4 ? v.toExponential(2) : String(Number(v.toPrecision(4)));
  const node = (tag, className, text) => {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  let scene = P.create("starter"), selectedId = 3, activePresetId = "starter", edited = false;
  let result, pending = null, suppressedClick = null, frame = 0, inspectorKey = "", optionsKey = "";
  let history = [], historyIndex = -1;
  const selected = () => scene.elements.find(e => e.id === selectedId);
  const label = e => view.title(e);
  const display = v => num(S.toDisplay(v, scene.unit), 8);
  const announce = message => { $("status").textContent = message; };
  const isSource = e => e.type === "laser" || e.type === "point";
  const fieldByKey = key => $("parameter-fields").querySelector('[data-key="' + key + '"]:not([type="range"])');
  const allocateId = () => { const ids = new Set(scene.elements.map(e => e.id)); let id = 1; while (ids.has(id)) id++; return id; };

  function checkpoint() {
    const text = S.serialize(scene);
    if (history[historyIndex]?.text !== text) {
      history = history.slice(0, historyIndex + 1);
      history.push({ text, selectedId, activePresetId, edited });
      if (history.length > 60) history.shift();
      historyIndex = history.length - 1;
    }
    $("undo").disabled = historyIndex <= 0;
    $("redo").disabled = historyIndex >= history.length - 1;
  }
  function undo(delta) {
    finishInteraction(true);
    checkpoint();
    const index = historyIndex + delta;
    if (index < 0 || index >= history.length) return;
    const entry = history[index];
    scene = S.parse(entry.text); selectedId = entry.selectedId; activePresetId = entry.activePresetId; edited = entry.edited;
    if (!selected()) selectedId = scene.elements[0]?.id ?? null;
    historyIndex = index;
    syncControls(); syncInspector(true); render();
    $("undo").disabled = historyIndex <= 0; $("redo").disabled = historyIndex >= history.length - 1;
    announce(delta < 0 ? "ひとつ前の設計に戻しました。" : "設計の変更をやり直しました。");
  }
  function markEdited() {
    edited = true;
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
    if (key === "x") return { min: O.MARGIN, max: O.WIDTH - O.MARGIN };
    if (key === "y") return { min: O.MARGIN, max: O.HEIGHT - O.MARGIN };
    const limits = { ...O.PARAM_LIMITS[key] };
    if (key === "opening" || key === "coreDiameter") limits.max = Math.min(limits.max, e.aperture);
    return limits;
  }
  function configureInput(input, e) {
    const key = input.dataset.key;
    if (["label", "enabled", "polarization", "mode"].includes(key)) return;
    const limits = bounds(key, e), length = lengths.has(key);
    input.min = String(length ? S.toDisplay(limits.min, scene.unit) : limits.min);
    input.max = String(length ? S.toDisplay(limits.max, scene.unit) : limits.max);
    input.step = input.type === "range" && angles.has(key) ? String(scene.angleSnap ? 22.5 : 0.1) : key === "rayCount" ? "1" : "any";
    input.disabled = key === "polAngle" && e.polarization !== "linear";
  }
  function makeField(key, options = {}) {
    const e = selected(), title = options.title || names[key];
    const wrap = node("label", "field", title), unit = lengths.has(key) ? scene.unit :
      angles.has(key) || key === "divergence" ? "°" : ["wavelength", "designWavelength", "cutoff"].includes(key) ? "nm" : "";
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
      e.type === "fiber" ? "受光する光の進行方向。0°＝右向き入射。" :
      ["mirror", "dichroic", "splitter"].includes(e.type) ? "面の法線。45°で右向きの光を上へ反射。" : "光軸 / 面の法線。0°＝水平な光路。";
    fields.append(makeField("angle", { hint: angleHint + " 数値入力は任意角度。" }));
    fields.append(node("h3", "field-group-title", "光学パラメーター"));
    if (isSource(e)) {
      fields.append(makeField("wavelength"));
      const wavelengths = node("div", "wavelength-buttons");
      for (const nm of [405, 488, 532, 561, 633, 650, 785, 1064]) {
        const b = node("button", "", String(nm)); b.type = "button"; b.dataset.wavelength = String(nm);
        b.title = nm + " nm"; wavelengths.append(b);
      }
      fields.append(wavelengths, makeField("power", { hint: "相対値。光線数で分配するため、本数を変えても総パワーは一定。" }));
      if (e.type === "laser") fields.append(makeField("beamWidth", { hint: "平行光線の幅。Gaussianビームの1/e²径ではありません。" }));
      else fields.append(makeField("divergence", { hint: "2Dの角度サンプル。360°で全周発光。" }));
      fields.append(makeField("rayCount"), makeField("polarization", { choices: [
        ["linear", "直線偏光"], ["right", "円偏光（V / I = +1）"], ["left", "円偏光（V / I = −1）"], ["unpolarized", "無偏光"]
      ] }), makeField("polAngle", { hint: "偏光の0°はベンチ面に垂直な方向。配置角度とは別です。" }));
    } else {
      fields.append(makeField("aperture", { hint: "この幅の外側を通る光線は部品に当たりません。" }));
      if (e.type === "lens" || e.type === "objective") fields.append(makeField("focal", { hint: "正＝集光、負＝発散。|f| ≥ " + display(1) + " " + scene.unit + "。近軸薄レンズモデル。" }));
      if (e.type === "iris") fields.append(makeField("opening", { range: true, hint: "0で閉鎖。開口内だけ光が通ります。" }));
      if (e.type === "polarizer" || e.type === "waveplate") {
        fields.append(makeField("axisAngle", { title: e.type === "polarizer" ? "透過軸の角度" : "速軸の角度", hint: "偏光空間での軸。配置角度とは独立です。" }));
        if (e.type === "waveplate") fields.append(makeField("designWavelength", { hint: "設計波長で位相差π/2。その他は波長に反比例する理想モデル。" }));
      }
      if (e.type === "dichroic") fields.append(makeField("cutoff"), makeField("mode", { choices: [
        ["longpass", "長波長を透過（LP）"], ["shortpass", "短波長を透過（SP）"]
      ], hint: "反対側の波長は反射。境界で完全に切り替わる理想特性。" }));
      if (e.type === "objective" || e.type === "fiber") {
        if (e.type === "fiber") fields.append(makeField("coreDiameter"));
        fields.append(makeField("na", { hint: e.type === "fiber" ? "コア位置と空気中の入射角で判定。モード結合効率は未計算。" : "空気中の受入角制限。高NAの厳密な結像は未計算。" }));
      }
      if (e.type === "splitter") fields.append(makeField("transmission", { range: true, hint: "0〜1。反射率は1−T。位相差・干渉は未計算。" }));
      if (e.type === "screen") fields.append(node("p", "param-note", "入射光を吸収して相対パワー・受光幅・偏光を読み出します。"));
      if (e.type === "blocker") fields.append(node("p", "param-note", "部品径の範囲に当たった光線を止めます。"));
    }
  }
  function syncInspector(force = false) {
    const e = selected(), key = e ? e.id + ":" + e.type + ":" + scene.unit : "empty";
    if (force || key !== inspectorKey) { inspectorKey = key; buildInspector(e); $("input-error").textContent = ""; }
    $("properties").hidden = !e; $("empty-selection").hidden = Boolean(e);
    $("selected-kind").textContent = e ? O.TYPES[e.type].short : "";
    updateOptions();
    if (!e) return;
    for (const input of $("parameter-fields").querySelectorAll("[data-key]")) {
      const k = input.dataset.key; configureInput(input, e);
      if (document.activeElement === input || input.hasAttribute("aria-invalid")) continue;
      if (input.type === "checkbox") input.checked = e[k];
      else input.value = String(lengths.has(k) ? display(e[k]) : typeof e[k] === "number" ? num(e[k]) : e[k]);
    }
    if ($("selected-wavelength-color")) $("selected-wavelength-color").style.background = O.wavelengthColor(e.wavelength);
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
    if (["label", "polarization", "mode"].includes(key)) return input.value;
    let value = Number(input.value);
    if (input.value.trim() === "" || !Number.isFinite(value)) throw new Error((names[key] || key) + "を数値で入力してください。");
    if (lengths.has(key)) value = S.fromDisplay(value, scene.unit);
    const limits = bounds(key, e);
    if (value < limits.min - 1e-7 || value > limits.max + 1e-7 || key === "rayCount" && !Number.isInteger(value)) {
      throw new Error((names[key] || key) + "は " + input.min + "〜" + input.max + (key === "rayCount" ? " の整数" : " の数値") + "を入力してください。");
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
      const candidate = { ...e, [key]: readField(input, e) };
      if (key === "aperture" && e.type === "iris" && candidate.aperture < e.opening) throw new Error("部品径は開口直径以上にしてください。");
      if (key === "aperture" && e.type === "fiber" && candidate.aperture < e.coreDiameter) throw new Error("部品径はコア直径以上にしてください。");
      scene = S.validateScene({ ...scene, elements: scene.elements.map(item => item.id === e.id ? candidate : item) });
      clearInputError(input); markEdited(); syncInspector(); requestRender(); return true;
    } catch (error) { setInputError(input, error.message); return false; }
  }
  function select(id, focus = false) {
    checkpoint(); selectedId = scene.elements.some(e => e.id === id) ? id : null;
    history[historyIndex].selectedId = selectedId;
    syncInspector(); render(); if (focus && selectedId !== null) view.focus(selectedId);
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
      swatch.style.background = O.wavelengthColor(e.wavelength); swatch.setAttribute("aria-hidden", "true");
      const button = node("button", "", label(e)); button.type = "button"; button.dataset.select = String(e.id);
      row.append(swatch, button, node("span", "source-details", e.wavelength + " nm · " + (e.enabled ? "P " + power(e.power) : "OFF")));
      return row;
    });
    $("source-readout").replaceChildren(...(sourceRows.length ? sourceRows : [node("p", "subtle", "光源を配置してください。")]));
    const detectors = scene.elements.filter(e => e.type === "fiber" || e.type === "screen");
    const table = node("table", "detector-table"), head = node("thead"), tr = node("tr");
    ["部品", "相対P", "受光線", "幅 " + scene.unit].forEach(t => tr.append(node("th", "", t))); head.append(tr); table.append(head);
    const body = node("tbody");
    for (const e of detectors) {
      const d = result.detectors.find(item => item.id === e.id), row = node("tr"), cell = node("td");
      const b = node("button", "", label(e)); b.type = "button"; b.dataset.select = String(e.id); cell.append(b);
      row.append(cell, node("td", "", e.enabled ? power(d?.power || 0) : "OFF"),
        node("td", "", String(d?.acceptedHits || 0)), node("td", "", d?.acceptedHits ? String(num(S.toDisplay(d.span, scene.unit), 4)) : "—"));
      body.append(row);
    }
    table.append(body);
    $("detector-readout").replaceChildren(detectors.length ? table : node("p", "subtle", "スクリーンやファイバーを光路に置くと受光を確認できます。"));
    const e = selected(), output = $("selected-output"); output.replaceChildren();
    if (!e) return;
    if (isSource(e)) {
      output.append(node("strong", "", "光源の設定偏光"), node("p", "stokes", stokesText(O.sourceStokes(e))));
    } else {
      const d = result.detectors.find(item => item.id === e.id);
      if (e.type === "fiber" || e.type === "screen") {
        output.append(node("strong", "", e.enabled ? "検出結果" : "無効の部品"),
          node("p", "", "受光 P = " + power(d?.power || 0) + " / 入射 P = " + power(d?.incidentPower || 0)),
          node("p", "", "受光線 " + (d?.acceptedHits || 0) + " 本 / 入射線 " + (d?.hits || 0) + " 本"),
          node("p", "stokes", stokesText(d?.stokes)));
        if (d?.acceptedHits) {
          output.append(node("p", "", "重心 X " + display(d.centroid.x) + " / Y " + display(d.centroid.y) + " " + scene.unit));
          for (const [wavelength, p] of Object.entries(d.powerByWavelength || {})) output.append(node("p", "", wavelength + " nm : P " + power(p)));
        }
      } else if (["polarizer", "waveplate"].includes(e.type)) output.append(node("p", "", "偏光変化は光路先の検出器でQ/I・U/I・V/Iを確認できます。"));
    }
  }
  function render() {
    result = O.simulate(scene.elements);
    view.draw(scene, selectedId, result, $("show-labels").checked);
    if (pending && (pending.kind === "move" || pending.kind === "rotate")) {
      bench.querySelector('[data-element-id="' + pending.id + '"]')?.classList.add("is-dragging");
    }
    updateOptions(); renderReadouts();
    $("element-count").textContent = String(scene.elements.length);
    $("ray-stats").textContent = result.rayCount + " rays · " + result.segments.length + " segments";
    for (const button of document.querySelectorAll("[data-add]")) button.disabled = scene.elements.length >= O.MAX_ELEMENTS;
    $("trace-warning").hidden = !result.warnings.length;
    $("trace-warning").textContent = result.warnings.join(" ");
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
    scene.elements.push(e); selectedId = e.id; markEdited(); checkpoint(); syncInspector(); render(); view.focus(e.id);
    announce(label(e) + "を X " + display(e.x) + " / Y " + display(e.y) + " " + scene.unit + " に配置しました。");
  }
  function deleteSelected() {
    finishInteraction(true); checkpoint();
    const e = selected(); if (!e) return;
    scene.elements = scene.elements.filter(item => item.id !== e.id); selectedId = scene.elements.at(-1)?.id ?? null;
    markEdited(); checkpoint(); syncInspector(); render();
    if (selectedId !== null) view.focus(selectedId); else bench.focus({ preventScroll: true });
    announce(label(e) + "を削除しました。「戻す」で復元できます。");
  }
  function duplicateSelected() {
    checkpoint(); const e = selected(); if (!e || scene.elements.length >= O.MAX_ELEMENTS) return;
    const delta = Math.max(scene.gridStep, 25);
    const at = V.place(e.x + (e.x + delta > O.WIDTH - O.MARGIN ? -delta : delta),
      e.y + (e.y + delta > O.HEIGHT - O.MARGIN ? -delta : delta), scene.gridStep, scene.snap);
    const copy = { ...e, ...at, id: allocateId(), label: e.label ? e.label.slice(0, 96) + " 複製" : "" };
    scene.elements.push(copy); selectedId = copy.id; markEdited(); checkpoint(); syncInspector(); render(); view.focus(copy.id);
    announce(label(copy) + "を複製しました。");
  }
  function rotateSelected(delta = 22.5) {
    checkpoint(); const e = selected(); if (!e) return;
    e.angle = O.normalizeAngle(e.angle + delta); markEdited(); checkpoint(); syncInspector(); render();
    announce("配置角度を " + num(e.angle) + "° にしました。");
  }
  function replaceScene(next, presetId = null) {
    finishInteraction(true); checkpoint();
    scene = S.validateScene(next); selectedId = scene.elements.find(e => e.type === "lens")?.id ?? scene.elements[0]?.id ?? null;
    activePresetId = presetId; edited = false; checkpoint(); syncControls(); syncInspector(true); view.fit(); render();
  }

  const groups = [
    ["光源", ["laser", "point"]],
    ["光路", ["mirror", "lens", "objective", "iris", "dichroic", "splitter"]],
    ["偏光", ["polarizer", "waveplate"]],
    ["検出・終端", ["fiber", "screen", "blocker"]]
  ];
  for (const [heading, types] of groups) {
    const group = node("div", "palette-group"); group.append(node("h3", "", heading));
    for (const type of types) {
      const button = node("button", "part-button"); button.type = "button"; button.dataset.add = type;
      button.title = O.TYPES[type].label + "をドラッグで配置";
      const symbol = node("span", "part-symbol", V.symbols[type]); symbol.setAttribute("aria-hidden", "true");
      button.append(symbol, node("span", "", O.TYPES[type].label)); group.append(button);
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
      applyField(input); return;
    }
    if (p.kind === "pan") {
      const previous = view.point({ clientX: p.lastX, clientY: p.lastY }), current = view.point(event), v = view.getView();
      view.setView({ ...v, x: v.x - (current.x - previous.x), y: v.y - (current.y - previous.y) });
      p.lastX = event.clientX; p.lastY = event.clientY; return;
    }
    if (!p.moved && Math.hypot(event.clientX - p.startX, event.clientY - p.startY) < 4) return;
    p.moved = true;
    const point = view.point(event);
    if (p.kind === "place") {
      p.inside = view.inside(event); p.point = V.place(point.x, point.y, scene.gridStep, scene.snap);
      view.preview(p.inside ? { ...O.createElement(p.type, 1, p.point.x, p.point.y), ...p.point, label: "ここに配置" } : null);
      $("placement-cursor").hidden = p.inside;
      $("placement-cursor").style.left = event.clientX + 14 + "px"; $("placement-cursor").style.top = event.clientY + 14 + "px";
      bench.classList.toggle("accepting-drop", p.inside); return;
    }
    const e = scene.elements.find(item => item.id === p.id);
    if (!e) return;
    if (p.kind === "move") Object.assign(e, V.place(point.x - p.offsetX, point.y - p.offsetY, scene.gridStep, scene.snap));
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
    } else if (p.kind === "range") {
      if (cancel) { scene = S.parse(p.before); edited = p.edited; }
      checkpoint(); syncInspector(cancel); render();
    } else if (p.kind === "pan") {
      bench.classList.remove("is-panning"); if (cancel) view.setView(p.view);
    } else {
      const e = scene.elements.find(item => item.id === p.id);
      if (e && cancel) Object.assign(e, p.before);
      if (!cancel && p.moved) { markEdited(); checkpoint(); }
      syncInspector(); render();
      if (p.moved) announce(cancel ? "操作を取り消しました。" : p.kind === "move" ?
        label(e) + "を X " + display(e.x) + " / Y " + display(e.y) + " " + scene.unit + " に移動しました。" : "配置角度を " + num(e.angle) + "° にしました。");
    }
  }
  bench.addEventListener("pointerdown", event => {
    if (event.button !== 0 || event.isPrimary === false || pending) return;
    event.preventDefault(); checkpoint();
    const target = event.target.closest("[data-element-id]");
    if (target) {
      const id = Number(target.dataset.elementId); select(id); view.focus(id);
      const e = selected(), p = view.point(event);
      pending = { kind: event.target.closest("[data-rotate]") ? "rotate" : "move", id, owner: bench, pointerId: event.pointerId,
        startX: event.clientX, startY: event.clientY, moved: false, offsetX: p.x - e.x, offsetY: p.y - e.y, before: { x: e.x, y: e.y, angle: e.angle } };
    } else {
      bench.focus({ preventScroll: true });
      pending = { kind: "pan", owner: bench, pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY, view: view.getView() };
      bench.classList.add("is-panning");
    }
    bench.setPointerCapture(event.pointerId);
  });
  // Document listeners cover pointer drivers that do not retain SVG capture.
  document.addEventListener("pointermove", updateInteraction);
  document.addEventListener("pointerup", event => { if (event.pointerId === pending?.pointerId) { updateInteraction(event); finishInteraction(); } });
  document.addEventListener("pointercancel", event => { if (event.pointerId === pending?.pointerId) finishInteraction(true); });
  bench.addEventListener("lostpointercapture", () => { if (pending?.owner === bench) finishInteraction(true); });
  window.addEventListener("blur", () => finishInteraction(true));
  bench.addEventListener("focusin", event => {
    const target = event.target.closest("[data-element-id]");
    if (target && Number(target.dataset.elementId) !== selectedId) select(Number(target.dataset.elementId));
  });
  bench.addEventListener("wheel", event => {
    if (!event.shiftKey || pending) return;
    event.preventDefault();
    const delta = event.deltaY || event.deltaX;
    if (delta) view.zoom(Math.max(.3, Math.min(3, Math.exp(-delta * .0015))), view.point(event));
  }, { passive: false });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && pending) { event.preventDefault(); finishInteraction(true); return; }
    if (event.target.closest("input,select,textarea,[contenteditable]")) return;
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === "z") { event.preventDefault(); undo(event.shiftKey ? 1 : -1); return; }
    if ((event.ctrlKey || event.metaKey) && key === "d") { event.preventDefault(); duplicateSelected(); return; }
    if (event.ctrlKey || event.metaKey || event.altKey || pending || !bench.contains(event.target)) return;
    const e = selected(); if (!e) return;
    const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (moves[event.key]) {
      event.preventDefault(); checkpoint();
      const [dx, dy] = moves[event.key];
      Object.assign(e, V.nudge(e, dx, dy, scene.gridStep, scene.snap, event.shiftKey ? 10 : 1));
      markEdited(); checkpoint(); syncInspector(); render();
      announce("X " + display(e.x) + " / Y " + display(e.y) + " " + scene.unit);
    } else if (key === "r") { event.preventDefault(); rotateSelected(event.shiftKey ? -22.5 : 22.5); }
    else if (["Delete", "Backspace"].includes(event.key)) { event.preventDefault(); deleteSelected(); }
    else if (["Enter", " "].includes(event.key)) { event.preventDefault(); announce(label(e) + "を選択中。矢印キーで移動できます。"); }
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
    if (applyField(event.target)) {
      const input = event.target, e = selected(), k = input.dataset.key;
      if (input.type !== "checkbox") input.value = String(lengths.has(k) ? display(e[k]) : e[k]);
      checkpoint();
    }
  });
  $("parameter-fields").addEventListener("focusout", () => checkpoint());
  $("parameter-fields").addEventListener("click", event => {
    if (event.target.type === "range") { event.preventDefault(); return; }
    const b = event.target.closest("[data-wavelength]"); if (!b) return;
    checkpoint(); const input = fieldByKey("wavelength"); input.value = b.dataset.wavelength;
    if (applyField(input)) { checkpoint(); syncInspector(); }
  });
  $("element-select").addEventListener("change", event => select(Number(event.target.value)));
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
  window.addEventListener("resize", () => { if (result) view.draw(scene, selectedId, result, $("show-labels").checked); });
  checkpoint(); syncControls(); syncInspector(); render();
})();
