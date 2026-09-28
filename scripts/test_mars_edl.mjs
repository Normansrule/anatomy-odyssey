#!/usr/bin/env node
/* Tests for site/assets/js/mars-physics.js (Mars 2020 Perseverance EDL) against
 * the as-flown values.
 *
 *   node --no-warnings scripts/test_mars_edl.mjs
 *
 * Reference values:
 *   [FM]    "Assessment of the Mars 2020 Entry, Descent, and Landing Simulation",
 *           NASA NTRS 20210024480 — peak deceleration 10.7 g at E+1:23; parachute
 *           deploy E+4:01, Mach 1.76, 433 m/s, 504 Pa, 12.2 km; heat shield
 *           separation E+4:23; backshell separation E+5:58, 2.2 km, 81 m/s;
 *           touchdown E+6:59 at 0.77 m/s; ≈102 kg propellant left (298 of 400 used);
 *           descent stage impact 694 m away; three bank reversals.
 *   [MEADS] NASA NTRS 20210024320 — deploy Mach 1.82; bank reversals at
 *           E+82, E+102, E+130 s (GN&C times minus the E+0 offset).
 *   [PK]    Mars 2020 Landing Press Kit — peak heating ≈75 s after entry,
 *           ≈1,300 °C heat-shield surface; touchdown 0.75 m/s (1.7 mph).
 * Tolerances are what a 2-D educational model can honestly promise.
 */
import * as M from "../site/assets/js/mars-physics.js";

let fails = 0, passes = 0;
function check(name, ok, detail) {
  if (ok) passes++; else fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}
const near = (v, ref, tol) => Math.abs(v - ref) <= tol;
const f = (v, d = 2) => (+v).toFixed(d);

/* ---- atmosphere ---- */
const a0 = M.atmosphere(0), a12 = M.atmosphere(12200);
check("surface pressure at Jezero ≈ 0.73 kPa", near(a0.p, 733, 40), `${f(a0.p, 0)} Pa`);
check("density at the flown deploy altitude matches q = 504 Pa at 433 m/s", near(0.5 * a12.rho * 433 * 433, 504, 60), `${f(0.5 * a12.rho * 433 * 433, 0)} Pa`);
check("mean scale height near 11.1 km (NASA Mars Fact Sheet)", near(M.scaleHeight(15000), 11100, 700), `${f(M.scaleHeight(15000) / 1000, 2)} km at 15 km`);
check("gravity at Jezero ≈ 3.72 m/s²", near(M.G_SITE, 3.72, 0.02), `${f(M.G_SITE, 3)} m/s²`);

/* ---- nominal flight ---- */
const s = M.runEDL({});
const E = (id) => s.events.find((e) => e.id === id);
const r = s.result;
check("peak deceleration ≈ 10.7 g (±15 %)", near(r.peakG, 10.7, 1.6), `${f(r.peakG)} g`);
check("peak deceleration near E+83 s (±12 s)", near(r.peakGT, 83, 12), `E+${f(r.peakGT, 1)} s`);
check("peak heating near E+75 s (±12 s)", near(E("peakHeat").t, 75, 12), `E+${f(E("peakHeat").t, 1)} s`);
check("heat-shield surface 1,300–1,600 °C (±300 °C)", r.peakTw - 273.15 > 1000 && r.peakTw - 273.15 < 1900, `${f(r.peakTw - 273.15, 0)} °C`);
check("three bank reversals", r.nRev === 3, `${r.nRev}`);
["bankRev1", "bankRev2", "bankRev3"].forEach((id, i) => {
  const ref = [82, 102, 130][i];
  check(`bank reversal ${i + 1} near E+${ref} s (±12 s)`, E(id) && near(E(id).t, ref, 12), E(id) ? `E+${f(E(id).t, 1)} s` : "missing");
});
check("parachute deploy Mach 1.76–1.82 (±0.15)", r.chuteMach > 1.61 && r.chuteMach < 1.97, `Mach ${f(r.chuteMach)}`);
check("parachute deploy speed ≈ 433 m/s (±40)", near(r.chuteV, 433, 40), `${f(r.chuteV, 0)} m/s`);
check("parachute deploy altitude ≈ 11–12.6 km (±1.5)", r.chuteAlt > 9500 && r.chuteAlt < 14100, `${f(r.chuteAlt / 1000, 1)} km`);
check("parachute deploy near E+241 s (±15 s)", near(E("chute").t, 241, 15), `E+${f(E("chute").t, 1)} s`);
check("parachute peak load ≈ 152 kN (34.2 kips, ±25 %)", near(r.chuteLoad, 152e3, 38e3), `${f(r.chuteLoad / 1000, 0)} kN`);
check("heat shield separation near E+263 s (±15 s)", near(E("hsSep").t, 263, 15), `E+${f(E("hsSep").t, 1)} s`);
check("backshell separation near E+358 s (±20 s)", near(E("bsSep").t, 358, 20), `E+${f(E("bsSep").t, 1)} s`);
check("backshell separation speed ≈ 81 m/s (±10)", near(E("bsSep").v, 81, 10), `${f(E("bsSep").v, 0)} m/s`);
check("touchdown near E+419 s (±20 s)", near(E("touchdown").t, 419, 20), `E+${f(E("touchdown").t, 1)} s`);
check("touchdown speed ≈ 0.75 m/s", r.td && near(r.td.vz, 0.75, 0.1), r.td ? `${f(r.td.vz)} m/s` : "no touchdown");
check("propellant left at touchdown ≈ 102 kg (±30)", r.td && near(r.td.fuel, 102, 30), r.td ? `${f(r.td.fuel, 0)} kg` : "");
check("descent stage crashes ≈ 694 m away (±150)", near(r.flyaway, 694, 150), `${f(r.flyaway, 0)} m`);
check("nominal landing is safe and within 1 km of the target", r.ok && r.miss < 1000, `${r.ok ? "safe" : r.issues.join(",")}, ${f(r.miss, 0)} m`);

/* ---- engineer-mode consequences ---- */
const up = M.runEDL({ bank: "liftUp" }).result;
check("no banking (full lift up) overshoots by > 20 km", up.td && up.td.x > 20000, up.td ? `${f(up.td.x / 1000, 1)} km long` : up.issues.join(","));
const ag = M.runEDL({ bank: "aggressive" }).result;
check("aggressive banking lands > 20 km short with higher g", ag.td && ag.td.x < -20000 && ag.peakG > r.peakG, ag.td ? `${f(ag.td.x / 1000, 1)} km, ${f(ag.peakG)} g` : ag.issues.join(","));
const ch = M.runEDL({ trigger: "mach", triggerMach: 2.6 }).result;
check("opening the parachute at Mach 2.6 destroys it", ch.issues.includes("chuteMach") || ch.issues.includes("chuteLoad"), ch.issues.join(","));
const lo = M.runEDL({ trigger: "mach", triggerMach: 1.2 }).result;
check("opening it at Mach 1.2 leaves too little altitude", !lo.ok, `${lo.issues.join(",")} (deploy ${f(lo.chuteAlt / 1000, 1)} km)`);
const hi = M.runEDL({ craneAlt: 60 }).result;
check("starting the sky crane at 60 m runs the tanks dry", hi.issues.includes("fuel"), hi.issues.join(","));
const sh = M.runEDL({ bridle: 2 }).result;
check("2 m bridles put the engine plumes on top of the rover", sh.issues.includes("plumeDamage") || sh.issues.includes("collision"), sh.issues.join(","));

/* ---- Monte Carlo: Range Trigger shrinks the downrange spread; TRN avoids hazards ---- */
function mc(opts, n) { const pts = []; let haz = 0; for (const x of M.monteCarlo(opts, n, 11)) { pts.push(x.land); if (x.hazard) haz++; } return { e: M.ellipseOf(pts), haz }; }
const N = 24;
const rt = mc({}, N), vt = mc({ trigger: "mach", triggerMach: 1.8 }, N), off = mc({ trn: false }, N);
const dr = (e) => Math.max(Math.abs(e.a * Math.cos(e.ang)), Math.abs(e.b * Math.sin(e.ang))) * 2;
check("Range Trigger ellipse is shorter downrange than a Mach trigger's", dr(rt.e) < dr(vt.e), `${f(dr(rt.e) / 1000, 1)} vs ${f(dr(vt.e) / 1000, 1)} km`);
check("TRN lands on fewer hazards than no TRN", rt.haz < off.haz, `${rt.haz}/${N} vs ${off.haz}/${N}`);

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
