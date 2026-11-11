// Headless boot test of the BROWSER client: runs client/src/main.js against the real server code (Lobby/Room) with a fake DOM, a stub
// Three.js and a fake WebSocket. It cannot judge how the game LOOKS, but it proves the UI flow, networking, prediction and HUD logic run
// without errors: menu -> create room -> lobby -> start -> play -> chat/ping -> pause -> game over -> rematch -> reconnect -> leave.
// Run: npm run test:client
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import { fileURLToPath } from 'url';
import { Lobby } from '../server/Lobby.js';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), rd = f => fs.readFileSync(path.join(root, f), 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

// ---------- bundle: wrap each module in a function scope (like a bundler would) and wire imports by hand
const exportsOf = s => [...s.matchAll(/export (?:const|let|function) (\w+)/g)].map(m => m[1]);
const modWrap = (name, src) => `const __m_${name}=(()=>{${src.replace(/^import .*$/gm, '').replace(/export (const|let|function)/g, '$1')}\nreturn{${exportsOf(src).join(',')}}})();`;
let main = rd('client/src/main.js');
const imports = [...main.matchAll(/^import (.*) from '(.*)';?$/gm)];
const names = { 'config.js': 'config', 'sim.js': 'sim' };
let boot = modWrap('config', rd('shared/config.js')) + modWrap('sim', rd('shared/sim.js'));
boot += `const __m_maps={MAPS:{${['yard', 'outpost', 'town'].map(id => `${id}:${rd(`shared/maps/${id}.json`)}`).join(',')}}};__m_maps.MAP_LIST=Object.values(__m_maps.MAPS).map(m=>({id:m.id,name:m.name}));`;
for (const [line, what, from] of imports) {
  const mod = from === 'three' ? '__THREE' : '__m_' + (from.endsWith('maps.js') ? 'maps' : names[path.basename(from)]);
  main = main.replace(line, what.startsWith('* as') ? `const ${what.slice(5)}=${mod};` : `const ${what}=${mod};`);
}
boot += main + `\nglobalThis.__t={frame,get cl(){return cl},get running(){return running},get scr(){return scr},get MAP(){return MAP},get sess(){return sess},get myPid(){return myPid},meshes,pingM,get names(){return names}};`;

// ---------- stub three.js (enough surface for this client; records nothing about pixels)
class Vec { constructor() { this.x = this.y = this.z = 0; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } setScalar(s) { return this.set(s, s, s); } setHex() { return this; } }
class Obj { constructor(...a) { this.children = []; this.position = new Vec(); this.rotation = new Vec(); this.scale = new Vec(); this.visible = true; this.repeat = new Vec(); this.color = new Vec(); this.userData = {}; this.args = a; this.material = a.length > 1 ? a[1] : { color: new Vec(), map: { dispose() {} }, dispose() {} }; }
  add(...c) { this.children.push(...c); return this; } remove(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); } clone() { return new Obj(); } dispose() {} setAttribute() {} updateProjectionMatrix() {} setPixelRatio() {} setSize() {} render() { stats.renders++; } }
const stats = { renders: 0 };
const matLike = n => /Material$/.test(n);
const __THREE = new Proxy({}, { get: (t, n) => matLike(n) ? class extends Obj { constructor(o) { super(); Object.assign(this, o || {}); this.color = new Vec(); this.map = o && o.map; this.dispose = () => {}; } } : Obj });

// ---------- fake DOM built from client/index.html (so a missing id in the HTML shows up here as null -> crash, like in a real browser)
const html = rd('client/index.html'), els = {};
class El {
  constructor(id, tag, cls) { this.id = id; this.tagName = tag.toUpperCase(); this.classes = new Set((cls || '').split(/\s+/).filter(Boolean)); this.style = {}; this.innerHTML = ''; this.textContent = ''; this.value = ''; this.disabled = false; this.dataset = {}; this.L = {};
    this.classList = { toggle: (c, f) => { const on = f === undefined ? !this.classes.has(c) : !!f; on ? this.classes.add(c) : this.classes.delete(c); return on; }, add: c => this.classes.add(c), remove: c => this.classes.delete(c), contains: c => this.classes.has(c) }; }
  get hidden() { return this.classes.has('hide'); }
  addEventListener(t, f) { (this.L[t] ||= []).push(f); } focus() {} blur() {} requestPointerLock() { doc.pointerLockElement = this; fire(doc, 'pointerlockchange'); }
  getContext() { return new Proxy({}, { get: (t, k) => k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {} , set: () => true }); } }
for (const m of html.matchAll(/<(\w+)([^>]*?)\sid="(\w+)"([^>]*)>/g)) { const cls = (m[2] + m[4]).match(/class="([^"]*)"/); els[m[3]] = new El(m[3], m[1], cls && cls[1]); }
const doc = { getElementById: id => els[id] || null, createElement: () => new El('', 'canvas'), querySelectorAll: () => [], pointerLockElement: null, exitPointerLock() { this.pointerLockElement = null; fire(doc, 'pointerlockchange'); }, L: {}, addEventListener(t, f) { (this.L[t] ||= []).push(f); } };
class FakeAudio { constructor() { this.currentTime = 0; this.state = 'running'; this.destination = {}; } resume() {}
  createOscillator() { const p = { setValueAtTime() {}, exponentialRampToValueAtTime() {} }; return { type: '', frequency: p, connect: x => x, start() {}, stop() {} }; }
  createGain() { const p = { setValueAtTime() {}, exponentialRampToValueAtTime() {} }; return { gain: p, connect: x => x }; } }
const win = { AudioContext: FakeAudio, L: {}, addEventListener(t, f) { (this.L[t] ||= []).push(f); } };
const fire = (target, type, ev = {}) => { for (const f of (target.L && target.L[type]) || []) f({ target: { tagName: 'BODY' }, repeat: false, preventDefault() {}, movementX: 0, movementY: 0, buttons: 0, button: 0, ...ev }); };
const store = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };

// ---------- fake WebSocket wired straight into the real Lobby (the 30 Hz timer is driven by the test)
const lobby = new Lobby({ log: () => {}, now: () => clock });
const sockets = [];
class FakeWS { constructor() { this.readyState = 1; sockets.push(this); this.conn = lobby.connect(s => { if (!this.dead) this.onmessage && this.onmessage({ data: s }); }, () => this.drop()); }
  send(s) { if (!this.dead) lobby.message(this.conn, s); }
  close() { this.drop(); }
  drop() { if (this.dead) return; this.dead = true; this.readyState = 3; lobby.disconnect(this.conn); this.onclose && this.onclose(); } }
// the real Lobby sends 'hello' inside connect(), before the client can attach onmessage: replay it on the next tick like a real socket would
const realConnect = lobby.connect.bind(lobby); lobby.connect = (send, close) => { const q = []; let live = false; const c = realConnect(s => live ? send(s) : q.push(s), close); setImmediate(() => { live = true; q.forEach(send); }); return c; };

let clock = 5000; const frameCbs = [];
const sandbox = { document: doc, window: win, addEventListener: (t, f) => win.addEventListener(t, f), innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, location: { protocol: 'http:', host: 'localhost:5173' }, localStorage: store(), sessionStorage: store(),
  performance: { now: () => clock }, requestAnimationFrame: f => { frameCbs.push(f); }, WebSocket: FakeWS, navigator: { clipboard: { writeText: () => Promise.resolve() } }, __THREE, setTimeout, clearTimeout, setInterval, console, Math, JSON, Date, Map, Set, Float32Array, Promise, parseInt };
sandbox.document.addEventListener = doc.addEventListener.bind(doc); sandbox.globalThis = sandbox; vm.createContext(sandbox);
const spin = () => new Promise(r => setImmediate(r));
const wait = ms => new Promise(r => setTimeout(r, ms));
// advance fake time: render frames at ~60 fps, server ticks at 30 Hz
let srvAcc = 0;
async function run(frames) { for (let i = 0; i < frames; i++) { clock += 16.7; srvAcc += 16.7; while (srvAcc >= 33.3) { srvAcc -= 33.3; lobby.tick(); } const cb = frameCbs.splice(0); for (const f of cb) f(clock); await spin(); } }
const T = () => sandbox.__t;
const key = (code, type = 'keydown') => fire(type === 'keydown' ? win : win, type, { code });
const visible = id => !els[id].hidden;
const room = () => [...lobby.rooms.values()][0], srvMe = () => room().st.players[T().myPid];

try {
  // static check: every $('id') the client uses exists in index.html
  const used = new Set([...rd('client/src/main.js').matchAll(/\$\('(\w+)'\)/g)].map(m => m[1])); const missing = [...used].filter(i => !els[i]);
  ok(!missing.length, 'every element id used by main.js exists in index.html' + (missing.length ? ': missing ' + missing : ` (${used.size} ids)`));
  vm.runInContext(boot, sandbox, { filename: 'client-bundle.js' });
  ok(visible('menu') && !visible('lobby') && !visible('hud'), 'boots into the main menu with the HUD hidden');
  ok(els.cmap.innerHTML.includes('town') && els.cdiff.innerHTML.includes('extreme'), 'map and difficulty pickers are filled from the JSON maps / config');

  // join errors
  els.jcode.value = 'zzzz'; els.bjoin.onclick(); await run(3); ok(/No room/.test(els.toast.textContent), 'joining a wrong code shows an error toast');

  // create room
  els.name.value = 'Tester'; els.cmap.value = 'outpost'; els.cdiff.value = 'easy'; els.bcreate.onclick(); await run(3);
  ok(visible('lobby') && !visible('menu') && els.code.textContent.length === 4 && room().map === 'outpost' && room().diff === 'easy', 'create room -> lobby with a 4-letter code (' + els.code.textContent + ')');
  ok(els.lplayers.innerHTML.includes('Tester') && els.lplayers.innerHTML.includes('host') && visible('lstart') && !visible('lready'), 'lobby lists you as host with a START button');
  els.lmap.value = 'town'; els.lmap.onchange(); els.ldiff.value = 'normal'; els.ldiff.onchange(); await run(2);
  ok(room().map === 'town' && room().diff === 'normal', 'host changes the map and mode from the lobby');
  els.laddbot.onclick(); await run(2); ok(els.lplayers.innerHTML.includes('BOT 1'), 'host adds a bot');
  // a second human joins through a raw connection
  const zed = []; const zc = lobby.connect(s => zed.push(JSON.parse(s))); await spin(); lobby.message(zc, JSON.stringify({ m: 'join', code: els.code.textContent, name: 'Zed' })); await run(2);
  ok(els.lplayers.innerHTML.includes('Zed') && els.lplayers.innerHTML.includes('data-kick') && els.lstart.disabled, 'second player appears; START waits until they are ready');
  lobby.message(zc, JSON.stringify({ m: 'ready', v: true })); await run(2); ok(!els.lstart.disabled, 'START unlocks when everyone is ready');
  els.lci.onkeydown({ key: 'Enter', target: { value: 'hi team' } }); await run(2); ok(els.lchat.innerHTML.includes('hi team'), 'lobby chat round-trips');

  // start
  els.lstart.onclick(); await run(3);
  ok(visible('enter') && !visible('lobby') && T().cl && T().MAP.id === 'town' && T().cl.id === T().myPid, 'start -> "CLICK TO PLAY" screen, map loaded (' + T().MAP.name + ')');
  await run(30); ok(room().hold, 'world stays frozen while the screen waits for the click');
  els.benter.onclick(); lobby.message(zc, JSON.stringify({ m: 'go' })); await run(120);
  ok(T().running && visible('hud') && !visible('enter') && !room().hold, 'click -> HUD visible, running, hold released');
  ok(/Round \d/.test(els.round.innerHTML) && els.team.innerHTML.includes('Zed') && els.team.innerHTML.includes('BOT 1'), 'HUD shows round and the teammate panel');
  ok(els.ammo.innerHTML.includes('/') && els.hpf.style.width === '100%', 'HUD shows ammo and health');
  ok(stats.renders > 50 && T().meshes.size > 0, `renderer ran ${stats.renders} frames; ${T().meshes.size} entities drawn`);
  const labelled = [...T().meshes.entries()].filter(([k, g]) => k[0] === 'p' && g.lab).length; ok(labelled >= 2, 'other players get name labels above their heads (' + labelled + ')');

  // movement: prediction must agree with the server
  key('KeyW'); key('ShiftLeft'); await run(60); key('KeyW', 'keyup'); key('ShiftLeft', 'keyup'); await run(30);
  const me = T().cl.me, sv = srvMe(); ok(Math.hypot(me.x - sv.x, me.z - sv.z) < .05 && Math.hypot(sv.x - T().MAP.start[0], sv.z - T().MAP.start[1]) > 2, `client prediction matches the server after moving (err ${Math.hypot(me.x - sv.x, me.z - sv.z).toFixed(3)} m)`);
  // shooting
  const mag0 = srvMe().slots[srvMe().cur].mag; fire(T().cl ? sandbox.document.getElementById('c') : null, 'mousedown', { button: 0 }); await run(20); fire(els.c, 'mouseup', { button: 0 }); fire(win, 'mouseup', { button: 0 }); await run(5);
  ok(srvMe().slots[srvMe().cur].mag < mag0, 'holding fire spends ammo on the server (' + mag0 + ' -> ' + srvMe().slots[srvMe().cur].mag + ')');
  // chat + ping + scoreboard
  key('Enter'); els.ci.value = 'zombies left!'; key('Enter'); await run(40);
  ok(room().st.chat.some(c => c.t === 'zombies left!') && els.chat.innerHTML.includes('zombies left!'), 'in-game chat: sent, stored, shown in the HUD');
  key('KeyV'); await run(30); ok(room().st.pings.length === 1 && T().pingM.size === 1, 'V places a ping marker that is rendered for everyone');
  key('Tab'); await run(3); ok(visible('sb') && els.sb.innerHTML.includes('Zed') && els.sb.innerHTML.includes('Tester'), 'Tab shows the scoreboard with every player'); key('Tab', 'keyup'); await run(3);
  // pause: game keeps running, resume
  key('Escape'); await run(3); ok(visible('pause') && !T().running && !room().hold, 'Esc opens the pause menu (server keeps running)'); els.bresume.onclick(); await run(3); ok(T().running && !visible('pause'), 'resume returns to the game');
  // zombie hurts / downed prompt: down the host, check prompt + revive state
  srvMe().hp = 0; await run(40); ok(/DOWNED/.test(els.prompt.textContent), 'when downed the prompt shows the bleed-out timer');
  // game over -> rematch
  for (const p of Object.values(room().st.players)) p.hp = 0; await run(30 * 32 * 2);
  ok(room().st.over && visible('over') && els.ovt.innerHTML.includes('Zed') && visible('bre'), 'everyone down -> game-over screen with the scoreboard; host sees REMATCH');
  els.bre.onclick(); await run(5); ok(visible('enter') && T().cl && !T().cl.over && !visible('over'), 'rematch -> fresh run behind the CLICK TO PLAY screen');
  els.benter.onclick(); lobby.message(zc, JSON.stringify({ m: 'go' })); await run(60);
  // connection drop -> automatic rejoin with the saved token
  const pid0 = T().myPid; sockets.at(-1).drop(); await run(2); ok(!els.conn.hidden && /reconnecting/i.test(els.conn.textContent), 'dropped connection shows a "reconnecting" banner'); ok(!srvMe().online, 'server marks the player offline but keeps the slot');
  await wait(600); await run(10);
  ok(els.conn.hidden && T().myPid === pid0 && srvMe().online && visible('enter'), 'client rejoined the same slot automatically (pid ' + pid0 + ')');
  els.benter.onclick(); await run(40); ok(T().running && T().cl.buf.length > 3, 'snapshots flow again after the reconnect');
  // leave
  key('Escape'); await run(2); els.bleave2.onclick(); await run(3);
  ok(visible('menu') && !T().cl && !T().sess && els.hud.hidden, 'leave room -> back to the menu, session cleared');
  ok(!lobby.rooms.size || ![...lobby.rooms.values()][0].humans().some(h => h.name === 'Tester'), 'server freed the slot');
} catch (e) { ok(false, 'client threw: ' + (e.stack || e).split('\n').slice(0, 4).join(' | ')); }
console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL PASS'); process.exit(fails ? 1 : 0);
