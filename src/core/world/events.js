/**
 * Event definitions — the vocabulary of everything that can happen in the world.
 *
 * The world is never edited directly. It is rebuilt by replaying an ordered log of
 * these records over the seed. That is what makes missions authorable: a mission
 * declares what it needs, emits events into a scratch layer, and either commits
 * them or throws them away. Nothing can quietly leave the world in a state a later
 * mission did not expect.
 *
 * An event is `{ type, at, payload }` and nothing else — plain, frozen, and
 * JSON-serialisable, because the save file IS the event log.
 *
 * Each definition supplies:
 *   validate(payload) -> normalised payload, or throws naming the bad field
 *   apply(world, payload, event) -> new world, or throws naming the missing target
 *
 * `apply` never advances the clock; reduce.js does that from `event.at`.
 */

import { getIn, setIn } from '../immutable.js';
import {
  check,
  isPlainObject,
  requireString,
  requireBoolean,
  requireInteger,
  requireOneOf,
  requireIpv4
} from '../validate.js';

const DNS_TYPES = ['A', 'CNAME', 'MX', 'TXT', 'PTR', 'SRV', 'NS'];
const DEFAULT_TTL = 300;

/* ---------- lookup helpers that fail with the name of the thing ---------- */

/**
 * These ids come out of event payloads, and event payloads come out of save
 * files that have been through a USB stick. `getIn` reads own properties only,
 * so a lookup for `toString` or `__proto__` misses rather than finding something
 * inherited and concluding the device exists — but the plain-object check below
 * is what makes that explicit rather than incidental.
 */
function requireRecord(value, message) {
  check(value !== undefined && value !== null && typeof value === 'object' && !Array.isArray(value), message);
  return value;
}

function requireDevice(world, deviceId) {
  return requireRecord(getIn(world, ['net', 'devices', deviceId]), `no such device: ${deviceId}`);
}

function requireInterface(world, deviceId, iface) {
  requireDevice(world, deviceId);
  return requireRecord(
    getIn(world, ['net', 'devices', deviceId, 'interfaces', iface]),
    `no such interface: ${iface} on ${deviceId}`
  );
}

function requireUser(world, userId) {
  return requireRecord(getIn(world, ['identity', 'users', userId]), `no such user: ${userId}`);
}

function dnsRecords(world) {
  return getIn(world, ['net', 'dns', 'records'], []);
}

/* ---------- the registry ---------- */

export const EVENT_DEFINITIONS = {
  /** Moves time and nothing else. The clock comes from `at`. */
  'world/tick': {
    scope: 'world',
    validate: () => ({}),
    apply: (world) => world
  },

  'net/device-power': {
    scope: 'world',
    validate: (payload) => ({
      deviceId: requireString(payload.deviceId, 'deviceId'),
      on: requireBoolean(payload.on, 'on')
    }),
    apply: (world, payload) => {
      requireDevice(world, payload.deviceId);
      return setIn(world, ['net', 'devices', payload.deviceId, 'powered'], payload.on);
    }
  },

  'net/iface-ip-set': {
    scope: 'world',
    validate: (payload) => ({
      deviceId: requireString(payload.deviceId, 'deviceId'),
      iface: requireString(payload.iface, 'iface'),
      ip: requireIpv4(payload.ip, 'ip'),
      prefix: requireInteger(payload.prefix, 'prefix', { min: 0, max: 32 })
    }),
    apply: (world, payload) => {
      const iface = requireInterface(world, payload.deviceId, payload.iface);
      return setIn(
        world,
        ['net', 'devices', payload.deviceId, 'interfaces', payload.iface],
        { ...iface, ip: payload.ip, prefix: payload.prefix }
      );
    }
  },

  'net/iface-state': {
    scope: 'world',
    validate: (payload) => ({
      deviceId: requireString(payload.deviceId, 'deviceId'),
      iface: requireString(payload.iface, 'iface'),
      up: requireBoolean(payload.up, 'up')
    }),
    apply: (world, payload) => {
      const iface = requireInterface(world, payload.deviceId, payload.iface);
      return setIn(
        world,
        ['net', 'devices', payload.deviceId, 'interfaces', payload.iface],
        { ...iface, up: payload.up }
      );
    }
  },

  /** Upsert by (name, type) so a record is corrected, not duplicated. */
  'net/dns-record-set': {
    scope: 'world',
    validate: (payload) => ({
      name: requireString(payload.name, 'name'),
      type: requireOneOf(payload.type, DNS_TYPES, 'type'),
      value: requireString(payload.value, 'value'),
      ttl:
        payload.ttl === undefined
          ? DEFAULT_TTL
          : requireInteger(payload.ttl, 'ttl', { min: 0 })
    }),
    apply: (world, payload) => {
      const records = dnsRecords(world);
      const record = {
        name: payload.name,
        type: payload.type,
        value: payload.value,
        ttl: payload.ttl
      };
      const index = records.findIndex((r) => r.name === payload.name && r.type === payload.type);
      const next =
        index === -1
          ? [...records, record]
          : records.map((existing, i) => (i === index ? record : existing));
      return setIn(world, ['net', 'dns', 'records'], next);
    }
  },

  'net/dns-record-remove': {
    scope: 'world',
    validate: (payload) => ({
      name: requireString(payload.name, 'name'),
      type: requireOneOf(payload.type, DNS_TYPES, 'type')
    }),
    apply: (world, payload) =>
      setIn(
        world,
        ['net', 'dns', 'records'],
        dnsRecords(world).filter((r) => !(r.name === payload.name && r.type === payload.type))
      )
  },

  'identity/user-set-enabled': {
    scope: 'world',
    validate: (payload) => ({
      userId: requireString(payload.userId, 'userId'),
      enabled: requireBoolean(payload.enabled, 'enabled')
    }),
    apply: (world, payload) => {
      requireUser(world, payload.userId);
      return setIn(world, ['identity', 'users', payload.userId, 'enabled'], payload.enabled);
    }
  },

  'identity/user-group-add': {
    scope: 'world',
    validate: (payload) => ({
      userId: requireString(payload.userId, 'userId'),
      group: requireString(payload.group, 'group')
    }),
    apply: (world, payload) => {
      requireUser(world, payload.userId);
      const path = ['identity', 'users', payload.userId, 'groups'];
      const groups = getIn(world, path, []);
      return groups.includes(payload.group) ? world : setIn(world, path, [...groups, payload.group]);
    }
  },

  'identity/user-group-remove': {
    scope: 'world',
    validate: (payload) => ({
      userId: requireString(payload.userId, 'userId'),
      group: requireString(payload.group, 'group')
    }),
    apply: (world, payload) => {
      requireUser(world, payload.userId);
      const path = ['identity', 'users', payload.userId, 'groups'];
      return setIn(
        world,
        path,
        getIn(world, path, []).filter((group) => group !== payload.group)
      );
    }
  }
};

/* ---------- public API ---------- */

export function listEventTypes() {
  return Object.keys(EVENT_DEFINITIONS);
}

export function isKnownEventType(type) {
  return Object.prototype.hasOwnProperty.call(EVENT_DEFINITIONS, type);
}

export function getEventDefinition(type) {
  check(isKnownEventType(type), `unknown event type: ${type}`);
  return EVENT_DEFINITIONS[type];
}

export function eventScope(type) {
  return getEventDefinition(type).scope;
}

/**
 * Build a validated, frozen event. Payload defaults are filled in here, so an
 * event is fully normalised the moment it exists.
 */
export function createEvent(type, payload = {}, at = 0) {
  const definition = getEventDefinition(type);
  requireInteger(at, 'at', { min: 0 });
  check(isPlainObject(payload), `payload for ${type} must be an object`);
  return Object.freeze({
    type,
    at,
    payload: Object.freeze(definition.validate(payload))
  });
}

/**
 * Re-check an event that did not come from createEvent — one replayed out of a
 * save file, for instance. Returns the event itself so it can be used inline.
 */
export function validateEvent(event) {
  check(isPlainObject(event), `event must be an object, got ${event === null ? 'null' : typeof event}`);
  requireString(event.type, 'event.type');
  requireInteger(event.at, 'event.at', { min: 0 });
  check(isPlainObject(event.payload), `event.payload must be an object for ${event.type}`);
  getEventDefinition(event.type).validate(event.payload);
  return event;
}
