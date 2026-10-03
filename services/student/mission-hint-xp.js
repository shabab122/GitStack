// Assign a mission's entire XP reward to its ordered steps. Later steps have
// gradually higher weights, and integer remainders are awarded deterministically
// so the penalties add up to the reward for every step count and XP value.
export function hintPenaltySchedule(rewardXp, stepCount) {
  if (!Number.isSafeInteger(rewardXp) || rewardXp < 0 ||
      !Number.isSafeInteger(stepCount) || stepCount < 1) {
    throw new RangeError("A hint schedule requires nonnegative integer XP and at least one step.");
  }

  const weightTotal = stepCount * (3 * stepCount - 1) / 2;
  const weights = Array.from({ length: stepCount }, (_, index) => stepCount + index);
  const costs = weights.map((weight) => Math.floor(rewardXp * weight / weightTotal));
  const remainder = rewardXp - costs.reduce((sum, cost) => sum + cost, 0);
  const ranked = weights.map((weight, index) => ({
    index,
    fraction: (rewardXp * weight) % weightTotal
  })).sort((a, b) => b.fraction - a.fraction || b.index - a.index);

  for (const { index } of ranked.slice(0, remainder)) costs[index] += 1;
  return costs;
}

// Split each existing step budget into progressively stronger clues (1:2:3).
// Largest remainders keep integer XP exact, including tiny/zero-XP budgets.
export function hintLayerCosts(stepCostXp) {
  if (!Number.isSafeInteger(stepCostXp) || stepCostXp < 0) {
    throw new RangeError("A hint layer budget must be nonnegative integer XP.");
  }
  const costs = [1, 2, 3].map((weight) => Math.floor(stepCostXp * weight / 6));
  const remainder = stepCostXp - costs.reduce((sum, cost) => sum + cost, 0);
  const ranked = [1, 2, 3].map((weight, index) => ({ index, fraction: stepCostXp * weight % 6 }))
    .sort((a, b) => b.fraction - a.fraction || b.index - a.index);
  for (const { index } of ranked.slice(0, remainder)) costs[index] += 1;
  return costs;
}

// Legacy runs already debited their hint charges from the account at unlock.
// Newly started runs reserve their hint charges until successful completion.
export function missionXpForCompletion(rewardXp, hintUses, deferred) {
  if (!Number.isSafeInteger(rewardXp) || rewardXp < 0) {
    throw new RangeError("Mission XP must be a nonnegative integer.");
  }
  if (!deferred) return rewardXp;
  const used = hintUses.reduce((sum, hint) => sum + hint.costXp, 0);
  return Math.max(0, rewardXp - used);
}
