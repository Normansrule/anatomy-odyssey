/* Mission Library page (library.html)
 * Renders the guided reading path, the filterable/searchable library grid,
 * the systems-engineering corner diagrams and the "Watch" section from
 * data/library.json. Definitions in the systems-engineering corner follow the
 * NASA Systems Engineering Handbook (NASA/SP-2016-6105 Rev 2) and NASA's
 * Technology Readiness Level definitions (NTRS 20120002572).
 */

const $ = (s, r = document) => r.querySelector(s);
const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
if (gsap && ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
if (gsap && window.DrawSVGPlugin) gsap.registerPlugin(window.DrawSVGPlugin);
const reduce = (window.Codex && window.Codex.reducedMotion) || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
const animate = !!gsap && !reduce;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const LEVELS = ["beginner", "intermediate", "expert"];
const LEVEL_NAME = { beginner: "Beginner", intermediate: "Intermediate", expert: "Expert" };
const ORGS = ["NASA", "JPL", "SpaceX", "ESA", "STScI", "MIT", "Industry", "Other agencies", "Community", "Publishers"];
const ORG_TITLE = {
  NASA: "National Aeronautics and Space Administration", JPL: "Jet Propulsion Laboratory", ESA: "European Space Agency",
  STScI: "Space Telescope Science Institute", MIT: "MIT OpenCourseWare", Industry: "Launch providers",
  "Other agencies": "JAXA, FAA, ECSS", Community: "Community projects and societies", Publishers: "Textbooks"
};
const TYPES = {
  handbook: ["Handbook", '<path d="M2 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H2zM22 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z"/>'],
  "user-guide": ["User guide", '<path d="M6 2h9l5 5v15H6zM15 2v5h5M9 13h8M9 17h5"/>'],
  report: ["Report", '<path d="M5 2h14v20H5zM9 17v-3M12 17v-7M15 17v-5"/>'],
  "press-kit": ["Press kit", '<path d="M3 5h13v14a2 2 0 0 0 2 2H5a2 2 0 0 1-2-2zM16 9h4v10a2 2 0 0 1-4 0M7 9h5M7 13h5M7 17h3"/>'],
  journal: ["Journal", '<path d="M6 2h13v20H6zM6 6H3.5M6 10H3.5M6 14H3.5M6 18H3.5M10 7h6M10 11h6"/>'],
  standard: ["Standard", '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5zM8.5 12l2.5 2.5 4.5-5"/>'],
  course: ["Course", '<path d="M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5M22 9v6"/>'],
  book: ["Book", '<path d="M5 3h13a1 1 0 0 1 1 1v17H7a2 2 0 0 1-2-2zM5 19a2 2 0 0 1 2-2h12"/>'],
  data: ["Data", '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>'],
  software: ["Software", '<path d="M8 4C5 4 5 6 5 8s-1 4-3 4c2 0 3 2 3 4s0 4 3 4M16 4c3 0 3 2 3 4s1 4 3 4c-2 0-3 2-3 4s0 4-3 4"/>']
};
const typeIcon = (t) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${TYPES[t][1]}</svg>`;
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const PAGE = 24;

/* ---------------- systems-engineering content (NASA SP-2016-6105 Rev 2) ---------------- */
const VNODES = [
  { x: 180, y: 40, side: "l", t: "Stakeholder expectations", d: "Identify who the mission serves, what they need and how the system will be operated: the Concept of Operations (ConOps). Every later decision traces back to this." },
  { x: 215, y: 110, side: "l", t: "System requirements", d: "Turn expectations into verifiable 'shall' statements for the whole system: performance, interfaces, environments and constraints." },
  { x: 250, y: 180, side: "l", t: "Subsystem design", d: "Logical decomposition: allocate requirements to subsystems such as power, thermal, propulsion and avionics, and define the interfaces between them." },
  { x: 285, y: 250, side: "l", t: "Component design", d: "Detailed design of the boards, brackets, tanks and software units that will be built, bought or reused." },
  { x: 320, y: 320, side: "b", t: "Build & code", d: "Product implementation: fabricate the hardware, write the software, or buy and qualify existing items. The bottom of the V." },
  { x: 355, y: 250, side: "r", t: "Component test", d: "Verify each unit against its own specification before it is integrated: bench tests, unit tests, inspections." },
  { x: 390, y: 180, side: "r", t: "Subsystem integration", d: "Assemble components into subsystems and verify them against subsystem requirements, including interface tests." },
  { x: 425, y: 110, side: "r", t: "System verification", d: "Prove the integrated system meets its requirements by test, analysis, inspection or demonstration. The question is: did we build it right?" },
  { x: 460, y: 40, side: "r", t: "Validation", d: "Show the finished system meets the stakeholders' expectations in its intended environment. The question is: did we build the right thing?" }
];
const PHASES = [
  { p: "Pre-A", n: "Concept studies", r: "MCR", impl: false, d: "Explore a wide range of mission ideas and pick feasible concepts. Ends with the Mission Concept Review (MCR) and Key Decision Point A (KDP A)." },
  { p: "A", n: "Concept & tech", r: "SRR · MDR", impl: false, d: "Concept and technology development: set top-level requirements and mature key technologies. Reviews: System Requirements Review (SRR) and Mission Definition Review (MDR)." },
  { p: "B", n: "Prelim. design", r: "PDR", impl: false, d: "Preliminary design and technology completion. The Preliminary Design Review (PDR) and KDP C commit the agency to a cost and schedule baseline." },
  { p: "C", n: "Design & build", r: "CDR · SIR", impl: true, d: "Final design and fabrication. The Critical Design Review (CDR) freezes the design; the System Integration Review (SIR) confirms readiness to integrate." },
  { p: "D", n: "Test & launch", r: "ORR · FRR", impl: true, d: "System assembly, integration, test, launch and checkout. The Operational Readiness Review (ORR) and Flight Readiness Review (FRR) clear the way to fly." },
  { p: "E", n: "Operations", r: "DR", impl: true, d: "Operations and sustainment: fly the mission and collect the data. Ends with the Decommissioning Review (DR)." },
  { p: "F", n: "Closeout", r: "DRR", impl: true, d: "Closeout: dispose of the spacecraft safely (after a Disposal Readiness Review, DRR), archive data and capture lessons learned." }
];
const TRLS = [
  "Basic principles observed and reported.",
  "Technology concept and/or application formulated.",
  "Analytical and experimental critical function and/or characteristic proof of concept.",
  "Component and/or breadboard validation in a laboratory environment.",
  "Component and/or breadboard validation in a relevant environment.",
  "System or subsystem model or prototype demonstrated in a relevant environment.",
  "System prototype demonstrated in an operational (space) environment.",
  "Actual system completed and 'flight qualified' through test and demonstration.",
  "Actual system 'flight proven' through successful mission operations."
];

/* ---------------- state ---------------- */
const state = { q: "", level: new Set(), type: new Set(), org: new Set(), sort: "curated", all: false, view: "cards" };
let DATA = null, ENTRIES = [];

init();

async function init() {
  buildSE();
  try {
    const res = await fetch("data/library.json");
    if (!res.ok) throw new Error(res.status);
    DATA = await res.json();
  } catch (e) {
    $("#grid").innerHTML = '<div class="card"><h3>Library data did not load</h3><p>Serve the site over HTTP (for example <code>python3 -m http.server --directory site</code>) so the page can read <code>data/library.json</code>.</p></div>';
    return;
  }
  ENTRIES = DATA.entries.map((e, i) => ({ ...e, i, hay: [e.title, e.source, e.org, e.description, TYPES[e.type][0], e.tags.join(" "), e.year || ""].join(" ").toLowerCase() }));
  const setNum = (id, n) => { const el = $(id); if (el) { el.dataset.count = n; el.textContent = n; } };
  setNum("#statDocs", ENTRIES.length); setNum("#statChannels", DATA.channels.length); setNum("#statVideos", DATA.videos.length);
  $("#countTotal").textContent = ENTRIES.length;

  readURL();
  buildPath();
  buildChips();
  bindFilters();
  bindView();
  bindPeek();
  render(false);
  buildWatch();
  pathLines();
  observeReveal(document.querySelectorAll("#pathCols .reveal, #channels .reveal, #videos .reveal"));
}

/* codex.js observes .reveal elements that exist at DOMContentLoaded; these are added later */
function observeReveal(nodes) {
  if (!("IntersectionObserver" in window)) { nodes.forEach((n) => n.classList.add("in")); return; }
  const io = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }), { rootMargin: "0px 0px -8% 0px" });
  nodes.forEach((n) => { if (n.dataset.delay) n.style.transitionDelay = n.dataset.delay + "ms"; io.observe(n); });
}

/* ---------------- reading path ---------------- */
function buildPath() {
  const byId = Object.fromEntries(ENTRIES.map((e) => [e.id, e]));
  const alt = { beginner: "ALT 0 KM", intermediate: "ALT 400 KM", expert: "ALT 1 AU+" };
  $("#pathCols").innerHTML = LEVELS.map((lv, k) => {
    const p = DATA.path[lv];
    const steps = p.steps.map((s, n) => {
      const e = byId[s.id];
      return `<li><span class="n">${n + 1}</span><div><a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer" data-i="${e.i}">${esc(e.title)}</a>
        <span class="why">${esc(s.why)}</span><span class="meta">${esc(e.source)} · ${TYPES[e.type][0]}</span></div></li>`;
    }).join("");
    return `<article class="card spot path-col reveal" data-level="${lv}" data-delay="${k * 120}">
      <div class="pc-top"><span class="fchip" data-level-chip="${lv}" style="cursor:default"><span class="dot"></span>${LEVEL_NAME[lv]}</span><span class="pc-alt">${alt[lv]}</span></div>
      <h3>${esc(p.title)}</h3><p>${esc(p.blurb)}</p><ol class="steps">${steps}</ol></article>`;
  }).join("");
}

/* ---------------- filters ---------------- */
function buildChips() {
  const mk = (group, val, label, attr, title) =>
    `<button type="button" class="fchip" data-group="${group}" data-val="${esc(val)}" ${attr} aria-pressed="false"${title ? ` title="${esc(title)}"` : ""}><span class="dot"></span>${esc(label)} <span class="n"></span></button>`;
  $("#fLevel").innerHTML = LEVELS.map((l) => mk("level", l, LEVEL_NAME[l], `data-level-chip="${l}"`)).join("");
  const types = Object.keys(TYPES).filter((t) => ENTRIES.some((e) => e.type === t));
  $("#fType").innerHTML = types.map((t) => mk("type", t, TYPES[t][0], 'style="--c:var(--text-2)"')).join("");
  const orgs = ORGS.filter((o) => ENTRIES.some((e) => e.org === o));
  $("#fOrg").innerHTML = orgs.map((o) => mk("org", o, o, `data-org="${esc(o)}"`, ORG_TITLE[o])).join("");
}

function bindFilters() {
  $("#filters").addEventListener("click", (ev) => {
    const b = ev.target.closest(".fchip");
    if (!b || b.disabled) return;
    const set = state[b.dataset.group];
    set.has(b.dataset.val) ? set.delete(b.dataset.val) : set.add(b.dataset.val);
    render(true);
  });
  let t = 0;
  $("#q").addEventListener("input", (ev) => { clearTimeout(t); t = setTimeout(() => { state.q = ev.target.value.trim(); render(true); }, 90); });
  $("#sort").addEventListener("change", (ev) => { state.sort = ev.target.value; render(true); });
  const reset = () => { state.q = ""; $("#q").value = ""; state.level.clear(); state.type.clear(); state.org.clear(); state.all = false; render(true); };
  $("#reset").addEventListener("click", reset);
  $("#reset2").addEventListener("click", reset);
  $("#more").addEventListener("click", () => { state.all = true; render(false); });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "/" && !/input|textarea|select/i.test(document.activeElement.tagName)) {
      ev.preventDefault();
      $("#q").focus({ preventScroll: true });
      const top = $("#library").getBoundingClientRect().top + scrollY - 70;
      if (Math.abs(scrollY - top) > 400) scrollTo({ top, behavior: "smooth" });
    }
    if (ev.key === "Escape" && document.activeElement === $("#q")) $("#q").blur();
  });
}

function matches(e, skip) {
  if (state.q) {
    const words = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.every((w) => e.hay.includes(w))) return false;
  }
  if (skip !== "level" && state.level.size && !state.level.has(e.level)) return false;
  if (skip !== "type" && state.type.size && !state.type.has(e.type)) return false;
  if (skip !== "org" && state.org.size && !state.org.has(e.org)) return false;
  return true;
}

function sorted(list) {
  const s = state.sort, L = list.slice();
  if (s === "level") L.sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || a.i - b.i);
  else if (s === "newest") L.sort((a, b) => (b.year || -1) - (a.year || -1) || a.i - b.i);
  else if (s === "oldest") L.sort((a, b) => (a.year || 9999) - (b.year || 9999) || a.i - b.i);
  else if (s === "az") L.sort((a, b) => a.title.localeCompare(b.title));
  return L;
}

function hi(text) {
  const t = esc(text);
  if (!state.q) return t;
  const words = state.q.split(/\s+/).filter((w) => w.length > 1).map((w) => esc(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return t;
  return t.replace(new RegExp(`(${words.join("|")})`, "gi"), "<mark>$1</mark>");
}

function card(e, k) {
  const lv = LEVELS.indexOf(e.level) + 1;
  const bars = [1, 2, 3].map((n) => `<i class="${n <= lv ? "on" : ""}"></i>`).join("");
  return `<a class="card spot lib-card enter" style="animation-delay:${Math.min(k, 12) * 28}ms" href="${esc(e.url)}" target="_blank" rel="noopener noreferrer" data-org="${esc(e.org)}">
    <div class="lc-top"><span class="chip org-chip">${esc(e.org === "MIT" ? "MIT OCW" : e.org)}</span><span class="lc-type">${typeIcon(e.type)}${TYPES[e.type][0]}</span></div>
    <h3>${hi(e.title)}</h3>
    <div class="lc-src">${hi(e.source)}</div>
    <p>${hi(e.description)}</p>
    <div class="lc-tags">${e.tags.slice(0, 4).map((t) => "#" + esc(t.replace(/\s+/g, "-"))).join(" ")}</div>
    <div class="lc-foot"><span class="lvl ${e.level}" title="${LEVEL_NAME[e.level]}">${bars}<b>${LEVEL_NAME[e.level]}</b></span>
      <span>${e.year || "living"}</span><span class="lc-host">${esc(host(e.url))} ↗</span></div></a>`;
}

function render(fromUser) {
  const list = sorted(ENTRIES.filter((e) => matches(e)));
  const filtered = state.q || state.level.size || state.type.size || state.org.size;
  const shelf = state.view === "shelf";
  const limit = state.all || filtered || shelf ? list.length : PAGE;
  $("#grid").hidden = shelf;
  $("#shelves").hidden = !shelf;
  if (shelf) { $("#grid").innerHTML = ""; renderShelves(list); }
  else { $("#shelves").innerHTML = ""; $("#grid").innerHTML = list.slice(0, limit).map(card).join(""); }
  $("#empty").hidden = list.length > 0;
  const more = $("#more");
  more.hidden = list.length <= limit;
  more.textContent = `Show all ${list.length}`;

  const cs = $("#countShown");
  if (cs.textContent !== String(list.length)) {
    cs.textContent = list.length;
    const b = cs.parentElement; b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump");
  }
  // faceted counts: how many results each chip would give with the other groups' filters applied
  document.querySelectorAll(".fchip[data-group]").forEach((b) => {
    const g = b.dataset.group, v = b.dataset.val, pressed = state[g].has(v);
    const n = ENTRIES.filter((e) => matches(e, g) && e[g] === v).length;
    b.querySelector(".n").textContent = n;
    b.setAttribute("aria-pressed", pressed ? "true" : "false");
    b.disabled = !pressed && n === 0;
  });
  if (fromUser) writeURL();
}

function readURL() {
  const p = new URLSearchParams(location.search);
  state.q = p.get("q") || ""; $("#q").value = state.q;
  ["level", "type", "org"].forEach((g) => (p.get(g) || "").split(",").filter(Boolean).forEach((v) => state[g].add(v)));
  if (p.get("sort")) { state.sort = p.get("sort"); $("#sort").value = state.sort; }
  let v = p.get("view");
  if (!v) { try { v = localStorage.getItem("cl-library-view"); } catch (e) { v = null; } }
  if (v === "shelf" || v === "cards") state.view = v;
}
function writeURL() {
  const p = new URLSearchParams();
  if (state.q) p.set("q", state.q);
  ["level", "type", "org"].forEach((g) => state[g].size && p.set(g, [...state[g]].join(",")));
  if (state.sort !== "curated") p.set("sort", state.sort);
  if (state.view === "shelf") p.set("view", "shelf");
  const s = p.toString();
  history.replaceState(null, "", location.pathname + (s ? "?" + s : "") + location.hash);
}

/* ---------------- bookshelf view ----------------
 * The same filtered list, drawn as spines on one shelf per organisation. A spine's height
 * says what kind of thing it is (tall handbooks and books, short data sets and software
 * boxes), its colour who published it, and the pips at its foot how much background it
 * expects. Selecting a spine pulls it off the shelf and opens its card underneath.
 */
const SPINE_H = { handbook: 196, book: 204, journal: 184, "user-guide": 178, report: 170, standard: 164, course: 168, "press-kit": 152, data: 138, software: 128 };
const LVL_N = { beginner: 1, intermediate: 2, expert: 3 };
let openSpine = null;

function bindView() {
  const seg = $("#viewSeg");
  const sync = () => seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === state.view)));
  sync();
  seg.addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-view]");
    if (!b || b.dataset.view === state.view) return;
    state.view = b.dataset.view;
    try { localStorage.setItem("cl-library-view", state.view); } catch (e) { /* private mode */ }
    sync();
    closeSpine(true);
    const out = state.view === "shelf" ? $("#grid") : $("#shelves");
    const go = () => { render(true); if (animate) gsap.fromTo(state.view === "shelf" ? "#shelves" : "#grid", { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: "power2.out", clearProps: "all" }); };
    if (animate && !out.hidden) gsap.to(out, { autoAlpha: 0, y: -8, duration: 0.2, onComplete: () => { gsap.set(out, { clearProps: "all" }); go(); } });
    else go();
  });
}

function renderShelves(list) {
  const host = $("#shelves");
  openSpine = null;
  const groups = ORGS.map((o) => ({ o, items: list.filter((e) => e.org === o) })).filter((g) => g.items.length);
  host.innerHTML = groups.map((g, gi) => `
    <section class="shelf" data-org="${esc(g.o)}" aria-label="${esc(ORG_TITLE[g.o] || g.o)}">
      <header class="shelf-h"><span class="shelf-name">${esc(g.o === "MIT" ? "MIT OCW" : g.o)}</span>
        <span class="shelf-full">${esc(ORG_TITLE[g.o] || "")}</span><span class="shelf-n">${g.items.length}</span></header>
      <div class="shelf-row" role="list">${g.items.map((e) => spineHTML(e)).join("")}</div>
      <div class="shelf-open" id="open-${gi}" hidden></div>
    </section>`).join("");
  host.querySelectorAll(".spine").forEach((b) => b.addEventListener("click", () => toggleSpine(b)));
  if (animate) {
    const spines = [...host.querySelectorAll(".spine")];
    gsap.from(spines.slice(0, 90), { y: 36, autoAlpha: 0, duration: 0.55, ease: "power3.out", stagger: { each: 0.008 }, clearProps: "transform,opacity,visibility" });
  }
}

function spineHTML(e) {
  const h = SPINE_H[e.type] || 170;
  const w = Math.round(Math.max(30, Math.min(50, 24 + e.title.length * 0.32)));
  const pips = [1, 2, 3].map((n) => `<i class="${n <= LVL_N[e.level] ? "on" : ""}"></i>`).join("");
  const short = e.title.replace(/\s*\(.*?\)\s*/g, " ").trim();
  // A slight lean on a few spines keeps the shelf from looking machine-stacked.
  const lean = (e.i * 37) % 11 === 0 ? -2.5 : 0;
  return `<div class="sp-slot" role="listitem"><button type="button" class="spine ${e.type === "data" || e.type === "software" ? "box" : ""}" data-i="${e.i}" data-org="${esc(e.org)}"
      style="--h:${h}px;--w:${w}px;--lean:${lean}deg" aria-expanded="false"
      aria-label="${esc(e.title)} (${TYPES[e.type][0]}, ${LEVEL_NAME[e.level]}${e.year ? ", " + e.year : ""}). Pull it out">
      <span class="sp-ico">${typeIcon(e.type)}</span><span class="sp-title">${esc(short)}</span>
      <span class="sp-lvl lvl ${e.level}" aria-hidden="true">${pips}</span></button></div>`;
}

function toggleSpine(b) {
  if (openSpine === b) { closeSpine(); return; }
  closeSpine(true);
  const e = ENTRIES[+b.dataset.i];
  const shelf = b.closest(".shelf");
  const panel = shelf.querySelector(".shelf-open");
  openSpine = b;
  b.classList.add("out");
  b.setAttribute("aria-expanded", "true");
  b.setAttribute("aria-controls", panel.id);
  hidePeek();
  panel.innerHTML = `<div class="shelf-card">${card(e, 0).replace("lib-card enter", "lib-card")}<button type="button" class="btn small shelf-close" aria-label="Put it back on the shelf">Put back ↩</button></div>`;
  panel.hidden = false;
  panel.querySelector(".shelf-close").addEventListener("click", () => closeSpine());
  if (!animate) return;
  // The card opens out of the spine: start at the spine's box, grow into place.
  const c = panel.querySelector(".lib-card");
  const sr = b.getBoundingClientRect(), cr = c.getBoundingClientRect();
  gsap.fromTo(panel, { height: 0 }, { height: "auto", duration: 0.5, ease: "power3.out", clearProps: "height" });
  gsap.fromTo(c, {
    x: sr.left - cr.left, y: sr.top - cr.top - 40, scaleX: sr.width / cr.width, scaleY: Math.min(1, sr.height / cr.height),
    transformOrigin: "0 0", rotationY: -55, autoAlpha: 0.3, transformPerspective: 900
  }, { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationY: 0, autoAlpha: 1, duration: 0.75, ease: "power3.inOut", delay: 0.12, clearProps: "transform,opacity,visibility" });
  gsap.fromTo(b, { y: 0 }, { y: -26, duration: 0.35, ease: "power2.out", yoyo: true, repeat: 1, repeatDelay: 0.05, clearProps: "transform" });
}

function closeSpine(instant = false) {
  const b = openSpine;
  if (!b) return;
  openSpine = null;
  const panel = b.closest(".shelf").querySelector(".shelf-open");
  const done = () => { panel.hidden = true; panel.innerHTML = ""; };
  b.classList.remove("out");
  b.setAttribute("aria-expanded", "false");
  if (!instant && document.activeElement && panel.contains(document.activeElement)) b.focus({ preventScroll: true });
  if (instant || !animate) return done();
  const c = panel.querySelector(".lib-card");
  const sr = b.getBoundingClientRect(), cr = c.getBoundingClientRect();
  gsap.to(c, { x: sr.left - cr.left, y: sr.top - cr.top, scaleX: sr.width / cr.width, scaleY: Math.min(1, sr.height / cr.height), transformOrigin: "0 0", autoAlpha: 0, duration: 0.4, ease: "power2.in" });
  gsap.to(panel, { height: 0, duration: 0.45, ease: "power2.inOut", delay: 0.1, onComplete: () => { gsap.set(panel, { clearProps: "height" }); done(); } });
}

document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && openSpine) closeSpine(); });

/* ---------------- hover preview ----------------
 * Spines and reading-path links show a small card with what the document is before
 * you commit to opening it: publisher, type, level, year and the first line of its
 * description. Mouse and keyboard focus only (a tap on a phone just opens the thing).
 */
let peekT = 0;
function bindPeek() {
  const fine = matchMedia("(hover: hover)").matches;
  const target = (ev) => ev.target.closest && ev.target.closest(".spine:not(.out), #pathCols .steps a[data-i]");
  if (fine) {
    document.addEventListener("pointerover", (ev) => { const t = target(ev); if (t && ev.pointerType !== "touch") { clearTimeout(peekT); peekT = setTimeout(() => showPeek(t), 120); } });
    document.addEventListener("pointerout", (ev) => { const t = target(ev); if (t && !t.contains(ev.relatedTarget)) { clearTimeout(peekT); hidePeek(); } });
  }
  document.addEventListener("focusin", (ev) => { const t = target(ev); if (t && t.matches(":focus-visible")) showPeek(t); });
  document.addEventListener("focusout", (ev) => { if (target(ev)) hidePeek(); });
  addEventListener("scroll", hidePeek, { passive: true });
}
function showPeek(el) {
  const e = ENTRIES[+el.dataset.i];
  if (!e) return;
  const pk = $("#peek");
  const desc = e.description.length > 170 ? e.description.slice(0, e.description.lastIndexOf(" ", 165)) + "…" : e.description;
  pk.innerHTML = `<div class="pk-top" data-org="${esc(e.org)}"><span class="chip org-chip">${esc(e.org === "MIT" ? "MIT OCW" : e.org)}</span>
      <span class="lc-type">${typeIcon(e.type)}${TYPES[e.type][0]}</span></div>
    <b class="pk-title">${esc(e.title)}</b><span class="pk-src">${esc(e.source)}${e.year ? " · " + e.year : ""}</span>
    <p>${esc(desc)}</p><span class="lvl ${e.level}">${[1, 2, 3].map((n) => `<i class="${n <= LVL_N[e.level] ? "on" : ""}"></i>`).join("")}<b>${LEVEL_NAME[e.level]}</b></span>`;
  pk.setAttribute("aria-hidden", "false");
  const r = el.getBoundingClientRect();
  pk.classList.add("on");
  const w = pk.offsetWidth, h = pk.offsetHeight;
  let x = r.left + r.width / 2 - w / 2;
  x = Math.max(10, Math.min(innerWidth - w - 10, x));
  let y = r.top - h - 12;
  const below = y < 70;
  if (below) y = r.bottom + 12;
  pk.style.left = x + "px"; pk.style.top = y + "px";
  pk.classList.toggle("below", below);
  pk.style.setProperty("--ax", `${Math.max(14, Math.min(w - 14, r.left + r.width / 2 - x))}px`);
}
function hidePeek() { const pk = $("#peek"); if (pk) { pk.classList.remove("on"); pk.setAttribute("aria-hidden", "true"); } }

/* ---------------- reading-path line ----------------
 * In each stage a bright line draws down through the numbered steps as the column
 * scrolls past, and each step lights as the line reaches it: the path is a sequence.
 */
function pathLines() {
  const cols = [...document.querySelectorAll("#pathCols .path-col")];
  const NS = "http://www.w3.org/2000/svg";
  const lines = cols.map((col) => {
    const steps = col.querySelector(".steps");
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "steps-line"); svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(NS, "path");
    const dot = document.createElementNS(NS, "circle");
    dot.setAttribute("r", "4");
    svg.append(path, dot);
    steps.prepend(svg);
    return { col, steps, svg, path, dot, ys: [], len: 0, p: reduce ? 1 : 0 };
  });
  const layout = () => lines.forEach((L) => {
    const nums = [...L.steps.querySelectorAll(".n")];
    const top = L.steps.getBoundingClientRect().top;
    L.ys = nums.map((n) => { const r = n.getBoundingClientRect(); return r.top + r.height / 2 - top; });
    const h = L.steps.offsetHeight;
    L.svg.setAttribute("viewBox", `0 0 28 ${h}`);
    L.svg.style.height = h + "px";
    const y0 = L.ys[0], y1 = L.ys[L.ys.length - 1];
    L.path.setAttribute("d", `M13.5 ${y0} V ${y1}`);
    L.len = y1 - y0;
    paint(L);
  });
  const paint = (L) => {
    const y0 = L.ys[0] || 0;
    const reach = y0 + L.p * L.len;
    if (gsap && window.DrawSVGPlugin) gsap.set(L.path, { drawSVG: `0% ${(L.p * 100).toFixed(2)}%` });
    else L.path.style.strokeDasharray = `${L.p * L.len} 9999`;
    L.dot.setAttribute("cx", 13.5); L.dot.setAttribute("cy", reach);
    L.dot.style.opacity = L.p > 0.001 && L.p < 0.999 ? 1 : 0;
    L.steps.querySelectorAll(":scope > li").forEach((li, k) => li.classList.toggle("reached", L.ys[k] <= reach + 1));
  };
  layout();
  if ("ResizeObserver" in window) new ResizeObserver(layout).observe($("#pathCols"));
  if (!gsap || !ScrollTrigger || reduce) return;
  lines.forEach((L) => ScrollTrigger.create({
    trigger: L.steps, start: "top 72%", end: "bottom 58%", scrub: 0.5,
    onUpdate: (self) => { L.p = self.progress; paint(L); }
  }));
}

/* ---------------- systems engineering corner ---------------- */
function buildSE() {
  const info = (title, text, el) => {
    $("#seInfoTitle").textContent = title;
    $("#seInfoText").textContent = text;
    document.querySelectorAll("#systems .on").forEach((n) => n.classList.remove("on"));
    if (el) el.classList.add("on");
  };
  const tone = (n) => (n.side === "l" ? "#7cc8ff" : n.side === "b" ? "#b18cff" : "#ff7a3d");
  const NS = "http://www.w3.org/2000/svg";
  const g = $("#vNodes");
  VNODES.forEach((n) => {
    const node = document.createElementNS(NS, "g");
    node.setAttribute("class", "vnode");
    node.setAttribute("tabindex", "0");
    node.setAttribute("role", "button");
    node.setAttribute("aria-label", n.t);
    node.style.setProperty("--c", tone(n));
    const tx = n.side === "l" ? n.x - 16 : n.side === "r" ? n.x + 16 : n.x;
    const ty = n.side === "b" ? n.y + 30 : n.y + 4.5;
    const anchor = n.side === "l" ? "end" : n.side === "r" ? "start" : "middle";
    node.innerHTML = `<circle cx="${n.x}" cy="${n.y}" r="6"/><text x="${tx}" y="${ty}" text-anchor="${anchor}">${esc(n.t)}</text>` +
      `<rect x="${n.side === "l" ? n.x - 190 : n.side === "r" ? n.x - 10 : n.x - 70}" y="${n.y - 14}" width="${n.side === "b" ? 140 : 200}" height="${n.side === "b" ? 52 : 28}" fill="transparent"/>`;
    const go = () => info(n.t, n.d, node);
    node.addEventListener("mouseenter", go); node.addEventListener("focus", go); node.addEventListener("click", go);
    node.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); go(); } });
    g.appendChild(node);
  });

  $("#life").innerHTML = PHASES.map((p, i) =>
    `<button type="button" role="listitem" class="phase${p.impl ? " impl" : ""}" data-i="${i}"><span class="ph">${p.p}</span><span class="pn">${esc(p.n)}</span><span class="rv">${p.r}</span></button>`).join("");
  $("#life").querySelectorAll(".phase").forEach((b) => {
    const p = PHASES[+b.dataset.i];
    const go = () => info(`Phase ${p.p}: ${p.n}`, p.d, b);
    b.addEventListener("mouseenter", go); b.addEventListener("focus", go); b.addEventListener("click", go);
  });

  const trlTone = (i) => (i < 3 ? "var(--nebula)" : i < 6 ? "var(--ice)" : "var(--aurora)");
  $("#trl").innerHTML = TRLS.map((t, i) =>
    `<button type="button" role="listitem" class="tl" data-i="${i}" style="--h:${18 + i * 10.25}%;--c:${trlTone(i)}" aria-label="TRL ${i + 1}: ${esc(t)}">${i + 1}</button>`).join("");
  $("#trl").querySelectorAll(".tl").forEach((b) => {
    const i = +b.dataset.i;
    const go = () => info(`TRL ${i + 1}`, TRLS[i], b);
    b.addEventListener("mouseenter", go); b.addEventListener("focus", go); b.addEventListener("click", go);
  });
}

/* ---------------- watch ---------------- */
function initials(name) {
  const paren = name.match(/\(([A-Z]{2,5})\)/);
  if (paren) return paren[1];
  if (/^Kurzgesagt/.test(name)) return "Kz";
  const w = name.replace(/\(.*?\)/g, "").split(/\s+/).filter((x) => /^[A-Za-z]/.test(x));
  if (w.length === 1) return w[0].length <= 4 && w[0] === w[0].toUpperCase() ? w[0] : w[0][0];
  return (w[0][0] + w[1][0]).toUpperCase();
}

function buildWatch() {
  $("#channels").innerHTML = DATA.channels.map((c, i) =>
    `<a class="card spot channel reveal tone-${c.tone}" data-delay="${(i % 4) * 60}" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">
      <span class="avatar${initials(c.name).length > 3 ? " long" : ""}" aria-hidden="true">${esc(initials(c.name))}</span>
      <div><h3>${esc(c.name)}</h3><span class="kind">${esc(c.kind)}</span><p>${esc(c.why)}</p></div></a>`).join("");

  const toneOf = {};
  DATA.channels.forEach((c) => { toneOf[c.name.replace(/\s*\(.*\)/, "")] = c.tone; });
  const pick = (ch) => {
    if (/JPL/.test(ch)) return "nebula";
    if (/Smarter/.test(ch)) return "sol";
    if (/ESA/.test(ch)) return "aurora";
    return toneOf[ch] || "ice";
  };
  const second = ["nebula", "flame", "plasma", "aurora", "sol", "ice"];
  const arcs = [
    '<ellipse cx="50%" cy="120%" rx="70%" ry="60%" fill="none" stroke="currentColor" stroke-width="1"/><ellipse cx="50%" cy="120%" rx="52%" ry="44%" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="3 6"/>',
    '<ellipse cx="30%" cy="55%" rx="45%" ry="16%" fill="none" stroke="currentColor" transform="rotate(-18 200 90)"/><circle cx="30%" cy="55%" r="10" fill="currentColor" opacity=".6"/>',
    '<path d="M0 170 Q 180 40 420 20" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 6"/><circle cx="84%" cy="16%" r="4" fill="currentColor"/>'
  ];
  $("#videos").innerHTML = DATA.videos.map((v, i) => {
    const t = pick(v.channel);
    const yt = /youtube\.com/.test(v.url);
    return `<a class="card spot video reveal tone-${t}" data-delay="${(i % 3) * 70}" href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">
      <div class="thumb" style="--c2:var(--${second[i % second.length]})">
        <svg class="arc" viewBox="0 0 400 200" preserveAspectRatio="none" aria-hidden="true">${arcs[i % arcs.length]}</svg>
        <span class="chip topic">${esc(v.topic)}</span>
        <span class="play" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3 1.5v13l11-6.5z"/></svg></span>
      </div>
      <div class="v-body"><span class="by">${esc(v.channel)} · ${yt ? "YouTube" : esc(host(v.url))} ↗</span><h3>${esc(v.title)}</h3><p>${esc(v.why)}</p></div></a>`;
  }).join("");
}
