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
    // Several steps can share a tier (DNA and its nucleotides are both molecules), but none may climb back up.
    if (!(s.tier >= prevTier)) problems.push(`${at}: tier must not decrease`);
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

/** The chain of library ids from `fromId` down to `targetId` through "made of" links (excluding fromId), or null. */
export function chainFrom(fromId, targetId, library = LIBRARY) {
  const queue = [[fromId]];
  const seen = new Set([fromId]);
  while (queue.length) {
    const route = queue.shift();
    const last = route[route.length - 1];
    if (last === targetId && route.length > 1) return route.slice(1);
    const entry = library.find((e) => e.id === last);
    for (const next of entry?.madeOf ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push([...route, next]);
    }
  }
  return null;
}

/** The library id a step shows, if it shows one. */
function libraryIdOf(step, library) {
  if (step.shared) return step.shared;
  return library.find((e) => e.step?.id === step.id)?.id ?? null;
}

/** Library steps for a chain of ids, marked as a side trip. */
function tripSteps(ids) {
  return ids.map((id) => libStep(id, { sideTrip: true }));
}

/**
 * How to reach a library scene. Tries, in order:
 *   1. from where you are now: the current step or one above it on the current path,
 *      going down through "made of" links (a detour);
 *   2. a dive whose main path shows it;
 *   3. a dive whose side trip shows it;
 *   4. any built dive step (main path or side trip) from which "made of" links reach it.
 * Returns { diveId, path, index } where path ends at the target, or null.
 */
export function routeTo(targetId, { diveId, path, index } = {}, dives = DIVES, library = LIBRARY) {
  const target = library.find((e) => e.id === targetId && e.step);
  if (!target) return null;
  const tryFrom = (dive, steps, upTo) => {
    for (let k = upTo; k >= 0; k--) {
      const libId = libraryIdOf(steps[k], library);
      if (libId === targetId) return { diveId: dive, path: steps, index: k };
      const chain = libId ? chainFrom(libId, targetId, library) : null;
      if (chain) {
        const full = [...steps.slice(0, k + 1), ...tripSteps(chain)];
        return { diveId: dive, path: full, index: full.length - 1 };
      }
    }
    return null;
  };
  if (path && diveId) {
    const here = tryFrom(diveId, path, index ?? path.length - 1);
    if (here) return here;
  }
  const built = dives.filter((d) => d.status === 'built');
  for (const d of built) {
    const k = d.steps.findIndex((s) => s.shared === targetId);
    if (k >= 0) return { diveId: d.id, path: d.steps, index: k };
  }
  for (const d of built) {
    const k = d.steps.findIndex((s) => s.branch?.via.includes(targetId));
    if (k >= 0) {
      const trip = sideTripPath(d, k);
      const at = trip.findIndex((s) => s.sideTrip && s.shared === targetId);
      return { diveId: d.id, path: trip.slice(0, at + 1), index: at };
    }
  }
  for (const d of built) {
    const main = tryFrom(d.id, d.steps, d.steps.length - 1);
    if (main) return main;
    for (let k = 0; k < d.steps.length; k++) {
      if (!d.steps[k].branch) continue;
      const trip = tryFrom(d.id, sideTripPath(d, k), sideTripPath(d, k).length - 1);
      if (trip) return trip;
    }
  }
  return null;
}
