(function () {
  "use strict";

  const SAMPLE_URL = "./data/materials-sample.json";
  const MAX_SAMPLE_CHARS = 16000000;
  const MAX_SAMPLE_RECORDS = 80000;
  const PAGE_SIZE = 100;
  const LOAD_TIMEOUT_MS = 15000;
  // Display order for the elements in this sample (e.g. SiC, GaN, SiO₂).
  // Formula labels describe composition, not a particular crystal phase.
  // Display convention only, not a phase/mineral name. Preserve the relative
  // order used for the original 12 elements; put added metals before anions.
  const FORMULA_ELEMENT_ORDER = ("Cs Rb K Na Li Ba Sr Ca Mg Be La Pr Nd Sm Eu Gd Tb Dy Ho Er Tm Yb Lu " +
    "Y Sc Ti Zr Hf V Nb Ta Cr Mo W Mn Re Fe Ru Os Co Rh Ir Ni Pd Pt Cu Ag Au Cd Hg " +
    "Al Zn Ga In Tl Sn Pb Bi Si Ge B As Sb Te P H C Se S N O He Ne Kr Xe F Cl Br I").split(" ");
  // Independent of the single-element isotope selector above this calculator.
  const MATERIAL_PERIODIC_ROWS = [
    "H . . . . . . . . . . . . . . . . He",
    "Li Be . . . . . . . . . . B C N O F Ne",
    "Na Mg . . . . . . . . . . Al Si P S Cl Ar",
    "K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr",
    "Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe",
    "Cs Ba 57–71 Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn",
    "Fr Ra 89–103 Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og",
    ". . La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu .",
    ". . Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr .",
  ].map((row) => row.split(" "));

  function normalizeMaterialId(value) {
    if (typeof value !== "string" || value.length > 40) return null;
    const id = value.trim().toLowerCase();
    return /^mp-[1-9]\d{0,11}$/.test(id) ? id : null;
  }

  function validateSnapshot(snapshot) {
    if (!snapshot || snapshot.schema_version !== 1 || snapshot.number_density_unit !== "cm^-3" ||
        snapshot.composition_basis !== "reduced atom counts" || !Array.isArray(snapshot.materials) ||
        snapshot.materials.length === 0 || snapshot.materials.length > MAX_SAMPLE_RECORDS || snapshot.count !== snapshot.materials.length) {
      throw new Error("The saved sample has an unsupported format or count.");
    }
    const index = new Map();
    for (const material of snapshot.materials) {
      if (!material || typeof material.id !== "string" || normalizeMaterialId(material.id) !== material.id || index.has(material.id) ||
          !Number.isFinite(material.number_density_cm3) || material.number_density_cm3 <= 0 ||
          !material.composition || typeof material.composition !== "object" || Array.isArray(material.composition)) {
        throw new Error("The saved sample contains an invalid or duplicate material.");
      }
      const entries = Object.entries(material.composition);
      if (entries.length === 0 || entries.some(([element, count]) =>
        !/^[A-Z][a-z]?$/.test(element) || !Number.isSafeInteger(count) || count <= 0 || count > 20000)) {
        throw new Error("The saved sample contains an invalid composition.");
      }
      index.set(material.id, material);
    }
    return index;
  }

  function compositionLabel(composition) {
    return Object.entries(composition).map(([element, count]) => `${element}:${count}`).join(" / ");
  }

  function materialFormula(composition) {
    const entries = Object.entries(composition);
    const knownElements = entries.every(([element]) => FORMULA_ELEMENT_ORDER.includes(element));
    entries.sort(([a], [b]) => knownElements
      ? FORMULA_ELEMENT_ORDER.indexOf(a) - FORMULA_ELEMENT_ORDER.indexOf(b)
      : a.localeCompare(b));
    return entries.map(([element, count]) => element + (count === 1 ? "" :
      String(count).replace(/\d/g, (digit) => "₀₁₂₃₄₅₆₇₈₉"[Number(digit)]))).join("");
  }

  function filterMaterials(materials, selectedElements) {
    const required = [...selectedElements];
    return [...materials].filter((material) => required.every((element) =>
      Object.hasOwn(material.composition, element) && material.composition[element] > 0));
  }

  function normalizeSearch(value) {
    return String(value).normalize("NFKC").toLowerCase().replace(/\s+/g, "");
  }

  function calculateSavedMaterial(material, model) {
    const total = Object.values(material.composition).reduce((sum, count) => sum + count, 0);
    const fractions = Object.fromEntries(Object.entries(material.composition).map(([e, count]) => [e, count / total]));
    const result = model(fractions, material.number_density_cm3);
    // Never display a partial calculation as the full material's T2.
    if (!result || result.missingElements?.length || !Number.isFinite(result.t2Seconds) || result.t2Seconds <= 0) {
      throw new Error("This material does not have sufficient usable isotope data for this scaling estimate.");
    }
    return result;
  }

  function createSearchUi({ document: doc, fetcher, model, formatTime }) {
    const ids = ["mp-form", "mp-id", "mp-sample-select", "mp-calculate", "mp-status", "mp-output", "mp-material-name", "mp-result", "mp-meta", "mp-material-link", "mp-periodic-table", "mp-clear-elements", "mp-filter-summary", "mp-sample-info", "mp-search", "mp-page-prev", "mp-page-next", "mp-page-summary"];
    const nodes = ids.map((id) => doc.getElementById(id));
    if (nodes.some((node) => !node)) return null;
    const [form, input, select, button, status, output, nameEl, resultEl, metaEl, link, elementTable, clearElements, filterSummary, sampleInfo, search, previousPage, nextPage, pageSummary] = nodes;
    let index = null;
    let snapshot = null;
    let busy = false;
    let visibleIds = new Set();
    let matches = [];
    let pageIndex = 0;
    const formulaLabels = new Map();
    const searchLabels = new Map();
    const selectedElements = new Set();
    const elementCounts = new Map();
    const matchingElementCounts = new Map();
    const elementButtons = new Map();

    function clearResult() {
      output.hidden = true;
      nameEl.textContent = "";
      resultEl.textContent = "";
      metaEl.textContent = "";
      link.removeAttribute("href");
      status.classList.remove("error");
    }

    function setBusy(value) {
      busy = value;
      form.setAttribute("aria-busy", String(value));
      updateControls();
    }

    function updateControls() {
      input.disabled = busy;
      button.disabled = busy;
      select.disabled = busy || !index || visibleIds.size === 0;
      clearElements.disabled = busy || !index || selectedElements.size === 0;
      search.disabled = busy || !index;
      previousPage.disabled = busy || pageIndex === 0;
      nextPage.disabled = busy || (pageIndex + 1) * PAGE_SIZE >= matches.length;
      for (const [symbol, cell] of elementButtons) {
        const selected = selectedElements.has(symbol);
        const count = matchingElementCounts.get(symbol) || 0;
        cell.disabled = busy || !index || (!selected && count === 0);
        cell.setAttribute("aria-pressed", String(selected));
        const countLabel = `${count} matching material${count === 1 ? "" : "s"}`;
        const label = !index ? `${symbol}: sample not loaded`
          : selected ? `${symbol}: selected; ${countLabel}. Click to deselect.`
          : count ? `${symbol}: ${countLabel}`
          : elementCounts.has(symbol) ? `${symbol}: no matching materials with the current filters`
          : `${symbol}: not included in this sample`;
        cell.setAttribute("aria-label", label);
        cell.title = label;
      }
    }

    function syncSelectedId() {
      const id = normalizeMaterialId(input.value);
      select.value = visibleIds.has(id) ? id : "";
    }

    function renderPage() {
      const start = pageIndex * PAGE_SIZE;
      const page = matches.slice(start, start + PAGE_SIZE);
      visibleIds = new Set(page.map((material) => material.id));
      select.replaceChildren();
      const placeholder = doc.createElement("option");
      placeholder.value = "";
      placeholder.textContent = !index ? "Load the local sample first" : matches.length
        ? "Choose a material"
        : "No matching materials in this sample";
      select.appendChild(placeholder);
      for (const material of page) {
        const option = doc.createElement("option");
        option.value = material.id;
        option.textContent = `${formulaLabels.get(material.id)} — ${material.id}`;
        select.appendChild(option);
      }
      pageSummary.textContent = matches.length
        ? `${start + 1}–${start + page.length} of ${matches.length} matches · Page ${pageIndex + 1} of ${Math.ceil(matches.length / PAGE_SIZE)}`
        : "0 matching materials";
      syncSelectedId();
      updateControls();
    }

    function renderMatches() {
      sampleInfo.textContent = (index ? `${index.size}-material local sample.` : "Local material sample.") +
        " No API key or live Materials Project request is needed.";
      const query = normalizeSearch(search.value).slice(0, 80);
      matches = index ? filterMaterials(index.values(), selectedElements).filter((material) =>
        !query || material.id.includes(query) || searchLabels.get(material.id).includes(query)) : [];
      // Count across all matching pages, not just the visible dropdown options.
      // A present element can be added without making the intersection empty.
      matchingElementCounts.clear();
      for (const material of matches) {
        for (const symbol of Object.keys(material.composition)) {
          matchingElementCounts.set(symbol, (matchingElementCounts.get(symbol) || 0) + 1);
        }
      }
      pageIndex = 0;
      const selection = [...selectedElements].join(" + ");
      filterSummary.textContent = !index ? "Load the local sample to use element filters." : selectedElements.size || query
        ? `${selectedElements.size ? `Selected: ${selection}` : "All elements"}${query ? ` · Search: ${search.value.trim().slice(0, 80)}` : ""} · ${matches.length} of ${index.size} saved materials match.${matches.length ? "" : " No match in this sample; change the search or clear elements."}`
        : `All ${index.size} saved materials · no element filter.`;
      renderPage();
    }

    function applyElementFilter() {
      clearResult();
      renderMatches();
      status.textContent = sampleStatus();
    }

    function buildElementTable() {
      elementTable.replaceChildren();
      MATERIAL_PERIODIC_ROWS.forEach((row, rowIndex) => row.forEach((symbol, columnIndex) => {
        const isElement = /^[A-Z][a-z]?$/.test(symbol);
        const cell = doc.createElement(isElement ? "button" : "span");
        cell.style.gridRow = String(rowIndex + 1);
        cell.style.gridColumn = String(columnIndex + 1);
        if (rowIndex >= 7) cell.classList.add("mp-f-block");
        if (isElement) {
          cell.type = "button";
          cell.classList.add("mp-element");
          cell.textContent = symbol;
          cell.dataset.element = symbol;
          cell.setAttribute("aria-controls", "mp-sample-select");
          cell.addEventListener("click", () => {
            if (busy || !index || (!selectedElements.has(symbol) && !matchingElementCounts.has(symbol))) return;
            if (selectedElements.has(symbol)) selectedElements.delete(symbol);
            else selectedElements.add(symbol);
            applyElementFilter();
          });
          elementButtons.set(symbol, cell);
        } else {
          cell.classList.add("mp-element-spacer");
          cell.textContent = symbol === "." ? "" : symbol;
          cell.setAttribute("aria-hidden", "true");
        }
        elementTable.appendChild(cell);
      }));
    }

    function sampleStatus() {
      const retrieved = snapshot?.source?.retrieved_at;
      const date = typeof retrieved === "string" && /^\d{4}-\d{2}-\d{2}T/.test(retrieved) ? retrieved.slice(0, 10) : "unknown";
      return `${index.size} saved materials · retrieved ${date} · no live Materials Project request`;
    }

    function showError(error) {
      clearResult();
      status.classList.add("error");
      status.textContent = error instanceof Error ? error.message : "The calculation failed. Please retry.";
    }

    async function ensureSample() {
      if (index) return;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS);
      try {
        const response = await fetcher(SAMPLE_URL, {
          signal: controller.signal,
          credentials: "same-origin",
          mode: "same-origin",
        });
        if (!response.ok) throw new Error(`Local sample could not be loaded (HTTP ${response.status}). Press Calculate to retry.`);
        const text = await response.text();
        if (text.length > MAX_SAMPLE_CHARS) throw new Error("The saved sample is unexpectedly large.");
        const candidate = JSON.parse(text);
        const candidateIndex = validateSnapshot(candidate);
        snapshot = candidate;
        index = candidateIndex;
        elementCounts.clear();
        formulaLabels.clear();
        searchLabels.clear();
        for (const material of index.values()) {
          const formula = materialFormula(material.composition);
          formulaLabels.set(material.id, formula);
          searchLabels.set(material.id, normalizeSearch(formula));
          for (const symbol of Object.keys(material.composition)) {
            elementCounts.set(symbol, (elementCounts.get(symbol) || 0) + 1);
          }
        }
        renderMatches();
      } catch (error) {
        index = null;
        snapshot = null;
        elementCounts.clear();
        renderMatches();
        if (error.name === "AbortError") throw new Error("Loading the local sample timed out. Press Calculate to retry.");
        if (error instanceof SyntaxError) throw new Error("The saved sample is not valid JSON. Please reload the page.");
        if (error instanceof TypeError) throw new Error("Cannot read the local sample. Open this page through HTTP(S), check the connection, and press Calculate to retry.");
        throw error;
      } finally {
        clearTimeout(timer);
      }
    }

    async function run(event) {
      if (event) event.preventDefault();
      if (busy) return;
      clearResult();
      const id = normalizeMaterialId(input.value);
      if (!id) {
        showError(new Error("Enter a Materials Project ID such as mp-8062."));
        return;
      }
      input.value = id;
      setBusy(true);
      status.textContent = "Reading the saved material…";
      try {
        await ensureSample();
        const material = index.get(id);
        if (!material) {
          select.value = "";
          throw new Error(`${id} is not included in this ${index.size}-material sample. This does not mean it is absent from Materials Project. Choose a saved ID or use the CIF/JSON input below.`);
        }
        const result = calculateSavedMaterial(material, model);
        // Direct ID lookup searches the whole sample, even with an active filter.
        const filtersCleared = !matches.some((item) => item.id === id);
        if (filtersCleared) {
          selectedElements.clear();
          search.value = "";
          renderMatches();
        }
        pageIndex = Math.floor(matches.findIndex((item) => item.id === id) / PAGE_SIZE);
        renderPage();
        select.value = id;
        nameEl.textContent = `${materialFormula(material.composition)} — ${id}`;
        resultEl.textContent = `Estimated natural-abundance T₂ = ${formatTime(result.t2Seconds)}`;
        metaEl.textContent = `Material: ${id} | composition (atom ratio): ${compositionLabel(material.composition)} | n = ${material.number_density_cm3.toExponential(6)} cm⁻³ | spinful isotope fraction = ${(result.coverage * 100).toFixed(3)}%`;
        link.href = `https://materialsproject.org/materials/${id}`;
        output.hidden = false;
        status.textContent = (filtersCleared ? "Search filters cleared for this ID lookup. " : "") + sampleStatus();
      } catch (error) {
        showError(error);
      } finally {
        setBusy(false);
      }
    }

    form.addEventListener("submit", run);
    input.addEventListener("input", () => {
      clearResult();
      syncSelectedId();
      status.textContent = index ? sampleStatus() : "Press Calculate to retry loading the local sample.";
    });
    select.addEventListener("change", () => {
      clearResult();
      if (select.value) {
        input.value = select.value;
        void run();
      } else {
        status.textContent = index ? sampleStatus() : "Choose a saved material.";
      }
    });
    clearElements.addEventListener("click", () => {
      if (busy || !index) return;
      selectedElements.clear();
      applyElementFilter();
    });
    search.addEventListener("input", () => {
      if (!busy && index) applyElementFilter();
    });
    // Enter in the filter field must not submit an unrelated direct ID.
    search.addEventListener("keydown", (event) => {
      if (event.key === "Enter") event.preventDefault();
    });
    for (const [control, delta] of [[previousPage, -1], [nextPage, 1]]) {
      control.addEventListener("click", () => {
        if (busy || !index) return;
        const target = pageIndex + delta;
        if (target < 0 || target * PAGE_SIZE >= matches.length) return;
        pageIndex = target;
        renderPage();
      });
    }
    buildElementTable();
    const ready = (async () => {
      setBusy(true);
      try {
        await ensureSample();
        status.textContent = sampleStatus();
      } catch (error) {
        showError(error);
      } finally {
        setBusy(false);
      }
    })();
    return { ready, run };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { normalizeMaterialId, validateSnapshot, compositionLabel, materialFormula, filterMaterials, calculateSavedMaterial, createSearchUi, normalizeSearch, MAX_SAMPLE_RECORDS, MAX_SAMPLE_CHARS, PAGE_SIZE };
  } else if (typeof document !== "undefined") {
    createSearchUi({
      document,
      fetcher: window.fetch.bind(window),
      model: computeNaturalAbundanceT2ForComposition,
      formatTime: formatTimeValue,
    });
  }
})();
