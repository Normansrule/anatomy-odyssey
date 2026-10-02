// Glossary dialog: every card, alphabetically, with a one-line definition
// and a button that flies to where it lives. Built from the card data.
import { el, clear } from './dom.js';
import { CARDS } from '../data/cards.js';
import { normalizeQuery } from './search.js';

export function firstSentence(text) {
  const m = String(text).match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : text).trim();
}

export function glossaryEntries() {
  return [...CARDS]
    .map((c) => ({ id: c.id, title: c.title, definition: firstSentence(c.what), terms: [c.title, ...(c.aliases ?? [])].map(normalizeQuery).join(' ') }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function openGlossary(dialog, body, { onGo }) {
  const entries = glossaryEntries();
  clear(body);
  const list = el('dl', { class: 'glossary__list' });
  const count = el('p', { class: 'about__meta', 'aria-live': 'polite' });
  const input = el('input', { type: 'search', id: 'glossary-filter', class: 'glossary__filter', placeholder: 'Filter terms', maxlength: '60', autocomplete: 'off' });
  const render = () => {
    const q = normalizeQuery(input.value);
    clear(list);
    const shown = entries.filter((e) => !q || e.terms.includes(q));
    for (const e of shown) {
      list.append(
        el('div', { class: 'glossary__item' },
          el('dt', {}, el('button', { class: 'link-button', text: e.title, onclick: () => { dialog.close(); onGo(e.id); } })),
          el('dd', { text: e.definition }),
        ),
      );
    }
    count.textContent = `${shown.length} term${shown.length === 1 ? '' : 's'}`;
  };
  input.addEventListener('input', render);
  body.append(
    el('div', { class: 'about__head' },
      el('h2', { id: 'glossary-title', text: 'Glossary' }),
      el('button', { class: 'icon-button', text: 'Close', onclick: () => dialog.close() }),
    ),
    el('label', { class: 'visually-hidden', for: 'glossary-filter', text: 'Filter glossary terms' }),
    input,
    count,
    list,
  );
  render();
  dialog.showModal();
  input.focus();
}
