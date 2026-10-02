// Fading whole scenes in and out for tier transitions.
// Each material remembers its authored opacity and transparency, so a fade
// multiplies rather than overwrites, and restores exactly afterwards.

function materialsOf(root) {
  const set = new Set();
  root.traverse((o) => {
    if (!o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) set.add(m);
  });
  return [...set];
}

export function setOpacity(root, alpha) {
  for (const m of materialsOf(root)) {
    if (m.userData.baseOpacity === undefined) {
      m.userData.baseOpacity = m.opacity;
      m.userData.baseTransparent = m.transparent;
    }
    const fading = alpha < 0.999;
    const wantTransparent = fading || m.userData.baseTransparent;
    if (m.transparent !== wantTransparent) {
      m.transparent = wantTransparent;
      m.needsUpdate = true;
    }
    m.opacity = m.userData.baseOpacity * alpha;
  }
  root.visible = alpha > 0.001;
}
