/**
 * IPv4 subnet arithmetic.
 *
 * This is the floor the networking domain stands on: the subnetting missions
 * generate and grade against it, the topology view groups hosts with it, and the
 * selectors use it to answer "which subnet is this address on?" — which is what
 * keeps the terminal, the log stream and the diagram telling the same story.
 *
 * All maths is done on unsigned 32-bit integers via plain arithmetic rather than
 * bitwise operators, because JavaScript's bitwise ops are signed and `1 << 31`
 * goes negative exactly where address space gets interesting.
 */

import { check, isPrefixLength, ipToInt, intToIp, requireIpv4 } from '../validate.js';

const ADDRESS_SPACE = 4294967296; // 2^32

function requirePrefix(prefix, label = 'prefix') {
  check(isPrefixLength(prefix), `${label} must be a CIDR prefix length between 0 and 32, got ${prefix}`);
  return prefix;
}

/** Number of addresses in a block of this prefix length. */
function blockSize(prefix) {
  return Math.pow(2, 32 - prefix);
}

/**
 * Usable host addresses.
 * /32 is a single host and /31 is a two-address point-to-point link (RFC 3021);
 * everything wider loses the network and broadcast addresses.
 */
export function usableHosts(prefix) {
  requirePrefix(prefix);
  if (prefix === 32) return 1;
  if (prefix === 31) return 2;
  return blockSize(prefix) - 2;
}

export function prefixToMask(prefix) {
  requirePrefix(prefix);
  return intToIp(prefix === 0 ? 0 : ADDRESS_SPACE - blockSize(prefix));
}

export function maskToPrefix(mask) {
  requireIpv4(mask, 'mask');
  const value = ipToInt(mask);
  // A valid mask is a run of ones followed by a run of zeros. Its complement
  // plus one must therefore be a power of two.
  const inverted = ADDRESS_SPACE - 1 - value;
  const isContiguous = ((inverted + 1) & inverted) === 0;
  check(isContiguous, `mask ${mask} is not contiguous — a subnet mask must be all ones then all zeros`);
  let prefix = 0;
  let remaining = value;
  while (remaining > 0) {
    prefix++;
    remaining = (remaining * 2) % ADDRESS_SPACE;
  }
  return prefix;
}

export function networkAddress(ip, prefix) {
  requirePrefix(prefix);
  const size = blockSize(prefix);
  return intToIp(Math.floor(ipToInt(ip) / size) * size);
}

export function broadcastAddress(ip, prefix) {
  requirePrefix(prefix);
  return intToIp(ipToInt(networkAddress(ip, prefix)) + blockSize(prefix) - 1);
}

export function firstHost(ip, prefix) {
  requirePrefix(prefix);
  const network = ipToInt(networkAddress(ip, prefix));
  return intToIp(prefix >= 31 ? network : network + 1);
}

export function lastHost(ip, prefix) {
  requirePrefix(prefix);
  const broadcast = ipToInt(broadcastAddress(ip, prefix));
  return intToIp(prefix >= 31 ? broadcast : broadcast - 1);
}

/** "10.20.10.37", 24 -> "10.20.10.0/24" */
export function formatCidr(ip, prefix) {
  return `${networkAddress(ip, prefix)}/${requirePrefix(prefix)}`;
}

/** Do two addresses share a subnet under the same mask? */
export function sameSubnet(a, b, prefix) {
  return networkAddress(a, prefix) === networkAddress(b, prefix);
}

/**
 * Split "10.20.10.0/24" into its parts, or take the address and prefix separately.
 * A host address is normalised down to its network.
 * @returns {Readonly<{cidr,network,prefix,mask,broadcast,firstHost,lastHost,usable,size}>}
 */
export function parseCidr(input, prefixArg) {
  let address = input;
  let prefix = prefixArg;

  if (prefix === undefined) {
    check(typeof input === 'string', `expected CIDR notation like 10.20.10.0/24, got ${input}`);
    const slash = input.indexOf('/');
    check(slash !== -1, `missing prefix: expected something like 10.20.10.0/24, got "${input}"`);
    address = input.slice(0, slash);
    const raw = input.slice(slash + 1);
    check(/^\d+$/.test(raw), `prefix must be a number between 0 and 32, got "${raw}"`);
    prefix = Number(raw);
  }

  requireIpv4(address, 'address');
  requirePrefix(prefix);

  const network = networkAddress(address, prefix);
  return Object.freeze({
    cidr: `${network}/${prefix}`,
    network,
    prefix,
    mask: prefixToMask(prefix),
    broadcast: broadcastAddress(network, prefix),
    firstHost: firstHost(network, prefix),
    lastHost: lastHost(network, prefix),
    usable: usableHosts(prefix),
    size: blockSize(prefix)
  });
}

/** Is `ip` inside `cidr`? `cidr` may be notation or a parseCidr result. */
export function contains(cidr, ip) {
  const block = typeof cidr === 'string' ? parseCidr(cidr) : cidr;
  requireIpv4(ip, 'ip');
  const start = ipToInt(block.network);
  const value = ipToInt(ip);
  return value >= start && value < start + block.size;
}
