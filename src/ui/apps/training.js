/**
 * Training — the drills and the review deck, kept out of the inbox.
 *
 * Sorting OSI layers and working out a broadcast address are worth doing and are
 * not tickets. Nobody raises a ticket asking you to name the layer; mixing the
 * two made every ticket feel like a quiz question and every quiz question feel
 * like it should have a terminal attached.
 *
 * So: the inbox is work that came from a person, Training is practice you chose.
 * Both pay XP and both feed the same Manual, because both are how the job gets
 * learned — they just are not the same activity.
 */

import { el, button, panel } from '../dom.js';
import { getEngine } from '../../engines/registry.js';
import { CARDS } from '../../content/cards.js';
import { CONCEPTS } from '../../content/concepts.js';
import { tierName } from '../../content/tiers.js';

const DOMAIN_LABEL = {
  networking: 'Networking',
  it: 'IT',
  data: 'Data',
  security: 'Security'
};

function tabs(ctx) {
  const { state, actions, dueCount } = ctx;
  const on = state.trainingTab;

  return el(
    'div',
    { class: 'tabs', role: 'tablist' },
    button('Drills', () => actions.setTrainingTab('drills'), {
      class: on === 'drills' ? 'tab tab-on' : 'tab',
      role: 'tab'
    }),
    button(dueCount > 0 ? `Review (${dueCount})` : 'Review', () => actions.setTrainingTab('review'), {
      class: on === 'review' ? 'tab tab-on' : dueCount > 0 ? 'tab tab-due' : 'tab',
      role: 'tab'
    })
  );
}

/* ---------- drills ---------- */

function drillRow(mission, onOpen) {
  return el(
    'button',
    { type: 'button', class: `drill drill-${mission.domain}`, onClick: () => onOpen(mission.id) },
    el(
      'span',
      { class: 'drill-line' },
      el('span', { class: `chip chip-${mission.domain}` }, DOMAIN_LABEL[mission.domain] || mission.domain),
      el('span', { class: 'drill-engine' }, mission.engine),
      el('span', { class: 'drill-xp' }, `${mission.xp} XP`)
    ),
    el('span', { class: 'drill-title' }, mission.title)
  );
}

function drillList(ctx) {
  const { drills, lockedDrills, actions, stats } = ctx;

  return el(
    'div',
    { class: 'training-pane' },

    el('p', { class: 'muted' }, `${tierName(stats.tier)} syllabus. Practice pays the same XP as a ticket.`),

    drills.length === 0
      ? el(
          'p',
          { class: 'empty' },
          lockedDrills.length > 0
            ? 'Every drill you can do is done. The rest need tools that arrive in a later build.'
            : 'Every drill at this rank is done. Close tickets to open the next lot.'
        )
      : el('div', { class: 'drill-list' }, drills.map((mission) => drillRow(mission, actions.openMission))),

    lockedDrills.length > 0 &&
      el(
        'div',
        { class: 'drill-list drill-list-locked' },
        el('p', { class: 'muted' }, `${lockedDrills.length} waiting on a tool this build does not have:`),
        lockedDrills.map((mission) =>
          el('div', { class: 'drill drill-locked' }, el('span', { class: 'drill-title' }, mission.title))
        )
      )
  );
}

function activeDrill(ctx) {
  const { state, actions, missionWorld } = ctx;
  const session = state.session;
  const mission = session.mission;
  const engine = getEngine(mission.engine);

  let view;
  try {
    view = engine
      ? engine.render({
          mission,
          world: missionWorld,
          session,
          answers: session.ctx.answers,
          terminal: ctx.terminal,
          answer: actions.answer,
          emit: actions.emit,
          runCommand: actions.runCommand,
          recallHistory: actions.recallHistory,
          setDraft: actions.setDraft,
          completionHint: actions.completionHint
        })
      : el('p', { class: 'error' }, `This build has no ${mission.engine} tool.`);
  } catch (error) {
    view = el('p', { class: 'error' }, `The ${mission.engine} tool could not be drawn: ${(error && error.message) || error}`);
  }

  const shown = state.hintsShown;
  const hintsLeft = mission.hints.length - shown;

  return el(
    'div',
    { class: 'training-pane training-drill' },

    el('h2', { class: 'drill-heading' }, mission.title),
    el('p', { class: 'drill-brief' }, mission.brief),

    view,

    state.attempted && !state.solved && el('p', { class: 'verdict verdict-no' }, 'Not right. Try again, or take a hint.'),

    hintsLeft > 0
      ? button(shown === 0 ? 'Hint' : `Another hint (${hintsLeft})`, () => actions.showHint(), { class: 'quiet' })
      : shown > 0 && el('p', { class: 'muted' }, 'That is every hint there is.'),

    shown > 0 && el('ol', { class: 'hints' }, mission.hints.slice(0, shown).map((hint) => el('li', {}, hint))),

    el(
      'div',
      { class: 'actions' },
      button('Check', () => actions.submitMission(), { class: 'primary' }),
      button('Start over', () => actions.resetMission()),
      button('Leave it', () => actions.abandonMission())
    )
  );
}

function drillDone(ctx) {
  const { state, actions } = ctx;
  const { mission, xp, newCards, promotedTo } = state.debrief;

  return el(
    'div',
    { class: 'training-pane' },
    el('h2', { class: 'drill-heading' }, 'Correct'),
    el('p', { class: 'debrief-xp' }, `+${xp} XP`),
    promotedTo && el('p', { class: 'promotion' }, `Moved up to ${tierName(promotedTo)}.`),
    panel('Why', el('p', { class: 'debrief-text' }, mission.debrief)),
    mission.teaches.length > 0 &&
      el(
        'ul',
        { class: 'concept-list' },
        mission.teaches.map((id) => {
          const concept = CONCEPTS[id];
          return el('li', {}, el('strong', {}, concept ? concept.label : id));
        })
      ),
    newCards > 0 && el('p', { class: 'muted' }, `${newCards} review ${newCards === 1 ? 'card' : 'cards'} added.`),
    el('div', { class: 'actions' }, button('Back to drills', () => actions.clearDebrief(), { class: 'primary' }))
  );
}

/* ---------- review ---------- */

function reviewPane(ctx) {
  const { state, actions, dueCount } = ctx;
  const review = state.review;

  if (!review) {
    return el(
      'div',
      { class: 'training-pane' },
      dueCount === 0
        ? el(
            'p',
            { class: 'empty' },
            'Nothing due. Cards come back after a session or two — close some work and check again.'
          )
        : el(
            'div',
            {},
            el('p', {}, `${dueCount} ${dueCount === 1 ? 'card is' : 'cards are'} due. Five minutes now beats re-learning it next week.`),
            button(`Start reviewing`, () => actions.startReview(), { class: 'primary' })
          )
    );
  }

  if (review.queue.length === 0) {
    return el('div', { class: 'training-pane' }, el('p', { class: 'empty' }, 'Nothing due right now.'));
  }

  if (review.index >= review.queue.length) {
    const right = review.correct;
    const total = review.queue.length;
    return el(
      'div',
      { class: 'training-pane' },
      el('p', { class: 'review-score' }, `${right} of ${total} right.`),
      el(
        'p',
        { class: 'muted' },
        right === total
          ? 'Everything moved up a box and will come back less often.'
          : 'Anything you missed went back to box one and will come round again shortly.'
      ),
      button('Done', () => actions.endReview(), { class: 'primary' })
    );
  }

  const card = CARDS[review.queue[review.index]];
  const concept = CONCEPTS[card.concept];
  const answered = review.answer !== null;
  const wasRight = answered && review.answer === card.answer;

  return el(
    'div',
    { class: 'training-pane training-review' },

    el(
      'div',
      { class: 'review-head' },
      el('span', { class: 'review-count' }, `Card ${review.index + 1} of ${review.queue.length}`),
      concept && el('span', { class: 'review-concept' }, concept.label)
    ),

    el('p', { class: 'card-front' }, card.front),

    el(
      'div',
      { class: 'options options-stacked' },
      review.options.map((option) => {
        let className = 'option';
        if (answered) {
          if (option === card.answer) className = 'option option-right';
          else if (option === review.answer) className = 'option option-wrong';
          else className = 'option option-dim';
        }
        return button(option, () => actions.answerCard(option), { class: className, disabled: answered });
      })
    ),

    answered &&
      el(
        'div',
        { class: wasRight ? 'verdict verdict-yes' : 'verdict verdict-no' },
        el('p', {}, wasRight ? 'Right.' : `Not quite — the answer is: ${card.answer}`),
        button(review.index + 1 >= review.queue.length ? 'Finish' : 'Next card', () => actions.nextCard(), {
          class: 'primary'
        })
      ),

    !answered && button('Stop for now', () => actions.endReview(), { class: 'quiet' })
  );
}

export default {
  id: 'training',
  title: 'Training',
  short: 'Training',
  defaultSize: { w: 600, h: 560 },

  subtitle(ctx) {
    if (ctx.state.debrief && ctx.state.debrief.surface === 'training') return 'done';
    if (ctx.activeSurface === 'training') return ctx.state.session.mission.engine;
    return ctx.state.trainingTab;
  },

  badge(ctx) {
    return ctx.dueCount > 0 ? ctx.dueCount : null;
  },

  body(ctx) {
    // An active drill or its result takes the whole window: the tabs would only
    // offer a way to navigate out of a half-finished answer.
    if (ctx.state.debrief && ctx.state.debrief.surface === 'training') return drillDone(ctx);
    if (ctx.activeSurface === 'training') return activeDrill(ctx);

    return el(
      'div',
      { class: 'pane pane-training' },
      tabs(ctx),
      ctx.state.trainingTab === 'review' ? reviewPane(ctx) : drillList(ctx)
    );
  }
};
