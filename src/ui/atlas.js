// The atlas: one map of every dive, module and shared building block.
// Horizontal position is the view's size on a log scale (powers of ten),
// so a dive reads left to right as a descent; each row is one dive, side
// trips hang just below their row, and the shared library sits along the
// bottom. Every node is a button that flies there.
// atlasLayout() is pure (no DOM) and unit-tested; renderAtlas() draws it.
import { builtDives } from '../data/dives.js';
import { LIBRARY } from '../data/library.js';
import { sideTripPath } from '../science/graph.js';
import { formatLength } from '../science/scale.js';
import { el, clear } from './dom.js';

const X0 = 172; // left edge of the scale (after row titles)
const PX_PER_DECADE = 78;
const TOP_EXP = 0.6; // about 4 m
const ROW_H = 64;
const HEAD = 64;

export function xOf(meters) {
  return X0 + (TOP_EXP - Math.log10(meters)) * PX_PER_DECADE;
}

export function atlasLayout(dives = builtDives(), library = LIBRARY) {
  let cursor = HEAD + 20;
  const rows = dives.map((dive) => {
    const y = cursor;
    const tripCount = dive.steps.filter((st) => st.branch).length;
    cursor += ROW_H + Math.max(0, tripCount - 1) * 24;
    const nodes = dive.steps.map((s, i) => ({ key: `${dive.id}:${s.id}`, diveId: dive.id, stepId: s.id, title: s.title, x: xOf(s.frameMeters), y, shared: s.shared ?? null, index: i }));
    const trips = [];
    dive.steps.forEach((s, i) => {
      if (!s.branch) return;
      const path = sideTripPath(dive, i);
      const lane = trips.length; // each side trip gets its own line under the row
      const tripNodes = path.slice(i + 1).map((t, k) => ({ key: `${dive.id}:${s.id}>${t.id}`, diveId: dive.id, stepId: t.id, title: t.title, x: xOf(t.frameMeters), y: y + 24 + lane * 24, shared: t.shared, from: s.id, index: k }));
      trips.push({ from: nodes[i], nodes: tripNodes });
    });
    return { dive, y, nodes, trips };
  });
  const libY = cursor + 40;
  // Pack library entries into lanes so their labels never overlap.
  const laneRight = [];
  const libNodes = library.filter((e) => e.step)
    .map((e) => ({ key: `lib:${e.id}`, libraryId: e.id, title: e.step.title, x: xOf(e.step.frameMeters) }))
    .sort((a, b) => a.x - b.x)
    .map((n) => {
      const half = (n.title.length * 6 + 12) / 2;
      let lane = laneRight.findIndex((right) => n.x - half > right);
      if (lane < 0) lane = laneRight.push(-Infinity) - 1;
      laneRight[lane] = n.x + half;
      return { ...n, y: libY + lane * 30, lane };
    });
  const smallest = Math.min(...library.filter((e) => e.step).map((e) => e.step.frameMeters), ...dives.flatMap((d) => d.steps.map((st) => st.frameMeters)));
  const ticks = [];
  for (let e = 0; e >= Math.floor(Math.log10(smallest)); e--) ticks.push({ x: xOf(10 ** e), label: formatLength(10 ** e, 1).text });
  const width = Math.ceil(Math.max(...libNodes.map((n) => n.x), ...rows.flatMap((r) => r.nodes.map((n) => n.x))) + 90);
  return { rows, libNodes, libY, ticks, width, height: libY + laneRight.length * 30 + 10, laneWidths: laneRight };
}

const SVG = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) node.setAttribute(k, String(v));
  for (const c of children.flat()) if (c) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return node;
}

/** A focusable SVG button. */
function nodeButton(n, label, cls, onActivate, { r = 6, labelDy = -12 } = {}) {
  const g = s('g', { class: `atlas__node ${cls}`, tabindex: 0, role: 'button', 'aria-label': label },
    s('circle', { class: 'atlas__hit', cx: n.x, cy: n.y, r: r + 8 }), // a larger target for fingers
    s('circle', { class: 'atlas__dot', cx: n.x, cy: n.y, r }),
    s('text', { x: n.x, y: n.y + labelDy, 'text-anchor': 'middle' }, n.title),
  );
  g.addEventListener('click', onActivate);
  g.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onActivate();
    }
  });
  return g;
}

export function renderAtlas(dialog, body, { current, onStep, onTrip, onLibrary }) {
  const L = atlasLayout();
  clear(body);
  const svg = s('svg', { class: 'atlas__map', viewBox: `0 0 ${L.width} ${L.height}`, width: L.width, height: L.height, role: 'group', 'aria-label': 'Map of every dive by scale' });
  const close = () => dialog.close();

  // Scale ticks across the top, with faint guides down the map.
  for (const t of L.ticks) {
    svg.append(
      s('line', { class: 'atlas__guide', x1: t.x, x2: t.x, y1: HEAD - 18, y2: L.height - 10 }),
      s('text', { class: 'atlas__tick', x: t.x, y: HEAD - 26, 'text-anchor': 'middle' }, t.label),
    );
  }

  for (const row of L.rows) {
    const isHere = current.diveId === row.dive.id;
    svg.append(s('text', { class: `atlas__row-title${isHere ? ' is-here' : ''}`, x: 12, y: row.y + 4 }, row.dive.title));
    svg.append(s('polyline', { class: 'atlas__path', points: row.nodes.map((n) => `${n.x},${n.y}`).join(' ') }));
    for (const trip of row.trips) {
      const pts = [trip.from, ...trip.nodes].map((n) => `${n.x},${n.y}`).join(' ');
      svg.append(s('polyline', { class: 'atlas__path atlas__path--trip', points: pts }));
    }
    row.nodes.forEach((n, i) => {
      const here = isHere && current.stepId === n.stepId;
      svg.append(nodeButton(n, `${row.dive.title}: ${n.title}`, `${n.shared ? 'is-shared' : ''}${here ? ' is-here' : ''}`, () => {
        close();
        onStep(row.dive.id, n.stepId);
      }, { labelDy: i % 2 ? 18 : -12 }));
    });
    for (const trip of row.trips) {
      for (const n of trip.nodes) {
        svg.append(nodeButton(n, `${row.dive.title}, side trip: ${n.title}`, 'is-shared is-trip', () => {
          close();
          onTrip(row.dive.id, n.stepId);
        }, { r: 4.5, labelDy: n.index % 2 ? -9 : 16 })); // alternate so neighbors' labels don't collide
      }
    }
  }

  svg.append(
    s('line', { class: 'atlas__divider', x1: 12, x2: L.width - 12, y1: L.libY - 30, y2: L.libY - 30 }),
    s('text', { class: 'atlas__row-title', x: 12, y: L.libY + 4 }, 'Shared library'),
  );
  for (const n of L.libNodes) {
    svg.append(nodeButton(n, `Shared building block: ${n.title}`, 'is-shared is-library', () => {
      close();
      onLibrary(n.libraryId);
    }, { r: 6, labelDy: -11 }));
  }

  body.append(
    el('div', { class: 'about__head' },
      el('h2', { id: 'atlas-title', text: 'Map of the body by scale' }),
      el('button', { class: 'icon-button', text: 'Close', onclick: close }),
    ),
    el('p', { class: 'atlas__lede', text: 'Each row is a dive, left to right from large to small. Violet points are shared building blocks, reused by every dive that reaches them; dashed branches are side trips. Choose any point to fly there.' }),
    el('div', { class: 'atlas__scroll' }, svg),
  );
  dialog.showModal();
  body.querySelector('.atlas__node.is-here')?.focus();
}
