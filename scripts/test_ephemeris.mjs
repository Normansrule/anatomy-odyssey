#!/usr/bin/env node
/* Unit tests for site/assets/js/ephemeris.js against published values.
 *
 *   node --no-warnings scripts/test_ephemeris.mjs
 *
 * Reference dates/distances (UTC) from standard almanac tables, e.g.
 *   Earth perihelion/aphelion: US Naval Observatory "Earth's Seasons" data
 *     (https://aa.usno.navy.mil/data/Earth_Seasons) and Fred Espenak's
 *     perihelion/aphelion tables (astropixels.com).
 *   Oppositions and conjunctions: Espenak, "Planetary Phenomena" tables
 *     (astropixels.com/ephemeris/phenomena/) and Sky & Telescope almanacs.
 * Tolerances reflect the stated accuracy of the Standish Table 1 elements
 * (arcminutes) and the low-precision Moon model.
 */
import * as E from "../site/assets/js/ephemeris.js";

const jd = s => E.julianDay(new Date(s));
const iso = j => new Date(E.jdToMs(j)).toISOString().slice(0, 16).replace("T", " ");
let fails = 0, passes = 0;
function check(name, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
  ok ? passes++ : fails++;
}

// Kepler's equation residual, including a high eccentricity.
for (const e of [0, 0.0167, 0.2488, 0.9]) {
  let worst = 0;
  for (let M = -3.1; M <= 3.1; M += 0.05) { const Ek = E.solveKepler(M, e); worst = Math.max(worst, Math.abs(Ek - e * Math.sin(Ek) - M)); }
  check(`Kepler solver e=${e}`, worst < 1e-10, `max residual ${worst.toExponential(1)} rad`);
}

// Earth-Sun distance at perihelion and aphelion.
const r = s => E.len(E.earthPosition(jd(s)));
[
  ["2025-01-04T13:28Z", 0.983327, "perihelion 2025"],
  ["2025-07-03T19:55Z", 1.016644, "aphelion 2025"],
  ["2026-01-03T17:16Z", 0.983295, "perihelion 2026"],
  ["2026-07-06T17:31Z", 1.016640, "aphelion 2026"]
].forEach(([t, want, n]) => { const got = r(t); check(`Earth ${n}`, Math.abs(got - want) < 3e-4, `${got.toFixed(6)} AU (published ${want})`); });

// Oppositions (outer planets) and inferior conjunctions (Mercury/Venus).
const events = [
  ["mars", "2020-10-13", 2], ["mars", "2022-12-08", 2], ["mars", "2025-01-16", 2], ["mars", "2027-02-19", 2],
  ["jupiter", "2023-11-03", 3], ["jupiter", "2024-12-07", 3], ["jupiter", "2026-01-10", 3],
  ["saturn", "2023-08-27", 3], ["saturn", "2024-09-08", 3], ["saturn", "2025-09-21", 3],
  ["venus", "2023-08-13", 2], ["venus", "2025-03-23", 2], ["venus", "2026-10-24", 2],
  ["mercury", "2025-03-24", 2], ["mercury", "2025-11-20", 2],
  ["ceres", "2023-03-21", 4], ["ceres", "2025-10-02", 4]
];
for (const [id, date, tol] of events) {
  const ev = E.nextEvent(id, jd(date) - 40);
  const dt = ev ? ev.jd - jd(date + "T12:00Z") : NaN;
  check(`${id} ${ev ? ev.kind : "event"} ${date}`, Math.abs(dt) <= tol, `computed ${ev ? iso(ev.jd) : "none"} (${dt >= 0 ? "+" : ""}${dt.toFixed(1)} d)`);
}

// Mars closest approach of 2020: 2020-10-06, 0.41492 AU (62.07 million km).
const ca = E.closestApproach("mars", jd("2020-10-06T12:00Z"), 20);
check("Mars closest approach 2020", Math.abs(ca.distanceAU - 0.41492) < 0.002 && Math.abs(ca.jd - jd("2020-10-06T14:18Z")) < 1.5,
  `${iso(ca.jd)}, ${ca.distanceAU.toFixed(5)} AU`);

// Moon distance stays in its known perigee/apogee range (356,400 to 406,700 km).
let lo = 1e9, hi = 0;
for (let t = jd("2025-01-01"); t < jd("2026-01-01"); t += 0.1) { const d = E.len(E.moonGeocentric(t)) * E.AU_KM; lo = Math.min(lo, d); hi = Math.max(hi, d); }
check("Moon distance range 2025", lo > 355500 && lo < 358500 && hi > 405500 && hi < 407500, `${lo.toFixed(0)} to ${hi.toFixed(0)} km`);

// Light-time sanity: Sun-Earth ~ 499 s.
const lt = E.len(E.earthPosition(jd("2026-03-20"))) * E.AU_KM / E.C_KM_S;
check("Sun-Earth light-time", Math.abs(lt - 497) < 6, `${lt.toFixed(1)} s`);

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
