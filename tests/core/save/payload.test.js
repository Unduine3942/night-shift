/**
 * Loading a save is the most hostile input this game takes.
 *
 * By the time a payload reaches `fromPayload` it may have been through a USB
 * stick, a OneDrive sync, a text editor, a mail filter, or a different build of
 * the game. None of that may produce a throw: on the target machine an exception
 * during load is a white screen with no devtools behind it.
 *
 * So these tests are mostly about damage — truncated, edited, half-recognised
 * saves — and the rule they enforce is that a damaged save loads as much as it
 * can and says what it lost.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { toPayload, fromPayload } from '../../../src/core/save/payload.js';
import { createProgress, recordCompletion, totalXp } from '../../../src/core/game/progress.js';
import { createDeck, introduce, review, endSession, BOX_COUNT } from '../../../src/core/srs/scheduler.js';
import { createEvent } from '../../../src/core/world/events.js';
import { reduceWorld } from '../../../src/core/world/reduce.js';
import { createSeed } from '../../../src/core/world/seed.js';

const known = { missionIds: ['net-001', 'net-002'], cardIds: ['card-a', 'card-b'] };

const someState = () => {
  let progress = recordCompletion(createProgress(), {
    missionId: 'net-001',
    xp: 25,
    events: [createEvent('net/device-power', { deviceId: 'srv-dc01', on: false })]
  });
  progress = recordCompletion(progress, { missionId: 'net-002', xp: 30, events: [] });

  let deck = introduce(createDeck(), ['card-a', 'card-b'], 0);
  deck = review(deck, 'card-a', true, 0);
  deck = endSession(deck);

  return { progress, deck };
};

describe('round trip', () => {
  test('everything survives a save and a load', () => {
    const before = someState();
    const after = fromPayload(toPayload(before), known);

    assert.deepEqual(after.warnings, []);
    assert.equal(after.progress.completed.length, 2);
    assert.equal(totalXp(after.progress), 55);
    assert.equal(after.progress.events.length, 1);
    assert.equal(after.deck.session, 2);
    assert.equal(after.deck.cards['card-a'].box, 2);
  });

  test('survives the JSON trip a real save takes', () => {
    const before = someState();
    const after = fromPayload(JSON.parse(JSON.stringify(toPayload(before))), known);
    assert.equal(totalXp(after.progress), 55);
    assert.equal(after.deck.cards['card-a'].box, 2);
  });

  test('a fresh game round-trips to nothing', () => {
    const after = fromPayload(toPayload({ progress: createProgress(), deck: createDeck() }), known);
    assert.deepEqual(after.progress.completed, []);
    assert.equal(after.deck.session, 1);
  });
});

describe('content that has moved on since the save was written', () => {
  test('a ticket that no longer exists is dropped, and said so', () => {
    const payload = {
      progress: { completed: [{ missionId: 'net-001', xp: 25 }, { missionId: 'net-999', xp: 99 }], events: [] },
      deck: { session: 1, cards: {} }
    };
    const loaded = fromPayload(payload, known);

    assert.equal(loaded.progress.completed.length, 1);
    assert.equal(totalXp(loaded.progress), 25);
    assert.match(loaded.warnings.join(' '), /net-999/);
  });

  test('a card that no longer exists is dropped quietly', () => {
    const payload = {
      progress: { completed: [], events: [] },
      deck: { session: 1, cards: { 'card-a': { box: 2 }, 'card-gone': { box: 3 } } }
    };
    const loaded = fromPayload(payload, known);
    assert.deepEqual(Object.keys(loaded.deck.cards), ['card-a']);
  });

  test('with no content list, everything in the save is kept', () => {
    const payload = {
      progress: { completed: [{ missionId: 'anything', xp: 5 }], events: [] },
      deck: { session: 1, cards: {} }
    };
    assert.equal(fromPayload(payload).progress.completed.length, 1);
  });
});

describe('damage', () => {
  const loads = (payload) => {
    let loaded;
    assert.doesNotThrow(() => {
      loaded = fromPayload(payload, known);
    });
    return loaded;
  };

  test('null, a string and a number all load as a new game', () => {
    for (const rubbish of [null, undefined, 'save', 42, []]) {
      const loaded = loads(rubbish);
      assert.deepEqual(loaded.progress.completed, []);
      assert.equal(loaded.deck.session, 1);
    }
  });

  test('a missing progress section is not fatal', () => {
    const loaded = loads({ deck: { session: 3, cards: {} } });
    assert.deepEqual(loaded.progress.completed, []);
    assert.equal(loaded.deck.session, 3);
  });

  test('a missing deck is not fatal', () => {
    const loaded = loads({ progress: { completed: [{ missionId: 'net-001', xp: 25 }], events: [] } });
    assert.equal(loaded.progress.completed.length, 1);
    assert.equal(loaded.deck.session, 1);
  });

  test('an unrecognised event is skipped rather than replayed into a crash', () => {
    const loaded = loads({
      progress: {
        completed: [],
        events: [createEvent('net/device-power', { deviceId: 'srv-dc01', on: false }), { type: 'net/summon-demon' }]
      }
    });
    assert.equal(loaded.progress.events.length, 1);
    assert.match(loaded.warnings.join(' '), /unrecognised/i);
  });

  test('a ticket entry that is not an object is skipped', () => {
    const loaded = loads({ progress: { completed: ['net-001', null, 7], events: [] } });
    assert.deepEqual(loaded.progress.completed, []);
    assert.match(loaded.warnings.join(' '), /unreadable/i);
  });

  test('a ticket with no xp counts as zero rather than NaN', () => {
    const loaded = loads({ progress: { completed: [{ missionId: 'net-001' }], events: [] } });
    assert.equal(totalXp(loaded.progress), 0);
  });

  test('the same ticket twice is loaded once', () => {
    const loaded = loads({
      progress: { completed: [{ missionId: 'net-001', xp: 25 }, { missionId: 'net-001', xp: 25 }], events: [] }
    });
    assert.equal(loaded.progress.completed.length, 1);
    assert.equal(totalXp(loaded.progress), 25);
  });

  test('a card box outside the range is pulled back to box 1', () => {
    const loaded = loads({ deck: { session: 1, cards: { 'card-a': { box: 99 }, 'card-b': { box: -3 } } } });
    assert.equal(loaded.deck.cards['card-a'].box, 1);
    assert.equal(loaded.deck.cards['card-b'].box, 1);
    assert.ok(BOX_COUNT >= 1);
  });

  test('a nonsense session counter restarts at one, and says so', () => {
    const loaded = loads({ deck: { session: 'many', cards: {} } });
    assert.equal(loaded.deck.session, 1);
    assert.match(loaded.warnings.join(' '), /session counter/i);
  });

  test('an edited save that inflates XP is loaded as written — this is a study tool, not a leaderboard', () => {
    const loaded = loads({ progress: { completed: [{ missionId: 'net-001', xp: 999999 }], events: [] } });
    assert.equal(totalXp(loaded.progress), 999999);
  });
});

/**
 * The failure this whole module exists to prevent.
 *
 * An event that loads but cannot be replayed throws inside `reduceWorld` on every
 * single render. The state is already in storage by then, so reloading reproduces
 * it — one bad event in a save file is a permanent lockout with no screen left to
 * fix it from.
 *
 * Every save that comes out of `fromPayload` must therefore replay cleanly.
 */
describe('nothing that survives loading can crash the replay', () => {
  const replays = (loaded) => {
    assert.doesNotThrow(
      () => reduceWorld(createSeed(), loaded.progress.events),
      'an event survived loading that cannot be replayed'
    );
  };

  test('a known event type with a malformed payload is dropped', () => {
    const loaded = fromPayload({
      progress: { completed: [], events: [{ type: 'net/iface-ip-set', at: 0, payload: { deviceId: 'rtr-hq' } }] }
    });
    assert.equal(loaded.progress.events.length, 0);
    replays(loaded);
    assert.match(loaded.warnings.join(' '), /malformed|unrecognised/i);
  });

  test('a well-formed event naming a device that does not exist is dropped', () => {
    const loaded = fromPayload({
      progress: {
        completed: [],
        events: [createEvent('net/device-power', { deviceId: 'srv-imaginary', on: false })]
      }
    });
    assert.equal(loaded.progress.events.length, 0);
    replays(loaded);
    assert.match(loaded.warnings.join(' '), /do(es)? not fit/i);
  });

  test('the good events around a bad one are kept', () => {
    const loaded = fromPayload({
      progress: {
        completed: [],
        events: [
          createEvent('net/device-power', { deviceId: 'srv-dc01', on: false }),
          createEvent('net/device-power', { deviceId: 'srv-imaginary', on: false }),
          createEvent('net/device-power', { deviceId: 'srv-file01', on: false })
        ]
      }
    });
    assert.equal(loaded.progress.events.length, 2, 'one bad event should not cost the player the other two');
    replays(loaded);
  });

  test('a device id of __proto__ is refused rather than rewriting a prototype', () => {
    const loaded = fromPayload({
      progress: { completed: [], events: [createEvent('net/device-power', { deviceId: '__proto__', on: true })] }
    });
    assert.equal(loaded.progress.events.length, 0);

    const world = reduceWorld(createSeed(), loaded.progress.events);
    assert.equal(Object.getPrototypeOf(world.net.devices), Object.prototype);
  });

  test('a device id of toString does not find an inherited method and call it a device', () => {
    const loaded = fromPayload({
      progress: { completed: [], events: [createEvent('net/device-power', { deviceId: 'toString', on: true })] }
    });
    assert.equal(loaded.progress.events.length, 0);

    const world = reduceWorld(createSeed(), loaded.progress.events);
    assert.equal(Object.prototype.hasOwnProperty.call(world.net.devices, 'toString'), false);
  });

  test('__proto__ as a card id is refused even with no card allowlist', () => {
    const loaded = fromPayload({ deck: { session: 1, cards: { __proto__: { box: 3 } } } });
    assert.equal(Object.getPrototypeOf(loaded.deck.cards), Object.prototype);
    assert.deepEqual(Object.keys(loaded.deck.cards), []);
  });

  test('an absurdly long event list is truncated rather than replayed forever', () => {
    const events = Array.from({ length: 25000 }, () =>
      createEvent('net/device-power', { deviceId: 'srv-dc01', on: false })
    );
    const loaded = fromPayload({ progress: { completed: [], events } });

    assert.ok(loaded.progress.events.length <= 20000);
    assert.match(loaded.warnings.join(' '), /more than/i);
  });
});
