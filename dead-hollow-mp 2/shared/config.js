// Gameplay tuning, weapon roster, perks and difficulty modes. Imported by BOTH server and client. Edit here to rebalance.
export const CFG={tick:1/30,maxHp:100,regenDelay:5,regenRate:25,walk:4.2,sprint:6.8,crouch:2.2,jump:6.5,grav:20,
 startPts:500,zDmg:20,zHitCd:.8,zReach:1.1,hitPts:10,killPts:60,headPts:100,headMult:2.5,
 roundPause:5,spawnGap:.8,maxAlive:24,bossEvery:5,
 endOnFirstDown:false,bleed:30,reviveTime:4}; // true = game ends when ANY player goes down; false = game ends only when EVERY player is dead (bled out; downed players can still be revived)
// Weapon roster. gid = the numeric weapon ID from the design list. Special fields: range (max metres), splash (blast radius),
// chain (lightning hops), burn (sets zombies on fire), rare (mystery box rolls it less often). Stats are my own tuning.
const w=(gid,n,dmg,rpm,mag,res,reload,spread,pellets,auto,pen,x={})=>({gid,n,dmg,rpm,mag,res,reload,spread,pellets,auto,pen,...x});
export const WEAPONS={
 // pistols
 m1911:w(1,'Colt M1911',24,330,8,80,1.5,.012,1,false,1),            magnum:w(4,'.357 Magnum',85,140,6,42,2.3,.007,1,false,1),
 // bolt-action rifles
 kar98k:w(2,'Kar98k',120,52,5,50,2.6,.003,1,false,2),                kar98kS:w(11,'Scoped Kar98k',130,50,5,40,2.7,.001,1,false,2),
 ptrs41:w(19,'PTRS-41',210,100,5,30,3.4,.004,1,false,4),             springfield:w(58,'Springfield',140,48,5,40,2.8,.002,1,false,3),
 // rifles
 gewehr:w(10,'Gewehr 43',52,230,10,80,2.1,.008,1,false,2),           garand:w(12,'M1 Garand',60,260,8,72,2.4,.008,1,false,2),
 m1a1:w(13,'M1A1 Carbine',34,400,15,120,1.9,.014,1,false,1),         stg44:w(22,'STG-44',36,540,30,150,2.3,.016,1,true,2),
 // submachine guns
 thompson:w(3,'Thompson',22,700,30,180,2.0,.03,1,true,1),            mp40:w(15,'MP40',20,520,32,192,2.0,.025,1,true,1),
 ppsh41:w(18,'PPSh-41',17,900,71,284,3.2,.04,1,true,1),              type100:w(24,'Type 100',19,600,30,150,1.9,.022,1,true,1),
 mp5k:w(54,'MP5K',18,800,30,150,1.7,.03,1,true,1),
 // shotguns
 dbl:w(8,'Double-Barreled',20,120,2,38,2.1,.08,10,false,1),          sawedoff:w(21,'Sawed-Off',17,130,2,30,1.9,.13,12,false,1),
 trench:w(23,'M1897 Trench Gun',16,75,6,48,3.0,.06,8,false,1),
 // machine guns
 bar:w(5,'BAR',40,500,20,160,2.8,.02,1,true,2),                      fg42:w(9,'FG42',34,780,20,140,2.6,.03,1,true,2),
 mg42:w(16,'MG42',30,1200,100,300,5.0,.05,1,true,2),                 m1919:w(7,'Browning M1919',38,600,125,375,5.2,.035,1,true,3),
 // special weapons
 bknife:w(6,'Ballistic Knife',150,60,1,12,1.2,.003,1,false,3,{range:25}),
 flame:w(14,'M2 Flamethrower',8,1200,100,300,4.0,.035,2,true,6,{range:9,burn:1}),
 panzer:w(17,'Panzerschreck',420,30,1,8,4.0,.002,1,false,1,{splash:4.5,rare:1}),
 raygun:w(20,'Ray Gun',180,180,20,160,3.0,.004,1,false,1,{splash:2.4,rare:1}),
 wunder:w(56,'Wunderwaffe DG-2',200,70,3,15,4.2,.004,1,false,1,{chain:10,rare:1}),
 raygun2:w(60,'Ray Gun Mk II',90,140,12,96,3.2,.01,3,false,1,{splash:1.7,rare:1})};
// Forge (upgrade machine): dmg x2.5, mag/reserve x1.5, reload x0.8. Prices, drop chance, rotating mystery box:
Object.assign(CFG,{forgeCost:3000,boxCost:950,mysteryMove:true,dropChance:.04,dropLife:25});
export const PERKS={reload:{n:'Quick Hands',cost:1500},health:{n:'Iron Heart',cost:2000},speed:{n:'Fleet Foot',cost:2000},revive:{n:'Lifeline',cost:1500}}; // revive speed matters once revives exist (step 6)
// Difficulty: zombie hp/speed/count/damage + points multipliers; sw = switches that must ALL be turned on to win (0 = endless, never ends)
export const DIFFS={endless:{hp:1,spd:1,cnt:1,dmg:1,pts:1,sw:0},easy:{hp:.7,spd:.85,cnt:.7,dmg:.6,pts:1.25,sw:2},normal:{hp:1,spd:1,cnt:1,dmg:1,pts:1,sw:3},
 hard:{hp:1.4,spd:1.15,cnt:1.3,dmg:1.4,pts:.9,sw:4},extreme:{hp:2,spd:1.3,cnt:1.7,dmg:2,pts:.8,sw:5}};
