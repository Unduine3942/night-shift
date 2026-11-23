/**
 * Seeded pseudo-random number generator.
 *
 * Nothing in the game may call Math.random(). Every procedural thing the player
 * sees — a subnet to carve up, a log stream to hunt through, the order of a quiz
 * round — has to be reproducible from a seed, otherwise a mission cannot be
 * replayed, shared, or tested.
 *
 * The generator is the one deliberately stateful primitive in core/. Its state is
 * a single 32-bit integer so it serialises straight into a save file. Every method
 * that returns a collection returns a NEW array and never touches its input.
 */

const UINT32 = 0x100000000;

/** FNV-1a. Turns any string into a stable unsigned 32-bit seed. */
export function hashString(input) {
  const text = String(input);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function toSeed(seed) {
  return typeof seed === 'number' && Number.isFinite(seed) ? seed >>> 0 : hashString(seed);
}

function assertFinite(value, label) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`rng: ${label} must be a finite number, got ${value}`);
  }
}

/**
 * @param {number|string} seed
 * @returns {object} a generator; see the methods below
 */
export function createRng(seed) {
  let state = toSeed(seed);

  const rng = {
    /** Float in [0, 1). mulberry32. */
    next() {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / UINT32;
    },

    /** Integer in [min, max], both ends inclusive. */
    int(min, max) {
      assertFinite(min, 'min');
      assertFinite(max, 'max');
      if (max < min) {
        throw new RangeError(`rng: int range ${min}..${max} is inverted`);
      }
      return min + Math.floor(rng.next() * (max - min + 1));
    },

    /** True with probability p. */
    bool(probability = 0.5) {
      return rng.next() < probability;
    },

    /** One member of the list. */
    pick(list) {
      if (!Array.isArray(list) || list.length === 0) {
        throw new RangeError('rng: pick was given an empty list');
      }
      return list[rng.int(0, list.length - 1)];
    },

    /** New array of up to `count` distinct members. Source is untouched. */
    sample(list, count) {
      const pool = rng.shuffle(list);
      const take = Math.max(0, Math.min(Math.trunc(count), pool.length));
      return pool.slice(0, take);
    },

    /**
     * One member, chosen by weight.
     * @param {Array<[any, number]>} entries e.g. [['common', 9], ['rare', 1]]
     */
    weighted(entries) {
      if (!Array.isArray(entries) || entries.length === 0) {
        throw new RangeError('rng: weighted was given no entries');
      }
      const total = entries.reduce((sum, [, weight]) => sum + Math.max(0, weight), 0);
      if (total <= 0) {
        throw new RangeError('rng: weighted needs a positive total weight');
      }
      let roll = rng.next() * total;
      for (const [item, weight] of entries) {
        roll -= Math.max(0, weight);
        if (roll < 0) return item;
      }
      return entries[entries.length - 1][0];
    },

    /** New shuffled array. Source is untouched. */
    shuffle(list) {
      const out = [...list];
      for (let i = out.length - 1; i > 0; i--) {
        const j = rng.int(0, i);
        const held = out[i];
        out[i] = out[j];
        out[j] = held;
      }
      return out;
    },

    /**
     * An independent generator derived from this one's ORIGINAL seed plus a label.
     * Deterministic, and it does not advance this generator — so the log stream can
     * draw a thousand numbers without changing which subnet a mission hands you.
     */
    fork(label) {
      return createRng(hashString(`${seed}::${label}`));
    },

    /** Serialisable snapshot of the current position in the sequence. */
    state() {
      return state >>> 0;
    },

    /** Resume from a snapshot. Returns this generator for chaining. */
    restore(snapshot) {
      assertFinite(snapshot, 'snapshot');
      state = snapshot | 0;
      return rng;
    }
  };

  return rng;
}
