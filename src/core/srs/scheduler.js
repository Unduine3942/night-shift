/**
 * A three-box Leitner scheduler, paced in SESSIONS.
 *
 * Get a card right and it moves up a box and is scheduled further out; get it
 * wrong and it goes straight back to box 1. That is the whole algorithm. The two
 * decisions worth explaining are the units.
 *
 * Sessions, not days. The usual algorithms schedule in days, which assumes you
 * open the app roughly daily. This one lives on a USB stick and gets played in
 * bursts — two sittings in one evening, then nothing for a fortnight. Scheduling
 * a card "+6 days" in that world means never seeing it again, while "next time
 * you sit down" is a promise that can actually be kept.
 *
 * A wall-clock floor on top, for the opposite failure. Five two-minute sessions
 * in one evening would otherwise resurface the same box-3 card five times, which
 * teaches nothing and is irritating enough to stop someone playing. A card in a
 * higher box will not come back until some real time has passed, whatever the
 * session counter says.
 *
 * `now` is passed in. Nothing below core/ui is allowed to read the clock — see
 * tests/core/purity.test.js — so the caller supplies the timestamp and this
 * module stays a pure function of its arguments.
 */

export const BOX_COUNT = 3;

/** How many sessions until a card in each box comes back. */
export const SESSION_INTERVAL = [1, 2, 5];

/** The least real time that may pass before a card in each box is shown again. */
export const MIN_GAP_MS = [0, 10 * 60 * 1000, 2 * 60 * 60 * 1000];

function newCard(id, session) {
  return { id, box: 1, dueSession: session, lastAt: 0, seen: 0, correct: 0, lapses: 0 };
}

/** An empty deck at the first session. */
export function createDeck() {
  return Object.freeze({ session: 1, cards: Object.freeze({}) });
}

/**
 * Add cards to the deck. Cards already present keep everything they have earned,
 * so this is safe to call with the whole card list at every boot.
 */
export function introduce(deck, cardIds, now = 0) {
  const cards = { ...deck.cards };
  let added = false;

  for (const id of cardIds) {
    if (cards[id]) continue;
    cards[id] = newCard(id, deck.session);
    added = true;
  }

  return added ? Object.freeze({ ...deck, cards: Object.freeze(cards) }) : deck;
}

/** Has this card's session come round, and has enough real time passed? */
export function isDue(card, session, now) {
  if (session < card.dueSession) return false;
  return now - card.lastAt >= MIN_GAP_MS[card.box - 1];
}

/**
 * What to review, worst first.
 *
 * Box ascending puts the cards being struggled with at the front; within a box,
 * the longest unseen goes first, so nothing is starved.
 */
export function dueCards(deck, now, limit = Infinity) {
  const due = Object.values(deck.cards).filter((card) => isDue(card, deck.session, now));

  due.sort(
    (a, b) =>
      a.box - b.box ||
      a.lastAt - b.lastAt ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );

  return limit === Infinity ? due : due.slice(0, limit);
}

/**
 * Grade one card.
 *
 * A lapse goes all the way back to box 1 and is made due again in this same
 * session. Demoting by one instead would let a card you cannot remember drift
 * upward on lucky guesses, which is the failure mode Leitner exists to prevent.
 */
export function review(deck, cardId, correct, now) {
  const card = deck.cards[cardId];
  if (!card) return deck;

  const box = correct ? Math.min(card.box + 1, BOX_COUNT) : 1;

  const graded = {
    ...card,
    box,
    dueSession: correct ? deck.session + SESSION_INTERVAL[box - 1] : deck.session,
    lastAt: now,
    seen: card.seen + 1,
    correct: card.correct + (correct ? 1 : 0),
    lapses: card.lapses + (correct ? 0 : 1)
  };

  return Object.freeze({ ...deck, cards: Object.freeze({ ...deck.cards, [cardId]: graded }) });
}

/** Clock out. Everything scheduled for a later session moves one step closer. */
export function endSession(deck) {
  return Object.freeze({ ...deck, session: deck.session + 1 });
}

/**
 * Drop cards the content no longer contains.
 *
 * Saves outlive content. Without this, a deck carries dead card ids forever and
 * the review screen counts reviews it can never show.
 */
export function pruneDeck(deck, validIds) {
  const keep = new Set(validIds);
  const cards = {};
  let dropped = false;

  for (const [id, card] of Object.entries(deck.cards)) {
    if (keep.has(id)) cards[id] = card;
    else dropped = true;
  }

  return dropped ? Object.freeze({ ...deck, cards: Object.freeze(cards) }) : deck;
}

/**
 * A summary for the dashboard.
 * `accuracy` is null rather than 0 on an untouched deck — "you have got nothing
 * right" and "you have not started" should not look the same.
 */
export function deckStats(deck, now = 0) {
  const cards = Object.values(deck.cards);
  const byBox = new Array(BOX_COUNT).fill(0);

  let seen = 0;
  let correct = 0;
  let due = 0;

  for (const card of cards) {
    byBox[card.box - 1]++;
    seen += card.seen;
    correct += card.correct;
    if (isDue(card, deck.session, now)) due++;
  }

  return {
    total: cards.length,
    byBox,
    due,
    learned: byBox[BOX_COUNT - 1],
    accuracy: seen === 0 ? null : correct / seen,
    session: deck.session
  };
}
