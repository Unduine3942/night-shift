/**
 * T2 · drill · subnet
 *
 * No fault, no story worth speaking of — this is the arithmetic, done against a
 * network the player has already met, so the numbers mean something.
 *
 * ANSWER_KEY is deliberately literal. It is an independent check on the CIDR
 * maths AND on the contract: if the HQ staff block is ever renumbered, this
 * mission fails loudly and an author has to come and look at it, rather than the
 * "right" answer quietly changing underneath a question that still reads the same.
 */

import { NET, USER } from '../world/contract.js';
import { parseCidr } from '../../core/net/cidr.js';
import { selectSubnet } from '../../core/world/select.js';

const BLOCK = NET.HQ_STAFF;

const ANSWER_KEY = {
  network: '10.20.20.0',
  broadcast: '10.20.20.255',
  firstHost: '10.20.20.1',
  lastHost: '10.20.20.254',
  usable: 254
};

export default {
  id: 'net-002',
  title: 'How much room is left on the staff network?',
  kind: 'drill',
  domain: 'networking',
  engine: 'subnet',
  tier: 2,
  difficulty: 2,
  complexity: 1,

  requires: ['ip-addressing'],
  teaches: ['cidr', 'subnetting'],

  reporter: USER.RAVI.name,
  brief:
    `Forty new handhelds are arriving and someone has to say whether they will fit. Before anyone can ` +
    `answer that, write down what ${BLOCK.label} — ${BLOCK.cidr} — actually contains: the network ` +
    `address, the broadcast address, the first and last usable host, and how many usable addresses ` +
    `there are in total.`,

  debrief:
    `The prefix is the whole answer. /24 means the first three octets are fixed and the last one is ` +
    `yours, which is 256 addresses — minus the network address at the bottom and the broadcast at the ` +
    `top, leaving 254. Nothing here is memorised; it all falls out of where the mask stops. That is why ` +
    `a /25 gives you 126 and a /30 gives you 2, and why the point-to-point link between the two sites ` +
    `is a /30.`,

  hints: [
    'The prefix length says how many bits are the network. What is left over is the host part.',
    'The lowest address in the block names the network itself. The highest is the broadcast.',
    'Usable addresses are everything in between: two fewer than the size of the block.'
  ],

  props: {
    blockOf: (world) => selectSubnet(world, BLOCK.id),
    // No example placeholders: an example address in a mission file is an
    // address that can drift from the block, and the labels say enough.
    fields: [
      { key: 'network', label: 'Network address' },
      { key: 'broadcast', label: 'Broadcast address' },
      { key: 'firstHost', label: 'First usable host' },
      { key: 'lastHost', label: 'Last usable host' },
      { key: 'usable', label: 'Usable addresses', hint: 'A count, not an address', numeric: true }
    ]
  },

  win: (world, ctx) => {
    const subnet = selectSubnet(world, BLOCK.id);
    if (!subnet) return false;

    const computed = parseCidr(subnet.cidr);
    const answers = ctx.answers;

    // The computed block and the authored key must agree before the player's
    // answers are graded against them.
    if (
      computed.network !== ANSWER_KEY.network ||
      computed.broadcast !== ANSWER_KEY.broadcast ||
      computed.firstHost !== ANSWER_KEY.firstHost ||
      computed.lastHost !== ANSWER_KEY.lastHost ||
      computed.usable !== ANSWER_KEY.usable
    ) {
      return false;
    }

    return (
      answers.network === computed.network &&
      answers.broadcast === computed.broadcast &&
      answers.firstHost === computed.firstHost &&
      answers.lastHost === computed.lastHost &&
      Number(answers.usable) === computed.usable
    );
  },

  solution: async (api) => {
    api.answer('network', ANSWER_KEY.network);
    api.answer('broadcast', ANSWER_KEY.broadcast);
    api.answer('firstHost', ANSWER_KEY.firstHost);
    api.answer('lastHost', ANSWER_KEY.lastHost);
    api.answer('usable', ANSWER_KEY.usable);
  },

  xp: 30
};
