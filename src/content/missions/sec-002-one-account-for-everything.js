/**
 * T1 · audit · quiz
 *
 * Nothing is broken and nothing needs fixing tonight. The finding is that the
 * person who administers the directory does so from the account he also reads
 * his email with, which is the most common serious misconfiguration in small
 * companies and almost never looks like a problem until it is one.
 *
 * The second question is the whole mission. Spotting the account is easy;
 * knowing that the answer is neither "leave it" nor "take his rights away" is
 * the thing being taught.
 */

import { USER, GROUP } from '../world/contract.js';
import { selectUsersInGroup } from '../../core/world/select.js';

export default {
  id: 'sec-002',
  title: 'One account that can do anything',
  kind: 'audit',
  domain: 'security',
  engine: 'quiz',
  tier: 1,
  difficulty: 2,
  complexity: 2,

  requires: [],
  teaches: ['groups-membership', 'least-privilege'],

  reporter: USER.RAVI.name,
  brief:
    'Part two of the access review. Ravi wants the list of accounts that can change anything in the ' +
    'directory — add users, reset passwords, hand out rights. Work out who is on it, and then say what ' +
    'ought to happen about it.',

  debrief:
    'Rights belong to a role, not to a person, and the role should only be worn when it is needed. An ' +
    'administrator who works all day from an account that holds those rights is one bad link away from ' +
    'handing the entire directory to somebody else — the attacker does not need to break in, they just ' +
    'inherit whatever that session could already do. The answer is not to take the rights away, because ' +
    'the work still has to happen. It is to separate them: an ordinary account for email and browsing, a ' +
    'second one used only for administration, and the rights on the second.',

  hints: [
    'Look at the groups rather than the people. One group is the one that matters.',
    'The question is not whether he should have the rights — he does the job, so he needs them.',
    'Think about which account is logged in when he opens an attachment.'
  ],

  props: {
    questions: [
      {
        key: 'admin',
        prompt: 'Which account can change anything in the directory?',
        options: (world) =>
          selectUsersInGroup(world, GROUP.DOMAIN_ADMINS.id)
            .concat(selectUsersInGroup(world, GROUP.STAFF.id))
            .filter((user, index, list) => list.findIndex((other) => other.id === user.id) === index)
            .filter((user) => user.enabled)
            .map((user) => ({ value: user.id, label: `${user.name} — ${user.title}` }))
      },
      {
        key: 'fix',
        prompt: 'What should happen about it?',
        options: [
          {
            value: 'separate-admin',
            label: 'Give him a second account for administration and keep the rights on that one'
          },
          { value: 'leave', label: 'Nothing — he is the administrator, so of course he has them' },
          { value: 'remove', label: 'Take the rights away and route admin work through someone else' },
          { value: 'share', label: 'Share the admin account with the night desk so cover is easier' }
        ]
      }
    ]
  },

  win: (world, ctx) => {
    const admins = selectUsersInGroup(world, GROUP.DOMAIN_ADMINS.id);
    if (admins.length !== 1) return false;
    return ctx.answers.admin === admins[0].id && ctx.answers.fix === 'separate-admin';
  },

  solution: async (api) => {
    api.answer('admin', USER.RAVI.id);
    api.answer('fix', 'separate-admin');
  },

  xp: 25
};
