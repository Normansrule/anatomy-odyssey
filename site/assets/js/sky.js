/* Night Sky: a planetarium for any place and time (sky.html).
 *
 * Rendering
 *   WebGL (Three.js) draws, per pixel, the atmosphere, the Milky Way and the ground, then the
 *   5,044 catalogue stars and the planets as additive point sprites. A 2D canvas on top draws
 *   lines, labels, the Moon with its phase and the Sun's disc.
 *   Projection: stereographic about the view direction, r = 2 tan(theta / 2), so circles on the
 *   sky stay circles and constellations keep their shapes even at a 180 degree field of view.
 *
 * Astronomy lives in sky-astro.js (pure functions, unit-tested by scripts/test_sky.mjs):
 *   catalogue J2000 vector --(IAU 1976 precession, sidereal time, latitude)--> horizontal vector
 *   --(Saemundsson refraction)--> apparent altitude --> screen.
 *
 * Data: d3-celestial by Olaf Frohn (BSD-3-Clause): Hipparcos stars to magnitude 6, IAU star
 * names, constellation figures and boundaries, Milky Way contours, Messier objects.
 */
import * as THREE from "three";
import * as A from "./sky-astro.js";

const D2R = Math.PI / 180, R2D = 180 / Math.PI, TAU = Math.PI * 2;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normz = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const reduce = !!(window.Codex && window.Codex.reducedMotion);
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const VIEWER_TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) { return "UTC"; } })();

/* ------------------------------------------------------------------ places --- */
const PLACES = [
  { id: "la", name: "Los Angeles", lat: 34.05, lon: -118.25, tz: "America/Los_Angeles" },
  { id: "ny", name: "New York", lat: 40.71, lon: -74.01, tz: "America/New_York" },
  { id: "london", name: "London", lat: 51.48, lon: 0.0, tz: "Europe/London" },
  { id: "reykjavik", name: "Reykjavík", lat: 64.15, lon: -21.94, tz: "Atlantic/Reykjavik" },
  { id: "quito", name: "Quito (equator)", short: "Quito", lat: -0.18, lon: -78.47, tz: "America/Guayaquil" },
  { id: "atacama", name: "Atacama Desert", lat: -24.63, lon: -70.40, tz: "America/Santiago" },
  { id: "sydney", name: "Sydney", lat: -33.87, lon: 151.21, tz: "Australia/Sydney" },
  { id: "southpole", name: "South Pole", lat: -89.99, lon: 0, tz: "Antarctica/South_Pole" }
];
const PLANET_COL = { mercury: [0.86, 0.80, 0.72], venus: [1, 0.97, 0.88], mars: [1, 0.60, 0.40], jupiter: [1, 0.92, 0.78],
  saturn: [1, 0.88, 0.66], uranus: [0.72, 0.93, 0.96], neptune: [0.58, 0.70, 1] };
const hexOf = c => "#" + c.map(x => Math.round(clamp(x, 0, 1) * 255).toString(16).padStart(2, "0")).join("");
const BORTLE = [
  [7.8, "excellent dark site"], [7.3, "truly dark"], [6.8, "rural"], [6.3, "rural–suburban"], [5.8, "suburban"],
  [5.3, "bright suburban"], [4.8, "suburban–urban"], [4.3, "city"], [4.0, "inner city"]];
const GREEK = { "α": "alpha", "β": "beta", "γ": "gamma", "δ": "delta", "ε": "epsilon", "ζ": "zeta", "η": "eta", "θ": "theta", "ι": "iota", "κ": "kappa", "λ": "lambda", "μ": "mu", "ν": "nu", "ξ": "xi", "ο": "omicron", "π": "pi", "ρ": "rho", "σ": "sigma", "τ": "tau", "υ": "upsilon", "φ": "phi", "χ": "chi", "ψ": "psi", "ω": "omega" };
const MESSIER_TYPE = { gc: "Globular cluster", oc: "Open cluster", pn: "Planetary nebula", snr: "Supernova remnant", sfr: "Star-forming nebula",
  rn: "Reflection nebula", s: "Spiral galaxy", e: "Elliptical galaxy", i: "Irregular galaxy", pos: "Star cloud or asterism" };

/* Short notes; distances are rounded published values (Hipparcos / Gaia parallaxes as quoted by
 * NASA and ESA outreach pages); large ones are uncertain by 10 per cent or more. */
const STAR_NOTES = {
  32349: "The brightest star of the night sky, 8.6 light-years away, with a white-dwarf companion.",
  30438: "Second-brightest star, a bright giant about 310 light-years away; spacecraft use it to steer.",
  69673: "An orange giant 37 light-years away, racing through the Galaxy's disc.",
  71683: "Alpha Centauri A: with B and Proxima, the nearest star system, 4.37 light-years away.",
  91262: "25 light-years away; the zero point of the magnitude scale and a corner of the Summer Triangle.",
  24608: "A pair of yellow giants 43 light-years away.",
  24436: "A blue supergiant about 860 light-years away, Orion's foot.",
  37279: "11.5 light-years away, one of the Sun's neighbours, with a white-dwarf companion.",
  7588: "The flattest known star, spinning so fast it bulges at the equator; 139 light-years away.",
  27989: "A red supergiant about 550 light-years away, big enough to swallow the orbit of Mars. It will explode as a supernova.",
  97649: "17 light-years away, spinning once every 9 hours; a corner of the Summer Triangle.",
  21421: "The Bull's red eye, an orange giant 65 light-years away, in front of (not in) the Hyades cluster.",
  65474: "A hot blue binary 250 light-years away.",
  80763: "The Scorpion's heart, a red supergiant about 550 light-years away. Its name means 'rival of Mars'.",
  37826: "The brighter twin: an orange giant 34 light-years away with a planet.",
  113368: "25 light-years away, ringed by a dusty debris disc.",
  102098: "A supergiant perhaps 2,600 light-years away, one of the most luminous stars you can see.",
  49669: "The Lion's heart, 79 light-years away, spinning close to break-up speed.",
  11767: "Within 0.7° of the north celestial pole: its altitude equals your latitude. About 430 light-years away.",
  36850: "Six stars in three pairs, 51 light-years away.",
  60718: "The foot of the Southern Cross, a multiple star about 320 light-years away.",
  68702: "A blue giant triple about 390 light-years away; with Rigil Kentaurus it points to the Southern Cross."
};
const MESSIER_NOTES = {
  M1: "Remains of the supernova seen from Earth in 1054, 6,500 light-years away (telescope).",
  M13: "Several hundred thousand stars packed into a ball, 22,200 light-years away.",
  M8: "Glowing hydrogen in Sagittarius, 4,100 light-years away; naked-eye in a dark sky.",
  M16: "The Eagle Nebula with the 'Pillars of Creation', 7,000 light-years away.",
  M20: "Red emission, blue reflection and dark lanes in one nebula (telescope).",
  M22: "A bright globular cluster 10,600 light-years away (binoculars).",
  M27: "The brightest planetary nebula: a dying star's shell, 1,360 light-years away (binoculars).",
  M31: "The Andromeda Galaxy, 2.5 million light-years away: the farthest thing your eyes can see unaided.",
  M33: "The Triangulum Galaxy, 2.7 million light-years away: a test of truly dark skies.",
  M42: "The Orion Nebula, a stellar nursery 1,344 light-years away, visible to the naked eye.",
  M44: "The Beehive Cluster, a misty patch to the eye, 580 light-years away.",
  M45: "The Pleiades or Seven Sisters: a young cluster 444 light-years away.",
  M51: "The Whirlpool, the first galaxy seen to be a spiral, about 30 million light-years away (telescope).",
  M57: "The Ring Nebula: gas puffed off by a dying star, 2,600 light-years away (telescope).",
  M81: "Bode's Galaxy, 12 million light-years away (binoculars).",
  M87: "A giant elliptical galaxy 53 million light-years away; the Event Horizon Telescope (EHT) imaged its black hole in 2019.",
  M104: "The Sombrero Galaxy, edge-on with a dark dust lane (telescope).",
  M7: "Ptolemy's Cluster near the Scorpion's sting, 980 light-years away, recorded in 130 AD.",
  M6: "The Butterfly Cluster in Scorpius (binoculars).",
  M11: "The Wild Duck Cluster in Scutum (binoculars).",
  M35: "A rich open cluster at the feet of the Twins (binoculars).",
  M4: "A globular cluster beside Antares, one of the closest at 7,200 light-years.",
  M3: "A fine globular cluster of half a million stars (binoculars).",
  M5: "One of the oldest globular clusters, about 13 billion years old.",
  M15: "A dense globular cluster off Pegasus' nose (binoculars).",
  M24: "The Sagittarius Star Cloud, a window through the dust to an inner arm of the Galaxy.",
  M41: "An open cluster just south of Sirius (binoculars)."
};
const CON_NOTES = {
  Ori: "The Hunter: red Betelgeuse, blue-white Rigel and the three-star belt.",
  UMa: "Holds the Big Dipper; its two end stars point to Polaris.",
  Cas: "The W, opposite the Dipper across the pole.",
  Cyg: "The Northern Cross, flying down the Milky Way.",
  Sco: "The Scorpion, with red Antares as its heart.",
  Sgr: "The Teapot; the centre of our Galaxy lies just above its spout.",
  Leo: "The Lion; a backward question mark forms its mane.",
  Lyr: "Small, but home of Vega and the Ring Nebula.",
  Cru: "The Southern Cross, the smallest constellation; its long bar points south.",
  Cen: "Home of Alpha Centauri, the nearest star system to the Sun.",
  Car: "The keel of the ship Argo, with Canopus.",
  Tau: "The Bull: Aldebaran, the V of the Hyades and the Pleiades.",
  Gem: "The Twins, Castor and Pollux.",
  Peg: "The Great Square of Pegasus, the autumn signpost.",
  And: "Home of the Andromeda Galaxy, M31.",
  Boo: "The Herdsman, a kite with Arcturus at its tail.",
  Aql: "The Eagle, with Altair in the Summer Triangle.",
  CMa: "The Great Dog, with Sirius.",
  Per: "Perseus, radiant of the August meteor shower.",
  Aur: "A pentagon of stars around Capella.",
  Her: "The Keystone, with the great globular cluster M13.",
  Vir: "The Maiden, with Spica and thousands of galaxies.",
  UMi: "The Little Dipper, ending in Polaris."
};
const SHOW_MESSIER = ["M31", "M42", "M45", "M13", "M8", "M57", "M27", "M44", "M7", "M22", "M81", "M51", "M11", "M35", "M6", "M33", "M104", "M1", "M4", "M3", "M5", "M15", "M24", "M41", "M20", "M16"];

/* ------------------------------------------------------------------- state --- */
const S = {
  ms: Date.now(), playing: true, speed: 1, dir: 1,
  lat: 34.05, lon: -118.25, place: "Los Angeles", placeId: "la", siteTz: "America/Los_Angeles", tzMode: "viewer",
  view: { az: 185, alt: 32, fov: 115 },
  layers: { lines: true, names: true, bounds: false, starNames: true, messier: false, planets: true, ecliptic: true,
    azGrid: false, eqGrid: false, ground: true, atm: true, twinkle: !reduce },
  bortle: 3, sel: null, hover: null, tab: "tonight"
};
const url = new URLSearchParams(location.search);
(function readURL() {
  const t = url.get("t");
  if (t) { const ms = Date.parse(t); if (isFinite(ms)) { S.ms = ms; S.playing = url.get("play") === "1"; } }
  const p = PLACES.find(x => x.id === url.get("loc"));
  if (p) setPlaceState(p);
  if (url.has("lat") && url.has("lon")) {
    const la = +url.get("lat"), lo = +url.get("lon");
    if (isFinite(la) && isFinite(lo)) { S.lat = clamp(la, -89.99, 89.99); S.lon = A.wrap180(lo); S.place = url.get("name") || fmtLatLon(S.lat, S.lon); S.placeId = null; S.siteTz = etcZone(S.lon); }
  }
  if (url.has("tz")) { const z = url.get("tz"); if (z === "site" || z === "viewer") S.tzMode = z; else { S.tzMode = "fixed"; S.fixedTz = z; } }
  if (!url.has("alt") && innerHeight > innerWidth * 1.2) S.view.alt = 52;
  for (const k of ["az", "alt", "fov"]) if (url.has(k) && isFinite(+url.get(k))) S.view[k] = +url.get(k);
  if (url.has("bortle")) S.bortle = clamp(Math.round(+url.get("bortle")) || 3, 1, 9);
  if (url.has("layers")) for (const kv of url.get("layers").split(",")) { const [k, v] = kv.split(":"); if (k in S.layers) S.layers[k] = v !== "0"; }
})();
function setPlaceState(p) { S.lat = p.lat; S.lon = p.lon; S.place = p.name; S.placeId = p.id; S.siteTz = p.tz; }
function etcZone(lon) { const h = Math.round(lon / 15); return h === 0 ? "UTC" : `Etc/GMT${h > 0 ? "-" : "+"}${Math.abs(h)}`; }
function fmtLatLon(lat, lon) { return `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? "E" : "W"}`; }

/* -------------------------------------------------------------- time zones --- */
const tzFmtCache = {};
function tzName() { return S.tzMode === "fixed" ? S.fixedTz : S.tzMode === "site" ? S.siteTz : VIEWER_TZ; }
function tzFmt(tz) {
  if (!tzFmtCache[tz]) {
    try {
      tzFmtCache[tz] = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short" });
    } catch (e) { tzFmtCache[tz] = tzFmt("UTC"); }
  }
  return tzFmtCache[tz];
}
function parts(ms, tz = tzName()) {
  const o = {}; for (const p of tzFmt(tz).formatToParts(new Date(ms))) o[p.type] = p.value;
  return { y: +o.year, mo: +o.month, d: +o.day, h: (+o.hour) % 24, mi: +o.minute, s: +o.second, wd: o.weekday };
}
function tzOffsetMin(ms, tz = tzName()) { const p = parts(ms, tz); return (Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000) / 60000; }
function wallToMs(y, mo, d, h, mi, tz = tzName()) {
  const g = Date.UTC(y, mo - 1, d, h, mi);
  let ms = g - tzOffsetMin(g, tz) * 60000;
  return g - tzOffsetMin(ms, tz) * 60000;
}
function localMidnight(ms) { const p = parts(ms); return wallToMs(p.y, p.mo, p.d, 0, 0); }
const zoneAbbr = {};
function tzAbbr(ms, tz = tzName()) {
  const key = tz + Math.floor(ms / 864e5);
  if (!zoneAbbr[key]) {
    try { zoneAbbr[key] = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date(ms)).find(p => p.type === "timeZoneName").value; }
    catch (e) { zoneAbbr[key] = "UTC"; }
  }
  return zoneAbbr[key];
}
const pad = n => String(n).padStart(2, "0");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function hm(ms) { if (ms == null || !isFinite(ms)) return "—"; const p = parts(ms); return `${pad(p.h)}:${pad(p.mi)}`; }
function hmJD(jd) { return jd == null ? "—" : hm(A.jdToMs(jd)); }
const nextDay = (jd, jd0) => jd != null && jd0 != null && jd >= jd0 + 1 ? "<sup>+1</sup>" : "";
function dateStr(ms) { const p = parts(ms); return `${p.wd} ${p.d} ${MONTHS[p.mo - 1]} ${p.y}`; }
function hms(deg) { deg = A.wrap360(deg) / 15; const h = Math.floor(deg), m = Math.floor((deg - h) * 60), s = Math.floor(((deg - h) * 60 - m) * 60); return `${pad(h)}h ${pad(m)}m ${pad(s)}s`; }
function dms(deg) { const sg = deg < 0 ? "−" : "+"; deg = Math.abs(deg); const d = Math.floor(deg), m = Math.floor((deg - d) * 60), s = Math.floor(((deg - d) * 60 - m) * 60); return `${sg}${pad(d)}° ${pad(m)}′ ${pad(s)}″`; }
const COMPASS16 = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const compass = az => COMPASS16[Math.round(A.wrap360(az) / 22.5) % 16];
const COMPASS_WORD = { N: "north", NNE: "north-northeast", NE: "northeast", ENE: "east-northeast", E: "east", ESE: "east-southeast", SE: "southeast", SSE: "south-southeast", S: "south", SSW: "south-southwest", SW: "southwest", WSW: "west-southwest", W: "west", WNW: "west-northwest", NW: "northwest", NNW: "north-northwest" };
const fmtMag = m => (m < 0 ? "−" : "") + Math.abs(m).toFixed(1);
const fmtNum = (v, d = 0) => v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });

/* ----------------------------------------------------------- landscape --- */
/* The horizon silhouette: distant hills (higher toward the north, like the San Gabriel
 * Mountains seen from Los Angeles) and a near row of conifers. Mirrored exactly in GLSL. */
const fract = x => x - Math.floor(x);
const hash1 = n => fract(n * 0.754877 + fract(n * n * 0.0169) * 0.5 + 0.13);
function ridgeFar(az) {
  let h = 1.25 + 0.75 * Math.sin(az * 2 + 0.7) + 0.45 * Math.sin(az * 5 + 2.3) + 0.22 * Math.sin(az * 11 + 0.4) + 0.1 * Math.sin(az * 23 + 1.9) + 0.05 * Math.sin(az * 47 + 0.3);
  const c = Math.max(Math.cos(az), 0); h += 2.2 * c * c * c;
  return Math.max(h, 0.25);
}
function ridgeNear(az) {
  const base = 0.42 + 0.18 * Math.sin(az * 3 + 4) + 0.07 * Math.sin(az * 13 + 1);
  const x = az / TAU * 300, i = Math.floor(x), f = x - i;
  const cluster = smooth(-0.1, 0.55, Math.sin(az * 2 + 0.5) * 0.6 + Math.sin(az * 7) * 0.4);
  const on = hash1(i) > 0.3 ? 1 : 0;
  const tri = Math.max(0, 1 - Math.abs(2 * f - 1) * 1.25);
  return base + on * cluster * (0.7 + 1.5 * hash1(i + 97)) * tri;
}
const ridge = az => Math.max(ridgeFar(az), ridgeNear(az));
const GLSL_COMMON = /* glsl */`
#define D2R 0.017453292519943295
#define R2D 57.29577951308232
#define TAU 6.283185307179586
float hash1(float n){ return fract(n*0.754877 + fract(n*n*0.0169)*0.5 + 0.13); }
float ridgeFar(float az){
  float h = 1.25 + 0.75*sin(az*2.0+0.7) + 0.45*sin(az*5.0+2.3) + 0.22*sin(az*11.0+0.4) + 0.1*sin(az*23.0+1.9) + 0.05*sin(az*47.0+0.3);
  float c = max(cos(az), 0.0); h += 2.2*c*c*c;
  return max(h, 0.25);
}
float ridgeNear(float az){
  float base = 0.42 + 0.18*sin(az*3.0+4.0) + 0.07*sin(az*13.0+1.0);
  float x = az/TAU*300.0; float i = floor(x); float f = x - i;
  float cluster = smoothstep(-0.1, 0.55, sin(az*2.0+0.5)*0.6 + sin(az*7.0)*0.4);
  float on = hash1(i) > 0.3 ? 1.0 : 0.0;
  float tri = max(0.0, 1.0 - abs(2.0*f - 1.0)*1.25);
  return base + on*cluster*(0.7 + 1.5*hash1(i+97.0))*tri;
}
float refrTrue(float h){
  float hh = max(h, -1.9);
  float R = 1.02/tan((hh + 10.3/(hh+5.11))*D2R)/60.0;
  if (h < -1.9) R *= max(0.0, 1.0 + (h+1.9)/3.0);
  return max(R, 0.0);
}
float refrApp(float h0){ float hh = max(h0, -1.5); return max(0.0, 1.0/tan((hh + 7.31/(hh+4.4))*D2R)/60.0); }
float airmass(float h){ float x = max(h, 0.0); return h <= -1.0 ? 40.0 : 1.0/(sin(x*D2R) + 0.50572*pow(x + 6.07995, -1.6364)); }
`;

/* ------------------------------------------------------------- the shaders --- */
const BG_VERT = `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const BG_FRAG = /* glsl */`
precision highp float;
${GLSL_COMMON}
uniform vec2 uRes; uniform float uScale; uniform vec3 uR, uU, uF;
uniform mat3 uHG; uniform sampler2D uMW;
uniform vec3 uSun; uniform float uSunAlt; uniform vec3 uMoon; uniform float uMoonAlt, uMoonIllum;
uniform float uAtm, uLP, uMWVis, uGroundOn, uTime;

vec3 skyColor(vec3 d, float alt){
  float h = max(alt, 0.0);
  float s = uSunAlt;
  vec2 dh = normalize(d.xy + vec2(1e-6, 0.0)); vec2 sh = normalize(uSun.xy + vec2(1e-6, 0.0));
  float azc = dot(dh, sh);
  float cg = dot(d, uSun);
  float dayAmt = smoothstep(-4.0, 7.0, s);
  // daylight: Rayleigh blue deepening toward the zenith, paler at the horizon
  vec3 zen = mix(vec3(0.06,0.15,0.40), vec3(0.11,0.32,0.72), smoothstep(0.0, 45.0, s));
  vec3 hor = mix(vec3(0.74,0.66,0.60), vec3(0.64,0.79,0.95), smoothstep(0.0, 25.0, s));
  float grad = pow(1.0 - h/90.0, 5.0);
  vec3 day = mix(zen, hor, grad);
  float c0 = max(cg, 0.0);
  day += vec3(1.0,0.93,0.80)*(pow(c0,5.0)*0.28 + pow(c0,60.0)*0.5 + pow(c0,900.0)*1.5);   // Mie forward glow
  float low = 1.0 - smoothstep(0.0, 20.0, s);
  day += vec3(0.60,0.26,0.05)*low*exp(-h/9.0)*pow(0.5+0.5*azc, 2.0)*0.85;
  // twilight
  float twB = exp(clamp(s, -20.0, 4.0)/4.2);
  vec3 twHor = mix(vec3(0.95,0.28,0.07), vec3(1.0,0.62,0.26), smoothstep(-6.0, 2.0, s));
  float band = exp(-h/(3.5 + 6.0*max(azc, 0.0)))*pow(0.5+0.5*azc, 3.0);
  vec3 tw = twHor*band*0.95;
  tw += vec3(0.95,0.78,0.52)*exp(-h/13.0)*pow(0.5+0.5*azc, 6.0)*0.32;
  tw += vec3(0.11,0.25,0.68)*(0.30 + 0.70*(1.0-grad)) + vec3(0.16,0.20,0.40)*grad;
  tw += vec3(0.24,0.25,0.45)*exp(-h/14.0)*0.35;
  float anti = pow(0.5 - 0.5*azc, 2.0);
  float shTop = clamp(-s*0.9, 0.0, 7.0);
  float tws = smoothstep(-7.5, -1.0, s)*(1.0 - smoothstep(1.0, 5.0, s));
  float belt = smoothstep(shTop, shTop+1.5, h)*(1.0 - smoothstep(shTop+3.0, shTop+10.0, h));
  tw += vec3(0.85,0.45,0.58)*belt*anti*0.5*tws;                                   // Belt of Venus
  tw *= 1.0 - 0.5*anti*tws*(1.0 - smoothstep(shTop-0.5, shTop+0.8, h));            // Earth's shadow
  tw *= twB;
  // night: airglow and light pollution
  vec3 night = vec3(0.0026, 0.0040, 0.0092) + vec3(0.010, 0.016, 0.022)*exp(-h/9.0) + vec3(0.012, 0.014, 0.020)*exp(-h/2.5);
  night += vec3(0.22, 0.14, 0.075)*uLP*exp(-h/8.0) + vec3(0.030, 0.032, 0.045)*uLP*uLP;
  // moonlight
  float mUp = smoothstep(-2.0, 10.0, uMoonAlt)*uMoonIllum*uMoonIllum;
  float cm = max(dot(d, uMoon), 0.0);
  vec3 moon = vec3(0.030,0.058,0.13)*mUp*(0.45 + 0.55*exp(-h/25.0)) + vec3(0.22,0.24,0.28)*mUp*(pow(cm,500.0)*0.7 + pow(cm,50.0)*0.07);
  return mix(night + moon + tw, day, dayAmt);
}

void main(){
  vec2 p = (gl_FragCoord.xy - 0.5*uRes)/uScale;
  float rho = length(p);
  float c = 2.0*atan(0.5*rho);
  vec3 side = rho > 1e-6 ? (p.x*uR + p.y*uU)/rho : vec3(0.0);
  vec3 d = normalize(cos(c)*uF + sin(c)*side);
  float alt = asin(clamp(d.z, -1.0, 1.0))*R2D;
  float az = atan(d.x, d.y); if (az < 0.0) az += TAU;
  vec2 hz = vec2(sin(az), cos(az));
  float rf = ridgeFar(az), rn = ridgeNear(az);
  bool isGround = uGroundOn > 0.5 && alt < max(rf, rn);
  vec3 col = vec3(0.0);
  if (!isGround) {
    col = uAtm > 0.5 ? skyColor(d, alt) : vec3(0.0015, 0.002, 0.004);
    // Milky Way, looked up in galactic coordinates for the true (unrefracted) direction
    float altT = alt - uAtm*refrApp(alt);
    vec3 dT = vec3(cos(altT*D2R)*hz, sin(altT*D2R));
    vec3 g = uHG*dT;
    float b = asin(clamp(g.z, -1.0, 1.0))*R2D;
    if (abs(b) < 40.0 && uMWVis > 0.001) {
      float l = atan(g.y, g.x);
      float mw = texture2D(uMW, vec2(l/TAU, (b + 40.0)/80.0)).r;
      float lw = abs(l) / 3.14159;
      float core = exp(-lw*lw*9.0);
      vec3 mwc = mix(vec3(0.58,0.66,0.95), vec3(1.0,0.86,0.68), core*0.8);
      float ext = uAtm > 0.5 ? exp(-0.32*(airmass(max(altT,0.0)) - 1.0)) : 1.0;
      col += mwc*pow(mw, 2.6)*0.95*uMWVis*ext*smoothstep(-2.0, 1.0, alt);
    }
  }
  if (uGroundOn > 0.5 && alt < rf + 7.0) {
    vec3 skyH = uAtm > 0.5 ? skyColor(vec3(hz, 0.0), 0.0) : vec3(0.0);
    if (isGround) {
      float dl = smoothstep(-10.0, 12.0, uSunAlt);
      vec3 ground = mix(vec3(0.008,0.010,0.014), vec3(0.13,0.15,0.11)*(0.45 + 0.55*smoothstep(0.0, 40.0, uSunAlt)), dl);
      ground += skyH*0.05;
      bool far = alt >= rn;
      vec3 farCol = mix(ground*1.1, skyH, 0.42 + 0.2*(1.0-dl));
      col = far ? farCol : ground*(0.62 + 0.38*exp(min(alt,0.0)/8.0));
      float rim = far ? smoothstep(rf-0.25, rf, alt) : smoothstep(rn-0.2, rn, alt);
      col += skyH*rim*0.18;
    } else {
      col = mix(col, skyH, uAtm*0.35*exp(-max(alt - rf, 0.0)/1.5));   // horizon haze
    }
  } else if (uGroundOn < 0.5 && alt < 0.0) {
    col *= 0.45;
    col += vec3(0.09, 0.05, 0.03)*exp(alt/2.0)*0.4;
  }
  // gentle dither against banding
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)))*43758.5453);
  col += (n - 0.5)/255.0;
  gl_FragColor = vec4(col, 1.0);
}`;

const STAR_VERT = /* glsl */`
precision highp float;
${GLSL_COMMON}
attribute float aMag; attribute vec3 aCol; attribute float aSeed;
uniform mat3 uM; uniform vec3 uR, uU, uF; uniform vec2 uRes; uniform float uScale;
uniform float uLim, uTime, uTw, uPx, uAtm, uZoomK, uGroundOn, uDay;
varying vec3 vCol; varying float vI, vSig, vLam, vHalo, vPS;
void main(){
  vec3 h = uM*position;
  float alt = asin(clamp(h.z, -1.0, 1.0))*R2D;
  float az = atan(h.x, h.y);
  float altA = alt + uAtm*refrTrue(alt);
  float ca = cos(altA*D2R);
  vec3 hp = vec3(ca*sin(az), ca*cos(az), sin(altA*D2R));
  float azp = az < 0.0 ? az + TAU : az;
  float hide = (uGroundOn > 0.5 && altA < max(ridgeFar(azp), ridgeNear(azp))) ? 0.0 : 1.0;
  float Z = dot(hp, uF);
  float k = 2.0/(1.0 + max(Z, -0.999));
  vec2 sc = vec2(dot(hp, uR), dot(hp, uU))*k*uScale;
  gl_Position = vec4(sc/(0.5*uRes), 0.0, 1.0);
  float m = aMag + uAtm*0.25*(airmass(alt) - 1.0);          // extinction, 0.25 mag per air mass
  float vis = smoothstep(-0.3, 0.9, uLim - m)*hide*step(-0.9, Z);
  float F = pow(10.0, -0.4*(m - 6.0));
  float tw = 1.0;
  if (uTw > 0.0) {
    float amp = uTw*(0.08 + 0.5*pow(1.0 - clamp(altA/90.0, 0.0, 1.0), 4.0));
    tw = 1.0 + amp*(sin(uTime*(6.0 + aSeed*8.0) + aSeed*61.0)*0.6 + sin(uTime*(13.0 + aSeed*6.0) + aSeed*17.0)*0.4);
  }
  float lF = log(F)/2.302585;                               // 0 at mag 6, 3 at mag -1.5
  vSig = uPx*uZoomK*(0.85 + 0.30*lF);
  vLam = uPx*uZoomK*(0.9 + 0.9*pow(F, 0.2));
  vHalo = 0.32*clamp((lF - 1.2)/2.0, 0.0, 1.0)*(1.0 - 0.7*uDay);
  vI = vis*tw*clamp(0.34*pow(F, 0.36), 0.0, 2.2);
  vCol = aCol;
  vPS = min(2.0*max(3.2*vSig, 6.0*vLam*step(0.001, vHalo) + 3.2*vSig), 160.0);
  if (vI < 0.004) { vPS = 0.0; gl_Position = vec4(3.0, 3.0, 0.0, 1.0); }
  gl_PointSize = vPS;
}`;
const STAR_FRAG = /* glsl */`
precision highp float;
varying vec3 vCol; varying float vI, vSig, vLam, vHalo, vPS;
void main(){
  vec2 q = (gl_PointCoord - 0.5)*vPS;
  float d = length(q);
  float core = exp(-0.5*d*d/(vSig*vSig));
  float halo = vHalo*exp(-d/vLam)*(1.0 - smoothstep(0.35*vPS, 0.5*vPS, d));
  float spikes = vHalo*0.35*exp(-abs(q.x)/(0.35*vSig))*exp(-abs(q.y)/(2.2*vLam)) + vHalo*0.35*exp(-abs(q.y)/(0.35*vSig))*exp(-abs(q.x)/(2.2*vLam));
  vec3 c = mix(vCol, vec3(1.0), clamp(core*0.55, 0.0, 1.0));
  gl_FragColor = vec4(c*(core + halo + spikes)*vI, 1.0);
}`;

/* ------------------------------------------------------------------- setup --- */
const stage = $("#stage");
const overlay = $("#overlay");
const ctx = overlay.getContext("2d");
const loadTxt = $("#loadTxt");
let renderer, scene, cam, bgMat, starMat, planetGeo, starPoints, planetPoints, mwTex;
let DATA = null;
const CAT = { stars: [], starVec: null, named: [], names: {}, cons: {}, conLines: null, conLineIds: [], bounds: [], borderLines: null, messier: [], mwReady: false };

if (!(window.Codex && window.Codex.webgl())) {
  window.Codex && window.Codex.noGL("The planetarium draws the sky with WebGL. Turn on hardware acceleration in your browser settings, or try Chrome, Edge, Firefox or Safari.");
  $("#loading").classList.add("done");
} else {
  boot().catch(e => { console.error(e); loadTxt.textContent = "Could not load the star catalogue: " + e.message; });
}

async function boot() {
  const get = f => fetch("data/sky/" + f).then(r => { if (!r.ok) throw new Error(f + " " + r.status); return r.json(); });
  const [stars, names, cons, mw, messier, bounds] = await Promise.all(
    ["stars.json", "starnames.json", "constellations.json", "milkyway.json", "messier.json", "boundaries.json"].map(get));
  DATA = { stars, names, cons, mw, messier, bounds };
  loadTxt.textContent = "Placing 5,044 stars";
  await new Promise(r => setTimeout(r, 20));
  buildCatalogue();
  initGL();
  resize();
  updateView(); computeSky();
  buildUI();
  addEventListener("resize", resize);
  requestAnimationFrame(frame);
  setTimeout(() => $("#loading").classList.add("done"), 150);
  // The Milky Way: a pre-baked galactic-coordinate texture (made by bakeMilkyWay() below from the
  // d3-celestial contours; open sky.html?bakemw=1 to repaint it live). It fades in when ready.
  const bake = () => { const t0 = performance.now(); bakeMilkyWay(mw); perf.bake = performance.now() - t0; };
  if (url.has("bakemw") || url.has("debugmw")) setTimeout(bake, 300);
  else new THREE.TextureLoader().load("data/sky/milkyway-galactic.png", tex => {
    tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
    bgMat.uniforms.uMW.value = tex; CAT.mwReady = true; CAT.mwT = performance.now();
  }, undefined, () => setTimeout(bake, 300));
  const q = url.get("sel"); if (q) setTimeout(() => { const r = searchIndex(q)[0]; if (r) { const t = r.t(); choose(t, { fly: !(url.has("az") || url.has("alt")) }); if (window.gsap) gsap.globalTimeline.getChildren().forEach(tw => tw.progress(1)); } }, 50);
}

/* --------------------------------------------------------------- catalogue --- */
function buildCatalogue() {
  const st = DATA.stars.stars;
  CAT.stars = st;
  CAT.names = DATA.names.names;
  CAT.starVec = new Float32Array(st.length * 3);
  st.forEach((s, i) => { const v = A.raDecToVec(s[1], s[2]); CAT.starVec.set(v, i * 3); });
  CAT.hipIndex = new Map(st.map((s, i) => [s[0], i]));
  CAT.named = st.map((s, i) => [s, i]).filter(([s]) => CAT.names[s[0]] && CAT.names[s[0]].name).sort((a, b) => a[0][3] - b[0][3]);
  CAT.cons = DATA.cons.names;
  // constellation figures -> subdivided J2000 vectors, NaN separated, one run per polyline
  const segs = [], ids = [];
  for (const [id, lines] of Object.entries(DATA.cons.lines)) for (const pl of lines) { segs.push(subdivide(pl, 1.5)); ids.push(id); }
  CAT.conLines = segs; CAT.conLineIds = ids;
  CAT.borderLines = DATA.bounds.borders.map(([ids2, pl]) => ({ ids: ids2.split(","), v: subdivide(pl, 1.5) }));
  CAT.bounds = DATA.bounds.bounds.map(([id, poly]) => ({ id, poly, vs: poly.map(p => A.raDecToVec(p[0], p[1])) }));
  CAT.messier = DATA.messier.objects.map(o => ({ ...o, v: A.raDecToVec(o.ra, o.dec) }));
  // ecliptic (J2000) as a closed great circle
  const ecl = []; for (let L = 0; L <= 360; L += 2) { const l = L * D2R; ecl.push([Math.cos(l), Math.sin(l), 0]); }
  CAT.ecliptic = ecl.map(p => A.eclToEq({ x: p[0], y: p[1], z: p[2] }));
}
function subdivide(pl, stepDeg) {
  const out = [];
  for (let i = 0; i < pl.length; i++) {
    const v = A.raDecToVec(pl[i][0], pl[i][1]);
    if (i > 0) {
      const u = out[out.length - 1];
      const ang = A.angularSep(u, v), n = Math.ceil(ang / stepDeg);
      for (let k = 1; k < n; k++) out.push(slerp(u, v, k / n));
    }
    out.push(v);
  }
  return out;
}
function slerp(a, b, t) {
  const c = clamp(dot(a, b), -1, 1), w = Math.acos(c);
  if (w < 1e-6) return a.slice();
  const s = Math.sin(w), p = Math.sin((1 - t) * w) / s, q = Math.sin(t * w) / s;
  return [a[0] * p + b[0] * q, a[1] * p + b[1] * q, a[2] * p + b[2] * q];
}
const conOfCache = new Map();
function constellationOf(v) {
  for (const b of CAT.bounds) {
    let near = false;
    for (const q of b.vs) if (dot(q, v) > 0.5) { near = true; break; }
    if (near && A.inSphericalPolygon(v, b.poly)) return b.id;
  }
  return null;
}
function conOfStar(i) {
  if (!conOfCache.has(i)) conOfCache.set(i, constellationOf(starVecAt(i)));
  return conOfCache.get(i);
}
const starVecAt = i => [CAT.starVec[i * 3], CAT.starVec[i * 3 + 1], CAT.starVec[i * 3 + 2]];

function starColor(bv) {
  const c = A.tempToRGB(A.bvToTemp(bv));
  // stretch the pale blackbody colours a little so they read on screen, as the eye does at the telescope
  const m = (c[0] + c[1] + c[2]) / 3;
  const s = c.map(x => clamp(m + (x - m) * 1.35, 0, 1));
  const mx = Math.max(...s);
  return s.map(x => x / mx);
}

/* ------------------------------------------------------------------- WebGL --- */
function initGL() {
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.domElement.className = "sky-gl";
  renderer.domElement.setAttribute("aria-hidden", "true");
  stage.insertBefore(renderer.domElement, overlay);
  scene = new THREE.Scene();
  cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const common = { uRes: { value: new THREE.Vector2(1, 1) }, uScale: { value: 1 }, uR: { value: new THREE.Vector3() }, uU: { value: new THREE.Vector3() }, uF: { value: new THREE.Vector3() }, uAtm: { value: 1 }, uGroundOn: { value: 1 } };
  mwTex = new THREE.DataTexture(new Uint8Array(4), 1, 1); mwTex.needsUpdate = true;
  bgMat = new THREE.ShaderMaterial({
    vertexShader: BG_VERT, fragmentShader: BG_FRAG, depthTest: false, depthWrite: false,
    uniforms: { ...common, uHG: { value: new THREE.Matrix3() }, uMW: { value: mwTex }, uSun: { value: new THREE.Vector3() }, uSunAlt: { value: -30 },
      uMoon: { value: new THREE.Vector3() }, uMoonAlt: { value: -30 }, uMoonIllum: { value: 0 }, uLP: { value: 0 }, uMWVis: { value: 1 }, uTime: { value: 0 } }
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat);
  quad.frustumCulled = false; quad.renderOrder = 0; scene.add(quad);

  starMat = new THREE.ShaderMaterial({
    vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending,
    uniforms: { ...common, uM: { value: new THREE.Matrix3() }, uLim: { value: 6.5 }, uTime: { value: 0 }, uTw: { value: 1 }, uPx: { value: 1 }, uZoomK: { value: 1 }, uDay: { value: 0 } }
  });
  // share uniform objects so one update drives both materials
  for (const k of Object.keys(common)) starMat.uniforms[k] = bgMat.uniforms[k];

  const n = CAT.stars.length;
  const g = new THREE.BufferGeometry();
  const mag = new Float32Array(n), col = new Float32Array(n * 3), seed = new Float32Array(n);
  CAT.stars.forEach((s, i) => { mag[i] = s[3]; col.set(starColor(s[4]), i * 3); seed[i] = hash1(i * 0.37 + 3.1); });
  g.setAttribute("position", new THREE.BufferAttribute(CAT.starVec, 3));
  g.setAttribute("aMag", new THREE.BufferAttribute(mag, 1));
  g.setAttribute("aCol", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  starPoints = new THREE.Points(g, starMat); starPoints.frustumCulled = false; starPoints.renderOrder = 1; scene.add(starPoints);

  planetGeo = new THREE.BufferGeometry();
  const np = A.PLANETS.length;
  planetGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(np * 3), 3));
  planetGeo.setAttribute("aMag", new THREE.BufferAttribute(new Float32Array(np), 1));
  const pc = new Float32Array(np * 3); A.PLANETS.forEach((id, i) => pc.set(PLANET_COL[id], i * 3));
  planetGeo.setAttribute("aCol", new THREE.BufferAttribute(pc, 3));
  planetGeo.setAttribute("aSeed", new THREE.BufferAttribute(new Float32Array(np).fill(0), 1));
  // planets shine steadily: a disc, not a point, so they barely twinkle; use a twinkle-free copy
  const pm = starMat.clone(); for (const k of Object.keys(starMat.uniforms)) pm.uniforms[k] = starMat.uniforms[k];
  pm.uniforms = { ...pm.uniforms, uTw: { value: 0 } };
  planetPoints = new THREE.Points(planetGeo, pm); planetPoints.frustumCulled = false; planetPoints.renderOrder = 2; scene.add(planetPoints);
}

/* Milky Way: rasterise the five d3-celestial brightness contours in galactic coordinates
 * (l across, b from +40 to -40 down), blur them into a glow, then sprinkle unresolved-star grain
 * whose density follows the glow. */
function bakeMilkyWay(mw) {
  const W = 1024, H = 256, BMAX = 40;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = "lighter";
  const toXY = (ra, dec) => { const q = A.galactic(A.raDecToVec(ra, dec)); return [q.l / 360 * W, (BMAX - q.b) / (2 * BMAX) * H]; };
  const levels = [34, 36, 40, 44, 50];
  mw.features.forEach((f, li) => {
    g.beginPath();
    for (const poly of f.coords) for (const ring of poly) {
      const pts = []; let px = null;
      for (const [ra, dec] of ring) {
        let [x, y] = toXY(ra, dec);
        if (px != null) { while (x - px > W / 2) x -= W; while (px - x > W / 2) x += W; }
        pts.push([x, y]); px = x;
      }
      if (pts.length < 3) continue;
      const open = Math.abs(pts[pts.length - 1][0] - pts[0][0]) > W / 2;
      if (open) { pts.push([pts[pts.length - 1][0], -8]); pts.push([pts[0][0], -8]); }
      for (const off of [-W, 0, W, 2 * W, -2 * W]) {
        g.moveTo(pts[0][0] + off, pts[0][1]);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0] + off, pts[i][1]);
        g.closePath();
      }
    }
    const v = levels[li]; g.fillStyle = `rgb(${v},${v},${v})`; g.fill("evenodd");
  });
  const img = g.getImageData(0, 0, W, H), src = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) src[i] = img.data[i * 4] / 255;
  // mottled star clouds: a little multiplicative noise before blurring
  const rnd = mulberry(7);
  const noise = new Float32Array(W * H);
  for (let k = 0; k < 900; k++) {
    const x0 = rnd() * W, y0 = rnd() * H, r = 2 + rnd() * 7, a = (rnd() - 0.45) * 0.5;
    for (let y = Math.max(0, y0 - r * 2 | 0); y < Math.min(H, y0 + r * 2); y++) for (let x = Math.floor(x0 - r * 2); x < x0 + r * 2; x++) {
      const xx = ((x % W) + W) % W, d2 = ((x - x0) ** 2 + (y - y0) ** 2) / (r * r);
      noise[y * W + xx] += a * Math.exp(-d2);
    }
  }
  for (let k = 0; k < 2600; k++) {          // finer star-cloud mottling
    const x0 = rnd() * W, y0 = rnd() * H, r = 0.8 + rnd() * 2.2, a = (rnd() - 0.5) * 0.7;
    for (let y = Math.max(0, y0 - r * 2 | 0); y < Math.min(H, y0 + r * 2); y++) for (let x = Math.floor(x0 - r * 2); x < x0 + r * 2; x++) {
      const xx = ((x % W) + W) % W; noise[y * W + xx] += a * Math.exp(-((x - x0) ** 2 + (y - y0) ** 2) / (r * r));
    }
  }
  /* Known dark dust clouds, which the brightness contours only hint at (positions in galactic
   * l, b from photographic atlases): the Great Rift from Cygnus to Sagittarius, the Scutum-Aquila
   * lanes, the Pipe Nebula near Ophiuchus and the Coalsack by the Southern Cross. */
  const dust = (l, b) => {
    let f = 1;
    const L = A.wrap180(l);
    if (L > -8 && L < 88) {
      const bc = 1.2 + 0.9 * Math.sin(L * 0.07) + (L > 60 ? (L - 60) * 0.04 : 0), w = 1.6 + 0.8 * Math.sin(L * 0.13 + 1);
      const ends = smooth(-8, 4, L) * (1 - smooth(78, 88, L));
      f *= 1 - 0.62 * ends * Math.exp(-((b - bc) ** 2) / (2 * w * w));
    }
    const blob = (l0, b0, r, d) => { const dl = A.wrap180(l - l0), q = (dl * dl + (b - b0) ** 2) / (r * r); f *= 1 - d * Math.exp(-q); };
    blob(301.5, -1.0, 3.2, 0.65); blob(0.5, 5.5, 2.5, 0.35); blob(357, 6.5, 3, 0.3); blob(25, -2.5, 3, 0.3); blob(4, -1.5, 1.2, 0.3);
    return f;
  };
  for (let y = 0; y < H; y++) { const b = BMAX - (y + 0.5) / H * 2 * BMAX; for (let x = 0; x < W; x++) { const i = y * W + x; src[i] *= clamp(1 + noise[i], 0.3, 1.8) * dust((x + 0.5) / W * 360, b); } }
  const wide = boxBlur(src, W, H, 5), fine = boxBlur(src, W, H, 1);
  // compose at 2048 x 512 with bilinear upsampling, then grain
  const W2 = 2048, H2 = 512, out = new Uint8Array(W2 * H2 * 4);
  const sample = (arr, x, y) => {
    x = ((x % W) + W) % W; y = clamp(y, 0, H - 1.001);
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, x1 = (x0 + 1) % W, y1 = y0 + 1;
    return lerp(lerp(arr[y0 * W + x0], arr[y0 * W + x1], fx), lerp(arr[y1 * W + x0], arr[y1 * W + x1], fx), fy);
  };
  const dens = new Float32Array(W2 * H2);
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
    const sx = x / 2 - 0.25, sy = y / 2 - 0.25;
    dens[y * W2 + x] = clamp(0.45 * sample(wide, sx, sy) + 0.75 * sample(fine, sx, sy), 0, 1);
  }
  for (let k = 0; k < 110000; k++) {
    const x = (rnd() * W2) | 0, y = (rnd() * H2) | 0, d = dens[y * W2 + x];
    if (rnd() < d * 1.4) dens[y * W2 + x] = Math.min(1, d + 0.1 + rnd() * 0.25 * d);
  }
  for (let i = 0; i < W2 * H2; i++) { const v = Math.round(Math.sqrt(dens[i]) * 255); out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v; out[i * 4 + 3] = 255; }
  const tex = new THREE.DataTexture(out, W2, H2, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  tex.flipY = false;   // row 0 = b = -40: DataTexture rows start at v = 0
  // our rows were built top = +40, so flip to v = (b + 40) / 80
  const flipped = new Uint8Array(out.length);
  for (let y = 0; y < H2; y++) flipped.set(out.subarray((H2 - 1 - y) * W2 * 4, (H2 - y) * W2 * 4), y * W2 * 4);
  tex.image.data = flipped;
  tex.needsUpdate = true;
  bgMat.uniforms.uMW.value = tex;
  if (url.has("debugmw")) window.__mw = { data: out, W: W2, H: H2 };
  CAT.mwReady = true; CAT.mwT = performance.now();
}
function boxBlur(src, W, H, r) {
  let a = Float32Array.from(src), b = new Float32Array(W * H);
  const R = Math.max(1, Math.round(r));
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < H; y++) {            // horizontal, wrapping in longitude
      let acc = 0; const row = y * W;
      for (let x = -R; x <= R; x++) acc += a[row + ((x % W) + W) % W];
      for (let x = 0; x < W; x++) { b[row + x] = acc / (2 * R + 1); acc += a[row + (x + R + 1) % W] - a[row + ((x - R) % W + W) % W]; }
    }
    for (let x = 0; x < W; x++) {            // vertical, clamped
      let acc = 0;
      for (let y = -R; y <= R; y++) acc += b[clamp(y, 0, H - 1) * W + x];
      for (let y = 0; y < H; y++) { a[y * W + x] = acc / (2 * R + 1); acc += b[clamp(y + R + 1, 0, H - 1) * W + x] - b[clamp(y - R, 0, H - 1) * W + x]; }
    }
  }
  return a;
}
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* A small procedural Moon: maria as soft dark patches at their approximate places on the
 * near side (north up, as seen with the naked eye from the northern hemisphere). */
const moonTex = (() => {
  const N = 256, c = document.createElement("canvas"); c.width = c.height = N;
  const g = c.getContext("2d"), R = N / 2;
  const base = g.createRadialGradient(R * 0.9, R * 0.85, R * 0.1, R, R, R);
  base.addColorStop(0, "#f4f1e8"); base.addColorStop(0.8, "#dcd7cb"); base.addColorStop(1, "#b9b3a6");
  g.fillStyle = base; g.beginPath(); g.arc(R, R, R, 0, TAU); g.fill();
  g.save(); g.beginPath(); g.arc(R, R, R, 0, TAU); g.clip();
  const maria = [ // [x, y, rx, ry, darkness] in units of the radius, +x = right (west on the sky), +y = up (north)
    [-0.52, 0.12, 0.42, 0.55, 0.30], [-0.22, 0.52, 0.30, 0.24, 0.32], [0.28, 0.40, 0.19, 0.18, 0.30], [0.40, 0.12, 0.24, 0.20, 0.30],
    [0.74, 0.30, 0.13, 0.12, 0.34], [0.60, -0.12, 0.13, 0.20, 0.24], [0.42, -0.30, 0.10, 0.10, 0.22], [-0.20, -0.32, 0.20, 0.14, 0.22],
    [-0.52, -0.40, 0.11, 0.11, 0.24], [0.02, 0.76, 0.42, 0.07, 0.22], [0.0, 0.05, 0.12, 0.10, 0.12], [-0.35, -0.05, 0.14, 0.18, 0.18]];
  for (const [x, y, rx, ry, d] of maria) {
    g.save(); g.translate(R + x * R, R - y * R); g.scale(rx, ry);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, R);
    gr.addColorStop(0, `rgba(70,72,80,${d * 1.6})`); gr.addColorStop(0.7, `rgba(80,80,88,${d})`); gr.addColorStop(1, "rgba(80,80,88,0)");
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill(); g.restore();
  }
  const rnd = mulberry(11);
  for (let k = 0; k < 260; k++) {           // craters
    const a = rnd() * TAU, r = Math.sqrt(rnd()) * R * 0.95, s = 0.6 + rnd() * rnd() * 5;
    g.fillStyle = `rgba(${rnd() < 0.5 ? "255,255,250" : "60,60,70"},${0.05 + rnd() * 0.1})`;
    g.beginPath(); g.arc(R + Math.cos(a) * r, R + Math.sin(a) * r, s, 0, TAU); g.fill();
  }
  const ty = [R - 0.15 * R, R + 0.70 * R];  // Tycho and its rays
  g.fillStyle = "rgba(255,255,250,.55)"; g.beginPath(); g.arc(ty[0], ty[1], 3, 0, TAU); g.fill();
  g.strokeStyle = "rgba(255,255,250,.08)"; g.lineWidth = 1.5;
  for (let k = 0; k < 14; k++) { const a = rnd() * TAU; g.beginPath(); g.moveTo(ty[0], ty[1]); g.lineTo(ty[0] + Math.cos(a) * R * (0.4 + rnd() * 0.6), ty[1] + Math.sin(a) * R * (0.4 + rnd() * 0.6)); g.stroke(); }
  g.fillStyle = "rgba(255,255,250,.35)"; g.beginPath(); g.arc(R - 0.3 * R, R - 0.17 * R, 2.5, 0, TAU); g.fill();   // Copernicus
  g.restore();
  return c;
})();

/* ------------------------------------------------------------ view + sky --- */
const V = { W: 1, H: 1, dpr: 1, glr: 1, slow: 0, scale: 1, cx: 0, cy: 0, R: [1, 0, 0], U: [0, 0, 1], F: [0, 1, 0] };
let SKY = null;   // everything computed for the current instant
function resize() {
  const W = innerWidth, H = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2);
  V.W = W; V.H = H; V.dpr = dpr; V.glr = Math.min(V.glr === 1 && !V.slow ? dpr : V.glr, dpr);
  renderer.setPixelRatio(V.glr); renderer.setSize(W, H);
  overlay.width = Math.round(W * dpr); overlay.height = Math.round(H * dpr);
  overlay.style.width = W + "px"; overlay.style.height = H + "px";
  const t = $(".sky-title"); if (t) document.body.style.setProperty("--title-h", t.offsetHeight + "px");
  const p = $("#panel");
  if (innerWidth <= 820 && p && !p.dataset.init) { p.dataset.init = 1; p.classList.add("collapsed"); p.querySelector(".hud-collapse").textContent = "▲ TONIGHT · SKY · PLACE · LEARN"; }
}
function updateView() {
  const v = S.view;
  v.fov = clamp(v.fov, 10, 180); v.alt = clamp(v.alt, -35, 90); v.az = A.wrap360(v.az);
  const a = v.az * D2R, e = v.alt * D2R;
  V.F = [Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), Math.sin(e)];
  V.R = [Math.cos(a), -Math.sin(a), 0];
  V.U = cross(V.R, V.F);
  const ref = V.H > V.W ? Math.sqrt(V.W * V.H) : Math.min(V.W, V.H);   // phones in portrait: a less extreme fisheye
  V.scale = (ref / 2) / (2 * Math.tan(v.fov / 4 * D2R));
  V.cx = V.W / 2; V.cy = V.H / 2;
}
/** Screen position (CSS px) of an apparent horizontal unit vector, or null if behind. */
function project(h) {
  const Z = dot(h, V.F); if (Z < -0.9) return null;
  const k = 2 / (1 + Z) * V.scale;
  return [V.cx + dot(h, V.R) * k, V.cy - dot(h, V.U) * k, Z];
}
/** Inverse: screen point -> apparent horizontal unit vector. */
function unproject(x, y) {
  const px = (x - V.cx) / V.scale, py = -(y - V.cy) / V.scale, rho = Math.hypot(px, py), c = 2 * Math.atan(rho / 2);
  if (rho < 1e-9) return V.F.slice();
  const s = Math.sin(c) / rho, cc = Math.cos(c);
  return normz([cc * V.F[0] + s * (px * V.R[0] + py * V.U[0]), cc * V.F[1] + s * (px * V.R[1] + py * V.U[1]), cc * V.F[2] + s * (px * V.R[2] + py * V.U[2])]);
}
/** True horizontal vector -> apparent (refracted) { h, alt, az(rad) }. */
function apparent(h) {
  const alt = Math.asin(clamp(h[2], -1, 1)) * R2D, az = Math.atan2(h[0], h[1]);
  if (!S.layers.atm) return { h, alt, az: az < 0 ? az + TAU : az };
  const a2 = alt + A.refractionFromTrue(alt), c = Math.cos(a2 * D2R);
  return { h: [c * Math.sin(az), c * Math.cos(az), Math.sin(a2 * D2R)], alt: a2, az: az < 0 ? az + TAU : az };
}
const aboveGround = (alt, az) => !S.layers.ground || alt >= ridge(az);

function computeSky() {
  const jd = A.julianDay(S.ms);
  const P = A.precessionMatrix(jd);
  const M = A.horizontalMatrix(jd, S.lat, S.lon, P);
  const Md = A.horizontalMatrix(jd, S.lat, S.lon, I3);
  const bodies = {};
  for (const id of ["sun", "moon", ...A.PLANETS]) {
    const b = A.body(id, jd);
    let h = A.mulMV(M, b.v);
    if (id === "moon") {             // topocentric parallax lowers the Moon by up to ~1 degree
      const alt = Math.asin(h[2]) * R2D, p = A.moonParallaxAlt(alt, b.au * 149597870.7), az = Math.atan2(h[0], h[1]), a2 = (alt - p) * D2R;
      h = [Math.cos(a2) * Math.sin(az), Math.cos(a2) * Math.cos(az), Math.sin(a2)];
    }
    b.hTrue = h; b.app = apparent(h);
    bodies[id] = b;
  }
  const sunAlt = bodies.sun.app.alt, moon = bodies.moon;
  const nightLim = BORTLE[S.bortle - 1][0];
  let tw;
  if (sunAlt >= 0) tw = -1.0 - sunAlt / 4;
  else if (sunAlt >= -6) tw = lerp(-1.0, 2.8, -sunAlt / 6);
  else if (sunAlt >= -12) tw = lerp(2.8, 5.0, (-sunAlt - 6) / 6);
  else if (sunAlt >= -18) tw = lerp(5.0, nightLim + 0.3, (-sunAlt - 12) / 6);
  else tw = 99;
  const moonPen = 1.8 * Math.pow(moon.illum, 1.5) * smooth(-2, 25, moon.app.alt);
  const lim = S.layers.atm ? Math.min(nightLim - moonPen, tw) : 7.5;
  SKY = { jd, P, M, Md, bodies, sunAlt, lim, lst: A.lst(jd, S.lon), dayAmt: S.layers.atm ? smooth(-6, 6, sunAlt) : 0,
    mwVis: S.layers.atm ? smooth(4.9, 6.9, lim) : 1 };
  return SKY;
}

/* ------------------------------------------------------------------ frame --- */
let lastT = performance.now(), tSec = 0, infoTimer = 0, uiTimer = 0, lastTonightKey = "", lastTrackKey = "";
const inertia = { vaz: 0, valt: 0, active: false };
const perf = { overlay: 0, frames: 0, bake: 0 };
const MIN_FRAME_MS = url.has("fps") ? 1000 / clamp(+url.get("fps") || 60, 0.5, 120) : 0;   // test hook: cap the frame rate
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) { lastT = now; return; }
  if (MIN_FRAME_MS && now - lastT < MIN_FRAME_MS) return;
  const rawDt = (now - lastT) / 1000;
  const dt = Math.min(0.1, rawDt); lastT = now; tSec += dt;
  // adaptive resolution: if the sky shader is too slow on this device, render it at fewer pixels
  if (rawDt > 0.05 && !MIN_FRAME_MS) { V.slow += rawDt > 0.2 ? 8 : 1; if (V.slow > 20 && V.glr > 0.5) { V.glr = Math.max(0.5, V.glr - 0.25); V.slow = 0; renderer.setPixelRatio(V.glr); renderer.setSize(V.W, V.H); } }
  else if (V.slow > 0) V.slow--;
  if (S.playing) S.ms += Math.min(rawDt, 1) * 1000 * S.speed * S.dir;
  if (S.follow && !drag.active) { S.follow(); }
  if (inertia.active && !drag.active) {
    S.view.az += inertia.vaz * dt; S.view.alt += inertia.valt * dt;
    const k = Math.pow(0.02, dt); inertia.vaz *= k; inertia.valt *= k;
    if (Math.abs(inertia.vaz) + Math.abs(inertia.valt) < 0.05) inertia.active = false;
  }
  updateView();
  computeSky();
  renderGL();
  const t0 = performance.now(); drawOverlay(); perf.overlay = lerp(perf.overlay, performance.now() - t0, 0.1); perf.frames++;
  uiTimer += dt; infoTimer += dt;
  if (uiTimer > 0.25) { uiTimer = 0; updateClockUI(); }
  if (infoTimer > 0.5 && S.sel) { infoTimer = 0; renderInfo(false); }
}

function renderGL() {
  const u = bgMat.uniforms, su = starMat.uniforms, dpr = V.glr;
  u.uRes.value.set(V.W * dpr, V.H * dpr);
  u.uScale.value = V.scale * dpr;
  u.uR.value.set(...V.R); u.uU.value.set(...V.U); u.uF.value.set(...V.F);
  u.uAtm.value = S.layers.atm ? 1 : 0; u.uGroundOn.value = S.layers.ground ? 1 : 0;
  const M = SKY.M;
  // horizontal -> galactic = EQ_TO_GAL . M^T   (Matrix3.set takes row-major)
  const HG = A.mulMM(A.EQ_TO_GAL, A.transpose(M));
  u.uHG.value.set(...HG);
  const sun = SKY.bodies.sun.app, moon = SKY.bodies.moon.app;
  u.uSun.value.set(...sun.h); u.uSunAlt.value = sun.alt;
  u.uMoon.value.set(...moon.h); u.uMoonAlt.value = moon.alt; u.uMoonIllum.value = SKY.bodies.moon.illum;
  u.uLP.value = [0, 0.02, 0.06, 0.12, 0.22, 0.36, 0.52, 0.72, 0.92][S.bortle - 1];
  u.uMWVis.value = CAT.mwReady ? SKY.mwVis * (reduce ? 1 : smooth(0, 1200, performance.now() - CAT.mwT)) : 0;
  u.uTime.value = tSec;
  su.uM.value.set(...M);
  su.uLim.value = SKY.lim; su.uTime.value = tSec; su.uTw.value = S.layers.twinkle && !reduce ? 1 : 0;
  su.uPx.value = Math.max(dpr, 0.85); su.uZoomK.value = clamp(Math.pow(90 / S.view.fov, 0.28), 0.85, 1.7); su.uDay.value = SKY.dayAmt;
  const pos = planetGeo.attributes.position, mag = planetGeo.attributes.aMag;
  A.PLANETS.forEach((id, i) => { const b = SKY.bodies[id]; pos.setXYZ(i, b.v[0], b.v[1], b.v[2]); mag.setX(i, b.mag); });
  pos.needsUpdate = true; mag.needsUpdate = true;
  renderer.render(scene, cam);
}

/* ---------------------------------------------------------------- overlay --- */
const FONT_B = '"Inter", system-ui, sans-serif', FONT_D = '"Space Grotesk", "Inter", system-ui, sans-serif', FONT_M = '"JetBrains Mono", ui-monospace, monospace';
let labelBoxes = [];
function placeLabel(x, y, w, h) {
  for (const b of labelBoxes) if (x < b[0] + b[2] && x + w > b[0] && y < b[1] + b[3] && y + h > b[1]) return false;
  labelBoxes.push([x, y, w, h]); return true;
}
function inView(p, m = 40) { return p && p[0] > -m && p[0] < V.W + m && p[1] > -m && p[1] < V.H + m; }

function strokeRun(vecs, M, useRefr = true) {
  // vecs: array of J2000 (or date/horizontal if M = I3) vectors; draws with ground clipping
  let prev = null, prevOk = false, prevA = null;
  for (let i = 0; i < vecs.length; i++) {
    const h = M ? A.mulMV(M, vecs[i]) : vecs[i];
    const a = useRefr ? apparent(h) : { h, alt: Math.asin(clamp(h[2], -1, 1)) * R2D, az: A.wrap360(Math.atan2(h[0], h[1]) * R2D) * D2R };
    const ok = aboveGround(a.alt, a.az);
    const p = project(a.h);
    if (p && prev && (ok || prevOk)) {
      if (Math.hypot(p[0] - prev[0], p[1] - prev[1]) < V.W) {
        if (ok && prevOk) { ctx.moveTo(prev[0], prev[1]); ctx.lineTo(p[0], p[1]); }
        else {                                                  // clip at the horizon profile
          const d0 = prevA.alt - ridge(prevA.az), d1 = a.alt - ridge(a.az);
          const t = clamp(d0 / (d0 - d1), 0, 1), q = [lerp(prev[0], p[0], t), lerp(prev[1], p[1], t)];
          if (prevOk) { ctx.moveTo(prev[0], prev[1]); ctx.lineTo(q[0], q[1]); } else { ctx.moveTo(q[0], q[1]); ctx.lineTo(p[0], p[1]); }
        }
      }
    }
    prev = p; prevOk = ok; prevA = a;
  }
}
function vecAppScreen(v, M) {  // J2000 vector -> { p, a } with apparent altitude
  const a = apparent(A.mulMV(M || SKY.M, v));
  return { a, p: project(a.h), up: aboveGround(a.alt, a.az) };
}

function drawOverlay() {
  const dpr = V.dpr, fov = S.view.fov, M = SKY.M, day = SKY.dayAmt;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, V.W, V.H);
  labelBoxes = [];
  const lineK = 1 - 0.55 * day;
  ctx.lineCap = "round"; ctx.lineJoin = "round";

  // grids
  if (S.layers.azGrid) {
    ctx.beginPath(); ctx.strokeStyle = `rgba(110,220,170,${0.22 * lineK})`; ctx.lineWidth = 1;
    for (let alt = 0; alt < 90; alt += 10) { const run = []; for (let az = 0; az <= 360; az += 2) run.push(A.altAzToVec(alt, az)); strokeRun(run, null, false); }
    for (let az = 0; az < 360; az += 15) { const run = []; for (let alt = -10; alt <= 90; alt += 2) run.push(A.altAzToVec(Math.min(alt, 89.9), az)); strokeRun(run, null, false); }
    ctx.stroke();
    ctx.font = `500 10px ${FONT_M}`; ctx.fillStyle = `rgba(110,220,170,${0.6 * lineK})`; ctx.textAlign = "left";
    for (let alt = 10; alt < 90; alt += 10) { const p = project(A.altAzToVec(alt, S.view.az + 2)); if (inView(p, 0)) ctx.fillText(alt + "°", p[0] + 3, p[1] - 3); }
  }
  if (S.layers.eqGrid) {
    ctx.beginPath(); ctx.strokeStyle = `rgba(124,170,255,${0.2 * lineK})`; ctx.lineWidth = 1;
    for (let dec = -80; dec <= 80; dec += 10) { const run = []; for (let ra = 0; ra <= 360; ra += 3) run.push(A.raDecToVec(ra, dec)); strokeRun(run, SKY.Md); }
    for (let ra = 0; ra < 360; ra += 15) { const run = []; for (let dec = -88; dec <= 88; dec += 3) run.push(A.raDecToVec(ra, dec)); strokeRun(run, SKY.Md); }
    ctx.stroke();
    ctx.beginPath(); ctx.strokeStyle = `rgba(124,170,255,${0.45 * lineK})`; ctx.lineWidth = 1.4;   // celestial equator
    { const run = []; for (let ra = 0; ra <= 360; ra += 2) run.push(A.raDecToVec(ra, 0)); strokeRun(run, SKY.Md); }
    ctx.stroke();
    ctx.font = `500 10px ${FONT_M}`; ctx.fillStyle = `rgba(124,170,255,${0.65 * lineK})`;
    for (let ra = 0; ra < 360; ra += 15) { const s = vecAppScreen(A.raDecToVec(ra, 0), SKY.Md); if (s.up && inView(s.p, 0)) ctx.fillText(ra / 15 + "h", s.p[0] + 3, s.p[1] - 3); }
  }
  if (S.layers.ecliptic) {
    ctx.beginPath(); ctx.strokeStyle = `rgba(255,194,75,${0.42 * lineK})`; ctx.lineWidth = 1.1; ctx.setLineDash([6, 5]);
    strokeRun(CAT.ecliptic, M); ctx.stroke(); ctx.setLineDash([]);
  }
  // constellation boundaries
  if (S.layers.bounds) {
    ctx.beginPath(); ctx.strokeStyle = `rgba(255,170,110,${0.26 * lineK})`; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
    for (const b of CAT.borderLines) strokeRun(b.v, M);
    ctx.stroke(); ctx.setLineDash([]);
  }
  // constellation figures
  const selCon = S.sel && (S.sel.kind === "con" ? S.sel.id : S.sel.con);
  if (S.layers.lines || selCon) {
    ctx.beginPath(); ctx.strokeStyle = `rgba(110,165,255,${0.36 * lineK})`; ctx.lineWidth = fov < 50 ? 1.3 : 1.05;
    if (S.layers.lines) CAT.conLines.forEach((run, i) => { if (CAT.conLineIds[i] !== selCon) strokeRun(run, M); });
    ctx.stroke();
    if (selCon) {
      ctx.beginPath(); ctx.strokeStyle = `rgba(160,215,255,${0.85 * (1 - 0.3 * day)})`; ctx.lineWidth = 1.7;
      CAT.conLines.forEach((run, i) => { if (CAT.conLineIds[i] === selCon) strokeRun(run, M); });
      ctx.shadowColor = "rgba(124,200,255,.8)"; ctx.shadowBlur = 8; ctx.stroke(); ctx.shadowBlur = 0;
    }
  }
  // Moon and Sun (drawn before labels so labels stay readable)
  drawSun(SKY.bodies.sun);
  drawMoon(SKY.bodies.moon);

  // planet labels
  if (S.layers.planets) {
    for (const id of A.PLANETS) {
      const b = SKY.bodies[id], a = b.app;
      if (!aboveGround(a.alt, a.az)) continue;
      const p = project(a.h); if (!inView(p, 0)) continue;
      const m = b.mag + 0.25 * (A.airmass(b.app.alt) - 1);
      if (m > SKY.lim + 1.5 && fov > 40) continue;
      label(A.BODY_NAMES[id], p[0] + 9, p[1] - 8, hexOf(PLANET_COL[id]), `600 12.5px ${FONT_B}`, true);
    }
  }
  // star names
  if (S.layers.starNames) {
    const magCut = fov > 140 ? 1.3 : fov > 100 ? 1.7 : fov > 55 ? 2.1 : fov > 30 ? 2.9 : 4.2;
    ctx.font = `500 11px ${FONT_B}`;
    for (const [s, i] of CAT.named) {
      if (s[3] > magCut) break;
      const r = vecAppScreen(starVecAt(i), M);
      if (!r.up || !inView(r.p, 0)) continue;
      const m = s[3] + (S.layers.atm ? 0.25 * (A.airmass(r.a.alt) - 1) : 0);
      if (m > SKY.lim - 0.2) continue;
      label(CAT.names[s[0]].name, r.p[0] + 6 + Math.max(0, 1.5 - s[3]) * 1.5, r.p[1] - 5, `rgba(214,226,255,${0.78 * (1 - 0.2 * day)})`, `500 11px ${FONT_B}`);
    }
  }
  // constellation names
  if (S.layers.names) {
    const size = fov > 120 ? 10 : fov > 60 ? 11 : 13;
    for (const [id, c] of Object.entries(CAT.cons)) {
      if (fov > 150 && +c.rank > 2) continue;
      const r = vecAppScreen(A.raDecToVec(c.ra, c.dec), M);
      if (!r.up || !inView(r.p, -10)) continue;
      const sel = id === selCon;
      ctx.save();
      if ("letterSpacing" in ctx) ctx.letterSpacing = "2.5px";
      label(c.name.toUpperCase(), r.p[0], r.p[1], sel ? "rgba(190,225,255,.95)" : `rgba(130,175,255,${0.5 * lineK})`, `600 ${size}px ${FONT_D}`, false, "center");
      ctx.restore();
    }
  }
  // Messier objects
  if (S.layers.messier) {
    for (const o of CAT.messier) {
      const r = vecAppScreen(o.v, M);
      if (!r.up || !inView(r.p, 0)) continue;
      if (fov > 120 && o.mag > 6.5) continue;
      drawDSO(r.p[0], r.p[1], o.type, `rgba(200,160,255,${0.75 * lineK})`);
      if (fov < 130 || o.mag < 5) label(o.id, r.p[0] + 7, r.p[1] + 11, `rgba(200,170,255,${0.8 * lineK})`, `600 10px ${FONT_M}`);
    }
  }
  drawCardinals();
  drawSelection();
  if (S.hover && (!S.sel || S.hover.key !== S.sel.key)) {
    const r = targetScreen(S.hover);
    if (r && r.p) { ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(r.p[0], r.p[1], 10, 0, TAU); ctx.stroke(); label(S.hover.name, r.p[0] + 13, r.p[1] + 4, "#fff", `600 12px ${FONT_B}`, true); }
  }
}
function label(text, x, y, color, font, force = false, align = "left") {
  ctx.font = font; ctx.textAlign = align;
  const w = ctx.measureText(text).width, h = 13;
  const bx = align === "center" ? x - w / 2 : x;
  if (!placeLabel(bx - 2, y - h + 2, w + 4, h + 2) && !force) return false;
  ctx.lineWidth = 3; ctx.strokeStyle = "rgba(2,3,10,.7)"; ctx.strokeText(text, x, y);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
  return true;
}
function drawDSO(x, y, type, col) {
  ctx.strokeStyle = col; ctx.lineWidth = 1.1; ctx.beginPath();
  if (type === "s" || type === "e" || type === "i") ctx.ellipse(x, y, 7, 3.5, -0.5, 0, TAU);
  else if (type === "gc") { ctx.arc(x, y, 5, 0, TAU); ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5); }
  else if (type === "oc" || type === "pos") { ctx.setLineDash([2, 2]); ctx.arc(x, y, 6, 0, TAU); }
  else if (type === "pn") { ctx.arc(x, y, 3.5, 0, TAU); ctx.moveTo(x + 7, y); ctx.lineTo(x + 3.5, y); ctx.moveTo(x - 7, y); ctx.lineTo(x - 3.5, y); }
  else ctx.rect(x - 5, y - 5, 10, 10);
  ctx.stroke(); ctx.setLineDash([]);
}
function drawCardinals() {
  if (!S.layers.ground) {
    ctx.beginPath(); ctx.strokeStyle = "rgba(255,150,90,.55)"; ctx.lineWidth = 1.2;
    const run = []; for (let az = 0; az <= 360; az += 2) run.push(A.altAzToVec(0, az)); strokeRun(run, null, false); ctx.stroke();
  }
  const pts = [["N", 0], ["NE", 45], ["E", 90], ["SE", 135], ["S", 180], ["SW", 225], ["W", 270], ["NW", 315]];
  for (const [t, az] of pts) {
    const p = project(A.altAzToVec(0, az)); if (!inView(p, 0)) continue;
    const main = t.length === 1;
    ctx.font = main ? `700 ${S.view.fov > 120 ? 15 : 17}px ${FONT_D}` : `600 11px ${FONT_D}`; ctx.textAlign = "center";
    ctx.fillStyle = t === "N" ? "rgba(255,122,61,.95)" : main ? "rgba(233,237,255,.85)" : "rgba(195,202,230,.55)";
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.strokeText(t, p[0], p[1] + (main ? 22 : 18)); ctx.fillText(t, p[0], p[1] + (main ? 22 : 18));
  }
}
function screenAngleToward(v, w) {  // screen angle (radians, canvas convention) from J2000 v toward w
  const t = normz([w[0] - v[0] * dot(v, w), w[1] - v[1] * dot(v, w), w[2] - v[2] * dot(v, w)]);
  const q = normz([v[0] + t[0] * 0.01, v[1] + t[1] * 0.01, v[2] + t[2] * 0.01]);
  const a = project(apparent(A.mulMV(SKY.M, v)).h), b = project(apparent(A.mulMV(SKY.M, q)).h);
  if (!a || !b) return 0;
  return Math.atan2(b[1] - a[1], b[0] - a[0]);
}
function drawMoon(b) {
  const a = b.app; if (!aboveGround(a.alt + 0.3, a.az)) return;
  const p = project(a.h); if (!inView(p, 60)) return;
  const trueR = b.diam / 2 / 3600 * D2R * V.scale;
  const r = Math.max(trueR, 7.5);
  const night = 1 - SKY.dayAmt;
  const sunDir = screenAngleToward(b.v, SKY.bodies.sun.v);
  const northDir = screenAngleToward(b.v, [0, 0, 1]);
  const i = b.phaseAngle * D2R;
  ctx.save(); ctx.translate(p[0], p[1]);
  // glow (brighter when full, washed out in daylight)
  const glowR = r * (3 + 5 * b.illum);
  const gg = ctx.createRadialGradient(0, 0, r * 0.8, 0, 0, glowR);
  gg.addColorStop(0, `rgba(235,240,255,${0.28 * b.illum * (0.3 + 0.7 * night)})`); gg.addColorStop(1, "rgba(235,240,255,0)");
  ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(0, 0, glowR, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.clip();
  if (night > 0.05) {            // the dark limb hides the stars behind it; earthshine faintly shows the disc
    ctx.globalAlpha = night * 0.96; ctx.fillStyle = "#07090f"; ctx.fillRect(-r, -r, 2 * r, 2 * r);
    ctx.globalAlpha = night * 0.1; drawMoonTex(r, northDir);
  }
  ctx.globalAlpha = 1;
  // lit part: limb semicircle toward the Sun + terminator half-ellipse
  ctx.rotate(sunDir);
  ctx.beginPath();
  for (let k = 0; k <= 48; k++) { const t = -Math.PI / 2 + Math.PI * k / 48; ctx.lineTo(r * Math.cos(t), r * Math.sin(t)); }
  for (let k = 0; k <= 48; k++) { const t = Math.PI / 2 - Math.PI * k / 48; ctx.lineTo(-r * Math.cos(i) * Math.cos(t), r * Math.sin(t)); }
  ctx.closePath(); ctx.rotate(-sunDir); ctx.clip();
  ctx.globalAlpha = 0.55 + 0.45 * night; drawMoonTex(r, northDir);
  ctx.restore();
  if (!(S.sel && S.sel.kind === "body" && S.sel.id === "moon")) label("Moon", p[0] + r + 6, p[1] + 4, "rgba(240,240,250,.9)", `600 12.5px ${FONT_B}`, true);
}
function drawMoonTex(r, northDir) {
  ctx.save(); ctx.rotate(northDir + Math.PI / 2);
  ctx.drawImage(moonTex, -r, -r, 2 * r, 2 * r);
  ctx.restore();
}
function drawSun(b) {
  const a = b.app; if (!aboveGround(a.alt + 0.3, a.az)) return;
  const p = project(a.h); if (!inView(p, 200)) return;
  const r = Math.max(b.diam / 2 / 3600 * D2R * V.scale, 6);
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  const low = smooth(12, 0, a.alt);
  const g = ctx.createRadialGradient(p[0], p[1], r * 0.5, p[0], p[1], r * 14);
  g.addColorStop(0, `rgba(255,${240 - 60 * low},${200 - 120 * low},.75)`); g.addColorStop(0.15, `rgba(255,${210 - 70 * low},${150 - 90 * low},.25)`); g.addColorStop(1, "rgba(255,200,150,0)");
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], r * 14, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = `rgb(255,${250 - 50 * low},${235 - 110 * low})`; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, TAU); ctx.fill();
  ctx.restore();
  label("Sun", p[0] + r + 8, p[1] + 4, "rgba(255,236,190,.95)", `600 12.5px ${FONT_B}`, true);
}

/* --------------------------------------------------------- targets / picking --- */
function targetVec(t, jd) {
  if (t.kind === "body") return (jd == null ? SKY.bodies[t.id] : A.body(t.id, jd)).v;
  return t.v;
}
function targetScreen(t) {
  let a;
  if (t.kind === "body") a = SKY.bodies[t.id].app;
  else a = apparent(A.mulMV(SKY.M, t.v));
  return { a, p: project(a.h), up: aboveGround(a.alt, a.az), below: a.alt < (S.layers.ground ? ridge(a.az) : 0) };
}
function pick(x, y, radius = 14) {
  let best = null, bestS = 1e9;
  const consider = (t, p, s) => { if (s < bestS) { bestS = s; best = t; } };
  const M = SKY.M;
  for (const id of ["sun", "moon", ...A.PLANETS]) {
    const b = SKY.bodies[id]; if (!aboveGround(b.app.alt, b.app.az)) continue;
    const p = project(b.app.h); if (!p) continue;
    const rr = id === "moon" || id === "sun" ? Math.max(b.diam / 2 / 3600 * D2R * V.scale, 8) + 6 : radius;
    const d = Math.hypot(p[0] - x, p[1] - y);
    if (d < rr) consider(bodyTarget(id), p, d - 20);
  }
  for (let i = 0; i < CAT.stars.length; i++) {
    const s = CAT.stars[i];
    const v = [CAT.starVec[i * 3], CAT.starVec[i * 3 + 1], CAT.starVec[i * 3 + 2]];
    const h = A.mulMV(M, v);
    const Z = dot(h, V.F); if (Z < 0) continue;
    const k = 2 / (1 + Z) * V.scale, sx = V.cx + dot(h, V.R) * k, sy = V.cy - dot(h, V.U) * k;
    if (Math.abs(sx - x) > radius + 4 || Math.abs(sy - y) > radius + 4) continue;
    const a = apparent(h); if (!aboveGround(a.alt, a.az)) continue;
    const m = s[3] + 0.25 * (A.airmass(a.alt) - 1); if (m > SKY.lim + 0.3) continue;
    const p = project(a.h), d = Math.hypot(p[0] - x, p[1] - y);
    if (d < radius) consider(starTarget(i), p, d + m * 1.6);
  }
  if (S.layers.messier) for (const o of CAT.messier) {
    const r = vecAppScreen(o.v, M); if (!r.up || !r.p) continue;
    const d = Math.hypot(r.p[0] - x, r.p[1] - y); if (d < radius) consider(messierTarget(o), r.p, d + 4);
  }
  return best;
}
function conAtScreen(x, y) {
  const h = unproject(x, y);
  const alt = Math.asin(clamp(h[2], -1, 1)) * R2D, az = Math.atan2(h[0], h[1]);
  if (!aboveGround(alt, az < 0 ? az + TAU : az)) return null;
  const altT = alt - (S.layers.atm ? A.refractionFromApparent(alt) : 0), c = Math.cos(altT * D2R);
  const hT = [c * Math.sin(az), c * Math.cos(az), Math.sin(altT * D2R)];
  const v = A.mulMV(A.transpose(SKY.M), hT);
  const id = constellationOf(v);
  return id ? conTarget(id) : null;
}
function bodyTarget(id) { return { kind: "body", id, key: "b:" + id, name: A.BODY_NAMES[id] }; }
function starTarget(i) {
  const s = CAT.stars[i], nm = CAT.names[s[0]];
  const t = { kind: "star", i, hip: s[0], key: "s:" + s[0], v: starVecAt(i), mag: s[3], bv: s[4] };
  t.con = conOfStar(i);
  t.name = nm && nm.name ? nm.name : nm && nm.bayer ? `${nm.bayer} ${CAT.cons[nm.c] ? CAT.cons[nm.c].gen : nm.c}` : `HIP ${s[0]}`;
  return t;
}
function messierTarget(o) { return { kind: "messier", id: o.id, key: "m:" + o.id, name: o.alt ? `${o.id} · ${o.alt.replace("´", "'")}` : o.id, v: o.v, o, con: constellationOf(o.v) }; }
function conTarget(id) { const c = CAT.cons[id]; return { kind: "con", id, key: "c:" + id, name: c.name, v: A.raDecToVec(c.ra, c.dec) }; }

/* ----------------------------------------------------------------- selection --- */
function drawSelection() {
  if (!S.sel) return;
  const r = targetScreen(S.sel);
  const t = tSec;
  if (r.p && inView(r.p, -24) && r.p[2] > -0.5) {
    const [x, y] = r.p;
    let R = 14;
    if (S.sel.kind === "body" && (S.sel.id === "moon" || S.sel.id === "sun")) R = Math.max(SKY.bodies[S.sel.id].diam / 2 / 3600 * D2R * V.scale, 8) + 9;
    if (S.sel.kind === "con") R = 0;
    if (R) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(reduce ? 0 : t * 0.4);
      ctx.strokeStyle = r.below ? "rgba(255,122,61,.9)" : "rgba(124,200,255,.95)"; ctx.lineWidth = 1.6;
      ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 8;
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(0, 0, R, k * Math.PI / 2 + 0.25, k * Math.PI / 2 + 1.2); ctx.stroke(); }
      if (r.below) { ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(0, 0, R + 5, 0, TAU); ctx.stroke(); }
      ctx.restore();
    }
    if (r.below) {
      const txt = `${S.sel.name} · below the horizon`;
      label(txt, x + R + 8, y + 4, "rgba(255,160,110,.95)", `600 12px ${FONT_B}`, true);
      drawArrow(x, Math.min(y - R - 34, V.H - 20), Math.PI / 2, "rgba(255,122,61,.95)");
    } else if (S.sel.kind !== "body" || !["moon", "sun"].includes(S.sel.id)) label(S.sel.name, x + R + 8, y + 4, "#fff", `600 13px ${FONT_B}`, true);
  } else {
    // off screen: an arrow at the edge pointing toward it
    const h = r.a.h, px = dot(h, V.R), py = dot(h, V.U);
    const ang = Math.atan2(-py, px), m = 46;
    const ex = V.cx + Math.cos(ang) * (V.W / 2 - m), ey = V.cy + Math.sin(ang) * (V.H / 2 - m);
    const x = clamp(ex, m, V.W - m), y = clamp(ey, m + 60, V.H - m);
    drawArrow(x, y, ang, r.below ? "rgba(255,122,61,.95)" : "rgba(124,200,255,.95)");
    label(S.sel.name + (r.below ? " (below horizon)" : ""), x + (Math.cos(ang) > 0 ? -12 : 12), y - 14, "#fff", `600 12px ${FONT_B}`, true, Math.cos(ang) > 0 ? "right" : "left");
  }
}
function drawArrow(x, y, ang, col) {
  const bob = reduce ? 0 : Math.sin(tSec * 4) * 3;
  ctx.save(); ctx.translate(x + Math.cos(ang) * bob, y + Math.sin(ang) * bob); ctx.rotate(ang);
  ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -10); ctx.lineTo(-3, 0); ctx.lineTo(-8, 10); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function choose(t, opt = {}) {
  S.sel = t; S.hover = null;
  $("#info").hidden = false;
  document.body.classList.add("sky-has-info");
  renderInfo(true);
  if (opt.fly !== false) flyTo(t);
  updateLearnSel();
}
function flyTo(t) {
  const r = targetScreen(t);
  let az = r.a.az * R2D, alt = r.a.alt;
  const hidden = r.below;
  let fov = S.view.fov;
  if (t.kind === "con") fov = clamp(Math.max(fov, 60), 60, 100);
  else if (fov > 120) fov = 90;
  if (hidden) alt = clamp(alt, 8, 25) + fov * 0.12;
  else alt = clamp(alt, -10, 90);
  const cur = { ...S.view };
  const daz = A.wrap180(az - cur.az);
  const target = { az: cur.az + daz, alt, fov };
  if (window.gsap && !reduce) { gsap.killTweensOf(S.view); gsap.to(S.view, { ...target, duration: 1.4, ease: "power3.inOut" }); }
  else Object.assign(S.view, target);
  inertia.active = false;
  if (hidden) toast(`${t.name} is below the horizon right now`);
}
function closeInfo() { S.sel = null; $("#info").hidden = true; document.body.classList.remove("sky-has-info"); updateLearnSel(); }

/* ------------------------------------------------------------ info card --- */
const rstCache = new Map();
function rst(t) {
  const mid = localMidnight(S.ms), key = `${t.key}|${mid}|${S.lat}|${S.lon}`;
  if (rstCache.has(key)) return rstCache.get(key);
  const jd0 = A.julianDay(mid);
  const target = t.kind === "body" ? t.id : t.v;
  const h0 = t.kind === "body" ? null : -0.5667;
  const all = A.riseSetTransit(target, jd0, S.lat, S.lon, h0, 2, t.kind === "body" && t.id === "moon" ? 1 / 96 : 1 / 48);
  // today's rise, then the set and culmination that follow it (which may fall after midnight)
  const rise = all.rises.find(j => j < jd0 + 1);
  const from = rise != null ? rise : jd0;
  const set = all.sets.find(j => j > from && (rise != null || j < jd0 + 1));
  const tr = all.transits.find(x => x.jd > from && (rise != null ? (set == null || x.jd < set) : x.jd < jd0 + 1));
  const up1 = all.alwaysUp, never1 = all.neverUp;
  const r = { rises: rise != null ? [rise] : [], sets: set != null ? [set] : [], transits: tr ? [tr] : [], alwaysUp: up1, neverUp: never1, jd0 };
  if (rstCache.size > 200) rstCache.clear();
  rstCache.set(key, r); return r;
}
function readout(k, v, wide) { return `<div class="readout${wide ? " wide" : ""}"><div class="k">${k}</div><div class="v">${v}</div></div>`; }
function renderInfo(full) {
  const t = S.sel; if (!t) return;
  const r = targetScreen(t), a = r.a;
  const altTxt = `${a.alt.toFixed(1)}°`, azTxt = `${(a.az * R2D).toFixed(1)}° ${compass(a.az * R2D)}`;
  const vJ = targetVec(t), rdJ = A.vecToRaDec(vJ), rdD = A.vecToRaDec(A.mulMV(SKY.P, vJ));
  let kind = "", sub = "", note = "", rows = [], swatch = "#fff", src = "";
  const conName = id => id && CAT.cons[id] ? CAT.cons[id].name : "—";
  const pos = [readout("Altitude", altTxt + (r.below ? " <small>below horizon</small>" : "")), readout("Azimuth", azTxt),
    readout("RA / Dec (J2000)", `${hms(rdJ.ra)}<br>${dms(rdJ.dec)}`, false), readout("RA / Dec (of date)", `${hms(rdD.ra)}<br>${dms(rdD.dec)}`, false)];
  if (t.kind === "star") {
    const s = CAT.stars[t.i], nm = CAT.names[s[0]], T = A.bvToTemp(s[4]);
    kind = s[3] < 1.5 ? "Bright star" : "Star";
    const bay = nm && nm.bayer ? `${nm.bayer} ${CAT.cons[nm.c] ? CAT.cons[nm.c].gen : nm.c} (${nm.bayer} ${nm.c})` : "";
    sub = [bay, `HIP ${s[0]}`].filter(Boolean).join(" · ");
    swatch = hexOf(starColor(s[4]));
    note = STAR_NOTES[s[0]] || "";
    rows = [readout("Magnitude", fmtMag(s[3])), readout("Colour index B−V", s[4].toFixed(2)),
      readout("Temperature", `≈ ${fmtNum(Math.round(T / 100) * 100)} K <small>class ${A.spectralClass(T)}</small>`), readout("Constellation", conName(t.con)), ...pos,
      readout("Air mass", a.alt > 0 ? A.airmass(a.alt).toFixed(2) : "—")];
    src = "Hipparcos catalogue via d3-celestial. Temperature from B−V (Ballesteros 2012); class is approximate.";
  } else if (t.kind === "messier") {
    const o = t.o;
    kind = MESSIER_TYPE[o.type] || "Deep-sky object"; sub = `Messier ${o.id.slice(1)} · in ${conName(t.con)}`;
    swatch = o.type === "s" || o.type === "e" || o.type === "i" ? "#d8b4ff" : o.type === "oc" || o.type === "gc" ? "#bfe3ff" : "#ff9fc6";
    note = MESSIER_NOTES[o.id] || "";
    rows = [readout("Magnitude", o.mag.toFixed(1)), readout("Size", `${o.dim}′`), ...pos];
    src = "Charles Messier's catalogue (1781) via d3-celestial.";
  } else if (t.kind === "con") {
    const c = CAT.cons[t.id];
    kind = "Constellation"; sub = `${t.id} · genitive ${c.gen}`;
    swatch = "#7cc8ff";
    const members = conMembers(t.id);
    const br = members[0];
    note = CON_NOTES[t.id] || "";
    rows = [readout("Stars to mag 6", members.length), readout("Brightest", br ? `${starTarget(br).name} <small>${fmtMag(CAT.stars[br][3])}</small>` : "—"),
      readout("Best evenings", bestMonth(c.ra)), readout("Centre alt / az", `${a.alt.toFixed(0)}° / ${compass(a.az * R2D)}`)];
    src = "International Astronomical Union (IAU) boundaries and figures via d3-celestial.";
  } else if (t.kind === "body") {
    const b = SKY.bodies[t.id];
    swatch = t.id === "moon" ? "moon" : t.id === "sun" ? "#ffe6a8" : hexOf(PLANET_COL[t.id]);
    const conId = constellationOf(b.v);
    if (t.id === "sun") {
      kind = "Our star"; sub = `in ${conName(conId)}`;
      note = "<b>Never look at the Sun directly or through binoculars or a telescope.</b> Its light left it " + (b.lightSeconds / 60).toFixed(1) + " minutes ago.";
      rows = [readout("Magnitude", "−26.7"), readout("Distance", `${b.au.toFixed(4)} AU`), readout("Apparent size", `${(b.diam / 60).toFixed(1)}′`), readout("Light-time", `${(b.lightSeconds / 60).toFixed(2)} min`), ...pos];
    } else if (t.id === "moon") {
      const ph = A.moonPhase(SKY.jd);
      kind = "Moon"; sub = `${ph.name} · in ${conName(conId)}`;
      const nx = nextPhases(SKY.jd);
      note = `${(ph.illum * 100).toFixed(0)}% lit, ${ph.ageDays.toFixed(1)} days after new Moon. Next full Moon ${nx.full}, next new Moon ${nx.nw}.` + (b.diam / 2 / 3600 * D2R * V.scale < 7.5 ? " Drawn enlarged; its true size is about half a degree." : "");
      rows = [readout("Illuminated", `${(ph.illum * 100).toFixed(1)}%`), readout("Phase angle", `${ph.phaseAngle.toFixed(1)}°`),
        readout("Distance", `${fmtNum(Math.round(ph.distKm))} km`), readout("Apparent size", `${(b.diam / 60).toFixed(1)}′`),
        readout("Magnitude", fmtMag(b.mag)), readout("Light-time", `${b.lightSeconds.toFixed(2)} s`), ...pos];
      src = "Moon: Astronomical Almanac low-precision series (about 0.3°), with topocentric parallax.";
    } else {
      kind = "Planet"; sub = `in ${conName(conId)} · ${b.elong.toFixed(0)}° ${elongSide(b)} of the Sun`;
      const lt = b.lightSeconds;
      note = planetNote(t.id, b);
      rows = [readout("Magnitude", fmtMag(b.mag)), readout("Illuminated", `${(b.illum * 100).toFixed(1)}%`),
        readout("Distance", `${b.au.toFixed(3)} AU <small>${fmtNum(b.au * 149.5978707, 0)} million km</small>`, true),
        readout("Light-time", lt > 3600 ? `${Math.floor(lt / 3600)} h ${Math.round(lt % 3600 / 60)} min` : `${(lt / 60).toFixed(1)} min`),
        readout("Apparent size", `${b.diam.toFixed(1)}″`), ...pos];
      if (t.id === "saturn") rows.splice(5, 0, readout("Ring tilt", `${A.saturnRingTilt(b.v).toFixed(1)}°`));
      src = "Positions: JPL Keplerian elements (Standish), light-time corrected. Magnitudes: Astronomical Almanac formulae (Meeus ch. 41).";
    }
  }
  if (full) {
    $("#infoKind").textContent = kind; $("#infoName").textContent = t.name; $("#infoSub").innerHTML = esc(sub);
    const sw = $("#infoSwatch");
    if (swatch === "moon") { sw.classList.add("has-canvas"); sw.innerHTML = ""; sw.appendChild(moonIcon(A.moonPhase(SKY.jd), 88)); }
    else { sw.classList.remove("has-canvas"); sw.innerHTML = ""; sw.style.setProperty("--c", swatch); }
    $("#infoNote").innerHTML = note; $("#infoNote").hidden = !note;
    $("#infoSrc").textContent = src;
  }
  $("#infoGrid").innerHTML = rows.join("");
  // rise / transit / set
  const rs = rst(t), el = $("#infoRst");
  const vDate = t.kind === "body" ? A.mulMV(SKY.P, targetVec(t)) : A.mulMV(SKY.P, t.v);
  const st = A.circumpolarState(A.vecToRaDec(vDate).dec, S.lat);
  const tr = A.bestTransit(rs);
  const trTxt = tr ? `${hmJD(tr.jd)}${nextDay(tr.jd, rs.jd0)}<small>${tr.alt.toFixed(0)}° high</small>` : "—";
  if (rs.alwaysUp || (t.kind !== "body" && st === "circumpolar")) el.className = "sky-info-rst", el.innerHTML = `<div><div class="k">Circumpolar</div><div class="v">never sets</div></div><div><div class="k">Highest</div><div class="v">${trTxt}</div></div><div><div class="k">Sets</div><div class="v">—<small>circumpolar</small></div></div>`;
  else if (rs.neverUp || (t.kind !== "body" && st === "never")) el.className = "sky-info-rst single", el.innerHTML = `<div><div class="k">From ${esc(S.place)}</div><div class="v">never rises today</div></div>`;
  else el.className = "sky-info-rst", el.innerHTML = `<div><div class="k">Rises</div><div class="v">${rs.rises.length ? hmJD(rs.rises[0]) : "—"}<small>${rs.rises.length ? compass(A.altAzOf(t.kind === "body" ? t.id : t.v, rs.rises[0], S.lat, S.lon).az) : "not today"}</small></div></div><div><div class="k">Highest</div><div class="v">${trTxt}</div></div><div><div class="k">Sets</div><div class="v">${rs.sets.length ? hmJD(rs.sets[0]) + nextDay(rs.sets[0], rs.jd0) : "—"}<small>${rs.sets.length ? compass(A.altAzOf(t.kind === "body" ? t.id : t.v, rs.sets[0], S.lat, S.lon).az) : "not today"}</small></div></div>`;
}
function elongSide(b) {
  const s = SKY.bodies.sun.v, v = b.v;
  const ls = Math.atan2(s[1] * Math.cos(23.4393 * D2R) + s[2] * Math.sin(23.4393 * D2R), s[0]), lv = Math.atan2(v[1] * Math.cos(23.4393 * D2R) + v[2] * Math.sin(23.4393 * D2R), v[0]);
  return A.wrap180((lv - ls) * R2D) > 0 ? "east" : "west";
}
function planetNote(id, b) {
  const e = b.elong, side = elongSide(b);
  const when = e < 15 ? "Too close to the Sun to see now." : side === "east" ? "East of the Sun: look for it in the evening sky." : "West of the Sun: it rises before the Sun, in the morning sky.";
  const facts = { mercury: "The smallest planet and the fastest, 88 days around the Sun.", venus: "The brightest planet, wrapped in clouds of sulfuric acid; it shows phases like the Moon.",
    mars: "The red planet: iron oxide dust over a cold desert.", jupiter: "The largest planet; binoculars show its four big moons.",
    saturn: "Its rings are 270,000 km across but only about 10 m thick; in 2025 they turned edge-on to Earth.", uranus: "An ice giant tipped on its side; at magnitude 5.7 it is just visible from a dark site.",
    neptune: "The outermost planet, found in 1846 by mathematics before it was seen; needs binoculars." };
  return `${facts[id]} ${when}`;
}
function conMembers(id) {
  const b = CAT.bounds.filter(x => x.id === id); const out = [];
  CAT.stars.forEach((s, i) => { const v = starVecAt(i); if (b.some(x => x.vs.some(q => dot(q, v) > 0.5) && A.inSphericalPolygon(v, x.poly))) out.push(i); });
  return out.sort((p, q) => CAT.stars[p][3] - CAT.stars[q][3]);
}
function bestMonth(ra) {
  // the month in which this RA crosses the meridian at about 21:00 local mean solar time
  let best = 0, bd = 999;
  for (let m = 0; m < 12; m++) {
    const ms = Date.UTC(2026, m, 15, 21) - S.lon / 15 * 3600e3;
    const d = Math.abs(A.wrap180(A.lst(A.julianDay(ms), S.lon) - ra));
    if (d < bd) { bd = d; best = m; }
  }
  return ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][best];
}
function nextPhases(jd) {
  const f = (j, target) => A.wrap180(A.moonPhase(j).elongLon - target);
  const find = target => {
    let a = jd, fa = f(a, target);
    for (let k = 1; k <= 32; k++) {
      const b = jd + k, fb = f(b, target);
      if (fa < 0 && fb >= 0 && fb - fa < 90) { let lo = a, hi = b; for (let n = 0; n < 30; n++) { const m = (lo + hi) / 2; if (f(m, target) < 0) lo = m; else hi = m; } return lo; }
      a = b; fa = fb;
    }
    return null;
  };
  const fmt = j => { if (j == null) return "—"; const ms = A.jdToMs(j), p = parts(ms); return `${p.wd} ${p.d} ${MONTHS[p.mo - 1]} ${pad(p.h)}:${pad(p.mi)}`; };
  return { full: fmt(find(180)), nw: fmt(find(0)) };
}
function moonIcon(ph, size = 68) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  const g = c.getContext("2d"), r = size / 2 - 2;
  g.translate(size / 2, size / 2);
  g.fillStyle = "#151924"; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  g.save(); g.beginPath(); g.arc(0, 0, r, 0, TAU); g.clip();
  const dir = ph.waxing ? 0 : Math.PI;   // northern-hemisphere view: waxing lit on the right
  const i = ph.phaseAngle * D2R;
  g.rotate(dir); g.beginPath();
  for (let k = 0; k <= 40; k++) { const t = -Math.PI / 2 + Math.PI * k / 40; g.lineTo(r * Math.cos(t), r * Math.sin(t)); }
  for (let k = 0; k <= 40; k++) { const t = Math.PI / 2 - Math.PI * k / 40; g.lineTo(-r * Math.cos(i) * Math.cos(t), r * Math.sin(t)); }
  g.closePath(); g.rotate(-dir); g.clip();
  g.drawImage(moonTex, -r, -r, 2 * r, 2 * r);
  g.restore();
  return c;
}

/* ------------------------------------------------------------------ search --- */
let INDEX = null;
const normS = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[´'’]/g, "'");
function buildIndex() {
  INDEX = [];
  for (const id of ["sun", "moon", ...A.PLANETS]) INDEX.push({ t: () => bodyTarget(id), name: A.BODY_NAMES[id], keys: [A.BODY_NAMES[id]], sub: id === "sun" ? "Star" : id === "moon" ? "Moon" : "Planet", col: id === "sun" ? "#ffe6a8" : id === "moon" ? "#e8e8f0" : hexOf(PLANET_COL[id]), pri: 0 });
  for (const [id, c] of Object.entries(CAT.cons)) INDEX.push({ t: () => conTarget(id), name: c.name, keys: [c.name, id, c.gen], sub: `Constellation · ${id}`, col: "#7cc8ff", shape: "ln", pri: 1 });
  CAT.stars.forEach((s, i) => {
    const nm = CAT.names[s[0]]; if (!nm) return;
    const g = nm.bayer ? (GREEK[nm.bayer[0]] || nm.bayer[0]) + nm.bayer.slice(1) : "", g0 = g.replace(/\d/g, ""), gen = CAT.cons[nm.c] ? CAT.cons[nm.c].gen : "";
    const bay = nm.bayer ? [`${nm.bayer} ${nm.c}`, `${g} ${nm.c}`, `${g0} ${nm.c}`, `${g} ${gen}`, `${g0} ${gen}`] : [];
    INDEX.push({ t: () => starTarget(i), name: nm.name || `${nm.bayer} ${nm.c}`, keys: [nm.name, ...bay].filter(Boolean), sub: `${nm.bayer ? nm.bayer + " " + nm.c + " · " : ""}mag ${fmtMag(s[3])}`, col: hexOf(starColor(s[4])), pri: 2 + s[3] / 10 });
  });
  for (const o of CAT.messier) INDEX.push({ t: () => messierTarget(o), name: o.alt ? `${o.id} ${o.alt.replace("´", "'")}` : o.id, keys: [o.id, `M ${o.id.slice(1)}`, `Messier ${o.id.slice(1)}`, o.alt], sub: MESSIER_TYPE[o.type] || "", col: "#c8a0ff", shape: "sq", pri: 3 });
  INDEX.forEach(e => { e.nk = e.keys.filter(Boolean).map(normS); });
}
function searchIndex(q) {
  q = normS(q.trim()); if (!q) return [];
  const hip = q.match(/^hip\s*(\d+)$/);
  if (hip) { const i = CAT.hipIndex.get(+hip[1]); return i != null ? [{ t: () => starTarget(i), name: `HIP ${hip[1]}`, sub: `mag ${fmtMag(CAT.stars[i][3])}`, col: hexOf(starColor(CAT.stars[i][4])), pri: 0 }] : []; }
  const out = [];
  for (const e of INDEX) {
    let sc = 99;
    for (const k of e.nk) {
      if (k === q) sc = Math.min(sc, 0);
      else if (k.startsWith(q)) sc = Math.min(sc, 1);
      else if (k.split(/[\s·]+/).some(w => w.startsWith(q))) sc = Math.min(sc, 2);
      else if (q.length > 2 && k.includes(q)) sc = Math.min(sc, 3);
    }
    if (sc < 99) out.push([sc + e.pri * 0.1, e]);
  }
  return out.sort((a, b) => a[0] - b[0]).slice(0, 8).map(x => x[1]);
}
function wireSearch() {
  const inp = $("#search"), list = $("#searchList");
  let items = [], active = 0;
  const render = () => {
    items = searchIndex(inp.value);
    list.hidden = !inp.value.trim();
    inp.setAttribute("aria-expanded", list.hidden ? "false" : "true");
    if (!items.length) { list.innerHTML = `<li class="empty">Nothing matches “${esc(inp.value)}”</li>`; return; }
    active = clamp(active, 0, items.length - 1);
    list.innerHTML = items.map((e, i) => {
      const t = e.t(), r = targetScreen(t);
      const where = r.below ? "below horizon" : `${r.a.alt.toFixed(0)}° ${compass(r.a.az * R2D)}`;
      return `<li role="option" id="sr${i}" aria-selected="${i === active}" data-i="${i}"><span class="dot ${e.shape || ""}" style="--c:${e.col}"></span><span class="nm">${esc(e.name)}</span><span class="sb${r.below ? " below" : ""}">${esc(e.sub ? e.sub.split(" · ")[0] : "")} · ${where}</span></li>`;
    }).join("");
    inp.setAttribute("aria-activedescendant", "sr" + active);
  };
  const go = i => { const e = items[i]; if (!e) return; choose(e.t()); inp.value = ""; list.hidden = true; inp.blur(); inp.setAttribute("aria-expanded", "false"); };
  inp.addEventListener("input", () => { active = 0; render(); });
  inp.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { active = Math.min(items.length - 1, active + 1); render(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { active = Math.max(0, active - 1); render(); e.preventDefault(); }
    else if (e.key === "Enter") { go(active); e.preventDefault(); }
    else if (e.key === "Escape") { inp.value = ""; list.hidden = true; inp.blur(); }
  });
  list.addEventListener("pointerdown", e => { const li = e.target.closest("li[data-i]"); if (li) { e.preventDefault(); go(+li.dataset.i); } });
  inp.addEventListener("blur", () => setTimeout(() => { list.hidden = true; }, 150));
}

/* ---------------------------------------------------------------- tonight --- */
function tonightBase() {
  const p = parts(S.ms);
  let y = p.y, mo = p.mo, d = p.d;
  if (p.h < 12) { const prev = new Date(Date.UTC(y, mo - 1, d) - 864e5); y = prev.getUTCFullYear(); mo = prev.getUTCMonth() + 1; d = prev.getUTCDate(); }
  return { y, mo, d, noon: wallToMs(y, mo, d, 12, 0) };
}
function renderTonight(force) {
  const base = tonightBase();
  const key = `${base.noon}|${S.lat}|${S.lon}|${tzName()}|${S.bortle}`;
  if (!force && key === lastTonightKey) return;
  lastTonightKey = key;
  const lat = S.lat, lon = S.lon, jdNoon = A.julianDay(base.noon);
  // Search from the site's own solar noon (nearest to noon on the display clock): when the display time
  // zone is far from the site's longitude, display-noon can fall in the site's night and the first
  // sunrise found would precede the sunset, leaving no darkness window for the planets.
  const lst = ((((jdNoon + 0.5) % 1) * 24 + lon / 15) % 24 + 24) % 24;
  const jd0 = jdNoon + (((12 - lst + 36) % 24) - 12) / 24;
  const ev = A.sunEvents(jd0, lat, lon, 1);
  const first = arr => arr && arr.length ? arr[0] : null;
  const sunset = first(ev.set), sunrise = first(ev.rise);
  const civEnd = first(ev.civil.sets), astEnd = first(ev.astro.sets), astBeg = first(ev.astro.rises), nauEnd = first(ev.nautical.sets), nauBeg = first(ev.nautical.rises), civBeg = first(ev.civil.rises);
  const darkStart = astEnd || nauEnd || civEnd || sunset, darkEnd = astBeg || nauBeg || civBeg || sunrise;
  $("#tnDate").textContent = `Night of ${dateStr(base.noon)}`;
  $("#tnPlace").textContent = S.place;
  // prime time: an hour after full darkness, but not before 21:00 local
  const nine = A.julianDay(wallToMs(base.y, base.mo, base.d, 21, 0));
  let prime = darkStart ? Math.max(darkStart + 1 / 24, nine) : A.julianDay(wallToMs(base.y, base.mo, base.d, 23, 0));
  if (darkEnd && prime > darkEnd - 1 / 24) prime = darkStart ? (darkStart + darkEnd) / 2 : prime;
  if (!darkStart && sunset == null && ev.alwaysUp) prime = A.julianDay(wallToMs(base.y, base.mo, base.d, 23, 30));
  S.prime = prime;
  // times
  const tms = [];
  if (ev.alwaysUp) tms.push(["Sun", "never sets"]);
  else if (ev.neverUp) tms.push(["Sun", "polar night"]);
  else tms.push(["Sunset", hmJD(sunset)]);
  tms.push(["Dark from", astEnd ? hmJD(astEnd) : ev.neverUp ? "all day" : "not tonight"]);
  tms.push(["Sunrise", sunrise ? hmJD(sunrise) : "—"]);
  const mrs = A.riseSetTransit("moon", jd0, lat, lon, null, 1, 1 / 96);
  const ph = A.moonPhase(prime);
  tms.push(["Moonrise", mrs.rises.length ? hmJD(mrs.rises[0]) : mrs.alwaysUp ? "up all night" : "—"]);
  tms.push(["Moonset", mrs.sets.length ? hmJD(mrs.sets[0]) : "—"]);
  tms.push(["Moon", `${(ph.illum * 100).toFixed(0)}% lit`]);
  $("#tnTimes").innerHTML = tms.map(([k, v]) => readout(k, v)).join("");
  const chip = $("#tnMoonChip"); chip.innerHTML = ""; chip.appendChild(moonIcon(ph, 68));
  const txt = document.createElement("div"); txt.innerHTML = `${ph.name}<br>${ph.ageDays.toFixed(1)} days`; chip.appendChild(txt);
  chip.onclick = () => choose(bodyTarget("moon"));
  // planets
  let t0 = sunset || jd0 + 5 / 24, t1 = sunrise && sunrise > t0 ? sunrise : t0 + 0.6;
  if (ev.neverUp) { t0 = jd0; t1 = jd0 + 1; }
  const rows = [];
  const series = {};
  const N = 72;
  for (const id of ["moon", ...A.PLANETS]) {
    const alts = []; for (let k = 0; k <= N; k++) { const j = t0 - 1 / 24 + (t1 - t0 + 2 / 24) * k / N; alts.push([j, A.altAzOf(id, j, lat, lon)]); }
    series[id] = alts;
  }
  const lis = [];
  for (const id of A.PLANETS) {
    const b = A.body(id, prime), s = series[id].filter(([j]) => j >= (sunset ? sunset + 0.01 : t0) && j <= (sunrise ? sunrise - 0.01 : t1));
    const up = s.filter(([, a]) => a.alt > 5);
    const name = A.BODY_NAMES[id];
    if (!up.length || b.elong < 12 || b.mag > 6.5 || ev.alwaysUp) { lis.push({ id, off: true, html: `<span class="ic" style="--c:${hexOf(PLANET_COL[id])}">${name[0]}</span><span class="t">${name}<small>mag ${fmtMag(b.mag)}</small></span><span class="d">${ev.alwaysUp ? "The Sun never sets here today." : b.elong < 12 ? "Lost in the Sun's glare tonight." : up.length ? "Up tonight, but too faint for the eye: use binoculars or a telescope." : "Below the horizon during darkness."}</span>` }); continue; }
    const best = up.reduce((p, q) => (q[1].alt > p[1].alt ? q : p));
    const startUp = s.length && s[0][1].alt > 5, endUp = s.length && s[s.length - 1][1].alt > 5;
    let when;
    if (startUp && endUp) when = `Up all night; highest at ${hmJD(best[0])}, ${best[1].alt.toFixed(0)}° in the ${COMPASS_WORD[compass(best[1].az)]}.`;
    else if (startUp) { const set = up[up.length - 1][0]; when = `Evening sky: ${best[1].alt.toFixed(0)}° high in the ${COMPASS_WORD[compass(best[1].az)]} after sunset, sets around ${hmJD(set + 1 / 48)}.`; }
    else { const rise = up[0][0]; when = `Rises around ${hmJD(rise - 1 / 48)}; best at ${hmJD(best[0])}, ${best[1].alt.toFixed(0)}° in the ${COMPASS_WORD[compass(best[1].az)]}.`; }
    if (id === "uranus" || id === "neptune") when += id === "uranus" ? " Binoculars help." : " Needs binoculars.";
    lis.push({ id, off: false, html: `<span class="ic" style="--c:${hexOf(PLANET_COL[id])}">${name[0]}</span><span class="t">${name}<small>mag ${fmtMag(b.mag)}</small></span><span class="d">${when}</span>` });
  }
  lis.sort((a, b) => a.off - b.off);
  const ul = $("#tnPlanets"); ul.innerHTML = lis.map(l => `<li tabindex="0" data-body="${l.id}" class="${l.off ? "off" : ""}">${l.html}</li>`).join("");
  $$("li", ul).forEach(li => li.addEventListener("click", () => choose(bodyTarget(li.dataset.body))));
  nightChart(t0, t1, series, ev, prime);
  // highlights
  renderHighlights(prime, ph);
  $("#tnZone").textContent = `Times in ${tzAbbr(base.noon)} (${tzName().replace(/_/g, " ")}). “Dark” means astronomical twilight has ended: the Sun is 18° below the horizon.`;
}
function renderHighlights(jd, ph) {
  const lat = S.lat, lon = S.lon;
  const M = A.horizontalMatrix(jd, lat, lon);
  const moonH = A.mulMV(M, A.body("moon", jd).v);
  const moonUp = moonH[2] > 0 && ph.illum > 0.5;
  const cands = [];
  const alt = v => { const h = A.mulMV(M, v); return { alt: Math.asin(h[2]) * R2D, az: A.wrap360(Math.atan2(h[0], h[1]) * R2D), h }; };
  for (const [id, note] of Object.entries(CON_NOTES)) {
    const c = CAT.cons[id], v = A.raDecToVec(c.ra, c.dec), a = alt(v);
    if (a.alt < 28) continue;
    cands.push({ kind: "con", t: () => conTarget(id), name: c.name, note, a, score: Math.min(a.alt, 65) + 8, tag: id });
  }
  for (const [s, i] of CAT.named) {
    if (s[3] > 1.3) break;
    const a = alt(starVecAt(i)); if (a.alt < 25) continue;
    cands.push({ kind: "star", t: () => starTarget(i), name: CAT.names[s[0]].name, note: STAR_NOTES[s[0]] || "A first-magnitude star.", a, score: Math.min(a.alt, 60) + (1.3 - s[3]) * 6, tag: "★" });
  }
  for (const id of SHOW_MESSIER) {
    const o = CAT.messier.find(m => m.id === id); if (!o) continue;
    const a = alt(o.v); if (a.alt < 30) continue;
    let sc = Math.min(a.alt, 70) + (6 - o.mag) * 4 + (["M31", "M42", "M45", "M13", "M8", "M44", "M7"].includes(id) ? 14 : 0);
    if (moonUp && o.mag > 5 && /[sei]|pn|sfr/.test(o.type)) sc -= 25 * ph.illum;
    if (dot(a.h, moonH) > Math.cos(15 * D2R) && ph.illum > 0.3) sc -= 30;
    if (SKY && BORTLE[S.bortle - 1][0] < o.mag + 1) sc -= 30;
    cands.push({ kind: "messier", t: () => messierTarget(o), name: o.alt ? `${o.id} ${o.alt.replace("´", "'")}` : o.id, note: MESSIER_NOTES[id] || MESSIER_TYPE[o.type], a, score: sc, tag: o.id });
  }
  const pickN = (kind, n) => cands.filter(c => c.kind === kind).sort((a, b) => b.score - a.score).slice(0, n);
  let chosen = [...pickN("con", 2), ...pickN("messier", 2), ...pickN("star", 1)];
  if (chosen.length < 5) chosen = chosen.concat(cands.filter(c => !chosen.includes(c)).sort((a, b) => b.score - a.score).slice(0, 5 - chosen.length));
  chosen.sort((a, b) => b.score - a.score);
  $("#tnPrime").textContent = `Well placed at ${hmJD(jd)}${moonUp ? `; the ${ph.illum > 0.9 ? "full" : "bright"} Moon will wash out faint objects` : ""}. Tap one to go there.`;
  const ol = $("#tnHighlights");
  ol.innerHTML = chosen.map((c, i) => {
    const ic = c.kind === "con" ? `<span class="ic cn">${c.tag}</span>` : c.kind === "messier" ? `<span class="ic m">${c.tag}</span>` : `<span class="ic" style="--c:#fff">★</span>`;
    return `<li tabindex="0" data-i="${i}">${ic}<span class="t">${esc(c.name)}<small>${c.a.alt.toFixed(0)}° ${compass(c.a.az)}</small></span><span class="d">${esc(c.note)}</span></li>`;
  }).join("") || `<li class="off"><span class="ic">–</span><span class="t">No dark sky tonight</span><span class="d">The Sun stays too high.</span></li>`;
  $$("li[data-i]", ol).forEach(li => {
    const go = () => { const c = chosen[+li.dataset.i]; setTime(A.jdToMs(jd)); S.playing = false; syncPlay(); choose(c.t()); };
    li.addEventListener("click", go); li.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
  });
}
function skyTone(s) {   // sun altitude -> track colour
  const stops = [[-90, [7, 10, 28]], [-18, [8, 11, 30]], [-12, [22, 26, 72]], [-6, [58, 52, 120]], [-2, [190, 100, 80]], [2, [240, 160, 90]], [8, [100, 160, 230]], [90, [120, 190, 255]]];
  for (let k = 1; k < stops.length; k++) if (s <= stops[k][0]) {
    const [s0, c0] = stops[k - 1], [s1, c1] = stops[k], t = (s - s0) / (s1 - s0);
    return `rgb(${c0.map((c, j) => Math.round(lerp(c, c1[j], t))).join(",")})`;
  }
  return "rgb(120,190,255)";
}
function nightChart(t0, t1, series, ev, prime) {
  const W = 312, rowH = 17, top = 18, labelW = 58, rows = ["moon", ...A.PLANETS];
  const H = top + rows.length * rowH + 16;
  const a = t0 - 1 / 24, b = t1 + 1 / 24;
  const X = j => labelW + (j - a) / (b - a) * (W - labelW - 4);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Chart: when the Moon and planets are above the horizon tonight"><defs><linearGradient id="tnSky" x1="0" x2="1">`;
  for (let k = 0; k <= 24; k++) { const j = a + (b - a) * k / 24; svg += `<stop offset="${(k / 24 * 100).toFixed(1)}%" stop-color="${skyTone(A.altAzOf("sun", j, S.lat, S.lon).alt)}"/>`; }
  svg += `</linearGradient></defs><rect x="${labelW}" y="${top - 4}" width="${W - labelW - 4}" height="${rows.length * rowH + 6}" rx="6" fill="url(#tnSky)" opacity=".85"/>`;
  // hour ticks
  const startH = Math.ceil((A.jdToMs(a) - 0) / 3600e3);
  for (let hms2 = startH * 3600e3; hms2 < A.jdToMs(b); hms2 += 3600e3) {
    const j = A.julianDay(hms2), p = parts(hms2);
    if (p.mi !== 0) continue;
    const x = X(j);
    svg += `<line x1="${x}" x2="${x}" y1="${top - 4}" y2="${top + rows.length * rowH + 2}" stroke="rgba(255,255,255,.08)"/>`;
    if (p.h % 2 === 0) svg += `<text x="${x}" y="${H - 3}" text-anchor="middle">${pad(p.h)}</text>`;
  }
  rows.forEach((id, r) => {
    const y = top + r * rowH + rowH / 2;
    const col = id === "moon" ? "#e6e8f2" : hexOf(PLANET_COL[id]);
    svg += `<g class="row" data-body="${id}"><rect x="0" y="${y - rowH / 2}" width="${W}" height="${rowH}" fill="transparent"/><text class="lbl" x="0" y="${y + 3.5}">${A.BODY_NAMES[id]}</text>`;
    let seg = null;
    const s = series[id];
    const flush = end => { if (seg) { svg += `<line x1="${X(seg[0])}" x2="${X(end)}" y1="${y}" y2="${y}" stroke="${col}" stroke-width="${id === "moon" ? 5 : 4}" stroke-linecap="round" opacity="${id === "uranus" || id === "neptune" ? .45 : .9}"/>`; seg = null; } };
    for (const [j, aa] of s) { if (aa.alt > 0) { if (!seg) seg = [j]; } else flush(j); }
    flush(s[s.length - 1][0]);
    svg += `</g>`;
  });
  const now = A.julianDay(S.ms);
  if (now > a && now < b) svg += `<line x1="${X(now)}" x2="${X(now)}" y1="${top - 8}" y2="${top + rows.length * rowH + 4}" stroke="#7cc8ff" stroke-width="1.5"/><text x="${X(now)}" y="${top - 9}" text-anchor="middle" style="fill:#7cc8ff">now</text>`;
  svg += `<circle cx="${X(prime)}" cy="${top - 7}" r="2.5" fill="#ffc24b"/>`;
  svg += `</svg>`;
  const el = $("#tnChart"); el.innerHTML = svg;
  $$(".row", el).forEach(g => g.addEventListener("click", () => choose(bodyTarget(g.dataset.body))));
}

/* ------------------------------------------------------------------- learn --- */
function renderTex() {
  if (!window.katex) return;
  $$(".tex[data-tex]").forEach(el => { try { window.katex.render(el.dataset.tex, el, { displayMode: true, throwOnError: false }); } catch (e) { el.textContent = el.dataset.tex; } });
}
function updateLearn() {
  if (S.tab !== "learn") return;
  const lst = SKY.lst;
  $("#lLst").textContent = `Right now at ${S.place}: Greenwich Mean Sidereal Time (GMST) ${hms(A.gmst2006(SKY.jd))}; Local Sidereal Time (LST) ${hms(lst)}. Stars with RA ≈ ${hms(lst).slice(0, 7)} are crossing your meridian now, at their highest.`;
  const phi = Math.abs(S.lat), hid = (1 - Math.cos(phi * D2R)) / 2 * 100;
  $("#lLat").textContent = phi > 89 ? `At ${S.place} the celestial pole is overhead: every star circles the horizon without rising or setting, and exactly half the sky is never seen.`
    : `From ${S.place} (φ = ${S.lat.toFixed(2)}°) the ${S.lat >= 0 ? "north" : "south"} celestial pole stands ${phi.toFixed(1)}° above the horizon. Stars within ${phi.toFixed(1)}° of it never set; stars within ${phi.toFixed(1)}° of the other pole never rise: ${hid.toFixed(1)}% of the sky is always hidden from you.`;
  const p = parts(S.ms), nine = A.julianDay(wallToMs(p.y, p.mo, p.d, 21, 0));
  const ra9 = A.lst(nine, S.lon), sun = A.vecToRaDec(A.mulMV(SKY.P, SKY.bodies.sun.v));
  $("#lSeason").textContent = `Today the Sun is at RA ${hms(sun.ra).slice(0, 7)} in ${CAT.cons[constellationOf(SKY.bodies.sun.v)] ? CAT.cons[constellationOf(SKY.bodies.sun.v)].name : "—"}. At 21:00 tonight the meridian is at RA ${hms(ra9).slice(0, 7)}; at 21:00 in three months it will be RA ${hms(ra9 + 90).slice(0, 7)}.`;
}
function updateLearnSel() {
  const el = $("#lSel"); if (!el) return;
  const t = S.sel;
  if (!t || !SKY) { el.textContent = "Click any star to see these numbers for it."; return; }
  const v = t.kind === "body" ? SKY.bodies[t.id].v : t.v, rd = A.vecToRaDec(A.mulMV(SKY.P, v));
  const H = A.wrap180(SKY.lst - rd.ra), c = A.eqToAltAzClassic(rd.ra, rd.dec, S.lat, SKY.lst);
  el.textContent = `${t.name}: α = ${(rd.ra).toFixed(2)}°, δ = ${rd.dec.toFixed(2)}°, H = LST − α = ${H.toFixed(2)}°, φ = ${S.lat.toFixed(2)}° → a = ${c.alt.toFixed(2)}°, A = ${c.az.toFixed(2)}°; refraction adds ${c.alt > -1 ? (A.refractionFromTrue(c.alt) * 60).toFixed(1) : "0"}′.`;
}

/* ---------------------------------------------------------------- UI wiring --- */
let toastT = 0;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2600); }
function setTime(ms) { S.ms = ms; rstCache.clear(); }
function syncPlay() {
  const b = $("#playBtn"); b.classList.toggle("paused", !S.playing); b.setAttribute("aria-label", S.playing ? "Pause" : "Play");
  $("#revBtn").setAttribute("aria-pressed", S.dir < 0 ? "true" : "false");
  $$(".sky-speed button").forEach(x => x.setAttribute("aria-pressed", +x.dataset.speed === S.speed ? "true" : "false"));
}
function setPlace(p, silent) {
  setPlaceState(p);
  $("#latIn").value = S.lat.toFixed(2); $("#lonIn").value = S.lon.toFixed(2);
  $$("#presets button").forEach(b => b.setAttribute("aria-pressed", b.dataset.id === S.placeId ? "true" : "false"));
  onPlaceChange(silent);
}
function onPlaceChange(silent) {
  $("#placeBtn").textContent = S.place;
  rstCache.clear(); lastTonightKey = ""; lastTrackKey = "";
  resize();
  if (!silent) toast(`Now under the sky of ${S.place}`);
  renderTonight(true);
  if (S.sel) renderInfo(true);
}
function updateClockUI() {
  const p = parts(S.ms), abbr = tzAbbr(S.ms);
  $("#clockT").textContent = `${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}`;
  $("#clockZ").textContent = abbr;
  const dt = $("#dtPick"); if (document.activeElement !== dt) dt.value = `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`;
  const tod = $("#tod"); if (!todDrag) { tod.value = p.h * 60 + p.mi; tod.style.setProperty("--fill", (tod.value / 1439 * 100) + "%"); }
  const live = S.playing && S.speed === 1 && S.dir > 0 && Math.abs(S.ms - Date.now()) < 60e3;
  $("#liveDot").classList.toggle("off", !live);
  $("#eyebrowTxt").textContent = live ? "Planetarium · live" : S.playing ? `Planetarium · ${S.dir < 0 ? "reverse " : ""}${S.speed}×` : "Planetarium · paused";
  // time-of-day track coloured by the Sun's altitude for this date and place
  const mid = localMidnight(S.ms), key = `${mid}|${S.lat}|${S.lon}`;
  if (key !== lastTrackKey) {
    lastTrackKey = key;
    const stops = []; for (let k = 0; k <= 48; k++) { const j = A.julianDay(mid + k * 1800e3); stops.push(`${skyTone(A.altAzOf("sun", j, S.lat, S.lon).alt)} ${(k / 48 * 100).toFixed(1)}%`); }
    tod.style.setProperty("--sky-track", `linear-gradient(90deg, ${stops.join(",")})`);
  }
  // compass
  const v = S.view;
  $("#cmpDir").textContent = v.alt > 80 ? "Zenith" : `${compass(v.az)} ${v.az.toFixed(0)}°`;
  $("#cmpSub").textContent = `alt ${v.alt.toFixed(0)}° · field ${v.fov.toFixed(0)}°`;
  $("#fovOut").textContent = v.fov.toFixed(0) + "°";
  const f = $("#fov"); if (document.activeElement !== f) { f.value = Math.round(Math.log(v.fov / 10) / Math.log(18) * 1000); f.style.setProperty("--fill", f.value / 10 + "%"); }
  // readouts
  $("#rLst").textContent = hms(SKY.lst).slice(0, 7);
  $("#rJd").textContent = SKY.jd.toFixed(4);
  $("#rSun").textContent = SKY.sunAlt.toFixed(1) + "°";
  const s = SKY.sunAlt;
  $("#rPhase").textContent = s > -0.83 ? "Day" : s > -6 ? "Civil twilight" : s > -12 ? "Nautical twilight" : s > -18 ? "Astronomical twilight" : "Night";
  renderTonight(false);
  updateLearn();
}
let todDrag = false;

function buildUI() {
  buildIndex(); wireSearch(); renderTex();
  $("#placeBtn").textContent = S.place;
  // tabs
  $$(".sky-tabs button").forEach(b => b.addEventListener("click", () => openTab(b.dataset.tab)));
  // layers
  $$("[data-layer]").forEach(inp => {
    inp.checked = !!S.layers[inp.dataset.layer];
    inp.addEventListener("change", () => { S.layers[inp.dataset.layer] = inp.checked; });
  });
  // bortle
  const bo = $("#bortle");
  const syncB = () => { const [lim, nm] = BORTLE[S.bortle - 1]; $("#bortleOut").textContent = `${S.bortle} · ${nm}`; $("#bortleHint").textContent = `Naked-eye limiting magnitude about ${lim.toFixed(1)}. Downtown Los Angeles is class 8–9, where only a few dozen stars show; the catalogue here stops at magnitude 6.`; bo.style.setProperty("--fill", ((S.bortle - 1) / 8 * 100) + "%"); };
  bo.value = S.bortle; syncB();
  bo.addEventListener("input", () => { S.bortle = +bo.value; syncB(); lastTonightKey = ""; });
  // fov + look
  $("#fov").addEventListener("input", e => { S.view.fov = 10 * Math.pow(18, +e.target.value / 1000); });
  $$("[data-look]").forEach(b => b.addEventListener("click", () => {
    const t = b.dataset.look === "zenith" ? { alt: 90 } : { az: S.view.az + A.wrap180(+b.dataset.look - S.view.az), alt: 25 };
    if (window.gsap && !reduce) gsap.to(S.view, { ...t, duration: 1.1, ease: "power3.inOut" }); else Object.assign(S.view, t);
  }));
  $("#zoomIn").addEventListener("click", () => zoomBy(1 / 1.35));
  $("#zoomOut").addEventListener("click", () => zoomBy(1.35));
  // places
  $("#presets").innerHTML = PLACES.map(p => `<button type="button" data-id="${p.id}" aria-pressed="${p.id === S.placeId}">${p.short || p.name}</button>`).join("");
  $$("#presets button").forEach(b => b.addEventListener("click", () => setPlace(PLACES.find(p => p.id === b.dataset.id))));
  $("#latIn").value = S.lat.toFixed(2); $("#lonIn").value = S.lon.toFixed(2);
  const coord = () => {
    const la = +$("#latIn").value, lo = +$("#lonIn").value; if (!isFinite(la) || !isFinite(lo)) return;
    S.lat = clamp(la, -89.99, 89.99); S.lon = A.wrap180(lo); S.place = fmtLatLon(S.lat, S.lon); S.placeId = null; S.siteTz = etcZone(S.lon);
    $$("#presets button").forEach(b => b.setAttribute("aria-pressed", "false")); onPlaceChange();
  };
  $("#latIn").addEventListener("change", coord); $("#lonIn").addEventListener("change", coord);
  $("#geoBtn").addEventListener("click", () => {
    const msg = $("#geoMsg");
    if (!navigator.geolocation) { msg.textContent = "This browser cannot share its location."; return; }
    msg.textContent = "Asking your browser…";
    navigator.geolocation.getCurrentPosition(pos => {
      S.lat = clamp(pos.coords.latitude, -89.99, 89.99); S.lon = pos.coords.longitude; S.place = "your location"; S.placeId = null; S.siteTz = VIEWER_TZ;
      $("#latIn").value = S.lat.toFixed(2); $("#lonIn").value = S.lon.toFixed(2);
      $$("#presets button").forEach(b => b.setAttribute("aria-pressed", "false"));
      msg.textContent = `Found you at ${fmtLatLon(S.lat, S.lon)} (±${Math.round(pos.coords.accuracy)} m).`;
      onPlaceChange();
    }, err => { msg.textContent = err.code === 1 ? "Location permission was declined. Pick a city or type coordinates." : "Could not get a position: " + err.message; }, { timeout: 12000, maximumAge: 600000 });
  });
  $("#placeBtn").addEventListener("click", () => { openTab("place"); const p = $("#panel"); if (p.classList.contains("collapsed")) p.querySelector(".hud-collapse").click(); });
  // time zone
  const tzb = $$("[data-tz]");
  const syncTz = () => {
    tzb.forEach(b => b.setAttribute("aria-pressed", b.dataset.tz === S.tzMode ? "true" : "false"));
    $("#tzHint").textContent = `Times are shown in ${tzName().replace(/_/g, " ")} (${tzAbbr(S.ms)}). Your browser is on ${VIEWER_TZ.replace(/_/g, " ")}.`;
  };
  tzb.forEach(b => b.addEventListener("click", () => { S.tzMode = b.dataset.tz; syncTz(); lastTonightKey = ""; lastTrackKey = ""; rstCache.clear(); if (S.sel) renderInfo(true); }));
  syncTz();
  // time controls
  $("#playBtn").addEventListener("click", () => { S.playing = !S.playing; syncPlay(); });
  $("#revBtn").addEventListener("click", () => { S.dir *= -1; if (!S.playing) S.playing = true; syncPlay(); });
  $$(".sky-speed button").forEach(b => b.addEventListener("click", () => { S.speed = +b.dataset.speed; S.playing = true; syncPlay(); }));
  $$("[data-step]").forEach(b => b.addEventListener("click", () => setTime(S.ms + +b.dataset.step * 60e3)));
  $("#nowBtn").addEventListener("click", goNow);
  const tod = $("#tod");
  tod.addEventListener("pointerdown", () => { todDrag = true; });
  addEventListener("pointerup", () => { todDrag = false; });
  tod.addEventListener("input", () => { const p = parts(S.ms); setTime(wallToMs(p.y, p.mo, p.d, Math.floor(tod.value / 60), tod.value % 60) + p.s * 1000); });
  tod.addEventListener("change", () => { todDrag = false; });
  $("#dtPick").addEventListener("change", e => {
    const m = e.target.value.match(/(\d+)-(\d+)-(\d+)T(\d+):(\d+)/); if (!m) return;
    setTime(wallToMs(+m[1], +m[2], +m[3], +m[4], +m[5]));
  });
  syncPlay();
  // info
  $("#infoClose").addEventListener("click", closeInfo);
  // learn demos
  $("#demoSid").addEventListener("click", () => { S.speed = 3600; S.dir = 1; S.playing = true; syncPlay(); toast("One sidereal day = 23 h 56 min: watch the stars come back to the same place"); });
  $("#demoSeason").addEventListener("click", () => { const p = parts(S.ms); const d = new Date(Date.UTC(p.y, p.mo, p.d)); setTime(wallToMs(d.getUTCFullYear(), d.getUTCMonth() + 1, Math.min(d.getUTCDate(), 28), 21, 0)); S.playing = false; syncPlay(); toast("One month later, same clock time: the sky has turned about 30°"); });
  $$("[data-demo]").forEach(b => b.addEventListener("click", () => {
    const d = b.dataset.demo;
    if (d === "pole") { if (window.gsap && !reduce) gsap.to(S.view, { az: S.view.az + A.wrap180((S.lat >= 0 ? 0 : 180) - S.view.az), alt: Math.abs(S.lat), fov: 90, duration: 1.3, ease: "power3.inOut" }); else Object.assign(S.view, { az: S.lat >= 0 ? 0 : 180, alt: Math.abs(S.lat), fov: 90 }); }
    else if (d === "south") { setPlace(PLACES.find(p => p.id === "southpole")); S.view.alt = 20; }
    else if (d === "equator") { setPlace(PLACES.find(p => p.id === "quito")); }
  }));
  wirePointer(); wireKeys();
  renderTonight(true);
}
function openTab(tab) {
  S.tab = tab;
  $$(".sky-tabs button").forEach(b => { const on = b.dataset.tab === tab; b.setAttribute("aria-pressed", on); b.setAttribute("aria-selected", on); });
  $$(".sky-tab").forEach(p => { p.hidden = p.dataset.pane !== tab; });
  if (tab === "learn") { updateLearn(); updateLearnSel(); }
}
function goNow() { setTime(Date.now()); S.playing = true; S.speed = 1; S.dir = 1; syncPlay(); }
function zoomBy(f) {
  const t = clamp(S.view.fov * f, 10, 180);
  if (window.gsap && !reduce) gsap.to(S.view, { fov: t, duration: 0.35, ease: "power2.out" }); else S.view.fov = t;
}

/* --------------------------------------------------------------- pointer --- */
const drag = { active: false, moved: false, x: 0, y: 0, t: 0, pts: new Map(), pinch: 0 };
function wirePointer() {
  const el = overlay;
  el.addEventListener("pointerdown", e => {
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or already released pointer */ }
    el.focus({ preventScroll: true });
    drag.pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (drag.pts.size === 2) { const [a, b] = [...drag.pts.values()]; drag.pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); }
    drag.active = true; drag.moved = false; drag.x = e.clientX; drag.y = e.clientY; drag.t = performance.now();
    inertia.active = false; if (window.gsap) gsap.killTweensOf(S.view);
    el.classList.add("dragging");
  });
  el.addEventListener("pointermove", e => {
    if (!drag.active) { hoverAt(e.clientX, e.clientY); return; }
    const prev = drag.pts.get(e.pointerId); if (!prev) return;
    drag.pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (drag.pts.size >= 2) {
      const [a, b] = [...drag.pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (drag.pinch > 0) S.view.fov = clamp(S.view.fov * drag.pinch / d, 10, 180);
      drag.pinch = d; drag.moved = true; return;
    }
    const dx = e.clientX - prev[0], dy = e.clientY - prev[1];
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) drag.moved = true;
    const k = R2D / V.scale;
    const daz = -dx * k / Math.max(Math.cos(S.view.alt * D2R), 0.3), dalt = dy * k;
    S.view.az += daz; S.view.alt += dalt;
    const now = performance.now(), dt = Math.max(1, now - drag.t) / 1000; drag.t = now;
    inertia.vaz = lerp(inertia.vaz, daz / dt, 0.5); inertia.valt = lerp(inertia.valt, dalt / dt, 0.5);
  });
  const up = e => {
    drag.pts.delete(e.pointerId);
    if (drag.pts.size) { drag.pinch = 0; return; }
    el.classList.remove("dragging");
    if (drag.active && !drag.moved) {
      const t = pick(e.clientX, e.clientY, e.pointerType === "touch" ? 22 : 14) || conAtScreen(e.clientX, e.clientY);
      if (t) choose(t, { fly: false }); else closeInfo();
    } else if (drag.moved && !reduce && performance.now() - drag.t < 80) inertia.active = true;
    drag.active = false;
  };
  el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  el.addEventListener("dblclick", e => { const h = unproject(e.clientX, e.clientY); const alt = Math.asin(h[2]) * R2D, az = Math.atan2(h[0], h[1]) * R2D; const t = { az: S.view.az + A.wrap180(az - S.view.az), alt }; if (window.gsap && !reduce) gsap.to(S.view, { ...t, duration: 0.8, ease: "power3.out" }); else Object.assign(S.view, t); });
  el.addEventListener("wheel", e => {
    e.preventDefault();
    const d = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    S.view.fov = clamp(S.view.fov * Math.exp(d * 0.0011), 10, 180);
  }, { passive: false });
  el.addEventListener("pointerleave", () => { if (!drag.active) { S.hover = null; el.classList.remove("hovering"); } });
}
let hoverT = 0;
function hoverAt(x, y) {
  const now = performance.now(); if (now - hoverT < 70) return; hoverT = now;
  const t = pick(x, y, 10);
  S.hover = t; overlay.classList.toggle("hovering", !!t);
}
function wireKeys() {
  addEventListener("keydown", e => {
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key, step = S.view.fov / 18;
    const layerKey = { c: "lines", v: "names", b: "bounds", l: "starNames", m: "messier", p: "planets", k: "ecliptic", z: "azGrid", e: "eqGrid", g: "ground", a: "atm" }[k.toLowerCase()];
    if (layerKey) { S.layers[layerKey] = !S.layers[layerKey]; const inp = $(`[data-layer="${layerKey}"]`); if (inp) inp.checked = S.layers[layerKey]; toast(`${inp ? inp.parentNode.firstChild.textContent.trim() : layerKey}: ${S.layers[layerKey] ? "on" : "off"}`); }
    else if (k === "/") { $("#search").focus(); e.preventDefault(); }
    else if (k === " ") { S.playing = !S.playing; syncPlay(); e.preventDefault(); }
    else if (k === "n" || k === "N") goNow();
    else if (k === "r" || k === "R") { S.dir *= -1; syncPlay(); }
    else if (k === "ArrowLeft") { S.view.az -= step; e.preventDefault(); }
    else if (k === "ArrowRight") { S.view.az += step; e.preventDefault(); }
    else if (k === "ArrowUp") { S.view.alt += step; e.preventDefault(); }
    else if (k === "ArrowDown") { S.view.alt -= step; e.preventDefault(); }
    else if (k === "+" || k === "=") zoomBy(1 / 1.25);
    else if (k === "-" || k === "_") zoomBy(1.25);
    else if (k === "Escape") closeInfo();
  });
}

/* ------------------------------------------------------- test hooks (shot.py) --- */
window.__sim = {
  setTime(t) { const ms = typeof t === "number" ? t : Date.parse(t); if (isFinite(ms)) { setTime(ms); S.playing = false; syncPlay(); } return new Date(S.ms).toISOString(); },
  play(on = true, speed = 1) { S.playing = on; S.speed = speed; syncPlay(); },
  setLocation(lat, lon, name, tz) {
    const p = PLACES.find(x => x.id === lat);
    if (p) { setPlace(p, true); return S.place; }
    S.lat = clamp(lat, -89.99, 89.99); S.lon = A.wrap180(lon); S.place = name || fmtLatLon(S.lat, S.lon); S.placeId = null; S.siteTz = tz || etcZone(S.lon);
    onPlaceChange(true); return S.place;
  },
  look(az, alt, fov) { if (window.gsap) gsap.killTweensOf(S.view); if (az != null) S.view.az = az; if (alt != null) S.view.alt = alt; if (fov != null) S.view.fov = fov; return { az: S.view.az, alt: S.view.alt, fov: S.view.fov }; },
  select(q, fly = true) { const r = searchIndex(q)[0]; if (r) choose(r.t(), { fly }); return r ? r.name : null; },
  layer(name, on) { S.layers[name] = on; const inp = $(`[data-layer="${name}"]`); if (inp) inp.checked = on; return { ...S.layers }; },
  tab(name) { openTab(name); const p = $("#panel"); if (p.classList.contains("collapsed")) p.querySelector(".hud-collapse").click(); return name; },
  bortle(n) { S.bortle = n; $("#bortle").value = n; $("#bortle").dispatchEvent(new Event("input")); return n; },
  tz(mode) { S.tzMode = mode === "viewer" || mode === "site" ? mode : "fixed"; if (S.tzMode === "fixed") S.fixedTz = mode; lastTonightKey = ""; lastTrackKey = ""; return tzName(); },
  prime() { return S.prime ? new Date(A.jdToMs(S.prime)).toISOString() : null; },
  perf() { return { overlayMs: +perf.overlay.toFixed(2), frames: perf.frames, bakeMs: Math.round(perf.bake), glRatio: V.glr }; },
  state() {
    if (!SKY) return null;
    const b = id => ({ alt: +SKY.bodies[id].app.alt.toFixed(2), az: +(SKY.bodies[id].app.az * R2D).toFixed(2), mag: +SKY.bodies[id].mag.toFixed(2) });
    return { time: new Date(S.ms).toISOString(), place: S.place, lat: S.lat, lon: S.lon, view: { az: +S.view.az.toFixed(2), alt: +S.view.alt.toFixed(2), fov: +S.view.fov.toFixed(2) }, lst: hms(SKY.lst), limMag: +SKY.lim.toFixed(2), sun: b("sun"), moon: { ...b("moon"), illum: +SKY.bodies.moon.illum.toFixed(3) },
      planets: Object.fromEntries(A.PLANETS.map(id => [id, b(id)])), sel: S.sel && S.sel.name };
  }
};
