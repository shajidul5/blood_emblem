# Blood-Emblem

A starter project for an HD-2D style game: crisp pixel-art sprites standing in a lit, shadowed 3D world, built with [Three.js](https://threejs.org/) and [Vite](https://vitejs.dev/).

## Run it

```bash
npm install
npm run dev
```

Then open the local URL Vite prints (usually http://localhost:5173).

Dev reload protection: rewriting existing PNGs under `assets/` (for example by a sync or copy tool) no longer forces a page reload, so refresh manually after editing existing art. If a code change does force a full reload mid-game, the dev build automatically continues from the last autosave instead of dropping back to the main menu.

## Controls

The game uses turn-based tactical controls:

- Arrow keys or WASD move the battlefield cursor one tile at a time.
- Press **Tab** to cycle through available player units; the current roster has Maria.
- Enter or Space selects Maria or confirms a movement destination / attack target.
- Click Maria to select her, then click a reachable tile or in-range enemy to confirm; menu actions are also clickable.
- Selecting Maria immediately opens her movement range; choose a reachable tile to move, or press Escape to skip movement and open her actions.
- While choosing a movement destination, a thick blue route line with a direction tip shows the path through each tile.
- While choosing a movement tile, click Maria to leave movement targeting and open her action menu.
- After moving, choose **Back · Undo Move** from Maria's action menu to return to her starting tile and select a new destination. The Back button keeps its normal cancel behavior when undo is unavailable. Undo is available until Maria attacks or ends her turn, and is preserved when continuing a saved game.
- Press **Backspace** to activate the contextual Back action from the keyboard; **Escape** also backs out of movement or attack targeting.
- After movement, use the arrow keys or WASD to move focus through the action menu and Space or Enter to activate the focused action.
- Choose **Profile** from Maria's action menu to view her base/current stats, growth rates, level, experience, and equipped weapon.
- Choose **Inventory** from Maria's action menu to equip her Iron Katana or Rapier, or use her three-use Potion. The Rapier has 6 Might, 85 Hit, and 10 Critical; the Potion restores up to 10 HP per use and disappears after its third use. Using an item ends Maria's unit turn, while equipping a weapon does not.
- Inspect an enemy by clicking it or moving the cursor onto it and pressing Enter to view its stats and equipped weapon.
- Maria's class-based movement range is 5 tiles for her Myrmidon class.
- Select **Attack** to target enemies within her weapon range.
- Confirming a target opens a combat forecast with each side's damage per hit, predicted attack count, Hit, and Critical rates; confirm or cancel before combat begins.
- Arrow keys or WASD navigate buttons in menus and dialogs, including the combat forecast.
- Hover over a map tile to see its terrain type, whether it is walkable, and its combat bonuses.
- **End Unit** (or `F`) finishes Maria's actions; once every player unit has finished, enemies take their turn. **End Phase** (or `E`) ends the player phase early.
- Escape cancels the current targeting mode or deselects Maria.
- The main menu offers **New Game** and **Continue**. Progress auto-saves in this browser; clicking an unoccupied tile or choosing **Options** opens a menu with **Return to Main Menu**.
- In Preparations, **Insight** shows weapon sprites and leadership stars. Spend 30 Insight to awaken Maria's Blood Emblem, then **Equip** it separately from her weapon in Insight or her inventory. While equipped and carried, it restores 10 HP (up to max HP) whenever she defeats a foe, including counterattack kills; ordinary hits do not heal. Unequip it freely or refund the upgrade in full. Its `cost` and `healOnKill` are configurable in [data/upgrades.json](data/upgrades.json). The upgrade and equip state persist in saves and between chapters; older saves start with it locked.
- Defeating a boss, including on a counterattack, opens an **Insight Gained** notification with the amount earned and your new total before showing any item drop. Rewards are saved before dismissal. The HUD, Preparations, and reward popup use the same PixelLab-generated all-seeing eye in [assets/ui/insight_eye.png](assets/ui/insight_eye.png) (object `1f6463de-d070-4f51-8953-abff2f3c2f16`). Boss Insight remains configurable in [data/upgrades.json](data/upgrades.json).
- Levels display their objective in the battle HUD. **Kill all enemies** wins when the enemy roster is cleared; **Escape** wins when Maria reaches an Exit tile. Victory and party defeat fade into gothic end screens with options to restart the current level or return to the main menu. These terminal outcomes are saved and restored by **Continue**.

## What's in the prototype

- Animated pixel-art title screen with the Blood Emblem item sprite and rustic serif lettering, drifting clouds and water, twinkling stars, and flickering harbor lights; its layered artwork is stored in `assets/ui/menu/`
- A low top-down pixel-art level with two ships connected by a two-tile-wide bridge, loaded from `data/levels/map_01_two_ships.json`
- Oblique hull edges, deck variations, stairs, mast bases, and decorative ship props from `assets/tiles/ship_oblique/`; blocking props also block unit movement
- Three generic raiders use direction-specific sprites, while Bartz uses his directional idle art and eight-way walking animation; they take turns advancing and attacking, with the camera following each enemy during the enemy phase
- Turn-switch banners showing Player Phase or Enemy Phase and the current turn number
- Directional Maria idle, walking, and frame-based katana attack animations for all eight directions, normalized to a consistent on-screen size with crisp nearest-neighbor filtering
- Green-to-red health bars above all units during combat
- Fixed-angle perspective camera that follows the player during tile-by-tile movement
- Eight-direction, frame-based walking animations with smooth movement along valid map paths
- Moonlight plus a flickering torch light with real shadows
- JSON-backed character, weapon, and item data, growth rates, weapon stats, attack speed, and doubling attacks
- Combat counterattacks when a defender is in weapon range; each side's attack count uses its own attack-speed comparison
- GBA-inspired critical hits, triple attack-power critical damage, and floating hit/critical/miss feedback for player attacks, enemy attacks, and counters
- Grid cursor, class-based movement, attack targeting, HP, and alternating player / enemy phases
- Browser-local save data for the current map, unit stats/EXP, inventory/equipment and consumable uses, enemy types/HP/positions, and turn; older saves without enemy types still load as raiders
- Movement blocked by water, hull, mast, railing, and occupied enemy tiles

## Chapter 9 - The Last Crossing

- The party emerges from the enchanted forest at sunset: bright amber daylight and an orange sky replace the usual night lighting. A seven-tile-wide stone bridge and its parapets continue beyond the northern map edge, with no far bank visible; the full crossing is reserved for Chapter 10.
- Split-rail fences, staggered gates, courtyard houses, and southern forest channels create multiple approaches. Houses are spread across the courtyard to reward Linus's cavalry movement, with all three villagers within seven tiles of his starting position. Crates and barrels furnish the lanes without sealing rescue routes. Fence and parapet tiles block movement; escorts route through the gates rather than through barriers.
- Village fences use transparent PixelLab pixel-art segments in [assets/tiles/Village_Fence](assets/tiles/Village_Fence), with nearest-neighbor filtering in battle and matching previews in the map editor. Their low-profile silhouettes stay inside blocked tiles instead of projecting tall rails over adjacent characters. Both orientations use vertical asset `8f5e7659-d366-4964-a874-2adf6b2eaf78`: the horizontal sprite is an exact 90-degree rotation, preserving identical wood, thickness, and proportions.
- The campaign continues from Chapter 8 into a village defending three stranded civilians. Visit a house from its doorway or an adjacent tile to start that villager's escort. Villagers have 26 HP, can be healed, and move up to three tiles toward the green refuge before each enemy phase. They can be attacked before or during their escort; once safe, they leave the battlefield.
- The western green refuge has an in-world **REFUGE / ESCORT DESTINATION** label. The HUD explains escort movement and safe departure, and **Rescue Villager** uses the same framed button artwork as other available actions.
- Maria can recruit the wounded Cavalier **Linus** with **Talk to Linus** from an adjacent tile. He starts with 28/40 HP, a Steel Lance, a Potion, 7 Movement, 15 Strength and 12 Defense. His lance, sword, and walking animations use the supplied Linus assets. Unrecruited Linus holds position and counters beasts; his death does not fail the chapter.
- Wolves lead the forest attack, followed by another pack on turn **3**. Mobile wolfmen (Root Wardens) join the wolves on turns **5 and 7**, with red approach markers and one-turn-ahead warnings. Knights defend the bridge and do not pursue civilians. Captain Varric is a Cavalier whose **Javelin** attacks at range **1-2** and drops on defeat.
- To win, account for all villagers (rescued or lost), defeat the captain, eliminate all beasts and scheduled waves, then bring Maria to the gold bridge-entrance marker. Maria must survive. Villager losses reduce rewards but do not cause game over.
- Cumulative rescue rewards: **1 safe** = two Potions; **2 safe** = also the Gale wind tome; **3 safe** = also a Crossing Keepsake granting 10 Insight when read. Gale is effective against flying units. Rewards go to Maria or the convoy and are granted only once. The Javelin is a separate combat drop. Existing embedded Chapter 9 saves retain their original reward table.
- Escort positions, HP, losses, Linus recruitment, reinforcement progress, and reward claims persist in autosaves and manual slots. Chapter rules and rewards live in [data/levels/map_09_last_crossing.json](data/levels/map_09_last_crossing.json). Civilians use the dedicated Villager idle and walking assets without a color tint; the Javelin and Steel Lance reuse spear item art.
- Promoting Linus to Paladin selects the Paladin_Linus assets; other Paladins use Generic_Paladin. Both sets switch idle and attack sprites between lance and sword based on the equipped weapon, including after loading a save. Sword variants reuse their matching Paladin's walking animation because no separate sword walk was supplied.
- Run `npm test` for rescue regression tests. For a fresh Chapter 9 playtest, open `?chapter=9`; `?chapter=9&save=1` carries the current autosave's roster, inventory, convoy, and Insight forward. Chapter shortcuts start and autosave a new battle, so use a separate browser origin for disposable testing.

## Chapter 10 - The Golden Threshold

- Part Two ends on a 19-by-36 bridge at dusk, with orange sunlight and darker ambient light. Four alternating sandbag lines force detours between the stone parapets.
- After Preparations, **The Golden Threshold** opening lore card introduces Aurelan's blockade and the uneasy watch on the gate, followed by the bridge objective. This story popup appears even with tutorials disabled; continuing a saved battle does not replay it.
- The **Golden Order** fields guard-mode Cavaliers, Knights and Mages, led by **Captain Aurelan**, a Paladin carrying a Javelin. All bridge Mages hold **Fire**, magical range 1-2, behind each sandbag line. All human defenders use guard AI, not stationary or unrestricted pursuit.
- Aurelan drops an **Orders Emblem**. His defeat immediately commits the second encounter to the save; after the reward notifications, a short silence gives way to a rumble and camera tremor, then a shrieking roar before the **Blood Beast** jumps down from the gatehouse, fitted between the bridge edges. Its foundation uses the same stone paving as the bridge while remaining blocked outside the gate tile. A dark arch and hidden rear floor prevent the back tiles showing through. Its white vestments and high cleric's insignia hint at a Healing Church connection without revealing its identity. This story event still appears with tutorial popups disabled.
- When the Beast fight begins, four **Carrion Ravens** fly in over the water (two on each side). Three more waves of two arrive at +2, +4 and +6 turns, one per side, for **ten ravens total**. They are fast, fragile melee beak attackers with eight movement, flying over water, sandbags and parapets. Buildings/city walls, occupied tiles and map bounds still constrain them. Flying units take triple effective weapon might from all bows and wind magic, but not Fire. The schedule and raven positions persist in saves; Restart resets the waves. Ravens are not required kills for the gate objective.
- The beast is stationary on the gate, with 150 HP and powerful range 1-2 talons. Defeat it, then move **Maria** onto the marked gate tile to win and view the Part Two ending. Other defenders may survive. Maria's death ends the chapter. The gate tile is reserved before the beast arrives, preventing an early seizure or an overlapping spawn.
- Recruited Linus carries forward with your party; an unrecruited Linus is not automatically added to the Chapter 10 roster.
- Encounter state, remaining enemies, damage and rewards survive Continue and numbered saves. Restart resets both bosses and the encounter to the chapter's starting state; restoring a defeated beast never spawns another.
- Sandbags and the gatehouse are PixelLab assets in [assets/tiles/Golden_Bridge](assets/tiles/Golden_Bridge): sandbags `197102a4-f33c-4ebe-abd6-31e69539371c`, gatehouse `d7c14c97-6c18-40b7-bdaf-70ee615ecf95`. Sandbags have matching blocked-tile previews in the editor; imported gate maps preserve their encounter metadata on export.
- Chapter data: [data/levels/map_10_golden_threshold.json](data/levels/map_10_golden_threshold.json). Use `?chapter=10` for a fresh battle or `?chapter=10&save=1` to carry your current party and Insight forward. These shortcuts overwrite the autosave; use a separate browser origin for disposable tests. `npm test` includes map connectivity, enemy ranges, gate conditions and save-state regressions.

## Create and load maps

Open `/map-editor.html` while the development server is running to create a map. Paint directly with the oblique ship atlas; choose **Start** and **Exit** markers, select **Kill all enemies** or **Escape**, resize the grid, import a level, or restore the two-ship template. Stairs grant +10 Avoid; ship props that block movement cannot be placed on Start or Exit.

- **Export JSON** downloads a level file you can keep with the project.
- **Play map** immediately tests the current editor map.
- In the game, **Import level** loads an exported JSON map without restarting.

The first level is `data/levels/map_01_two_ships.json`, with a **Kill all enemies** objective and boss Bartz guarding the Exit. Level files store their name, objective, dimensions, atlas tile IDs, spawn and exit coordinates, and ship props. Older character-grid level files can still be imported; levels without an objective default to **Kill all enemies**.

## Character and weapon data

Character profiles live in `data/characters/` and store base stats, current stats, growth rates (percentages), level, experience, and an equipped weapon ID. Weapon data lives in `data/weapons/` and includes might, weight, hit, critical, and range. Consumable data lives in `data/items/`; playable level data lives in `data/levels/`. Animation metadata is stored in `data/character-assets/`, while sprite images and other visual files remain in `assets/`. Maria starts at level 1 with 0 EXP, matching base/current stats, an Iron Katana, a Rapier, and a three-use Potion; her HP, inventory uses, and equipped weapon are tracked by the battle state and save.

Combat uses strength + weapon might − the defender's defense for physical weapons (magic and resistance for magical weapons). Attack speed is speed − weapon weight + build. A unit doubles when its attack speed is at least 4 higher than its opponent's.

Displayed Hit is weapon Hit + 2×Dexterity + floor(Luck/2) − enemy Avoid, clamped to 0–100. Avoid is 2×Attack Speed + Luck + terrain Avoid. Each strike uses two random rolls averaged together (2RN). Boat terrain is neutral; the walkable Cover tile grants +20 Avoid and +1 physical Defense to its occupant.

Hovering a tile shows whether it is walkable and its terrain bonuses. Stairs grant +10 Avoid, legacy Quarterdeck tiles grant +10 Avoid and +1 Defense, and legacy Helm tiles grant +20 Avoid and +1 Defense. Bartz's Defense has been reduced from 7 to 5.

Each attack plays its directional katana animation; follow-up strikes pause for one second, and combat temporarily locks tactical input.

Critical rate follows the GBA-style formula: weapon Critical + floor(attacker Dexterity/2) − defender Luck, clamped to 0–100. A successful hit gets a separate one-roll critical check. Critical damage triples the damage after defense is subtracted; ordinary and critical hits use yellow and dark-red floating damage numbers, while misses show `MISS`.

Combat EXP is awarded once at the end of the exchange: the existing rule remains 10 EXP if the enemy survives and 30 if defeated, with a GBA-style +40 boss-kill bonus. A normal enemy therefore grants 10/30 EXP for a surviving/defeated exchange, while defeating Bartz grants 70 EXP. Bartz is a level-5 boss with higher HP, strength, defense, and a 10-Critical cutlass. At 100 EXP, Maria levels up, keeps any overflow, and rolls each stat's growth rate once. The EXP bar animates combat rewards and level-up rollovers, then a popup reveals each growth roll and briefly highlights every +1 stat gain.

## Layout

```
blood-emblem/
  index.html      page shell + HUD
  map-editor.html visual tile-map editor
  package.json
  src/main.js     Three.js scene, input wiring, and game loop
  src/battle/     combat rules and tactical grid/pathfinding
  src/characters/ character creation, sprites, and profile dialog
  src/game/      browser-local save and continue state
  src/levels/     level validation, loading, and rendering
  src/map-editor.js tile tools, templates, JSON import/export
  data/characters/ character base/current stats and growth rates
  data/weapons/ weapon might, weight, hit, critical, and range
  data/items/     consumable definitions
  data/levels/    playable JSON maps
  data/character-assets/ animation metadata
  assets/character/Maria/ character idle and walking sprites
  assets/character/Bartz/ Bartz's directional idle sprites
```

## Map tile legend

| Tile | Meaning |
| --- | --- |
| `.` | Water; blocks movement |
| `h` | Boat hull |
| `d` | Walkable deck |
| `b` | Walkable bridge |
| `q` | Walkable stairs (+10 Avoid) |
| `p` | Legacy quarterdeck tile (+10 Avoid, +1 Defense) |
| `w` | Walkable helm (+20 Avoid, +1 Defense) |
| `c` | Walkable cover (+20 Avoid, +1 Defense) |
| `r` | Railing obstacle |
| `m` | Mast obstacle |
| `s` | Player start / spawn |
| `e` | Exit marker |
