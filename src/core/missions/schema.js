/**
 * What a mission is.
 *
 * A mission is DATA, validated at build time. The infrastructure it acts on is
 * fixed (see content/world/contract.js); a mission's job is to break something,
 * ask for something, or have you find something — always against that same board.
 *
 * Two fields carry the weight:
 *
 *   win(world, ctx)   the only definition of "done"
 *   solution(api)     a reference solution, executed headlessly by the test suite
 *
 * The solution is not optional. A mission without one cannot be checked, and an
 * unchecked mission rots the moment anything around it changes — it keeps
 * "passing" while teaching the wrong thing. The suite asserts both halves:
 * `win` is false before the solution runs and true after, which catches the
 * impossible mission and the accidentally-already-solved one in the same stroke.
 */

import { CONCEPTS } from '../../content/concepts.js';
import { check, isPlainObject, isNonEmptyString, requireInteger, requireOneOf, requireString } from '../validate.js';
import { simulateProgression } from './progression.js';

export const DOMAINS = ['networking', 'it', 'data', 'security'];

/**
 * What kind of ticket this is. The player sees it on the queue before they open
 * it, because knowing whether you are fixing, building or looking is half of
 * knowing where to start.
 */
export const KINDS = ['repair', 'build', 'investigate', 'audit', 'respond', 'drill'];

export const ENGINES = [
  'quiz', 'sort', 'subnet', 'terminal', 'topology',
  'sql', 'loghunt', 'phish', 'crypto', 'scenario', 'regex'
];

export const MIN_TIER = 1;
export const MAX_TIER = 5;
export const MIN_RATING = 1;
export const MAX_RATING = 5;

function requireConcepts(list, field, missionId) {
  check(Array.isArray(list), `${missionId}: ${field} must be an array`);
  for (const id of list) {
    check(
      Object.prototype.hasOwnProperty.call(CONCEPTS, id),
      `${missionId}: ${field} names "${id}", which is not in the concept vocabulary`
    );
  }
  return list;
}

/**
 * Check one mission. Throws a TypeError naming the offending field.
 * @returns the mission, so it can be used inline
 */
export function validateMission(mission) {
  check(isPlainObject(mission), 'a mission must be an object');

  const id = isNonEmptyString(mission.id) ? mission.id : '(mission with no id)';
  requireString(mission.id, `${id}: id`);
  requireString(mission.title, `${id}: title`);
  requireString(mission.brief, `${id}: brief`);
  requireString(mission.debrief, `${id}: debrief — the mission is over in a minute, the debrief is what stays`);
  requireOneOf(mission.domain, DOMAINS, `${id}: domain`);
  requireOneOf(mission.engine, ENGINES, `${id}: engine`);
  requireOneOf(mission.kind, KINDS, `${id}: kind`);
  requireInteger(mission.tier, `${id}: tier`, { min: MIN_TIER, max: MAX_TIER });
  requireInteger(mission.difficulty, `${id}: difficulty`, { min: MIN_RATING, max: MAX_RATING });
  requireInteger(mission.complexity, `${id}: complexity`, { min: MIN_RATING, max: MAX_RATING });
  requireInteger(mission.xp, `${id}: xp`, { min: 1 });

  check(
    mission.setup === undefined || typeof mission.setup === 'function',
    `${id}: setup must be a function returning the events that create the fault, or be left out entirely`
  );
  check(typeof mission.win === 'function', `${id}: win must be a function — it is the only definition of done`);
  check(
    typeof mission.solution === 'function',
    `${id}: solution must be a function — a mission with no reference solution cannot be checked, so it does not ship`
  );

  requireConcepts(mission.teaches, 'teaches', id);
  requireConcepts(mission.requires, 'requires', id);

  const hints = mission.hints === undefined ? [] : mission.hints;
  check(
    Array.isArray(hints) && hints.every(isNonEmptyString),
    `${id}: hints must be an array of non-empty strings`
  );

  const overlap = mission.requires.filter((concept) => mission.teaches.includes(concept));
  check(
    overlap.length === 0,
    `${id}: ${overlap.join(', ')} appears in both requires and teaches — a mission cannot assume what it introduces`
  );

  return mission;
}

/**
 * Check a whole catalogue: shapes, uniqueness, and — the part that matters —
 * whether every mission can actually be reached by a player starting from zero.
 *
 * @returns {{ok: boolean, problems: Array<{missionId: string, problem: string}>}}
 */
export function validateCatalog(missions) {
  const problems = [];
  const add = (missionId, problem) => problems.push({ missionId, problem });

  const seen = new Set();
  const wellFormed = [];

  for (const mission of missions) {
    const label = (mission && mission.id) || '(unnamed)';
    try {
      validateMission(mission);
      wellFormed.push(mission);
    } catch (error) {
      add(label, error.message);
      continue;
    }
    if (seen.has(mission.id)) add(mission.id, `duplicate mission id "${mission.id}"`);
    seen.add(mission.id);
  }

  const taught = new Set();
  for (const mission of wellFormed) {
    for (const concept of mission.teaches) taught.add(concept);
  }

  for (const mission of wellFormed) {
    for (const concept of mission.requires) {
      if (!taught.has(concept)) {
        add(mission.id, `requires "${concept}", which no mission teaches`);
      }
    }
  }

  // Only worth walking if the graph is sound enough to walk.
  if (problems.length === 0) {
    for (const missionId of simulateProgression(wellFormed).unreachable) {
      add(missionId, `unreachable — it never becomes available to a player starting from nothing`);
    }
  }

  return { ok: problems.length === 0, problems };
}
