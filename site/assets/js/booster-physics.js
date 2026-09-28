/* Cosmic Library · Booster landing physics (Falcon 9 Block 5-class first stage)
 * ---------------------------------------------------------------------------
 * A planar (2-D) rigid-body model: downrange x, altitude h, pitch attitude θ.
 * Pure ES module with no DOM access, so it runs in the browser and in Node
 * (see scripts/test_booster.mjs).
 *
 *   translation: gravity (inverse square), drag and lift from the body, the grid
 *                fins and the legs, engine thrust with ambient-pressure loss,
 *                and the curvature terms of a non-rotating spherical Earth.
 *   rotation:    engine gimbal torque, grid-fin torque, aerodynamic body torque,
 *                cold-gas reaction-control torque; a fly-by-wire attitude loop.
 *   mass:        propellant flow ṁ = F/(Isp·g₀) from the engines that are lit.
 *   integrator:  classical 4th-order Runge–Kutta, fixed 20 ms step (50 Hz).
 *
 * Conventions
 *   x  downrange distance measured along the sea surface (m), + = away from the launch site
 *   h  altitude of the centre of mass above sea level (m)
 *   vx horizontal speed (m/s), vy vertical speed (m/s, + = up)
 *   θ  attitude: angle of the vehicle's long axis (engines → interstage) from the
 *      local vertical, + = top tilted toward +x. θ = 0 is "standing up".
 *   ω  pitch rate dθ/dt measured in an inertial frame (rad/s)
 *   Body axis b = (sin θ, cos θ); body normal n = (cos θ, −sin θ).
 *   Station y: metres along the axis above the nozzle exit plane.
 *
 * Sources (see also site/data/booster.json, which mirrors these numbers):
 *   [B5]   Wikipedia, "Falcon 9 Block 5": first-stage empty mass 22,200 kg,
 *          LOX 287,400 kg + RP-1 123,500 kg, diameter 3.7 m, height 41.2 m
 *          (42.6 m in the specification table), sea-level thrust 7,607 kN,
 *          single-engine throttle range 845–482 kN, titanium grid fins.
 *   [M1D]  Wikipedia, "SpaceX Merlin": Merlin 1D 845 kN at sea level, Isp 282 s
 *          sea level / 311 s vacuum, "refinements allow the engine to throttle to 40%".
 *   [F9]   Wikipedia, "Falcon 9": payload 8,300 kg to GTO expended, 5,500 kg with
 *          drone-ship landing, 3,500 kg with return to launch site.
 *   [USSA] U.S. Standard Atmosphere, 1976 (NOAA/NASA/USAF).
 *   [JOR]  L. H. Jorgensen, "Prediction of static aerodynamic characteristics for
 *          slender bodies alone and with lifting surfaces to very high angles of
 *          attack", NASA TR R-474, 1977 (normal-force model).
 *   [HOE]  S. F. Hoerner, "Fluid-Dynamic Drag", 1965 (blunt-body drag vs Mach).
 *   [SG]   K. Sutton & R. A. Graves, NASA TR R-376, 1971 (stagnation heating).
 *   [GF]   W. D. Washington & M. S. Miller, "Grid fins — a new concept for missile
 *          stability and control", AIAA 93-0035, 1993 (grid-fin behaviour vs Mach).
 * Values marked ESTIMATE are not published; they are chosen from photographs,
 * public reference drawings or physical reasoning and are labelled as such.
 * ------------------------------------------------------------------------- */

export const G0 = 9.80665;             // standard gravity, m/s²
export const RE = 6371000;             // mean Earth radius, m
export const MU = 3.986004418e14;      // Earth GM, m³/s² (WGS-84)
export const P0 = 101325;              // sea-level pressure, Pa [USSA]
export const DT = 0.02;                // physics step, s (50 Hz)
const DEG = Math.PI / 180;

/* ---------------- vehicle ---------------- */
export const VEH = {
  length: 42.6,          // m, nozzle exit to top of interstage [B5 table 42.6 m; 41.2 m quoted without engines]
  radius: 1.83,          // m, 3.66 m diameter ("3.7 m") [B5]
  dryMass: 22200,        // kg, empty first stage [B5] — a published ESTIMATE; others quote up to ≈ 25.6 t
  propCapacity: 410900,  // kg, 287,400 LOX + 123,500 RP-1 [B5]
  ofRatio: 287400 / 123500, // oxidiser/fuel mass ratio ≈ 2.33 [B5]
  // Mass layout (ESTIMATE): ≈ 60 % of the dry mass spread along the 42.6 m
  // structure, ≈ 40 % in the engines + thrust structure at y ≈ 2 m.
  // → dry centre of mass y ≈ 13.4 m, pitch inertia ≈ 3.9 × 10⁶ kg·m².
  yCgDry: 13.4,
  IDry: 3.9e6,
  yLox: 20.0,            // m, bottom of the forward (LOX) tank, where residual LOX settles (ESTIMATE)
  yRp1: 3.5,             // m, bottom of the aft (RP-1) tank (ESTIMATE)
  yGimbal: 2.2,          // m, engine gimbal plane (ESTIMATE, from Merlin proportions)
  yFins: 40.4,           // m, grid-fin hinge line near the top of the interstage (ESTIMATE)
  yCpBody: 21.0,         // m, cross-flow force centre = planform centroid [JOR]
  legHinge: 2.4,         // m, leg hinge station (ESTIMATE)
  legLength: 8.0,        // m, deployed leg length (ESTIMATE, gives the ≈ 18 m span seen in photographs)
  footDrop: 0.8,         // m, feet sit this far below the nozzle exits when deployed (ESTIMATE)
  footSpan: 9.15,        // m, foot distance from the axis → ≈ 18.3 m tip-to-tip (ESTIMATE)
  nozzleR: 0.46          // m, visual nozzle-exit radius (ESTIMATE)
};
VEH.aRef = Math.PI * VEH.radius * VEH.radius;         // 10.5 m², base (reference) area
VEH.aPlan = 2 * VEH.radius * (VEH.length - 1.1);       // ≈ 152 m², side (planform) area

/* ---------------- Merlin 1D (sea-level) ---------------- */
// Throttle τ is expressed as a fraction of the rated SEA-LEVEL thrust, like the
// published 845–482 kN range [B5]. With exit area Aₑ the thrust at ambient
// pressure p is  F = τ·F_SL + (P0 − p)·Aₑ  and the mass flow is the vacuum
// thrust divided by the vacuum exhaust velocity.
export const ENG = {
  fSL: 845e3,            // N, per engine at sea level [M1D]
  ispSL: 282,            // s [M1D]
  ispVac: 311,           // s [M1D]
  minThrottle: 482 / 845,// 0.57 of rated thrust (482 kN) [B5]; [M1D] mentions 40 % for later refinements
  gimbalMax: 5 * DEG,    // rad, ESTIMATE (typical for pump-fed kerosene engines; not published)
  gimbalRate: 20 * DEG,  // rad/s, ESTIMATE
  spool: 0.45,           // s, start-up time constant (ESTIMATE; a Merlin start takes ≈ 1–2 s to full thrust)
  throttleRate: 1.5      // per second, ESTIMATE
};
ENG.mdot = ENG.fSL / (ENG.ispSL * G0);                 // 305.6 kg/s per engine at full throttle
ENG.fVac = ENG.mdot * ENG.ispVac * G0;                 // 932 kN in vacuum ([B5] lists 914 kN — sources differ by 2 %)
ENG.ae = (ENG.fVac - ENG.fSL) / P0;                    // 0.86 m² effective exit area (derived)

/* ---------------- grid fins, reaction control, legs ---------------- */
export const AERO = {
  finArea: 1.8,          // m² per fin, ≈ 1.2 × 1.5 m lattice (ESTIMATE from photographs)
  finCNa: 2.6,           // normal-force slope per fin, 1/rad (ESTIMATE, typical of grid fins [GF])
  finDeflMax: 20 * DEG,  // rad, ESTIMATE
  finRate: 30 * DEG,     // rad/s, ESTIMATE
  finDeploy: 2.5,        // s, time to swing out (ESTIMATE, from footage)
  legDeploy: 3.0,        // s, pneumatic deployment (ESTIMATE, from footage)
  legDragArea: 3.0,      // m² extra axial drag area when deployed (ESTIMATE)
  rcsTorque: 9.0e4,      // N·m, nitrogen cold-gas thrusters at the interstage (ESTIMATE:
                         // a few kN at ≈ 30 m lever; chosen so a flip takes ≈ 30 s as in webcasts)
  crossflowCd: 1.2,      // cylinder cross-flow drag coefficient [JOR]
  eta: 0.65              // finite-length factor for L/D ≈ 11 [JOR]
};

/* ---------------- atmosphere: U.S. Standard Atmosphere 1976 ---------------- */
const LAYERS = [ // base geopotential alt (m), base T (K), lapse (K/m), base p (Pa) [USSA]
  [0, 288.15, -0.0065, 101325], [11000, 216.65, 0, 22632.06], [20000, 216.65, 0.001, 5474.889],
  [32000, 228.65, 0.0028, 868.0187], [47000, 270.65, 0, 110.9063], [51000, 270.65, -0.0028, 66.93887],
  [71000, 214.65, -0.002, 3.956420], [84852, 186.946, 0, 0.3734]
];
const R_AIR = 287.053, GAMMA = 1.4;
export function atmosphere(h) {
  if (h < 0) h = 0;
  const hg = RE * h / (RE + h);                         // geometric → geopotential altitude
  let i = LAYERS.length - 1;
  while (i > 0 && hg < LAYERS[i][0]) i--;
  const [hb, Tb, L, pb] = LAYERS[i];
  let T, p;
  if (L === 0) { T = Tb; p = pb * Math.exp(-G0 * (hg - hb) / (R_AIR * Tb)); }
  else { T = Tb + L * (hg - hb); p = pb * Math.pow(T / Tb, -G0 / (R_AIR * L)); }
  if (hg > 84852) { T = 186.946; p = 0.3734 * Math.exp(-(hg - 84852) / 5800); } // exponential tail
  return { T, p, rho: p / (R_AIR * T), a: Math.sqrt(GAMMA * R_AIR * T) };
}

/* ---------------- aerodynamic coefficients ---------------- */
function interp(tab, x) {
  if (x <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) if (x <= tab[i][0]) {
    const [x0, y0] = tab[i - 1], [x1, y1] = tab[i];
    return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }
  return tab[tab.length - 1][1];
}
// Axial force coefficient, base (engines) first, on the 10.5 m² base area.
// Blunt-body shape after [HOE]: flat subsonic, rise through Mach 1, broad
// supersonic plateau. The protruding engine bells soften the blunt face, so the
// values sit a little below a flat disc. APPROXIMATE.
const CA_TAB = [[0, 0.72], [0.6, 0.74], [0.9, 0.86], [1.1, 1.12], [1.5, 1.32], [2, 1.36], [3, 1.3], [5, 1.24], [10, 1.2]];
export const cA = (M) => interp(CA_TAB, M);
// Grid-fin drag coefficient on the fin frontal area: low subsonic, peaks when the
// lattice cells choke near Mach 1, falls again supersonic [GF]. APPROXIMATE.
const CDF_TAB = [[0, 0.40], [0.7, 0.45], [0.95, 1.05], [1.3, 0.85], [2, 0.62], [4, 0.5], [10, 0.45]];
export const cdFin = (M) => interp(CDF_TAB, M);
// Grid fins lose some effectiveness in the transonic choke region [GF]. APPROXIMATE.
const FINEFF_TAB = [[0, 1], [0.8, 1], [1.0, 0.55], [1.4, 0.8], [3, 0.7], [10, 0.6]];
const finEff = (M) => interp(FINEFF_TAB, M);

/* Stagnation-point convective heat flux, Sutton–Graves [SG]: q̇ = k·√(ρ/rₙ)·v³ */
export function heatFlux(rho, v, rn = VEH.radius) { return 1.7415e-4 * Math.sqrt(rho / rn) * v * v * v; }

/* ---------------- engine thrust ---------------- */
export function thrustPerEngine(tau, p) { return tau * ENG.fSL + (P0 - p) * ENG.ae; }
export function mdotPerEngine(tau) { return (tau * ENG.fSL + P0 * ENG.ae) / (ENG.ispVac * G0); }

/* ---------------- sea state and drone-ship motion ---------------- */
// A handful of long-crested swell components (amplitude m, wavelength m, heading
// rad from +x, phase). Sea state ≈ 4: significant wave height ≈ 1.8 m. The same
// list drives the ocean shader, so the deck moves with the waves you see.
export const WAVES = [
  { a: 0.55, L: 110, dir: 0.35, ph: 0.0 },
  { a: 0.35, L: 72, dir: -0.55, ph: 1.7 },
  { a: 0.22, L: 46, dir: 1.1, ph: 4.1 },
  { a: 0.14, L: 28, dir: -1.3, ph: 2.6 },
  { a: 0.08, L: 17, dir: 0.2, ph: 5.3 }
];
WAVES.forEach(w => { w.k = 2 * Math.PI / w.L; w.w = Math.sqrt(G0 * w.k); }); // deep-water dispersion ω² = g·k
export function waveHeight(x, z, t, scale = 1) {
  let s = 0;
  for (const w of WAVES) s += w.a * scale * Math.sin(w.k * (Math.cos(w.dir) * x + Math.sin(w.dir) * z) - w.w * t + w.ph);
  return s;
}
/* The ship is a 91 m × 52 m platform [ESTIMATE from photographs of the barges]. Its
 * heave, pitch and roll are the plane that best fits the wave surface under the
 * hull (a crude but honest low-pass: a big hull averages out short waves). */
export const SHIP = { length: 91, width: 52, deck: 3.2 }; // deck height above mean water (ESTIMATE)
export function shipMotion(t, scale = 1) {
  let hs = 0, px = 0, pz = 0; const n = 5;
  const Lh = SHIP.length * 0.42, Wh = SHIP.width * 0.4;
  for (let i = -n; i <= n; i++) for (let j = -2; j <= 2; j++) {
    const x = i / n * Lh, z = j / 2 * Wh;
    const w = waveHeight(x, z, t, scale);
    hs += w; px += w * x; pz += w * z;
  }
  const N = (2 * n + 1) * 5;
  let sx = 0, sz = 0;
  for (let i = -n; i <= n; i++) sx += (i / n * Lh) ** 2;
  for (let j = -2; j <= 2; j++) sz += (j / 2 * Wh) ** 2;
  sx *= 5; sz *= 2 * n + 1;
  const heave = 0.7 * hs / N;
  return { heave, pitch: Math.atan(0.7 * px / sx), roll: Math.atan(0.7 * pz / sz) };
}

/* ---------------- scenarios ---------------- */
// Initial states just after stage separation. Staging conditions are
// representative, not a specific flight: reusable boosters separate at
// ≈ 65–80 km and ≈ 1.7–2.3 km/s depending on the recovery mode (orbitalradar.com
// glossary "MECO"; webcast telemetry). Propellant loads are MODEL ESTIMATES:
// SpaceX does not publish its landing reserves, so each load is what this
// model's autopilot needs for its profile plus a margin.
export const SCENARIOS = {
  ship: {
    name: 'Drone-ship landing', short: 'Droneship', target: 'ship',
    h: 70000, v: 2250, gamma: 31 * DEG, prop: 18500,
    x: 0, targetX: 0, // targetX filled in below from the nominal trajectory
    entryAlt: 56000, entryEnd: 1300, sea: 1,
    blurb: 'Separated at 70 km and 2.25 km/s. Flip, entry burn, steer with the grid fins, then land on a ship ≈ 570 km down-range.'
  },
  rtls: {
    name: 'Return to launch site', short: 'RTLS', target: 'pad',
    h: 67000, v: 1700, gamma: 38 * DEG, prop: 44000,
    x: 0, targetX: -70000, coastX: -69200,
    entryAlt: 46000, entryEnd: 950, sea: 1,
    blurb: 'Separated at 67 km and 1.7 km/s, 70 km from the landing zone. Flip, boost back, entry burn, glide in over the sea and land on a pad 800 m from the beach.'
  },
  final: {
    name: 'Final approach', short: 'Final', target: 'ship',
    h: 3000, v: null, gamma: null, prop: 4500, x: -70, targetX: 0,
    sea: 0.8, practice: true,
    blurb: 'Practice the hoverslam: 3 km up, falling engines-first at terminal velocity, 4.5 t of propellant.'
  }
};
SCENARIOS.ship.targetX = 571000; // nominal landing point of this model's autopilot (see scripts/test_booster.mjs)

/* ---------------- the simulator ---------------- */
const wrapPi = (a) => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export { wrapPi, clamp };

export class BoosterSim {
  constructor(key = 'ship', opts = {}) { this.reset(key, opts); }

  reset(key = this.key || 'ship', opts = {}) {
    const S = SCENARIOS[key];
    this.key = key; this.S = S;
    this.t = 0;
    this.prop = opts.prop ?? S.prop;
    this.x = S.x; this.h = S.h;
    this.targetX = S.targetX;
    this.sea = S.sea;
    if (S.v != null) {
      this.vx = S.v * Math.cos(S.gamma); this.vy = S.v * Math.sin(S.gamma);
      this.theta = Math.atan2(this.vx, this.vy);   // pointing along the velocity (prograde) at staging
      this.finDep = 0; this.finCmd = false;
    } else {
      // Final approach: falling engines-first at the local terminal velocity
      this.vx = 3; this.theta = 0;
      this.finDep = 1; this.finCmd = true;
      this.vy = -this.terminalVelocity(this.h);
    }
    this.omega = 0;
    // actuators
    this.engOn = false; this.nEng = 1; this.level = 0; this.throttle = 1; this.throttleCmd = 0.8;
    this.gimbal = 0; this.finDefl = 0; this.rcs = 0;
    this.legDep = 0; this.legCmd = false;
    this.attCmd = this.theta; this.attHold = true;
    // bookkeeping
    this.done = null;          // touchdown / crash record
    this.events = [];          // {t, id, text}
    this.flags = {};
    this.max = { q: 0, heat: 0, g: 0 };
    this.hist = []; this.lastHist = -1;
    this.ignitions = 0; this.burnTime = 0;
    this.derived();
    return this;
  }

  get m() { return VEH.dryMass + Math.max(0, this.prop); }
  get yCg() {
    const mp = Math.max(0, this.prop), lox = mp * VEH.ofRatio / (1 + VEH.ofRatio), rp = mp - lox;
    return (VEH.dryMass * VEH.yCgDry + lox * VEH.yLox + rp * VEH.yRp1) / this.m;
  }
  get inertia() {
    const mp = Math.max(0, this.prop), lox = mp * VEH.ofRatio / (1 + VEH.ofRatio), rp = mp - lox, yc = this.yCg;
    return VEH.IDry + VEH.dryMass * (VEH.yCgDry - yc) ** 2 + lox * (VEH.yLox - yc) ** 2 + rp * (VEH.yRp1 - yc) ** 2 + mp * 4; // + tank-radius term
  }

  /* terminal velocity for axial, engines-first fall with fins out (legs stowed) */
  terminalVelocity(h, m = this.m) {
    const atm = atmosphere(h);
    let v = 200;
    for (let i = 0; i < 30; i++) { // Mach-dependent Cd: fixed-point iteration
      const M = v / atm.a;
      const cdA = VEH.aRef * cA(M) + 4 * AERO.finArea * cdFin(M);
      v = Math.sqrt(2 * m * G0 * Math.pow(RE / (RE + h), 2) / (atm.rho * cdA));
    }
    return v;
  }

  /* surface under the vehicle: sea (with the ship) or the landing zone */
  surface(x, t) {
    if (this.S.target === 'ship') {
      const dx = x - this.targetX;
      if (Math.abs(dx) <= SHIP.length / 2 + 0.5) {
        const sm = shipMotion(t, this.sea);
        return { h: SHIP.deck + sm.heave + Math.tan(sm.pitch) * dx, slope: sm.pitch, kind: 'deck', dh: this._dheave(t) };
      }
      return { h: waveHeight(dx, 0, t, this.sea), slope: 0, kind: 'sea', dh: 0 };
    }
    // RTLS: land west of the coastline, sea east of it
    const coast = this.S.coastX ?? -1e12;
    if (x < coast) return { h: 0, slope: 0, kind: Math.abs(x - this.targetX) < 43 ? 'pad' : 'land', dh: 0 };
    return { h: waveHeight(x, 0, t, this.sea * 0.6), slope: 0, kind: 'sea', dh: 0 };
  }
  _dheave(t) { const e = 0.05; return (shipMotion(t + e, this.sea).heave - shipMotion(t - e, this.sea).heave) / (2 * e); }

  /* forces and torque for a state s = [x, h, vx, vy, θ, ω] */
  forces(s, withDetail = false) {
    const [, h, vx, vy, th] = s;
    const m = this.m, yc = this.yCg;
    const atm = atmosphere(h);
    const V = Math.hypot(vx, vy);
    const q = 0.5 * atm.rho * V * V, M = V / atm.a;
    const bx = Math.sin(th), by = Math.cos(th), nx = Math.cos(th), ny = -Math.sin(th);
    let Fx = 0, Fy = 0, T = 0; // T = torque in the θ sense (clockwise, + tilts the top toward +x)
    // --- thrust (gimballed) ---
    const nE = this.engOn || this.level > 0.001 ? this.nEng : 0;
    let Fth = 0;
    if (nE > 0 && this.prop > 0) {
      Fth = Math.max(0, nE * this.level * thrustPerEngine(this.throttle, atm.p));
      const cg = Math.cos(this.gimbal), sg = Math.sin(this.gimbal);
      Fx += Fth * (bx * cg + nx * sg); Fy += Fth * (by * cg + ny * sg);
      T += -(yc - VEH.yGimbal) * Fth * sg;               // lateral thrust at the gimbal plane
    }
    // --- aerodynamics ---
    let D = 0, L = 0, aFin = 0;
    if (V > 0.5 && q > 0.01) {
      const ua = vx * bx + vy * by, un = vx * nx + vy * ny;
      const at = Math.atan2(Math.abs(un), Math.abs(ua));     // acute angle of attack
      const baseFirst = ua < 0;
      // axial force (drag along the axis)
      const ca = cA(M) * (baseFirst ? 1 : 0.9);
      let Fa = q * VEH.aRef * ca * Math.cos(at);
      Fa += q * 4 * AERO.finArea * cdFin(M) * this.finDep * Math.cos(at);
      Fa += q * AERO.legDragArea * this.legDep;
      Fa *= -Math.sign(ua);
      // normal force, Jorgensen: C_N = sin2α·cos(α/2) + η·C_dc·(A_p/A)·sin²α  [JOR]
      const cnPot = Math.sin(2 * at) * Math.cos(at / 2);
      const cnX = AERO.eta * AERO.crossflowCd * (VEH.aPlan / VEH.aRef) * Math.sin(at) ** 2;
      const sgn = -Math.sign(un);
      const Fpot = sgn * q * VEH.aRef * cnPot, Fxf = sgn * q * VEH.aRef * cnX;
      // potential-flow part acts near the leading end, cross-flow part at the planform centroid
      const yPot = baseFirst ? 2.0 : VEH.length - 2.0;
      // grid fins: two effective pitch-plane fins (four fins in an X, cos²45° each)
      let Ffin = 0;
      if (this.finDep > 0.01) {
        const k = q * 2 * AERO.finArea * AERO.finCNa * finEff(M) * this.finDep;
        const aLoc = clamp(Math.atan2(un, Math.abs(ua)), -0.5, 0.5);  // fins see the local cross-flow
        Ffin = -k * aLoc + k * this.finDefl;
        aFin = k;
      }
      Fx += Fa * bx + (Fpot + Fxf + Ffin) * nx; Fy += Fa * by + (Fpot + Fxf + Ffin) * ny;
      // torque (θ sense) of a normal force f at station y: +(y − y_cg)·f
      T += (yPot - yc) * Fpot + (VEH.yCpBody - yc) * Fxf + (VEH.yFins - yc) * Ffin;
      // aerodynamic pitch damping (cross-flow on a rotating body), ESTIMATE
      T -= 0.5 * atm.rho * V * VEH.aPlan * 0.6 * 60 * s[5];
      if (withDetail) {
        const vhx = vx / V, vhy = vy / V;
        D = -((Fa * bx + (Fpot + Fxf + Ffin) * nx) * vhx + (Fa * by + (Fpot + Fxf + Ffin) * ny) * vhy);
        L = Math.hypot(Fa * bx + (Fpot + Fxf + Ffin) * nx, Fa * by + (Fpot + Fxf + Ffin) * ny);
      }
    }
    T += this.rcs;
    return { Fx, Fy, T, Fth, q, M, atm, V, D, L, aFin };
  }

  deriv(s) {
    const [, h, vx, vy, , om] = s;
    const f = this.forces(s);
    const m = this.m, r = RE + h, g = MU / (r * r);
    return [
      vx * RE / r,                          // dx/dt measured along the sea surface
      vy,
      f.Fx / m - vx * vy / r,               // spherical-Earth transport terms
      f.Fy / m - g + vx * vx / r,
      om - vx / r,                          // the local vertical turns as we move over the curved Earth
      f.T / this.inertia
    ];
  }

  /* ---------- flight control system: attitude command → gimbal / fins / RCS ---------- */
  fcs(dt) {
    const s = [this.x, this.h, this.vx, this.vy, this.theta, this.omega];
    const I = this.inertia, yc = this.yCg;
    // what the aerodynamics and thrust do with the actuators centred
    const g0 = this.gimbal, f0 = this.finDefl, r0 = this.rcs;
    this.gimbal = 0; this.finDefl = 0; this.rcs = 0;
    const base = this.forces(s);
    const kG = -(yc - VEH.yGimbal) * base.Fth;                    // torque per radian of gimbal (small angle)
    const kF = (VEH.yFins - yc) * base.aFin;                       // torque per radian of fin deflection
    const aMax = (Math.abs(kG) * ENG.gimbalMax + Math.abs(kF) * AERO.finDeflMax * 0.8 + AERO.rcsTorque) / I;
    const err = wrapPi(this.attCmd - this.theta);
    const rate = this.omega - this.vx / (RE + this.h);             // dθ/dt
    const wMax = Math.min(0.35, Math.sqrt(2 * 0.55 * aMax * Math.abs(err)));
    const wDes = clamp(1.4 * err, -wMax, wMax);
    let tauNeed = I * clamp(3.0 * (wDes - rate), -aMax, aMax) - base.T;
    // allocate: gimbal first, then grid fins, then cold-gas thrusters
    let gCmd = 0, fCmd = 0, rCmd = 0;
    if (Math.abs(kG) * ENG.gimbalMax > 0.05 * AERO.rcsTorque) { gCmd = clamp(tauNeed / kG, -ENG.gimbalMax, ENG.gimbalMax); tauNeed -= gCmd * kG; }
    if (Math.abs(kF) * AERO.finDeflMax > 0.1 * AERO.rcsTorque) { fCmd = clamp(tauNeed / kF, -AERO.finDeflMax, AERO.finDeflMax); tauNeed -= fCmd * kF; }
    rCmd = clamp(tauNeed, -AERO.rcsTorque, AERO.rcsTorque);
    // actuator rate limits
    this.gimbal = g0 + clamp(gCmd - g0, -ENG.gimbalRate * dt, ENG.gimbalRate * dt);
    this.finDefl = f0 + clamp(fCmd - f0, -AERO.finRate * dt, AERO.finRate * dt);
    this.rcs = Math.abs(rCmd) < 800 ? 0 : rCmd;                  // thrusters have a minimum impulse bit
    void r0;
  }

  /* ---------- controls (called by the page or the autopilot) ---------- */
  ignite() {
    if (this.done || this.prop <= 0) return false;
    if (!this.engOn) { this.engOn = true; this.ignitions++; this.flags.lastIgnH = this.clearance(); this.log('ign', this.nEng === 1 ? 'Engine start' : this.nEng + ' engines start'); }
    return true;
  }
  cutoff() { if (this.engOn) { this.engOn = false; this.log('cut', 'Engine cutoff'); } }
  setEngines(n) {
    if (this.nEng === n) return;
    this.nEng = n;
    if (this.engOn) this.log('neng', n + (n === 1 ? ' engine' : ' engines') + ' lit');
  }
  deployLegs() { if (!this.legCmd) { this.legCmd = true; this.log('legs', 'Landing legs deploying'); } }
  deployFins() { if (!this.finCmd) { this.finCmd = true; this.log('fins', 'Grid fins deployed'); } }

  log(id, text) { this.events.push({ t: this.t, id, text }); }
  once(id, text) { if (!this.flags[id]) { this.flags[id] = this.t; this.log(id, text); return true; } return false; }

  /* ---------- one fixed step ---------- */
  step(dt = DT) {
    if (this.done) { this.t += dt; return; }
    // actuators
    const lvlT = this.engOn && this.prop > 0 ? 1 : 0;
    this.level += (lvlT - this.level) * (1 - Math.exp(-dt / (lvlT ? ENG.spool : 0.2)));
    if (!lvlT && this.level < 0.002) this.level = 0;
    const tc = clamp(this.throttleCmd, ENG.minThrottle, 1);
    this.throttle += clamp(tc - this.throttle, -ENG.throttleRate * dt, ENG.throttleRate * dt);
    if (this.finCmd) this.finDep = Math.min(1, this.finDep + dt / AERO.finDeploy);
    if (this.legCmd) this.legDep = Math.min(1, this.legDep + dt / AERO.legDeploy);
    this.fcs(dt);
    // propellant
    const nE = this.level > 0.001 ? this.nEng : 0;
    const mdot = nE * this.level * mdotPerEngine(this.throttle);
    // RK4 on [x, h, vx, vy, θ, ω]; mass is updated after the step (mid-step mass error < 0.1 %)
    const s0 = [this.x, this.h, this.vx, this.vy, this.theta, this.omega];
    const k1 = this.deriv(s0);
    const k2 = this.deriv(s0.map((v, i) => v + k1[i] * dt / 2));
    const k3 = this.deriv(s0.map((v, i) => v + k2[i] * dt / 2));
    const k4 = this.deriv(s0.map((v, i) => v + k3[i] * dt));
    const ns = s0.map((v, i) => v + (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) * dt / 6);
    [this.x, this.h, this.vx, this.vy, this.theta, this.omega] = ns;
    this.theta = wrapPi(this.theta);
    if (mdot > 0) {
      this.prop -= mdot * dt; this.burnTime += dt;
      if (this.prop <= 0) { this.prop = 0; this.engOn = false; this.once('flameout', 'Propellant depleted: the engines flame out'); }
    }
    this.t += dt;
    this.derived();
    // peaks and history
    if (this.d.q > this.max.q) this.max.q = this.d.q;
    if (this.d.heat > this.max.heat) this.max.heat = this.d.heat;
    if (this.t - this.lastHist >= 0.5) { this.lastHist = this.t; this.hist.push([this.x, this.h]); }
    this.contact();
  }

  derived() {
    const f = this.forces([this.x, this.h, this.vx, this.vy, this.theta, this.omega], true);
    const m = this.m, g = MU / (RE + this.h) ** 2;
    this.d = {
      atm: f.atm, q: f.q, M: f.M, V: f.V, thrust: f.Fth, drag: f.D,
      heat: heatFlux(f.atm.rho, f.V),
      tw: f.Fth / (m * g),
      twMin: this.nEng * thrustPerEngine(ENG.minThrottle, f.atm.p) / (m * g),
      accel: Math.hypot(f.Fx, f.Fy) / m / G0,
      gamma: Math.atan2(this.vy, this.vx),
      aoa: this._aoa(),
      g
    };
    if (this.d.accel > this.max.g && this.t > 0.5) this.max.g = this.d.accel;
    return this.d;
  }
  _aoa() { // signed angle between the engines-first direction (−b) and the velocity
    const V = Math.hypot(this.vx, this.vy); if (V < 1) return 0;
    const bx = Math.sin(this.theta), by = Math.cos(this.theta);
    const c = (-bx * this.vx - by * this.vy) / V, s = (-bx * this.vy + by * this.vx) / V;
    return Math.atan2(s, c);
  }

  /* lowest point of the vehicle (feet if deployed, else nozzle rims), world coordinates */
  lowPoints() {
    const b = [Math.sin(this.theta), Math.cos(this.theta)], n = [Math.cos(this.theta), -Math.sin(this.theta)];
    const yc = this.yCg, legs = this.legDep > 0.97;
    const ya = legs ? -VEH.footDrop : 0, lat = legs ? VEH.footSpan : 1.5;
    return [-1, 1].map(sg => ({
      x: this.x + (ya - yc) * b[0] + sg * lat * n[0],
      h: this.h + (ya - yc) * b[1] + sg * lat * n[1]
    }));
  }
  /* height of the nozzle exits (or feet) above the surface directly below */
  clearance() {
    const pts = this.lowPoints();
    let c = Infinity;
    for (const p of pts) c = Math.min(c, p.h - this.surface(p.x, this.t).h);
    return c;
  }

  contact() {
    if (this.h > 200) return;
    const pts = this.lowPoints();
    let hit = null;
    for (const p of pts) { const sf = this.surface(p.x, this.t); if (p.h <= sf.h) { hit = sf; break; } }
    if (!hit) return;
    const sfc = this.surface(this.x, this.t);
    const vRel = this.vy - (sfc.dh || 0);
    const tilt = Math.abs(wrapPi(this.theta - (sfc.slope || 0)));
    const dist = Math.abs(this.x - this.targetX);
    const legs = this.legDep > 0.97;
    let kind = hit.kind;
    if (this.S.target === 'ship') {
      const pts2 = this.lowPoints();
      const onDeck = pts2.every(p => Math.abs(p.x - this.targetX) <= SHIP.length / 2);
      if (!onDeck) kind = 'sea';
    }
    const r = {
      t: this.t, vy: -vRel, vx: this.vx, tilt, dist, prop: this.prop, legs, surface: kind,
      heave: sfc.dh || 0, engOn: this.engOn, ignitions: this.ignitions, hLit: this.flags.lastIgnH ?? null
    };
    r.outcome = judge(r, this.S.target);
    this.done = r;
    this.engOn = false; this.level = 0;
    this.log('touch', r.outcome.title);
  }

  snapshot() {
    return { x: this.x, h: this.h, vx: this.vx, vy: this.vy, theta: this.theta, omega: this.omega, prop: this.prop, t: this.t };
  }
}

/* ---------------- scoring ---------------- */
export const LIMITS = { vy: 2, vx: 1, tilt: 5 * DEG, vyHard: 6, tiltTip: 10 * DEG };
export function judge(r, target) {
  const pts = [];
  let fail = null;
  if (r.vy > LIMITS.vyHard + 2) fail = 'hard';
  else if (r.surface === 'sea') fail = 'water';
  else if (!r.legs) fail = 'nolegs';
  else if (r.tilt > LIMITS.tiltTip) fail = 'tip';
  const vyOk = r.vy < LIMITS.vy, vxOk = Math.abs(r.vx) < LIMITS.vx, tiltOk = r.tilt < LIMITS.tilt;
  const distOk = r.dist < (target === 'ship' ? 10 : 15);
  // score: 100 for a perfect landing
  let score = 0;
  score += 30 * clamp(1 - Math.max(0, r.vy - 0.5) / 5, 0, 1);
  score += 20 * clamp(1 - Math.max(0, Math.abs(r.vx) - 0.3) / 3, 0, 1);
  score += 20 * clamp(1 - r.tilt / (10 * DEG), 0, 1);
  score += 20 * clamp(1 - r.dist / 40, 0, 1);
  score += 10 * clamp(r.prop / 1500, 0, 1);
  if (fail) score = Math.min(score, 25);
  let title, grade;
  if (fail) { title = 'Vehicle lost'; grade = 'fail'; }
  else if (vyOk && vxOk && tiltOk && distOk) { title = 'Booster landed'; grade = 'perfect'; }
  else if (r.vy < LIMITS.vyHard && r.tilt < LIMITS.tiltTip) { title = 'Landed — needs inspection'; grade = 'ok'; }
  else { title = 'Hard landing'; grade = 'hard'; }
  return { fail, grade, title, score: Math.round(score), checks: { vyOk, vxOk, tiltOk, distOk }, pts };
}

/* ---------------- predictor ---------------- */
/* Fast forward-integration of the rest of the flight with the engines off, the
 * body aligned with the airflow (no lift) and fins out. Optional: an impulsive
 * model of the planned entry burn, and the horizontal drift during a landing
 * burn at the planned deceleration. Used by the HUD (predicted touchdown point,
 * time to impact, trajectory line) and by the autopilot. */
export function predict(sim, opts = {}) {
  let x = sim.x, h = sim.h, vx = sim.vx, vy = sim.vy, t = 0;
  if (opts.impulse) { vx += opts.impulse[0]; vy += opts.impulse[1]; } // e.g. engine tail-off after cutoff
  let m = opts.mass ?? sim.m;
  const path = opts.path ? [[x, h]] : null;
  const entryAlt = opts.entryAlt, entryEnd = opts.entryEnd;
  let entryOn = false, entryDone = !entryAlt;
  let peakQ = 0, peakHeat = 0, lbBurn = null;
  const lTau = opts.landingTau;                 // planned landing-burn throttle (1 engine)
  const surf = opts.surfaceH ?? 3;
  for (let i = 0; i < 20000; i++) {
    const V = Math.hypot(vx, vy);
    const atm = atmosphere(h);
    const q = 0.5 * atm.rho * V * V, M = V / atm.a;
    if (q > peakQ) peakQ = q;
    // same rule as the autopilot: 80 % throttle plus half of the present drag
    const aPlan = lTau && h < 15000 && V < 400
      ? thrustPerEngine(lTau, atm.p) / m - MU / (RE + h) ** 2 + 0.5 * q * (VEH.aRef * cA(M) + 4 * AERO.finArea * cdFin(M)) / m : 0;
    const hf = heatFlux(atm.rho, V); if (hf > peakHeat) peakHeat = hf;
    // planned entry burn: three engines, retrograde, until the speed is down to entryEnd
    if (!entryDone && !entryOn && vy < 0 && h < entryAlt) entryOn = V > entryEnd;
    if (entryOn && V <= entryEnd) { entryOn = false; entryDone = true; }
    // landing burn: once below the ideal ignition height, account for its drift and stop
    if (aPlan > 0 && vy < 0) {
      const hb = vy * vy / (2 * aPlan);
      if (h - surf - 14 <= hb + (-vy) * 0.5) {
        const tb = -vy / aPlan;
        lbBurn = { h, t: tb };
        x += vx * tb * AP_GAINS.drift; t += tb;          // drift while braking (≈ ½·vₓ·t for a uniform stop; the flare makes it less)
        if (path) path.push([x, surf]);
        return { x, t, path, peakQ, peakHeat, lbBurn };
      }
    }
    const cdA = VEH.aRef * cA(M) + 4 * AERO.finArea * cdFin(M) * (opts.fins ?? 1);
    let Dm = V > 0 ? q * cdA / m / V : 0;
    if (entryOn) Dm += 3 * thrustPerEngine(1, atm.p) / m / V;
    const r = RE + h, g = MU / (r * r);
    let dt = clamp((h - surf) / Math.max(40, V) / 6, 0.05, 1.0);
    if (entryOn) { dt = Math.min(dt, 0.2); m = Math.max(VEH.dryMass, m - 3 * mdotPerEngine(1) * dt); if (m <= VEH.dryMass) { entryOn = false; entryDone = true; } }
    // semi-implicit Euler with drag (and the entry-burn thrust, which also acts against the velocity)
    vx += (-Dm * vx - vx * vy / r) * dt;
    vy += (-Dm * vy - g + vx * vx / r) * dt;
    x += vx * dt * RE / r; h += vy * dt; t += dt;
    if (path && (i % 4 === 0)) path.push([x, h]);
    if (h <= surf) { if (path) path.push([x, surf]); break; }
  }
  return { x, t, path, peakQ, peakHeat, lbBurn };
}

/* Ideal hoverslam ignition height for n engines at throttle τ:
 *   a_net = n·F(τ)/m − g + D/(2m) ,   h_burn = v² / (2·a_net)
 * Drag D also decelerates the stage but fades as it slows, so half of the
 * present value is counted (a simple, stated approximation). */
export function burnHeight(sim, tau = 0.8, n = 1, v = null, withDrag = true) {
  const p = sim.d.atm.p;
  const vv = v ?? Math.max(0, -sim.vy);
  // drag helps too; it falls as the stage slows, so only half of today's value is counted
  const aDrag = withDrag ? 0.5 * sim.d.drag / sim.m : 0;
  const aNet = n * thrustPerEngine(tau, p) / sim.m - sim.d.g + aDrag;
  if (aNet <= 0) return { h: Infinity, aNet, t: Infinity };
  return { h: vv * vv / (2 * aNet), aNet, t: vv / aNet };
}

/* ---------------- autopilot ---------------- */
/* A transparent guidance law, phase by phase. Every decision is a formula the
 * HUD can show:
 *   flip      point the engines where the next burn needs them (cold-gas thrusters)
 *   boostback (RTLS) 3 engines until the predicted impact point is the landing zone
 *   coast     hold engines-first into the future airflow
 *   entry     3 engines from `entryAlt` until speed ≤ `entryEnd` (cuts heating and q)
 *   aero      grid-fin steering: angle of attack ∝ predicted miss distance
 *   landing   1 engine when height ≤ v²/(2·a_net) at 80 % throttle; then
 *             throttle for a_req = (v² − v_td²)/(2·h_go), tilt to null drift
 *   touchdown cut off. */
export const AP_GAINS = { k1: 0.09, k2: 0.45, win: 4, kf: 0.6, tf: 4, drift: 0.43 };
export const AP_TAU = 0.8;       // planned landing-burn throttle: leaves authority both ways
export class Autopilot {
  constructor(opts = {}) { this.phase = 'flip'; this.pred = null; this.predT = -1; this.steer = opts.steer ?? true; }

  retroAttitude(sim) { return Math.atan2(-sim.vx, -sim.vy); } // engines pointing along the velocity
  /* attitude for the coming entry burn: retrograde to the velocity the stage will
   * have when it falls back to the entry altitude (vacuum ballistic estimate) */
  entryAttitude(sim) {
    const S = sim.S, g = sim.d.g;
    const vyE = -Math.sqrt(Math.max(0, sim.vy * sim.vy + 2 * g * Math.max(0, sim.h - S.entryAlt)));
    return Math.atan2(-sim.vx, -Math.min(vyE, sim.vy));
  }
  /* velocity the engines will still add while their thrust tails off after a cutoff */
  tailOff(sim) {
    if (!sim.engOn) return null;
    const a = sim.d.thrust / sim.m * 0.2;                 // 0.2 s shutdown time constant
    return [a * Math.sin(sim.theta), a * Math.cos(sim.theta)];
  }

  update(sim) {
    if (sim.done) { this.phase = 'done'; return; }
    const S = sim.S;
    const V = Math.hypot(sim.vx, sim.vy);
    // refresh the prediction a few times a second of flight time
    const fine = this.phase === 'boostback';            // boostback: predict every step
    if (fine || sim.t - this.predT > 0.25 || !this.pred) {
      this.predT = sim.t;
      this.pred = predict(sim, {
        impulse: fine ? this.tailOff(sim) : null,
        entryAlt: this.phase === 'flip' || this.phase === 'boostback' || this.phase === 'coast' ? S.entryAlt : null,
        entryEnd: S.entryEnd, landingTau: AP_TAU,
        surfaceH: S.target === 'ship' ? 3 : 0
      });
    }
    const miss = this.steer ? this.pred.x - sim.targetX : 0;
    if (!sim.finCmd && sim.t > 4) sim.deployFins();

    switch (this.phase) {
      case 'flip': {
        if (S.practice) { this.phase = 'aero'; break; }
        if (S.target === 'pad') {
          sim.attCmd = -80 * DEG;           // engines toward the down-range side, nose back at the launch site
          if (Math.abs(wrapPi(sim.attCmd - sim.theta)) < 25 * DEG) {
            sim.setEngines(3); sim.throttleCmd = 1; sim.ignite(); this.phase = 'boostback';
            sim.once('boostback', 'Boostback burn: three engines reverse the horizontal velocity');
          }
        } else {
          sim.attCmd = this.entryAttitude(sim);
          if (Math.abs(wrapPi(sim.attCmd - sim.theta)) < 8 * DEG) { this.phase = 'coast'; sim.once('flipdone', 'Flip complete: engines now face the direction of travel'); }
        }
        break;
      }
      case 'boostback': {
        sim.attCmd = -80 * DEG;
        // near the end, drop to one engine at minimum throttle for a precise cutoff
        if (miss < 12000 && sim.nEng > 1) { sim.setEngines(1); sim.throttleCmd = ENG.minThrottle; }
        // shut down when the predicted impact point (with the planned entry burn) reaches the landing zone
        if (miss <= 250) { sim.cutoff(); this.phase = 'coast'; sim.once('bbend', 'Boostback complete: now falling back toward the landing zone'); }
        break;
      }
      case 'coast': {
        sim.attCmd = this.entryAttitude(sim);
        if (sim.vy < 0 && sim.h < S.entryAlt && V > S.entryEnd) {
          sim.setEngines(3); sim.throttleCmd = 1; sim.ignite(); this.phase = 'entry';
          sim.once('entry', 'Entry burn: three engines slow the stage before the thick air');
        } else if (sim.vy < 0 && sim.h < S.entryAlt - 5000) { this.phase = 'aero'; }
        break;
      }
      case 'entry': {
        sim.attCmd = this.retroAttitude(sim) + clamp(-miss * 2e-6, -0.03, 0.03);
        if (V <= S.entryEnd) { sim.cutoff(); this.phase = 'aero'; sim.once('entryend', 'Entry burn complete: grid fins take over steering'); }
        break;
      }
      case 'aero': {
        // Grid-fin steering. With the engines off the body behaves like a wing:
        // tilting the TOP away from the target makes the stage glide toward it.
        const aMax = (sim.d.M > 1.2 ? 5 : 9) * DEG;
        const aoa = clamp(miss / (sim.h > 8000 ? 1500 : 120), -1, 1) * aMax;
        sim.attCmd = this.retroAttitude(sim) + aoa;
        const P = this.profile(sim);
        const hgo = sim.clearance();
        const v = -sim.vy;
        // light the engine when the descent speed meets the planned braking curve
        // (plus the distance covered while the engine spools up)
        if (sim.h < 15000 && sim.d.V < 400 && sim.vy < -5 && hgo - v * ENG.spool * 1.3 <= P.hBurn(v)) {
          sim.setEngines(1); sim.throttleCmd = AP_TAU; sim.ignite(); this.phase = 'landing';
          sim.once('landing', 'Landing burn: one engine, hoverslam');
        }
        break;
      }
      case 'landing': {
        const legsOut = sim.legDep > 0.97;
        const hgo = sim.clearance() - (legsOut ? 0 : VEH.footDrop);
        const v = -sim.vy;
        const P = this.profile(sim);
        if (!sim.legCmd && (hgo < 250 || P.tgo(v) < 8)) sim.deployLegs();
        const hh = Math.max(hgo, 0);
        const vRef = P.vRef(hh);
        const aFF = hh < P.h1 ? P.a1 : P.a2;
        // deceleration command = planned value + feedback on the speed error
        const aCmd = aFF + 3.0 * (v - vRef);
        const aDrag = sim.d.drag / sim.m * Math.max(0, v) / Math.max(sim.d.V, 1);
        const tgo = Math.max(0.8, P.tgo(v));
        // horizontal: a spring-damper toward the target, a = k₁·Δx − k₂·vₓ
        // (ω ≈ 0.25 rad/s, ζ ≈ 0.8: gentle early, converged by touchdown)
        const sf = sim.surface(sim.targetX, sim.t);
        const dx = sim.targetX - sim.x;
        let ax = clamp(AP_GAINS.k1 * dx - AP_GAINS.k2 * sim.vx, -4, 4);
        if (tgo < AP_GAINS.tf) ax = clamp(-sim.vx * AP_GAINS.kf + 0.05 * dx, -3, 3);   // last seconds: kill the drift
        const aVert = aCmd + sim.d.g - aDrag;
        const tMax = (hh > 40 ? 12 : hh > 15 ? 8 : 2) * DEG;   // stand up straight for the last 15 m
        let tilt = clamp(Math.atan2(ax, Math.max(aVert, 3)), -tMax, tMax);
        // While the air is still dense and fast, stay close to retrograde: a big angle of
        // attack turns the body into a wing that pushes the OTHER way and fights the engine.
        const win = (sim.d.q > 6000 ? AP_GAINS.win : sim.d.q > 2500 ? 2 * AP_GAINS.win : 20) * DEG;
        const retro = this.retroAttitude(sim);
        if (sim.d.V > 20) tilt = clamp(tilt, retro - win, retro + win);
        const want = hh < 10 ? (sf.slope || 0) * 0.6 : tilt;
        sim.attCmd += clamp(want - sim.attCmd, -10 * DEG * DT, 10 * DEG * DT);   // smooth: ≤ 10°/s
        // throttle for the vertical need, using the attitude the stage actually has now
        const Fneed = sim.m * Math.max(aVert, 0) / Math.max(Math.cos(sim.theta + sim.gimbal), 0.8);
        const Fp = thrustPerEngine(0, sim.d.atm.p);                  // pressure part of the thrust
        sim.throttleCmd = clamp((Fneed / sim.nEng - Fp) / ENG.fSL, ENG.minThrottle, 1);
        // it cannot hover: if it stops just above the deck, cut off and drop the last few centimetres
        if (v < 0.5 && hh < 0.5) sim.cutoff();
        break;
      }
    }
  }

  /* The planned braking curve for the landing burn (a "flare"):
   *   upper part  decelerate at a₂ = a_net at 80 % throttle (+ half of today's drag)
   *   last h₁ m   decelerate at the gentler a₁ ≈ minimum-throttle a_net + 2 m/s²
   *   touch down  at v_td = 1 m/s.
   * v_ref(h) = √(v_td² + 2·a₁·h) below h₁, √(v₁² + 2·a₂·(h − h₁)) above. */
  profile(sim) {
    const p = sim.d.atm.p, m = sim.m, g = sim.d.g;
    const aMin = thrustPerEngine(ENG.minThrottle, p) / m - g;
    const a2 = Math.max(4, thrustPerEngine(AP_TAU, p) / m - g + 0.5 * sim.d.drag / m);
    const a1 = Math.min(a2, Math.max(4, aMin + 3));
    const vtd = 1.2, h1 = 40;
    const v1 = Math.sqrt(vtd * vtd + 2 * a1 * h1);
    return {
      a1, a2, h1, vtd, v1,
      vRef: (h) => h < h1 ? Math.sqrt(vtd * vtd + 2 * a1 * h) : Math.sqrt(v1 * v1 + 2 * a2 * (h - h1)),
      hBurn: (v) => v <= v1 ? (v * v - vtd * vtd) / (2 * a1) : h1 + (v * v - v1 * v1) / (2 * a2),
      tgo: (v) => Math.max(0, (Math.min(v, v1) - vtd) / a1) + Math.max(0, (v - v1) / a2)
    };
  }
}

/* run a whole flight with the autopilot (tests, replays) */
export function flyAuto(key, opts = {}) {
  const sim = new BoosterSim(key, opts);
  const ap = new Autopilot(opts);
  const tMax = opts.tMax ?? 900;
  while (!sim.done && sim.t < tMax) { ap.update(sim); sim.step(DT); }
  return { sim, ap };
}
