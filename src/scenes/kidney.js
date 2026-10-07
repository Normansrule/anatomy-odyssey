// Tier 3: a kidney cut in half lengthwise. 1 scene unit = 1 mm.
// About 12 cm long, 6 cm wide and 4 cm thick, its dent (the hilum) facing
// the viewer's left, toward the spine. The front half is removed so the cut
// face shows the outer cortex, eight renal pyramids of the medulla with
// renal columns between them, each pyramid's tip (papilla) cupped by a minor
// calyx, the calyces merging into the renal pelvis, and the ureter leaving.
// The renal artery branches between the pyramids (interlobar) and arches
// along their bases (arcuate). The adrenal gland sits on top.
import * as THREE from 'three/webgpu';
import { materialBank, pick, tubeThrough, taperedTube, seeded, disposeTree, COLORS } from './kit.js';

export const KIDNEY_MM = { length: 120, width: 60, thickness: 40 };
const RX = KIDNEY_MM.width / 2;
const RY = KIDNEY_MM.length / 2;
const RZ = KIDNEY_MM.thickness / 2;
const DENT = 0.34; // depth of the hilum, as a share of the half-width
export const PYRAMIDS = 8;
const HILUM = new THREE.Vector2(-RX * (1 - DENT) + 4, 0);

/** A point on the kidney outline at angle a (0 = lateral edge, π = the hilum side), scaled. */
export function kidneyPoint(a, sx = 1, sy = 1) {
  let x = RX * Math.cos(a);
  const y = RY * Math.sin(a);
  if (x < 0) x += DENT * RX * Math.exp(-((y / (0.38 * RY)) ** 2)) * (-x / RX);
  return [x * sx, y * sy];
}

function outline(sx, sy, n = 140) {
  const s = new THREE.Shape();
  for (let i = 0; i <= n; i++) {
    const [x, y] = kidneyPoint((i / n) * Math.PI * 2, sx, sy);
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  return s;
}

/** The pyramids: base on an inner curve, tip pointing toward the hilum. Returns [baseA, baseB, tip] per pyramid. */
export function pyramidLayout() {
  const out = [];
  for (let i = 0; i < PYRAMIDS; i++) {
    // Spread the pyramids around the outer (lateral) side and the two poles.
    const a = -1.95 + (i / (PYRAMIDS - 1)) * 3.9;
    const [bx1, by1] = kidneyPoint(a - 0.2, 0.78, 0.84);
    const [bx2, by2] = kidneyPoint(a + 0.2, 0.78, 0.84);
    const mid = new THREE.Vector2((bx1 + bx2) / 2, (by1 + by2) / 2);
    const tip = mid.clone().lerp(HILUM, 0.52);
    out.push({ a, base: [new THREE.Vector2(bx1, by1), new THREE.Vector2(bx2, by2)], tip });
  }
  return out;
}

export function buildKidney() {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(2525);

  // The back half: a bean with its dent at −x.
  const geo = new THREE.SphereGeometry(1, 72, 48, 0, Math.PI);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    const y = p.getY(i);
    if (x < 0) x += DENT * Math.exp(-((y / 0.38) ** 2)) * -x;
    p.setXYZ(i, x * RX, y * RY, -Math.abs(p.getZ(i)) * RZ);
  }
  geo.computeVertexNormals();
  const surface = M(0x9c4a4a, { roughness: 0.38, tissue: 'organ', natural: 0x8e3f3a, side: THREE.DoubleSide });
  root.add(pick(new THREE.Mesh(geo, surface), 'kidney', 'Kidney (its smooth capsule)'));

  // Cut face, drawn in layers: cortex, then pyramids, calyces and pelvis on top.
  const face = (shape, color, z, card, label, opts = {}) => {
    const m = new THREE.Mesh(new THREE.ShapeGeometry(shape, 6), M(color, { roughness: 0.6, ...opts }));
    m.position.z = z;
    root.add(pick(m, card, label));
    return m;
  };
  face(outline(1, 1), 0xc9675e, 0, 'renal-cortex', 'Renal cortex (where the filters are)', { tissue: 'organ', natural: 0xb85d55, repeat: [0.05, 0.05] });
  // Renal sinus: the fat-filled space around the pelvis at the hilum.
  const sinus = new THREE.Shape();
  sinus.absellipse(HILUM.x + 6, 0, 13, 30, 0, Math.PI * 2);
  face(sinus, 0xf0d58c, 0.02, 'renal-pelvis', 'Fat in the renal sinus');

  const pyrMat = { tissue: 'muscle', natural: 0x7e2f34, repeat: [1, 4] };
  const pyramids = pyramidLayout();
  for (const pyr of pyramids) {
    const s = new THREE.Shape();
    s.moveTo(pyr.base[0].x, pyr.base[0].y);
    s.quadraticCurveTo(...pyr.base[0].clone().lerp(pyr.base[1], 0.5).multiplyScalar(1.03).toArray(), pyr.base[1].x, pyr.base[1].y);
    s.lineTo(pyr.tip.x, pyr.tip.y);
    s.closePath();
    const m = face(s, 0x8e3a46, 0.04, 'renal-pyramid', 'Renal pyramid (medulla: tubules and ducts running to the tip)', pyrMat);
    // Striations: collecting ducts converging on the papilla.
    for (let k = 0; k < 6; k++) {
      const from = pyr.base[0].clone().lerp(pyr.base[1], (k + 0.5) / 6);
      root.add(pick(tubeThrough([[from.x, from.y, 0.07], [pyr.tip.x, pyr.tip.y, 0.07]], 0.18, M(0xb55a62, { roughness: 0.6 }), 8, 4), 'renal-pyramid', 'Collecting ducts in a pyramid'));
    }
    m.userData.tip = pyr.tip;
  }
  // Minor calyces cupping each papilla, merging into major calyces and the pelvis.
  const urineMat = M(0xf0e2b8, { roughness: 0.45 });
  const calyxPts = [];
  for (const pyr of pyramids) {
    const dir = HILUM.clone().sub(pyr.tip).normalize();
    const c = pyr.tip.clone().addScaledVector(dir, 2.2);
    // A cup around the papilla: a short cone opening toward the pyramid tip.
    const cupMesh = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 2.2, 5, 18, 1, true), M(0xf0e2b8, { roughness: 0.45, side: THREE.DoubleSide }));
    cupMesh.position.set(c.x - dir.x * 0.5, c.y - dir.y * 0.5, 0.1);
    cupMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-dir.x, -dir.y, 0));
    cupMesh.scale.z = 0.35;
    root.add(pick(cupMesh, 'renal-pelvis', 'Minor calyx (cups one papilla and collects its urine)'));
    calyxPts.push(c);
    root.add(pick(taperedTube([[c.x, c.y, 0.1], [(c.x + HILUM.x) / 2 + 3, c.y / 2, 0.1], [HILUM.x + 5, c.y * 0.15, 0.1]], (t) => 2.6 - 1.2 * t + 1.4 * t * t, urineMat, 16, 10), 'renal-pelvis', 'Major calyx (minor calyces merging toward the pelvis)'));
  }
  const pelvis = new THREE.Shape();
  pelvis.moveTo(HILUM.x + 8, 20);
  pelvis.quadraticCurveTo(HILUM.x - 2, 6, HILUM.x - 10, -10);
  pelvis.lineTo(HILUM.x - 6, -16);
  pelvis.quadraticCurveTo(HILUM.x + 4, -6, HILUM.x + 10, -18);
  pelvis.closePath();
  face(pelvis, 0xf0e2b8, 0.12, 'renal-pelvis', 'Renal pelvis (funnels urine into the ureter)');
  root.add(pick(tubeThrough([[HILUM.x - 8, -13, -2], [HILUM.x - 16, -30, -4], [HILUM.x - 14, -70, -6]], 2.6, urineMat, 24, 10), 'renal-pelvis', 'Ureter (to the bladder)'));

  // Blood vessels on the cut face: renal artery and vein at the hilum,
  // interlobar branches between the pyramids, arcuate arches along their bases.
  const art = M(COLORS.artery, { roughness: 0.4, tissue: 'vessel' });
  const vein = M(COLORS.vein, { roughness: 0.4, tissue: 'vein' });
  root.add(pick(tubeThrough([[HILUM.x - 40, 14, -6], [HILUM.x - 16, 10, -2], [HILUM.x + 4, 8, 0.15]], 3.2, art, 24, 10), 'kidney', 'Renal artery (from the aorta)'));
  root.add(pick(tubeThrough([[HILUM.x - 40, 2, -10], [HILUM.x - 16, 0, -4], [HILUM.x + 2, 1, -1]], 3.8, vein, 24, 10), 'kidney', 'Renal vein (to the inferior vena cava)'));
  for (let i = 0; i < pyramids.length - 1; i++) {
    const a = (pyramids[i].a + pyramids[i + 1].a) / 2;
    const [bx, by] = kidneyPoint(a, 0.8, 0.86);
    const start = new THREE.Vector2(HILUM.x + 6, 6 + (i - 3.5) * 1.5);
    const mid = start.clone().lerp(new THREE.Vector2(bx, by), 0.55);
    root.add(pick(tubeThrough([[start.x, start.y, 0.2], [mid.x, mid.y, 0.2], [bx, by, 0.2]], 0.75, art, 16, 6), 'kidney', 'Interlobar artery (runs between pyramids)'));
    // Arcuate arch over the pyramid base, with a few small arteries climbing into the cortex.
    const arch = [];
    for (let k = 0; k <= 6; k++) {
      const [x, y] = kidneyPoint(a + (k / 6 - 0.5) * 0.42, 0.81, 0.87);
      arch.push([x, y, 0.22]);
    }
    root.add(pick(tubeThrough(arch, 0.45, art, 16, 5), 'kidney', 'Arcuate artery (arches along the pyramid bases)'));
    for (let k = 0; k < 3; k++) {
      const aa = a + (rand() - 0.5) * 0.35;
      const [x0, y0] = kidneyPoint(aa, 0.81, 0.87);
      const [x1, y1] = kidneyPoint(aa, 0.96, 0.97);
      root.add(pick(tubeThrough([[x0, y0, 0.23], [x1, y1, 0.23]], 0.22, art, 4, 4), 'renal-cortex', 'Small artery feeding the filters in the cortex'));
    }
  }

  // Adrenal gland on the upper pole.
  const capGeo = new THREE.SphereGeometry(1, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2);
  const cp = capGeo.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i);
    const y = cp.getY(i);
    // Peaked toward the medial side, like a cocked hat on the upper pole.
    cp.setXYZ(i, x * 17, y * (16 + 10 * Math.max(0, -x)), cp.getZ(i) * 6);
  }
  capGeo.computeVertexNormals();
  const adrenal = new THREE.Mesh(capGeo, M(0xe0b25a, { roughness: 0.55, tissue: 'organ', natural: 0xd9a64e, side: THREE.DoubleSide }));
  adrenal.position.set(-4, RY - 6, -10);
  adrenal.rotation.z = 0.25;
  root.add(pick(adrenal, 'adrenal-gland', 'Adrenal gland'));

  const focus = [pyramids[3].base[0].x * 0.98, pyramids[3].base[0].y * 0.98, 0.3];
  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-3,
    view: { target: [-6, 4, -4], direction: [0.22, 0.12, 1] },
    focus,
    dispose() {
      disposeTree(root);
      M.dispose();
    },
  };
}
