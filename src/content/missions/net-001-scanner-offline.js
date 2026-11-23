/**
 * T1 · repair · terminal
 *
 * The gentlest possible fault, chosen because it teaches the method rather than
 * the fix: one interface is down. Ping fails, and the useful lesson is that a
 * timeout tells you almost nothing on its own — you have to go and look at the
 * host itself.
 */

import { HOST, USER, NET } from '../world/contract.js';
import { createEvent } from '../../core/world/events.js';
import { selectInterface } from '../../core/world/select.js';

const SCANNER = HOST.SCAN01;

export default {
  id: 'net-001',
  title: 'Scanner 1 has dropped off the network',
  kind: 'repair',
  domain: 'networking',
  engine: 'terminal',
  tier: 1,
  difficulty: 2,
  complexity: 2,

  requires: ['ip-addressing'],
  teaches: ['cli-ping', 'troubleshooting-method'],

  reporter: USER.MO.name,
  brief:
    `Mo Chen is on nights at the depot. One of the two handheld scanners has stopped sending, so every ` +
    `pallet is being keyed in by hand. The other scanner is fine. Get ${SCANNER.id} back on ` +
    `${NET.DEPOT_FLOOR.label}.`,

  debrief:
    `A failed ping is not a diagnosis. It rules in a very large number of causes at once — cable, ` +
    `interface, address, route, firewall, the host being off — and rules out almost nothing. What made ` +
    `this quick was the second scanner: same network, same switch, working. Everything the two have in ` +
    `common is innocent, which left the interface on ${SCANNER.id} itself.`,

  hints: [
    'You have a working scanner sitting next to the broken one. Ping both and compare.',
    'ssh needs the network, and the network is the thing that is broken. Read "man console".',
    '"ip link show" tells you whether an interface is up. "ip link set <iface> up" changes it.',
    'ip says nothing when it works. Check it with "ip link show" and then ping again.'
  ],

  setup: () => [
    createEvent('net/iface-state', { deviceId: SCANNER.id, iface: SCANNER.iface, up: false })
  ],

  win: (world) => {
    const iface = selectInterface(world, SCANNER.id, SCANNER.iface);
    return iface !== null && iface.up === true && iface.ip === SCANNER.ip;
  },

  solution: async (api) => {
    api.run(`ping -c 2 ${SCANNER.id}`);
    api.run(`ping -c 2 ${HOST.SCAN02.id}`);
    api.run(`console ${SCANNER.id}`);
    api.run('ip link show');
    api.run(`ip link set ${SCANNER.iface} up`);
    api.run('exit');
    api.run(`ping -c 2 ${SCANNER.id}`);
  },

  xp: 25
};
