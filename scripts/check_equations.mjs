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
 *   8. chapters: unique numbers, known accent colours, every card's plot refers to real inputs/outputs
 *   9. independent spot checks against well-known published numbers — at least one per chapter
 *  10. independent numerics: the ΛCDM integrals and the Parker wind root are recomputed another way
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

// ---------------------------------------------------------------- chapters
console.log(`Chapters (${data.chapters.length})`);
const COLORS = new Set(["ice", "flame", "plasma", "sol", "nebula", "aurora", "cyan", "coral", "lime", "steel"]);
{
  const ns = new Set();
  for (const ch of data.chapters) {
    COLORS.has(ch.color) ? ok() : fail(ch.id, `unknown accent colour ${ch.color}`);
    ns.has(ch.n) ? fail(ch.id, `duplicate chapter number ${ch.n}`) : ok(); ns.add(ch.n);
    for (const f of ["id", "short", "title", "blurb"]) ch[f] ? ok() : fail(ch.id, `chapter missing ${f}`);
    data.equations.some(e => e.chapter === ch.id) ? ok() : fail(ch.id, "chapter has no equations");
  }
}

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

  // plots: every referenced id must exist, and the plot must have a renderer
  if (eq.plot) {
    const pl = eq.plot, outIds = new Set(eq.calc.outputs.map(x => x.id));
    const needIn = k => pl[k] == null ? fail(id, `plot ${pl.type} needs "${k}"`) : inputIds.has(pl[k]) ? ok() : fail(id, `plot ${k} "${pl[k]}" is not an input`);
    const needOut = k => pl[k] == null ? fail(id, `plot ${pl.type} needs "${k}"`) : [].concat(pl[k]).forEach(y => outIds.has(y) ? ok() : fail(id, `plot ${k} "${y}" is not an output`));
    const RENDER = { xy: () => { needIn("x"); needOut("y"); if (pl.series) inputIds.has(pl.series.input) ? ok() : fail(id, `series input ${pl.series.input} missing`); },
      orbit: () => ok(), hohmann: () => ok(), stack: () => needOut("parts"), refbars: () => needOut("y"),
      airy: () => { needIn("sep"); needOut("th"); }, transit: () => { needIn("Rp"); needIn("Rs"); needOut("y"); },
      hz: () => { needOut("inner"); needOut("outer"); needOut("optIn"); needOut("optOut"); }, ladder: () => needOut("y"), hr: () => { needIn("L"); needIn("T"); } };
    RENDER[pl.type] ? RENDER[pl.type]() : fail(id, `unknown plot type ${pl.type}`);
    if (pl.type === "xy" && inputIds.has(pl.x) && typeof pl.xmin !== "string" && typeof pl.xmax !== "string") {
      // sample the curve: most points across the plotted range must be finite
      const xin = eq.calc.inputs.find(i => i.id === pl.x);
      const x0 = typeof pl.xmin === "number" ? pl.xmin : xin.min, x1 = typeof pl.xmax === "number" ? pl.xmax : xin.max;
      const logx = pl.logx ?? !!xin.log;
      let good = 0; const N = 40;
      for (let k = 0; k <= N; k++) {
        const x = logx ? x0 * Math.pow(x1 / x0, k / N) : x0 + (x1 - x0) * k / N;
        const v = core.evaluate(eq, run, core.displayValues(eq, { [pl.x]: x }), K).shown[[].concat(pl.y)[0]];
        if (Number.isFinite(v)) good++;
      }
      good >= N / 2 ? ok() : fail(id, `plot has only ${good}/${N + 1} finite samples`);
    }
  }
}

// ---------------------------------------------------------------- independent spot checks
// These use textbook numbers, NOT the JSON expressions, to catch a wrong formula.
console.log("Spot checks against published values");
const published = new Set();
function value(id, overrides, out) {
  const eq = data.equations.find(e => e.id === id);
  if (!eq) { fail(id, "spot check names a missing equation"); return NaN; }
  published.add(eq.chapter);
  return core.evaluate(eq, core.compile(eq, K), core.displayValues(eq, overrides), K).shown[out];
}
function spot(id, overrides, out, expected, tol, what) {
  const v = value(id, overrides, out);
  near(v, expected, tol) ? ok() : fail(id, `${what}: got ${v}, published ≈ ${expected}`);
}
function within(id, overrides, out, lo, hi, what) {
  const v = value(id, overrides, out);
  (v >= lo && v <= hi) ? ok() : fail(id, `${what}: got ${v}, expected ${lo} … ${hi}`);
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

// ---- Rockets
spot("specific-impulse", { F: 2279, mdot: 514 }, "isp", 452.3, 0.002, "RS-25 vacuum specific impulse 452.3 s (2 279 kN at 514 kg/s)");
// ---- Telescopes & optics
spot("rayleigh", { lam: 500, D: 2.4 }, "th", 0.05, 0.06, "Hubble resolution ≈ 0.05″ at 500 nm (NASA)");
spot("plate-scale", { f: 10310, p: 10 }, "pix", 0.2, 0.01, "Rubin Observatory LSST camera 0.2″/px (10 μm pixels, f = 10.31 m)");
spot("focal-ratio", { f: 57600, D: 2400 }, "N", 24, 0.001, "Hubble is an f/24 Ritchey–Chrétien");
within("interferometer", { lam: 1.3, B: 12742 }, "th", 18, 26, "Event Horizon Telescope resolution ≈ 20–25 μas at 1.3 mm");
spot("isoplanatic-angle", { r0: 15, hb: 5, lam: 500 }, "th0", 2, 0.05, "visible isoplanatic angle ≈ 2″ for r₀ = 15 cm, h = 5 km");
// ---- Sun & space weather
spot("solar-constant", { T: 5772, R: 1, d: 1 }, "S", 1360.8, 0.001, "total solar irradiance 1 360.8 W/m² (Kopp & Lean 2011)");
spot("differential-rotation", { lat: 26 }, "Psid", 25.38, 0.002, "Carrington sidereal rotation 25.38 d (at ≈ 26°)");
spot("differential-rotation", { lat: 26 }, "Psyn", 27.2753, 0.002, "Carrington synodic rotation 27.2753 d");
spot("solar-wind-transit", { v: 400, d: 1 }, "t", 4.3 * 86400, 0.01, "400 km/s solar wind reaches Earth in ≈ 4.3 days");
spot("solar-wind-transit", { v: 2360, d: 1 }, "th", 17.6, 0.01, "Carrington 1859 CME arrived after 17.6 h");
within("magnetopause", { n: 5, v: 400, Bz: 0 }, "rs", 9.5, 11.5, "quiet-time magnetopause ≈ 10–11 R⊕ (Shue 1998)");
within("alfven-speed", { B: 5, n: 5 }, "vA", 40, 60, "solar-wind Alfvén speed ≈ 50 km/s at 1 AU");
spot("flare-energy", { B: 1000, L: 40, f: 0.2 }, "E", 5e25, 0.05, "Carrington flare ≈ 5 × 10³² erg (Cliver & Dietrich 2013)");
[[9.3e-4, "X9.3"], [5e-5, "M5.0"], [1e-6, "C1.0"], [2.8e-3, "X28"], [3.2e-8, "A3.2"], [9.99e-6, "M1.0"], [1.23e-9, "A0.1"]]
  .forEach(([F, want]) => core.flareClass(F) === want ? ok() : fail("flare-class", `flareClass(${F}) = ${core.flareClass(F)}, expected ${want}`));
// ---- Exoplanets
spot("transit-depth", { Rp: 1, Rs: 1 }, "ppm", 84, 0.01, "Earth transiting the Sun ≈ 84 ppm");
spot("transit-duration", { P: 365.256, Ms: 1, Rs: 1, Rp: 1, b: 0 }, "T", 13.1, 0.01, "Earth's central transit lasts ≈ 13 h");
spot("rv-semi-amplitude", { P: 4332.6, Mp: 317.83, Ms: 1, e: 0, inc: 90 }, "K", 12.5, 0.01, "Jupiter moves the Sun at ≈ 12.5 m/s");
spot("rv-semi-amplitude", { P: 365.256, Mp: 1, Ms: 1, e: 0.0167, inc: 90 }, "K", 0.0894, 0.01, "Earth moves the Sun at ≈ 9 cm/s");
spot("habitable-zone", { L: 1 }, "din", 0.99, 0.005, "Kopparapu 2013: Sun's inner edge 0.99 AU (moist greenhouse)");
spot("habitable-zone", { L: 1 }, "dout", 1.70, 0.01, "Kopparapu 2013: Sun's outer edge 1.70 AU (maximum greenhouse)");
spot("equilibrium-temperature", { Ts: 5772, Rs: 1, a: 1, A: 0.306 }, "Teq", 254.0, 0.002, "Earth black-body temperature 254.0 K (NASA fact sheet)");
spot("equilibrium-temperature", { Ts: 5772, Rs: 1, a: 1.52366, A: 0.25 }, "Teq", 209.8, 0.003, "Mars black-body temperature 209.8 K (NASA fact sheet)");
spot("surface-gravity", { M: 0.10745, R: 0.532 }, "g", 3.71, 0.01, "Mars surface gravity 3.71 m/s² (NASA fact sheet)");
spot("surface-gravity", { M: 0.0123, R: 0.2727 }, "g", 1.62, 0.01, "Moon surface gravity 1.62 m/s² (NASA fact sheet)");
spot("drake", { Rs: 1, fp: 0.2, ne: 1, fl: 1, fi: 1, fc: 0.1, L: 1000 }, "N", 20, 1e-9, "Drake 1961 low-end estimate N = 20");
// ---- Spacecraft engineering
spot("fspl", { d: 35786, f: 12 }, "L", 205.1, 0.001, "geostationary Ku-band path loss ≈ 205 dB");
within("dsn-data-rate", { Pt: 23, Dt: 3.66, Dr: 70, f: 8.42, d: 167, Tsys: 25, EbN0: 7 }, "Rb", 160 / 3, 160 * 3, "Voyager 1 downlink 160 bit/s (order of magnitude)");
spot("dsn-data-rate", { Pt: 23, Dt: 3.66, Dr: 70, f: 8.42, d: 167, Tsys: 25, EbN0: 7 }, "Gt", 48, 0.01, "Voyager 3.7 m high-gain antenna ≈ 48 dBi at X band");
spot("solar-array-power", { A: 60, eta: 0.17, r: 1, th: 0 }, "P", 14000, 0.02, "Juno arrays ≈ 14 kW at Earth (NASA)");
spot("solar-array-power", { A: 60, eta: 0.17, r: 5.2, th: 0 }, "P", 500, 0.05, "Juno arrays ≈ 500 W at Jupiter (NASA)");
spot("spacecraft-temperature", { alpha: 1, eps: 1, r: 1, geom: 0.25 }, "T", 278.6, 0.001, "black sphere at 1 AU = 278.6 K");
spot("ion-thruster", { P: 2.3, Isp: 3100, eta: 0.61, m: 1218 }, "T", 92, 0.01, "NSTAR full-throttle thrust 92 mN");
spot("ion-thruster", { P: 2.3, Isp: 3100, eta: 0.61, m: 1218 }, "t60", 4 * 86400, 0.05, "Dawn: \"zero to 60 mph in four days\"");
spot("radiation-shielding", { mur: 0.0710, rho: 11.35 }, "hvl", 0.86, 0.01, "1 MeV gamma half-value layer in lead ≈ 0.86 cm (NIST μ/ρ)");
// ---- Stars (Light & Stars)
spot("ms-lifetime", { M: 1 }, "t", 10, 1e-9, "Sun's main-sequence lifetime ≈ 10 Gyr");
spot("chandrasekhar", { mue: 2 }, "M", 1.44, 0.01, "Chandrasekhar limit ≈ 1.44 M☉");
spot("star-radius", { L: 170, T: 4286 }, "R", 25.4, 0.08, "Arcturus interferometric radius 25.4 R☉");
spot("star-radius", { L: 1, T: 5772 }, "Mbol", 4.74, 1e-9, "IAU 2015 B2: M_bol,☉ = 4.74");
// ---- Gravity additions
spot("synodic-period", { P1: 365.256, P2: 686.98 }, "S", 779.94, 0.0002, "Mars synodic period 779.94 d (NASA fact sheet)");
spot("synodic-period", { P1: 27.321661, P2: 365.256 }, "S", 29.5306, 0.0002, "synodic month 29.531 d");
within("tidal-locking", { a: 421700, R: 1821.6, msat: 0.015, mpl: 317.8, P0: 12, Qk: 3333 }, "t", 1, 1e5, "Io locks within ~10⁴ yr (order of magnitude)");
spot("jeans-escape", { M: 1, r: 6871, T: 1000, m: 1.008 }, "lam", 7, 0.02, "hydrogen at Earth's exobase: λ ≈ 7");
// ---- Cosmology additions
spot("lookback-time", { z: 1, H0: 67.4, Om: 0.315, OL: 0.685 }, "t0", 13.787, 0.003, "Planck 2018 age of the Universe 13.787 Gyr");
spot("angular-diameter-distance", { z: 1089.92, H0: 67.4, Om: 0.315, OL: 0.685 }, "DC", 144.43 / 0.0104110, 0.01, "Planck 2018 D_M(z*) = r*/θ* ≈ 13 870 Mpc");
spot("angular-diameter-distance", { z: 1089.92, H0: 67.4, Om: 0.315, OL: 0.685, ell: 144.43e3 / 1090.92 }, "th", 0.0104110 * 206264.806, 0.01, "Planck 2018 acoustic angle θ* = 0.596°");
spot("hubble-time", { H0: 73.04 }, "tH", 13.39, 0.002, "SH0ES H₀ = 73.04 → 1/H₀ = 13.4 Gyr");
{ // D_A turns over near z ≈ 1.6 for Planck ΛCDM
  const at = z => value("angular-diameter-distance", { z, H0: 67.4, Om: 0.315, OL: 0.685 }, "DA");
  (at(1.6) > at(1.2) && at(1.6) > at(2.2)) ? ok() : fail("angular-diameter-distance", "D_A should peak near z ≈ 1.6");
}
// ---- Relativity additions
spot("perihelion-precession", { a: 0.387098, e: 0.20563, M: 1 }, "cent", 42.98, 0.002, "Mercury 42.98″/century (Einstein 1915)");
spot("perihelion-precession", { a: 1031.3, e: 0.88465, M: 4.261e6 }, "dphi", 12.1 * 60, 0.02, "S2 around Sgr A*: 12.1′ per orbit (GRAVITY 2020)");
within("shapiro-delay", { M: 1, r1: 1, r2: 0.723, b: 1 }, "dt", 180, 260, "Venus radar at superior conjunction ≈ 200 μs (Shapiro 1964)");

for (const ch of data.chapters) published.has(ch.id) ? ok() : fail(ch.id, "chapter has no spot check against a published value");

// ---------------------------------------------------------------- independent numerics
console.log("Independent numerics");
{ // ΛCDM: integrate in redshift with a fine trapezoid rule (the page integrates in scale factor with Simpson)
  const H0 = 67.4e3 / K.Mpc, Om = 0.315, OL = 0.685, Or = 9.2e-5, Ok = 1 - Or - Om - OL;
  const E = z => Math.sqrt(Or * (1 + z) ** 4 + Om * (1 + z) ** 3 + Ok * (1 + z) ** 2 + OL);
  const trap = (f, a, b, n) => { let s = (f(a) + f(b)) / 2; const h = (b - a) / n; for (let i = 1; i < n; i++) s += f(a + i * h); return s * h; };
  const tL = trap(z => 1 / ((1 + z) * E(z)), 0, 1, 20000) / H0 / (1e9 * K.yr);
  spot("lookback-time", { z: 1, H0: 67.4, Om, OL }, "tL", tL, 1e-4, "lookback time z = 1 vs independent redshift integration");
  const DC = K.c / H0 * trap(z => 1 / E(z), 0, 1, 20000) / K.Mpc;
  spot("angular-diameter-distance", { z: 1, H0: 67.4, Om, OL }, "DC", DC, 1e-4, "comoving distance z = 1 vs independent integration");
  // matter-only universe has the closed form t0 = 2/(3 H0)
  spot("lookback-time", { z: 1, H0: 67.4, Om: 1 - Or, OL: 0 }, "t0", 2 / (3 * H0) / (1e9 * K.yr), 0.01, "Einstein–de Sitter age 2/(3H₀)");
}
{ // Parker: the page's root must satisfy the transcendental equation and be supersonic beyond r_c
  const eq = data.equations.find(e => e.id === "parker-wind"), run = core.compile(eq, K);
  for (const [T, r] of [[1, 1], [1.5, 0.1], [2, 5], [1, 0.01]]) {
    const res = core.evaluate(eq, run, { T, r }, K).si;
    const u = (res.v / res.cs) ** 2, x = r * K.AU / res.rc;
    const resid = u - Math.log(u) - (4 * Math.log(x) + 4 / x - 3);
    Math.abs(resid) < 1e-6 * (1 + Math.abs(u)) ? ok() : fail("parker-wind", `root residual ${resid} at T=${T} MK, r=${r} AU`);
    (x > 1) === (u > 1) ? ok() : fail("parker-wind", `wrong branch at T=${T} MK, r=${r} AU`);
  }
}

if (showTable) {
  console.log("\nWorked examples (calculator result vs value printed on the page)");
  for (const [id, shown, val, st] of rows) console.log(`  ${st.padEnd(8)} ${id.padEnd(28)} ${shown.padEnd(22)} page: ${val}`);
}
console.log(`\n${checks} checks passed, ${fails} failed · ${data.equations.length} equations · ${data.constants.length} constants`);
process.exit(fails ? 1 : 0);
