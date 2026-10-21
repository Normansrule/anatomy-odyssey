// Tier 3: a heart scan (echocardiogram), on the measured heart. 1 scene unit = 1 cm.
//
// Trainee doctors learn to read heart ultrasound by matching the flat,
// grainy picture on the scanner to the 3D heart it slices, the idea behind
// the University of Toronto's Virtual TEE. Here the beam is a fan of light
// cutting the real heart (BodyParts3D, from the whole-body bundle), the half
// in front of the fan is taken away, and a scanner screen beside it draws the
// slice the way an echo machine shows it: tissue grainy and bright, blood
// black, the probe at the top, an ECG along the bottom. The control turns the
// probe through the four standard views. Until the bundle loads, the drawn
// heart stands in.
import * as THREE from 'three/webgpu';
import { materialBank, pick, disposeTree, seeded, COLORS } from './kit.js';
import { heartbeatScale } from './body.js';
import { bodyParts } from './bodyMeshes.js';
import { buildHeart } from './heart.js';
import { aorticRootOf, RESTING_BPM } from './heartMeasured.js';
import { organFrame, partOf, partsWhere, cutAway, keepNear, sectionLoops } from './organKit.js';
import { scanViews, viewAt, toImage, imageRight, ecgTrace, dot } from '../science/scanSlice.js';
import LANDMARKS from '../data/bodyLandmarks.json';

export const VIEW_TEXT = {
  a4c: 'Apical four-chamber view. The probe sits under the left breast, at the heart’s tip, and the beam fans up through all four chambers. The tip is at the top of the screen, the left ventricle on the right, and the tricuspid and mitral valves flick open and shut between the chambers.',
  a2c: 'Apical two-chamber view. The probe stays on the tip and turns about a quarter turn: now only the left side shows, the left ventricle and the left atrium, with the mitral valve between them.',
  alax: 'Apical long-axis view. Turned further round, the beam passes through the aortic valve: the left ventricle squeezes blood up and out into the aorta.',
  sax: 'Short-axis view. The probe moves to the front of the chest and the beam cuts straight across the ventricles, like a slice of bread: the thick left ventricle is a ring, the right ventricle a crescent wrapped against it.',
};

const W = 768; // the scanner screen, in canvas pixels
const H_PX = 576;
const APEX = [W / 2, 40]; // where the probe touches, at the top of the fan
const FAN_PX = 450;
const HALF_ANGLE = Math.PI / 4;
const LABELS = [
  ['rightAtrium', 'RA'],
  ['rightVentricle', 'RV'],
  ['leftAtrium', 'LA'],
  ['leftVentricle', 'LV'],
];

/** Build the heart scan, or the drawn heart until the bundle has loaded. */
export function buildHeartScan({ reducedMotion = false } = {}) {
  const parts = bodyParts();
  const wall = partOf(parts, 'heart', 'Heart');
  const H = LANDMARKS.heartChambers;
  if (!wall || !H) return buildHeart({ reducedMotion });
  const M = materialBank();
  const root = new THREE.Group();
  const { group, toScene } = organFrame(LANDMARKS.heart, 100);
  const heart = new THREE.Group(); // beats about the heart's center
  heart.add(group);
  // The heart, beam and probe turn together so the cut face is always toward you.
  const pivot = new THREE.Group();
  pivot.add(heart);
  root.add(pivot);
  const facing = new THREE.Quaternion();

  const aortic = aorticRootOf(parts, H);
  // Echo machines show the left ventricle on the right of the screen, beside the right one.
  const leftward = (v) => v.probe.map((x, i) => x + H.chambers.leftVentricle.center[i] - H.chambers.rightVentricle.center[i]);
  // Each probe sits back on the chest far enough for its fan to take in the slice
  const views = scanViews(H, aortic).map((v) => {
    const right = imageRight(v, leftward(v));
    const pts = sectionLoops(wall.geometry, v.probe, v.normal).flat().map((p) => toImage(p, v, right));
    // (all but the last few percent of it: a stray fold of wall need not push the whole picture away).
    const need = pts.map(([x, y]) => Math.abs(x) / Math.tan(HALF_ANGLE) - y).sort((a, b) => a - b);
    const back = Math.max(0, need[Math.floor(need.length * 0.96)] ?? 0) + 0.003;
    return { ...v, probe: v.probe.map((x, i) => x - v.down[i] * back) };
  });
  const lookFrom = views[0].normal[2] >= 0 ? views[0].normal : views[0].normal.map((x) => -x);

  // How deep the scanner looks: far enough to reach the far side of the heart from every view.
  const pos = wall.geometry.attributes.position.array;
  let reach = 0;
  for (const v of views) for (let i = 0; i < pos.length; i += 3) reach = Math.max(reach, dot([pos[i] - v.probe[0], pos[i + 1] - v.probe[1], pos[i + 2] - v.probe[2]], v.down));
  const depth = Math.ceil((reach + 0.008) * 100) / 100; // meters, a whole number of cm

  // The heart's parts, re-cut whenever the beam turns: everything in front of the fan is taken away.
  const art = M(COLORS.artery, { roughness: 0.4, side: THREE.DoubleSide, tissue: 'vessel', repeat: [1, 1] });
  const vein = M(COLORS.vein, { roughness: 0.4, side: THREE.DoubleSide, tissue: 'vein', repeat: [1, 1] });
  const valveMat = M(0xeadcc0, { roughness: 0.45, side: THREE.DoubleSide, tissue: 'fascia', repeat: [1, 1] });
  const pieces = [
    { geometry: wall.geometry, material: M(0xc4566a, { roughness: 0.5, tissue: 'organ', natural: 0xb24a5c, repeat: [1, 1] }), card: 'heart', label: 'Heart wall (myocardium)' },
    { geometry: wall.geometry, material: M(0x7e2c40, { roughness: 0.75, side: THREE.BackSide }), card: 'heart', label: 'Heart wall (myocardium, cut)' },
    ...partsWhere(parts, (p) => p.extras.card === 'heart-valves').map((p) => ({ geometry: p.geometry, material: valveMat, card: 'heart-valves', label: p.extras.label, valve: true })),
    ...partsWhere(parts, (p) => p.extras.card === 'coronary-arteries').map((p) => ({ geometry: p.geometry, material: /vein/i.test(p.extras.label) ? vein : art, card: 'coronary-arteries', label: p.extras.label })),
    ...partsWhere(parts, (p) => p.extras.card === 'aorta' && /Ascending|Arch/.test(p.extras.label)).map((p) => ({ geometry: p.geometry, material: art, card: 'aorta', label: p.extras.label, vessel: 'Ao' })),
    ...[['Pulmonary artery', vein, 'PA'], ['Superior vena cava', vein], ['Inferior vena cava', vein], ['Pulmonary vein', art]].flatMap(([label, material, tag]) => {
      const p = partOf(parts, 'great-vessels', label);
      return p ? [{ geometry: keepNear(p.geometry, LANDMARKS.heart, 0.055), material, card: 'great-vessels', label, vessel: tag, own: true }] : [];
    }),
  ].map((p) => {
    const mesh = pick(new THREE.Mesh(new THREE.BufferGeometry(), p.material), p.card, p.label);
    group.add(mesh);
    return { ...p, mesh };
  });

  // The beam: a flat fan of light from the probe, its edge, and the bright line where it meets the heart.
  const fanGeo = new THREE.CircleGeometry(1, 48, Math.PI / 2 - HALF_ANGLE, HALF_ANGLE * 2);
  fanGeo.rotateZ(Math.PI); // open downward: local x across, local −y along the beam
  const fan = pick(new THREE.Mesh(fanGeo, M.basic(0x4fc3ff, { transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })), 'echocardiogram', 'The ultrasound beam: a thin fan of sound from the probe');
  const edgePts = [new THREE.Vector3(0, 0, 0)];
  for (let i = 0; i <= 48; i++) {
    const a = -HALF_ANGLE + (2 * HALF_ANGLE * i) / 48;
    edgePts.push(new THREE.Vector3(Math.sin(a), -Math.cos(a), 0));
  }
  edgePts.push(new THREE.Vector3(0, 0, 0));
  const fanEdge = new THREE.Line(new THREE.BufferGeometry().setFromPoints(edgePts), M.line(0x9be8ff, { transparent: true, opacity: 0.7, toneMapped: false }));
  const beam = new THREE.Group();
  beam.add(fan, fanEdge);
  pivot.add(beam);
  const contour = new THREE.LineSegments(new THREE.BufferGeometry(), M.line(0xd8fbff, { toneMapped: false }));
  group.add(contour);

  // The probe: a rounded handle resting on the chest, its face along the beam.
  const probeGeo = new THREE.CapsuleGeometry(0.75, 2.6, 6, 16);
  probeGeo.translate(0, 2.05, 0);
  const probe = pick(new THREE.Mesh(probeGeo, M(0xd9dde3, { roughness: 0.35, metalness: 0.05 })), 'echocardiogram', 'The ultrasound probe');
  pivot.add(probe);

  // The scanner screen, drawn on a canvas and kept facing you beside the heart
  // (blank where there is no page to draw on, as in the tests).
  const canvas = typeof document === 'undefined' ? null : document.createElement('canvas');
  const ctx = canvas?.getContext('2d');
  if (canvas) {
    canvas.width = W;
    canvas.height = H_PX;
  }
  const texture = canvas ? new THREE.CanvasTexture(canvas) : new THREE.Texture();
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const monitor = new THREE.Group();
  const screenW = 16;
  const screen = pick(new THREE.Mesh(new THREE.PlaneGeometry(screenW, (screenW * H_PX) / W), M.basic(0xffffff, { map: texture, toneMapped: false })), 'echocardiogram', 'The scanner screen: the slice the beam cuts, as an echo machine shows it');
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(screenW + 1.0, (screenW * H_PX) / W + 1.0, 0.6), M(0x1d2026, { roughness: 0.4, metalness: 0.2 }));
  bezel.position.z = -0.32;
  monitor.add(bezel, screen);
  root.add(monitor);
  const lookAxis = new THREE.Vector3(...lookFrom);
  const sideways = new THREE.Vector3(0, 1, 0).cross(lookAxis).normalize(); // the camera's right, as the step opens
  const SIDE = 14; // cm from the heart's center to the screen's

  // Speckle: ultrasound shows tissue as grain stretched across the beam.
  const rand = seeded(5150);
  const grain = (size, count, alpha, rx, ry) => {
    if (!ctx) return null;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    for (let i = 0; i < count; i++) {
      const v = 120 + rand() * 135;
      g.fillStyle = `rgba(${v},${v},${v * 0.98},${alpha * (0.4 + rand() * 0.6)})`;
      g.beginPath();
      g.ellipse(rand() * size, rand() * size, rx * (0.5 + rand()), ry * (0.5 + rand()), 0, 0, Math.PI * 2);
      g.fill();
    }
    return ctx.createPattern(c, 'repeat');
  };
  const tissueGrain = grain(256, 2600, 0.75, 3.2, 1.3);
  const bloodGrain = grain(256, 260, 0.22, 2.2, 0.9);
  const shift = ctx ? new DOMMatrix() : null;

  // The current slice, flattened onto the screen (meters across, meters deep).
  let slice = { wall: [], valves: [], vessels: [], labels: [], name: '' };
  let s = 0;
  let dirty = true;
  let sinceCut = 1;

  function recut() {
    const v = viewAt(views, s);
    let n = v.normal;
    if (dot(n, lookFrom) < 0) n = n.map((x) => -x);
    facing.setFromUnitVectors(new THREE.Vector3(...n), new THREE.Vector3(...lookFrom));
    const point = v.probe;
    for (const p of pieces) {
      p.mesh.geometry.dispose();
      p.mesh.geometry = cutAway(p.geometry, point, n);
    }
    // The beam in the scene: the fan's plane, apex at the probe.
    const right = imageRight(v, leftward(v));
    const down = new THREE.Vector3(...v.down);
    const x = new THREE.Vector3(...right);
    beam.matrix.makeBasis(x, down.clone().negate(), x.clone().cross(down.clone().negate()));
    beam.matrix.scale(new THREE.Vector3(depth * 100, depth * 100, 1)).setPosition(...toScene(v.probe));
    beam.matrixAutoUpdate = false;
    probe.position.set(...toScene(v.probe));
    probe.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), down.clone().negate());
    // Where the beam meets the heart: outlines, in 3D and on the screen.
    const flat = (loop) => loop.map((p) => toImage(p, v, right));
    const loopsOf = (geometry) => sectionLoops(geometry, point, v.normal);
    const wallLoops = loopsOf(wall.geometry);
    const valveLoops = pieces.filter((p) => p.valve).flatMap((p) => loopsOf(p.geometry));
    const vesselLoops = pieces.filter((p) => p.vessel).flatMap((p) => loopsOf(p.geometry).map((l) => ({ l, tag: p.vessel })));
    const segs = [];
    for (const loop of [...wallLoops, ...valveLoops]) for (let i = 0; i < loop.length; i++) segs.push(...loop[i], ...loop[(i + 1) % loop.length]);
    contour.geometry.dispose();
    contour.geometry = new THREE.BufferGeometry();
    contour.geometry.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3));
    // A chamber is named where the slice crosses its hollow, at the middle of the crossing.
    const off = (c) => Math.abs(dot([c[0] - point[0], c[1] - point[1], c[2] - point[2]], v.normal));
    const labels = LABELS.flatMap(([k, t]) => {
      const cut = H.chambers[k].points.filter((c) => off(c) < 0.004).map((c) => toImage(c, v, right));
      return cut.length < 4 ? [] : [[t, cut.reduce((a, c) => a + c[0], 0) / cut.length, cut.reduce((a, c) => a + c[1], 0) / cut.length]];
    });
    if (off(aortic) < 0.008) labels.push(['Ao', ...toImage(aortic, v, right)]);
    slice = {
      wall: wallLoops.map(flat),
      valves: valveLoops.map(flat),
      vessels: vesselLoops.map(({ l }) => flat(l)),
      labels,
      name: v.near.name,
      lv: toImage(H.chambers.leftVentricle.center, v, right),
    };
    dirty = false;
    sinceCut = 0;
  }

  // The echo machine's picture.
  const k = FAN_PX / depth; // pixels per meter
  const px = ([x, y], at, squeeze) => [APEX[0] + (at[0] + (x - at[0]) * squeeze) * k, APEX[1] + (at[1] + (y - at[1]) * squeeze) * k];
  const sector = () => {
    ctx.beginPath();
    ctx.moveTo(...APEX);
    ctx.arc(APEX[0], APEX[1], FAN_PX, Math.PI / 2 + HALF_ANGLE, Math.PI / 2 - HALF_ANGLE, true);
    ctx.closePath();
  };
  const trace = (loops, at, squeeze, close) => {
    for (const loop of loops) {
      loop.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](...px(p, at, squeeze)));
      if (close) ctx.closePath();
    }
  };
  let ecgX = 0;
  function draw(phase, rate, live) {
    if (!ctx) return;
    const squeeze = 1 - (1 - heartbeatScale(phase)) * 3; // the beat, made easy to see
    const at = slice.lv;
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H_PX);
    sector();
    ctx.clip();
    if (live) {
      // The grain shimmers frame to frame.
      shift.e = rand() * 6;
      shift.f = rand() * 4;
    }
    bloodGrain.setTransform(shift);
    tissueGrain.setTransform(shift);
    ctx.fillStyle = bloodGrain;
    ctx.fillRect(0, 0, W, H_PX);
    // Muscle: everything between the outer surface and the chamber linings.
    ctx.beginPath();
    trace(slice.wall, at, squeeze, true);
    ctx.fillStyle = 'rgba(70,70,68,1)';
    ctx.fill('evenodd');
    ctx.fillStyle = tissueGrain;
    ctx.fill('evenodd');
    // Edges echo brightest: the sac round the heart, the linings, the valves and vessel walls.
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(235,235,228,0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    trace(slice.wall.slice(0, 1), at, squeeze, true);
    ctx.stroke();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(220,220,214,0.4)';
    ctx.beginPath();
    trace(slice.wall.slice(1), at, squeeze, true);
    trace(slice.vessels, at, squeeze, false);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(250,250,244,0.85)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    trace(slice.valves, at, squeeze, false);
    ctx.stroke();
    // Near the probe the picture is hazy; deep down the echoes fade.
    const haze = ctx.createRadialGradient(APEX[0], APEX[1], 0, APEX[0], APEX[1], 70);
    haze.addColorStop(0, 'rgba(200,200,195,0.35)');
    haze.addColorStop(1, 'rgba(200,200,195,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, W, H_PX);
    const fade = ctx.createRadialGradient(APEX[0], APEX[1], FAN_PX * 0.45, APEX[0], APEX[1], FAN_PX);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, W, H_PX);
    ctx.restore();
    // Chamber names, where the slice crosses them.
    ctx.font = '600 20px Archivo, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd86b';
    for (const [t, x, y] of slice.labels) ctx.fillText(t, ...px([x, y], at, squeeze));
    // The machine's own marks: view, depth scale, heart rate.
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e8edf2';
    ctx.font = '600 22px Archivo, system-ui, sans-serif';
    ctx.fillText(slice.name, 22, 28);
    ctx.font = '500 15px Archivo, system-ui, sans-serif';
    ctx.fillStyle = '#9aa7b4';
    ctx.fillText(`Depth ${Math.round(depth * 100)} cm`, 22, 54);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#7dffa1';
    ctx.font = '600 22px Archivo, system-ui, sans-serif';
    ctx.fillText(`HR ${Math.round(rate)}`, W - 22, 28);
    ctx.fillStyle = '#9aa7b4';
    for (let cm = 0; cm <= Math.round(depth * 100); cm++) {
      const y = APEX[1] + cm * 0.01 * k;
      ctx.fillRect(W - 40 - (cm % 5 ? 0 : 6), y, cm % 5 ? 4 : 10, 2);
      if (cm % 5 === 0 && cm) {
        ctx.font = '500 13px Archivo, system-ui, sans-serif';
        ctx.fillText(String(cm), W - 50, y + 1);
      }
    }
    // The ECG, swept left to right, with a gap ahead of the pen.
    const top = H_PX - 66;
    const strip = W - 44;
    const perPx = rate / 60 / 160; // beats per pixel, at 160 px a second
    ctx.strokeStyle = '#4cff86';
    ctx.lineWidth = 2;
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i < strip; i++) {
      const behind = (ecgX - i + strip) % strip;
      if (strip - behind < 14) {
        pen = false;
        continue;
      }
      const ph = (((phase - behind * perPx) % 1) + 1) % 1;
      const y = top + 34 - ecgTrace(ph) * 30;
      ctx[pen ? 'lineTo' : 'moveTo'](22 + i, y);
      pen = true;
    }
    ctx.stroke();
    texture.needsUpdate = true;
  }

  // The control: turn the probe through the views.
  const controls = {
    label: 'Probe view',
    unit: '',
    min: 0,
    max: 3,
    step: 0.01,
    value: 0,
    format: (v) => viewAt(views, v).near.name,
    presets: views.map((v, i) => ({ label: v.name, value: i })),
    set(v) {
      controls.value = v;
      s = v;
      dirty = true;
      return VIEW_TEXT[viewAt(views, v).near.id];
    },
  };
  controls.set(0);
  recut();

  let phase = 0.5;
  let clock = 1;
  const rate = RESTING_BPM;
  draw(phase, rate, false);
  const cam = new THREE.Vector3();
  function placeMonitor(camera) {
    const r = camera ? cam.set(1, 0, 0).applyQuaternion(camera.quaternion) : sideways;
    monitor.position.copy(r).multiplyScalar(SIDE);
    // A little toward you, so the turning heart and its beam never pass in front of the screen.
    if (camera) monitor.position.add(cam.set(0, 0, 1).applyQuaternion(camera.quaternion).multiplyScalar(5));
    else monitor.position.addScaledVector(lookAxis, 5);
    if (camera) monitor.quaternion.copy(camera.quaternion);
    else monitor.lookAt(lookAxis);
  }
  placeMonitor(null);
  pivot.quaternion.copy(facing);

  return {
    root,
    fit: 'both',
    metersPerUnit: 0.01,
    frameWidth: 0.36,
    detailed: true,
    view: { target: sideways.clone().multiplyScalar(SIDE / 2).toArray(), direction: lookFrom },
    focus: sideways.clone().multiplyScalar(SIDE / 2).toArray(),
    controls,
    picture: () => slice, // what the screen shows: outlines (meters across, meters deep) and labels
    depth,
    update(dt, env = {}) {
      sinceCut += dt;
      if (dirty && sinceCut > 0.08) recut();
      placeMonitor(env.camera);
      if (reducedMotion) pivot.quaternion.copy(facing);
      else pivot.quaternion.slerp(facing, 1 - Math.exp(-dt * 4));
      if (reducedMotion) {
        if (sinceCut === 0) draw(phase, rate, false);
        return;
      }
      const beats = (dt * rate) / 60;
      phase = (phase + beats) % 1;
      ecgX = (ecgX + dt * 160) % (W - 44);
      heart.scale.setScalar(heartbeatScale(phase));
      clock += dt;
      if (clock > 1 / 30) {
        clock = 0;
        draw(phase, rate, true);
      }
    },
    dispose() {
      fanGeo.dispose();
      probeGeo.dispose();
      texture.dispose();
      for (const p of pieces) if (p.own) p.geometry.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
