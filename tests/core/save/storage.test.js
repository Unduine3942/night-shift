/**
 * Redundant storage.
 *
 * The target machine runs a managed Edge with DefaultCookiesSetting = SessionOnly,
 * so browser storage may be wiped on exit and we have decided not to rely on
 * finding out. Everything here exists to make that not matter: write to every
 * place that will take it, keep the previous copy so one bad write cannot destroy
 * the last good one, and always keep an in-memory copy so saving never hard-fails
 * mid-session.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage } from '../../../src/core/save/storage.js';
import { createSave, encodeSave, emptyPayload } from '../../../src/core/save/serialize.js';

function fakeBackend({ failOnWrite = false, failOnRead = false } = {}) {
  const map = new Map();
  return {
    map,
    getItem(key) {
      if (failOnRead) throw new Error('read blocked by policy');
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      if (failOnWrite) throw new Error('QuotaExceededError');
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    }
  };
}

function tiers(map) {
  return Object.entries(map).map(([name, backend]) => ({
    name,
    get: () => {
      if (backend === null) throw new Error(`${name} is unavailable`);
      return backend;
    }
  }));
}

function saveWith(xp, savedAt) {
  const payload = emptyPayload();
  payload.progress.xp = xp;
  return createSave(payload, { savedAt, origin: 'file:///E:/NightShift.html' });
}

describe('writing spreads across every tier that will take it', () => {
  test('writes to all available tiers', () => {
    const local = fakeBackend();
    const session = fakeBackend();
    const storage = createStorage({ tiers: tiers({ local, session }) });

    const result = storage.write(saveWith(10, '2026-03-02T09:00:00.000Z'));

    assert.ok(result.written.includes('local'));
    assert.ok(result.written.includes('session'));
    assert.ok(result.written.includes('memory'), 'memory is always a tier');
    assert.deepEqual(result.failed, []);
  });

  test('a failing tier does not stop the others', () => {
    const local = fakeBackend({ failOnWrite: true });
    const session = fakeBackend();
    const storage = createStorage({ tiers: tiers({ local, session }) });

    const result = storage.write(saveWith(10, '2026-03-02T09:00:00.000Z'));

    assert.ok(!result.written.includes('local'));
    assert.ok(result.written.includes('session'));
    assert.equal(result.failed.length, 1);
    assert.equal(result.failed[0].tier, 'local');
    assert.match(result.failed[0].error, /quota/i);
  });

  test('an unavailable tier is skipped without throwing', () => {
    const storage = createStorage({ tiers: tiers({ local: null, session: fakeBackend() }) });
    assert.doesNotThrow(() => storage.write(saveWith(1, '2026-03-02T09:00:00.000Z')));
    assert.ok(storage.write(saveWith(1, '2026-03-02T09:00:00.000Z')).written.includes('session'));
  });

  test('saving still succeeds when every browser tier is gone', () => {
    const storage = createStorage({ tiers: tiers({ local: null, session: null }) });
    const result = storage.write(saveWith(7, '2026-03-02T09:00:00.000Z'));
    assert.deepEqual(result.written, ['memory']);
    assert.equal(storage.read().save.data.progress.xp, 7);
  });

  test('never throws, whatever the backend does', () => {
    const hostile = {
      getItem() { throw new Error('nope'); },
      setItem() { throw new Error('nope'); },
      removeItem() { throw new Error('nope'); }
    };
    const storage = createStorage({ tiers: tiers({ local: hostile }) });
    assert.doesNotThrow(() => storage.write(saveWith(1, '2026-03-02T09:00:00.000Z')));
    assert.doesNotThrow(() => storage.read());
    assert.doesNotThrow(() => storage.clear());
  });
});

describe('the previous copy is kept', () => {
  test('a second write rotates the first into the previous slot', () => {
    const local = fakeBackend();
    const storage = createStorage({ tiers: tiers({ local }) });

    storage.write(saveWith(10, '2026-03-02T09:00:00.000Z'));
    storage.write(saveWith(20, '2026-03-02T10:00:00.000Z'));

    const stored = [...local.map.values()].map((text) => JSON.parse(text).data.progress.xp);
    assert.ok(stored.includes(10), 'the older save should still be there');
    assert.ok(stored.includes(20));
  });

  test('a corrupted current copy falls back to the previous one', () => {
    const local = fakeBackend();
    const session = createStorage({ tiers: tiers({ local }) });

    session.write(saveWith(10, '2026-03-02T09:00:00.000Z'));
    session.write(saveWith(20, '2026-03-02T10:00:00.000Z'));

    for (const [key, value] of local.map) {
      if (value.includes('"xp":20')) local.map.set(key, value.slice(0, 40));
    }

    // A fresh page load: the in-memory copy is gone, so only disk is left.
    const result = createStorage({ tiers: tiers({ local }) }).read();

    assert.equal(result.ok, true);
    assert.equal(result.save.data.progress.xp, 10);
    assert.match(result.source, /previous/);
    assert.ok(result.warning, 'falling back should be reported, not silent');
  });

  test('the in-memory copy covers a corrupted disk copy within the same session', () => {
    const local = fakeBackend();
    const storage = createStorage({ tiers: tiers({ local }) });
    storage.write(saveWith(20, '2026-03-02T10:00:00.000Z'));

    for (const key of [...local.map.keys()]) {
      local.map.set(key, '{"format":"nightshift-save","versi');
    }

    const result = storage.read();
    assert.equal(result.ok, true);
    assert.equal(result.save.data.progress.xp, 20, 'memory should have carried it');
  });

  test('a half-written save does not destroy the last good one', () => {
    const local = fakeBackend();
    const first = createStorage({ tiers: tiers({ local }) });
    first.write(saveWith(10, '2026-03-02T09:00:00.000Z'));
    first.write(saveWith(20, '2026-03-02T10:00:00.000Z'));

    for (const [key, value] of local.map) {
      if (value.includes('"xp":20')) local.map.set(key, '{"format":"nightshift-save","versi');
    }

    const result = createStorage({ tiers: tiers({ local }) }).read();
    assert.equal(result.ok, true);
    assert.equal(result.save.data.progress.xp, 10);
  });
});

describe('reading picks the freshest valid copy', () => {
  test('prefers the newest save across tiers, not the first tier', () => {
    const local = fakeBackend();
    const session = fakeBackend();
    const storage = createStorage({ tiers: tiers({ local, session }) });

    local.map.set('nightshift.save.current', encodeSave(saveWith(5, '2026-03-01T09:00:00.000Z')));
    session.map.set('nightshift.save.current', encodeSave(saveWith(99, '2026-03-05T09:00:00.000Z')));

    const result = storage.read();
    assert.equal(result.save.data.progress.xp, 99);
    assert.match(result.source, /^session/);
  });

  test('reports honestly when there is nothing to read', () => {
    const storage = createStorage({ tiers: tiers({ local: fakeBackend() }) });
    const result = storage.read();
    assert.equal(result.ok, false);
    assert.match(result.error, /no .*save/i);
  });

  test('ignores a tier that cannot be read and uses one that can', () => {
    const local = fakeBackend({ failOnRead: true });
    const session = fakeBackend();
    const storage = createStorage({ tiers: tiers({ local, session }) });
    session.map.set('nightshift.save.current', encodeSave(saveWith(33, '2026-03-02T09:00:00.000Z')));

    const result = storage.read();
    assert.equal(result.ok, true);
    assert.equal(result.save.data.progress.xp, 33);
  });

  test('skips entries that are not ours', () => {
    const local = fakeBackend();
    local.map.set('nightshift.save.current', JSON.stringify({ something: 'else' }));
    const storage = createStorage({ tiers: tiers({ local }) });
    assert.equal(storage.read().ok, false);
  });
});

describe('status and clear', () => {
  test('status says which tiers are usable, for the UI to warn about', () => {
    const storage = createStorage({ tiers: tiers({ local: null, session: fakeBackend() }) });
    const status = storage.status();

    const local = status.find((tier) => tier.name === 'local');
    const session = status.find((tier) => tier.name === 'session');

    assert.equal(local.available, false);
    assert.ok(local.error);
    assert.equal(session.available, true);
    assert.equal(status.find((tier) => tier.name === 'memory').available, true);
  });

  test('status reports whether anything durable is available at all', () => {
    const none = createStorage({ tiers: tiers({ local: null, session: null }) });
    assert.equal(none.durable(), false);

    const some = createStorage({ tiers: tiers({ local: fakeBackend() }) });
    assert.equal(some.durable(), true);
  });

  test('clear empties every tier', () => {
    const local = fakeBackend();
    const session = fakeBackend();
    const storage = createStorage({ tiers: tiers({ local, session }) });

    storage.write(saveWith(10, '2026-03-02T09:00:00.000Z'));
    storage.clear();

    assert.equal(local.map.size, 0);
    assert.equal(session.map.size, 0);
    assert.equal(storage.read().ok, false);
  });
});

describe('the in-memory tier', () => {
  test('survives within the session even with no browser storage', () => {
    const storage = createStorage({ tiers: tiers({ local: null }) });
    storage.write(saveWith(3, '2026-03-02T09:00:00.000Z'));
    storage.write(saveWith(4, '2026-03-02T09:30:00.000Z'));
    assert.equal(storage.read().save.data.progress.xp, 4);
  });

  test('is separate per storage instance, like a page reload', () => {
    const first = createStorage({ tiers: tiers({ local: null }) });
    first.write(saveWith(3, '2026-03-02T09:00:00.000Z'));
    const second = createStorage({ tiers: tiers({ local: null }) });
    assert.equal(second.read().ok, false);
  });
});
