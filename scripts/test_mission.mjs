// Tests for site/assets/js/mission-physics.js (Mission Designer).
//   node --no-warnings scripts/test_mission.mjs
// Lambert against Curtis Example 5.2 and against two-body propagation; the
// Hohmann baseline against the Orbit Lab; the 2026 Earth–Mars porkchop minimum
// against the Python toolkit (simulations/cosmic/transfers.py); patched conics;
// launch-vehicle models against published payloads; the link, power and thermal
// equations against the worked examples in data/equations.json; every preset
// closes; the URL hash round-trips.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as P from '../site/assets/js/mission-physics.js';
import { heliocentric } from '../site/assets/js/ephemeris.js';

const read = (p) => JSON.parse(readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8'));
const data = read('../site/data/mission-designer.json');
const atlas = read('../site/data/equations.json');
const V = P.prepareVehicles(data.vehicles);
let fails = 0, n = 0;
function check(name, ok, detail = '') { n++; if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  — ' + detail : ''}`); }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const rel = (a, b, r) => Math.abs(a - b) <= r * Math.abs(b);
const f = (x, d = 3) => Number(x).toFixed(d);

/* 1. Lambert's problem — Curtis, Orbital Mechanics for Engineering Students, Example 5.2:
 * r1 = (5000, 10000, 2100) km, r2 = (−14600, 2500, 7000) km, Δt = 1 h, Earth.
 * Book answer: v1 = (−5.9925, 1.9254, 3.2456) km/s, v2 = (−3.3125, −4.1966, −0.38529) km/s. */
{
  const L = P.lambert([5000, 10000, 2100], [-14600, 2500, 7000], 3600, P.MU_EARTH);
  const v1 = [-5.9925, 1.9254, 3.2456], v2 = [-3.3125, -4.1966, -0.38529];
  check('Curtis Ex. 5.2: v1 = (−5.9925, 1.9254, 3.2456) km/s', L && v1.every((v, i) => near(L.v1[i], v, 5e-4)), L && L.v1.map((x) => f(x, 4)).join(', '));
  check('Curtis Ex. 5.2: v2 = (−3.3125, −4.1966, −0.38529) km/s', L && v2.every((v, i) => near(L.v2[i], v, 5e-4)), L && L.v2.map((x) => f(x, 4)).join(', '));
  const back = P.propagate([5000, 10000, 2100], L.v1, 3600, P.MU_EARTH);
  check('propagating v1 for 1 h lands on r2 (within 1 m)', P.vec.norm(P.vec.sub(back.r, [-14600, 2500, 7000])) < 1e-3);
}
/* 2. Lambert ↔ propagation round trips: short/long way, elliptic and hyperbolic. */
{
  const cases = [
    ['heliocentric, 250 d, < 180°', [1.2e8, -8e7, 1e5], [22, 26, 0.3], 250 * 86400, P.MU_SUN],
    ['heliocentric, 400 d, > 180° (Type II)', [1.49e8, 0, 0], [0, 32.5, 0.4], 400 * 86400, P.MU_SUN],
    ['Earth-centred hyperbola, 6 h', [7000, 0, 0], [0, 12.5, 0.5], 6 * 3600, P.MU_EARTH]
  ];
  for (const [name, r0, v0, dt, mu] of cases) {
    const r1 = P.propagate(r0, v0, dt, mu).r, L = P.lambert(r0, r1, dt, mu);
    const err = L ? P.vec.norm(P.vec.sub(L.v1, v0)) : Infinity;
    check(`Lambert recovers the velocity: ${name}`, err < 1e-6, `|Δv| = ${err.toExponential(1)} km/s`);
  }
  check('Lambert rejects a non-positive flight time', P.lambert([1, 0, 0], [0, 1, 0], 0) === null);
}
/* 3. Ephemeris states agree with ephemeris.js positions and their time derivative. */
{
  const jd = 2461343.5, s = P.stateOf('mars', jd), h = heliocentric('mars', jd);
  check('stateOf(mars) position = ephemeris.js heliocentric (Standish Table 1)', near(s.r[0] / P.AU_KM, h.x, 1e-12) && near(s.r[1] / P.AU_KM, h.y, 1e-12));
  const a = P.stateOf('mars', jd - 0.01).r, b = P.stateOf('mars', jd + 0.01).r;
  const fd = P.vec.scale(P.vec.sub(b, a), 1 / (0.02 * 86400));
  // Kepler's n = √(μ/a³) differs slightly from Standish's fitted mean-longitude rate: < 2 m/s.
  check('stateOf(mars) velocity = d(position)/dt within 2 m/s', P.vec.norm(P.vec.sub(fd, s.v)) < 2e-3, `${f(P.vec.norm(s.v), 3)} km/s, Δ ${f(P.vec.norm(P.vec.sub(fd, s.v)) * 1000, 2)} m/s`);
}
/* 4. Hohmann Earth → Mars, circular orbits 1 and 1.523679 AU: Orbit Lab shows 5.59 km/s, ≈259 days. */
{
  const h = P.hohmann(P.AU_KM, 1.523679 * P.AU_KM);
  check('Hohmann Earth→Mars Δv1 + Δv2 = 5.59 km/s (as in orbits.html)', near(h.dv, 5.59, 0.006), `${f(h.dv1)} + ${f(h.dv2)} = ${f(h.dv)} km/s`);
  check('Hohmann Earth→Mars flight time ≈ 259 days', near(h.tof, 259, 0.6), f(h.tof, 1) + ' d');
  check('Hohmann C3 = Δv1² ≈ 8.67 km²/s²', near(h.c3, 8.67, 0.01), f(h.c3, 2));
}
/* 5. The 2026 Mars window. Python cross-check (python3 simulations/run.py transfers porkchop,
 * same Standish ephemeris, same universal-variable solver): minimum C3 = 9.139 km²/s² on
 * 30 Oct 2026 with a 295-day flight (arrive 21 Aug 2027), v∞ = 2.70 km/s. The NASA
 * Interplanetary Mission Design Handbook (Burke, Falck & McGuire, NASA/TM-2010-216764)
 * tabulates the 2026 opportunity; its window opens around late October–November 2026. */
{
  const pc = P.porkchop('earth', 'mars', P.dateToJd('2026-08-15'), P.dateToJd('2027-02-15'), 160, 100, 500, 130);
  const m = P.gridMin(pc), r = P.refineMin('earth', 'mars', m.jdDep, m.tof);
  check('2026 porkchop minimum C3 = 9.14 km²/s² (Python toolkit 9.139)', near(r.c3, 9.139, 0.02), f(r.c3, 3));
  check('… on 30 Oct 2026 (± 5 days)', near(r.jdDep, P.dateToJd('2026-10-30'), 5), P.isoDate(r.jdDep));
  check('… with a 295-day flight (± 8 days), arrival v∞ ≈ 2.70 km/s', near(r.tof, 295, 8) && near(r.vinfArr, 2.70, 0.05), `${f(r.tof, 1)} d, ${f(r.vinfArr, 2)} km/s`);
  check('… a Type II transfer (> 180° around the Sun)', r.dtheta > 180, f(r.dtheta, 1) + '°');
  const w = P.findWindows('earth', 'mars', P.dateToJd('2026-06-01'), 7, 100, 500, 4).windows;
  const gaps = w.slice(1).map((x, i) => x.jd - w[i].jd);
  check('Mars windows recur every synodic period (780 ± 60 days)', gaps.length >= 2 && gaps.every((g) => near(g, 780, 60)), gaps.map((g) => f(g, 0)).join(', '));
  check('synodic period Earth–Mars = 780 days', near(P.synodicDays('mars'), 780, 1.5), f(P.synodicDays('mars'), 1));
}
/* 6. Patched conics */
{
  const lt = P.lunarTransfer(4.976);
  check('Earth→Moon Hohmann from 185 km: C3 = −2μ/(r_p + r_Moon) = −2.04 km²/s²', near(lt.c3, -2.039, 0.005), f(lt.c3, 3));
  check('… arrival v∞ at the Moon ≈ 0.84 km/s', near(lt.vinfArr, 0.84, 0.02), f(lt.vinfArr, 3));
  check('faster lunar transfers need more launch energy', P.lunarTransfer(3).c3 > P.lunarTransfer(4).c3);
  const arc = P.lunarArc(2461537.5, P.lunarTransfer(4.5), 40), end = arc.pts[arc.pts.length - 1];
  check('lunar arc ends at the Moon\'s mean distance', near(P.vec.norm(end), 384400, 5), f(P.vec.norm(end), 0) + ' km');
  const mars = P.BODIES.mars, rp = mars.R + 300, ra = mars.R + 45000;
  const hand = Math.sqrt(2.7 ** 2 + 2 * mars.mu / rp) - Math.sqrt(mars.mu * (2 / rp - 2 / (rp + ra)));
  check('capture Δv = √(v∞² + 2μ/r_p) − √(μ(2/r_p − 1/a))', near(P.captureDv(2.7, mars.mu, rp, ra), hand, 1e-12), f(hand) + ' km/s');
  check('low circular capture costs more than a loose ellipse', P.captureDv(2.7, mars.mu, mars.R + 400, mars.R + 400) > P.captureDv(2.7, mars.mu, rp, ra));
  const J = P.BODIES.jupiter, rpJ = 1.06 * J.R;
  const juno = P.captureDv(5.6, J.mu, rpJ, P.apoapsisFromPeriod(J.mu, rpJ, 53.5));
  check('Juno-style capture (1.06 R♃, 53.5-day orbit, v∞ 5.6 km/s) ≈ 0.54 km/s (Juno: 542 m/s)', near(juno, 0.54, 0.03), f(juno) + ' km/s');
  check('departure Δv from 185 km for C3 = 9.14 ≈ 3.6 km/s', near(P.departureDv(9.14), 3.64, 0.02), f(P.departureDv(9.14)));
}
/* 7. Launch vehicles: calibrated, monotonic, sane losses, and against published figures. */
{
  for (const v of data.vehicles) {
    if (v.calib && v.lossFixed == null) check(`${v.name} (${v.variant}) reproduces its calibration point`, near(P.payloadAtC3(v, v.calib.c3), v.calib.mass, 1), `${f(P.payloadAtC3(v, v.calib.c3), 0)} kg`);
    const cs = [-20, 0, 10, 30, 60], ps = cs.map((c) => P.payloadAtC3(v, c));
    check(`${v.name} (${v.variant}): payload falls as C3 rises`, ps.every((p, i) => i === 0 || p <= ps[i - 1]), ps.map((p) => f(p, 0)).join(' → '));
    check(`${v.name} (${v.variant}): fitted loss term is physical (0.5–2.6 km/s)`, v.loss > 0.5 && v.loss < 2.6, f(v.loss, 2) + ' km/s');
  }
  const f9r = P.payloadAtC3(V.f9r, -16.36);
  check('Falcon 9 with drone-ship landing: ≈ 5.5 t to GTO as reported (± 10 %)', rel(f9r, 5500, 0.1), f(f9r, 0) + ' kg');
  const juno = P.payloadAtC3(V.av551, 31.1);
  check('Atlas V 551 lifts Juno (3,625 kg) at C3 ≈ 31 (model within +15 %)', juno >= 3625 && rel(juno, 3625, 0.15), f(juno, 0) + ' kg');
  const sls = P.payloadAtC3(V.sls1, -60.73);
  check('SLS Block 1 model predicts ≈ 95 t to LEO (NASA) within 10 %', rel(sls, 95000, 0.1), f(sls, 0) + ' kg');
  const fh = P.payloadAtC3(V.fhe, 10);
  check('Falcon Heavy expendable ≈ 16.8 t at C3 ≈ 10 (SpaceX "to Mars" figure) within 10 %', rel(fh, 16800, 0.1), f(fh, 0) + ' kg');
  check('maxC3 inverts payloadAtC3', near(P.maxC3(V.vc6, P.payloadAtC3(V.vc6, 25)), 25, 0.01));
}
/* 8. Subsystem equations against the worked examples of the equation atlas. */
{
  const ex = (id) => atlas.equations.find((e) => e.id === id).example;
  const d = ex('dsn-data-rate'), s = d.set;
  const vg = P.dataRate({ pt: s.Pt, dt: s.Dt, dr: s.Dr, fGHz: s.f, dAU: s.d, tsys: s.Tsys, ebn0dB: s.EbN0, lossDB: 0, etaT: 0.6, etaR: 0.6 }).rb;
  check('DSN data rate: Voyager 1 example of the atlas (≈ 245 bit/s)', rel(vg, d.answer.value, 0.01), f(vg, 1) + ' bit/s');
  /* MRO-like link: 3 m high-gain antenna, 100 W X-band, 1 AU, 70 m DSN antenna.
   * MRO returns 0.5–4 Mbit/s over 0.7–2.4 AU on 34 m antennas and up to 6 Mbit/s
   * (Taylor, Lee & Shambayati, "Mars Reconnaissance Orbiter Telecommunications",
   * JPL DESCANSO DPSS Article 12, 2006): the model must give megabits per second. */
  const c = data.spacecraft, x = c.bands.X;
  const mro = P.dataRate({ pt: 100, dt: 3, dr: 70, fGHz: x.f, dAU: 1, tsys: c.dsn['70'].tsys.X, ebn0dB: c.link.ebn0dB, lossDB: x.lossDB, etaT: c.link.etaT, etaR: c.dsn['70'].eta }).rb;
  check('MRO-like link at 1 AU, 70 m, X-band: order of megabits per second (1–30 Mbit/s)', mro > 1e6 && mro < 3e7, f(mro / 1e6, 2) + ' Mbit/s');
  const mro34 = P.dataRate({ pt: 100, dt: 3, dr: 34, fGHz: x.f, dAU: 2.4, tsys: c.dsn['34'].tsys.X, ebn0dB: c.link.ebn0dB, lossDB: x.lossDB, etaT: c.link.etaT, etaR: c.dsn['34'].eta }).rb;
  check('… and ≈ 0.5 Mbit/s at 2.4 AU on a 34 m antenna (0.15–1.5 Mbit/s)', mro34 > 1.5e5 && mro34 < 1.5e6, f(mro34 / 1e6, 2) + ' Mbit/s');
  check('twice the distance, a quarter of the bits', rel(P.dataRate({ pt: 10, dt: 1, dr: 34, fGHz: 8.4, dAU: 2, tsys: 30, ebn0dB: 3 }).rb * 4, P.dataRate({ pt: 10, dt: 1, dr: 34, fGHz: 8.4, dAU: 1, tsys: 30, ebn0dB: 3 }).rb, 1e-9));
  const sp = ex('solar-array-power');
  check('solar array: Juno at Jupiter (atlas example ≈ 513 W)', rel(P.solarPower(sp.set.A, sp.set.r, sp.set.eta), sp.answer.value, 0.001), f(P.solarPower(sp.set.A, sp.set.r, sp.set.eta), 1) + ' W');
  const th = ex('spacecraft-temperature');
  const T = P.equilibriumT(th.set.r, th.set.alpha, th.set.eps, th.set.geom);
  check('equilibrium temperature: white sphere at 1 AU (atlas example ≈ 203 K)', near(T, th.answer.value, 0.3), f(T, 1) + ' K');
  const ts = ex('tsiolkovsky');
  check('rocket equation: propellant for Δv matches Tsiolkovsky', near(P.propellantFor(ts.answer.value, ts.set.isp, 1) + 1, ts.set.R, 0.01), 'mass ratio ' + f(P.propellantFor(ts.answer.value, ts.set.isp, 1) + 1, 3));
}
/* 9. Every preset closes; the budgets look like the missions they imitate. */
for (const p of data.presets) {
  const e = P.evaluate(data, V, p.state);
  check(`preset "${p.label}" closes with every margin green`, e.allGreen, e.checks.map((c) => `${c.id} ${c.status}`).join(', '));
  if (p.id === 'mars2026') check('… Mars orbiter: MRO-class launch mass 0.8–1.5 t', e.launchMass > 800 && e.launchMass < 1500, f(e.launchMass, 0) + ' kg');
  if (p.id === 'europa') {
    check('… Europa-style: solar array tens of square metres at 5.2 AU (Clipper flies ≈ 90 m²)', e.sc.power.area > 50 && e.sc.power.area < 160, f(e.sc.power.area, 1) + ' m²');
    check('… Europa-style: direct C3 ≈ 76 km²/s² needs a heavy launcher (Falcon 9 cannot)', e.traj.c3 > 70 && P.payloadAtC3(V.f9e, e.traj.c3) < e.launchMass, f(e.traj.c3, 1));
  }
  if (p.id === 'lunarcube') check('… Lunar CubeSat: 12-unit class, under 30 kg', e.launchMass < 30, f(e.launchMass, 1) + ' kg');
  if (p.id === 'venus2027') check('… Venus probe: launches in December 2027, entry near 11 km/s', P.isoDate(p.state.dep).startsWith('2027-12') && near(e.vEntry, 10.9, 0.6), `${P.isoDate(p.state.dep)}, ${f(e.vEntry, 2)} km/s`);
  const back = P.decodeState('#' + P.encodeState(p.state));
  const same = Object.keys(P.HASH_KEYS).every((k) => (typeof p.state[k] === 'number' ? near(back[k], p.state[k], 0.006) : back[k] === p.state[k]));
  check(`preset "${p.label}" survives the URL hash round trip`, same);
}
/* 10. Data integrity: presets reference real options; "why?" links point at real atlas anchors. */
{
  const ids = new Set(atlas.equations.map((e) => e.id));
  const links = Object.values(data.why).flatMap((w) => w.l.map((l) => l[1])).filter((u) => u.startsWith('equations.html#'));
  const bad = links.filter((u) => !ids.has(u.split('#')[1]));
  check('every "why?" link to equations.html points at an existing equation', bad.length === 0, bad.join(', ') || links.length + ' links');
  const okRefs = data.presets.every((p) => { const d = data.destinations.find((x) => x.id === p.state.dest); return d && d.orbits.some((o) => o.id === p.state.orbit) && V[p.state.lv]; });
  check('presets reference existing destinations, orbits and vehicles', okRefs);
  const s = P.decodeState('#d=venus&pl=12.5&lv=a64&b=Ka&step=3', { dest: 'mars', payload: 1 });
  check('hash decoding keeps unknown keys out and parses numbers', s.dest === 'venus' && s.payload === 12.5 && s.lv === 'a64' && s.band === 'Ka' && !('step' in s));
}

console.log(`\n${n - fails}/${n} checks passed`);
process.exit(fails ? 1 : 0);
