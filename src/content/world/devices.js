/**
 * Derived from the infrastructure contract. Do not add literals here.
 *
 * Interface prefixes are read off the network each port belongs to, so a host
 * can never disagree with its own subnet about the mask — that class of bug is
 * simply unavailable.
 *
 * @see ./contract.js
 */

import { HOST } from './contract.js';
import { parseCidr } from '../../core/net/cidr.js';

function toDevice(entry) {
  const interfaces = {};
  for (const port of entry.ports) {
    interfaces[port.iface] = {
      name: port.iface,
      ip: port.ip,
      prefix: parseCidr(port.net.cidr).prefix,
      up: true
    };
  }
  return {
    id: entry.id,
    name: entry.id,
    kind: entry.kind,
    siteId: entry.site.id,
    label: entry.label,
    powered: true,
    interfaces
  };
}

export const DEVICES = Object.fromEntries(
  Object.values(HOST).map((entry) => [entry.id, toDevice(entry)])
);
