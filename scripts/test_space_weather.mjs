// Unit tests for the Space Weather page's physics and data parsing.
//   node scripts/test_space_weather.mjs
import assert from "node:assert/strict";
import * as P from "../site/assets/js/space-weather-physics.js";
import * as D from "../site/assets/js/space-weather-data.js";

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} ± ${tol}`);

// ram pressure: n = 5 /cm³, v = 400 km/s → 1.6726e-6 · 5 · 400² = 1.338 nPa
near(P.dynPressure(5, 400), 1.338, 0.002, "dynamic pressure");
// Shue et al. (1998) with Bz = 0, Dp = 2 nPa: r0 = (10.22 + 1.29 tanh(0.184·8.14)) · 2^(−1/6.6) ≈ 10.25 R⊕
const q = P.shue(0, 2);
near(q.r0, (10.22 + 1.29 * Math.tanh(0.184 * 8.14)) * Math.pow(2, -1 / 6.6), 1e-9, "Shue r0");
near(q.r0, 10.25, 0.02, "Shue r0 value");
near(q.alpha, 0.58 * (1 + 0.024 * Math.log(2)), 1e-9, "Shue alpha");
assert.ok(P.shue(-20, 20).r0 < 6.62, "a big storm pushes the magnetopause inside geostationary orbit");
near(P.shueR(10, 0.6, Math.PI / 2), 10 * Math.pow(2, 0.6), 1e-9, "Shue flank");
const M = P.machMS(400, 5, 5, 1e5);
assert.ok(M > 5 && M < 12, "typical magnetosonic Mach number " + M);
const rbs = P.bowShock(10, M);
assert.ok(rbs > 12 && rbs < 14.5, "bow shock stand-off " + rbs);
// Newell coupling is zero for purely northward IMF and grows southward
assert.equal(P.newell(400, 0, 5), 0);
assert.ok(P.newell(400, 0, -5) > P.newell(400, 3, -2));
near(P.travelHours(1000), 149597870.7 / 1000 / 3600, 1e-9, "CME travel time");
// scales and classes
assert.equal(P.flareClass(2.4e-5), "M2.4");
assert.equal(P.flareClass(5.8e-4), "X5.8");
assert.equal(P.flareClass(3e-8), "A3.0");
assert.equal(P.gFromKp(4.67), 1); assert.equal(P.gFromKp(8.67), 4); assert.equal(P.gFromKp(9), 5); assert.equal(P.gFromKp(4.33), 0);
assert.equal(P.rFromFlux(1.2e-4), 3);
assert.equal(P.kpText(5.33), "5+"); assert.equal(P.kpText(5.67), "6−"); assert.equal(P.kpText(9), "9");
// geomagnetic latitude of Los Angeles in the centred-dipole model ≈ 40°
near(P.magLat(34.05, -118.24), 40.2, 0.5, "LA geomagnetic latitude");
near(P.auroraReach(150, 5), 8.3, 0.1, "aurora sight distance");
// the Sun is below the horizon in Los Angeles at 08:00 UTC and up at 20:00 UTC (28 Sept 2026)
assert.ok(P.sunAlt(Date.UTC(2026, 8, 28, 8), 34.05, -118.24) < -20);
assert.ok(P.sunAlt(Date.UTC(2026, 8, 28, 20), 34.05, -118.24) > 40);
const dw = P.darkWindow(Date.UTC(2026, 8, 28, 20), 34.05, -118.24);
assert.ok(dw && (dw.end - dw.start) / 3.6e6 > 9 && (dw.end - dw.start) / 3.6e6 < 12, "LA night length");
// alerts
const a = P.explainAlert("Space Weather Message Code: ALTK05\r\nSerial Number: 1\r\nIssue Time: x\r\n\r\nALERT: Geomagnetic K-index of 5\r\nNOAA Scale: G1 - Minor\r\n");
assert.equal(a.kind, "ALERT"); assert.equal(a.scale, "G1"); assert.match(a.plain, /G1 minor storm/);

// data: NaN tokens, both K-index formats, active-source filtering
assert.deepEqual(JSON.parse(D.sanitize('[{"a":NaN,"b":1},{"a":-Infinity}]')), [{ a: null, b: 1 }, { a: null }]);
const kpOld = D.NORM.kp([["time_tag", "Kp", "a_running", "station_count"], ["2024-05-10 21:00:00.000", "8.67", "300", "8"]]);
const kpNew = D.NORM.kp([{ time_tag: "2024-05-10T21:00:00", Kp: 8.67, a_running: 300, station_count: 8 }]);
assert.deepEqual(kpOld, kpNew); assert.equal(kpNew[0][0], Date.UTC(2024, 4, 10, 21));
const w = D.NORM.wind([
  { time_tag: "2026-09-22 10:00:00.000", active: false, source: "ACE", proton_speed: 377.7, proton_density: 1.04, proton_temperature: 5e4 },
  { time_tag: "2026-09-22 10:01:00.000", active: true, source: "SOLAR1", proton_speed: 313.6, proton_density: 1.94, proton_temperature: 4e4 }
]);
assert.equal(w.length, 1); assert.equal(w[0][1], 313.6); assert.equal(w[0][4], "SOLAR1");
const x = D.NORM.xray([{ time_tag: "2024-05-11T01:23:00Z", flux: 5.8e-4, energy: "0.1-0.8nm" }, { time_tag: "2024-05-11T01:23:00Z", flux: 1e-4, energy: "0.05-0.4nm" }]);
assert.equal(x[0][1], 5.8e-4);
const sc = D.NORM.scales({ "-1": { DateStamp: "2024-05-10", TimeStamp: "00:00:00", R: { Scale: "3" }, S: { Scale: "1" }, G: { Scale: "5" } }, "0": { DateStamp: "2024-05-11", TimeStamp: "02:00:00", R: { Scale: "3" }, S: { Scale: "1" }, G: { Scale: "5" } } });
assert.equal(sc.cur.G.s, 5);
console.log("space weather: all tests passed");
