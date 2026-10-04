// The tier-transition engine. It owns the three.js scene, camera and orbit
// controls, builds one tier scene at a time, and moves between tiers with a
// camera fly-through, a fade out, a model swap, and a fade in. While it
// runs, the reported view size is interpolated on a log scale so the depth
// gauge sweeps smoothly through the powers of ten.
import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { setOpacity } from './fade.js';
import { lerpLog, distanceForFrame, visibleHeightMeters } from '../science/scale.js';

const FOV = 40;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export class TierEngine {
  constructor({ renderer, canvas, scenes, reducedMotion }) {
    this.renderer = renderer;
    this.scenes = scenes;
    this.reducedMotion = reducedMotion;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 100);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;
    this.current = null; // { step, built }
    this.busy = false;
    this.tweens = [];
    this.transitionMeters = null;
    this.systems = null;
    this.shift = 0; // horizontal view offset in CSS pixels (keeps the subject clear of side panels)
    this.shiftTarget = 0;
    this.shiftY = 0; // vertical offset (keeps the subject above a bottom panel on phones)
    this.shiftYTarget = 0;

    this.scene.add(new THREE.HemisphereLight(0xeae6ff, 0x2a2140, 1.35));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(2, 3, 4);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xf08baf, 0.9);
    rim.position.set(-3, 1, -2);
    this.scene.add(rim);
    this.key = key;
    this.rim = rim;
  }

  /** Build the scene for a dive step. */
  build(step) {
    const builder = this.scenes[step.scene];
    if (!builder) throw new Error(`No scene builder for "${step.scene}"`);
    const built = builder({ reducedMotion: this.reducedMotion, systems: this.systems ?? undefined });
    const target = new THREE.Vector3(...built.view.target);
    const dir = new THREE.Vector3(...built.view.direction).normalize();
    // Tall subjects are framed by height; wide ones must also fit a narrow (portrait) screen.
    const aspect = this.camera.aspect || 1;
    let portraitFactor = built.fit === 'both' && aspect < 1 ? Math.min(2.2, 0.95 / aspect) : 1;
    // Very wide scenes can also name the width that must stay in view (in meters).
    if (built.frameWidth) portraitFactor = Math.max(portraitFactor, built.frameWidth / aspect / step.frameMeters);
    const dist = distanceForFrame(step.frameMeters, FOV, built.metersPerUnit) * portraitFactor;
    built.pose = { target, dir, dist, position: target.clone().addScaledVector(dir, dist) };
    const focus = step.focus ?? built.focus;
    built.focusPoint = focus ? new THREE.Vector3(...focus) : target.clone();
    return built;
  }

  placeCamera(built, position, target) {
    this.camera.position.copy(position);
    this.controls.target.copy(target);
    const d = built.pose.dist;
    this.camera.near = d / 200;
    this.camera.far = d * 60;
    this.camera.updateProjectionMatrix();
    this.controls.minDistance = d * 0.2;
    this.controls.maxDistance = d * 3.2;
    // Keep the lights framed around the subject at every scale.
    this.key.position.copy(target).add(new THREE.Vector3(2, 3, 4).multiplyScalar(d * 0.5));
    this.key.target.position.copy(target);
    this.key.target.updateMatrixWorld();
    this.rim.position.copy(target).add(new THREE.Vector3(-3, 1, -2).multiplyScalar(d * 0.5));
  }

  /** Show a step immediately, with no animation (first load). */
  show(step) {
    const built = this.build(step);
    if (this.current) this.discard(this.current.built);
    this.scene.add(built.root);
    this.placeCamera(built, built.pose.position, built.pose.target);
    this.current = { step, built };
  }

  discard(built) {
    this.scene.remove(built.root);
    built.dispose();
  }

  tween(duration, fn) {
    return new Promise((resolve) => {
      if (duration <= 0) {
        fn(1);
        resolve();
        return;
      }
      this.tweens.push({ t: 0, duration, fn, resolve });
    });
  }

  /**
   * Fly from the current step to `step`. `forward` means diving deeper:
   * the camera plunges toward the current focus, then the next tier
   * approaches from a distance. Going back reverses both motions.
   */
  async transition(step, forward, { fromFocus } = {}) {
    if (this.busy || !this.current) return false;
    this.busy = true;
    this.controls.enabled = false;
    const from = this.current.built;
    const fromMeters = this.viewMeters();
    const toMeters = step.frameMeters;
    const to = this.build(step);
    const phase = this.reducedMotion ? 0.18 : 0.85;

    // Phase A: leave the current tier.
    const camA = this.camera.position.clone();
    const tgtA = this.controls.target.clone();
    const offset = camA.clone().sub(tgtA);
    const aim = fromFocus ? new THREE.Vector3(...fromFocus) : from.focusPoint;
    const tgtA2 = forward ? aim.clone() : tgtA.clone();
    const camA2 = forward
      ? tgtA2.clone().addScaledVector(offset.clone().normalize(), offset.length() * 0.08)
      : tgtA.clone().addScaledVector(offset.clone().normalize(), offset.length() * 3.5);
    await this.tween(phase, (t) => {
      const e = ease(t);
      this.camera.position.lerpVectors(camA, camA2, e);
      this.controls.target.lerpVectors(tgtA, tgtA2, e);
      setOpacity(from.root, 1 - e);
      this.transitionMeters = lerpLog(fromMeters, toMeters, e * 0.5);
    });

    // Swap models.
    this.discard(from);
    setOpacity(to.root, 0);
    this.scene.add(to.root);
    this.current = { step, built: to };

    // Phase B: arrive at the new tier.
    const { position: camEnd, target: tgtEnd, dir, dist } = to.pose;
    const tgtB = forward ? tgtEnd.clone() : to.focusPoint.clone();
    const camB = forward
      ? tgtEnd.clone().addScaledVector(dir, dist * 3.5)
      : tgtB.clone().addScaledVector(dir, dist * 0.08);
    this.placeCamera(to, camB, tgtB);
    await this.tween(phase * 1.15, (t) => {
      const e = ease(t);
      this.camera.position.lerpVectors(camB, camEnd, e);
      this.controls.target.lerpVectors(tgtB, tgtEnd, e);
      setOpacity(to.root, e);
      this.transitionMeters = lerpLog(fromMeters, toMeters, 0.5 + e * 0.5);
    });
    setOpacity(to.root, 1);
    this.placeCamera(to, camEnd, tgtEnd);
    this.transitionMeters = null;
    this.controls.enabled = true;
    this.busy = false;
    return true;
  }

  /** Height of the view at the orbit target, in meters. */
  viewMeters() {
    if (this.transitionMeters !== null) return this.transitionMeters;
    if (!this.current) return 1;
    const d = this.camera.position.distanceTo(this.controls.target);
    return visibleHeightMeters(d, FOV, this.current.built.metersPerUnit);
  }

  metersPerPixel(canvasHeightPx) {
    return this.viewMeters() / Math.max(1, canvasHeightPx);
  }

  /** Swap which step the current scene represents (same scene, new focus), without a transition. */
  retarget(step) {
    if (!this.current || this.current.step.scene !== step.scene) return false;
    const focus = step.focus ?? this.current.built.focus;
    if (focus) this.current.built.focusPoint = new THREE.Vector3(...focus);
    this.current.step = step;
    return true;
  }

  setSystems(list) {
    this.systems = list;
    this.current?.built.setSystems?.(list);
  }

  /** Return the clickable structure under a normalized device coordinate, if any. */
  pickAt(ndc) {
    if (!this.current || this.busy) return null;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hits = ray.intersectObject(this.current.built.root, true);
    let best = null;
    for (const h of hits) {
      let o = h.object;
      if (!isVisible(o)) continue;
      while (o && !o.userData.cardId) o = o.parent;
      if (!o) continue;
      const priority = h.object.userData.pickPriority ?? o.userData.pickPriority ?? 0;
      if (!best || priority > best.priority) {
        best = { cardId: o.userData.cardId, label: h.object.userData.label ?? o.userData.label, priority, point: h.point };
      }
    }
    return best;
  }

  /** Unique clickable structures in the current view (for the keyboard list). */
  structures() {
    if (!this.current) return [];
    const seen = new Map();
    this.current.built.root.traverse((o) => {
      if (o.userData.cardId && isVisible(o) && !seen.has(o.userData.cardId)) seen.set(o.userData.cardId, o.userData.label);
    });
    return [...seen.keys()];
  }

  /** Slide the rendered image so the subject sits in the uncovered part of the screen. */
  setViewShift(px, py = 0) {
    this.shiftTarget = px;
    this.shiftYTarget = py;
  }

  applyViewShift(dt) {
    const k = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 8);
    this.shift += (this.shiftTarget - this.shift) * k;
    this.shiftY += (this.shiftYTarget - this.shiftY) * k;
    const size = this.renderer.getSize(new THREE.Vector2());
    if ((Math.abs(this.shift) < 0.5 && Math.abs(this.shiftY) < 0.5) || size.x === 0) {
      if (this.camera.view?.enabled) this.camera.clearViewOffset();
      return;
    }
    this.camera.setViewOffset(size.x, size.y, this.shift, this.shiftY, size.x, size.y);
  }

  update(dt) {
    this.applyViewShift(dt);
    for (const tw of [...this.tweens]) {
      tw.t = Math.min(1, tw.t + dt / tw.duration);
      tw.fn(tw.t);
      if (tw.t >= 1) {
        this.tweens.splice(this.tweens.indexOf(tw), 1);
        tw.resolve();
      }
    }
    this.current?.built.update?.(dt, { reducedMotion: this.reducedMotion });
    if (this.controls.enabled) this.controls.update();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

function isVisible(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}
