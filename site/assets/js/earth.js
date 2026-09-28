/* Live Earth Orbit (earth.html)
 *
 * A real-time globe of the satellites overhead now. Data flow:
 *   CelesTrak GP JSON ─► satellite.js json2satrec ─► SGP4 (round-robin, a few ms per frame)
 *   ─► per-satellite circular-arc extrapolation between SGP4 refreshes ─► instanced points.
 * If CelesTrak cannot be reached, data/earth-fallback.json builds illustrative
 * constellations (Kepler + J2) and the page says so.
 * Launches: The Space Devs Launch Library 2 (LL2). News: Spaceflight News API (SNAPI).
 *
 * URL flags: ?offline (force the fallback), ?still (freeze time for screenshots).
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as O from "./earth-orbits.js";
import * as G from "./earth-globe.js";

const Q = new URLSearchParams(location.search);
const OFFLINE = Q.has("offline");
const STILL = Q.has("still");
const RM = !!(window.Codex && window.Codex.reducedMotion);
const $ = (id) => document.getElementById(id);
const MOBILE = () => innerWidth <= 820;
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeURL = (u) => { try { const x = new URL(u); return x.protocol === "https:" || x.protocol === "http:" ? x.href : ""; } catch (e) { return ""; } };
const fmt = (v, d = 0) => (isFinite(v) ? v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d }) : "—");
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpV3 = new THREE.Vector3();

/* ================================================================== state */
const S = {
  sats: [], groupSats: {}, groupState: {}, mode: "loading",
  selSat: null, sel: -1, hover: -1, hoverPad: -1, follow: false, showTrack: true,
  observer: { lat: 34.05, lon: -118.25, h: 0.1, name: "Los Angeles" },
  speedIdx: 1, simBase: Date.now(), perfBase: performance.now(),
  pads: [], launches: [], launchStatus: "loading", hotPad: -1,
  passFor: "iss", ready: false
};
const SPEEDS = [0, 1, 10, 60, 300, 1000, 3600];
if (STILL) S.speedIdx = 0;
const simNow = () => S.simBase + (performance.now() - S.perfBase) * SPEEDS[S.speedIdx];
try {
  const ob = O.lsGet("cl-earth-observer");
  if (ob && isFinite(ob.lat) && isFinite(ob.lon)) S.observer = ob;
} catch (e) { /* ignore */ }
for (const g of O.GROUPS) S.groupState[g.key] = { status: "idle", visible: !(g.key === "starlink" && MOBILE()), count: 0, t: 0 };

/* ================================================================== renderer */
if (!(window.Codex && window.Codex.webgl())) {
  window.Codex && window.Codex.noGL();
  throw new Error("WebGL unavailable");
}
const stage = $("stage");
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.setAttribute("role", "img");
renderer.domElement.setAttribute("aria-label", "Interactive 3D globe showing satellites in their current positions around Earth, with day and night from the real Sun. Drag to rotate, scroll to zoom, click a satellite for details.");
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x010207);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.001, 2000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.5; controls.zoomSpeed = 0.9; controls.enablePan = false;
controls.minDistance = 1.12; controls.maxDistance = 40;

const sunLight = new THREE.DirectionalLight(0xffffff, 3.2);
const headLight = new THREE.PointLight(0xbfd4ff, 0.02, 0, 0);
camera.add(headLight);
scene.add(camera, sunLight, new THREE.AmbientLight(0x6070a0, 0.5), new THREE.HemisphereLight(0x0a1020, 0x2a5aa0, 0.9));

const vo = { x: 0, y: 0, tx: 0, ty: 0 };
function viewOffsetTarget() {
  const W = innerWidth, H = innerHeight;
  vo.tx = 0; vo.ty = 0;
  // desktop: the free area between the title card and the side panel is already centred
  if (!MOBILE() && W > 1100) vo.tx = Math.round(Math.min(60, (W - 1100) * 0.2));
  if (MOBILE()) {
    const info = document.body.classList.contains("eo-has-info");
    const sheetOpen = !$("panel").classList.contains("collapsed");
    vo.ty = Math.round(H * (info ? (sheetOpen ? 0.02 : -0.2) : 0.13));  // keep the globe in the visible gap
  }
}
function viewOffset(snap) {
  viewOffsetTarget();
  if (snap) { vo.x = vo.tx; vo.y = vo.ty; }
  vo.x += (vo.tx - vo.x) * 0.12; vo.y += (vo.ty - vo.y) * 0.12;
  camera.setViewOffset(innerWidth, innerHeight, vo.x, vo.y, innerWidth, innerHeight);
}
viewOffset(true);

/* ================================================================== assets */
const loadTxt = $("loadTxt");
function loadTex(url, srgb) {
  return new Promise((res) => {
    new THREE.TextureLoader().load(url, (t) => { if (srgb) t.colorSpace = THREE.SRGBColorSpace; res(t); }, undefined, () => {
      const d = new THREE.DataTexture(new Uint8Array([20, 40, 80, 255]), 1, 1); d.needsUpdate = true; res(d);
    });
  });
}
const safeJSON = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const [texAlb, texData, texNrm, texCld, starData, fallback] = await Promise.all([
  loadTex("assets/img/earth/earth-albedo.jpg"), loadTex("assets/img/earth/earth-data.png"),
  loadTex("assets/img/earth/earth-normal.jpg"), loadTex("assets/img/earth/earth-clouds.jpg"),
  safeJSON("data/sky/stars.json"), safeJSON("data/earth-fallback.json")
]);
const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
for (const t of [texAlb, texData, texNrm, texCld]) { t.anisotropy = aniso; t.wrapS = THREE.RepeatWrapping; t.needsUpdate = true; }

const E = G.makeEarth({ albedo: texAlb, data: texData, normal: texNrm, clouds: texCld });
scene.add(E.group, E.atmo);
const stars = G.makeStars(starData);
scene.add(stars);
const sun = G.makeSun();
scene.add(sun);
const SP = { points: null };                                            // satellite points (rebuilt on data change)
const MK = G.makeMarkers(64);
E.group.add(MK.points);
const iss = G.makeISS();
iss.visible = false;
scene.add(iss);

// selection marker, orbit, ground track, footprint
const orbitLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
orbitLine.frustumCulled = false; orbitLine.renderOrder = 3; scene.add(orbitLine);
const trackLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
trackLine.frustumCulled = false; trackLine.renderOrder = 3; E.group.add(trackLine);
const footGeo = new THREE.BufferGeometry();
footGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(97 * 3), 3));
const footLine = new THREE.Line(footGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
footLine.frustumCulled = false; footLine.renderOrder = 3; scene.add(footLine);
const nadirGeo = new THREE.BufferGeometry();
nadirGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
const nadirLine = new THREE.Line(nadirGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false }));
nadirLine.frustumCulled = false; scene.add(nadirLine);
for (const o of [orbitLine, trackLine, footLine, nadirLine]) o.visible = false;

/* ================================================================== swarm: SGP4 round-robin + arc extrapolation */
let N = 0, P0 = new Float64Array(0), Q0 = new Float64Array(0), W0 = new Float64Array(0), T0 = new Float64Array(0), OK = new Uint8Array(0);
let ECC = [], cursor = 0, lastSim = 0, needFull = true;

function rebuildSats() {
  const seen = new Set();
  const list = [];
  for (const g of O.GROUPS) {
    const arr = S.groupSats[g.key];
    if (!arr) { S.groupState[g.key].count = 0; continue; }
    let c = 0;
    for (const s of arr) { if (seen.has(s.id)) continue; seen.add(s.id); list.push(s); c++; }
    S.groupState[g.key].count = c;
  }
  S.sats = list;
  S.byId = new Map(list.map((x) => [x.id, x]));
  N = list.length;
  P0 = new Float64Array(N * 3); Q0 = new Float64Array(N * 3); W0 = new Float64Array(N); T0 = new Float64Array(N); OK = new Uint8Array(N);
  ECC = [];
  list.forEach((s, i) => { s.i = i; if (s.ecc > 0.02) ECC.push(i); });
  if (SP.points) { scene.remove(SP.points); SP.points.geometry.dispose(); SP.points.material.dispose(); }
  Object.assign(SP, G.makeSatPoints(Math.max(N, 1)));
  SP.geo.setDrawRange(0, N);
  const c = new THREE.Color();
  list.forEach((s, i) => {
    const g = O.GROUP[s.group];
    c.set(g.color);
    SP.col[i * 3] = c.r; SP.col[i * 3 + 1] = c.g; SP.col[i * 3 + 2] = c.b;
    SP.size[i] = g.size;
  });
  SP.geo.attributes.aColor.needsUpdate = true; SP.geo.attributes.aSize.needsUpdate = true;
  scene.add(SP.points);
  S.sel = S.selSat ? S.selSat.i ?? -1 : -1;
  if (S.selSat && S.sats[S.sel] !== S.selSat) { S.sel = -1; S.selSat = null; closeInfo(); }
  S.hover = -1;
  needFull = true;
  renderGroups(); renderRegimes(); updateCount();
}

function propagateOne(i, tMs, jd) {
  const pv = O.pvAt(S.sats[i], tMs, jd);
  if (!pv) { OK[i] = 0; return; }
  const p = pv.position, v = pv.velocity;
  const r2 = p.x * p.x + p.y * p.y + p.z * p.z;
  // angular momentum h = r × v; q = ĥ × r (same length as r, 90° ahead along the orbit)
  const hx = p.y * v.z - p.z * v.y, hy = p.z * v.x - p.x * v.z, hz = p.x * v.y - p.y * v.x;
  const h = Math.hypot(hx, hy, hz) || 1;
  const k = 3 * i;
  P0[k] = p.x; P0[k + 1] = p.y; P0[k + 2] = p.z;
  Q0[k] = (hy * p.z - hz * p.y) / h; Q0[k + 1] = (hz * p.x - hx * p.z) / h; Q0[k + 2] = (hx * p.y - hy * p.x) / h;
  W0[i] = h / r2;                                   // rad/s for a circular orbit
  T0[i] = tMs; OK[i] = 1;
}
const visibleGroup = (i) => S.groupState[S.sats[i].group].visible;

function stepSwarm(tMs) {
  if (!N) return;
  const jd = O.jdOf(tMs);
  if (needFull) {
    for (let i = 0; i < N; i++) propagateOne(i, tMs, jd);
    needFull = false; lastSim = tMs; return;
  }
  for (const i of ECC) if (visibleGroup(i)) propagateOne(i, tMs, jd);   // eccentric orbits: exact every frame
  const t0 = performance.now();
  const budget = MOBILE() ? 3 : 4.5;
  const spd = Math.abs(SPEEDS[S.speedIdx]);
  const minBatch = Math.min(N, spd >= 300 ? 3000 : 400);
  let n = 0;
  while (n < N) {
    const i = cursor; cursor = (cursor + 1) % N; n++;
    if (visibleGroup(i)) propagateOne(i, tMs, jd);
    if ((n & 63) === 0 && n >= minBatch && performance.now() - t0 > budget) break;
  }
  lastSim = tMs;
}

function writePositions(tMs) {
  if (!N) return;
  const pos = SP.pos, st = SP.state;
  const R = 1 / O.RE;
  for (let i = 0; i < N; i++) {
    const k = 3 * i;
    if (!OK[i] || !S.groupState[S.sats[i].group].visible) { st[i] = 0; continue; }
    const th = W0[i] * (tMs - T0[i]) / 1000, c = Math.cos(th), s = Math.sin(th);
    const x = P0[k] * c + Q0[k] * s, y = P0[k + 1] * c + Q0[k + 1] * s, z = P0[k + 2] * c + Q0[k + 2] * s;
    pos[k] = x * R; pos[k + 1] = z * R; pos[k + 2] = -y * R;          // ECI → scene
    st[i] = 1;
  }
  if (S.hover >= 0 && st[S.hover]) st[S.hover] = 2;
  if (S.sel >= 0 && st[S.sel]) st[S.sel] = 3;
  if (S.sel >= 0 && iss.visible && S.selSat && S.selSat.id === 25544) st[S.sel] = 0;
  SP.geo.attributes.position.needsUpdate = true;
  SP.geo.attributes.aState.needsUpdate = true;
}

/* ================================================================== data loading */
const statusEl = $("status"), statusTxt = $("statusTxt");
function setStatus() {
  const st = Object.values(S.groupState);
  const live = st.filter((g) => ["live", "cached", "stale"].includes(g.status));
  const failed = st.filter((g) => g.status === "failed");
  const loading = st.some((g) => g.status === "loading");
  let mode = "loading", txt = "Connecting to CelesTrak…";
  if (S.mode === "fallback") { mode = "fallback"; txt = "Illustrative — live data unavailable"; }
  else if (live.length) {
    const newest = Math.max(...live.map((g) => g.t || 0));
    const age = Math.max(0, (Date.now() - newest) / 60000);
    const stale = live.some((g) => g.status === "stale");
    mode = failed.length || stale ? "partial" : "live";
    txt = `Live · CelesTrak elements ${age < 1.5 ? "just updated" : "updated " + ago(newest)}`;
    if (stale) txt = `Live · cached elements from ${ago(Math.min(...live.map((g) => g.t)))}`;
    if (failed.length) txt += ` · ${failed.length} group${failed.length > 1 ? "s" : ""} offline`;
    if (loading) txt += " · loading…";
  }
  statusEl.dataset.state = mode;
  statusTxt.textContent = txt;
  $("satOffline").hidden = S.mode !== "fallback";
  $("infoIllus").hidden = !(S.selSat && S.selSat.illustrative);
}
function ago(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 90) return "just now";
  if (s < 3600) return Math.round(s / 60) + " min ago";
  if (s < 86400 * 2) return Math.round(s / 3600) + " h ago";
  return Math.round(s / 86400) + " days ago";
}
const idle = () => new Promise((r) => setTimeout(r, 0));

async function loadGroupLive(key) {
  const gs = S.groupState[key];
  if (gs.status === "loading") return;
  gs.status = "loading"; renderGroups(); setStatus();
  const res = await O.loadGroup(key, OFFLINE);
  if (!res.records) { gs.status = "failed"; renderGroups(); setStatus(); return; }
  const out = [];
  for (let i = 0; i < res.records.length; i++) {
    const s = O.satFromOMM(res.records[i], key);
    if (s) out.push(s);
    if ((i & 511) === 511) await idle();                // keep the page responsive while 10,000 satrecs initialise
  }
  if (S.mode === "fallback") {                           // live data is back: drop the illustrative set
    S.mode = "loading";
    for (const g of O.GROUPS) { delete S.groupSats[g.key]; if (S.groupState[g.key].status === "illustrative") S.groupState[g.key].status = "idle"; }
  }
  gs.status = res.status; gs.t = res.t;
  S.groupSats[key] = out;
  scheduleRebuild();
}
let rebuildTimer = 0;
function scheduleRebuild() {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => { rebuildSats(); setStatus(); }, 60);
}

async function loadAll() {
  const jobs = O.GROUPS.filter((g) => S.groupState[g.key].visible || g.key !== "starlink").map((g) => loadGroupLive(g.key));
  await Promise.all(jobs);
  const anyLive = O.GROUPS.some((g) => S.groupSats[g.key] && S.groupSats[g.key].length);
  if (!anyLive) useFallback();
  setStatus();
}
function useFallback() {
  if (!fallback) return;
  S.mode = "fallback";
  const all = O.buildFallback(fallback);
  for (const g of O.GROUPS) { S.groupSats[g.key] = all.filter((s) => s.group === g.key); S.groupState[g.key].status = "illustrative"; }
  rebuildSats();
  setPads(fallback.pads.map((p) => ({ name: p.name, short: p.short, lat: p.lat, lon: p.lon, launches: [] })), true);
}

/* ================================================================== satellites panel */
function renderGroups() {
  const ul = $("groups");
  ul.innerHTML = O.GROUPS.map((g) => {
    const st = S.groupState[g.key];
    const cnt = st.status === "loading" ? '<span class="eo-spin" aria-label="loading"></span>'
      : st.status === "failed" ? '<span class="eo-fail">offline</span>'
      : st.status === "idle" ? '<span class="eo-idle">tap to load</span>' : fmt(st.count);
    return `<li><label class="eo-grp" style="--c:${g.color}">
      <input type="checkbox" data-g="${g.key}" ${st.visible ? "checked" : ""}>
      <i></i><span class="eo-gl"><b>${esc(g.label)}</b><small>${esc(g.note)}</small></span><span class="eo-gc">${cnt}</span></label></li>`;
  }).join("");
}
$("groups").addEventListener("change", (e) => {
  const k = e.target.dataset && e.target.dataset.g;
  if (!k) return;
  const st = S.groupState[k];
  st.visible = e.target.checked;
  if (st.visible && (st.status === "idle" || st.status === "failed") && S.mode !== "fallback") loadGroupLive(k).then(setStatus);
  if (!st.visible && S.selSat && S.selSat.group === k) deselect();
  needFull = true;
  renderRegimes(); updateCount();
});
$("retrySats").addEventListener("click", () => { for (const g of O.GROUPS) S.groupState[g.key].status = "idle"; setStatus(); loadAll(); });

function regimeOf(s) {
  if (s.ecc > 0.25) return "HEO";
  if (s.apo < 2000) return "LEO";
  if (s.peri > 35286 && s.apo < 36286) return "GEO";
  if (s.apo < 35286) return "MEO";
  return "HEO";
}
const REG = [["LEO", "#6fb8ff", "Low Earth Orbit"], ["MEO", "#4ef0b8", "Medium Earth Orbit"], ["GEO", "#ff8a4c", "Geostationary Orbit"], ["HEO", "#ffb85c", "Highly Elliptical Orbit"]];
function regimeCounts() {
  const c = { LEO: 0, MEO: 0, GEO: 0, HEO: 0 };
  for (const s of S.sats) if (S.groupState[s.group].visible) c[regimeOf(s)]++;
  return c;
}
function renderRegimes() {
  const c = regimeCounts();
  const max = Math.max(1, ...Object.values(c));
  $("regimeBars").innerHTML = REG.map(([k, col, name]) =>
    `<div class="eo-bar" style="--c:${col}"><span>${k}<small>${name}</small></span><b style="--w:${(100 * Math.log1p(c[k]) / Math.log1p(max)).toFixed(1)}%"></b><em>${fmt(c[k])}</em></div>`).join("");
  drawRegimeSvg(c);
}
function updateCount() {
  let n = 0;
  for (const s of S.sats) if (S.groupState[s.group].visible) n++;
  $("satCount").textContent = fmt(n);
}

/* ================================================================== picking, hover, labels */
const pointer = { x: -1e4, y: -1e4, moved: false, inside: false };
const projM = new THREE.Matrix4();
function occluded(wx, wy, wz) {
  // Is the segment camera → point blocked by the unit sphere?
  const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
  const dx = wx - cx, dy = wy - cy, dz = wz - cz;
  const L = Math.hypot(dx, dy, dz);
  const ux = dx / L, uy = dy / L, uz = dz / L;
  const b = cx * ux + cy * uy + cz * uz;
  const c = cx * cx + cy * cy + cz * cz - 1;
  const disc = b * b - c;
  if (disc <= 0) return false;
  const t = -b - Math.sqrt(disc);
  return t > 0 && t < L;
}
function toScreen(v, out) {
  tmpV3.copy(v).project(camera);
  out.x = (tmpV3.x * 0.5 + 0.5) * innerWidth;
  out.y = (-tmpV3.y * 0.5 + 0.5) * innerHeight;
  out.z = tmpV3.z;
  return out;
}
function pickSat(px, py, maxPx = 14) {
  if (!N) return -1;
  projM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const e = projM.elements, pos = SP.pos, st = SP.state;
  const W = innerWidth, H = innerHeight;
  let best = -1, bd = maxPx * maxPx;
  for (let i = 0; i < N; i++) {
    if (!st[i]) continue;
    const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2];
    const w = e[3] * x + e[7] * y + e[11] * z + e[15];
    if (w <= 0) continue;
    const sx = ((e[0] * x + e[4] * y + e[8] * z + e[12]) / w * 0.5 + 0.5) * W;
    const sy = (-(e[1] * x + e[5] * y + e[9] * z + e[13]) / w * 0.5 + 0.5) * H;
    const d = (sx - px) * (sx - px) + (sy - py) * (sy - py);
    // prefer bigger/brighter groups slightly
    const bias = S.sats[i].group === "starlink" ? 1.3 : 1;
    if (d * bias < bd && !occluded(x, y, z)) { bd = d * bias; best = i; }
  }
  return best;
}
function pickPad(px, py) {
  let best = -1, bd = 18 * 18;
  for (let i = 0; i < S.pads.length; i++) {
    const w = E.group.localToWorld(tmpV.copy(S.pads[i].local));
    if (occluded(w.x * 0.999, w.y * 0.999, w.z * 0.999)) continue;
    const sc = toScreen(w, tmpV2);
    if (sc.z > 1) continue;
    const d = (sc.x - px) ** 2 + (sc.y - py) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

const labelsEl = $("labels");
const labelPool = new Map();
function label(key, text, cls, world, show) {
  let el = labelPool.get(key);
  if (!el) { el = document.createElement("div"); el.className = "eo-label " + (cls || ""); labelsEl.appendChild(el); labelPool.set(key, el); el._t = ""; }
  if (!show) { el.style.opacity = "0"; return; }
  if (el._t !== text) { el.innerHTML = text; el._t = text; }
  const sc = toScreen(world, tmpV2);
  const hidden = sc.z > 1 || occluded(world.x, world.y, world.z);
  el.style.opacity = hidden ? "0" : "1";
  const flip = sc.x > innerWidth - (MOBILE() ? 150 : 560);            // keep labels clear of the side panel
  if (el._f !== flip) { el.classList.toggle("flip", flip); el._f = flip; }
  el.style.transform = `translate(${sc.x.toFixed(1)}px, ${sc.y.toFixed(1)}px)${flip ? " translateX(-100%)" : ""}`;
}
const NOTABLE = [[25544, "ISS"], [48274, "Tiangong"], [20580, "Hubble"]];
const tip = $("tip");
function updateLabels() {
  const on = $("tLabels").checked;
  const idx = new Map();
  if (on && S.byId) for (const [id] of NOTABLE) { const s = S.byId.get(id); if (s) idx.set(id, s.i); }
  for (const [id, name] of NOTABLE) {
    const i = idx.get(id);
    const show = on && i != null && SP.state[i] > 0 && i !== S.sel;
    label("n" + id, name, "sat", show ? tmpV.fromArray(SP.pos, 3 * i) : tmpV, show);
  }
  if (S.sel >= 0 && S.selSat) {
    const w = iss.visible ? iss.position : tmpV.fromArray(SP.pos, 3 * S.sel);
    label("sel", esc(S.selSat.name), "sat sel", w, SP.state[S.sel] > 0 && !iss.visible);
  } else label("sel", "", "", tmpV, false);
  const obsW = E.group.localToWorld(G.llToLocal(S.observer.lat, S.observer.lon, 1.002, tmpV));
  label("obs", "You · " + esc(S.observer.name), "obs", obsW, on);
  if (S.hoverPad >= 0 && S.pads[S.hoverPad]) {
    const p = S.pads[S.hoverPad];
    label("pad", esc(p.short || p.name) + (p.launches.length ? `<small>${p.launches.length} upcoming</small>` : ""), "pad", E.group.localToWorld(tmpV.copy(p.local)), true);
  } else label("pad", "", "", tmpV, false);
  // hover tooltip
  if (S.hover >= 0 && S.hover !== S.sel) {
    const s = S.sats[S.hover];
    const k = 3 * S.hover;
    const r = Math.hypot(SP.pos[k], SP.pos[k + 1], SP.pos[k + 2]) * O.RE - O.RE;
    tip.innerHTML = `<b>${esc(s.name)}</b><span style="--c:${O.GROUP[s.group].color}">${esc(O.GROUP[s.group].label)}</span><em>${fmt(r)} km up${s.illustrative ? " · illustrative" : ""}</em>`;
    const sc = toScreen(tmpV.fromArray(SP.pos, k), tmpV2);
    tip.style.transform = `translate(${Math.round(sc.x + 14)}px, ${Math.round(sc.y - 12)}px)`;
    tip.classList.add("on");
  } else tip.classList.remove("on");
}

let downAt = null;
renderer.domElement.addEventListener("pointerdown", (e) => { downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; cancelFly(); if (S.follow && e.button === 0) { /* orbit around the followed satellite */ } });
renderer.domElement.addEventListener("pointermove", (e) => { pointer.x = e.clientX; pointer.y = e.clientY; pointer.moved = true; pointer.type = e.pointerType; });
renderer.domElement.addEventListener("pointerleave", () => { pointer.x = pointer.y = -1e4; S.hover = -1; S.hoverPad = -1; });
renderer.domElement.addEventListener("pointerup", (e) => {
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  downAt = null;
  if (moved > 6) return;
  const touch = e.pointerType !== "mouse";
  const i = pickSat(e.clientX, e.clientY, touch ? 26 : 14);
  if (i >= 0) { select(S.sats[i], { fly: false }); return; }
  const p = pickPad(e.clientX, e.clientY);
  if (p >= 0) flyToPad(p);
});

/* ================================================================== selection + info card */
const info = $("info");
function select(sat, { fly = true, follow = false } = {}) {
  if (!sat) return;
  if (!S.groupState[sat.group].visible) {
    S.groupState[sat.group].visible = true; renderGroups(); updateCount(); needFull = true;
  }
  S.selSat = sat; S.sel = sat.i;
  S.orbitAt = -1e15; S.trackAt = -1e15;
  const g = O.GROUP[sat.group];
  $("infoOrb").style.setProperty("--c", g.color);
  $("infoGroup").textContent = g.label;
  $("infoName").textContent = sat.name;
  $("infoIds").innerHTML = sat.illustrative
    ? `${sat.id < 900000 ? "NORAD " + sat.id + " · " : ""}illustrative orbit`
    : `NORAD ${sat.id}${sat.cospar ? ' · <abbr title="Committee on Space Research international designator">COSPAR</abbr> ' + esc(sat.cospar) : ""}${sat.launchYear ? " · launched " + sat.launchYear : ""}`;
  $("rInc").innerHTML = `${fmt(sat.inc, 2)}<small>°</small>`;
  $("rPer").innerHTML = sat.periodMin < 600 ? `${fmt(sat.periodMin, 1)}<small>min</small>` : `${fmt(sat.periodMin / 60, 2)}<small>h</small>`;
  $("rApo").innerHTML = `${fmt(sat.apo)}<small>km</small>`;
  $("rPeri").innerHTML = `${fmt(sat.peri)}<small>km</small>`;
  const isISS = sat.id === 25544;
  $("infoNote").textContent = sat.illustrative
    ? "Built from representative elements with a Keplerian + J2 model; its position along the orbit is not real."
    : isISS ? "Zoom in to see a small model of the station, enlarged about 600 times (the real ISS spans 109 m). SGP4 errors grow by roughly 1 to 3 km per day away from the element epoch."
    : "SGP4 errors grow by roughly 1 to 3 km per day away from the element epoch; CelesTrak refreshes elements several times a day.";
  info.hidden = false;
  document.body.classList.add("eo-has-info");
  if (MOBILE()) { const pn = $("panel"); if (!pn.classList.contains("collapsed")) pn.querySelector(".hud-collapse").click(); }
  $("pfSel").disabled = false;
  $("pfSel").textContent = isISS ? "Selected (ISS)" : truncate(sat.name, 16);
  orbitLine.visible = $("tOrbit").checked;
  trackLine.visible = S.showTrack;
  footLine.visible = nadirLine.visible = $("tFoot").checked;
  setStatus();
  updatePeriodCalc();
  if (follow) setFollow(true);
  else if (S.follow) setFollow(true);
  if (fly && !S.follow) flyToSat(sat);
  if (S.passFor === "sel" && activeTab === "passes") computePasses();
}
function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }
function deselect() {
  S.selSat = null; S.sel = -1;
  setFollow(false);
  closeInfo();
}
function closeInfo() {
  info.hidden = true;
  document.body.classList.remove("eo-has-info");
  for (const o of [orbitLine, trackLine, footLine, nadirLine]) o.visible = false;
  iss.visible = false;
  $("pfSel").disabled = true; $("pfSel").textContent = "Selected";
  if (S.passFor === "sel") setPassFor("iss");
  updatePeriodCalc();
}
$("infoClose").addEventListener("click", deselect);
$("followBtn").addEventListener("click", () => setFollow(!S.follow));
$("trackBtn").addEventListener("click", () => {
  S.showTrack = !S.showTrack;
  $("trackBtn").setAttribute("aria-pressed", String(S.showTrack));
  trackLine.visible = S.showTrack && !!S.selSat;
});
$("passBtn").addEventListener("click", () => { setPassFor(S.selSat && S.selSat.id === 25544 ? "iss" : "sel"); showTab("passes"); });
$("tOrbit").addEventListener("change", (e) => { orbitLine.visible = e.target.checked && !!S.selSat; });
$("tFoot").addEventListener("change", (e) => { footLine.visible = nadirLine.visible = e.target.checked && !!S.selSat; });
$("tClouds").addEventListener("change", (e) => { E.clouds.visible = e.target.checked; });
$("tLights").addEventListener("change", (e) => { E.earthMat.uniforms.uLights.value = e.target.checked ? 1 : 0; });
$("tPads").addEventListener("change", (e) => { MK.points.visible = e.target.checked; });

function setFollow(on) {
  const was = S.follow;
  S.follow = on && !!S.selSat;
  $("followBtn").setAttribute("aria-pressed", String(S.follow));
  $("followBtn").textContent = S.follow ? "Following" : "Follow";
  if (S.follow) {
    controls.minDistance = 0.012;
    S.followPrev = null;
    const w = selWorld(tmpV.set(0, 0, 0));
    const d = camera.position.distanceTo(w);
    if (d > 0.6) flyTo({ target: () => selWorld(new THREE.Vector3()), dir: followDir(), dist: S.selSat.id === 25544 ? 0.075 : 0.22 });
  } else {
    controls.minDistance = 1.12;
    if (was) flyTo({ target: () => new THREE.Vector3(), dir: camera.position.clone().normalize(), dist: Math.max(2.4, camera.position.length()), dur: 1.2 });
  }
}
function selWorld(out) {
  if (S.selPV) return G.eciToWorld(S.selPV.position, out).multiplyScalar(1 / O.RE);
  if (S.sel >= 0) return out.fromArray(SP.pos, 3 * S.sel);
  return out.set(0, 0, 0);
}
function followDir() {
  if (!S.selPV) return camera.position.clone().normalize();
  const r = G.eciToWorld(S.selPV.position, new THREE.Vector3()).normalize();
  const v = G.eciToWorld(S.selPV.velocity, new THREE.Vector3()).normalize();
  return r.multiplyScalar(0.62).addScaledVector(v, -0.62).add(new THREE.Vector3().crossVectors(r, v).multiplyScalar(0.45)).normalize();
}

let infoTick = 0;
function updateInfo(tMs, sunAU) {
  if (!S.selSat || performance.now() - infoTick < 120) return;
  infoTick = performance.now();
  const pv = S.selPV;
  if (!pv) { $("rAlt").textContent = "decayed?"; return; }
  const gd = O.geodetic(pv.position, O.gmstOf(tMs));
  const v = Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z);
  $("rAlt").innerHTML = `${fmt(gd.h, gd.h < 2000 ? 1 : 0)}<small>km</small>`;
  $("rSpd").innerHTML = `${fmt(v, 2)}<small>km/s</small>`;
  $("rLat").innerHTML = `${fmt(Math.abs(gd.lat), 2)}<small>° ${gd.lat >= 0 ? "N" : "S"}</small>`;
  $("rLon").innerHTML = `${fmt(Math.abs(gd.lon), 2)}<small>° ${gd.lon >= 0 ? "E" : "W"}</small>`;
  const age = (tMs - S.selSat.epoch) / 3600e3;
  $("rAge").innerHTML = S.selSat.illustrative ? "n/a" : Math.abs(age) < 48 ? `${fmt(age, 1)}<small>h</small>` : `${fmt(age / 24, 1)}<small>days</small>`;
  const lit = O.sunlit(pv.position, sunAU);
  $("rLit").innerHTML = lit ? '<span class="eo-lit">Sunlit</span>' : '<span class="eo-dark">Eclipse</span>';
}

/* ================================================================== orbit, ground track, footprint */
function updateOrbit(tMs) {
  const s = S.selSat;
  if (!s) return;
  const P = s.periodMin * 60e3;
  if (orbitLine.visible && Math.abs(tMs - S.orbitAt) > Math.max(P / 30, 4000)) {
    S.orbitAt = tMs;
    const n = 256, pos = new Float32Array((n + 1) * 3), col = new Float32Array((n + 1) * 3);
    const c = new THREE.Color(O.GROUP[s.group].color);
    for (let k = 0; k <= n; k++) {
      const t = tMs + P * k / n;
      const pv = O.pvAt(s, t, O.jdOf(t));
      if (!pv) continue;
      pos[3 * k] = pv.position.x / O.RE; pos[3 * k + 1] = pv.position.z / O.RE; pos[3 * k + 2] = -pv.position.y / O.RE;
      const f = 1 - 0.8 * k / n;
      col[3 * k] = c.r * f; col[3 * k + 1] = c.g * f; col[3 * k + 2] = c.b * f;
    }
    orbitLine.geometry.dispose();
    orbitLine.geometry = new THREE.BufferGeometry();
    orbitLine.geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    orbitLine.geometry.setAttribute("color", new THREE.BufferAttribute(col, 3));
  }
  if (trackLine.visible && Math.abs(tMs - S.trackAt) > Math.max(P / 60, 3000)) {
    S.trackAt = tMs;
    const span = s.periodMin > 600 ? 86400e3 : 1.5 * P;
    const n = 360, pos = new Float32Array((n + 1) * 3), col = new Float32Array((n + 1) * 3);
    const c = new THREE.Color(O.GROUP[s.group].color);
    const t0 = tMs - span * 0.25;
    for (let k = 0; k <= n; k++) {
      const t = t0 + span * k / n;
      const pv = O.pvAt(s, t, O.jdOf(t));
      if (!pv) continue;
      const gd = O.geodetic(pv.position, O.gmstOf(t));
      G.llToLocal(gd.lat, gd.lon, 1.0025, tmpV);
      pos[3 * k] = tmpV.x; pos[3 * k + 1] = tmpV.y; pos[3 * k + 2] = tmpV.z;
      const f = t < tMs ? 0.25 : 0.95 - 0.55 * (t - tMs) / (span * 0.75);
      col[3 * k] = c.r * f; col[3 * k + 1] = c.g * f; col[3 * k + 2] = c.b * f;
    }
    trackLine.geometry.dispose();
    trackLine.geometry = new THREE.BufferGeometry();
    trackLine.geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    trackLine.geometry.setAttribute("color", new THREE.BufferAttribute(col, 3));
  }
  const farEnough = camera.position.distanceTo(selWorld(tmpV3)) > 0.5;
  footLine.visible = nadirLine.visible = $("tFoot").checked && farEnough;
  if (footLine.visible && S.selPV) {
    const w = G.eciToWorld(S.selPV.position, tmpV).multiplyScalar(1 / O.RE);
    const r = w.length();
    const lam = Math.acos(Math.min(1, 1 / r));                   // Earth-central angle to the horizon
    const cdir = w.clone().normalize();
    const u = new THREE.Vector3(0, 1, 0).cross(cdir);
    if (u.lengthSq() < 1e-6) u.set(1, 0, 0);
    u.normalize();
    const v = cdir.clone().cross(u);
    const a = footGeo.attributes.position.array;
    for (let k = 0; k <= 96; k++) {
      const ph = k / 96 * Math.PI * 2;
      tmpV2.copy(cdir).multiplyScalar(Math.cos(lam)).addScaledVector(u, Math.sin(lam) * Math.cos(ph)).addScaledVector(v, Math.sin(lam) * Math.sin(ph)).multiplyScalar(1.003);
      a[3 * k] = tmpV2.x; a[3 * k + 1] = tmpV2.y; a[3 * k + 2] = tmpV2.z;
    }
    footGeo.attributes.position.needsUpdate = true;
    const na = nadirGeo.attributes.position.array;
    na[0] = w.x; na[1] = w.y; na[2] = w.z; na[3] = cdir.x * 1.001; na[4] = cdir.y * 1.001; na[5] = cdir.z * 1.001;
    nadirGeo.attributes.position.needsUpdate = true;
  }
}

/* ================================================================== camera flights */
let fly = null;
function cancelFly() { fly = null; }
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function flyTo({ target, dir, dist, dur = 1.8 }) {
  const fromT = controls.target.clone();
  const off = camera.position.clone().sub(fromT);
  controls.minDistance = 0.001;
  fly = { t0: performance.now(), dur: RM ? 0.01 : dur * 1000, fromT, fromDir: off.clone().normalize(), fromDist: off.length(), target, dir: dir.clone().normalize(), dist };
}
function stepFly() {
  if (!fly) return false;
  const k = Math.min(1, (performance.now() - fly.t0) / fly.dur), e = ease(k);
  const tt = fly.target();
  controls.target.lerpVectors(fly.fromT, tt, e);
  // slerp the viewing direction, lerp the distance (log space)
  const q = new THREE.Quaternion().setFromUnitVectors(fly.fromDir, fly.dir);
  const d = new THREE.Quaternion().slerp(q, e);
  const dir = fly.fromDir.clone().applyQuaternion(d);
  const dist = Math.exp(Math.log(fly.fromDist) * (1 - e) + Math.log(fly.dist) * e);
  camera.position.copy(controls.target).addScaledVector(dir, dist);
  if (k >= 1) { fly = null; controls.minDistance = S.follow ? 0.012 : 1.12; }
  return true;
}
function flyToSat(sat) {
  const t = simNow(), pv = O.pvAt(sat, t, O.jdOf(t));
  if (!pv) return;
  const r = G.eciToWorld(pv.position, new THREE.Vector3()).multiplyScalar(1 / O.RE);
  const h = new THREE.Vector3().crossVectors(r, G.eciToWorld(pv.velocity, new THREE.Vector3())).normalize();
  const R = r.length();
  const low = R < 1.4;
  // look down on the orbit plane from a little above it, satellite on the near side
  const dir = r.clone().normalize().addScaledVector(h, low ? 0.45 : 1.1).normalize();
  const dist = low ? Math.max(2.9, homeDist() * 0.78) : Math.min(38, (sat.a * (1 + sat.ecc) / O.RE) * (MOBILE() ? 3.4 : 2.3));
  flyTo({ target: () => new THREE.Vector3(), dir, dist });
}
function flyToPad(i) {
  const p = S.pads[i];
  if (!p) return;
  S.hotPad = i;
  for (let k = 0; k < S.pads.length; k++) MK.hot[k + 1] = k === i ? 1 : 0;
  MK.geo.attributes.aHot.needsUpdate = true;
  if (S.follow) setFollow(false);
  const w = E.group.localToWorld(p.local.clone()).normalize();
  flyTo({ target: () => new THREE.Vector3(), dir: w, dist: MOBILE() ? homeDist() * 0.62 : 2.1 });
  document.querySelectorAll(".eo-launch").forEach((el) => el.classList.toggle("hot", el.dataset.pad === String(i)));
}
function homeDir() {
  // Start from the Sun direction and swing towards the observer, so the globe is mostly
  // lit with the terminator on the observer's side (who is then near the limb if it is night).
  const obs = E.group.localToWorld(G.llToLocal(S.observer.lat, S.observer.lon, 1, new THREE.Vector3())).normalize();
  const ang = obs.angleTo(sunDirW);
  const swing = Math.min(Math.max(ang - 70 * Math.PI / 180, 25 * Math.PI / 180), 62 * Math.PI / 180, ang);
  const axis = new THREE.Vector3().crossVectors(sunDirW, obs);
  if (axis.lengthSq() < 1e-8) axis.set(0, 1, 0);
  const dir = sunDirW.clone().applyAxisAngle(axis.normalize(), swing);
  return dir.add(new THREE.Vector3(0, 0.18, 0)).normalize();
}
function fitFov() {
  camera.fov = innerWidth / innerHeight < 0.8 ? 52 : 40;
  camera.updateProjectionMatrix();
}
fitFov();
function homeDist() {
  // keep the whole globe (plus a margin) inside the narrower field of view
  const halfV = camera.fov / 2 * Math.PI / 180;
  const halfH = Math.atan(Math.tan(halfV) * innerWidth / innerHeight);
  const half = Math.min(halfV, halfH) * (MOBILE() ? 0.86 : 0.8);
  return Math.max(3.4, 1.08 / Math.sin(half));
}
function resetView() {
  setFollow(false);
  flyTo({ target: () => new THREE.Vector3(), dir: homeDir(), dist: homeDist() });
}
function whereISS() {
  const s = S.sats.find((x) => x.id === 25544);
  if (!s) { toast("The ISS is not in the loaded data yet."); return; }
  select(s, { fly: false });
  S.selPV = O.pvAt(s, simNow(), O.jdOf(simNow()));
  S.follow = false;
  setFollow(true);
  flyTo({ target: () => selWorld(new THREE.Vector3()), dir: followDir(), dist: 0.075, dur: 2.4 });
}
$("issBtn").addEventListener("click", whereISS);

function toast(msg) {
  let t = document.querySelector(".eo-toast");
  if (!t) { t = document.createElement("div"); t.className = "eo-toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("on");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("on"), 3200);
}

/* ================================================================== search */
const search = $("search"), results = $("searchList");
let hits = [], hitIdx = -1;
function runSearch() {
  const q = search.value.trim().toLowerCase();
  if (!q) { results.hidden = true; search.setAttribute("aria-expanded", "false"); return; }
  const num = /^\d+$/.test(q);
  hits = [];
  for (const s of S.sats) {
    const nm = s.name.toLowerCase();
    let score = -1;
    if (num && String(s.id).startsWith(q)) score = String(s.id) === q ? 0 : 1;
    else if (nm === q) score = 0;
    else if (nm.startsWith(q)) score = 1;
    else if (nm.includes(q)) score = 2;
    if (score >= 0) hits.push([score, s]);
    if (hits.length > 400) break;
  }
  hits.sort((a, b) => a[0] - b[0] || a[1].name.length - b[1].name.length);
  hits = hits.slice(0, 8).map((h) => h[1]);
  hitIdx = hits.length ? 0 : -1;
  results.innerHTML = hits.length ? hits.map((s, k) => `<li role="option" id="hit${k}" data-k="${k}" aria-selected="${k === 0}" style="--c:${O.GROUP[s.group].color}"><i></i><b>${esc(s.name)}</b><small>${s.illustrative ? "illustrative" : "NORAD " + s.id}</small></li>`).join("")
    : `<li class="none">No match in the ${fmt(S.sats.length)} loaded satellites</li>`;
  results.hidden = false; search.setAttribute("aria-expanded", "true");
}
search.addEventListener("input", runSearch);
search.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!hits.length) return;
    hitIdx = (hitIdx + (e.key === "ArrowDown" ? 1 : hits.length - 1)) % hits.length;
    results.querySelectorAll("li").forEach((li, k) => li.setAttribute("aria-selected", String(k === hitIdx)));
    search.setAttribute("aria-activedescendant", "hit" + hitIdx);
  } else if (e.key === "Enter") {
    if (hitIdx >= 0 && hits[hitIdx]) pickHit(hits[hitIdx]);
  } else if (e.key === "Escape") { search.value = ""; runSearch(); search.blur(); }
});
results.addEventListener("pointerdown", (e) => {
  const li = e.target.closest("li[data-k]");
  if (li) { e.preventDefault(); pickHit(hits[+li.dataset.k]); }
});
search.addEventListener("blur", () => setTimeout(() => { results.hidden = true; search.setAttribute("aria-expanded", "false"); }, 150));
function pickHit(s) { select(s, { fly: true }); search.value = ""; results.hidden = true; search.blur(); }

/* ================================================================== time controls */
function setSpeed(i) {
  const t = simNow();
  S.speedIdx = Math.max(0, Math.min(SPEEDS.length - 1, i));
  S.simBase = t; S.perfBase = performance.now();
  needFull = true;
  const sp = SPEEDS[S.speedIdx];
  $("speedOut").textContent = sp === 0 ? "Paused" : sp + "×";
  updateSpeedTag();
}
function updateSpeedTag() {
  const sp = SPEEDS[S.speedIdx];
  const live = sp === 1 && Math.abs(simNow() - Date.now()) < 3000;
  const el = $("speedTag");
  el.textContent = live ? "Real time" : sp === 0 ? "Paused" : sp === 1 ? "Replay" : `${sp}× speed`;
  el.classList.toggle("warp", !live);
}
$("slower").addEventListener("click", () => setSpeed(S.speedIdx - 1));
$("faster").addEventListener("click", () => setSpeed(S.speedIdx + 1));
$("nowBtn").addEventListener("click", goNow);
function goNow() { S.simBase = Date.now(); S.perfBase = performance.now(); S.speedIdx = 1; setSpeed(1); }
setSpeed(S.speedIdx);

addEventListener("keydown", (e) => {
  if (e.target.closest && e.target.closest("input, textarea, select")) return;
  if (e.key === "/") { e.preventDefault(); search.focus(); }
  else if (e.key === "i" || e.key === "I") whereISS();
  else if (e.key === "n" || e.key === "N") goNow();
  else if (e.key === "f" || e.key === "F") setFollow(!S.follow);
  else if (e.key === "Escape") { deselect(); resetView(); }
  else if (e.key === "+" || e.key === "=") setSpeed(S.speedIdx + 1);
  else if (e.key === "-") setSpeed(S.speedIdx - 1);
});

/* ================================================================== tabs */
let activeTab = "sats";
const TABS = ["sats", "passes", "launches", "news", "learn"];
function showTab(k) {
  activeTab = k;
  for (const t of TABS) {
    const b = $("t-" + t), p = $("p-" + t);
    const on = t === k;
    b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1;
    p.hidden = !on;
  }
  const panel = $("panel");
  if (panel.classList.contains("collapsed")) panel.querySelector(".hud-collapse").click();
  if (k === "passes") computePasses();
  if (k === "launches" && S.launchStatus === "idle") loadLaunchFeed();
  if (k === "news" && !newsLoaded) loadNewsFeed();
  if (k === "learn") renderMath();
}
document.querySelector(".eo-tabs").addEventListener("click", (e) => { const b = e.target.closest("[role=tab]"); if (b) showTab(b.id.slice(2)); });
document.querySelector(".eo-tabs").addEventListener("keydown", (e) => {
  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
  const i = TABS.indexOf(activeTab), j = (i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length;
  showTab(TABS[j]); $("t-" + TABS[j]).focus();
});

/* ================================================================== passes */
const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const compass = (az) => COMPASS[Math.round(((az % 360) + 360) % 360 / 22.5) % 16];
function setPassFor(k) {
  S.passFor = k;
  $("pfISS").setAttribute("aria-pressed", String(k === "iss"));
  $("pfSel").setAttribute("aria-pressed", String(k === "sel"));
  if (activeTab === "passes") computePasses();
}
$("pfISS").addEventListener("click", () => setPassFor("iss"));
$("pfSel").addEventListener("click", () => setPassFor("sel"));
function renderObserver() {
  const o = S.observer;
  $("obsName").textContent = o.name;
  $("obsCoords").textContent = `${fmt(Math.abs(o.lat), 2)}° ${o.lat >= 0 ? "N" : "S"}, ${fmt(Math.abs(o.lon), 2)}° ${o.lon >= 0 ? "E" : "W"}`;
  MK.pos.set(G.llToLocal(o.lat, o.lon, 1.003, tmpV).toArray(), 0);
  MK.col[0] = 0.31; MK.col[1] = 0.94; MK.col[2] = 0.72;
  MK.geo.attributes.position.needsUpdate = true; MK.geo.attributes.aColor.needsUpdate = true;
  MK.geo.setDrawRange(0, 1 + S.pads.length);
}
$("geoBtn").addEventListener("click", () => {
  const msg = $("geoMsg");
  if (!("geolocation" in navigator)) { msg.textContent = "Your browser does not share a location; using Los Angeles."; return; }
  msg.textContent = "Asking your browser for your location…";
  try {
    navigator.geolocation.getCurrentPosition((p) => {
      S.observer = { lat: p.coords.latitude, lon: p.coords.longitude, h: Math.max(0, (p.coords.altitude || 0) / 1000), name: "Your location" };
      O.lsSet("cl-earth-observer", S.observer);
      msg.textContent = "Location used only in this browser to compute passes; it is never sent anywhere.";
      renderObserver(); S.passKey = ""; computePasses();
    }, (err) => {
      msg.textContent = err && err.code === 1 ? "Location permission was declined; still using " + S.observer.name + "." : "Could not get a location right now; still using " + S.observer.name + ".";
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 });
  } catch (e) { msg.textContent = "Location is unavailable here; still using " + S.observer.name + "."; }
});

function computePasses() {
  const list = $("passList");
  const sat = S.passFor === "sel" && S.selSat ? S.selSat : S.sats.find((x) => x.id === 25544);
  if (!sat) { list.innerHTML = `<div class="eo-card-msg">Waiting for orbital data…</div>`; return; }
  const t = simNow();
  const key = `${sat.id}|${S.observer.lat.toFixed(3)}|${S.observer.lon.toFixed(3)}|${Math.floor(t / 600e3)}`;
  if (key === S.passKey) return;
  S.passKey = key;
  list.innerHTML = `<div class="eo-card-msg"><span class="eo-spin"></span> Predicting passes of ${esc(sat.name)}…</div>`;
  setTimeout(() => {
    let res;
    try { res = O.findPasses(sat, S.observer, t, sat.periodMin < 200 ? 72 : 168, 8); } catch (e) { res = { passes: [], error: true }; }
    renderPasses(sat, res, t);
  }, 30);
}
function skyPlot(track) {
  // polar sky plot: zenith at centre, horizon at r = 40, north up, east left (as seen looking up)
  const pt = (az, el) => { const r = 40 * (1 - el / 90), a = az * Math.PI / 180; return [50 - r * Math.sin(a), 50 - r * Math.cos(a)]; };
  let d = "", dv = "";
  track.forEach((p, i) => { const [x, y] = pt(p.az, Math.max(0, p.el)); d += (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1); });
  let on = false;
  track.forEach((p) => { const [x, y] = pt(p.az, Math.max(0, p.el)); if (p.vis) { dv += (on ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1); on = true; } else on = false; });
  const last = track[track.length - 1] ? pt(track[track.length - 1].az, 0) : [50, 10];
  return `<svg viewBox="0 0 100 100" class="eo-sky" aria-hidden="true"><circle cx="50" cy="50" r="40" class="h"/><circle cx="50" cy="50" r="26.7" class="g"/><circle cx="50" cy="50" r="13.3" class="g"/>
    <text x="50" y="7">N</text><text x="97" y="53">W</text><text x="3" y="53">E</text><text x="50" y="99">S</text>
    <path d="${d}" class="t"/>${dv ? `<path d="${dv}" class="v"/>` : ""}<circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.4" class="e"/></svg>`;
}
const tFmt = (t) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const dFmt = (t) => new Date(t).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
function renderPasses(sat, res, t) {
  const list = $("passList");
  const illus = sat.illustrative ? `<div class="eo-illus">Illustrative orbit: these times are not real predictions.</div>` : "";
  if (res.fixed) {
    list.innerHTML = illus + `<div class="eo-card-msg"><b>${esc(sat.name)}</b> barely moves in your sky: ${res.el > 0
      ? `it hangs ${fmt(res.el, 1)}° above the ${compass(res.az)} horizon (azimuth ${fmt(res.az, 0)}°).`
      : "it stays below your horizon."}</div>`;
    return;
  }
  if (!res.passes.length) {
    list.innerHTML = illus + `<div class="eo-card-msg">No passes above 10° for <b>${esc(sat.name)}</b> in the next ${sat.periodMin < 200 ? 3 : 7} days from ${esc(S.observer.name)}.${sat.inc < Math.abs(S.observer.lat) - 15 ? " Its orbit never reaches your latitude." : ""}</div>`;
    return;
  }
  const nextVis = res.passes.find((p) => p.visible);
  const head = `<div class="eo-nextvis">${nextVis ? `Next naked-eye pass of <b>${esc(sat.name)}</b>: <b>${dFmt(nextVis.visStart || nextVis.rise)} ${tFmt(nextVis.visStart || nextVis.rise)}</b> <span class="eo-cd" data-t="${nextVis.visStart || nextVis.rise}"></span>` : `No naked-eye passes of <b>${esc(sat.name)}</b> in this window: the ones below happen in daylight or while it is in Earth's shadow.`}</div>`;
  list.innerHTML = illus + head + res.passes.map((p) => {
    const dur = Math.round((p.set - p.rise) / 60000);
    const badge = p.visible ? '<span class="chip aurora">Visible</span>' : !p.dark ? '<span class="chip">Daylight</span>' : !p.sunlit ? '<span class="chip nebula">In Earth\'s shadow</span>' : '<span class="chip">Low</span>';
    return `<article class="eo-pass${p.visible ? " vis" : ""}">
      ${skyPlot(p.track)}
      <div class="eo-pass-b">
        <div class="eo-pass-h"><b>${dFmt(p.rise)}</b>${badge}</div>
        <div class="eo-pass-row"><span>Rise</span><b>${tFmt(p.rise)}</b><em>${compass(p.riseAz)}</em></div>
        <div class="eo-pass-row"><span>Highest</span><b>${tFmt(p.tMax)}</b><em>${fmt(p.maxEl, 0)}° ${compass(p.maxAz)}</em></div>
        <div class="eo-pass-row"><span>Set</span><b>${tFmt(p.set)}</b><em>${compass(p.setAz)}</em></div>
        <div class="eo-elbar"><i style="width:${(p.maxEl / 90 * 100).toFixed(0)}%"></i></div>
        <small>${dur} min · ${fmt(p.range)} km away at best · Sun ${fmt(p.sunElAtMax, 0)}°</small>
      </div></article>`;
  }).join("");
  tickCountdowns();
}

/* ================================================================== launches */
const launchList = $("launchList");
async function loadLaunchFeed() {
  S.launchStatus = "loading";
  launchList.innerHTML = `<div class="eo-skel"></div><div class="eo-skel"></div><div class="eo-skel"></div>`;
  const res = await O.loadLaunches(OFFLINE);
  S.launchStatus = res.status;
  if (!res.data || !res.data.length) {
    launchList.innerHTML = offlineCard("launches", "The Space Devs launch schedule could not be reached, so there are no live countdowns right now. The glowing markers on the globe show the world's major launch sites instead.", "retryLaunch");
    $("retryLaunch").addEventListener("click", loadLaunchFeed);
    if (fallback && !S.pads.length) setPads(fallback.pads.map((p) => ({ name: p.name, short: p.short, lat: p.lat, lon: p.lon, launches: [] })), true);
    return;
  }
  S.launches = res.data.filter((l) => l.net && Date.parse(l.net) > Date.now() - 6 * 3600e3);
  // group launches by pad for the markers
  const pads = [];
  for (const l of S.launches) {
    if (!isFinite(l.lat) || !isFinite(l.lon)) { l.padIdx = -1; continue; }
    let k = pads.findIndex((p) => Math.abs(p.lat - l.lat) < 0.05 && Math.abs(p.lon - l.lon) < 0.05);
    if (k < 0) { pads.push({ name: l.pad, short: (l.location || l.pad).split(",")[0], lat: l.lat, lon: l.lon, launches: [] }); k = pads.length - 1; }
    pads[k].launches.push(l); l.padIdx = k;
  }
  setPads(pads, false);
  const stale = res.status === "stale" ? `<div class="eo-illus">Showing the schedule saved ${ago(res.t)}; the live feed is unreachable.</div>` : "";
  launchList.innerHTML = stale + S.launches.map((l) => {
    const img = safeURL(l.image);
    const st = (l.status || "").toUpperCase();
    const cls = st === "GO" ? "aurora" : st === "SUCCESS" ? "ice" : st === "HOLD" || st === "FAILURE" ? "flame" : "";
    return `<button class="eo-launch" data-pad="${l.padIdx}" ${l.padIdx < 0 ? "disabled" : ""}>
      <span class="eo-thumb">${img ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c3 3 4 7 3 12h-6C8 9 9 5 12 2zm-3 13h6l-1 3h-4zm1 4h4l-2 3z"/></svg></span>
      <span class="eo-lb">
        <span class="eo-lt"><b>${esc(l.mission || l.name)}</b><span class="chip ${cls}" title="${esc(l.statusName)}">${esc(l.status || "?")}</span></span>
        <span class="eo-lv">${esc(l.vehicle)}${l.provider ? " · " + esc(l.provider) : ""}</span>
        <span class="eo-lp">${esc(l.pad)}${l.location ? ", " + esc(l.location) : ""}</span>
        <span class="eo-lw"><span class="eo-cd" data-t="${Date.parse(l.net)}"></span><em>${new Date(l.net).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}${l.orbit ? " · " + esc(l.orbit) : ""}</em></span>
      </span></button>`;
  }).join("");
  tickCountdowns();
}
launchList.addEventListener("click", (e) => {
  const b = e.target.closest(".eo-launch");
  if (b && +b.dataset.pad >= 0) flyToPad(+b.dataset.pad);
});
function offlineCard(what, text, id) {
  return `<div class="eo-offcard"><svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="20"/><path d="M8 24h32M24 4c6 6 6 34 0 40M24 4c-6 6-6 34 0 40"/><path d="M6 6l36 36" class="x"/></svg>
    <b>Offline for now</b><p>${text}</p><button class="btn small" id="${id}">Try again</button></div>`;
}
function setPads(pads, generic) {
  S.pads = pads.slice(0, 60);
  S.padsGeneric = generic;
  S.pads.forEach((p, k) => {
    p.local = G.llToLocal(p.lat, p.lon, 1.003);
    MK.pos.set(p.local.toArray(), 3 * (k + 1));
    const hot = generic ? [0.75, 0.5, 0.32] : [1.0, 0.48, 0.24];
    MK.col.set(hot, 3 * (k + 1));
    MK.phase[k + 1] = (k * 0.37) % 1;
    MK.hot[k + 1] = 0;
  });
  MK.geo.setDrawRange(0, 1 + S.pads.length);
  for (const a of ["position", "aColor", "aPhase", "aHot"]) MK.geo.attributes[a].needsUpdate = true;
}

function countdown(ms) {
  const neg = ms < 0; ms = Math.abs(ms);
  const d = Math.floor(ms / 86400e3), h = Math.floor(ms / 3600e3) % 24, m = Math.floor(ms / 60e3) % 60, s = Math.floor(ms / 1000) % 60;
  const p = (x) => String(x).padStart(2, "0");
  return (neg ? "T+ " : "T− ") + (d ? d + "d " : "") + `${p(h)}:${p(m)}:${p(s)}`;
}
function tickCountdowns() {
  const now = Date.now();
  document.querySelectorAll(".eo-cd").forEach((el) => { el.textContent = countdown(+el.dataset.t - now); });
}
setInterval(() => { if (!document.hidden) { tickCountdowns(); updateSpeedTag(); } }, 1000);

/* ================================================================== news */
let newsLoaded = false;
async function loadNewsFeed() {
  newsLoaded = true;
  const el = $("newsList");
  el.innerHTML = `<div class="eo-skel"></div><div class="eo-skel"></div><div class="eo-skel"></div>`;
  const res = await O.loadNews(OFFLINE);
  if (!res.data || !res.data.length) {
    el.innerHTML = offlineCard("news", "The Spaceflight News API could not be reached. Headlines will appear here as soon as your connection (or the service) is back.", "retryNews");
    $("retryNews").addEventListener("click", loadNewsFeed);
    return;
  }
  const stale = res.status === "stale" ? `<div class="eo-illus">Saved ${ago(res.t)}; the live feed is unreachable.</div>` : "";
  el.innerHTML = stale + res.data.map((a) => {
    const url = safeURL(a.url), img = safeURL(a.image);
    return `<a class="eo-article" href="${esc(url)}" target="_blank" rel="noopener noreferrer">
      <span class="eo-athumb">${img ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}</span>
      <span class="eo-ab"><small><b>${esc(a.site)}</b> · ${a.published ? ago(Date.parse(a.published)) : ""}</small><span class="eo-at">${esc(a.title)}</span></span></a>`;
  }).join("");
}

/* ================================================================== learn: TLE, regimes diagram, KaTeX */
const TLE1 = "1 25544U 98067A   08264.51782528 -.00002182  00000-0 -11606-4 0  2927";
const TLE2 = "2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391563537";
// [first column, last column] (1-based, inclusive), colour, meaning — column layout from CelesTrak "FAQs: Two-Line Element Set Format"
const F1 = [[1, 1, "#8f98bd", "Line number."], [3, 7, "#ffd27a", "Satellite catalogue number (NORAD): 25544 is the ISS."], [8, 8, "#8f98bd", "Classification: U = unclassified."],
  [10, 17, "#b18cff", "International designator from the Committee on Space Research (COSPAR): launched 1998, 67th launch of the year, piece A."],
  [19, 32, "#7cc8ff", "Epoch: year 2008, day 264.51782528 (20 September, 12:25:40 UTC). The elements describe the orbit at this instant."],
  [34, 43, "#ff8a4c", "First derivative of mean motion ÷ 2 (revolutions/day²): how fast the orbit is decaying."],
  [45, 52, "#8f98bd", "Second derivative of mean motion ÷ 6, usually zero."],
  [54, 61, "#ff5fa8", "B* drag term (1/Earth radii): −0.11606 × 10⁻⁴. How strongly the thin upper atmosphere slows it."],
  [63, 63, "#8f98bd", "Ephemeris type: 0 = SGP4, or its deep-space twin Simplified Deep-space Perturbations 4 (SDP4)."], [65, 68, "#8f98bd", "Element set number: 292."], [69, 69, "#4ef0b8", "Checksum: sum of the digits (minus signs count 1), modulo 10."]];
const F2 = [[1, 1, "#8f98bd", "Line number."], [3, 7, "#ffd27a", "Catalogue number again."],
  [9, 16, "#a6f07a", "Inclination: 51.6416°, the tilt of the orbit to the equator. The ISS covers 51.6° N to 51.6° S."],
  [18, 25, "#7cc8ff", "Right ascension of the ascending node: 247.4627°, where the orbit crosses the equator northbound, measured from the vernal equinox."],
  [27, 33, "#ff8a4c", "Eccentricity: 0.0006703 (decimal point assumed). Almost a perfect circle."],
  [35, 42, "#b18cff", "Argument of perigee: 130.5360°, the angle from the ascending node to the lowest point."],
  [44, 51, "#ff5fa8", "Mean anomaly: 325.0288°, how far round the orbit the satellite was at the epoch."],
  [53, 63, "#ffd27a", "Mean motion: 15.72125391 revolutions per day, so one orbit takes 91.6 minutes."],
  [64, 68, "#8f98bd", "Revolution number at epoch: 56,353 orbits since launch."], [69, 69, "#4ef0b8", "Checksum."]];
function tleLine(line, fields, ln) {
  let html = "", col = 1;
  for (const [a, b, c, m] of fields) {
    if (a > col) html += esc(line.slice(col - 1, a - 1)).replace(/ /g, "&nbsp;");
    html += `<span class="f" tabindex="0" style="--c:${c}" data-m="${esc(m)}">${esc(line.slice(a - 1, b)).replace(/ /g, "&nbsp;")}</span>`;
    col = b + 1;
  }
  return `<div class="l" aria-label="Line ${ln}">${html}</div>`;
}
$("tle").innerHTML = `<div class="l n">ISS (ZARYA)</div>${tleLine(TLE1, F1, 1)}${tleLine(TLE2, F2, 2)}`;
function tleShow(e) {
  const f = e.target.closest && e.target.closest(".f");
  if (!f) return;
  $("tle").querySelectorAll(".f.on").forEach((x) => x.classList.remove("on"));
  f.classList.add("on");
  $("tleKey").innerHTML = `<i style="--c:${f.style.getPropertyValue("--c")}"></i><b>${f.textContent.trim()}</b> ${f.dataset.m}`;
}
$("tle").addEventListener("pointerover", tleShow);
$("tle").addEventListener("focusin", tleShow);
$("tle").addEventListener("click", tleShow);

function drawRegimeSvg(c) {
  const svg = $("regimeSvg");
  if (!svg) return;
  const cx = 118, cy = 125, R0 = 26, k = 0.46;
  const rr = (alt) => R0 + k * Math.sqrt(alt);
  const ring = (alt, col, dash) => `<circle cx="${cx}" cy="${cy}" r="${rr(alt).toFixed(1)}" fill="none" stroke="${col}" stroke-width="${dash ? 1 : 1.4}" ${dash ? 'stroke-dasharray="2 3"' : ""} opacity=".85"/>`;
  const rp = rr(600), ra = rr(39700), a = (rp + ra) / 2, ecc = (ra - rp) / 2;
  const lab = (y, col, t, n) => `<text x="236" y="${y}" fill="${col}" class="rl">${t}</text><text x="236" y="${y + 12}" class="rn">${n}</text>`;
  svg.innerHTML = `
    <defs><radialGradient id="eog" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#7cc8ff"/><stop offset=".6" stop-color="#1d4f8f"/><stop offset="1" stop-color="#0a1730"/></radialGradient></defs>
    <path d="M${cx} ${cy - rr(160)}A${rr(160)} ${rr(160)} 0 1 1 ${cx - .01} ${cy - rr(160)}M${cx} ${cy - rr(2000)}A${rr(2000)} ${rr(2000)} 0 1 0 ${cx + .01} ${cy - rr(2000)}Z" fill="#6fb8ff" opacity=".22" fill-rule="evenodd"/>
    ${ring(20200, "#4ef0b8", true)}${ring(23222, "#b18cff", true)}${ring(35786, "#ff8a4c")}
    <ellipse cx="${cx}" cy="${(cy - ecc).toFixed(1)}" rx="${(a * 0.55).toFixed(1)}" ry="${a.toFixed(1)}" fill="none" stroke="#ffb85c" stroke-width="1.2" transform="rotate(-28 ${cx} ${cy})" opacity=".9"/>
    <circle cx="${cx}" cy="${cy}" r="${R0}" fill="url(#eog)"/>
    <text x="${cx}" y="${cy + 3}" class="re">Earth</text>
    ${lab(40, "#6fb8ff", "LEO  < 2,000 km", fmt(c.LEO) + " loaded")}
    ${lab(84, "#4ef0b8", "MEO  navigation", fmt(c.MEO) + " loaded")}
    ${lab(128, "#ff8a4c", "GEO  35,786 km", fmt(c.GEO) + " loaded")}
    ${lab(172, "#ffb85c", "HEO  Molniya", fmt(c.HEO) + " loaded")}`;
}
let mathDone = false;
function renderMath() {
  if (mathDone || !window.katex) { updatePeriodCalc(); return; }
  try {
    window.katex.render("T = 2\\pi\\sqrt{\\dfrac{a^{3}}{\\mu}}", $("mathPeriod"), { displayMode: true, throwOnError: false });
    mathDone = true;
  } catch (e) { $("mathPeriod").textContent = "T = 2π √(a³ / μ)"; }
  updatePeriodCalc();
}
function updatePeriodCalc() {
  const s = S.selSat || S.sats.find((x) => x.id === 25544);
  const el = $("periodCalc");
  if (!el) return;
  if (!s) { el.innerHTML = ""; return; }
  const a = s.a, T = 2 * Math.PI * Math.sqrt(a ** 3 / O.MU);          // s
  const v = Math.sqrt(O.MU / a);
  el.innerHTML = `<b>${esc(s.name)}</b>: <i>a</i> = ${fmt(a)} km → <i>T</i> = 2π√(${fmt(a)}³ / 398,600) = <b>${fmt(T / 60, 1)} min</b>, circular speed ≈ <b>${fmt(v, 2)} km/s</b> (${fmt(v * 3600)} km/h).`;
}

/* ================================================================== main loop */
const sunDirW = new THREE.Vector3(1, 0, 0);
let running = true, lastFrame = performance.now(), frames = 0, fpsT = performance.now(), fps = 60;
let rafId = 0;
document.addEventListener("visibilitychange", () => {
  running = !document.hidden;
  cancelAnimationFrame(rafId);
  if (running) { needFull = true; lastFrame = performance.now(); rafId = requestAnimationFrame(frame); }
});
addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  fitFov();
  viewOffset(true);
  camera.updateProjectionMatrix();
});

function frame(now) {
  if (!running) return;
  rafId = requestAnimationFrame(frame);
  const t = simNow();
  const wallDt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;
  window.__sim && (window.__sim.frames = (window.__sim.frames || 0) + 1);
  frames++; if (now - fpsT > 1000) { fps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now; }

  // Earth rotation and the Sun
  const gmst = O.gmstOf(t);
  E.group.rotation.y = gmst;
  const sunE = O.sunECI(t);
  sunDirW.set(sunE.x, sunE.z, -sunE.y).normalize();
  E.uniforms.uSunDir.value.copy(sunDirW);
  sun.position.copy(sunDirW).multiplyScalar(700);
  sunLight.position.copy(sunDirW).multiplyScalar(10);
  E.uniforms.uCloudPhase.value = STILL ? 0.25 : (t / 1000 / 21600) % 1;           // one flow cycle per 6 h of simulated time

  // satellites
  stepSwarm(t);
  writePositions(t);
  if (SP.mat) {
    SP.mat.uniforms.uSunDir.value.copy(sunDirW);
    SP.mat.uniforms.uTime.value = STILL || RM ? 0 : now / 1000;
    SP.mat.uniforms.uPx.value = renderer.getPixelRatio();
  }
  MK.mat.uniforms.uTime.value = STILL || RM ? 0.3 : now / 1000;
  MK.mat.uniforms.uPx.value = renderer.getPixelRatio();
  stars.material.uniforms.uPx.value = renderer.getPixelRatio();

  // selected satellite, exact every frame
  S.selPV = S.selSat ? O.pvAt(S.selSat, t, O.jdOf(t)) : null;
  if (S.selSat) {
    updateOrbit(t);
    updateInfo(t, sunE.au);
    // ISS model
    const isISS = S.selSat.id === 25544 && S.selPV;
    if (isISS) {
      const w = selWorld(tmpV);
      const d = camera.position.distanceTo(w);
      iss.visible = d < 0.45;
      if (iss.visible) {
        iss.position.copy(w);
        const r = w.clone().normalize();
        const v = G.eciToWorld(S.selPV.velocity, new THREE.Vector3()).normalize();
        const h = new THREE.Vector3().crossVectors(r, v).normalize();
        const f = new THREE.Vector3().crossVectors(h, r).normalize();
        iss.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f, r, h.clone().negate()));
        iss.scale.setScalar(0.0105);
        // point the arrays at the Sun (rotation about the truss axis, local Z)
        const sl = sunDirW.clone().applyQuaternion(iss.quaternion.clone().invert());
        const ang = Math.atan2(sl.y, sl.x);
        for (const wg of iss.userData.wings) wg.rotation.z = ang;
      }
    } else iss.visible = false;
  }

  // camera: fly, follow, dynamic near plane
  const flying = stepFly();
  if (S.follow && S.selPV && !flying) {
    const w = selWorld(tmpV);
    if (S.followPrev) {
      const dlt = tmpV2.copy(w).sub(S.followPrev);
      camera.position.add(dlt);
    }
    controls.target.copy(w);
    S.followPrev = (S.followPrev || new THREE.Vector3()).copy(w);
  } else if (S.follow && flying) S.followPrev = selWorld(new THREE.Vector3());
  controls.update();
  const alt = camera.position.length() - 1;
  const nearTarget = S.follow ? camera.position.distanceTo(controls.target) : alt;
  camera.near = Math.max(0.0004, Math.min(alt, nearTarget) * 0.25);
  viewOffset(STILL || RM);
  camera.far = 2000;
  camera.updateProjectionMatrix();
  E.update(camera.position.length());

  // hover
  if (pointer.moved && !fly && pointer.type !== "touch") {
    pointer.moved = false;
    S.hover = pickSat(pointer.x, pointer.y, 12);
    S.hoverPad = S.hover < 0 && MK.points.visible ? pickPad(pointer.x, pointer.y) : -1;
    renderer.domElement.style.cursor = S.hover >= 0 || S.hoverPad >= 0 ? "pointer" : "";
  }
  updateLabels();
  if (now - (frame._c || 0) > 250) {
    frame._c = now;
    $("utc").textContent = new Date(t).toISOString().slice(11, 19);
  }
  renderer.render(scene, camera);
  if (!S.ready) {
    S.ready = true;
    $("loading").classList.add("done");
    window.__sim.ready = true;
  }
}

/* ================================================================== boot */
window.__sim = {
  ready: false, S, get fps() { return fps; }, get count() { return N; },
  select: (q) => { const s = S.sats.find((x) => x.id === +q || x.name.toLowerCase().includes(String(q).toLowerCase())); if (s) select(s); return s ? s.name : null; },
  get sp() { return SP; }, O,
  time: (ms) => { S.simBase = ms; S.perfBase = performance.now(); needFull = true; S.passKey = ""; },
  iss: whereISS, tab: showTab, speed: setSpeed, reset: resetView, camera, controls,
  view: (lat, lon, dist) => { const w = E.group.localToWorld(G.llToLocal(lat, lon, 1, new THREE.Vector3())).normalize(); fly = null; controls.target.set(0, 0, 0); camera.position.copy(w.multiplyScalar(dist)); controls.update(); }
};
if (MOBILE()) search.placeholder = "Search";
renderObserver();
renderGroups();
renderRegimes();
setStatus();
{
  // initial camera: over the observer, swung towards the Sun so the day side and terminator show
  const t = simNow();
  E.group.rotation.y = O.gmstOf(t);
  E.group.updateMatrixWorld(true);
  const s = O.sunECI(t); sunDirW.set(s.x, s.z, -s.y).normalize();
  camera.position.copy(homeDir().multiplyScalar(homeDist()));
  controls.update();
}
rafId = requestAnimationFrame(frame);
loadTxt.textContent = "Downloading orbital elements";
loadAll();
loadLaunchFeed();
if (!MOBILE()) setTimeout(() => { if (!newsLoaded) loadNewsFeed(); }, 1500);
