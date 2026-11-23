/**
 * T1 · audit · terminal
 *
 * Jordan Hale left the company and their account was disabled — that is how the
 * world starts. This mission re-enables it, which is exactly what happens in real
 * life when someone needs "just one file" from a leaver's mailbox and nobody
 * turns it off again.
 *
 * Two halves, deliberately: name the account, then act on it. Finding it is the
 * audit; disabling it is the fix.
 */

import { USER, GROUP } from '../world/contract.js';
import { createEvent } from '../../core/world/events.js';
import { selectUser } from '../../core/world/select.js';

export default {
  id: 'sec-001',
  title: 'A leaver who can still log in',
  kind: 'audit',
  domain: 'security',
  engine: 'terminal',
  tier: 1,
  difficulty: 2,
  complexity: 2,

  requires: [],
  teaches: ['user-accounts', 'dormant-accounts'],

  reporter: USER.RAVI.name,
  brief:
    'Quarterly access review. Ravi wants every enabled account in the directory matched to somebody who ' +
    'still works here. One of them is not going to match. Find it, say which login it is, and make sure ' +
    'it cannot be used again.',

  debrief:
    'A leaver account is worth more to an attacker than yours is: nobody is watching it, nobody will ' +
    'report it behaving oddly, and it usually keeps every group it ever had. Note that disabling the ' +
    'account leaves the groups in place — that is on purpose. Disabled is reversible and auditable; ' +
    'deleted is neither, and you will want the history when someone asks what it had access to.',

  hints: [
    '"samba-tool user list" gives you every login. "samba-tool user show <login>" gives you one in full.',
    'Read the titles. One of them says outright that the person has gone.',
    'Look at userAccountControl in the output of "show": 512 is enabled, 514 is disabled.',
    'Disable it, then report the login with "submit login=<login>".'
  ],

  props: {
    fields: [{ key: 'login', label: 'The login that should not have been enabled' }]
  },

  setup: () => [createEvent('identity/user-set-enabled', { userId: USER.JORDAN.id, enabled: true })],

  win: (world, ctx) => {
    const account = selectUser(world, USER.JORDAN.id);
    if (!account) return false;
    return account.enabled === false && ctx.answers.login === account.login;
  },

  // Typed, not emitted: this proves the ticket can be closed with the tools the
  // player actually has, in the syntax those tools actually take.
  solution: async (api) => {
    api.run('samba-tool user list');
    api.run(`samba-tool user show ${USER.JORDAN.login}`);
    api.run(`samba-tool user disable ${USER.JORDAN.login}`);
    api.run(`submit login=${USER.JORDAN.login}`);
  },

  xp: 25,

  // Referenced by the debrief: the account keeps its groups after being disabled.
  keepsGroups: [GROUP.STAFF.id, GROUP.DISPATCH.id]
};
