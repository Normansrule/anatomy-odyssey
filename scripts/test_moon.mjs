#!/usr/bin/env node
/* Unit tests for site/assets/js/moon-astro.js and site/data/moon.json (Moon explorer).
 *
 *   node --no-warnings scripts/test_moon.mjs
 *
 * Reference values
 *   [M]  J. Meeus, "Astronomical Algorithms", 2nd ed. (1998): Example 25.a (Sun, 1992 Oct 13),
 *        47.a (Moon, 1992 Apr 12: lambda 133.162655, beta -3.229126, distance 368409.7 km),
 *        48.a (illuminated fraction 0.6786), 49.a (new Moon 1977 Feb 18 03:37:40 TD),
 *        53.a (libration l' -1.206, b' +4.194, l -1.23, b +4.20, P 15.08).
 *   [E]  F. Espenak, "Phases of the Moon 2001-2100" (astropixels.com): full Moon 2026 Sep 26 16:49 UT,
 *        new Moon 2026 Aug 12 17:37 UT, full Moon 2026 Mar 3 11:38 UT, new Moon 2024 Apr 8 18:21 UT,
 *        new Moon 2017 Aug 21 18:30 UT.
 *   [NASA] F. Espenak, NASA GSFC eclipse website, Lunar Eclipses 2021-2030 and Solar Eclipses
 *        2021-2040 (dates, gamma, totality durations) - the same values stored in data/moon.json.
 *   [ALSJ] Apollo Lunar Surface Journal, Landing Site Coordinates (Apollo 11: 0.67408 N, 23.47297 E).
 */
import { readFileSync } from "node:fs";
import * as M from "../site/assets/js/moon-astro.js";
import * as SKY from "../site/assets/js/sky-astro.js";

let fails = 0, passes = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`); ok ? passes++ : fails++; }
const fromTD = jde => jde - M.TT_MINUS_UTC / 86400;        // the examples are given in TD
const jd = s => M.julianDay(new Date(s));
const iso = j => new Date(M.jdToMs(j)).toISOString().slice(0, 16).replace("T", " ");
const minutes = (a, b) => (a - b) * 1440;

/* ---- Sun and Moon positions ---- */
{
  const s = M.sun(fromTD(2448908.5));
  check("Sun apparent longitude, Meeus 25.a", Math.abs(s.app - 199.90895) < 0.01, `${s.app.toFixed(5)} vs 199.90895 (low-accuracy method: 199.90988)`);
  check("Sun distance, Meeus 25.a", Math.abs(s.R - 0.99766) < 1e-4, `${s.R.toFixed(5)} AU vs 0.99766`);
  const m = M.moon(fromTD(2448724.5));
  check("Moon longitude, Meeus 47.a", Math.abs(m.lon - 133.162655) < 1e-4, `${m.lon.toFixed(6)} vs 133.162655`);
  check("Moon latitude, Meeus 47.a", Math.abs(m.lat + 3.229126) < 1e-4, `${m.lat.toFixed(6)} vs -3.229126`);
  check("Moon distance, Meeus 47.a", Math.abs(m.distKm - 368409.7) < 1, `${m.distKm.toFixed(1)} km vs 368409.7`);
  // cross-check against the planetarium's (lower-precision) Moon in sky-astro.js / ephemeris.js
  const j = jd("2026-10-01T00:00:00Z"), b = SKY.body("moon", j), mm = M.moon(j), n = M.nutation(j);
  const eq = M.eclToEqu(mm.app, mm.lat, n.eps);
  const p = SKY.precess(SKY.vecToRaDec(b.v).ra, SKY.vecToRaDec(b.v).dec, j);
  const sep = Math.acos(Math.sin(eq.dec * M.D2R) * Math.sin(p.dec * M.D2R) + Math.cos(eq.dec * M.D2R) * Math.cos(p.dec * M.D2R) * Math.cos((eq.ra - p.ra) * M.D2R)) * M.R2D;
  check("Agrees with the sky page's Moon (0.3 deg theory) to < 0.5 deg", sep < 0.5, `${sep.toFixed(3)} deg apart on 2026-10-01`);
}

/* ---- illuminated fraction ---- */
{
  const k = M.phase(fromTD(2448724.5)).illum;
  check("Illuminated fraction, Meeus 48.a", Math.abs(k - 0.6786) < 0.001, `${k.toFixed(4)} vs 0.6786`);
  const full = M.phase(jd("2026-09-26T16:49:00Z")), newm = M.phase(jd("2026-08-12T17:37:00Z"));
  check("Full Moon of 2026 Sep 26 is > 99.8% lit", full.illum > 0.998, (full.illum * 100).toFixed(2) + "%");
  check("New Moon of 2026 Aug 12 is < 0.2% lit", newm.illum < 0.002, (newm.illum * 100).toFixed(3) + "%");
  const q = M.phase(jd("2026-10-03T13:25:00Z"));
  check("Last quarter is about 50% lit and waning", Math.abs(q.illum - 0.5) < 0.02 && !q.waxing, `${(q.illum * 100).toFixed(1)}%, ${q.name}`);
}

/* ---- phase times ---- */
{
  const cases = [
    ["2026-09-26T16:49:00Z", 2, "full Moon 2026 Sep 26 16:49 UT [E]"],
    ["2026-08-12T17:37:00Z", 0, "new Moon 2026 Aug 12 17:37 UT [E]"],
    ["2026-03-03T11:38:00Z", 2, "full Moon 2026 Mar 3 11:38 UT [E]"],
    ["2024-04-08T18:21:00Z", 0, "new Moon 2024 Apr 8 18:21 UT [E]"],
    ["2017-08-21T18:30:00Z", 0, "new Moon 2017 Aug 21 18:30 UT [E]"]
  ];
  for (const [t, type, name] of cases) {
    const want = jd(t), got = M.phaseTimes(want - 2, want + 2).find(p => p.type === type);
    const d = got ? minutes(got.jd, want) : NaN;
    check(`Phase time: ${name}`, Math.abs(d) < 3, got ? `${iso(got.jd)} UT (${d >= 0 ? "+" : ""}${d.toFixed(1)} min)` : "not found");
  }
  const ex = M.phaseTimes(fromTD(2443190), fromTD(2443195)).find(p => p.type === 0);
  const d = minutes(M.jde(ex.jd), 2443192.65118);
  check("New Moon, Meeus 49.a (1977 Feb 18 03:37:40 TD)", Math.abs(d) < 2, `${d.toFixed(2)} min`);
  const all = M.phaseTimes(jd("2026-01-01T00:00:00Z"), jd("2027-01-01T00:00:00Z"));
  check("2026 has 13 full Moons (two in May: a 'blue Moon') and 12 new Moons", all.filter(p => p.type === 2).length === 13 && all.filter(p => p.type === 0).length === 12 && all.filter(p => p.type === 2 && new Date(M.jdToMs(p.jd)).getUTCMonth() === 4).length === 2, `${all.filter(p => p.type === 2).length} full, ${all.filter(p => p.type === 0).length} new`);
  const gaps = all.filter(p => p.type === 0).map(p => p.jd).map((x, i, a) => (i ? x - a[i - 1] : null)).filter(Boolean);
  check("Synodic months 29.27-29.83 d", gaps.every(g => g > 29.2 && g < 29.9), gaps.map(g => g.toFixed(2)).join(" "));
}

/* ---- libration (Meeus example 53.a, 1992 April 12, 0h TD) ---- */
{
  const L = M.libration(fromTD(2448724.5));
  check("Optical libration in longitude l' = -1.206", Math.abs(L.lOpt + 1.206) < 0.01, L.lOpt.toFixed(3));
  check("Optical libration in latitude b' = +4.194", Math.abs(L.bOpt - 4.194) < 0.01, L.bOpt.toFixed(3));
  check("Total libration l = -1.23 (within 0.5 deg)", Math.abs(L.l + 1.23) < 0.5, L.l.toFixed(3));
  check("Total libration b = +4.20 (within 0.5 deg)", Math.abs(L.b - 4.20) < 0.5, L.b.toFixed(3));
  check("Position angle of the axis P = 15.08 (within 0.5 deg)", Math.abs(L.P - 15.08) < 0.5, L.P.toFixed(3));
  // over one month the libration stays inside its known bounds (+-8.2 deg lon, +-6.9 deg lat)
  let lmax = 0, bmax = 0;
  for (let i = 0; i < 400; i++) { const x = M.libration(jd("2026-01-01T00:00:00Z") + i * 0.9); lmax = Math.max(lmax, Math.abs(x.l)); bmax = Math.max(bmax, Math.abs(x.b)); }
  check("Libration over a year within +-8.2 deg lon, +-6.9 deg lat, and large", lmax < 8.2 && bmax < 6.9 && lmax > 6 && bmax > 6, `max |l| ${lmax.toFixed(2)}, max |b| ${bmax.toFixed(2)}`);
  // sub-solar point: at full Moon the Sun stands over the sub-Earth point; at first quarter 90 deg east
  // the arc from the sub-Earth to the sub-solar point is the phase angle i (Sun-Moon-Earth)
  for (const t of ["2026-09-26T16:49:00Z", "2026-10-01T00:00:00Z", "2026-10-18T16:12:00Z"]) {
    const F = M.libration(jd(t)), i = M.phase(jd(t)).phaseAngle;
    const sep = M.surfaceDistanceKm(F.l, F.b, F.sunLon, F.sunLat) / M.MOON_RADIUS_KM * M.R2D;
    check(`Sub-Earth to sub-solar arc equals the phase angle (${t.slice(0, 10)})`, Math.abs(sep - i) < 0.3, `${sep.toFixed(2)} vs i = ${i.toFixed(2)} deg`);
  }
  const q1 = M.phaseTimes(jd("2026-10-15T00:00:00Z"), jd("2026-10-22T00:00:00Z")).find(p => p.type === 1);
  const Fq = M.libration(q1.jd);
  check("First quarter: the morning terminator (lon = -colongitude) crosses the disc centre (lon = l)", Math.abs(M.wrap180(Fq.colongitude + Fq.l)) < 1.5, `colongitude ${Fq.colongitude.toFixed(2)}, l ${Fq.l.toFixed(2)}`);
}

/* ---- eclipses ---- */
{
  const data = JSON.parse(readFileSync(new URL("../site/data/moon.json", import.meta.url)));
  for (const e of data.lunarEclipses) {
    const c = M.lunarEclipse(jd(e.date + "T12:00:00Z"));
    const sameDay = new Date(M.jdToMs(c.jdMax)).toISOString().slice(0, 10) === e.date;
    check(`Lunar eclipse ${e.date}: total, totality ${e.totMin} min`, c.type === "total" && sameDay && Math.abs(c.totalMin - e.totMin) < 3 && Math.abs(c.umbralMag - e.umag) < 0.02,
      `computed ${c.type} at ${iso(c.jdMax)} UT, totality ${c.totalMin.toFixed(1)} min, umbral mag ${c.umbralMag.toFixed(3)} vs ${e.umag}`);
  }
  // the partial / penumbral eclipses in 2026-2030 must NOT come out total
  for (const [d, want] of [["2026-08-28", "partial"], ["2028-01-12", "partial"], ["2028-07-06", "partial"], ["2030-06-15", "partial"], ["2027-02-20", "penumbral"], ["2030-12-09", "penumbral"]]) {
    const c = M.lunarEclipse(jd(d + "T12:00:00Z"));
    check(`Lunar eclipse ${d} is ${want}, not total`, c.type === want, `computed ${c.type}, umbral mag ${c.umbralMag.toFixed(3)}`);
  }
  for (const e of data.solarEclipses) {
    const c = M.solarEclipse(jd(e.date + "T12:00:00Z"));
    const kindOk = e.type === "hybrid" ? c.central : c.kind === e.type;
    const sameDay = new Date(M.jdToMs(c.jdMax)).toISOString().slice(0, 10) === e.date;
    check(`Solar eclipse ${e.date}: ${e.type}, gamma ${e.gamma}`, kindOk && sameDay && Math.abs(c.gamma - e.gamma) < 0.01,
      `computed ${c.kind} at ${iso(c.jdMax)} UT, gamma ${c.gamma.toFixed(4)}`);
  }
}

/* ---- sites ---- */
{
  const data = JSON.parse(readFileSync(new URL("../site/data/moon.json", import.meta.url)));
  const by = id => data.sites.find(s => s.id === id);
  const a11 = by("apollo11");
  check("Apollo 11 at 0.674 N, 23.473 E (ALSJ)", Math.abs(a11.lat - 0.674) < 0.001 && Math.abs(a11.lon - 23.473) < 0.001, `${a11.lat}, ${a11.lon}`);
  check("Surveyor 3 within 200 m of the Apollo 12 Lunar Module (it landed ~180 m away)",
    M.surfaceDistanceKm(by("surveyor3").lon, by("surveyor3").lat, by("apollo12").lon, by("apollo12").lat) < 0.4,
    M.surfaceDistanceKm(by("surveyor3").lon, by("surveyor3").lat, by("apollo12").lon, by("apollo12").lat).toFixed(3) + " km");
  check("Surveyor 5 about 25 km from Apollo 11", Math.abs(M.surfaceDistanceKm(by("surveyor5").lon, by("surveyor5").lat, a11.lon, a11.lat) - 25) < 5,
    M.surfaceDistanceKm(by("surveyor5").lon, by("surveyor5").lat, a11.lon, a11.lat).toFixed(1) + " km");
  const ids = ["luna2", "luna9", "luna13", "luna16", "luna17", "luna20", "luna21", "luna24", "surveyor1", "surveyor3", "surveyor5", "surveyor6", "surveyor7",
    "apollo11", "apollo12", "apollo14", "apollo15", "apollo16", "apollo17", "change3", "change4", "change5", "change6", "chandrayaan3", "slim", "im1", "im2", "blueghost1", "artemis3"];
  const missing = ids.filter(i => !by(i));
  check("All requested missions present", missing.length === 0, missing.join(", ") || `${data.sites.length} sites`);
  const bad = data.sites.filter(s => !(Math.abs(s.lat) <= 90 && Math.abs(s.lon) <= 180 && s.link && /^https:\/\//.test(s.link) && s.summary && s.agency));
  check("Every site has valid coordinates, a link, a summary and an agency", bad.length === 0, bad.map(s => s.id).join(", "));
  const far = data.sites.filter(s => Math.abs(s.lon) > 90).map(s => s.id).sort();
  check("Far-side sites are exactly Chang'e 4 and Chang'e 6", far.join() === "change4,change6", far.join(", "));
  const lrv = data.sites.filter(s => s.tags.includes("lrv")).map(s => s.id).sort();
  check("Lunar Roving Vehicle missions: Apollo 15, 16, 17", lrv.join() === "apollo15,apollo16,apollo17", lrv.join(", "));
  const llr = data.sites.filter(s => s.tags.includes("llr")).map(s => s.id).sort();
  check("Retroreflectors: Apollo 11, 14, 15, Lunokhod 1 and 2", llr.join() === "apollo11,apollo14,apollo15,luna17,luna21", llr.join(", "));
  const crewed = data.sites.filter(s => s.kind === "crewed").map(s => s.crew.split(";")[0].split(",").length);
  check("Six crewed landings, two moonwalkers each", crewed.length === 6 && crewed.every(n => n === 2), crewed.join(" "));
  check("South polar sites (Chandrayaan-3, IM-1, IM-2, Artemis III) are south of 69 S", ["chandrayaan3", "im1", "im2", "artemis3"].every(i => by(i).lat < -69));
  check("Artemis III is labelled as planned", by("artemis3").kind === "planned" && /planned/i.test(by("artemis3").name));
  const sorted = data.sites.filter(s => s.date !== "planned").every((s, i, a) => !i || s.date >= a[i - 1].date);
  check("Sites listed in date order", sorted);
}

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
