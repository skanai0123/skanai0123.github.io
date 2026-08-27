"use strict";

// Read-only, keyless importer. Prints the compact snapshot to stdout; never
// reads credentials, writes files, or downloads CIFs. Run only when updating
// the sample, not from the public page or on every deployment.
const fs = require("node:fs");
const path = require("node:path");
const { normalizeMaterialId, validateSnapshot, MAX_SAMPLE_RECORDS } = require("../t2-lab/materials.js");
const ENDPOINT = "https://optimade.materialsproject.org/v1/structures";
const TARGET_COUNT = 80000;
const MAX_TARGET_COUNT = MAX_SAMPLE_RECORDS;
const PAGE_SIZE = 250;
// An 80,000-record snapshot needs more than 60,000 ternaries. Keep a finite
// per-group budget, shared by the initial query and its exhaustion fallback.
const MAX_PAGES_PER_GROUP = 280;
const SEED_IDS = ["mp-149", "mp-66", "mp-8062", "mp-804", "mp-830"];
// H through Bi with usable natural-abundance spinful data in script.js.
// Ar, Tc, Ce and Pm lack usable abundance data in the existing model. Do not
// infer a finite T2 for them or include trans-bismuth radioisotope-only entries.
const ELEMENTS = ("H He Li Be B C N O F Ne Na Mg Al Si P S Cl K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn " +
  "Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Pr Nd Sm Eu Gd " +
  "Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi").split(" ").sort();
const FIELDS = "elements,nsites,lattice_vectors,dimension_types,species,species_at_sites,last_modified";

function cellVolume(vectors) {
  if (!Array.isArray(vectors) || vectors.length !== 3 ||
      vectors.some((row) => !Array.isArray(row) || row.length !== 3 || row.some((v) => !Number.isFinite(v)))) {
    throw new Error("Invalid lattice vectors.");
  }
  const [a, b, c] = vectors;
  const volume = Math.abs(
    a[0] * (b[1] * c[2] - b[2] * c[1]) -
    a[1] * (b[0] * c[2] - b[2] * c[0]) +
    a[2] * (b[0] * c[1] - b[1] * c[0])
  );
  if (!Number.isFinite(volume) || volume <= 0) throw new Error("Invalid cell volume.");
  return volume;
}

function gcd(a, b) {
  while (b) [a, b] = [b, a % b];
  return a;
}

function extractMaterial(entry) {
  if (!entry || typeof entry.id !== "string" || normalizeMaterialId(entry.id) !== entry.id || entry.type !== "structures") {
    throw new Error("Invalid Materials Project structure ID.");
  }
  const a = entry.attributes;
  if (!a || !Array.isArray(a.dimension_types) || a.dimension_types.length !== 3 ||
      a.dimension_types.some((d) => d !== 1)) {
    throw new Error("Only three-dimensionally periodic structures are supported in this sample.");
  }
  if (!Number.isInteger(a.nsites) || a.nsites < 1 || a.nsites > 20000 ||
      !Array.isArray(a.species_at_sites) || a.species_at_sites.length !== a.nsites || !Array.isArray(a.species)) {
    throw new Error("Missing or inconsistent site counts.");
  }
  const species = new Map();
  for (const site of a.species) {
    if (!site || typeof site.name !== "string" || species.has(site.name) ||
        !Array.isArray(site.chemical_symbols) || site.chemical_symbols.length !== 1 ||
        !ELEMENTS.includes(site.chemical_symbols[0]) ||
        !Array.isArray(site.concentration) || site.concentration.length !== 1 || site.concentration[0] !== 1 ||
        (site.attached && site.attached.length)) {
      throw new Error("Unsupported, disordered, or partially occupied species.");
    }
    species.set(site.name, site.chemical_symbols[0]);
  }
  const counts = {};
  for (const name of a.species_at_sites) {
    const element = species.get(name);
    if (!element) throw new Error("Unknown site species.");
    counts[element] = (counts[element] || 0) + 1;
  }
  const elements = Object.keys(counts).sort();
  if (elements.length > 3) throw new Error("Only unary, binary, and ternary materials are supported in this stage.");
  if (!Array.isArray(a.elements) || [...a.elements].sort().join(",") !== elements.join(",")) {
    throw new Error("Species and element list disagree.");
  }
  const divisor = Object.values(counts).reduce(gcd);
  const composition = Object.fromEntries(elements.map((element) => [element, counts[element] / divisor]));
  // OPTIMADE lattice vectors are in angstrom. 1 A^3 = 1e-24 cm^3.
  // Use the full cell's site count here, NOT the reduced formula's atom count.
  const density = a.nsites / cellVolume(a.lattice_vectors) * 1e24;
  if (!Number.isFinite(density) || density <= 0) throw new Error("Invalid atomic number density.");
  return { id: entry.id, composition, number_density_cm3: Number(density.toPrecision(10)) };
}

function queryUrl(filter, pageOffset = 0, limit = PAGE_SIZE) {
  const url = new URL(ENDPOINT);
  url.searchParams.set("filter", filter);
  url.searchParams.set("response_fields", FIELDS);
  url.searchParams.set("sort", "id");
  url.searchParams.set("page_limit", String(limit));
  url.searchParams.set("page_offset", String(pageOffset));
  return url;
}

async function buildSample(fetcher = fetch, { targetCount = TARGET_COUNT, baseSnapshot = null, onProgress = () => {} } = {}) {
  if (!Number.isSafeInteger(targetCount) || targetCount < SEED_IDS.length || targetCount > MAX_TARGET_COUNT) {
    throw new Error(`Target count must be an integer from ${SEED_IDS.length} to ${MAX_TARGET_COUNT}.`);
  }
  // Append only: keep the precise data already used for existing IDs.
  const records = baseSnapshot ? new Map([...validateSnapshot(baseSnapshot)].map(([id, material]) =>
    [id, { id, composition: { ...material.composition }, number_density_cm3: material.number_density_cm3 }])) : new Map();
  const baseCount = records.size;
  if (baseCount > targetCount) throw new Error("Target count would remove saved materials; expansion must not shrink the sample.");
  if (baseSnapshot && baseSnapshot.source?.endpoint !== ENDPOINT) throw new Error("The base snapshot has an unexpected source.");
  for (const material of records.values()) {
    const elements = Object.keys(material.composition);
    if (elements.length > 3 || elements.some((e) => !ELEMENTS.includes(e))) {
      throw new Error("The base snapshot contains materials outside this stage's element scope.");
    }
  }
  if (SEED_IDS.some((id) => !records.has(id)) && baseSnapshot) throw new Error("The base snapshot is missing a seed material.");
  if (baseCount === targetCount) return JSON.parse(JSON.stringify(baseSnapshot));
  const queries = [];
  const modifiedDates = [];
  const retainedHistory = baseSnapshot ? baseSnapshot.source.retrieval_history || [{
    retrieved_at: baseSnapshot.source.retrieved_at,
    added_count: baseCount,
    total_count: baseCount,
  }] : [];
  if (baseSnapshot?.source.entry_last_modified_range) modifiedDates.push(...baseSnapshot.source.entry_last_modified_range);
  let apiVersion = baseSnapshot?.source.api_version || null;
  async function collect(url, stopAt, allowedElementCounts) {
    queries.push(url.toString());
    const response = await fetcher(url, {
      headers: { Accept: "application/vnd.api+json" },
      credentials: "omit",
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`Materials Project returned HTTP ${response.status}.`);
    const text = await response.text();
    if (text.length > 8000000) throw new Error("Unexpectedly large sample response.");
    const payload = JSON.parse(text);
    if (!Array.isArray(payload.data) || payload.errors?.length) throw new Error("Invalid OPTIMADE response.");
    apiVersion = payload.meta?.api_version || apiVersion;
    for (const entry of payload.data) {
      if (records.size >= stopAt) break;
      if (records.has(entry?.id)) continue;
      let material;
      try { material = extractMaterial(entry); } catch { continue; }
      if (allowedElementCounts && !allowedElementCounts.includes(Object.keys(material.composition).length)) continue;
      records.set(material.id, material);
      if (typeof entry.attributes.last_modified === "string") modifiedDates.push(entry.attributes.last_modified);
    }
    onProgress({ count: records.size, targetCount, requests: queries.length });
    return { hasMore: payload.meta?.more_data_available === true, returnedCount: payload.data.length };
  }
  if (!baseSnapshot) await collect(queryUrl(SEED_IDS.map((id) => `id="${id}"`).join(" OR "), 0, SEED_IDS.length), SEED_IDS.length);
  if (SEED_IDS.some((id) => !records.has(id))) throw new Error("One or more seed materials are unavailable or invalid.");

  const scope = `elements HAS ONLY ${ELEMENTS.map((e) => `"${e}"`).join(",")}`;
  const ternaryStop = records.size + Math.floor((targetCount - records.size) / 2);
  const groupStates = new Map();
  async function collectGroup(condition, stopAt, allowedElementCounts) {
    const state = groupStates.get(condition) || { offset: 0, pages: 0, exhausted: false };
    groupStates.set(condition, state);
    while (state.pages < MAX_PAGES_PER_GROUP && !state.exhausted && records.size < stopAt) {
      const limit = Math.min(PAGE_SIZE, stopAt - records.size);
      state.pages++;
      const { hasMore, returnedCount } = await collect(queryUrl(`${condition} AND ${scope}`, state.offset, limit), stopAt, allowedElementCounts);
      // The server may clamp page_limit; advance by the actual response size.
      state.offset += returnedCount;
      if (!hasMore || returnedCount === 0) state.exhausted = true;
    }
    return state;
  }
  // Reserve half the new slots for three-element systems, then fill from
  // unary/binary systems. This is deterministic but not a representative survey.
  await collectGroup("nelements = 3", ternaryStop, [3]);
  const binaryState = await collectGroup("nelements <= 2", targetCount, [1, 2]);
  const beforeFill = records.size;
  // Only fall back after genuine exhaustion, not after a page-budget stop.
  // Continue the existing ternary cursor and budget rather than restarting it.
  if (records.size < targetCount && binaryState.exhausted) {
    await collectGroup("nelements = 3", targetCount, [3]);
  }
  const ternaryFillCount = records.size - beforeFill;
  if (records.size !== targetCount) throw new Error(`Only ${records.size} valid materials found; no snapshot produced.`);
  modifiedDates.sort();
  const retrievedAt = new Date().toISOString();
  return {
    schema_version: 1,
    count: records.size,
    composition_basis: "reduced atom counts",
    number_density_unit: "cm^-3",
    source: {
      name: "Materials Project OPTIMADE",
      endpoint: ENDPOINT,
      retrieved_at: retrievedAt,
      api_version: apiVersion,
      entry_last_modified_range: [modifiedDates[0], modifiedDates.at(-1)],
      terms_url: "https://materialsproject.org/about/terms",
      queries: [...(baseSnapshot?.source.queries || []), ...queries],
      retrieval_history: [...retainedHistory, {
        retrieved_at: retrievedAt,
        added_count: records.size - baseCount,
        total_count: records.size,
      }],
      selection: {
        retained_count: baseCount,
        added_count: records.size - baseCount,
        elements: ELEMENTS,
        max_elements: 3,
        method: "Retain existing IDs; reserve half the additions for ternaries, then fill with unary/binary materials in OPTIMADE ID order. If unary/binary results are exhausted, continue ternaries within the same scope and page budget.",
        ternary_fill_count: ternaryFillCount,
      },
    },
    materials: [...records.values()].sort((a, b) => Number(a.id.slice(3)) - Number(b.id.slice(3))),
  };
}

function parseArgs(args) {
  if (args.length === 0) return { targetCount: TARGET_COUNT };
  if (args.length === 1 && args[0] === "--help") return { help: true };
  if (args.length === 2 && args[0] === "--target-count" && /^\d+$/.test(args[1])) {
    const targetCount = Number(args[1]);
    if (Number.isSafeInteger(targetCount) && targetCount >= SEED_IDS.length && targetCount <= MAX_TARGET_COUNT) return { targetCount };
  }
  throw new Error(`Usage: node scripts/build-t2-materials-sample.cjs [--target-count ${SEED_IDS.length}..${MAX_TARGET_COUNT}]`);
}

module.exports = { cellVolume, extractMaterial, buildSample, parseArgs, ELEMENTS, SEED_IDS, TARGET_COUNT, MAX_PAGES_PER_GROUP };
if (require.main === module) {
  (async () => {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(`Usage: node scripts/build-t2-materials-sample.cjs [--target-count ${TARGET_COUNT}]\nAppends to the saved snapshot and prints JSON to stdout. Never overwrites the saved file.`);
      return;
    }
    const baseSnapshot = JSON.parse(fs.readFileSync(path.join(__dirname, "../t2-lab/data/materials-sample.json"), "utf8"));
    const snapshot = await buildSample(fetch, { ...options, baseSnapshot });
    process.stdout.write(JSON.stringify(snapshot) + "\n");
  })().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
