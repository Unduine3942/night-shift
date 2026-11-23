/**
 * T2 · repair · terminal
 *
 * The mission this whole format was designed around.
 *
 * The A record for the shipping app is gone, so the CNAME that staff actually
 * type is left pointing at a name that no longer resolves. The server is up, the
 * network is fine, and ping to the address works — which is why "the app is down"
 * is the wrong description of the problem.
 *
 * The win predicate refuses the tempting wrong fix. Repointing the CNAME straight
 * at an address makes the symptom go away and quietly breaks the next thing that
 * looks the app up by name, so it does not count as solved.
 */

import { DNS_RECORD, HOST, USER, ZONE } from '../world/contract.js';
import { createEvent } from '../../core/world/events.js';
import { resolveDns } from '../../core/world/select.js';

const A_RECORD = DNS_RECORD.APP01;
const ALIAS = DNS_RECORD.INTRANET;

export default {
  id: 'net-014',
  title: 'Cannot reach the shipping app',
  kind: 'repair',
  domain: 'networking',
  engine: 'terminal',
  tier: 2,
  difficulty: 3,
  complexity: 3,

  requires: ['dns-basics', 'cli-nslookup'],
  teaches: ['dns-a-record', 'dns-cname'],

  reporter: USER.DANA.name,
  brief:
    `Dana Okafor, dispatch: "${ALIAS.name} won't load. It was fine at six. Nothing has changed at my ` +
    `end and the two other people on shift get the same thing." The server is powered and responding. ` +
    `Get the name working again — properly, so the alias still works the way it did this morning.`,

  debrief:
    `The alias was never the problem. ${ALIAS.name} is a CNAME: it does not hold an address, it holds ` +
    `another name, and resolving it costs a second lookup that has to succeed. Deleting the A record for ` +
    `${A_RECORD.name} broke that second lookup and took the alias down with it, while the server itself ` +
    `stayed perfectly healthy — which is why ping to the address worked and the name did not. ` +
    `The shortcut fix is to point the alias straight at ${HOST.APP01.ip}. Resist it: the next time that ` +
    `server is renumbered you will have two records to remember instead of one, and you will only ` +
    `remember the one.`,

  hints: [
    'Ping the server by address. It answers, so the machine is fine — it is the name that is not.',
    'Look the alias up with nslookup. It will show you the chain and where the chain stops.',
    '"nsupdate add <name> <type> <value>" puts a record back.',
    'Put back what was removed. Do not flatten the alias into an address — nsupdate will refuse that anyway, and the refusal explains why.'
  ],

  setup: () => [
    createEvent('net/dns-record-remove', { name: A_RECORD.name, type: A_RECORD.type })
  ],

  win: (world) => {
    const alias = resolveDns(world, ALIAS.name, 'CNAME');
    if (!alias || alias.value !== A_RECORD.name) return false;

    const target = resolveDns(world, A_RECORD.name, 'A');
    return target !== null && target.value === HOST.APP01.ip;
  },

  solution: async (api) => {
    api.run(`nslookup ${ALIAS.name}`);
    api.run(`ping -c 2 ${HOST.APP01.ip}`);
    api.run(`nsupdate add ${A_RECORD.name} ${A_RECORD.type} ${HOST.APP01.ip}`);
    api.run(`nslookup ${ALIAS.name}`);
  },

  xp: 40,

  // Named so the debrief and the hints can point at it; also documents why the
  // shortcut is rejected rather than merely discouraged.
  zone: ZONE
};
