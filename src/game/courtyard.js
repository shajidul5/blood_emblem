import { distanceBetween } from '../battle/grid.js';

export const courtyardWaveDelay = (trigger) => trigger.delay ?? 1;

export function courtyardDeliveryCourt(level, enemy) {
  const tactics = level.courtyard?.tactics;
  return !tactics?.ravenReinforcements && ['bell-envoy', 'envoy-raven'].includes(enemy.id)
    ? tactics?.deliveryCourt : undefined;
}

export function insideDeliveryCourt(court, point) {
  return point.x >= court.minX && point.x <= court.maxX && point.z >= court.minZ && point.z <= court.maxZ;
}

export function courtyardPatrolBlockers(level, enemy) {
  const court = courtyardDeliveryCourt(level, enemy);
  const blocked = [];
  if (court) for (let z = 0; z < level.height; z++) {
    for (let x = 0; x < level.width; x++) {
      if (!insideDeliveryCourt(court, { x, z })) blocked.push({ x, z, hp: 1 });
    }
  }
  return blocked;
}

export function activateCourtyardFormations(level, enemies, party, { attacked, canEngage } = {}) {
  for (const formation of level.courtyard?.tactics?.formations ?? []) {
    if (formation.active) continue;
    const members = formation.members.map((placement) => enemies.find((unit) =>
      unit.id === placement.id && unit.x === placement.x && unit.z === placement.z && unit.hp > 0));
    if (!party.some((unit) => unit.hp > 0 && unit.z <= formation.thresholdZ) &&
        !members.some((unit) => unit && (unit === attacked || unit.hp < unit.maxHp || canEngage?.(unit))) &&
        members.every(Boolean)) continue;
    formation.active = true;
    for (const unit of members.filter(Boolean)) unit.ai = 'mobile';
  }
}

export function canRecruitCorvis(level, recruiter, enemy) {
  const recruit = level.courtyard?.recruit;
  return Boolean(recruit && enemy && !recruit.recruited && !recruit.dead &&
    enemy.id === recruit.id && enemy.hp > 0 && recruiter.hp > 0 && !recruiter.acted &&
    recruiter.id === recruit.recruiterId &&
    distanceBetween(recruiter.x, recruiter.z, enemy.x, enemy.z) === 1);
}

export function recruitCorvis(level, recruiter, enemy) {
  if (!canRecruitCorvis(level, recruiter, enemy)) throw new Error('Eveline must Talk to adjacent living Corvis with an action available.');
  level.courtyard.recruit.recruited = true;
  recruiter.acted = true;
}

export function freshCourtyard(rules) {
  if (!rules) return undefined;
  return {
    ...rules,
    recruit: { ...rules.recruit, recruited: false, dead: false },
    triggers: rules.triggers.map((trigger) => ({ ...trigger, warnedTurn: null })),
    ...(rules.tactics ? { tactics: { ...rules.tactics, deliveryCourt: { ...rules.tactics.deliveryCourt },
      ...(rules.tactics.ravenReinforcements ? { ravenReinforcements: {
        arrivalTurn: null, waves: [...rules.tactics.ravenReinforcements.waves],
      } } : {}),
      formations: rules.tactics.formations.map((formation) => ({ ...formation, active: false,
        members: formation.members.map((member) => ({ ...member })) })) } } : {}),
  };
}

export function triggerProgressWaves(level, team, turn) {
  const warnings = [];
  const triggers = (level.courtyard ?? level.cathedral)?.triggers ?? [];
  for (const [index, trigger] of triggers.entries()) {
    if (trigger.warnedTurn !== null || !team.some((unit) => unit.hp > 0 && unit.z <= trigger.thresholdZ)) continue;
    if (index > 0 && (triggers[index - 1].warnedTurn === null || triggers[index - 1].warnedTurn >= turn)) continue;
    const wave = level.reinforcements.find((entry) => entry.entranceId === trigger.id);
    if (!wave) throw new Error(`Missing progress-triggered wave ${trigger.id}.`);
    trigger.warnedTurn = turn;
    wave.turn = turn + courtyardWaveDelay(trigger);
    warnings.push(trigger.id);
  }
  return warnings;
}
export const triggerCourtyardWaves = triggerProgressWaves;

export function courtyardVictoryReady(level, enemies, leader) {
  return Boolean(level.courtyard && leader?.hp > 0 &&
    !enemies.some((enemy) => enemy.id === level.courtyard.bossId && enemy.hp > 0));
}

export function courtyardWaveEnabled(level, wave) {
  if (level.courtyard?.tactics?.ravenReinforcements?.waves.includes(wave.entranceId)) {
    return level.courtyard.tactics.ravenReinforcements.arrivalTurn !== null;
  }
  return !level.courtyard || level.courtyard.triggers.some((trigger) =>
    trigger.id === wave.entranceId && trigger.warnedTurn !== null);
}
