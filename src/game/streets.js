import { distanceBetween } from '../battle/grid.js';

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
  return { ...rules, recruit: { ...recruit, recruited: false, dead: false, hp: 28 } };
}

export function streetWarning(level, turn) {
  const next = level.reinforcements.find((wave) => !wave.spawned);
  return next ? `${next.turn <= turn ? 'QUEUED: ' : next.turn === turn + 1 ? 'WARNING: ' : ''}Western quarantine wave: turn ${next.turn}`
    : 'The quarantine wave has arrived.';
}
