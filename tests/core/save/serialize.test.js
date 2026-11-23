import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  SAVE_FORMAT,
  SAVE_VERSION,
  canonicalJson,
  checksumOf,
  createSave,
  encodeSave,
  decodeSave,
  verifySave,
  emptyPayload
} from '../../../src/core/save/serialize.js';

const payload = () => ({
  seedVersion: 1,
  events: [{ type: 'world/tick', at: 60, payload: {} }],
  progress: { xp: 120, tier: 1, streak: 3, completed: ['m-001'] },
  srs: { boxes: { 'c-osi-layers': 2 } },
  rngState: 42
});

const meta = () => ({
  savedAt: '2026-03-02T09:00:00.000Z',
  origin: 'file:///E:/NightShift.html',
  device: 'depot-laptop'
});

describe('canonicalJson', () => {
  test('sorts object keys so the same data always serialises identically', () => {
    assert.equal(canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
    assert.equal(canonicalJson({ a: 2, b: 1 }), canonicalJson({ b: 1, a: 2 }));
  });

  test('sorts nested keys too', () => {
    assert.equal(canonicalJson({ z: { d: 1, c: 2 } }), '{"z":{"c":2,"d":1}}');
  });

  test('leaves array order alone, because event order is the whole point', () => {
    assert.equal(canonicalJson([3, 1, 2]), '[3,1,2]');
    assert.equal(canonicalJson({ events: [{ b: 1, a: 2 }] }), '{"events":[{"a":2,"b":1}]}');
  });

  test('handles the primitives a save contains', () => {
    assert.equal(canonicalJson(null), 'null');
    assert.equal(canonicalJson(42), '42');
    assert.equal(canonicalJson('hi'), '"hi"');
    assert.equal(canonicalJson(true), 'true');
    assert.equal(canonicalJson([]), '[]');
    assert.equal(canonicalJson({}), '{}');
  });

  test('drops undefined members the way JSON does', () => {
    assert.equal(canonicalJson({ a: 1, b: undefined }), '{"a":1}');
  });
});

describe('checksumOf', () => {
  test('is stable for the same data', () => {
    assert.equal(checksumOf(payload()), checksumOf(payload()));
  });

  test('ignores key order', () => {
    assert.equal(checksumOf({ a: 1, b: 2 }), checksumOf({ b: 2, a: 1 }));
  });

  test('changes when anything changes', () => {
    const base = payload();
    const nudged = { ...base, progress: { ...base.progress, xp: 121 } };
    assert.notEqual(checksumOf(base), checksumOf(nudged));
  });

  test('is a short printable string', () => {
    const sum = checksumOf(payload());
    assert.equal(typeof sum, 'string');
    assert.ok(sum.length > 0 && sum.length <= 16);
    assert.match(sum, /^[0-9a-z]+$/);
  });
});

describe('createSave', () => {
  test('wraps the payload with a format marker, version, meta and checksum', () => {
    const save = createSave(payload(), meta());
    assert.equal(save.format, SAVE_FORMAT);
    assert.equal(save.version, SAVE_VERSION);
    assert.equal(save.meta.savedAt, '2026-03-02T09:00:00.000Z');
    assert.equal(save.meta.origin, 'file:///E:/NightShift.html');
    assert.equal(save.checksum, checksumOf(payload()));
    assert.deepEqual(save.data, payload());
  });

  test('does not mutate the payload it was given', () => {
    const original = payload();
    const snapshot = JSON.parse(JSON.stringify(original));
    createSave(original, meta());
    assert.deepEqual(original, snapshot);
  });

  test('tolerates missing meta', () => {
    const save = createSave(payload());
    assert.equal(typeof save.meta, 'object');
  });

  test('rejects a payload that is not an object', () => {
    assert.throws(() => createSave(null, meta()), /payload/i);
    assert.throws(() => createSave('nope', meta()), /payload/i);
  });
});

describe('encode and decode round-trip', () => {
  test('survives the trip', () => {
    const save = createSave(payload(), meta());
    const result = decodeSave(encodeSave(save));
    assert.equal(result.ok, true);
    assert.deepEqual(result.save.data, payload());
    assert.equal(result.save.meta.device, 'depot-laptop');
  });

  test('encodes to something a person could paste', () => {
    const text = encodeSave(createSave(payload(), meta()));
    assert.equal(typeof text, 'string');
    assert.ok(text.includes(SAVE_FORMAT));
  });

  test('survives a re-serialisation that reorders keys', () => {
    const save = createSave(payload(), meta());
    const shuffled = JSON.parse(JSON.stringify({ data: save.data, checksum: save.checksum, meta: save.meta, version: save.version, format: save.format }));
    assert.equal(verifySave(shuffled).ok, true);
  });
});

describe('decodeSave refuses what it should', () => {
  test('rejects text that is not JSON', () => {
    const result = decodeSave('this is not a save');
    assert.equal(result.ok, false);
    assert.match(result.error, /not valid json/i);
  });

  test('rejects an empty or missing input', () => {
    assert.equal(decodeSave('').ok, false);
    assert.equal(decodeSave(null).ok, false);
    assert.equal(decodeSave(undefined).ok, false);
  });

  test('rejects JSON that is not one of our saves', () => {
    const result = decodeSave(JSON.stringify({ hello: 'world' }));
    assert.equal(result.ok, false);
    assert.match(result.error, /not a night shift save/i);
  });

  test('rejects a save from a newer build, by name', () => {
    const save = createSave(payload(), meta());
    const future = JSON.stringify({ ...save, version: SAVE_VERSION + 5 });
    const result = decodeSave(future);
    assert.equal(result.ok, false);
    assert.match(result.error, /newer/i);
  });

  test('detects corruption through the checksum', () => {
    const save = createSave(payload(), meta());
    const tampered = JSON.parse(encodeSave(save));
    tampered.data.progress.xp = 999999;
    const result = decodeSave(JSON.stringify(tampered));
    assert.equal(result.ok, false);
    assert.match(result.error, /corrupt|checksum/i);
  });

  test('can be told to load a mismatched save anyway', () => {
    const save = createSave(payload(), meta());
    const tampered = JSON.parse(encodeSave(save));
    tampered.data.progress.xp = 999999;
    const result = decodeSave(JSON.stringify(tampered), { allowChecksumMismatch: true });
    assert.equal(result.ok, true);
    assert.equal(result.warning !== undefined, true);
    assert.equal(result.save.data.progress.xp, 999999);
  });

  test('accepts an older version and says it needs migrating', () => {
    const old = { format: SAVE_FORMAT, version: 0, meta: {}, data: { anything: true }, checksum: checksumOf({ anything: true }) };
    const result = decodeSave(JSON.stringify(old));
    assert.equal(result.ok, true);
    assert.equal(result.needsMigration, true);
  });

  test('rejects a truncated file the way a half-written save would look', () => {
    const text = encodeSave(createSave(payload(), meta()));
    const result = decodeSave(text.slice(0, Math.floor(text.length * 0.6)));
    assert.equal(result.ok, false);
  });
});

describe('verifySave', () => {
  test('explains why a save is unusable rather than just saying no', () => {
    assert.match(verifySave(null).reason, /object/i);
    assert.match(verifySave({}).reason, /not a night shift save/i);
    assert.match(verifySave({ format: SAVE_FORMAT }).reason, /version/i);
    assert.match(
      verifySave({ format: SAVE_FORMAT, version: SAVE_VERSION, data: {} }).reason,
      /checksum/i
    );
  });

  test('passes a good save', () => {
    assert.equal(verifySave(createSave(payload(), meta())).ok, true);
  });
});

describe('emptyPayload', () => {
  test('is a valid starting point that round-trips', () => {
    const save = createSave(emptyPayload(), meta());
    assert.equal(decodeSave(encodeSave(save)).ok, true);
    assert.deepEqual(save.data.progress.events, []);
    assert.deepEqual(save.data.progress.completed, []);
    assert.equal(save.data.deck.session, 1);
  });

  test('stores nothing that is derived', () => {
    // Rank and XP are computed from the closed tickets. If either ever appears
    // here, a save can start disagreeing with itself.
    const payload = emptyPayload();
    assert.equal(payload.progress.xp, undefined);
    assert.equal(payload.progress.tier, undefined);
  });

  test('returns a fresh object each time', () => {
    const first = emptyPayload();
    first.progress.completed.push({ missionId: 'net-001', xp: 25 });
    assert.deepEqual(emptyPayload().progress.completed, []);
  });
});
