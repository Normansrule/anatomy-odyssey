/* Cosmic Library — Galaxy Collision: physics (no Three.js, runs in the browser and in Node)
 *
 * Model: a *restricted* N-body simulation in the spirit of Toomre & Toomre (1972),
 * "Galactic Bridges and Tails", ApJ 178, 623.
 *   - Each galaxy is a rigid, moving potential: a Hernquist bulge + a Plummer sphere standing in for the disk
 *     mass + a Hernquist dark-matter halo (Hernquist 1990, ApJ 356, 359; Plummer 1911, MNRAS 71, 460).
 *   - The two galaxy centres ("cores") pull on each other and feel Chandrasekhar dynamical friction
 *     (Chandrasekhar 1943, ApJ 97, 255; Binney & Tremaine 2008, Galactic Dynamics, eq. 8.7), which drains
 *     orbital energy so that the galaxies can actually merge. Integrated with kick-drift-kick leapfrog.
 *   - Stars are massless test particles that feel both galaxies. They are integrated on the GPU with the same
 *     symplectic leapfrog (galaxies.js); this file also has a CPU version used for tests.
 *
 * Units (G = 1):   length 1 kpc,  mass 10¹⁰ M☉,
 *   velocity  V = √(G · 10¹⁰ M☉ / kpc) = 207.4 km/s        (G = 4.300917 × 10⁻⁶ kpc (km/s)² / M☉, IAU/CODATA)
 *   time      T = kpc / V = 4.715 Myr   → 10 billion years = 2121 time units.
 *   energy per unit mass in V² = (207.4 km/s)².
 */

export const G_KPC_KMS2_MSUN = 4.300917e-6;               // kpc (km/s)² M☉⁻¹
export const V_KMS = Math.sqrt(G_KPC_KMS2_MSUN * 1e10);     // 207.386 km/s
const KPC_KM = 3.0856775814913673e16;                       // km
const MYR_S = 3.15576e13;                                   // Julian megayear, s
export const T_MYR = KPC_KM / V_KMS / MYR_S;                // 4.7149 Myr
export const GYR = 1000 / T_MYR;                            // time units per billion years (≈ 212.1)

/* ------------------------------------------------------------------ random numbers (seeded, deterministic) */
export function rng(seed) {                                 // mulberry32 (public domain)
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.gauss = () => { let u = 0; while (u === 0) u = f(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307 * f()); };
  return f;
}

/* ------------------------------------------------------------------ galaxy models */
/* Masses in 10¹⁰ M☉, lengths in kpc.
 * Milky Way: disk scale length 2.6 kpc, bulge ≈ 1 × 10¹⁰ M☉, stellar disk ≈ 5 × 10¹⁰ M☉ (Bland-Hawthorn & Gerhard 2016,
 * ARA&A 54, 529); halo 10¹² M☉ (the value used by van der Marel et al. 2012). Circular speed at the Sun's radius
 * R₀ = 8.18 kpc (GRAVITY Collaboration 2019) comes out ≈ 225 km/s.
 * Andromeda (M31): disk scale length 5.3 kpc (Courteau et al. 2011, ApJ 739, 20), bulge ≈ 2.5, disk ≈ 7 × 10¹⁰ M☉;
 * halo 1.5 × 10¹² M☉ so the M31 : MW mass ratio defaults to 1.5; circular speed ≈ 250 km/s. */
export const MODELS = {
  mw:   { name: "Milky Way", Mb: 1.0, ab: 0.6, Md: 5.0, bd: 3.0, Mh: 100, ah: 30, Rd: 2.6, Rmax: 17, hz: 0.3 },
  m31:  { name: "Andromeda", Mb: 2.5, ab: 1.0, Md: 7.0, bd: 5.0, Mh: 150, ah: 35, Rd: 5.3, Rmax: 30, hz: 0.4 },
  sp:   { name: "Spiral",    Mb: 0.8, ab: 0.6, Md: 4.0, bd: 3.0, Mh: 60,  ah: 22, Rd: 3.0, Rmax: 20, hz: 0.3 },
  // Toomre-style disks for the Antennae and the Mice: lighter, more compact halos (as in Toomre & Toomre's point
  // masses) let the long tails escape; massive extended halos make tails shorter (Dubinski, Mihos & Hernquist 1996).
  tt:   { name: "Spiral",    Mb: 0.8, ab: 0.5, Md: 4.0, bd: 2.5, Mh: 18,  ah: 12, Rd: 3.2, Rmax: 22, hz: 0.3 },
  cmp:  { name: "Compact",   Mb: 0.8, ab: 0.5, Md: 1.2, bd: 1.5, Mh: 14,  ah: 10, Rd: 1.4, Rmax: 7,  hz: 0.25 },
};

export function scaledModel(base, massScale) {
  // Scale masses and (weakly) sizes: at fixed surface density R ∝ M^(1/2); halos r ∝ M^(1/3).
  const s = massScale, ls = Math.sqrt(s), hs = Math.cbrt(s);
  return { ...base, Mb: base.Mb * s, Md: base.Md * s, Mh: base.Mh * s,
    ab: base.ab * ls, bd: base.bd * ls, Rd: base.Rd * ls, Rmax: base.Rmax * ls, ah: base.ah * hs };
}
export const totalMass = (g) => g.Mb + g.Md + g.Mh;

/* |acceleration| from all three components at radius r (spherical). */
export function gOf(g, r) {
  const hb = g.Mb / ((r + g.ab) * (r + g.ab));
  const pd = g.Md * r / Math.pow(r * r + g.bd * g.bd, 1.5);
  const hh = g.Mh / ((r + g.ah) * (r + g.ah));
  return hb + pd + hh;
}
export const vCirc = (g, r) => Math.sqrt(r * gOf(g, r));
export function potential(g, r) {
  return -g.Mb / (r + g.ab) - g.Md / Math.sqrt(r * r + g.bd * g.bd) - g.Mh / (r + g.ah);
}
/* Halo density (Hernquist), with a 1 kpc floor on r to avoid the central cusp in the friction formula. */
function rhoHalo(g, r) {
  r = Math.max(r, 1);
  return g.Mh * g.ah / (2 * Math.PI * r * Math.pow(r + g.ah, 3));
}
/* Enclosed mass of the whole model (used for velocity dispersion estimates). */
function mEnc(g, r) { return r * r * gOf(g, r); }

/* ------------------------------------------------------------------ orientations */
/* A disk's normal is the +y axis tilted by inclination i about an axis lying in the orbital (xz) plane at angle ω
 * from the +x axis (the initial line between the galaxies). With the relative orbit's angular momentum along +y,
 * i = 0 is a prograde disk (spinning with the orbit) and a retrograde disk has its spin flipped. */
export function diskBasis(incDeg, omegaDeg) {
  const i = incDeg * Math.PI / 180, w = omegaDeg * Math.PI / 180;
  const ax = [Math.cos(w), 0, Math.sin(w)];
  const rot = (v) => { // Rodrigues rotation of v about ax by i
    const c = Math.cos(i), s = Math.sin(i), d = ax[0] * v[0] + ax[1] * v[1] + ax[2] * v[2];
    const cx = [ax[1] * v[2] - ax[2] * v[1], ax[2] * v[0] - ax[0] * v[2], ax[0] * v[1] - ax[1] * v[0]];
    return [v[0] * c + cx[0] * s + ax[0] * d * (1 - c), v[1] * c + cx[1] * s + ax[1] * d * (1 - c), v[2] * c + cx[2] * s + ax[2] * d * (1 - c)];
  };
  return { ex: rot([1, 0, 0]), ey: rot([0, 1, 0]), ez: rot([0, 0, 1]) }; // ey = disk normal
}

/* ------------------------------------------------------------------ the two-core orbit */
const LN_LAMBDA = 3.0;    // Coulomb logarithm, typical for galaxy pairs (Binney & Tremaine 2008 §8.1)
function erf(x) {         // Abramowitz & Stegun 7.1.26, |error| < 1.5e-7
  const t = 1 / (1 + 0.3275911 * x);
  return 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
}
/* Chandrasekhar drag coefficient: a_df = −C · v_rel for a body of mass M moving at speed v through host h at distance r. */
function dragCoef(M, h, r, v, boost) {
  const sigma = vCirc(h, Math.max(r, 1)) / Math.SQRT2;       // isothermal-sphere estimate of the dispersion
  const X = v / (Math.SQRT2 * sigma);
  const f = erf(X) - 2 * X / Math.sqrt(Math.PI) * Math.exp(-X * X);
  return boost * 4 * Math.PI * M * LN_LAMBDA * rhoHalo(h, r) * f / Math.max(v * v * v, 1e-6);
}
/* Mutual pull between the two extended galaxies (equal and opposite): the mean of each galaxy's mass feeling
 * the other's potential at the centre–centre distance. Point masses at large r, softened when halos overlap. */
const mutualF = (A, B, r) => 0.5 * (totalMass(A) * gOf(B, r) + totalMass(B) * gOf(A, r));

export function mutualPotential(A, B, r) { // ∫_r^∞ F dr' per unit reduced mass, numerically (for parabolic starts)
  let s = 0, x = r;
  const mu = totalMass(A) * totalMass(B) / (totalMass(A) + totalMass(B));
  for (let k = 0; k < 4000; k++) { const dx = Math.max(0.05, x * 0.004); s += mutualF(A, B, x + dx / 2) * dx; x += dx; if (x > 20000) break; }
  s += totalMass(A) * totalMass(B) / x;
  return -s / mu;
}

/* Integrate the cores. setup: {A, B, d0, vr, vt, tEnd, dt, df}. Returns tracks sampled at every step. */
export function integrateCores(setup, opts = {}) {
  const { A, B, dt } = setup;
  const MA = totalMass(A), MB = totalMass(B), Mt = MA + MB;
  const nSteps = Math.ceil(setup.tEnd / dt);
  // Relative orbit starts with B at +x (distance d0), approaching with radial speed vr (<0), tangential along −z.
  const rx = setup.d0, rv = [setup.vr, 0, -setup.vt];
  const pA = [-rx * MB / Mt, 0, 0], pB = [rx * MA / Mt, 0, 0];
  const vA = rv.map(c => -c * MB / Mt), vB = rv.map(c => c * MA / Mt);
  const keep = !opts.light;
  const pos = keep ? new Float32Array((nSteps + 1) * 6) : null;
  const sep = keep ? new Float32Array(nSteps + 1) : null;
  const energy = keep ? new Float32Array(nSteps + 1) : null;
  let rPeri = Infinity, tPeri = null, prevR = setup.d0, falling = true, tMerge = null, peris = [];
  const acc = (out) => {
    const dx = pB[0] - pA[0], dy = pB[1] - pA[1], dz = pB[2] - pA[2];
    const r = Math.hypot(dx, dy, dz) + 1e-9;
    const F = mutualF(A, B, r);
    const ux = dx / r, uy = dy / r, uz = dz / r;
    const wx = vA[0] - vB[0], wy = vA[1] - vB[1], wz = vA[2] - vB[2];
    const w = Math.hypot(wx, wy, wz);
    const cA = setup.df ? dragCoef(MA, B, r, w, setup.df) : 0;   // A ploughing through B's halo
    const cB = setup.df ? dragCoef(MB, A, r, w, setup.df) : 0;   // B ploughing through A's halo
    // Friction acts on the relative velocity; split so total momentum stays zero.
    const c = (cA * MA + cB * MB) / Mt; // effective drag on the relative motion, per unit reduced mass weighting
    out[0] = F / MA * ux - c * wx * MB / Mt; out[1] = F / MA * uy - c * wy * MB / Mt; out[2] = F / MA * uz - c * wz * MB / Mt;
    out[3] = -F / MB * ux + c * wx * MA / Mt; out[4] = -F / MB * uy + c * wy * MA / Mt; out[5] = -F / MB * uz + c * wz * MA / Mt;
    return r;
  };
  const a = new Float64Array(6);
  const record = (k) => {
    const r = Math.hypot(pB[0] - pA[0], pB[1] - pA[1], pB[2] - pA[2]);
    if (keep) {
      pos.set([pA[0], pA[1], pA[2], pB[0], pB[1], pB[2]], k * 6); sep[k] = r;
      const w2 = (vA[0] - vB[0]) ** 2 + (vA[1] - vB[1]) ** 2 + (vA[2] - vB[2]) ** 2;
      energy[k] = 0.5 * w2 + mutualPotentialFast(r);            // specific orbital energy of the relative orbit
    }
    return r;
  };
  // Tabulated mutual potential for the energy read-out
  const potTab = [], potR = [];
  if (keep) for (let k = 0; k <= 200; k++) { const r = 0.5 * Math.pow(4000, k / 200); potR.push(r); potTab.push(mutualPotential(A, B, r)); }
  function mutualPotentialFast(r) {
    if (!keep) return 0;
    const u = Math.log(Math.max(r, 0.5) / 0.5) / Math.log(4000) * 200;
    const i = Math.min(199, Math.max(0, Math.floor(u))), f = Math.min(1, u - i);
    return potTab[i] * (1 - f) + potTab[i + 1] * f;
  }
  record(0);
  acc(a);
  let calm = 0;
  for (let k = 1; k <= nSteps; k++) {
    for (let j = 0; j < 3; j++) { vA[j] += a[j] * dt / 2; vB[j] += a[j + 3] * dt / 2; }
    for (let j = 0; j < 3; j++) { pA[j] += vA[j] * dt; pB[j] += vB[j] * dt; }
    acc(a);
    for (let j = 0; j < 3; j++) { vA[j] += a[j] * dt / 2; vB[j] += a[j + 3] * dt / 2; }
    const r = record(k);
    if (falling && r > prevR) {                       // passed a pericentre at the previous step
      peris.push({ t: (k - 1) * dt, r: prevR });
      if (tPeri === null) { tPeri = (k - 1) * dt; rPeri = prevR; if (opts.stopAtPeri) return { rPeri, tPeri }; }
      falling = false;
    } else if (!falling && r < prevR) falling = true;
    if (tMerge === null) {                            // merged: centres stay within 3 kpc for 100 Myr
      if (r < 3 && tPeri !== null) { calm += dt; if (calm > 100 / T_MYR) tMerge = k * dt - calm; } else calm = 0;
    }
    prevR = r;
    if (opts.stopAfter && k * dt > opts.stopAfter) break;
  }
  if (tPeri === null) { rPeri = prevR; }
  return { nSteps, dt, pos, sep, energy, rPeri, tPeri, tMerge, peris, MA, MB };
}

/* Tangential speed that gives the requested first-pericentre distance (bisection; pericentre grows with vt). */
export function solveVt(setup, target) {
  if (target <= 0.01) return 0;
  let lo = 0, hi = Math.max(0.5, Math.abs(setup.vr) * 2 + 1.0);
  const peri = (vt) => integrateCores({ ...setup, vt, dt: setup.dt * 2 }, { light: true, stopAtPeri: true }).rPeri;
  if (peri(hi) < target) return hi;
  for (let it = 0; it < 26; it++) {
    const mid = (lo + hi) / 2;
    if (peri(mid) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/* ------------------------------------------------------------------ acceleration on a test star (CPU version) */
export function starAccel(A, B, pA, pB, x, out) {
  let ax = 0, ay = 0, az = 0;
  for (const [g, p] of [[A, pA], [B, pB]]) {
    const dx = x[0] - p[0], dy = x[1] - p[1], dz = x[2] - p[2];
    const r = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-6;
    const k = gOf(g, r) / r;
    ax -= k * dx; ay -= k * dy; az -= k * dz;
  }
  out[0] = ax; out[1] = ay; out[2] = az;
}

/* ------------------------------------------------------------------ initial conditions for the stars */
/* Isotropic Jeans velocity dispersion of the bulge in the total potential:  σ²(r) = (1/ρ_b) ∫_r^∞ ρ_b G M(r')/r'² dr'. */
function bulgeSigmaTable(g) {
  const rs = [], s2 = [];
  const rho = (r) => g.ab / (2 * Math.PI * r * Math.pow(r + g.ab, 3));
  for (let k = 0; k <= 80; k++) {
    const r = 0.02 * Math.pow(2000, k / 80);
    let I = 0, x = r;
    for (let j = 0; j < 400; j++) { const dx = x * 0.03; I += rho(x + dx / 2) * gOf(g, x + dx / 2) * dx; x += dx; }
    rs.push(r); s2.push(I / rho(r));
  }
  return (r) => {
    const u = Math.log(Math.max(r, 0.02) / 0.02) / Math.log(2000) * 80;
    const i = Math.min(79, Math.floor(u)), f = Math.min(1, u - i);
    return Math.sqrt(s2[i] * (1 - f) + s2[i + 1] * f);
  };
}

/* Population codes (stored per particle; colour and size are chosen in the renderer):
 *   0 old disk · 1 young (blue) disk · 2 bulge · 3 star-forming knot · 4 dust tracer · 5 the Sun */
export const POP = { OLD: 0, YOUNG: 1, BULGE: 2, KNOT: 3, DUST: 4, SUN: 5 };

/* Build N stars for galaxy g centred at (p, v) with disk basis `basis` and spin sign s (+1 prograde, −1 retro).
 * Writes into pos/vel (4 floats per star, starting at star index i0). Returns metadata arrays. */
export function sampleGalaxy(g, N, i0, p, v, basis, spin, R, pos, vel, pop, hostArr, host, sunR, sunPhi = 0) {
  const sig = bulgeSigmaTable(g);
  const fb = g.Mb / (g.Mb + g.Md);
  const { ex, ey, ez } = basis;
  let sunIndex = -1;
  for (let n = 0; n < N; n++) {
    const i = i0 + n;
    let lx, ly, lz, ux, uy, uz, kind;
    if (sunR && n === 0) {
      // The Sun: R₀ = 8.18 kpc (GRAVITY Collaboration 2019), 20 pc above the plane, on a circular orbit.
      const vc = vCirc(g, sunR), c = Math.cos(sunPhi), s = Math.sin(sunPhi);
      lx = sunR * c; ly = 0.02; lz = sunR * s; ux = vc * s; uy = 0; uz = -vc * c; kind = POP.SUN; sunIndex = i;
    } else if (R() < fb) {
      // Hernquist bulge: invert M(<r)/M = r²/(r+a)²  ⇒  r = a √q / (1 − √q)
      const q = Math.sqrt(R() * 0.86);                    // truncated at r ≈ 13 a (the outer envelope would be a stellar halo)
      const r = g.ab * q / (1 - q);
      const ct = 2 * R() - 1, st = Math.sqrt(1 - ct * ct), ph = 6.2831853 * R();
      lx = r * st * Math.cos(ph); ly = r * ct * 0.8; lz = r * st * Math.sin(ph);   // slightly flattened
      const s = sig(r), vesc = Math.sqrt(-2 * potential(g, r)) * 0.9;
      do { ux = s * R.gauss(); uy = s * R.gauss(); uz = s * R.gauss(); } while (ux * ux + uy * uy + uz * uz > vesc * vesc);
      // a little net rotation, as real bulges have
      const vrot = 0.25 * vCirc(g, Math.hypot(lx, lz)), rr = Math.hypot(lx, lz) + 1e-6;
      ux += vrot * lz / rr; uz -= vrot * lx / rr;
      kind = POP.BULGE;
    } else {
      // Exponential disk Σ ∝ e^(−R/Rd): radius from the Gamma(2) distribution, truncated at Rmax
      let r;
      do { r = -g.Rd * Math.log(R() * R() + 1e-12); } while (r > g.Rmax || r < 0.35);
      const ph = 6.2831853 * R();
      const c = Math.cos(ph), s = Math.sin(ph);
      const vc = vCirc(g, r), Om = vc / r;
      const hz = g.hz * (0.6 + 0.4 * r / g.Rd);                // mild flare
      lx = r * c; lz = r * s; ly = hz * R.gauss() * 0.7;
      const disp = 0.035 + 0.05 * Math.exp(-r / g.Rd);        // ≈ 7–18 km/s random motions
      ux = vc * s + disp * R.gauss(); uz = -vc * c + disp * R.gauss();
      uy = Om * hz * 0.7 * R.gauss();                          // vertical equilibrium in a spherical potential
      const young = R() < 0.25 + 0.5 * Math.min(1, r / (3 * g.Rd));
      kind = young ? POP.YOUNG : POP.OLD;
      if (r < 2.4 * g.Rd && R() < 0.07) { kind = POP.DUST; ly *= 0.3; uy *= 0.3; }   // dust sits in a thinner layer
      else if (young && r > 0.8 * g.Rd && R() < 0.035) kind = POP.KNOT;
    }
    ux *= spin; uz *= spin;                                   // retrograde: reverse the rotation
    if (kind === POP.BULGE) { /* bulge rotation also flips with spin (already multiplied) */ }
    const X = p[0] + lx * ex[0] + ly * ey[0] + lz * ez[0];
    const Y = p[1] + lx * ex[1] + ly * ey[1] + lz * ez[1];
    const Z = p[2] + lx * ex[2] + ly * ey[2] + lz * ez[2];
    const VX = v[0] + ux * ex[0] + uy * ey[0] + uz * ez[0];
    const VY = v[1] + ux * ex[1] + uy * ey[1] + uz * ez[1];
    const VZ = v[2] + ux * ex[2] + uy * ey[2] + uz * ez[2];
    pos[i * 4] = X; pos[i * 4 + 1] = Y; pos[i * 4 + 2] = Z; pos[i * 4 + 3] = kind;
    vel[i * 4] = VX; vel[i * 4 + 1] = VY; vel[i * 4 + 2] = VZ; vel[i * 4 + 3] = host;
    pop[i] = kind; hostArr[i] = host;
  }
  return sunIndex;
}

/* ------------------------------------------------------------------ one complete scenario */
/* cfg: { A:{model, massScale, inc, omega, spin}, B:{...}, d0, vr (or energy e), rPeri, tEnd (units), dt, df } */
export function buildScenario(cfg) {
  const A = scaledModel(MODELS[cfg.A.model], cfg.A.massScale || 1);
  const B = scaledModel(MODELS[cfg.B.model], cfg.B.massScale || 1);
  const base = { A, B, d0: cfg.d0, dt: cfg.dt, tEnd: cfg.tEnd, df: cfg.df };
  let vr = cfg.vr;
  if (vr == null) { // start on an orbit with energy e × (escape energy): e = 1 parabolic, e > 1 hyperbolic
    const phi = mutualPotential(A, B, cfg.d0);
    vr = -Math.sqrt(Math.max(0, 2 * -phi * (cfg.energy ?? 1)));
  }
  const setup = { ...base, vr, vt: 0 };
  // Keep the total speed fixed while solving for the impact parameter when an energy is given
  let vt;
  if (cfg.vr == null) {
    const vtot = -vr;
    let lo = 0, hi = vtot * 0.999;
    const peri = (t) => integrateCores({ ...setup, vr: -Math.sqrt(vtot * vtot - t * t), vt: t, dt: cfg.dt * 2 }, { light: true, stopAtPeri: true }).rPeri;
    if (cfg.rPeri <= 0.01) vt = 0;
    else { for (let it = 0; it < 26; it++) { const m = (lo + hi) / 2; if (peri(m) < cfg.rPeri) lo = m; else hi = m; } vt = (lo + hi) / 2; }
    setup.vr = -Math.sqrt(vtot * vtot - vt * vt);
  } else vt = solveVt(setup, cfg.rPeri);
  setup.vt = vt;
  const cores = integrateCores(setup);
  return { A, B, setup, cores };
}

export function makeStars(scn, cfg, N, seed = 7) {
  const R = rng(seed);
  const pos = new Float32Array(N * 4), vel = new Float32Array(N * 4);
  const pop = new Uint8Array(N), host = new Uint8Array(N);
  const { A, B, cores } = scn;
  const lumA = A.Mb + A.Md, lumB = B.Mb + B.Md;
  const NA = Math.round(N * lumA / (lumA + lumB)), NB = N - NA;
  const pA = [cores.pos[0], cores.pos[1], cores.pos[2]], pB = [cores.pos[3], cores.pos[4], cores.pos[5]];
  const MA = cores.MA, MB = cores.MB, Mt = MA + MB;
  const rv = [scn.setup.vr, 0, -scn.setup.vt];
  const vA = rv.map(c => -c * MB / Mt), vB = rv.map(c => c * MA / Mt);
  const bA = diskBasis(cfg.A.inc, cfg.A.omega), bB = diskBasis(cfg.B.inc, cfg.B.omega);
  // Put the Sun where Andromeda appears at Galactic longitude l = 121.2° today (M31 is at l = 121.2°, b = −21.6°).
  // In the disk frame the direction of longitude l lies at azimuth φ_sun + π + spin·l (l = 90° is along the Sun’s motion).
  const m = [pB[0] - pA[0], pB[1] - pA[1], pB[2] - pA[2]];
  const phiM = Math.atan2(m[0] * bA.ez[0] + m[1] * bA.ez[1] + m[2] * bA.ez[2], m[0] * bA.ex[0] + m[1] * bA.ex[1] + m[2] * bA.ex[2]);
  const sunPhi = phiM - Math.PI - cfg.A.spin * 121.2 * Math.PI / 180;
  const sun = sampleGalaxy(A, NA, 0, pA, vA, bA, cfg.A.spin, R, pos, vel, pop, host, 0, cfg.A.sun ? 8.18 : 0, sunPhi);
  sampleGalaxy(B, NB, NA, pB, vB, bB, cfg.B.spin, R, pos, vel, pop, host, 1, 0);
  // Leapfrog start: store v at t = −dt/2 so each GPU step is  v += a(x)·dt ; x += v·dt  (kick–drift, symplectic)
  const a = [0, 0, 0], dt = scn.setup.dt;
  for (let i = 0; i < N; i++) {
    starAccel(A, B, pA, pB, [pos[i * 4], pos[i * 4 + 1], pos[i * 4 + 2]], a);
    vel[i * 4] -= a[0] * dt / 2; vel[i * 4 + 1] -= a[1] * dt / 2; vel[i * 4 + 2] -= a[2] * dt / 2;
  }
  return { pos, vel, pop, host, sunIndex: sun, NA, NB, basisA: bA, basisB: bB };
}

/* ------------------------------------------------------------------ how far the stars spread (for camera framing) */
/* A few hundred CPU test stars integrated with the same leapfrog. Returns, every `every` steps, the 80th-percentile
 * distance of disk stars from the pair's midpoint — tails included — so the camera can keep them in shot. */
export function tracerExtent(scn, cfg, n = 240, every = 8, pct = 0.93) {
  const st = makeStars(scn, cfg, n, 4242);
  const c = scn.cores, A = scn.A, B = scn.B;
  const dt2 = scn.setup.dt * 2;                      // tracers take double steps: outer orbits are slow
  const out = new Float32Array(Math.floor(c.nSteps / every) + 1);
  const P = Float64Array.from(st.pos), V = Float64Array.from(st.vel), keep = [];
  for (let i = 0; i < n; i++) if (st.pop[i] !== POP.BULGE) keep.push(i);
  // velocities were set half a (single) step back; re-centre them for the double step
  const d = new Float64Array(keep.length);
  const g = (m, r) => gOf(m, r) / r;
  for (let k = 0; k <= c.nSteps; k += 2) {
    const j = k * 6;
    const ax = c.pos[j], ay = c.pos[j + 1], az = c.pos[j + 2], bx = c.pos[j + 3], by = c.pos[j + 4], bz = c.pos[j + 5];
    if (k % every === 0) {
      const mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2;
      for (let q = 0; q < keep.length; q++) { const i = keep[q] * 4; d[q] = Math.hypot(P[i] - mx, P[i + 1] - my, P[i + 2] - mz); }
      d.sort();
      out[k / every] = d[Math.floor(keep.length * pct)];
    }
    for (let q = 0; q < keep.length; q++) {
      const i = keep[q] * 4;
      let dx = P[i] - ax, dy = P[i + 1] - ay, dz = P[i + 2] - az;
      let r = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-6, f = g(A, r);
      let fx = -f * dx, fy = -f * dy, fz = -f * dz;
      dx = P[i] - bx; dy = P[i + 1] - by; dz = P[i + 2] - bz;
      r = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-6; f = g(B, r);
      fx -= f * dx; fy -= f * dy; fz -= f * dz;
      V[i] += fx * dt2; V[i + 1] += fy * dt2; V[i + 2] += fz * dt2;
      P[i] += V[i] * dt2; P[i + 1] += V[i + 1] * dt2; P[i + 2] += V[i + 2] * dt2;
    }
  }
  for (let k = 0; k < out.length; k++) if (!out[k]) out[k] = out[k - 1] || 0;   // odd-index gaps
  return { every, ext: out };
}
