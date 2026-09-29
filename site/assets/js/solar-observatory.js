/* Cosmic Library — Solar Observatory: today's real Sun.
 *
 * Every picture on this page is loaded straight from the operator's public server as a plain
 * <img> (no CORS needed). URL patterns were read from the operators' own pages on 28 Sep 2026:
 *   SDO browse images   sdo.gsfc.nasa.gov/assets/img/latest/latest_{512|1024|2048|4096}_{channel}.jpg
 *                        (sdo.gsfc.nasa.gov/data/). 48-hour movies: .../latest/mpeg/latest_1024_{channel}.mp4,
 *                        the <video> source on sdo.gsfc.nasa.gov/data/latest48.php?q={channel}.
 *   SOHO LASCO          soho.nascom.nasa.gov/data/realtime/{c2|c3}/{512|1024}/latest.jpg
 *                        (realtime-images.html lists 512; the /1024/ directory listing holds latest.jpg too).
 *   GOES SUVI (NOAA)    services.swpc.noaa.gov/images/animations/suvi/primary/{094…304|map}/latest.png
 *                        (listed on www.spaceweather.gov's SUVI product page).
 *   Helioviewer API v2  api.helioviewer.org/v2/takeScreenshot/?date=ISO&imageScale=arcsec/px
 *                        &layers=[sourceId,1,100]&x0=0&y0=0&width&height&display=true → PNG
 *                        (sourceIds from /v2/getDataSources/: AIA 94…1700 = 8…16, HMI 18/19,
 *                         EIT 0…3, LASCO C2/C3 = 4/5, MDI 6/7, SUVI 2000…2005).
 * Channel temperatures (data/solar-observatory.json): Lemen et al. (2012) Solar Physics 275, 17,
 * Table 1, and the log T column of sdo.gsfc.nasa.gov/data/channels.php.
 *
 * Budget: 1024 px images on large screens, 512 px on phones or Save-Data; the 4096 px original
 * only when the zoom lens is used; SOHO/SUVI/Helioviewer/gallery load only when scrolled near.
 * Refresh: at most every 15 minutes, only while the tab is visible. Any failure falls back to a
 * clearly labelled drawing, never to an old picture presented as new.
 */

const $ = (id) => document.getElementById(id);
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC[c]);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const reduce = (window.Codex && window.Codex.reducedMotion) || matchMedia("(prefers-reduced-motion: reduce)").matches;
const saveData = !!(navigator.connection && navigator.connection.saveData);
const PHONE = matchMedia("(max-width: 640px)").matches || saveData;
const SIZE = PHONE ? 512 : 1024;                               // everyday image size
const HI = !PHONE && innerWidth >= 1100 ? 4096 : 2048;         // zoom-lens image size
const FINE = matchMedia("(hover: hover) and (pointer: fine)").matches;
const REFRESH = 15 * 60000;                                    // SDO posts new browse images about this often

/* Cache-buster that only changes every 15 minutes, so the browser cache still does its job. */
const bust = (u) => u + (u.includes("?") ? "&" : "?") + "t=" + Math.floor(Date.now() / REFRESH);

/** Resolve when `url` has decoded as an image; reject on error or timeout. */
function probe(url, timeout = 20000) {
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
async function firstLoading(urls, timeout) {
  for (const u of urls) { try { return await probe(u, timeout); } catch (e) { /* next */ } }
  return null;
}
async function getJSON(url, timeout = 8000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(url + ": HTTP " + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
function clock(d) {
  const utc = d.toISOString().slice(11, 16) + " UTC";
  if (d.getTimezoneOffset() === 0) return utc;
  return `${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" })} (${utc})`;
}
function fmtDay(iso) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${+d} ${MONTHS[+m - 1]} ${y}`;
}
/** Run `fn` once, the first time `el` comes within `margin` of the viewport. */
function whenNear(el, fn, margin = "500px 0px") {
  if (!("IntersectionObserver" in window)) return fn();
  const io = new IntersectionObserver((ents) => {
    if (ents.some((e) => e.isIntersecting)) { io.disconnect(); fn(); }
  }, { rootMargin: margin });
  io.observe(el);
}

let DATA = null;
const CH = {};
const root = document.querySelector(".so");

/* ================================================================== the live dial */
const view = $("view"), disc = $("disc"), ph = $("ph"), layers = [$("layer0"), $("layer1")];
const wipe = $("wipe"), wipeImg = $("wipeImg"), wipeUi = $("wipeUi"), movie = $("movie"), note = $("movieNote");
const lens = $("lens");
const S = { mode: "single", a: "0171", b: "0304", side: "b", cur: 0, token: 0, wtoken: 0, lastTry: 0, shown: null, hi: {}, lens: FINE };

const sdoUrl = (file, size) => DATA.sdo.base.replace("{size}", size).replace("{file}", file);

function setStatus(state, text) {
  $("status").dataset.state = state;
  $("statusTxt").textContent = text;
}

function buildRing() {
  const ring = $("ring");
  const n = DATA.channels.length;
  ring.innerHTML = DATA.channels.map((c, i) => {
    CH[c.id] = c;
    const a = (i * 360) / n + 180 / n;                     // chips sit between the 12 o'clock-style ticks
    return `<button type="button" class="so-chip" data-id="${c.id}" aria-pressed="false" style="--a:${a}deg;--c:${c.color};${c.swatch ? `--sw:${c.swatch}` : ""}"
      title="${esc(c.name)} · ${esc(c.temp)} · ${esc(c.layer)}" aria-label="${esc(c.inst + " " + c.name)}, ${esc(c.temp)}">
      <span class="sw" aria-hidden="true"></span><span>${esc(c.label)}</span><span class="t">${esc(c.short)}</span><span class="badge" aria-hidden="true"></span></button>`;
  }).join("");
  // dial ticks (viewBox 0..200): one major tick per channel, minor ticks between
  let t = "";
  for (let k = 0; k < n * 4; k++) {
    const ang = ((k * 90) / n - 90) * Math.PI / 180, major = k % 4 === 0;
    const r0 = major ? 76 : 77.5, r1 = major ? 81 : 79.5;
    t += `<line x1="${(100 + r0 * Math.cos(ang)).toFixed(2)}" y1="${(100 + r0 * Math.sin(ang)).toFixed(2)}" x2="${(100 + r1 * Math.cos(ang)).toFixed(2)}" y2="${(100 + r1 * Math.sin(ang)).toFixed(2)}"${major ? "" : ' opacity=".5"'}/>`;
  }
  $("ticks").innerHTML = t;
  ring.addEventListener("click", (e) => {
    const b = e.target.closest(".so-chip");
    if (!b || b.disabled) return;
    const id = b.dataset.id;
    if (S.mode === "wipe" && S.side === "b") setB(id); else setA(id);
  });
}

function syncChips() {
  document.querySelectorAll(".so-chip").forEach((b) => {
    const id = b.dataset.id, isA = id === S.a, isB = S.mode === "wipe" && id === S.b;
    b.setAttribute("aria-pressed", String(isA || isB));
    b.classList.toggle("is-a", S.mode === "wipe" && isA);
    b.classList.toggle("is-b", isB);
    b.querySelector(".badge").textContent = isB ? "R" : isA ? "L" : "";
    b.disabled = S.mode === "movie" && !CH[id].movie;
  });
}

function theme(c) {
  root.style.setProperty("--sol-c", c.color);
  const btn = document.querySelector(`.so-chip[data-id="${c.id}"]`);
  if (btn) $("needle").style.setProperty("--a", btn.style.getPropertyValue("--a"));
  $("infoInst").textContent = c.inst === "HMI" ? "Helioseismic and Magnetic Imager (HMI)" : "Atmospheric Imaging Assembly (AIA)";
  $("infoTemp").textContent = c.temp;
  $("infoName").textContent = c.name;
  $("infoLayer").textContent = c.layer;
  $("infoIon").textContent = c.ion;
  $("infoWhat").textContent = c.what;
  $("infoFull").href = sdoUrl(c.file, 4096);
  disc.setAttribute("aria-label", `Latest ${c.inst} ${c.name} image of the Sun from the Solar Dynamics Observatory: ${c.layer}, ${c.temp}`);
}

function setA(id) {
  S.a = id;
  syncChips();
  theme(CH[id]);
  if (S.mode === "movie") loadMovie(); else loadMain();
  $("wipeTagA").textContent = CH[id].label;
}
function setB(id) {
  S.b = id;
  syncChips();
  $("wipeTagB").textContent = CH[id].label;
  loadWipe();
}

function phState(c, title, text, failed) {
  ph.style.setProperty("--c", c.color);
  $("phTitle").textContent = title;
  $("phText").textContent = text;
  ph.classList.toggle("failed", !!failed);
}

async function loadMain() {
  const c = CH[S.a], tok = ++S.token;
  S.lastTry = Date.now();
  view.classList.add("loading");
  setStatus("loading", `Fetching the latest SDO ${c.label} image…`);
  if (!layers.some((l) => l.classList.contains("on"))) { ph.classList.remove("off"); phState(c, "Contacting SDO", `Fetching the latest ${c.inst} ${c.label} image…`); }
  const urls = [bust(sdoUrl(c.file, SIZE))];
  if (c.alt) urls.push(bust(sdoUrl(c.alt, SIZE)));
  const url = await firstLoading(urls, 25000);
  if (tok !== S.token) return;
  view.classList.remove("loading");
  if (!url) {
    layers.forEach((l) => l.classList.remove("on"));
    S.shown = null;
    ph.classList.remove("off");
    phState(c, "Offline · a drawing, not data", `SDO's server could not be reached, so this is a sketch in the ${c.label} colours. It retries every 15 minutes.`, true);
    setStatus("offline", "SDO unreachable · showing a labelled drawing · retrying every 15 min");
    hideLens();
    return;
  }
  const next = layers[1 - S.cur], prev = layers[S.cur];
  next.className = "so-layer" + (c.inst === "HMI" ? " hmi" : "");
  next.alt = `The Sun in ${c.name}, latest image from SDO`;
  next.src = url;
  const show = () => { next.classList.add("on"); prev.classList.remove("on"); };
  if (next.decode) next.decode().then(show, show); else show();
  S.cur = 1 - S.cur;
  S.shown = url;
  ph.classList.add("off");
  setStatus("live", `Latest image · SDO posts a new one about every 15 min · fetched ${clock(new Date())}`);
}

async function loadWipe() {
  const c = CH[S.b], tok = ++S.wtoken;
  wipe.classList.remove("loaded");
  $("phB").style.setProperty("--cb", c.color);
  const urls = [bust(sdoUrl(c.file, SIZE))];
  if (c.alt) urls.push(bust(sdoUrl(c.alt, SIZE)));
  const url = await firstLoading(urls, 25000);
  if (tok !== S.wtoken) return;
  $("wipeTagB").textContent = c.label + (url ? "" : " · offline");
  if (!url) return;
  wipeImg.className = c.inst === "HMI" ? "hmi" : "";
  wipeImg.alt = `The Sun in ${c.name}`;
  wipeImg.src = url;
  wipe.classList.add("loaded");
}

/* ---------- 48-hour movie ---------- */
function loadMovie() {
  const c = CH[S.a];
  const page = DATA.sdo.moviePage.replace("{file}", c.file);
  note.hidden = false;
  note.textContent = `Loading SDO's 48-hour ${c.label} movie…`;
  movie.classList.remove("on", "hmi");
  movie.onerror = null;
  movie.src = bust(DATA.sdo.movie.replace("{file}", c.file));
  movie.controls = reduce;
  const fail = () => {
    movie.classList.remove("on");
    note.innerHTML = `Movie unavailable right now · <a href="${esc(page)}" target="_blank" rel="noopener">open it on SDO's site ↗</a>`;
  };
  movie.onerror = fail;
  movie.oncanplay = () => {
    movie.classList.add("on");
    note.textContent = `${c.label} · the last 48 hours, looping`;
    if (!reduce) movie.play().catch(() => { movie.controls = true; });
  };
  movie.load();
}
function stopMovie() {
  movie.pause();
  movie.removeAttribute("src");
  movie.classList.remove("on");
  movie.load();
  note.hidden = true;
}

function setMode(mode) {
  const was = S.mode;
  S.mode = mode;
  document.querySelectorAll("#modeSeg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  wipe.hidden = wipeUi.hidden = mode !== "wipe";
  $("pickRow").hidden = mode !== "wipe";
  if (mode !== "single") hideLens();
  if (was === "movie" && mode !== "movie") stopMovie();
  if (mode === "wipe") {
    if (S.b === S.a) S.b = S.a === "0304" ? "0171" : "0304";
    $("wipeTagA").textContent = CH[S.a].label;
    $("wipeTagB").textContent = CH[S.b].label;
    loadWipe();
  }
  if (mode === "movie") {
    if (!CH[S.a].movie) { setA("0171"); }
    else loadMovie();
  }
  syncChips();
  if (was === "movie" && mode !== "movie" && !S.shown) loadMain();
}

function initControls() {
  $("phRetry").addEventListener("click", () => { S.hi = {}; loadMain(); });
  $("modeSeg").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-mode]");
    if (b && b.dataset.mode !== S.mode) setMode(b.dataset.mode);
  });
  $("pickSeg").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-side]");
    if (!b) return;
    S.side = b.dataset.side;
    document.querySelectorAll("#pickSeg button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  });
  const range = $("wipeRange");
  const paint = () => view.style.setProperty("--wipe", range.value + "%");
  range.addEventListener("input", paint);
  paint();
  const tog = $("lensToggle");
  tog.checked = S.lens;
  tog.addEventListener("change", () => { S.lens = tog.checked; if (!S.lens) hideLens(); });
}

/* ---------- zoom lens: magnifies the 4096 px original, fetched only on first use ---------- */
const ZOOM = 3.2;
function hideLens() { lens.classList.remove("on"); }
function hiFor(c) {
  if (S.hi[c.id]) return S.hi[c.id];
  const p = { url: null, state: "loading" };
  S.hi[c.id] = p;
  firstLoading([bust(sdoUrl(c.file, HI))].concat(c.alt ? [bust(sdoUrl(c.alt, HI))] : []), 60000).then((u) => {
    p.url = u; p.state = u ? "ok" : "fail";
    if (lens.classList.contains("on")) lensLabel(c);
  });
  return p;
}
function lensLabel(c) {
  const p = S.hi[c.id];
  $("lensTag").textContent = !p || p.state === "loading" ? `loading ${HI} px…` : p.state === "ok" ? `${HI} px original` : `${SIZE} px · ${HI} unavailable`;
}
function moveLens(e) {
  if (!S.lens || S.mode !== "single" || !S.shown) return hideLens();
  const img = layers[S.cur];
  const r = img.getBoundingClientRect(), v = view.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  const dx = e.clientX - (v.left + v.width / 2), dy = e.clientY - (v.top + v.height / 2);
  if (Math.hypot(dx, dy) > v.width * 0.47) return hideLens();
  const c = CH[S.a], p = hiFor(c);
  const src = p.url || S.shown;
  const L = lens.offsetWidth;
  lens.style.left = (e.clientX - v.left) + "px";
  lens.style.top = (e.clientY - v.top) + "px";
  lens.style.backgroundImage = `url("${src}")`;
  lens.style.backgroundSize = `${r.width * ZOOM}px ${r.height * ZOOM}px`;
  lens.style.backgroundPosition = `${-(x * ZOOM - L / 2)}px ${-(y * ZOOM - L / 2)}px`;
  lensLabel(c);
  lens.classList.add("on");
}
view.addEventListener("pointermove", moveLens);
view.addEventListener("pointerleave", hideLens);

/* ---------- refresh: at most every 15 minutes, only while visible ---------- */
function maybeRefresh() {
  if (document.hidden || !DATA || Date.now() - S.lastTry < REFRESH) return;
  S.hi = {};
  if (S.mode === "movie") loadMovie(); else loadMain();
  if (S.mode === "wipe") loadWipe();
  if (corona.started) { loadLasco(); loadSuvi(corona.suvi); }
}
setInterval(maybeRefresh, 60000);
document.addEventListener("visibilitychange", maybeRefresh);

/* ================================================================== coronagraphs + SUVI */
const corona = { started: false, suvi: "195" };

function frameLoad(frame, img, urls, { waiting = "Loading", failText = "Offline · no live image", timeout = 25000 } = {}) {
  frame.classList.remove("loaded", "failed");
  const st = frame.querySelector(".so-fph-state");
  if (st) st.textContent = waiting;
  const tok = (frame._tok = (frame._tok || 0) + 1);
  return firstLoading(urls, timeout).then((u) => {
    if (tok !== frame._tok) return null;
    if (!u) { frame.classList.add("failed"); if (st) st.textContent = failText; return null; }
    img.src = u;
    frame.classList.add("loaded");
    return u;
  });
}

function buildLasco() {
  $("lasco").innerHTML = DATA.soho.cams.map((c) => `
    <article class="card so-shot">
      <div class="so-frame" id="lasco-${c.id}" style="--c:${c.color}">
        <div class="so-fph"><span class="so-fph-glyph"></span><span class="so-fph-state">Waiting</span></div>
        <img alt="Latest SOHO ${esc(c.name)} coronagraph image" decoding="async" referrerpolicy="no-referrer">
        <span class="so-frame-tag">SOHO ${esc(c.name)}</span>
      </div>
      <div class="so-shot-body">
        <h3>${esc(c.name)} <span class="chip">${esc(c.fov)}</span></h3>
        <p>${esc(c.text)}</p>
        <p class="hint" id="lasco-${c.id}-t"></p>
      </div>
    </article>`).join("");
}
function loadLasco() {
  DATA.soho.cams.forEach((c) => {
    const f = $("lasco-" + c.id);
    const u = (size) => bust(DATA.soho.url.replace("{cam}", c.id).replace("{size}", size));
    frameLoad(f, f.querySelector("img"), SIZE === 1024 ? [u(1024), u(512)] : [u(512)]).then((ok) => {
      $(`lasco-${c.id}-t`).textContent = ok ? `Latest from SOHO · fetched ${clock(new Date())}` : "SOHO could not be reached. Latest images: soho.nascom.nasa.gov";
    });
  });
}

function buildSuvi() {
  $("suviSeg").innerHTML = DATA.suvi.channels.map((c) =>
    `<button type="button" data-ch="${c.id}" style="--c:${c.color}" aria-pressed="${c.id === corona.suvi}">${esc(c.label)}</button>`).join("");
  $("suviSeg").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-ch]");
    if (b) loadSuvi(b.dataset.ch);
  });
  const c = DATA.suvi.channels.find((x) => x.id === corona.suvi);
  $("suviDesc").textContent = c.text;
}
function loadSuvi(id) {
  corona.suvi = id;
  const c = DATA.suvi.channels.find((x) => x.id === id);
  document.querySelectorAll("#suviSeg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.ch === id)));
  const f = $("suviFrame");
  f.style.setProperty("--c", c.color);
  $("suviTag").textContent = id === "map" ? "SUVI thematic map" : `SUVI ${c.label}`;
  $("suviDesc").textContent = c.text;
  $("suviImg").alt = id === "map" ? "Latest SUVI thematic map of solar features" : `Latest GOES SUVI image of the Sun at ${c.label}`;
  frameLoad(f, $("suviImg"), [bust(DATA.suvi.url.replace("{ch}", id))]).then((ok) => {
    $("suviTime").textContent = ok ? `Latest from NOAA · fetched ${clock(new Date())}` : "NOAA's image server could not be reached, so nothing is shown rather than an old picture.";
  });
}

/* ================================================================== any day in history */
const H = { src: {}, preset: null };
function isoNow() { return new Date().toISOString(); }
function buildHistory() {
  const sel = $("histSrc");
  sel.innerHTML = DATA.history.sources.map((s) => `<option value="${s.id}">${esc(s.label)} (from ${s.start.slice(0, 4)})</option>`).join("");
  DATA.history.sources.forEach((s) => (H.src[s.id] = s));
  const d = $("histDate");
  d.min = "1996-01-15";
  d.max = isoNow().slice(0, 10);
  $("presets").innerHTML = DATA.history.presets.map((p) =>
    `<button type="button" class="so-preset" data-id="${p.id}" aria-pressed="false">${esc(p.label)}<span class="y">${p.date.slice(0, 4)}</span></button>`).join("");
  $("presets").addEventListener("click", (e) => {
    const b = e.target.closest(".so-preset");
    if (b) usePreset(b.dataset.id);
  });
  $("histForm").addEventListener("submit", (e) => {
    e.preventDefault();
    H.preset = null;
    syncPresets();
    const date = d.value, time = $("histTime").value || "12:00";
    if (!date) { $("histMsg").textContent = "Choose a date first."; return; }
    renderHistory(H.src[sel.value], `${date}T${time.slice(0, 5)}:00Z`, null);
  });
}
function syncPresets() {
  document.querySelectorAll(".so-preset").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === H.preset)));
}
function usePreset(id) {
  const p = DATA.history.presets.find((x) => x.id === id);
  H.preset = id;
  syncPresets();
  $("histDate").value = p.date.slice(0, 10);
  $("histTime").value = p.date.slice(11, 16);
  $("histSrc").value = String(p.source);
  renderHistory(H.src[p.source], p.date, p.text);
}
function renderHistory(src, iso, text) {
  const msg = $("histMsg");
  const t = Date.parse(iso);
  msg.textContent = "";
  if (!isFinite(t)) { msg.textContent = "That date could not be read."; return; }
  if (t > Date.now()) { msg.textContent = "That moment has not happened yet. Choose a time in the past (UTC)."; return; }
  if (t < Date.parse(src.start + "T00:00:00Z")) { msg.textContent = `${src.label} data begin on ${fmtDay(src.start)}. For earlier days choose SOHO EIT 195 Å (from 1996).`; return; }
  if (src.end && t > Date.parse(src.end + "T23:59:59Z")) { msg.textContent = `${src.label} ended on ${fmtDay(src.end)}. Choose an SDO channel for later dates.`; return; }
  const size = SIZE, scale = +(src.scale * (1024 / size)).toFixed(3);
  const url = `${DATA.history.endpoint}?date=${encodeURIComponent(new Date(t).toISOString().replace(".000Z", "Z"))}` +
    `&imageScale=${scale}&layers=${encodeURIComponent(`[${src.id},1,100]`)}&x0=0&y0=0&width=${size}&height=${size}&display=true&watermark=false`;
  const when = `${fmtDay(iso)}, ${new Date(t).toISOString().slice(11, 16)} UTC`;
  const frame = $("histFrame");
  frame.style.setProperty("--c", src.color);
  $("histTag").textContent = `${src.label.replace(/ \(.*\)$/, "")} · ${when}`;
  $("histImg").alt = `${src.label}: the Sun on ${when}, rendered by Helioviewer`;
  $("histOpen").href = url;
  $("histCap").textContent = text || `${src.label}: the archived image nearest to ${when}.`;
  const pending = frameLoad(frame, $("histImg"), [url], { waiting: "Rendering on the Helioviewer server…", failText: "Helioviewer unreachable", timeout: 45000 });
  const tok = frame._tok;
  pending.then((ok) => {
    if (!ok && tok === frame._tok) msg.textContent = "Helioviewer could not render this image (offline, busy, or no data near that time). Try again, or another channel.";
  });
}

/* ================================================================== great solar photographs */
let LOCAL = {};
const searchCache = new Map();
function nasaSearch(q) {                    // NASA Image and Video Library API (CORS-enabled), as in gallery.js
  if (searchCache.has(q)) return searchCache.get(q);
  const p = (async () => {
    const data = await getJSON(`https://images-api.nasa.gov/search?q=${encodeURIComponent(q)}&media_type=image`, 9000);
    const items = (data && data.collection && data.collection.items) || [];
    for (const it of items.slice(0, 4)) {
      const link = (it.links || []).find((l) => l.render === "image" || /\.(jpe?g|png)$/i.test(l.href || ""));
      if (!link) continue;
      const thumb = link.href.replace(/^http:/, "https:");
      const u = await firstLoading([thumb.replace("~thumb.", "~medium."), thumb], 10000);
      if (u) return u;
    }
    return null;
  })().catch(() => null);
  searchCache.set(q, p);
  return p;
}
const resolved = new Map();
function resolveImage(it) {                  // local mirror → image → alt → NASA search → placeholder
  if (resolved.has(it.id)) return resolved.get(it.id);
  const p = (async () => {
    const list = [LOCAL[it.id], it.image].concat(it.alt || []).filter(Boolean);
    for (const u of list) {
      try { return await probe(u, /helioviewer/.test(u) ? 40000 : 15000); } catch (e) { /* next */ }
    }
    return it.query ? await nasaSearch(it.query) : null;
  })().catch(() => null);
  resolved.set(it.id, p);
  return p;
}
function dateLabel(it) { return it.dateLabel || fmtDay(it.date); }

function buildGallery() {
  const grid = $("grid");
  grid.innerHTML = DATA.gallery.map((it, i) => `
    <figure class="so-tile" data-i="${i}">
      <button class="so-frame" type="button" style="--c:${(it.tone || [])[1] || "#ffc24b"}" aria-label="${esc(it.title)}, ${esc(dateLabel(it))}. Open details">
        <span class="so-fph"><span class="so-fph-glyph"></span><span class="so-fph-title">${esc(it.title)}</span><span class="so-fph-state">Loading</span></span>
        <img alt="${esc(it.title)} (${esc(it.mission)}, ${it.year})" decoding="async" referrerpolicy="no-referrer">
        <span class="so-year">${it.year}</span>
      </button>
      <figcaption><h3>${esc(it.title)}</h3><p>${esc(it.mission)}</p></figcaption>
    </figure>`).join("");
  const hydrate = (tile) => {
    const it = DATA.gallery[+tile.dataset.i], f = tile.querySelector(".so-frame"), img = f.querySelector("img");
    resolveImage(it).then((u) => {
      if (!u) { f.classList.add("failed"); f.querySelector(".so-fph-state").textContent = "Offline · see source"; return; }
      img.onload = () => f.classList.add("loaded");
      img.onerror = () => { f.classList.add("failed"); f.querySelector(".so-fph-state").textContent = "Offline · see source"; };
      img.src = u;
    });
  };
  const tiles = grid.querySelectorAll(".so-tile");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { io.unobserve(en.target); hydrate(en.target); } }), { rootMargin: "400px 0px" });
    tiles.forEach((t) => io.observe(t));
  } else tiles.forEach(hydrate);
  grid.addEventListener("click", (e) => {
    const t = e.target.closest(".so-tile");
    if (t) openLb(+t.dataset.i);
  });
}

/* lightbox */
const lb = $("lb");
let lbIdx = 0, lbReturn = null;
function openLb(i) {
  lbIdx = (i + DATA.gallery.length) % DATA.gallery.length;
  const it = DATA.gallery[lbIdx];
  if (!lb.classList.contains("open")) { lbReturn = document.activeElement; lb.classList.add("open"); lb.setAttribute("aria-hidden", "false"); document.body.style.overflow = "hidden"; $("lbClose").focus(); }
  $("lbDate").textContent = `${dateLabel(it)} · ${it.tags.agency.join(" · ")}`;
  $("lbTitle").textContent = it.title;
  $("lbStory").textContent = it.story;
  $("lbMission").textContent = it.mission;
  $("lbInst").textContent = it.instrument;
  $("lbCredit").textContent = it.credit;
  $("lbSource").href = it.page;
  const st = $("lbStage");
  st.style.setProperty("--c", (it.tone || [])[1] || "#ffc24b");
  st.classList.remove("loaded", "failed");
  $("lbState").textContent = "Loading…";
  $("lbImg").alt = it.title;
  $("lbImg").removeAttribute("src");
  resolveImage(it).then((u) => {
    if (DATA.gallery[lbIdx] !== it) return;
    if (!u) { st.classList.add("failed"); $("lbState").textContent = "Offline · open the source page for this image"; return; }
    $("lbImg").onload = () => st.classList.add("loaded");
    $("lbImg").src = u;
  });
}
function closeLb() {
  lb.classList.remove("open");
  lb.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  if (lbReturn && lbReturn.focus) lbReturn.focus();
}
$("lbClose").addEventListener("click", closeLb);
$("lbPrev").addEventListener("click", () => openLb(lbIdx - 1));
$("lbNext").addEventListener("click", () => openLb(lbIdx + 1));
lb.addEventListener("click", (e) => { if (e.target === lb) closeLb(); });
document.addEventListener("keydown", (e) => {
  if (!lb.classList.contains("open")) return;
  if (e.key === "Escape") closeLb();
  else if (e.key === "ArrowLeft") openLb(lbIdx - 1);
  else if (e.key === "ArrowRight") openLb(lbIdx + 1);
});

/* ================================================================== boot */
(async function main() {
  try {
    const [data, local] = await Promise.all([
      getJSON("data/solar-observatory.json"),
      getJSON("data/gallery.local.json", 3000).catch(() => null)
    ]);
    DATA = data;
    LOCAL = (local && local.images) || {};
  } catch (e) {
    setStatus("offline", "Page data could not be loaded. Serve the site folder over HTTP (see docs/DEVELOPING.md).");
    return;
  }
  buildRing();
  initControls();
  setA(S.a);

  buildLasco();
  buildSuvi();
  whenNear($("corona"), () => { corona.started = true; loadLasco(); loadSuvi(corona.suvi); });

  buildHistory();
  whenNear($("history"), () => usePreset("x93"));

  buildGallery();
  window.SolarObservatory = { state: S, setA, setB, setMode, usePreset };   // handy for tests and the console
})();
