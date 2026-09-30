/* Deep Space Network, live (dsn.html)
 *
 * Data flow: NASA/JPL DSN Now dsn.xml (every 5 s) ─► dsn-data.js (tolerant XML parse → snapshot → links)
 *   ─► 3D Earth + beams (dsn-scene.js), "Talking now" list, per-dish panels, sky-coverage map.
 * Cache: the last good dsn.xml is kept in localStorage (try/catch); if the feed cannot be reached the page
 * shows that copy, marked with its age. With no copy at all it switches to a clearly labelled ILLUSTRATIVE
 * sample snapshot from data/dsn.json (built from typical values, not a record of real activity).
 *
 * URL flags: ?offline (force the sample), ?still (freeze animation for screenshots).
 * Test hooks: window.__sim = { state, scene, reload, setXML(xml), focus(key), open(code), ready }.
 */
import * as D from "./dsn-data.js";

const Q = new URLSearchParams(location.search);
const STILL = Q.has("still");
const OFFLINE = Q.has("offline");
const RM = !!(window.Codex && window.Codex.reducedMotion);
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LS_SNAP = "cl-dsn-snap-v1", LS_CFG = "cl-dsn-config-v1";
const lsGet = (k) => { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode / quota */ } };
const ago = (ms) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return s + " s ago";
  const m = Math.round(s / 60);
  if (m < 90) return m + " min ago";
  if (m < 48 * 60) return Math.round(m / 60) + " h ago";
  return Math.round(m / 1440) + " days ago";
};
const utcTime = (ms) => new Date(ms).toISOString().slice(11, 19) + " UTC";
const fmtWhen = (ms, tz) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(ms));
const localClock = (ms, tz) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(ms));
const tzAbbr = (ms, tz) => { try { return new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date(ms)).find((p) => p.type === "timeZoneName").value; } catch (e) { return ""; } };
const BAND_CHIP = { S: "sol", X: "ice", Ka: "nebula", K: "nebula" };

/* ================================================================== state */
const ST = {
  mode: "loading",          // live | stale | sample
  meta: null, cfg: null, snap: null, links: [], beams: [], fetchedAt: 0,
  fails: 0, urlIdx: 0, sampleT: 0, sampleStart: 0, pageOpen: Date.now(), timer: 0, dish: "70"
};
const clock = () => (ST.mode === "sample" ? ST.sampleT + (Date.now() - ST.sampleStart) : Date.now());
let CX = {}, DISHMETA = {};

/* ================================================================== lookups */
function scInfo(code) {
  const S = ST.meta.spacecraft;
  if (S[code]) return { code, ...S[code] };
  for (const k in S) if ((S[k].aliases || []).includes(code)) return { code, ...S[k] };
  const cfgName = ST.cfg && ST.cfg.spacecraft[code];
  return { code, name: cfgName && cfgName.toUpperCase() !== code ? cfgName : code, unknown: true };
}
const scName = (code) => scInfo(code).name;
const scShort = (code) => { const s = scInfo(code); return s.short || s.name; };
function stationOf(dish) {
  if (dish.station && CX[dish.station]) return CX[dish.station];
  const m = DISHMETA[dish.name];
  return m ? CX[m.cx] : null;
}

/* ================================================================== feed */
async function fetchText(url, ms = 8000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.text();
  } finally { clearTimeout(timer); }
}
async function fetchFeed() {
  // DSN Now itself adds ?r=<time> to defeat caches; try the current app path first, then the older one
  const n = D.FEED_URLS.length;
  let err;
  for (let k = 0; k < n; k++) {
    const i = (ST.urlIdx + k) % n;
    try {
      const xml = await fetchText(D.FEED_URLS[i] + "?r=" + Math.floor(Date.now() / 5000));
      const snap = D.parseDSN(xml);
      if (!snap.dishes.length) throw new Error("empty feed");
      ST.urlIdx = i;
      return { xml, snap };
    } catch (e) { err = e; }
  }
  throw err || new Error("unreachable");
}
async function loadConfig() {
  const c = lsGet(LS_CFG);
  if (c && Date.now() - c.t < 86400000 && c.cfg) { ST.cfg = c.cfg; return; }
  for (const u of D.CONFIG_URLS) {
    try { const cfg = D.parseConfig(await fetchText(u)); if (Object.keys(cfg.spacecraft).length) { ST.cfg = cfg; lsSet(LS_CFG, { t: Date.now(), cfg }); return; } } catch (e) { /* next */ }
  }
}

async function poll(force) {
  clearTimeout(ST.timer);
  if (OFFLINE) return;
  if (document.hidden && !force) { ST.timer = setTimeout(poll, 5000); return; }
  try {
    const { xml, snap } = await fetchFeed();
    const first = ST.mode !== "live";
    ST.fails = 0; ST.fetchedAt = Date.now();
    ST.mode = "live";
    lsSet(LS_SNAP, { t: ST.fetchedAt, xml: xml.length < 400000 ? xml : "" });
    apply(snap);
    if (first) { $("sampleBar").hidden = true; if (!ST.cfg) loadConfig().then(() => ST.snap && renderAll()); }
  } catch (e) {
    ST.fails++;
    if (ST.mode === "live" && ST.fails >= 2) { ST.mode = "stale"; setStatus(); }
    if (ST.mode === "loading") {
      const c = lsGet(LS_SNAP);
      let ok = false;
      if (c && c.xml) { try { const snap = D.parseDSN(c.xml); ST.mode = "stale"; ST.fetchedAt = c.t; apply(snap); ok = true; } catch (er) { /* corrupt cache */ } }
      if (!ok) useSample(false);
    }
  }
  const next = ST.mode === "live" ? 5000 : ST.mode === "stale" ? 15000 : 60000;
  ST.timer = setTimeout(poll, next);
}

function useSample(asked) {
  const s = ST.meta.sample;
  const snap = D.parseDSN(s.xml);
  ST.mode = "sample";
  ST.sampleT = snap.t; ST.sampleStart = Date.now();
  $("sampleBar").hidden = false;
  $("sampleTitle").textContent = s.label;
  $("sampleNote").textContent = (asked ? "You asked for the offline sample: this" : "DSN Now could not be reached from this browser, so this") +
    " is an illustrative snapshot built from typical values, not live data. Clocks and pointing on this page follow the snapshot's moment.";
  $("sampleNote").title = s.note;
  apply(snap);
}

/* ================================================================== apply a snapshot */
function apply(snap) {
  ST.snap = snap;
  ST.links = D.links(snap);
  ST.beams = buildBeams(snap);
  if (SC) SC.setBeams(ST.beams);
  buildBeamLabels();
  renderAll();
  window.__sim && (window.__sim.ready = true);
}
function renderAll() {
  setStatus();
  renderTalk();
  renderDock();
  renderComplexes();
  renderMap();
  renderVoyagerFeed();
}

function buildBeams(snap) {
  const out = [];
  for (const d of snap.dishes) {
    const ls = ST.links.filter((l) => l.dish === d.name && !l.test);
    if (!ls.length) continue;
    const cx = stationOf(d);
    if (!cx) continue;
    let rd = null;
    if (d.az !== null && d.el !== null && d.el > 0.5) rd = D.azElToRaDec(d.az, d.el, cx.lat, cx.lon, isFinite(snap.t) ? snap.t : clock());
    else {
      const sky = scInfo(ls[0].code).sky;
      const a = sky && D.approxRaDec(sky, clock());
      if (a) rd = { ra: a.ra, dec: a.dec, approx: true };
    }
    if (!rd) continue;
    const range = Math.max(0, ...ls.map((l) => l.range || 0)) || null;
    const owlt = range ? range / D.C_KM_S : null;
    const names = [...new Set(ls.map((l) => scShort(l.code)))];
    out.push({
      key: d.name, dish: d.name, station: cx.id, codes: ls.map((l) => l.code),
      label: names.join(" + "), ra: rd.ra, dec: rd.dec, approx: !!rd.approx,
      up: ls.some((l) => l.up.length), down: ls.some((l) => l.down.length),
      range, owlt,
      len: range ? Math.min(2.9, Math.max(1.1, 0.9 + 0.3 * Math.log10(Math.max(range, 1e4) / 1e4))) : 1.5,
      tvis: owlt ? 0.8 + 0.6 * Math.log10(1 + owlt) : 1.4
    });
  }
  // arrayed dishes all point at the same spacecraft: label it once per complex
  const seen = new Set();
  for (const b of out) { const k = b.station + "|" + b.label; b.dup = seen.has(k); seen.add(k); }
  return out;
}

/* ================================================================== status */
function setStatus() {
  const el = $("status"), t = $("statusTxt");
  el.dataset.state = ST.mode;
  if (ST.mode === "live") t.textContent = "Live · DSN Now · updated " + ago(ST.fetchedAt);
  else if (ST.mode === "stale") t.textContent = "Offline · last live data " + ago(ST.fetchedAt);
  else if (ST.mode === "sample") t.textContent = "Sample snapshot · illustrative, not live";
  else t.textContent = "Connecting to DSN Now…";
  const age = $("ageTxt");
  if (!ST.snap) { age.textContent = ""; return; }
  if (ST.mode === "sample") age.textContent = "Snapshot time " + fmtWhen(ST.sampleT, "UTC") + " UTC · illustrative";
  else if (ST.mode === "stale") age.textContent = "Showing the last copy this browser saved, feed time " + utcTime(ST.snap.t) + ". Retrying every 15 s.";
  else age.textContent = "Feed time " + utcTime(ST.snap.t) + " · refreshes every 5 s";
}

/* ================================================================== hero: talking-now list */
function talkRows() {
  const rows = new Map();
  for (const l of ST.links) {
    if (!l.talking || l.test) continue;
    const d = ST.snap.dishes.find((x) => x.name === l.dish);
    const cx = stationOf(d);
    const k = (cx ? cx.id : "?") + "|" + l.code;
    let r = rows.get(k);
    if (!r) { r = { key: l.dish, code: l.code, cx, dishes: [], up: [], down: [], range: l.range, rtlt: l.rtlt }; rows.set(k, r); }
    r.dishes.push(l.dish);
    r.up.push(...l.up); r.down.push(...l.down);
    if (!r.range && l.range) { r.range = l.range; r.rtlt = l.rtlt; }
  }
  return [...rows.values()].sort((a, b) => (b.range || 0) - (a.range || 0));
}
function sigShort(sigs, arrow) {
  if (!sigs.length) return "";
  const s = sigs.find((x) => x.rate) || sigs[0];
  return `<span class="dsn-sig-s">${arrow}<span class="chip ${BAND_CHIP[s.band] || ""} dsn-bchip">${esc(s.band || "?")}</span>${s.rate ? D.fmtRate(s.rate) : "carrier"}</span>`;
}
function renderTalk() {
  const rows = talkRows();
  const list = $("talkList");
  $("countChip").textContent = rows.length + (rows.length === 1 ? " link" : " links");
  $("moreBtn").hidden = rows.length <= 5;
  $("moreBtn").textContent = $("nowPanel").classList.contains("all") ? "Show fewer" : `Show all ${rows.length}`;
  if (!rows.length) { list.innerHTML = `<li class="dsn-empty">No dish is talking to a spacecraft in this snapshot.</li>`; return; }
  list.innerHTML = rows.map((r) => {
    const ow = r.range ? r.range / D.C_KM_S : null;
    return `<li><button class="dsn-row${r.key === ST.selKey ? " on" : ""}" type="button" data-key="${esc(r.key)}" data-code="${esc(r.code)}" style="--c:${r.cx ? r.cx.color : "#7cc8ff"}" data-ow="${ow || ""}">
      <span class="dsn-row-top"><span class="dsn-row-name">${esc(scName(r.code))}</span><span class="dsn-row-lt" title="Round-trip light time">${r.rtlt ? D.fmtDuration(r.rtlt) : "—"}</span></span>
      <span class="dsn-row-meta"><span class="dsn-row-cx">${esc(r.cx ? r.cx.name : "?")} · ${r.dishes.map(D.dssLabel).join(" + ")}</span>${sigShort(r.down, "↓")}${sigShort(r.up, "↑")}</span>
      <span class="dsn-row-track" aria-hidden="true"><i></i></span>
    </button></li>`;
  }).join("");
}
$("talkList").addEventListener("click", (e) => {
  const b = e.target.closest(".dsn-row");
  if (!b) return;
  if (SC) SC.focusBeam(b.dataset.key);
  ST.selKey = b.dataset.key;
  $("talkList").querySelectorAll(".dsn-row").forEach((x) => x.classList.toggle("on", x === b));
  openCard(b.dataset.code);
});
$("moreBtn").addEventListener("click", () => {
  const all = $("nowPanel").classList.toggle("all");
  $("moreBtn").setAttribute("aria-expanded", all ? "true" : "false");
  renderTalk();
});
function tickTracks() {
  const now = Date.now();
  for (const b of $("talkList").querySelectorAll(".dsn-row")) {
    const ow = +b.dataset.ow;
    if (!ow) continue;
    const p = ((now - ST.pageOpen) / 1000 % ow) / ow;
    b.style.setProperty("--p", p.toFixed(5));
  }
}

/* ================================================================== hero: dock + labels */
function buildDock() {
  $("cxBtns").innerHTML = ST.meta.complexes.map((c) => `<button class="dsn-cxbtn" type="button" data-cx="${c.id}" style="--c:${c.color}"><i></i><b>${esc(c.name)}</b><span class="t" data-t></span><span class="n" data-n></span></button>`).join("");
  $("cxBtns").addEventListener("click", (e) => {
    const b = e.target.closest(".dsn-cxbtn");
    if (b && SC) { SC.clearFocus(); SC.focusComplex(b.dataset.cx); setSpin(false); }
  });
}
function busyCount(cxId) {
  const dishes = ST.snap ? ST.snap.dishes.filter((d) => (stationOf(d) || {}).id === cxId) : [];
  const busy = dishes.filter((d) => ST.links.some((l) => l.dish === d.name && l.talking && !l.test)).length;
  return { busy, total: dishes.length };
}
function renderDock() {
  const ms = clock();
  for (const b of $("cxBtns").querySelectorAll(".dsn-cxbtn")) {
    const c = CX[b.dataset.cx];
    b.querySelector("[data-t]").textContent = localClock(ms, c.tz);
    const n = busyCount(c.id);
    b.querySelector("[data-n]").textContent = n.total ? `${n.busy}/${n.total} busy` : "—";
  }
  for (const c of ST.meta.complexes) {
    const el = labelEls.cx[c.id];
    if (el) { const n = busyCount(c.id); el.querySelector("i").textContent = `${localClock(ms, c.tz)} · ${n.busy} talking`; }
  }
}
const labelEls = { cx: {}, beams: {} };
let hudCache = null;
addEventListener("resize", () => { hudCache = null; });
function hudRects() {
  if (!hudCache) {
    const st = $("stage").getBoundingClientRect();
    hudCache = [...document.querySelectorAll(".dsn-hero .hud")].filter((e) => e.offsetParent && getComputedStyle(e).position === "absolute").map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.left - st.left - 8, y: r.top - st.top + r.height / 2, w: r.width + 8, h: r.height / 2 + 26 };
    });
  }
  return hudCache.slice();
}
function buildCxLabels() {
  const wrap = $("labels");
  for (const c of ST.meta.complexes) {
    const s = document.createElement("span");
    s.className = "dsn-lbl dsn-lbl-cx"; s.style.setProperty("--c", c.color);
    s.innerHTML = `<b>${esc(c.name)}</b><i></i>`;
    wrap.appendChild(s); labelEls.cx[c.id] = s;
  }
}
function buildBeamLabels() {
  const wrap = $("labels"), keep = new Set();
  for (const b of ST.beams) {
    if (b.dup) continue;
    keep.add(b.key);
    const html = `<b>${esc(b.label)}</b><i>${b.range ? D.fmtDuration(b.range / D.C_KM_S) + " away at light speed" : ""}</i>`;
    let s = labelEls.beams[b.key];
    if (!s) { s = document.createElement("span"); s.className = "dsn-lbl dsn-lbl-sc"; wrap.appendChild(s); labelEls.beams[b.key] = s; }
    s.style.setProperty("--c", CX[b.station].color);
    if (s._h !== html) { s.innerHTML = html; s._h = html; s._w = 0; }
  }
  for (const k in labelEls.beams) if (!keep.has(k)) { labelEls.beams[k].remove(); delete labelEls.beams[k]; }
}
function placeLabels(L) {
  for (const id in labelEls.cx) {
    const p = L.cx[id], e = labelEls.cx[id];
    e.classList.toggle("on", !!(p && p.vis));
    if (p && p.vis) e.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
  }
  // greedy de-overlap; the HUD cards and the complex labels count as already placed
  const placed = hudRects();
  for (const id in labelEls.cx) { const p = L.cx[id]; if (p && p.vis) placed.push({ x: p.x - 6, y: p.y, w: labelEls.cx[id]._w || (labelEls.cx[id]._w = labelEls.cx[id].offsetWidth || 130) }); }
  for (const p of L.beams) {
    const e = labelEls.beams[p.key];
    if (!e) continue;
    let on = p.vis;
    if (on) {
      const w = e._w || (e._w = e.offsetWidth || 120), h = 30;
      for (const q of placed) if (p.x < q.x + q.w && p.x + w > q.x && Math.abs(p.y - q.y) < (q.h || h)) { on = false; break; }
      if (on) placed.push({ x: p.x, y: p.y, w });
    }
    e.classList.toggle("on", !!on);
    if (on) e.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
  }
}

/* ================================================================== complex panels */
function antennaSVG() {
  return `<svg class="dsn-ant" viewBox="0 0 64 48" aria-hidden="true">
    <path class="gnd" d="M4 45h56"/>
    <path class="ped" d="M22 45l5-17h10l5 17z"/>
    <g class="dish">
      <path class="rx-dots" d="M62 26h-1M56 26h-1M50 26h-1"/>
      <path class="tx-w" d="M47 19a9 9 0 0 1 0 14M52 15a15 15 0 0 1 0 22M57 11a21 21 0 0 1 0 30"/>
      <path class="strut" d="M34 11L44 26L34 41"/>
      <path class="refl" d="M34 9Q22 26 34 43"/>
      <path class="feed" d="M29 26h15"/><circle class="horn" cx="44" cy="26" r="2"/>
    </g>
  </svg>`;
}
function compassSVG() {
  return `<svg class="dsn-cmp" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="11"/><text x="14" y="6.4">N</text><g class="ndl"><path d="M14 5l2.4 9h-4.8z"/><path class="tail" d="M14 23l2.4-9h-4.8z"/></g></svg>`;
}
const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const compass = (az) => COMPASS[Math.round(D.norm360(az) / 22.5) % 16];

function buildComplexes() {
  $("cxGrid").innerHTML = ST.meta.complexes.map((c) => `
    <article class="card dsn-cx reveal" data-cx="${c.id}" style="--c:${c.color}">
      <header class="dsn-cx-head">
        <div><h3><i class="dsn-cx-dot"></i>${esc(c.name)}</h3><p class="dsn-cx-place">${esc(c.place)}</p></div>
        <div class="dsn-cx-clock"><b data-clock>—</b><span data-sun>—</span></div>
      </header>
      <p class="dsn-cx-full">${esc(c.full)} · ${Math.abs(c.lat).toFixed(2)}° ${c.lat >= 0 ? "N" : "S"}, ${Math.abs(c.lon).toFixed(2)}° ${c.lon >= 0 ? "E" : "W"}</p>
      <ul class="dsn-dishes" data-list></ul>
    </article>`).join("");
  $("cxGrid").addEventListener("click", (e) => {
    const b = e.target.closest("[data-sc]");
    if (b) openCard(b.dataset.sc);
  });
}
function dishState(d, meta) {
  if (!d) return meta && meta.status === "repair" ? "repair" : "absent";
  const ls = ST.links.filter((l) => l.dish === d.name && !l.test);
  if (ls.some((l) => l.talking)) return "talking";
  if (ls.length) return "pointing";
  if (meta && meta.status === "repair") return "repair";
  return "idle";
}
function sigLine(s) {
  const pw = s.dir === "up" ? D.fmtKW(s.power) : D.fmtDBm(s.power);
  const pwTitle = s.dir === "down" && s.power !== null ? ` title="${esc(D.fmtSci(D.dbmToW(s.power), "W"))} received"` : ` title="transmitter power"`;
  return `<li class="dsn-sig ${s.dir}"><span class="dsn-sig-dir" title="${s.dir === "up" ? "Uplink: Earth to spacecraft" : "Downlink: spacecraft to Earth"}">${s.dir === "up" ? "↑" : "↓"}<span class="sr-only">${s.dir === "up" ? "uplink" : "downlink"}</span></span><span class="chip ${BAND_CHIP[s.band] || ""} dsn-bchip">${esc(s.band || "?")}</span>` +
    `<b class="r">${s.rate ? D.fmtRate(s.rate) : s.type === "carrier" ? "carrier only" : "—"}</b><span class="x">${D.fmtFreq(s.hz)} · <span${pwTitle}>${pw}</span></span></li>`;
}
function dishBody(d, meta, state, cx) {
  const ls = d ? ST.links.filter((l) => l.dish === d.name && !l.test) : [];
  const flags = [];
  if (d && d.mspa) flags.push(`<span class="chip" title="One dish, several spacecraft in the same beam, usually at Mars">Multiple Spacecraft Per Aperture (MSPA)</span>`);
  if (d && d.array) flags.push(`<span class="chip" title="Several dishes combine their signals to hear a faint spacecraft">Arrayed</span>`);
  if (d && d.ddor) flags.push(`<span class="chip" title="Two complexes track one spacecraft to pin down its position against a quasar">Delta-DOR</span>`);
  let body = "";
  if (state === "talking" || state === "pointing") {
    body += `<div class="dsn-tg">${ls.map((l) => `<button class="dsn-scbtn" type="button" data-sc="${esc(l.code)}">${esc(scName(l.code))}<small>${esc(l.code)}</small></button>`).join("")}</div>`;
    const sigs = ls.flatMap((l) => [...l.down, ...l.up]);
    if (sigs.length) body += `<ul class="dsn-sigs">${sigs.map(sigLine).join("")}</ul>`;
    else body += `<p class="dsn-note">Pointing, no signal locked yet.</p>`;
    const l = ls.find((x) => x.range) || ls[0];
    if (l && l.range) {
      body += `<p class="dsn-range"><b>${D.fmtRange(l.range)}</b>${l.range > 0.05 * D.AU_KM ? ` <span class="muted">(${D.fmtAU(l.range)})</span>` : ""} · ${D.lightPhrase(l.range)}${l.rtlt ? ` · RTLT ${D.fmtDuration(l.rtlt)}` : ""}</p>`;
    }
  } else if (state === "repair") {
    body = `<p class="dsn-note">${esc(meta.note || "Out of service for repairs.")}</p>`;
  } else if (state === "absent") {
    body = `<p class="dsn-note">Not listed in the feed right now.</p>`;
  } else {
    body = `<p class="dsn-note">${esc(d.activity || "Idle")}${d.el !== null && d.el > 85 ? " · parked facing the zenith" : ""}</p>`;
  }
  if (flags.length) body = `<div class="dsn-flags">${flags.join("")}</div>` + body;
  return body;
}
function renderComplexes() {
  if (!ST.snap) return;
  const ms = clock();
  const sun = D.sunRaDec(ms);
  for (const c of ST.meta.complexes) {
    const card = $("cxGrid").querySelector(`[data-cx="${c.id}"]`);
    if (!card) continue;
    const sunEl = D.raDecToAzEl(sun.ra, sun.dec, c.lat, c.lon, ms).el;
    card.querySelector("[data-clock]").textContent = localClock(ms, c.tz) + " " + tzAbbr(ms, c.tz);
    card.querySelector("[data-sun]").textContent = sunEl > 0 ? "☀ day" : sunEl > -6 ? "twilight" : "☾ night";
    const list = card.querySelector("[data-list]");
    const feedDishes = ST.snap.dishes.filter((d) => (stationOf(d) || {}).id === c.id);
    const names = [...c.dishes.map((x) => x.id), ...feedDishes.map((d) => d.name).filter((n) => !c.dishes.some((x) => x.id === n))];
    const seen = new Set();
    for (const name of names) {
      seen.add(name);
      const d = feedDishes.find((x) => x.name === name) || null;
      const meta = c.dishes.find((x) => x.id === name) || null;
      const state = dishState(d, meta);
      let li = list.querySelector(`[data-dish="${name}"]`);
      if (!li) {
        li = document.createElement("li");
        li.className = "dsn-dish"; li.dataset.dish = name;
        li.innerHTML = `<div class="dsn-dish-ic">${antennaSVG()}<div class="dsn-dish-az">${compassSVG()}<span data-az></span></div></div>
          <div class="dsn-dish-main"><div class="dsn-dish-top"><b>${D.dssLabel(name)}</b><span class="dsn-kind">${esc(meta ? meta.kind : "antenna")}</span><span class="dsn-state" data-st></span></div><div data-body></div></div>`;
        list.appendChild(li);
      }
      li.dataset.state = state;
      const up = d && ST.links.some((l) => l.dish === name && l.up.length && !l.test);
      const dn = d && ST.links.some((l) => l.dish === name && l.down.length && !l.test);
      li.classList.toggle("tx", !!up); li.classList.toggle("rx", !!dn);
      const el = d && d.el !== null ? Math.max(0, Math.min(90, d.el)) : 90;       // unknown: drawn stowed, facing up
      li.querySelector(".dish").style.transform = `rotate(${-el}deg)`;
      const az = d && d.az !== null ? d.az : 0;
      li.querySelector(".ndl").style.transform = `rotate(${az}deg)`;
      li.querySelector("[data-az]").textContent = d && d.az !== null && d.el !== null && state !== "idle" && state !== "repair" ? `${compass(d.az)} ${Math.round(d.az)}°\nup ${Math.round(d.el)}°` : d && d.wind !== null ? `wind ${Math.round(d.wind)} km/h` : "";
      li.querySelector("[data-st]").textContent = { talking: "talking", pointing: "pointing", idle: "idle", repair: "under repair", absent: "not in feed" }[state];
      const html = dishBody(d, meta, state, c);
      const body = li.querySelector("[data-body]");
      if (body._h !== html) { body.innerHTML = html; body._h = html; }
    }
    list.querySelectorAll(".dsn-dish").forEach((li) => { if (!seen.has(li.dataset.dish)) li.remove(); });
  }
}

/* ================================================================== spacecraft card */
function openCard(code) {
  const s = scInfo(code);
  const ls = ST.links.filter((l) => l.code === code && !l.test);
  const l = ls.find((x) => x.range) || ls[0];
  const dishes = ls.map((x) => { const d = ST.snap.dishes.find((y) => y.name === x.dish); const c = stationOf(d); return `${D.dssLabel(x.dish)} (${c ? c.name : "?"})`; });
  const sigs = ls.flatMap((x) => [...x.down, ...x.up]);
  const rows = [];
  if (!s.unknown) {
    rows.push(["Launched", s.launch], ["Destination", s.dest], ["Operator", s.operator]);
  }
  if (dishes.length) rows.push(["Talking to", dishes.join(", ")]);
  if (l && l.range) rows.push(["Distance", `${D.fmtRange(l.range)}${l.range > 0.05 * D.AU_KM ? " · " + D.fmtAU(l.range) : ""}`], ["Light takes", D.fmtDuration(l.range / D.C_KM_S) + " one way"], ["Round trip (RTLT)", D.fmtDuration(l.rtlt)]);
  const body = `
    <div class="dsn-dlg-top"><span class="chip ice">${esc(code)}</span>${s.kind ? `<span class="chip">${esc({ deep: "Interstellar", planet: "Outer planets", mars: "Mars", cruise: "Cruising", l1: "Sun–Earth L1", l2: "Sun–Earth L2", sun: "Heliophysics", moon: "Moon", earth: "Earth orbit" }[s.kind] || s.kind)}</span>` : ""}</div>
    <h3 id="dlgName">${esc(s.name)}</h3>
    ${s.unknown ? `<p>The feed calls this spacecraft <code>${esc(code)}</code>. It is not in this page's list yet${ST.cfg && ST.cfg.spacecraft[code] ? `; DSN Now's own configuration names it “${esc(ST.cfg.spacecraft[code])}”` : ""}.</p>` : `<p class="dsn-dlg-mission">${esc(s.mission)}</p>`}
    <dl class="dsn-dlg-grid">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
    ${sigs.length ? `<ul class="dsn-sigs">${sigs.map(sigLine).join("")}</ul>` : ""}
    ${s.fact ? `<p class="dsn-dlg-fact">${esc(s.fact)}</p>` : ""}
    ${s.url ? `<p><a href="${esc(s.url)}" rel="noopener">Mission page at NASA ↗</a></p>` : ""}
    ${ST.mode === "sample" ? `<p class="hint">Values from the illustrative sample snapshot, not live.</p>` : ""}`;
  $("dlgBody").innerHTML = body;
  const dlg = $("scDlg");
  if (typeof dlg.showModal === "function") { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute("open", "");
}
$("scDlg").addEventListener("click", (e) => { if (e.target === $("scDlg")) $("scDlg").close(); });
$("scDlg").addEventListener("close", () => { ST.selKey = null; if (SC) SC.clearFocus(); $("talkList").querySelectorAll(".dsn-row.on").forEach((x) => x.classList.remove("on")); });

/* ================================================================== sky-coverage map */
const MX = (lon) => (lon + 180) / 360 * 1000, MY = (lat) => (90 - lat) / 180 * 500;
function destPoint(lat, lon, bearing, dist) {
  const r = Math.PI / 180, p1 = lat * r, l1 = lon * r, b = bearing * r, d = dist * r;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [p2 / r, l2 / r];
}
/** Equirectangular outline of a spherical cap (centre lat/lon, radius deg), tiled three times across the seam.
 *  Returns { fill, line }: the fill is closed along the pole when the cap contains one; the line is the
 *  boundary alone (so no seam or pole edges are stroked). */
function capPath(lat, lon, rad) {
  const pts = [];
  for (let i = 0; i <= 180; i++) {
    const [la, lo] = destPoint(lat, lon, i * 2, rad);
    let L = lo;
    if (pts.length) { const p = pts[pts.length - 1][1]; while (L - p > 180) L -= 360; while (L - p < -180) L += 360; }
    pts.push([la, L]);
  }
  const ring = pts.slice();
  const polar = Math.abs(pts[pts.length - 1][1] - pts[0][1]) > 180;
  if (polar) {                                     // the cap contains a pole: close the fill along it
    const pl = D.angDist(lat, lon, 90, 0) < rad ? 90 : -90;
    pts.push([pl, pts[pts.length - 1][1]], [pl, pts[0][1]]);
  }
  const P = (arr, off) => arr.map(([la, lo]) => `${MX(lo + off).toFixed(1)},${MY(la).toFixed(1)}`).join("L");
  let fill = "", line = "";
  for (const off of [-360, 0, 360]) { fill += "M" + P(pts, off) + "Z"; line += "M" + P(ring, off) + (polar ? "" : "Z"); }
  return { fill, line };
}
let mapBuilt = false;
function buildMap() {
  const svg = $("skyMap");
  const mask = ST.meta.meta.elevationMask || 10;
  let g = `<defs><clipPath id="mapClip"><rect width="1000" height="500" rx="6"/></clipPath>
    <radialGradient id="sunG"><stop offset="0" stop-color="#fff6d0"/><stop offset=".35" stop-color="#ffc24b"/><stop offset="1" stop-color="#ffc24b" stop-opacity="0"/></radialGradient></defs>
    <g clip-path="url(#mapClip)">
    <image href="assets/img/earth/earth-albedo.jpg" x="0" y="0" width="1000" height="500" preserveAspectRatio="none" class="map-img"/>
    <rect width="1000" height="500" class="map-dim"/>
    <g class="map-grid">`;
  for (let lo = -150; lo <= 150; lo += 30) g += `<line x1="${MX(lo)}" y1="0" x2="${MX(lo)}" y2="500"/>`;
  for (let la = -60; la <= 60; la += 30) g += `<line x1="0" y1="${MY(la)}" x2="1000" y2="${MY(la)}"${la === 0 ? ' class="eq"' : ""}/>`;
  g += `</g><path id="mapNight" class="map-night" d=""/>`;
  for (const c of ST.meta.complexes) { const cp = capPath(c.lat, c.lon, 90 - mask); g += `<path class="map-cap" style="--c:${c.color}" d="${cp.fill}"/><path class="map-cap-l" style="--c:${c.color}" d="${cp.line}"/>`; }
  g += `<g id="mapDyn"></g>`;
  for (const c of ST.meta.complexes) {
    g += `<g class="map-site" style="--c:${c.color}" transform="translate(${MX(c.lon).toFixed(1)},${MY(c.lat).toFixed(1)})"><path d="M0-7L6 5H-6Z"/><text y="19">${esc(c.name)}</text></g>`;
  }
  g += `</g><rect width="1000" height="500" rx="6" class="map-frame"/>`;
  svg.innerHTML = g;
  $("mapKey").innerHTML = ST.meta.complexes.map((c) => `<span style="--c:${c.color}"><i></i>${esc(c.name)} can see</span>`).join("") +
    `<span class="k-sc"><i></i>Spacecraft being tracked</span><span class="k-idle"><i></i>Not tracked right now</span>`;
  mapBuilt = true;
  renderFacts(mask);
}
function renderMap() {
  if (!ST.snap) return;
  if (!mapBuilt) buildMap();
  const ms = clock();
  const sun = D.sunRaDec(ms);
  const ss = D.subPoint(sun.ra, sun.dec, ms);
  $("mapNight").setAttribute("d", capPath(-ss.lat, D.wrap180(ss.lon + 180), 90).fill);
  let g = "";
  // planets, Moon and Sun as faint landmarks
  const marks = [["Sun", sun, "sun"]];
  for (const [n, b] of [["Moon", "moon"], ["Mars", "mars"], ["Jupiter", "jupiter"]]) {
    const a = D.approxRaDec({ body: b }, ms);
    if (a) marks.push([n, a, b]);
  }
  const bodyPts = marks.map(([n, a, k]) => ({ n, k, ...D.subPoint(a.ra, a.dec, ms) }));
  // tracked spacecraft (grouped when within 4°)
  const groups = [];
  for (const b of ST.beams) {
    const p = D.subPoint(b.ra, b.dec, ms);
    let gr = groups.find((q) => D.angDist(q.lat, q.lon, p.lat, p.lon) < 4);
    if (!gr) { gr = { lat: p.lat, lon: p.lon, names: new Set(), colors: new Set(), codes: [] }; groups.push(gr); }
    b.label.split(" + ").forEach((n) => gr.names.add(n));
    gr.colors.add(CX[b.station].color); gr.codes.push(...b.codes);
  }
  // the three famous far ones, even when no dish has them
  for (const code of ["VGR1", "VGR2", "NHPC"]) {
    if (ST.beams.some((b) => b.codes.includes(code))) continue;
    const s = scInfo(code), a = s.sky && D.approxRaDec(s.sky, ms);
    if (!a) continue;
    const p = D.subPoint(a.ra, a.dec, ms);
    groups.push({ lat: p.lat, lon: p.lon, names: new Set([s.short || s.name]), colors: new Set(), codes: [code], idle: true });
  }
  for (const gr of groups) {
    const near = bodyPts.find((b) => b.k !== "sun" && D.angDist(b.lat, b.lon, gr.lat, gr.lon) < 5);
    if (near) { near.taken = true; gr.at = near.n; }
  }
  for (const b of bodyPts) {
    const x = MX(b.lon), y = MY(b.lat);
    g += b.k === "sun" ? `<g class="map-body sun" transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><circle r="16" fill="url(#sunG)"/><circle r="4.5"/><text y="-12">Sun</text></g>`
      : `<g class="map-body" transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><circle r="3"/>${b.taken ? "" : `<text x="6" y="-5">${b.n}</text>`}</g>`;
  }
  for (const gr of groups) {
    const x = MX(gr.lon), y = MY(gr.lat);
    const cols = [...gr.colors];
    const names = [...gr.names];
    const txt = (gr.at ? gr.at + ": " : "") + (names.length > 3 ? names.slice(0, 2).join(", ") + ` +${names.length - 2}` : names.join(", "));
    const right = x < 700;
    g += `<g class="map-sc${gr.idle ? " idle" : ""}" transform="translate(${x.toFixed(1)},${y.toFixed(1)})">` +
      (gr.idle ? `<circle r="5"/>` : cols.map((c, i) => `<circle r="${6 + i * 3}" style="--c:${c}" class="ring"/>`).join("") + `<circle r="3.2" class="core"/>`) +
      `<text x="${right ? 10 : -10}" y="4" text-anchor="${right ? "start" : "end"}">${esc(txt)}</text></g>`;
  }
  $("mapDyn").innerHTML = g;
}
function renderFacts(mask) {
  const C = ST.meta.complexes;
  const H = C.map((c) => D.hourAngleLimit(c.lat, 0, mask));
  const pairs = [[0, 1], [1, 2], [2, 0]];
  const facts = pairs.map(([a, b]) => {
    const dl = D.norm360(C[b].lon - C[a].lon);
    const ov = H[a] + H[b] - dl;
    const min = ov * 4 * 0.99727;                    // 1° of hour angle = 4 sidereal minutes
    return `<div class="card dsn-fact reveal" style="--a:${C[a].color};--b:${C[b].color}"><span class="k">${esc(C[a].name)} → ${esc(C[b].name)}</span><b>${Math.round(dl)}° apart</b><p>${ov > 0 ? `Both can see a spacecraft on the celestial equator for about <strong>${min >= 60 ? Math.floor(min / 60) + " h " + Math.round(min % 60) + " min" : Math.max(1, Math.round(min)) + " min"}</strong> a day: the hand-over window.` : `There is a gap of about ${Math.round(-min)} minutes when neither sees an equatorial spacecraft above ${mask}°.`}</p></div>`;
  });
  const v2 = scInfo("VGR2").sky;
  const vis = C.map((c) => `${c.name} ${Math.round(D.maxElevation(c.lat, v2.dec))}°`).join(" · ");
  facts.push(`<div class="card dsn-fact reveal" style="--a:#4ef0b8;--b:#b18cff"><span class="k">Voyager 2 · declination ${Math.round(v2.dec)}°</span><b>Canberra only</b><p>Highest elevation it ever reaches: ${esc(vis)}. Far south of the celestial equator, it never rises for the two northern complexes.</p></div>`);
  $("coverFacts").innerHTML = facts.join("");
  $("coverFacts").querySelectorAll(".reveal").forEach((e) => e.classList.add("in"));
}

/* ================================================================== Voyager */
function voyNow() { return D.voyager1(Date.now()); }
function renderVoyagerFeed() {
  const el = $("voyFeed");
  const l = ST.links.find((x) => x.code === "VGR1" && x.range);
  if (!l) { el.textContent = ST.mode === "sample" ? "In the sample snapshot no dish is talking to Voyager 1." : "No dish is talking to Voyager 1 right now; it usually gets several hours a day from a 70 m dish or an array."; return; }
  const m = D.voyager1(ST.mode === "sample" ? ST.sampleT : ST.snap.t);
  const diff = (l.range - m.km) / m.km * 100;
  if (ST.mode === "sample") { el.textContent = `In the sample snapshot (its Voyager range comes from this same model), ${D.dssLabel(l.dish)} shows ${D.fmtRange(l.range)} and RTLT ${D.fmtDuration(l.rtlt)}.`; return; }
  el.innerHTML = `DSN Now${ST.mode === "stale" ? " (last saved copy)" : ""}: ${esc(D.dssLabel(l.dish))} reports ${esc(D.fmtRange(l.range))} and RTLT ${esc(D.fmtDuration(l.rtlt))}. The model above differs by ${Math.abs(diff) < 0.01 ? "less than 0.01" : Math.abs(diff).toFixed(2)}%.`;
}
function tickVoyager() {
  const v = voyNow();
  $("voyKm").textContent = Math.round(v.km).toLocaleString("en-US");
}
function slowVoyager() {
  const now = Date.now(), v = voyNow();
  $("voySub").textContent = `${(v.km / D.AU_KM).toFixed(2)} astronomical units (AU) · moving away at about 17 km/s, plus or minus Earth's own 30 km/s around the Sun`;
  $("voyOw").textContent = D.fmtDuration(v.owlt, { precise: true });
  $("voyRt").textContent = D.fmtDuration(v.rtlt, { precise: false });
  $("voyAU").textContent = (v.helioKm / D.AU_KM).toFixed(2) + " AU";
  const dd = (D.VOY1.refMs - now) / 864e5;
  $("voyLD").textContent = dd > 1 ? `in ${Math.ceil(dd)} days` : dd > 0 ? "today" : "passed, 18 Nov 2026";
  const el = (now - ST.pageOpen) / 1000, frac = el / v.owlt;
  $("helloSent").textContent = "sent " + new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(ST.pageOpen)) + ", when you opened this page";
  $("helloArr").textContent = fmtWhen(ST.pageOpen + v.owlt * 1000);
  $("helloBack").textContent = fmtWhen(ST.pageOpen + v.rtlt * 1000);
  $("helloDot").style.left = Math.min(100, frac * 100).toFixed(4) + "%";
  $("helloPct").textContent = frac < 1 ? `Your hello has travelled ${Math.round(el * D.C_KM_S).toLocaleString("en-US")} km, ${(frac * 100).toFixed(frac < 0.001 ? 5 : 3)}% of the way.` : "Your hello has arrived.";
  renderBudget(v.km);
}
function renderBudget(km) {
  const arr = ST.dish === "arr";
  const Dr = ST.dish === "34" ? 34 : 70;
  const b = D.linkBudget({ km, Dr, arrayArea: arr ? Math.PI / 4 * (70 * 70 + 2 * 34 * 34) : null });
  const f = (x, d = 1) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(d);
  const rx = arr ? "70 m + two 34 m arrayed" : Dr + " m";
  $("budgetT").innerHTML = `<thead><tr><th>Term</th><th>Value</th><th class="num">Decibels</th></tr></thead><tbody>
    <tr><td>Transmitter power P<sub>t</sub></td><td>23 W</td><td class="num">${f(b.PtdBW)} dBW</td></tr>
    <tr><td>Voyager's 3.66 m dish G<sub>t</sub></td><td>× ${D.fmtSci(b.Gt)}</td><td class="num">${f(b.GtdB)} dBi</td></tr>
    <tr><td>Spreading over d = ${esc(D.fmtRange(km))} (L<sub>fs</sub>)</td><td>÷ ${D.fmtSci(b.Lfs)}</td><td class="num">${f(-b.LfsdB)} dB</td></tr>
    <tr><td>Deep Space Network dish G<sub>r</sub> (${rx})</td><td>× ${D.fmtSci(b.Gr)}</td><td class="num">${f(b.GrdB)} dBi</td></tr>
    <tr class="sum"><td>Received power P<sub>r</sub></td><td>${D.fmtSci(b.Pr, "W")}</td><td class="num">${f(b.PrdBm)} dBm</td></tr>
    <tr><td>Receiver noise k<sub>B</sub>T<sub>sys</sub> (25 K)</td><td>${D.fmtSci(b.N0, "W/Hz")}</td><td class="num">${f(b.N0dB)} dBW/Hz</td></tr>
    <tr><td>Signal over noise P<sub>r</sub>/N<sub>0</sub></td><td></td><td class="num">${f(b.CN0)} dB·Hz</td></tr>
    <tr><td>Needed E<sub>b</sub>/N<sub>0</sub> with margin</td><td></td><td class="num">−7.0 dB</td></tr></tbody>`;
  $("rateOut").textContent = D.fmtRate(b.Rb);
  const pos = (x) => Math.max(0, Math.min(100, (Math.log10(x) - 1) / 3 * 100));   // 10 bit/s … 10 kbit/s
  $("rateBar").style.setProperty("--r", pos(b.Rb) + "%");
  $("rateBar").style.setProperty("--m", pos(160) + "%");
  $("rateBar").classList.toggle("short", b.Rb < 160);
}
$("dishSeg").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  ST.dish = b.dataset.d;
  $("dishSeg").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
  renderBudget(voyNow().km);
});

/* ================================================================== history strip */
function buildHistory() {
  $("histTrack").innerHTML = `<ol>${ST.meta.history.map((h, i) => `<li class="dsn-hist" style="--i:${i}"><span class="dsn-hist-y">${esc(h.year)}</span><h3>${esc(h.title)}</h3><p>${esc(h.text)}</p></li>`).join("")}</ol>`;
  const tr = $("histTrack");
  const step = () => (tr.querySelector(".dsn-hist") || { offsetWidth: 300 }).offsetWidth + 16;
  $("histPrev").addEventListener("click", () => tr.scrollBy({ left: -step(), behavior: RM ? "auto" : "smooth" }));
  $("histNext").addEventListener("click", () => tr.scrollBy({ left: step(), behavior: RM ? "auto" : "smooth" }));
}

/* ================================================================== KaTeX */
function renderTex() {
  if (!window.katex) return;
  document.querySelectorAll("[data-tex]").forEach((el) => {
    try { window.katex.render(el.dataset.tex, el, { displayMode: true, throwOnError: false }); } catch (e) { el.textContent = el.dataset.tex; }
  });
}

/* ================================================================== 3D */
let SC = null;
async function initScene() {
  if (!(window.Codex && window.Codex.webgl())) {
    $("loading").classList.add("done");
    $("stage").innerHTML = '<div class="dsn-nogl"><p>This 3D view needs WebGL. Everything below works without it.</p></div>';
    return;
  }
  const THREE = await import("three");
  const { createScene } = await import("./dsn-scene.js");
  const load = (url) => new Promise((res) => new THREE.TextureLoader().load(url, (t) => { t.wrapS = THREE.RepeatWrapping; res(t); }, undefined, () => {
    const d = new THREE.DataTexture(new Uint8Array([20, 40, 80, 255]), 1, 1); d.needsUpdate = true; res(d);
  }));
  const [albedo, data, normal, clouds, starData] = await Promise.all([
    load("assets/img/earth/earth-albedo.jpg"), load("assets/img/earth/earth-data.png"), load("assets/img/earth/earth-normal.jpg"),
    load("assets/img/earth/earth-clouds.jpg"), fetch("data/sky/stars.json").then((r) => r.json()).catch(() => null)
  ]);
  SC = createScene($("stage"), {
    tex: { albedo, data, normal, clouds }, starData, complexes: ST.meta.complexes, clock,
    still: STILL, reduced: RM, mask: ST.meta.meta.elevationMask, onUserMove: () => setSpin(false)
  });
  if (ST.beams.length) SC.setBeams(ST.beams);
  // start facing the busiest complex
  const busiest = ST.meta.complexes.map((c) => [c.id, busyCount(c.id).busy]).sort((a, b) => b[1] - a[1])[0];
  SC.focusComplex(busiest ? busiest[0] : "gdscc", true);
  if (STILL) { $("loading").style.transition = "none"; document.body.classList.add("dsn-still"); }
  SC.onFrame((L) => { if (!placeLabels.shown) { placeLabels.shown = true; $("loading").classList.add("done"); } placeLabels(L); });
  let heroVisible = true;
  new IntersectionObserver((en) => { heroVisible = en[0].isIntersecting; SC.setRunning(heroVisible && !document.hidden); }).observe($("hero"));
  document.addEventListener("visibilitychange", () => SC.setRunning(heroVisible && !document.hidden));
  if (STILL || RM) setSpin(false);
  window.__sim.scene = SC;
}
function setSpin(on) {
  $("spinBtn").setAttribute("aria-pressed", on ? "true" : "false");
  if (SC) SC.setAutoRotate(on);
}
$("spinBtn").addEventListener("click", () => setSpin($("spinBtn").getAttribute("aria-pressed") !== "true"));
$("retryBtn").addEventListener("click", async () => {
  $("retryBtn").disabled = true; $("retryBtn").textContent = "Trying…";
  const prev = ST.mode;
  if (OFFLINE) { location.search = ""; return; }
  await poll(true);
  $("retryBtn").disabled = false;
  $("retryBtn").textContent = ST.mode === "sample" || ST.mode === prev && prev !== "live" ? "Still unreachable · try again" : "Try live data again";
});

/* ================================================================== boot */
window.__sim = {
  state: ST, scene: null, ready: false,
  reload: () => poll(true),
  setXML(xml) { const snap = D.parseDSN(xml); ST.mode = "live"; ST.fetchedAt = Date.now(); $("sampleBar").hidden = true; apply(snap); return snap.dishes.length; },
  focus: (key) => SC && SC.focusBeam(key),
  open: (code) => openCard(code)
};

(async function boot() {
  try {
    ST.meta = await fetch("data/dsn.json").then((r) => r.json());
  } catch (e) {
    $("statusTxt").textContent = "Could not load this page's data file";
    $("loading").classList.add("done");
    return;
  }
  CX = Object.fromEntries(ST.meta.complexes.map((c) => [c.id, c]));
  for (const c of ST.meta.complexes) for (const d of c.dishes) DISHMETA[d.id] = { cx: c.id, ...d };
  buildDock(); buildCxLabels(); buildComplexes(); buildHistory(); renderTex();
  const cc = lsGet(LS_CFG); if (cc && cc.cfg) ST.cfg = cc.cfg;
  // show something at once: the saved snapshot if it is fresh, the sample if asked
  if (OFFLINE) useSample(true);
  else {
    const c = lsGet(LS_SNAP);
    if (c && c.xml && Date.now() - c.t < 60000) { try { ST.mode = "stale"; ST.fetchedAt = c.t; apply(D.parseDSN(c.xml)); } catch (e) { ST.mode = "loading"; } }
  }
  initScene().catch((e) => { console.warn("DSN 3D view failed", e); $("loading").classList.add("done"); });
  if (!OFFLINE) poll(true);
  slowVoyager(); tickVoyager();
  setInterval(tickVoyager, STILL ? 60000 : 100);
  setInterval(() => { slowVoyager(); setStatus(); renderDock(); }, 1000);
  setInterval(() => { renderMap(); renderComplexes(); }, 10000);
  (function loop() { tickTracks(); if (!STILL) requestAnimationFrame(loop); })();
})();
