export function validateWaitingCity(rules, level) {
  if (!rules) {
    if (level.objective === 'awaken-city') throw new Error('Waiting City objective requires ancient mechanisms.');
    return undefined;
  }
  const positions = new Set(), ids = new Set();
  const validPoint = (point) => Number.isInteger(point?.x) && Number.isInteger(point?.z) &&
    point.x >= 0 && point.x < level.width && point.z >= 0 && point.z < level.height;
  if (level.objective !== 'awaken-city' || rules.bossId !== 'bell-drowned' ||
      typeof rules.opened !== 'boolean' || typeof rules.revelationSeen !== 'boolean' ||
      !Number.isInteger(rules.nextPulseTurn) || rules.nextPulseTurn < 1 ||
      !Number.isInteger(rules.pulseIndex) || rules.pulseIndex < 0 ||
      !Array.isArray(rules.mechanisms) || rules.mechanisms.length !== 2 ||
      !rules.mechanisms.every((entry) => {
        const key = `${entry?.x},${entry?.z}`;
        if (!validPoint(entry) || typeof entry.id !== 'string' || !entry.id || ids.has(entry.id) ||
            positions.has(key) || typeof entry.activated !== 'boolean' ||
            level.tileIds[entry.z][entry.x] !== 'city_mechanism') return false;
        ids.add(entry.id); positions.add(key); return true;
      }) || rules.opened !== rules.mechanisms.every((entry) => entry.activated) ||
      !Array.isArray(rules.gates) || rules.gates.length !== 4 ||
      !rules.gates.every((entry) => validPoint(entry) && level.tileIds[entry.z][entry.x] === 'city_seal') ||
      new Set(rules.gates.map(({ x, z }) => `${x},${z}`)).size !== 4 ||
      !rules.arena || !['x1', 'x2', 'z1', 'z2'].every((key) => Number.isInteger(rules.arena[key])) ||
      rules.arena.x1 < 0 || rules.arena.x2 >= level.width || rules.arena.x1 >= rules.arena.x2 ||
      rules.arena.z1 < 0 || rules.arena.z2 >= level.height || rules.arena.z1 >= rules.arena.z2 ||
      level.enemies.filter((enemy) => enemy.id === rules.bossId).length !== 1) {
    throw new Error('Waiting City needs two unique mechanisms, four sealed approach tiles, an arena and finite pulse state.');
  }
  const waves = level.reinforcements;
  if (waves.length && (waves.length !== 4 || new Set(waves.map((wave) => wave.turn)).size !== 4 ||
      !waves.every((wave) => [4, 7, 10, 13].includes(wave.turn) && wave.entranceId === 'drowned-tide' &&
        wave.units.length === 2 && wave.units.every((unit, index) =>
          ['city-drowned', 'city-stalker'].includes(unit.id) && unit.x === (index === 0 ? 3 : 38) &&
          unit.z === 25 && level.tileIds[unit.z][unit.x + (index === 0 ? -1 : 1)] === 'shore_sea')))) {
    throw new Error('Waiting City tides need four two-creature coastal waves on turns 4, 7, 10 and 13.');
  }
  if (rules.structures !== undefined) {
    const covered = new Set();
    if (!Array.isArray(rules.structures) || !rules.structures.every((structure) => {
      if (!['armory', 'observatory', 'dwelling', 'shrine'].includes(structure?.sprite) ||
          !validPoint(structure) || !Number.isInteger(structure.width) || structure.width < 1 || structure.width > 8 ||
          !Number.isInteger(structure.depth) || structure.depth < 1 || structure.depth > 6 ||
          structure.x + structure.width > level.width || structure.z + structure.depth > level.height) return false;
      for (let z = structure.z; z < structure.z + structure.depth; z++) {
        for (let x = structure.x; x < structure.x + structure.width; x++) {
          const key = `${x},${z}`;
          if (covered.has(key) || level.tileIds[z][x] !== 'city_building') return false;
          covered.add(key);
        }
      }
      return true;
    }) || covered.size !== level.tileIds.flat().filter((id) => id === 'city_building').length) {
      throw new Error('Waiting City structures must uniquely cover their blocked building footprints.');
    }
  }
  if (rules.pulse !== null && (!rules.opened || !Number.isInteger(rules.pulse?.turn) ||
      rules.pulse.turn < 1 || !Array.isArray(rules.pulse.tiles) || !rules.pulse.tiles.length ||
      !rules.pulse.tiles.every((point) => validPoint(point) && point.x >= rules.arena.x1 &&
        point.x <= rules.arena.x2 && point.z >= rules.arena.z1 && point.z <= rules.arena.z2))) {
    throw new Error('Bell-Drowned warning must name valid arena tiles and a player turn.');
  }
  return structuredClone(rules);
}

export function freshWaitingCity(rules) {
  return rules ? { ...structuredClone(rules), opened: false, revelationSeen: false,
    mechanisms: rules.mechanisms.map((entry) => ({ ...entry, activated: false })),
    pulse: null, pulseIndex: 0, nextPulseTurn: 1 } : undefined;
}

export function availableMechanism(level, unit) {
  if (!level.waitingCity || unit.hp <= 0 || unit.acted) return undefined;
  return level.waitingCity.mechanisms.find((entry) => !entry.activated &&
    Math.abs(entry.x - unit.x) + Math.abs(entry.z - unit.z) === 1);
}

export function activateMechanism(level, unit, turn) {
  const entry = availableMechanism(level, unit);
  if (!entry) throw new Error('A living, unacted unit must stand beside an ancient mechanism.');
  entry.activated = true;
  const rules = level.waitingCity;
  rules.opened = rules.mechanisms.every((mechanism) => mechanism.activated);
  if (rules.opened) rules.nextPulseTurn = turn + 1;
  return entry;
}

export function prepareCityPulse(level, turn, enemies) {
  const rules = level.waitingCity;
  if (!rules || !rules.opened || rules.pulse || turn < rules.nextPulseTurn ||
      !enemies.some((unit) => unit.id === rules.bossId && unit.hp > 0)) return null;
  const { x1, x2, z1, z2 } = rules.arena;
  const tiles = [];
  for (let z = z1; z <= z2; z++) for (let x = x1; x <= x2; x++) {
    const marked = rules.pulseIndex % 2 === 0 ? x === x1 + 3 || x === x2 - 3 : z === z1 + 3 || z === z2 - 3;
    if (marked) tiles.push({ x, z });
  }
  rules.pulse = { turn, tiles };
  rules.pulseIndex++;
  return rules.pulse;
}

export function resolveCityPulse(level, turn, units, enemies) {
  const rules = level.waitingCity;
  if (!rules?.pulse || turn < rules.pulse.turn) return [];
  const pulse = rules.pulse;
  rules.pulse = null;
  rules.nextPulseTurn = turn + 3;
  if (!enemies.some((unit) => unit.id === rules.bossId && unit.hp > 0)) return [];
  const marked = new Set(pulse.tiles.map(({ x, z }) => `${x},${z}`));
  return units.filter((unit) => unit.hp > 0 && marked.has(`${unit.x},${unit.z}`)).map((unit) => {
    const damage = Math.min(unit.hp, 18);
    unit.hp -= damage;
    return { unit, damage };
  });
}

export function waitingCityVictoryReady(level, enemies) {
  return Boolean(level.waitingCity?.opened && !enemies.some((unit) => unit.id === level.waitingCity.bossId && unit.hp > 0));
}

export function cityTideWarning(level, turn) {
  const pending = level.reinforcements.filter((wave) => !wave.spawned);
  if (!pending.length) return 'No further water creatures';
  const next = Math.min(...pending.map((wave) => wave.turn));
  return `Water creatures ${next <= turn ? 'queued at glowing shores' : `arrive turn ${next}`} (${pending.length} waves remain)`;
}
