// Tier 3: the eye, cut in half horizontally and seen from above. 1 scene unit = 1 mm.
// Sizes from EyeWiki (American Academy of Ophthalmology): axial length 24 mm
// (normal 23–25), cornea 12 mm across and 0.54 mm thick, anterior chamber
// 3 mm deep, lens about 9.5 mm across, fovea 1.5 mm, optic nerve head about
// 1.8 mm, pupil 2–4 mm in bright light and 4–8 mm in the dark.
// Light enters from the left (−x): the cornea and lens bend it onto the fovea.
// The control is the light level: the iris closes the pupil in bright light
// and opens it in the dark (OpenStax 14.1).
import * as THREE from 'three/webgpu';
import { materialBank, pick, tubeThrough, seeded, disposeTree, COLORS } from './kit.js';

export const EYE_MM = { axial: 24, cornea: 12, corneaThickness: 0.54, chamber: 3, lens: 9.5, lensThickness: 4, fovea: 1.5, disc: 1.8 };
export const PUPIL_MM = { bright: 3, dark: 7 };
const R = EYE_MM.axial / 2;
const C = R; // centre of the globe on the optical axis (a = 0 at the cornea's apex)
const LIMBUS = Math.asin(EYE_MM.cornea / 2 / R); // angle from the front where the cornea meets the sclera
const CORNEA_R = 7.8; // typical radius of curvature of the front of the cornea
/** Where the fovea and optic disc sit: on the back wall, disc about 4 mm to the nasal side (+z here). */
export const FOVEA_ANGLE = Math.PI; // the posterior pole
const DISC_ANGLE = Math.PI - 0.34;
/** Pupil diameter for a light level from 0 (dark) to 1 (bright). */
export const pupilDiameter = (light) => PUPIL_MM.dark + (PUPIL_MM.bright - PUPIL_MM.dark) * light;

/** A point on a circle of radius r around the globe's centre, at angle t (0 = front, π = back). */
const onGlobe = (t, r) => [C - r * Math.cos(t), r * Math.sin(t)]; // [a, radial]

export function buildEye() {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(1414);
  // Lathed parts are built around the local y axis (profile = [radius, a]), then turned so
  // the optical axis runs along world x and the kept half lies below the cut (y < 0).
  const eye = new THREE.Group();
  eye.rotation.z = -Math.PI / 2;
  root.add(eye);
  const toWorld = (a, r) => [a, 0, r]; // a point on the cut plane
  const lathe = (profile, mat, card, label, segs = 48) => {
    const m = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([a, r]) => new THREE.Vector2(Math.max(0, r), a)), segs, 0, Math.PI), mat);
    eye.add(pick(m, card, label));
    return m;
  };
  const arc = (t0, t1, r, n = 48) => Array.from({ length: n + 1 }, (_, i) => onGlobe(t0 + ((t1 - t0) * i) / n, r));

  // The three coats of the wall: sclera, choroid, retina (thicknesses exaggerated a little).
  const coats = [
    { r0: R, r1: R - 0.7, t0: LIMBUS, color: 0xf2eee6, card: 'sclera', label: 'Sclera (the white of the eye)' },
    { r0: R - 0.7, r1: R - 1.0, t0: LIMBUS + 0.12, color: 0x5a3028, card: 'sclera', label: 'Choroid (blood supply for the retina)' },
    { r0: R - 1.0, r1: R - 1.25, t0: LIMBUS + 0.3, color: 0xe8a07a, card: 'retina', label: 'Retina' },
  ];
  for (const k of coats) {
    // Inner surface faces the viewer through the cut; the outer only matters for the sclera.
    lathe(arc(k.t0, Math.PI, k.r1), M(k.color, { roughness: 0.55, side: THREE.DoubleSide }), k.card, k.label);
    if (k.card === 'sclera' && k.r0 === R) lathe(arc(k.t0, Math.PI, k.r0), M(k.color, { roughness: 0.45, tissue: 'organ', natural: 0xf0ebe0, side: THREE.DoubleSide }), k.card, k.label);
    // The band on the cut plane, one on each side of the axis, joined at the back.
    const s = new THREE.Shape();
    const outer = [...arc(k.t0, Math.PI, k.r0), ...arc(Math.PI, k.t0, k.r0).map(([a, r]) => [a, -r]).slice(1)];
    const inner = [...arc(k.t0, Math.PI, k.r1), ...arc(Math.PI, k.t0, k.r1).map(([a, r]) => [a, -r]).slice(1)].reverse();
    s.moveTo(...outer[0]);
    for (const p of [...outer.slice(1), ...inner]) s.lineTo(...p);
    const face = new THREE.Mesh(new THREE.ShapeGeometry(s), M(k.color, { roughness: 0.6 }));
    face.rotation.x = -Math.PI / 2; // shape (a, r) → world (x = a, z = −r) on the cut plane, facing up (the shapes are symmetric)
    face.position.y = 0.01;
    root.add(pick(face, k.card, `${k.label}, cut`));
  }

  // Cornea: a cap 12 mm across and about half a millimeter thick.
  const capProfile = (rc, depth) => {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const r = (EYE_MM.cornea / 2) * (i / 24);
      pts.push([depth + (rc - Math.sqrt(rc * rc - r * r)), r]);
    }
    return pts;
  };
  const sag = CORNEA_R - Math.sqrt(CORNEA_R ** 2 - (EYE_MM.cornea / 2) ** 2);
  const limbusA = onGlobe(LIMBUS, R)[0];
  const corneaFront = capProfile(CORNEA_R, limbusA - sag);
  const corneaBack = capProfile(CORNEA_R - 0.6, limbusA - sag + EYE_MM.corneaThickness);
  const corneaMat = M(0xcfe6f2, { roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
  lathe(corneaFront, corneaMat, 'cornea', 'Cornea (clear; does most of the focusing)');
  const cs = new THREE.Shape();
  const cOuter = [...corneaFront.map(([a, r]) => [a, -r]).reverse(), ...corneaFront.slice(1)];
  const cInner = [...corneaBack.map(([a, r]) => [a, -r]).reverse(), ...corneaBack.slice(1)].reverse();
  cs.moveTo(...cOuter[0]);
  for (const p of [...cOuter.slice(1), ...cInner]) cs.lineTo(...p);
  const cFace = new THREE.Mesh(new THREE.ShapeGeometry(cs), M(0x9fd0e8, { roughness: 0.2, transparent: true, opacity: 0.8 }));
  cFace.rotation.x = -Math.PI / 2;
  cFace.position.y = 0.012;
  root.add(pick(cFace, 'cornea', 'Cornea, cut (about 0.5 mm thick)'));

  // Aqueous humor (front chamber) and vitreous body: faint fills on the cut plane.
  const fill = (pts, color, card, label) => {
    const s = new THREE.Shape();
    s.moveTo(...pts[0]);
    for (const p of pts.slice(1)) s.lineTo(...p);
    const m = new THREE.Mesh(new THREE.ShapeGeometry(s), M(color, { roughness: 0.3, transparent: true, opacity: 0.35, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.005;
    root.add(pick(m, card, label));
  };
  const lensA = EYE_MM.chamber + EYE_MM.corneaThickness + 0.3 + EYE_MM.lensThickness / 2; // lens centre on the axis
  const vit = [...arc(LIMBUS + 0.5, Math.PI, R - 1.25), ...arc(Math.PI, LIMBUS + 0.5, R - 1.25).map(([a, r]) => [a, -r]).slice(1)];
  fill([[lensA + 1.6, -4.6], ...vit.reverse(), [lensA + 1.6, 4.6]], 0xdfe8f0, 'vitreous-humor', 'Vitreous humor (clear gel)');
  fill([...corneaBack.map(([a, r]) => [a, -r]).reverse(), ...corneaBack.slice(1), [lensA - 2, 6], [lensA - 2, -6]], 0xd6ecf8, 'vitreous-humor', 'Aqueous humor (watery fluid in front of the lens)');

  // Lens: biconvex, on its zonule fibers from the ciliary body.
  const lensProfile = Array.from({ length: 25 }, (_, i) => {
    const t = (i / 24) * Math.PI;
    const r = (EYE_MM.lens / 2) * Math.sin(t);
    const a = lensA - (EYE_MM.lensThickness / 2) * Math.cos(t) * (t < Math.PI / 2 ? 0.85 : 1.15);
    return [a, r];
  });
  const lensMat = M(0xf4e4b0, { roughness: 0.1, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
  lathe(lensProfile, lensMat, 'lens', 'Lens (fine focusing)');
  const ls = new THREE.Shape();
  const lp = [...lensProfile, ...lensProfile.slice(0, -1).reverse().map(([a, r]) => [a, -r])];
  ls.moveTo(...lp[0]);
  for (const p of lp.slice(1)) ls.lineTo(...p);
  const lFace = new THREE.Mesh(new THREE.ShapeGeometry(ls), M(0xf0d890, { roughness: 0.3 }));
  lFace.rotation.x = -Math.PI / 2;
  lFace.position.y = 0.015;
  root.add(pick(lFace, 'lens', 'Lens, cut'));
  // Ciliary body (a ring behind the iris root) and zonules.
  const cil = M(0x6a3a30, { roughness: 0.55 });
  const ciliaryRing = [onGlobe(LIMBUS + 0.08, R - 0.7), onGlobe(LIMBUS + 0.45, R - 0.9), [lensA + 0.4, 5.9], [lensA - 0.8, 6.2]];
  lathe([...ciliaryRing, ciliaryRing[0]], cil, 'lens', 'Ciliary body (its muscle changes the lens’s shape)');
  for (const side of [1, -1]) {
    const s = new THREE.Shape();
    s.moveTo(ciliaryRing[0][0], side * ciliaryRing[0][1]);
    for (const [a, r] of ciliaryRing.slice(1)) s.lineTo(a, side * r);
    const m = new THREE.Mesh(new THREE.ShapeGeometry(s), M(0x6a3a30, { roughness: 0.6, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.02;
    root.add(pick(m, 'lens', 'Ciliary body, cut'));
    for (let k = 0; k < 5; k++) {
      const f = k / 4;
      root.add(pick(tubeThrough([toWorld(lensA - 0.6 + f * 1.2, side * (EYE_MM.lens / 2 - 0.1)), toWorld(lensA - 0.3 + f * 0.6, side * 5.5), toWorld(lensA - 0.5 + f * 0.9, side * 6)], 0.03, M(0xf2eee6, { roughness: 0.4 }), 8, 3), 'lens', 'Zonule fibers (hold the lens)'));
    }
  }

  // Iris: a ring whose hole, the pupil, the control opens and closes.
  const irisA = EYE_MM.chamber + EYE_MM.corneaThickness + 0.15;
  const irisMat = M(0x4a6a8a, { roughness: 0.5, side: THREE.DoubleSide });
  const irisRing = new THREE.Mesh(new THREE.RingGeometry(1, 6.1, 64, 1, 0, Math.PI), irisMat);
  irisRing.rotation.y = Math.PI / 2; // face along the optical axis
  irisRing.rotation.x = Math.PI; // keep the lower half
  irisRing.position.x = irisA;
  root.add(pick(irisRing, 'iris', 'Iris (a muscle ring; its hole is the pupil)'));
  const irisCut = [];
  for (const side of [1, -1]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.02, 1), M(0x3a5470, { roughness: 0.5 }));
    m.position.set(irisA, 0.02, 0);
    m.userData.side = side;
    root.add(pick(m, 'iris', 'Iris, cut'));
    irisCut.push(m);
  }

  // Fovea, macula and optic disc on the back wall; the optic nerve leaving.
  const [fa, fr] = onGlobe(FOVEA_ANGLE, R - 1.25);
  const macula = new THREE.Mesh(new THREE.CircleGeometry(2.6, 32, 0, Math.PI), M(0xe8c45a, { roughness: 0.5, transparent: true, opacity: 0.7 }));
  macula.rotation.set(0, -Math.PI / 2, 0);
  macula.position.set(fa - 0.04, 0, fr);
  macula.rotation.z = Math.PI;
  root.add(pick(macula, 'fovea', 'Macula, with the fovea at its centre (sharpest vision)'));
  const fovea = pick(new THREE.Mesh(new THREE.SphereGeometry(EYE_MM.fovea / 2, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M(0xd88a3a, { roughness: 0.4 })), 'fovea', 'Fovea (a pit 1.5 mm across, only cones)');
  fovea.position.set(fa - 0.05, 0, fr);
  root.add(fovea);
  const [da, dr] = onGlobe(DISC_ANGLE, R);
  const discDir = new THREE.Vector3(da - C, 0, dr).normalize();
  const nerveMat = M(COLORS.nerve, { roughness: 0.5, tissue: 'nerve' });
  const nervePts = [0, 3, 7, 11].map((k) => new THREE.Vector3(da, 0, dr).addScaledVector(discDir, k - 1.2));
  const nerveTube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(nervePts), 24, EYE_MM.disc / 2 + 0.6, 16, 0, ), nerveMat);
  root.add(pick(nerveTube, 'optic-nerve', 'Optic nerve (about a million ganglion cell axons)'));
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(EYE_MM.disc / 2, EYE_MM.disc / 2, 0.3, 24), M(0xf5e6a8, { roughness: 0.4 }));
  disc.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), discDir);
  disc.position.set(da, 0, dr).addScaledVector(discDir, -1.2);
  root.add(pick(disc, 'optic-nerve', 'Optic disc: the blind spot (no photoreceptors)'));
  const artMat = M(COLORS.artery, { roughness: 0.4 });
  for (let k = 0; k < 4; k++) {
    const t = DISC_ANGLE + (k - 1.5) * 0.35;
    const pts = [onGlobe(DISC_ANGLE, R - 1.3), onGlobe(t + (k < 2 ? -0.2 : 0.2), R - 1.3), onGlobe(t + (k < 2 ? -0.6 : 0.5), R - 1.3)].map(([a, r]) => [a, -0.05 - k * 0.02, r]);
    root.add(pick(tubeThrough(pts, 0.08, artMat, 16, 4), 'retina', 'Retinal blood vessel'));
  }

  // Light rays from a distant point, bent by the cornea and lens onto the fovea.
  const rayMat = M(0xfff2b0, { roughness: 0.2, emissive: 0xffe28a, emissiveIntensity: 0.9 });
  const rays = [];
  for (let i = 0; i < 7; i++) {
    const h = (i / 6 - 0.5) * 2; // −1 … 1 across the pupil
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), rayMat);
    mesh.userData.h = h;
    root.add(pick(mesh, 'cornea', 'Light, bent by the cornea and lens onto the fovea'));
    rays.push(mesh);
  }
  const placeRays = (pupil) => {
    for (const ray of rays) {
      const z0 = ray.userData.h * (pupil / 2) * 0.92;
      const pts = [[-12, 0.4, z0], [corneaFront[0][0] + 0.2, 0.4, z0], [lensA, 0.4, z0 * 0.92], [fa - 0.3, 0.4, fr]].map((p) => new THREE.Vector3(...p));
      ray.geometry.dispose();
      ray.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'chordal'), 48, 0.07, 5, false);
    }
  };

  // Two extraocular muscles (cut) for context.
  const muscleMat = M(COLORS.muscle, { roughness: 0.5, tissue: 'muscle', repeat: [1, 3] });
  for (const side of [1, -1]) {
    const p0 = onGlobe(1.3, R + 0.4);
    root.add(pick(tubeThrough([[p0[0], -0.6, side * p0[1]], [C + 6, -0.8, side * (R + 1.2)], [C + 18, -1, side * 6]], 1.3, muscleMat, 24, 10), 'eye', side > 0 ? 'Medial rectus muscle (turns the eye)' : 'Lateral rectus muscle (turns the eye)'));
  }
  void rand;

  function pose(light) {
    const pupil = pupilDiameter(light);
    irisRing.geometry.dispose();
    irisRing.geometry = new THREE.RingGeometry(pupil / 2, 6.1, 64, 1, 0, Math.PI);
    for (const m of irisCut) {
      const len = 6.1 - pupil / 2;
      m.scale.z = len;
      m.position.z = m.userData.side * (pupil / 2 + len / 2);
    }
    placeRays(pupil);
  }
  const controls = {
    label: 'Light',
    unit: '',
    min: 0,
    max: 1,
    step: 0.01,
    value: 1,
    format: (v) => `Pupil ${pupilDiameter(v).toFixed(1)} mm`,
    presets: [
      { label: 'Dark room', value: 0 },
      { label: 'Bright light', value: 1 },
    ],
    set(v) {
      controls.value = v;
      pose(v);
      return v < 0.5
        ? `Dim light: the iris relaxes and the pupil widens (here ${pupilDiameter(v).toFixed(1)} mm; 4 to 8 mm in the dark) to let in more light, at the cost of some sharpness.`
        : `Bright light: the iris tightens and the pupil narrows (here ${pupilDiameter(v).toFixed(1)} mm; 2 to 4 mm in bright light). The cornea and lens focus the image, upside down, on the fovea.`;
    },
  };
  controls.set(1);

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-3,
    frameWidth: 0.046,
    view: { target: [8, 0, 1], direction: [0.04, 1, 0.5] },
    focus: [fa - 0.3, 0.2, fr],
    controls,
    dispose() {
      disposeTree(root);
      M.dispose();
    },
  };
}
