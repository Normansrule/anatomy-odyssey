// The guide's two behaviors: the light/slate switch, and the landing page's
// living key, where pointing at a dive draws a red leader line to the place
// on the body where it starts (and pointing at a number lights its entry).

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
