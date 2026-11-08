import { distanceBetween } from '../battle/grid.js';

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
    wave.turn = turn + 1;
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
  return !level.courtyard || level.courtyard.triggers.some((trigger) =>
    trigger.id === wave.entranceId && trigger.warnedTurn !== null);
}
