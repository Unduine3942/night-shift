/**
 * T1 · drill · sort
 *
 * Five things waiting, one of you. Triage is the skill that decides whether a
 * night shift goes well, and it is almost never taught — people are handed a
 * queue and left to work out for themselves that a reported phishing reply
 * outranks a printer that has always been slow.
 */

import { USER } from '../world/contract.js';

/** The answer key. These are judgements about impact, not facts about the network. */
const PRIORITY = {
  'site-down': 'now',
  'phish-reply': 'now',
  'finance-share': 'soon',
  'new-starter': 'soon',
  'printer-slow': 'later',
  'monitor-wobble': 'later'
};

export const COMPLAINTS = [
  { id: 'site-down', text: 'Nobody at the depot can reach anything at all. Two shifts are standing around.' },
  { id: 'phish-reply', text: 'Someone has replied to an email asking for their password, and now regrets it.' },
  { id: 'finance-share', text: 'One person cannot open the finance share. Everyone else in the team can.' },
  { id: 'new-starter', text: 'A new starter begins at eight and has no account yet.' },
  { id: 'printer-slow', text: 'A printer takes about thirty seconds to start a job. It always has.' },
  { id: 'monitor-wobble', text: 'A monitor stand wobbles when somebody knocks the desk.' }
];

export const PRIORITIES = [
  { id: 'now', label: 'Drop everything' },
  { id: 'soon', label: 'Before the shift ends' },
  { id: 'later', label: 'When there is time' }
];

export default {
  id: 'it-002',
  title: 'What gets picked up first',
  kind: 'drill',
  domain: 'it',
  engine: 'sort',
  tier: 1,
  difficulty: 1,
  complexity: 2,

  requires: [],
  teaches: ['ticket-triage'],

  reporter: USER.RAVI.name,
  brief:
    'Six things came in while you were reading the handover. You cannot do them all at once and two of ' +
    'them are not going to wait. Put each one where it belongs, and be ready to defend the order.',

  debrief:
    'Triage is about blast radius and about time, not about who asked loudest. A whole site down stops ' +
    'two shifts working, so it outranks everything. A reported phishing reply is the other one that ' +
    'cannot wait, and for a different reason: the damage is still spreading while the ticket sits there, ' +
    'and every minute of delay is a minute the credentials are live. One person blocked matters and one ' +
    'person inconvenienced does not, and something that has always been slightly wrong has, by ' +
    'definition, waited this long already.',

  hints: [
    'Ask how many people are stopped, and whether it is getting worse while you read.',
    'Something that is still spreading outranks something that has already finished happening.',
    '"It has always done that" is a strong signal it can wait a little longer.'
  ],

  props: {
    answerKey: 'priority',
    items: COMPLAINTS,
    buckets: PRIORITIES
  },

  win: (world, ctx) => {
    const placed = ctx.answers.priority;
    if (!placed) return false;
    return COMPLAINTS.every((complaint) => placed[complaint.id] === PRIORITY[complaint.id]);
  },

  solution: async (api) => {
    api.answer('priority', { ...PRIORITY });
  },

  xp: 20
};
