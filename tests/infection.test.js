import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadBodyParts } from '../src/scenes/bodyMeshes.js';
import { buildBody, LANDMARKS } from '../src/scenes/body.js';
import { INFECTION_STAGES } from '../src/scenes/bodyInfection.js';
import { DIVES } from '../src/data/dives.js';
import { getCard } from '../src/data/cards.js';

const bytes = readFileSync(new URL('../assets/anatomy/body.glb', import.meta.url));
const fileFetch = async () => ({ ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('the infection on the body (immune dive)', async () => {
  await loadBodyParts({ fetchImpl: fileFetch });
  const step = DIVES.find((d) => d.id === 'immune').steps[0];

  it('is asked for by the immune dive’s first step, which frames the left arm', () => {
    expect(step.scene).toBe('body');
    expect(step.options).toEqual({ infection: true });
    expect(step.frameMeters).toBeLessThan(1);
    // No other step asks for it.
    const others = DIVES.flatMap((d) => d.steps).filter((s) => s !== step && s.options?.infection);
    expect(others).toEqual([]);
  });

  it('puts the cut on the skin of the left forearm, between elbow and wrist', () => {
    const built = buildBody({ systems: ['immune'], infection: true });
    const wound = built.focus;
    const [elbow, wrist] = LANDMARKS.bones['left radius'];
    expect(wound[0]).toBeGreaterThan(0);
    expect(wound[1]).toBeLessThan(elbow[1]);
    expect(wound[1]).toBeGreaterThan(wrist[1]);
    // On the surface: a few centimeters from the bone's axis, not inside it.
    const axis = elbow.map((x, i) => x + (wrist[i] - x) * 0.62);
    expect(dist(wound, axis)).toBeGreaterThan(0.012);
    expect(dist(wound, axis)).toBeLessThan(0.06);
    built.dispose();
  });

  it('steps from the cut to the cleared infection, each stage showing its cells', () => {
    const built = buildBody({ systems: ['immune'], infection: true, reducedMotion: true });
    const c = built.controls;
    expect(c.max).toBe(INFECTION_STAGES.length - 1);
    const at = (v) => (c.set(v), built.infection.shown());
    const cut = at(0);
    expect(cut.bacteria).toBeGreaterThan(10);
    expect(cut.neutrophils).toBe(0);
    expect(at(1.7).neutrophils).toBeGreaterThan(10);
    expect(at(2.5).dendritic).toBeGreaterThan(0);
    const anti = at(4.3);
    expect(anti.antibodies).toBeGreaterThan(10);
    expect(anti.dendritic).toBe(0);
    const cleared = at(5);
    expect(cleared.bacteria).toBe(0);
    expect(cleared.antibodies).toBe(0);
    expect(cleared.memory).toBeGreaterThan(0);
    expect(c.readout).toContain('Memory cells');
    built.dispose();
  });

  it('swells the left armpit nodes while matching cells multiply, then shrinks them back', () => {
    const built = buildBody({ systems: ['immune'], infection: true, reducedMotion: true });
    const armpit = [];
    built.root.traverse((o) => o.userData.label === 'Lymph node (armpit)' && armpit.push(o));
    const left = armpit.filter((o) => o.position.x > 0);
    const right = armpit.filter((o) => o.position.x < 0);
    expect(left.length).toBeGreaterThan(0);
    const size = () => [left[0].scale.x, right[0].scale.x];
    built.controls.set(1);
    const [before, otherBefore] = size();
    built.controls.set(3.9);
    const [swollen, other] = size();
    built.controls.set(5);
    const [after] = size();
    expect(swollen).toBeGreaterThan(before * 1.5);
    expect(other).toBe(otherBefore); // the other armpit drains a different arm
    expect(after).toBeLessThan(swollen);
    built.dispose();
  });

  it('opens a real card from everything it adds', () => {
    const built = buildBody({ systems: ['immune'], infection: true });
    const ids = new Set();
    built.infection.group.traverse((o) => o.userData.cardId && ids.add(o.userData.cardId));
    expect([...ids].sort()).toEqual(['antibody', 'bacteria', 'dendritic-cell', 'inflammation', 'lymphatic-vessel', 'memory-b-cell', 'neutrophil']);
    for (const id of ids) expect(getCard(id), id).toBeTruthy();
    built.dispose();
  });

  it('plays on its own, and holds on the antibody stage with reduced motion', () => {
    const playing = buildBody({ systems: ['immune'], infection: true });
    expect(playing.controls.playing).toBe(true);
    const v = playing.controls.value;
    playing.update(1);
    expect(playing.controls.value).toBeGreaterThan(v);
    playing.dispose();
    const still = buildBody({ systems: ['immune'], infection: true, reducedMotion: true });
    expect(still.controls.playing).toBe(false);
    expect(still.controls.value).toBe(4.5);
    still.dispose();
  });

  it('leaves every other body step as it was', () => {
    const plain = buildBody({ systems: ['immune'] });
    expect(plain.controls).toBeUndefined();
    expect(plain.infection).toBeNull();
    plain.dispose();
  });
});
