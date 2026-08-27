"use strict";

// Explicit offline maintenance job. Writes generated candidates into a fresh
// test-results directory, never overwrites the active page's dataset.
const fs = require("node:fs");
const path = require("node:path");
const { buildSample, ELEMENTS } = require("./build-t2-materials-sample.cjs");
const { loadModel, verifySnapshot } = require("./t2-model-validation.cjs");
const { calculateSavedMaterial } = require("../t2-lab/materials.js");
const root = path.resolve(__dirname, "..");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseStageArgs(args) {
  if (args.length === 0) return {};
  if (args.length === 2 && args[0] === "--resume-from" && args[1] && !args[1].startsWith("-")) {
    return { resumeFrom: args[1] };
  }
  throw new Error("Usage: node scripts/expand-t2-materials-stages.cjs [--resume-from candidate.json]. Targets 75000 and 80000 records.");
}

function validateBaseline(active, candidate, model = loadModel()) {
  verifySnapshot(active, null, model);
  if (candidate !== active) verifySnapshot(candidate, active, model);
  return candidate;
}

async function run(args = process.argv.slice(2)) {
  const { resumeFrom } = parseStageArgs(args);
  const active = JSON.parse(fs.readFileSync(path.join(root, "t2-lab/data/materials-sample.json"), "utf8"));
  const candidate = resumeFrom ? JSON.parse(fs.readFileSync(path.resolve(root, resumeFrom), "utf8")) : active;
  const model = loadModel();
  const baseline = validateBaseline(active, candidate, model);
  for (const element of ELEMENTS) calculateSavedMaterial({ composition: { [element]: 1 }, number_density_cm3: 1e23 }, model);
  const directory = fs.mkdtempSync(path.join(root, "test-results/t2-expansion-"));
  fs.writeFileSync(path.join(directory, "baseline.json"), JSON.stringify(baseline, null, 2) + "\n", { flag: "wx" });
  console.log(`Generated candidates: ${directory}`);
  let snapshot = baseline;
  let requests = 0;
  let lastCompleted = 0;
  const reports = [];
  const politeFetch = async (url, options) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      await pause(Math.max(0, 500 - (Date.now() - lastCompleted)));
      requests++;
      const response = await fetch(url, options);
      lastCompleted = Date.now();
      if (![429, 502, 503, 504].includes(response.status) || attempt === 2) return response;
      const retry = response.headers.get("retry-after");
      const seconds = retry === null ? NaN : Number(retry);
      const delay = Number.isFinite(seconds) ? seconds * 1000 : retry ? Date.parse(retry) - Date.now() : (attempt + 1) * 2000;
      await response.body?.cancel();
      if (delay > 60000) throw new Error("Server requested a long pause. Stop and retry later; active data is unchanged.");
      await pause(Math.max(1000, delay || 2000));
    }
  };
  for (const targetCount of [75000, 80000].filter((n) => n > baseline.count)) {
    const beforeRequests = requests;
    snapshot = await buildSample(politeFetch, { baseSnapshot: snapshot, targetCount,
      onProgress: (progress) => {
        if (progress.requests % 5 === 0 || progress.count === targetCount) {
          console.log(`Stage ${targetCount}: ${progress.count} records; ${requests} requests total`);
        }
      },
    });
    const report = verifySnapshot(snapshot, baseline, model);
    const serialized = JSON.stringify(snapshot, null, 2) + "\n";
    const output = path.join(directory, `materials-${targetCount}.json`);
    fs.writeFileSync(output, serialized, { flag: "wx" });
    reports.push({ ...report, bytes: Buffer.byteLength(serialized), requests: requests - beforeRequests, output });
    console.log(JSON.stringify(reports.at(-1)));
  }
  fs.writeFileSync(path.join(directory, "report.json"), JSON.stringify(reports, null, 2) + "\n", { flag: "wx" });
  console.log("All stages verified. Active materials-sample.json is unchanged.");
}

module.exports = { parseStageArgs, validateBaseline };
if (require.main === module) run().catch((error) => { console.error(error.message); process.exitCode = 1; });
