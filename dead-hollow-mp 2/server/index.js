// HTTP (Express: serves the built client) + WebSocket (/ws) entry point. Run: npm start  (or npm run dev for hot reload).
// All game logic lives in Lobby/Room; this file only plugs real sockets into it and runs the shared 30 Hz tick + admin console.
import express from 'express';
import http from 'http';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { CFG } from '../shared/config.js';
import { Lobby } from './Lobby.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const app = express();
app.use(express.static(path.join(dir, '../client/dist')));
app.get('/healthz', (_req, res) => res.send('ok'));
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });   // inputs and chat are tiny; refuse anything big
const lobby = new Lobby({ log });

wss.on('connection', ws => {
  ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
  const conn = lobby.connect(
    s => { if (ws.readyState === 1 && ws.bufferedAmount < 1e6) ws.send(s); },     // skip frames for clients that can't keep up
    why => ws.close(1000, String(why).slice(0, 100)));
  ws.on('message', d => lobby.message(conn, d.toString()));
  ws.on('close', () => lobby.disconnect(conn));
  ws.on('error', () => ws.terminate());
});

// Fixed-rate tick with catch-up (at most 3 ticks per wake-up so a stall can't spiral)
let next = Date.now();
setInterval(() => { const t = Date.now(); let n = 0; while (next <= t && n < 3) { lobby.tick(); next += CFG.tick * 1000; n++; } if (next < t - 200) next = t; }, 8);
// Heartbeat: drop sockets that stopped answering (their player slot is then held for the reconnect grace period)
setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); } }, 20000);

// Admin console (type in the server terminal): rooms | players | kick <connId> | restart <code> | help
readline.createInterface({ input: process.stdin }).on('line', l => {
  const [cmd, arg] = l.trim().split(/\s+/);
  if (cmd === 'rooms') { const r = lobby.describe(); log(r.length ? '\n  ' + r.join('\n  ') : '(no rooms)'); }
  else if (cmd === 'players') log([...lobby.conns.keys()].join(', ') || '(none)');
  else if (cmd === 'kick') log(lobby.kick(arg) ? `kicked ${arg}` : 'no such connection');
  else if (cmd === 'restart') log(lobby.restartRoom(arg) ? `restarted ${arg}` : 'no such room (or it is not in a game)');
  else if (cmd) log('commands: rooms | players | kick <connId> | restart <code>');
});
server.listen(PORT, () => log(`Dead Hollow server on http://localhost:${PORT}  (ws path /ws)`));
