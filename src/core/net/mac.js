/**
 * Hardware addresses.
 *
 * A MAC is derived from the device and interface name rather than stored, for
 * the same reason a DNS A record holds a HOST symbol rather than a copied
 * address: something derived cannot drift away from the thing it describes. A
 * random one would be the first place the illusion of a consistent network fell
 * apart, because the same card would answer differently each time you looked.
 *
 * It lives here rather than inside the `ifconfig` implementation because more
 * than one lens needs it — ifconfig, ip, arp, and any mission that asks the
 * player to report one — and a second copy of this arithmetic would be a second
 * answer to the same question.
 *
 * `02:` is the locally administered unicast prefix: the range set aside for
 * exactly this, addresses nobody bought from the IEEE.
 *
 * The arithmetic below is load-bearing and must not be "improved". Every MAC in
 * the world comes out of it, several tests pin the exact strings, and changing
 * it would silently renumber the whole estate.
 */

const LOCAL_PREFIX = 0x02;

/**
 * The MAC of one interface on one device. Stable for the life of the build.
 * @returns {string} lower-case, colon-separated
 */
export function macFor(deviceId, ifaceName) {
  let hash = 2166136261;
  for (const char of `${deviceId}/${ifaceName}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  const bytes = [
    LOCAL_PREFIX,
    (hash >>> 24) & 0xff,
    (hash >>> 16) & 0xff,
    (hash >>> 8) & 0xff,
    hash & 0xff,
    (hash >>> 4) & 0xff
  ];

  return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join(':');
}
