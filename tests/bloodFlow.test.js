import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three/webgpu';
import { loadBodyParts } from '../src/scenes/bodyMeshes.js';
import { buildBody, buildSkeletonScene, heartbeatScale, LANDMARKS } from '../src/scenes/body.js';
import { arterialSurge, flowRoute, FLOW } from '../src/scenes/bloodFlow.js';

const bytes = readFileSync(new URL('../assets/anatomy/body.glb', import.meta.url));
const fileFetch = async () => ({ ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('blood flow', async () => {
  const parts = await loadBodyParts({ fetchImpl: fileFetch });

  it('surges while the ventricles squeeze and averages the mean speed over a beat', () => {
    let sum = 0;
    let peak = 0;
    let peakAt = 0;
    let smallest = Infinity;
    let squeezeAt = 0;
    const n = 1000;
    for (let i = 0; i < n; i++) {
      const phase = i / n;
      const v = arterialSurge(phase);
      sum += v / n;
      if (v > peak) [peak, peakAt] = [v, phase];
      if (heartbeatScale(phase) < smallest) [smallest, squeezeAt] = [heartbeatScale(phase), phase];
    }
    expect(sum).toBeCloseTo(1, 2);
    expect(peak).toBeGreaterThan(2.5);
    expect(arterialSurge(0.7)).toBeLessThan(0.5);
    // Blood leaves just as the heart is at its smallest.
    expect(Math.abs(peakAt - squeezeAt)).toBeLessThan(0.08);
  });

  it('has a measured route for the aorta, the venae cavae and the vessels of the neck, arms and pelvis', () => {
    const names = LANDMARKS.flow.map((r) => r.name);
    for (const n of ['ascending aorta', 'arch of aorta', 'descending aorta', 'superior vena cava', 'inferior vena cava', 'left common carotid artery', 'right internal jugular vein', 'left subclavian artery', 'left external iliac vein']) {
      expect(names, n).toContain(n);
    }
    for (const r of LANDMARKS.flow) {
      expect(r.points.length, r.name).toBe(r.radius.length);
      expect(r.points.length, r.name).toBeGreaterThanOrEqual(3);
    }
  });

  it('runs each route the way blood does: out from the heart in arteries, back to it in veins', () => {
    const heart = LANDMARKS.heart;
    for (const r of LANDMARKS.flow) {
      const start = dist(r.points[0], heart);
      const end = dist(r.points.at(-1), heart);
      if (r.kind === 'artery') expect(start, r.name).toBeLessThan(end);
      else expect(end, r.name).toBeLessThan(start);
    }
    const route = (name) => LANDMARKS.flow.find((r) => r.name === name).points;
    // The aorta is one tube: each piece starts where the one before it ends.
    expect(dist(route('ascending aorta').at(-1), route('arch of aorta')[0])).toBeLessThan(0.02);
    expect(dist(route('arch of aorta').at(-1), route('descending aorta')[0])).toBeLessThan(0.02);
    // The external iliac artery ends where the femoral artery drawn down the leg begins.
    expect(dist(route('left external iliac artery').at(-1), LANDMARKS.vessels.externalIliacArtery.left)).toBeLessThan(0.02);
  });

  it('keeps every route inside its vessel', () => {
    const verts = [];
    for (const p of parts) {
      if (!['vessel', 'vein'].includes(p.extras.tissue)) continue; // the renal vessels are filed under urinary
      const a = p.geometry.attributes.position.array;
      for (let i = 0; i < a.length; i += 3) verts.push([a[i], a[i + 1], a[i + 2]]);
    }
    for (const r of LANDMARKS.flow) {
      r.points.forEach((pt, i) => {
        let near = Infinity;
        for (const v of verts) near = Math.min(near, dist(v, pt));
        // The center line is about one radius from the wall.
        expect(near, `${r.name} point ${i}`).toBeLessThan(r.radius[i] * 1.6 + 0.003);
      });
    }
  });

  it('samples a route evenly with a radius and two directions across it', () => {
    const route = flowRoute([[0, 0, 0], [0, 0.1, 0], [0, 0.2, 0.05]], [0.004, 0.006, 0.008]);
    expect(route.n).toBeGreaterThan(route.length / FLOW.sample);
    expect(route.rad[0]).toBeCloseTo(0.004, 4);
    expect(route.rad[route.n - 1]).toBeCloseTo(0.008, 4);
    const a = new THREE.Vector3().fromArray(route.across, 0);
    const b = new THREE.Vector3().fromArray(route.across, 3);
    const t = new THREE.Vector3().fromArray(route.pos, 3).sub(new THREE.Vector3().fromArray(route.pos, 0)).normalize();
    expect(a.length()).toBeCloseTo(1, 5);
    expect(a.dot(b)).toBeCloseTo(0, 5);
    expect(a.dot(t)).toBeCloseTo(0, 2);
  });

  const cellsOf = (built) => {
    const found = [];
    built.root.traverse((o) => o.isInstancedMesh && o.name.startsWith('blood-flow') && found.push(o));
    return found;
  };
  const snapshot = (meshes) => meshes.map((m) => Array.from(m.instanceMatrix.array.slice(0, 48)));

  it('streams red cells through the circulatory system on the whole body', () => {
    expect(parts.length).toBeGreaterThan(0);
    const built = buildBody({ systems: ['circulatory'] });
    const meshes = cellsOf(built);
    expect(meshes.map((m) => m.name).sort()).toEqual(['blood-flow-artery', 'blood-flow-vein']);
    const total = meshes.reduce((n, m) => n + m.count, 0);
    expect(total).toBeGreaterThan(300);
    // They sit in the circulatory system's group, so they hide with it.
    for (const m of meshes) expect(m.parent.parent.name).toBe('circulatory');
    const before = snapshot(meshes);
    built.update(0.1);
    expect(snapshot(meshes)).not.toEqual(before);
    built.dispose();
  });

  it('holds the cells still with reduced motion and while the circulatory system is hidden', () => {
    const still = buildBody({ systems: ['circulatory'], reducedMotion: true });
    let before = snapshot(cellsOf(still));
    still.update(0.1);
    expect(snapshot(cellsOf(still))).toEqual(before);
    still.dispose();

    const hidden = buildBody({ systems: ['skeletal'] });
    before = snapshot(cellsOf(hidden));
    hidden.update(0.1);
    expect(snapshot(cellsOf(hidden))).toEqual(before);
    hidden.dispose();
  });

  it('leaves the skeleton scene without blood', () => {
    const built = buildSkeletonScene();
    expect(cellsOf(built)).toHaveLength(0);
    built.dispose();
  });
});
