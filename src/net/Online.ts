// Online play for the app: opening a room (this computer becomes the
// server), joining one by its code, and the room's badge, chat and markers.

import type { App } from '../App';
import type { GameContext } from '../core/GameContext';
import { t } from '../core/i18n';
import { h } from '../ui/UIRoot';
import { OnlinePanel } from '../ui/OnlinePanel';
import { NetHud } from '../ui/NetHud';
import { HostRoom, NetError, joinRoom, type NetErrorCode } from './Transport';
import { HostSync, cleanName } from './HostSync';
import { GuestSync } from './GuestSync';
import type { NetPlayer } from './NetSession';

const NAME_KEY = 'witchs-brew:name';

export class Online {
  host: HostSync | null = null;
  guest: GuestSync | null = null;
  readonly panel: OnlinePanel;
  readonly hud: NetHud;

  constructor(
    private readonly ctx: GameContext,
    private readonly app: App,
  ) {
    const ui = app.game.ui;
    this.panel = new OnlinePanel(ctx, {
      playing: () => app.game.playing,
      host: () => this.openRoom(),
      closeRoom: () => this.closeRoom(),
      join: (code) => this.join(code),
      leave: () => this.leave(),
      getName: () => this.name,
      setName: (n) => this.setName(n),
    });
    ui.registerPanel('online', this.panel);
    this.hud = new NetHud(ctx, ui.root);
    this.hud.onSend = (text) => this.say(text);
    app.game.addSystem({ always: true, update: (dt) => this.frame(dt) });
  }

  get name(): string {
    try {
      return localStorage.getItem(NAME_KEY) ?? '';
    } catch {
      return '';
    }
  }

  setName(n: string): void {
    try {
      localStorage.setItem(NAME_KEY, cleanName(n));
    } catch {
      /* ignore */
    }
  }

  private displayName(): string {
    return cleanName(this.name) || t('net.namePlaceholder');
  }

  /** Open a room for the game in progress (or the saved one, from the title). */
  async openRoom(): Promise<void> {
    if (this.ctx.net.online || this.host) return;
    const room = await HostRoom.open();
    if (this.ctx.net.online) {
      room.close();
      return;
    }
    if (!this.app.game.playing) this.app.startFromTitle();
    const host = new HostSync(this.ctx, this.app, room, this.displayName());
    this.host = host;
    this.app.game.net = host;
    host.onPlayers = () => this.panel.render();
    host.onChat = (from, text) => this.hud.addChat(from, text);
    host.onMarkers = (mk) => this.hud.setMarkers(mk);
    this.hud.show();
    this.ctx.bus.emit('toast', { text: t('net.open', { code: room.code }), kind: 'good' });
  }

  closeRoom(): void {
    if (!this.host) return;
    this.host.close();
    this.host = null;
    this.app.game.net = null;
    this.hud.hide();
  }

  /** Join a room from the title screen: resolves once the host's shop is here. */
  async join(code: string): Promise<void> {
    if (this.ctx.net.online || this.app.game.playing || this.guest) return;
    const { peer, link } = await joinRoom(code);
    const g = new GuestSync(this.ctx, this.app, peer, link, this.displayName());
    this.guest = g;
    this.app.game.net = g;
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new NetError('timeout')), 25000);
        g.onWelcome = () => {
          clearTimeout(timer);
          resolve();
        };
        g.onEnd = (why) => {
          clearTimeout(timer);
          reject(new NetError(why));
        };
      });
    } catch (err) {
      g.leave();
      this.guest = null;
      this.app.game.net = null;
      // Welcomed and then dropped at once: the shop here is a copy now.
      if (this.ctx.net.isGuest) location.reload();
      throw err;
    }
    g.onEnd = (why) => this.ended(why);
    g.onPlayers = (list, before) => this.playersChanged(list, before);
    g.onChat = (from, text) => this.hud.addChat(from, text);
    g.onMarkers = (mk) => this.hud.setMarkers(mk);
    this.app.startGuest();
    this.hud.show();
  }

  private playersChanged(list: NetPlayer[], before: NetPlayer[]): void {
    const self = this.ctx.net.selfId;
    for (const p of list) if (p.id !== self && !before.some((b) => b.id === p.id)) this.ctx.bus.emit('toast', { text: t('net.joined', { name: p.name }), kind: 'info' });
    for (const p of before) if (!list.some((b) => b.id === p.id)) this.ctx.bus.emit('toast', { text: t('net.left', { name: p.name }), kind: 'info' });
    this.panel.render();
  }

  /** The room is gone (host left, connection lost): back to the title. */
  private ended(why: NetErrorCode): void {
    this.hud.hide();
    const o = h('div', 'wb-overlay wb-interactive wb-net-ended');
    const card = h('div', 'wb-panel wb-frame-dark wb-net-endcard');
    card.append(h('h2', undefined, t('net.ended')), h('p', undefined, t(`net.err.${why}`)));
    const b = h('button', 'wb-btn primary', t('net.backToTitle'));
    b.addEventListener('click', () => location.reload());
    card.appendChild(b);
    o.appendChild(card);
    this.app.game.ui.root.appendChild(o);
  }

  /** Leave the room: guests go back to their own game, the host closes it. */
  leave(): void {
    if (this.guest) {
      this.guest.leave();
      location.reload();
      return;
    }
    this.closeRoom();
  }

  say(text: string): void {
    if (this.host) this.host.chat(0, text);
    else if (this.guest) this.guest.chat(text);
  }

  private frame(dt: number): void {
    if (this.guest) this.hud.ping = this.guest.rtt;
    this.hud.update(dt);
  }
}
