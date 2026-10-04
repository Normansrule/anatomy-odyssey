import '@fontsource/atkinson-hyperlegible-next/latin-400.css';
import '@fontsource/atkinson-hyperlegible-next/latin-700.css';
import '@fontsource/literata/latin-400.css';
import '@fontsource/literata/latin-600.css';
import './styles/app.css';

import { createRenderer, applySize } from './engine/renderer.js';
import { TierEngine } from './engine/tierEngine.js';
import { SCENES } from './scenes/registry.js';
import { SYSTEMS, DEFAULT_SYSTEMS } from './scenes/body.js';
import { DIVES, TIERS, getDive, locateStep } from './data/dives.js';
import { getCard } from './data/cards.js';
import { getLibraryEntry } from './data/library.js';
import { computeUsedBy, sideTripPath, routeTo } from './science/graph.js';
import { formatLength } from './science/scale.js';
import { buildGauge, updateGauge, updateScaleBar } from './ui/gauge.js';
import { renderCard, renderPlanned } from './ui/panel.js';
import { renderAbout } from './ui/about.js';
import { buildIndex, search, normalizeQuery } from './ui/search.js';
import { createSceneControls } from './ui/sceneControls.js';
import { createTour } from './ui/tour.js';
import { openQuiz, hasQuiz } from './ui/quiz.js';
import { openGlossary } from './ui/glossary.js';
import { renderAtlas } from './ui/atlas.js';
import { el, clear } from './ui/dom.js';
import { progress } from './storage/progress.js';
import { FrameBenchmark, validMeasurement } from './engine/benchmark.js';

const $ = (id) => document.getElementById(id);
const app = $('app');
const canvas = $('view');
const systemReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
const wide = window.matchMedia('(min-width: 900px)');

const usedBy = computeUsedBy();
const index = buildIndex();

const settings = {
  motion: ['system', 'reduce', 'full'].includes(progress.pref('motion')) ? progress.pref('motion') : 'system',
  quality: ['low', 'auto', 'high'].includes(progress.pref('quality')) ? progress.pref('quality') : 'auto',
  speak: Boolean(progress.pref('speak', false)),
  benchmark: validMeasurement(progress.pref('benchmark', null)) ? progress.pref('benchmark', null) : null,
};
const reducedMotion = () => (settings.motion === 'system' ? systemReduce.matches : settings.motion === 'reduce');

const state = {
  dive: getDive('skeletal'),
  path: getDive('skeletal').steps,
  stepIndex: 0,
  openCard: null, // { kind: 'card' | 'library', id }
  expert: Boolean(progress.pref('expert', false)),
  systems: sanitizeSystems(progress.pref('systems', DEFAULT_SYSTEMS)),
};

function sanitizeSystems(list) {
  const ids = SYSTEMS.map((s) => s.id);
  return Array.isArray(list) ? list.filter((x) => ids.includes(x)) : [...DEFAULT_SYSTEMS];
}

/** Tier of a card's home step, wherever it lives. */
function tierOf(stepId) {
  const lib = getLibraryEntry(stepId);
  if (lib?.step) return lib.step.tier;
  return locateStep(stepId)?.dive.steps.find((s) => s.id === stepId)?.tier;
}

async function main() {
  let renderer;
  let backend;
  try {
    ({ renderer, backend } = await createRenderer(canvas));
  } catch (err) {
    showFatal('Anatomy Odyssey could not start 3D graphics. It needs a browser with WebGPU or WebGL 2 enabled, such as a current Chrome, Edge, Firefox or Safari.');
    console.error(err);
    return;
  }

  const engine = new TierEngine({ renderer, canvas, scenes: SCENES, reducedMotion: reducedMotion() });
  engine.systems = state.systems;
  const resize = () => applySize(renderer, engine.camera, canvas, settings.quality, settings.benchmark?.tier);
  // First launch (or after "Measure again"): time a few seconds of frames to tune "Balanced".
  let bench = settings.benchmark ? null : new FrameBenchmark();
  resize();
  new ResizeObserver(resize).observe(canvas);
  systemReduce.addEventListener('change', () => (engine.reducedMotion = reducedMotion()));

  const currentStep = () => state.path[state.stepIndex];
  const onSideTrip = () => state.path.some((s) => s.sideTrip);

  // ── Gauge, scale bar, track ───────────────────────────────────────
  const gauge = { marker: $('gauge-marker'), value: $('gauge-value'), stops: [], currentIndex: 0 };
  const scaleBar = { bar: $('scalebar-bar'), label: $('scalebar-label') };
  let trackItems = [];

  function setPath(path) {
    state.path = path;
    gauge.stops = buildGauge($('gauge-rail'), path);
    const list = clear($('track-steps'));
    trackItems = path.map((s, i) => {
      const btn = el('button', { class: `track__step${s.sideTrip ? ' track__step--side' : ''}`, onclick: () => goTo(i) },
        el('span', { class: 'track__num', text: String(s.tier) }),
        el('span', { class: 'track__title', text: s.title }),
      );
      list.append(el('li', {}, btn));
      return btn;
    });
    $('dive-button').textContent = state.dive.title;
  }

  function refreshTrack() {
    const visited = progress.visited();
    trackItems.forEach((btn, i) => {
      const s = state.path[i];
      const key = `${state.dive.id}:${s.id}`;
      btn.classList.toggle('is-current', i === state.stepIndex);
      btn.classList.toggle('is-visited', visited.has(key));
      if (i === state.stepIndex) {
        btn.setAttribute('aria-current', 'step');
        const list = btn.closest('.track__steps');
        if (list && list.scrollWidth > list.clientWidth) {
          list.scrollTo({ left: btn.offsetLeft - list.clientWidth / 2 + btn.offsetWidth / 2, behavior: reducedMotion() ? 'auto' : 'smooth' });
        }
      } else {
        btn.removeAttribute('aria-current');
      }
      btn.setAttribute('aria-label', `Tier ${s.tier}: ${s.title}${s.sideTrip ? ' (side trip)' : ''}${visited.has(key) ? ', visited' : ''}`);
    });
    const next = state.path[state.stepIndex + 1];
    $('back-button').disabled = state.stepIndex === 0;
    $('next-button').disabled = !next;
    $('next-button').textContent = next ? `Dive deeper: ${next.title}` : 'Deepest tier';
    gauge.currentIndex = state.stepIndex;
    $('systems').hidden = currentStep().scene !== 'body';
    app.dataset.tier = String(currentStep().tier);
    app.dataset.module = state.dive.kind === 'module' ? 'true' : 'false';
  }

  // ── Systems toggles (whole-body tier) ─────────────────────────────
  for (const sys of SYSTEMS) {
    const b = el('button', {
      class: `system-chip system-chip--${sys.id}`,
      'aria-pressed': String(state.systems.includes(sys.id)),
      onclick: () => {
        const on = state.systems.includes(sys.id);
        state.systems = on ? state.systems.filter((x) => x !== sys.id) : [...state.systems, sys.id];
        b.setAttribute('aria-pressed', String(!on));
        engine.setSystems(state.systems);
        progress.setPref('systems', state.systems);
        if (state.openCard) reopen();
      },
    }, el('span', { class: 'system-chip__swatch', 'aria-hidden': 'true' }), sys.label);
    $('systems').append(b);
  }
  function ensureSystems(ids = []) {
    let changed = false;
    for (const id of ids) {
      if (state.systems.includes(id)) continue;
      state.systems = [...state.systems, id];
      $('systems').querySelector(`.system-chip--${id}`)?.setAttribute('aria-pressed', 'true');
      changed = true;
    }
    if (changed) engine.setSystems(state.systems);
  }

  // ── Scene controls ────────────────────────────────────────────────
  const sceneControls = createSceneControls({
    panel: $('scene-controls'),
    label: $('scene-range-label'),
    value: $('scene-value'),
    range: $('scene-range'),
    presets: $('scene-presets'),
    readout: $('scene-readout'),
  });

  // ── Card panel ────────────────────────────────────────────────────
  const panel = $('panel');
  const panelBody = $('panel-body');
  const cardCtx = () => ({
    currentStep: currentStep(),
    nextStep: state.path[state.stepIndex + 1],
    onSideTrip: onSideTrip(),
    usedBy,
    expert: state.expert,
    tierOf,
    hasQuiz: hasQuiz(state.dive.id),
    structures: () => engine.structures(),
    onDive: () => goTo(state.stepIndex + 1),
    onBranch: () => takeBranch(),
    onQuiz: () => startQuiz(),
    onRelated: (diveId) => switchDive(diveId),
    onOpenCard: (id) => openCard(id),
    onOpenLibrary: (id) => openLibrary(id),
    onExplore: (id) => explore(id),
    onJumpDive: (diveId, libraryId) => {
      const dive = getDive(diveId);
      if (!dive) return;
      const onMain = dive.steps.find((s) => s.shared === libraryId);
      const via = dive.steps.find((s) => s.branch?.via.includes(libraryId));
      switchDive(diveId, (onMain ?? via)?.id);
    },
    onToggleExpert: () => {
      state.expert = !state.expert;
      progress.setPref('expert', state.expert);
      reopen();
      panelBody.querySelector('.switch')?.focus();
    },
  });
  function openCard(id, { focus = true } = {}) {
    if (!getCard(id)) return;
    state.openCard = { kind: 'card', id };
    renderCard(panelBody, id, cardCtx());
    showPanel(focus);
  }
  function openLibrary(id) {
    state.openCard = { kind: 'library', id };
    renderPlanned(panelBody, id, cardCtx());
    showPanel(true);
  }
  function reopen() {
    if (!state.openCard) return;
    if (state.openCard.kind === 'card') renderCard(panelBody, state.openCard.id, cardCtx());
    else renderPlanned(panelBody, state.openCard.id, cardCtx());
  }
  function showPanel(focus) {
    panel.hidden = false;
    panelBody.scrollTop = 0;
    const title = $('card-title');
    if (focus && title) {
      title.setAttribute('tabindex', '-1');
      title.focus({ preventScroll: true });
    }
  }
  function closePanel() {
    panel.hidden = true;
    state.openCard = null;
  }
  $('panel-close').addEventListener('click', closePanel);

  // ── Navigation ────────────────────────────────────────────────────
  async function goTo(i, { thenOpen, fromFocus, keepTour = false } = {}) {
    if (i < 0 || i >= state.path.length) return false;
    if (!keepTour) tour.stop();
    if (i === state.stepIndex) {
      if (thenOpen) openCard(thenOpen);
      return true;
    }
    if (engine.busy) return false;
    const forward = i > state.stepIndex;
    state.stepIndex = i;
    beginMove();
    await engine.transition(state.path[i], forward, { fromFocus });
    arrive(thenOpen);
    return true;
  }

  function beginMove() {
    app.dataset.busy = 'true';
    closePanel();
    sceneControls.hide();
    hideIntro();
    refreshTrack();
  }

  function arrive(thenOpen) {
    app.dataset.busy = 'false';
    const s = currentStep();
    // Back on the main path at or above a side trip's start: restore the main path.
    if (!s.sideTrip && state.path !== state.dive.steps && onSideTrip()) {
      setPath(state.dive.steps);
      state.stepIndex = state.dive.steps.findIndex((p) => p.id === s.id);
    }
    if (s.systems) ensureSystems(s.systems);
    progress.markVisited(`${state.dive.id}:${s.id}`);
    refreshTrack();
    sceneControls.attach(engine.current?.built.controls);
    announce(`${TIERS[s.tier]} tier: ${s.title}${s.sideTrip ? ', side trip' : ''}. The view is about ${formatLength(s.frameMeters).text} tall.`);
    if (thenOpen) openCard(thenOpen, { focus: !tour.active });
    else if (wide.matches && !tour.active) openCard(s.card, { focus: false });
  }

  async function takeBranch() {
    const i = state.stepIndex;
    const path = sideTripPath(state.dive, i);
    if (!path || engine.busy) return;
    setPath(path);
    await goTo(i + 1, { fromFocus: engine.current?.built.branchFocus });
  }

  /** Switch to another dive or module, flying to `stepId` (default: its first step). */
  async function switchDive(diveId, stepId) {
    const dive = getDive(diveId);
    if (!dive || dive.status !== 'built' || engine.busy) return false;
    tour.stop();
    const target = Math.max(0, dive.steps.findIndex((s) => s.id === stepId));
    const step = dive.steps[target];
    const from = currentStep();
    state.dive = dive;
    setPath(dive.steps);
    state.stepIndex = target;
    progress.setPref('dive', dive.id);
    if (from.id === step.id && engine.retarget(step)) {
      arrive();
      return true;
    }
    beginMove();
    await engine.transition(step, step.frameMeters < engine.viewMeters());
    arrive();
    return true;
  }

  /** Fly along a route from routeTo(): a dive, a path through it (possibly with a detour), and the step to show. */
  async function travel(route, { thenOpen } = {}) {
    const dive = route && getDive(route.diveId);
    if (!dive || engine.busy) return false;
    tour.stop();
    const step = route.path[route.index];
    const from = currentStep();
    const forward = step.frameMeters < engine.viewMeters();
    state.dive = dive;
    setPath(route.path);
    state.stepIndex = route.index;
    progress.setPref('dive', dive.id);
    if (from.id === step.id && engine.retarget(step)) {
      arrive(thenOpen);
      return true;
    }
    beginMove();
    await engine.transition(step, forward);
    arrive(thenOpen);
    return true;
  }

  /** Zoom into a shared building block: from here if what you are looking at is made of it, otherwise by the best route. */
  function explore(libraryId) {
    const entry = getLibraryEntry(libraryId);
    if (!entry || entry.status !== 'built') {
      openLibrary(libraryId);
      return;
    }
    travel(routeTo(libraryId, { diveId: state.dive.id, path: state.path, index: state.stepIndex }));
  }

  $('back-button').addEventListener('click', () => goTo(state.stepIndex - 1));
  $('next-button').addEventListener('click', () => goTo(state.stepIndex + 1));

  // ── Dive picker ───────────────────────────────────────────────────
  const diveButton = $('dive-button');
  const diveMenu = $('dive-menu');
  const addMenuGroup = (heading, dives) => {
    diveMenu.append(el('p', { class: 'menu__heading', text: heading }));
    for (const d of dives) {
      diveMenu.append(el('button', {
        class: 'menu__item',
        role: 'menuitem',
        'aria-disabled': d.status === 'planned' ? 'true' : null,
        onclick: () => {
          if (d.status !== 'built') return;
          toggleMenu(false);
          switchDive(d.id);
        },
      },
      el('span', { class: 'menu__title', text: d.title }),
      el('span', { class: 'menu__summary', text: d.summary }),
      d.status === 'planned' ? el('span', { class: 'tag tag--planned', text: 'planned' }) : null,
      ));
    }
  };
  addMenuGroup('Dives', DIVES.filter((d) => d.kind === 'dive'));
  addMenuGroup('Modules', DIVES.filter((d) => d.kind === 'module'));
  function toggleMenu(open = diveMenu.hidden) {
    diveMenu.hidden = !open;
    diveButton.setAttribute('aria-expanded', String(open));
    if (open) diveMenu.querySelector('button:not([aria-disabled])')?.focus();
  }
  diveButton.addEventListener('click', () => toggleMenu());

  // ── Search and jump ───────────────────────────────────────────────
  const input = $('search-input');
  const results = $('search-results');
  let active = -1;
  let current = [];
  function whereIs(cardId) {
    const card = getCard(cardId);
    if (!card) return null;
    const inPath = state.path.findIndex((s) => s.id === card.home);
    if (inPath >= 0) return { dive: state.dive, index: inPath, local: true };
    const found = locateStep(card.home, state.dive.id);
    return found ? { ...found, local: false } : null;
  }
  function renderResults() {
    clear(results);
    current.forEach((entry, i) => {
      let where = 'Planned building block';
      if (entry.kind === 'card') {
        const w = whereIs(entry.id);
        where = w ? `${w.local ? state.path[w.index].title : w.dive.title}` : getLibraryEntry(getCard(entry.id)?.home) ? 'Shared building block' : '';
      }
      results.append(el('li', {
        role: 'option',
        id: `sr-${i}`,
        class: `search__result${i === active ? ' is-active' : ''}`,
        'aria-selected': String(i === active),
        onmousedown: (e) => {
          e.preventDefault();
          choose(entry);
        },
      }, el('span', { class: 'search__title', text: entry.title }), el('span', { class: 'search__where', text: where })));
    });
    if (!current.length && normalizeQuery(input.value)) {
      results.append(el('li', { class: 'search__empty', role: 'option', 'aria-disabled': 'true', 'aria-selected': 'false', text: 'Nothing by that name yet. Try femur, heart, sarcomere or antibody.' }));
    }
    const open = Boolean(normalizeQuery(input.value));
    results.hidden = !open;
    input.setAttribute('aria-expanded', String(open));
    if (active >= 0) input.setAttribute('aria-activedescendant', `sr-${active}`);
    else input.removeAttribute('aria-activedescendant');
  }
  async function goToCard(cardId) {
    const card = getCard(cardId);
    if (!card) return;
    const w = whereIs(cardId);
    if (!w) {
      // Lives only in a shared scene reached by side trips or "made of" links.
      if (getLibraryEntry(card.home)) await travel(routeTo(card.home, { diveId: state.dive.id, path: state.path, index: state.stepIndex }), { thenOpen: card.id });
      return;
    }
    if (card.system) ensureSystems([card.system]);
    if (w.local) {
      goTo(w.index, { thenOpen: card.id });
    } else {
      await switchDive(w.dive.id, w.dive.steps[w.index].id);
      openCard(card.id);
    }
  }
  function choose(entry) {
    input.value = '';
    current = [];
    active = -1;
    renderResults();
    input.blur();
    if (entry.kind === 'library') openLibrary(entry.id);
    else goToCard(entry.id);
  }
  input.addEventListener('input', () => {
    current = search(index, input.value);
    active = current.length ? 0 : -1;
    renderResults();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && current.length) {
      active = (active + 1) % current.length;
      renderResults();
      e.preventDefault();
    } else if (e.key === 'ArrowUp' && current.length) {
      active = (active - 1 + current.length) % current.length;
      renderResults();
      e.preventDefault();
    } else if (e.key === 'Enter' && current[active]) {
      choose(current[active]);
      e.preventDefault();
    } else if (e.key === 'Escape') {
      input.value = '';
      current = [];
      renderResults();
      input.blur();
    }
  });
  input.addEventListener('blur', () => setTimeout(() => (results.hidden = true), 120));

  // ── Tour ──────────────────────────────────────────────────────────
  const tourButton = $('tour-button');
  const tour = createTour({
    caption: $('caption'),
    text: $('caption-text'),
    stopButton: $('caption-stop'),
    speakEnabled: () => settings.speak,
    currentStep,
    isLast: () => state.stepIndex >= state.path.length - 1,
    goNext: () => goTo(state.stepIndex + 1, { keepTour: true }),
    onChange: (on) => {
      tourButton.setAttribute('aria-pressed', String(on));
      tourButton.textContent = on ? 'Stop tour' : 'Play tour';
      app.dataset.tour = String(on);
    },
  });
  async function startTour() {
    if (tour.active) {
      tour.stop();
      return;
    }
    if (engine.busy) return;
    hideIntro();
    if (state.path !== state.dive.steps || state.stepIndex !== 0) {
      const top = state.dive.steps[0];
      setPath(state.dive.steps);
      state.stepIndex = 0;
      beginMove();
      await engine.transition(top, false);
      arrive();
    }
    closePanel();
    tour.play();
  }
  tourButton.addEventListener('click', startTour);

  // ── Quiz and glossary ─────────────────────────────────────────────
  function startQuiz() {
    openQuiz($('quiz'), $('quiz-body'), {
      diveId: state.dive.id,
      title: state.dive.title,
      onDone: (score, total) => progress.setPref(`quiz:${state.dive.id}`, `${score}/${total}`),
    });
  }
  $('glossary-button').addEventListener('click', () => openGlossary($('glossary'), $('glossary-body'), { onGo: goToCard }));
  $('atlas-button').addEventListener('click', () => renderAtlas($('atlas'), $('atlas-body'), {
    current: { diveId: state.dive.id, stepId: currentStep().id },
    onStep: (diveId, stepId) => switchDive(diveId, stepId),
    onTrip: (diveId, stepId) => {
      const dive = getDive(diveId);
      const from = dive.steps.findIndex((s) => s.branch?.via.includes(stepId));
      const path = sideTripPath(dive, from);
      travel({ diveId, path, index: path.findIndex((s) => s.sideTrip && s.id === stepId) });
    },
    onLibrary: (id) => explore(id),
  }));

  // ── About and settings ────────────────────────────────────────────
  const about = $('about');
  $('about-button').addEventListener('click', () => {
    renderAbout($('about-body'), {
      backend,
      settings,
      onClose: () => about.close(),
      onSetting: (name, value) => {
        settings[name] = value;
        progress.setPref(name, value);
        if (name === 'motion') engine.reducedMotion = reducedMotion();
        if (name === 'quality') resize();
      },
      onRemeasure: () => {
        settings.benchmark = null;
        progress.setPref('benchmark', null);
        resize();
        bench = new FrameBenchmark({ warmup: 20 });
        announce('Measuring this device for a few seconds.');
      },
      onReset: () => {
        progress.clear();
        refreshTrack();
        announce('Progress cleared.');
      },
    });
    about.showModal();
  });
  for (const d of [about, $('glossary'), $('quiz'), $('atlas')]) {
    d.addEventListener('click', (e) => {
      if (e.target === d) d.close();
    });
  }

  // ── Intro ─────────────────────────────────────────────────────────
  const intro = $('intro');
  function hideIntro() {
    if (!intro.hidden) {
      intro.hidden = true;
      progress.setPref('introSeen', true);
    }
  }
  if (!progress.pref('introSeen', false)) intro.hidden = false;
  $('intro-start').addEventListener('click', () => {
    hideIntro();
    goTo(1);
  });
  $('intro-tour').addEventListener('click', () => startTour());
  $('intro-explore').addEventListener('click', () => {
    hideIntro();
    openCard('body');
  });

  // ── Picking and hover labels ──────────────────────────────────────
  const tooltip = $('tooltip');
  let down = null;
  const ndcOf = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 };
  };
  canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    down = null;
    const hit = engine.pickAt(ndcOf(e));
    if (hit) openCard(hit.cardId, { focus: false });
  });
  let hoverQueued = null;
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') hoverQueued = e;
  });
  canvas.addEventListener('pointerleave', () => {
    hoverQueued = null;
    tooltip.hidden = true;
  });
  function updateHover() {
    if (!hoverQueued) return;
    const e = hoverQueued;
    hoverQueued = null;
    if (e.buttons) {
      tooltip.hidden = true;
      return;
    }
    const hit = engine.pickAt(ndcOf(e));
    canvas.style.cursor = hit ? 'pointer' : '';
    if (!hit) {
      tooltip.hidden = true;
      return;
    }
    tooltip.textContent = hit.label ?? getCard(hit.cardId)?.title ?? '';
    tooltip.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 12}px)`;
    tooltip.hidden = false;
  }

  // ── Keyboard ──────────────────────────────────────────────────────
  window.addEventListener('keydown', (e) => {
    const t = e.target;
    if (document.querySelector('dialog[open]')) return;
    if (e.key === 'Escape') {
      if (tour.active) tour.stop();
      else if (!diveMenu.hidden) toggleMenu(false);
      else if (!panel.hidden) closePanel();
      return;
    }
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
    if (e.key === '/') {
      input.focus();
      e.preventDefault();
    } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
      goTo(state.stepIndex + 1);
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      goTo(state.stepIndex - 1);
      e.preventDefault();
    } else if (e.key === 'g' || e.key === 'G') {
      $('glossary-button').click();
    } else if (e.key === 'm' || e.key === 'M') {
      $('atlas-button').click();
    } else if (e.key === 't' || e.key === 'T') {
      startTour();
    }
  });
  document.addEventListener('click', (e) => {
    if (!diveMenu.hidden && !diveMenu.contains(e.target) && e.target !== diveButton) toggleMenu(false);
  });

  // ── Start ─────────────────────────────────────────────────────────
  const params = new URLSearchParams(location.search);
  const startDive = getDive(params.get('dive'));
  if (startDive?.status === 'built') state.dive = startDive;
  setPath(state.dive.steps);
  const startParam = params.get('step');
  let startIndex = Math.max(0, state.path.findIndex((s) => s.id === startParam));
  // ?trip=1 (or a library step not on this dive's main path) opens the side trip or detour
  // that reaches it, preferring this dive (used by links and screenshot tests).
  if (startParam && getLibraryEntry(startParam) && (params.get('trip') || state.path[startIndex]?.id !== startParam)) {
    const from = state.dive.steps.findIndex((s) => s.branch?.via.includes(startParam));
    const route = from >= 0 ? null : routeTo(startParam, { diveId: state.dive.id, path: state.dive.steps, index: state.dive.steps.length - 1 });
    if (from >= 0) {
      setPath(sideTripPath(state.dive, from));
      startIndex = state.path.findIndex((s) => s.id === startParam);
    } else if (route) {
      state.dive = getDive(route.diveId);
      setPath(route.path);
      startIndex = route.index;
    }
  }
  state.stepIndex = startIndex;
  const first = currentStep();
  if (first.systems) {
    ensureSystems(first.systems);
    engine.systems = state.systems;
  }
  engine.show(first);
  progress.markVisited(`${state.dive.id}:${first.id}`);
  refreshTrack();
  sceneControls.attach(engine.current?.built.controls);
  if (startIndex > 0 || startDive) {
    hideIntro();
    if (wide.matches) openCard(first.card, { focus: false });
  }

  let last = performance.now();
  let lastMeters = 0;
  renderer.setAnimationLoop((now) => {
    const rawMs = now - last;
    const dt = Math.min(0.1, Math.max(0, rawMs / 1000)); // rAF time can precede the first performance.now()
    last = now;
    if (bench && !document.hidden) {
      const result = bench.push(rawMs);
      if (result) {
        bench = null;
        settings.benchmark = { ...result, at: new Date().toISOString().slice(0, 10) };
        progress.setPref('benchmark', settings.benchmark);
        resize();
      }
    }
    engine.setViewShift(viewShift(), viewShiftY());
    engine.update(dt);
    engine.render();
    updateHover();
    sceneControls.sync();
    const meters = engine.viewMeters();
    if (Math.abs(meters - lastMeters) / meters > 0.002) {
      lastMeters = meters;
      updateGauge(gauge, meters);
      updateScaleBar(scaleBar, engine.metersPerPixel(canvas.clientHeight));
    }
  });
  app.dataset.ready = 'true';
  // For automated screenshot tests.
  window.__anatomyOdyssey = { engine, goTo, openCard, switchDive, takeBranch, startTour, backend, state };
}

/** Center the subject in the uncovered part of the screen, between the gauge (or intro) and the card panel. */
function viewShift() {
  let gaugeRight = document.querySelector('.gauge')?.getBoundingClientRect().right ?? 0;
  const introEl = document.getElementById('intro');
  if (!introEl.hidden && wide.matches) gaugeRight = Math.max(gaugeRight, introEl.getBoundingClientRect().right);
  const panelEl = document.getElementById('panel');
  const sidePanel = !panelEl.hidden && wide.matches ? window.innerWidth - panelEl.getBoundingClientRect().left : 0;
  return (sidePanel - gaugeRight * 0.8) / 2;
}

/** On phones, lift the subject above the scene controls panel when it is showing. */
function viewShiftY() {
  if (wide.matches) return 0;
  const controlsEl = document.getElementById('scene-controls');
  if (!controlsEl || controlsEl.hidden) return 0;
  const covered = window.innerHeight - controlsEl.getBoundingClientRect().top;
  const top = document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0;
  return Math.max(0, (covered - top) / 2);
}

function announce(text) {
  $('announcer').textContent = text;
}

function showFatal(message) {
  app.dataset.ready = 'error';
  app.append(el('div', { class: 'fatal', role: 'alert' }, el('h1', { text: 'This browser cannot show the 3D view' }), el('p', { text: message })));
}

main();
