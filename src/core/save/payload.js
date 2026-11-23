/**
 * Between the game and the save file.
 *
 * `toPayload` is trivial. `fromPayload` is where the care is, because a save
 * arriving here has been through places this code cannot see: a USB stick, a
 * OneDrive sync, a text editor, possibly a different build of the game. It is
 * treated as untrusted input and never allowed to throw — a save that crashes the
 * loader on a machine with no devtools is a save that has taken the whole game
 * with it.
 *
 * So every field is checked, anything unrecognisable is dropped, and each drop is
 * reported as a warning the player can read. Losing one closed ticket with an
 * explanation beats losing the save with a white screen.
 */

import { createProgress } from '../game/progress.js';
import { createDeck, BOX_COUNT } from '../srs/scheduler.js';
import { isKnownEventType, validateEvent } from '../world/events.js';
import { replayTolerant } from '../world/reduce.js';
import { createSeed } from '../world/seed.js';
import { isPlainObject, isFiniteNumber, isNonEmptyString } from '../validate.js';

/**
 * Caps on what a save may contain.
 *
 * A save is a file the player can edit, and nothing else bounds these arrays. The
 * limits are far above anything real play produces; they exist so that a damaged
 * or absurd file is truncated with an explanation rather than locking the one UI
 * thread for as long as it takes to replay it.
 */
const MAX_EVENTS = 20000;
const MAX_COMPLETED = 5000;
const MAX_CARDS = 5000;

/** Never a mission id or a card id, and dangerous as a map key. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function toPayload(state, seedVersion = 1) {
  return {
    seedVersion,
    progress: {
      completed: state.progress.completed.map((entry) => ({ missionId: entry.missionId, xp: entry.xp })),
      events: [...state.progress.events]
    },
    deck: {
      session: state.deck.session,
      cards: { ...state.deck.cards }
    }
  };
}

function readCompleted(raw, knownMissionIds, warn) {
  if (!Array.isArray(raw)) return [];
  const known = knownMissionIds ? new Set(knownMissionIds) : null;
  const seen = new Set();
  const out = [];

  if (raw.length > MAX_COMPLETED) {
    warn(`That save listed more than ${MAX_COMPLETED} closed tickets, so the rest were discarded.`);
  }

  for (const entry of raw.slice(0, MAX_COMPLETED)) {
    if (!isPlainObject(entry) || !isNonEmptyString(entry.missionId)) {
      warn('A closed ticket in the save was unreadable and has been skipped.');
      continue;
    }
    if (known && !known.has(entry.missionId)) {
      warn(`"${entry.missionId}" is not a ticket in this build any more, so it has been dropped.`);
      continue;
    }
    if (seen.has(entry.missionId)) continue;

    seen.add(entry.missionId);
    out.push({ missionId: entry.missionId, xp: isFiniteNumber(entry.xp) ? entry.xp : 0 });
  }

  return out;
}

/**
 * Events are checked in two passes, because there are two ways one can be wrong.
 *
 * Here: is it shaped like an event at all — known type, sane timestamp, a payload
 * its own definition accepts? Then, in `fromPayload`, does it actually apply to
 * the world? An event can pass the first and fail the second (it names a device
 * that no longer exists), and only the replay can tell.
 *
 * Checking the type alone — which is what this used to do — let a malformed
 * payload through to `reduceWorld`, which throws on every render, forever, from a
 * save that has already been written to disk.
 */
function readEvents(raw, warn) {
  if (!Array.isArray(raw)) return [];

  const out = [];
  let skipped = 0;

  for (const event of raw.slice(0, MAX_EVENTS)) {
    if (!isPlainObject(event) || !isNonEmptyString(event.type) || !isKnownEventType(event.type)) {
      skipped++;
      continue;
    }
    try {
      validateEvent(event);
    } catch {
      skipped++;
      continue;
    }
    out.push(event);
  }

  if (raw.length > MAX_EVENTS) {
    warn(`That save held more than ${MAX_EVENTS} events, so the oldest were kept and the rest discarded.`);
  }
  if (skipped > 0) {
    warn(`Skipped ${skipped} malformed or unrecognised ${skipped === 1 ? 'event' : 'events'} in that save.`);
  }

  return out;
}

function readDeck(raw, knownCardIds, warn) {
  const fresh = createDeck();
  if (!isPlainObject(raw)) return fresh;

  const known = knownCardIds ? new Set(knownCardIds) : null;
  const cards = {};

  if (isPlainObject(raw.cards)) {
    for (const [id, card] of Object.entries(raw.cards).slice(0, MAX_CARDS)) {
      if (!isPlainObject(card)) continue;
      // Rejected outright, with or without an allowlist: these are never card ids,
      // and one of them used as a map key rewrites the map's prototype.
      if (FORBIDDEN_KEYS.has(id)) continue;
      if (known && !known.has(id)) continue;

      const box = Number(card.box);
      cards[id] = {
        id,
        box: Number.isInteger(box) && box >= 1 && box <= BOX_COUNT ? box : 1,
        dueSession: isFiniteNumber(card.dueSession) ? card.dueSession : 1,
        lastAt: isFiniteNumber(card.lastAt) ? card.lastAt : 0,
        seen: isFiniteNumber(card.seen) ? card.seen : 0,
        correct: isFiniteNumber(card.correct) ? card.correct : 0,
        lapses: isFiniteNumber(card.lapses) ? card.lapses : 0
      };
    }
  }

  const session = Number(raw.session);
  if (!Number.isInteger(session) || session < 1) {
    warn('The session counter in the save was unreadable, so reviews restart from session one.');
  }

  return Object.freeze({
    session: Number.isInteger(session) && session >= 1 ? session : 1,
    cards: Object.freeze(cards)
  });
}

/**
 * Turn a save payload back into game state.
 *
 * @param payload  the `data` field of a save record
 * @param known    {missionIds?, cardIds?} — content that exists in THIS build.
 *                 Anything in the save that is not in the build is dropped, which
 *                 is how a save survives the content being edited underneath it.
 * @returns {{progress, deck, warnings: string[]}} — never throws
 */
export function fromPayload(payload, known = {}) {
  const warnings = [];
  const warn = (message) => {
    if (!warnings.includes(message)) warnings.push(message);
  };

  if (!isPlainObject(payload)) {
    return { progress: createProgress(), deck: createDeck(), warnings: ['That save had no data in it, so a new shift has been started.'] };
  }

  const rawProgress = isPlainObject(payload.progress) ? payload.progress : {};
  const wellFormed = readEvents(rawProgress.events, warn);

  // Second pass: an event can be perfectly well-formed and still fail to apply,
  // because it names a device or a user this build's world no longer has. Only a
  // replay can tell, so the log is replayed here and anything that will not apply
  // is dropped now — rather than throwing on every render for the rest of time.
  const replay = replayTolerant(createSeed(), wellFormed);
  if (replay.dropped.length > 0) {
    const count = replay.dropped.length;
    warn(
      `${count} saved ${count === 1 ? 'change does' : 'changes do'} not fit this version of the network ` +
        `and ${count === 1 ? 'was' : 'were'} left out. Your closed tickets are unaffected.`
    );
  }

  const progress = Object.freeze({
    completed: Object.freeze(readCompleted(rawProgress.completed, known.missionIds, warn)),
    events: Object.freeze(replay.events)
  });

  return { progress, deck: readDeck(payload.deck, known.cardIds, warn), warnings };
}
