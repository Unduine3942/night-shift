import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isNonEmptyString,
  isFiniteNumber,
  isBoolean,
  isPlainObject,
  isIpv4,
  isPrefixLength,
  ipToInt,
  intToIp,
  check,
  requireString,
  requireBoolean,
  requireInteger,
  requireOneOf,
  requireIpv4
} from '../../src/core/validate.js';

describe('type predicates', () => {
  test('isNonEmptyString', () => {
    assert.equal(isNonEmptyString('rtr-1'), true);
    assert.equal(isNonEmptyString('  '), false);
    assert.equal(isNonEmptyString(''), false);
    assert.equal(isNonEmptyString(5), false);
    assert.equal(isNonEmptyString(null), false);
  });

  test('isFiniteNumber', () => {
    assert.equal(isFiniteNumber(0), true);
    assert.equal(isFiniteNumber(-2.5), true);
    assert.equal(isFiniteNumber(Number.NaN), false);
    assert.equal(isFiniteNumber(Number.POSITIVE_INFINITY), false);
    assert.equal(isFiniteNumber('5'), false);
  });

  test('isBoolean', () => {
    assert.equal(isBoolean(false), true);
    assert.equal(isBoolean(0), false);
  });

  test('isPlainObject', () => {
    assert.equal(isPlainObject({}), true);
    assert.equal(isPlainObject([]), false);
    assert.equal(isPlainObject(null), false);
    assert.equal(isPlainObject(new Date(0)), false);
  });
});

describe('isIpv4', () => {
  test('accepts ordinary addresses', () => {
    for (const ip of ['0.0.0.0', '10.20.30.40', '192.168.1.1', '255.255.255.255']) {
      assert.equal(isIpv4(ip), true, ip);
    }
  });

  test('rejects malformed addresses', () => {
    const bad = [
      '10.20.30', '10.20.30.40.50', '256.1.1.1', '10.20.30.-1',
      '10.20.30.a', '', '10.20.30.040', ' 10.20.30.40', '10.20.30.40 ',
      '10..30.40', null, 42
    ];
    for (const ip of bad) assert.equal(isIpv4(ip), false, String(ip));
  });

  test('allows a bare zero octet but not a padded one', () => {
    assert.equal(isIpv4('10.0.0.1'), true);
    assert.equal(isIpv4('10.00.0.1'), false);
  });
});

describe('isPrefixLength', () => {
  test('accepts 0 through 32', () => {
    assert.equal(isPrefixLength(0), true);
    assert.equal(isPrefixLength(24), true);
    assert.equal(isPrefixLength(32), true);
  });

  test('rejects anything else', () => {
    for (const value of [-1, 33, 24.5, '24', null]) {
      assert.equal(isPrefixLength(value), false, String(value));
    }
  });
});

describe('ip integer conversion', () => {
  test('round-trips', () => {
    for (const ip of ['0.0.0.0', '10.20.30.40', '192.168.1.1', '255.255.255.255']) {
      assert.equal(intToIp(ipToInt(ip)), ip);
    }
  });

  test('produces the expected integers', () => {
    assert.equal(ipToInt('0.0.0.0'), 0);
    assert.equal(ipToInt('0.0.0.1'), 1);
    assert.equal(ipToInt('0.0.1.0'), 256);
    assert.equal(ipToInt('10.0.0.1'), 167772161);
    assert.equal(ipToInt('255.255.255.255'), 4294967295);
  });

  test('stays unsigned above 2^31', () => {
    assert.ok(ipToInt('192.168.1.1') > 0);
    assert.equal(ipToInt('128.0.0.0'), 2147483648);
  });

  test('rejects a bad address', () => {
    assert.throws(() => ipToInt('999.1.1.1'), /ipv4/i);
  });
});

describe('check', () => {
  test('passes silently when the condition holds', () => {
    assert.doesNotThrow(() => check(true, 'should not throw'));
  });

  test('throws a TypeError carrying the message', () => {
    assert.throws(() => check(false, 'deviceId is required'), {
      name: 'TypeError',
      message: /deviceId is required/
    });
  });
});

describe('require helpers', () => {
  test('requireString returns the value or names the field', () => {
    assert.equal(requireString('rtr-1', 'deviceId'), 'rtr-1');
    assert.throws(() => requireString('', 'deviceId'), /deviceId/);
    assert.throws(() => requireString(7, 'deviceId'), /deviceId/);
  });

  test('requireBoolean is strict about the type', () => {
    assert.equal(requireBoolean(false, 'on'), false);
    assert.throws(() => requireBoolean('true', 'on'), /on/);
    assert.throws(() => requireBoolean(1, 'on'), /on/);
  });

  test('requireInteger honours bounds', () => {
    assert.equal(requireInteger(5, 'seconds'), 5);
    assert.equal(requireInteger(5, 'seconds', { min: 1, max: 10 }), 5);
    assert.throws(() => requireInteger(0, 'seconds', { min: 1 }), /seconds/);
    assert.throws(() => requireInteger(11, 'seconds', { max: 10 }), /seconds/);
    assert.throws(() => requireInteger(1.5, 'seconds'), /seconds/);
  });

  test('requireOneOf lists the accepted values', () => {
    assert.equal(requireOneOf('A', ['A', 'CNAME'], 'type'), 'A');
    assert.throws(() => requireOneOf('AAAA', ['A', 'CNAME'], 'type'), /type/);
    assert.throws(() => requireOneOf('AAAA', ['A', 'CNAME'], 'type'), /A, CNAME/);
  });

  test('requireIpv4 names the field', () => {
    assert.equal(requireIpv4('10.20.30.40', 'ip'), '10.20.30.40');
    assert.throws(() => requireIpv4('10.20.30', 'ip'), /ip/);
  });
});
