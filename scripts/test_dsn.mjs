// Unit tests for the Deep Space Network page: DSN Now XML parsing, unit formatting, geometry.
//   node scripts/test_dsn.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import * as D from "../site/assets/js/dsn-data.js";

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} ± ${tol}`);
const J = JSON.parse(fs.readFileSync(new URL("../site/data/dsn.json", import.meta.url), "utf8"));

/* ------------------------------------------------------------------ a realistic dsn.xml fixture
 * Shapes as served by DSN Now: flat <station>/<dish> siblings, self-closing signals, "-1" sentinels,
 * an MSPA dish with two targets and one uplink, an arrayed pair, a maintenance dish, an entity in an
 * attribute, a legacy MHz frequency, a missing band attribute and an unknown spacecraft code. */
const FIXTURE = `<?xml version='1.0' encoding='utf-8'?>
<!-- DSN Now, generated 2026-09-29 16:00:00 UTC -->
<dsn>
  <station name="gdscc" friendlyName="Goldstone" timeUTC="1790697600000" timeZoneOffset="-25200000" />
  <dish name="DSS24" azimuthAngle="209.79" elevationAngle="73.74" windSpeed="9.3" isMSPA="true" isArray="false" isDDOR="false" activity="Multiple Spacecraft Per Aperture (MSPA)" created="2026-09-29T15:12:07.000Z" updated="2026-09-29T16:00:00.000Z">
    <upSignal active="true" signalType="data" dataRate="2000" frequency="7183300000" power="4.6" spacecraft="MRO" spacecraftID="-74" band="X" />
    <downSignal active="true" signalType="data" dataRate="781250" frequency="8439400000" power="-123.5" spacecraft="MRO" spacecraftID="-74" band="X" />
    <upSignal active="false" signalType="none" dataRate="" frequency="" power="" spacecraft="MVN" spacecraftID="-202" band="" />
    <downSignal active="true" signalType="data" dataRate="32000" frequency="8446.3" power="-128.9" spacecraft="MVN" spacecraftID="-202" />
    <target name="MRO" id="74" uplegRange="2.504977e+8" downlegRange="2.504977e+8" rtlt="1671.1405" />
    <target name="MVN" id="202" uplegRange="2.504977e+8" downlegRange="2.504977e+8" rtlt="1671.1405" />
  </dish>
  <dish name="DSS14" azimuthAngle="-1" elevationAngle="-1" windSpeed="-1" isMSPA="false" isArray="false" isDDOR="false" activity="Antenna maintenance &amp; repair">
    <target name="DSN" id="99" uplegRange="-1" downlegRange="-1" rtlt="-1" />
  </dish>
  <station name="mdscc" friendlyName="Madrid" timeUTC="1790697600000" timeZoneOffset="7200000" />
  <dish name="DSS63" azimuthAngle="152.43" elevationAngle="58.97" windSpeed="11" isMSPA="false" isArray="false" isDDOR="false" activity="Spacecraft Telemetry, Tracking, and Command">
    <upSignal active="true" signalType="data" dataRate="16" frequency="2114700000" power="18" spacecraft="VGR1" spacecraftID="-31" band="S" />
    <downSignal active="true" signalType="data" dataRate="160" frequency="8420400000" power="-155.9" spacecraft="VGR1" spacecraftID="-31" band="X" />
    <target name="VGR1" id="31" uplegRange="2.575734e+10" downlegRange="2.575734e+10" rtlt="171834.4602" />
  </dish>
  <dish name="DSS54" azimuthAngle="134.45" elevationAngle="15.01" windSpeed="5" isMSPA="false" isArray="true" isDDOR="false">
    <downSignal active="true" signalType="data" dataRate="1000" frequency="8438000000" power="-151.4" spacecraft="NHPC" spacecraftID="-98" band="X" />
    <target name="NHPC" id="98" uplegRange="9.574264e+9" downlegRange="9.574264e+9" rtlt="63872.6123" />
  </dish>
  <dish name="DSS55" azimuthAngle="134.45" elevationAngle="15.01" windSpeed="12" isMSPA="false" isArray="true" isDDOR="false">
    <downSignal active="true" signalType="data" dataRate="1000" frequency="8438000000" power="-151.6" spacecraft="NHPC" spacecraftID="-98" band="X" />
    <target name="NHPC" id="98" uplegRange="9.574264e+9" downlegRange="9.574264e+9" rtlt="63872.6123" />
  </dish>
  <station name="cdscc" friendlyName="Canberra" timeUTC="1790697600000" timeZoneOffset="36000000" />
  <dish name="DSS34" azimuthAngle="315.54" elevationAngle="41.97" windSpeed="5" isMSPA="false" isArray="false" isDDOR="false">
    <upSignal active="true" signalType="data" dataRate="16000" frequency="2090800000" power="0.2" spacecraft="JWST" spacecraftID="-170" band="S" />
    <downSignal active="true" signalType="data" dataRate="28000000" frequency="25900000000" power="-98.4" spacecraft="JWST" spacecraftID="-170" band="KA" />
    <target name="JWST" id="170" uplegRange="1.510000e+6" downlegRange="1.510000e+6" rtlt="10.0736" />
  </dish>
  <dish name="DSS36" azimuthAngle="120" elevationAngle="40" windSpeed="3" isMSPA="false" isArray="false" isDDOR="false">
    <downSignal active="true" signalType="carrier" dataRate="0" frequency="8.45e9" power="-140" spacecraft="ZQX9" spacecraftID="-999" band="X" />
    <target name="ZQX9" id="999" uplegRange="-1" downlegRange="4.2e7" rtlt="280.2" />
  </dish>
  <timestamp>1790697600000</timestamp>
</dsn>`;

const snap = D.parseDSN(FIXTURE);
assert.equal(snap.t, Date.UTC(2026, 8, 29, 16));
assert.deepEqual(snap.stations.map((s) => s.id), ["gdscc", "mdscc", "cdscc"]);
assert.equal(snap.stations[2].tzOffset, 36000000);
assert.equal(snap.dishes.length, 7);
const dish = (n) => snap.dishes.find((d) => d.name === n);
assert.equal(dish("DSS24").station, "gdscc", "dishes belong to the <station> before them");
assert.equal(dish("DSS63").station, "mdscc");
assert.equal(dish("DSS34").station, "cdscc");
assert.equal(dish("DSS14").az, null, "-1 azimuth is 'unknown'");
assert.equal(dish("DSS14").el, null);
assert.equal(dish("DSS14").wind, null);
assert.equal(dish("DSS14").activity, "Antenna maintenance & repair", "entities decoded");
assert.ok(dish("DSS24").mspa && dish("DSS54").array && !dish("DSS63").array);
near(dish("DSS63").el, 58.97, 1e-9, "elevation");
// signals and units
const vUp = dish("DSS63").up[0], vDn = dish("DSS63").down[0];
assert.equal(vUp.band, "S"); assert.equal(vUp.rate, 16); assert.equal(vUp.power, 18, "uplink power in kW");
assert.equal(vDn.power, -155.9, "downlink power in dBm keeps its sign");
assert.equal(vDn.hz, 8420400000);
const mvnDn = dish("DSS24").down.find((s) => s.sc === "MVN");
assert.equal(mvnDn.hz, 8446.3e6, "legacy MHz frequencies are converted to Hz");
assert.equal(mvnDn.band, "X", "band inferred from frequency when the attribute is missing");
assert.equal(dish("DSS34").down[0].band, "Ka", "'KA' normalised to 'Ka'");
assert.equal(dish("DSS24").up.find((s) => s.sc === "MVN").active, false);
assert.equal(dish("DSS24").up.find((s) => s.sc === "MVN").rate, null, "empty numbers are null");
// targets
const vT = dish("DSS63").targets[0];
assert.equal(vT.name, "VGR1"); near(vT.downRange, 2.575734e10, 1, "range km"); near(vT.rtlt, 171834.4602, 1e-6, "rtlt s");
assert.equal(dish("DSS36").targets[0].upRange, null);

// links: one per (dish, spacecraft)
const L = D.links(snap);
const at = (d, c) => L.find((l) => l.dish === d && l.code === c);
assert.ok(at("DSS24", "MRO").talking && at("DSS24", "MVN").talking, "MSPA: both spacecraft on one dish");
assert.equal(at("DSS24", "MRO").up.length, 1); assert.equal(at("DSS24", "MVN").up.length, 0, "MAVEN has no uplink in MSPA");
assert.ok(at("DSS14", "DSN").test && !at("DSS14", "DSN").talking, "maintenance target flagged");
assert.deepEqual(at("DSS34", "JWST").bands.sort(), ["Ka", "S"]);
assert.equal(at("DSS36", "ZQX9").range, 4.2e7, "falls back to the downleg range");
// the RTLT in the feed matches 2 × range / c
near(2 * vT.downRange / D.C_KM_S, vT.rtlt, 0.5, "RTLT = 2d/c");

// robustness: not a DSN document, and an empty one
assert.throws(() => D.parseDSN("<html><body>502 Bad Gateway</body></html>"));
assert.equal(D.parseDSN("<dsn></dsn>").dishes.length, 0);
// nested dishes (tolerated) and CDATA
const nested = D.parseDSN(`<dsn><station name="cdscc" friendlyName="Canberra"><dish name="dss43" azimuthAngle="200" elevationAngle="30"><target name="vgr2" rtlt="148904"/></dish></station><timestamp><![CDATA[1790697600000]]></timestamp></dsn>`);
assert.equal(nested.dishes[0].name, "DSS43"); assert.equal(nested.dishes[0].station, "cdscc"); assert.equal(nested.dishes[0].targets[0].name, "VGR2");
assert.equal(nested.t, 1790697600000);

// config.xml
const cfg = D.parseConfig(`<config><sites><site name="gdscc" friendlyName="Goldstone" latitude="35.4267" longitude="-116.89" flag="usa"><dish name="DSS14" friendlyName="70m" type="70M"/></site></sites>
  <spacecraftMap><spacecraft name="vgr1" explorerName="sc_voyager_1" friendlyName="Voyager 1"/><spacecraft name="zqx9" friendlyName="Test Probe"/></spacecraftMap></config>`);
assert.equal(cfg.sites.gdscc.dishes.DSS14.type, "70M"); assert.equal(cfg.spacecraft.VGR1, "Voyager 1"); assert.equal(cfg.spacecraft.ZQX9, "Test Probe");
near(cfg.sites.gdscc.lon, -116.89, 1e-9, "config longitude");

/* ------------------------------------------------------------------ formatting */
assert.equal(D.fmtDuration(61440), "17 h 4 min", "light travels this in 17 h 4 min");
assert.equal(D.fmtDuration(1.28), "1.3 s");
assert.equal(D.fmtDuration(0.5), "0.50 s");
assert.equal(D.fmtDuration(45), "45 s");
assert.equal(D.fmtDuration(754), "12 min 34 s");
assert.equal(D.fmtDuration(3600), "1 h 0 min");
assert.equal(D.fmtDuration(171834.46), "1 day 23 h 43 min");
assert.equal(D.fmtDuration(86399, { precise: true }), "23 h 59 min 59 s");
assert.equal(D.fmtDuration(-1), "—"); assert.equal(D.fmtDuration(null), "—");
assert.equal(D.lightPhrase(61440 * D.C_KM_S), "light travels this in 17 h 4 min");
assert.equal(D.fmtRate(160), "160 bit/s");
assert.equal(D.fmtRate(16), "16 bit/s");
assert.equal(D.fmtRate(2031.3), "2.03 kbit/s");
assert.equal(D.fmtRate(781250), "781 kbit/s");
assert.equal(D.fmtRate(999.9), "1 kbit/s");
assert.equal(D.fmtRate(28e6), "28 Mbit/s");
assert.equal(D.fmtRate(0), "—"); assert.equal(D.fmtRate(null), "—");
assert.equal(D.fmtFreq(8420432000), "8.420 GHz");
assert.equal(D.fmtFreq(2.1147e9), "2.115 GHz");
assert.equal(D.fmtFreq(null), "—");
assert.equal(D.fmtKW(18), "18.0 kW"); assert.equal(D.fmtKW(0.2), "200 W"); assert.equal(D.fmtKW(4.6), "4.60 kW");
assert.equal(D.fmtDBm(-155.94), "−155.9 dBm");
near(D.dbmToW(-150), 1e-18, 1e-30, "−150 dBm = 10⁻¹⁸ W");
assert.equal(D.fmtSci(2.6e-19, "W"), "2.6 × 10⁻¹⁹ W");
assert.equal(D.fmtRange(384400), "384,400 km");
assert.equal(D.fmtRange(2.504977e8), "250 million km");
assert.equal(D.fmtRange(2.575734e10), "25.8 billion km");
assert.equal(D.fmtAU(D.AU_KM * 172.18), "172.2 AU");
assert.equal(D.dssLabel("DSS43"), "DSS-43");

/* ------------------------------------------------------------------ coordinates and geometry */
const CX = Object.fromEntries(J.complexes.map((c) => [c.id, c]));
// published site coordinates (NASA/JPL DSN): roughly 35.4° N 116.9° W, 40.4° N 4.2° W, 35.4° S 149.0° E
near(CX.gdscc.lat, 35.43, 0.05, "Goldstone latitude"); near(CX.gdscc.lon, -116.89, 0.05, "Goldstone longitude");
near(CX.mdscc.lat, 40.43, 0.05, "Madrid latitude"); near(CX.mdscc.lon, -4.25, 0.05, "Madrid longitude");
near(CX.cdscc.lat, -35.40, 0.05, "Canberra latitude"); near(CX.cdscc.lon, 148.98, 0.05, "Canberra longitude");
// roughly 120° apart in longitude (each gap between 90° and 160°, summing to 360°)
const gaps = [[CX.gdscc, CX.mdscc], [CX.mdscc, CX.cdscc], [CX.cdscc, CX.gdscc]].map(([a, b]) => D.norm360(b.lon - a.lon));
near(gaps.reduce((s, x) => s + x, 0), 360, 1e-9, "gaps sum");
for (const g of gaps) assert.ok(g > 90 && g < 160, "complex spacing " + g);
// the equatorial sky is covered with 10° masks: every hour angle is seen by at least one complex
const H = J.complexes.map((c) => D.hourAngleLimit(c.lat, 0, 10));
for (let lon = -180; lon < 180; lon += 1) {
  const seen = J.complexes.some((c, i) => Math.abs(D.wrap180(lon - c.lon)) <= H[i]);
  assert.ok(seen, "equatorial sky over longitude " + lon + " is covered");
}
// the 70 m dishes are in the metadata, and the recent changes are noted
for (const [cx, id] of [["gdscc", "DSS14"], ["mdscc", "DSS63"], ["cdscc", "DSS43"]]) assert.equal(CX[cx].dishes.find((d) => d.id === id).size, 70);
assert.equal(CX.gdscc.dishes.find((d) => d.id === "DSS14").status, "repair");
assert.ok(CX.gdscc.dishes.some((d) => d.id === "DSS23") && CX.mdscc.dishes.some((d) => d.id === "DSS53") && CX.mdscc.dishes.some((d) => d.id === "DSS56"));
// Voyager 2 (declination ≈ −60°) never rises above the mask from the northern complexes
const v2 = J.spacecraft.VGR2.sky;
assert.ok(D.maxElevation(CX.gdscc.lat, v2.dec) < 0 && D.maxElevation(CX.mdscc.lat, v2.dec) < 0, "Voyager 2 invisible from the north");
assert.ok(D.maxElevation(CX.cdscc.lat, v2.dec) > 60, "Voyager 2 high from Canberra");
// az/el ↔ RA/Dec round trip
for (const [az, el] of [[0, 45], [90, 10], [209.79, 73.74], [315.5, 42], [180, 5]]) {
  for (const c of J.complexes) {
    const q = D.azElToRaDec(az, el, c.lat, c.lon, snap.t);
    const h = D.raDecToAzEl(q.ra, q.dec, c.lat, c.lon, snap.t);
    near(h.el, el, 1e-6, "el round trip"); near(D.wrap180(h.az - az), 0, 1e-6, "az round trip");
  }
}
// zenith of a site = its latitude as declination, and its local sidereal time as RA
const z = D.azElToRaDec(0, 90, CX.mdscc.lat, CX.mdscc.lon, snap.t);
near(z.dec, CX.mdscc.lat, 1e-6, "zenith declination"); near(D.wrap180(z.ra - D.norm360(D.gmstDeg(snap.t) + CX.mdscc.lon)), 0, 1e-6, "zenith RA = LST");
// the sub-point of that direction is the site itself
const sp = D.subPoint(z.ra, z.dec, snap.t);
near(sp.lat, CX.mdscc.lat, 1e-6, "sub-point lat"); near(sp.lon, CX.mdscc.lon, 1e-6, "sub-point lon");
// the Sun near the September equinox
near(D.sunRaDec(Date.UTC(2026, 8, 23, 0)).dec, 0, 0.6, "Sun on the equator at the equinox");
// GMST at J2000.0 noon ≈ 280.46°
near(D.gmstDeg(Date.UTC(2000, 0, 1, 12)), 280.46, 0.01, "GMST at J2000");

/* ------------------------------------------------------------------ Voyager 1 and the link budget */
const vRef = D.voyager1(D.VOY1.refMs);
near(vRef.owlt, 86400, 5, "one light-day from Earth on 18 November 2026 (173.14 AU is rounded)");
const v = D.voyager1(snap.t);
assert.ok(v.km > 170 * D.AU_KM && v.km < 175 * D.AU_KM, "Voyager 1 at ~172 AU in late September 2026");
near(v.km, vT.downRange, 0.01 * v.km, "model within 1% of the sample range");
const b70 = D.linkBudget({ km: v.km, Dr: 70 }), b34 = D.linkBudget({ km: v.km, Dr: 34 });
assert.ok(b70.Rb > 150 && b70.Rb < 400, "a 70 m dish supports the same order as 160 bit/s: " + b70.Rb);
near(b70.Rb / b34.Rb, (70 / 34) ** 2, 1e-9, "rate scales with dish area");
near(b70.PrdBm, -154, 2, "received power about −154 dBm");
near(b70.LfsdB, 20 * Math.log10(4 * Math.PI * v.km * 1000 * 8.42e9 / 299792458), 1e-9, "free-space path loss");

/* ------------------------------------------------------------------ the illustrative sample in data/dsn.json */
const S = D.parseDSN(J.sample.xml);
assert.ok(S.dishes.length >= 12, "sample has dishes");
const SL = D.links(S).filter((l) => !l.test);
for (const l of SL) {
  const code = l.code;
  const known = J.spacecraft[code] || Object.values(J.spacecraft).some((s) => (s.aliases || []).includes(code));
  assert.ok(known, "sample spacecraft " + code + " is in the metadata");
  const d = S.dishes.find((x) => x.name === l.dish);
  assert.ok(d.el > 6, `${d.name} points above the horizon (${d.el})`);
  assert.ok(CX[d.station].dishes.some((m) => m.id === d.name), `${d.name} belongs to ${d.station}`);
  // the sample's pointing is consistent with the approximate sky position at the sample time
  const sky = J.spacecraft[code].sky, a = sky && D.approxRaDec(sky, S.t);
  if (a) { const h = D.raDecToAzEl(a.ra, a.dec, CX[d.station].lat, CX[d.station].lon, S.t); near(h.el, d.el, 0.05, code + " elevation"); }
}
assert.ok(SL.some((l) => l.code === "VGR2" && l.dish === "DSS43"), "Voyager 2 on DSS-43 in the sample");
assert.match(J.sample.note, /illustrative/i);

console.log("dsn: all tests passed");
