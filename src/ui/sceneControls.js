// The scene controls panel: one slider, preset buttons and a live readout,
// driven by a scene's `controls` object (see hemoglobin, sarcomere,
// actin-myosin and inflammation scenes).
//
// controls = { label, unit, min, max, step, value, format?(v), presets[],
//              set(v) → readout, playing?, readout? }
// Scenes that animate on their own keep `value` and `readout` current;
// the panel polls them every frame through sync().
import { el, clear } from './dom.js';

export function createSceneControls({ panel, label, value, range, presets, readout }) {
  let controls = null;
  let lastValue = null;
  let lastReadout = null;
  let playButton = null;
  let lastPlaying = null;

  const show = (v) => {
    const f = controls.format ? controls.format(v) : String(Math.round(v * 100) / 100);
    value.textContent = controls.unit ? `${f} ${controls.unit}` : f;
  };

  range.addEventListener('input', () => {
    if (!controls) return;
    const v = Number(range.value);
    if (controls.playing !== undefined) controls.playing = false;
    updatePlay();
    readout.textContent = controls.set(v);
    lastValue = v;
    show(v);
  });

  function updatePlay() {
    if (!playButton || !controls) return;
    lastPlaying = Boolean(controls.playing);
    playButton.setAttribute('aria-pressed', String(Boolean(controls.playing)));
    playButton.textContent = controls.playing ? 'Pause' : 'Play';
  }

  return {
    attach(next) {
      controls = next ?? null;
      clear(presets);
      playButton = null;
      if (!controls) {
        panel.hidden = true;
        return;
      }
      label.textContent = controls.label;
      Object.assign(range, { min: controls.min, max: controls.max, step: controls.step });
      range.value = controls.value;
      for (const p of controls.presets ?? []) {
        if (p.action === 'play') {
          playButton = el('button', {
            class: 'preset preset--play',
            'aria-pressed': 'false',
            onclick: () => {
              controls.playing = !controls.playing;
              updatePlay();
            },
          });
          presets.append(playButton);
        } else {
          presets.append(el('button', {
            class: 'preset',
            text: p.label,
            onclick: () => {
              if (controls.playing !== undefined) controls.playing = false;
              updatePlay();
              range.value = p.value;
              readout.textContent = controls.set(p.value);
              lastValue = p.value;
              show(p.value);
            },
          }));
        }
      }
      updatePlay();
      readout.textContent = controls.set(controls.value);
      lastValue = controls.value;
      lastReadout = readout.textContent;
      show(controls.value);
      panel.hidden = false;
    },
    hide() {
      panel.hidden = true;
    },
    /** Pull the scene's current value and readout into the panel (for animated scenes). */
    sync() {
      if (!controls || panel.hidden) return;
      if (Boolean(controls.playing) !== lastPlaying) updatePlay();
      if (controls.value !== lastValue) {
        lastValue = controls.value;
        range.value = controls.value;
        show(controls.value);
      }
      if (controls.readout && controls.readout !== lastReadout) {
        lastReadout = controls.readout;
        readout.textContent = controls.readout;
      }
    },
    get active() {
      return controls;
    },
  };
}
