import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, hashString } from '../../src/core/rng.js';

describe('hashString', () => {
  test('is deterministic', () => {
    assert.equal(hashString('meridian'), hashString('meridian'));
  });

  test('separates similar inputs', () => {
    assert.notEqual(hashString('host-01'), hashString('host-02'));
    assert.notEqual(hashString('ab'), hashString('ba'));
  });

  test('returns an unsigned 32-bit integer', () => {
    for (const input of ['', 'a', 'a much longer seed string — with unicode']) {
      const h = hashString(input);
      assert.ok(Number.isInteger(h), `${input} -> ${h}`);
      assert.ok(h >= 0 && h <= 0xffffffff);
    }
  });
});

describe('createRng — determinism', () => {
  test('same seed produces the same sequence', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    assert.deepEqual(seqA, seqB);
  });

  test('different seeds diverge', () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    assert.notDeepEqual(seqA, seqB);
  });

  test('accepts a string seed', () => {
    const a = createRng('meridian-logistics');
    const b = createRng('meridian-logistics');
    assert.equal(a.next(), b.next());
    assert.notEqual(createRng('site-a').next(), createRng('site-b').next());
  });
});

describe('createRng — next', () => {
  test('stays within [0, 1)', () => {
    const rng = createRng('range');
    for (let i = 0; i < 5000; i++) {
      const v = rng.next();
      assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
    }
  });

  test('is reasonably uniform across ten buckets', () => {
    const rng = createRng('uniform');
    const buckets = new Array(10).fill(0);
    const draws = 20000;
    for (let i = 0; i < draws; i++) buckets[Math.floor(rng.next() * 10)]++;
    for (const count of buckets) {
      assert.ok(Math.abs(count - draws / 10) < draws / 40, `skewed bucket: ${count}`);
    }
  });
});

describe('createRng — int', () => {
  test('respects inclusive bounds', () => {
    const rng = createRng('int');
    for (let i = 0; i < 2000; i++) {
      const v = rng.int(3, 7);
      assert.ok(Number.isInteger(v));
      assert.ok(v >= 3 && v <= 7, `out of bounds: ${v}`);
    }
  });

  test('reaches both endpoints', () => {
    const rng = createRng('endpoints');
    const seen = new Set();
    for (let i = 0; i < 2000; i++) seen.add(rng.int(1, 4));
    assert.deepEqual([...seen].sort(), [1, 2, 3, 4]);
  });

  test('handles a single-value range', () => {
    const rng = createRng('single');
    assert.equal(rng.int(5, 5), 5);
  });

  test('rejects an inverted range', () => {
    const rng = createRng('inverted');
    assert.throws(() => rng.int(9, 2), /range/i);
  });
});

describe('createRng — bool', () => {
  test('always true at probability 1, always false at 0', () => {
    const rng = createRng('bool');
    for (let i = 0; i < 100; i++) {
      assert.equal(rng.bool(1), true);
      assert.equal(rng.bool(0), false);
    }
  });

  test('approximates the requested probability', () => {
    const rng = createRng('bool-p');
    let hits = 0;
    for (let i = 0; i < 10000; i++) if (rng.bool(0.25)) hits++;
    assert.ok(Math.abs(hits - 2500) < 250, `got ${hits}`);
  });
});

describe('createRng — pick and sample', () => {
  const items = ['router', 'switch', 'firewall', 'dns', 'dhcp'];

  test('pick returns a member of the list', () => {
    const rng = createRng('pick');
    for (let i = 0; i < 200; i++) assert.ok(items.includes(rng.pick(items)));
  });

  test('pick throws on an empty list', () => {
    assert.throws(() => createRng('empty').pick([]), /empty/i);
  });

  test('sample returns n distinct members without mutating the source', () => {
    const rng = createRng('sample');
    const original = [...items];
    const got = rng.sample(items, 3);
    assert.equal(got.length, 3);
    assert.equal(new Set(got).size, 3);
    got.forEach((g) => assert.ok(items.includes(g)));
    assert.deepEqual(items, original, 'source array was mutated');
  });

  test('sample caps at the list length', () => {
    const rng = createRng('sample-cap');
    assert.equal(rng.sample(items, 99).length, items.length);
  });

  test('weighted respects the weights', () => {
    const rng = createRng('weighted');
    const counts = { common: 0, rare: 0 };
    for (let i = 0; i < 6000; i++) {
      counts[rng.weighted([['common', 9], ['rare', 1]])]++;
    }
    assert.ok(counts.common > counts.rare * 5, JSON.stringify(counts));
    assert.ok(counts.rare > 0);
  });
});

describe('createRng — shuffle', () => {
  const source = [1, 2, 3, 4, 5, 6, 7, 8];

  test('returns a new array and leaves the original untouched', () => {
    const rng = createRng('shuffle');
    const original = [...source];
    const shuffled = rng.shuffle(source);
    assert.notEqual(shuffled, source, 'returned the same array reference');
    assert.deepEqual(source, original, 'source array was mutated');
  });

  test('preserves every element', () => {
    const rng = createRng('shuffle-members');
    const shuffled = rng.shuffle(source);
    assert.deepEqual([...shuffled].sort((a, b) => a - b), source);
  });

  test('is deterministic for a given seed', () => {
    assert.deepEqual(
      createRng('deterministic').shuffle(source),
      createRng('deterministic').shuffle(source)
    );
  });

  test('actually reorders', () => {
    const rng = createRng('reorder');
    const long = Array.from({ length: 40 }, (_, i) => i);
    assert.notDeepEqual(rng.shuffle(long), long);
  });
});

describe('createRng — fork', () => {
  test('forks are deterministic by label', () => {
    const left = createRng('world').fork('logs');
    const right = createRng('world').fork('logs');
    assert.equal(left.next(), right.next());
  });

  test('different labels give different streams', () => {
    const base = createRng('world');
    assert.notEqual(base.fork('logs').next(), base.fork('net').next());
  });

  test('forking does not disturb the parent stream', () => {
    const parent = createRng('parent');
    const control = createRng('parent');
    parent.fork('anything');
    parent.fork('something else');
    assert.equal(parent.next(), control.next());
  });
});

describe('createRng — state', () => {
  test('state can be captured and restored mid-sequence', () => {
    const rng = createRng('stateful');
    for (let i = 0; i < 7; i++) rng.next();

    const snapshot = rng.state();
    const expected = Array.from({ length: 5 }, () => rng.next());

    const restored = createRng(0);
    restored.restore(snapshot);
    assert.deepEqual(Array.from({ length: 5 }, () => restored.next()), expected);
  });

  test('state is a plain serialisable integer', () => {
    const snapshot = createRng('serialise').state();
    assert.ok(Number.isInteger(snapshot));
    assert.equal(JSON.parse(JSON.stringify(snapshot)), snapshot);
  });
});
