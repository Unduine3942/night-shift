/**
 * The career.
 *
 * Rank is the game's spine: it explains why the work gets harder, and it gives
 * the tool unlocks somewhere to hang. The titles are ordinary industry ones on
 * purpose — the point of the framing is that the thing being simulated is a job
 * someone actually does.
 */

const LIST = [
  {
    tier: 1,
    name: 'Helpdesk',
    blurb: 'First line on the overnight desk. Tickets arrive, you triage them, and most of them are simpler than they sound.',
    unlocks: 'Questions, sorting drills, the basic terminal'
  },
  {
    tier: 2,
    name: 'Network Administrator',
    blurb: 'Nobody else is on to escalate to. Addressing, name resolution and routing are yours now.',
    unlocks: 'Subnet solver, topology view, the full terminal'
  },
  {
    tier: 3,
    name: 'Data Analyst',
    blurb: 'The answers stop being in a config file and start being in a table someone has to query.',
    unlocks: 'SQL playground, pattern matching'
  },
  {
    tier: 4,
    name: 'SOC Analyst',
    blurb: 'The question is no longer "is it broken" but "is somebody doing this on purpose".',
    unlocks: 'Log hunt, crypto lab, incident scenarios'
  },
  {
    tier: 5,
    name: 'Security Engineer',
    blurb: 'Whole incidents, every tool at once, and nobody left to hand them to.',
    unlocks: 'Combined gauntlets'
  }
];

export const TIERS = Object.fromEntries(LIST.map((entry) => [entry.tier, entry]));

export function tierName(tier) {
  return (TIERS[tier] && TIERS[tier].name) || `Tier ${tier}`;
}

export function tierInfo(tier) {
  return TIERS[tier] || null;
}
