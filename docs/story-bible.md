# Blood Emblem - Story Bible

## Status and scope

This is the narrative direction for the next revision of the demo, not a description of everything currently implemented. It contains author-facing answers that must NOT become an introductory narration or a lore lecture inside the game.

The companion [character guide](character-guide.md) covers the twelve existing allies, their faction ties, knowledge limits, proposed backgrounds, reasons to remain with the company and reasons to descend, with a supporting-cast reference.

- **Established direction:** the user's emblem mythology, the recurring plague, Rictor's Golden Order membership, Vael as the original immortal contractor, and storytelling without dialogue or exposition.
- **Proposed connective tissue:** the Lantern Survey name, the expedition survivor's identity and motive, the exact contract rules, and the final chapter. These are recommendations awaiting approval.
- **Existing foundation:** Chapters 1-19, their maps, party split, reunification and principal encounters. Chapter 20 is an unimplemented finale proposal.
- **Not changed by this document:** runtime dialogue, tutorials, item descriptions, promotion rules, boss death rules, maps or saves. The adaptation list below identifies future work.

## 1. Basic premise

Maria sails to Mournhollow to find her missing husband, Rictor. She carries a crimson emblem he left with her before his last departure. It is not proof of destiny, inherited holiness or a supernatural right to rule. Someone recovered it, someone entrusted it to Rictor, and Rictor chose where to hide it.

The island's Healing Church has built its authority on blood that genuinely restores the sick. The Golden Order protects the treatment system and contains its failures. Behind their hospitals, quarantines and military roads is a supply chain drawing on something much older beneath the island.

Long before Aldermere was built, an ancient civilization contracted with the Deep One for eternal life. Its leader, now High Cantor Vael, was the original contractor. His people did not simply die when their bodies failed: they endured, changed, and became the disfigured inhabitants of the drowned city. What the surface calls a plague is the latest repetition of that bargain's consequences.

The Church did not create the Deep One or the ancient contract. It rediscovered a useful substance, reproduced its use, and continued after its harms became undeniable. The Order did not invent the treatment, but its commanders made continued distribution and concealment possible. A third faction, the archaeologists provisionally called the Lantern Survey, first recovered the Blood Emblem and helped expose the ancient world to modern exploitation.

Maria's search connects these histories through places and actions: a boarded vessel, a transformed official, an abandoned camp, locked hospital wards, shipments of patients, and finally a city whose residents have been unable to die for ages.

**The central horror:** eternal life was granted without preserving a human life worth living. The institutions above are repeating the same process, not suffering a new and unrelated curse.

**The central human conflict:** people repeatedly choose preservation of authority, research or life at another person's expense. Other people refuse. Neither choice is fate.

## 2. Storytelling rules

### What the player receives

1. **Environment first.** Treatment chairs face restraints; supply rails lead to a lift; a monster still wears a chain of office. Show an arrangement before explaining an association.
2. **Gameplay as evidence.** Patients become the same enemies the player has fought. A shipping wagon contains a transformed person. Destroying a healing root changes a boss's behavior. Evidence should do something.
3. **Short, optional item descriptions.** Objects describe materials, ownership, wear and use. Two or three precise sentences are preferable to an account of the island's history.
4. **Boss identity through body, equipment and conduct.** A title is allowed; an introductory speech is not. Repeated recovery, an old wound, a familiar seal or a preserved uniform can tell a boss's history.
5. **Consequences remain visible.** Killing Voss does not cure his patients. Reuniting the parties does not restore the village. Defeating Vael does not, by itself, cancel his contract.
6. **Practical clarity without narrative explanation.** Objectives, damage forecasts, recruitment eligibility, reinforcement warnings and item effects remain explicit. Mystery is not an excuse for unreadable tactics.

### What is removed or avoided

- No conversations, voiced exchanges, dialogue choices or character-to-character text.
- No omniscient opening paragraphs, retrospective ending monologues or explanatory story popups.
- No substitute exposition delivered by inscriptions, journals or a narrator. An optional object label is not a license to print the plot on a wall.
- No character announcing the conclusion the player should reach.
- No chosen one, prophetic bloodline, destined bearer, foretold marriage or ancient name reserved for Maria.
- No supernatural reaction aimed at Maria merely because she is the protagonist.
- No requirement to inspect every item to understand where to go or what is at stake.

### Replacing spoken interactions

Recruitment is preserved, not silently deleted with its dialogue. Proposed actions such as **Assist**, **Release** or **Rally** replace **Talk**, with eligibility stated in the unit panel. Retain the current recruiter and adjacency conditions unless a later gameplay change is approved.

Examples: Maria reaches the wounded Linus while protecting the village; Rictor helps Eveline secure her patients; Eveline approaches Corvis and he lowers his weapon. A brief animation and a neutral "Joined the company" notification replace an exchange.

The Chapter 16 reunion can be a shared formation, lowered weapons and a return to player control. Existing healing and Insight rewards remain clearly displayed, not explained through a conversation.

## 3. What is an emblem?

An emblem is a **material instrument of an institution's promise**. It is a recognizable object used to admit someone to a role, grant authority, or bind them to an obligation. A crest depicts allegiance; an emblem makes that allegiance actionable.

The three emblems must be related in theme but visibly different. They are not three colors of the same loot item, and their powers should not be interchangeable.

| Emblem | Promise | What it authorizes or binds | Narrative cost |
| --- | --- | --- | --- |
| Order Emblem | Strength through sanctioned order | A unit's admission to an established advanced discipline | The institution decides whose strength is legitimate |
| Covenant Emblem | Renewal through participation in blood research | A unit's admission to a covenant class | Advancement is tied to the treatment system and its obligations |
| Blood Emblem | Life continuing beyond death | The ancient civilization's original contract with the Deep One | Life persists while body, identity and autonomy may be lost |

### Order Emblem - established direction

The Golden Order uses its emblem to confer advanced station. Promotion is a rite backed by training, equipment and institutional authority, not a badge that persuades the world someone deserves obedience.

The player can use a recovered emblem without agreeing with the Order. This is a deliberate tension: the company turns the Order's tools against its commanders. Do not retroactively label every promoted ally an obedient Order member.

**Implementation boundary:** the existing item is displayed as **Orders Emblem**, with ID `master-emblem`, and promotes eligible level-20 units along one advanced-class path. "Order Emblem" is the proposed editorial name, not an instruction to rename IDs or invalidate saves.

### Covenant Emblem - established concept, unimplemented system

This belongs to the group studying and distributing healing blood. Recommended structure: the **Sanguine Covenant** is the Healing Church's research and distribution fraternity, not a fourth unrelated major faction. The Church is its public authority; the Covenant controls laboratories, treatment protocols, consignments and initiation.

Its emblem promotes a unit into a **covenant class instead of the Order-aligned advanced class**. The resulting appearance, equipment and abilities should express a different doctrine of strength, not simply higher statistics.

**Proposed design boundary:** this is an alternative promotion branch at the same broad stage of advancement, not a compulsory second promotion stacked on top of the Order path. Exact classes, eligibility, costs, availability, respecialization and balance remain undecided. No playable covenant class tree exists yet.

**Current implementation:** the first Covenant Emblem (`covenant-emblem`) drops from the Omen in Chapter 7. Until covenant classes exist, it promotes exactly like the Orders Emblem (level 20+, standard advanced class), so the item's story is established before its system.

Do not make using it secretly corrupt, kill or remove an ally. Any eventual permanent consequence must be disclosed as a gameplay rule. Its story can be troubling without deceiving the player about an item.

### Blood Emblem - established origin

The emblem belonged to the ancient civilization beneath Mournhollow. It represents the contract made with the Deep One for eternal life. Vael was its original contractor, not a later jailer who accidentally inherited someone else's prison.

**Recommended interpretation:** it is the surviving physical instrument of that contract: a seal impressed upon the bargain, not an antidote, an ordinary promotion item or a key that magically selects its owner.

It does not confer an automatic inheritance when held. Maria carrying it does not mean she has consented to replace Vael. The contract, the object and its current custodian are distinct.

Any reaction near ancient machinery is a response to the object. Matching sockets, old fittings and repeated engravings should explain that response. Another person carrying the same object would produce it.

The optional Insight powers grow in three tiers while equipped: Blood Aura mends Maria and those beside her each turn, Ravage lets her spend her own blood for strength, and Blood Feast heals her for half the damage of each Ravaged blow. They are echoes of the bargain's principle - life maintained through taking - not evidence that she is uniquely chosen, already immortal or cured. Do not retcon all staff healing or ordinary recovery items into the same blood treatment.

**Pending rule decision:** what can possession of the original instrument actually change? Recommended answer: it permits access to the place where the contract was made; ending that contract still requires a deliberate act there. Carrying it, dropping it or defeating its keeper is insufficient.

## 4. Factions

### Golden Order

**Function:** armed protection, roads, gates, custody and enforcement.

**Public purpose:** preserve life by preserving order. Its virtues are real; individual soldiers can act on them even while opposing command.

**Institutional failure:** quarantine becomes confinement, protection becomes concealment, and promotion rewards reliable obedience. Commanders need not know all the ancient truth to be culpable for what they guard.

**Visual evidence:** golden sun motifs, paired banners, disciplined lanes, numbered checkpoints, command seals on hospital doors, and Order equipment in treatment depots.

Rictor belongs to this Order. His city-watch service is an assignment or prior duty, not a separate allegiance that replaces it. Linus choosing villagers over a sealed road establishes the same moral possibility before the player sees Rictor imprisoned.

### Healing Church and the Sanguine Covenant

**Function:** public healing, treatment, research and blood distribution.

**Public purpose:** the blood works. People seek it for understandable reasons. Show recovered patients and useful medicine as well as institutional brutality; belief should not require universal stupidity.

**Institutional failure:** knowledge of transformation does not stop distribution. Failed treatment is hidden, patients become inventory, and repeated dosing is called refinement.

**Visual evidence:** blood-drop seals, dosage fittings, matching vessels across poor clinics and rich sanctuaries, restraints beside beds, and shipment tags that retain patient numbers.

Seymour, Eveline and Corvis need not embody the institution's worst acts. Their position, equipment and choices should distinguish care, complicity and refusal without a confession scene.

### Lantern Survey - proposed name for the third faction

**Function:** expeditions, excavation and study of the civilization beneath the island.

**Why this name:** it identifies a practical exploration fellowship, not another church or an all-knowing secret order. Its lantern-and-descending-steps mark can recur on crates, route markers, measuring tools and abandoned camps.

**Institutional failure:** some members exchange discoveries for Church funding and Order access; others try to stop the use of what they uncovered. Scholarship neither absolves them nor makes every member a villain.

**Distinct contribution:** the Survey initially finds the Blood Emblem. The Church distributes the blood; the Order secures the operation. None should be credited with independently discovering everything.

**Alternative names, not additional factions:** the Lantern Society, the Deep Survey, or the Society of the Lower Shore. Use Lantern Survey as a working label until a final name is approved.

### Ancient civilization and the First Covenant

The ancient people are not a fourth modern organization. **First Covenant** describes their bargain and its surviving rites, not an interchangeable name for the modern Sanguine Covenant.

Ancient homes, armories, observatories, public squares and family objects establish that this was a society, not a city built entirely to host a boss. Its beasts were residents, soldiers, attendants and scholars.

Modern human-looking custodians below can be later initiates preserving those rites. Human appearance must not imply that ancient subjects are untouched or that every robed enemy is as old as Vael.

## 5. Author-facing chronology

The player reconstructs this sequence through recurring evidence; no single collectible presents it.

1. **An inhabited civilization faces mortality.** Its buildings and civic objects precede the blood rites. The particular crisis that made Vael seek a bargain is unresolved; avoid inventing a necessary plague or war.
2. **Vael makes the first contract.** The Blood Emblem is its surviving instrument. He receives immortality, and his people receive a form of continued life.
3. **Continued life becomes transformation.** Bodies change rather than finding release in death. Different environments, exposures and durations produce different forms.
4. **Rites become administration.** Bell schedules, offerings and records organize the enduring population around the bargain. Some institutions continue long after their civic purpose has collapsed.
5. **The upper civilization forgets or buries that history.** Aldermere develops above the older remains. Its exact founding relationship to the ancient people remains open.
6. **The Lantern Survey reopens access.** An expedition recovers the emblem and samples or knowledge of the blood. Church sponsorship and Order escorts connect the discovery to institutions capable of scaling it.
7. **Healing blood enters public use.** Early benefits establish trust. Treatment spreads through existing roads and clinics.
8. **Transformation recurs.** The Church retains subjects and increases treatment; the Order enforces restrictions and protects shipments.
9. **An expedition survivor removes the emblem from institutional custody.** They entrust it to Rictor. The precise identity is proposed below.
10. **Rictor leaves it with Maria before his last departure.** He returns to Mournhollow, opposes what he finds and is imprisoned. His communications cease; Maria follows his trail.
11. **The campaign crosses the system in reverse.** Surface consequences lead to distribution, research, excavation and finally the original bargain.

Immortality does not require invulnerability, invincibility, freedom from pain or an unchanged body. The player can win an encounter with an immortal without permanently killing them. This distinction must be visible, not explained away in a menu.

## 6. Rictor, Maria and the missing expedition

### Recommended answer to the handoff

**Proposed giver:** an unnamed surviving Survey expedition member who served as a Church-appointed liaison on the original descent. Their Church office explains the current draft's "minister" reference, while their expedition membership makes them a participant in the discovery.

Do not finalize a personal name or a secret connection to a playable ally yet. Their role matters more than a surprise identity.

**Why Rictor:** he was an Order escort or security contact who had already refused to surrender an injured expedition worker to researchers. The survivor trusted an observed decision, not a prophecy or his ancestry.

**What the survivor knew:** where the emblem had been found, that blood distribution followed the expedition, and that someone wanted the object back. They did not possess a perfect explanation of the Deep One.

**Why remove the emblem:** to deny the treatment authorities further access to the original contract site and preserve evidence that the official account of the expedition was false. Removing it does NOT cause the surface plague or punish the person who takes it.

**Why Rictor left it with Maria:** he expected his return to the island to involve searches, confiscation and possible detention. An unregistered object left outside the institution was harder to recover than one carried into its custody. Maria was the person he trusted, not an heir selected to complete a rite.

This is a fallible protective choice: keeping her outside the operation did not keep her safe once she chose to search for him. The document should not present withholding information from her as unquestionably wise.

**Why he returned:** duty to people still on the island, unanswered questions about the expedition, and an attempt to stop the detention of patients. He did not knowingly travel to summon Maria or sacrifice himself.

### Handoff evidence trail - proposed

| Place | Physical evidence | Inference supported |
| --- | --- | --- |
| Chapter 1 | The emblem is already among Maria's belongings, wrapped in a repaired strip of Order cloak | It was entrusted before the journey, not awarded by the island |
| Chapter 4 | An opened Survey shipping case with an empty crimson-seal recess and a Church requisition stamp | The emblem passed through a modern expedition and official custody |
| Chapter 7 | A Survey route tag beside Order escort equipment; an old fitting matches the wrapper's clasp | Rictor's institution accompanied the researchers |
| Chapter 11 | Rictor's confiscated effects contain the matching torn cloak edge and an empty confiscation outline | He possessed and deliberately removed something before imprisonment |
| Chapter 12 | A surviving expedition tag has a Church appointment overprinted on the Survey mark | "Minister" and expedition member need not be different people |
| Chapter 15 | An incomplete return manifest shares that tag's mark; its specimen entry is physically cut out | Official custody was interrupted, not divinely transferred |
| Chapter 17 | Abandoned measuring lines and a dead expedition camp stop at the ancient approach | The modern descent is real and comparatively recent |
| Chapter 19 | The original impression matches the carried object's worn face, not Maria's body | The object belongs to the bargain; she does not |

Use selected details rather than hiding a full biography in nine lengthy notes. The exact fate of the survivor can remain unknown.

## 7. The recurring transformation

These are recommended visual relationships, not a new combat taxonomy or a claim that every enemy is an ancient citizen.

| Surface manifestation | Older or deeper counterpart | Repeatable evidence |
| --- | --- | --- |
| Merfolk and Deep Merfolk | Drowned Citizens and Tide Stalkers | Related hands, gill scars and weapons adapted from civic tools; recognizable human remains beneath aquatic change |
| Wolves, wolfmen and hunting beasts | More mature drowned predators | Shared tendon patterns and progressive loss of human proportions; avoid claiming an ordinary wolf was once a named person |
| Quarantined undead and Rotten | Long-enduring drowned bodies | Restraint scars, similar postures and tissue changes beneath different clothing |
| Ordinary carrion ravens | Gloam Ravens and Crowned Ravens | Related silhouette and increasing anatomical alteration, not merely larger numbers |
| The Omen (Ansel Wren) | Crowned Ravens | A man who drank at the source; raven head, wings and flock are what exposure made of a Survey scout who still keeps his oath |
| The clerical Blood Beast | Bell-Drowned and other ancient extremes | Human status objects retained on a body distorted beyond recognition |
| Modern armored enforcers | Ancient Guardians | Repeated formations and protection of treatment routes; this is also institutional repetition, not necessarily a direct biological lineage |

The late-game monsters are ancient people and long-developed forms related to the earlier beasts, not a disconnected set of fantasy species. Age alone is not a universal upgrade timer: exposure, role and environment also matter.

The current campaign labels Chapters 11-15 **Part Three** and Chapters 16-19 **Part Four**. The user's reference to Part 3 monsters is treated as the late-game transformation theme, not an instruction to silently renumber the campaign. Part titles and any consolidation remain a separate editorial decision.

## 8. Chapter-by-chapter outline

Each entry separates the existing playable spine from proposed narrative presentation. "Player takeaway" is the author's target inference, not text to display.

### Part One - Arrival and visible consequences

#### Chapter 1 - Between Two Ships / The Tide Remembers

- **Existing spine:** Maria's passage is interrupted by Bartz's pirate boarding; defeat the boarders.
- **Story summary:** a personal search enters an ordinary maritime world already touched by the island's trade.
- **Environment/gameplay:** damaged merchant cargo bears treatment seals and a few Survey handling marks. The boarding fight makes Maria capable, not divinely protected. Her belongings include the wrapped Blood Emblem and evidence of Rictor's departure.
- **Item/boss evidence:** a travel-worn personal token and the wrapper establish a marriage and a handoff without an opening monologue. Medical cargo is not proof every sailor used it.
- **Adaptation:** remove narrated backstory; establish the search with paired keepsakes and a route to Mournhollow. Keep controls and weapon-triangle instruction.
- **Player takeaway:** Maria came for someone; the emblem arrived with her.

#### Chapter 2 - Boarders from the Deep

- **Existing spine:** Merfolk board the ship; Maria and Bartz become allies against a shared threat.
- **Story summary:** the sea attack makes the previous human conflict secondary.
- **Environment/gameplay:** wrecked restraints and a released pirate communicate the alliance. Raiders carry recognizable fragments of clothing, fishing fittings or treatment bands beneath aquatic changes.
- **Item/boss evidence:** the Merfolk leader retains a worn human fastening rather than a label explaining its origin.
- **Adaptation:** replace the narrated freeing of Bartz with a short visible release and shared deployment. Do not have a monster identify the emblem or call Maria by name.
- **Player takeaway:** these creatures have a connection to human life.

#### Chapter 3 - The Fishing Village

- **Existing spine:** land at the village, recruit Cyrus, repel a raid and visit supply houses.
- **Story summary:** everyday settlement life and blood treatment occupy the same space.
- **Environment/gameplay:** abandoned nets, shuttered rooms and a clinic delivery point show disruption. A few occupied, tended houses show that people still live here. Cyrus helps defend a route rather than joining after an explanatory tavern scene.
- **Item/boss evidence:** matching treatment vessels inside a poor household and official cargo suggest widespread, ordinary use.
- **Adaptation:** house visits produce practical supplies and brief object descriptions, not testimony delivered through a door.
- **Player takeaway:** the disaster is affecting a living community, not an empty monster island.

#### Chapter 4 - The Mansion

- **Existing spine:** clear the mayor's mansion, confront Killian and search locked chests.
- **Story summary:** local authority participated in the system and was not protected by it.
- **Environment/gameplay:** the mayor's chain remains on Killian's transformed body. A reception hall has become an improvised distribution point; a Survey case sits among requisitioned goods.
- **Item/boss evidence:** the empty emblem recess is one clue among damaged instruments and treatment equipment. Killian's chain is stronger evidence than a monster explaining his history.
- **Adaptation:** remove the suggestion that Killian was waiting specifically for Maria. His position follows his former office and current habits.
- **Player takeaway:** the afflicted include people who administered the island.

#### Chapter 5 - Escape from the Village

- **Existing spine:** escort every living ally to the exit under reinforcement pressure; search houses and recruit Seymour.
- **Story summary:** the village cannot be fixed by defeating its mayor. The company must leave through a still-functioning human route.
- **Environment/gameplay:** reinforcements arrive from the sea as lanterns fail along the retreat. Seymour is found maintaining a small refuge, with staff and ordinary supplies beside treatment vessels.
- **Item/boss evidence:** an Order emblem in household custody suggests institutional reach beyond a battlefield; its acquisition is not a divine reward.
- **Adaptation:** remove Cyrus's speech, Seymour's introduction and the ending claim that the island was waiting for Maria.
- **Player takeaway:** the consequences continue after a boss falls; care and complicity can coexist.

### Part Two - The road held by the Order

#### Chapter 6 - The Hollow Wood

- **Existing spine:** defeat the Great Wolf, use undergrowth and withstand finite wolf waves.
- **Story summary:** hunting grounds and altered ecology sit between village and city.
- **Environment/gameplay:** abandoned hunting gear and stained drainage channels link the forest to human use. Altered beasts recur in silhouettes that later deepen below.
- **Item/boss evidence:** healed scars and foreign material caught in an old collar imply exposure, without declaring every animal a transformed citizen.
- **Adaptation:** remove the ring warming and the claim that beasts watch Maria in particular. If the emblem reacts, it reacts near an ancient fixture with a matching mark.
- **Player takeaway:** transformation has spread beyond the clinic into the landscape.

#### Chapter 7 - The Order's Camp

- **Existing spine:** defeat Orsen, search tents, withstand wolves and gain Stark. Carrion ravens scout on turns 6 and 8; on turn 9 the crows fall silent (warning sting and popup), and on turn 11 the Omen arrives at the west gate.
- **Story summary:** the Order has already lost a force on this road, but its dead retain their posts. Something older than the Order has been following Maria since the Hollow Wood.
- **Environment/gameplay:** escort supplies, Survey instruments and sealed medicine share the abandoned camp. Orsen's formation outlasts its purpose. Stark protects a route toward civilian supplies before joining. Forest ambience carries crow calls throughout Part Two's woods, so the flock is a presence before it is an enemy.
- **Item/boss evidence:** a personal scarf or a household medicine token suggests Stark's connection to someone sick; it need not reveal his entire motivation.
- **The Omen:** **Ansel Wren**, the Lantern Survey scout whose lantern first fell on the Blood Emblem during the descent, sworn to the Sanguine Covenant that funded it. He drank from the source; exposure gave him a raven's head, wings and flock. When the Emblem was carried out of reach, his oath to bring it back outlived his name. He hunts Maria because she carries it. He is a flying, greatsword-wielding pursuer the party is not meant to defeat: 100 HP, 32 Strength, 28 Dexterity, 32 Speed, 18 Luck, 30 Defense and 26 Resistance. His movement remains 7 so the escape timer is unchanged. He is not the chapter boss; defeating Orsen still wins. If he falls, he drops the first **Covenant Emblem**.
- **Adaptation:** replace Stark's family speech with personal equipment and action. Preserve Orsen as a fallen commander rather than an informed spokesperson. Keep Wren wordless; the arrival popup only warns Maria that something ominous is following her. His identity is inferred from the Covenant Emblem's item lore and the Survey tags already planted in Chapters 4 and 7, never explained on arrival.
- **Player takeaway:** the Order escorted the operation and was consumed by it too, and the expedition that found the Emblem has not stopped looking for it.

#### Chapter 8 - The Rotted Heart

- **Existing spine:** Liam recovers through Heartroots; destroying them stops healing and increases his frenzy.
- **Story summary:** the forest is preserving damaged life through a sustaining network, not restoring health.
- **Environment/gameplay:** use the root-healing relationship as an early, observable model of the later bargain. The hunting lodge's drainage leads toward the roots; no popup explains where every drop went.
- **Item/boss evidence:** Liam's remaining hunter equipment and familiar repairs tie him to the lodge.
- **Adaptation:** remove authoritative claims that this was the first hunt or that all cursed blood necessarily drains here. Those are not needed to understand the encounter.
- **Player takeaway:** stopping what sustains a body can end recovery while making the body more dangerous.

#### Chapter 9 - The Last Crossing

- **Existing spine:** rescue villagers, reach wounded Linus, overcome the captain and finite beasts, then reach the bridge.
- **Story summary:** the Order protects a boundary while leaving people outside it.
- **Environment/gameplay:** closed barricades face the refugees; Linus holds a lane facing the beasts instead. Civilian movement and his injuries make the disagreement legible.
- **Item/boss evidence:** the captain's sealed gate orders and Linus's abandoned formation distinguish command from conscience. Rescue rewards remain gifts, not proof victims existed to reward the player.
- **Adaptation:** replace shouted commands and Linus's recruitment dialogue with formation, lowered lance, an assist action and shared defense.
- **Player takeaway:** disobedience can preserve the values an institution claims to uphold.

#### Chapter 10 - The Golden Threshold

- **Existing spine:** defeat Aurelan, confront the Blood Beast and reach the city gate.
- **Story summary:** military containment surrounds a catastrophe already inside the city.
- **Environment/gameplay:** defenders watch both directions. The beast drops from the gatehouse wearing high clerical insignia; no ally identifies the symbol aloud. Ravens arrive with the disturbance.
- **Item/boss evidence:** retain the chain and vestment design in later Cathedral art so players can connect the cleric to the institution.
- **Adaptation:** remove the captain's decree, Linus's question and Seymour's explanation. Do not make Aurelan's dropped emblem magically create the beast.
- **Player takeaway:** authority neither escaped transformation nor kept the threat outside.

### Part Three - Care, custody and the treatment system

#### Chapter 11 - The Quarantine Ward

- **Existing spine:** switch to Rictor and Lena; unlock cells, recover equipment and escape together.
- **Story summary:** the missing man is alive, imprisoned by the organization he served.
- **Environment/gameplay:** his Order insignia remains recognizable beneath confiscation marks. Cells mix numbered patients, altered bodies and equipment. Lena opens his door; he chooses to help clear the route rather than remaining a passive rescue.
- **Item/boss evidence:** the Vigil Lance, a stripped badge and the torn emblem wrapper suggest duty, punishment and a deliberate handoff.
- **Adaptation:** remove the narrated handoff history and escape conversation. Rictor is an Order member assigned to civic protection, not merely an unrelated watchman.
- **Player takeaway:** the second party sees the machinery Maria has only encountered from outside.

#### Chapter 12 - The House of Mercy

- **Existing spine:** hold evacuation for eight enemy phases, recruit Arlan, optionally secure wards, aid patients and recover the ledger.
- **Story summary:** the same building genuinely treats people and forcibly retains them after treatment fails.
- **Environment/gameplay:** evacuation beds travel past locked recovery wards. Dose fittings and numbered gowns recur on the Rotten. Arlan's shield faces the entrance used by the enforcers.
- **Item/boss evidence:** the Treatment Ledger is a few aligned dose columns and crossed-out discharge marks, not a multi-page explanation of the plot. A separate expedition tag can connect Church and Survey.
- **Adaptation:** remove the claim that the Blood Emblem was a universal stabilizer preventing transformation. Remove testimony popups and stage the fire, blocked doors and evacuation visually.
- **Player takeaway:** an administered treatment and the later changes are connected; confinement conceals that connection.

#### Chapter 13 - The Procession of Ash

- **Existing spine:** advance through the city, gain Troy, optionally recruit Eveline, defeat Veyr and seize the controls.
- **Story summary:** a functioning command network protects a system failing its people.
- **Environment/gameplay:** emptied medicine carts pass occupied streets; the treatment route is guarded while side alleys are abandoned. Eveline stays beside patients. Troy uses the old watch route.
- **Item/boss evidence:** the recoverable Order emblems show authorization and patronage. They must NOT be described as the same crest Maria carries.
- **Adaptation:** replace house conversations and recruitment speeches with supply caches, visible aid and a contextual assist. Keep optional rewards and loss consequences readable.
- **Player takeaway:** the Order and Church are cooperating, but their symbols and responsibilities are distinct.

#### Chapter 14 - The Silent Courtyard

- **Existing spine:** defeat Severin across an immaculate defended courtyard; Eveline can recruit Corvis.
- **Story summary:** the institution preserves ceremonial order while the surrounding city burns.
- **Environment/gameplay:** clipped gardens, a dry fountain and untouched paving contrast with the wards. Priests heal the military line. Raven arrivals coincide with a visible bell signal, without an ally explaining their role.
- **Item/boss evidence:** Severin's intact authorization and polished armor communicate what he protects. Corvis recognizes a colleague through a visible lowered weapon, not a debate.
- **Adaptation:** remove speeches at the door, recruitment dialogue and explanatory wave narration. Preserve explicit arrival markers and timing.
- **Player takeaway:** the center is not ignorant of the perimeter; it has chosen what to defend.

#### Chapter 15 - Beneath the Sacred Blood

- **Existing spine:** climb the Cathedral tiers without a free refill and defeat Bishop Aurel Voss.
- **Story summary:** treatment, military protection and research share a single administrative center.
- **Environment/gameplay:** paired seals, locked specimen storage, repeated treatment fittings and an active shipment route are visible along the ascent. Voss remains human, protected by healing and sustained by his own system.
- **Item/boss evidence:** concise shipment objects and overlapping seals establish responsibility. A cut-out expedition entry suggests the missing emblem's removal. No convenient document recounts the whole conspiracy.
- **Adaptation:** remove the Bishop's defense of the treatment and the party's conclusions. After victory, patients remain altered and freight continues moving.
- **Player takeaway:** Voss bears responsibility, but killing him neither cures the sick nor reaches the beginning.

### Part Four - The earlier world

#### Chapter 16 - The Delivery Bell

- **Existing spine:** two parties cross the freight yard, reunite, intercept wagons, defeat Halloran and descend together.
- **Story summary:** patients have become scheduled cargo; the route connects surface care to the older world.
- **Environment/gameplay:** numbered gowns in broken wagons match the wards. Empty and full consignments move through different sidings. The same bell pattern operates rails, gates and lift.
- **Item/boss evidence:** Halloran's brake fittings and shipping authority define him as an administrator of the transfer, not a prophet announcing the Deep.
- **Adaptation:** replace reunion and lift speeches with visible recognition, shared deployment and a continuous descent. Do not call smashing a wagon a rescue if it releases an enemy that remains hostile.
- **Player takeaway:** the operation continues beyond the Cathedral, and its cargo is human.

#### Chapter 17 - The Shore Beneath the World

- **Existing spine:** extinguish three offering beacons, find optional ancient armories and bring both leaders through the sea gate.
- **Story summary:** the modern treatment route reaches an inhabited system older than the Church.
- **Environment/gameplay:** recent Survey equipment lies over ancient paving. Modern vessel fittings are crude copies of those at the beacons. Drowned bodies resemble surface enemies at a more developed stage.
- **Item/boss evidence:** ancient relic weapons belong to a prior society; material, repair and wear communicate age. The distant Bell-Drowned carries its bell on its back consistently.
- **Adaptation:** remove the party's commentary and the early declaration of the whole covenant history. Beacon interruption visibly stops remaining arrivals.
- **Player takeaway:** modern distribution copied an older rite; the old world still operates.

#### Chapter 18 - The City That Waits

- **Existing spine:** cross dense civic districts, operate two mechanisms and defeat the Bell-Drowned.
- **Story summary:** the beasts occupy homes and streets built by the people they once were.
- **Environment/gameplay:** civic objects fit altered hands badly; repairs surround occupied doorways; statues retain features present in the creatures. Mechanisms reveal successive, damaged versions of a civic relief rather than an illustrated lore lecture.
- **Item/boss evidence:** the Bell-Drowned's straps and ceremonial fittings match a former public role. Its resonance makes the bell a functioning part of its body and duties.
- **Adaptation:** remove the definitive speech about bells keeping a god asleep and custodians changing the rite. Bell timing may regulate offerings or arrivals; the exact relationship to the Deep One remains uncertain.
- **Player takeaway:** this was a population, not a monster colony. The catastrophe did not grant its people release.

#### Chapter 19 - The Throne Beneath the Stars

- **Existing spine:** ascend connected terraces and defeat High Cantor Vael with his elite defenders.
- **Story summary:** the original contractor still presides over the consequences of his bargain.
- **Environment/gameplay:** the colonnaded final platform frames a civic ruler's seat, not just a generic cult altar. The same face appears in differently weathered reliefs, with the same old wound or hand deformity still visible on the living man. Ancient beasts occupy formal civic positions around him.
- **Item/boss evidence:** The Last Testament bears an original signatory impression matching the carried Blood Emblem. Later entries repeat obligations beneath that first mark. It is a record of continuance, not a list awaiting Maria's predestined name.
- **Environmental progression:** retain withdrawing water, exposed foundations, shifting stars and a quieted ocean. Replace the suggestion that the city makes room specifically for Maria with old systems responding to intrusion or the recovered contract seal. Petrified figures are civic remains, ritual fixtures or actual inhabitants only when their nature is intentionally established.
- **Boss behavior:** throne recovery and Benediction support an image of life maintained by a system. His current battle remains winnable; the next revision must show that incapacitating him does not permanently kill him. A hand moving after defeat or an old wound closing is sufficient.
- **Adaptation:** remove all Vael dialogue, the "seal has found its bearer" claim and the lock-and-chosen-name explanation. Do not add a resurrection combat phase or a required puzzle just to explain immortality.
- **Player takeaway:** Vael is the surviving first participant, not the Deep One, and defeating him has not ended the bargain.

#### Chapter 20 - The First Wound (working title; proposed finale)

- **No current implementation.** This is a narrative destination, not a commitment to a specific map or boss mechanic.
- **Story summary:** the company reaches the original contract site and can interrupt its continuation rather than inherit it.
- **Environment/gameplay:** the route behind Vael's throne descends to a place whose fittings match the emblem's reverse. Earlier delivery channels terminate here. Current bodies and ancient remains share the same arrangement.
- **Recommended conclusion:** the final objective concerns ending the active bargain at its source, not killing every creature or winning an argument with a god. The means, final opposition and precise role of the emblem need separate design approval.
- **Immortality payoff:** Vael can die only once the promise maintaining him has ended, if that is the approved contract rule. The same decision affects the ancient subjects, so it must not be presented as a consequence-free cure. Do not secretly force Maria into a replacement contract.
- **Closing image:** the mechanism stops; no new consignments arrive. Existing scars, ruined houses and the transformed do not instantly revert. Decide explicitly later whether release means mortality, death for those unnaturally sustained, or a more limited end to renewal.
- **Player takeaway:** the repetition was maintained by actions and institutions. It can be interrupted by action, without fate and without erasing its victims.

## 9. Evidence and reveal discipline

| Discovery | First suggestion | Stronger confirmation | What must remain unclaimed until supported |
| --- | --- | --- | --- |
| Monsters retain human histories | Clothing and tools in Chapters 2-4 | Numbered patients in 11-12, civic remains in 18 | Every monster was once the same kind of person |
| Order and Church cooperate | Cargo and escorts in 4-7 | Gate orders, shared custody and paired seals in 10-15 | Every soldier knows the full truth |
| Treatment precedes transformation | Household vessels and damaged recipients | Matching ward equipment, bodies and shipments in 12-16 | All healing magic causes the plague |
| The present repeats the ancient past | Recurring forms in forest and city | Older equipment, civic spaces and bodies in 17-18 | A prophecy compelled anyone to repeat it |
| Survey recovered the emblem | Empty expedition case in 4 | Escort tags and interrupted custody in 7, 12 and 15 | The giver knew everything |
| Rictor deliberately hid it | Wrapper in 1 | Matching confiscated belongings in 11 | He planned Maria's journey or suffering |
| Vael made the original contract | Recurring ruler image in 18 | Original impression and living physical continuity in 19 | Defeating him cancels the bargain |

For each essential inference, provide more than one independent channel. The main route should make the world readable; optional exploration deepens confidence and detail, not basic comprehension.

## 10. Adaptation backlog and contradictions

This is documentation of required future changes, not a request to execute all of them now.

| Current surface | Conflict with this direction | Required adaptation |
| --- | --- | --- |
| Chapter introductions and endings | Narrator states motivations and conclusions | Remove story exposition; stage entry/exit conditions and short silent events |
| `Talk` recruitment and reunion | Character dialogue is the delivery method | Introduce clearly labeled silent actions while preserving eligibility, costs and rewards |
| Chapter 5 ending; Chapter 6 introduction | Island waiting for Maria; beasts interested specifically in her | Remove protagonist-specific supernatural attention |
| Chapter 11 history | City-watch-only identity, unexplained minister handoff and timing that can imply a different sequence | Establish Order affiliation and show the proposed expedition connection through objects |
| Chapter 12 Treatment Ledger | Emblem explicitly suppresses transformation; popup explains the entire experiment | Replace with fragmentary material evidence; do not make contract emblem a universal antidote |
| Chapter 13 ending | Orders Emblem is called the same crest Maria carries | Separate Order, Covenant and Blood symbols unambiguously |
| Chapters 17-18 | Dialogue resolves ancient rites and divine intent | Let repeated apparatus, bell behavior and altered inhabitants establish only what is observed |
| Chapter 17 silhouette | Bell described inside the chest rather than on the back | Align old presentation with the current Bell-Drowned design |
| Chapter 19 | Last custodian, protective lock, destined bearer and Maria's unwritten name | Original contractor, contract instrument and no chosen owner |
| Chapter 19 victory | Combat defeat currently removes Vael like a mortal boss | Preserve encounter victory; add clear evidence of survival and defer final mortality to contract resolution |
| Blood Emblem item text | Resolved: item text now describes the three Insight tiers (Blood Aura, Ravage, Blood Feast) | No further action |
| Promotion items and class data | One implemented Order path; no Covenant item or branches | Design the alternative system separately; preserve existing class progress and saves |
| Existing chapter design documents | Historical story copy includes dialogue and assumptions superseded here | Treat those as implementation history; this bible governs future narrative revisions |
| Chapter 20 | No authored finale exists | Approve contract resolution and consequences before building |

### Recommended order of work

1. Approve the working faction names, giver proposal, emblem distinctions and immortality rules.
2. Define the three symbols and a small shared visual evidence kit: treatment vessels, Survey tags, patient numbers, paired seals and contract impressions.
3. Revise Chapters 1, 4, 7 and 11 together so the emblem's handoff is coherent from the beginning.
4. Replace recruitment/reunion conversations with readable silent interactions.
5. Revise Chapters 12-16 as one treatment-and-freight evidence chain.
6. Revise Chapters 17-19 together so transformation, ancient citizenship and Vael's survival agree.
7. Design Chapter 20 only after deciding what ending the contract does to its subjects.
8. Remove superseded story popups after the replacement evidence and tactical guidance are present, not before.

### Narrative acceptance checks

- A player who skips optional item lore still understands the immediate goal, the personal search and the relationship between the treatment system and its victims.
- Order and Blood emblems cannot be mistaken for the same object; Covenant insignia is recognizable before its promotion system is introduced.
- No essential conclusion is spoken by a character or printed as an omniscient explanation.
- Recruitment requirements, wave timing, boss hazards and permanent gameplay choices remain explicit.
- Ancient civic life appears in objects and layouts, not only in religious ruins.
- Recurring creature features are visible at tactical scale, not only in a concept sheet.
- Rictor's handoff has a practical chain of custody; Maria is neither selected by the emblem nor secretly consented to the bargain.
- Vael's immortality is visibly compatible with his Chapter 19 defeat.
- Ending the treatment operation, winning a boss encounter, ending the ancient contract and curing a transformed person are never treated as the same event.
- No scene requires a dead or unrecruited optional ally to provide an explanation.

## 11. Decisions still open

- Final name and insignia of the Lantern Survey.
- Whether the giver remains unnamed, their expedition role, and their eventual fate.
- Exact timing of the expedition, blood distribution and Rictor's return; avoid calendar dates until their relationship is settled.
- What Vael originally feared, and how much the ancient population knew or consented to.
- Why Vael retains a human appearance while many subjects do not.
- Whether modern blood treatment participates directly in the original contract or reproduces its material effects without individual contractual consent.
- Exact biological relationships among wolves, transformed people and deeper beasts.
- The Deep One's nature and intentions. Neither needs a spoken answer.
- Whether bells regulate offerings, access, subjects or the Deep One itself; do not assert all four as fact.
- Covenant promotion branches, acquisition, reversibility and interaction with already-promoted units.
- Chapter 20's objective, final encounter and the consequences of ending the contract.
- Campaign part labels if the late-game descent is to be grouped differently.

## Source anchors

These sources describe the demo as it currently exists, including narrative claims this document proposes replacing:

- [Chapter introductions, encounters and endings](../data/tutorials/).
- [Playable chapter maps and objectives](../data/levels/).
- [Blood Emblem item](../data/items/blood-emblem.json), [Orders Emblem item](../data/items/master-emblem.json) and [class definitions](../data/classes.json).
- [Rictor's profile](../data/characters/rictor.json), [Vael's profile](../data/characters/throne-vael.json) and [The Last Testament](../data/weapons/last-testament.json).
- [Chapter 19 story and boss rules](../src/game/abyssal-throne.js).
- [Chapter 13 implementation history](chapter-13-design.md) and [Chapter 14 implementation history](chapter-14-design.md).
