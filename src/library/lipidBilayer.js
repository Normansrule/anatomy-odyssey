// Shared library scene: a patch of lipid bilayer, the membrane around every
// cell. 1 scene unit = 1 nm. Two leaflets of phospholipids sit tail to tail:
// water-loving heads face the water on each side, oily tails form a core
// about 3 nm thick, and the whole sheet is about 5 nm across. Cholesterol
// is mixed in, and an ion channel spans the membrane. Positions are a
// regular lattice with jitter: a snapshot of what is really a fluid.
import * as THREE from 'three/webgpu';
import { materialBank, pick, capsuleBetween, seeded, disposeTree } from '../scenes/kit.js';

const HALF = 7; // patch half-width, nm
const SPACING = 0.82; // nm between lipids (about 0.65 nm² per lipid)
const HEAD_Y = 2.15;
const CHANNEL_R = 2.6;

export function buildLipidBilayer({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(29);

  // Lattice sites for each leaflet, skipping the channel.
  const sites = [];
  for (let row = 0; row * SPACING * 0.866 <= HALF * 2; row++) {
    for (let col = 0; col * SPACING <= HALF * 2; col++) {
      const x = -HALF + col * SPACING + (row % 2 ? SPACING / 2 : 0) + (rand() - 0.5) * 0.12;
      const z = -HALF + row * SPACING * 0.866 + (rand() - 0.5) * 0.12;
      if (Math.abs(x) > HALF || Math.hypot(x, z) < CHANNEL_R) continue;
      sites.push([x, z]);
    }
  }

  const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 6);
  const sphere = new THREE.SphereGeometry(1, 12, 9);
  const up = new THREE.Vector3(0, 1, 0);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const heads = [];
  const phosphates = [];
  const tails = [];
  const chol = [];
  const cholHeads = [];

  const segment = (a, b, r, list) => {
    const d = b.clone().sub(a);
    q.setFromUnitVectors(up, d.clone().normalize());
    list.push(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q.clone(), new THREE.Vector3(r, d.length(), r)));
  };

  for (const s of [1, -1]) {
    for (const [x, z] of sites) {
      const jx = (rand() - 0.5) * 0.1;
      if (rand() < 0.22) {
        // Cholesterol: a stiff ring system with a small OH head.
        segment(new THREE.Vector3(x, s * 1.85, z), new THREE.Vector3(x + jx, s * 0.45, z), 0.27, chol);
        cholHeads.push(new THREE.Matrix4().compose(new THREE.Vector3(x, s * 2.0, z), new THREE.Quaternion(), new THREE.Vector3(0.2, 0.2, 0.2)));
        continue;
      }
      heads.push(new THREE.Matrix4().compose(new THREE.Vector3(x, s * HEAD_Y, z), new THREE.Quaternion(), new THREE.Vector3(0.4, 0.4, 0.4)));
      phosphates.push(new THREE.Matrix4().compose(new THREE.Vector3(x + 0.05, s * 1.78, z), new THREE.Quaternion(), new THREE.Vector3(0.26, 0.26, 0.26)));
      // A straight saturated tail and a kinked unsaturated one (cis double bond).
      const t1a = new THREE.Vector3(x - 0.17, s * 1.6, z);
      const t1b = new THREE.Vector3(x - 0.2 + jx, s * 0.15, z + (rand() - 0.5) * 0.2);
      segment(t1a, t1b, 0.15, tails);
      const t2a = new THREE.Vector3(x + 0.17, s * 1.6, z);
      const kink = new THREE.Vector3(x + 0.2, s * 0.95, z);
      const bend = rand() < 0.5 ? 1 : -1;
      const t2b = new THREE.Vector3(x + 0.2 + bend * 0.35, s * 0.2, z + (rand() - 0.5) * 0.3);
      segment(t2a, kink, 0.15, tails);
      segment(kink, t2b, 0.15, tails);
    }
  }

  const instanced = (geo, mat, list, card, label) => {
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((mm, i) => mesh.setMatrixAt(i, mm));
    root.add(pick(mesh, card, label));
    return mesh;
  };
  instanced(sphere, M(0xf08baf, { roughness: 0.4 }), heads, 'phospholipid', 'Phospholipid head (water-loving)');
  instanced(sphere, M(0xf2a65a, { roughness: 0.4 }), phosphates, 'phospholipid', 'Phosphate group');
  instanced(unitCyl, M(0xf1e2b8, { roughness: 0.6 }), tails, 'lipid-bilayer', 'Fatty-acid tail (water-fearing core)');
  instanced(unitCyl, M(0xe8a13a, { roughness: 0.45 }), chol, 'cholesterol', 'Cholesterol');
  instanced(sphere, M(0xff5a5a, { roughness: 0.4 }), cholHeads, 'cholesterol', 'Cholesterol (OH head)');

  // An ion channel: five subunits around a water-filled pore, with a potassium ion inside.
  const channelMat = M(0x7cc49a, { roughness: 0.45 });
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const x = Math.cos(a) * 1.35;
    const z = Math.sin(a) * 1.35;
    root.add(pick(capsuleBetween([x, -2.7, z], [x * 0.92, 2.7, z * 0.92], 0.85, channelMat, 14), 'ion-channel', 'Ion channel subunit'));
  }
  const ion = new THREE.Mesh(sphere, M(0x9b7bf0, { roughness: 0.3, emissive: 0x9b7bf0, emissiveIntensity: 0.4 }));
  ion.scale.setScalar(0.3);
  root.add(pick(ion, 'ion-channel', 'Potassium ion (K⁺) in the pore'));

  // A sprinkling of water molecules on both sides.
  const water = [];
  for (let i = 0; i < 160; i++) {
    const s = i % 2 ? 1 : -1;
    water.push(new THREE.Matrix4().compose(new THREE.Vector3((rand() - 0.5) * HALF * 2, s * (2.9 + rand() * 2.2), (rand() - 0.5) * HALF * 2), new THREE.Quaternion(), new THREE.Vector3(0.15, 0.15, 0.15)));
  }
  instanced(sphere, M(0x7fb6e8, { roughness: 0.3, transparent: true, opacity: 0.7 }), water, 'lipid-bilayer', 'Water molecule');

  let t = 0;
  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-9,
    view: { target: [0, 0, 0], direction: [0.5, 0.32, 0.82] },
    focus: [0, 0, 0],
    update(dt) {
      if (reducedMotion) return;
      t += dt;
      ion.position.y = Math.sin(t * 1.3) * 1.9; // the ion hops through the pore
    },
    dispose() {
      unitCyl.dispose();
      sphere.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
