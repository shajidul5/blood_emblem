const EXP_PER_LEVEL = 100;

export function awardExperience(unit, amount, random = Math.random) {
  const previousLevel = unit.level;
  const previousExperience = unit.experience;
  let experience = previousExperience + amount;
  const statGains = [];
  const growthRolls = [];

  while (experience >= EXP_PER_LEVEL) {
    experience -= EXP_PER_LEVEL;
    unit.level++;
    const levelRolls = [];
    for (const [stat, growthRate] of Object.entries(unit.growthRates)) {
      const first_roll = random();
      const second_roll = random();
      const roll = Math.min(first_roll, second_roll);
      console.log(`Roll for ${stat}: first=${first_roll}, second=${second_roll}, max=${roll}`);
      const gained = roll < growthRate / 100;
      if (gained) {
        if (stat === 'hp') {
          unit.maxHp++;
          unit.hp++;
        } else {
          unit[stat]++;
        }
        statGains.push(stat);
      }
      levelRolls.push({ level: unit.level, stat, growthRate, gained });
    }
    growthRolls.push(levelRolls);
  }

  unit.experience = experience;
  return {
    previousLevel,
    previousExperience,
    levelUps: unit.level - previousLevel,
    statGains,
    growthRolls,
  };
}
