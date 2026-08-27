"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildSample, extractMaterial, parseArgs, SEED_IDS, MAX_PAGES_PER_GROUP } = require("./build-t2-materials-sample.cjs");
const ENDPOINT = "https://optimade.materialsproject.org/v1/structures";

// Synthetic structures for importer behavior only; never shipped as materials.
function entry(id, elements = ["Si", "C"]) {
  return { id, type: "structures", attributes: {
    elements, nsites: elements.length, dimension_types: [1, 1, 1],
    lattice_vectors: [[4, 0, 0], [0, 4, 0], [0, 0, 4]],
    species: elements.map((symbol) => ({ name: symbol, chemical_symbols: [symbol], concentration: [1] })),
    species_at_sites: [...elements], last_modified: "2023-01-01T00:00:00Z",
  } };
}

function baseSnapshot() {
  return {
    schema_version: 1, count: SEED_IDS.length, composition_basis: "reduced atom counts", number_density_unit: "cm^-3",
    source: {
      name: "Materials Project OPTIMADE", endpoint: ENDPOINT,
      retrieved_at: "2026-08-01T00:00:00Z", api_version: "1.2.0",
      entry_last_modified_range: ["2022-01-01T00:00:00Z", "2023-01-01T00:00:00Z"],
      queries: [ENDPOINT + "?filter=seed-fixture"],
    },
    materials: SEED_IDS.map((id) => extractMaterial(entry(id))),
  };
}

function response(data, hasMore = false) {
  return { ok: true, text: async () => JSON.stringify({ data, meta: { api_version: "1.2.0", more_data_available: hasMore } }) };
}

test("append-only expansion retains prior values and adds separate ternary and binary groups", async () => {
  const base = baseSnapshot();
  const before = JSON.stringify(base);
  const calls = [];
  const next = await buildSample(async (url, options) => {
    calls.push(url.toString());
    assert.equal(options.credentials, "omit");
    assert.equal(options.headers.Accept, "application/vnd.api+json");
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(new URL(url).origin, "https://optimade.materialsproject.org");
    assert.equal(new URL(url).searchParams.get("sort"), "id");
    return calls.length === 1
      ? response([entry("mp-901", ["Al", "Si", "O"]), entry("mp-902", ["B", "C", "N"])])
      : response([entry(SEED_IDS[0], ["O"]), entry("mp-903"), entry("mp-904")]);
  }, { targetCount: 9, baseSnapshot: base });
  assert.equal(next.count, 9);
  for (const material of base.materials) assert.deepEqual(next.materials.find((m) => m.id === material.id), material);
  assert.equal(JSON.stringify(base), before);
  assert.equal(next.materials.filter((m) => Object.keys(m.composition).length === 3).length, 2);
  assert.deepEqual(next.source.retrieval_history.map((b) => [b.added_count, b.total_count]), [[5, 5], [4, 9]]);
  assert.deepEqual(next.source.queries, [...base.source.queries, ...calls]);
  assert.equal(next.source.selection.retained_count, 5);
  assert.equal(next.source.selection.added_count, 4);
  assert.equal(calls.length, 2);
  assert.match(new URL(calls[0]).searchParams.get("filter"), /nelements = 3/);
  assert.match(new URL(calls[1]).searchParams.get("filter"), /nelements <= 2/);
});

test("pagination advances by returned entries, including duplicates and skipped structures", async () => {
  const base = baseSnapshot();
  const calls = [];
  const pages = [
    response([entry("mp-901", ["Al", "Si", "O"])], true),
    response([entry("mp-901", ["Al", "Si", "O"])], true),
    response([null], true),
    response([entry("mp-902", ["B", "C", "N"])]),
    response([entry("mp-903"), entry("mp-904")]),
  ];
  const next = await buildSample(async (url) => {
    calls.push(new URL(url));
    return pages.shift();
  }, { targetCount: 9, baseSnapshot: base });
  assert.equal(next.count, 9);
  assert.deepEqual(calls.map((url) => Number(url.searchParams.get("page_offset"))), [0, 1, 2, 3, 0]);
  assert.deepEqual(calls.map((url) => Number(url.searchParams.get("page_limit"))), [2, 1, 1, 1, 2]);
});

test("a short ternary group is filled from unary/binary materials without inventing records", async () => {
  let calls = 0;
  const next = await buildSample(async () => ++calls === 1 ? response([])
    : response([entry("mp-901"), entry("mp-902"), entry("mp-903"), entry("mp-904")]),
  { targetCount: 9, baseSnapshot: baseSnapshot() });
  assert.equal(next.count, 9);
  assert.equal(calls, 2);
  assert.equal(next.materials.filter((m) => Object.keys(m.composition).length === 3).length, 0);
});

test("empty or perpetually invalid pages stop with no partial snapshot", async () => {
  let emptyCalls = 0;
  await assert.rejects(buildSample(async () => { emptyCalls++; return response([], true); },
    { targetCount: 9, baseSnapshot: baseSnapshot() }), /Only 5 valid materials/);
  assert.equal(emptyCalls, 2);
  let invalidCalls = 0;
  await assert.rejects(buildSample(async () => { invalidCalls++; return response([null], true); },
    { targetCount: 9, baseSnapshot: baseSnapshot() }), /no snapshot produced/);
  assert.equal(invalidCalls, MAX_PAGES_PER_GROUP * 2);
});

test("exhausted unary/binary results are filled by continuing the ternary cursor", async () => {
  const base = baseSnapshot();
  const before = JSON.stringify(base);
  const calls = [];
  const ternary = (id) => entry(id, ["Al", "Si", "O"]);
  const pages = [response([ternary("mp-901"), ternary("mp-902")], true),
    response([entry("mp-903")]), response([ternary("mp-904"), ternary("mp-905")])];
  const next = await buildSample(async (url) => { calls.push(new URL(url)); return pages.shift(); },
    { targetCount: 10, baseSnapshot: base });
  assert.equal(next.count, 10);
  assert.equal(next.source.selection.ternary_fill_count, 2);
  assert.deepEqual(calls.map((u) => Number(u.searchParams.get("page_offset"))), [0, 0, 2]);
  assert.deepEqual(calls.map((u) => Number(u.searchParams.get("page_limit"))), [2, 3, 2]);
  assert.match(calls[2].searchParams.get("filter"), /nelements = 3/);
  assert.equal(next.materials.filter((m) => Object.keys(m.composition).length === 3).length, 4);
  assert.equal(JSON.stringify(base), before);
  for (const m of base.materials) assert.deepEqual(next.materials.find((v) => v.id === m.id), m);
});

test("ternary fallback cannot reset or exceed the group's page budget", async () => {
  let ternaryCalls = 0;
  let binaryCalls = 0;
  await assert.rejects(buildSample(async (url) => {
    if (new URL(url).searchParams.get("filter").startsWith("nelements = 3")) {
      ternaryCalls++;
      return response(ternaryCalls === MAX_PAGES_PER_GROUP
        ? [entry("mp-901", ["Al", "Si", "O"]), entry("mp-902", ["B", "C", "N"])] : [null], true);
    }
    binaryCalls++;
    return response([]);
  }, { targetCount: 9, baseSnapshot: baseSnapshot() }), /Only 7 valid materials/);
  assert.equal(ternaryCalls, MAX_PAGES_PER_GROUP);
  assert.equal(binaryCalls, 1);
});

test("ternary expansion can pass 240 pages and continue within the 280-page budget", async () => {
  assert.equal(MAX_PAGES_PER_GROUP, 280);
  const base = baseSnapshot();
  const before = JSON.stringify(base);
  const offsets = [];
  let binaryCalls = 0;
  const next = await buildSample(async (url) => {
    const params = new URL(url).searchParams;
    if (params.get("filter").startsWith("nelements = 3")) {
      offsets.push(Number(params.get("page_offset")));
      return response([offsets.length <= 240 ? entry(SEED_IDS[0])
        : entry(`mp-${900 + offsets.length}`, ["Al", "Si", "O"])], true);
    }
    binaryCalls++;
    return response([]);
  }, { targetCount: 9, baseSnapshot: base });
  assert.equal(next.count, 9);
  assert.equal(next.source.selection.ternary_fill_count, 2);
  assert.deepEqual(offsets, Array.from({ length: 244 }, (_, i) => i));
  assert.equal(binaryCalls, 1);
  assert.equal(JSON.stringify(base), before);
  for (const m of base.materials) assert.deepEqual(next.materials.find((v) => v.id === m.id), m);
});

test("failure during ternary fallback still leaves the baseline unchanged", async () => {
  const base = baseSnapshot();
  const before = JSON.stringify(base);
  const pages = [response([entry("mp-901", ["Al", "Si", "O"]), entry("mp-902", ["B", "C", "N"])], true),
    response([entry("mp-903")]), { ok: false, status: 503 }];
  await assert.rejects(buildSample(async () => pages.shift(), { targetCount: 10, baseSnapshot: base }), /HTTP 503/);
  assert.equal(JSON.stringify(base), before);
});

test("hitting the unary/binary page limit is not treated as source exhaustion", async () => {
  let ternaryCalls = 0;
  let binaryCalls = 0;
  await assert.rejects(buildSample(async (url) => {
    if (new URL(url).searchParams.get("filter").startsWith("nelements = 3")) {
      ternaryCalls++;
      assert.equal(ternaryCalls, 1, "must not fall back after a page-budget stop");
      return response([entry("mp-901", ["Al", "Si", "O"]), entry("mp-902", ["B", "C", "N"])], true);
    }
    binaryCalls++;
    return response([null], true);
  }, { targetCount: 9, baseSnapshot: baseSnapshot() }), /Only 7 valid materials/);
  assert.equal(ternaryCalls, 1);
  assert.equal(binaryCalls, MAX_PAGES_PER_GROUP);
});

test("a no-op target does not query the service or refresh timestamps", async () => {
  const base = baseSnapshot();
  const next = await buildSample(async () => { throw new Error("Unexpected network request"); }, { targetCount: 5, baseSnapshot: base });
  assert.deepEqual(next, base);
  assert.notEqual(next, base);
});

test("invalid or shrinking targets fail before any network request", async () => {
  const unexpectedFetch = async () => { throw new Error("Unexpected network request"); };
  for (const targetCount of [0, 4, 1.5, "500", NaN, 80001]) {
    await assert.rejects(buildSample(unexpectedFetch, { targetCount, baseSnapshot: baseSnapshot() }), /Target count must/);
  }
  const largerBase = baseSnapshot();
  largerBase.materials.push(extractMaterial(entry("mp-905")));
  largerBase.count++;
  await assert.rejects(buildSample(unexpectedFetch, { targetCount: 5, baseSnapshot: largerBase }), /must not shrink/);
});

test("base snapshots with an unexpected source or unsupported elements are rejected", async () => {
  const unexpectedFetch = async () => { throw new Error("Unexpected network request"); };
  const wrongSource = baseSnapshot();
  wrongSource.source.endpoint = "https://example.com/structures";
  await assert.rejects(buildSample(unexpectedFetch, { targetCount: 9, baseSnapshot: wrongSource }), /unexpected source/);
  const wrongElements = baseSnapshot();
  wrongElements.materials[0].composition = { Tc: 1 };
  await assert.rejects(buildSample(unexpectedFetch, { targetCount: 9, baseSnapshot: wrongElements }), /element scope/);
  const missingSeed = baseSnapshot();
  missingSeed.materials[0].id = "mp-908";
  await assert.rejects(buildSample(unexpectedFetch, { targetCount: 9, baseSnapshot: missingSeed }), /missing a seed/);
});

for (const [name, fetcher, message] of [
  ["HTTP failure", async () => ({ ok: false, status: 503 }), /HTTP 503/],
  ["server errors", async () => ({ ok: true, text: async () => JSON.stringify({ data: [], errors: [{}] }) }), /Invalid OPTIMADE/],
  ["missing data", async () => ({ ok: true, text: async () => "{}" }), /Invalid OPTIMADE/],
  ["bad JSON", async () => ({ ok: true, text: async () => "invalid" }), /Unexpected token/],
  ["oversized payload", async () => ({ ok: true, text: async () => " ".repeat(8000001) }), /Unexpectedly large/],
]) {
  test(`importer fails closed on ${name}`, async () => {
    await assert.rejects(buildSample(fetcher, { targetCount: 9, baseSnapshot: baseSnapshot() }), message);
  });
}

test("fresh imports require every seed before any other group is queried", async () => {
  let calls = 0;
  await assert.rejects(buildSample(async () => { calls++; return response([]); }, { targetCount: 9 }), /seed materials/);
  assert.equal(calls, 1);
});

test("entry validation rejects malformed IDs and four-element systems", () => {
  for (const id of ["mp-0", "mp-001", "MP-149", "mp-9999999999999"]) assert.throws(() => extractMaterial(entry(id)), /structure ID/);
  assert.throws(() => extractMaterial(entry("mp-900", ["Al", "Si", "C", "O"])), /Only unary, binary, and ternary/);
});

test("CLI count selection is bounded and unknown options cannot trigger downloads", () => {
  assert.deepEqual(parseArgs([]), { targetCount: 80000 });
  assert.deepEqual(parseArgs(["--target-count", "1000"]), { targetCount: 1000 });
  assert.deepEqual(parseArgs(["--target-count", "10000"]), { targetCount: 10000 });
  assert.deepEqual(parseArgs(["--target-count", "15000"]), { targetCount: 15000 });
  assert.deepEqual(parseArgs(["--target-count", "20000"]), { targetCount: 20000 });
  assert.deepEqual(parseArgs(["--target-count", "25000"]), { targetCount: 25000 });
  assert.deepEqual(parseArgs(["--target-count", "30000"]), { targetCount: 30000 });
  assert.deepEqual(parseArgs(["--target-count", "35000"]), { targetCount: 35000 });
  assert.deepEqual(parseArgs(["--target-count", "40000"]), { targetCount: 40000 });
  assert.deepEqual(parseArgs(["--target-count", "45000"]), { targetCount: 45000 });
  assert.deepEqual(parseArgs(["--target-count", "50000"]), { targetCount: 50000 });
  assert.deepEqual(parseArgs(["--target-count", "55000"]), { targetCount: 55000 });
  assert.deepEqual(parseArgs(["--target-count", "60000"]), { targetCount: 60000 });
  assert.deepEqual(parseArgs(["--target-count", "65000"]), { targetCount: 65000 });
  assert.deepEqual(parseArgs(["--target-count", "70000"]), { targetCount: 70000 });
  assert.deepEqual(parseArgs(["--target-count", "75000"]), { targetCount: 75000 });
  assert.deepEqual(parseArgs(["--target-count", "80000"]), { targetCount: 80000 });
  assert.deepEqual(parseArgs(["--help"]), { help: true });
  for (const args of [["--target-count"], ["--target-count", "2"], ["--target-count", "80001"],
    ["--target-count", "NaN"], ["--target-count", "-1"], ["--api-key", "unused"]]) {
    assert.throws(() => parseArgs(args), /Usage/);
  }
});
