import { isTileWalkable } from '../levels/tiles.js';
import { isWalkable, tileKey } from '../battle/grid.js';

export function validateGateEncounter(value, level) {
  if (value === undefined || value === null) return null;
  const { x, z, captainId, beastId, spawned = false, ravenStartTurn = null, ravenWavesSpawned = 0 } = value;
  if (
    level.objective !== 'seize-gate' ||
    captainId !== 'golden-captain' || beastId !== 'blood-beast' ||
    !Number.isInteger(x) || !Number.isInteger(z) ||
    x !== level.exit.x || z !== level.exit.z ||
    !isTileWalkable(level.tileIds[z]?.[x]) ||
    typeof spawned !== 'boolean' ||
    (ravenStartTurn !== null && (!Number.isInteger(ravenStartTurn) || ravenStartTurn < 1)) ||
    !Number.isInteger(ravenWavesSpawned) || ravenWavesSpawned < 0 || ravenWavesSpawned > 4 ||
    (!spawned && (ravenStartTurn !== null || ravenWavesSpawned !== 0)) ||
    (ravenWavesSpawned > 0 && ravenStartTurn === null) ||
    level.enemies.filter((unit) => unit.id === captainId).length !== 1 ||
    level.enemies.some((unit) => unit.id === beastId || unit.x === x && unit.z === z) ||
    level.players.some((unit) => unit.x === x && unit.z === z) ||
    level.objects.some((object) => object.blocksMovement && object.x === x && object.z === z) ||
    level.reinforcements.some((wave) => wave.units.some((unit) =>
      unit.id === captainId || unit.id === beastId || unit.x === x && unit.z === z))
  ) throw new Error('Gate encounter requires one Golden Order captain and a reserved, walkable gate exit for the Blood Beast.');
  return { captainId, beastId, x, z, spawned, ravenStartTurn, ravenWavesSpawned };
}

export function planGateRavens(level, turn, units) {
  const encounter = level.gateEncounter;
  if (!encounter?.spawned || encounter.ravenWavesSpawned >= 4) return [];
  const start = encounter.ravenStartTurn ?? turn;
  if (turn < start + encounter.ravenWavesSpawned * 2) return [];
  const rows = encounter.ravenWavesSpawned === 0 ? [8, 12] : [10];
  const occupied = new Set(units.filter((unit) => unit.hp > 0).map((unit) => tileKey(unit.x, unit.z)));
  const placements = [];
  for (const right of [false, true]) {
    for (const row of rows) {
      const candidates = [];
      for (let z = 0; z < level.height; z++) {
        for (let x = right ? level.width - 4 : 0; x < (right ? level.width : 4); x++) {
          if (level.tileIds[z][x].startsWith('water_') &&
              isWalkable(level, x, z, { type: 'flying' }) && !occupied.has(tileKey(x, z))) {
            candidates.push({ x, z });
          }
        }
      }
      const edgeX = right ? level.width - 2 : 1;
      candidates.sort((a, b) => (Math.abs(a.x - edgeX) + Math.abs(a.z - row)) -
        (Math.abs(b.x - edgeX) + Math.abs(b.z - row)));
      const tile = candidates[0];
      if (!tile) throw new Error('No open water tile remains for the gate ravens.');
      placements.push(tile);
      occupied.add(tileKey(tile.x, tile.z));
    }
  }
  return placements;
}

export function shouldSpawnGateBeast(level, enemies) {
  const encounter = level.gateEncounter;
  return Boolean(encounter && !encounter.spawned &&
    !enemies.some((unit) => unit.id === encounter.captainId && unit.hp > 0));
}

export function gateVictoryReady(level, maria, enemies) {
  const encounter = level.gateEncounter;
  return Boolean(encounter?.spawned && maria?.hp > 0 &&
    maria.x === encounter.x && maria.z === encounter.z &&
    !enemies.some((unit) => unit.hp > 0 &&
      (unit.id === encounter.captainId || unit.id === encounter.beastId)));
}

export function validateGateEncounterState(level, enemies, phase, maria) {
  const encounter = level.gateEncounter;
  if (!encounter) return;
  const captains = enemies.filter((unit) => unit.id === encounter.captainId);
  const beasts = enemies.filter((unit) => unit.id === encounter.beastId);
  if (
    captains.length > 1 || beasts.length > 1 ||
    (!encounter.spawned && (captains.length !== 1 || beasts.length !== 0)) ||
    (encounter.spawned && captains.length !== 0) ||
    beasts.some((unit) => unit.x !== encounter.x || unit.z !== encounter.z || unit.ai !== 'stationary') ||
    (phase === 'victory' && !gateVictoryReady(level, maria, enemies))
  ) throw new Error('Saved gate encounter state is invalid.');
}
