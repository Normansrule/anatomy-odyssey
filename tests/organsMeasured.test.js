import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three/webgpu';
import { loadBodyParts } from '../src/scenes/bodyMeshes.js';
import { buildBrain } from '../src/scenes/brain.js';
import { buildLungs } from '../src/scenes/lungs.js';
import { buildMeasuredBrain, brainParts, GYRI, LOBES } from '../src/scenes/brainMeasured.js';
import { buildMeasuredLungs } from '../src/scenes/lungsMeasured.js';
import { buildPancreas } from '../src/scenes/pancreas.js';
import { buildLiver, LIVER_STAGES } from '../src/scenes/liver.js';
import { buildMeasuredPancreas } from '../src/scenes/pancreasMeasured.js';
import { buildMeasuredLiver } from '../src/scenes/liverMeasured.js';
import { insideTester, partOf, cutAway, sectionLoops, partAxes } from '../src/scenes/organKit.js';
import { buildKidney } from '../src/scenes/kidney.js';
import { buildMeasuredKidney } from '../src/scenes/kidneyMeasured.js';
import { buildFemur } from '../src/scenes/femur.js';
import { buildMeasuredFemur } from '../src/scenes/femurMeasured.js';
import { buildDigestiveTract, GUT_STAGES } from '../src/scenes/digestiveTract.js';
import { buildUrinaryTract, ureterRoute, URINE_STAGES } from '../src/scenes/urinaryTract.js';
import { getDive } from '../src/data/dives.js';
import { buildHeart } from '../src/scenes/heart.js';
import { buildMeasuredHeart, fourChamberPlane, STROKE_ML } from '../src/scenes/heartMeasured.js';
import LANDMARKS from '../src/data/bodyLandmarks.json';
import { getCard } from '../src/data/cards.js';

const bytes = readFileSync(new URL('../assets/anatomy/body.glb', import.meta.url));
const fileFetch = async () => ({ ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });

const cardsIn = (built) => {
  const ids = new Set();
  built.root.traverse((o) => o.userData.cardId && ids.add(o.userData.cardId));
  return ids;
};
const boundsCm = (built) => new THREE.Box3().setFromObject(built.root);

describe('the measured organ close-ups', async () => {
  const parts = await loadBodyParts({ fetchImpl: fileFetch });

  it('fall back to the drawn scenes until the anatomy bundle loads', () => {
    expect(buildMeasuredBrain(null)).toBeNull();
    expect(buildMeasuredLungs(null)).toBeNull();
    expect(buildMeasuredPancreas(null)).toBeNull();
    expect(buildMeasuredLiver(null)).toBeNull();
    expect(buildMeasuredHeart(null)).toBeNull();
    expect(buildMeasuredKidney(null)).toBeNull();
    expect(buildMeasuredFemur(null)).toBeNull();
  });

  describe('brain', () => {
    it('is the measured brain once the bundle has loaded, at its real size', () => {
      const built = buildBrain();
      expect(built.detailed).toBe(true);
      expect(built.root.position.length()).toBe(0);
      const size = boundsCm(built).getSize(new THREE.Vector3());
      // About 17 cm front to back (the brain card), a little narrower side to side.
      expect(size.z).toBeGreaterThan(14);
      expect(size.z).toBeLessThan(19);
      expect(size.x).toBeGreaterThan(11);
      expect(size.x).toBeLessThan(size.z);
      built.dispose();
    });

    it('knows the lobe of every measured fold, and opens a real card from every part', () => {
      for (const p of brainParts(parts)) {
        if (['cerebellum', 'brainstem', 'corpus-callosum'].includes(p.extras.card)) continue;
        expect(GYRI[p.extras.label], p.extras.label).toBeTruthy();
        expect(LOBES[GYRI[p.extras.label][0]]).toBeTruthy();
      }
      const built = buildBrain();
      const ids = cardsIn(built);
      expect([...ids].sort()).toEqual(['brainstem', 'cerebellum', 'cerebral-cortex', 'corpus-callosum']);
      for (const id of ids) expect(getCard(id), id).toBeTruthy();
      built.dispose();
    });

    it('colors the lobes, and turns the outer cortex see-through to show the middle', () => {
      const built = buildBrain();
      const cortex = [];
      built.root.traverse((o) => o.userData.lobe && cortex.push(o));
      const colors = () => new Set(cortex.map((m) => m.material.color.getHex()));
      built.controls.set(0);
      expect(colors().size).toBe(1);
      built.controls.set(1);
      expect(colors().size).toBe(new Set(cortex.map((m) => m.userData.lobe)).size); // one color per lobe
      const text = built.controls.set(2);
      expect(text).toMatch(/corpus callosum/);
      const frontal = cortex.find((m) => m.userData.lobe === 'frontal');
      const limbic = cortex.find((m) => m.userData.lobe === 'limbic');
      expect(frontal.material.transparent).toBe(true);
      expect(frontal.userData.pickPriority).toBe(-1);
      expect(limbic.material.transparent).toBe(false);
      built.dispose();
    });

    it('enters the cortex dive from the top of the left hemisphere', () => {
      const built = buildBrain();
      const [x, y] = built.focus;
      expect(x).toBeGreaterThan(0);
      expect(y).toBeGreaterThan(boundsCm(built).max.y - 3);
      built.dispose();
    });
  });

  describe('lungs', () => {
    it('are the measured lungs: five lobes, the airways, the pulmonary vessels and the diaphragm', () => {
      const built = buildLungs({ reducedMotion: true });
      expect(built.detailed).toBe(true);
      expect(built.root.position.length()).toBe(0);
      const lobes = [];
      built.root.traverse((o) => o.userData.cardId === 'lungs' && lobes.push(o.userData.label));
      expect(lobes.sort()).toEqual(['Lower lobe of left lung', 'Lower lobe of right lung', 'Middle lobe of right lung', 'Upper lobe of left lung', 'Upper lobe of right lung']);
      const ids = cardsIn(built);
      for (const id of ['trachea', 'bronchi', 'bronchiole', 'alveolus', 'great-vessels', 'heart', 'diaphragm']) expect(ids.has(id), id).toBe(true);
      for (const id of ids) expect(getCard(id), id).toBeTruthy();
      built.dispose();
    });

    it('draws bronchioles that end inside the lobes, and enters the alveoli from the right lung', () => {
      const built = buildLungs({ reducedMotion: true });
      let twigs = 0;
      built.root.traverse((o) => o.userData.cardId === 'bronchiole' && twigs++);
      expect(twigs).toBeGreaterThan(50);
      expect(built.focus[0]).toBeLessThan(0);
      const box = boundsCm(built);
      expect(box.containsPoint(new THREE.Vector3(...built.focus))).toBe(true);
      built.dispose();
    });

    it('breathes: the diaphragm moves down and the lungs expand about their roots', () => {
      const built = buildLungs({ reducedMotion: true });
      let dome = null;
      built.root.traverse((o) => o.userData.cardId === 'diaphragm' && (dome = o));
      built.controls.set(0);
      const y0 = dome.position.y;
      const out = boundsCm(built).getSize(new THREE.Vector3());
      built.controls.set(1);
      expect(dome.position.y).toBeLessThan(y0 - 1);
      const inn = boundsCm(built).getSize(new THREE.Vector3());
      expect(inn.x).toBeGreaterThan(out.x);
      expect(built.controls.readout).toMatch(/500 mL/);
      built.dispose();
      const playing = buildLungs();
      playing.controls.set(0);
      playing.update(1.25);
      expect(playing.controls.value).toBeCloseTo(0.5, 1);
      playing.dispose();
    });
  });

  describe('pancreas', () => {
    it('is the measured gland in the curve of the duodenum, with the spleen at its tail', () => {
      const built = buildPancreas({ reducedMotion: true });
      expect(built.detailed).toBe(true);
      expect(built.root.position.length()).toBe(0);
      const ids = cardsIn(built);
      for (const id of ['pancreas', 'duodenum', 'spleen', 'gallbladder', 'pancreatic-duct', 'islet']) expect(ids.has(id), id).toBe(true);
      for (const id of ids) expect(getCard(id), id).toBeTruthy();
      // About 15 cm from head to tail.
      const size = boundsCm(built).getSize(new THREE.Vector3());
      expect(size.x).toBeGreaterThan(120);
      built.dispose();
    });

    it('runs the duct from the tail to the ampulla on the duodenum, with islets inside the gland', () => {
      const D = LANDMARKS.digestive;
      const duct = D.pancreaticDuct;
      expect(duct.length).toBeGreaterThan(10);
      expect(duct[0][0]).toBeGreaterThan(duct.at(-1)[0]); // tail on the body's left (+x), head on the right
      const [hx, hy, hz] = duct.at(-1);
      expect(Math.hypot(hx - D.ampulla[0], hy - D.ampulla[1], hz - D.ampulla[2])).toBeLessThan(0.04);
      const inside = insideTester(partOf(parts, 'pancreas').geometry);
      const built = buildPancreas({ reducedMotion: true });
      const c = LANDMARKS.pancreas;
      let islets = 0;
      built.root.traverse((o) => {
        if (o.userData.cardId !== 'islet') return;
        islets++;
        const p = o.position.clone().multiplyScalar(1e-3).add(new THREE.Vector3(...c));
        expect(inside(p)).toBe(true);
      });
      expect(islets).toBeGreaterThan(60);
      built.dispose();
    });

    it('starts the juice flowing after a meal', () => {
      const built = buildPancreas({ reducedMotion: true });
      const juice = [];
      built.root.traverse((o) => o.userData.label === 'Pancreatic juice flowing to the duodenum' && juice.push(o));
      expect(built.controls.set(0)).toMatch(/glucagon/);
      expect(juice.every((m) => !m.visible)).toBe(true);
      expect(built.controls.set(1)).toMatch(/insulin/);
      expect(juice.every((m) => m.visible)).toBe(true);
      built.dispose();
    });
  });

  describe('liver', () => {
    it('is the measured liver with its gallbladder, vessels and a magnifier on the lobules', () => {
      const built = buildLiver({ reducedMotion: true });
      expect(built.detailed).toBe(true);
      expect(built.root.position.length()).toBe(0);
      const ids = cardsIn(built);
      for (const id of ['liver', 'gallbladder', 'liver-vessels', 'hepatic-lobule', 'duodenum']) expect(ids.has(id), id).toBe(true);
      for (const id of ids) expect(getCard(id), id).toBeTruthy();
      // Over 20 cm side to side; the magnifier sits on the right lobe (−x), where the dive continues.
      const box = boundsCm(built);
      expect(box.getSize(new THREE.Vector3()).x).toBeGreaterThan(180);
      expect(built.focus[0]).toBeLessThan(0);
      built.dispose();
    });

    it('steps through blood in, blood out and bile out', () => {
      const built = buildLiver({ reducedMotion: true });
      const bile = [];
      built.root.traverse((o) => o.userData.label === 'Bile' && bile.push(o));
      built.controls.set(0);
      expect(bile.every((m) => !m.visible)).toBe(true);
      built.controls.set(LIVER_STAGES.length - 1);
      expect(bile.every((m) => m.visible)).toBe(true);
      built.dispose();
    });
  });

  describe('heart', () => {
    it('finds four real chambers inside the measured wall, each a plausible size', () => {
      const C = LANDMARKS.heartChambers.chambers;
      expect(Object.keys(C)).toEqual(['rightAtrium', 'rightVentricle', 'leftAtrium', 'leftVentricle']);
      for (const c of Object.values(C)) {
        expect(c.volumeMl).toBeGreaterThan(40); // a chamber holds roughly 50 to 150 mL
        expect(c.volumeMl).toBeLessThan(160);
      }
      // Right chambers toward the body's right (−x) of their left partners, the atria above and behind.
      expect(C.rightAtrium.center[0]).toBeLessThan(C.leftAtrium.center[0]);
      expect(C.rightVentricle.center[0]).toBeLessThan(C.leftVentricle.center[0]);
      expect(C.leftAtrium.center[2]).toBeLessThan(C.leftVentricle.center[2]);
      expect(C.leftAtrium.center[1]).toBeGreaterThan(C.leftVentricle.center[1]);
      // Chamber points are hollows, not wall (a few 3 mm cells at the lining may graze it).
      const wall = insideTester(partOf(parts, 'heart', 'Heart').geometry);
      for (const c of Object.values(C)) {
        const inWall = c.points.filter((p) => wall(new THREE.Vector3(...p))).length;
        expect(inWall / c.points.length).toBeLessThan(0.1);
      }
    });

    it('cuts through all four chambers, keeping only what lies behind the cut', () => {
      const { point, normal } = fourChamberPlane();
      expect(normal[2]).toBeGreaterThan(0);
      const side = (p) => p.reduce((s, x, i) => s + (x - point[i]) * normal[i], 0);
      for (const c of Object.values(LANDMARKS.heartChambers.chambers)) {
        const d = c.points.map(side);
        expect(d.some((x) => x < 0) && d.some((x) => x > 0)).toBe(true);
      }
      const cut = cutAway(partOf(parts, 'heart', 'Heart').geometry, point, normal);
      const a = cut.attributes.position.array;
      for (let i = 0; i < a.length; i += 3) expect(side([a[i], a[i + 1], a[i + 2]])).toBeLessThan(1e-6); // float32 positions
      expect(a.length / 3).toBeGreaterThan(10000);
    });

    it('is the measured heart once the bundle has loaded, with blood in every chamber', () => {
      const built = buildHeart({ reducedMotion: true });
      expect(built.detailed).toBe(true);
      expect(built.root.position.length()).toBe(0);
      const ids = cardsIn(built);
      for (const id of ['heart', 'heart-valves', 'coronary-arteries', 'aorta', 'great-vessels', 'blood']) expect(ids.has(id), id).toBe(true);
      for (const id of ids) expect(getCard(id), id).toBeTruthy();
      const chambers = [];
      built.root.traverse((o) => o.isInstancedMesh && chambers.push(o.userData.label.split(':')[0]));
      expect(chambers).toEqual(['Right atrium', 'Right ventricle', 'Left atrium', 'Left ventricle']);
      // About 12 cm across, and the dive continues from the blood in the left ventricle (the body's left, +x).
      const size = boundsCm(built).getSize(new THREE.Vector3());
      expect(Math.max(size.x, size.y)).toBeGreaterThan(9);
      expect(built.focus[0]).toBeGreaterThan(0);
      built.dispose();
    });

    it('beats faster with the rate control, and pumps rate × stroke volume a minute', () => {
      expect(buildHeart({ reducedMotion: true }).controls.set(72)).toMatch(new RegExp(`${((72 * STROKE_ML) / 1000).toFixed(1)} L`));
      const built = buildHeart();
      let lv = null;
      built.root.traverse((o) => o.isInstancedMesh && o.userData.label.startsWith('Left ventricle') && (lv = o));
      const spread = () => {
        lv.computeBoundingBox();
        return lv.boundingBox.getSize(new THREE.Vector3()).length();
      };
      built.controls.set(60);
      const relaxed = spread();
      built.update(0.18 - 0.5 + 1); // from mid-beat (0.5) on to the squeeze (phase 0.18) at 60 beats a minute
      expect(spread()).toBeLessThan(relaxed);
      built.dispose();
    });
  });

  describe('kidney', () => {
    it('is cut along its own broad plane, through its length, with the real outline as the cut face', () => {
      const g = partOf(parts, 'kidney', 'Left kidney').geometry;
      const { center, long, lateral, normal } = partAxes(g);
      expect(long[1]).toBeGreaterThan(0.8); // the long axis runs up and down
      expect(lateral[0]).toBeGreaterThan(0.5); // away from the spine, for the left kidney
      expect(normal[2]).toBeGreaterThan(0.5); // the cut faces the front
      const [loop] = sectionLoops(g, center, normal);
      const span = (axis) => {
        const d = loop.map((p) => p.reduce((s, x, i) => s + (x - center[i]) * axis[i], 0));
        return (Math.max(...d) - Math.min(...d)) * 100;
      };
      // About 10 to 13 cm long and 5 to 7 cm wide.
      expect(span(long)).toBeGreaterThan(9);
      expect(span(long)).toBeLessThan(14);
      expect(span(lateral)).toBeGreaterThan(4.5);
      expect(span(lateral)).toBeLessThan(8);
      for (const p of loop) expect(Math.abs(p.reduce((s, x, i) => s + (x - center[i]) * normal[i], 0))).toBeLessThan(1e-6);
    });

    it('fits the drawn inside within the real cut face, and names every part', () => {
      const built = buildKidney();
      expect(built.detailed).toBe(true);
      expect(built.root.position.length()).toBe(0);
      const ids = cardsIn(built);
      for (const id of ['kidney', 'renal-cortex', 'renal-pyramid', 'renal-pelvis', 'adrenal-gland']) expect(ids.has(id), id).toBe(true);
      for (const id of ids) expect(getCard(id), id).toBeTruthy();
      let face = null;
      const pyramids = [];
      built.root.traverse((o) => {
        if (o.userData.cardId === 'renal-cortex' && o.userData.label.startsWith('Renal cortex')) face = o;
        if (o.userData.label?.startsWith('Renal pyramid')) pyramids.push(o);
      });
      expect(pyramids.length).toBe(8);
      // Every pyramid sits on the cut face, inside its outline.
      face.geometry.computeBoundingBox();
      const box = face.geometry.boundingBox.clone().expandByScalar(1);
      for (const m of pyramids) {
        m.geometry.computeBoundingBox();
        expect(box.containsBox(m.geometry.boundingBox)).toBe(true);
      }
      expect(box.containsPoint(new THREE.Vector3(...built.focus))).toBe(true);
      built.dispose();
    });
  });

  describe('femur', () => {
    const layers = (built) => {
      const out = {};
      built.root.traverse((o) => o.userData.label && (out[o.userData.label.split(' (')[0]] = o));
      return out;
    };

    it('is the measured left femur, cut open along its whole length', () => {
      const built = buildFemur();
      expect(built.detailed).toBe(true);
      expect(built.root.position.length()).toBe(0);
      const ids = cardsIn(built);
      for (const id of ['femur', 'compact-bone', 'bone-marrow', 'spongy-bone', 'articular-cartilage']) expect(ids.has(id), id).toBe(true);
      for (const id of ids) expect(getCard(id), id).toBeTruthy();
      const L = layers(built);
      // The cut face runs the bone's full length, about 40 to 48 cm.
      L['Compact bone'].geometry.computeBoundingBox();
      const length = L['Compact bone'].geometry.boundingBox.getSize(new THREE.Vector3()).y;
      expect(length).toBeGreaterThan(38);
      expect(length).toBeLessThan(50);
      built.dispose();
    });

    it('layers the cut face: marrow inside the compact wall, yellow marrow only along the shaft', () => {
      const built = buildFemur();
      const L = layers(built);
      const box = (m) => {
        m.geometry.computeBoundingBox();
        return m.geometry.boundingBox;
      };
      const wall = box(L['Compact bone']);
      const red = box(L['Red marrow']);
      const yellow = box(L['Yellow marrow']);
      expect(wall.clone().expandByScalar(0.05).containsBox(red)).toBe(true);
      expect(red.clone().expandByScalar(0.05).containsBox(yellow)).toBe(true);
      const shaft = yellow.getSize(new THREE.Vector3()).y / wall.getSize(new THREE.Vector3()).y;
      expect(shaft).toBeGreaterThan(0.3);
      expect(shaft).toBeLessThan(0.6);
      // The dive continues into the compact wall, halfway up the shaft.
      expect(wall.containsPoint(new THREE.Vector3(...built.focus))).toBe(true);
      built.dispose();
    });
  });

  describe('digestive tract', () => {
    const G = LANDMARKS.gut;
    const length = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(...p.map((x, k) => x - pts[i][k])), 0);
    const gap = (a, b) => Math.hypot(...a.map((x, k) => x - b[k]));

    it('routes food from the throat down to the rectum, each part joining the next', () => {
      expect(GUT_STAGES.map((s) => s.key)).toEqual(['esophagus', 'stomach', 'duodenum', 'smallIntestine', 'largeIntestine']);
      for (let i = 1; i < GUT_STAGES.length; i++) expect(gap(G[GUT_STAGES[i - 1].key].at(-1), G[GUT_STAGES[i].key][0])).toBeLessThan(0.03);
      // The esophagus runs down about 25 cm; the duodenum is about 25 cm.
      expect(G.esophagus[0][1]).toBeGreaterThan(G.esophagus.at(-1)[1]);
      expect(length(G.esophagus)).toBeGreaterThan(0.2);
      expect(length(G.esophagus)).toBeLessThan(0.3);
      expect(length(G.duodenum)).toBeGreaterThan(0.18);
      expect(length(G.duodenum)).toBeLessThan(0.32);
      // The large intestine starts low on the body's right (the cecum) and ends lowest of all.
      expect(G.largeIntestine[0][0]).toBeLessThan(-0.04);
      const ys = Object.values(G).flat().map((p) => p[1]);
      expect(G.largeIntestine.at(-1)[1]).toBe(Math.min(...ys));
    });

    it('winds the small-intestine path through the inside of the jejunum and ileum', () => {
      const inside = ['Small intestine: Jejunum', 'Small intestine: Ileum'].map((l) => insideTester(partOf(parts, 'small-intestine', l).geometry));
      const middle = G.smallIntestine.slice(1, -1);
      const hits = middle.filter((p) => inside.some((t) => t(new THREE.Vector3(...p)))).length;
      expect(hits / middle.length).toBeGreaterThan(0.85);
      expect(length(G.smallIntestine)).toBeGreaterThan(1);
    });

    it('is a step of the digestive dive, with the meal moving and its organ glowing', () => {
      expect(getDive('digestive').steps.map((s) => s.id).slice(0, 3)).toEqual(['body', 'digestive-tract', 'small-intestine']);
      const built = buildDigestiveTract({ reducedMotion: true });
      expect(built.detailed).toBe(true);
      const ids = cardsIn(built);
      for (const id of ['digestive-system', 'stomach', 'duodenum', 'small-intestine', 'large-intestine', 'liver']) expect(ids.has(id), id).toBe(true);
      for (const id of ids) expect(getCard(id), id).toBeTruthy();
      let food = null;
      let stomach = null;
      built.root.traverse((o) => {
        if (o.userData.label?.startsWith('A mouthful')) food = o;
        if (o.userData.cardId === 'stomach') stomach = o;
      });
      expect(built.controls.set(1.5)).toMatch(/two to four hours/);
      const atStomach = food.position.clone();
      expect(stomach.material.emissiveIntensity).toBeGreaterThan(0.3);
      built.controls.set(4.5);
      expect(stomach.material.emissiveIntensity).toBeLessThan(0.01);
      expect(built.controls.set(5)).toMatch(/one to three days/);
      expect(food.position.y).toBeLessThan(atStomach.y - 25); // cm: at the end of the rectum
      built.dispose();
    });
  });
  describe('urinary tract', () => {
    const ureter = partOf(parts, 'urinary-system', /Ureter/);
    const bladder = partOf(parts, 'urinary-system', 'Bladder');
    const length = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(...p.map((x, k) => x - pts[i][k])), 0);

    it('runs each ureter from inside its kidney down to the back of the bladder', () => {
      for (const [side, label] of [[-1, 'Right kidney'], [1, 'Left kidney']]) {
        const route = ureterRoute(ureter.geometry, side);
        const kidney = partOf(parts, 'kidney', label).geometry.boundingBox.clone().expandByScalar(0.005);
        expect(kidney.containsPoint(new THREE.Vector3(...route[0])), label).toBe(true); // the renal pelvis
        for (let i = 2; i < route.length; i++) expect(route[i][1]).toBeLessThan(route[i - 1][1]); // always downhill
        const end = route.at(-1);
        const b = bladder.geometry.boundingBox;
        expect(end[1]).toBeLessThan(b.max.y);
        expect(Math.abs(end[0])).toBeLessThan(b.max.x);
        // About 25 cm in a living adult.
        expect(length(route)).toBeGreaterThan(0.2);
        expect(length(route)).toBeLessThan(0.35);
      }
    });

    it('is a step of the urinary dive, the urine moving and the bladder filling and emptying', () => {
      expect(URINE_STAGES.map((s) => s.key)).toEqual(['blood', 'filter', 'ureter', 'fill', 'empty']);
      const built = buildUrinaryTract({ reducedMotion: true });
      expect(built.detailed).toBe(true);
      const ids = cardsIn(built);
      for (const id of ['kidney', 'urinary-system', 'renal-pelvis', 'adrenal-gland', 'aorta', 'blood']) expect(ids.has(id), id).toBe(true);
      for (const id of ids) expect(getCard(id), id).toBeTruthy();
      const named = (re) => {
        const out = [];
        built.root.traverse((o) => re.test(o.userData.label ?? '') && out.push(o));
        return out;
      };
      const [pool] = named(/^Urine in the bladder/);
      const ureterMesh = named(/^Ureter/)[0];
      const size = () => pool.parent.scale.x;
      built.controls.set(0.5);
      expect(named(/^Blood on its way/).some((m) => m.visible)).toBe(true);
      expect(built.controls.set(2.5)).toMatch(/waves of muscle/);
      expect(ureterMesh.material.emissiveIntensity).toBeGreaterThan(0.3);
      const low = size();
      expect(built.controls.set(3.95)).toMatch(/holding about [45]\d0 mL/);
      expect(size()).toBeGreaterThan(low * 1.8);
      expect(ureterMesh.material.emissiveIntensity).toBeLessThan(0.01);
      built.controls.set(4.95);
      expect(size()).toBeLessThan(low);
      expect(built.controls.set(5)).toMatch(/1 to 2 L/);
      // The step frames the whole tract, kidneys to bladder (about 35 cm).
      const height = boundsCm(built).getSize(new THREE.Vector3()).y;
      expect(height).toBeGreaterThan(30);
      expect(height).toBeLessThan(45);
      built.dispose();
    });
  });
});
