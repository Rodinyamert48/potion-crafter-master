// Synthesized sound effect recipes. Each builds a tiny Web Audio graph that
// plays once and cleans itself up.

import type { AudioSystem, LoopHandle } from './AudioSystem';

export interface SfxOptions {
  volume?: number;
  pitch?: number;
  /** World x for stereo placement. */
  x?: number;
  delay?: number;
  minGap?: number;
  /** Free parameter used by some recipes (size, count…). */
  amount?: number;
}

type Recipe = (a: AudioSystem, o: SfxOptions) => void;

const r = (min: number, max: number) => min + Math.random() * (max - min);

function start(a: AudioSystem, o: SfxOptions, reverb = 0.25) {
  const t = a.now + (o.delay ?? 0) + 0.005;
  const out = a.output(a.panFor(o.x), reverb);
  return { t, out, v: o.volume ?? 1, p: o.pitch ?? 1 };
}

export const SFX = {
  // --- Physical impacts -------------------------------------------------
  dropSoft: (a, o) => {
    const { t, out, v, p } = start(a, o, 0.15);
    a.osc('sine', r(130, 170) * p, t, 0.12, out, 0.25 * v, 0.002, 60 * p);
    a.noiseBurst('pink', t, 0.08, out, 0.12 * v, { type: 'lowpass', freq: 900 * p });
  },
  dropHard: (a, o) => {
    const { t, out, v, p } = start(a, o, 0.2);
    a.noiseBurst('white', t, 0.05, out, 0.22 * v, { type: 'bandpass', freq: 2600 * p, q: 3 });
    a.osc('triangle', r(560, 700) * p, t, 0.09, out, 0.12 * v, 0.001, 380 * p);
  },
  woodKnock: (a, o) => {
    const { t, out, v, p } = start(a, o, 0.25);
    a.osc('sine', r(85, 110) * p, t, 0.18, out, 0.4 * v, 0.002, 55);
    a.osc('triangle', r(240, 290) * p, t, 0.07, out, 0.12 * v, 0.001, 150);
    a.noiseBurst('pink', t, 0.06, out, 0.18 * v, { type: 'lowpass', freq: 600 });
  },
  glassClink: (a, o) => {
    const { t, out, v, p } = start(a, o, 0.35);
    const base = r(1900, 2400) * p;
    a.osc('sine', base, t, 0.45, out, 0.12 * v, 0.001);
    a.osc('sine', base * 1.63, t, 0.3, out, 0.07 * v, 0.001);
    a.osc('sine', base * 2.71, t, 0.18, out, 0.05 * v, 0.001);
    a.noiseBurst('white', t, 0.015, out, 0.08 * v, { type: 'highpass', freq: 5000 });
  },
  glassBreak: (a, o) => {
    const { t, out, v } = start(a, o, 0.4);
    a.noiseBurst('white', t, 0.35, out, 0.3 * v, { type: 'highpass', freq: 2500, freqEnd: 6000 });
    for (let i = 0; i < 9; i++) {
      const tt = t + r(0, 0.28);
      const f = r(2500, 6000);
      a.osc('sine', f, tt, r(0.08, 0.25), out, 0.07 * v, 0.001);
    }
  },
  metalClang: (a, o) => {
    const { t, out, v, p } = start(a, o, 0.4);
    for (const [f, g, d] of [
      [420, 0.18, 0.6],
      [1090, 0.1, 0.45],
      [2310, 0.06, 0.3],
      [3530, 0.03, 0.2],
    ])
      a.osc('sine', f * p * r(0.98, 1.02), t, d, out, g * v, 0.001);
    a.noiseBurst('white', t, 0.03, out, 0.15 * v, { type: 'bandpass', freq: 3000, q: 1 });
  },
  chop: (a, o) => {
    const { t, out, v, p } = start(a, o, 0.15);
    a.noiseBurst('white', t, 0.05, out, 0.28 * v, { type: 'bandpass', freq: 1700 * p, q: 2 });
    a.osc('sine', 230 * p, t, 0.06, out, 0.22 * v, 0.001, 120);
  },
  smash: (a, o) => {
    const { t, out, v, p } = start(a, o, 0.25);
    a.osc('sine', 110 * p, t, 0.2, out, 0.5 * v, 0.001, 45);
    for (let i = 0; i < 5; i++) a.noiseBurst('white', t + i * 0.012, 0.03, out, 0.2 * v, { type: 'bandpass', freq: r(1500, 3500), q: 2 });
  },
  crunch: (a, o) => {
    const { t, out, v } = start(a, o, 0.1);
    for (let i = 0; i < 4; i++) a.noiseBurst('white', t + i * r(0.01, 0.03), 0.025, out, 0.12 * v, { type: 'bandpass', freq: r(1800, 4200), q: 3 });
  },
  squish: (a, o) => {
    const { t, out, v } = start(a, o, 0.15);
    a.noiseBurst('pink', t, 0.18, out, 0.25 * v, { type: 'bandpass', freq: 500, q: 3, freqEnd: 1400 });
    a.osc('sine', 300, t, 0.12, out, 0.12 * v, 0.002, 140);
  },

  // --- Liquids ----------------------------------------------------------
  splash: (a, o) => {
    const { t, out, v, p } = start(a, o, 0.3);
    const size = o.amount ?? 1;
    a.noiseBurst('white', t, 0.25 + size * 0.2, out, 0.25 * v, { type: 'bandpass', freq: 1800 * p, q: 1.2, freqEnd: 450 });
    for (let i = 0; i < 3 + size * 3; i++) {
      const tt = t + r(0.02, 0.25);
      const f = r(900, 2200) * p;
      a.osc('sine', f, tt, 0.05, out, 0.06 * v, 0.001, f * 1.8);
    }
  },
  plop: (a, o) => {
    const { t, out, v, p } = start(a, o, 0.3);
    a.osc('sine', 700 * p, t, 0.09, out, 0.25 * v, 0.002, 180 * p);
    a.noiseBurst('white', t + 0.02, 0.12, out, 0.1 * v, { type: 'bandpass', freq: 1500, q: 1.5, freqEnd: 600 });
  },
  bubble: (a, o) => {
    const { t, out, v, p } = start(a, o, 0.25);
    const f = r(250, 520) * p;
    a.osc('sine', f, t, 0.07, out, 0.14 * v, 0.004, f * 2.4);
  },
  gulp: (a, o) => {
    const { t, out, v } = start(a, o, 0.1);
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.32;
      a.osc('sine', 260, tt, 0.15, out, 0.2 * v, 0.01, 110);
      a.noiseBurst('pink', tt, 0.12, out, 0.08 * v, { type: 'lowpass', freq: 500 });
    }
  },
  corkPop: (a, o) => {
    const { t, out, v, p } = start(a, o, 0.25);
    a.noiseBurst('white', t, 0.03, out, 0.3 * v, { type: 'bandpass', freq: 1200 * p, q: 2 });
    a.osc('sine', 950 * p, t, 0.08, out, 0.2 * v, 0.001, 380 * p);
  },
  fill: (a, o) => {
    const { t, out, v } = start(a, o, 0.25);
    for (let i = 0; i < 6; i++) {
      const tt = t + i * 0.1;
      const f = 300 + i * 70;
      a.osc('sine', f, tt, 0.08, out, 0.12 * v, 0.004, f * 1.6);
    }
  },
  hiss: (a, o) => {
    const { t, out, v } = start(a, o, 0.2);
    a.noiseBurst('white', t, 0.6 * (o.amount ?? 1), out, 0.18 * v, { type: 'highpass', freq: 3200 }, 0.03);
  },
  sizzle: (a, o) => {
    const { t, out, v } = start(a, o, 0.2);
    a.noiseBurst('white', t, 0.9, out, 0.2 * v, { type: 'bandpass', freq: 5000, q: 0.7, freqEnd: 2500 }, 0.02);
    for (let i = 0; i < 8; i++) a.noiseBurst('white', t + r(0, 0.8), 0.01, out, 0.1 * v, { type: 'highpass', freq: 4000 });
  },

  // --- Fire & magic ---------------------------------------------------------
  whoosh: (a, o) => {
    const { t, out, v, p } = start(a, o, 0.2);
    a.noiseBurst('pink', t, 0.45, out, 0.32 * v, { type: 'bandpass', freq: 300 * p, q: 0.8, freqEnd: 1400 * p }, 0.12);
  },
  flare: (a, o) => {
    const { t, out, v } = start(a, o, 0.3);
    a.noiseBurst('brown', t, 0.8, out, 0.5 * v, { type: 'lowpass', freq: 400, freqEnd: 1600 }, 0.04);
    for (let i = 0; i < 10; i++) a.noiseBurst('white', t + r(0, 0.7), 0.012, out, 0.12 * v, { type: 'highpass', freq: 2500 });
  },
  chime: (a, o) => {
    const { t, out, v, p } = start(a, o, 0.6);
    const notes = [0, 4, 7, 12, 16];
    notes.forEach((n, i) => {
      const f = 523.25 * Math.pow(2, n / 12) * p;
      a.osc('sine', f, t + i * 0.08, 0.9, out, 0.1 * v, 0.004);
      a.osc('triangle', f * 2, t + i * 0.08, 0.4, out, 0.03 * v, 0.004);
    });
  },
  discovery: (a, o) => {
    const { t, out, v } = start(a, o, 0.7);
    const seq = [0, 7, 12, 16, 19, 24];
    seq.forEach((n, i) => {
      const f = 392 * Math.pow(2, n / 12);
      a.osc('triangle', f, t + i * 0.1, 1.2, out, 0.11 * v, 0.004);
      a.osc('sine', f * 2.01, t + i * 0.1, 0.8, out, 0.05 * v, 0.004);
    });
    a.noiseBurst('white', t + 0.5, 1.2, out, 0.04 * v, { type: 'highpass', freq: 7000 }, 0.3);
  },
  sparkle: (a, o) => {
    const { t, out, v, p } = start(a, o, 0.5);
    for (let i = 0; i < 6; i++) {
      const f = r(2000, 4200) * p;
      a.osc('sine', f, t + i * 0.04, 0.18, out, 0.05 * v, 0.002);
    }
  },
  magic: (a, o) => {
    const { t, out, v, p } = start(a, o, 0.6);
    const f = 440 * p;
    const ctx = a.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(f * 3, t + 0.5);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 18;
    const lg = ctx.createGain();
    lg.gain.value = f * 0.05;
    lfo.connect(lg);
    lg.connect(osc.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12 * v, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    osc.connect(g);
    g.connect(out);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + 0.8);
    lfo.stop(t + 0.8);
  },
  explosion: (a, o) => {
    const { t, out, v } = start(a, o, 0.5);
    a.noiseBurst('brown', t, 1.8, out, 0.9 * v, { type: 'lowpass', freq: 900, freqEnd: 120 }, 0.005);
    a.noiseBurst('white', t, 0.25, out, 0.4 * v, { type: 'lowpass', freq: 3000 }, 0.002);
    a.osc('sine', 70, t, 1.2, out, 0.8 * v, 0.004, 28);
    for (let i = 0; i < 14; i++) a.noiseBurst('white', t + r(0.2, 1.5), 0.02, out, 0.1 * v, { type: 'bandpass', freq: r(1500, 4000), q: 2 });
  },
  poof: (a, o) => {
    const { t, out, v } = start(a, o, 0.4);
    a.noiseBurst('pink', t, 0.35, out, 0.4 * v, { type: 'bandpass', freq: 900, q: 0.7, freqEnd: 2500 }, 0.004);
    SFX.sparkle(a, { ...o, delay: (o.delay ?? 0) + 0.1, volume: v * 0.8 });
  },
  vortex: (a, o) => {
    const { t, out, v } = start(a, o, 0.5);
    a.noiseBurst('pink', t, 2.5, out, 0.3 * v, { type: 'bandpass', freq: 250, q: 4, freqEnd: 1800 }, 0.4);
    a.osc('sawtooth', 55, t, 2.4, out, 0.08 * v, 0.5, 110);
  },
  rumble: (a, o) => {
    const { t, out, v } = start(a, o, 0.2);
    a.noiseBurst('brown', t, 1.0, out, 0.5 * v, { type: 'lowpass', freq: 160 }, 0.1);
  },

  // --- Shop & characters --------------------------------------------------
  doorCreak: (a, o) => {
    const { t, out, v } = start(a, o, 0.35);
    const ctx = a.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(170, t);
    osc.frequency.linearRampToValueAtTime(240, t + 0.35);
    osc.frequency.linearRampToValueAtTime(150, t + 0.7);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 23;
    const lg = ctx.createGain();
    lg.gain.value = 18;
    lfo.connect(lg);
    lg.connect(osc.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09 * v, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
    osc.connect(f);
    f.connect(g);
    g.connect(out);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + 0.8);
    lfo.stop(t + 0.8);
  },
  doorBell: (a, o) => {
    const { t, out, v } = start(a, o, 0.5);
    for (let i = 0; i < 4; i++) {
      const tt = t + i * 0.09;
      const f = i % 2 ? 1480 : 1760;
      a.osc('sine', f, tt, 0.5, out, 0.08 * v, 0.001);
      a.osc('sine', f * 2.76, tt, 0.25, out, 0.03 * v, 0.001);
    }
  },
  counterBell: (a, o) => {
    const { t, out, v } = start(a, o, 0.5);
    a.osc('sine', 2093, t, 1.4, out, 0.16 * v, 0.001);
    a.osc('sine', 2093 * 2.4, t, 0.7, out, 0.06 * v, 0.001);
    a.osc('sine', 2093 * 3.9, t, 0.35, out, 0.03 * v, 0.001);
  },
  coin: (a, o) => {
    const { t, out, v, p } = start(a, o, 0.3);
    const f = r(2600, 3000) * p;
    a.osc('sine', f, t, 0.18, out, 0.1 * v, 0.001);
    a.osc('sine', f * 1.5, t + 0.05, 0.25, out, 0.08 * v, 0.001);
  },
  coins: (a, o) => {
    const n = Math.min(12, Math.max(3, o.amount ?? 5));
    for (let i = 0; i < n; i++) SFX.coin(a, { ...o, delay: (o.delay ?? 0) + i * r(0.04, 0.09), pitch: r(0.9, 1.15), minGap: 0 });
  },
  footstep: (a, o) => {
    const { t, out, v, p } = start(a, o, 0.1);
    a.noiseBurst('pink', t, 0.05, out, 0.08 * v, { type: 'lowpass', freq: 700 * p });
    a.osc('sine', 90 * p, t, 0.05, out, 0.08 * v, 0.002, 60);
  },
  frogCroak: (a, o) => {
    const { t, out, v, p } = start(a, o, 0.3);
    const ctx = a.ctx!;
    for (let k = 0; k < 2; k++) {
      const tt = t + k * 0.22;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(140 * p, tt);
      osc.frequency.linearRampToValueAtTime(95 * p, tt + 0.16);
      const am = ctx.createOscillator();
      am.frequency.value = 38;
      const amg = ctx.createGain();
      amg.gain.value = 0.5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.exponentialRampToValueAtTime(0.12 * v, tt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.18);
      am.connect(amg);
      amg.connect(g.gain);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 900;
      osc.connect(f);
      f.connect(g);
      g.connect(out);
      osc.start(tt);
      am.start(tt);
      osc.stop(tt + 0.2);
      am.stop(tt + 0.2);
    }
  },
  happy: (a, o) => {
    const { t, out, v } = start(a, o, 0.4);
    [0, 4, 7].forEach((n, i) => a.osc('triangle', 660 * Math.pow(2, n / 12), t + i * 0.09, 0.3, out, 0.1 * v, 0.004));
  },
  sad: (a, o) => {
    const { t, out, v } = start(a, o, 0.4);
    [0, -1, -2, -5].forEach((n, i) =>
      a.osc('sawtooth', 220 * Math.pow(2, n / 12), t + i * 0.22, i === 3 ? 0.7 : 0.24, out, 0.05 * v, 0.02, i === 3 ? 170 : undefined),
    );
  },
  angry: (a, o) => {
    const { t, out, v } = start(a, o, 0.2);
    a.osc('sawtooth', 160, t, 0.25, out, 0.08 * v, 0.01, 110);
    a.osc('sawtooth', 150, t + 0.12, 0.3, out, 0.07 * v, 0.01, 100);
  },
  meow: (a, o) => {
    const { t, out, v } = start(a, o, 0.3);
    const ctx = a.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.linearRampToValueAtTime(780, t + 0.12);
    osc.frequency.linearRampToValueAtTime(420, t + 0.45);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.linearRampToValueAtTime(1600, t + 0.15);
    f.frequency.linearRampToValueAtTime(700, t + 0.45);
    f.Q.value = 5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12 * v, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    osc.connect(f);
    f.connect(g);
    g.connect(out);
    osc.start(t);
    osc.stop(t + 0.55);
  },
  hissCat: (a, o) => {
    const { t, out, v } = start(a, o, 0.2);
    a.noiseBurst('white', t, 0.5, out, 0.2 * v, { type: 'bandpass', freq: 4500, q: 1.2 }, 0.02);
  },

  // --- UI ---------------------------------------------------------------------
  uiClick: (a, o) => {
    const { t, out, v, p } = start(a, o, 0.05);
    a.osc('square', 880 * p, t, 0.04, out, 0.05 * v, 0.001, 660 * p);
  },
  uiHover: (a, o) => {
    const { t, out, v } = start(a, o, 0.02);
    a.osc('sine', 1320, t, 0.025, out, 0.025 * v, 0.001);
  },
  pageFlip: (a, o) => {
    const { t, out, v } = start(a, o, 0.15);
    a.noiseBurst('white', t, 0.18, out, 0.12 * v, { type: 'bandpass', freq: 2500, q: 0.8, freqEnd: 5000 }, 0.03);
  },
  bookOpen: (a, o) => {
    const { t, out, v } = start(a, o, 0.25);
    a.noiseBurst('pink', t, 0.3, out, 0.18 * v, { type: 'bandpass', freq: 600, q: 0.7, freqEnd: 2200 }, 0.05);
    a.osc('sine', 110, t + 0.22, 0.12, out, 0.2 * v, 0.002, 70);
  },
  purchase: (a, o) => {
    SFX.coins(a, { ...o, amount: 4 });
    SFX.happy(a, { ...o, delay: (o.delay ?? 0) + 0.2, volume: (o.volume ?? 1) * 0.7 });
  },
  denied: (a, o) => {
    const { t, out, v } = start(a, o, 0.1);
    a.osc('square', 180, t, 0.12, out, 0.06 * v, 0.004);
    a.osc('square', 140, t + 0.12, 0.16, out, 0.06 * v, 0.004);
  },
  lever: (a, o) => {
    const { t, out, v, p } = start(a, o, 0.2);
    a.noiseBurst('white', t, 0.02, out, 0.15 * v, { type: 'bandpass', freq: 3000 * p, q: 4 });
    a.osc('triangle', 520 * p, t, 0.05, out, 0.08 * v, 0.001, 300);
  },
  ratchet: (a, o) => {
    const { t, out, v, p } = start(a, o, 0.15);
    a.noiseBurst('white', t, 0.012, out, 0.13 * v, { type: 'highpass', freq: 2600 * p, q: 1 });
    a.osc('square', 1500 * p, t, 0.018, out, 0.035 * v, 0.001, 900 * p);
  },
  chain: (a, o) => {
    const { t, out, v, p } = start(a, o, 0.25);
    for (let i = 0; i < 4; i++) a.noiseBurst('white', t + i * r(0.025, 0.05), 0.014, out, 0.06 * v, { type: 'bandpass', freq: r(2600, 4300) * p, q: 3 });
  },
  squeak: (a, o) => {
    const { t, out, v, p } = start(a, o, 0.1);
    a.osc('sine', 1200 * p, t, 0.1, out, 0.05 * v, 0.01, 1800 * p);
  },
  warning: (a, o) => {
    const { t, out, v } = start(a, o, 0.2);
    for (let i = 0; i < 2; i++) a.osc('square', 330, t + i * 0.25, 0.14, out, 0.05 * v, 0.004);
  },
  // --- Guests & rewards ------------------------------------------------------
  /** A deep dramatic "boom" (the eyebrow-raise sting). */
  boom: (a, o) => {
    const { t, out, v } = start(a, o, 0.5);
    a.osc('sine', 110, t, 1.1, out, 0.55 * v, 0.004, 32);
    a.osc('triangle', 220, t, 0.25, out, 0.2 * v, 0.002, 60);
    a.noiseBurst('brown', t, 0.5, out, 0.35 * v, { type: 'lowpass', freq: 260 }, 0.004);
  },
  bark: (a, o) => {
    const { t, out, v, p } = start(a, o, 0.15);
    for (let i = 0; i < 2; i++) {
      const tt = t + i * 0.22;
      a.osc('sawtooth', 420 * p, tt, 0.12, out, 0.12 * v, 0.004, 240 * p);
      a.noiseBurst('pink', tt, 0.1, out, 0.1 * v, { type: 'bandpass', freq: 900 * p, q: 1.5 });
    }
  },
  sprinkle: (a, o) => {
    const { t, out, v } = start(a, o, 0.3);
    for (let i = 0; i < 14; i++) a.noiseBurst('white', t + i * r(0.02, 0.06), 0.012, out, 0.05 * v, { type: 'highpass', freq: r(5000, 9000) });
  },
  cheer: (a, o) => {
    const { t, out, v } = start(a, o, 0.5);
    a.noiseBurst('pink', t, 1.3, out, 0.14 * v, { type: 'bandpass', freq: 1400, q: 0.6, freqEnd: 900 }, 0.25);
    for (let i = 0; i < 8; i++) a.osc('triangle', r(500, 900), t + r(0, 0.6), r(0.08, 0.18), out, 0.03 * v, 0.01, r(700, 1200));
  },
  achievement: (a, o) => {
    const { t, out, v } = start(a, o, 0.55);
    [0, 7, 12, 16, 19, 24].forEach((n, i) => {
      const f = 392 * Math.pow(2, n / 12);
      a.osc('square', f, t + i * 0.075, i === 5 ? 0.7 : 0.14, out, 0.045 * v, 0.003);
      a.osc('triangle', f / 2, t + i * 0.075, 0.2, out, 0.05 * v, 0.003);
    });
  },
  caravanBells: (a, o) => {
    const { t, out, v } = start(a, o, 0.6);
    for (let i = 0; i < 7; i++) {
      const f = r(1400, 2300);
      a.osc('sine', f, t + i * r(0.07, 0.14), 0.4, out, 0.05 * v, 0.002);
      a.osc('sine', f * 2.4, t + i * 0.1, 0.2, out, 0.02 * v, 0.002);
    }
  },
  quest: (a, o) => {
    const { t, out, v } = start(a, o, 0.5);
    [0, 5, 9, 12].forEach((n, i) => a.osc('triangle', 440 * Math.pow(2, n / 12), t + i * 0.12, 0.5, out, 0.09 * v, 0.004));
  },
} satisfies Record<string, Recipe>;

export type SfxName = keyof typeof SFX;

// ---------------------------------------------------------------------------
// Loops (persistent, parameterised)
// ---------------------------------------------------------------------------

function noiseLoop(a: AudioSystem, kind: 'white' | 'pink' | 'brown', filterType: BiquadFilterType, freq: number, q: number, bus?: AudioNode) {
  const ctx = a.ctx!;
  const src = ctx.createBufferSource();
  src.buffer = a.noise[kind];
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = filterType;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = 0;
  src.connect(f);
  f.connect(g);
  g.connect(bus ?? a.output(0, 0.15));
  src.start();
  return { src, f, g };
}

/** Boiling: filtered rumble plus random bubble pops scheduled by intensity. */
export function boilLoop(a: AudioSystem): LoopHandle {
  const { src, f, g } = noiseLoop(a, 'brown', 'bandpass', 380, 0.8);
  let level = 0;
  let stopped = false;
  const pop = () => {
    if (stopped) return;
    if (level > 0.05 && Math.random() < level) SFX.bubble(a, { volume: 0.4 + level * 0.6, pitch: 0.7 + Math.random() * 0.8, minGap: 0 });
    setTimeout(pop, 60 + Math.random() * (260 - level * 180));
  };
  pop();
  return {
    set(l: number, x?: number) {
      level = l;
      const t = a.now;
      g.gain.setTargetAtTime(l * 0.35, t, 0.2);
      f.frequency.setTargetAtTime(300 + l * 500, t, 0.2);
      void x;
    },
    stop() {
      stopped = true;
      g.gain.setTargetAtTime(0, a.now, 0.1);
      src.stop(a.now + 0.5);
    },
  };
}

/** Fire: low roar + crackles. */
export function fireLoop(a: AudioSystem): LoopHandle {
  const { src, f, g } = noiseLoop(a, 'brown', 'lowpass', 420, 0.5);
  let level = 0;
  let stopped = false;
  const crackle = () => {
    if (stopped) return;
    if (level > 0.05 && Math.random() < level * 0.8) {
      const t = a.now;
      a.noiseBurst('white', t, 0.012 + Math.random() * 0.02, a.output(-0.05, 0.1), 0.05 + level * 0.1, { type: 'highpass', freq: 1800 + Math.random() * 2000 });
    }
    setTimeout(crackle, 40 + Math.random() * 220);
  };
  crackle();
  return {
    set(l: number) {
      level = l;
      const t = a.now;
      g.gain.setTargetAtTime(Math.min(1.5, l) * 0.3, t, 0.2);
      f.frequency.setTargetAtTime(300 + l * 500, t, 0.2);
    },
    stop() {
      stopped = true;
      g.gain.setTargetAtTime(0, a.now, 0.1);
      src.stop(a.now + 0.5);
    },
  };
}

/** Swishing liquid while stirring (level = stir intensity). */
export function stirLoop(a: AudioSystem): LoopHandle {
  const { src, f, g } = noiseLoop(a, 'pink', 'bandpass', 500, 1.4);
  return {
    set(l: number) {
      const t = a.now;
      g.gain.setTargetAtTime(Math.min(1, l) * 0.4, t, 0.08);
      f.frequency.setTargetAtTime(350 + l * 900, t, 0.08);
    },
    stop() {
      g.gain.setTargetAtTime(0, a.now, 0.1);
      src.stop(a.now + 0.5);
    },
  };
}

/** Grinding grit (level = grind speed). */
export function grindLoop(a: AudioSystem): LoopHandle {
  const { src, f, g } = noiseLoop(a, 'white', 'bandpass', 2400, 2.5);
  return {
    set(l: number) {
      const t = a.now;
      g.gain.setTargetAtTime(Math.min(1, l) * 0.22, t, 0.06);
      f.frequency.setTargetAtTime(1800 + l * 1600, t, 0.06);
    },
    stop() {
      g.gain.setTargetAtTime(0, a.now, 0.1);
      src.stop(a.now + 0.5);
    },
  };
}

/** Pouring liquid (level 0..1). */
export function pourLoop(a: AudioSystem): LoopHandle {
  const { src, f, g } = noiseLoop(a, 'white', 'bandpass', 1100, 1.1);
  return {
    set(l: number) {
      const t = a.now;
      g.gain.setTargetAtTime(Math.min(1, l) * 0.3, t, 0.05);
      f.frequency.setTargetAtTime(900 + Math.random() * 500, t, 0.05);
    },
    stop() {
      g.gain.setTargetAtTime(0, a.now, 0.1);
      src.stop(a.now + 0.5);
    },
  };
}

/** Low danger rumble. */
export function rumbleLoop(a: AudioSystem): LoopHandle {
  const { src, f, g } = noiseLoop(a, 'brown', 'lowpass', 120, 0.7);
  return {
    set(l: number) {
      const t = a.now;
      g.gain.setTargetAtTime(Math.min(1, l) * 0.6, t, 0.1);
      f.frequency.setTargetAtTime(90 + l * 90, t, 0.1);
    },
    stop() {
      g.gain.setTargetAtTime(0, a.now, 0.1);
      src.stop(a.now + 0.5);
    },
  };
}

/** Ambience: room tone + day birds / night crickets. */
/** Dark Fantasy mood: a low detuned drone, wind in the rafters and the odd
 *  creak, knock or far-off chime. */
export function horrorLoop(a: AudioSystem): LoopHandle {
  const ctx = a.ctx!;
  const { src, g } = noiseLoop(a, 'brown', 'bandpass', 180, 0.7, a.ambienceBus);
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0;
  droneGain.connect(a.ambienceBus);
  const oscs = [55, 58.3, 82.4].map((f) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    o.connect(droneGain);
    o.start();
    return o;
  });
  let level = 0;
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    if (level > 0.05) {
      const t = a.now;
      const out = a.output(Math.random() * 1.6 - 0.8, 0.6, a.ambienceBus);
      const r = Math.random();
      if (r < 0.3) a.noiseBurst('brown', t, 0.6, out, 0.05 * level, { type: 'bandpass', freq: 300 + Math.random() * 200, q: 6, freqEnd: 120 }, 0.2);
      else if (r < 0.45) {
        // a slow knock somewhere in the house
        for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) a.osc('sine', 70, t + i * 0.42, 0.2, out, 0.12 * level, 0.002, 45);
      } else if (r < 0.55) a.osc('sine', 1760 + Math.random() * 400, t, 2.2, out, 0.012 * level, 0.3);
    }
    setTimeout(tick, 2500 + Math.random() * 5000);
  };
  tick();
  return {
    set(v: number) {
      level = v;
      g.gain.setTargetAtTime(v * 0.05, a.now, 1);
      droneGain.gain.setTargetAtTime(v * 0.035, a.now, 1.5);
    },
    stop() {
      stopped = true;
      g.gain.setTargetAtTime(0, a.now, 0.2);
      droneGain.gain.setTargetAtTime(0, a.now, 0.2);
      src.stop(a.now + 1);
      for (const o of oscs) o.stop(a.now + 1);
    },
  };
}

export function ambienceLoop(a: AudioSystem): LoopHandle {
  const { src, g } = noiseLoop(a, 'brown', 'lowpass', 250, 0.5, a.ambienceBus);
  let night = 0;
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    const t = a.now;
    const out = a.output(Math.random() * 1.2 - 0.6, 0.3, a.ambienceBus);
    if (night > 0.5) {
      // crickets
      if (Math.random() < 0.7) {
        const f = 4200 + Math.random() * 600;
        for (let i = 0; i < 3; i++) a.osc('sine', f, t + i * 0.05, 0.03, out, 0.015, 0.002);
      }
      if (Math.random() < 0.03) {
        a.osc('sine', 390, t, 0.35, out, 0.04, 0.05, 360);
        a.osc('sine', 390, t + 0.45, 0.5, out, 0.04, 0.05, 340);
      }
    } else if (Math.random() < 0.25) {
      // birds outside
      const f = 2400 + Math.random() * 1500;
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) a.osc('sine', f, t + i * 0.09, 0.07, out, 0.012, 0.005, f * (1.2 + Math.random() * 0.4));
    }
    setTimeout(tick, 350 + Math.random() * 900);
  };
  tick();
  return {
    set(level: number, n?: number) {
      night = n ?? night;
      g.gain.setTargetAtTime(level * 0.08, a.now, 0.5);
    },
    stop() {
      stopped = true;
      g.gain.setTargetAtTime(0, a.now, 0.1);
      src.stop(a.now + 0.5);
    },
  };
}
