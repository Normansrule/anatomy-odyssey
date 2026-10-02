// Search-and-jump. User text is normalized and length-limited, matched against
// a prebuilt index, and results are rendered with textContent only, so
// search input can never inject markup into the page.
import { CARDS, PLANNED_CARDS } from '../data/cards.js';
import { LIBRARY } from '../data/library.js';

export const MAX_QUERY = 60;

/** Lowercase, strip control characters and anything outside letters, digits, spaces and a few symbols. */
export function normalizeQuery(text) {
  return String(text ?? '')
    .slice(0, MAX_QUERY)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s\-'’]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "Femur (thigh bone)" → ["Femur (thigh bone)", "Femur", "thigh bone"]. */
function titleTerms(title) {
  const inner = [...title.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]);
  const outer = title.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  return [title, outer, ...inner];
}

export function buildIndex() {
  const entries = CARDS.map((c) => ({
    kind: 'card',
    id: c.id,
    title: c.title,
    terms: [...titleTerms(c.title), ...(c.aliases ?? [])].map(normalizeQuery),
    planned: false,
  }));
  for (const e of LIBRARY) {
    if (e.status !== 'planned') continue;
    entries.push({
      kind: 'library',
      id: e.id,
      title: e.title,
      terms: titleTerms(e.title).map(normalizeQuery),
      planned: true,
      blurb: PLANNED_CARDS[e.id] ?? '',
    });
  }
  return entries;
}

/** Rank: exact name > name starts with query > a word starts with query > contains. */
export function search(index, rawQuery, limit = 7) {
  const q = normalizeQuery(rawQuery);
  if (!q) return [];
  const scored = [];
  for (const entry of index) {
    let best = 0;
    let len = Infinity;
    for (const term of entry.terms) {
      let score = 0;
      if (term === q) score = 4;
      else if (term.startsWith(q)) score = 3;
      else if (term.split(' ').some((w) => w.startsWith(q))) score = 2;
      else if (term.includes(q)) score = 1;
      if (score > best || (score === best && score > 0 && term.length < len)) {
        best = score;
        len = term.length;
      }
    }
    if (best) scored.push({ entry, score: best - (entry.planned ? 0.5 : 0), len });
  }
  // Ties go to the shortest matching name ("femur" before "femoral head").
  scored.sort((a, b) => b.score - a.score || a.len - b.len || a.entry.title.localeCompare(b.entry.title));
  return scored.slice(0, limit).map((s) => s.entry);
}
