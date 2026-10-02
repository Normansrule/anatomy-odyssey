import { describe, it, expect } from 'vitest';
import { DIVES, getDive, builtDives, locateStep } from '../src/data/dives.js';
import { LIBRARY } from '../src/data/library.js';
import { QUIZZES } from '../src/data/quizzes.js';
import { CARDS, PLANNED_CARDS, getCard } from '../src/data/cards.js';
import { REFERENCES } from '../src/data/references.js';
import { computeUsedBy, validateDive, madeOf, sideTripPath } from '../src/science/graph.js';
import { SCENES, SCENE_IDS } from '../src/scenes/registry.js';

const cardIds = CARDS.map((c) => c.id);

describe('dives', () => {
  it.each(builtDives().map((d) => d.id))('the %s dive (and its side trips) satisfies every engine invariant', (id) => {
    expect(validateDive(getDive(id), { sceneIds: SCENE_IDS, cardIds })).toEqual([]);
  });
  it('every built dive has narration for the tour on every step', () => {
    for (const d of builtDives()) for (const s of d.steps) expect(s.narration, `${d.id}/${s.id}`).toBeTruthy();
  });
  it('side trips run from the branch step into the shared nucleus and then DNA', () => {
    const muscular = getDive('muscular');
    const i = muscular.steps.findIndex((s) => s.branch);
    const path = sideTripPath(muscular, i);
    expect(path.map((s) => s.id)).toEqual(['body', 'muscle', 'fascicle', 'muscle-fiber', 'nucleus', 'dna']);
    expect(path.slice(-2).every((s) => s.sideTrip)).toBe(true);
  });
  it('validateDive catches a frame that grows', () => {
    const bad = structuredClone(getDive('skeletal'));
    bad.steps[3].frameMeters = 10;
    expect(validateDive(bad, { sceneIds: SCENE_IDS, cardIds }).join()).toMatch(/frame must shrink/);
  });
  it('every planned dive only names library entries that exist', () => {
    const ids = LIBRARY.map((e) => e.id);
    for (const d of DIVES.filter((x) => x.status === 'planned')) for (const s of d.shared) expect(ids).toContain(s);
  });
  it('the nervous dive runs brain → neuron → synapse → glutamate, with two side trips', () => {
    const d = getDive('nervous');
    expect(d.steps.map((s) => s.id)).toEqual(['body', 'brain', 'neuron', 'synapse', 'neurotransmitter']);
    expect(sideTripPath(d, 2).slice(-2).map((s) => s.id)).toEqual(['nucleus', 'dna']);
    expect(sideTripPath(d, 3).at(-1).id).toBe('lipid-bilayer');
  });
  it('the respiratory dive ends at the shared gas molecules via shared hemoglobin', () => {
    const d = getDive('respiratory');
    expect(d.steps.map((s) => s.id)).toEqual(['body', 'lungs', 'alveoli', 'gas-exchange', 'hemoglobin', 'o2-co2']);
    expect(d.steps.at(-2).shared).toBe('hemoglobin');
    expect(d.steps.at(-1).shared).toBe('o2-co2');
  });
});

describe('shared library reuse', () => {
  const usedBy = computeUsedBy();
  it('DNA and the nucleus are reached by the skeletal, muscular, nervous and immune dives', () => {
    for (const id of ['dna', 'nucleus']) {
      expect(usedBy.get(id).map((u) => u.diveId).sort()).toEqual(['immune', 'muscular', 'nervous', 'skeletal']);
      const how = Object.fromEntries(usedBy.get(id).map((u) => [u.diveId, u.via]));
      expect(how).toEqual({ skeletal: 'main', muscular: 'side-trip', immune: 'side-trip', nervous: 'side-trip' });
    }
  });
  it('hemoglobin is on the main path of both the circulatory and respiratory dives', () => {
    const users = usedBy.get('hemoglobin');
    expect(users.map((u) => u.diveId).sort()).toEqual(['circulatory', 'respiratory']);
    expect(users.every((u) => u.via === 'main')).toBe(true);
  });
  it('the lipid bilayer is reached by side trips from the circulatory and nervous dives', () => {
    const users = usedBy.get('lipid-bilayer');
    expect(users.map((u) => u.diveId).sort()).toEqual(['circulatory', 'nervous']);
    expect(users.every((u) => u.via === 'side-trip')).toBe(true);
  });
  it('every dive is built; nothing is left planned', () => {
    expect(DIVES.filter((d) => d.status !== 'built')).toEqual([]);
  });
  it('built library entries point at real scenes and cards', () => {
    for (const e of LIBRARY.filter((x) => x.status === 'built')) {
      expect(SCENE_IDS).toContain(e.scene);
      expect(getCard(e.card)).toBeTruthy();
    }
  });
  it('"made of" links resolve, and planned entries have a short card', () => {
    expect(madeOf('nucleus').map((e) => e.id)).toContain('dna');
    for (const e of LIBRARY) for (const child of e.madeOf) expect(LIBRARY.find((x) => x.id === child)).toBeTruthy();
    for (const e of LIBRARY.filter((x) => x.status === 'planned')) expect(PLANNED_CARDS[e.id]).toBeTruthy();
  });
});

describe('cards', () => {
  it('every card is complete and cites real references', () => {
    for (const c of CARDS) {
      for (const f of ['title', 'size', 'what', 'why', 'expert']) expect(c[f], `${c.id}.${f}`).toBeTruthy();
      expect(c.refs.length, c.id).toBeGreaterThan(0);
      for (const r of c.refs) expect(REFERENCES[r], `${c.id} → ${r}`).toBeTruthy();
      expect(locateStep(c.home) ?? LIBRARY.find((e) => e.step?.id === c.home), `${c.id} home ${c.home}`).toBeTruthy();
    }
  });
  it('card ids are unique', () => {
    expect(new Set(cardIds).size).toBe(cardIds.length);
  });
});

describe('quizzes', () => {
  it('every built dive and module has four well-formed questions', () => {
    for (const d of builtDives()) {
      const qs = QUIZZES[d.id];
      expect(qs?.length, d.id).toBe(4);
      for (const q of qs) {
        expect(q.choices.length).toBeGreaterThanOrEqual(3);
        expect(q.answer).toBeGreaterThanOrEqual(0);
        expect(q.answer).toBeLessThan(q.choices.length);
        expect(q.explain).toBeTruthy();
      }
    }
  });
});

describe('scenes', () => {
  it.each(SCENE_IDS)('%s builds, updates, and every clickable part opens a real card', (id) => {
    const built = SCENES[id]({ reducedMotion: true });
    built.update?.(0.016, { reducedMotion: false });
    if (built.controls) {
      const c = built.controls;
      for (const v of [c.min, (c.min + c.max) / 2, c.max]) expect(typeof c.set(v)).toBe('string');
    }
    expect(built.metersPerUnit).toBeGreaterThan(0);
    const missing = new Set();
    let clickable = 0;
    built.root.traverse((o) => {
      if (o.userData.cardId) {
        clickable++;
        if (!getCard(o.userData.cardId)) missing.add(o.userData.cardId);
      }
    });
    expect([...missing]).toEqual([]);
    expect(clickable).toBeGreaterThan(0);
    built.dispose();
  });
  it('each step’s focus card (and side-trip card) is clickable in its own scene', () => {
    for (const s of builtDives().flatMap((d) => d.steps).filter((x) => x.focusCard || x.branch)) {
      const built = SCENES[s.scene]({ reducedMotion: true });
      const ids = new Set();
      built.root.traverse((o) => o.userData.cardId && ids.add(o.userData.cardId));
      if (s.focusCard) expect([...ids], s.id).toContain(s.focusCard);
      if (s.branch) {
        expect([...ids], s.id).toContain(s.branch.card);
        expect(built.branchFocus, `${s.id} branchFocus`).toBeTruthy();
      }
      built.dispose();
    }
  });
});
