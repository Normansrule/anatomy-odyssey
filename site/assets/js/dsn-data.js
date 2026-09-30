/* Deep Space Network, live: data layer (pure ES module, runs in the browser and in Node).
 *
 * FEED: NASA's "DSN Now" (Eyes on the Solar System team, JPL). Two XML files:
 *   dsn.xml     live state, regenerated about every 5 seconds
 *               https://eyes.nasa.gov/apps/dsn-now/dsn.xml   (current app path)
 *               https://eyes.nasa.gov/dsn/data/dsn.xml        (older path, used by pydsn and others)
 *   config.xml  sites, dishes and spacecraft display names
 *               https://eyes.nasa.gov/apps/dsn-now/config.xml, https://eyes.nasa.gov/dsn/config.xml
 * Schema as parsed by open-source readers (russss/pydsn, spacehackers/api.spaceprob.es) and here:
 *
 *   <dsn>
 *     <station name="gdscc" friendlyName="Goldstone" timeUTC="1790000000000" timeZoneOffset="-25200000"/>
 *     <dish name="DSS24" azimuthAngle="136.2" elevationAngle="41.7" windSpeed="9.3"
 *           isMSPA="false" isArray="false" isDDOR="false" activity="Spacecraft Telemetry, Tracking, and Command"
 *           created="…" updated="…">
 *       <upSignal   active="true" signalType="data" dataRate="2000" frequency="7.18e9" power="4.6"   band="X" spacecraft="MRO" spacecraftID="-74"/>
 *       <downSignal active="true" signalType="data" dataRate="1.4e6" frequency="8.44e9" power="-121.3" band="X" spacecraft="MRO" spacecraftID="-74"/>
 *       <target name="MRO" id="74" uplegRange="3.1e8" downlegRange="3.1e8" rtlt="2069.2"/>
 *     </dish>
 *     … every <dish> follows the <station> it belongs to (a flat list, not nested) …
 *     <timestamp>1790000000000</timestamp>
 *   </dsn>
 *
 * Units: dataRate bit/s · frequency Hz (older snapshots used MHz; values below 1e5 are treated as MHz)
 *        upSignal power kW (transmitter) · downSignal power dBm (received) · ranges km · rtlt s (round trip)
 *        azimuth/elevation degrees · windSpeed km/h. "-1", "" or "none" mean "no value".
 *
 * No DOMParser: a tiny tolerant tokenizer keeps this module usable from Node tests.
 */
import * as E from "./ephemeris.js";

export const C_KM_S = 299792.458;                 // speed of light, exact (SI)
export const AU_KM = 149597870.7;                 // IAU 2012
const D2R = Math.PI / 180, R2D = 180 / Math.PI;

export const FEED_URLS = [
  "https://eyes.nasa.gov/apps/dsn-now/dsn.xml",
  "https://eyes.nasa.gov/dsn/data/dsn.xml"
];
export const CONFIG_URLS = [
  "https://eyes.nasa.gov/apps/dsn-now/config.xml",
  "https://eyes.nasa.gov/dsn/config.xml"
];

/* ================================================================== XML */
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
export function decode(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return isFinite(n) ? String.fromCodePoint(n) : m; }
    return ENT[e.toLowerCase()] ?? m;
  });
}
/** Parse XML text into a light tree { tag, attr, children, text }. Tolerant of prologs, comments and CDATA. */
export function parseXML(txt) {
  const src = String(txt).replace(/<!--[\s\S]*?-->/g, "").replace(/<\?[\s\S]*?\?>/g, "").replace(/<!DOCTYPE[^>]*>/gi, "");
  const root = { tag: "#root", attr: {}, children: [], text: "" };
  const stack = [root];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(src))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) { top.text += m[1]; continue; }
    if (m[6] !== undefined) { top.text += decode(m[6]); continue; }
    const [, , close, tag, attrs, self] = m;
    if (close) {
      // pop to the matching tag (tolerate unclosed children)
      for (let i = stack.length - 1; i > 0; i--) if (stack[i].tag === tag) { stack.length = i; break; }
      continue;
    }
    const node = { tag, attr: {}, children: [], text: "" };
    const ar = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let a;
    while ((a = ar.exec(attrs || ""))) node.attr[a[1]] = decode(a[2] ?? a[3] ?? a[4] ?? "");
    top.children.push(node);
    if (!self) stack.push(node);
  }
  return root;
}

/* ================================================================== values */
/** Number or null: "-1", "", "none", NaN and negative sentinels for non-negative quantities → null. */
export function num(v, { allowNeg = false } = {}) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s || /^(none|null|nan|n\/a|-)$/i.test(s)) return null;
  const x = +s;
  if (!isFinite(x)) return null;
  if (!allowNeg && x < 0) return null;
  return x;
}
const bool = (v) => v === true || /^(true|1|yes)$/i.test(String(v || ""));
/** Frequency in Hz. The feed gives Hz today; very old snapshots gave MHz. */
export function freqHz(v) {
  const x = num(v);
  if (x === null || x === 0) return null;
  return x < 1e5 ? Math.round(x * 1e6) : x;
}
/** Band from the attribute, or from the frequency when the attribute is missing. */
export function bandOf(band, hz) {
  const b = String(band || "").trim().toUpperCase();
  if (b && b !== "NONE") return b === "KA" ? "Ka" : b;
  if (!hz) return null;
  const g = hz / 1e9;
  if (g >= 1.5 && g < 4) return "S";
  if (g >= 7 && g < 9) return "X";
  if (g >= 20 && g < 40) return "Ka";
  return null;
}
/** Ticket-style names "DSS43" → "DSS-43". */
export const dssLabel = (n) => String(n || "").replace(/^DSS\s*-?\s*(\d+)$/i, "DSS-$1");
export const dssNumber = (n) => { const m = String(n || "").match(/(\d+)/); return m ? +m[1] : NaN; };

/* ================================================================== DSN Now → snapshot */
function signal(el, dir) {
  const a = el.attr;
  const hz = freqHz(a.frequency);
  return {
    dir,                                              // "up" | "down"
    active: bool(a.active),
    type: String(a.signalType || "").toLowerCase() || null,   // data | carrier | none
    rate: num(a.dataRate),                            // bit/s
    hz,
    band: bandOf(a.band, hz),
    power: dir === "up" ? num(a.power) : num(a.power, { allowNeg: true }),   // kW up · dBm down
    sc: String(a.spacecraft || "").trim().toUpperCase() || null,
    scId: num(a.spacecraftID ?? a.spacecraftId, { allowNeg: true })
  };
}
/** Parse dsn.xml text into { t, stations[], dishes[] }. Throws if it is not a DSN Now document. */
export function parseDSN(txt) {
  const root = parseXML(txt);
  const dsn = root.children.find((n) => n.tag.toLowerCase() === "dsn");
  if (!dsn) throw new Error("not a DSN Now document");
  const stations = [], dishes = [];
  let station = null, t = NaN;
  const takeDish = (d, st) => {
    const a = d.attr;
    const dish = {
      name: String(a.name || "").toUpperCase(),
      station: st ? st.id : null,
      az: num(a.azimuthAngle, { allowNeg: true }),
      el: num(a.elevationAngle, { allowNeg: true }),
      wind: num(a.windSpeed),
      activity: String(a.activity || "").trim(),
      mspa: bool(a.isMSPA), array: bool(a.isArray), ddor: bool(a.isDDOR),
      created: a.created || null, updated: a.updated || null,
      up: [], down: [], targets: []
    };
    // −1 az/el is the "unknown" sentinel; elevations below −5° are not physical for a tracking dish
    if (String(a.azimuthAngle).trim() === "-1" && String(a.elevationAngle).trim() === "-1") dish.az = dish.el = null;
    if (dish.az !== null && (dish.az < 0 || dish.az > 360)) dish.az = null;
    if (dish.el !== null && (dish.el < -5 || dish.el > 90.5)) dish.el = null;
    for (const c of d.children) {
      const tg = c.tag.toLowerCase();
      if (tg === "upsignal") dish.up.push(signal(c, "up"));
      else if (tg === "downsignal") dish.down.push(signal(c, "down"));
      else if (tg === "target") {
        const name = String(c.attr.name || "").trim().toUpperCase();
        if (!name) continue;
        dish.targets.push({
          name, id: num(c.attr.id, { allowNeg: true }),
          upRange: num(c.attr.uplegRange), downRange: num(c.attr.downlegRange), rtlt: num(c.attr.rtlt)
        });
      }
    }
    if (dish.name) dishes.push(dish);
  };
  for (const n of dsn.children) {
    const tg = n.tag.toLowerCase();
    if (tg === "station") {
      station = {
        id: String(n.attr.name || "").toLowerCase(), name: n.attr.friendlyName || n.attr.name || "",
        timeUTC: num(n.attr.timeUTC), tzOffset: num(n.attr.timeZoneOffset, { allowNeg: true })
      };
      stations.push(station);
      for (const c of n.children) if (c.tag.toLowerCase() === "dish") takeDish(c, station);    // tolerate nesting
    } else if (tg === "dish") takeDish(n, station);
    else if (tg === "timestamp") t = num(n.text.trim());
  }
  if (!isFinite(t)) t = Math.max(0, ...stations.map((s) => s.timeUTC || 0)) || NaN;
  return { t, stations, dishes };
}

/** Parse config.xml into { sites: {id:{name,lat,lon,dishes:{DSS14:{type,friendly}}}}, spacecraft: {CODE: name} }. */
export function parseConfig(txt) {
  const root = parseXML(txt);
  const cfg = { sites: {}, spacecraft: {} };
  const walk = (n) => {
    for (const c of n.children) {
      const tg = c.tag.toLowerCase();
      if (tg === "site") {
        const s = { name: c.attr.friendlyName || c.attr.name, lat: num(c.attr.latitude, { allowNeg: true }), lon: num(c.attr.longitude, { allowNeg: true }), dishes: {} };
        for (const d of c.children) if (d.tag.toLowerCase() === "dish") s.dishes[String(d.attr.name).toUpperCase()] = { type: d.attr.type || "", friendly: d.attr.friendlyName || "" };
        cfg.sites[String(c.attr.name || "").toLowerCase()] = s;
      } else if (tg === "spacecraft") {
        const code = String(c.attr.name || "").toUpperCase();
        if (code) cfg.spacecraft[code] = c.attr.friendlyName || c.attr.explorerName || code;
      }
      if (c.children.length) walk(c);
    }
  };
  walk(root);
  return cfg;
}

/** Codes the feed uses for tests, calibration and maintenance rather than a spacecraft. */
export const NON_SPACECRAFT = new Set(["DSN", "TEST", "DSS", "RFC", "SPB", "GBRA", "NONE"]);

/** One entry per (dish, target): what the dish is doing with that spacecraft right now. */
export function links(snap) {
  const out = [];
  for (const d of snap.dishes) {
    const names = new Set(d.targets.map((t) => t.name));
    for (const s of [...d.up, ...d.down]) if (s.sc && s.active) names.add(s.sc);
    for (const code of names) {
      const tg = d.targets.find((t) => t.name === code) || { name: code, id: null, upRange: null, downRange: null, rtlt: null };
      const up = d.up.filter((s) => s.sc === code || (!s.sc && d.targets.length === 1));
      const down = d.down.filter((s) => s.sc === code || (!s.sc && d.targets.length === 1));
      const upOn = up.filter((s) => s.active), downOn = down.filter((s) => s.active);
      out.push({
        dish: d.name, station: d.station, code, target: tg,
        up: upOn, down: downOn,
        talking: upOn.length > 0 || downOn.length > 0,
        range: tg.downRange ?? tg.upRange,
        rtlt: tg.rtlt ?? (tg.downRange && tg.upRange ? (tg.downRange + tg.upRange) / C_KM_S : null),
        bands: [...new Set([...upOn, ...downOn].map((s) => s.band).filter(Boolean))],
        test: NON_SPACECRAFT.has(code)
      });
    }
  }
  return out;
}

/* ================================================================== formatting */
const SUP = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
export const sup = (n) => String(n).replace(/[-0-9]/g, (c) => SUP[c]);
const sig = (x, n = 3) => {
  if (!isFinite(x)) return "—";
  const s = (+x.toPrecision(n)).toString();
  return (+s >= 1000 ? (+s).toLocaleString("en-US") : s);
};
const MINUS = "−";
const neg = (s) => s.replace(/^-/, MINUS);

/** Data rate in bits per second, e.g. 160 → "160 bit/s", 2031 → "2.03 kbit/s", 6e6 → "6 Mbit/s". */
export function fmtRate(bps) {
  if (bps === null || bps === undefined || !isFinite(bps) || bps <= 0) return "—";
  const U = [["Gbit/s", 1e9], ["Mbit/s", 1e6], ["kbit/s", 1e3]];
  for (const [u, k] of U) if (bps >= k * 0.9995) return sig(bps / k) + " " + u;
  return sig(bps) + " bit/s";
}
/** Frequency, e.g. 8.420432e9 → "8.420 GHz", 2.1147e9 → "2.115 GHz". */
export function fmtFreq(hz) {
  if (!hz || !isFinite(hz)) return "—";
  if (hz >= 1e9) return (hz / 1e9).toFixed(3) + " GHz";
  if (hz >= 1e6) return (hz / 1e6).toFixed(1) + " MHz";
  return sig(hz) + " Hz";
}
/** Transmitter power in kilowatts (uplink). */
export function fmtKW(kw) {
  if (kw === null || kw === undefined || !isFinite(kw) || kw <= 0) return "—";
  if (kw < 1) return sig(kw * 1000, 3) + " W";
  return (kw >= 100 ? kw.toFixed(0) : kw.toFixed(kw >= 10 ? 1 : 2)) + " kW";
}
/** Received power in dBm (downlink), e.g. −155.8 dBm. */
export function fmtDBm(dbm) {
  if (dbm === null || dbm === undefined || !isFinite(dbm) || dbm > 60 || dbm < -400) return "—";
  return neg(dbm.toFixed(1)) + " dBm";
}
/** dBm → watts, formatted like "2.6 × 10⁻¹⁹ W". */
export function dbmToW(dbm) { return Math.pow(10, (dbm - 30) / 10); }
export function fmtSci(x, unit = "", d = 1) {
  if (!isFinite(x) || x === 0) return "—";
  const e = Math.floor(Math.log10(Math.abs(x)));
  const m = x / Math.pow(10, e);
  return m.toFixed(d) + " × 10" + sup(e) + (unit ? " " + unit : "");
}
/** Distance in km with words, e.g. 2.49e10 → "24.9 billion km". */
export function fmtRange(km) {
  if (km === null || km === undefined || !isFinite(km) || km <= 0) return "—";
  if (km < 1e6) return Math.round(km).toLocaleString("en-US") + " km";
  if (km < 1e9) return sig(km / 1e6) + " million km";
  if (km < 1e12) return sig(km / 1e9) + " billion km";
  return sig(km / 1e12) + " trillion km";
}
export function fmtAU(km) {
  if (!km || !isFinite(km)) return "—";
  const au = km / AU_KM;
  return (au < 0.1 ? au.toFixed(4) : au < 10 ? au.toFixed(2) : au.toFixed(1)) + " AU";
}
/** A duration in seconds as words: "1.3 s", "12 min 36 s", "17 h 4 min", "1 day 23 h". */
export function fmtDuration(s, { precise = false } = {}) {
  if (s === null || s === undefined || !isFinite(s) || s < 0) return "—";
  if (s < 10) return (s < 0.995 ? s.toFixed(2) : s.toFixed(1)) + " s";
  if (s < 60) return Math.round(s) + " s";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  if (s < 3600) return m + " min" + (sec || precise ? " " + sec + " s" : "");
  if (s < 86400) return h + " h " + m + " min" + (precise ? " " + sec + " s" : "");
  return d + (d === 1 ? " day " : " days ") + h + " h" + (precise || d < 3 ? " " + m + " min" : "");
}
/** "light travels this in 17 h 4 min" for a one-way distance in km. */
export function lightPhrase(km) {
  if (!km || !isFinite(km)) return "";
  return "light travels this in " + fmtDuration(km / C_KM_S);
}
export const oneWay = (km) => (km && isFinite(km) ? km / C_KM_S : null);

/* ================================================================== geometry */
export const jd = (ms) => ms / 86400000 + 2440587.5;
/** Greenwich Mean Sidereal Time in degrees (IAU 1982 linear term; plenty for pointing a picture). */
export function gmstDeg(ms) {
  const d = jd(ms) - 2451545.0;
  return (((280.46061837 + 360.98564736629 * d) % 360) + 360) % 360;
}
/** Low-precision solar RA/Dec (deg), Astronomical Almanac. */
export function sunRaDec(ms) {
  const n = jd(ms) - 2451545.0;
  const L = (280.460 + 0.9856474 * n) * D2R, g = (357.528 + 0.9856003 * n) * D2R;
  const lam = L + (1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * D2R;
  const eps = (23.439 - 4e-7 * n) * D2R;
  return { ra: norm360(Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)) * R2D), dec: Math.asin(Math.sin(eps) * Math.sin(lam)) * R2D };
}
export const norm360 = (x) => ((x % 360) + 360) % 360;
export const wrap180 = (x) => ((((x + 180) % 360) + 360) % 360) - 180;

/** Local horizontal (azimuth from north through east, elevation) → equatorial RA/Dec (deg). */
export function azElToRaDec(az, el, lat, lon, ms) {
  const A = az * D2R, h = el * D2R, p = lat * D2R;
  const sd = Math.sin(p) * Math.sin(h) + Math.cos(p) * Math.cos(h) * Math.cos(A);
  const dec = Math.asin(Math.max(-1, Math.min(1, sd)));
  const H = Math.atan2(-Math.sin(A) * Math.cos(h), Math.cos(p) * Math.sin(h) - Math.sin(p) * Math.cos(h) * Math.cos(A));
  const lst = gmstDeg(ms) + lon;
  return { ra: norm360(lst - H * R2D), dec: dec * R2D, ha: wrap180(H * R2D) };
}
/** Equatorial RA/Dec (deg) → local azimuth/elevation (deg) at a site and time. */
export function raDecToAzEl(ra, dec, lat, lon, ms) {
  const H = (gmstDeg(ms) + lon - ra) * D2R, d = dec * D2R, p = lat * D2R;
  const sh = Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(H);
  const el = Math.asin(Math.max(-1, Math.min(1, sh)));
  const az = Math.atan2(-Math.cos(d) * Math.sin(H), Math.sin(d) * Math.cos(p) - Math.cos(d) * Math.sin(p) * Math.cos(H));
  return { az: norm360(az * R2D), el: el * R2D };
}
/** The point on Earth with the object at its zenith (a very distant object): lat = dec, lon = RA − GMST. */
export function subPoint(ra, dec, ms) { return { lat: dec, lon: wrap180(ra - gmstDeg(ms)) }; }
/** Great-circle angle (deg) between two lat/lon points. */
export function angDist(la1, lo1, la2, lo2) {
  const a = la1 * D2R, b = la2 * D2R, dl = (lo2 - lo1) * D2R;
  return Math.acos(Math.max(-1, Math.min(1, Math.sin(a) * Math.sin(b) + Math.cos(a) * Math.cos(b) * Math.cos(dl)))) * R2D;
}
/** Can a site at (lat, lon) see a far object over (sLat, sLon) above `mask` degrees elevation? */
export const canSee = (lat, lon, sLat, sLon, mask = 10) => angDist(lat, lon, sLat, sLon) <= 90 - mask;
/** Half-width in hour angle (deg) of a site's view of the sky at declination dec, above `mask`. */
export function hourAngleLimit(lat, dec, mask = 10) {
  const c = (Math.sin(mask * D2R) - Math.sin(lat * D2R) * Math.sin(dec * D2R)) / (Math.cos(lat * D2R) * Math.cos(dec * D2R));
  if (c <= -1) return 180;          // circumpolar: always above the mask
  if (c >= 1) return 0;             // never rises above the mask
  return Math.acos(c) * R2D;
}
/** Highest elevation (deg) an object at declination dec ever reaches from latitude lat. */
export const maxElevation = (lat, dec) => 90 - Math.abs(lat - dec);

/** Equatorial unit vector (x → March equinox, z → north celestial pole). */
export function raDecVec(ra, dec) {
  const a = ra * D2R, d = dec * D2R;
  return { x: Math.cos(d) * Math.cos(a), y: Math.cos(d) * Math.sin(a), z: Math.sin(d) };
}
function eclToEq(v) {
  const e = E.OBLIQUITY_J2000 * D2R;
  return { x: v.x, y: v.y * Math.cos(e) - v.z * Math.sin(e), z: v.y * Math.sin(e) + v.z * Math.cos(e) };
}
function vecRaDec(v) {
  const r = Math.hypot(v.x, v.y, v.z);
  return { ra: norm360(Math.atan2(v.y, v.x) * R2D), dec: Math.asin(v.z / r) * R2D, r };
}

/** Where a spacecraft roughly is in the sky, from its "sky" hint in data/dsn.json.
 *  { body: "mars" } planet or "moon" (ephemeris.js) · { sun: 0 } sunward (L1) · { sun: 180 } anti-sunward (L2)
 *  · { ra, dec } a fixed direction (the Voyagers, New Horizons, cruising probes: approximate).
 *  Returns { ra, dec, km|null }. Used only when the feed has no pointing, and to build the sample. */
export function approxRaDec(sky, ms) {
  if (!sky) return null;
  const J = jd(ms);
  if (sky.body === "moon") {
    const m = vecRaDec(eclToEq(E.moonGeocentric(J)));
    return { ra: m.ra, dec: m.dec, km: m.r * AU_KM };
  }
  if (sky.body) {
    const v = E.sub(E.heliocentric(sky.body, J), E.earthPosition(J));
    const q = vecRaDec(eclToEq(v));
    return { ra: q.ra, dec: q.dec, km: q.r * AU_KM };
  }
  if (sky.sun !== undefined) {
    const s = sunRaDec(ms);
    return sky.sun >= 90 ? { ra: norm360(s.ra + 180), dec: -s.dec, km: sky.km || null } : { ra: s.ra, dec: s.dec, km: sky.km || null };
  }
  if (isFinite(sky.ra) && isFinite(sky.dec)) return { ra: sky.ra, dec: sky.dec, km: null };
  return null;
}

/* ================================================================== Voyager 1 */
/* The site's reference model (same as home.js and scale.js): 173.14 AU from the Sun (one light-day)
 * on 2026-11-18 per EarthSky, 26 June 2026 and NASA "Where are Voyager 1 and Voyager 2 now?";
 * outward speed about 16.9 km/s (3.57 AU/yr, NASA/JPL Voyager mission status).
 * Direction: RA 17 h 13 m, Dec +12.0° (NASA/JPL; drifts by well under 0.1° per year).
 * 173.14 AU is one light-day, the distance from EARTH on the reference date; the heliocentric distance
 * that matches it is solved once, then grows at 16.9 km/s. Earth's own motion around the Sun
 * (ephemeris.js) then swings the Earth distance by up to ±1 AU over a year. */
export const VOY1 = { refMs: Date.UTC(2026, 10, 18, 12), refAU: 173.14, kms: 16.9, ra: 258.3, dec: 12.0 };
let voyRefHelioAU = null;
export function voyager1(ms) {
  const u = raDecVec(VOY1.ra, VOY1.dec);
  if (voyRefHelioAU === null) {
    const e = eclToEq(E.earthPosition(jd(VOY1.refMs)));
    const b = u.x * e.x + u.y * e.y + u.z * e.z, ee = e.x * e.x + e.y * e.y + e.z * e.z;
    voyRefHelioAU = b + Math.sqrt(b * b - ee + VOY1.refAU * VOY1.refAU);      // |r u − E| = refAU
  }
  const helioKm = voyRefHelioAU * AU_KM + VOY1.kms * (ms - VOY1.refMs) / 1000;
  const eE = eclToEq(E.earthPosition(jd(ms)));                      // Earth, heliocentric equatorial, AU
  const v = { x: u.x * helioKm / AU_KM - eE.x, y: u.y * helioKm / AU_KM - eE.y, z: u.z * helioKm / AU_KM - eE.z };
  const km = Math.hypot(v.x, v.y, v.z) * AU_KM;
  return { helioKm, km, owlt: km / C_KM_S, rtlt: 2 * km / C_KM_S };
}

/* ================================================================== link budget (the atlas's equations) */
/* equations.html#friis and #dsn-data-rate:  P_r = P_t G_t G_r (λ / 4πd)²,  G = η (πD/λ)²,  R_b = P_r / (k T_sys · Eb/N0).
 * Voyager example values from the atlas (after Ludwig & Taylor 2002, JPL DESCANSO): 23 W X-band at 8.42 GHz,
 * 3.66 m high-gain antenna, η = 0.6, T_sys = 25 K, Eb/N0 = 7 dB for the code plus margins. */
export const K_B = 1.380649e-23;
export const dishGain = (D, hz, eta = 0.6) => eta * Math.pow(Math.PI * D * hz / (C_KM_S * 1000), 2);
export const dB = (x) => 10 * Math.log10(x);
export function linkBudget({ Pt = 23, Dt = 3.66, Dr = 70, hz = 8.42e9, km, Tsys = 25, EbN0dB = 7, eta = 0.6, arrayArea = null }) {
  const lam = C_KM_S * 1000 / hz, d = km * 1000;
  const Gt = dishGain(Dt, hz, eta);
  const Gr = arrayArea ? eta * 4 * Math.PI * arrayArea / (lam * lam) : dishGain(Dr, hz, eta);
  const Lfs = Math.pow(4 * Math.PI * d / lam, 2);
  const Pr = Pt * Gt * Gr / Lfs;
  const N0 = K_B * Tsys;
  const Rb = Pr / (N0 * Math.pow(10, EbN0dB / 10));
  return { lam, Gt, Gr, Lfs, Pr, N0, Rb, PrdBm: dB(Pr) + 30, GtdB: dB(Gt), GrdB: dB(Gr), LfsdB: dB(Lfs), PtdBW: dB(Pt), N0dB: dB(N0), CN0: dB(Pr / N0) };
}
