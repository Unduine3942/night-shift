/**
 * Terminal — the window the work actually happens in.
 *
 * It draws whatever shell session is live. With a ticket open that is the
 * ticket's scratch layer; with no ticket open it is the practice shell, which
 * runs the same commands against the same company and throws the result away.
 *
 * There is no third state. A terminal that greys itself out when the inbox is
 * empty teaches the player that the tool is a formality attached to a quiz, and
 * the whole reason for a desktop is that it is not.
 */

import { el } from '../dom.js';
import terminalEngine from '../../engines/terminal.js';

export default {
  id: 'terminal',
  title: 'Terminal',
  short: 'Terminal',
  defaultSize: { w: 720, h: 540 },

  subtitle(ctx) {
    if (ctx.activeSurface === 'mail' && ctx.state.session) return ctx.state.session.mission.id.toUpperCase();
    return 'practice';
  },

  body(ctx) {
    const session = ctx.shellSession;

    if (!session || !session.shell) {
      return el(
        'div',
        { class: 'pane pane-terminal' },
        el('p', { class: 'error' }, 'No shell is attached to this window.')
      );
    }

    const working = ctx.activeSurface === 'mail';

    return el(
      'div',
      { class: 'pane pane-terminal' },

      el(
        'p',
        { class: working ? 'term-banner term-banner-live' : 'term-banner term-banner-practice' },
        working
          ? `Working ${session.mission.id.toUpperCase()}. Changes apply when you check the ticket in.`
          : 'Practice shell — real commands, real network, nothing kept. Open a ticket to do work that counts.'
      ),

      terminalEngine.render({
        mission: session.mission,
        world: ctx.missionWorld,
        session,
        answers: session.ctx.answers,
        terminal: ctx.terminal,
        answer: ctx.actions.answer,
        emit: ctx.actions.emit,
        runCommand: ctx.actions.runCommand,
        recallHistory: ctx.actions.recallHistory,
        setDraft: ctx.actions.setDraft,
        completionHint: ctx.actions.completionHint
      })
    );
  }
};
