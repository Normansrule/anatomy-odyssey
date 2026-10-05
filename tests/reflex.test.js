import { describe, it, expect } from 'vitest';
import { REFLEX, reflexLatency, MEASURED_PATELLAR_MS, VOLUNTARY_REACTION_MS } from '../src/science/reflex.js';
import { conductionVelocity } from '../src/science/equations.js';

describe('the knee-jerk reflex', () => {
  it('takes about 18 ms: 7.7 ms up, 0.7 ms across one synapse, 9.1 ms down, 1 ms into the muscle', () => {
    const t = reflexLatency();
    expect(t.sensoryMs).toBeCloseTo(7.69, 2);
    expect(t.motorMs).toBeCloseTo(9.09, 2);
    expect(t.totalMs).toBeCloseTo(18.5, 1);
    expect(Math.abs(t.totalMs - MEASURED_PATELLAR_MS)).toBeLessThan(2);
  });
  it('is nearly all travel time: the single synapse is under 5% of it', () => {
    const t = reflexLatency();
    expect(t.synapseMs / t.totalMs).toBeLessThan(0.05);
    expect((t.sensoryMs + t.motorMs) / t.totalMs).toBeGreaterThan(0.85);
  });
  it('a taller person (longer nerves) has a slower reflex, in proportion to the extra length', () => {
    const tall = reflexLatency({ ...REFLEX, sensoryPathM: 0.6, motorPathM: 0.6 });
    const base = reflexLatency();
    expect(tall.totalMs - base.totalMs).toBeCloseTo(0.1 / 65 * 1000 + 0.1 / 55 * 1000, 6);
  });
  it('the fiber speeds sit within what Hursh’s rule gives for 9–12 µm fibers', () => {
    expect(REFLEX.vMotor).toBeGreaterThanOrEqual(conductionVelocity(9));
    expect(REFLEX.vSensory).toBeLessThanOrEqual(conductionVelocity(12));
  });
  it('is several times faster than reacting on purpose', () => {
    expect(VOLUNTARY_REACTION_MS / reflexLatency().totalMs).toBeGreaterThan(8);
  });
});

describe('reflex scenes', async () => {
  const { reflexPaths } = await import('../src/scenes/reflexArc.js');
  const { grayShare, CORD_WIDTH_MM, CORD_DEPTH_MM } = await import('../src/scenes/spinalCord.js');
  it('the drawn nerve paths are about as long as the model assumes', () => {
    const { sensory, motor } = reflexPaths();
    for (const c of [sensory, motor]) {
      expect(c.getLength()).toBeGreaterThan(0.4);
      expect(c.getLength()).toBeLessThan(0.65);
    }
  });
  it('the cord slice is wider than deep and mostly white matter', () => {
    expect(CORD_WIDTH_MM).toBeGreaterThan(CORD_DEPTH_MM);
    expect(grayShare()).toBeGreaterThan(0.15);
    expect(grayShare()).toBeLessThan(0.4);
  });
});
