import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getIn, setIn, updateIn, removeIn, pushIn, deepFreeze } from '../../src/core/immutable.js';

const sample = () => ({
  net: { devices: { 'rtr-1': { name: 'rtr-1', up: true }, 'sw-1': { name: 'sw-1', up: true } } },
  identity: { users: { 'u-1': { name: 'Dana', groups: ['staff'] } } },
  tick: 0
});

describe('getIn', () => {
  test('reads a nested value', () => {
    assert.equal(getIn(sample(), ['net', 'devices', 'rtr-1', 'name']), 'rtr-1');
  });

  test('returns the fallback for a missing path', () => {
    assert.equal(getIn(sample(), ['net', 'devices', 'nope', 'name'], 'absent'), 'absent');
    assert.equal(getIn(sample(), ['nothing', 'here'], null), null);
  });

  test('returns the fallback rather than undefined', () => {
    assert.equal(getIn({ a: undefined }, ['a'], 'fallback'), 'fallback');
  });

  test('reads through arrays by index', () => {
    assert.equal(getIn(sample(), ['identity', 'users', 'u-1', 'groups', 0]), 'staff');
  });

  test('an empty path returns the target itself', () => {
    const world = sample();
    assert.equal(getIn(world, []), world);
  });
});

describe('setIn', () => {
  test('does not mutate the original, at any depth', () => {
    const original = sample();
    const snapshot = JSON.parse(JSON.stringify(original));
    setIn(original, ['net', 'devices', 'rtr-1', 'up'], false);
    assert.deepEqual(original, snapshot);
  });

  test('returns a new object with the change applied', () => {
    const original = sample();
    const next = setIn(original, ['net', 'devices', 'rtr-1', 'up'], false);
    assert.notEqual(next, original);
    assert.equal(getIn(next, ['net', 'devices', 'rtr-1', 'up']), false);
  });

  test('shares every branch it did not touch', () => {
    const original = sample();
    const next = setIn(original, ['net', 'devices', 'rtr-1', 'up'], false);
    assert.equal(next.identity, original.identity, 'identity branch should be shared');
    assert.equal(
      next.net.devices['sw-1'],
      original.net.devices['sw-1'],
      'untouched sibling device should be shared'
    );
    assert.notEqual(next.net.devices['rtr-1'], original.net.devices['rtr-1']);
  });

  test('writes into arrays by index without mutating them', () => {
    const original = sample();
    const next = setIn(original, ['identity', 'users', 'u-1', 'groups', 0], 'admins');
    assert.deepEqual(getIn(next, ['identity', 'users', 'u-1', 'groups']), ['admins']);
    assert.deepEqual(getIn(original, ['identity', 'users', 'u-1', 'groups']), ['staff']);
    assert.ok(Array.isArray(getIn(next, ['identity', 'users', 'u-1', 'groups'])));
  });

  test('creates missing intermediate objects', () => {
    const next = setIn({}, ['net', 'dns', 'records'], []);
    assert.deepEqual(next, { net: { dns: { records: [] } } });
  });

  test('creates an array when the next key is a number', () => {
    const next = setIn({}, ['list', 0], 'first');
    assert.ok(Array.isArray(next.list));
    assert.equal(next.list[0], 'first');
  });

  test('an empty path replaces the whole target', () => {
    assert.equal(setIn({ a: 1 }, [], 'replaced'), 'replaced');
  });

  test('rejects a non-array path', () => {
    assert.throws(() => setIn({}, 'net.devices', 1), /path/i);
  });
});

describe('updateIn', () => {
  test('applies a function to the current value', () => {
    const next = updateIn(sample(), ['tick'], (t) => t + 60);
    assert.equal(next.tick, 60);
  });

  test('passes undefined for a missing path', () => {
    let seen = 'unset';
    updateIn({}, ['a', 'b'], (value) => {
      seen = value;
      return 1;
    });
    assert.equal(seen, undefined);
  });

  test('leaves the original untouched', () => {
    const original = sample();
    updateIn(original, ['tick'], (t) => t + 1);
    assert.equal(original.tick, 0);
  });
});

describe('removeIn', () => {
  test('deletes an object key and leaves the original alone', () => {
    const original = sample();
    const next = removeIn(original, ['net', 'devices', 'sw-1']);
    assert.deepEqual(Object.keys(next.net.devices), ['rtr-1']);
    assert.deepEqual(Object.keys(original.net.devices), ['rtr-1', 'sw-1']);
  });

  test('removes an array element by index', () => {
    const world = { list: ['a', 'b', 'c'] };
    assert.deepEqual(removeIn(world, ['list', 1]).list, ['a', 'c']);
    assert.deepEqual(world.list, ['a', 'b', 'c']);
  });

  test('returns the target unchanged when the path is missing', () => {
    const original = sample();
    assert.equal(removeIn(original, ['net', 'devices', 'ghost']), original);
    assert.equal(removeIn(original, ['list', 9]), original);
  });

  test('shares untouched branches', () => {
    const original = sample();
    const next = removeIn(original, ['net', 'devices', 'sw-1']);
    assert.equal(next.identity, original.identity);
  });
});

describe('pushIn', () => {
  test('appends to a nested array immutably', () => {
    const original = sample();
    const next = pushIn(original, ['identity', 'users', 'u-1', 'groups'], 'vpn');
    assert.deepEqual(getIn(next, ['identity', 'users', 'u-1', 'groups']), ['staff', 'vpn']);
    assert.deepEqual(getIn(original, ['identity', 'users', 'u-1', 'groups']), ['staff']);
  });

  test('appends several items at once', () => {
    assert.deepEqual(pushIn({ list: [1] }, ['list'], 2, 3).list, [1, 2, 3]);
  });

  test('treats a missing path as an empty array', () => {
    assert.deepEqual(pushIn({}, ['events'], 'first').events, ['first']);
  });

  test('rejects pushing onto a non-array', () => {
    assert.throws(() => pushIn({ a: 5 }, ['a'], 1), /array/i);
  });
});

describe('deepFreeze', () => {
  test('freezes every level', () => {
    const frozen = deepFreeze(sample());
    assert.ok(Object.isFrozen(frozen));
    assert.ok(Object.isFrozen(frozen.net));
    assert.ok(Object.isFrozen(frozen.net.devices['rtr-1']));
    assert.ok(Object.isFrozen(frozen.identity.users['u-1'].groups));
  });

  test('a frozen world rejects writes in strict mode', () => {
    const frozen = deepFreeze(sample());
    assert.throws(() => {
      frozen.tick = 99;
    }, TypeError);
  });

  test('setIn still works against a frozen world', () => {
    const frozen = deepFreeze(sample());
    const next = setIn(frozen, ['tick'], 120);
    assert.equal(next.tick, 120);
    assert.equal(frozen.tick, 0);
  });

  test('tolerates cycles and primitives', () => {
    const cyclic = { name: 'loop' };
    cyclic.self = cyclic;
    assert.doesNotThrow(() => deepFreeze(cyclic));
    assert.equal(deepFreeze(42), 42);
    assert.equal(deepFreeze(null), null);
  });
});

/**
 * Paths into the world are built from event payloads, and event payloads arrive
 * in save files that have been through a USB stick and possibly a text editor.
 * Two keys used to get through: `toString`, which made a truthiness check find an
 * inherited method and conclude a device existed, and `__proto__`, which made
 * `setIn` rewrite the prototype of the branch it was writing into.
 */
describe('keys that are not data', () => {
  test('getIn reads own properties only', () => {
    assert.equal(getIn({}, ['toString']), undefined);
    assert.equal(getIn({}, ['constructor']), undefined);
    assert.equal(getIn({ net: { devices: {} } }, ['net', 'devices', 'toString']), undefined);
  });

  test('getIn still reads real data, including array indices and length', () => {
    assert.equal(getIn({ a: { b: 1 } }, ['a', 'b']), 1);
    assert.equal(getIn({ list: [10, 20] }, ['list', 1]), 20);
    assert.equal(getIn({ list: [10, 20] }, ['list', 'length']), 2);
  });

  test('getIn returns the fallback for an inherited key rather than the inherited value', () => {
    assert.equal(getIn({}, ['toString'], 'missing'), 'missing');
  });

  test('setIn refuses to write a key that would move a prototype', () => {
    assert.throws(() => setIn({}, ['__proto__', 'polluted'], true), /not a writable key/);
    assert.throws(() => setIn({}, ['constructor'], 1), /not a writable key/);
    assert.throws(() => setIn({ a: {} }, ['a', 'prototype'], 1), /not a writable key/);
  });

  test('and nothing leaks into Object.prototype either way', () => {
    try {
      setIn({}, ['__proto__', 'polluted'], true);
    } catch {
      /* expected */
    }
    assert.equal({}.polluted, undefined);
  });
});
