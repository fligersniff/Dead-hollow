// Wire protocol v2: JSON text frames over one WebSocket at /ws. Every message is an object with a string `m` (type).
// Documentation only (the server and client read/write these shapes directly); bump PROTOCOL_VERSION when you change them.
//
// ── connection / lobby ───────────────────────────────────────────────────────────────────────────
// S->C hello     {m:'hello', v:2, id}                          sent right after connecting
// C->S create    {m:'create', name, map, diff}                 new room; you become host
// C->S join      {m:'join', code, name}                        4-letter code, case-insensitive; only while the room is in its lobby
// C->S rejoin    {m:'rejoin', code, token}                     take back your slot after a drop / refresh (slot held 60 s mid-game)
// S->C joined    {m:'joined', code, pid, token}                keep `token` (the client stores it in sessionStorage)
// S->C room      {m:'room', code, phase:'lobby'|'game', map, diff, host, you, players:[{pid,name,bot,ready,online}], chat:[{n,pid,name,t}]}
// C->S ready     {m:'ready', v:bool}          C->S config {m:'config', map, diff} (host)      C->S addbot / rmbot (host)
// C->S kick      {m:'kick', pid} (host)       C->S chat   {m:'chat', text}                    C->S leave {m:'leave'}
// C->S start     {m:'start'} (host; everyone else must be ready)
// S->C start     {m:'start', map, diff, pid}                   the game is created; the sim is HELD until every human sends `go`
//                                                              (or 20 s pass) so nobody is eaten behind the "click to play" screen
// C->S go        {m:'go'}                                      this player has clicked in
// C->S restart   {m:'restart'} (host, game over)               rematch with the same players/map/mode  (answered by a new `start`)
// C->S tolobby   {m:'tolobby'} (host)                          everyone returns to the room lobby      (answered by `room`)
// S->C err       {m:'err', text, fatal?}      S->C closed {m:'closed', reason}     C->S p {m:'p', c} / S->C pong {m:'pong', c}  (latency probe)
//
// ── in game ──────────────────────────────────────────────────────────────────────────────────────
// C->S input (30 Hz)  {m:'i', seq, f, r, j, c, s, yaw, pitch, fire, rl, sw, use, h, ft}
//        f/r = -1|0|1 move; j/c/s = jump/crouch/sprint; rl/sw/use = edge events (reload/swap/buy); h = holding E (revive)
//        ft  = server-clock time the client was viewing (lag compensation, rewind ≤ 0.5 s). Server queues ≤ 6 inputs per player.
// C->S ping  {m:'ping'}    drop a marker where you look      C->S chat {m:'chat', text}
// S->C snapshot (15 Hz)
//   {m:'s', t, rd, q, ks, d:[doorOpen..], o:gameOver, wn:won, df:diff, sw:[switchOn..], mb:mysteryBoxIdx, dbl, ik, ev:[n,text], h:hostPid, hd?:1 (held),
//    ch:[[n,pid,name,text]..], dr:[[id,kind,x,z,y]..] (power-ups), pg:[[id,ownerPid,x,y,z]..] (pings),
//    z:[[id,x,z,yaw,typeIdx,hp%,y]..],
//    p:[[pid,x,y,z,yaw,pitch,hp,pts,weaponId(*=forged),mag,res,reloading,vy,crouch,ackSeq,hits,kills,maxHp,perks,speed,slots,
//        reviveProgress%,bleedSecondsLeft,downs,revives,bledOut,name,isBot,online]..]}
export const PROTOCOL_VERSION = 2;
