/**
 * T1 · investigate · terminal
 *
 * The first ticket that is answered rather than fixed, and the first that makes
 * the player use two tools against each other.
 *
 * A complaint arrives with an address and nothing else, which is how most of
 * them arrive. Turning an address into a machine and a person is an ordinary
 * piece of desk work, and it happens to be the cleanest way to show that IP and
 * MAC are different layers doing different jobs.
 */

import { HOST, USER } from '../world/contract.js';
import { selectDeviceByIp } from '../../core/world/select.js';
import { macFor } from '../../core/net/mac.js';

const SUSPECT = HOST.PC_FINANCE;

export default {
  id: 'it-004',
  title: 'An address on the report and no name against it',
  kind: 'investigate',
  domain: 'it',
  engine: 'terminal',
  tier: 1,
  difficulty: 2,
  complexity: 2,

  requires: ['ip-addressing'],
  teaches: ['arp', 'cli-arp'],

  reporter: USER.RAVI.name,
  brief:
    `Ravi has a bandwidth report from the core switch with one address near the top of it and no name ` +
    `against it: ${SUSPECT.ip}. Before anyone starts a conversation about it, he wants to know which ` +
    `machine that actually is and the hardware address it answers on. Report both.`,

  debrief:
    `Two identifiers, two layers, and they do different jobs. ${SUSPECT.ip} is a layer 3 address: it is ` +
    `assigned, it can be changed, and it is how the machine is reached from anywhere. The MAC is layer 2: ` +
    `it is burned into the interface, it never leaves the local segment, and it is what the frame is ` +
    `actually addressed to once the packet has arrived on this network.\n\n` +
    `The reason the ARP table only knows about neighbours is the same reason. A router hands a packet on ` +
    `and the MAC changes at every hop, so knowing the MAC of a machine two networks away would be no use ` +
    `to you. That is also why an address conflict is visible here and almost nowhere else: one IP ` +
    `appearing against two different MACs is two machines both claiming to be the same host.`,

  hints: [
    'Ping the address first. An address that has never been contacted will not be in the ARP table at all.',
    'arp -a lists the neighbours this machine has resolved, with the name it knows them by.',
    'The MAC is the part after "at" — six pairs of hex digits.',
    'Report both with "submit host=... mac=...".'
  ],

  props: {
    fields: [
      { key: 'host', label: 'The machine that holds that address' },
      { key: 'mac', label: 'The hardware address it answers on' }
    ]
  },

  win: (world, ctx) => {
    const found = selectDeviceByIp(world, SUSPECT.ip);
    if (!found || !found.device || !found.iface) return false;

    const answered = String(ctx.answers.mac || '').trim().toLowerCase();
    return ctx.answers.host === found.device.id && answered === macFor(found.device.id, found.iface.name);
  },

  // The MAC is read out of the world rather than written down here, so a
  // renamed interface changes the answer instead of invalidating the mission.
  solution: async (api) => {
    api.run(`ping -c 1 ${SUSPECT.ip}`);
    api.run('arp -a');

    const found = selectDeviceByIp(api.world, SUSPECT.ip);
    api.run(`submit host=${found.device.id} mac=${macFor(found.device.id, found.iface.name)}`);
  },

  xp: 25
};
