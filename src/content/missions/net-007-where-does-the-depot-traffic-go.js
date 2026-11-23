/**
 * T2 · investigate · terminal
 *
 * A ticket with no fault in it at all, which is the point.
 *
 * Somebody is asking where the traffic goes, and the honest answer is a path.
 * Ping cannot give you one — it collapses the whole journey into a single
 * yes or no — so this is the ticket that forces the second tool.
 *
 * The answer is read out of the world rather than written down here, so the day
 * the WAN link is renumbered the question changes with it instead of becoming
 * wrong.
 */

import { HOST, NET, SITE, USER } from '../world/contract.js';
import { selectSubnet } from '../../core/world/select.js';

const TARGET = HOST.DEPOT01;

export default {
  id: 'net-007',
  title: 'How does our traffic actually get to the depot?',
  kind: 'investigate',
  domain: 'networking',
  engine: 'terminal',
  tier: 2,
  difficulty: 2,
  complexity: 3,

  requires: ['routing-basics', 'default-gateway'],
  teaches: ['cli-tracert', 'wan-links'],

  reporter: USER.RAVI.name,
  brief:
    `The carrier wants to schedule maintenance on the link between ${SITE.HQ.name} and ` +
    `${SITE.DEPOT.name}, and Ravi has been asked which of our routers are actually in the path before he ` +
    `agrees a window. Nothing is broken. Trace the route from this desk to ${TARGET.id} and report the ` +
    `first router your traffic reaches and the last one before the server.`,

  debrief:
    `Ping answers one question — can I get there — and throws the journey away. A trace keeps the ` +
    `journey, and that is what turns "the depot is slow" into "it is slow after the second hop", which ` +
    `is the difference between a diagnosis and a complaint.\n\n` +
    `Hop one is always your own default gateway: the same address ${'`ip route`'} calls "default via". ` +
    `That is not a coincidence, it is the definition — the default route is where everything not on your ` +
    `own network is handed to, so it is unavoidably the first router in every path that leaves.\n\n` +
    `The last hop before the server is the far site's router, and between the two sits a link nobody at ` +
    `either end owns. That is the part the carrier is asking about, and knowing it is exactly two routers ` +
    `wide is what lets Ravi say yes to the maintenance window.`,

  hints: [
    'ping tells you whether you can reach it. It cannot tell you what it went through on the way.',
    'Read "man traceroute", or "tutorial traceroute" for a worked example.',
    'Hop 1 will be an address you have already seen — check "ip route" if it looks familiar.',
    'Report both with "submit first=... last=...", as addresses rather than names.'
  ],

  props: {
    fields: [
      { key: 'first', label: 'The address of the first router out of this desk' },
      { key: 'last', label: 'The address of the last router before the depot server' }
    ]
  },

  win: (world, ctx) => {
    // Both read out of the world, so a renumbering changes the answer rather
    // than quietly invalidating the ticket. The last hop is the depot router on
    // the SERVER side, which is the interface the trace comes back from.
    const hq = selectSubnet(world, NET.HQ_STAFF.id);
    const depot = selectSubnet(world, NET.DEPOT_SERVERS.id);
    if (!hq || !depot) return false;

    return ctx.answers.first === hq.gateway && ctx.answers.last === depot.gateway;
  },

  solution: async (api) => {
    api.run('ip route');
    api.run(`traceroute ${TARGET.id}`);

    const hq = selectSubnet(api.world, NET.HQ_STAFF.id);
    const depot = selectSubnet(api.world, NET.DEPOT_SERVERS.id);
    api.run(`submit first=${hq.gateway} last=${depot.gateway}`);
  },

  xp: 35
};
