# Chapter 13 - The Procession of Ash

Implementation specification for the playable Chapter 13. Later Cathedral/clocktower story beats remain proposals.

## Story

Rictor, Lena and Arlan leave the burning infirmary. Troy, a city-watch cavalier, meets them at the southern junction and joins immediately. His Steel Sword, Steel Lance and Javelin offer flexible combat rather than another stationary defender.

The party must open the gatehouse controlling the Cathedral approach. Church soldiers are holding the avenue while undead spill out of quarantine streets. This is an advancing chapter, not another survival chapter.

The clocktower stands in a blocked northern building plot beside the gate approach. Its illuminated face and distinctive spire are recurring landmarks, not an interactable objective here. Individual Gothic houses and shops follow the original panorama's architecture; the panorama itself is not rendered. The Cathedral remains distant: Chapter 13 opens the route, Chapter 14 can expose the Church's machinery, and the Part Three finale belongs inside the Cathedral. These later chapter beats are proposals, not implemented commitments.

## Eveline - recruitable mounted healer

**Eveline**, a Troubadour, is treating people outside a shuttered apothecary farther into the district. She rides a chestnut horse and carries a Heal staff and Potion. Mend remains an Insight-unlocked spell in the shared Heal staff spellbook, not a separate inventory item.

- Joining level: 13; movement 7; Staff rank C.
- Stats: HP 28, magic 12, dexterity 9, speed 12, luck 11, defense 5, resistance 13, build 5.
- Strong healing and resistance, fragile physical defense. No offensive weapon as a Troubadour.
- Promotes at the existing level-20 threshold to **Valkyrie**, retaining cavalry movement and gaining Anima access alongside Staves. Proposed starting Anima rank D.
- Base appearance: auburn braid, worn ivory riding clothes, muted teal cloak, medical satchel and simple silver staff. No priest robes or nun veil.
- Promotion: the same horse and recognizable colors, silver light armor, restrained barding and an ornate staff. More accomplished, not a different person.

She starts as a visible green, non-player ally with real HP. Undead can target her; she is not an invulnerable map marker. Her location, health, recruitment and death must persist in saves. She stays in her marked pocket before recruitment rather than wandering into danger; she can use her Potion when injured. After recruitment she becomes a normal controllable ally and gains healing EXP.

**Rictor recruits her with an adjacent Talk action**, consuming his action. Troy clears the approach, but cannot recruit her himself. Show this requirement in the opening and her unit information.

> Eveline: "They called it treatment. I watched the patients come back without their voices."
>
> Rictor: "Then come with us. The Cathedral will answer for what happened here."
>
> Eveline: "First, help me keep someone alive."

Her death loses recruitment, not the chapter. Warn clearly when she is attacked or lost. No secret instant-loss condition.

## Objectives and rewards

| Type | Goal | Result |
|---|---|---|
| Main | Rictor seizes the gate controls after defeating the commander | Opens the Cathedral approach |
| Recruitment | Protect Eveline and have Rictor talk to her | Mounted healer joins |
| Exploration | Visit three houses with any controllable ally | Supplies, weapon and Cathedral information |
| Theft | Lena steals an Orders Emblem from an undead attendant | Optional promotion item |
| Boss | Defeat the gate commander | Guaranteed Orders Emblem drop |

Use the existing `master-emblem` item, whose displayed name is **Orders Emblem**, for both rewards. Do not introduce a second "Order's Seal" item for the same promotion purpose. The stolen emblem is a separate copy; neither reward is required to win.

The undead attendant **carries a steal-only emblem**, not a drop. The `stealable` array represents carried items separately from `drop`; inspection says "Can be stolen". Adjacency and Lena's speed exceeding the attendant's speed are required. Transfer once, remove the carried item, use the convoy on a full inventory, and preserve the result across saves. Restart restores the chapter-start item state. Defeating this attendant without stealing does not award the emblem.

The proposed carriage rescue is deferred: protecting Eveline already provides the chapter's urgent optional objective. Avoid stacking another timed civilian task onto a four-unit party before the healer joins.

## Tight street layout

Target grid: **28 x 28**, zero-based coordinates. North is decreasing z. Building footprints and curbs are impassable. All roads connect; no isolated lane forces permanent party splitting.

See [layout diagram](chapter-13-layout.svg). Colored regions are street corridors, not exact final terrain authoring. Rectangles below are inclusive.

| Area | Coordinates | Width / function |
|---|---|---|
| Main avenue | x 12-15, z 2-26 | Four-wide advance toward the gatehouse |
| Southern junction | x 3-22, z 21-22; eastern spur at z 23 | Starting choice of market or healer route |
| Market alleys | x 3-4 and x 9-10, z 7-22 | Two-tile lanes around dense building blocks and visitable houses |
| East service street | x 20-22, z 7-23 | Three-tile mounted rescue route; x 19 opens beside Eveline |
| Middle cross street | x 3-22, z 14-15 | Reconnects market, avenue and healer pocket |
| Northern cross street | x 3-22, z 9-10 | Flanking access near the gatehouse |
| Clock court | x 5-10, z 6 | Connected frontage beneath the tower and its neighboring houses |
| Attendant service pocket | x 8-9, z 9-10 | Connected to the market; steal-only target |
| Gatehouse approach | x 12-15, z 2-4 | Commander at (13,4); seize controls at (13,2) |

Starting positions: Rictor (14,24), Lena (12,25), Arlan (13,25), Troy (17,23). Troy's tile is on the southern junction. No deployed unit is initially in enemy attack range.

Eveline waits at **(20,16)**, beside the east street. Keep her tile, all four adjacent tiles and her entire mounted sprite free of lamps, furniture and house overlays.

### Three visitable houses

All doors face south into a street. Door tiles are accessible, with two adjacent standing tiles available for visitors. Buildings are rectangular and aligned to the grid; no mirrored diagonal house sprites.

| House | Blocked footprint | Door tile | Reward / dialogue |
|---|---|---|---|
| Coachman's home | x 5-8, z 18-20 | (7,21) | Axereaver; Troy's old watch route |
| Bellkeeper's home | x 5-8, z 11-13 | (7,14) | Armorslayer; bells summon watch officers rather than worshippers |
| Apothecary | x 19-22, z 3-6 | (21,7) | Two Potions; the Church requisitioned medicine for the Cathedral |

Eveline is outside farther south, not recruited through the apothecary Visit. Every house remains useful even if she is lost. Match the apothecary's footprint to its actual art; its south-facing frontage must never float on a road tile.

### Axereaver and reaver triangle rules

The **Axereaver** is a physical lance (`Spear` weapon type), replacing the Coachman's Bloodroot Tonic reward. It reverses the normal lance triangle: **double advantage against axes**, **double disadvantage against swords**, and neutral against ordinary lances. Double means twice the existing triangle modifiers for damage, hit and avoid, not double total attack damage.

The existing **Lancereaver** follows the same two-sided rule: double advantage against lances, double disadvantage against axes, neutral against ordinary swords. Against bows, guns and magical weapons, physical reavers introduce no triangle bonus. Two opposing reavers cancel the reversal and use the ordinary triangle, keeping opposing advantages antisymmetric.

The Coachman's dialogue can explain the tradeoff: "Made for turning aside an axeman. Keep it away from a swordsman."

### Pressure and enemy placement

The harder street mix adds level-12 mobile undead at (3,12), (10,16) and (14,11). A level-15 guard-mode Rotten at (9,14) threatens the Bellkeeper approach without pursuing the starting party immediately. A second level-15 Rotten replaces the turn-six undead at (3,18); the other two arrivals remain unchanged. Both retain the existing Rotten stats (65 HP, movement 3, range 1-2), boss Insight reward and art. Veyr remains the only required defeat for seizing. The two dedicated Eveline attackers and recruitment timing are unchanged.

Provisional placements to tune during playable implementation:

- Rescue undead at (20,8) and (22,10), movement 3, approach Eveline. Their first possible melee attacks are enemy phase 3 on unobstructed paths.
- Troy reaches an adjacent rescue position in two turns at movement 7. Rictor can reach Talk adjacency in three turns at movement 5. Verify actual paths after all blockers are authored.
- Tune rescue attackers to inflict at most 8 damage per landed strike, with no one-shot critical possibility; Eveline must survive the first pair of hits from full HP. Recruitment must not depend on dodging.
- Soldiers at (13,18) and (15,14), with an archer at (15,16), pressure the avenue. Their ranges should overlap on an advance tile, but a side route must permit splitting the engagement.
- Market undead at (4,15) and (9,10) draw Arlan west or reward a coordinated detour. Keep house visits achievable without defeating the entire map.
- Steal-only attendant at (8,9), in a small market service pocket connected to (9,10). Give it low enough speed for base Lena to steal without a level-up.
- Northern soldiers at (12,8) and (15,7), archer at (17,9), and mounted patrol at (21,9) protect the approach. Stagger activation so rescuing Eveline does not trigger all northern defenders.
- Gate commander remains stationary at (13,4), protected by two guards. Armorslayer from the Bellkeeper rewards preparation.

The final map must test combined move-plus-attack ranges, not just adjacent enemy placement. Give visible range overlays and alternatives; no unavoidable multi-attacker trap on the recruitment approach.

### One finite reinforcement event

On enemy phase 5, announce that the Church is opening the western quarantine barrier. At the start of player turn 6, three undead arrive through the marked west entrance near (3,17), provided the route is clear. The party can respond before those enemies act. Queue occupied spawn locations; never move a reinforcement behind a defender to make room.

Show the warning under **Options > Objective**, with a brief mandatory first announcement and an in-world entrance marker. No same-turn surprise attacks. No repeat wave farming.

## Art and camera rules

- Houses: flat front elevations, consistent south-facing doors; roof gables may slope, but building footprints and perspective must not be diagonal.
- All street houses, visitable shops and exterior town houses align their facade planes to the camera before rendering, keeping screen edges vertical and bases level without off-center perspective skew. The clocktower and lamp presentation remain unchanged; house sizing retains the conservative footprint budget.
- Streets: use existing cobblestone terrain; lighter curb tiles distinguish roads from blocked building plots.
- Lamps: roughly one every 3-4 tiles along curbs, staggered on opposite sides. Aim for 24-30 visible lamps, not 24-30 dynamic point lights.
- Lamp posts stay on blocked curb/building tiles. Glow must not cover a recruit indicator, door, unit or range preview.
- Existing barricade/table props can represent stalls and carriage wreckage initially; do not spend art generation on gameplay-unimportant variations.
- Buildings: nineteen decorative blocks plus three visitable houses fill the district. Subdivide broad blocks into individual row houses or shops. Keep projected facade bounds inside their blocked footprints so roofs cannot erase roads.
- Clocktower: a single transparent sprite in the x 8-10, z 0-5 plot, with neighboring houses at x 5-7. Its actual clock face and spire remain visible when following the gate controls; no skyline panel or opaque sky foundation is rendered.
- Use bounded, viewport-aware camera movement with a decorative town border. Fill at least eight tiles outside the authored map; do not make them selectable or walkable.
- Keep every walkable tile's ground corners inside 97% of the viewport when followed at portrait, 16:9, 21:9 and 32:9 aspect ratios. Also verify mounted sprite silhouettes at edge entrances.
- Use padded ground bounds without a skyline-dependent zoom change.
- Objective details stay inside Options > Objective. Preserve enemy-follow, easing, unit inspection and preparation-map camera behavior.

## Generated art

Both mounted classes have registered eight-direction rotations and four-frame walking animations. Five-frame healing animations cover the four cardinal directions used by adjacent Heal casting. All frames normalize together with the idle sprites. New town facades, lamps and the standalone clocktower are used by the chapter renderer. New architectural sprites were generated using the original panorama as a reference and cropped to their transparent bounds without resampling.

| Asset | Local file | PixelLab job |
|---|---|---|
| Eveline, Troubadour | [south concept](../assets/character/Eveline_Troubadour/south_concept.png) | `7f7e6dfc-eea7-4f07-8383-35d96dbbeac7` |
| Eveline, Valkyrie | [south concept](../assets/character/Eveline_Valkyrie/south_concept.png) | `485fdf67-85b8-4b87-a8fe-f6209473879f` |
| Gothic row house | [front facade](../assets/tiles/Cathedral_Streets/gothic_row_house.png) | `38a0a1b9-515e-4cec-89ba-88b52b2bed9d` |
| Shuttered shop / visitable house | [front facade](../assets/tiles/Cathedral_Streets/gothic_shuttered_shop.png) | `766525c6-0bdd-4bbf-9227-fcb261c7c02c` |
| Standalone clocktower | [front elevation](../assets/tiles/Cathedral_Streets/clocktower.png) | `3a1314f1-74bb-49f3-8215-c48e70287205` |
| Gas lamp | [front prop](../assets/tiles/Cathedral_Streets/gas_lamp_front.png) | `e6a75f48-2305-4078-99a4-834060fc767b` |
| Architectural reference only | [original panorama](../assets/tiles/Cathedral_Streets/clocktower_skyline.png) | `f531053f-bf68-4191-94cb-ed15c17e55c1` |

Troy and Paladin_Troy folders already exist; use those supplied assets rather than regenerate him.

Directional PixelLab characters: Troubadour `c6842da6-0c11-4807-8e5d-054658c0230e`; Valkyrie `3ad35196-a54e-4a78-8820-9ccd6bd27032`. Each downloaded rotation is 64 x 80 pixels. Cardinal views face the grid axes; diagonal character directions are intentional for movement, unlike diagonal building perspective.

## Implementation acceptance checks

Design-stage checks passed: all three house doors, the gate controls, Eveline and the attendant are connected after subtracting the three blocked house footprints. Shortest paths to Eveline adjacency are 9 tiles for Troy (two movement turns) and 13 for Rictor (three movement turns). These measurements exclude combat, unit occupancy and future stalls; the playable version must repeat the checks with those constraints. All 16 generated rotations have matching 64 x 80 canvases, and the diagram XML and document links validate.

1. Recruit Eveline through Rictor's Talk; Troy cannot trigger recruitment. Healing works immediately with her own staff.
2. Protect/recruit, miss recruitment, and lose Eveline scenarios all persist and restart correctly.
3. All three houses can be visited exactly once, with inventory overflow handled normally.
4. Boss drops one emblem; attendant awards none on death. Stealing awards exactly one and cannot be repeated after save/load.
5. Walkable routes connect all objectives and houses without crossing a footprint. Lamps never alter routes.
6. Verify Troy's turn-two interception and Rictor's turn-three recruitment using actual shortest paths and enemy attack ranges.
7. Verify the finite turn-six wave warning, occupied entrances and save/restore.
8. Clear every enemy without seizing: no premature victory. Seize with Rictor after the commander falls: victory.
9. Validate authored, validated and serialized maps; failed starts must not mutate roster or autosave.
10. Camera tests cover all walkable tiles, mounted silhouettes and the actual clocktower face/spire; visually inspect all three house entrances, Eveline's horse and edge spawns. Layout tests cap roads at 280 tiles, require at least 400 building tiles, prohibit empty 5 x 5 plazas and verify two-tile market alleys. Rendering tests require at least forty individual facades with no projected overlap onto roads.
11. Coachman's Visit awards an Axereaver, not a tonic. Test Axereaver versus Axe (+2), Sword (-2) and ordinary Spear (0), and Lancereaver versus ordinary Spear (+2), Axe (-2) and Sword (0); opposing combatants receive the inverse modifiers. Verify doubled damage, hit and avoid triangle modifiers without doubling total damage.

Saved battles retain their embedded map data. Verify this redesign from a fresh Chapter 13 on an isolated browser origin; never replace an existing save's terrain just to apply the visual update.
