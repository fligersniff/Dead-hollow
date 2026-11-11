# Dead Hollow

Low-poly, first-person, co-op wave-survival zombie shooter for the browser. Node.js authoritative server (`ws` + Express), Three.js client bundled with Vite. Original setting, characters and weapons.

## Run it
```bash
npm install
npm run dev      # server on :3000 (auto-restart) + Vite on :5173  ->  open http://localhost:5173
```
Production build: `npm run build && npm start` -> open http://localhost:3000 (Express serves `client/dist` and the `/ws` socket on the same port, which is what you want for ngrok / a VPS).

**Play with friends on your network:** run `npm run dev`, then they open `http://YOUR-IP:5173` (Mac: `ipconfig getifaddr en0`). Over the internet: `npm run build && npm start`, then `ngrok http 3000` and share the https URL (the client automatically switches to `wss://`).

## Put it online permanently (Render, free)
1. Put the project folder on GitHub (new repository, upload the files; `node_modules` is not needed).
2. On render.com: **New +** -> **Web Service** -> connect that repository. Render reads `render.yaml`; if it asks, use build `npm install --include=dev && npm run build`, start `npm start`, plan Free.
3. When the deploy finishes you get `https://dead-hollow-xxxx.onrender.com`. Everyone opens that link; the client uses `wss://` automatically.
Free plan notes: the service sleeps after ~15 min without visitors (the first visit then takes ~30-60 s to wake it), and game rooms live in memory, so a restart or redeploy clears them.

## How a game goes
1. **Menu**: type a name, then **Create room** (pick map + mode) or **Join** with a 4-letter room code.
2. **Lobby**: up to 4 players per room (humans + bots). Host picks the map and mode, adds/removes bots, kicks players, and starts once everyone has pressed READY. Lobby chat works.
3. **Click to play**: the world is frozen until every human has clicked in (or 20 s pass), so nobody gets eaten behind a menu.
4. **Survive**: shared points, shared doors. When you're downed, a teammate can **hold E** next to you to revive you (4 s; Lifeline perk halves it). You bleed out after 30 s. The run ends when everyone is down/dead. In the easy-extreme modes, turn on **all the map switches** to win; endless has no win.
5. **Game over**: host chooses **Rematch** or **Back to lobby**; anyone can leave.

Closing the tab or losing connection mid-game keeps your slot for 60 s; the page reconnects by itself (and a refresh takes the slot back).

**Controls:** WASD move · Shift sprint · Space jump · C crouch · LMB fire · R reload · Q swap · E buy / open / hold to revive · V ping marker · Enter chat · Tab scoreboard · Esc pause (the game keeps running for everyone). Settings (sensitivity, FOV, volume, graphics quality) are saved in the browser.

## Layout
```
shared/config.js      all tuning: CFG, 28 weapons, perks, difficulty modes (edit to rebalance)
shared/sim.js         pure simulation: movement, lag-compensated hitscan, zombies + waypoint pathing, rounds, shops, power-ups, downed/revive, chat/ping, snapshots
shared/bot.js         the server-side teammate bot (fights, grabs power-ups, shops, revives, follows)
shared/maps/*.json    maps: yard (tutorial), outpost (research lab), town (multi-floor manor)
shared/protocol.js    wire format documentation (v2)
server/Room.js        one room: lobby state, members, ready flags, host, start/hold, 30 Hz tick, snapshots, reconnect grace
server/Lobby.js       all rooms: create/join/rejoin, routing, flood guard, chat rate limit, cleanup, admin helpers
server/index.js       Express + WebSocket plumbing, shared tick timer, heartbeat, admin console
server/smoke-test.js  headless server test (no sockets)
client/index.html     menu, lobby, pause, game-over and HUD markup
client/src/main.js    Three.js scene + procedural low-poly world/rigs, input, prediction, lobby/network glue, HUD, audio
client/src/maps.js    client-side map registry (plain JSON imports)
test/client-boot.js   headless browser-client test (fake DOM + stub Three.js + real server code)
```

## Maps (JSON)
Each file in `shared/maps/` is plain JSON: `id, name, theme, size[w,d], start[x,z], boxes[[cx,cz,w,d,h,y0?]], floors[[cx,cz,w,d,top]], ramps, doors[{box,cost}], spawns[[x,z]], wallbuys[{p,w,cost}], waypoints[[x,z,y?,links]], perks[{t,p}], mystery[[x,z]], powerups, forge[x,z], switches[[x,z,y?]]`. To add one: drop `mymap.json` into `shared/maps/` and add it to `server/maps.js` and `client/src/maps.js`. (The in-browser map *editor* is not built yet.)

## Netcode in short
- Clients send only inputs (30 Hz, numbered). The server consumes one queued input per player per tick (queue capped at 6) and validates everything: ranges, fire rate, ammo, purchases.
- The local player is predicted with the same `moveP` the server runs; each snapshot (15 Hz) carries the last acknowledged input, the client snaps to the server state and replays unacknowledged inputs.
- Zombies and other players are interpolated ~100 ms in the past. Every input carries the server time the shooter was viewing, so hitscan rewinds zombie positions (max 0.5 s) before testing the shot.

## Admin console (type in the server terminal)
`rooms` list rooms and members · `players` list connection ids · `kick <connId>` · `restart <roomCode>` · env `PORT=4000 npm start` to change the port. The server logs room creation, joins, leaves, timeouts and game starts.

## Tests
```bash
npm test             # server smoke test (43 checks) + client boot test (34 checks)
```
Both run without a browser or network: the server test drives Lobby/Room with fake connections; the client test runs `main.js` against the real server code with a fake DOM and stubbed Three.js, and covers menu -> create/join -> lobby -> start -> play -> chat/ping/scoreboard -> pause -> game over -> rematch -> dropped connection + auto-rejoin -> leave.
They do **not** check how the game looks or feels, real WebSocket traffic, or real browser pointer lock; try those yourself with `npm run dev`.

## Status
Build steps 1-5 are in: movement/shooting, authoritative server, zombies/rounds/points, doors/wall-buys/mystery box/perks/forge/power-ups, lobby + rooms + reconnect, downed/revive, chat, ping markers, scoreboard, 3 maps, 28 weapons.
Not yet: in-browser map editor (stretch), instanced zombie meshes / frustum-culling pass and richer audio (step 8), touch controls.
