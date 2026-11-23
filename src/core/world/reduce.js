/**
 * The world reducer.
 *
 *   world = reduceWorld(seed, events)
 *
 * That one line is the architecture. The seed is fixed authored data; everything
 * that has ever happened is an ordered log; the world is the fold of one over the
 * other. Replay is exact, saves are just the log, and undo is dropping the tail.
 *
 * Log order is the truth, not `at`. If two events disagree about time, the later
 * one in the log wins, and the clock only ever moves forward — a stale timestamp
 * can never rewind the world.
 *
 * The scratch layer is how a mission gets to experiment: it accumulates events
 * against a base world and is either committed or thrown away whole.
 */

import { setIn } from '../immutable.js';
import { getEventDefinition, validateEvent } from './events.js';

/**
 * Apply one event. Returns a new world; the input is untouched.
 * Throws if the event is malformed or its target does not exist.
 */
export function applyEvent(world, event) {
  validateEvent(event);
  const definition = getEventDefinition(event.type);
  const next = definition.apply(world, event.payload, event);
  return event.at > next.tick ? setIn(next, ['tick'], event.at) : next;
}

/**
 * Fold a whole log over a seed. An empty log returns the seed itself.
 * A failure names the offending index, because a 400-event log is otherwise
 * impossible to debug from a single error message.
 */
export function reduceWorld(seed, events) {
  if (!Array.isArray(events)) {
    throw new TypeError('reduceWorld: events must be an array');
  }
  return events.reduce((world, event, index) => {
    try {
      return applyEvent(world, event);
    } catch (cause) {
      const type = event && event.type ? event.type : 'unknown';
      throw new Error(
        `reduceWorld: event at index ${index} (${type}) failed — ${cause.message}`,
        { cause }
      );
    }
  }, seed);
}

/**
 * Replay a log, keeping only the events that actually apply.
 *
 * `reduceWorld` is strict on purpose: during play, an event that will not apply
 * is a bug and should say so loudly. But a log arriving from a save file has been
 * through a USB stick, a sync client and possibly a text editor, and it may name
 * a device that no longer exists or carry a payload that was valid in an older
 * build. Replaying that strictly throws on every render forever — the save is
 * already written, so reloading reproduces it, and the game is bricked.
 *
 * So the load path uses this instead. Every event that applies is kept, every one
 * that does not is dropped and reported, and the player is told what was lost
 * rather than being shown a crash panel they cannot get out of.
 *
 * @returns {{world: object, events: Array, dropped: Array<{index: number, type: string, reason: string}>}}
 */
export function replayTolerant(seed, events) {
  if (!Array.isArray(events)) {
    return { world: seed, events: [], dropped: [] };
  }

  let world = seed;
  const kept = [];
  const dropped = [];

  events.forEach((event, index) => {
    try {
      world = applyEvent(world, event);
      kept.push(event);
    } catch (error) {
      dropped.push({
        index,
        type: (event && event.type) || 'unknown',
        reason: String((error && error.message) || error)
      });
    }
  });

  return { world, events: kept, dropped };
}

/* ---------- scratch layer ---------- */

/**
 * Begin an uncommitted run of events against `base`.
 * @returns {{base: object, world: object, events: ReadonlyArray}}
 */
export function createScratch(base) {
  return Object.freeze({ base, world: base, events: Object.freeze([]) });
}

/**
 * Add one event to a scratch, returning a NEW scratch.
 * The event is applied first, so a rejected event leaves the scratch untouched.
 */
export function withEvent(scratch, event) {
  const world = applyEvent(scratch.world, event);
  return Object.freeze({
    base: scratch.base,
    world,
    events: Object.freeze([...scratch.events, event])
  });
}

/** Throw the run away and return to the base world. */
export function discardScratch(scratch) {
  return createScratch(scratch.base);
}

/**
 * Accept the run.
 * @returns {{world: object, events: Array}} the events to append to the canonical log
 */
export function commitScratch(scratch) {
  return { world: scratch.world, events: [...scratch.events] };
}
