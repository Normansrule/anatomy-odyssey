// The front of each eye: an iris with its fibres, collarette and dark limbal ring; a pupil that
// answers the light; and the clear dome of the cornea over both, which catches the studio light
// as a glint. The page's theme is the room's light: on the pale sheet the pupils narrow, on the
// dark slate they widen, as yours do walking from daylight into a dim room.

import * as THREE from 'three/webgpu';
import { pick, seeded } from './kit.js';

/** Iris radius (m): the visible iris is about 11.8 mm across. */
export const IRIS_RADIUS = 0.0058;
/**
 * Pupil diameters (m): about 3 mm in a lit room, about 6 mm in a dim one (the full range is
 * roughly 2 to 8 mm). Narrowing is quick, under a second; widening is slower, a few seconds.
 */
export const PUPIL = { bright: 0.003, dim: 0.006, constrict: 0.35, dilate: 1.6 };

/** The pupil diameter the eye is heading for in this light. */
export function pupilTarget(dim) {
  return dim ? PUPIL.dim : PUPIL.bright;
}

/** One step of the pupil toward `target`: an exponential approach, faster narrowing than widening. */
export function pupilStep(d, target, dt) {
  const tau = target < d ? PUPIL.constrict : PUPIL.dilate;
  return target + (d - target) * Math.exp(-dt / tau);
}

/**
 * The iris is painted in polar form: a canvas column is an angle round the eye, a row a distance
 * out from the pupil. Wrapped on a sphere whose pole faces forward, that lays it out as a ring.
 * `ringRow(r)` gives the canvas row (as a fraction of the height) where the ring of radius
 * fraction r (0 at the centre, 1 at the rim) falls on the front half of the dome.
 */
export function ringRow(r) {
  return Math.asin(Math.min(1, Math.max(0, r))) / Math.PI;
}

function irisTexture() {
  if (typeof document === 'undefined') return null;
  const W = 512;
  const H = 512;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  const rand = seeded(11);
  const row = (r) => ringRow(r) * H;
  // The back of the dome, never seen.
  g.fillStyle = '#121418';
  g.fillRect(0, 0, W, H);
  // Base: slate blue-grey, warming to a hazel collarette round the pupil, as many blue eyes do.
  const base = g.createLinearGradient(0, row(0), 0, row(1));
  base.addColorStop(0, '#5a4a30');
  base.addColorStop(0.3, '#7a6a48');
  base.addColorStop(0.42, '#557590');
  base.addColorStop(0.8, '#4b6c8c');
  base.addColorStop(1, '#2c3f55');
  g.fillStyle = base;
  g.fillRect(0, row(0), W, row(1) - row(0));
  // Radial fibres (the stroma): thin light and dark threads from the collarette to the rim.
  for (let i = 0; i < 420; i++) {
    const x = rand() * W;
    const light = rand() > 0.45;
    g.strokeStyle = light ? `rgba(190,210,225,${0.12 + 0.2 * rand()})` : `rgba(20,30,45,${0.15 + 0.2 * rand()})`;
    g.lineWidth = 0.6 + rand() * 1.6;
    g.beginPath();
    g.moveTo(x, row(0.3 + 0.12 * rand()));
    g.lineTo(x + (rand() - 0.5) * 6, row(0.85 + 0.15 * rand()));
    g.stroke();
  }
  // Crypts: small dark pits in the stroma.
  for (let i = 0; i < 70; i++) {
    g.fillStyle = `rgba(15,22,32,${0.25 + 0.3 * rand()})`;
    const y = row(0.45 + 0.4 * rand());
    g.beginPath();
    g.ellipse(rand() * W, y, 2 + 4 * rand(), 1.5 + 3 * rand(), 0, 0, Math.PI * 2);
    g.fill();
  }
  // The collarette, a ragged ring about a third of the way out, and the dark limbal ring at the rim.
  g.fillStyle = 'rgba(205,175,120,0.55)';
  for (let x = 0; x < W; x += 3) g.fillRect(x, row(0.38) + Math.sin(x * 0.11) * 3 + (rand() - 0.5) * 4, 3, 3);
  const limbus = g.createLinearGradient(0, row(0.86), 0, row(1));
  limbus.addColorStop(0, 'rgba(15,22,34,0)');
  limbus.addColorStop(1, 'rgba(15,22,34,0.95)');
  g.fillStyle = limbus;
  g.fillRect(0, row(0.86), W, row(1) - row(0.86));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const PUPIL_DEPTH = 0.0001;
/** Where the glint sits on the cornea, from the eye's centre (m), and its radius. */
const GLINT = { x: 0.0017, y: 0.0019, z: 0.0016, r: 0.0009 };

/** A sphere with its pole facing forward (+z), scaled to radius `r` and depth `depth`. */
function dome(at, r, depth, material, seg = 40) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, seg, Math.round(seg / 2)), material);
  mesh.rotation.x = Math.PI / 2; // the sphere's +y pole now faces +z
  mesh.scale.set(r, depth, r);
  mesh.position.set(...at);
  return mesh;
}

/**
 * Build both eyes' fronts at the landmark positions: `xs` the two centres across, `y` their
 * height, `front` the front of the eyeball. Returns the group and update(dt, { dim, still }).
 */
export function buildEyeFronts(M, { xs, y, front }) {
  const group = new THREE.Group();
  group.name = 'eye-fronts';
  const tex = irisTexture();
  const irisMat = tex ? M(0xffffff, { map: tex, roughness: 0.42 }) : M(0x3f5f80, { roughness: 0.2 });
  const pupilMat = M(0x050506, { roughness: 0.3 });
  // The cornea: a clear dome over the iris, glossy enough to carry the light's reflection.
  const corneaMat = M(0xffffff, { transparent: true, opacity: 0.07, roughness: 0.03, metalness: 0, depthWrite: false });
  // The glint: the studio's key light, which rides above and to the right of your view, seen
  // reflected in the curve of the cornea up and to the right of the pupil.
  const glintMat = M.basic(0xffffff, { transparent: true, opacity: 0.9, depthWrite: false });
  const pupils = [];
  let d = PUPIL.bright;
  for (const x of xs) {
    group.add(pick(dome([x, y, front - 0.0013], IRIS_RADIUS, 0.0016, irisMat), 'iris', 'Iris and pupil'));
    // The pupil: a thin black disc lying on the crown of the iris, scaled to its diameter.
    const pupil = pick(dome([x, y, front - 0.0013 + 0.0016], 1, PUPIL_DEPTH, pupilMat, 24), 'iris', 'Pupil');
    pupils.push(pupil);
    group.add(pupil);
    group.add(pick(dome([x, y, front - 0.0016], IRIS_RADIUS * 1.08, 0.0034, corneaMat), 'cornea', 'Cornea'));
    const glint = dome([x + GLINT.x, y + GLINT.y, front + GLINT.z], GLINT.r, 0.00008, glintMat, 16);
    glint.raycast = () => {};
    group.add(glint);
  }
  const size = () => {
    for (const p of pupils) p.scale.set(d / 2, PUPIL_DEPTH, d / 2);
  };
  size();
  return {
    group,
    /** The current pupil diameter (m). */
    get pupil() {
      return d;
    },
    update(dt, { dim = false, still = false } = {}) {
      const target = pupilTarget(dim);
      d = still ? target : pupilStep(d, target, dt);
      size();
    },
  };
}
