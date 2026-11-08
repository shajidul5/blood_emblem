# Chapter 14 — The Silent Courtyard

An intact, dreadful Cathedral forecourt, 26 × 30 tiles. South is the deployment edge; the Cathedral doors are north. This is a single battle, not a rescue or city-exploration chapter. **Defeat General Severin** is the sole victory condition.

## Layout

- Rictor `(12,27)`, Lena `(11,28)`, Arlan `(13,28)` and Troy `(14,27)` are the four authored placements. Eveline deploys only through the carried, previously recruited party. No automatic starting items.
- A dry fountain occupies `x=11..14, z=15..17`. Connected west/east bypasses and crosswalks link the six formal garden beds. Pale paving has no terrain bonuses; walkable lawns give +10 Avoid and +1 Defense. Clipped hedges and low limestone walls block ground movement.
- The Cathedral frontage blocks `x=10..15, z=0..2`, with the tall door facade rising into the northern scenic border (`z=-2..2`); Severin stands at `(12,4)`. Its doors are scenery, not a seize action. Upright frontage and compact fountain art do not cover neighboring walkable rows. No houses, civilians, chests or side objectives.
- Corvis, a level-17 guard Shaman, waits at `(5,17)`. Eveline alone can Talk while adjacent. Recruitment/loss does not gate victory, and recruitment preserves his HP and remaining tome uses.

## Defenders

Six mobile cavaliers (levels 18–20), five guard knights (14–16), four guard mages (18), two guard Inferno Sages (20), two stationary priests (16) and stationary Severin (20). All six spellcasters hold the central lanes: mages at `(15,20)`, `(10,13)`, `(15,9)` and `(10,5)`, Sages at `(10,8)` and `(15,11)`. Their overlapping coverage makes a direct northern rush dangerous; connected outer garden walks provide flanking approaches outside overlapping initial move-plus-attack ranges. None can attack the starting deployment, and Corvis retains a safe southern Talk approach. The western Freeze priest is `(9,6)`, behind a knight at `(9,7)`, with a five-tile staff reach. Keeping him at his base level preserves Magic 5 instead of scaling his staff reach upward. The healer at `(13,4)` can heal adjacent Severin.

Priests cast in place: Freeze targets the nearest unfrozen ally, and Heal targets the adjacent injured defender with the lowest current HP. Lena steals the actual staff inventory entry with its remaining uses, not a fresh reward copy; losing that entry removes the priest's ability to cast it.

Both priests use the supplied `Generic_Priest` rotations, Walking and Healing animations. The supplied pack lacks northwest Healing, so that direction uses its north cast. Severin uses a separate `General_Severin` palette copy of General Arlan's rotations and animations: red cloth becomes violet while armor, silhouette and transparency remain unchanged. Arlan's original sprites are untouched.

## Corvis and the dark spellbook

Corvis begins as a level-17 Shaman with HP 32, Magic 15, Defense 5, Resistance 12 and Movement 5. At level 20 he can promote to Dark Sage, gaining Staff D and using the supplied `Dark_Sage_Corvis` art. His base tome retains the `dark-tome` item ID, displayed as **Flux**. Spellbook unlocks cost 6 and then 12 Insight and still require the stated ranks.

| Spell | Rank | Might / Hit / Weight | Range | Uses | Effect |
| --- | --- | --- | --- | --- | --- |
| Flux (`dark-tome`) | E | 10 / 80 / 10 | 1–2 | 20 | Standard dark attack |
| Luna | D | 8 / 75 / 10 | 1–2 | 8 | Halves Resistance |
| Eclipse | B | 0 / 30 / 14 | 3–5 | 4 | Removes `floor(current HP / 2)`, nonlethally; cannot critical or double |

## Finite progress waves

`level.courtyard` contains `bossId`, `recruit` (`id`, `name`, `recruiterId`, `recruited`, `dead`) and two ordered `triggers` (`id`, `thresholdZ`, `warnedTurn`). Each reinforcement wave uses the matching `entranceId`, initial `turn:999`, `spawned:false`, `spawnedCount:0` and explicit `units`.

| Trigger | First living ally at | Next-turn arrivals |
| --- | --- | --- |
| `courtyard-cavalry` | `z <= 15` | Three level-20 cavaliers at `(11,29)`, `(12,29)`, `(14,29)` |
| `courtyard-ravens` | `z <= 8` | Four level-18 ravens at `(1,3)`, `(2,3)`, `(23,3)`, `(24,3)` |

Gameplay records the warning turn and schedules `turn + 1`. The two warnings occur on separate turns even if a fast unit crosses both thresholds in one turn. The player phase precedes each wave's first enemy attack. Occupied arrival tiles retain queued units at their authored coordinates; never relocate them. The final bell summons a Church envoy, and the defenders expect it. No story reveals the scourge's explanation; the Bishop remains inside for Chapter 15.

Older saves with a scheduled arrival but a missing warning recover the warning as `arrival turn - 1`, only when that warning is within the saved timeline. Other timing and wave-order validation remains enforced. Slot writes validate the current save first; successful slot loads persist normalized state in autosave, leaving the original slot intact.

## Art and camera

PixelLab-generated assets live in `assets/tiles/Cathedral_Courtyard`: dry fountain object `27e064c9-0a8b-451e-aea0-b70cd4f1ea78`, Cathedral doors object `b499e553-8e75-46d0-924a-7b0afc4d4813`, detailed 64×64 terrain group `1a645d2b-0bbb-4311-abb1-6b4af5b9d02d`, and topiary sprite job `c042b681-0cb9-4a91-9da9-b001f728e1d3`. The sixteen terrain files use the `detail_` prefix: paving, mossy paving, medallion, steps, lawn, flowering lawn, flowerbed, hedge canopy, alternate hedge canopy, hedge side, wall cap, wall side, basin, masonry, soil and aisle border, in generated tile order.

Every ground tile and every hedge/wall face uses generated art, not solid-color garden blocks. Paving variants and engraved aisle accents break up the central court. Lawn edges become flowerbeds while keeping the same walkability and cover bonuses. Twenty-four topiary planters sit entirely on blocked hedge corners; no new scenery blocks routes, covers neighboring playable cells or changes terrain rules. Existing PixelLab Cathedral street lamps provide additional details; there are no exterior houses.

Rendering exports `userData.courtyardCameraPadding` and `userData.courtyardGeometry.cameraPadding`, both using `STREET_CAMERA_PADDING`, plus scenery geometry and marked entrances. The map does **not** set `streets`, avoiding Chapter 13 house/seize rules.

Validate with `node --test tests/chapter-14-map.test.js`. Use `?chapter=14` on a separate browser origin for a fresh test, or `?chapter=14&save=1` to carry that origin's current party.
