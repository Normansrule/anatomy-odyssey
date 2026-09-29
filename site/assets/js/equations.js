/* Equation Atlas page.
 * Builds every chapter, card, calculator and plot from data/equations.json.
 * Physics lives in the JSON expressions (evaluated by equations-core.js), so
 * the page, docs/EQUATIONS.md and scripts/check_equations.mjs agree.
 */
import * as core from "./equations-core.js";

const katex = window.katex;
const gsap = window.gsap;
const REDUCED = window.Codex ? Codex.reducedMotion : matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const ACCENT = { ice: "#7cc8ff", flame: "#ff7a3d", plasma: "#ff4f9a", sol: "#ffc24b", nebula: "#b18cff", aurora: "#4ef0b8",
  cyan: "#3fe0f0", coral: "#ff7466", lime: "#b9ef5a", steel: "#a3b6ff" };
const CH = n => core.chapLabel(n);

/* Chapter icons for the orbit navigator (24 × 24, stroked in the chapter colour). */
const ICONS = {
  gravity: '<circle cx="12" cy="12" r="3.6"/><ellipse cx="12" cy="12" rx="10" ry="4.3" transform="rotate(-24 12 12)"/><circle cx="20.2" cy="8.3" r="1.4" class="f"/>',
  rockets: '<path d="M12 2.2c3 2.4 4.4 6 4.4 9.8V17H7.6v-5c0-3.8 1.4-7.4 4.4-9.8z"/><circle cx="12" cy="9.6" r="1.6"/><path d="M7.6 13.5 5 16.6v3.2l2.6-1.6M16.4 13.5l2.6 3.1v3.2l-2.6-1.6M10 19.5l2 2.6 2-2.6"/>',
  atmosphere: '<path d="M8.5 4h7l3.2 10H5.3z"/><path d="M5.3 14c1.8 3.2 11.6 3.2 13.4 0"/><path d="M4 20.5 6 18.5M9 22l.8-2.4M15 22l-.8-2.4M20 20.5l-2-2"/>',
  spacecraft: '<rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M1.8 8.6h5.4v6.8H1.8zM16.8 8.6h5.4v6.8h-5.4zM7.2 12h2.3M14.5 12h2.3M12 9.5V6.4"/><path d="M9.3 4.6a3.6 3.6 0 0 0 5.4 0"/>',
  light: '<path d="M12 2.2l2.3 6.9 7.1.6-5.5 4.6 1.7 7-5.6-3.9-5.6 3.9 1.7-7-5.5-4.6 7.1-.6z"/>',
  optics: '<path d="M3 13.6 16.6 7.8l2.1 4.6L5 18.2z"/><path d="M16.6 7.8l3-1.3 1.7 3.8-3 1.3"/><path d="M10.4 15.5 7.4 22M11.4 15.1l3.8 6.9"/>',
  sun: '<circle cx="12" cy="12" r="4.4"/><path d="M12 1.8v2.6M12 19.6v2.6M1.8 12h2.6M19.6 12h2.6M4.8 4.8l1.8 1.8M17.4 17.4l1.8 1.8M4.8 19.2l1.8-1.8M17.4 6.6l1.8-1.8"/>',
  exoplanets: '<circle cx="10.5" cy="12" r="7.2"/><circle cx="16.4" cy="9.4" r="2.5" class="f"/><path d="M2 21.5h4l1.2 1.3h3l1.2-1.3H22" />',
  relativity: '<ellipse cx="12" cy="12" rx="10.2" ry="3.4"/><circle cx="12" cy="12" r="3.8" class="f"/><path d="M5 5.5c2.5 1.6 4.3 2.4 7 2.4s4.5-.8 7-2.4"/>',
  cosmology: '<path d="M12.2 12c.3-1.6 2.3-2.2 3.3-1 1.3 1.6.1 4.3-2.4 4.9-3.2.8-6.1-1.6-6.1-4.9 0-4 3.8-6.9 8-6.4 4.4.6 7.3 4.8 6.5 9.3"/><circle cx="12.2" cy="12" r="1" class="f"/><circle cx="4" cy="5" r=".6" class="f"/><circle cx="20" cy="20" r=".6" class="f"/>',
};
const icon = id => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[id] || '<circle cx="12" cy="12" r="6"/>'}</svg>`;

/* ---------------------------------------------------------------- KaTeX */
// HTML-only output keeps the DOM small (MathML doubles it); each formula
// carries its LaTeX source as an accessible label instead.
function tex(s, display = false) {
  try { return `<span class="tx" role="img" aria-label="${esc(s)}">${katex.renderToString(s, { throwOnError: false, strict: "ignore", displayMode: display, output: "html" })}</span>`; }
  catch (e) { return `<code>${esc(s)}</code>`; }
}
/** Text with inline $…$ math. */
function rich(text) {
  return String(text || "").split("$").map((p, i) => (i % 2 ? tex(p) : esc(p))).join("");
}

/* ---------------------------------------------------------------- utils */
let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("on"), 1700);
}
async function copy(text, msg) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e2) { /* ignore */ }
    ta.remove();
  }
  toast(msg || "Copied");
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ================================================================ boot */
let DATA, K, NUM;
const CARDS = []; // { eq, ch, art, st } — st is set once the card is hydrated

fetch("data/equations.json")
  .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then(boot)
  .catch(err => {
    console.error(err);
    $("#atlas").innerHTML = `<div class="callout">Could not load <code>data/equations.json</code> (${esc(err.message)}). If you opened this file directly, serve the folder instead: <code>python3 -m http.server --directory site</code>.</div>`;
  });

function boot(data) {
  DATA = data;
  K = core.makeScope(data.constants);
  NUM = core.numbering(data);
  buildHero();
  buildToolbar();
  buildAtlas();
  buildConstants();
  setupSearch();
  setupSpy();
  setupMotion();
  setupJumps();
  setupKeys();
  // deep link: land on the target, then keep it pinned while cards above hydrate
  const target = location.hash.length > 1 && document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (target) requestAnimationFrame(() => land(target, false));
  hydrateRest();
  $("#atlas").setAttribute("aria-busy", "false");
}

/* ================================================================ hero: orbit navigator */
const MONTAGE = ["tsiolkovsky", "mass-energy", "vis-viva", "rayleigh", "transit-depth", "planck", "schwarzschild", "friedmann", "parker-wind", "stefan-boltzmann", "friis", "lorentz-factor"];
const RING2 = [String.raw`T^2 \propto a^3`, String.raw`\Delta v`, String.raw`1.22\tfrac{\lambda}{D}`, String.raw`F = \tfrac{L}{4\pi d^2}`, String.raw`\sigma T^4`, String.raw`(R_p/R_\star)^2`, String.raw`v_c = \sqrt{\mu/r}`, String.raw`E = mc^2`, String.raw`\rho v^2`, String.raw`r_s = \tfrac{2GM}{c^2}`];

function buildHero() {
  const eqs = DATA.equations;
  const plots = eqs.filter(e => e.plot).length;
  countTo($("#st-eq"), eqs.length);
  countTo($("#st-ch"), DATA.chapters.length);
  countTo($("#st-plot"), plots);
  countTo($("#st-k"), DATA.constants.length);

  // outer ring: one clickable planet per chapter, orbiting; inner ring: decorative mini-equations
  const counts = {};
  eqs.forEach(e => { counts[e.chapter] = (counts[e.chapter] || 0) + 1; });
  const chs = DATA.chapters;
  $("#ring1").innerHTML = chs.map((c, i) => {
    const a = (360 / chs.length) * i;
    return `<span class="mt-item ch" style="--a:${a}deg;--acc:${ACCENT[c.color]};--d:${i * 70}ms"><span class="mt-inner"><a class="mt-up mt-ch" href="#ch-${c.id}" data-ch="${c.id}" aria-label="Chapter ${c.n}: ${esc(c.title)}, ${counts[c.id]} equations"><span class="mt-ico">${icon(c.id)}</span><span class="mt-lbl">${esc(c.short || c.title)}</span></a></span></span>`;
  }).join("");
  $("#ring2").innerHTML = RING2.map((s, i) => `<span class="mt-item r2" style="--a:${(360 / RING2.length) * i + 18}deg"><span class="mt-inner"><span class="mt-up">${tex(s)}</span></span></span>`).join("");

  // cycling central equation; hovering or focusing a chapter previews it instead
  const list = MONTAGE.map(id => eqs.find(e => e.id === id)).filter(Boolean);
  const mont = $("#montage"), eqEl = $("#mt-eq"), lbl = $("#mt-label"), dots = $("#mt-dots");
  dots.innerHTML = list.map(() => "<i></i>").join("");
  let k = 0, hold = null;
  const paint = (latex, label, dot, acc) => {
    eqEl.innerHTML = tex(latex, true);
    lbl.textContent = label;
    lbl.style.color = acc || "";
    $$("i", dots).forEach((d, j) => d.classList.toggle("on", j === dot));
    fitMontage();
  };
  const swap = (fn, animate) => {
    if (!animate || !gsap || REDUCED) { fn(); return; }
    gsap.killTweensOf([eqEl, lbl]);
    gsap.to([eqEl, lbl], {
      opacity: 0, y: -10, filter: "blur(10px)", duration: .3, ease: "power2.in", onComplete: () => {
        fn();
        gsap.fromTo([eqEl, lbl], { opacity: 0, y: 12, filter: "blur(10px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: .55, ease: "power3.out", stagger: .05 });
      }
    });
  };
  const show = (i, animate) => { const e = list[i]; swap(() => paint(e.latex, `${NUM[e.id]} · ${e.title}`, i), animate); };
  const preview = id => {
    const c = chs.find(x => x.id === id), first = eqs.find(e => e.chapter === id);
    hold = id; mont.classList.add("hold");
    $$(".mt-ch", mont).forEach(a => a.classList.toggle("on", a.dataset.ch === id));
    swap(() => paint(first.latex, `Chapter ${CH(c.n)} · ${c.title} · ${counts[id]} equations`, -1, ACCENT[c.color]), true);
  };
  const release = () => {
    if (!hold) return;
    hold = null; mont.classList.remove("hold");
    $$(".mt-ch", mont).forEach(a => a.classList.remove("on"));
    show(k, true);
  };
  $$(".mt-ch", mont).forEach(a => {
    a.addEventListener("pointerenter", () => preview(a.dataset.ch));
    a.addEventListener("focus", () => preview(a.dataset.ch));
    a.addEventListener("pointerleave", release);
    a.addEventListener("blur", release);
  });
  show(0, false);
  if (!REDUCED) setInterval(() => { if (!document.hidden && !hold) { k = (k + 1) % list.length; show(k, true); } }, 3600);
  addEventListener("resize", fitMontage);
  if (document.fonts) document.fonts.ready.then(fitMontage);

  // marquee of every compact equation
  const chips = eqs.filter(e => !/aligned|cases|underbrace/.test(e.latex) && e.latex.length < 90)
    .map(e => `<a class="mq-chip" href="#${e.id}" tabindex="-1" style="--acc:${ACCENT[chapterOf(e).color]}"><span class="mq-n mono">${NUM[e.id]}</span>${tex(e.latex)}</a>`).join("");
  $("#marquee").innerHTML = chips + chips;
}

/** Shrink the montage equation if it would overflow its disc. */
function fitMontage() {
  const eqEl = $("#mt-eq");
  const k = eqEl.querySelector(".katex-display > .katex") || eqEl.querySelector(".katex");
  if (!k) return;
  eqEl.style.setProperty("--fit", 1);
  const max = eqEl.clientWidth * 0.98;
  const w = k.scrollWidth;
  if (w > max) eqEl.style.setProperty("--fit", (max / w).toFixed(3));
}

function countTo(el, n) {
  if (!gsap || REDUCED) { el.textContent = n; return; }
  const o = { v: 0 };
  gsap.to(o, { v: n, duration: 1.6, ease: "power3.out", delay: .3, onUpdate: () => { el.textContent = Math.round(o.v); } });
}

const chapterOf = eq => DATA.chapters.find(c => c.id === eq.chapter);

/* ================================================================ toolbar */
function buildToolbar() {
  const nav = $("#chapnav");
  const counts = {};
  DATA.equations.forEach(e => { counts[e.chapter] = (counts[e.chapter] || 0) + 1; });
  nav.innerHTML = DATA.chapters.map(c =>
    `<a href="#ch-${c.id}" data-ch="${c.id}" style="--acc:${ACCENT[c.color]}"><span class="n mono">${CH(c.n)}</span><span class="t" title="${esc(c.title)}">${esc(c.short || c.title)}</span><span class="c mono" data-count="${c.id}">${counts[c.id]}</span></a>`
  ).join("") + `<a href="#constants" data-ch="constants" style="--acc:var(--text-2)"><span class="n mono">K</span><span class="t">Constants</span></a><span class="ind" aria-hidden="true"></span>`;
}

/* ================================================================ atlas */
function buildAtlas() {
  const atlas = $("#atlas");
  atlas.innerHTML = "";
  for (const ch of DATA.chapters) {
    const eqs = DATA.equations.filter(e => e.chapter === ch.id);
    const sec = document.createElement("section");
    sec.className = "eqx-chapter";
    sec.id = "ch-" + ch.id;
    sec.dataset.chapter = ch.id;
    sec.style.setProperty("--acc", ACCENT[ch.color]);
    sec.innerHTML = `
      <header class="ch-head">
        <div class="ch-num" aria-hidden="true">${CH(ch.n)}</div>
        <div>
          <div class="eyebrow"><span class="ch-ico">${icon(ch.id)}</span>Chapter ${ch.n} · ${eqs.length} equations</div>
          <h2>${esc(ch.title)}</h2>
          <p class="lede">${esc(ch.blurb)}</p>
          <div class="ch-toc">${eqs.map(e => `<a href="#${e.id}" class="chip"><span class="mono">${NUM[e.id]}</span> ${esc(shortTitle(e.title))}</a>`).join("")}</div>
        </div>
      </header>
      <div class="ch-cards"></div>`;
    const cards = $(".ch-cards", sec);
    for (const eq of eqs) {
      const art = shell(eq, ch);
      cards.appendChild(art);
      CARDS.push({ eq, ch, art, st: null });
    }
    atlas.appendChild(sec);
  }
  // Lazy rendering: KaTeX, calculator and plot are built only when a card comes within ~1.5 screens.
  const near = new IntersectionObserver(ents => ents.forEach(en => {
    if (!en.isIntersecting) return;
    near.unobserve(en.target);
    const c = en.target.__card;
    if (c) hydrate(c);
  }), { rootMargin: "1200px 0px" });
  CARDS.forEach(c => { c.art.__card = c; near.observe(c.art); });
}

/** Light placeholder: title only. The heavy parts (KaTeX, calculator, plot) come in hydrate(). */
function shell(eq, ch) {
  const art = document.createElement("article");
  art.className = "eq card spot" + (REDUCED ? "" : " pre");
  art.tabIndex = -1;
  art.id = eq.id;
  art.dataset.chapter = ch.id;
  art.style.setProperty("--acc", ACCENT[ch.color]);
  art.setAttribute("aria-labelledby", `${eq.id}-t`);
  art.innerHTML = `<header class="eq-head"><span class="eq-num mono">${NUM[eq.id]}</span><div class="eq-titles"><h3 id="${eq.id}-t">${esc(eq.title)}</h3>${eq.aka ? `<p class="eq-aka">${esc(eq.aka)}</p>` : ""}</div></header><div class="eq-skel" aria-hidden="true"></div>`;
  art.dataset.search = norm([eq.id, eq.title, eq.aka, ch.title, (eq.tags || []).join(" "), eq.meaning, eq.example.title, eq.example.text,
    eq.legend.map(l => l.desc + " " + l.sym).join(" "), eq.latex].join(" "));
  return art;
}
function hydrate(c) {
  if (c.st) return;
  c.st = fillCard(c.eq, c.art, c.ch);
  c.art.classList.add("ready");
}
/** When the browser is idle, hydrate the remaining cards in small slices (keeps anchor jumps stable later). */
function hydrateRest() {
  const idle = window.requestIdleCallback || (fn => setTimeout(() => fn({ timeRemaining: () => 10 }), 60));
  let i = 0;
  const step = dl => {
    const t0 = performance.now();
    while (i < CARDS.length && (dl.timeRemaining() > 2 || performance.now() - t0 < 4)) { if (!CARDS[i].st) hydrate(CARDS[i]); i++; if (performance.now() - t0 > 14) break; }
    if (i < CARDS.length) idle(step, { timeout: 400 });
    else if (window.ScrollTrigger) ScrollTrigger.refresh();
  };
  setTimeout(() => idle(step, { timeout: 400 }), 1500);
}

/* ================================================================ navigation: jumps, random, keys */
/** Scroll so that `el` sits just under the sticky toolbar; keep it there while cards above it hydrate. */
function land(el, smooth = true, after) {
  const idx = CARDS.findIndex(c => c.art === el);
  if (idx >= 0) for (let j = Math.max(0, idx - 1); j <= Math.min(CARDS.length - 1, idx + 1); j++) hydrate(CARDS[j]);
  const y = () => el.getBoundingClientRect().top + scrollY - toolbarOffset() + 2;
  // long jumps are instant (the card's entrance animation carries the eye); short ones glide
  if (Math.abs(y() - scrollY) > 4 * innerHeight) smooth = false;
  scrollTo({ top: y(), behavior: smooth && !REDUCED ? "smooth" : "instant" });
  // settle: layout above may still change (hydration, fonts) — correct drifts until things are calm,
  // but give up at once if the reader scrolls on their own
  const t0 = performance.now();
  let calm = t0, cancelled = false;
  const stop = () => { cancelled = true; };
  const evs = ["wheel", "touchstart", "keydown", "pointerdown"];
  evs.forEach(ev => addEventListener(ev, stop, { once: true, passive: true }));
  const settle = () => {
    const now = performance.now();
    if (cancelled) { evs.forEach(ev => removeEventListener(ev, stop)); return; }
    const d = el.getBoundingClientRect().top - toolbarOffset() - 2;
    const moving = smooth && !REDUCED && now - t0 < 900;
    if (!moving && Math.abs(d) > 3) { scrollTo({ top: scrollY + d, behavior: "instant" }); calm = now; }
    if (now - calm < 1000 && now - t0 < 4000) requestAnimationFrame(settle);
    else { evs.forEach(ev => removeEventListener(ev, stop)); if (after) after(); }
  };
  requestAnimationFrame(settle);
}
function setupJumps() {
  // in-page links (chapter nav, orbit, table of contents, marquee) go through land()
  document.addEventListener("click", e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || a.classList.contains("eq-link")) return;
    const el = document.getElementById(decodeURIComponent(a.hash.slice(1)));
    if (!el || !$(".eqx").contains(el)) return;
    e.preventDefault();
    history.replaceState(null, "", a.hash);
    land(el);
  });
  $("#rand").addEventListener("click", () => randomCard());
  $("#hero-rand").addEventListener("click", () => randomCard());
}
function currentIndex() {
  const line = toolbarOffset() + 40;
  let cur = -1;
  CARDS.forEach((c, i) => { if (!c.art.hidden && c.art.getBoundingClientRect().top <= line) cur = i; });
  return cur;
}
function step(dir) {
  const vis = CARDS.map((c, i) => [c, i]).filter(([c]) => !c.art.hidden);
  if (!vis.length) return;
  const cur = currentIndex(), line = toolbarOffset() + 6;
  let tgt;
  if (dir > 0) tgt = vis.find(([c, i]) => i > cur || (i === cur && c.art.getBoundingClientRect().top > line));
  else tgt = [...vis].reverse().find(([c, i]) => i < cur || (i === cur && c.art.getBoundingClientRect().top < line - 12));
  if (!tgt) return;
  const [c] = tgt;
  history.replaceState(null, "", "#" + c.eq.id);
  land(c.art, true);
  c.art.focus({ preventScroll: true });
}
function stepChapter(dir) {
  const secs = $$(".eqx-chapter").filter(s => !s.hidden);
  const line = toolbarOffset() + 40;
  let cur = -1;
  secs.forEach((s, i) => { if (s.getBoundingClientRect().top <= line) cur = i; });
  const t = secs[clamp(cur + dir, 0, secs.length - 1)];
  if (t) { history.replaceState(null, "", "#" + t.id); land(t, true); }
}
let lastRandom = -1;
function randomCard() {
  const vis = CARDS.map((c, i) => i).filter(i => !CARDS[i].art.hidden && i !== lastRandom && i !== currentIndex());
  if (!vis.length) return;
  const i = vis[Math.floor(Math.random() * vis.length)];
  lastRandom = i;
  const c = CARDS[i];
  const dice = $("#rand svg");
  if (dice && !REDUCED) dice.animate([{ transform: "rotate(0)" }, { transform: "rotate(540deg)" }], { duration: 650, easing: "cubic-bezier(.2,.8,.2,1)" });
  history.replaceState(null, "", "#" + c.eq.id);
  land(c.art, false);
  c.art.focus({ preventScroll: true });
  reveal(c.art);
  toast(`⚄ ${NUM[c.eq.id]} · ${c.eq.title}`);
  if (!REDUCED) {
    c.art.animate([
      { transform: "perspective(1600px) rotateY(-88deg) scale(.94)", opacity: 0, filter: "blur(4px)" },
      { transform: "perspective(1600px) rotateY(12deg) scale(.99)", opacity: 1, filter: "blur(0px)", offset: .7 },
      { transform: "perspective(1600px) rotateY(0deg) scale(1)", opacity: 1, filter: "blur(0px)" }
    ], { duration: 900, easing: "cubic-bezier(.2,.75,.25,1)" });
    const st = c.st && c.st.plot;
    if (st) st.replay();
  }
}
function setupKeys() {
  const help = $("#keyhelp"), btn = $("#keys");
  const toggleHelp = on => { help.hidden = !on; btn.setAttribute("aria-expanded", String(on)); };
  btn.addEventListener("click", () => toggleHelp(help.hidden));
  document.addEventListener("click", e => { if (!help.hidden && !help.contains(e.target) && e.target !== btn) toggleHelp(false); });
  addEventListener("keydown", e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
    if (e.key === "Escape" && !help.hidden) { toggleHelp(false); return; }
    if (typing) return;
    if (e.key === "j") { e.preventDefault(); step(1); }
    else if (e.key === "k") { e.preventDefault(); step(-1); }
    else if (e.key === "]") { e.preventDefault(); stepChapter(1); }
    else if (e.key === "[") { e.preventDefault(); stepChapter(-1); }
    else if (e.key === "r") { e.preventDefault(); randomCard(); }
    else if (e.key === "?") { e.preventDefault(); toggleHelp(help.hidden); }
    else if (e.key === "c") {
      const i = currentIndex();
      if (i >= 0) { e.preventDefault(); copy(CARDS[i].eq.latex, `LaTeX of ${NUM[CARDS[i].eq.id]} copied`); }
    }
  });
}
const shortTitle = t => t.replace(/ — .*$/, "");

function fillCard(eq, art, ch) {
  const ex = eq.example;
  const refs = eq.refs.map(r => `<a href="${esc(r.url)}" rel="noopener" target="_blank">${esc(r.label)} ↗</a>`).join("");
  art.innerHTML = `
    <header class="eq-head">
      <span class="eq-num mono">${NUM[eq.id]}</span>
      <div class="eq-titles">
        <h3 id="${eq.id}-t">${esc(eq.title)}</h3>
        ${eq.aka ? `<p class="eq-aka">${esc(eq.aka)}</p>` : ""}
      </div>
      <div class="eq-actions">
        <button class="btn small eq-copy" type="button" title="Copy the LaTeX source">Copy LaTeX</button>
        <a class="btn small eq-link" href="#${eq.id}" title="Link to this equation" aria-label="Copy link to ${esc(eq.title)}">#</a>
      </div>
    </header>
    <div class="eq-grid">
      <div class="eq-main">
        <div class="eq-formula">${tex(eq.latex, true)}</div>
        <p class="eq-meaning">${rich(eq.meaning)}</p>
        <dl class="eq-legend">${eq.legend.map(l => `<div><dt>${tex(l.sym)}</dt><dd>${rich(l.desc)}<span class="u mono">${esc(l.unit)}</span></dd></div>`).join("")}</dl>
        <section class="eq-example" aria-label="Worked example">
          <div class="ex-h"><span class="eyebrow">Worked example</span><h4>${esc(ex.title)}</h4></div>
          <p>${rich(ex.text)}</p>
          <div class="ex-steps">${tex(ex.steps, true)}</div>
          <div class="ex-answer">
            <div class="ex-res"><span class="k mono">Result</span><strong class="ex-val"></strong></div>
            <p class="ex-note">${rich(ex.answer.text)}</p>
            <button class="btn small ex-load" type="button">Load into calculator ↘</button>
          </div>
        </section>
      </div>
      <div class="eq-lab" aria-label="Calculator">
        <div class="lab-head"><span class="eyebrow">Live calculator</span></div>
        <div class="lab-presets"></div>
        <div class="lab-inputs${eq.calc.inputs.length > 5 ? " many" : ""}"></div>
        <div class="lab-outputs"></div>
        ${eq.plot ? `<figure class="lab-plot"><div class="plot-wrap"><canvas role="img" aria-label="Plot: ${esc(eq.plot.caption || eq.title)}"></canvas></div><figcaption><span>${esc(eq.plot.caption || "")}</span></figcaption></figure>` : ""}
      </div>
    </div>
    <footer class="eq-foot">
      <div class="eq-tags"><span class="chip" style="color:var(--acc);border-color:color-mix(in srgb, var(--acc) 40%, transparent)">${esc(ch.title)}</span>${(eq.tags || []).map(t => `<button type="button" class="chip tag">${esc(t)}</button>`).join("")}</div>
      <div class="eq-refs"><span class="mono muted">Sources</span>${refs}</div>
    </footer>`;

  $(".eq-copy", art).addEventListener("click", () => copy(eq.latex, "LaTeX copied"));
  $(".eq-link", art).addEventListener("click", ev => {
    ev.preventDefault();
    history.replaceState(null, "", "#" + eq.id);
    copy(location.href, "Link copied");
  });
  $$(".tag", art).forEach(b => b.addEventListener("click", () => setQuery(b.textContent)));

  const st = makeCalculator(eq, art, ch);
  $$(".eq-formula, .ex-steps", art).forEach(el => fitRO.observe(el));
  $(".ex-load", art).addEventListener("click", () => {
    st.apply(ex.set);
    const lab = $(".eq-lab", art);
    if (gsap && !REDUCED) gsap.fromTo(lab, { boxShadow: `0 0 0 2px ${ACCENT[ch.color]}` }, { boxShadow: "0 0 0 0px rgba(0,0,0,0)", duration: 1.2, ease: "power2.out" });
    if (innerWidth < 980) lab.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "nearest" });
  });
  // example answer, formatted by the same code as the calculator
  const o = eq.calc.outputs.find(x => x.id === ex.answer.out);
  const f = core.formatOutput(o, ex.answer.value, "html");
  $(".ex-val", art).innerHTML = `${f.num} <small>${esc(f.unit)}</small>`;
  return st;
}

/** Shrink a display formula that is wider than its box (down to 62 %), else let it scroll. */
const fitRO = new ResizeObserver(ents => ents.forEach(en => fitFormula(en.target)));
function fitFormula(box) {
  const k = box.querySelector(".katex-display > .katex");
  if (!k || !box.clientWidth) return;
  k.style.fontSize = "";
  const cs = getComputedStyle(box);
  const avail = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 6;
  const w = k.scrollWidth;
  if (w > avail) k.style.fontSize = (Math.max(0.62, avail / w) * 1.12).toFixed(3) + "em";
}

function norm(s) {
  return String(s).toLowerCase()
    .replace(/δ|\\delta/g, "delta ").replace(/Δ/gi, "delta ").replace(/\\[a-z]+/g, " ")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[–—-]/g, " ").replace(/[^a-z0-9α-ω☉⊕*.]+/g, " ");
}

/* ================================================================ calculator */
function makeCalculator(eq, art, ch) {
  const run = core.compile(eq, K);
  const st = { eq, art, ch, run, disp: core.displayValues(eq), ctl: {}, out: {}, plot: null, result: null };
  const inWrap = $(".lab-inputs", art), outWrap = $(".lab-outputs", art), preWrap = $(".lab-presets", art);

  // ---- presets
  const presets = [{ label: "Example", set: eq.example.set, example: true }, ...(eq.calc.presets || [])];
  preWrap.innerHTML = presets.map((p, i) => `<button type="button" class="chip pre${p.example ? " ex" : ""}" data-i="${i}" aria-pressed="false">${esc(p.label)}</button>`).join("");
  $$(".pre", preWrap).forEach(b => b.addEventListener("click", () => {
    st.apply(presets[+b.dataset.i].set);
    $$(".pre", preWrap).forEach(x => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
  }));
  const unpress = () => $$(".pre", preWrap).forEach(x => x.setAttribute("aria-pressed", "false"));

  // ---- inputs
  for (const inp of eq.calc.inputs) {
    const uid = `${eq.id}-${inp.id}`;
    const f = document.createElement("div");
    f.className = "lab-field";
    if (inp.type === "select") {
      f.innerHTML = `<label class="lab-lbl" for="${uid}"><span class="lab-sym">${tex(inp.sym)}</span><span class="lab-name">${esc(inp.label)}</span></label>
        <select id="${uid}">${inp.options.map((o, i) => `<option value="${i}"${o.value === inp.value ? " selected" : ""}>${esc(o.label)}</option>`).join("")}</select>`;
      const sel = $("select", f);
      sel.addEventListener("change", () => { st.disp[inp.id] = inp.options[+sel.value].value; unpress(); st.update(); });
      st.ctl[inp.id] = { inp, sel };
    } else {
      const lo = inp.min, hi = inp.max;
      const rangeAttrs = inp.log ? `min="0" max="1000" step="1"` : `min="${lo}" max="${hi}" step="${inp.step ?? (hi - lo) / 1000}"`;
      f.innerHTML = `<label class="lab-lbl" for="${uid}-n"><span class="lab-sym">${tex(inp.sym)}</span><span class="lab-name">${esc(inp.label)}</span></label>
        <div class="lab-ctl">
          <input type="range" ${rangeAttrs} aria-label="${esc(inp.label)}${inp.unit ? " (" + esc(inp.unit) + ")" : ""}">
          <span class="lab-num"><input id="${uid}-n" type="text" inputmode="decimal" autocomplete="off" spellcheck="false"><span class="u">${esc(inp.unit || "")}</span></span>
        </div>`;
      const range = $("input[type=range]", f), num = $("input[type=text]", f);
      const c = { inp, range, num };
      range.addEventListener("input", () => {
        let v = inp.log ? lo * Math.pow(hi / lo, range.value / 1000) : +range.value;
        if (inp.log) v = +v.toPrecision(4);
        st.disp[inp.id] = v; paint(range); num.value = core.plain(v); unpress(); st.update();
      });
      const commit = () => {
        const v = parseNum(num.value);
        if (!isFinite(v)) { num.value = core.plain(st.disp[inp.id]); return; }
        const hmin = inp.hardMin ?? (inp.log ? Number.MIN_VALUE : -Infinity), hmax = inp.hardMax ?? Infinity;
        st.disp[inp.id] = clamp(v, hmin, hmax);
        syncCtl(c, st.disp[inp.id]); unpress(); st.update();
      };
      num.addEventListener("change", commit);
      num.addEventListener("keydown", e => {
        if (e.key === "Enter") { commit(); num.select(); }
        if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); nudge(c, e.key === "ArrowUp" ? 1 : -1, e.shiftKey); }
      });
      st.ctl[inp.id] = c;
    }
    inWrap.appendChild(f);
  }

  function nudge(c, dir, big) {
    const inp = c.inp, v = st.disp[inp.id];
    let nv = inp.log ? v * Math.pow(big ? 2 : 1.05, dir) : v + dir * (inp.step ?? (inp.max - inp.min) / 100) * (big ? 10 : 1);
    nv = +nv.toPrecision(6);
    st.disp[inp.id] = clamp(nv, inp.hardMin ?? (inp.log ? Number.MIN_VALUE : -Infinity), inp.hardMax ?? Infinity);
    syncCtl(c, st.disp[inp.id]); unpress(); st.update();
  }

  // ---- outputs
  outWrap.innerHTML = eq.calc.outputs.map((o, i) =>
    `<div class="lab-out${i === 0 ? " primary" : ""}" data-o="${o.id}"><div class="k"><span class="lab-sym">${tex(o.sym)}</span>${esc(o.label)}</div><div class="v"><span class="n"></span> <small class="u"></small></div>${o.hint ? `<div class="hint" hidden>${esc(o.hint)}</div>` : ""}</div>`
  ).join("");
  for (const o of eq.calc.outputs) {
    const el = $(`[data-o="${o.id}"]`, outWrap);
    st.out[o.id] = { o, n: $(".n", el), u: $(".u", el), hint: $(".hint", el), el };
  }

  st.apply = set => {
    Object.assign(st.disp, set);
    for (const id in st.ctl) syncCtl(st.ctl[id], st.disp[id]);
    st.update();
  };
  st.update = () => {
    st.result = core.evaluate(eq, run, st.disp, K);
    for (const id in st.out) {
      const { o, n, u, hint, el } = st.out[id];
      const f = core.formatOutput(o, st.result.shown[id], "html");
      n.innerHTML = f.num; u.textContent = f.unit;
      if (hint) hint.hidden = isFinite(st.result.shown[id]);
      el.classList.toggle("bad", !isFinite(st.result.shown[id]));
    }
    if (st.plot) st.plot.request();
  };

  for (const id in st.ctl) syncCtl(st.ctl[id], st.disp[id]);
  if (eq.plot) st.plot = new Plot(st, $(".lab-plot", art));
  st.update();
  return st;
}

function parseNum(s) {
  s = String(s).trim().replace(/[,\s ]/g, "").replace(/[−–]/g, "-").replace(/[×x]10\^?/i, "e");
  if (!s) return NaN;
  return Number(s);
}
function paint(r) {
  const min = +r.min || 0, max = +r.max || 100;
  r.style.setProperty("--fill", ((r.value - min) / (max - min) * 100) + "%");
}
function syncCtl(c, v) {
  if (c.sel) {
    // nearest option (values are SI numbers)
    let best = 0;
    c.inp.options.forEach((o, i) => { if (Math.abs(o.value - v) < Math.abs(c.inp.options[best].value - v)) best = i; });
    c.sel.value = String(best);
    return;
  }
  const inp = c.inp;
  c.range.value = inp.log ? 1000 * Math.log(clamp(v, inp.min, inp.max) / inp.min) / Math.log(inp.max / inp.min) : clamp(v, inp.min, inp.max);
  paint(c.range);
  if (document.activeElement !== c.num) c.num.value = core.plain(v);
}

/* ================================================================ plots */
const GRID = "rgba(150,170,255,0.09)", AXIS = "rgba(195,202,230,0.55)", DIM = "rgba(195,202,230,0.38)";
const FONT = "500 10.5px 'JetBrains Mono', ui-monospace, monospace";
const io = new IntersectionObserver(ents => ents.forEach(en => {
  const p = en.target.__plot;
  if (!p) return;
  p.visible = en.isIntersecting;
  if (p.visible) { p.request(); p.animate(); }
}), { rootMargin: "200px 0px" });

class Plot {
  constructor(st, fig) {
    this.st = st; this.eq = st.eq; this.spec = st.eq.plot; this.fig = fig;
    this.canvas = $("canvas", fig); this.ctx = this.canvas.getContext("2d");
    this.col = ACCENT[st.ch.color];
    this.visible = false; this.hover = null; this.raf = 0; this.t0 = performance.now();
    this.logy = this.spec.type === "xy" ? !!this.spec.logy : false;
    this.canvas.__plot = this;
    this.fig.classList.add("t-" + this.spec.type);
    io.observe(this.canvas);
    new ResizeObserver(() => this.resize()).observe(this.canvas);
    if (this.spec.type === "xy") {
      // linear / log toggle for the y axis
      const seg = document.createElement("div");
      seg.className = "seg plot-seg";
      seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "Y axis scale");
      seg.innerHTML = `<button type="button" data-l="0">lin</button><button type="button" data-l="1">log</button>`;
      const sync = () => $$("button", seg).forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.l === +this.logy)));
      seg.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; this.logy = b.dataset.l === "1"; sync(); this.request(); });
      sync();
      $("figcaption", fig).appendChild(seg);
      this.canvas.addEventListener("pointermove", e => { const r = this.canvas.getBoundingClientRect(); this.hover = { x: e.clientX - r.left, y: e.clientY - r.top }; this.request(); });
      this.canvas.addEventListener("pointerleave", () => { this.hover = null; this.request(); });
    }
  }
  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.W = w; this.H = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.request();
  }
  request() {
    if (!this.visible || !this.W) return;
    if (this.pending) return;
    this.pending = true;
    requestAnimationFrame(() => { this.pending = false; this.draw(); });
  }
  /** Entrance progress 0 → 1 (eased): the plot "draws itself" when its card scrolls into view. */
  get prog() {
    if (REDUCED) return 1;
    if (this.revealAt == null) return this.st.art.classList.contains("pre") ? 0 : 1;
    const t = Math.min(1, (performance.now() - this.revealAt) / 1150);
    return 1 - Math.pow(1 - t, 3);
  }
  replay() { if (REDUCED) return; this.revealAt = performance.now(); this.animate(); }
  continuous() { return !REDUCED && ((this.spec.type === "orbit" && this.spec.mode === "areas") || this.spec.type === "hohmann" || this.spec.type === "transit"); }
  animate() {
    if (!this.visible || this.raf) return;
    if (!this.continuous() && this.prog >= 1) { this.request(); return; }
    const loop = () => {
      if (!this.visible || document.hidden) { this.raf = 0; return; }
      this.draw();
      this.raf = (this.continuous() || this.prog < 1) ? requestAnimationFrame(loop) : 0;
    };
    this.raf = requestAnimationFrame(loop);
  }
  draw() {
    if (!this.W) return;
    const { ctx, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    ctx.font = FONT;
    const P = this.prog, own = SELF_REVEAL.has(this.spec.type);
    if (!own && P < 1) { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, this.W * P, this.H); ctx.clip(); }
    try {
      DRAW[this.spec.type].call(this, P);
    } catch (e) { console.error(this.eq.id, e); }
    if (!own && P < 1) ctx.restore();
  }
}
const SELF_REVEAL = new Set(["xy", "airy", "transit", "hz", "ladder", "hr"]);

/* ---- axis helpers */
function niceStep(span, n = 5) {
  const raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
}
function linTicks(lo, hi, n = 5) {
  const s = niceStep(hi - lo, n), out = [];
  for (let v = Math.ceil(lo / s) * s; v <= hi + s * 1e-9; v += s) out.push(Math.abs(v) < s * 1e-9 ? 0 : v);
  return out;
}
function logTicks(lo, hi) {
  const a = Math.floor(Math.log10(lo)), b = Math.ceil(Math.log10(hi));
  if (b - a <= 1) return linTicks(lo, hi, 4).filter(v => v > 0);
  const every = Math.max(1, Math.ceil((b - a) / 6)), out = [];
  for (let k = a; k <= b; k += every) { const v = Math.pow(10, k); if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v); }
  return out;
}
function tickLabel(v, log) {
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (log) {
    const k = Math.log10(a);
    if (Math.abs(k - Math.round(k)) < 1e-9 && (a >= 1e4 || a < 1e-2)) return (v < 0 ? "−" : "") + "10" + core.sup(Math.round(k));
  }
  return core.fmt(v, 3, "text");
}
function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
function spectrum(ctx, x0, y0, x1, y1, a) {
  // approximate visible spectrum 380 → 750 nm
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  [[0, "#6a00ff"], [.12, "#3d3dff"], [.25, "#00a2ff"], [.38, "#00e0a0"], [.5, "#7cff00"], [.6, "#f2ff00"], [.7, "#ffb000"], [.82, "#ff4d00"], [1, "#b00000"]]
    .forEach(([s, c]) => g.addColorStop(s, c));
  ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = g; ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) || 1e4, Math.abs(y1 - y0) || 1e4); ctx.restore();
}

/* ---- generic y(x) plot */
function drawXY(P = 1) {
  const { ctx, W, H, spec, st, eq, col } = this;
  const xin = eq.calc.inputs.find(i => i.id === spec.x);
  const toDisp = e => (typeof e === "number" ? e : core.fromSI(xin, evalExpr(e, st), K));
  let x0 = spec.xmin != null ? toDisp(spec.xmin) : xin.min;
  let x1 = spec.xmax != null ? toDisp(spec.xmax) : xin.max;
  const logx = spec.logx ?? !!xin.log;
  if (logx) x0 = Math.max(x0, 1e-300);
  const logy = this.logy;
  const ys = [].concat(spec.y);
  const ydiv = spec.ydiv || 1;
  const yOf = (o, v) => v / ydiv;
  const N = 180;
  const xs = [];
  for (let i = 0; i <= N; i++) xs.push(logx ? x0 * Math.pow(x1 / x0, i / N) : x0 + (x1 - x0) * i / N);

  const sample = (over, yid) => xs.map(x => {
    const d = Object.assign({}, st.disp, over, { [spec.x]: x });
    return yOf(null, core.evaluate(eq, st.run, d, K).shown[yid]);
  });
  const curves = [];
  // dim companions first
  if (spec.series) {
    const sin = eq.calc.inputs.find(i => i.id === spec.series.input);
    for (const v of spec.series.values) {
      if (Math.abs(v - st.disp[sin.id]) < 1e-9 * Math.abs(v)) continue;
      curves.push({ ys: sample({ [sin.id]: v }, ys[0]), dim: true, label: `${core.fmt(v, 3)}${sin.unit ? " " + sin.unit : ""}` });
    }
  }
  ys.slice(1).forEach(yid => {
    const o = eq.calc.outputs.find(x => x.id === yid);
    curves.push({ ys: sample({}, yid), dim: true, label: o.label.replace(/ at r$/, "") });
  });
  const main = { ys: sample({}, ys[0]), dim: false };
  curves.push(main);

  // y range
  const ok = v => isFinite(v) && (!logy || v > 0);
  let vals = [];
  curves.forEach(c => c.ys.forEach(v => ok(v) && vals.push(v)));
  (spec.hlines || []).forEach(h => ok(h.y) && vals.push(h.y));
  (spec.points || []).forEach(p => p.x >= Math.min(x0, x1) && p.x <= Math.max(x0, x1) && ok(p.y) && vals.push(p.y));
  const curX = st.disp[spec.x], curY = yOf(null, st.result.shown[ys[0]]);
  if (!vals.length) { emptyPlot(this, "No real values in this range"); return; }
  let y0 = Math.min(...vals), y1 = Math.max(...vals);
  if (logy) {
    if (y1 / y0 > 1e30) y0 = y1 / 1e30;
    const pad = Math.max(0.08, Math.log10(y1 / y0) * 0.06);
    y0 /= Math.pow(10, pad); y1 *= Math.pow(10, pad);
    if (y1 / y0 < 10) { const m = Math.sqrt(y0 * y1); y0 = m / 3.2; y1 = m * 3.2; }
  } else {
    if (spec.yzero !== false) { y0 = Math.min(0, y0); y1 = Math.max(0, y1); }
    if (y1 === y0) { y1 += Math.abs(y1) * 0.5 || 1; y0 -= Math.abs(y0) * 0.5 || 1; }
    const pad = (y1 - y0) * 0.08;
    if (!(spec.yzero !== false && y0 === 0)) y0 -= pad;
    y1 += pad;
  }
  const yt = logy ? logTicks(y0, y1) : linTicks(y0, y1, H < 200 ? 3 : 4);
  ctx.font = FONT;
  const labW = Math.max(...yt.map(v => ctx.measureText(tickLabel(v, logy)).width));
  const L = Math.ceil(labW) + 14, R = 12, T = 16, B = 26;
  const pw = W - L - R, ph = H - T - B;
  const X = x => L + (logx ? Math.log(x / x0) / Math.log(x1 / x0) : (x - x0) / (x1 - x0)) * pw;
  const Yn = y => (logy ? Math.log(y / y0) / Math.log(y1 / y0) : (y - y0) / (y1 - y0));
  const Y = y => spec.yinvert ? T + Yn(y) * ph : T + ph - Yn(y) * ph;
  const Xinv = px => logx ? x0 * Math.pow(x1 / x0, (px - L) / pw) : x0 + (px - L) / pw * (x1 - x0);

  // bands
  if (spec.band) spec.rainbow ? spectrum(ctx, X(spec.band[0]), T, X(spec.band[1]), T + ph, 0.16) : (ctx.fillStyle = rgba(col, .07), ctx.fillRect(X(spec.band[0]), T, X(spec.band[1]) - X(spec.band[0]), ph));
  if (spec.yband) {
    const a = clamp(Y(spec.yband[1]), T, T + ph), b = clamp(Y(spec.yband[0]), T, T + ph);
    if (b - a > 0.5) { ctx.save(); ctx.globalAlpha = .14; const g = ctx.createLinearGradient(0, b, 0, a); g.addColorStop(0, "#b00000"); g.addColorStop(.3, "#ffb000"); g.addColorStop(.55, "#7cff00"); g.addColorStop(.8, "#00a2ff"); g.addColorStop(1, "#6a00ff"); ctx.fillStyle = g; ctx.fillRect(L, a, pw, b - a); ctx.restore(); }
  }
  // grid + ticks
  ctx.strokeStyle = GRID; ctx.lineWidth = 1; ctx.fillStyle = AXIS; ctx.textBaseline = "middle"; ctx.textAlign = "right";
  yt.forEach(v => { const y = Math.round(Y(v)) + .5; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(W - R, y); ctx.stroke(); ctx.fillText(tickLabel(v, logy), L - 6, y); });
  const xt = logx ? logTicks(Math.min(x0, x1), Math.max(x0, x1)) : linTicks(x0, x1, Math.max(3, Math.floor(pw / 90)));
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  xt.forEach(v => {
    const x = Math.round(X(v)) + .5, t = tickLabel(v, logx), tw = ctx.measureText(t).width;
    ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + ph); ctx.stroke();
    ctx.fillText(t, clamp(x, L + tw / 2, W - 2 - tw / 2), T + ph + 7);
  });
  // axis titles
  const yo = eq.calc.outputs.find(o => o.id === ys[0]);
  ctx.fillStyle = DIM; ctx.textAlign = "left"; ctx.textBaseline = "top";
  const yunit = spec.yunit || (yo.fmt === "time" ? "s" : yo.unit);
  ctx.fillText(`${yo.label}${yunit ? " (" + yunit + ")" : ""}`, L + 6, 2);
  ctx.textAlign = "right"; ctx.textBaseline = "top";
  ctx.fillText(`→ ${xin.label}${xin.unit ? " (" + xin.unit + ")" : ""}`, W - R, 2);

  // hlines
  (spec.hlines || []).forEach(h => {
    if (!ok(h.y)) return;
    const y = Y(h.y); if (y < T || y > T + ph) return;
    ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = "rgba(233,237,255,.35)"; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(W - R, y); ctx.stroke(); ctx.restore();
    if (h.label) { ctx.fillStyle = "rgba(233,237,255,.6)"; ctx.textAlign = "left"; ctx.textBaseline = "bottom"; ctx.fillText(h.label, L + 6, y - 3); }
  });

  // curves
  ctx.save();
  ctx.beginPath(); ctx.rect(L, T - 2, pw * P, ph + 4); ctx.clip();
  const path = arr => {
    ctx.beginPath(); let pen = false;
    arr.forEach((v, i) => { if (!ok(v)) { pen = false; return; } const px = X(xs[i]), py = Y(v); pen ? ctx.lineTo(px, py) : ctx.moveTo(px, py); pen = true; });
  };
  curves.forEach(c => {
    if (c.dim) { path(c.ys); ctx.strokeStyle = "rgba(195,202,230,.35)"; ctx.lineWidth = 1.3; ctx.setLineDash([]); ctx.stroke(); }
  });
  // main: glow + area fill
  const base = spec.yinvert ? T : T + ph;
  ctx.beginPath(); let first = -1, last = -1;
  main.ys.forEach((v, i) => { if (!ok(v)) return; const px = X(xs[i]), py = Y(v); if (first < 0) { ctx.moveTo(px, base); first = i; } ctx.lineTo(px, py); last = i; });
  if (first >= 0) {
    ctx.lineTo(X(xs[last]), base); ctx.closePath();
    const g = ctx.createLinearGradient(0, T, 0, T + ph);
    g.addColorStop(spec.yinvert ? 1 : 0, rgba(col, .26)); g.addColorStop(spec.yinvert ? 0 : 1, rgba(col, 0));
    ctx.fillStyle = g; ctx.fill();
  }
  path(main.ys);
  ctx.strokeStyle = col; ctx.lineWidth = 2.2; ctx.shadowColor = col; ctx.shadowBlur = 12; ctx.stroke(); ctx.shadowBlur = 0;
  ctx.restore();
  // pen tip while the curve draws itself
  if (P < 1) {
    const ix = Math.min(main.ys.length - 1, Math.round(P * (main.ys.length - 1)));
    if (ok(main.ys[ix])) glowDot(ctx, X(xs[ix]), Y(main.ys[ix]), 3, col, 4);
  }
  ctx.globalAlpha = clamp((P - 0.55) / 0.45, 0, 1);
  // dim labels: at the curve's peak if it has an interior maximum, else at its right end
  ctx.font = FONT; ctx.textBaseline = "bottom"; ctx.fillStyle = "rgba(195,202,230,.66)";
  curves.filter(c => c.dim && c.label).forEach(c => {
    let best = -1;
    c.ys.forEach((v, i) => { if (ok(v) && Y(v) >= T + 12 && Y(v) <= T + ph && (best < 0 || (spec.yinvert ? v < c.ys[best] : v > c.ys[best]))) best = i; });
    if (best < 0) return;
    const interior = best > 3 && best < c.ys.length - 4;
    let i = best;
    if (!interior) { i = c.ys.length - 1; while (i > 0 && !(ok(c.ys[i]) && Y(c.ys[i]) >= T + 12 && Y(c.ys[i]) <= T + ph)) i--; }
    const x = X(xs[i]), y = Y(c.ys[i]), tw = ctx.measureText(c.label).width;
    ctx.textAlign = "left";
    ctx.fillText(c.label, clamp(interior ? x - tw / 2 : x - tw - 2, L + 2, W - R - tw - 2), y - 4);
  });

  // data points and marks
  (spec.points || []).forEach(p => {
    if (!ok(p.y) || p.x < Math.min(x0, x1) || p.x > Math.max(x0, x1)) return;
    const px = X(p.x), py = Y(p.y);
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(px, py, 3.2, 0, 7); ctx.fill();
    ctx.strokeStyle = rgba(col, .7); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(px, py, 5.5, 0, 7); ctx.stroke();
    ctx.fillStyle = "rgba(233,237,255,.78)"; ctx.textAlign = px > W - 80 ? "right" : "left"; ctx.textBaseline = "middle";
    ctx.fillText(p.label, px + (px > W - 80 ? -9 : 9), py - (spec.yinvert ? -9 : 9));
  });
  (spec.marks || []).forEach(m => {
    if (m.x < Math.min(x0, x1) || m.x > Math.max(x0, x1)) return;
    const d = Object.assign({}, st.disp, { [spec.x]: m.x });
    const v = yOf(null, core.evaluate(eq, st.run, d, K).shown[ys[0]]);
    if (!ok(v)) return;
    const px = X(m.x), py = Y(v);
    ctx.fillStyle = "#0b0f1e"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(px, py, 3.5, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(233,237,255,.72)"; ctx.textAlign = px > W - 110 ? "right" : "left"; ctx.textBaseline = "top";
    ctx.fillText(m.label, px + (px > W - 110 ? -6 : 6), py + 6);
  });

  // current value marker
  if (spec.marker !== false && ok(curY) && curX >= Math.min(x0, x1) && curX <= Math.max(x0, x1)) {
    const px = X(curX), py = Y(curY);
    if (py >= T - 1 && py <= T + ph + 1) {
      ctx.save(); ctx.setLineDash([3, 4]); ctx.strokeStyle = rgba(col, .55); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, T + ph); ctx.lineTo(px, py); ctx.lineTo(L, py); ctx.stroke(); ctx.restore();
      const g = ctx.createRadialGradient(px, py, 0, px, py, 16); g.addColorStop(0, rgba(col, .55)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, 16, 0, 7); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(px, py, 4, 0, 7); ctx.fill();
    }
  }

  ctx.globalAlpha = 1;
  // hover read-out
  if (P >= 1 && this.hover && this.hover.x >= L && this.hover.x <= L + pw) {
    const hx = Xinv(this.hover.x);
    const d = Object.assign({}, st.disp, { [spec.x]: hx });
    const hv = yOf(null, core.evaluate(eq, st.run, d, K).shown[ys[0]]);
    ctx.strokeStyle = "rgba(233,237,255,.35)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(this.hover.x + .5, T); ctx.lineTo(this.hover.x + .5, T + ph); ctx.stroke();
    if (ok(hv)) {
      const py = Y(hv);
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(this.hover.x, py, 3.5, 0, 7); ctx.fill();
      const txt = `${core.fmt(hx, 3)} ${xin.unit || ""} → ${core.fmt(hv, 4)} ${yunit || ""}`.replace(/\s+/g, " ").trim();
      ctx.font = FONT;
      const tw = ctx.measureText(txt).width + 14;
      let bx = this.hover.x + 10; if (bx + tw > W - 4) bx = this.hover.x - 10 - tw;
      const by = clamp(py - 28, T, T + ph - 20);
      ctx.fillStyle = "rgba(8,11,22,.92)"; ctx.strokeStyle = rgba(col, .5);
      roundRect(ctx, bx, by, tw, 20, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#e9edff"; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(txt, bx + 7, by + 10.5);
    }
  }
}
const EXPR = new Map();
function evalExpr(expr, st) {
  // expression over SI inputs + constants (used for plot ranges like "0.02*a")
  const eq = st.eq;
  const si = core.siValues(eq, st.disp, K);
  const key = eq.id + "|" + expr;
  if (!EXPR.has(key)) EXPR.set(key, new Function(...Object.keys(K), ...Object.keys(core.MATH), ...Object.keys(si), `"use strict"; return (${expr});`));
  return EXPR.get(key)(...Object.values(K), ...Object.values(core.MATH), ...Object.values(si));
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function emptyPlot(p, msg) {
  const { ctx, W, H } = p;
  ctx.fillStyle = DIM; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(msg, W / 2, H / 2);
}
function glowDot(ctx, x, y, r, color, halo = 4) {
  if (!isFinite(x) || !isFinite(y)) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * halo);
  g.addColorStop(0, color); g.addColorStop(.25, rgba(color.startsWith("#") ? color : "#ffffff", .35)); g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * halo, 0, 7); ctx.fill();
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
}
function solveKepler(M, e) {
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 30; i++) { const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); E -= d; if (Math.abs(d) < 1e-12) break; }
  return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
}

/* ---- Kepler ellipse */
function drawOrbit() {
  const { ctx, W, H, st, col, spec } = this;
  const d = st.disp, e = clamp(d.e, 0, 0.99), a = d.a;
  const b = a * Math.sqrt(1 - e * e), cF = a * e;
  const pad = 26;
  const s = Math.min((W - 2 * pad) / (2 * a), (H - 2 * pad) / (2 * b));
  const cx = W / 2, cy = H / 2;
  const fx = cx + cF * s, fy = cy; // Sun at the right-hand focus; perihelion points right
  const P = nu => { const r = a * (1 - e * e) / (1 + e * Math.cos(nu)); return [fx + r * Math.cos(nu) * s, fy - r * Math.sin(nu) * s, r]; };

  // axes
  ctx.save(); ctx.setLineDash([3, 5]); ctx.strokeStyle = GRID; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx - a * s, cy); ctx.lineTo(cx + a * s, cy); ctx.moveTo(cx, cy - b * s); ctx.lineTo(cx, cy + b * s); ctx.stroke(); ctx.restore();

  if (spec.mode === "areas") {
    const N = 12;
    for (let k = 0; k < N; k++) {
      const n0 = solveKepler(2 * Math.PI * k / N, e), n1 = solveKepler(2 * Math.PI * (k + 1) / N, e);
      let nb = n1 < n0 ? n1 + 2 * Math.PI : n1;
      ctx.beginPath(); ctx.moveTo(fx, fy);
      for (let j = 0; j <= 24; j++) { const [x, y] = P(n0 + (nb - n0) * j / 24); ctx.lineTo(x, y); }
      ctx.closePath();
      ctx.fillStyle = rgba(col, k % 2 ? 0.08 : 0.2); ctx.fill();
      ctx.strokeStyle = rgba(col, .25); ctx.lineWidth = 1; ctx.stroke();
    }
  }
  // orbit
  ctx.beginPath();
  for (let j = 0; j <= 240; j++) { const [x, y] = P(j / 240 * 2 * Math.PI); j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.strokeStyle = col; ctx.lineWidth = 1.8; ctx.shadowColor = col; ctx.shadowBlur = 10; ctx.stroke(); ctx.shadowBlur = 0;
  // empty focus
  ctx.strokeStyle = DIM; ctx.lineWidth = 1; const ex = cx - cF * s;
  ctx.beginPath(); ctx.moveTo(ex - 4, cy - 4); ctx.lineTo(ex + 4, cy + 4); ctx.moveTo(ex + 4, cy - 4); ctx.lineTo(ex - 4, cy + 4); ctx.stroke();
  // Sun
  glowDot(ctx, fx, fy, 5, "#ffc24b", 5);
  // peri / aphelion labels
  ctx.font = FONT; ctx.fillStyle = AXIS; ctx.textBaseline = "top";
  const [px] = P(0), [ax] = P(Math.PI);
  const lab = (t, x, out) => {
    const w = ctx.measureText(t).width;
    const fits = out > 0 ? x + 8 + w < W - 4 : x - 8 - w > 4;
    ctx.textAlign = (out > 0) === fits ? "left" : "right";
    ctx.fillText(t, fits ? x + out * 8 : x - out * 8, cy + 8);
  };
  lab("perihelion", px, 1);
  lab("aphelion", ax, -1);

  let nu;
  if (spec.mode === "areas") {
    const period = 9000;
    const M = REDUCED ? 0.6 : ((performance.now() - this.t0) % period) / period * 2 * Math.PI;
    nu = solveKepler(M, e);
    ctx.fillStyle = AXIS; ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("12 wedges · equal time each", 8, 6);
  } else {
    nu = d.th * Math.PI / 180;
  }
  const [qx, qy, r] = P(nu);
  ctx.strokeStyle = "rgba(233,237,255,.55)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(qx, qy); ctx.stroke();
  glowDot(ctx, qx, qy, 4.5, "#ffffff", 3.5);
  if (spec.mode !== "areas") {
    ctx.fillStyle = "#e9edff"; ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText(`r = ${core.fmt(r, 4)} AU`, 8, 6);
    ctx.fillStyle = AXIS; ctx.fillText(`e = ${core.fmt(e, 3)}`, 8, 22);
  }
}

/* ---- Hohmann transfer */
function drawHohmann() {
  const { ctx, W, H, st, col } = this;
  const r1 = st.disp.r1, r2 = st.disp.r2;
  const R = Math.max(r1, r2), pad = 22;
  const s = Math.min((W - 2 * pad) / (2 * R), (H - 2 * pad) / (2 * R));
  const cx = W / 2 + (W > 360 ? -W * 0.08 : 0), cy = H / 2;
  const at = (r1 + r2) / 2, et = Math.abs(r2 - r1) / (r1 + r2);
  const rOf = phi => { const nu = r1 < r2 ? phi : phi - Math.PI; return at * (1 - et * et) / (1 + et * Math.cos(nu)); };
  const pt = phi => { const r = rOf(phi); return [cx + r * Math.cos(phi) * s, cy - r * Math.sin(phi) * s]; };
  const circle = (r, stroke, w, dash) => { ctx.save(); if (dash) ctx.setLineDash(dash); ctx.strokeStyle = stroke; ctx.lineWidth = w; ctx.beginPath(); ctx.arc(cx, cy, Math.max(r * s, 1.5), 0, 7); ctx.stroke(); ctx.restore(); };
  circle(r1, "rgba(124,200,255,.65)", 1.4);
  circle(r2, "rgba(233,237,255,.35)", 1.4);
  // transfer: dashed full ellipse faint, solid half
  ctx.save(); ctx.setLineDash([3, 5]); ctx.strokeStyle = rgba(col, .25); ctx.beginPath();
  for (let j = 0; j <= 200; j++) { const [x, y] = pt(Math.PI + j / 200 * Math.PI); j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); ctx.restore();
  ctx.beginPath();
  for (let j = 0; j <= 200; j++) { const [x, y] = pt(j / 200 * Math.PI); j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.strokeStyle = col; ctx.lineWidth = 2.2; ctx.shadowColor = col; ctx.shadowBlur = 12; ctx.stroke(); ctx.shadowBlur = 0;
  // central body
  const isSun = st.disp.mu > 1e19;
  glowDot(ctx, cx, cy, isSun ? 5 : 4, isSun ? "#ffc24b" : "#7cc8ff", 4);
  // burns
  const arrow = (x, y, dy, label, side) => {
    ctx.strokeStyle = "#fff"; ctx.fillStyle = "#fff"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + dy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y + dy); ctx.lineTo(x - 4, y + dy - Math.sign(dy) * 7); ctx.lineTo(x + 4, y + dy - Math.sign(dy) * 7); ctx.closePath(); ctx.fill();
    ctx.font = FONT; ctx.textBaseline = "middle";
    const tw = ctx.measureText(label).width;
    let lx = side > 0 ? x + 9 : x - 9 - tw;
    lx = clamp(lx, 4, W - tw - 4);
    ctx.fillStyle = "rgba(8,11,22,.85)"; roundRect(ctx, lx - 5, y + dy / 2 - 9, tw + 10, 18, 5); ctx.fill();
    ctx.fillStyle = "#e9edff"; ctx.textAlign = "left"; ctx.fillText(label, lx, y + dy / 2 + .5);
  };
  const [ax, ay] = pt(0), [bx, by] = pt(Math.PI);
  const res = st.result.shown;
  arrow(ax, ay, -26, `Δv₁ ${core.fmt(res.dv1, 3)} km/s`, 1);
  arrow(bx, by, 26, `Δv₂ ${core.fmt(res.dv2, 3)} km/s`, -1);
  // spacecraft
  const period = 4200, u = REDUCED ? .5 : ((performance.now() - this.t0) % period) / period;
  const [sx, sy] = pt(u * Math.PI);
  glowDot(ctx, sx, sy, 3, "#ffffff", 4);
  // legend
  ctx.font = FONT; ctx.textAlign = "left"; ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(124,200,255,.9)"; ctx.fillText(`r₁ ${core.fmt(r1, 4)} km`, 8, 6);
  ctx.fillStyle = "rgba(233,237,255,.7)"; ctx.fillText(`r₂ ${core.fmt(r2, 4)} km`, 8, 22);
  const t = core.timeParts(res.tH);
  ctx.fillStyle = col; ctx.fillText(`coast ${core.fmt(t.value, 3)} ${t.unit}`, 8, 38);
}

/* ---- stacked Δv bar (multi-stage) */
function drawStack() {
  const { ctx, W, H, st, spec, col } = this;
  const parts = spec.parts.map(id => Math.max(0, st.result.shown[id] || 0));
  const total = parts.reduce((a, b) => a + b, 0);
  const maxX = Math.max(total, ...spec.refs.map(r => r.x)) * 1.1;
  const L = 12, R = 12, pw = W - L - R, top = 34, bh = 34;
  const X = v => L + v / maxX * pw;
  ctx.font = FONT;
  // ticks
  ctx.strokeStyle = GRID; ctx.fillStyle = AXIS; ctx.textAlign = "center"; ctx.textBaseline = "top";
  linTicks(0, maxX, Math.max(3, Math.floor(pw / 80))).forEach(v => { const x = Math.round(X(v)) + .5; ctx.beginPath(); ctx.moveTo(x, top - 8); ctx.lineTo(x, top + bh + 8); ctx.stroke(); ctx.fillText(core.fmt(v, 3), x, top + bh + 12); });
  ctx.textAlign = "right"; ctx.fillText("km/s", W - R, top + bh + 12);
  // segments
  const shades = [col, "#ffb27a", "#ffd9b8"];
  let acc = 0;
  parts.forEach((v, i) => {
    const x0 = X(acc), x1 = X(acc + v); acc += v;
    if (x1 - x0 < .5) return;
    const g = ctx.createLinearGradient(0, top, 0, top + bh);
    g.addColorStop(0, shades[i % 3]); g.addColorStop(1, rgba(shades[i % 3], .55));
    ctx.fillStyle = g; roundRect(ctx, x0 + 1, top, x1 - x0 - 2, bh, 6); ctx.fill();
    const lbl = `${spec.labels[i]} · ${core.fmt(v, 3)}`;
    ctx.fillStyle = "#140700"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (ctx.measureText(lbl).width < x1 - x0 - 8) ctx.fillText(lbl, (x0 + x1) / 2, top + bh / 2 + 1);
    else if (ctx.measureText(core.fmt(v, 2)).width < x1 - x0 - 6) ctx.fillText(core.fmt(v, 2), (x0 + x1) / 2, top + bh / 2 + 1);
  });
  // refs
  spec.refs.forEach((r, i) => {
    const x = X(r.x);
    ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = "rgba(233,237,255,.6)"; ctx.beginPath(); ctx.moveTo(x, top - 14); ctx.lineTo(x, top + bh + 6); ctx.stroke(); ctx.restore();
    ctx.fillStyle = "rgba(233,237,255,.75)"; ctx.textAlign = x > W - 120 ? "right" : "left"; ctx.textBaseline = "bottom";
    ctx.fillText(r.label, x + (x > W - 120 ? -4 : 4), top - 4 - (i % 2) * 13);
  });
  ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.textBaseline = "top";
  ctx.font = "600 12px 'JetBrains Mono', monospace";
  ctx.fillText(`total ${core.fmt(total, 4)} km/s`, L, 2);
}

/* ---- reference bars (specific impulse) */
function drawRefbars() {
  const { ctx, W, H, st, spec, col } = this;
  const mine = st.result.shown[spec.y];
  const rows = spec.refs.map(r => ({ ...r, me: false }));
  rows.push({ label: "Your engine", value: mine, me: true });
  rows.sort((a, b) => (a.value || 0) - (b.value || 0));
  ctx.font = FONT;
  const labW = Math.max(...rows.map(r => ctx.measureText(r.label).width)) + 12;
  const L = labW + 8, R = 60, T = 6, rowH = (H - T - 18) / rows.length;
  const vals = rows.map(r => r.value).filter(v => v > 0);
  const lo = Math.min(...vals) / 2, hi = Math.max(...vals) * 1.5;
  const X = v => L + Math.log(v / lo) / Math.log(hi / lo) * (W - L - R);
  logTicks(lo, hi).forEach(v => { const x = Math.round(X(v)) + .5; ctx.strokeStyle = GRID; ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, H - 16); ctx.stroke(); ctx.fillStyle = AXIS; ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText(core.fmt(v, 2), x, H - 13); });
  rows.forEach((r, i) => {
    const y = T + i * rowH, h = Math.min(18, rowH - 6);
    ctx.fillStyle = r.me ? "#fff" : AXIS; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.fillText(r.label, L - 8, y + rowH / 2);
    if (!(r.value > 0)) return;
    const x1 = X(r.value);
    ctx.fillStyle = r.me ? col : "rgba(195,202,230,.28)";
    if (r.me) { ctx.shadowColor = col; ctx.shadowBlur = 12; }
    roundRect(ctx, L, y + (rowH - h) / 2, Math.max(2, x1 - L), h, 4); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = r.me ? "#fff" : AXIS; ctx.textAlign = "left";
    ctx.fillText(`${core.fmt(r.value, 3)} s`, x1 + 6, y + rowH / 2);
  });
}

/* ---- helpers for the new plot types */
/** Bessel function J₁ (Numerical Recipes rational approximations; |error| < 1e-8). */
function besselJ1(x) {
  const ax = Math.abs(x);
  if (ax < 8) {
    const y = x * x;
    const a1 = x * (72362614232.0 + y * (-7895059235.0 + y * (242396853.1 + y * (-2972611.439 + y * (15704.48260 + y * -30.16036606)))));
    const a2 = 144725228442.0 + y * (2300535178.0 + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y))));
    return a1 / a2;
  }
  const z = 8 / ax, y = z * z, xx = ax - 2.356194491;
  const b1 = 1 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * -0.240337019e-6)));
  const b2 = 0.04687499995 + y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)));
  const ans = Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * b1 - z * Math.sin(xx) * b2);
  return x < 0 ? -ans : ans;
}
/** Airy intensity with u = θ / θ_Rayleigh (first dark ring at u = 1). */
function airyI(u) {
  const x = 3.8317059702 * Math.abs(u);
  if (x < 1e-6) return 1;
  const j = 2 * besselJ1(x) / x;
  return j * j;
}
/** Colour of a black body (Tanner Helland's fit), as hex. */
function bbColor(T) {
  const t = T / 100;
  let r, g, b;
  if (t <= 66) { r = 255; g = 99.4708025861 * Math.log(t) - 161.1195681661; b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307; }
  else { r = 329.698727446 * Math.pow(t - 60, -0.1332047592); g = 288.1221695283 * Math.pow(t - 60, -0.0755148492); b = 255; }
  const h = v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0");
  return "#" + h(r) + h(g) + h(b);
}
/** Area of overlap of a unit circle and a circle of radius k whose centres are d apart. */
function overlap(d, k) {
  if (d >= 1 + k) return 0;
  if (d <= 1 - k) return Math.PI * k * k;
  if (d <= k - 1) return Math.PI;
  return k * k * Math.acos(clamp((d * d + k * k - 1) / (2 * d * k), -1, 1)) + Math.acos(clamp((d * d + 1 - k * k) / (2 * d), -1, 1))
    - 0.5 * Math.sqrt(Math.max(0, (-d + k + 1) * (d + k - 1) * (d - k + 1) * (d + k + 1)));
}
function label(ctx, t, x, y, color, align = "left", base = "middle") {
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base; ctx.fillText(t, x, y);
}
const hexRGB = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };

/* ---- two stars through a circular aperture (Rayleigh criterion) */
function drawAiry(P) {
  const { ctx, W, H, st, spec, col } = this;
  const th = st.result.shown[spec.th];
  const s0 = st.disp[spec.sep] / th; // separation in units of θ_R
  const cap = 8, s = Math.min(s0, cap) * (0.12 + 0.88 * P);
  const hw = Math.max(2.4, s / 2 + 2.1);
  // ---- image panel (computed at low resolution, scaled up smoothly)
  const S = Math.round(Math.min(H - 16, W * 0.42)), x0 = 8, y0 = Math.round((H - S) / 2);
  const N = 104;
  const key = `${s.toFixed(4)}|${hw.toFixed(3)}|${col}`;
  if (this._key !== key) {
    this._key = key;
    const off = this._off || (this._off = document.createElement("canvas"));
    off.width = off.height = N;
    const octx = off.getContext("2d"), img = octx.createImageData(N, N), [cr, cg, cb] = hexRGB(col);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const ux = ((i + 0.5) / N - 0.5) * 2 * hw, uy = ((j + 0.5) / N - 0.5) * 2 * hw;
      const I = airyI(Math.hypot(ux - s / 2, uy)) + airyI(Math.hypot(ux + s / 2, uy));
      const v = Math.pow(Math.min(1, I), 0.42), w = Math.pow(Math.min(1, I), 2.2);
      const k = 4 * (j * N + i);
      img.data[k] = cr * v + (255 - cr) * w; img.data[k + 1] = cg * v + (255 - cg) * w; img.data[k + 2] = cb * v + (255 - cb) * w; img.data[k + 3] = 255;
    }
    octx.putImageData(img, 0, 0);
  }
  ctx.save();
  roundRect(ctx, x0, y0, S, S, 10); ctx.clip();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.drawImage(this._off, x0, y0, S, S);
  ctx.restore();
  ctx.strokeStyle = "rgba(150,170,255,.18)"; roundRect(ctx, x0 + .5, y0 + .5, S - 1, S - 1, 10); ctx.stroke();
  // scale bar: one θ_R
  const bar = S / (2 * hw);
  ctx.strokeStyle = "rgba(233,237,255,.8)"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x0 + 10, y0 + S - 12); ctx.lineTo(x0 + 10 + bar, y0 + S - 12); ctx.stroke();
  ctx.font = FONT; label(ctx, `θ = ${core.fmt(th, 3)}″`, x0 + 10, y0 + S - 20, "rgba(233,237,255,.85)", "left", "bottom");
  // ---- profile panel
  const L = x0 + S + 34, R = 10, T = 22, B = 24, pw = W - L - R, ph = H - T - B;
  if (pw < 60) return;
  const M = 200, xs = [], a = [], b = [], sum = [];
  for (let i = 0; i <= M; i++) { const u = -hw + 2 * hw * i / M; xs.push(u); a.push(airyI(u + s / 2)); b.push(airyI(u - s / 2)); sum.push(a[i] + b[i]); }
  const ymax = Math.max(1.05, ...sum) * 1.38;
  const X = u => L + (u + hw) / (2 * hw) * pw, Y = v => T + ph - v / ymax * ph;
  ctx.strokeStyle = GRID; ctx.lineWidth = 1;
  [0, 0.5, 1, 1.5, 2].filter(v => v <= ymax).forEach(v => { const y = Math.round(Y(v)) + .5; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(L + pw, y); ctx.stroke(); label(ctx, String(v), L - 6, y, AXIS, "right"); });
  linTicks(-hw, hw, Math.max(3, Math.floor(pw / 70))).forEach(v => { const x = Math.round(X(v)) + .5; ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + ph); ctx.stroke(); label(ctx, core.fmt(v, 2), x, T + ph + 7, AXIS, "center", "top"); });
  label(ctx, "intensity · angle in θ", L - 24, 4, DIM, "left", "top");
  const line = (arr, stroke, w, dash) => { ctx.save(); if (dash) ctx.setLineDash(dash); ctx.beginPath(); arr.forEach((v, i) => i ? ctx.lineTo(X(xs[i]), Y(v)) : ctx.moveTo(X(xs[i]), Y(v))); ctx.strokeStyle = stroke; ctx.lineWidth = w; ctx.stroke(); ctx.restore(); };
  line(a, "rgba(195,202,230,.4)", 1.2, [3, 3]); line(b, "rgba(195,202,230,.4)", 1.2, [3, 3]);
  ctx.beginPath(); sum.forEach((v, i) => i ? ctx.lineTo(X(xs[i]), Y(v)) : ctx.moveTo(X(xs[i]), Y(v))); ctx.lineTo(X(hw), Y(0)); ctx.lineTo(X(-hw), Y(0)); ctx.closePath();
  const g = ctx.createLinearGradient(0, T, 0, T + ph); g.addColorStop(0, rgba(col, .28)); g.addColorStop(1, rgba(col, 0)); ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 10; line(sum, col, 2.2); ctx.restore();
  // verdict
  const peak = Math.max(...sum), mid = sum[M / 2], dip = 1 - mid / peak;
  const sShown = s0 * (0.12 + 0.88 * P);
  const verdict = sShown >= 0.995 ? ["Resolved", "#7dffb0"] : sShown >= 0.77 ? ["Dip visible, below Rayleigh", "#ffd27a"] : ["Unresolved — one blob", "#ff8b7a"];
  ctx.font = "600 11.5px 'JetBrains Mono', monospace";
  label(ctx, verdict[0], L + 4, T + 2, verdict[1], "left", "top");
  ctx.font = FONT;
  label(ctx, `Δ = ${core.fmt(sShown, 3)} θ${dip > 0.005 ? ` · dip ${Math.round(dip * 100)} %` : ""}${s0 > cap ? " · view capped" : ""}`, L + 4, T + 18, "rgba(233,237,255,.7)", "left", "top");
}

/* ---- a planet crossing its star, and the light curve it makes */
function drawTransit() {
  const { ctx, W, H, st, spec, col } = this;
  const depth = st.result.shown[spec.y] * 1e-6, k = Math.sqrt(depth);
  const b = 0.3, span = 1 + k + 0.35;
  const period = 6000, ph0 = REDUCED ? 0.5 : ((performance.now() - (this.t0 || 0)) % period) / period;
  const xp = -span + 2 * span * ph0;
  // star panel
  const S = Math.round(Math.min(H - 12, W * 0.4)), cx = 6 + S / 2, cy = H / 2, Rpx = S * 0.4;
  const halo = ctx.createRadialGradient(cx, cy, Rpx * .9, cx, cy, Rpx * 1.35); halo.addColorStop(0, "rgba(255,190,110,.25)"); halo.addColorStop(1, "rgba(255,190,110,0)");
  ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, Rpx * 1.35, 0, 7); ctx.fill();
  const g = ctx.createRadialGradient(cx - Rpx * .1, cy - Rpx * .1, 0, cx, cy, Rpx);
  g.addColorStop(0, "#fff8e6"); g.addColorStop(.55, "#ffd79a"); g.addColorStop(.9, "#f39a4a"); g.addColorStop(1, "#c8642a");
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, Rpx, 0, 7); ctx.fill();
  const rp = Math.max(1.8, k * Rpx), enlarged = rp > k * Rpx * 1.05;
  const px = cx + xp * Rpx, py = cy + b * Rpx;
  ctx.fillStyle = "#05060c"; ctx.beginPath(); ctx.arc(px, py, rp, 0, 7); ctx.fill();
  ctx.strokeStyle = rgba(col, .8); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(px, py, rp + 1.5, 0, 7); ctx.stroke();
  ctx.font = FONT;
  label(ctx, enlarged ? `planet enlarged ×${core.fmt(rp / (k * Rpx), 2)}` : "planet to scale", 6, H - 4, DIM, "left", "bottom");
  // light curve
  const L = S + 58, R = 10, T = 22, B = 24, pw = W - L - R, phh = H - T - B;
  if (pw < 60) return;
  const f = x => 1 - overlap(Math.hypot(x, b), k) / Math.PI;
  const lo = 1 - depth * 1.35, hi = 1 + depth * 0.3;
  const X = x => L + (x + span) / (2 * span) * pw, Y = v => T + (hi - v) / (hi - lo) * phh;
  ctx.strokeStyle = GRID; ctx.lineWidth = 1;
  [1, 1 - depth / 2, 1 - depth].forEach(v => { const y = Math.round(Y(v)) + .5; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(L + pw, y); ctx.stroke(); label(ctx, v === 1 ? "1" : `−${core.fmt((1 - v) * 1e6, 3)}`, L - 6, y, AXIS, "right"); });
  if (pw > 280) label(ctx, "flux (ppm below 1)", L - 50, 4, DIM, "left", "top");
  label(ctx, "→ time", L + pw, T + phh + 7, DIM, "right", "top");
  const Nn = 220;
  ctx.beginPath(); for (let i = 0; i <= Nn; i++) { const x = -span + 2 * span * i / Nn; i ? ctx.lineTo(X(x), Y(f(x))) : ctx.moveTo(X(x), Y(f(x))); }
  ctx.strokeStyle = "rgba(195,202,230,.25)"; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.save(); ctx.beginPath(); for (let i = 0; i <= Nn; i++) { const x = -span + 2 * span * i / Nn; if (x > xp) break; i ? ctx.lineTo(X(x), Y(f(x))) : ctx.moveTo(X(x), Y(f(x))); }
  ctx.strokeStyle = col; ctx.lineWidth = 2.2; ctx.shadowColor = col; ctx.shadowBlur = 10; ctx.stroke(); ctx.restore();
  glowDot(ctx, X(xp), Y(f(xp)), 3.5, "#ffffff", 3.5);
  ctx.font = "600 11.5px 'JetBrains Mono', monospace";
  label(ctx, `δ = ${core.fmt(depth * 1e6, 4)} ppm`, L + pw, 4, "#fff", "right", "top");
}

/* ---- habitable-zone strip against real planetary systems */
function drawHZ(P) {
  const { ctx, W, H, st, spec, col } = this;
  const r = st.result.shown, din = r[spec.inner], dout = r[spec.outer], dv = r[spec.optIn], dm = r[spec.optOut];
  if (!(din > 0)) { emptyPlot(this, "—"); return; }
  const x0 = Math.min(0.004, dv / 3), x1 = Math.max(8, dm * 3);
  const L = 14, Rr = 14, T = 20, B = 24, pw = W - L - Rr, phh = H - T - B;
  const X = x => L + Math.log(x / x0) / Math.log(x1 / x0) * pw;
  ctx.font = FONT;
  logTicks(x0, x1).forEach(v => { const x = Math.round(X(v)) + .5; ctx.strokeStyle = GRID; ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + phh); ctx.stroke(); label(ctx, core.fmt(v, 2) + (v === 1 ? " AU" : ""), clamp(x, L + 14, W - 22), T + phh + 7, AXIS, "center", "top"); });
  // zone grows from its centre
  const grow = (a, b2) => { const m = Math.sqrt(a * b2), h = Math.sqrt(b2 / a); const e = Math.pow(h, P); return [m / e, m * e]; };
  const [oa, ob] = grow(dv, dm), [ca, cb] = grow(din, dout);
  ctx.fillStyle = rgba(col, .09); ctx.fillRect(X(oa), T, X(ob) - X(oa), phh);
  const gz = ctx.createLinearGradient(0, T, 0, T + phh); gz.addColorStop(0, rgba(col, .34)); gz.addColorStop(1, rgba(col, .12));
  ctx.fillStyle = gz; ctx.fillRect(X(ca), T, X(cb) - X(ca), phh);
  ctx.strokeStyle = rgba(col, .8); ctx.lineWidth = 1.2; [ca, cb].forEach(v => { ctx.beginPath(); ctx.moveTo(X(v) + .5, T); ctx.lineTo(X(v) + .5, T + phh); ctx.stroke(); });
  // star at the left edge, sized loosely with luminosity
  const Lsol = st.disp.L || 1;
  const sr = clamp(5 + 2.2 * Math.log10(Lsol + 1e-9), 3, 16);
  const sg = ctx.createRadialGradient(L - 2, T + phh / 2, 0, L - 2, T + phh / 2, sr * 3.5); sg.addColorStop(0, "#fff4d8"); sg.addColorStop(.3, "rgba(255,200,120,.55)"); sg.addColorStop(1, "rgba(255,200,120,0)");
  ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(L - 2, T + phh / 2, sr * 3.5, 0, 7); ctx.fill();
  // planetary systems
  const rows = spec.rows, rh = phh / rows.length;
  rows.forEach((row, i) => {
    const y = T + rh * (i + 0.62);
    label(ctx, row.name, W - Rr, T + rh * i + 4, "rgba(233,237,255,.55)", "right", "top");
    ctx.strokeStyle = "rgba(195,202,230,.14)"; ctx.beginPath(); ctx.moveTo(L, y + .5); ctx.lineTo(L + pw, y + .5); ctx.stroke();
    row.bodies.forEach(([name, a], j) => {
      if (a < x0 || a > x1) return;
      const x = X(a), inside = a >= din && a <= dout, opt = a >= dv && a <= dm;
      ctx.globalAlpha = clamp(P * 1.4 - j * 0.06, 0, 1);
      if (inside) { ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.stroke(); }
      ctx.fillStyle = inside ? "#fff" : opt ? "rgba(233,237,255,.8)" : "rgba(195,202,230,.5)";
      ctx.beginPath(); ctx.arc(x, y, inside ? 3.6 : 3, 0, 7); ctx.fill();
      label(ctx, name, x, y + (j % 2 ? 11 : -11), inside ? "#fff" : "rgba(195,202,230,.7)", "center", j % 2 ? "top" : "bottom");
      ctx.globalAlpha = 1;
    });
  });
  ctx.font = "600 11.5px 'JetBrains Mono', monospace";
  label(ctx, `habitable zone ${core.fmt(din, 3)}–${core.fmt(dout, 3)} AU`, L + 4, 4, col, "left", "top");
}

/* ---- logarithmic class ladder (solar flares) */
function drawLadder(P) {
  const { ctx, W, H, st, spec, col } = this;
  const v = st.result.shown[spec.y];
  const lo = spec.min, hi = spec.max, L = 12, R = 12, pw = W - L - R;
  const X = f => L + Math.log(f / lo) / Math.log(hi / lo) * pw;
  const top = Math.round(H * 0.42), bh = Math.round(H * 0.26);
  ctx.font = FONT;
  spec.bands.forEach(([name, f0], i) => {
    const f1 = i + 1 < spec.bands.length ? spec.bands[i + 1][1] : hi;
    const a = X(f0), b = X(f1), alpha = 0.07 + i * 0.1;
    const g = ctx.createLinearGradient(0, top, 0, top + bh); g.addColorStop(0, rgba(col, alpha + .08)); g.addColorStop(1, rgba(col, alpha * .5));
    ctx.fillStyle = g; roundRect(ctx, a + 1, top, b - a - 2, bh, 6); ctx.fill();
    ctx.font = "700 " + Math.round(bh * .55) + "px 'Space Grotesk', sans-serif";
    label(ctx, name, (a + b) / 2, top + bh / 2 + 1, i >= 3 ? "#fff" : "rgba(233,237,255,.75)", "center");
  });
  ctx.font = FONT;
  for (let e = Math.ceil(Math.log10(lo)); e <= Math.floor(Math.log10(hi)); e++) label(ctx, "10" + core.sup(e), X(Math.pow(10, e)), top + bh + 8, AXIS, "center", "top");
  label(ctx, "peak flux, W/m² (log scale)", L, 4, DIM, "left", "top");
  // historic events
  spec.refs.forEach((r, i) => {
    const x = X(r.v), y = top - 8 - (i % 3) * 13;
    ctx.strokeStyle = "rgba(233,237,255,.45)"; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(x + .5, y + 3); ctx.lineTo(x + .5, top + bh); ctx.stroke(); ctx.setLineDash([]);
    label(ctx, r.label, x > W - 90 ? x - 4 : x + 4, y, "rgba(233,237,255,.72)", x > W - 90 ? "right" : "left", "bottom");
  });
  // your flare, sliding in from the left
  if (!(v > 0)) return;
  const xv = L + (X(clamp(v, lo, hi)) - L) * P;
  const gl = ctx.createLinearGradient(0, top - 6, 0, top + bh + 6); gl.addColorStop(0, rgba(col, 0)); gl.addColorStop(.5, rgba(col, .9)); gl.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = gl; ctx.fillRect(xv - 1.5, top - 6, 3, bh + 12);
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(xv, top + bh + 3); ctx.lineTo(xv - 6, top + bh + 13); ctx.lineTo(xv + 6, top + bh + 13); ctx.closePath(); ctx.fill();
  ctx.font = "700 15px 'Space Grotesk', sans-serif";
  label(ctx, core.flareClass(v), clamp(xv, L + 20, W - R - 20), H - 4, "#fff", "center", "bottom");
}

/* ---- Hertzsprung–Russell diagram */
function drawHR(P) {
  const { ctx, W, H, st, spec, col } = this;
  const T0 = 42000, T1 = 2300, L0 = 1e-5, L1 = 3e6;
  const Lm = 40, R = 12, T = 14, B = 24, pw = W - Lm - R, phh = H - T - B;
  const X = t => Lm + Math.log(T0 / t) / Math.log(T0 / T1) * pw, Y = l => T + phh - Math.log(l / L0) / Math.log(L1 / L0) * phh;
  // temperature tint
  const g = ctx.createLinearGradient(Lm, 0, Lm + pw, 0);
  [42000, 20000, 10000, 7000, 5500, 4500, 3500, 2300].forEach(t => g.addColorStop((X(t) - Lm) / pw, rgba(bbColor(t), .075)));
  ctx.fillStyle = g; ctx.fillRect(Lm, T, pw, phh);
  ctx.font = FONT; ctx.lineWidth = 1;
  [1e-4, 1e-2, 1, 1e2, 1e4, 1e6].forEach(l => { const y = Math.round(Y(l)) + .5; ctx.strokeStyle = GRID; ctx.beginPath(); ctx.moveTo(Lm, y); ctx.lineTo(Lm + pw, y); ctx.stroke(); label(ctx, l === 1 ? "1" : "10" + core.sup(Math.round(Math.log10(l))), Lm - 6, y, AXIS, "right"); });
  [30000, 10000, 5000, 3000].forEach(t => { const x = Math.round(X(t)) + .5; ctx.strokeStyle = GRID; ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + phh); ctx.stroke(); label(ctx, core.fmt(t, 2) + " K", x, T + phh + 7, AXIS, "center", "top"); });
  label(ctx, "L/L☉", 4, 2, DIM, "left", "top");

  ctx.save(); ctx.beginPath(); ctx.rect(Lm, T, pw, phh); ctx.clip();
  // lines of equal radius
  [0.01, 0.1, 1, 10, 100, 1000].forEach(r => {
    const Lof = t => r * r * Math.pow(t / 5772, 4);
    ctx.setLineDash([3, 5]); ctx.strokeStyle = "rgba(195,202,230,.22)"; ctx.beginPath();
    ctx.moveTo(X(T0), Y(Lof(T0))); ctx.lineTo(X(T1), Y(Lof(T1))); ctx.stroke(); ctx.setLineDash([]);
    // label at the hot (left) edge, or where the line enters through the top
    let tl = T0 * 0.97; if (Lof(tl) > L1 * 0.6) tl = 5772 * Math.pow(L1 * 0.45 / (r * r), 0.25);
    if (Lof(tl) >= L0 && tl <= T0 && tl >= T1) label(ctx, `${core.fmt(r, 2)} R☉`, X(tl) + 3, Y(Lof(tl)) + 3, "rgba(195,202,230,.55)", "left", "top");
  });
  // main sequence (approximate track)
  const MS = [[40000, 3e5], [30000, 6e4], [20000, 4e3], [10000, 50], [7500, 5], [6000, 1.4], [5772, 1], [5000, 0.4], [4000, 0.1], [3500, 0.03], [3000, 0.004], [2500, 0.0006]];
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  const msPath = () => { ctx.beginPath(); MS.forEach(([t, l], i) => i ? ctx.lineTo(X(t), Y(l)) : ctx.moveTo(X(t), Y(l))); };
  msPath(); ctx.strokeStyle = rgba(col, .1); ctx.lineWidth = 16; ctx.stroke();
  msPath(); ctx.strokeStyle = rgba(col, .35); ctx.lineWidth = 1.2; ctx.stroke();
  ctx.lineWidth = 1;
  label(ctx, "main sequence", X(16000), Y(1500) + 16, rgba(col, .8), "left", "top");
  // catalogue stars
  spec.stars.forEach(([name, l, t, pos], i) => {
    const a = clamp(P * spec.stars.length - i, 0, 1);
    if (!a) return;
    ctx.globalAlpha = a;
    const x = X(t), y = Y(l), c = bbColor(t);
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 7); ctx.fill();
    const left = pos === "l" || (!pos && x > Lm + pw - 70);
    const dy = pos === "u" ? -8 : pos === "d" ? 8 : 0;
    label(ctx, name, left ? x - 6 : x + 6, y + dy, "rgba(233,237,255,.66)", left ? "right" : "left");
    ctx.globalAlpha = 1;
  });
  ctx.restore();
  // your star
  const lu = st.disp[spec.L], tu = st.disp[spec.T];
  const x = clamp(X(tu), Lm, Lm + pw), y = clamp(Y(lu), T, T + phh), c = bbColor(tu);
  ctx.globalAlpha = clamp((P - .4) / .6, 0, 1);
  ctx.save(); ctx.setLineDash([3, 4]); ctx.strokeStyle = rgba(col, .5); ctx.beginPath(); ctx.moveTo(x, T + phh); ctx.lineTo(x, y); ctx.lineTo(Lm, y); ctx.stroke(); ctx.restore();
  const gg = ctx.createRadialGradient(x, y, 0, x, y, 18); gg.addColorStop(0, c); gg.addColorStop(.35, rgba(c, .5)); gg.addColorStop(1, rgba(c, 0));
  ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, 18, 0, 7); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill();
  ctx.font = "600 11px 'JetBrains Mono', monospace";
  label(ctx, `R = ${core.fmt(st.result.shown.R, 3)} R☉`, x > Lm + pw - 110 ? x - 12 : x + 12, y - 12, "#fff", x > Lm + pw - 110 ? "right" : "left");
  ctx.globalAlpha = 1;
}

const DRAW = { xy: drawXY, orbit: drawOrbit, hohmann: drawHohmann, stack: drawStack, refbars: drawRefbars, airy: drawAiry, transit: drawTransit, hz: drawHZ, ladder: drawLadder, hr: drawHR };

/* ================================================================ constants */
function buildConstants() {
  const tb = $("#ktable tbody");
  let group = "", html = "";
  for (const c of DATA.constants) {
    if (c.group !== group) { group = c.group; html += `<tr class="grp"><td colspan="5">${esc(group)}</td></tr>`; }
    html += `<tr tabindex="0" data-v="${c.value}" title="Click to copy ${esc(core.plain(c.value))}"><td class="sym">${tex(c.sym)}</td><td>${esc(c.name)}</td><td class="num">${constText(c)}</td><td class="mono">${esc(c.unit)}</td><td class="src">${esc(c.source)}</td></tr>`;
  }
  tb.innerHTML = html;
  tb.addEventListener("click", e => { const tr = e.target.closest("tr[data-v]"); if (tr) copy(String(+tr.dataset.v), `Copied ${String(+tr.dataset.v)}`); });
  tb.addEventListener("keydown", e => { if (e.key === "Enter") { const tr = e.target.closest("tr[data-v]"); if (tr) tr.click(); } });
  $("#ksrc").innerHTML = "Sources: " + DATA.constantSources.map(s => `<a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.label)}</a>`).join(" · ");
}
/** Full-precision display with digit grouping, e.g. 6.674 30 × 10⁻¹¹ */
function constText(c) {
  if (c.key === "G") return "6.674&thinsp;30 × 10<sup>−11</sup>"; // CODATA 2018 quotes the trailing zero
  const v = c.value, a = Math.abs(v);
  const groupFrac = s => { const [i, f] = s.split("."); return (i.replace(/\B(?=(\d{3})+(?!\d))/g, "&thinsp;")) + (f ? "." + f.replace(/(\d{3})(?=\d)/g, "$1&thinsp;") : ""); };
  if (a >= 1e6 && Number.isInteger(v) && a < 1e12) return groupFrac(String(v));
  if (a >= 1e6 || a < 1e-3) {
    const [m, e] = v.toExponential().split("e");
    return `${groupFrac(m)} × 10<sup>${String(+e).replace("-", "−")}</sup>`;
  }
  return groupFrac(String(v));
}

/* ================================================================ search */
function setupSearch() {
  const q = $("#q");
  let t;
  q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => filter(q.value, true), 90); });
  q.addEventListener("keydown", e => { if (e.key === "Escape") { q.value = ""; filter("", false); q.blur(); } });
  addEventListener("keydown", e => {
    if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); q.select(); }
  });
  filter("", false);
}
function setQuery(s) {
  const q = $("#q");
  q.value = s;
  filter(s, true);
}
function filter(raw, jump) {
  const terms = norm(raw).split(/\s+/).filter(Boolean);
  let shown = 0;
  const per = {};
  for (const c of CARDS) {
    const hit = terms.every(t => c.art.dataset.search.includes(t));
    c.art.hidden = !hit;
    if (hit) { shown++; per[c.ch.id] = (per[c.ch.id] || 0) + 1; }
  }
  $$(".eqx-chapter[data-chapter]").forEach(sec => {
    if (sec.id === "constants") { sec.hidden = terms.length > 0 && !"constants codata iau".includes(terms[0]); return; }
    sec.hidden = !per[sec.dataset.chapter];
    $$(".ch-toc a", sec).forEach(a => { const el = document.getElementById(a.hash.slice(1)); a.hidden = !el || el.hidden; });
  });
  $$("#chapnav [data-count]").forEach(el => { el.textContent = per[el.dataset.count] || 0; el.parentElement.classList.toggle("off", !per[el.dataset.count]); });
  $("#qcount").textContent = terms.length ? `${shown}/${CARDS.length}` : "";
  $("#empty").hidden = shown > 0;
  $("#empty-q").textContent = raw;
  if (window.ScrollTrigger) ScrollTrigger.refresh();
  if (jump && terms.length) {
    const top = $("#atlas").getBoundingClientRect().top + scrollY - toolbarOffset();
    if (scrollY > top) scrollTo({ top, behavior: "instant" });
  }
  spy();
}
function toolbarOffset() {
  const nav = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-h")) || 60;
  return nav + $("#toolbar").offsetHeight + 8;
}

/* ================================================================ scroll-spy + progress */
let spyReq = 0;
function setupSpy() {
  addEventListener("scroll", () => { if (!spyReq) spyReq = requestAnimationFrame(() => { spyReq = 0; spy(); }); }, { passive: true });
  addEventListener("resize", spy);
  spy();
}
let lastActive = null;
function spy() {
  const line = toolbarOffset() + innerHeight * 0.18;
  let active = null;
  $$(".eqx-chapter").forEach(sec => { if (!sec.hidden && sec.getBoundingClientRect().top <= line) active = sec.dataset.chapter; });
  const nav = $("#chapnav"), ind = $(".ind", nav);
  $$("a", nav).forEach(a => a.classList.toggle("on", a.dataset.ch === active));
  const on = active && $(`a[data-ch="${active}"]`, nav);
  if (on && ind) {
    ind.style.opacity = 1;
    ind.style.transform = `translateX(${on.offsetLeft}px)`;
    ind.style.width = on.offsetWidth + "px";
    ind.style.setProperty("--acc", on.style.getPropertyValue("--acc"));
    if (active !== lastActive && nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: on.offsetLeft - nav.clientWidth / 2 + on.offsetWidth / 2, behavior: REDUCED ? "auto" : "smooth" });
  } else if (ind) ind.style.opacity = 0;
  lastActive = active;
  const max = document.documentElement.scrollHeight - innerHeight;
  $("#progress").style.transform = `scaleX(${max > 0 ? clamp(scrollY / max, 0, 1) : 0})`;
  $("#toolbar").classList.toggle("stuck", $("#toolbar").getBoundingClientRect().top <= (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-h")) || 60) + 1);
}

/* ================================================================ motion (GSAP) */
/** Card entrance: CSS transitions keyed on .in (opacity only on the card, so anchor targets never move);
 *  the formula wipes in and the plot draws itself (Plot.replay). */
const revealIO = new IntersectionObserver(ents => ents.forEach(en => {
  if (!en.isIntersecting) return;
  revealIO.unobserve(en.target);
  reveal(en.target);
}), { rootMargin: "0px 0px -8% 0px", threshold: 0.04 });
function reveal(art) {
  if (!art.classList.contains("pre")) return;
  const c = art.__card;
  if (c) hydrate(c);
  art.classList.remove("pre");
  art.classList.add("in");
  if (c && c.st && c.st.plot) c.st.plot.replay();
}
function setupMotion() {
  if (!REDUCED) CARDS.forEach(c => revealIO.observe(c.art));
  if (!gsap || REDUCED) return;
  // Keep animations on wall-clock time: a slow first build must not stretch the intro.
  gsap.ticker.lagSmoothing(0);
  const ST = window.ScrollTrigger;
  gsap.from(".eqx-hero-copy > *", { y: 26, opacity: 0, filter: "blur(8px)", duration: 1, stagger: .09, ease: "power3.out", clearProps: "filter" });
  gsap.from("#montage > *", { scale: .9, opacity: 0, duration: 1.4, stagger: .12, ease: "power3.out" });
  if (!ST) return;
  gsap.registerPlugin(ST);
  $$(".ch-head").forEach(h => {
    gsap.from(h.querySelector(".ch-num"), { scrollTrigger: { trigger: h, start: "top 88%", once: true }, x: -30, opacity: 0, duration: 1, ease: "power3.out" });
    gsap.from(h.querySelectorAll(".eyebrow, h2, .lede, .ch-toc"), { scrollTrigger: { trigger: h, start: "top 88%", once: true }, y: 28, opacity: 0, filter: "blur(6px)", duration: .9, stagger: .08, ease: "power3.out", clearProps: "filter" });
  });
  gsap.from(".eqx-constants tbody tr", { scrollTrigger: { trigger: "#ktable", start: "top 85%", once: true }, opacity: 0, x: -12, duration: .5, stagger: .025, ease: "power2.out" });
  // montage parallax
  gsap.fromTo("#montage", { y: 0, opacity: 1 }, { scrollTrigger: { trigger: ".eqx-hero", start: "top top", end: "bottom top", scrub: true }, y: 80, opacity: .35, ease: "none" });
}
