// One game room: lobby (members, ready flags, host, map/difficulty, chat) and, once started, the authoritative simulation.
// Transport-independent: a "conn" is any object with send(string). Server ticks every room from one 30 Hz timer (see Lobby.tick).
import crypto from 'crypto';
import { CFG, DIFFS } from '../shared/config.js';
import { MAPS } from './maps.js';
import { setMap, mkState, buildAdj, newPlayer, stepPlayer, stepWorld, sanitizeInput, snapshot, addChat, addPing } from '../shared/sim.js';
import { botInput, newBrain } from '../shared/bot.js';

export const MAX_PLAYERS = 4;       // humans + bots
export const GRACE_MS = 60_000;     // how long a disconnected player's slot is held mid-game
export const HOLD_MS = 20_000;      // after a game starts the sim waits (up to this long) for every human to press CLICK TO PLAY
const IDLE = p => ({ f: 0, r: 0, j: false, c: false, s: false, yaw: p.last.yaw, pitch: p.last.pitch, fire: false, rl: false, sw: false, use: false, h: false, ft: 0 });
export const cleanName = (s, fallback) => String(s ?? '').replace(/[^\w \-.]/g, '').trim().slice(0, 16) || fallback;

export class Room {
  constructor(code, { log = () => {}, now = () => Date.now(), map = 'yard', diff = 'endless' } = {}) {
    Object.assign(this, { code, log, now, map, diff, phase: 'lobby', members: new Map(), host: null, st: null, n: 0, chat: [], cn: 0, nextPid: 1, nextBot: 1 });
  }
  get size() { return this.members.size; }
  humans() { return [...this.members.values()].filter(m => !m.bot); }
  isEmpty() { return this.humans().length === 0; }
  send(conn, o) { if (conn) conn.send(JSON.stringify(o)); }

  // ---------------------------------------------------------------- membership
  join(conn, name) {
    if (this.phase !== 'lobby') return { err: 'That game has already started.' };
    if (this.size >= MAX_PLAYERS) return { err: 'That room is full.' };
    const pid = 'p' + this.nextPid++;
    const m = { pid, name: cleanName(name, 'Player ' + pid.slice(1)), token: crypto.randomBytes(8).toString('hex'), ready: false, bot: false, conn, discAt: null, brain: null };
    this.members.set(pid, m); conn.room = this; conn.pid = pid;
    if (!this.host) this.host = pid;
    this.send(conn, { m: 'joined', code: this.code, pid, token: m.token });
    this.broadcastRoom(); this.log(`${m.name} (${pid}) joined, ${this.size}/${MAX_PLAYERS}`);
    return { ok: 1 };
  }
  /** Reattach a dropped player (or a refreshed tab) to their old slot using the token handed out at join. */
  rejoin(conn, token) {
    const m = [...this.members.values()].find(x => !x.bot && x.token === token);
    if (!m) return { err: 'Your slot has expired.' };
    if (m.conn && m.conn !== conn) { const old = m.conn; this.send(old, { m: 'closed', reason: 'You signed in from another tab.' }); old.room = null; old.pid = null; }
    m.conn = conn; m.discAt = null; conn.room = this; conn.pid = m.pid;
    this.send(conn, { m: 'joined', code: this.code, pid: m.pid, token: m.token });
    if (this.phase === 'game') { const p = this.st.players[m.pid]; if (p) p.online = true; this.send(conn, { m: 'start', map: this.map, diff: this.diff, pid: m.pid }); }
    else this.broadcastRoom();
    this.log(`${m.name} (${m.pid}) reconnected`);
    return { ok: 1 };
  }
  /** A socket went away. In the lobby (or if the player chose to leave) the slot is freed; mid-game it is held for GRACE_MS. */
  removeConn(conn, voluntary) {
    const m = this.members.get(conn.pid); conn.room = null; conn.pid = null;
    if (!m || m.conn !== conn) return;
    if (this.phase === 'lobby' || voluntary) { this.dropMember(m); return; }
    m.conn = null; m.discAt = this.now();
    const p = this.st.players[m.pid]; if (p) { p.online = false; p.q.length = 0; }
    this.log(`${m.name} (${m.pid}) disconnected, holding the slot for ${GRACE_MS / 1000}s`);
  }
  dropMember(m) {
    this.members.delete(m.pid); if (this.st) delete this.st.players[m.pid];
    if (m.conn) { m.conn.room = null; m.conn.pid = null; }
    if (this.host === m.pid) { const h = this.humans()[0]; this.host = h ? h.pid : null; if (h) this.log(`${h.name} is now the host`); }
    this.log(`${m.name} (${m.pid}) left, ${this.size}/${MAX_PLAYERS}`);
    if (this.phase === 'lobby') this.broadcastRoom();
  }

  // ---------------------------------------------------------------- messages from a joined connection
  handle(conn, msg) {
    const m = this.members.get(conn.pid); if (!m) return;
    const host = this.host === m.pid, lobby = this.phase === 'lobby', game = this.phase === 'game';
    const err = text => this.send(conn, { m: 'err', text });
    switch (msg.m) {
      case 'i': { if (!game) return; const p = this.st.players[m.pid]; if (p && p.q.length < 6) p.q.push(sanitizeInput(msg)); return; }  // bounded queue: a flooding client gets no extra simulation
      case 'go': m.go = true; return;                                                   // this player has clicked in; the sim starts when all have (or HOLD_MS passes)
      case 'ready': if (lobby) { m.ready = !!msg.v; this.broadcastRoom(); } return;
      case 'config': if (host && lobby) { if (MAPS[msg.map]) this.map = msg.map; if (DIFFS[msg.diff]) this.diff = msg.diff; this.broadcastRoom(); } return;
      case 'addbot': {
        if (!host || !lobby) return; if (this.size >= MAX_PLAYERS) return err('The room is full.');
        const pid = 'b' + this.nextPid++; this.members.set(pid, { pid, name: 'BOT ' + this.nextBot++, token: null, ready: true, bot: true, conn: null, discAt: null, brain: newBrain() });
        this.broadcastRoom(); return;
      }
      case 'rmbot': { if (!host || !lobby) return; const b = [...this.members.values()].filter(x => x.bot).pop(); if (b) { this.members.delete(b.pid); this.broadcastRoom(); } return; }
      case 'kick': {
        if (!host || !lobby) return; const t = this.members.get(msg.pid); if (!t || t === m) return;
        if (t.conn) this.send(t.conn, { m: 'closed', reason: 'The host removed you from the room.' });
        this.dropMember(t); return;
      }
      case 'start': {
        if (!host || !lobby) return;
        const waiting = this.humans().filter(x => x.pid !== this.host && !x.ready).length;
        if (waiting) return err(`Waiting for ${waiting} player${waiting > 1 ? 's' : ''} to ready up.`);
        this.start(); return;
      }
      case 'chat': {
        const text = String(msg.text ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 120); if (!text) return;
        if (lobby) { this.chat.push({ n: ++this.cn, pid: m.pid, name: m.name, t: text }); if (this.chat.length > 30) this.chat.shift(); this.broadcastRoom(); }
        else if (game) addChat(this.st, this.st.players[m.pid] || { id: m.pid, name: m.name }, text);
        return;
      }
      case 'ping': { if (!game) return; const p = this.st.players[m.pid]; if (p && p.hp > 0) { setMap(this.st.map); addPing(this.st, p); } return; }
      case 'restart': if (host && game && this.st.over) this.start(); return;           // rematch: same members, map and difficulty
      case 'tolobby': if (host && game) this.toLobby(); return;
      case 'leave': this.removeConn(conn, true); return;
    }
  }

  // ---------------------------------------------------------------- lobby <-> game
  start() {
    const st = mkState(MAPS[this.map], this.diff); setMap(st.map); buildAdj(st);
    this.st = st; this.n = 0; this.phase = 'game'; this.hold = true; this.holdUntil = this.now() + HOLD_MS;
    for (const m of this.members.values()) { m.go = false; newPlayer(st, m.pid, m.name, m.bot); const p = st.players[m.pid]; p.online = m.bot || !!m.conn; if (m.bot) m.brain = newBrain(); }
    for (const m of this.members.values()) if (m.conn) this.send(m.conn, { m: 'start', map: this.map, diff: this.diff, pid: m.pid });
    this.log(`game started: ${this.map} / ${this.diff}, ${this.size} player(s)`);
  }
  toLobby() {
    this.phase = 'lobby'; this.st = null;
    for (const m of this.members.values()) if (!m.bot) m.ready = false;
    this.broadcastRoom(); this.log('back to the lobby');
  }

  // ---------------------------------------------------------------- broadcasting
  roomMsg(you) {
    return { m: 'room', code: this.code, phase: this.phase, map: this.map, diff: this.diff, host: this.host, you,
      players: [...this.members.values()].map(x => ({ pid: x.pid, name: x.name, bot: x.bot, ready: x.bot || x.pid === this.host || x.ready, online: x.bot || !!x.conn })),
      chat: this.chat.slice(-12) };
  }
  broadcastRoom() { for (const m of this.members.values()) if (m.conn) this.send(m.conn, this.roomMsg(m.pid)); }

  // ---------------------------------------------------------------- the 30 Hz game tick
  tick() {
    if (this.phase !== 'game') return;
    const st = this.st; setMap(st.map); st.t += CFG.tick;
    if (this.hold) {                                                          // lobby -> game: freeze the world until everyone has clicked in
      const t = this.now(), waiting = this.humans().some(x => x.conn && !x.go);
      if (waiting && t < this.holdUntil) { for (const p of Object.values(st.players)) p.q.length = 0; if (++this.n % 2 === 0) this.broadcastSnap(); return; }
      this.hold = false; this.log('game running');
    }
    for (const m of this.members.values()) {
      const p = st.players[m.pid]; if (!p) continue;
      let i;
      if (m.bot) i = botInput(st, p, m.brain);
      else if (!m.conn) i = IDLE(p);                                         // disconnected: stand still
      else { const real = p.q.shift(); i = real || { ...p.last, rl: 0, sw: 0, use: 0 }; if (real) p.ack = real.seq; }   // no input this tick: repeat last, drop edge events
      p.last = i; stepPlayer(st, p, i, CFG.tick);
    }
    stepWorld(st, CFG.tick);
    if (++this.n % 2 === 0) this.broadcastSnap();
    const t = this.now();
    for (const m of [...this.members.values()]) if (!m.bot && !m.conn && t - m.discAt > GRACE_MS) { this.log(`${m.name} timed out`); this.dropMember(m); }
  }
  broadcastSnap() {
    const snap = snapshot(this.st); snap.h = this.host; if (this.hold) snap.hd = 1; const s = JSON.stringify(snap);
    for (const m of this.members.values()) if (m.conn) m.conn.send(s);
  }
}
