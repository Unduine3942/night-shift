/**
 * T2 · investigate · quiz
 *
 * The gateway is the first thing anyone learns to read off a host config and
 * about the last thing they understand. This asks for the address, and then asks
 * what stops working without it — which is the question that turns it from a
 * field in a dialog into a piece of machinery.
 */

import { NET, USER, HOST } from '../world/contract.js';
import { selectSubnet, selectDevicesOnSubnet, selectInterfaces } from '../../core/world/select.js';
import { contains } from '../../core/net/cidr.js';

const BLOCK = NET.HQ_STAFF;

/** Every address actually configured on the staff network, so the choices are real. */
function addressesOn(world, subnetId) {
  const subnet = selectSubnet(world, subnetId);
  if (!subnet) return [];

  return selectDevicesOnSubnet(world, subnetId).flatMap((device) =>
    selectInterfaces(world, device.id)
      .filter((iface) => iface.ip && contains(subnet.cidr, iface.ip))
      .map((iface) => ({ value: iface.ip, label: `${iface.ip} — ${device.label}` }))
  );
}

export default {
  id: 'net-004',
  title: 'Where does it go when it is not local?',
  kind: 'investigate',
  domain: 'networking',
  engine: 'quiz',
  tier: 2,
  difficulty: 2,
  complexity: 2,

  requires: ['ip-addressing'],
  teaches: ['default-gateway', 'routing-basics'],

  reporter: USER.RAVI.name,
  brief:
    `A dispatch machine on ${BLOCK.label} needs to reach the shipping server, which is on a different ` +
    'network entirely. Before you can troubleshoot anything like that you need to be able to say where ' +
    'the packet goes first, and what it means when that address is wrong.',

  debrief:
    'A host only really knows one thing: whether an address is on its own network or not. If it is, it ' +
    'talks to it directly. If it is not — and that is everything else in the world — it hands the packet ' +
    'to the gateway and stops thinking about it. That is why a wrong gateway produces the strangest ' +
    'symptom in networking: the machine can reach its neighbours perfectly and nothing else at all, ' +
    'which does not look like a network problem to the person reporting it.',

  hints: [
    'The gateway lives on the same network as the hosts that use it. It has to, or they could not reach it.',
    'It is almost always a router or firewall interface, not a server.',
    'Ask what a host can still do when it has no gateway: which addresses can it still reach directly?'
  ],

  props: {
    questions: [
      {
        key: 'gateway',
        prompt: `A machine on ${BLOCK.label} wants to reach another network. Which address does it send to?`,
        options: (world) => addressesOn(world, BLOCK.id)
      },
      {
        key: 'without',
        prompt: 'That address is wiped from the machine. What still works?',
        options: [
          { value: 'local-only', label: 'Anything on its own network, and nothing past it' },
          { value: 'nothing', label: 'Nothing at all — the machine is off the network' },
          { value: 'slower', label: 'Everything, but noticeably more slowly' },
          { value: 'dns-only', label: 'Only name lookups, because those are cached' }
        ]
      }
    ]
  },

  win: (world, ctx) => {
    const subnet = selectSubnet(world, BLOCK.id);
    if (!subnet || !subnet.gateway) return false;
    return ctx.answers.gateway === subnet.gateway && ctx.answers.without === 'local-only';
  },

  solution: async (api) => {
    api.answer('gateway', BLOCK.gateway);
    api.answer('without', 'local-only');
  },

  xp: 30,

  // The gateway address belongs to this host; named so the Codex can link them.
  gatewayHost: HOST.RTR_HQ.id
};
