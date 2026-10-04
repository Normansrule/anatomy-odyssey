// A stage-by-stage animation control shared by the step-through scenes:
// a slider from 0 to the last stage, buttons for each stage, and play/pause
// that advances and then loops after a pause on the last stage.

export const clamp01 = (x) => Math.min(1, Math.max(0, x));
/** Smooth 0→1 between a and b. */
export const ramp = (v, a, b) => {
  const x = clamp01((v - a) / (b - a));
  return x * x * (3 - 2 * x);
};

/**
 * stages: [{ label, text }]; apply(v) poses the scene; readout(v, stage) may
 * override the stage text. Returns { controls, update }.
 */
export function stagedControls({ stages, label = 'Stage', apply, readout, reducedMotion, rate = 0.28, hold = 3, still }) {
  const last = stages.length - 1;
  const stageOf = (v) => Math.max(0, Math.min(last, Math.floor(v + 1e-6)));
  let waited = 0;
  const controls = {
    label,
    unit: '',
    min: 0,
    max: last,
    step: 0.01,
    value: reducedMotion ? (still ?? last) : 0,
    format: (v) => stages[stageOf(v)].label,
    presets: [...stages.map((s, i) => ({ label: s.label, value: i })), { label: 'Play or pause', action: 'play' }],
    playing: !reducedMotion,
    readout: '',
    set(v) {
      controls.value = v;
      apply(v);
      controls.readout = readout ? readout(v, stageOf(v)) : stages[stageOf(v)].text;
      return controls.readout;
    },
  };
  controls.set(controls.value);
  function update(dt) {
    if (!controls.playing) return;
    if (controls.value >= last) {
      waited += dt;
      if (waited > hold) {
        waited = 0;
        controls.set(0);
      }
      return;
    }
    controls.set(Math.min(last, controls.value + dt * rate));
  }
  return { controls, update };
}
