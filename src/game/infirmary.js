import { getClassAbilities } from '../characters/classes.js';
import { findPath, isWalkable, tileKey } from '../battle/grid.js';
import { awardExperience } from '../characters/progression.js';

const adjacent = (unit, point) => Math.abs(unit.x - point.x) + Math.abs(unit.z - point.z) <= 1;
const lockpick = (unit) => getClassAbilities(unit).some((ability) => ability.lockpick);

export function freshInfirmary(rules) {
  if (!rules) return null;
  return {
    ...rules,
    survivedTurns: 0,
    rewardsClaimed: false,
    breached: false,
    gates: rules.gates.map((gate) => ({ ...gate, closed: false })),
    ledger: { ...rules.ledger, collected: false },
    patients: rules.patients.map((patient) => ({ ...patient, rescued: false })),
  };
}

export function infirmaryActions(level, unit, units) {
  const rules = level.infirmary;
  if (!rules || unit.acted || unit.hp <= 0) return [];
  const actions = [];
  for (const gate of rules.gates) {
    if (gate.closed || !adjacent(unit, gate)) continue;
    const blocked = units.some((other) => other.hp > 0 && gate.blocks.some((tile) => tile.x === other.x && tile.z === other.z));
    const hasKey = unit.inventory.some((entry) => entry.id === 'chest-key');
    actions.push({
      id: gate.id, kind: 'gate', target: gate, name: `Seal ${gate.name}`, exp: 45,
      blockedReason: blocked ? 'Clear the gate tiles first.' : !lockpick(unit) && !hasKey ? 'Needs Lockpick or a Chest Key.' : undefined,
    });
  }
  if (!rules.ledger.collected && adjacent(unit, rules.ledger)) {
    actions.push({ id: rules.ledger.id, kind: 'ledger', target: rules.ledger, name: 'Recover Treatment Ledger', exp: rules.interactionExp, insight: 5 });
  }
  for (const patient of rules.patients) {
    if (!patient.rescued && adjacent(unit, patient)) {
      actions.push({ id: patient.id, kind: 'patient', target: patient, name: `Rescue ${patient.name}`, exp: 30 });
    }
  }
  return actions;
}

export function performInfirmaryAction(level, unit, id, units) {
  const action = infirmaryActions(level, unit, units).find((entry) => entry.id === id);
  if (!action || action.blockedReason) throw new Error(action?.blockedReason ?? 'This infirmary objective is no longer available.');
  if (action.kind === 'gate') {
    if (!lockpick(unit)) unit.inventory.splice(unit.inventory.findIndex((entry) => entry.id === 'chest-key'), 1);
    action.target.closed = true;
  } else if (action.kind === 'ledger') action.target.collected = true;
  else action.target.rescued = true;
  unit.moveOrigin = null;
  unit.acted = true;
  return action;
}

export function infirmaryBreached(level, enemies) {
  const point = level.infirmary?.defensePoint;
  return Boolean(point && enemies.some((unit) => unit.hp > 0 && unit.x === point.x && unit.z === point.z));
}

export function infirmaryApproachTarget(level, enemy, allies) {
  const point = level.infirmary.defensePoint;
  const path = findPath(enemy, [point], new Set(), level);
  if (!path.length) return null;
  // Approach the first defender on the route, even before they enter attack reach.
  for (const tile of path) {
    const defender = allies.find((unit) => unit.hp > 0 && unit.x === tile.x && unit.z === tile.z);
    if (defender) return defender;
  }
  return { ...point, objectiveTarget: true };
}

export function infirmaryVictoryReady(level) {
  const rules = level.infirmary;
  return Boolean(rules && !rules.breached && rules.survivedTurns >= rules.defendTurns);
}

export function finishInfirmaryEnemyPhase(level) {
  const rules = level.infirmary;
  if (!rules || rules.breached || infirmaryVictoryReady(level)) return false;
  rules.survivedTurns++;
  return infirmaryVictoryReady(level);
}

export function claimInfirmaryCompletion(level, team, random = Math.random) {
  const rules = level.infirmary;
  if (!infirmaryVictoryReady(level)) throw new Error('The infirmary defense is not complete.');
  if (rules.rewardsClaimed) return [];
  rules.rewardsClaimed = true;
  return team.filter((unit) => unit.hp > 0).map((unit) => ({
    unit, progression: awardExperience(unit, rules.completionExp, random),
  }));
}

export function infirmaryWaveSealed(level, wave) {
  return Boolean(level.infirmary?.gates.some((gate) => gate.closed && gate.entranceId === wave.entranceId));
}

// Occupied entrances queue arrivals rather than teleporting them behind the defense.
export function infirmarySpawnTile(level, placement, units) {
  if (!isWalkable(level, placement.x, placement.z, { type: placement.type })) return null;
  return units.some((unit) => unit.hp > 0 && unit.x === placement.x && unit.z === placement.z) ? null : { x: placement.x, z: placement.z };
}

export function infirmaryWarning(level, turn) {
  if (!level.infirmary) return '';
  if (infirmaryVictoryReady(level)) return 'Evacuation complete.';
  const waves = level.reinforcements.filter((wave) => !wave.spawned && !infirmaryWaveSealed(level, wave) && wave.turn <= turn + 1);
  return waves.length
    ? waves.map((wave) => `${wave.turn <= turn ? 'QUEUED' : 'WARNING'}: ${wave.entranceId} entrance, ${wave.turn <= turn ? 'waiting for space' : `turn ${wave.turn}`}`).join(' · ')
    : 'No incoming wave next turn.';
}

export function validateInfirmaryState(level, enemies, phase, turn) {
  const rules = level.infirmary;
  if (!rules) return;
  const breach = infirmaryBreached(level, enemies);
  if ((breach && !rules.breached) || (phase === 'victory' && (!infirmaryVictoryReady(level) || breach || !rules.rewardsClaimed)) ||
      (rules.rewardsClaimed && phase !== 'victory') ||
      (rules.survivedTurns === rules.defendTurns && phase !== 'victory') ||
      rules.survivedTurns !== (phase === 'victory' ? rules.defendTurns : turn - 1)) {
    throw new Error('Saved infirmary defense progress is invalid.');
  }
  const blocked = new Set(rules.gates.filter((gate) => gate.closed).flatMap((gate) => gate.blocks.map((tile) => tileKey(tile.x, tile.z))));
  if (enemies.some((enemy) => blocked.has(tileKey(enemy.x, enemy.z)))) throw new Error('An enemy is saved inside a sealed gate.');
}
