// An illustrative model of a first and a second infection with the same germ.
// It is a teaching model, not a fitted one: the shape (a slow first response,
// a fast and much bigger second one) is the point, and the tests check that
// shape. Units: time in days; every population is relative.
//
//   P  pathogen            P' = rP(1 − P/K) − k_I·I·P − k_A·A·P
//   I  innate defenders    I' = a_I·S − d_I·I                       (neutrophils, macrophages)
//   B  responding B cells  B' = g·S·B·(1 − B/B_max) − d_B·(B − 1)
//   G  memory in training  G₁' = m·S·B − (n/τ)·G₁, Gᵢ' = (n/τ)·(Gᵢ₋₁ − Gᵢ)  (n stages: germinal centers take weeks)
//   R  memory B cells      R' = (n/τ)·G_n + g_M·S_M·R·(1 − R/R_max) (ready; multiply when the germ returns)
//   E  plasma cells        E' = e·S·B + e_M·S_M·R − d_E·E
//   A  antibody            A' = p·E − d_A·A                         (IgG half-life about 3 weeks)
// where S = P / (P + h) is how strongly naive B cells sense the germ (0 to 1),
// and S_M = P / (P + h_M) is the same for memory B cells, whose better-fitting
// receptors notice far fewer germs (h_M much smaller than h).

export const IMMUNE_PARAMS = {
  r: 2.0, // pathogen growth, per day (doubling in about 8 hours)
  K: 1e8, // carrying capacity of the infected tissue
  kI: 1.2, // innate killing
  kA: 4, // antibody killing (neutralizing and tagging for phagocytes)
  aI: 1.4,
  dI: 0.9, // innate cells turn over in about a day
  h: 1e4, // sensing threshold for naive B cells
  g: 1.0, // clonal expansion while the germ is sensed
  dB: 0.25,
  Bmax: 1e4,
  m: 0.1, // memory formed per responding B cell per day
  tau: 21, // mean days for memory to mature in germinal centers
  stages: 4, // maturation passes through this many stages, so almost none is ready within a week
  gM: 1.2, // memory cells multiply when the germ returns
  Rmax: 2000,
  e: 0.001,
  eM: 0.06, // memory B cells become plasma cells quickly
  hM: 50, // and respond to far fewer germs
  dE: 0.2,
  p: 1,
  dA: Math.LN2 / 21, // IgG half-life about 21 days
  P0: 1e3, // germs in each exposure
  t2: 90, // day of the second exposure
  days: 140,
  dt: 0.01,
};

export const IMMUNE_STATES = ['P', 'I', 'B', 'G', 'R', 'E', 'A'];
const N_G = IMMUNE_PARAMS.stages;

/** Detection threshold for antibody, in the model's units. */
export const ANTIBODY_DETECTABLE = 0.05;

// Internal state vector: [P, I, B, G₁ … G_n, R, E, A].
function derivatives(y, k) {
  const [P, I, B] = y;
  const G = y.slice(3, 3 + N_G);
  const [R, E, A] = y.slice(3 + N_G);
  const S = P / (P + k.h);
  const SM = P / (P + k.hM);
  const rate = N_G / k.tau;
  return [
    k.r * P * (1 - P / k.K) - k.kI * I * P - k.kA * A * P,
    k.aI * S - k.dI * I,
    k.g * S * B * (1 - B / k.Bmax) - k.dB * (B - 1),
    ...G.map((g, i) => (i === 0 ? k.m * S * B : rate * G[i - 1]) - rate * g),
    rate * G[N_G - 1] + k.gM * SM * R * (1 - R / k.Rmax),
    k.e * S * B + k.eM * SM * R - k.dE * E,
    k.p * E - k.dA * A,
  ];
}

/** Collapse the internal vector to the named states (G is the total in training). */
function named(y) {
  const G = y.slice(3, 3 + N_G).reduce((a, b) => a + b, 0);
  const [R, E, A] = y.slice(3 + N_G);
  return [y[0], y[1], y[2], G, R, E, A];
}

/**
 * Integrate the model with fourth-order Runge–Kutta (step k.dt days).
 * Returns { t, P, I, B, G, R, E, A, params }.
 */
export function simulateImmune(overrides = {}) {
  const k = { ...IMMUNE_PARAMS, ...overrides };
  let y = [k.P0, 0, 1, ...Array(N_G).fill(0), 0, 0, 0];
  const out = Object.fromEntries([['t', []], ...IMMUNE_STATES.map((n) => [n, []])]);
  out.params = k;
  const steps = Math.round(k.days / k.dt);
  const record = (t) => {
    out.t.push(t);
    const v = named(y);
    IMMUNE_STATES.forEach((name, i) => out[name].push(v[i]));
  };
  const add = (a, b, f) => a.map((v, i) => v + b[i] * f);
  let second = k.t2 == null;
  record(0);
  for (let s = 1; s <= steps; s++) {
    const t0 = (s - 1) * k.dt;
    if (!second && t0 >= k.t2 - 1e-9) {
      y = [y[0] + k.P0, ...y.slice(1)];
      second = true;
    }
    const k1 = derivatives(y, k);
    const k2 = derivatives(add(y, k1, k.dt / 2), k);
    const k3 = derivatives(add(y, k2, k.dt / 2), k);
    const k4 = derivatives(add(y, k3, k.dt), k);
    y = y.map((v, i) => Math.max(0, v + (k.dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])));
    if (y[0] < 1e-3) y[0] = 0; // the last germ is gone
    record(s * k.dt);
  }
  return out;
}

/** The model's state at day t (nearest recorded step). */
export function stateAt(sim, t) {
  const i = Math.max(0, Math.min(sim.t.length - 1, Math.round(t / sim.params.dt)));
  return Object.fromEntries(IMMUNE_STATES.map((n) => [n, sim[n][i]]));
}

/**
 * Summary of one exposure window [from, to): antibody peak and its day,
 * pathogen peak, the day antibody first clearly rises (above the detection
 * threshold and above twice what was left over), and the day the germ is gone.
 * Days are counted from `from`.
 */
export function responseSummary(sim, from, to, threshold = ANTIBODY_DETECTABLE) {
  let peakA = 0;
  let peakADay = 0;
  let peakP = 0;
  let detectDay = null;
  let clearedDay = null;
  const startA = sim.A[sim.t.findIndex((t) => t >= from)];
  for (let i = 0; i < sim.t.length; i++) {
    const t = sim.t[i];
    if (t < from || t >= to) continue;
    if (sim.A[i] > peakA) {
      peakA = sim.A[i];
      peakADay = t - from;
    }
    peakP = Math.max(peakP, sim.P[i]);
    if (detectDay === null && sim.A[i] > startA + threshold && sim.A[i] > 2 * startA) detectDay = t - from;
    if (clearedDay === null && t > from && sim.P[i] === 0) clearedDay = t - from;
  }
  return { peakA, peakADay, peakP, detectDay, clearedDay };
}
