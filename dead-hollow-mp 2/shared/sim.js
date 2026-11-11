import {CFG,WEAPONS,PERKS,DIFFS} from './config.js';
// Pure game simulation shared by the server (authoritative) and the client (movement prediction). No DOM, no audio, no sockets.
// It works on a state object `st`; the active map lives in a module variable set with setMap() (the server switches it per room each tick).
export const TSCALE=[1,1,1.35,1.9]; // type index: 0 walker, 1 runner, 2 tank, 3 boss
export const mkState=(map,diff='endless')=>({map,diff,pings:[],pn:0,t:0,round:0,queue:0,spawnT:0,pause:2,kills:0,zs:[],zid:0,players:{},doors:map.doors.map(()=>false),over:false,won:false,bossLeft:0,hist:[],adj:null,
 sw:Array(DIFFS[diff].sw).fill(0),drops:[],did:0,dbl:0,ik:0,mb:Math.random()*((map.mystery||[]).length||1)|0,mbUses:0,mbMax:3+Math.random()*4|0,ev:{n:0,t:''},chat:[],cn:0});
export const solids=st=>MAP.boxes.concat(FLOORS,MAP.doors.filter((d,i)=>!st.doors[i]).map(d=>d.box));
export function push(st,o,r){for(const b of solids(st)){const hx=b[2]/2+r,hz=b[3]/2+r,dx=o.x-b[0],dz=o.z-b[1];
 if(Math.abs(dx)<hx&&Math.abs(dz)<hz&&!((o.y||0)>=(b[5]||0)+b[4]-.5||(o.y||0)+1.8<=(b[5]||0))){const px=hx-Math.abs(dx),pz=hz-Math.abs(dz);if(px<pz)o.x+=(dx<0?-1:1)*px;else o.z+=(dz<0?-1:1)*pz}}}
export function slab(p,d,lo,hi,tm){let t0=0,t1=tm;for(let i=0;i<p.length;i++){
 if(Math.abs(d[i])<1e-9){if(p[i]<lo[i]||p[i]>hi[i])return Infinity}
 else{let a=(lo[i]-p[i])/d[i],b=(hi[i]-p[i])/d[i];if(a>b)[a,b]=[b,a];t0=Math.max(t0,a);t1=Math.min(t1,b);if(t0>t1)return Infinity}}return t0}
export function raySph(o,d,c,r){const x=o[0]-c[0],y=o[1]-c[1],z=o[2]-c[2],b=x*d[0]+y*d[1]+z*d[2],q=b*b-(x*x+y*y+z*z-r*r);
 if(q<0)return Infinity;const t=-b-Math.sqrt(q);return t<0?Infinity:t}
export function clear(st,ax,az,bx,bz,r,y=0){for(const b of solids(st))if(y+1.8>(b[5]||0)&&y<(b[5]||0)+b[4]-.5&&slab([ax,az],[bx-ax,bz-az],[b[0]-b[2]/2-r,b[1]-b[3]/2-r],[b[0]+b[2]/2+r,b[1]+b[3]/2+r],1)<Infinity)return false;return true}
let MAP=null,WP=null,FLOORS=[];
/** Select the active map (also derives the floor slabs used for collision). */
export function setMap(m){MAP=m;WP=m.waypoints;FLOORS=(MAP.floors||[]).map(f=>[f[0],f[1],f[2],f[3],.3,f[4]-.3])} // floors double as thin collision slabs
// ground height under (x,z) for something whose feet are at f: highest floor/ramp surface it can step onto
export function gy(x,z,f){let g=0;for(const a of MAP.floors||[])if(Math.abs(x-a[0])<a[2]/2&&Math.abs(z-a[1])<a[3]/2&&a[4]<=f+.9&&a[4]>g)g=a[4];
 for(const [cx,cz,L,Wd,d,y0,y1] of MAP.ramps||[]){const al=d<2,u=al?x-cx:z-cz,v=al?z-cz:x-cx;
  if(Math.abs(v)<Wd/2&&Math.abs(u)<L/2){const h=y0+(y1-y0)*(((d%2?-u:u))+L/2)/L;if(h<=f+.9&&h>g)g=h}}return g}
export function buildAdj(st){st.adj=WP.map((a,i)=>WP.map((b,j)=>j!=i&&(Math.abs((a[2]||0)-(b[2]||0))<=.25||(Math.abs((a[2]||0)-(b[2]||0))<=Math.hypot(a[0]-b[0],a[1]-b[1])*.7&&Math.hypot(a[0]-b[0],a[1]-b[1])<=3.2))&&clear(st,a[0],a[1],b[0],b[1],.45,Math.min(a[2]||0,b[2]||0))?j:-1).filter(j=>j>=0))}
export function nearWp(st,x,z,y){let best=-1;for(const r of [.3,.05,-1]){let bd=1e9;WP.forEach((w,i)=>{const d=(w[0]-x)**2+(w[1]-z)**2;if(d<bd&&Math.abs((w[2]||0)-y)<1.5&&(r<0||clear(st,x,z,w[0],w[1],r,Math.min(y,w[2]||0)))){bd=d;best=i}});if(best>=0)break}return best}
export function bfs(adj,a,b){const prev={[a]:-1},q=[a];while(q.length){const c=q.shift();if(c==b)break;for(const n of adj[c])if(!(n in prev)){prev[n]=c;q.push(n)}}
 if(!(b in prev))return[];const path=[];for(let c=b;c!=-1;c=prev[c])path.unshift(c);return path}

export const wst=s=>{const W=WEAPONS[s.id];return s.u?{...W,dmg:W.dmg*2.5,mag:Math.ceil(W.mag*1.5),res:Math.ceil(W.res*1.5),reload:W.reload*.8,n:'Forged '+W.n}:W}; // effective stats
export const note=(st,t)=>{st.ev={n:st.ev.n+1,t}};                                   // one-line event shown to everyone
export const gain=(st,p,n)=>{p.pts+=Math.round(n*(st.dbl>0?2:1)*DIFFS[st.diff].pts)};  // all point income goes through here
export function applyDrop(st,k,p){const names=['DOUBLE POINTS','INSTA-KILL','MAX AMMO','NUKE'];
 if(k==0)st.dbl=30;else if(k==1)st.ik=30;
 else if(k==2){for(const q of Object.values(st.players))for(const s of q.slots){const x=wst(s);s.mag=x.mag;s.res=x.res}}
 else{st.kills+=st.zs.length;st.zs=[];for(const q of Object.values(st.players))if(q.hp>0)gain(st,q,400)}
 note(st,names[k]+'!')}
export function spawnSpotDrop(st){const sp=MAP.powerups||[];if(sp.length&&st.round>1){const s=sp[Math.random()*sp.length|0];st.drops.push({id:st.did++,k:Math.random()*4|0,x:s[0],z:s[1],y:s[2]||0,t:40})}}
export function newPlayer(st,id,name,bot){const n=Object.keys(st.players).length;
 return st.players[id]={id,x:st.map.start[0]+(n>>1)*1.5,z:st.map.start[1]+(n%2?1.5:-1.5),name:name||id,bot:!!bot,online:true,y:0,vy:0,yaw:-Math.PI/2,pitch:0,hp:CFG.maxHp,maxHp:CFG.maxHp,perks:{},spd:1,down:false,dead:false,bleed:0,rev:0,revT:-9,downs:0,revives:0,pts:CFG.startPts,hitT:99,crouch:0,
  slots:[{id:'m1911',mag:8,res:80}],cur:0,reloadT:0,fireT:0,held:false,q:[],last:{f:0,r:0,yaw:-Math.PI/2,pitch:0},ack:0,hits:0,kills:0}}
// movement is shared by the server AND client prediction (same code => same result)
export function moveP(st,p,i,dt){p.yaw=i.yaw;p.pitch=i.pitch;p.crouch+=((i.c?1:0)-p.crouch)*Math.min(1,dt*10);
 const sp=(i.c?CFG.crouch:(i.s&&i.f>0)?CFG.sprint:CFG.walk)*(p.spd||1),mx=-Math.sin(p.yaw)*i.f+Math.cos(p.yaw)*i.r,mz=-Math.cos(p.yaw)*i.f-Math.sin(p.yaw)*i.r,l=Math.hypot(mx,mz)||1;
 p.x+=mx/l*sp*dt;p.z+=mz/l*sp*dt;const g=gy(p.x,p.z,p.y);if(i.j&&p.y<=g+.05)p.vy=CFG.jump;p.vy-=CFG.grav*dt;p.y=Math.max(g,p.y+p.vy*dt);if(p.y<=g)p.vy=0;push(st,p,.4)}

export function stepPlayer(st,p,i,dt){if(p.hp<=0)return;moveP(st,p,i,dt);
 if(i.h){const q=Object.values(st.players).find(q=>q!==p&&q.hp<=0&&!q.dead&&Math.hypot(q.x-p.x,q.z-p.z)<1.8&&Math.abs(q.y-p.y)<1.5); // hold E next to a downed teammate to revive
  if(q){q.rev+=dt*(p.perks.revive?2:1);q.revT=st.t;if(q.rev>=CFG.reviveTime){q.hp=q.maxHp*.5;q.down=false;q.rev=0;q.hitT=0;p.revives++;note(st,p.id+' revived '+q.id)}}}
 p.hitT+=dt;if(p.hitT>CFG.regenDelay)p.hp=Math.min(p.maxHp,p.hp+CFG.regenRate*dt);
 if(i.sw&&p.slots.length>1){p.cur=1-p.cur;p.reloadT=0;p.fireT=.3}
 const w=p.slots[p.cur],W=wst(w);p.fireT-=dt;
 if(p.reloadT>0){p.reloadT-=dt;if(p.reloadT<=0){const n=Math.min(W.mag-w.mag,w.res);w.mag+=n;w.res-=n}}
 else if((i.rl&&w.mag<W.mag&&w.res>0)||(w.mag<=0&&w.res>0))p.reloadT=W.reload*(p.perks.reload?.6:1);
 if(i.fire&&p.reloadT<=0&&p.fireT<=0&&w.mag>0&&(W.auto||!p.held))fire(st,p,i.ft);
 p.held=i.fire;
 if(i.use){const it=nearIt(st,p);if(it&&it.ok){p.pts-=it.cost;it.act()}}}  // purchases validated here, never trusted from the client

// hitscan with basic lag compensation: zombies are rewound (<=0.5s) to the time the shooter was viewing (ft)
export function killZ(st,p,z,head){if(z.dead)return;z.dead=true;st.kills++;p.kills++;gain(st,p,head?CFG.headPts:CFG.killPts);
 if(Math.random()<CFG.dropChance)st.drops.push({id:st.did++,k:Math.random()*4|0,x:z.x,z:z.z,y:z.y,t:CFG.dropLife})}
export function hurt(st,p,W,z,dmg,head){if(z.dead)return;z.hp-=st.ik>0?1e9:dmg;gain(st,p,CFG.hitPts);if(W.burn){z.burn=3;z.bp=p.id}if(z.hp<=0)killZ(st,p,z,head)}
export function fire(st,p,ft){const w=p.slots[p.cur],W=wst(w);w.mag--;p.fireT=60/W.rpm;
 const saved=[],h=st.hist.length?st.hist.reduce((a,b)=>Math.abs(b.t-ft)<Math.abs(a.t-ft)?b:a):null;
 if(h&&st.t-ft<.5&&ft>0)for(const [id,x,z] of h.z){const q=st.zs.find(y=>y.id==id);if(q){saved.push([q,q.x,q.z]);q.x=x;q.z=z}}
 const eye=[p.x,p.y+1.6-.5*p.crouch,p.z];let any=false;
 for(let n=0;n<W.pellets;n++){const yw=p.yaw+(Math.random()-.5)*W.spread*2,pt=p.pitch+(Math.random()-.5)*W.spread*2;
  const d=[-Math.sin(yw)*Math.cos(pt),Math.sin(pt),-Math.cos(yw)*Math.cos(pt)];let wall=W.range||60,wh=0;
  for(const b of solids(st)){const t=slab(eye,d,[b[0]-b[2]/2,b[5]||0,b[1]-b[3]/2],[b[0]+b[2]/2,(b[5]||0)+b[4],b[1]+b[3]/2],wall);if(t<wall){wall=t;wh=1}}
  const hits=[];for(const z of st.zs){const s=z.s,th=raySph(eye,d,[z.x,z.y+1.55*s,z.z],.25*s);
   if(th<wall)hits.push([th,z,true]);else{const tb=Math.min(raySph(eye,d,[z.x,z.y+.45*s,z.z],.4*s),raySph(eye,d,[z.x,z.y+1*s,z.z],.4*s));if(tb<wall)hits.push([tb,z,false])}}
  hits.sort((a,b)=>a[0]-b[0]);
  const hd=hits.slice(0,W.pen);
  if(W.splash){const at=hd.length?hd[0][0]:wh?wall:-1;   // blast centre: first zombie hit, else the wall
   if(at>=0){const c=[eye[0]+d[0]*at,eye[1]+d[1]*at,eye[2]+d[2]*at];
    for(const z of st.zs){const dd=Math.hypot(z.x-c[0],z.y+1-c[1],z.z-c[2]);if(dd<W.splash){any=true;hurt(st,p,W,z,W.dmg*(1-.6*dd/W.splash),false)}}}}
  else hd.forEach(([,z,head],ix)=>{any=true;hurt(st,p,W,z,W.dmg*(head?CFG.headMult:1),head);
   if(W.chain&&ix==0){let cur=z;const used=new Set([z.id]);   // lightning arcs to the nearest zombie within 4.5 m, weaker each hop
    for(let k=1;k<W.chain;k++){let nb=null,bd=4.5;for(const q of st.zs)if(!used.has(q.id)&&!q.dead){const dd=Math.hypot(q.x-cur.x,q.z-cur.z);if(dd<bd){bd=dd;nb=q}}
     if(!nb)break;used.add(nb.id);cur=nb;hurt(st,p,W,nb,W.dmg*Math.pow(.85,k),false)}}});
 }
 for(const [q,x,z] of saved){q.x=x;q.z=z}
 if(any)p.hits++;st.zs=st.zs.filter(z=>!z.dead)}

export function nearIt(st,p){let best=null;
 MAP.doors.forEach((d,i)=>{if(!st.doors[i]&&Math.hypot(d.box[0]-p.x,d.box[1]-p.z)<3.2)best={txt:'Open door',cost:d.cost,act:()=>{st.doors[i]=true;if(st.adj)buildAdj(st)}}});
 for(const wb of MAP.wallbuys)if(Math.hypot(wb.p[0]-p.x,wb.p[1]-p.z)<2.5){const own=p.slots.find(s=>s.id==wb.w),W=WEAPONS[wb.w];
  best=own?{txt:W.n+' ammo',cost:wb.cost/2,act:()=>{const x=wst(own);own.mag=x.mag;own.res=x.res}}
   :{txt:W.n,cost:wb.cost,act:()=>{const s={id:wb.w,mag:W.mag,res:W.res};if(p.slots.length<2)p.slots.push(s);else p.slots[p.cur]=s;p.cur=p.slots.indexOf(s);p.reloadT=0}}}

 for(const pk of MAP.perks||[])if(!p.perks[pk.t]&&Math.hypot(pk.p[0]-p.x,pk.p[1]-p.z)<2.5){const P=PERKS[pk.t];
  best={txt:P.n,cost:P.cost,act:()=>{p.perks[pk.t]=1;if(pk.t=='health'){p.maxHp=150;p.hp+=50}if(pk.t=='speed')p.spd=1.15;note(st,P.n+' acquired')}}}
 const mb=(MAP.mystery||[])[st.mb];  // mystery box: random weapon; with CFG.mysteryMove it relocates after 3-6 uses
 if(mb&&Math.hypot(mb[0]-p.x,mb[1]-p.z)<2.5)best={txt:'Mystery Box',cost:CFG.boxCost,act:()=>{
  const pool=Object.keys(WEAPONS).filter(k=>k!='m1911'),pk=()=>pool[Math.random()*pool.length|0];let id=pk();if(WEAPONS[id].rare&&Math.random()<.6)id=pk(); // rare specials roll less often
  const W=WEAPONS[id],s={id,mag:W.mag,res:W.res},own=p.slots.findIndex(x=>x.id==id);
  if(own>=0){p.slots[own]=s}else if(p.slots.length<2)p.slots.push(s);else p.slots[p.cur]=s;p.cur=p.slots.findIndex(x=>x.id==id);p.reloadT=0;
  let m=p.id+' got the '+W.n;if(CFG.mysteryMove&&++st.mbUses>=st.mbMax){st.mbUses=0;st.mbMax=3+Math.random()*4|0;const L=MAP.mystery.length;st.mb=(st.mb+1+Math.random()*(L-1)|0)%L;m+=' - the box moved!'}note(st,m)}}
 const fg=MAP.forge;if(fg&&Math.hypot(fg[0]-p.x,fg[1]-p.z)<2.5&&!p.slots[p.cur].u)best={txt:'Forge: upgrade weapon',cost:CFG.forgeCost,act:()=>{const s=p.slots[p.cur];s.u=1;const x=wst(s);s.mag=x.mag;s.res=x.res;p.reloadT=0;note(st,'Weapon forged!')}};
 (MAP.switches||[]).slice(0,st.sw.length).forEach((sp,i)=>{if(!st.sw[i]&&Math.hypot(sp[0]-p.x,sp[1]-p.z)<2.2&&Math.abs((sp[2]||0)-p.y)<2)
  best={txt:'Activate switch '+(i+1)+'/'+st.sw.length,cost:0,act:()=>{st.sw[i]=1;const n=st.sw.filter(x=>x).length;st.queue+=Math.floor(4+st.round*1.5); // each switch calls a horde
   if(n==st.sw.length){st.over=true;st.won=true;note(st,'ALL SWITCHES ON - YOU ESCAPED!')}else note(st,'Switch '+n+'/'+st.sw.length+' on - a horde is coming!')}}});
 if(best)best.ok=p.pts>=best.cost;return best}

export function spawnZ(st,alive){let sp=MAP.spawns.filter(s=>s.door==null||[].concat(s.door).some(d=>st.doors[d]));
 const far=sp.filter(s=>alive.every(p=>Math.hypot(s.p[0]-p.x,s.p[1]-p.z)>12));if(far.length)sp=far;const s=sp[Math.random()*sp.length|0];
 const r=st.round,u=Math.random();let k=0,hp=60+r*30,spd=1.5+Math.min(r*.08,1);
 if(r%CFG.bossEvery==0&&st.bossLeft>0){k=3;st.bossLeft--;hp=1200+r*350;spd=2.6}
 else if(r>=4&&u<.07){k=2;hp*=4;spd=2}
 else if(r>=2&&u<Math.min(.5,.1+r*.06)){k=1;hp*=.7;spd=4.2+Math.min(r*.1,1)}
 {const df=DIFFS[st.diff];hp*=df.hp;spd*=df.spd}st.zs.push({id:st.zid++,x:s.p[0],z:s.p[1],y:s.y||0,hp,max:hp,sp:spd,k,s:TSCALE[k],yaw:0,atk:0,pathT:0,path:null})}

export function stepWorld(st,dt){if(st.over)return;const ps=Object.values(st.players),alive=ps.filter(p=>p.hp>0);
 for(const p of ps)if(p.hp<=0){p.hp=0;if(!p.down){p.down=true;p.bleed=ps.length>1?CFG.bleed:0;p.rev=0;p.downs++;note(st,p.id+' is down!')}   // downed: bleeds out unless revived
  if(!p.dead){p.bleed-=dt;if(st.t-p.revT>.2)p.rev=0;if(p.bleed<=0){p.dead=true;p.bleed=0;note(st,p.id+' bled out')}}}
 if(ps.length&&(CFG.endOnFirstDown?alive.length<ps.length:ps.every(q=>q.dead))){st.over=true;return}
 st.pings=st.pings.filter(g=>st.t-g.t<8);st.dbl=Math.max(0,st.dbl-dt);st.ik=Math.max(0,st.ik-dt);
 for(const d of st.drops){d.t-=dt;for(const p of alive)if(!d.got&&Math.hypot(p.x-d.x,p.z-d.z)<1.6&&Math.abs(p.y-d.y)<1.5){d.got=1;applyDrop(st,d.k,p)}}
 st.drops=st.drops.filter(d=>d.t>0&&!d.got);
 st.pause-=dt;
 if(st.queue==0&&st.zs.length==0&&st.pause<=0){st.round++;st.queue=Math.floor((5+st.round*2.5)*DIFFS[st.diff].cnt)+(ps.length-1)*3;st.bossLeft=st.round%CFG.bossEvery==0?1:0;
  if(st.bossLeft)st.queue=Math.min(st.queue,6)+1;st.pause=CFG.roundPause;st.spawnT=2;spawnSpotDrop(st)}
 else if(st.queue>0){st.spawnT-=dt;if(st.spawnT<=0&&st.zs.length<CFG.maxAlive){spawnZ(st,alive);st.queue--;st.spawnT=CFG.spawnGap}}
 for(const z of st.zs)if(z.burn>0){z.burn-=dt;z.hp-=25*dt;if(z.hp<=0&&st.players[z.bp])killZ(st,st.players[z.bp],z,false)} // fire damage over time
 for(const z of st.zs)if(z.dead&&0){}
 st.zs=st.zs.filter(z=>!z.dead);
 for(const z of alive.length?st.zs:[]){const p=alive.reduce((a,b)=>Math.hypot(b.x-z.x,b.z-z.z)<Math.hypot(a.x-z.x,a.z-z.z)?b:a);
  z.pathT-=dt;const dx=p.x-z.x,dz=p.z-z.z,dist=Math.hypot(dx,dz);let tx=p.x,tz=p.z;
  if(Math.abs(p.y-z.y)>1.2||!clear(st,z.x,z.z,p.x,p.z,.35,Math.min(p.y,z.y))){if(z.pathT<=0){z.pathT=.4+Math.random()*.2;const a=nearWp(st,z.x,z.z,z.y),b=nearWp(st,p.x,p.z,p.y);z.path=a<0||b<0?[]:bfs(st.adj,a,b)}
   const path=z.path||[];for(let n=path.length-1;n>=0;n--){const w=WP[path[n]];if(Math.hypot(w[0]-z.x,w[1]-z.z)<.6)continue;if(Math.abs((w[2]||0)-z.y)<1.5&&(n==0||clear(st,z.x,z.z,w[0],w[1],.35,Math.min(z.y,w[2]||0)))){tx=w[0];tz=w[1];break}}}
  else z.path=null;
  const ex=tx-z.x,ez=tz-z.z,el=Math.hypot(ex,ez)||1;
  if(dist>CFG.zReach*z.s){z.x+=ex/el*z.sp*dt;z.z+=ez/el*z.sp*dt}{const mv=dist>CFG.zReach*z.s,want=Math.atan2(mv?ex:dx,mv?ez:dz);let da=want-z.yaw;da=Math.atan2(Math.sin(da),Math.cos(da));z.yaw+=Math.max(-8*dt,Math.min(8*dt,da))}
  z.atk-=dt;if(dist<CFG.zReach*z.s+.4&&Math.abs(p.y-z.y)<1.2&&z.atk<=0){z.atk=CFG.zHitCd;p.hp-=CFG.zDmg*(z.k==3?2:1)*DIFFS[st.diff].dmg;p.hitT=0}
  push(st,z,.35);z.y=gy(z.x,z.z,z.y)}
 for(let i=0;i<st.zs.length;i++)for(let j=i+1;j<st.zs.length;j++){const a=st.zs[i],b=st.zs[j],dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz)||.01,m=.7*(a.s+b.s)/2;
  if(d<m){const k=(m-d)/2/d;a.x-=dx*k;a.z-=dz*k;b.x+=dx*k;b.z+=dz*k}}
 st.hist.push({t:st.t,z:st.zs.map(z=>[z.id,z.x,z.z])});if(st.hist.length>15)st.hist.shift()}

/** Chat line (kept for the last 8 messages; shipped inside snapshots). */
export function addChat(st,p,text){st.chat.push({n:++st.cn,id:p.id,name:p.name,t:String(text).slice(0,120)});if(st.chat.length>8)st.chat.shift()}
/** Ping marker: ray from the player's eye along the view direction; lands on the first wall within 40 m (or 30 m out). One marker per player. */
export function addPing(st,p){const eye=[p.x,p.y+1.6-.5*p.crouch,p.z],d=[-Math.sin(p.yaw)*Math.cos(p.pitch),Math.sin(p.pitch),-Math.cos(p.yaw)*Math.cos(p.pitch)];let t=30;
 for(const b of solids(st)){const h=slab(eye,d,[b[0]-b[2]/2,b[5]||0,b[1]-b[3]/2],[b[0]+b[2]/2,(b[5]||0)+b[4],b[1]+b[3]/2],t);if(h<t)t=h}
 const y=eye[1]+d[1]*t;st.pings=st.pings.filter(g=>g.o!==p.id);st.pings.push({id:st.pn++,o:p.id,x:eye[0]+d[0]*t,y:Math.max(0,y),z:eye[2]+d[2]*t,t:st.t});if(st.pings.length>8)st.pings.shift()}
/** Wire snapshot (compact arrays; see shared/protocol.js for the field list). */
export function snapshot(st){const f=v=>+v.toFixed(2);
 return{m:'s',t:st.t,rd:st.round,q:st.queue+st.zs.length,ks:st.kills,d:st.doors,o:st.over,wn:st.won?1:0,df:st.diff,sw:st.sw,mb:st.mb,dbl:Math.ceil(st.dbl),ik:Math.ceil(st.ik),ev:[st.ev.n,st.ev.t],
  ch:st.chat.map(c=>[c.n,c.id,c.name,c.t]),dr:st.drops.map(d=>[d.id,d.k,f(d.x),f(d.z),f(d.y)]),pg:st.pings.map(g=>[g.id,g.o,f(g.x),f(g.y),f(g.z)]),
  z:st.zs.map(z=>[z.id,f(z.x),f(z.z),f(z.yaw),z.k,Math.round(z.hp/z.max*100),f(z.y)]),
  p:Object.values(st.players).map(p=>{const w=p.slots[p.cur];return[p.id,f(p.x),f(p.y),f(p.z),f(p.yaw),f(p.pitch),Math.round(p.hp),Math.floor(p.pts),w.id+(w.u?'*':''),w.mag,w.res,p.reloadT>0?1:0,f(p.vy),f(p.crouch),p.ack,p.hits,p.kills,p.maxHp,Object.keys(p.perks).join(),p.spd,p.slots.map(s=>s.id+(s.u?'*':'')).join(),Math.round(p.rev/CFG.reviveTime*100),p.hp<=0?Math.ceil(p.bleed):0,p.downs,p.revives,p.dead?1:0,p.name,p.bot?1:0,p.online?1:0]})}}
// ---- input validation (server side): never trust the client ----
const num=(v,lo,hi)=>Math.min(hi,Math.max(lo,+v||0));
export const sanitizeInput=m=>({seq:m.seq|0,f:Math.sign(+m.f||0),r:Math.sign(+m.r||0),j:!!m.j,c:!!m.c,s:!!m.s,yaw:num(m.yaw,-1e4,1e4),pitch:num(m.pitch,-1.5,1.5),fire:!!m.fire,rl:!!m.rl,sw:!!m.sw,use:!!m.use,h:!!m.h,ft:+m.ft||0});
