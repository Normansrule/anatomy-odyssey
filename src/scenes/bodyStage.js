// The world the whole body stands in: a turntable plinth, like the dais an anatomical model
// stands on in a museum case, with a dial engraved round its rim, and beside it a stadiometer,
// the measuring rod a clinic stands you against, read off at the top of the head.

import * as THREE from 'three/webgpu';

export const PLINTH = { radius: 0.44, depth: 0.04 };
export const ROD = { x: 0.4, z: -0.12, height: 1.75 };
const INK = 0x2b2620;
const STONE = 0xddd3bf;

/** Tick marks round the plinth's rim: a short one every 5 degrees, a long one every 30. */
export function dialTicks(step = 5) {
  const ticks = [];
  for (let deg = 0; deg < 360; deg += step) ticks.push({ deg, long: deg % 30 === 0 });
  return ticks;
}

/** Marks on the rod: every centimeter, longer every 5 cm, numbered every 10 cm. */
export function rodMarks(heightCm) {
  const marks = [];
  for (let cm = 0; cm <= heightCm; cm++) marks.push({ cm, size: cm % 10 === 0 ? 'ten' : cm % 5 === 0 ? 'five' : 'one' });
  return marks;
}

function rodFaceTexture(heightCm) {
  if (typeof document === 'undefined') return null;
  const pxPerCm = 12;
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = heightCm * pxPerCm;
  const g = canvas.getContext('2d');
  g.fillStyle = '#efe2c4';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#2b2620';
  g.font = 'bold 30px Archivo, "Helvetica Neue", Arial, sans-serif';
  g.textBaseline = 'middle';
  for (const { cm, size } of rodMarks(heightCm)) {
    const y = canvas.height - cm * pxPerCm;
    const w = size === 'ten' ? 44 : size === 'five' ? 28 : 14;
    g.fillRect(0, y - 1.5, w, size === 'one' ? 2 : 4);
    if (size === 'ten' && cm > 0 && cm < heightCm) g.fillText(String(cm), 48, y);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Build the stage for a figure `height` meters tall. Returns the group and fade(t), which
 * takes the stage away (t = 1) when the body is taken apart into a row.
 */
export function buildStage(M, { height }) {
  const g = new THREE.Group();
  g.name = 'stage';
  const fading = [];
  const own = (mat) => {
    const m = mat.clone();
    m.transparent = true;
    fading.push({ m, base: m.opacity ?? 1 });
    return m;
  };
  const still = (o) => {
    o.raycast = () => {}; // the stage is never picked
    return o;
  };

  // The plinth: a low drum, its top flush with the floor the figure stands on.
  const stone = own(M(STONE, { roughness: 0.85 }));
  const drum = still(new THREE.Mesh(new THREE.CylinderGeometry(PLINTH.radius, PLINTH.radius + 0.012, PLINTH.depth, 120, 1), stone));
  drum.position.y = -PLINTH.depth / 2;
  g.add(drum);
  const ink = own(M.basic(INK));
  const rim = still(new THREE.Mesh(new THREE.TorusGeometry(PLINTH.radius - 0.004, 0.0016, 6, 160), ink));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.0008;
  g.add(rim);
  const inner = still(new THREE.Mesh(new THREE.TorusGeometry(PLINTH.radius - 0.05, 0.0009, 6, 160), ink));
  inner.rotation.x = Math.PI / 2;
  inner.position.y = 0.0008;
  g.add(inner);
  // The dial: one merged mesh of ticks between the two rings.
  const tickGeos = dialTicks().map(({ deg, long }) => {
    const len = long ? 0.034 : 0.016;
    const geo = new THREE.BoxGeometry(long ? 0.003 : 0.0018, 0.0008, len);
    const a = (deg * Math.PI) / 180;
    const r = PLINTH.radius - 0.008 - len / 2;
    geo.rotateY(-a);
    geo.translate(Math.sin(a) * r, 0.0006, Math.cos(a) * r);
    return geo;
  });
  const ticks = still(new THREE.Mesh(mergeBoxes(tickGeos), ink));
  g.add(ticks);

  // The stadiometer: a rod on its own foot at the plinth's edge, a cm scale on its face, and a
  // headboard that slides down to rest level with the top of the head.
  const heightCm = Math.round(ROD.height * 100);
  const wood = own(M(0xa88b5c, { roughness: 0.7 }));
  const rod = still(new THREE.Mesh(new THREE.BoxGeometry(0.036, ROD.height, 0.018), wood));
  rod.position.set(ROD.x, ROD.height / 2, ROD.z);
  g.add(rod);
  const tex = rodFaceTexture(heightCm);
  if (tex) {
    const faceMat = own(M.basic(0xffffff, { map: tex }));
    for (const side of [1, -1]) {
      const face = still(new THREE.Mesh(new THREE.PlaneGeometry(0.034, ROD.height), faceMat));
      face.position.set(ROD.x, ROD.height / 2, ROD.z + side * 0.0092);
      if (side < 0) face.rotation.y = Math.PI;
      g.add(face);
    }
  }
  const foot = still(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.008, 0.07), own(M(INK, { roughness: 0.5 }))));
  foot.position.set(ROD.x, 0.004, ROD.z);
  g.add(foot);
  // The headboard reaches from the rod to rest on the crown.
  const reach = Math.abs(ROD.x);
  const board = still(new THREE.Mesh(new THREE.BoxGeometry(reach, 0.004, 0.03), wood));
  board.position.set(ROD.x - Math.sign(ROD.x) * (reach / 2), height + 0.002, ROD.z + 0.07);
  g.add(board);
  const collar = still(new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.024, 0.03), own(M(INK, { roughness: 0.45 }))));
  collar.position.set(ROD.x, height, ROD.z);
  g.add(collar);

  return {
    group: g,
    fade(t) {
      const k = 1 - Math.min(1, Math.max(0, t));
      for (const { m, base } of fading) {
        m.opacity = base * k;
        m.depthWrite = k > 0.98;
      }
      g.visible = k > 0.01;
    },
  };
}

/** Merge axis-aligned boxes into one geometry (positions and normals only). */
function mergeBoxes(geos) {
  let count = 0;
  for (const geo of geos) count += geo.index.count;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  let o = 0;
  for (const geo of geos) {
    const p = geo.attributes.position.array;
    const n = geo.attributes.normal.array;
    for (const i of geo.index.array) {
      pos.set(p.subarray(i * 3, i * 3 + 3), o * 3);
      nor.set(n.subarray(i * 3, i * 3 + 3), o * 3);
      o++;
    }
    geo.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}
