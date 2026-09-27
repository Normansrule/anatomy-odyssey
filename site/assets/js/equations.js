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

const ACCENT = { ice: "#7cc8ff", flame: "#ff7a3d", plasma: "#ff4f9a", sol: "#ffc24b", nebula: "#b18cff", aurora: "#4ef0b8" };

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
  // deep link: hydrate everything above the target first so it lands exactly
  const target = location.hash.length > 1 && document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (target) {
    for (const c of CARDS) { if (target.compareDocumentPosition(c.art) & Node.DOCUMENT_POSITION_FOLLOWING && c.art !== target) break; hydrate(c); }
    requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
  }
  setupMotion();
  hydrateRest();
  $("#atlas").setAttribute("aria-busy", "false");
}

/* ================================================================ hero */
const MONTAGE = ["tsiolkovsky", "mass-energy", "vis-viva", "planck", "schwarzschild", "friedmann", "stefan-boltzmann", "lorentz-factor", "sutton-graves", "orbital-period"];
const RING1 = [String.raw`E = mc^2`, String.raw`v = H_0 d`, String.raw`r_s = \tfrac{2GM}{c^2}`, String.raw`\lambda_{max} = \tfrac{b}{T}`, String.raw`1+z = \tfrac1a`, String.raw`q = \tfrac12\rho v^2`];
const RING2 = [String.raw`T^2 \propto a^3`, String.raw`\Delta v`, String.raw`\gamma`, String.raw`F = \tfrac{L}{4\pi d^2}`, String.raw`\sigma T^4`, String.raw`v_c = \sqrt{\mu/r}`, String.raw`T_0(1+z)`, String.raw`I_{sp}g_0`];

function buildHero() {
  const eqs = DATA.equations;
  const plots = eqs.filter(e => e.plot).length;
  countTo($("#st-eq"), eqs.length);
  countTo($("#st-ch"), DATA.chapters.length);
  countTo($("#st-plot"), plots);
  countTo($("#st-k"), DATA.constants.length);

  // orbiting rings of mini-equations
  const ring = (el, list, cls) => {
    el.innerHTML = list.map((s, i) => {
      const a = (360 / list.length) * i;
      return `<span class="mt-item ${cls}" style="--a:${a}deg"><span class="mt-inner">${tex(s)}</span></span>`;
    }).join("");
  };
  ring($("#ring1"), RING1, "r1");
  ring($("#ring2"), RING2, "r2");

  // cycling central equation
  const list = MONTAGE.map(id => eqs.find(e => e.id === id)).filter(Boolean);
  const eqEl = $("#mt-eq"), lbl = $("#mt-label"), dots = $("#mt-dots");
  dots.innerHTML = list.map(() => "<i></i>").join("");
  let k = 0;
  const show = (i, animate) => {
    const e = list[i];
    const set = () => {
      eqEl.innerHTML = tex(e.latex, true);
      lbl.textContent = `${NUM[e.id]} · ${e.title}`;
      $$("i", dots).forEach((d, j) => d.classList.toggle("on", j === i));
      fitMontage();
    };
    if (!animate || !gsap || REDUCED) { set(); return; }
    gsap.to([eqEl, lbl], {
      opacity: 0, y: -10, filter: "blur(10px)", duration: .45, ease: "power2.in", onComplete: () => {
        set();
        gsap.fromTo([eqEl, lbl], { opacity: 0, y: 12, filter: "blur(10px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: .7, ease: "power3.out", stagger: .05 });
      }
    });
  };
  show(0, false);
  if (!REDUCED) setInterval(() => { if (!document.hidden) { k = (k + 1) % list.length; show(k, true); } }, 3600);
  addEventListener("resize", fitMontage);

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
    `<a href="#ch-${c.id}" data-ch="${c.id}" style="--acc:${ACCENT[c.color]}"><span class="n mono">0${c.n}</span><span class="t" title="${esc(c.title)}">${esc(c.short || c.title)}</span><span class="c mono" data-count="${c.id}">${counts[c.id]}</span></a>`
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
        <div class="ch-num" aria-hidden="true">0${ch.n}</div>
        <div>
          <div class="eyebrow">Chapter ${ch.n} · ${eqs.length} equations</div>
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
  // hydrate cards shortly before they scroll into view
  const near = new IntersectionObserver(ents => ents.forEach(en => {
    if (!en.isIntersecting) return;
    near.unobserve(en.target);
    const c = CARDS.find(x => x.art === en.target);
    if (c) hydrate(c);
  }), { rootMargin: "900px 0px" });
  CARDS.forEach(c => near.observe(c.art));
}

/** Light placeholder: title only. The heavy parts (KaTeX, calculator, plot) come in hydrate(). */
function shell(eq, ch) {
  const art = document.createElement("article");
  art.className = "eq card spot";
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
/** Hydrate the remaining cards in small slices so the page stays responsive. */
function hydrateRest() {
  let i = 0;
  const step = () => {
    const t0 = performance.now();
    while (i < CARDS.length && performance.now() - t0 < 12) hydrate(CARDS[i++]);
    if (i < CARDS.length) setTimeout(step, 24);
    else if (window.ScrollTrigger) ScrollTrigger.refresh();
  };
  setTimeout(step, 120);
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
  animate() {
    const animated = (this.spec.type === "orbit" && this.spec.mode === "areas") || this.spec.type === "hohmann";
    if (!animated || REDUCED || this.raf) return;
    const loop = () => {
      if (!this.visible || document.hidden) { this.raf = 0; return; }
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  draw() {
    if (!this.W) return;
    const { ctx, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    ctx.font = FONT;
    try {
      ({ xy: drawXY, orbit: drawOrbit, hohmann: drawHohmann, stack: drawStack, refbars: drawRefbars })[this.spec.type].call(this);
    } catch (e) { console.error(this.eq.id, e); }
  }
}

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
function drawXY() {
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
  ctx.beginPath(); ctx.rect(L, T - 2, pw, ph + 4); ctx.clip();
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

  // hover read-out
  if (this.hover && this.hover.x >= L && this.hover.x <= L + pw) {
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
    if (scrollY > top) scrollTo({ top, behavior: "auto" });
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
function setupMotion() {
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
  const cards = $$(".eq");
  // Only opacity on the card itself: a transform would shift anchor-link targets.
  gsap.set(cards, { opacity: 0 });
  ST.batch(cards, {
    start: "top 92%", once: true,
    onEnter: batch => {
      batch.forEach(el => { const c = CARDS.find(x => x.art === el); if (c) hydrate(c); });
      gsap.to(batch, { opacity: 1, duration: .9, stagger: .12, ease: "power2.out", overwrite: true });
      batch.forEach((c, i) => {
        gsap.from(c.querySelectorAll(".eq-head, .eq-main, .eq-lab"), { y: 34, duration: 1, stagger: .08, delay: i * .12, ease: "power3.out", clearProps: "transform" });
        const disp = c.querySelector(".eq-formula .katex-display");
        if (disp) gsap.fromTo(disp, { clipPath: "inset(0 100% 0 0)", opacity: .2 }, { clipPath: "inset(0 0% 0 0)", opacity: 1, duration: 1.3, delay: .15 + i * .12, ease: "power2.out", clearProps: "clipPath" });
        gsap.from(c.querySelectorAll(".lab-out"), { y: 12, opacity: 0, duration: .6, stagger: .06, delay: .35 + i * .12, ease: "power2.out" });
      });
    }
  });
  gsap.from(".eqx-constants tbody tr", { scrollTrigger: { trigger: "#ktable", start: "top 85%", once: true }, opacity: 0, x: -12, duration: .5, stagger: .025, ease: "power2.out" });
  // montage parallax
  gsap.fromTo("#montage", { y: 0, opacity: 1 }, { scrollTrigger: { trigger: ".eqx-hero", start: "top top", end: "bottom top", scrub: true }, y: 80, opacity: .35, ease: "none" });
}
