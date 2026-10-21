// The guide's three behaviors: the light/slate switch; the landing page's
// living key, where pointing at a dive draws a red leader line to the place
// on the body where it starts (and pointing at a number lights its entry);
// and the fall, where scrolling drops through the skeletal dive's plates.
import { formatLength, gaugeFraction } from './scale.js';
import { fallFrame } from './fall.js';

const root = document.documentElement;
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
const isDark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : systemDark.matches);

const toggle = document.getElementById('theme-toggle');
function labelToggle() {
  toggle.textContent = isDark() ? 'Light sheet' : 'Slate';
  toggle.setAttribute('aria-label', isDark() ? 'Switch to the light sheet' : 'Switch to slate (dark)');
}
toggle.hidden = false;
labelToggle();
systemDark.addEventListener('change', labelToggle);
toggle.addEventListener('click', () => {
  root.dataset.theme = isDark() ? 'light' : 'dark';
  try {
    localStorage.setItem('ao-guide-theme', root.dataset.theme);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
  labelToggle();
});

const hero = document.querySelector('.hero');
const leader = document.getElementById('leader');
const line = document.getElementById('leader-line');
if (hero && leader) {
  const R = 13; // the number circles' radius, so the line runs rim to rim
  let hot = null;
  const rim = (a, b) => {
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: a.x + ((b.x - a.x) / d) * R, y: a.y + ((b.y - a.y) / d) * R };
  };
  const centerOf = (node, box) => {
    const r = node.getBoundingClientRect();
    return { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2 };
  };
  function draw() {
    if (!hot) return;
    const box = hero.getBoundingClientRect();
    const from = centerOf(hot.querySelector('.key__num'), box);
    const to = centerOf(document.querySelector(`.mark[data-n='${hot.dataset.n}']`), box);
    const a = rim(from, to);
    const b = rim(to, from);
    line.setAttribute('x1', a.x);
    line.setAttribute('y1', a.y);
    line.setAttribute('x2', b.x);
    line.setAttribute('y2', b.y);
    return Math.hypot(b.x - a.x, b.y - a.y);
  }
  function light(item) {
    if (item === hot) return;
    hot?.classList.remove('is-hot');
    document.querySelector('.mark.is-hot')?.classList.remove('is-hot');
    hot = item;
    if (!item) {
      leader.toggleAttribute('hidden', true); // SVG elements have no .hidden property
      return;
    }
    item.classList.add('is-hot');
    document.querySelector(`.mark[data-n='${item.dataset.n}']`).classList.add('is-hot');
    const length = draw();
    leader.toggleAttribute('hidden', false);
    // The line draws itself out from the key toward the body.
    if (!reduce.matches && line.animate) {
      const dash = `${length}px ${length}px`;
      line.animate([{ strokeDasharray: dash, strokeDashoffset: `${length}px` }, { strokeDasharray: dash, strokeDashoffset: '0px' }], { duration: 260, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
    }
  }
  const itemFor = (e) => e.target.closest?.('.key__item') ?? (e.target.closest?.('.mark') ? document.querySelector(`.key__item[data-n='${e.target.closest('.mark').dataset.n}']`) : null);
  for (const type of ['pointerover', 'focusin']) hero.addEventListener(type, (e) => itemFor(e) && light(itemFor(e)));
  for (const type of ['pointerout', 'focusout']) {
    hero.addEventListener(type, (e) => {
      const to = e.relatedTarget;
      if (!to || !(to.closest?.('.key__item') || to.closest?.('.mark'))) light(null);
    });
  }
  new ResizeObserver(() => draw()).observe(hero);
}

// The fall. Each plate grows past the viewer and fades as the next, smaller
// one rises out of it; the readout and the needle on the ruler follow the
// view height. Reduced motion keeps the plain row of specimens.
const fall = document.getElementById('fall');
if (fall && !reduce.matches) {
  const plates = [...fall.querySelectorAll('.fall__plate')];
  const images = plates.map((p) => p.querySelector('img'));
  const meters = plates.map((p) => Number(p.dataset.m));
  const readout = document.getElementById('fall-meters');
  const marker = document.getElementById('fall-marker');
  const track = fall.querySelector('.fall__track');
  for (const img of images) img.loading = 'eager'; // all seven are on one stage
  fall.classList.add('is-scrolly');
  let active = -1;
  let queued = false;
  function render() {
    queued = false;
    const box = track.getBoundingClientRect();
    const frame = fallFrame(-box.top / Math.max(1, box.height - window.innerHeight), meters);
    images.forEach((img, i) => {
      let opacity = 0;
      let scale = 1;
      if (i === frame.from) {
        opacity = 1 - frame.w;
        scale = 1 + 2.4 * frame.w * frame.w; // accelerating, as if falling into it
      } else if (i === frame.to) {
        opacity = frame.w;
        scale = 0.42 + 0.58 * frame.w;
      }
      img.style.opacity = opacity.toFixed(3);
      img.style.transform = `scale(${scale.toFixed(4)})`;
    });
    if (frame.active !== active) {
      plates[active]?.classList.remove('is-on');
      active = frame.active;
      plates[active].classList.add('is-on');
    }
    readout.textContent = formatLength(frame.meters, 2).text;
    marker.style.top = `${(gaugeFraction(frame.meters) * 100).toFixed(2)}%`;
  }
  const queue = () => {
    if (!queued) requestAnimationFrame(render);
    queued = true;
  };
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  reduce.addEventListener('change', () => reduce.matches && location.reload());
  render();
}
