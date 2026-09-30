/* Cosmic Library · Mission Designer (mission-designer.html)
 *
 * A five-step Pre-Phase A concept study, in the spirit of a JPL Team X session:
 *   1 destination & goal → 2 launch window (porkchop) → 3 launch vehicle →
 *   4 spacecraft budgets → 5 review ("does it close?").
 * All physics lives in mission-physics.js (pure, tested by scripts/test_mission.mjs);
 * data, sources and presets in data/mission-designer.json. This file is the
 * interface: DOM, canvases (porkchop, payload-vs-C3, link) and the Three.js view.
 *
 * URL flags: ?still (no animation, for screenshots), ?q=low (lighter 3-D).
 * Test hooks: window.__sim = { state, result, go(step), pick(dep, tof), preset(id), ready }.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as P from "./mission-physics.js";
import { heliocentric, moonGeocentric, orbitPath, AU_KM } from "./ephemeris.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const Q = new URLSearchParams(location.search);
const STILL = Q.has("still"), LOW = Q.get("q") === "low";
const RM = !!(window.Codex && Codex.reducedMotion);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const nf = (v, d = 0) => (isFinite(v) ? v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d }) : "—");
const kg = (m) => (!isFinite(m) ? "—" : m >= 10000 ? nf(m / 1000, 1) + " t" : m >= 1000 ? nf(m / 1000, 2) + " t" : nf(m, m < 10 ? 1 : 0) + " kg");
const pct = (x, d = 0) => (isFinite(x) ? (x >= 0 ? "+" : "−") + nf(Math.abs(x) * 100, d) + " %" : "—");
const rate = (b) => (b >= 1e6 ? nf(b / 1e6, b >= 1e7 ? 0 : 2) + " Mbit/s" : b >= 1e3 ? nf(b / 1e3, b >= 1e5 ? 0 : 1) + " kbit/s" : nf(b, 0) + " bit/s");
const days = (d) => (d < 10 ? nf(d, 1) + " days" : d < 700 ? nf(d, 0) + " days" : nf(d / 365.25, 1) + " years");
const lightTime = (s) => (s < 60 ? nf(s, 1) + " s" : s < 3600 ? Math.floor(s / 60) + " min " + Math.round(s % 60) + " s" : Math.floor(s / 3600) + " h " + Math.round((s % 3600) / 60) + " min");
const STATUS_WORD = { ok: "closes", warn: "thin", bad: "fails" };
const NEXT_LBL = ["", "Next: launch window →", "Next: launch vehicle →", "Next: spacecraft →", "Next: review →", "Start over"];
const TODAY = P.dateToJd(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())));

let D, V, state, R, step = 1, ready = false;
const winCache = {};

/* ======================================================================== boot */
init().catch((e) => { console.error(e); $("#loading").innerHTML = "<div>Could not load the mission data.</div>"; });

async function init() {
  if (STILL) document.body.classList.add("md-still");
  D = await (await fetch("data/mission-designer.json")).json();
  V = P.prepareVehicles(D.vehicles);
  const preset = D.presets[0].state;
  const fromHash = location.hash.length > 3;
  state = P.decodeState(location.hash, { ...preset });
  if (!D.destinations.some((d) => d.id === state.dest)) state = { ...preset };
  step = clamp(parseInt(new URLSearchParams(location.hash.slice(1)).get("step")) || 1, 1, 5);
  $("#presetSel").innerHTML = '<option value="">Presets…</option>' + D.presets.map((p) => `<option value="${p.id}">${esc(p.label)}</option>`).join("");
  if (!fromHash) $("#presetSel").value = "mars2026";
  wireGlobal();
  if (Codex.webgl()) initScene(); else Codex.noGL("The 3-D view needs WebGL; the five study steps still work.");
  recompute();
  go(step, false);
  $("#loading").classList.add("done");
  ready = true;
  window.__sim = { get state() { return state; }, get result() { return R; }, go, pick, preset: loadPreset, get ready() { return ready && (!PC || PC.done >= PC.nDep); }, get pc() { return PC; } };
}

/* ======================================================================== state */
function recompute(opts = {}) {
  R = P.evaluate(D, V, state);
  renderStatus();
  renderRail();
  if (steps[step] && steps[step].key) steps[step].update(opts);
  sceneUpdate();
  saveHash();
}
let hashT = 0;
function saveHash() {
  clearTimeout(hashT);
  hashT = setTimeout(() => history.replaceState(null, "", "#" + P.encodeState(state) + "&step=" + step), 250);
}
function set(patch, opts) { Object.assign(state, patch); $("#presetSel").value = ""; recompute(opts); }
function loadPreset(id) {
  const p = D.presets.find((x) => x.id === id);
  if (!p) return;
  state = { ...p.state };
  $("#presetSel").value = id;
  recompute();
  go(step, false, true);
  toast(p.blurb);
}
function pick(dep, tof) { set({ dep, tof }, { picked: true }); resetTime(); }

/* ======================================================================== steps */
function go(n, focus = true, rebuild = false) {
  step = clamp(n, 1, 5);
  document.body.dataset.step = step;
  $$(".md-step").forEach((s) => { s.hidden = +s.dataset.step !== step; });
  const st = steps[step];
  const key = state.dest + "|" + step;
  if (rebuild || st.key !== key) { st.build(); st.key = key; }
  st.update({});
  $("#backBtn").disabled = step === 1;
  $("#nextBtn").textContent = NEXT_LBL[step];
  $("#stepOf").textContent = `Step ${step} of 5`;
  $("#body").scrollTop = 0;
  renderRail();
  saveHash();
  requestAnimationFrame(layoutView);
  if (focus) { const h = $(`#s${step}h`); if (h) h.focus({ preventScroll: true }); }
}
function renderRail() {
  if (!R) return;
  const lvS = R.checks[0].status;
  const scS = worst(R.checks.slice(1).map((c) => c.status));
  const all = worst(R.checks.map((c) => c.status));
  const st = [null, "ok", isFinite(R.traj.c3) ? "ok" : "bad", lvS, scS, all];
  $$(".md-steps button").forEach((b) => {
    const n = +b.dataset.go;
    b.classList.toggle("cur", n === step);
    b.classList.toggle("done", n < step);
    b.dataset.s = n >= 3 ? st[n] : "";
    b.setAttribute("aria-current", n === step ? "step" : "false");
  });
  // bright part of the V up to the current step
  const pts = [[10, 6], [30, 24], [50, 42], [70, 24], [90, 6]].slice(0, step).map((p) => p.join(",")).join(" ");
  $("#vdone").setAttribute("points", step === 1 ? "10,6 10,6" : pts);
}
const worst = (a) => (a.includes("bad") ? "bad" : a.includes("warn") ? "warn" : "ok");

const steps = {
  1: { build: buildDest, update: updateDest },
  2: { build: buildWindow, update: updateWindow },
  3: { build: buildLV, update: updateLV },
  4: { build: buildSC, update: updateSC },
  5: { build: buildReview, update: updateReview }
};

/* ----------------------------------------------------------------- helpers */
const why = (id) => `<button class="md-why" data-why="${id}" aria-label="Why? ${esc(D.why[id] ? D.why[id].t : id)}">why?</button>`;
const pill = (s, txt) => `<span class="md-pill ${s}">${txt || STATUS_WORD[s]}</span>`;
function field(id, label, extra = "") {
  return `<div class="field"><label for="${id}">${label} <output id="${id}O"></output></label><input type="range" id="${id}" ${extra}></div>`;
}
/** Log-scaled range input: slider 0..1000 ↔ value in [lo, hi]. */
function logRange(el, lo, hi, get, onChange, fmt) {
  el.min = 0; el.max = 1000; el.step = 1;
  const toV = (s) => lo * Math.pow(hi / lo, s / 1000), toS = (v) => 1000 * Math.log(v / lo) / Math.log(hi / lo);
  const out = $("#" + el.id + "O");
  const sync = () => { el.value = toS(get()); paint(el); if (out) out.textContent = fmt(get()); };
  el.addEventListener("input", () => { onChange(toV(+el.value)); if (out) out.textContent = fmt(get()); paint(el); });
  el._sync = sync; sync();
}
function linRange(el, lo, hi, stepv, get, onChange, fmt) {
  el.min = lo; el.max = hi; el.step = stepv;
  const out = $("#" + el.id + "O");
  const sync = () => { el.value = get(); paint(el); if (out) out.textContent = fmt(get()); };
  el.addEventListener("input", () => { onChange(+el.value); if (out) out.textContent = fmt(get()); paint(el); });
  el._sync = sync; sync();
}
function paint(r) { const min = +r.min || 0, max = +r.max || 100; r.style.setProperty("--fill", ((r.value - min) / (max - min) * 100) + "%"); }
function seg(id, opts, cur) {
  return `<div class="seg md-seg" id="${id}" role="group">${opts.map(([v, l]) => `<button data-v="${v}" aria-pressed="${String(v) === String(cur)}">${l}</button>`).join("")}</div>`;
}
function segSync(id, cur) { $$(`#${id} button`).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === String(cur)))); }
function onSeg(id, fn) { $("#" + id).addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) fn(b.dataset.v); }); }
/** Margin gauge: red below 0, amber up to the target, green beyond. */
function gauge(value, target, lo, hi, label, s) {
  const x = (v) => clamp((v - lo) / (hi - lo), 0, 1) * 100;
  return `<div class="md-gauge ${s}" role="img" aria-label="${esc(label)}">
    <div class="tr"><i class="zr" style="width:${x(0)}%"></i><i class="za" style="left:${x(0)}%;width:${x(target) - x(0)}%"></i><i class="zg" style="left:${x(target)}%;right:0"></i></div>
    <b class="nd" style="left:${x(value)}%"></b><span class="tg" style="left:${x(target)}%"></span>
    <div class="gl"><span>${esc(label)}</span></div></div>`;
}
function advice(list) {
  return list.length ? `<ul class="md-advice">${list.map((a) => `<li class="${a[0]}">${a[1]}</li>`).join("")}</ul>` : "";
}

/* ================================================================ 1 · destination */
function buildDest() {
  const s = $("#s1");
  s.innerHTML = `
    <h2 class="md-h" id="s1h" tabindex="-1"><span class="k">Step 1</span>Destination &amp; science goal</h2>
    <p class="md-p">Every mission starts with a need: a question only this destination can answer. Pick where to go, say in one line what you want to learn, and estimate how heavy the instruments will be. Everything else in the study follows from these three choices.</p>
    <div class="md-dests" id="dests" role="radiogroup" aria-label="Destination">
      ${D.destinations.map((d) => `<button class="md-dest" role="radio" data-id="${d.id}" style="--pc:${d.color}"><i class="orb ${d.id}"></i><span class="nm">${esc(d.short)}${d.id === "asteroid" ? ' <em class="md-ill">illustrative</em>' : ""}</span><span class="ft">${esc(d.facts)}</span></button>`).join("")}
    </div>
    <div class="md-destnote" id="destNote"></div>
    <div class="field md-text"><label for="goalIn">Science goal <span class="hint">one line</span></label><input type="text" id="goalIn" maxlength="120" autocomplete="off" spellcheck="true"></div>
    <div class="md-chips" id="goalChips"></div>
    <div class="md-two">
      <div class="field md-text"><label for="nameIn">Mission name</label><input type="text" id="nameIn" maxlength="40" autocomplete="off"></div>
      <div class="field md-text"><label for="orbitSel">At the destination ${why("capture")}</label><select id="orbitSel"></select></div>
    </div>
    ${field("plIn", "Payload (instrument) mass")}
    <p class="hint md-hint" id="plHint"></p>
    <div class="md-two">
      ${field("ppIn", "Payload power")}
      ${field("yrIn", "Science phase")}
    </div>
    <div class="md-card md-hoh" id="hohCard"></div>`;
  $("#dests").addEventListener("click", (e) => { const b = e.target.closest(".md-dest"); if (b && b.dataset.id !== state.dest) chooseDest(b.dataset.id); });
  $("#dests").addEventListener("keydown", (e) => {
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key)) return;
    e.preventDefault();
    const ids = D.destinations.map((d) => d.id), i = ids.indexOf(state.dest);
    const n = ids[(i + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : ids.length - 1)) % ids.length];
    chooseDest(n); requestAnimationFrame(() => $(`.md-dest[data-id="${n}"]`).focus());
  });
  $("#goalIn").addEventListener("input", (e) => { state.goal = e.target.value; renderStatus(); saveHash(); });
  $("#nameIn").addEventListener("input", (e) => { state.name = e.target.value; renderStatus(); saveHash(); });
  $("#goalChips").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { state.goal = b.textContent; $("#goalIn").value = state.goal; renderStatus(); saveHash(); } });
  $("#orbitSel").addEventListener("change", (e) => set({ orbit: e.target.value }));
  logRange($("#plIn"), 1, 1500, () => state.payload, (v) => set({ payload: v < 20 ? Math.round(v * 10) / 10 : Math.round(v) }), kg);
  logRange($("#ppIn"), 5, 1500, () => state.payloadPower, (v) => set({ payloadPower: Math.round(v) }), (v) => nf(v) + " W");
  linRange($("#yrIn"), 0.1, 8, 0.1, () => state.years, (v) => set({ years: v }), (v) => (v < 1 ? nf(v * 12, 0) + " months" : nf(v, 1) + " years"));
}
function updateDest() {
  const d = R.dest;
  $$(".md-dest").forEach((b) => { const on = b.dataset.id === d.id; b.setAttribute("aria-checked", String(on)); b.tabIndex = on ? 0 : -1; });
  $("#destNote").innerHTML = d.note ? `<p class="md-note">${esc(d.note)}</p>` : "";
  if (document.activeElement !== $("#goalIn")) $("#goalIn").value = state.goal || "";
  if (document.activeElement !== $("#nameIn")) $("#nameIn").value = state.name || "";
  $("#goalChips").innerHTML = d.goals.map((g) => `<button class="chip">${esc(g)}</button>`).join("");
  $("#orbitSel").innerHTML = d.orbits.map((o) => `<option value="${o.id}"${o.id === R.opt.id ? " selected" : ""}>${esc(o.label)}</option>`).join("");
  $("#plHint").textContent = d.payloadHint;
  ["plIn", "ppIn", "yrIn"].forEach((id) => $("#" + id)._sync());
  let h;
  if (d.id === "moon") {
    const lt = P.lunarTransfer(5);
    h = `<div class="md-hohk">Classic lunar transfer ${why("hohmann")}</div><div class="md-hohv">
      <span><b>${nf(lt.c3, 2)}</b> km²/s² launch energy</span><span><b>${nf(lt.tof, 1)}</b> days</span><span><b>${nf(lt.vinfArr, 2)}</b> km/s at the Moon</span></div>`;
  } else {
    const hb = P.hohmannBodies("earth", d.id, state.dep);
    h = `<div class="md-hohk">Hohmann baseline, circular orbits ${why("hohmann")}</div><div class="md-hohv">
      <span><b>${nf(hb.dv1, 2)}</b> km/s leaving Earth (C3 ${nf(hb.c3, 1)})</span><span><b>${days(hb.tof)}</b> flight</span><span><b>${nf(hb.dv2, 2)}</b> km/s arriving</span></div>
      <p class="hint">Synodic period ${nf(P.synodicDays(d.id), 0)} days: the planets line up for a cheap launch that often.</p>`;
  }
  $("#hohCard").innerHTML = h;
}
function chooseDest(id) {
  const d = D.destinations.find((x) => x.id === id), prev = R.dest;
  const patch = { dest: id, orbit: d.orbits[0].id };
  // carry over the text unless the user wrote their own
  const presetNames = D.presets.map((p) => p.state.name), presetGoals = D.presets.map((p) => p.state.goal);
  if (!state.goal || prev.goals.includes(state.goal) || presetGoals.includes(state.goal)) patch.goal = d.goals[0];
  if (!state.name || presetNames.includes(state.name) || /^\S+ Pathfinder$/.test(state.name)) patch.name = d.short + " Pathfinder";
  if (id === "moon") { patch.dep = Math.round(TODAY + 30) + 0.5; patch.tof = d.tofDefault; }
  else {
    const w = windowsFor(d);
    const next = w.windows.find((x) => x.jd > TODAY - 45) || w.windows[0];
    const rdv = d.orbits[0].kind === "rendezvous";
    const r = next ? refineWin(d, next.jd, next.tof, rdv ? (t) => P.departureDv(t.c3) + t.vinfArr : undefined, true) : null;
    if (r) { patch.dep = r.jdDep; patch.tof = r.tof; }
  }
  Object.assign(patch, d.defaults || {});
  set(patch);
  resetTime();
  steps[1].update();
}
function windowsFor(d) {
  if (!winCache[d.id]) winCache[d.id] = P.findWindows("earth", d.id, Math.min(TODAY, 2461250) - 60, d.scanYears, d.tofRange[0], d.tofRange[1], 4);
  return winCache[d.id];
}
function refineWin(d, jd, tof, cost, future = false) {
  const hw = d.halfWidth, d0 = future ? Math.max(jd - hw, TODAY + 7) : jd - hw;
  return P.refineMin("earth", d.id, Math.max(jd, d0 + 0.5), tof, cost, 6, { d0, d1: jd + hw, t0: d.tofRange[0], t1: d.tofRange[1] });
}

/* ================================================================ 2 · launch window */
let PC = null, pcKey = "", pcRaf = 0, pcContours = null, pcHover = null, pcView = null;
function pcCenter() {
  const d = R.dest, w = windowsFor(d).windows;
  let best = null;
  for (const x of w) if (Math.abs(x.jd - state.dep) < d.halfWidth * 0.8 && (!best || Math.abs(x.jd - state.dep) < Math.abs(best.jd - state.dep))) best = x;
  return best ? Math.round(best.jd) : Math.round(state.dep);
}
function buildWindow() {
  const s = $("#s2"), d = R.dest;
  if (d.id === "moon") return buildLunar();
  s.innerHTML = `
    <h2 class="md-h" id="s2h" tabindex="-1"><span class="k">Step 2</span>Launch window</h2>
    <p class="md-p">Earth and ${esc(d.short)} line up for a cheap transfer only once every ${nf(P.synodicDays(d.id), 0)} days. Below, every pixel is a solution of Lambert's problem ${why("lambert")}: leave Earth on that date, arrive after that many days. Brighter means less launch energy (C3) ${why("c3")}. <b>Click the plot to choose your trajectory.</b></p>
    <div class="md-wins" id="wins" role="group" aria-label="Launch windows"></div>
    <div class="md-pc" id="pcWrap">
      <canvas id="pcCv" tabindex="0" aria-label="Porkchop plot: launch energy for every departure date and flight time. Use the arrow keys to move the selected trajectory."></canvas>
      <div class="md-pcprog mono" id="pcProg"></div>
    </div>
    <div class="md-pclegend">
      <div class="md-cbar"><canvas id="cbarCv" aria-hidden="true"></canvas><div class="md-cbl mono" id="cbarLbl"></div></div>
      <div class="md-keys mono"><span><i class="k-vinf"></i>arrival v∞ (km/s) ${why("vinf")}</span><span><i class="k-lv"></i><span id="lvKey">rocket limit</span></span><span><i class="k-hoh"></i>Hohmann time</span><span><i class="k-star">★</i>lowest C3</span></div>
    </div>
    <div class="row md-pcbtns">
      <button class="btn small" id="bestC3">Lowest launch energy</button>
      <button class="btn small" id="bestDv">Lowest total Δv</button>
      ${why("porkchop")}
    </div>
    <div class="readouts md-ro" id="trajRO"></div>
    <div class="md-card md-cmp" id="hohCmp"></div>`;
  const cv = $("#pcCv");
  cv.addEventListener("pointermove", pcMove);
  cv.addEventListener("pointerleave", () => { pcHover = null; $("#tip").hidden = true; drawPorkchop(); });
  cv.addEventListener("click", (e) => { const c = pcCell(e); if (c) pick(c.dep, c.tof); });
  cv.addEventListener("keydown", (e) => {
    if (!PC || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const dd = (PC.dep[1] - PC.dep[0]) * (e.shiftKey ? 5 : 1), dt = (PC.tof[1] - PC.tof[0]) * (e.shiftKey ? 5 : 1);
    const dep = clamp(state.dep + (e.key === "ArrowRight" ? dd : e.key === "ArrowLeft" ? -dd : 0), PC.dep[0], PC.dep[PC.nDep - 1]);
    const tof = clamp(state.tof + (e.key === "ArrowUp" ? dt : e.key === "ArrowDown" ? -dt : 0), PC.tof[0], PC.tof[PC.nTof - 1]);
    pick(dep, tof);
  });
  $("#bestC3").addEventListener("click", () => bestIn((t) => t.c3));
  $("#bestDv").addEventListener("click", () => bestIn((t) => P.departureDv(t.c3) + arrivalDv(t)));
  $("#wins").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const r = refineWin(d, +b.dataset.jd, +b.dataset.tof);
    if (r) pick(r.jdDep, r.tof);
  });
  pcKey = "";
  new ResizeObserver(() => { sizeCanvas($("#pcCv")); drawPorkchop(); }).observe($("#pcWrap"));
}
function arrivalDv(t) {
  const o = R.opt, B = R.B, g = R.geo;
  return o.kind === "orbit" ? P.captureDv(t.vinfArr, B.mu, g.rp, g.ra) : o.kind === "rendezvous" ? t.vinfArr : 0;
}
function bestIn(cost) {
  if (!PC) return;
  const m = P.gridMin(PC, (c3, vinf) => cost({ c3, vinfArr: vinf }));
  const r = m && refineWin(R.dest, m.jdDep, m.tof, cost);
  if (r) pick(r.jdDep, r.tof);
}
function updateWindow(opts) {
  if (R.dest.id === "moon") return updateLunar();
  const d = R.dest, c = pcCenter(), key = d.id + "|" + c;
  if (key !== pcKey) startPorkchop(d, c, key);
  const wins = windowsFor(d).windows.filter((x) => x.jd > TODAY - 400).slice(0, 4);
  $("#wins").innerHTML = wins.map((x) => `<button class="md-win${Math.abs(x.jd - c) < 30 ? " on" : ""}" data-jd="${x.jd}" data-tof="${x.tof}"><b>${P.fmtMonth(x.jd)}</b><span>C3 ${nf(x.c3, 1)}</span></button>`).join("");
  const t = R.traj;
  const ro = [
    ["Launch", P.fmtDate(t.jdDep, true)], ["Arrival", P.fmtDate(t.jdArr, true)],
    ["Flight time", days(t.tof)], ["Transfer angle", nf(t.dtheta, 0) + "°" + (t.dtheta < 180 ? " · Type I" : " · Type II")],
    ["Launch energy C3", `${nf(t.c3, 2)}<small>km²/s²</small>`], ["Departure v∞", `${nf(t.vinfDep, 2)}<small>km/s</small>`],
    ["Arrival v∞", `${nf(t.vinfArr, 2)}<small>km/s</small>`], ["Declination DLA " + why("dla"), `${nf(t.dla, 1)}°${Math.abs(t.dla) > 28.5 ? ' <small class="warn">steep</small>' : ""}`]
  ];
  $("#trajRO").innerHTML = ro.map(([k, v]) => `<div class="readout"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("");
  const hb = P.hohmannBodies("earth", d.id, state.dep);
  $("#hohCmp").innerHTML = `<div class="md-hohk">Compared with the Hohmann baseline ${why("hohmann")}</div>
    <table class="md-mini"><tr><th></th><th>Hohmann</th><th>Your pick</th></tr>
    <tr><td>C3 (km²/s²)</td><td>${nf(hb.c3, 2)}</td><td>${nf(t.c3, 2)}</td></tr>
    <tr><td>Flight time</td><td>${days(hb.tof)}</td><td>${days(t.tof)}</td></tr>
    <tr><td>Arrival v∞ (km/s)</td><td>${nf(hb.dv2, 2)}</td><td>${nf(t.vinfArr, 2)}</td></tr></table>
    <p class="hint">Real orbits are eccentric and tilted, so the best real transfer differs from the ideal. Earth leaves ${nf(P.departureDv(t.c3), 2)} km/s above a 185 km parking orbit.</p>`;
  drawPorkchop();
}
/* The grid is solved in a module Web Worker (built from a Blob that imports
 * mission-physics.js) so the page stays responsive; if workers are unavailable
 * (file://, old browsers) it falls back to slices between animation frames. */
let worker = null, workerOK = true, pcJob = 0;
function getWorker() {
  if (worker || !workerOK) return worker;
  try {
    const src = `import * as P from "${new URL("./mission-physics.js", import.meta.url).href}";
      self.onmessage = (e) => { const a = e.data, pc = P.makePorkchop(a.o, a.t, a.d0, a.d1, a.nd, a.t0, a.t1, a.nt);
        for (let i = 0; i < a.nd; i += 6) { pc.fill(i, i + 6); const cols = Math.min(6, a.nd - i), c3 = new Float32Array(cols * a.nt), vi = new Float32Array(cols * a.nt);
          for (let j = 0; j < a.nt; j++) for (let k = 0; k < cols; k++) { c3[j * cols + k] = pc.c3[j * a.nd + i + k]; vi[j * cols + k] = pc.vinf[j * a.nd + i + k]; }
          self.postMessage({ job: a.job, i, cols, c3, vi }, [c3.buffer, vi.buffer]); } };`;
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })), { type: "module" });
    worker.onerror = (e) => { e.preventDefault(); workerOK = false; worker = null; if (PC && PC.done < PC.nDep) chunked(PC); };
    worker.onmessage = (e) => {
      const m = e.data; if (m.job !== pcJob || !PC) return;
      for (let j = 0; j < PC.nTof; j++) for (let k = 0; k < m.cols; k++) { PC.c3[j * PC.nDep + m.i + k] = m.c3[j * m.cols + k]; PC.vinf[j * PC.nDep + m.i + k] = m.vi[j * m.cols + k]; }
      PC.done = m.i + m.cols; pcProgress();
    };
  } catch (err) { workerOK = false; worker = null; }
  return worker;
}
function pcProgress() {
  const el = $("#pcProg"); if (el) el.textContent = PC.done < PC.nDep ? `solving Lambert's problem · ${nf(PC.done * PC.nTof)} of ${nf(PC.nDep * PC.nTof)}` : "";
  if (PC.done >= PC.nDep) makeContours();
  cancelAnimationFrame(pcRaf); pcRaf = requestAnimationFrame(drawPorkchop);
}
function chunked(pc) {
  const job = pcJob;
  const tick = () => {
    if (job !== pcJob) return;
    const t0 = performance.now();
    while (pc.done < pc.nDep && performance.now() - t0 < 30) pc.fill(pc.done, pc.done + 3);
    pcProgress();
    if (pc.done < pc.nDep) setTimeout(tick, 0);
  };
  setTimeout(tick, 0);
}
function startPorkchop(d, center, key) {
  pcKey = key; pcJob++;
  const n = LOW ? [110, 90] : [150, 120];
  PC = P.makePorkchop("earth", d.id, center - d.halfWidth, center + d.halfWidth, n[0], d.tofRange[0], d.tofRange[1], n[1]);
  pcContours = null;
  const w = getWorker();
  if (w) w.postMessage({ job: pcJob, o: "earth", t: d.id, d0: PC.dep[0], d1: PC.dep[PC.nDep - 1], nd: PC.nDep, t0: PC.tof[0], t1: PC.tof[PC.nTof - 1], nt: PC.nTof });
  else chunked(PC);
}
function c3Scale() {
  let mn = Infinity;
  for (const v of PC.c3) if (v < mn) mn = v;
  if (!isFinite(mn)) mn = 0;
  const span = Math.max(24, mn * 0.75);
  return { lo: Math.floor(mn), hi: Math.floor(mn) + span };
}
/* "inferno"-like ramp (perceptually ordered): low C3 bright, high C3 dark */
const RAMP = [[252, 255, 164], [250, 193, 39], [245, 125, 21], [212, 72, 66], [159, 42, 99], [101, 21, 110], [40, 11, 84], [10, 7, 34]];
function rampRGB(t) {
  t = clamp(t, 0, 1) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(t)), f = t - i, a = RAMP[i], b = RAMP[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
function niceStep(span, n) { const raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }
function makeContours() {
  const sc = c3Scale(), st = niceStep(sc.hi - sc.lo, 7);
  const c3L = []; for (let v = Math.ceil(sc.lo / st) * st; v < sc.hi; v += st) c3L.push(v);
  let vmin = Infinity; for (const v of PC.vinf) if (v < vmin) vmin = v;
  const vs = vmin < 4 ? 0.5 : 1, vL = []; for (let v = Math.ceil((vmin + 0.1) / vs) * vs, k = 0; k < 6; v += vs * (k > 2 ? 2 : 1), k++) vL.push(+v.toFixed(2));
  const cj = (sc.hi - sc.lo) * 0.5;
  pcContours = { c3L, vL, cj, c3: c3L.map((L) => [L, march(PC.c3, L, cj)]), vinf: vL.map((L) => [L, march(PC.vinf, L, 1.2)]), sc };
}
/** Marching squares: segments [i0, j0, i1, j1] in fractional grid coordinates. */
function march(f, L, jump = Infinity) {
  const nx = PC.nDep, ny = PC.nTof, segs = [];
  const at = (i, j) => f[j * nx + i];
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
    if (!(a >= 0 && b >= 0 && c >= 0 && d >= 0)) continue;
    if (Math.max(a, b, c, d) - Math.min(a, b, c, d) > jump) continue;    // the 180° transfer ridge, where Lambert is singular
    const idx = (a > L) | ((b > L) << 1) | ((c > L) << 2) | ((d > L) << 3);
    if (idx === 0 || idx === 15) continue;
    const e = [
      [i + (L - a) / (b - a), j], [i + 1, j + (L - b) / (c - b)], [i + (L - d) / (c - d), j + 1], [i, j + (L - a) / (d - a)]
    ];
    const T = { 1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: [[3, 0], [1, 2]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]], 9: [[0, 2]], 10: [[0, 1], [2, 3]], 11: [[1, 2]], 12: [[1, 3]], 13: [[0, 1]], 14: [[0, 3]] }[idx];
    for (const [p, q] of T) segs.push([e[p][0], e[p][1], e[q][0], e[q][1]]);
  }
  return segs;
}
function sizeCanvas(cv) {
  const r = cv.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
  cv.width = Math.max(10, Math.round(r.width * dpr)); cv.height = Math.max(10, Math.round(r.height * dpr));
  return dpr;
}
const PM = { l: 58, r: 12, t: 12, b: 36 };
function drawPorkchop() {
  const cv = $("#pcCv"); if (!cv || !PC) return;
  if (!cv.width || cv.width < 20) sizeCanvas(cv);
  const g = cv.getContext("2d"), dpr = cv.width / Math.max(1, cv.clientWidth);
  const W = cv.width / dpr, H = cv.height / dpr;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const x0 = PM.l, y0 = PM.t, pw = W - PM.l - PM.r, ph = H - PM.t - PM.b;
  pcView = { x0, y0, pw, ph, W, H };
  const d0 = PC.dep[0], d1 = PC.dep[PC.nDep - 1], t0 = PC.tof[0], t1 = PC.tof[PC.nTof - 1];
  const X = (jd) => x0 + (jd - d0) / (d1 - d0) * pw, Y = (t) => y0 + ph - (t - t0) / (t1 - t0) * ph;
  const GX = (i) => x0 + i / (PC.nDep - 1) * pw, GY = (j) => y0 + ph - j / (PC.nTof - 1) * ph;
  g.fillStyle = "#070a16"; g.fillRect(x0, y0, pw, ph);
  // heat map
  const sc = pcContours ? pcContours.sc : c3Scale();
  const off = drawPorkchop.off || (drawPorkchop.off = document.createElement("canvas"));
  off.width = PC.nDep; off.height = PC.nTof;
  const og = off.getContext("2d"), img = og.createImageData(PC.nDep, PC.nTof);
  for (let j = 0; j < PC.nTof; j++) for (let i = 0; i < PC.nDep; i++) {
    const v = PC.c3[j * PC.nDep + i], k = ((PC.nTof - 1 - j) * PC.nDep + i) * 4;
    if (!(v >= 0) || i >= PC.done) { img.data[k + 3] = 0; continue; }
    const t = Math.log(1 + Math.max(0, v - sc.lo)) / Math.log(1 + (sc.hi - sc.lo));
    const [r, gg, b] = rampRGB(t);
    img.data[k] = r; img.data[k + 1] = gg; img.data[k + 2] = b; img.data[k + 3] = 255;
  }
  og.putImageData(img, 0, 0);
  g.save(); g.beginPath(); g.rect(x0, y0, pw, ph); g.clip();
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  const cw = pw / (PC.nDep - 1), chh = ph / (PC.nTof - 1);
  g.drawImage(off, x0 - cw / 2, y0 - chh / 2, pw + cw, ph + chh);
  // contours
  if (pcContours) {
    const line = (segs) => { g.beginPath(); for (const s of segs) { g.moveTo(GX(s[0]), GY(s[1])); g.lineTo(GX(s[2]), GY(s[3])); } g.stroke(); };
    g.lineWidth = 0.7; g.strokeStyle = "rgba(4,5,10,.45)";
    for (const [, segs] of pcContours.c3) line(segs);
    g.lineWidth = 1.1; g.strokeStyle = "rgba(124,200,255,.75)";
    for (const [, segs] of pcContours.vinf) line(segs);
    // labels for v∞ contours: segment closest to the right-third line
    g.font = "600 10px 'JetBrains Mono', monospace"; g.textAlign = "center"; g.textBaseline = "middle";
    pcContours.vinf.forEach(([L, segs], k) => {
      if (!segs.length) return;
      const tx = x0 + pw * (0.12 + 0.13 * (k % 6)), best = segs.reduce((b, s) => { const dx = Math.abs(GX(s[0]) - tx); return dx < b.d ? { d: dx, s } : b; }, { d: Infinity }).s;
      const px = GX(best[0]), py = GY(best[1]);
      g.fillStyle = "rgba(6,9,20,.85)"; g.fillRect(px - 13, py - 7, 26, 14);
      g.fillStyle = "#9fd6ff"; g.fillText(L.toFixed(1), px, py);
    });
    // launch-vehicle limit
    const lim = P.maxC3(R.lv, R.launchMass);
    if (isFinite(lim) && lim > sc.lo) {
      const segs = march(PC.c3, lim, pcContours.cj);
      g.setLineDash([5, 4]); g.lineWidth = 1.6; g.strokeStyle = "rgba(255,255,255,.95)"; line(segs); g.setLineDash([]);
      $("#lvKey").textContent = `${R.lv.name} limit, C3 ${nf(lim, 1)}`;
    } else $("#lvKey").textContent = `${R.lv.name}: cannot lift it here`;
  }
  // Hohmann flight time
  const hb = P.hohmannBodies("earth", R.dest.id, state.dep);
  if (hb.tof > t0 && hb.tof < t1) {
    g.setLineDash([2, 4]); g.strokeStyle = "rgba(78,240,184,.8)"; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(x0, Y(hb.tof)); g.lineTo(x0 + pw, Y(hb.tof)); g.stroke(); g.setLineDash([]);
    g.fillStyle = "#4ef0b8"; g.font = "500 10px 'JetBrains Mono', monospace"; g.textAlign = "right"; g.textBaseline = "bottom";
    g.fillText(`Hohmann ${nf(hb.tof, 0)} d`, x0 + pw - 6, Y(hb.tof) - 3);
  }
  // today
  if (TODAY > d0 && TODAY < d1) {
    g.strokeStyle = "rgba(255,194,75,.7)"; g.lineWidth = 1; g.beginPath(); g.moveTo(X(TODAY), y0); g.lineTo(X(TODAY), y0 + ph); g.stroke();
    g.fillStyle = "#ffc24b"; g.font = "500 10px 'JetBrains Mono', monospace"; g.textAlign = "left"; g.textBaseline = "top"; g.fillText("today", X(TODAY) + 4, y0 + 4);
  }
  // minimum star
  if (PC.done >= PC.nDep) {
    const m = P.gridMin(PC);
    if (m) { g.font = "16px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#fff"; g.strokeStyle = "rgba(4,5,10,.8)"; g.lineWidth = 3; g.strokeText("★", X(m.jdDep), Y(m.tof)); g.fillText("★", X(m.jdDep), Y(m.tof)); }
  }
  // hover crosshair
  if (pcHover) {
    g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(X(pcHover.dep), y0); g.lineTo(X(pcHover.dep), y0 + ph); g.moveTo(x0, Y(pcHover.tof)); g.lineTo(x0 + pw, Y(pcHover.tof)); g.stroke();
  }
  // selection
  if (state.dep >= d0 && state.dep <= d1 && state.tof >= t0 && state.tof <= t1) {
    const sx = X(state.dep), sy = Y(state.tof);
    g.strokeStyle = "#fff"; g.lineWidth = 2; g.beginPath(); g.arc(sx, sy, 8, 0, 6.283); g.stroke();
    g.strokeStyle = "rgba(255,122,61,1)"; g.lineWidth = 2; g.beginPath(); g.arc(sx, sy, 11, 0, 6.283); g.stroke();
  }
  g.restore();
  // axes
  g.strokeStyle = "rgba(150,170,255,.25)"; g.lineWidth = 1; g.strokeRect(x0 + 0.5, y0 + 0.5, pw - 1, ph - 1);
  g.fillStyle = "#8f98bd"; g.font = "500 10px 'JetBrains Mono', monospace";
  g.textAlign = "center"; g.textBaseline = "top";
  // month ticks
  const dt0 = P.jdToDate(d0), m0 = new Date(Date.UTC(dt0.getUTCFullYear(), dt0.getUTCMonth() + 1, 1));
  const every = (d1 - d0) > 250 ? 2 : 1;
  for (let m = new Date(m0), k = 0; P.dateToJd(m) < d1; m.setUTCMonth(m.getUTCMonth() + 1), k++) {
    const jd = P.dateToJd(m), x = X(jd);
    g.fillRect(x, y0 + ph, 1, 4);
    if (k % every === 0) g.fillText(P.fmtMonth(jd).replace(/ (\d{2})(\d{2})$/, " ’$2"), x, y0 + ph + 6);
  }
  g.fillText("Launch date (Earth departure)", x0 + pw / 2, y0 + ph + 20);
  g.textAlign = "right"; g.textBaseline = "middle";
  const ts = niceStep(t1 - t0, 6);
  for (let t = Math.ceil(t0 / ts) * ts; t <= t1; t += ts) { g.fillRect(x0 - 4, Y(t), 4, 1); g.fillText(t >= 1000 ? nf(t / 365.25, 1) + " yr" : nf(t) + " d", x0 - 6, Y(t)); }
  g.save(); g.translate(11, y0 + ph / 2); g.rotate(-Math.PI / 2); g.textAlign = "center"; g.fillText("Flight time", 0, 0); g.restore();
  drawColorbar(sc);
}
function drawColorbar(sc) {
  const cv = $("#cbarCv"); if (!cv) return;
  sizeCanvas(cv);
  const g = cv.getContext("2d");
  for (let x = 0; x < cv.width; x++) { const [r, gg, b] = rampRGB(x / cv.width); g.fillStyle = `rgb(${r | 0},${gg | 0},${b | 0})`; g.fillRect(x, 0, 1, cv.height); }
  const lab = []; for (let k = 0; k <= 4; k++) { const t = k / 4, v = sc.lo + (Math.exp(t * Math.log(1 + sc.hi - sc.lo)) - 1); lab.push(`<span style="left:${t * 100}%">${nf(v, v < 20 ? 1 : 0)}</span>`); }
  $("#cbarLbl").innerHTML = lab.join("") + '<em>launch energy C3, km²/s²</em>';
}
function pcCell(e) {
  if (!pcView || !PC) return null;
  const r = e.currentTarget.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, v = pcView;
  if (x < v.x0 || x > v.x0 + v.pw || y < v.y0 || y > v.y0 + v.ph) return null;
  const fx = (x - v.x0) / v.pw, fy = 1 - (y - v.y0) / v.ph;
  return { dep: PC.dep[0] + fx * (PC.dep[PC.nDep - 1] - PC.dep[0]), tof: PC.tof[0] + fy * (PC.tof[PC.nTof - 1] - PC.tof[0]), x: e.clientX, y: e.clientY };
}
function pcMove(e) {
  const c = pcCell(e), tip = $("#tip");
  if (!c) { pcHover = null; tip.hidden = true; drawPorkchop(); return; }
  pcHover = c;
  const t = P.transfer("earth", R.dest.id, c.dep, c.tof);
  if (t) {
    tip.innerHTML = `<b>${P.fmtDate(c.dep, true)}</b> → ${P.fmtDate(c.dep + c.tof, true)}<br>${days(c.tof)} · C3 <b>${nf(t.c3, 1)}</b> km²/s² · v∞ <b>${nf(t.vinfArr, 2)}</b> km/s`;
    tip.hidden = false;
    const tw = tip.offsetWidth;
    tip.style.left = clamp(c.x + 14, 8, innerWidth - tw - 8) + "px"; tip.style.top = (c.y + 16) + "px";
  }
  drawPorkchop();
}

/* ---- the Moon: no porkchop, a patched-conic transfer chart */
function buildLunar() {
  $("#s2").innerHTML = `
    <h2 class="md-h" id="s2h" tabindex="-1"><span class="k">Step 2</span>Launch window: the Moon</h2>
    <p class="md-p">The Moon comes round every 27.3 days, so there is no planetary launch window: pick a day. What you do choose is the flight time. A slow transfer barely reaches the Moon's distance (C3 ≈ −2 km²/s²) and arrives slowly; a faster one costs a little more launch energy and arrives faster, needing more braking ${why("vinf")}.</p>
    <div class="md-lunar"><canvas id="lunCv" aria-label="Chart of launch energy and arrival speed against flight time for an Earth to Moon transfer"></canvas></div>
    ${field("lunTof", "Flight time")}
    <div class="field md-text"><label for="lunDate">Launch date</label><input type="date" id="lunDate"></div>
    <div class="readouts md-ro" id="trajRO"></div>
    <p class="hint">Patched conics: an Earth-centred conic from a 185 km parking orbit to the Moon's mean distance (384,400 km), then the Moon's gravity takes over. Real missions refine this with the Moon's pull all the way, and CubeSats often use slow low-energy transfers through the Sun–Earth system (out of scope).</p>`;
  linRange($("#lunTof"), 2.5, 5, 0.05, () => state.tof, (v) => { set({ tof: v }); resetTime(); }, (v) => nf(v, 2) + " days");
  $("#lunDate").addEventListener("change", (e) => { if (e.target.value) { set({ dep: P.dateToJd(e.target.value) + 0.5 }); resetTime(); } });
  new ResizeObserver(() => drawLunar()).observe($("#lunCv"));
}
function updateLunar() {
  $("#lunTof")._sync();
  $("#lunDate").value = P.isoDate(state.dep);
  const t = R.traj;
  $("#trajRO").innerHTML = [
    ["Launch", P.fmtDate(t.jdDep, true)], ["Arrival", P.fmtDate(t.jdArr, true)], ["Flight time", days(t.tof)],
    ["Launch energy C3", `${nf(t.c3, 2)}<small>km²/s²</small>`], ["Arrival v∞", `${nf(t.vinfArr, 2)}<small>km/s</small>`],
    ["Translunar burn", `${nf(P.departureDv(t.c3), 2)}<small>km/s</small>`]
  ].map(([k, v]) => `<div class="readout"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("");
  drawLunar();
}
function drawLunar() {
  const cv = $("#lunCv"); if (!cv) return;
  const dpr = sizeCanvas(cv), g = cv.getContext("2d"), W = cv.width / dpr, H = cv.height / dpr;
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const x0 = 46, x1 = W - 46, y0 = 14, y1 = H - 30;
  const pts = []; for (let t = 2.5; t <= 5.001; t += 0.05) pts.push(P.lunarTransfer(t));
  const X = (t) => x0 + (t - 2.5) / 2.5 * (x1 - x0);
  const c3lo = -2.1, c3hi = -1.2, vlo = 0.7, vhi = 1.4;
  const Yc = (c) => y1 - (c - c3lo) / (c3hi - c3lo) * (y1 - y0), Yv = (v) => y1 - (v - vlo) / (vhi - vlo) * (y1 - y0);
  g.strokeStyle = "rgba(150,170,255,.2)"; g.strokeRect(x0, y0, x1 - x0, y1 - y0);
  const plot = (f, col) => { g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); pts.forEach((p, k) => (k ? g.lineTo : g.moveTo).call(g, X(p.tof), f(p))); g.stroke(); };
  plot((p) => Yc(p.c3), "#ffc24b"); plot((p) => Yv(p.vinfArr), "#7cc8ff");
  g.font = "500 10px 'JetBrains Mono', monospace"; g.fillStyle = "#8f98bd"; g.textAlign = "center"; g.textBaseline = "top";
  for (let t = 2.5; t <= 5; t += 0.5) g.fillText(nf(t, 1) + " d", X(t), y1 + 6);
  g.textAlign = "right"; g.textBaseline = "middle"; g.fillStyle = "#ffc24b";
  for (let c = -2; c <= -1.2; c += 0.2) g.fillText(nf(c, 1), x0 - 5, Yc(c));
  g.textAlign = "left"; g.fillStyle = "#7cc8ff";
  for (let v = 0.8; v <= 1.4; v += 0.2) g.fillText(nf(v, 1), x1 + 5, Yv(v));
  g.textAlign = "left"; g.textBaseline = "bottom"; g.fillStyle = "#ffc24b"; g.fillText("— launch energy C3, km²/s² (left axis)", x0 + 8, y1 - 20);
  g.fillStyle = "#7cc8ff"; g.fillText("— arrival v∞ at the Moon, km/s (right axis)", x0 + 8, y1 - 6);
  const sx = X(state.tof);
  g.strokeStyle = "#fff"; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(sx, y0); g.lineTo(sx, y1); g.stroke(); g.setLineDash([]);
}

/* ================================================================ 3 · launch vehicle */
function buildLV() {
  $("#s3").innerHTML = `
    <h2 class="md-h" id="s3h" tabindex="-1"><span class="k">Step 3</span>Launch vehicle</h2>
    <p class="md-p">The rocket must throw the whole spacecraft — dry mass, contingency and propellant — onto the departure hyperbola. The harder the launch energy (C3), the less it can lift ${why("lv")}. A Pre-Phase A study wants at least ${nf(D.spacecraft.targets.launchMargin * 100)} % spare.</p>
    <div class="md-lvsum" id="lvSum"></div>
    <div class="md-lvchart"><canvas id="lvCv" aria-label="Payload against launch energy for every launch vehicle, with your mission's launch energy and mass marked"></canvas></div>
    <div class="md-lvs" id="lvList" role="radiogroup" aria-label="Launch vehicle"></div>
    <p class="hint md-src">Curves are rocket-equation estimates (${why("lv")}): published stage masses and specific impulses, with one loss term fitted to the published payload marked ◆. For a real proposal use the NASA Launch Services Program (LSP) performance website, elvperf.ksc.nasa.gov, the authoritative source for payload versus C3. Stage data: Wikipedia and the manufacturers; ≈ marks masses that are not published.</p>`;
  $("#lvList").addEventListener("click", (e) => { const b = e.target.closest(".md-lv"); if (b) set({ lv: b.dataset.id }); });
  new ResizeObserver(() => drawLV()).observe($("#lvCv"));
}
function updateLV() {
  const c3 = R.traj.c3, m = R.launchMass;
  const rows = D.vehicles.map((v) => ({ v, cap: P.payloadAtC3(v, c3) }));
  $("#lvList").innerHTML = rows.map(({ v, cap }) => {
    const mg = cap > 0 ? cap / m - 1 : -1, s = P.status(mg, D.spacecraft.targets.launchMargin, 0), on = v.id === state.lv;
    const w = clamp(cap / Math.max(m * 3, 1) * 100, 0, 100), mk = clamp(m / Math.max(m * 3, 1) * 100, 0, 100);
    return `<button class="md-lv ${s}${on ? " on" : ""}" role="radio" aria-checked="${on}" data-id="${v.id}">
      <span class="nm">${esc(v.name)} <i>${esc(v.variant)}</i>${v.speculative ? ' <em class="chip sol">speculative</em>' : v.estimated ? ' <em class="md-est" title="' + esc(v.estimated) + '">≈</em>' : ""}</span>
      <span class="bar"><i style="width:${w}%"></i><b style="left:${mk}%"></b></span>
      <span class="cap mono">${cap > 0 ? kg(cap) : "cannot reach"}</span><span class="mg mono">${cap > 0 ? pct(mg) : "—"}</span></button>`;
  }).join("");
  const mg = R.launchMargin, s = R.checks[0].status;
  const better = rows.filter((r) => r.cap > m * (1 + D.spacecraft.targets.launchMargin)).sort((a, b) => a.cap - b.cap)[0];
  const adv = [];
  if (s !== "ok") adv.push([s, better ? `Choose a bigger launcher: <b>${esc(better.v.name)} (${esc(better.v.variant)})</b> lifts ${kg(better.cap)} at this C3.` : "No launcher here can do it: pick a lower-C3 trajectory in step 2, lighten the spacecraft, or (in a real study) add gravity assists."]);
  if (s !== "ok" && R.dest.id !== "moon") adv.push(["warn", `Or lower the launch energy: the window's cheapest day needs C3 ${nf((windowsFor(R.dest).windows.find((w) => Math.abs(w.jd - state.dep) < R.dest.halfWidth) || { c3: NaN }).c3, 1)} km²/s².`]);
  if (mg > 3) { const smaller = rows.filter((r) => r.cap > m * 1.3 && r.cap < R.cap).sort((a, b) => a.cap - b.cap)[0]; if (smaller) adv.push(["ok", `Plenty of room. A smaller launcher such as ${esc(smaller.v.name)} (${esc(smaller.v.variant)}) would still leave ${pct(smaller.cap / m - 1)}.`]); }
  if (R.traj.dla != null && Math.abs(R.traj.dla) > 28.5 && R.lv.id !== "a64") adv.push(["warn", `The departure asymptote points ${nf(Math.abs(R.traj.dla), 0)}° ${R.traj.dla > 0 ? "north" : "south"} of the equator ${why("dla")}: from Florida (28.5° N) that costs extra performance this model does not charge.`]);
  const v = R.lv;
  $("#lvSum").innerHTML = `
    <div class="md-lvhead"><div><div class="md-lvname">${esc(v.name)} <span>${esc(v.variant)}</span></div>
      <div class="hint">${esc(v.note || (v.calib ? "Calibrated to " + v.calib.label : ""))}</div></div>${pill(s)}</div>
    <div class="md-marg">
      <div class="md-margbar" role="img" aria-label="Launch mass ${kg(m)} against capability ${kg(R.cap)}">
        <i class="sc" style="width:${clamp(m / Math.max(R.cap, m) * 100, 0, 100)}%"><span>spacecraft ${kg(m)}</span></i>
        <i class="tg" style="left:${clamp(m * 1.1 / Math.max(R.cap, m * 1.1) * 100, 0, 100)}%"></i>
      </div>
      <div class="md-margnums mono"><span>capability at C3 ${nf(R.traj.c3, 1)}: <b>${kg(R.cap)}</b></span><span>margin <b class="${s}">${R.cap > 0 ? pct(mg) : "—"}</b></span></div>
    </div>${advice(adv)}`;
  drawLV();
}
function drawLV() {
  const cv = $("#lvCv"); if (!cv || !R) return;
  const dpr = sizeCanvas(cv), g = cv.getContext("2d"), W = cv.width / dpr, H = cv.height / dpr;
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const c3 = R.traj.c3, m = R.launchMass;
  const xlo = Math.min(-5, Math.floor(c3 / 10) * 10 - 5), xhi = Math.max(40, Math.ceil((c3 + 25) / 10) * 10);
  const ylo = Math.pow(10, Math.floor(Math.log10(Math.max(5, m / 4)))), yhi = 2e5;
  const x0 = 50, x1 = W - 12, y0 = 10, y1 = H - 30;
  const X = (c) => x0 + (c - xlo) / (xhi - xlo) * (x1 - x0), Y = (v) => y1 - (Math.log10(v) - Math.log10(ylo)) / (Math.log10(yhi) - Math.log10(ylo)) * (y1 - y0);
  g.strokeStyle = "rgba(150,170,255,.12)"; g.lineWidth = 1; g.font = "500 10px 'JetBrains Mono', monospace"; g.fillStyle = "#8f98bd";
  g.textAlign = "right"; g.textBaseline = "middle";
  const axKg = (v) => (v >= 1000 ? nf(v / 1000) + " t" : nf(v) + " kg");
  for (let e = Math.log10(ylo); e <= 5; e++) { const v = Math.pow(10, e); g.beginPath(); g.moveTo(x0, Y(v)); g.lineTo(x1, Y(v)); g.stroke(); g.fillText(axKg(v), x0 - 5, Y(v)); }
  g.textAlign = "center"; g.textBaseline = "top";
  const xs = niceStep(xhi - xlo, 7);
  for (let c = Math.ceil(xlo / xs) * xs; c <= xhi; c += xs) { g.beginPath(); g.moveTo(X(c), y0); g.lineTo(X(c), y1); g.stroke(); g.fillText(nf(c + 0), X(c), y1 + 5); }
  g.fillText("launch energy C3, km²/s²", (x0 + x1) / 2, y1 + 17);
  g.save(); g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
  const order = D.vehicles.filter((v) => v.id !== state.lv).concat([R.lv]), placed = [];
  for (const v of order) {
    const on = v.id === state.lv;
    g.strokeStyle = on ? "#ff7a3d" : "rgba(195,202,230,.28)"; g.lineWidth = on ? 2.4 : 1.1;
    g.beginPath(); let started = false, last = null;
    for (let k = 0; k <= 90; k++) {
      const c = xlo + (xhi - xlo) * k / 90, p = P.payloadAtC3(v, c);
      if (p < ylo) { if (started) break; continue; }
      (started ? g.lineTo : g.moveTo).call(g, X(c), Y(p)); started = true; last = [X(c), Y(p)];
    }
    g.stroke();
    if (!on && last && last[0] < x1 - 30 && !placed.some((q) => Math.abs(q[0] - last[0]) < 46 && Math.abs(q[1] - last[1]) < 12) && placed.push(last)) { g.fillStyle = "rgba(195,202,230,.55)"; g.textAlign = "left"; g.textBaseline = "middle"; g.fillText(v.name.replace("Falcon ", "F") + (v.base || v.id === "f9e" || v.id === "fhe" ? (v.id.endsWith("e") ? " exp" : " rec") : ""), last[0] + 3, last[1]); }
    if (on) {
      g.fillStyle = "#ffc24b";
      for (const pt of [v.calib, v.check].filter(Boolean)) if (pt.c3 >= xlo && pt.c3 <= xhi && pt.mass >= ylo) {
        const px = X(pt.c3), py = Y(pt.mass); g.beginPath();
        if (pt === v.calib) { g.moveTo(px, py - 5); g.lineTo(px + 5, py); g.lineTo(px, py + 5); g.lineTo(px - 5, py); g.fill(); }
        else { g.strokeStyle = "#ffc24b"; g.lineWidth = 1.5; g.arc(px, py, 4, 0, 6.283); g.stroke(); }
      }
    }
  }
  // your mission
  g.setLineDash([4, 4]); g.strokeStyle = "rgba(124,200,255,.9)"; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(X(c3), y0); g.lineTo(X(c3), y1); g.moveTo(x0, Y(m)); g.lineTo(x1, Y(m)); g.stroke(); g.setLineDash([]);
  g.fillStyle = "#fff"; g.strokeStyle = "#7cc8ff"; g.lineWidth = 2; g.beginPath(); g.arc(X(c3), Y(m), 5, 0, 6.283); g.fill(); g.stroke();
  g.fillStyle = "#9fd6ff"; g.textAlign = "left"; g.textBaseline = "bottom"; g.fillText(`your spacecraft ${kg(m)}`, x0 + 6, Y(m) - 3);
  g.restore();
}

/* ================================================================ 4 · spacecraft */
function buildSC() {
  const c = D.spacecraft;
  $("#s4").innerHTML = `
    <h2 class="md-h" id="s4h" tabindex="-1"><span class="k">Step 4</span>Spacecraft budgets</h2>
    <p class="md-p">Now size the flight system around the payload. Each subsystem is one equation from the <a href="equations.html">equation atlas</a>; each gauge shows its margin: <span class="md-lg ok">green</span> meets the target, <span class="md-lg warn">amber</span> is thin, <span class="md-lg bad">red</span> does not close ${why("margin")}.</p>

    <article class="md-sub" id="subMass">
      <header><h3>Mass ${why("mass")}</h3><span id="massPill"></span></header>
      <div class="md-stack" id="massStack" role="img"></div>
      <table class="md-mtab" id="massTab"></table>
      <div class="field"><span class="lbl">Contingency (design maturity) ${why("margin")}</span>${seg("matSeg", c.maturity.map((m) => [m.id, m.label.replace("At Preliminary Design Review (PDR)", "PDR") + " · " + Math.round(m.contingency * 100) + " %"]), state.maturity)}</div>
    </article>

    <article class="md-sub" id="subPower">
      <header><h3>Power ${why("power")}</h3><span id="powPill"></span></header>
      ${seg("psSeg", [["solar", "Solar array"], ["rtg", "Radioisotope (MMRTG)"]], state.powerSource)}
      <div id="powCtl"></div>
      <div class="readouts md-ro3" id="powRO"></div>
      <div id="powGauge"></div><div id="powAdv"></div>
    </article>

    <article class="md-sub" id="subComm">
      <header><h3>Communications ${why("link")}</h3><span id="comPill"></span></header>
      <div class="md-two">${seg("bandSeg", [["X", "X-band"], ["Ka", "Ka-band"]], state.band)}${seg("dsnSeg", [["34", "DSN 34 m"], ["70", "DSN 70 m"]], state.dsn)}</div>
      <div class="md-two">${field("dishIn", "Spacecraft dish")}${field("rfIn", "Transmitter (RF) power")}</div>
      ${field("dvIn", "Science data per day")}
      <div class="md-rchart"><canvas id="rateCv" aria-label="Data rate against Earth distance, with the required rate"></canvas></div>
      <div class="readouts md-ro3" id="comRO"></div>
      <div id="comGauge"></div><div id="comAdv"></div>
    </article>

    <article class="md-sub" id="subProp">
      <header><h3>Propulsion ${why("capture")}</h3><span id="proPill"></span></header>
      <div class="md-two"><div class="field md-text"><label for="orbitSel4">Orbit at the destination</label><select id="orbitSel4"></select></div>
      <div class="field md-text"><label for="ispSel">Engine</label><select id="ispSel">${c.isp.map((o) => `<option value="${o.isp}">${esc(o.label)}</option>`).join("")}</select></div></div>
      <div class="readouts md-ro3" id="proRO"></div>
      <div id="proGauge"></div><div id="proAdv"></div>
    </article>

    <article class="md-sub" id="subTherm">
      <header><h3>Thermal ${why("thermal")}</h3><span id="thPill"></span></header>
      <div class="field md-text"><label for="finSel">Outer surface finish</label><select id="finSel">${Object.entries(c.finishes).map(([k, f]) => `<option value="${k}">${esc(f.label)}</option>`).join("")}</select></div>
      <div class="md-thermo" id="thermo"></div>
      <div class="readouts md-ro3" id="thRO"></div>
      <div id="thAdv"></div>
    </article>
    <p class="hint md-src">${esc(c.fractionsSource)} ${esc(c.maturitySource)} ${esc(c.power.notes)} ${esc(c.link.notes)} ${esc(c.thermal.notes)}</p>`;
  onSeg("matSeg", (v) => set({ maturity: v }));
  onSeg("psSeg", (v) => { set({ powerSource: v, areaScale: 1, rtgCount: 0 }); buildPowCtl(); });
  onSeg("bandSeg", (v) => set({ band: v, dsn: v === "Ka" ? 34 : state.dsn }));
  onSeg("dsnSeg", (v) => { if (state.band === "Ka" && v === "70") { toast("The 70 m antennas receive X-band only: Ka-band uses the 34 m beam-waveguide antennas."); return; } set({ dsn: +v }); });
  logRange($("#dishIn"), 0.1, 5, () => state.dish, (v) => set({ dish: Math.round(v * 20) / 20 }), (v) => nf(v, 2) + " m");
  logRange($("#rfIn"), 1, 300, () => state.rf, (v) => set({ rf: v < 10 ? Math.round(v * 2) / 2 : Math.round(v) }), (v) => nf(v, v < 10 ? 1 : 0) + " W");
  logRange($("#dvIn"), 0.01, 200, () => state.dataGbitDay, (v) => set({ dataGbitDay: v < 1 ? Math.round(v * 100) / 100 : Math.round(v * 10) / 10 }), (v) => nf(v, v < 1 ? 2 : 1) + " Gbit");
  $("#orbitSel4").addEventListener("change", (e) => set({ orbit: e.target.value }));
  $("#ispSel").addEventListener("change", (e) => set({ isp: +e.target.value }));
  $("#finSel").addEventListener("change", (e) => set({ finish: e.target.value }));
  buildPowCtl();
  new ResizeObserver(() => drawRate()).observe($("#rateCv"));
}
function buildPowCtl() {
  const el = $("#powCtl"); if (!el) return;
  if (state.powerSource === "rtg") {
    el.innerHTML = field("rtgIn", "Number of generators") + '<p class="hint">0 = sized automatically for a 30 % margin. Plutonium-238 is scarce: NASA decides how many generators a mission may have.</p>';
    linRange($("#rtgIn"), 0, 8, 1, () => state.rtgCount, (v) => set({ rtgCount: v }), (v) => (v ? v + " × MMRTG" : "auto"));
  } else {
    el.innerHTML = field("areaIn", "Array size (relative to the automatic sizing)");
    linRange($("#areaIn"), 0.5, 2, 0.01, () => state.areaScale, (v) => set({ areaScale: v }), (v) => nf(v * 100) + " %" + (R ? " · " + nf(R.sc.power.area * v / state.areaScale, 1) + " m²" : ""));
  }
}
function updateSC() {
  const sc = R.sc, c = D.spacecraft, T = c.targets;
  segSync("matSeg", state.maturity); segSync("psSeg", state.powerSource); segSync("bandSeg", state.band); segSync("dsnSeg", state.band === "Ka" ? 34 : state.dsn);
  ["dishIn", "rfIn", "dvIn", "areaIn", "rtgIn"].forEach((id) => $("#" + id) && $("#" + id)._sync());
  $("#orbitSel4").innerHTML = R.dest.orbits.map((o) => `<option value="${o.id}"${o.id === R.opt.id ? " selected" : ""}>${esc(o.label)}</option>`).join("");
  $("#ispSel").value = String(state.isp); $("#finSel").value = state.finish;

  // ---- mass
  const COLORS = { payload: "#ffc24b", power: "#7cc8ff", telecom: "#b18cff", extra: "#ff4f9a", propulsion: "#ff7a3d", structure: "#8f98bd", thermal: "#4ef0b8", adcs: "#6fb4ff", cdh: "#c3cae6", harness: "#5d6589" };
  const parts = sc.items.map((i) => [i.label, i.kg, COLORS[i.id], i.how]).concat([["Contingency " + Math.round(R.maturity.contingency * 100) + " %", sc.contingencyKg, "rgba(255,255,255,.25)", R.maturity.label], ["Propellant", sc.prop, "#ff9c3d", "rocket equation, Δv " + nf(sc.dvTotal, 2) + " km/s"]]);
  $("#massStack").innerHTML = parts.map(([l, m, col]) => `<i style="flex:${m};--c:${col}" title="${esc(l)}: ${kg(m)}"></i>`).join("");
  $("#massStack").setAttribute("aria-label", "Mass breakdown: " + parts.map(([l, m]) => `${l} ${kg(m)}`).join(", "));
  $("#massTab").innerHTML = parts.map(([l, m, col, how]) => `<tr><td><i style="background:${col}"></i>${esc(l)}<small>${esc(how || "")}</small></td><td class="num">${kg(m)}</td><td class="num">${nf(m / sc.wet * 100, 1)} %</td></tr>`).join("") +
    `<tr class="tot"><td>Dry mass with contingency</td><td class="num">${kg(sc.dryCont)}</td><td></td></tr><tr class="tot big"><td>Launch (wet) mass</td><td class="num">${kg(sc.wet)}</td><td></td></tr>`;
  $("#massPill").innerHTML = pill(R.checks[0].status, "launch " + (R.cap > 0 ? pct(R.launchMargin) : "fails"));

  // ---- power
  const pw = sc.power, sP = R.checks[1].status;
  $("#powPill").innerHTML = pill(sP, pct(pw.margin));
  $("#powRO").innerHTML = [
    ["Load", nf(pw.load) + "<small>W</small>"], ["Needed", nf(pw.need) + "<small>W</small>"],
    ["Supply, end of life", nf(pw.avail) + "<small>W</small>"],
    pw.source === "rtg" ? ["Generators", pw.nRtg + " × MMRTG"] : ["Array area", nf(pw.area, 1) + "<small>m²</small>"],
    ["Sunlight", nf(P.S_EARTH / (R.rSun * R.rSun)) + "<small>W/m²</small>"], ["Mass", kg(pw.mass)]
  ].map(ro).join("");
  $("#powGauge").innerHTML = gauge(pw.margin, T.powerMargin, -0.4, 1.2, `margin ${pct(pw.margin)} · target ${pct(T.powerMargin)}`, sP);
  const pa = [];
  if (pw.margin < T.powerMargin - 1e-6) {
    if (pw.source === "solar") pa.push([sP, `Add ${nf(((1 + T.powerMargin) / (1 + pw.margin) - 1) * 100)} % array area (to ${nf(pw.area * (1 + T.powerMargin) / (1 + pw.margin), 1)} m²).`]);
    else pa.push([sP, `Add ${Math.ceil(pw.need * (1 + T.powerMargin) / (pw.avail / pw.nRtg)) - pw.nRtg} more generator(s).`]);
  } else if (pw.margin > 0.8 && pw.source === "solar") pa.push(["ok", `Over-sized: you could shrink the array by ${nf((1 - (1 + T.powerMargin) / (1 + pw.margin)) * 100)} % and still meet the 30 % margin.`]);
  if (pw.source === "solar" && R.rSun > 4 && pw.area > 60) pa.push(["warn", `${nf(pw.area)} m² of array at ${nf(R.rSun, 1)} AU (Europa Clipper flies about 90 m²). Radioisotope power would be ${kg(Math.ceil(pw.need * 1.3 / (110 * pw.degr)) * 45)} of generators.`]);
  if (pw.source === "rtg" && R.rSun < 2) pa.push(["ok", "Solar power is abundant this close to the Sun: radioisotope generators are rarely worth the plutonium here."]);
  pa.push(["info", `Load = payload ${nf(pw.payload)} W + bus ${nf(pw.bus)} W + transmitter ${nf(pw.rfDC)} W + heaters ${nf(pw.heater)} W${pw.need > pw.load * 1.01 ? `, ×${nf(pw.need / pw.load, 1)} to recharge the battery after eclipses` : ""}.`]);
  $("#powAdv").innerHTML = advice(pa);

  // ---- communications
  const cm = sc.comm, sC = R.checks[2].status;
  $("#comPill").innerHTML = pill(sC, (cm.marginDB >= 0 ? "+" : "") + nf(cm.marginDB, 1) + " dB");
  $("#comRO").innerHTML = [
    ["Needed", rate(cm.rateReq)], ["Arrival, " + nf(R.commArr, 2) + " AU", rate(cm.rateArr)], ["Farthest, " + nf(R.commMax, 2) + " AU", rate(cm.rateMax)],
    ["Spacecraft gain", nf(cm.link.gtDB, 1) + "<small>dBi</small>"], ["Ground gain", nf(cm.link.grDB, 1) + "<small>dBi</small>"], ["Path loss", nf(cm.link.fsplDB, 1) + "<small>dB</small>"]
  ].map(ro).join("");
  $("#comGauge").innerHTML = gauge(cm.marginDB, T.linkDB, -10, 20, `margin ${nf(cm.marginDB, 1)} dB at the farthest point · target ${T.linkDB} dB`, sC);
  const ca = [];
  if (cm.marginDB < T.linkDB) {
    const alt = (patch) => P.evaluate(D, V, { ...state, ...patch }).sc.comm.marginDB;
    if (state.band === "X") { const k = alt({ band: "Ka", dsn: 34 }); if (k > cm.marginDB + 1) ca.push([k >= T.linkDB ? "ok" : "warn", `Switch to Ka-band: ${nf(k - cm.marginDB, 1)} dB better (Ka is received on 34 m antennas).`]); }
    if (state.band === "X" && +state.dsn === 34) ca.push(["warn", `Use a 70 m antenna: +${nf(alt({ dsn: 70 }) - cm.marginDB, 1)} dB, but 70 m time is scarce.`]);
    const dNeed = state.dish * Math.pow(10, (T.linkDB - cm.marginDB) / 20);
    if (dNeed <= 5) ca.push(["warn", `A ${nf(dNeed, 1)} m dish would close the link (${kg(D.spacecraft.telecom.dishKgPerM2 * (dNeed * dNeed - state.dish * state.dish))} more).`]);
    ca.push(["warn", `Or return less: ${nf(state.dataGbitDay * Math.pow(10, (cm.marginDB - T.linkDB) / 10), 2)} Gbit per day closes at ${T.linkDB} dB.`]);
  } else if (cm.marginDB > 15) ca.push(["ok", `Large margin: the farthest-point rate could carry ${nf(cm.rateMax * 8 * 3600 / 1e9 / 2, 1)} Gbit per day with 3 dB to spare.`]);
  $("#comAdv").innerHTML = advice(ca);
  drawRate();

  // ---- propulsion
  const pr = sc.propulsion, sPr = R.checks[3].status;
  $("#proPill").innerHTML = pill(sPr, pr.infeasible ? "not feasible" : nf(pr.fraction * 100) + " % propellant");
  const capLbl = R.opt.kind === "entry" ? "Entry speed" : R.opt.kind === "flyby" ? "Flyby" : R.opt.kind === "rendezvous" ? "Rendezvous Δv" : "Orbit insertion Δv";
  const capVal = R.opt.kind === "entry" ? nf(R.vEntry, 2) + "<small>km/s</small>" : R.opt.kind === "flyby" ? "no braking" : nf(R.dvCapture, 3) + "<small>km/s</small>";
  $("#proRO").innerHTML = [
    ["Arrival v∞", nf(R.traj.vinfArr, 2) + "<small>km/s</small>"], [capLbl, capVal], ["Corrections, ops", nf(R.dest.dvTcm + (R.opt.kind === "flyby" || R.opt.kind === "entry" ? 0.01 : R.dest.dvOps), 2) + "<small>km/s</small>"],
    ["Total spacecraft Δv", nf(pr.dv, 2) + "<small>km/s</small>"], ["Propellant", kg(pr.prop)], ["Mass ratio", nf(sc.wet / sc.dryCont, 2)]
  ].map(ro).join("");
  $("#proGauge").innerHTML = gauge(1 - pr.fraction, 1 - T.propFractionWarn, 1 - 0.85, 1, `propellant is ${nf(pr.fraction * 100)} % of launch mass · keep it under ${nf(T.propFractionWarn * 100)} %`, sPr);
  const qa = [];
  if (pr.infeasible) qa.push(["bad", `A ${nf(pr.dv, 1)} km/s budget at I<sub>sp</sub> ${state.isp} s needs a mass ratio above ${nf(D.spacecraft.propulsion.maxMassRatio)}: no real spacecraft can carry that much propellant. Masses below are capped.`]);
  if (pr.fraction > T.propFractionWarn) {
    if (R.opt.id === "low") qa.push([sPr, "Capture into a loose ellipse first and aerobrake down, as MRO did: far less propellant."]);
    if (state.isp < 320) qa.push([sPr, "A bipropellant engine (320 s) needs much less propellant than monopropellant (225 s)."]);
    qa.push(["warn", "Or arrive slower: pick a trajectory with lower arrival v∞ in step 2."]);
  }
  if (R.opt.kind === "entry") qa.push(["info", `The probe hits the atmosphere at ${nf(R.vEntry, 1)} km/s: its heat shield, not propellant, does the braking. See the <a href="mars-landing.html">Mars entry, descent and landing</a> page.`]);
  qa.push(["info", `Propellant = dry mass × (e^(Δv / I<sub>sp</sub>g<sub>0</sub>) − 1), from the rocket equation, plus ${Math.round(D.spacecraft.propulsion.residual * 100)} % residuals.`]);
  $("#proAdv").innerHTML = advice(qa);

  // ---- thermal
  const th = sc.thermal, sT = R.checks[4].status, C = (k) => nf(k - 273.15) + " °C";
  $("#thPill").innerHTML = pill(sT, sT === "ok" ? "in range" : sT === "warn" ? "heater-heavy" : "too hot");
  const lo = 40, hi = 420, X = (k) => clamp((k - lo) / (hi - lo) * 100, 0, 100);
  $("#thermo").innerHTML = `<div class="md-thbar"><i class="rng" style="left:${X(253)}%;right:${100 - X(323)}%"></i>
     <b class="cold" style="left:${X(th.Tcold)}%"><span>cold ${C(th.Tcold)}</span></b><b class="hot" style="left:${X(th.Thot)}%"><span>hot ${C(th.Thot)}</span></b></div>
     <div class="md-thlbl mono"><span style="left:${X(253)}%">−20 °C</span><span style="left:${X(323)}%">+50 °C</span><em>electronics range</em></div>`;
  $("#thRO").innerHTML = [["Cold, " + nf(R.rSun, 2) + " AU", C(th.Tcold)], ["Hot, " + nf(R.rSunMin, 2) + " AU", C(th.Thot)], ["Heaters", nf(th.heater) + "<small>W</small>"]].map(ro).join("");
  const ta = [];
  if (th.Thot > c.thermal.tMax) ta.push(["bad", `Surfaces reach ${C(th.Thot)} at ${nf(R.rSunMin, 2)} AU: switch to white paint or optical solar reflectors (low α/ε).`]);
  if (th.heater > 0) ta.push([sT === "warn" ? "warn" : "info", `Multi-layer insulation (MLI) blankets plus ${nf(th.heater)} W of heaters keep the propellant above 0 °C; that power is already in the power budget.`]);
  else ta.push(["ok", "The electronics' own heat, trapped under the blankets, keeps the bus warm: no heaters needed."]);
  if (state.powerSource === "rtg" && th.Tcold < 150) ta.push(["info", "Generator waste heat can warm the bus, as on Cassini, saving heater power."]);
  $("#thAdv").innerHTML = advice(ta);
}
const ro = ([k, v]) => `<div class="readout"><div class="k">${k}</div><div class="v">${v}</div></div>`;
function drawRate() {
  const cv = $("#rateCv"); if (!cv || !R) return;
  const dpr = sizeCanvas(cv), g = cv.getContext("2d"), W = cv.width / dpr, H = cv.height / dpr;
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const c = D.spacecraft, band = c.bands[state.band], ant = c.dsn[String(state.band === "Ka" ? 34 : state.dsn)];
  const dmax = Math.max(R.commMax * 1.15, 0.01), dmin = dmax / 60;
  const f = (d) => P.dataRate({ pt: state.rf, dt: state.dish, dr: ant.D, fGHz: band.f, dAU: d, tsys: ant.tsys[state.band], ebn0dB: c.link.ebn0dB, lossDB: band.lossDB, etaT: c.link.etaT, etaR: ant.eta }).rb;
  const req = R.sc.comm.rateReq;
  const ylo = Math.min(req, f(dmax)) / 4, yhi = Math.max(req, f(dmin)) * 2;
  const x0 = 58, x1 = W - 10, y0 = 8, y1 = H - 26;
  const X = (d) => x0 + d / dmax * (x1 - x0), Y = (v) => y1 - (Math.log10(v) - Math.log10(ylo)) / (Math.log10(yhi) - Math.log10(ylo)) * (y1 - y0);
  g.font = "500 10px 'JetBrains Mono', monospace"; g.fillStyle = "#8f98bd"; g.strokeStyle = "rgba(150,170,255,.12)";
  g.textAlign = "right"; g.textBaseline = "middle";
  for (let e = Math.ceil(Math.log10(ylo)); e <= Math.log10(yhi); e++) { const v = Math.pow(10, e); g.beginPath(); g.moveTo(x0, Y(v)); g.lineTo(x1, Y(v)); g.stroke(); g.fillText(rate(v).replace(".00", ""), x0 - 4, Y(v)); }
  g.textAlign = "center"; g.textBaseline = "top";
  const st = niceStep(dmax, 5); for (let d = 0; d <= dmax; d += st) g.fillText(d < 0.01 ? nf(d * AU_KM / 1000) + " Mm" : nf(d, st < 0.1 ? 3 : st < 1 ? 1 : 0) + " AU", X(d), y1 + 5);
  g.fillStyle = "rgba(255,79,154,.08)"; g.fillRect(x0, Y(req), x1 - x0, y1 - Y(req));
  g.strokeStyle = "#ff4f9a"; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(x0, Y(req)); g.lineTo(x1, Y(req)); g.stroke(); g.setLineDash([]);
  g.fillStyle = "#ff8fbf"; g.textAlign = "right"; g.textBaseline = "bottom"; g.fillText("needed " + rate(req), x1 - 4, Y(req) - 2);
  g.strokeStyle = "#7cc8ff"; g.lineWidth = 2; g.beginPath();
  for (let k = 0; k <= 80; k++) { const d = dmin + (dmax - dmin) * k / 80; (k ? g.lineTo : g.moveTo).call(g, X(d), Y(f(d))); }
  g.stroke();
  for (const [d, lbl] of [[R.commArr, "arrival"], [R.commMax, "farthest"]]) { g.fillStyle = "#fff"; g.beginPath(); g.arc(X(d), Y(f(d)), 3.5, 0, 6.283); g.fill(); g.fillStyle = "#c3cae6"; g.textAlign = "center"; g.textBaseline = "bottom"; g.fillText(lbl, X(d), Y(f(d)) - 5); }
}

/* ================================================================ 5 · review */
function buildReview() {
  $("#s5").innerHTML = `
    <h2 class="md-h" id="s5h" tabindex="-1"><span class="k">Step 5</span>Mission Concept Review</h2>
    <p class="md-p">At a Mission Concept Review (MCR) the question is simple: <em>does at least one concept close, with margin?</em> Here is your concept on one page ${why("lifecycle")}.</p>
    <div class="md-rv" id="rvVerdict"></div>
    <div class="md-rvgrid">
      <div class="readouts md-ro4" id="rvNums"></div>
      <div class="md-rvchecks" id="rvChecks"></div>
    </div>
    <h3 class="md-h3">Timeline</h3>
    <div class="md-tl" id="rvTL"></div>
    <h3 class="md-h3">What an MCR board would ask next</h3>
    <ul class="md-next" id="rvNext"></ul>
    <div class="md-share"><label for="shareUrl" class="mono">Shareable link</label><div class="row"><input type="text" id="shareUrl" readonly><button class="btn small" id="copyUrl">Copy</button><button class="btn small primary" id="printBtn2">Print one-page summary</button></div></div>`;
  $("#copyUrl").addEventListener("click", share);
  $("#printBtn2").addEventListener("click", printSummary);
  $("#rvChecks").addEventListener("click", (e) => { const b = e.target.closest("[data-go]"); if (b) go(+b.dataset.go); });
  $("#rvVerdict").addEventListener("click", (e) => { const b = e.target.closest("[data-go]"); if (b) go(+b.dataset.go); });
}
const CHECK_STEP = { launch: 3, power: 4, comm: 4, prop: 4, thermal: 4 };
function checkText(c) {
  const sc = R.sc;
  return {
    launch: R.cap > 0 ? `${kg(R.launchMass)} on ${R.lv.name} (${R.lv.variant}), which lifts ${kg(R.cap)} at C3 ${nf(R.traj.c3, 1)}: ${pct(R.launchMargin)}` : `${R.lv.name} cannot reach C3 ${nf(R.traj.c3, 1)}`,
    power: `${nf(sc.power.avail)} W available for ${nf(sc.power.need)} W needed: ${pct(sc.power.margin)}`,
    comm: `${rate(sc.comm.rateMax)} at ${nf(R.commMax, 2)} AU for ${rate(sc.comm.rateReq)} needed: ${nf(sc.comm.marginDB, 1)} dB`,
    prop: `${kg(sc.prop)} of propellant, ${nf(sc.propulsion.fraction * 100)} % of launch mass`,
    thermal: `surfaces ${nf(sc.thermal.Tcold - 273.15)} to ${nf(sc.thermal.Thot - 273.15)} °C, ${nf(sc.thermal.heater)} W of heaters`
  }[c.id];
}
function verdictOf() {
  return R.allGreen ? ["ok", "The concept closes", "Every margin meets its Pre-Phase A target. Ready for a Mission Concept Review."]
    : R.closes ? ["warn", "Closes, with thin margins", "Nothing fails, but some margins are below target: expect growth to eat them."]
    : ["bad", "Does not close yet", "At least one budget is negative. Follow the advice in the step it points to."];
}
function updateReview() {
  const t = R.traj, sc = R.sc, [vs, vt, vp] = verdictOf();
  const fails = R.checks.filter((c) => c.status !== "ok");
  $("#rvVerdict").innerHTML = `<div class="md-rvbig ${vs}"><i class="ic">${vs === "ok" ? "✓" : vs === "warn" ? "!" : "✕"}</i><div><h3>${vt}</h3><p>${vp}</p>
    ${fails.length ? `<div class="row">${fails.map((c) => `<button class="chip ${c.status === "bad" ? "flame" : "sol"}" data-go="${CHECK_STEP[c.id]}">${esc(c.label)} → step ${CHECK_STEP[c.id]}</button>`).join("")}</div>` : ""}</div></div>`;
  $("#rvNums").innerHTML = [
    ["Mission", esc(state.name || "Untitled")], ["Destination", esc(R.dest.short)],
    ["Launch", P.fmtDate(t.jdDep, true)], ["Arrival", P.fmtDate(t.jdArr, true)],
    ["Cruise", days(t.tof)], ["Launch energy C3", nf(t.c3, 2) + "<small>km²/s²</small>"],
    ["Spacecraft Δv", nf(sc.dvTotal, 2) + "<small>km/s</small>"], ["Δv from parking orbit", nf(R.dvDepartLEO, 2) + "<small>km/s</small>"],
    ["Launch mass", kg(R.launchMass)], ["Vehicle", esc(R.lv.name)],
    ["Light time at arrival " + why("lighttime"), lightTime(R.lightArr)], ["Power at destination", nf(sc.power.avail) + "<small>W</small>"]
  ].map(ro).join("");
  $("#rvChecks").innerHTML = R.checks.map((c) => `<button class="md-chk ${c.status}" data-go="${CHECK_STEP[c.id]}"><i></i><span><b>${esc(c.label)}</b><small>${esc(checkText(c))}</small></span>${pill(c.status)}</button>`).join("");
  $("#rvTL").innerHTML = timelineSVG();
  const nx = [];
  if (R.dest.note && /gravity assist/i.test(R.dest.note)) nx.push("Would a gravity-assist trajectory lower the launch energy enough to use a smaller launcher? (Out of scope here: this study is direct.)");
  if (Math.abs(t.dla || 0) > 28.5) nx.push(`The departure declination is ${nf(t.dla, 0)}°: what does that really cost from the Cape?`);
  nx.push(`How long is the launch period? A real mission needs about 20 days of launch opportunities, not one perfect day.`);
  nx.push(`Which requirement drives the dry mass most, and what if the ${Math.round(R.maturity.contingency * 100)} % contingency is not enough?`);
  if (state.powerSource === "rtg") nx.push("Is plutonium-238 available for this many generators on this schedule?");
  if (R.opt.kind === "entry") nx.push("How is the probe released and tracked, and how does its data reach Earth (relay through the carrier)?");
  nx.push("What are the top five risks, and what would the concept look like at half the cost?");
  $("#rvNext").innerHTML = nx.map((x) => `<li>${esc(x)}</li>`).join("");
  $("#shareUrl").value = location.href.split("#")[0] + "#" + P.encodeState(state) + "&step=5";
}
function timelineSVG() {
  const t = R.traj, sci = state.years * 365.25;
  const phases = [["Launch & checkout", 30, "#ff7a3d"], ["Cruise", Math.max(1, t.tof - 90), "#7cc8ff"], ["Approach", Math.min(60, t.tof * 0.3), "#b18cff"],
    [R.opt.kind === "entry" ? "Entry & descent" : R.opt.kind === "flyby" ? "Flyby" : R.opt.kind === "rendezvous" ? "Rendezvous" : "Orbit insertion", Math.max((t.tof + sci) * 0.02, 1), "#ffc24b"],
    ["Science", sci, "#4ef0b8"], ["Closeout", 30, "#8f98bd"]];
  const sum = phases.reduce((a, p) => a + p[1], 0), at = (d) => d / sum * 100;
  return `<div class="md-tlbar" role="img" aria-label="Mission timeline: launch ${P.fmtDate(t.jdDep, true)}, arrival ${P.fmtDate(t.jdArr, true)}, science for ${nf(state.years, 1)} years.">${phases.map(([l, d, c]) => `<div style="flex:${d};--c:${c}"><span>${esc(l)}</span></div>`).join("")}</div>
    <div class="md-tldates mono"><span style="left:0">${P.fmtDate(t.jdDep, true)}<br><em>launch · Phase E</em></span><span style="left:${clamp(at(30 + Math.max(1, t.tof - 90) + Math.min(60, t.tof * 0.3)), 18, 82)}%">${P.fmtDate(t.jdArr, true)}<br><em>arrival</em></span><span style="left:100%">${P.fmtDate(t.jdArr + sci + 30, true)}<br><em>Phase F</em></span></div>`;
}

/* ================================================================ status panel */
function renderStatus() {
  const [vs, vt] = verdictOf(), t = R.traj;
  $("#mVerdict").className = "md-mverdict " + vs;
  $("#mVerdict").innerHTML = `<i>${vs === "ok" ? "✓" : vs === "warn" ? "!" : "✕"}</i><b>${vt}</b><span class="mono">${kg(R.launchMass)} · ${esc(R.lv.name)} · C3 ${nf(t.c3, 1)}</span>`;
  $("#verdict").className = "md-verdict " + vs;
  $("#verdict").innerHTML = `<i class="ic">${vs === "ok" ? "✓" : vs === "warn" ? "!" : "✕"}</i><div><h3>${vt}</h3><p>${esc(state.name || "Untitled mission")} · ${esc(R.dest.short)}</p></div>`;
  $("#glance").innerHTML = `<p class="md-goal">“${esc(state.goal || "Add a science goal in step 1")}”</p><dl>
    <dt>Launch</dt><dd>${P.fmtDate(t.jdDep, true)}</dd><dt>Arrival</dt><dd>${P.fmtDate(t.jdArr, true)}</dd>
    <dt>C3</dt><dd>${nf(t.c3, 1)} km²/s²</dd><dt>Arrival v∞</dt><dd>${nf(t.vinfArr, 2)} km/s</dd>
    <dt>Launch mass</dt><dd>${kg(R.launchMass)}</dd><dt>Vehicle</dt><dd>${esc(R.lv.name)}</dd></dl>`;
  const T = D.spacecraft.targets;
  const vals = {
    launch: [R.cap > 0 ? pct(R.launchMargin) : "fails", clamp((R.launchMargin + 0.2) / 1.2, 0, 1)],
    power: [pct(R.sc.power.margin), clamp((R.sc.power.margin + 0.2) / 0.9, 0, 1)],
    comm: [nf(R.sc.comm.marginDB, 1) + " dB", clamp((R.sc.comm.marginDB + 5) / 20, 0, 1)],
    prop: [nf(R.sc.propulsion.fraction * 100) + " % prop", clamp(1 - R.sc.propulsion.fraction / 0.8, 0, 1)],
    thermal: [nf(R.sc.thermal.heater) + " W heat", R.checks[4].status === "bad" ? 0.05 : R.checks[4].status === "warn" ? 0.45 : 0.9]
  };
  const names = { launch: "Launch", power: "Power", comm: "Data", prop: "Propellant", thermal: "Thermal" };
  $("#lights").innerHTML = R.checks.map((c) => `<button class="md-light ${c.status}" data-go="${CHECK_STEP[c.id]}" title="${esc(checkText(c))}"><i></i><span class="n">${names[c.id]}</span><span class="b"><b style="width:${vals[c.id][1] * 100}%"></b></span><span class="v mono">${vals[c.id][0]}</span></button>`).join("");
  $("#lcMini").innerHTML = D.lifecycle.map((p, i) => `<span class="${i === 0 ? "on" : ""}" title="${esc(p.phase + ": " + p.name)}">${esc(p.phase.replace("Pre-Phase ", "Pre-").replace("Phase ", ""))}</span>`).join("");
}

/* ================================================================ global wiring */
function wireGlobal() {
  $("#rail").addEventListener("click", (e) => { const b = e.target.closest("[data-go]"); if (b) go(+b.dataset.go); });
  $("#mVerdict").addEventListener("click", () => go(5));
  $("#status").addEventListener("click", (e) => { const b = e.target.closest("[data-go]"); if (b) go(+b.dataset.go); });
  $("#backBtn").addEventListener("click", () => go(step - 1));
  $("#nextBtn").addEventListener("click", () => go(step === 5 ? 1 : step + 1));
  $("#presetSel").addEventListener("change", (e) => { if (e.target.value) { loadPreset(e.target.value); resetTime(); } });
  $("#shareBtn").addEventListener("click", share);
  $("#printBtn").addEventListener("click", printSummary);
  $("#lcBtn").addEventListener("click", openDrawer);
  $("#collapse").addEventListener("click", () => { const c = $("#flow").classList.toggle("collapsed"); $("#collapse").textContent = c ? "▲ STUDY" : "▼ HIDE"; $("#collapse").setAttribute("aria-expanded", String(!c)); requestAnimationFrame(layoutView); });
  $("#drawerClose").addEventListener("click", () => { $("#drawer").hidden = true; $("#lcBtn").focus(); });
  document.addEventListener("click", (e) => {
    const w = e.target.closest(".md-why");
    if (w) { e.stopPropagation(); showWhy(w); return; }
    if (!e.target.closest("#pop")) $("#pop").hidden = true;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { $("#pop").hidden = true; $("#drawer").hidden = true; }
  });
  addEventListener("beforeprint", fillPrint);
  addEventListener("hashchange", () => { const s = P.decodeState(location.hash, state); if (P.encodeState(s) !== P.encodeState(state)) { state = s; recompute(); go(step, false, true); } });
}
function showWhy(btn) {
  const w = D.why[btn.dataset.why]; if (!w) return;
  const pop = $("#pop");
  pop.innerHTML = `<h4>${esc(w.t)}</h4><p>${esc(w.b)}</p>${w.l.length ? `<div class="md-poplinks">${w.l.map(([t, u]) => `<a href="${u}">${esc(t)} →</a>`).join("")}</div>` : ""}`;
  pop.hidden = false;
  const r = btn.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
  pop.style.left = clamp(r.left + r.width / 2 - pw / 2, 8, innerWidth - pw - 8) + "px";
  pop.style.top = (r.bottom + ph + 12 > innerHeight ? Math.max(8, r.top - ph - 8) : r.bottom + 8) + "px";
}
function openDrawer() {
  $("#lcFull").innerHTML = D.lifecycle.map((p, i) => `<li class="${i === 0 ? "on" : ""}"><div class="ph mono">${esc(p.phase)}</div><div><b>${esc(p.name)}</b><p>${esc(p.text)}</p><span class="rv mono">${esc(p.review)}</span></div></li>`).join("");
  $("#drawer").hidden = false;
  $("#drawerClose").focus();
}
function share() {
  const url = location.href.split("#")[0] + "#" + P.encodeState(state) + "&step=" + step;
  (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast("Link copied: it opens this exact design."), () => toast("Copy this address from the browser bar to share the design."));
}
let toastT = 0;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 3800); }
function fillPrint() {
  const t = R.traj, sc = R.sc, [vs, vt] = verdictOf();
  $("#printSheet").innerHTML = `<header><div><div class="pk">Cosmic Library · Mission Designer · Pre-Phase A concept</div><h1>${esc(state.name || "Untitled mission")}</h1><p>${esc(R.dest.name)} — ${esc(state.goal || "")}</p></div><div class="pv ${vs}">${vt}</div></header>
    <table><tr><th>Launch</th><td>${P.fmtDate(t.jdDep, true)} on ${esc(R.lv.name)} (${esc(R.lv.variant)})</td><th>Arrival</th><td>${P.fmtDate(t.jdArr, true)} after ${days(t.tof)}</td></tr>
    <tr><th>Launch energy</th><td>C3 ${nf(t.c3, 2)} km²/s²${t.dla != null ? ", DLA " + nf(t.dla, 1) + "°" : ""}</td><th>Arrival</th><td>v∞ ${nf(t.vinfArr, 2)} km/s · ${esc(R.opt.label)}</td></tr>
    <tr><th>Spacecraft Δv</th><td>${nf(sc.dvTotal, 2)} km/s, I<sub>sp</sub> ${state.isp} s</td><th>Light time</th><td>${lightTime(R.lightArr)} at arrival</td></tr></table>
    <h2>Mass budget</h2><table>${sc.items.map((i) => `<tr><td>${esc(i.label)}</td><td class="n">${kg(i.kg)}</td></tr>`).join("")}<tr><td>Contingency (${Math.round(R.maturity.contingency * 100)} %)</td><td class="n">${kg(sc.contingencyKg)}</td></tr><tr><td>Propellant</td><td class="n">${kg(sc.prop)}</td></tr><tr class="b"><td>Launch mass</td><td class="n">${kg(sc.wet)}</td></tr><tr><td>Launcher capability at this C3</td><td class="n">${kg(R.cap)}</td></tr></table>
    <h2>Margins</h2><table>${R.checks.map((c) => `<tr><td>${esc(c.label)}</td><td>${esc(checkText(c))}</td><td class="s ${c.status}">${STATUS_WORD[c.status]}</td></tr>`).join("")}</table>
    <h2>Subsystems</h2><table><tr><th>Power</th><td>${state.powerSource === "rtg" ? sc.power.nRtg + " × MMRTG" : nf(sc.power.area, 1) + " m² solar array"}, ${nf(sc.power.avail)} W at end of life for ${nf(sc.power.load)} W load</td></tr>
    <tr><th>Telecom</th><td>${state.band}-band, ${state.dish} m dish, ${state.rf} W to a DSN ${state.band === "Ka" ? 34 : state.dsn} m antenna; ${rate(sc.comm.rateMax)} at ${nf(R.commMax, 2)} AU</td></tr>
    <tr><th>Thermal</th><td>${esc(sc.thermal.finish.label)}; ${nf(sc.thermal.heater)} W heaters</td></tr></table>
    <p class="pf">Estimates for teaching: launch-vehicle curves are rocket-equation models (authoritative data: NASA Launch Services Program performance website); subsystem rules of thumb after SMAD and the NASA Systems Engineering Handbook. Ephemeris: JPL/Standish. Link: ${esc(location.href.split("#")[0] + "#" + P.encodeState(state))}</p>`;
}
function printSummary() { fillPrint(); window.print(); }

/* ================================================================ 3-D view */
let renderer, scene, camera, controls, world, sunGlow, stars, lastT = performance.now();
let tJd = 0, playing = !STILL && !RM, span = [0, 1], viewMode = "tilt", frame = "", camDist = 40;
const S = 10;                                          // scene units per AU
const toV = (p, k = S) => new THREE.Vector3(p.x * k, p.z * k, -p.y * k);
const arrV = (r, k) => new THREE.Vector3(r[0] * k, r[2] * k, -r[1] * k);
const PLANETS = [["mercury", "#b9b1a8", 0.11], ["venus", "#f3d9a4", 0.19], ["earth", "#6fb4ff", 0.2], ["mars", "#e0764a", 0.16], ["jupiter", "#e3c39a", 0.46], ["saturn", "#ecd9a8", 0.4]];
const labels = {};
let bodies = {}, trPath = null, trDone = null, craft = null, mkLaunch = null, mkArr = null, arcPts = [], arcT = [];

function glowTex(inner = "rgba(255,255,255,1)", mid = "rgba(255,210,140,.35)") {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d"), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(0.25, mid); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function ringTex(col) {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d"); g.strokeStyle = col; g.lineWidth = 7; g.beginPath(); g.arc(64, 64, 52, 0, 6.283); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function initScene() {
  const stage = $("#stage");
  renderer = new THREE.WebGLRenderer({ antialias: !LOW, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, LOW ? 1 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  stage.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("aria-hidden", "true");
  scene = new THREE.Scene(); scene.background = new THREE.Color(0x04050a);
  camera = new THREE.PerspectiveCamera(40, 1, 0.01, 8000);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.enablePan = false; controls.rotateSpeed = 0.6;
  // starfield
  const n = LOW ? 1200 : 2600, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * 6.283, r = 3000;
    pos[i * 3] = r * Math.sqrt(1 - u * u) * Math.cos(th); pos[i * 3 + 1] = r * u; pos[i * 3 + 2] = r * Math.sqrt(1 - u * u) * Math.sin(th);
    const b = 0.35 + Math.random() * 0.65; col[i * 3] = b; col[i * 3 + 1] = b * (0.9 + Math.random() * 0.1); col[i * 3 + 2] = b * (0.85 + Math.random() * 0.2);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(pos, 3)); sg.setAttribute("color", new THREE.BufferAttribute(col, 3));
  stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false }));
  scene.add(stars);
  world = new THREE.Group(); scene.add(world);
  addEventListener("resize", layoutView);
  new ResizeObserver(layoutView).observe($("#flow"));
  // scrubber
  $("#timeRange").addEventListener("input", (e) => { tJd = span[0] + (span[1] - span[0]) * (+e.target.value / 1000); setPlaying(false); });
  $("#playBtn").addEventListener("click", () => { if (tJd >= span[1] - 0.01) tJd = span[0]; setPlaying(!playing); });
  $("#views").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; viewMode = b.dataset.v; segSync("views", viewMode); frameCamera(true); });
  requestAnimationFrame(loop);
}
function setPlaying(p) {
  playing = p;
  $("#playBtn").setAttribute("aria-pressed", String(p));
  $("#playBtn").setAttribute("aria-label", p ? "Pause the animation" : "Play the animation");
  $("#playBtn").classList.toggle("paused", !p);
}
function label(id, text, cls = "") {
  if (!labels[id]) { const d = document.createElement("div"); d.className = "md-lab " + cls; $("#labels").appendChild(d); labels[id] = { el: d, pos: new THREE.Vector3(), on: true }; }
  labels[id].el.innerHTML = text; labels[id].on = true;
  return labels[id];
}
function clearWorld() {
  world.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
  world.clear();
  for (const k in labels) { labels[k].el.remove(); delete labels[k]; }
  bodies = {};
}
function sphere(r, color, emissive = false) {
  const m = emissive ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0 });
  return new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), m);
}
function buildHelio(destId) {
  clearWorld();
  world.add(new THREE.AmbientLight(0x404a66, 0.9));
  const pl = new THREE.PointLight(0xfff1d6, 3.2, 0, 0); world.add(pl);
  const sun = sphere(0.45, 0xfff1c4, true); world.add(sun);
  sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex("rgba(255,250,230,1)", "rgba(255,190,90,.35)"), blending: THREE.AdditiveBlending, depthWrite: false }));
  sunGlow.scale.set(5, 5, 1); world.add(sunGlow);
  label("sun", "Sun", "sun").pos.set(0, 0, 0);
  const list = PLANETS.concat(destId === "asteroid" ? [["asteroid", "#b6aa98", 0.07]] : []);
  for (const [id, color, r] of list) {
    const tgt = id === destId;
    // orbit line
    const pts = [];
    if (id === "asteroid") { const T = P.periodDays("asteroid"); for (let k = 0; k <= 240; k++) { const s = P.stateOf("asteroid", state.dep + T * k / 240); pts.push(arrV(s.r, S / AU_KM)); } }
    else { const op = orbitPath(id, state.dep, 360); for (let k = 0; k <= 360; k++) { const i = (k % 360) * 4; pts.push(new THREE.Vector3(op[i] * S, op[i + 2] * S, -op[i + 1] * S)); } }
    const lg = new THREE.BufferGeometry().setFromPoints(pts);
    world.add(new THREE.Line(lg, new THREE.LineBasicMaterial({ color, transparent: true, opacity: tgt || id === "earth" ? 0.55 : 0.18 })));
    const m = sphere(r, color); world.add(m);
    if (id === "saturn") { const ring = new THREE.Mesh(new THREE.RingGeometry(r * 1.4, r * 2.3, 48), new THREE.MeshBasicMaterial({ color: 0xd9c9a0, side: THREE.DoubleSide, transparent: true, opacity: 0.55 })); ring.rotation.x = -Math.PI / 2 + 0.47; m.add(ring); }
    bodies[id] = { mesh: m, r, lab: label(id, id === "asteroid" ? "Asteroid" : id[0].toUpperCase() + id.slice(1), tgt ? "tgt" : id === "earth" ? "home" : "") };
  }
  buildTransfer(destId);
}
function buildTransfer(destId) {
  for (const o of [trPath, trDone, craft, mkLaunch, mkArr]) if (o) { world.remove(o); o.geometry && o.geometry.dispose(); o.material && o.material.dispose(); }
  const t = R.traj, n = 300;
  arcPts = []; arcT = [];
  if (destId === "moon") {
    const arc = P.lunarArc(t.jdDep, t.lunar, n);
    arc.pts.forEach((p, i) => { arcPts.push(arrV(p, LUN)); arcT.push(t.jdDep + arc.t[i] / 86400); });
  } else {
    if (!isFinite(t.c3)) return;
    for (let k = 0; k <= n; k++) { const dt = t.tof * k / n * 86400, s = P.propagate(t.r1, t.v1, dt); arcPts.push(arrV(s.r, S / AU_KM)); arcT.push(t.jdDep + t.tof * k / n); }
  }
  const g1 = new THREE.BufferGeometry().setFromPoints(arcPts);
  const c0 = new THREE.Color("#7cc8ff"), c1 = new THREE.Color(R.dest.color), cols = new Float32Array(arcPts.length * 3);
  arcPts.forEach((_, i) => { const c = c0.clone().lerp(c1, i / (arcPts.length - 1)); cols.set([c.r, c.g, c.b], i * 3); });
  g1.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  trPath = new THREE.Line(g1, new THREE.LineDashedMaterial({ vertexColors: true, transparent: true, opacity: 0.55, dashSize: 0.25, gapSize: 0.18 }));
  trPath.computeLineDistances(); world.add(trPath);
  const g2 = new THREE.BufferGeometry().setFromPoints(arcPts); g2.setAttribute("color", new THREE.BufferAttribute(cols.slice(), 3));
  trDone = new THREE.Line(g2, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 1 })); world.add(trDone);
  craft = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex("rgba(255,255,255,1)", "rgba(255,150,80,.55)"), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
  world.add(craft);
  mkLaunch = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex("#7cc8ff"), transparent: true, depthWrite: false, opacity: 0.9 }));
  mkArr = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex(R.dest.color), transparent: true, depthWrite: false, opacity: 0.9 }));
  mkLaunch.position.copy(arcPts[0]); mkArr.position.copy(arcPts[arcPts.length - 1]);
  world.add(mkLaunch, mkArr);
  label("launch", "Launch · " + P.fmtDate(t.jdDep), "ev").pos.copy(arcPts[0]);
  label("arrive", "Arrival · " + P.fmtDate(t.jdArr), "ev").pos.copy(arcPts[arcPts.length - 1]);
  label("craft", "<span>" + esc(state.name || "Spacecraft") + "</span>", "craft");
  span = destId === "moon" ? [t.jdDep - 0.4, t.jdArr + 1.2] : [t.jdDep - 25, t.jdArr + 45];
  if (tJd < span[0] || tJd > span[1]) tJd = span[0];
  const tk = $("#timeTicks");
  tk.innerHTML = `<span style="left:${(t.jdDep - span[0]) / (span[1] - span[0]) * 100}%">launch</span><span style="left:${(t.jdArr - span[0]) / (span[1] - span[0]) * 100}%">arrival</span>`;
}
const LUN = 1 / 10000;                                 // lunar frame: scene units per km
function buildLunarFrame() {
  clearWorld();
  world.add(new THREE.AmbientLight(0x404a66, 1.0));
  const dl = new THREE.DirectionalLight(0xfff1d6, 2.4); world.add(dl); bodies.sunLight = { light: dl };
  const earth = sphere(6378 * LUN * 2.2, 0x6fb4ff); world.add(earth);
  bodies.earthG = { mesh: earth, lab: label("earth", "Earth", "home") };
  const pts = []; for (let k = 0; k <= 200; k++) { const m = moonGeocentric(state.dep + 27.32 * k / 200); pts.push(toV(m, AU_KM * LUN)); }
  world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xcfd3dc, transparent: true, opacity: 0.35 })));
  const moon = sphere(1737 * LUN * 3, 0xcfd3dc); world.add(moon);
  bodies.moonG = { mesh: moon, lab: label("moon", "Moon", "tgt") };
  const park = new THREE.Mesh(new THREE.RingGeometry(P.R_PARK * LUN * 2.2 - 0.02, P.R_PARK * LUN * 2.2 + 0.02, 64), new THREE.MeshBasicMaterial({ color: 0x7cc8ff, side: THREE.DoubleSide, transparent: true, opacity: 0.5 }));
  park.rotation.x = -Math.PI / 2; world.add(park);
  buildTransfer("moon");
}
function sceneUpdate() {
  if (!renderer || !R) return;
  const key = R.dest.id + (R.dest.id === "moon" ? "" : "|" + Math.round(state.dep / 200));
  if (key !== frame) { frame = key; if (R.dest.id === "moon") buildLunarFrame(); else buildHelio(R.dest.id); frameCamera(false); }
  else buildTransfer(R.dest.id);
  if (STILL) tJd = R.traj.jdDep + (R.traj.jdArr - R.traj.jdDep) * 0.62;
}
function resetTime() { if (!R) return; tJd = span[0]; if (!STILL && !RM) setPlaying(true); }
let viewBox = { w: 800, h: 700 };
function sceneRadius() {
  if (R.dest.id === "moon") return 42;
  const a = R.dest.id === "asteroid" ? 1.4 : P.elements(R.dest.id, state.dep).a;
  return Math.max(1.2, a * 1.07) * S;
}
/** Camera distance so the destination's orbit fits the part of the screen the panels leave free. */
function fitDist() {
  const rad = sceneRadius(), H = innerHeight, el = (viewMode === "top" ? 89.5 : 52) * Math.PI / 180;
  const t = Math.tan(20 * Math.PI / 180);
  const dW = rad * H / (t * viewBox.w * 0.94), dH = rad * Math.sin(el) * H / (t * viewBox.h * 0.9);
  return Math.max(dW, dH);
}
function frameCamera(animate) {
  const moon = R.dest.id === "moon", rad = sceneRadius();
  camDist = fitDist();
  const el = viewMode === "top" ? 89.5 : 52, az = moon ? -30 : -60;
  const e = el * Math.PI / 180, a = az * Math.PI / 180;
  const to = new THREE.Vector3(camDist * Math.cos(e) * Math.cos(a), camDist * Math.sin(e), camDist * Math.cos(e) * Math.sin(a));
  if (animate && window.gsap && !RM) gsap.to(camera.position, { x: to.x, y: to.y, z: to.z, duration: 0.9, ease: "power2.inOut" });
  else camera.position.copy(to);
  controls.target.set(0, 0, 0);
  controls.minDistance = rad * 0.3; controls.maxDistance = rad * 12;
}
function layoutView() {
  if (!renderer) return;
  const W = innerWidth, H = innerHeight;
  if (W !== layoutView.w || H !== layoutView.h) { renderer.setSize(W, H, false); layoutView.w = W; layoutView.h = H; }
  camera.aspect = W / H;
  const mob = W <= 820;
  const fl = $("#flow").getBoundingClientRect(), stEl = $("#status"), st = stEl.getBoundingClientRect();
  const nav = 60;
  let cx = 0, cy = 0;
  if (!mob) {
    const left = fl.right, right = getComputedStyle(stEl).display !== "none" && st.width ? st.left : W;
    cx = (left + right) / 2 - W / 2; cy = 26;
    viewBox = { w: right - left - 24, h: H - nav - 90 };
  } else {
    const top = nav + 56, bottom = fl.top;
    cy = -((top + bottom) / 2 - H / 2);
    viewBox = { w: W - 16, h: Math.max(120, bottom - top) };
  }
  camera.setViewOffset(W, H, -cx, cy, W, H);
  camera.updateProjectionMatrix();
  if (R && frame) { const d = fitDist(); if (Math.abs(d - camDist) / camDist > 0.02) { camDist = d; camera.position.setLength(d); } }
}
const _v = new THREE.Vector3();
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now(), dt = Math.min((now - lastT) / 1000, 0.1); lastT = now;
  if (document.hidden || !R || !frame) return;
  if (playing && !STILL) {
    const dur = R.dest.id === "moon" ? 9 : 13;
    tJd += (span[1] - span[0]) / dur * dt;
    if (tJd > span[1]) { tJd = span[1]; setPlaying(false); setTimeout(() => { if (!playing && tJd >= span[1]) { tJd = span[0]; setPlaying(true); } }, 2500); }
  }
  tJd = clamp(tJd, span[0], span[1]);
  $("#timeRange").value = (tJd - span[0]) / (span[1] - span[0]) * 1000; paint($("#timeRange"));
  const t = R.traj, moon = R.dest.id === "moon";
  $("#dateLbl").textContent = P.fmtDate(tJd, true);
  $("#phaseLbl").textContent = tJd < t.jdDep ? `T − ${nf(t.jdDep - tJd, moon ? 1 : 0)} days` : tJd <= t.jdArr ? `cruise · day ${nf(tJd - t.jdDep, moon ? 1 : 0)} of ${nf(t.tof, moon ? 1 : 0)}` : `at ${R.dest.short} · +${nf(tJd - t.jdArr, moon ? 1 : 0)} days`;
  const zoom = camera.position.length() / 40;
  if (moon) {
    const m = moonGeocentric(tJd); bodies.moonG.mesh.position.copy(toV(m, AU_KM * LUN)); bodies.moonG.lab.pos.copy(bodies.moonG.mesh.position);
    bodies.earthG.lab.pos.set(0, 0, 0);
    const e = heliocentric("earth", tJd); bodies.sunLight.light.position.copy(toV({ x: -e.x, y: -e.y, z: -e.z }, 100));
  } else {
    for (const id in bodies) {
      const b = bodies[id], p = P.positionAU(id, tJd);
      b.mesh.position.copy(toV(p)); b.lab.pos.copy(b.mesh.position);
      b.mesh.scale.setScalar(Math.max(1, zoom * 0.9));
    }
    sunGlow.scale.setScalar(Math.max(4, zoom * 3.2));
  }
  // spacecraft
  if (arcPts.length) {
    let k = 0;
    if (tJd <= t.jdDep) k = 0; else if (tJd >= t.jdArr) k = arcPts.length - 1;
    else { k = Math.min(arcPts.length - 1, Math.floor((tJd - t.jdDep) / (t.jdArr - t.jdDep) * (arcPts.length - 1))); }
    const cpos = tJd <= t.jdDep ? (moon ? arcPts[0] : bodies.earth.mesh.position) : tJd >= t.jdArr ? (moon ? bodies.moonG.mesh.position : bodies[R.dest.id].mesh.position) : arcPts[k];
    craft.position.copy(cpos);
    craft.scale.setScalar(moon ? 3 : Math.max(0.9, zoom * 0.75));
    trDone.geometry.setDrawRange(0, tJd <= t.jdDep ? 0 : k + 1);
    labels.craft.pos.copy(cpos); labels.craft.on = tJd > t.jdDep && tJd < t.jdArr;
    mkLaunch.scale.setScalar(moon ? 2.4 : Math.max(0.7, zoom * 0.6)); mkArr.scale.copy(mkLaunch.scale);
  }
  controls.update();
  renderer.render(scene, camera);
  // labels
  const W = innerWidth, H = innerHeight;
  for (const k in labels) {
    const L = labels[k];
    _v.copy(L.pos).project(camera);
    const vis = L.on && _v.z < 1 && Math.abs(_v.x) < 1.05 && Math.abs(_v.y) < 1.05;
    L.el.style.display = vis ? "" : "none";
    if (vis) L.el.style.transform = `translate(${(_v.x * 0.5 + 0.5) * W}px, ${(-_v.y * 0.5 + 0.5) * H}px)`;
  }
}
