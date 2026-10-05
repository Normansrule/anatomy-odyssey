// The About dialog: settings, how to use it, the honest state of the model,
// privacy, and credits.
import { el, clear } from './dom.js';
import { DIVES } from '../data/dives.js';
import { LIBRARY } from '../data/library.js';
import { describeMeasurement } from '../engine/benchmark.js';

function radioGroup(name, legend, options, current, onChange) {
  return el('fieldset', { class: 'setting' },
    el('legend', { class: 'setting__legend', text: legend }),
    el('div', { class: 'setting__options' },
      options.map(([value, label]) => {
        const input = el('input', { type: 'radio', name, value, id: `${name}-${value}` });
        input.checked = value === current;
        input.addEventListener('change', () => input.checked && onChange(value));
        return el('label', { class: 'setting__option', for: `${name}-${value}` }, input, el('span', { text: label }));
      }),
    ),
  );
}

export const WEB_URL = 'https://normansrule.github.io/anatomy-odyssey/';
export const RELEASES_URL = 'https://github.com/Normansrule/anatomy-odyssey/releases/latest';
export const SOURCE_URL = 'https://github.com/Normansrule/anatomy-odyssey';

/** True inside the Tauri desktop app (its pages come from tauri://localhost or http://tauri.localhost). */
export function isDesktopApp(w = typeof window === 'undefined' ? undefined : window) {
  if (!w) return false;
  return '__TAURI_INTERNALS__' in w || w.location?.protocol === 'tauri:' || w.location?.hostname === 'tauri.localhost';
}

/** The "web and desktop" section: links on the web; plain text in the desktop app, whose window must not navigate away. */
function versionsSection(desktop) {
  const link = (href, text) => el('a', { href, target: '_blank', rel: 'noopener noreferrer', text });
  return [
    el('h3', { text: 'Web and desktop versions' }),
    desktop
      ? el('p', { text: `You are using the desktop app. The same app runs in any current browser at ${WEB_URL.replace('https://', '').replace(/\/$/, '')}, and new versions are posted on the project’s GitHub Releases page.` })
      : el('p', {}, 'You are using the web version. It is also available as a desktop app for Windows, macOS and Linux: ', link(RELEASES_URL, 'download the desktop app'), '. The source code is on ', link(SOURCE_URL, 'GitHub'), '.'),
  ];
}

/** Lowercase a name for mid-sentence use, but keep acronyms such as DNA. */
const lower = (t) => (/^[A-Z]{2,}/.test(t) ? t : t.toLowerCase());

export function renderAbout(container, { backend, settings, onSetting, onReset, onRemeasure, onClose }) {
  clear(container);
  const built = DIVES.filter((d) => d.status === 'built' && d.kind === 'dive');
  const modules = DIVES.filter((d) => d.status === 'built' && d.kind === 'module');
  const planned = DIVES.filter((d) => d.status === 'planned');
  const speakBox = el('input', { type: 'checkbox', id: 'setting-speak' });
  speakBox.checked = Boolean(settings.speak);
  speakBox.addEventListener('change', () => onSetting('speak', speakBox.checked));
  const speechAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window;

  container.append(...[
    el('div', { class: 'about__head' },
      el('h2', { id: 'about-title', text: 'About Anatomy Odyssey' }),
      el('button', { class: 'icon-button', text: 'Close', onclick: onClose }),
    ),
    el('p', { text: 'An open-source guided journey through the human body across scales. Each dive is a short, authored descent that stops at the smallest building block well-understood biology supports for that path. Shared building blocks, like the nucleus and DNA, are built once and reused by every dive that reaches them.' }),

    el('h3', { text: 'Settings' }),
    radioGroup('motion', 'Motion', [['system', 'Follow my device'], ['reduce', 'Reduce motion'], ['full', 'Full motion']], settings.motion, (v) => onSetting('motion', v)),
    radioGroup('look', 'Look', [['natural', 'Natural colors'], ['stain', 'Stain colors']], settings.look, (v) => onSetting('look', v)),
    el('p', { class: 'setting__note', text: 'Natural shows organs and tissues in the colors they have in life, with textured, wet-looking surfaces. Stain uses the colors of a stained microscope slide. Cells and molecules always use stain colors: real ones are nearly colorless.' }),
    radioGroup('quality', 'Picture quality', [['low', 'Battery saver'], ['auto', 'Balanced'], ['high', 'Sharp']], settings.quality, (v) => onSetting('quality', v)),
    el('div', { class: 'setting__bench' },
      el('p', { class: 'setting__note', id: 'benchmark-note', text: describeMeasurement(settings.benchmark) }),
      onRemeasure ? el('button', { class: 'text-button', text: 'Measure this device again', onclick: () => {
        onRemeasure();
        container.querySelector('#benchmark-note').textContent = describeMeasurement(null);
      } }) : null,
    ),
    el('label', { class: 'setting__option setting__check', for: 'setting-speak' }, speakBox, el('span', { text: speechAvailable ? 'Read tour captions aloud' : 'Read tour captions aloud (not supported in this browser)' })),

    el('h3', { text: 'How to move around' }),
    el('ul', {},
      el('li', { text: 'Drag to orbit, scroll or pinch to zoom, right-drag or two-finger drag to pan.' }),
      el('li', { text: 'Click any structure to open its card. The card also lists everything in view, so you can pick parts with the keyboard.' }),
      el('li', { text: 'Keyboard: → or Page Down dives deeper, ← or Page Up zooms out, / jumps to search, M opens the map, G opens the glossary, T plays the tour, Esc closes cards and stops the tour.' }),
    ),

    ...versionsSection(isDesktopApp()),

    el('h3', { text: 'State of the model' }),
    el('p', { text: 'Built and playable:' }),
    el('ul', {},
      built.map((d) => {
        const trips = d.steps.filter((s) => s.branch).map((s) => `side trip from the ${s.title.toLowerCase()} into the shared ${s.branch.via.map((id) => lower(LIBRARY.find((e) => e.id === id)?.title.split(' (')[0] ?? id)).join(' and ')}`);
        return el('li', {}, el('strong', { text: d.title }), `: ${d.steps.map((s) => s.title).join(' → ')}.${trips.length ? ` Also a ${trips.join('; ')}.` : ''}`);
      }),
      modules.map((d) => el('li', {}, el('strong', { text: d.title }), `: ${d.summary}`)),
    ),
    planned.length ? el('p', { text: 'Planned:' }) : null,
    planned.length ? el('ul', {}, planned.map((d) => el('li', {}, el('strong', { text: d.title }), `: ${d.path.join(' → ')}.`))) : null,
    el('p', { text: `Shared library: ${LIBRARY.filter((e) => e.status === 'built').map((e) => e.title).join(', ')} are built; ${LIBRARY.filter((e) => e.status === 'planned').length} more building blocks are planned.` }),
    el('p', { text: 'All anatomy is procedural (built from simple shapes in code) and labeled as a generalized teaching model. Tissue surfaces (color, bumps, wet sheen) are generated in code too: realistic patterns, not photographs. The red blood cell uses a measured shape (Evans and Fung, 1972), and the small molecules (amino acids, nucleotides, ATP, a phospholipid, and the buffer molecules) use 3D geometry generated from their chemical structures with RDKit. Planned next: Z-Anatomy meshes (CC BY-SA 4.0) for the organs and Protein Data Bank structures for the large molecules.' }),

    el('h3', { text: 'Privacy and safety' }),
    el('ul', {},
      el('li', { text: 'No accounts, no analytics, no network calls. Your progress and settings stay in this browser. The only links out are the GitHub ones above, and they open only when you click them.' }),
      el('li', { text: 'This is an educational model, not medical advice, and it cannot diagnose anything.' }),
    ),
    el('button', { class: 'text-button', text: 'Clear my progress', onclick: onReset }),

    el('h3', { text: 'Credits' }),
    el('ul', {},
      el('li', { text: 'Rendering: three.js (MIT license).' }),
      el('li', { text: 'Type: Atkinson Hyperlegible Next and Literata (SIL Open Font License 1.1).' }),
      el('li', { text: 'Content sources are cited on every card.' }),
    ),
    el('p', { class: 'about__meta', text: `Renderer in use: ${backend}.` }),
  ].filter(Boolean));
}
