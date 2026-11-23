/**
 * Mail — the inbox the night's work arrives in.
 *
 * Tickets here are the ones worked at the terminal: somebody has reported
 * something, and the fix is a command on a real machine. The brief, the hints
 * and the check live in this window; the typing happens next door in the
 * terminal. That split is the whole point of the desktop — you read the
 * complaint and work the box at the same time, the way the job actually goes.
 *
 * Drills are not in here. A subnetting exercise is not a message from a person,
 * and putting one in an inbox was the thing that made the old single-screen
 * queue read like a quiz app wearing a costume.
 */

import { el, button, panel } from '../dom.js';
import { CONCEPTS } from '../../content/concepts.js';
import { tierName } from '../../content/tiers.js';

const KIND_LABEL = {
  repair: 'Repair',
  build: 'Build',
  investigate: 'Investigate',
  audit: 'Audit',
  respond: 'Respond',
  drill: 'Drill'
};

/** Urgency, from the two ratings the mission already carries. */
function priorityOf(mission) {
  const weight = mission.difficulty + mission.complexity;
  if (weight >= 8) return { id: 'p1', label: 'P1' };
  if (weight >= 5) return { id: 'p2', label: 'P2' };
  return { id: 'p3', label: 'P3' };
}

function messageRow(mission, onOpen) {
  const priority = priorityOf(mission);

  return el(
    'button',
    {
      type: 'button',
      class: `msg msg-${mission.domain}`,
      onClick: () => onOpen(mission.id)
    },
    el(
      'span',
      { class: 'msg-line' },
      el('span', { class: `pri pri-${priority.id}`, title: `Priority ${priority.label}` }, priority.label),
      el('span', { class: 'msg-from' }, mission.reporter || 'Monitoring'),
      el('span', { class: 'msg-id' }, mission.id.toUpperCase())
    ),
    el('span', { class: 'msg-subject' }, mission.title),
    el(
      'span',
      { class: 'msg-line msg-meta' },
      el('span', { class: `badge badge-${mission.kind}` }, KIND_LABEL[mission.kind] || mission.kind),
      el('span', { class: 'msg-xp' }, `${mission.xp} XP`)
    )
  );
}

function lockedRow(mission) {
  return el(
    'div',
    { class: 'msg msg-locked' },
    el(
      'span',
      { class: 'msg-line' },
      el('span', { class: 'pri pri-hold' }, 'HOLD'),
      el('span', { class: 'msg-from' }, mission.reporter || 'Monitoring'),
      el('span', { class: 'msg-id' }, mission.id.toUpperCase())
    ),
    el('span', { class: 'msg-subject' }, mission.title),
    el('span', { class: 'msg-line msg-meta muted' }, `Needs the ${mission.engine} tool, which this build does not have yet.`)
  );
}

/* ---------- the three things this window can be showing ---------- */

function inbox(ctx) {
  const { inbox: open, lockedInbox, actions, stats, clock, drills } = ctx;
  const rank = tierName(stats.tier);

  return el(
    'div',
    { class: 'pane pane-mail' },

    el(
      'div',
      { class: 'mail-head' },
      el('span', { class: 'mail-account' }, `${rank} · night desk`),
      el('span', { class: 'mail-clock' }, clock.label)
    ),

    open.length === 0
      ? panel(
          'Inbox empty',
          el(
            'p',
            { class: 'empty' },
            lockedInbox.length > 0
              ? 'Nothing you can work tonight. The rest of the queue needs tools this build does not have yet.'
              : drills.length > 0
                ? 'Nothing in the inbox. There is still work in Training.'
                : 'Quiet night. Clock out and come back.'
          )
        )
      : el(
          'div',
          { class: 'msg-list' },
          el('p', { class: 'msg-count' }, `${open.length} open ${open.length === 1 ? 'ticket' : 'tickets'}`),
          open.map((mission) => messageRow(mission, actions.openMission))
        ),

    lockedInbox.length > 0 &&
      el(
        'div',
        { class: 'msg-list msg-list-locked' },
        el('p', { class: 'msg-count muted' }, `${lockedInbox.length} on hold`),
        lockedInbox.map(lockedRow)
      ),

    el(
      'div',
      { class: 'mail-foot' },
      button('Clock out', () => actions.clockOut(), { class: 'quiet' }),
      el('span', { class: 'muted' }, 'Banks the session so reviews come round at the right time.')
    )
  );
}

function ticket(ctx) {
  const { state, actions } = ctx;
  const mission = state.session.mission;
  const shown = state.hintsShown;
  const hintsLeft = mission.hints.length - shown;
  const priority = priorityOf(mission);

  return el(
    'div',
    { class: 'pane pane-mail pane-mail-open' },

    el(
      'div',
      { class: 'ticket-head' },
      el('span', { class: `pri pri-${priority.id}` }, priority.label),
      el('span', { class: 'msg-id' }, mission.id.toUpperCase()),
      el('span', { class: `badge badge-${mission.kind}` }, KIND_LABEL[mission.kind] || mission.kind)
    ),

    el('h2', { class: 'ticket-subject' }, mission.title),
    mission.reporter && el('p', { class: 'ticket-from' }, `From: ${mission.reporter}`),
    el('p', { class: 'ticket-body' }, mission.brief),

    el('p', { class: 'ticket-where' }, 'Work it in the Terminal window. Come back here to check it in.'),

    state.attempted &&
      !state.solved &&
      el(
        'p',
        { class: 'verdict verdict-no' },
        'Not there yet. Nothing has been broken — read it again, take a hint, or reset and start over.'
      ),

    panel(
      'Hints',
      shown === 0
        ? el('p', { class: 'muted' }, 'Hints cost nothing. The debrief will note how many you took.')
        : el('ol', { class: 'hints' }, mission.hints.slice(0, shown).map((hint) => el('li', {}, hint))),
      hintsLeft > 0
        ? button(shown === 0 ? 'Give me a hint' : `Another hint (${hintsLeft} left)`, () => actions.showHint())
        : el('p', { class: 'muted' }, 'That is every hint there is.')
    ),

    el(
      'div',
      { class: 'actions' },
      button('Check it in', () => actions.submitMission(), { class: 'primary' }),
      button('Start over', () => actions.resetMission()),
      button('Put it back', () => actions.abandonMission())
    )
  );
}

function debrief(ctx) {
  const { state, actions } = ctx;
  const { mission, xp, hintsUsed, newCards, promotedTo } = state.debrief;

  return el(
    'div',
    { class: 'pane pane-mail pane-mail-done' },

    el(
      'div',
      { class: 'ticket-head' },
      el('span', { class: 'pri pri-done' }, 'CLOSED'),
      el('span', { class: 'msg-id' }, mission.id.toUpperCase()),
      el('span', { class: 'debrief-xp' }, `+${xp} XP`)
    ),

    promotedTo &&
      el('p', { class: 'promotion' }, `You have been moved up to ${tierName(promotedTo)}. New tools, harder queue.`),

    panel('What just happened', el('p', { class: 'debrief-text' }, mission.debrief)),

    mission.teaches.length > 0 &&
      panel(
        'Added to your Manual',
        el(
          'ul',
          { class: 'concept-list' },
          mission.teaches.map((id) => {
            const concept = CONCEPTS[id];
            return el(
              'li',
              {},
              el('strong', {}, concept ? concept.label : id),
              concept && el('span', { class: 'concept-blurb' }, ` — ${concept.blurb}`)
            );
          })
        ),
        newCards > 0 &&
          el('p', { class: 'muted' }, `${newCards} review ${newCards === 1 ? 'card' : 'cards'} added to your deck.`)
      ),

    hintsUsed > 0 &&
      el('p', { class: 'muted' }, `You took ${hintsUsed} ${hintsUsed === 1 ? 'hint' : 'hints'} on this one.`),

    el('div', { class: 'actions' }, button('Back to the inbox', () => actions.clearDebrief(), { class: 'primary' }))
  );
}

export default {
  id: 'mail',
  title: 'Mail',
  short: 'Mail',
  defaultSize: { w: 520, h: 600 },

  subtitle(ctx) {
    if (ctx.state.debrief && ctx.state.debrief.surface === 'mail') return 'ticket closed';
    if (ctx.activeSurface === 'mail') return ctx.state.session.mission.id.toUpperCase();
    return ctx.inbox.length > 0 ? `${ctx.inbox.length} open` : 'inbox';
  },

  badge(ctx) {
    return ctx.inbox.length > 0 ? ctx.inbox.length : null;
  },

  body(ctx) {
    if (ctx.state.debrief && ctx.state.debrief.surface === 'mail') return debrief(ctx);
    if (ctx.activeSurface === 'mail') return ticket(ctx);
    return inbox(ctx);
  }
};
