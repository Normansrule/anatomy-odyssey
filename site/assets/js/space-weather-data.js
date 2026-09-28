/* Space Weather, live: data layer.
 *
 * Every feed comes straight from the NOAA Space Weather Prediction Center (SWPC)
 * public data service, services.swpc.noaa.gov (US Government work, public domain).
 * Formats as of Service Change Notice 26-21 (2026):
 *  - Real-Time Solar Wind (RTSW) moved to json/rtsw/rtsw_wind_1m.json and rtsw_mag_1m.json:
 *    arrays of objects { time_tag, active, source, proton_speed, proton_density, proton_temperature }
 *    and { time_tag, active, source, bt, bx_gsm, by_gsm, bz_gsm, … }, mixing several spacecraft
 *    (e.g. SOLAR1 = SWFO-L1, ACE, IMAP). Only rows with active = true are the operational source.
 *    Numbers can arrive as bare NaN tokens, which JSON.parse rejects, so we sanitise first.
 *  - noaa-planetary-k-index(-forecast).json became arrays of objects on 31 March 2026; the old
 *    header-row format is still accepted here.
 * Each feed is cached in localStorage (try/catch) and falls back to the last good copy.
 */

const SWPC = "https://services.swpc.noaa.gov/";
export const FEEDS = {
  wind:   { url: SWPC + "json/rtsw/rtsw_wind_1m.json", ttl: 5 * 60000, label: "Solar wind plasma (RTSW, 1-minute)" },
  mag:    { url: SWPC + "json/rtsw/rtsw_mag_1m.json", ttl: 5 * 60000, label: "Interplanetary magnetic field (RTSW, 1-minute)" },
  kp:     { url: SWPC + "products/noaa-planetary-k-index.json", ttl: 15 * 60000, label: "Planetary K-index" },
  kpf:    { url: SWPC + "products/noaa-planetary-k-index-forecast.json", ttl: 15 * 60000, label: "Planetary K-index forecast" },
  scales: { url: SWPC + "products/noaa-scales.json", ttl: 10 * 60000, label: "NOAA space weather scales" },
  xray:   { url: SWPC + "json/goes/primary/xrays-7-day.json", ttl: 10 * 60000, label: "GOES X-ray flux (7 days)" },
  aurora: { url: SWPC + "json/ovation_aurora_latest.json", ttl: 10 * 60000, label: "OVATION aurora forecast" },
  alerts: { url: SWPC + "products/alerts.json", ttl: 10 * 60000, label: "Alerts, watches and warnings" }
};
const LS = "cl-sw-";
const HIST_KEY = LS + "hist-v1";
const HIST_BIN = 5 * 60000;           // rolling solar-wind history kept in 5-minute bins …
const HIST_SPAN = 7 * 86400000;       // … for up to 7 days

export function lsGet(k) { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
export function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

/* ------------------------------------------------------------------ parsing helpers */
export function sanitize(txt) {
  // bare NaN / Infinity tokens are not JSON: turn them into null (only outside strings, i.e. after : , or [)
  return txt.replace(/([:\[,]\s*)-?(?:NaN|Infinity)(?=\s*[,\]}])/g, "$1null");
}
export function parseTime(s) {
  if (typeof s === "number") return s;
  if (!s) return NaN;
  let x = String(s).trim().replace(" ", "T");
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(x)) x += "Z";
  return Date.parse(x);
}
const num = (x) => (x === null || x === undefined || x === "" ? NaN : +x);
/** Arrays of arrays with a header row (legacy SWPC products) or arrays of objects → objects. */
export function rowsOf(raw) {
  if (!Array.isArray(raw) || !raw.length) return [];
  if (Array.isArray(raw[0])) {
    const h = raw[0].map((k) => String(k));
    return raw.slice(1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]])));
  }
  return raw.filter((r) => r && typeof r === "object");
}
const pick = (o, ...keys) => { for (const k of keys) if (o[k] !== undefined) return o[k]; return undefined; };
const isActive = (r) => r.active === undefined || r.active === true || r.active === "true" || r.active === 1;

async function fetchText(url, ms = 20000) {
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = setTimeout(() => ctl && ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl ? ctl.signal : undefined, cache: "no-cache" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.text();
  } finally { clearTimeout(timer); }
}

/* ------------------------------------------------------------------ normalisers (raw SWPC → compact) */
export const NORM = {
  wind(raw) {
    const rows = rowsOf(raw).filter(isActive).map((r) => [
      parseTime(r.time_tag), num(pick(r, "proton_speed", "speed")), num(pick(r, "proton_density", "density")),
      num(pick(r, "proton_temperature", "temperature")), String(r.source || "")
    ]).filter((r) => isFinite(r[0]) && (isFinite(r[1]) || isFinite(r[2])));
    rows.sort((a, b) => a[0] - b[0]);
    return rows;
  },
  mag(raw) {
    const rows = rowsOf(raw).filter(isActive).map((r) => [
      parseTime(r.time_tag), num(pick(r, "bz_gsm", "bz")), num(pick(r, "by_gsm", "by")), num(pick(r, "bt")), String(r.source || "")
    ]).filter((r) => isFinite(r[0]) && isFinite(r[1]));
    rows.sort((a, b) => a[0] - b[0]);
    return rows;
  },
  kp(raw) {
    return rowsOf(raw).map((r) => [parseTime(r.time_tag), num(pick(r, "Kp", "kp", "kp_index"))])
      .filter((r) => isFinite(r[0]) && isFinite(r[1])).sort((a, b) => a[0] - b[0]);
  },
  kpf(raw) {
    return rowsOf(raw).map((r) => [parseTime(r.time_tag), num(pick(r, "kp", "Kp")), String(pick(r, "observed", "status") || "")])
      .filter((r) => isFinite(r[0]) && isFinite(r[1])).sort((a, b) => a[0] - b[0]);
  },
  scales(raw) {
    if (!raw || typeof raw !== "object" || !raw["0"]) throw new Error("scales");
    const one = (o) => o && {
      date: parseTime((o.DateStamp || "") + " " + (o.TimeStamp || "00:00:00")),
      R: o.R ? { s: num(o.R.Scale), minor: num(o.R.MinorProb), major: num(o.R.MajorProb) } : null,
      S: o.S ? { s: num(o.S.Scale), p: num(o.S.Prob) } : null,
      G: o.G ? { s: num(o.G.Scale) } : null
    };
    return { cur: one(raw["0"]), max24: one(raw["-1"]), fc: [one(raw["1"]), one(raw["2"]), one(raw["3"])].filter(Boolean) };
  },
  xray(raw) {
    const rows = rowsOf(raw).filter((r) => String(r.energy || "").startsWith("0.1-0.8"))
      .map((r) => [parseTime(r.time_tag), num(r.flux)]).filter((r) => isFinite(r[0]) && r[1] > 0);
    rows.sort((a, b) => a[0] - b[0]);
    // 10-minute maxima keep every flare peak while shrinking ~10,000 points to ~1,000
    const out = [];
    for (const [t, f] of rows) {
      const b = Math.floor(t / 600000) * 600000;
      const last = out[out.length - 1];
      if (last && last[0] === b) { if (f > last[1]) last[1] = f; } else out.push([b, f]);
    }
    if (rows.length) out.push([rows[rows.length - 1][0], rows[rows.length - 1][1], 1]);   // latest raw sample, flagged
    return out;
  },
  aurora(raw) {
    const co = raw && raw.coordinates;
    if (!Array.isArray(co) || co.length < 1000) throw new Error("ovation");
    const g = new Uint8Array(360 * 181);
    for (const c of co) {
      let lon = Math.round(+c[0]) % 360; if (lon < 0) lon += 360;
      const lat = Math.round(+c[1]);
      if (lat < -90 || lat > 90) continue;
      g[(lat + 90) * 360 + lon] = Math.max(0, Math.min(100, +c[2] || 0));
    }
    return { obs: parseTime(raw["Observation Time"]), fc: parseTime(raw["Forecast Time"]), grid: b64(g) };
  },
  alerts(raw) {
    return rowsOf(raw).map((r) => ({ t: parseTime(r.issue_datetime), code: String(r.product_id || ""), msg: String(r.message || "") }))
      .filter((a) => isFinite(a.t)).sort((a, b) => b.t - a.t).slice(0, 40);
  }
};
function b64(u8) { let s = ""; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); }
export function unb64(s) { const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }

/* ------------------------------------------------------------------ cache-first loading */
export async function loadFeed(key, { offline = false, force = false } = {}) {
  const f = FEEDS[key];
  const c = lsGet(LS + key);
  const now = Date.now();
  if (!force && c && now - c.t < f.ttl) return { status: "cached", data: c.d, t: c.t };
  if (!offline) {
    try {
      const d = NORM[key](JSON.parse(sanitize(await fetchText(f.url))));
      if (Array.isArray(d) && !d.length) throw new Error("empty");
      lsSet(LS + key, { t: now, d });
      return { status: "live", data: d, t: now };
    } catch (e) { /* network, CORS, format change or parse failure → last good copy, then the sample */ }
  }
  if (c) return { status: "stale", data: c.d, t: c.t };
  return { status: "failed", data: null, t: 0 };
}

/* ------------------------------------------------------------------ rolling solar-wind history
 * The RTSW 1-minute files hold roughly the last day. To draw up to seven days, this browser keeps
 * what it has seen in 5-minute bins: [t, speed, density, temperature, bz, bt, by]. */
export function mergeHistory(wind, mag, persist = true) {
  const h = persist ? (lsGet(HIST_KEY) || []).filter((r) => Array.isArray(r) && r.length >= 6) : [];
  const bins = new Map(h.map((r) => [r[0], r.slice()]));
  const acc = new Map();
  const add = (t, i, v) => {
    if (!isFinite(v)) return;
    const b = Math.floor(t / HIST_BIN) * HIST_BIN;
    let a = acc.get(b); if (!a) { a = [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]]; acc.set(b, a); }
    a[i][0] += v; a[i][1]++;
  };
  for (const r of wind || []) { add(r[0], 0, r[1]); add(r[0], 1, r[2]); add(r[0], 2, r[3]); }
  for (const r of mag || []) { add(r[0], 3, r[1]); add(r[0], 4, r[3]); add(r[0], 5, r[2]); }
  for (const [b, a] of acc) {
    const row = [b, ...a.map(([s, n]) => (n ? +(s / n).toPrecision(4) : null))];
    const old = bins.get(b);
    if (old) for (let i = 1; i < row.length; i++) if (row[i] === null) row[i] = old[i] === undefined ? null : old[i];
    bins.set(b, row);
  }
  const newest = Math.max(0, ...bins.keys());
  const out = [...bins.values()].filter((r) => r[0] > newest - HIST_SPAN).sort((a, b) => a[0] - b[0]);
  if (persist) lsSet(HIST_KEY, out);
  return out;
}

/** The latest valid 1-minute values (median of the last 5 valid samples to reject spikes). */
export function latest(rows, idx, within = 30 * 60000) {
  const v = [];
  let tLast = NaN;
  for (let i = rows.length - 1; i >= 0 && v.length < 5; i--) {
    const x = rows[i][idx];
    if (!isFinite(x)) continue;
    if (!isFinite(tLast)) tLast = rows[i][0];
    if (tLast - rows[i][0] > within) break;
    v.push(x);
  }
  if (!v.length) return { v: NaN, t: NaN };
  v.sort((a, b) => a - b);
  return { v: v[v.length >> 1], t: tLast };
}

/** Fallback sample (site/data/space-weather-fallback.json) → same compact shapes as NORM. */
export function sampleToFeeds(s) {
  const t0 = Date.parse(s.meta.start);
  const step = s.meta.stepMin * 60000;
  const at = (i) => t0 + i * step;
  const wind = s.wind.map((r, i) => [at(i), r[0], r[1], r[2], s.meta.source]);
  const mag = s.mag.map((r, i) => [at(i), r[0], r[2], r[1], s.meta.source]);
  const xray = s.xray.map((f, i) => [at(i), f]);
  const k0 = Date.parse(s.meta.kpStart);
  const kp = s.kp.map((k, i) => [k0 + i * 3 * 3600000, k]);
  const kpf = s.kpForecast.map((k, i) => [k0 + (s.kp.length + i) * 3 * 3600000, k, "predicted"]);
  const alerts = s.alerts.map((a) => ({ t: Date.parse(a.t), code: a.code, msg: a.msg }));
  return { wind, mag, xray, kp, kpf, scales: { cur: s.scales.cur, max24: s.scales.max24, fc: s.scales.fc }, alerts, now: Date.parse(s.meta.now) };
}
