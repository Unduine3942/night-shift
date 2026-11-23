/**
 * Turning whatever the player typed into a machine.
 *
 * `ping app01`, `ping app01.meridian.local`, `ping 10.20.10.30` and
 * `ping srv-app01` should all reach the same box, and every tool must agree about
 * that — so they all come through here rather than each doing their own lookup.
 *
 * The CNAME chain is followed and reported rather than silently flattened,
 * because "the alias resolves, the name it points at does not" is a fault the
 * player is meant to be able to see.
 */

import { resolveDns, selectDevice } from '../../world/select.js';
import { findHost } from '../reach.js';

const IPV4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

const zoneOf = (world) => (world.meta && world.meta.zone) || '';

/** Try the name as typed, then qualified with the local zone, as a resolver would. */
function lookup(world, name, type) {
  return resolveDns(world, name, type) || resolveDns(world, `${name}.${zoneOf(world)}`, type);
}

/**
 * @returns {{
 *   device: object|null, address: string|null, label: string,
 *   chain: Array<{name: string, type: string, value: string}>,
 *   dangling: string|null
 * }}
 * `dangling` names the link in the chain that did not resolve, when one did not.
 */
export function resolveTarget(world, token) {
  const empty = { device: null, address: null, label: token, chain: [], dangling: null };
  if (!token) return empty;

  // A literal address needs no resolver.
  if (IPV4.test(token)) {
    const device = findHost(world, token);
    return { device, address: token, label: token, chain: [], dangling: null };
  }

  // A device id is what the tools themselves print, so it must work as input.
  const byId = selectDevice(world, token);
  if (byId) {
    const iface = Object.values(byId.interfaces || {}).find((entry) => entry.ip);
    return { device: byId, address: iface ? iface.ip : null, label: byId.id, chain: [], dangling: null };
  }

  // Otherwise it is a name. Follow CNAMEs, with a cap so a loop cannot hang.
  const chain = [];
  let name = token;

  for (let hop = 0; hop < 8; hop++) {
    const a = lookup(world, name, 'A');
    if (a) {
      chain.push({ name: a.name, type: 'A', value: a.value });
      return { device: findHost(world, a.value), address: a.value, label: token, chain, dangling: null };
    }

    const cname = lookup(world, name, 'CNAME');
    if (!cname) {
      return { ...empty, chain, dangling: name };
    }

    chain.push({ name: cname.name, type: 'CNAME', value: cname.value });
    name = cname.value;
  }

  return { ...empty, chain, dangling: name };
}
