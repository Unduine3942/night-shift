/**
 * Redundant browser storage — the ONE file in core/ allowed to touch browser
 * globals. Everything else stays pure and node-testable.
 *
 * The target machine runs a managed Edge with `DefaultCookiesSetting = SessionOnly`,
 * so site data may be wiped whenever the browser closes, and we have decided not
 * to depend on finding out whether it is. So this does not try to be clever about
 * where progress lives; it puts it everywhere at once:
 *
 *   local    localStorage — survives a reload, probably survives a restart
 *   session  sessionStorage — survives a reload even if localStorage is blocked
 *   memory   always works, always available, gone when the tab closes
 *
 * Two more properties matter as much as the tiers:
 *
 *   - Each tier keeps the PREVIOUS save alongside the current one. A save
 *     interrupted halfway cannot destroy the last good one.
 *   - Reading gathers every valid copy and picks the newest by `savedAt`, rather
 *     than trusting one location. A stale localStorage cannot shadow a fresh
 *     sessionStorage.
 *
 * None of this replaces exporting a save file, which is the only genuinely
 * durable copy. It buys the time between exports.
 */

import { encodeSave, decodeSave } from './serialize.js';

const DEFAULT_NAMESPACE = 'nightshift.save';

/** Reading `window.localStorage` can itself throw when site data is blocked. */
const BROWSER_TIERS = [
  { name: 'local', get: () => window.localStorage },
  { name: 'session', get: () => window.sessionStorage }
];

function createMemoryBackend() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key)
  };
}

function describeError(error) {
  return String((error && error.message) || error || 'unavailable');
}

/**
 * @param {{tiers?: Array<{name: string, get: function}>, namespace?: string}} [options]
 *        `tiers` is injectable so tests can drive hostile backends without a DOM.
 *        `namespace` lets the in-app self test exercise real browser storage
 *        without ever touching the player's actual save.
 */
export function createStorage(options = {}) {
  const configured = options.tiers || BROWSER_TIERS;
  const namespace = options.namespace || DEFAULT_NAMESPACE;
  const CURRENT_KEY = `${namespace}.current`;
  const PREVIOUS_KEY = `${namespace}.previous`;
  const SLOTS = [
    ['current', CURRENT_KEY],
    ['previous', PREVIOUS_KEY]
  ];
  const memory = createMemoryBackend();
  const tiers = [...configured, { name: 'memory', get: () => memory }];

  /** @returns {{backend: object|null, error: string|null}} */
  function resolve(tier) {
    try {
      const backend = tier.get();
      return backend ? { backend, error: null } : { backend: null, error: 'unavailable' };
    } catch (error) {
      return { backend: null, error: describeError(error) };
    }
  }

  return {
    /**
     * Write to every tier that will accept it.
     * @returns {{written: string[], failed: Array<{tier: string, error: string}>}}
     */
    write(save) {
      const written = [];
      const failed = [];
      let text;

      try {
        text = encodeSave(save);
      } catch (error) {
        return { written, failed: [{ tier: 'encode', error: describeError(error) }] };
      }

      for (const tier of tiers) {
        const { backend, error } = resolve(tier);
        if (!backend) {
          failed.push({ tier: tier.name, error });
          continue;
        }
        try {
          // Rotate first: if the write below dies halfway, the old save is safe.
          const existing = backend.getItem(CURRENT_KEY);
          if (existing) backend.setItem(PREVIOUS_KEY, existing);
          backend.setItem(CURRENT_KEY, text);
          written.push(tier.name);
        } catch (writeError) {
          failed.push({ tier: tier.name, error: describeError(writeError) });
        }
      }

      return { written, failed };
    },

    /**
     * The newest valid save from anywhere.
     * @returns {{ok: boolean, save?: object, source?: string, warning?: string, error?: string}}
     */
    read() {
      const candidates = [];

      for (const tier of tiers) {
        const { backend } = resolve(tier);
        if (!backend) continue;

        for (const [slot, key] of SLOTS) {
          let text;
          try {
            text = backend.getItem(key);
          } catch {
            continue;
          }
          if (!text) continue;

          const decoded = decodeSave(text);
          if (!decoded.ok) continue;

          candidates.push({
            save: decoded.save,
            slot,
            source: `${tier.name}:${slot}`,
            savedAt: (decoded.save.meta && decoded.save.meta.savedAt) || ''
          });
        }
      }

      if (candidates.length === 0) {
        return { ok: false, error: 'No saved progress was found in this browser.' };
      }

      // Newest first. Array.sort is stable, so ties keep tier order.
      candidates.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
      const best = candidates[0];

      return {
        ok: true,
        save: best.save,
        source: best.source,
        warning:
          best.slot === 'previous'
            ? 'The most recent save was unreadable, so the one before it was loaded. A little progress may be missing.'
            : undefined
      };
    },

    /** Which tiers can be used, for the UI to warn about honestly. */
    status() {
      return tiers.map((tier) => {
        const { backend, error } = resolve(tier);
        return { name: tier.name, available: Boolean(backend), error };
      });
    },

    /** Is anything other than memory available? If not, progress dies with the tab. */
    durable() {
      return this.status().some((tier) => tier.name !== 'memory' && tier.available);
    },

    clear() {
      for (const tier of tiers) {
        const { backend } = resolve(tier);
        if (!backend) continue;
        for (const [, key] of SLOTS) {
          try {
            backend.removeItem(key);
          } catch {
            /* a tier that will not clear is not worth failing over */
          }
        }
      }
    }
  };
}
