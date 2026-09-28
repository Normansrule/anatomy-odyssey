#!/usr/bin/env node
/* Unit tests for site/assets/js/sky-astro.js (the planetarium maths).
 *
 *   node --no-warnings scripts/test_sky.mjs
 *
 * Reference values
 *   [M]  J. Meeus, "Astronomical Algorithms", 2nd ed.: Example 12.a/12.b (sidereal time),
 *        13.b (Venus alt/az from Washington), 16 (refraction), 21.b (precession of theta Persei).
 *   [GO] Griffith Observatory, "2026 Sunrise and Sunset" (prepared with US Naval Observatory
 *        data) for W118 18' 01.5", N34 07' 07.05", times in America/Los_Angeles:
 *        https://griffithobservatory.lacity.gov/explore/observing-the-sky/whats-in-the-sky/the-sun/2026-sunrise-and-sunset/
 *   [E]  Fred Espenak, "Phases of the Moon 2001-2100" (astropixels.com): full Moon
 *        2026 Sep 26 16:49 UT, new Moon 2026 Aug 12 17:37 UT; planetary phenomena tables:
 *        Saturn opposition 2026 Oct 04, Mars solar conjunction 2026 Jan 09.
 */
import { readFileSync } from "node:fs";
import * as A from "../site/assets/js/sky-astro.js";

let fails = 0, passes = 0;
function check(name, ok, detail) { console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`); ok ? passes++ : fails++; }
const jd = s => A.julianDay(new Date(s));
const hms = d => { d = A.wrap360(d) / 15; const h = Math.floor(d), m = Math.floor((d - h) * 60), s = ((d - h) * 60 - m) * 60; return `${h}h${String(m).padStart(2, "0")}m${s.toFixed(4)}s`; };
const fmtT = (j, offH) => { const d = new Date(A.jdToMs(j) + offH * 3600e3); return d.toISOString().slice(11, 16); };

/* ---- sidereal time ---- */
{
  const g1 = A.gmst1982(jd("1987-04-10T00:00:00Z")), want1 = (13 + 10 / 60 + 46.3668 / 3600) * 15;
  check("GMST IAU 1982, Meeus 12.a", Math.abs(g1 - want1) < 1e-5, `${hms(g1)} vs 13h10m46.3668s`);
  const g2 = A.gmst1982(jd("1987-04-10T19:21:00Z")), want2 = (8 + 34 / 60 + 57.0896 / 3600) * 15;
  check("GMST IAU 1982, Meeus 12.b", Math.abs(g2 - want2) < 1e-5, `${hms(g2)} vs 8h34m57.0896s`);
  const g3 = A.gmst2006(jd("1987-04-10T19:21:00Z"));
  check("GMST IAU 2006 (ERA based) agrees with 1982", Math.abs(g3 - want2) * 240 < 0.05, `diff ${((g3 - want2) * 240 * 1000).toFixed(1)} ms of time`);
  const d = A.wrap360(A.gmst2006(jd("2026-09-28T00:00:00Z")) - A.gmst2006(jd("2026-09-27T00:00:00Z")));
  check("Sidereal time gains 0.9856 deg per solar day", Math.abs(d - 0.98565) < 1e-4, `${d.toFixed(5)} deg = ${(d / 360 * 86400 / 1.0027379).toFixed(2)} s`);
}

/* ---- precession ---- */
{
  // Meeus 21.b: theta Persei, J2000 position with proper motion applied, to 2028 Nov 13.19 TD
  const jdTD = 2462088.69, jdU = jdTD - A.TT_MINUS_UTC / 86400;
  const p = A.precess(41.054063, 49.227750, jdU);
  check("Precession IAU 1976, Meeus 21.b (RA)", Math.abs(p.ra - 41.547214) < 2e-4, `${p.ra.toFixed(6)} vs 41.547214`);
  check("Precession IAU 1976, Meeus 21.b (Dec)", Math.abs(p.dec - 49.348483) < 2e-4, `${p.dec.toFixed(6)} vs 49.348483`);
}

/* ---- horizontal coordinates ---- */
{
  // Meeus 13.b: Venus from the US Naval Observatory, 1987 Apr 10 19:21 UT, apparent sidereal time 128.7362803
  const lat = 38 + 55 / 60 + 17 / 3600, lon = -(77 + 3 / 60 + 56 / 3600);
  const h = A.eqToAltAzClassic(347.3193375, -6.719892, lat, 128.7362803 + lon);
  check("Alt/az, Meeus 13.b altitude", Math.abs(h.alt - 15.1249) < 2e-3, `${h.alt.toFixed(4)} vs 15.1249`);
  check("Alt/az, Meeus 13.b azimuth", Math.abs(h.az - (68.0337 + 180)) < 2e-3, `${h.az.toFixed(4)} vs 248.0337 (68.0337 from south)`);
  // matrix pipeline == textbook formula (after precession)
  let worst = 0;
  for (let k = 0; k < 50; k++) {
    const ra = (k * 73.1) % 360, dec = -80 + (k * 37.7) % 160, j = jd("2026-01-01T00:00:00Z") + k * 7.3, lat2 = -60 + (k * 13) % 120, lon2 = -170 + (k * 29) % 340;
    const M = A.horizontalMatrix(j, lat2, lon2), a1 = A.vecToAltAz(A.mulMV(M, A.raDecToVec(ra, dec)));
    const pd = A.precess(ra, dec, j), a2 = A.eqToAltAzClassic(pd.ra, pd.dec, lat2, A.lst(j, lon2));
    worst = Math.max(worst, Math.abs(a1.alt - a2.alt), Math.abs(A.wrap180(a1.az - a2.az)) * Math.cos(a1.alt * A.D2R));
  }
  check("Rotation-matrix pipeline equals textbook formulas", worst < 1e-8, `max diff ${worst.toExponential(1)} deg over 50 cases`);
}

/* ---- refraction ---- */
{
  const r0 = A.refractionFromApparent(0) * 60;
  check("Bennett refraction at the horizon", Math.abs(r0 - 34.5) < 0.3, `${r0.toFixed(2)}' (Meeus: about 34.5')`);
  let worst = 0;
  for (const h0 of [0.5, 2, 5, 10, 30, 60]) { const t = h0 - A.refractionFromApparent(h0); worst = Math.max(worst, Math.abs(A.refractionFromTrue(t) - A.refractionFromApparent(h0)) * 3600); }
  check("Saemundsson inverts Bennett", worst < 15, `max mismatch ${worst.toFixed(1)}" for apparent altitudes 0.5..60 deg`);
  check("Refraction vanishes at the zenith", A.refractionFromTrue(90) * 3600 < 0.1, `${(A.refractionFromTrue(90) * 3600).toFixed(3)}"`);
}

/* ---- Polaris altitude = latitude ---- */
{
  const stars = JSON.parse(readFileSync(new URL("../site/data/sky/stars.json", import.meta.url))).stars;
  const pol = stars.find(s => s[0] === 11767);
  const v = A.raDecToVec(pol[1], pol[2]);
  let worst = 0;
  for (const lat of [34.05, 51.48, 10, 64.8]) for (let k = 0; k < 24; k++) {
    const j = jd("2026-09-27T00:00:00Z") + k * 0.37 + k * 15;
    const a = A.vecToAltAz(A.mulMV(A.horizontalMatrix(j, lat, -118.25), v));
    worst = Math.max(worst, Math.abs(a.alt + A.refractionFromTrue(a.alt) - lat));
  }
  check("Polaris altitude = observer latitude", worst < 0.75, `max |alt - latitude| ${worst.toFixed(3)} deg (Polaris sits ${(90 - A.precess(pol[1], pol[2], jd("2026-09-27")).dec).toFixed(3)} deg from the pole in 2026)`);
  const s = A.altAzOf(v, jd("2026-09-27T06:00:00Z"), -89.99, 0);
  check("Polaris is below the horizon at the South Pole", s.alt < -80, `alt ${s.alt.toFixed(2)}`);
}

/* ---- the Sun ---- */
{
  // Local noon near the September equinox (2026 Sep 23 00:05 UT) in Los Angeles
  const r = A.riseSetTransit("sun", jd("2026-09-22T07:00:00Z"), 34.05, -118.25, -0.8333);
  const tr = r.transits[0];
  const app = tr.alt + A.refractionFromTrue(tr.alt);
  check("Sun at local noon, September equinox, Los Angeles", Math.abs(app - (90 - 34.05)) < 0.35, `apparent alt ${app.toFixed(3)} vs 90 - 34.05 = 55.95 at ${fmtT(tr.jd, -7)} PDT`);
  // Griffith Observatory table (USNO data)
  const GO = { lat: 34 + 7 / 60 + 7.05 / 3600, lon: -(118 + 18 / 60 + 1.5 / 3600) };
  const rows = [
    ["2026-01-01", -8, "06:31", "06:59", "11:57", "16:55", "17:23"],
    ["2026-03-20", -7, "06:32", "06:57", "13:01", "19:05", "19:30"],
    ["2026-06-21", -7, "05:13", "05:42", "12:55", "20:08", "20:37"],
    ["2026-09-22", -7, "06:16", "06:41", "12:46", "18:50", "19:15"],
    ["2026-12-21", -8, "06:27", "06:55", "11:51", "16:48", "17:16"]];
  const mins = s => +s.slice(0, 2) * 60 + +s.slice(3);
  for (const [day, off, cb, rise, noon, set, ce] of rows) {
    const j0 = jd(`${day}T00:00:00Z`) - off / 24;
    const e = A.sunEvents(j0, GO.lat, GO.lon);
    const got = [e.civil.rises[0], e.rise[0], e.transit[0].jd, e.set[0], e.civil.sets[0]].map(j => fmtT(j, off));
    const want = [cb, rise, noon, set, ce];
    const err = Math.max(...got.map((g, i) => Math.abs(mins(g) - mins(want[i]))));
    check(`Sun times Los Angeles ${day} vs Griffith/USNO`, err <= 2, `rise ${got[1]} (${rise}) noon ${got[2]} (${noon}) set ${got[3]} (${set}) civil ${got[0]}-${got[4]} (${cb}-${ce}); worst ${err} min`);
  }
}

/* ---- the Moon ---- */
{
  const f = A.moonPhase(jd("2026-09-26T16:49:00Z"));
  check("Full Moon 2026 Sep 26 16:49 UT", f.illum > 0.995 && Math.abs(f.elongLon - 180) < 2, `illuminated ${(f.illum * 100).toFixed(2)}%, elongation ${f.elongLon.toFixed(2)} deg, "${f.name}"`);
  const n = A.moonPhase(jd("2026-08-12T17:37:00Z"));
  check("New Moon 2026 Aug 12 17:37 UT (total solar eclipse)", n.illum < 0.005 && Math.min(n.elongLon, 360 - n.elongLon) < 2, `illuminated ${(n.illum * 100).toFixed(2)}%, elongation ${n.elongLon.toFixed(2)} deg`);
  const q = A.moonPhase(jd("2026-09-26T16:49:00Z") - 7.4);
  check("A week before full is near first quarter", Math.abs(q.illum - 0.5) < 0.12 && q.waxing, `${(q.illum * 100).toFixed(0)}% "${q.name}"`);
  const m = A.moonPhase(jd("2026-09-20T03:00:00Z"));
  check("Waxing Moon's bright limb faces west (chi near 270 deg)", m.waxing && Math.abs(A.wrap180(m.chi - 270)) < 45, `chi ${m.chi.toFixed(1)} deg`);
  const rs = A.riseSetTransit("moon", jd("2026-09-26T07:00:00Z"), 34.05, -118.25, null);
  const rise = rs.rises.map(j => fmtT(j, -7)), set = rs.sets.map(j => fmtT(j, -7));
  check("Full Moon rises near sunset, sets near sunrise", rs.rises.some(j => Math.abs(fmtHours(j, -7) - 18.8) < 1) && rs.sets.some(j => Math.abs(fmtHours(j, -7) - 6.9) < 1.3), `moonrise ${rise} moonset ${set} PDT`);
}
function fmtHours(j, off) { const d = new Date(A.jdToMs(j) + off * 3600e3); return d.getUTCHours() + d.getUTCMinutes() / 60; }

/* ---- planets ---- */
{
  const s = A.body("saturn", jd("2026-10-04T12:00:00Z"));
  check("Saturn at opposition 2026 Oct 04", s.elong > 176, `elongation ${s.elong.toFixed(2)} deg, mag ${s.mag.toFixed(2)}, ring tilt ${A.saturnRingTilt(s.v).toFixed(1)} deg`);
  const m = A.body("mars", jd("2026-01-09T12:00:00Z"));
  check("Mars at solar conjunction 2026 Jan 09", m.elong < 2, `elongation ${m.elong.toFixed(2)} deg`);
  let vmin = 9, vmax = -9;
  for (let k = 0; k < 60; k++) { const v = A.body("venus", jd("2026-01-01") + k * 9.1); if (v.elong > 12) { vmin = Math.min(vmin, v.mag); vmax = Math.max(vmax, v.mag); } }
  check("Venus magnitude stays between -4.9 and -3.7", vmin > -4.95 && vmax < -3.7, `range ${vmin.toFixed(2)} .. ${vmax.toFixed(2)}`);
  const j = A.body("jupiter", jd("2026-01-10T12:00:00Z"));
  check("Jupiter near its 2026 Jan 10 opposition is about -2.7", j.mag < -2.4 && j.mag > -3.0 && j.illum > 0.99, `mag ${j.mag.toFixed(2)}, lit ${(j.illum * 100).toFixed(1)}%, light-time ${(j.lightSeconds / 60).toFixed(1)} min`);
}

/* ---- colours, lookup ---- */
{
  const t = A.bvToTemp(0.65);
  check("B-V 0.65 (the Sun) gives about 5800 K", Math.abs(t - 5800) < 250, `${t.toFixed(0)} K`);
  const rgb = A.tempToRGB(3500), rgb2 = A.tempToRGB(12000);
  check("Cool stars are red, hot stars blue", rgb[0] > rgb[2] && rgb2[2] >= rgb2[0], `3500 K -> ${rgb.map(x => x.toFixed(2))}, 12000 K -> ${rgb2.map(x => x.toFixed(2))}`);
  const b = JSON.parse(readFileSync(new URL("../site/data/sky/boundaries.json", import.meta.url))).bounds;
  const which = (ra, dec) => { const p = A.raDecToVec(ra, dec); return b.filter(([id, poly]) => A.inSphericalPolygon(p, poly)).map(x => x[0]).join(","); };
  const cases = [[88.793, 7.407, "Ori", "Betelgeuse"], [37.955, 89.264, "UMi", "Polaris"], [101.287, -16.716, "CMa", "Sirius"],
    [2.097, 29.09, "And", "Alpheratz"], [317.2, -88.96, "Oct", "sigma Octantis"], [279.234, 38.784, "Lyr", "Vega"], [266.417, -29.008, "Sgr", "Sgr A*"], [0.5, 0.5, "Psc", "RA 0.5, Dec 0.5"]];
  for (const [ra, dec, want, nm] of cases) { const got = which(ra, dec); check(`Constellation of ${nm}`, got === want, got || "(none)"); }
  const g = A.galactic(A.raDecToVec(266.405, -28.936));
  check("Galactic centre at l = 0, b = 0", Math.abs(A.wrap180(g.l)) < 0.1 && Math.abs(g.b) < 0.1, `l ${g.l.toFixed(3)}, b ${g.b.toFixed(3)}`);
}

/* ---- rise/set for a fixed star ---- */
{
  const sir = A.raDecToVec(101.287, -16.716);
  const r = A.riseSetTransit(sir, jd("2026-01-15T08:00:00Z"), 34.05, -118.25, -0.5667);
  const tr = r.transits[0];
  check("Sirius culminates at 90 - 34.05 - 16.7 = 39.2 deg", Math.abs(tr.alt - 39.19) < 0.2, `${tr.alt.toFixed(2)} deg; rise ${fmtT(r.rises[0], -8)} set ${fmtT(r.sets[0], -8)} PST`);
  check("Circumpolar test: Dubhe from LA, Canopus never from London", A.circumpolarState(61.75, 34.05) === "circumpolar" && A.circumpolarState(-52.7, 51.5) === "never", "ok");
}

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
