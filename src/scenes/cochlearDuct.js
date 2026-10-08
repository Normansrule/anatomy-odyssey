// Tier 4: one turn of the cochlea cut across. 1 scene unit = 10 µm.
// Three fluid-filled channels: the scala vestibuli on top (from the oval
// window), the cochlear duct in the middle, and the scala tympani below (to
// the round window). The organ of Corti sits on the basilar membrane, its
// hair cells' stereocilia touching the tectorial membrane above: one row of
// inner hair cells and three of outer hair cells (OpenStax Biology 36.4).
// Nerve fibers run through the bony shelf to the spiral ganglion in the
// cochlea's core (the modiolus). The segment is drawn straight, not curved.
// The stage control follows a sound from fluid wave to nerve signal.
import * as THREE from 'three/webgpu';
import { materialBank, pick, tubeThrough, capsuleBetween, ellipsoid, disposeTree, COLORS } from './kit.js';
import { stagedControls, ramp } from './stages.js';

const DEPTH = 34; // length of the segment shown, along the duct
export const OUTER_HAIR_CELL_ROWS = 3;
export const INNER_HAIR_CELL_ROWS = 1;

export const DUCT_STAGES = [
  { label: 'Pressure wave', text: 'Pressure wave. The stapes pushes on the oval window, sending a pressure wave through the fluid of the scala vestibuli (top) and back through the scala tympani (bottom) to the round window.' },
  { label: 'Membrane moves', text: 'The basilar membrane moves. The wave flexes the cochlear duct, and the basilar membrane, with the organ of Corti on it, rocks up and down most strongly at the place tuned to that pitch.' },
  { label: 'Bending', text: 'Bending. The tectorial membrane above does not move with it, so the hair cells’ stereocilia, touching it, are bent back and forth.' },
  { label: 'Nerve signal', text: 'Nerve signal. Bending opens ion channels in the stereocilia; the hair cells release a neurotransmitter onto fibers of the spiral ganglion, whose axons form the cochlear part of the vestibulocochlear nerve.' },
];

const shape = (pts) => {
  const s = new THREE.Shape();
  s.moveTo(...pts[0]);
  for (const p of pts.slice(1)) s.lineTo(...p);
  s.closePath();
  return s;
};
const arcPts = (cx, cy, r, a0, a1, n = 40) => Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.cos(a0 + ((a1 - a0) * i) / n), cy + r * Math.sin(a0 + ((a1 - a0) * i) / n)]);

export function buildCochlearDuct({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const ext = (pts, color, card, label, opts = {}, z0 = -DEPTH / 2, depth = DEPTH) => {
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(shape(pts), { depth, bevelEnabled: false, curveSegments: 4 }), M(color, { roughness: 0.6, ...opts }));
    m.position.z = z0;
    root.add(pick(m, card, label));
    return m;
  };

  // Bone around the three channels, cut on the front face.
  const bonePts = [...arcPts(4, 2, 62, -Math.PI * 0.62, Math.PI * 0.62, 60), [-36, 54], [-70, 40], [-70, -40], [-36, -54]];
  const boneRing = new THREE.Shape();
  boneRing.moveTo(...bonePts[0]);
  for (const p of bonePts.slice(1)) boneRing.lineTo(...p);
  boneRing.closePath();
  // One space inside the bone, divided by membranes into the three channels.
  const HOLE = { x: 6, y: 2, r: 46 };
  const hole = new THREE.Path();
  hole.absarc(HOLE.x, HOLE.y, HOLE.r, 0, Math.PI * 2, true);
  boneRing.holes.push(hole);
  const bone = new THREE.Mesh(new THREE.ExtrudeGeometry(boneRing, { depth: DEPTH, bevelEnabled: false }), M(0xe9dfc8, { roughness: 0.6, tissue: 'bone' }));
  bone.position.z = -DEPTH / 2;
  root.add(pick(bone, 'cochlea', 'Bony wall of the cochlea'));

  // Fluids: perilymph above and below, endolymph in the duct (see-through).
  const fluid = { transparent: true, opacity: 0.28, depthWrite: false };
  ext(arcPts(HOLE.x, HOLE.y, HOLE.r - 0.2, 0, Math.PI * 2, 72), 0x9fd4ff, 'cochlear-duct', 'Perilymph: the scala vestibuli above, the scala tympani below', fluid, -DEPTH / 2 - 0.4, DEPTH - 0.8);
  const duct = [[-16, 0.6], [44, 0.6], [44, 30], [-18, 4]];
  ext(duct, 0x9fe8b8, 'cochlear-duct', 'Cochlear duct (endolymph)', { ...fluid, opacity: 0.4 }, -DEPTH / 2 - 0.2, DEPTH - 0.4);
  const memMat = M(0xd8c8e8, { roughness: 0.5 });
  const rLen = Math.hypot(62, 26);
  const rMesh = new THREE.Mesh(new THREE.BoxGeometry(rLen, 0.5, DEPTH), memMat);
  rMesh.position.set(13, 17, 0);
  rMesh.rotation.z = Math.atan2(26, 62);
  root.add(pick(rMesh, 'cochlear-duct', 'Vestibular (Reissner’s) membrane: roof of the cochlear duct'));
  const lig = new THREE.Mesh(new THREE.BoxGeometry(8, 40, DEPTH), M(0xe0b8c0, { roughness: 0.6 }));
  lig.position.set(49, 10, 0);
  root.add(pick(lig, 'cochlear-duct', 'Spiral ligament (outer wall)'));
  const stria = new THREE.Mesh(new THREE.BoxGeometry(3, 28, DEPTH + 0.2), M(0xc8505a, { roughness: 0.55 }));
  stria.position.set(45.6, 15, 0);
  root.add(pick(stria, 'cochlear-duct', 'Stria vascularis (makes the endolymph)'));

  // Basilar membrane and the organ of Corti on it, in a group that moves.
  const corti = new THREE.Group();
  root.add(corti);
  const bm = new THREE.Mesh(new THREE.BoxGeometry(60, 1.2, DEPTH), M(0xb89ad8, { roughness: 0.5 }));
  bm.position.set(14, 0, 0);
  corti.add(pick(bm, 'basilar-membrane', 'Basilar membrane'));
  const support = M(0xf0d0d8, { roughness: 0.55 });
  corti.add(pick(ellipsoid([4, 3.2, 0], [13, 3, DEPTH / 2], support, 24), 'organ-of-corti', 'Supporting cells of the organ of Corti'));
  // Pillar cells around the tunnel of Corti.
  for (const z of [-12, -4, 4, 12]) {
    corti.add(pick(capsuleBetween([-2, 0.8, z], [1.6, 7, z], 0.5, support, 6), 'organ-of-corti', 'Pillar cell'));
    corti.add(pick(capsuleBetween([5, 0.8, z], [1.8, 7, z], 0.5, support, 6), 'organ-of-corti', 'Pillar cell'));
  }
  const ihcMat = M(0xe8a0c8, { roughness: 0.45, emissive: 0xffb0e0, emissiveIntensity: 0 });
  const ohcMat = M(0xd08ab8, { roughness: 0.45 });
  const cilia = [];
  const ciliaMat = M(0xf5e6a8, { roughness: 0.4 });
  for (let z = -DEPTH / 2 + 2; z < DEPTH / 2 - 1; z += 4) {
    const ihc = ellipsoid([-4.5, 6, z], [1.5, 2.4, 1.5], ihcMat, 12);
    corti.add(pick(ihc, 'inner-hair-cell', 'Inner hair cell (the main sound receptor; one row)'));
    const b = capsuleBetween([-4.5, 8.2, z], [-4.5, 9.9, z], 0.35, ciliaMat, 5);
    corti.add(pick(b, 'stereocilia', 'Stereocilia of an inner hair cell'));
    cilia.push(b);
    for (let r = 0; r < OUTER_HAIR_CELL_ROWS; r++) {
      const x = 8 + r * 2.8;
      const o = capsuleBetween([x - 0.4, 3.4, z + r * 0.8], [x + 0.4, 7.6, z + r * 0.8], 1.05, ohcMat, 8);
      corti.add(pick(o, 'outer-hair-cell', 'Outer hair cell (three rows; fine-tune the response)'));
      const c = capsuleBetween([x + 0.4, 8.8, z + r * 0.8], [x + 0.4, 10.6, z + r * 0.8], 0.3, ciliaMat, 5);
      corti.add(pick(c, 'stereocilia', 'Stereocilia of an outer hair cell'));
      cilia.push(c);
    }
  }
  // Tectorial membrane: anchored on the left, resting on the stereocilia tips.
  const tect = shape([[-15, 6.5], [-10, 9.5], [4, 12.5], [18, 11.8], [18.5, 10.7], [4, 10.4], [-10, 7.6], [-15, 5]]);
  const tm = new THREE.Mesh(new THREE.ExtrudeGeometry(tect, { depth: DEPTH, bevelEnabled: false }), M(0xa8c8f0, { roughness: 0.4, transparent: true, opacity: 0.75 }));
  tm.position.z = -DEPTH / 2;
  root.add(pick(tm, 'tectorial-membrane', 'Tectorial membrane (the stereocilia touch it)'));
  // Bony shelf, nerve fibers and spiral ganglion in the core.
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(34, 4, DEPTH), M(0xe9dfc8, { roughness: 0.6, tissue: 'bone' }));
  shelf.position.set(-33, 0.5, 0);
  root.add(pick(shelf, 'cochlea', 'Bony spiral shelf (osseous spiral lamina)'));
  const limbus = ellipsoid([-17, 3.5, 0], [4, 3.5, DEPTH / 2], M(0xe0b8c0, { roughness: 0.55 }), 18);
  root.add(pick(limbus, 'tectorial-membrane', 'Spiral limbus (anchors the tectorial membrane)'));
  const nerveMat = M(COLORS.nerve, { roughness: 0.45, emissive: COLORS.nerve, emissiveIntensity: 0 });
  for (let z = -DEPTH / 2 + 3; z < DEPTH / 2; z += 6) {
    root.add(pick(tubeThrough([[-4.5, 3.6, z], [-14, 0.8, z], [-34, 0.6, z], [-52, 0.8, z * 0.6]], 0.35, nerveMat, 24, 5), 'spiral-ganglion', 'Nerve fiber from a hair cell'));
  }
  for (let k = 0; k < 14; k++) {
    root.add(pick(ellipsoid([-56 + (k % 4) * 3.4, -3 + Math.floor(k / 4) * 3.2, -12 + (k % 5) * 6], [1.5, 1.5, 1.5], M(0xe8c45a, { roughness: 0.45 }), 10), 'spiral-ganglion', 'Spiral ganglion neuron'));
  }

  // A pressure wave marker in each scala (arrows of travel).
  const waveMat = M(0x5a8deb, { roughness: 0.3, emissive: 0x5a8deb, emissiveIntensity: 0.6 });
  const fronts = [0, 1].map((k) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(6, 0.5, 6, 24, Math.PI), waveMat);
    m.rotation.y = Math.PI / 2;
    m.userData.k = k;
    root.add(pick(m, 'cochlear-duct', 'Pressure wave in the fluid'));
    return m;
  });

  let stage = 0;
  let phase = 0;
  function apply(v) {
    stage = v;
    const amp = ramp(v, 0.8, 1.4);
    const y = Math.sin(phase) * 1.4 * amp;
    corti.position.y = y;
    corti.rotation.z = 0.02 * Math.sin(phase) * amp;
    const bend = ramp(v, 1.8, 2.3) * Math.sin(phase) * 0.6;
    for (const c of cilia) c.rotation.z = bend * 0.25;
    ihcMat.emissiveIntensity = 0.6 * ramp(v, 2.6, 3);
    nerveMat.emissiveIntensity = 0.8 * ramp(v, 2.8, 3);
    for (const f of fronts) {
      const t = (phase / (Math.PI * 2) + f.userData.k * 0.5) % 1;
      f.visible = v < 1.8;
      f.position.set(f.userData.k === 0 ? -14 + 52 * t : 38 - 52 * t, f.userData.k === 0 ? 34 : -26, 0);
    }
  }
  const { controls, update } = stagedControls({ stages: DUCT_STAGES, apply, reducedMotion, rate: 0.2, still: 3 });

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-5,
    frameWidth: 1.5e-3,
    view: { target: [-6, 2, 0], direction: [0.22, 0.12, 1] },
    focus: [-4.5, 8, DEPTH / 2],
    controls,
    update(dt) {
      update(dt);
      if (!reducedMotion) {
        phase += dt * 6;
        apply(stage);
      }
    },
    dispose() {
      disposeTree(root);
      M.dispose();
    },
  };
}
