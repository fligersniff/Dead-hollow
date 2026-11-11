// Client entry (Vite bundles this). Three.js scene + input + HUD + prediction/interpolation, talking to the server over WebSocket (/ws).
// Sections: renderer & procedural world visuals -> player rigs -> settings -> network & screens -> input -> HUD -> main loop.
import * as THREE from 'three';
import { CFG, WEAPONS, PERKS, DIFFS } from '../../shared/config.js';
import { setMap, moveP, nearIt, TSCALE } from '../../shared/sim.js';
import { MAPS, MAP_LIST } from './maps.js';
let MAP = MAPS.yard;  // swapped when the server announces a map
setMap(MAP);

const $=id=>document.getElementById(id),cv=$('c');
const R=new THREE.WebGLRenderer({canvas:cv,antialias:false});R.setPixelRatio(.6); // chunky retro pixels
const sc=new THREE.Scene();sc.background=new THREE.Color(0x0a0e0c);sc.fog=new THREE.Fog(0x0a0e0c,4,30);
const cam=new THREE.PerspectiveCamera(80,1,.1,60);cam.rotation.order='YXZ';sc.add(cam);
sc.add(new THREE.HemisphereLight(0x8899aa,0x221a14,.55));
const torch=new THREE.PointLight(0xffe2b0,1,24);cam.add(torch);
const mat=c=>new THREE.MeshLambertMaterial({color:c}),bx=(b,c)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(b[2],b[4],b[3]),mat(c));m.position.set(b[0],(b[5]||0)+b[4]/2,b[1]);mapGrp.add(m);return m};
// ===== WORLD VISUALS: procedural pixel textures + props built from primitives (no external assets) =====
const rnd=(s=>()=>(s=(s*16807)%2147483647)/2147483647)(12345);
const PM=c=>new THREE.MeshPhongMaterial({color:c,flatShading:true,shininess:20}),LM=o=>new THREE.MeshLambertMaterial(o),EM=c=>new THREE.MeshBasicMaterial({color:c});
const bm=(w,h,d,m,x,y,z,g)=>{const q=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);q.position.set(x,y,z);g.add(q);return q};
const noise=(x,c,n,a)=>{for(let i=0;i<n;i++){x.fillStyle=`rgba(${c},${rnd()*a})`;x.fillRect(rnd()*64|0,rnd()*64|0,2,2)}};
const TX={ // 64x64 tiles, drawn once, sampled with NearestFilter for the chunky retro look
 brick:x=>{x.fillStyle='#3a2420';x.fillRect(0,0,64,64);for(let r=0;r<8;r++)for(let c=0;c<5;c++){const v=40+rnd()*35|0;x.fillStyle=`rgb(${v+80},${v+32},${v+22})`;x.fillRect(c*16+(r%2?-8:0)+1,r*8+1,14,6)}},
 plaster:x=>{x.fillStyle='#8a8576';x.fillRect(0,0,64,64);noise(x,'0,0,0',140,.14);x.fillStyle='#5a5546';x.fillRect(0,58,64,6);x.fillStyle='rgba(60,50,30,.25)';x.fillRect(10,0,3,40)},
 panel:x=>{x.fillStyle='#9aa4a8';x.fillRect(0,0,64,64);x.fillStyle='#6e777b';x.fillRect(0,0,64,2);x.fillRect(0,0,2,64);x.fillRect(31,0,2,64);for(let i=0;i<4;i++){x.fillStyle='#5a6266';x.fillRect(6,10+i*14,20,4)}x.fillStyle='#3aa0c0';x.fillRect(40,26,16,6)},
 concrete:x=>{x.fillStyle='#777770';x.fillRect(0,0,64,64);noise(x,'0,0,0',200,.2);noise(x,'255,255,255',60,.12)},
 planks:x=>{for(let i=0;i<4;i++){const v=90+rnd()*40|0;x.fillStyle=`rgb(${v},${v*.7|0},${v*.45|0})`;x.fillRect(i*16,0,15,64);x.fillStyle='#2a1a10';x.fillRect(i*16+15,0,1,64)}noise(x,'0,0,0',60,.15)},
 tile:x=>{for(let i=0;i<4;i++)for(let j=0;j<4;j++){const v=84+((i+j)%2)*16+rnd()*8|0;x.fillStyle=`rgb(${v},${v+6},${v+4})`;x.fillRect(i*16,j*16,15,15)}x.fillStyle='#2a2e2e';for(let i=0;i<4;i++){x.fillRect(i*16+15,0,1,64);x.fillRect(0,i*16+15,64,1)}},
 gravel:x=>{x.fillStyle='#3a3a32';x.fillRect(0,0,64,64);noise(x,'255,255,240',160,.18);noise(x,'0,0,0',160,.25)},
 crate:x=>{x.fillStyle='#6a4a2a';x.fillRect(0,0,64,64);x.fillStyle='#4a3018';for(let i=0;i<4;i++)x.fillRect(0,i*16+14,64,2);x.fillRect(0,0,4,64);x.fillRect(60,0,4,64);x.fillRect(0,0,64,4);x.fillRect(0,60,64,4);noise(x,'0,0,0',60,.2)},
 bar:x=>{x.fillStyle='#2a1c12';x.fillRect(0,0,64,64);for(let i=0;i<5;i++){const v=60+rnd()*30|0;x.fillStyle=`rgb(${v+20},${v},${v-20})`;x.fillRect(2,i*12+2,60,9)}x.strokeStyle='#8a2a1a';x.lineWidth=5;x.beginPath();x.moveTo(0,0);x.lineTo(64,64);x.moveTo(64,0);x.lineTo(0,64);x.stroke();x.fillStyle='#bbb';for(const[a,b]of[[6,6],[56,6],[6,56],[56,56],[32,32]])x.fillRect(a,b,3,3)}};
const TH={yard:{wall:'plaster',floor:'gravel',cap:0x6a6658,trim:0x3a362c},lab:{wall:'panel',floor:'tile',cap:0x7a848a,trim:0x40484c},manor:{wall:'brick',floor:'planks',cap:0x4a342a,trim:0x2a1c16}};
const texC={};function tx(n,rx,ry){const b=texC[n]||(texC[n]=(()=>{const c=document.createElement('canvas');c.width=c.height=64;TX[n](c.getContext('2d'));const q=new THREE.CanvasTexture(c);q.wrapS=q.wrapT=THREE.RepeatWrapping;q.magFilter=q.minFilter=THREE.NearestFilter;return q})()),q=b.clone();q.needsUpdate=true;q.repeat.set(rx,ry);return q}
function label(txt,col='#ffe9a0',sz=.5){const c=document.createElement('canvas');c.width=256;c.height=64;const x=c.getContext('2d');x.font='bold '+Math.min(30,Math.floor(240/(txt.length*.62)))+'px monospace';x.textAlign='center';
 x.fillStyle='rgba(0,0,0,.55)';x.fillRect(0,8,256,48);x.fillStyle=col;x.fillText(txt,128,42);
 const s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false}));s.scale.set(sz*4,sz,1);return s}
function wallBox(b,th){const [cx,cz,w,d,h]=b,y0=b[5]||0,g=new THREE.Group();g.position.set(cx,y0,cz);
 if(h==3&&w<=2.2&&d<=2.2){const c=new THREE.Mesh(new THREE.CylinderGeometry(w*.44,w*.5,h,8),LM({map:tx('concrete',1.5,1.5)}));c.position.y=h/2;g.add(c);bm(w+.1,.15,d+.1,PM(0x2a2a2c),0,h+.07,0,g);return g} // pillars -> columns
 const nm=h<4?'crate':th.wall,m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),[LM({map:tx(nm,d/2,h/2)}),LM({map:tx(nm,d/2,h/2)}),LM({color:th.cap}),LM({color:th.cap}),LM({map:tx(nm,w/2,h/2)}),LM({map:tx(nm,w/2,h/2)})]);
 m.position.y=h/2;g.add(m);bm(w+.1,.14,d+.1,PM(th.trim),0,h+.07,0,g);if(h>=4)bm(w+.08,.3,d+.08,PM(th.trim),0,.15,0,g);return g}  // cap + skirting
const slabMat=(w,d)=>[0,1,2,3,4,5].map(i=>i==2?LM({map:tx('planks',w/2,d/2)}):LM({color:0x2a2018}));
function setSw(g,vis,on){g.visible=vis;g.lamp.material.color.setHex(on?0x3adf5a:0xdf3a3a);g.lever.rotation.z=on?-.7:.7}
function makeDrop(k){const g=new THREE.Group(),c=[0xe8c32a,0xdd2222,0x2add55,0xffffff][k];
 g.add(new THREE.Mesh(new THREE.OctahedronGeometry(.32),EM(c)));const r=new THREE.Mesh(new THREE.TorusGeometry(.5,.04,6,16),EM(c));r.rotation.x=Math.PI/2;g.add(r);
 const l=label(['2X POINTS','INSTA-KILL','MAX AMMO','NUKE'][k],'#ffffff',.35);l.position.y=.9;g.add(l);return g}
{const n=400,pos=new Float32Array(n*3);for(let i=0;i<n;i++){const a=rnd()*6.283,e=rnd()*1.3+.1;pos[i*3]=Math.cos(a)*Math.cos(e)*85;pos[i*3+1]=Math.sin(e)*85;pos[i*3+2]=Math.sin(a)*Math.cos(e)*85}
 const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.BufferAttribute(pos,3));sc.add(new THREE.Points(sg,new THREE.PointsMaterial({size:2,sizeAttenuation:false,color:0xcfd8ff,fog:false})));
 const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d'),gr=x.createRadialGradient(32,32,8,32,32,32);gr.addColorStop(0,'#fffbe8');gr.addColorStop(.5,'#cfd8ff');gr.addColorStop(1,'rgba(150,170,255,0)');x.fillStyle=gr;x.fillRect(0,0,64,64);
 const mo=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),fog:false,depthWrite:false}));mo.position.set(-35,38,-60);mo.scale.set(16,16,1);sc.add(mo)}
const mapGrp=new THREE.Group();sc.add(mapGrp);let doorM=[],mysM=[],swM=[];
function buildMap(){while(mapGrp.children.length)mapGrp.remove(mapGrp.children[0]);
 const th=TH[MAP.theme||'yard'],[sw,sd]=MAP.size,fl=new THREE.Mesh(new THREE.PlaneGeometry(sw,sd),LM({map:tx(th.floor,sw/2,sd/2)}));fl.rotation.x=-Math.PI/2;mapGrp.add(fl);
 for(const b of MAP.boxes)mapGrp.add(wallBox(b,th));
 for(const [cx,cz,w,d,top] of MAP.floors||[]){const q=new THREE.Mesh(new THREE.BoxGeometry(w,.3,d),slabMat(w,d));q.position.set(cx,top-.15,cz);mapGrp.add(q)}
 for(const [cx,cz,L,Wd,dr,y0,y1] of MAP.ramps||[]){const al=dr<2,a=Math.atan2(y1-y0,L),q=new THREE.Mesh(new THREE.BoxGeometry(al?L:Wd,.3,al?Wd:L),slabMat(al?L:Wd,al?Wd:L));
  q.position.set(cx,(y0+y1)/2-.15,cz);if(al)q.rotation.z=dr?-a:a;else q.rotation.x=dr==2?-a:a;mapGrp.add(q)}
 doorM=MAP.doors.map(d=>{const g=new THREE.Group(),[x,z,w,dd,h]=d.box;g.position.set(x,0,z);bm(w,h,dd,LM({map:tx('bar',1,1)}),0,h/2,0,g);const l=label('DOOR $'+d.cost);l.position.y=h+.5;g.add(l);mapGrp.add(g);return g});
 for(const w of MAP.wallbuys){const g=new THREE.Group();g.position.set(w.p[0],0,w.p[1]);bm(.7,.9,.7,LM({map:tx('crate',1,1)}),0,.45,0,g);bm(.76,.06,.76,EM(0xe8c32a),0,.93,0,g);
  const l=label(WEAPONS[w.w].n+' $'+w.cost);l.position.y=1.6;g.add(l);mapGrp.add(g)}
 const PC={reload:0x2a6ac8,health:0xc82a2a,speed:0x2ac86a,revive:0xc8c82a};
 for(const p of MAP.perks||[]){const g=new THREE.Group(),c=PC[p.t];g.position.set(p.p[0],0,p.p[1]);   // perk machines: capsule tank with glowing band
  const b=new THREE.Mesh(new THREE.CylinderGeometry(.42,.48,1.9,8),PM(c));b.position.y=.95;g.add(b);
  const r=new THREE.Mesh(new THREE.CylinderGeometry(.46,.46,.22,8),EM(c));r.position.y=1.35;g.add(r);
  const tp=new THREE.Mesh(new THREE.SphereGeometry(.42,8,4,0,Math.PI*2,0,Math.PI/2),PM(0x222226));tp.position.y=1.9;g.add(tp);
  const l=label(PERKS[p.t].n+' $'+PERKS[p.t].cost,'#bfe8ff');l.position.y=2.7;g.add(l);mapGrp.add(g)}
 mysM=(MAP.mystery||[]).map(p=>{const g=new THREE.Group();g.position.set(p[0],0,p[1]);   // mystery box: chest + gold bands + light beam visible from afar
  bm(1,.5,.7,PM(0x6a4220),0,.25,0,g);bm(1.04,.22,.74,PM(0x7a4a24),0,.61,0,g);bm(.1,.76,.78,PM(0xe0b030),-.3,.38,0,g);bm(.1,.76,.78,PM(0xe0b030),.3,.38,0,g);
  const q=label('?','#e0a0ff',1);q.position.y=1.6;g.add(q);const l=label('MYSTERY BOX $'+CFG.boxCost,'#e0a0ff');l.position.y=2.4;g.add(l);
  const bc=new THREE.Mesh(new THREE.CylinderGeometry(.3,.3,10,8,1,true),new THREE.MeshBasicMaterial({color:0xb04aff,transparent:true,opacity:.16,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));bc.position.y=5;g.add(bc);mapGrp.add(g);return g});
 if(MAP.forge){const g=new THREE.Group();g.position.set(MAP.forge[0],0,MAP.forge[1]);bm(1.2,1,1.2,PM(0x44444a),0,.5,0,g);bm(.9,.05,.9,EM(0xff6a1a),0,1.02,0,g);bm(.55,.25,.28,PM(0x1a1a1e),0,1.17,0,g);bm(.3,.2,.2,PM(0x1a1a1e),0,1.0,0,g);
  const l=label('FORGE $'+CFG.forgeCost,'#ffb070');l.position.y=2.1;g.add(l);mapGrp.add(g)}
 swM=(MAP.switches||[]).map(p=>{const g=new THREE.Group();g.position.set(p[0],p[2]||0,p[1]);bm(.6,.1,.6,PM(0x333338),0,.05,0,g);bm(.12,.8,.12,PM(0x555560),0,.45,0,g);
  g.lever=new THREE.Group();g.lever.position.set(0,.65,.1);g.add(g.lever);bm(.07,.5,.07,PM(0xcccccc),0,.25,0,g.lever);
  g.lamp=new THREE.Mesh(new THREE.SphereGeometry(.11,6,4),EM(0xdf3a3a));g.lamp.position.y=.95;g.add(g.lamp);const l=label('SWITCH','#ff9090',.3);l.position.y=1.5;g.add(l);mapGrp.add(g);return g});
 cam.far=90}
const gun=new THREE.Group();gun.position.set(.25,-.22,-.5);cam.add(gun);
// zombie/player model pool: faceted low-poly rig (tapered torso, ico-sphere head with glowing eyes, jointed arms and legs, hunched posture).
// Geometry is shared by every rig; materials are per rig so each can be tinted by type.
const zPool=[];
const G={torso:new THREE.CylinderGeometry(.2,.26,.62,7),pelvis:new THREE.CylinderGeometry(.22,.2,.22,7),head:new THREE.IcosahedronGeometry(.2,0),
 jaw:new THREE.BoxGeometry(.18,.07,.16),hair:new THREE.ConeGeometry(.17,.14,5),eye:new THREE.OctahedronGeometry(.035),
 arm:new THREE.CylinderGeometry(.06,.045,.52,5),hand:new THREE.IcosahedronGeometry(.07,0),leg:new THREE.CylinderGeometry(.09,.07,.74,5),foot:new THREE.BoxGeometry(.13,.07,.24)};
const pm=c=>new THREE.MeshPhongMaterial({color:c,flatShading:true,shininess:0,specular:0x000000});
function part(parent,geo,mt,x,y,z){const m=new THREE.Mesh(geo,mt);m.position.set(x,y,z);parent.add(m);return m}
function getZ(){let g=zPool.pop();
 if(!g){g=new THREE.Group();const M=g.mats={skin:pm(0x8aa878),shirt:pm(0x3d5a3a),pants:pm(0x2a3040),eye:new THREE.MeshBasicMaterial({color:0xffe040})};
  part(g,G.pelvis,M.pants,0,.8,0);
  g.torso=new THREE.Group();g.torso.position.y=.9;g.torso.rotation.x=.22;g.add(g.torso);
  part(g.torso,G.torso,M.shirt,0,.3,0);
  g.head=new THREE.Group();g.head.position.set(0,.76,.05);g.torso.add(g.head);
  part(g.head,G.head,M.skin,0,0,0).scale.set(1,1.15,1);part(g.head,G.jaw,M.pants,0,-.15,.07);part(g.head,G.hair,M.pants,0,.17,-.03);
  part(g.head,G.eye,M.eye,-.07,.03,.17);part(g.head,G.eye,M.eye,.07,.03,.17);
  const arm=sx=>{const a=new THREE.Group();a.position.set(sx*.29,.55,0);g.torso.add(a);part(a,G.arm,M.skin,0,-.26,0);part(a,G.hand,M.skin,0,-.56,0);return a};
  g.aL=arm(-1);g.aR=arm(1);
  const leg=sx=>{const l=new THREE.Group();l.position.set(sx*.13,.78,0);g.add(l);part(l,G.leg,M.pants,0,-.37,0);part(l,G.foot,M.pants,0,-.74,.06);return l};
  g.lL=leg(-1);g.lR=leg(1);sc.add(g)}
 g.visible=true;return g}
function freeZ(g){g.visible=false;if(g.lab){g.remove(g.lab);g.lab.material.map.dispose();g.lab.material.dispose();g.lab=null;g.labT=null}zPool.push(g)}
// per-type look (k 0 walker,1 runner,2 tank,3 boss; pl = a player). Tanks/boss are bulkier, runners lean in.
function look(g,pl,col,k){const M=g.mats;M.shirt.color.setHex(col);
 M.skin.color.setHex(pl?0xd8b090:[0x8aa878,0x9a8a6a,0x7a7a9a,0x9a5a5a][k]);M.pants.color.setHex(pl?0x2a3550:[0x2a3040,0x3a2a2a,0x2a2a3a,0x2a1a1a][k]);
 M.eye.color.setHex(pl?0x222222:k==3?0xff2020:k==2?0xc070ff:0xffe040);
 g.torso.scale.set(k>=2?1.3:1,1,k>=2?1.25:1);g.torso.rotation.x=pl?.05:k==1?.4:.22}
const TINT={walker:0x3d5a3a,runner:0x8a4a2a,tank:0x4a3a6a,boss:0x8a1a1a};
const TINTK=[0x3d5a3a,0x8a4a2a,0x4a3a6a,0x8a1a1a];
// helpers for the HUD / drops. WD: weapon stats from the snapshot id ('*' suffix = forged)
const WD=s=>{const u=s.endsWith('*'),W=WEAPONS[u?s.slice(0,-1):s];return u?{...W,n:'Forged '+W.n}:W};
const MODE=(s,m)=>s.df[0].toUpperCase()+s.df.slice(1)+(s.sw.length?' · switches '+s.sw.filter(x=>x).length+'/'+s.sw.length:'')+(s.dbl?' · 2x POINTS '+s.dbl:'')+(s.ik?' · INSTA-KILL '+s.ik:'')+(m[18]?' · '+m[18].split(',').map(k=>PERKS[k].n).join(', '):'')+'<br>';
// first-person weapon model, rebuilt when the weapon changes: shape by class (pistol / long gun / shotgun / LMG / bolt-action / energy), plus hands
let gunId=null;
function setGun(id){gunId=id;while(gun.children.length)gun.remove(gun.children[0]);const W=WD(id),g=W.gid,pistol=g==1||g==4,sg=W.pellets>=8,lmg=W.mag>=100,bolt=[2,11,19,58].includes(g),en=!!(W.splash||W.chain),
 L=pistol?.22:lmg?.62:bolt?.72:sg?.56:.46,mt=c=>new THREE.MeshPhongMaterial({color:c,flatShading:true,shininess:40});
 const add=(geo,c,x,y,z)=>{const q=new THREE.Mesh(geo,mt(c));q.position.set(x,y,z);gun.add(q);return q};
 add(new THREE.BoxGeometry(.07,.09,L),en?0x20906e:0x2a2a2e,0,0,.05-L/2);
 add(new THREE.CylinderGeometry(.018,.022,L*.8,6),0x111114,0,.02,-L*.8).rotation.x=Math.PI/2;
 if(!pistol)add(new THREE.BoxGeometry(.06,.1,.24),0x6b4a2a,0,-.03,.2);
 if(!sg&&!bolt)add(new THREE.BoxGeometry(.04,lmg?.1:.15,.06),0x1a1a1a,0,-.11,-.08);
 add(new THREE.BoxGeometry(.05,.1,.05),0x6b4a2a,0,-.09,.03);
 if(en)gun.add(new THREE.Mesh(new THREE.BoxGeometry(.05,.05,.04),new THREE.MeshBasicMaterial({color:0x40ffd0}))).position.set(0,.03,-L*1.15);
 add(new THREE.BoxGeometry(.06,.07,.1),0x8a7a60,0,-.13,.04);add(new THREE.BoxGeometry(.06,.06,.1),0x8a7a60,-.02,-.1,-L*.45)}
const dropM=new Map(),DC=[0xe8c32a,0xdd2222,0x2add55,0xffffff];
function updDrops(list){const seen=new Set(),T=performance.now();for(const [id,k,x,z,y] of list||[]){seen.add(id);let m=dropM.get(id);
 if(!m){m=makeDrop(k);sc.add(m);dropM.set(id,m)}
 m.position.set(x,y+1+Math.sin(T/300)*.15,z);m.rotation.y=T/500}
 for(const [id,m] of dropM)if(!seen.has(id)){sc.remove(m);dropM.delete(id)}}
// ===== SETTINGS (saved in this browser) =====
const QUAL = [{ n: 'Chunky (fastest)', pr: .6 }, { n: 'Normal', pr: .85 }, { n: 'Sharp', pr: Math.min(1.5, devicePixelRatio || 1) }];
const S = { sens: 4, fov: 80, vol: 5, q: 0 };
try { Object.assign(S, JSON.parse(localStorage.getItem('dh-settings') || '{}')); } catch (e) {}
const saveS = () => { try { localStorage.setItem('dh-settings', JSON.stringify(S)); } catch (e) {} };
const SETROWS = [['sens', 'Sensitivity', 1, 10], ['fov', 'FOV', 60, 110], ['vol', 'Volume', 0, 10]];
const settingsHTML = SETROWS.map(([k, l, a, b]) => `<label>${l} <input type="range" data-k="${k}" min="${a}" max="${b}"></label>`).join('')
  + `<label>Graphics <select data-k="q">${QUAL.map((q, i) => `<option value="${i}">${q.n}</option>`).join('')}</select></label>`;
$('settings1').innerHTML = $('settings2').innerHTML = settingsHTML;
const syncSettings = () => document.querySelectorAll('[data-k]').forEach(el => { el.value = S[el.dataset.k]; });
function resize() { R.setPixelRatio(QUAL[S.q] ? QUAL[S.q].pr : .6); R.setSize(innerWidth, innerHeight, false); cam.aspect = innerWidth / innerHeight; cam.fov = S.fov; cam.updateProjectionMatrix(); }
document.addEventListener('input', e => { const k = e.target.dataset && e.target.dataset.k; if (!k) return; S[k] = +e.target.value; saveS(); syncSettings(); resize(); });
addEventListener('resize', resize); syncSettings(); resize();

// ===== STATE =====
const esc = s => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const view = { yaw: -Math.PI / 2, pitch: 0 };
let K = {}, mouseDown = false, wantUse = false, wantReload = false, wantSwap = false, kick = 0, flash = 0, hitT = 0, running = false, locked = false, msgT = 0, msgTxt = '', lastRd = 0, lastFire = 0, lastHeld = false;
let wasOver = false, lastEv = 0, chatting = false, sbOn = false, chLog = [], lastCh = 0, lastPg = 0;
let AC, ws = null, sess = null, myPid = null, room = null, lat = 0, retry = 0, retryT = null, pendingFirst = null, cl = null, inGame = false, scr = 'menu', gotHello = false, names = {};
try { sess = JSON.parse(sessionStorage.getItem('dh-sess') || 'null'); } catch (e) {}
const saveSess = () => { try { sessionStorage.setItem('dh-sess', JSON.stringify(sess)); } catch (e) {} };
const clearSess = () => { sess = null; try { sessionStorage.removeItem('dh-sess'); } catch (e) {} };
const syncDoors = d => doorM.forEach((m, i) => { m.visible = !d[i]; });

// ===== AUDIO (all synthesised) =====
const vol = () => S.vol / 10;
function snd(f, d, type = 'square', g = .15, sl = 0) {
  if (!AC) return; const t = AC.currentTime, o = AC.createOscillator(), v = AC.createGain(); o.type = type; o.frequency.setValueAtTime(f, t);
  if (sl) o.frequency.exponentialRampToValueAtTime(Math.max(20, f + sl), t + d); v.gain.setValueAtTime(g * vol() + 1e-4, t); v.gain.exponentialRampToValueAtTime(.001, t + d); o.connect(v).connect(AC.destination); o.start(); o.stop(t + d);
}

// ===== CLIENT NET: prediction + reconciliation for me, interpolation (~100 ms behind) for everyone else =====
const send = o => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
class Client {
  constructor(id) {
    this.id = id; this.seq = 0; this.pend = []; this.buf = []; this.off = null; this.srv = null; this.over = false; this.doors = MAP.doors.map(() => false);
    this.me = { x: MAP.start[0], y: 0, z: MAP.start[1], vy: 0, yaw: -Math.PI / 2, pitch: 0, crouch: 0 };
  }
  rt() { return performance.now() / 1000 + (this.off || 0) - .1; }          // render time on the server clock
  tick(inp) {
    inp.seq = ++this.seq; inp.ft = this.rt(); this.pend.push(inp); if (this.pend.length > 90) this.pend.shift();
    moveP({ doors: this.doors }, this.me, inp, CFG.tick);                   // predict immediately
    send({ m: 'i', ...inp });
  }
  onSnap(s) {
    const o = s.t - performance.now() / 1000; this.off = this.off == null ? o : this.off * .9 + o * .1; this.buf.push(s); if (this.buf.length > 20) this.buf.shift();
    this.doors = s.d; this.over = !!s.o; this.wn = s.wn; syncDoors(s.d);
    const m = s.p.find(a => a[0] == this.id); if (!m) return; const old = this.srv; this.srv = m;
    Object.assign(this.me, { x: m[1], y: m[2], z: m[3], vy: m[12], crouch: m[13], spd: m[19] });   // snap to authoritative state, then replay unacknowledged inputs
    this.pend = this.pend.filter(i => i.seq > m[14]); for (const i of this.pend) moveP({ doors: this.doors }, this.me, i, CFG.tick);
    if (old) { if (m[15] > old[15]) hitT = .12; if (m[6] < old[6] - 1) { $('dmg').style.opacity = 1; snd(80, .2, 'sawtooth', .2, -30); } }
  }
  sample() {
    const t = this.rt(), b = this.buf; let a = null, c = null; for (let i = b.length - 1; i >= 0; i--) if (b[i].t <= t) { a = b[i]; c = b[i + 1] || null; break; }
    if (!a) a = b[0]; if (!a) return null; if (!c) c = a; const k = c.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (c.t - a.t))) : 0, L = (x, y) => x + (y - x) * k;
    const cz = new Map(c.z.map(r => [r[0], r])), cp = new Map(c.p.map(r => [r[0], r]));
    return {
      zs: a.z.map(r => { const n = cz.get(r[0]) || r; return { id: r[0], x: L(r[1], n[1]), z: L(r[2], n[2]), yaw: r[3], k: r[4], y: r[6] }; }),
      ps: a.p.filter(r => r[0] != this.id).map(r => { const n = cp.get(r[0]) || r; return { id: r[0], x: L(r[1], n[1]), y: r[2], z: L(r[3], n[3]), yaw: r[4], hp: r[6], name: r[26], bot: r[27] }; })
    };
  }
}

// ===== SCREENS =====
const SCR = ['menu', 'lobby', 'enter', 'pause', 'over'];
function show(...n) { scr = n[0] || ''; for (const s of SCR) $(s).classList.toggle('hide', !n.includes(s)); }
let toastT = 0;
function toast(t, ms = 3500) { const e = $('toast'); e.textContent = t; e.classList.remove('hide'); clearTimeout(toastT); toastT = setTimeout(() => e.classList.add('hide'), ms); }
function banner(t) { const e = $('conn'); e.textContent = t || ''; e.classList.toggle('hide', !t); }
const lockPtr = () => { try { cv.requestPointerLock(); } catch (e) {} };
function stopGame() {
  running = false; inGame = false; cl = null; try { document.exitPointerLock(); } catch (e) {}
  $('hud').classList.add('hide'); $('sb').classList.add('hide'); $('ci').classList.add('hide'); chatting = false; clearMeshes();
}
function toMenu() { stopGame(); room = null; show('menu'); }
function leaveRoom() { send({ m: 'leave' }); clearSess(); toMenu(); }

// ---- WebSocket with automatic reconnect (the server holds your slot for 60 s mid-game)
function connect(first) {
  if (ws) { try { ws.onclose = null; ws.close(); } catch (e) {} }
  pendingFirst = first; gotHello = false;
  const w = ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
  w.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } onMsg(m); };
  w.onclose = () => { if (ws !== w) return; ws = null; onClose(); };
  w.onerror = () => {};
}
function onClose() {
  if (sess) { banner('Connection lost, reconnecting…'); clearTimeout(retryT); retryT = setTimeout(() => connect({ m: 'rejoin', code: sess.code, token: sess.token }), Math.min(5000, 400 * 2 ** retry++)); }
  else if (!gotHello) toast('Could not reach the server. Is it running?');
}
const request = o => (ws && ws.readyState === 1 ? send(o) : connect(o));
setInterval(() => send({ m: 'p', c: Date.now() }), 2000);

function onMsg(m) {
  switch (m.m) {
    case 'hello': gotHello = true; retry = 0; banner(''); if (pendingFirst) { send(pendingFirst); pendingFirst = null; } break;
    case 'joined': sess = { code: m.code, token: m.token }; saveSess(); myPid = m.pid; break;
    case 'room': onRoom(m); break;
    case 'start': onStart(m); break;
    case 's': if (cl) { cl.onSnap(m); onSnapUI(m); } break;
    case 'err': toast(m.text); if (m.fatal) { clearSess(); toMenu(); } break;
    case 'closed': toast(m.reason || 'Disconnected.', 6000); clearSess(); toMenu(); break;
    case 'pong': lat = Date.now() - m.c; break;
  }
}

// ---- menu
const nameEl = $('name'); try { nameEl.value = localStorage.getItem('dh-name') || ''; } catch (e) {}
const myName = () => { const n = nameEl.value.trim().slice(0, 16); try { localStorage.setItem('dh-name', n); } catch (e) {} return n; };
const DIFF_LABEL = k => k[0].toUpperCase() + k.slice(1) + (DIFFS[k].sw ? ` (${DIFFS[k].sw} switches to win)` : ' (no win, survive)');
const mapOpts = MAP_LIST.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join(''), diffOpts = Object.keys(DIFFS).map(k => `<option value="${k}">${DIFF_LABEL(k)}</option>`).join('');
$('cmap').innerHTML = $('lmap').innerHTML = mapOpts; $('cdiff').innerHTML = $('ldiff').innerHTML = diffOpts;
$('bcreate').onclick = () => request({ m: 'create', name: myName(), map: $('cmap').value, diff: $('cdiff').value });
$('bjoin').onclick = () => { const code = $('jcode').value.trim().toUpperCase(); if (code.length < 4) return toast('Enter the 4-letter room code.'); request({ m: 'join', name: myName(), code }); };
$('jcode').onkeydown = e => { if (e.key === 'Enter') $('bjoin').click(); };

// ---- lobby
function onRoom(r) {
  room = r; myPid = r.you; if (inGame) stopGame();
  const me = r.players.find(p => p.pid === r.you), host = r.host === r.you, humans = r.players.filter(p => !p.bot);
  $('code').textContent = r.code;
  $('lplayers').innerHTML = r.players.map(p => `<li><span class="nm">${esc(p.name)}${p.pid === r.you ? ' (you)' : ''}</span>${p.bot ? '<span class="tag">bot</span>' : ''}${p.pid === r.host ? '<span class="tag host">host</span>' : p.ready ? '<span class="tag rdy">ready</span>' : '<span class="tag">not ready</span>'}${p.online ? '' : '<span class="tag">offline</span>'}${host && p.pid !== r.you ? `<button class="alt" style="margin:0;padding:2px 8px" data-kick="${p.pid}">✕</button>` : ''}</li>`).join('');
  for (const [id, v] of [['lmap', r.map], ['ldiff', r.diff]]) { const el = $(id); el.value = v; el.disabled = !host; }
  $('laddbot').classList.toggle('hide', !host); $('lrmbot').classList.toggle('hide', !host);
  $('lguest').classList.toggle('hide', host); $('lguest').textContent = 'Only the host can change the map and mode or start the game.';
  $('lready').classList.toggle('hide', host); $('lready').textContent = me && me.ready ? 'UNREADY' : 'READY';
  $('lstart').classList.toggle('hide', !host); $('lstart').disabled = humans.some(p => p.pid !== r.host && !p.ready);
  $('lchat').innerHTML = r.chat.map(c => `<div><b>${esc(c.name)}:</b> ${esc(c.t)}</div>`).join(''); $('lchat').scrollTop = 1e9;
  if (scr !== 'lobby') show('lobby');
}
$('lplayers').onclick = e => { const k = e.target.dataset && e.target.dataset.kick; if (k) send({ m: 'kick', pid: k }); };
$('lmap').onchange = $('ldiff').onchange = () => send({ m: 'config', map: $('lmap').value, diff: $('ldiff').value });
$('laddbot').onclick = () => send({ m: 'addbot' }); $('lrmbot').onclick = () => send({ m: 'rmbot' });
$('lready').onclick = () => { const me = room && room.players.find(p => p.pid === room.you); send({ m: 'ready', v: !(me && me.ready) }); };
$('lstart').onclick = () => send({ m: 'start' });
$('lleave').onclick = leaveRoom;
$('lcopy').onclick = () => { try { navigator.clipboard.writeText(room.code).then(() => toast('Code copied')); } catch (e) { toast('Code: ' + room.code); } };
$('lci').onkeydown = e => { if (e.key === 'Enter' && e.target.value.trim()) { send({ m: 'chat', text: e.target.value.trim() }); e.target.value = ''; } };

// ---- game start / pause / game over
function onStart(m) {
  myPid = m.pid; MAP = MAPS[m.map]; setMap(MAP); buildMap(); clearMeshes(); cl = new Client(myPid); inGame = true; running = false; wasOver = false;
  lastRd = lastEv = lastCh = lastPg = 0; chLog = []; names = {}; K = {}; mouseDown = wantUse = wantReload = wantSwap = false; view.yaw = -Math.PI / 2; view.pitch = 0;
  $('enterinfo').innerHTML = `${esc(MAP.name)} · ${esc(m.diff)}<br><small>The game starts when everyone has clicked, or after 20 s.</small>`;
  $('hud').classList.add('hide'); show('enter');
}
function enterGame() {
  AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume();
  K = {}; wantUse = wantReload = wantSwap = false; running = true; show(); $('hud').classList.remove('hide'); send({ m: 'go' }); lockPtr();
}
function pauseGame() { if (!running || (cl && cl.over)) return; running = false; K = {}; mouseDown = false; show('pause'); try { document.exitPointerLock(); } catch (e) {} }
$('benter').onclick = enterGame; $('bresume').onclick = enterGame;
$('bleave2').onclick = $('bleave3').onclick = leaveRoom;
$('bre').onclick = () => send({ m: 'restart' }); $('blob').onclick = () => send({ m: 'tolobby' });
function showOver(s) {
  running = false; mouseDown = false; try { document.exitPointerLock(); } catch (e) {}
  const host = s.h === myPid;
  $('oh').textContent = cl.wn ? 'VICTORY' : 'GAME OVER'; $('ovs').textContent = `Round ${s.rd} · ${s.ks} kills`;
  $('ovt').innerHTML = '<table style="margin:8px auto"><tr><th>Player</th><th>Kills</th><th>Downs</th><th>Revives</th><th>Points</th></tr>' + s.p.map(a => `<tr><td style="text-align:left">${esc(a[26])}${a[0] == myPid ? ' (you)' : ''}</td><td>${a[16]}</td><td>${a[23]}</td><td>${a[24]}</td><td>$${a[7]}</td></tr>`).join('') + '</table>';
  $('bre').classList.toggle('hide', !host); $('blob').classList.toggle('hide', !host); $('ovw').textContent = host ? '' : 'Waiting for the host to choose…';
  show('over');
}

// ===== INPUT =====
const typing = t => /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName);
function chatSwitch(e) {
  const ci = $('ci');
  if (chatting) { if (e.code == 'Enter' || e.code == 'Escape') { if (e.code == 'Enter' && ci.value.trim()) send({ m: 'chat', text: ci.value.trim() }); ci.value = ''; ci.classList.add('hide'); ci.blur(); chatting = false; } return true; }
  if (!running) return false;
  if (e.code == 'Enter') { chatting = true; ci.classList.remove('hide'); ci.focus(); e.preventDefault(); return true; }
  if (e.code == 'Tab') { e.preventDefault(); sbOn = true; return true; }
  return false;
}
addEventListener('keydown', e => {
  if (chatSwitch(e)) return; if (typing(e.target) || e.repeat) return;
  K[e.code] = true;
  if (running) {
    if (e.code == 'KeyE') wantUse = true; if (e.code == 'KeyQ') wantSwap = true; if (e.code == 'KeyR') wantReload = true;
    if (e.code == 'KeyV') { send({ m: 'ping' }); snd(520, .08, 'sine', .1); }
    if (e.code == 'Escape' || e.code == 'KeyP') pauseGame();
    if (e.code == 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  }
});
addEventListener('keyup', e => { K[e.code] = false; if (e.code == 'Tab') sbOn = false; });
cv.addEventListener('mousedown', e => { if (e.button == 0) { mouseDown = true; if (running && !locked) lockPtr(); } });
addEventListener('mouseup', e => { if (e.button == 0) mouseDown = false; });
addEventListener('contextmenu', e => { if (running) e.preventDefault(); });
addEventListener('blur', () => { K = {}; mouseDown = false; });
addEventListener('mousemove', e => { if (!running) return; if (locked || (e.buttons & 2)) { const s = S.sens * .0005; view.yaw -= e.movementX * s; view.pitch = Math.max(-1.5, Math.min(1.5, view.pitch - e.movementY * s)); } });
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement == cv; if (!locked && running && !(cl && cl.over)) pauseGame(); });

// ===== PLAYERS, PINGS, DROPS =====
const PCOL = [0x2a5a9a, 0x9a4a2a, 0x3a8a4a, 0x8a4a9a], pcol = id => PCOL[(parseInt(String(id).slice(1)) || 0) % 4];
const meshes = new Map(), pingM = new Map();
function clearMeshes() { for (const [, g] of meshes) freeZ(g); meshes.clear(); for (const [, m] of pingM) sc.remove(m); pingM.clear(); for (const [, m] of dropM) sc.remove(m); dropM.clear(); }
function setLabel(g, text) {
  if (g.labT === text) return;
  if (g.lab) { g.remove(g.lab); g.lab.material.map.dispose(); g.lab.material.dispose(); g.lab = null; }
  g.labT = text; if (text) { g.lab = label(text, '#ffe9a0', .3); g.add(g.lab); }
}
function drawAll(smp) {
  const seen = new Set(), T = performance.now() / 1000;
  const put = (key, x, y, z, yaw, s, col, sp, k, dn, name) => {
    seen.add(key); let g = meshes.get(key); if (!g) { g = getZ(); g.ph = Math.random() * 6; look(g, k < 0, col, Math.max(k, 0)); g.scale.setScalar(s); meshes.set(key, g); }
    const w = Math.sin(T * sp * 3 + g.ph); g.position.set(x, dn ? y + .25 : y, z); g.rotation.order = 'YXZ'; g.rotation.y = yaw; g.rotation.x = dn ? -1.45 : 0; g.lL.rotation.x = w * .7; g.lR.rotation.x = -w * .7; const pl = k < 0;
    g.aL.rotation.x = pl ? -w * .5 : -1.25 + w * .15; g.aR.rotation.x = pl ? w * .5 : -1.5 - w * .15; g.aL.rotation.z = pl ? .1 : .18; g.aR.rotation.z = pl ? -.1 : -.18;
    g.torso.rotation.z = pl ? 0 : w * .07; g.head.rotation.z = pl ? 0 : -w * .12 + Math.sin(T * 1.3 + g.ph) * .08;
    if (pl) { setLabel(g, name || '?'); if (g.lab) g.lab.position.set(0, dn ? 0 : 2.15, dn ? .9 : 0); } else setLabel(g, null);
  };
  for (const z of smp.zs) put('z' + z.id, z.x, z.y, z.z, z.yaw, TSCALE[z.k], TINTK[z.k], z.k == 1 ? 4 : 1.6, z.k);
  for (const p of smp.ps) put('p' + p.id, p.x, p.y, p.z, p.yaw + Math.PI, 1, pcol(p.id), 2, -1, p.hp <= 0, p.name);
  for (const [k, g] of meshes) if (!seen.has(k)) { freeZ(g); meshes.delete(k); }
}
function updPings(list) {
  const seen = new Set();
  for (const [id, o, x, y, z] of list || []) {
    seen.add(id); let m = pingM.get(id);
    if (!m) { m = label('▼ ' + (names[o] || '?'), '#7fe8ff', .45); m.material.depthTest = false; m.material.fog = false; m.renderOrder = 20; sc.add(m); pingM.set(id, m); if (id > lastPg) snd(660, .12, 'sine', .12); }
    m.position.set(x, y + 1.2 + Math.sin(performance.now() / 250) * .1, z); lastPg = Math.max(lastPg, id);
  }
  for (const [id, m] of pingM) if (!seen.has(id)) { sc.remove(m); pingM.delete(id); }
}

// ===== HUD =====
function onSnapUI(s) {
  for (const a of s.p) names[a[0]] = a[26];
  const now = Date.now();
  if (s.ch.length && s.ch[s.ch.length - 1][0] < lastCh) { lastCh = 0; chLog = []; }
  for (const [n, id, nm, t] of s.ch) if (n > lastCh) { lastCh = n; chLog.push({ id, nm, t, at: now }); }
  if (cl.over !== wasOver) { wasOver = cl.over; if (cl.over && inGame) showOver(s); }
}
function updHud(s, m, me, dt) {
  const W = WD(m[8]), dead = m[6] <= 0, now = Date.now();
  if (m[8] !== gunId) setGun(m[8]);
  const fake = { x: me.x, z: me.z, pts: m[7], cur: 0, y: me.y, slots: [{ id: m[8].replace('*', ''), u: m[8].endsWith('*') }], perks: Object.fromEntries((m[18] ? m[18].split(',') : []).map(k => [k, 1])) };
  const it = nearIt({ doors: cl.doors, mb: s.mb, sw: s.sw }, fake);
  if (s.ev[0] < lastEv) lastEv = 0; if (s.ev[0] > lastEv) { lastEv = s.ev[0]; msgTxt = s.ev[1]; msgT = 3; }
  mysM.forEach((x, i) => { x.visible = i == s.mb; }); swM.forEach((x, i) => setSw(x, i < s.sw.length, s.sw[i])); updDrops(s.dr); updPings(s.pg);
  if (s.rd > lastRd) { msgTxt = 'ROUND ' + s.rd; msgT = 3; snd(110, .8, 'sawtooth', .2, -40); } lastRd = s.rd;
  $('hpf').style.width = Math.max(0, m[6]) / (m[17] || CFG.maxHp) * 100 + '%'; $('pts').textContent = '$' + m[7];
  $('round').innerHTML = 'Round ' + s.rd + ' · ' + s.q + ' left · ' + s.ks + ' kills<br><small>' + MODE(s, m) + 'room ' + (sess ? sess.code : '') + ' · ping ' + lat + 'ms</small>';
  $('team').innerHTML = s.p.filter(a => a[0] != cl.id).map(a => `<div class="${a[25] ? 'out' : a[6] <= 0 ? 'down' : ''}">${esc(a[26])}${a[28] ? '' : ' (offline)'} · ${a[25] ? 'OUT' : a[6] <= 0 ? 'DOWN ' + a[22] + 's' : a[6] + 'hp'} · $${a[7]}</div>`).join('');
  $('ammo').innerHTML = W.n + '<br>' + (m[11] ? 'reloading…' : m[9] + ' / ' + m[10]); $('cross').className = hitT > 0 ? 'hit' : '';
  const dn = s.p.find(a => a[0] != cl.id && a[6] <= 0 && !a[25] && Math.hypot(a[1] - me.x, a[3] - me.z) < 1.8);
  $('prompt').textContent = dead ? (m[25] ? 'YOU BLED OUT · waiting for the run to end' : 'DOWNED · bleeding out in ' + m[22] + 's' + (m[21] ? ' · being revived ' + m[21] + '%' : '')) : dn ? '[hold E] revive ' + dn[26] + (dn[21] ? ' ' + dn[21] + '%' : '') : it ? '[E] ' + it.txt + (it.cost ? ' — $' + it.cost : '') + (it.ok ? '' : ' (not enough)') : '';
  $('msg').textContent = s.hd ? 'WAITING FOR PLAYERS…' : cl.over ? (cl.wn ? 'VICTORY! · ' : 'GAME OVER · ') + 'Round ' + s.rd + ' · ' + s.ks + ' kills' : msgT > 0 ? msgTxt : '';
  $('chat').innerHTML = chLog.filter(x => chatting || now - x.at < 10000).slice(-6).map(x => `<div><b>${esc(x.nm)}:</b> ${esc(x.t)}</div>`).join('');
  const sb = $('sb'); sb.classList.toggle('hide', !sbOn);
  if (sbOn) sb.innerHTML = '<table><tr><th>Player</th><th>Kills</th><th>Downs</th><th>Revives</th><th>Points</th></tr>' + s.p.map(a => `<tr><td>${esc(a[26])}${a[0] == cl.id ? ' (you)' : ''}${a[28] ? '' : ' (offline)'}${a[25] ? ' (out)' : a[6] <= 0 ? ' (down)' : ''}</td><td>${a[16]}</td><td>${a[23]}</td><td>${a[24]}</td><td>$${a[7]}</td></tr>`).join('') + '</table>';
}

// ===== MAIN LOOP: fixed 30 Hz input tick (matches the server), render every frame =====
function clientTick() {
  const i = running && !chatting ? { f: (K.KeyW ? 1 : 0) - (K.KeyS ? 1 : 0), r: (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0), j: !!K.Space, c: !!(K.KeyC || K.ControlLeft), s: !!K.ShiftLeft, yaw: view.yaw, pitch: view.pitch, fire: mouseDown, rl: wantReload, sw: wantSwap, use: wantUse, h: !!K.KeyE }
    : { f: 0, r: 0, j: false, c: false, s: false, yaw: view.yaw, pitch: view.pitch, fire: false, rl: false, sw: false, use: false, h: false };
  if (running) wantReload = wantSwap = wantUse = false;
  const m = cl.srv; if (i.fire && m && m[6] > 0 && m[9] > 0 && !m[11]) {   // local muzzle flash + sound (the server decides the actual hit)
    const W = WD(m[8]), t = performance.now() / 1000;
    if (t - lastFire > 60 / W.rpm && (W.auto || !lastHeld)) { lastFire = t; kick = 1; flash = .05; snd(W.pellets > 1 ? 90 : 170, .13, 'sawtooth', .25, -110); }
  }
  lastHeld = !!i.fire; cl.tick(i);
}
let last = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame); const dt = Math.min(.1, (now - last) / 1000); last = now;
  if (!inGame || !cl) return;
  if (running) { if (K.ArrowLeft) view.yaw += 2 * dt; if (K.ArrowRight) view.yaw -= 2 * dt; if (K.ArrowUp) view.pitch = Math.min(1.5, view.pitch + 1.5 * dt); if (K.ArrowDown) view.pitch = Math.max(-1.5, view.pitch - 1.5 * dt); }
  acc += dt; let n = 0; while (acc >= CFG.tick && n++ < 6) { acc -= CFG.tick; clientTick(); } if (acc > CFG.tick) acc = 0;
  kick = Math.max(0, kick - dt * 8); flash = Math.max(0, flash - dt); hitT = Math.max(0, hitT - dt); msgT -= dt;
  const m = cl.srv, me = cl.me, dead = m && m[6] <= 0;
  cam.position.set(me.x, me.y + 1.6 - .5 * me.crouch - (dead ? 1.2 : 0), me.z); cam.rotation.set(view.pitch, view.yaw, 0); gun.position.z = -.5 + kick * .08; gun.visible = !dead; torch.intensity = 1 + flash * 30;
  const smp = cl.sample(); if (smp) drawAll(smp); R.render(sc, cam);
  const s = cl.buf[cl.buf.length - 1]; if (m && s) updHud(s, m, me, dt);
  const dm = $('dmg'); dm.style.opacity = Math.max(0, +dm.style.opacity - dt * 1.5);
}
requestAnimationFrame(frame);

// ===== BOOT: if this tab was in a room a moment ago (refresh / network blip), take the slot back =====
show('menu');
if (sess) { banner('Rejoining your game…'); connect({ m: 'rejoin', code: sess.code, token: sess.token }); }
