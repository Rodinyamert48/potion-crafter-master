// The shared context handed to every system and entity. It is an interface
// of references (not a god object with logic) so modules stay decoupled and
// only type-import each other.

import type * as THREE from 'three';
import type { EventBus } from './EventBus';
import type { GameEvents } from './events';
import type { Input } from './Input';
import type { Settings } from './Settings';
import type { ThreeRenderer } from '../rendering/three/ThreeRenderer';
import type { PhysicsWorld } from '../physics/PhysicsTypes';
import type { PhysicsSync } from '../physics/PhysicsSync';
import type { VFX } from '../vfx/VFX';
import type { Debris } from '../vfx/Debris';
import type { AudioSystem } from '../audio/AudioSystem';
import type { Voice } from '../audio/Voice';
import type { World } from '../world/World';
import type { Interaction } from '../world/Interaction';
import type { CursorKind, HoverInfo } from '../world/Entity';
import type { GameState } from '../gameplay/GameState';
import type { Shop } from '../world/Shop';

/** What gameplay needs from the UI layer. */
export interface UIHooks {
  setCursor(kind: CursorKind): void;
  tooltip(info: HoverInfo | null, x?: number, y?: number): void;
  setHint(text: string | null): void;
  /** Speech bubble above a world position; returns an id to update/remove it. */
  say(anchor: THREE.Object3D, text: string, opts?: { name?: string; duration?: number; mood?: string; offsetY?: number }): number;
  removeBubble(id: number): void;
  /** Floating text (e.g. +12 gold) at a world position. */
  floatText(world: THREE.Vector3, text: string, color?: string): void;
  openPanel(panel: PanelName | null): void;
  isPanelOpen(panel: PanelName): boolean;
  readonly panelOpen: boolean;
}

export type PanelName =
  | 'book'
  | 'catalog'
  | 'inventory'
  | 'menu'
  | 'summary'
  | 'map'
  | 'cat'
  | 'merchant'
  | 'achievements'
  | 'pet'
  | 'admin'
  | 'door'
  | 'outpause'
  | 'minigame'
  | 'seeds';

/** Where the apprentice is: in the shop, roaming outside (PC) or in the garden. */
export type GameMode = 'shop' | 'outside' | 'garden';

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface GameContext {
  bus: EventBus<GameEvents>;
  input: Input;
  renderer: ThreeRenderer;
  scene: THREE.Scene;
  physics: PhysicsWorld;
  sync: PhysicsSync;
  vfx: VFX;
  debris: Debris;
  audio: AudioSystem;
  voice: Voice;
  world: World;
  interaction: Interaction;
  state: GameState;
  settings: Settings;
  ui: UIHooks;
  shop: Shop;
  shopBounds: Bounds;
  /** Seconds since the game started (real time). */
  time: number;
  /** Seconds of simulated game time elapsed (pauses with menus). */
  gameTime: number;
  paused: boolean;
  /** In the shop, outside (open world) or in the garden. */
  mode: GameMode;
  /** Fraction of a physics step left over at render time (for interpolation). */
  renderAlpha: number;
  /** Run a callback after `seconds` of (pausable) game time. */
  later(seconds: number, fn: () => void): void;
}
