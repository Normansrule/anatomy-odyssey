// Relationships between dives and the shared library. Cross-links in the UI
// ("DNA appears in all these places") are computed here from the dive data,
// never hand-maintained, so they cannot drift out of date.

import { DIVES } from '../data/dives.js';
import { LIBRARY, libStep } from '../data/library.js';

/** Library ids a dive routes through: shared main steps, side trips, or a planned dive's list. */
export function sharedIdsOfDive(dive) {
  if (dive.status !== 'built') return dive.shared ?? [];
  const ids = [];
  for (const s of dive.steps) {
    if (s.shared) ids.push(s.shared);
    for (const v of s.branch?.via ?? []) ids.push(v);
  }
  return [...new Set(ids)];
}

/**
 * For each library id: which dives reach it, how (main path or side trip), and the dive's status.
 * @returns {Map<string, {diveId: string, title: string, status: string, via: 'main'|'side-trip'|'planned'}[]>}
 */
export function computeUsedBy(dives = DIVES, library = LIBRARY) {
  const map = new Map(library.map((e) => [e.id, []]));
  for (const dive of dives) {
    for (const id of sharedIdsOfDive(dive)) {
      if (!map.has(id)) map.set(id, []);
      let via = 'planned';
      if (dive.status === 'built') via = dive.steps.some((s) => s.shared === id) ? 'main' : 'side-trip';
      map.get(id).push({ diveId: dive.id, title: dive.title, status: dive.status, via });
    }
  }
  return map;
}

/** Library entries that lie directly below `id` ("made of"). */
export function madeOf(id, library = LIBRARY) {
  const entry = library.find((e) => e.id === id);
  if (!entry) return [];
  return entry.madeOf.map((childId) => library.find((e) => e.id === childId)).filter(Boolean);
}

/** The steps of a side trip taken from `dive.steps[index]`: the main path so far, then the library steps. */
export function sideTripPath(dive, index) {
  const branch = dive.steps[index]?.branch;
  if (!branch) return null;
  return [...dive.steps.slice(0, index + 1), ...branch.via.map((id) => libStep(id, { sideTrip: true }))];
}

function checkSequence(steps, where, problems, { sceneIds, cardIds, library }) {
  let prevFrame = Infinity;
  let prevTier = 0;
  const seen = new Set();
  steps.forEach((s, i) => {
    const at = `${where} step ${i} (${s.id})`;
    if (seen.has(s.id)) problems.push(`${at}: duplicate step id`);
    seen.add(s.id);
    if (!sceneIds.includes(s.scene)) problems.push(`${at}: unknown scene "${s.scene}"`);
    if (!cardIds.includes(s.card)) problems.push(`${at}: unknown card "${s.card}"`);
    if (s.focusCard && !cardIds.includes(s.focusCard)) problems.push(`${at}: unknown focus card "${s.focusCard}"`);
    if (i < steps.length - 1 && !s.focusCard && !steps[i + 1].sideTrip) problems.push(`${at}: needs a focusCard leading down`);
    if (!(s.frameMeters < prevFrame)) problems.push(`${at}: frame must shrink at every step`);
    if (!(s.tier > prevTier)) problems.push(`${at}: tier must increase at every step`);
    if (s.shared) {
      const entry = library.find((e) => e.id === s.shared);
      if (!entry) problems.push(`${at}: shared id "${s.shared}" missing from library`);
      else if (entry.scene !== s.scene) problems.push(`${at}: must use the library's scene "${entry.scene}"`);
    }
    prevFrame = s.frameMeters;
    prevTier = s.tier;
  });
}

/**
 * Check a built dive (and each of its side trips) for the invariants the engine relies on.
 * Returns a list of human-readable problems (empty when valid).
 */
export function validateDive(dive, { sceneIds, cardIds, library = LIBRARY }) {
  const problems = [];
  if (dive.status !== 'built') return problems;
  const ctx = { sceneIds, cardIds, library };
  checkSequence(dive.steps, dive.id, problems, ctx);
  dive.steps.forEach((s, i) => {
    if (!s.branch) return;
    if (s.branch.card && !cardIds.includes(s.branch.card)) problems.push(`${dive.id} step ${i}: unknown branch card "${s.branch.card}"`);
    const missing = s.branch.via.filter((id) => !library.find((e) => e.id === id && e.step));
    if (missing.length) {
      problems.push(`${dive.id} step ${i}: side trip uses unbuilt library entries ${missing.join(', ')}`);
      return;
    }
    checkSequence(sideTripPath(dive, i), `${dive.id} side trip from ${s.id}`, problems, ctx);
  });
  return problems;
}
