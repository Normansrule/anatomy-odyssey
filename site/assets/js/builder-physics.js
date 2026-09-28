/* Cosmic Library · Rocket Builder physics (no DOM: runs in the browser and in Node)
 * ---------------------------------------------------------------------------
 * 1. Parts → vehicle: every mass comes from data/builder-parts.json (engines,
 *    boosters, payloads, fairings are sourced there; tanks follow the stated
 *    density × volume and structure-fraction model).
 * 2. Analysis: the Tsiolkovsky rocket equation, Δv = Isp · g0 · ln(m0 / mf),
 *    phase by phase (boosters + core together, core alone, each upper stage).
 * 3. Flight: a 2-D point-mass ascent in the Earth's equatorial-like flight
 *    plane, integrated with fourth-order Runge–Kutta, adapted from
 *    launch-physics.js (same U.S. Standard Atmosphere 1976 and drag curve):
 *    thrust F(p) = ṁ·Isp_vac·g0 − p·A_exit, drag ½ρv²·Cd(M)·A, inverse-square
 *    gravity, a rotating Earth and atmosphere, staging, throttling to a 4.5 g
 *    limit, a pitch-over + gravity turn in the air and closed-loop steering
 *    above it. A small "flight computer" flies each design with several pitch
 *    programs and keeps the best, so a rocket fails only when the physics says so.
 * ------------------------------------------------------------------------- */
import { atmosphere, cd as cdMach } from './launch-physics.js';
export { atmosphere };

export const G0 = 9.80665;                // standard gravity, m/s² (exact)
export const MU = 3.986004418e14;         // Earth GM, m³/s² (WGS-84)
export const RE = 6371000;                // mean Earth radius, m
export const OMEGA_E = 7.2921159e-5;      // Earth rotation rate, rad/s
export const P0 = 101325;                 // sea-level pressure, Pa
export const KARMAN = 100000;             // edge of space (Kármán line), m
export const TARGET_ALT = 200000;         // parking orbit the guidance aims for, m
export const ORBIT_MIN_PERI = 150000;     // "orbit achieved" = periapsis above this (below it drag brings it down within days)
export const G_LIMIT = 4.5;               // throttle back above this sensed acceleration (g), liquid engines only
export const DT = 0.2;                    // integration step, s (RK4)
export const DEG = Math.PI / 180;

export function tsiolkovsky(isp, m0, mf) { return mf > 0 && m0 > mf ? isp * G0 * Math.log(m0 / mf) : 0; }
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/* ================================================================== catalogue */
export function makeCatalogue(json) {
  const cat = { raw: json, props: {}, engines: {}, boosters: {}, payloads: {}, fairings: [], tanks: json.tanks, dest: json.destinations, site: json.site, sources: {} };
  for (const s of json.meta.sources) cat.sources[s.id] = s;
  for (const [id, p] of Object.entries(json.propellants)) {
    // bulk density of the mixture at the given oxidizer-to-fuel mass ratio r:
    // ρ = (1 + r) / (r/ρ_ox + 1/ρ_fuel)
    const bulk = (1 + p.mixture) / (p.mixture / p.rhoOx + 1 / p.rhoFuel);
    cat.props[id] = { ...p, id, bulk };
  }
  for (const e of json.engines) {
    let fSL = e.fSL, fVac = e.fVac;
    if (fVac == null) fVac = fSL * e.ispVac / e.ispSL;            // constant mass flow
    if (fSL == null && e.ispSL != null) fSL = fVac * e.ispSL / e.ispVac;
    const mdot = fVac * 1000 / (e.ispVac * G0);                    // kg/s at full thrust
    const Ae = fSL != null ? (fVac - fSL) * 1000 / P0                // effective exit area, m²
      : (e.chambers || 1) * Math.PI * (e.exitD / 2) ** 2;
    const fSLN = Math.max(0, fVac * 1000 - P0 * Ae);
    const foot = e.exitD * ((e.chambers || 1) > 1 ? 2.05 : 1) * 0.97 + 0.04; // space one engine needs across, m
    cat.engines[e.id] = { ...e, fVacN: fVac * 1000, fSLN, mdot, Ae, ispSLEff: fSLN / (mdot * G0), foot, prop: cat.props[e.family] };
  }
  for (const b of json.boosters) {
    const prof = b.profile;
    let mean = 0; // ∫ profile d(t/tb) by trapezoids
    for (let i = 1; i < prof.length; i++) mean += (prof[i][0] - prof[i - 1][0]) * (prof[i][1] + prof[i - 1][1]) / 2;
    const mdotAvg = b.prop / b.burn;
    const Ae = mdotAvg * G0 * (b.ispVac - b.ispSL) / P0;           // from the Isp difference at mean flow
    cat.boosters[b.id] = { ...b, mean, mdotAvg, Ae, dry: b.gross - b.prop };
  }
  for (const p of json.payloads) cat.payloads[p.id] = p;
  cat.fairings = json.fairings.slice().sort((a, b) => a.d - b.d);
  cat.fairingAlt = json.fairingJettisonAlt || 110000;
  cat.diameters = json.tanks.diameters.map(x => x.d);
  cat.vRot = OMEGA_E * RE * Math.cos(json.site.latitude * DEG) * Math.sin(json.site.azimuth * DEG);
  return cat;
}

/* booster thrust-shape factor at burn fraction f (normalised so its mean is 1) */
export function boosterShape(b, f) {
  const P = b.profile;
  if (f <= 0) return P[0][1] / b.mean;
  if (f >= 1) return 0;
  for (let i = 1; i < P.length; i++) if (f <= P[i][0]) {
    const [f0, v0] = P[i - 1], [f1, v1] = P[i];
    return (v0 + (v1 - v0) * (f - f0) / (f1 - f0)) / b.mean;
  }
  return 0;
}

/* tanks: usable propellant = fraction × cylinder volume × mixture bulk density */
export function tankProp(cat, t) { return cat.tanks.usableFraction * Math.PI * (t.d / 2) ** 2 * t.len * cat.props[t.fam].bulk; }
export function tankDry(cat, t) { return cat.props[t.fam].sigma * (1 + cat.tanks.sizePenalty / t.d) * tankProp(cat, t); }

/* engine cluster layout: positions (x, z) in metres, and the diameter it needs.
 * Bells may nearly touch (real clusters leave a few centimetres for gimballing). */
export function clusterLayout(n, foot) {
  const pts = [];
  if (n <= 0) return { pts, need: 0 };
  if (n === 1) { pts.push([0, 0]); return { pts, need: foot }; }
  const ring = (k, r, a0 = 0) => { for (let i = 0; i < k; i++) { const a = a0 + i / k * Math.PI * 2; pts.push([Math.cos(a) * r, Math.sin(a) * r]); } };
  if (n <= 4) { const r = foot / (2 * Math.sin(Math.PI / n)); ring(n, r, Math.PI / n); return { pts, need: 2 * r + foot }; }
  if (n <= 13) { // one around a centre engine (5 = 4 + 1, 9 = 8 + 1)
    const k = n - 1, r = Math.max(foot, foot / (2 * Math.sin(Math.PI / k)));
    pts.push([0, 0]); ring(k, r, Math.PI / k); return { pts, need: 2 * r + foot };
  }
  // bigger clusters: a centre group, then rings filled from the inside out
  const centre = n >= 20 ? 3 : 1;
  let left = n - centre, r = centre === 1 ? foot : foot * 1.15, j = 0, rmax = 0;
  if (centre === 1) pts.push([0, 0]); else ring(3, foot * 0.58);
  while (left > 0) {
    const cap = Math.max(3, Math.floor(2 * Math.PI * r / (foot * 1.02)));
    const k = Math.min(cap, left);
    ring(k, r, j * 0.3); left -= k; rmax = r; r += foot; j++;
  }
  return { pts, need: 2 * rmax + foot };
}

/* ================================================================== designs */
export function blankDesign() { return { payload: { id: 'smallsat' }, boosters: null, stages: [] }; }
export function cloneDesign(d) { return JSON.parse(JSON.stringify(d)); }

/* Build the physical vehicle from a design. Stage 0 is the bottom stage. */
export function buildVehicle(design, cat) {
  const stages = design.stages.map((s, i) => {
    const eng = s.engine ? cat.engines[s.engine] : null;
    const n = eng ? clamp(Math.round(s.n || 1), 1, 60) : 0;
    const tanks = (s.tanks || []).filter(t => cat.props[t.fam]);
    let prop = 0, unusable = 0, dryTank = 0, len = 0, d = 0;
    for (const t of tanks) {
      const p = tankProp(cat, t), dm = tankDry(cat, t);
      dryTank += dm; len += t.len; d = Math.max(d, t.d);
      if (eng && t.fam === eng.family) prop += p; else unusable += p;
    }
    const lay = eng ? clusterLayout(n, eng.foot) : { pts: [], need: 0 };
    const dBot = tanks.length ? tanks[0].d : 0, dTop = tanks.length ? tanks[tanks.length - 1].d : 0;
    return {
      i, s, eng, n, tanks, prop, unusable, dryTank, len, d: d || 0, dBot, dTop,
      engMass: eng ? eng.mass * n : 0,
      mdot: eng ? eng.mdot * n : 0,
      fVac: eng ? eng.fVacN * n : 0,
      fSL: eng ? eng.fSLN * n : 0,
      Ae: eng ? eng.Ae * n : 0,
      minThrottle: eng ? eng.minThrottle : 1,
      layout: lay, fits: !eng || lay.need <= (dBot || d) * 1.12 + 0.05,  // outer bells may overhang a little, under fairings
      engLen: eng ? eng.length : 0,
      inter: 0, dry: 0, wet: 0
    };
  });
  // interstage + separation hardware, carried by the lower stage (dropped with it)
  for (let i = 0; i < stages.length - 1; i++) {
    const up = stages[i + 1];
    const dUp = Math.max(up.dBot || up.d || 1, stages[i].dTop || 1);
    stages[i].inter = cat.tanks.interstageKgPerM2 * Math.PI * (dUp / 2) ** 2;
  }
  for (const s of stages) { s.dry = s.dryTank + s.engMass + s.inter + s.unusable; s.wet = s.dry + s.prop; }
  // payload, fairing, escape tower
  const pdef = cat.payloads[design.payload && design.payload.id] || cat.payloads.smallsat;
  const pmass = pdef.custom ? clamp(+design.payload.mass || pdef.mass, pdef.min, pdef.max) : pdef.mass;
  const top = stages[stages.length - 1];
  let fairing = null;
  if (!pdef.noFairing) {
    const need = Math.max(pdef.d + 0.1, top ? top.dTop || top.d : 0);
    fairing = cat.fairings.find(f => f.d >= need - 1e-6) || cat.fairings[cat.fairings.length - 1];
    fairing = { ...fairing, tooSmall: fairing.d < need - 1e-6 };
  }
  const payload = { def: pdef, id: pdef.id, mass: pmass, tower: pdef.tower || 0, fairing, dest: pdef.dest };
  // boosters (strap-ons on the first stage)
  let boosters = null;
  if (design.boosters && cat.boosters[design.boosters.id] && design.boosters.n > 0 && stages.length) {
    const b = cat.boosters[design.boosters.id];
    boosters = { def: b, n: clamp(Math.round(design.boosters.n), 1, 8), prop: b.prop, dry: b.dry };
  }
  const bMass = boosters ? boosters.n * boosters.def.gross : 0;
  const m0 = stages.reduce((a, s) => a + s.wet, 0) + bMass + pmass + payload.tower + (fairing ? fairing.mass : 0);
  // drag reference area: widest of the core, the fairing and the booster ring
  const dCore = Math.max(0, ...stages.map(s => s.d), fairing ? fairing.d : 0, pdef.noFairing ? pdef.d : 0);
  const areaCore = Math.PI * (dCore / 2) ** 2;
  const areaB = boosters ? boosters.n * Math.PI * (boosters.def.diameter / 2) ** 2 : 0;
  return { design, cat, stages, payload, boosters, m0, areaCore, areaB, dCore, vRot: cat.vRot };
}

/* mass above stage i (everything that stage i has to push besides itself) */
export function massAbove(veh, i) {
  let m = veh.payload.mass + veh.payload.tower + (veh.payload.fairing ? veh.payload.fairing.mass : 0);
  for (let j = i + 1; j < veh.stages.length; j++) m += veh.stages[j].wet;
  return m;
}

/* ================================================================== rocket-equation analysis
 * Phases in firing order. Liquid stages burn at full thrust; boosters burn with
 * the first stage (parallel staging) and are dropped when empty. The fairing and
 * the escape tower are counted until the second stage lights (the flight model
 * drops them at their real moments). ispEff: measured by the flight simulation
 * when available (the thrust actually delivered at the pressures the rocket
 * flew through), else a first-stage estimate 80 % of the way from sea level to vacuum. */
export function phases(veh, payloadMass = veh.payload.mass, ispEff = null) {
  const out = [];
  const S = veh.stages, B = veh.boosters;
  if (!S.length) return out;
  let m = veh.m0 - veh.payload.mass + payloadMass;
  const K_EST = 0.8;
  S.forEach((s, i) => {
    if (i === 1) m -= (veh.payload.fairing ? veh.payload.fairing.mass : 0) + veh.payload.tower;
    const coreT = s.mdot > 0 ? s.prop / s.mdot : 0;
    let coreLeft = s.prop;
    const ground = i === 0;
    const mk = (key, m0, mf, fVac, fSL, mdot, burn, withB) => {
      const ispVac = mdot > 0 ? fVac / (mdot * G0) : 0, ispSL = mdot > 0 ? fSL / (mdot * G0) : 0;
      let ie = ground ? ispSL + K_EST * (ispVac - ispSL) : ispVac, measured = false;
      if (ispEff && ispEff[key] > 0) { ie = clamp(ispEff[key], Math.min(ispSL, ispVac) - 1, ispVac + 1); measured = true; }
      out.push({ key, stage: i, boosters: withB, m0, mf, burn, ispVac, ispSL, ispEff: ie, measured,
        dvVac: tsiolkovsky(ispVac, m0, mf), dvSL: tsiolkovsky(ispSL, m0, mf), dv: tsiolkovsky(ie, m0, mf),
        twr0: fSL > 0 && ground ? fSL / (m0 * G0) : fVac / (m0 * G0), twr1: fVac / (mf * G0) });
    };
    if (ground && B) {
      const bd = B.def, tb = bd.burn;
      const tA = s.mdot > 0 ? Math.min(tb, coreT) : tb;
      const bFrac = tA / tb;
      const dm = s.mdot * tA + B.n * B.prop * bFrac;
      const bF = B.n * B.def.mdotAvg * bd.ispVac * G0, bFsl = B.n * B.def.mdotAvg * bd.ispSL * G0;
      mk('0b', m, m - dm, s.fVac + bF, s.fSL + bFsl, s.mdot + B.n * bd.mdotAvg, tA, true);
      m -= dm; coreLeft -= s.mdot * tA;
      if (bFrac < 1 - 1e-9) { // core ran dry first: boosters finish alone
        const dm2 = B.n * B.prop * (1 - bFrac);
        mk('0B', m, m - dm2, bF, bFsl, B.n * bd.mdotAvg, tb - tA, true);
        m -= dm2;
      }
      m -= B.n * B.dry;
    }
    if (coreLeft > 1e-6 && s.mdot > 0) {
      mk(String(i), m, m - coreLeft, s.fVac, s.fSL, s.mdot, coreLeft / s.mdot, false);
      m -= coreLeft;
    } else if (!(ground && B)) {
      // no engine, or nothing it can burn: a dead stage (zero Δv), carried until it is dropped
      out.push({ key: String(i), stage: i, boosters: false, m0: m, mf: m, burn: 0, ispVac: 0, ispSL: 0, ispEff: 0, dvVac: 0, dvSL: 0, dv: 0, twr0: 0, twr1: 0, dead: true });
      m -= coreLeft > 0 ? coreLeft : 0;
    }
    m -= s.dry;
  });
  return out;
}

export function totalDv(veh, payloadMass, ispEff) { return phases(veh, payloadMass, ispEff).reduce((a, p) => a + p.dv, 0); }

/* payload that leaves exactly `need` m/s of rocket-equation Δv (bisection) */
export function capacity(veh, need, ispEff) {
  if (!veh.stages.length || totalDv(veh, 0, ispEff) < need) return 0;
  let lo = 0, hi = Math.max(1000, veh.m0);
  for (let k = 0; k < 50; k++) { const mid = (lo + hi) / 2; if (totalDv(veh, mid, ispEff) >= need) lo = mid; else hi = mid; }
  return lo;
}

export function liftoffThrust(veh, p = P0) {
  if (!veh.stages.length) return 0;
  const s = veh.stages[0];
  let F = Math.max(0, s.fVac - p * s.Ae);
  if (veh.boosters) { const b = veh.boosters.def; F += veh.boosters.n * Math.max(0, b.mdotAvg * boosterShape(b, 0) * b.ispVac * G0 - p * b.Ae); }
  return F;
}

/* Everything the panel shows, in one object. */
export function analyse(veh, flight = null) {
  const cat = veh.cat;
  const ispEff = flight ? flight.ispEff : null;
  const ph = phases(veh, veh.payload.mass, ispEff);
  const dv = ph.reduce((a, p) => a + p.dv, 0);
  const dvVac = ph.reduce((a, p) => a + p.dvVac, 0), dvSL = ph.reduce((a, p) => a + p.dvSL, 0);
  const destKey = veh.payload.dest || 'leo';
  const dest = cat.dest[destKey] || cat.dest.leo;
  const need = dest.dv + dest.extra, needLEO = cat.dest.leo.dv;
  const F0 = liftoffThrust(veh);
  const twr = veh.m0 > 0 ? F0 / (veh.m0 * G0) : 0;
  const stageInfo = veh.stages.map((s, i) => {
    const mine = ph.filter(p => p.stage === i);
    const m0 = mine.length ? mine[0].m0 : 0, mf = mine.length ? mine[mine.length - 1].mf : 0;
    return {
      i, wet: s.wet, dry: s.dry, prop: s.prop, burn: s.mdot > 0 ? s.prop / s.mdot : 0,
      dv: mine.reduce((a, p) => a + p.dv, 0), dvVac: mine.reduce((a, p) => a + p.dvVac, 0), dvSL: mine.reduce((a, p) => a + p.dvSL, 0),
      twr: i === 0 ? twr : (m0 > 0 ? s.fVac / (m0 * G0) : 0), twrEnd: mf > 0 ? s.fVac / (mf * G0) : 0,
      m0, mf, ispVac: s.eng ? s.eng.ispVac : 0, ispSL: s.eng ? s.eng.ispSLEff : 0,
      ispEff: mine.length ? mine[mine.length - 1].ispEff : 0, measured: mine.some(p => p.measured)
    };
  });
  const propTot = veh.stages.reduce((a, s) => a + s.prop, 0) + (veh.boosters ? veh.boosters.n * veh.boosters.prop : 0);
  const structTot = veh.m0 - propTot - veh.payload.mass;
  const an = {
    phases: ph, stages: stageInfo, dv, dvVac, dvSL, need, needLEO, dest: destKey, destInfo: dest,
    m0: veh.m0, F0, twr, payload: veh.payload.mass, payloadFraction: veh.m0 > 0 ? veh.payload.mass / veh.m0 : 0,
    propTot, structTot, capLEO: capacity(veh, needLEO, ispEff), capDest: capacity(veh, need, ispEff),
    height: vehicleHeight(veh)
  };
  an.issues = diagnose(veh, an, flight);
  an.verdict = verdict(veh, an, flight);
  return an;
}

/* approximate stack height (m): engines + tanks + interstages + payload */
export function vehicleHeight(veh) {
  const S = veh.stages;
  if (!S.length) return 0;
  let h = S[0].eng ? S[0].engLen * 0.55 : 0.5;
  S.forEach((s, i) => { h += s.len; if (i < S.length - 1) h += interstageHeight(S[i + 1]); });
  const P = veh.payload;
  if (P.fairing) h += P.fairing.len; else h += P.def.h;
  if (P.tower) h += 10;
  return h;
}
export function interstageHeight(upper) { return Math.max(1.2, (upper.eng ? upper.engLen * 0.9 : 0) + 0.4); }

/* ================================================================== explanations (the teaching core)
 * level: 'fail' (the rocket cannot do it), 'warn' (works poorly), 'ok' (good), 'info' */
const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
const f2 = (x) => (Math.round(x * 100) / 100).toFixed(2);
const kms = (v) => (v / 1000).toFixed(1);
const tonnes = (kg) => kg >= 100000 ? `${Math.round(kg / 1000).toLocaleString('en-US')} t` : kg >= 1000 ? `${(kg / 1000).toFixed(1)} t` : `${Math.round(kg)} kg`;
export const fmt = { f1, f2, kms, tonnes };

export function stageName(i, n) { return n === 1 ? 'The single stage' : `Stage ${i + 1}`; }

export function diagnose(veh, an, flight) {
  const I = [];
  const S = veh.stages, cat = veh.cat;
  const add = (level, key, title, text, tip, stage = null) => I.push({ level, key, title, text, tip, stage });
  if (!S.length) { add('fail', 'empty', 'No rocket yet', 'Drag a tank and an engine onto the stack to make a first stage.', null); return I; }
  S.forEach((s, i) => {
    const nm = stageName(i, S.length);
    if (!s.tanks.length) add('fail', 'notank' + i, `${nm} has no tanks`, 'An engine without propellant is just weight.', 'Drop a tank onto it.', i);
    if (!s.eng) add('fail', 'noeng' + i, `${nm} has no engine`, 'Its propellant can never be burned, so it is dead weight all the way up.', 'Drop an engine onto it.', i);
    if (s.eng && s.unusable > 0) {
      const fams = [...new Set(s.tanks.filter(t => t.fam !== s.eng.family).map(t => cat.props[t.fam].name.toLowerCase()))].join(' and ');
      add(s.prop > 0 ? 'warn' : 'fail', 'mix' + i, `${nm}: the engine cannot drink that`, `${s.eng.name} burns ${cat.props[s.eng.family].name.toLowerCase()}, but ${s.prop > 0 ? 'part of this stage holds' : 'this stage holds'} ${fams}: ${tonnes(s.unusable)} of propellant that is carried and never burned.`, `Use ${cat.props[s.eng.family].short} tanks, or an engine that burns ${fams}.`, i);
    }
    if (s.eng && !s.fits) add('warn', 'fit' + i, `${nm}: ${s.n} × ${s.eng.name} do not fit`, `The cluster needs about ${f1(s.layout.need)} m across but the stage is ${f1(s.dBot)} m wide. Real rockets are sized around their engines.`, 'Use fewer or smaller engines, or a wider tank.', i);
    if (s.eng && s.eng.vacuumOnly && i === 0) {
      const frac = s.eng.fSLN / s.eng.fVacN;
      add('warn', 'vac0', `${s.eng.name} on the first stage`, `Its huge bell is built for vacuum. At sea level the air pushes back on ${f1(s.eng.Ae)} m² of nozzle exit: thrust is only ${Math.round(frac * 100)} % of the vacuum value, and in reality the exhaust would tear away from the nozzle wall and could wreck it.`, 'Use a sea-level engine for the ground stage.', i);
    }
    if (s.eng && !s.eng.vacuumOnly && i > 0 && ['merlin', 'raptor', 'rutherford'].includes(s.eng.id)) {
      const alt = { merlin: 'mvac', raptor: 'rvac', rutherford: 'rutherfordvac' }[s.eng.id];
      const e2 = cat.engines[alt];
      add('info', 'sl' + i, `${nm} uses a sea-level engine`, `Up here there is no air, so a larger bell pays off: ${e2.name} gets ${Math.round(e2.ispVac)} s instead of ${Math.round(s.eng.ispVac)} s.`, `Try ${e2.name}.`, i);
    }
  });
  if (an.twr > 0 && an.twr < 1) {
    add('fail', 'twr', `Liftoff thrust-to-weight ${f2(an.twr)}: it cannot leave the pad`, `The rocket weighs ${f1(veh.m0 * G0 / 1e6)} MN; its engines push ${f1(an.F0 / 1e6)} MN. It would sit on the pad burning propellant until it was light enough, wasting most of it.`, 'Add engines or strap-on boosters, or shorten the first stage.', 0);
  } else if (an.twr >= 1 && an.twr < 1.2) {
    add('warn', 'twr', `Liftoff thrust-to-weight ${f2(an.twr)}: a slow start`, `Only ${Math.round((an.twr - 1) * 100)} % more push than weight, so it creeps off the pad at ${f1((an.twr - 1) * G0)} m/s². Every second spent climbing slowly costs up to 9.8 m/s of Δv to gravity (gravity loss). The Saturn V lifted off at about 1.16; most rockets use 1.2–1.5.`, 'More thrust or boosters would help.', 0);
  } else if (an.twr > 2.6) {
    add('info', 'twr', `Liftoff thrust-to-weight ${f2(an.twr)}: very punchy`, 'Plenty of push, but engines are heavy, and a fast climb through thick air means high drag and dynamic pressure.', 'You can probably carry fewer engines or more propellant.', 0);
  }
  an.stages.forEach((st, i) => {
    if (i === 0 || !S[i].eng) return;
    const nm = stageName(i, S.length);
    if (st.twr < 0.25) add(flight && flight.result && flight.result.type === 'orbit' ? 'warn' : 'fail', 'twrU' + i, `${nm} thrust-to-weight ${f2(st.twr)} at ignition`, `Its engine${S[i].n > 1 ? 's' : ''} can lift only a quarter of its weight. While it burns, gravity steals most of its effort: unless the stages below already threw it nearly to orbital speed, it falls back before it gets there.${flight && flight.result && flight.result.type === 'orbit' ? ' Here the stages below did most of the work, so it scrapes through.' : ''}`, 'Add engines to this stage, or make it smaller.', i);
    else if (st.twr < 0.5) add('warn', 'twrU' + i, `${nm} thrust-to-weight ${f2(st.twr)} at ignition`, `Its engine${S[i].n > 1 ? 's' : ''} push less than its weight, so it sags while it burns and must be lofted high by the stage below. That works (the Space Shuttle's upper stages and Centaur do it), but gravity takes a bite out of the Δv.`, null, i);
  });
  an.stages.forEach((st, i) => {
    if (!S[i].eng) return;
    if (st.burn > 0 && st.burn < 25) add('info', 'burn' + i, `${stageName(i, S.length)} burns for only ${Math.round(st.burn)} s`, 'A lot of engine for very little propellant: the engines are dead weight for the rest of the flight.', 'Longer tanks or fewer engines.', i);
    if (st.burn > 900 && i === 0) add('warn', 'burnL' + i, `${stageName(i, S.length)} burns for ${Math.round(st.burn / 60)} minutes`, 'A first stage that burns this long spends ages fighting gravity.', 'More engines, or split it into two stages.', i);
    if (st.twrEnd > G_LIMIT + 0.5 && S[i].minThrottle >= 1 && !(i === 0 && veh.boosters)) add('info', 'g' + i, `${stageName(i, S.length)} ends at ${f1(st.twrEnd)} g`, `As the tanks empty the rocket gets lighter and the push stays the same, so acceleration climbs. ${S[i].eng.name} cannot throttle, so the payload rides it out (the flight computer throttles engines that can, to ${G_LIMIT} g).`, null, i);
  });
  // the big one: enough Δv?
  const short = an.needLEO - an.dv;
  if (S.every(s => s.eng)) {
    if (short > 0) {
      let tip = 'Lighten the payload, or add propellant to the top stage (every kilogram saved up there is worth several down below).';
      if (S.length === 1) tip = 'Split it into two stages. A single stage carries its empty tanks and engines all the way to orbit; staging throws that weight away halfway.';
      else if (an.payloadFraction > 0.05) tip = `The payload is ${f1(an.payloadFraction * 100)} % of the liftoff mass; good rockets manage 1–4 %. Pick a lighter payload or a bigger rocket.`;
      add('fail', 'dv', `Δv ${kms(an.dv)} km/s: ${kms(short)} km/s short of orbit`, `Reaching low Earth orbit (LEO) takes about ${kms(an.needLEO)} km/s: 7.8 km/s of orbital speed plus roughly 1.5–2 km/s lost to gravity and drag on the way up, minus the Earth's spin.`, tip);
    } else {
      add('ok', 'dv', `Δv ${kms(an.dv)} km/s: enough for orbit`, `About ${kms(an.needLEO)} km/s gets you to low Earth orbit (LEO): 7.8 km/s of orbital speed plus gravity and drag losses on the way up.`, null);
      if (an.need > an.needLEO) {
        const d = an.destInfo;
        if (an.dv < an.need) add('warn', 'dest', `…but not enough for ${d.short}`, `This payload is meant for ${d.name}, which needs another ${kms(d.extra)} km/s after reaching orbit (${kms(an.need)} km/s in total).`, 'A bigger upper stage (ideally burning hydrogen) or a lighter payload.');
        else add('ok', 'dest', `Enough for ${d.short}`, `${d.name} needs about ${kms(an.need)} km/s in total; this rocket has ${kms(an.dv)} km/s.`, null);
      }
    }
    if (S.length === 1 && short > 0) add('info', 'ssto', 'Why single-stage-to-orbit is so hard', `Even at 95 % propellant a stage burning kerosene manages only about ${kms(tsiolkovsky(300, 1, 0.07))} km/s. Real rockets stage because the rocket equation punishes every kilogram of empty tank you keep carrying.`, null);
  }
  // flight result, when it disagrees with the rocket equation
  if (flight && flight.result && an.dv >= an.needLEO && flight.result.type !== 'orbit' && an.twr >= 1) {
    const r = flight.result;
    add('fail', 'flight', 'The rocket equation says yes, the flight says no', `On paper it has enough Δv, but in the simulated flight it ${r.type === 'crash' ? 'fell back and crashed' : `ran out at ${kms(r.vMax)} km/s, ${r.apo > 0 ? `peaking at ${Math.round(r.apo / 1000)} km` : ''}`}. ${flight.losses ? `Gravity took ${kms(flight.losses.grav)} km/s and drag ${kms(flight.losses.drag)} km/s, more than the typical 1.5–2 km/s.` : ''}`, 'Usually a stage with too little thrust (it falls while burning), or a slow liftoff.');
  }
  return I.sort((a, b) => ({ fail: 0, warn: 1, ok: 2, info: 3 }[a.level] - { fail: 0, warn: 1, ok: 2, info: 3 }[b.level]));
}

export function verdict(veh, an, flight) {
  const S = veh.stages;
  if (!S.length) return { type: 'empty', title: 'Start building', text: 'Load a preset or drag parts onto the stack.' };
  if (S.some(s => !s.eng || !s.tanks.length)) return { type: 'fail', title: 'Not a working rocket yet', text: 'Every stage needs a tank and an engine.' };
  const r = flight && flight.result;
  if (an.twr < 1 || (r && r.type === 'pad')) return { type: 'fail', title: 'Stays on the pad', text: `Thrust-to-weight ${f2(an.twr)} at liftoff: weight wins.` };
  if (r && r.type === 'orbit') {
    const d = an.destInfo;
    const beyond = an.need > an.needLEO;
    const ok = !beyond || r.dvLeft >= d.extra;
    return {
      type: ok ? 'orbit' : 'partial', title: ok ? (beyond ? `Reaches orbit, then ${d.short}` : 'Reaches orbit') : 'Reaches orbit, not the destination',
      text: `${Math.round(r.apo / 1000)} × ${Math.round(r.peri / 1000)} km orbit with ${kms(r.dvLeft)} km/s left${beyond ? ` (${d.short} needs ${kms(d.extra)})` : ''}.`
    };
  }
  if (r && (r.type === 'suborbital' || r.type === 'short' || r.type === 'crash')) {
    const shortBy = Math.max(0, an.needLEO - an.dv);
    return { type: 'fail', title: r.type === 'suborbital' ? 'Reaches space, falls back' : r.type === 'crash' ? 'Falls back and crashes' : 'Never reaches space',
      text: `${r.type === 'suborbital' ? `Peaks at ${Math.round(r.apo / 1000)} km, ` : ''}${shortBy > 0 ? `${kms(shortBy)} km/s short of the ${kms(an.needLEO)} km/s orbit needs.` : 'too little thrust in the upper stage to use its Δv.'}` };
  }
  return an.dv >= an.needLEO ? { type: 'orbit', title: 'Should reach orbit', text: `Δv ${kms(an.dv)} km/s` } : { type: 'fail', title: 'Short of orbit', text: `Δv ${kms(an.dv)} of ${kms(an.needLEO)} km/s` };
}

/* ================================================================== flight simulation */
const W_EFF_OF = (veh) => veh.vRot / RE;

export class FlightSim {
  /* params: kick (deg, pitch-over angle), loft (0–1: how steeply the closed-loop steering climbs)
   * opts: { debris: bool, hist: bool } */
  constructor(veh, params = {}, opts = {}) {
    this.veh = veh; this.p = { kick: 3, loft: 1, cl0: false, vKick: 45, ...params }; this.opts = opts;
    this.W = W_EFF_OF(veh);
    this.reset();
  }
  reset() {
    const v = this.veh;
    this.t = -3; this.x = 0; this.y = RE; this.vx = v.vRot; this.vy = 0; this.m = v.m0;
    this.si = 0; this.nStages = v.stages.length;
    this.propLeft = v.stages.map(s => s.prop);
    this.bOn = !!v.boosters; this.bLit = false; this.bLeft = v.boosters ? v.boosters.prop * v.boosters.n : 0; this.bT = 0;
    this.released = false; this.state = 'pad';
    this.engOn = v.stages.length > 0 && !!v.stages[0].eng; this.level = 0; this.throttle = 1; this.ignT = -3;
    this.pitch = 0; this.kickT = null; this.closed = false;
    this.fairing = !!v.payload.fairing; this.tower = v.payload.tower > 0;
    this.sepAt = null; this.ignAt = null; this.cutT = null;
    this.events = []; this.debris = []; this.hist = []; this.lastHist = -1e9;
    this.max = { q: 0, qT: 0, g: 0, h: 0, v: 0 };
    this.loss = { grav: 0, drag: 0, steer: 0, press: 0 }; this.dvThrust = 0; this.dvIdeal = 0;
    this.ph = {}; this.phKey = null;
    this.result = null; this.done = false; this._F = 0; this._mdot = 0; this._aT = 0;
    this.derived();
  }
  get alt() { return Math.hypot(this.x, this.y) - RE; }
  event(id, extra = {}) { this.events.push({ t: this.t, id, stage: this.si, ...extra }); }

  derived() {
    const r = Math.hypot(this.x, this.y), h = r - RE;
    const ux = this.x / r, uy = this.y / r, ex = uy, ey = -ux;
    const vax = this.vx - this.W * this.y, vay = this.vy + this.W * this.x;
    const vrel = Math.hypot(vax, vay);
    const atm = atmosphere(h);
    const vr = this.vx * ux + this.vy * uy, vh = this.vx * ex + this.vy * ey;
    const varr = vax * ux + vay * uy, vah = vax * ex + vay * ey;
    const theta = Math.atan2(this.x, this.y);
    const phiE = theta - this.W * Math.max(0, this.t);
    this.d = { r, h, ux, uy, ex, ey, vax, vay, vrel, atm, M: vrel / atm.a, q: 0.5 * atm.rho * vrel * vrel, vr, vh, var: varr, vah,
      vin: Math.hypot(this.vx, this.vy), gammaI: Math.atan2(vr, vh), downrange: RE * phiE, phiE };
    return this.d;
  }
  area() { return this.veh.areaCore + (this.bOn ? this.veh.areaB : 0); }

  /* thrust (N), mass flow (kg/s) and vacuum thrust at ambient pressure p */
  propulsion(p) {
    let F = 0, mdot = 0, Fvac = 0;
    const s = this.veh.stages[this.si];
    if (this.engOn && s && s.eng && this.propLeft[this.si] > 0 && this.level > 0) {
      const k = this.level * this.throttle;
      const md = s.mdot * k;
      mdot += md; Fvac += md * s.eng.ispVac * G0;
      F += Math.max(0, md * s.eng.ispVac * G0 - p * s.Ae);
    }
    if (this.bOn && this.bLit && this.bLeft > 0) {
      const b = this.veh.boosters.def, n = this.veh.boosters.n;
      const md = n * b.mdotAvg * boosterShape(b, this.bT / b.burn);
      mdot += md; Fvac += md * b.ispVac * G0;
      F += Math.max(0, md * b.ispVac * G0 - p * b.Ae * n);
    }
    return { F, mdot, Fvac };
  }

  guidance(d) {
    const p = this.p;
    if (!this.released) return 0;
    if (this.kickT == null) {
      if (d.h > 100 && d.vrel > p.vKick) this.kickT = this.t;
      return 0;
    }
    const k = p.kick * DEG, tk = this.t - this.kickT;
    if (tk < 10) return k * tk / 10;                                  // pitch-over
    const air = Math.atan2(d.vah, d.var);                             // air-relative velocity, from vertical
    // the first stage flies a pure gravity turn (like the Saturn V's S-IC tilt program);
    // closed-loop steering takes over in the upper stages, or high up in the first
    // stage when it does most of the work (the flight computer tries both)
    if (!this.closed && (this.si > 0 || ((this.nStages === 1 || p.cl0) && d.h > 42000 && d.q < 4000))) this.closed = true;
    if (!this.closed) return Math.max(air, Math.min(this.pitch, air + 0.02), 0);  // gravity turn: zero angle of attack
    // Closed-loop steering, the radial channel of powered explicit guidance
    // (PEG, as flown on the Space Shuttle), simplified: choose a radial
    // acceleration that varies linearly in time so that, when the propellant
    // needed for orbit is used up (time-to-go T), the climb rate is zero and the
    // altitude is the target. The rest of the thrust builds horizontal speed.
    if (this._F <= 0) return this.pitch;                              // coasting between stages: hold attitude
    const g = MU / (d.r * d.r), cent = d.vh * d.vh / d.r;
    const vCirc = Math.sqrt(MU / (RE + TARGET_ALT));
    const T = Math.max(8, this.timeToGo(Math.max(0, vCirc - d.vh) * 1.02) * p.loft);
    // vr + a0·T + a1·T²/2 = 0  and  h + vr·T + a0·T²/2 + a1·T³/6 = target
    // solve the 2 × 2 system for a0 (Cramer's rule); det = T⁴/6 − T⁴/4
    const det = -(T * T * T * T) / 12;
    const b1 = -d.vr, b2 = TARGET_ALT - d.h - d.vr * T;
    const a0 = (b1 * T * T * T / 6 - (T * T / 2) * b2) / det;
    const aR = a0 + g - cent;                                         // radial thrust acceleration wanted now
    const aT = Math.max(this._aT, 0.1);
    let lo = this.si === 0 ? -0.05 : -0.35, hi = 0.9;
    if (d.h < 120000 && d.vr < 0) lo = Math.max(lo, 0.3);            // do not dive back into the air
    const sN = clamp(aR / aT, lo, hi);
    const cmd = Math.PI / 2 - Math.asin(sN);
    const maxd = 2.5 * DEG * DT;                                      // pitch-rate limit 2.5°/s
    return this.pitch + clamp(cmd - this.pitch, -maxd, maxd);
  }
  /* time needed to gain dv (m/s) with the stages that are left, at full thrust (s) */
  timeToGo(dv) {
    let m = this.m, t = 0, rem = dv;
    for (let i = this.si; i < this.nStages && rem > 0; i++) {
      const s = this.veh.stages[i];
      const prop = this.propLeft[i];
      if (!s.eng || s.mdot <= 0 || prop <= 0) { m -= prop + s.dry; continue; }
      const ve = s.eng.ispVac * G0, dvS = ve * Math.log(m / (m - prop));
      if (dvS >= rem) { t += (m - m * Math.exp(-rem / ve)) / s.mdot; rem = 0; break; }
      t += prop / s.mdot + 3.5; rem -= dvS; m -= prop + s.dry;
    }
    return t;
  }
  /* remaining burn time of this and later stages at full thrust (s) */
  burnLeft() {
    let t = 0;
    for (let i = this.si; i < this.nStages; i++) { const s = this.veh.stages[i]; if (s.mdot > 0) t += this.propLeft[i] / s.mdot; }
    return t;
  }

  deriv(s, pitch, P) {
    const [x, y, vx, vy, m] = s;
    const r = Math.hypot(x, y), h = r - RE;
    const ux = x / r, uy = y / r, ex = uy, ey = -ux;
    const atm = atmosphere(h);
    const vax = vx - this.W * y, vay = vy + this.W * x;
    const v = Math.hypot(vax, vay);
    const D = h < 150000 ? 0.5 * atm.rho * v * v * cdMach(v / atm.a) * this.area() : 0;
    // thrust varies with ambient pressure inside the step
    const F = Math.max(0, P.Fvac - (P.Fvac - P.F) * (atm.p / Math.max(P.p, 1e-9)));
    const tx = Math.sin(pitch) * ex + Math.cos(pitch) * ux, ty = Math.sin(pitch) * ey + Math.cos(pitch) * uy;
    const gA = MU / (r * r);
    const ax = (F * tx - (v > 0 ? D * vax / v : 0)) / m - gA * ux;
    const ay = (F * ty - (v > 0 ? D * vay / v : 0)) / m - gA * uy;
    return [vx, vy, ax, ay, -P.mdot];
  }

  /* osculating two-body orbit: apoapsis / periapsis altitudes (m) */
  orbit() {
    const r = Math.hypot(this.x, this.y), v2 = this.vx * this.vx + this.vy * this.vy;
    const eps = v2 / 2 - MU / r;
    const hA = this.x * this.vy - this.y * this.vx;
    const e = Math.sqrt(Math.max(0, 1 + 2 * eps * hA * hA / (MU * MU)));
    const a = -MU / (2 * eps);
    // argument of periapsis (angle of the periapsis direction, measured like atan2(x, y))
    const rv = this.x * this.vx + this.y * this.vy;
    const exv = ((v2 - MU / r) * this.x - rv * this.vx) / MU, eyv = ((v2 - MU / r) * this.y - rv * this.vy) / MU;
    return { apo: eps < 0 ? a * (1 + e) - RE : Infinity, peri: a * (1 - e) - RE, e, a, w: Math.atan2(exv, eyv), eps };
  }

  /* vacuum Δv still in the tanks: current stage's remainder, then later stages */
  dvLeft() {
    let m = this.m, dv = 0;
    for (let i = this.si; i < this.nStages; i++) {
      const s = this.veh.stages[i];
      if (i > this.si) m = m; // stage i already included in m
      const p = this.propLeft[i];
      if (s.eng && p > 0) dv += tsiolkovsky(s.eng.ispVac, m, m - p);
      m -= p + s.dry;
    }
    return dv;
  }

  setPhase(key) {
    if (this.phKey === key) return;
    this.phKey = key;
    if (key && !this.ph[key]) this.ph[key] = { m0: this.m, mf: this.m, dv: 0 };
  }

  step(dt = DT) {
    if (this.done) { this.coast(dt); return; }
    const v = this.veh, t = this.t;
    let d = this.d;
    // ---------- discrete events ----------
    const s = v.stages[this.si];
    if (!this.released) {
      if (this.engOn) this.level = clamp((t - this.ignT) / 2.5, 0, 1);
      if (t >= 0) {
        if (this.bOn && !this.bLit) { this.bLit = true; this.event('boosterIgn'); }
        const P = this.propulsion(P0);
        if (P.F > this.m * G0 * 1.0005) { this.released = true; this.state = 'ascent'; this.event('liftoff'); }
        else if (t >= 3) { this.finish('pad'); this.engOn = false; this.bLit = false; this.event('abort'); return; }
      }
      if (!this.released) {
        const P = this.propulsion(P0);
        this.m -= P.mdot * dt; if (this.engOn) this.propLeft[0] -= (s ? s.mdot * this.level * this.throttle : 0) * dt;
        if (this.bLit) { this.bLeft -= (P.mdot - (s && this.engOn ? s.mdot * this.level * this.throttle : 0)) * dt; this.bT += dt; }
        this._F = P.F; this._mdot = P.mdot; this.t += dt; this.derived(); return;
      }
    }
    // separation and ignition timers
    if (this.sepAt != null && t >= this.sepAt) this.separateStage();
    if (this.ignAt != null && t >= this.ignAt) {
      this.ignAt = null;
      const ns = v.stages[this.si];
      if (ns && ns.eng && this.propLeft[this.si] > 0) { this.engOn = true; this.ignT = t; this.level = 0; this.event('ignition'); }
    }
    if (this.engOn) this.level = clamp((t - this.ignT) / (this.si === 0 ? 2.5 : 1.0), 0, 1);
    // fairing and escape tower
    if (this.fairing && d.h > v.cat.fairingAlt) { this.fairing = false; this.drop('fairing', v.payload.fairing.mass, 0); this.event('fairing'); }
    if (this.tower && ((this.si >= 1 && this.stageT() > 25) || (this.nStages === 1 && d.h > 90000))) { this.tower = false; this.drop('tower', v.payload.tower, 20); this.event('tower'); }
    // ---------- throttle: stay under the g limit (liquids that can throttle) ----------
    const P0now = this.propulsion(d.atm.p);
    if (s && s.eng && this.engOn && s.minThrottle < 1) {
      const Dn = 0.5 * d.atm.rho * d.vrel * d.vrel * cdMach(d.M) * this.area();
      const Fbo = P0now.F - (this.throttle > 0 ? 0 : 0);
      const aNow = (P0now.F - Dn) / this.m / G0;
      if (aNow > G_LIMIT) this.throttle = clamp(this.throttle * G_LIMIT / aNow, s.minThrottle, 1);
      else if (aNow < G_LIMIT * 0.97) this.throttle = clamp(this.throttle * 1.02, s.minThrottle, 1);
      void Fbo;
    }
    const P = this.propulsion(d.atm.p); P.p = d.atm.p;
    this._aT = P.F / this.m;
    this.pitch = this.guidance(d);
    // phase bookkeeping (for the measured effective Isp)
    const burningCore = this.engOn && s && s.eng && this.propLeft[this.si] > 0 && this.level > 0;
    const burningB = this.bOn && this.bLit && this.bLeft > 0;
    this.setPhase(burningCore || burningB ? (this.si === 0 && burningB ? (burningCore ? '0b' : '0B') : String(this.si)) : null);
    // ---------- RK4 ----------
    const pitch = this.pitch;
    const s0 = [this.x, this.y, this.vx, this.vy, this.m];
    const k1 = this.deriv(s0, pitch, P);
    const s1 = s0.map((q, i) => q + k1[i] * dt / 2);
    const k2 = this.deriv(s1, pitch, P);
    const s2 = s0.map((q, i) => q + k2[i] * dt / 2);
    const k3 = this.deriv(s2, pitch, P);
    const s3 = s0.map((q, i) => q + k3[i] * dt);
    const k4 = this.deriv(s3, pitch, P);
    const ns = s0.map((q, i) => q + (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) * dt / 6);
    const dm = s0[4] - ns[4];
    [this.x, this.y, this.vx, this.vy, this.m] = ns;
    // split the propellant used between core and boosters
    let dmB = 0;
    if (burningB) {
      const b = v.boosters.def;
      dmB = Math.min(this.bLeft, v.boosters.n * b.mdotAvg * boosterShape(b, this.bT / b.burn) * dt);
      this.bLeft -= dmB; this.bT += dt;
    }
    if (burningCore) this.propLeft[this.si] -= Math.max(0, dm - dmB);
    // ---------- Δv bookkeeping ----------
    const mMid = this.m + dm / 2;
    const aThr = P.F / mMid, aVac = P.Fvac / mMid;
    const g = MU / (d.r * d.r);
    const Dm = d.h < 150000 ? 0.5 * d.atm.rho * d.vrel * d.vrel * cdMach(d.M) * this.area() / this.m : 0;
    this.dvThrust += aThr * dt; this.dvIdeal += aVac * dt;
    this.loss.press += (aVac - aThr) * dt;
    this.loss.grav += g * Math.sin(d.gammaI) * dt;
    this.loss.drag += Dm * dt;
    // steering loss: thrust not along the inertial velocity. Measured in the inertial
    // frame so the budget closes exactly: ∫F/m dt − gravity − drag − steering = change
    // of inertial speed. (Early on this includes climbing vertically while the Earth's
    // spin carries the rocket sideways at 408 m/s.)
    const vdir = Math.atan2(d.vh, d.vr);
    this.loss.steer += aThr * (1 - Math.cos(pitch - vdir)) * dt;
    if (this.phKey) { const q = this.ph[this.phKey]; q.dv += aThr * dt; q.mf = this.m; }
    this._F = P.F; this._mdot = P.mdot;
    this.t += dt;
    d = this.derived();
    // ---------- peaks ----------
    if (d.q > this.max.q) { this.max.q = d.q; this.max.qT = this.t; }
    const acc = (P.F - Dm * this.m) / this.m / G0;
    if (acc > this.max.g) this.max.g = acc;
    if (d.h > this.max.h) this.max.h = d.h;
    if (d.vin > this.max.v) this.max.v = d.vin;
    if (!this.flagMaxQ && this.max.q > 5000 && d.q < this.max.q * 0.97 && this.t > 20) { this.flagMaxQ = true; this.events.push({ t: this.max.qT, id: 'maxq', stage: this.si, q: this.max.q }); }
    if (!this.flagSpace && d.h > KARMAN) { this.flagSpace = true; this.event('space'); }
    // ---------- booster burnout ----------
    if (this.bOn && this.bLit && this.bLeft <= 1e-6) {
      this.bOn = false; this.bLit = false;
      this.m -= v.boosters.n * v.boosters.dry;
      this.drop('boosters', v.boosters.dry, 3);
      this.event('boosterSep');
    }
    // ---------- stage burnout ----------
    if (this.engOn && s && this.propLeft[this.si] <= 1e-6) {
      this.propLeft[this.si] = 0; this.engOn = false; this.event('burnout');
      if (this.si < this.nStages - 1) { this.sepAt = this.t + 1.5; this.ignAt = this.t + 3.5; }
      else if (!this.bOn) this.endOfPropellant();
    }
    if (!this.engOn && this.si === this.nStages - 1 && this.sepAt == null && this.ignAt == null && !this.bOn && this.state === 'ascent' && this.propLeft[this.si] <= 0) this.endOfPropellant();
    // ---------- orbit insertion (engine cutoff) ----------
    if (this.engOn && this.released && d.h > ORBIT_MIN_PERI) {
      const o = this.orbit();
      if (o.peri >= Math.min(TARGET_ALT - 15000, d.h - 3000) || (o.peri >= ORBIT_MIN_PERI + 20000 && d.vr < 0)) {
        this.engOn = false; this.cutT = this.t; this.event('cutoff'); this.state = 'orbit';
        this.finish('orbit');
      }
    }
    if (d.h < -1 && this.released) { this.finish('crash'); this.state = 'crashed'; }
    if (this.t > 3600 && !this.result) this.endOfPropellant();
    // ---------- history ----------
    if (this.opts.hist && this.t - this.lastHist >= 0.5) {
      this.lastHist = this.t;
      const o = this.orbit();
      this.hist.push({ t: this.t, x: this.x, y: this.y, h: d.h, dr: d.downrange, v: d.vin, q: d.q, si: this.si, apo: o.apo, peri: o.peri, b: this.bOn });
    }
  }
  stageT() { const e = this.events.filter(e => e.id === 'ignition'); return e.length ? this.t - e[e.length - 1].t : 0; }

  separateStage() {
    const v = this.veh, s = v.stages[this.si];
    this.sepAt = null;
    const jm = s.dry + this.propLeft[this.si];
    this.m -= jm;
    this.drop('stage', jm, -2, this.si);
    this.event('separation');
    this.si++;
  }
  drop(kind, mass, dv, index = null) {
    if (!this.opts.debris) return;
    const v = this.veh, d = this.d, th = this.pitch;
    const tx = Math.sin(th) * d.ex + Math.cos(th) * d.ux, ty = Math.sin(th) * d.ey + Math.cos(th) * d.uy;
    this.debris.push({ kind, index, mass: Math.max(mass, 50), t0: this.t, x: this.x, y: this.y, vx: this.vx + tx * dv, vy: this.vy + ty * dv,
      pitch: th, spin: (kind === 'tower' ? -0.5 : 0.05) * (0.7 + 0.3 * Math.sin(this.t * 7.1)), h: d.h,
      area: kind === 'stage' ? Math.PI * (v.stages[index].d / 2) ** 2 * 1.5 : kind === 'boosters' ? 12 : kind === 'fairing' ? 30 : 3 });
  }
  stepDebris(dt) {
    for (const b of this.debris) {
      if (b.landed) continue;
      const r = Math.hypot(b.x, b.y), h = r - RE;
      const atm = atmosphere(h);
      const vax = b.vx - this.W * b.y, vay = b.vy + this.W * b.x;
      const vv = Math.hypot(vax, vay);
      const D = h < 150000 ? 0.5 * atm.rho * vv * vv * 1.0 * b.area : 0;
      const g = MU / (r * r);
      b.vx += (-g * b.x / r - (vv > 0 ? D * vax / vv / b.mass : 0)) * dt;
      b.vy += (-g * b.y / r - (vv > 0 ? D * vay / vv / b.mass : 0)) * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.pitch += b.spin * dt; b.h = h;
      if (h < 0) b.landed = true;
    }
  }

  endOfPropellant() {
    if (this.result) return;
    const o = this.orbit();
    this.state = 'coast';
    if (o.peri >= ORBIT_MIN_PERI) this.finish('orbit');
    else if (o.apo >= KARMAN) this.finish('suborbital');
    else this.finish('short');
  }
  finish(type) {
    if (this.result) return;
    const o = this.orbit();
    this.result = { type, t: this.t, apo: Math.max(o.apo === Infinity ? 1e9 : o.apo, this.max.h), peri: o.peri, e: o.e,
      dvLeft: type === 'orbit' ? this.dvLeft() : 0, vMax: this.max.v, hMax: this.max.h, maxQ: this.max.q, maxG: this.max.g,
      dvUsed: this.dvThrust, losses: { ...this.loss } };
    if (type === 'suborbital' || type === 'short') this.result.apo = Math.max(o.apo, this.max.h);
    this.done = true;
    this.event('result', { result: type });
  }
  /* after the result: keep moving (orbit or ballistic fall) for the visuals */
  coast(dt) {
    this._F = 0; this._mdot = 0;
    if (this.state === 'crashed' || this.result && this.result.type === 'pad') { this.t += dt; return; }
    const h0 = this.alt;
    if (h0 < 0) { this.state = 'crashed'; this.t += dt; return; }
    const P = { F: 0, Fvac: 0, mdot: 0, p: 1 };
    const s0 = [this.x, this.y, this.vx, this.vy, this.m];
    const pitch = this.pitch;
    const k1 = this.deriv(s0, pitch, P), s1 = s0.map((q, i) => q + k1[i] * dt / 2);
    const k2 = this.deriv(s1, pitch, P), s2 = s0.map((q, i) => q + k2[i] * dt / 2);
    const k3 = this.deriv(s2, pitch, P), s3 = s0.map((q, i) => q + k3[i] * dt);
    const k4 = this.deriv(s3, pitch, P);
    [this.x, this.y, this.vx, this.vy] = s0.map((q, i) => q + (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) * dt / 6);
    this.t += dt;
    const d = this.derived();
    if (d.h > this.max.h) this.max.h = d.h;
    // coast attitude: nose along the velocity
    const tgt = Math.atan2(d.vh, d.vr);
    this.pitch += clamp(tgt - this.pitch, -0.02, 0.02);
    if (d.h < 0) { this.state = 'crashed'; this.event('impact'); }
    if (this.opts.hist && this.t - this.lastHist >= 1) {
      this.lastHist = this.t; const o = this.orbit();
      this.hist.push({ t: this.t, x: this.x, y: this.y, h: d.h, dr: d.downrange, v: d.vin, q: d.q, si: this.si, apo: o.apo, peri: o.peri, b: false });
    }
  }
  /* effective Isp per phase: Δv the engines actually delivered ÷ (g0 · ln(m0/mf)) */
  ispEff() {
    const out = {};
    for (const [k, q] of Object.entries(this.ph)) { const L = Math.log(q.m0 / q.mf); if (L > 1e-4) out[k] = q.dv / (G0 * L); }
    return out;
  }
}

/* fly until the result is known (planning mode: no debris or history) */
export function fly(veh, params, opts = {}) {
  const sim = new FlightSim(veh, params, opts);
  let n = 0;
  while (!sim.result && n++ < 40000) sim.step(DT);
  return sim;
}

/* The flight computer: try pitch programs, keep the best. Score: in orbit → most
 * Δv left; otherwise the highest periapsis (closest to orbit). */
export const KICKS = [0.5, 1, 1.6, 2.4, 3.4, 4.8, 6.6, 9, 12.5, 16];
function scoreOf(r) { return r.type === 'orbit' ? 1e7 + r.dvLeft : r.type === 'pad' ? -1e9 : Math.max(-RE, r.peri) + r.apo * 1e-3; }
export function plan(veh) {
  const S = veh.stages;
  if (!S.length || S.some(s => !s.eng)) return null;
  let best = null;
  const tries = [];
  const run = (kick, cl0, loft = 1) => {
    if (kick == null || tries.some(t => t.kick === kick && t.cl0 === cl0 && t.loft === loft)) return;
    const sim = fly(veh, { kick, cl0, loft });
    const r = sim.result, score = scoreOf(r);
    tries.push({ kick, cl0, loft, type: r.type, score });
    if (!best || score > best.score) best = { params: { kick, cl0, loft }, score, sim };
  };
  // coarse pass over pitch-over angles, with and without first-stage closed-loop steering
  run(2.4, false);
  if (best.sim.result.type !== 'pad') {
    for (const k of [1, 4.8, 9]) run(k, false);
    for (const k of [1, 2.4, 4.8, 9]) run(k, true);
    // refine around the best
    const i = KICKS.indexOf(best.params.kick), c = best.params.cl0;
    for (const k of [KICKS[i - 1], KICKS[i + 1]]) run(k, c);
    const i2 = KICKS.indexOf(best.params.kick);
    if (i2 === KICKS.length - 2) run(KICKS[i2 + 1], c);
    run(best.params.kick, best.params.cl0, 0.6);
  }
  const sim = best.sim;
  return { params: best.params, result: sim.result, ispEff: sim.ispEff(), losses: sim.result.losses, tries, events: sim.events };
}

/* ================================================================== sharing: design ⇄ URL hash
 *   p=apollo  or  p=custom:12000
 *   b=srb*2
 *   s=K10.1x32.8,f1*5~H10.1x19.3,j2*5~H6.6x10.8,j2*1   (stages bottom → top; tanks joined by _)  */
const FAM = { kerolox: 'K', hydrolox: 'H', methalox: 'M' };
const FAM_R = { K: 'kerolox', H: 'hydrolox', M: 'methalox' };
const num = (x) => String(Math.round(x * 100) / 100);
export function encodeDesign(d) {
  const parts = [];
  const p = d.payload || { id: 'smallsat' };
  parts.push('p=' + p.id + (p.id === 'custom' ? ':' + Math.round(p.mass || 0) : ''));
  if (d.boosters && d.boosters.n > 0) parts.push('b=' + d.boosters.id + '*' + d.boosters.n);
  parts.push('s=' + d.stages.map(s => (s.tanks.map(t => FAM[t.fam] + num(t.d) + 'x' + num(t.len)).join('_') || '0') + ',' + (s.engine ? s.engine + '*' + s.n : '-')).join('~'));
  return parts.join('&');
}
export function decodeDesign(str, cat) {
  str = String(str || '').replace(/^#/, '');
  const kv = {};
  for (const part of str.split('&')) { const i = part.indexOf('='); if (i > 0) kv[part.slice(0, i)] = decodeURIComponent(part.slice(i + 1)); }
  if (!kv.s) return null;
  const d = { payload: { id: 'smallsat' }, boosters: null, stages: [] };
  if (kv.p) {
    const [id, m] = kv.p.split(':');
    if (!cat || cat.payloads[id]) d.payload = { id };
    if (id === 'custom') d.payload.mass = clamp(+m || 0, 0, 200000);
  }
  if (kv.b) { const [id, n] = kv.b.split('*'); if (!cat || cat.boosters[id]) d.boosters = { id, n: clamp(parseInt(n) || 0, 0, 8) }; if (d.boosters && !d.boosters.n) d.boosters = null; }
  for (const st of kv.s.split('~').slice(0, 8)) {
    const [tk, en] = st.split(',');
    const tanks = [];
    for (const t of (tk || '').split('_')) {
      const m = /^([KHM])([\d.]+)x([\d.]+)$/.exec(t);
      if (!m) continue;
      let dd = +m[2];
      if (cat) dd = cat.diameters.reduce((a, b) => Math.abs(b - dd) < Math.abs(a - dd) ? b : a);
      const lo = cat ? cat.tanks.minLength : 0.5, hi = cat ? cat.tanks.maxLength : 100;
      tanks.push({ fam: FAM_R[m[1]], d: dd, len: clamp(+m[3], lo, hi) });
    }
    let engine = null, n = 0;
    if (en && en !== '-') { const [id, k] = en.split('*'); if (!cat || cat.engines[id]) { engine = id; n = clamp(parseInt(k) || 1, 1, 60); } }
    d.stages.push({ tanks: tanks.slice(0, 6), engine, n });
  }
  return d;
}

/* ================================================================== presets (generic names, no logos) */
export const PRESETS = [
  { id: 'moon', name: 'Moon rocket', like: 'Saturn V-like', blurb: 'Three stages, 2,900 t, enough to send a crew to the Moon.',
    design: { payload: { id: 'apollo' }, boosters: null, stages: [
      { tanks: [{ fam: 'kerolox', d: 10.1, len: 32.8 }], engine: 'f1', n: 5 },
      { tanks: [{ fam: 'hydrolox', d: 10.1, len: 19.3 }], engine: 'j2', n: 5 },
      { tanks: [{ fam: 'hydrolox', d: 6.6, len: 10.8 }], engine: 'j2', n: 1 }] } },
  { id: 'medium', name: 'Medium two-stager', like: 'Falcon 9-like', blurb: 'Nine kerosene engines below, one vacuum engine above.',
    design: { payload: { id: 'capsule' }, boosters: null, stages: [
      { tanks: [{ fam: 'kerolox', d: 3.7, len: 46.8 }], engine: 'merlin', n: 9 },
      { tanks: [{ fam: 'kerolox', d: 3.7, len: 12.2 }], engine: 'mvac', n: 1 }] } },
  { id: 'small', name: 'Small launcher', like: 'Electron-like', blurb: '13 t and 18 m: small satellites, one at a time.',
    design: { payload: { id: 'smallsat' }, boosters: null, stages: [
      { tanks: [{ fam: 'kerolox', d: 1.2, len: 10.0 }], engine: 'rutherford', n: 9 },
      { tanks: [{ fam: 'kerolox', d: 1.2, len: 2.2 }], engine: 'rutherfordvac', n: 1 }] } },
  { id: 'heavy', name: 'Heavy lifter with boosters', like: 'SLS-like', blurb: 'A hydrogen core with four RS-25s, two solid boosters and a four-engine hydrogen upper stage.',
    design: { payload: { id: 'apollo' }, boosters: { id: 'srb', n: 2 }, stages: [
      { tanks: [{ fam: 'hydrolox', d: 8.4, len: 61.6 }], engine: 'rs25', n: 4 },
      { tanks: [{ fam: 'hydrolox', d: 8.4, len: 6 }], engine: 'rl10', n: 4 }] } },
  { id: 'tooheavy', name: 'Too heavy', like: 'a stretched two-stager', blurb: 'The first stage was stretched once too often.',
    design: { payload: { id: 'zarya' }, boosters: null, stages: [
      { tanks: [{ fam: 'kerolox', d: 3.7, len: 80 }], engine: 'merlin', n: 9 },
      { tanks: [{ fam: 'kerolox', d: 3.7, len: 12.2 }], engine: 'mvac', n: 1 }] } },
  { id: 'ssto', name: 'Single-stage-to-orbit attempt', like: 'one stage, no staging', blurb: 'One big stage with nine engines and a small satellite.',
    design: { payload: { id: 'smallsat' }, boosters: null, stages: [
      { tanks: [{ fam: 'kerolox', d: 3.7, len: 60 }], engine: 'merlin', n: 9 }] } }
];
