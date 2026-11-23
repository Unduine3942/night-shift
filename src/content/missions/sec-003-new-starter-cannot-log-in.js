/**
 * T1 · repair · terminal
 *
 * The mirror image of SEC-001, and deliberately so.
 *
 * There the fault was an account that was enabled and should not have been;
 * here it is one that is disabled and should not be. Same command, same field,
 * opposite direction — which is the cheapest way to make the point that
 * userAccountControl is a setting rather than a verdict, and that "account
 * problem" is a real diagnosis you can reach in two commands.
 *
 * It also inoculates against the habit the first ticket could teach on its own:
 * that anything found in the directory is a security finding. Most of the time
 * somebody has simply been switched off by mistake.
 */

import { USER } from '../world/contract.js';
import { createEvent } from '../../core/world/events.js';
import { selectUser } from '../../core/world/select.js';

const STARTER = USER.TOMAS;

export default {
  id: 'sec-003',
  title: 'New starter cannot log in at the depot',
  kind: 'repair',
  domain: 'it',
  engine: 'terminal',
  tier: 1,
  difficulty: 2,
  complexity: 2,

  requires: ['user-accounts'],
  teaches: ['authentication', 'active-directory'],

  reporter: USER.MO.name,
  brief:
    `Mo Chen: "${STARTER.name} started last week and has been fine. Tonight he cannot get in — he says ` +
    `the password is right and it keeps refusing him. He is standing here. Can you sort it before the ` +
    `shift starts?" Nothing has been reported broken on the network.`,

  debrief:
    `Three things have to be true before a login works: the account exists, the credential is right, and ` +
    `the account is allowed to be used. They fail differently and they are fixed differently, so the ` +
    `first useful move is deciding which of the three you are looking at — not resetting the password, ` +
    `which is the reflex and was not the problem here.\n\n` +
    `A disabled account says nothing about why it was disabled. Somebody clicked the wrong row, or a ` +
    `leaver script matched the wrong name, or a policy switched it off for inactivity. Worth a sentence ` +
    `in the ticket: an account that disables itself again next week is a different and much more ` +
    `interesting problem than one that was switched off by hand.`,

  hints: [
    'This is not a network fault. Nothing else at the depot is complaining.',
    'Find the account first: "samba-tool user list" and then "samba-tool user show <login>".',
    'Read userAccountControl. 512 is a normal enabled account; 514 is disabled.',
    '"samba-tool user enable <login>" turns it back on. Read it back with "show" afterwards.'
  ],

  setup: () => [createEvent('identity/user-set-enabled', { userId: STARTER.id, enabled: false })],

  win: (world) => {
    const account = selectUser(world, STARTER.id);
    return account !== null && account.enabled === true;
  },

  solution: async (api) => {
    api.run('samba-tool user list');
    api.run(`samba-tool user show ${STARTER.login}`);
    api.run(`samba-tool user enable ${STARTER.login}`);
    api.run(`samba-tool user show ${STARTER.login}`);
  },

  xp: 25
};
