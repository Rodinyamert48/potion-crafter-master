// The shop's other two residents: the little jar slime on the counter shelf
// and Master Mortimer's dog, a curly Lagotto Romagnolo who naps in his lap.
// Both can be renamed and recoloured (see ui/PetPanel).

export interface SlimeLook {
  name: string;
  color: string;
}

export interface DogLook {
  name: string;
  coat: string;
  collar: string;
}

export interface PetsState {
  slime: SlimeLook;
  dog: DogLook;
}

export interface Swatch {
  id: string;
  color: string;
  /** Second colour (patches on a dog's coat). */
  color2?: string;
}

export const SLIME_COLORS: Swatch[] = [
  { id: 'green', color: '#63c74d' },
  { id: 'blue', color: '#41a6f6' },
  { id: 'pink', color: '#f6757a' },
  { id: 'purple', color: '#b55088' },
  { id: 'gold', color: '#feae34' },
  { id: 'red', color: '#e43b44' },
  { id: 'shadow', color: '#5a4a7e' },
];

/** Real Lagotto Romagnolo coats: white, off-white, brown, roan, orange and
 *  white with brown or orange patches. */
export const DOG_COATS: Array<Swatch & { nose: string }> = [
  { id: 'white', color: '#eeeae0', nose: '#7a4a3a' },
  { id: 'offwhite', color: '#e2d4b8', nose: '#7a4a3a' },
  { id: 'brown', color: '#7a4a2e', nose: '#3e2418' },
  { id: 'roan', color: '#9c7e66', nose: '#4a2a1a' },
  { id: 'orange', color: '#d99a52', nose: '#7a4a3a' },
  { id: 'patchBrown', color: '#eeeae0', color2: '#7a4a2e', nose: '#4a2a1a' },
  { id: 'patchOrange', color: '#eeeae0', color2: '#d99a52', nose: '#7a4a3a' },
];

export const DOG_COLLARS: Swatch[] = [
  { id: 'red', color: '#e43b44' },
  { id: 'blue', color: '#0099db' },
  { id: 'green', color: '#3e8948' },
  { id: 'gold', color: '#feae34' },
  { id: 'purple', color: '#68386c' },
  { id: 'pink', color: '#f6757a' },
];

export const PET_NAME_MAX = 14;

export function defaultPets(): PetsState {
  return { slime: { name: 'Pıtırcık', color: 'green' }, dog: { name: 'Pamuk', coat: 'white', collar: 'red' } };
}

export function slimeColor(id: string): Swatch {
  return SLIME_COLORS.find((s) => s.id === id) ?? SLIME_COLORS[0];
}

export function dogCoat(id: string): (typeof DOG_COATS)[number] {
  return DOG_COATS.find((s) => s.id === id) ?? DOG_COATS[0];
}

export function dogCollar(id: string): Swatch {
  return DOG_COLLARS.find((s) => s.id === id) ?? DOG_COLLARS[0];
}
