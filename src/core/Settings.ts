// Player settings, stored separately from the save game so erasing progress
// keeps audio/graphics preferences.

import type { PixelPreset, Quality } from '../rendering/three/ThreeRenderer';

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  pixel: PixelPreset;
  quality: Quality;
  shake: boolean;
  retro: boolean;
}

const KEY = 'witchs-brew:settings';

function defaultQuality(): Quality {
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  return mobile ? 'low' : 'high';
}

export function loadSettings(): Settings {
  const defaults: Settings = { master: 0.8, music: 0.55, sfx: 0.85, pixel: 'normal', quality: defaultQuality(), shake: true, retro: false };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaults, ...(JSON.parse(raw) as Partial<Settings>) };
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
