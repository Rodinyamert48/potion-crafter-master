// The shop cat's look: a chubby British Shorthair called Duman by default.
// The player can rename it and pick its coat and eye colour.

export interface CatLook {
  name: string;
  fur: string;
  eyes: string;
}

export interface CatFur {
  id: string;
  /** Base coat colour; shades are derived from it. */
  color: string;
  /** Nose leather. */
  nose: string;
}

export interface CatEyes {
  id: string;
  left: string;
  right: string;
}

export const CAT_FURS: CatFur[] = [
  { id: 'blue', color: '#8c95a8', nose: '#5d6478' },
  { id: 'black', color: '#34343f', nose: '#22222b' },
  { id: 'white', color: '#ece8df', nose: '#e59aa4' },
  { id: 'cream', color: '#e8c793', nose: '#d98b86' },
  { id: 'ginger', color: '#dd8638', nose: '#c9665a' },
];

export const CAT_EYES: CatEyes[] = [
  { id: 'copper', left: '#ec8a2a', right: '#ec8a2a' },
  { id: 'gold', left: '#f7d64a', right: '#f7d64a' },
  { id: 'green', left: '#6ccf4f', right: '#6ccf4f' },
  { id: 'blue', left: '#5aaeff', right: '#5aaeff' },
  { id: 'odd', left: '#5aaeff', right: '#ec8a2a' },
];

export const CAT_NAME_MAX = 14;

export function defaultCat(): CatLook {
  return { name: 'Duman', fur: 'blue', eyes: 'copper' };
}

export function catFur(id: string): CatFur {
  return CAT_FURS.find((f) => f.id === id) ?? CAT_FURS[0];
}

export function catEyes(id: string): CatEyes {
  return CAT_EYES.find((e) => e.id === id) ?? CAT_EYES[0];
}
