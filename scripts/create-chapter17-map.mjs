import { readFile, writeFile } from 'node:fs/promises';

const width = 48, height = 40;
const tiles = Array.from({ length: height }, () => Array(width).fill('shore_sea'));
const art = JSON.parse(await readFile(new URL('../assets/maps/starless-shore/art.json', import.meta.url), 'utf8'));
const inside = (px, py, [left, top, right, bottom]) => px >= left && px < right && py >= top && py < bottom;
for (let z = 0; z < height; z++) for (let x = 0; x < width; x++) {
  const px = (x + .5) * art.alignmentWidth / width, py = (z + .5) * art.alignmentHeight / height;
  if (!art.groundAreas.some((area) => inside(px, py, area))) continue;
  tiles[z][x] = art.blockedAreas.some((area) => inside(px, py, area)) ? 'shore_ruin'
    : z >= 30 && x >= 17 && x <= 28 ? 'shore_lift'
    : ((x === 17 || x === 18 || x === 28 || x === 29) && [20,21,27,28].includes(z)) ||
      (z >= 29 && (x <= 9 || x >= 36)) ? 'shore_bridge' : 'shore_stone';
}
for (const [x, z] of [[22,8],[24,8]]) tiles[z][x] = 'shore_gate';

const roster = ['maria','rictor','bartz','cypher','seymour','eveline','corvis','stark','linus','lena','arlan','troy','leon','serra'];
const players = roster.map((id, i) => ({ id, x: 20 + i % 7, z: 32 + Math.floor(i / 7) }));
const placement = (id, x, z, ai = 'guard', extra = {}) => ({ id: `shore-${id}`, x, z, ai, ...extra });
const enemies = [
  placement('unmoored-duelist',12,17,'guard',{drop:'starless-edge'}),
  placement('drowned',7,26), placement('drowned',11,25), placement('drowned',15,21),
  placement('stalker',9,26,'mobile'), placement('crowman',15,27,'mobile'),
  placement('gloam-raven',7,18,'mobile'), placement('gloam-raven',15,15),
  placement('halberdier',13,20), placement('halberdier',10,17),
  placement('dark-sage',14,18), placement('mage',11,22,'guard',{weaponId:'elthunder'}),
  placement('bishop',12,15), placement('paladin',12,26,'mobile'),
  placement('tidebound-sentinel',21,13,'guard',{drop:'tidepiercer'}),
  placement('keelbreaker',25,13,'guard',{drop:'keelbreaker'}),
  placement('drowned',20,28), placement('drowned',26,28), placement('drowned',22,22),
  placement('halberdier',21,16), placement('halberdier',25,16), placement('general',23,10),
  placement('crowman',23,26,'mobile'), placement('paladin',24,25,'mobile'),
  placement('dark-sage',20,19), placement('dark-sage',26,19),
  placement('mage',23,22,'guard',{weaponId:'inferno'}), placement('bishop',23,16),
  placement('gloam-raven',20,12,'mobile'), placement('gloam-raven',27,12,'mobile'),
  placement('horizon-watcher',35,17,'guard',{drop:'horizon-string'}),
  placement('drowned',30,26), placement('drowned',34,25), placement('drowned',38,19),
  placement('stalker',33,26,'mobile'), placement('crowman',38,27,'mobile'),
  placement('gloam-raven',38,17,'mobile'), placement('gloam-raven',34,15),
  placement('halberdier',32,20), placement('halberdier',36,17),
  placement('dark-sage',31,18), placement('mage',35,22,'guard',{weaponId:'tempest'}),
  placement('bishop',36,15), placement('crowman',36,26,'mobile'),
];
const beacons = [
  { id:'west-offering', x:12, z:19, guardians:['shore-unmoored-duelist'], extinguished:false },
  { id:'sea-offering', x:23, z:15, guardians:['shore-tidebound-sentinel','shore-keelbreaker'], extinguished:false },
  { id:'east-offering', x:35, z:19, guardians:['shore-horizon-watcher'], extinguished:false },
];
beacons.forEach(({ x,z }) => { tiles[z][x] = 'shore_beacon'; });
const trials = [
  { id:'storm-bell', name:'The Bell That Calls the Storm', kind:'bell', x:8, z:9, activated:false, activatedTurn:null },
  { id:'first-sky', name:'Observatory of the First Sky', kind:'observatory', x:39, z:10, activated:false, activatedTurn:null },
];
trials.forEach(({ x,z }) => { tiles[z][x] = 'shore_trial'; });
const arrivals = [
  { id:'west-offering', x:7, z:24 }, { id:'sea-offering', x:23, z:9 }, { id:'east-offering', x:38, z:26 },
];
const reinforcements = [5,9,13].flatMap((turn) => arrivals.map(({ id,x,z }) => ({
  turn, entranceId:id,
  units:[placement('stalker',x,z,'mobile'),placement('gloam-raven',id==='sea-offering'?x+1:x,id==='sea-offering'?z:z+1,'mobile')],
  message:'A Stalker and Gloam Raven answer an offering flame. This is a finite, marked arrival.',
  spawned:false, spawnedCount:0,
})));
reinforcements.push(
  { turn:999, entranceId:'storm-bell', units:[
    placement('storm-custodian',10,7,'mobile',{drop:'heavenfall'}),
    placement('drowned',5,9,'mobile'), placement('drowned',10,9,'mobile'),
  ], message:'The Storm Custodian answers the drowned bell, wielding Heavenfall.', spawned:false, spawnedCount:0 },
  { turn:999, entranceId:'first-sky', units:[
    placement('horizon-keeper',36,8,'mobile',{drop:'the-last-horizon'}),
    placement('gloam-raven',37,9,'mobile'), placement('gloam-raven',41,10,'mobile'),
  ], message:'The Horizon Keeper awakens beneath the first sky, wielding The Last Horizon.', spawned:false, spawnedCount:0 },
);
const level = { name:'Chapter 17 - The Shore Beneath the World', width, height, objective:'silence-beacons',
  leader:'maria', requiredUnits:['maria','rictor'], lighting:'night', noFence:true,
  spawn:{x:20,z:32}, exit:{x:22,z:8}, players, enemies, chests:[], reinforcements,
  shore:{beacons,trials,silhouetteSeen:false,artwork:'scene'}, tiles };
const occupied = new Set();
for (const p of [...players,...enemies]) {
  const key = `${p.x},${p.z}`;
  if (occupied.has(key) || ['shore_sea','shore_ruin','shore_trial','shore_beacon'].includes(tiles[p.z][p.x])) {
    throw new Error(`Illegal Chapter 17 placement ${p.id} at ${key}`);
  }
  occupied.add(key);
}
await writeFile(new URL('../data/levels/map_17_starless_shore.json', import.meta.url), `${JSON.stringify(level, null, 2)}\n`);

console.log(`Generated Chapter 17: ${width}x${height}, ${players.length} allies, ${enemies.length} enemies, four crowmen, two optional trials.`);
