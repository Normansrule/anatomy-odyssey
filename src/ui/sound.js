// Sound, off until you turn it on. Every cue is synthesized with the Web Audio API on the spot,
// so the app ships no sound files and makes no requests: a tick for a toggle, a soft pop when a
// card opens, a breath of air when the body comes apart or turns round, and a chime on each new
// plate whose pitch falls as you go down the scale, so you can hear how deep you are.

/** The chime for each tier, high for the whole body and lower at each step down (A major pentatonic). */
export const TIER_TONES = { 1: 880, 2: 740, 3: 659.25, 4: 554.37, 5: 493.88, 6: 440, 7: 369.99 };

export function scaleTone(tier) {
  return TIER_TONES[tier] ?? TIER_TONES[Math.min(7, Math.max(1, Math.round(tier) || 1))];
}

/** An attack-decay envelope on a gain param: up to `peak` in `attack` seconds, then away over `decay`. */
function envelope(param, t0, peak, attack, decay) {
  param.cancelScheduledValues(t0);
  param.setValueAtTime(0.0001, t0);
  param.exponentialRampToValueAtTime(peak, t0 + attack);
  param.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
}

export function createSound({ enabled = false, volume = 1 } = {}) {
  let ctx = null;
  let master = null;
  let noise = null;
  let on = enabled;

  function audio() {
    if (!on) return null;
    const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9 * volume;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, { type = 'sine', at = 0, peak = 0.05, attack = 0.005, decay = 0.12, glide } = {}) {
    const c = audio();
    if (!c) return;
    const t0 = c.currentTime + at;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glide) osc.frequency.exponentialRampToValueAtTime(glide, t0 + attack + decay);
    envelope(g.gain, t0, peak, attack, decay);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + attack + decay + 0.05);
  }

  function noiseBuffer(c) {
    if (noise) return noise;
    noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noise.getChannelData(0);
    let seed = 7;
    for (let i = 0; i < d.length; i++) {
      seed = (seed * 16807) % 2147483647; // a fixed hiss, the same every time
      d[i] = (seed / 2147483647) * 2 - 1;
    }
    return noise;
  }

  return {
    get enabled() {
      return on;
    },
    set enabled(v) {
      on = Boolean(v);
      if (!on && ctx?.state === 'running') ctx.suspend();
    },
    /** A toggle switched. */
    tick() {
      tone(1480, { peak: 0.03, decay: 0.035 });
    },
    /** A card opened. */
    pop() {
      tone(620, { type: 'triangle', peak: 0.05, decay: 0.09, glide: 930 });
    },
    /** Air moving: rising as the body comes apart, falling as it closes up or turns. */
    whoosh(rising = true) {
      const c = audio();
      if (!c) return;
      const t0 = c.currentTime;
      const src = c.createBufferSource();
      src.buffer = noiseBuffer(c);
      const band = c.createBiquadFilter();
      band.type = 'bandpass';
      band.Q.value = 1.6;
      const [f0, f1] = rising ? [380, 2200] : [2200, 380];
      band.frequency.setValueAtTime(f0, t0);
      band.frequency.exponentialRampToValueAtTime(f1, t0 + 0.7);
      const g = c.createGain();
      envelope(g.gain, t0, 0.07, 0.18, 0.62);
      src.connect(band).connect(g).connect(master);
      src.start(t0);
      src.stop(t0 + 0.85);
    },
    /** A new plate: its tier's note with a soft fifth above, rising if you climbed, falling if you dove. */
    step(tier, forward = true) {
      const f = scaleTone(tier);
      tone(f, { peak: 0.045, attack: 0.01, decay: 0.6 });
      tone(f * 1.5, { at: forward ? 0 : 0.06, peak: 0.018, attack: 0.01, decay: 0.45 });
    },
  };
}
