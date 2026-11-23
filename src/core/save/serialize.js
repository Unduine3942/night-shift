/**
 * The save format.
 *
 * A save is the event log plus the player's progress — not a snapshot of the
 * world. Replaying the log over the seed reproduces the world exactly, which
 * makes saves small, diffable, and impossible to get subtly out of step with the
 * content.
 *
 * Every save carries a checksum over its canonicalised data. That is corruption
 * detection, not tamper-proofing: it catches a truncated download, a half-written
 * localStorage entry, or a file mangled by a mail filter. Someone determined to
 * edit their own save can recompute it, and that is fine — this is a study tool,
 * not a leaderboard. What matters is that a damaged save is *noticed* instead of
 * loading as silently wrong progress.
 */

import { hashString } from '../rng.js';
import { check, isPlainObject } from '../validate.js';

export const SAVE_FORMAT = 'nightshift-save';
export const SAVE_VERSION = 1;

/**
 * JSON with object keys sorted, recursively.
 *
 * Needed because the checksum must not depend on key order: a save that has been
 * through a parse/stringify cycle, or been rebuilt field by field, has to hash
 * the same. Array order is left alone — for the event log, order *is* the data.
 */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    return encoded === undefined ? 'null' : encoded;
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  const keys = Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

/** Short, printable, stable across key order. */
export function checksumOf(payload) {
  return hashString(canonicalJson(payload)).toString(36);
}

/**
 * A brand-new player's state.
 *
 * Rank and XP are deliberately absent: both are derived from the closed tickets
 * (see core/game/progress.js), and a save that stores a derived value is a save
 * that can contradict itself on somebody's USB stick, where nobody can fix it.
 */
export function emptyPayload(seedVersion = 1) {
  return {
    seedVersion,
    progress: { completed: [], events: [] },
    deck: { session: 1, cards: {} }
  };
}

/**
 * Wrap a payload into a save record.
 * The payload is deep-copied and canonicalised, so the caller keeps their object
 * and the checksum always matches what is stored.
 */
export function createSave(payload, meta = {}) {
  check(isPlainObject(payload), 'save payload must be an object');
  const data = JSON.parse(canonicalJson(payload));
  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    meta: { savedAt: null, origin: null, device: null, ...meta },
    checksum: checksumOf(data),
    data
  };
}

export function encodeSave(save) {
  return JSON.stringify(save);
}

/**
 * Is this thing loadable, and if not, why not — in words a player can act on.
 * @returns {{ok: boolean, reason?: string, warning?: string}}
 */
export function verifySave(save, options = {}) {
  if (!isPlainObject(save)) {
    return { ok: false, reason: 'A save must be a JSON object.' };
  }
  if (save.format !== SAVE_FORMAT) {
    return { ok: false, reason: 'That is not a Night Shift save.' };
  }
  if (!Number.isInteger(save.version)) {
    return { ok: false, reason: 'That save has no version number, so it cannot be read safely.' };
  }
  if (save.version > SAVE_VERSION) {
    return {
      ok: false,
      reason: `That save was written by a newer build of Night Shift (save version ${save.version}, this build reads ${SAVE_VERSION}).`
    };
  }
  if (!isPlainObject(save.data)) {
    return { ok: false, reason: 'That save has no data in it.' };
  }
  if (save.checksum !== checksumOf(save.data)) {
    if (options.allowChecksumMismatch) {
      return {
        ok: true,
        warning: 'The checksum does not match, so this save has been edited or damaged. Loading it anyway.'
      };
    }
    return {
      ok: false,
      reason: 'That save looks corrupted — its checksum does not match its contents.'
    };
  }
  return { ok: true };
}

/**
 * Parse text into a save. Never throws.
 * @returns {{ok: boolean, save?: object, error?: string, warning?: string, needsMigration?: boolean}}
 */
export function decodeSave(text, options = {}) {
  if (typeof text !== 'string' || text.trim() === '') {
    return { ok: false, error: 'There is nothing to load — the save is empty.' };
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      error: `That file is not valid JSON, so it is probably truncated or was mangled in transit. (${error.message})`
    };
  }

  const verdict = verifySave(parsed, options);
  if (!verdict.ok) {
    return { ok: false, error: verdict.reason };
  }

  return {
    ok: true,
    save: parsed,
    needsMigration: parsed.version < SAVE_VERSION,
    warning: verdict.warning
  };
}
