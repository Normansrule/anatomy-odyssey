/* Landing page: live spiral galaxy hero, "where do you want to start?"
 * chooser, the "right now" sky strip, a powers-of-ten slider, the pinned atlas
 * fly-through, rocket-equation mini calculator and the milestone marquee.
 *
 * Interaction ideas re-implemented in vanilla JS/CSS (no React):
 *   magnetic buttons      <- Animate UI / motion-primitives "Magnetic"
 *   3D tilt + spotlight   <- magicui "MagicCard", react-bits "TiltedCard"
 *   number tickers        <- magicui "NumberTicker"
 *   pinned horizontal row <- GSAP ScrollTrigger containerAnimation showcases
 *   slot-machine reels    <- react-bits "SlotCounter"-style rolling columns */
import * as THREE from "three";

/* ------------------------------------------------------------------ galaxy */
/* A four-armed logarithmic spiral. Each star gets a radius r drawn from an
 * exponential disk profile and sits near an arm at angle
 *   θ = θ_arm + ln(r / r0) / tan(pitch)
 * Stars orbit with a flat rotation curve (v ≈ constant ⇒ ω ∝ 1/r), computed
 * in the vertex shader so all 70,000 points move for free on the GPU. */
function galaxy(host) {
  if (!window.Codex || !Codex.webgl()) return;
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);

  const N = innerWidth < 700 ? 38000 : 70000;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), speed = new Float32Array(N);
  const arms = 2, pitch = 0.31, R = 9;
  const core = new THREE.Color("#ffd9a8"), mid = new THREE.Color("#ffc6e2"), arm = new THREE.Color("#8fc4ff"), hii = new THREE.Color("#ff6fb0");
  const c = new THREE.Color();
  const gauss = () => { let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * v); };
  for (let i = 0; i < N; i++) {
    const bulge = Math.random() < 0.18;
    let r, th, y;
    if (bulge) {
      r = Math.abs(gauss()) * 1.1; th = Math.random() * 6.2832; y = gauss() * 0.35 * Math.exp(-r / 2);
    } else if (Math.random() < 0.3) {
      // smooth inter-arm disk
      r = 0.5 - Math.log(1 - Math.random() * 0.98) * 2.4; if (r > R) r = Math.random() * R;
      th = Math.random() * 6.2832; y = gauss() * 0.08;
    } else {
      r = 0.6 - Math.log(1 - Math.random() * 0.985) * 2.6; if (r > R) r = Math.random() * R;
      const a = (Math.floor(Math.random() * arms) / arms) * 6.2832;
      const spread = gauss() * 0.42 / Math.sqrt(Math.max(r, 0.6));
      th = a + Math.log(r / 0.6) / Math.tan(pitch) + spread;   // pitch ≈ 18°
      y = gauss() * 0.07 * (1 + r * 0.05);
    }
    pos[i * 3] = r * Math.cos(th); pos[i * 3 + 1] = y; pos[i * 3 + 2] = r * Math.sin(th);
    const t = Math.min(1, r / 5.5);
    c.copy(core).lerp(mid, Math.min(1, t * 1.6)).lerp(arm, Math.max(0, t * 1.3 - 0.3));
    if (!bulge && Math.random() < 0.03) c.copy(hii);
    const b = 0.55 + Math.random() * 0.45;
    col[i * 3] = c.r * b; col[i * 3 + 1] = c.g * b; col[i * 3 + 2] = c.b * b;
    size[i] = (bulge ? 1.3 : 1.0) * (Math.random() < 0.02 ? 3.2 : 0.7 + Math.random() * 1.1);
    speed[i] = 0.9 / Math.max(r, 0.5);      // flat rotation curve: ω = v / r
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("size", new THREE.BufferAttribute(size, 1));
  geo.setAttribute("speed", new THREE.BufferAttribute(speed, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: renderer.getPixelRatio() * 38 } },
    vertexShader: /* glsl */`
      attribute float size; attribute float speed; attribute vec3 color;
      uniform float uTime; uniform float uScale; varying vec3 vCol; varying float vA;
      void main() {
        float a = uTime * speed * 0.06;
        float cs = cos(a), sn = sin(a);
        vec3 p = vec3(position.x * cs - position.z * sn, position.y, position.x * sn + position.z * cs);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = size * uScale / -mv.z;
        vCol = color; vA = smoothstep(0.0, 1.5, gl_PointSize);
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vCol; varying float vA;
      void main() {
        vec2 d = gl_PointCoord - 0.5; float r = length(d);
        float f = exp(-r * r * 22.0) + 0.25 * exp(-r * r * 6.0);
        if (f < 0.02) discard;
        gl_FragColor = vec4(vCol * f, f * vA);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  const stars = new THREE.Points(geo, mat);
  const tilt = new THREE.Group(); tilt.add(stars); scene.add(tilt);
  tilt.rotation.set(0.42, 0, -0.32);

  // Core glow sprite
  const gc = document.createElement("canvas"); gc.width = gc.height = 256;
  const g = gc.getContext("2d"); const rg = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  rg.addColorStop(0, "rgba(255,236,210,.95)"); rg.addColorStop(.18, "rgba(255,200,160,.45)"); rg.addColorStop(.5, "rgba(190,140,255,.10)"); rg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gc), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.scale.set(7, 7, 1); tilt.add(glow);

  // Distant background stars
  const bgN = 2500, bp = new Float32Array(bgN * 3);
  for (let i = 0; i < bgN; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(60 + Math.random() * 60); bp.set([v.x, v.y, v.z], i * 3); }
  const bg = new THREE.BufferGeometry(); bg.setAttribute("position", new THREE.BufferAttribute(bp, 3));
  scene.add(new THREE.Points(bg, new THREE.PointsMaterial({ color: 0xbfd4ff, size: 0.18, sizeAttenuation: true, transparent: true, opacity: 0.7, depthWrite: false })));

  let W = 0, H = 0;
  function resize() {
    W = host.clientWidth; H = host.clientHeight;
    renderer.setSize(W, H, false); camera.aspect = W / H;
    // Frame the galaxy to the right of the headline on wide screens.
    const wide = W > 900;
    camera.fov = wide ? 50 : 62;
    camera.setViewOffset(W, H, wide ? -W * 0.2 : 0, wide ? 0 : -H * 0.28, W, H);
    camera.updateProjectionMatrix();
  }
  resize(); addEventListener("resize", resize);

  let mx = 0, my = 0, px = 0, py = 0;
  addEventListener("pointermove", e => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; });

  const reduce = Codex.reducedMotion;
  let visible = true;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(host);
  let last = performance.now();
  let t = 20;
  function frame() {
    requestAnimationFrame(frame);
    const now = performance.now(); const dt = Math.min((now - last) / 1000, 0.05); last = now;
    if (!visible || document.hidden) return;
    if (!reduce) t += dt;
    px += (mx - px) * 0.04; py += (my - py) * 0.04;
    const s = Math.min(scrollY / innerHeight, 1);
    mat.uniforms.uTime.value = t;
    camera.position.set(px * 2.2, 10 - py * 1.5 - s * 2.5, 12.5 - s * 3);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  }
  frame();
}

/* ------------------------------------------------ rocket equation widget */
function rocketEquation() {
  const tex = document.getElementById("eq-tex");
  if (window.katex && tex) {
    katex.render(String.raw`\Delta v = I_{sp}\,g_0 \ln\frac{m_0}{m_f}`, tex, { displayMode: true, throwOnError: false });
  }
  const isp = document.getElementById("eq-isp"), mr = document.getElementById("eq-mr");
  const out = document.getElementById("eq-dv"), verdict = document.getElementById("eq-verdict");
  const G0 = 9.80665; // standard gravity, m/s² (CGPM 1901)
  function update() {
    const I = +isp.value, R = +mr.value;
    const dv = I * G0 * Math.log(R) / 1000;
    document.getElementById("eq-isp-o").textContent = I + " s";
    document.getElementById("eq-mr-o").textContent = R.toFixed(1);
    out.textContent = dv.toFixed(2);
    // Rough mission budgets (JPL Basics of Space Flight; typical Δv maps):
    // low Earth orbit ≈ 9.4 km/s including gravity + drag losses.
    verdict.textContent = dv >= 9.4 ? "enough for orbit in one stage (on paper)" :
      dv >= 7.8 ? "orbital speed, but not the losses" : dv >= 3.0 ? "a good upper stage" : "a sounding rocket";
  }
  [isp, mr].forEach(el => el.addEventListener("input", update));
  update();
}

/* ------------------------------------------------------ milestone marquee */
async function milestones() {
  const track = document.getElementById("milestones");
  const pick = ["1926", "1957-10", "1961-04", "1969-07", "1971", "1977", "1981-04", "1990-04", "1998-11", "2004-01", "2012-08", "2015-07", "2015-12", "2019-04", "2020-05", "2021-02", "2021-12", "2022-11", "2024-10", "2026-04"];
  let items = [];
  try {
    const d = await (await fetch("data/timeline.json")).json();
    const ev = d.events;
    for (const p of pick) { const e = ev.find(x => x.date.startsWith(p) && !items.includes(x)); if (e) items.push(e); }
  } catch (e) { /* offline or file:// – keep the band empty */ }
  if (!items.length) { track.closest(".marquee-band").hidden = true; return; }
  const html = items.map(e => `<a class="milestone" href="timeline.html"><b>${e.date.slice(0, 4)}</b>${e.title}</a>`).join("");
  track.innerHTML = html + html;   // duplicated for a seamless loop
  track.querySelectorAll("a").forEach((a, i) => { if (i >= items.length) a.setAttribute("aria-hidden", "true"), a.tabIndex = -1; });
}

/* =========================================================================
   Shared helpers
   ========================================================================= */
const RM = !!(window.Codex && Codex.reducedMotion);
const G = window.gsap || null;
if (G) { try { G.registerPlugin(window.ScrollTrigger, window.Flip); } catch (e) { /* plugins missing: degrade */ } }
const ST = G && window.ScrollTrigger ? window.ScrollTrigger : null;
const FINE = matchMedia("(hover: hover) and (pointer: fine)").matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
};
let refreshTimer = 0;
function refreshST() { if (!ST) return; clearTimeout(refreshTimer); refreshTimer = setTimeout(() => ST.refresh(), 120); }

/* Number ticker (NumberTicker idea): tween from the last shown value. */
function ticker(el, to, fmt, dur = 1.4) {
  if (!el) return;
  const from = el._v == null ? 0 : el._v;
  el._v = to;
  if (RM || !G) { el.textContent = fmt(to); return; }
  const o = { v: from };
  G.to(o, { v: to, duration: dur, ease: "power3.out", onUpdate: () => { el.textContent = fmt(o.v); } });
}
const int = v => Math.round(v).toLocaleString("en-US");

/* ------------------------------------------------ page metadata (22 pages) */
const NEW_PAGES = new Set(["builder", "space-weather", "galaxies"]);
function page(id) {
  const p = (window.Codex ? Codex.pages : []).find(x => x[0] === id) || [id, id, id + ".html", "", ""];
  return { id, title: p[1], href: p[2], group: p[3], desc: p[4], img: "assets/img/screens/" + id + ".jpg", isNew: NEW_PAGES.has(id) };
}

/* Placeholder art for the three new pages until their screenshots exist.
 * Seeded random so the art is identical on every visit. */
function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; }
let phN = 0;
function spiralSVG(cx, cy, R, rot, col, seed, tilt = 0.45) {
  const r = rng(seed); let dots = "", arms = "";
  for (let a = 0; a < 2; a++) {
    let d = "";
    for (let i = 0; i <= 60; i++) {
      const t = i / 60, th = a * Math.PI + t * 4.2 + rot, rr = R * (0.08 + t * 0.92);
      const x = cx + Math.cos(th) * rr, y = cy + Math.sin(th) * rr * tilt;
      d += (i ? "L" : "M") + x.toFixed(1) + "," + y.toFixed(1);
    }
    arms += `<path d="${d}" fill="none" stroke="${col}" stroke-width="${(R * 0.16).toFixed(1)}" stroke-linecap="round" opacity=".28" filter="url(#phb)"/>`;
  }
  for (let i = 0; i < 150; i++) {
    const t = Math.pow(r(), 0.8), a = (r() < 0.5 ? 0 : Math.PI) + t * 4.2 + rot + (r() - 0.5) * 0.7, rr = R * (0.08 + t * 0.92);
    dots += `<circle cx="${(cx + Math.cos(a) * rr).toFixed(1)}" cy="${(cy + Math.sin(a) * rr * tilt).toFixed(1)}" r="${(0.5 + r() * 1.3).toFixed(1)}" fill="${r() < 0.2 ? "#ffd9ef" : "#dbe9ff"}" opacity="${(0.4 + r() * 0.6).toFixed(2)}"/>`;
  }
  return arms + dots + `<ellipse cx="${cx}" cy="${cy}" rx="${R * 0.22}" ry="${R * 0.22 * tilt}" fill="#fff4dd" filter="url(#phb)"/><ellipse cx="${cx}" cy="${cy}" rx="${R * 0.1}" ry="${R * 0.1 * tilt}" fill="#fff"/>`;
}
const PH = {
  builder: () => `<svg viewBox="0 0 320 180" aria-hidden="true"><g fill="none" stroke="#7cc8ff" stroke-width="1.3" stroke-linejoin="round">
    <path d="M52 76 L38 64 L38 116 L52 104" fill="rgba(124,200,255,.08)"/><path d="M52 72 H148 V108 H52 Z" fill="rgba(124,200,255,.12)"/>
    <path d="M148 76 H158 V104 H148"/><path d="M158 74 H222 V106 H158 Z" fill="rgba(124,200,255,.12)"/>
    <path d="M222 74 C252 74 276 82 290 90 C276 98 252 106 222 106 Z" fill="rgba(124,200,255,.16)"/>
    <path d="M60 72 L48 50 H70 L82 72 M60 108 L48 130 H70 L82 108" fill="rgba(255,122,61,.18)" stroke="#ff7a3d"/>
    <path d="M38 80 L22 86 L10 90 L22 94 L38 100" stroke="#ff7a3d" stroke-dasharray="3 3"/>
    <path d="M52 146 H290 M52 140 V152 M290 140 V152" stroke-width="1"/><path d="M110 60 V72 M190 60 V74" stroke-dasharray="2 3" stroke-width="1"/></g>
    <g fill="#7cc8ff" font-family="JetBrains Mono, monospace" font-size="8.5"><text x="150" y="160" text-anchor="middle">42.1 m</text>
    <text x="100" y="56" text-anchor="middle">STAGE 1</text><text x="190" y="56" text-anchor="middle">STAGE 2</text>
    <text x="16" y="22" fill="#e9edff" font-size="10">ROCKET BUILDER</text><text x="16" y="34" fill="#4ef0b8">Δv 9.41 km/s · T/W 1.32</text></g></svg>`,
  "space-weather": () => {
    let wind = "";
    for (let i = 0; i < 9; i++) { const y = 26 + i * 16, b = (y - 90) * 0.5; wind += `<path d="M70 ${y} C140 ${y + b * 0.2} 170 ${y - b * 0.1} 330 ${y + b * 0.35}" stroke="rgba(255,190,110,${0.18 + (i % 3) * 0.08})" stroke-width="1" fill="none" stroke-dasharray="${6 + i % 4} 7"/>`; }
    return `<svg viewBox="0 0 320 180" aria-hidden="true"><defs><radialGradient id="phsun" cx="0" cy="90" r="90" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff3c4"/><stop offset=".55" stop-color="#ffb347"/><stop offset=".85" stop-color="#ff6a1f"/><stop offset="1" stop-color="#ff6a1f" stop-opacity="0"/></radialGradient>
    <filter id="phb" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter></defs>
    <circle cx="-8" cy="90" r="86" fill="url(#phsun)"/>${wind}
    <path d="M214 90 m-26 0 c0 -44 40 -66 110 -70 M188 90 c0 44 40 66 110 70" fill="none" stroke="#b18cff" stroke-width="1.4" opacity=".75"/>
    <path d="M226 90 m-14 0 c0 -26 26 -40 90 -44 M212 90 c0 26 26 40 90 44" fill="none" stroke="#7cc8ff" stroke-width="1" opacity=".55"/>
    <ellipse cx="236" cy="78" rx="9" ry="3" fill="none" stroke="#4ef0b8" stroke-width="2.4" filter="url(#phb)"/><ellipse cx="236" cy="78" rx="8" ry="2.6" fill="none" stroke="#4ef0b8" stroke-width="1.2"/>
    <circle cx="236" cy="90" r="12" fill="#2a6fff"/><circle cx="232" cy="86" r="12" fill="none" stroke="#bfe7ff" stroke-opacity=".5" stroke-width="1"/>
    <text x="304" y="22" fill="#e9edff" font-family="JetBrains Mono, monospace" font-size="10" text-anchor="end">Kp 5 · G1 storm</text></svg>`;
  },
  galaxies: () => `<svg viewBox="0 0 320 180" aria-hidden="true"><defs><filter id="phb" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.2"/></filter><filter id="phc" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter></defs>
    <path d="M150 96 C110 70 80 120 40 150" fill="none" stroke="#9fb4ff" stroke-width="14" stroke-linecap="round" opacity=".22" filter="url(#phc)"/>
    <path d="M190 100 C240 70 250 40 296 26" fill="none" stroke="#ff9ccc" stroke-width="12" stroke-linecap="round" opacity=".2" filter="url(#phc)"/>
    <ellipse cx="166" cy="94" rx="120" ry="52" fill="#b18cff" opacity=".08" filter="url(#phc)"/>
    ${spiralSVG(118, 84, 62, 0.4, "#8fb8ff", 7, 0.5)}${spiralSVG(214, 104, 44, 2.2, "#ffb3d9", 13, 0.62)}</svg>`
};
/* give every placeholder its own gradient / filter ids (duplicate ids resolve to the first, which may be hidden) */
function uniq(svg) { const u = "u" + (++phN); return svg.replace(/id="(ph\w+)"/g, `id="$1${u}"`).replace(/url\(#(ph\w+)\)/g, `url(#$1${u})`); }
for (const k of Object.keys(PH)) { const f = PH[k]; PH[k] = () => uniq(f()); }
function fillPlaceholders(root = document) { $$(".ph[data-ph]", root).forEach(el => { if (!el.firstChild && PH[el.dataset.ph]) el.innerHTML = PH[el.dataset.ph](); }); }
/* An <img> that removes itself if the file is missing, showing the placeholder beneath. */
function guardImgs(root) {
  $$("img[data-fallback]", root).forEach(img => {
    const kill = () => img.remove();
    if (img.complete && img.naturalWidth === 0 && img.src) kill(); else img.addEventListener("error", kill, { once: true });
  });
}
function mediaHTML(p, alt = "") {
  return `<div class="media">${p.isNew ? `<div class="ph" data-ph="${p.id}">${PH[p.id]()}</div>` : ""}<img src="${p.img}" alt="${esc(alt)}" loading="lazy"${p.isNew ? " data-fallback" : ""}></div>`;
}

/* =========================================================================
   1. "Where do you want to start?"
   ========================================================================= */
const PATHS = {
  wow: { c: "var(--plasma)", title: "Two minutes, three <em>jaw-drops</em>", total: "about 2 minutes", steps: [
    ["black-hole", "Every pixel is a light ray bent by gravity. Tilt the disk, then fall in.", "40 seconds"],
    ["galaxies", "Smash the Milky Way into Andromeda: four billion years in a minute.", "40 seconds"],
    ["scale", "One drag from a proton to the whole observable universe.", "40 seconds"]] },
  fly: { c: "var(--flame)", title: "Your <em>flight plan</em>", total: "about 25 minutes", steps: [
    ["launch", "Ride Apollo 11 from T−10 through three stages to orbit.", "10 min"],
    ["booster", "Flip, boost back, hoverslam: land a booster on a drone ship yourself.", "5 min"],
    ["moon-landing", "Take over Eagle for the last few hundred metres, like Armstrong.", "8 min"]] },
  orbits: { c: "var(--ice)", title: "From Newton's cannon to a <em>Mars transfer</em>", total: "about 40 minutes", steps: [
    ["orbits", "Newton's cannonball, Kepler's laws, Hohmann transfers and Lagrange points, hands-on.", "15 min"],
    ["equations", "Vis-viva, the rocket equation and 45 more, each with a live calculator.", "20 min"],
    ["solar-system", "Check your answers against where the planets really are today.", "5 min"]] },
  build: { c: "var(--sol)", title: "Design it, compare it, <em>build it</em>", total: "an evening, then a weekend", steps: [
    ["builder", "Stack tanks and engines, watch Δv update, then launch your design.", "10 min"],
    ["hangar", "Stand your idea next to 26 real rockets at true scale.", "3 min"],
    ["experiments", "Build a real one: from a stomp rocket to your own flight computer.", "a weekend"]] },
  sky: { c: "var(--aurora)", title: "Tonight, <em>over your head</em>", total: "about 10 minutes", steps: [
    ["sky", "The real sky for your city tonight: planets, Moon and constellations.", "5 min"],
    ["earth", "When the International Space Station (ISS) next passes over you.", "3 min"],
    ["space-weather", "Will there be an aurora? Live solar wind and storm forecast.", "3 min"]] },
  surprise: { c: "var(--nebula)", title: "The cosmic slot machine says…", total: "pure chance", steps: [] }
};
const POOL = () => (window.Codex ? Codex.pages : []).filter(p => p[0] !== "index").map(p => p[0]);

function chooser() {
  const wrap = $("#choices"), out = $("#path");
  if (!wrap || !out) return;
  const btns = $$(".choice", wrap);
  // spotlight follows the cursor inside each choice
  wrap.addEventListener("pointermove", e => {
    const b = e.target.closest(".choice"); if (!b) return;
    const r = b.getBoundingClientRect(); b.style.setProperty("--mx", e.clientX - r.left + "px"); b.style.setProperty("--my", e.clientY - r.top + "px");
  });

  /* First pick: the six big tiles morph (GSAP Flip) into a compact row. Returns the wait in s. */
  function compact(animate) {
    if (wrap.classList.contains("picked")) return 0;
    const F = window.Flip;
    if (!F || RM || !animate) { wrap.classList.add("picked"); return 0; }
    const state = F.getState($$(".choice, .choice .ci, .choice .ct", wrap));
    wrap.classList.add("picked");
    F.from(state, { duration: 0.6, ease: "power3.inOut", nested: true, absolute: false, scale: false });
    return 0.45;
  }

  function render(key, { ids, animate = true, back = false } = {}) {
    const P = PATHS[key]; if (!P) return;
    btns.forEach(b => b.setAttribute("aria-pressed", String(b.dataset.path === key)));
    const wait = compact(animate);
    const on = btns.find(b => b.dataset.path === key);
    if (on && wrap.scrollWidth > wrap.clientWidth + 4) setTimeout(() => wrap.scrollTo({ left: Math.max(0, on.offsetLeft - 16), behavior: RM || !animate ? "auto" : "smooth" }), wait * 1000 + 50);
    let steps = P.steps.map(([id, why, when]) => ({ ...page(id), why, when }));
    if (key === "surprise") {
      if (!ids) { const pool = POOL(); ids = []; while (ids.length < 3 && pool.length) ids.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]); }
      steps = ids.map(id => { const p = page(id); return { ...p, why: p.desc + ".", when: p.group }; });
    }
    store.set("cl.start", { k: key, ids: key === "surprise" ? ids : undefined });
    const html = `
      <div class="path-head" style="--pc:${P.c}"><h3>${P.title}</h3>
        <div class="meta">${back ? '<span class="wb">welcome back ✦</span>' : ""}<span>3 stops · ${P.total}</span></div></div>
      <div class="path-steps" style="--pc:${P.c}"><div class="path-line" aria-hidden="true"><i></i></div>
        ${steps.map((s, i) => `<a class="card spot pstep${i ? "" : " first"}" href="${s.href}">
          <span class="n">${i + 1}</span>${mediaHTML(s, s.title)}
          <div class="pbody"><span class="when">${esc(s.when)}</span><h4>${esc(s.title)}</h4><p>${esc(s.why)}</p></div>
          <span class="go" aria-hidden="true">→</span></a>`).join("")}
      </div>
      <div class="path-foot">
        <a class="btn primary magnetic" href="${steps[0].href}"><span>Start with ${esc(steps[0].title)} →</span></a>
        ${key === "surprise" ? '<button class="btn magnetic" type="button" id="respin"><span>🎰 Spin again</span></button>' : '<span class="hint">or pick another start above</span>'}
      </div>`;
    const swap = () => {
      out.innerHTML = html; guardImgs(out); magnetize(out); tiltify(out);
      const cards = $$(".pstep", out), line = $(".path-line", out);
      if (key === "surprise") spin(cards, steps, animate);
      if (animate && G && !RM) {
        G.fromTo(cards, { y: 36, opacity: 0, rotateX: -14, transformPerspective: 900 }, { y: 0, opacity: 1, rotateX: 0, duration: 0.75, stagger: 0.12, ease: "back.out(1.5)", clearProps: "transform,opacity" });
        const vert = matchMedia("(max-width: 800px)").matches;
        G.fromTo(line, vert ? { scaleY: 0 } : { scaleX: 0 }, vert ? { scaleY: 1, duration: 0.9, delay: 0.2, ease: "power2.out" } : { scaleX: 1, duration: 0.9, delay: 0.2, ease: "power2.out" });
        G.fromTo($$(".path-head, .path-foot", out), { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.25 });
      }
      const again = $("#respin"); if (again) again.addEventListener("click", () => render("surprise"));
      refreshST();
    };
    const old = $$(".pstep, .path-head, .path-foot", out);
    if (animate && G && !RM && old.length) G.to(old, { opacity: 0, y: -12, duration: 0.18, stagger: 0.03, onComplete: swap });
    else if (wait) G.delayedCall(wait, swap);
    else swap();
  }

  /* Slot machine: each card's picture spins through a reel of random pages
   * and lands on the chosen one, reels stopping left to right. */
  function spin(cards, steps, animate) {
    if (!animate || !G || RM) return;
    const pool = POOL();
    cards.forEach((card, i) => {
      const media = $(".media", card); if (!media) return;
      const h = media.getBoundingClientRect().height || 180;
      const n = 12 + i * 5, faces = [];
      for (let k = 0; k < n - 1; k++) faces.push(page(pool[Math.floor(Math.random() * pool.length)]));
      faces.push(steps[i]);
      const reel = document.createElement("div"); reel.className = "reel";
      reel.innerHTML = `<div class="reel-strip">${faces.map(f => `<div style="height:${h}px">${f.isNew ? `<div class="ph" data-ph="${f.id}">${PH[f.id]()}</div>` : `<img src="${f.img}" alt="" loading="eager">`}<span class="rl">${esc(f.title)}</span></div>`).join("")}</div>`;
      media.appendChild(reel);
      const strip = reel.firstChild;
      card.classList.add("spinning");
      G.fromTo(strip, { y: 0, filter: "blur(2px)" }, { y: -(n - 1) * h, filter: "blur(0px)", duration: 1.3 + i * 0.55, ease: "back.out(0.7)", delay: 0.15,
        onComplete: () => { card.classList.remove("spinning"); card.classList.add("landed"); G.to(reel, { opacity: 0, duration: 0.35, delay: 0.4, onComplete: () => reel.remove() }); } });
    });
  }

  btns.forEach(b => b.addEventListener("click", () => {
    const first = !wrap.classList.contains("picked");
    render(b.dataset.path);
    if (first) { const top = $("#start").getBoundingClientRect().top + scrollY - 70; if (Math.abs(scrollY - top) > 200) scrollTo({ top, behavior: RM ? "auto" : "smooth" }); }
  }));
  const last = store.get("cl.start");
  if (last && PATHS[last.k]) {
    let ids = Array.isArray(last.ids) ? last.ids.filter(id => POOL().includes(id)).slice(0, 3) : undefined;
    if (ids && ids.length !== 3) ids = undefined;
    render(last.k, { ids, animate: false, back: true });
  }
}

/* =========================================================================
   2. "Right now": Moon, planets, Sun, Voyager 1, Mars light-time, next events.
   Everything computed on the device from ephemeris.js / sky-astro.js.
   ========================================================================= */
/* Voyager 1: 173.14 AU (one light-day) on 2026-11-18 per EarthSky, 26 June 2026 and
 * NASA "Where are Voyager 1 and Voyager 2 now?"; outward speed about 16.9 km/s
 * (3.57 AU per year, NASA/JPL Voyager mission status). Same reference as scale.js. */
const VOY = { refMs: Date.UTC(2026, 10, 18, 12), refAU: 173.14, kms: 16.9, heliopauseAU: 121.6 };
const PCOL = { mercury: "#c9c3b8", venus: "#fff6d8", mars: "#ff8a5c", jupiter: "#ffe2b8", saturn: "#ffd27a", uranus: "#9ff0ff", neptune: "#7aa6ff", moon: "#f2f2ea" };
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const compass = az => COMPASS[Math.round(((az % 360) + 360) % 360 / 45) % 8];

function drawMoon(svg, illum, waxing, chi) {
  const r = 50, k = Math.max(0, Math.min(1, illum)), rx = Math.abs(1 - 2 * k) * r;
  const lit = `M0,${-r} A${r},${r} 0 0 1 0,${r} A${rx.toFixed(2)},${r} 0 0 ${k > 0.5 ? 1 : 0} 0,${-r} Z`;
  const rot = (270 - (chi == null ? (waxing ? 270 : 90) : chi)).toFixed(1);
  const cr = [[-18, -14, 9], [14, 20, 7], [22, -18, 5], [-8, 24, 6], [-26, 10, 4], [4, -30, 5], [30, 4, 4]];
  svg.innerHTML = `<defs><radialGradient id="mlit" cx="35%" cy="35%" r="75%"><stop offset="0" stop-color="#fffdf2"/><stop offset=".7" stop-color="#e8e4d4"/><stop offset="1" stop-color="#bdb8a6"/></radialGradient>
    <radialGradient id="mhalo"><stop offset=".78" stop-color="rgba(255,250,225,.22)"/><stop offset="1" stop-color="rgba(255,250,225,0)"/></radialGradient>
    <clipPath id="mclip"><circle r="${r}"/></clipPath></defs>
    <circle r="${r + 12 * k}" fill="url(#mhalo)"/><circle r="${r}" fill="#1b1e2c"/>
    <g clip-path="url(#mclip)"><path class="mlit" d="${lit}" fill="url(#mlit)" transform="rotate(${rot})"/>
    ${cr.map(([x, y, s]) => `<circle cx="${x}" cy="${y}" r="${s}" fill="rgba(60,55,70,.16)"/>`).join("")}</g>
    <circle r="${r}" fill="none" stroke="rgba(255,255,255,.08)"/>`;
}

function rightNow() {
  const host = $("#now"); if (!host) return;
  let started = false;
  const go = () => { if (started) return; started = true; initNow().catch(err => { console.warn("right-now strip:", err); }); };
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); go(); } }, { rootMargin: "500px 0px" });
    io.observe(host);
  } else go();
}

async function initNow() {
  const [S, E] = await Promise.all([import("./sky-astro.js"), import("./ephemeris.js")]);
  const LA = { lat: 34.0522, lon: -118.2437, tz: "America/Los_Angeles", name: "Los Angeles" };
  let loc = LA;
  const msOf = jd => E.jdToMs(jd);
  const tf = (ms, o) => { try { return new Intl.DateTimeFormat("en-US", { timeZone: loc.tz, ...o }).format(ms); } catch (e) { return new Intl.DateTimeFormat("en-US", o).format(ms); } };
  const hm = ms => tf(ms, { hour: "numeric", minute: "2-digit" }).replace(" AM", " am").replace(" PM", " pm");
  const day = ms => tf(ms, { weekday: "short", day: "numeric", month: "short" });

  // live clock
  const clock = $("#now-clock");
  const tickClock = () => { clock.textContent = tf(Date.now(), { weekday: "short", day: "numeric", month: "short" }) + ", " + tf(Date.now(), { hour: "numeric", minute: "2-digit", second: "2-digit" }).replace(" AM", " am").replace(" PM", " pm"); };
  tickClock(); setInterval(tickClock, 1000);

  /* next moment the Moon's elongation in longitude crosses `target` degrees (0 new, 180 full) */
  function nextPhase(jd, target) {
    const f = j => ((S.moonPhase(j).elongLon - target + 540) % 360) - 180;
    let a = jd, fa = f(a);
    for (let t = jd + 0.5; t < jd + 31; t += 0.5) {
      const fb = f(t);
      if (fa < 0 && fb >= 0 && fb - fa < 90) { let lo = t - 0.5, hi = t; for (let k = 0; k < 28; k++) { const m = (lo + hi) / 2; if (f(m) < 0) lo = m; else hi = m; } return (lo + hi) / 2; }
      a = t; fa = fb;
    }
    return null;
  }

  let panoData = null;
  function compute() {
    const now = Date.now(), jd = S.julianDay(new Date(now));
    $("#now-place").textContent = loc.name;

    /* Moon */
    const mp = S.moonPhase(jd);
    drawMoon($("#moon-svg"), mp.illum, mp.waxing, mp.chi);
    $("#moon-svg").setAttribute("aria-label", `${mp.name}, ${Math.round(mp.illum * 100)} percent illuminated`);
    ticker($("#moon-illum"), mp.illum * 100, v => Math.round(v));
    $("#moon-name").textContent = `${mp.name} · day ${Math.round(mp.ageDays)} of 29.5`;
    const mr = S.riseSetTransit("moon", jd, loc.lat, loc.lon, null, 1.1, 1 / 48);
    const mrise = mr.rises[0], mset = mr.sets[0];
    $("#moon-rs").innerHTML = [mrise && [mrise, "Rises"], mset && [mset, "Sets"]].filter(Boolean).sort((a, b) => a[0] - b[0])
      .map(([t, w]) => `<span><small>${w}</small><b>${hm(msOf(t))}</b></span>`).join("") || "<span><small>Moon</small><b>up all day</b></span>";

    /* Sun: previous / next rise and set around now */
    const ev = S.sunEvents(jd - 0.75, loc.lat, loc.lon, 2.1);
    const before = a => a.filter(t => t <= jd).pop(), after = a => a.find(t => t > jd);
    const pr = before(ev.rise), ps = before(ev.set), nr = after(ev.rise), ns = after(ev.set);
    const isDay = pr != null && (ps == null || pr > ps);
    $("#sun-set").textContent = ns ? hm(msOf(ns)) : "—";
    $("#sun-rise").textContent = nr ? hm(msOf(nr)) : "—";
    let frac = 0.5, dayLen = null;
    if (isDay && pr && ns) { frac = (jd - pr) / (ns - pr); dayLen = ns - pr; }
    else if (!isDay && ps && nr) { frac = (jd - ps) / (nr - ps); const s2 = ev.set.find(t => t > nr); if (s2) dayLen = s2 - nr; }
    drawSunArc($("#sun-arc"), isDay, frac);
    const sunAlt = S.altAzOf("sun", jd, loc.lat, loc.lon).alt;
    const aSet = after(ev.astro.sets), aRise = after(ev.astro.rises);
    $("#sun-dark").textContent = sunAlt < -18 ? (aRise ? `Dark sky until ${hm(msOf(aRise))}` : "Dark sky now") : aSet ? `Truly dark from ${hm(msOf(aSet))}` : "";
    $("#sun-len").textContent = dayLen ? `${isDay || day(msOf(nr)) === day(now) ? "Daylight today" : "Daylight tomorrow"}: ${Math.floor(Math.round(dayLen * 1440) / 60)} h ${Math.round(dayLen * 1440) % 60} min` : "The Sun stays " + (ev.alwaysUp ? "up" : "down") + " today";

    /* Planets tonight: from dusk to dawn in 15-minute steps */
    const start = isDay ? ns : ps, end = isDay ? after(ev.rise.filter(t => t > (ns || jd))) : nr;
    const nStart = start != null ? start : jd, nEnd = end != null ? end : jd + 0.5;
    const t0 = nStart + 0.5 / 24, t1 = nEnd - 0.5 / 24, stepD = 0.25 / 24;
    const bodies = ["mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "moon"];
    const samples = [];
    for (let t = t0; t <= t1 + 1e-9; t += stepD) {
      const pos = {};
      for (const b of bodies) { const a = S.altAzOf(b, t, loc.lat, loc.lon); pos[b] = { alt: a.alt, az: a.az }; }
      samples.push({ jd: t, sun: S.altAzOf("sun", t, loc.lat, loc.lon).alt, pos });
    }
    const mags = {}, elong = {};
    for (const b of bodies) { const B = S.body(b, jd); mags[b] = B.mag; elong[b] = B.elong; }
    const vis = [];
    for (const b of bodies) {
      if (b === "moon") continue;
      let best = null;
      for (const s of samples) if (s.pos[b].alt > 8 && (!best || s.pos[b].alt > best.alt)) best = { alt: s.pos[b].alt, az: s.pos[b].az, jd: s.jd };
      if (best && elong[b] > 10) vis.push({ b, best, mag: mags[b] });
    }
    vis.sort((a, b) => a.mag - b.mag);
    $("#pchips").innerHTML = vis.length ? vis.map(v => `<span class="pchip" style="--pcol:${PCOL[v.b]}"><i></i><b>${S.BODY_NAMES[v.b]}</b>${v.mag > 6 ? "telescope" : v.mag > 5 ? "binoculars" : "best " + hm(msOf(v.best.jd))} · ${compass(v.best.az)}</span>`).join("")
      : '<span class="pchip">No planets well placed tonight: enjoy the stars</span>';
    panoData = { samples, mags, vis: new Set(vis.map(v => v.b)), mp };
    const slider = $("#pano-t");
    slider.max = Math.max(0, samples.length - 1);
    let idx = samples.findIndex(s => s.jd >= jd);
    if (idx < 0 || jd < t0) idx = Math.min(samples.length - 1, Math.round((1.25 / 24) / stepD));   // ≈ 1¾ h after sunset
    slider.value = idx; slider.dispatchEvent(new Event("input"));

    /* Voyager 1 */
    computeVoyager(true);

    /* Mars light-time */
    const mars = S.body("mars", jd), lt = mars.lightSeconds;
    ticker($("#mars-lt"), lt, v => `${Math.floor(v / 60)} min ${String(Math.floor(v % 60)).padStart(2, "0")} s`);
    $("#mars-sub").textContent = `${mars.au.toFixed(2)} AU away · a radio command sent now lands at ${hm(now + lt * 1000)}`;
    $(".t-mars .photon").style.setProperty("--lt", Math.max(2, Math.min(7, lt / 180)).toFixed(2) + "s");

    /* Coming up */
    const evs = [];
    const fm = nextPhase(jd, 180), nm = nextPhase(jd, 0);
    if (fm) evs.push({ jd: fm, what: "Full Moon" });
    if (nm) evs.push({ jd: nm, what: "New Moon: darkest skies" });
    for (const p of ["mars", "jupiter", "saturn"]) { const e = E.nextEvent(p, jd); if (e && e.jd - jd < 420) evs.push({ jd: e.jd, what: `${S.BODY_NAMES[p]} at opposition` }); }
    const voyJD = S.julianDay(new Date(VOY.refMs)); if (voyJD > jd) evs.push({ jd: voyJD, what: "Voyager 1 one light-day out" });
    evs.sort((a, b) => a.jd - b.jd);
    const first = evs[0];
    if (first) {
      const d = first.jd - jd;
      $("#next-unit").textContent = d < 1.5 ? "hours" : "days";
      ticker($("#next-days"), d < 1.5 ? d * 24 : d, v => Math.round(v));
      $("#next-what").textContent = `${first.what} · ${day(msOf(first.jd))}`;
      $("#next-list").innerHTML = evs.slice(1, 4).map(e => `<li><b>${esc(e.what)}</b><span>${day(msOf(e.jd))}</span></li>`).join("");
    }
    refreshST();
  }

  /* panorama scrubber */
  const slider = $("#pano-t");
  slider.addEventListener("input", () => {
    if (!panoData) return;
    const s = panoData.samples[+slider.value]; if (!s) return;
    drawPano($("#pano"), s, panoData);
    const st = s.sun > -0.83 ? "daylight" : s.sun > -6 ? "civil twilight" : s.sun > -12 ? "twilight" : "dark sky";
    $("#pano-time").textContent = `${hm(msOf(s.jd))} · ${st}`;
    slider.setAttribute("aria-valuetext", $("#pano-time").textContent);
  });

  function drawPano(svg, s, D) {
    const W = 640, H0 = 150, x = az => 320 + (((az - 180 + 540) % 360) - 180) / 360 * W, y = alt => H0 - alt / 90 * 136;
    const dk = Math.max(0, Math.min(1, (-s.sun - 2) / 14));     // 0 = bright twilight, 1 = dark
    const mix = (a, b) => a.map((v, i) => Math.round(v + (b[i] - v) * dk));
    const top = mix([30, 52, 110], [4, 6, 16]), bot = mix([90, 110, 170], [12, 16, 36]);
    let stars = ""; const r = rng(42);
    for (let i = 0; i < 90; i++) stars += `<circle cx="${(r() * W).toFixed(1)}" cy="${(r() * 140).toFixed(1)}" r="${(0.4 + r() * 0.9).toFixed(2)}" fill="#fff" opacity="${(dk * (0.2 + r() * 0.6)).toFixed(2)}"/>`;
    let marks = "";
    ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"].forEach((c, i) => { const xx = i * 80; marks += `<text x="${Math.min(W - 8, Math.max(8, xx))}" y="${H0 + 26}" text-anchor="middle" fill="${c.length === 1 ? "#c3cae6" : "#5d6589"}">${c}</text>`; });
    let dots = "", labels = "";
    const list = ["neptune", "uranus", "mercury", "mars", "saturn", "jupiter", "venus", "moon"], placed = [];
    const items = [];
    for (const b of list) {
      const p = s.pos[b]; if (!p || p.alt < -1) continue;
      if (b !== "moon" && !D.vis.has(b)) continue;
      const X = x(p.az), Y = y(Math.max(0, p.alt)), rr = b === "moon" ? 8 : Math.max(1.8, Math.min(6, 4.2 - 0.62 * D.mags[b]));
      items.push({ b, X, Y, rr });
    }
    items.sort((a, c) => D.mags[a.b] - D.mags[c.b]);          // brightest gets the best label spot
    for (const { b, X, Y, rr } of items) {
      const col = PCOL[b], name = S.BODY_NAMES[b], w = name.length * 6.8 + 4, left = X > W - 80;
      if (b === "moon") dots += `<circle cx="${X.toFixed(1)}" cy="${Y.toFixed(1)}" r="${rr + 7}" fill="#fff8e0" opacity=".12"/><circle cx="${X.toFixed(1)}" cy="${Y.toFixed(1)}" r="${rr}" fill="#1b1e2c"/><path transform="translate(${X.toFixed(1)} ${Y.toFixed(1)}) rotate(${(270 - D.mp.chi).toFixed(1)})" d="M0,${-rr} A${rr},${rr} 0 0 1 0,${rr} A${(Math.abs(1 - 2 * D.mp.illum) * rr).toFixed(2)},${rr} 0 0 ${D.mp.illum > 0.5 ? 1 : 0} 0,${-rr} Z" fill="#f2efe2"/>`;
      else dots += `<circle cx="${X.toFixed(1)}" cy="${Y.toFixed(1)}" r="${(rr * 2.8).toFixed(1)}" fill="${col}" opacity=".14"/><circle cx="${X.toFixed(1)}" cy="${Y.toFixed(1)}" r="${rr.toFixed(1)}" fill="${col}"/>`;
      let lx = left ? X - rr - 5 - w : X + rr + 5, ly = Y + 4;
      for (let tries = 0; tries < 6 && placed.some(q => lx < q.x + q.w && lx + w > q.x && Math.abs(ly - q.y) < 12); tries++) ly += tries % 2 ? -26 : 13;
      ly = Math.max(12, Math.min(H0 - 6, ly));
      placed.push({ x: lx, y: ly, w });
      if (Math.abs(ly - Y - 4) > 6) labels += `<path d="M${X.toFixed(1)} ${Y.toFixed(1)} L${(left ? lx + w : lx).toFixed(1)} ${(ly - 4).toFixed(1)}" stroke="${col}" stroke-opacity=".35"/>`;
      labels += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" fill="${col}">${name}</text>`;
    }
    dots += labels;
    const sunUp = s.sun > -0.83;
    svg.innerHTML = `<defs><linearGradient id="psky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgb(${top})"/><stop offset="1" stop-color="rgb(${bot})"/></linearGradient></defs>
      <rect width="${W}" height="190" fill="url(#psky)"/>${stars}
      ${[30, 60].map(a => `<path d="M0 ${y(a)} H${W}" stroke="rgba(255,255,255,.06)" stroke-dasharray="2 5"/><text x="6" y="${y(a) - 3}" fill="#5d6589">${a}°</text>`).join("")}
      ${dots}
      <path d="M0 ${H0} L0 ${H0 - 4} C60 ${H0 - 9} 110 ${H0 - 2} 170 ${H0 - 6} S280 ${H0 - 3} 330 ${H0 - 7} S460 ${H0 - 2} 520 ${H0 - 8} S600 ${H0 - 3} 640 ${H0 - 5} L640 190 L0 190 Z" fill="#05060c"/>
      <path d="M0 ${H0 - 4} C60 ${H0 - 9} 110 ${H0 - 2} 170 ${H0 - 6} S280 ${H0 - 3} 330 ${H0 - 7} S460 ${H0 - 2} 520 ${H0 - 8} S600 ${H0 - 3} 640 ${H0 - 5}" fill="none" stroke="rgba(124,200,255,.35)"/>
      ${marks}${sunUp ? `<text x="320" y="70" text-anchor="middle" fill="#fff" opacity=".8">The Sun is up: slide into the night →</text>` : ""}`;
  }

  function drawSunArc(svg, isDay, f) {
    f = Math.max(0, Math.min(1, f));
    const q = (t, a, b, c) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c;
    const X = isDay ? q(f, 14, 100, 186) : q(f, 186, 100, 14), Y = isDay ? q(f, 66, -22, 66) : q(f, 66, 110, 66);
    svg.innerHTML = `<defs><radialGradient id="sglow"><stop offset="0" stop-color="#fff3c4"/><stop offset=".4" stop-color="#ffc24b"/><stop offset="1" stop-color="rgba(255,194,75,0)"/></radialGradient></defs>
      <path d="M14 66 Q100 -22 186 66" fill="none" stroke="rgba(255,194,75,.45)" stroke-width="1.5"/>
      <path d="M186 66 Q100 110 14 66" fill="none" stroke="rgba(124,200,255,.3)" stroke-width="1.2" stroke-dasharray="3 4"/>
      <path d="M2 66 H198" stroke="rgba(233,237,255,.35)"/>
      <circle cx="${X.toFixed(1)}" cy="${Y.toFixed(1)}" r="${isDay ? 16 : 11}" fill="url(#sglow)" opacity="${isDay ? 1 : 0.45}"/>
      <circle cx="${X.toFixed(1)}" cy="${Y.toFixed(1)}" r="${isDay ? 5.5 : 4}" fill="${isDay ? "#fff6d0" : "#8a7a50"}"/>`;
  }

  let voyTimer = 0;
  function computeVoyager(first) {
    const km = t => VOY.refAU * E.AU_KM + VOY.kms * (t - VOY.refMs) / 1000;
    const k0 = km(Date.now()), au = k0 / E.AU_KM, el = $("#voy-km");
    if (first) {
      ticker(el, k0, int, 1.8);
      $("#voy-fill").style.width = Math.min(100, au / VOY.refAU * 100).toFixed(1) + "%";
      const dd = (VOY.refMs - Date.now()) / 864e5;
      $("#voy-sub").textContent = `${(k0 / E.C_KM_S / 3600).toFixed(2)} light-hours · ${au.toFixed(1)} AU · ` + (dd > 0 ? `one light-day in ${Math.ceil(dd)} days` : "past one light-day");
      clearInterval(voyTimer);
      setTimeout(() => { voyTimer = setInterval(() => { el._v = km(Date.now()); el.textContent = int(el._v); }, 100); }, RM ? 0 : 1900);
    }
  }

  compute();
  setInterval(compute, 5 * 60 * 1000);

  const gb = $("#geo-btn");
  gb.addEventListener("click", () => {
    if (!navigator.geolocation) { gb.firstElementChild.textContent = "Location isn't available here"; return; }
    gb.firstElementChild.textContent = "📍 Locating…";
    navigator.geolocation.getCurrentPosition(p => {
      const { latitude: la, longitude: lo } = p.coords;
      loc = { lat: la, lon: lo, tz: undefined, name: `your location (${la.toFixed(1)}°, ${lo.toFixed(1)}°)` };
      gb.firstElementChild.textContent = "📍 Using your location"; compute();
    }, () => { gb.firstElementChild.textContent = "📍 No permission: showing Los Angeles"; }, { timeout: 12000, maximumAge: 600000 });
  });
}

/* =========================================================================
   3. Powers-of-ten teaser. Sizes are the ones in data/scale.json.
   ========================================================================= */
const ZSTOPS = [
  { id: "proton", p: Math.log10(1.681e-15), name: "Proton", what: "1.7 femtometres across", fact: "Protons and neutrons carry 99.9% of your mass, yet fill almost none of your volume.", major: 1 },
  { id: "hydrogen", p: Math.log10(1.058e-10), name: "Hydrogen atom", what: "0.1 nanometres across", fact: "Its nucleus is 60,000 times smaller than the atom. The rest is a haze of electron." },
  { id: "virus", p: -7, name: "A virus", what: "100 nanometres across", fact: "Smaller than a wavelength of visible light, so no ordinary microscope can see it." },
  { id: "rbc", p: Math.log10(7.8e-6), name: "Red blood cell", what: "7.8 micrometres across", fact: "You carry about 25 trillion. In a line they would wrap Earth nearly five times." },
  { id: "ant", p: Math.log10(0.005), name: "Garden ant", what: "5 millimetres long", fact: "The first stop you can see with your own eyes." },
  { id: "human", p: Math.log10(1.7), name: "You", what: "about 1.7 metres tall", fact: "Made of atoms forged inside stars that died before the Sun was born.", major: 1 },
  { id: "saturnv", p: Math.log10(110.6), name: "Saturn V", what: "110.6 metres tall", fact: "Apollo's Moon rocket stood taller than the Statue of Liberty." },
  { id: "everest", p: Math.log10(8848.86), name: "Mount Everest", what: "8,849 metres high", fact: "Airliners cruise only a couple of kilometres higher." },
  { id: "earth", p: Math.log10(12742000), name: "Earth", what: "12,742 km across", fact: "All the air you will ever breathe is a skin less than 1% as thick as the planet.", major: 1 },
  { id: "sun", p: Math.log10(1.3914e9), name: "The Sun", what: "1.39 million km across", fact: "109 Earths side by side. Its light takes 8 min 19 s to reach you.", major: 1 },
  { id: "neptune", p: Math.log10(2 * 4.4984e12), name: "The planets", what: "Neptune's orbit: 60 AU across", fact: "Sunlight needs more than four hours to reach Neptune." },
  { id: "lightyear", p: Math.log10(9.4607e15), name: "One light-year", what: "9.46 trillion km", fact: "Even Voyager 1, our farthest probe, has covered less than 0.3% of it." },
  { id: "milkyway", p: Math.log10(9.46e20), name: "Milky Way", what: "about 100,000 light-years across", fact: "A few hundred billion stars. The Sun takes 230 million years to orbit it once.", major: 1 },
  { id: "localgroup", p: Math.log10(9.46e22), name: "Local Group", what: "about 10 million light-years across", fact: "The Milky Way, Andromeda and some 80 smaller galaxies, falling together." },
  { id: "universe", p: Math.log10(8.8e26), name: "Observable universe", what: "about 93 billion light-years across", fact: "Light from its edge set out 13.8 billion years ago.", major: 1 }
];
const ZMIN = -15, ZMAX = 27;
const ZI = {
  proton: `<circle r="40" fill="rgba(255,79,154,.10)" stroke="rgba(255,79,154,.5)"/><path d="M-14 -8 Q0 -22 14 -8 M14 -8 Q18 10 0 16 M0 16 Q-18 10 -14 -8" fill="none" stroke="#fff" stroke-opacity=".35" stroke-dasharray="2 3"/><circle cx="-14" cy="-8" r="9" fill="#ff5a7a"/><circle cx="14" cy="-8" r="9" fill="#4ef0b8"/><circle cx="0" cy="16" r="9" fill="#5a8cff"/>`,
  hydrogen: `<circle r="44" fill="url(#zcloud)"/><ellipse rx="36" ry="14" fill="none" stroke="#7cc8ff" stroke-opacity=".6" transform="rotate(-30)"/><circle r="3.5" fill="#ff7a3d"/><circle cx="31" cy="-18" r="3" fill="#bfe3ff"/>`,
  virus: `<g stroke="#4ef0b8" stroke-width="2.5">${Array.from({ length: 14 }, (_, i) => { const a = i / 14 * 6.2832; return `<line x1="${(Math.cos(a) * 26).toFixed(1)}" y1="${(Math.sin(a) * 26).toFixed(1)}" x2="${(Math.cos(a) * 38).toFixed(1)}" y2="${(Math.sin(a) * 38).toFixed(1)}"/><circle cx="${(Math.cos(a) * 40).toFixed(1)}" cy="${(Math.sin(a) * 40).toFixed(1)}" r="3.4" fill="#4ef0b8" stroke="none"/>`; }).join("")}</g><circle r="27" fill="#0f5a48" stroke="#4ef0b8" stroke-width="2"/><path d="M-12 -6 q6 -8 12 0 t12 0 M-14 8 q6 -8 12 0 t12 0" fill="none" stroke="#9ff5d8" stroke-width="1.5"/>`,
  rbc: `<ellipse rx="42" ry="36" fill="#c8243a"/><ellipse rx="22" ry="18" fill="#8e1426"/><ellipse cx="-12" cy="-14" rx="16" ry="8" fill="#ff7a8a" opacity=".45"/>`,
  ant: `<g fill="#2b1a12" stroke="#7a4a2a" stroke-width="1.5"><ellipse cx="-26" cy="4" rx="16" ry="11"/><ellipse cx="0" cy="0" rx="9" ry="7"/><ellipse cx="20" cy="-4" rx="10" ry="9"/></g><g stroke="#7a4a2a" stroke-width="2" fill="none"><path d="M-4 4 L-16 22 M0 5 L0 26 M4 4 L16 22 M-4 -3 L-14 -20 M4 -3 L14 -20 M26 -10 Q34 -28 44 -26 M24 -12 Q26 -30 36 -34"/></g>`,
  human: `<g fill="#e9edff"><circle cy="-38" r="8"/><path d="M-11 -27 H11 L14 8 H7 L6 44 H-6 L-7 8 H-14 Z"/></g><path d="M-30 46 H30" stroke="#7cc8ff" stroke-opacity=".5"/>`,
  saturnv: `<g><path d="M0 -48 L-4 -38 V-30 H4 V-38 Z" fill="#e9edff"/><rect x="-6" y="-30" width="12" height="22" fill="#f4f4f4"/><rect x="-7" y="-8" width="14" height="22" fill="#f4f4f4"/><rect x="-8" y="14" width="16" height="30" fill="#f4f4f4"/><rect x="-8" y="20" width="16" height="4" fill="#111"/><rect x="-7" y="-2" width="14" height="3" fill="#111"/><path d="M-8 40 L-13 48 H13 L8 40 Z" fill="#9aa"/><path d="M-6 48 L-4 58 M0 48 V60 M6 48 L4 58" stroke="#ff7a3d" stroke-width="3" opacity=".8"/></g>`,
  everest: `<path d="M-48 40 L-12 -30 L0 -18 L10 -40 L48 40 Z" fill="#46506e"/><path d="M-12 -30 L-4 -14 L0 -18 L4 -8 L10 -40 L-1 -26 Z M10 -40 L20 -18 L14 -20 L10 -12 Z" fill="#f2f6ff"/><path d="M-48 40 H48" stroke="#7cc8ff" stroke-opacity=".4"/>`,
  earth: `<circle r="44" fill="#1f5fd1"/><path d="M-30 -20 q10 -12 22 -6 q6 10 -4 16 q-8 8 -2 18 q-12 4 -18 -8 q-8 -8 2 -20 Z M8 -34 q18 2 24 16 q-6 4 -14 0 q-8 -6 -10 -16 Z M14 6 q14 -4 20 8 q-2 16 -14 22 q-8 -12 -6 -30 Z" fill="#4fae6e"/><circle r="44" fill="none" stroke="#9fd4ff" stroke-width="3" opacity=".6"/><path d="M-44 0 A44 44 0 0 0 44 0 A44 30 0 0 1 -44 0" fill="#000" opacity=".25"/>`,
  sun: `<circle r="60" fill="url(#zsun)"/><circle r="40" fill="#ffcf5a"/><circle r="40" fill="url(#zgran)" opacity=".5"/><circle cx="12" cy="-10" r="3" fill="#a8520e" opacity=".7"/><circle cx="-16" cy="14" r="2" fill="#a8520e" opacity=".6"/>`,
  neptune: `${[10, 16, 22, 30, 50, 66, 78, 90].map((r, i) => `<ellipse rx="${r * 0.52}" ry="${r * 0.4}" fill="none" stroke="rgba(124,200,255,${i > 3 ? 0.35 : 0.5})"/><circle cx="${(Math.cos(i * 1.7) * r * 0.52).toFixed(1)}" cy="${(Math.sin(i * 1.7) * r * 0.4).toFixed(1)}" r="${[1.5, 2, 2, 1.6, 4, 3.6, 2.6, 2.6][i]}" fill="${["#c9c3b8", "#fff6d8", "#7cc8ff", "#ff8a5c", "#ffe2b8", "#ffd27a", "#9ff0ff", "#7aa6ff"][i]}"/>`).join("")}<circle r="3.5" fill="#ffc24b"/>`,
  lightyear: `<circle cx="-44" r="7" fill="#ffc24b"/><circle cx="-44" r="14" fill="#ffc24b" opacity=".2"/><path d="M-34 0 H44" stroke="#7cc8ff" stroke-width="1.5" stroke-dasharray="3 3"/><path d="M-34 -10 V10 M44 -10 V10" stroke="#7cc8ff"/><circle cx="44" r="2" fill="#fff"/><text y="-16" text-anchor="middle" fill="#bfe3ff" font-family="JetBrains Mono, monospace" font-size="11">1 light-year</text>`,
  milkyway: "", localgroup: "", universe: ""
};
function zIcons() {
  ZI.milkyway = spiralSVG(0, 0, 46, 0.6, "#8fb8ff", 5, 0.55).replace(/url\(#phb\)/g, "url(#zblur)");
  ZI.localgroup = (spiralSVG(-18, -8, 22, 0.2, "#8fb8ff", 3, 0.5) + spiralSVG(22, 12, 26, 2.2, "#ffb3d9", 9, 0.7)).replace(/url\(#phb\)/g, "url(#zblur)") +
    [[-40, 26, 3], [36, -26, 3.5], [-4, 34, 2.5], [44, 36, 2], [-44, -30, 2.2], [8, -38, 2]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#dbe9ff" opacity=".7"/>`).join("");
  const r = rng(99), P = [];
  for (let i = 0; i < 46; i++) { const a = r() * 6.2832, d = Math.sqrt(r()) * 46; P.push([Math.cos(a) * d, Math.sin(a) * d]); }
  let web = "";
  P.forEach((p, i) => { P.slice(i + 1).forEach(q => { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < 15) web += `<path d="M${p[0].toFixed(1)} ${p[1].toFixed(1)} L${q[0].toFixed(1)} ${q[1].toFixed(1)}" stroke="#b18cff" stroke-opacity="${(0.7 - d / 25).toFixed(2)}"/>`; }); });
  ZI.universe = `<circle r="48" fill="rgba(177,140,255,.06)" stroke="rgba(177,140,255,.35)"/>${web}${P.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="1.6" fill="#ffd9ef"/>`).join("")}`;
}

function zoomTeaser() {
  const stage = $("#zoom-stage"), track = $("#zoom-track"); if (!stage || !track) return;
  zIcons();
  const defs = `<defs><radialGradient id="zcloud"><stop offset="0" stop-color="rgba(124,200,255,.5)"/><stop offset="1" stop-color="rgba(124,200,255,0)"/></radialGradient>
    <radialGradient id="zsun"><stop offset=".6" stop-color="rgba(255,160,40,.55)"/><stop offset="1" stop-color="rgba(255,120,20,0)"/></radialGradient>
    <radialGradient id="zgran" cx="40%" cy="40%"><stop offset="0" stop-color="#fff7d6"/><stop offset="1" stop-color="#ff7a1f"/></radialGradient>
    <filter id="zblur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter></defs>`;
  stage.insertAdjacentHTML("beforeend", ZSTOPS.map((s, i) => `<div class="zicon" data-i="${i}"><svg viewBox="-60 -60 120 120">${i ? "" : defs}${ZI[s.id]}</svg></div>`).join(""));
  const icons = $$(".zicon", stage), rings = $("#zoom-rings");
  rings.innerHTML = Array.from({ length: 7 }, () => "<span></span>").join("");
  const ringEls = $$("span", rings);
  // ticks and labels
  const ticks = $("#zt-ticks"); let th = "";
  for (let p = ZMIN; p <= ZMAX; p++) th += `<i class="${p % 5 === 0 ? "maj" : ""}" style="left:${(p - ZMIN) / (ZMAX - ZMIN) * 100}%"></i>`;
  let mj = 0;
  ZSTOPS.forEach((s, i) => { const cls = [s.major ? (mj++ % 2 ? "mlo" : "") : "minor", i % 2 ? "lo" : "", i === 0 ? "first" : "", i === ZSTOPS.length - 1 ? "last" : ""].join(" ");
    th += `<button type="button" tabindex="-1" data-i="${i}" class="${cls}" style="left:${(s.p - ZMIN) / (ZMAX - ZMIN) * 100}%">${s.name.replace("Observable universe", "Universe").replace("The planets", "Planets")}</button>`; });
  ticks.innerHTML = th;
  const thumb = $("#zt-thumb"), fill = $("#zt-fill"), pow = $("#zoom-pow"), nm = $("#zoom-name"), wt = $("#zoom-what"), fact = $("#zoom-fact"), goA = $("#zoom-go");
  const state = { p: ZSTOPS[5].p }; let shown = -1;
  const sup = n => String(n).replace("-", "−");

  function draw() {
    const p = state.p, f = (p - ZMIN) / (ZMAX - ZMIN);
    thumb.style.left = f * 100 + "%"; fill.style.width = f * 100 + "%";
    // bracketing stops
    let a = 0; while (a < ZSTOPS.length - 2 && ZSTOPS[a + 1].p <= p) a++;
    const A = ZSTOPS[a], B = ZSTOPS[a + 1];
    const t = Math.max(0, Math.min(1, (p - A.p) / (B.p - A.p)));
    const sm = x => x * x * (3 - 2 * x), e = sm(Math.max(0, Math.min(1, (t - 0.2) / 0.6)));
    icons.forEach((el, i) => {
      let o = 0, sc = 1;
      if (i === a) { o = 1 - e; sc = Math.pow(10, -t * 1.3); }
      else if (i === a + 1) { o = e; sc = Math.pow(10, (1 - t) * 1.3); }
      else if (p < ZSTOPS[0].p && i === 0) { o = 1; }
      el.style.opacity = o.toFixed(3);
      el.style.transform = o > 0.001 ? `scale(${sc.toFixed(4)})` : "scale(0)";
      el.style.filter = o > 0.001 && sc > 2.5 ? `blur(${Math.min(6, (sc - 2.5) * 0.5).toFixed(1)}px)` : "none";
    });
    const fr = p - Math.floor(p);
    ringEls.forEach((el, k) => { const d = 60 * Math.pow(10, (k - 2 - fr) * 0.33); el.style.width = el.style.height = d.toFixed(1) + "px"; el.style.opacity = Math.max(0, Math.min(0.9, 1.4 - d / 420)).toFixed(2); });
    const near = t < 0.5 ? a : a + 1;
    pow.innerHTML = `10<sup>${sup(Math.round(p))}</sup> m`;
    if (near !== shown) {
      shown = near; const s = ZSTOPS[near];
      nm.textContent = s.name; wt.textContent = s.what; fact.textContent = s.fact;
      $$("button", ticks).forEach(b => b.classList.toggle("on", +b.dataset.i === near));
      if (G && !RM) G.fromTo([nm, wt, fact], { y: 8, opacity: 0.2 }, { y: 0, opacity: 1, duration: 0.35, stagger: 0.04, overwrite: true });
    }
    const s = ZSTOPS[near], close = Math.abs(p - s.p) < 0.45;
    goA.href = "scale.html#" + (close ? s.id : "1e" + Math.round(p));
    const supN = n => String(n).replace(/[-0-9]/g, c => "⁻⁰¹²³⁴⁵⁶⁷⁸⁹"["-0123456789".indexOf(c)]);
    goA.firstElementChild.textContent = close ? `Fly to ${s.name} in Cosmic scale →` : `Fly to 10${supN(Math.round(p))} m in Cosmic scale →`;
    track.setAttribute("aria-valuenow", Math.round(p));
    track.setAttribute("aria-valuetext", `${s.name}, ${s.what}`);
  }
  let anim = null, goal = null;
  function to(p, dur = 0.7) {
    p = Math.max(ZMIN, Math.min(ZMAX, p)); goal = p;
    if (anim) anim.kill();
    if (!G || RM) { state.p = p; draw(); return; }
    anim = G.to(state, { p, duration: dur, ease: "power3.out", onUpdate: draw });
  }
  const nearest = p => ZSTOPS.reduce((b, s, i) => (Math.abs(s.p - p) < Math.abs(ZSTOPS[b].p - p) ? i : b), 0);
  const pFromX = x => { const r = track.getBoundingClientRect(); return ZMIN + Math.max(0, Math.min(1, (x - r.left) / r.width)) * (ZMAX - ZMIN); };
  let drag = false, userTouched = false, demo = null;
  const touched = () => { userTouched = true; track.classList.add("used"); if (demo) { demo.kill(); demo = null; } };
  track.addEventListener("pointerdown", e => {
    const btn = e.target.closest("button");
    touched();
    if (btn) { to(ZSTOPS[+btn.dataset.i].p); return; }
    drag = true; track.setPointerCapture(e.pointerId); if (anim) anim.kill();
    to(pFromX(e.clientX), 0.25);
  });
  track.addEventListener("pointermove", e => { if (!drag) return; if (anim) anim.kill(); state.p = pFromX(e.clientX); draw(); });
  const end = () => { if (!drag) return; drag = false; to(ZSTOPS[nearest(state.p)].p, 0.6); };
  track.addEventListener("pointerup", end); track.addEventListener("pointercancel", end);
  track.addEventListener("keydown", e => {
    const i = nearest(anim && anim.isActive() && goal != null ? goal : state.p);
    let j = null;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") j = Math.min(ZSTOPS.length - 1, i + 1);
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") j = Math.max(0, i - 1);
    if (e.key === "Home") j = 0; if (e.key === "End") j = ZSTOPS.length - 1;
    if (e.key === "Enter") { location.href = goA.href; return; }
    if (j != null) { e.preventDefault(); touched(); to(ZSTOPS[j].p); }
  });
  draw();
  // one-time "zoom out and back" demo when it first scrolls into view
  if (G && !RM && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(es => {
      if (!es[0].isIntersecting) return; io.disconnect();
      if (userTouched) return;
      demo = G.timeline({ delay: 0.5 })
        .to(state, { p: ZSTOPS[8].p, duration: 1.8, ease: "power2.inOut", onUpdate: draw })
        .to(state, { p: ZSTOPS[5].p, duration: 1.4, ease: "power2.inOut", onUpdate: draw }, "+=0.5");
    }, { threshold: 0.6 });
    io.observe(track);
  }
}

/* =========================================================================
   4. Atlas fly-through: every page, grouped Fly / Explore / Learn / Build.
   Pinned horizontal gallery on desktop, stacked grid on phones.
   ========================================================================= */
const GROUPS = [
  { g: "Fly", c: "var(--flame)", blurb: "Launch, land, and land again." },
  { g: "Explore", c: "var(--ice)", blurb: "From low Earth orbit to the edge of the universe." },
  { g: "Learn", c: "var(--nebula)", blurb: "The maths, the pictures, the history, the paperwork." },
  { g: "Build", c: "var(--sol)", blurb: "From the kitchen table to your own flight computer." }
];
function atlas() {
  const sec = $("#atlas"), track = $("#atlas-track"), nav = $("#atlas-groups"); if (!sec || !track) return;
  const extra = { Build: [
    { id: "toolkit", title: "Python toolkit", href: "#compute", desc: "Seven astrodynamics simulations with tests", img: "assets/img/sims/porkchop_earth_mars.jpg" },
    { id: "github", title: "Fork it on GitHub", href: window.Codex ? Codex.repo : "#", desc: "MIT-licensed code, CAD, PCBs and data", img: "assets/img/sims/nbody_figure8.jpg" }] };
  track.innerHTML = GROUPS.map((G_, gi) => {
    const items = (window.Codex ? Codex.pages : []).filter(p => p[3] === G_.g).map(p => page(p[0])).concat(extra[G_.g] || []);
    return `<div class="agroup" data-g="${gi}" style="--c:${G_.c}">
      <div class="agroup-head"><span class="gnum">0${gi + 1} · ${items.length} ${items.length === 1 ? "page" : "stops"}</span><h3>${G_.g}</h3><p>${G_.blurb}</p></div>
      <div class="agroup-cards">${items.map(p => `<a class="card spot acard" href="${p.href}">${mediaHTML(p, p.title)}${p.isNew ? '<span class="chip aurora new">new</span>' : ""}
        <div class="ab"><h4>${esc(p.title)}</h4><p>${esc(p.desc)}</p></div><span class="go" aria-hidden="true">→</span></a>`).join("")}</div></div>`;
  }).join("");
  guardImgs(track);
  nav.innerHTML = GROUPS.map((g, i) => `<button type="button" data-g="${i}" style="--c:${g.c}"><i></i>${g.g}</button>`).join("");
  const chips = $$("button", nav), groups = $$(".agroup", track);
  const setOn = i => chips.forEach((c, k) => c.classList.toggle("on", k === i));
  setOn(0);

  let st = null;
  chips.forEach((c, i) => c.addEventListener("click", () => {
    setOn(i);
    if (st && sec.classList.contains("h")) {
      const pad = parseFloat(getComputedStyle(track).paddingLeft) || 0;
      const dist = Math.max(1, track.scrollWidth - innerWidth);
      const x = Math.min(dist, Math.max(0, groups[i].offsetLeft - pad));
      scrollTo({ top: st.start + (x / dist) * (st.end - st.start) + 2, behavior: RM ? "auto" : "smooth" });
    } else groups[i].scrollIntoView({ behavior: RM ? "auto" : "smooth", block: "start" });
  }));

  if (!G || !ST) return;
  const mm = G.matchMedia();
  mm.add("(min-width: 900px) and (min-height: 560px) and (prefers-reduced-motion: no-preference)", () => {
    sec.classList.add("h"); $("#atlas-title").textContent = "Twenty-two pages, one swipe";
    const dist = () => Math.max(0, track.scrollWidth - innerWidth);
    const bar = $("#atlas-bar");
    const tw = G.to(track, { x: () => -dist(), ease: "none", scrollTrigger: {
      trigger: "#atlas-pin", pin: true, start: "top top", end: () => "+=" + dist(), scrub: 0.6, invalidateOnRefresh: true, anticipatePin: 1,
      onUpdate: self => {
        G.set(bar, { scaleX: self.progress });
        const x = self.progress * dist() + innerWidth * 0.45; let on = 0;
        groups.forEach((g, i) => { if (g.offsetLeft <= x) on = i; });
        setOn(on);
      } } });
    st = tw.scrollTrigger;
    // cards drift in from the right and their pictures parallax inside the frame
    $$(".acard", track).forEach(card => {
      G.fromTo(card, { opacity: 0.35, scale: 0.88, y: 24 }, { opacity: 1, scale: 1, y: 0, ease: "power2.out",
        scrollTrigger: { trigger: card, containerAnimation: tw, start: "left 100%", end: "left 68%", scrub: true } });
      const img = $(".media img", card) || $(".media .ph", card);
      if (img) G.fromTo(img, { xPercent: -7, scale: 1.16 }, { xPercent: 7, scale: 1.16, ease: "none", scrollTrigger: { trigger: card, containerAnimation: tw, start: "left right", end: "right left", scrub: true } });
    });
    $$(".agroup-head", track).forEach(h => G.from(h.children, { y: 30, opacity: 0, stagger: 0.08, ease: "power2.out",
      scrollTrigger: { trigger: h, containerAnimation: tw, start: "left 90%", end: "left 55%", scrub: true } }));
    return () => { sec.classList.remove("h"); st = null; $("#atlas-title").textContent = "Twenty-two pages at a glance"; };
  });
}

/* =========================================================================
   6. Polish: 3D tilt, magnetic buttons, hero glow, section dots
   ========================================================================= */
function tiltify(root = document) {
  if (!FINE || RM || !G) return;
  $$("a.card.spot", root).forEach(el => {
    if (el._tilt || el.closest(".atlas-track.no-tilt")) return;
    el._tilt = true; el.classList.add("tilt");
    const rx = G.quickTo(el, "rotationX", { duration: 0.5, ease: "power3.out" }), ry = G.quickTo(el, "rotationY", { duration: 0.5, ease: "power3.out" });
    el.addEventListener("pointerenter", () => {
      if (el.classList.contains("reveal") && !el.classList.contains("in")) return;
      el.style.transition = "border-color .25s"; G.set(el, { transformPerspective: 900 });
    });
    el.addEventListener("pointermove", e => {
      if (el.style.transition === "") return;
      const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      const k = r.width > 520 ? 3.5 : 7;
      rx(-y * k); ry(x * k);
    });
    el.addEventListener("pointerleave", () => { rx(0); ry(0); });
  });
}
function magnetize(root = document) {
  if (!FINE || RM || !G) return;
  $$(".magnetic", root).forEach(el => {
    if (el._mag) return; el._mag = true;
    const inner = el.firstElementChild;
    const x = G.quickTo(el, "x", { duration: 0.5, ease: "elastic.out(1, .5)" }), y = G.quickTo(el, "y", { duration: 0.5, ease: "elastic.out(1, .5)" });
    const ix = inner ? G.quickTo(inner, "x", { duration: 0.5, ease: "power3.out" }) : null, iy = inner ? G.quickTo(inner, "y", { duration: 0.5, ease: "power3.out" }) : null;
    el.addEventListener("pointermove", e => {
      const r = el.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      x(dx * 0.28); y(dy * 0.4); if (ix) { ix(dx * 0.12); iy(dy * 0.16); }
    });
    el.addEventListener("pointerleave", () => { x(0); y(0); if (ix) { ix(0); iy(0); } });
  });
}
function heroGlow() {
  const hero = $(".hero"), glow = $(".hero-glow"); if (!hero || !glow || !FINE || RM || !G) return;
  const x = G.quickTo(glow, "x", { duration: 0.8, ease: "power3.out" }), y = G.quickTo(glow, "y", { duration: 0.8, ease: "power3.out" });
  G.set(glow, { x: innerWidth * 0.3, y: innerHeight * 0.5 });
  hero.addEventListener("pointermove", e => { const r = hero.getBoundingClientRect(); x(e.clientX - r.left); y(e.clientY - r.top); });
}
function sectionDots() {
  const nav = $("#sec-dots"); if (!nav) return;
  const secs = [["top", "Top"], ["start", "Start here"], ["now", "Right now"], ["zoom", "Powers of ten"], ["atlas", "The whole atlas"], ["fly", "01 · Fly it"], ["explore", "02 · Explore it"], ["learn", "03 · Learn it"], ["build", "04 · Build it"], ["compute", "05 · Compute it"]]
    .map(([id, label]) => ({ id, label, el: document.getElementById(id) })).filter(s => s.el);
  nav.innerHTML = secs.map(s => `<button type="button" aria-label="${esc(s.label)}"><span>${esc(s.label)}</span></button>`).join("");
  const btns = $$("button", nav);
  const target = s => { const sp = s.el.closest(".pin-spacer"); return (sp || s.el).getBoundingClientRect().top + scrollY - (s.id === "top" ? 0 : 10); };
  btns.forEach((b, i) => b.addEventListener("click", () => scrollTo({ top: Math.max(0, target(secs[i]) - (secs[i].id === "atlas" ? 0 : 50)), behavior: RM ? "auto" : "smooth" })));
  let cur = -1, raf = 0;
  const upd = () => {
    raf = 0;
    nav.classList.toggle("show", scrollY > innerHeight * 0.5);
    let on = 0; const line = innerHeight * 0.45;
    secs.forEach((s, i) => { const sp = s.el.closest(".pin-spacer") || s.el; if (sp.getBoundingClientRect().top <= line) on = i; });
    if (on !== cur) { cur = on; btns.forEach((b, i) => { b.classList.toggle("on", i === on); if (i === on) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current"); }); }
  };
  addEventListener("scroll", () => { if (!raf) raf = requestAnimationFrame(upd); }, { passive: true });
  addEventListener("resize", upd); upd();
}

/* =========================================================================
   Boot
   ========================================================================= */
function safe(fn, ...a) { try { return fn(...a); } catch (e) { console.warn(fn.name, e); } }
fillPlaceholders(); guardImgs(document);
safe(galaxy, document.getElementById("galaxy"));
safe(rocketEquation);
milestones().then(refreshST, () => {});
safe(chooser);
safe(rightNow);
safe(zoomTeaser);
safe(atlas);
safe(tiltify); safe(magnetize); safe(heroGlow); safe(sectionDots);
addEventListener("load", refreshST);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(refreshST, () => {});
