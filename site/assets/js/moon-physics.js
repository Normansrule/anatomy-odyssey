/* Cosmic Library · Apollo 11 Lunar Module (LM) "Eagle" powered descent physics
 * ---------------------------------------------------------------------------
 * Plain ES module with no DOM or Three.js dependency, so it runs in the browser
 * and in Node (see scripts/test_moon_physics.mjs).
 *
 * Model
 *   • 2-D flight in the orbital plane: the LM's centre of mass moves in a
 *     Moon-centred inertial frame under inverse-square gravity (so the
 *     "centrifugal" relief of orbital speed at Powered Descent Initiation, PDI,
 *     comes out by itself) and Descent Propulsion System (DPS) thrust.
 *     Fourth-order Runge–Kutta, 50 Hz. Downrange x is arc length on the mean
 *     sphere, measured from the guidance target (x < 0 before the target).
 *   • One rotational degree of freedom: pitch θ = tilt of the thrust axis from
 *     the local vertical (θ > 0 tilts the thrust backwards, i.e. braking).
 *     Reaction Control System (RCS) jets give a bang-bang angular acceleration
 *     through a rate-command / attitude-hold loop like the LM Digital Autopilot.
 *   • DPS: throttleable 10–60 % of rated thrust, plus the Fixed Throttle Point
 *     (FTP, 92.5 %). Commands in the unusable band snap to 60 % or to FTP.
 *     Specific impulse falls from 311 s at FTP to 285 s at 10 %.
 *   • Guidance: Apollo-style quadratic-acceleration targeting (Klumpp, 1971):
 *       a_cmd = a_T − 6 (v + v_T)/T + 12 (r_T − r)/T²
 *     with time-to-go T solved from the downrange jerk condition, re-solved every
 *     2 s like the Lunar Guidance Computer (LGC). P63 (braking) aims at High
 *     Gate, P64 (approach) at the Landing Point Designator (LPD) target, P65 is an
 *     automatic vertical descent, P66 is the crew's Rate Of Descent (ROD) mode.
 *
 * Sources (all numbers rounded; see the comment on each constant)
 *   [PK]   Apollo 11 Press Kit, NASA release 69-83K (1969): LM-5 launch weight
 *          33,205 lb; DPS propellant loaded 18,100 lb; DPS 9,870 lbf max,
 *          throttleable 1,050–6,300 lbf.
 *   [DPS]  Apollo Experience Report — Descent Propulsion System, NASA TN D-7143
 *          (1973): rated 10,500 lbf; FTP = 92.5 %; 65–92.5 % a non-operating
 *          region (mixture-ratio control and throat erosion); Apollo 11 remaining
 *          hover time 63.5 s; low-level light premature by ≈36 s (slosh).
 *   [WDPS] Wikipedia, "Descent propulsion system": Isp 311 s at full thrust,
 *          285 s at 10 %.
 *   [TND6846] F. V. Bennett, Apollo Experience Report — Mission Planning for LM
 *          Descent and Ascent, NASA TN D-6846 (1972): PDI 48,814 ft, 5,560 ft/s;
 *          High Gate ≈7,000 ft, ≈4.5 nmi, 8 min 26 s after ignition; Low Gate
 *          500 ft, 2,000 ft range, 60 ft/s forward, 16 ft/s down, ≈16° from
 *          vertical; ≈16° approach (glide) angle; Δv 6,827 ft/s nominal.
 *   [TND6850] Apollo Experience Report — LM Landing Gear Subsystem, NASA TN
 *          D-6850 (1972): touchdown envelope, 6° attitude limit, 12° slope,
 *          footpad ≈3 ft, tread radius 167.57 in, probes 5.6 ft on 3 legs.
 *   [MR]   Apollo 11 Mission Report, MSC-00171 (1969): PDI 102:33:05.2; throttle
 *          down 386 s after ignition; High Gate 7,129 ft at 125 ft/s descent;
 *          P66 at ≈600 ft; touchdown 102:45:40.
 *   [ALSJ] Apollo Lunar Surface Journal, "The First Lunar Landing" (E. M. Jones):
 *          ≈770 lb left at touchdown, ≈100 lb unusable, ≈20 s abort reserve.
 *   [KL]   A. R. Klumpp, "Apollo Lunar Descent Guidance", MIT Charles Stark
 *          Draper Laboratory R-695 (1971): the quadratic guidance law.
 * ------------------------------------------------------------------------- */

export const FT = 0.3048;                 // m per foot (exact)
export const LB = 0.45359237;             // kg per pound-mass (exact)
export const LBF = 4.4482216152605;       // N per pound-force (exact)
export const NMI = 1852;                  // m per nautical mile (exact)
export const G0 = 9.80665;                // standard gravity (exact), m/s²
export const DEG = Math.PI / 180;

/* ---------------- Moon ---------------- */
export const MU = 4.9048695e12;           // lunar GM, m³/s² (JPL DE421)
export const R_MOON = 1737400;            // mean radius, m (IAU)
export const G_SURF = MU / (R_MOON * R_MOON); // 1.625 m/s² at the surface

/* ---------------- Descent engine ---------------- */
export const DPS = {
  rated: 10500 * LBF,     // 46.7 kN maximum-rated thrust [DPS]
  ftp: 0.925,             // Fixed Throttle Point, fraction of rated (43.2 kN) [DPS]
  min: 0.10,              // minimum throttle, 1,050 lbf [PK]
  maxThrottled: 0.60,     // top of the throttleable range, 6,300 lbf [PK]
  ispFTP: 311,            // s at full thrust [WDPS]
  ispMin: 285,            // s at 10 % [WDPS]
  tau: 0.25,              // throttle response time constant, s (estimate)
  startLow: 26            // PDI begins at 10 % for ≈26 s so the gimbal can trim
                          // through the centre of mass, then FTP (Apollo 11 flight plan)
};
/** Specific impulse at a throttle fraction (linear between the two quoted points). */
export function isp(frac) {
  const k = Math.min(1, Math.max(0, (frac - DPS.min) / (DPS.ftp - DPS.min)));
  return DPS.ispMin + (DPS.ispFTP - DPS.ispMin) * k;
}

/* ---------------- Lunar Module "Eagle" (LM-5) ---------------- */
const LAUNCH_MASS = 33205 * LB;           // 15,061 kg [PK]
const DPS_LOADED = 18100 * LB;            //  8,210 kg [PK]
// Descent Orbit Insertion (DOI) took the LM from the 60 × 60 nmi orbit to
// 60 × 8.5 nmi: Δv = v_circ(111 km) − v_apolune = 1,628.9 − 1,607.2 ≈ 21.7 m/s
// (vis-viva, computed here). At ≈295 s that burns ≈113 kg of DPS propellant.
const DOI_PROP = LAUNCH_MASS * (1 - Math.exp(-21.7 / (295 * G0)));
const RCS_BEFORE_PDI = 40;                // kg of RCS propellant used before PDI (estimate)
export const LM = {
  launchMass: LAUNCH_MASS,
  dpsLoaded: DPS_LOADED,
  massPDI: LAUNCH_MASS - DOI_PROP - RCS_BEFORE_PDI,   // ≈14,908 kg (derived estimate)
  propPDI: DPS_LOADED - DOI_PROP,                      // ≈8,097 kg
  unusable: 100 * LB,                                  // ≈45 kg trapped [ALSJ]
  lowLevelFrac: 0.056,    // point sensor ≈5.6 % of the load (≈2 min of hover; widely quoted)
  bingoReserve: 20,       // s of hover kept for an abort-stage decision [ALSJ]
  // geometry (m), LM axes: up = thrust axis (+X in NASA terms), fwd = +Z (windows, ladder)
  cgHeight: 3.0,          // centre of mass above the footpad plane (estimate)
  tread: 167.57 * 0.0254, // 4.26 m, footpad centre from the thrust axis [TND6850]
  probe: 5.6 * FT,        // 1.71 m contact probes under three footpads [TND6850]
  padRadius: 0.47,        // ≈37 in footpads [TND6850 "approximately 3 feet"]
  rcsTorque: 4 * 100 * LBF * 1.56, // 4 jets × 445 N × ≈1.56 m pitch arm (estimate)
  gyration: 1.9           // pitch radius of gyration, m (estimate) → I = m k²
};
LM.dry = LM.massPDI - LM.propPDI;          // ≈6,811 kg everything but DPS propellant

/* ---------------- Landing gear envelope [TND6850] ---------------- */
export const GEAR = {
  vvMax: 10 * FT,                          // 3.05 m/s vertical
  vhMax: (vv) => (vv <= 7 * FT ? 4 * FT : 4 * FT * Math.sqrt(Math.max(0, (10 * FT - vv) / (3 * FT)))),
  attitudeMax: 6,                          // deg from local vertical at touchdown
  slopeMax: 12,                            // deg effective slope
  // "excellent" band used for grading (tighter than the certification envelope)
  goodVv: 1.0, goodVh: 0.5, goodTilt: 6
};
/** Apollo 11 at touchdown, for comparison [TND6850; NASA NTRS 20260001760]. */
export const EAGLE_TOUCHDOWN = { vv: 1.7 * FT, vLateral: 2.1 * FT, pitch: 0.8, roll: 2.6 };

/* ---------------- Initial conditions ---------------- */
// PDI: 48,814 ft, 5,560 ft/s inertial, horizontal (near perilune) [TND6846].
// Range to the target is tuned so the simulated braking phase reaches High Gate
// near 8 min 26 s like the plan (≈ 480 km, ≈260 nmi).
export const PDI = { h: 48814 * FT, v: 5560 * FT, x: -482000 };

// Guidance targets (site frame: x downrange from the target, h altitude above it).
// P63 aims at High Gate [TND6846, MR]; accelerations and jerk are tuned values
// (the flown LGC targets are in Klumpp 1971 but not reproduced here).
export const TARGETS = {
  P63: { x: -4.5 * NMI - 700, h: 7300 * FT, vx: 150, vh: -125 * FT, ax: -2.5, ah: 0.10, jx: 0.0006 },
  P64: { x: 0, h: 30, vx: 0, vh: -1.0, ax: 0.0, ah: 0.0, jx: 0.0115 }
};
export const P64_TO_P65_H = 30;           // m, automatic vertical descent below this
export const P65_RATE = 3 * FT;           // 3 ft/s constant-rate vertical descent
export const ROD_STEP = 1 * FT;           // one click of the ROD switch = 1 ft/s
export const LPD_STEP = 2 * DEG;          // one hand-controller click in P64 moves the LPD 2° along track (approx.)
export const GUIDANCE_PERIOD = 2;         // s, LGC guidance cycle
export const DT = 0.02;                   // s, integration step

/* ---------------- helpers ---------------- */
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/** Real-time state in the local frame from inertial position/velocity. */
function local(p, v) {
  const r = Math.hypot(p[0], p[1]);
  const up = [p[0] / r, p[1] / r];
  const fwd = [up[1], -up[0]];               // clockwise from up = downrange
  return {
    r, up, fwd,
    x: R_MOON * Math.atan2(p[0], p[1]),
    h: r - R_MOON,
    vx: v[0] * fwd[0] + v[1] * fwd[1],
    vh: v[0] * up[0] + v[1] * up[1]
  };
}

/* =========================================================================
 * Descent simulation
 * ========================================================================= */
export class Descent {
  /**
   * @param {object} o  start conditions: {x, h, vx, vh, theta, m, prop, mode, t, auto, engine}
   *                    ground(x, z) → terrain height (m) is optional (flat by default)
   */
  constructor(o = {}) {
    const x = o.x ?? PDI.x, h = o.h ?? PDI.h;
    const phi = x / R_MOON, r = R_MOON + h;
    this.p = [r * Math.sin(phi), r * Math.cos(phi)];
    const up = [Math.sin(phi), Math.cos(phi)], fwd = [Math.cos(phi), -Math.sin(phi)];
    const vx = o.vx ?? PDI.v, vh = o.vh ?? 0;
    this.v = [fwd[0] * vx + up[0] * vh, fwd[1] * vx + up[1] * vh];
    this.theta = o.theta ?? 88 * DEG;
    this.omega = 0;
    this.m = o.m ?? LM.massPDI;
    this.prop = o.prop ?? LM.propPDI;
    this.t = o.t ?? 0;                 // s since PDI ignition
    this.mode = o.mode ?? 'P63';
    this.auto = o.auto ?? true;        // computer flies attitude + throttle
    this.armstrong = o.armstrong ?? false; // automatic stand-in for the crew in P66
    this.ground = o.ground || (() => 0);
    this.throttle = o.throttle ?? (this.mode === 'P63' && this.t < DPS.startLow ? DPS.min : 0.3);
    this.throttleCmd = this.throttle;
    this.ftpMode = this.mode === 'P63' && (o.ftpMode ?? true);
    this.engineOn = o.engine ?? true;
    this.thetaCmd = this.theta;
    this.rateCmd = 0;
    this.aca = 0;                      // attitude hand controller: −1 (pitch back), 0, +1 (forward)
    this.rodCmd = null;                // commanded altitude rate in P66 (m/s)
    this.target = { ...TARGETS[this.mode === 'P64' ? 'P64' : 'P63'] };
    this.lpdX = o.lpdX ?? 0;           // P64 aim point (site frame x)
    this.clearX = o.clearX ?? 335;     // where the "Armstrong" autopilot heads in P66
    this.tgo = null; this.guidT = -1e9; this.aCmd = [0, 0];
    this.jet = 0;                      // current RCS pitch jet direction (−1, 0, +1) for visuals
    this.jetTime = 0;
    this.events = [];
    this.flags = {};
    this.dvUsed = 0;                   // ∫F/m dt, m/s
    this.contact = null; this.touchdown = null; this.outcome = null;
    this.lowLevel = false; this.lpdClicks = 0; this.rodClicks = 0;
    this.d = {};
    this._derive();
    if (this.t === 0 && this.mode === 'P63') this._event('ignition', 'DPS ignition at 10 % throttle');
  }

  /* ---------------- derived quantities ---------------- */
  _derive() {
    const L = local(this.p, this.v);
    const d = this.d;
    d.x = L.x; d.h = L.h; d.vx = L.vx; d.vh = L.vh; d.r = L.r;
    d.ground = this.ground(L.x, 0, L.h);
    // altitude of the footpad plane above the terrain directly below (what the
    // landing radar and the crew call-outs refer to)
    d.alt = L.h - LM.cgHeight * Math.cos(this.theta) - d.ground;
    d.usable = Math.max(0, this.prop - LM.unusable);
    d.propPct = 100 * this.prop / LM.dpsLoaded;
    d.hoverRate = this.m * G_SURF / (isp(this.m * G_SURF / DPS.rated) * G0); // kg/s to hover
    d.hoverLeft = d.usable / d.hoverRate;                        // s of hover
    d.toBingo = d.hoverLeft - LM.bingoReserve;                   // s to the land-or-abort point
    d.thrust = this.engineOn ? this.throttle * DPS.rated : 0;
    d.accel = d.thrust / this.m;
    d.gEff = MU / (L.r * L.r) - L.vx * L.vx / L.r;                // gravity less centrifugal relief
    d.lpdAngle = this.lpdAngle();
    return d;
  }

  /** Look angle from the thrust axis (straight "down" through the floor) toward
   *  +Z to the P64 target, degrees — what the LGC displayed as the LPD angle. */
  lpdAngle(xt = this.lpdX) {
    const dx = xt - this.d.x, dh = (this.d.h ?? 0) - (this.ground(xt, 0) || 0);
    const depression = Math.atan2(dh, Math.max(1e-3, dx));       // below local horizontal
    return (90 * DEG - depression - this.theta) / DEG;
  }

  _event(id, text, extra) {
    if (this.flags[id]) return;
    this.flags[id] = true;
    this.events.push({ id, t: this.t, text, ...(extra || {}) });
  }

  /* ---------------- crew inputs ---------------- */
  /** Take over in P66 (Rate Of Descent mode): the computer keeps the throttle
   *  on the commanded altitude rate; attitude comes from the hand controller. */
  takeOver(armstrong = false) {
    if (this.touchdown) return;
    this.mode = 'P66';
    this.auto = false;
    this.armstrong = armstrong;
    // Apollo 11: P66 started from the current altitude rate, quantised to 1 ft/s
    this.rodCmd = Math.round(this.d.vh / ROD_STEP) * ROD_STEP;
    if (this.ftpMode) this.ftpMode = false;
    this._event('p66', armstrong ? 'P66 — Armstrong takes semi-manual control' : 'P66 — you have control');
  }
  /** Hand the vehicle back to the computer (P64 if high, P65 if low). */
  engageAuto() {
    if (this.touchdown) return;
    this.auto = true; this.armstrong = false; this.aca = 0;
    if (this.d.alt > P64_TO_P65_H + 20) {
      this.mode = 'P64'; this.target = { ...TARGETS.P64, x: this.lpdX, h: TARGETS.P64.h + this.ground(this.lpdX, 0) }; this.guidT = -1e9; this.tgo = null;
    } else this.mode = 'P65';
  }
  /** ROD switch: +1 = slower descent (up), −1 = faster (down), 1 ft/s per click. */
  rod(dir) {
    if (this.mode !== 'P66' || this.touchdown) return;
    this.rodCmd = clamp((this.rodCmd ?? this.d.vh) + dir * ROD_STEP, -60 * FT, 10 * FT);
    this.rodClicks++;
  }
  /** In P64 the hand controller redesignates the landing point: +1 = further. */
  redesignate(dir) {
    if (this.mode !== 'P64' || this.touchdown) return false;
    const a = this.lpdAngle() * DEG + dir * LPD_STEP;             // further = larger angle from "down" (the thrust axis)
    const dep = 90 * DEG - a - this.theta;                        // new depression angle below the horizon
    if (dep < 3 * DEG) return false;
    const dh = this.d.h - this.ground(this.lpdX, 0);
    this.lpdX = this.d.x + dh / Math.tan(dep);
    this.target.x = this.lpdX; this.target.h = TARGETS.P64.h + this.ground(this.lpdX, 0); this.guidT = -1e9;
    this.lpdClicks++;
    return true;
  }
  setAca(v) { this.aca = clamp(v, -1, 1); }
  shutdown() { if (this.engineOn) { this.engineOn = false; this._event('shutdown', 'Engine stop'); } }

  /* ---------------- guidance ---------------- */
  /** Time-to-go from the downrange jerk condition
   *  jT T³ − 6 aT T² + (24 vT + 6Δv) T + 24 Δr = 0 (Newton, warm-started). */
  _solveT(tg, x, vx) {
    const dr = x - tg.x, dv = vx - tg.vx;
    const f = (T) => tg.jx * T * T * T - 6 * tg.ax * T * T + (24 * tg.vx + 6 * dv) * T + 24 * dr;
    const df = (T) => 3 * tg.jx * T * T - 12 * tg.ax * T + (24 * tg.vx + 6 * dv);
    let T = this.tgo && this.tgo > 2 ? this.tgo : Math.max(5, 2 * Math.abs(dr) / (Math.abs(vx) + Math.abs(tg.vx) + 1));
    for (let i = 0; i < 12; i++) {
      const g = df(T);
      if (Math.abs(g) < 1e-9) break;
      const Tn = T - f(T) / g;
      if (!isFinite(Tn)) break;
      T = clamp(Tn, 0.5, 2000);
    }
    if (!(T > 0.5) || Math.abs(f(T)) > 1e-3 * (Math.abs(24 * dr) + 1)) {
      T = Math.max(1, 2 * Math.abs(dr) / (Math.abs(vx) + Math.abs(tg.vx) + 0.5));
    }
    return T;
  }

  _quadratic(tg) {
    const d = this.d;
    const T = this._solveT(tg, d.x, d.vx);
    this.tgo = T;
    const ax = tg.ax + 12 * (tg.x - d.x) / (T * T) - 6 * (d.vx + tg.vx) / T;
    const ah = tg.ah + 12 * (tg.h - d.h) / (T * T) - 6 * (d.vh + tg.vh) / T;
    return [ax, ah];
  }

  /** Turn a kinematic acceleration command into attitude + throttle commands. */
  _thrustFor(ax, ah) {
    const d = this.d;
    // thrust acceleration = kinematic command − (gravity − centrifugal) − Coriolis-like term
    const tx = ax + d.vx * d.vh / d.r;
    const th = ah + d.gEff;
    this.thetaCmd = Math.atan2(-tx, Math.max(0.05, th));
    this.throttleCmd = this.m * Math.hypot(tx, th) / DPS.rated;
  }

  _guidance(dt) {
    const d = this.d;
    if (this.mode === 'P63') {
      if (this.t - this.guidT >= GUIDANCE_PERIOD) {
        this.guidT = this.t;
        this.aCmd = this._quadratic(this.target);
        this._thrustFor(this.aCmd[0], this.aCmd[1]);
        if (this.tgo < GUIDANCE_PERIOD + 1 || d.h < TARGETS.P63.h * 0.6) {
          this.mode = 'P64'; this.target = { ...TARGETS.P64, x: this.lpdX, h: TARGETS.P64.h + this.ground(this.lpdX, 0) }; this.tgo = null; this.guidT = -1e9;
          this._event('p64', 'P64 — High Gate: approach phase, pitch over, the site comes into view');
        }
      }
    } else if (this.mode === 'P64') {
      if (this.t - this.guidT >= GUIDANCE_PERIOD) {
        this.guidT = this.t;
        this.aCmd = this._quadratic(this.target);
        this._thrustFor(this.aCmd[0], this.aCmd[1]);
      }
      if (!this.flags.lowgate && d.alt < 500 * FT) this._event('lowgate', 'Low Gate — 500 ft, landing phase begins');
      if (d.alt < P64_TO_P65_H || (this.tgo != null && this.tgo < 6)) {
        this.mode = 'P65';
        this._event('p65', 'P65 — automatic vertical descent at 3 ft/s');
      }
    } else if (this.mode === 'P65') {
      // velocity nulling over the aim point, constant 3 ft/s descent
      const vxDes = clamp(0.25 * (this.lpdX - d.x), -2, 2);
      const ax = clamp(0.5 * (vxDes - d.vx), -1.2, 1.2);
      const ah = 1.2 * (-P65_RATE - d.vh);
      this._thrustFor(ax, ah);
      this.thetaCmd = clamp(this.thetaCmd, -20 * DEG, 20 * DEG);
    } else if (this.mode === 'P66') {
      if (this.armstrong) this._armstrong();
      // ROD loop: the computer throttles to hold the commanded altitude rate
      const ah = clamp(1.5 * ((this.rodCmd ?? d.vh) - d.vh), -2.5, 2.5);
      const th = ah + d.gEff;
      this.throttleCmd = this.m * th / (DPS.rated * Math.max(0.3, Math.cos(this.theta)));
      if (!this.armstrong) this.thetaCmd = null;                  // attitude from the hand controller
    }
  }

  /** A stand-in for Neil Armstrong in P66: level off, fly past the boulder field
   *  to the clear area, then let down at ≈2 ft/s and null the drift. */
  _armstrong() {
    const d = this.d;
    const togo = this.clearX - d.x;
    const a = Math.abs(togo);
    const vxDes = Math.sign(togo) * Math.min(17.7, Math.sqrt(2 * 0.3 * a), 0.3 * a);
    const ax = clamp(0.6 * (vxDes - d.vx), -0.6, 0.6);
    this.thetaCmd = clamp(Math.atan2(-ax, G_SURF), -14 * DEG, 20 * DEG);
    // altitude-rate schedule (quantised like the real ROD switch)
    let vh;
    if (togo > 90) vh = d.alt > 110 ? -3 * FT : -1 * FT;                          // hold ≈350 ft over the boulders
    else vh = -clamp(0.03 * d.alt + 0.6, 0.6, 4.5 * FT);
    if (d.alt < 5) vh = -1.7 * FT;
    const want = Math.round(vh / ROD_STEP) * ROD_STEP;
    if (this.rodCmd == null) this.rodCmd = want;
    if (Math.abs(want - this.rodCmd) >= ROD_STEP * 0.5 && this.t - (this._rodT || 0) > 0.6) {
      this.rodCmd += Math.sign(want - this.rodCmd) * ROD_STEP; this._rodT = this.t; this.rodClicks++;
    }
  }

  /* ---------------- throttle model ---------------- */
  _throttle(dt) {
    let cmd = this.throttleCmd;
    if (this.mode === 'P63' && this.t < DPS.startLow) cmd = DPS.min;
    else if (this.ftpMode) {
      // Braking phase: hold FTP until the guidance asks for less than ≈57 %
      // ("throttle recovery", planned 6 min 24 s after ignition [MR])
      if (this.t >= DPS.startLow && !this.flags.ftp) this._event('ftp', 'Full throttle (FTP, 92.5 %)');
      if (cmd < 0.57 && this.t > DPS.startLow + 5) {
        this.ftpMode = false;
        this._event('throttledown', 'Throttle down — guidance now controls thrust');
      } else cmd = DPS.ftp;
    }
    if (!this.ftpMode) {
      // honest throttle: 10–60 % or FTP; the band between is not used [DPS]
      if (cmd > DPS.maxThrottled) cmd = cmd > 0.8 ? DPS.ftp : DPS.maxThrottled;
      cmd = clamp(cmd, DPS.min, DPS.ftp);
    }
    this.throttleCmd = cmd;
    this.throttle += (cmd - this.throttle) * (1 - Math.exp(-dt / DPS.tau));
  }

  /* ---------------- attitude (RCS) ---------------- */
  _attitude(dt) {
    const I = this.m * LM.gyration * LM.gyration;
    const alphaMax = LM.rcsTorque / I;
    let rateCmd;
    if (this.thetaCmd == null) {
      // manual: rate command while the controller is deflected, attitude hold when released
      if (this.aca !== 0) { rateCmd = -this.aca * 6 * DEG; this._hold = null; }
      else { if (this._hold == null) this._hold = this.theta + this.omega * Math.abs(this.omega) / (2 * alphaMax); rateCmd = clamp(1.5 * (this._hold - this.theta), -6 * DEG, 6 * DEG); }
    } else {
      this._hold = null;
      const lim = this.mode === 'P63' ? 3 * DEG : 8 * DEG;
      rateCmd = clamp(1.2 * (this.thetaCmd - this.theta), -lim, lim);
    }
    this.rateCmd = rateCmd;
    const err = rateCmd - this.omega;
    const db = 0.15 * DEG;                                        // rate deadband
    let alpha = 0;
    if (Math.abs(err) > db) alpha = clamp(err / dt, -alphaMax, alphaMax);
    this.jet = Math.abs(alpha) > 0.05 * alphaMax ? Math.sign(alpha) : 0;
    if (this.jet) this.jetTime = this.t;
    this.omega += alpha * dt;
    this.theta += this.omega * dt;
  }

  /* ---------------- one integration step ---------------- */
  step(dt = DT) {
    if (this.touchdown) { this.t += dt; return; }
    this._derive();
    if (this.auto || this.mode === 'P66') this._guidance(dt);
    this._attitude(dt);
    if (this.engineOn) this._throttle(dt);

    // thrust, mass flow
    let F = 0, mdot = 0;
    if (this.engineOn) {
      if (this.prop - LM.unusable <= 0) { this.engineOn = false; this._event('depleted', 'Propellant depleted — engine out'); }
      else { F = this.throttle * DPS.rated; mdot = F / (isp(this.throttle) * G0); }
    }
    const L = local(this.p, this.v);
    const dirX = -Math.sin(this.theta), dirH = Math.cos(this.theta);
    const ux = L.fwd[0] * dirX + L.up[0] * dirH, uy = L.fwd[1] * dirX + L.up[1] * dirH;
    const aT = F / this.m;
    const acc = (p) => {
      const r2 = p[0] * p[0] + p[1] * p[1], r = Math.sqrt(r2), k = -MU / (r2 * r);
      return [k * p[0] + aT * ux, k * p[1] + aT * uy];
    };
    // RK4 (thrust direction fixed over the 20 ms step)
    const p = this.p, v = this.v;
    const a1 = acc(p);
    const p2 = [p[0] + v[0] * dt / 2, p[1] + v[1] * dt / 2], v2 = [v[0] + a1[0] * dt / 2, v[1] + a1[1] * dt / 2];
    const a2 = acc(p2);
    const p3 = [p[0] + v2[0] * dt / 2, p[1] + v2[1] * dt / 2], v3 = [v[0] + a2[0] * dt / 2, v[1] + a2[1] * dt / 2];
    const a3 = acc(p3);
    const p4 = [p[0] + v3[0] * dt, p[1] + v3[1] * dt], v4 = [v[0] + a3[0] * dt, v[1] + a3[1] * dt];
    const a4 = acc(p4);
    this.p = [p[0] + dt / 6 * (v[0] + 2 * v2[0] + 2 * v3[0] + v4[0]), p[1] + dt / 6 * (v[1] + 2 * v2[1] + 2 * v3[1] + v4[1])];
    this.v = [v[0] + dt / 6 * (a1[0] + 2 * a2[0] + 2 * a3[0] + a4[0]), v[1] + dt / 6 * (a1[1] + 2 * a2[1] + 2 * a3[1] + a4[1])];
    this.m -= mdot * dt; this.prop -= mdot * dt;
    this.dvUsed += aT * dt;
    this.t += dt;
    const d = this._derive();

    // propellant events
    if (!this.lowLevel && this.prop <= LM.lowLevelFrac * LM.dpsLoaded) { this.lowLevel = true; this._event('lowlevel', 'DESCENT QTY — low-level light'); }
    if (this.lowLevel) {
      if (d.toBingo <= 60) this._event('bingo60', '60 seconds to Bingo');
      if (d.toBingo <= 30) this._event('bingo30', '30 seconds to Bingo');
      if (d.toBingo <= 0) this._event('bingo', 'Bingo — land within 20 seconds or abort');
    }
    this._contactCheck();
  }

  /** Positions (x, height) of footpads and probe tips; z for the side legs. */
  gear() {
    const d = this.d, c = Math.cos(this.theta), s = Math.sin(this.theta);
    // body axes in the local (x, h) plane: up = (−s, c), fwd = (c, s)
    const pt = (fwd, up) => ({ x: d.x + fwd * c - up * s, h: d.h + fwd * s + up * c });
    const R = LM.tread, H = -LM.cgHeight;
    const pads = [
      { name: 'fwd', z: 0, ...pt(R, H), probe: false },
      { name: 'aft', z: 0, ...pt(-R, H), probe: true },
      { name: 'left', z: -R, ...pt(0, H), probe: true },
      { name: 'right', z: R, ...pt(0, H), probe: true }
    ];
    for (const p of pads) {
      p.ground = this.ground(p.x, p.z);
      if (p.probe) { const q = pt(p.name === 'aft' ? -R - 0.12 : 0, H - LM.probe); p.probeH = q.h; p.probeX = q.x; }
    }
    return pads;
  }

  _contactCheck() {
    const d = this.d;
    if (d.alt > 6) return;
    const pads = this.gear();
    if (!this.contact) {
      for (const p of pads) {
        if (p.probe && p.probeH <= this.ground(p.probeX, p.z)) {
          this.contact = { t: this.t };
          this._event('contact', 'CONTACT LIGHT');
          break;
        }
      }
    }
    for (const p of pads) {
      if (p.h <= p.ground) { this._land(pads); break; }
    }
  }

  _land(pads) {
    const d = this.d;
    this.engineOn = false;
    const g = Object.fromEntries(pads.map(p => [p.name, p.ground]));
    const sx = (g.fwd - g.aft) / (2 * LM.tread), sz = (g.right - g.left) / (2 * LM.tread);
    const slope = Math.atan(Math.hypot(sx, sz)) / DEG;
    const vv = -d.vh, vh = Math.abs(d.vx), att = Math.abs(this.theta) / DEG;
    const rest = slope;                                       // final tilt once the gear settles
    let grade;
    if (vv <= GEAR.goodVv && vh <= GEAR.goodVh && att <= GEAR.goodTilt && rest <= GEAR.goodTilt) grade = 'good';
    else if (vv <= GEAR.vvMax && vh <= GEAR.vhMax(vv) && att <= GEAR.attitudeMax + 0.5 && rest <= GEAR.slopeMax) grade = 'hard';
    else grade = 'fail';
    const hoverLeft = d.hoverLeft;
    this.touchdown = { t: this.t, vv, vh, attitude: att, slope: rest, x: d.x, usable: d.usable, prop: this.prop, hoverLeft, toBingo: d.toBingo, grade, dv: this.dvUsed };
    this.outcome = grade;
    this.throttle = 0; this.omega = 0;
    this.v = [0, 0];
    this._derive();
    this._event('touchdown', grade === 'fail' ? 'Touchdown outside the landing-gear envelope' : 'Touchdown — engine stop');
  }

  /** Advance to time t (s since PDI) in fixed steps. */
  runTo(t) {
    let guard = 0;
    while (this.t < t - 1e-9 && !this.touchdown && guard++ < 2e6) this.step(Math.min(DT, t - this.t));
    if (this.touchdown && this.t < t) this.t = t;
  }

  snapshot() {
    const d = this.d;
    return { t: this.t, x: d.x, h: d.h, alt: d.alt, vx: d.vx, vh: d.vh, theta: this.theta / DEG, m: this.m, prop: this.prop, thr: this.throttle, mode: this.mode };
  }
}

/** Fly the whole automatic descent from PDI (or from `o`) and record it.
 *  Used for the nominal trajectory on the Mission Control plot and for the
 *  High Gate start. Returns { sim, samples, at(id) }. */
export function nominal(o = {}, every = 1) {
  const sim = new Descent({ ...o, auto: true });
  const samples = [];
  let next = 0;
  while (!sim.touchdown && sim.t < 1500) {
    if (sim.t >= next) { samples.push(sim.snapshot()); next += every; }
    sim.step();
  }
  samples.push(sim.snapshot());
  const at = (id) => (sim.events.find(e => e.id === id) || {}).t;
  return { sim, samples, at };
}
