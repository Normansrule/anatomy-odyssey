// The resting red blood cell shape from Evans and Fung (1972), as a lathe
// profile. Shared by the blood and red-blood-cell scenes.
import * as THREE from 'three/webgpu';
import { RBC, rbcThickness } from '../science/equations.js';

/**
 * Closed profile (in the lathe's r–y plane) from the bottom center, out to
 * the rim, and back across the top. `unitsPerMicron` scales it to the scene.
 */
export function rbcProfile(unitsPerMicron = 1, samples = 28) {
  const bottom = [];
  const top = [];
  for (let i = 0; i <= samples; i++) {
    // Cluster samples near the rim, where the curve turns sharply.
    const r = RBC.R * Math.sin((i / samples) * (Math.PI / 2));
    const half = rbcThickness(Math.min(r, RBC.R * 0.99999)) / 2;
    bottom.push(new THREE.Vector2(r * unitsPerMicron, -half * unitsPerMicron));
    top.push(new THREE.Vector2(r * unitsPerMicron, half * unitsPerMicron));
  }
  return [...bottom, ...top.reverse()];
}

/** A lathe geometry for the full cell, or a cutaway when phiLength < 2π. */
export function rbcGeometry(unitsPerMicron = 1, { segments = 40, phiStart = 0, phiLength = Math.PI * 2 } = {}) {
  return new THREE.LatheGeometry(rbcProfile(unitsPerMicron), segments, phiStart, phiLength);
}
