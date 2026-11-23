/**
 * T2 · investigate · terminal
 *
 * Nothing is broken. The player is made to ask the resolver a question directly,
 * because every DNS mission after this one depends on trusting nslookup over the
 * browser's opinion.
 */

import { DNS_RECORD, HOST, USER, ZONE, DNS_FORWARDER } from '../world/contract.js';
import { resolveDns } from '../../core/world/select.js';

export default {
  id: 'net-003',
  title: 'Ask the resolver yourself',
  kind: 'investigate',
  domain: 'networking',
  engine: 'terminal',
  tier: 2,
  difficulty: 2,
  complexity: 2,

  requires: ['cli-ping'],
  teaches: ['dns-basics', 'cli-nslookup'],

  reporter: USER.RAVI.name,
  brief:
    `Before you touch anything in the ${ZONE} zone, Ravi wants to know you can read it. ` +
    `Look up ${DNS_RECORD.DC01.name} and report the address it answers with, and the address of the ` +
    `resolver that answered you.`,

  debrief:
    `The browser is a bad witness. It caches, it retries, it falls back, and it will happily show you a ` +
    `page from thirty seconds ago while the name it came from has stopped resolving. Asking the resolver ` +
    `directly removes all of that. Note the two addresses you just wrote down are different things: one ` +
    `is the answer, the other is who gave it to you. When a name resolves differently for two people, ` +
    `that second address is usually why.`,

  hints: [
    'nslookup prints two addresses. One is the answer; the other is who answered.',
    `The domain controller ${HOST.DC01.id} runs DNS for the ${ZONE} zone.`,
    'Try "dig" on the same name and compare. It shows far more of the response.',
    `Anything outside the zone is passed on to the forwarder at ${DNS_FORWARDER}.`,
    'Report both with "submit address=... resolver=...".'
  ],

  props: {
    fields: [
      { key: 'address', label: 'The address the name resolves to' },
      { key: 'resolver', label: 'The address of the server that answered' }
    ]
  },

  win: (world, ctx) => {
    const record = resolveDns(world, DNS_RECORD.DC01.name, 'A');
    if (!record) return false;
    return ctx.answers.address === record.value && ctx.answers.resolver === HOST.DC01.ip;
  },

  solution: async (api) => {
    api.run(`nslookup ${DNS_RECORD.DC01.name}`);
    api.run(`dig ${DNS_RECORD.DC01.name}`);
    api.run(`submit address=${HOST.DC01.ip} resolver=${HOST.DC01.ip}`);
  },

  xp: 30
};
