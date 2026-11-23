/**
 * Progress is derived, not stored.
 *
 * The save holds what HAPPENED — which tickets were closed, and the event log
 * behind them. Everything the HUD shows (rank, XP, what you know, what is
 * available) is computed from that on demand. Storing rank alongside the tickets
 * that earned it means the two can disagree, and a save that disagrees with
 * itself is unfixable once it is on someone's USB stick.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROMOTION_RATIO,
  createProgress,
  recordCompletion,
  isCompleted,
  totalXp,
  tierOf,
  playerOf,
  progressStats
} from '../../../src/core/game/progress.js';

const mission = (id, over = {}) => ({
  id,
  title: 'A ticket',
  domain: 'networking',
  kind: 'repair',
  tier: 1,
  difficulty: 1,
  complexity: 1,
  engine: 'quiz',
  teaches: [],
  requires: [],
  brief: 'Something is wrong.',
  debrief: 'And now it is not.',
  xp: 10,
  win: () => true,
  solution: () => {},
  ...over
});

const done = (missionId, xp, teaches = []) => ({ missionId, xp, teaches, events: [] });

describe('createProgress', () => {
  test('starts empty, at rank one, with nothing known', () => {
    const progress = createProgress();
    assert.deepEqual(progress.completed, []);
    assert.deepEqual(progress.events, []);
    assert.equal(totalXp(progress), 0);
    assert.equal(tierOf(progress, []), 1);
  });
});

describe('recordCompletion', () => {
  test('appends the ticket and its events', () => {
    const progress = recordCompletion(createProgress(), {
      missionId: 'net-001',
      xp: 25,
      teaches: ['cli-ping'],
      events: [{ type: 'x' }, { type: 'y' }]
    });

    assert.equal(progress.completed.length, 1);
    assert.equal(progress.completed[0].missionId, 'net-001');
    assert.equal(progress.events.length, 2);
    assert.equal(totalXp(progress), 25);
  });

  test('does not mutate what it was given', () => {
    const before = createProgress();
    recordCompletion(before, done('net-001', 25));
    assert.deepEqual(before.completed, []);
  });

  test('a mission closed twice is recorded once and paid once', () => {
    let progress = recordCompletion(createProgress(), done('net-001', 25));
    progress = recordCompletion(progress, done('net-001', 25));

    assert.equal(progress.completed.length, 1, 'replaying a ticket should not farm XP');
    assert.equal(totalXp(progress), 25);
  });

  test('isCompleted answers for both', () => {
    const progress = recordCompletion(createProgress(), done('net-001', 25));
    assert.equal(isCompleted(progress, 'net-001'), true);
    assert.equal(isCompleted(progress, 'net-002'), false);
  });
});

describe('tierOf — promotion is earned from the work, not from a number', () => {
  const tierOne = [mission('a'), mission('b'), mission('c'), mission('d')];
  const tierTwo = [mission('e', { tier: 2 }), mission('f', { tier: 2 })];
  const all = [...tierOne, ...tierTwo];

  test('a new player is rank one', () => {
    assert.equal(tierOf(createProgress(), all), 1);
  });

  test('half of tier one is not enough', () => {
    let progress = createProgress();
    progress = recordCompletion(progress, done('a', 10));
    progress = recordCompletion(progress, done('b', 10));
    assert.equal(tierOf(progress, all), 1);
  });

  test('clearing most of tier one earns the promotion', () => {
    let progress = createProgress();
    for (const id of ['a', 'b', 'c']) progress = recordCompletion(progress, done(id, 10));
    assert.ok(3 / 4 >= PROMOTION_RATIO);
    assert.equal(tierOf(progress, all), 2);
  });

  test('it does not promote past the content that exists', () => {
    let progress = createProgress();
    for (const each of all) progress = recordCompletion(progress, done(each.id, 10));
    assert.equal(tierOf(progress, all), 2, 'there is no tier 3 to be promoted into');
  });

  test('a tier with no missions in it cannot strand the player', () => {
    const gapped = [mission('a'), mission('z', { tier: 3 })];
    const progress = recordCompletion(createProgress(), done('a', 10));
    assert.equal(tierOf(progress, gapped), 3, 'an empty tier 2 is skipped, not a wall');
  });
});

describe('playerOf', () => {
  const catalogue = [
    mission('a', { teaches: ['cli-ping'] }),
    mission('b', { teaches: ['dns-basics'] }),
    mission('c', { requires: ['cli-ping'] })
  ];

  test('reports everything the completed tickets taught', () => {
    const progress = recordCompletion(createProgress(), done('a', 10, ['cli-ping']));
    const player = playerOf(progress, catalogue);

    assert.deepEqual([...player.concepts], ['cli-ping']);
    assert.deepEqual(player.completed, ['a']);
    assert.equal(player.tier, 1);
  });

  test('concepts come from the catalogue, not from the save', () => {
    // A save records that mission 'a' was closed. What 'a' taught is looked up
    // in today's catalogue, so re-tuning a mission retroactively fixes old saves.
    const progress = recordCompletion(createProgress(), done('a', 10, ['something-else']));
    assert.deepEqual([...playerOf(progress, catalogue).concepts], ['cli-ping']);
  });
});

describe('progressStats', () => {
  const catalogue = [mission('a'), mission('b'), mission('c', { tier: 2 })];

  test('counts what is done against what exists', () => {
    const progress = recordCompletion(createProgress(), done('a', 10));
    const stats = progressStats(progress, catalogue);

    assert.equal(stats.completed, 1);
    assert.equal(stats.total, 3);
    assert.equal(stats.xp, 10);
    assert.equal(stats.tier, 1);
  });

  test('reports progress through the current tier', () => {
    const progress = recordCompletion(createProgress(), done('a', 10));
    const stats = progressStats(progress, catalogue);
    assert.equal(stats.tierCompleted, 1);
    assert.equal(stats.tierTotal, 2);
  });

  test('an empty catalogue does not divide by zero', () => {
    const stats = progressStats(createProgress(), []);
    assert.equal(stats.total, 0);
    assert.equal(stats.tierTotal, 0);
  });
});
