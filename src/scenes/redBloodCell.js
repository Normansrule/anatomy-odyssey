// Tier 5: one red blood cell, cut open. 1 scene unit = 0.1 µm.
// The Evans–Fung shape (7.8 µm across, 0.8 µm thick at the center, about
// 2.6 µm at the rim) with a wedge removed. The cut faces are packed with
// hemoglobin, drawn about 12 times too large so it can be seen at all.
import * as THREE from 'three/webgpu';
import { materialBank, pick, seeded, disposeTree } from './kit.js';
import { rbcGeometry, rbcProfile } from './rbcShape.js';
import { RBC, rbcThickness } from '../science/equations.js';

const U = 10; // scene units per micrometer
const CUT_CENTER = 0.46; // lathe angle facing the default camera
const CUT_HALF = Math.PI / 4;

export function buildRedBloodCell() {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(47);
  const phiStart = CUT_CENTER + CUT_HALF;
  const phiLength = Math.PI * 2 - 2 * CUT_HALF;

  const shellGeo = rbcGeometry(U, { segments: 72, phiStart, phiLength });
  root.add(pick(new THREE.Mesh(shellGeo, M(0xd9434f, { roughness: 0.4, side: THREE.DoubleSide })), 'red-blood-cell', 'Cell membrane'));

  // Cut faces: the closed profile, turned to each edge of the wedge.
  const profile = rbcProfile(U, 40);
  const faceGeo = new THREE.ShapeGeometry(new THREE.Shape(profile));
  const faceMat = M(0x9e2a40, { roughness: 0.85, side: THREE.DoubleSide });
  const faces = [phiStart, phiStart + phiLength];
  for (const phi of faces) {
    const face = new THREE.Mesh(faceGeo, faceMat);
    face.rotation.y = phi - Math.PI / 2;
    root.add(pick(face, 'hemoglobin', 'Packed hemoglobin'));
  }

  // Hemoglobin dots on the cut faces (enlarged; about 270 million fill a real cell).
  const dotGeo = new THREE.SphereGeometry(0.34, 8, 6);
  const dotMat = M(0xf07a88, { roughness: 0.45 });
  const PER_FACE = 950;
  const dots = new THREE.InstancedMesh(dotGeo, dotMat, PER_FACE * 2);
  const m4 = new THREE.Matrix4();
  let n = 0;
  for (const phi of faces) {
    const inward = phi === phiStart ? 1 : -1; // nudge toward the solid side
    let placed = 0;
    while (placed < PER_FACE) {
      const r = rand() * RBC.R * 0.985;
      const half = rbcThickness(r) / 2;
      const y = (rand() * 2 - 1) * half * 0.92;
      const rr = r * U;
      const a = phi + inward * 0.004;
      m4.makeTranslation(Math.sin(a) * rr, y * U, Math.cos(a) * rr);
      dots.setMatrixAt(n++, m4);
      placed++;
    }
  }
  root.add(pick(dots, 'hemoglobin', 'Hemoglobin (enlarged)'));

  // Membrane proteins dotting the outer surface.
  const protGeo = new THREE.SphereGeometry(0.38, 8, 6);
  const prot = new THREE.InstancedMesh(protGeo, M(0xe8707f, { roughness: 0.45 }), 140);
  for (let i = 0; i < 140; i++) {
    let phi;
    do phi = rand() * Math.PI * 2;
    while (Math.abs(((phi - CUT_CENTER + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < CUT_HALF + 0.05);
    const r = rand() * RBC.R * 0.97;
    const y = (rand() < 0.5 ? -1 : 1) * (rbcThickness(r) / 2);
    const rr = r * U;
    m4.makeTranslation(Math.sin(phi) * rr, y * U, Math.cos(phi) * rr);
    prot.setMatrixAt(i, m4);
  }
  root.add(pick(prot, 'cell-membrane', 'Membrane protein'));

  const rF = 18;
  const focus = [Math.sin(faces[0]) * rF, 0, Math.cos(faces[0]) * rF];
  // Side trip into the membrane: aim at the top surface near the rim.
  const rB = RBC.R * 0.8;
  const branchFocus = [0, (rbcThickness(rB) / 2) * U, -rB * U];

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-7,
    view: { target: [0, -2, 0], direction: [0.42, 0.62, 0.78] },
    focus,
    branchFocus,
    dispose() {
      faceGeo.dispose();
      dotGeo.dispose();
      protGeo.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
