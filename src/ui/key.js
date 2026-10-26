// The living key, like the numbered key on a wall chart. Every structure in
// the view gets a number and the same number in the card's key. On wide
// screens the plate is labeled as a chart is: names set in columns at the
// plate's edges, each with a hairline down to a dot on its part. On narrow
// ones each part carries a numbered mark. Point at either and the other
// lights up; point at a key entry and a red leader line draws itself from the
// entry to the part, and follows it as the model turns.
import { el, clear } from './dom.js';
import { getCard } from '../data/cards.js';

/** Up to this many structures, every mark shows; past it (the whole body) only the one you point at. */
export const MAX_MARKS = 12;
/** A chart labels up to this many parts, as many as fit down its two edges a row apart. */
export const MAX_CALLOUTS = 24;
/** Closest two marks may sit, center to center (the marks are 24 px circles). */
const MARK_GAP = 28;
const MARK_R = 12;
/** Callout rows: the closest two labels on one side may sit, baseline to baseline. */
export const CALLOUT_ROW = 30;

/** How many labels a chart has room for: a column down each edge, a row apart, up to MAX_CALLOUTS. */
export function calloutRoom(f, row = CALLOUT_ROW) {
  const rows = Math.max(0, Math.floor((f.bottom - Math.max(f.top, f.topLeft ?? f.top) - 32) / row) + 1);
  return Math.max(MAX_MARKS, Math.min(MAX_CALLOUTS, 2 * rows));
}

/**
 * How many labels a chart sets when `lead` parts belong to the subject (a dive's own system):
 * those, topped up to MAX_MARKS with their neighbors, so a digestive plate names its organs
 * and a few landmarks, not every rib. With no lead the chart fills its room.
 */
export function chartRoom(f, lead = 0) {
  const room = calloutRoom(f);
  return lead > 0 ? Math.min(room, Math.max(MAX_MARKS, lead)) : room;
}
const SVG = 'http://www.w3.org/2000/svg';

/** The point on a number's circle (radius r around a) facing b. */
export function rim(a, b, r) {
  const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: a.x + ((b.x - a.x) / d) * r, y: a.y + ((b.y - a.y) / d) * r };
}

/** Number the structures in view, in the order the scene lists them. */
export function numberParts(ids) {
  // A card marked chart: false (a catch-all with no one place) stays in the key but gets no label on the plate.
  return ids.map((id, i) => ({ id, n: i + 1, title: getCard(id)?.title ?? id, chart: getCard(id)?.chart !== false }));
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

/**
 * Set chart labels in two columns. Each part goes to the side of the plate
 * it sits on, unless that column is full or starts below it; down each side the labels keep their parts' order and height,
 * pushed apart to at least `row` and kept between `top` and `bottom`
 * (`topLeft` for the left column, which starts below the plate's headline figure).
 * Returns { id, side, y } for each point ({ id, x, y }).
 */
export function layoutCallouts(points, { mid, top, topLeft = top, bottom, row = CALLOUT_ROW }) {
  const out = [];
  const cols = { left: points.filter((p) => p.x < mid), right: points.filter((p) => p.x >= mid) };
  const room = { left: Math.floor((bottom - topLeft) / row) + 1, right: Math.floor((bottom - top) / row) + 1 };
  const move = (from, to, pick) => {
    const i = cols[from].indexOf(pick(cols[from]));
    cols[to].push(...cols[from].splice(i, 1));
  };
  const nearest = (side) => (col) => col.reduce((a, b) => ((side === 'left' ? b.x > a.x : b.x < a.x) ? b : a));
  // A part beside the heading is labeled on the right, whose column starts higher. One lower
  // down, beside the headline figure, crosses over if it is near the middle anyway or while the
  // right column is the shorter: a line that slants down from an arm to the left crosses less
  // of the body than one that runs right across it.
  const beside = (top + topLeft) / 2;
  if (topLeft > top) {
    for (const p of cols.left.filter((q) => q.y < topLeft - row).sort((a, b) => a.y - b.y)) {
      if (cols.right.length < room.right && (p.y < beside || mid - p.x < row || cols.right.length < cols.left.length)) move('left', 'right', () => p);
    }
  }
  // A column with more labels than rows hands the parts nearest the middle to the other side.
  while (cols.left.length > room.left && cols.right.length < room.right) move('left', 'right', nearest('left'));
  while (cols.right.length > room.right && cols.left.length < room.left) move('right', 'left', nearest('right'));
  for (const side of ['left', 'right']) {
    const first = side === 'left' ? topLeft : top;
    const col = cols[side].sort((a, b) => a.y - b.y);
    // Labels that would touch merge into a block centered on their parts, as a
    // chart setter stacks them, so the lines stay short and don't fan out.
    let blocks = col.map((p) => ({ want: p.y, n: 1, y: p.y }));
    for (let merged = true; merged; ) {
      merged = false;
      for (const b of blocks) b.y = Math.min(bottom - (b.n - 1) * row, Math.max(first, b.want - ((b.n - 1) * row) / 2));
      for (let i = 1; i < blocks.length; i++) {
        const a = blocks[i - 1];
        const b = blocks[i];
        if (b.y < a.y + a.n * row) {
          a.want = (a.want * a.n + b.want * b.n) / (a.n + b.n);
          a.n += b.n;
          blocks.splice(i, 1);
          merged = true;
          break;
        }
      }
    }
    const ys = blocks.flatMap((b) => Array.from({ length: b.n }, (_, k) => b.y + k * row));
    col.forEach((p, i) => out.push({ id: p.id, side, y: ys[i] }));
  }
  return out;
}

export function createKey({ app, marksEl, leaderEl, lineEl, calloutsEl, engine, frame }) {
  let parts = [];
  let hot = null; // the card lit up
  let source = null; // the key entry the leader line starts from
  let draw = 0;
  let lead = 0; // how many of the parts, from the first, are the subject's own

  function setParts(ids, opts = {}) {
    lead = opts.lead ?? 0;
    clear(marksEl);
    clear(calloutsEl);
    parts = numberParts(ids);
    for (const [i, p] of parts.entries()) {
      p.mark = el('span', { class: 'mark', dataset: { card: p.id } },
        el('span', { class: 'mark__num', text: String(p.n) }),
        el('span', { class: 'mark__name', text: p.title }));
      marksEl.append(p.mark);
      p.line = document.createElementNS(SVG, 'polyline');
      p.dot = document.createElementNS(SVG, 'circle');
      p.dot.setAttribute('r', '3');
      p.line.setAttribute('pathLength', '1'); // so the draw-in animation needs no measuring
      const g = document.createElementNS(SVG, 'g');
      g.append(p.line, p.dot);
      // Callouts draw in one after another, the first part first.
      for (const node of [g, p.mark]) node.style.setProperty('--i', String(Math.min(i, MAX_CALLOUTS)));
      p.callout = g;
      calloutsEl.append(g);
    }
    setHot(null);
  }

  function setHot(id, from = null) {
    if (id !== hot || from !== source) draw = 0;
    hot = id;
    source = from;
    for (const p of parts) {
      p.mark.classList.toggle('is-hot', p.id === id);
      p.callout.classList.toggle('is-hot', p.id === id);
    }
    for (const b of document.querySelectorAll('.key__item')) b.classList.toggle('is-hot', b.dataset.card === id);
  }

  function update(dt, { busy, reducedMotion, chart }) {
    marksEl.hidden = busy;
    calloutsEl.toggleAttribute('hidden', busy || !chart);
    marksEl.classList.toggle('is-chart', chart);
    const box = app.getBoundingClientRect();
    const f = chart ? frame() : { left: 0, right: box.width, top: 0, bottom: box.height };
    const all = parts.length <= MAX_MARKS;
    const room = chart ? chartRoom(f, lead) : MAX_MARKS;
    const shown = [];
    let listed = 0;
    for (const p of parts) {
      const anchor = busy ? null : engine.anchorOf(p.id);
      const at = anchor && engine.toScreen(anchor);
      const inside = at && at.x > f.left && at.y > f.top && at.x < f.right && at.y < f.bottom;
      // A chart labels as many parts as fit down its edges (the whole body has more); numbers show only all or the one pointed at.
      const show = inside && (chart ? (listed < room && p.chart) || p.id === hot : all || p.id === hot);
      if (show) listed++;
      p.mark.hidden = !show;
      p.callout.toggleAttribute('hidden', !show || !chart);
      if (show) shown.push({ p, id: p.id, x: at.x, y: at.y, px: at.x, py: at.y });
    }
    if (chart) placeCallouts(shown, f);
    else {
      spread(shown);
      for (const s of shown) s.p.mark.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`;
    }
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
    // On a chart the line runs to the part itself; otherwise to its number.
    const target = chart ? { x: hotAt.px, y: hotAt.py } : hotAt;
    const from = rim(center, target, MARK_R);
    const end = leaderEnd(from, rim(target, center, chart ? 4 : MARK_R), draw);
    lineEl.setAttribute('x1', from.x.toFixed(1));
    lineEl.setAttribute('y1', from.y.toFixed(1));
    lineEl.setAttribute('x2', end.x.toFixed(1));
    lineEl.setAttribute('y2', end.y.toFixed(1));
    leaderEl.toggleAttribute('hidden', false);
  }

  /** Labels in columns at the plate's edges, a hairline from each to a dot on its part. */
  function placeCallouts(shown, f) {
    // Split at the middle of the parts themselves, so a subject off to one side still gets labels on both.
    const mid = shown.reduce((sum, s) => sum + s.x, 0) / (shown.length || 1);
    const placed = layoutCallouts(shown, { mid, top: f.top + 16, topLeft: (f.topLeft ?? f.top) + 16, bottom: f.bottom - 16 });
    for (const s of shown) s.w = s.p.mark.offsetWidth; // read every width before moving any label
    for (const { id, side, y } of placed) {
      const s = shown.find((x) => x.id === id);
      const w = s.w;
      const x = side === 'left' ? f.left : f.right - w;
      s.p.mark.dataset.side = side;
      s.p.mark.style.transform = `translate(${x.toFixed(1)}px, ${(y - 12).toFixed(1)}px)`;
      // From the part out to the label's end, the last leg level with it: a chart's dog-leg.
      // Drawn in that order, so the line grows from the dot toward its label.
      const edge = side === 'left' ? x + w + 6 : x - 6;
      const knee = side === 'left' ? Math.min(s.px - 8, edge + 18) : Math.max(s.px + 8, edge - 18);
      const pts = [[s.px, s.py], [knee, y], [edge, y]];
      s.p.line.setAttribute('points', pts.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' '));
      s.p.dot.setAttribute('cx', s.px.toFixed(1));
      s.p.dot.setAttribute('cy', s.py.toFixed(1));
    }
  }

  return {
    setParts,
    setHot,
    update,
    parts: () => parts.map(({ id, n, title }) => ({ id, n, title })),
    hot: () => hot,
  };
}
