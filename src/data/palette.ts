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

/** 32 colours for the Dark Fantasy mode: near-black stone, cold steel
 *  shadows, dried blood and crimson, tarnished gold and candlelight, bone,
 *  grave moss and a little witch-fire violet and teal. */
export const RETRO_PALETTE: string[] = [
  '#060509', '#0f0c14', '#1a1520', '#26202c', '#37303b', '#4d4550', '#6b6168', '#8f8488',
  '#141a24', '#1f2a38', '#33445a', '#56708a', '#8aa2b4', '#c8d0d4', '#e8dcc0', '#fff4dc',
  '#2a0a0e', '#4a1016', '#761a20', '#a8282a', '#d8453a', '#3a2214', '#5e3a1e', '#8a5a2a',
  '#b8862e', '#e0b050', '#ffd98a', '#1a2a1a', '#3a5230', '#6e8a3c', '#4a2a5e', '#2a6a6a',
];

/** Outline colour for sprites and the post-process edge pass. */
export const OUTLINE = '#181425';
