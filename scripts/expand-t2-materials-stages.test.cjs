"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseStageArgs, validateBaseline } = require("./expand-t2-materials-stages.cjs");
const { loadModel } = require("./t2-model-validation.cjs");
const model = loadModel();
const clone = (value) => JSON.parse(JSON.stringify(value));

test("stage resume arguments are explicit and unknown options are rejected", () => {
  assert.deepEqual(parseStageArgs([]), {});
  assert.deepEqual(parseStageArgs(["--resume-from", "test-results/candidate.json"]), { resumeFrom: "test-results/candidate.json" });
  for (const args of [["--resume-from"], ["--resume-from", ""], ["--resume-from", "--other"],
    ["--resume-from", "a.json", "extra"], ["--api-key", "unused"]]) assert.throws(() => parseStageArgs(args), /Usage/);
});

test("a resume candidate must preserve every active material and all its values", () => {
  const active = { schema_version: 1, count: 1, composition_basis: "reduced atom counts", number_density_unit: "cm^-3",
    materials: [{ id: "mp-149", composition: { Si: 1 }, number_density_cm3: 5e22 }] };
  const candidate = clone(active);
  candidate.materials.push({ id: "mp-8062", composition: { Si: 1, C: 1 }, number_density_cm3: 1e23 });
  candidate.count = 2;
  assert.equal(validateBaseline(active, active, model), active);
  assert.equal(validateBaseline(active, candidate, model), candidate);
  const changed = clone(candidate);
  changed.materials[0].number_density_cm3 = 6e22;
  assert.throws(() => validateBaseline(active, changed, model));
  const missing = clone(candidate);
  missing.materials.shift();
  missing.count = 1;
  assert.throws(() => validateBaseline(active, missing, model));
  const invalid = clone(candidate);
  invalid.materials[1].number_density_cm3 = 0;
  assert.throws(() => validateBaseline(active, invalid, model));
});
