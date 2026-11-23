/**
 * Saving, and the honesty around it.
 *
 * Progress is written to every storage tier that will take it after every closed
 * ticket and every review — there is no save button to forget. But the target
 * machine wipes site data when the browser closes, so none of that is durable,
 * and the UI has to say so rather than imply a safety that is not there.
 *
 * `describeDurability` is what the HUD shows. It is allowed to say "this will be
 * gone when you close the browser", because that is true and actionable — export
 * the file — whereas a reassuring green tick would be a lie that costs somebody
 * an evening's work.
 */

import { createSave } from '../core/save/serialize.js';
import { toPayload, fromPayload } from '../core/save/payload.js';
import { createStorage } from '../core/save/storage.js';
import { SEED_VERSION } from '../core/world/seed.js';

function nowIso() {
  return new Date().toISOString();
}

function origin() {
  try {
    return location.href;
  } catch {
    return null;
  }
}

/**
 * @param known {missionIds, cardIds} — the content this build has, so a save
 *              written against different content loads as much as it can.
 */
export function createPersistence(known = {}, options = {}) {
  const storage = options.storage || createStorage(options.storageOptions);

  /**
   * What the last write actually achieved.
   *
   * Asking storage whether it is *readable* is not the same as knowing a write
   * succeeded — a tier can hand back an object and then throw on setItem, under
   * a quota or a policy. Reporting "saved in this browser" in that case is the
   * precise failure this module exists to avoid, so the durability notice is
   * based on what happened, not on what should have.
   */
  let lastWrite = null;

  return {
    storage,

    /** Build the save record for the current state, without writing it. */
    snapshot(state) {
      return createSave(toPayload(state, SEED_VERSION), {
        savedAt: nowIso(),
        origin: origin(),
        device: 'night-shift'
      });
    },

    /** Write everywhere that will take it. Never throws. */
    write(state) {
      try {
        lastWrite = storage.write(this.snapshot(state));
      } catch (error) {
        lastWrite = { written: [], failed: [{ tier: 'snapshot', error: String((error && error.message) || error) }] };
      }
      return lastWrite;
    },

    /**
     * @returns {{found: boolean, progress?, deck?, warnings: string[], source?: string}}
     */
    load() {
      let result;
      try {
        result = storage.read();
      } catch (error) {
        return { found: false, warnings: [`Stored progress could not be read (${error}).`] };
      }

      if (!result.ok) return { found: false, warnings: [] };

      const loaded = fromPayload(result.save.data, known);
      return {
        found: true,
        progress: loaded.progress,
        deck: loaded.deck,
        source: result.source,
        warnings: result.warning ? [result.warning, ...loaded.warnings] : loaded.warnings
      };
    },

    /** Adopt a save that arrived from a file or the clipboard. */
    adopt(save) {
      const loaded = fromPayload(save.data, known);
      return { progress: loaded.progress, deck: loaded.deck, warnings: loaded.warnings };
    },

    clear() {
      try {
        storage.clear();
      } catch {
        /* a tier that will not clear is not worth failing over */
      }
    },

    /** One sentence for the HUD. Says what is true, including when it is bad news. */
    describeDurability() {
      let tiers;
      try {
        tiers = storage.status();
      } catch {
        return { level: 'none', text: 'Progress is being kept in memory only — export a save before you close this tab.' };
      }

      // Once a write has been attempted, believe it over the status check. A tier
      // can be readable and still refuse every write.
      const usable = lastWrite
        ? lastWrite.written
        : tiers.filter((tier) => tier.available).map((tier) => tier.name);

      if (lastWrite && lastWrite.failed.length > 0 && !usable.includes('local') && !usable.includes('session')) {
        return {
          level: 'none',
          text: 'This browser is refusing to save — progress is in memory only. Export a save before you close this tab.'
        };
      }

      if (usable.includes('local')) {
        return { level: 'browser', text: 'Progress is saved in this browser. Export a file to move it anywhere else.' };
      }
      if (usable.includes('session')) {
        return { level: 'session', text: 'This browser will only keep progress until the tab closes. Export a save before you finish.' };
      }
      return { level: 'none', text: 'Progress is being kept in memory only — export a save before you close this tab.' };
    }
  };
}
