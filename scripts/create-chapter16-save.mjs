import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = new URL('../saves/chapter16-level20.json', import.meta.url);
const priorImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
globalThis.Image = class {
  set src(value) {
    this.width = this.height = 64;
    queueMicrotask(() => this.onload());
  }
};

let server;
try {
  server = await createServer({
    root, server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom',
  });
  const [characters, classes, progression, inventory, saves, levels, ranks] = await Promise.all([
    '/src/characters/characters.js', '/src/characters/classes.js', '/src/characters/progression.js',
    '/src/characters/inventory.js', '/src/game/save.js', '/src/levels/level.js', '/src/characters/weapon-levels.js',
  ].map((path) => server.ssrLoadModule(path)));
  const level = levels.validateLevel(JSON.parse(await readFile(new URL('../data/levels/map_16_bell_yard.json', import.meta.url), 'utf8')));
  const factories = {
    maria: characters.createMaria, bartz: characters.createBartzAlly, cypher: characters.createCypherAlly,
    seymour: characters.createSeymourAlly, stark: characters.createStarkAlly, linus: characters.createLinusAlly,
    rictor: characters.createRictorAlly, lena: characters.createLenaAlly, arlan: characters.createArlanAlly,
    troy: characters.createTroyAlly, eveline: characters.createEvelineAlly, corvis: characters.createCorvisAlly,
  };
  const promoted = new Set(['maria', 'rictor', 'arlan', 'lena']);
  let seed = 160020;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const units = level.players.map((placement) => {
    const unit = Object.assign(factories[placement.id](), placement, { facing: 'south' });
    progression.awardExperience(unit, (20 - unit.level) * 100 - unit.experience, random);
    for (const type of Object.keys(unit.weaponExp)) {
      unit.weaponExp[type] = Math.max(unit.weaponExp[type], ranks.WEAPON_RANKS.find((rank) => rank.id === 'B').exp);
    }
    if (promoted.has(unit.id)) classes.promoteUnit(unit);
    if (unit.id === 'lena') unit.inventory.push(...inventory.createInventory(['killing-edge', 'killer-bow', 'chest-key']));
    if (unit.id === 'arlan') unit.inventory.push(...inventory.createInventory(['steel-axe']));
    unit.hp = unit.maxHp;
    inventory.refreshMagicUses(unit.inventory, unit);
    return unit;
  });
  const [maria, ...allies] = units;
  const convoy = inventory.createInventory([
    ...Array(12 - promoted.size).fill('master-emblem'),
    'chest-key', 'chest-key', 'heal-staff', 'freeze-staff', 'light-tome',
    'steel-sword', 'steel-lance', 'steel-axe', 'hunter-bow', 'potion', 'potion',
  ]);
  const insight = { insight: 115 };
  const chapterStart = {
    ...saves.serializeUnit(maria), allies: allies.map(saves.serializeUnit),
    convoy, insight, prepared: true, deployed: units.map((unit) => unit.id),
  };
  const enemies = level.enemies.map((entry) => characters.createEnemyUnit(entry.id, entry.x, entry.z, entry));
  const save = saves.createSaveData(level, maria, enemies, { turn: 1, phase: 'player', defeated: false },
    { chapter: 15, allies, convoy, insight, chapterStart });
  const text = JSON.stringify(saves.parseSave(JSON.stringify(save)), null, 2) + '\n';
  await mkdir(new URL('../saves/', import.meta.url), { recursive: true });
  await writeFile(output, text);
  console.log(`Created ${fileURLToPath(output)}: 12 level-20 units, 4 promotions, 8 Orders Emblems.`);
} finally {
  await server?.close();
  if (priorImage) Object.defineProperty(globalThis, 'Image', priorImage);
  else delete globalThis.Image;
}
