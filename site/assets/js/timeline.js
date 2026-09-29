/* Cosmic Library — Timeline
 *
 * Data: data/timeline.json (events, agency colours, category names, decade
 * summaries). Images reuse the gallery's local copies when
 * scripts/fetch_gallery.py has been run (data/gallery.local.json).
 *
 * Motion (GSAP + ScrollTrigger, vendored): the spine fills as you scroll,
 * cards fly in from their side, nodes light up as the spine reaches them,
 * decade numerals wipe in, and a sticky rail tracks the current decade.
 * Reduced motion keeps the scroll-linked state (fill, lit nodes, rail) but
 * drops the fly-ins.
 */

const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
if (gsap && ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
if (gsap && window.ScrambleTextPlugin) gsap.registerPlugin(window.ScrambleTextPlugin);
const reduce = (window.Codex && window.Codex.reducedMotion) ||
  (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

const $ = (s, r = document) => r.querySelector(s);
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC[c]);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SPINE_POINT = "top 55%"; // where the glowing head of the spine sits on screen

let DATA, EVENTS = [], LOCAL = {};
const state = { agency: "all", category: "all" };
const list = $("#tlList");
const rail = $("#tlRail");
let ctx = null;          // gsap.context for everything rebuilt on filter change
let currentYear = null;
let railST = null;

function parts(date) {
  const [y, m, d] = String(date).split("-");
  return { y: +y, m: m ? +m : null, d: d ? +d : null };
}
function dayMonth(p) {
  if (p.d) return `${p.d} ${MONTHS[p.m - 1]}`;
  if (p.m) return MONTHS[p.m - 1];
  return "";
}
function agencyColor(e) { return (DATA.agencies[e.agencies[0]] || DATA.agencies.other).color; }

async function getJSON(url, timeout = 8000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

/* ------------------------------------------------------------------ render */
/* "Firsts": milestones whose title names a first (first human in space, first rover…).
   They get a gold star node, an animated badge and a star on the space-race chart. */
const isFirst = (e) => /\bfirst\b/i.test(e.title);
function firstLabel(e) {
  const m = e.title.match(/[,:]\s*(?:the\s+)?(.*\bfirst\b.*)$/i);
  const t = m ? m[1] : e.title;
  return t.charAt(0).toUpperCase() + t.slice(1);
}
const STAR = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.2l2 4.3 4.7.5-3.5 3.2 1 4.6L8 11.5l-4.2 2.3 1-4.6L1.3 6l4.7-.5z"/></svg>';

function cardHTML(e, i) {
  const p = parts(e.date);
  const first = isFirst(e);
  const tags = e.agencies.map((a) => {
    const ag = DATA.agencies[a] || DATA.agencies.other;
    return `<span class="tl-tag" style="--tc:${ag.color}" title="${esc(ag.full || ag.label)}"><i></i>${esc(ag.label)}</span>`;
  }).join("") + `<span class="tl-tag cat">${esc(DATA.categories[e.category] || e.category)}</span>`;
  const fig = e.image ? `
      <figure class="tl-fig" data-src="${esc(LOCAL[e.gallery] || e.image)}" data-alt-src="${esc(LOCAL[e.gallery] ? e.image : "")}">
        <div class="ph"><span>${esc(e.imageCredit || "")}</span></div>
        <img alt="${esc(e.title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">
        <figcaption>${esc(e.imageCredit || "")}</figcaption>
      </figure>` : "";
  return `
    <li class="tl-ev${first ? " is-first" : ""}" data-i="${i}" data-year="${p.y}" style="--c:${agencyColor(e)}">
      <span class="tl-node" aria-hidden="true"></span>
      <div class="tl-when" aria-hidden="true"><b>${p.y}</b>${esc(dayMonth(p))}</div>
      <article class="tl-card">
        ${fig}
        ${first ? `<div class="tl-first" title="${esc(firstLabel(e))}">${STAR}<span>First</span><span class="sr-only">: ${esc(firstLabel(e))}</span></div>` : ""}
        <div class="tl-meta"><time class="tl-date" datetime="${esc(e.date)}">${esc([dayMonth(p), p.y].filter(Boolean).join(" "))}</time>${tags}</div>
        <h3>${esc(e.title)}</h3>
        <p>${esc(e.description)}</p>
        <div class="tl-foot"><span class="tl-org">${esc(e.org || "")}</span><a class="tl-more" href="${esc(e.link)}" target="_blank" rel="noopener">Read more ↗</a></div>
      </article>
    </li>`;
}

function render() {
  let html = "", lastDec = null;
  EVENTS.forEach((e, i) => {
    const dec = Math.floor(parts(e.date).y / 10) * 10;
    if (dec !== lastDec) {
      lastDec = dec;
      html += `<li class="tl-dec" id="dec-${dec}" data-dec="${dec}"><span class="yr" data-y="${dec}s">${dec}s</span>` +
        (DATA.decades[dec] ? `<p>${esc(DATA.decades[dec])}</p>` : "") + "</li>";
    }
    html += cardHTML(e, i);
  });
  list.innerHTML = html;

  list.querySelectorAll(".tl-fig").forEach((fig) => {
    const img = fig.querySelector("img");
    img.addEventListener("load", () => fig.classList.add("loaded"));
    img.addEventListener("error", () => {
      const alt = fig.dataset.altSrc;
      if (alt && img.src !== alt) { fig.dataset.altSrc = ""; img.src = alt; }
    });
    img.src = fig.dataset.src;
  });

  // Rail: one button per decade.
  const decs = [...new Set(EVENTS.map((e) => Math.floor(parts(e.date).y / 10) * 10))];
  $("#railList").innerHTML = decs.map((d) => `<li><button type="button" data-dec="${d}" aria-label="Jump to the ${d}s"><span>${d}s</span></button></li>`).join("");
}

/* ------------------------------------------------------------------ filters */
function buildFilters() {
  const count = (key, val) => EVENTS.filter((e) => (key === "agency" ? e.agencies.includes(val) : e.category === val)).length;
  const aWrap = $("#fAgency"), cWrap = $("#fCategory");
  aWrap.innerHTML = `<span class="lab">Agency</span><button type="button" class="tchip" data-k="agency" data-v="all" aria-pressed="true" style="--c:var(--ice)">All</button>` +
    Object.entries(DATA.agencies).map(([k, a]) => `<button type="button" class="tchip" data-k="agency" data-v="${k}" aria-pressed="false" style="--c:${a.color}" title="${esc(a.full || a.label)}"><span class="dot"></span>${esc(a.label)}<span class="n">${count("agency", k)}</span></button>`).join("");
  cWrap.innerHTML = `<span class="lab">Category</span><button type="button" class="tchip" data-k="category" data-v="all" aria-pressed="true">All</button>` +
    Object.entries(DATA.categories).map(([k, label]) => `<button type="button" class="tchip" data-k="category" data-v="${k}" aria-pressed="false">${esc(label)}<span class="n">${count("category", k)}</span></button>`).join("");
  $("#filters").addEventListener("click", (ev) => {
    const b = ev.target.closest(".tchip");
    if (!b) return;
    state[b.dataset.k] = b.dataset.v;
    applyFilters(true);
  });
  $("#tlReset").addEventListener("click", () => { state.agency = state.category = "all"; applyFilters(true); });
}

function applyFilters(userAction = false) {
  document.querySelectorAll("#filters .tchip").forEach((c) => c.setAttribute("aria-pressed", String(state[c.dataset.k] === c.dataset.v)));
  let side = 0, shown = 0;
  const decHas = {};
  list.querySelectorAll(".tl-ev").forEach((li) => {
    const e = EVENTS[+li.dataset.i];
    const ok = (state.agency === "all" || e.agencies.includes(state.agency)) && (state.category === "all" || e.category === state.category);
    li.hidden = !ok;
    li.classList.remove("left", "right");
    if (ok) {
      li.classList.add(side++ % 2 ? "right" : "left");
      shown++;
      decHas[Math.floor(+li.dataset.year / 10) * 10] = true;
    }
  });
  list.querySelectorAll(".tl-dec").forEach((d) => { d.hidden = !decHas[d.dataset.dec]; });
  $("#railList").querySelectorAll("button").forEach((b) => { b.disabled = !decHas[b.dataset.dec]; });
  const total = EVENTS.length;
  $("#tlCount").textContent = shown === total ? `${total} milestones` : `Showing ${shown} of ${total} milestones`;
  $("#tlReset").hidden = state.agency === "all" && state.category === "all";
  $("#tlEmpty").hidden = shown > 0;
  updateRace();
  buildMotion(userAction);
}

/* ------------------------------------------------------------------ motion */
function setYear(y) {
  if (y == null || y === currentYear) return;
  currentYear = y;
  const pill = $("#tlYearPill");
  if (pill) {
    pill.textContent = String(y);
    if (gsap && !reduce) gsap.fromTo(pill, { scale: 1.25 }, { scale: 1, duration: 0.35, ease: "back.out(3)", overwrite: true });
  }
  const el = $("#railYear");
  if (gsap && window.ScrambleTextPlugin && !reduce) gsap.to(el, { duration: 0.5, scrambleText: { text: String(y), chars: "0123456789", speed: 0.8 }, overwrite: true });
  else el.textContent = String(y);
  const dec = Math.floor(y / 10) * 10;
  const btns = $("#railList").querySelectorAll("button");
  btns.forEach((b) => {
    const on = +b.dataset.dec === dec;
    b.setAttribute("aria-current", String(on));
    if (on && getComputedStyle($("#railList")).display === "flex") {
      const l = $("#railList");
      l.scrollTo({ left: b.parentElement.offsetLeft - l.clientWidth / 2 + b.offsetWidth / 2, behavior: reduce ? "auto" : "smooth" });
    }
  });
}

function buildMotion(userAction) {
  const tl = $("#tl"), fill = $("#tlFill"), head = $("#tlHead");
  if (!gsap || !ScrollTrigger) { // static fallback: everything visible, spine fully drawn
    fill.style.transform = "scaleY(1)"; head.style.top = "100%";
    list.querySelectorAll(".tl-ev").forEach((li) => li.classList.add("lit"));
    return;
  }
  if (ctx) ctx.revert();
  ctx = gsap.context(() => {
    const visible = [...list.querySelectorAll(".tl-ev:not([hidden])")];
    const phone = matchMedia("(max-width: 900px)").matches;

    // Spine fill + glowing head, scrubbed to scroll.
    gsap.fromTo(fill, { scaleY: 0 }, {
      scaleY: 1, ease: "none",
      scrollTrigger: { trigger: tl, start: SPINE_POINT, end: "bottom 55%", scrub: 0.4,
        onUpdate: (self) => { head.style.top = `${(self.progress * 100).toFixed(3)}%`; } }
    });

    // Rail visible while the line is on screen.
    railST = ScrollTrigger.create({ trigger: tl, start: "top 75%", end: "bottom 40%", onToggle: (self) => rail.classList.toggle("show", self.isActive) });

    visible.forEach((li, k) => {
      const left = li.classList.contains("left");
      const y = +li.dataset.year;
      ScrollTrigger.create({
        trigger: li, start: SPINE_POINT,
        onEnter: () => {
          li.classList.add("lit"); setYear(y);
          if (!reduce && li.classList.contains("is-first")) {
            const badge = li.querySelector(".tl-first");
            gsap.fromTo(badge, { scale: 0.2, rotation: -18, autoAlpha: 0 }, { scale: 1, rotation: 0, autoAlpha: 1, duration: 0.7, ease: "back.out(3)", overwrite: true });
            badge.classList.remove("shine"); void badge.offsetWidth; badge.classList.add("shine");
            const node = li.querySelector(".tl-node");
            node.classList.remove("pulse"); void node.offsetWidth; node.classList.add("pulse");
          }
        },
        onLeaveBack: () => { li.classList.remove("lit"); setYear(k ? +visible[k - 1].dataset.year : +visible[0].dataset.year); }
      });
      if (reduce) return;
      const card = li.querySelector(".tl-card"), when = li.querySelector(".tl-when");
      const dx = phone ? 36 : 80;
      gsap.from(card, {
        x: left && !phone ? -dx : dx, y: 24, rotation: phone ? 0 : (left ? -1.5 : 1.5), autoAlpha: 0, duration: 0.9, ease: "power3.out",
        scrollTrigger: { trigger: li, start: "top 90%", toggleActions: "play none none reverse" }
      });
      gsap.from(when, {
        x: phone ? 0 : (left ? 30 : -30), autoAlpha: 0, duration: 0.8, ease: "power2.out", delay: 0.1,
        scrollTrigger: { trigger: li, start: "top 90%", toggleActions: "play none none reverse" }
      });
    });

    // Decade numerals: a gradient wipe tied to scroll.
    list.querySelectorAll(".tl-dec:not([hidden]) .yr").forEach((yr) => {
      if (reduce) { yr.style.setProperty("--wipe", "0%"); return; }
      gsap.fromTo(yr, { "--wipe": "100%" }, { "--wipe": "0%", ease: "none", scrollTrigger: { trigger: yr, start: "top 85%", end: "top 45%", scrub: true } });
    });
  });
  ScrollTrigger.refresh();
  if (railST) rail.classList.toggle("show", railST.isActive); // also correct when built mid-page
  if (userAction) {
    currentYear = null;
    const firstLit = [...list.querySelectorAll(".tl-ev.lit:not([hidden])")].pop();
    setYear(firstLit ? +firstLit.dataset.year : (EVENTS[0] && parts(EVENTS[0].date).y));
  }
}

/* ------------------------------------------------------------------ space-race chart
 * Stacked area of milestones per decade per agency, built from timeline.json.
 * x: decade (point at the decade's middle), y: number of milestones (linear, from zero).
 * Colours are the agencies' own colours from timeline.json, stacked in an order whose
 * neighbours stay distinguishable with colour-vision deficiency; every band also carries a
 * direct label or a legend entry with its name, and a table holds the same numbers.
 * It reflects the category filter, highlights the selected agency, and draws itself
 * left → right as it scrolls into view.
 */
const RACE_ORDER = ["nasa", "ussr", "esa", "cnsa", "jaxa", "isro", "spacex", "other"];
const SHORT = { ussr: "USSR / Russia", cnsa: "China", isro: "India", jaxa: "Japan" };
const SVGNS = "http://www.w3.org/2000/svg";
const RACE = { decs: [], keys: [], cur: null, W: 0, H: 0, m: { l: 40, r: 16, t: 16, b: 84 }, reveal: 1, tween: null, hover: -1, built: false };

function raceCounts() {
  const byKey = {};
  RACE.keys.forEach((k) => (byKey[k] = RACE.decs.map(() => 0)));
  EVENTS.forEach((e) => {
    if (state.category !== "all" && e.category !== state.category) return;
    const di = RACE.decs.indexOf(Math.floor(parts(e.date).y / 10) * 10);
    e.agencies.forEach((a) => { const k = byKey[a] ? a : "other"; if (di >= 0) byKey[k][di]++; });
  });
  return byKey;
}

/** Monotone cubic interpolation (Fritsch–Carlson): smooth, never overshoots the data. */
function monotone(pts) {
  const n = pts.length;
  if (n < 2) return "";
  const dx = [], m = [], t = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i]; }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s2 = a * a + b * b;
    if (s2 > 9) { const k = 3 / Math.sqrt(s2); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = "";
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], h = dx[i] / 3;
    d += `C${(x0 + h).toFixed(1)},${(y0 + t[i] * h).toFixed(1)} ${(x1 - h).toFixed(1)},${(y1 - t[i + 1] * h).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return d;
}

function buildRace() {
  const svg = $("#raceSvg");
  if (!svg) return;
  const ys = EVENTS.map((e) => parts(e.date).y);
  for (let d = Math.floor(Math.min(...ys) / 10) * 10; d <= Math.floor(Math.max(...ys) / 10) * 10; d += 10) RACE.decs.push(d);
  RACE.keys = RACE_ORDER.filter((k) => DATA.agencies[k]).concat(Object.keys(DATA.agencies).filter((k) => !RACE_ORDER.includes(k)));
  RACE.cur = raceCounts();

  // Legend = filter buttons (name + total), so identity never rests on colour alone.
  $("#raceLegend").innerHTML = RACE.keys.map((k) => {
    const a = DATA.agencies[k];
    return `<button type="button" class="race-key" data-k="${k}" aria-pressed="false" style="--c:${a.color}" title="${esc(a.full || a.label)}"><i></i><span>${esc(SHORT[k] || a.label)}</span><b data-n></b></button>`;
  }).join("");
  $("#raceLegend").addEventListener("click", (ev) => { const b = ev.target.closest(".race-key"); if (b) raceSelect(b.dataset.k); });

  const plot = $("#racePlot");
  plot.addEventListener("pointermove", raceHover);
  plot.addEventListener("pointerleave", () => raceTip(-1));
  svg.addEventListener("click", (ev) => {
    const star = ev.target.closest(".race-star");
    if (star) { jumpToEvent(+star.dataset.i); return; }
    const band = ev.target.closest(".race-band");
    if (band) raceSelect(band.dataset.k);
  });
  svg.addEventListener("keydown", (ev) => {
    const t = ev.target.closest(".race-star, .race-band");
    if (!t || (ev.key !== "Enter" && ev.key !== " ")) return;
    ev.preventDefault();
    t.classList.contains("race-star") ? jumpToEvent(+t.dataset.i) : raceSelect(t.dataset.k);
  });
  svg.addEventListener("focusin", (ev) => {
    const star = ev.target.closest(".race-star");
    if (star) starTip(star);
  });
  svg.addEventListener("focusout", () => raceTip(-1));

  RACE.built = true;
  raceResize();
  if ("ResizeObserver" in window) new ResizeObserver(raceResize).observe(plot);

  // Draw itself on scroll: a clip reveals the decades left → right, with a glowing
  // "now" edge that reads out the decade being revealed.
  if (gsap && ScrollTrigger && !reduce) {
    RACE.reveal = 0;
    ScrollTrigger.create({ trigger: plot, start: "top 88%", end: "top 30%", scrub: 0.6,
      onUpdate: (self) => { RACE.reveal = self.progress; raceReveal(); } });
    raceReveal();
  }
  raceTable();
}

function raceResize() {
  const plot = $("#racePlot");
  const W = Math.round(plot.clientWidth);
  if (!W) return;
  RACE.W = W;
  RACE.H = W < 600 ? 300 : 360;
  RACE.m.l = W < 600 ? 30 : 40;
  $("#raceSvg").setAttribute("viewBox", `0 0 ${W} ${RACE.H}`);
  $("#raceSvg").style.height = RACE.H + "px";
  raceDraw(true);
}

const rx = (i) => RACE.m.l + (i + 0.5) / RACE.decs.length * (RACE.W - RACE.m.l - RACE.m.r);
const rxYear = (y) => RACE.m.l + (y - RACE.decs[0]) / (RACE.decs.length * 10) * (RACE.W - RACE.m.l - RACE.m.r);

function raceDraw(structure = false) {
  if (!RACE.built || !RACE.W) return;
  const { W, H, m } = RACE;
  const svg = $("#raceSvg");
  const base = H - m.b, top = m.t;
  const n = RACE.decs.length;
  const totals = RACE.decs.map((_, i) => RACE.keys.reduce((s, k) => s + RACE.cur[k][i], 0));
  const maxTot = Math.max(5, ...totals);
  const step = maxTot > 40 ? 10 : 5;
  const yMax = Math.ceil(maxTot / step) * step;
  RACE.ys = (v) => base - v / yMax * (base - top);

  if (structure || !RACE.gBands) {
    svg.querySelectorAll(":scope > :not(desc)").forEach((x) => x.remove());
    const mk = (tag, attrs, parent = svg) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; };
    const defs = mk("defs", {});
    const cp = mk("clipPath", { id: "raceClip" }, defs);
    RACE.clip = mk("rect", { x: 0, y: 0, width: W, height: H }, cp);
    RACE.gGrid = mk("g", { class: "race-grid" });
    RACE.gBands = mk("g", { class: "race-bands", "clip-path": "url(#raceClip)" });
    RACE.gLabels = mk("g", { class: "race-labels", "clip-path": "url(#raceClip)" });
    RACE.gAxis = mk("g", { class: "race-axis" });
    RACE.cross = mk("line", { class: "race-cross", y1: top - 4, y2: base, visibility: "hidden" });
    RACE.edge = mk("g", { class: "race-edge" });
    mk("line", { y1: top - 6, y2: base }, RACE.edge);
    RACE.edgeLbl = mk("text", { y: top - 6, "text-anchor": "middle" }, RACE.edge);
    RACE.gStars = mk("g", { class: "race-stars" });
    RACE.bands = RACE.keys.map((k) => {
      const a = DATA.agencies[k];
      const p = mk("path", { class: "race-band", "data-k": k, fill: a.color, tabindex: "0", role: "button",
        "aria-label": `${a.full || a.label}: select to show only its milestones` }, RACE.gBands);
      return p;
    });
    RACE.bandLbls = RACE.keys.map((k) => mk("text", { class: "race-lbl", "text-anchor": "middle" }, RACE.gLabels));

    // Axes: y gridlines + labels, x decade labels, axis titles.
    let g = "";
    for (let v = 0; v <= yMax; v += step) {
      const y = RACE.ys(v);
      g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}"${v === 0 ? ' class="zero"' : ""}/><text x="${m.l - 8}" y="${y + 3.5}" text-anchor="end">${v}</text>`;
    }
    RACE.gGrid.innerHTML = g;
    const every = W < 600 ? 2 : 1;
    let ax = "";
    RACE.decs.forEach((d, i) => {
      if (i % every) return;
      ax += `<text x="${rx(i)}" y="${base + 17}" text-anchor="middle">${d}s</text>`;
    });
    ax += `<text class="ttl" x="${m.l}" y="${top - 4}" text-anchor="start" transform="translate(0,-2)">Milestones per decade</text>`;
    const wide = W >= 600;
    if (wide) ax += `<text class="ttl" x="${m.l}" y="${base + 42}" text-anchor="start">Famous firsts</text>`;
    ax += `<line class="rug" x1="${wide ? m.l + 92 : m.l}" x2="${W - m.r}" y1="${base + 38}" y2="${base + 38}"/>`;
    RACE.gAxis.innerHTML = ax;

    // Firsts: a gold star at the exact year of each "first", on its own rug row.
    RACE.gStars.innerHTML = "";
    const lastX = [-99, -99, -99, -99]; // stars closer than 11 px step down a row instead of overlapping
    EVENTS.forEach((e, i) => {
      if (!isFirst(e)) return;
      const p = parts(e.date);
      const x = rxYear(p.y + ((p.m || 6) - 1) / 12);
      const gap = W < 600 ? 8.5 : 11;
      let row = lastX.findIndex((lx) => x - lx >= gap);
      if (row < 0) row = lastX.indexOf(Math.min(...lastX));
      lastX[row] = x;
      const s = mk("g", { class: "race-star", "data-i": i, tabindex: "0", role: "button", transform: `translate(${x.toFixed(1)},${base + 38 + row * 11}) scale(${W < 600 ? 0.72 : 1})`,
        "aria-label": `${p.y}: ${firstLabel(e)}. Select to jump to it on the timeline.` }, RACE.gStars);
      mk("circle", { r: 9, class: "hit" }, s);
      mk("path", { d: "M0-6.2l1.8 3.9 4.2.4-3.2 2.9.9 4.2L0 3.1l-3.7 2.1.9-4.2L-6-1.9l4.2-.4z" }, s);
    });
  }

  // Bands: cumulative stacks, bottom → top in RACE.keys order.
  const cum = RACE.decs.map(() => 0);
  RACE.stack = {};
  RACE.keys.forEach((k, ki) => {
    const lo = cum.slice();
    RACE.decs.forEach((_, i) => (cum[i] += RACE.cur[k][i]));
    const hi = cum.slice();
    RACE.stack[k] = { lo, hi };
    // Extend flat to the plot edges so the first/last decade isn't cut to a point.
    const xs = [m.l, ...RACE.decs.map((_, i) => rx(i)), W - m.r];
    const pad = (arr) => [arr[0], ...arr, arr[arr.length - 1]];
    const top = pad(hi).map((v, i) => [xs[i], RACE.ys(v)]);
    const bot = pad(lo).map((v, i) => [xs[i], RACE.ys(v)]).reverse();
    RACE.bands[ki].setAttribute("d", `M${top[0][0]},${top[0][1].toFixed(1)}${monotone(top)}L${bot[0][0]},${bot[0][1].toFixed(1)}${monotone(bot)}Z`);
    // Direct label where the band is thickest (only if it fits).
    let best = -1, bt = 0;
    RACE.decs.forEach((_, i) => { const th = RACE.ys(lo[i]) - RACE.ys(hi[i]); if (th > bt) { bt = th; best = i; } });
    const lbl = RACE.bandLbls[ki];
    const name = SHORT[k] || DATA.agencies[k].label;
    const fits = best >= 0 && bt >= 15 && name.length * 6.6 < (W - m.l - m.r) / n * 1.7;
    lbl.style.display = fits ? "" : "none";
    if (fits) {
      lbl.textContent = name;
      const half = name.length * 3.3 + 4;
      lbl.setAttribute("x", Math.max(m.l + half, Math.min(W - m.r - half, rx(best))).toFixed(1));
      lbl.setAttribute("y", ((RACE.ys(lo[best]) + RACE.ys(hi[best])) / 2 + 4).toFixed(1));
    }
  });
  // Legend totals.
  document.querySelectorAll("#raceLegend .race-key").forEach((b) => {
    const k = b.dataset.k;
    b.querySelector("[data-n]").textContent = RACE.cur[k].reduce((s, v) => s + Math.round(v), 0);
  });
  raceSelectState();
  raceReveal();
}

function raceReveal() {
  if (!RACE.clip) return;
  const { W, m } = RACE;
  const x = m.l + RACE.reveal * (W - m.l - m.r) + (RACE.reveal >= 1 ? m.r : 0);
  RACE.clip.setAttribute("width", Math.max(0, x));
  const show = RACE.reveal > 0.01 && RACE.reveal < 0.995;
  RACE.edge.style.display = show ? "" : "none";
  if (show) {
    RACE.edge.setAttribute("transform", `translate(${x.toFixed(1)},0)`);
    const yr = RACE.decs[0] + RACE.reveal * RACE.decs.length * 10;
    RACE.edgeLbl.textContent = `${Math.floor(yr / 10) * 10}s`;
  }
  // Stars light up as the reveal passes them.
  RACE.gStars.querySelectorAll(".race-star").forEach((s) => {
    const sx = +s.getAttribute("transform").match(/translate\(([-\d.]+)/)[1];
    s.classList.toggle("on", sx <= x + 1);
  });
}

function raceSelectState() {
  const sel = state.agency;
  RACE.bands.forEach((p) => p.classList.toggle("dim", sel !== "all" && p.dataset.k !== sel));
  RACE.bands.forEach((p) => p.classList.toggle("sel", p.dataset.k === sel));
  RACE.bandLbls.forEach((t, i) => t.classList.toggle("dim", sel !== "all" && RACE.keys[i] !== sel));
  document.querySelectorAll("#raceLegend .race-key").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === sel)));
  if (RACE.gStars) RACE.gStars.querySelectorAll(".race-star").forEach((s) => {
    const e = EVENTS[+s.dataset.i];
    const ok = (sel === "all" || e.agencies.includes(sel)) && (state.category === "all" || e.category === state.category);
    s.classList.toggle("off", !ok);
  });
}

function raceSelect(k) {
  state.agency = state.agency === k ? "all" : k;
  applyFilters(true);
}

/** Called from applyFilters: animate the bands to the new category's counts. */
function updateRace() {
  if (!RACE.built) return;
  const target = raceCounts();
  const from = JSON.parse(JSON.stringify(RACE.cur));
  if (RACE.tween) RACE.tween.kill();
  const same = RACE.keys.every((k) => target[k].every((v, i) => v === from[k][i]));
  if (same || !gsap || reduce) { RACE.cur = target; raceDraw(); raceTable(); return; }
  const p = { t: 0 };
  RACE.tween = gsap.to(p, { t: 1, duration: 0.7, ease: "power2.inOut",
    onUpdate: () => {
      RACE.keys.forEach((k) => (RACE.cur[k] = from[k].map((v, i) => v + (target[k][i] - v) * p.t)));
      raceDraw();
    },
    onComplete: () => { RACE.cur = target; raceDraw(); raceTable(); } });
}

function raceTable() {
  const t = $("#raceTable");
  if (!t) return;
  const head = `<thead><tr><th scope="col">Decade</th>${RACE.keys.map((k) => `<th scope="col" class="num">${esc(SHORT[k] || DATA.agencies[k].label)}</th>`).join("")}<th scope="col" class="num">Total</th></tr></thead>`;
  const body = RACE.decs.map((d, i) => {
    const vals = RACE.keys.map((k) => Math.round(RACE.cur[k][i]));
    return `<tr><th scope="row">${d}s</th>${vals.map((v) => `<td class="num">${v || "·"}</td>`).join("")}<td class="num"><b>${vals.reduce((a, b) => a + b, 0)}</b></td></tr>`;
  }).join("");
  t.innerHTML = head + `<tbody>${body}</tbody>`;
  const cap = state.category === "all" ? "" : ` · ${DATA.categories[state.category] || state.category} only`;
  t.setAttribute("aria-label", `Milestones per decade by agency${cap}`);
}

/* Hover: a crosshair on the nearest decade and a tooltip listing every agency there. */
function raceHover(ev) {
  if (!RACE.W) return;
  const r = $("#raceSvg").getBoundingClientRect();
  const x = (ev.clientX - r.left) * (RACE.W / r.width), y = (ev.clientY - r.top) * (RACE.H / r.height);
  const star = ev.target.closest && ev.target.closest(".race-star");
  if (star) { starTip(star); return; }
  if (y > RACE.H - RACE.m.b + 24 || x < RACE.m.l || x > RACE.W - RACE.m.r) { raceTip(-1); return; }
  const i = Math.max(0, Math.min(RACE.decs.length - 1, Math.floor((x - RACE.m.l) / (RACE.W - RACE.m.l - RACE.m.r) * RACE.decs.length)));
  raceTip(i);
}
function tipPlace(tip, x, y) {
  const plotW = $("#racePlot").clientWidth, sc = plotW / RACE.W;
  const w = tip.offsetWidth || 200;
  let left = x * sc + 14;
  if (left + w > plotW - 4) left = x * sc - w - 14;
  tip.style.left = Math.max(4, left) + "px";
  tip.style.top = Math.max(0, y * sc) + "px";
}
function raceTip(i) {
  const tip = $("#raceTip");
  if (i < 0) { tip.classList.remove("on"); RACE.cross.setAttribute("visibility", "hidden"); RACE.hover = -1; return; }
  if (RACE.hover === i && tip.classList.contains("on") && !tip.dataset.star) return;
  RACE.hover = i; delete tip.dataset.star;
  const x = rx(i);
  RACE.cross.setAttribute("x1", x); RACE.cross.setAttribute("x2", x); RACE.cross.setAttribute("visibility", "visible");
  const rows = RACE.keys.map((k) => ({ k, v: Math.round(RACE.cur[k][i]) })).filter((r) => r.v > 0).reverse(); // top band first, like the chart
  const total = rows.reduce((s, r) => s + r.v, 0);
  tip.textContent = "";
  const h = document.createElement("div"); h.className = "tt-h";
  const hb = document.createElement("b"); hb.textContent = `${RACE.decs[i]}s`; h.appendChild(hb);
  h.appendChild(document.createTextNode(` · ${total} milestone${total === 1 ? "" : "s"}`)); tip.appendChild(h);
  if (!rows.length) { const p = document.createElement("div"); p.className = "tt-row"; p.textContent = "None on this timeline"; tip.appendChild(p); }
  rows.forEach((r) => {
    const row = document.createElement("div"); row.className = "tt-row";
    if (state.agency !== "all" && state.agency !== r.k) row.classList.add("dim");
    const key = document.createElement("i"); key.style.background = DATA.agencies[r.k].color;
    const v = document.createElement("b"); v.textContent = r.v;
    const n = document.createElement("span"); n.textContent = SHORT[r.k] || DATA.agencies[r.k].label;
    row.append(key, v, n); tip.appendChild(row);
  });
  tip.classList.add("on");
  tipPlace(tip, x, RACE.m.t + 6);
}
function starTip(star) {
  const tip = $("#raceTip");
  const e = EVENTS[+star.dataset.i];
  RACE.cross.setAttribute("visibility", "hidden"); RACE.hover = -1;
  tip.dataset.star = "1";
  tip.textContent = "";
  const h = document.createElement("div"); h.className = "tt-h";
  const b = document.createElement("b"); b.textContent = String(parts(e.date).y); h.appendChild(b);
  h.appendChild(document.createTextNode(" · famous first"));
  const t = document.createElement("div"); t.className = "tt-first"; t.textContent = firstLabel(e);
  const hint = document.createElement("div"); hint.className = "tt-hint"; hint.textContent = "Select to jump to it";
  tip.append(h, t, hint);
  tip.classList.add("on");
  const sx = +star.getAttribute("transform").match(/translate\(([-\d.]+)/)[1];
  tipPlace(tip, sx, RACE.H - RACE.m.b - 60);
}
function jumpToEvent(i) {
  let li = list.querySelector(`.tl-ev[data-i="${i}"]`);
  if (li && li.hidden) { state.agency = state.category = "all"; applyFilters(true); li = list.querySelector(`.tl-ev[data-i="${i}"]`); }
  if (!li) return;
  li.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  const card = li.querySelector(".tl-card");
  card.animate([{ boxShadow: "0 0 0 0 transparent" }, { boxShadow: "0 0 0 2px #ffc24b, 0 0 40px -6px #ffc24b" }, { boxShadow: "0 0 0 0 transparent" }], { duration: 1800, delay: reduce ? 0 : 600 });
}

/* ------------------------------------------------------------------ navigation */
function bindNav() {
  const smooth = reduce ? "auto" : "smooth";
  $("#railList").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-dec]");
    if (!b || b.disabled) return;
    const target = document.getElementById(`dec-${b.dataset.dec}`);
    if (target) target.scrollIntoView({ behavior: smooth, block: "start" });
  });
  $("#railFilter").addEventListener("click", () => $("#filters").scrollIntoView({ behavior: smooth, block: "start" }));
  $("#jumpLatest").addEventListener("click", () => {
    const last = [...list.querySelectorAll(".tl-ev:not([hidden])")].pop();
    if (last) last.scrollIntoView({ behavior: smooth, block: "center" });
  });
}

function heroIntro() {
  if (!gsap || reduce) return;
  gsap.from(".tl-hero-arc path", { strokeDasharray: 900, strokeDashoffset: 900, duration: 2.4, ease: "power2.inOut" });
  gsap.to(".tl-hero-arc", { yPercent: -30, ease: "none", scrollTrigger: { trigger: ".tl-hero", start: "top top", end: "bottom top", scrub: true } });
}

/* ------------------------------------------------------------------ boot */
async function boot() {
  const [data, local] = await Promise.all([
    getJSON("data/timeline.json"),
    getJSON("data/gallery.local.json", 3000).catch(() => null)
  ]);
  DATA = data;
  LOCAL = (local && local.images) || {};
  EVENTS = data.events.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  $("#statEvents").textContent = String(EVENTS.length);
  $("#statEvents").setAttribute("data-count", String(EVENTS.length));
  render();
  buildFilters();
  buildRace();
  bindNav();
  heroIntro();
  applyFilters(false);
  setYear(parts(EVENTS[0].date).y);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ScrollTrigger && ScrollTrigger.refresh());
}

boot().catch((err) => {
  console.error("Timeline failed to load", err);
  list.innerHTML = '<li class="tl-empty">The timeline data could not be loaded. If you opened this file directly, serve the site folder instead: <code>python3 -m http.server 8000 --directory site</code>.</li>';
});
