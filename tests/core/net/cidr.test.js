import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCidr,
  contains,
  networkAddress,
  broadcastAddress,
  prefixToMask,
  maskToPrefix,
  usableHosts,
  firstHost,
  lastHost,
  sameSubnet,
  formatCidr
} from '../../../src/core/net/cidr.js';

describe('parseCidr', () => {
  test('describes an ordinary /24', () => {
    const net = parseCidr('10.20.10.0/24');
    assert.equal(net.network, '10.20.10.0');
    assert.equal(net.prefix, 24);
    assert.equal(net.mask, '255.255.255.0');
    assert.equal(net.broadcast, '10.20.10.255');
    assert.equal(net.firstHost, '10.20.10.1');
    assert.equal(net.lastHost, '10.20.10.254');
    assert.equal(net.usable, 254);
    assert.equal(net.size, 256);
  });

  test('normalises a host address down to its network', () => {
    assert.equal(parseCidr('10.20.10.37/24').network, '10.20.10.0');
    assert.equal(parseCidr('192.168.1.200/25').network, '192.168.1.128');
  });

  test('handles a /30 point-to-point link', () => {
    const net = parseCidr('172.16.0.0/30');
    assert.equal(net.size, 4);
    assert.equal(net.usable, 2);
    assert.equal(net.firstHost, '172.16.0.1');
    assert.equal(net.lastHost, '172.16.0.2');
    assert.equal(net.broadcast, '172.16.0.3');
  });

  test('handles /31 as an RFC 3021 link with two usable addresses', () => {
    const net = parseCidr('172.16.0.4/31');
    assert.equal(net.size, 2);
    assert.equal(net.usable, 2);
    assert.equal(net.firstHost, '172.16.0.4');
    assert.equal(net.lastHost, '172.16.0.5');
  });

  test('handles /32 as a single host', () => {
    const net = parseCidr('10.0.0.5/32');
    assert.equal(net.size, 1);
    assert.equal(net.usable, 1);
    assert.equal(net.network, '10.0.0.5');
    assert.equal(net.firstHost, '10.0.0.5');
    assert.equal(net.lastHost, '10.0.0.5');
  });

  test('handles /0', () => {
    const net = parseCidr('0.0.0.0/0');
    assert.equal(net.size, 4294967296);
    assert.equal(net.broadcast, '255.255.255.255');
  });

  test('accepts a separate address and prefix', () => {
    assert.equal(parseCidr('10.20.10.0', 24).prefix, 24);
  });

  test('rejects malformed input by naming the problem', () => {
    assert.throws(() => parseCidr('10.20.10.0'), /prefix/i);
    assert.throws(() => parseCidr('10.20.10.0/33'), /prefix/i);
    assert.throws(() => parseCidr('10.20.10.0/-1'), /prefix/i);
    assert.throws(() => parseCidr('10.20.300.0/24'), /ipv4/i);
    assert.throws(() => parseCidr('not an address/24'), /ipv4/i);
    assert.throws(() => parseCidr(''), /prefix/i);
  });
});

describe('masks', () => {
  test('prefixToMask', () => {
    assert.equal(prefixToMask(0), '0.0.0.0');
    assert.equal(prefixToMask(8), '255.0.0.0');
    assert.equal(prefixToMask(16), '255.255.0.0');
    assert.equal(prefixToMask(24), '255.255.255.0');
    assert.equal(prefixToMask(25), '255.255.255.128');
    assert.equal(prefixToMask(30), '255.255.255.252');
    assert.equal(prefixToMask(32), '255.255.255.255');
  });

  test('maskToPrefix is the inverse', () => {
    for (let prefix = 0; prefix <= 32; prefix++) {
      assert.equal(maskToPrefix(prefixToMask(prefix)), prefix);
    }
  });

  test('maskToPrefix rejects a non-contiguous mask', () => {
    assert.throws(() => maskToPrefix('255.0.255.0'), /contiguous/i);
    assert.throws(() => maskToPrefix('255.255.255.1'), /contiguous/i);
  });

  test('prefixToMask rejects a bad prefix', () => {
    assert.throws(() => prefixToMask(33), /prefix/i);
    assert.throws(() => prefixToMask(-1), /prefix/i);
  });
});

describe('usableHosts', () => {
  test('follows the normal rule above /30', () => {
    assert.equal(usableHosts(24), 254);
    assert.equal(usableHosts(25), 126);
    assert.equal(usableHosts(30), 2);
    assert.equal(usableHosts(16), 65534);
  });

  test('treats /31 and /32 as the special cases they are', () => {
    assert.equal(usableHosts(31), 2);
    assert.equal(usableHosts(32), 1);
  });
});

describe('contains', () => {
  test('recognises membership', () => {
    assert.equal(contains('10.20.10.0/24', '10.20.10.1'), true);
    assert.equal(contains('10.20.10.0/24', '10.20.10.255'), true);
    assert.equal(contains('10.20.10.0/24', '10.20.11.1'), false);
    assert.equal(contains('10.20.0.0/16', '10.20.99.7'), true);
    assert.equal(contains('0.0.0.0/0', '8.8.8.8'), true);
  });

  test('is exact at the boundaries', () => {
    assert.equal(contains('192.168.1.0/25', '192.168.1.127'), true);
    assert.equal(contains('192.168.1.0/25', '192.168.1.128'), false);
  });

  test('rejects a bad address rather than guessing', () => {
    assert.throws(() => contains('10.20.10.0/24', '10.20.10.256'), /ipv4/i);
  });
});

describe('address helpers', () => {
  test('networkAddress and broadcastAddress', () => {
    assert.equal(networkAddress('10.20.10.37', 24), '10.20.10.0');
    assert.equal(broadcastAddress('10.20.10.37', 24), '10.20.10.255');
    assert.equal(networkAddress('192.168.1.200', 26), '192.168.1.192');
    assert.equal(broadcastAddress('192.168.1.200', 26), '192.168.1.255');
  });

  test('firstHost and lastHost', () => {
    assert.equal(firstHost('10.20.10.0', 24), '10.20.10.1');
    assert.equal(lastHost('10.20.10.0', 24), '10.20.10.254');
  });

  test('sameSubnet compares two addresses under one mask', () => {
    assert.equal(sameSubnet('10.20.10.5', '10.20.10.200', 24), true);
    assert.equal(sameSubnet('10.20.10.5', '10.20.11.5', 24), false);
    assert.equal(sameSubnet('10.20.10.5', '10.20.11.5', 16), true);
  });

  test('formatCidr renders back to notation', () => {
    assert.equal(formatCidr('10.20.10.37', 24), '10.20.10.0/24');
  });
});

describe('purity', () => {
  test('parseCidr returns a frozen description', () => {
    const net = parseCidr('10.20.10.0/24');
    assert.ok(Object.isFrozen(net));
  });
});
