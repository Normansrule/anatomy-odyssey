/* Space Weather, live (space-weather.html)
 *
 * Data flow: NOAA SWPC JSON feeds ─► space-weather-data.js (sanitise, normalise, cache 5–15 min)
 *   ─► physics (space-weather-physics.js: ram pressure, Shue magnetopause, bow shock, coupling)
 *   ─► 3D scene (space-weather-scene.js) + dashboard charts (space-weather-charts.js) + explainer.
 * If the solar-wind feeds cannot be reached and nothing is cached, the whole page switches to a
 * clearly labelled sample of the May 2024 storm (data/space-weather-fallback.json).
 *
 * URL flags: ?offline (force the sample), ?still (freeze animation for screenshots).
 * Test hooks: window.__sim = { scene, state, setView, setWind, launchCME, reload }.
 */
import * as D from "./space-weather-data.js";
import * as P from "./space-weather-physics.js";
import * as C from "./space-weather-charts.js";

const Q = new URLSearchParams(location.search);
const STILL = Q.has("still");
let OFFLINE = Q.has("offline");
const RM = !!(window.Codex && window.Codex.reducedMotion);
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (v, d = 0) => (isFinite(v) ? v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d }) : "—");
const ago = (ms) => {
  if (!isFinite(ms)) return "";
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return "just now";
  if (m < 90) return m + " min ago";
  if (m < 48 * 60) return Math.round(m / 60) + " h ago";
  return Math.round(m / 1440) + " days ago";
};
const kpColor = { quiet: "var(--k-quiet)", active: "var(--k-active)", g1: "var(--k-g1)", g3: "var(--k-g3)" };

const PLACES = {
  la: { name: "Los Angeles", lat: 34.05, lon: -118.24 }, sea: { name: "Seattle", lat: 47.61, lon: -122.33 },
  msp: { name: "Minneapolis", lat: 44.98, lon: -93.27 }, anc: { name: "Anchorage", lat: 61.22, lon: -149.9 },
  rek: { name: "Reykjavík", lat: 64.15, lon: -21.94 }, tro: { name: "Tromsø", lat: 69.65, lon: 18.96 },
  lon: { name: "London", lat: 51.51, lon: -0.13 }, hob: { name: "Hobart", lat: -42.88, lon: 147.33 }
};

/* ================================================================== state */
const ST = {
  mode: "loading",            // live | sample
  feeds: {}, status: {}, hist: [], now: Date.now(),
  cur: {}, derived: {}, observer: { key: "la", ...PLACES.la },
  grid: null, gridModel: false, sample: null, drive3d: false
};
try {
  const o = D.lsGet("cl-sw-observer");
  if (o && isFinite(o.lat) && isFinite(o.lon)) ST.observer = o;
  const tz = D.lsGet("cl-sw-tz"); if (tz === "utc") C.TZ.mode = "utc";
} catch (e) { /* ignore */ }
// How far away aurora can be seen (spherical geometry, space-weather-physics.js):
const REACH = P.auroraReach(150, 5);       // by eye: top of the green glow (~150 km) 5° above the horizon ≈ 8.3°
const REACH_CAM = P.auroraReach(200, 5);   // camera: fainter red glow (~200 km) 5° up ≈ 10°

/* ================================================================== 3D (lazy: the page still works without WebGL) */
let SC = null;
async function initScene() {
  if (!(window.Codex && window.Codex.webgl())) {
    $("loading").classList.add("done");
    $("stage").innerHTML = '<div class="sw-nogl"><p>This 3D view needs WebGL. The dashboard below works without it.</p></div>';
    return;
  }
  const THREE = await import("three");
  const { createScene } = await import("./space-weather-scene.js");
  const load = (url, srgb) => new Promise((res) => new THREE.TextureLoader().load(url, (t) => { if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; res(t); }, undefined, () => {
    const d = new THREE.DataTexture(new Uint8Array([20, 40, 80, 255]), 1, 1); d.needsUpdate = true; res(d);
  }));
  const [albedo, data, normal, clouds, starData] = await Promise.all([
    load("assets/img/earth/earth-albedo.jpg"), load("assets/img/earth/earth-data.png"), load("assets/img/earth/earth-normal.jpg"),
    load("assets/img/earth/earth-clouds.jpg"), fetch("data/sky/stars.json").then((r) => r.json()).catch(() => null)
  ]);
  SC = createScene($("stage"), { tex: { albedo, data, normal, clouds }, starData, still: STILL, reduced: RM });
  SC.onFrame((L, info) => { if (!labels.shown) { labels.shown = true; $("loading").classList.add("done"); } labels(L, info); });
  // pause when the hero is off screen or the tab is hidden
  let heroVisible = true;
  new IntersectionObserver((en) => { heroVisible = en[0].isIntersecting; SC.setRunning(heroVisible && !document.hidden); }).observe($("hero"));
  document.addEventListener("visibilitychange", () => SC.setRunning(heroVisible && !document.hidden));
}

/* ================================================================== labels over the 3D view */
const lblEls = {};
document.querySelectorAll(".sw-lbl").forEach((e) => { lblEls[e.dataset.k] = e; });
function labels(L, info) {
  const show = {
    bow: info.view === "magnetosphere", mp: info.view === "magnetosphere", tail: info.view === "magnetosphere",
    wind: info.view !== "aurora", l1: info.view === "magnetosphere", geo: info.view === "magnetosphere" && info.camD < 160,
    sun: info.view === "system", obs: info.view === "aurora"
  };
  for (const k in lblEls) {
    const p = L[k], e = lblEls[k];
    let on = show[k] && p && p.vis;
    // on narrow screens the tail label can land on the geostationary label: drop the tail one
    if (on && k === "tail" && show.geo && L.geo && L.geo.vis) {
      const g = lblEls.geo, gw = g._w || (g._w = g.offsetWidth), gh = g._h || (g._h = g.offsetHeight), tw = e._w || (e._w = e.offsetWidth);
      if (p.x < L.geo.x + gw && p.x + tw > L.geo.x && Math.abs(p.y - L.geo.y) < gh) on = false;
    }
    e.classList.toggle("on", !!on);
    if (on) e.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
  }
  $("lBow").textContent = fmt(info.shown.rbs, 1) + " R⊕ from Earth";
  $("lMp").textContent = fmt(info.shown.r0, 1) + " R⊕ at the nose";
}

/* ================================================================== loading data */
async function loadAll(force) {
  setStatus("loading", "Connecting to NOAA…");
  const keys = Object.keys(D.FEEDS);
  const res = await Promise.all(keys.map((k) => D.loadFeed(k, { offline: OFFLINE, force })));
  keys.forEach((k, i) => { ST.feeds[k] = res[i].data; ST.status[k] = res[i]; });
  if (OFFLINE && ST.sample) return useSample();
  const haveWind = ST.feeds.wind && ST.feeds.wind.length && ST.feeds.mag && ST.feeds.mag.length;
  if (!haveWind) return useSample();
  ST.mode = "live";
  ST.now = Date.now();
  ST.hist = D.mergeHistory(ST.feeds.wind, ST.feeds.mag, true);
  ST.grid = ST.feeds.aurora ? D.unb64(ST.feeds.aurora.grid) : null;
  $("sampleBar").hidden = true;
  const st = ST.status.wind.status;
  const newest = Math.max(ST.status.wind.t, ST.status.mag.t);
  if (st === "live" || st === "cached") setStatus("live", `Live · NOAA SWPC · updated ${ago(newest)}`);
  else setStatus("stale", `Offline · last NOAA data from ${ago(newest)}`);
  render();
}

async function useSample() {
  if (!ST.sample) ST.sample = await fetch("data/space-weather-fallback.json").then((r) => r.json()).catch(() => null);
  if (!ST.sample) { setStatus("stale", "No data: NOAA unreachable and the sample failed to load"); return; }
  const f = D.sampleToFeeds(ST.sample);
  ST.mode = "sample";
  ST.feeds = { wind: f.wind, mag: f.mag, kp: f.kp, kpf: f.kpf, scales: f.scales, xray: f.xray, alerts: f.alerts, aurora: null };
  for (const k of Object.keys(D.FEEDS)) ST.status[k] = { status: "sample", t: f.now };
  ST.now = f.now;
  ST.hist = D.mergeHistory(f.wind, f.mag, false);
  ST.grid = null;
  $("sampleBar").hidden = false;
  $("sampleTitle").textContent = ST.sample.meta.label;
  $("sampleNote").textContent = (OFFLINE && !Q.has("offline") ? "You chose to replay it. " : "NOAA could not be reached, so this is a replay, not live data. ") + "Curves are a reconstruction pinned to published values.";
  $("sampleNote").title = ST.sample.meta.note;
  setStatus("sample", "Sample · May 2024 storm, not live");
  render();
}

function setStatus(state, txt) {
  $("status").dataset.state = state;
  $("statusTxt").textContent = txt;
}

/* ================================================================== derive "now" */
function derive() {
  const f = ST.feeds;
  const v = D.latest(f.wind, 1), n = D.latest(f.wind, 2), T = D.latest(f.wind, 3);
  const bz = D.latest(f.mag, 1), by = D.latest(f.mag, 2), bt = D.latest(f.mag, 3);
  const cur = { v: v.v, n: n.v, T: T.v, bz: bz.v, by: by.v, bt: bt.v, t: Math.max(v.t || 0, bz.t || 0) };
  const src = (f.wind[f.wind.length - 1] || [])[4] || "";
  const dp = P.dynPressure(cur.n, cur.v);
  const sh = P.shue(cur.bz, dp);
  const mach = P.machMS(cur.v, cur.n, cur.bt, cur.T);
  const kpObs = (f.kp || []).filter((r) => r[0] <= ST.now);
  const kpNow = kpObs.length ? kpObs[kpObs.length - 1][1] : NaN;
  const xr = f.xray || [];
  const xNow = xr.length ? xr[xr.length - 1][1] : NaN;
  ST.cur = cur;
  ST.derived = { dp, r0: sh.r0, alpha: sh.alpha, rbs: P.bowShock(sh.r0, mach), mach, kpNow, xNow, src,
    coupling: P.newell(cur.v, cur.by, cur.bz), lagMin: P.L1_KM / cur.v / 60 };
}

/* ================================================================== render everything */
function render() {
  derive();
  heroReadouts();
  if (SC && !ST.drive3d) SC.setWind(ST.cur);
  if (SC) SC.setTime(ST.mode === "sample" ? ST.now : Date.now());
  auroraGrid();
  verdict();
  gauges();
  kpChart();
  windCharts();
  xrayChart();
  alertsList();
  ovationMaps();
  coupling();
  if (!mpTouched) mpFromLive();
  $("lagTxt").textContent = isFinite(ST.derived.lagMin) ? `about ${Math.round(ST.derived.lagMin)} minutes` : "about an hour";
}

function heroReadouts() {
  const c = ST.cur, d = ST.derived;
  $("rV").innerHTML = `${fmt(c.v)}<small>km/s</small>`;
  $("rN").innerHTML = `${fmt(c.n, 1)}<small>/cm³</small>`;
  const south = c.bz < 0;
  $("rBz").innerHTML = `${c.bz > 0 ? "+" : ""}${fmt(c.bz, 1)}<small>nT ${isFinite(c.bz) ? (south ? "south" : "north") : ""}</small>`;
  $("rBz").closest(".readout").dataset.south = south && c.bz < -5 ? "1" : "0";
  $("rBt").innerHTML = `${fmt(c.bt, 1)}<small>nT</small>`;
  $("rP").innerHTML = `${fmt(d.dp, d.dp < 10 ? 2 : 1)}<small>nPa</small>`;
  $("rR0").innerHTML = `${fmt(d.r0, 1)}<small>R⊕</small>`;
  $("rR0").closest(".readout").dataset.alert = d.r0 < 6.62 ? "1" : "0";
  $("rKp").textContent = P.kpText(d.kpNow);
  $("rX").textContent = P.flareClass(d.xNow);
  $("rLag").textContent = isFinite(d.lagMin) ? Math.round(d.lagMin) + " min" : "—";
  $("lWind").textContent = fmt(c.v) + " km/s →";
  const src = String(d.src || "L1").toUpperCase();
  $("srcChip").textContent = ST.mode === "sample" ? "sample" : src;
  $("srcChip").className = "chip " + (ST.mode === "sample" ? "sol" : "ice");
  $("srcChip").title = ST.mode === "sample" ? "Reconstructed sample, not a measurement" : "Spacecraft NOAA currently marks as the active real-time solar wind source";
  $("ageTxt").textContent = ST.mode === "sample"
    ? `Reconstructed values for ${C.fmtTime(ST.now)}.`
    : `Measured ${ago(c.t)} at L1 (${C.fmtTime(c.t)}). Magnetopause from Shue et al. (1998).`;
  const sc = ST.feeds.scales && ST.feeds.scales.cur;
  const mini = ["R", "S", "G"].map((L) => {
    if (!sc || !sc[L] || !isFinite(sc[L].s)) return `<span class="sw-ms" title="NOAA scales unavailable"><b>${L}–</b>n/a</span>`;
    const v = sc[L].s;
    return `<span class="sw-ms lv-${v}" title="${L}${v} ${P.SCALE_WORDS[v]}"><b>${L}${v}</b>${P.SCALE_WORDS[v]}</span>`;
  }).join("");
  $("miniScales").innerHTML = mini;
}

/* ------------------------------------------------------------------ aurora grid (OVATION or Kp model) */
function auroraGrid() {
  if (ST.grid) { ST.gridModel = false; if (SC) SC.setAurora(ST.grid); return; }
  // modelled from Kp: used only for the sample or when OVATION is unreachable (and labelled as such)
  if (!isFinite(ST.derived.kpNow)) { ST.modelGrid = null; ST.gridModel = false; if (SC) SC.setAurora(new Uint8Array(360 * 181)); return; }
  const g = new Uint8Array(360 * 181);
  const kp = ST.derived.kpNow;
  for (let la = -90; la <= 90; la++) for (let lo = 0; lo < 360; lo++) g[(la + 90) * 360 + lo] = Math.round(P.ovalModel(kp, la, lo > 180 ? lo - 360 : lo, ST.now));
  ST.modelGrid = g; ST.gridModel = true;
  if (SC) SC.setAurora(g);
}
function gridAt(g, lat, lon) {
  let lo = Math.round(lon) % 360; if (lo < 0) lo += 360;
  return g[(Math.round(lat) + 90) * 360 + lo];
}

/* ------------------------------------------------------------------ "Could I see the aurora tonight?" */
function verdict() {
  const o = ST.observer;
  const g = ST.grid || ST.modelGrid;
  const nowMs = ST.mode === "sample" ? ST.now : Date.now();
  const ml = P.magLat(o.lat, o.lon);
  const dirWord = ml >= 0 ? "northern" : "southern";
  const needH = P.kpNeeded(Math.abs(ml), REACH), needC = P.kpNeeded(Math.abs(ml), REACH_CAM), needO = P.kpNeeded(Math.abs(ml), 0);
  const dw = P.darkWindow(nowMs, o.lat, o.lon);
  const darkNow = P.sunAlt(nowMs, o.lat, o.lon) < -12;
  // Kp expected tonight: forecast bins overlapping the dark window, else the latest observation
  const kpNow = ST.derived.kpNow;
  let kpT = kpNow;
  if (dw && ST.feeds.kpf) {
    const bins = ST.feeds.kpf.filter((r) => r[0] + 3 * 3600000 > dw.start && r[0] < dw.end);
    if (bins.length) kpT = Math.max(...bins.map((r) => r[1]), darkNow ? kpNow : 0);
  }
  if (ST.mode === "sample" && ST.feeds.kpf) {
    const bins = ST.feeds.kpf.filter((r) => dw && r[0] + 3 * 3600000 > dw.start && r[0] < dw.end);
    if (bins.length) kpT = Math.max(...bins.map((r) => r[1]));
  }
  // OVATION: probability overhead and the best within sight (only meaningful if it is dark now)
  let here = 0, best = 0;
  if (g) {
    here = gridAt(g, o.lat, o.lon);
    for (let la = Math.max(-90, Math.floor(o.lat - REACH)); la <= Math.min(90, Math.ceil(o.lat + REACH)); la++) {
      const span = REACH / Math.max(0.1, Math.cos(la * P.DEG));
      for (let lo = Math.floor(o.lon - span); lo <= Math.ceil(o.lon + span); lo++) {
        if (P.angDist(o.lat, o.lon, la, lo) <= REACH) best = Math.max(best, gridAt(g, la, lo));
      }
    }
  }
  let level, word, why;
  const ovTxt = g ? ` The ${ST.gridModel ? "Kp-based oval model" : "OVATION forecast"} gives ${here}% overhead and up to ${best}% within sight.` : "";
  if (!dw) { level = "none"; word = "No dark sky"; why = `The Sun doesn't get more than 12° below the horizon at ${o.name} in the next day, so the sky never gets dark enough.`; }
  else if (kpT >= needO || (darkNow && here >= 30)) { level = "yes"; word = darkNow ? "Yes, look up" : "Yes, once it's dark"; }
  else if (kpT >= needH || (darkNow && best >= 30)) { level = "likely"; word = `Likely${darkNow ? "" : " after dark"}, low in the ${ml >= 0 ? "north" : "south"}`; }
  else if (kpT >= needC || (darkNow && best >= 10)) { level = "maybe"; word = "Maybe, with a camera"; }
  else { level = "no"; word = "Not tonight"; }
  if (dw) {
    const dark = (dw.now ? `It is dark there now until ${C.fmtTime(dw.end, false)}` : `Dark there from ${C.fmtTime(dw.start, false)} to ${C.fmtTime(dw.end, false)}`) + (C.TZ.mode === "utc" ? "" : " your time");
    const k = (x) => (x > 9 ? "beyond 9" : x < 1 ? "0 to 1" : fmt(Math.ceil(x * 3 - 0.5) / 3, 0));
    const need = needO < 1.5 ? `you live under the auroral oval itself: on a clear, dark night even a quiet Kp 1 or 2 can put aurora overhead` : needC > 9 ? `even Kp 9 is rarely enough for a glow on the ${dirWord} horizon: it takes a Carrington-class storm` : `a phone camera could catch a glow low on the ${dirWord} horizon from about Kp ${k(needC)}, your eyes from Kp ${k(needH)}, and it would be overhead at Kp ${k(needO)}`;
    const kpTxt = !isFinite(kpNow) ? "The K-index is unavailable right now." : `Kp ${P.kpText(kpNow)} now${isFinite(kpT) && kpT !== kpNow ? ", up to " + P.kpText(kpT) + " expected tonight" : ""}.`;
    why = `${kpTxt} From ${o.name} (geomagnetic latitude ${fmt(Math.abs(ml), 0)}°${ml >= 0 ? " N" : " S"}) ${need}. ${dark}.${darkNow ? ovTxt : ""}`;
  }
  $("verdict").dataset.level = level;
  $("vWord").textContent = word;
  $("vWhy").textContent = why;
  $("lObs").textContent = o.name;
  if (SC) SC.setObserver(o.lat, o.lon, REACH);
}

/* ------------------------------------------------------------------ NOAA scale gauges */
function gauges() {
  const sc = ST.feeds.scales;
  const host = $("gauges");
  if (!sc || !sc.cur) { host.innerHTML = '<p class="muted">NOAA scales unavailable right now.</p>'; return; }
  const names = { R: "Radio blackouts", S: "Solar radiation storms", G: "Geomagnetic storms" };
  host.innerHTML = "";
  for (const L of ["R", "S", "G"]) {
    const div = document.createElement("div"); div.className = "sw-gauge"; host.appendChild(div);
    const v = sc.cur[L] && isFinite(sc.cur[L].s) ? sc.cur[L].s : 0;
    const m24 = sc.max24 && sc.max24[L] && isFinite(sc.max24[L].s) ? sc.max24[L].s : NaN;
    const f1 = sc.fc && sc.fc[0] && sc.fc[0][L];
    let fc = "";
    if (f1) {
      if (L === "R" && isFinite(f1.minor)) fc = `<span class="chip">Tomorrow: R1–R2 ${f1.minor}%</span><span class="chip">R3+ ${f1.major}%</span>`;
      else if (L === "S" && isFinite(f1.p)) fc = `<span class="chip">Tomorrow: S1+ ${f1.p}%</span>`;
      else if (L === "G" && isFinite(f1.s)) fc = `<span class="chip ${f1.s ? "flame" : ""}">Tomorrow: G${f1.s} ${P.SCALE_WORDS[f1.s]}</span>`;
    }
    C.gauge(div, { letter: L, name: names[L], value: v, max24: m24, fc, words: P.SCALE_WORDS });
  }
  $("scalesAge").textContent = feedAge("scales");
}
function feedAge(k) {
  const s = ST.status[k];
  if (!s) return "";
  if (s.status === "sample") return "sample";
  if (s.status === "failed") return "unavailable";
  return (s.status === "stale" ? "offline copy, " : "") + "fetched " + ago(s.t);
}

/* ------------------------------------------------------------------ Kp bars */
function kpChart() {
  const kp = ST.feeds.kp || [], kpf = ST.feeds.kpf || [];
  const host = $("kpChart");
  if (!kp.length) { host.innerHTML = '<p class="muted">K-index unavailable right now.</p>'; return; }
  const lastObs = kp[kp.length - 1][0];
  const x0 = lastObs - 3 * 86400000 + 3 * 3600000;
  const fc = kpf.filter((r) => r[0] > lastObs && /pred/i.test(r[2] || "predicted"));
  const x1 = Math.max(lastObs + 3 * 3600000, fc.length ? fc[fc.length - 1][0] + 3 * 3600000 : 0);
  const bars = kp.filter((r) => r[0] >= x0).map((r) => ({ t0: r[0], t1: r[0] + 3 * 3600000, v: r[1], fc: false, band: P.kpBand(r[1]).key }))
    .concat(fc.map((r) => ({ t0: r[0], t1: r[0] + 3 * 3600000, v: r[1], fc: true, band: P.kpBand(r[1]).key })));
  const peak = Math.max(...bars.filter((b) => !b.fc).map((b) => b.v));
  C.barChart(host, {
    x0, x1, bars, nowT: ST.now, h: innerWidth < 600 ? 200 : 236,
    aria: `Bar chart of the planetary K-index over the last three days, peaking at Kp ${P.kpText(peak)}, followed by the NOAA forecast.`,
    tip: (b) => `<b>${C.fmtTime(b.t0)} – ${C.fmtTime(b.t1, false)}</b><br>Kp <b>${P.kpText(b.v)}</b> (${b.v.toFixed(2)}) · ${P.kpBand(b.v).label}${b.fc ? "<br><i>NOAA forecast</i>" : ""}`
  });
  $("kpLegend").innerHTML = [["quiet", "Quiet, Kp 0–3"], ["active", "Active, Kp 4"], ["g1", "G1–G2 storm, Kp 5–6"], ["g3", "G3–G5 storm, Kp 7–9"]]
    .map(([k, l]) => `<span><i style="--c:${kpColor[k]}"></i>${l}</span>`).join("") + `<span><i class="fc"></i>Forecast</span>`;
  $("kpTable").innerHTML = "<thead><tr><th>Start</th><th>Kp</th><th>Level</th></tr></thead><tbody>" +
    bars.map((b) => `<tr><td>${C.fmtTime(b.t0)}${b.fc ? " (forecast)" : ""}</td><td class="num">${P.kpText(b.v)}</td><td>${P.kpBand(b.v).label}</td></tr>`).join("") + "</tbody>";
  $("kpAge").textContent = feedAge("kp");
}

/* ------------------------------------------------------------------ solar wind panels */
const windGroup = [];
function windCharts() {
  const h = ST.hist;
  const hosts = [$("chV"), $("chN"), $("chBz")];
  if (!h.length) { hosts.forEach((e) => { e.innerHTML = '<p class="muted">No solar wind data.</p>'; }); return; }
  const x1 = h[h.length - 1][0] + 5 * 60000;
  const x0 = Math.max(h[0][0], x1 - 7 * 86400000);
  windGroup.length = 0; windGroup.push(...hosts);
  const V = h.map((r) => [r[0], r[1]]), N = h.map((r) => [r[0], r[2]]), BZ = h.map((r) => [r[0], r[4]]), BT = h.map((r) => [r[0], r[5]]);
  const span = x1 - x0;
  const spanTxt = span > 36 * 3600000 ? fmt(span / 86400000, 1) + " days" : fmt(span / 3600000, 0) + " hours";
  const vmax = Math.max(600, ...V.map((p) => p[1]).filter(isFinite));
  const vTop = Math.ceil(vmax / 200) * 200;
  const nmax = Math.max(10, ...N.map((p) => p[1]).filter(isFinite));
  const nTop = nmax > 40 ? Math.ceil(nmax / 20) * 20 : Math.ceil(nmax / 10) * 10;
  const bmax = Math.max(10, ...BT.map((p) => p[1]).filter(isFinite), ...BZ.map((p) => Math.abs(p[1])).filter(isFinite));
  const bTop = Math.ceil(bmax / 10) * 10;
  const tipFor = (lab, unit, d) => (t, vals) => `<b>${C.fmtTime(t)}</b><br>${lab} <b>${fmt(vals[0], d)}</b> ${unit}${vals[1] !== undefined && isFinite(vals[1]) ? `<br>B<sub>t</sub> ${fmt(vals[1], 1)} nT` : ""}`;
  const H = innerWidth < 600 ? 110 : 128;
  C.lineChart(hosts[0], { x0, x1, h: H, group: windGroup, aria: `Solar wind speed over the last ${spanTxt}`,
    y: { min: 200, max: vTop, ticks: range(200, vTop, vTop > 1000 ? 400 : 200), label: "km/s" },
    series: [{ data: V, color: "var(--ice)", area: true }], tip: tipFor("Speed", "km/s", 0) });
  C.lineChart(hosts[1], { x0, x1, h: H, group: windGroup, aria: `Solar wind proton density over the last ${spanTxt}`,
    y: { min: 0, max: nTop, ticks: range(0, nTop, nTop / 2), label: "/cm³" },
    series: [{ data: N, color: "var(--nebula)", area: true }], tip: tipFor("Density", "protons/cm³", 1) });
  C.lineChart(hosts[2], { x0, x1, h: H + 12, group: windGroup, aria: `Interplanetary magnetic field Bz over the last ${spanTxt}, negative values mean southward`,
    y: { min: -bTop, max: bTop, ticks: range(-bTop, bTop, bTop / 2), label: "nT" },
    hlines: [{ y: 0, cls: "zero" }],
    series: [{ data: BZ, color: "var(--text-2)", signed: true }, { data: BT, color: "var(--faint)", cls: "sw-env" }, { data: BT.map((p) => [p[0], -p[1]]), color: "var(--faint)", cls: "sw-env" }],
    tip: (t, vals) => `<b>${C.fmtTime(t)}</b><br>B<sub>z</sub> <b>${fmt(vals[0], 1)}</b> nT ${vals[0] < 0 ? "(south: energy flows in)" : "(north)"}<br>B<sub>t</sub> ${fmt(vals[1], 1)} nT` });
  $("pV").textContent = fmt(ST.cur.v) + " km/s";
  $("pN").textContent = fmt(ST.cur.n, 1) + " /cm³";
  $("pBz").textContent = (ST.cur.bz > 0 ? "+" : "") + fmt(ST.cur.bz, 1) + " nT";
  $("windAge").textContent = (ST.mode === "sample" ? "sample" : feedAge("wind")) + " · showing " + spanTxt;
}
function range(a, b, s) { const o = []; for (let v = a; v <= b + 1e-9; v += s) o.push(+v.toFixed(6)); return o; }

/* ------------------------------------------------------------------ GOES X-rays */
function xrayChart() {
  const xr = (ST.feeds.xray || []).filter((r) => !r[2]);
  const host = $("chX");
  if (!xr.length) { host.innerHTML = '<p class="muted">GOES X-ray data unavailable right now.</p>'; return; }
  const x1 = xr[xr.length - 1][0] + 10 * 60000, x0 = x1 - 7 * 86400000;
  // flare peaks ≥ M1: local maxima separated by at least 2 hours
  const peaks = [];
  for (let i = 1; i < xr.length - 1; i++) {
    const f = xr[i][1];
    if (f < 1e-5 || f < xr[i - 1][1] || f < xr[i + 1][1]) continue;
    const last = peaks[peaks.length - 1];
    if (last && xr[i][0] - last.t < 2 * 3600000) { if (f > last.y) Object.assign(last, { t: xr[i][0], y: f }); continue; }
    peaks.push({ t: xr[i][0], y: f });
  }
  const shown = peaks.sort((a, b) => b.y - a.y).slice(0, innerWidth < 600 ? 4 : 8).map((p) => ({ ...p, text: P.flareClass(p.y) }));
  C.lineChart(host, {
    x0, x1, h: innerWidth < 600 ? 210 : 300, rpad: 26,
    aria: `Logarithmic plot of solar X-ray flux over 7 days. Largest flare: ${shown[0] ? shown[0].text : "below M1"}.`,
    y: { min: 1e-9, max: 1e-3, log: true, ticks: [1e-9, 1e-8, 1e-7, 1e-6, 1e-5, 1e-4, 1e-3], fmt: (v) => "10" + sup(Math.round(Math.log10(v))), label: "W/m²" },
    bands: [{ y0: 1e-9, y1: 1e-7, label: "A", cls: "b0" }, { y0: 1e-7, y1: 1e-6, label: "B", cls: "b1" }, { y0: 1e-6, y1: 1e-5, label: "C", cls: "b2" },
      { y0: 1e-5, y1: 1e-4, label: "M", cls: "b3" }, { y0: 1e-4, y1: 1e-3, label: "X", cls: "b4" }],
    series: [{ data: xr, color: "var(--sol)", gap: 40 * 60000 }],
    annotations: shown,
    tip: (t, v) => `<b>${C.fmtTime(t)}</b><br>Flux ${v[0].toExponential(1)} W/m²<br>Class <b>${P.flareClass(v[0])}</b>${P.rFromFlux(v[0]) ? ` · R${P.rFromFlux(v[0])} radio blackout level` : ""}`
  });
  $("xrayAge").textContent = feedAge("xray");
}
const sup = (n) => String(n).replace(/-/g, "⁻").replace(/\d/g, (d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[d]);

/* ------------------------------------------------------------------ alerts */
function alertsList() {
  const al = ST.feeds.alerts || [];
  const host = $("alerts");
  if (!al.length) { host.innerHTML = '<li class="muted">No alerts available.</li>'; return; }
  host.innerHTML = al.slice(0, 8).map((a) => {
    const x = P.explainAlert(a.msg);
    const k = x.kind.startsWith("WARN") ? "flame" : x.kind.startsWith("WATCH") ? "nebula" : x.kind.startsWith("SUMM") ? "ice" : x.kind.startsWith("CANCEL") ? "" : "sol";
    return `<li><div class="sw-al-top"><span class="chip ${k}">${esc(x.kind.toLowerCase())}</span>${x.scale ? `<span class="chip lv-chip lv-${x.scale[1]}">${esc(x.scale)}</span>` : ""}<time datetime="${new Date(a.t).toISOString()}">${esc(C.fmtTime(a.t))}${ST.mode === "live" ? " · " + ago(a.t) : ""}</time></div>
      <p>${esc(x.plain)}</p><details><summary>Original NOAA message</summary><pre>${esc(a.msg.trim())}</pre></details></li>`;
  }).join("");
  $("alertAge").textContent = feedAge("alerts");
}

/* ------------------------------------------------------------------ OVATION polar maps (2D canvas) */
let albedoPx = null;
function loadAlbedo() {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = 720; c.height = 360;
      const x = c.getContext("2d"); x.drawImage(img, 0, 0, 720, 360);
      try { albedoPx = x.getImageData(0, 0, 720, 360).data; } catch (e) { albedoPx = null; }
      res();
    };
    img.onerror = () => res();
    img.src = "assets/img/earth/earth-albedo.jpg";
  });
}
function ovationMaps() {
  const g = ST.grid || ST.modelGrid;
  const nowMs = ST.mode === "sample" ? ST.now : Date.now();
  for (const [id, hemi] of [["ovN", 1], ["ovS", -1]]) {
    const cv = $(id), x = cv.getContext("2d"), N = cv.width, R = N / 2 - 6;
    const img = x.createImageData(N, N);
    const s = P.sunRaDec(nowMs), gm = P.gmst(nowMs);
    for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
      const dx = (px - N / 2) / R, dy = (py - N / 2) / R;
      const rr = Math.hypot(dx, dy);
      const k = (py * N + px) * 4;
      if (rr > 1) { img.data[k + 3] = 0; continue; }
      // azimuthal equidistant from the pole out to 30° latitude; longitude 0 points down (towards the viewer)
      const colat = rr * 60, lat = hemi * (90 - colat);
      let lon = Math.atan2(dx, dy * hemi) / P.DEG;
      // base map: albedo, darkened on the night side
      let r = 8, gg = 14, b = 30;
      if (albedoPx) {
        const u = Math.floor(((lon + 180) / 360) * 720) % 720, v = Math.floor(((90 - lat) / 180) * 360);
        const q = (Math.min(359, v) * 720 + u) * 4;
        r = albedoPx[q]; gg = albedoPx[q + 1]; b = albedoPx[q + 2];
      }
      const H = gm + lon * P.DEG - s.ra;
      const la = lat * P.DEG;
      const alt = Math.sin(la) * Math.sin(s.dec) + Math.cos(la) * Math.cos(s.dec) * Math.cos(H);
      const day = Math.max(0, Math.min(1, (alt + 0.1) / 0.25));
      const lum = 0.12 + 0.5 * day;
      r *= lum; gg *= lum; b *= lum;
      if (g) {
        const p = gridAt(g, lat, lon) / 100;
        if (p > 0.03) {
          const a = Math.min(1, (p - 0.03) / 0.5) * 0.95;
          // sequential single-hue ramp (aurora green), lighter = more likely
          const cr = 40 + 170 * p, cg = 200 + 55 * p, cb = 120 + 100 * p;
          r = r * (1 - a) + cr * a; gg = gg * (1 - a) + cg * a; b = b * (1 - a) + cb * a;
        }
      }
      img.data[k] = r; img.data[k + 1] = gg; img.data[k + 2] = b; img.data[k + 3] = 255;
    }
    x.clearRect(0, 0, N, N);
    x.putImageData(img, 0, 0);
    // graticule
    x.strokeStyle = "rgba(180,200,255,.18)"; x.lineWidth = 1;
    for (const c of [10, 20, 30, 40, 50]) { x.beginPath(); x.arc(N / 2, N / 2, R * c / 60, 0, Math.PI * 2); x.stroke(); }
    x.fillStyle = "rgba(200,210,240,.7)"; x.font = "11px JetBrains Mono, monospace";
    for (const c of [30, 50]) x.fillText((90 - c) + (hemi > 0 ? "°N" : "°S"), N / 2 + 4, N / 2 + R * c / 60 - 4);
    // observer + sight ring
    const o = ST.observer;
    if (o.lat * hemi > 30) {
      const pt = (la, lo) => { const cr = (90 - la * hemi) / 60 * R; const a = lo * P.DEG; return [N / 2 + cr * Math.sin(a), N / 2 + hemi * cr * Math.cos(a)]; };
      const [ox, oy] = pt(o.lat, o.lon);
      x.setLineDash([4, 3]); x.strokeStyle = "rgba(255,194,75,.9)"; x.beginPath();
      for (let i = 0; i <= 64; i++) {
        const b2 = i / 64 * Math.PI * 2, d = REACH * P.DEG, la1 = o.lat * P.DEG;
        const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(b2));
        const lo2 = o.lon * P.DEG + Math.atan2(Math.sin(b2) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
        const [qx, qy] = pt(la2 / P.DEG, lo2 / P.DEG);
        i ? x.lineTo(qx, qy) : x.moveTo(qx, qy);
      }
      x.stroke(); x.setLineDash([]);
      x.fillStyle = "#ffc24b"; x.beginPath(); x.arc(ox, oy, 3.5, 0, Math.PI * 2); x.fill();
      x.fillStyle = "#fff"; x.fillText(o.name, ox + 6, oy - 5);
    } else if (hemi === Math.sign(o.lat || 1)) {
      x.fillStyle = "rgba(255,194,75,.9)"; x.textAlign = "center"; x.fillText(`${o.name}: off the map`, N / 2, N - 16); x.textAlign = "start";
    }
  }
  const a = ST.feeds.aurora;
  $("ovAge").textContent = ST.gridModel ? (ST.mode === "sample" ? "sample: modelled from Kp" : "OVATION unavailable: modelled from Kp") : feedAge("aurora") + (a && a.fc ? " · valid " + C.fmtTime(a.fc, false) : "");
}

/* ------------------------------------------------------------------ coupling meter */
function coupling() {
  const c = ST.derived.coupling;
  $("couplingNow").textContent = isFinite(c) ? fmt(c, 0) : "—";
  // log meter: 100 … 100,000 (km/s)^(4/3) nT^(2/3)
  const k = isFinite(c) && c > 0 ? Math.max(0, Math.min(1, (Math.log10(c) - 2) / 3)) : 0;
  $("couplingMeter").style.setProperty("--k", k.toFixed(3));
  $("couplingTxt").textContent = !isFinite(c) ? "" : c < 2000 ? "Weak: the field points mostly north, little energy gets in." : c < 8000 ? "Moderate: typical of an ordinary day." : c < 20000 ? "Strong: expect active aurora and possibly a storm." : "Very strong: storm-level driving.";
}

/* ================================================================== explainer: reconnection diagram */
function reconDiagram(south) {
  // Schematic in the noon–midnight plane: Sun to the left, north up. Not to scale.
  const ex = 262, ey = 150, loops = [34, 56, 78];
  const loop = (L, day) => {         // one half of a dipole loop, squeezed on the dayside, stretched on the nightside
    let d = "";
    for (let i = 0; i <= 40; i++) {
      const lat = -Math.PI / 2 + Math.PI * i / 40;
      const r = L * Math.cos(lat) ** 2;
      const x = r * Math.cos(lat) * (day ? -0.82 : 1.55), y = -r * Math.sin(lat);
      d += (i ? "L" : "M") + (ex + x).toFixed(1) + "," + (ey + y).toFixed(1);
    }
    return d;
  };
  let g = "";
  for (const L of loops) g += `<path d="${loop(L, true)}" class="rc-earth"/><path d="${loop(L, false)}" class="rc-earth"/>`;
  const nose = ex - 78 * 0.82 - 12;                    // magnetopause nose
  g += `<path d="M${nose + 10},18 Q${nose - 26},${ey} ${nose + 10},282" class="rc-mp"/>`;
  g += `<text x="${nose + 16}" y="30" class="rc-lbl rc-dim">magnetopause</text>`;
  let imf = "", extra = "";
  if (!south) {
    for (const [i, x] of [40, 78, 116, 150].entries()) {
      const bend = i === 3 ? 26 : i === 2 ? 10 : 0;
      imf += `<path d="M${x},280 Q${x - bend},${ey} ${x},22" class="rc-imf n" marker-end="url(#arN)"/>`;
    }
    extra = `<text x="${nose - 20}" y="${ey + 4}" class="rc-lbl" text-anchor="end">parallel: no link</text>
      <text x="${ex + 60}" y="${ey + 110}" class="rc-lbl rc-dim">closed field, calm tail</text>`;
  } else {
    for (const x of [40, 78, 116]) imf += `<path d="M${x},22 L${x},278" class="rc-imf s" marker-end="url(#arS)"/>`;
    // the reconnected pair at the nose: IMF from above spliced to Earth's northern cap, and vice versa
    extra += `<path d="M${nose - 12},22 C${nose - 10},${ey - 50} ${nose + 6},${ey - 8} ${nose + 6},${ey}" class="rc-imf s"/>`;
    extra += `<path d="M${nose + 6},${ey} C${nose + 6},${ey + 8} ${nose - 10},${ey + 50} ${nose - 12},278" class="rc-imf s" marker-end="url(#arS)"/>`;
    // opened field lines peeled over the poles and dragged into the tail
    for (const s2 of [1, -1]) for (const k of [0, 1]) {
      const y0 = ey - s2 * 14;
      extra += `<path d="M${ex},${y0} C${ex - 18},${ey - s2 * (70 + k * 30)} ${ex + 60},${ey - s2 * (96 + k * 22)} 420,${ey - s2 * (34 + k * 30)}" class="rc-open"/>`;
    }
    extra += `<circle cx="${nose + 6}" cy="${ey}" r="10" class="rc-x"/><text x="${nose - 12}" y="${ey + 4}" class="rc-lbl" text-anchor="end">reconnection</text>`;
    extra += `<circle cx="398" cy="${ey}" r="8" class="rc-x"/><text x="408" y="${ey + 28}" class="rc-lbl" text-anchor="end">tail X-line</text><text x="330" y="${ey + 50}" class="rc-lbl rc-dim" text-anchor="middle">→ aurora</text>`;
    extra += `<path d="M392,${ey - 6} C360,${ey - 12} 300,${ey - 16} ${ex + 12},${ey - 10}" class="rc-jet"/><path d="M392,${ey + 6} C360,${ey + 12} 300,${ey + 16} ${ex + 12},${ey + 10}" class="rc-jet"/>`;
  }
  $("reconSvg").innerHTML = `<defs>
      <marker id="arN" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="#7cc8ff"/></marker>
      <marker id="arS" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="#ff4f9a"/></marker>
      <radialGradient id="rcE" cx="40%" cy="35%"><stop offset="0" stop-color="#9fd8ff"/><stop offset="1" stop-color="#1d3b7a"/></radialGradient></defs>
    <text x="14" y="16" class="rc-lbl">Solar wind →</text>
    <text x="14" y="296" class="rc-lbl rc-dim">IMF ${south ? "southward ↓" : "northward ↑"}</text>
    ${g}${imf}${extra}
    <circle cx="${ex}" cy="${ey}" r="13" fill="url(#rcE)"/>
    <text x="${ex}" y="${ey + 30}" class="rc-lbl" text-anchor="middle">Earth</text>`;
  $("reconCap").innerHTML = south
    ? "<b>Southward IMF:</b> at the nose the two fields point in opposite directions, break and reconnect. The opened field lines are dragged over the poles into the tail, reconnect again at the tail X-line and snap back towards Earth, driving particles down into the aurora. (Schematic.)"
    : "<b>Northward IMF:</b> at the nose both fields point north, so they cannot reconnect there. The solar wind and its field drape around the magnetosphere and little energy gets in. (Schematic.)";
  document.querySelectorAll("#reconSeg button").forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.bz === "s") === south)));
}

/* ================================================================== explainer: magnetopause calculator */
let mpTouched = false;
function mpFromLive() {
  const c = ST.cur;
  if (!isFinite(c.v)) return;
  $("sV").value = Math.round(c.v / 10) * 10; $("sN").value = Math.max(0.5, Math.round(c.n * 2) / 2); $("sBz").value = Math.round(c.bz);
  mpUpdate();
}
function mpUpdate() {
  const v = +$("sV").value, n = +$("sN").value, bz = +$("sBz").value;
  for (const id of ["sV", "sN", "sBz"]) { const r = $(id); r.style.setProperty("--fill", ((r.value - r.min) / (r.max - r.min) * 100) + "%"); }
  $("oV").textContent = fmt(v) + " km/s"; $("oN").textContent = fmt(n, 1) + " /cm³"; $("oBz").textContent = (bz > 0 ? "+" : "") + bz + " nT";
  const dp = P.dynPressure(n, v), sh = P.shue(bz, dp);
  const bt = Math.max(Math.abs(bz), 5), mach = P.machMS(v, n, bt, 1e5), rbs = P.bowShock(sh.r0, mach);
  $("mpP").innerHTML = fmt(dp, dp < 10 ? 2 : 1) + "<small>nPa</small>";
  $("mpR").innerHTML = fmt(sh.r0, 1) + "<small>R⊕</small>";
  $("mpA").textContent = fmt(sh.alpha, 2);
  $("mpB").innerHTML = fmt(rbs, 1) + "<small>R⊕</small>";
  $("mpR").closest(".readout").dataset.alert = sh.r0 < 6.62 ? "1" : "0";
  // to-scale cross-section: Sun to the left, 1 R⊕ = s px
  const svg = $("mpSvg"), s = 11, cx = 300, cy = 150;
  const path = (f, thMax) => {
    let d = "";
    for (let i = -60; i <= 60; i++) {
      const th = thMax * i / 60, r = f(Math.abs(th));
      const x = cx - r * Math.cos(th) * s, y = cy - r * Math.sin(th) * s;
      d += (i === -60 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1);
    }
    return d;
  };
  const mp = path((t) => P.shueR(sh.r0, sh.alpha, t), 2.45);
  const bs = path((t) => P.bowR(rbs, t), 2.2);
  const ref = path((t) => P.shueR(P.shue(0, 1.5).r0, P.shue(0, 1.5).alpha, t), 2.45);
  svg.innerHTML = `
    <defs><radialGradient id="mpE" cx="40%" cy="35%"><stop offset="0" stop-color="#9fd8ff"/><stop offset="1" stop-color="#1d3b7a"/></radialGradient>
    <linearGradient id="mpW" x1="0" x2="1"><stop offset="0" stop-color="#ffc24b" stop-opacity=".1"/><stop offset="1" stop-color="#ffc24b" stop-opacity="0"/></linearGradient></defs>
    <rect x="0" y="0" width="160" height="300" fill="url(#mpW)"/>
    <text x="10" y="20" class="rc-lbl">Solar wind →</text>
    <path d="${ref}" class="mp-ref"/>
    <path d="${bs}" class="mp-bs"/>
    <path d="${mp}" class="mp-mp"/>
    <circle cx="${cx}" cy="${cy}" r="${6.62 * s}" class="mp-geo${sh.r0 < 6.62 ? " hit" : ""}"/>
    <circle cx="${cx}" cy="${cy}" r="${s}" fill="url(#mpE)"/>
    <line x1="${cx - sh.r0 * s}" y1="${cy}" x2="${cx}" y2="${cy}" class="mp-dim"/>
    <text x="${cx - sh.r0 * s / 2}" y="${cy - 6}" class="rc-lbl" text-anchor="middle">${fmt(sh.r0, 1)} R⊕</text>
    <text x="${cx - rbs * s - 4}" y="${cy + 18}" class="rc-lbl mp-bs-l" text-anchor="end">bow shock</text>
    <text x="${cx}" y="${cy + 6.62 * s + 14}" class="rc-lbl" text-anchor="middle">geostationary orbit${sh.r0 < 6.62 ? ": exposed!" : ""}</text>
    <text x="430" y="290" class="rc-lbl" text-anchor="end">to scale · dashed: a quiet day</text>`;
  if (ST.drive3d && SC) SC.setWind({ v, n, bz, by: 0, bt, T: 1e5 });
}

/* ================================================================== explainer: CME travel */
function cmeTravel() {
  const v = +$("sCme").value;
  const r = $("sCme"); r.style.setProperty("--fill", ((v - r.min) / (r.max - r.min) * 100) + "%");
  const h = P.travelHours(v);
  $("oCme").textContent = fmt(v) + " km/s";
  $("cmeHours").textContent = h < 48 ? fmt(h, 1) + " hours" : fmt(h / 24, 1) + " days";
  const when = new Date(Date.now() + h * 3600000);
  $("cmeWhen").textContent = C.fmtTime(when.getTime());
  $("trackCme").style.setProperty("--x", Math.min(1, h / (4 * 24)).toFixed(3));
  $("cmeCompare").textContent = v >= 2200 ? "Carrington pace: the 1859 CME took about 17.6 hours" : v >= 1200 ? "A fast CME: the fastest few percent" : v >= 600 ? "A typical Earth-directed CME: 1 to 3 days" : "A slow CME, drifting with the solar wind";
}

/* ================================================================== CME launch (3D) */
function launchCME(v) {
  if (!SC || SC.cmeOn) return;
  $("hero").scrollIntoView({ behavior: RM ? "auto" : "smooth" });
  const hud = $("cmeHud");
  hud.hidden = false;
  const H = P.travelHours(v);
  $("cmeTxt").textContent = `A ${fmt(v)} km/s Coronal Mass Ejection (CME) leaves the Sun. Time runs about ${fmt(H * 3600 / Math.max(4, Math.min(12, H / 7)), 0)}× faster.`;
  setViewBtn("system");
  SC.launchCME(v, {
    onUpdate: (k, hrs) => { $("cmeT").textContent = `T + ${fmt(hrs, hrs < 10 ? 1 : 0)} h`; $("cmeBar").style.width = (k * 100).toFixed(1) + "%"; },
    onArrive: (tg) => { setViewBtn("magnetosphere"); $("cmeTxt").textContent = `Impact after ${fmt(H, 1)} hours: the magnetopause is shoved in to ${fmt(tg.r0, 1)} R⊕ and the aurora flares.`; },
    onDone: () => { hud.hidden = true; if (SC) SC.setWind(ST.cur); }
  });
}
function setViewBtn(v) {
  document.querySelectorAll("#views button").forEach((b) => { const on = b.dataset.v === v; b.setAttribute("aria-pressed", String(on)); b.setAttribute("aria-checked", String(on)); });
}

/* ================================================================== controls */
document.querySelectorAll("#views button").forEach((b) => b.addEventListener("click", () => { setViewBtn(b.dataset.v); if (SC) SC.setView(b.dataset.v); }));
$("cmeBtn").addEventListener("click", () => launchCME(1500));
$("cmeBtn2").addEventListener("click", () => launchCME(+$("sCme").value));
$("sCme").addEventListener("input", cmeTravel);
for (const id of ["sV", "sN", "sBz"]) $(id).addEventListener("input", () => { mpTouched = true; mpUpdate(); });
$("mpLive").addEventListener("click", () => { mpTouched = false; mpFromLive(); });
$("mpGannon").addEventListener("click", () => { mpTouched = true; $("sV").value = 800; $("sN").value = 30; $("sBz").value = -45; mpUpdate(); });
$("mp3d").addEventListener("click", () => {
  ST.drive3d = !ST.drive3d;
  $("mp3d").setAttribute("aria-pressed", String(ST.drive3d));
  $("mp3d").textContent = ST.drive3d ? "3D view follows sliders" : "Drive the 3D view";
  if (ST.drive3d) mpUpdate(); else if (SC) SC.setWind(ST.cur);
});
document.querySelectorAll("#reconSeg button").forEach((b) => b.addEventListener("click", () => reconDiagram(b.dataset.bz === "s")));
$("retryBtn").addEventListener("click", () => { OFFLINE = false; loadAll(true); });
$("loadSample").addEventListener("click", (e) => { e.preventDefault(); OFFLINE = true; useSample(); scrollTo({ top: 0, behavior: RM ? "auto" : "smooth" }); });
document.querySelectorAll("#tzSeg button").forEach((b) => b.addEventListener("click", () => {
  C.TZ.mode = b.dataset.tz; D.lsSet("cl-sw-tz", C.TZ.mode);
  document.querySelectorAll("#tzSeg button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  if (ST.mode !== "loading") render();
}));
document.querySelectorAll("#tzSeg button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.tz === C.TZ.mode)));

const place = $("place");
function syncPlace() {
  const k = ST.observer.key || "me";
  if (k === "me") { const o = place.querySelector('option[value="me"]'); o.hidden = false; o.textContent = ST.observer.name; }
  place.value = k;
}
place.addEventListener("change", () => {
  const p = PLACES[place.value];
  if (!p) return;
  ST.observer = { key: place.value, ...p };
  D.lsSet("cl-sw-observer", ST.observer);
  $("geoMsg").textContent = "";
  if (ST.mode !== "loading") { verdict(); ovationMaps(); }
  if (SC && SC.view === "aurora") SC.setView("aurora");
});
$("geoBtn").addEventListener("click", () => {
  if (!navigator.geolocation) { $("geoMsg").textContent = "Your browser can't share a location."; return; }
  $("geoMsg").textContent = "Asking your browser…";
  navigator.geolocation.getCurrentPosition((pos) => {
    // round to 0.1° (about 10 km): enough for the aurora, kept only in this browser
    ST.observer = { key: "me", name: "Your location", lat: Math.round(pos.coords.latitude * 10) / 10, lon: Math.round(pos.coords.longitude * 10) / 10 };
    D.lsSet("cl-sw-observer", ST.observer);
    $("geoMsg").textContent = `Using ${ST.observer.lat.toFixed(1)}°, ${ST.observer.lon.toFixed(1)}° (stored only in this browser).`;
    syncPlace();
    if (ST.mode !== "loading") { verdict(); ovationMaps(); }
    if (SC && SC.view === "aurora") SC.setView("aurora");
  }, () => { $("geoMsg").textContent = "Location not shared. Pick a city instead."; }, { timeout: 12000, maximumAge: 3600000 });
});
syncPlace();

/* ================================================================== boot */
function renderTex() {
  if (!window.katex) return;
  document.querySelectorAll("[data-tex]").forEach((e) => {
    try { window.katex.render(e.dataset.tex, e, { displayMode: !e.classList.contains("sw-tex-inline"), throwOnError: false }); } catch (err) { e.textContent = e.dataset.tex; }
  });
}
renderTex();
reconDiagram(true);
mpUpdate();
cmeTravel();
const scenePromise = initScene().catch((e) => { console.warn("3D view failed:", e); $("loading").classList.add("done"); });
const albedoPromise = loadAlbedo();
await loadAll(false);                       // data and 3D load in parallel; render() skips the scene until it exists
await albedoPromise; if (ST.mode !== "loading") ovationMaps();
await scenePromise;
if (SC && ST.mode !== "loading") { SC.setWind(ST.cur); SC.setTime(ST.mode === "sample" ? ST.now : Date.now()); auroraGrid(); verdict(); }

// refresh while the page is open
setInterval(() => { if (!document.hidden && ST.mode === "live") loadAll(false); }, 5 * 60000);
setInterval(() => { if (ST.mode === "live") { const s = ST.status.wind; if (s && s.t) setStatus(s.status === "stale" ? "stale" : "live", (s.status === "stale" ? "Offline · last NOAA data from " : "Live · NOAA SWPC · updated ") + ago(Math.max(ST.status.wind.t, ST.status.mag.t))); } }, 30000);
let rT = 0;
addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(() => { if (ST.mode !== "loading") { kpChart(); windCharts(); xrayChart(); } }, 200); });

window.__sim = {
  get scene() { return SC; }, state: ST,
  setView: (v) => { setViewBtn(v); SC && SC.setView(v, true); },
  setWind: (w) => SC && SC.setWind(w),
  launchCME, reload: (f) => loadAll(!!f), sample: () => { OFFLINE = true; return useSample(); }
};
