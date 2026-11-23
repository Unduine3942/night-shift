/**
 * Selectors — the only seam between the world and anything that looks at it.
 *
 * The terminal, the topology view, the log stream and the SQL playground are all
 * meant to be different lenses on ONE company. That only holds if they read the
 * same facts the same way. So nothing reaches into `world.net.devices` directly;
 * everything comes through here, and the cross-lens consistency tests assert that
 * a host's address is identical whichever lens asks.
 *
 * Rules these all follow:
 *   - pure: never mutate, never touch the clock or randomness
 *   - forgiving: a missing thing is `null` or `[]`, never a thrown error, because
 *     a mission grading "is DNS fixed yet?" must be able to ask and get "no"
 *   - deterministic: collections come back sorted by id, so replays, snapshots
 *     and tests never depend on object key order
 *
 * The exception is a malformed *argument* — an IP that is not an IP is a caller
 * bug, and that still throws.
 */

import { getIn } from '../immutable.js';
import { requireIpv4 } from '../validate.js';
import { contains } from '../net/cidr.js';

/* ---------- internals ---------- */

function values(map) {
  return map && typeof map === 'object' ? Object.values(map) : [];
}

function byId(a, b) {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function byName(a, b) {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

function lower(text) {
  return typeof text === 'string' ? text.toLowerCase() : '';
}

/* ---------- time ---------- */

export function selectTick(world) {
  return getIn(world, ['tick'], 0);
}

/* ---------- sites ---------- */

export function selectSites(world) {
  return values(getIn(world, ['sites'])).sort(byId);
}

export function selectSite(world, siteId) {
  return getIn(world, ['sites', siteId], null);
}

/* ---------- devices ---------- */

export function selectDevices(world) {
  return values(getIn(world, ['net', 'devices'])).sort(byId);
}

export function selectDevice(world, deviceId) {
  return getIn(world, ['net', 'devices', deviceId], null);
}

export function selectDevicesAtSite(world, siteId) {
  return selectDevices(world).filter((device) => device.siteId === siteId);
}

export function selectInterfaces(world, deviceId) {
  return values(getIn(world, ['net', 'devices', deviceId, 'interfaces'])).sort(byName);
}

export function selectInterface(world, deviceId, ifaceName) {
  return getIn(world, ['net', 'devices', deviceId, 'interfaces', ifaceName], null);
}

/** The first addressed interface, in interface-name order. */
export function selectPrimaryIp(world, deviceId) {
  const addressed = selectInterfaces(world, deviceId).find((iface) => iface.ip);
  return addressed ? addressed.ip : null;
}

/**
 * Which device holds this address, and on which interface?
 *
 * This is the lookup that makes the illusion work: a log line carrying an IP, a
 * `ping` reply, and a box in the topology diagram all resolve through here, so
 * they cannot disagree.
 *
 * @returns {{device: object, iface: object}|null}
 */
export function selectDeviceByIp(world, ip) {
  requireIpv4(ip, 'ip');
  for (const device of selectDevices(world)) {
    for (const iface of selectInterfaces(world, device.id)) {
      if (iface.ip === ip) return { device, iface };
    }
  }
  return null;
}

/* ---------- subnets ---------- */

export function selectSubnets(world) {
  return values(getIn(world, ['net', 'subnets'])).sort(byId);
}

export function selectSubnet(world, subnetId) {
  return getIn(world, ['net', 'subnets', subnetId], null);
}

export function selectSubnetForIp(world, ip) {
  for (const subnet of selectSubnets(world)) {
    if (contains(subnet.cidr, ip)) return subnet;
  }
  return null;
}

/** Every device with at least one interface addressed on this subnet. */
export function selectDevicesOnSubnet(world, subnetId) {
  const subnet = selectSubnet(world, subnetId);
  if (!subnet) return [];
  return selectDevices(world).filter((device) =>
    selectInterfaces(world, device.id).some((iface) => iface.ip && contains(subnet.cidr, iface.ip))
  );
}

/* ---------- dns ---------- */

/** Case-insensitive, as DNS is. Returns the record, not just the value. */
export function resolveDns(world, name, type = 'A') {
  const wanted = lower(name);
  const found = getIn(world, ['net', 'dns', 'records'], []).find(
    (record) => lower(record.name) === wanted && record.type === type
  );
  return found || null;
}

/** Address -> name, via the A records. */
export function reverseDns(world, ip) {
  const found = getIn(world, ['net', 'dns', 'records'], []).find(
    (record) => record.type === 'A' && record.value === ip
  );
  return found ? found.name : null;
}

/* ---------- identity ---------- */

export function selectUsers(world) {
  return values(getIn(world, ['identity', 'users'])).sort(byId);
}

export function selectUser(world, userId) {
  return getIn(world, ['identity', 'users', userId], null);
}

export function selectUserByLogin(world, login) {
  const wanted = lower(login);
  return selectUsers(world).find((user) => lower(user.login) === wanted) || null;
}

/**
 * Every group in the directory.
 *
 * Groups were readable only from the user side — you could ask what somebody was
 * in, but not who was in something. An access review needs the second question,
 * so it belongs here in the one seam every lens reads through.
 */
export function selectGroups(world) {
  return Object.values(getIn(world, ['identity', 'groups'], {}));
}

export function selectGroup(world, groupId) {
  return getIn(world, ['identity', 'groups', groupId], null);
}

export function selectUsersInGroup(world, group) {
  return selectUsers(world).filter((user) => (user.groups || []).includes(group));
}

/* ---------- data tables ---------- */

export function selectTableNames(world) {
  return Object.keys(getIn(world, ['data', 'tables'], {})).sort();
}

export function selectTable(world, tableName) {
  return getIn(world, ['data', 'tables', tableName], []);
}

export function selectRow(world, tableName, id) {
  return selectTable(world, tableName).find((row) => row.id === id) || null;
}
