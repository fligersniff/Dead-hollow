// Server-side teammate bot. Runs inside the room tick (same input format as a human), reading the authoritative state directly.
// Priorities: revive a downed teammate > grab power-ups > shop (weapons / ammo / perks / mystery box / Forge / doors) while it's quiet > stay near a teammate.
// It always shoots the nearest zombie it can see and backs away when they get close.
import { WEAPONS, PERKS, CFG } from './config.js';
import { clear, nearWp, bfs } from './sim.js';

export const newBrain = () => ({ skip: {}, shop: null, shopT: 0, useT: 0 });

/** Walk toward (tx,tz). Aims for a point just in front of the target (shop spots sit against walls), uses the waypoint graph when blocked. */
function nav(st, p, tx, tz, ty, stop) {
  const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
  if (d < stop) return { ok: 1 };
  const sh = Math.min(stop * 0.9, d - 0.05), ax = tx - dx / d * sh, az = tz - dz / d * sh;
  if (Math.abs(ty - p.y) <= 1.2 && clear(st, p.x, p.z, ax, az, 0.35, Math.min(ty, p.y))) return { v: [ax - p.x, az - p.z] };
  const WP = st.map.waypoints, a = nearWp(st, p.x, p.z, p.y), b = nearWp(st, tx, tz, ty), path = a < 0 || b < 0 ? [] : bfs(st.adj, a, b);
  if (!path.length) return { fail: 1 };
  for (let n = path.length - 1; n >= 0; n--) {      // head for the furthest waypoint on the path that is directly visible
    const w = WP[path[n]];
    if (Math.hypot(w[0] - p.x, w[1] - p.z) < 0.6) continue;
    if (Math.abs((w[2] || 0) - p.y) < 1.5 && (n === 0 || clear(st, p.x, p.z, w[0], w[1], 0.35, Math.min(p.y, w[2] || 0)))) return { v: [w[0] - p.x, w[1] - p.z] };
  }
  return { v: [tx - p.x, tz - p.z] };
}

/** Best thing to buy right now (or null). Keeps a points buffer so it doesn't go broke on one purchase. */
function shopGoal(st, p, br) {
  const M = st.map, now = st.t, C = [], base = p.slots.map(s => s.id), cur = p.slots[p.cur];
  const add = (key, x, z, cost, pri) => { if (p.pts >= cost && !(br.skip[key] > now)) C.push({ key, x, z, y: 0, pri, use: true, stop: 1.6, d: Math.hypot(x - p.x, z - p.z) }); };
  M.wallbuys.forEach((w, i) => {
    const W = WEAPONS[w.w];
    if (!base.includes(w.w)) { if (base.length < 2 || base.includes('m1911')) add('w' + i, w.p[0], w.p[1], w.cost, 4); }
    else { const s = p.slots.find(x => x.id === w.w); if (s.res < W.mag * 2) add('a' + i, w.p[0], w.p[1], w.cost / 2, 2); }
  });
  (M.perks || []).forEach((pk, i) => { if (!p.perks[pk.t]) add('p' + i, pk.p[0], pk.p[1], PERKS[pk.t].cost + 300, 3); });
  const mb = (M.mystery || [])[st.mb]; if (mb) add('b', mb[0], mb[1], CFG.boxCost + 1000, 1);
  if (M.forge && !cur.u) add('f', M.forge[0], M.forge[1], CFG.forgeCost + 300, 3);
  M.doors.forEach((d, i) => { if (!st.doors[i]) add('d' + i, d.box[0], d.box[1], d.cost + 200, 1); });
  C.sort((a, b) => (a.d - a.pri * 8) - (b.d - b.pri * 8));
  return C[0] || null;
}

/** One tick of bot decisions -> an input object for stepPlayer. */
export function botInput(st, p, br) {
  const now = st.t, i = { f: 0, r: 0, j: false, c: false, s: false, yaw: p.yaw, pitch: 0, fire: false, rl: false, sw: false, use: false, h: false, ft: 0 };
  if (p.hp <= 0) return i;                                         // downed: wait for a revive
  let nz = null, bd = 1e9;
  for (const z of st.zs) { if (Math.abs(z.y - p.y) > 2) continue; const d = Math.hypot(z.x - p.x, z.z - p.z); if (d < bd) { bd = d; nz = z; } }
  const others = Object.values(st.players).filter(q => q !== p);
  const down = others.find(q => q.hp <= 0 && !q.dead);
  const mates = others.filter(q => q.hp > 0).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
  let goal = null;
  if (down && bd > 3) goal = { key: 'r', x: down.x, z: down.z, y: down.y, stop: 1.0, h: true };                                     // 1. revive
  if (!goal) for (const d of st.drops) { const dd = Math.hypot(d.x - p.x, d.z - p.z); if (dd < 22 && !(br.skip['u' + d.id] > now) && (!goal || dd < Math.hypot(goal.x - p.x, goal.z - p.z))) goal = { key: 'u' + d.id, x: d.x, z: d.z, y: d.y, stop: 0.4 }; } // 2. power-ups
  if (!goal && bd > 9) { if (now > br.shopT) { br.shopT = now + 0.7; br.shop = shopGoal(st, p, br); } if (br.shop) goal = br.shop; }   // 3. shop while it's quiet
  if (!goal && mates[0] && Math.hypot(mates[0].x - p.x, mates[0].z - p.z) > 7) goal = { key: 'f', x: mates[0].x, z: mates[0].z, y: mates[0].y, stop: 5 };  // 4. stay near a teammate
  let wx = 0, wz = 0, mv = false;
  if (goal) {
    const r = nav(st, p, goal.x, goal.z, goal.y || 0, goal.stop);
    if (r.v) { wx = r.v[0]; wz = r.v[1]; mv = true; }
    else if (r.ok) { if (goal.use && now > br.useT) { i.use = true; br.useT = now + 1; br.shopT = 0; br.shop = null; } if (goal.h) i.h = true; }
    else if (r.fail) { br.skip[goal.key] = now + 10; br.shop = null; }
  }
  if (nz && bd < 18 && Math.abs(nz.y - p.y) < 2 && clear(st, p.x, p.z, nz.x, nz.z, 0.1, p.y)) {
    i.yaw = Math.atan2(-(nz.x - p.x), -(nz.z - p.z)); i.pitch = Math.atan2(nz.y + 1 - (p.y + 1.6), bd); i.fire = Math.random() < 0.5;
    if (!mv && bd < 4.5) { wx = p.x - nz.x; wz = p.z - nz.z; mv = true; }                // back away from close zombies
  } else if (mv) i.yaw = Math.atan2(-wx, -wz);
  if (mv) {
    const l = Math.hypot(wx, wz) || 1, fv = (-wx * Math.sin(i.yaw) - wz * Math.cos(i.yaw)) / l, rv = (wx * Math.cos(i.yaw) - wz * Math.sin(i.yaw)) / l;
    i.f = Math.abs(fv) > 0.35 ? Math.sign(fv) : 0; i.r = Math.abs(rv) > 0.35 ? Math.sign(rv) : 0; i.s = bd > 12;
  } else if (nz && bd < 9) i.r = Math.sin(now / 1.5) > 0 ? 1 : -1;                        // strafe while fighting
  const cur = p.slots[p.cur]; i.rl = cur.mag < 3 && cur.res > 0;
  return i;
}
