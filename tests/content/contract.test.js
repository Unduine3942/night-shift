/**
 * The infrastructure lock.
 *
 * Meridian's addressing is a CONTRACT, not content. Missions reference it by
 * symbol and assume it never moves, so changing a hard value silently
 * invalidates every mission that depends on it — and the failure is invisible,
 * because a mission that restores the wrong address still "passes".
 *
 * So the hard values are fingerprinted. Change one and this fails on purpose.
 * That is not an obstacle; it is the reminder to bump INFRASTRUCTURE_VERSION and
 * re-run the mission suite, which is exactly the work that changing them implies.
 *
 * Labels, titles and blurbs are excluded from the fingerprint, so wording can be
 * improved freely.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  INFRASTRUCTURE_VERSION,
  SITE,
  NET,
  HOST,
  USER,
  GROUP,
  DNS_RECORD,
  TABLE,
  ZONE,
  hardParameters
} from '../../src/content/world/contract.js';
import { checksumOf } from '../../src/core/save/serialize.js';
import { parseCidr, contains } from '../../src/core/net/cidr.js';
import { isIpv4 } from '../../src/core/validate.js';

/**
 * Bump INFRASTRUCTURE_VERSION and update this together, deliberately, and only
 * when you mean to move the furniture.
 */
const LOCKED_FINGERPRINT = '24nru9';
const LOCKED_VERSION = 1;

describe('the lock', () => {
  test('the hard parameters have not moved', () => {
    assert.equal(
      checksumOf(hardParameters()),
      LOCKED_FINGERPRINT,
      [
        '',
        'The infrastructure contract changed.',
        '',
        'Every mission references these values by symbol and assumes they are fixed.',
        'If this change is deliberate:',
        '  1. bump INFRASTRUCTURE_VERSION in src/content/world/contract.js',
        '  2. update LOCKED_FINGERPRINT and LOCKED_VERSION in this file',
        '  3. re-run the mission suite — some missions may now teach the wrong thing',
        ''
      ].join('\n')
    );
  });

  test('the version matches the fingerprint it was locked with', () => {
    assert.equal(INFRASTRUCTURE_VERSION, LOCKED_VERSION);
  });
});

describe('nothing outside the contract hard-codes infrastructure', () => {
  const DERIVED_DIR = 'src/content/world';
  const files = readdirSync(DERIVED_DIR).filter(
    (name) => name.endsWith('.js') && name !== 'contract.js'
  );

  test('there are derived files to check', () => {
    assert.ok(files.length >= 5, `only found ${files.length} derived content files`);
  });

  for (const file of files) {
    test(`${file} contains no raw addresses`, () => {
      const source = readFileSync(join(DERIVED_DIR, file), 'utf8').replace(
        /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
        ''
      );
      const addresses = source.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g) || [];
      assert.deepEqual(
        addresses,
        [],
        `${file} hard-codes ${addresses.join(', ')} — import the symbol from contract.js instead`
      );
    });

    test(`${file} contains no raw infrastructure ids`, () => {
      const source = readFileSync(join(DERIVED_DIR, file), 'utf8').replace(
        /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
        ''
      );
      const ids = source.match(/'(?:u-|site-|net-|srv-|rtr-|sw-|fw-|pc-|scan-|phone-)[a-z0-9-]*'/g) || [];
      assert.deepEqual(
        ids,
        [],
        `${file} hard-codes ${ids.join(', ')} — import the symbol from contract.js instead`
      );
    });
  }
});

describe('symbols are well formed', () => {
  const registries = { SITE, NET, HOST, USER, GROUP, DNS_RECORD };

  for (const [label, registry] of Object.entries(registries)) {
    test(`${label} keys are SCREAMING_SNAKE and match their entry`, () => {
      for (const [key, entry] of Object.entries(registry)) {
        assert.match(key, /^[A-Z][A-Z0-9_]*$/, `${label}.${key} is not SCREAMING_SNAKE`);
        assert.equal(entry.key, key, `${label}.${key} carries key "${entry.key}"`);
      }
    });
  }

  test('every id is unique across the whole contract', () => {
    const seen = new Map();
    for (const [label, registry] of Object.entries({ SITE, NET, HOST, USER, GROUP })) {
      for (const entry of Object.values(registry)) {
        assert.ok(!seen.has(entry.id), `id "${entry.id}" is used by both ${seen.get(entry.id)} and ${label}.${entry.key}`);
        seen.set(entry.id, `${label}.${entry.key}`);
      }
    }
  });

  test('table names are unique', () => {
    const names = Object.values(TABLE);
    assert.equal(new Set(names).size, names.length);
  });
});

describe('addressing holds together', () => {
  test('every network is stated as its own network address', () => {
    for (const net of Object.values(NET)) {
      assert.equal(parseCidr(net.cidr).cidr, net.cidr, `NET.${net.key}: ${net.cidr} is not a network address`);
    }
  });

  test('no two networks overlap', () => {
    const nets = Object.values(NET);
    for (let i = 0; i < nets.length; i++) {
      for (let j = i + 1; j < nets.length; j++) {
        const a = parseCidr(nets[i].cidr);
        const b = parseCidr(nets[j].cidr);
        const overlap = contains(a, b.network) || contains(b, a.network);
        assert.ok(!overlap, `NET.${nets[i].key} (${a.cidr}) overlaps NET.${nets[j].key} (${b.cidr})`);
      }
    }
  });

  test('every LAN has a gateway inside itself, and the link networks do not', () => {
    for (const net of Object.values(NET)) {
      if (net.kind === 'lan') {
        assert.ok(net.gateway, `NET.${net.key} is a LAN with no gateway`);
        const block = parseCidr(net.cidr);
        assert.ok(contains(block, net.gateway), `NET.${net.key}: gateway ${net.gateway} is outside ${net.cidr}`);
        assert.notEqual(net.gateway, block.network, `NET.${net.key}: gateway is the network address`);
        assert.notEqual(net.gateway, block.broadcast, `NET.${net.key}: gateway is the broadcast address`);
      } else {
        assert.equal(net.gateway, null, `NET.${net.key} is a ${net.kind} link and should not have a gateway`);
        assert.equal(net.site, null, `NET.${net.key} is a ${net.kind} link and belongs to no single site`);
      }
    }
  });

  test('every port address is valid and sits on the network it claims', () => {
    for (const entry of Object.values(HOST)) {
      for (const port of entry.ports) {
        assert.ok(isIpv4(port.ip), `HOST.${entry.key}/${port.iface}: ${port.ip} is not an address`);
        assert.ok(
          contains(port.net.cidr, port.ip),
          `HOST.${entry.key}/${port.iface}: ${port.ip} is not inside ${port.net.key} (${port.net.cidr})`
        );
      }
    }
  });

  test('no address is used twice', () => {
    const seen = new Map();
    for (const entry of Object.values(HOST)) {
      for (const port of entry.ports) {
        const owner = `HOST.${entry.key}/${port.iface}`;
        assert.ok(!seen.has(port.ip), `${port.ip} is on both ${seen.get(port.ip)} and ${owner}`);
        seen.set(port.ip, owner);
      }
    }
  });

  test('every gateway is genuinely held by a router or firewall', () => {
    const holders = new Map();
    for (const entry of Object.values(HOST)) {
      for (const port of entry.ports) holders.set(port.ip, entry);
    }
    for (const net of Object.values(NET)) {
      if (!net.gateway) continue;
      const holder = holders.get(net.gateway);
      assert.ok(holder, `NET.${net.key}: nothing holds the gateway ${net.gateway}`);
      assert.ok(
        ['router', 'firewall'].includes(holder.kind),
        `NET.${net.key}: gateway is held by a ${holder.kind} (HOST.${holder.key})`
      );
    }
  });

  test('ports are listed in interface order, so `ip` really is the primary', () => {
    for (const entry of Object.values(HOST)) {
      const names = entry.ports.map((port) => port.iface);
      assert.deepEqual(names, [...names].sort(), `HOST.${entry.key} lists ports out of order`);
      assert.equal(entry.ip, entry.ports[0].ip);
      assert.equal(entry.iface, entry.ports[0].iface);
    }
  });

  test('a host on a site-bound network is at that site', () => {
    for (const entry of Object.values(HOST)) {
      for (const port of entry.ports) {
        if (!port.net.site) continue;
        assert.equal(
          port.net.site.id,
          entry.site.id,
          `HOST.${entry.key} is at ${entry.site.id} but holds an address on ${port.net.key} (${port.net.site.id})`
        );
      }
    }
  });
});

describe('DNS follows the contract', () => {
  test('every name is inside the zone', () => {
    for (const record of Object.values(DNS_RECORD)) {
      assert.ok(record.name.endsWith(`.${ZONE}`), `${record.key}: ${record.name} is outside ${ZONE}`);
    }
  });

  test('every A record points at an address a host really holds', () => {
    const held = new Set();
    for (const entry of Object.values(HOST)) {
      for (const port of entry.ports) held.add(port.ip);
    }
    for (const record of Object.values(DNS_RECORD)) {
      if (record.type !== 'A') continue;
      assert.ok(held.has(record.value), `DNS_RECORD.${record.key} -> ${record.value}, which nothing holds`);
    }
  });

  test('an A record that names a host agrees with that host', () => {
    for (const record of Object.values(DNS_RECORD)) {
      if (record.type !== 'A' || !record.host) continue;
      const addresses = record.host.ports.map((port) => port.ip);
      assert.ok(
        addresses.includes(record.value),
        `DNS_RECORD.${record.key} claims HOST.${record.host.key} but points at ${record.value}`
      );
    }
  });

  test('every CNAME resolves within the zone and never to itself', () => {
    const names = new Set(Object.values(DNS_RECORD).map((record) => record.name.toLowerCase()));
    for (const record of Object.values(DNS_RECORD)) {
      if (record.type !== 'CNAME') continue;
      assert.notEqual(record.value.toLowerCase(), record.name.toLowerCase(), `${record.key} is a CNAME to itself`);
      assert.ok(names.has(record.value.toLowerCase()), `${record.key} -> ${record.value}, which does not exist`);
    }
  });
});

describe('people follow the contract', () => {
  test('logins are unique', () => {
    const logins = Object.values(USER).map((user) => user.login);
    assert.equal(new Set(logins).size, logins.length);
  });

  test('an assigned machine is at the same site as its owner', () => {
    for (const user of Object.values(USER)) {
      if (!user.host) continue;
      assert.equal(
        user.host.site.id,
        user.site.id,
        `USER.${user.key} is at ${user.site.id} but their machine is at ${user.host.site.id}`
      );
    }
  });

  test('no machine is assigned to two people', () => {
    const assigned = new Map();
    for (const user of Object.values(USER)) {
      if (!user.host) continue;
      assert.ok(
        !assigned.has(user.host.id),
        `${user.host.id} is assigned to both ${assigned.get(user.host.id)} and USER.${user.key}`
      );
      assigned.set(user.host.id, `USER.${user.key}`);
    }
  });

  test('the teaching properties the missions depend on are still true', () => {
    assert.equal(USER.RAVI.groups.includes(GROUP.DOMAIN_ADMINS), true, 'RAVI must hold domain-admin');
    assert.equal(USER.JORDAN.enabled, false, 'JORDAN must be a dormant account');
    assert.equal(USER.SVC_BACKUP.groups.includes(GROUP.SERVICE_ACCOUNTS), true, 'SVC_BACKUP must be a service account');
    assert.equal(USER.SVC_BACKUP.host, null, 'a service account should have no machine');
  });
});
