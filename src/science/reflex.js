// The knee-jerk (patellar) reflex: how long the round trip takes.
// Tested in tests/reflex.test.js.

/**
 * A simple model of the monosynaptic stretch reflex. Path lengths are for an
 * adult leg (muscle spindle in the quadriceps to the L2–L4 spinal segments,
 * which sit near the bottom of the rib cage, and back). Speeds are typical for
 * large myelinated fibers: sensory (Ia) a little faster than motor.
 */
export const REFLEX = {
  sensoryPathM: 0.5,
  motorPathM: 0.5,
  vSensory: 65, // m/s
  vMotor: 55, // m/s
  synapticMs: 0.7, // one synapse in the spinal cord
  nmjMs: 1.0, // neuromuscular junction and the muscle's own electrical signal
};

/** Measured onset of the quadriceps response after the tap, in ms (about 18). */
export const MEASURED_PATELLAR_MS = 18;

/** Time for each leg of the trip and the total, in milliseconds. */
export function reflexLatency(p = REFLEX) {
  const sensoryMs = (p.sensoryPathM / p.vSensory) * 1000;
  const motorMs = (p.motorPathM / p.vMotor) * 1000;
  const totalMs = sensoryMs + p.synapticMs + motorMs + p.nmjMs;
  return { sensoryMs, synapseMs: p.synapticMs, motorMs, nmjMs: p.nmjMs, totalMs };
}

/** Typical simple reaction time to a sound, in ms: a deliberate response through the brain. */
export const VOLUNTARY_REACTION_MS = 160;
