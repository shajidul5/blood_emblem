export function validateShore(rules, level) {
  if (!rules) {
    if (level.objective === 'silence-beacons') throw new Error('Shore objective requires three offering beacons.');
    return undefined;
  }
  const ids = new Set(), positions = new Set();
  if (level.objective !== 'silence-beacons' || !Array.isArray(rules.beacons) || rules.beacons.length !== 3 ||
      typeof rules.silhouetteSeen !== 'boolean' || !rules.beacons.every((beacon) => {
        const key = `${beacon?.x},${beacon?.z}`;
        if (typeof beacon?.id !== 'string' || !beacon.id || ids.has(beacon.id) || positions.has(key) ||
            !Number.isInteger(beacon.x) || !Number.isInteger(beacon.z) ||
            level.tileIds[beacon.z]?.[beacon.x] !== 'shore_beacon' ||
            typeof beacon.extinguished !== 'boolean') return false;
        ids.add(beacon.id); positions.add(key);
        return true;
      }) || !level.tileIds.some((row) => row.includes('shore_gate')) ||
      level.reinforcements.some((wave) => !ids.has(wave.entranceId))) {
    throw new Error('Shore rules need three unique beacons, their waves, a sea gate and silhouette state.');
  }
  return {
    beacons: rules.beacons.map(({ id, x, z, extinguished }) => ({ id, x, z, extinguished })),
    silhouetteSeen: rules.silhouetteSeen,
  };
}

export function freshShore(rules) {
  return rules ? { beacons: rules.beacons.map((beacon) => ({ ...beacon, extinguished: false })), silhouetteSeen: false } : undefined;
}

export function availableBeacon(level, unit) {
  if (!level.shore || unit.hp <= 0 || unit.acted) return undefined;
  return level.shore.beacons.find((beacon) => !beacon.extinguished &&
    Math.abs(beacon.x - unit.x) + Math.abs(beacon.z - unit.z) === 1);
}

export function extinguishBeacon(level, unit) {
  const beacon = availableBeacon(level, unit);
  if (!beacon) throw new Error('A living, unacted unit must stand beside an active offering beacon.');
  beacon.extinguished = true;
  for (const wave of level.reinforcements) {
    if (wave.entranceId !== beacon.id || wave.spawned) continue;
    wave.spawned = true;
    wave.spawnedCount = wave.units.length;
  }
  return beacon;
}

export function shoreVictoryReady(level, maria, rictor) {
  return Boolean(level.shore && level.shore.beacons.every((beacon) => beacon.extinguished) &&
    maria?.hp > 0 && rictor?.hp > 0 &&
    level.tileIds[maria.z]?.[maria.x] === 'shore_gate' &&
    level.tileIds[rictor.z]?.[rictor.x] === 'shore_gate');
}
