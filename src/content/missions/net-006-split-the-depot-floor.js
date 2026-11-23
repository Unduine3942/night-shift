/**
 * T2 · build · subnet
 *
 * The first mission where the player makes something rather than reads it. One
 * block, two halves, and the arithmetic has to be right or the two halves overlap
 * and nothing works.
 *
 * ANSWER_KEY is literal for the same reason as net-002: it is an independent
 * check on both the maths and the contract, so renumbering the depot fails this
 * mission loudly instead of silently changing what "correct" means.
 */

import { NET, USER } from '../world/contract.js';
import { parseCidr, usableHosts } from '../../core/net/cidr.js';
import { ipToInt, intToIp } from '../../core/validate.js';
import { selectSubnet } from '../../core/world/select.js';

const BLOCK = NET.DEPOT_FLOOR;

const ANSWER_KEY = {
  firstHalf: '10.40.20.0/25',
  secondHalf: '10.40.20.128/25',
  hostsEach: 126
};

/** What the block SHOULD split into, computed from the world rather than assumed. */
function splitOf(world) {
  const subnet = selectSubnet(world, BLOCK.id);
  if (!subnet) return null;

  const block = parseCidr(subnet.cidr);
  const prefix = block.prefix + 1;

  return {
    subnet,
    firstHalf: `${block.network}/${prefix}`,
    secondHalf: `${intToIp(ipToInt(block.network) + block.size / 2)}/${prefix}`,
    hostsEach: usableHosts(prefix)
  };
}

export default {
  id: 'net-006',
  title: 'Carve the depot floor in two',
  kind: 'build',
  domain: 'networking',
  engine: 'subnet',
  tier: 2,
  difficulty: 3,
  complexity: 2,

  requires: ['cidr', 'subnetting'],
  teaches: ['vlsm'],

  reporter: USER.MO.name,
  brief:
    `Mo wants the handheld scanners kept away from the office machines at the depot, and there is no ` +
    `spare address space to give them — it has to come out of ${BLOCK.label}. Split the block into two ` +
    `equal halves and write down both, along with how many usable addresses each half ends up with.`,

  debrief:
    'Splitting a block is just moving the boundary one bit to the right: the prefix grows by one, and ' +
    'you get two blocks of half the size. The second half starts exactly where the first one ends, which ' +
    'is the part worth checking twice — an overlap here does not fail loudly, it produces two machines ' +
    'that both think they own an address and a fault nobody can reproduce. Note what the split costs: ' +
    'two halves of a /24 give 126 usable addresses each rather than 127, because every block you create ' +
    'spends two addresses on its own network and broadcast.',

  hints: [
    'Two equal halves means one more bit of network. What does that do to the prefix?',
    'The first half starts where the original block starts. Where does it end?',
    'Each half is its own block, so each one loses an address at the bottom and one at the top.'
  ],

  props: {
    blockOf: (world) => selectSubnet(world, BLOCK.id),
    fields: [
      { key: 'firstHalf', label: 'First half', hint: 'Address and prefix, e.g. a.b.c.d/nn' },
      { key: 'secondHalf', label: 'Second half', hint: 'Address and prefix' },
      { key: 'hostsEach', label: 'Usable addresses in each half', numeric: true }
    ]
  },

  win: (world, ctx) => {
    const split = splitOf(world);
    if (!split) return false;

    // The computed split and the authored key must agree before anything is graded.
    if (
      split.firstHalf !== ANSWER_KEY.firstHalf ||
      split.secondHalf !== ANSWER_KEY.secondHalf ||
      split.hostsEach !== ANSWER_KEY.hostsEach
    ) {
      return false;
    }

    const answers = ctx.answers;
    return (
      answers.firstHalf === split.firstHalf &&
      answers.secondHalf === split.secondHalf &&
      Number(answers.hostsEach) === split.hostsEach
    );
  },

  solution: async (api) => {
    api.answer('firstHalf', ANSWER_KEY.firstHalf);
    api.answer('secondHalf', ANSWER_KEY.secondHalf);
    api.answer('hostsEach', ANSWER_KEY.hostsEach);
  },

  xp: 40
};
