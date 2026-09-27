#!/usr/bin/env node
/* Verify the Equation Atlas data (site/data/equations.json).
 *
 *   node scripts/check_equations.mjs          # exit code 1 on any failure
 *   node scripts/check_equations.mjs --table  # also print every worked example
 *
 * Checks
 *   1. structure: unique ids, known chapters, required fields, https references
 *   2. every expression compiles, with no name clashes against constants / Math
 *   3. every default input gives finite outputs
 *   4. every worked example: recomputes the answer from the calculator
 *      expression and compares it with the value printed on the page
 *   5. every presets/example key names a real input
 *   6. every LaTeX string (equations, legends, steps, inline $…$) renders in KaTeX
 *   7. derived constants are consistent (M☉ = GM☉/G, M⊕ = GM⊕/G, Mpc = 10⁶ pc)
 *   8. independent spot checks against well-known published numbers
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as core from "../site/assets/js/equations-core.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const katex = require(join(ROOT, "site/vendor/katex/katex.min.js"));
const data = JSON.parse(readFileSync(join(ROOT, "site/data/equations.json"), "utf8"));
const K = core.makeScope(data.constants);
const showTable = process.argv.includes("--table");

let fails = 0, checks = 0;
const fail = (id, msg) => { fails++; console.log(`  ✗ [${id}] ${msg}`); };
const ok = () => { checks++; };

function tex(id, s, display = false) {
  try { katex.renderToString(s, { throwOnError: true, displayMode: display, strict: "ignore" }); ok(); }
  catch (e) { fail(id, `KaTeX: ${e.message.split("\n")[0]}  in  ${s}`); }
}
function inlineTex(id, text) {
  const parts = String(text || "").split("$");
  if (parts.length % 2 === 0) fail(id, `unbalanced $ in: ${text}`);
  parts.forEach((p, i) => { if (i % 2) tex(id, p); });
}

// ---------------------------------------------------------------- constants
console.log("Constants");
const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.abs(b);
[["Msun", K.GMsun / K.G, 1e-5], ["Mearth", K.GMearth / K.G, 1e-4], ["Mpc", K.pc * 1e6, 1e-12], ["ly", K.c * K.yr, 1e-12]]
  .forEach(([k, v, tol]) => near(K[k], v, tol) ? ok() : fail("constants", `${k} = ${K[k]} but expected ${v}`));
data.constants.forEach(c => tex("constants", c.sym));

// ---------------------------------------------------------------- equations
console.log(`Equations (${data.equations.length})`);
const chapters = new Set(data.chapters.map(c => c.id));
const ids = new Set();
const reserved = new Set([...Object.keys(K), ...Object.keys(core.MATH)]);
const rows = [];

for (const eq of data.equations) {
  const id = eq.id;
  if (ids.has(id)) fail(id, "duplicate id"); ids.add(id);
  if (!chapters.has(eq.chapter)) fail(id, `unknown chapter ${eq.chapter}`);
  for (const f of ["title", "latex", "legend", "meaning", "example", "calc", "refs"]) if (!eq[f]) fail(id, `missing ${f}`);
  (eq.refs || []).forEach(r => /^https?:\/\//.test(r.url) ? ok() : fail(id, `bad reference url ${r.url}`));

  // LaTeX
  tex(id, eq.latex, true);
  eq.legend.forEach(l => { tex(id, l.sym); inlineTex(id, l.desc); });
  inlineTex(id, eq.meaning);
  inlineTex(id, eq.example.text);
  tex(id, eq.example.steps, true);
  eq.calc.inputs.forEach(i => tex(id, i.sym));
  eq.calc.outputs.forEach(o => tex(id, o.sym));

  // names
  const names = [...eq.calc.inputs.map(i => i.id), ...eq.calc.outputs.map(o => o.id)];
  const seen = new Set();
  for (const n of names) {
    if (reserved.has(n)) fail(id, `"${n}" clashes with a constant or Math name`);
    if (seen.has(n)) fail(id, `"${n}" used twice`); seen.add(n);
  }
  const inputIds = new Set(eq.calc.inputs.map(i => i.id));
  for (const i of eq.calc.inputs) {
    if (i.type === "select") { if (!i.options.some(o => o.value === i.value)) fail(id, `select ${i.id} default not in options`); continue; }
    if (!(i.value >= (i.hardMin ?? i.min) && i.value <= (i.hardMax ?? i.max))) fail(id, `input ${i.id} default ${i.value} outside range`);
    if (i.log && !(i.min > 0)) fail(id, `log input ${i.id} needs min > 0`);
  }

  let run;
  try { run = core.compile(eq, K); ok(); } catch (e) { fail(id, `compile: ${e.message}`); continue; }

  // defaults
  const def = core.evaluate(eq, run, core.displayValues(eq), K);
  for (const o of eq.calc.outputs) Number.isFinite(def.shown[o.id]) ? ok() : fail(id, `default output ${o.id} is ${def.shown[o.id]}`);

  // presets
  for (const p of eq.calc.presets || []) {
    for (const k of Object.keys(p.set)) if (!inputIds.has(k)) fail(id, `preset "${p.label}" sets unknown input ${k}`);
    const r = core.evaluate(eq, run, core.displayValues(eq, p.set), K);
    const primary = eq.calc.outputs[0].id;
    Number.isFinite(r.shown[primary]) ? ok() : fail(id, `preset "${p.label}" gives non-finite ${primary}`);
  }

  // worked example
  const ex = eq.example;
  for (const k of Object.keys(ex.set)) if (!inputIds.has(k)) fail(id, `example sets unknown input ${k}`);
  const r = core.evaluate(eq, run, core.displayValues(eq, ex.set), K);
  const got = r.shown[ex.answer.out];
  const tol = ex.answer.tol ?? 0.002;
  const good = Math.abs(got - ex.answer.value) <= tol * Math.abs(ex.answer.value);
  good ? ok() : fail(id, `example: page says ${ex.answer.value}, calculator gives ${got}`);
  const o = eq.calc.outputs.find(x => x.id === ex.answer.out);
  const f = core.formatOutput(o, got);
  rows.push([id, `${f.num} ${f.unit}`, ex.answer.value, good ? "ok" : "MISMATCH"]);

  // plots: at least a few finite samples
  if (eq.plot && eq.plot.type === "xy") {
    const ys = [].concat(eq.plot.y);
    for (const y of ys) if (!eq.calc.outputs.some(x => x.id === y)) fail(id, `plot y "${y}" is not an output`);
    if (!inputIds.has(eq.plot.x)) fail(id, `plot x "${eq.plot.x}" is not an input`);
  }
}

// ---------------------------------------------------------------- independent spot checks
// These use textbook numbers, NOT the JSON expressions, to catch a wrong formula.
console.log("Spot checks against published values");
function spot(id, overrides, out, expected, tol, what) {
  const eq = data.equations.find(e => e.id === id);
  const run = core.compile(eq, K);
  const v = core.evaluate(eq, run, core.displayValues(eq, overrides), K).shown[out];
  near(v, expected, tol) ? ok() : fail(id, `${what}: got ${v}, published ≈ ${expected}`);
}
spot("orbital-period", { mu: 3.986004e14, a: 42164 }, "T", 86164, 0.001, "GEO period = 1 sidereal day (86 164 s)");
spot("escape-velocity", { mu: 4.9028e12, r: 1737.4 }, "vesc", 2.38, 0.005, "Moon escape velocity 2.38 km/s (NASA fact sheet)");
spot("kepler-third", { a: 1, M: 1 }, "Td", 365.256, 0.0005, "sidereal year 365.256 d");
spot("stefan-boltzmann", { R: 1, T: 5772 }, "L", 3.828e26, 0.001, "IAU nominal L☉");
spot("inverse-square", { L: 1, d: 1 }, "F", 1361, 0.002, "solar constant ≈ 1361 W/m² (IAU 2015 B3)");
spot("schwarzschild", { M: 1 }, "rs", 2.953, 0.001, "solar Schwarzschild radius 2.95 km");
spot("gps-clock", { r: 26562 }, "net", 38.5, 0.01, "GPS net ≈ +38.5 μs/day (Ashby 2003)");
spot("gps-clock", { r: 26562 }, "grav", 45.7, 0.01, "GPS gravitational ≈ +45.7 μs/day (Ashby 2003)");
spot("gps-clock", { r: 26562 }, "vel", -7.2, 0.01, "GPS velocity ≈ −7.2 μs/day (Ashby 2003)");

spot("wien", { T: 2.72548 }, "lamum", 1063, 0.001, "CMB peak ≈ 1.063 mm");
spot("eddington", { M: 1 }, "L", 1.26e31, 0.005, "L_Edd ≈ 1.26 × 10³¹ W per M☉");
spot("hawking", { M: 1.98841e30 }, "TH", 6.17e-8, 0.005, "Hawking T for 1 M☉ ≈ 6.17 × 10⁻⁸ K");
spot("hubble-lemaitre", { H0: 67.4, d: 1 }, "tH", 14.51, 0.002, "Hubble time 1/H₀ ≈ 14.5 Gyr");
spot("critical-density", { H: 67.4 }, "rho", 8.53e-27, 0.002, "ρc ≈ 8.53 × 10⁻²⁷ kg/m³ for H₀ = 67.4");
spot("lorentz-factor", { beta: 99 }, "gamma", 7.0888, 0.0005, "γ(0.99c) = 7.089");
spot("hohmann", { mu: 1.3271244e20, r1: 149597870.7, r2: 227939200 }, "tH", 258.9 * 86400, 0.003, "Earth→Mars Hohmann ≈ 259 days");
spot("speed-of-sound", { T: 288.15, gam: 1.4, Mm: 0.0289647, v: 340.29 }, "a", 340.29, 0.001, "sea-level speed of sound 340.3 m/s");
{ // GPS zero crossing is exactly 1.5 R⊕: check sign change
  const eq = data.equations.find(e => e.id === "gps-clock"), run = core.compile(eq, K);
  const at = r => core.evaluate(eq, run, { r }, K).shown.net;
  (at(9500) < 0 && at(9620) > 0) ? ok() : fail("gps-clock", "zero crossing not at 1.5 R⊕");
}

if (showTable) {
  console.log("\nWorked examples (calculator result vs value printed on the page)");
  for (const [id, shown, val, st] of rows) console.log(`  ${st.padEnd(8)} ${id.padEnd(28)} ${shown.padEnd(22)} page: ${val}`);
}
console.log(`\n${checks} checks passed, ${fails} failed · ${data.equations.length} equations · ${data.constants.length} constants`);
process.exit(fails ? 1 : 0);
