/* Cosmic Library — Gallery
 *
 * Data:    data/gallery.json (curated) + data/gallery.local.json (written by
 *          scripts/fetch_gallery.py; when it lists an id, the local file wins).
 * Images:  for each photograph we try, in order: local copy → `image` → each
 *          `alt` URL → the NASA Image and Video Library search API (CORS-enabled,
 *          https://images.nasa.gov/docs/images.nasa.gov_api_docs.pdf) using the
 *          entry's `query` → a styled, titled placeholder. Nothing is fatal.
 * Motion:  GSAP + ScrollTrigger + Flip (vendored classic scripts). All optional;
 *          the page works without them and honours prefers-reduced-motion.
 */

const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
const Flip = window.Flip;
if (gsap && ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
if (gsap && Flip) gsap.registerPlugin(Flip);
const reduce = (window.Codex && window.Codex.reducedMotion) ||
  (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
const animate = !!gsap && !reduce;

const $ = (s, r = document) => r.querySelector(s);
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC[c]);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(it) {
  if (it.dateLabel) return it.dateLabel;
  const p = String(it.date || it.year).split("-");
  if (p.length === 3) return `${+p[2]} ${MONTHS[+p[1] - 1]} ${p[0]}`;
  if (p.length === 2) return `${MONTHS[+p[1] - 1]} ${p[0]}`;
  return p[0];
}

async function getJSON(url, timeout = 8000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

/* ------------------------------------------------------------------ images */
let LOCAL = {};

/** Resolve when `url` has actually decoded as an image; reject on error/timeout. */
function probe(url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; img.src = ""; reject(new Error("timeout")); } }, timeout);
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.onload = () => { if (done) return; done = true; clearTimeout(t); img.naturalWidth > 1 ? resolve(url) : reject(new Error("empty")); };
    img.onerror = () => { if (done) return; done = true; clearTimeout(t); reject(new Error("error")); };
    img.src = url;
  });
}

const searchCache = new Map();
/** NASA Image and Video Library search → first result that loads (medium, else thumb). */
function nasaSearch(q) {
  if (searchCache.has(q)) return searchCache.get(q);
  const p = (async () => {
    const data = await getJSON(`https://images-api.nasa.gov/search?q=${encodeURIComponent(q)}&media_type=image`, 9000);
    const items = (data && data.collection && data.collection.items) || [];
    for (const it of items.slice(0, 4)) {
      const link = (it.links || []).find((l) => l.render === "image" || /\.(jpe?g|png)$/i.test(l.href || ""));
      if (!link) continue;
      const thumb = link.href.replace(/^http:/, "https:");
      for (const u of [thumb.replace("~thumb.", "~medium."), thumb]) {
        try { return await probe(u, 10000); } catch (e) { /* next */ }
      }
    }
    return null;
  })().catch(() => null);
  searchCache.set(q, p);
  return p;
}

const resolved = new Map();
const RESOLVED = {}; // id → url once known (synchronous lookups for previews and transitions)
function resolveImage(item) {
  if (resolved.has(item.id)) return resolved.get(item.id);
  const p = (async () => {
    const list = [LOCAL[item.id], item.image].concat(item.alt || []).filter(Boolean);
    for (const u of list) {
      try { return await probe(u); } catch (e) { /* try the next source */ }
    }
    if (item.query) return await nasaSearch(item.query);
    return null;
  })().catch(() => null).then((url) => { RESOLVED[item.id] = url; return url; });
  resolved.set(item.id, p);
  return p;
}

/* Line-art subject glyphs for the placeholder state (original drawings). */
const GLYPH = {
  "Earth": '<circle cx="50" cy="50" r="34"/><ellipse cx="50" cy="50" rx="14" ry="34"/><path d="M16 50h68M22 32h56M22 68h56"/>',
  "Moon": '<path d="M62 16a36 36 0 1 0 22 50 30 30 0 0 1-22-50z"/><circle cx="44" cy="56" r="5"/><circle cx="36" cy="38" r="3"/><circle cx="56" cy="74" r="3"/>',
  "Solar System": '<circle cx="50" cy="50" r="22"/><ellipse cx="50" cy="50" rx="44" ry="12" transform="rotate(-18 50 50)"/><circle cx="86" cy="22" r="3"/>',
  "Deep sky": '<path d="M50 50c0-8 10-12 16-6s2 20-12 22-26-10-22-26 24-26 40-16"/><path d="M50 50c0 8-10 12-16 6s-2-20 12-22 26 10 22 26-24 26-40 16"/><circle cx="50" cy="50" r="3"/>',
  "Spaceflight": '<path d="M50 12c12 10 16 26 14 44H36c-2-18 2-34 14-44z"/><circle cx="50" cy="36" r="5"/><path d="M36 56l-10 14h12M64 56l10 14H62M44 62l-2 16M50 62v22M56 62l2 16"/>',
  "Sun": '<circle cx="50" cy="50" r="20"/><path d="M50 14v10M50 76v10M14 50h10M76 50h10M24.5 24.5l7 7M68.5 68.5l7 7M24.5 75.5l7-7M68.5 31.5l7-7"/><path d="M40 44c4-3 10-3 14 2" opacity=".6"/>'
};

/* Subject colours: the site tokens in a fixed order, checked for colour-vision-deficiency
   separation against the dark surface. Identity is never colour-alone (legend text,
   chips and tooltips carry the subject name). Unknown subjects fall back to a neutral. */
const CAT_COLOR = { "Earth": "#7cc8ff", "Moon": "#b18cff", "Solar System": "#ff7a3d", "Deep sky": "#ff4f9a", "Spaceflight": "#4ef0b8", "Sun": "#ffc24b" };
const catColor = (c) => CAT_COLOR[c] || "#c3cae6";

/** Decimal year from "YYYY", "YYYY-MM" or "YYYY-MM-DD" (mid-period when a part is missing). */
function yearNum(it) {
  const p = String(it.date || it.year).split("-").map(Number);
  const y = p[0] || +it.year;
  if (p.length < 2) return y + 0.5;
  const d = p.length > 2 ? p[2] : 15;
  return y + (p[1] - 1 + (d - 1) / 31) / 12;
}
function glyph(it) {
  const g = GLYPH[it.tags.category] || GLYPH["Deep sky"];
  return `<span class="g-ph-glyph" aria-hidden="true"><svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${g}</svg></span>`;
}

function toneVars(it) {
  const t = it.tone || ["#0d1222", "#7cc8ff"];
  return `--t0:${t[0]};--t1:${t[1]}`;
}

/* ------------------------------------------------------------------ state */
let ITEMS = [];
const BY_ID = {};
const TILE = {};
const GROUPS = [
  { key: "era", label: "Era", get: (it) => [it.tags.era] },
  { key: "category", label: "Subject", get: (it) => [it.tags.category] },
  { key: "agency", label: "Source", get: (it) => it.tags.agency }
];
const state = { era: "all", category: "all", agency: "all", q: "", sort: "asc", y0: null, y1: null };
const FEATURED = new Set();

const grid = $("#grid");

/* ------------------------------------------------------------------ tiles */
function tileHTML(it) {
  const ar = Math.min(1.9, Math.max(0.62, it.ar || 1));
  const source = it.tags.agency.join(" · ");
  return `
    <button class="g-frame" type="button" style="--ar:${ar};${toneVars(it)}" aria-label="${esc(it.title)}, ${esc(fmtDate(it))}. Open details">
      <span class="g-ph">${glyph(it)}<span class="g-ph-state">Loading</span><span class="g-ph-credit">${esc(it.credit)}</span></span>
      <img alt="${esc(it.title)} (${esc(it.mission)}, ${it.year})" decoding="async" referrerpolicy="no-referrer">
      <span class="g-year">${it.year}</span>
    </button>
    <div class="g-cap"><h3>${esc(it.title)}</h3><p>${esc(it.mission)}<span class="dot">·</span>${esc(source)}</p></div>`;
}

function hydrate(tile) {
  if (tile.dataset.hydrated) return;
  tile.dataset.hydrated = "1";
  const it = BY_ID[tile.dataset.id];
  const frame = tile.querySelector(".g-frame");
  const img = frame.querySelector("img");
  resolveImage(it).then((url) => {
    if (!url) return fail(frame);
    img.onload = () => frame.classList.add("loaded");
    img.onerror = () => fail(frame);
    img.src = url;
  });
}
function fail(frame) {
  const ph = frame.querySelector(".g-ph");
  ph.classList.add("failed");
  ph.querySelector(".g-ph-state").textContent = "Offline · see source";
}

function buildGrid() {
  const frag = document.createDocumentFragment();
  ITEMS.forEach((it) => {
    const el = document.createElement("article");
    el.className = "g-tile";
    el.dataset.id = it.id;
    el.innerHTML = tileHTML(it);
    TILE[it.id] = el;
    frag.appendChild(el);
  });
  grid.appendChild(frag);

  // Lazy hydrate: resolve sources only as tiles approach the viewport.
  const io = "IntersectionObserver" in window ? new IntersectionObserver((ents) => {
    ents.forEach((en) => { if (en.isIntersecting) { hydrate(en.target); io.unobserve(en.target); } });
  }, { rootMargin: "600px 0px" }) : null;
  Object.values(TILE).forEach((t) => (io ? io.observe(t) : hydrate(t)));

  grid.addEventListener("click", (e) => {
    const f = e.target.closest(".g-frame");
    if (f) openLightbox(f.closest(".g-tile").dataset.id, f);
  });
  // Spotlight + a gentle 3D tilt toward the pointer, with the photograph drifting the
  // other way (parallax) so the frame reads as a window onto a deeper scene.
  // Mouse/pen only, one rAF per frame, skipped for reduced motion.
  const tilt = !reduce && matchMedia("(hover: hover) and (pointer: fine)").matches;
  let tf = null, tr = null, tx = 0, ty = 0, tq = 0;
  const paint = () => {
    tq = 0;
    if (!tf) return;
    const px = (tx - tr.left) / tr.width - 0.5, py = (ty - tr.top) / tr.height - 0.5;
    tf.style.setProperty("--mx", `${tx - tr.left}px`);
    tf.style.setProperty("--my", `${ty - tr.top}px`);
    if (tilt) {
      tf.style.setProperty("--rx", `${(-py * 7).toFixed(2)}deg`);
      tf.style.setProperty("--ry", `${(px * 9).toFixed(2)}deg`);
      tf.style.setProperty("--px", px.toFixed(3));
      tf.style.setProperty("--py", py.toFixed(3));
    }
  };
  const release = (f) => {
    if (!f) return;
    f.classList.remove("tilting");
    ["--rx", "--ry", "--px", "--py"].forEach((p) => f.style.removeProperty(p));
  };
  grid.addEventListener("pointermove", (e) => {
    const f = e.target.closest(".g-frame");
    if (f !== tf) { release(tf); tf = f; if (f) { tr = f.getBoundingClientRect(); if (tilt && e.pointerType !== "touch") f.classList.add("tilting"); } }
    if (!f) return;
    tx = e.clientX; ty = e.clientY;
    if (!tq) tq = requestAnimationFrame(paint);
  });
  grid.addEventListener("pointerleave", () => { release(tf); tf = null; });
  addEventListener("scroll", () => { if (tf) tr = tf.getBoundingClientRect(); }, { passive: true });
}

/* Masonry: 1px grid rows; each tile spans its own height, so DOM order stays reading order. */
function layout() {
  const tiles = grid.children;
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    if (t.hidden) continue;
    const mb = parseFloat(getComputedStyle(t).marginBottom) || 0;
    t.style.gridRowEnd = `span ${Math.ceil(t.firstElementChild.offsetHeight + t.lastElementChild.offsetHeight + mb)}`;
  }
}
let raf = 0;
const relayout = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { layout(); if (ScrollTrigger) ScrollTrigger.refresh(); }); };

/* ------------------------------------------------------------------ filters */
function buildFilters() {
  const wrap = $("#filters");
  wrap.innerHTML = GROUPS.map((g) => {
    const counts = {};
    ITEMS.forEach((it) => g.get(it).forEach((v) => (counts[v] = (counts[v] || 0) + 1)));
    let values = Object.keys(counts);
    if (g.key === "era") values.sort((a, b) => a.localeCompare(b));
    else values.sort((a, b) => (a === "Other") - (b === "Other") || counts[b] - counts[a]);
    return `<div class="fgroup" role="group" aria-label="${g.label}"><span class="fgroup-label">${g.label}</span>` +
      `<button type="button" class="fchip" data-g="${g.key}" data-v="all" aria-pressed="true">All</button>` +
      values.map((v) => `<button type="button" class="fchip" data-g="${g.key}" data-v="${esc(v)}" aria-pressed="false">` +
        (g.key === "category" ? `<i class="cdot" style="--cc:${catColor(v)}" aria-hidden="true"></i>` : "") +
        `${esc(v)}<span class="n">${counts[v]}</span></button>`).join("") +
      "</div>";
  }).join("");
  wrap.addEventListener("click", (e) => {
    const b = e.target.closest(".fchip");
    if (!b) return;
    setFilter(b.dataset.g, b.dataset.v);
  });

  let deb = 0;
  $("#q").addEventListener("input", (e) => {
    clearTimeout(deb);
    deb = setTimeout(() => { state.q = e.target.value.trim().toLowerCase(); apply(); }, 160);
  });
  $("#sortSeg").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-sort]");
    if (!b || state.sort === b.dataset.sort) return;
    state.sort = b.dataset.sort;
    $("#sortSeg").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    apply();
  });
  $("#resetFilters").addEventListener("click", () => {
    state.era = state.category = state.agency = "all";
    state.q = ""; $("#q").value = "";
    state.y0 = state.y1 = null; TM.brush = null;
    syncChips(); apply();
  });
}
function setFilter(g, v) {
  state[g] = v;
  syncChips();
  apply();
}
function syncChips() {
  document.querySelectorAll("#filters .fchip").forEach((c) => c.setAttribute("aria-pressed", String(state[c.dataset.g] === c.dataset.v)));
}

function matches(it, ignoreWindow = false) {
  if (!ignoreWindow && state.y0 != null) { const y = yearNum(it); if (y < state.y0 || y > state.y1) return false; }
  for (const g of GROUPS) if (state[g.key] !== "all" && !g.get(it).includes(state[g.key])) return false;
  if (!state.q) return true;
  const hay = [it.title, it.mission, it.instrument, it.credit, it.story, it.year, it.tags.era, it.tags.category, it.tags.agency.join(" ")].join(" ").toLowerCase();
  return state.q.split(/\s+/).every((w) => hay.includes(w));
}
function ordered() {
  const arr = ITEMS.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.year - b.year);
  return state.sort === "desc" ? arr.reverse() : arr;
}
function visibleItems() { return ordered().filter((it) => matches(it)); }

function apply(first = false) {
  const tiles = Object.values(TILE);
  if (!first && animate) { // after the first interaction, filters own the motion, not the scroll entrance
    ScrollTrigger && ScrollTrigger.getAll().forEach((st) => st.vars.id === "tile-in" && st.kill());
    gsap.set(tiles.flatMap((t) => [t.firstElementChild, t.lastElementChild]), { autoAlpha: 1, y: 0, overwrite: true });
  }
  const flip = !first && animate && Flip ? Flip.getState(tiles) : null;
  let n = 0;
  ordered().forEach((it) => {
    const t = TILE[it.id];
    grid.appendChild(t);
    const show = matches(it);
    t.hidden = !show;
    if (show) n++;
  });
  layout();
  $("#count").textContent = `${n} photograph${n === 1 ? "" : "s"}` + (state.y0 != null ? ` · ${Math.floor(state.y0)}–${Math.floor(state.y1)}` : "");
  $("#empty").hidden = n > 0;
  tmUpdate();
  if (flip) {
    Flip.from(flip, {
      duration: 0.6, ease: "power2.inOut", absolute: true, stagger: 0.006, nested: false,
      onEnter: (els) => gsap.fromTo(els, { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 0.5, delay: 0.15 }),
      onLeave: (els) => gsap.to(els, { opacity: 0, scale: 0.92, duration: 0.3 }),
      onComplete: () => ScrollTrigger && ScrollTrigger.refresh()
    });
  } else if (ScrollTrigger) ScrollTrigger.refresh();
  // Tiles pulled up by a filter change start loading straight away.
  tiles.forEach((t) => { if (!t.hidden && t.getBoundingClientRect().top < innerHeight + 600) hydrate(t); });
}

/* ------------------------------------------------------------------ entrance motion */
function entrance() {
  if (!animate || !ScrollTrigger) return;
  const parts = (batch) => batch.flatMap((t) => [t.firstElementChild, t.lastElementChild]);
  gsap.set(parts(Object.values(TILE)), { autoAlpha: 0, y: 36 });
  ScrollTrigger.batch(".g-tile", {
    id: "tile-in",
    start: "top 94%",
    once: true,
    onEnter: (batch) => gsap.to(parts(batch), { autoAlpha: 1, y: 0, duration: 0.9, ease: "power3.out", stagger: 0.05, overwrite: true })
  });
  // Hero copy + gentle parallax on the photograph.
  gsap.from(".gh-in", { y: 34, autoAlpha: 0, duration: 1.1, ease: "power3.out", stagger: 0.1, delay: 0.1 });
  gsap.from(".gh-caption", { y: 20, autoAlpha: 0, duration: 1, ease: "power3.out", delay: 0.7 });
  gsap.to("#heroMedia", { yPercent: 14, ease: "none", scrollTrigger: { trigger: "#hero", start: "top top", end: "bottom top", scrub: true } });
  gsap.to(".gh-copy", { yPercent: -18, autoAlpha: 0.2, ease: "none", scrollTrigger: { trigger: "#hero", start: "40% top", end: "bottom top", scrub: true } });
}

/* ------------------------------------------------------------------ hero (Ken Burns) */
const hero = { list: [], i: -1, layers: [], timer: 0 };
const KB = [
  { ox: "62%", oy: "38%", dx: "-2.5%", dy: "1.5%" },
  { ox: "35%", oy: "55%", dx: "2%", dy: "-1.5%" },
  { ox: "50%", oy: "30%", dx: "-1%", dy: "2.5%" },
  { ox: "70%", oy: "65%", dx: "1.5%", dy: "-2%" }
];
function buildHero(featured) {
  hero.list = featured.map((id) => BY_ID[id]).filter(Boolean);
  if (!hero.list.length) hero.list = ITEMS.slice(0, 3);
  const media = $("#heroMedia");
  for (let k = 0; k < 2; k++) {
    const layer = document.createElement("div");
    layer.className = "gh-layer";
    layer.innerHTML = '<span class="g-ph"></span><div class="gh-kb"></div>';
    media.appendChild(layer);
    hero.layers.push(layer);
  }
  $("#heroDots").innerHTML = hero.list.map((it, k) => `<button type="button" aria-label="Show ${esc(it.title)}" data-k="${k}"></button>`).join("");
  $("#heroDots").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-k]");
    if (b) { showHero(+b.dataset.k); restartHeroTimer(); }
  });
  $("#heroOpen").addEventListener("click", () => openLightbox(hero.list[hero.i].id));
  // Warm the featured sources early; they are the first thing anyone sees.
  hero.list.forEach(resolveImage);
  showHero(0);
  restartHeroTimer();
  document.addEventListener("visibilitychange", restartHeroTimer);
}
function showHero(k) {
  if (k === hero.i) return;
  const it = hero.list[k];
  const prev = hero.layers.find((l) => l.classList.contains("on"));
  const next = hero.layers.find((l) => l !== prev);
  hero.i = k;
  const kb = next.querySelector(".gh-kb");
  const ph = next.querySelector(".g-ph");
  ph.setAttribute("style", toneVars(it));
  ph.style.opacity = "1";
  kb.style.backgroundImage = "";
  const m = KB[k % KB.length];
  kb.style.setProperty("--ox", m.ox); kb.style.setProperty("--oy", m.oy);
  kb.style.setProperty("--dx", m.dx); kb.style.setProperty("--dy", m.dy);
  kb.style.animation = "none"; void kb.offsetWidth; kb.style.animation = "";
  resolveImage(it).then((url) => {
    if (!url || hero.i !== k) return;
    kb.style.backgroundImage = `url("${url.replace(/"/g, "%22")}")`;
    if (gsap) gsap.to(ph, { opacity: 0, duration: 1.2 }); else ph.style.opacity = "0";
  });
  next.classList.add("on");
  if (prev) prev.classList.remove("on");
  if (gsap) {
    gsap.fromTo(next, { opacity: 0 }, { opacity: 1, duration: reduce ? 0 : 1.8, ease: "power2.inOut" });
    if (prev) gsap.to(prev, { opacity: 0, duration: reduce ? 0 : 1.8, ease: "power2.inOut" });
  } else {
    next.style.opacity = "1"; if (prev) prev.style.opacity = "0";
  }
  $("#heroTitle").textContent = it.title;
  $("#heroMeta").textContent = `${it.mission} · ${it.year} · ${it.credit}`;
  $("#heroDots").querySelectorAll("button").forEach((b, j) => b.setAttribute("aria-current", String(j === k)));
}
function restartHeroTimer() {
  clearInterval(hero.timer);
  if (reduce || document.hidden || hero.list.length < 2) return;
  hero.timer = setInterval(() => showHero((hero.i + 1) % hero.list.length), 9000);
}

/* ------------------------------------------------------------------ lightbox */
const lb = $("#lb");
const lbStage = $("#lbStage");
const lbImg = $("#lbImg");
const lbPh = $("#lbPh");
const lbView = { list: [], i: -1, lastFocus: null, token: 0 };

/* Shared-element transition: a "ghost" copy of the thing you clicked (a grid frame or a
   time-machine dot) flies to where the photograph will sit in the viewer, so the eye
   never loses track of which picture opened. The reverse runs on close. */
function makeGhost(it, fromEl) {
  const g = document.createElement("div");
  g.className = "gal-ghost";
  g.setAttribute("style", toneVars(it));
  const url = RESOLVED[it.id];
  const img = fromEl && fromEl.querySelector && fromEl.querySelector("img");
  const src = (fromEl && fromEl.classList && fromEl.classList.contains("loaded") && img && img.currentSrc) || url;
  if (src) g.style.backgroundImage = `url("${String(src).replace(/"/g, "%22")}")`;
  else g.innerHTML = `<span class="g-ph">${glyph(it)}</span>`;
  document.body.appendChild(g);
  return g;
}
/** Where the photograph ends up inside the viewer stage (object-fit: contain). */
function stageTarget(it) {
  const r = lbStage.getBoundingClientRect();
  const loaded = lbStage.classList.contains("loaded") && lbImg.naturalWidth;
  const ar = loaded ? lbImg.naturalWidth / lbImg.naturalHeight : 0;
  if (!ar) return { left: r.left, top: r.top, width: r.width, height: r.height, radius: 14 };
  let w = r.width, h = w / ar;
  if (h > r.height) { h = r.height; w = h * ar; }
  return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, width: w, height: h, radius: 10 };
}
const clearAlpha = (c) => c.replace(/rgba?\(([^)]+)\)/, (m, a) => { const p = a.split(","); return `rgba(${p[0]},${p[1]},${p[2]},0)`; });

function openLightbox(id, fromEl) {
  lbView.list = visibleItems();
  if (!lbView.list.some((it) => it.id === id)) lbView.list = ordered();
  lbView.i = lbView.list.findIndex((it) => it.id === id);
  if (lbView.i < 0) return;
  if (cinemaOpen()) closeCinema();
  lbView.lastFocus = document.activeElement;
  lb.classList.add("open");
  lb.setAttribute("aria-hidden", "false");
  document.documentElement.style.overflow = "hidden";
  renderLightbox();
  $("#lbClose").focus({ preventScroll: true });
  if (!animate) return;
  const r0 = fromEl && fromEl.getBoundingClientRect();
  const it = lbView.list[lbView.i];
  const chrome = [".gal-lb-info > *", "#lbClose", "#lbPrev", "#lbNext"];
  if (!r0 || !r0.width) {
    gsap.fromTo(".gal-lb-body", { opacity: 0, scale: 0.98 }, { opacity: 1, scale: 1, duration: 0.45, ease: "power2.out" });
    return;
  }
  gsap.killTweensOf([lb, lbStage]);
  const bg = getComputedStyle(lb).backgroundColor;
  const ghost = makeGhost(it, fromEl);
  const round = fromEl.tagName.toLowerCase() === "g" || fromEl instanceof SVGElement ? "50%" : "14px";
  const t = stageTarget(it);
  gsap.set(lbStage, { autoAlpha: 0 });
  gsap.fromTo(lb, { backgroundColor: clearAlpha(bg) }, { backgroundColor: bg, duration: 0.5, ease: "power1.out", clearProps: "backgroundColor" });
  gsap.fromTo(chrome, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.035, delay: 0.28, ease: "power2.out", clearProps: "transform,opacity,visibility" });
  gsap.fromTo(ghost, { left: r0.left, top: r0.top, width: r0.width, height: r0.height, borderRadius: round },
    { left: t.left, top: t.top, width: t.width, height: t.height, borderRadius: t.radius, duration: 0.7, ease: "power3.inOut",
      onComplete: () => {
        gsap.to(lbStage, { autoAlpha: 1, duration: 0.25, clearProps: "opacity,visibility" });
        gsap.to(ghost, { autoAlpha: 0, duration: 0.35, delay: 0.1, onComplete: () => ghost.remove() });
      } });
}
function closeLightbox(instant = false) {
  if (!lb.classList.contains("open") || lb.dataset.closing) return;
  const finish = () => {
    delete lb.dataset.closing;
    lb.classList.remove("open");
    lb.setAttribute("aria-hidden", "true");
    if (gsap) gsap.set([lb, lbStage, ".gal-lb-info", "#lbClose", "#lbPrev", "#lbNext"], { clearProps: "backgroundColor,opacity,visibility" });
    document.documentElement.style.overflow = "";
    history.replaceState(null, "", location.pathname + location.search);
    if (lbView.lastFocus && lbView.lastFocus.focus) lbView.lastFocus.focus({ preventScroll: true });
  };
  const it = lbView.list[lbView.i];
  const tile = it && TILE[it.id];
  const frame = tile && !tile.hidden && tile.querySelector(".g-frame");
  const r1 = frame && frame.getBoundingClientRect();
  if (instant || !animate || !r1 || r1.bottom < 0 || r1.top > innerHeight || !r1.width) return finish();
  lb.dataset.closing = "1";
  const t = stageTarget(it);
  const ghost = makeGhost(it, frame);
  gsap.set(ghost, { left: t.left, top: t.top, width: t.width, height: t.height, borderRadius: t.radius });
  gsap.set(lbStage, { autoAlpha: 0 });
  gsap.to(".gal-lb-info, #lbClose, #lbPrev, #lbNext", { autoAlpha: 0, duration: 0.2 });
  gsap.to(lb, { backgroundColor: clearAlpha(getComputedStyle(lb).backgroundColor), duration: 0.5, ease: "power1.in" });
  gsap.to(ghost, { left: r1.left, top: r1.top, width: r1.width, height: r1.height, borderRadius: 14, duration: 0.55, ease: "power3.inOut",
    onComplete: () => { finish(); gsap.to(ghost, { autoAlpha: 0, duration: 0.25, onComplete: () => ghost.remove() }); } });
}
function step(d) {
  if (!lbView.list.length) return;
  lbView.i = (lbView.i + d + lbView.list.length) % lbView.list.length;
  renderLightbox(d);
}
function renderLightbox(dir = 0) {
  const it = lbView.list[lbView.i];
  const token = ++lbView.token;
  $("#lbDate").textContent = fmtDate(it);
  $("#lbTitle").textContent = it.title;
  $("#lbStory").textContent = it.story;
  $("#lbMission").textContent = it.mission;
  $("#lbInstrument").textContent = it.instrument;
  $("#lbCredit").textContent = it.credit;
  $("#lbTags").innerHTML = [["era", it.tags.era], ["category", it.tags.category]].concat(it.tags.agency.map((a) => ["agency", a]))
    .map(([g, v]) => `<button type="button" class="fchip" data-g="${g}" data-v="${esc(v)}" title="Show all: ${esc(v)}">${esc(v)}</button>`).join("");
  $("#lbSource").href = it.page;
  $("#lbFull").href = it.image || it.page;
  $("#lbPos").textContent = `${lbView.i + 1} / ${lbView.list.length}`;
  $("#lbPhTitle").textContent = it.title;
  $("#lbPhCredit").textContent = it.credit;
  $("#lbPhState").textContent = "Loading";
  lbPh.classList.remove("failed");
  lbPh.setAttribute("style", toneVars(it));
  lbStage.classList.remove("loaded");
  lbImg.removeAttribute("src");
  lbImg.alt = `${it.title} (${it.mission}, ${it.year})`;
  history.replaceState(null, "", `#photo=${it.id}`);
  if (animate && dir) {
    gsap.fromTo([lbStage, ".gal-lb-info > *"], { x: 24 * dir, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45, ease: "power2.out", stagger: 0.02 });
  }
  resolveImage(it).then((url) => {
    if (token !== lbView.token) return;
    if (!url) {
      lbPh.classList.add("failed");
      $("#lbPhState").textContent = "Image unavailable offline · open the source page";
      return;
    }
    $("#lbFull").href = url;
    lbImg.onload = () => { if (token === lbView.token) lbStage.classList.add("loaded"); };
    lbImg.src = url;
  });
  // Preload neighbours so arrow-key browsing feels instant.
  [1, -1].forEach((d) => resolveImage(lbView.list[(lbView.i + d + lbView.list.length) % lbView.list.length]));
}
function bindLightbox() {
  $("#lbClose").addEventListener("click", closeLightbox);
  $("#lbPrev").addEventListener("click", () => step(-1));
  $("#lbNext").addEventListener("click", () => step(1));
  lb.addEventListener("click", (e) => {
    const chip = e.target.closest(".fchip");
    if (chip) {
      closeLightbox(true);
      state.y0 = state.y1 = null; TM.brush = null;
      state.era = state.category = state.agency = "all";
      setFilter(chip.dataset.g, chip.dataset.v);
      $("#collection").scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
      return;
    }
    if (e.target === lb || e.target.classList.contains("gal-lb-body")) closeLightbox();
  });
  document.addEventListener("keydown", (e) => {
    if (!lb.classList.contains("open")) return;
    if (e.key === "Escape") { e.preventDefault(); closeLightbox(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
    else if (e.key === "Tab") { // keep focus inside the dialog
      const f = [...lb.querySelectorAll("button, a[href]")].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  // Swipe on touch screens.
  let x0 = null;
  lbStage.addEventListener("pointerdown", (e) => { x0 = e.clientX; });
  lbStage.addEventListener("pointerup", (e) => {
    if (x0 == null) return;
    const dx = e.clientX - x0; x0 = null;
    if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
  });
}

/* ------------------------------------------------------------------ time machine
 * Every photograph on one year axis (1946 → today). x = the date the picture was taken;
 * dots at the same moment stack into a small swarm so none hide each other. Bigger dots
 * are the featured photographs. Dragging across the plot selects a window of years and
 * filters the grid (the grid re-flows with Flip); dragging the window moves it, its
 * handles resize it (also with the arrow keys). Zoom with the + / − buttons, Ctrl/⌘ +
 * wheel or a pinch; drag the year labels (or scroll sideways) to pan when zoomed in.
 */
const NS = "http://www.w3.org/2000/svg";
const TM = {
  built: false, W: 0, H: 150, axisH: 28, padX: 14, full: [1945, 2027], dom: { a: 1945, b: 2027 },
  brush: null, drag: null, dots: [], order: [], active: -1, zoomTween: null
};
const svgEl = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
};
const tmX = (v) => TM.padX + (v - TM.dom.a) / (TM.dom.b - TM.dom.a) * (TM.W - 2 * TM.padX);
const tmV = (x) => TM.dom.a + (x - TM.padX) / (TM.W - 2 * TM.padX) * (TM.dom.b - TM.dom.a);
const clampV = (v) => Math.max(TM.full[0], Math.min(TM.full[1], v));
const dotR = (it) => (FEATURED.has(it.id) ? 7.5 : 4.6) * (TM.W < 520 ? 0.82 : 1);

function buildTimeMachine() {
  const svg = $("#tmSvg");
  const now = new Date().getFullYear() + 1;
  const first = Math.min(...ITEMS.map(yearNum));
  TM.full = [Math.min(1945, Math.floor(first) - 1), Math.max(now, Math.ceil(Math.max(...ITEMS.map(yearNum))) + 1)];
  TM.dom = { a: TM.full[0], b: TM.full[1] };
  TM.gGrid = svgEl("g", { class: "tm-grid" }, svg);
  TM.gShade = svgEl("g", { class: "tm-shade" }, svg);
  TM.shadeL = svgEl("rect", { y: 0 }, TM.gShade);
  TM.shadeR = svgEl("rect", { y: 0 }, TM.gShade);
  TM.axis = svgEl("line", { class: "tm-axis" }, svg);
  TM.gDots = svgEl("g", { class: "tm-dots" }, svg);
  TM.gBrush = svgEl("g", { class: "tm-brush", visibility: "hidden" }, svg);
  TM.bRect = svgEl("rect", { class: "tm-win", rx: 8 }, TM.gBrush);
  TM.handles = [0, 1].map((k) => {
    const h = svgEl("g", { class: "tm-handle", tabindex: "0", role: "slider", "data-h": k,
      "aria-label": k ? "End of the year window" : "Start of the year window" }, TM.gBrush);
    svgEl("rect", { width: 10, rx: 4, x: -5 }, h);
    svgEl("path", { d: "M-1.5 0v10M1.5 0v10" }, h);
    return h;
  });
  TM.bLabel = svgEl("text", { class: "tm-win-lbl", "text-anchor": "middle" }, TM.gBrush);
  TM.gTicks = svgEl("g", { class: "tm-ticks" }, svg);

  TM.order = ITEMS.slice().sort((a, b) => yearNum(a) - yearNum(b));
  TM.dots = TM.order.map((it) => {
    const g = svgEl("g", { class: "tm-dot", "data-id": it.id }, TM.gDots);
    const c = catColor(it.tags.category);
    svgEl("circle", { class: "halo", fill: c }, g);
    svgEl("circle", { class: "core", fill: c }, g);
    return { it, g, v: yearNum(it), x: 0, y: 0, r: 0 };
  });

  // Legend: subject colours with names (identity is never colour alone) + size key.
  const cats = [...new Set(ITEMS.map((it) => it.tags.category))].sort((a, b) =>
    Object.keys(CAT_COLOR).indexOf(a) - Object.keys(CAT_COLOR).indexOf(b));
  $("#tmLegend").innerHTML = cats.map((c) => `<span><i style="--cc:${catColor(c)}"></i>${esc(c)}</span>`).join("") +
    `<span class="size"><i class="big"></i>Featured photograph</span>`;

  bindTimeMachine(svg);
  TM.built = true;
  tmResize();
  if ("ResizeObserver" in window) new ResizeObserver(() => tmResize()).observe($("#tmPlot"));

  // Entrance: the axis draws itself left → right and the dots arrive in date order.
  if (animate && ScrollTrigger) {
    gsap.set(TM.dots.map((d) => d.g), { scale: 0, opacity: 0 });
    ScrollTrigger.create({ trigger: "#tm", start: "top 85%", once: true, onEnter: () => {
      const len = TM.W;
      gsap.fromTo(TM.axis, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 1.1, ease: "power2.inOut", clearProps: "strokeDasharray,strokeDashoffset" });
      gsap.to(TM.dots.map((d) => d.g), { scale: 1, opacity: 1, duration: 0.5, ease: "back.out(2.4)", stagger: { each: 1.3 / TM.dots.length }, delay: 0.2, clearProps: "opacity" });
    } });
  }
}

/** Swarm layout: each dot takes the slot closest to the centre line that doesn't collide. */
function tmLayout() {
  const mid = (TM.H - TM.axisH) / 2 + 2;
  const placed = [];
  for (const d of TM.dots) {
    d.r = dotR(d.it); d.x = tmX(d.v);
    const near = placed.filter((p) => Math.abs(p.x - d.x) < p.r + d.r + 2);
    let off = 0;
    for (let k = 0; k < 60; k++) {
      off = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 3.2;
      if (!near.some((p) => Math.hypot(p.x - d.x, p.y - (mid + off)) < p.r + d.r + 1.6)) break;
    }
    d.y = mid + off;
    placed.push(d);
  }
  return placed.reduce((m, d) => Math.max(m, Math.abs(d.y - mid) + d.r), 0);
}

function tmResize() {
  if (!TM.built) return;
  const W = Math.round($("#tmPlot").clientWidth);
  if (!W) return;
  TM.W = W;
  // Size the plot for the fully zoomed-out swarm (the tallest it can get).
  const keep = { ...TM.dom };
  TM.dom = { a: TM.full[0], b: TM.full[1] };
  TM.H = 400; const spread = tmLayout();
  TM.H = Math.round(Math.max(W < 520 ? 110 : 132, Math.min(260, spread * 2 + TM.axisH + 26)));
  TM.dom = keep;
  $("#tmSvg").setAttribute("viewBox", `0 0 ${W} ${TM.H}`);
  $("#tmSvg").style.height = TM.H + "px";
  tmDraw();
}

function tmDraw() {
  if (!TM.built || !TM.W) return;
  const { W, H, axisH } = TM;
  const base = H - axisH;
  tmLayout();
  TM.axis.setAttribute("x1", TM.padX); TM.axis.setAttribute("x2", W - TM.padX);
  TM.axis.setAttribute("y1", base); TM.axis.setAttribute("y2", base);
  // Ticks: the finest step that keeps labels ≥ 46 px apart.
  const pxYear = (W - 2 * TM.padX) / (TM.dom.b - TM.dom.a);
  const step = [1, 2, 5, 10, 20, 50].find((s) => s * pxYear >= 46) || 50;
  let ticks = "", grid = "";
  for (let y = Math.ceil(TM.dom.a / step) * step; y <= TM.dom.b; y += step) {
    const x = tmX(y);
    if (x < TM.padX - 1 || x > W - TM.padX + 1) continue;
    const major = y % (step * 2) === 0 || step >= 10;
    grid += `<line x1="${x}" x2="${x}" y1="6" y2="${base}" class="${major ? "maj" : ""}"/>`;
    ticks += `<line x1="${x}" x2="${x}" y1="${base}" y2="${base + 5}"/><text x="${x}" y="${base + 18}" text-anchor="middle">${y}</text>`;
  }
  TM.gGrid.innerHTML = grid;
  TM.gTicks.innerHTML = `<rect class="tm-pan" x="0" y="${base}" width="${W}" height="${axisH}"/>` + ticks;
  for (const d of TM.dots) {
    const [halo, core] = d.g.children;
    const hidden = d.x < TM.padX - 8 || d.x > W - TM.padX + 8;
    d.g.style.display = hidden ? "none" : "";
    halo.setAttribute("cx", d.x); halo.setAttribute("cy", d.y); halo.setAttribute("r", d.r * 2.1);
    core.setAttribute("cx", d.x); core.setAttribute("cy", d.y); core.setAttribute("r", d.r);
  }
  tmDrawBrush();
}

function tmDrawBrush() {
  const b = TM.brush, base = TM.H - TM.axisH;
  const vis = !!b;
  TM.gBrush.setAttribute("visibility", vis ? "visible" : "hidden");
  TM.gShade.style.display = vis ? "" : "none";
  $("#tmClear").hidden = !vis; $("#tmZoomSel").hidden = !vis;
  if (!vis) return;
  const x0 = Math.max(TM.padX - 6, tmX(b[0])), x1 = Math.min(TM.W - TM.padX + 6, tmX(b[1]));
  const w = Math.max(2, x1 - x0);
  Object.entries({ x: x0, y: 4, width: w, height: base - 6 }).forEach(([k, v]) => TM.bRect.setAttribute(k, v));
  TM.shadeL.setAttribute("x", 0); TM.shadeL.setAttribute("width", Math.max(0, x0)); TM.shadeL.setAttribute("height", base);
  TM.shadeR.setAttribute("x", x0 + w); TM.shadeR.setAttribute("width", Math.max(0, TM.W - x0 - w)); TM.shadeR.setAttribute("height", base);
  const hh = Math.min(34, base - 16);
  TM.handles.forEach((h, k) => {
    const x = k ? x0 + w : x0;
    h.setAttribute("transform", `translate(${x},${(base - hh) / 2 + 2})`);
    h.firstChild.setAttribute("height", hh);
    h.lastChild.setAttribute("transform", `translate(0,${hh / 2 - 5})`);
    h.setAttribute("aria-valuemin", TM.full[0]); h.setAttribute("aria-valuemax", TM.full[1]);
    h.setAttribute("aria-valuenow", Math.floor(b[k]));
  });
  const lbl = `${Math.floor(b[0])} – ${Math.floor(b[1])}`;
  TM.bLabel.textContent = lbl;
  TM.bLabel.setAttribute("x", x0 + w / 2);
  TM.bLabel.setAttribute("y", 16);
  TM.bLabel.style.display = w > 70 ? "" : "none";
}

/** Grid filters changed: dim dots that no longer match, refresh the readout. */
function tmUpdate() {
  if (!TM.built) return;
  let inWin = 0;
  for (const d of TM.dots) {
    const ok = matches(d.it, true);
    const inside = !TM.brush || (d.v >= TM.brush[0] && d.v <= TM.brush[1]);
    d.g.classList.toggle("off", !ok);
    d.g.classList.toggle("out", ok && !inside);
    if (ok && inside) inWin++;
  }
  const b = TM.brush;
  $("#tmRead").textContent = b
    ? `${Math.floor(b[0])}–${Math.floor(b[1])} · ${inWin} photograph${inWin === 1 ? "" : "s"} in the window`
    : `${Math.floor(TM.order[0] ? yearNum(TM.order[0]) : 1946)}–${Math.floor(yearNum(TM.order[TM.order.length - 1] || { year: 2022 }))} · ${inWin} photograph${inWin === 1 ? "" : "s"}`;
}

function tmCommit() {
  const b = TM.brush;
  state.y0 = b ? b[0] : null; state.y1 = b ? b[1] : null;
  apply();
}

function tmZoom(a, b, instant = false) {
  const span = Math.max(4, b - a);
  const c = (a + b) / 2;
  a = c - span / 2; b = c + span / 2;
  if (a < TM.full[0]) { b += TM.full[0] - a; a = TM.full[0]; }
  if (b > TM.full[1]) { a -= b - TM.full[1]; b = TM.full[1]; }
  a = Math.max(TM.full[0], a);
  if (TM.zoomTween) TM.zoomTween.kill();
  if (instant || !animate) { TM.dom = { a, b }; tmDraw(); return; }
  TM.zoomTween = gsap.to(TM.dom, { a, b, duration: 0.6, ease: "power3.inOut", onUpdate: tmDraw });
}
const tmSpan = () => TM.dom.b - TM.dom.a;

function tmPeek(d) {
  const peek = $("#tmPeek");
  if (!d) { peek.classList.remove("on"); return; }
  const it = d.it;
  peek.querySelector("b").textContent = it.title;
  peek.querySelector(".tm-peek-t span").textContent = `${fmtDate(it)} · ${it.mission}`;
  const box = peek.querySelector(".tm-peek-img");
  box.setAttribute("style", toneVars(it));
  box.classList.remove("loaded");
  const img = box.querySelector("img");
  img.removeAttribute("src");
  resolveImage(it).then((url) => {
    if (!url || peek.dataset.id !== it.id) return;
    img.onload = () => { if (peek.dataset.id === it.id) box.classList.add("loaded"); };
    img.src = url;
  });
  peek.dataset.id = it.id;
  const pw = 220, plotW = TM.W;
  const x = Math.max(4, Math.min(plotW - pw - 4, d.x - pw / 2));
  peek.style.left = x + "px";
  peek.style.setProperty("--ax", `${Math.max(12, Math.min(pw - 12, d.x - x))}px`);
  peek.style.bottom = (TM.H - d.y + d.r + 10) + "px";
  peek.classList.add("on");
}

function tmSetActive(k) {
  TM.dots.forEach((d) => d.g.classList.remove("active"));
  TM.active = k;
  const d = TM.dots[k];
  if (!d) { tmPeek(null); return; }
  if (d.v < TM.dom.a || d.v > TM.dom.b) tmZoom(d.v - tmSpan() / 2, d.v + tmSpan() / 2, true);
  d.g.classList.add("active");
  tmPeek(d);
}

function bindTimeMachine(svg) {
  const local = (e) => { const r = svg.getBoundingClientRect(); return { x: (e.clientX - r.left) * (TM.W / r.width), y: (e.clientY - r.top) * (TM.H / r.height) }; };
  const dotAt = (e) => { const g = e.target.closest && e.target.closest(".tm-dot"); return g ? TM.dots.find((d) => d.g === g) : null; };

  svg.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const p = local(e), v = tmV(p.x);
    const h = e.target.closest(".tm-handle");
    const base = TM.H - TM.axisH;
    let mode = "new";
    if (h) mode = "h" + h.dataset.h;
    else if (p.y > base) mode = tmSpan() < TM.full[1] - TM.full[0] - 0.01 ? "pan" : "new";
    else if (TM.brush && v >= TM.brush[0] && v <= TM.brush[1] && !dotAt(e)) mode = "move";
    TM.drag = { mode, x0: p.x, v0: v, b0: TM.brush && TM.brush.slice(), dom0: { ...TM.dom }, dot: dotAt(e), moved: false, id: e.pointerId };
    try { svg.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
  });
  svg.addEventListener("pointermove", (e) => {
    const p = local(e);
    const dr = TM.drag;
    if (!dr) {
      const d = dotAt(e);
      if (d) { TM.dots.forEach((x) => x.g.classList.toggle("active", x === d)); tmPeek(d); }
      else if (TM.active < 0) { TM.dots.forEach((x) => x.g.classList.remove("active")); tmPeek(null); }
      return;
    }
    if (!dr.moved && Math.abs(p.x - dr.x0) < 4) return;
    if (!dr.moved) { dr.moved = true; tmPeek(null); svg.classList.add("dragging"); }
    const v = clampV(tmV(p.x));
    if (dr.mode === "new" || (dr.mode === "move" && !dr.b0)) {
      TM.brush = [Math.min(dr.v0, v), Math.max(dr.v0, v)];
    } else if (dr.mode === "move") {
      const w = dr.b0[1] - dr.b0[0];
      let a = dr.b0[0] + (v - clampV(dr.v0));
      a = Math.max(TM.full[0], Math.min(TM.full[1] - w, a));
      TM.brush = [a, a + w];
    } else if (dr.mode === "h0" || dr.mode === "h1") {
      const k = +dr.mode[1];
      const b = dr.b0.slice(); b[k] = v;
      TM.brush = [Math.min(b[0], b[1]), Math.max(b[0], b[1])];
    } else if (dr.mode === "pan") {
      const dv = (p.x - dr.x0) / (TM.W - 2 * TM.padX) * (dr.dom0.b - dr.dom0.a);
      tmZoom(dr.dom0.a - dv, dr.dom0.b - dv, true);
      return;
    }
    tmDrawBrush(); tmUpdate();
  });
  const end = (e) => {
    const dr = TM.drag;
    if (!dr) return;
    TM.drag = null;
    svg.classList.remove("dragging");
    if (!dr.moved) {
      if (dr.dot) { openLightbox(dr.dot.it.id, dr.dot.g.lastChild); return; }
      if (dr.mode === "new" && TM.brush && e.type === "pointerup") { TM.brush = null; tmDrawBrush(); tmCommit(); }
      return;
    }
    if (dr.mode === "pan") return;
    if (TM.brush && TM.brush[1] - TM.brush[0] < 0.5) TM.brush = [TM.brush[0] - 0.5, TM.brush[0] + 0.5]; // at least a year
    tmDrawBrush(); tmCommit();
  };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);
  svg.addEventListener("pointerleave", () => { if (!TM.drag && TM.active < 0) { tmPeek(null); TM.dots.forEach((x) => x.g.classList.remove("active")); } });

  // Ctrl/⌘ + wheel (and trackpad pinch, which arrives as ctrl+wheel) zooms around the pointer;
  // sideways scrolling pans. Plain vertical wheel still scrolls the page.
  svg.addEventListener("wheel", (e) => {
    const p = local(e), v = tmV(p.x);
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const k = Math.exp(e.deltaY * 0.004);
      tmZoom(v - (v - TM.dom.a) * k, v + (TM.dom.b - v) * k, true);
    } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && tmSpan() < TM.full[1] - TM.full[0] - 0.01) {
      e.preventDefault();
      const dv = e.deltaX / TM.W * tmSpan();
      tmZoom(TM.dom.a + dv, TM.dom.b + dv, true);
    }
  }, { passive: false });

  // Keyboard: arrows walk through the photographs in date order, Enter opens one.
  svg.addEventListener("keydown", (e) => {
    if (e.target !== svg) return;
    const n = TM.dots.length;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const dir = e.key === "ArrowRight" ? 1 : -1;
      let k = TM.active;
      for (let s = 0; s < n; s++) { k = (k + dir + n) % n; if (!TM.dots[k].g.classList.contains("off")) break; }
      tmSetActive(k);
    } else if (e.key === "Home" || e.key === "End") { e.preventDefault(); tmSetActive(e.key === "Home" ? 0 : n - 1); }
    else if ((e.key === "Enter" || e.key === " ") && TM.dots[TM.active]) { e.preventDefault(); openLightbox(TM.dots[TM.active].it.id, TM.dots[TM.active].g.lastChild); }
    else if (e.key === "Escape") tmSetActive(-1);
  });
  svg.addEventListener("blur", () => tmSetActive(-1));

  // Handles as sliders: arrows nudge a year (Shift: five years).
  TM.handles.forEach((h, k) => h.addEventListener("keydown", (e) => {
    if (!TM.brush) return;
    const d = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
    if (!d) return;
    e.preventDefault(); e.stopPropagation();
    const b = TM.brush.slice();
    b[k] = clampV(b[k] + d * (e.shiftKey ? 5 : 1));
    if (b[1] - b[0] < 1) return;
    TM.brush = b; tmDrawBrush(); tmCommit();
  }));

  $("#tmZoomIn").addEventListener("click", () => { const c = TM.brush ? (TM.brush[0] + TM.brush[1]) / 2 : (TM.dom.a + TM.dom.b) / 2; tmZoom(c - tmSpan() / 4, c + tmSpan() / 4); });
  $("#tmZoomOut").addEventListener("click", () => { const c = (TM.dom.a + TM.dom.b) / 2; tmZoom(c - tmSpan(), c + tmSpan()); });
  $("#tmFit").addEventListener("click", () => tmZoom(TM.full[0], TM.full[1]));
  $("#tmZoomSel").addEventListener("click", () => { if (TM.brush) { const pad = Math.max(1, (TM.brush[1] - TM.brush[0]) * 0.15); tmZoom(TM.brush[0] - pad, TM.brush[1] + pad); } });
  $("#tmClear").addEventListener("click", () => { TM.brush = null; tmDrawBrush(); tmCommit(); });
}

/* ------------------------------------------------------------------ cinema (slideshow)
 * Full-screen slideshow of whatever the grid currently shows, in grid order. Each slide
 * drifts with a slow Ken Burns push; the thin bar is the slide timer. ←/→ browse,
 * Space pauses, Esc closes. Reduced motion keeps the slideshow but drops the drift.
 */
const CIN = { list: [], i: 0, playing: true, layers: [], prog: null, kb: null, dur: 7, lastFocus: null, token: 0 };
const cinema = $("#cinema");
const cinemaOpen = () => cinema.classList.contains("open");
const KB_MOVES = [
  [{ scale: 1.04, xPercent: -2, yPercent: 1 }, { scale: 1.18, xPercent: 2, yPercent: -1.5 }],
  [{ scale: 1.2, xPercent: 2, yPercent: -1 }, { scale: 1.05, xPercent: -1.5, yPercent: 1.5 }],
  [{ scale: 1.06, xPercent: 1, yPercent: 2 }, { scale: 1.2, xPercent: -2, yPercent: -2 }],
  [{ scale: 1.18, xPercent: -1, yPercent: -2 }, { scale: 1.04, xPercent: 1.5, yPercent: 1 }]
];

function openCinema(startId) {
  CIN.list = visibleItems();
  if (!CIN.list.length) return;
  CIN.i = Math.max(0, CIN.list.findIndex((it) => it.id === startId));
  CIN.lastFocus = document.activeElement;
  if (!CIN.layers.length) {
    for (let k = 0; k < 2; k++) {
      const l = document.createElement("div");
      l.className = "cin-layer";
      l.innerHTML = '<span class="g-ph"></span><div class="cin-img"></div>';
      $("#cinStage").appendChild(l);
      CIN.layers.push(l);
    }
  }
  cinema.classList.add("open");
  cinema.setAttribute("aria-hidden", "false");
  document.documentElement.style.overflow = "hidden";
  CIN.playing = true;
  cinSyncPlay();
  if (animate) gsap.fromTo(cinema, { opacity: 0 }, { opacity: 1, duration: 0.5, clearProps: "opacity" });
  cinShow(CIN.i, 0);
  $("#cinClose").focus({ preventScroll: true });
}
function closeCinema() {
  if (!cinemaOpen()) return;
  CIN.token++;
  if (CIN.prog) CIN.prog.kill();
  if (CIN.kb) CIN.kb.kill();
  cinema.classList.remove("open");
  cinema.setAttribute("aria-hidden", "true");
  document.documentElement.style.overflow = "";
  if (CIN.lastFocus && CIN.lastFocus.focus) CIN.lastFocus.focus({ preventScroll: true });
}
function cinSyncPlay() {
  const b = $("#cinPlay");
  b.textContent = CIN.playing ? "❚❚" : "▶";
  b.setAttribute("aria-label", CIN.playing ? "Pause slideshow" : "Play slideshow");
  cinema.classList.toggle("paused", !CIN.playing);
}
function cinToggle() {
  CIN.playing = !CIN.playing;
  cinSyncPlay();
  [CIN.prog, CIN.kb].forEach((t) => t && (CIN.playing ? t.play() : t.pause()));
}
function cinStep(d) { cinShow((CIN.i + d + CIN.list.length) % CIN.list.length, d); }
function firstSentences(text, max = 230) {
  const parts = String(text).match(/[^.!?]+[.!?]+(\s|$)/g) || [text];
  let out = "";
  for (const s of parts) { if ((out + s).length > max && out) break; out += s; }
  return out.trim();
}
function cinShow(k, dir) {
  const it = CIN.list[k];
  CIN.i = k;
  const token = ++CIN.token;
  const prev = CIN.layers.find((l) => l.classList.contains("on"));
  const next = CIN.layers.find((l) => l !== prev);
  const img = next.querySelector(".cin-img");
  const ph = next.querySelector(".g-ph");
  ph.setAttribute("style", toneVars(it));
  ph.innerHTML = `${glyph(it)}<span class="g-ph-state">Loading</span>`;
  ph.style.opacity = "1";
  img.style.backgroundImage = "";
  resolveImage(it).then((url) => {
    if (token !== CIN.token) return;
    if (!url) { ph.classList.add("failed"); ph.querySelector(".g-ph-state").textContent = "Offline · image unavailable"; return; }
    const pre = new Image();
    pre.referrerPolicy = "no-referrer";
    pre.onload = () => {
      if (token !== CIN.token) return;
      img.style.backgroundImage = `url("${url.replace(/"/g, "%22")}")`;
      gsap ? gsap.to(ph, { opacity: 0, duration: 0.9 }) : (ph.style.opacity = "0");
    };
    pre.src = url;
  });
  next.classList.add("on"); if (prev) prev.classList.remove("on");
  if (gsap) {
    const fade = reduce ? 0.2 : 1.2;
    gsap.fromTo(next, { opacity: 0 }, { opacity: 1, duration: fade, ease: "power2.inOut" });
    if (prev) gsap.to(prev, { opacity: 0, duration: fade, ease: "power2.inOut" });
    if (CIN.kb) CIN.kb.kill();
    const mv = KB_MOVES[k % KB_MOVES.length];
    if (!reduce) CIN.kb = gsap.fromTo(next.children, mv[0], { ...mv[1], duration: CIN.dur + 1.6, ease: "none", paused: !CIN.playing });
    else gsap.set(next.children, { scale: 1.02, xPercent: 0, yPercent: 0 });
    // Caption: date and mission, title, then the story's first lines.
    $("#cinMeta").textContent = `${fmtDate(it)} · ${it.mission} · ${it.credit}`;
    $("#cinTitle").textContent = it.title;
    $("#cinStory").textContent = firstSentences(it.story);
    if (animate) gsap.fromTo([".cin-meta", ".cin-title", ".cin-story"], { y: 18 * (dir || 1), autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.7, stagger: 0.08, delay: 0.25, ease: "power3.out" });
    if (CIN.prog) CIN.prog.kill();
    CIN.prog = gsap.fromTo("#cinProg", { scaleX: 0 }, { scaleX: 1, duration: CIN.dur, ease: "none", paused: !CIN.playing, onComplete: () => cinStep(1) });
  } else {
    next.style.opacity = "1"; if (prev) prev.style.opacity = "0";
    $("#cinTitle").textContent = it.title;
  }
  $("#cinPos").textContent = `${k + 1} / ${CIN.list.length}`;
  [1, -1].forEach((d) => resolveImage(CIN.list[(k + d + CIN.list.length) % CIN.list.length]));
}
function bindCinema() {
  $("#cinemaOpen").addEventListener("click", () => openCinema());
  $("#cinClose").addEventListener("click", closeCinema);
  $("#cinPrev").addEventListener("click", () => cinStep(-1));
  $("#cinNext").addEventListener("click", () => cinStep(1));
  $("#cinPlay").addEventListener("click", cinToggle);
  $("#cinStage").addEventListener("click", cinToggle);
  document.addEventListener("keydown", (e) => {
    if (!cinemaOpen()) return;
    if (e.key === "Escape") { e.preventDefault(); closeCinema(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); cinStep(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); cinStep(-1); }
    else if (e.key === " " || e.key === "Spacebar") {
      const ownButton = cinema.contains(e.target) && e.target.tagName === "BUTTON" && e.target.id !== "cinClose";
      if (!ownButton) { e.preventDefault(); cinToggle(); }
    }
    else if (e.key === "Tab") {
      const f = [...cinema.querySelectorAll("button")];
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden && cinemaOpen() && CIN.playing) cinToggle(); });
  let x0 = null;
  cinema.addEventListener("pointerdown", (e) => { x0 = e.clientX; });
  cinema.addEventListener("pointerup", (e) => { if (x0 == null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 50) cinStep(dx < 0 ? 1 : -1); });
}

/* ------------------------------------------------------------------ APOD strip */
async function loadAPOD() {
  const section = $("#apod");
  try {
    const data = await getJSON("https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY&count=6&thumbs=true", 9000);
    const pics = (Array.isArray(data) ? data : [])
      .map((d) => ({ ...d, src: d.media_type === "image" ? d.url : d.thumbnail_url }))
      .filter((d) => d.src && /^https?:/.test(d.src) && d.date);
    if (!pics.length) return;
    const strip = $("#apodStrip");
    strip.innerHTML = pics.map((d) => {
      const [y, m, dd] = d.date.split("-");
      const href = `https://apod.nasa.gov/apod/ap${y.slice(2)}${m}${dd}.html`;
      const by = d.copyright ? `© ${String(d.copyright).replace(/\s+/g, " ").trim()}` : "No copyright listed";
      return `<a class="apod-card" href="${href}" target="_blank" rel="noopener">
        <div class="m"><img src="${esc(d.src.replace(/^http:/, "https:"))}" alt="${esc(d.title)}" loading="lazy" referrerpolicy="no-referrer"></div>
        <div class="t"><h3>${esc(d.title)}</h3><p>${esc(fmtDate({ date: d.date }))} · ${esc(by)}${d.media_type === "video" ? " · video" : ""}</p></div></a>`;
    }).join("");
    strip.querySelectorAll("img").forEach((img) => {
      img.addEventListener("error", () => {
        img.closest(".apod-card").remove();
        if (!strip.children.length) section.hidden = true;
      });
    });
    section.hidden = false;
    if (ScrollTrigger) ScrollTrigger.refresh();
  } catch (e) {
    section.hidden = true; // rate-limited DEMO_KEY, offline, or blocked: just leave it out
  }
}

/* The hero numbers follow the data, so new photographs (e.g. the Sun set) are counted. */
function heroNumbers() {
  const n = ITEMS.length;
  const years = ITEMS.map((it) => +it.year).filter(Boolean);
  const stat = document.querySelector('.gh-stats [data-count="50"]');
  if (stat && n !== 50) { // swap the node so the shared ticker (already counting to 50) can't overwrite it
    const fresh = stat.cloneNode(); fresh.textContent = n; fresh.dataset.count = n; stat.replaceWith(fresh);
    const line = document.querySelector(".gh-copy .gh-line");
    if (line) line.textContent = `${n} photographs`;
  }
  const eb = document.querySelector(".gh-copy .eyebrow");
  if (eb && years.length) eb.textContent = `Gallery · ${Math.min(...years)} → ${Math.max(...years)}`;
}

/* ------------------------------------------------------------------ boot */
async function boot() {
  const [data, local] = await Promise.all([
    getJSON("data/gallery.json"),
    getJSON("data/gallery.local.json", 3000).catch(() => null)
  ]);
  LOCAL = (local && local.images) || {};
  ITEMS = data.items.map((it) => ({ ...it, tags: { era: "", category: "", agency: [], ...it.tags } }));
  ITEMS.forEach((it) => (BY_ID[it.id] = it));
  (data.featured || []).forEach((id) => FEATURED.add(id));
  heroNumbers();

  buildGrid();
  buildFilters();
  bindLightbox();
  bindCinema();
  buildHero(data.featured || []);
  buildTimeMachine();
  apply(true);
  entrance();

  if ("ResizeObserver" in window) new ResizeObserver(relayout).observe(grid);
  else addEventListener("resize", relayout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);

  const m = location.hash.match(/^#photo=([\w-]+)/);
  if (m && BY_ID[m[1]]) openLightbox(m[1]);

  loadAPOD();
}

boot().catch((err) => {
  console.error("Gallery failed to load", err);
  grid.innerHTML = '<p class="muted">The gallery data could not be loaded. If you opened this file directly, serve the site folder instead: <code>python3 -m http.server 8000 --directory site</code>.</p>';
});
