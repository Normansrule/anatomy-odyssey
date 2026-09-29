/* Use a telescope (telescopes.html)
 * A checked directory of remote telescopes, live feeds, simulators, archives and
 * citizen-science projects (data/telescopes.json), with:
 *   - an animated observatory hero (GSAP timeline, real J2000 target coordinates)
 *   - a goal chooser that filters the directory with GSAP Flip
 *   - a dot-matrix world map (Natural Earth land mask, 1.5 degree cells) with a live
 *     day/night terminator and pins that turn green when a site is dark
 *   - three illustrated first-observation guides with small live calculators
 *
 * Astronomy used here (all standard, low precision is plenty for a map):
 *   Sun: Astronomical Almanac "low precision formulas for the Sun" (about 0.01 deg),
 *        the same as simulations/cosmic/orbital_elements.py.
 *   Sidereal time: GMST = 280.46061837 + 360.98564736629 d (Meeus, Astronomical Algorithms, eq. 12.4, truncated).
 *   Galactic coordinates: J2000 north galactic pole RA 192.85948, Dec 27.12825, l(NCP) 122.93192 deg
 *        (Hipparcos catalogue, ESA SP-1200, vol. 1, section 1.5.3).
 *   Hydrogen line: 1420.405751768 MHz (hyperfine transition); Doppler v = c (f0 - f) / f0.
 */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const gsap = window.gsap;
const Flip = window.Flip;
if (gsap && Flip) gsap.registerPlugin(Flip);
const REDUCED = !!(window.Codex && window.Codex.reducedMotion);
const D2R = Math.PI / 180, R2D = 180 / Math.PI;

/* ------------------------------------------------------------------ astronomy */
const julian = (date) => date.getTime() / 86400000 + 2440587.5;
function sunPos(date) {
  const n = julian(date) - 2451545.0;
  const L = (280.460 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * D2R;
  const lam = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * D2R;
  const eps = (23.439 - 0.0000004 * n) * D2R;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lam));
  const gmst = gmstDeg(date);
  let lon = (ra * R2D - gmst) % 360;
  if (lon < -180) lon += 360; if (lon > 180) lon -= 360;
  return { dec: dec * R2D, ra: ra * R2D, subLon: lon };
}
function gmstDeg(date) {
  const d = julian(date) - 2451545.0;
  return ((280.46061837 + 360.98564736629 * d) % 360 + 360) % 360;
}
/* altitude (deg) of a body at (ra, dec) seen from (lat, lon) */
function altitude(lat, lon, raDeg, decDeg, date) {
  const H = (gmstDeg(date) + lon - raDeg) * D2R;
  const s = Math.sin(lat * D2R) * Math.sin(decDeg * D2R) + Math.cos(lat * D2R) * Math.cos(decDeg * D2R) * Math.cos(H);
  return Math.asin(Math.max(-1, Math.min(1, s))) * R2D;
}
function sunAlt(lat, lon, sun) {
  const H = (lon - sun.subLon) * D2R;
  const s = Math.sin(lat * D2R) * Math.sin(sun.dec * D2R) + Math.cos(lat * D2R) * Math.cos(sun.dec * D2R) * Math.cos(H);
  return Math.asin(Math.max(-1, Math.min(1, s))) * R2D;
}
function galacticLat(raDeg, decDeg) {
  const ag = 192.85948 * D2R, dg = 27.12825 * D2R, a = raDeg * D2R, d = decDeg * D2R;
  return Math.asin(Math.sin(d) * Math.sin(dg) + Math.cos(d) * Math.cos(dg) * Math.cos(a - ag)) * R2D;
}
const DARK = -12; // nautical twilight: dark enough to start observing

/* ------------------------------------------------------------------ vocab */
const TYPE_ICON = {
  robotic: '<path d="M4 18l6-9M10 9l2-2 4 4-2 2zM14 5l2-2 4 4-2 2M7 21h8M11 13l-2 8"/>',
  radio: '<path d="M4 9a8 8 0 0 0 11 11zM9.5 14.5L15 9M15 9a1.5 1.5 0 1 0 0 0zM17 3.5a6 6 0 0 1 3.5 3.5M16 6.5a3 3 0 0 1 1.5 1.5"/>',
  solar: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',
  live: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/><circle cx="7" cy="10" r="1.2"/>',
  browser: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 8h18M7 13.5l1 .8M12 12l.6.6M15.5 15l.8.4M10 16.5l.4.4"/>',
  desktop: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4M8 12c2-4 6-4 8 0"/>',
  archive: '<ellipse cx="12" cy="5.5" rx="8" ry="2.8"/><path d="M4 5.5v13c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8v-13M4 12c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8"/>',
  citizen: '<circle cx="8" cy="8" r="3"/><circle cx="16.5" cy="9.5" r="2.5"/><path d="M2.5 20c.5-4 3-6 5.5-6s5 2 5.5 6M13.5 15c1-1.2 2-1.7 3-1.7 2 0 4 1.7 4.5 5"/>',
  agency: '<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-25 12 12)"/><circle cx="20" cy="7.5" r="1.2"/>'
};
const TYPE_TONE = { robotic: "ice", radio: "aurora", solar: "sol", live: "plasma", browser: "nebula", desktop: "flame", archive: "text", citizen: "aurora2", agency: "ice2" };
const ico = (t, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TYPE_ICON[t]}</svg>`;
const COSTS = { free: "Free", students: "Free for students", paid: "Paid" };
const AUDS = { anyone: "Anyone", educators: "Students & educators", account: "Account needed" };
const COST_RANK = { free: 0, students: 1, paid: 2 };
const AUD_RANK = { anyone: 0, account: 1, educators: 2 };

const GOALS = [
  { id: "photo", t: "Take my own photo of a galaxy", s: "Robotic optical telescopes that email you the image",
    art: '<g class="ga-gal"><ellipse cx="32" cy="32" rx="22" ry="8" transform="rotate(-28 32 32)" opacity=".35"/><ellipse cx="32" cy="32" rx="14" ry="5" transform="rotate(-28 32 32)" opacity=".6"/><circle cx="32" cy="32" r="3.5"/></g><path class="ga-shutter" d="M4 4h10M4 4v10M60 4H50M60 4v10M4 60h10M4 60V50M60 60H50M60 60V50" fill="none" stroke="currentColor" stroke-width="2"/>' },
  { id: "hline", t: "Listen to the hydrogen line", s: "Radio telescopes and radio projects, 20 MHz to 1420 MHz",
    art: '<path class="ga-wave" d="M2 40 Q 8 40 11 36 T 20 40 T 29 38 Q 32 14 35 38 T 44 40 T 53 38 T 62 40" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M32 52v8M26 60h12" stroke="currentColor" stroke-width="2"/>' },
  { id: "live", t: "Watch a live event", s: "Live observatory cameras, launches, the Sun right now",
    art: '<rect x="6" y="14" width="40" height="32" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M46 24l12-7v26l-12-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle class="ga-rec" cx="16" cy="23" r="3.5"/>' },
  { id: "explore", t: "Explore the sky in my browser", s: "Planetariums and multi-wavelength atlases, nothing to install",
    art: '<circle cx="32" cy="32" r="24" fill="none" stroke="currentColor" stroke-width="2"/><g class="ga-spin"><path d="M8 32h48M32 8c-9 8-9 40 0 48M32 8c9 8 9 40 0 48" fill="none" stroke="currentColor" stroke-width="1.3" opacity=".6"/></g><circle cx="42" cy="22" r="2.5"/>' },
  { id: "research", t: "Help real research", s: "Citizen science and open archives that feed papers",
    art: '<path d="M10 50l12-16 10 8 18-24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" class="ga-line"/><circle cx="50" cy="18" r="4"/><path d="M6 58h52" stroke="currentColor" stroke-width="1.5" opacity=".5"/>' },
  { id: "mission", t: "Simulate a mission", s: "Spacecraft apps and flight simulators, free and paid",
    art: '<ellipse cx="32" cy="34" rx="26" ry="10" fill="none" stroke="currentColor" stroke-width="1.6" opacity=".5" transform="rotate(-15 32 34)"/><circle cx="32" cy="34" r="7"/><g class="ga-orbit"><path d="M53 24l4-6 2 7z"/></g>' }
];

/* ------------------------------------------------------------------ state */
const state = { q: "", type: new Set(), cost: new Set(), aud: new Set(), goal: "", site: "", dark: false, tOff: 0, all: false };
const PAGE = 12;
let DATA, ENTRIES = [], CLUSTERS = [], byId = {};
let now = () => new Date(Date.now() + state.tOff * 3600e3);

init();

async function init() {
  hero();
  try {
    const res = await fetch("data/telescopes.json");
    if (!res.ok) throw new Error(res.status);
    DATA = await res.json();
  } catch (e) {
    $("#grid").innerHTML = '<div class="card"><h3>Directory data did not load</h3><p>Serve the site over HTTP (for example <code>python3 -m http.server --directory site</code>) so the page can read <code>data/telescopes.json</code>.</p></div>';
    return;
  }
  ENTRIES = DATA.entries.map((e, i) => ({ ...e, i, hay: [e.name, e.operator, e.country, DATA.types[e.type], e.do, e.first, e.price, AUDS[e.aud], (e.sites || []).map((s) => s.n).join(" ")].join(" ").toLowerCase() }));
  byId = Object.fromEntries(ENTRIES.map((e) => [e.id, e]));
  $("#countTotal").textContent = ENTRIES.length;
  $("#checked").textContent = new Date(DATA.updated + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  readURL();
  buildGoals();
  buildChips();
  buildCards();
  bindFilters();
  map.init();
  tick();
  render(false, true);
  guides();
  allocation();
  setInterval(tick, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
}

/* recompute darkness for every site, refresh badges, stats and map */
function tick() {
  const sun = sunPos(now());
  CLUSTERS.forEach((c) => { c.alt = sunAlt(c.lat, c.lon, sun); c.dark = c.alt < DARK; });
  ENTRIES.forEach((e) => {
    e.darkSites = (e.sites || []).filter((s) => sunAlt(s.lat, s.lon, sun) < DARK).length;
    e.canNow = !!(e.sites && e.sites.length) && (e.type === "radio" || e.darkSites > 0);
  });
  $$(".t-card").forEach((el) => {
    const e = byId[el.dataset.id];
    const b = el.querySelector(".b-now");
    if (b) {
      b.hidden = !e.canNow;
      b.textContent = e.type === "radio" ? "OBSERVING DAY & NIGHT" : e.sites.length > 1 ? `DARK AT ${e.darkSites} OF ${e.sites.length} SITES` : "DARK NOW";
    }
  });
  const uniq = new Map();
  ENTRIES.forEach((e) => (e.sites || []).forEach((s) => uniq.set(`${s.lat.toFixed(1)},${s.lon.toFixed(1)}`, s)));
  const darkSites = [...uniq.values()].filter((s) => sunAlt(s.lat, s.lon, sun) < DARK).length;
  setStat("#statAll", ENTRIES.length); setStat("#statFree", ENTRIES.filter((e) => e.cost === "free").length);
  setStat("#statSites", uniq.size); setStat("#statDark", darkSites);
  map.draw(sun);
  if (state.dark) render(false);
}
function setStat(id, n) {
  const el = $(id);
  if (!el || el.textContent === String(n)) return;
  if (el.dataset.done || REDUCED || !gsap) { el.textContent = n; el.dataset.done = 1; return; }
  const o = { v: 0 }; el.dataset.done = 1;
  gsap.to(o, { v: n, duration: 1.4, ease: "power3.out", onUpdate: () => (el.textContent = Math.round(o.v)) });
}

/* ------------------------------------------------------------------ hero observatory */
function hero() {
  const svg = $("#dome");
  if (!svg) return;
  const NS = "http://www.w3.org/2000/svg";
  // stars (seeded so the sky is the same every visit)
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const sg = $("#domeStars");
  for (let i = 0; i < 110; i++) {
    const c = document.createElementNS(NS, "circle");
    const x = rnd() * 560, y = rnd() * 360, r = rnd() < 0.1 ? 1.5 : 0.4 + rnd() * 0.8;
    if (x > 170 && x < 390 && y > 190) continue;
    c.setAttribute("cx", x.toFixed(1)); c.setAttribute("cy", y.toFixed(1)); c.setAttribute("r", r.toFixed(2));
    c.setAttribute("fill", ["#fff", "#cfe6ff", "#ffe9c7", "#bcd4ff"][i % 4]);
    c.setAttribute("class", "tw"); c.style.animationDelay = (rnd() * 5).toFixed(2) + "s"; c.style.animationDuration = (2.5 + rnd() * 4).toFixed(2) + "s";
    sg.appendChild(c);
  }
  // dome ribs (meridians of a hemisphere seen from the front: ellipses rx = R sin az)
  const ribs = $("#ribs");
  [-0.87, -0.64, -0.34, 0.34, 0.64, 0.87].forEach((k) => {
    const p = document.createElementNS(NS, "path"), rx = 100 * k;
    p.setAttribute("d", `M${(280 + rx).toFixed(1)} 300 A${Math.abs(rx).toFixed(1)} 100 0 0 ${rx > 0 ? 0 : 1} 280 200`);
    p.setAttribute("fill", "none"); ribs.appendChild(p);
  });

  const TARGETS = [
    { id: "M31", name: "Andromeda Galaxy", ra: "00h 42m 44s", dec: "+41° 16′", x: 428, y: 96, exp: "60 s", kind: "galaxy" },
    { id: "M42", name: "Orion Nebula", ra: "05h 35m 17s", dec: "−05° 23′", x: 130, y: 112, exp: "30 s", kind: "nebula" },
    { id: "M13", name: "Hercules Globular Cluster", ra: "16h 41m 41s", dec: "+36° 28′", x: 318, y: 64, exp: "20 s", kind: "cluster" }
  ];
  TARGETS.forEach((t) => (t.img = fakeImage(t.kind)));
  const PIV = { x: 280, y: 284 };
  const aim = { a: 0, open: 0 };
  const slit = $("#slitClipRect"), shutter = $("#shutter"), tube = $("#tube"), target = $("#dTarget"), ring = $("#expRing");
  const photons = $("#photons"), result = $("#result"), status = $("#statusTxt"), coord = $("#coordTxt"), dot = $("#statusDot");
  function apply() {
    // the slit and shutter turn with the tube, so the dome always opens toward the target
    const a = aim.a * D2R, rot = `rotate(${aim.a.toFixed(2)} ${PIV.x} ${PIV.y})`;
    slit.setAttribute("transform", rot);
    shutter.setAttribute("transform", rot);
    shutter.setAttribute("y", (186 - aim.open * 120).toFixed(2));
    tube.setAttribute("transform", rot);
    photons.setAttribute("x2", (PIV.x + 92 * Math.sin(a)).toFixed(1)); photons.setAttribute("y2", (PIV.y - 92 * Math.cos(a)).toFixed(1));
  }
  const say = (txt, color) => { status.textContent = txt; if (color) dot.setAttribute("fill", color); };
  const angleTo = (t) => Math.atan2(t.x - PIV.x, PIV.y - t.y) * R2D;

  if (REDUCED || !gsap) {
    const t = TARGETS[0];
    aim.a = angleTo(t); aim.open = 1; apply();
    target.setAttribute("transform", `translate(${t.x} ${t.y})`); target.setAttribute("opacity", 1);
    ring.setAttribute("stroke-dashoffset", 0);
    showResult(t); result.setAttribute("opacity", 1);
    say("IMAGE DELIVERED", "#4ef0b8"); coord.textContent = `${t.id} · RA ${t.ra} · Dec ${t.dec}`;
    return;
  }
  function showResult(t) {
    $("#resultImg").setAttribute("href", t.img);
    $("#resultTxt").textContent = `${t.id} · ${t.exp} · FITS`;
    $("#resultPos").setAttribute("transform", `translate(${t.x > 280 ? 24 : 386} 112)`);
  }
  apply();
  const tl = gsap.timeline({ repeat: -1, delay: 0.6 });
  tl.call(() => say("OPENING DOME", "#ffc24b"))
    .to(aim, { open: 1, duration: 1.6, ease: "power2.inOut", onUpdate: apply });
  TARGETS.forEach((t) => {
    tl.call(() => { say(`SLEWING TO ${t.id}`, "#7cc8ff"); coord.textContent = `${t.name} · RA ${t.ra} · Dec ${t.dec}`; target.setAttribute("transform", `translate(${t.x} ${t.y})`); photons.setAttribute("x1", t.x); photons.setAttribute("y1", t.y); showResult(t); })
      .to(aim, { a: angleTo(t), duration: 2.2, ease: "power2.inOut", onUpdate: apply })
      .fromTo(target, { opacity: 0 }, { opacity: 1, duration: 0.4 }, "<1.4")
      .fromTo("#reticle", { scale: 1.8, transformOrigin: "0 0" }, { scale: 1, duration: 0.7, ease: "back.out(2)" }, "<")
      .call(() => say(`EXPOSING ${t.exp}`, "#4ef0b8"))
      .to(photons, { opacity: 0.9, duration: 0.3 })
      .fromTo(photons, { attr: { "stroke-dashoffset": 0 } }, { attr: { "stroke-dashoffset": -96 }, duration: 2, ease: "none" }, "<")
      .fromTo(ring, { attr: { "stroke-dashoffset": 144.5 } }, { attr: { "stroke-dashoffset": 0 }, duration: 2, ease: "none" }, "<")
      .to(photons, { opacity: 0, duration: 0.3 })
      .call(() => say("IMAGE DELIVERED", "#b18cff"))
      .fromTo(result, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.6, ease: "back.out(1.7)" })
      .to({}, { duration: 2.4 })
      .to([result, target], { opacity: 0, duration: 0.5 });
  });
  tl.call(() => say("CLOSING DOME", "#ffc24b"))
    .to(aim, { a: 0, duration: 1.4, ease: "power2.inOut", onUpdate: apply })
    .to(aim, { open: 0, duration: 1.2, ease: "power2.inOut", onUpdate: apply })
    .call(() => say("STANDBY", "#8f98bd"))
    .to({}, { duration: 1 });
  document.addEventListener("visibilitychange", () => (document.hidden ? tl.pause() : tl.resume()));
}

/* small procedural stand-ins for the delivered image (illustrations, not data) */
function fakeImage(kind) {
  const c = document.createElement("canvas"); c.width = c.height = 200;
  const x = c.getContext("2d");
  let seed = kind.length * 97 + 11; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const gauss = () => (r() + r() + r() + r() - 2) / 2;
  x.fillStyle = "#03040a"; x.fillRect(0, 0, 200, 200);
  for (let i = 0; i < 160; i++) { x.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.6})`; x.fillRect(r() * 200, r() * 200, 1, 1); }
  x.globalCompositeOperation = "lighter";
  if (kind === "galaxy") {
    x.translate(100, 100); x.rotate(-0.6); x.scale(1, 0.38);
    for (let i = 0; i < 2600; i++) {
      const arm = i % 2, t = r() * 4.2, rad = 6 + t * 20, th = t * 1.35 + arm * Math.PI + gauss() * 0.35;
      x.fillStyle = `rgba(${200 + r() * 55},${205 + r() * 40},255,${0.05 + r() * 0.12})`;
      x.beginPath(); x.arc(Math.cos(th) * rad, Math.sin(th) * rad, 1 + r() * 2.2, 0, 7); x.fill();
    }
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 38); g.addColorStop(0, "rgba(255,240,210,.95)"); g.addColorStop(1, "rgba(255,220,180,0)");
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, 38, 0, 7); x.fill();
  } else if (kind === "nebula") {
    const cols = ["255,90,140", "120,170,255", "255,160,90", "200,120,255"];
    for (let i = 0; i < 380; i++) {
      const px = 100 + gauss() * 55, py = 100 + gauss() * 45, rr = 6 + r() * 22;
      const g = x.createRadialGradient(px, py, 0, px, py, rr); g.addColorStop(0, `rgba(${cols[i % 4]},.07)`); g.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = g; x.beginPath(); x.arc(px, py, rr, 0, 7); x.fill();
    }
    [[98, 96], [104, 99], [100, 104], [95, 101]].forEach(([a, b]) => { x.fillStyle = "#fff"; x.beginPath(); x.arc(a, b, 1.8, 0, 7); x.fill(); });
  } else {
    for (let i = 0; i < 1400; i++) {
      const rad = Math.abs(gauss()) * 48 * (r() < 0.8 ? 0.6 : 1.4), th = r() * 7;
      x.fillStyle = `rgba(255,${225 + r() * 30},${190 + r() * 60},${0.25 + r() * 0.6})`;
      x.beginPath(); x.arc(100 + Math.cos(th) * rad, 100 + Math.sin(th) * rad, 0.5 + r() * 1.1, 0, 7); x.fill();
    }
  }
  return c.toDataURL("image/png");
}

/* ------------------------------------------------------------------ chooser */
function buildGoals() {
  $("#goals").innerHTML = GOALS.map((g, k) => {
    const n = ENTRIES.filter((e) => e.goals.includes(g.id)).length;
    return `<button type="button" class="goal card spot reveal" data-goal="${g.id}" data-delay="${k * 70}" aria-pressed="false">
      <svg class="g-art" viewBox="0 0 64 64" fill="currentColor" aria-hidden="true">${g.art}</svg>
      <span class="g-t">${esc(g.t)}</span><span class="g-s">${esc(g.s)}</span><span class="g-n">${n} options →</span></button>`;
  }).join("");
  observeReveal($$("#goals .reveal"));
  $("#goals").addEventListener("click", (ev) => {
    const b = ev.target.closest(".goal"); if (!b) return;
    state.goal = state.goal === b.dataset.goal ? "" : b.dataset.goal;
    state.site = "";
    render(true);
    if (state.goal) {
      const top = $("#directory").getBoundingClientRect().top + scrollY - 70;
      scrollTo({ top, behavior: REDUCED ? "auto" : "smooth" });
    }
  });
}

/* ------------------------------------------------------------------ filters */
function buildChips() {
  const mk = (group, val, label, tone) =>
    `<button type="button" class="fchip" data-group="${group}" data-val="${esc(val)}" style="--c:var(--tone-${tone})" aria-pressed="false"><span class="dot"></span>${esc(label)} <span class="n"></span></button>`;
  $("#fType").innerHTML = Object.keys(DATA.types).map((t) => mk("type", t, DATA.types[t], TYPE_TONE[t])).join("");
  $("#fCost").innerHTML = Object.keys(COSTS).map((c) => mk("cost", c, COSTS[c], c === "free" ? "aurora" : c === "students" ? "ice" : "flame")).join("");
  $("#fAud").innerHTML = Object.keys(AUDS).map((a) => mk("aud", a, AUDS[a], a === "anyone" ? "aurora" : a === "educators" ? "ice" : "sol")).join("");
}

function bindFilters() {
  $("#filters").addEventListener("click", (ev) => {
    const b = ev.target.closest(".fchip[data-group]");
    if (b && !b.disabled) {
      const set = state[b.dataset.group];
      set.has(b.dataset.val) ? set.delete(b.dataset.val) : set.add(b.dataset.val);
      render(true); return;
    }
    const x = ev.target.closest("[data-clear]");
    if (x) { state[x.dataset.clear] = ""; render(true); }
  });
  let t = 0;
  $("#q").addEventListener("input", (ev) => { clearTimeout(t); t = setTimeout(() => { state.q = ev.target.value.trim(); render(true); }, 110); });
  $("#darkOnly").addEventListener("change", (ev) => { state.dark = ev.target.checked; render(true); });
  const reset = () => {
    state.q = ""; $("#q").value = ""; state.type.clear(); state.cost.clear(); state.aud.clear();
    state.goal = ""; state.site = ""; state.dark = false; $("#darkOnly").checked = false; render(true);
  };
  $("#reset").addEventListener("click", reset); $("#reset2").addEventListener("click", reset);
  $("#more").addEventListener("click", () => { state.all = true; render(false, false, true); });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "/" && !/input|textarea|select/i.test(document.activeElement.tagName)) {
      ev.preventDefault(); $("#q").focus({ preventScroll: true });
      const top = $("#directory").getBoundingClientRect().top + scrollY - 70;
      if (Math.abs(scrollY - top) > 400) scrollTo({ top, behavior: "smooth" });
    }
  });
}

function matches(e, skip) {
  if (state.q) {
    const words = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.every((w) => e.hay.includes(w))) return false;
  }
  if (state.goal && !e.goals.includes(state.goal)) return false;
  if (state.site) { const c = CLUSTERS.find((c) => c.key === state.site); if (c && !c.ids.has(e.id)) return false; }
  if (state.dark && !e.canNow) return false;
  if (skip !== "type" && state.type.size && !state.type.has(e.type)) return false;
  if (skip !== "cost" && state.cost.size && !state.cost.has(e.cost)) return false;
  if (skip !== "aud" && state.aud.size && !state.aud.has(e.aud)) return false;
  return true;
}

/* ------------------------------------------------------------------ cards */
function badges(e) {
  const b = [];
  if (e.cost === "free") b.push('<span class="bdg free">FREE</span>');
  if (e.cost === "students") b.push('<span class="bdg stud">STUDENTS</span>');
  if (e.cost === "paid") b.push('<span class="bdg paid">PAID</span>');
  if (e.live) b.push('<span class="bdg live"><i></i>LIVE</span>');
  if (e.sites && e.sites.length) b.push('<span class="bdg now b-now" hidden>DARK NOW</span>');
  return b.join("");
}
const isExt = (u) => /^https?:/.test(u);
const lnk = (u, label, cls) => `<a class="${cls}" href="${esc(u)}"${isExt(u) ? ' target="_blank" rel="noopener noreferrer"' : ""}>${label}</a>`;
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return "this site"; } };
const GUIDE_OF = { microobservatory: "mo", pictor: "pictor", "stellarium-web": "stellarium" };

function cardHTML(e) {
  const tone = TYPE_TONE[e.type];
  const extra = (e.links || []).map((l) => lnk(l.url, esc(l.label) + (isExt(l.url) ? " ↗" : " →"), "x-link")).join("");
  const guide = GUIDE_OF[e.id] ? `<a class="x-link guide-link" href="#guides" data-guide="${GUIDE_OF[e.id]}">Step-by-step guide ↓</a>` : "";
  const where = e.sites && e.sites.length ? `<span class="where" title="${esc(e.sites.map((s) => s.n).join(", "))}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 15s5-5 5-9A5 5 0 0 0 3 6c0 4 5 9 5 9z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="6" r="1.7" fill="currentColor"/></svg>${e.sites.length > 1 ? e.sites.length + " sites" : "on map"}</span>` : "";
  return `<article class="card spot t-card" data-id="${e.id}" style="--c:var(--tone-${tone})">
    <div class="tc-top"><span class="tc-type">${ico(e.type)}<span>${esc(DATA.types[e.type])}</span></span><span class="tc-badges">${badges(e)}</span></div>
    <h3>${esc(e.name)}</h3>
    <div class="tc-op">${esc(e.operator)} · ${esc(e.country)} ${where}</div>
    <p class="tc-do">${esc(e.do)}</p>
    <dl class="tc-meta">
      ${e.price !== "Free" ? `<div><dt>Cost</dt><dd>${esc(e.price)}</dd></div>` : ""}
      <div><dt>Who</dt><dd>${esc(AUDS[e.aud])}</dd></div>
      <div><dt>Results</dt><dd>${esc(e.wait)}</dd></div>
    </dl>
    <div class="tc-first"><span class="tf-k">First project</span>${esc(e.first)}</div>
    ${e.note ? `<p class="tc-note">${esc(e.note)}</p>` : ""}
    <div class="tc-foot">${lnk(e.url, (e.internal ? "Open page →" : `Open ${esc(hostOf(e.url))} ↗`), "btn small primary go-btn")}${guide}${extra}
      <span class="tc-ver" title="Checked against the official site">✓ ${esc(fmtDate(e.verified_on))}</span></div>
  </article>`;
}
const fmtDate = (s) => new Date(s + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function buildCards() {
  const grid = $("#grid");
  grid.innerHTML = ENTRIES.map(cardHTML).join("");
  grid.addEventListener("pointerover", (ev) => { const c = ev.target.closest(".t-card"); if (c) map.pulse(c.dataset.id); });
  grid.addEventListener("pointerleave", () => map.pulse(null));
  grid.addEventListener("focusin", (ev) => { const c = ev.target.closest(".t-card"); if (c) map.pulse(c.dataset.id); });
  grid.addEventListener("click", (ev) => {
    const g = ev.target.closest("[data-guide]");
    if (g) { ev.preventDefault(); openGuide(g.dataset.guide, true); }
  });
}

function sortedList() {
  const L = ENTRIES.filter((e) => matches(e));
  if (state.goal || state.site || state.dark) L.sort((a, b) => COST_RANK[a.cost] - COST_RANK[b.cost] || AUD_RANK[a.aud] - AUD_RANK[b.aud] || a.i - b.i);
  return L;
}

let lastSig = "", flipTween = null;
function render(fromUser, first, anim = fromUser) {
  const full = sortedList();
  const filtered = state.q || state.goal || state.site || state.dark || state.type.size || state.cost.size || state.aud.size;
  const list = state.all || filtered ? full : full.slice(0, PAGE);
  const more = $("#more");
  more.hidden = list.length >= full.length;
  more.textContent = `Show all ${full.length}`;
  const grid = $("#grid");
  const cards = $$(".t-card", grid);
  const sig = list.map((e) => e.id).join(",");
  if (sig !== lastSig) {
    lastSig = sig;
    const visBefore = cards.filter((c) => c.style.display !== "none").length;
    // Flip is lovely for a dozen cards; for "show all 56" a light fade keeps phones smooth
    const animate = anim && !first && !REDUCED && gsap && Flip && visBefore + list.length <= 36;
    if (flipTween) { flipTween.progress(1).kill(); flipTween = null; }
    const stateF = animate ? Flip.getState(cards, { props: "opacity" }) : null;
    const h0 = grid.offsetHeight;
    const show = new Set(list.map((e) => e.id));
    const byCard = Object.fromEntries(cards.map((c) => [c.dataset.id, c]));
    list.forEach((e) => grid.appendChild(byCard[e.id]));
    cards.forEach((c) => { const on = show.has(c.dataset.id); c.style.display = on ? "" : "none"; if (!on) grid.appendChild(c); });
    if (animate) {
      // keep the section from collapsing while cards are absolutely positioned mid-flight
      grid.style.minHeight = Math.max(h0, grid.offsetHeight) + "px";
      flipTween = Flip.from(stateF, {
        duration: 0.6, ease: "power3.inOut", absolute: true, prune: true,
        onEnter: (els) => gsap.fromTo(els, { opacity: 0, scale: 0.92, y: 16 }, { opacity: 1, scale: 1, y: 0, duration: 0.45, stagger: 0.02, ease: "power2.out", clearProps: "transform,opacity" }),
        onLeave: (els) => gsap.to(els, { opacity: 0, scale: 0.9, duration: 0.25, ease: "power1.in" }),
        onComplete: () => { grid.style.minHeight = ""; flipTween = null; }
      });
    }
    if (!animate && anim && !first && !REDUCED && gsap) {
      const fresh = list.slice(0, 40).map((e) => byCard[e.id]);
      gsap.fromTo(fresh.slice(visBefore), { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.03, ease: "power2.out", clearProps: "transform,opacity" });
    }
  }
  $("#empty").hidden = full.length > 0;
  const cs = $("#countShown");
  if (cs.textContent !== String(full.length)) {
    cs.textContent = full.length;
    const b = cs.parentElement; b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump");
  }
  $$(".fchip[data-group]").forEach((b) => {
    const g = b.dataset.group, v = b.dataset.val, pressed = state[g].has(v);
    const n = ENTRIES.filter((e) => matches(e, g) && e[g] === v).length;
    b.querySelector(".n").textContent = n;
    b.setAttribute("aria-pressed", pressed ? "true" : "false");
    b.disabled = !pressed && n === 0;
  });
  $$(".goal").forEach((b) => b.setAttribute("aria-pressed", b.dataset.goal === state.goal ? "true" : "false"));
  $("#goals").classList.toggle("has-pick", !!state.goal);
  // active goal / site chips
  const act = [];
  if (state.goal) act.push(`<button type="button" class="act-chip" data-clear="goal">Goal: ${esc(GOALS.find((g) => g.id === state.goal).t)} <b aria-hidden="true">×</b><span class="sr-only">(remove)</span></button>`);
  if (state.site) { const c = CLUSTERS.find((c) => c.key === state.site); if (c) act.push(`<button type="button" class="act-chip site" data-clear="site">Near ${esc(c.label)} <b aria-hidden="true">×</b><span class="sr-only">(remove)</span></button>`); }
  $("#activeRow").innerHTML = act.join("");
  $("#activeRow").hidden = !act.length;
  map.mark();
  if (fromUser) writeURL();
}

function readURL() {
  const p = new URLSearchParams(location.search);
  state.q = p.get("q") || ""; $("#q").value = state.q;
  ["type", "cost", "aud"].forEach((g) => (p.get(g) || "").split(",").filter(Boolean).forEach((v) => state[g].add(v)));
  const g = p.get("goal"); if (g && GOALS.some((x) => x.id === g)) state.goal = g;
  if (p.get("dark") === "1") { state.dark = true; $("#darkOnly").checked = true; }
}
function writeURL() {
  const p = new URLSearchParams();
  if (state.q) p.set("q", state.q);
  ["type", "cost", "aud"].forEach((g) => state[g].size && p.set(g, [...state[g]].join(",")));
  if (state.goal) p.set("goal", state.goal);
  if (state.dark) p.set("dark", "1");
  const s = p.toString();
  history.replaceState(null, "", location.pathname + (s ? "?" + s : "") + location.hash);
}

/* ------------------------------------------------------------------ map */
function buildClusters(mergeDeg) {
  // 1) group sites closer than ~3 degrees (Chile's observatories, Siding Spring ...)
  const base = [];
  ENTRIES.forEach((e) => (e.sites || []).forEach((s) => {
    let c = base.find((c) => Math.abs(c.lat - s.lat) < 3 && Math.abs(c.lon - s.lon) < 3.5);
    if (!c) { c = { lat: s.lat, lon: s.lon, ids: new Set(), names: new Set() }; base.push(c); }
    c.ids.add(e.id); c.names.add(s.n);
  }));
  const LABELS = [[-24, -69.5, "Atacama, Chile"], [-30, -70.7, "Coquimbo, Chile"], [20.3, -156, "Hawaiʻi"], [-31.3, 149.1, "Siding Spring, Australia"], [-35.4, 149, "Canberra, Australia"],
    [28.3, -16.5, "Tenerife"], [38, 23.7, "Athens"], [35.4, -116.9, "Goldstone, California"], [37.7, -113.7, "Utah"], [37.8, -2.3, "southern Spain"], [31.7, -110.9, "Arizona"], [30.7, -104, "Texas"],
    [42.6, -88.6, "Wisconsin"], [38.4, -79.8, "West Virginia"], [-32.4, 20.8, "South Africa"], [42.6, 11.5, "Italy"]];
  base.forEach((c) => { const L = LABELS.find(([la, lo]) => Math.abs(la - c.lat) < 2.6 && Math.abs(lo - c.lon) < 2.6); c.label = L ? L[2] : [...c.names][0]; });
  // 2) merge groups whose pins would overlap on the map at its current size
  const out = [];
  base.forEach((b) => {
    const c = out.find((c) => Math.hypot(c.lat - b.lat, c.lon - b.lon) < mergeDeg);
    if (!c) { out.push({ lat: b.lat, lon: b.lon, n: 1, ids: new Set(b.ids), names: new Set(b.names), labels: [b.label] }); return; }
    c.lat = (c.lat * c.n + b.lat) / (c.n + 1); c.lon = (c.lon * c.n + b.lon) / (c.n + 1); c.n++;
    b.ids.forEach((i) => c.ids.add(i)); b.names.forEach((n) => c.names.add(n)); if (!c.labels.includes(b.label)) c.labels.push(b.label);
  });
  out.forEach((c, k) => {
    c.key = "c" + k;
    const cc = c.labels.map((l) => l.split(", ")[1] || "");
    c.label = c.labels.length === 1 ? c.labels[0] : cc.every((x) => x && x === cc[0]) ? cc[0] : c.labels.slice(0, 2).join(" · ") + (c.labels.length > 2 ? ` +${c.labels.length - 2}` : "");
  });
  CLUSTERS = out;
}

const map = (() => {
  const LAT_TOP = 80, LAT_BOT = -62;
  let cv, ctx, W = 0, H = 0, dpr = 1, dots = [], shade, sctx, lastSun = null, reveal = 0, pinsBuilt = false;
  const X = (lon) => ((lon + 180) / 360) * W;
  const Y = (lat) => ((LAT_TOP - lat) / (LAT_TOP - LAT_BOT)) * H;

  function init() {
    cv = $("#map"); ctx = cv.getContext("2d");
    const L = DATA.land; const res = L.res;
    L.rows.forEach((hex, r) => {
      const lat = 90 - (r + 0.5) * res;
      if (lat > LAT_TOP || lat < LAT_BOT) return;
      for (let i = 0; i < hex.length; i++) {
        const v = parseInt(hex[i], 16);
        for (let b = 0; b < 4; b++) if (v & (8 >> b)) dots.push({ lat, lon: -180 + ((i * 4 + b) + 0.5) * res });
      }
    });
    shade = document.createElement("canvas"); shade.width = 360; shade.height = LAT_TOP - LAT_BOT; sctx = shade.getContext("2d");
    size();
    // pins closer than about 16 px on screen share one marker
    buildClusters(Math.max(3, 16 / (W / 360)));
    addEventListener("resize", () => { size(); draw(lastSun); placePins(); });
    buildPins();
    // sweep the dots in when the map scrolls into view
    const io = new IntersectionObserver((en) => {
      if (!en[0].isIntersecting) return; io.disconnect();
      if (REDUCED || !gsap) { reveal = 1; draw(lastSun); dropPins(); return; }
      const o = { v: 0 };
      gsap.to(o, { v: 1, duration: 1.6, ease: "power2.out", onUpdate: () => { reveal = o.v; draw(lastSun); } });
      dropPins();
    }, { rootMargin: "0px 0px -10% 0px" });
    io.observe(cv);
    const tOff = $("#tOff");
    tOff.addEventListener("input", () => { state.tOff = +tOff.value; label(); tick(); });
    $("#tNow").addEventListener("click", () => { tOff.value = 0; tOff.dispatchEvent(new Event("input")); });
    label();
  }
  function label() {
    const d = now(), off = state.tOff;
    const utc = d.toISOString().slice(11, 16) + " UTC";
    $("#tOffOut").textContent = off === 0 ? "now" : `${off > 0 ? "+" : "−"}${Math.abs(off)} h · ${utc}`;
    $("#mpClock").textContent = `${d.toUTCString().slice(0, 11)} · ${utc}${off ? " (scrubbed)" : ""}`;
  }
  function size() {
    const r = cv.parentElement.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = r.width; H = r.width * (LAT_TOP - LAT_BOT) / 360;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + "px"; cv.style.height = H + "px";
    cv.parentElement.style.height = H + "px";
  }
  function draw(sun) {
    sun = sun || lastSun;
    if (!ctx || !sun) return;
    lastSun = sun; label();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // ocean
    const og = ctx.createLinearGradient(0, 0, 0, H); og.addColorStop(0, "#0a1024"); og.addColorStop(1, "#070b18");
    ctx.fillStyle = og; ctx.fillRect(0, 0, W, H);
    // graticule
    ctx.strokeStyle = "rgba(150,170,255,.07)"; ctx.lineWidth = 1;
    for (let lo = -150; lo <= 150; lo += 30) { ctx.beginPath(); ctx.moveTo(X(lo), 0); ctx.lineTo(X(lo), H); ctx.stroke(); }
    for (let la = -60; la <= 60; la += 30) { ctx.beginPath(); ctx.moveTo(0, Y(la)); ctx.lineTo(W, Y(la)); ctx.stroke(); }
    // land dots, coloured by the Sun's altitude there
    const step = W / 240, r = Math.max(0.7, step * 0.34);
    const sd = Math.sin(sun.dec * D2R), cd = Math.cos(sun.dec * D2R);
    for (const d of dots) {
      const x = X(d.lon);
      if (x / W > reveal * 1.05) continue;
      const alt = Math.asin(Math.sin(d.lat * D2R) * sd + Math.cos(d.lat * D2R) * cd * Math.cos((d.lon - sun.subLon) * D2R)) * R2D;
      const k = Math.max(0, Math.min(1, (alt + 12) / 12)); // 0 = night, 1 = day
      ctx.fillStyle = `rgba(${Math.round(70 + 54 * k)},${Math.round(84 + 116 * k)},${Math.round(150 + 105 * k)},${(0.34 + 0.5 * k).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(x, Y(d.lat), r, 0, 6.2832); ctx.fill();
    }
    // night shading: one pixel per degree, smoothed when scaled up
    const img = sctx.createImageData(shade.width, shade.height);
    for (let j = 0; j < shade.height; j++) {
      const lat = LAT_TOP - j - 0.5, sl = Math.sin(lat * D2R), cl = Math.cos(lat * D2R);
      for (let i = 0; i < 360; i++) {
        const alt = Math.asin(sl * sd + cl * cd * Math.cos((i - 180 + 0.5 - sun.subLon) * D2R)) * R2D;
        const a = alt > 0 ? 0 : alt < -18 ? 150 : (-alt / 18) * 150;
        const o = (j * 360 + i) * 4; img.data[o] = 2; img.data[o + 1] = 4; img.data[o + 2] = 16; img.data[o + 3] = a;
      }
    }
    sctx.putImageData(img, 0, 0);
    ctx.globalAlpha = reveal; ctx.imageSmoothingEnabled = true;
    ctx.drawImage(shade, 0, 0, W, H);
    // terminator (Sun altitude 0): tan(lat) = -cos(H) / tan(dec)
    const td = Math.tan((Math.abs(sun.dec) < 0.01 ? 0.01 : sun.dec) * D2R);
    ctx.beginPath();
    for (let lo = -180; lo <= 180; lo += 2) {
      const lat = Math.atan(-Math.cos((lo - sun.subLon) * D2R) / td) * R2D;
      lo === -180 ? ctx.moveTo(X(lo), Y(lat)) : ctx.lineTo(X(lo), Y(lat));
    }
    ctx.strokeStyle = "rgba(255,194,75,.55)"; ctx.lineWidth = 1.2; ctx.setLineDash([3, 4]); ctx.stroke(); ctx.setLineDash([]);
    // subsolar point
    if (sun.dec < LAT_TOP && sun.dec > LAT_BOT) {
      const sx = X(sun.subLon), sy = Y(sun.dec);
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 22); g.addColorStop(0, "rgba(255,194,75,.55)"); g.addColorStop(1, "rgba(255,194,75,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, 22, 0, 6.2832); ctx.fill();
      ctx.fillStyle = "#ffc24b"; ctx.beginPath(); ctx.arc(sx, sy, 4, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
    updatePins(sun);
  }

  function buildPins() {
    const host = $("#pins");
    host.innerHTML = CLUSTERS.map((c) => {
      const n = c.ids.size;
      return `<button type="button" class="pin" data-key="${c.key}" aria-label="${esc(c.label)}: ${n} ${n > 1 ? "entries" : "entry"}"><i class="pd"></i>${n > 1 ? `<b>${n}</b>` : ""}</button>`;
    }).join("");
    placePins(); pinsBuilt = true;
    const tip = $("#pinTip");
    const show = (b) => {
      const c = CLUSTERS.find((c) => c.key === b.dataset.key);
      const alt = c.alt == null ? 0 : c.alt;
      const st = alt < DARK ? `<span class="st dark">Dark · Sun ${Math.round(alt)}°</span>` : alt < 0 ? `<span class="st twi">Twilight · Sun ${Math.round(alt)}°</span>` : `<span class="st day">Daylight · Sun +${Math.round(alt)}°</span>`;
      tip.innerHTML = `<strong>${esc(c.label)}</strong><small>${esc([...c.names].slice(0, 3).join(" · "))}${c.names.size > 3 ? " …" : ""}</small>${st}<ul>${[...c.ids].map((id) => `<li>${ico(byId[id].type)}${esc(byId[id].name)}</li>`).join("")}</ul><em>Click to show only these</em>`;
      tip.hidden = false;
      const wrap = $("#mapWrap").getBoundingClientRect(), br = b.getBoundingClientRect();
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      let left = br.left - wrap.left + br.width / 2 - tw / 2; left = Math.max(4, Math.min(wrap.width - tw - 4, left));
      let top = br.top - wrap.top - th - 10; if (top < 4) top = br.bottom - wrap.top + 10;
      tip.style.left = left + "px"; tip.style.top = top + "px";
      $("#grid").classList.add("dim");
      $$(".t-card").forEach((el) => el.classList.toggle("hl", c.ids.has(el.dataset.id)));
    };
    const hide = () => { tip.hidden = true; $("#grid").classList.remove("dim"); $$(".t-card.hl").forEach((el) => el.classList.remove("hl")); };
    host.addEventListener("pointerover", (ev) => { const b = ev.target.closest(".pin"); if (b) show(b); });
    host.addEventListener("pointerout", (ev) => { if (ev.target.closest(".pin") && !ev.relatedTarget?.closest?.(".pin")) hide(); });
    host.addEventListener("focusin", (ev) => { const b = ev.target.closest(".pin"); if (b) show(b); });
    host.addEventListener("focusout", hide);
    host.addEventListener("click", (ev) => {
      const b = ev.target.closest(".pin"); if (!b) return;
      hide();
      state.site = state.site === b.dataset.key ? "" : b.dataset.key; state.goal = "";
      render(true);
    });
    $("#mpNow").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-key]"); if (!b) return;
      state.site = b.dataset.key; state.goal = ""; render(true);
    });
  }
  function placePins() {
    $$(".pin").forEach((b) => {
      const c = CLUSTERS.find((c) => c.key === b.dataset.key);
      b.style.left = X(c.lon) + "px"; b.style.top = Y(c.lat) + "px";
    });
  }
  function dropPins() {
    const pins = $$(".pin");
    if (REDUCED || !gsap) { pins.forEach((p) => (p.style.opacity = 1)); return; }
    gsap.fromTo(pins, { opacity: 0, y: -26 }, { opacity: 1, y: 0, duration: 0.7, ease: "bounce.out", stagger: 0.07, delay: 0.5, clearProps: "transform" });
  }
  function updatePins(sun) {
    if (!pinsBuilt) return;
    $$(".pin").forEach((b) => {
      const c = CLUSTERS.find((c) => c.key === b.dataset.key);
      const alt = sunAlt(c.lat, c.lon, sun);
      b.classList.toggle("dark", alt < DARK); b.classList.toggle("twi", alt >= DARK && alt < 0);
    });
    const dark = CLUSTERS.filter((c) => c.alt < DARK), day = CLUSTERS.filter((c) => c.alt >= DARK);
    const chip = (c, cls) => `<button type="button" class="nchip ${cls}" data-key="${c.key}">${esc(c.label)}<span>${Math.round(c.alt)}°</span></button>`;
    $("#mpNow").innerHTML =
      `<div class="mn-row"><span class="mn-k dark">Dark now</span>${dark.length ? dark.map((c) => chip(c, "dark")).join("") : '<span class="muted">none of the sites</span>'}</div>` +
      `<div class="mn-row"><span class="mn-k">Sun up or twilight</span>${day.map((c) => chip(c, c.alt < 0 ? "twi" : "day")).join("")}</div>`;
  }
  function pulse(id) { $$(".pin").forEach((b) => b.classList.toggle("pulse", !!id && CLUSTERS.find((c) => c.key === b.dataset.key).ids.has(id))); }
  function mark() { $$(".pin").forEach((b) => b.classList.toggle("sel", b.dataset.key === state.site)); }
  return { init, draw, pulse, mark };
})();

/* ------------------------------------------------------------------ guides */
const ART = {
  portal: '<rect x="14" y="14" width="172" height="92" rx="8" class="a-frame"/><path d="M14 30h172" class="a-line"/><circle cx="24" cy="22" r="2.4" class="a-dot"/><circle cx="32" cy="22" r="2.4" class="a-dot"/><rect x="28" y="44" width="64" height="48" rx="6" class="a-fill"/><path d="M40 80l12-16 10 10 8-8 14 14" class="a-acc"/><rect x="104" y="46" width="68" height="10" rx="5" class="a-fill"/><rect x="104" y="64" width="54" height="8" rx="4" class="a-fill2"/><rect x="104" y="80" width="46" height="14" rx="7" class="a-btn"/>',
  target: '<rect x="30" y="14" width="140" height="92" rx="8" class="a-frame"/><g class="a-rows"><rect x="42" y="26" width="116" height="14" rx="4" class="a-fill2"/><rect x="42" y="46" width="116" height="14" rx="4" class="a-sel"/><rect x="42" y="66" width="116" height="14" rx="4" class="a-fill2"/><rect x="42" y="86" width="116" height="10" rx="4" class="a-fill2"/></g><text x="50" y="57" class="a-txt">M31  Andromeda</text><ellipse cx="146" cy="53" rx="8" ry="3" class="a-acc" transform="rotate(-25 146 53)"/>',
  exposure: '<rect x="20" y="20" width="160" height="80" rx="8" class="a-frame"/><g><circle cx="46" cy="44" r="9" fill="#ff5a6a" opacity=".85"/><circle cx="70" cy="44" r="9" fill="#4ef0b8" opacity=".85"/><circle cx="94" cy="44" r="9" fill="#7cc8ff" opacity=".85"/><circle cx="118" cy="44" r="9" class="a-fill"/></g><path d="M36 78h128" class="a-line"/><path d="M36 78h86" class="a-acc a-grow"/><circle cx="122" cy="78" r="6" class="a-knob"/><text x="136" y="70" class="a-txt">60 s</text>',
  mail: '<rect x="40" y="26" width="120" height="72" rx="8" class="a-frame"/><path d="M40 32l60 40 60-40" class="a-line"/><g class="a-fly"><rect x="112" y="10" width="44" height="34" rx="4" class="a-fill"/><path d="M118 36l10-12 8 8 5-5 9 9" class="a-acc"/></g>',
  fits: '<rect x="18" y="16" width="84" height="84" rx="6" class="a-frame"/><ellipse cx="60" cy="58" rx="30" ry="11" transform="rotate(-30 60 58)" class="a-glow"/><circle cx="60" cy="58" r="5" fill="#fff"/><path d="M116 96V30M116 96h70" class="a-line"/><path d="M120 94 C 128 30, 134 24, 142 70 S 170 92, 184 94" class="a-acc"/><path d="M126 96V26M170 96V26" class="a-dash"/>',
  color: '<g style="mix-blend-mode:screen"><circle cx="82" cy="52" r="30" fill="#ff4f6a" opacity=".7"/><circle cx="118" cy="52" r="30" fill="#4ef0b8" opacity=".7"/><circle cx="100" cy="80" r="30" fill="#4f8dff" opacity=".7"/></g>',
  pdf: '<path d="M60 12h60l22 22v74H60z" class="a-frame"/><path d="M120 12v22h22" class="a-line"/><rect x="72" y="46" width="58" height="6" rx="3" class="a-fill"/><rect x="72" y="58" width="48" height="6" rx="3" class="a-fill2"/><path d="M74 96 C 88 96, 92 72, 100 72 S 112 96, 128 96" class="a-acc"/>',
  drift: '<path d="M20 100 A 80 80 0 0 1 180 100" class="a-dash"/><g class="a-drift"><circle cx="50" cy="50" r="3" fill="#fff"/><circle cx="70" cy="34" r="2" fill="#fff"/><path d="M30 64 C 70 30, 130 30, 170 64" class="a-mw"/></g><path d="M100 104 l-20 -12 a 23 23 0 0 1 40 0z" class="a-fill"/><path d="M100 92V40" class="a-acc"/><text x="106" y="44" class="a-txt">zenith</text>',
  form: '<rect x="30" y="10" width="140" height="100" rx="8" class="a-frame"/><text x="42" y="30" class="a-txt">Center  1420 MHz</text><text x="42" y="48" class="a-txt">Bandwidth  2.4 MHz</text><text x="42" y="66" class="a-txt">Channels  2048</text><text x="42" y="84" class="a-txt">Duration  600 s</text><rect x="116" y="90" width="44" height="12" rx="6" class="a-btn"/>',
  wait: '<circle cx="100" cy="60" r="40" class="a-frame"/><path d="M100 60V32" class="a-acc a-hand"/><path d="M100 60l18 10" class="a-line"/><circle cx="100" cy="60" r="3.5" fill="#fff"/>',
  spectrum: '<path d="M20 96H182M20 96V18" class="a-line"/><path d="M22 84 C 50 82, 70 80, 88 78 C 96 40, 104 40, 112 76 C 130 80, 160 82, 180 84" class="a-acc a-drawn"/><path d="M100 96V24" class="a-dash"/><text x="104" y="30" class="a-txt">1420.4 MHz</text>',
  doppler: '<path d="M20 96H182" class="a-line"/><path d="M100 96V20" class="a-dash"/><path d="M30 90 C 60 90, 70 40, 82 40 S 96 90, 110 90" class="a-red"/><path d="M92 90 C 110 90, 116 52, 126 52 S 140 90, 172 90" class="a-blue"/><text x="40" y="24" class="a-txt">away ←</text><text x="128" y="24" class="a-txt">→ toward</text>',
  browser: '<rect x="20" y="14" width="160" height="92" rx="8" class="a-frame"/><path d="M20 30h160" class="a-line"/><circle cx="100" cy="68" r="28" class="a-fill2"/><path d="M72 68h56M100 40c-10 8-10 48 0 56M100 40c10 8 10 48 0 56" class="a-line"/>',
  location: '<path d="M20 90 C 60 70, 90 96, 130 80 S 180 84, 186 76" class="a-line"/><path d="M100 70s18-18 18-32a18 18 0 0 0-36 0c0 14 18 32 18 32z" class="a-acc a-bob"/><circle cx="100" cy="38" r="6" fill="#fff"/>',
  search: '<rect x="26" y="20" width="148" height="26" rx="13" class="a-frame"/><circle cx="44" cy="33" r="6" class="a-line"/><path d="M48 37l5 5" class="a-line"/><text x="60" y="37" class="a-txt">M31</text><ellipse cx="100" cy="82" rx="36" ry="12" transform="rotate(-25 100 82)" class="a-glow"/><circle cx="100" cy="82" r="18" class="a-dash"/>',
  clock: '<rect x="20" y="40" width="160" height="40" rx="20" class="a-frame"/><text x="36" y="65" class="a-txt">Tonight  21:00</text><path d="M126 60h40" class="a-line"/><circle cx="150" cy="60" r="7" class="a-knob a-slide"/>',
  toggles: '<g><rect x="24" y="44" width="36" height="36" rx="8" class="a-sel"/><rect x="68" y="44" width="36" height="36" rx="8" class="a-fill2"/><rect x="112" y="44" width="36" height="36" rx="8" class="a-sel"/><rect x="156" y="44" width="24" height="36" rx="8" class="a-fill2"/></g><path d="M32 70l6-14 6 8 5-4 4 10M76 54h20M80 64h12M122 70c4-10 12-10 16 0" class="a-line"/>',
  eye: '<path d="M10 104 C 60 90, 140 90, 190 104" class="a-line"/><circle cx="60" cy="80" r="7" class="a-fill"/><path d="M60 87v14M60 92l-8 8M60 92l8 8" class="a-line"/><path d="M64 76 L 140 30" class="a-dash"/><ellipse cx="146" cy="26" rx="14" ry="5" transform="rotate(-25 146 26)" class="a-glow"/>'
};

const GUIDES = [
  { id: "mo", tab: "Take a picture", entry: "microobservatory", title: "MicroObservatory: your first galaxy photo",
    time: "15 minutes, then one clear night", need: "An email address", widget: "tonight",
    steps: [
      ["Open the portal", "Go to Observing With NASA (OWN) and choose to control a telescope. No payment and no software to install.", "portal"],
      ["Choose a target", "Pick an object from the list. On autumn evenings the Andromeda Galaxy (M31) is high over Arizona; in winter, the Orion Nebula (M42). The panel below works out what is up tonight.", "target"],
      ["Set filter and exposure", "Choose a filter and exposure time. Galaxies are faint, so take the longest exposure offered; the Moon needs the shortest. For a color picture, request the same target through red, green and blue.", "exposure"],
      ["Submit with your email", "Your request waits in the queue until the target is up, the sky is dark and the weather is clear.", "mail"],
      ["Open the FITS file", "A link to your image arrives by email. Download the FITS (Flexible Image Transport System) file: it keeps the real pixel counts, unlike the preview.", "fits"],
      ["Stretch and combine", "Open it in a browser tool such as JS9 or desktop software such as SAOImageDS9. Stretch the brightness to bring out faint arms, then stack red, green and blue into color.", "color"]
    ] },
  { id: "pictor", tab: "Hear hydrogen", entry: "pictor", title: "PICTOR: detect the hydrogen line from the Milky Way",
    time: "20 minutes plus the scan", need: "An email address (optional)", widget: "hline",
    steps: [
      ["Read the beginner's guide", "Skim 'Observing the radio sky with PICTOR' (PDF). It explains drift scans and every plot you will get back.", "pdf"],
      ["Pick your moment", "PICTOR stays pointed (usually straight up) while Earth turns the sky past it. The hydrogen signal is strongest when the Milky Way's plane is overhead in Athens. The meter below shows when that is.", "drift"],
      ["Fill in the form", "Center frequency 1420 MHz, bandwidth 2.4 MHz and 2048 channels (the form's defaults for those two), a duration such as 600 seconds, and your email.", "form"],
      ["Submit and wait", "If someone else's scan is running, the form tells you; try again a few minutes later. Your scan runs for the duration you chose.", "wait"],
      ["Find the bump", "In the averaged spectrum, look for a bump above the flat baseline near 1420.4 MHz. That is 21-centimetre radiation from cold hydrogen gas between the stars.", "spectrum"],
      ["Measure its speed", "Gas moving toward us appears above 1420.406 MHz, gas moving away below it. Turn the peak's frequency into a speed with the calculator: this is how the Milky Way's rotation was first mapped.", "doppler"]
    ] },
  { id: "stellarium", tab: "Plan your sky", entry: "stellarium-web", title: "Stellarium Web: find Andromeda tonight",
    time: "10 minutes, then go outside", need: "A browser, and a dark-ish sky", widget: null,
    steps: [
      ["Open Stellarium Web", "It runs in any modern browser, on a phone too. Nothing to install.", "browser"],
      ["Set your location", "Allow location access, or click the location name at the bottom and search for your town.", "location"],
      ["Search for M31", "Use the search box. Stellarium centres the Andromeda Galaxy and its information panel shows where it sits in your sky.", "search"],
      ["Travel to tonight", "Open the date and time control and set tonight at 9 pm. Drag the hour forward to watch it rise higher.", "clock"],
      ["Match the view", "Use the bottom bar to switch constellation lines, the atmosphere and the landscape on or off so the screen looks like your real sky.", "toggles"],
      ["Go outside and look", "Face the direction Stellarium showed. Give your eyes 15 minutes to adapt and look for a faint oval smudge: light that left Andromeda about 2.5 million years ago.", "eye"]
    ] }
];

function guides() {
  $("#gTabs").innerHTML = GUIDES.map((g, k) => `<button type="button" role="tab" class="g-tab" id="tab-${g.id}" data-g="${g.id}" aria-selected="${k === 0}" aria-controls="gBody">
    <span class="gt-n">0${k + 1}</span><span class="gt-t">${esc(g.tab)}</span><span class="gt-s">${esc(byId[g.entry].name)}</span></button>`).join("");
  $("#gTabs").addEventListener("click", (ev) => { const b = ev.target.closest(".g-tab"); if (b) openGuide(b.dataset.g, false); });
  $("#gTabs").addEventListener("keydown", (ev) => {
    if (!/Arrow(Left|Right)/.test(ev.key)) return;
    const tabs = $$(".g-tab"), i = tabs.indexOf(document.activeElement); if (i < 0) return;
    const j = (i + (ev.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length; tabs[j].focus(); openGuide(tabs[j].dataset.g, false);
  });
  openGuide("mo", false, true);
}

let guideTimer = 0;
function openGuide(id, scroll, first) {
  const g = GUIDES.find((x) => x.id === id);
  $$(".g-tab").forEach((b) => { b.setAttribute("aria-selected", b.dataset.g === id ? "true" : "false"); b.tabIndex = b.dataset.g === id ? 0 : -1; });
  const e = byId[g.entry];
  const body = $("#gBody");
  body.setAttribute("aria-labelledby", "tab-" + id);
  body.innerHTML = `<div class="g-head">
      <div><h3>${esc(g.title)}</h3><div class="g-meta mono"><span>Time: ${esc(g.time)}</span><span>You need: ${esc(g.need)}</span><span>Cost: ${esc(e.price)}</span></div></div>
      ${lnk(e.url, `Open ${esc(hostOf(e.url))} ↗`, "btn primary")}
    </div>
    <ol class="g-steps">${g.steps.map(([t, d, art], k) => `<li class="g-step">
      <div class="gs-art"><svg viewBox="0 0 200 120" aria-hidden="true">${ART[art]}</svg><span class="gs-n">${k + 1}</span></div>
      <div class="gs-txt"><h4>${esc(t)}</h4><p>${esc(d)}</p></div></li>`).join("")}</ol>
    ${g.widget ? `<div class="g-widget card" id="gWidget"></div>` : ""}`;
  if (g.widget === "tonight") widgetTonight();
  if (g.widget === "hline") widgetHline();
  if (!first && !REDUCED && gsap) {
    gsap.fromTo(".g-head", { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4 });
    gsap.fromTo(".g-step", { opacity: 0, y: 24, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, stagger: 0.07, ease: "power3.out", clearProps: "transform" });
  } else if (first && !REDUCED && gsap) {
    // play the step stagger when the section first scrolls into view
    gsap.set(".g-step", { opacity: 0, y: 24 });
    const io = new IntersectionObserver((en) => { if (en[0].isIntersecting) { io.disconnect(); gsap.to(".g-step", { opacity: 1, y: 0, duration: 0.55, stagger: 0.08, ease: "power3.out", clearProps: "transform" }); } }, { rootMargin: "0px 0px -15% 0px" });
    io.observe($("#gBody"));
  }
  if (scroll) scrollTo({ top: $("#guides").getBoundingClientRect().top + scrollY - 70, behavior: REDUCED ? "auto" : "smooth" });
}

/* what is well placed over Arizona tonight at 10 pm Mountain Standard Time (UTC-7, Arizona keeps no daylight time) */
function widgetTonight() {
  const LAT = 31.68, LON = -110.88;
  const T = [ // J2000 coordinates (SIMBAD)
    ["M31", "Andromeda Galaxy", 10.685, 41.269], ["M42", "Orion Nebula", 83.822, -5.391], ["M13", "Hercules Globular Cluster", 250.423, 36.461],
    ["M57", "Ring Nebula", 283.396, 33.029], ["M51", "Whirlpool Galaxy", 202.470, 47.195], ["M45", "Pleiades", 56.75, 24.117], ["M81", "Bode's Galaxy", 148.888, 69.065]
  ];
  const base = new Date(Date.now());
  const t = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 5, 0, 0)); // 22:00 MST = 05:00 UTC next day
  if (t.getTime() < Date.now() - 3 * 3600e3) t.setUTCDate(t.getUTCDate() + 1);
  const rows = T.map(([id, n, ra, dec]) => ({ id, n, alt: altitude(LAT, LON, ra, dec, t) })).sort((a, b) => b.alt - a.alt);
  const sunA = sunAlt(LAT, LON, sunPos(t));
  const best = rows[0];
  $("#gWidget").innerHTML = `<div class="w-head"><span class="chip aurora">Live calculation</span><h4>Up over Arizona tonight at 10 pm</h4></div>
    <p class="muted">Altitude above the horizon at the Fred Lawrence Whipple Observatory on ${t.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "America/Phoenix" })}, 22:00 local (Sun ${Math.round(sunA)}°). Above 30° is good; below 0° is under the horizon.</p>
    <div class="alt-bars">${rows.map((r) => `<div class="ab${r === best ? " best" : ""}${r.alt < 0 ? " below" : ""}"><span class="ab-k">${r.id}<small>${esc(r.n)}</small></span><span class="ab-bar"><i style="--w:${Math.max(0, r.alt) / 90 * 100}%"></i></span><span class="ab-v">${Math.round(r.alt)}°</span></div>`).join("")}</div>
    <p class="w-pick">Best pick tonight: <strong>${best.id}, the ${esc(best.n)}</strong>, ${Math.round(best.alt)}° up.</p>`;
  if (!REDUCED && gsap) gsap.from("#gWidget .ab-bar i", { scaleX: 0, transformOrigin: "0 50%", duration: 0.9, stagger: 0.06, ease: "power3.out" });
}

/* where the Milky Way is relative to PICTOR's zenith, and a Doppler calculator */
function widgetHline() {
  const LAT = 37.98, LON = 23.73, F0 = 1420.405751768, C = 299792.458;
  const zb = (d) => galacticLat((gmstDeg(d) + LON + 360) % 360, LAT); // zenith RA = local sidereal time
  const nowD = new Date();
  const b0 = zb(nowD);
  let next = null;
  for (let m = 0; m <= 24 * 60; m += 5) { const d = new Date(nowD.getTime() + m * 60000); if (Math.abs(zb(d)) < 10) { next = d; break; } }
  let span = "";
  if (next) {
    let end = next; for (let m = 5; m < 24 * 60; m += 5) { const d = new Date(next.getTime() + m * 60000); if (Math.abs(zb(d)) >= 10) { end = d; break; } }
    const f = (d) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    span = Math.abs(b0) < 10 ? `The Milky Way is overhead in Athens <strong>right now</strong>, until about ${f(end)} your time. Submit a scan!` : `Next good window: <strong>${f(next)} to ${f(end)}</strong> your time (galactic latitude within ±10° of the zenith).`;
  }
  const pos = Math.max(-90, Math.min(90, b0));
  $("#gWidget").innerHTML = `<div class="w-grid">
    <div><div class="w-head"><span class="chip aurora">Live</span><h4>Milky Way meter over Athens</h4></div>
      <div class="gal-meter" role="img" aria-label="Galactic latitude of PICTOR's zenith is ${Math.round(b0)} degrees">
        <div class="gm-band"></div><div class="gm-needle" style="--p:${(pos + 90) / 180 * 100}%"><span>${b0 > 0 ? "+" : ""}${Math.round(b0)}°</span></div>
        <div class="gm-scale mono"><span>−90°</span><span>galactic plane 0°</span><span>+90°</span></div>
      </div>
      <p>Galactic latitude of the zenith right now: <strong>${b0.toFixed(1)}°</strong>. ${span}</p></div>
    <div><div class="w-head"><span class="chip ice">Calculator</span><h4>Frequency to speed</h4></div>
      <div class="field"><label for="fObs">Peak frequency <output id="fOut"></output></label><input type="range" id="fObs" min="1419.9" max="1420.9" step="0.005" value="1420.35"></div>
      <div class="dop-out"><span id="vOut" class="mono"></span><span id="vDir" class="muted"></span></div>
      <p class="hint">v = c (f₀ − f) / f₀ with f₀ = 1420.405752 MHz. Speed is along the line of sight, relative to the telescope (no correction for Earth's orbit).</p></div></div>`;
  const inp = $("#fObs");
  const upd = () => {
    const f = +inp.value, v = C * (F0 - f) / F0;
    $("#fOut").textContent = f.toFixed(3) + " MHz";
    $("#vOut").textContent = (v > 0 ? "+" : "") + v.toFixed(1) + " km/s";
    $("#vDir").textContent = Math.abs(v) < 1 ? "at rest" : v > 0 ? "moving away (redshift)" : "moving toward us (blueshift)";
    inp.style.setProperty("--fill", ((f - 1419.9) / 1.0 * 100) + "%");
  };
  inp.addEventListener("input", upd); upd();
}

/* ------------------------------------------------------------------ allocation */
function allocation() {
  const box = $("#allocSteps"); if (!box) return;
  if (REDUCED || !gsap) return;
  gsap.set("#allocSteps li", { opacity: 0, y: 20 });
  gsap.set(".over-bar", { scaleX: 0, transformOrigin: "0 50%" });
  const io = new IntersectionObserver((en) => {
    if (!en[0].isIntersecting) return; io.disconnect();
    gsap.timeline()
      .fromTo("#allocLine path", { attr: { "stroke-dashoffset": 1000 } }, { attr: { "stroke-dashoffset": 0 }, duration: 1.4, ease: "power2.out" })
      .to("#allocSteps li", { opacity: 1, y: 0, duration: 0.5, stagger: 0.12, ease: "power3.out", clearProps: "transform" }, 0.1)
      .to(".over-bar", { scaleX: 1, duration: 1, stagger: 0.25, ease: "power3.out" }, 0.6);
  }, { rootMargin: "0px 0px -15% 0px" });
  io.observe(box);
}

function observeReveal(nodes) {
  if (!("IntersectionObserver" in window)) { nodes.forEach((n) => n.classList.add("in")); return; }
  const io = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }), { rootMargin: "0px 0px -8% 0px" });
  nodes.forEach((n) => { if (n.dataset.delay) n.style.transitionDelay = n.dataset.delay + "ms"; io.observe(n); });
}
