/**
 * Structural integrity of the authored world.
 *
 * The seed is content, and content rots quietly: an address gets edited, a DNS
 * record points at a host that was renamed, an asset row references a machine
 * that no longer exists. Nothing throws — the lenses just start disagreeing, and
 * the "one company" illusion dies without a single failing test.
 *
 * So these assert the invariants that make the lenses agree, against whatever the
 * seed happens to contain. They keep working as the world grows.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createSeed, SEED_VERSION } from '../../../src/core/world/seed.js';
import { reduceWorld } from '../../../src/core/world/reduce.js';
import { createEvent } from '../../../src/core/world/events.js';
import { contains, parseCidr } from '../../../src/core/net/cidr.js';
import { isIpv4 } from '../../../src/core/validate.js';
import {
  selectDevices,
  selectSites,
  selectSubnets,
  selectSubnetForIp,
  selectInterfaces,
  selectUsers,
  selectDevice,
  selectUser,
  selectDeviceByIp,
  selectTableNames,
  selectTable,
  resolveDns,
  selectPrimaryIp
} from '../../../src/core/world/select.js';

const seed = createSeed();

describe('shape', () => {
  test('is a frozen world at tick zero', () => {
    assert.ok(Object.isFrozen(seed));
    assert.ok(Object.isFrozen(seed.net.devices));
    assert.equal(seed.tick, 0);
    assert.equal(seed.meta.version, SEED_VERSION);
  });

  test('createSeed returns an equal world every time', () => {
    assert.deepEqual(createSeed(), createSeed());
  });

  test('is big enough to be interesting and small enough to hold in your head', () => {
    assert.ok(selectSites(seed).length >= 2, 'want at least two sites');
    assert.ok(selectDevices(seed).length >= 12, 'want at least a dozen devices');
    assert.ok(selectDevices(seed).length <= 40, 'more than 40 devices is too much to learn');
    assert.ok(selectSubnets(seed).length >= 4);
    assert.ok(selectUsers(seed).length >= 5);
  });

  test('survives a JSON round-trip, because a save replays from it', () => {
    assert.deepEqual(JSON.parse(JSON.stringify(seed)), JSON.parse(JSON.stringify(createSeed())));
  });
});

describe('every reference resolves', () => {
  test('device sites exist', () => {
    const siteIds = selectSites(seed).map((s) => s.id);
    for (const device of selectDevices(seed)) {
      assert.ok(siteIds.includes(device.siteId), `${device.id} is at unknown site ${device.siteId}`);
    }
  });

  test('subnet sites exist', () => {
    const siteIds = selectSites(seed).map((s) => s.id);
    for (const subnet of selectSubnets(seed)) {
      if (subnet.siteId === null) continue; // WAN and edge links belong to no single site
      assert.ok(siteIds.includes(subnet.siteId), `${subnet.id} is at unknown site ${subnet.siteId}`);
    }
  });

  test('user sites and assigned machines exist', () => {
    const siteIds = selectSites(seed).map((s) => s.id);
    for (const user of selectUsers(seed)) {
      assert.ok(siteIds.includes(user.siteId), `${user.id} is at unknown site ${user.siteId}`);
      if (user.hostId) {
        assert.ok(selectDevice(seed, user.hostId), `${user.id} is assigned missing host ${user.hostId}`);
      }
    }
  });
});

describe('addressing is coherent', () => {
  test('every subnet is valid CIDR whose gateway sits inside it', () => {
    for (const subnet of selectSubnets(seed)) {
      const block = parseCidr(subnet.cidr);
      assert.equal(block.cidr, subnet.cidr, `${subnet.id}: ${subnet.cidr} is not its own network address`);
      if (!subnet.gateway) continue;
      assert.ok(contains(subnet.cidr, subnet.gateway), `${subnet.id}: gateway ${subnet.gateway} is outside ${subnet.cidr}`);
      assert.notEqual(subnet.gateway, block.network, `${subnet.id}: gateway is the network address`);
      if (block.prefix < 31) {
        assert.notEqual(subnet.gateway, block.broadcast, `${subnet.id}: gateway is the broadcast address`);
      }
    }
  });

  test('every interface address is a real address on a declared subnet', () => {
    for (const device of selectDevices(seed)) {
      for (const iface of selectInterfaces(seed, device.id)) {
        if (!iface.ip) continue;
        assert.ok(isIpv4(iface.ip), `${device.id}/${iface.name}: ${iface.ip} is not an IPv4 address`);
        const subnet = selectSubnetForIp(seed, iface.ip);
        assert.ok(subnet, `${device.id}/${iface.name}: ${iface.ip} belongs to no declared subnet`);
        assert.equal(
          iface.prefix,
          parseCidr(subnet.cidr).prefix,
          `${device.id}/${iface.name}: /${iface.prefix} disagrees with ${subnet.id} (${subnet.cidr})`
        );
      }
    }
  });

  test('no address is used twice', () => {
    const seen = new Map();
    for (const device of selectDevices(seed)) {
      for (const iface of selectInterfaces(seed, device.id)) {
        if (!iface.ip) continue;
        const owner = `${device.id}/${iface.name}`;
        assert.ok(!seen.has(iface.ip), `${iface.ip} is on both ${seen.get(iface.ip)} and ${owner}`);
        seen.set(iface.ip, owner);
      }
    }
  });

  test('every gateway address is actually held by a device', () => {
    for (const subnet of selectSubnets(seed)) {
      if (!subnet.gateway) continue;
      assert.ok(
        selectDeviceByIp(seed, subnet.gateway),
        `${subnet.id}: nothing holds the gateway address ${subnet.gateway}`
      );
    }
  });

  test('each site has at least one router interface on its LANs', () => {
    for (const subnet of selectSubnets(seed)) {
      if (subnet.kind !== 'lan') continue;
      const holder = selectDeviceByIp(seed, subnet.gateway);
      assert.ok(holder, `${subnet.id} has no gateway device`);
      assert.ok(
        ['router', 'firewall', 'switch'].includes(holder.device.kind),
        `${subnet.id}: gateway is a ${holder.device.kind}`
      );
    }
  });
});

describe('DNS agrees with the network', () => {
  test('every A record points at an address something really holds', () => {
    for (const record of seed.net.dns.records) {
      if (record.type !== 'A') continue;
      assert.ok(isIpv4(record.value), `${record.name}: ${record.value} is not an address`);
      if (record.external) continue;
      assert.ok(
        selectDeviceByIp(seed, record.value),
        `${record.name} -> ${record.value}, but no device holds that address`
      );
    }
  });

  test('every CNAME points at a name that exists', () => {
    for (const record of seed.net.dns.records) {
      if (record.type !== 'CNAME') continue;
      assert.ok(
        resolveDns(seed, record.value, 'A') || resolveDns(seed, record.value, 'CNAME'),
        `${record.name} is a CNAME to ${record.value}, which does not resolve`
      );
    }
  });

  test('no CNAME points at itself', () => {
    for (const record of seed.net.dns.records) {
      if (record.type === 'CNAME') {
        assert.notEqual(record.value.toLowerCase(), record.name.toLowerCase());
      }
    }
  });

  test('names are unique per type', () => {
    const seen = new Set();
    for (const record of seed.net.dns.records) {
      const key = `${record.name.toLowerCase()}|${record.type}`;
      assert.ok(!seen.has(key), `duplicate DNS record ${key}`);
      seen.add(key);
    }
  });

  test('every server has a forward record', () => {
    for (const device of selectDevices(seed)) {
      if (device.kind !== 'server') continue;
      const ip = selectPrimaryIp(seed, device.id);
      const named = seed.net.dns.records.some((r) => r.type === 'A' && r.value === ip);
      assert.ok(named, `${device.id} (${ip}) has no DNS A record`);
    }
  });
});

describe('the data tables share the ID vocabulary', () => {
  test('there are tables worth querying', () => {
    const names = selectTableNames(seed);
    assert.ok(names.length >= 3, `only ${names.length} tables`);
    for (const name of names) {
      assert.ok(selectTable(seed, name).length >= 4, `table ${name} has too few rows to query`);
    }
  });

  test('every row has a unique id', () => {
    for (const name of selectTableNames(seed)) {
      const ids = selectTable(seed, name).map((row) => row.id);
      assert.equal(new Set(ids).size, ids.length, `table ${name} has duplicate ids`);
    }
  });

  test('userId columns point at real users', () => {
    for (const name of selectTableNames(seed)) {
      for (const row of selectTable(seed, name)) {
        for (const column of ['userId', 'owner', 'requesterId']) {
          if (!row[column]) continue;
          assert.ok(
            selectUser(seed, row[column]),
            `${name}.${row.id}.${column} = ${row[column]}, which is not a user`
          );
        }
      }
    }
  });

  test('hostId columns point at real devices', () => {
    for (const name of selectTableNames(seed)) {
      for (const row of selectTable(seed, name)) {
        if (!row.hostId) continue;
        assert.ok(
          selectDevice(seed, row.hostId),
          `${name}.${row.id}.hostId = ${row.hostId}, which is not a device`
        );
      }
    }
  });
});

describe('it behaves as a world', () => {
  test('replaying an empty log returns it unchanged', () => {
    assert.equal(reduceWorld(seed, []), seed);
  });

  test('events apply to it without touching the seed', () => {
    const device = selectDevices(seed).find((d) => d.kind === 'server');
    const after = reduceWorld(seed, [createEvent('net/device-power', { deviceId: device.id, on: false }, 60)]);

    assert.equal(after.net.devices[device.id].powered, false);
    assert.equal(seed.net.devices[device.id].powered, true);
    assert.equal(after.tick, 60);
    assert.equal(seed.tick, 0);
  });

  test('the identity events in the vocabulary work against the real users', () => {
    const user = selectUsers(seed)[0];
    const after = reduceWorld(seed, [
      createEvent('identity/user-group-add', { userId: user.id, group: 'vpn-users' }, 30)
    ]);
    assert.ok(after.identity.users[user.id].groups.includes('vpn-users'));
  });

  test('it contains at least one deliberately disabled account to notice', () => {
    assert.ok(
      selectUsers(seed).some((user) => user.enabled === false),
      'a dormant account is the seed of half the security missions'
    );
  });
});
