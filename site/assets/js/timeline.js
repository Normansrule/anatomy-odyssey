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
function cardHTML(e, i) {
  const p = parts(e.date);
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
    <li class="tl-ev" data-i="${i}" data-year="${p.y}" style="--c:${agencyColor(e)}">
      <span class="tl-node" aria-hidden="true"></span>
      <div class="tl-when" aria-hidden="true"><b>${p.y}</b>${esc(dayMonth(p))}</div>
      <article class="tl-card">
        ${fig}
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
  buildMotion(userAction);
}

/* ------------------------------------------------------------------ motion */
function setYear(y) {
  if (y == null || y === currentYear) return;
  currentYear = y;
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
        onEnter: () => { li.classList.add("lit"); setYear(y); },
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
