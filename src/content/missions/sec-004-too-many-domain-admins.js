/**
 * T2 · audit · terminal
 *
 * The first ticket that asks the player to take something away from somebody,
 * which is a different kind of nerve from fixing a fault.
 *
 * It is also the first that has to be approached from the group rather than the
 * person. `user show` only helps if you already suspect who to look at, and the
 * whole point of an access review is that you do not — so the move is to open
 * the most powerful group and read the names in it.
 *
 * The win predicate is deliberately narrow: the extra admin comes out of
 * domain-admins and keeps every other group. Removing somebody from everything
 * because they had one right too many is the overcorrection this is teaching
 * against.
 */

import { USER, GROUP } from '../world/contract.js';
import { createEvent } from '../../core/world/events.js';
import { selectUser } from '../../core/world/select.js';

const DISPATCHER = USER.DANA;
const ADMIN = USER.RAVI;

export default {
  id: 'sec-004',
  title: 'Quarterly review: who is a domain admin',
  kind: 'audit',
  domain: 'security',
  engine: 'terminal',
  tier: 2,
  difficulty: 3,
  complexity: 3,

  requires: ['least-privilege', 'groups-membership'],
  teaches: ['access-control', 'privilege-escalation'],

  reporter: USER.RAVI.name,
  brief:
    `Ravi, before he went home: "Audit want the ${GROUP.DOMAIN_ADMINS.label} list signed off by morning. ` +
    `It should be me and nobody else. If there is anyone else in there, take them out of that group — ` +
    `just that group, leave everything else exactly as it is — and tell me who it was."`,

  debrief:
    `Reading it from the group rather than from the person is the whole technique. Nobody suspected ` +
    `${DISPATCHER.name}, which is exactly why looking at accounts one at a time would never have found ` +
    `it. Open the powerful group, read the names, and anyone who does not need to be there is a finding.\n\n` +
    `Note what was NOT done. The account still exists, still works, and still has the groups it needs to ` +
    `do the actual job. Over-privilege is fixed by removing the excess, not by removing the person — an ` +
    `access review that leaves people unable to work gets ignored the next time it runs.\n\n` +
    `Why this matters more than it looks: a domain admin account is the whole domain. An attacker who ` +
    `gets into a dispatch clerk's mailbox has a foothold; an attacker who gets into a dispatch clerk's ` +
    `mailbox that happens to be a domain admin has everything, and there is no second step to take.`,

  hints: [
    '"samba-tool user show" only helps if you already know who to look at. You do not.',
    '"samba-tool group list" shows every group. One of them is the one audit cares about.',
    `"samba-tool group listmembers ${GROUP.DOMAIN_ADMINS.id}" reads it the other way round: who is in it.`,
    `"samba-tool group removemembers ${GROUP.DOMAIN_ADMINS.id} <login>" takes one person out of one group.`,
    'Report the login with "submit login=<login>". Do not disable the account — they still work here.'
  ],

  props: {
    fields: [{ key: 'login', label: 'The login that should not have been a domain admin' }]
  },

  setup: () => [
    createEvent('identity/user-group-add', { userId: DISPATCHER.id, group: GROUP.DOMAIN_ADMINS.id })
  ],

  win: (world, ctx) => {
    const dana = selectUser(world, DISPATCHER.id);
    const ravi = selectUser(world, ADMIN.id);
    if (!dana || !ravi) return false;

    // Out of the admin group...
    if (dana.groups.includes(GROUP.DOMAIN_ADMINS.id)) return false;

    // ...but still able to do her job, and still able to log in at all.
    if (!dana.enabled) return false;
    if (!dana.groups.includes(GROUP.DISPATCH.id) || !dana.groups.includes(GROUP.STAFF.id)) return false;

    // ...and the real admin untouched.
    if (!ravi.groups.includes(GROUP.DOMAIN_ADMINS.id)) return false;

    return ctx.answers.login === dana.login;
  },

  solution: async (api) => {
    api.run('samba-tool group list');
    api.run(`samba-tool group listmembers ${GROUP.DOMAIN_ADMINS.id}`);
    api.run(`samba-tool user show ${DISPATCHER.login}`);
    api.run(`samba-tool group removemembers ${GROUP.DOMAIN_ADMINS.id} ${DISPATCHER.login}`);
    api.run(`samba-tool group listmembers ${GROUP.DOMAIN_ADMINS.id}`);
    api.run(`submit login=${DISPATCHER.login}`);
  },

  xp: 40
};
