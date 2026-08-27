"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { cellVolume, extractMaterial, SEED_IDS, ELEMENTS } = require("./build-t2-materials-sample.cjs");
const { normalizeMaterialId, validateSnapshot, materialFormula, filterMaterials, calculateSavedMaterial, createSearchUi, PAGE_SIZE, MAX_SAMPLE_CHARS, MAX_SAMPLE_RECORDS } = require("../t2-lab/materials.js");
const { loadModel, verifySnapshot } = require("./t2-model-validation.cjs");

const root = path.resolve(__dirname, "..");
// Candidate snapshots can be checked before replacing the currently served data.
const snapshotPath = process.env.T2_MATERIALS_SNAPSHOT || path.join(root, "t2-lab/data/materials-sample.json");
const expectedCount = Number(process.env.T2_MATERIALS_EXPECTED_COUNT || 80000);
const snapshotText = fs.readFileSync(snapshotPath, "utf8");
const snapshot = JSON.parse(snapshotText);
const sampleCount = snapshot.count;
const matchingCount = (...elements) => snapshot.materials.filter((m) => elements.every((e) => m.composition[e] > 0)).length;
const siCCount = matchingCount("Si", "C");
const gaNCount = matchingCount("Ga", "N");
const legacySource = fs.readFileSync(path.join(root, "t2-lab/script.js"), "utf8");
const lookupSource = fs.readFileSync(path.join(root, "t2-lab/materials.js"), "utf8");
const pageSource = fs.readFileSync(path.join(root, "t2-lab/index.html"), "utf8");
const clone = (value) => JSON.parse(JSON.stringify(value));
const settle = () => new Promise((resolve) => setImmediate(resolve));

// A small DOM test double, not a browser. Execute the entire existing script
// so tests exercise the production isotope table and file-calculation model.
class Element {
  constructor(tag = "div") {
    this.tagName = tag;
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.style = {};
    this.dataset = {};
    this.value = "";
    this.hidden = false;
    this.disabled = false;
    this.textContent = "";
    this.className = "";
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((n) => classes.add(n)),
      remove: (...names) => names.forEach((n) => classes.delete(n)),
      contains: (name) => classes.has(name),
      toggle: (name, force) => {
        const enabled = force === undefined ? !classes.has(name) : force;
        if (enabled) classes.add(name); else classes.delete(name);
        return enabled;
      },
    };
  }
  set innerHTML(value) { this.html = value; this.children = []; }
  get innerHTML() { return this.html || ""; }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); if (name === "href") delete this.href; }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
  async dispatch(type, properties = {}) {
    let prevented = false;
    await Promise.all((this.listeners.get(type) || []).map((handler) => handler({
      target: this, ...properties, preventDefault() { prevented = true; },
    })));
    return prevented;
  }
  querySelectorAll(selector) {
    const descendants = this.children.flatMap((child) => [child, ...child.querySelectorAll(selector)]);
    return descendants.filter((child) => selector.startsWith(".") && child.className.split(" ").includes(selector.slice(1)));
  }
  querySelector() { return new Element("button"); }
}

function documentDouble() {
  const nodes = new Map([...pageSource.matchAll(/\bid="([^"]+)"/g)].map((m) => [m[1], new Element()]));
  nodes.get("mp-id").value = "mp-8062";
  nodes.get("density").value = "1";
  nodes.get("mp-output").hidden = true;
  return {
    nodes,
    getElementById: (id) => nodes.get(id) || null,
    createElement: (tag) => new Element(tag),
    querySelectorAll: (selector) => [...nodes.values()].flatMap((node) => node.querySelectorAll(selector)),
  };
}

function legacyContext(doc = documentDouble(), fetcher = async () => { throw new Error("Unexpected fetch"); }) {
  const context = vm.createContext({
    document: doc, window: { fetch: fetcher }, location: { pathname: "/t2-lab/" },
    console: { log() {} }, setTimeout, clearTimeout, AbortController,
  });
  vm.runInContext(legacySource, context, { filename: "t2-lab/script.js" });
  return context;
}

const modelContext = legacyContext();
const model = modelContext.computeNaturalAbundanceT2ForComposition;
const formatTime = modelContext.formatTimeValue;
const index = validateSnapshot(snapshot);

function structureFixture() {
  return {
    id: "mp-123", type: "structures", attributes: {
      elements: ["C", "Si"], nsites: 6, dimension_types: [1, 1, 1],
      lattice_vectors: [[3, 0, 0], [0, 4, 0], [0, 0, 5]],
      species: [
        { name: "C", chemical_symbols: ["C"], concentration: [1] },
        { name: "Si", chemical_symbols: ["Si"], concentration: [1] },
      ],
      species_at_sites: ["C", "Si", "C", "Si", "C", "Si"],
    },
  };
}

test("snapshot has the expected count of unique IDs and only the three per-record fields", () => {
  assert.equal(index.size, expectedCount);
  for (const id of SEED_IDS) assert.ok(index.has(id), id);
  for (const material of index.values()) {
    assert.deepEqual(Object.keys(material).sort(), ["composition", "id", "number_density_cm3"]);
    assert.ok(material.number_density_cm3 > 1e20 && material.number_density_cm3 < 1e25);
  }
  assert.ok(Buffer.byteLength(snapshotText) < 200 * sampleCount + 10000);
  assert.match(snapshot.source.endpoint, /^https:\/\/optimade\.materialsproject\.org\//);
  assert.ok(snapshot.source.queries.length >= 2);
  assert.ok(siCCount >= 3);
  assert.ok(gaNCount >= 3);
  if (sampleCount === 500) {
    assert.equal(snapshot.source.selection.retained_count, 100);
    assert.equal(snapshot.source.selection.added_count, 400);
    assert.equal(snapshot.materials.filter((m) => Object.keys(m.composition).length === 3).length, 200);
    assert.deepEqual(snapshot.source.retrieval_history.map((batch) => batch.total_count), [100, 500]);
  }
});

test("all saved records calculate with the unchanged file model", () => {
  for (const material of index.values()) {
    const result = calculateSavedMaterial(material, model);
    const fractions = modelContext.compositionToAtomicFractions(material.composition);
    const legacy = model(fractions, material.number_density_cm3);
    assert.equal(result.t2Seconds, legacy.t2Seconds, material.id);
    assert.equal(result.missingElements.length, 0, material.id);
    assert.ok(result.coverage > 0 && result.coverage <= 1, material.id);
  }
});

test("maintenance validation uses the same model and all allowed elements calculate", () => {
  const maintenanceModel = loadModel();
  assert.equal(ELEMENTS.length, 79);
  for (const element of ELEMENTS) {
    const material = { composition: { [element]: 1 }, number_density_cm3: 1e23 };
    assert.equal(calculateSavedMaterial(material, maintenanceModel).t2Seconds,
      calculateSavedMaterial(material, model).t2Seconds, element);
  }
  for (const material of snapshot.materials) {
    assert.equal(calculateSavedMaterial(material, maintenanceModel).t2Seconds,
      calculateSavedMaterial(material, model).t2Seconds, material.id);
  }
  const report = verifySnapshot(snapshot, snapshot, maintenanceModel);
  assert.equal(report.count, sampleCount);
  const altered = clone(snapshot);
  altered.materials[0].number_density_cm3 *= 2;
  assert.throws(() => verifySnapshot(altered, snapshot, maintenanceModel));
});

test("snapshot record and payload caps accommodate 80000 but remain bounded", () => {
  assert.equal(MAX_SAMPLE_RECORDS, 80000);
  assert.equal(MAX_SAMPLE_CHARS, 16000000);
  const oversized = { ...snapshot, count: MAX_SAMPLE_RECORDS + 1, materials: Array(MAX_SAMPLE_RECORDS + 1).fill(snapshot.materials[0]) };
  assert.throws(() => validateSnapshot(oversized));
});

test("material formulas use readable element order and subscripts without changing composition", () => {
  for (const [composition, expected] of [
    [{ C: 1, Si: 1 }, "SiC"],
    [{ N: 1, Ga: 1 }, "GaN"],
    [{ O: 2, Si: 1 }, "SiO₂"],
    [{ S: 1, Zn: 1 }, "ZnS"],
    [{ O: 3, Al: 2 }, "Al₂O₃"],
    [{ C: 3, B: 13 }, "B₁₃C₃"],
    [{ C: 1 }, "C"],
    [{ Xe: 1, F: 2 }, "XeF₂"],
    [{ Cl: 1, Na: 1 }, "NaCl"],
    [{ O: 3, Fe: 2 }, "Fe₂O₃"],
    [{ O: 2, Co: 1, Li: 1 }, "LiCoO₂"],
    [{ Xx: 1, Al: 1 }, "AlXx"], // Deterministic fallback for unknown elements.
  ]) {
    const original = JSON.stringify(composition);
    assert.equal(materialFormula(composition), expected);
    assert.equal(JSON.stringify(composition), original);
  }
});

test("element filters require every selection, independently of stoichiometry", () => {
  const original = JSON.stringify(snapshot);
  const elements = [...new Set(snapshot.materials.flatMap((material) => Object.keys(material.composition)))];
  for (const selection of [[], ...elements.map((e) => [e]),
    ...elements.flatMap((a) => elements.map((b) => [a, b])), ["Si", "C", "N"], ["Fe"]]) {
    const expected = snapshot.materials.filter((material) => selection.every((e) => material.composition[e] > 0));
    assert.deepEqual(filterMaterials(index.values(), new Set(selection)), expected, selection.join(" + "));
  }
  assert.equal(filterMaterials(index.values(), ["Si", "C"]).length, siCCount);
  const differentRatios = [
    { composition: { Si: 1, C: 1 } }, { composition: { Si: 3, C: 2 } },
    { composition: { Si: 1, C: 1, N: 2 } }, { composition: { Si: 1 } },
  ];
  assert.deepEqual(filterMaterials(differentRatios, ["Si", "C"]), differentRatios.slice(0, 3));
  assert.equal(JSON.stringify(snapshot), original);
});

test("SiC scaling agrees with a separate two-isotope calculation", () => {
  const material = index.get("mp-8062");
  const n = material.number_density_cm3;
  const tC = 1.5e18 * Math.abs(0.702369 / 0.5) ** -1.65 * 0.5 ** -1.09 / (n * 0.5 * 0.0106);
  const tSi = 1.5e18 * Math.abs(-0.555052 / 0.5) ** -1.65 * 0.5 ** -1.09 / (n * 0.5 * 0.04673);
  const expected = 1 / (1 / tC + 1 / tSi);
  assert.ok(Math.abs(calculateSavedMaterial(material, model).t2Seconds / expected - 1) < 1e-12);
  assert.equal(formatTime(expected), formatTime(model({ C: 0.5, Si: 0.5 }, n).t2Seconds));
});

test("density uses cell sites, not the reduced formula count, and is supercell-invariant", () => {
  const entry = structureFixture();
  const material = extractMaterial(entry);
  assert.deepEqual(material.composition, { C: 1, Si: 1 });
  assert.equal(material.number_density_cm3, 1e23);
  entry.attributes.lattice_vectors[0][0] *= 2;
  entry.attributes.nsites *= 2;
  entry.attributes.species_at_sites.push(...entry.attributes.species_at_sites);
  assert.equal(extractMaterial(entry).number_density_cm3, material.number_density_cm3);
});

test("volume supports nonorthogonal and left-handed cells", () => {
  assert.equal(cellVolume([[2, 0, 0], [1, 3, 0], [0.5, 1, 4]]), 24);
  assert.equal(cellVolume([[-2, 0, 0], [1, 3, 0], [0.5, 1, 4]]), 24);
  assert.throws(() => cellVolume([[0, 0, 0], [0, 1, 0], [0, 0, 1]]));
  assert.throws(() => cellVolume([[1, 0, null], [0, 1, 0], [0, 0, 1]]));
});

test("real SiC lattice vectors independently reproduce the saved density", () => {
  const volume = cellVolume([[2.66626621, 0, 1.5393685], [0.88875474, 2.51377858, 1.5393685], [0, 0, 3.078738]]);
  assert.ok(Math.abs(index.get("mp-8062").number_density_cm3 / (2 / volume * 1e24) - 1) < 1e-9);
});

for (const [name, mutate] of [
  ["partial occupancy", (a) => { a.species[0].concentration = [0.5]; }],
  ["disorder", (a) => { a.species[0].chemical_symbols = ["C", "Si"]; }],
  ["nonperiodic axis", (a) => { a.dimension_types = [1, 1, 0]; }],
  ["site-count mismatch", (a) => { a.nsites = 8; }],
  ["unknown species", (a) => { a.species_at_sites[0] = "unknown"; }],
  ["inconsistent elements", (a) => { a.elements = ["Si"]; }],
]) {
  test(`importer rejects ${name}`, () => {
    const entry = structureFixture();
    mutate(entry.attributes);
    assert.throws(() => extractMaterial(entry));
  });
}

test("ID validation handles whitespace/case and rejects malformed or untrusted input", () => {
  assert.equal(normalizeMaterialId(" MP-8062 "), "mp-8062");
  for (const value of ["", "8062", "mp-", "mp-0", "mp-1/../../", "<script>", "https://example.com/mp-149", null, 149]) {
    assert.equal(normalizeMaterialId(value), null, String(value));
  }
});

for (const [name, mutate] of [
  ["wrong units", (s) => { s.number_density_unit = "A^-3"; }],
  ["count mismatch", (s) => { s.count = 99; }],
  ["duplicate IDs", (s) => { s.materials[1].id = s.materials[0].id; }],
  ["null ID", (s) => { s.materials[0].id = null; }],
  ["string density", (s) => { s.materials[0].number_density_cm3 = "1e23"; }],
  ["zero density", (s) => { s.materials[0].number_density_cm3 = 0; }],
  ["empty composition", (s) => { s.materials[0].composition = {}; }],
  ["negative count", (s) => { s.materials[0].composition = { C: -1 }; }],
]) {
  test(`snapshot validation rejects ${name}`, () => {
    const bad = clone(snapshot);
    mutate(bad);
    assert.throws(() => validateSnapshot(bad));
  });
}

test("partial isotope data are not shown as a complete material estimate", () => {
  assert.throws(() => calculateSavedMaterial({ composition: { Si: 1, Xx: 1 }, number_density_cm3: 1e23 }, model));
});

function harness(fetcher) {
  const doc = documentDouble();
  const calls = [];
  const ui = createSearchUi({ document: doc, model, formatTime, fetcher: async (url, options) => {
    calls.push({ url, options });
    return fetcher ? fetcher(url, options) : { ok: true, text: async () => snapshotText };
  } });
  return { ui, doc, calls, node: (id) => doc.getElementById(id) };
}

function elementCell(h, symbol) {
  return h.node("mp-periodic-table").children.find((cell) => cell.dataset.element === symbol);
}

function listedIds(h) {
  return h.node("mp-sample-select").children.map((option) => option.value).filter(Boolean);
}

function compositionHarness(compositions) {
  const materials = compositions.map((composition, i) => ({
    id: `mp-${i + 1}`, composition, number_density_cm3: 1e23,
  }));
  const text = JSON.stringify({ ...snapshot, count: materials.length, materials });
  return harness(async () => ({ ok: true, text: async () => text }));
}

test("element availability follows the full combination and recovers after deselection", async () => {
  // Si–O and C–O both exist, but Si–C–O does not: pairwise checks are insufficient.
  const h = compositionHarness([{ Si: 1, C: 1 }, { Si: 1, O: 2 }, { C: 1, O: 2 },
    { Ga: 1, N: 1 }, { Si: 2, C: 1, N: 4 }]);
  await h.ui.ready;
  await elementCell(h, "Si").dispatch("click");
  assert.equal(elementCell(h, "O").disabled, false);
  assert.equal(elementCell(h, "Ga").disabled, true);
  await elementCell(h, "C").dispatch("click");
  assert.deepEqual(listedIds(h), ["mp-1", "mp-5"]);
  assert.equal(elementCell(h, "O").disabled, true);
  assert.match(elementCell(h, "O").title, /no matching materials with the current filters/i);
  assert.equal(elementCell(h, "N").disabled, false);
  assert.match(elementCell(h, "N").attributes.get("aria-label"), /1 matching material/);
  for (const symbol of ["Si", "C"]) {
    assert.equal(elementCell(h, symbol).disabled, false);
    assert.equal(elementCell(h, symbol).attributes.get("aria-pressed"), "true");
    assert.match(elementCell(h, symbol).title, /deselect/);
  }
  await elementCell(h, "N").dispatch("click");
  assert.deepEqual(listedIds(h), ["mp-5"]);
  for (const cell of h.node("mp-periodic-table").children.filter((cell) => cell.dataset.element)) {
    assert.equal(cell.disabled, !["Si", "C", "N"].includes(cell.dataset.element));
  }
  await elementCell(h, "N").dispatch("click");
  await elementCell(h, "C").dispatch("click");
  assert.deepEqual(listedIds(h), ["mp-1", "mp-2", "mp-5"]);
  assert.equal(elementCell(h, "O").disabled, false);
  await h.node("mp-clear-elements").dispatch("click");
  assert.equal(listedIds(h).length, 5);
  assert.equal(elementCell(h, "Ga").disabled, false);
  assert.equal(elementCell(h, "Og").disabled, true);
  assert.equal(h.calls.length, 1);
});

test("unavailable element clicks do not change filters or erase a calculated result", async () => {
  const h = compositionHarness([{ Si: 1, C: 1 }, { Ga: 1, N: 1 }]);
  await h.ui.ready;
  await elementCell(h, "Si").dispatch("click");
  h.node("mp-id").value = "mp-1";
  await h.ui.run();
  const result = h.node("mp-result").textContent;
  const summary = h.node("mp-filter-summary").textContent;
  assert.equal(elementCell(h, "Ga").disabled, true);
  // dispatch intentionally bypasses native disabled-button suppression.
  await elementCell(h, "Ga").dispatch("click");
  assert.equal(elementCell(h, "Ga").attributes.get("aria-pressed"), "false");
  assert.deepEqual(listedIds(h), ["mp-1"]);
  assert.equal(h.node("mp-output").hidden, false);
  assert.equal(h.node("mp-result").textContent, result);
  assert.equal(h.node("mp-filter-summary").textContent, summary);
});

test("element availability includes matching materials beyond the current result page", async () => {
  const h = compositionHarness([...Array.from({ length: PAGE_SIZE }, () => ({ Si: 1, C: 1 })), { Si: 1, N: 1 }]);
  await h.ui.ready;
  await elementCell(h, "Si").dispatch("click");
  assert.equal(listedIds(h).length, PAGE_SIZE);
  assert.equal(elementCell(h, "N").disabled, false);
  assert.match(elementCell(h, "N").title, /1 matching material/);
  await h.node("mp-page-next").dispatch("click");
  assert.deepEqual(listedIds(h), [`mp-${PAGE_SIZE + 1}`]);
  assert.equal(elementCell(h, "C").disabled, false);
  assert.match(elementCell(h, "C").title, new RegExp(`${PAGE_SIZE} matching materials`));
  await h.node("mp-page-prev").dispatch("click");
  await elementCell(h, "N").dispatch("click");
  assert.deepEqual(listedIds(h), [`mp-${PAGE_SIZE + 1}`]);
  assert.equal(elementCell(h, "C").disabled, true);
  assert.equal(elementCell(h, "N").disabled, false);
  assert.equal(h.calls.length, 1);
});

test("element availability follows text search without trapping selected elements", async () => {
  const h = compositionHarness([{ Si: 1, C: 1 }, { Si: 1, O: 2 }, { Ga: 1, N: 1 }]);
  await h.ui.ready;
  h.node("mp-search").value = "SiO2";
  await h.node("mp-search").dispatch("input");
  assert.equal(elementCell(h, "Si").disabled, false);
  assert.equal(elementCell(h, "C").disabled, true);
  await elementCell(h, "Si").dispatch("click");
  h.node("mp-search").value = "no-material";
  await h.node("mp-search").dispatch("input");
  assert.equal(listedIds(h).length, 0);
  assert.equal(elementCell(h, "Si").disabled, false);
  assert.equal(elementCell(h, "O").disabled, true);
  await elementCell(h, "Si").dispatch("click");
  assert.equal(elementCell(h, "Si").attributes.get("aria-pressed"), "false");
  assert.equal(elementCell(h, "Si").disabled, true);
  h.node("mp-search").value = "";
  await h.node("mp-search").dispatch("input");
  assert.equal(listedIds(h).length, 3);
  assert.equal(elementCell(h, "C").disabled, false);
  assert.equal(elementCell(h, "Ga").disabled, false);
  await elementCell(h, "Si").dispatch("click");
  h.node("mp-search").value = "GaN";
  await h.node("mp-search").dispatch("input");
  await h.node("mp-clear-elements").dispatch("click");
  assert.equal(h.node("mp-search").value, "GaN");
  assert.deepEqual(listedIds(h), ["mp-3"]);
  assert.equal(elementCell(h, "Si").disabled, true);
  assert.equal(elementCell(h, "Ga").disabled, false);
  assert.equal(h.calls.length, 1);
});

test("pagination exposes every ID exactly once with at most 100 options per page", async () => {
  const h = harness();
  await h.ui.ready;
  assert.equal(h.node("mp-page-prev").disabled, true);
  await h.node("mp-page-prev").dispatch("click");
  const found = [];
  for (let page = 0; page < Math.ceil(sampleCount / PAGE_SIZE); page++) {
    const ids = listedIds(h);
    assert.ok(ids.length <= PAGE_SIZE);
    assert.equal(h.node("mp-sample-select").children.length, ids.length + 1);
    assert.ok(h.node("mp-page-summary").textContent.includes(`Page ${page + 1} of`));
    found.push(...ids);
    await h.node("mp-page-next").dispatch("click");
  }
  assert.deepEqual(found, snapshot.materials.map((m) => m.id));
  assert.equal(new Set(found).size, sampleCount);
  assert.equal(h.node("mp-page-next").disabled, true);
  if (sampleCount > PAGE_SIZE) {
    await h.node("mp-page-prev").dispatch("click");
    assert.equal(h.node("mp-page-next").disabled, false);
  }
  assert.equal(h.calls.length, 1);
});

test("formula search supports subscripts and case and combines with element filters", async () => {
  const h = harness();
  await h.ui.ready;
  h.node("mp-search").value = " si o₂ ";
  await h.node("mp-search").dispatch("input");
  const expected = snapshot.materials.filter((m) => materialFormula(m.composition).normalize("NFKC").toLowerCase().includes("sio2"));
  assert.deepEqual(listedIds(h), expected.slice(0, PAGE_SIZE).map((m) => m.id));
  const withGa = expected.filter((m) => m.composition.Ga);
  assert.equal(elementCell(h, "Ga").disabled, withGa.length === 0);
  await elementCell(h, "Ga").dispatch("click");
  assert.deepEqual(listedIds(h), (withGa.length ? withGa : expected).slice(0, PAGE_SIZE).map((m) => m.id));
  await h.node("mp-clear-elements").dispatch("click");
  assert.equal(h.node("mp-search").value, " si o₂ ");
  h.node("mp-search").value = "MP-8062";
  await h.node("mp-search").dispatch("input");
  assert.ok(listedIds(h).includes("mp-8062"));
  assert.equal(h.node("mp-output").hidden, true);
  assert.equal(await h.node("mp-search").dispatch("keydown", { key: "Enter" }), true);
  assert.equal(await h.node("mp-search").dispatch("keydown", { key: "a" }), false);
  assert.equal(h.node("mp-output").hidden, true);
  assert.equal(h.calls.length, 1);
});

test("empty search results reset pagination and direct IDs clear incompatible text filters", async () => {
  const h = harness();
  await h.ui.ready;
  await h.node("mp-page-next").dispatch("click");
  h.node("mp-search").value = "<script>no material</script>";
  await h.node("mp-search").dispatch("input");
  assert.equal(listedIds(h).length, 0);
  assert.equal(h.node("mp-page-prev").disabled, true);
  assert.equal(h.node("mp-page-next").disabled, true);
  assert.equal(h.node("mp-sample-select").disabled, true);
  assert.equal(h.node("mp-page-summary").textContent, "0 matching materials");
  h.node("mp-id").value = "mp-8062";
  await h.ui.run();
  assert.equal(h.node("mp-search").value, "");
  assert.equal(h.node("mp-sample-select").value, "mp-8062");
  assert.ok(listedIds(h).includes("mp-8062"));
  assert.match(h.node("mp-status").textContent, /Search filters cleared/);
});

test("direct lookup opens the correct page without treating off-page IDs as filtered out", async () => {
  const h = harness();
  await h.ui.ready;
  const material = snapshot.materials.at(-1);
  h.node("mp-id").value = material.id;
  await h.ui.run();
  const lastPage = Math.ceil(sampleCount / PAGE_SIZE);
  assert.ok(h.node("mp-page-summary").textContent.includes(`Page ${lastPage} of ${lastPage}`));
  assert.equal(h.node("mp-sample-select").value, material.id);
  assert.ok(listedIds(h).includes(material.id));
  assert.doesNotMatch(h.node("mp-status").textContent, /filters cleared/);
  const result = h.node("mp-result").textContent;
  await h.node("mp-page-prev").dispatch("click");
  assert.equal(h.node("mp-result").textContent, result);
  assert.equal(h.node("mp-id").value, material.id);
  assert.equal(h.calls.length, 1);
});

test("search and paging controls stay disabled while loading and recover after failure", async () => {
  let release;
  const h = harness(() => new Promise((resolve) => { release = resolve; }));
  for (const id of ["mp-search", "mp-page-prev", "mp-page-next"]) assert.equal(h.node(id).disabled, true);
  release({ ok: false, status: 503 });
  await h.ui.ready;
  for (const id of ["mp-search", "mp-page-prev", "mp-page-next"]) assert.equal(h.node(id).disabled, true);
});

test("material periodic table has 118 unique elements, correct positions, and sample-aware controls", async () => {
  const h = harness();
  await h.ui.ready;
  const cells = h.node("mp-periodic-table").children;
  const buttons = cells.filter((cell) => cell.dataset.element);
  assert.equal(cells.length, 18 * 9);
  assert.equal(buttons.length, 118);
  assert.equal(new Set(buttons.map((cell) => cell.dataset.element)).size, 118);
  for (const [symbol, row, col] of [["H", 1, 1], ["He", 1, 18], ["C", 2, 14],
    ["Si", 3, 14], ["Ga", 4, 13], ["La", 8, 3], ["Ac", 9, 3], ["Og", 7, 18]]) {
    assert.equal(elementCell(h, symbol).style.gridRow, String(row));
    assert.equal(elementCell(h, symbol).style.gridColumn, String(col));
  }
  const available = new Set(snapshot.materials.flatMap((material) => Object.keys(material.composition)));
  assert.equal(buttons.filter((cell) => !cell.disabled).length, available.size);
  for (const cell of buttons) {
    assert.equal(cell.tagName, "button");
    assert.equal(cell.type, "button");
    assert.equal(cell.disabled, !available.has(cell.dataset.element));
    assert.equal(cell.attributes.get("aria-pressed"), "false");
    assert.equal(cell.attributes.get("aria-controls"), "mp-sample-select");
  }
  assert.match(elementCell(h, "Og").title, /not included in this sample/);
  await elementCell(h, "Og").dispatch("click");
  assert.equal(listedIds(h).length, Math.min(PAGE_SIZE, sampleCount));
  assert.equal(h.node("mp-clear-elements").disabled, true);
});

test("Si plus C narrows the list, updates pressed states, and preserves the material calculation", async () => {
  const h = harness();
  await h.ui.ready;
  await h.ui.run();
  const expectedResult = h.node("mp-result").textContent;
  await elementCell(h, "Si").dispatch("click");
  assert.equal(h.node("mp-output").hidden, true);
  assert.equal(h.node("mp-material-name").textContent, "");
  assert.equal(h.node("mp-material-link").href, undefined);
  assert.ok(listedIds(h).includes("mp-149"));
  await elementCell(h, "C").dispatch("click");
  assert.equal(listedIds(h).length, Math.min(PAGE_SIZE, siCCount));
  const compatibleElements = new Set(snapshot.materials.filter((material) => material.composition.Si && material.composition.C)
    .flatMap((material) => Object.keys(material.composition)));
  for (const cell of h.node("mp-periodic-table").children.filter((cell) => cell.dataset.element)) {
    assert.equal(cell.disabled, !compatibleElements.has(cell.dataset.element), cell.dataset.element);
  }
  assert.ok(!listedIds(h).includes("mp-149"));
  assert.equal(elementCell(h, "Si").attributes.get("aria-pressed"), "true");
  assert.equal(elementCell(h, "C").attributes.get("aria-pressed"), "true");
  assert.ok(h.node("mp-filter-summary").textContent.includes(`Selected: Si + C · ${siCCount} of ${sampleCount}`));
  assert.equal(h.node("mp-clear-elements").disabled, false);
  h.node("mp-sample-select").value = "mp-8062";
  await h.node("mp-sample-select").dispatch("change");
  await settle();
  assert.equal(h.node("mp-output").hidden, false);
  assert.equal(h.node("mp-result").textContent, expectedResult);
  assert.equal(h.node("mp-material-name").textContent, "SiC — mp-8062");
  assert.equal(listedIds(h).length, Math.min(PAGE_SIZE, siCCount));
  assert.equal(elementCell(h, "Si").attributes.get("aria-pressed"), "true");
  assert.equal(h.calls.length, 1);
});

test("clicking an element again and clearing the filter restore the correct list", async () => {
  const h = harness();
  await h.ui.ready;
  await elementCell(h, "Ga").dispatch("click");
  await elementCell(h, "N").dispatch("click");
  assert.equal(listedIds(h).length, Math.min(PAGE_SIZE, gaNCount));
  assert.equal(h.node("mp-sample-select").value, "");
  await elementCell(h, "N").dispatch("click");
  assert.deepEqual(listedIds(h), filterMaterials(index.values(), ["Ga"]).slice(0, PAGE_SIZE).map((m) => m.id));
  assert.equal(elementCell(h, "N").attributes.get("aria-pressed"), "false");
  await elementCell(h, "Ga").dispatch("click");
  assert.equal(listedIds(h).length, Math.min(PAGE_SIZE, sampleCount));
  assert.equal(h.node("mp-clear-elements").disabled, true);
  await elementCell(h, "Si").dispatch("click");
  await elementCell(h, "O").dispatch("click");
  await h.node("mp-clear-elements").dispatch("click");
  assert.equal(listedIds(h).length, Math.min(PAGE_SIZE, sampleCount));
  assert.equal(elementCell(h, "Si").attributes.get("aria-pressed"), "false");
  assert.equal(elementCell(h, "O").attributes.get("aria-pressed"), "false");
  assert.ok(h.node("mp-filter-summary").textContent.includes(`All ${sampleCount} saved materials`));
  assert.equal(h.calls.length, 1);
});

test("no matching text search clears old results and recovers without network access", async () => {
  const h = harness();
  await h.ui.ready;
  await h.ui.run();
  for (const symbol of ["Si", "C"]) await elementCell(h, symbol).dispatch("click");
  h.node("mp-search").value = "no-material";
  await h.node("mp-search").dispatch("input");
  assert.equal(h.node("mp-output").hidden, true);
  assert.equal(h.node("mp-result").textContent, "");
  assert.equal(h.node("mp-sample-select").value, "");
  assert.equal(h.node("mp-sample-select").disabled, true);
  assert.equal(listedIds(h).length, 0);
  assert.ok(h.node("mp-filter-summary").textContent.includes(`0 of ${sampleCount}`));
  assert.match(h.node("mp-filter-summary").textContent, /No match in this sample/);
  assert.equal(elementCell(h, "Si").disabled, false);
  assert.equal(elementCell(h, "C").disabled, false);
  assert.equal(elementCell(h, "N").disabled, true);
  assert.equal(h.node("mp-clear-elements").disabled, false);
  assert.equal(h.node("mp-calculate").disabled, false);
  h.node("mp-search").value = "";
  await h.node("mp-search").dispatch("input");
  assert.equal(listedIds(h).length, Math.min(PAGE_SIZE, siCCount));
  assert.equal(h.node("mp-sample-select").disabled, false);
  assert.equal(h.node("mp-output").hidden, true);
  assert.equal(h.calls.length, 1);
});

test("direct ID lookup clears only incompatible element filters and keeps dropdown state consistent", async () => {
  const h = harness();
  await h.ui.ready;
  await elementCell(h, "Ga").dispatch("click");
  await elementCell(h, "N").dispatch("click");
  h.node("mp-id").value = "mp-999999999";
  await h.ui.run();
  assert.ok(h.node("mp-status").textContent.includes(`not included in this ${sampleCount}-material sample`));
  assert.equal(elementCell(h, "Ga").attributes.get("aria-pressed"), "true");
  h.node("mp-id").value = " MP-149 ";
  await h.node("mp-id").dispatch("input");
  assert.equal(h.node("mp-sample-select").value, "");
  await h.ui.run();
  assert.equal(h.node("mp-material-name").textContent, "Si — mp-149");
  assert.equal(h.node("mp-sample-select").value, "mp-149");
  assert.equal(listedIds(h).length, Math.min(PAGE_SIZE, sampleCount));
  assert.equal(elementCell(h, "Ga").attributes.get("aria-pressed"), "false");
  assert.equal(elementCell(h, "N").attributes.get("aria-pressed"), "false");
  for (const symbol of ["Ga", "N", "Si", "C"]) assert.equal(elementCell(h, symbol).disabled, false);
  assert.match(h.node("mp-status").textContent, /Search filters cleared for this ID lookup/);
  assert.equal(h.calls.length, 1);
});

test("element filters stay disabled while loading and during calculation", async () => {
  let release;
  const response = new Promise((resolve) => { release = resolve; });
  const h = harness(() => response);
  assert.equal(elementCell(h, "Si").disabled, true);
  await elementCell(h, "Si").dispatch("click");
  release({ ok: true, text: async () => snapshotText });
  await h.ui.ready;
  assert.equal(elementCell(h, "Si").attributes.get("aria-pressed"), "false");
  assert.equal(elementCell(h, "Si").disabled, false);
  await elementCell(h, "Si").dispatch("click");
  const running = h.ui.run();
  assert.equal(elementCell(h, "Si").disabled, true);
  assert.equal(h.node("mp-clear-elements").disabled, true);
  await running;
  assert.equal(elementCell(h, "Si").disabled, false);
  assert.equal(elementCell(h, "Og").disabled, true);
  assert.equal(elementCell(h, "Si").attributes.get("aria-pressed"), "true");
});

test("UI fetches only same-origin JSON once; subsequent ID calculations need no fetch", async () => {
  const h = harness();
  await h.ui.ready;
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].url, "./data/materials-sample.json");
  assert.equal(h.calls[0].options.mode, "same-origin");
  assert.equal(h.node("mp-sample-select").children.length, Math.min(PAGE_SIZE, sampleCount) + 1);
  assert.equal(h.node("mp-sample-info").textContent, `${sampleCount}-material local sample. No API key or live Materials Project request is needed.`);
  for (const material of [...index.values()].slice(0, PAGE_SIZE)) {
    const option = h.node("mp-sample-select").children.find((child) => child.value === material.id);
    assert.equal(option.textContent, `${materialFormula(material.composition)} — ${material.id}`);
  }
  assert.equal(await h.node("mp-form").dispatch("submit"), true);
  assert.equal(h.node("mp-output").hidden, false);
  assert.equal(h.node("mp-material-name").textContent, "SiC — mp-8062");
  assert.match(h.node("mp-meta").textContent, /mp-8062/);
  assert.equal(h.node("mp-material-link").href, "https://materialsproject.org/materials/mp-8062");
  const initialResult = h.node("mp-result").textContent;
  h.node("density").value = "99999";
  await h.ui.run();
  assert.equal(h.node("mp-result").textContent, initialResult);
  h.node("mp-id").value = " MP-149 ";
  await h.ui.run();
  assert.match(h.node("mp-meta").textContent, /mp-149/);
  assert.equal(h.node("mp-material-name").textContent, "Si — mp-149");
  assert.equal(h.calls.length, 1);
  assert.equal(h.node("density").value, "99999");
});

test("selecting a cached material calculates it; editing invalidates the old result", async () => {
  const h = harness();
  await h.ui.ready;
  h.node("mp-sample-select").value = "mp-66";
  await h.node("mp-sample-select").dispatch("change");
  await settle();
  assert.equal(h.node("mp-id").value, "mp-66");
  assert.equal(h.node("mp-material-name").textContent, "C — mp-66");
  assert.match(h.node("mp-meta").textContent, /mp-66/);
  h.node("mp-id").value = "mp-149";
  await h.node("mp-id").dispatch("input");
  assert.equal(h.node("mp-output").hidden, true);
  assert.equal(h.node("mp-material-name").textContent, "");
  assert.equal(h.node("mp-result").textContent, "");
  assert.equal(h.node("mp-material-link").href, undefined);
});

test("unknown IDs are described as outside this sample, with no network fallback", async () => {
  const h = harness();
  await h.ui.ready;
  await h.ui.run();
  h.node("mp-id").value = "mp-999999999";
  await h.ui.run();
  assert.equal(h.node("mp-output").hidden, true);
  assert.equal(h.node("mp-material-name").textContent, "");
  assert.ok(h.node("mp-status").textContent.includes(`not included in this ${sampleCount}-material sample`));
  assert.match(h.node("mp-status").textContent, /does not mean it is absent/);
  assert.equal(h.calls.length, 1);
  h.node("mp-id").value = "<script>";
  await h.ui.run();
  assert.match(h.node("mp-status").textContent, /Enter a Materials Project ID/);
  assert.equal(h.calls.length, 1);
});

test("materials with the same formula retain their separate IDs in names and results", async () => {
  const h = harness();
  await h.ui.ready;
  for (const id of ["mp-804", "mp-830"]) {
    h.node("mp-id").value = id;
    await h.ui.run();
    assert.equal(h.node("mp-material-name").textContent, `GaN — ${id}`);
    assert.equal(h.node("mp-material-link").href, `https://materialsproject.org/materials/${id}`);
    const expected = formatTime(calculateSavedMaterial(index.get(id), model).t2Seconds);
    assert.equal(h.node("mp-result").textContent, `Estimated natural-abundance T₂ = ${expected}`);
  }
  assert.equal(h.calls.length, 1);
});

test("HTTP loading errors release controls and allow a successful retry", async () => {
  let first = true;
  const h = harness(async () => {
    if (first) { first = false; return { ok: false, status: 503 }; }
    return { ok: true, text: async () => snapshotText };
  });
  await h.ui.ready;
  assert.match(h.node("mp-status").textContent, /503/);
  assert.equal(h.node("mp-calculate").disabled, false);
  assert.equal(elementCell(h, "Si").disabled, true);
  assert.equal(h.node("mp-clear-elements").disabled, true);
  assert.match(h.node("mp-filter-summary").textContent, /Load the local sample/);
  await h.ui.run();
  assert.equal(h.node("mp-output").hidden, false);
  assert.equal(h.node("mp-status").classList.contains("error"), false);
  assert.equal(h.calls.length, 2);
  assert.equal(elementCell(h, "Si").disabled, false);
  await elementCell(h, "Si").dispatch("click");
  assert.equal(elementCell(h, "Si").attributes.get("aria-pressed"), "true");
  assert.deepEqual(listedIds(h), filterMaterials(index.values(), ["Si"]).slice(0, PAGE_SIZE).map((m) => m.id));
});

for (const [name, fetcher, message] of [
  ["invalid JSON", async () => ({ ok: true, text: async () => "not JSON" }), /not valid JSON/],
  ["oversized JSON", async () => ({ ok: true, text: async () => " ".repeat(MAX_SAMPLE_CHARS + 1) }), /unexpectedly large/],
  ["network failure", async () => { throw new TypeError("Failed to fetch"); }, /HTTP\(S\)/],
  ["timeout", async () => { const e = new Error(); e.name = "AbortError"; throw e; }, /timed out/],
]) {
  test(`UI handles ${name} without a stale result or disabled retry`, async () => {
    const h = harness(fetcher);
    await h.ui.ready;
    assert.match(h.node("mp-status").textContent, message);
    assert.equal(h.node("mp-calculate").disabled, false);
    assert.equal(h.node("mp-output").hidden, true);
    assert.equal(h.node("mp-sample-info").textContent, "Local material sample. No API key or live Materials Project request is needed.");
  });
}

test("the entire legacy script and new browser entry point initialize together", async () => {
  const doc = documentDouble();
  const calls = [];
  const ctx = legacyContext(doc, async (url) => {
    calls.push(url);
    return { ok: true, text: async () => snapshotText };
  });
  vm.runInContext(lookupSource, ctx, { filename: "t2-lab/materials.js" });
  await settle();
  await doc.getElementById("mp-form").dispatch("submit");
  assert.equal(doc.getElementById("mp-output").hidden, false);
  assert.match(doc.getElementById("mp-result").textContent, /Estimated natural-abundance T₂/);
  assert.deepEqual(calls, ["./data/materials-sample.json"]);
  const h = { node: (id) => doc.getElementById(id) };
  const topCell = doc.getElementById("periodic-table").children.find((cell) => cell.dataset.element === "P");
  await topCell.dispatch("click");
  const before = ["nuclide", "isotope-candidates", "g-factor", "spin", "density", "mixed-result"]
    .map((id) => [doc.getElementById(id).value, doc.getElementById(id).innerHTML]);
  await elementCell(h, "Si").dispatch("click");
  await elementCell(h, "C").dispatch("click");
  const after = ["nuclide", "isotope-candidates", "g-factor", "spin", "density", "mixed-result"]
    .map((id) => [doc.getElementById(id).value, doc.getElementById(id).innerHTML]);
  assert.deepEqual(after, before);
  assert.equal(vm.runInContext("selectedElementFromTable", ctx), "P");
  assert.equal(listedIds(h).length, Math.min(PAGE_SIZE, siCCount));
  await topCell.dispatch("click");
  assert.equal(elementCell(h, "Si").attributes.get("aria-pressed"), "true");
  assert.equal(elementCell(h, "C").attributes.get("aria-pressed"), "true");
  assert.equal(listedIds(h).length, Math.min(PAGE_SIZE, siCCount));
  assert.deepEqual(calls, ["./data/materials-sample.json"]);
});

test("CIF file calculation still works and agrees with ID lookup at the same density", async () => {
  const doc = documentDouble();
  legacyContext(doc);
  const density = index.get("mp-8062").number_density_cm3;
  doc.getElementById("density").value = String(density / 1e23);
  const text = "data_SiC\n_chemical_formula_sum 'Si C'\n";
  doc.getElementById("cif-file").files = [{ name: "SiC.cif", size: text.length, text: async () => text }];
  await doc.getElementById("cif-form").dispatch("submit");
  assert.equal(doc.getElementById("cif-result").classList.contains("error"), false);
  const expected = formatTime(calculateSavedMaterial(index.get("mp-8062"), model).t2Seconds);
  assert.ok(doc.getElementById("cif-result").innerHTML.includes(expected));
});

test("material search comes first in document order with accurate calculator references", () => {
  const sections = [...pageSource.matchAll(/<section\b[^>]*\baria-labelledby="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(sections, ["mp-title", "calc-title", "cif-title", "references-title", "disclaimer-title"]);
  assert.ok(pageSource.indexOf('id="mp-form"') < pageSource.indexOf('id="t2-form"'));
  assert.match(pageSource, /independently of the concentration input in the element\/isotope calculator\./);
  assert.doesNotMatch(pageSource, /concentration input above/);
});

test("material data DOI is linked from the search section and References", () => {
  const doi = "https://doi.org/10.1063/1.4812323";
  for (const id of ["mp-source", "mp-reference"]) {
    const paragraph = pageSource.match(new RegExp(`<p\\b[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)</p>`))?.[1];
    assert.ok(paragraph, id);
    assert.match(paragraph, /A\. Jain et al\./);
    assert.match(paragraph, /APL Materials 1, 011002 \(2013\)/);
    assert.ok(paragraph.includes(`href="${doi}"`), id);
    const link = paragraph.match(/<a\b[^>]*href="https:\/\/doi\.org\/10\.1063\/1\.4812323"[^>]*>/)?.[0];
    assert.match(link, /target="_blank"/);
    assert.match(link, /rel="noopener noreferrer"/);
  }
  assert.ok(pageSource.indexOf('id="mp-source"') < pageSource.indexOf('id="t2-form"'));
  const readme = fs.readFileSync(path.join(root, "t2-lab/data/README.md"), "utf8");
  assert.ok(readme.includes(`](${doi})`));
  for (const modelDoi of ["10.1073/pnas.2121808119", "10.1557/s43577-025-01052-0"]) {
    assert.ok(pageSource.includes(`href="https://doi.org/${modelDoi}"`));
  }
});

test("density attribution identifies the derivation and saved snapshot date", () => {
  const paragraph = pageSource.match(/<p\b[^>]*\bid="mp-density-source"[^>]*>([\s\S]*?)<\/p>/)?.[1];
  assert.ok(paragraph);
  assert.match(paragraph, /n = N \/ V &times; 10<sup>24<\/sup> cm<sup>&minus;3<\/sup>/);
  assert.match(paragraph, /total number of atoms in the cell/);
  assert.match(paragraph, /volume in &Aring;<sup>3<\/sup>/);
  assert.match(paragraph, /10 significant digits/);
  assert.match(paragraph, /not experimental measurements/);
  const retrievedDate = snapshot.source.retrieved_at.slice(0, 10);
  assert.ok(paragraph.includes(`<time datetime="${retrievedDate}">${retrievedDate}</time>`));
  assert.match(paragraph, /href="data\/README\.md"/);
  assert.match(paragraph, /href="https:\/\/materialsproject\.org\/about\/terms"/);
});

test("HTML includes the new script after the unchanged legacy script and unique IDs", () => {
  const materialScript = pageSource.match(/<script\b[^>]*\bsrc="(materials\.js(?:\?[^"]*)?)"[^>]*><\/script>/);
  assert.ok(materialScript);
  assert.ok(pageSource.indexOf('src="script.js"') < materialScript.index);
  const ids = [...pageSource.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.match(pageSource, /not CCE or a measured material property/);
  assert.match(pageSource, /aria-live="polite"/);
});

test("material script cache key matches the page version to avoid stale element controls", () => {
  const version = pageSource.match(/data-page-version="([^"]+)"/)[1];
  const scripts = [...pageSource.matchAll(/<script\b[^>]*\bsrc="(materials\.js(?:\?[^"]*)?)"[^>]*><\/script>/g)];
  assert.equal(scripts.length, 1);
  const url = new URL(scripts[0][1], "https://example.invalid/t2-lab/");
  assert.equal(url.pathname, "/t2-lab/materials.js");
  assert.equal(url.searchParams.get("v"), version);
  assert.equal(fs.readFileSync(path.join(root, url.pathname.slice(1)), "utf8"), lookupSource);
});
