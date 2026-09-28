// Tests for site/assets/js/booster-physics.js (reusable booster landing).
//   node --no-warnings scripts/test_booster.mjs
// Checks the physics against closed-form results and checks that the
// autopilot lands every scenario inside the scoring limits.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  BoosterSim, Autopilot, DT, G0, ENG, VEH, SCENARIOS, LIMITS, atmosphere, thrustPerEngine,
  mdotPerEngine, burnHeight, predict, flyAuto, heatFlux
} from '../site/assets/js/booster-physics.js';

let fails = 0, n = 0;
function check(name, ok, detail = '') {
  n++;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  — ' + detail : ''}`);
}
const near = (a, b, rel) => Math.abs(a - b) <= rel * Math.abs(b);

/* 1. engine numbers */
check('sea-level thrust = 845 kN', near(thrustPerEngine(1, 101325), 845e3, 1e-9));
check('minimum throttle = 482 kN at sea level', near(thrustPerEngine(ENG.minThrottle, 101325), 482e3, 1e-9));
check('vacuum Isp = 311 s', near(thrustPerEngine(1, 0) / (mdotPerEngine(1) * G0), 311, 1e-9));
check('sea-level Isp = 282 s', near(thrustPerEngine(1, 101325) / (mdotPerEngine(1) * G0), 282, 1e-9));

/* 2. atmosphere spot values (U.S. Standard Atmosphere 1976 tables) */
check('ρ(0) = 1.225 kg/m³', near(atmosphere(0).rho, 1.225, 0.002));
check('ρ(10 km) = 0.4135 kg/m³', near(atmosphere(10000).rho, 0.4135, 0.01));
check('a(0) = 340.3 m/s', near(atmosphere(0).a, 340.3, 0.002));

/* 3. propellant flow: one engine, full throttle, 10 s in vacuum */
{
  const s = new BoosterSim('ship');
  s.h = 120000; s.vx = 0; s.vy = 0; s.theta = 0; s.attCmd = 0; s.finCmd = false; s.finDep = 0;
  s.setEngines(1); s.throttleCmd = 1; s.throttle = 1; s.ignite(); s.level = 1;
  const p0 = s.prop;
  for (let i = 0; i < 500; i++) s.step(DT);
  const used = p0 - s.prop;
  check('ṁ over 10 s = 3,056 kg', near(used, ENG.mdot * 10, 0.005), `${used.toFixed(0)} kg`);
  // 4. rocket equation: speed gained vs Tsiolkovsky minus gravity loss (no air up there)
  const mf = s.m, dvIdeal = ENG.ispVac * G0 * Math.log((mf + used) / mf);
  const gAvg = 3.986004418e14 / (6371000 + s.h) ** 2;
  const dvExpect = dvIdeal - gAvg * 10;
  check('Δv = Isp·g₀·ln(m₀/m) − g·t (vacuum)', near(s.vy, dvExpect, 0.01), `${s.vy.toFixed(1)} vs ${dvExpect.toFixed(1)} m/s`);
}

/* 5. terminal velocity v_t = √(2mg / ρ·C_d·A): at v_t the net vertical force is zero,
 *    and a long fall converges toward it (it lags a little, because the air thickens
 *    faster than the stage can slow down: the relaxation length v_t²/g is ≈ 4 km) */
{
  const s = new BoosterSim('final');
  s.h = 500; s.vx = 0; s.vy = -s.terminalVelocity(500); s.theta = 0; s.attCmd = 0;
  const vy0 = s.vy; s.step(DT);
  const a = (s.vy - vy0) / DT;
  check('net acceleration ≈ 0 at v_t (500 m)', Math.abs(a) < 0.02 * G0, `${a.toFixed(3)} m/s²`);
  const f = new BoosterSim('final');
  f.h = 12000; f.vx = 0; f.vy = -300; f.theta = 0; f.attCmd = 0;
  while (f.h > 300) f.step(DT);
  const vt = f.terminalVelocity(f.h);
  const vtUp = f.terminalVelocity(f.h + 4000);
  check('a 12 km fall ends between v_t here and v_t one relaxation length higher', -f.vy > vt && -f.vy < vtUp, `${(-f.vy).toFixed(1)} m/s, v_t ${vt.toFixed(1)} … ${vtUp.toFixed(1)} m/s`);
  check('terminal velocity at sea level ≈ 200 m/s (26.7 t, fins out)', f.terminalVelocity(0) > 180 && f.terminalVelocity(0) < 230, `${f.terminalVelocity(0).toFixed(0)} m/s`);
}

/* 6. hoverslam: burn height v²/(2·a_net) and burn time v/a_net vs the simulation (no air) */
{
  const s = new BoosterSim('final');
  s.h = 100000; s.vx = 0; s.vy = -150; s.theta = 0; s.attCmd = 0; s.finDep = 0; s.finCmd = false;
  s.derived();
  const bh = burnHeight(s, 0.8, 1, 150, false);
  s.setEngines(1); s.throttle = 0.8; s.throttleCmd = 0.8; s.ignite(); s.level = 1;
  const h0 = s.h; let t = 0;
  while (s.vy < 0) { s.step(DT); t += DT; }
  const drop = h0 - s.h;
  check('burn time ≈ v / a_net', near(t, bh.t, 0.05), `${t.toFixed(2)} s vs ${bh.t.toFixed(2)} s (mass falls during the burn)`);
  check('stopping distance ≈ v² / (2·a_net)', near(drop, bh.h, 0.06), `${drop.toFixed(0)} m vs ${bh.h.toFixed(0)} m`);
  check('thrust-to-weight > 1 at minimum throttle (it cannot hover)', s.d.twMin > 1, `T/W_min = ${s.d.twMin.toFixed(2)}`);
}

/* 7. predictor vs the full simulation (droneship, coast phase) */
{
  const { sim } = flyAuto('ship', { steer: false });
  const s2 = new BoosterSim('ship'); const ap = new Autopilot({ steer: false });
  while (s2.t < 120) { ap.update(s2); s2.step(DT); }
  const p = predict(s2, { entryAlt: s2.S.entryAlt, entryEnd: s2.S.entryEnd, landingTau: 0.8, surfaceH: 3 });
  check('impact predictor within 2 km from apogee (≈ 450 km out)', Math.abs(p.x - sim.x) < 2000, `${((p.x - sim.x) / 1000).toFixed(2)} km`);
}

/* 8. heating: Sutton–Graves sanity */
check('Sutton–Graves: 1 kg/m³, 1 km/s, rₙ = 1 m → 174 kW/m²', near(heatFlux(1, 1000, 1), 1.7415e5, 1e-6));

/* 9. the autopilot lands every scenario inside the limits */
for (const key of Object.keys(SCENARIOS)) {
  const { sim } = flyAuto(key);
  const d = sim.done;
  const ok = d && d.legs && d.surface !== 'sea' && d.vy < LIMITS.vy && Math.abs(d.vx) < LIMITS.vx && d.tilt < LIMITS.tilt && d.dist < 10 && d.prop > 500;
  check(`autopilot lands "${key}"`, ok, d ? `v↓ ${d.vy.toFixed(2)} m/s, v→ ${Math.abs(d.vx).toFixed(2)} m/s, tilt ${(d.tilt * 57.3).toFixed(1)}°, ${d.dist.toFixed(1)} m off, ${d.prop.toFixed(0)} kg left, t = ${d.t.toFixed(0)} s` : 'no touchdown');
}

/* 10. booster.json mirrors the constants */
{
  const j = JSON.parse(readFileSync(fileURLToPath(new URL('../site/data/booster.json', import.meta.url)), 'utf8'));
  const row = (k) => j.vehicle.rows.find(r => r.k.startsWith(k)).v;
  check('JSON: dry mass', row('Empty') === VEH.dryMass);
  check('JSON: propellant capacity', row('Propellant capacity') === VEH.propCapacity);
  check('JSON: sea-level thrust', row('Thrust per engine, sea level') * 1e3 === ENG.fSL);
  check('JSON: Isp', row('Specific impulse, sea level') === ENG.ispSL && row('Specific impulse, vacuum') === ENG.ispVac);
  check('JSON: minimum throttle', near(row('Minimum throttle') / 845, ENG.minThrottle, 1e-9));
  for (const sc of j.scenarios) check(`JSON: scenario ${sc.id} propellant`, sc.propellant_kg === SCENARIOS[sc.id].prop);
}

console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
