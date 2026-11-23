import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { deepFreeze } from '../../../src/core/immutable.js';
import {
  selectTick,
  selectSites,
  selectSite,
  selectDevices,
  selectDevice,
  selectDevicesAtSite,
  selectInterfaces,
  selectInterface,
  selectPrimaryIp,
  selectDeviceByIp,
  selectSubnets,
  selectSubnet,
  selectSubnetForIp,
  selectDevicesOnSubnet,
  resolveDns,
  reverseDns,
  selectUsers,
  selectUser,
  selectUserByLogin,
  selectUsersInGroup,
  selectTableNames,
  selectTable,
  selectRow
} from '../../../src/core/world/select.js';

/** Shaped like the real Meridian seed, trimmed to what these tests need. */
const world = deepFreeze({
  tick: 3600,
  meta: { company: 'Meridian Logistics' },
  sites: {
    'site-hq': { id: 'site-hq', name: 'Portside HQ', code: 'HQ' },
    'site-depot': { id: 'site-depot', name: 'Eastfield Depot', code: 'DEP' }
  },
  net: {
    subnets: {
      'net-hq-srv': { id: 'net-hq-srv', siteId: 'site-hq', cidr: '10.20.10.0/24', vlan: 10, name: 'HQ Servers', gateway: '10.20.10.1' },
      'net-hq-staff': { id: 'net-hq-staff', siteId: 'site-hq', cidr: '10.20.20.0/24', vlan: 20, name: 'HQ Staff', gateway: '10.20.20.1' },
      'net-depot': { id: 'net-depot', siteId: 'site-depot', cidr: '10.40.20.0/24', vlan: 20, name: 'Depot Floor', gateway: '10.40.20.1' }
    },
    devices: {
      'srv-dc01': {
        id: 'srv-dc01', name: 'srv-dc01', kind: 'server', siteId: 'site-hq', powered: true,
        interfaces: { eth0: { name: 'eth0', ip: '10.20.10.10', prefix: 24, up: true } }
      },
      'rtr-hq': {
        id: 'rtr-hq', name: 'rtr-hq', kind: 'router', siteId: 'site-hq', powered: true,
        interfaces: {
          'ge-0/0/0': { name: 'ge-0/0/0', ip: '10.20.10.1', prefix: 24, up: true },
          'ge-0/0/1': { name: 'ge-0/0/1', ip: '10.20.20.1', prefix: 24, up: true }
        }
      },
      'pc-dispatch': {
        id: 'pc-dispatch', name: 'pc-dispatch', kind: 'workstation', siteId: 'site-hq', powered: true,
        interfaces: { eth0: { name: 'eth0', ip: '10.20.20.41', prefix: 24, up: true } }
      },
      'sw-depot': {
        id: 'sw-depot', name: 'sw-depot', kind: 'switch', siteId: 'site-depot', powered: true,
        interfaces: {}
      }
    },
    dns: {
      zone: 'meridian.local',
      records: [
        { name: 'dc01.meridian.local', type: 'A', value: '10.20.10.10', ttl: 3600 },
        { name: 'intranet.meridian.local', type: 'CNAME', value: 'dc01.meridian.local', ttl: 300 },
        { name: 'gw.meridian.local', type: 'A', value: '10.20.10.1', ttl: 3600 }
      ]
    }
  },
  identity: {
    users: {
      'u-dana': { id: 'u-dana', login: 'dokafor', name: 'Dana Okafor', enabled: true, groups: ['staff', 'dispatch'], siteId: 'site-hq' },
      'u-ravi': { id: 'u-ravi', login: 'rsingh', name: 'Ravi Singh', enabled: true, groups: ['staff', 'it-admins'], siteId: 'site-hq' },
      'u-mo': { id: 'u-mo', login: 'mchen', name: 'Mo Chen', enabled: false, groups: ['warehouse'], siteId: 'site-depot' }
    }
  },
  data: {
    tables: {
      employees: [
        { id: 1, name: 'Dana Okafor', dept: 'Dispatch', userId: 'u-dana' },
        { id: 2, name: 'Ravi Singh', dept: 'IT', userId: 'u-ravi' }
      ],
      assets: [{ id: 'A-100', hostId: 'pc-dispatch', owner: 'u-dana' }]
    }
  }
});

describe('time and sites', () => {
  test('selectTick', () => {
    assert.equal(selectTick(world), 3600);
    assert.equal(selectTick({}), 0);
  });

  test('selectSites returns every site in a stable order', () => {
    assert.deepEqual(selectSites(world).map((s) => s.id), ['site-depot', 'site-hq']);
    assert.deepEqual(selectSites(world), selectSites(world));
  });

  test('selectSite finds one, or returns null', () => {
    assert.equal(selectSite(world, 'site-hq').name, 'Portside HQ');
    assert.equal(selectSite(world, 'site-nowhere'), null);
  });
});

describe('devices', () => {
  test('selectDevices is sorted by id, so replays and tests are stable', () => {
    assert.deepEqual(selectDevices(world).map((d) => d.id),
      ['pc-dispatch', 'rtr-hq', 'srv-dc01', 'sw-depot']);
  });

  test('selectDevice finds one, or returns null', () => {
    assert.equal(selectDevice(world, 'rtr-hq').kind, 'router');
    assert.equal(selectDevice(world, 'rtr-nope'), null);
  });

  test('selectDevicesAtSite filters by site', () => {
    assert.deepEqual(selectDevicesAtSite(world, 'site-depot').map((d) => d.id), ['sw-depot']);
    assert.equal(selectDevicesAtSite(world, 'site-hq').length, 3);
    assert.deepEqual(selectDevicesAtSite(world, 'site-nowhere'), []);
  });
});

describe('interfaces', () => {
  test('selectInterfaces lists them in a stable order', () => {
    assert.deepEqual(selectInterfaces(world, 'rtr-hq').map((i) => i.name), ['ge-0/0/0', 'ge-0/0/1']);
    assert.deepEqual(selectInterfaces(world, 'sw-depot'), []);
    assert.deepEqual(selectInterfaces(world, 'ghost'), []);
  });

  test('selectInterface finds one, or returns null', () => {
    assert.equal(selectInterface(world, 'srv-dc01', 'eth0').ip, '10.20.10.10');
    assert.equal(selectInterface(world, 'srv-dc01', 'eth9'), null);
    assert.equal(selectInterface(world, 'ghost', 'eth0'), null);
  });

  test('selectPrimaryIp takes the first addressed interface', () => {
    assert.equal(selectPrimaryIp(world, 'srv-dc01'), '10.20.10.10');
    assert.equal(selectPrimaryIp(world, 'rtr-hq'), '10.20.10.1');
    assert.equal(selectPrimaryIp(world, 'sw-depot'), null);
    assert.equal(selectPrimaryIp(world, 'ghost'), null);
  });
});

describe('selectDeviceByIp — the reverse lookup every lens depends on', () => {
  test('finds the device and the interface holding an address', () => {
    const hit = selectDeviceByIp(world, '10.20.20.1');
    assert.equal(hit.device.id, 'rtr-hq');
    assert.equal(hit.iface.name, 'ge-0/0/1');
  });

  test('finds a workstation too', () => {
    assert.equal(selectDeviceByIp(world, '10.20.20.41').device.id, 'pc-dispatch');
  });

  test('returns null for an unassigned address', () => {
    assert.equal(selectDeviceByIp(world, '10.20.20.99'), null);
  });

  test('rejects an address that is not an address', () => {
    assert.throws(() => selectDeviceByIp(world, '10.20.20.999'), /ipv4/i);
  });
});

describe('subnets', () => {
  test('selectSubnets is sorted, selectSubnet finds one', () => {
    assert.deepEqual(selectSubnets(world).map((s) => s.id), ['net-depot', 'net-hq-srv', 'net-hq-staff']);
    assert.equal(selectSubnet(world, 'net-hq-srv').vlan, 10);
    assert.equal(selectSubnet(world, 'net-nope'), null);
  });

  test('selectSubnetForIp places an address on its network', () => {
    assert.equal(selectSubnetForIp(world, '10.20.10.55').id, 'net-hq-srv');
    assert.equal(selectSubnetForIp(world, '10.20.20.41').id, 'net-hq-staff');
    assert.equal(selectSubnetForIp(world, '10.40.20.7').id, 'net-depot');
    assert.equal(selectSubnetForIp(world, '8.8.8.8'), null);
  });

  test('selectDevicesOnSubnet finds everything addressed on it', () => {
    assert.deepEqual(selectDevicesOnSubnet(world, 'net-hq-srv').map((d) => d.id), ['rtr-hq', 'srv-dc01']);
    assert.deepEqual(selectDevicesOnSubnet(world, 'net-hq-staff').map((d) => d.id), ['pc-dispatch', 'rtr-hq']);
    assert.deepEqual(selectDevicesOnSubnet(world, 'net-nope'), []);
  });
});

describe('dns', () => {
  test('resolves an A record', () => {
    assert.equal(resolveDns(world, 'dc01.meridian.local').value, '10.20.10.10');
  });

  test('is case-insensitive, as DNS is', () => {
    assert.equal(resolveDns(world, 'DC01.Meridian.Local').value, '10.20.10.10');
  });

  test('honours the record type', () => {
    assert.equal(resolveDns(world, 'intranet.meridian.local', 'CNAME').value, 'dc01.meridian.local');
    assert.equal(resolveDns(world, 'intranet.meridian.local', 'A'), null);
  });

  test('returns null for an unknown name', () => {
    assert.equal(resolveDns(world, 'nothing.meridian.local'), null);
  });

  test('reverseDns maps an address back to a name', () => {
    assert.equal(reverseDns(world, '10.20.10.10'), 'dc01.meridian.local');
    assert.equal(reverseDns(world, '10.20.20.41'), null);
  });
});

describe('identity', () => {
  test('selectUsers is sorted by id', () => {
    assert.deepEqual(selectUsers(world).map((u) => u.id), ['u-dana', 'u-mo', 'u-ravi']);
  });

  test('selectUser and selectUserByLogin', () => {
    assert.equal(selectUser(world, 'u-ravi').name, 'Ravi Singh');
    assert.equal(selectUser(world, 'u-ghost'), null);
    assert.equal(selectUserByLogin(world, 'rsingh').id, 'u-ravi');
    assert.equal(selectUserByLogin(world, 'RSINGH').id, 'u-ravi', 'logins are not case-sensitive');
    assert.equal(selectUserByLogin(world, 'nobody'), null);
  });

  test('selectUsersInGroup', () => {
    assert.deepEqual(selectUsersInGroup(world, 'staff').map((u) => u.id), ['u-dana', 'u-ravi']);
    assert.deepEqual(selectUsersInGroup(world, 'it-admins').map((u) => u.id), ['u-ravi']);
    assert.deepEqual(selectUsersInGroup(world, 'nobody-group'), []);
  });
});

describe('data tables', () => {
  test('selectTableNames is sorted', () => {
    assert.deepEqual(selectTableNames(world), ['assets', 'employees']);
  });

  test('selectTable returns rows, or an empty array', () => {
    assert.equal(selectTable(world, 'employees').length, 2);
    assert.deepEqual(selectTable(world, 'nosuchtable'), []);
  });

  test('selectRow finds by id', () => {
    assert.equal(selectRow(world, 'employees', 2).name, 'Ravi Singh');
    assert.equal(selectRow(world, 'assets', 'A-100').hostId, 'pc-dispatch');
    assert.equal(selectRow(world, 'employees', 99), null);
    assert.equal(selectRow(world, 'nosuchtable', 1), null);
  });
});

describe('the shared ID vocabulary holds across domains', () => {
  test('an asset row, a device and a user all agree', () => {
    const asset = selectRow(world, 'assets', 'A-100');
    const device = selectDevice(world, asset.hostId);
    const user = selectUser(world, asset.owner);

    assert.equal(device.id, 'pc-dispatch');
    assert.equal(user.login, 'dokafor');
    assert.equal(selectDeviceByIp(world, selectPrimaryIp(world, device.id)).device.id, device.id);
    assert.equal(selectSubnetForIp(world, selectPrimaryIp(world, device.id)).siteId, device.siteId);
  });

  test('a DNS name resolves to a device that really holds that address', () => {
    const record = resolveDns(world, 'gw.meridian.local');
    const hit = selectDeviceByIp(world, record.value);
    assert.equal(hit.device.id, 'rtr-hq');
  });
});

describe('robustness', () => {
  test('every selector tolerates an empty world', () => {
    assert.deepEqual(selectDevices({}), []);
    assert.deepEqual(selectSubnets({}), []);
    assert.deepEqual(selectUsers({}), []);
    assert.deepEqual(selectSites({}), []);
    assert.deepEqual(selectTableNames({}), []);
    assert.equal(selectDevice({}, 'x'), null);
    assert.equal(resolveDns({}, 'x'), null);
    assert.equal(reverseDns({}, '10.0.0.1'), null);
    assert.equal(selectSubnetForIp({}, '10.0.0.1'), null);
    assert.equal(selectDeviceByIp({}, '10.0.0.1'), null);
  });

  test('selectors never mutate the world', () => {
    const before = JSON.stringify(world);
    selectDevices(world);
    selectUsersInGroup(world, 'staff');
    selectDevicesOnSubnet(world, 'net-hq-srv');
    selectTable(world, 'employees');
    assert.equal(JSON.stringify(world), before);
  });

  test('returned collections are fresh arrays, so a caller cannot corrupt the world', () => {
    const devices = selectDevices(world);
    devices.push({ id: 'injected' });
    assert.equal(selectDevices(world).length, 4);
  });
});
