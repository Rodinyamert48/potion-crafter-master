// Adaptive, procedurally performed music.
// Day: lively D-dorian tavern tune (lute arpeggios, recorder, drone, frame drum).
// Night: slow A-minor lullaby (harp, bells, soft pad).
// Danger: tremolo strings + taiko layered on top as chaos rises.
// Melodies are generated bar by bar from chord tones with stepwise motion and
// fixed rhythmic cells, so they sound composed but never loop identically.

import type { AudioSystem } from './AudioSystem';

type MoodName = 'day' | 'night';

interface Mood {
  bpm: number;
  tonic: number;
  scale: number[];
  /** Chords as scale degrees (0-based) of the root, per bar. */
  progression: number[];
}

const MOODS: Record<MoodName, Mood> = {
  day: { bpm: 100, tonic: 62, scale: [0, 2, 3, 5, 7, 9, 10], progression: [0, 6, 0, 4, 2, 6, 3, 0] },
  night: { bpm: 68, tonic: 57, scale: [0, 2, 3, 5, 7, 8, 10], progression: [0, 5, 3, 4, 0, 6, 5, 4] },
};

// Rhythm cells in eighth notes (durations); negative = rest.
const DAY_RHYTHMS = [
  [2, 1, 1, 2, 2],
  [1, 1, 1, 1, 2, 2],
  [3, 1, 2, 2],
  [2, 2, 1, 1, 2],
  [4, -2, 1, 1],
  [1, 1, 2, 1, 1, 2],
];
const NIGHT_RHYTHMS = [
  [4, 4],
  [3, 1, 4],
  [2, 2, 4],
  [6, -2],
  [2, 2, 2, 2],
];

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class Music {
  private readonly buses: Record<MoodName | 'danger', GainNode>;
  mood: MoodName | null = null;
  private dangerTarget = 0;
  private danger = 0;
  private nextBar = 0;
  private bar = 0;
  private melodyNote = 4;
  private timer: number | null = null;
  enabled = true;

  constructor(private readonly a: AudioSystem) {
    const ctx = a.ctx!;
    const mk = () => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(a.musicBus);
      const send = ctx.createGain();
      send.gain.value = 0.35;
      g.connect(send);
      send.connect(a.reverbSend);
      return g;
    };
    this.buses = { day: mk(), night: mk(), danger: mk() };
  }

  start(mood: MoodName): void {
    this.setMood(mood);
    if (this.timer === null) this.timer = window.setInterval(() => this.tick(), 50);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    const t = this.a.now;
    for (const b of Object.values(this.buses)) b.gain.setTargetAtTime(0, t, 0.5);
    this.mood = null;
  }

  setMood(mood: MoodName): void {
    if (mood === this.mood) return;
    const t = this.a.now;
    if (this.mood) this.buses[this.mood].gain.setTargetAtTime(0, t, 1.2);
    this.mood = mood;
    this.buses[mood].gain.setTargetAtTime(mood === 'day' ? 0.85 : 0.95, t + 0.2, 1.5);
    this.nextBar = t + 0.3;
  }

  /** 0 calm … 1 full tension. */
  setDanger(level: number): void {
    this.dangerTarget = Math.max(0, Math.min(1, level));
  }

  private get beat(): number {
    return 60 / MOODS[this.mood ?? 'day'].bpm;
  }

  private tick(): void {
    if (!this.mood || !this.enabled) return;
    const now = this.a.now;
    this.danger += (this.dangerTarget - this.danger) * 0.08;
    this.buses.danger.gain.setTargetAtTime(this.danger * 0.9, now, 0.3);
    // Calm the base music a little when danger is high.
    this.buses[this.mood].gain.setTargetAtTime((this.mood === 'day' ? 0.85 : 0.95) * (1 - this.danger * 0.45), now, 0.3);
    while (this.nextBar < now + 0.25) {
      this.scheduleBar(this.nextBar);
      this.nextBar += this.beat * 4;
      this.bar++;
    }
  }

  private chordTones(mood: Mood, degree: number): number[] {
    const s = mood.scale;
    return [0, 2, 4].map((k) => {
      const idx = degree + k;
      return mood.tonic + s[idx % 7] + 12 * Math.floor(idx / 7);
    });
  }

  private scaleNote(mood: Mood, step: number): number {
    const s = mood.scale;
    const oct = Math.floor(step / 7);
    return mood.tonic + s[((step % 7) + 7) % 7] + 12 * oct;
  }

  private scheduleBar(t: number): void {
    const mood = MOODS[this.mood!];
    const bus = this.buses[this.mood!];
    const beat = this.beat;
    const e = beat / 2;
    const degree = mood.progression[this.bar % mood.progression.length];
    const chord = this.chordTones(mood, degree);
    const section = Math.floor(this.bar / 8) % 4; // A A B A
    const hum = () => (Math.random() - 0.5) * 0.012;

    if (this.mood === 'day') {
      // Drone on root + fifth
      this.drone(t, mtof(chord[0] - 24), beat * 4, 0.05, bus);
      this.drone(t, mtof(chord[0] - 17), beat * 4, 0.03, bus);
      // Lute arpeggio in eighths
      const pattern = [0, 1, 2, 1, 0, 2, 1, 2];
      for (let i = 0; i < 8; i++) {
        const n = chord[pattern[i]] - 12 + (i === 4 ? 12 : 0);
        this.pluck(t + i * e + hum(), mtof(n), e * 1.8, i % 4 === 0 ? 0.11 : 0.075, bus, 2600);
      }
      // Percussion
      this.drum(t, 0.25, bus);
      this.drum(t + beat * 2, 0.18, bus);
      if (section !== 2 || this.bar % 2 === 0) {
        this.tamb(t + beat, 0.05, bus);
        this.tamb(t + beat * 3, 0.05, bus);
      }
      // Melody: recorder, resting every 4th bar
      if (this.bar % 4 !== 3) this.melody(t, mood, chord, DAY_RHYTHMS, e, bus, 'recorder', section === 2 ? 1 : 0);
    } else {
      this.pad(t, [mtof(chord[0] - 12), mtof(chord[1] - 12), mtof(chord[2] - 12)], beat * 4, 0.035, bus);
      for (let i = 0; i < 4; i++) {
        const n = chord[[0, 2, 1, 2][i]];
        this.pluck(t + i * beat + hum(), mtof(n - 12), beat * 2.5, 0.06, bus, 1500);
      }
      if (this.bar % 2 === 0) this.melody(t, mood, chord, NIGHT_RHYTHMS, e, bus, 'bell', 0);
    }

    // Danger layer
    if (this.danger > 0.03) {
      const dbus = this.buses.danger;
      const root = mood.tonic - 12;
      const cluster = [root, root + 1, root + 7];
      for (const n of cluster) this.strings(t, mtof(n), beat * 4, 0.04, dbus);
      const steps = this.danger > 0.5 ? 8 : 4;
      for (let i = 0; i < steps; i++) this.taiko(t + i * (beat * 4) / steps, i % 2 === 0 ? 0.35 : 0.2, dbus);
      if (this.danger > 0.6) for (let i = 0; i < 8; i++) this.pluck(t + i * e, mtof(root + 12 + (i % 2 ? 1 : 0)), e, 0.06, dbus, 3500);
    }
  }

  private melody(t: number, mood: Mood, chord: number[], rhythms: number[][], e: number, bus: GainNode, voice: 'recorder' | 'bell', lift: number): void {
    const rhythm = rhythms[Math.floor(Math.random() * rhythms.length)];
    let time = t;
    for (let i = 0; i < rhythm.length; i++) {
      const d = rhythm[i];
      if (d < 0) {
        time += -d * e;
        continue;
      }
      // Strong beats land on chord tones; others move stepwise.
      const strong = i === 0 || (time - t) % (e * 4) < 0.001;
      if (strong) {
        const target = chord[Math.floor(Math.random() * 3)];
        let best = this.melodyNote;
        let bestDist = 1e9;
        for (let s = -3; s < 17; s++) {
          const n = this.scaleNote(mood, s);
          if ((n - target) % 12 === 0) {
            const dist = Math.abs(s - this.melodyNote);
            if (dist < bestDist) {
              bestDist = dist;
              best = s;
            }
          }
        }
        this.melodyNote = best;
      } else {
        this.melodyNote += Math.random() < 0.5 ? 1 : -1;
        if (Math.random() < 0.15) this.melodyNote += Math.random() < 0.5 ? 2 : -2;
      }
      this.melodyNote = Math.max(2, Math.min(13, this.melodyNote));
      const midi = this.scaleNote(mood, this.melodyNote) + 12 * lift;
      if (voice === 'recorder') this.recorder(time, mtof(midi), d * e * 0.92, 0.075, bus);
      else this.bell(time, mtof(midi + 12), d * e * 2, 0.05, bus);
      time += d * e;
    }
  }

  // ---------------------------------------------------------------------
  // Instruments
  // ---------------------------------------------------------------------

  private env(t: number, attack: number, hold: number, release: number, peak: number, bus: AudioNode): GainNode {
    const g = this.a.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    g.connect(bus);
    return g;
  }

  private pluck(t: number, f: number, dur: number, vel: number, bus: AudioNode, bright: number): void {
    const ctx = this.a.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.3, dur));
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(bright, t);
    lp.frequency.exponentialRampToValueAtTime(500, t + 0.35);
    lp.Q.value = 2;
    lp.connect(g);
    g.connect(bus);
    for (const [type, det, lvl] of [
      ['triangle', 0, 1],
      ['sawtooth', 4, 0.35],
    ] as Array<[OscillatorType, number, number]>) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = det;
      const og = ctx.createGain();
      og.gain.value = lvl;
      o.connect(og);
      og.connect(lp);
      o.start(t);
      o.stop(t + Math.max(0.35, dur) + 0.05);
    }
  }

  private recorder(t: number, f: number, dur: number, vel: number, bus: AudioNode): void {
    const ctx = this.a.ctx!;
    const g = this.env(t, 0.04, Math.max(0.01, dur - 0.1), 0.09, vel, bus);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = f * 2;
    const o2g = ctx.createGain();
    o2g.gain.value = 0.12;
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.2;
    const vg = ctx.createGain();
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(f * 0.008, t + Math.min(0.3, dur));
    vib.connect(vg);
    vg.connect(o.frequency);
    vg.connect(o2.frequency);
    o.connect(g);
    o2.connect(o2g);
    o2g.connect(g);
    const end = t + dur + 0.15;
    for (const n of [o, o2, vib]) {
      n.start(t);
      n.stop(end);
    }
  }

  private bell(t: number, f: number, dur: number, vel: number, bus: AudioNode): void {
    for (const [mul, lvl, dec] of [
      [1, 1, 1],
      [2.76, 0.35, 0.5],
      [5.4, 0.12, 0.25],
    ]) {
      const ctx = this.a.ctx!;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * mul;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vel * lvl, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.6, dur) * dec + 0.2);
      o.connect(g);
      g.connect(bus);
      o.start(t);
      o.stop(t + Math.max(0.6, dur) + 0.3);
    }
  }

  private drone(t: number, f: number, dur: number, vel: number, bus: AudioNode): void {
    const ctx = this.a.ctx!;
    const g = this.env(t, 0.25, Math.max(0.01, dur - 0.4), 0.3, vel, bus);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    lp.connect(g);
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
  }

  private pad(t: number, freqs: number[], dur: number, vel: number, bus: AudioNode): void {
    const ctx = this.a.ctx!;
    const g = this.env(t, 0.9, Math.max(0.01, dur - 1.6), 0.9, vel, bus);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    lp.connect(g);
    for (const f of freqs) {
      for (const det of [-8, 8]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det;
        o.connect(lp);
        o.start(t);
        o.stop(t + dur + 0.2);
      }
    }
  }

  private drum(t: number, vel: number, bus: AudioNode): void {
    this.a.osc('sine', 120, t, 0.22, bus, vel, 0.002, 48);
    this.a.noiseBurst('pink', t, 0.06, bus, vel * 0.3, { type: 'lowpass', freq: 900 });
  }

  private tamb(t: number, vel: number, bus: AudioNode): void {
    for (let i = 0; i < 3; i++) this.a.noiseBurst('white', t + i * 0.012, 0.05, bus, vel, { type: 'highpass', freq: 7000 });
  }

  private taiko(t: number, vel: number, bus: AudioNode): void {
    this.a.osc('sine', 85, t, 0.45, bus, vel, 0.002, 40);
    this.a.noiseBurst('brown', t, 0.12, bus, vel * 0.6, { type: 'lowpass', freq: 400 });
  }

  private strings(t: number, f: number, dur: number, vel: number, bus: AudioNode): void {
    const ctx = this.a.ctx!;
    const g = ctx.createGain();
    g.gain.value = 0;
    const env = this.env(t, 0.3, Math.max(0.01, dur - 0.5), 0.3, vel, bus);
    g.connect(env);
    const trem = ctx.createOscillator();
    trem.frequency.value = 11;
    const tg = ctx.createGain();
    tg.gain.value = 0.5;
    const dc = ctx.createConstantSource();
    dc.offset.value = 0.5;
    trem.connect(tg);
    tg.connect(g.gain);
    dc.connect(g.gain);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    lp.connect(g);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.connect(lp);
    for (const n of [o, trem, dc]) {
      n.start(t);
      n.stop(t + dur + 0.1);
    }
  }
}
