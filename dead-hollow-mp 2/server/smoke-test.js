// Headless integration test of the whole server side (no sockets, no browser): lobby, rooms, ready-up, start, inputs, bots,
// chat/pings, disconnect + reconnect, host migration, several rooms at once, game over / rematch, flood guard.  Run: npm test
import { Lobby } from './Lobby.js';
import { GRACE_MS } from './Room.js';
import { CFG } from '../shared/config.js';

let T = 1_000_000, fails = 0;
const now = () => T;
const lobby = new Lobby({ log: () => {}, now });
const ok = (c, msg) => { console.log((c ? 'ok   ' : 'FAIL ') + msg); if (!c) fails++; };
const tick = (n = 1) => { for (let i = 0; i < n; i++) { T += 33; lobby.tick(); } };
class Fake {
  constructor() { this.inbox = []; this.closed = false; this.c = lobby.connect(s => this.inbox.push(JSON.parse(s)), () => { this.closed = true; }); }
  send(o) { lobby.message(this.c, JSON.stringify(o)); }
  of(m) { return this.inbox.filter(x => x.m === m); }
  last(m) { return this.of(m).at(-1); }
  clear() { this.inbox.length = 0; }
}
const room = code => lobby.rooms.get(code);

// ---- 1. create / join / validation
const A = new Fake(), B = new Fake();
ok(A.last('hello') && A.last('hello').v === 2, 'server greets with hello');
A.send({ m: 'create', name: 'Alice', map: 'outpost', diff: 'hard' });
const aliceJ = A.last('joined'), code = aliceJ.code;
ok(/^[A-HJ-NP-Z2-9]{4}$/.test(code) && A.last('room').host === A.last('joined').pid && A.last('room').map === 'outpost' && A.last('room').diff === 'hard', `Alice created room ${code} (host, outpost / hard)`);
B.send({ m: 'join', code: code.toLowerCase(), name: 'Bob<script>' });
const bobJ = B.last('joined');
ok(B.last('joined') && B.last('room').players.length === 2 && B.last('room').players[1].name === 'Bobscript', 'Bob joined with a lower-case code; name was sanitised');
const C = new Fake(); C.send({ m: 'join', code: 'ZZZZ', name: 'x' });
ok(C.last('err') && /No room/.test(C.last('err').text), 'unknown room code is rejected');
C.send({ m: 'create', name: 'Cee', map: 'nope', diff: 'nope' });
ok(room(C.last('joined').code).map === 'yard' && room(C.last('joined').code).diff === 'endless', 'invalid map/difficulty fall back to defaults');
C.send({ m: 'leave' }); ok(!room(C.last('joined').code) || lobby.rooms.size === 1, 'a room closes when its last player leaves');

// ---- 2. host config, bots, capacity, kick
B.send({ m: 'config', map: 'town', diff: 'easy' }); ok(room(code).map === 'outpost', 'non-host cannot change the config');
A.send({ m: 'config', map: 'town', diff: 'easy' }); ok(room(code).map === 'town' && B.last('room').map === 'town' && B.last('room').diff === 'easy', 'host changes map + difficulty, everyone sees it');
A.send({ m: 'addbot' }); A.send({ m: 'addbot' });
ok(room(code).size === 4 && A.last('room').players.filter(p => p.bot).length === 2, 'host added 2 bots (4/4)');
const D = new Fake(); D.send({ m: 'join', code, name: 'Dee' }); ok(D.last('err') && /full/.test(D.last('err').text), 'a 5th player is turned away: room is full');
A.send({ m: 'rmbot' }); ok(room(code).size === 3, 'host removed a bot');
D.send({ m: 'join', code, name: 'Dee' }); ok(D.last('joined') && room(code).size === 4, 'Dee takes the free slot');
A.send({ m: 'kick', pid: D.last('joined').pid }); ok(D.last('closed') && room(code).size === 3, 'host can kick a player');
A.clear(); B.clear(); T += 500; A.send({ m: 'chat', text: 'hello lobby' }); ok(B.last('room').chat.at(-1).t === 'hello lobby' && B.last('room').chat.at(-1).name === 'Alice', 'lobby chat is delivered with the sender name');

// ---- 3. ready gate + start
A.send({ m: 'start' }); ok(A.last('err') && /ready/.test(A.last('err').text) && room(code).phase === 'lobby', 'host cannot start while a player is not ready');
B.send({ m: 'ready', v: true }); A.clear(); B.clear(); A.send({ m: 'start' });
ok(room(code).phase === 'game' && A.last('start').map === 'town' && B.last('start').pid === bobJ.pid, 'all ready: game starts for everyone on the chosen map');
// the world is frozen until every human has clicked CLICK TO PLAY
tick(40); ok(room(code).hold && room(code).st.round === 0 && room(code).st.zs.length === 0 && B.last('s') && B.last('s').hd === 1, 'sim is held (snapshots flag hd) until everyone has pressed play');
A.send({ m: 'go' }); tick(10); ok(room(code).hold, 'still held while one player has not clicked in');
B.send({ m: 'go' }); tick(90);
ok(!room(code).hold && room(code).st.round >= 1 && !B.last('s').hd, 'once all humans are in, the run begins');
const s0 = B.last('s');
ok(s0 && s0.p.length === 3 && s0.p.map(r => r[26]).join() === 'Alice,Bobscript,BOT 1', 'snapshots carry all players with names: ' + (s0 && s0.p.map(r => r[26]).join(', ')));
const E = new Fake(); E.send({ m: 'join', code, name: 'Late' }); ok(E.last('err') && /already started/.test(E.last('err').text), 'cannot join a game in progress');
E.send({ m: 'rejoin', code, token: 'bogus' }); ok(E.last('err') && E.last('err').fatal, 'a bad reconnect token is refused');

// ---- 4. inputs move the player (prediction acks), validation
const bobPid = bobJ.pid, st = () => room(code).st;
const bx0 = st().players[bobPid].x, bz0 = st().players[bobPid].z;
for (let i = 1; i <= 30; i++) { B.send({ m: 'i', seq: i, f: 1, r: 0, yaw: 0, pitch: 0, fire: false, s: true, ft: 0 }); tick(); }
const bp = st().players[bobPid];
ok(bp.ack === 30 && Math.hypot(bp.x - bx0, bp.z - bz0) > 3, `Bob moved ${Math.hypot(bp.x - bx0, bp.z - bz0).toFixed(1)} m and the server acked input #${bp.ack}`);
B.send({ m: 'i', seq: 31, f: 99, r: -50, yaw: 1e12, pitch: 99, fire: 1, s: 1, ft: 'x' }); tick(2);
ok(Number.isFinite(bp.x) && Math.abs(bp.pitch) <= 1.5, 'garbage input values are clamped');
for (let i = 0; i < 50; i++) B.send({ m: 'i', seq: 100 + i, f: 1, yaw: 0, pitch: 0 }); ok(bp.q.length <= 6, 'input queue is bounded (flooding gives no extra speed)');

// ---- 5. chat + ping in game, flood guard, junk
T += 500; B.send({ m: 'chat', text: '  gl hf  ' }); B.send({ m: 'ping' }); tick(4);
const sn = A.last('s'); ok(sn.ch.some(c => c[2] === 'Bobscript' && c[3] === 'gl hf') && sn.pg.length === 1 && sn.pg[0][1] === bobPid, 'in-game chat and a ping marker reach everyone');
let pongs = 0; const F = new Fake(); for (let i = 0; i < 500; i++) F.send({ m: 'p', c: i }); pongs = F.of('pong').length; ok(pongs <= 240 && pongs > 0, `flood guard: ${pongs}/500 probes answered in one second`);
lobby.message(F.c, 'not json'); lobby.message(F.c, '[1,2]'); lobby.message(F.c, JSON.stringify({ m: 5 })); ok(true, 'malformed messages are ignored without crashing');

// ---- 6. disconnect, hold slot, reconnect
const token = bobJ.token; B.inbox.length = 0; lobby.disconnect(B.c); tick(20);
ok(st().players[bobPid] && st().players[bobPid].online === false && room(code).size === 3, 'dropped player keeps the slot and shows as offline');
const B2 = new Fake(); B2.send({ m: 'rejoin', code, token }); tick(5);
ok(B2.last('joined').pid === bobPid && B2.last('start') && st().players[bobPid].online && B2.last('s'), 'reconnect with the token restores the same player and the snapshot stream');
const B3 = new Fake(); B3.send({ m: 'rejoin', code, token }); ok(B2.last('closed') && B3.last('joined'), 'a second tab takes over the slot (old tab is told)');
lobby.disconnect(B3.c); T += GRACE_MS + 1000; tick(2); ok(!st().players[bobPid] && room(code).size === 2, 'slot is released after the grace period');

// ---- 7. two rooms at once on different maps
const G = new Fake(), H = new Fake(); G.send({ m: 'create', name: 'Gee', map: 'yard', diff: 'normal' }); const code2 = G.last('joined').code;
H.send({ m: 'join', code: code2, name: 'Hal' }); H.send({ m: 'ready', v: true }); G.send({ m: 'start' }); G.send({ m: 'go' }); H.send({ m: 'go' });
for (let i = 1; i <= 90; i++) { G.send({ m: 'i', seq: i, f: 1, yaw: 0, pitch: 0, s: true, ft: 0 }); A.send({ m: 'i', seq: 500 + i, f: 1, r: 1, yaw: 2, pitch: 0, ft: 0 }); tick(); }
const finite = r => [...r.st.players.values ? [] : Object.values(r.st.players)].every(p => [p.x, p.y, p.z].every(Number.isFinite));
ok(lobby.rooms.size === 2 && room(code).st.map.id === 'town' && room(code2).st.map.id === 'yard' && finite(room(code)) && finite(room(code2)), 'two rooms run side by side on different maps (' + [...lobby.rooms.values()].map(r => r.map).join(' + ') + ')');
const gp = Object.values(room(code2).st.players)[0]; ok(gp.x > -20.5 && gp.x < 20.5 && Math.abs(gp.z) < 15.5, 'a player in the yard stays inside the yard walls');

// ---- 8. bots fight (room 1: Alice + 1 bot + offline Bob slot already freed)
A.send({ m: 'addbot' }); // no effect: game running
const botP = () => Object.values(st().players).find(p => p.bot);
tick(30 * 60);
ok(botP().kills >= 1 || st().round >= 1, `bot fought for 60 s of simulation: ${botP().kills} kills, round ${st().round}, bot hp ${Math.round(botP().hp)}`);

// ---- 9. game over -> rematch / back to lobby / host migration
for (const p of Object.values(st().players)) p.hp = 0;
tick(30 * 31); ok(st().over, 'everyone down: the run ends once all have bled out');
const over = A.last('s'); ok(over.o === true && over.h === aliceJ.pid, 'snapshot says game over and who the host is');
B2.send({ m: 'restart' }); ok(room(code).st.over, 'only the host can restart');
A.clear(); A.send({ m: 'restart' }); ok(!st().over && st().round === 0 && A.last('start') && room(code).hold, 'host rematch: fresh run (held until clicks), same players and map');
A.send({ m: 'go' }); B2.send({ m: 'go' }); tick(2);
// hold timeout: a player who never clicks cannot freeze the room forever
{ const X = new Fake(); X.send({ m: 'create', name: 'Xan' }); const xc = X.last('joined').code; X.send({ m: 'start' }); tick(10); const held = room(xc).hold; T += 21_000; tick(2); ok(held && !room(xc).hold, 'hold expires after 20 s even if nobody clicks'); X.send({ m: 'leave' }); }
A.send({ m: 'tolobby' }); ok(room(code).phase === 'lobby' && A.last('room').phase === 'lobby' && !room(code).members.get(B2.last('joined').pid) , 'host sends everyone back to the lobby');

// ---- 10. host migration + cleanup
const K = new Fake(); K.send({ m: 'join', code, name: 'Kay' });
A.send({ m: 'leave' }); ok(room(code).host === K.last('joined').pid && K.last('room').host === K.last('joined').pid, 'when the host leaves, the next human becomes host');
K.send({ m: 'leave' }); G.send({ m: 'leave' }); H.send({ m: 'leave' }); tick(); ok(lobby.rooms.size === 0, 'empty rooms are removed (bots alone do not keep a room alive)');
console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL PASS'); process.exit(fails ? 1 : 0);
