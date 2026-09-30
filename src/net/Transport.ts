// Rooms over WebRTC (PeerJS). The host registers a peer id made from the
// room code on a public signalling server; guests connect to it with the
// code. After that handshake everything travels peer to peer – the host's
// computer is the server. Messages are JSON strings; big ones (the first
// snapshot, sprite sheets) are cut into chunks.

import Peer, { type DataConnection, type PeerOptions } from 'peerjs';

/** Bumped whenever host and guest builds could no longer understand each other. */
export const PROTOCOL = 1;
export const CODE_LENGTH = 6;
const PREFIX = 'witchs-brew-room-';
// No 0/O or 1/I: codes are read aloud and typed by hand.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// Small enough for every browser's data channel message limit.
const CHUNK = 16000;

export type NetErrorCode = 'notFound' | 'network' | 'server' | 'timeout' | 'browser' | 'closed' | 'version' | 'full';

export class NetError extends Error {
  constructor(readonly code: NetErrorCode) {
    super(code);
  }
}

export function randomCode(): string {
  let s = '';
  const a = new Uint32Array(CODE_LENGTH);
  crypto.getRandomValues(a);
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_CHARS[a[i] % CODE_CHARS.length];
  return s;
}

/** What someone typed → a code (upper case, no spaces or dashes). */
export function cleanCode(s: string): string {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CODE_LENGTH);
}

// Public STUN servers find each side's address; the open relay (TURN) helps
// when both are behind strict routers. Everything is free to use.
const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:global.stun.twilio.com:3478' },
  {
    urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

/** The public PeerJS cloud – or `?peer=host:port` (e.g. a local test server). */
function peerOptions(): PeerOptions {
  const opts: PeerOptions = { debug: 0, config: { iceServers: ICE_SERVERS } };
  let custom: string | null = null;
  try {
    custom = new URLSearchParams(location.search).get('peer') ?? localStorage.getItem('witchs-brew:peer');
  } catch {
    /* ignore */
  }
  if (custom) {
    const m = /^([^:/]+)(?::(\d+))?(\/.*)?$/.exec(custom);
    if (m) {
      opts.host = m[1];
      opts.port = m[2] ? Number(m[2]) : 443;
      opts.path = m[3] ?? '/';
      opts.secure = opts.port === 443;
      // Local tests need no relay.
      if (m[1] === 'localhost' || m[1] === '127.0.0.1') opts.config = { iceServers: [] };
    }
  }
  return opts;
}

function mapError(type: string): NetErrorCode {
  if (type === 'peer-unavailable') return 'notFound';
  if (type === 'browser-incompatible') return 'browser';
  if (type === 'network' || type === 'socket-error' || type === 'socket-closed' || type === 'disconnected') return 'network';
  return 'server';
}

// ---------------------------------------------------------------------------
// A connection with message framing
// ---------------------------------------------------------------------------

export class Link {
  private readonly handlers: Array<(msg: Record<string, unknown>) => void> = [];
  private readonly closeHandlers: Array<() => void> = [];
  private readonly parts = new Map<string, { got: number; list: string[] }>();
  private nextChunk = 1;
  open = true;
  /** Bytes sent / received (for the connection readout). */
  sent = 0;
  received = 0;

  constructor(readonly conn: DataConnection) {
    conn.on('data', (d) => this.receive(d));
    conn.on('close', () => this.closed());
    conn.on('error', () => this.closed());
  }

  send(msg: unknown): void {
    if (!this.open) return;
    const s = JSON.stringify(msg);
    this.sent += s.length;
    try {
      if (s.length <= CHUNK) this.conn.send(s);
      else {
        const id = this.nextChunk++;
        const n = Math.ceil(s.length / CHUNK);
        for (let i = 0; i < n; i++) this.conn.send(`~${id},${i},${n}|${s.slice(i * CHUNK, (i + 1) * CHUNK)}`);
      }
    } catch (err) {
      console.warn('[net] send failed', err);
    }
  }

  private receive(d: unknown): void {
    if (typeof d !== 'string') return;
    let s = d;
    this.received += s.length;
    if (s.charCodeAt(0) === 126 /* ~ */) {
      const bar = s.indexOf('|');
      const [id, is, ns] = s.slice(1, bar).split(',');
      const n = Number(ns);
      let p = this.parts.get(id);
      if (!p) this.parts.set(id, (p = { got: 0, list: new Array<string>(n) }));
      const i = Number(is);
      if (p.list[i] === undefined) p.got++;
      p.list[i] = s.slice(bar + 1);
      if (p.got < n) return;
      this.parts.delete(id);
      s = p.list.join('');
    }
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(s) as Record<string, unknown>;
    } catch {
      return;
    }
    for (const h of this.handlers) {
      try {
        h(msg);
      } catch (err) {
        console.error('[net] message handler failed', msg.t, err);
      }
    }
  }

  onMessage(fn: (msg: Record<string, unknown>) => void): void {
    this.handlers.push(fn);
  }

  onClose(fn: () => void): void {
    this.closeHandlers.push(fn);
  }

  private closed(): void {
    if (!this.open) return;
    this.open = false;
    for (const fn of this.closeHandlers) fn();
  }

  close(): void {
    try {
      this.conn.close();
    } catch {
      /* ignore */
    }
    this.closed();
  }
}

// ---------------------------------------------------------------------------
// Host: open a room
// ---------------------------------------------------------------------------

export class HostRoom {
  onConnection: ((link: Link) => void) | null = null;
  private closedByUs = false;

  private constructor(
    readonly peer: Peer,
    readonly code: string,
  ) {
    peer.on('connection', (conn) => {
      conn.on('open', () => this.onConnection?.(new Link(conn)));
    });
    // Lost the signalling server: stay reachable for new guests.
    peer.on('disconnected', () => {
      if (!this.closedByUs && !peer.destroyed) {
        try {
          peer.reconnect();
        } catch {
          /* ignore */
        }
      }
    });
  }

  static async open(): Promise<HostRoom> {
    let lastErr: NetErrorCode = 'server';
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomCode();
      const peer = new Peer(PREFIX + code, peerOptions());
      // 'taken': that code is in use – just pick another one.
      const res = await new Promise<'ok' | 'taken' | 'fail'>((resolve) => {
        const timer = setTimeout(() => {
          lastErr = 'timeout';
          resolve('fail');
        }, 15000);
        peer.once('open', () => {
          clearTimeout(timer);
          resolve('ok');
        });
        peer.once('error', (err) => {
          clearTimeout(timer);
          if (err.type === 'unavailable-id') resolve('taken');
          else {
            lastErr = mapError(err.type);
            resolve('fail');
          }
        });
      });
      if (res === 'ok') return new HostRoom(peer, code);
      peer.destroy();
      if (res === 'fail') break;
    }
    throw new NetError(lastErr);
  }

  close(): void {
    this.closedByUs = true;
    this.peer.destroy();
  }
}

// ---------------------------------------------------------------------------
// Guest: join a room by code
// ---------------------------------------------------------------------------

export async function joinRoom(code: string): Promise<{ peer: Peer; link: Link }> {
  const peer = new Peer(peerOptions());
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new NetError('timeout')), 15000);
      peer.once('open', () => {
        clearTimeout(timer);
        resolve();
      });
      peer.once('error', (err) => {
        clearTimeout(timer);
        reject(new NetError(mapError(err.type)));
      });
    });
    const conn = peer.connect(PREFIX + cleanCode(code), { reliable: true, serialization: 'raw' });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new NetError('timeout')), 20000);
      conn.once('open', () => {
        clearTimeout(timer);
        resolve();
      });
      peer.once('error', (err) => {
        clearTimeout(timer);
        reject(new NetError(mapError(err.type)));
      });
      conn.once('error', () => {
        clearTimeout(timer);
        reject(new NetError('network'));
      });
    });
    return { peer, link: new Link(conn) };
  } catch (err) {
    peer.destroy();
    throw err instanceof NetError ? err : new NetError('network');
  }
}
