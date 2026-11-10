# Blood-Emblem

A starter project for an HD-2D style game: crisp pixel-art sprites standing in a lit, shadowed 3D world, built with [Three.js](https://threejs.org/) and [Vite](https://vitejs.dev/).

Infantry and armored units share one visible idle height, including promoted sprites such as Bishop Seymour. Mounted units are 20% taller; monsters retain their authored sizes. Sizing measures visible artwork rather than transparent animation padding, preserves each animation's proportions and keeps feet grounded without resampling the source art. Existing saves use the corrected sizing automatically.

Chapter 1's ship mast and flag share the camera-matched pitch of the deck crates and barrels, with the mast anchored at its deck base rather than its center.

## Run it

```bash
npm install
npm run dev
```

Then open the local URL Vite prints (usually http://localhost:5173).

Dev reload protection: rewriting existing PNGs under `assets/` (for example by a sync or copy tool) no longer forces a page reload, so refresh manually after editing existing art. If a code change does force a full reload mid-game, the dev build automatically continues from the last autosave instead of dropping back to the main menu.

### Save backups and Chapter 16 playtest

- Saves live in browser storage, separately for each browser profile and exact address (host and port). They are not stored in GitHub or a database.
- Open **Load Game** from the title, or **Options > Save Game** during play. Each slot has **Export** (downloads a JSON backup) and **Import** (choose a JSON file for that slot). Imports validate the complete save before writing, confirm overwrites, and leave the current autosave and other slots untouched. Load the imported slot to play.
- **Export Current Save** downloads the current autosave without needing a manual slot. Keep downloaded files outside browser storage so they survive browser resets and can be imported at another address.
- [Chapter 16 level-20 test save](saves/chapter16-level20.json): all 12 allies, with Maria (Ravager), Rictor (Templar), Arlan (General), and Lena (Assassin) promoted. The convoy holds eight Orders Emblems for the remaining units, spare equipment and keys. The party starts with 115 unspent Insight (the full campaign maximum through Chapter 16, granted early for testing; Chapter 16 rewards can still be earned). Stats use seeded rolls through the normal level-up logic. Import it into an empty slot; no existing slot is automatically overwritten.
- Regenerate the fixture after map changes with `npm run create-test-save`. **Restart Chapter** reopens Preparations using the fixture's level-20 roster and supplies.

## Chapter 17: The Shore Beneath the World

The Bell Lift opens onto a 40x36 ancient harbor beneath an impossible star field. The reunited twelve-unit roster crosses basalt quays and narrow causeways over a black ocean. Covenant Dark Sages, Deep Sages, Covenant Halberdiers, durable Drowned Beasts, swift Tide Stalkers and flying Gloam Ravens replace Church and Order forces. All humanoid enemies are promoted; monsters have equivalent late-game stats rather than base undead stats. All six enemy types have increased HP, offenses, accuracy and defenses, balanced against promoted level-20 allies even with maximum Leadership and cover. Deep Sages wield Inferno and use promoted Sage art; four Halberdiers guard the central and northern routes using the supplied Generic Halberdier idle, walking and attack sprites. Each new creature has its own directional artwork and movement/attack animations; the supplied Generic Dark Sage pack is also used.

Existing saves embed their original enemy placements and remaining HP. Start Chapter 17 fresh to receive the four Halberdier placements and full rebalanced HP; earlier chapters' generic undead remain unchanged.

Stand adjacent to each of the three offering beacons and choose **Extinguish Beacon**, spending that unit's action. Each active beacon has only two scheduled summons, on player turns 5 and 9; occupied arrival markers queue their creatures instead of teleporting them. Extinguishing a beacon cancels its unspawned waves. Then bring **both Maria and Rictor** onto the northern sea-gate tiles. Both must survive.

Two optional ancient armories hold Starless Edge and Horizon String in the west, Tidepiercer and Keelbreaker in the east. Four nearby Drowned Beasts drop the four Chest Keys needed without Lena. These are relics of the drowned civilization, not Church silver weapons. The Bell-Drowned appears only as distant scenery and a story glimpse; its battle is reserved for Chapter 18. Beacon, wave and glimpse state persist in saves and reset on chapter restart.

## Chapter 19: The Throne Beneath the Stars

A 44x36 map connects western funerary terraces, a central processional ascent and eastern scripture halls above an animated black ocean and a visible northern star field. Flat PixelLab paving rises through four terrace heights (0.8, 2, 3.2 and 4.4). Nine actual stair runs, each **two tiles wide and three tiles long**, replace the upright stair props. Each run has twelve treads, risers, sidewalls and clear landings; unit heights follow the ascent. Infantry movement ranges and pathfinding must use stairs instead of climbing platform cliffs or entering stairs sideways. Flying units can cross those height changes. Thin stone foundations, submerged support pillars and edge columns give the terraces a visibly elevated silhouette. South-facing buildings retain blocked footprints, north-to-south sprite layering and automatic occlusion fading. The [initial art preview](assets/tiles/Throne_Beneath_Stars/map-preview.png) and [Workshop art manifest](assets/tiles/Throne_Beneath_Stars/map-art.json) preserve the starting concept; the playable layout is [the Chapter 19 map](data/levels/map_19_abyssal_throne.json). Regenerate it with `node scripts/create-chapter19-map.mjs`.

The reunited twelve-unit roster faces 31 enemies: ten stronger Crowned Ravens, four Drowned Citizens, three Tide Stalkers, four Ancient Guardians, four Luna-wielding Testament Scholars, two Nosferatu Confessors, three Grave Cantors and Vael. Drowned creatures and Guardians scale to level 30 through their existing growth rates, without changing Chapter 18 profiles. Cantors have S-rank Staff training and six authored Physic casts each. They spend their normal action on healing. No enemies summon reinforcements, and there are no switches or mandatory side mechanisms.

Defeat **High Cantor Vael**, the unique **Abyssal Hierophant**; Maria and Rictor must survive. Dedicated PixelLab sprites show his ivory-and-indigo robes, broken gold halo and crimson grimoire, with eight-direction walking and casting animations. A south-facing seated pose changes to standing when he awakens; restored saves select the correct pose. His **Last Testament** has its own icon, 18 Might, 100 Hit and range 1-3. Vael waits on a throne granting +2 Defense, +15 Avoid and 5 HP recovery per enemy phase, then rises and can move when an ally reaches the final stairs. Once active:

- **Foretold Ruin** marks a fixed cross of up to five golden tiles at the start of a player turn. Those tiles deal exactly 22 HP damage during the following enemy phase, regardless of defenses; moving away avoids it. After resolution, the next warning is at least three turns later. It stops on Vael's death.
- **Profane Benediction** replaces his normal attack on every third enemy phase (turns divisible by three). He heals one wounded cultist within six tiles for up to 30 HP, or spends the action channeling if none remain. He still counters attacks. The objective panel announces these openings; Ruin is not prepared on those turns.

Progress-triggered story beats lower the ocean without changing occupied terrain, turn the petrified congregation, gather and dim the stars, awaken the empty Blood Emblem socket and fade the ocean ambience into silence. Maria's emblem response does not require its optional Insight upgrade or equipping it. Story, awakening, warning and enemy staff-use state persist in saves; Restart Chapter resets them. Chapter 18 victory now leads into Chapter 19. For a fresh isolated dev start, open `?chapter=19`; `&save=1` carries the browser autosave's roster as usual.

Existing Chapter 19 saves retain their embedded original terrain, stairs and remaining enemy roster, rather than silently moving units or replacing enemies. Start Chapter 19 fresh to receive the rebuilt platforms and mixed enemies. No save slots are overwritten by the map generator.

Mouse targeting uses the actual terrace and stair-row heights, including the original heights in older saves.

## Chapter 18: The City That Waits

A 42x36 ancient city rises above the same black ocean and impossible stars. Its 35 blocked building footprints, layered distant neighborhoods, arcades, observatory, armory and shrines use PixelLab scenery. Regenerated facades and astronomer statues face straight south rather than using isometric building views. Three canals divide the crowded districts; seven two-tile bridges create real infantry chokepoints without moving the original 30 enemies, twelve allies or supply chests. Building artwork fits its blocked footprint rather than covering walkable streets.

Chapter 18's 32x32 floor art mixes worn, cracked ancient paving with restrained gravel patches and larger plaza stones, without bevels or baked shadows. Floors and bridge decks remain unlit planes at ground level. Water-facing ground edges have pixel-stepped erosion, a dark wet margin and a loose shingle fringe extending into the sea, rather than a clean square cutoff; bridge decks stay intact. These are visual edges only and do not change movement or tile bonuses. The black ocean and canals play the existing nine-frame PixelLab ripple strip at five frames per second, with different tile phases and no displaced geometry. The ocean draws before scenery, and facades draw north-to-south so water and distant terraces cannot paint over nearby roofs. This is Chapter 18-specific; Chapter 17's sea and floors are unchanged.

Six mint-colored **Ward Sigils** grant **+2 Defense and +10 Avoid** to whichever unit occupies them. They cost normal movement, do not heal, and do not reduce the Bell-Drowned's fixed 18 HP resonance damage. Their thin, flat celestial markings stand apart from the turquoise shoreline arrival rings and gold hazard warnings.

Green floor highlights mark walkable tiles beside inactive mechanisms and the exact standing tile of each unopened supply chest. Highlights disappear after activation or opening, including when restoring a saved game. They are visual interaction guides, not terrain bonuses or a waiver of chest key/lockpicking requirements.

Chapter 18 units and facades share north-to-south foot-position layering, including during movement. Units behind a large structure no longer draw their bodies over its facade. Structures automatically fade to 28% opacity whenever they obscure a living, fielded ally or enemy, regardless of selection, and return to full opacity once all units move clear. Obscured units retain a subtle mint contour and visible HP bar. Other chapters retain their existing unit rendering.

Ancient Guardians have eight-direction idle, walking and attack sprites. The Bell-Drowned is now a pale, barnacled sea abomination with no helmet and a heavy bronze bell strapped to its back, with eight new directional claw attacks. Its durability increases from 125 HP / 22 Defense / 18 Resistance to **150 HP / 28 Defense / 26 Resistance**. Drowned citizens, Tide Stalkers, Gloam Ravens and promoted sages retain distinct roles. Chapter-specific HP, relevant offense, Defense and Resistance growths are higher; current sheets include the extra gains from those growths, and higher-level placements scale through the same normal growth calculation. Dexterity remains role-based, not universally inflated. Earlier chapters' profiles are unchanged.

Two creatures emerge at the turquoise shore rings on player turns **4, 7, 10 and 13**: eight creatures total, alternating Drowned Citizens and Tide Stalkers at level 28. They arrive before the player acts, not during the enemy phase. Occupied arrival tiles queue the wave at its authored shore instead of teleporting creatures inland. Partial waves persist in saves. No further arrivals follow the fourth wave or boss defeat; there are no Church troops.

Chapter 18's level-26 human casters receive +6 HP, +3 Magic, +2 Dexterity, +1 Speed, +2 Defense and +2 Resistance. Ancient Guardians receive +8 HP, +3 Strength, +2 Dexterity, +3 Defense and +3 Resistance, retaining their previous Speed and movement. These are Chapter 18-specific stat-sheet increases; growth rates, weapons, beasts, Ravens, tide waves and the Bell-Drowned are unchanged.

Stand adjacent to both district mechanisms and choose **Activate Mechanism**, spending an action. Both must be active to open the central approach, even for flyers. Two optional supply chests reward exploration. Defeat the Bell-Drowned to win; Maria and Rictor must survive. Its golden lane warnings appear at the start of a player phase and resolve at the next enemy phase for 18 HP damage, ignoring armor and flight and potentially killing. Columns and rows alternate, with two quiet turns between pulses. The boss attacks and counters normally, without invulnerable phases. Mechanisms, pending warnings and tide progress persist through saves; restarting clears them.

Existing Chapter 18 saves retain their embedded old layout, wave schedule and remaining enemy HP. New floor rendering and ocean animation apply on reload; enter Chapter 18 fresh for the added buildings, Ward Sigils, districts, bridges, tide schedule and full upgraded durability. Existing saves without building-footprint metadata or tide waves remain compatible; no browser slots are overwritten automatically.

The city reveals that its bells once kept the Deep One asleep, until its custodians corrupted the rite. The ending exposes a staircase beneath the retreating ocean.

### Dark magic upgrades

The final Dark Tome Insight upgrade is now **Nosferatu**, following Luna at the existing 12-Insight final-tier price. Its attacks heal the caster for half the actual HP damage dealt, rounded down, including counterattacks; overkill does not inflate healing. It remains a normal damaging spell that can double, critically hit and kill. Its new tome icon is PixelLab-generated. Older Eclipse equipment, spell-use records and convoy entries migrate to Nosferatu without changing unlocked tiers.

**Dark Sage: Dark Mastery** doubles the maximum uses of every spell and staff, not just dark magic. Promotion adds the extra capacity while preserving uses already spent; ordinary chapter refills restore the new doubled maximum.

## Controls

The game uses turn-based tactical controls:

- Arrow keys or WASD move the battlefield cursor one tile at a time.
- Press **Tab** to cycle through available player units; the current roster has Maria.
- Enter or Space selects Maria or confirms a movement destination / attack target.
- Click Maria to select her, then click a reachable tile or in-range enemy to confirm; menu actions are also clickable.
- Selecting Maria immediately opens her movement range; choose a reachable tile to move, or press Escape to skip movement and open her actions.
- While choosing a movement destination, a thick blue route line with a direction tip shows the path through each tile.
- Enemy ranges pinned with **Space** stay visible while a unit is selected and moving; during movement every tile the pinned enemies can reach or strike is shown in red beneath the blue movement tiles.
- **Convoy** appears in the action menu for Maria, Rictor, and any unit standing next to either of them. It opens the inventory with the shared convoy's Store and Take controls and does not use the unit's action.
- While choosing a movement tile, click Maria to leave movement targeting and open her action menu.
- After moving, choose **Back · Undo Move** from Maria's action menu to return to her starting tile and select a new destination. The Back button keeps its normal cancel behavior when undo is unavailable. Undo is available until Maria attacks or ends her turn, and is preserved when continuing a saved game.
- Press **Backspace** to activate the contextual Back action from the keyboard; **Escape** also backs out of movement or attack targeting.
- Tap either **Ctrl** key (without another shortcut key) or **right-click** for universal Back. In Preparations, these return every subview, including Trade and Convoy, to its parent; nested Profile/Options dialogs close first, and View Map returns to Preparations. Back at the preparation hub keeps it open.
- **Restart Chapter** after leaving Preparations keeps everything done there: deployment, trades, convoy changes, used items, promotions and Insight purchases. Preparations reopen with those choices so you can adjust them. Starting items are not granted twice.
- In Preparations, select a unit under **Inventory**, then **Convoy** to use an Orders Emblem directly from storage, even with a full inventory. Carried emblems work under **Use Item**. Promotion requires level 20 and a base class; it consumes one emblem without using the unit's battle action.
- After movement, use the arrow keys or WASD to move focus through the action menu and Space or Enter to activate the focused action.
- The attack picker lists the equipped weapon or spell first. Choosing an attack weapon equips it immediately, including its matching sprite, and keeps it equipped for counters and saves.
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
- In Preparations, **Use Item** lists each item's lore; Trade and Convoy screens hide lore to keep the two columns compact. **Insight** shows item sprites and leadership stars. Each leadership star gives the party +3 Hit and +3 Avoid, costing 4/6/8/10/12 Insight; refunds return the price actually paid (older saves' stars refund at the original 2–6 prices). Spend 30 Insight to awaken Maria's Blood Emblem, then **Equip** it separately from her weapon in Insight or her inventory. While equipped and carried, it restores 10 HP (up to max HP) whenever she defeats a foe, including counterattack kills; ordinary hits do not heal. Unequip it freely or refund the upgrade in full. Its `cost` and `healOnKill` are configurable in [data/upgrades.json](data/upgrades.json). The upgrade and equip state persist in saves and between chapters; older saves start with it locked.
- **Spellbooks.** Tomes and staves work like real spellbooks: each Insight unlock (6, then 12 Insight) teaches the next spell in that book, shared by everyone with the class and weapon rank to wield it. A carried book keeps its own uses plus separate uses for every unlocked spell; inventory lists each spell indented under its book. Refunds return the full price and drop the spell from every carried book.
- **Choose before targeting.** Attack always opens a weapon/spell picker, even with one weapon; selecting it equips it and opens targeting and the combat forecast. Heal/Freeze always open a staff-spell picker before choosing a target (inventory's Use shortcut selects that spell directly). Pickers show sprites, stats, rank requirements and uses, with unusable entries disabled and explained. An empty equipped tome does not prevent selecting another usable spell or weapon. Cancelling a picker does not consume an action or change the equipped weapon; staff use keeps the combat weapon equipped.
- **Spell ranks.** Blaze, Gale, Elthunder, Lumen, Mend and Hold require D in their weapon type. Inferno, Tempest, Aureole, Physic and Stasis require B; Bolting requires A. These are set by each spell's `requiredRank`; an Insight unlock does not bypass ranks. A saved spell below its newly required rank falls back to its base tome, preserving unlocks and remaining uses. Authored enemy spell loadouts do not depend on player unlocks/rank progression.

  | Book | Base | Tier 1 | Tier 2 |
  |---|---|---|---|
  | Fire | Fire | Blaze (9 Mt, 7 Wt, 8 uses) | Inferno (13 Mt, 11 Wt, 5 uses) |
  | Wind | Wind | Gale (6 Mt, 4 Wt, 95 Hit) | Tempest (8 Mt, range 1-3) |
  | Thunder | Thunder | Elthunder (9 Mt, 20 Crit) | Bolting (12 Mt, range 3-10, 4 uses) |
  | Light | Light | Lumen (8 Mt) | Aureole (11 Mt, halves Resistance) |
  | Heal staff | Heal | Mend (heals 18 + Magic) | Physic (range 1 to Magic/2) |
  | Freeze staff | Freeze | Hold | Stasis (freezes for 2 turns) |

  Spells are configured in [data/upgrades.json](data/upgrades.json) (`spellCosts`, `spellbooks`) and each has its own JSON in [data/weapons](data/weapons) with a `spellbook` and `tier`. Wind-book spells stay effective against flying units.
- **Evolutions.** For 30 Insight each, Maria's Rapier is reforged into the **Bloodletter** (brave, 7 Mt, 15 Crit) and Rictor's Vigil Lance into **Longinus**, the demonslayer lance (10 Mt, effective against undead, cavalry and armor). For **20 Insight**, the **Hunter Pistol** becomes **Evelynn**: the same 6 Mt, 4 Wt, 80 Hit, 5 Crit and range 1–2, with two consecutive strikes per volley and a 20-round capacity instead of 10. Each gunshot, including a miss, spends one round; an empty gun cannot finish a brave volley or counterattack. Reforging preserves loaded rounds rather than refilling them, and reverting clamps ammo to the base pistol's capacity. Chapter-start refills and existing class capacity multipliers apply to both guns. The weapon must be carried by a deployed unit or sit in the convoy; reverting refunds the amount originally paid (15 for personal evolutions bought before the price increase). Older saves get back all Insight spent on the retired incremental weapon upgrades, and an awakened Raikiri becomes the Bloodletter.
- Enemy placements and reinforcements may set `weaponId` to override their class weapon (for example, a late-game mage casting Blaze).
- Defeating a boss, including on a counterattack, opens an **Insight Gained** notification with the amount earned and your new total before showing any item drop. Rewards are saved before dismissal. Options > Objective, Preparations, and the reward popup use the same PixelLab-generated all-seeing eye in [assets/ui/insight_eye.png](assets/ui/insight_eye.png) (object `1f6463de-d070-4f51-8953-abff2f3c2f16`). Boss Insight remains configurable in [data/upgrades.json](data/upgrades.json).
- Levels display their objective under **Options > Objective**. **Kill all enemies** wins when the enemy roster is cleared; **Escape** wins when Maria reaches an Exit tile. Victory and party defeat fade into gothic end screens with options to restart the current level or return to the main menu. These terminal outcomes are saved and restored by **Continue**.

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
- The western green refuge has an in-world **REFUGE / ESCORT DESTINATION** label. Options > Objective explains escort movement and safe departure, and **Rescue Villager** uses the same framed button artwork as other available actions.
- Maria can recruit the wounded Cavalier **Linus** with **Talk to Linus** from an adjacent tile. He starts with 28/40 HP, a Steel Lance, a Potion, 7 Movement, 15 Strength and 12 Defense. His lance, sword, and walking animations use the supplied Linus assets. Unrecruited Linus holds position and counters beasts; his death does not fail the chapter.
- Wolves lead the forest attack, followed by another pack on turn **3**. Mobile wolfmen (Root Wardens) join the wolves on turns **5 and 7**, with red approach markers and one-turn-ahead warnings. Knights defend the bridge and do not pursue civilians. Captain Varric is a Cavalier whose **Javelin** attacks at range **1-2** and drops on defeat.
- To win, account for all villagers (rescued or lost), defeat the captain, eliminate all beasts and scheduled waves, then bring Maria to the gold bridge-entrance marker. Maria must survive. Villager losses reduce rewards but do not cause game over.
- Cumulative rescue rewards: **1 safe** = two Potions; **2 safe** = also the Wind tome; **3 safe** = also a Crossing Keepsake (a sealed parchment note) granting 10 Insight when read. Wind is the lightest, most accurate and weakest anima tome (3 Mt, 2 Wt, 100 Hit, range 1-2; unlocks Gale and Tempest with Insight) and is effective against flying units. Rewards go to Maria or the convoy and are granted only once. The Javelin is a separate combat drop. Existing embedded Chapter 9 saves retain their original reward table.
- Escort positions, HP, losses, Linus recruitment, reinforcement progress, and reward claims persist in autosaves and manual slots. Chapter rules and rewards live in [data/levels/map_09_last_crossing.json](data/levels/map_09_last_crossing.json). Civilians use the dedicated Villager idle and walking assets without a color tint; the Javelin and Steel Lance reuse spear item art.
- Promoting Linus to Paladin selects the Paladin_Linus assets; other Paladins use Generic_Paladin. Both sets switch idle and attack sprites between lance and sword based on the equipped weapon, including after loading a save. Sword variants reuse their matching Paladin's walking animation because no separate sword walk was supplied.
- Run `npm test` for rescue regression tests. For a fresh Chapter 9 playtest, open `?chapter=9`; `?chapter=9&save=1` carries the current autosave's roster, inventory, convoy, and Insight forward. Chapter shortcuts start and autosave a new battle, so use a separate browser origin for disposable testing.

## Chapter 10 - The Golden Threshold

- Part Two ends on a 19-by-36 bridge at dusk, with orange sunlight and darker ambient light. Four alternating sandbag lines force detours between the stone parapets.
- Beyond the gate, a PixelLab-generated Victorian skyline shows slate rooftops, chimneys, cathedral spires and a distant clocktower in sunset colors. The transparent, nearest-filtered backdrop in [assets/tiles/Golden_Bridge/victorian_city.png](assets/tiles/Golden_Bridge/victorian_city.png) is decorative and sits outside the playable map; it does not change movement, targeting or the gate objective.
- Stone waterfront embankments on both sides of the gate cover the gap between the skyline and water, with drainage arches, amber gas lamps and low sunset mist. Their pixel-art strip is [assets/tiles/Golden_Bridge/city_embankment.png](assets/tiles/Golden_Bridge/city_embankment.png); like the skyline, these meshes are scenery only and leave the bridge approach clear.
- The gate map's camera stops at the gate's northern row and limits sideways panning whenever the skyline is visible. Limits account for the viewport width; ultrawide views tighten the field of view rather than exposing the scenery's edges. Cursor movement and unit targeting remain unrestricted, and other chapters keep their normal camera.
- After Preparations, **The Golden Threshold** opening lore card introduces Aurelan's blockade and the uneasy watch on the gate, followed by the bridge objective. This story popup appears even with tutorials disabled; continuing a saved battle does not replay it.
- The **Golden Order** fields 20 guard-mode defenders: Cavaliers, Knights, Mages, three Soldiers and three Archers, led by **Captain Aurelan**, a Paladin carrying a Javelin. The first detour pairs a Javelin soldier with a bowman behind the barricade; the next bend mirrors the soldier/archer trap. A third soldier backs a knight, and the final archer supports the gate's Blaze mage. Their movement-plus-attack ranges overlap at the detours, so pulling one defender can expose the same unit to another. The six added infantry cannot attack the party's starting tiles on the first enemy phase. Soldiers and archers are weaker than the elite knights; archers have range 2 and cannot counter adjacent attacks. All bridge Mages use their Fire spellbook at range 1-2, with the last casting **Blaze**. All human defenders use guard AI, not stationary or unrestricted pursuit.
- Aurelan drops an **Orders Emblem**. His defeat immediately commits the second encounter to the save; after the reward notifications, a short silence gives way to a rumble and camera tremor, then a shrieking roar before the **Blood Beast** jumps down from the gatehouse, fitted between the bridge edges. Its foundation uses the same stone paving as the bridge while remaining blocked outside the gate tile. A dark arch and hidden rear floor prevent the back tiles showing through. Its white vestments and high cleric's insignia hint at a Healing Church connection without revealing its identity. This story event still appears with tutorial popups disabled.
- When the Beast fight begins, four **Carrion Ravens** fly in over the water (two on each side). Three more waves of two arrive at +2, +4 and +6 turns, one per side, for **ten ravens total**. They are fast, fragile melee beak attackers with eight movement, flying over water, sandbags and parapets. Buildings/city walls, occupied tiles and map bounds still constrain them. Flying units take triple effective weapon might from all bows and wind magic, but not Fire. The schedule and raven positions persist in saves; Restart resets the waves. Ravens are not required kills for the gate objective.
- The beast is stationary on the gate, with 150 HP and powerful range 1-2 talons. Defeat it, then move **Maria** onto the marked gate tile to win and view the Part Two ending. Other defenders may survive. Maria's death ends the chapter. The gate tile is reserved before the beast arrives, preventing an early seizure or an overlapping spawn.
- Recruited Linus carries forward with your party; an unrecruited Linus is not automatically added to the Chapter 10 roster.
- Encounter state, remaining enemies, damage and rewards survive Continue and numbered saves. Restart resets both bosses and the encounter to the chapter's starting state; restoring a defeated beast never spawns another.
- Sandbags and the gatehouse are PixelLab assets in [assets/tiles/Golden_Bridge](assets/tiles/Golden_Bridge): sandbags `197102a4-f33c-4ebe-abd6-31e69539371c`, gatehouse `d7c14c97-6c18-40b7-bdaf-70ee615ecf95`. Sandbags have matching blocked-tile previews in the editor; imported gate maps preserve their encounter metadata on export.
- Chapter data: [data/levels/map_10_golden_threshold.json](data/levels/map_10_golden_threshold.json). Use `?chapter=10` for a fresh battle or `?chapter=10&save=1` to carry your current party and Insight forward. These shortcuts overwrite the autosave; use a separate browser origin for disposable tests. `npm test` includes map connectivity, enemy ranges, gate conditions and save-state regressions.

## Chapter 11 - The Quarantine Ward (Part Three)

- All seven existing chest rewards are consolidated into the two empty locked cells beside the start: four in the northern cell and three in the southern cell. Rictor's starting doorway uses a straight-on open iron-barred jail frame instead of the mansion door art. Door mechanics, prisoners and rewards are unchanged. Existing saves retain embedded chest coordinates; start Chapter 11 fresh for the new placements. The doorway art updates on reload.
- Ward terrain and the open cell frame draw before characters; the frame does not write depth, so it cannot cover units passing through the doorway.

- Part Three follows Maria's husband **Rictor**, jailed beneath Aldermere's infirmary for refusing to hunt possibly infected citizens. The forced **The Quarantine Ward** lore card explains that he got the Blood Emblem from a Healing Church minister and gave it to Maria before he was taken. The thief **Lena** breaks him out.
- **Rictor** is an infantry Oathkeeper (Spear, 5 movement) who promotes to a mounted **Templar** (Spear + Light; effective against undead, cavalry type, 8 movement). Promotion grants +3 movement; anti-cavalry weapons are effective against Templars. His personal **Vigil Lance** can only be wielded by him and evolves into Longinus with Insight. Older saves that call him a Soldier restore him as an Oathkeeper; older foot-Templar saves gain the mount and a minimum of 8 movement without repeating other promotion bonuses. Generic Soldiers instead promote to **Halberdier** (Spear). **Lena** is a Thief with an Iron Katana who promotes to **Assassin** (Sword + Bow, +15 Crit).
- Rictor's armored blue-haired foot artwork in [assets/character/Rictor_Templar/](assets/character/Rictor_Templar/) now serves as his basic Oathkeeper sprite. His regal silver-and-gold mounted promotion uses [assets/character/Rictor_Mounted_Templar/](assets/character/Rictor_Mounted_Templar/), with a deep blue cape and barded dark horse. Both have eight-direction rotations, movement and lance attacks; the mounted Templar also has eight-direction light casting. The Vigil Lance icon uses scuffed steel, worn wood and blue binding. Earlier sprite sets are retained but no longer loaded.
- Maria's party sits out this chapter but keeps its levels, inventories and Leadership. The convoy and Insight pool are shared. Leadership and Blood Emblem upgrades only affect Maria's party.
- **Cells:** iron-barred cell doors block their tiles. Next to a door, Lena chooses **Pick Lock** (free); anyone else uses **Unlock Cell** and spends a Chest Key. Lena also opens treasure chests without a key.
- **Chest rewards:** the Jailer's Box now contains a Pocketwatch (one use, permanently +2 Strength) instead of a Chest Key. The other rewards remain a Light tome, Bloodroot Tonic, Javelin, Alpha Fang, Potion and the Evidence Box's Pocketwatch. Enemy Chest Key drops remain available for Rictor to unlock cells. Existing embedded saves retain their original chest rewards; fresh starts use the updated table.
- **Disguised prisoners:** some cells hold hunched villager silhouettes. Opening those doors reveals guard-mode **Undead Prisoners**: slow, with high HP and Strength, attacking with Grave Nails claws.
- **Steal:** next to an enemy carrying an item, Lena can **Steal** it without combat if her Speed is higher than the target's. Stealing uses her action and removes only the selected item; a stolen death drop loses its marker. Separately carried steal-only items never drop on defeat.
- All Ward Soldiers, Ward Knights and the boss **Warden Halvard** (Knight) are in guard mode. Halvard holds the east stairs and drops a Steel Lance.
- Win by moving both **Rictor and Lena** onto the marked east stairs. If either falls, the game is over. Opened cells, revealed undead and stolen items persist in saves; Restart re-locks every cell.
- Chapter data: [data/levels/map_11_ward.json](data/levels/map_11_ward.json). Use `?chapter=11` (or `?chapter=11&save=1` to carry the shared convoy and Insight).

## Chapter 12 - The House of Mercy

- Dark, worn green-and-grey floor tiles, raised stone walls and generated front/side doorway sprites distinguish rooms from passages. Furniture faces straight forward instead of diagonally. Elise and Mara wait in the distant west and east recovery wards, with guard-mode undead near their beds; reaching them requires leaving the central defense. Named rescue signs disappear on evacuation, but beds remain. Both isolation controls are accessible from the central hall, and open door art is replaced on sealing. There are no treasure chests; the roaming western undead at `(2,11)` drops a Chest Key. Patient rescues still reward healing supplies. The defended service doorway is at `(12,14)` (zero-based), with a single door sprite; duplicate evacuation doorway props in older saves are not rendered over it. Camera panning and enemy-follow remain within the interior, including ultrawide screens; other chapters retain their cameras. Existing embedded saves retain their original layout and objective coordinates; start Chapter 12 fresh to use the revised room layout and loot.
- Rictor and Lena reach the infirmary's main floor and meet **Arlan**, a level-11 Knight. His supplied Knight and General sprites are animated; he starts with a **Ridersbane**, Iron Spear and Potion. Ridersbane is effective against cavalry.
- Hold the marked service door for **eight completed enemy phases**. Any enemy reaching the door loses the chapter immediately. Clearing the map does not win early; killing the Rotten, recovering evidence and rescuing patients are optional. Rictor and Lena must survive.
- Two narrow isolation approaches suit Arlan's defense, while the carriage entrance admits mounted Church enforcers. Undead attack reachable allies; otherwise they advance toward the service door or the first defender blocking that route. The **Rotten** arrives on turn six with range 1-2 blighted tendrils.
- **Ward Objective**, available adjacent to a control, patient or ledger, opens a choice of nearby interactions. Each uses the unit's action and can award EXP only once: gate seals **45 EXP**, patient rescues **30 EXP**, the Treatment Ledger **60 EXP + 5 Insight**. Recovering the records displays the Church's nonconsensual crimson-extract trials, the reanimated patients, and the missing emblem's stabilizing role; rewards are saved before the lore popup. Patients provide healing consumables. Lena seals gates without a key; other units consume a Chest Key. Occupied gate tiles must be cleared first.
- Sealing an isolation gate blocks its passage and cancels that entrance's future waves. Options > Objective shows warnings one turn ahead. Occupied entrance tiles queue arrivals until clear, never teleporting enemies behind your defenders.
- Every living **deployed** ally gains **100 EXP** once at completion. With shared combat and objectives, the intended pace is about two to three levels, keeping level-20 promotions as the goal for Chapters 13-15. Optional boss EXP can accelerate this; distributing kills and objectives avoids giving all growth to Arlan.
- Progress, sealed gates, rescued patients, evidence and wave queues persist in saves. Restart restores the chapter-start party and clears all defense/objective progress. Maria's reserve party, shared convoy and Insight are retained for later reunion.
- Pixel-art infirmary furnishings and chapter rules live in [assets/tiles/Infirmary](assets/tiles/Infirmary) and [data/levels/map_12_infirmary.json](data/levels/map_12_infirmary.json). The opening and ending are in [data/tutorials/chapter-12.json](data/tutorials/chapter-12.json). Use `?chapter=12` for a fresh playtest, or `?chapter=12&save=1` to carry the current autosave's party; use a separate browser origin to protect existing saves.
- PixelLab wall-face and stone-cap textures follow the cutaway partitions. Doorways follow horizontal/vertical wall runs, including the central ward's one-sided jambs; east-side doors are mirrored. Sealed isolation doors retain their open doorway's orientation and footprint.
- Battle objectives, progress, Insight and reinforcement warnings are available under **Options > Objective**, rather than covering the battlefield. Chapter 12's camera allows a four-tile border around the interior so edge spawn tiles are fully visible when followed, while keeping panning bounded.
- A decorative cobblestone street border and dark town houses surround the ward, filling the expanded camera view. Exterior scenery is not playable terrain and does not block or alter the undead entrances.

## Chapter 13 - The Procession of Ash

- Troy joins Rictor, Lena and Arlan at the southern junction as a level-13 **Cavalier**, carrying **Steel Sword, Steel Lance, Javelin and Potion**. His supplied lance/sword sprites also support his Paladin promotion.
- Chapter 13 grants no automatic starting Potions; carried supplies and the Apothecary reward remain available.
- Advance through dense, grid-aligned city streets toward the Cathedral. Undead occupy the side streets while Church knights, cavaliers and archers defend the northern approaches. **Marshal Veyr**, a stationary Church Paladin with a Silver Lance, guards the gatehouse and drops an **Orders Emblem**.
- Win by moving living **Rictor** onto the gate controls after Veyr falls. Other enemies, houses and recruitment are optional; Rictor and Lena must survive.
- Protect **Eveline**, the level-13 mounted **Troubadour** in the east street. Her HP is real and always visible before recruitment; undead can attack her, and she uses a Potion when injured. Move Rictor adjacent and choose **Talk** to recruit, consuming his action without restoring her HP. She carries a Heal staff, gains normal healing EXP and promotes at level 20 to **Valkyrie**, gaining Anima access alongside Staves. Losing her does not lose the chapter.
- Visit three south-facing houses: the Coachman gives an **Axereaver**, the Bellkeeper an armor-effective **Armorslayer**, and the Apothecary two Potions. Each also provides information about the Church and Cathedral.
- Lena can steal a separate **Orders Emblem** from the undead attendant. Inspection explicitly distinguishes steal-only items from death drops; each transfers once, with overflow going to the shared convoy.
- A western quarantine wave is announced before turn six. Occupied arrival tiles queue enemies rather than relocating them behind your party. **Options > Objective** contains the requirements and wave status, leaving the battlefield clear.
- Three additional mobile undead pressure the middle streets and market alleys. A level-15 Rotten guards the Bellkeeper approach, and a second replaces one undead in the warned turn-six wave. Their slow movement and range-1-2 tendrils create staggered pressure without increasing Eveline's initial rescue attackers.
- PixelLab-generated Gothic row houses, shuttered shops and a standalone clocktower occupy blocked building plots, replacing the rectangular skyline image. Two-tile market alleys, narrow cross streets and curb lamps frame the four-tile avenue. Camera-aligned house sprites remain visually upright without diagonal perspective skew, including visitable and exterior houses. Facades stay anchored to their south-facing footprints, leaving doors and mounted units visible.
- Chapter 13 homes, shuttered shops and the Apothecary now use complete PixelLab building sprites with integrated roofs, walls, windows and centered doors, matching Chapter 1's straight-on, warm, detailed prop style. The scenic border uses the upgraded shops too. Door tiles, house rewards, footprints and the clocktower are unchanged; reload to apply the art to existing saves. These chapter-specific assets do not replace Chapter 12's background buildings.
- Camera panning is bounded while keeping every walkable edge tile visible. Neutral HP, remaining Potion uses, recruitment/loss, house visits, stolen items and wave progress persist in saves. Restart resets chapter progress and restores the chapter-start party; Maria's reserve party, convoy and Insight remain intact. Existing saves retain their embedded map layout; start a fresh Chapter 13 to see the revised streets without modifying your saves.
- Content: [data/levels/map_13_procession.json](data/levels/map_13_procession.json), [data/tutorials/chapter-13.json](data/tutorials/chapter-13.json) and [Chapter 13 design](docs/chapter-13-design.md). Use `?chapter=13` on a separate browser origin for fresh playtests; `?chapter=13&save=1` carries the origin's current party.

## Chapter 14 - The Silent Courtyard

- The courtyard sits on a four-unit-high scenic stone terrace above the city. A broad southern staircase descends to lower streets, with complete Gothic shop sprites around the outskirts instead of a flat paving surround. A complete PixelLab cathedral rises behind the existing northern entrance. Elevation is scenic: playable tile heights, routes, deployment, objectives and reinforcement entrances are unchanged, including in existing saves.

- Rose-bush planters use complete, straight-on PixelLab art with level horizontal stone bases, matching Chapter 1's prop orientation. Their width is increased from 0.65 to 0.92 tiles for fuller gardens, while remaining inside the existing blocked hedge tiles. Garden layout, routes and other courtyard art are unchanged; reload applies the visuals to existing saves.

- An intact 26×30 Cathedral courtyard with PixelLab-generated textured paving, engraved aisle borders, formal lawns and flowerbeds, leafy hedges, 24 topiary planters, textured stone walls, a dry fountain and northern doors. Rictor, Lena, Arlan and Troy deploy south; Eveline joins only if previously recruited. No houses, civilians, rescues, treasure or automatic supplies.
- **Defeat General Severin** is the sole victory condition. Six aggressive cavaliers, five defensive knights, four central-lane mages, two central Inferno Sages and two stationary staff priests defend the approach. The outer garden walks permit flanking their overlapping magic. Eveline alone can Talk to Corvis at `(5,17)`; recruitment preserves his condition and is not required to win.
- Crossing the fountain midpoint warns one next-turn cavalry wave; reaching the upper courtyard warns the final raven wave. Marked, occupied arrivals queue without relocation, and the player phase precedes their first attacks. Camera panning remains bounded with the street camera padding, without Chapter 13's street rules.
- Content: [map](data/levels/map_14_courtyard.json), [story](data/tutorials/chapter-14.json), [design](docs/chapter-14-design.md). Fresh playtest: `?chapter=14` on a separate origin.

## Chapter 15 - Beneath the Sacred Blood

- The Bishop's Throne and four archive cabinets on the central walls use straight-on PixelLab sprites with level horizontal bases and Chapter 1's fixed object pitch, replacing diagonal artwork. The throne matches the bishop's 0.85-unit visible height and fits entirely within its single terrain tile. Wall terrain, throne bonuses and unit depth layering are unchanged; reload applies the visuals to existing saves.

- Part Three ends in one continuous 26x36 Cathedral battle: empty nave, sealed archive galleries and a pristine high sanctuary. Twin stairs actually raise terrain, units, cursor and chests between three tiers; stairs cost two movement points. There is no healing or refill between tiers.
- Twenty-eight defenders include eight Sages, two four-cast Bolting Sages (range 3-10), eight Generals, three initial Paladins, two Reliquary Priests carrying Physic (heals 18 + Magic from Magic/2 tiles away), and Bishop Aurel Voss. Their long-range fields overlap across the gallery, so their limited casts are the pressure valve; neither can reach the opening deployment. Five additional Paladins arrive in two finite advance-triggered waves, warned one turn before their first possible attacks. Occupied arrival tiles queue without relocation.
- **Defeat Voss** is the sole objective; Rictor must survive. Voss holds the Bishop's Throne (+3 Defense, +20 Avoid, restores 5 HP at the start of each enemy phase; any unit standing on it gets the same benefit during its own phase). Essential Church/Order revelations trigger on progress rather than chest collection or optional recruits. Eveline and Corvis add dialogue only if carried alive. The Bishop knowingly continued scourge-causing treatments, the Church summoned the Order, and senior Order command protected secret research. Stopping Voss does not cure the afflicted; a transferred shipment and the clocktower bell lead onward.
- Five optional chests before the sanctuary contain **Steel Axe (E)**, **Killer Bow (D, 30 Crit)**, **Killing Edge (D, 30 Crit)** and two **Orders Emblems**. A newly promoted General can use the axe; Assassin Lena's promotion grants the bow's required D rank.
- Twenty-two PixelLab interior assets provide marble, checker flooring, embroidered carpet, stair treads, carved walls, oak pews, ribbed pillars, gallery mosaics, balustrades, stained glass, candles, paired Church/Order banners, sealed treatment records and the blood reliquary altar. Enemy spell/staff uses, chests, story progress and warning timing persist through saves; restart clears chapter progress.
- Content: [map](data/levels/map_15_cathedral.json), [story](data/tutorials/chapter-15.json). Fresh playtest: `?chapter=15` on a separate browser origin; `?chapter=15&save=1` carries that origin's current party. Existing user saves are not migrated or restarted automatically.

## Chapter 16 - The Delivery Bell (Part Four)

- Part Four opens in the 38x34 Delivery Yard behind the Cathedral. Maria's party (west) and Rictor's party (east) start split by canals; up to 12 units deploy, and units never recruited (or lost) stay off the field. Maria and Rictor must both survive.
- **Objective:** defeat Archdeacon Halloran, the Lift-Keeper (a Bishop on the lift with Aureole and a heal staff), then move both Maria and Rictor onto the Bell Lift.
- **Treatment Wagons** are passive armored carts (Armorslayer is effective) that roll 4 tiles along the rails toward the lift every enemy phase. Any unit on the rails blocks them. Breaking one releases a Lv22 Freight Yard Undead; each wagon that reaches the lift counts as escaped (shown in the objective and the ending). Two more wagons leave the depot sidings on turn 4 unless a unit is standing on the siding.
- Combatants and raven reinforcements are levels 22-24. Every human defender is promoted: four Freight Guard Halberdiers use Generic Halberdier directional idle, walking and attack sprites at `(9,20)`, `(12,13)`, `(26,28)` and `(22,13)`; the remaining base knights, mages and priests become Generals, Sages and Bishops. Chapter-specific Freight Yard Undead start with 49 HP, 21 Strength, 9 Dexterity, 5 Speed, 8 Defense, 3 Resistance and 3 movement, including wagon cargo, with stronger level-23 variants. The western Sage at `(4,19)` still wields and drops a Wind Tome. Enemies at `(10,29)`, `(6,22)` and `(12,13)` still drop one Chest Key each, supplying all three western chests without a thief. Coordinates are zero-based. Existing saves embed their original enemy placements and HP: import the regenerated test save or start Chapter 16 fresh for the complete rebalance; restarting an older save alone does not update its map.
- Regular yard stats use existing archetype sheets plus `round(growthRate * gainedLevels / 100)` and the existing promotion bonuses when needed, rather than uniform accuracy floors. Seeds are Cathedral General/Paladin, Church Sage (including Bolting), Golden Order Soldier (Halberdier), Reliquary Priest (Bishop), Church Warden, Bartz (Berserker), Undead Prisoner, Rotten and Carrion Raven; each uses its yard profile's growth rates. Nonboss Dexterity is 9-19 at profile level. Generals stay slow and armored, Sages magically strong, ravens fast and fragile, and undead slow and inaccurate. Halloran retains his elite boss sheet; the central Rotten uses grown stats with a boss-only 40 Dexterity exception. Bishops retain healing/Physic or finite Freeze support, and Bolting retains its four shots. Earlier chapters and the global combat formulas are unchanged. The central Rotten retains its boss reward while rear-wave Rotten remain nonboss. Two generic Berserkers guard the approaches. On turns **4 and 7**, a Berserker and a nonboss Discarded Rotten enter at each southern gate, at the start of the player phase. The intro and turn-2 bell warn of these finite waves. Blocked entrances queue enemies rather than relocating them. Additional Rotten do not grant boss Insight, preserving the 115-Insight campaign maximum. Allied sprites render after the yard's building-depth reset, like enemies, preventing warehouse faces from clipping foreground units.
- When Maria and Rictor are adjacent, **Talk** reunites the parties: both are fully healed and the party gains 5 Insight. The bell rings on turn 2; the Lift-Keeper speaks when anyone reaches the northern quay. Ravens arrive in pairs on turns 3, 6, 9 and 12. All five chests are **north of the canal**: four Orders Emblems and a **Killer Axe** (D-rank, 30 Crit) in the far eastern chest. The campaign offers **12 Orders Emblems through Chapter 16**: one each in Chapters 4, 5, 7 and 10; two in Chapter 13 (one steal-only); two in Chapter 15; four in Chapter 16. Optional rewards must be collected; they are not automatically granted to older saves.
- All tiles and props (cobbles, rails, canals, bridges, warehouses, crates, gas lamps, cranes, lock gates, winch and the lift headframe) plus the Treatment Wagon, oxblood Lift-Keeper, eight-direction generic Berserker (idle, walking and attacking) and Killer Axe icon are PixelLab art. Wagon, reunion and story state persist through saves; restart clears them.
- Yard object art uses Chapter 1's wooden crate as its style/orientation reference: straight-on faces, level horizontal edges, warm textured wood and crisp pixel outlines rather than isometric diagonals. Crates/barrels, winch, canal gates, crane, complete warehouses, lamps, bell headframe and a chapter-local clocktower use the same fixed camera pitch as the ship props. Each warehouse footprint uses one complete PixelLab building sprite with its roof, walls, windows and modest freight door integrated into the artwork, replacing textured boxes and separate oversized gate fronts. Transparent borders are cropped without resampling; gameplay and other chapters' clocktower art are unchanged. Reloading applies these visual updates to existing saves.
- Future building structures should likewise use complete PixelLab-generated building sprites in this straight-on style, rather than assembling textured boxes with separate facade or gate overlays.
- The central building near `(18,18)`, stored as legacy `bell_tower` terrain, also uses the complete warehouse sprite; its blocked footprint and the separate northern clocktower landmark are unchanged.
- Content: [map](data/levels/map_16_bell_yard.json), [story](data/tutorials/chapter-16.json), [rules](src/game/bell-yard.js). Fresh playtest: `?chapter=16` on a separate browser origin.

## Create and load maps

Open `/map-editor.html` while the development server is running to create a map. Paint directly with the oblique ship atlas; choose **Start** and **Exit** markers, select **Kill all enemies** or **Escape**, resize the grid, import a level, or restore the two-ship template. Stairs grant +10 Avoid; ship props that block movement cannot be placed on Start or Exit.

- **Export JSON** downloads a level file you can keep with the project.
- **Play map** immediately tests the current editor map.
- In the game, **Import level** loads an exported JSON map without restarting.

The first level is `data/levels/map_01_two_ships.json`, with a **Kill all enemies** objective and boss Bartz guarding the Exit. Level files store their name, objective, dimensions, atlas tile IDs, spawn and exit coordinates, and ship props. Older character-grid level files can still be imported; levels without an objective default to **Kill all enemies**.

## Character and weapon data

Character profiles live in `data/characters/` and store base stats, current stats, growth rates (percentages), level, experience, and an equipped weapon ID. Weapon data lives in `data/weapons/` and includes might, weight, hit, critical, and range. Consumable data lives in `data/items/`; playable level data lives in `data/levels/`. Animation metadata is stored in `data/character-assets/`, while sprite images and other visual files remain in `assets/`. Maria starts at level 1 with 0 EXP, matching base/current stats, an Iron Katana, a Rapier, and a three-use Potion; her HP, inventory uses, and equipped weapon are tracked by the battle state and save.

Combat uses strength + weapon might − the defender's defense for physical weapons (magic and resistance for magical weapons). Attack speed is speed − max(0, weapon weight − build): build only cancels out weapon weight and never raises attack speed above speed. A unit doubles when its attack speed is at least 4 higher than its opponent's.

Physical reavers reverse **both** triangle matchups and double their damage, Hit and Avoid modifiers, not total attack damage. Axereaver (lance) gains double advantage against axes and double disadvantage against swords; Lancereaver (sword) gains double advantage against lances and double disadvantage against axes. Same-type ordinary weapons, bows, guns and magic remain neutral. Two opposing reavers cancel the reversal and use the ordinary triangle.

The drowned civilization's four **ancient relics** are reliable rank-B physical weapons with unlimited uses, zero weapon Crit and no special effects. They are not a silver equipment set; killer weapons retain their 30-Crit niche. Bows retain the ordinary flying weakness matchup.

| Relic (item ID) | Type | Mt | Wt | Hit | Range |
| --- | --- | ---: | ---: | ---: | --- |
| Starless Edge (`starless-edge`) | Sword | 13 | 8 | 85 | 1 |
| Tidepiercer (`tidepiercer`) | Spear | 14 | 10 | 80 | 1 |
| Keelbreaker (`keelbreaker`) | Axe | 16 | 12 | 75 | 1 |
| Horizon String (`horizon-string`) | Bow | 12 | 8 | 85 | 2 |

These relics and Evelynn (`evelynn`) have custom 64×64 PixelLab-generated inventory icons in `assets/weapons/Ancient_Relics/`; class weapon access, rank checks, inventory, convoy, and equipment menus use their normal shared mechanisms.

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
