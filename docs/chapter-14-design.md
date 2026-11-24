# Chapter 14 - The Silent Courtyard

The [story bible](story-bible.md) governs this chapter: the city burns while the institution protects its immaculate ceremonial approach. A dry fountain, untouched flowers, military healers and an expected bell delivery carry the implication. No speech or optional item explains the scourge or takes Chapter 15's revelations.

**Defeat General Severin** is the sole victory condition. Recruitment, theft, supply chests and the Envoy are optional. Victory ends the battle immediately, so finish desired side objectives first.

## Whole-map layout

- 26 by 30 cells, each 48 pixels in the single 1248 by 1440 [courtyard illustration](../assets/maps/village/courtyard-redrawn.png), selected by `villageScene.artwork: "redrawn"`. A cohesive whole-map redraw replaces the accumulated regional patches while preserving the approved composition and finalized collision. Cathedral masonry, blue slate roofs, gardens, paving and burning town share one detailed style and lighting treatment. The image is uniformly fitted, never stretched in regional bands. Collision-constrained native paving gradients clear foreground spill, and trimmed hedge ends receive inset stone coping. The full 48px footprint of every walkable tile is checked for foliage and rooftops. Chests remain live sprites, not painted rewards. No encounter data changes with this visual revision.
- The same continuous textured mesh lifts only inaccessible Cathedral rows `0..3` to a height of 5.6 world units. The row-4 threshold and every gameplay cell remain at their original coordinates, with no detached building overlay or 3D box. Eight scenery-only camera-framing units allow northward panning to reveal the raised facade; they do not add tactical tiles. The editor retains the flat source grid for exact collision authoring.
- Rictor `(12,24)`, Lena `(11,24)`, Arlan `(13,24)` and Troy `(14,24)` deploy inside the south gate. Other living carried allies, including Serra and previously recruited Eveline, use the normal party/deployment system. No free recruits or automatic supplies.
- Cathedral scenery fills northern rows `0..4`; Severin waits at `(12,5)`, centered below the one-cell Cathedral steps. The southern arch and staircase form a one-cell lane in column `12`, rows `25..29`; the surrounding lower city is blocked scenery.
- The western Sage stands on the paved garden crosswalk at `(7,12)`, not inside its enclosed flowers. Corvis's garden opens south at `(5,15)`. The eastern delivery court opens south at `(20,14)` and east at `(22,11)`. Columns `17..23` connect across rows `15..16`, giving access to the eastern perimeter corridor at column `23`, rows `6..16`. The east gateway provides a second approach if the southern doorway is occupied. Column 17 and the outer corridor bypass the court-bound guards safely. Each opening is one cell (48 pixels) across its direction of passage.
- Western crosswalks on rows `9`, `12` and `16` connect columns `2..8`. The northwestern garden has a usable entrance at `(3,8)` and inner ground at `(3,7)`. Lower passages use columns `4..5` in the west and `20..21` in the east, rows `17..22`, with connections across rows `19` and `22`. These are real movement routes, not blocked painted gaps.
- The blocked dry fountain, including its whole rim, occupies `x=11..14, z=11..13`. A continuous **one-cell-wide loop** follows columns `10` and `15`, rows `10..14`, joined across rows `10` and `14`. Each side has a full 48px paved standing footprint and connects to the broader road network. Outer walks also reconnect around the raised garden walls. After the opening screen is defeated, `x=11..14, z=16..17` provides regrouping space, not automatic healing.
- Two full-width paved hedge crossings at zero-based `(9,12)` and `(16,12)` (displayed as `(10,13)` and `(17,13)`) join the western/eastern side lanes directly to the fountain loop. Neighboring hedge cells remain blocked.
- Paving has no cover bonus. Corvis's cleared inner garden ground gives +10 Avoid and +1 Defense. Enclosed flowers, hedges, crates, statues, perimeter walls, the Cathedral and fountain are blocked, including for flyers.

## Three stages of pressure

1. **Opening screen:** two level-18 mobile Cavaliers at `(9,16)` and `(17,16)`, a guard Knight at `(12,18)` and a guard Mage at `(13,16)`. The Mage moved one tile north so its new movement-plus-attack range does not reach deployment. No initial defender can reach a starting party tile with its real movement plus weapon/staff range.
2. **Fountain and side routes:** reserve level-20 Cavaliers at `(8,8)` and `(17,8)` initially guard. They advance together when a living ally reaches `z <= 14`, either rider is attacked/damaged/lost, or either can actually engage. Western theft and recruitment split attention without requiring both.
3. **Northern guard:** offset Knights, guard-mode Inferno Sages and Mages, and stationary staff support defend multiple approaches. Guard casters hold against distant targets, then move and attack when someone enters their movement-plus-weapon range. Severin can be attacked from the west, east and south without a forced one-tile duel. Remove or isolate the adjacent healer.

There are four initial Cavaliers, five Knights, two Mages, two Sages, two stationary priests, Corvis and Severin. This replaces the old overlapping six-Cavalier/four-Mage opening rather than adding optional enemies on top of it.

The Freeze priest stays level 16 at `(9,5)` with Magic 5 and five-tile reach. The Sage theft approach `(8,12)` lies outside Freeze. The healer at `(13,5)` heals adjacent injured defenders. Staff theft preserves remaining uses and removes the actual casting entry.

Severin remains stationary but carries **Spear**, **Silver Axe** and **Silver Lance**. Spear has 12 Might, 12 Weight, 85 Hit and range 1-2, versus Javelin's 7/8/70 at the same range. Silver Axe has 14 Might, 14 Weight, 70 Hit and range 1. On his turn he selects the usable weapon with the most total noncritical damage against his chosen target, including triangle, defenses, effectiveness and doubling; Hit breaks ties. At range 2 he must use Spear. Threat tiles include every carried weapon. He keeps his selected weapon for counters, and it survives saves. His fixed drop is Spear, even if he dies holding the axe. Existing embedded maps keep their authored drop; Restart Chapter adopts the new drop.

Wind, Gale and Tempest use the existing flying effectiveness: **triple weapon Might**, not triple total damage, against flying enemies including Ravens and the Envoy. Weapon rank UI calls the weapon family **Lance**; the internal `Spear` key remains compatible with existing saves and class rules.

## Optional objectives and rewards

| Objective | Location / condition | Reward |
| --- | --- | --- |
| Defeat Severin | `(12,5)`; ends chapter | Spear through the normal boss-drop flow, regardless of his currently equipped weapon |
| Defeat opening Mage | `(13,16)`, guard | Wind tome |
| Steal from western Sage | Initially `(7,12)`, guard Inferno; Lena must be faster and adjacent | Giant's Marrow, permanent +2 Strength; **not** a death drop |
| Recruit Corvis | `(5,14)`; only living adjacent Eveline can Talk with an action available | Corvis retains current HP and tome uses; no free heal |
| Open Consecrated Supply Chest | `(20,9)` in eastern court; Lockpick or Chest Key | Light tome (holy Light magic, effective against undead) |
| Open Officer's Supply Chest | `(21,11)` in eastern court; Lockpick or Chest Key | Orders Emblem (`master-emblem`) |
| Defeat Bell Envoy | Optional eastern delivery court after the bell | Covenant Emblem and **5 Insight immediately on defeat**, no Read action |

Both chests use the normal one-time chest flow. Lena can pick either lock without a key; other units consume a Chest Key. Full inventories send rewards to the convoy. Opened states survive saves, and restarting restores the authored unopened chests. Escort arrival tiles are distinct from the treasure.

Earlier embedded saves may still contain the Sealed Transit Tag: it remains readable once for its original lore and 10 Insight. The revised encounter no longer drops it. Reward and Insight state are saved before notifications, using the normal enemy-death flow.

The Bell Envoy has its own feral crow-beast sprites: wings, bare clawed hands and taloned feet, no clothing or held weapon. Its Covenant Envoy class uses physical **Claws**, with the previous Steel Sword's combat values (8 Might, 8 Weight, 80 Hit, 0 Crit, range 1). The Envoy is **stationary** at `(20,12)` and attacks adjacent targets; it has no Maria-hunting behavior or boss flag. Its explicit 5-Insight reward does not change ordinary boss rewards. **Six mobile Ravens in three pairs** pursue freely beyond the delivery court: one pair arrives with the Envoy, two more pairs are scheduled two and four turns after its actual appearance. The finite schedule continues if the Envoy is defeated. Crate-lined margins remain blocked; arrivals stand on clear central paving.

The revised **battle** design follows the approved lost-humanity concept: a rough, gaunt human torso and elongated bare arms beneath a vicious crow's head, a small bloodshot eye and ragged dragging wings. A nine-frame uneven-breathing/head-twitch idle, thirteen-frame feral claw rake and seventeen-frame mindless frenzy replace the rounded bird-body animation. Native generated pixels are padded and translated, never resampled; feet stay grounded and the entire silhouette clears the battle HUD. The Omen is a more advanced, purposeful transformation that retains some humanity and a mission, not this mindless creature. His existing greatsword art, pursuit, stats and drops are unchanged. This revision is battle-art-only; existing map sprites remain, and reloading applies the new battle art without restarting the chapter.

## Finite, warned arrivals

| Trigger | First living ally reaches | Delay | Exact arrivals |
| --- | --- | --- | --- |
| `courtyard-cavalry` | `z <= 13` | 2 turns | Three level-20 Cavaliers at `(12,29)`, `(12,27)`, `(12,28)` |
| `courtyard-ravens` | `z <= 10` | 1 turn | Bell Envoy `(20,12)`, escort Ravens `(20,11)` and `(21,12)` |
| `courtyard-ravens-2` | Actual Envoy appearance | 2 turns | Two mobile Ravens at `(20,11)` and `(21,12)` |
| `courtyard-ravens-3` | Actual Envoy appearance | 4 turns | Final two mobile Ravens at `(20,11)` and `(21,12)` |

Warnings run at the end of the player phase. Arrivals happen before the scheduled player phase, never as immediate enemy attacks: the rear warning gives two player phases before first attacks; the bell gives one. Warnings must occur on different turns even after a fast advance. Each wave happens once. Occupied tiles queue the remaining units at their exact authored coordinates without relocation or duplication.

## Party roles

- Rictor breaches physical formations.
- Arlan uses Ridersbane against the opening and finite rear cavalry.
- Troy supports either flank and relocates after the screen breaks.
- Lena steals the Strength booster or removes exposed support.
- Serra attacks armor and gains catch-up experience.
- Eveline heals or approaches Corvis after the western guard Sage is managed.
- Corvis contributes magic and resistance if recruited.

No promotion or optional recruit is required for victory. The Covenant Emblem represents an available character-specific choice, not a forced transformation.

## Persistence, art and compatibility

`courtyard.tactics` opts the map into coordinated reserves. Its optional `ravenReinforcements` rules opt the current encounter into mobile Ravens, a planted Envoy, and two follow-up pairs anchored to the persisted actual `arrivalTurn`. Earlier tactical saves without those rules retain court-bound guards and their original waves. Formation activation, recruitment, warned turns, explicit wave delays, partial arrivals, enemy AI, staff uses, stolen items and drops survive saves. Restart clears tactical state and reloads authored Chapter 14 data while retaining the chapter-start party and supplies.

Existing embedded maps without tactics keep their old encounter and procedural scenery. Earlier illustrated saves without artwork retain their original `courtyard.png`; `artwork: "concept"`, `"aligned"`, `"repaired"`, `"depth"` and `"passage"` keep their corresponding images, geometry, collision and authored drops. Earlier passage saves retain any old blocked hedge-crossing collision; Restart Chapter adopts the cohesive redraw, new openings, guard casters and finite pursuing flock. Envoys are re-created with the new sprite/profile on Continue and award 5 Insight on defeat, including in older embedded encounters; their saved positions, HP, AI and drops remain intact. Omitted trigger delays retain the legacy one-turn schedule. Missing warning turns can be recovered as `arrival - delay` only within the saved timeline. Invalid timing and court/formation states are rejected without replacing the current save.

The [art manifest](../assets/maps/village/manifest.json) records redraw provenance, repair regions, dimensions and entrance rectangles. Tests retain previous variants' pixel registration checks and unchanged-pixel checks outside each repair's regions. The cohesive redraw additionally checks the collision fingerprint and scans every pixel of each full 48 by 48 walkable cell for foliage/rooftops, with positive controls on actual blocked hedges and city roofs. Geometry checks verify actual facade height and unchanged gameplay coordinates; camera projection checks cover portrait, square and landscape northern framing. Separate checks cover western through-routes, both treasure entrances (including an occupied south door), blocked props, chest rendering, real key/Lockpick rewards, convoy overflow, persistence, real movement/staff threat, safe recruitment, theft and queued arrivals. Game and editor share the same source artwork, nearest filtering and collision terrain. Inland city ambience replaces ocean surf.

Legacy assets in `assets/tiles/Cathedral_Courtyard` remain for old saves, including the dry fountain, Cathedral, topiary and textured procedural terrace. Priests retain their Generic Priest animation pack; Severin retains his separate General palette.

Validate:

```powershell
node --test tests\chapter-14-map.test.js tests\courtyard-mechanics.test.js
```

Fresh isolated playtest: `?chapter=14` on a separate origin. Existing saves preserve their current battle; use Restart Chapter to adopt the redesign.
