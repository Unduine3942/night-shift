/**
 * Card content, held to the same standard as the missions.
 *
 * The check that matters is the last one: every card belongs to a concept that
 * some mission teaches. A card attached to an orphan concept can never be shown,
 * because the review deck is built from what the player has been taught — so it
 * would sit in the file looking like content forever.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, CARD_IDS, cardsForConcepts, cardsForConcept } from '../../src/content/cards.js';
import { CONCEPTS } from '../../src/content/concepts.js';
import { MISSIONS } from '../../src/content/missions/index.js';

const ALL = Object.values(CARDS);

describe('every card is well-formed', () => {
  test('there are cards', () => {
    assert.ok(ALL.length >= 20, `only ${ALL.length} cards`);
  });

  test('ids are unique', () => {
    assert.equal(new Set(CARD_IDS).size, CARD_IDS.length);
  });

  test('every card names a real concept', () => {
    for (const entry of ALL) {
      assert.ok(CONCEPTS[entry.concept], `${entry.id}: "${entry.concept}" is not a concept`);
    }
  });

  test('every card asks something and offers four answers', () => {
    for (const entry of ALL) {
      assert.ok(entry.front.length >= 20, `${entry.id}: the question is too short to be one`);
      assert.equal(entry.options.length, 4, `${entry.id}: needs exactly four options`);
    }
  });

  test('the answer is one of the options, and is listed first', () => {
    for (const entry of ALL) {
      assert.equal(entry.options[0], entry.answer, `${entry.id}: the answer must be the first option`);
    }
  });

  test('no card repeats an option', () => {
    for (const entry of ALL) {
      assert.equal(
        new Set(entry.options).size,
        4,
        `${entry.id}: two options are identical, so one of them is a free elimination`
      );
    }
  });

  test('no distractor is obviously shorter or longer than the rest', () => {
    // The oldest tell in multiple choice: the longest option is the right one.
    for (const entry of ALL) {
      const lengths = entry.options.map((option) => option.length);
      const answerIsLongest = lengths[0] === Math.max(...lengths);
      const margin = answerIsLongest ? lengths[0] - Math.max(...lengths.slice(1)) : 0;
      assert.ok(
        margin < 40,
        `${entry.id}: the correct answer is ${margin} characters longer than every distractor — guessable without knowing anything`
      );
    }
  });
});

describe('cards are reachable', () => {
  test('every card belongs to a concept some mission teaches', () => {
    const taught = new Set(MISSIONS.flatMap((mission) => mission.teaches));
    for (const entry of ALL) {
      assert.ok(
        taught.has(entry.concept),
        `${entry.id} tests "${entry.concept}", which no mission teaches — it can never be shown`
      );
    }
  });

  test('every concept the missions teach has cards behind it', () => {
    const taught = new Set(MISSIONS.flatMap((mission) => mission.teaches));
    for (const concept of taught) {
      assert.ok(
        cardsForConcept(concept).length >= 2,
        `"${concept}" is taught but has fewer than two cards — nothing to review after the mission`
      );
    }
  });
});

describe('cardsForConcepts', () => {
  test('returns only what the player has been taught', () => {
    const deck = cardsForConcepts(['dns-cname']);
    assert.ok(deck.length > 0);
    assert.ok(deck.every((entry) => entry.concept === 'dns-cname'));
  });

  test('a new player has an empty deck', () => {
    assert.deepEqual(cardsForConcepts([]), []);
  });

  test('accepts a Set, which is what the progression layer hands it', () => {
    assert.deepEqual(cardsForConcepts(new Set(['dns-cname'])), cardsForConcepts(['dns-cname']));
  });
});

/**
 * A concept taught with no cards behind it.
 *
 * This is a silent hole rather than a failure: the mission awards the concept,
 * the Manual lists it, and the review deck has nothing to give back — so the
 * spaced-repetition half of the loop quietly does not happen for that idea. It
 * costs nothing to introduce and nothing tells you about it.
 *
 * Four missions written in one sitting opened eight of these at once, which is
 * why the check exists rather than the habit.
 */
describe('everything taught can be reviewed', () => {
  /** Enough that a card is not simply memorised by its position. */
  const MINIMUM = 2;

  test('every concept a mission teaches has cards behind it', () => {
    const taught = [...new Set(MISSIONS.flatMap((mission) => mission.teaches))].sort();
    const thin = taught
      .map((concept) => ({ concept, cards: cardsForConcept(concept).length }))
      .filter((entry) => entry.cards < MINIMUM);

    assert.deepEqual(
      thin,
      [],
      'these concepts are taught but cannot be revised:\n' +
        thin.map((entry) => `  ${entry.concept}: ${entry.cards} card(s), needs ${MINIMUM}`).join('\n')
    );
  });

  test('no card tests a concept no mission ever teaches', () => {
    const taught = new Set(MISSIONS.flatMap((mission) => mission.teaches));

    for (const entry of ALL) {
      assert.ok(
        taught.has(entry.concept),
        `${entry.id} tests "${entry.concept}", which no mission teaches — it can never come up`
      );
    }
  });

  test('a card and the mission that unlocks it agree on the concept id', () => {
    for (const entry of ALL) {
      assert.ok(CONCEPTS[entry.concept], `${entry.id}: "${entry.concept}" is not in the vocabulary`);
    }
  });
});
