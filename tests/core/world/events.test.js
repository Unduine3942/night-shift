import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENT_DEFINITIONS,
  createEvent,
  validateEvent,
  isKnownEventType,
  listEventTypes,
  eventScope
} from '../../../src/core/world/events.js';

describe('the registry', () => {
  test('every definition is complete', () => {
    for (const [type, def] of Object.entries(EVENT_DEFINITIONS)) {
      assert.ok(['world', 'progress'].includes(def.scope), `${type} has no valid scope`);
      assert.equal(typeof def.validate, 'function', `${type} has no validate`);
      assert.equal(typeof def.apply, 'function', `${type} has no apply`);
    }
  });

  test('types are namespaced', () => {
    for (const type of listEventTypes()) {
      assert.match(type, /^[a-z]+\/[a-z-]+$/, `${type} is not namespace/kebab-case`);
    }
  });

  test('covers the Phase 1 vocabulary', () => {
    const types = listEventTypes();
    for (const expected of [
      'world/tick',
      'net/device-power',
      'net/iface-ip-set',
      'net/dns-record-set',
      'net/dns-record-remove',
      'identity/user-set-enabled'
    ]) {
      assert.ok(types.includes(expected), `missing event type ${expected}`);
    }
  });

  test('isKnownEventType and eventScope agree with the registry', () => {
    assert.equal(isKnownEventType('world/tick'), true);
    assert.equal(isKnownEventType('net/warp-core-breach'), false);
    assert.equal(eventScope('net/device-power'), 'world');
    assert.throws(() => eventScope('net/nope'), /unknown event/i);
  });
});

describe('createEvent', () => {
  test('builds a plain record', () => {
    const event = createEvent('world/tick', {}, 600);
    assert.deepEqual({ ...event }, { type: 'world/tick', at: 600, payload: {} });
  });

  test('freezes the event and its payload', () => {
    const event = createEvent('net/device-power', { deviceId: 'rtr-1', on: false }, 0);
    assert.ok(Object.isFrozen(event));
    assert.ok(Object.isFrozen(event.payload));
    assert.throws(() => {
      event.at = 99;
    }, TypeError);
  });

  test('defaults the timestamp to zero', () => {
    assert.equal(createEvent('world/tick').at, 0);
  });

  test('survives a JSON round-trip, because saves are event logs', () => {
    const event = createEvent('net/iface-ip-set', {
      deviceId: 'rtr-1',
      iface: 'ge-0/0/0',
      ip: '10.20.30.1',
      prefix: 24
    }, 120);
    assert.deepEqual(JSON.parse(JSON.stringify(event)), { ...event, payload: { ...event.payload } });
  });

  test('rejects an unknown type', () => {
    assert.throws(() => createEvent('net/reticulate-splines', {}), /unknown event/i);
  });

  test('rejects a non-integer timestamp', () => {
    assert.throws(() => createEvent('world/tick', {}, 1.5), /at/);
    assert.throws(() => createEvent('world/tick', {}, -1), /at/);
  });

  test('validates the payload at construction', () => {
    assert.throws(() => createEvent('net/device-power', { deviceId: 'rtr-1' }), /on/);
    assert.throws(() => createEvent('net/device-power', { on: true }), /deviceId/);
    assert.throws(() => createEvent('net/device-power', { deviceId: 'rtr-1', on: 'yes' }), /on/);
  });
});

describe('payload validation per type', () => {
  test('net/iface-ip-set demands a real address and prefix', () => {
    const good = { deviceId: 'rtr-1', iface: 'ge-0/0/0', ip: '10.0.0.1', prefix: 24 };
    assert.doesNotThrow(() => createEvent('net/iface-ip-set', good));
    assert.throws(() => createEvent('net/iface-ip-set', { ...good, ip: '10.0.0.256' }), /ip/);
    assert.throws(() => createEvent('net/iface-ip-set', { ...good, prefix: 33 }), /prefix/);
    assert.throws(() => createEvent('net/iface-ip-set', { ...good, iface: '' }), /iface/);
  });

  test('net/dns-record-set restricts the record type', () => {
    const good = { name: 'files.meridian.local', type: 'A', value: '10.20.10.9' };
    assert.doesNotThrow(() => createEvent('net/dns-record-set', good));
    assert.throws(() => createEvent('net/dns-record-set', { ...good, type: 'AAAA' }), /type/);
    assert.throws(() => createEvent('net/dns-record-set', { ...good, name: '' }), /name/);
  });

  test('net/dns-record-set defaults the ttl', () => {
    const event = createEvent('net/dns-record-set', {
      name: 'files.meridian.local',
      type: 'A',
      value: '10.20.10.9'
    });
    assert.equal(typeof event.payload.ttl, 'number');
  });

  test('identity events demand a user id', () => {
    assert.doesNotThrow(() => createEvent('identity/user-set-enabled', { userId: 'u-1', enabled: false }));
    assert.throws(() => createEvent('identity/user-set-enabled', { userId: '', enabled: false }), /userId/);
    assert.throws(() => createEvent('identity/user-group-add', { userId: 'u-1' }), /group/);
  });
});

describe('validateEvent', () => {
  test('returns the event when it is well formed', () => {
    const event = createEvent('world/tick', {}, 30);
    assert.equal(validateEvent(event), event);
  });

  test('rejects anything that is not an event record', () => {
    assert.throws(() => validateEvent(null), /event/i);
    assert.throws(() => validateEvent('world/tick'), /event/i);
    assert.throws(() => validateEvent([]), /event/i);
    assert.throws(() => validateEvent({ at: 0, payload: {} }), /type/i);
    assert.throws(() => validateEvent({ type: 'world/tick', payload: {} }), /at/i);
    assert.throws(() => validateEvent({ type: 'world/tick', at: 0 }), /payload/i);
  });

  test('rejects an unknown type even in a well-shaped record', () => {
    assert.throws(
      () => validateEvent({ type: 'net/made-up', at: 0, payload: {} }),
      /unknown event/i
    );
  });

  test('catches a payload corrupted after construction', () => {
    assert.throws(
      () => validateEvent({ type: 'net/device-power', at: 0, payload: { deviceId: 'rtr-1' } }),
      /on/
    );
  });
});
