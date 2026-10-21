// Builds the guide website into dist/guide/ after `vite build`: a landing
// page drawn like the app's wall chart, plus the docs as booklet pages.
// Plain HTML and CSS with one small script, the same strict Content
// Security Policy as the app, and fonts served from the site itself.
//
//   node tools/build-guide.mjs            (run by `npm run build`)
import { createServer } from 'vite';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { markdownToHtml } from './markdown.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist', 'guide');
const REPO = 'https://github.com/Normansrule/anatomy-odyssey';

// The dives come from the app's own data, so the guide never drifts from it.
const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
const { DIVES } = await vite.ssrLoadModule('/src/data/dives.js');
const { formatLength, gaugeFraction } = await vite.ssrLoadModule('/src/science/scale.js');
const { getCard } = await vite.ssrLoadModule('/src/data/cards.js');
const { spread } = await vite.ssrLoadModule('/src/ui/key.js');
await vite.close();

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const DOCS = [
  { file: 'docs/STATE_OF_THE_MODEL.md', page: 'state-of-the-model.html', nav: 'State of the model', about: 'What is measured, what is drawn, and how sure each scene is.' },
  { file: 'docs/EQUATIONS.md', page: 'equations.html', nav: 'Equations', about: 'Every number the app computes, with a worked example and the test that checks it.' },
  { file: 'docs/SECURITY_MODEL.md', page: 'security-model.html', nav: 'Security', about: 'No accounts, no tracking, no network calls, and how that is enforced.' },
  { file: 'docs/PUBLISHING.md', page: 'publishing.html', nav: 'Publishing', about: 'How the website and the desktop app are built and released.' },
  { file: 'CHANGELOG.md', page: 'changelog.html', nav: 'Changelog', about: 'What changed in each version.' },
];
const links = {};
for (const d of DOCS) {
  const name = d.file.split('/').pop();
  for (const k of [d.file, name, `./${name}`, `../${d.file}`, `docs/${name}`]) links[k] = d.page;
}
links['README.md'] = `${REPO}#readme`;
links['../README.md'] = `${REPO}#readme`;

// Where each dive starts on the body, as a share of the picture: measured by
// tools/shoot-guide-body.py, which projects the zoom guide's anchors through
// the camera that drew guide/body.webp.
const bodyPicture = JSON.parse(readFileSync(join(root, 'guide', 'body-marks.json'), 'utf8'));
const ON_BODY = bodyPicture.marks;
const dives = DIVES.filter((d) => d.kind === 'dive' && d.status === 'built');
for (const d of dives) if (!ON_BODY[d.id]) throw new Error(`build-guide: no place on the body for the ${d.id} dive; run tools/shoot-guide-body.py`);
// Set crowded numbers (the head holds four dives) clear of each other, as the
// app's key does, at the narrowest the picture is shown.
const SHOWN_W = 260;
const shownH = (SHOWN_W * bodyPicture.size[1]) / bodyPicture.size[0];
const placed = spread(dives.map((d) => ({ id: d.id, x: (ON_BODY[d.id][0] / 100) * SHOWN_W, y: (ON_BODY[d.id][1] / 100) * shownH })), 30, 40);
const at = Object.fromEntries(placed.map((m) => [m.id, [+((m.x / SHOWN_W) * 100).toFixed(1), +((m.y / shownH) * 100).toFixed(1)]]));

// Per-dive positions and colors become CSS rules: the policy allows no style attributes.
const generated = [
  ...dives.map((d, i) => `.mark[data-n='${i + 1}'] { left: ${at[d.id][0]}%; top: ${at[d.id][1]}%; }`),
  ...dives.map((d, i) => `[data-n='${i + 1}'] { --swatch: ${d.swatch}; }`),
];

// The ruler: one dive's plates, each placed where its view height falls.
const rulerDive = DIVES.find((d) => d.id === 'skeletal');
const plates = rulerDive.steps.map((s, i) => ({ ...s, n: i + 1, f: gaugeFraction(s.frameMeters), size: formatLength(s.frameMeters, 2).text }));

const css = readFileSync(join(root, 'src/styles/app.css'), 'utf8');
const tokens = css.slice(css.indexOf(':root {'), css.indexOf('* {'));

function nav(current) {
  return DOCS.map((d) => `<li><a href="${d.page}"${d.page === current ? ' aria-current="page"' : ''}>${d.nav}</a></li>`).join('');
}

function page({ file, title, description, body, current = 'index.html' }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'" />
    <meta name="referrer" content="no-referrer" />
    <meta name="description" content="${escape(description)}" />
    <meta name="color-scheme" content="light dark" />
    <title>${escape(title)}</title>
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23eef0ea'/%3E%3Cpath d='M10 4c8 6 4 18 12 24M22 4c-8 6-4 18-12 24' stroke='%23a3242f' stroke-width='3' fill='none'/%3E%3C/svg%3E" />
    <link rel="stylesheet" href="guide.css" />
    <script src="theme.js"></script>
    <script src="guide.js" defer></script>
  </head>
  <body>
    <a class="skip" href="#main">Skip to the content</a>
    <div class="sheet">
      <header class="bar">
        <a class="bar__cell wordmark" href="index.html"${current === 'index.html' ? ' aria-current="page"' : ''}><span class="wordmark__glyph" aria-hidden="true"></span>Anatomy Odyssey</a>
        <nav class="bar__nav" aria-label="Guide"><ul>${nav(current)}</ul></nav>
        <button class="bar__cell theme-toggle" id="theme-toggle" type="button" hidden>Slate</button>
        <a class="bar__cell bar__open" href="../">Open the chart</a>
      </header>
${body}
      <footer class="foot">
        <p>Anatomy Odyssey ${escape(pkg.version)}. Open source under the MIT License. <a href="${REPO}">Source on GitHub</a>.</p>
        <p>A teaching model, not medical advice. Body meshes from BodyParts3D (Database Center for Life Science), used under CC BY-SA 2.1 Japan.</p>
      </footer>
    </div>
  </body>
</html>
`.replace(/^\n/, '');
}

/** A title as it reads mid-sentence: "Glutamate" becomes "glutamate", but "DNA", "ATP" and "O₂" stay. */
const midSentence = (t) => (/^[A-Z][a-z]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t);

function landing() {
  const marks = dives.map((d, i) => `<a class="mark" data-n="${i + 1}" href="../?dive=${d.id}" tabindex="-1" aria-hidden="true">${i + 1}</a>`).join('');
  const key = dives
    .map((d, i) => {
      const last = d.steps[d.steps.length - 1];
      const name = d.title.replace(/ dive$/, '');
      return `<li><a class="key__item" data-n="${i + 1}" href="../?dive=${d.id}"><span class="key__num" aria-hidden="true">${i + 1}</span><span class="key__name">${escape(name)}<span class="visually-hidden">:</span></span><span class="key__depth">${d.steps.length} plates, down to ${escape(midSentence(last.title))}</span></a></li>`;
    })
    .join('');
  const ticks = [];
  for (let e = 1; e >= -10; e--) ticks.push(`<li class="ruler__tick${e % 3 === 0 ? ' is-major' : ''}" data-e="${e}"><span>${escape(formatLength(10 ** e, 1).text)}</span></li>`);
  generated.push(...[...Array(12)].map((_, k) => `.ruler__tick[data-e='${1 - k}'] { --at: ${((k / 11) * 100).toFixed(2)}%; }`));
  // Pins for plates that land close together on the ruler stack upward, like labels set clear on a chart.
  let lastF = -1;
  let row = 0;
  const pins = plates
    .map((p) => {
      row = p.f - lastF < 0.035 ? row + 1 : 0;
      lastF = p.f;
      generated.push(`.ruler__pin[data-i='${p.n}'] { --at: ${(p.f * 100).toFixed(2)}%; --row: ${row}; }`);
      return `<li class="ruler__pin" data-i="${p.n}">${p.n}</li>`;
    })
    .join('');
  const strip = plates
    .map((p) => {
      const card = getCard(p.card);
      return `<li class="plate-strip__item" data-i="${p.n}"><a href="../?dive=skeletal&amp;step=${p.id}"><img src="plates/${p.id}.webp" alt="" width="480" height="300" loading="lazy" decoding="async" /><span class="plate-strip__num">Plate ${p.n}</span><span class="plate-strip__title">${escape(p.title)}</span><span class="plate-strip__size">${escape(card?.size ?? p.size)}</span></a></li>`;
    })
    .join('');
  const booklet = DOCS.map((d) => `<tr><th scope="row"><a href="${d.page}">${d.nav}</a></th><td>${d.about}</td></tr>`).join('');
  const body = `      <main id="main">
        <section class="hero" aria-labelledby="title">
          <div class="hero__title">
            <p class="eyebrow">An open anatomy chart that zooms</p>
            <h1 id="title">From two meters to one molecule.</h1>
            <p class="lede">Anatomy Odyssey is a wall chart of the human body you can fall into. Drag the scale and the view flies plate by plate from your whole body to organ, tissue, cell and molecule, each one drawn at its real size.</p>
            <div class="actions">
              <a class="button button--primary" href="../">Open the chart</a>
              <a class="button" href="${REPO}/releases/latest">Get the desktop app</a>
            </div>
            <dl class="facts">
              <div><dt>Dives</dt><dd>${dives.length}</dd></div>
              <div><dt>Deepest view</dt><dd>${escape(formatLength(Math.min(...dives.flatMap((d) => d.steps.map((s) => s.frameMeters))), 1).text)}</dd></div>
              <div><dt>Tracking</dt><dd>None</dd></div>
            </dl>
          </div>
          <figure class="specimen" id="specimen">
            <div class="specimen__frame">
              <img src="body.webp" alt="The 3D body from the app: a see-through figure showing the skeleton, organs, blood vessels and lymph nodes." width="${bodyPicture.size[0]}" height="${bodyPicture.size[1]}" fetchpriority="high" />
              <div class="marks">${marks}</div>
            </div>
            <figcaption>Plate 1. The whole body, about 1.64 m tall in this model.</figcaption>
          </figure>
          <nav class="key" aria-labelledby="key-title">
            <h2 id="key-title">Key: where each dive starts</h2>
            <ol>${key}</ol>
          </nav>
          <svg class="leader" id="leader" aria-hidden="true" focusable="false" hidden><line id="leader-line" /></svg>
        </section>

        <section class="howto" aria-labelledby="howto-title">
          <h2 id="howto-title" class="section-title">How to read the chart</h2>
          <ol class="howto__steps">
            <li><span class="howto__num" aria-hidden="true">1</span><h3>Drag the scale</h3><p>The ruled column on the left is a slider from 10 m down to a tenth of a nanometer. Drag it and the view zooms there, flying on to the next plate when you get close.</p></li>
            <li><span class="howto__num" aria-hidden="true">2</span><h3>Point at a number</h3><p>Every part in view has a number on the model and the same number in the key. Point at either one and a red leader line draws between them.</p></li>
            <li><span class="howto__num" aria-hidden="true">3</span><h3>Follow the plates</h3><p>The plates along the bottom are the stops on this dive. Some open up: change the heart rate, fill the bladder, or follow a mouthful from mouth to bowel.</p></li>
          </ol>
        </section>

        <section class="scale" aria-labelledby="scale-title">
          <div class="section-head">
            <h2 id="scale-title" class="section-title">Seven plates, one ruler</h2>
            <p>The skeletal dive, with each plate pinned to the height of its view on a ruler from 10 m to 0.1 nm. Each step down is ten to a thousand times smaller.</p>
          </div>
          <div class="ruler" aria-hidden="true"><ol>${ticks.join('')}</ol><ol>${pins}</ol></div>
          <ol class="plate-strip">${strip}</ol>
        </section>

        <section class="booklet-index" aria-labelledby="booklet-title">
          <h2 id="booklet-title" class="section-title">The booklet</h2>
          <table><tbody>${booklet}</tbody></table>
        </section>
      </main>`;
  return page({ title: 'Anatomy Odyssey: a body you can zoom into', description: 'A zoomable 3D wall chart of the human body, from two meters down to a single molecule.', body });
}

function docPage(d, i) {
  const { html, headings } = markdownToHtml(readFileSync(join(root, d.file), 'utf8'), { links });
  const toc = headings.length
    ? `<nav class="toc" aria-labelledby="toc-title"><p id="toc-title" class="toc__title">On this page</p><ol>${headings.map((h) => `<li><a href="#${h.id}">${escape(h.text)}</a></li>`).join('')}</ol></nav>`
    : '<div class="toc" aria-hidden="true"></div>';
  const prev = DOCS[i - 1];
  const next = DOCS[i + 1];
  const pager = `<nav class="pager" aria-label="More pages">${prev ? `<a class="pager__prev" href="${prev.page}"><span>Previous</span>${prev.nav}</a>` : '<a class="pager__prev" href="index.html"><span>Back to</span>The chart guide</a>'}${next ? `<a class="pager__next" href="${next.page}"><span>Next</span>${next.nav}</a>` : ''}</nav>`;
  const body = `      <main id="main" class="booklet">
        ${toc}
        <article class="prose">
${html}
          ${pager}
        </article>
      </main>`;
  return page({ title: `${d.nav}: Anatomy Odyssey`, description: d.about, body, current: d.page });
}

mkdirSync(join(out, 'fonts'), { recursive: true });
mkdirSync(join(out, 'plates'), { recursive: true });
writeFileSync(join(out, 'index.html'), landing());
DOCS.forEach((d, i) => writeFileSync(join(out, d.page), docPage(d, i)));
writeFileSync(join(out, 'guide.css'), `/* Built by tools/build-guide.mjs. Tokens come from src/styles/app.css. */\n${tokens}\n${readFileSync(join(root, 'guide/guide.css'), 'utf8')}\n/* Positions and colors from the dive data. */\n${generated.join('\n')}\n`);
for (const f of ['guide.js', 'theme.js', 'body.webp']) cpSync(join(root, 'guide', f), join(out, f));
const fonts = {
  'archivo.woff2': 'node_modules/@fontsource-variable/archivo/files/archivo-latin-standard-normal.woff2',
  'atkinson-400.woff2': 'node_modules/@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-400-normal.woff2',
  'atkinson-700.woff2': 'node_modules/@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-700-normal.woff2',
};
for (const [name, from] of Object.entries(fonts)) cpSync(join(root, from), join(out, 'fonts', name));
for (const p of plates) cpSync(join(root, 'docs/screenshots', `${p.id}.webp`), join(out, 'plates', `${p.id}.webp`));
console.log(`guide: ${DOCS.length + 1} pages in dist/guide`);
