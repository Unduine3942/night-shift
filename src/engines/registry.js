/**
 * Which engines this build actually has.
 *
 * The mission schema knows every engine the game will ever have; this file knows
 * the ones that exist today. The ticket queue offers a mission only when its
 * engine is registered here, so a mission written ahead of its engine sits in the
 * catalogue — validated, reference-solved, counted — and simply is not handed to
 * the player yet.
 *
 * That is the alternative to the two bad options: writing missions blind against
 * an engine that does not exist, or shipping a ticket that opens onto nothing.
 */

import quiz from './quiz.js';
import sort from './sort.js';
import subnet from './subnet.js';
import terminal from './terminal.js';

const LIST = [quiz, sort, subnet, terminal];

export const ENGINE_REGISTRY = Object.fromEntries(LIST.map((engine) => [engine.id, engine]));

export const IMPLEMENTED_ENGINES = LIST.map((engine) => engine.id);

export function getEngine(id) {
  return ENGINE_REGISTRY[id] || null;
}

/**
 * Which window a mission is worked in.
 *
 * Declared by the engine rather than decided by the desktop, so adding an engine
 * is one file and not two — and so a mission can never end up routed to a window
 * that has no way to render it.
 */
export const SURFACES = ['mail', 'training'];

export function surfaceOf(mission) {
  const engine = ENGINE_REGISTRY[mission.engine];
  return engine ? engine.surface : null;
}

export function isPlayable(mission) {
  return Boolean(ENGINE_REGISTRY[mission.engine]);
}

/** Split a catalogue into what can be played now and what is waiting on an engine. */
export function partitionByEngine(missions) {
  const playable = [];
  const pending = [];
  for (const mission of missions) {
    (isPlayable(mission) ? playable : pending).push(mission);
  }
  return { playable, pending };
}

/** Split the playable missions by the window they are worked in. */
export function partitionBySurface(missions) {
  const bySurface = Object.fromEntries(SURFACES.map((surface) => [surface, []]));
  for (const mission of missions) {
    const surface = surfaceOf(mission);
    if (surface && bySurface[surface]) bySurface[surface].push(mission);
  }
  return bySurface;
}
