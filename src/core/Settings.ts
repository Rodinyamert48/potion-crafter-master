// Player settings, stored separately from the save game so erasing progress
// keeps audio/graphics preferences.

import type { PixelPreset, Quality } from '../rendering/three/ThreeRenderer';

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  pixel: PixelPreset;
  /** 'auto' starts high and steps down if the frame rate suffers. */
  quality: Quality | 'auto';
  shake: boolean;
  retro: boolean;
}

const KEY = 'witchs-brew:settings';

/** Everyone starts on automatic; phones start it lower (see Game). */
function defaultQuality(): Quality | 'auto' {
  return 'auto';
}

export function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
}

export function loadSettings(): Settings {
  const defaults: Settings = { master: 0.8, music: 0.55, sfx: 0.85, pixel: 'normal', quality: defaultQuality(), shake: true, retro: false };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = { ...defaults, ...(JSON.parse(raw) as Partial<Settings>) };
      // Low / Medium are no longer offered in the menu (the automatic mode
      // still uses them); older saves fall back to automatic.
      if (s.quality === 'low' || s.quality === 'medium') s.quality = 'auto';
      return s;
    }
  } catch {
    /* ignore */
  }
  return defaults;
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
