// Top-level connection manager: owns every room, routes messages, runs the shared tick, cleans up empty rooms.
// Transport-independent: index.js plugs real WebSockets into connect()/message()/disconnect(); the tests plug in fakes.
import { Room } from './Room.js';
import { MAPS } from './maps.js';
import { DIFFS } from '../shared/config.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no look-alikes (0/O, 1/I)

export class Lobby {
  constructor({ log = console.log, now = () => Date.now(), maxRooms = 50 } = {}) {
    Object.assign(this, { log, now, maxRooms }); this.rooms = new Map(); this.conns = new Map(); this.nextId = 1;
  }
  genCode() { for (;;) { let c = ''; for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.random() * CODE_CHARS.length | 0]; if (!this.rooms.has(c)) return c; } }

  connect(send, close) {
    const conn = { id: 'c' + this.nextId++, send, close: close || (() => {}), room: null, pid: null, lastChat: 0, win: 0, winN: 0 };
    this.conns.set(conn.id, conn); send(JSON.stringify({ m: 'hello', v: 2, id: conn.id })); return conn;
  }
  err(conn, text, extra) { conn.send(JSON.stringify({ m: 'err', text, ...extra })); }

  message(conn, raw) {
    const t = this.now(); if (t - conn.win > 1000) { conn.win = t; conn.winN = 0; } if (++conn.winN > 240) return;   // flood guard: 240 msgs/s
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== 'object' || typeof msg.m !== 'string') return;
    switch (msg.m) {
      case 'create': {
        if (conn.room) return this.err(conn, 'You are already in a room.');
        if (this.rooms.size >= this.maxRooms) return this.err(conn, 'The server is full, try again later.');
        const code = this.genCode();
        const room = new Room(code, { log: (...a) => this.log(`[${code}]`, ...a), now: this.now, map: MAPS[msg.map] ? msg.map : 'yard', diff: DIFFS[msg.diff] ? msg.diff : 'endless' });
        this.rooms.set(code, room); room.join(conn, msg.name); this.log(`room ${code} created (${this.rooms.size} open)`); return;
      }
      case 'join': {
        if (conn.room) return this.err(conn, 'You are already in a room.');
        const room = this.rooms.get(String(msg.code ?? '').toUpperCase().trim());
        if (!room) return this.err(conn, 'No room with that code.');
        const r = room.join(conn, msg.name); if (r.err) this.err(conn, r.err); return;
      }
      case 'rejoin': {
        if (conn.room) return;
        const room = this.rooms.get(String(msg.code ?? '').toUpperCase());
        const r = room ? room.rejoin(conn, String(msg.token ?? '')) : { err: 'That room is gone.' };
        if (r.err) this.err(conn, r.err, { fatal: 1 }); return;
      }
      case 'p': conn.send(JSON.stringify({ m: 'pong', c: msg.c })); return;       // latency probe
      default:
        if (!conn.room) return;
        if (msg.m === 'chat') { if (t - conn.lastChat < 400) return; conn.lastChat = t; }   // chat rate limit
        conn.room.handle(conn, msg);
        if (msg.m === 'leave' || msg.m === 'kick') this.sweep();
    }
  }
  disconnect(conn) { this.conns.delete(conn.id); if (conn.room) conn.room.removeConn(conn, false); this.sweep(); }
  sweep() { for (const [code, r] of this.rooms) if (r.isEmpty()) { this.rooms.delete(code); this.log(`room ${code} closed (${this.rooms.size} open)`); } }
  tick() { for (const r of this.rooms.values()) r.tick(); this.sweep(); }

  // ---- admin console helpers
  describe() { return [...this.rooms.values()].map(r => `${r.code} ${r.phase} ${r.map}/${r.diff} ` + [...r.members.values()].map(m => `${m.name}${m.bot ? '(bot)' : `[${m.conn ? m.conn.id : 'offline'}]`}${m.pid === r.host ? '*' : ''}`).join(', ')); }
  kick(id) { const c = this.conns.get(id); if (!c) return false; c.close('kicked'); return true; }
  restartRoom(code) { const r = this.rooms.get(String(code).toUpperCase()); if (!r || r.phase !== 'game') return false; r.start(); return true; }
}
