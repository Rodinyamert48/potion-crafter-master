// One mini game per gathering region.

import type { RegionId } from '../../data/regions';
import type { MiniGame, MiniGameOptions } from './MiniGame';
import { ForestGame } from './ForestGame';
import { CaveGame } from './CaveGame';
import { SwampGame } from './SwampGame';
import { ValleyGame } from './ValleyGame';
import { ShrineGame } from './ShrineGame';

export type { MiniGame, MiniGameOptions, GatherEvents, PetId } from './MiniGame';

export function createMiniGame(region: RegionId, o: MiniGameOptions): MiniGame {
  switch (region) {
    case 'cave':
      return new CaveGame(o);
    case 'swamp':
      return new SwampGame(o);
    case 'valley':
      return new ValleyGame(o);
    case 'shrine':
      return new ShrineGame(o);
    default:
      return new ForestGame(o);
  }
}
