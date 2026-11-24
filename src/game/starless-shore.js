export function validateShore(rules, level) {
  if (!rules) {
    if (level.objective === 'silence-beacons') throw new Error('Shore objective requires three offering beacons.');
    return undefined;
  }
  const ids = new Set(), positions = new Set();
  const guardianIds = new Set();
  if (level.objective !== 'silence-beacons' || !Array.isArray(rules.beacons) || rules.beacons.length !== 3 ||
      typeof rules.silhouetteSeen !== 'boolean' || !rules.beacons.every((beacon) => {
        const key = `${beacon?.x},${beacon?.z}`;
        if (typeof beacon?.id !== 'string' || !beacon.id || ids.has(beacon.id) || positions.has(key) ||
            !Number.isInteger(beacon.x) || !Number.isInteger(beacon.z) ||
            level.tileIds[beacon.z]?.[beacon.x] !== 'shore_beacon' ||
            typeof beacon.extinguished !== 'boolean' ||
            (beacon.guardians !== undefined && (!Array.isArray(beacon.guardians) || !beacon.guardians.length ||
              !beacon.guardians.every((id) => {
                if (typeof id !== 'string' || guardianIds.has(id) ||
                    level.enemies.filter((enemy) => enemy.id === id).length !== 1) return false;
                guardianIds.add(id);
                return true;
              })))) return false;
        ids.add(beacon.id); positions.add(key);
        return true;
      }) || !level.tileIds.some((row) => row.includes('shore_gate'))) {
    throw new Error('Shore rules need three unique beacons, their waves, a sea gate and silhouette state.');
  }
  if (rules.trials !== undefined && (!Array.isArray(rules.trials) || rules.trials.length !== 2 ||
      !rules.trials.every((trial) => {
        const key = `${trial?.x},${trial?.z}`;
        if (typeof trial?.id !== 'string' || !trial.id || ids.has(trial.id) || positions.has(key) ||
            !['bell', 'observatory'].includes(trial.kind) ||
            typeof trial.name !== 'string' || !trial.name.trim() ||
            typeof trial.activated !== 'boolean' ||
            (trial.activated ? !Number.isInteger(trial.activatedTurn) || trial.activatedTurn < 1 : trial.activatedTurn !== null) ||
            !Number.isInteger(trial.x) || !Number.isInteger(trial.z) ||
            level.tileIds[trial.z]?.[trial.x] !== 'shore_trial') return false;
        ids.add(trial.id); positions.add(key);
        const waves = level.reinforcements.filter((wave) => wave.entranceId === trial.id);
        return waves.length === 1 && waves[0].units.length === 3 &&
          waves[0].spawned === (waves[0].spawnedCount === waves[0].units.length) &&
          (trial.activated ? waves[0].turn === trial.activatedTurn + 1
            : waves[0].turn === 999 && !waves[0].spawned && waves[0].spawnedCount === 0);
      }) || new Set(rules.trials.map((trial) => trial.kind)).size !== 2)) {
    throw new Error('Shore trials need two unique one-tile instruments and one finite three-unit wave each.');
  }
  if (level.reinforcements.some((wave) => !ids.has(wave.entranceId))) {
    throw new Error('Shore waves must belong to a beacon or an optional trial.');
  }
  if (rules.artwork !== undefined &&
      (!['illustrated', 'scene'].includes(rules.artwork) || level.width !== 48 || level.height !== 40)) {
    throw new Error('Illustrated Shore artwork requires its fixed 48x40 tile grid.');
  }
  return {
    beacons: rules.beacons.map(({ id, x, z, extinguished, guardians }) => ({
      id, x, z, extinguished, ...(guardians ? { guardians: [...guardians] } : {}),
    })),
    silhouetteSeen: rules.silhouetteSeen,
    ...(rules.trials ? { trials: rules.trials.map((trial) => ({ ...trial })) } : {}),
    ...(rules.artwork ? { artwork: rules.artwork } : {}),
  };
}

export function freshShore(rules) {
  return rules ? { ...structuredClone(rules),
    beacons: rules.beacons.map((beacon) => ({ ...beacon, extinguished: false })), silhouetteSeen: false,
    ...(rules.trials ? { trials: rules.trials.map((trial) => ({ ...trial, activated: false, activatedTurn: null })) } : {}),
  } : undefined;
}

export function availableBeacon(level, unit, enemies = level.enemies) {
  if (!level.shore || unit.hp <= 0 || unit.acted) return undefined;
  return level.shore.beacons.find((beacon) => !beacon.extinguished &&
    !beacon.guardians?.some((id) => enemies.some((enemy) => enemy.id === id && (enemy.hp === undefined || enemy.hp > 0))) &&
    Math.abs(beacon.x - unit.x) + Math.abs(beacon.z - unit.z) === 1);
}

export function extinguishBeacon(level, unit, enemies = level.enemies) {
  const beacon = availableBeacon(level, unit, enemies);
  if (!beacon) throw new Error('A living, unacted unit must stand beside an active offering beacon after its guardians fall.');
  beacon.extinguished = true;
  for (const wave of level.reinforcements) {
    if (wave.entranceId !== beacon.id || wave.spawned) continue;
    wave.spawned = true;
    wave.spawnedCount = wave.units.length;
  }
  return beacon;
}

export function availableShoreTrial(level, unit) {
  if (!level.shore?.trials || unit.hp <= 0 || unit.acted) return undefined;
  return level.shore.trials.find((trial) => !trial.activated &&
    Math.abs(trial.x - unit.x) + Math.abs(trial.z - unit.z) === 1);
}

export function activateShoreTrial(level, unit, turn) {
  const trial = availableShoreTrial(level, unit);
  if (!trial || !Number.isInteger(turn) || turn < 1) {
    throw new Error('A living, unacted unit must stand beside an unused Shore instrument on a valid turn.');
  }
  const wave = level.reinforcements.find((entry) => entry.entranceId === trial.id);
  if (!wave || wave.spawned || wave.spawnedCount) throw new Error('Shore trial has no unused guardian wave.');
  trial.activated = true;
  trial.activatedTurn = turn;
  wave.turn = turn + 1;
  return trial;
}

export function shoreWaveEnabled(level, wave) {
  if (!level.shore) return true;
  const trial = level.shore.trials?.find((entry) => entry.id === wave.entranceId);
  if (trial) return trial.activated;
  return level.shore.beacons.some((beacon) => beacon.id === wave.entranceId && !beacon.extinguished);
}

export function shoreWarning(level, turn) {
  const waves = level.reinforcements.filter((wave) => !wave.spawned && shoreWaveEnabled(level, wave));
  if (!waves.length) return 'No further summons';
  const next = Math.min(...waves.map((wave) => wave.turn));
  return `Summons ${next <= turn ? 'queued at marked shores' : `on turn ${next}`} (${waves.length} waves remain)`;
}

export function validateShoreSave(level, enemies, turn) {
  if (!level.shore) return;
  if (level.shore.beacons.some((beacon) => beacon.extinguished && beacon.guardians?.some((id) =>
    enemies.some((enemy) => enemy.id === id && enemy.hp > 0))) ||
      level.shore.trials?.some((trial) => trial.activated && trial.activatedTurn > turn)) {
    throw new Error('Saved Shore guardian or trial progress is invalid.');
  }
  for (const trial of level.shore.trials ?? []) {
    const wave = level.reinforcements.find((entry) => entry.entranceId === trial.id);
    if ((!trial.activated || turn < wave.turn) &&
        (wave.spawnedCount > 0 || enemies.some((enemy) => wave.units[0].id === enemy.id && enemy.hp > 0))) {
      throw new Error('Saved Shore trial enemies arrived before their activation.');
    }
  }
  if (level.shore.beacons.some((beacon) => beacon.extinguished &&
      level.reinforcements.some((wave) => wave.entranceId === beacon.id &&
        (!wave.spawned || wave.spawnedCount !== wave.units.length)))) {
    throw new Error('Saved extinguished Shore flames cannot have pending waves.');
  }
}

export function shoreVictoryReady(level, maria, rictor) {
  return Boolean(level.shore && level.shore.beacons.every((beacon) => beacon.extinguished) &&
    maria?.hp > 0 && rictor?.hp > 0 &&
    (maria.x !== rictor.x || maria.z !== rictor.z) &&
    level.tileIds[maria.z]?.[maria.x] === 'shore_gate' &&
    level.tileIds[rictor.z]?.[rictor.x] === 'shore_gate');
}
