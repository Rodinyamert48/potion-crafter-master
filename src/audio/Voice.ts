// "Animalese" style character voices: every few letters of dialogue become a
// short formant-filtered blip whose pitch follows the character's voice.

import type { AudioSystem } from './AudioSystem';

export interface VoiceDef {
  pitch: number;
  speed: number;
  wave: OscillatorType;
}

const VOWEL_FORMANTS: Record<string, number> = { a: 850, e: 600, i: 400, o: 500, u: 350, ı: 420, ö: 480, ü: 330 };

export class Voice {
  constructor(private readonly a: AudioSystem) {}

  /** Speak `text`; `chars` limits how many characters are voiced (typewriter sync). */
  babble(text: string, voice: VoiceDef, x = 0, volume = 1): number {
    const a = this.a;
    if (!a.ready) return 0;
    const ctx = a.ctx!;
    const out = a.output(a.panFor(x), 0.2);
    const letters = text.toLowerCase().replace(/[^a-zçğıöşü ]/g, '');
    const step = 0.065 / voice.speed;
    let t = a.now + 0.01;
    let count = 0;
    for (let i = 0; i < letters.length && count < 28; i += 2) {
      const ch = letters[i];
      if (ch === ' ') {
        t += step * 0.6;
        continue;
      }
      const vowel = [...letters.slice(i, i + 3)].find((c) => VOWEL_FORMANTS[c] !== undefined) ?? 'a';
      const base = 180 * voice.pitch * (0.9 + Math.random() * 0.25);
      const o = ctx.createOscillator();
      o.type = voice.wave;
      o.frequency.setValueAtTime(base, t);
      o.frequency.linearRampToValueAtTime(base * (0.92 + Math.random() * 0.16), t + step);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = VOWEL_FORMANTS[vowel] * (0.8 + voice.pitch * 0.25);
      f.Q.value = 3;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16 * volume, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + step * 0.95);
      o.connect(f);
      f.connect(g);
      g.connect(out);
      o.start(t);
      o.stop(t + step + 0.02);
      t += step;
      count++;
    }
    return t - a.now;
  }
}
