const isotopeData = [
  { id: "H-1", label: "H-1", I: 0.5, mu: 2.792847351, abundance: "99.99%" },
  { id: "H-2", label: "H-2", I: 1.0, mu: 0.857438231, abundance: "0.01%" },
  { id: "H-3", label: "H-3", I: 0.5, mu: 2.97896246, abundance: "trace" },
  { id: "He-3", label: "He-3", I: 0.5, mu: -2.12762531, abundance: "0.0002(2)%" },
  { id: "Li-6", label: "Li-6", I: 1.0, mu: 0.822043, abundance: "4.85%" },
  { id: "Li-7", label: "Li-7", I: 1.5, mu: 3.256407, abundance: "95.15%" },
  { id: "Be-9", label: "Be-9", I: 1.5, mu: -1.17743, abundance: "100%" },
  { id: "B-10", label: "B-10", I: 3.0, mu: 1.8004636, abundance: "19.65%" },
  { id: "B-11", label: "B-11", I: 1.5, mu: 2.688378, abundance: "80.35%" },
  { id: "C-13", label: "C-13", I: 0.5, mu: 0.702369, abundance: "1.06%" },
  { id: "N-14", label: "N-14", I: 1.0, mu: 0.403573, abundance: "99.6205%" },
  { id: "N-15", label: "N-15", I: 0.5, mu: -0.2830569, abundance: "0.3795%" },
  { id: "O-17", label: "O-17", I: 2.5, mu: -1.893543, abundance: "0.0383%" },
  { id: "F-19", label: "F-19", I: 0.5, mu: 2.628321, abundance: "100%" },
  { id: "Ne-21", label: "Ne-21", I: 1.5, mu: -0.6617, abundance: "0.27(1)%" },
  { id: "Na-23", label: "Na-23", I: 1.5, mu: 2.2175, abundance: "100%" },
  { id: "Mg-25", label: "Mg-25", I: 2.5, mu: -0.85533, abundance: "10.011%" },
  { id: "Al-27", label: "Al-27", I: 2.5, mu: 3.6407, abundance: "100%" },
  { id: "Si-29", label: "Si-29", I: 0.5, mu: -0.555052, abundance: "4.673%" },
  { id: "P-31", label: "P-31", I: 0.5, mu: 1.130925, abundance: "100%" },
  { id: "S-33", label: "S-33", I: 1.5, mu: 0.64325, abundance: "0.7%" },
  { id: "S-35", label: "S-35", I: 1.5, mu: 1.0, abundance: "trace" },
  { id: "Cl-35", label: "Cl-35", I: 1.5, mu: 0.8217, abundance: "75.8%" },
  { id: "Cl-37", label: "Cl-37", I: 1.5, mu: 0.684, abundance: "24.2%" },
  { id: "Ar-37", label: "Ar-37", I: 1.5, mu: 1.146, abundance: "-" },
  { id: "Ar-39", label: "Ar-39", I: 3.5, mu: -1.59, abundance: "trace" },
  { id: "K-39", label: "K-39", I: 1.5, mu: 0.39147, abundance: "93.2581(44)%" },
  { id: "K-40", label: "K-40", I: 4.0, mu: -1.29797, abundance: "0.0117(1)%" },
  { id: "K-41", label: "K-41", I: 1.5, mu: 0.214872, abundance: "6.7302(44)%" },
  { id: "Ca-43", label: "Ca-43", I: 3.5, mu: -1.31733, abundance: "0.135(10)%" },
  { id: "Sc-45", label: "Sc-45", I: 3.5, mu: 4.754, abundance: "100%" },
  { id: "Ti-47", label: "Ti-47", I: 2.5, mu: -0.78814, abundance: "7.44(2)%" },
  { id: "Ti-49", label: "Ti-49", I: 3.5, mu: -1.1037, abundance: "5.41(2)%" },
  { id: "V-50", label: "V-50", I: 6.0, mu: 3.3442, abundance: "0.0250(10)%" },
  { id: "V-51", label: "V-51", I: 3.5, mu: 5.1464, abundance: "99.750(10)%" },
  { id: "Cr-53", label: "Cr-53", I: 1.5, mu: -0.47431, abundance: "9.501(17)%" },
  { id: "Mn-55", label: "Mn-55", I: 2.5, mu: 3.4669, abundance: "100%" },
  { id: "Fe-57", label: "Fe-57", I: 0.5, mu: 0.09064, abundance: "2.119(29)%" },
  { id: "Co-59", label: "Co-59", I: 3.5, mu: 4.627, abundance: "100%" },
  { id: "Ni-61", label: "Ni-61", I: 1.5, mu: -0.74965, abundance: "1.1399(13)%" },
  { id: "Cu-63", label: "Cu-63", I: 1.5, mu: 2.2259, abundance: "69.15(15)%" },
  { id: "Cu-65", label: "Cu-65", I: 1.5, mu: 2.3844, abundance: "30.85(15)%" },
  { id: "Zn-67", label: "Zn-67", I: 2.5, mu: 0.875479, abundance: "4.04(16)%" },
  { id: "Ga-69", label: "Ga-69", I: 1.5, mu: 2.01502, abundance: "60.108(50)%" },
  { id: "Ga-71", label: "Ga-71", I: 1.5, mu: 2.56033, abundance: "39.892(50)%" },
  { id: "Ge-73", label: "Ge-73", I: 4.5, mu: -0.87824, abundance: "7.76(8)%" },
  { id: "As-75", label: "As-75", I: 1.5, mu: 1.4383, abundance: "100%" },
  { id: "Se-77", label: "Se-77", I: 0.5, mu: 0.53356, abundance: "7.60(7)%" },
  { id: "Br-79", label: "Br-79", I: 1.5, mu: 2.1046, abundance: "50.65%" },
  { id: "Br-81", label: "Br-81", I: 1.5, mu: 2.2686, abundance: "49.35%" },
  { id: "Kr-83", label: "Kr-83", I: 4.5, mu: -0.97073, abundance: "11.500(19)%" },
  { id: "Rb-85", label: "Rb-85", I: 2.5, mu: 1.35306, abundance: "72.17(2)%" },
  { id: "Rb-87", label: "Rb-87", I: 1.5, mu: 2.75129, abundance: "27.83(2)%" },
  { id: "Sr-87", label: "Sr-87", I: 4.5, mu: -1.09316, abundance: "7.04%" },
  { id: "Y-89", label: "Y-89", I: 0.5, mu: -0.1374154, abundance: "100%" },
  { id: "Zr-91", label: "Zr-91", I: 2.5, mu: -1.3022, abundance: "11.22(5)%" },
  { id: "Nb-93", label: "Nb-93", I: 4.5, mu: 6.163, abundance: "100%" },
  { id: "Mo-95", label: "Mo-95", I: 2.5, mu: -0.9132, abundance: "15.873(30)%" },
  { id: "Mo-97", label: "Mo-97", I: 2.5, mu: -0.9324, abundance: "9.582(15)%" },
  { id: "Tc-99", label: "Tc-99", I: 4.5, mu: 5.678, abundance: "-" },
  { id: "Ru-99", label: "Ru-99", I: 2.5, mu: -0.641, abundance: "12.76(14)%" },
  { id: "Ru-101", label: "Ru-101", I: 2.5, mu: -0.718, abundance: "17.06(2)%" },
  { id: "Rh-103", label: "Rh-103", I: 0.5, mu: -0.08829, abundance: "100%" },
  { id: "Pd-105", label: "Pd-105", I: 2.5, mu: -0.642, abundance: "22.33(8)%" },
  { id: "Ag-107", label: "Ag-107", I: 0.5, mu: -0.11352, abundance: "51.839(8)%" },
  { id: "Ag-109", label: "Ag-109", I: 0.5, mu: 0.13051, abundance: "48.161(8)%" },
  { id: "Cd-111", label: "Cd-111", I: 0.5, mu: -0.594, abundance: "12.795(12)%" },
  { id: "Cd-113", label: "Cd-113", I: 0.5, mu: -0.6213, abundance: "12.227(7)%" },
  { id: "In-113", label: "In-113", I: 4.5, mu: 5.5208, abundance: "4.281(52)%" },
  { id: "In-115", label: "In-115", I: 4.5, mu: 5.5326, abundance: "95.719(52)%" },
  { id: "Sn-115", label: "Sn-115", I: 0.5, mu: -0.9174, abundance: "0.34(1)%" },
  { id: "Sn-117", label: "Sn-117", I: 0.5, mu: -0.9995, abundance: "7.68(7)%" },
  { id: "Sn-119", label: "Sn-119", I: 0.5, mu: -1.0459, abundance: "8.59(4)%" },
  { id: "Sb-121", label: "Sb-121", I: 2.5, mu: 3.358, abundance: "57.21(5)%" },
  { id: "Sb-123", label: "Sb-123", I: 3.5, mu: 2.5457, abundance: "42.79(5)%" },
  { id: "Te-123", label: "Te-123", I: 0.5, mu: -0.7358, abundance: "0.89(3)%" },
  { id: "Te-125", label: "Te-125", I: 0.5, mu: -0.887, abundance: "7.07(15)%" },
  { id: "I-127", label: "I-127", I: 2.5, mu: 2.8087, abundance: "100%" },
  { id: "Xe-129", label: "Xe-129", I: 0.5, mu: -0.777961, abundance: "26.401(138)%" },
  { id: "Xe-131", label: "Xe-131", I: 1.5, mu: 0.691845, abundance: "21.232(51)%" },
  { id: "Cs-133", label: "Cs-133", I: 3.5, mu: 2.5778, abundance: "100%" },
  { id: "Ba-135", label: "Ba-135", I: 1.5, mu: 0.8381, abundance: "6.59(10)%" },
  { id: "Ba-137", label: "Ba-137", I: 1.5, mu: 0.9375, abundance: "11.23(23)%" },
  { id: "La-138", label: "La-138", I: 5.0, mu: 3.7084, abundance: "0.08881(71)%" },
  { id: "La-139", label: "La-139", I: 3.5, mu: 2.7791, abundance: "99.91119(71)%" },
  { id: "Ce-137", label: "Ce-137", I: 1.5, mu: 0.96, abundance: "-" },
  { id: "Ce-139", label: "Ce-139", I: 1.5, mu: 1.06, abundance: "-" },
  { id: "Ce-141", label: "Ce-141", I: 3.5, mu: 1.09, abundance: "-" },
  { id: "Pr-141", label: "Pr-141", I: 2.5, mu: 4.275, abundance: "100%" },
  { id: "Nd-143", label: "Nd-143", I: 3.5, mu: -1.065, abundance: "12.173(26)%" },
  { id: "Nd-145", label: "Nd-145", I: 3.5, mu: -0.656, abundance: "8.293(12)%" },
  { id: "Pm-143", label: "Pm-143", I: 2.5, mu: 3.8, abundance: "-" },
  { id: "Pm-147", label: "Pm-147", I: 3.5, mu: 2.58, abundance: "-" },
  { id: "Sm-147", label: "Sm-147", I: 3.5, mu: -0.8149, abundance: "15.00(14)%" },
  { id: "Sm-149", label: "Sm-149", I: 3.5, mu: -0.6718, abundance: "13.82(10)%" },
  { id: "Eu-151", label: "Eu-151", I: 2.5, mu: 3.4717, abundance: "47.81(6)%" },
  { id: "Eu-153", label: "Eu-153", I: 2.5, mu: 1.5324, abundance: "52.19(6)%" },
  { id: "Gd-155", label: "Gd-155", I: 1.5, mu: -0.25723, abundance: "14.80(9)%" },
  { id: "Gd-157", label: "Gd-157", I: 1.5, mu: -0.3398, abundance: "15.65(4)%" },
  { id: "Tb-159", label: "Tb-159", I: 1.5, mu: 2.014, abundance: "100%" },
  { id: "Dy-161", label: "Dy-161", I: 2.5, mu: -0.48, abundance: "18.889(42)%" },
  { id: "Dy-163", label: "Dy-163", I: 2.5, mu: 0.6726, abundance: "24.896(42)%" },
  { id: "Ho-165", label: "Ho-165", I: 3.5, mu: 4.177, abundance: "100%" },
  { id: "Er-167", label: "Er-167", I: 3.5, mu: -0.56385, abundance: "22.869(9)%" },
  { id: "Tm-169", label: "Tm-169", I: 0.5, mu: -0.2316, abundance: "100%" },
  { id: "Yb-171", label: "Yb-171", I: 0.5, mu: 0.49367, abundance: "14.216(7)%" },
  { id: "Yb-173", label: "Yb-173", I: 2.5, mu: -0.67989, abundance: "16.098(9)%" },
  { id: "Lu-175", label: "Lu-175", I: 3.5, mu: 2.2327, abundance: "97.401(13)%" },
  { id: "Lu-176", label: "Lu-176", I: 7.0, mu: 3.1692, abundance: "2.599(13)%" },
  { id: "Hf-177", label: "Hf-177", I: 3.5, mu: 0.7935, abundance: "18.60(16)%" },
  { id: "Hf-179", label: "Hf-179", I: 4.5, mu: -0.60409, abundance: "13.62(11)%" },
  { id: "Ta-180m", label: "Ta-180m", I: 9.0, mu: 4.825, abundance: "0.01201(32)%" },
  { id: "Ta-181", label: "Ta-181", I: 3.5, mu: 2.3705, abundance: "99.98799(32)%" },
  { id: "W-183", label: "W-183", I: 0.5, mu: 0.11778476, abundance: "14.31(4)%" },
  { id: "Re-185", label: "Re-185", I: 2.5, mu: 3.1871, abundance: "37.40(5)%" },
  { id: "Re-187", label: "Re-187", I: 2.5, mu: 3.2197, abundance: "62.60(5)%" },
  { id: "Os-187", label: "Os-187", I: 0.5, mu: 0.06465189, abundance: "1.96(2)%" },
  { id: "Os-189", label: "Os-189", I: 1.5, mu: 0.659933, abundance: "16.15(5)%" },
  { id: "Ir-191", label: "Ir-191", I: 1.5, mu: 0.1507, abundance: "37.3(2)%" },
  { id: "Ir-193", label: "Ir-193", I: 1.5, mu: 0.1637, abundance: "62.7(2)%" },
  { id: "Pt-195", label: "Pt-195", I: 0.5, mu: 0.60952, abundance: "33.775(240)%" },
  { id: "Au-197", label: "Au-197", I: 1.5, mu: 0.145746, abundance: "100%" },
  { id: "Hg-199", label: "Hg-199", I: 0.5, mu: 0.5058855, abundance: "16.94(12)%" },
  { id: "Hg-201", label: "Hg-201", I: 1.5, mu: -0.5602257, abundance: "13.17(9)%" },
  { id: "Tl-203", label: "Tl-203", I: 0.5, mu: 1.62225787, abundance: "29.52(1)%" },
  { id: "Tl-205", label: "Tl-205", I: 0.5, mu: 1.6382146, abundance: "70.48(1)%" },
  { id: "Pb-207", label: "Pb-207", I: 0.5, mu: 0.59258, abundance: "22.1(50)%" },
  { id: "Bi-209", label: "Bi-209", I: 4.5, mu: 4.1106, abundance: "100%" },
  { id: "Po-209", label: "Po-209", I: 0.5, mu: 0.68, abundance: "trace" },
  { id: "Rn-211", label: "Rn-211", I: 0.5, mu: 0.601, abundance: "-" },
  { id: "Fr-223", label: "Fr-223", I: 1.5, mu: 1.17, abundance: "100%" },
  { id: "Ra-223", label: "Ra-223", I: 1.5, mu: 0.2705, abundance: "-" },
  { id: "Ra-225", label: "Ra-225", I: 0.5, mu: -0.7338, abundance: "-" },
  { id: "Ac-227", label: "Ac-227", I: 1.5, mu: 1.1, abundance: "100%" },
  { id: "Th-229", label: "Th-229", I: 2.5, mu: 0.46, abundance: "-" },
  { id: "Pa-231", label: "Pa-231", I: 1.5, mu: 2.01, abundance: "100%" },
  { id: "U-235", label: "U-235", I: 3.5, mu: -0.38, abundance: "0.7204(6)%" },
  { id: "Np-237", label: "Np-237", I: 2.5, mu: 3.14, abundance: "100%" },
  { id: "Pu-239", label: "Pu-239", I: 0.5, mu: 0.203, abundance: "-" },
  { id: "Am-241", label: "Am-241", I: 2.5, mu: 1.58, abundance: "-" },
  { id: "Am-243", label: "Am-243", I: 2.5, mu: 1.5, abundance: "100%" },
];

const SCALE = 1.5e18;
const G_EXP = -1.65;
const I_EXP = -1.09;
const N_EXP = -1.0;
const N_INPUT_SCALE = 1e23; // input n is in units of 1e23 cm^-3

function formatTimeValue(seconds) {
  const abs = Math.abs(seconds);
  let value = seconds;
  let unit = "s";

  if (abs < 1e-6) {
    value = seconds * 1e9;
    unit = "ns";
  } else if (abs < 1e-3) {
    value = seconds * 1e6;
    unit = "us";
  } else if (abs < 1) {
    value = seconds * 1e3;
    unit = "ms";
  }

  return `${value.toPrecision(3)} ${unit}`;
}

const form = document.getElementById("t2-form");
const submitBtn = form ? form.querySelector('button[type="submit"]') : null;
const nuclideInput = document.getElementById("nuclide");
const gInput = document.getElementById("g-factor");
const spinInput = document.getElementById("spin");
const abundanceInput = document.getElementById("abundance");
const densityInput = document.getElementById("density");
const densityLabelEl = document.getElementById("density-label");
const resultEl = document.getElementById("result");
const mixedResultEl = document.getElementById("mixed-result");
const metaEl = document.getElementById("meta");
const periodicTableEl = document.getElementById("periodic-table");
const isotopeCandidatesInput = document.getElementById("isotope-candidates");
const customModeBtn = document.getElementById("pt-custom-btn");
const NATURAL_OPTION_PREFIX = "NAT:";

const PERIODIC_TABLE_ROWS = [
  ["H", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, "He"],
  ["Li", "Be", null, null, null, null, null, null, null, null, null, null, "B", "C", "N", "O", "F", "Ne"],
  ["Na", "Mg", null, null, null, null, null, null, null, null, null, null, "Al", "Si", "P", "S", "Cl", "Ar"],
  ["K", "Ca", "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr"],
  ["Rb", "Sr", "Y", "Zr", "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn", "Sb", "Te", "I", "Xe"],
  ["Cs", "Ba", "La", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg", "Tl", "Pb", "Bi", "Po", "At", "Rn"],
  [null, null, "La", "Ce", "Pr", "Nd", "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu", null],
  [null, null, "Ac", "Th", "Pa", "U", "Np", "Pu", "Am", "Cm", "Bk", "Cf", "Es", "Fm", "Md", "No", "Lr", null],
];

function currentMaterialTag() {
  const selected = getSelectedNuclide?.() || null;

  if (typeof selectedCalculationMode === "string") {
    if (selectedCalculationMode === "isotope") {
      return selected ? selected.label : "";
    }
    if (selectedCalculationMode === "natural") {
      return selectedElementFromTable || (selected ? isotopeElementSymbol(selected.id) : "");
    }
    if (selectedCalculationMode === "custom") {
      const tag = (abundanceInput?.value || "").trim();
      return tag || "Custom";
    }
  }
  return "";
}


function trackAutoRun(source) {
  if (typeof window.gtag !== "function") return;

  window.gtag("event", "run_t2_auto", {
    event_category: "t2",
    mode: selectedCalculationMode,
    material: currentMaterialTag(),
    source,
    page_path: location.pathname
  });
}


const DISABLED_ELEMENTS = new Set([
  "Tc",
  "Pm",
  "Ac", "Th", "Pa", "U", "Np", "Pu", "Am", "Cm", "Bk", "Cf", "Es", "Fm", "Md", "No", "Lr",
]);

function computeG(mu, I) {
  if (!Number.isFinite(mu) || !Number.isFinite(I) || I === 0) {
    return null;
  }
  return mu / I;
}

function populateNuclides() {
  isotopeData.forEach((row) => {
    const option = document.createElement("option");
    option.value = row.id;
    option.textContent = row.label;
    nuclideInput.appendChild(option);
  });
}

function getSelectedNuclide() {
  return isotopeData.find((row) => row.id === nuclideInput.value) || null;
}

let selectedElementFromTable = null;
let selectedCalculationMode = "isotope";

function isNaturalOptionValue(value) {
  return typeof value === "string" && value.startsWith(NATURAL_OPTION_PREFIX);
}

function naturalOptionValue(symbol) {
  return `${NATURAL_OPTION_PREFIX}${symbol}`;
}

function extractElementFromNaturalOption(value) {
  return isNaturalOptionValue(value) ? value.slice(NATURAL_OPTION_PREFIX.length) : null;
}

function getRepresentativeIsotopeForElement(symbol) {
  const isotopes = (isotopesByElement[symbol] || []).filter((iso) =>
    Number.isFinite(iso.abundanceFraction) && iso.abundanceFraction > 0 && Number.isFinite(iso.g) && Number.isFinite(iso.I) && iso.I > 0
  );
  if (isotopes.length === 0) {
    return null;
  }
  isotopes.sort((a, b) => b.abundanceFraction - a.abundanceFraction);
  return isotopes[0];
}

function setDefaultsFromNuclide() {
  const selected = getSelectedNuclide();
  if (!selected) {
    updateDensityLabel();
    updateSubmitButtonVisibility();
    return;
  }

  gInput.disabled = true;
  spinInput.disabled = true;
  spinInput.value = selected.I;
  abundanceInput.value = selected.abundance;
  abundanceInput.readOnly = true;
  abundanceInput.disabled = true;
  abundanceInput.placeholder = "";

  const g = computeG(selected.mu, selected.I);
  if (g === null) {
    gInput.value = "";
    gInput.placeholder = "No mu/I data";
  } else {
    gInput.value = g;
    gInput.placeholder = "";
  }

  updateDensityLabel();
  updateSubmitButtonVisibility();
}

function setFieldsFromNaturalElement(symbol) {
  abundanceInput.value = "";
  abundanceInput.readOnly = true;
  abundanceInput.disabled = true;
  abundanceInput.placeholder = "";
  gInput.value = "";
  spinInput.value = "";
  gInput.disabled = true;
  spinInput.disabled = true;
  gInput.placeholder = "";
  spinInput.placeholder = "";
  updateDensityLabel();
  updateSubmitButtonVisibility();
}

function updateDensityLabel() {
  if (!densityLabelEl) {
    return;
  }

  if (selectedCalculationMode === "natural") {
    densityLabelEl.textContent = "concentration n (1e23 cm^-3, element total)";
    return;
  }

  if (selectedCalculationMode === "isotope" && getSelectedNuclide()) {
    densityLabelEl.textContent = "concentration n_i (1e23 cm^-3, selected isotope)";
    return;
  }

  densityLabelEl.textContent = "concentration n (1e23 cm^-3)";
}

function updateSubmitButtonVisibility() {
  if (!submitBtn) {
    return;
  }
  submitBtn.style.display = selectedCalculationMode === "custom" ? "" : "none";
}

function syncPeriodicSelection() {
  if (!periodicTableEl) {
    return;
  }
  const selected = getSelectedNuclide();
  const activeElement = selectedElementFromTable || (selected ? isotopeElementSymbol(selected.id) : null);
  periodicTableEl.querySelectorAll(".pt-cell").forEach((cell) => {
    cell.classList.toggle("active", cell.dataset.element === activeElement);
  });
  if (customModeBtn) {
    const isCustom = selectedCalculationMode === "custom";
    customModeBtn.classList.toggle("active", isCustom);
    customModeBtn.setAttribute("aria-pressed", isCustom ? "true" : "false");
  }
}

function populateIsotopeCandidates(symbol, selectedValue = "") {
  if (!isotopeCandidatesInput) {
    return;
  }

  const isotopes = (isotopesByElement[symbol] || []).slice().sort((a, b) => {
    const aAb = Number.isFinite(a.abundanceFraction) ? a.abundanceFraction : -1;
    const bAb = Number.isFinite(b.abundanceFraction) ? b.abundanceFraction : -1;
    if (bAb !== aAb) {
      return bAb - aAb;
    }
    return a.label.localeCompare(b.label);
  });
  const hasAnyOption = isotopes.length > 0;

  isotopeCandidatesInput.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = hasAnyOption ? `Select option for ${symbol}` : `No isotope data for ${symbol}`;
  isotopeCandidatesInput.appendChild(placeholder);

  if (isotopes.length > 0) {
    const naturalOption = document.createElement("option");
    naturalOption.value = naturalOptionValue(symbol);
    naturalOption.textContent = `Natural abundance (${symbol})`;
    isotopeCandidatesInput.appendChild(naturalOption);
  }

  isotopes.forEach((iso) => {
    const option = document.createElement("option");
    option.value = iso.id;
    option.textContent = iso.label;
    isotopeCandidatesInput.appendChild(option);
  });
  isotopeCandidatesInput.disabled = !hasAnyOption;
  isotopeCandidatesInput.value = selectedValue || "";
}

function enableCustomManualMode() {
  selectedCalculationMode = "custom";
  selectedElementFromTable = null;
  nuclideInput.value = "";
  if (isotopeCandidatesInput) {
    isotopeCandidatesInput.innerHTML = '<option value=""></option>';
    isotopeCandidatesInput.value = "";
    isotopeCandidatesInput.disabled = true;
  }
  gInput.disabled = false;
  spinInput.disabled = false;
  gInput.value = "";
  spinInput.value = "";
  abundanceInput.value = "";
  abundanceInput.readOnly = false;
  abundanceInput.disabled = false;
  gInput.placeholder = "Enter custom g";
  spinInput.placeholder = "Enter custom I";
  abundanceInput.placeholder = "Enter label (optional)";
  resultEl.style.display = "";
  renderElementMixedResult();
  syncPeriodicSelection();
  updateDensityLabel();
  updateSubmitButtonVisibility();
  metaEl.innerHTML = "Mode: Custom | enter g, I, optional abundance text, then click Calculate <i>T</i><sub>2</sub>.";
}

function computeElementNaturalAbundanceMix(symbol, nCm3, eta = 2) {
  if (symbol === "Ce") {
    return {
      symbol,
      eta,
      isotopeCount: 0,
      abundanceCoverage: 0,
      t2Seconds: Infinity,
    };
  }

  const isotopes = (isotopesByElement[symbol] || []).filter((iso) =>
    Number.isFinite(iso.g) && Number.isFinite(iso.I) && iso.I > 0 && Number.isFinite(iso.abundanceFraction) && iso.abundanceFraction > 0
  );

  if (isotopes.length === 0) {
    return null;
  }

  const abundanceSum = isotopes.reduce((sum, iso) => sum + iso.abundanceFraction, 0);
  if (!(abundanceSum > 0) || !(eta > 0)) {
    return null;
  }

  let mixedPowerSum = 0;
  isotopes.forEach((iso) => {
    const niCm3 = nCm3 * iso.abundanceFraction;
    const t2i = calculateT2Seconds(iso.g, iso.I, niCm3);
    if (Number.isFinite(t2i) && t2i > 0) {
      mixedPowerSum += Math.pow(t2i, -eta);
    }
  });

  if (!(mixedPowerSum > 0)) {
    return null;
  }

  return {
    symbol,
    eta,
    isotopeCount: isotopes.length,
    abundanceCoverage: abundanceSum,
    t2Seconds: Math.pow(mixedPowerSum, -1 / eta),
  };
}

function renderElementMixedResult() {
  if (!mixedResultEl) {
    return;
  }

  if (selectedCalculationMode !== "natural") {
    mixedResultEl.style.display = "none";
    return;
  }

  mixedResultEl.style.display = "";
  const selected = getSelectedNuclide();
  const symbol = selectedElementFromTable || (selected ? isotopeElementSymbol(selected.id) : null);
  const nInput = Number(densityInput.value);
  if (!symbol) {
    mixedResultEl.textContent = "Element natural-abundance mix: select an element first";
    return;
  }
  if (!Number.isFinite(nInput) || nInput <= 0) {
    mixedResultEl.textContent = `Element natural-abundance mix (${symbol}): enter n > 0`;
    return;
  }

  const nCm3 = nInput * N_INPUT_SCALE;
  const mixed = computeElementNaturalAbundanceMix(symbol, nCm3, 2);
  if (!mixed) {
    mixedResultEl.textContent = `Element natural-abundance mix (${symbol}): no usable isotope data`;
    return;
  }

  if (!Number.isFinite(mixed.t2Seconds)) {
    mixedResultEl.innerHTML = `${symbol} natural-abundance mix <i>T</i><sub>2</sub> = &infin;`;
    return;
  }

  mixedResultEl.innerHTML = `${symbol} natural-abundance mix <i>T</i><sub>2</sub> = ${formatTimeValue(mixed.t2Seconds)}`;
}

function buildPeriodicTable() {
  if (!periodicTableEl) {
    return;
  }
  periodicTableEl.innerHTML = "";

  PERIODIC_TABLE_ROWS.forEach((row) => {
    row.forEach((symbol) => {
      if (!symbol) {
        const spacer = document.createElement("div");
        spacer.className = "pt-spacer";
        periodicTableEl.appendChild(spacer);
        return;
      }

      const button = document.createElement("button");
      button.type = "button";
      button.className = "pt-cell";
      button.textContent = symbol;
      button.dataset.element = symbol;

      const hasData = (isotopesByElement[symbol] || []).length > 0;
      const isDisabledByPolicy = DISABLED_ELEMENTS.has(symbol);
      if (!hasData || isDisabledByPolicy) {
        button.classList.add("disabled");
        button.disabled = true;
        button.title = isDisabledByPolicy ? `${symbol}: disabled` : `${symbol}: no isotope data`;
      } else {
        button.title = `${symbol}: click to show isotope or natural-abundance option`;
        button.addEventListener("click", () => {
          selectedElementFromTable = symbol;
          selectedCalculationMode = "natural";
          populateIsotopeCandidates(symbol, naturalOptionValue(symbol));
          setFieldsFromNaturalElement(symbol);
          runMainCalculation();
            trackAutoRun("pt_click");   // ← これを追加
          syncPeriodicSelection();
        });
      }

      periodicTableEl.appendChild(button);
    });
  });
}

populateNuclides();
nuclideInput.value = "";
nuclideInput.addEventListener("change", () => {
  const selected = getSelectedNuclide();
  selectedElementFromTable = selected ? isotopeElementSymbol(selected.id) : null;
  selectedCalculationMode = "isotope";
  setDefaultsFromNuclide();
  if (selectedElementFromTable) {
    populateIsotopeCandidates(selectedElementFromTable, nuclideInput.value);
  }
runMainCalculation();
trackAutoRun("nuclide_change");
  syncPeriodicSelection();
});
gInput.value = "";
spinInput.value = "";
gInput.disabled = false;
spinInput.disabled = false;
abundanceInput.value = "";
abundanceInput.readOnly = true;
abundanceInput.disabled = false;
gInput.placeholder = "Select isotope or use Custom";
spinInput.placeholder = "Select isotope or use Custom";
updateDensityLabel();
updateSubmitButtonVisibility();

if (isotopeCandidatesInput) {
  isotopeCandidatesInput.addEventListener("change", () => {
    const selectedValue = isotopeCandidatesInput.value;
    if (!selectedValue) {
      return;
    }

    if (isNaturalOptionValue(selectedValue)) {
      const symbol = extractElementFromNaturalOption(selectedValue);
      if (!symbol) {
        return;
      }
      selectedCalculationMode = "natural";
      selectedElementFromTable = symbol;
      setFieldsFromNaturalElement(symbol);
runMainCalculation();
trackAutoRun("nuclide_change");
      syncPeriodicSelection();
      return;
    }

    selectedCalculationMode = "isotope";
    nuclideInput.value = selectedValue;
    selectedElementFromTable = isotopeElementSymbol(selectedValue);
    setDefaultsFromNuclide();
runMainCalculation();
trackAutoRun("nuclide_change");
    syncPeriodicSelection();
  });
}

densityInput.addEventListener("input", () => {
  if (selectedCalculationMode !== "custom") {
runMainCalculation();
trackAutoRun("nuclide_change");
    return;
  }
  renderElementMixedResult();
});

if (customModeBtn) {
  customModeBtn.addEventListener("click", enableCustomManualMode);
}

function runMainCalculation() {
  const selected = getSelectedNuclide();
  const nInput = Number(densityInput.value);

  if (!Number.isFinite(nInput) || nInput <= 0) {
    resultEl.textContent = "Input error: concentration n must be greater than 0.";
    resultEl.classList.add("error");
    return false;
  }

  const nCm3 = nInput * N_INPUT_SCALE;

  // ----- Natural abundance mode -----
  if (selectedCalculationMode === "natural") {
    const symbol = selectedElementFromTable || (selected ? isotopeElementSymbol(selected.id) : null);
    const mixed = symbol ? computeElementNaturalAbundanceMix(symbol, nCm3, 2) : null;

    if (!mixed) {
      resultEl.textContent = "Input error: no usable natural-abundance isotope data for selected element.";
      resultEl.classList.add("error");
      renderElementMixedResult();
      return false;
    }

    resultEl.style.display = "none";
    resultEl.classList.remove("error");
    metaEl.textContent =
      `Mode: Natural abundance (${mixed.symbol}) | eta=2 | isotopes used=${mixed.isotopeCount} | ` +
      `coverage=${(mixed.abundanceCoverage * 100).toFixed(3)}% | n_i model: n_i=n*abundance | ` +
      `n_input=${nInput.toFixed(4)} (x1e23 cm^-3) | n=${nCm3.toExponential(4)} cm^-3`;
    renderElementMixedResult();
    return true;
  }

  // ----- Custom mode -----
  if (selectedCalculationMode === "custom") {
    const g = Number(gInput.value);
    const I = Number(spinInput.value);
    const abundanceText = (abundanceInput.value || "").trim() || "Custom";

    if (!Number.isFinite(g) || g === 0 || !Number.isFinite(I) || I <= 0) {
      resultEl.textContent = "Input error: custom mode requires g != 0 and I > 0.";
      resultEl.classList.add("error");
      return false;
    }

    const t2Seconds = calculateT2Seconds(g, I, nCm3);
    resultEl.style.display = "";
    resultEl.classList.remove("error");
    resultEl.innerHTML = `<i>T</i><sub>2</sub> = ${formatTimeValue(t2Seconds)}`;
    metaEl.textContent =
      `Mode: Custom | abundance=${abundanceText} | g=${g} | I=${I} | ` +
      `n_input=${nInput.toFixed(4)} (x1e23 cm^-3) | n=${nCm3.toExponential(4)} cm^-3`;
    return true;
  }

  // ----- Isotope mode -----
  const g = Number(gInput.value);
  const I = Number(spinInput.value);

  if (!selected || !Number.isFinite(g) || !Number.isFinite(I) || g === 0 || I <= 0) {
    resultEl.textContent = "Input error: g must be non-zero, and I must be greater than 0.";
    resultEl.classList.add("error");
    renderElementMixedResult();
    return false;
  }

  const term = Math.pow(Math.abs(g), G_EXP) * Math.pow(I, I_EXP) * Math.pow(nCm3, N_EXP);
  const t2Seconds = SCALE * Math.abs(term);

  resultEl.style.display = "";
  resultEl.classList.remove("error");
  resultEl.innerHTML = `<i>T</i><sub>2</sub> = ${formatTimeValue(t2Seconds)}`;
  metaEl.textContent =
    `Mode: Isotope | Nuclide: ${selected.label} | abundance: ${selected.abundance} | g=${g} | I=${I} | ` +
    `n_input=${nInput.toFixed(4)} (x1e23 cm^-3) | n=${nCm3.toExponential(4)} cm^-3`;

  renderElementMixedResult();
  return true;
}

if (form) {
  form.addEventListener("submit", (event) => {
    console.log("t2-form submit fired");   // ← これを追加
    event.preventDefault();

    if (typeof window.gtag === "function") {
      console.log("sending run_t2");       // ← これも追加
window.gtag("event", "run_t2", {
  event_category: "t2",
  mode: selectedCalculationMode,
  material: currentMaterialTag(),
  page_path: location.pathname
});

    }

    const ok = runMainCalculation();

    if (ok && typeof window.gtag === "function") {
      console.log("sending run_t2_completed");  // ← これも追加
window.gtag("event", "run_t2_completed", {
  event_category: "t2",
  mode: selectedCalculationMode,
  material: currentMaterialTag(),
  page_path: location.pathname
});

    }
  });
}


function parseAbundancePercent(text) {
  if (typeof text !== "string") {
    return null;
  }
  const lower = text.trim().toLowerCase();
  if (!lower || lower === "-" || lower.includes("trace") || lower.includes("spuren")) {
    return 0;
  }
  const cleaned = lower.replace(/,/g, ".");
  const match = cleaned.match(/[-+]?\d*\.?\d+/);
  if (!match) {
    return null;
  }
  const value = Number(match[0]);
  if (!Number.isFinite(value)) {
    return null;
  }
  return value / 100;
}

function isotopeElementSymbol(isotopeId) {
  const idx = isotopeId.indexOf("-");
  return idx > 0 ? isotopeId.slice(0, idx) : isotopeId;
}

function buildIsotopeIndexByElement() {
  const byElement = {};
  isotopeData.forEach((row) => {
    const element = isotopeElementSymbol(row.id);
    const abundanceFraction = parseAbundancePercent(row.abundance);
    const g = computeG(row.mu, row.I);

    if (!byElement[element]) {
      byElement[element] = [];
    }

    byElement[element].push({
      id: row.id,
      label: row.label,
      element,
      I: row.I,
      g,
      abundanceFraction,
    });
  });
  return byElement;
}

const isotopesByElement = buildIsotopeIndexByElement();
buildPeriodicTable();
selectedElementFromTable = null;
if (isotopeCandidatesInput) {
  isotopeCandidatesInput.innerHTML = '<option value="">Select an element first</option>';
  isotopeCandidatesInput.disabled = true;
}
syncPeriodicSelection();
renderElementMixedResult();

function calculateT2Seconds(g, I, nCm3) {
  const term = Math.pow(Math.abs(g), G_EXP) * Math.pow(I, I_EXP) * Math.pow(nCm3, N_EXP);
  return SCALE * Math.abs(term);
}

function compositionToAtomicFractions(composition) {
  const entries = Object.entries(composition)
    .map(([element, amount]) => [element, Number(amount)])
    .filter(([, amount]) => Number.isFinite(amount) && amount > 0);

  const total = entries.reduce((sum, [, amount]) => sum + amount, 0);
  if (total <= 0) {
    return null;
  }

  const fractions = {};
  entries.forEach(([element, amount]) => {
    fractions[element] = amount / total;
  });
  return fractions;
}

function computeNaturalAbundanceT2ForComposition(atomicFractions, nCm3) {
  let weightedRate = 0;
  let weightedCoverage = 0;
  const missingElements = [];

  Object.entries(atomicFractions).forEach(([element, atomFrac]) => {
    const isotopes = isotopesByElement[element] || [];
    const valid = isotopes.filter((iso) =>
      Number.isFinite(iso.g) && Number.isFinite(iso.I) && iso.I > 0 && Number.isFinite(iso.abundanceFraction) && iso.abundanceFraction > 0
    );

    const abundanceSum = valid.reduce((s, iso) => s + iso.abundanceFraction, 0);
    const cappedCoverage = Math.max(0, Math.min(1, abundanceSum));
    weightedCoverage += atomFrac * cappedCoverage;

    if (abundanceSum <= 0) {
      missingElements.push(element);
      return;
    }

    valid.forEach((iso) => {
      const isotopeFracInMaterial = atomFrac * iso.abundanceFraction;
      const niCm3 = nCm3 * isotopeFracInMaterial;
      const t2i = calculateT2Seconds(iso.g, iso.I, niCm3);
      if (Number.isFinite(t2i) && t2i > 0) {
        weightedRate += 1 / t2i;
      }
    });
  });

  if (!(weightedRate > 0)) {
    return null;
  }

  return {
    t2Seconds: 1 / weightedRate,
    coverage: weightedCoverage,
    missingElements,
  };
}

function normalizeCifFormula(raw) {
  if (typeof raw !== "string") {
    return "";
  }
  return raw
    .replace(/['"]/g, "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractFormulaFromCif(cifText) {
  const lines = cifText.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    if (trimmed.toLowerCase().startsWith("_chemical_formula_sum")) {
      const value = trimmed.replace(/^_chemical_formula_sum\s+/i, "");
      return normalizeCifFormula(value);
    }
  }
  return null;
}

function parseFormulaToComposition(formula) {
  const compact = formula.replace(/\s+/g, "");
  const re = /([A-Z][a-z]?)(\d*(?:\.\d+)?)/g;
  const composition = {};
  let match = null;

  while ((match = re.exec(compact)) !== null) {
    const element = match[1];
    const count = match[2] ? Number(match[2]) : 1;
    if (!Number.isFinite(count) || count <= 0) {
      continue;
    }
    composition[element] = (composition[element] || 0) + count;
  }

  return Object.keys(composition).length > 0 ? composition : null;
}

function parseCompositionFromCif(cifText) {
  const formula = extractFormulaFromCif(cifText);
  if (!formula) {
    return null;
  }
  const composition = parseFormulaToComposition(formula);
  if (!composition) {
    return null;
  }
  return { formula, composition };
}


function parseWyckoffMultiplicity(wyckoff) {
  if (typeof wyckoff !== "string") {
    return 1;
  }
  const m = wyckoff.trim().match(/^(\d+)/);
  if (!m) {
    return 1;
  }
  const value = Number(m[1]);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

const AVOGADRO = 6.02214076e23;
const MAX_ATOMIC_POSITIONS = 20000;
const atomicWeights = {
  H: 1.008, He: 4.0026, Li: 6.94, Be: 9.0122, B: 10.81, C: 12.011, N: 14.007, O: 15.999, F: 18.998,
  Ne: 20.18, Na: 22.99, Mg: 24.305, Al: 26.982, Si: 28.085, P: 30.974, S: 32.06, Cl: 35.45, Ar: 39.948,
  K: 39.098, Ca: 40.078, Sc: 44.956, Ti: 47.867, V: 50.942, Cr: 51.996, Mn: 54.938, Fe: 55.845, Co: 58.933,
  Ni: 58.693, Cu: 63.546, Zn: 65.38, Ga: 69.723, Ge: 72.63, As: 74.922, Se: 78.971, Br: 79.904, Kr: 83.798,
  Rb: 85.468, Sr: 87.62, Y: 88.906, Zr: 91.224, Nb: 92.906, Mo: 95.95, Tc: 98, Ru: 101.07, Rh: 102.91,
  Pd: 106.42, Ag: 107.87, Cd: 112.41, In: 114.82, Sn: 118.71, Sb: 121.76, Te: 127.6, I: 126.9, Xe: 131.29,
  Cs: 132.91, Ba: 137.33, La: 138.91, Ce: 140.12, Pr: 140.91, Nd: 144.24, Pm: 145, Sm: 150.36, Eu: 151.96,
  Gd: 157.25, Tb: 158.93, Dy: 162.5, Ho: 164.93, Er: 167.26, Tm: 168.93, Yb: 173.05, Lu: 174.97,
  Hf: 178.49, Ta: 180.95, W: 183.84, Re: 186.21, Os: 190.23, Ir: 192.22, Pt: 195.08, Au: 196.97,
  Hg: 200.59, Tl: 204.38, Pb: 207.2, Bi: 208.98, Po: 209, Rn: 222, Fr: 223, Ra: 226, Ac: 227,
  Th: 232.04, Pa: 231.04, U: 238.03, Np: 237, Pu: 244, Am: 243
};

function parseDensityGPerCm3(densityText) {
  if (typeof densityText !== "string") {
    return null;
  }
  const normalized = densityText.replace(/,/g, ".");
  const m = normalized.match(/[-+]?\d*\.?\d+/);
  if (!m) {
    return null;
  }
  const value = Number(m[0]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function computeNInputFromDensity(composition, densityGcm3) {
  if (!composition || !Number.isFinite(densityGcm3) || densityGcm3 <= 0) {
    return null;
  }

  let molarMass = 0;
  let atomsPerFormula = 0;
  for (const [el, countRaw] of Object.entries(composition)) {
    const count = Number(countRaw);
    const aw = atomicWeights[el];
    if (!Number.isFinite(count) || count <= 0 || !Number.isFinite(aw) || aw <= 0) {
      return null;
    }
    molarMass += aw * count;
    atomsPerFormula += count;
  }

  if (molarMass <= 0 || atomsPerFormula <= 0) {
    return null;
  }

  const atomsPerCm3 = densityGcm3 / molarMass * AVOGADRO * atomsPerFormula;
  return atomsPerCm3 / 1e23;
}

function parseCompositionFromJsonObject(obj) {
  const positions = obj && obj.crystal_structure && Array.isArray(obj.crystal_structure.atomic_positions)
    ? obj.crystal_structure.atomic_positions
    : null;

  if (!positions || positions.length === 0) {
    return null;
  }
  if (positions.length > MAX_ATOMIC_POSITIONS) {
    return null;
  }

  const composition = {};
  positions.forEach((site) => {
    const element = typeof site.element === "string" ? site.element.trim() : "";
    if (!/^[A-Z][a-z]?$/.test(element)) {
      return;
    }
    const mult = parseWyckoffMultiplicity(site.wyckoff);
    composition[element] = (composition[element] || 0) + mult;
  });

  if (Object.keys(composition).length === 0) {
    return null;
  }

  const densityText = obj && obj.crystal_structure && obj.crystal_structure.structure_meta
    ? obj.crystal_structure.structure_meta.density
    : null;
  const densityGcm3 = parseDensityGPerCm3(densityText);
  const autoNInput = computeNInputFromDensity(composition, densityGcm3);

  return {
    formula: Object.entries(composition).map(([el, n]) => `${el}${n === 1 ? "" : n}`).join(""),
    composition,
    densityGcm3,
    autoNInput,
  };
}

function parseCompositionFromJsonText(jsonText) {
  try {
    const obj = JSON.parse(jsonText);
    return parseCompositionFromJsonObject(obj);
  } catch (_err) {
    return null;
  }
}

function parseCompositionFromFileText(fileText, fileName) {
  const trimmed = fileText.trim();
  const lowerName = (fileName || "").toLowerCase();

  if (lowerName.endsWith(".json") || trimmed.startsWith("{")) {
    const parsedJson = parseCompositionFromJsonText(fileText);
    if (parsedJson) {
      return { ...parsedJson, sourceType: "JSON" };
    }
  }

  const parsedCif = parseCompositionFromCif(fileText);
  if (parsedCif) {
    return { ...parsedCif, sourceType: "CIF" };
  }

  return null;
}

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_UPLOAD_TEXT_CHARS = 2_000_000;
const FILE_READ_TIMEOUT_MS = 8000;
const ALLOWED_FILE_EXTENSIONS = [".cif", ".json"];

function getLowerFileExtension(fileName) {
  if (typeof fileName !== "string") {
    return "";
  }
  const idx = fileName.lastIndexOf(".");
  return idx >= 0 ? fileName.slice(idx).toLowerCase() : "";
}

function validateUploadedStructureFile(file) {
  if (!file) {
    return "select a CIF or JSON file.";
  }
  const ext = getLowerFileExtension(file.name || "");
  if (!ALLOWED_FILE_EXTENSIONS.includes(ext)) {
    return `unsupported file type (${ext || "no extension"}). Allowed: .cif, .json`;
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return "file is empty.";
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `file is too large (${file.size} bytes). Max is ${MAX_UPLOAD_BYTES} bytes.`;
  }
  return null;
}

function readFileTextWithTimeout(file, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`file read timeout (${timeoutMs} ms).`)), timeoutMs);
    file.text()
      .then((text) => {
        clearTimeout(timer);
        resolve(text);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

const cifForm = document.getElementById("cif-form");
const cifFileInput = document.getElementById("cif-file");
const cifResultEl = document.getElementById("cif-result");
const cifMetaEl = document.getElementById("cif-meta");

if (cifForm) {
  cifForm.addEventListener("submit", async (event) => {
    event.preventDefault();

if (typeof window.gtag === "function") {
const file0 = (cifFileInput.files && cifFileInput.files[0]) ? cifFileInput.files[0] : null;
window.gtag("event", "run_t2_file", {
  event_category: "t2",
  material: file0 ? file0.name : "",
  file_ext: getLowerFileExtension(file0 ? file0.name : ""),
  page_path: location.pathname
});

}


    
    let nInput = Number(densityInput.value);
    const file = cifFileInput.files && cifFileInput.files[0] ? cifFileInput.files[0] : null;

    const uploadError = validateUploadedStructureFile(file);
    if (uploadError) {
      cifResultEl.textContent = `File input error: ${uploadError}`;
      cifResultEl.classList.add("error");
      return;
    }

    cifResultEl.classList.remove("error");
    cifResultEl.textContent = "Parsing file...";
    cifMetaEl.textContent = "";

    try {
      const text = await readFileTextWithTimeout(file, FILE_READ_TIMEOUT_MS);
      if (typeof text !== "string" || text.length === 0) {
        throw new Error("file content is empty.");
      }
      if (text.length > MAX_UPLOAD_TEXT_CHARS) {
        throw new Error(`file text too large (${text.length} chars). Max is ${MAX_UPLOAD_TEXT_CHARS}.`);
      }
      const parsed = parseCompositionFromFileText(text, file.name);
      if (!parsed) {
        throw new Error("Could not parse composition from file (CIF: _chemical_formula_sum, JSON: crystal_structure.atomic_positions).");
      }

      if (parsed.sourceType === "JSON" && Number.isFinite(parsed.autoNInput) && parsed.autoNInput > 0) {
        nInput = parsed.autoNInput;
      }

      if (!Number.isFinite(nInput) || nInput <= 0) {
        throw new Error("concentration n is missing. Set n in the main input section (top).");
      }

      const atomicFractions = compositionToAtomicFractions(parsed.composition);
      if (!atomicFractions) {
        throw new Error("Could not parse composition into atomic fractions.");
      }

      const nCm3 = nInput * N_INPUT_SCALE;
      const natural = computeNaturalAbundanceT2ForComposition(atomicFractions, nCm3);
      if (!natural) {
        throw new Error("No usable isotope data found for this composition.");
      }
      const coveragePct = natural.coverage * 100;
      const missing = natural.missingElements.length > 0 ? natural.missingElements.join(", ") : "none";
      const shownLabel = file.name;

      cifResultEl.innerHTML = `${parsed.sourceType} natural-abundance <i>T</i><sub>2</sub> = ${formatTimeValue(natural.t2Seconds)}`;
      if (typeof window.gtag === "function") {
window.gtag("event", "run_t2_file_completed", {
  event_category: "t2",
  material: parsed.formula,
  file_ext: getLowerFileExtension(file.name),
  page_path: location.pathname
});

}

      cifMetaEl.textContent = `Material: ${shownLabel} | source=${parsed.sourceType} | formula=${parsed.formula} | coverage=${coveragePct.toFixed(2)}% | missing elements=${missing} | n_i model: n_i=n*atomic_fraction*abundance | n_input=${nInput.toFixed(4)} (x1e23 cm^-3) | n=${nCm3.toExponential(4)} cm^-3`;
    } catch (err) {
      cifResultEl.classList.add("error");
      cifResultEl.textContent = `File calculation failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  });
}















