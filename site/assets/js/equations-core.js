/* Equation Atlas core — no DOM. Shared by the page (equations.js), the
 * verification script (scripts/check_equations.mjs) and the Markdown
 * generator (scripts/build_equations_md.mjs), so the numbers on the site, in
 * docs/EQUATIONS.md and in the tests all come from the same code.
 *
 * Data model (site/data/equations.json):
 *   input.value / min / max are in DISPLAY units; input.mul converts to SI
 *   (a number or an expression over the constants, e.g. "AU", "PI/180").
 *   output.expr is a JavaScript expression in SI units that can use the
 *   constants (G, c, h …), Math functions (sqrt, log …), the input ids and
 *   any earlier output ids. output.div converts the SI result to display units.
 */

/** Composite Simpson rule ∫ f(x) dx from a to b with n (even) intervals. */
function simpson(f, a, b, n = 400) {
  if (!(b !== a)) return 0;
  n += n % 2;
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(a + i * h);
  return s * h / 3;
}
/** Bisection root of f on [lo, hi] (f(lo) and f(hi) must differ in sign); geometric steps when both ends > 0. */
function bisect(f, lo, hi, iters = 200) {
  let flo = f(lo);
  if (flo === 0) return lo;
  if (Math.sign(flo) === Math.sign(f(hi))) return NaN;
  const geo = lo > 0 && hi / lo > 1e3;
  for (let i = 0; i < iters; i++) {
    const mid = geo ? Math.sqrt(lo * hi) : (lo + hi) / 2;
    const fm = f(mid);
    if (fm === 0) return mid;
    if (Math.sign(fm) === Math.sign(flo)) { lo = mid; flo = fm; } else hi = mid;
    if (Math.abs(hi - lo) <= 1e-13 * Math.abs(mid)) break;
  }
  return geo ? Math.sqrt(lo * hi) : (lo + hi) / 2;
}

/** Curvature function S_k (Hogg 1999): sinh for open (k > 0), sin for closed (k < 0), identity for flat. */
function sinn(x, k) {
  if (Math.abs(k) < 1e-9) return x;
  const q = Math.sqrt(Math.abs(k));
  return k > 0 ? Math.sinh(q * x) / q : Math.sin(q * x) / q;
}

export const MATH = {
  sqrt: Math.sqrt, cbrt: Math.cbrt, pow: Math.pow, exp: Math.exp, log: Math.log, log10: Math.log10,
  log1p: Math.log1p, expm1: Math.expm1, sin: Math.sin, cos: Math.cos, tan: Math.tan, atan: Math.atan,
  atan2: Math.atan2, asin: Math.asin, acos: Math.acos, sinh: Math.sinh, tanh: Math.tanh, floor: Math.floor,
  abs: Math.abs, min: Math.min, max: Math.max, PI: Math.PI, simpson, bisect, sinn
};

/** constants array → { key: value } */
export function makeScope(constants) {
  const K = {};
  for (const c of constants) K[c.key] = c.value;
  return K;
}

/** Evaluate a unit factor: number, or an expression over constants + Math. */
const FACTORS = new WeakMap();
export function factor(x, K) {
  if (x == null) return 1;
  if (typeof x === "number") return x;
  let memo = FACTORS.get(K);
  if (!memo) FACTORS.set(K, memo = new Map());
  if (!memo.has(x)) {
    const names = [...Object.keys(K), ...Object.keys(MATH)];
    const vals = [...Object.values(K), ...Object.values(MATH)];
    memo.set(x, new Function(...names, `"use strict"; return (${x});`)(...vals));
  }
  return memo.get(x);
}

/** Order in which outputs are evaluated: plain outputs first, then ones marked `after`. */
export function evalOrder(outputs) {
  return [...outputs.filter(o => !o.after), ...outputs.filter(o => o.after)];
}

/**
 * Compile an equation's calculator. Returns run(siInputs) → { outId: SI value }.
 * Throws if an expression does not parse (the check script reports that).
 */
export function compile(eq, K) {
  const inIds = eq.calc.inputs.map(i => i.id);
  const kNames = Object.keys(K), mNames = Object.keys(MATH);
  const kVals = kNames.map(k => K[k]), mVals = mNames.map(m => MATH[m]);
  const done = [];
  const fns = evalOrder(eq.calc.outputs).map(o => {
    const fn = new Function(...kNames, ...mNames, ...inIds, ...done, `"use strict"; return (${o.expr});`);
    done.push(o.id);
    return { id: o.id, fn };
  });
  return function run(si) {
    const args = [...kVals, ...mVals, ...inIds.map(id => si[id])];
    const res = {};
    for (const { id, fn } of fns) {
      let v;
      try { v = fn(...args); } catch (e) { v = NaN; }
      if (typeof v !== "number") v = NaN;
      res[id] = v;
      args.push(v);
    }
    return res;
  };
}

/** Display value → SI for one input. Select options already hold SI values. */
export function toSI(input, display, K) {
  if (input.type === "select") return +display;
  return display * factor(input.mul, K);
}
export function fromSI(input, si, K) {
  if (input.type === "select") return si;
  return si / factor(input.mul, K);
}

/** Default display values, optionally overridden: { id: displayValue } */
export function displayValues(eq, overrides = {}) {
  const d = {};
  for (const i of eq.calc.inputs) d[i.id] = i.id in overrides ? overrides[i.id] : i.value;
  return d;
}
export function siValues(eq, display, K) {
  const s = {};
  for (const i of eq.calc.inputs) s[i.id] = toSI(i, display[i.id], K);
  return s;
}

/** Compute every output for a set of display inputs; returns { id: displayValue } and raw SI. */
export function evaluate(eq, run, display, K) {
  const si = run(siValues(eq, display, K));
  const shown = {};
  for (const o of eq.calc.outputs) shown[o.id] = o.fmt === "time" ? si[o.id] : si[o.id] / factor(o.div, K);
  return { si, shown };
}

/* ------------------------------------------------------------ formatting */

const SUP = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
export const sup = s => String(s).replace(/[-0-9]/g, ch => SUP[ch]);

/**
 * Format a number to `sig` significant figures.
 * mode "html" → 1.989 × 10<sup>30</sup>, "text" → 1.989 × 10³⁰, "tex" → 1.989 \times 10^{30}
 */
export function fmt(v, sig = 4, mode = "text") {
  if (v == null || !isFinite(v)) return "—";
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1e6 || a < 1e-3) {
    let [m, e] = v.toExponential(sig - 1).split("e");
    m = m.replace(/\.?0+$/, "");
    const ex = String(+e);
    if (m === "1" || m === "-1") m = m === "1" ? "" : "−";
    const minus = s => s.replace("-", "−");
    const pre = m ? minus(m) + (mode === "tex" ? " \\times " : " × ") : "";
    if (mode === "html") return `${pre}10<sup>${minus(ex)}</sup>`;
    if (mode === "tex") return `${pre}10^{${ex}}`;
    return `${pre}10${sup(ex)}`;
  }
  const digits = Math.max(0, sig - 1 - Math.floor(Math.log10(a)));
  let s = v.toLocaleString("en-US", { maximumFractionDigits: Math.min(digits, 12), minimumFractionDigits: 0 });
  s = s.replace("-", "−");
  if (mode === "tex") s = s.replace(/,/g, "{,}");
  return s;
}

/** Plain, re-parseable number for text boxes. */
export function plain(v) {
  if (!isFinite(v)) return "";
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e6 || a < 1e-3)) return v.toExponential(4).replace(/\.?0+e/, "e").replace("e+", "e");
  return String(+v.toPrecision(6));
}

/** Seconds → { value, unit } in the most readable unit. */
export function timeParts(s) {
  if (!isFinite(s)) return { value: NaN, unit: "" };
  const a = Math.abs(s);
  const YR = 31557600;
  if (a < 1e-6) return { value: s * 1e9, unit: "ns" };
  if (a < 1e-3) return { value: s * 1e6, unit: "μs" };
  if (a < 1) return { value: s * 1e3, unit: "ms" };
  if (a < 120) return { value: s, unit: "s" };
  if (a < 7200) return { value: s / 60, unit: "min" };
  if (a < 3 * 86400) return { value: s / 3600, unit: "h" };
  if (a < 2 * YR) return { value: s / 86400, unit: "days" };
  return { value: s / YR, unit: "years" };
}

/** Format an output's display value (already divided) → { num, unit } */
export function formatOutput(o, value, mode = "text") {
  if (o.fmt === "flare") return { num: flareClass(value), unit: o.unit || "" };
  if (o.fmt === "time") {
    const t = timeParts(value);
    return { num: fmt(t.value, o.sig || 4, mode), unit: t.unit };
  }
  return { num: fmt(value, o.sig || 4, mode), unit: o.unit || "" };
}

/** Soft X-ray (0.1–0.8 nm) peak flux in W/m² → NOAA flare class, e.g. 9.3e-4 → "X9.3". */
export function flareClass(F) {
  if (!(F > 0) || !isFinite(F)) return "—";
  const L = [["A", 1e-8], ["B", 1e-7], ["C", 1e-6], ["M", 1e-5], ["X", 1e-4]];
  let k = 0;
  while (k < L.length - 1 && F >= L[k + 1][1] * (1 - 1e-9)) k++;
  let n = F / L[k][1];
  if (n < 10 && +n.toFixed(1) >= 10 && k < L.length - 1) { k++; n = 1; } // 9.99 × 10⁻⁶ reads as M1.0, not C10.0
  return L[k][0] + (n >= 10 ? n.toFixed(0) : n.toFixed(1));
}

/** Two-digit chapter label: 1 → "01", 10 → "10" */
export const chapLabel = n => String(n).padStart(2, "0");

/** Section numbering "2.3" for an equation */
export function numbering(data) {
  const map = {};
  for (const ch of data.chapters) {
    let k = 0;
    for (const eq of data.equations) if (eq.chapter === ch.id) map[eq.id] = `${ch.n}.${++k}`;
  }
  return map;
}
