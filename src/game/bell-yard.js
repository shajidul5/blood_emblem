// Chapter 16: the Delivery Bell yard. Treatment wagons roll along the rails toward the Bell Lift,
// Maria and Rictor reunite in the yard, and the chapter ends when both stand on the lift.
export const BELL_TRACK_TILES = new Set(['bell_track', 'bell_track_bridge']);
export const BELL_LIFT_TILE = 'bell_lift';
const BEAT_IDS = ['bell', 'lift'];

const tileAt = (level, x, z) => level.tileIds?.[z]?.[x];
export const isLiftTile = (level, x, z) => tileAt(level, x, z) === BELL_LIFT_TILE;
export const isTrackTile = (level, x, z) => BELL_TRACK_TILES.has(tileAt(level, x, z));
const isTurn = (value) => Number.isInteger(value) && value >= 1;
export const bellYardUnlocked = (level) => level.bellYard?.locks?.every((lock) => lock.opened) ?? true;

export function availableBellLock(level, unit, enemies) {
  if (!unit || unit.hp <= 0 || unit.acted) return undefined;
  return level.bellYard?.locks?.find((lock) => !lock.opened && unit.x === lock.x && unit.z === lock.z &&
    !enemies.some((enemy) => enemy.id === lock.guardId && enemy.hp > 0));
}

export function openBellLock(level, unit, enemies) {
  const lock = availableBellLock(level, unit, enemies);
  if (!lock) return false;
  lock.opened = true;
  return true;
}

export function validateBellYard(rules, level) {
  if (!rules) {
    if (level.objective === 'bell-lift') throw new Error('Bell lift objective requires Bell Yard rules.');
    return undefined;
  }
  const onTrack = (entry) => Number.isInteger(entry?.x) && Number.isInteger(entry?.z) && isTrackTile(level, entry.x, entry.z);
  const split = rules.locks !== undefined;
  if (level.objective !== 'bell-lift' || typeof rules.bossId !== 'string' ||
      !level.enemies.some((unit) => unit.id === rules.bossId) ||
      !level.tileIds.some((row) => row.includes(BELL_LIFT_TILE)) ||
      (!split && (typeof rules.wagonId !== 'string' || typeof rules.cargo?.id !== 'string' ||
      !level.enemies.filter((unit) => unit.id === rules.wagonId).every(onTrack) ||
      !Array.isArray(rules.departures) || !rules.departures.every((entry) => onTrack(entry) && isTurn(entry.turn)))) ||
      !Array.isArray(rules.beats) || rules.beats.length !== BEAT_IDS.length ||
      !rules.beats.every((beat, index) => beat.id === BEAT_IDS[index] && typeof beat.seen === 'boolean' &&
        (beat.turn === null || isTurn(beat.turn)) &&
        (beat.thresholdZ === null || Number.isInteger(beat.thresholdZ) && beat.thresholdZ >= 0 && beat.thresholdZ < level.height))) {
    throw new Error('Bell Yard needs its Lift-Keeper, lift tiles, wagons on the rails, departures and two story beats.');
  }
  if (split) {
    if (!Array.isArray(rules.locks) || rules.locks.length !== 2 ||
        !rules.locks.every((lock, i) => lock?.id === ['winch', 'brake'][i] &&
          Number.isInteger(lock.x) && Number.isInteger(lock.z) &&
          tileAt(level, lock.x, lock.z) === 'bell_cobble' && typeof lock.opened === 'boolean' &&
          lock.guardId === ['bell-winch-guard', 'bell-brake-guard'][i] &&
          level.enemies.some((enemy) => enemy.id === lock.guardId)) ||
        !level.tileIds.some((row) => row.includes('bell_lock_gate')) ||
        !level.tileIds.some((row) => row.includes('bell_service_bridge')) ||
        (rules.reunited && !rules.locks.every((lock) => lock.opened))) {
      throw new Error('The split Bell Yard requires two guarded locks and sealed crossings.');
    }
    return {
      bossId: rules.bossId, reunited: rules.reunited === true, departures: [],
      locks: rules.locks.map(({ id, x, z, guardId, opened }) => ({ id, x, z, guardId, opened })),
      beats: rules.beats.map(({ id, turn, thresholdZ, seen }) => ({ id, turn, thresholdZ, seen })),
    };
  }
  const count = (value) => (Number.isInteger(value) && value >= 0 ? value : 0);
  return {
    bossId: rules.bossId,
    wagonId: rules.wagonId,
    cargo: { id: rules.cargo.id, level: Number.isInteger(rules.cargo.level) ? rules.cargo.level : undefined },
    reunited: rules.reunited === true,
    escaped: count(rules.escaped),
    released: count(rules.released),
    departures: rules.departures.map(({ x, z, turn, departed }) => ({ x, z, turn, departed: departed === true })),
    beats: rules.beats.map(({ id, turn, thresholdZ, seen }) => ({ id, turn, thresholdZ, seen })),
  };
}

export function freshBellYard(rules) {
  if (!rules) return undefined;
  return {
    ...rules,
    ...(rules.cargo && { cargo: { ...rules.cargo } }),
    ...(rules.locks && { locks: rules.locks.map((lock) => ({ ...lock, opened: false })) }),
    reunited: false,
    escaped: 0,
    released: 0,
    departures: rules.departures.map((entry) => ({ ...entry, departed: false })),
    beats: rules.beats.map((beat) => ({ ...beat, seen: false })),
  };
}

// Breadth-first along the rails to the nearest open lift tile. Units on the rails block the wagon.
export function wagonRoute(level, wagon, occupied = new Set()) {
  const key = (x, z) => `${x},${z}`;
  const start = { x: wagon.x, z: wagon.z };
  const previous = new Map([[key(start.x, start.z), null]]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    if (isLiftTile(level, current.x, current.z) && i > 0) {
      const path = [];
      for (let step = current; step; step = previous.get(key(step.x, step.z))) path.unshift(step);
      return path;
    }
    for (const [dx, dz] of [[0, -1], [1, 0], [-1, 0], [0, 1]]) {
      const next = { x: current.x + dx, z: current.z + dz };
      const id = key(next.x, next.z);
      if (previous.has(id) || occupied.has(id)) continue;
      if (!isTrackTile(level, next.x, next.z) && !isLiftTile(level, next.x, next.z)) continue;
      previous.set(id, current);
      queue.push(next);
    }
  }
  return [start];
}

// The tiles a wagon covers this turn; escapes when its last step lands on the lift.
export function planWagonMove(level, wagon, occupied) {
  const route = wagonRoute(level, wagon, occupied);
  const path = route.slice(0, Math.max(1, wagon.movement) + 1);
  const end = path[path.length - 1];
  return { path, escapes: path.length > 1 && isLiftTile(level, end.x, end.z) };
}

export function dueDepartures(level, turn) {
  return (level.bellYard?.departures ?? []).filter((entry) => !entry.departed && entry.turn <= turn);
}

export function canReunite(level, unit, other) {
  const rules = level?.bellYard;
  if (!rules || !bellYardUnlocked(level) || rules.reunited || !unit || !other || unit.hp <= 0 || other.hp <= 0) return false;
  const pair = [unit.id, other.id].sort().join('+');
  return pair === 'maria+rictor' && Math.abs(unit.x - other.x) + Math.abs(unit.z - other.z) === 1;
}

export function bellYardVictoryReady(level, enemies, maria, rictor) {
  const rules = level.bellYard;
  return Boolean(rules && bellYardUnlocked(level) && !enemies.some((enemy) => enemy.id === rules.bossId) &&
    [maria, rictor].every((unit) => unit?.hp > 0 && isLiftTile(level, unit.x, unit.z)));
}

export function advanceBellYardStory(level, team, turn) {
  const due = [];
  for (const beat of level.bellYard?.beats ?? []) {
    if (beat.seen) continue;
    const byTurn = beat.turn !== null && turn >= beat.turn;
    const byPosition = beat.thresholdZ !== null && team.some((unit) => unit.hp > 0 && unit.z <= beat.thresholdZ);
    if (byTurn || byPosition) {
      beat.seen = true;
      due.push(beat.id);
    }
  }
  return due;
}
