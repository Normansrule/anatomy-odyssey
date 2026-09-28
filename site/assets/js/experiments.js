// experiments.js — Cosmic Library experiments page.
// Loads data/experiments.json (levels 0–2 + level metadata) and, if present,
// data/experiments-advanced.json (levels 3–4); schema in experiments/SCHEMA.md.
// Renders the stage stack, the filterable build cards and a Three.js STL viewer.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const REPO_TREE = "https://github.com/Normansrule/cosmic-library/tree/main/experiments/";
const OUTPUT_ORDER = ["STL", "SCAD", "PCB", "code", "data", "flight", "radio", "photo", "SVG"];
const BUDGET_STEPS = [10, 50, 150, 300, 1000, Infinity];            // slider index → max USD
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#7cc8ff";

const state = { level: "all", outputs: new Set(), budget: 5, q: "", sort: "ladder" };
let LEVELS = [];
let EXPS = [];

/* ---------------------------------------------------------------- data */
async function loadJSON(url, optional) {
  try {
    const r = await fetch(url, { cache: "no-cache" });
    if (!r.ok) { if (!optional) console.warn("could not load", url, r.status); return null; }
    return await r.json();
  } catch (e) {
    if (!optional) console.warn("could not load", url, e);
    return null;
  }
}

function normalise(list) {
  const arr = Array.isArray(list) ? list : (list && list.experiments) || [];
  return arr.filter((e) => e && e.id && Number.isFinite(+e.level)).map((e) => ({
    ...e,
    level: +e.level,
    folder: e.folder || e.id,
    cost_usd: Array.isArray(e.cost_usd) ? e.cost_usd.map(Number) : [Number(e.cost_usd) || 0, Number(e.cost_usd) || 0],
    hours: Array.isArray(e.hours) ? e.hours.map(Number) : [Number(e.hours) || 0, Number(e.hours) || 0],
    difficulty: Math.max(1, Math.min(5, Math.round(+e.difficulty || 1))),
    skills: e.skills || [],
    outputs: e.outputs || [],
    stl: e.stl || [],
  }));
}

async function init() {
  const base = await loadJSON("data/experiments.json");
  const adv = await loadJSON("data/experiments-advanced.json", true);
  LEVELS = (base && base.levels) || [];
  const byId = new Map();
  for (const e of [...normalise(base), ...normalise(adv)]) byId.set(e.id, e);     // later file wins
  EXPS = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
  if (!EXPS.length) {
    $("#grid").innerHTML = '<div class="card"><h3>Could not load the experiment list</h3><p>Serve the site over HTTP (for example <code>python3 -m http.server --directory site</code>) so the page can read <code>data/experiments.json</code>.</p></div>';
    return;
  }
  stats();
  heroArt();
  buildStack();
  buildFilters();
  render();
  setupViewer();
}

/* ---------------------------------------------------------------- hero stats */
function tween(el, to, prefix = "") {
  if (!el) return;
  if (Codex.reducedMotion) { el.textContent = prefix + to; return; }
  const t0 = performance.now(), dur = 1200;
  (function step(now) {
    const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 4);
    el.textContent = prefix + Math.round(to * e);
    if (k < 1) requestAnimationFrame(step);
  })(t0);
}
function stats() {
  const planned = LEVELS.flatMap((l) => l.planned || []).filter((f) => !EXPS.some((e) => e.id === f));
  tween($("#statBuilds"), EXPS.length + planned.length);
  tween($("#statParts"), new Set(EXPS.flatMap((e) => e.stl)).size);
  const cheapest = Math.min(...EXPS.map((e) => e.cost_usd[0]));
  $("#statCheap").textContent = "$" + cheapest;
}


/* ---------------------------------------------------------------- hero blueprint */
// The Level-2 example rocket from experiments/20-first-model-rocket/barrowman.py, drawn to scale (mm):
// von Kármán nose L 145.6 on a BT-60 tube (Ø 41.6), 300 mm body, 3-fin can (root 85.2, tip 37.4,
// span 66.6 from the sleeve, sweep 47.8), 24 mm motor. CP 360.6 mm and CG 297.5 mm from the tip
// (15 g nose ballast) → static margin 1.52 calibers.
function heroArt() {
  const host = document.getElementById("heroArt");
  if (!host) return;
  const L = 145.6, R = 20.8, BODY = 300, TOT = L + BODY, RS = 22.6, CR = 85.2, CT = 37.4, SPAN = 66.6, SW = 47.8;
  const CG = 297.5, CP = 360.6, D = 41.6;
  const vk = (x) => { const th = Math.acos(1 - 2 * x / L); return R / Math.sqrt(Math.PI) * Math.sqrt(Math.max(0, th - Math.sin(2 * th) / 2)); };
  const pts = []; for (let i = 0; i <= 60; i++) { const x = L * Math.pow(i / 60, 1.6); pts.push([vk(x), x]); }
  const noseR = pts.map(([r, y]) => `${r.toFixed(2)},${y.toFixed(2)}`).join(" L");
  const noseL = pts.slice().reverse().map(([r, y]) => `${(-r).toFixed(2)},${y.toFixed(2)}`).join(" L");
  const fcTop = TOT - CR - 4;
  const fin = (s) => `M${s * RS},${TOT - CR} L${s * (RS + SPAN)},${TOT - CR + SW} L${s * (RS + SPAN)},${TOT - CR + SW + CT} L${s * RS},${TOT}`;
  const outline = `M0,0 L${noseR} L${R},${TOT} L${-R},${TOT} L${noseL} Z`;
  const ice = "var(--ice)", fl = "var(--flame)", mu = "var(--muted)";
  const len = (d) => `style="--len:${d}"`;
  let grid = "";
  for (let y = -10; y <= 470; y += 10) grid += `<line x1="-120" x2="150" y1="${y}" y2="${y}" stroke="rgba(124,200,255,${y % 50 === 0 ? 0.09 : 0.04})" stroke-width="0.3"/>`;
  for (let x = -120; x <= 150; x += 10) grid += `<line y1="-10" y2="470" x1="${x}" x2="${x}" stroke="rgba(124,200,255,${x % 50 === 0 ? 0.09 : 0.04})" stroke-width="0.3"/>`;
  const cgSym = `<g transform="translate(0,${CG})"><circle r="6" fill="#0b0f1c" stroke="${"#e9edff"}" stroke-width="0.8"/>
      <path d="M0,-6 A6,6 0 0,1 6,0 L0,0 Z M0,6 A6,6 0 0,1 -6,0 L0,0 Z" fill="#e9edff"/></g>`;
  const cpSym = `<g transform="translate(0,${CP})"><circle r="6" fill="#0b0f1c" stroke="${fl}" stroke-width="0.9"/><circle r="2" fill="${fl}"/></g>`;
  const t = (x, y, s, a = "start", c = mu, sz = 9) => `<text x="${x}" y="${y}" font-size="${sz}" fill="${c}" text-anchor="${a}" font-family="JetBrains Mono, monospace">${s}</text>`;
  host.innerHTML = `
  <svg viewBox="-126 -14 282 488" role="img" aria-label="Blueprint of a BT-60 model rocket with centre of gravity at 297.5 mm and centre of pressure at 360.6 mm from the nose tip">
    <defs>
      <linearGradient id="bpFill" x1="0" x2="1"><stop offset="0" stop-color="rgba(124,200,255,.02)"/><stop offset=".45" stop-color="rgba(124,200,255,.16)"/><stop offset="1" stop-color="rgba(124,200,255,.03)"/></linearGradient>
      <marker id="bpA" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L6,3 L0,6 Z" fill="${mu}"/></marker>
    </defs>
    <g>${grid}</g>
    <line x1="0" x2="0" y1="-8" y2="${TOT + 18}" stroke="${mu}" stroke-width="0.4" stroke-dasharray="6 2 1 2" class="bp-fade" style="animation-delay:.2s"/>
    <path d="${outline}" fill="url(#bpFill)" stroke="${ice}" stroke-width="0.8" class="bp-draw" ${len(1100)}/>
    <line x1="${-R}" x2="${R}" y1="${L}" y2="${L}" stroke="${ice}" stroke-width="0.5" class="bp-fade" style="animation-delay:.9s"/>
    <path d="M${-RS},${fcTop} L${RS},${fcTop} L${RS},${TOT} L${-RS},${TOT} Z" fill="rgba(255,122,61,.10)" stroke="${fl}" stroke-width="0.7" class="bp-draw" style="--len:260;animation-delay:.6s"/>
    <path d="${fin(1)}" fill="rgba(255,122,61,.14)" stroke="${fl}" stroke-width="0.8" class="bp-draw" style="--len:260;animation-delay:.8s"/>
    <path d="${fin(-1)}" fill="rgba(255,122,61,.14)" stroke="${fl}" stroke-width="0.8" class="bp-draw" style="--len:260;animation-delay:.8s"/>
    <path d="M-12,${TOT - 64} L12,${TOT - 64} L12,${TOT + 6} L-12,${TOT + 6} Z" fill="rgba(78,240,184,.10)" stroke="var(--aurora)" stroke-width="0.6" stroke-dasharray="2 1.5" class="bp-fade" style="animation-delay:1.3s"/>
    <g class="bp-fade" style="animation-delay:1.6s">
      <line x1="${RS + SPAN + 14}" x2="${RS + SPAN + 14}" y1="0" y2="${TOT}" stroke="${mu}" stroke-width="0.4" marker-start="url(#bpA)" marker-end="url(#bpA)"/>
      <line x1="${R + 2}" x2="${RS + SPAN + 18}" y1="0" y2="0" stroke="${mu}" stroke-width="0.25"/>
      ${t(RS + SPAN + 18, TOT / 2, "445.6", "start", "#c3cae6", 9)}
      <line x1="${R + 6}" x2="${R + 6}" y1="0" y2="${L}" stroke="${mu}" stroke-width="0.4" marker-start="url(#bpA)" marker-end="url(#bpA)"/>
      ${t(R + 9, L / 2 + 2, "L 145.6", "start", "#c3cae6", 8.4)}
      ${t(R + 9, L / 2 + 12, "von Kármán", "start", mu, 7.4)}
      <line x1="${-R}" x2="${R}" y1="${L + 70}" y2="${L + 70}" stroke="${mu}" stroke-width="0.4" marker-start="url(#bpA)" marker-end="url(#bpA)"/>
      ${t(0, L + 65, "Ø41.6", "middle", "#c3cae6", 8)}
      ${t(-R - 6, L + 100, "BT-60", "end", "#c3cae6", 8.4)}
      ${t(-R - 6, L + 110, "300 mm tube", "end", mu, 7.4)}
      ${t(-R - 8, 61, "nosecone.scad", "end", "var(--ice)", 8.4)}
      <line x1="${-R - 6}" x2="-9" y1="58" y2="58" stroke="var(--ice)" stroke-width="0.35"/>
      ${t(-RS - SPAN, TOT + 14, "fincan.scad", "start", "var(--flame)", 8.4)}
      ${t(14, TOT + 18, "motor_mount.scad · 24 mm", "start", "var(--aurora)", 7.6)}
    </g>
    <g class="bp-fade" style="animation-delay:2s">
      ${cgSym}${cpSym}
      ${t(-10, CG + 3, "CG 297.5", "end", "#e9edff", 8.6)}
      ${t(-27, CP - 3, "CP 360.6", "end", "var(--flame)", 8.6)}
      <path d="M10,${CG} H30 V${CP} H10" fill="none" stroke="${mu}" stroke-width="0.4"/>
      ${t(34, (CG + CP) / 2 - 3, "static margin", "start", mu, 7.4)}
      ${t(34, (CG + CP) / 2 + 8, (((CP - CG) / D)).toFixed(2) + " cal", "start", "#e9edff", 9.6)}
    </g>
  </svg>`;
}

/* ---------------------------------------------------------------- stack */
function levelMeta(n) {
  return LEVELS.find((l) => +l.level === n) || { level: n, name: "Level " + n, stage: "Stage", budget: "", color: "--ice", blurb: "" };
}
function levelColor(n) { return "var(" + levelMeta(n).color + ")"; }

function buildStack() {
  const host = $("#stackViz");
  let html = '<div class="nose" aria-hidden="true"></div><div class="nose-gap"></div>';
  for (let n = 4; n >= 0; n--) {
    const m = levelMeta(n);
    const items = EXPS.filter((e) => e.level === n);
    const ghosts = (m.planned || []).filter((f) => !items.some((e) => e.id === f));
    const chips = items.map((e) => `<span class="chip" data-jump="${esc(e.id)}">${esc(e.id.slice(0, 2))} · ${esc(e.title)}</span>`).join("")
      + ghosts.map((f) => `<span class="chip ghost">${esc(f.slice(0, 2))} · ${esc(prettyFolder(f))}</span>`).join("");
    html += `
      <div class="xp-stage-seg ${n === 0 ? "pad" : ""}" data-level="${n}" style="--c:${levelColor(n)}" aria-hidden="true">
        <div class="body" data-level="L${n}"></div>${n === 0 ? '<div class="fins"></div>' : ""}
      </div>
      <button type="button" class="xp-stage-info" data-level="${n}" style="--c:${levelColor(n)}"
        aria-label="Show level ${n} builds: ${esc(m.name)}">
        <div><div class="tag">${esc(m.stage)} · Level ${n}</div><h3>${esc(m.name)}</h3></div>
        <div class="budget"><b>${esc(m.budget)}</b><span>${items.length + ghosts.length} builds</span></div>
        <p>${esc(m.blurb)}</p>
        <div class="builds">${chips}</div>
      </button>`;
  }
  html += `<div class="xp-engine" aria-hidden="true"><div class="glow"></div><div class="bell"></div><div class="plume"></div><div class="padline"></div></div>
           <div class="xp-engine-note mono muted">▲ Launch pad — start with Level 0: no tools, under $10.</div>`;
  host.innerHTML = html;

  host.querySelectorAll(".xp-stage-info").forEach((b) => {
    const n = b.dataset.level;
    const seg = host.querySelector(`.xp-stage-seg[data-level="${n}"]`);
    const on = () => { host.classList.add("hover-any"); seg.classList.add("hot"); b.classList.add("hot"); };
    const off = () => { host.classList.remove("hover-any"); seg.classList.remove("hot"); b.classList.remove("hot"); };
    b.addEventListener("pointerenter", on); b.addEventListener("pointerleave", off);
    b.addEventListener("focus", on); b.addEventListener("blur", off);
    b.addEventListener("click", (ev) => {
      const jump = ev.target.closest("[data-jump]");
      setLevel(n);
      document.getElementById("builds").scrollIntoView({ behavior: Codex.reducedMotion ? "auto" : "smooth" });
      if (jump) setTimeout(() => flash(jump.dataset.jump), 500);
    });
  });
}

function prettyFolder(f) {
  return f.replace(/^\d+-/, "").split("-").map((w) => (w.length <= 3 && w !== "the" ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ").replace("Lora", "LoRa").replace("Openrocket", "OpenRocket").replace("Pcb", "PCB").replace("Cubesat", "CubeSat");
}

/* ---------------------------------------------------------------- filters */
function buildFilters() {
  const present = new Set(EXPS.flatMap((e) => e.outputs));
  const outs = OUTPUT_ORDER.filter((o) => present.has(o)).concat([...present].filter((o) => !OUTPUT_ORDER.includes(o)));
  $("#fOutputs").innerHTML = outs.map((o) => `<button type="button" data-o="${esc(o)}" aria-pressed="false">${esc(o)}</button>`).join("");
  $("#fOutputs").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const o = b.dataset.o, on = b.getAttribute("aria-pressed") !== "true";
    b.setAttribute("aria-pressed", on); on ? state.outputs.add(o) : state.outputs.delete(o);
    render();
  });
  $("#fLevel").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setLevel(b.dataset.level); });
  const slider = $("#fBudget");
  const paintBudget = () => {
    state.budget = +slider.value;
    const v = BUDGET_STEPS[state.budget];
    $("#fBudgetOut").textContent = v === Infinity ? "any" : "$" + v;
  };
  slider.addEventListener("input", () => { paintBudget(); render(); });
  paintBudget();
  let t;
  $("#fSearch").addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value.trim().toLowerCase(); render(); }, 120); });
  $("#fSort").addEventListener("change", (e) => { state.sort = e.target.value; render(); });
}

function setLevel(n) {
  state.level = String(n);
  document.querySelectorAll("#fLevel button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.level === state.level));
  render();
}

function matches(e) {
  if (state.level !== "all" && e.level !== +state.level) return false;
  if (state.outputs.size && ![...state.outputs].every((o) => e.outputs.includes(o))) return false;
  if (e.cost_usd[0] > BUDGET_STEPS[state.budget]) return false;
  if (state.q) {
    const hay = [e.title, e.summary, e.id, ...(e.skills || []), ...(e.outputs || []), ...(e.tags || [])].join(" ").toLowerCase();
    if (!state.q.split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  return true;
}

/* ---------------------------------------------------------------- cards */
const logPos = (v, lo, hi) => Math.max(0, Math.min(1, (Math.log(Math.max(v, lo)) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))));
function rangeBar(a, b, lo, hi) {
  const x0 = logPos(a, lo, hi), x1 = Math.max(logPos(b, lo, hi), x0 + 0.03);
  return `<div class="xp-bar"><span style="left:${(x0 * 100).toFixed(1)}%;width:${((x1 - x0) * 100).toFixed(1)}%"></span></div>`;
}
const money = ([a, b]) => (a === b ? "$" + a : "$" + a + "–" + b);
const hrs = ([a, b]) => { const f = (v) => (v >= 24 ? Math.round(v / 24) + " d" : v + " h"); return a === b ? f(a) : a >= 24 ? f(a) + "–" + f(b) : a + "–" + f(b); };
const WARN = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M12 2 1.8 20.5h20.4Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 9v5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17.3" r="1.3" fill="currentColor"/></svg>';

function card(e, i) {
  const pips = Array.from({ length: 5 }, (_, k) => `<i class="${k < e.difficulty ? "on" : ""}"></i>`).join("");
  const stlBtn = e.stl.length ? `<button type="button" class="btn small" data-view="${esc(e.stl[0])}">View 3D · ${e.stl.length}</button>` : "";
  return `
  <article class="card spot xp-card" id="x-${esc(e.id)}" style="--c:${levelColor(e.level)};animation-delay:${Math.min(i, 12) * 45}ms">
    <div class="num" aria-hidden="true">${esc(e.id.slice(0, 2))}</div>
    <div class="lvl"><i></i>Level ${e.level} · ${esc(levelMeta(e.level).name)}</div>
    <h3>${esc(e.title)}</h3>
    <p class="sum">${esc(e.summary)}</p>
    <div class="xp-meters">
      <div class="xp-meter"><span>Cost</span>${rangeBar(e.cost_usd[0] || 1, e.cost_usd[1] || 1, 1, 1000)}<span class="val">${money(e.cost_usd)}</span></div>
      <div class="xp-meter"><span>Time</span>${rangeBar(e.hours[0] || 0.5, e.hours[1] || 0.5, 0.5, 200)}<span class="val">${hrs(e.hours)}</span></div>
      <div class="xp-meter"><span>Difficulty</span><div class="xp-pips" role="img" aria-label="difficulty ${e.difficulty} of 5">${pips}</div><span class="val">${e.difficulty} / 5</span></div>
    </div>
    <div class="xp-chips">${e.skills.slice(0, 5).map((s) => `<span class="chip">${esc(s)}</span>`).join("")}</div>
    <div class="xp-chips">${e.outputs.map((o) => `<span class="xp-out" data-o="${esc(o)}">${esc(o)}</span>`).join("")}</div>
    ${e.safety ? `<p class="xp-warn">${WARN}<span>${esc(e.safety)}</span></p>` : ""}
    <div class="foot">
      <a class="btn small" href="${REPO_TREE}${encodeURIComponent(e.folder)}" rel="noopener">Tutorial on GitHub ↗</a>
      ${stlBtn}
    </div>
  </article>`;
}

function plannedCard(folder, level, i) {
  return `
  <article class="card xp-card planned" style="--c:${levelColor(level)};animation-delay:${Math.min(i, 12) * 45}ms">
    <div class="num" aria-hidden="true">${esc(folder.slice(0, 2))}</div>
    <div class="lvl"><i></i>Level ${level} · ${esc(levelMeta(level).name)}</div>
    <h3>${esc(prettyFolder(folder))}</h3>
    <p class="sum">In preparation — the tutorial folder is being written. Follow along on GitHub.</p>
    <div class="foot"><a class="btn small" href="${REPO_TREE}${encodeURIComponent(folder)}" rel="noopener">Folder on GitHub ↗</a></div>
  </article>`;
}

function render() {
  let list = EXPS.filter(matches);
  const key = { cost: (e) => e.cost_usd[0] + e.cost_usd[1] / 1000, time: (e) => e.hours[0], difficulty: (e) => e.difficulty * 100 + e.level }[state.sort];
  if (key) list = [...list].sort((a, b) => key(a) - key(b) || a.id.localeCompare(b.id));
  // planned (not yet published) folders show only when no content filter is active
  const plain = !state.outputs.size && !state.q && state.budget === BUDGET_STEPS.length - 1;
  const planned = plain ? LEVELS.flatMap((l) => (l.planned || []).map((f) => ({ f, level: +l.level })))
    .filter((p) => !EXPS.some((e) => e.id === p.f) && (state.level === "all" || +state.level === p.level)) : [];
  const grid = $("#grid");
  grid.innerHTML = list.map(card).join("") + planned.map((p, i) => plannedCard(p.f, p.level, list.length + i)).join("");
  $("#emptyMsg").hidden = list.length + planned.length > 0;
  $("#resultCount").textContent = `${list.length} build${list.length === 1 ? "" : "s"}` + (planned.length ? ` + ${planned.length} in preparation` : "");
  grid.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => {
    viewer.select(b.dataset.view);
    document.getElementById("viewer").scrollIntoView({ behavior: Codex.reducedMotion ? "auto" : "smooth" });
  }));
}

function flash(id) {
  const el = document.getElementById("x-" + id);
  if (!el) return;
  el.scrollIntoView({ behavior: Codex.reducedMotion ? "auto" : "smooth", block: "center" });
  el.animate([{ boxShadow: "0 0 0 0 transparent" }, { boxShadow: "0 0 0 2px " + cssVar("--ice") + ", 0 0 40px -6px " + cssVar("--ice") }, { boxShadow: "0 0 0 0 transparent" }], { duration: 1600 });
}

/* ---------------------------------------------------------------- STL viewer */
const viewer = {
  ready: false, pending: null, select(url) { this.pending = url; if (this.ready) this._select(url); else this.boot(); },
  boot() {},
};

function setupViewer() {
  const models = [];
  for (const e of EXPS) for (const url of e.stl) models.push({ url, exp: e, name: url.split("/").pop() });
  const list = $("#modelList");
  if (!models.length) { list.innerHTML = '<p class="muted">No printable parts published yet.</p>'; $("#stlLoading").textContent = "No models"; return; }
  list.innerHTML = models.map((m, i) => `
    <button type="button" role="option" aria-selected="${i === 0}" data-url="${esc(m.url)}" style="--c:${levelColor(m.exp.level)}">
      <i></i><span>${esc(m.name.replace(/\.stl$/i, "").replace(/_/g, " "))}</span><small>${esc(m.exp.id.slice(0, 2))} · ${esc(m.exp.title)}</small>
    </button>`).join("");
  list.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) viewer.select(b.dataset.url); });

  const stageEl = $("#stlStage");
  let booted = false;
  viewer.boot = () => {
    if (booted) return; booted = true;
    if (!Codex.webgl()) {
      $("#stlLoading").innerHTML = "WebGL is switched off, so the 3D viewer can't run.<br>Download the STL files from GitHub instead.";
      return;
    }
    startViewer(stageEl, models);
  };
  // start when the viewer scrolls near the screen (keeps the first paint light)
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((ents) => { if (ents.some((en) => en.isIntersecting)) { io.disconnect(); viewer.boot(); } }, { rootMargin: "300px" });
    io.observe(stageEl);
  } else viewer.boot();
}

function startViewer(host, models) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("aria-label", "Interactive 3D view of the selected printable part. Drag to orbit, scroll to zoom.");
  renderer.domElement.setAttribute("role", "img");

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;                                 // keep saturated part colours from washing out
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 5000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotate = !Codex.reducedMotion;
  controls.autoRotateSpeed = 1.2;
  $("#tRotate").checked = controls.autoRotate;

  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3, 5, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0x7cc8ff, 1.1); rim.position.set(-4, 2, -5); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x10131f, 0.2));

  // floor: polar grid + a soft contact shadow
  const floor = new THREE.Group(); scene.add(floor);
  const grid = new THREE.PolarGridHelper(1, 12, 6, 64, 0x2a3558, 0x1a2140);
  grid.material.transparent = true; grid.material.opacity = 0.6; floor.add(grid);
  const sh = document.createElement("canvas"); sh.width = sh.height = 128;
  const g = sh.getContext("2d"); const rg = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  rg.addColorStop(0, "rgba(0,0,0,0.55)"); rg.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sh), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.001; floor.add(shadow);

  const material = new THREE.MeshStandardMaterial({ color: 0x7cc8ff, roughness: 0.5, metalness: 0.0 });
  let mesh = null, home = null, current = null;
  const loader = new STLLoader();
  const cache = new Map();

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1); camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host); resize();

  function measure(geom) {
    // bounding box in the file's own axes (mm), and volume from signed tetrahedra
    geom.computeBoundingBox();
    const s = new THREE.Vector3(); geom.boundingBox.getSize(s);
    const p = geom.attributes.position.array; let v = 0;
    for (let i = 0; i < p.length; i += 9) {
      v += (p[i] * (p[i + 4] * p[i + 8] - p[i + 5] * p[i + 7]) - p[i + 1] * (p[i + 3] * p[i + 8] - p[i + 5] * p[i + 6]) + p[i + 2] * (p[i + 3] * p[i + 7] - p[i + 4] * p[i + 6])) / 6;
    }
    return { size: s, volume: Math.abs(v) / 1000, tris: p.length / 9 };           // cm³
  }

  function show(url, geom, meta) {
    if (mesh) scene.remove(mesh);
    const info = measure(geom);
    const m = meta.exp;
    material.color.set(cssVar(levelMeta(m.level).color));
    mesh = new THREE.Mesh(geom, material);
    mesh.rotation.x = -Math.PI / 2;                                    // STL Z-up → three.js Y-up
    scene.add(mesh);
    mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    const c = box.getCenter(new THREE.Vector3());
    mesh.position.set(-c.x, -box.min.y, -c.z);                         // stand it on the floor, centred
    const size = box.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.y, size.z) * 0.62;
    const fr = Math.max(size.x, size.z) * 0.9 + 10;
    floor.scale.setScalar(fr); shadow.scale.setScalar(1.3);
    const dist = r / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.55;
    home = { target: new THREE.Vector3(0, size.y * 0.45, 0), pos: new THREE.Vector3(dist * 0.62, size.y * 0.45 + dist * 0.42, dist * 0.68) };
    camera.near = dist / 200; camera.far = dist * 20; camera.updateProjectionMatrix();
    controls.minDistance = r * 0.6; controls.maxDistance = dist * 4;
    resetView();

    $("#stlTitle").textContent = meta.name.replace(/\.stl$/i, "").replace(/_/g, " ");
    $("#stlSub").textContent = `${m.id} · ${m.title}`;
    $("#rX").innerHTML = info.size.x.toFixed(1) + "<small>mm</small>";
    $("#rY").innerHTML = info.size.y.toFixed(1) + "<small>mm</small>";
    $("#rZ").innerHTML = info.size.z.toFixed(1) + "<small>mm</small>";
    $("#rTris").textContent = info.tris.toLocaleString("en-US");
    $("#rVol").innerHTML = info.volume.toFixed(1) + "<small>cm³</small>";
    $("#rMass").innerHTML = (info.volume * 1.27).toFixed(0) + "<small>g</small>";     // PETG density 1.27 g/cm³
    const dl = $("#bDownload"); dl.href = url; dl.setAttribute("download", meta.name);
    document.querySelectorAll("#modelList button").forEach((b) => b.setAttribute("aria-selected", b.dataset.url === url));
    $("#stlLoading").classList.add("done");
  }

  function resetView() {
    if (!home) return;
    camera.position.copy(home.pos); controls.target.copy(home.target); controls.update();
  }

  viewer._select = (url) => {
    const meta = models.find((m) => m.url === url) || models[0];
    current = meta.url;
    if (cache.has(meta.url)) { show(meta.url, cache.get(meta.url), meta); return; }
    const ld = $("#stlLoading"); ld.textContent = "Loading " + meta.name + "…"; ld.classList.remove("done");
    loader.load(meta.url, (geom) => {
      geom.computeVertexNormals();
      cache.set(meta.url, geom);
      if (current === meta.url) show(meta.url, geom, meta);
    }, undefined, () => { ld.textContent = "Could not load " + meta.name; });
  };
  viewer.ready = true;
  viewer._select(viewer.pending || models[0].url);

  $("#tRotate").addEventListener("change", (e) => { controls.autoRotate = e.target.checked; });
  $("#tWire").addEventListener("change", (e) => { material.wireframe = e.target.checked; });
  $("#bReset").addEventListener("click", resetView);

  // render loop: pause when the tab is hidden or the viewer is off-screen
  let visible = true, raf = 0;
  const io = new IntersectionObserver((ents) => { visible = ents[0].isIntersecting; if (visible) loop(); }, { rootMargin: "100px" });
  io.observe(host);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) loop(); });
  function loop() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(function frame() {
      if (!visible || document.hidden) return;
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    });
  }
  loop();
}

init();
