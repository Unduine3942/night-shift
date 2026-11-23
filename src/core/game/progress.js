/**
 * What the player has done, and everything derived from it.
 *
 * The save records only what HAPPENED: the tickets closed and the events they
 * produced. Rank, XP, known concepts and what is available next are all computed
 * from that, every time they are asked for.
 *
 * The alternative — storing the rank beside the tickets that earned it — lets the
 * two disagree. On a normal app that is a bug you patch. Here the save is on
 * somebody's USB stick and there is no way to reach it, so a save that
 * contradicts itself is permanent. Deriving costs microseconds and removes the
 * whole category.
 *
 * It also means re-tuning content retroactively fixes old saves. If a mission's
 * `teaches` list is corrected, every save that closed that mission picks up the
 * correction the next time it is opened.
 */

import { knownConcepts, MAX_TIER } from '../missions/progression.js';

/** How much of a tier must be cleared before the next one opens. */
export const PROMOTION_RATIO = 0.75;

export function createProgress() {
  return Object.freeze({ completed: Object.freeze([]), events: Object.freeze([]) });
}

export function isCompleted(progress, missionId) {
  return progress.completed.some((entry) => entry.missionId === missionId);
}

/**
 * Close a ticket.
 *
 * A mission already closed is ignored rather than appended again — otherwise a
 * replayed ticket pays out twice, and a save that has been imported on two
 * machines double-counts everything.
 */
export function recordCompletion(progress, result) {
  if (isCompleted(progress, result.missionId)) return progress;

  return Object.freeze({
    completed: Object.freeze([
      ...progress.completed,
      { missionId: result.missionId, xp: result.xp }
    ]),
    events: Object.freeze([...progress.events, ...(result.events || [])])
  });
}

export function totalXp(progress) {
  return progress.completed.reduce((sum, entry) => sum + entry.xp, 0);
}

/**
 * Rank.
 *
 * Promotion is earned by clearing most of the work at your current rank, not by
 * crossing an XP number. XP numbers need tuning every time content is added;
 * a ratio of the tier does not, and it cannot strand a player behind a threshold
 * the available missions cannot reach.
 *
 * A tier with no missions in it is skipped rather than treated as unfinished,
 * so a gap in the catalogue is a gap and not a wall.
 */
export function tierOf(progress, missions) {
  const closed = new Set(progress.completed.map((entry) => entry.missionId));
  let tier = 1;

  while (tier < MAX_TIER) {
    const above = missions.some((mission) => mission.tier > tier);
    if (!above) break;

    const atTier = missions.filter((mission) => mission.tier === tier);
    if (atTier.length > 0) {
      const cleared = atTier.filter((mission) => closed.has(mission.id)).length;
      if (cleared / atTier.length < PROMOTION_RATIO) break;
    }

    tier++;
  }

  return tier;
}

/** The shape `availableMissions` and `isAvailable` expect. */
export function playerOf(progress, missions) {
  const completed = progress.completed.map((entry) => entry.missionId);
  return {
    tier: tierOf(progress, missions),
    concepts: knownConcepts(missions, completed),
    completed
  };
}

/** A summary for the HUD. */
export function progressStats(progress, missions) {
  const tier = tierOf(progress, missions);
  const closed = new Set(progress.completed.map((entry) => entry.missionId));
  const atTier = missions.filter((mission) => mission.tier === tier);

  return {
    tier,
    xp: totalXp(progress),
    completed: progress.completed.length,
    total: missions.length,
    tierCompleted: atTier.filter((mission) => closed.has(mission.id)).length,
    tierTotal: atTier.length
  };
}
