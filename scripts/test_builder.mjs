// Tests for site/assets/js/builder-physics.js (Rocket Builder).
//   node --no-warnings scripts/test_builder.mjs
// Checks the rocket equation, the parts model against the catalogue, that a
// Saturn V-like stack reaches orbit with sensible Δv, that clearly underpowered
// designs fail for the right reason, and that designs survive the URL hash.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  G0, P0, makeCatalogue, tsiolkovsky, buildVehicle, analyse, plan, phases, tankProp, tankDry,
  encodeDesign, decodeDesign, cloneDesign, PRESETS, clusterLayout, liftoffThrust, FlightSim, DT, ORBIT_MIN_PERI
} from '../site/assets/js/builder-physics.js';

const json = JSON.parse(readFileSync(fileURLToPath(new URL('../site/data/builder-parts.json', import.meta.url)), 'utf8'));
const cat = makeCatalogue(json);
let fails = 0, n = 0;
function check(name, ok, detail = '') {
  n++;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  — ' + detail : ''}`);
}
const near = (a, b, rel) => Math.abs(a - b) <= rel * Math.abs(b);
const preset = (id) => cloneDesign(PRESETS.find(p => p.id === id).design);

/* 1. the rocket equation */
check('Δv = Isp·g0·ln(m0/mf): 300 s, mass ratio e → 2,942 m/s', near(tsiolkovsky(300, Math.E, 1), 300 * G0, 1e-12));
check('Δv(450 s, 100 t → 25 t) = 450 × 9.80665 × ln 4 = 6,117.7 m/s', near(tsiolkovsky(450, 100000, 25000), 6117.7, 1e-4), tsiolkovsky(450, 100000, 25000).toFixed(1));
check('no propellant, no Δv', tsiolkovsky(311, 5000, 5000) === 0);

/* 2. engines reproduce the catalogue at sea level and in vacuum */
for (const id of ['f1', 'rs25', 'merlin', 'rd180', 'rs68a', 'j2']) {
  const e = cat.engines[id], raw = json.engines.find(x => x.id === id);
  check(`${e.name}: sea-level thrust ${raw.fSL} kN`, near(e.fSLN / 1000, raw.fSL, 1e-9));
  check(`${e.name}: vacuum thrust ${raw.fVac} kN, Isp ${raw.ispVac} s`, near(e.fVacN / 1000, raw.fVac, 1e-9) && near(e.fVacN / (e.mdot * G0), raw.ispVac, 1e-9));
  check(`${e.name}: sea-level Isp within 2.5 % of the published ${raw.ispSL} s`, near(e.ispSLEff, raw.ispSL, 0.025), e.ispSLEff.toFixed(1) + ' s');
}
check('vacuum engines lose most of their thrust at sea level (Merlin Vacuum < 20 %)', cat.engines.mvac.fSLN < 0.2 * cat.engines.mvac.fVacN);

/* 3. tanks: density × volume and the structure fraction reproduce real stages */
{
  const sic = { fam: 'kerolox', d: 10.1, len: 32.8 };
  check('Saturn V-class kerosene tank 10.1 × 32.8 m holds ≈ 2,150 t (S-IC)', near(tankProp(cat, sic), 2150000, 0.02), (tankProp(cat, sic) / 1000).toFixed(0) + ' t');
  const veh = buildVehicle(preset('moon'), cat);
  check('Moon rocket: first-stage dry mass ≈ 131–140 t (S-IC ≈ 131 t + interstage)', veh.stages[0].dry > 125000 && veh.stages[0].dry < 145000, (veh.stages[0].dry / 1000).toFixed(1) + ' t');
  check('Moon rocket: liftoff mass within 2 % of Apollo 11 (2,941 t)', near(veh.m0, 2941221, 0.02), (veh.m0 / 1000).toFixed(0) + ' t');
  const f9 = buildVehicle(preset('medium'), cat);
  check('Medium two-stager: first-stage dry mass within 15 % of Falcon 9 (22.2 t)', near(f9.stages[0].dry, 22200, 0.15), (f9.stages[0].dry / 1000).toFixed(1) + ' t');
  check('9 sea-level Merlins fit under 3.7 m (8 around 1)', f9.stages[0].fits && clusterLayout(9, cat.engines.merlin.foot).pts.length === 9);
  check('hydrogen tanks are much bigger for the same mass', tankProp(cat, { fam: 'hydrolox', d: 5, len: 10 }) < 0.4 * tankProp(cat, { fam: 'kerolox', d: 5, len: 10 }));
  check('small tanks are relatively heavier', tankDry(cat, { fam: 'kerolox', d: 1.2, len: 10 }) / tankProp(cat, { fam: 'kerolox', d: 1.2, len: 10 }) > tankDry(cat, { fam: 'kerolox', d: 10.1, len: 10 }) / tankProp(cat, { fam: 'kerolox', d: 10.1, len: 10 }));
}

/* 4. liftoff thrust and boosters */
{
  const sv = buildVehicle(preset('moon'), cat);
  check('Moon rocket liftoff thrust = 5 × 6,770 kN', near(liftoffThrust(sv), 5 * 6770e3, 1e-9));
  const h = buildVehicle(preset('heavy'), cat);
  const F = liftoffThrust(h);
  check('Heavy lifter liftoff thrust ≈ 4 RS-25 + 2 SRB at peak (≈ 32 MN)', F > 30e6 && F < 34e6, (F / 1e6).toFixed(1) + ' MN');
  const ph = phases(h);
  check('boosters + core burn together first, then the core alone', ph[0].key === '0b' && ph[1].key === '0' && ph[0].burn > 120 && ph[0].burn < 128);
}

/* 5. Saturn V-like stack: sensible Δv, reaches orbit, enough left for the Moon */
{
  const veh = buildVehicle(preset('moon'), cat);
  const f = plan(veh), an = analyse(veh, f);
  check('Moon rocket: rocket-equation Δv 12–13.5 km/s with the Apollo stack', an.dv > 12000 && an.dv < 13500, (an.dv / 1000).toFixed(2) + ' km/s');
  check('Moon rocket: liftoff thrust-to-weight ≈ 1.17 (Apollo 11: ≈ 1.16)', near(an.twr, 1.17, 0.03), an.twr.toFixed(3));
  check('Moon rocket: the flight reaches orbit', f.result.type === 'orbit', `${(f.result.apo / 1000).toFixed(0)} × ${(f.result.peri / 1000).toFixed(0)} km`);
  check('Moon rocket: periapsis above 150 km', f.result.peri > ORBIT_MIN_PERI);
  check('Moon rocket: ≥ 3.2 km/s left in the third stage for trans-lunar injection', f.result.dvLeft >= 3200, (f.result.dvLeft / 1000).toFixed(2) + ' km/s');
  check('Moon rocket: flight losses 1.2–2.5 km/s (gravity + drag + steering)', (() => { const L = f.losses.grav + f.losses.drag + f.losses.steer; return L > 1200 && L < 2500; })());
  check('Moon rocket: verdict says orbit, then Moon', an.verdict.type === 'orbit' && /Moon/.test(an.verdict.title), an.verdict.title);
  const d = preset('moon'); d.payload = { id: 'custom', mass: 118000 };
  const v2 = buildVehicle(d, cat), f2 = plan(v2), a2 = analyse(v2, f2);
  check('Saturn V-like stack with 118 t in LEO: 9.4–10.5 km/s available', a2.dv >= 9400 && a2.dv <= 10500, (a2.dv / 1000).toFixed(2) + ' km/s');
  check('…and the flight reaches low Earth orbit with it', f2.result.type === 'orbit', f2.result.type);
  check('capacity estimate to LEO for the Saturn V-like stack: 110–160 t (published 118–140 t)', a2.capLEO > 110000 && a2.capLEO < 160000, (a2.capLEO / 1000).toFixed(0) + ' t');
}

/* 6. the other working presets fly */
for (const id of ['medium', 'small', 'heavy']) {
  const veh = buildVehicle(preset(id), cat), f = plan(veh), an = analyse(veh, f);
  check(`${PRESETS.find(p => p.id === id).name}: reaches orbit (Δv ${(an.dv / 1000).toFixed(1)} km/s)`, f.result.type === 'orbit', f.result.type);
}

/* 7. clearly underpowered designs fail, for the right reason */
{
  const th = buildVehicle(preset('tooheavy'), cat), f = plan(th), an = analyse(th, f);
  check('"Too heavy": thrust-to-weight < 1, stays on the pad', an.twr < 1 && f.result.type === 'pad' && an.verdict.title === 'Stays on the pad');
  check('"Too heavy": the explanation names the thrust-to-weight ratio', an.issues[0].level === 'fail' && /thrust-to-weight/.test(an.issues[0].title));
  const ss = buildVehicle(preset('ssto'), cat), fs = plan(ss), as = analyse(ss, fs);
  check('single stage: rocket-equation Δv below 9.4 km/s', as.dv < 9400, (as.dv / 1000).toFixed(2) + ' km/s');
  check('single stage: does not reach orbit', fs.result.type !== 'orbit', fs.result.type);
  check('single stage: the tip says to stage', as.issues.some(i => /stage/i.test(i.tip || '')));
  // one small upper stage on a big first stage: second-stage thrust-to-weight far too low
  const weak = { payload: { id: 'custom', mass: 30000 }, boosters: null, stages: [
    { tanks: [{ fam: 'kerolox', d: 3.7, len: 30 }], engine: 'merlin', n: 9 },
    { tanks: [{ fam: 'hydrolox', d: 3.7, len: 20 }], engine: 'rl10', n: 1 }] };
  const wv = buildVehicle(weak, cat), fw = plan(wv), aw = analyse(wv, fw);
  check('weak upper stage: thrust-to-weight < 0.25 flagged', aw.issues.some(i => i.key === 'twrU1'), aw.stages[1].twr.toFixed(2));
  check('weak upper stage: does not reach orbit', fw.result.type !== 'orbit', fw.result.type);
  // an engine that cannot burn the tank's propellant
  const mix = { payload: { id: 'cubesat' }, boosters: null, stages: [{ tanks: [{ fam: 'hydrolox', d: 3.7, len: 20 }], engine: 'merlin', n: 9 }] };
  const ma = analyse(buildVehicle(mix, cat));
  check('kerosene engine on a hydrogen tank: flagged, no usable propellant', ma.issues.some(i => i.key === 'mix0' && i.level === 'fail') && ma.dv === 0);
}

/* 8. determinism: the page replays exactly what the planner flew */
{
  const veh = buildVehicle(preset('small'), cat), f = plan(veh);
  const sim = new FlightSim(veh, f.params, { debris: true, hist: true });
  while (!sim.result) sim.step(DT);
  check('replay with debris/history on = planned flight', sim.result.type === f.result.type && Math.abs(sim.result.peri - f.result.peri) < 1, `${sim.result.peri.toFixed(0)} vs ${f.result.peri.toFixed(0)} m`);
  check('replay records staging and fairing separation', ['liftoff', 'burnout', 'separation', 'fairing', 'cutoff'].every(id => sim.events.some(e => e.id === id)));
}

/* 9. share links: design ⇄ URL hash */
for (const p of PRESETS) {
  const h = encodeDesign(p.design), back = decodeDesign('#' + h, cat);
  check(`hash round-trip: ${p.name}`, JSON.stringify(back) === JSON.stringify({ ...p.design, boosters: p.design.boosters || null }), h);
}
{
  const d = { payload: { id: 'custom', mass: 12345 }, boosters: { id: 'gem63', n: 4 }, stages: [
    { tanks: [{ fam: 'methalox', d: 9, len: 12.5 }, { fam: 'kerolox', d: 3.7, len: 3.25 }], engine: 'raptor', n: 33 }, { tanks: [], engine: null, n: 0 }] };
  const back = decodeDesign(encodeDesign(d), cat);
  check('hash round-trip: custom mass, 4 boosters, two tanks, empty stage', JSON.stringify(back) === JSON.stringify(d), encodeDesign(d));
  check('hash decoding rejects junk safely', decodeDesign('#s=Z9x9,nope*3&p=unknown', cat).stages[0].engine === null);
  check('hash decoding snaps odd diameters to the catalogue', decodeDesign('#s=K3.6x10,merlin*9', cat).stages[0].tanks[0].d === 3.7);
}

console.log(`\n${n - fails}/${n} checks passed`);
process.exit(fails ? 1 : 0);
