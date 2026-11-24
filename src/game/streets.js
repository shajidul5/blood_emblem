import { distanceBetween, findPath, terrainMoveCost, tileKey } from '../battle/grid.js';

export function houseHasReward(house) {
  return !house.visited && !house.destroyed;
}

export function streetRaiderTarget(level, enemy, defenders) {
  if (!level.streets?.raiders || enemy.id !== 'street-raider' || enemy.hp <= 0 ||
      enemy.ai !== 'mobile' || enemy.frozen) return null;
  const houses = level.houses.filter(houseHasReward);
  const blocked = new Set(defenders.filter((unit) => unit.hp > 0).map((unit) => tileKey(unit.x, unit.z)));
  const nearest = (obstacles) => houses.map((house) => {
    const path = findPath(enemy, [house.door], obstacles, level);
    return { house, path, cost: path.length ? path.slice(1).reduce((sum, point) =>
      sum + terrainMoveCost(level, point.x, point.z, enemy), 0) : Infinity };
  }).filter((route) => route.path.length).sort((a, b) => a.cost - b.cost)[0];
  const route = nearest(blocked);
  if (route) return { ...route.house.door, objectiveTarget: true, houseId: route.house.id };
  const obstructed = nearest(new Set());
  if (!obstructed) return null;
  return obstructed.path.map((point) => defenders.find((unit) =>
    unit.hp > 0 && unit.x === point.x && unit.z === point.z)).find(Boolean) ?? null;
}

export function destroyStreetHouse(level, enemy) {
  if (!level.streets?.raiders || enemy.id !== 'street-raider' || enemy.hp <= 0 ||
      enemy.ai !== 'mobile' || enemy.frozen) return null;
  const house = level.houses.find((entry) => houseHasReward(entry) &&
    entry.door.x === enemy.x && entry.door.z === enemy.z);
  if (!house) return null;
  house.destroyed = true;
  return house;
}

export function canRecruitEveline(level, recruiter, recruit) {
  const rules = level.streets?.recruit;
  return Boolean(rules && !rules.recruited && !rules.dead && recruit.hp > 0 &&
    recruiter.hp > 0 && recruiter.id === rules.recruiterId && !recruiter.acted &&
    distanceBetween(recruiter.x, recruiter.z, recruit.x, recruit.z) === 1);
}

export function recruitEveline(level, recruiter, recruit) {
  if (!canRecruitEveline(level, recruiter, recruit)) throw new Error('Rictor must be adjacent to living Eveline with an action available.');
  level.streets.recruit.recruited = true;
  recruit.neutral = false;
  recruiter.acted = true;
}

export function streetsVictoryReady(level, enemies, leader) {
  const rules = level.streets;
  return Boolean(rules && leader.id === level.leader && leader.hp > 0 &&
    !enemies.some((enemy) => enemy.id === rules.bossId && enemy.hp > 0) &&
    leader.x === rules.seizePoint.x && leader.z === rules.seizePoint.z);
}

export function freshStreets(rules) {
  if (!rules) return undefined;
  const { inventory, ...recruit } = rules.recruit;
  return { ...rules, recruit: { ...recruit, recruited: false, dead: false, hp: 28 },
    ...(rules.raiders ? { raiders: { ...rules.raiders, warned: false } } : {}),
    ...(rules.pressure ? { pressure: { ...rules.pressure, triggeredTurn: null,
      officerWarned: false, patrolReleased: false, patrol: rules.pressure.patrol.map((unit) => ({ ...unit })) } } : {}) };
}

export function streetWaveEnabled(level, wave) {
  if (wave.entranceId === 'street-raiders' && level.streets?.raiders) return level.streets.raiders.warned;
  return !level.streets?.pressure || !['southern-pursuit', 'southern-officer'].includes(wave.entranceId) ||
    level.streets.pressure.triggeredTurn !== null;
}

// Schedule from the rescue, not the chapter clock, so a slow rescue still gets warning time.
export function updateStreetPressure(level, turn, enemies) {
  const pressure = level.streets?.pressure;
  const events = [];
  if (level.streets?.raiders && !level.streets.raiders.warned && turn >= level.streets.raiders.warningTurn) {
    level.streets.raiders.warned = true;
    events.push('streetRaiderWarning');
  }
  if (!pressure) return events;
  if (pressure.triggeredTurn === null && (level.streets.recruit.recruited || turn >= pressure.fallbackTurn)) {
    pressure.triggeredTurn = turn;
    for (const [id, delay] of [['southern-pursuit', 2], ['southern-officer', 5]]) {
      const wave = level.reinforcements.find((entry) => entry.entranceId === id);
      if (!wave) throw new Error(`Missing street pursuit wave ${id}.`);
      wave.turn = turn + delay;
    }
    events.push('streetPursuitWarning');
  }
  if (pressure.triggeredTurn === null) return events;
  if (!pressure.patrolReleased && turn >= pressure.triggeredTurn + 2) {
    for (const unit of enemies) {
      if (unit.hp > 0 && pressure.patrol.some((entry) =>
        entry.id === unit.id && entry.x === unit.x && entry.z === unit.z)) unit.ai = 'mobile';
    }
    pressure.patrolReleased = true;
    events.push('streetPatrolAdvance');
  }
  if (!pressure.officerWarned && turn >= pressure.triggeredTurn + 3) {
    pressure.officerWarned = true;
    events.push('streetOfficerWarning');
  }
  return events;
}

export function streetWarning(level, turn) {
  const names = { 'western-quarantine': 'Western quarantine', 'southern-pursuit': 'Southern cavalry',
    'southern-officer': 'Southern mounted officer', 'street-raiders': 'House raiders (west/east streets)' };
  const pending = level.reinforcements.filter((wave) => !wave.spawned && streetWaveEnabled(level, wave))
    .sort((a, b) => a.turn - b.turn);
  const warnings = pending.map((wave) =>
    `${wave.turn <= turn ? 'QUEUED: ' : wave.turn <= turn + 2 ? 'WARNING: ' : ''}${names[wave.entranceId] ?? 'Street reinforcements'}: turn ${wave.turn}`);
  if (level.streets.pressure?.triggeredTurn === null) warnings.push('Southern pursuit: follows the rescue, or turn 8 at the latest.');
  else if (level.streets.pressure && !level.streets.pressure.patrolReleased)
    warnings.push(`Northern patrol advances: turn ${level.streets.pressure.triggeredTurn + 2}.`);
  if (!pending.length) warnings.push('All finite street reinforcements have arrived.');
  if (level.streets.raiders) warnings.push(`Unclaimed houses: ${level.houses.filter(houseHasReward).length}; raided: ${level.houses.filter((house) => house.destroyed).length}. Raiders destroy unvisited entrances and their rewards.`);
  return warnings.join(' | ') || 'All finite street reinforcements have arrived.';
}
