// Web Audio engine. Every sound in Witch's Brew is synthesized at runtime:
// SFX recipes build short-lived node graphs, loops are persistent graphs
// whose parameters follow gameplay (boil intensity, stir speed…), and a
// generated convolution reverb gives the small stone shop its room tone.

import { SFX, type SfxName, type SfxOptions } from './Sfx';
import { Music } from './Music';
import { clamp } from '../core/math';

export interface LoopHandle {
  set(level: number, param?: number): void;
  stop(): void;
}

export class AudioSystem {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfxBus!: GainNode;
  musicBus!: GainNode;
  ambienceBus!: GainNode;
  reverb!: ConvolverNode;
  reverbSend!: GainNode;
  noise!: { white: AudioBuffer; pink: AudioBuffer; brown: AudioBuffer };
  music: Music | null = null;
  private loops = new Map<string, LoopHandle>();
  private volumes = { master: 0.8, music: 0.55, sfx: 0.85 };
  /** World x of the listener (camera focus) for stereo panning. */
  listenerX = 0;
  private lastPlayed = new Map<string, number>();
  private unlocked = false;

  /** Must be called from a user gesture. */
  unlock(): void {
    if (this.unlocked) {
      void this.ctx?.resume();
      return;
    }
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.unlocked = true;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(comp);
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.ambienceBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.ambienceBus.connect(this.sfxBus);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(2.2, 2.6);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 1;
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(this.master);
    this.noise = {
      white: this.makeNoise('white'),
      pink: this.makeNoise('pink'),
      brown: this.makeNoise('brown'),
    };
    this.applyVolumes();
    this.music = new Music(this);
    void ctx.resume();
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  setVolumes(master: number, music: number, sfx: number): void {
    this.volumes = { master, music, sfx };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.volumes.music * 0.8, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }

  private makeNoise(kind: 'white' | 'pink' | 'brown'): AudioBuffer {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0,
      b6 = 0,
      last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else if (kind === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      } else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    return buf;
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // Early reflections of a small stone room, then a diffuse tail.
        const early = i < ctx.sampleRate * 0.04 && Math.random() < 0.02 ? 1 : 0;
        d[i] = ((Math.random() * 2 - 1) * Math.pow(1 - t, decay) + early * 0.6) * 0.5;
      }
    }
    return buf;
  }

  /** Stereo pan from a world x coordinate. */
  panFor(x: number | undefined): number {
    if (x === undefined) return 0;
    return clamp((x - this.listenerX) / 6, -0.85, 0.85);
  }

  /** Output node for one-shot sounds: panner → sfx bus (+ reverb send). */
  output(pan: number, reverb = 0.25, bus?: AudioNode): AudioNode {
    const ctx = this.ctx!;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(bus ?? this.sfxBus);
    if (reverb > 0) {
      const s = ctx.createGain();
      s.gain.value = reverb;
      p.connect(s);
      s.connect(this.reverbSend);
    }
    return p;
  }

  play(name: SfxName, opts: SfxOptions = {}): void {
    if (!this.ready) return;
    // Rate-limit identical sounds (physics can report many impacts per frame).
    const minGap = opts.minGap ?? 0.03;
    const last = this.lastPlayed.get(name) ?? -1;
    if (this.now - last < minGap) return;
    this.lastPlayed.set(name, this.now);
    try {
      SFX[name](this, opts);
    } catch (err) {
      console.warn('sfx failed', name, err);
    }
  }

  /** Persistent looping sound; created lazily and kept by key. */
  loop(key: string, factory: (a: AudioSystem) => LoopHandle): LoopHandle | null {
    if (!this.ready) return null;
    let l = this.loops.get(key);
    if (!l) {
      l = factory(this);
      this.loops.set(key, l);
    }
    return l;
  }

  stopLoop(key: string): void {
    const l = this.loops.get(key);
    if (l) {
      l.stop();
      this.loops.delete(key);
    }
  }

  // ---------------------------------------------------------------------
  // Small building blocks used by the SFX recipes
  // ---------------------------------------------------------------------

  osc(type: OscillatorType, freq: number, t: number, dur: number, out: AudioNode, gain = 0.3, attack = 0.005, freqEnd?: number): OscillatorNode {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  noiseBurst(
    kind: 'white' | 'pink' | 'brown',
    t: number,
    dur: number,
    out: AudioNode,
    gain = 0.3,
    filter?: { type: BiquadFilterType; freq: number; q?: number; freqEnd?: number },
    attack = 0.002,
  ): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise[kind];
    src.loop = true;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = src;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filter.type;
      f.frequency.setValueAtTime(filter.freq, t);
      if (filter.freqEnd) f.frequency.exponentialRampToValueAtTime(filter.freqEnd, t + dur);
      f.Q.value = filter.q ?? 1;
      src.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(out);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
    return src;
  }
}
