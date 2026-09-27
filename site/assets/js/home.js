/* Landing page: live spiral galaxy hero, rocket-equation mini calculator and
 * the milestone marquee. */
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

galaxy(document.getElementById("galaxy"));
rocketEquation();
milestones();
