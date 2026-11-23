/**
 * Can this machine talk to that one?
 *
 * One function, consulted by `ping`, `ssh`, `nmap` and `traceroute`, so they can
 * never disagree about whether a host is up. Four lenses onto the same network
 * that answer differently is precisely the failure this project is arranged to
 * avoid, and reachability is where it would show first.
 *
 * The model is deliberately shallow but honest about what breaks a path:
 *
 *   powered off        the host is not there at all
 *   interface down     the host is there and cannot hear you
 *   no address         the host does not know who it is
 *   different subnet   needs a gateway, and the gateway has to be up too
 *
 * Those are the four causes a night-desk technician spends their life
 * distinguishing, and each one produces a different, recognisable symptom.
 */

import { contains } from '../net/cidr.js';
import { selectDevice, selectInterfaces, selectSubnets, selectSubnetForIp } from '../world/select.js';

export const UP = 'up';
export const POWERED_OFF = 'powered-off';
export const NO_INTERFACE = 'no-interface';
export const IFACE_DOWN = 'interface-down';
export const NO_ADDRESS = 'no-address';
export const NO_GATEWAY = 'no-gateway';
export const GATEWAY_DOWN = 'gateway-down';
export const NO_SUCH_HOST = 'no-such-host';

/** Every interface that is up and has an address. */
export function liveInterfaces(world, deviceId) {
  return selectInterfaces(world, deviceId).filter((iface) => iface.up && iface.ip);
}

/**
 * Why this host cannot be reached at all, or null if it can be.
 * Ignores where you are asking from — that is `pathBetween`'s job.
 */
export function hostStatus(world, deviceId) {
  const device = selectDevice(world, deviceId);
  if (!device) return NO_SUCH_HOST;
  if (!device.powered) return POWERED_OFF;

  const interfaces = selectInterfaces(world, deviceId);
  if (interfaces.length === 0) return NO_INTERFACE;
  if (!interfaces.some((iface) => iface.up)) return IFACE_DOWN;
  if (!interfaces.some((iface) => iface.up && iface.ip)) return NO_ADDRESS;

  return UP;
}

/** The device holding this address on an interface that is up. */
function gatewayFor(world, subnet) {
  if (!subnet || !subnet.gateway) return null;
  for (const device of Object.values(world.net.devices)) {
    for (const iface of liveInterfaces(world, device.id)) {
      if (iface.ip === subnet.gateway) return device;
    }
  }
  return null;
}

function subnetOf(world, ip) {
  return selectSubnetForIp(world, ip);
}

/**
 * Work out whether `fromId` can reach `toId`, and by what route.
 *
 * @returns {{ok: boolean, reason: string, via?: string, sourceIp?: string, targetIp?: string, sameSubnet?: boolean}}
 */
export function pathBetween(world, fromId, toId) {
  const sourceStatus = hostStatus(world, fromId);
  if (sourceStatus !== UP) return { ok: false, reason: `source-${sourceStatus}` };

  const targetStatus = hostStatus(world, toId);
  if (targetStatus !== UP) return { ok: false, reason: targetStatus };

  const sources = liveInterfaces(world, fromId);
  const targets = liveInterfaces(world, toId);

  // Same wire: no router involved, so nothing in between can break it.
  for (const source of sources) {
    const subnet = subnetOf(world, source.ip);
    if (!subnet) continue;
    for (const target of targets) {
      if (contains(subnet.cidr, target.ip)) {
        return { ok: true, reason: UP, sameSubnet: true, sourceIp: source.ip, targetIp: target.ip };
      }
    }
  }

  // Off-subnet: both ends need a working gateway.
  const source = sources[0];
  const target = targets[0];
  const sourceSubnet = subnetOf(world, source.ip);
  const targetSubnet = subnetOf(world, target.ip);

  if (!sourceSubnet || !sourceSubnet.gateway) {
    return { ok: false, reason: NO_GATEWAY, sourceIp: source.ip, targetIp: target.ip };
  }

  const gateway = gatewayFor(world, sourceSubnet);
  if (!gateway) {
    return { ok: false, reason: GATEWAY_DOWN, sourceIp: source.ip, targetIp: target.ip, via: sourceSubnet.gateway };
  }

  if (targetSubnet && targetSubnet.gateway && !gatewayFor(world, targetSubnet)) {
    return { ok: false, reason: GATEWAY_DOWN, sourceIp: source.ip, targetIp: target.ip, via: targetSubnet.gateway };
  }

  return {
    ok: true,
    reason: UP,
    sameSubnet: false,
    via: sourceSubnet.gateway,
    sourceIp: source.ip,
    targetIp: target.ip
  };
}

/**
 * The hops between two hosts, for traceroute.
 * Each entry is `{ip, deviceId}`; the last is the destination itself.
 */
export function hopsBetween(world, fromId, toId) {
  const path = pathBetween(world, fromId, toId);
  if (!path.ok) return { ok: false, reason: path.reason, hops: [] };
  if (path.sameSubnet) return { ok: true, hops: [{ ip: path.targetIp, deviceId: toId }] };

  const hops = [];
  const sourceSubnet = subnetOf(world, path.sourceIp);
  const targetSubnet = subnetOf(world, path.targetIp);

  const sourceGateway = gatewayFor(world, sourceSubnet);
  if (sourceGateway) hops.push({ ip: sourceSubnet.gateway, deviceId: sourceGateway.id });

  const targetGateway = gatewayFor(world, targetSubnet);
  if (targetGateway && targetGateway.id !== (sourceGateway && sourceGateway.id)) {
    hops.push({ ip: targetSubnet.gateway, deviceId: targetGateway.id });
  }

  hops.push({ ip: path.targetIp, deviceId: toId });
  return { ok: true, hops };
}

/**
 * Find a device by whatever the player typed: an id, an address, or a DNS name
 * already resolved to an address by the caller.
 */
export function findHost(world, token) {
  const byId = selectDevice(world, token);
  if (byId) return byId;

  for (const device of Object.values(world.net.devices)) {
    for (const iface of selectInterfaces(world, device.id)) {
      if (iface.ip === token) return device;
    }
  }
  return null;
}

/** Subnets the world knows about, for `route`. */
export function knownSubnets(world) {
  return selectSubnets(world);
}
