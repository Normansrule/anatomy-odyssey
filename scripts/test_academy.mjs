#!/usr/bin/env node
/* Checks for Space Academy (site/academy.html, site/data/academy.json).
 *
 *   node --no-warnings scripts/test_academy.mjs [--strict]
 *
 * 1. Course shape: 4 tracks × 5 lessons, unique ids, 60–120-word lessons,
 *    2–3 "go deeper" links, 3–5 questions with exactly one numeric question.
 * 2. Every multiple-choice question has exactly one correct option.
 * 3. Every numeric answer is recomputed, either with the Equation Atlas
 *    calculator it names (equations-core.js + equations.json, display units)
 *    or with an explicit formula over the Equation Atlas constants, and must
 *    agree within the question's tolerance.
 * 4. Every link target exists: the page is a file in site/, and the anchor is
 *    an element id in that page, an equation id (equations.html) or an Orbit
 *    Lab mode (orbits.html#cannon …). A page that is registered in codex.js
 *    but not yet on disk (being built in parallel) is a warning, or a
 *    failure with --strict.
 * 5. Widgets reference real calculators, inputs, outputs and order sets.
 * 6. Acronyms are written out in full at their first use in each lesson.
 * 7. The widget physics in academy.js: Lambert solver (propagated back with
 *    RK4), hoverslam vs v²/2a, max-Q timing, flyby turn angle, Airy/Bessel
 *    zero, circle overlap, blackbody colour, grading and the progress code.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeScope, compile, displayValues, evaluate, MATH } from "../site/assets/js/equations-core.js";
import * as A from "../site/assets/js/academy.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "site");
const STRICT = process.argv.includes("--strict");
const course = JSON.parse(fs.readFileSync(path.join(SITE, "data/academy.json"), "utf8"));
const eqData = JSON.parse(fs.readFileSync(path.join(SITE, "data/equations.json"), "utf8"));
const EQ = Object.fromEntries(eqData.equations.map((e) => [e.id, e]));
const K = makeScope(eqData.constants);

let passes = 0, fails = 0, warns = 0;
const check = (name, ok, detail = "") => { if (ok) passes++; else { fails++; console.log(`FAIL  ${name}  ${detail}`); } };
const warn = (name, detail) => { warns++; console.log(`WARN  ${name}  ${detail}`); };

/* ---------------------------------------------------------------- 1. shape */
check("4 tracks", course.tracks.length === 4, `got ${course.tracks.length}`);
const lessons = A.allLessons(course);
check("20 lessons", lessons.length === 20, `got ${lessons.length}`);
course.tracks.forEach((t) => check(`track ${t.id} has 5 lessons`, t.lessons.length === 5));
const ids = new Set();
for (const l of lessons) { check(`unique lesson id ${l.id}`, !ids.has(l.id)); ids.add(l.id); }

const words = (s) => s.replace(/\$[^$]+\$/g, " X ").split(/\s+/).filter((w) => /[\wÀ-ɏ0-9√Δ]/.test(w)).length;

/* ---------------------------------------------------- 4. link targets (setup) */
const codexJs = fs.readFileSync(path.join(SITE, "assets/js/codex.js"), "utf8");
const registered = new Set([...codexJs.matchAll(/\["([\w-]+)",\s*"[^"]*",\s*"([\w-]+\.html)"/g)].map((m) => m[2]));
const htmlIds = {};
function idsOf(page) {
  if (!htmlIds[page]) {
    const f = path.join(SITE, page);
    htmlIds[page] = fs.existsSync(f) ? new Set([...fs.readFileSync(f, "utf8").matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])) : null;
  }
  return htmlIds[page];
}
const orbitModes = (() => {
  const src = fs.readFileSync(path.join(SITE, "assets/js/orbits.js"), "utf8");
  const m = src.match(/const MODES = \{([^}]*)\}/);
  return new Set(m ? m[1].split(",").map((s) => s.trim()).filter(Boolean) : []);
})();
function checkLink(where, href) {
  const [page, anchor] = href.split("#");
  const exists = fs.existsSync(path.join(SITE, page));
  if (!exists) {
    if (registered.has(page) && !STRICT) { warn(`${where} → ${href}`, "page registered in codex.js but not on disk yet"); return; }
    check(`${where} → ${href}`, false, "page does not exist"); return;
  }
  if (!anchor) { check(`${where} → ${href}`, true); return; }
  let ok;
  if (page === "equations.html") ok = !!EQ[anchor];
  else if (page === "orbits.html") ok = orbitModes.has(anchor) || idsOf(page).has(anchor);
  else ok = idsOf(page).has(anchor);
  check(`${where} → ${href}`, ok, "anchor not found");
}

/* ------------------------------------------------------- 6. acronyms (setup) */
// Acronym → it must first appear as "(ACR)" or "(ACRs)" right after its full name.
const ACRONYMS = ["NASA", "ISS", "LEO", "GEO", "Isp", "AU", "CME", "EDL", "DSN", "dB", "RTG", "MLI", "TRL", "PDR", "CDR", "MCR", "FRR", "KDP", "JPL", "GAO", "ESA", "JWST"];
function checkAcronyms(l) {
  const text = [l.title, ...l.body, l.widget.caption || "", ...l.quiz.flatMap((q) => [q.q, ...(q.options || []).map((o) => o.t), q.explain])].join("\n");
  for (const a of ACRONYMS) {
    const re = new RegExp(`(^|[^A-Za-z])${a}s?(?![A-Za-z])`, "g");
    const m = re.exec(text);
    if (!m) continue;
    const at = m.index + m[1].length;
    const ok = text[at - 1] === "(";
    check(`lesson ${l.id}: acronym ${a} spelled out at first use`, ok, `first seen: "…${text.slice(Math.max(0, at - 40), at + 12).replace(/\n/g, " ")}…"`);
  }
}

/* ------------------------------------------------------- 3. numeric answers */
const runs = {};
function recompute(chk) {
  if (chk.eq) {
    const eq = EQ[chk.eq];
    if (!eq) throw new Error(`unknown equation ${chk.eq}`);
    for (const k of Object.keys(chk.set)) if (!eq.calc.inputs.some((i) => i.id === k)) throw new Error(`${chk.eq} has no input ${k}`);
    runs[chk.eq] ||= compile(eq, K);
    const { shown } = evaluate(eq, runs[chk.eq], displayValues(eq, chk.set), K);
    if (!(chk.out in shown)) throw new Error(`${chk.eq} has no output ${chk.out}`);
    return shown[chk.out];
  }
  if (chk.formula) {
    const names = [...Object.keys(K), ...Object.keys(MATH)], vals = [...Object.values(K), ...Object.values(MATH)];
    return new Function(...names, `"use strict"; return (${chk.formula});`)(...vals);
  }
  throw new Error("check has neither eq nor formula");
}

const WIDGETS = new Set(["calc", "cannon", "rocket", "staging", "maxq", "landing", "kepler", "porkchop", "flyby", "blackbody", "airy", "transit", "link", "order"]);
let nQ = 0, nMC = 0, nNum = 0;
for (const l of lessons) {
  const w = words(l.body.join(" "));
  check(`lesson ${l.id}: 60–120 words`, w >= 60 && w <= 120, `${w} words`);
  check(`lesson ${l.id}: 2–3 links`, l.links.length >= 2 && l.links.length <= 3, `${l.links.length}`);
  l.links.forEach((k) => checkLink(`lesson ${l.id}`, k.href));
  check(`lesson ${l.id}: 3–5 questions`, l.quiz.length >= 3 && l.quiz.length <= 5, `${l.quiz.length}`);
  check(`lesson ${l.id}: exactly one numeric question`, l.quiz.filter((q) => q.type === "num").length === 1);
  check(`lesson ${l.id}: star inside the map`, l.star[0] > 10 && l.star[0] < 990 && l.star[1] > 10 && l.star[1] < 630);
  checkAcronyms(l);
  l.quiz.forEach((q, i) => {
    nQ++;
    const name = `lesson ${l.id} Q${i + 1}`;
    check(`${name}: has explanation`, typeof q.explain === "string" && q.explain.length > 10);
    if (q.type === "mc") {
      nMC++;
      const nOk = q.options.filter((o) => o.ok === true).length;
      check(`${name}: exactly one correct option`, nOk === 1, `${nOk} marked correct`);
      check(`${name}: at least 3 options`, q.options.length >= 3);
      check(`${name}: options are distinct`, new Set(q.options.map((o) => o.t)).size === q.options.length);
      check(`${name}: no stray 'ok' values`, q.options.every((o) => o.ok === undefined || o.ok === true));
    } else if (q.type === "num") {
      nNum++;
      check(`${name}: answer and tolerance`, isFinite(q.answer) && q.tol >= 0);
      let v = NaN;
      try { v = recompute(q.check); } catch (e) { check(`${name}: recompute`, false, e.message); return; }
      const ok = Math.abs(v - q.answer) <= q.tol + 1e-9;
      check(`${name}: answer ${q.answer} matches recomputed ${+v.toPrecision(6)} (±${q.tol})`, ok, `recomputed ${v}`);
      // the stated answer itself must be graded correct, and a clearly wrong one must not
      check(`${name}: grader accepts the answer`, A.gradeNumeric(String(q.answer), q) === true);
      check(`${name}: grader rejects a wrong answer`, A.gradeNumeric(String(q.answer * 1.5 + 1), q) === false);
    } else check(`${name}: known type`, false, q.type);
  });
  // widget
  const wg = l.widget;
  check(`lesson ${l.id}: widget type ${wg.type}`, WIDGETS.has(wg.type));
  if (wg.type === "calc") {
    const eq = EQ[wg.eq];
    check(`lesson ${l.id}: calc equation ${wg.eq} exists`, !!eq);
    if (eq) {
      const ins = new Set(eq.calc.inputs.map((i) => i.id)), outs = new Set(eq.calc.outputs.map((o) => o.id));
      wg.sliders.forEach((s) => check(`lesson ${l.id}: slider ${s} is an input of ${wg.eq}`, ins.has(s)));
      wg.show.forEach((s) => check(`lesson ${l.id}: output ${s} of ${wg.eq}`, outs.has(s)));
      Object.keys(wg.fixed || {}).forEach((s) => check(`lesson ${l.id}: fixed ${s} is an input`, ins.has(s)));
      (wg.presets || []).forEach((p) => Object.keys(p.set).forEach((s) => check(`lesson ${l.id}: preset key ${s}`, ins.has(s))));
      runs[wg.eq] ||= compile(eq, K);
      const { shown } = evaluate(eq, runs[wg.eq], displayValues(eq, wg.fixed || {}), K);
      wg.show.forEach((s) => check(`lesson ${l.id}: widget output ${s} is finite`, isFinite(shown[s]), String(shown[s])));
    }
  }
  if (wg.type === "order") check(`lesson ${l.id}: order set ${wg.set}`, !!course.orderSets[wg.set] && course.orderSets[wg.set].items.length === 9);
}
check("badges: one per track", course.tracks.every((t) => course.badges.some((b) => b.rule.track === t.id)));
check("badges: Escape velocity is Track 1's", course.badges.find((b) => b.id === "escape-velocity").rule.track === "t1");
check("badges: Mission Specialist needs all 20", course.badges.find((b) => b.id === "mission-specialist").rule.lessons === 20);

/* --------------------------------------------- 4b. links in the page itself */
const pageHtml = fs.readFileSync(path.join(SITE, "academy.html"), "utf8");
check("academy.html: no class=\"sim\"", !/<body[^>]*class="[^"]*\bsim\b/.test(pageHtml));
check("academy.html: data-page=academy", /<body[^>]*data-page="academy"/.test(pageHtml));
check("academy registered in codex.js", registered.has("academy.html"));

/* ---------------------------------------------------------------- 7. physics */
{
  // Lambert: solve, then propagate r1,v1 for tof with RK4 and land on r2
  const mu = 1, r1 = [1, 0], r2 = [Math.cos(2.2) * 1.52, Math.sin(2.2) * 1.52];
  for (const tof of [2.5, 3.5, 5]) {
    const L = A.lambert2D(r1, r2, tof, mu);
    let x = r1[0], y = r1[1], vx = L.v1[0], vy = L.v1[1];
    const n = 20000, h = tof / n;
    const f = (s) => { const r = Math.hypot(s[0], s[1]); const k = -mu / r ** 3; return [s[2], s[3], k * s[0], k * s[1]]; };
    let s = [x, y, vx, vy];
    for (let i = 0; i < n; i++) {
      const k1 = f(s), k2 = f(s.map((v, j) => v + h / 2 * k1[j])), k3 = f(s.map((v, j) => v + h / 2 * k2[j])), k4 = f(s.map((v, j) => v + h * k3[j]));
      s = s.map((v, j) => v + h / 6 * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
    }
    const err = Math.hypot(s[0] - r2[0], s[1] - r2[1]), verr = Math.hypot(s[2] - L.v2[0], s[3] - L.v2[1]);
    check(`Lambert tof=${tof}: propagated position lands on r2`, err < 1e-6, `miss ${err.toExponential(2)}`);
    check(`Lambert tof=${tof}: arrival velocity matches`, verr < 1e-6, `err ${verr.toExponential(2)}`);
  }
  // Near-Hohmann Earth→Mars: departure speed ≈ perihelion speed of the transfer ellipse (vis-viva)
  const AU = 1, muS = 2.959122082855911e-4;  // AU³/day² (Gaussian gravitational constant squared)
  const r2m = 1.524, th = Math.PI * 0.999;
  const aT = (1 + r2m) / 2, tH = Math.PI * Math.sqrt(aT ** 3 / muS);
  const L = A.lambert2D([AU, 0], [r2m * Math.cos(th), r2m * Math.sin(th)], tH * 0.999, muS);
  const vp = Math.sqrt(muS * (2 / 1 - 1 / aT)), got = Math.hypot(...L.v1);
  check("Lambert ≈ Hohmann departure speed", Math.abs(got / vp - 1) < 0.01, `${(got * 1731.46).toFixed(3)} vs ${(vp * 1731.46).toFixed(3)} km/s`);
  // Porkchop: the 2026 Earth–Mars window. Real minimum launch energy is late Oct–Nov 2026, C3 ≈ 9–10 km²/s² (v∞ ≈ 3 km/s).
  let best = { t: Infinity };
  const jd0 = 2461161.5 + 150;   // 2026-10-26 ± 60 days
  for (let d = -60; d <= 60; d += 5) for (let tof = 150; tof <= 400; tof += 10) { const c = A.porkchopCell(jd0 + d, tof); if (c && c.total < best.t) best = { t: c.total, d, tof, c }; }
  check("porkchop: 2026 window minimum between 5 and 7 km/s", best.t > 5 && best.t < 7, `min ${best.t.toFixed(2)} km/s at day ${best.d}, tof ${best.tof}`);
  check("porkchop: departure v∞ near 3 km/s", best.c.dep > 2.5 && best.c.dep < 4, `${best.c.dep.toFixed(2)} km/s`);
}
{
  // Hoverslam: with a near-constant mass the stopping height is v²/2a
  const F = 482e3, m0 = 26000, v0 = 250;
  const a = F / m0 - 9.80665;
  const hi = A.idealIgnition(v0, { isp: 1e9 });
  check("hoverslam: constant-mass ignition height = v²/2a", Math.abs(hi - v0 * v0 / (2 * a)) < 1, `${hi.toFixed(1)} vs ${(v0 * v0 / (2 * a)).toFixed(1)} m`);
  const hReal = A.idealIgnition(v0);
  check("hoverslam: burning propellant lowers the ignition height", hReal < hi && hReal > 0.8 * hi, `${hReal.toFixed(0)} m`);
  const r = A.landingSim({ h0: hReal, v0 });
  check("hoverslam: ideal height stops at the pad", Math.abs(r.hStop) < 0.5 && r.stopped, `${r.hStop}`);
  const early = A.landingSim({ h0: hReal + 500, v0 }), late = A.landingSim({ h0: hReal - 500, v0 });
  check("hoverslam: too early stops in mid-air", early.stopped && early.hStop > 400);
  check("hoverslam: too late hits the pad", !late.stopped && late.vImpact > 50);
  check("hoverslam: minimum throttle out-pushes the booster (T/W > 1)", F / (m0 * 9.80665) > 1.8, (F / (m0 * 9.80665)).toFixed(2));
}
{
  // Max-Q toy ascent: q function must equal the Equation Atlas dynamic-pressure calculator
  const eq = EQ["dynamic-pressure"], run = compile(eq, K);
  const qEq = (h, v) => evaluate(eq, run, displayValues(eq, { alt: h / 1000, v }), K).shown.q * 1000;
  check("max-Q: default model = Equation Atlas dynamic pressure", Math.abs(qEq(11000, 400) - 0.5 * 1.225 * Math.exp(-11000 / 8500) * 160000) < 1e-6);
  const s = A.ascent({ tw: 1.4, qfn: qEq });
  check("max-Q: peak about a minute after liftoff", s.peak.t > 45 && s.peak.t < 80, `T+${s.peak.t.toFixed(0)} s`);
  check("max-Q: peak 8–16 km up", s.peak.h > 8000 && s.peak.h < 16000, `${(s.peak.h / 1000).toFixed(1)} km`);
  const hot = A.ascent({ tw: 1.9, qfn: qEq }), hotB = A.ascent({ tw: 1.9, bucket: true, qfn: qEq });
  check("max-Q: throttle bucket lowers the peak", hotB.peak.q < hot.peak.q, `${(hot.peak.q / 1000).toFixed(1)} → ${(hotB.peak.q / 1000).toFixed(1)} kPa`);
}
{
  // Flyby: δ from the hyperbola; |Δv| = 2 v∞ sin(δ/2); speed in planet frame unchanged
  const f = A.flyby({ vinf: 6, rp: 5e5 });
  const e = 1 + 5e5 * 36 / A.JUPITER.mu;
  check("flyby: turn angle 2 asin(1/e)", Math.abs(f.delta - 2 * Math.asin(1 / e)) < 1e-12);
  const dv = Math.hypot(f.vout[0] - f.vin[0], f.vout[1] - f.vin[1]);
  check("flyby: |Δv| = 2 v∞ sin(δ/2)", Math.abs(dv - 2 * 6 * Math.sin(f.delta / 2)) < 1e-9);
  const a = A.flyby({ vinf: 6, rp: 5e5, sign: -1 }), b = A.flyby({ vinf: 6, rp: 5e5, sign: 1 });
  check("flyby: one side gains, the other loses", (a.sOut - a.sIn) * (b.sOut - b.sIn) < 0);
}
{
  check("Bessel J1 first zero at 3.8317", Math.abs(A.besselJ1(3.8317)) < 1e-4, A.besselJ1(3.8317).toExponential(2));
  check("Bessel J1(1) = 0.44005", Math.abs(A.besselJ1(1) - 0.44005059) < 1e-6);
  check("Airy first dark ring at 1.22 λ/D", A.airy(1.2197 * Math.PI) < 1e-6);
  check("circle overlap: small disk inside", Math.abs(A.circleOverlap(0, 1, 0.1) - Math.PI * 0.01) < 1e-12);
  check("circle overlap: half way", Math.abs(A.circleOverlap(1, 1, 0.1) / (Math.PI * 0.01) - 0.5) < 0.05);
  const sun = A.blackbodyRGB(5772), cool = A.blackbodyRGB(3000), hot = A.blackbodyRGB(20000);
  check("blackbody: 3000 K is reddish", cool[0] > cool[2] + 60, cool.join(","));
  check("blackbody: 20000 K is bluish", hot[2] > hot[0], hot.join(","));
  check("blackbody: the Sun is near white", Math.min(...sun) > 200, sun.join(","));
  const c = A.cannon(7.6726, 400);
  check("cannon: circular speed at 400 km is circular", c.outcome === "circular", c.outcome);
  check("cannon: 12 km/s escapes", A.cannon(12, 400).outcome === "escape");
  check("cannon: 5 km/s crashes", A.cannon(5, 400).outcome === "crash");
  const last = c.pts.at(-1);
  check("cannon: RK4 orbit closes (energy kept)", Math.abs(Math.hypot(...last) - 6771) < 1, Math.hypot(...last).toFixed(3));
}
{
  // Grading and progress code
  const q = { answer: 2500, tol: 25 };
  for (const [s, want] of [["2500", true], ["2,500", true], ["2 500", true], ["2.5e3", true], ["2600", false], ["abc", null]]) check(`grade "${s}"`, A.gradeNumeric(s, q) === want);
  check("grade decimal comma 7,67", A.gradeNumeric("7,67", { answer: 7.67, tol: 0.05 }) === true);
  const st = A.emptyState();
  st.p["kepler"] = { c: 4, n: 5, t: 1700000000000 }; st.p["staging"] = { c: 3, n: 5, t: 0 }; st.last = "staging"; st.name = "Ada Lovelace — Ω";
  const code = A.encodeProgress(st), back = A.decodeProgress(code, course);
  check("progress code round-trips", JSON.stringify(back.p) === JSON.stringify(st.p) && back.name === st.name && back.last === "staging", code);
  let threw = false; try { A.decodeProgress("SA1-notbase64!!", course); } catch (e) { threw = true; } check("bad code rejected", threw);
  const s1 = A.stats(course, st);
  check("stats: 80 % completes a lesson", s1.doneSet.has("kepler") && !s1.doneSet.has("staging"));
  check("stats: XP = 20 per correct + 100 per completed lesson", s1.xp === 4 * 20 + 100 + 3 * 20, String(s1.xp));
  const all = A.emptyState(); for (const l of lessons) all.p[l.id] = { c: 5, n: 5, t: 0 };
  const s2 = A.stats(course, all);
  check("stats: all badges when everything is perfect", s2.badges.length === course.badges.length, s2.badges.join(","));
}

console.log(`\n${lessons.length} lessons · ${nQ} questions (${nMC} multiple choice, ${nNum} numeric)`);
console.log(`${passes} passed, ${fails} failed, ${warns} warnings`);
process.exit(fails ? 1 : 0);
