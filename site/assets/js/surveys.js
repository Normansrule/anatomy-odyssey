/* Sky Surveys (surveys.html)
 *
 * A full-screen Aladin Lite v3 view (CDS, Strasbourg; vendored in vendor/aladin-lite, LGPL-3.0) with a
 * wavelength rail that cross-fades between twelve all-sky Hierarchical Progressive Surveys (HiPS),
 * a guided tour, a two-view "wipe" comparison, and our own constellation / Messier / star-name overlays.
 *
 * Layer model: Aladin keeps an ordered stack of named image layers. We use two, "wl-a" (bottom) and
 * "wl-b" (top), and only ever animate the opacity of the top one. To go to a new band we load it into
 * whichever layer is currently hidden and fade toward it ("ping-pong"), so nothing on screen is ever
 * swapped abruptly. The continuous slider shows mix(band i, band i+1, t) by putting the two
 * neighbours into the two layers, choosing the assignment that reloads the fewest layers.
 *
 * Survey tiles and name resolution (Sesame/SIMBAD) are streamed from CDS servers at run time. If they
 * cannot be reached we say so, and show a local Milky Way map (data/sky/milkyway-galactic.png, baked
 * from d3-celestial, BSD-3) placed on the sphere with a World Coordinate System (WCS) header instead.
 */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = !!(window.Codex && Codex.reducedMotion);
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ------------------------------------------------------------------ state --- */
const S = {
  A: null,              // the Aladin Lite module
  al: null,             // main view
  alB: null,            // compare view (lazy)
  online: null,         // null = checking, true, false
  bands: [], tour: [],
  slot: { a: null, b: null }, // band index loaded in each layer
  layer: { a: null, b: null },
  alpha: 0,             // opacity of wl-b
  cur: 7,               // dominant band index
  fade: null,           // running fade
  bad: new Set(),       // bands whose HiPS failed
  proj: "AIT", frame: "galactic",
  ov: { grid: false, lines: true, names: true, messier: false, stars: true, targets: true },
  overlays: new Map(),  // aladin instance -> handles
  cmpOn: false, cmpBand: 2, wipe: 50, master: "a",
  tourOn: false, tourIdx: -1, tourTimer: 0, tourToken: 0,
  starBucket: -1
};

/* -------------------------------------------------------------- utilities --- */
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let toastT = 0;
function toast(msg, ms = 2600) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), ms);
}
function tween(dur, fn, ease = e => e < .5 ? 2 * e * e : 1 - Math.pow(-2 * e + 2, 2) / 2) {
  let stop = false; const t0 = performance.now();
  const p = new Promise(res => {
    (function step(now) {
      if (stop) return res(false);
      const k = dur <= 0 ? 1 : Math.min(1, (now - t0) / dur);
      fn(ease(k), k);
      if (k < 1) requestAnimationFrame(step); else res(true);
    })(t0);
  });
  p.cancel = () => { stop = true; };
  return p;
}
function hms(ra) { ra = ((ra % 360) + 360) % 360 / 15; const h = Math.floor(ra), m = Math.floor((ra - h) * 60), s = ((ra - h) * 60 - m) * 60; return `${h}h ${String(m).padStart(2, "0")}m ${s.toFixed(1).padStart(4, "0")}s`; }
function dms(d) { const sg = d < 0 ? "−" : "+"; d = Math.abs(d); const D = Math.floor(d), m = Math.floor((d - D) * 60), s = Math.round(((d - D) * 60 - m) * 60); return `${sg}${D}° ${String(m).padStart(2, "0")}′ ${String(Math.min(s, 59)).padStart(2, "0")}″`; }
function fmtFov(f) { return f >= 1 ? f.toFixed(f >= 10 ? 0 : 1) + "°" : f * 60 >= 1 ? (f * 60).toFixed(1) + "′" : (f * 3600).toFixed(0) + "″"; }

// ICRS (J2000) -> Galactic, rotation matrix from the Hipparcos catalogue introduction (ESA 1997, vol. 1, §1.5.3)
const GAL = [[-0.0548755604, -0.8734370902, -0.4838350155], [0.4941094279, -0.4448296300, 0.7469822445], [-0.8676661490, -0.1980763734, 0.4559837762]];
function toGal(ra, dec) {
  const a = ra * D2R, d = dec * D2R, v = [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
  const g = GAL.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
  let l = Math.atan2(g[1], g[0]) * R2D; if (l < 0) l += 360; if (l >= 359.95) l = 0;
  return [l, Math.asin(clamp(g[2], -1, 1)) * R2D];
}
function angDist(ra1, de1, ra2, de2) {
  const a = Math.sin((de2 - de1) * D2R / 2) ** 2 + Math.cos(de1 * D2R) * Math.cos(de2 * D2R) * Math.sin((ra2 - ra1) * D2R / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(a))) * R2D;
}

/* ---------------------------------------------------------------- boot ------- */
boot().catch(e => {
  console.error(e);
  $("#loadTxt").textContent = "Could not start: " + (e && e.message || e);
});

async function boot() {
  const getJ = u => fetch(u).then(r => { if (!r.ok) throw new Error(u + " " + r.status); return r.json(); });
  const [data, cons, messier, names, stars] = await Promise.all([
    getJ("data/surveys.json"), getJ("data/sky/constellations.json"), getJ("data/sky/messier.json"),
    getJ("data/sky/starnames.json"), getJ("data/sky/stars.json")]);
  S.bands = data.bands; S.tour = data.tour;
  S.sky = { cons, messier: messier.objects, names: names.names, stars: stars.stars };
  S.cmpBand = S.bands.findIndex(b => b.key === "submm");
  buildRail(); buildTour(); buildPanel(); buildSpectrum();
  selectBandUI(S.cur, null, 0);
  observeRail();

  // Aladin Lite silently rethrows HiPS load failures as unhandled promise rejections; we handle them ourselves.
  addEventListener("unhandledrejection", e => {
    const r = String(e.reason && (e.reason.message || e.reason));
    if (/HiPS|hips|alasky|CDS ID|Aladin|starting url|properties/i.test(r)) e.preventDefault();
  });

  const net = probeNet();                       // runs while the 2.4 MB module downloads
  let A;
  try {
    A = (await import("../../vendor/aladin-lite/aladin.js")).default;
    await A.init;
  } catch (e) {
    $("#loading").classList.add("done");
    showOffline("gl", String(e && e.message || e));
    net.then(ok => setNet(ok));
    return;
  }
  S.A = A;
  S.al = makeAladin("#viewA");
  wireView(S.al, "a");
  addOverlays(S.al);
  $("#loading").classList.add("done");
  const ok = await net;
  setNet(ok);
  if (ok) loadInitial(); else showLocalSky(S.al);
  updateReadouts();
}

/* ------------------------------------------------------------ networking --- */
async function probeNet() {
  // A tiny text file from the CDS HiPS server (and its mirror). If neither answers, tiles will not either.
  const urls = ["https://alasky.cds.unistra.fr/MellingerRGB/properties", "https://alaskybis.cds.unistra.fr/MellingerRGB/properties"];
  for (const u of urls) {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 7000);
    try { const r = await fetch(u, { signal: c.signal, cache: "no-store" }); clearTimeout(t); if (r.ok) return true; }
    catch (e) { clearTimeout(t); }
  }
  return false;
}
function setNet(ok) {
  S.online = ok;
  $("#netDot").className = "sv-dot " + (ok ? "on" : "off");
  $("#netTxt").textContent = ok ? "Sky surveys · live from CDS" : "Sky surveys · offline preview";
  const nt = $("#netTxt");
  if (ok) { nt.removeAttribute("role"); nt.removeAttribute("tabindex"); nt.title = ""; }
  else { nt.setAttribute("role", "button"); nt.tabIndex = 0; nt.title = "Why am I offline?"; }
  if (ok) $("#offline").hidden = true;
  else {
    showOffline("net");
    if (innerWidth <= 820) setTimeout(() => ($("#offline").hidden = true), 9000); // phones: get out of the way, the eyebrow keeps the status
  }
  queueReadouts();
  selectBandUI(S.cur, null, 0);
}
function showOffline(kind, detail) {
  const box = $("#offline"); box.hidden = false;
  if (kind === "gl") {
    $("#offKicker").textContent = "WebGL 2 needed";
    $("#offTitle").textContent = "Aladin Lite could not start here";
    $("#offText").textContent = "The sky atlas renders with WebGL 2 and WebAssembly. Turn on hardware acceleration, or try a current Chrome, Edge, Firefox or Safari. You can still read about every survey and tour target below." + (detail ? " (" + detail + ")" : "");
    $("#retryBtn").hidden = true;
  }
}

/* ------------------------------------------------------------ Aladin views --- */
function makeAladin(sel, extra = {}) {
  return S.A.aladin(sel, Object.assign({
    survey: [], target: "0 +0", fov: innerWidth <= 820 ? 150 : 250, projection: S.proj, cooFrame: S.frame,
    log: false, samp: false, inertia: true, backgroundColor: "rgb(2, 3, 9)",
    showFrame: false, showLayersControl: false, showZoomControl: false, showFullscreenControl: false,
    showProjectionControl: false, showSettingsControl: false, showShareControl: false, showSimbadPointerControl: false,
    showCooGridControl: false, showStatusBar: false, showReticle: false, showCooLocation: false, showFov: false,
    showContextMenu: false, showColorPickerControl: false,
    gridOptions: { enabled: S.ov.grid, color: "rgb(124, 200, 255)", opacity: 0.32, showLabels: true, labelSize: 11, thickness: 1 }
  }, extra));
}

function wireView(al, id) {
  const el = id === "a" ? $("#viewA") : $("#viewB");
  ["pointerdown", "wheel", "touchstart"].forEach(ev => el.addEventListener(ev, () => { S.master = id; if (S.tourOn && ev !== "wheel") stopTour("Tour paused: you took the controls"); }, { capture: true, passive: true }));
  if (id !== "a") return;
  el.tabIndex = 0;
  el.addEventListener("keydown", e => {
    const [w, h] = al.getSize(); let p = null;
    if (e.key === "ArrowLeft") p = al.pix2world(w * .4, h / 2, "icrs");
    else if (e.key === "ArrowRight") p = al.pix2world(w * .6, h / 2, "icrs");
    else if (e.key === "ArrowUp") p = al.pix2world(w / 2, h * .4, "icrs");
    else if (e.key === "ArrowDown") p = al.pix2world(w / 2, h * .6, "icrs");
    else if (e.key === "+" || e.key === "=") { al.setFoV(al.getFov()[0] / 1.3); e.preventDefault(); }
    else if (e.key === "-" || e.key === "_") { al.setFoV(al.getFov()[0] * 1.3); e.preventDefault(); }
    if (p && isFinite(p[0])) { al.gotoRaDec(p[0], p[1]); e.preventDefault(); }
  });
  al.on("positionChanged", queueReadouts);
  al.on("zoomChanged", () => { queueReadouts(); lod(); });
  al.on("mouseMove", m => {
    if (m.x == null) return;
    const p = al.pix2world(m.x, m.y, "icrs");
    $("#cursorTxt").textContent = p && isFinite(p[0]) ? `Pointer: RA ${hms(p[0])}, Dec ${dms(p[1])}` : "Pointer is off the sky.";
  });
  al.on("objectClicked", o => { if (o && o.data) onObject(o.data); });
}

let rq = 0;
function queueReadouts() { if (!rq) rq = requestAnimationFrame(() => { rq = 0; updateReadouts(); }); }
function updateReadouts() {
  const al = S.al; if (!al) return;
  const [ra, dec] = al.getRaDec(); const fov = al.getFov()[0]; const [l, b] = toGal(ra, dec);
  $("#rRa").textContent = hms(ra); $("#rDec").textContent = dms(dec);
  $("#rGal").textContent = `${l.toFixed(1)}°, ${b >= 0 ? "+" : "−"}${Math.abs(b).toFixed(1)}°`;
  $("#rFov").textContent = fmtFov(fov);
  $("#empty").hidden = !(S.online === false && fov < 12);
  // HEALPix pixel size at order N is sqrt(pi/3)/2^N rad = 58.63°/2^N (Gorski et al. 2005, ApJ 622, 759).
  // A HiPS tile at level k holds 512 x 512 pixels of order k + 9, so the level needed for one tile pixel per screen pixel is:
  const pix = fov / Math.max(1, al.getSize()[0]);
  const k = Math.max(0, Math.ceil(Math.log2(58.63 / pix)) - 9);
  $("#rHips").innerHTML = `HiPS level ${k} <small>· ${(12 * 4 ** k).toLocaleString("en-US")} tiles cover the sky</small>`;
}

/* -------------------------------------------------------- band layers ----- */
function loadInitial() {
  S.slot.a = S.slot.b = null; S.alpha = 0;
  setSlot("a", S.cur);
}

// Put band i into layer slot "a" or "b" of the main view. Returns a promise for when its properties are in.
function setSlot(slot, i, al = S.al, name = "wl-" + slot) {
  const band = S.bands[i];
  if (al === S.al) { S.slot[slot] = i; }
  let layer;
  try { layer = al.setOverlayImageLayer(band.hips, name); }
  catch (e) { return Promise.reject(e); }
  if (band.options) layer.setOptions(Object.assign({}, band.options));
  if (al === S.al) { layer.setOpacity(slot === "b" ? S.alpha : 1); S.layer[slot] = layer; }
  setState(i, "load");
  return layer.query.then(() => { S.bad.delete(i); setState(i, "ok"); return layer; }).catch(err => {
    if (band.fallback && band.hips !== band.fallback) {           // try the next identifier once
      band.hips = band.fallback; delete band.fallback;
      return setSlot(slot, i, al, name);
    }
    if (al === S.al && S.slot[slot] === i) S.slot[slot] = null;
    S.bad.add(i); setState(i, "err");
    $$(".sv-band")[i].classList.add("bad");
    if (S.online) toast(`${band.short}: survey server did not answer`);
    throw err;
  });
}
function setState(i, st) {
  if (i !== S.cur) return;
  const el = $("#nowState");
  el.className = "sv-state " + (st || "");
  el.textContent = S.online === false ? "offline" : st === "load" ? "loading tiles" : st === "err" ? "unavailable" : st === "ok" ? "streaming" : "";
}
function applyAlpha() {
  if (S.layer.b) S.layer.b.setOpacity(S.alpha);
  if (S.layer.a) S.layer.a.setOpacity(1);
}

// Fade to band i (buttons, keyboard, tour)
async function goBand(i, { dur = 1100, fromTour = false } = {}) {
  i = clamp(i, 0, S.bands.length - 1);
  if (!fromTour && S.tourOn) { /* a manual band change during the tour is fine; keep flying */ }
  const prev = S.cur;
  selectBandUI(i, null, dur);
  if (!S.al || !S.online) { if (S.online === false && !fromTour) toast("Survey tiles need a connection to CDS"); return; }
  if (S.fade) S.fade.cancel();
  // Which slot is visible? Load the target into the other one (or reuse it), then fade.
  const toB = S.alpha < 0.5;
  const slot = toB ? "b" : "a";
  if (S.slot[toB ? "a" : "b"] === i) { // already the visible layer: just settle
    S.fade = tween(dur * .5, e => { S.alpha = S.alpha + ((toB ? 0 : 1) - S.alpha) * e; applyAlpha(); });
    return;
  }
  if (S.slot[slot] !== i) {
    try { await setSlot(slot, i); } catch (e) { selectBandUI(prev, null, 300); return; }
    await sleep(reduce ? 0 : 350);                              // give the first tiles a moment
    if (S.cur !== i) return;                                    // user moved on meanwhile
  }
  const a0 = S.alpha, a1 = toB ? 1 : 0;
  S.fade = tween(reduce ? 0 : dur, e => { S.alpha = a0 + (a1 - a0) * e; applyAlpha(); });
  updateCompareTags();
}

// Continuous slider: x in [0, n-1] shows mix(floor x, ceil x)
let blendBusy = 0;
function blendTo(x) {
  const n = S.bands.length; x = clamp(x, 0, n - 1);
  const lo = Math.floor(x), hi = Math.min(n - 1, lo + 1), t = x - lo;
  const dom = t < 0.5 ? lo : hi;
  selectBandUI(dom, t > 0.02 && t < 0.98 ? (dom === lo ? hi : lo) : null, 0, x);
  if (!S.al || !S.online) return;
  if (S.fade) S.fade.cancel();
  const costA = (S.slot.a !== lo) + (S.slot.b !== hi), costB = (S.slot.a !== hi) + (S.slot.b !== lo);
  let wantA, wantB, alpha;
  if (costA <= costB) { wantA = lo; wantB = hi; alpha = t; } else { wantA = hi; wantB = lo; alpha = 1 - t; }
  if (t === 0) { if (S.slot.a === lo) { wantB = S.slot.b; alpha = 0; } else if (S.slot.b === lo) { wantA = S.slot.a; alpha = 1; } }
  const jobs = [];
  if (S.slot.a !== wantA && wantA != null) jobs.push(setSlot("a", wantA).catch(() => {}));
  if (S.slot.b !== wantB && wantB != null) jobs.push(setSlot("b", wantB).catch(() => {}));
  S.alpha = alpha; applyAlpha();
  if (jobs.length) { blendBusy++; Promise.all(jobs).finally(() => blendBusy--); }
  updateCompareTags();
}

/* ------------------------------------------------------------ rail UI ------ */
function buildRail() {
  const box = $("#bands");
  box.innerHTML = S.bands.map((b, i) =>
    `<button type="button" class="sv-band" role="radio" aria-checked="false" data-i="${i}" style="--c:${b.color}" title="${esc(b.name)} · ${esc(b.lambda)}">
      <i></i><b>${esc(b.short)}</b><small>${esc(b.tag)}</small></button>`).join("");
  box.addEventListener("click", e => { const b = e.target.closest(".sv-band"); if (b) goBand(+b.dataset.i); });
  box.addEventListener("keydown", e => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault(); e.stopPropagation();
    const i = clamp(S.cur + (e.key === "ArrowRight" ? 1 : -1), 0, S.bands.length - 1);
    goBand(i); $$(".sv-band")[i].focus();
  });
  const g = $("#blend"); g.max = String(S.bands.length - 1);
  $("#grad").style.background = `linear-gradient(90deg, ${S.bands.map((b, i) => `${b.color} ${(i / (S.bands.length - 1) * 100).toFixed(1)}%`).join(", ")})`;
  g.addEventListener("input", () => blendTo(+g.value));
  $("#moreBtn").addEventListener("click", () => {
    const m = $("#nowMore"), open = m.hidden; m.hidden = !open;
    $("#moreBtn").setAttribute("aria-expanded", String(open));
  });
}

let sliderTw = null;
function selectBandUI(i, mix, dur = 0, x = null) {
  const b = S.bands[i]; if (!b) return;
  const changed = S.cur !== i; S.cur = i;
  $$(".sv-band").forEach((el, k) => {
    el.setAttribute("aria-checked", String(k === i));
    el.tabIndex = k === i ? 0 : -1;
    el.classList.toggle("mix", k === mix);
    el.classList.toggle("bad", S.bad.has(k));
  });
  const sw = $("#nowSw"); sw.style.setProperty("--c", b.color); sw.classList.toggle("rainbow", b.key === "visible" || b.key === "optical");
  $("#nowName").textContent = b.short + " · " + b.name;
  $("#nowLam").textContent = b.lambda + (b.freq ? " · " + b.freq : "");
  $("#nowPlat").textContent = b.platform === "space" ? "from space" : "from the ground";
  $("#nowInst").textContent = b.instrument + " · " + b.year;
  $("#nowMore").textContent = b.reveals;
  const g = $("#blend");
  g.style.setProperty("--thumb", b.color);
  g.setAttribute("aria-valuetext", b.short + (mix != null ? " blended with " + S.bands[mix].short : ""));
  if (x == null) {
    if (sliderTw) sliderTw.cancel();
    const v0 = +g.value, v1 = i;
    if (dur > 0 && !reduce) sliderTw = tween(dur, e => { g.value = v0 + (v1 - v0) * e; paintRange(g); });
    else { g.value = i; paintRange(g); }
  }
  const credits = [b].concat(mix != null ? [S.bands[mix]] : []).map(c => `${esc(c.short)}: ${esc(c.credit)}`).join(" · ");
  $("#credit").innerHTML = `Imagery: ${credits}. Viewer: <a href="https://aladin.cds.unistra.fr/AladinLite/" rel="noopener">Aladin Lite</a> (CDS, Strasbourg, LGPL-3.0); HiPS surveys © their providers. Overlays: d3-celestial (BSD-3).`;
  setState(i, S.online === false ? "" : S.bad.has(i) ? "err" : (S.slot.a === i || S.slot.b === i) ? "ok" : "load");
  if (changed) { updateSpectrum(); updateCompareTags(); }
  // keep the chosen band in view on phones
  const el = $$(".sv-band")[i]; if (el && el.parentNode.scrollWidth > el.parentNode.clientWidth) el.parentNode.scrollTo({ left: el.offsetLeft - el.parentNode.clientWidth / 2 + el.offsetWidth / 2, behavior: reduce ? "auto" : "smooth" });
}
function paintRange(r) { r.style.setProperty("--fill", ((r.value - r.min) / (r.max - r.min) * 100) + "%"); }

function observeRail() {
  const rail = $("#rail");
  const set = () => document.body.style.setProperty("--rail-h", rail.offsetHeight + "px");
  set(); if ("ResizeObserver" in window) new ResizeObserver(set).observe(rail); else addEventListener("resize", set);
}

/* ------------------------------------------------------------ overlays ----- */
function addOverlays(al) {
  const A = S.A, H = {};
  // constellation stick figures (IAU, via d3-celestial): one polyline per figure stroke
  H.lines = A.graphicOverlay({ name: "Constellations", color: "rgba(124, 200, 255, 0.55)", lineWidth: 1.2 });
  al.addOverlay(H.lines);
  for (const strokes of Object.values(S.sky.cons.lines)) for (const pl of strokes) H.lines.add(A.polyline(pl.map(p => [p[0], p[1]])));
  const blank = () => {};
  H.names = A.catalog({ name: "Constellation names", shape: blank, sourceSize: 8, color: "rgba(0,0,0,0)", displayLabel: true, labelColumn: "label", labelColor: "rgba(190, 170, 255, 0.72)", labelFont: "600 10px 'Space Grotesk', sans-serif" });
  al.addCatalog(H.names);
  H.names.addSources(Object.values(S.sky.cons.names).map(c => A.source(c.ra, c.dec, { label: c.name.toUpperCase(), kind: "con", name: c.name })));
  H.stars = A.catalog({ name: "Bright stars", shape: "circle", sourceSize: 7, color: "rgba(255, 226, 180, 0.9)", displayLabel: true, labelColumn: "name", labelColor: "rgba(255, 233, 199, 0.95)", labelFont: "500 11px Inter, sans-serif" });
  al.addCatalog(H.stars);
  H.messier = A.catalog({ name: "Messier", shape: "square", sourceSize: 9, color: "#4ef0b8", hoverColor: "#ffffff", displayLabel: true, labelColumn: "label", labelColor: "#4ef0b8", labelFont: "600 10.5px 'JetBrains Mono', monospace" });
  al.addCatalog(H.messier);
  H.messier.addSources(S.sky.messier.map(o => A.source(o.ra, o.dec, { label: o.id, kind: "messier", id: o.id, alt: o.alt, type: o.type, mag: o.mag, dim: o.dim })));
  H.targets = A.catalog({ name: "Tour targets", shape: ringShape, sourceSize: 18, color: "#ffc24b", hoverColor: "#ffffff", displayLabel: true, labelColumn: "label", labelColor: "#ffd98a", labelFont: "600 11.5px 'Space Grotesk', sans-serif" });
  al.addCatalog(H.targets);
  // targets that sit on top of an earlier one (Sgr A* in the Galactic Centre, Eta Carinae in the Carina Nebula) keep their ring but not a second label
  H.targets.addSources(S.tour.map((t, i) => A.source(t.ra, t.dec, { label: S.tour.slice(0, i).some(u => angDist(u.ra, u.dec, t.ra, t.dec) < 1) ? "" : t.name, kind: "target", idx: i })));
  S.overlays.set(al, H);
  applyOverlayVisibility();
  lod(true);
}
function ringShape(src, ctx) {
  // custom catalog shape: a soft gold ring
  const x = src.x, y = src.y; if (x == null) return;
  ctx.save(); ctx.strokeStyle = "rgba(255, 194, 75, 0.95)"; ctx.lineWidth = 1.6;
  ctx.shadowColor = "rgba(255, 194, 75, 0.8)"; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.arc(x, y, 7, 0, 2 * Math.PI); ctx.stroke(); ctx.restore();
}
function applyOverlayVisibility() {
  for (const [al, H] of S.overlays) {
    H.lines[S.ov.lines ? "show" : "hide"]();
    for (const k of ["names", "messier", "stars", "targets"]) H[k][S.ov[k] ? "show" : "hide"]();
    try { al.setCooGrid({ enabled: S.ov.grid }); } catch (e) { /* older API */ }
  }
  lod(true);
}
// Level of detail: fewer labels when zoomed far out.
function lod(force) {
  if (!S.al) return;
  // judge clutter by degrees per pixel, so a phone gets fewer labels than a desktop at the same field of view
  const eff = S.al.getFov()[0] * 1200 / Math.max(320, S.al.getSize()[0]);
  const bucket = eff > 330 ? 0 : eff > 150 ? 1 : eff > 50 ? 2 : 3;
  for (const [, H] of S.overlays) { const show = S.ov.names && eff < 420; show ? H.names.show() : H.names.hide(); }
  if (bucket === S.starBucket && !force) return;
  S.starBucket = bucket;
  const magLim = [0.6, 1.6, 2.6, 3.6][bucket];
  const named = S.sky.stars.filter(s => s[3] <= magLim && S.sky.names[s[0]] && S.sky.names[s[0]].name);
  for (const [, H] of S.overlays) {
    H.stars.removeAll();
    H.stars.addSources(named.map(s => S.A.source(s[1], s[2], { name: S.sky.names[s[0]].name, kind: "star", mag: s[3] })));
  }
}

function onObject(d) {
  if (d.kind === "target") { showTarget(d.idx, { fly: true }); return; }
  if (d.kind === "messier") {
    const types = { gc: "globular cluster", oc: "open cluster", pn: "planetary nebula", snr: "supernova remnant", sfr: "star-forming nebula", en: "emission nebula", rn: "reflection nebula", dn: "dark nebula", ds: "double star", as: "asterism", gx: "galaxy", sg: "spiral galaxy", eg: "elliptical galaxy", lg: "lenticular galaxy", ig: "irregular galaxy", "i": "irregular galaxy", bn: "bright nebula" };
    toast(`${d.id}${d.alt ? " · " + d.alt : ""} · ${types[d.type] || d.type} · magnitude ${d.mag}`, 4000);
  } else if (d.kind === "star") toast(`${d.name} · visual magnitude ${d.mag}`, 3000);
  else if (d.kind === "con") toast(`${d.name} (constellation)`, 2500);
}

/* ----------------------------------------------------- local sky offline --- */
function showLocalSky(al) {
  // The pre-baked Milky Way (galactic plate carrée, |b| <= 40°, l increasing to the right) as a WCS image.
  const W = 2048, H = 512;
  const img = S.A.image(new URL("data/sky/milkyway-galactic.png", location.href).href, {
    name: "Milky Way (local map)", imgFormat: "png",
    wcs: { NAXIS: 2, NAXIS1: W, NAXIS2: H, CTYPE1: "GLON-CAR", CTYPE2: "GLAT-CAR", CRPIX1: W / 2 + 0.5, CRPIX2: H / 2 + 0.5, CRVAL1: 180, CRVAL2: 0, CDELT1: 360 / W, CDELT2: 80 / H, RADESYS: "ICRS" }
  });
  try { al.setOverlayImageLayer(img, "mw-local"); } catch (e) { /* ignore */ }
  // ...and our own 5,044-star catalogue (Hipparcos via d3-celestial), sized by magnitude and tinted by B-V colour index
  const OV = S.overlays.get(al);
  if (OV && !OV.local) {
    OV.local = S.A.catalog({ name: "Local stars", shape: starShape, sourceSize: 12, color: "#ffffff" });
    al.addCatalog(OV.local);
    OV.local.addSources(S.sky.stars.map(s => S.A.source(s[1], s[2], { kind: "star", name: (S.sky.names[s[0]] || {}).name || "HIP " + s[0], mag: s[3], bv: s[4] })));
  } else if (OV && OV.local) OV.local.show();
}
function starColor(bv) {
  // approximate blackbody tints for the B-V colour index (after Ballesteros 2012, EPL 97, 34002: T = 4600 K (1/(0.92 B-V + 1.7) + 1/(0.92 B-V + 0.62)))
  const T = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
  return T > 20000 ? "155,176,255" : T > 10000 ? "190,205,255" : T > 7500 ? "225,232,255" : T > 6000 ? "255,248,240" : T > 5000 ? "255,232,200" : T > 4000 ? "255,210,160" : "255,190,130";
}
function starShape(src, ctx) {
  const d = src.data || {}, x = src.x, y = src.y; if (x == null) return;
  const r = Math.max(0.6, 3.4 - 0.5 * d.mag), c = starColor(isFinite(d.bv) ? d.bv : 0.6);
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
  g.addColorStop(0, `rgba(${c},1)`); g.addColorStop(0.35, `rgba(${c},0.75)`); g.addColorStop(1, `rgba(${c},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, 2 * Math.PI); ctx.fill();
}
async function retry() {
  const btn = $("#retryBtn"); btn.disabled = true; btn.textContent = "Checking…";
  const ok = await probeNet();
  btn.disabled = false; btn.textContent = "Try again";
  if (!ok) { toast("Still no answer from alasky.cds.unistra.fr"); return; }
  setNet(true);
  for (const al of views()) { try { al.removeImageLayer("mw-local"); } catch (e) { /* not there */ } const H = S.overlays.get(al); if (H && H.local) H.local.hide(); }
  loadInitial();
  if (S.alB) setSlot("c", S.cmpBand, S.alB, "cmp").catch(() => {});
}

/* --------------------------------------------------------------- tour ------ */
function buildTour() {
  const ol = $("#targets");
  ol.innerHTML = S.tour.map((t, i) => `<li tabindex="0" data-i="${i}"><span class="nm">${esc(t.name)}<small>${esc(t.alt)}</small></span>
    <span class="sv-mini">${t.bands.map(k => { const b = S.bands.find(x => x.key === k); return `<span style="--c:${b.color}">${esc(b.short)}</span>`; }).join("")}</span></li>`).join("");
  const go = li => { stopTour(); collapseSheet(); showTarget(+li.dataset.i, { fly: true }); };
  ol.addEventListener("click", e => { const li = e.target.closest("li"); if (li) go(li); });
  ol.addEventListener("keydown", e => { const li = e.target.closest("li"); if (li && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); go(li); } });
  const per = 6.5 + 3 * 4.5; // seconds per stop: flight + three wavelengths
  $("#tourHint").textContent = `${S.tour.length} targets · about ${Math.round(S.tour.length * per / 60)} minutes`;
  $("#tourPlay").addEventListener("click", () => { if (S.tourOn) stopTour(); else { collapseSheet(); startTour(); } });
  $("#capClose").addEventListener("click", closeCaption);
  $("#capPrev").addEventListener("click", () => { const on = S.tourOn; stopTour(); showTarget((S.tourIdx - 1 + S.tour.length) % S.tour.length, { fly: true }); if (on) startTour(S.tourIdx, true); });
  $("#capNext").addEventListener("click", () => { const on = S.tourOn; stopTour(); showTarget((S.tourIdx + 1) % S.tour.length, { fly: true }); if (on) startTour(S.tourIdx, true); });
}
function collapseSheet() {
  // on phones the panel is a bottom sheet: fold it away so the sky and the caption are visible
  const p = $("#panel");
  if (innerWidth <= 820 && !p.classList.contains("collapsed")) { p.classList.add("collapsed"); $(".hud-collapse", p).textContent = "▲ TOUR, VIEW & LEARN"; }
}
function closeCaption() { stopTour(); $("#caption").hidden = true; document.body.classList.remove("sv-captioned"); setActiveTarget(-1); }
function setActiveTarget(i) {
  $$("#targets li").forEach((li, k) => li.classList.toggle("active", k === i));
  const li = $$("#targets li")[i];
  if (li) { const box = li.closest(".hud-panel"); if (box && box.scrollHeight > box.clientHeight && !$("#panel").classList.contains("collapsed")) li.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" }); }
}

async function showTarget(i, { fly = true, token } = {}) {
  const t = S.tour[i]; S.tourIdx = i; setActiveTarget(i);
  const cap = $("#caption"); cap.hidden = false; document.body.classList.add("sv-captioned"); cap.classList.remove("enter"); void cap.offsetWidth; cap.classList.add("enter");
  $("#capKicker").textContent = `${S.tourOn ? "Auto-tour" : "Tour"} · ${i + 1} of ${S.tour.length}`;
  $("#capTitle").innerHTML = `${esc(t.name)}<small>${esc(t.alt)}</small>`;
  $("#capNote").textContent = t.note;
  const bi = t.bands.map(k => S.bands.findIndex(b => b.key === k));
  $("#capBands").innerHTML = bi.map(k => `<button type="button" data-i="${k}" style="--c:${S.bands[k].color}" aria-pressed="false">${esc(S.bands[k].short)}</button>`).join("");
  $$("#capBands button").forEach(b => b.addEventListener("click", () => { goBand(+b.dataset.i); markCapBand(+b.dataset.i); }));
  markCapBand(bi[0]);
  goBand(bi[0], { fromTour: true, dur: 900 });
  if (fly) await flyTo(t.ra, t.dec, t.fov, token);
}
function markCapBand(i) {
  $$("#capBands button").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.i === i)));
  $$(".sv-band").forEach((el, k) => el.classList.toggle("tour", !!$(`#capBands button[data-i="${k}"]`)));
}

async function flyTo(ra, dec, fov, token) {
  const al = S.al; if (!al) return;
  S.master = "a";
  const [ra0, dec0] = al.getRaDec(); const f0 = al.getFov()[0];
  const d = angDist(ra0, dec0, ra, dec);
  if (reduce) { al.gotoRaDec(ra, dec); al.setFoV(fov); return; }
  const alive = () => token == null || token === S.tourToken;
  const zoom = (f, s) => new Promise(res => { al.zoomToFoV(f, s, res); setTimeout(res, s * 1000 + 400); });
  const pan = (s) => new Promise(res => { al.animateToRaDec(ra, dec, s, res); setTimeout(res, s * 1000 + 400); });
  const mid = clamp(Math.max(d * 1.6, fov, Math.min(f0, 120)), fov, 180);
  if (mid > f0 * 1.05 && d > f0 * 0.35) { await zoom(mid, 1.3); if (!alive()) return; }
  if (d > 0.01) { await pan(clamp(0.8 + d / 60, 1, 2.6)); if (!alive()) return; }
  await zoom(fov, 2.2);
}

async function startTour(from = null, keepCurrent = false) {
  S.tourOn = true; const token = ++S.tourToken;
  $("#tourPlay").setAttribute("aria-pressed", "true"); $("#tourPlay span").textContent = "Pause tour";
  let i = from != null ? from : (S.tourIdx >= 0 ? S.tourIdx : 0);
  while (S.tourOn && token === S.tourToken) {
    if (!keepCurrent) await showTarget(i, { fly: true, token });
    keepCurrent = false;
    if (token !== S.tourToken) return;
    const bi = S.tour[i].bands.map(k => S.bands.findIndex(b => b.key === k));
    for (let s = 0; s < bi.length; s++) {
      if (s > 0) { goBand(bi[s], { fromTour: true }); markCapBand(bi[s]); }
      if (!(await progressWait(4500, (s + 1) / bi.length, token))) return;
    }
    i = (i + 1) % S.tour.length;
  }
}
function progressWait(ms, upto, token) {
  const bar = $("#capProg"); const from = parseFloat(bar.style.width) / 100 || 0;
  return new Promise(res => {
    const t0 = performance.now();
    (function step(now) {
      if (token !== S.tourToken || !S.tourOn) return res(false);
      const k = Math.min(1, (now - t0) / ms);
      bar.style.width = ((from + (upto - from) * k) * 100) + "%";
      if (k < 1) requestAnimationFrame(step); else { if (upto >= 1) setTimeout(() => (bar.style.width = "0%"), 200); res(true); }
    })(t0);
  });
}
function stopTour(msg) {
  if (!S.tourOn) return;
  S.tourOn = false; S.tourToken++;
  try { S.al && S.al.stopAnimation(); } catch (e) { /* nothing running */ }
  $("#tourPlay").setAttribute("aria-pressed", "false"); $("#tourPlay span").textContent = "Auto-tour";
  $("#capProg").style.width = "0%";
  $("#capKicker").textContent = `Tour · ${S.tourIdx + 1} of ${S.tour.length}`;
  if (msg) toast(msg);
}

/* ------------------------------------------------------------- search ------ */
function localLookup(q) {
  const n = q.trim().toLowerCase().replace(/\s+/g, " ");
  if (!n) return null;
  const nm = n.replace(/^messier\s*/, "m").replace(/^m\s+(\d)/, "m$1");
  const t = S.tour.find(t => t.name.toLowerCase() === n || t.alt.toLowerCase() === n || t.id === n);
  if (t) return { ra: t.ra, dec: t.dec, fov: t.fov, label: t.name, tour: S.tour.indexOf(t) };
  const m = S.sky.messier.find(o => o.id.toLowerCase() === nm || (o.alt && o.alt.toLowerCase() === n));
  if (m) return { ra: m.ra, dec: m.dec, fov: 1.2, label: m.id + (m.alt ? " · " + m.alt : "") };
  const c = Object.values(S.sky.cons.names).find(c => c.name.toLowerCase() === n);
  if (c) return { ra: c.ra, dec: c.dec, fov: 40, label: c.name + " (constellation)" };
  const hip = Object.keys(S.sky.names).find(h => (S.sky.names[h].name || "").toLowerCase() === n);
  if (hip) { const s = S.sky.stars.find(s => String(s[0]) === hip); if (s) return { ra: s[1], dec: s[2], fov: 5, label: S.sky.names[hip].name }; }
  return null;
}
let msgT = 0;
function doSearch(q) {
  const msg = $("#searchMsg"); msg.className = "sv-search-msg hint";
  clearTimeout(msgT); msgT = setTimeout(() => { msg.textContent = ""; }, 7000);
  if (!q.trim()) return;
  stopTour();
  const hit = localLookup(q);
  if (hit) {
    msg.textContent = "Found " + hit.label; msg.classList.add("ok");
    if (hit.tour != null) showTarget(hit.tour, { fly: true }); else flyTo(hit.ra, hit.dec, hit.fov);
    return;
  }
  if (!S.al) { msg.textContent = "The viewer is not running."; msg.classList.add("err"); return; }
  msg.textContent = /[a-z]/i.test(q) ? "Asking the Sesame name resolver (CDS)…" : "Going to coordinates…";
  S.al.gotoObject(q, {
    success: () => { msg.textContent = "Centred on " + q.trim(); msg.classList.add("ok"); if (S.al.getFov()[0] > 8) S.al.zoomToFoV(2, 1.8); queueReadouts(); },
    error: () => { msg.textContent = S.online ? `Sesame did not recognise “${q.trim()}”. Try an M, NGC or star name.` : "Name lookups need a connection. Tour targets, Messier objects, constellations and bright stars work offline."; msg.classList.add("err"); }
  });
}

/* ---------------------------------------------------------- side panel ----- */
function buildPanel() {
  // tabs
  $$(".sv-tabs button").forEach(b => b.addEventListener("click", () => {
    $$(".sv-tabs button").forEach(x => { const on = x === b; x.setAttribute("aria-pressed", on); x.setAttribute("aria-selected", on); });
    $$(".sv-tab").forEach(p => (p.hidden = p.dataset.pane !== b.dataset.tab));
    specRunning(b.dataset.tab === "learn");
  }));
  if (innerWidth <= 820) { const p = $("#panel"); p.classList.add("collapsed"); $(".hud-collapse", p).textContent = "▲ TOUR, VIEW & LEARN"; }
  $(".hud-collapse").addEventListener("click", () => setTimeout(() => { if ($("#panel").classList.contains("collapsed")) $(".hud-collapse").textContent = "▲ TOUR, VIEW & LEARN"; }));

  // projection + frame
  const projHints = {
    AIT: "Hammer–Aitoff squeezes the whole celestial sphere into an oval with equal areas, like a world map of the sky.",
    SIN: "Orthographic: the sky as a globe seen from outside, the way a photograph of a planet looks. Shows half the sphere.",
    TAN: "Gnomonic: what a camera or telescope sees. Straight lines on the sky stay straight, but it cannot show more than a hemisphere."
  };
  $$("#projSeg button").forEach(b => b.addEventListener("click", () => {
    S.proj = b.dataset.proj; $$("#projSeg button").forEach(x => x.setAttribute("aria-pressed", x === b));
    $("#projHint").textContent = projHints[S.proj];
    for (const al of views()) al.setProjection(S.proj);
    queueReadouts();
  }));
  $$("#frameSeg button").forEach(b => b.addEventListener("click", () => {
    S.frame = b.dataset.frame; $$("#frameSeg button").forEach(x => x.setAttribute("aria-pressed", x === b));
    for (const al of views()) al.setFrame(S.frame === "galactic" ? "galactic" : "icrs");
  }));

  // overlays
  $$("[data-ov]").forEach(c => c.addEventListener("change", () => { S.ov[c.dataset.ov] = c.checked; applyOverlayVisibility(); }));

  // compare
  $("#compareBand").innerHTML = S.bands.map((b, i) => `<option value="${i}">${esc(b.short)} · ${esc(b.name)}</option>`).join("");
  $("#compareBand").value = String(S.cmpBand);
  $("#compareBand").addEventListener("change", e => { S.cmpBand = +e.target.value; if (S.cmpOn && S.alB && S.online) setSlot("c", S.cmpBand, S.alB, "cmp").catch(() => {}); updateCompareTags(); });
  $("#compareOn").addEventListener("change", e => setCompare(e.target.checked));
  wireWipe();

  // title search + misc
  $("#searchForm").addEventListener("submit", e => { e.preventDefault(); doSearch($("#search").value); });
  $("#retryBtn").addEventListener("click", retry);
  $("#offHide").addEventListener("click", () => ($("#offline").hidden = true));
  const reopen = () => { if (S.online === false) $("#offline").hidden = false; };
  $("#netTxt").addEventListener("click", reopen);
  $("#netTxt").addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); reopen(); } });

  addEventListener("keydown", e => {
    if (e.target.closest && e.target.closest("input, select, textarea")) { if (e.key === "Escape") e.target.blur(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const flip = key => { const c = $(`[data-ov="${key}"]`); c.checked = !c.checked; c.dispatchEvent(new Event("change")); };
    if (e.key === "/") { e.preventDefault(); $("#search").focus(); }
    else if (k === "g") flip("grid"); else if (k === "c") flip("lines"); else if (k === "n") flip("names");
    else if (k === "m") flip("messier"); else if (k === "s") flip("stars"); else if (k === "t") flip("targets");
    else if (k === "w") { const c = $("#compareOn"); c.checked = !c.checked; setCompare(c.checked); }
    else if (k === "p") { S.tourOn ? stopTour() : startTour(); }
    else if (e.key === "Escape") closeCaption();
    else if ((e.key === "[" || e.key === "]") ) goBand(S.cur + (e.key === "]" ? 1 : -1));
  });
}
const views = () => [S.al, S.alB].filter(Boolean);

/* ------------------------------------------------------------- compare ----- */
function setCompare(on) {
  S.cmpOn = on; $("#compareOn").checked = on;
  if (!S.al) { toast("The viewer is not running"); return; }
  $("#viewBWrap").hidden = !on; $("#wipe").hidden = !on;
  if (on && !S.alB) {
    const [ra, dec] = S.al.getRaDec();
    S.alB = makeAladin("#viewB", { target: `${ra} ${dec}`, fov: S.al.getFov()[0] });
    wireView(S.alB, "b");
    addOverlays(S.alB);
    if (S.online) setSlot("c", S.cmpBand, S.alB, "cmp").catch(() => {}); else showLocalSky(S.alB);
  }
  if (on) { syncLoop(); toast("Drag the handle to wipe between wavelengths"); }
  updateCompareTags();
}
function updateCompareTags() {
  const a = S.bands[S.cur], b = S.bands[S.cmpBand];
  if (!a || !b) return;
  const ta = $("#wipeTagA"), tb = $("#wipeTagB");
  ta.textContent = a.short; ta.style.setProperty("--c", a.color);
  tb.textContent = b.short; tb.style.setProperty("--c", b.color);
}
function syncLoop() {
  let last = "";
  (function step() {
    if (!S.cmpOn || !S.alB) return;
    const m = S.master === "b" ? S.alB : S.al, s = m === S.al ? S.alB : S.al;
    const [ra, dec] = m.getRaDec(), f = m.getFov()[0];
    const key = ra.toFixed(6) + dec.toFixed(6) + f.toFixed(6);
    if (key !== last) {
      last = key;
      s.gotoRaDec(ra, dec);
      if (Math.abs(s.getFov()[0] - f) > 1e-9) s.setFoV(f);
    }
    requestAnimationFrame(step);
  })();
}
function wireWipe() {
  const knob = $("#wipeKnob"), stage = $("#stage");
  const set = pct => {
    S.wipe = clamp(pct, 2, 98);
    stage.style.setProperty("--wipe", S.wipe + "%");
    knob.setAttribute("aria-valuenow", Math.round(S.wipe));
  };
  set(50);
  knob.addEventListener("pointerdown", e => {
    knob.setPointerCapture(e.pointerId);
    const move = ev => set(ev.clientX / innerWidth * 100);
    const up = () => { knob.removeEventListener("pointermove", move); knob.removeEventListener("pointerup", up); knob.removeEventListener("pointercancel", up); };
    knob.addEventListener("pointermove", move); knob.addEventListener("pointerup", up); knob.addEventListener("pointercancel", up);
    e.preventDefault(); e.stopPropagation();
  });
  knob.addEventListener("keydown", e => {
    if (e.key === "ArrowLeft") { set(S.wipe - 3); e.preventDefault(); }
    if (e.key === "ArrowRight") { set(S.wipe + 3); e.preventDefault(); }
  });
}

/* ------------------------------------------------------- spectrum diagram -- */
// Log-wavelength axis from 10 m (left) to 1 fm (right). x = 12 + (1 - log10 λ) / 16 * 296
const SX = lg => 12 + (1 - lg) / 16 * 296;
let specRAF = 0, specOn = false, specPhase = 0;
function buildSpectrum() {
  const svg = $("#specSvg");
  const stops = S.bands.map(b => `<stop offset="${((SX(b.log10m) - 12) / 296).toFixed(3)}" stop-color="${b.color}"/>`).join("");
  // Atmospheric transparency, roughly (after the NASA "electromagnetic spectrum" atmospheric-opacity figure): 1 = reaches the ground.
  const air = [[1, 0.1], [0.3, 0.1], [-1.3, 0.1], [-1.6, 0.55], [-2.5, 0.95], [-3.3, 0.9], [-4.2, 1], [-5, 0.8], [-5.3, 0.4], [-5.7, 0.3], [-5.95, 0.15], [-6.1, 0.05], [-6.4, 0.05], [-6.5, 1], [-15, 1]];
  const airPath = "M" + air.map(([lg, o]) => `${SX(lg).toFixed(1)},${(96 + o * 30).toFixed(1)}`).join(" L") + ` L${SX(-15)},126 L${SX(1)},126 Z`;
  const ticks = [[0, "1 m"], [-3, "1 mm"], [-6, "1 µm"], [-9, "1 nm"], [-12, "1 pm"], [-15, "1 fm"]];
  const regions = [[0.5, -3, "Radio"], [-3, -3.4, ""], [-3.3, -6.15, "Infrared"], [-6.4, -8, "UV"], [-8, -11, "X-ray"], [-11, -15, "Gamma"]];
  svg.innerHTML = `<title id="specTitle">Electromagnetic spectrum with the current band</title>
    <defs><linearGradient id="svSpec" x1="12" x2="308" gradientUnits="userSpaceOnUse">${stops}</linearGradient>
    <linearGradient id="svVis" x1="0" x2="1"><stop offset="0" stop-color="#ff3b3b"/><stop offset=".25" stop-color="#ffb13d"/><stop offset=".45" stop-color="#fff04b"/><stop offset=".65" stop-color="#4bf07a"/><stop offset=".85" stop-color="#4b8cff"/><stop offset="1" stop-color="#9b5bff"/></linearGradient></defs>
    <text class="ttl" x="12" y="10">ELECTROMAGNETIC SPECTRUM · WAVELENGTH</text>
    <path id="svWave" d="" fill="none" stroke="url(#svSpec)" stroke-width="1.8" stroke-linecap="round"/>
    <path d="${airPath}" fill="rgba(143,152,189,.14)" stroke="rgba(143,152,189,.4)" stroke-width=".8"/>
    <text x="${SX(-2.2)}" y="122" style="fill:var(--faint)">air blocks</text>
    <text x="${SX(-9.8)}" y="122" style="fill:var(--faint)">air blocks: needs space</text>
    <rect x="${SX(-6.15)}" y="96" width="${(SX(-6.4) - SX(-6.15)).toFixed(1)}" height="30" fill="url(#svVis)" opacity=".85"/>
    <line x1="12" x2="308" y1="132" y2="132" stroke="var(--line-hi)"/>
    ${ticks.map(([lg, t]) => `<line x1="${SX(lg)}" x2="${SX(lg)}" y1="129" y2="135" stroke="var(--muted)"/><text x="${SX(lg)}" y="146" text-anchor="middle">${t}</text>`).join("")}
    ${regions.filter(r => r[2]).map(([a, b, t]) => `<text x="${((SX(a) + SX(b)) / 2).toFixed(1)}" y="90" text-anchor="middle" style="fill:var(--text-2)">${t}</text>`).join("")}
    ${S.bands.map((b, i) => `<circle class="svb" data-i="${i}" cx="${SX(b.log10m).toFixed(1)}" cy="${132}" r="3" fill="${b.color}" style="cursor:pointer"><title>${esc(b.short)}: ${esc(b.lambda)}</title></circle>`).join("")}
    <g id="svMark"><line x1="0" x2="0" y1="18" y2="160" stroke="#fff" stroke-width="1" stroke-dasharray="2 3" opacity=".7"/><circle cx="0" cy="132" r="6" fill="none" stroke="#fff" stroke-width="1.5"/><text id="svMarkT" x="0" y="160" text-anchor="middle" style="fill:#fff;font-weight:600"></text></g>`;
  svg.addEventListener("click", e => { const c = e.target.closest(".svb"); if (c) goBand(+c.dataset.i); });
  updateSpectrum(); drawWave();
}
function drawWave() {
  // A chirp whose wavelength shrinks from left to right, as the real spectrum does (drawn, of course, not to scale)
  let d = "", ph = specPhase;
  for (let x = 12; x <= 308; x += 1.5) {
    const k = (x - 12) / 296, lam = 46 * Math.pow(0.055, k) + 1.6;
    ph += 2 * Math.PI * 1.5 / lam;
    const y = 50 + Math.sin(ph) * 20 * (1 - 0.35 * k);
    d += (x === 12 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1);
  }
  $("#svWave").setAttribute("d", d);
}
function specRunning(on) {
  specOn = on && !reduce;
  cancelAnimationFrame(specRAF);
  if (!specOn) return;
  (function step() { if (!specOn || document.hidden) { specRAF = requestAnimationFrame(step); return; } specPhase -= 0.12; drawWave(); specRAF = requestAnimationFrame(step); })();
}
function updateSpectrum() {
  const b = S.bands[S.cur]; if (!b || !$("#svMark")) return;
  const x = SX(b.log10m);
  const g = $("#svMark"); g.setAttribute("transform", `translate(${x.toFixed(1)},0)`);
  const t = $("#svMarkT"); t.textContent = b.short; t.setAttribute("text-anchor", x < 60 ? "start" : x > 260 ? "end" : "middle");
  $$(".svb").forEach(c => c.setAttribute("r", +c.dataset.i === S.cur ? 4.5 : 3));
  // Wien's displacement law T = b / λ with b = 2.897771955e-3 m K (CODATA 2018); photon energy E = h c / λ = 1239.84 eV nm / λ
  const lam = Math.pow(10, b.log10m), T = 2.897771955e-3 / lam, E = 1239.84193e-9 / lam;
  const p2 = v => Number(v.toPrecision(2)).toLocaleString("en-US", { maximumSignificantDigits: 2 });
  const fmtT = T >= 1e12 ? p2(T / 1e12) + " trillion K" : T >= 1e9 ? p2(T / 1e9) + " billion K" : T >= 1e6 ? p2(T / 1e6) + " million K" : p2(T) + " K";
  const fmtE = E >= 1e9 ? p2(E / 1e9) + " GeV" : E >= 1e6 ? p2(E / 1e6) + " MeV" : E >= 1e3 ? p2(E / 1e3) + " keV" : E >= 1 ? p2(E) + " eV" : E >= 1e-3 ? p2(E * 1e3) + " meV" : p2(E * 1e6) + " µeV";
  const thermal = /thermal \(|^thermal|starlight|stars/.test(b.mechanism) && !/non-thermal/.test(b.mechanism);
  $("#specRead").innerHTML = `<b>${esc(b.short)}</b> · ${esc(b.lambda)} · photon energy ≈ ${fmtE}<br>` +
    `A blackbody glows brightest here at <b>${fmtT}</b>` + (thermal ? `: that is the kind of object you are seeing.` : `, but this light is ${esc(b.mechanism)}, not heat.`);
}
