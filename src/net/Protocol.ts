// Messages between host and guests. Short keys keep the 30 Hz snapshots
// small; everything is plain JSON.

import type { HoverInfo, CursorKind } from '../world/Entity';
import type { NetPlayer } from './NetSession';
import type { CustomerRequest } from '../data/types';

/** Where a guest looks and points: CSS px in a w×h viewport, camera pose. */
export interface InputState {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Camera: position (3), quaternion (4), fov, aspect. */
  c: number[];
  /** Guest clock (ms) when sampled – keeps swipe speeds right. */
  ts: number;
  /** 1: touch or pen (long presses, bigger hints). */
  pt?: number;
  /** 1: the pointer is off the shop (over a menu, outside the window). */
  o?: number;
}

// ---------------------------------------------------------------------------
// Guest → host
// ---------------------------------------------------------------------------

export type GuestMsg =
  | { t: 'hello'; v: number; name: string }
  | { t: 'in'; s: InputState }
  /** Pointer pressed (0 left, 2 right) on host entity `e`. */
  | { t: 'dn'; b: number; e: number | null; s: InputState }
  | { t: 'up'; b: number; s: InputState }
  | { t: 'kd'; c: string }
  | { t: 'ku'; c: string }
  | { t: 'wh'; d: number }
  /** A shop order from a menu (catalog, merchant, King…). */
  | { t: 'cmd'; c: string; a: unknown[] }
  | { t: 'chat'; x: string }
  | { t: 'ping'; ts: number };

// ---------------------------------------------------------------------------
// Host → guest
// ---------------------------------------------------------------------------

/** One sprite of a puppet: sheet, anim, restart serial, facing, hop, squash,
 *  opacity, visible, local x/y/z of its root, shadow visible, scale, root
 *  scale, emissive colour, emissive intensity. */
export type SpriteState = [number, string, number, number, number, number, number, number, number, number, number, number, number, number, string, number];

export interface PuppetState {
  /** Whole puppet visible. */
  v: number;
  /** Uniform scale of the puppet. */
  sc: number;
  s: SpriteState[];
}

export interface SpawnRec {
  id: number;
  /** 'ingredient' | 'flask' | 'log' | 'puppet' */
  k: string;
  /** Constructor data (items). */
  d?: unknown;
  /** Transform: host id, x, y, z, qx, qy, qz, qw (as in TickMsg.tf). */
  tf: number[];
  /** Current net state (items). */
  st?: unknown;
  pu?: PuppetState;
  hv?: HoverInfo | null;
  cu?: CursorKind;
  /** Can be pointed at (puppets). */
  it?: number;
}

export interface SheetMsg {
  id: number;
  url: string;
  fw: number;
  fh: number;
  cols: number;
  rows: number;
  anims: Record<string, { frames: number[]; fps: number; loop: boolean }>;
  py: number;
}

/** The HUD bits only the host knows. */
export interface HudInfo {
  /** Customer at the counter: name, request, phase, patience left (0…1), endless patience, uid. */
  c: { n: string; r: CustomerRequest; ph: string; pt: number; inf: number; u: number } | null;
  /** Next visitor's hour (−1: none). */
  nv: number;
  /** Brew guide: recipe id, known, ready, tips. */
  g: { id: string; k: number; rd: number; tips: string[] } | null;
  /** The mentor's tutorial card. */
  tu: string | null;
  /** The wandering merchant's stall is up. */
  ms: number;
  /** The day's summary is showing. */
  sm: number;
}

/** This guest's own hand as the host sees it. */
export interface HandInfo {
  /** Holding something (grab active). */
  h: number;
  cu: CursorKind;
  hint: string | null;
}

/** Side effects: [type, …args] (see HostSync / GuestSync). */
export type NetEvent = unknown[];

export interface TickMsg {
  t: 'tick';
  /** Clock. */
  hr: number;
  sp?: SpawnRec[];
  rm?: number[];
  /** Newly named things both sides build: [host id, key]. */
  sk?: Array<[number, string]>;
  tf?: number[][];
  es?: Array<[number, unknown]>;
  pp?: Array<[number, PuppetState]>;
  /** Puppets' hover card, cursor and whether they can be pointed at. */
  ph?: Array<[number, HoverInfo | null, CursorKind, number]>;
  gs?: Record<string, unknown>;
  hud?: HudInfo;
  ev?: NetEvent[];
  hand?: HandInfo;
  /** Hand markers: [player id, x, y, z, holding]. */
  mk?: number[][];
}

export interface WelcomeMsg {
  t: 'welcome';
  you: number;
  code: string;
  players: NetPlayer[];
  statics: Array<[number, string]>;
  state: Record<string, unknown>;
  hr: number;
  sheets: SheetMsg[];
  spawn: SpawnRec[];
  es: Array<[number, unknown]>;
  tf: number[][];
  hud: HudInfo;
}

export type HostMsg =
  | WelcomeMsg
  | TickMsg
  | { t: 'reject'; r: string }
  | ({ t: 'sheet' } & SheetMsg)
  | { t: 'players'; list: NetPlayer[] }
  | { t: 'chat'; from: number; x: string }
  | { t: 'panel'; p: string }
  | { t: 'pong'; ts: number }
  | { t: 'bye'; r: string };

/** Round for the wire. */
export const q3 = (v: number): number => Math.round(v * 1000) / 1000;
export const q4 = (v: number): number => Math.round(v * 10000) / 10000;
