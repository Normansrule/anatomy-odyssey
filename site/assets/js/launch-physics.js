/* Cosmic Library · Saturn V (Apollo 11) ascent physics
 * ---------------------------------------------------------------------------
 * A 2-D point-mass trajectory in the flight plane, integrated with fixed-step
 * fourth-order Runge–Kutta in an Earth-centred inertial frame.
 *
 *   forces: thrust (pressure-corrected), aerodynamic drag, inverse-square gravity
 *   atmosphere: U.S. Standard Atmosphere 1976 (piecewise isothermal / constant
 *               lapse-rate layers = piecewise exponential pressure), exponential
 *               tail above 86 km; the atmosphere co-rotates with the Earth.
 *   guidance: vertical rise → pitch-over → zero-angle-of-attack gravity turn
 *             (the S-IC "tilt program") → tilt arrest → closed-loop steering
 *             (a simple stand-in for the Iterative Guidance Mode, IGM) that
 *             drives the vehicle to a circular parking orbit.
 *
 * Numbers and sources (all rounded, see comments next to each value):
 *   [FER]  Saturn V Launch Vehicle Flight Evaluation Report AS-506, Apollo 11
 *          Mission, MPR-SAT-FE-69-9, NASA Marshall Space Flight Center, 1969
 *          (Table 2-2 event times; ignition mass 2,941,221 kg).
 *   [WSV]  Wikipedia, "Saturn V" (stage masses, J-2 thrust and Isp).
 *   [WF1]  Wikipedia, "Rocketdyne F-1" (Isp 263 s SL / 304 s vac, exit dia 3.76 m).
 *   [WA11] Wikipedia, "Apollo 11" (LM 15,103 kg, CSM 28,801 kg, parking orbit).
 *   [TDA]  This Day in Aviation, AS-506 (S-IC thrust 33,593 kN at sea level).
 *   [USSA] U.S. Standard Atmosphere, 1976 (NOAA/NASA/USAF).
 * The engine mass flows are chosen so each stage burns its propellant over the
 * real Apollo 11 burn times; thrust then follows from F = ṁ·Isp·g₀ − pₐ·Aₑ.
 * This is an educational model: it lands within roughly ten percent of the real
 * flight at the key events, not on top of it.
 * ------------------------------------------------------------------------- */

export const G0 = 9.80665;                 // standard gravity, m/s²
export const MU = 3.986004418e14;          // Earth GM, m³/s²  (WGS-84)
export const RE = 6371000;                 // mean Earth radius, m
export const OMEGA_E = 7.2921159e-5;       // Earth rotation rate, rad/s
export const LAT = 28.6082;                // LC-39A latitude, deg N
export const AZIMUTH = 72.0;               // Apollo 11 flight azimuth, deg east of north [FER]
// Earth-rotation speed along the flight azimuth: ω·R·cos(lat)·sin(Az) ≈ 388 m/s.
export const V_ROT = OMEGA_E * RE * Math.cos(LAT * Math.PI / 180) * Math.sin(AZIMUTH * Math.PI / 180);
const W_EFF = V_ROT / RE;                  // equivalent in-plane rotation rate

/* ---------------- vehicle ---------------- */
// Masses in kg.
export const MASS = {
  ignition: 2941221,     // total vehicle at S-IC ignition command [FER]
  sicDry: 131000,        // S-IC dry  (≈130–137 t quoted) [WSV]
  siiDry: 36200,         // S-II dry, without interstages [WSV ≈ 36–43 t with interstage]
  siiProp: 446000,       // S-II propellant loaded (LOX + LH2) [WSV gross − dry]
  siiAftInterstage: 4600,// S-IC/S-II interstage ring, dropped 30 s after staging
  sivbInterstage: 3700,  // S-II/S-IVB interstage flare (stays on the S-II)
  sivbDry: 13300,        // S-IVB dry incl. auxiliary propulsion modules [WSV]
  sivbProp: 107000,      // S-IVB propellant loaded [WSV]
  iu: 2000,              // Instrument Unit [WSV]
  sla: 1800,             // Spacecraft/Lunar Module Adapter
  lm: 15103,             // Lunar Module "Eagle" [WA11]
  csm: 28801,            // Command/Service Module "Columbia" [WA11]
  les: 4170              // Launch Escape System
};
MASS.upper = MASS.siiDry + MASS.siiProp + MASS.siiAftInterstage + MASS.sivbInterstage + MASS.sivbDry +
  MASS.sivbProp + MASS.iu + MASS.sla + MASS.lm + MASS.csm + MASS.les;
MASS.sicProp = MASS.ignition - MASS.upper - MASS.sicDry;

// Engines. F = n·ṁ·Isp_vac·g0 − n·pₐ·Aₑ
export const ENGINES = {
  F1: {
    mdot: 2600,          // kg/s per engine (burns the S-IC load by OECO at T+161.6 s)
    ispVac: 304,         // s [WF1]
    ae: Math.PI * 1.88 * 1.88 // exit area, m² (3.76 m exit diameter) [WF1]
    // → sea-level thrust 6.63 MN per engine, 33.1 MN for five; [TDA] gives 33.6 MN.
  },
  J2: {
    mdot: 240.4,         // kg/s: 1,000 kN at 424 s [WSV]; depletes S-II load at its real cutoff
    ispVac: 424,         // s [WSV]
    ae: Math.PI * 0.98 * 0.98
  }
};

/* ---------------- Apollo 11 sequence (range time, s) [FER Table 2-2] ------ */
export const SEQ = {
  countStart: -30,
  arm1: -16.2,           // S-IC intertank swing arm retracts
  ignition: -8.9,        // ignition sequence start (centre engine first)
  release: 0,            // hold-down arms release
  firstMotion: 0.3,
  rollStart: 13.2,       // roll and pitch program start
  rollEnd: 31.1,
  ceco: 135.2,           // S-IC centre engine cutoff
  oeco: 161.63,          // S-IC outboard engine cutoff
  sicSep: 162.3,         // S-IC/S-II separation
  siiIgn: 163.0,         // S-II engine start command
  interstage: 192.3,     // S-II aft interstage jettison
  les: 197.9,            // Launch Escape Tower jettison
  igm: 204.1,            // Iterative Guidance Mode begins
  siiCeco: 460.62,       // S-II centre engine cutoff
  siiOeco: 548.22,       // S-II outboard engine cutoff
  siiSep: 549.1,         // S-II/S-IVB separation
  sivbIgn: 552.2,        // S-IVB ignition
  sivbCutoffReal: 699.33,// S-IVB first cutoff (real)
  insertionReal: 709.33  // parking-orbit insertion (real)
};
export let KICK_DEG = 2.05;  // pitch-over angle reached at T+31 s, tuned to match S-IC cutoff state
export function setKick(k) { KICK_DEG = k; }
export const TARGET_ALT = 186000;          // parking orbit ≈ 185.9 × 183.2 km [WA11]

/* ---------------- U.S. Standard Atmosphere 1976 --------------------------- */
const LAYERS = [ // base geopotential alt (m), base T (K), lapse (K/m), base p (Pa)
  [0, 288.15, -0.0065, 101325],
  [11000, 216.65, 0, 22632.06],
  [20000, 216.65, 0.001, 5474.889],
  [32000, 228.65, 0.0028, 868.0187],
  [47000, 270.65, 0, 110.9063],
  [51000, 270.65, -0.0028, 66.93887],
  [71000, 214.65, -0.002, 3.956420],
  [84852, 186.946, 0, 0.3734]
];
const R_AIR = 287.053, GAMMA = 1.4, G_ATM = 9.80665;
export function atmosphere(h) {
  if (h < 0) h = 0;
  const hg = RE * h / (RE + h); // geometric → geopotential
  let i = LAYERS.length - 1;
  while (i > 0 && hg < LAYERS[i][0]) i--;
  const [hb, Tb, L, pb] = LAYERS[i];
  let T, p;
  if (L === 0) { T = Tb; p = pb * Math.exp(-G_ATM * (hg - hb) / (R_AIR * Tb)); }
  else { T = Tb + L * (hg - hb); p = pb * Math.pow(T / Tb, -G_ATM / (R_AIR * L)); }
  if (hg > 84852) { // beyond the 1976 tables' last layer: isothermal exponential tail
    T = 186.946; p = 0.3734 * Math.exp(-(hg - 84852) / 5800);
  }
  const rho = p / (R_AIR * T);
  return { T, p, rho, a: Math.sqrt(GAMMA * R_AIR * T) };
}

/* Saturn V drag coefficient vs Mach (reference area = 10.06 m diameter).
 * Approximate curve shaped after published wind-tunnel axial-force data for
 * large launch vehicles: flat subsonic, transonic rise, supersonic decay. */
const CD_TABLE = [[0, 0.30], [0.6, 0.30], [0.85, 0.36], [1.0, 0.50], [1.2, 0.58], [1.5, 0.52],
  [2, 0.44], [3, 0.34], [4, 0.28], [6, 0.24], [10, 0.22], [30, 0.22]];
export function cd(M) {
  for (let i = 1; i < CD_TABLE.length; i++) {
    if (M <= CD_TABLE[i][0]) {
      const [m0, c0] = CD_TABLE[i - 1], [m1, c1] = CD_TABLE[i];
      return c0 + (c1 - c0) * (M - m0) / (m1 - m0);
    }
  }
  return 0.22;
}
const AREA = Math.PI * 5.03 * 5.03; // m², 10.06 m diameter

/* ---------------- thrust schedule ---------------- */
// F-1 start: centre engine at T−8.9 s, then opposing pairs 0.3 s apart [WSV];
// each engine ramps to mainstage over ≈ 4.6 s (smoothstep, 1.6 s low-flow lead).
const F1_START = [-8.9, -8.6, -8.6, -8.3, -8.3];
function smooth01(x) { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); }
function f1Level(t, i) {
  const s = t - F1_START[i];
  if (s <= 0) return 0;
  return 0.06 * smooth01(s / 1.6) + 0.94 * smooth01((s - 1.6) / 3.0);
}
function rampJ2(t, t0) { return smooth01((t - t0) / 2.6); }
function tailOff(t, t0, dur) { return 1 - smooth01((t - t0) / dur); } // shutdown transient

/* engine[i] throttle level (0..1) for display; returns {stage, levels[]} */
export function engineLevels(sim, t) {
  const st = sim.stage;
  if (st === 0) {
    const L = [];
    for (let i = 0; i < 5; i++) {
      let l = f1Level(t, i);
      if (i === 0 && t > SEQ.ceco) l *= tailOff(t, SEQ.ceco, 0.5);
      if (t > SEQ.oeco) l *= tailOff(t, SEQ.oeco, 0.6);
      L.push(l);
    }
    return L;
  }
  if (st === 1) {
    const L = [];
    for (let i = 0; i < 5; i++) {
      let l = rampJ2(t, SEQ.siiIgn + 0.6);
      if (i === 0 && t > SEQ.siiCeco) l *= tailOff(t, SEQ.siiCeco, 0.5);
      if (t > SEQ.siiOeco) l *= tailOff(t, SEQ.siiOeco, 0.5);
      L.push(l);
    }
    return L;
  }
  if (st === 2) {
    let l = rampJ2(t, SEQ.sivbIgn);
    if (sim.cutoffT != null && t > sim.cutoffT) l *= tailOff(t, sim.cutoffT, 0.4);
    return [l];
  }
  return [];
}

/* ---------------- the simulator ---------------- */
export class AscentSim {
  constructor() { this.reset(); }

  reset() {
    this.t = SEQ.countStart;
    // inertial frame: origin at Earth centre, +y through the pad at t = 0, +x downrange
    this.x = 0; this.y = RE; this.vx = V_ROT; this.vy = 0;
    this.m = MASS.ignition;
    this.stage = 0;          // 0 S-IC, 1 S-II, 2 S-IVB, 3 coast (orbit)
    this.released = false;
    this.pitch = 0;          // thrust angle from local vertical (rad), + downrange
    this.cutoffT = null; this.insertT = null;
    this.flags = {};         // one-shot event flags
    this.events = [];        // {t, id}
    this.debris = [];        // separated hardware
    this.hist = [];          // trajectory samples for plots and smoke trail
    this.lastHist = -1e9;
    this.max = { q: 0, qT: 0, qAlt: 0, g: 0 };
    // Δv bookkeeping
    this.dvIdeal = 0; this.dvThrust = 0; this.dvGrav = 0; this.dvDrag = 0; this.dvPress = 0; this.dvSteer = 0;
    this.stageStart = { m: MASS.ignition, dv: 0 }; this.dvTsiol = 0; this.dvTsiolDone = 0;
    this.propUsed = [0, 0, 0];
    this.propLeft = [MASS.sicProp, MASS.siiProp, MASS.sivbProp];
    this.derived();
  }

  /* --- geometry helpers --- */
  get r() { return Math.hypot(this.x, this.y); }
  get alt() { return this.r - RE; }

  derived() {
    const r = this.r, h = r - RE;
    const ux = this.x / r, uy = this.y / r;           // local up
    const ex = uy, ey = -ux;                           // local horizontal (downrange)
    // air-relative velocity (atmosphere co-rotates)
    const vax = this.vx - W_EFF * this.y, vay = this.vy + W_EFF * this.x;
    const vrel = Math.hypot(vax, vay);
    const atm = atmosphere(h);
    const M = vrel / atm.a;
    const q = 0.5 * atm.rho * vrel * vrel;
    const vr = this.vx * ux + this.vy * uy, vh = this.vx * ex + this.vy * ey;
    const var_ = vax * ux + vay * uy, vah = vax * ex + vay * ey;
    const theta = Math.atan2(this.x, this.y);          // inertial polar angle
    const tt = Math.max(0, this.t);
    const phiE = theta - W_EFF * tt;                   // Earth-fixed polar angle
    this.d = {
      h, r, ux, uy, ex, ey, vrel, vax, vay, M, q, atm, vr, vh, var: var_, vah,
      vin: Math.hypot(this.vx, this.vy),
      gammaE: Math.atan2(var_, vah),                   // Earth-relative flight-path angle
      gammaI: Math.atan2(vr, vh),
      downrange: RE * phiE, phiE
    };
    return this.d;
  }

  /* thrust in N and mass-flow in kg/s at time t, pressure p */
  propulsion(t, p) {
    const L = engineLevels(this, t);
    let F = 0, mdot = 0, E;
    if (this.stage === 0) E = ENGINES.F1; else if (this.stage <= 2) E = ENGINES.J2; else return { F: 0, mdot: 0, Fvac: 0 };
    let Fvac = 0;
    for (const l of L) {
      const md = E.mdot * l;
      mdot += md;
      Fvac += md * E.ispVac * G0;
      F += Math.max(0, md * E.ispVac * G0 - p * E.ae * (l > 0.02 ? 1 : 0));
    }
    const left = this.propLeft[this.stage] ?? 0;
    if (left <= 0) return { F: 0, mdot: 0, Fvac: 0 };
    return { F, mdot, Fvac };
  }

  /* guidance: thrust angle from local vertical (rad) */
  guidance(t, d) {
    if (t < SEQ.rollStart) return 0;
    if (this.stage === 0) {
      // pitch program: pitch over at a steady rate, then follow the air-relative
      // velocity vector (zero angle of attack) — a gravity turn.
      const kickEnd = SEQ.rollStart + 18.0, kick = KICK_DEG * Math.PI / 180;
      const air = Math.atan2(d.vah, d.var);
      if (t < kickEnd) return kick * (t - SEQ.rollStart) / (kickEnd - SEQ.rollStart);
      // tilt arrest ≈ T+160 s: attitude freezes
      if (t > 158) return this.frozen ?? (this.frozen = air);
      return air;
    }
    if (this.stage === 3) return Math.atan2(d.vah, d.var);   // in orbit: hold prograde (along the velocity)
    if (t < SEQ.igm || !(this._aT > 0.5)) return this.pitch; // attitude hold: before closed-loop guidance, or while coasting
    // Closed-loop steering (stand-in for Saturn's Iterative Guidance Mode):
    // command a vertical speed that decays as altitude approaches the target,
    // then choose the thrust angle that produces the needed radial acceleration.
    const g = MU / (d.r * d.r);
    const cent = d.vh * d.vh / d.r;
    const err = TARGET_ALT - d.h;
    const tau = this.stage === 2 ? 900 : 140;
    let vrCmd = err / tau;
    vrCmd = Math.max(-60, Math.min(this.stage === 2 ? 15 : 900, vrCmd));
    const aNeed = g - cent + (vrCmd - d.vr) / 22;
    const aT = this._aT;
    const s = Math.max(-0.55, Math.min(0.75, aNeed / aT));
    return Math.PI / 2 - Math.asin(s);
  }

  deriv(s, t) {
    // s = [x, y, vx, vy, m]
    const [x, y, vx, vy, m] = s;
    const r = Math.hypot(x, y), h = r - RE;
    const ux = x / r, uy = y / r, ex = uy, ey = -ux;
    const atm = atmosphere(h);
    const vax = vx - W_EFF * y, vay = vy + W_EFF * x;
    const v = Math.hypot(vax, vay);
    const D = 0.5 * atm.rho * v * v * cd(v / atm.a) * AREA;
    const P = this.released ? this.propulsion(t, atm.p) : { F: 0, mdot: 0 };
    const th = this.pitch;
    const tx = Math.sin(th) * ex + Math.cos(th) * ux, ty = Math.sin(th) * ey + Math.cos(th) * uy;
    const gA = MU / (r * r);
    let ax = (P.F * tx - (v > 0 ? D * vax / v : 0)) / m - gA * ux;
    let ay = (P.F * ty - (v > 0 ? D * vay / v : 0)) / m - gA * uy;
    return [vx, vy, ax, ay, -P.mdot];
  }

  step(dt) {
    const t = this.t;
    // ---- discrete events before the step ----
    this.sequence(t);
    if (!this.released) {
      // on the pad: burn propellant during the ignition sequence but stay put
      const P = this.propulsion(t, 101325);
      this.m -= P.mdot * dt; this.propLeft[0] -= P.mdot * dt; this.propUsed[0] += P.mdot * dt;
      this._F = P.F; this._mdot = P.mdot;
      this.t += dt; this.derived();
      return;
    }
    let d = this.d;
    const atm0 = d.atm;
    const P0 = this.propulsion(t, atm0.p);
    this._aT = P0.F / this.m;
    this.pitch = this.guidance(t, d);
    // ---- RK4 ----
    const s0 = [this.x, this.y, this.vx, this.vy, this.m];
    const k1 = this.deriv(s0, t);
    const s1 = s0.map((v, i) => v + k1[i] * dt / 2);
    const k2 = this.deriv(s1, t + dt / 2);
    const s2 = s0.map((v, i) => v + k2[i] * dt / 2);
    const k3 = this.deriv(s2, t + dt / 2);
    const s3 = s0.map((v, i) => v + k3[i] * dt);
    const k4 = this.deriv(s3, t + dt);
    const ns = s0.map((v, i) => v + (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) * dt / 6);
    const dm = s0[4] - ns[4];
    [this.x, this.y, this.vx, this.vy, this.m] = ns;
    if (this.stage <= 2) { this.propLeft[this.stage] -= dm; this.propUsed[this.stage] += dm; }
    // keep on the ground until thrust exceeds weight (it does, by 1.17×)
    // ---- Δv bookkeeping (mid-step values) ----
    const aThr = P0.F / (this.m + dm / 2);
    const aVac = P0.Fvac / (this.m + dm / 2);
    const g = MU / (d.r * d.r);
    const Dm = 0.5 * atm0.rho * d.vrel * d.vrel * cd(d.M) * AREA / this.m;
    this.dvIdeal += aVac * dt;                       // what a vacuum engine would give
    this.dvThrust += aThr * dt;                      // what the engines actually delivered, ∫F/m dt
    this.dvPress += (aVac - aThr) * dt;              // back-pressure loss at the nozzle exit
    this.dvGrav += g * Math.sin(d.gammaI) * dt;      // gravity loss
    this.dvDrag += Dm * dt;                          // drag loss
    const vdir = Math.atan2(d.vh, d.vr);             // inertial velocity angle from vertical
    this.dvSteer += aThr * (1 - Math.cos(this.pitch - vdir)) * dt; // steering (thrust not along v)
    this._F = P0.F; this._mdot = P0.mdot;
    this.t += dt;
    d = this.derived();
    // Tsiolkovsky prediction for the current stage (vacuum Isp)
    const E = this.stage === 0 ? ENGINES.F1 : ENGINES.J2;
    if (this.stage <= 2) this.dvTsiol = this.dvTsiolDone + E.ispVac * G0 * Math.log(this.stageStart.m / this.m);
    // ---- peaks ----
    if (d.q > this.max.q) { this.max.q = d.q; this.max.qT = this.t; this.max.qAlt = d.h; }
    const acc = this.accelG();
    if (acc > this.max.g) this.max.g = acc;
    // ---- debris ----
    for (const b of this.debris) this.stepDebris(b, dt);
    // ---- history ----
    if (this.t - this.lastHist >= 0.25) {
      this.lastHist = this.t;
      this.hist.push({ t: this.t, h: d.h, dr: d.downrange, v: d.vrel, q: d.q, dv: this.dvThrust, ts: this.dvTsiol,
        vin: d.vin, g: acc });
    }
  }

  /* osculating two-body orbit: apogee / perigee altitudes (m) */
  orbit() {
    const r = Math.hypot(this.x, this.y), v2 = this.vx * this.vx + this.vy * this.vy;
    const eps = v2 / 2 - MU / r;
    const hA = this.x * this.vy - this.y * this.vx;
    const e = Math.sqrt(Math.max(0, 1 + 2 * eps * hA * hA / (MU * MU)));
    const a = -MU / (2 * eps);
    return { apo: eps < 0 ? a * (1 + e) - RE : Infinity, peri: a * (1 - e) - RE, e, a };
  }

  accelG() { // sensed acceleration (thrust + drag) in g
    const d = this.d;
    if (!this.released) return 1;
    const D = 0.5 * d.atm.rho * d.vrel * d.vrel * cd(d.M) * AREA;
    return Math.abs((this._F || 0) - D) / this.m / G0;
  }

  fire(id, t) { if (!this.flags[id]) { this.flags[id] = t; this.events.push({ t, id }); return true; } return false; }

  startStage(n) {
    this.dvTsiolDone = this.dvTsiol;
    this.stage = n;
    this.stageStart = { m: this.m };
  }

  sequence(t) {
    const d = this.d;
    if (t >= SEQ.countStart) this.fire('count', SEQ.countStart);
    if (t >= SEQ.arm1) this.fire('arm1', SEQ.arm1);
    if (t >= SEQ.ignition) this.fire('ignition', SEQ.ignition);
    if (t >= -2.0) this.fire('allrunning', -2.0);
    if (t >= SEQ.release && !this.released) { this.released = true; this.fire('liftoff', 0); }
    if (this.released && d.h > 130) this.fire('tower', t);      // base passes the top of the tower + crane (page geometry)
    if (t >= SEQ.rollStart) this.fire('roll', SEQ.rollStart);
    if (t >= SEQ.rollEnd) this.fire('rollEnd', SEQ.rollEnd);
    if (this.released && d.M >= 1) this.fire('mach1', t);
    if (this.released && t > 40 && d.q < this.max.q * 0.995 && this.max.q > 20000) this.fire('maxq', this.max.qT);
    if (t >= SEQ.ceco) this.fire('ceco', SEQ.ceco);
    if (t >= SEQ.oeco) this.fire('oeco', SEQ.oeco);
    if (t >= SEQ.sicSep && this.stage === 0) {
      this.fire('sicSep', SEQ.sicSep);
      this.separate('S-IC', MASS.sicDry + this.propLeft[0], -12, 0.03); // 8 solid retro-rockets
      this.m -= MASS.sicDry + this.propLeft[0];
      this.startStage(1);
    }
    if (t >= SEQ.siiIgn) this.fire('siiIgn', SEQ.siiIgn);
    if (t >= SEQ.interstage && !this.flags.interstage) {
      this.fire('interstage', SEQ.interstage);
      this.separate('interstage', MASS.siiAftInterstage, -1.5, 0.05);
      this.m -= MASS.siiAftInterstage;
      this.stageStart.m -= MASS.siiAftInterstage;
    }
    if (t >= SEQ.les && !this.flags.les) {
      this.fire('les', SEQ.les);
      this.separate('LES', MASS.les, 30, 0.4); // tower jettison motor pulls it ahead and aside
      this.m -= MASS.les;
      this.stageStart.m -= MASS.les;
    }
    if (t >= SEQ.igm) this.fire('igm', SEQ.igm);
    if (t >= SEQ.siiCeco) this.fire('siiCeco', SEQ.siiCeco);
    if (t >= SEQ.siiOeco) this.fire('siiOeco', SEQ.siiOeco);
    if (t >= SEQ.siiSep && this.stage === 1) {
      this.fire('siiSep', SEQ.siiSep);
      const jm = MASS.siiDry + this.propLeft[1] + MASS.sivbInterstage;
      this.separate('S-II', jm, -8, 0.02);
      this.m -= jm;
      this.startStage(2);
    }
    if (t >= SEQ.sivbIgn) this.fire('sivbIgn', SEQ.sivbIgn);
    // S-IVB cutoff: guidance shuts the engine down when the inertial speed reaches
    // circular-orbit speed at the current radius, √(μ/r).
    if (this.stage === 2 && t > SEQ.sivbIgn + 10 && this.cutoffT == null) {
      if (d.vin >= Math.sqrt(MU / d.r) - 1) { this.cutoffT = t; this.fire('sivbCut', t); }
    }
    if (this.cutoffT != null && t >= this.cutoffT + 10 && this.stage === 2) {
      this.insertT = t; this.fire('insertion', t); this.stage = 3;
    }
  }

  separate(kind, mass, dv, spin) {
    const d = this.d;
    // dv along the vehicle axis (negative = backwards, e.g. retro-rockets)
    const th = this.pitch;
    const tx = Math.sin(th) * d.ex + Math.cos(th) * d.ux, ty = Math.sin(th) * d.ey + Math.cos(th) * d.uy;
    // lateral kick for the LES tower (its jettison motor nozzles are canted)
    const lat = kind === 'LES' ? 6 : 0;
    const nx = -ty, ny = tx;
    this.debris.push({
      kind, mass, t0: this.t, phi0: d.phiE, pitch0: th,
      x: this.x, y: this.y,
      vx: this.vx + tx * dv + nx * lat, vy: this.vy + ty * dv + ny * lat,
      pitch: th, spin: (kind === 'LES' ? -1 : 1) * spin * (0.6 + 0.4 * Math.random()),
      area: kind === 'S-IC' ? AREA : kind === 'S-II' ? AREA : kind === 'interstage' ? 20 : 3,
      cdA: 0, thrustLeft: kind === 'LES' ? 1.0 : 0
    });
  }

  stepDebris(b, dt) {
    const r = Math.hypot(b.x, b.y), h = r - RE;
    const atm = atmosphere(h);
    const vax = b.vx - W_EFF * b.y, vay = b.vy + W_EFF * b.x;
    const v = Math.hypot(vax, vay);
    const D = 0.5 * atm.rho * v * v * 1.0 * b.area;
    const g = MU / (r * r);
    let ax = -g * b.x / r - (v > 0 ? D * vax / v / b.mass : 0);
    let ay = -g * b.y / r - (v > 0 ? D * vay / v / b.mass : 0);
    if (b.thrustLeft > 0) { // LES tower jettison motor ≈ 140 kN for ~1 s
      const ux = b.x / r, uy = b.y / r, ex = uy, ey = -ux;
      const th = b.pitch - 0.35;
      const F = 140000 / b.mass;
      ax += F * (Math.sin(th) * ex + Math.cos(th) * ux); ay += F * (Math.sin(th) * ey + Math.cos(th) * uy);
      b.thrustLeft -= dt;
    }
    b.vx += ax * dt; b.vy += ay * dt; b.x += b.vx * dt; b.y += b.vy * dt;
    b.pitch += b.spin * dt;
    b.h = h;
  }

  /* Earth-fixed position helpers for rendering: returns {phi, r} */
  earthFixed(x, y) {
    const theta = Math.atan2(x, y);
    return { phi: theta - W_EFF * Math.max(0, this.t), r: Math.hypot(x, y) };
  }
}

/* run to a time (used by the page to jump, and by the tuning script) */
export function runTo(sim, t, dt = 0.02) {
  while (sim.t < t - 1e-9) sim.step(Math.min(dt, t - sim.t));
  return sim;
}
