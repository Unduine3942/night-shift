/**
 * T1 · drill · sort
 *
 * Not a fault — a habit. Before you can narrow a problem you need somewhere to
 * put it, and the layer a symptom belongs to is the cheapest way to halve the
 * search. Six symptoms, four layers, no world state involved.
 */

import { USER } from '../world/contract.js';

/**
 * The answer key. Deliberately literal: these are judgements about what a
 * symptom means, not facts derived from the infrastructure.
 */
const PLACEMENT = {
  'cable-unplugged': 'physical',
  'wrong-subnet-mask': 'network',
  'no-route-to-site': 'network',
  'port-closed': 'transport',
  'certificate-expired': 'application',
  'wrong-password': 'application'
};

export const SYMPTOMS = [
  { id: 'cable-unplugged', text: 'The network light on the back of the PC is dark.' },
  { id: 'wrong-subnet-mask', text: 'A host can reach its neighbours but nothing on any other network.' },
  { id: 'no-route-to-site', text: 'Traffic to the other site dies at the router and never comes back.' },
  { id: 'port-closed', text: 'The server answers ping, but nothing will connect on 443.' },
  { id: 'certificate-expired', text: 'The browser loads the page but warns that it is not trusted.' },
  { id: 'wrong-password', text: 'The login is rejected instantly, every time, from every machine.' }
];

export const LAYERS = [
  { id: 'physical', label: 'Physical / Link' },
  { id: 'network', label: 'Network' },
  { id: 'transport', label: 'Transport' },
  { id: 'application', label: 'Application' }
];

export default {
  id: 'it-003',
  title: 'Sort the symptoms',
  kind: 'drill',
  domain: 'it',
  engine: 'sort',
  tier: 1,
  difficulty: 1,
  complexity: 2,

  requires: [],
  teaches: ['osi-model'],

  reporter: USER.RAVI.name,
  brief:
    'Ravi is putting together a crib sheet for the night desk. He has written out six things people ' +
    'phone up about and wants each one filed under the layer you would start looking at. ' +
    'Get them in the right boxes.',

  debrief:
    'Layers are a search strategy, not trivia. "It cannot connect" is six different problems until you ' +
    'decide which layer to test first — and each layer you rule out removes everything beneath it. ' +
    'Work bottom-up when nothing works at all, top-down when one thing is broken and the rest is fine.',

  hints: [
    'Ask what is still working. Whatever still works is below the fault.',
    'Ping proves the network layer. If ping works and the app does not, the fault is above it.',
    'A trust warning means you reached the server and talked to it. That is as high as it gets.'
  ],

  props: {
    answerKey: 'placements',
    items: SYMPTOMS.map((symptom) => ({ id: symptom.id, text: symptom.text })),
    buckets: LAYERS
  },

  win: (world, ctx) => {
    const placed = ctx.answers.placements;
    if (!placed) return false;
    return SYMPTOMS.every((symptom) => placed[symptom.id] === PLACEMENT[symptom.id]);
  },

  solution: async (api) => {
    api.answer('placements', { ...PLACEMENT });
  },

  xp: 20
};
