// The living key, like the numbered key on a wall chart. Every structure in
// the view gets a number: a mark on the model and the same number in the
// card's key. Point at one and the other lights up; point at a key entry and
// a red leader line draws itself from the entry to the part, and follows it
// as the model turns.
import { el, clear } from './dom.js';
import { getCard } from '../data/cards.js';

/** Up to this many structures, every mark shows; past it (the whole body) only the one you point at. */
export const MAX_MARKS = 12;
/** Closest two marks may sit, center to center (the marks are 24 px circles). */
const MARK_GAP = 28;
const MARK_R = 12;

/** The point on a number's circle (radius r around a) facing b. */
export function rim(a, b, r) {
  const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: a.x + ((b.x - a.x) / d) * r, y: a.y + ((b.y - a.y) / d) * r };
}

/** Number the structures in view, in the order the scene lists them. */
export function numberParts(ids) {
  return ids.map((id, i) => ({ id, n: i + 1, title: getCard(id)?.title ?? id }));
}

/**
 * Where the leader line's end is after `t` of its draw (0 to 1): it grows from
 * the key entry toward the part.
 */
export function leaderEnd(from, to, t) {
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

/** Push marks that land on top of each other apart, like a chart's numbers set clear of each other. */
export function spread(marks, gap = MARK_GAP, rounds = 6) {
  for (let r = 0; r < rounds; r++) {
    let moved = false;
    for (let i = 0; i < marks.length; i++) {
      for (let j = i + 1; j < marks.length; j++) {
        const a = marks[i];
        const b = marks[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= gap) continue;
        if (d < 0.01) [dx, dy] = [1, 0];
        const push = (gap - d) / 2 / (d || 1);
        a.x -= dx * push;
        a.y -= dy * push;
        b.x += dx * push;
        b.y += dy * push;
        moved = true;
      }
    }
    if (!moved) return marks;
  }
  return marks;
}

export function createKey({ app, marksEl, leaderEl, lineEl, engine }) {
  let parts = [];
  let hot = null; // the card lit up
  let source = null; // the key entry the leader line starts from
  let draw = 0;

  function setParts(ids) {
    clear(marksEl);
    parts = numberParts(ids);
    for (const p of parts) {
      p.mark = el('span', { class: 'mark', text: String(p.n) });
      marksEl.append(p.mark);
    }
    setHot(null);
  }

  function setHot(id, from = null) {
    if (id !== hot || from !== source) draw = 0;
    hot = id;
    source = from;
    for (const p of parts) p.mark.classList.toggle('is-hot', p.id === id);
    for (const b of document.querySelectorAll('.key__item')) b.classList.toggle('is-hot', b.dataset.card === id);
  }

  function update(dt, { busy, reducedMotion }) {
    marksEl.hidden = busy;
    const box = app.getBoundingClientRect();
    const all = parts.length <= MAX_MARKS;
    const shown = [];
    for (const p of parts) {
      const anchor = busy ? null : engine.anchorOf(p.id);
      const at = anchor && engine.toScreen(anchor);
      const inside = at && at.x > 0 && at.y > 0 && at.x < box.width && at.y < box.height;
      const show = inside && (all || p.id === hot);
      p.mark.hidden = !show;
      if (show) shown.push({ p, x: at.x, y: at.y });
    }
    spread(shown);
    for (const s of shown) s.p.mark.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`;
    const hotAt = shown.find((s) => s.p.id === hot);
    const num = source?.isConnected ? source.querySelector('.key__num') : null;
    if (!hotAt || !num || busy) {
      leaderEl.toggleAttribute('hidden', true); // an SVG element has no .hidden property
      return;
    }
    // The line springs out from the entry's number to the part's number, rim to rim.
    draw = reducedMotion ? 1 : draw + (1 - draw) * (1 - Math.exp(-dt * 14));
    const r = num.getBoundingClientRect();
    const center = { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2 };
    const from = rim(center, hotAt, MARK_R);
    const end = leaderEnd(from, rim(hotAt, center, MARK_R), draw);
    lineEl.setAttribute('x1', from.x.toFixed(1));
    lineEl.setAttribute('y1', from.y.toFixed(1));
    lineEl.setAttribute('x2', end.x.toFixed(1));
    lineEl.setAttribute('y2', end.y.toFixed(1));
    leaderEl.toggleAttribute('hidden', false);
  }

  return {
    setParts,
    setHot,
    update,
    parts: () => parts.map(({ id, n, title }) => ({ id, n, title })),
    hot: () => hot,
  };
}
