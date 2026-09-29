// Master palette (based on the Endesga-32 pixel art palette) so textures,
// sprites, particles and UI all share one coherent colour language.

export const PAL = {
  rust: '#be4a2f',
  ember: '#d77643',
  cream: '#ead4aa',
  tan: '#e4a672',
  clay: '#b86f50',
  bark: '#733e39',
  plum: '#3e2731',
  crimson: '#a22633',
  red: '#e43b44',
  orange: '#f77622',
  amber: '#feae34',
  yellow: '#fee761',
  green: '#63c74d',
  moss: '#3e8948',
  forest: '#265c42',
  deepTeal: '#193c3e',
  deepBlue: '#124e89',
  blue: '#0099db',
  cyan: '#2ce8f5',
  white: '#ffffff',
  silver: '#c0cbdc',
  steel: '#8b9bb4',
  slate: '#5a6988',
  navy: '#3a4466',
  ink: '#262b44',
  night: '#181425',
  hotPink: '#ff0044',
  purple: '#68386c',
  magenta: '#b55088',
  pink: '#f6757a',
  skin: '#e8b796',
  skinDark: '#c28569',
} as const;

export type PaletteKey = keyof typeof PAL;

export const PALETTE_LIST: string[] = Object.values(PAL);

/** 32 colours for the retro mode, in the spirit of 16-bit fantasy RPGs:
 *  deep indigo shadows, menu blues, warm woods and golds, jewel tones. */
export const RETRO_PALETTE: string[] = [
  '#0b0a1f', '#1b1640', '#2c2466', '#3b3b8f', '#2a4fa8', '#4a7bd8', '#8fb8f0', '#f0f4ff',
  '#2b1a17', '#4d2c22', '#7a4630', '#a8683c', '#d49a5a', '#f0c888', '#ffd860', '#e0a020',
  '#5a1a3a', '#8c2a4a', '#c83c3c', '#f06858', '#6a2a8a', '#a050c0', '#e088e0', '#1a3a2a',
  '#2a6a3a', '#50a048', '#98d860', '#1e6a78', '#40b0c0', '#4a4a5e', '#8a8aa0', '#c8c8d8',
];

/** Outline colour for sprites and the post-process edge pass. */
export const OUTLINE = '#181425';
