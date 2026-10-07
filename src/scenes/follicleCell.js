// Tier 5: follicle cells making thyroid hormone. 1 scene unit = 1 µm.
// A strip of the follicle wall: colloid above (inside the follicle), four
// follicle cells about 12 µm wide, and a capillary below. The second cell is
// drawn see-through, with its nucleus, rough endoplasmic reticulum, Golgi,
// lysosomes and microvilli. Iodide, thyroglobulin and hormone molecules are
// drawn far larger than life, and far fewer.
// The stage control follows OpenStax 17.4: iodide pumped in, thyroglobulin
// made and secreted, iodine attached by peroxidase, colloid taken back in,
// and T4 and T3 cut free and released into the blood.
import * as THREE from 'three/webgpu';
import { materialBank, pick, capsuleBetween, ellipsoid, seeded, disposeTree, COLORS } from './kit.js';
import { stagedControls, ramp } from './stages.js';

export const CELL = { width: 12, height: 12, base: -6 }; // µm; the apical surface is at base + height
const TOP = CELL.base + CELL.height;
const HERO_X = -6;
const CAP_Y = -11;
const CAP_R = 3.6;

export const HORMONE_STAGES = [
  { label: 'Iodide in', text: 'Iodide in. Thyroid-stimulating hormone (TSH) tells the cells to pump iodide ions (purple) out of the blood. A carrier in the base of the cell brings them in, and they cross to the colloid side.' },
  { label: 'Thyroglobulin', text: 'Thyroglobulin. The rough endoplasmic reticulum and Golgi make a large protein, thyroglobulin (orange), studded with the amino acid tyrosine. Vesicles release it into the colloid.' },
  { label: 'Iodination', text: 'Iodine attached. At the cell’s colloid surface, peroxidase enzymes attach iodine to tyrosines in thyroglobulin. Pairs of iodinated tyrosines then join: two that carry two iodines each make T4; one of each makes T3. The hormone is stored, still part of the protein.' },
  { label: 'Taken back', text: 'Taken back. When TSH calls for hormone, the cells engulf droplets of colloid. Lysosomes (green) fuse with them and their enzymes break thyroglobulin apart.' },
  { label: 'Release', text: 'Release. Freed T4 and T3 (yellow) diffuse out of the cell into the blood. There, less than one percent stays free; the rest rides on carrier proteins such as thyroxine-binding globulin.' },
];

/** Linear-in-stage keyframes: [[v, [x,y,z]], …] → position at v (smoothed between keys). */
function along(keys, v, out) {
  if (v <= keys[0][0]) return out.set(...keys[0][1]);
  for (let i = 1; i < keys.length; i++) {
    const [v1, p1] = keys[i];
    if (v <= v1) {
      const [v0, p0] = keys[i - 1];
      const f = ramp(v, v0, v1);
      return out.set(p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f, p0[2] + (p1[2] - p0[2]) * f);
    }
  }
  return out.set(...keys.at(-1)[1]);
}

export function buildFollicleCell({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(1919);
  const D = 10; // depth of the strip (z)

  // Colloid above the cells.
  const colloid = new THREE.Mesh(new THREE.BoxGeometry(52, 12, D + 4), M(0xf0a6b8, { roughness: 0.35, transparent: true, opacity: 0.55, depthWrite: false }));
  colloid.position.set(0, TOP + 6.4, -1);
  root.add(pick(colloid, 'colloid', 'Colloid inside the follicle (stored thyroglobulin)'));
  const tgGeo = new THREE.IcosahedronGeometry(1, 1);
  const storedMat = M(0x9a6ad8, { roughness: 0.4 });
  for (let i = 0; i < 34; i++) {
    const b = new THREE.Mesh(tgGeo, storedMat);
    b.position.set((rand() - 0.5) * 48, TOP + 2 + rand() * 9, (rand() - 0.5) * (D + 2) - 1);
    b.scale.set(0.9, 0.6, 0.6);
    b.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    root.add(pick(b, 'thyroglobulin', 'Stored thyroglobulin, its tyrosines carrying iodine (drawn far larger)'));
  }

  // The cells: three solid neighbors and one see-through.
  const cellMat = M(0xc77b9a, { roughness: 0.55 });
  const glassMat = M(0xe3a6c0, { roughness: 0.3, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  for (const x of [-18, -6, 6, 18]) {
    const hero = x === HERO_X;
    const c = new THREE.Mesh(new THREE.BoxGeometry(CELL.width - 0.25, CELL.height, D), hero ? glassMat : cellMat);
    c.position.set(x, CELL.base + CELL.height / 2, 0);
    root.add(pick(c, 'follicular-cell', hero ? 'Follicle cell (drawn see-through)' : 'Follicle cell'));
    if (!hero) root.add(pick(ellipsoid([x, CELL.base + 3.4, D / 2 - 0.4], [2.8, 2.4, 0.8], M(COLORS.hematoxylin, { roughness: 0.5 }), 16), 'follicular-cell', 'Nucleus of a follicle cell'));
    // Microvilli on the colloid side.
    for (let k = 0; k < 9; k++) {
      for (const z of [-3, 0, 3]) {
        const mx = x - 5 + k * 1.25;
        root.add(pick(capsuleBetween([mx, TOP, z], [mx, TOP + 1.1, z], 0.2, hero ? M(0xd99ab4, { roughness: 0.4 }) : cellMat, 5), 'follicular-cell', 'Microvilli on the colloid side'));
      }
    }
  }
  // Inside the see-through cell.
  root.add(pick(ellipsoid([HERO_X, CELL.base + 3.6, 0], [3.2, 2.6, 2.6], M(COLORS.hematoxylin, { roughness: 0.5 }), 24), 'follicular-cell', 'Nucleus'));
  const erMat = M(0x8fa8e0, { roughness: 0.45 });
  for (let k = 0; k < 4; k++) {
    const er = new THREE.Mesh(new THREE.TorusGeometry(3.4 + k * 0.5, 0.18, 6, 32, Math.PI * 0.9), erMat);
    er.position.set(HERO_X, CELL.base + 3.6, 0);
    er.rotation.z = Math.PI * 0.05;
    root.add(pick(er, 'rough-er', 'Rough endoplasmic reticulum (makes thyroglobulin)'));
  }
  const golgiMat = M(0xe8c45a, { roughness: 0.45 });
  for (let k = 0; k < 4; k++) {
    const g = new THREE.Mesh(new THREE.TorusGeometry(2.2 - k * 0.25, 0.16, 6, 24, Math.PI * 0.8), golgiMat);
    g.position.set(HERO_X, TOP - 4.8 + k * 0.45, 0);
    g.rotation.z = Math.PI * 0.1;
    root.add(pick(g, 'golgi', 'Golgi apparatus (packs thyroglobulin into vesicles)'));
  }
  const mitoMat = M(0xd98a6a, { roughness: 0.5 });
  for (const [x, y, z] of [[HERO_X - 4, CELL.base + 7, 2], [HERO_X + 4, CELL.base + 6.5, -2], [HERO_X + 3.5, CELL.base + 1.4, 2.5]]) {
    root.add(pick(capsuleBetween([x - 1, y, z], [x + 1, y + 0.3, z], 0.45, mitoMat, 8), 'mitochondrion', 'Mitochondrion'));
  }

  // Basement membrane, capillary and red blood cells below.
  const bm = new THREE.Mesh(new THREE.BoxGeometry(52, 0.3, D + 4), M(0x9fb4e8, { roughness: 0.7 }));
  bm.position.set(0, CELL.base - 0.3, -1);
  root.add(pick(bm, 'follicular-cell', 'Basement membrane under the cells'));
  const capWall = new THREE.Mesh(new THREE.CylinderGeometry(CAP_R, CAP_R, 52, 32, 1, true, Math.PI * 0.15, Math.PI * 1.7), M(0xf0b4c4, { roughness: 0.45, side: THREE.DoubleSide, transparent: true, opacity: 0.6, depthWrite: false }));
  capWall.rotation.z = Math.PI / 2;
  capWall.position.set(0, CAP_Y, -1);
  root.add(pick(capWall, 'capillary', 'Capillary (iodide arrives in it; hormone leaves in it)'));
  for (const x of [-16, 3, 19]) {
    const rbc = new THREE.Mesh(new THREE.TorusGeometry(2.4, 1, 10, 20), M(COLORS.artery, { roughness: 0.4 }));
    rbc.position.set(x, CAP_Y, -1.5);
    rbc.rotation.set(0.4, 1.2, 0);
    root.add(pick(rbc, 'red-blood-cell', 'Red blood cell'));
  }

  // Membrane machinery, drawn far larger than life.
  const nis = [];
  for (const dx of [-3, 0.5, 3.5]) {
    const p = [HERO_X + dx, CELL.base, 2];
    nis.push(p);
    root.add(pick(capsuleBetween([p[0], p[1] - 0.6, p[2]], [p[0], p[1] + 0.6, p[2]], 0.5, M(0x5a8deb, { roughness: 0.4 }), 8), 'iodide-pump', 'Sodium–iodide carrier (brings iodide in)'));
  }
  const tpo = [];
  for (const dx of [-3.5, 0, 3.5]) {
    const p = [HERO_X + dx, TOP + 0.3, 3.6];
    tpo.push(p);
    root.add(pick(ellipsoid(p, [0.7, 0.45, 0.7], M(0x7cc49a, { roughness: 0.4, emissive: 0x7cc49a, emissiveIntensity: 0.3 }), 12), 'thyroid-peroxidase', 'Thyroid peroxidase (attaches iodine to thyroglobulin)'));
  }

  // Moving molecules.
  const dot = new THREE.SphereGeometry(1, 10, 8);
  const tmp = new THREE.Vector3();
  const movers = [];
  const add = (mesh, keys, show, hide, extra) => {
    root.add(mesh);
    movers.push({ mesh, keys, show, hide, ...extra });
  };
  const iodMat = M(0xb07ae8, { roughness: 0.3, emissive: 0xb07ae8, emissiveIntensity: 0.6 });
  for (let i = 0; i < 16; i++) {
    const via = nis[i % nis.length];
    const z = (rand() - 0.5) * 6;
    const top = [HERO_X + (rand() - 0.5) * 9, TOP + 1.5 + rand() * 3, z];
    const d = rand() * 0.25;
    const m = pick(new THREE.Mesh(dot, iodMat), 'iodide-pump', 'Iodide ion (I⁻), drawn far larger');
    m.scale.setScalar(0.42);
    add(m, [[0.05 + d, [HERO_X + (rand() - 0.5) * 20, CAP_Y + (rand() - 0.5) * 3, -1 + (rand() - 0.5) * 3]], [0.4 + d, [via[0], via[1], via[2]]], [0.75 + d, [HERO_X + (rand() - 0.5) * 6, TOP - 1, z]], [0.95, top]], 0, 2.4);
  }
  // Its own material (a key no other part uses), recolored as iodine is attached.
  const freshMat = M(0xf2a65a, { roughness: 0.41 });
  const fresh = [];
  for (let i = 0; i < 6; i++) {
    const m = pick(new THREE.Mesh(tgGeo, freshMat), 'thyroglobulin', 'New thyroglobulin (drawn far larger)');
    m.scale.set(0.8, 0.55, 0.55);
    const d = i * 0.05;
    const end = [HERO_X - 4 + i * 1.6, TOP + 2.2 + rand() * 2, 1.5 + rand() * 1.5];
    add(m, [[1 + d, [HERO_X + (rand() - 0.5) * 4, CELL.base + 6.2, (rand() - 0.5) * 3]], [1.35 + d, [HERO_X + (rand() - 0.5) * 2, TOP - 4.4, 0]], [1.7 + d, [end[0], TOP - 0.5, end[2]]], [1.95, end], [3.2, end]], 0.95, 3.2);
    fresh.push(m);
  }
  const dropMat = M(0xf7c6d2, { roughness: 0.35 });
  const drops = [];
  for (let i = 0; i < 3; i++) {
    const m = pick(new THREE.Mesh(dot, dropMat), 'colloid', 'Droplet of colloid taken into the cell');
    const x = HERO_X - 3 + i * 3;
    add(m, [[3, [x, TOP + 1.5, 1]], [3.6, [x, TOP - 3 - i * 0.6, 1]], [4.6, [x, TOP - 3 - i * 0.6, 1]]], 2.95, 4.6, { size: 1.15 });
    drops.push(m);
  }
  const lysMat = M(0x7cc49a, { roughness: 0.4, emissive: 0x7cc49a, emissiveIntensity: 0.4 });
  for (let i = 0; i < 3; i++) {
    const m = pick(new THREE.Mesh(dot, lysMat), 'lysosome', 'Lysosome (its enzymes free the hormone)');
    m.scale.setScalar(0.6);
    const tx = HERO_X - 3 + i * 3;
    add(m, [[3, [HERO_X - 4 + i * 4, CELL.base + 7.4, -2]], [3.85, [tx + 0.7, TOP - 3 - i * 0.6 + 0.6, 1.4]], [4.6, [tx + 0.7, TOP - 3 - i * 0.6 + 0.6, 1.4]]], 2.95, 4.6);
  }
  const hormoneMat = M(0xffe28a, { roughness: 0.3, emissive: 0xffd36a, emissiveIntensity: 0.8 });
  for (let i = 0; i < 14; i++) {
    const m = pick(new THREE.Mesh(dot, hormoneMat), 'thyroxine', i % 5 === 0 ? 'T3 (drawn far larger)' : 'T4, thyroxine (drawn far larger)');
    m.scale.setScalar(0.4);
    const from = [HERO_X - 3 + (i % 3) * 3, TOP - 3 - (i % 3) * 0.6, 1];
    const d = (i % 7) * 0.04;
    add(m, [[4.05 + d, from], [4.45 + d, [HERO_X + (rand() - 0.5) * 8, CELL.base + 0.3, (rand() - 0.5) * 6]], [4.85, [HERO_X + (rand() - 0.5) * 22, CAP_Y + (rand() - 0.5) * 4, -1 + (rand() - 0.5) * 3]]], 4.0, 9);
  }

  const orange = new THREE.Color(0xf2a65a);
  const violet = new THREE.Color(0x9a6ad8);
  function apply(v) {
    for (const m of movers) {
      m.mesh.visible = v >= m.show && v <= m.hide;
      along(m.keys, v, tmp);
      m.mesh.position.copy(tmp);
      if (m.size) m.mesh.scale.setScalar(m.size * (1 - 0.7 * ramp(v, 3.9, 4.5)));
    }
    const iod = ramp(v, 2.1, 2.7);
    freshMat.color.copy(orange).lerp(violet, iod);
  }
  const { controls, update } = stagedControls({ stages: HORMONE_STAGES, apply, reducedMotion, rate: 0.24, still: 4.6 });

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-6,
    frameWidth: 4.4e-5,
    view: { target: [0, 0, 0], direction: [0.22, 0.16, 1] },
    focus: [HERO_X, CAP_Y + 1, 1],
    controls,
    update,
    dispose() {
      dot.dispose();
      tgGeo.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
