// Online play: who we are in the room, and the flags that decide which side
// effects (sounds, particles, toasts, speech) travel over the network.
//
// The host runs the one true simulation; guests show a copy of it and send
// their pointer and keys. Guests' own copies of the stations and items
// animate themselves from the synced state, so the host keeps what those
// copies produce on their own "quiet" (not sent), and guests stay silent
// except for what the host sends, their own UI and those animations.

import type { Entity } from '../world/Entity';

export type NetRole = 'offline' | 'host' | 'guest';

export interface NetPlayer {
  id: number;
  name: string;
  color: string;
}

/** What the game loop asks of the online layer (see Game). */
export interface NetDriver {
  /** Host: remote players' hands (after the local player's). */
  updateHands?(dt: number): void;
  /** Host: remote grabs steering their bodies (before the physics step). */
  fixedHands?(dt: number): void;
  /** Every frame, paused or not. */
  update(dt: number): void;
}

export class NetSession {
  role: NetRole = 'offline';
  /** Room code (without the peer prefix). */
  code = '';
  selfId = 0;
  players: NetPlayer[] = [];
  /** >0 inside the game loop (side effects from DOM handlers – menus,
   *  buttons – stay on this screen). */
  sim = 0;
  /** Host: >0 while running code the guests also run on their copies. */
  quiet = 0;
  /** Host: the player a guest's command is being run for (its toasts and sounds go only there). */
  replyTo: number | null = null;
  /** Guest: >0 while side effects may happen here (host events, own animations, UI). */
  allow = 0;
  /** Guest: the host says this player's hand holds something. */
  remoteHolding = false;
  /** Guest: the local copy of a host entity id (set by the guest sync). */
  resolve: (hostId: number) => Entity | null = () => null;

  get online(): boolean {
    return this.role !== 'offline';
  }

  get isHost(): boolean {
    return this.role === 'host';
  }

  get isGuest(): boolean {
    return this.role === 'guest';
  }

  /** Run `fn` with side effects kept local (host) / allowed (guest). */
  local<T>(fn: () => T): T {
    this.quiet++;
    this.allow++;
    try {
      return fn();
    } finally {
      this.quiet--;
      this.allow--;
    }
  }

  playerName(id: number): string {
    return this.players.find((p) => p.id === id)?.name ?? '?';
  }
}

/** Colours for players' hands (the host is the first). */
export const PLAYER_COLORS = ['#fee761', '#2ce8f5', '#f77622', '#63c74d', '#b55088', '#e43b44'];
