/**
 * Missions as a dependency graph.
 *
 * Ordering by difficulty is the easy half. The half that matters is knowledge:
 * a mission may only be offered once everything it assumes has already been
 * taught. Written by hand that constraint drifts silently — a mission quietly
 * becomes unreachable, or circular, and nothing complains.
 *
 * So the catalogue is walked: start with a player who knows nothing, repeatedly
 * take everything available, and assert every mission eventually becomes
 * reachable. That single simulation catches unreachable missions, deadlocks, and
 * tier-gating mistakes at once.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateMission, validateCatalog, DOMAINS, ENGINES } from '../../../src/core/missions/schema.js';
import {
  orderMissions,
  isAvailable,
  availableMissions,
  nextMission,
  knownConcepts,
  simulateProgression
} from '../../../src/core/missions/progression.js';

/** A valid mission; override any field to make it invalid or interesting. */
const mission = (id, over = {}) => ({
  id,
  title: 'A ticket',
  domain: 'networking',
  tier: 1,
  difficulty: 1,
  complexity: 1,
  engine: 'quiz',
  kind: 'investigate',
  teaches: [],
  requires: [],
  brief: 'Something is wrong.',
  debrief: 'And now it is not.',
  xp: 10,
  win: () => true,
  solution: () => {},
  ...over
});

const player = (over = {}) => ({ tier: 1, concepts: [], completed: [], ...over });

describe('validateMission', () => {
  test('accepts a well-formed mission', () => {
    assert.equal(validateMission(mission('net-001')).id, 'net-001');
  });

  test('names the field that is wrong', () => {
    assert.throws(() => validateMission(mission('net-001', { id: '' })), /id/);
    assert.throws(() => validateMission(mission('net-001', { title: '' })), /title/);
    assert.throws(() => validateMission(mission('net-001', { brief: '' })), /brief/);
    assert.throws(() => validateMission(mission('net-001', { debrief: '' })), /debrief/);
    assert.throws(() => validateMission(mission('net-001', { kind: 'vibes' })), /kind/);
    assert.throws(() => validateMission(mission('net-001', { domain: 'wizardry' })), /domain/);
    assert.throws(() => validateMission(mission('net-001', { engine: 'telepathy' })), /engine/);
    assert.throws(() => validateMission(mission('net-001', { tier: 0 })), /tier/);
    assert.throws(() => validateMission(mission('net-001', { tier: 9 })), /tier/);
    assert.throws(() => validateMission(mission('net-001', { difficulty: 6 })), /difficulty/);
    assert.throws(() => validateMission(mission('net-001', { complexity: 0 })), /complexity/);
    assert.throws(() => validateMission(mission('net-001', { xp: -5 })), /xp/);
  });

  test('insists on a win predicate and a reference solution', () => {
    assert.throws(() => validateMission(mission('net-001', { win: undefined })), /win/);
    assert.throws(() => validateMission(mission('net-001', { solution: undefined })), /solution/);
    assert.throws(() => validateMission(mission('net-001', { solution: 'later' })), /solution/);
  });

  test('setup is optional, but must be a function when present', () => {
    assert.doesNotThrow(() => validateMission(mission('net-001', { setup: undefined })));
    assert.doesNotThrow(() => validateMission(mission('net-001', { setup: () => [] })));
    assert.throws(() => validateMission(mission('net-001', { setup: [] })), /setup/);
  });

  test('hints are optional, but must be usable text when present', () => {
    assert.doesNotThrow(() => validateMission(mission('net-001', { hints: ['Try ping first.'] })));
    assert.throws(() => validateMission(mission('net-001', { hints: [''] })), /hints/);
    assert.throws(() => validateMission(mission('net-001', { hints: 'try ping' })), /hints/);
  });

  test('rejects concepts that are not in the vocabulary', () => {
    assert.throws(() => validateMission(mission('net-001', { teaches: ['vibes'] })), /vibes/);
    assert.throws(() => validateMission(mission('net-001', { requires: ['vibes'] })), /vibes/);
  });

  test('accepts real concepts', () => {
    assert.doesNotThrow(() =>
      validateMission(mission('net-001', { teaches: ['dns-a-record'], requires: ['dns-basics'] }))
    );
  });

  test('refuses a mission that requires what it also teaches', () => {
    assert.throws(
      () => validateMission(mission('net-001', { teaches: ['arp'], requires: ['arp'] })),
      /both requires and teaches/i
    );
  });

  test('the vocabularies it validates against are non-empty', () => {
    assert.ok(DOMAINS.length >= 4);
    assert.ok(ENGINES.length >= 4);
  });
});

describe('orderMissions', () => {
  test('sorts by tier, then difficulty, then complexity, then id', () => {
    const catalogue = [
      mission('d', { tier: 2, difficulty: 1, complexity: 1 }),
      mission('c', { tier: 1, difficulty: 3, complexity: 1 }),
      mission('b', { tier: 1, difficulty: 1, complexity: 2 }),
      mission('a', { tier: 1, difficulty: 1, complexity: 1 }),
      mission('a2', { tier: 1, difficulty: 1, complexity: 1 })
    ];
    assert.deepEqual(orderMissions(catalogue).map((m) => m.id), ['a', 'a2', 'b', 'c', 'd']);
  });

  test('does not mutate the catalogue it was given', () => {
    const catalogue = [mission('z', { difficulty: 5 }), mission('a')];
    orderMissions(catalogue);
    assert.deepEqual(catalogue.map((m) => m.id), ['z', 'a']);
  });
});

describe('availability', () => {
  test('a mission above the player tier is not offered', () => {
    assert.equal(isAvailable(mission('x', { tier: 3 }), player({ tier: 1 })), false);
    assert.equal(isAvailable(mission('x', { tier: 1 }), player({ tier: 3 })), true);
  });

  test('a mission is held back until everything it assumes is known', () => {
    const needsDns = mission('x', { requires: ['dns-basics', 'cli-nslookup'] });
    assert.equal(isAvailable(needsDns, player({ concepts: ['dns-basics'] })), false);
    assert.equal(isAvailable(needsDns, player({ concepts: ['dns-basics', 'cli-nslookup'] })), true);
  });

  test('availableMissions leaves out what is already done', () => {
    const catalogue = [mission('a'), mission('b')];
    const ids = availableMissions(catalogue, player({ completed: ['a'] })).map((m) => m.id);
    assert.deepEqual(ids, ['b']);
  });

  test('availableMissions comes back in play order', () => {
    const catalogue = [mission('hard', { difficulty: 4 }), mission('easy', { difficulty: 1 })];
    assert.deepEqual(availableMissions(catalogue, player()).map((m) => m.id), ['easy', 'hard']);
  });

  test('nextMission is the easiest thing you can actually do', () => {
    const catalogue = [
      mission('locked', { difficulty: 1, requires: ['nat'] }),
      mission('open', { difficulty: 3 })
    ];
    assert.equal(nextMission(catalogue, player()).id, 'open');
  });

  test('nextMission is null when there is nothing left', () => {
    assert.equal(nextMission([mission('a')], player({ completed: ['a'] })), null);
  });
});

describe('knownConcepts', () => {
  test('gathers what completed missions taught', () => {
    const catalogue = [
      mission('a', { teaches: ['dns-basics'] }),
      mission('b', { teaches: ['dns-a-record', 'dns-cname'] }),
      mission('c', { teaches: ['nat'] })
    ];
    const known = knownConcepts(catalogue, ['a', 'b']);
    assert.deepEqual([...known].sort(), ['dns-a-record', 'dns-basics', 'dns-cname']);
  });

  test('is empty for a new player', () => {
    assert.deepEqual([...knownConcepts([mission('a', { teaches: ['nat'] })], [])], []);
  });
});

describe('simulateProgression — the reachability walk', () => {
  test('a clean chain is fully reachable', () => {
    const catalogue = [
      mission('a', { teaches: ['dns-basics'] }),
      mission('b', { requires: ['dns-basics'], teaches: ['dns-a-record'] }),
      mission('c', { requires: ['dns-a-record'], teaches: ['dns-cname'] })
    ];
    const walk = simulateProgression(catalogue);
    assert.deepEqual(walk.unreachable, []);
    assert.deepEqual(walk.order, ['a', 'b', 'c']);
  });

  test('catches a mission that needs something nothing teaches', () => {
    const catalogue = [mission('a', { teaches: ['dns-basics'] }), mission('b', { requires: ['nat'] })];
    assert.deepEqual(simulateProgression(catalogue).unreachable, ['b']);
  });

  test('catches a deadlock between two missions', () => {
    const catalogue = [
      mission('a', { requires: ['nat'], teaches: ['arp'] }),
      mission('b', { requires: ['arp'], teaches: ['nat'] })
    ];
    assert.deepEqual(simulateProgression(catalogue).unreachable.sort(), ['a', 'b']);
  });

  test('catches a mission mis-tiered below the concept it depends on', () => {
    const catalogue = [
      mission('early', { tier: 1, requires: ['nat'] }),
      mission('late', { tier: 3, teaches: ['nat'] })
    ];
    const walk = simulateProgression(catalogue);

    // Deliberately strict. Letting the player reach tier 3 with an unsolvable
    // tier-1 ticket still in their queue would hide the mistake instead of
    // reporting it — the mission is mis-tiered and should be moved.
    assert.deepEqual(
      walk.unreachable.sort(),
      ['early', 'late'],
      'a tier-1 mission needing a tier-3 concept should block, not be rescued'
    );
  });

  test('and is happy once that mission is tiered correctly', () => {
    const catalogue = [
      mission('teaches-nat', { tier: 1, difficulty: 1, teaches: ['nat'] }),
      mission('uses-nat', { tier: 1, difficulty: 2, requires: ['nat'] })
    ];
    const walk = simulateProgression(catalogue);
    assert.deepEqual(walk.unreachable, []);
    assert.deepEqual(walk.order, ['teaches-nat', 'uses-nat']);
  });

  test('opens the next tier only once the current one is finished', () => {
    const catalogue = [
      mission('t1a', { tier: 1 }),
      mission('t1b', { tier: 1, difficulty: 2 }),
      mission('t2a', { tier: 2 })
    ];
    const walk = simulateProgression(catalogue);
    assert.deepEqual(walk.order, ['t1a', 't1b', 't2a']);
    assert.equal(walk.finalTier >= 2, true);
  });

  test('reports what a finished player knows', () => {
    const catalogue = [mission('a', { teaches: ['arp'] }), mission('b', { requires: ['arp'], teaches: ['nat'] })];
    assert.deepEqual(simulateProgression(catalogue).known.sort(), ['arp', 'nat']);
  });

  test('an empty catalogue is not an error', () => {
    const walk = simulateProgression([]);
    assert.deepEqual(walk.order, []);
    assert.deepEqual(walk.unreachable, []);
  });
});

describe('validateCatalog', () => {
  test('passes a healthy catalogue', () => {
    const catalogue = [
      mission('a', { teaches: ['dns-basics'] }),
      mission('b', { requires: ['dns-basics'], teaches: ['dns-a-record'] })
    ];
    const report = validateCatalog(catalogue);
    assert.equal(report.ok, true, JSON.stringify(report.problems));
    assert.deepEqual(report.problems, []);
  });

  test('reports duplicate ids', () => {
    const report = validateCatalog([mission('a'), mission('a')]);
    assert.equal(report.ok, false);
    assert.match(report.problems.map((p) => p.problem).join(' '), /duplicate/i);
  });

  test('reports a required concept nothing teaches', () => {
    const report = validateCatalog([mission('a', { requires: ['nat'] })]);
    assert.equal(report.ok, false);
    assert.match(report.problems.map((p) => p.problem).join(' '), /nat/);
  });

  test('reports unreachable missions', () => {
    const report = validateCatalog([
      mission('a', { requires: ['nat'], teaches: ['arp'] }),
      mission('b', { requires: ['arp'], teaches: ['nat'] })
    ]);
    assert.equal(report.ok, false);
    assert.match(report.problems.map((p) => p.problem).join(' '), /unreachable|never becomes/i);
  });

  test('reports a malformed mission rather than throwing', () => {
    const report = validateCatalog([mission('a', { tier: 99 })]);
    assert.equal(report.ok, false);
    assert.match(report.problems.map((p) => p.problem).join(' '), /tier/);
  });

  test('an empty catalogue is valid', () => {
    assert.equal(validateCatalog([]).ok, true);
  });
});
