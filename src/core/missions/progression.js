/**
 * Ordering and gating.
 *
 * The catalogue orders itself. A mission carries what it assumes (`requires`) and
 * what it introduces (`teaches`), and is offered only once everything it assumes
 * has been met — so the game paces itself to what you actually know rather than
 * to a number someone typed.
 *
 * Within that, missions come in order of tier, then difficulty, then complexity:
 * the career rank you have reached, then how hard the task is, then how many
 * moving parts it has.
 *
 * `simulateProgression` is the reason this can be trusted. It plays the whole
 * catalogue as a player who begins knowing nothing, and reports anything that
 * never becomes reachable — which is how an unreachable mission, a circular
 * prerequisite or a tier-gating mistake gets found by the build rather than by
 * you, forty missions later.
 */

export const MAX_TIER = 5;

/** Tier, then difficulty, then complexity, then id. Returns a new array. */
export function orderMissions(missions) {
  return [...missions].sort(
    (a, b) =>
      a.tier - b.tier ||
      a.difficulty - b.difficulty ||
      a.complexity - b.complexity ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

function asSet(value) {
  return value instanceof Set ? value : new Set(value || []);
}

/** Has this player reached the rank, and met everything the mission assumes? */
export function isAvailable(mission, player) {
  if (mission.tier > player.tier) return false;
  const known = asSet(player.concepts);
  return mission.requires.every((concept) => known.has(concept));
}

/** Everything the player could start right now, in play order. */
export function availableMissions(missions, player) {
  const done = asSet(player.completed);
  return orderMissions(missions.filter((mission) => !done.has(mission.id) && isAvailable(mission, player)));
}

/** The gentlest thing they can actually do, or null. */
export function nextMission(missions, player) {
  return availableMissions(missions, player)[0] || null;
}

/** Everything the completed missions have taught. */
export function knownConcepts(missions, completedIds) {
  const done = asSet(completedIds);
  const known = new Set();
  for (const mission of missions) {
    if (!done.has(mission.id)) continue;
    for (const concept of mission.teaches) known.add(concept);
  }
  return known;
}

/**
 * Play the catalogue from nothing and see how far it gets.
 *
 * This is a BUILD-TIME validator, and its promotion rule is deliberately
 * stricter than the game's: here a tier opens only when every mission at or
 * below the current one is finished. In play, promotion will be mastery-based
 * and more forgiving.
 *
 * The strictness is the point. If a tier-1 mission depends on something taught
 * at tier 3, a lenient walk would quietly step over it and call the catalogue
 * healthy — leaving a real player with an unsolvable ticket in their queue for
 * three promotions. Refusing to advance surfaces the mis-tiering instead.
 *
 * @returns {{order: string[], unreachable: string[], known: string[], finalTier: number}}
 */
export function simulateProgression(missions) {
  const ordered = orderMissions(missions);
  const done = new Set();
  const known = new Set();
  const order = [];
  let tier = 1;

  let movedThisPass = true;
  while (movedThisPass) {
    movedThisPass = false;

    for (const mission of ordered) {
      if (done.has(mission.id)) continue;
      if (mission.tier > tier) continue;
      if (!mission.requires.every((concept) => known.has(concept))) continue;

      done.add(mission.id);
      for (const concept of mission.teaches) known.add(concept);
      order.push(mission.id);
      movedThisPass = true;
    }

    // Stuck? A promotion may open the next tier — but only once this one is clear.
    if (!movedThisPass && tier < MAX_TIER) {
      const currentTierFinished = ordered
        .filter((mission) => mission.tier <= tier)
        .every((mission) => done.has(mission.id));
      if (currentTierFinished) {
        tier++;
        movedThisPass = true;
      }
    }
  }

  return {
    order,
    unreachable: ordered.filter((mission) => !done.has(mission.id)).map((mission) => mission.id),
    known: [...known],
    finalTier: tier
  };
}
