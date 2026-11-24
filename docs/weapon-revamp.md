# Weapon and Insight Revamp

Design reference for the planned overhaul of the physical weapon roster and the Insight upgrade screen. The Iron Katana to Iron Sword rename is implemented, retaining its original stats (including 3 weight); older save IDs migrate automatically. Other changes below remain planned. Live data in `data/weapons` and `data/upgrades.json` is the source of truth, and [item-guide.md](./item-guide.md) is regenerated from it.

- **Decided** marks a direction you have already chosen.
- **Proposed** marks numbers or choices I filled in to complete the picture. These are open for discussion.
- Acquisition timing (which chapter each weapon appears in) is deliberately left for a follow-up discussion.

## 1. Weapon types

**Decided:** there are no "Spears" as a weapon type, only **Lances**.

- The `Spear` weapon type becomes `Lance` everywhere: the weapon triangle, class weapon lists, weapon ranks and EXP, profile and prep screens, and battle animations.
- "Spear" survives only as the name of **one specific weapon**, the heavy 1–2 range lance (see 3.2).
- The weapon triangle stays the same: **Sword > Axe > Lance > Sword**.

## 2. Rank ladder

**Decided:** every melee line follows the same material ladder.

| Tier | Rank | Swords | Lances | Axes |
| --- | --- | --- | --- | --- |
| Iron | **E** | Iron Sword | Iron Lance | Iron Axe |
| Steel | **D** | Steel Sword | Steel Lance | Steel Axe |
| Silver | **B** | Silver Sword | Silver Lance | Silver Axe *(new, proposed)* |
| Ancient | **A** | Starless Edge | Tidepiercer | Keelbreaker |

**Ancient weapons** are the drowned civilization's relics, and all of them require **A** rank. Horizon String (bow) is one of them.

**Proposed:** special weapons sit between the ladder rungs.

- **Effective / reaver weapons** (heavy but effective): **D**.
- **Killer weapons** (high crit): **C**.
- **Heavy throwing weapons** (Spear, Tomahawk): **C**.

Enemies already ignore rank requirements, so these changes only gate the player's units.

## 3. Weapon roster

Stat columns: Mt / Hit / Crit / Wt / Range. **Bold** values are changes from the current data.

### 3.1 Swords

| Weapon | Rank | Mt | Hit | Crit | Wt | Rng | Effect | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Iron Sword** | E | 5 | 90 | 0 | 3 | 1 | — | Rename implemented; original stats retained |
| **Steel Sword** | D | 8 | 80 | 0 | 8 | 1 | — | Unchanged |
| **Silver Sword** | B | 12 | 85 | 0 | 8 | 1 | — | New (decided); stats proposed |
| **Starless Edge** | **A** | **14** | 85 | 0 | 8 | 1 | — | Rank A (decided); +1 Mt so it clearly beats Silver (proposed) |
| **Rapier** | E | 5 | **95** | 10 | 2 | 1 | **Effective vs armor + cavalry** | Decided: Maria's personal weapon. Same Mt as Iron Sword but lighter, more accurate, innate crit and effectiveness |
| **Bloodletter** | E | 7 | 90 | 15 | 1 | 1 | Strikes twice; **keeps armor + cavalry effectiveness** | Proposed: the evolution inherits the Rapier's effectiveness |
| **Lancereaver** | **D** | 7 | 75 | 0 | **9** | 1 | Reverses the triangle vs Lances | Heavy special (decided); rank/weight proposed |
| **Armorslayer** | D | 8 | 75 | 0 | **11** | 1 | Effective vs armor | Heavy special (decided); weight proposed |
| **Zanbato** | **D** | 9 | 70 | 0 | **12** | 1 | Effective vs cavalry + armor | Heavy special (decided); rank/weight proposed |
| **Beast Killer** | D | 8 | 75 | 0 | 10 | 1 | Effective vs beasts | **New** (decided); stats proposed; needs a PixelLab sprite |
| **Killing Edge** | **C** | **9** | **75** | 30 | **7** | 1 | — | Killer weapon; rank/stats proposed |
| ~~Iron Katana~~ | — | | | | | | | Becomes Iron Sword |

### 3.2 Lances

| Weapon | Rank | Mt | Hit | Crit | Wt | Rng | Effect | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Iron Lance** | E | 6 | 80 | 0 | 6 | 1 | — | Renamed from Iron Spear (decided) |
| **Steel Lance** | **D** | 9 | 75 | 0 | 8 | 1 | — | Rank D (decided) |
| **Silver Lance** | **B** | 12 | 75 | 0 | 10 | 1 | — | Rank B (decided) |
| **Tidepiercer** | **A** | 14 | 80 | 0 | 10 | 1 | — | Rank A (decided) |
| **Javelin** | E | **6** | 70 | 0 | **7** | 1–2 | — | Common throwing lance; several in the game (decided) |
| **Spear** | C | 10 | 70 | 0 | 11 | 1–2 | — | **New, only one in the game** (decided): heavier and stronger Javelin |
| **Ridersbane** | **D** | 7 | 80 | 0 | 10 | 1 | Effective vs cavalry | Heavy special; rank proposed |
| **Axereaver** | D | 8 | 75 | 0 | 9 | 1 | Reverses the triangle vs Axes | Unchanged |
| **Killer Lance** | C | 9 | 75 | 30 | 8 | 1 | — | **New** killer weapon (decided); stats proposed |
| **Vigil Lance** | E | 7 | 85 | 5 | 4 | 1 | **Effective vs armor + cavalry** | Decided. Rictor only |
| **Longinus** | E | 10 | 85 | 5 | 6 | **1–2** | Effective vs armor + cavalry + **undead** | Decided: the evolution gains undead effectiveness and 1–2 range. Rictor only |
| ~~Iron Spear~~ | — | | | | | | | Becomes Iron Lance |
| ~~Steel Spear~~ | — | | | | | | | Same stats as Steel Lance; merged into it |

### 3.3 Axes

| Weapon | Rank | Mt | Hit | Crit | Wt | Rng | Effect | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Iron Axe** | E | 7 | 75 | 0 | 5 | 1 | — | Unchanged |
| **Steel Axe** | **D** | 10 | 70 | 0 | 10 | 1 | — | Rank D, to follow the ladder (proposed) |
| **Silver Axe** | B | 14 | 70 | 0 | 11 | 1 | — | **New**, completes the ladder (proposed) |
| **Keelbreaker** | **A** | 16 | 75 | 0 | 12 | 1 | — | Rank A (decided) |
| **Hand Axe** | E | **6** | **65** | 0 | **7** | 1–2 | — | Light throwing axe (decided) |
| **Tomahawk** | C | 10 | 65 | 0 | 12 | 1–2 | — | **New**: stronger, heavier Hand Axe (decided); stats proposed |
| **Killer Axe** | **C** | 10 | 80 | 30 | 9 | 1 | — | Killer weapon; rank proposed |
| **Hunter's Hatchet** | E | 10 | 80 | 10 | 7 | 1 | — | Liam's. Outclasses Steel Axe at E, so it should be **Liam-only** (proposed) |

### 3.4 Bows (light touch)

You didn't mention bows. The only proposed change is to apply the same rank rules:

| Weapon | Rank | Note |
| --- | --- | --- |
| Iron Bow | E | Unchanged |
| Hunter Bow | E | Stark's; effective vs beasts |
| Killer Bow | **C** | Killer weapon rank |
| Horizon String | **A** | Ancient weapon |

Steel and Silver Bows could be added later to complete the ladder.

### 3.5 Effectiveness summary

Effectiveness triples might against the listed unit types (the existing rule).

| Target | Weapons |
| --- | --- |
| Armor | Rapier, Bloodletter, Vigil Lance, Longinus, Armorslayer, Zanbato |
| Cavalry | Rapier, Bloodletter, Vigil Lance, Longinus, Zanbato, Ridersbane |
| Beast | Beast Killer, Hunter Bow, Fire line |
| Undead | Longinus, Light line |
| Flying | Killer Bow, Wind line |

## 4. Insight

### 4.1 Leadership stars: removed (decided)

Leadership stars were a flat party-wide +Hit/+Avoid boost bought with Insight. They are removed entirely.

- The Insight screen loses the Leadership row (and the planned star icon).
- **Old saves:** every point of Insight spent on stars is refunded automatically. Saves already record what each star cost (`leadershipPaid`).
- Remaining Insight sinks:
  - **Spell unlocks:** six books, 6 then 12 Insight each.
  - **Weapon evolutions:**
    - Rapier → Bloodletter (30)
    - Vigil Lance → Longinus (30)
    - Hunter Pistol → Evelynn (20)
  - **Blood Emblem** (see 4.2).

### 4.2 Blood Emblem (decided and implemented)

**Old behavior:** unlock for 30 Insight. When equipped, it restored 10 HP whenever Maria defeated a foe.

Removing leadership leaves Insight without a party-wide reward. The emblem is the game's namesake, so it is now the biggest Insight purchase, awakened in three story-gated tiers. Every tier needs the emblem carried by Maria and equipped (Insight screen or her inventory).

| Tier | Name | Cost | Opens | Effect |
|---|---|---|---|---|
| I | **Blood Aura** | 20 | From the first preparations | At the start of each player phase, Maria and every ally orthogonally adjacent to her recover 10 HP. |
| II | **Ravage** | 40 | After clearing Chapter 6 | New command. Maria pays 20% of her max HP (rounded down, minimum 1) for +5 Might until your next turn, counters included. It cannot kill her, works once per turn before she acts, and does not use her action. Her sprite glows red while active. |
| III | **Blood Feast** | 60 | Chapter 11 | While Ravage is active, each of Maria's hits heals her for half the damage dealt (rounded down), counters included. It doesn't stack with Nosferatu; the stronger drain applies. |

- Tiers are bought in order. Refunds return the highest tier first, in full. Refunding the last tier unequips the emblem.
- Tunables live in `data/upgrades.json` under `bloodEmblem.tiers`.
- Ravage's +5 is added to Might before Defense, like the Bloodletter, so it is not a flat post-defense bonus.
- Old saves that bought the single 30-Insight unlock become Blood Aura and get the 10 Insight difference back.

## 5. Implementation impact (for later)

- **Data**
  - Rename the `Spear` type to `Lance` in `data/weapons/*`, `data/classes.json`, `data/weapon-triangle.json` and character `weaponExp` keys.
  - Implemented: `iron-katana` → `iron-sword`, with legacy save migration. Still planned: `iron-spear` → `iron-lance`.
  - Merge `steel-spear` into `steel-lance`.
  - Add the new weapons: Silver Sword, Beast Killer, Spear, Killer Lance, Silver Axe, Tomahawk.
- **Saves**
  - Migrate old item ids and `Spear` weapon EXP / ranks to `Lance`.
  - Refund leadership Insight.
- **Art**
  - PixelLab icons for each new weapon.
  - Longinus at range 2 needs a **thrown** battle clip for Rictor. It follows the same rule as Bartz's axe throw: a `thrown` block in the manifest plus a `THROWING_FIGHTERS` entry. The Javelin and Spear use the same throw.
- **Code**
  - Remove leadership from `src/game/insight.js`, `src/battle/combat.js` and `src/game/prep-menu.js`.
  - ~~Change the Blood Emblem effect.~~ Done (section 4.2).
  - Update tests that reference `Spear` or leadership.
- **Docs**
  - Regenerate [item-guide.md](./item-guide.md) with `npm run item-guide`.

## 6. Open questions

1. Are the proposed ranks right: specials at **D**, killers at **C**, Spear/Tomahawk at **C**?
2. Do you want Silver Axe added to complete the axe ladder? And Steel/Silver Bows?
3. Should Bloodletter keep the Rapier's armor/cavalry effectiveness?
4. Should Hunter's Hatchet become Liam-only?
5. ~~Which Blood Emblem direction do you want?~~ Decided: three tiers (Blood Aura, Ravage, Blood Feast). See 4.2.
6. Acquisition timing: which chapter each weapon first appears in. This is the next discussion.
