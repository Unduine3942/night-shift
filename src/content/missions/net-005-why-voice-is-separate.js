/**
 * T2 · investigate · quiz
 *
 * VLANs are usually taught as tagging and trunk ports, which is the mechanism and
 * not the point. The point is that one switch can carry several networks that
 * cannot interfere with each other, and the reason anyone bothers is sitting on
 * the reception desk making phone calls.
 */

import { NET, HOST, USER } from '../world/contract.js';
import { selectSubnetForIp } from '../../core/world/select.js';

const PHONE = HOST.PHONE_RECEP;

export default {
  id: 'net-005',
  title: 'Why the phones are on their own network',
  kind: 'investigate',
  domain: 'networking',
  engine: 'quiz',
  tier: 2,
  difficulty: 2,
  complexity: 1,

  requires: ['ip-addressing'],
  teaches: ['vlan'],

  reporter: USER.RAVI.name,
  brief:
    'A supplier has asked why reception handsets are not simply plugged into the same network as the ' +
    'desks, given they run over the same cables and the same switches. Ravi would like an answer he can ' +
    'forward. Find which network the handset is actually on, and say why it is kept apart.',

  debrief:
    `The handset and the desk beside it share a cable run, a switch and quite possibly a wall socket, ` +
    `and they are still on different networks — ${NET.HQ_VOICE.label} and ${NET.HQ_STAFF.label}. That ` +
    'separation is the whole trick: a VLAN is a second network drawn on the same hardware, and traffic ' +
    'on one cannot flood or interfere with the other. Voice is the classic case because it is the least ' +
    'forgiving traffic in the building — a file transfer that takes twenty seconds instead of ten is ' +
    'unremarkable, and a call that breaks up for two seconds is a complaint.',

  hints: [
    'Find the handset’s address first, then work out which network that address falls inside.',
    'Each network in the Codex carries a VLAN number. That number is the separation.',
    'Ask what happens to a phone call when somebody copies a very large file.'
  ],

  props: {
    questions: [
      {
        key: 'vlan',
        prompt: 'Which VLAN is the reception handset on?',
        options: [
          { value: NET.HQ_VOICE.vlan, label: `${NET.HQ_VOICE.vlan} — ${NET.HQ_VOICE.label}` },
          { value: NET.HQ_STAFF.vlan, label: `${NET.HQ_STAFF.vlan} — ${NET.HQ_STAFF.label}` },
          { value: NET.HQ_SERVERS.vlan, label: `${NET.HQ_SERVERS.vlan} — ${NET.HQ_SERVERS.label}` },
          { value: NET.HQ_MGMT.vlan, label: `${NET.HQ_MGMT.vlan} — ${NET.HQ_MGMT.label}` }
        ]
      },
      {
        key: 'why',
        prompt: 'And why is voice kept on a network of its own?',
        options: [
          { value: 'interference', label: 'So heavy traffic on the desks cannot make calls break up' },
          { value: 'ports', label: 'Because it uses fewer switch ports that way' },
          { value: 'speed', label: 'Because voice travels faster on a cable of its own' },
          { value: 'addresses', label: 'Because handsets cannot use the same kind of addresses as PCs' }
        ]
      }
    ]
  },

  win: (world, ctx) => {
    const subnet = selectSubnetForIp(world, PHONE.ip);
    if (!subnet) return false;
    return ctx.answers.vlan === subnet.vlan && ctx.answers.why === 'interference';
  },

  solution: async (api) => {
    api.answer('vlan', NET.HQ_VOICE.vlan);
    api.answer('why', 'interference');
  },

  xp: 30
};
