# Chapter 6 — The Hollow Wood (map design)

Part Two, Chapter 6. The party leaves the village through the old hunting grounds. Wolves have taken them over, and something has changed them. **Objective: defeat the Great Wolf.**

## Frame

- **Canvas:** 48×21 cells at 16px each. The art is `assets/maps/village/forest.png` (768×336, PixelLab `create_image_pro`), on the same illustrated-map pipeline as Chapter 5.
- **Collision:** traced cell by cell over the approved art. It is authored in `scripts/configure-village-maps.mjs`.
- **Camera:** the camera never fully shows rows 0–2, row 20, or the bottom corners.
  - All 287 walkable cells and every unit and spawn tile lie inside the visible area. `tests/hollow-wood.test.js` checks this.
  - Nothing important sits on row 3, which is under the HUD. Only wolf spawn gaps touch it.
- **Outer cells:** everything outside the playable area is dense, impassable canopy. It frames the map and can be cut off by the camera.

## Layout (0-based x →, z ↓)

```
          0         1         2         3         4
          012345678901234567890123456789012345678901234567
       0  ###############~~###############################
       1  ###############~~###############################
       2  ###############~~###############################
       3  ###############~~.##..#..#....##################
       4  #########......==...............################
       5  ######"""".....==...#########...################
       6  #####......."""~~#############............######
       7  ####.ttt..tt.""~~##################......"######
       8  ####.ttt..tt...~~######.R.#########......."#####
       9  ####..........#~~#####."R"....*****......#.#####
      10  #####....t.....==......"R"....******......"#####
      11  #####ttt....t..~~####.......*******......."#####
      12  #####ttt.f..t."~~##################.......######
      13  #####..........~~#############............######
      14  ######""...."""~~##########.....###.......######
      15  ######..".....#~~".##..........#################
      16  ######.""......==..............#################
      17  ######.""....##~~.....##########################
      18  ###############~~###############################
      19  ###############~~###############################
      20  ###############~~###############################
```

**Legend:**
- `.` hunting trail or clearing
- `"` dense undergrowth (+20 Avoid, +2 Def, costs 2 movement)
- `#` dense forest (blocked)
- `~` stained drainage channel (blocked)
- `=` log footbridge (walkable)
- `R` ancient marked monolith (blocked)
- `t` hunters' tents and racks (blocked)
- `f` cold campfire (blocked)

## Zones, from west to east

1. **Hunters' Camp** (x4–14, z4–17): the safe start.
   - Abandoned tents, skinning racks and a cold fire.
   - Start tiles: Maria (7,10), Bartz (8,10), Cyrus (7,9). Seymour, if recruited, fills the nearest free tile.
   - Undergrowth at the camp's north-west (6–9,5) and south-west (6–8,14–17) gives defensive corners.
   - Three exits lead east, one to each bridge.
   - The **rear hunter trail** (6,16–17) is where the late wave reaches the camp.
2. **The Drainage Channel** (x15–16): a stained, rust-red channel crossing the whole map.
   - It can be crossed only by **three log bridges**:
     - **North**, rows 4–5. This is the only bridge two tiles wide.
     - **Middle**, row 10, one tile wide.
     - **South**, row 16, one tile wide.
   - This is the first chokepoint. A wolf beyond a one-tile bridge holds it against one attacker at a time, and the party can hold the bridges the same way.
3. **Hunting Grounds** (x17–31): three east–west lanes split by tree bands. The lanes **never connect to each other**; they join only at the camp and the den.
   - **North trail** (z3–5) leads to the north ridge gap. Its northern edge has the gaps where waves enter.
   - **Monolith lane** (z8–11), reached only from the middle bridge. It holds the **ancient monolith** at (24,8–10), with undergrowth on both sides. At its east end the trail runs into the **bramble thicket** (x28–35, z9–11), a third way into the den that comes out right beside the boss. It is the shortest route, but slow: every bramble tile costs 2 movement.
   - **South trail** (z14–17) leads to the south ridge gap. It has undergrowth at (17,15) and (8,15).
4. **Thorn Ridge** (x30–34): the second chokepoint. The den can be entered only through:
   - the **north gap** (row 6, x30–35), fed by the north trail;
   - the **south gap** (row 13, x30–34), fed by the south trail;

   The party must pick a route or split.
5. **The Den** (x35–42, z6–14): a bone-strewn clearing.
   - **Great Wolf** at (38,10). A rock at (35,10) and a stump at (41,9) break up the den.
   - Undergrowth runs along its eastern edge (41–42, z7–11).

## Enemies

- **Boss:** Great Wolf, level 20, at (38,10). It guards, and drops the **Alpha Fang**.
- **14 Feral Wolves** (level 16). The north and south trail packs are **aggressive** (`mobile`) and hunt the party from turn 1; every other wolf guards (holds until approached):

| Zone | Positions | Role |
|---|---|---|
| North trail (aggressive) | (18,4), (23,4), (27,3) | Charge the north bridge and the camp. |
| Monolith lane (guard) | (21,10), (23,9), (26,10) | Hold the middle bridge exit and the monolith's undergrowth, in front of the thicket. |
| South trail (aggressive) | (18,16), (22,16), (26,15) | Mirror the north trail. |
| Ridge gaps | (32,6), (32,13) | Plug each gap. Each must be cleared at the chokepoint. |
| Den guard | (36,8), (36,12), (41,7) | Flank the boss and the inner sides of both gaps. |

## Pressure (finite reinforcements)

| Turn | Spawn tiles | Count | Pressure |
|---|---|---|---|
| 3 | North trail gaps (21,3), (28,3) | 2 | Hits anyone pushing up the north lane. |
| 5 | South trail edge (18,17), (21,17) | 2 | Mirrors turn 3 and catches the south flank near its bridge. |
| 8 | Rear hunter trail (6,16), (6,17); north gap (24,3) | 3 | Hits the rear. Punishes leaving a healer or straggler in camp, and drives the party forward. |

Seven wolves arrive in total, after which pressure stops. Reinforcements are mobile (not guarding). Every spawn tile is a visible gap in the tree line, so the player can see where wolves will come from.

## Design intent

- **Chokepoints:**
  - The one-tile bridges and ridge gaps reward units with high Def or Avoid.
  - Beast-effective weapons remove pickets quickly.
- **Undergrowth:**
  - Undergrowth gives the defending side cover at the camp corners, around the monolith, and along the den.
  - It costs extra movement, so charging wolves lose tempo.
- **Choices:**
  - The north route is wider (two-tile bridge) but takes the turn 3 and turn 8 waves.
  - The south route is narrower and takes the turn 5 wave.
  - The flank packs come to the party, so the opening turns are about holding the bridges rather than walking into wolves.
  - Splitting the party is faster but exposes each half to its lane's wave.
- **Length:** 12–15 turns at the expected pace. Turn 8 arrives as the party reaches the ridge.

## Implementation

- **Terrain ids** in `src/levels/tiles.js`:
  - `forest_trail`
  - `forest_undergrowth` (avoid 20, def 2, moveCost 2)
  - `forest_bridge`
  - `forest_block` (canopy, channel, monolith, camp props)
- **Layout:** the `forest` layout in `src/levels/village-scene.js`. The art is imported in `level.js` and `map-editor.js` and recorded in `assets/maps/village/manifest.json`.
- **Map data:** authored in `scripts/configure-village-maps.mjs`, which regenerates `data/levels/map_06_hollow_wood.json`.
- **Restart:** `restartLevel` reloads the authored Chapter 6 map, so older saves pick up the new layout.
- **Tutorial:** `data/tutorials/chapter-6.json` describes the den, ridge gaps, bridges and wave turns.
- **Tests:** `tests/hollow-wood.test.js` covers reachability, visibility, bridges, gaps, encounters, waves and start tiles.
