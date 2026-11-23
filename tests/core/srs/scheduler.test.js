/**
 * Spaced repetition, paced in sessions rather than days.
 *
 * The reason this is not SM-2 is the way the game gets played: in bursts, off a
 * USB stick, whenever there is a gap. SM-2 schedules in days, so two sittings in
 * one evening push a card six days out and it is never seen again. Counting
 * sessions instead means "next time you sit down" actually means something.
 *
 * The wall-clock floor exists for the opposite failure — five two-minute sessions
 * in one evening should not show the same box-3 card five times.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOX_COUNT,
  SESSION_INTERVAL,
  MIN_GAP_MS,
  createDeck,
  introduce,
  isDue,
  dueCards,
  review,
  endSession,
  pruneDeck,
  deckStats
} from '../../../src/core/srs/scheduler.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const deckOf = (ids, now = 0) => introduce(createDeck(), ids, now);

describe('the box model', () => {
  test('three boxes, each slower than the last', () => {
    assert.equal(BOX_COUNT, 3);
    assert.equal(SESSION_INTERVAL.length, BOX_COUNT);
    for (let i = 1; i < BOX_COUNT; i++) {
      assert.ok(SESSION_INTERVAL[i] > SESSION_INTERVAL[i - 1], 'intervals must grow');
      assert.ok(MIN_GAP_MS[i] >= MIN_GAP_MS[i - 1], 'the wall-clock floor must not shrink');
    }
  });

  test('box 1 has no wall-clock floor — a card you just got wrong should come back', () => {
    assert.equal(MIN_GAP_MS[0], 0);
  });
});

describe('introduce', () => {
  test('a new deck is empty and starts at session 1', () => {
    const deck = createDeck();
    assert.deepEqual(deck.cards, {});
    assert.equal(deck.session, 1);
  });

  test('new cards land in box 1, due immediately', () => {
    const deck = deckOf(['cidr-1', 'cidr-2']);
    assert.equal(deck.cards['cidr-1'].box, 1);
    assert.equal(isDue(deck.cards['cidr-1'], deck.session, 0), true);
  });

  test('does not mutate the deck it was given', () => {
    const before = createDeck();
    introduce(before, ['a'], 0);
    assert.deepEqual(before.cards, {});
  });

  test('a card already in the deck keeps its progress', () => {
    const deck = review(deckOf(['a']), 'a', true, 0);
    const again = introduce(deck, ['a', 'b'], 0);
    assert.equal(again.cards.a.box, 2, 'reintroducing must not reset a card');
    assert.equal(again.cards.b.box, 1);
  });
});

describe('review', () => {
  test('a right answer promotes the card', () => {
    const deck = review(deckOf(['a']), 'a', true, 0);
    assert.equal(deck.cards.a.box, 2);
    assert.equal(deck.cards.a.correct, 1);
    assert.equal(deck.cards.a.seen, 1);
  });

  test('promotion stops at the last box', () => {
    let deck = deckOf(['a']);
    for (let i = 0; i < 6; i++) deck = review(deck, 'a', true, i * HOUR);
    assert.equal(deck.cards.a.box, BOX_COUNT);
  });

  test('a wrong answer drops the card straight back to box 1', () => {
    let deck = deckOf(['a']);
    deck = review(deck, 'a', true, 0);
    deck = review(deck, 'a', true, HOUR);
    assert.equal(deck.cards.a.box, 3);

    deck = review(deck, 'a', false, 2 * HOUR);
    assert.equal(deck.cards.a.box, 1, 'a lapse is not a demotion by one — it is back to the start');
    assert.equal(deck.cards.a.lapses, 1);
  });

  test('a promoted card is scheduled further out', () => {
    const deck = review(deckOf(['a']), 'a', true, 0);
    assert.equal(deck.cards.a.dueSession, deck.session + SESSION_INTERVAL[1]);
  });

  test('a lapsed card is due again in this same session', () => {
    let deck = review(deckOf(['a']), 'a', true, 0);
    deck = review(deck, 'a', false, HOUR);
    assert.equal(deck.cards.a.dueSession, deck.session);
  });

  test('reviewing an unknown card is ignored rather than fatal', () => {
    const deck = deckOf(['a']);
    assert.equal(review(deck, 'ghost', true, 0), deck);
  });

  test('does not mutate the deck it was given', () => {
    const deck = deckOf(['a']);
    review(deck, 'a', true, 0);
    assert.equal(deck.cards.a.box, 1);
  });
});

describe('isDue', () => {
  test('a card is not due before its session comes round', () => {
    const deck = review(deckOf(['a']), 'a', true, 0);
    assert.equal(isDue(deck.cards.a, deck.session, HOUR * 99), false);
  });

  test('a card is due once the session arrives and the floor has passed', () => {
    let deck = review(deckOf(['a']), 'a', true, 0);
    deck = endSession(endSession(deck));
    assert.equal(isDue(deck.cards.a, deck.session, 30 * MINUTE), true);
  });

  test('the wall-clock floor holds a card back within the same evening', () => {
    let deck = review(deckOf(['a']), 'a', true, 0);
    deck = endSession(endSession(deck));
    assert.equal(
      isDue(deck.cards.a, deck.session, MIN_GAP_MS[1] - 1),
      false,
      'two quick sessions in one sitting should not resurface a card you just answered'
    );
  });
});

describe('dueCards', () => {
  test('returns only what is due', () => {
    let deck = deckOf(['a', 'b', 'c']);
    deck = review(deck, 'a', true, 0);
    assert.deepEqual(dueCards(deck, HOUR).map((card) => card.id), ['b', 'c']);
  });

  test('the cards you are worst at come first', () => {
    let deck = deckOf(['weak', 'strong']);
    deck = review(deck, 'strong', true, 0);
    deck = endSession(endSession(deck));
    assert.deepEqual(dueCards(deck, 5 * HOUR).map((card) => card.id), ['weak', 'strong']);
  });

  test('within a box, the longest unseen comes first', () => {
    let deck = deckOf(['old', 'new']);
    deck = review(deck, 'old', false, 0);
    deck = review(deck, 'new', false, HOUR);
    assert.deepEqual(dueCards(deck, 2 * HOUR).map((card) => card.id), ['old', 'new']);
  });

  test('honours a limit, so a session has a shape', () => {
    const deck = deckOf(['a', 'b', 'c', 'd']);
    assert.equal(dueCards(deck, 0, 2).length, 2);
  });

  test('an empty deck is not an error', () => {
    assert.deepEqual(dueCards(createDeck(), 0), []);
  });
});

describe('endSession', () => {
  test('advances the session counter', () => {
    assert.equal(endSession(createDeck()).session, 2);
  });

  test('does not touch the cards', () => {
    const deck = deckOf(['a']);
    assert.deepEqual(endSession(deck).cards, deck.cards);
  });

  test('a card in box 2 comes back after the right number of sessions', () => {
    let deck = review(deckOf(['a']), 'a', true, 0);
    deck = endSession(deck);
    assert.equal(isDue(deck.cards.a, deck.session, 99 * HOUR), false, 'too early');
    deck = endSession(deck);
    assert.equal(isDue(deck.cards.a, deck.session, 99 * HOUR), true);
  });
});

describe('pruneDeck', () => {
  test('drops cards the content no longer has', () => {
    const deck = pruneDeck(deckOf(['a', 'b', 'gone']), ['a', 'b']);
    assert.deepEqual(Object.keys(deck.cards).sort(), ['a', 'b']);
  });

  test('keeps the deck untouched when nothing has gone', () => {
    const deck = deckOf(['a']);
    assert.deepEqual(pruneDeck(deck, ['a']).cards, deck.cards);
  });
});

describe('deckStats', () => {
  test('counts the boxes and what is due', () => {
    let deck = deckOf(['a', 'b', 'c']);
    deck = review(deck, 'a', true, 0);
    const stats = deckStats(deck, HOUR);

    assert.equal(stats.total, 3);
    assert.deepEqual(stats.byBox, [2, 1, 0]);
    assert.equal(stats.due, 2);
  });

  test('reports accuracy over everything answered', () => {
    let deck = deckOf(['a', 'b']);
    deck = review(deck, 'a', true, 0);
    deck = review(deck, 'b', false, 0);
    assert.equal(deckStats(deck, 0).accuracy, 0.5);
  });

  test('accuracy on an untouched deck is null, not zero', () => {
    assert.equal(deckStats(deckOf(['a']), 0).accuracy, null);
  });

  test('reports how close the deck is to being learnt', () => {
    let deck = deckOf(['a', 'b']);
    deck = review(deck, 'a', true, 0);
    deck = endSession(deck);
    deck = review(deck, 'a', true, 3 * HOUR);
    assert.equal(deckStats(deck, 3 * HOUR).learned, 1, 'a card in the last box counts as learnt');
  });
});
