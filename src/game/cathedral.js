export const CATHEDRAL_ELEVATIONS = Object.freeze([1.6, 1.35, 1.05, 0.8, 0.55, 0.25]);

export function cathedralElevation(z) {
  if (z <= 10) return 1.6;
  if (z === 11) return 1.35;
  if (z === 12) return 1.05;
  if (z <= 22) return 0.8;
  if (z === 23) return 0.55;
  if (z === 24) return 0.25;
  return 0;
}

export function validateCathedral(rules, level) {
  if (!rules) {
    if (level.tileIds.some((row) => row.some((id) => id.startsWith('cathedral_')))) {
      throw new Error('Cathedral terrain requires Cathedral battle rules.');
    }
    return null;
  }
  if (level.width !== 26 || level.height !== 36 ||
      level.tileIds.some((row) => row.some((id) => !id.startsWith('cathedral_'))) ||
      level.objective !== 'defeat-boss' || rules.bossId !== 'voss' ||
      !level.enemies.some((unit) => unit.id === rules.bossId) ||
      !Array.isArray(rules.beats) || rules.beats.length !== 3 ||
      !rules.beats.every((beat, index) => beat.id === ['summons', 'records', 'sanctuary'][index] &&
        Number.isInteger(beat.thresholdZ) && beat.thresholdZ >= 0 && beat.thresholdZ < level.height &&
        typeof beat.seen === 'boolean') ||
      !Array.isArray(rules.triggers) || rules.triggers.length !== 2 ||
      !rules.triggers.every((trigger, index) =>
        trigger.id === ['nave-paladins', 'gallery-paladins'][index] &&
        Number.isInteger(trigger.thresholdZ) && trigger.thresholdZ >= 0 && trigger.thresholdZ < level.height &&
        (trigger.warnedTurn === null || Number.isInteger(trigger.warnedTurn) && trigger.warnedTurn >= 1) &&
        level.reinforcements.some((wave) => wave.entranceId === trigger.id))) {
    throw new Error('Cathedral requires Voss, three story thresholds, and two warned Paladin waves.');
  }
  // Saves made before the throne existed still carry carpet beneath Voss's seat.
  if (!level.tileIds.some((row) => row.includes('cathedral_throne')) && level.tileIds[3][12] === 'cathedral_carpet') {
    level.tileIds[3][12] = 'cathedral_throne';
  }
  return {
    bossId: rules.bossId,
    beats: rules.beats.map(({ id, thresholdZ, seen }) => ({ id, thresholdZ, seen })),
    triggers: rules.triggers.map(({ id, thresholdZ, warnedTurn }) => ({ id, thresholdZ, warnedTurn })),
  };
}

export function freshCathedral(rules) {
  if (!rules) return undefined;
  return {
    ...rules,
    beats: rules.beats.map((beat) => ({ ...beat, seen: false })),
    triggers: rules.triggers.map((trigger) => ({ ...trigger, warnedTurn: null })),
  };
}

export function advanceCathedralStory(level, team) {
  const beats = [];
  for (const beat of level.cathedral?.beats ?? []) {
    if (!beat.seen && team.some((unit) => unit.hp > 0 && unit.z <= beat.thresholdZ)) {
      beat.seen = true;
      beats.push(beat.id);
    }
  }
  return beats;
}

export function cathedralWaveEnabled(level, wave) {
  return !level.cathedral || level.cathedral.triggers.some((trigger) =>
    trigger.id === wave.entranceId && trigger.warnedTurn !== null);
}
