// Tier 3: the right ear in a front-to-back (coronal) section, seen from the front.
// 1 scene unit = 1 mm. Sound travels left to right: the auricle and ear canal
// (outer ear), the eardrum and the three ossicles in the air-filled middle
// ear with the Eustachian tube draining to the throat, then the inner ear in
// the temporal bone: the cochlea (a cone about 9 mm across at its base and
// 5 mm tall, coiled two and a half turns; Britannica), the vestibule and
// the three semicircular canals, and the vestibulocochlear nerve.
// The control is pitch, from 20 Hz to 20 kHz (OpenStax 14.1): high notes
// move the basilar membrane near the base of the cochlea, low notes near its tip.
import * as THREE from 'three/webgpu';
import { materialBank, pick, tubeThrough, taperedTube, capsuleBetween, ellipsoid, disposeTree, COLORS } from './kit.js';

export const COCHLEA_MM = { base: 9, height: 5, turns: 2.5, uncoiled: 30 };
export const HEARING_HZ = [20, 20000];
const CO = new THREE.Vector3(15, -3, -1); // centre of the cochlea's base

/** Frequency (Hz) for a pitch control value from 0 (20 Hz) to 1 (20 kHz). */
export const pitchHz = (v) => HEARING_HZ[0] * (HEARING_HZ[1] / HEARING_HZ[0]) ** v;
/** Where along the cochlea (0 = base, by the oval window; 1 = apex) a frequency is sensed. */
export const placeOf = (hz) => Math.log(HEARING_HZ[1] / hz) / Math.log(HEARING_HZ[1] / HEARING_HZ[0]);

/** A point on the cochlear spiral at s (0 base … 1 apex): radius shrinks, height grows. */
export function cochleaPoint(s) {
  const a = -0.6 + s * COCHLEA_MM.turns * Math.PI * 2;
  const r = (COCHLEA_MM.base / 2) * (1 - 0.72 * s);
  return new THREE.Vector3(CO.x + Math.cos(a) * r, CO.y + Math.sin(a) * r, CO.z + s * COCHLEA_MM.height);
}

export function buildEar({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();

  // Temporal bone around the middle and inner ear, see-through.
  const bone = new THREE.Mesh(new THREE.BoxGeometry(42, 38, 18), M(0xe9dfc8, { roughness: 0.6, tissue: 'bone', transparent: true, opacity: 0.16, depthWrite: false }));
  bone.position.set(13, -2, -3);
  bone.userData.pickPriority = -1;
  root.add(pick(bone, 'ear', 'Temporal bone (houses the middle and inner ear)'));
  // The side of the head (skin), with the auricle standing out from it.
  const skinMat = M(0xd8b29a, { roughness: 0.5, tissue: 'skin', natural: 0xcbb2a2 });
  const side = new THREE.Mesh(new THREE.BoxGeometry(3, 46, 22), skinMat);
  side.position.set(-22.5, 0, -3);
  root.add(pick(side, 'auricle', 'Skin on the side of the head'));
  const ear = new THREE.Shape();
  ear.moveTo(0, -14);
  ear.bezierCurveTo(-9, -16, -12, -4, -11, 6);
  ear.bezierCurveTo(-10, 16, 2, 22, 9, 15);
  ear.bezierCurveTo(13, 10, 11, 2, 6, -2);
  ear.bezierCurveTo(4, -6, 4, -11, 0, -14);
  const auricle = new THREE.Mesh(new THREE.ExtrudeGeometry(ear, { depth: 2.5, bevelEnabled: true, bevelThickness: 0.8, bevelSize: 0.8, bevelSegments: 3 }), skinMat);
  auricle.rotation.y = -Math.PI / 2 + 1.05; // stands out from the head, turned so its outline faces the viewer
  auricle.position.set(-25, 2, 4);
  root.add(pick(auricle, 'auricle', 'Auricle (the outer ear)'));

  // Ear canal to the eardrum.
  const canalMat = M(0xe0a890, { roughness: 0.5, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
  root.add(pick(taperedTube([[-24, 1, 0], [-17, 2.5, 0], [-9, 1.5, 0], [-0.4, 0.6, 0]], (t) => 3.6 - 0.6 * t, canalMat, 48, 18), 'auricle', 'Ear canal (external auditory canal)'));
  const drum = new THREE.Mesh(new THREE.ConeGeometry(4.4, 1.6, 32, 1, true), M(0xf0c8b8, { roughness: 0.4, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
  drum.rotation.z = -Math.PI / 2 + 0.25; // its tip (the umbo) points inward, and it is tilted
  drum.position.set(0, 0.6, 0);
  root.add(pick(drum, 'tympanic-membrane', 'Eardrum (tympanic membrane)'));

  // Ossicles: malleus on the eardrum, incus, stapes in the oval window.
  const ossMat = M(0xf2ead8, { roughness: 0.45, tissue: 'bone' });
  const ossicles = new THREE.Group();
  root.add(ossicles);
  ossicles.add(pick(capsuleBetween([0.9, 0.6, 0], [1.6, 5.4, 0], 0.45, ossMat, 8), 'ossicles', 'Malleus (hammer): its handle is fixed to the eardrum'));
  ossicles.add(pick(ellipsoid([2.4, 6.6, 0], [1.4, 1.7, 1.3], ossMat, 14), 'ossicles', 'Malleus head'));
  ossicles.add(pick(ellipsoid([4.3, 6.8, -0.3], [1.4, 1.4, 1.2], ossMat, 14), 'ossicles', 'Incus (anvil)'));
  ossicles.add(pick(capsuleBetween([4.6, 6, -0.3], [5.4, 2.6, -0.2], 0.4, ossMat, 8), 'ossicles', 'Incus, long process'));
  const stapes = new THREE.Group();
  stapes.add(pick(capsuleBetween([5.4, 2.6, -0.2], [7.6, 3.2, 0.6], 0.22, ossMat, 6), 'ossicles', 'Stapes (stirrup), the smallest bone in the body'));
  stapes.add(pick(capsuleBetween([5.4, 2.6, -0.2], [7.6, 2.0, -0.8], 0.22, ossMat, 6), 'ossicles', 'Stapes (stirrup)'));
  const foot = ellipsoid([7.8, 2.6, -0.1], [0.3, 1.1, 1.4], ossMat, 14);
  stapes.add(pick(foot, 'ossicles', 'Stapes footplate, in the oval window'));
  ossicles.add(stapes);
  const middle = ellipsoid([4, 3, 0], [5.2, 7, 4.5], M(0xcfe6f2, { roughness: 0.3, transparent: true, opacity: 0.12, depthWrite: false }), 24);
  middle.userData.pickPriority = -1;
  root.add(pick(middle, 'ossicles', 'Middle ear (an air-filled cavity)'));
  root.add(pick(taperedTube([[4, -3.5, 0.5], [9, -12, 3], [16, -20, 6], [22, -27, 9]], (t) => 1 + 1.2 * t, M(0xe6a8a0, { roughness: 0.5 }), 40, 12), 'eustachian-tube', 'Eustachian tube (to the throat)'));

  // Inner ear: vestibule, semicircular canals, cochlea.
  const innerMat = M(0xf0e6c8, { roughness: 0.4 });
  root.add(pick(ellipsoid([10.5, 3, -0.6], [2.6, 2.8, 2.2], innerMat, 18), 'semicircular-canals', 'Vestibule (senses head tilt and acceleration)'));
  const canals = [
    { at: [13, 9.5, -1], rot: [0, 0, 0], label: 'Anterior semicircular canal' },
    { at: [15.5, 6.5, -2.5], rot: [Math.PI / 2, 0, 0], label: 'Lateral semicircular canal' },
    { at: [12, 7.5, -4.5], rot: [0, Math.PI / 2, 0], label: 'Posterior semicircular canal' },
  ];
  for (const c of canals) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.45, 10, 40), innerMat);
    t.position.set(...c.at);
    t.rotation.set(...c.rot);
    root.add(pick(t, 'semicircular-canals', `${c.label} (senses head rotation)`));
  }
  const spiral = Array.from({ length: 121 }, (_, i) => cochleaPoint(i / 120));
  const spiralCurve = new THREE.CatmullRomCurve3(spiral);
  const cochlea = taperedTube(spiral.map((p) => p.toArray()), (t) => 1.35 - 0.75 * t, M(0xf2e4c0, { roughness: 0.35, tissue: 'bone' }), 360, 16);
  root.add(pick(cochlea, 'cochlea', 'Cochlea (hearing): a fluid-filled spiral, two and a half turns'));
  // Link from the base of the cochlea to the vestibule, by the oval window.
  root.add(pick(tubeThrough([[8.2, 2.4, -0.4], [9.6, 1, -0.6], spiral[0].toArray()], 1.2, innerMat, 16, 10), 'cochlea', 'Base of the cochlea, behind the oval window'));
  root.add(pick(ellipsoid([9.6, -1.6, -0.2], [0.35, 1, 1.2], M(0xf6d6e0, { roughness: 0.4 }), 12), 'cochlea', 'Round window (lets the cochlear fluid bulge out)'));
  // Vestibulocochlear nerve.
  root.add(pick(tubeThrough([[CO.x, CO.y, CO.z + 2], [20, 0, -2], [27, 1, -3], [34, 1.5, -3]], 1.5, M(COLORS.nerve, { roughness: 0.45, tissue: 'nerve' }), 32, 12), 'vestibulocochlear-nerve', 'Vestibulocochlear nerve (to the brainstem)'));
  root.add(pick(tubeThrough([[11.5, 4.5, -2], [17, 3, -2.5], [21, 0.5, -2]], 0.6, M(COLORS.nerve, { roughness: 0.45, tissue: 'nerve' }), 16, 6), 'vestibulocochlear-nerve', 'Vestibular branch'));

  // The place along the cochlea that a pitch moves (glows).
  const placeMat = M(0xffe28a, { roughness: 0.3, emissive: 0xffd36a, emissiveIntensity: 1, transparent: true, opacity: 0.9 });
  const place = new THREE.Mesh(new THREE.BufferGeometry(), placeMat);
  root.add(pick(place, 'basilar-membrane', 'The part of the basilar membrane this pitch moves most'));
  const showPlace = (s) => {
    const a = Math.max(0, s - 0.045);
    const b = Math.min(1, s + 0.045);
    const pts = Array.from({ length: 13 }, (_, i) => spiralCurve.getPointAt(a + ((b - a) * i) / 12));
    place.geometry.dispose();
    place.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 1.45 - 0.75 * s, 12, false);
  };

  // Sound waves arriving at the ear: arcs that travel toward the canal.
  const waveMat = M(0x9fd4ff, { roughness: 0.2, emissive: 0x9fd4ff, emissiveIntensity: 0.6, transparent: true, opacity: 0.6 });
  const waves = Array.from({ length: 5 }, (_, k) => {
    const w = new THREE.Mesh(new THREE.TorusGeometry(9, 0.25, 6, 40, Math.PI * 0.6), waveMat);
    w.rotation.z = Math.PI - Math.PI * 0.3;
    w.userData.k = k;
    root.add(pick(w, 'auricle', 'Sound waves (pressure waves in air)'));
    return w;
  });
  let phase = 0;
  let hz = 1000;
  const placeWaves = () => {
    const spacing = 2 + 6 * (1 - placeOf(hz)); // longer wavelengths drawn wider apart (schematic)
    for (const w of waves) {
      const d = ((w.userData.k + phase) % 5) * spacing;
      w.position.set(-28 - 5 * spacing + d + 9, 1, 0);
      w.visible = w.position.x < -16;
    }
  };

  const controls = {
    label: 'Pitch',
    unit: '',
    min: 0,
    max: 1,
    step: 0.01,
    value: 0.6,
    format: (v) => {
      const f = pitchHz(v);
      return f >= 1000 ? `${(f / 1000).toFixed(f >= 10000 ? 0 : 1)} kHz` : `${Math.round(f)} Hz`;
    },
    presets: [
      { label: '20 Hz', value: 0 },
      { label: '200 Hz', value: 1 / 3 },
      { label: '2 kHz', value: 2 / 3 },
      { label: '20 kHz', value: 1 },
    ],
    set(v) {
      controls.value = v;
      hz = pitchHz(v);
      const s = placeOf(hz);
      showPlace(s);
      placeWaves();
      const where = s < 0.2 ? 'near the base of the cochlea, by the oval window' : s > 0.8 ? 'near the tip (apex) of the cochlea' : 'part way along the cochlea';
      return `${controls.format(v)}: this pitch moves the basilar membrane most ${where}. Hearing covers about 20 Hz to 20 kHz; high notes are sensed at the base, low notes at the apex.`;
    },
  };
  controls.set(0.6);

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-3,
    frameWidth: 0.07,
    view: { target: [3, 0, 0], direction: [-0.18, 0.14, 1] },
    focus: cochleaPoint(0.4).toArray(),
    controls,
    update(dt) {
      if (reducedMotion) return;
      phase = (phase + dt * 0.8) % 5;
      placeWaves();
      // The ossicles rock (exaggerated hugely so the motion can be seen).
      const wob = Math.sin(performance.now() * 0.012) * 0.12;
      ossicles.rotation.z = wob * 0.15;
      drum.position.x = wob * 0.4;
      stapes.position.x = wob * 0.5;
    },
    dispose() {
      disposeTree(root);
      M.dispose();
    },
  };
}
