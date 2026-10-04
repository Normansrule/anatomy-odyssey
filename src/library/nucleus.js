// Shared library scene: a generic cell nucleus. 1 scene unit = 1 µm.
// Reused by every dive whose cell tier reaches a nucleus.
import * as THREE from 'three/webgpu';
import { COLORS, materialBank, pick, ellipsoid, tubeThrough, fibonacciSphere, seeded, disposeTree } from '../scenes/kit.js';

const R = 3.0; // 6 µm diameter
const CUT_CENTER = 2.18; // sphere phi facing the default camera
const CUT_HALF = Math.PI / 4;

export function buildNucleus() {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(5);
  const phiStart = CUT_CENTER + CUT_HALF;
  const phiLength = Math.PI * 2 - 2 * CUT_HALF;

  const outer = new THREE.Mesh(
    new THREE.SphereGeometry(R, 72, 48, phiStart, phiLength),
    M(0x9383e6, { roughness: 0.45, side: THREE.DoubleSide }),
  );
  root.add(pick(outer, 'nuclear-envelope', 'Outer nuclear membrane'));
  const inner = new THREE.Mesh(
    new THREE.SphereGeometry(R * 0.955, 72, 48, phiStart, phiLength),
    M(COLORS.hemaDeep, { roughness: 0.6, side: THREE.DoubleSide }),
  );
  root.add(pick(inner, 'nuclear-envelope', 'Inner nuclear membrane'));

  // Nuclear pores, skipping the open wedge. Fewer than a real nucleus has.
  const poreGeo = new THREE.TorusGeometry(0.06, 0.028, 8, 16);
  const poreMat = M(COLORS.eosinPale, { roughness: 0.4, emissive: COLORS.eosin, emissiveIntensity: 0.25 });
  const dirs = fibonacciSphere(320).filter((p) => {
    const phi = Math.atan2(p.z, -p.x);
    let d = Math.abs(((phi - CUT_CENTER + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    return d > CUT_HALF + 0.05;
  });
  const pores = new THREE.InstancedMesh(poreGeo, poreMat, dirs.length);
  const z = new THREE.Vector3(0, 0, 1);
  dirs.forEach((d, i) => {
    const q = new THREE.Quaternion().setFromUnitVectors(z, d);
    pores.setMatrixAt(i, new THREE.Matrix4().compose(d.clone().multiplyScalar(R + 0.01), q, new THREE.Vector3(1, 1, 1)));
  });
  root.add(pick(pores, 'nuclear-pore', 'Nuclear pore'));

  root.add(pick(ellipsoid([-0.7, 0.35, -0.5], [0.85, 0.78, 0.8], M(0x2a1f66, { roughness: 0.7 }), 32), 'nucleolus', 'Nucleolus'));

  // Chromatin: random-walk fibers kept inside the nucleus.
  const chroma = [M(0xa596f2, { roughness: 0.5 }), M(0xc9bcff, { roughness: 0.5 })];
  let focus = null;
  for (let f = 0; f < 22; f++) {
    const p = new THREE.Vector3((rand() - 0.5) * 3, (rand() - 0.5) * 3, (rand() - 0.5) * 3);
    const d = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
    const pts = [];
    for (let k = 0; k < 44; k++) {
      d.add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.9)).normalize();
      p.addScaledVector(d, 0.3);
      if (p.length() > R * 0.86) p.multiplyScalar((R * 0.86) / p.length());
      pts.push(p.toArray());
    }
    root.add(pick(tubeThrough(pts, 0.055, chroma[f % 2], 160, 6), 'chromatin', 'Chromatin fiber'));
    if (f === 0) focus = pts[22];
  }

  // Faint nucleoplasm so the volume reads as filled.
  root.add(ellipsoid([0, 0, 0], [R * 0.95, R * 0.95, R * 0.95], M(COLORS.hematoxylin, { transparent: true, opacity: 0.06, depthWrite: false }), 32));

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-6,
    view: { target: [0, 0, 0], direction: [0.55, 0.25, 0.8] },
    focus,
    branchFocus: focus,
    dispose() {
      poreGeo.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
