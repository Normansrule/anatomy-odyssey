/* Live Earth Orbit: orbital data, propagation and pass prediction.
 *
 * Live path  : CelesTrak General Perturbations (GP) element sets in JSON
 *              (Orbit Mean-Elements Message, OMM, keywords) → satellite.js
 *              json2satrec → Simplified General Perturbations 4 (SGP4).
 *              https://celestrak.org/NORAD/documentation/gp-data-formats.php
 * Offline    : site/data/earth-fallback.json → Keplerian two-body orbit plus
 *              the secular J2 (Earth oblateness) drift of node, perigee and
 *              mean anomaly (Vallado, Fundamentals of Astrodynamics, 4th ed.,
 *              eqs. 9-41 to 9-43). ILLUSTRATIVE: phases along orbits are not real.
 *
 * Frames: SGP4 returns True Equator Mean Equinox (TEME) km and km/s, which we
 * treat as Earth-Centred Inertial (ECI) — the difference (< 0.01°) is far
 * below what the globe can show.
 */
import * as satellite from "satellite.js";

export const MU = 398600.4418;      // km³/s², Earth gravitational parameter (WGS-84)
export const RE = 6378.137;         // km, equatorial radius (WGS-84); 1 scene unit
export const J2 = 1.08262668e-3;    // Earth's second zonal harmonic
export const AU_KM = 149597870.7;
export const DEG = Math.PI / 180;

// CelesTrak groups, in de-duplication priority (a satellite listed in two
// groups is drawn once, in the first). Colours come from the codex palette.
export const GROUPS = [
  { key: "stations", label: "Space stations", color: "#ffd27a", size: 5.2, note: "ISS, Tiangong and docked craft" },
  { key: "science", label: "Science", color: "#ff5fa8", size: 3.6, note: "Hubble, Earth observers, X-ray and gamma-ray telescopes" },
  { key: "weather", label: "Weather", color: "#a6f07a", size: 3.6, note: "Polar orbiters and geostationary imagers" },
  { key: "gps-ops", label: "GPS", color: "#4ef0b8", size: 3.8, note: "US Global Positioning System (GPS), operational" },
  { key: "galileo", label: "Galileo", color: "#b18cff", size: 3.8, note: "European navigation constellation" },
  { key: "geo", label: "Geostationary", color: "#ff8a4c", size: 3.0, note: "Active satellites in the geostationary belt" },
  { key: "molniya", label: "Molniya (HEO)", color: "#ffb85c", size: 3.6, note: "Highly elliptical 12-hour orbits" },
  { key: "visual", label: "Brightest", color: "#eef1ff", size: 3.2, note: "About 150 objects you can see by eye" },
  { key: "starlink", label: "Starlink", color: "#6fb8ff", size: 2.3, note: "SpaceX broadband megaconstellation" }
];
export const GROUP = Object.fromEntries(GROUPS.map((g, i) => [g.key, Object.assign(g, { index: i })]));

const CELESTRAK = "https://celestrak.org/NORAD/elements/gp.php";
const TTL_GP = 2 * 3600e3;          // CelesTrak asks for at most one download per group per 2 h
const TTL_FEED = 30 * 60e3;

/* ------------------------------------------------------------------ storage */
export function lsGet(k) { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
export function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

export async function fetchJSON(url, ms = 15000) {
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = setTimeout(() => ctl && ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl ? ctl.signal : undefined, headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const txt = await r.text();          // CelesTrak answers some errors with plain text
    return JSON.parse(txt);
  } finally { clearTimeout(timer); }
}

/* Cache-first fetch with a time-to-live; falls back to a stale copy. */
export async function cachedFetch(key, url, ttl, validate, shrink, offline) {
  const c = lsGet(key);
  const now = Date.now();
  if (c && now - c.t < ttl) return { status: "cached", data: c.d, t: c.t };
  if (!offline) {
    try {
      const raw = await fetchJSON(url);
      if (!validate(raw)) throw new Error("unexpected response");
      const d = shrink ? shrink(raw) : raw;
      lsSet(key, { t: now, d });
      return { status: "live", data: d, t: now };
    } catch (e) { /* network, CORS, rate limit or parse failure: handled below */ }
  }
  if (c) return { status: "stale", data: c.d, t: c.t };
  return { status: "failed", data: null, t: 0 };
}

/* ------------------------------------------------------------------ GP data */
const F = ["OBJECT_NAME", "OBJECT_ID", "EPOCH", "MEAN_MOTION", "ECCENTRICITY", "INCLINATION", "RA_OF_ASC_NODE",
  "ARG_OF_PERICENTER", "MEAN_ANOMALY", "NORAD_CAT_ID", "BSTAR", "MEAN_MOTION_DOT", "MEAN_MOTION_DDOT"];
const packGP = (arr) => arr.map((o) => F.map((f) => o[f]));
const unpackGP = (rows) => rows.map((r) => Object.fromEntries(F.map((f, i) => [f, r[i]])));
const validGP = (a) => Array.isArray(a) && a.length > 0 && a[0] && a[0].NORAD_CAT_ID != null && a[0].MEAN_MOTION != null;

export function gpURL(group) { return `${CELESTRAK}?GROUP=${encodeURIComponent(group)}&FORMAT=json`; }

export async function loadGroup(key, offline) {
  const res = await cachedFetch("cl-earth-gp-" + key, gpURL(key), TTL_GP, validGP, packGP, offline);
  return { status: res.status, t: res.t, records: res.data ? unpackGP(res.data) : null };
}

export function satFromOMM(o, group) {
  let satrec;
  try { satrec = satellite.json2satrec(o); } catch (e) { return null; }
  if (!satrec || satrec.error) return null;
  const nRev = Number(o.MEAN_MOTION), e = Number(o.ECCENTRICITY);
  if (!(nRev > 0) || !(e >= 0 && e < 1)) return null;
  const n = nRev * 2 * Math.PI / 86400;                  // rad/s
  const a = Math.cbrt(MU / (n * n));                      // km, from Kepler's third law
  const cospar = o.OBJECT_ID || "";
  const yr = parseInt(cospar.slice(0, 4), 10);
  const epochStr = String(o.EPOCH);
  return {
    name: String(o.OBJECT_NAME || "UNKNOWN").trim(), id: Number(o.NORAD_CAT_ID), cospar, group,
    launchYear: yr > 1956 && yr < 2100 ? yr : null,
    epoch: Date.parse(epochStr.endsWith("Z") ? epochStr : epochStr + "Z"),
    satrec, illustrative: false,
    inc: Number(o.INCLINATION), ecc: e, a, periodMin: 1440 / nRev,
    apo: a * (1 + e) - RE, peri: a * (1 - e) - RE
  };
}

/* ------------------------------------------------------------------ Kepler + J2 model (offline) */
export function makeKep(el) {
  const { a, e, inc } = el;
  const n = Math.sqrt(MU / (a * a * a));
  const p = a * (1 - e * e);
  const k = 1.5 * J2 * (RE / p) * (RE / p) * n;
  const ci = Math.cos(inc);
  return Object.assign({}, el, {
    n,
    dRaan: el.lockRate ? 0 : -k * ci,                            // rad/s  (nodal regression)
    dArgp: el.lockRate ? 0 : 0.5 * k * (5 * ci * ci - 1),        // rad/s  (apsidal rotation)
    dM: el.lockRate || (n + 0.5 * k * Math.sqrt(1 - e * e) * (3 * ci * ci - 1))
  });
}

export function keplerPV(k, tMs) {
  const dt = (tMs - k.epochMs) / 1000;
  const M = k.M + k.dM * dt, W = k.raan + k.dRaan * dt, w = k.argp + k.dArgp * dt;
  const e = k.e;
  let E = M;
  for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const cE = Math.cos(E), sE = Math.sin(E), sq = Math.sqrt(1 - e * e);
  const r = k.a * (1 - e * cE);
  const x = k.a * (cE - e), y = k.a * sq * sE;
  const f = k.n * k.a * k.a / r;
  const vx = -f * sE, vy = f * sq * cE;
  const cW = Math.cos(W), sW = Math.sin(W), cw = Math.cos(w), sw = Math.sin(w), ci = Math.cos(k.inc), si = Math.sin(k.inc);
  const r11 = cW * cw - sW * sw * ci, r12 = -cW * sw - sW * cw * ci;
  const r21 = sW * cw + cW * sw * ci, r22 = -sW * sw + cW * cw * ci;
  const r31 = sw * si, r32 = cw * si;
  return {
    position: { x: r11 * x + r12 * y, y: r21 * x + r22 * y, z: r31 * x + r32 * y },
    velocity: { x: r11 * vx + r12 * vy, y: r21 * vx + r22 * vy, z: r31 * vx + r32 * vy }
  };
}

function kepSat(o) {
  const kep = makeKep(o.kep);
  const a = kep.a, e = kep.e;
  return {
    name: o.name, id: o.id, cospar: o.cospar || "", group: o.group, launchYear: o.cospar ? parseInt(o.cospar, 10) : null,
    epoch: kep.epochMs, kep, illustrative: true,
    inc: kep.inc / DEG, ecc: e, a, periodMin: 2 * Math.PI / kep.dM / 60,
    apo: a * (1 + e) - RE, peri: a * (1 - e) - RE
  };
}

/* Build every illustrative satellite from the fallback file. */
export function buildFallback(fb) {
  const epochMs = Date.parse(fb.epoch);
  const d0 = new Date(epochMs);
  const gmst0 = satellite.gstime(d0);
  const sunRA = satellite.sunPos(satellite.jday(d0)).rtasc;
  const out = [];
  let synth = 900000;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const elFromAlt = (s) => {
    if (s.alt != null) return { a: RE + s.alt, e: 0.0006 };
    const a = RE + (s.peri + s.apo) / 2;
    return { a, e: (s.apo - s.peri) / (2 * a) };
  };
  for (const s of fb.satellites) {
    const { a, e } = elFromAlt(s);
    const raan = s.ltan != null ? sunRA + (s.ltan - 12) * 15 * DEG : (s.raan || 0) * DEG;
    out.push(kepSat({ name: s.name, id: s.id, cospar: s.cospar, group: s.group,
      kep: { a, e, inc: s.inc * DEG, raan, argp: (s.argp || 0) * DEG, M: (s.M || 0) * DEG, epochMs } }));
  }
  const SIDEREAL = 2 * Math.PI / 86164.0905;          // rad/s, one sidereal day
  const geo = (name, id, group, lon) => kepSat({ name, id, group, cospar: "",
    kep: { a: 42164.17, e: 0.0002, inc: 0.05 * DEG, raan: 0, argp: 0, M: gmst0 + lon * DEG, epochMs, lockRate: SIDEREAL } });
  for (const g of fb.geo) out.push(geo(g.name, g.id, g.group, g.lon));
  for (const arc of fb.geoArcs) {
    for (let i = 0; i < arc.count; i++) {
      const lon = arc.from + (arc.to - arc.from) * (i + 0.5 * rnd()) / arc.count;
      out.push(geo("GEO SATELLITE " + (synth - 899999), synth++, "geo", lon));
    }
  }
  for (const sh of fb.shells) {
    const { a, e } = elFromAlt(sh);
    let k = 1;
    for (let p = 0; p < sh.planes; p++) {
      for (let q = 0; q < sh.perPlane; q++) {
        const raan = ((sh.raan || 0) + p * 360 / sh.planes) * DEG;
        let M = sh.train != null ? (sh.M0 || 0) - q * sh.train
          : q * 360 / sh.perPlane + p * (sh.phasing || 0) * 360 / (sh.planes * sh.perPlane) + (sh.M0 || 0);
        const name = sh.planeLetters ? `${sh.name} ${"ABCDEF"[p]}${q + 1}` : `${sh.name} #${k++}`;
        out.push(kepSat({ name, id: synth++, group: sh.group, cospar: "",
          kep: { a, e, inc: sh.inc * DEG, raan, argp: (sh.argp || 0) * DEG, M: M * DEG, epochMs } }));
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ propagation */
export function pvAt(sat, tMs, jd) {
  if (sat.satrec) {
    const m = (jd - sat.satrec.jdsatepoch) * 1440;
    let r = null;
    try { r = satellite.sgp4(sat.satrec, m); } catch (e) { r = null; }
    if (!r || !r.position || !isFinite(r.position.x)) return null;
    return r;
  }
  return keplerPV(sat.kep, tMs);
}
export const jdOf = (tMs) => tMs / 86400000 + 2440587.5;        // Julian date from Unix ms
export const gmstOf = (tMs) => satellite.gstime(new Date(tMs));

/* Sun direction, ECI (unit vector) and the full vector in AU for shadow tests. */
export function sunECI(tMs) {
  const s = satellite.sunPos(jdOf(tMs)).rsun;
  const r = Math.hypot(s.x, s.y, s.z);
  return { x: s.x / r, y: s.y / r, z: s.z / r, au: s };
}

export function geodetic(pos, gmst) {
  const g = satellite.eciToGeodetic(pos, gmst);
  return { lat: g.latitude / DEG, lon: ((g.longitude / DEG + 540) % 360) - 180, h: g.height };
}

/* Is the satellite in sunlight? shadowFraction: 0 = fully lit, 1 = umbra. */
export function sunlit(pos, sunAU) {
  try { return satellite.shadowFraction(sunAU, pos) < 0.5; } catch (e) { return true; }
}

/* ------------------------------------------------------------------ passes */
function look(sat, tMs, obsGd) {
  const pv = pvAt(sat, tMs, jdOf(tMs));
  if (!pv) return null;
  const gmst = gmstOf(tMs);
  const la = satellite.ecfToLookAngles(obsGd, satellite.eciToEcf(pv.position, gmst));
  return { az: la.azimuth / DEG, el: la.elevation / DEG, range: la.rangeSat, pos: pv.position, gmst };
}
function sunEl(tMs, obsGd, gmst) {
  const s = sunECI(tMs).au;
  const km = { x: s.x * AU_KM, y: s.y * AU_KM, z: s.z * AU_KM };
  return satellite.ecfToLookAngles(obsGd, satellite.eciToEcf(km, gmst)).elevation / DEG;
}

/**
 * Passes of `sat` over an observer (lat/lon in degrees, height km) in the next `hours`.
 * Rise and set are where elevation crosses 0°, refined by bisection to ~1 s;
 * culmination by golden-section search. A pass is "visible" when, at some
 * moment above 10°, the observer is in civil twilight or darker (Sun < −6°)
 * and the satellite is in sunlight.
 */
export function findPasses(sat, obs, startMs, hours = 72, maxPasses = 8, minMaxEl = 10) {
  const obsGd = { latitude: obs.lat * DEG, longitude: obs.lon * DEG, height: (obs.h || 0) };
  if (sat.periodMin > 600) {                               // geosynchronous-ish: fixed in the sky
    const l = look(sat, startMs, obsGd);
    return { fixed: true, el: l ? l.el : null, az: l ? l.az : null, passes: [] };
  }
  const step = sat.periodMin < 200 ? 45e3 : 180e3;
  const end = startMs + hours * 3600e3;
  const passes = [];
  const el = (t) => { const l = look(sat, t, obsGd); return l ? l.el : -90; };
  const bisect = (t0, t1, up) => {
    for (let i = 0; i < 18 && t1 - t0 > 800; i++) {
      const m = (t0 + t1) / 2;
      if ((el(m) > 0) === up) t1 = m; else t0 = m;
    }
    return (t0 + t1) / 2;
  };
  let tPrev = startMs, ePrev = el(startMs);
  let rise = ePrev > 0 ? startMs : null;
  for (let t = startMs + step; t <= end + step && passes.length < maxPasses; t += step) {
    const e = el(t);
    if (ePrev <= 0 && e > 0) rise = bisect(tPrev, t, true);
    if (ePrev > 0 && e <= 0 && rise != null) {
      const set = bisect(tPrev, t, false);
      // golden-section search for the culmination
      let a = rise, b = set;
      const g = 0.381966;
      let c = a + g * (b - a), d = b - g * (b - a), ec = el(c), ed = el(d);
      for (let i = 0; i < 26 && b - a > 1000; i++) {
        if (ec > ed) { b = d; d = c; ed = ec; c = a + g * (b - a); ec = el(c); }
        else { a = c; c = d; ec = ed; d = b - g * (b - a); ed = el(d); }
      }
      const tMax = (a + b) / 2;
      const lMax = look(sat, tMax, obsGd);
      if (lMax && lMax.el >= minMaxEl) {
        const lr = look(sat, rise, obsGd), ls = look(sat, set, obsGd);
        const track = [];
        let visible = false, darkAtMax = false, litAtMax = false, visStart = null, visEnd = null;
        const n = 28;
        for (let i = 0; i <= n; i++) {
          const ti = rise + (set - rise) * i / n;
          const li = look(sat, ti, obsGd);
          if (!li) continue;
          const sEl = sunEl(ti, obsGd, li.gmst);
          const lit = sunlit(li.pos, sunECI(ti).au);
          const vis = li.el >= 10 && sEl < -6 && lit;
          if (vis) { visible = true; if (visStart == null) visStart = ti; visEnd = ti; }
          track.push({ az: li.az, el: li.el, vis });
        }
        const sMax = sunEl(tMax, obsGd, lMax.gmst);
        darkAtMax = sMax < -6;
        litAtMax = sunlit(lMax.pos, sunECI(tMax).au);
        passes.push({
          rise, set, tMax, riseAz: lr ? lr.az : 0, setAz: ls ? ls.az : 0, maxEl: lMax.el, maxAz: lMax.az,
          range: lMax.range, sunElAtMax: sMax, dark: darkAtMax, sunlit: litAtMax, visible, visStart, visEnd, track
        });
      }
      rise = null;
    }
    tPrev = t; ePrev = e;
  }
  return { fixed: false, passes };
}

/* ------------------------------------------------------------------ feeds */
export const LL2_URL = "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=12&mode=normal";
export const SNAPI_URL = "https://api.spaceflightnewsapi.net/v4/articles/?limit=12";

function img(x) {
  if (!x) return "";
  if (typeof x === "string") return x;
  return x.thumbnail_url || x.image_url || "";
}
function shrinkLaunches(raw) {
  return (raw.results || []).map((l) => {
    const pad = l.pad || {}, loc = pad.location || {}, rk = (l.rocket && l.rocket.configuration) || {};
    const lsp = l.launch_service_provider || {}, m = l.mission || {}, st = l.status || {};
    return {
      id: l.id, name: l.name || "", net: l.net || l.window_start, ws: l.window_start, we: l.window_end,
      status: st.abbrev || "", statusName: st.name || "", provider: lsp.name || "", vehicle: rk.full_name || rk.name || "",
      pad: pad.name || "", location: loc.name || "", country: loc.country_code || (loc.country && loc.country.alpha_3_code) || "",
      lat: parseFloat(pad.latitude), lon: parseFloat(pad.longitude),
      image: img(l.image) || img(rk.image) || "",
      mission: m.name || "", orbit: (m.orbit && (m.orbit.abbrev || m.orbit.name)) || "", missionType: m.type || "",
      desc: m.description || "", webcast: !!l.webcast_live
    };
  });
}
export function loadLaunches(offline) {
  return cachedFetch("cl-earth-ll2", LL2_URL, TTL_FEED, (r) => r && Array.isArray(r.results), shrinkLaunches, offline);
}
function shrinkNews(raw) {
  return (raw.results || []).map((a) => ({ id: a.id, title: a.title || "", url: a.url || "", image: a.image_url || "",
    site: a.news_site || "", published: a.published_at || "", summary: (a.summary || "").slice(0, 240) }));
}
export function loadNews(offline) {
  return cachedFetch("cl-earth-snapi", SNAPI_URL, TTL_FEED, (r) => r && Array.isArray(r.results), shrinkNews, offline);
}
