// Tier 6: a sarcomere, the repeating contractile unit. 1 scene unit = 10 nm.
// Thick (myosin) filaments sit in a hexagonal lattice; thin (actin)
// filaments sit at the trigonal points between them, anchored to Z discs.
// The contraction control changes sarcomere length: thin filaments slide
// past thick ones, the I band and H zone shrink, the A band stays the same.
// Half of each neighboring sarcomere is drawn on either side.
import * as THREE from 'three/webgpu';
import { materialBank, pick, disposeTree } from './kit.js';
import { sarcomereBands, THICK_FILAMENT_UM, THIN_FILAMENT_UM } from '../science/equations.js';

const U = 100; // scene units per micrometer
const SPACING = 4.5; // 45 nm between thick filaments
const THICK = THICK_FILAMENT_UM * U;
const THIN = THIN_FILAMENT_UM * U;
const BARE = 7.5; // half-width of the bare zone with no heads
const CROWN = 1.43; // 14.3 nm between crowns of myosin heads

function lattice() {
  const thick = [];
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      const y = SPACING * (i + j / 2);
      const z = SPACING * j * (Math.sqrt(3) / 2);
      if (Math.hypot(y, z) <= SPACING * 2.05) thick.push([y, z]);
    }
  }
  const thin = [];
  const seen = new Set();
  for (const [y, z] of thick) {
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 6 + (k * Math.PI) / 3;
      const p = [y + (SPACING / Math.sqrt(3)) * Math.cos(a), z + (SPACING / Math.sqrt(3)) * Math.sin(a)];
      const key = `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
      if (!seen.has(key) && Math.hypot(...p) < SPACING * 2.2) {
        seen.add(key);
        thin.push(p);
      }
    }
  }
  return { thick, thin };
}

export function buildSarcomere() {
  const M = materialBank();
  const root = new THREE.Group();
  const { thick, thin } = lattice();
  const actinMat = M(0x8a78e8, { roughness: 0.45 });
  const myosinMat = M(0xf08baf, { roughness: 0.45 });
  const headMat = M(0xf5a3c1, { roughness: 0.4 });
  const zMat = M(0xe9dfc8, { roughness: 0.5, side: THREE.DoubleSide });
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();

  // Thick filaments at M lines x = −L, 0, +L (the neighbors are half in view).
  const thickGeo = new THREE.CylinderGeometry(0.62, 0.62, THICK, 10);
  thickGeo.rotateZ(Math.PI / 2);
  const thickMesh = new THREE.InstancedMesh(thickGeo, myosinMat, thick.length * 3);
  root.add(pick(thickMesh, 'thick-filament', 'Thick filament (myosin)'));

  const crowns = [];
  for (let c = BARE; c <= THICK / 2 - 0.1; c += CROWN) crowns.push(c);
  const headsPerThick = crowns.length * 2 * 3;
  const headGeo = new THREE.IcosahedronGeometry(1, 0); // low-poly: there are thousands of heads
  const headMesh = new THREE.InstancedMesh(headGeo, headMat, headsPerThick * thick.length * 3);
  root.add(pick(headMesh, 'thick-filament', 'Myosin heads'));

  // Thin filaments leave each Z disc in both directions.
  const thinGeo = new THREE.CylinderGeometry(0.35, 0.35, THIN, 8);
  thinGeo.rotateZ(Math.PI / 2);
  const thinMesh = new THREE.InstancedMesh(thinGeo, actinMat, thin.length * 4);
  root.add(pick(thinMesh, 'actin-myosin', 'Thin filament (actin)'));

  // Z discs and M lines.
  const zGeo = new THREE.CylinderGeometry(SPACING * 2.6, SPACING * 2.6, 0.9, 40);
  zGeo.rotateZ(Math.PI / 2);
  const zDiscs = [new THREE.Mesh(zGeo, zMat), new THREE.Mesh(zGeo, zMat)];
  zDiscs.forEach((z) => root.add(pick(z, 'z-disc', 'Z disc')));
  const mGeo = new THREE.CylinderGeometry(SPACING * 2.3, SPACING * 2.3, 0.5, 40);
  mGeo.rotateZ(Math.PI / 2);
  const mLines = [-1, 0, 1].map(() => {
    const m = new THREE.Mesh(mGeo, M(0xf08baf, { transparent: true, opacity: 0.35, depthWrite: false }));
    root.add(pick(m, 'sarcomere', 'M line'));
    return m;
  });

  // Titin: a thin elastic strand from each Z disc to the M line.
  const titinMat = M.line(0xe8c45a, { transparent: true, opacity: 0.75 });
  const titinGeo = new THREE.BufferGeometry();
  titinGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(thick.length * 2 * 2 * 3), 3));
  const titin = new THREE.LineSegments(titinGeo, titinMat);
  root.add(titin);

  const controls = {
    label: 'Sarcomere length',
    unit: 'µm',
    min: 2.0,
    max: 2.6,
    step: 0.01,
    value: 2.5,
    format: (v) => v.toFixed(2),
    presets: [
      { label: 'Stretched', value: 2.6 },
      { label: 'Resting', value: 2.5 },
      { label: 'Contracted', value: 2.0 },
      { label: 'Contract and relax', action: 'play' },
    ],
    playing: false,
    readout: '',
    set(L) {
      controls.value = L;
      layout(L);
      const b = sarcomereBands(L);
      controls.readout = `A band ${b.A.toFixed(2)} µm (never changes). I band ${b.I.toFixed(2)} µm. H zone ${b.H.toFixed(2)} µm.`;
      return controls.readout;
    },
  };

  function layout(L) {
    const Lu = L * U;
    // Thick filaments and heads.
    let t = 0;
    let h = 0;
    for (const cx of [-Lu, 0, Lu]) {
      for (const [y, z] of thick) {
        thickMesh.setMatrixAt(t++, m4.makeTranslation(cx, y, z));
        for (const [crown, c] of crowns.entries()) {
          for (const side of [-1, 1]) {
            for (let k = 0; k < 3; k++) {
              const a = (k * 2 * Math.PI) / 3 + crown * THREE.MathUtils.degToRad(40);
              m4.compose(
                new THREE.Vector3(cx + side * c, y + Math.cos(a) * 1.15, z + Math.sin(a) * 1.15),
                q,
                new THREE.Vector3(0.55, 0.38, 0.38),
              );
              headMesh.setMatrixAt(h++, m4);
            }
          }
        }
      }
    }
    // Thin filaments from the Z discs at ±L/2, pointing both ways.
    let n = 0;
    for (const zx of [-Lu / 2, Lu / 2]) {
      for (const dir of [-1, 1]) {
        for (const [y, z] of thin) thinMesh.setMatrixAt(n++, m4.makeTranslation(zx + (dir * THIN) / 2, y, z));
      }
    }
    zDiscs[0].position.x = -Lu / 2;
    zDiscs[1].position.x = Lu / 2;
    mLines.forEach((m, i) => (m.position.x = (i - 1) * Lu));
    const pos = titinGeo.attributes.position;
    let p = 0;
    for (const [y, z] of thick) {
      for (const zx of [-Lu / 2, Lu / 2]) {
        pos.setXYZ(p++, zx, y + 0.9, z);
        pos.setXYZ(p++, 0, y + 0.9, z);
      }
    }
    pos.needsUpdate = true;
    thickMesh.instanceMatrix.needsUpdate = true;
    headMesh.instanceMatrix.needsUpdate = true;
    thinMesh.instanceMatrix.needsUpdate = true;
  }
  controls.set(controls.value);

  let t = 0;
  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-8,
    view: { target: [0, 0, 0], direction: [0.62, 0.34, 0.72] },
    focus: [-(controls.value * U) / 2 + THIN * 0.8, thin[0][0], thin[0][1]],
    controls,
    update(dt) {
      if (!controls.playing) return;
      t += dt;
      controls.set(2.3 + 0.25 * Math.cos(t * 1.6));
    },
    dispose() {
      disposeTree(root);
      M.dispose();
    },
  };
}
