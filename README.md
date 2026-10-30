# Blood-Emblem

A starter project for an HD-2D style game: crisp pixel-art sprites standing in a lit, shadowed 3D world, built with [Three.js](https://threejs.org/) and [Vite](https://vitejs.dev/).

## Run it

```bash
npm install
npm run dev
```

Then open the local URL Vite prints (usually http://localhost:5173).

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
- Levels display their objective in the battle HUD. **Kill all enemies** wins when the enemy roster is cleared; **Escape** wins when Maria reaches an Exit tile. Victory and party defeat fade into gothic end screens with options to restart the current level or return to the main menu. These terminal outcomes are saved and restored by **Continue**.

## What's in the prototype

- Animated pixel-art title screen with drifting clouds and water, twinkling stars, and flickering harbor lights; its layered artwork is stored in `assets/ui/menu/`
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
