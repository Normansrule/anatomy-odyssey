// Renderer setup: three.js WebGPURenderer, which uses WebGPU where the
// browser supports it and falls back to its WebGL 2 backend otherwise.
// Add ?renderer=webgl to the URL to force the fallback for testing.
import * as THREE from 'three/webgpu';
import { pixelCap } from './benchmark.js';

export async function createRenderer(canvas) {
  const params = new URLSearchParams(location.search);
  const forceWebGL = params.get('renderer') === 'webgl';
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, alpha: true, forceWebGL });
  await renderer.init();
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const backend = renderer.backend?.isWebGPUBackend ? 'WebGPU' : 'WebGL 2';
  return { renderer, backend };
}

/**
 * Pixel ratio capped so phones and 4K screens stay smooth. With quality
 * 'auto', the first-launch measurement (src/engine/benchmark.js) picks the cap.
 */
export function applySize(renderer, camera, canvas, quality = 'auto', measuredTier = undefined) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const cap = pixelCap(quality, measuredTier);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}
