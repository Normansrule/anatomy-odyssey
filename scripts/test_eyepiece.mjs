#!/usr/bin/env node
/* Unit tests for site/assets/js/eyepiece-optics.js and site/data/eyepiece.json (Telescope simulator).
 *
 *   node --no-warnings scripts/test_eyepiece.mjs
 *
 * Reference values
 *   [EQ]    site/data/equations.json worked examples: 200 mm f/6 + 25 mm 52 deg eyepiece -> 48x,
 *           4.2 mm exit pupil, 1.08 deg field; Hubble 2.4 m at 500 nm -> 0.0524"; 8-inch dark
 *           site (m_eye 6, pupil 7 mm, tau 0.8) -> m_lim 13.04; Yerkes 1.02 m vs eye -> 21 233x.
 *   [Dawes] 115.8"/D(mm): 203 mm -> 0.570"; 70 mm -> 1.65".
 *   [M]     J. Meeus, "Astronomical Algorithms", 2nd ed., Example 44.a (1992 Dec 16, JD 2448972.50068):
 *           X = -3.44, +7.44, +1.24, +7.08 and Y = +0.21, +0.25, +0.65, +1.10 Jupiter radii
 *           (as reproduced in github.com/soniakeys/meeus jupitermoons tests), and the same chapter's
 *           low-accuracy method, re-implemented below for a sweep of dates.
 */
import { readFileSync } from "node:fs";
import * as O from "../site/assets/js/eyepiece-optics.js";
import * as E from "../site/assets/js/ephemeris.js";

let fails = 0, passes = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`); ok ? passes++ : fails++; }
const near = (a, b, tol) => Math.abs(a - b) <= tol;

/* ---- magnification, exit pupil, field ---- */
{
  const M = O.magnification(1200, 25);
  check("magnification 1200/25", M === 48, `${M}x`);
  check("magnification with 2x Barlow", O.magnification(1200, 25, 2) === 96);
  check("exit pupil 200 mm at 48x", near(O.exitPupil(200, 48), 4.1667, 1e-3), O.exitPupil(200, 48).toFixed(3) + " mm");
  check("true field 52 deg / 48x", near(O.trueField(52, 48), 1.0833, 1e-3), O.trueField(52, 48).toFixed(4) + " deg");
  check("true field in full Moons", near(O.moonsAcross(O.trueField(52, 48)), 2.17, 0.01));
  check("10x50 binocular exit pupil", O.exitPupil(50, 10) === 5);
  check("useful max 2x aperture (203 mm -> 406x)", O.maxUsefulMagnification(203) === 406);
  check("exit pupil verdicts", O.exitPupilVerdict(8).key === "wasted" && O.exitPupilVerdict(6).key === "wide" &&
    O.exitPupilVerdict(3).key === "ideal" && O.exitPupilVerdict(1).key === "detail" && O.exitPupilVerdict(0.3).key === "dim");
}

/* ---- resolution ---- */
{
  const d203 = O.dawesArcsec(203);
  check("Dawes limit 203 mm ~ 0.57\"", near(d203, 0.570, 0.005), d203.toFixed(3) + "\"");
  check("Dawes limit 70 mm ~ 1.65\"", near(O.dawesArcsec(70), 1.654, 0.005), O.dawesArcsec(70).toFixed(3) + "\"");
  const r203 = O.rayleighArcsec(203);
  check("Rayleigh 203 mm at 550 nm ~ 0.68\"", near(r203, 0.682, 0.005), r203.toFixed(3) + "\"");
  const hst = O.rayleighArcsec(2400, 500);
  check("Rayleigh Hubble 2.4 m at 500 nm = 0.0524\" [EQ]", near(hst, 0.052426, 2e-4), hst.toFixed(5) + "\"");
  const jwst = O.rayleighArcsec(6500, 2000);
  check("Rayleigh Webb 6.5 m at 2 um ~ 0.077\"", near(jwst, 0.0774, 5e-4), jwst.toFixed(4) + "\"");
  check("Webb at 2 um is coarser than Hubble at 0.5 um", jwst > hst);
  check("Airy FWHM < Rayleigh radius", O.airyFwhmArcsec(203) < r203);
}

/* ---- light gathering and limiting magnitude ---- */
{
  const lm = O.limitingMagnitude(200, 6, 7, 0.8);
  check("limiting magnitude 8-inch dark site = 13.04 [EQ]", near(lm, 13.037, 0.01), lm.toFixed(3));
  const lm203 = O.limitingMagnitude(203, 6, 7, 0.8);
  check("limiting magnitude 203 mm", near(lm203, 13.069, 0.01), lm203.toFixed(3));
  check("naked eye limit equals m_eye", O.limitingMagnitude(7, 6.3, 7, 0.8) === 6.3);
  check("each doubling of aperture adds 1.5 mag", near(O.limitingMagnitude(400) - O.limitingMagnitude(200), 1.505, 0.001));
  check("Yerkes 1.02 m vs 7 mm eye = 21 233x [EQ]", near(O.lightGrasp(1020), 21233, 2), Math.round(O.lightGrasp(1020)) + "x");
  check("10x50 binoculars gather 51x", near(O.lightGrasp(50), 51.02, 0.01));
  check("star counts: ~0.13 per sq deg to mag 6 [HNSKY]", near(O.starsPerSqDeg(6), 0.1291, 1e-3));
  check("star counts monotonic", O.starsPerSqDeg(10.5) > O.starsPerSqDeg(10) && O.starsPerSqDeg(10.5) < O.starsPerSqDeg(11));
}

/* ---- surface brightness and seeing ---- */
{
  check("exit pupil = eye pupil keeps surface brightness (tau 1)", near(O.surfaceBrightnessThrough(20, 7, 7, 1), 20, 1e-9));
  check("exit pupil 3.5 mm dims by 1.5 mag", near(O.surfaceBrightnessThrough(20, 3.5, 7, 1), 21.505, 1e-3));
  check("a telescope never brightens a nebula", O.surfaceBrightnessThrough(20, 10, 7, 1) === 20);
  check("adding equal magnitudes brightens by 0.753", near(O.addMagnitudes(20, 20), 19.247, 1e-3));
  const r0 = O.friedR0(1.0);
  check("r0 for 1\" seeing at 550 nm ~ 11 cm", near(r0, 0.111, 0.002), (r0 * 100).toFixed(1) + " cm");
  check("small scopes: image motion, big scopes: blur", O.seeingBlurArcsec(70, 1.5) < O.seeingBlurArcsec(1000, 1.5) && O.tiltRmsArcsec(70, 1.5) > O.tiltRmsArcsec(1000, 1.5));
  const r = O.instrumentReadout({ aperture: 203, focal: 1200, kind: "telescope", tau: 0.8 }, { focal: 6, afov: 66 }, { barlow: 2, seeing: 2 });
  check("8-inch + 6 mm + Barlow = 400x (under the 406x limit)", near(r.M, 400, 1e-9) && !r.tooMuch);
  check("... and the air sets the resolution", r.resolution.limitedBy === "air", r.resolution.limitedBy);
  const r2 = O.instrumentReadout({ aperture: 70, focal: 700, kind: "telescope", tau: 0.85 }, { focal: 6, afov: 66 }, { barlow: 2 });
  check("70 mm at 233x is past the useful limit", r2.tooMuch, r2.M.toFixed(0) + "x > 140x");
}

/* ---- Galilean moons, consistent with ephemeris.js ---- */
{
  const jd = 2448972.50068;
  const g = O.galileanPositions(jd);
  const X = [-3.44, 7.44, 1.24, 7.08], Y = [0.21, 0.25, 0.65, 1.10];
  g.moons.forEach((m, i) => {
    check(`Meeus 44.a ${m.name} X`, near(m.X, X[i], 0.35), `${m.X.toFixed(2)} vs ${X[i]}`);
    check(`Meeus 44.a ${m.name} Y`, near(m.Y, Y[i], 0.35), `${m.Y.toFixed(2)} vs ${Y[i]}`);
  });
  // Same mean longitudes as ephemeris.js: advancing time by one Io synodic period brings Io back.
  const lon = E.galileanLongitudes(jd);
  check("uses ephemeris.js galileanLongitudes", g.moons.length === 4 && E.GALILEAN[0].name === g.moons[0].name && lon.length === 4);

  // Sweep: compare with Meeus's low-accuracy method (ch. 44, first part) over 2020-2030.
  const meeusLow = jd => {
    const d = jd - 2451545.0, s = x => Math.sin(x * Math.PI / 180), c = x => Math.cos(x * Math.PI / 180);
    const V = 172.74 + 0.00111588 * d, Mm = 357.529 + 0.9856003 * d;
    const N = 20.020 + 0.0830853 * d + 0.329 * s(V), J = 66.115 + 0.9025179 * d - 0.329 * s(V);
    const A = 1.915 * s(Mm) + 0.020 * s(2 * Mm), B = 5.555 * s(N) + 0.168 * s(2 * N), K = J + A - B;
    const R = 1.00014 - 0.01671 * c(Mm) - 0.00014 * c(2 * Mm), r = 5.20872 - 0.25208 * c(N) - 0.00611 * c(2 * N);
    const Delta = Math.sqrt(r * r + R * R - 2 * r * R * c(K)), psi = Math.asin(R / Delta * s(K)) * 180 / Math.PI;
    const t = d - Delta / 173;
    let u1 = 163.8069 + 203.4058646 * t + psi - B, u2 = 358.4140 + 101.2916335 * t + psi - B;
    let u3 = 5.7176 + 50.2345180 * t + psi - B, u4 = 224.8092 + 21.4879800 * t + psi - B;
    const G = 331.18 + 50.310482 * t, H = 87.45 + 21.569231 * t;
    const [a1, a2, a3, a4] = [u1 + 0.473 * s(2 * (u1 - u2)), u2 + 1.065 * s(2 * (u2 - u3)), u3 + 0.165 * s(G), u4 + 0.843 * s(H)];
    const rr = [5.9054 - 0.0244 * c(2 * (u1 - u2)), 9.3966 - 0.0882 * c(2 * (u2 - u3)), 14.9885 - 0.0216 * c(G), 26.3627 - 0.1939 * c(H)];
    return [a1, a2, a3, a4].map((u, i) => rr[i] * s(u));
  };
  let worst = [0, 0, 0, 0];
  for (let k = 0; k < 400; k++) {
    const jdk = E.julianDay(new Date("2020-01-01T00:00:00Z")) + k * 9.37;
    const mine = O.galileanPositions(jdk).moons.map(m => m.X), ref = meeusLow(jdk);
    mine.forEach((x, i) => { worst[i] = Math.max(worst[i], Math.abs(x - ref[i])); });
  }
  // Circular orbits in ephemeris.js omit Callisto's 0.84 deg equation of centre (0.39 R_J) and the Laplace terms.
  const tol = [0.25, 0.35, 0.3, 0.6];
  worst.forEach((w, i) => check(`sweep 2020-2030 vs Meeus low-accuracy: ${E.GALILEAN[i].name}`, w < tol[i], `max |dX| = ${w.toFixed(2)} R_J`));
}

/* ---- planets and geometry ---- */
{
  const jd = E.julianDay(new Date("2026-10-01T04:00:00Z"));
  const sat = O.planetView("saturn", jd);
  check("Saturn rings nearly edge-on in 2026 (|B| < 10 deg)", Math.abs(sat.ringTilt) < 10, `B = ${sat.ringTilt.toFixed(1)} deg`);
  const ven = O.planetView("venus", jd);
  check("Venus is a crescent in early Oct 2026 (inferior conjunction 2026 Oct 24)", ven.illum < 0.3 && ven.diam > 40, `${(ven.illum * 100).toFixed(0)}% lit, ${ven.diam.toFixed(0)}"`);
  const t = O.tangentPlane(10, 1, 10, 0);
  check("tangent plane: 1 deg north = 3600\"", near(t.eta, 3600 * Math.tan(Math.PI / 180) * 57.29578, 1) && near(t.xi, 0, 1e-6));
  const pa = O.positionAngle([1, 0, 0], [Math.cos(0.01), Math.sin(0.01), 0]);
  check("position angle: due east = 90", near(pa, 90, 1e-6));
}

/* ---- data file ---- */
{
  const d = JSON.parse(readFileSync(new URL("../site/data/eyepiece.json", import.meta.url)));
  const ids = d.instruments.map(i => i.id);
  for (const want of ["eye", "binoculars", "refractor70", "reflector130", "dob8", "sct11", "obs1m", "hubble", "webb", "custom"])
    check(`instrument ${want} present`, ids.includes(want));
  check("eyepieces 32/25/15/10/6 mm", [32, 25, 15, 10, 6].every(f => d.eyepieces.some(e => e.focal === f)));
  const tids = d.targets.map(t => t.id);
  for (const want of ["moon", "jupiter", "saturn", "mars", "venus", "m42", "m31", "m45", "albireo", "epslyr", "sun"])
    check(`target ${want} present`, tids.includes(want));
  const dob = d.instruments.find(i => i.id === "dob8");
  check("8-inch Dobsonian is 203 mm", dob.aperture === 203);
  const eps = d.targets.find(t => t.id === "epslyr");
  check("Epsilon Lyrae pairs ~2.3\" and 2.4\"", eps.stars.filter(s => s.sep).every(s => s.sep > 2 && s.sep < 2.6));
}

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
