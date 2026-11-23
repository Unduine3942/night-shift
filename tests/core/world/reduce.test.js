import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createEvent } from '../../../src/core/world/events.js';
import {
  applyEvent,
  reduceWorld,
  replayTolerant,
  createScratch,
  withEvent,
  discardScratch,
  commitScratch
} from '../../../src/core/world/reduce.js';
import { deepFreeze, getIn } from '../../../src/core/immutable.js';

/** A small fixture so these tests do not depend on the real Meridian seed. */
const fixture = () =>
  deepFreeze({
    tick: 0,
    net: {
      devices: {
        'rtr-1': {
          id: 'rtr-1',
          name: 'rtr-1',
          kind: 'router',
          powered: true,
          interfaces: {
            'ge-0/0/0': { name: 'ge-0/0/0', ip: '10.20.10.1', prefix: 24, up: true }
          }
        },
        'sw-1': { id: 'sw-1', name: 'sw-1', kind: 'switch', powered: true, interfaces: {} }
      },
      dns: {
        records: [{ name: 'files.meridian.local', type: 'A', value: '10.20.10.9', ttl: 300 }]
      }
    },
    identity: {
      users: {
        'u-dana': { id: 'u-dana', login: 'dana', name: 'Dana Okafor', enabled: true, groups: ['staff'] }
      }
    }
  });

describe('applyEvent', () => {
  test('returns a new world and leaves the old one alone', () => {
    const before = fixture();
    const after = applyEvent(before, createEvent('net/device-power', { deviceId: 'rtr-1', on: false }));
    assert.notEqual(after, before);
    assert.equal(getIn(before, ['net', 'devices', 'rtr-1', 'powered']), true);
    assert.equal(getIn(after, ['net', 'devices', 'rtr-1', 'powered']), false);
  });

  test('shares branches the event did not touch', () => {
    const before = fixture();
    const after = applyEvent(before, createEvent('net/device-power', { deviceId: 'rtr-1', on: false }));
    assert.equal(after.identity, before.identity);
    assert.equal(after.net.devices['sw-1'], before.net.devices['sw-1']);
  });

  test('moves the clock forward to the event time', () => {
    const after = applyEvent(fixture(), createEvent('world/tick', {}, 900));
    assert.equal(after.tick, 900);
  });

  test('never rewinds the clock', () => {
    const at900 = applyEvent(fixture(), createEvent('world/tick', {}, 900));
    const then = applyEvent(at900, createEvent('world/tick', {}, 30));
    assert.equal(then.tick, 900);
  });

  test('rejects an unknown or malformed event', () => {
    assert.throws(() => applyEvent(fixture(), { type: 'net/nope', at: 0, payload: {} }), /unknown event/i);
    assert.throws(() => applyEvent(fixture(), null), /event/i);
  });
});

describe('event effects', () => {
  test('net/iface-ip-set rewrites an interface address', () => {
    const after = applyEvent(
      fixture(),
      createEvent('net/iface-ip-set', {
        deviceId: 'rtr-1',
        iface: 'ge-0/0/0',
        ip: '10.20.11.1',
        prefix: 25
      })
    );
    const iface = getIn(after, ['net', 'devices', 'rtr-1', 'interfaces', 'ge-0/0/0']);
    assert.equal(iface.ip, '10.20.11.1');
    assert.equal(iface.prefix, 25);
    assert.equal(iface.up, true, 'unrelated interface fields should be preserved');
  });

  test('net/dns-record-set replaces a record with the same name and type', () => {
    const after = applyEvent(
      fixture(),
      createEvent('net/dns-record-set', {
        name: 'files.meridian.local',
        type: 'A',
        value: '10.20.10.99'
      })
    );
    const records = getIn(after, ['net', 'dns', 'records']);
    assert.equal(records.length, 1, 'should upsert, not append a duplicate');
    assert.equal(records[0].value, '10.20.10.99');
  });

  test('net/dns-record-set appends a genuinely new record', () => {
    const after = applyEvent(
      fixture(),
      createEvent('net/dns-record-set', { name: 'vpn.meridian.local', type: 'A', value: '10.20.10.4' })
    );
    assert.equal(getIn(after, ['net', 'dns', 'records']).length, 2);
  });

  test('net/dns-record-remove drops one record', () => {
    const after = applyEvent(
      fixture(),
      createEvent('net/dns-record-remove', { name: 'files.meridian.local', type: 'A' })
    );
    assert.deepEqual(getIn(after, ['net', 'dns', 'records']), []);
  });

  test('identity/user-set-enabled flips the flag', () => {
    const after = applyEvent(
      fixture(),
      createEvent('identity/user-set-enabled', { userId: 'u-dana', enabled: false })
    );
    assert.equal(getIn(after, ['identity', 'users', 'u-dana', 'enabled']), false);
  });

  test('identity/user-group-add does not duplicate a group', () => {
    const once = applyEvent(
      fixture(),
      createEvent('identity/user-group-add', { userId: 'u-dana', group: 'vpn' })
    );
    const twice = applyEvent(
      once,
      createEvent('identity/user-group-add', { userId: 'u-dana', group: 'vpn' })
    );
    assert.deepEqual(getIn(twice, ['identity', 'users', 'u-dana', 'groups']), ['staff', 'vpn']);
  });

  test('identity/user-group-remove takes a group away', () => {
    const after = applyEvent(
      fixture(),
      createEvent('identity/user-group-remove', { userId: 'u-dana', group: 'staff' })
    );
    assert.deepEqual(getIn(after, ['identity', 'users', 'u-dana', 'groups']), []);
  });
});

describe('applying to a missing target fails loudly', () => {
  test('names the device', () => {
    assert.throws(
      () => applyEvent(fixture(), createEvent('net/device-power', { deviceId: 'ghost', on: true })),
      /ghost/
    );
  });

  test('names the interface', () => {
    assert.throws(
      () =>
        applyEvent(
          fixture(),
          createEvent('net/iface-ip-set', { deviceId: 'sw-1', iface: 'xe-9', ip: '10.0.0.1', prefix: 24 })
        ),
      /xe-9/
    );
  });

  test('names the user', () => {
    assert.throws(
      () => applyEvent(fixture(), createEvent('identity/user-set-enabled', { userId: 'u-nobody', enabled: false })),
      /u-nobody/
    );
  });
});

describe('reduceWorld', () => {
  const log = [
    createEvent('world/tick', {}, 60),
    createEvent('net/device-power', { deviceId: 'rtr-1', on: false }, 120),
    createEvent('identity/user-group-add', { userId: 'u-dana', group: 'vpn' }, 180),
    createEvent('net/dns-record-set', { name: 'vpn.meridian.local', type: 'A', value: '10.20.10.4' }, 240)
  ];

  test('an empty log returns the seed unchanged', () => {
    const seed = fixture();
    assert.equal(reduceWorld(seed, []), seed);
  });

  test('matches applying the events one at a time', () => {
    const stepwise = log.reduce((world, event) => applyEvent(world, event), fixture());
    assert.deepEqual(reduceWorld(fixture(), log), stepwise);
  });

  test('is deterministic', () => {
    assert.deepEqual(reduceWorld(fixture(), log), reduceWorld(fixture(), log));
  });

  test('respects log order, not timestamp order', () => {
    const outOfOrder = [
      createEvent('net/device-power', { deviceId: 'rtr-1', on: false }, 500),
      createEvent('net/device-power', { deviceId: 'rtr-1', on: true }, 100)
    ];
    assert.equal(getIn(reduceWorld(fixture(), outOfOrder), ['net', 'devices', 'rtr-1', 'powered']), true);
  });

  test('reports which event in the log failed', () => {
    const bad = [createEvent('world/tick', {}, 10), { type: 'net/nope', at: 20, payload: {} }];
    assert.throws(() => reduceWorld(fixture(), bad), /index 1/i);
  });

  test('leaves the seed untouched', () => {
    const seed = fixture();
    const snapshot = JSON.parse(JSON.stringify(seed));
    reduceWorld(seed, log);
    assert.deepEqual(JSON.parse(JSON.stringify(seed)), snapshot);
  });
});

describe('scratch layer', () => {
  test('starts empty, on the given base', () => {
    const base = fixture();
    const scratch = createScratch(base);
    assert.equal(scratch.base, base);
    assert.equal(scratch.world, base);
    assert.deepEqual(scratch.events, []);
  });

  test('withEvent advances the scratch world without touching the base', () => {
    const base = fixture();
    const scratch = withEvent(
      createScratch(base),
      createEvent('net/device-power', { deviceId: 'rtr-1', on: false })
    );
    assert.equal(getIn(scratch.world, ['net', 'devices', 'rtr-1', 'powered']), false);
    assert.equal(getIn(scratch.base, ['net', 'devices', 'rtr-1', 'powered']), true);
    assert.equal(scratch.events.length, 1);
  });

  test('withEvent returns a new scratch rather than mutating', () => {
    const first = createScratch(fixture());
    const second = withEvent(first, createEvent('world/tick', {}, 60));
    assert.notEqual(second, first);
    assert.equal(first.events.length, 0);
  });

  test('discarding returns to the base', () => {
    const base = fixture();
    const dirty = withEvent(
      createScratch(base),
      createEvent('net/device-power', { deviceId: 'rtr-1', on: false })
    );
    const clean = discardScratch(dirty);
    assert.equal(clean.world, base);
    assert.deepEqual(clean.events, []);
  });

  test('committing yields the new world and the events to append', () => {
    const base = fixture();
    const scratch = withEvent(
      withEvent(createScratch(base), createEvent('world/tick', {}, 60)),
      createEvent('net/device-power', { deviceId: 'rtr-1', on: false }, 90)
    );
    const { world, events } = commitScratch(scratch);

    assert.equal(events.length, 2);
    assert.equal(getIn(world, ['net', 'devices', 'rtr-1', 'powered']), false);
    assert.equal(world.tick, 90);
    assert.deepEqual(world, reduceWorld(base, events), 'commit must equal a replay of the same events');
  });

  test('a scratch event that fails does not corrupt the scratch', () => {
    const scratch = createScratch(fixture());
    assert.throws(
      () => withEvent(scratch, createEvent('net/device-power', { deviceId: 'ghost', on: true })),
      /ghost/
    );
    assert.deepEqual(scratch.events, []);
  });
});

/**
 * `reduceWorld` is strict because during play a bad event is a bug. A log coming
 * out of a save file is different: it has been through a USB stick and a sync
 * client, and it may name something an older build had. Strict replay there
 * throws on every render, from a save already on disk — so the load path uses
 * this instead.
 */
describe('replayTolerant', () => {
  const base = () =>
    deepFreeze({
      tick: 0,
      net: { devices: { 'srv-a': { id: 'srv-a', powered: true }, 'srv-b': { id: 'srv-b', powered: true } } }
    });

  const power = (deviceId, on) => createEvent('net/device-power', { deviceId, on });

  test('a clean log behaves exactly like reduceWorld', () => {
    const events = [power('srv-a', false), power('srv-b', false)];
    const result = replayTolerant(base(), events);

    assert.deepEqual(result.dropped, []);
    assert.equal(result.events.length, 2);
    assert.deepEqual(result.world, reduceWorld(base(), events));
  });

  test('an event that cannot apply is dropped, and the rest are kept', () => {
    const result = replayTolerant(base(), [power('srv-a', false), power('srv-nope', false), power('srv-b', false)]);

    assert.equal(result.events.length, 2);
    assert.equal(result.dropped.length, 1);
    assert.equal(result.world.net.devices['srv-a'].powered, false);
    assert.equal(result.world.net.devices['srv-b'].powered, false);
  });

  test('it says which event was dropped and why', () => {
    const result = replayTolerant(base(), [power('srv-a', false), power('srv-nope', false)]);

    assert.equal(result.dropped[0].index, 1);
    assert.equal(result.dropped[0].type, 'net/device-power');
    assert.match(result.dropped[0].reason, /no such device/);
  });

  test('the kept events replay cleanly through the strict reducer', () => {
    const result = replayTolerant(base(), [power('srv-nope', false), power('srv-a', false)]);
    assert.doesNotThrow(() => reduceWorld(base(), result.events));
  });

  test('it never throws, whatever it is handed', () => {
    for (const rubbish of [null, undefined, 'events', 42, {}]) {
      assert.doesNotThrow(() => replayTolerant(base(), rubbish));
    }
    assert.doesNotThrow(() => replayTolerant(base(), [null, 7, { type: 'nope' }, power('srv-a', false)]));
  });

  test('a log of nothing but rubbish leaves the world untouched', () => {
    const world = base();
    const result = replayTolerant(world, [{ type: 'nope' }, null]);
    assert.equal(result.world, world);
    assert.deepEqual(result.events, []);
  });
});
