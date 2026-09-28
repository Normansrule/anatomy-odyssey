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
function resolveImage(item) {
  if (resolved.has(item.id)) return resolved.get(item.id);
  const p = (async () => {
    const list = [LOCAL[item.id], item.image].concat(item.alt || []).filter(Boolean);
    for (const u of list) {
      try { return await probe(u); } catch (e) { /* try the next source */ }
    }
    if (item.query) return await nasaSearch(item.query);
    return null;
  })().catch(() => null);
  resolved.set(item.id, p);
  return p;
}

/* Line-art subject glyphs for the placeholder state (original drawings). */
const GLYPH = {
  "Earth": '<circle cx="50" cy="50" r="34"/><ellipse cx="50" cy="50" rx="14" ry="34"/><path d="M16 50h68M22 32h56M22 68h56"/>',
  "Moon": '<path d="M62 16a36 36 0 1 0 22 50 30 30 0 0 1-22-50z"/><circle cx="44" cy="56" r="5"/><circle cx="36" cy="38" r="3"/><circle cx="56" cy="74" r="3"/>',
  "Solar System": '<circle cx="50" cy="50" r="22"/><ellipse cx="50" cy="50" rx="44" ry="12" transform="rotate(-18 50 50)"/><circle cx="86" cy="22" r="3"/>',
  "Deep sky": '<path d="M50 50c0-8 10-12 16-6s2 20-12 22-26-10-22-26 24-26 40-16"/><path d="M50 50c0 8-10 12-16 6s-2-20 12-22 26 10 22 26-24 26-40 16"/><circle cx="50" cy="50" r="3"/>',
  "Spaceflight": '<path d="M50 12c12 10 16 26 14 44H36c-2-18 2-34 14-44z"/><circle cx="50" cy="36" r="5"/><path d="M36 56l-10 14h12M64 56l10 14H62M44 62l-2 16M50 62v22M56 62l2 16"/>'
};
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
const state = { era: "all", category: "all", agency: "all", q: "", sort: "asc" };

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
    if (f) openLightbox(f.closest(".g-tile").dataset.id);
  });
  grid.addEventListener("pointermove", (e) => {
    const f = e.target.closest(".g-frame");
    if (!f) return;
    const r = f.getBoundingClientRect();
    f.style.setProperty("--mx", `${e.clientX - r.left}px`);
    f.style.setProperty("--my", `${e.clientY - r.top}px`);
  });
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
      values.map((v) => `<button type="button" class="fchip" data-g="${g.key}" data-v="${esc(v)}" aria-pressed="false">${esc(v)}<span class="n">${counts[v]}</span></button>`).join("") +
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

function matches(it) {
  for (const g of GROUPS) if (state[g.key] !== "all" && !g.get(it).includes(state[g.key])) return false;
  if (!state.q) return true;
  const hay = [it.title, it.mission, it.instrument, it.credit, it.story, it.year, it.tags.era, it.tags.category, it.tags.agency.join(" ")].join(" ").toLowerCase();
  return state.q.split(/\s+/).every((w) => hay.includes(w));
}
function ordered() {
  const arr = ITEMS.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.year - b.year);
  return state.sort === "desc" ? arr.reverse() : arr;
}
function visibleItems() { return ordered().filter(matches); }

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
  $("#count").textContent = `${n} photograph${n === 1 ? "" : "s"}`;
  $("#empty").hidden = n > 0;
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

function openLightbox(id) {
  lbView.list = visibleItems();
  if (!lbView.list.some((it) => it.id === id)) lbView.list = ordered();
  lbView.i = lbView.list.findIndex((it) => it.id === id);
  if (lbView.i < 0) return;
  lbView.lastFocus = document.activeElement;
  lb.classList.add("open");
  lb.setAttribute("aria-hidden", "false");
  document.documentElement.style.overflow = "hidden";
  renderLightbox();
  $("#lbClose").focus({ preventScroll: true });
  if (animate) gsap.fromTo(".gal-lb-body", { opacity: 0, scale: 0.98 }, { opacity: 1, scale: 1, duration: 0.45, ease: "power2.out" });
}
function closeLightbox() {
  if (!lb.classList.contains("open")) return;
  lb.classList.remove("open");
  lb.setAttribute("aria-hidden", "true");
  document.documentElement.style.overflow = "";
  history.replaceState(null, "", location.pathname + location.search);
  if (lbView.lastFocus && lbView.lastFocus.focus) lbView.lastFocus.focus({ preventScroll: true });
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
      closeLightbox();
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

/* ------------------------------------------------------------------ boot */
async function boot() {
  const [data, local] = await Promise.all([
    getJSON("data/gallery.json"),
    getJSON("data/gallery.local.json", 3000).catch(() => null)
  ]);
  LOCAL = (local && local.images) || {};
  ITEMS = data.items.map((it) => ({ ...it, tags: { era: "", category: "", agency: [], ...it.tags } }));
  ITEMS.forEach((it) => (BY_ID[it.id] = it));

  buildGrid();
  buildFilters();
  bindLightbox();
  buildHero(data.featured || []);
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
