// The click-to-learn card panel.
import { el, clear } from './dom.js';
import { getCard, DEFAULT_LABELS, PLANNED_CARDS } from '../data/cards.js';
import { REFERENCES } from '../data/references.js';
import { getLibraryEntry, LIBRARY } from '../data/library.js';
import { TIERS } from '../data/dives.js';

function section(title, ...content) {
  return el('section', { class: 'card__section' }, el('h3', { class: 'card__heading', text: title }), ...content);
}

function references(ids) {
  const items = ids.map((id) => REFERENCES[id]).filter(Boolean);
  if (!items.length) return null;
  return section(
    'Sources',
    el('ul', { class: 'card__refs' }, items.map((r) => el('li', {}, el('a', { href: r.url, target: '_blank', rel: 'noopener noreferrer', text: r.text })))),
  );
}

function sharedBlock(libraryId, ctx) {
  const entry = getLibraryEntry(libraryId);
  if (!entry) return null;
  const users = ctx.usedBy.get(libraryId) ?? [];
  const reached = el(
    'ul',
    { class: 'card__links' },
    users.map((u) =>
      el(
        'li',
        {},
        u.status === 'built'
          ? el('button', { class: 'link-button', text: u.via === 'side-trip' ? `${u.title} (side trip)` : u.title, onclick: () => ctx.onJumpDive(u.diveId, libraryId) })
          : el('span', { class: 'card__planned' }, u.title, el('span', { class: 'tag', text: 'planned' })),
      ),
    ),
  );
  const parts = entry.madeOf.map((id) => getLibraryEntry(id)).filter(Boolean);
  const partOf = LIBRARY.filter((e) => e.madeOf.includes(libraryId));
  const linkList = (entries) => el('ul', { class: 'card__links' }, entries.map((p) => el('li', {},
    el('button', { class: 'link-button', text: p.title, onclick: () => (p.status === 'built' ? ctx.onExplore(p.id) : ctx.onOpenLibrary(p.id)) }),
    p.status === 'planned' ? el('span', { class: 'tag', text: 'planned' }) : null)));
  return section(
    'Shared building block',
    el('p', { class: 'card__note', text: users.length ? `Authored once and reused. ${users.length} dive${users.length === 1 ? '' : 's'} lead here:` : 'Authored once and reused. You reach it by zooming in from the building blocks below.' }),
    users.length ? reached : null,
    partOf.length ? el('div', { class: 'card__madeof' }, el('p', { class: 'card__note', text: 'Part of (zoom out to):' }), linkList(partOf)) : null,
    parts.length ? el('div', { class: 'card__madeof' }, el('p', { class: 'card__note', text: 'Made of (zoom in to):' }), linkList(parts)) : null,
  );
}

export function renderCard(container, cardId, ctx) {
  const card = getCard(cardId);
  clear(container);
  if (!card) return;
  const tier = ctx.tierOf(card.home);
  const tierText = tier ? `${TIERS[tier]} tier` : 'Whole body tier';
  const labels = card.labels ?? DEFAULT_LABELS;
  const step = ctx.currentStep;
  const isFocus = step.focusCard === cardId && ctx.nextStep && !ctx.nextStep.sideTrip;
  const isSideTripFocus = ctx.nextStep?.sideTrip && step.focusCard === cardId;
  const branch = step.branch && !ctx.onSideTrip && (cardId === step.branch.card || cardId === step.card) ? step.branch : null;
  const isBottom = !ctx.nextStep && cardId === step.card;
  const structures = ctx.structures().filter((id) => id !== cardId).map(getCard).filter(Boolean);

  const parts = [
    el('p', { class: 'card__tier', text: tierText }),
    el('h2', { class: 'card__title', id: 'card-title', text: card.title }),
    el('p', { class: 'card__size', text: card.size }),
    el('ul', { class: 'card__labels', 'aria-label': 'About this view' }, labels.map((l) => el('li', { class: 'tag', text: l }))),
    isFocus || isSideTripFocus
      ? el('button', { class: 'primary-button card__dive', text: `Dive into the ${ctx.nextStep.title.toLowerCase()}`, onclick: ctx.onDive })
      : null,
    branch
      ? el('button', { class: 'secondary-button card__dive', text: `${branch.label}`, onclick: ctx.onBranch })
      : null,
    isBottom && ctx.hasQuiz
      ? el('button', { class: 'secondary-button card__dive', text: 'Check yourself: 4 questions', onclick: ctx.onQuiz })
      : null,
    section('What it does', el('p', { class: 'card__text', text: card.what })),
    section('Why it matters', el('p', { class: 'card__text', text: card.why })),
    el(
      'div',
      { class: 'card__expert' },
      el('button', {
        class: 'switch',
        role: 'switch',
        'aria-checked': String(ctx.expert),
        onclick: () => ctx.onToggleExpert(),
      }, el('span', { class: 'switch__track', 'aria-hidden': 'true' }), 'Expert detail'),
      ctx.expert ? el('p', { class: 'card__text card__text--expert', text: card.expert }) : null,
    ),
    card.library ? sharedBlock(card.library, ctx) : null,
    card.related?.length
      ? section('Related', el('ul', { class: 'card__links' }, card.related.map((r) => el('li', {}, el('button', { class: 'link-button', text: r.label, onclick: () => ctx.onRelated(r.dive) })))))
      : null,
    structures.length
      ? section('In this view', el('ul', { class: 'card__links card__links--inline' }, structures.map((c) => el('li', {}, el('button', { class: 'link-button', text: c.title, onclick: () => ctx.onOpenCard(c.id) })))))
      : null,
    references(card.refs ?? []),
  ];
  container.append(...parts.filter(Boolean));
}

/** A card for a planned library entry, reached from search or a "made of" link. */
export function renderPlanned(container, libraryId, ctx) {
  const entry = getLibraryEntry(libraryId);
  clear(container);
  if (!entry) return;
  if (entry.status === 'built') {
    renderCard(container, entry.card, ctx);
    return;
  }
  const users = ctx.usedBy.get(libraryId) ?? [];
  container.append(
    el('p', { class: 'card__tier', text: 'Shared library' }),
    el('h2', { class: 'card__title', id: 'card-title', text: entry.title }),
    el('ul', { class: 'card__labels' }, el('li', { class: 'tag tag--planned', text: 'Not built yet' })),
    section('What it is', el('p', { class: 'card__text', text: PLANNED_CARDS[libraryId] ?? '' })),
    section(
      'Where it will appear',
      users.length
        ? el('ul', { class: 'card__links' }, users.map((u) => el('li', { text: `${u.title}${u.status === 'planned' ? ' (planned)' : ''}` })))
        : el('p', { class: 'card__note', text: 'Reached from other shared building blocks.' }),
    ),
    el('p', { class: 'card__note', text: 'This building block is on the roadmap. See About → State of the model for what exists today.' }),
  );
}
