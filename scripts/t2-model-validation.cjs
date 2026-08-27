"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const { validateSnapshot, calculateSavedMaterial } = require("../t2-lab/materials.js");

// Load the actual, local calculation functions without starting the page UI.
// No downloaded code is evaluated. Tests compare this with the full-page VM.
function loadModel() {
  const source = fs.readFileSync(path.join(__dirname, "../t2-lab/script.js"), "utf8");
  const boundary = source.indexOf("const form = document.getElementById");
  if (boundary < 0) throw new Error("The model preamble changed; review the validation loader.");
  const names = ["computeG", "parseAbundancePercent", "isotopeElementSymbol", "buildIsotopeIndexByElement",
    "calculateT2Seconds", "computeNaturalAbundanceT2ForComposition"];
  const functions = names.map((name) => {
    const match = source.match(new RegExp(`^function ${name}\\([^]*?^}`, "m"));
    if (!match) throw new Error(`Missing model function: ${name}`);
    return match[0];
  });
  const context = vm.createContext({});
  vm.runInContext(source.slice(0, boundary) + "\n" + functions.join("\n") +
    "\nconst isotopesByElement = buildIsotopeIndexByElement();", context, { timeout: 1000 });
  return context.computeNaturalAbundanceT2ForComposition;
}

function verifySnapshot(snapshot, baseline, model = loadModel()) {
  const index = validateSnapshot(snapshot);
  for (const material of index.values()) {
    assert.deepEqual(Object.keys(material).sort(), ["composition", "id", "number_density_cm3"]);
    calculateSavedMaterial(material, model);
  }
  for (const material of baseline?.materials || []) assert.deepEqual(index.get(material.id), material);
  return {
    count: index.size,
    retained: baseline?.materials.length || 0,
    elements: [...new Set(snapshot.materials.flatMap((m) => Object.keys(m.composition)))].sort(),
    systems: snapshot.materials.reduce((counts, m) => {
      const n = Object.keys(m.composition).length;
      counts[n] = (counts[n] || 0) + 1;
      return counts;
    }, {}),
  };
}

module.exports = { loadModel, verifySnapshot };
