/* Cosmic Codex: Solar System orrery (solar-system.html).
 *
 * Positions: ./ephemeris.js (JPL / Standish Table 1 Keplerian elements,
 * Kepler's equation by Newton iteration). Physical data: data/planets.json
 * (NASA Planetary Fact Sheet). Surfaces: procedural textures baked once on
 * the GPU (./solar-system-shaders.js). Scene units: in "true scale" mode
 * 1 AU = 1000 units and bodies have their real radii; in "readable" mode the
 * heliocentric distance r (AU) is drawn at 28 * r^0.5 and radii are enlarged.
 * The two modes are blended in log space so the switch animates smoothly.
 * A floating origin keeps the focused body at (0,0,0) for float precision.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as EPH from "./ephemeris.js";
import * as SH from "./solar-system-shaders.js";

const gsap = window.gsap;
// Camera flights are driven by wall-clock time: on a slow device skip ahead
// rather than slow down (GSAP's default lag smoothing would stretch them).
gsap.ticker.lagSmoothing(0);
const Codex = window.Codex || { reducedMotion: false, webgl: () => true, noGL() {} };
const $ = (s) => document.querySelector(s);
const phoneMQ = matchMedia("(max-width: 820px)");
const REDUCE = !!Codex.reducedMotion;
const BENCH = /bench/.test(location.search);

/* ------------------------------------------------------------ constants --- */
const AU_KM = EPH.AU_KM;
const TRUE_AU = 1000;                         // scene units per AU, true scale
const READ_A = 28, READ_P = 0.5;              // readable: r' = 28 r^0.5
const readR = (km) => 1.1 * Math.pow(km / 6378, 0.42);
const kmToTrue = (km) => km / AU_KM * TRUE_AU;
// moons keep a gentler exaggeration relative to their planet
const moonReadR = (km, parentKm, parentR) => parentR * Math.pow(km / parentKm, 0.72);
const MIN_MS = EPH.jdToMs(EPH.TABLE1_VALID.fromJD), MAX_MS = EPH.jdToMs(EPH.TABLE1_VALID.toJD);
const DAY_MS = 86400000;
const SPEEDS = [
  [1, "Real time"], [60, "1 min / s"], [3600, "1 hour / s"], [21600, "6 hours / s"],
  [86400, "1 day / s"], [604800, "1 week / s"], [2629746, "1 month / s"], [31556952, "1 year / s"]
];
const PLANETS8 = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"];
const TEX_TYPE = { mercury: 0, venus: 1, earth: 2, mars: 4, jupiter: 5, saturn: 6, uranus: 7, neptune: 8, pluto: 9, ceres: 10, moon: 11, io: 12, europa: 13, ganymede: 14, callisto: 15 };
const ATMOS = {
  earth:   { c: [0.35, 0.62, 1.0], k: 1.25, shell: 1.035 },
  venus:   { c: [1.0, 0.86, 0.58], k: 0.9, shell: 1.04 },
  mars:    { c: [1.0, 0.58, 0.38], k: 0.45, shell: 1.02 },
  jupiter: { c: [1.0, 0.9, 0.76], k: 0.35, shell: 1.02 },
  saturn:  { c: [1.0, 0.9, 0.7], k: 0.35, shell: 1.02 },
  uranus:  { c: [0.6, 0.92, 1.0], k: 0.6, shell: 1.03 },
  neptune: { c: [0.45, 0.66, 1.0], k: 0.7, shell: 1.03 },
  pluto:   { c: [0.55, 0.7, 1.0], k: 0.25, shell: 1.03 }
};
const GAL_EXTRA = {
  io:       { fact: "The most volcanically active world known: tidal flexing by Jupiter powers more than 400 active volcanoes.", missions: ["Galileo (orbiter, 1995 to 2003)", "Juno (close flybys, 2023 to 2024)"] },
  europa:   { fact: "An ice shell over a global salt-water ocean holding perhaps twice the water of Earth's oceans.", missions: ["Galileo (orbiter, 1995 to 2003)", "Juno (flyby, 2022)", "Europa Clipper (arriving 2030)"] },
  ganymede: { fact: "The largest moon in the Solar System, bigger than Mercury, and the only moon with its own magnetic field.", missions: ["Galileo (orbiter, 1995 to 2003)", "Juno (flyby, 2021)", "JUICE (arriving 2031)"] },
  callisto: { fact: "One of the most heavily cratered surfaces known; its ancient crust has barely changed in 4 billion years.", missions: ["Galileo (orbiter, 1995 to 2003)", "JUICE (planned flybys)"] }
};

/* ------------------------------------------------------------- helpers --- */
const lerp = (a, b, t) => a + (b - a) * t;
const mixLog = (a, b, t) => Math.exp(lerp(Math.log(a), Math.log(b), t));
const eclToScene = (v, out) => out.set(v.x, v.z, -v.y);
const nf = (v, d = 0) => v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
const SUP = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
function sci(v, d = 2) {
  const e = Math.floor(Math.log10(Math.abs(v)));
  const m = v / Math.pow(10, e);
  return `${m.toFixed(d)} × 10${String(e).split("").map((c) => SUP[c]).join("")}`;
}
function fmtKm(km) {
  if (km >= 1e9) return `${(km / 1e9).toFixed(2)} billion km`;
  if (km >= 1e6) return `${(km / 1e6).toFixed(km >= 1e8 ? 0 : 1)} million km`;
  return `${nf(km)} km`;
}
function fmtLight(s) {
  if (s < 60) return `${s.toFixed(2)} s`;
  if (s < 3600) { const m = Math.floor(s / 60); return `${m} min ${Math.round(s - m * 60)} s`; }
  if (s < 86400 * 2) { const h = Math.floor(s / 3600); return `${h} h ${Math.round((s - h * 3600) / 60)} min`; }
  return `${(s / 86400).toFixed(2)} days`;
}
function fmtHours(h) {
  const a = Math.abs(h);
  if (a < 72) return `${a.toFixed(a < 10 ? 2 : 1)} h`;
  return `${(a / 24).toFixed(a / 24 < 100 ? 1 : 0)} d`;
}
function fmtPeriod(d) {
  if (d < 2) return `${(d * 24).toFixed(1)} h`;
  if (d < 800) return `${nf(d, d < 100 ? 1 : 0)} d`;
  return `${(d / 365.25).toFixed(2)} yr<small>${nf(d)} d</small>`;
}
const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);
const fmtDateLong = (ms) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/* ----------------------------------------------------------------- state --- */
const state = {
  ms: Date.now(), playing: true, dir: 1, speedIdx: 4,
  scale: { t: 0 }, scaleTarget: 0, morph: null,
  focus: "sun", flight: null, intro: true,
  show: { orbits: true, labels: true, belts: true, rings: false, craft: true }
};

/* ============================================================== startup === */
main().catch((err) => {
  console.error(err);
  const l = $("#loading"); if (l) l.innerHTML = `<span>Could not start the orrery: ${String(err.message || err)}</span>`;
});

async function main() {
  if (!Codex.webgl()) { Codex.noGL(); $("#loading").classList.add("done"); return; }
  const data = await fetch("data/planets.json").then((r) => r.json());
  const app = new Orrery(data);
  await app.init();
  window.SolarSystem = app.api();   // small hook for tests and the console
}

class Orrery {
  constructor(data) {
    this.data = data;
    this.bodies = new Map();
    this.selectable = [];
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();
    this.lastInfo = 0;
  }

  /* ---------------------------------------------------------------- init -- */
  async init() {
    const stage = $("#stage");
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: "high-performance" });
    r.setPixelRatio(this.dpr());
    r.setSize(innerWidth, innerHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.domElement.setAttribute("aria-label", "Interactive 3D model of the Solar System showing the Sun, planets, dwarf planets, moons, asteroid and Kuiper belts at the date in the time controls");
    r.domElement.setAttribute("role", "img");
    stage.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 1e-4, 5e6);
    this.world = new THREE.Group();
    this.scene.add(this.world);

    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.6;
    this.controls.zoomSpeed = 1.1;
    this.controls.target.set(0, 0, 0);

    this.sunView = { value: new THREE.Vector3() };
    this.uA = { value: READ_A }; this.uP = { value: READ_P };
    this.uPx = { value: r.getPixelRatio() };

    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    await this.bakeAll();
    this.buildSky();
    this.buildSun();
    this.buildBodies();
    this.buildBelts();
    this.buildOrbits();
    this.buildDistanceRings();
    this.buildCraft();
    this.buildMarkers();
    this.buildLabels();
    this.bindUI();

    addEventListener("resize", () => this.resize());
    this.prev = performance.now();
    this.update(0);
    this.startIntro();
    r.setAnimationLoop(() => this.frame());
    $("#loading").classList.add("done");
  }

  // Phones: cap at 1.5x so the noise-heavy Sun shaders keep 30+ fps.
  dpr() { return Math.min(devicePixelRatio, phoneMQ.matches ? 1.5 : 2); }

  api() {
    return {
      focus: (id, info = true) => this.focusOn(id, info),
      setScale: (t) => this.setScale(t),
      setDate: (s) => this.setMs(new Date(s).getTime()),
      setSpeed: (i) => this.setSpeed(i),
      pause: () => this.setPlaying(false),
      state
    };
  }

  /* --------------------------------------------------------------- bake --- */
  async bakeAll() {
    const r = this.renderer;
    const small = phoneMQ.matches;
    const mat = new THREE.ShaderMaterial({
      vertexShader: SH.BAKE_VERT, fragmentShader: SH.BAKE_FRAG,
      uniforms: { uType: { value: 0 }, uSeed: { value: 0 }, uGal: { value: galacticMatrix() } },
      depthTest: false, depthWrite: false
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    const sc = new THREE.Scene(); sc.add(quad);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const aniso = r.capabilities.getMaxAnisotropy();
    // Software WebGL (SwiftShader, llvmpipe: no GPU available) is ~1000x slower
    // at this noise; use smaller textures there so the page still opens.
    // ?quality=high forces full size; ?hq=earth,jupiter picks individual maps.
    const q = new URLSearchParams(location.search);
    const soft = q.get("quality") !== "high" && (q.get("quality") === "low" || isSoftwareGL(r));
    const hq = new Set((q.get("hq") || "").split(","));
    const S = soft ? 0.25 : small ? 0.5 : 1;
    const jobs = [
      ["earth", 2, 2048, 0.3], ["earthAux", 3, 2048, 0.3], ["jupiter", 5, 2048, 1.1], ["saturn", 6, 2048, 2.2],
      ["mercury", 0, 1024, 3.3], ["venus", 1, 1024, 4.4], ["mars", 4, 1024, 5.5], ["uranus", 7, 1024, 6.6],
      ["neptune", 8, 1024, 7.7], ["pluto", 9, 1024, 8.8], ["moon", 11, 1024, 1.9], ["ceres", 10, 512, 9.9],
      ["io", 12, 512, 2.9], ["europa", 13, 512, 3.9], ["ganymede", 14, 512, 4.9], ["callisto", 15, 512, 5.9],
      ["sky", 99, 2048, 0]
    ].map(([key, type, w, seed]) => ({ key, type, seed, w: Math.max(128, hq.has(key) || hq.has("all") ? w : Math.round(w * S)) }));
    const total = jobs.reduce((a, j) => a + j.w * j.w / 2, 0);
    let done = 0, perFrame = soft ? 1 : 4, last = performance.now();
    const bar = $("#loadBar"), txt = $("#loadTxt");
    this.tex = {};
    const tone = r.toneMapping; r.toneMapping = THREE.NoToneMapping;
    for (const j of jobs) {
      const h = j.w / 2;
      const rt = new THREE.WebGLRenderTarget(j.w, h, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
      rt.texture.anisotropy = aniso;
      rt.texture.wrapS = THREE.RepeatWrapping;
      mat.uniforms.uType.value = j.type; mat.uniforms.uSeed.value = j.seed;
      const strip = Math.max(8, Math.min(h, Math.floor(262144 / j.w)));   // ~256k pixels per draw
      for (let y = 0, n = 0; y < h; y += strip, n++) {
        rt.scissor.set(0, y, j.w, Math.min(strip, h - y)); rt.scissorTest = true;
        r.setRenderTarget(rt); r.render(sc, cam);
        done += j.w * Math.min(strip, h - y);
        if (n % perFrame === perFrame - 1) {
          r.setRenderTarget(null); r.toneMapping = tone;
          if (bar) bar.style.width = (done / total * 100).toFixed(1) + "%";
          if (txt) txt.textContent = `Generating ${j.key === "sky" ? "the Milky Way" : j.key === "earthAux" ? "Earth's clouds and city lights" : j.key} surface`;
          await new Promise((res) => requestAnimationFrame(res));
          const now = performance.now(), dt = now - last; last = now;
          perFrame = dt < 34 ? Math.min(64, perFrame * 2) : dt > 80 ? Math.max(1, perFrame >> 1) : perFrame;
          r.toneMapping = THREE.NoToneMapping;
        }
      }
      rt.scissorTest = false;
      this.tex[j.key] = rt.texture;
      if (BENCH) console.log("baked", j.key, j.w);
    }
    r.setRenderTarget(null);
    r.resetState();
    r.toneMapping = tone;
    mat.dispose(); quad.geometry.dispose();
    this.tex.saturnRing = ringTexture("saturn");
    this.tex.uranusRing = ringTexture("uranus");
  }

  /* ---------------------------------------------------------------- sky --- */
  buildSky() {
    const g = this.skyGroup = new THREE.Group();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1e6, 64, 32),
      new THREE.ShaderMaterial({ vertexShader: SH.SKY_VERT, fragmentShader: SH.SKY_FRAG, uniforms: { uMap: { value: this.tex.sky }, uK: { value: 1.25 } },
        side: THREE.BackSide, depthTest: false, depthWrite: false }));
    sky.renderOrder = -10; sky.frustumCulled = false;
    g.add(sky);
    // Stars: 55% isotropic, 45% concentrated toward the galactic plane.
    const N = phoneMQ.matches ? 5000 : 9000;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N);
    const G = galacticMatrix().clone().transpose();   // galactic -> scene
    const rnd = mulberry(7);
    const v = new THREE.Vector3();
    const temps = [[0.62, 0.72, 1.0], [0.8, 0.86, 1.0], [1.0, 1.0, 1.0], [1.0, 0.94, 0.82], [1.0, 0.82, 0.6], [1.0, 0.7, 0.5]];
    for (let i = 0; i < N; i++) {
      if (rnd() < 0.45) {
        const l = rnd() * Math.PI * 2, b = gaussR(rnd) * 0.14;
        v.set(Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)).applyMatrix3(G);
      } else {
        const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - z * z);
        v.set(s * Math.cos(a), z, s * Math.sin(a));
      }
      v.normalize().multiplyScalar(9e5);
      pos.set([v.x, v.y, v.z], i * 3);
      const m = Math.pow(rnd(), 5.5);                // few bright, many faint
      const c = temps[Math.floor(Math.pow(rnd(), 0.8) * temps.length)];
      const k = 0.35 + 1.6 * m;
      col.set([c[0] * k, c[1] * k, c[2] * k], i * 3);
      size[i] = 1.4 + 4.2 * m;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    const stars = new THREE.Points(geo, new THREE.ShaderMaterial({ vertexShader: SH.STAR_VERT, fragmentShader: SH.STAR_FRAG,
      uniforms: { uPx: this.uPx }, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true }));
    stars.renderOrder = -9; stars.frustumCulled = false;
    g.add(stars);
    this.scene.add(g);
  }

  /* ---------------------------------------------------------------- Sun --- */
  buildSun() {
    const d = this.data.bodies.find((b) => b.id === "sun");
    const group = new THREE.Group();
    const tilt = new THREE.Group();
    const mat = new THREE.ShaderMaterial({ vertexShader: SH.PLANET_VERT, fragmentShader: SH.SUN_FRAG, uniforms: { uTime: { value: 0 } } });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), mat);
    tilt.add(mesh); group.add(tilt);
    tilt.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), poleScene(d.pole));
    const corona = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      vertexShader: SH.CORONA_VERT, fragmentShader: SH.CORONA_FRAG,
      uniforms: { uTime: mat.uniforms.uTime, uCore: { value: 1 / 8 }, uK: { value: 1 } },
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    corona.renderOrder = 5;
    group.add(corona);
    this.world.add(group);
    const b = this.addBody({ id: "sun", data: d, kind: "sun", group, tilt, mesh, rR: 4.6, rT: kmToTrue(d.radius_km) });
    b.corona = corona; b.sunMat = mat;
  }

  addBody(b) {
    b.local = new THREE.Vector3();
    b.R = b.rR; b.spin = 0;
    this.bodies.set(b.id, b);
    this.selectable.push(b);
    return b;
  }

  /* ------------------------------------------------------------- planets --- */
  buildBodies() {
    const geoHi = new THREE.SphereGeometry(1, 128, 64), geoLo = new THREE.SphereGeometry(1, 64, 32);
    for (const d of this.data.bodies) {
      if (d.id === "sun") continue;
      const kind = d.parent ? "moon" : "planet";
      const b = this.makeWorld(d.id, d, kind, d.radius_km, ["earth", "jupiter", "saturn"].includes(d.id) ? geoHi : geoLo);
      if (d.id === "moon") { b.dR = 4.4; b.dT = kmToTrue(d.orbit_km); b.rR = moonReadR(d.radius_km, 6378, readR(6378)); }
    }
    // Galilean moons (radii: NASA / JPL Solar System Dynamics planetary satellite physical parameters)
    const jup = this.bodies.get("jupiter");
    EPH.GALILEAN.forEach((g, i) => {
      const d = this.data.galilean.find((x) => x.id === g.id);
      const b = this.makeWorld(g.id, Object.assign({ name: g.name, kind: "Galilean moon of Jupiter", parent: "jupiter" }, d), "galilean", d.radius_km, geoLo);
      b.gi = i; b.dR = jup.rR * [1.7, 2.2, 2.85, 3.7][i]; b.dT = kmToTrue(g.a * 71492);
      b.rR = moonReadR(d.radius_km, 71492, jup.rR);
    });
  }

  makeWorld(id, d, kind, radiusKm, geo) {
    const group = new THREE.Group(), tilt = new THREE.Group();
    const defines = {};
    const uniforms = {
      uMap: { value: this.tex[id] }, uSunView: this.sunView, uSun: { value: 1.35 },
      uAtm: { value: new THREE.Color(0, 0, 0) }, uAtmK: { value: 0 }, uAmbient: { value: 0.012 }
    };
    const at = ATMOS[id];
    if (at) { uniforms.uAtm.value.setRGB(...at.c); uniforms.uAtmK.value = at.k * 0.6; }
    if (id === "earth") { defines.EARTH = ""; uniforms.uAux = { value: this.tex.earthAux }; uniforms.uCloudShift = { value: 0 }; }
    if (id === "saturn") { defines.RINGSHADOW = ""; uniforms.uRing = { value: this.tex.saturnRing }; uniforms.uRingR = { value: new THREE.Vector2(74658 / 60268, 136775 / 60268) }; uniforms.uSunObj = { value: new THREE.Vector3(0, 1, 0) }; }
    const mat = new THREE.ShaderMaterial({ vertexShader: SH.PLANET_VERT, fragmentShader: SH.PLANET_FRAG, uniforms, defines });
    const mesh = new THREE.Mesh(geo, mat);
    tilt.add(mesh); group.add(tilt);
    if (d.pole) tilt.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), poleScene(d.pole));
    const flat = d.flattening || 0;
    let atmo = null;
    if (at) {
      atmo = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: SH.ATMO_VERT, fragmentShader: SH.ATMO_FRAG,
        uniforms: { uColor: { value: new THREE.Color(...at.c) }, uSunView: this.sunView, uK: { value: at.k }, uShell: { value: at.shell } },
        side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
      tilt.add(atmo);
    }
    let rings = null;
    if (id === "saturn" || id === "uranus") {
      const rin = id === "saturn" ? 74658 / 60268 : 41837 / 25559, rout = id === "saturn" ? 136775 / 60268 : 51400 / 25559;
      const rg = new THREE.RingGeometry(rin, rout, 256, 1); rg.rotateX(-Math.PI / 2);
      rings = new THREE.Mesh(rg, new THREE.ShaderMaterial({ vertexShader: SH.RING_VERT, fragmentShader: SH.RING_FRAG,
        uniforms: { uRing: { value: this.tex[id + "Ring"] }, uRingR: { value: new THREE.Vector2(rin, rout) }, uSunObj: { value: new THREE.Vector3(0, 1, 0) }, uCamObj: { value: new THREE.Vector3(0, 1, 0) }, uSun: { value: 1.35 } },
        side: THREE.DoubleSide, transparent: true, depthWrite: false }));
      rings.renderOrder = 2;
      tilt.add(rings);
    }
    this.world.add(group);
    const b = this.addBody({ id, data: d, kind, group, tilt, mesh, atmo, rings, flat, mat, rR: readR(radiusKm), rT: kmToTrue(radiusKm) });
    if (at) b.shell = at.shell;
    return b;
  }

  /* --------------------------------------------------------------- belts --- */
  buildBelts() {
    const rnd = mulberry(42), D = Math.PI / 180;
    const small = phoneMQ.matches;
    const nAst = small ? 3500 : 7000, nTro = small ? 700 : 1400, nKui = small ? 4500 : 9000;
    const N = nAst + nTro + nKui;
    const el = new Float32Array(N * 4), el2 = new Float32Array(N * 4), col = new Float32Array(N * 3);
    const n0 = 0.9856076686 * D;                             // Gaussian gravitational constant, rad/day at 1 AU
    const jEl = EPH.elementsAt("jupiter", EPH.J2000), nEl = EPH.elementsAt("neptune", EPH.J2000);
    const nJ = n0 / Math.pow(jEl.a, 1.5), nN = n0 / Math.pow(nEl.a, 1.5);
    let i = 0;
    const put = (a, e, inc, node, varpi, M0, n, size, c) => {
      el.set([a, e, inc, node], i * 4); el2.set([varpi, M0, n, size], i * 4); col.set(c, i * 3); i++;
    };
    // Main belt, 2.1 to 3.3 AU, with the Kirkwood gaps (3:1, 5:2, 7:3, 2:1 resonances with Jupiter).
    const gaps = [[2.502, 0.035], [2.825, 0.025], [2.958, 0.018], [3.279, 0.04]];
    while (i < nAst) {
      const a = 2.1 + Math.pow(rnd(), 0.9) * 1.25;
      if (gaps.some(([g, w]) => Math.abs(a - g) < w)) continue;
      const e = Math.min(0.3, Math.abs(gaussR(rnd)) * 0.08), inc = Math.min(30, Math.abs(gaussR(rnd)) * 7) * D;
      const t = rnd();
      put(a, e, inc, rnd() * 6.283, rnd() * 6.283, rnd() * 6.283, n0 / Math.pow(a, 1.5), 1.0 + Math.pow(rnd(), 3) * 2.2,
        [0.62 + t * 0.2, 0.56 + t * 0.16, 0.48 + t * 0.12]);
    }
    // Jupiter trojans: share Jupiter's mean motion, 60 degrees ahead (L4) and behind (L5).
    for (let k = 0; k < nTro; k++) {
      const side = k % 2 ? 60 : -60;
      const L = (jEl.L + side + gaussR(rnd) * 11) * D;
      const e = Math.abs(gaussR(rnd)) * 0.06, varpi = rnd() * 6.283;
      put(jEl.a + gaussR(rnd) * 0.04, e, Math.abs(gaussR(rnd)) * 12 * D, rnd() * 6.283, varpi, L - varpi, nJ, 1.1 + rnd(), [0.72, 0.58, 0.46]);
    }
    // Kuiper belt: plutinos (3:2 with Neptune), cold/hot classical belt ending near 48 AU, scattered disc.
    for (let k = 0; k < nKui; k++) {
      const u = rnd();
      let a, e, inc, varpi = rnd() * 6.283, node = rnd() * 6.283, M0, n;
      if (u < 0.22) {
        // Resonant argument 3 lambda - 2 lambda_N - varpi librates about 180 deg.
        a = 39.4 + gaussR(rnd) * 0.2; e = 0.1 + rnd() * 0.18; inc = Math.abs(gaussR(rnd)) * 10 * D;
        n = nN * 2 / 3;
        const lam = (2 * nEl.L * D + varpi + Math.PI + gaussR(rnd) * 0.7) / 3 + Math.floor(rnd() * 3) * 2 * Math.PI / 3;
        M0 = lam - varpi;
      } else if (u < 0.88) {
        const cold = rnd() < 0.55;
        a = 42 + rnd() * 5.8; e = Math.abs(gaussR(rnd)) * (cold ? 0.03 : 0.08);
        inc = Math.abs(gaussR(rnd)) * (cold ? 2.5 : 12) * D; M0 = rnd() * 6.283; n = n0 / Math.pow(a, 1.5);
      } else {
        a = 50 + Math.pow(rnd(), 2) * 60; e = Math.min(0.62, 0.25 + rnd() * 0.4); inc = Math.abs(gaussR(rnd)) * 18 * D;
        M0 = rnd() * 6.283; n = n0 / Math.pow(a, 1.5);
      }
      const t = rnd();
      put(a, e, inc, node, varpi, M0, n, 1.1 + Math.pow(rnd(), 3) * 2.4, [0.55 + t * 0.2, 0.66 + t * 0.15, 0.85 + t * 0.1]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute("aEl", new THREE.BufferAttribute(el, 4));
    geo.setAttribute("aEl2", new THREE.BufferAttribute(el2, 4));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.beltMat = new THREE.ShaderMaterial({ vertexShader: SH.BELT_VERT, fragmentShader: SH.BELT_FRAG,
      uniforms: { uDays: { value: 0 }, uA: this.uA, uP: this.uP, uPx: this.uPx, uOpacity: { value: 0.5 }, uSizeK: { value: 1 } },
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    this.belts = new THREE.Points(geo, this.beltMat);
    this.belts.frustumCulled = false;
    this.world.add(this.belts);
  }

  /* -------------------------------------------------------------- orbits --- */
  orbitMaterial(color, opacity, trail, uA = this.uA, uP = this.uP) {
    return new THREE.ShaderMaterial({ vertexShader: SH.ORBIT_VERT, fragmentShader: SH.ORBIT_FRAG,
      uniforms: { uA, uP, uPhase: { value: 0 }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uTrail: { value: trail }, uDash: { value: 0 } },
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
  }
  buildOrbits() {
    this.orbitGroup = new THREE.Group(); this.world.add(this.orbitGroup);
    this.orbitBuiltJD = null;
    for (const id of [...PLANETS8, "ceres", "pluto"]) {
      const b = this.bodies.get(id);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(720 * 3), 3));
      geo.setAttribute("aPhase", new THREE.BufferAttribute(new Float32Array(720), 1));
      const c = new THREE.Color(b.data.color).lerp(new THREE.Color("#9fd4ff"), 0.35);
      b.orbit = new THREE.LineLoop(geo, this.orbitMaterial(c, id === "ceres" || id === "pluto" ? 0.45 : 0.7, 1));
      b.orbit.frustumCulled = false;
      this.orbitGroup.add(b.orbit);
    }
    // Moon: its real path over one month around the current date, in units of its mean distance.
    const moon = this.bodies.get("moon");
    const one = { value: 1 };
    const mg = new THREE.BufferGeometry();
    mg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(241 * 3), 3));
    mg.setAttribute("aPhase", new THREE.BufferAttribute(new Float32Array(241), 1));
    moon.orbit = new THREE.Line(mg, this.orbitMaterial("#b9c6d8", 0.4, 0, one, one));
    moon.orbit.frustumCulled = false; this.world.add(moon.orbit);
    moon.orbitJD = null;
    // Galilean moons: circles in Jupiter's equatorial plane.
    const circ = new THREE.BufferGeometry();
    const cp = new Float32Array(128 * 3);
    for (let k = 0; k < 128; k++) { const a = k / 128 * Math.PI * 2; cp.set([Math.cos(a), 0, -Math.sin(a)], k * 3); }
    circ.setAttribute("position", new THREE.BufferAttribute(cp, 3));
    circ.setAttribute("aPhase", new THREE.BufferAttribute(new Float32Array(128), 1));
    const jup = this.bodies.get("jupiter");
    for (const g of EPH.GALILEAN) {
      const b = this.bodies.get(g.id);
      b.orbit = new THREE.LineLoop(circ, this.orbitMaterial("#d8c9a8", 0.28, 0, one, one));
      b.orbit.frustumCulled = false;
      jup.tilt.add(b.orbit);
    }
  }
  rebuildOrbits(jd) {
    for (const id of [...PLANETS8, "ceres", "pluto"]) {
      const b = this.bodies.get(id);
      const path = EPH.orbitPath(id, jd, 720);
      const pos = b.orbit.geometry.attributes.position, ph = b.orbit.geometry.attributes.aPhase;
      for (let k = 0; k < 720; k++) {
        pos.array[k * 3] = path[k * 4]; pos.array[k * 3 + 1] = path[k * 4 + 2]; pos.array[k * 3 + 2] = -path[k * 4 + 1];
        ph.array[k] = path[k * 4 + 3];
      }
      pos.needsUpdate = true; ph.needsUpdate = true;
    }
    this.orbitBuiltJD = jd;
  }
  rebuildMoonOrbit(jd) {
    const moon = this.bodies.get("moon");
    const pos = moon.orbit.geometry.attributes.position;
    const k = AU_KM / moon.data.orbit_km;
    for (let i = 0; i <= 240; i++) {
      const m = EPH.moonGeocentric(jd + (i / 240 - 0.5) * 27.3217);
      pos.array[i * 3] = m.x * k; pos.array[i * 3 + 1] = m.z * k; pos.array[i * 3 + 2] = -m.y * k;
    }
    pos.needsUpdate = true; moon.orbitJD = jd;
  }

  buildDistanceRings() {
    this.distRings = new THREE.Group(); this.distRings.visible = state.show.rings; this.world.add(this.distRings);
    this.ringLabels = [];
    const holder = $("#labels");
    for (const au of [1, 2, 5, 10, 20, 50, 100]) {
      const geo = new THREE.BufferGeometry(); const n = 256;
      const p = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; p.set([Math.cos(a) * au, 0, Math.sin(a) * au], k * 3); }
      geo.setAttribute("position", new THREE.BufferAttribute(p, 3));
      geo.setAttribute("aPhase", new THREE.BufferAttribute(new Float32Array(n), 1));
      const m = this.orbitMaterial("#7cc8ff", 0.22, 0); m.uniforms.uDash.value = 0;
      const line = new THREE.LineLoop(geo, m); line.frustumCulled = false;
      this.distRings.add(line);
      const el = document.createElement("div"); el.className = "ss-ringlabel";
      const lm = au * AU_KM / EPH.C_KM_S / 60;
      el.textContent = `${au} AU · ${lm < 60 ? lm.toFixed(1) + " light-min" : (lm / 60).toFixed(1) + " light-h"}`;
      holder.appendChild(el);
      this.ringLabels.push({ au, el });
    }
  }

  /* ----------------------------------------------------------- spacecraft --- */
  buildCraft() {
    this.craft = [];
    for (const c of this.data.spacecraft.craft) {
      const flybyJD = EPH.julianDay(new Date(c.flyby.date + "T12:00Z"));
      const refJD = EPH.julianDay(new Date(c.ref_date + "T00:00Z"));
      const dir = EPH.fromLonLat(c.lon, c.lat);
      const from = EPH.heliocentric(c.flyby.body, flybyJD);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(64 * 3), 3));
      const ph = new Float32Array(64); for (let k = 0; k < 64; k++) ph[k] = k / 63;
      geo.setAttribute("aPhase", new THREE.BufferAttribute(ph, 1));
      const color = c.id === "newhorizons" ? "#4ef0b8" : "#ffc24b";
      const m = this.orbitMaterial(color, 0.55, 0); m.uniforms.uDash.value = 60;
      const line = new THREE.Line(geo, m); line.frustumCulled = false;
      this.world.add(line);
      const obj = { id: c.id, data: c, kind: "craft", flybyJD, refJD, dir, from, line, color, local: new THREE.Vector3(), au: null, R: 0, rR: 0.001, rT: 0.001, visible: false };
      obj.data.name = c.name;
      this.craft.push(obj);
      this.bodies.set(c.id, obj);
      this.selectable.push(obj);
    }
  }
  craftAU(c, jd) {
    if (jd < c.flybyJD) return null;
    const d = c.data;
    if (jd <= c.refJD) {
      const k = (jd - c.flybyJD) / (c.refJD - c.flybyJD);
      return { x: lerp(c.from.x, c.dir.x * d.dist_au, k), y: lerp(c.from.y, c.dir.y * d.dist_au, k), z: lerp(c.from.z, c.dir.z * d.dist_au, k) };
    }
    const r = d.dist_au + d.speed_au_yr * (jd - c.refJD) / 365.25;
    return { x: c.dir.x * r, y: c.dir.y * r, z: c.dir.z * r };
  }

  /* ------------------------------------------------------------- markers --- */
  buildMarkers() {
    const list = this.selectable.filter((b) => b.id !== "sun");
    this.markerList = list;
    const n = list.length;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const col = new Float32Array(n * 3), shape = new Float32Array(n);
    list.forEach((b, i) => {
      const c = new THREE.Color(b.kind === "craft" ? b.color : b.data.color);
      col.set([c.r, c.g, c.b], i * 3); shape[i] = b.kind === "craft" ? 1 : 0;
    });
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(n), 1));
    geo.setAttribute("aShape", new THREE.BufferAttribute(shape, 1));
    this.markers = new THREE.Points(geo, new THREE.ShaderMaterial({ vertexShader: SH.MARKER_VERT, fragmentShader: SH.MARKER_FRAG,
      uniforms: { uPx: this.uPx }, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: false }));
    this.markers.frustumCulled = false; this.markers.renderOrder = 8;
    this.world.add(this.markers);
  }

  /* -------------------------------------------------------------- labels --- */
  buildLabels() {
    const holder = $("#labels");
    for (const b of this.selectable) {
      const el = document.createElement("div");
      const cls = b.kind === "craft" ? "craft" : (b.kind === "moon" || b.kind === "galilean") ? "moon" : /dwarf/i.test(b.data.kind || "") ? "dwarf" : "";
      el.className = "ss-label " + cls;
      el.innerHTML = b.kind === "craft" ? `${b.data.name}<small>approx.</small>` : b.data.name;
      el.addEventListener("click", (e) => { e.stopPropagation(); this.focusOn(b.id); });
      holder.appendChild(el);
      b.label = el;
    }
  }

  /* ------------------------------------------------------------------ UI --- */
  bindUI() {
    // body list
    const list = $("#bodyList");
    const order = ["sun", "mercury", "venus", "earth", "moon", "mars", "ceres", "jupiter", "saturn", "uranus", "neptune", "pluto", "voyager1", "voyager2", "newhorizons"];
    this.bodyButtons = {};
    for (const id of order) {
      const b = this.bodies.get(id);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.style.setProperty("--c", b.kind === "craft" ? b.color : b.data.color);
      btn.innerHTML = `<i></i>${b.data.name}`;
      btn.setAttribute("aria-pressed", "false");
      btn.addEventListener("click", () => this.focusOn(id));
      list.appendChild(btn);
      this.bodyButtons[id] = btn;
    }
    // scale
    document.querySelectorAll(".ss-scale button").forEach((btn) => btn.addEventListener("click", () => this.setScale(+btn.dataset.scale)));
    // toggles
    const tog = (sel, key, fn) => $(sel).addEventListener("change", (e) => { state.show[key] = e.target.checked; fn && fn(e.target.checked); });
    tog("#tOrbits", "orbits", (v) => { this.orbitGroup.visible = v; });
    tog("#tLabels", "labels", (v) => { $("#labels").style.display = v ? "" : "none"; });
    tog("#tBelts", "belts", (v) => { this.belts.visible = v; });
    tog("#tRings", "rings", (v) => { this.distRings.visible = v; });
    tog("#tCraft", "craft");
    // time
    $("#playBtn").addEventListener("click", () => this.setPlaying(!state.playing));
    $("#revBtn").addEventListener("click", () => this.setDir(-state.dir));
    $("#nowBtn").addEventListener("click", () => this.goNow());
    const sp = $("#speed");
    sp.value = state.speedIdx;
    sp.addEventListener("input", () => this.setSpeed(+sp.value));
    this.setSpeed(state.speedIdx);
    const dp = $("#datePick");
    dp.addEventListener("change", () => {
      if (!dp.value) return;
      const tod = state.ms - Math.floor(state.ms / DAY_MS) * DAY_MS;
      this.setMs(new Date(dp.value + "T00:00:00Z").getTime() + tod);
    });
    $("#infoClose").addEventListener("click", () => this.focusOn("sun", false));
    // picking
    const cvs = this.renderer.domElement;
    let down = null;
    cvs.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY }; });
    cvs.addEventListener("pointerup", (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
      const hit = this.pick(e.clientX, e.clientY);
      if (hit) this.focusOn(hit.id);
    });
    cvs.addEventListener("wheel", () => this.cancelFlight(), { passive: true });
    // keyboard
    addEventListener("keydown", (e) => {
      if (e.target.closest && e.target.closest("input, select, textarea")) return;
      const k = e.key;
      if (k === " ") { e.preventDefault(); this.setPlaying(!state.playing); }
      else if (k === "r" || k === "R") this.setDir(-state.dir);
      else if (k === "n" || k === "N") this.goNow();
      else if (k === "t" || k === "T") this.setScale(state.scaleTarget ? 0 : 1);
      else if (k === "Escape") this.focusOn("sun", false);
      else if (/^[0-9]$/.test(k)) this.focusOn(["sun", "mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"][+k]);
    });
    // phones: start with the sheet collapsed so the sky is visible
    if (phoneMQ.matches) {
      const p = $("#panel"); p.classList.add("collapsed");
      const c = p.querySelector(".hud-collapse"); if (c) c.textContent = "▲ CONTROLS";
    }
  }

  setPlaying(v) {
    state.playing = v;
    const b = $("#playBtn"); b.classList.toggle("paused", !v); b.setAttribute("aria-label", v ? "Pause" : "Play");
  }
  setDir(d) { state.dir = d; $("#revBtn").setAttribute("aria-pressed", d < 0 ? "true" : "false"); this.toast(d < 0 ? "Time runs backwards" : "Time runs forwards"); }
  setSpeed(i) {
    state.speedIdx = Math.max(0, Math.min(SPEEDS.length - 1, i));
    $("#speedOut").textContent = SPEEDS[state.speedIdx][1];
    const sp = $("#speed"); sp.value = state.speedIdx; sp.style.setProperty("--fill", (state.speedIdx / (SPEEDS.length - 1) * 100) + "%");
  }
  setMs(ms) {
    state.ms = Math.max(MIN_MS, Math.min(MAX_MS, ms));
    this.eventsJD = null;
  }
  goNow() { this.setMs(Date.now()); this.setSpeed(0); this.setDir(1); this.setPlaying(true); this.toast("Now, in real time"); }
  toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(this.toastT); this.toastT = setTimeout(() => t.classList.remove("show"), 2200);
  }

  /* --------------------------------------------------------------- scale --- */
  setScale(t) {
    t = t ? 1 : 0;
    state.scaleTarget = t;
    document.querySelectorAll(".ss-scale button").forEach((b) => b.setAttribute("aria-pressed", +b.dataset.scale === t ? "true" : "false"));
    $("#scaleHint").textContent = t
      ? "Sizes and distances both to scale (1 AU = 1,000 units, Earth's radius = 0.043). The planets shrink to specks: space is mostly empty. Rings mark each world."
      : "Planets enlarged; distances compressed as the square root of the real distance, so the whole family fits on screen.";
    const ratio = this.camera.position.length() / this.focusScale(state.scale.t);
    state.morph = { ratio };
    const dur = REDUCE ? 0.01 : 2.6;
    const morph = state.morph;
    gsap.to(state.scale, { t, duration: dur, ease: "power2.inOut", overwrite: true, onComplete: () => { morph.finished = true; } });
    this.toast(t ? "True scale: real sizes, real distances" : "Readable scale");
  }
  overviewDist(t) { return 2.1 * mixLog(READ_A, TRUE_AU, t) * Math.pow(38, lerp(READ_P, 1, t)) * (phoneMQ.matches ? 1.25 : 1); }
  focusScale(t, id = state.focus) {
    const b = this.bodies.get(id);
    if (id === "sun") return state.sunClose ? mixLog(b.rR, b.rT, t) * 4 : this.overviewDist(t);
    if (b.kind === "craft") return this.overviewDist(t) * 0.12;
    return mixLog(b.rR, b.rT, t);
  }
  updateZoomLimits() {
    const b = this.bodies.get(state.focus);
    const t = state.scale.t;
    const R = b.kind === "craft" ? this.overviewDist(t) * 0.002 : b.R;
    this.controls.minDistance = Math.max(R * 1.25, 1e-4);
    this.controls.maxDistance = this.overviewDist(t) * 6;
  }

  /* --------------------------------------------------------------- focus --- */
  focusDist(b, t = state.scale.t) {
    if (b.id === "sun") return state.sunClose ? mixLog(b.rR, b.rT, t) * (phoneMQ.matches ? 9 : 4.2) : this.overviewDist(t);
    if (b.kind === "craft") return this.overviewDist(t) * 0.12;
    const R = mixLog(b.rR, b.rT, t);
    const f = b.id === "saturn" ? 7.5 : b.id === "uranus" ? 6 : b.kind === "galilean" ? 5 : 4.4;
    return R * f * (phoneMQ.matches ? 2.4 : 1);
  }
  focusOn(id, info = true) {
    const b = this.bodies.get(id);
    if (!b) return;
    const from = state.focus;
    const t = state.scale.t;
    const fromScale = this.focusScale(t, from);
    state.focus = id;
    state.sunClose = id === "sun" && info;
    Object.entries(this.bodyButtons).forEach(([k, btn]) => btn.setAttribute("aria-pressed", k === id ? "true" : "false"));
    this.selectable.forEach((x) => x.label && x.label.classList.toggle("focus", x.id === id));
    if (info) this.showInfo(b); else { $("#info").hidden = true; this.infoBody = null; document.body.classList.remove("ss-has-info"); }
    this.updateViewOffset();
    const cam = this.camera;
    const d0 = cam.position.length();
    const d1 = this.focusDist(b);
    const dir0 = cam.position.clone().normalize();
    let dir1;
    if (id === "sun" && !info) {
      dir1 = dir0.clone();
      if (dir1.y < 0.35) { dir1.y = 0.45; dir1.normalize(); }
    } else if (id === "sun") {
      dir1 = dir0.clone(); dir1.y = 0.25; dir1.normalize();
    } else {
      // Look at the lit side, 50 degrees round from the Sun direction, a little above the equator.
      const toSun = b.local.clone().negate(); toSun.y = 0;
      if (toSun.lengthSq() < 1e-12) toSun.set(1, 0, 0);
      toSun.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), 1.1);
      dir1 = toSun.multiplyScalar(Math.cos(0.33)).add(new THREE.Vector3(0, Math.sin(0.33), 0)).normalize();
    }
    const flight = { from, to: id, k: 0, d0n: d0 / fromScale, d1n: d1 / this.focusScale(t, id), fromClose: from === "sun" && d0 < this.overviewDist(t) * 0.2, dir0, dir1 };
    state.flight = flight;
    this.controls.enabled = false;
    const done = () => { flight.k = 1; flight.finished = true; };
    this.controls.minDistance = 1e-5; this.controls.maxDistance = 1e9;
    gsap.to(flight, { k: 1, duration: REDUCE ? 0.01 : 2.4, ease: "power3.inOut", onComplete: done, overwrite: true });
  }
  cancelFlight() {
    if (!state.flight || state.flight.k < 0.85) return;
    gsap.killTweensOf(state.flight); state.flight = null; this.controls.enabled = true; this.updateZoomLimits();
  }

  pick(x, y) {
    let best = null, bestD = 30;
    for (const b of this.selectable) {
      if (!b.screen || !b.screen.on) continue;
      const d = Math.hypot(b.screen.x - x, b.screen.y - y) - b.screen.r;
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  /* --------------------------------------------------------------- intro --- */
  startIntro() {
    const e = this.bodies.get("earth").local;
    const az = Math.atan2(e.z, e.x) - 0.5;
    const dist = this.overviewDist(0);
    const p = { d: dist * 3.2, el: 1.35, az: az + 1.3 };
    const apply = () => {
      this.camera.position.set(Math.cos(p.el) * Math.cos(p.az), Math.sin(p.el), Math.cos(p.el) * Math.sin(p.az)).multiplyScalar(p.d);
    };
    apply();
    this.controls.enabled = false;
    const end = () => { state.intro = false; this.controls.enabled = true; this.updateZoomLimits(); };
    if (REDUCE) { p.d = dist; p.el = 0.5; p.az = az; apply(); end(); return; }
    const lab = $("#labels"); lab.style.opacity = 0;
    gsap.to(p, { d: dist, el: 0.5, az, duration: 4.2, ease: "power3.out", onUpdate: apply, onComplete: end });
    gsap.to(lab, { opacity: 1, duration: 1.2, delay: 2.4 });
    gsap.from(".ss-title, .ss-dock, .ss-panel", { opacity: 0, y: 14, duration: 1, stagger: 0.12, delay: 0.3, ease: "power2.out", clearProps: "opacity,transform" });
  }

  /* On phones the info card is a bottom sheet: shift the picture up so the
   * focused world sits in the visible part of the screen. */
  updateViewOffset() {
    const up = phoneMQ.matches && !$("#info").hidden ? Math.round(innerHeight * 0.13) : 0;
    const cur = this.viewUp || 0;
    if (REDUCE) { this.viewUp = up; this.applyViewOffset(); return; }
    const o = { v: cur };
    gsap.to(o, { v: up, duration: 1.2, ease: "power2.inOut", onUpdate: () => { this.viewUp = o.v; this.applyViewOffset(); } });
  }
  applyViewOffset() {
    if (this.viewUp) this.camera.setViewOffset(innerWidth, innerHeight, 0, this.viewUp, innerWidth, innerHeight);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  resize() {
    this.selectable.forEach((b) => { b.labelW = 0; });
    this.camera.aspect = innerWidth / innerHeight; this.applyViewOffset();
    this.renderer.setPixelRatio(this.dpr());
    this.renderer.setSize(innerWidth, innerHeight);
    this.uPx.value = this.renderer.getPixelRatio();
  }

  /* =============================================================== frame === */
  frame() {
    const now = performance.now();
    let dt = Math.min(0.1, (now - this.prev) / 1000);
    this.prev = now;
    if (document.hidden) return;
    if (state.playing) {
      const next = state.ms + dt * 1000 * SPEEDS[state.speedIdx][0] * state.dir;
      if (next <= MIN_MS || next >= MAX_MS) { this.setMs(next); this.setPlaying(false); this.toast("The JPL elements used here are valid from 1800 to 2050"); }
      else state.ms = next;
    }
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.updateLabels();
    if (now - this.lastInfo > 250) { this.lastInfo = now; this.updateHUD(); }
  }

  update(dt) {
    const jd = EPH.julianDay(state.ms);
    const t = state.scale.t;
    const A = mixLog(READ_A, TRUE_AU, t), P = lerp(READ_P, 1, t);
    this.uA.value = A; this.uP.value = P;
    const map = (v, out) => { const r = Math.hypot(v.x, v.y, v.z); if (r < 1e-12) return out.set(0, 0, 0); const s = A * Math.pow(r, P) / r; return out.set(v.x * s, v.z * s, -v.y * s); };
    this.map = map;

    // ---- positions
    const B = this.bodies;
    for (const b of B.values()) { if (b.kind !== "craft" && b.rR) b.R = mixLog(b.rR, b.rT, t); }
    for (const id of [...PLANETS8, "ceres", "pluto"]) {
      const b = B.get(id);
      b.au = EPH.heliocentric(id, jd);
      map(b.au, b.local);
    }
    B.get("sun").local.set(0, 0, 0); B.get("sun").au = { x: 0, y: 0, z: 0 };
    const earth = B.get("earth"), moon = B.get("moon");
    const mg = EPH.moonGeocentric(jd);
    moon.au = { x: earth.au.x + mg.x, y: earth.au.y + mg.y, z: earth.au.z + mg.z };
    const mD = mixLog(moon.dR, moon.dT, t);
    const mk = mD * AU_KM / moon.data.orbit_km;
    moon.local.set(earth.local.x + mg.x * mk, earth.local.y + mg.z * mk, earth.local.z - mg.y * mk);
    if (moon.orbitJD == null || Math.abs(jd - moon.orbitJD) > 3) this.rebuildMoonOrbit(jd);
    moon.orbit.position.copy(earth.local); moon.orbit.scale.setScalar(mD);
    moon.orbit.visible = state.show.orbits;

    const jup = B.get("jupiter");
    const lons = EPH.galileanLongitudes(jd);
    EPH.GALILEAN.forEach((g, i) => {
      const b = B.get(g.id);
      const D = mixLog(b.dR, b.dT, t);
      const a = lons[i] * Math.PI / 180;
      this.tmp.set(Math.cos(a) * D, 0, -Math.sin(a) * D).applyQuaternion(jup.tilt.quaternion);
      b.local.copy(jup.local).add(this.tmp);
      const kmOff = g.a * 71492 / AU_KM;
      b.au = { x: jup.au.x + this.tmp.x / D * kmOff, y: jup.au.y - this.tmp.z / D * kmOff, z: jup.au.z + this.tmp.y / D * kmOff };
      b.orbit.scale.setScalar(D);
      b.orbit.visible = state.show.orbits;
    });
    for (const c of this.craft) {
      const au = this.craftAU(c, jd);
      c.au = au; c.visible = !!au && state.show.craft;
      c.line.visible = c.visible;
      if (!au) continue;
      map(au, c.local);
      const pos = c.line.geometry.attributes.position;
      for (let k = 0; k < 64; k++) {
        const s = k / 63;
        pos.array[k * 3] = lerp(c.from.x, au.x, s); pos.array[k * 3 + 1] = lerp(c.from.z, au.z, s); pos.array[k * 3 + 2] = -lerp(c.from.y, au.y, s);
      }
      pos.needsUpdate = true;
    }

    // ---- floating origin
    const f = state.flight;
    if (f) {
      const a = B.get(f.from).local, b = B.get(f.to).local;
      this.origin = (this.origin || new THREE.Vector3()).lerpVectors(a, b, f.k);
      const d = mixLog(f.d0n * (f.from === "sun" ? (f.fromClose ? this.bodies.get("sun").R * 4 : this.overviewDist(t)) : this.focusScale(t, f.from)), f.d1n * this.focusScale(t, f.to), f.k);
      const dir = f.dir0.clone().lerp(f.dir1, f.k);
      if (dir.lengthSq() < 1e-6) dir.copy(f.dir1);
      this.camera.position.copy(dir.normalize().multiplyScalar(d));
      if (f.finished && state.flight === f) {
        state.flight = null; this.controls.enabled = true; this.updateZoomLimits();
        if (state.morph) state.morph.ratio = d / this.focusScale(t);
      }
    } else {
      this.origin = (this.origin || new THREE.Vector3()).copy(B.get(state.focus).local);
      if (state.morph) {
        this.camera.position.setLength(state.morph.ratio * this.focusScale(t));
        if (state.morph.finished) { state.morph = null; this.updateZoomLimits(); }
      }
    }
    this.world.position.copy(this.origin).negate();

    // ---- bodies: place, scale, spin
    for (const b of B.values()) {
      if (b.kind === "craft") continue;
      b.group.position.copy(b.local);
      const R = b.R;
      if (b.kind === "sun") { b.mesh.scale.setScalar(R); }
      else {
        b.mesh.scale.set(R, R * (1 - b.flat), R);
        if (b.atmo) b.atmo.scale.set(R * b.shell, R * b.shell * (1 - b.flat), R * b.shell);
        if (b.rings) b.rings.scale.setScalar(R);
      }
      const rot = b.data.rotation_hours;
      if (rot) {
        const trueStep = (dt * SPEEDS[state.speedIdx][0] * state.dir * (state.playing ? 1 : 0)) / (Math.abs(rot) * 3600) * Math.PI * 2 * (b.data.spin_sign || 1);
        const cap = dt * Math.PI * 0.8;
        b.spin += Math.max(-cap, Math.min(cap, trueStep));
      }
      if (b.kind === "moon" || b.kind === "galilean") {
        // tidally locked: +X of the texture faces the parent
        const parent = B.get(b.data.parent);
        this.tmp.subVectors(parent.local, b.local).normalize();
        b.tilt.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), this.tmp);
        b.mesh.rotation.set(0, 0, 0);
      } else {
        b.mesh.rotation.set(0, b.spin, 0);
      }
    }
    // Earth's clouds drift slowly over the surface
    earth.mat.uniforms.uCloudShift.value = (earth.spin * 0.01) % 1;

    // ---- Sun visuals
    const sun = B.get("sun");
    sun.sunMat.uniforms.uTime.value = performance.now() / 1000;
    const camDist = this.camera.position.distanceTo(this.tmp.copy(sun.local).sub(this.origin));
    const Reff = Math.max(sun.R, camDist * 0.0045);
    sun.corona.scale.setScalar(Reff * 8);
    // tame the glare when the camera is right next to the Sun
    sun.corona.material.uniforms.uK.value = 0.2 + 0.8 * smooth(3, 25, camDist / Reff);
    sun.corona.quaternion.copy(this.camera.quaternion);

    // ---- orbits
    if (this.orbitBuiltJD == null || Math.abs(jd - this.orbitBuiltJD) > 1500) this.rebuildOrbits(jd);
    for (const id of [...PLANETS8, "ceres", "pluto"]) {
      const b = B.get(id);
      b.orbit.material.uniforms.uPhase.value = EPH.orbitPhase(id, jd);
      b.orbit.material.uniforms.uOpacity.value = (state.focus === id ? 1.2 : (id === "ceres" || id === "pluto" ? 0.42 : 0.62));
    }
    this.beltMat.uniforms.uDays.value = jd - EPH.J2000;
    this.beltMat.uniforms.uOpacity.value = lerp(0.42, 0.22, t);
    this.beltMat.uniforms.uSizeK.value = lerp(1, 0.7, t);

    // ---- camera + uniforms
    this.controls.update();
    this.camera.updateMatrixWorld();
    this.scene.updateMatrixWorld();
    this.skyGroup.position.copy(this.camera.position);
    this.sunView.value.copy(sun.local).applyMatrix4(this.world.matrixWorld).applyMatrix4(this.camera.matrixWorldInverse);
    const q = new THREE.Quaternion();
    for (const id of ["saturn", "uranus"]) {
      const b = B.get(id);
      b.mesh.getWorldQuaternion(q); q.invert();
      const sunDir = this.tmp.copy(b.local).negate().normalize().applyQuaternion(q);
      if (b.mat.uniforms.uSunObj) b.mat.uniforms.uSunObj.value.copy(sunDir);
      b.tilt.getWorldQuaternion(q); q.invert();
      b.rings.material.uniforms.uSunObj.value.copy(this.tmp.copy(b.local).negate().normalize().applyQuaternion(q));
      const camLocal = this.tmp2.copy(this.camera.position).sub(b.group.getWorldPosition(new THREE.Vector3())).applyQuaternion(q);
      b.rings.material.uniforms.uCamObj.value.copy(camLocal);
    }

    // ---- markers (constant-size dots that fade once the real disc is visible)
    const mpos = this.markers.geometry.attributes.position, malpha = this.markers.geometry.attributes.aAlpha;
    const pxPerUnit = innerHeight / 2 / Math.tan(this.camera.fov * Math.PI / 360);
    this.markerList.forEach((b, i) => {
      mpos.array[i * 3] = b.local.x; mpos.array[i * 3 + 1] = b.local.y; mpos.array[i * 3 + 2] = b.local.z;
      let a = 0;
      if (b.kind === "craft") a = b.visible ? 1 : 0;
      else {
        const d = this.tmp.copy(b.local).sub(this.origin).distanceTo(this.camera.position);
        const rpx = b.R / d * pxPerUnit;
        a = 1 - smooth(1.5, 5, rpx);
        if (b.kind !== "planet") a *= 0.7;
      }
      malpha.array[i] = a;
    });
    mpos.needsUpdate = true; malpha.needsUpdate = true;

    // distance rings follow the scale mode through the orbit shader
    this.jd = jd;
  }

  /* -------------------------------------------------------------- labels --- */
  updateLabels() {
    const cam = this.camera, W = innerWidth, H = innerHeight;
    const pxPerUnit = H / 2 / Math.tan(cam.fov * Math.PI / 360);
    const v = this.tmp;
    const show = state.show.labels;
    const B = this.bodies;
    const placed = [];
    if (!this.labelOrder) {
      const rank = (b) => b.id === state.focus ? -1 : b.kind === "sun" ? 0 : b.kind === "planet" ? (/dwarf/i.test(b.data.kind) ? 2 : 1) : b.kind === "craft" ? 3 : 4;
      this.labelOrder = () => [...this.selectable].sort((a, c) => rank(a) - rank(c) || c.rR - a.rR);
    }
    for (const b of this.labelOrder()) {
      if (!b.label) continue;
      v.copy(b.local).sub(this.origin);
      const dist = v.distanceTo(cam.position);
      v.project(cam);
      const on = v.z < 1 && v.z > -1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2 && (b.kind !== "craft" || b.visible);
      const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
      const r = b.kind === "craft" ? 4 : Math.max(b.R / dist * pxPerUnit, 3);
      b.screen = { x, y, r, on };
      let hide = !on || !show;
      if (!hide && (b.kind === "moon" || b.kind === "galilean")) {
        const p = B.get(b.data.parent).screen;
        if (p && Math.hypot(p.x - x, p.y - y) < p.r + 26) hide = true;
      }
      if (!hide && b.id === "sun" && state.focus === "sun" && r > H * 0.3) hide = true;
      const lx = x + r * 0.72 + 2, ly = y - r * 0.72 - 9;
      if (!hide) {
        const w = b.labelW || (b.labelW = b.label.offsetWidth || 80);
        const box = [lx, ly, lx + w, ly + 18];
        if (placed.some((p) => box[0] < p[2] && box[2] > p[0] && box[1] < p[3] && box[3] > p[1])) hide = true;
        else placed.push(box);
      }
      b.label.classList.toggle("hide", hide);
      if (!hide) b.label.style.transform = `translate3d(${lx.toFixed(1)}px, ${ly.toFixed(1)}px, 0)`;
    }
    // distance-ring labels sit on the camera side
    if (state.show.rings) {
      const az = Math.atan2(cam.position.z, cam.position.x) + 0.35;
      for (const rl of this.ringLabels) {
        const p = this.tmp2.set(Math.cos(az), 0, Math.sin(az)).multiplyScalar(this.uA.value * Math.pow(rl.au, this.uP.value)).sub(this.origin);
        p.project(cam);
        const on = p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1;
        rl.el.style.opacity = on ? 1 : 0;
        rl.el.style.transform = `translate3d(${((p.x * 0.5 + 0.5) * W + 4).toFixed(1)}px, ${((-p.y * 0.5 + 0.5) * H - 14).toFixed(1)}px, 0)`;
      }
    } else this.ringLabels.forEach((rl) => { rl.el.style.opacity = 0; });
  }

  /* ----------------------------------------------------------------- HUD --- */
  updateHUD() {
    const jd = this.jd;
    const d = new Date(state.ms);
    const dp = $("#datePick");
    if (document.activeElement !== dp) dp.value = isoDate(state.ms);
    $("#timeText").textContent = d.toISOString().slice(11, 16) + " UTC";
    const E = this.bodies.get("earth").au;
    const rE = EPH.len(E);
    $("#rEarthSun").innerHTML = `${rE.toFixed(5)}<small>AU</small>`;
    $("#rSunLight").textContent = fmtLight(rE * AU_KM / EPH.C_KM_S);
    $("#rSpread").innerHTML = `${EPH.alignmentArc(PLANETS8, jd).toFixed(0)}°`;
    const v1 = this.bodies.get("voyager1");
    $("#rV1").innerHTML = v1.au ? `${fmtLight(EPH.len(EPH.sub(v1.au, E)) * AU_KM / EPH.C_KM_S)}<small>≈</small>` : "—";
    this.updateEvents(jd);
    if (this.infoBody) this.updateInfoLive();
  }

  updateEvents(jd) {
    if (this.eventsJD != null && jd >= this.eventsJD && jd < this.eventsNext && Math.abs(jd - this.eventsJD) < 200) return;
    const items = [];
    for (const id of ["mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune"]) {
      const ev = EPH.nextEvent(id, jd - 0.5);
      if (ev && EPH.jdToMs(ev.jd) < MAX_MS) items.push({ id, ...ev });
    }
    items.sort((a, b) => a.jd - b.jd);
    this.eventsJD = jd;
    this.eventsNext = Math.max(items.length ? items[0].jd : jd + 30, jd) + 0.5;
    const ol = $("#events");
    ol.innerHTML = "";
    for (const ev of items) {
      const b = this.bodies.get(ev.id);
      const li = document.createElement("li");
      if (ev.id === "mars") li.className = "hot";
      const ms = EPH.jdToMs(ev.jd);
      const what = ev.kind === "opposition" ? "opposition" : "inferior conjunction";
      li.innerHTML = `<button type="button" style="--c:${b.data.color}"><i></i><span><b>${b.data.name}</b> ${what}</span><span class="d">${fmtDateLong(ms)}<small>${ev.distanceAU.toFixed(3)} AU</small></span></button>`;
      li.firstChild.title = ev.kind === "opposition"
        ? `${b.data.name} opposite the Sun in Earth's sky: up all night and near its closest and brightest`
        : `${b.data.name} passes between Earth and the Sun`;
      li.firstChild.addEventListener("click", () => {
        this.setMs(ms); this.setPlaying(false); this.focusOn(ev.id);
        this.toast(ev.kind === "opposition" ? `${b.data.name} at opposition: Earth sits between it and the Sun` : `${b.data.name} passes between Earth and the Sun`);
      });
      ol.appendChild(li);
    }
  }

  /* ---------------------------------------------------------------- info --- */
  showInfo(b) {
    const card = $("#info");
    this.infoBody = b;
    const d = b.data;
    card.hidden = false;
    document.body.classList.add("ss-has-info");
    const color = b.kind === "craft" ? b.color : d.color;
    card.style.setProperty("--c", color);
    $("#infoOrb").style.setProperty("--c", color);
    $("#infoName").innerHTML = d.name + (b.kind === "craft" ? '<span class="ss-badge">approximate</span>' : "");
    $("#infoKind").textContent = b.kind === "craft" ? "Spacecraft" : d.kind;
    const stats = [];
    const S = (k, v) => stats.push(`<div class="readout"><div class="k">${k}</div><div class="v">${v}</div></div>`);
    let missions = d.missions, fact = d.fact, src = "Data: NASA Planetary Fact Sheet (NSSDCA). Position: JPL Keplerian elements (Standish).";
    if (b.kind === "craft") {
      fact = d.note;
      S("Launched", fmtDateLong(new Date(d.launch + "T12:00Z").getTime()));
      S("Speed from Sun", `${nf(d.speed_au_yr * AU_KM / 31557600, 1)}<small>km/s</small>`);
      S("Last planet flyby", `${this.bodies.get(d.flyby.body).data.name}<small>${d.flyby.date.slice(0, 4)}</small>`);
      S("Direction", `${d.lon.toFixed(0)}°, ${d.lat > 0 ? "+" : ""}${d.lat.toFixed(0)}°<small>ecl.</small>`);
      missions = null;
      src = "Approximate: straight-line extrapolation from rounded NASA/JPL distances and speeds; see data/planets.json.";
    } else if (b.kind === "galilean") {
      const g = EPH.GALILEAN[b.gi];
      fact = GAL_EXTRA[b.id].fact + " Discovered by Galileo Galilei in January 1610.";
      missions = GAL_EXTRA[b.id].missions;
      S("Radius", `${nf(d.radius_km, 1)}<small>km</small>`);
      S("Orbit period", fmtPeriod(360 / g.n));
      S("Distance from Jupiter", `${nf(g.a * 71492 / 1000, 0)}<small>thousand km</small>`);
      S("Day length", "= its orbit<small>locked</small>");
      src = "Radii: JPL Solar System Dynamics. Orbits: mean longitudes after J. H. Lieske (via Meeus); phases approximate.";
    } else {
      S("Radius", `${nf(d.radius_km)}<small>km</small>`);
      S("Mass", `${sci(d.mass_kg)}<small>kg</small>`);
      S("Surface gravity", `${d.gravity_ms2}<small>m/s²</small>`);
      if (d.day_hours) S("Solar day", fmtHours(d.day_hours));
      S("Spin period", `${fmtHours(d.rotation_hours)}${d.rotation_hours < 0 ? "<small>retrograde</small>" : ""}`);
      if (d.orbital_period_days) S(d.id === "moon" ? "Orbit around Earth" : "Year (orbit)", fmtPeriod(d.orbital_period_days));
      if (d.moons != null) S("Known moons", `${d.moons}${d.moons_note ? "<small>*</small>" : ""}`);
      S("Mean temperature", `${nf(d.mean_temp_c)}<small>°C</small>`);
      if (d.id === "sun") src = "Data: NASA Sun Fact Sheet (NSSDCA); IAU 2015 nominal solar radius.";
      if (d.id === "ceres") src = "Data: NASA Dawn mission results. Orbit: rounded JPL Small-Body Database elements.";
      if (d.moons_note) src += " *" + d.moons_note + ".";
      if (d.temp_note) src += ` Temperature: ${d.temp_note}.`;
    }
    $("#infoFact").textContent = fact || "";
    $("#infoStats").innerHTML = stats.join("");
    const mw = $("#infoMissionsWrap");
    if (missions && missions.length) { mw.hidden = false; $("#infoMissions").innerHTML = missions.map((m) => `<li>${m}</li>`).join(""); }
    else mw.hidden = true;
    $("#infoSrc").textContent = src;
    this.updateInfoLive();
    if (!REDUCE) gsap.fromTo(card, { opacity: 0, x: phoneMQ.matches ? 0 : -16, y: phoneMQ.matches ? 30 : 0 }, { opacity: 1, x: 0, y: 0, duration: 0.6, ease: "power3.out" });
    if (phoneMQ.matches) { const p = $("#panel"); p.classList.add("collapsed"); const c = p.querySelector(".hud-collapse"); if (c) c.textContent = "▲ CONTROLS"; }
  }
  updateInfoLive() {
    const b = this.infoBody; if (!b) return;
    const E = this.bodies.get("earth").au;
    const live = [];
    const L = (k, v, wide) => live.push(`<div class="${wide ? "wide" : ""}"><div class="k">${k}</div><div class="v">${v}</div></div>`);
    if (!b.au) { $("#infoLive").innerHTML = `<div class="wide"><div class="k">Not launched yet</div><div class="v">—</div></div>`; return; }
    if (b.id === "earth") {
      const r = EPH.len(E);
      L("Distance from Sun", `${r.toFixed(5)} AU<small>${fmtKm(r * AU_KM)}</small>`);
      L("Sunlight takes", `${fmtLight(r * AU_KM / EPH.C_KM_S)}<small>to reach us</small>`);
    } else {
      const dAU = EPH.len(EPH.sub(b.au, E));
      L("From Earth now", `${dAU < 0.01 ? dAU.toFixed(5) : dAU.toFixed(dAU > 10 ? 2 : 3)} AU<small>${fmtKm(dAU * AU_KM)}</small>`);
      L("Light-time", `${fmtLight(dAU * AU_KM / EPH.C_KM_S)}<small>one way</small>`);
      if (b.id !== "sun") {
        const rs = EPH.len(b.au);
        L("From the Sun", `${rs.toFixed(rs > 10 ? 2 : 3)} AU<small>${fmtKm(rs * AU_KM)}</small>`, true);
      }
    }
    $("#infoLive").innerHTML = live.join("");
  }
}

/* ============================================================ utilities === */
function poleScene(pole) {
  const v = EPH.equatorialToEcliptic(pole[0], pole[1]);
  return new THREE.Vector3(v.x, v.z, -v.y).normalize();
}
/* Scene direction -> galactic unit vector. Equatorial (J2000) to galactic
 * rotation from the Hipparcos catalogue introduction (ESA 1997, vol. 1, sec. 1.5.3). */
function galacticMatrix() {
  const e = EPH.OBLIQUITY_J2000 * Math.PI / 180, c = Math.cos(e), s = Math.sin(e);
  const eqToGal = new THREE.Matrix3().set(
    -0.0548755604, -0.8734370902, -0.4838350155,
    0.4941094279, -0.4448296300, 0.7469822445,
    -0.8676661490, -0.1980763734, 0.4559837762);
  const eclToEq = new THREE.Matrix3().set(1, 0, 0, 0, c, -s, 0, s, c);
  const sceneToEcl = new THREE.Matrix3().set(1, 0, 0, 0, 0, -1, 0, 1, 0);
  return new THREE.Matrix3().multiplyMatrices(eqToGal, new THREE.Matrix3().multiplyMatrices(eclToEq, sceneToEcl));
}
function isSoftwareGL(renderer) {
  const gl = renderer.getContext();
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  return /swiftshader|llvmpipe|software|basic render/i.test(name);
}
function smooth(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function gaussR(rnd) { let u = 0, v = 0; while (u === 0) u = rnd(); v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

/* Ring opacity profiles.
 * Saturn (km from centre): D ring inner edge 66,900; C ring 74,658 to 92,000;
 * B ring 92,000 to 117,580; Cassini Division 117,580 to 122,170; A ring
 * 122,170 to 136,775 with the Encke Gap (133,423 to 133,745) and Keeler Gap
 * (about 136,485 to 136,527). Source: NASA Saturn Fact Sheet ring table.
 * Uranus: the nine classical narrow rings, 41,837 km (ring 6) to 51,149 km
 * (epsilon), from the NASA Uranus Fact Sheet. */
function ringTexture(which) {
  const W = 2048, img = { data: new Uint8Array(W * 4) };
  const rnd = mulberry(which === "saturn" ? 11 : 13);
  const waves = Array.from({ length: 40 }, () => [rnd() * 900 + 40, rnd() * 6.28, rnd()]);
  const ripple = (x) => waves.reduce((s, [f, p, a]) => s + Math.sin(x * f + p) * a, 0) / 12;
  for (let i = 0; i < W; i++) {
    const u = (i + 0.5) / W;
    let rgb = [0, 0, 0], a = 0;
    if (which === "saturn") {
      const r = 74658 + (136775 - 74658) * u;
      const n = ripple(u);
      if (r < 92000) { a = 0.10 + 0.12 * ((r - 74658) / 17342) + 0.06 * n; rgb = [150, 136, 118]; }
      else if (r < 117580) {
        const k = (r - 92000) / 25580;
        a = 0.62 + 0.3 * Math.min(1, k * 2.2) + 0.12 * n; rgb = [226, 206, 170];
      } else if (r < 122170) { a = 0.05 + 0.05 * Math.abs(n) + (Math.abs(r - 120050) < 250 ? 0.18 : 0); rgb = [130, 118, 104]; }
      else {
        a = 0.52 + 0.1 * n - 0.1 * ((r - 122170) / 14605); rgb = [200, 186, 160];
        if (r > 133423 && r < 133745) a = 0.02;
        if (r > 136485 && r < 136527) a = 0.05;
        if (r > 136500) a *= 0.8;
      }
    } else {
      const r = 41837 + (51400 - 41837) * u;
      const rings = [[41837, 60], [42234, 60], [42571, 60], [44718, 70], [45661, 70], [47176, 60], [47627, 60], [48300, 60], [51149, 150]];
      for (const [rr, w] of rings) a = Math.max(a, Math.exp(-Math.pow((r - rr) / w, 2)) * (rr === 51149 ? 0.32 : 0.16));
      rgb = [120, 128, 136];   // the real rings are very dark (albedo of a few per cent)
    }
    a = Math.max(0, Math.min(1, a));
    img.data.set([rgb[0], rgb[1], rgb[2], Math.round(a * 255)], i * 4);
  }
  const t = new THREE.DataTexture(img.data, W, 1);
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
