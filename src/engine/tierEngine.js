// The tier-transition engine. It owns the three.js scene, camera and orbit
// controls, builds one tier scene at a time, and moves between tiers with a
// camera fly-through, a fade out, a model swap, and a fade in. While it
// runs, the reported view size is interpolated on a log scale so the depth
// gauge sweeps smoothly through the powers of ten.
import * as THREE from 'three/webgpu';
import { createEnvironment } from './environment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { setOpacity } from './fade.js';
import { followAim, lightDirections } from './studioLight.js';
import { lerpLog, distanceForFrame, visibleHeightMeters } from '../science/scale.js';

const FOV = 40;
// A flight is one continuous move split at the model swap: it speeds up on the
// way out of a tier and slows down into the next, so the camera never stops at
// the swap (together the two halves make one ease-in-out).
const easeIn = (t) => t * t * t;
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Up to ~1500 points (vertices, or instance positions) from each mesh that carries a card,
 * in world space.
 */
function samplePoints(root, cardId) {
  const pts = [];
  const m = new THREE.Matrix4();
  root.traverse((o) => {
    if (o.userData.hoverShell || !isVisible(o)) return;
    let owner = o;
    while (owner && !owner.userData.cardId) owner = owner.parent;
    if (owner?.userData.cardId !== cardId || !o.geometry?.attributes.position) return;
    if (o.isInstancedMesh) {
      const step = Math.max(1, Math.ceil(o.count / 1500));
      for (let i = 0; i < o.count; i += step) {
        o.getMatrixAt(i, m);
        pts.push(new THREE.Vector3().setFromMatrixPosition(m).applyMatrix4(o.matrixWorld));
      }
      return;
    }
    const pos = o.geometry.attributes.position;
    const step = Math.max(1, Math.ceil(pos.count / 1500));
    for (let i = 0; i < pos.count; i += step) pts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld));
  });
  return pts;
}

/**
 * Which side to label a mirrored pair on (both hands' muscles, both lungs), given each point's
 * distance across the midline: +1 or -1, or 0 for a part that crosses the midline or is not a
 * pair. Labeled at the middle between its two halves, a pair's nearest point could be anywhere.
 * The side is fixed per card and alternates between cards, so a chart's labels fall on both sides.
 */
export function pairedSide(xs, cardId) {
  let min = Infinity;
  let max = -Infinity;
  for (const x of xs) {
    min = Math.min(min, x);
    max = Math.max(max, x);
  }
  if (!(min < 0 && max > 0)) return 0;
  if (xs.some((x) => Math.abs(x) < 0.04 * (max - min))) return 0;
  const reach = (sign) => {
    const side = xs.filter((x) => Math.sign(x) === sign);
    return side.reduce((sum, x) => sum + Math.abs(x), 0) / side.length;
  };
  if (Math.abs(reach(1) - reach(-1)) > 0.3 * Math.max(reach(1), reach(-1))) return 0;
  let hash = 0;
  for (const c of cardId) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return hash % 2 ? 1 : -1;
}

/**
 * Where a structure's number sits: on the part itself, not in the air inside a hollow or curved
 * shape. Seen from `toward` (a direction from the subject to the camera), it is the nearest
 * point of the surface facing the camera, on the line of sight through the middle of the part's
 * bounds, so the dot is on what you see whichever way the body is turned; without a direction,
 * the point nearest the middle. A mirrored pair uses one half.
 */
export function anchorPoint(root, cardId, toward = null) {
  let pts = samplePoints(root, cardId);
  if (!pts.length) return null;
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const xs = pts.map((p) => p.clone().applyMatrix4(inv).x);
  const side = pairedSide(xs, cardId);
  if (side) pts = pts.filter((_, i) => Math.sign(xs[i]) === side);
  const center = new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3());
  if (toward) {
    // The tenth of the points nearest the line of sight through the middle, and of those the one nearest the camera.
    const v = new THREE.Vector3();
    const scored = pts.map((p) => {
      v.subVectors(p, center);
      const depth = v.dot(toward);
      return { p, depth, side: v.lengthSq() - depth * depth };
    });
    scored.sort((a, b) => a.side - b.side);
    const near = scored.slice(0, Math.max(1, Math.ceil(scored.length / 10)));
    return near.reduce((a, b) => (b.depth > a.depth ? b : a)).p;
  }
  let best = pts[0];
  for (const p of pts) if (p.distanceToSquared(center) < best.distanceToSquared(center)) best = p;
  return best;
}

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
    // Zooming keeps the point under the pointer fixed on screen (see zoomAt), so you
    // can zoom in anywhere, not only at the middle of the view.
    this.cursorZoom = null; // { point, ndc, until }
    // The scale slider sets a zoom goal (a ratio of the arrival distance); update() springs toward it.
    this.zoomGoal = null;
    this.anchors = new Map(); // 'cardId:facing' → where its number sits, for the numbered key
    this.current = null; // { step, built }
    this.busy = false;
    this.tweens = [];
    this.transitionMeters = null;
    this.systems = null;
    this.shift = 0; // horizontal view offset in CSS pixels (keeps the subject clear of side panels)
    this.shiftTarget = 0;
    this.shiftY = 0; // vertical offset (keeps the subject above a bottom panel on phones)
    this.shiftYTarget = 0;
    // The band of screen between the top bar and the step track (CSS pixels
    // covered at the top and bottom). Scenes are framed to fill this band, so a
    // step's frameMeters is the height of the part of the view you can see.
    // Hover glow: a soft additive copy of the structure under the pointer.
    this.hoverMaterial = new THREE.MeshBasicMaterial({
      color: 0xfff0d8, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.hoverShells = [];
    this.hoverKey = null;
    this.inset = { top: 0, bottom: 0 };
    this.insetTarget = { top: 0, bottom: 0 };

    this.scene.add(new THREE.HemisphereLight(0xeae6ff, 0x2a2140, 1.35));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(2, 3, 4);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xfff1e0, 0.7);
    rim.position.set(-3, 1, -2);
    this.scene.add(rim);
    this.key = key;
    this.rim = rim;
    // The lights ride with the camera; the key leans toward the pointer (studioLight.js).
    this.lightAim = { x: 0, y: 0 };
    this.lightNow = { x: 0, y: 0 };
    this.lightDist = 1;
    this.basis = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.renderer = renderer;
    this.envTexture = null;
  }

  /**
   * Soft studio reflections for wet and glossy surfaces (see environment.js).
   * Off on slow devices (it is the costliest lighting feature) and with ?env=0.
   */
  setEnvironment(on) {
    const allowed = typeof location === 'undefined' || new URLSearchParams(location.search).get('env') !== '0';
    if (on && allowed && !this.envTexture) this.envTexture = createEnvironment(this.renderer);
    this.scene.environment = on && allowed ? this.envTexture : null;
    this.scene.environmentIntensity = 0.55;
  }

  /** Rebuild the current step in place (after a look or detail change), keeping the camera. */
  rebuild() {
    if (!this.current || this.busy) return false;
    const { step } = this.current;
    const position = this.camera.position.clone();
    const target = this.controls.target.clone();
    const built = this.build(step);
    this.discard(this.current.built);
    this.scene.add(built.root);
    this.placeCamera(built, position, target);
    this.current = { step, built };
    return true;
  }

  /** Build the scene for a dive step. */
  build(step) {
    const builder = this.scenes[step.scene];
    if (!builder) throw new Error(`No scene builder for "${step.scene}"`);
    // A step can ask its scene for extras (the immune dive's infection on the body).
    const built = builder({ reducedMotion: this.reducedMotion, systems: this.systems ?? undefined, ...step.options });
    const target = new THREE.Vector3(...built.view.target);
    const dir = new THREE.Vector3(...built.view.direction).normalize();
    // Tall subjects are framed by height; wide ones must also fit a narrow (portrait) screen.
    const aspect = this.bandAspect();
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
    // Zoom in to a tenth of the framed view and out to about three times it; past the
    // guide's thresholds (src/ui/zoomGuide.js) zooming carries on to the next or previous step.
    this.controls.minDistance = d * 0.1;
    this.controls.maxDistance = d * 3.2;
    // Keep the lights framed around the subject at every scale.
    this.lightDist = d * 2.7;
    this.aimLights();
  }

  /** Where the pointer is over the view, x and y from -1 to 1; the key light leans toward it. */
  setLightAim(x, y) {
    this.lightAim = this.reducedMotion ? { x: 0, y: 0 } : { x, y };
  }

  /** Place the key and rim lights around the subject, in the camera's frame. */
  aimLights() {
    const { key, rim } = lightDirections(this.lightNow);
    const target = this.controls.target;
    this.camera.updateMatrixWorld();
    this.camera.matrixWorld.extractBasis(...this.basis); // right, up, toward the viewer
    for (const [light, dir] of [[this.key, key], [this.rim, rim]]) {
      light.position.copy(target);
      dir.forEach((c, i) => light.position.addScaledVector(this.basis[i], c * this.lightDist));
      light.target.position.copy(target);
      light.target.updateMatrixWorld();
    }
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
    this.clearHover();
    this.anchors.clear();
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
  async transition(step, forward, { fromFocus, quick = false, onSwap } = {}) {
    if (this.busy || !this.current) return false;
    this.busy = true;
    this.controls.enabled = false;
    const from = this.current.built;
    const fromMeters = this.viewMeters();
    const toMeters = step.frameMeters;
    const to = this.build(step);
    // Quick flights carry a scale-slider drag on through several steps. They
    // dive less deep into the old plate and start the new one nearer, so
    // there is always something on screen.
    const phase = this.reducedMotion ? 0.18 : quick ? 0.42 : 0.85;
    const into = quick ? 0.3 : 0.08;
    const outOf = quick ? 1.8 : 3.5;
    this.zoomGoal = null;

    // Phase A: leave the current tier.
    const camA = this.camera.position.clone();
    const tgtA = this.controls.target.clone();
    const offset = camA.clone().sub(tgtA);
    const aim = fromFocus ? new THREE.Vector3(...fromFocus) : from.focusPoint;
    const tgtA2 = forward ? aim.clone() : tgtA.clone();
    const camA2 = forward
      ? tgtA2.clone().addScaledVector(offset.clone().normalize(), offset.length() * into)
      : tgtA.clone().addScaledVector(offset.clone().normalize(), offset.length() * outOf);
    await this.tween(phase, (t) => {
      const e = easeIn(t);
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
    onSwap?.();

    // Phase B: arrive at the new tier.
    const { position: camEnd, target: tgtEnd, dir, dist } = to.pose;
    const tgtB = forward ? tgtEnd.clone() : to.focusPoint.clone();
    const camB = forward
      ? tgtEnd.clone().addScaledVector(dir, dist * outOf)
      : tgtB.clone().addScaledVector(dir, dist * into);
    this.placeCamera(to, camB, tgtB);
    await this.tween(phase * 1.15, (t) => {
      const e = easeOut(t);
      this.camera.position.lerpVectors(camB, camEnd, e);
      this.controls.target.lerpVectors(tgtB, tgtEnd, e);
      setOpacity(to.root, quick ? Math.min(1, e / 0.6) : e);
      this.transitionMeters = lerpLog(fromMeters, toMeters, 0.5 + e * 0.5);
    });
    setOpacity(to.root, 1);
    this.placeCamera(to, camEnd, tgtEnd);
    this.transitionMeters = null;
    this.controls.enabled = true;
    this.busy = false;
    return true;
  }

  /**
   * Begin (or continue) a zoom toward the screen point `ndc`: the surface under
   * it, or the point at the orbit target's depth, stays under the pointer while
   * the orbit controls change the distance. Works with the view shifted beside
   * the side panels, which the controls' own zoom-to-cursor does not allow for.
   */
  zoomAt(ndc) {
    if (!this.current || this.busy) return null;
    const now = performance.now();
    const same = this.cursorZoom && Math.abs(this.cursorZoom.ndc.x - ndc.x) < 1e-3 && Math.abs(this.cursorZoom.ndc.y - ndc.y) < 1e-3;
    if (!same) {
      const hit = this.pickAt(ndc, { any: true });
      let point = hit?.point.clone();
      if (!point) {
        const ray = new THREE.Raycaster();
        ray.setFromCamera(ndc, this.camera);
        const facing = this.camera.getWorldDirection(new THREE.Vector3());
        point = ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(facing, this.controls.target), new THREE.Vector3());
      }
      if (!point) return null;
      this.cursorZoom = { point, ndc: { x: ndc.x, y: ndc.y } };
    }
    this.cursorZoom.until = now + 400;
    return this.cursorZoom.point;
  }

  /** Draw the cursor-zoom point a share k of the way toward `toward`, so that point slides under the pointer. */
  nudgeCursorZoom(toward, k) {
    this.cursorZoom?.point.lerp(toward, k);
  }

  /** Slide camera and target together so the cursor-zoom point is back under the pointer. */
  holdCursorZoom() {
    const z = this.cursorZoom;
    if (!z) return;
    if (performance.now() > z.until || this.busy) {
      this.cursorZoom = null;
      return;
    }
    this.camera.updateMatrixWorld();
    const depth = z.point.clone().project(this.camera).z;
    const want = new THREE.Vector3(z.ndc.x, z.ndc.y, depth).unproject(this.camera);
    const shift = z.point.clone().sub(want);
    this.camera.position.add(shift);
    this.controls.target.add(shift);
  }

  /**
   * Zoom toward a ratio of the arrival distance (the scale slider), or stop
   * with null. The camera keeps its angle; zooming in also draws the orbit
   * target toward the step's focus, where the next step begins.
   */
  setZoomGoal(ratio) {
    this.zoomGoal = ratio;
    if (ratio !== null) this.cursorZoom = null;
  }

  /** Spring the camera distance toward the zoom goal (on a log scale, so every power of ten takes as long). */
  applyZoomGoal(dt) {
    const built = this.current?.built;
    if (this.zoomGoal === null || !built?.pose || this.busy) return;
    const k = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 10);
    const target = this.controls.target;
    const offset = this.camera.position.clone().sub(target);
    const d = offset.length();
    const goal = built.pose.dist * this.zoomGoal;
    const next = Math.exp(Math.log(d) + (Math.log(goal) - Math.log(d)) * k);
    const pull = Math.min(1, Math.max(0, (1 - this.zoomGoal) / 0.9));
    const aim = built.pose.target.clone().lerp(built.focusPoint, pull);
    target.lerp(aim, k);
    this.camera.position.copy(target).addScaledVector(offset.normalize(), next);
  }

  /**
   * Where a structure is, for its number on the model: the middle of the
   * bounds of everything that carries its card (cached until the scene changes).
   */
  anchorOf(cardId) {
    const root = this.current?.built.root;
    if (!root) return null;
    // One anchor for each side the subject is seen from, on the surface that faces that way.
    const facing = this.facing();
    const cached = `${cardId}:${facing}`;
    if (this.anchors.has(cached)) return this.anchors.get(cached);
    root.updateMatrixWorld(true);
    const toward = this.current.built.pose.dir.clone().multiplyScalar(facing === 'back' ? -1 : 1);
    const at = anchorPoint(root, cardId, toward);
    this.anchors.set(cached, at);
    return at;
  }

  /** Which side of the subject the camera is on: 'front' (as the plate opens) or 'back'. */
  facing() {
    const built = this.current?.built;
    if (!built) return 'front';
    return this.camera.position.clone().sub(this.controls.target).dot(built.pose.dir) < 0 ? 'back' : 'front';
  }

  /** Swing the camera half a turn around the subject, as you would walk round a statue. */
  async turnAround() {
    if (this.busy || !this.current) return false;
    this.busy = true;
    this.controls.enabled = false;
    this.zoomGoal = null;
    const target = this.controls.target.clone();
    const offset = this.camera.position.clone().sub(target);
    const axis = this.camera.up.clone().normalize();
    const turn = new THREE.Quaternion();
    await this.tween(this.reducedMotion ? 0 : 1.2, (t) => {
      turn.setFromAxisAngle(axis, Math.PI * easeInOut(t));
      this.camera.position.copy(target).add(offset.clone().applyQuaternion(turn));
      this.camera.lookAt(target);
    });
    this.controls.enabled = true;
    this.busy = false;
    return true;
  }

  /** A world point in canvas pixels (CSS), or null when it is behind the camera. */
  toScreen(point) {
    const size = this.renderer.getSize(new THREE.Vector2());
    const v = point.clone().project(this.camera);
    if (v.z > 1 || v.z < -1) return null;
    return { x: ((v.x + 1) / 2) * size.x, y: ((1 - v.y) / 2) * size.y };
  }

  /** Light up a structure by card (the key's hover), like hovering it on the model. */
  hoverCard(cardId) {
    if (!cardId) {
      this.setHover(null);
      return;
    }
    let found = null;
    this.current?.built.root.traverse((o) => {
      if (!found && o.isMesh && !o.isInstancedMesh && !o.userData.hoverShell && isVisible(o)) {
        let owner = o;
        while (owner && !owner.userData.cardId) owner = owner.parent;
        if (owner?.userData.cardId === cardId) found = o;
      }
    });
    this.setHover(found ? { object: found, priority: 0 } : null);
  }

  /** The hover glow suits the sheet: an additive light glow on slate, an ink tint on the light sheet. */
  setTheme(dark) {
    this.hoverMaterial.color.set(dark ? 0xfff0d8 : 0x2b58a5);
    this.hoverMaterial.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    this.hoverMaterial.opacity = dark ? 0.28 : 0.22;
    this.hoverMaterial.needsUpdate = true;
  }

  /** How far the user has zoomed: camera distance ÷ the distance the step was framed at (1 on arrival). */
  zoomRatio() {
    if (!this.current?.built.pose) return 1;
    return this.camera.position.distanceTo(this.controls.target) / this.current.built.pose.dist;
  }

  /** Height of the view at the orbit target, in meters. */
  viewMeters() {
    if (this.transitionMeters !== null) return this.transitionMeters;
    if (!this.current) return 1;
    const d = this.camera.position.distanceTo(this.controls.target);
    return visibleHeightMeters(d, FOV, this.current.built.metersPerUnit);
  }

  metersPerPixel(bandHeightPx = this.bandHeight()) {
    return this.viewMeters() / Math.max(1, bandHeightPx);
  }

  /** Height in CSS pixels of the uncovered band the scene is framed into. */
  bandHeight() {
    const size = this.renderer.getSize(new THREE.Vector2());
    return Math.max(size.y * 0.5, size.y - this.inset.top - this.inset.bottom);
  }

  bandAspect() {
    const size = this.renderer.getSize(new THREE.Vector2());
    return size.x > 0 && size.y > 0 ? size.x / this.bandHeight() : this.camera.aspect || 1;
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
  pickAt(ndc, { any = false } = {}) {
    if (!this.current || this.busy) return null;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hits = ray.intersectObject(this.current.built.root, true);
    let best = null;
    for (const h of hits) {
      let o = h.object;
      if (!isVisible(o) || o.userData.hoverShell) continue;
      // any: the nearest solid surface, for aiming a zoom (see-through skin is looked past).
      if (any) {
        if ((o.userData.pickPriority ?? 0) < 0 || o.material?.transparent) continue;
        return { point: h.point, object: o };
      }
      while (o && !o.userData.cardId) o = o.parent;
      if (!o) continue;
      const priority = h.object.userData.pickPriority ?? o.userData.pickPriority ?? 0;
      if (!best || priority > best.priority) {
        best = { cardId: o.userData.cardId, label: h.object.userData.label ?? o.userData.label, priority, point: h.point, object: h.object };
      }
    }
    return best;
  }

  /**
   * Light up the structure a pick hit (or null to clear). Parts drawn as several
   * meshes under one label (the femur's head, shaft and condyles) glow together.
   * Skin and other see-through backgrounds (negative pick priority) do not glow.
   */
  setHover(hit) {
    const obj = hit?.object ?? null;
    const key = obj && (hit.priority ?? 0) >= 0 && obj.isMesh && !obj.isInstancedMesh ? obj.uuid : null;
    if (key === this.hoverKey) return;
    this.clearHover();
    if (!key) return;
    this.hoverKey = key;
    let owner = obj;
    while (owner && !owner.userData.cardId) owner = owner.parent;
    const label = obj.userData.label ?? owner?.userData.label;
    const siblings = (obj.parent?.children ?? []).filter(
      (c) => c.isMesh && !c.isInstancedMesh && !c.userData.hoverShell && c.userData.cardId === owner?.userData.cardId && (c.userData.label ?? label) === label,
    );
    const targets = siblings.length > 1 && siblings.length <= 40 ? siblings : [obj];
    for (const t of targets) {
      const shell = new THREE.Mesh(t.geometry, this.hoverMaterial);
      shell.userData.hoverShell = true;
      shell.raycast = () => {};
      shell.renderOrder = 5;
      t.add(shell);
      this.hoverShells.push(shell);
    }
  }

  clearHover() {
    for (const s of this.hoverShells) s.removeFromParent();
    this.hoverShells = [];
    this.hoverKey = null;
  }

  /** Unique clickable structures in the current view (for the keyboard list). */
  structures() {
    if (!this.current) return [];
    const seen = new Map();
    this.current.built.root.traverse((o) => {
      const empty = o.geometry && !(o.geometry.attributes.position?.count > 0); // cut away entirely
      if (o.userData.cardId && !empty && isVisible(o) && !seen.has(o.userData.cardId)) seen.set(o.userData.cardId, o.userData.label);
    });
    return [...seen.keys()];
  }

  /** Slide the rendered image so the subject sits in the uncovered part of the screen. */
  setViewShift(px, py = 0) {
    this.shiftTarget = px;
    this.shiftYTarget = py;
  }

  /** Pixels covered by the top bar and by the step track (and anything above it) at the bottom. */
  setViewInsets(top, bottom) {
    this.insetTarget.top = Math.max(0, top);
    this.insetTarget.bottom = Math.max(0, bottom);
  }

  applyViewShift(dt) {
    const k = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 8);
    this.shift += (this.shiftTarget - this.shift) * k;
    this.shiftY += (this.shiftYTarget - this.shiftY) * k;
    this.inset.top += (this.insetTarget.top - this.inset.top) * k;
    this.inset.bottom += (this.insetTarget.bottom - this.inset.bottom) * k;
    const size = this.renderer.getSize(new THREE.Vector2());
    if (size.x === 0 || size.y === 0) return;
    // Render the canvas as a window onto a virtual view the size of the band:
    // the field of view spans the band, and the band's center is the view's center.
    const band = this.bandHeight();
    const plain = Math.abs(this.shift) < 0.5 && Math.abs(this.shiftY) < 0.5 && band === size.y;
    if (plain) {
      if (this.camera.view?.enabled) this.camera.clearViewOffset();
      if (Math.abs(this.camera.aspect - size.x / size.y) > 1e-6) {
        this.camera.aspect = size.x / size.y;
        this.camera.updateProjectionMatrix();
      }
      return;
    }
    this.camera.aspect = size.x / band;
    this.camera.setViewOffset(size.x, band, this.shift, this.shiftY - this.inset.top, size.x, size.y);
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
    this.current?.built.update?.(dt, { reducedMotion: this.reducedMotion, camera: this.camera });
    if (this.controls.enabled) {
      this.applyZoomGoal(dt);
      this.controls.update();
      this.holdCursorZoom();
    }
    this.lightNow = this.reducedMotion ? { x: 0, y: 0 } : followAim(this.lightNow, this.lightAim, dt);
    this.aimLights();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

function isVisible(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}
