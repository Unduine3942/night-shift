/**
 * The terminal.
 *
 * Everything that decides anything happens in core/shell — this file turns a
 * transcript into elements and a keypress into a line of input. It holds no state
 * of its own: the scrollback, the session and the history all live in the mission
 * session, so the terminal survives a re-render, an abandoned ticket and a reload
 * without special handling.
 *
 * Three keys do the work a real terminal's keys do. Enter runs, Up and Down walk
 * the history, Tab completes. A player who has used a shell expects all three and
 * notices immediately when they are missing.
 */

import { el, button } from '../ui/dom.js';
import { promptOf } from '../core/shell/session.js';
import { completePrefix } from '../core/shell/run.js';
import { REGISTRY } from '../core/shell/registry.js';
import { OUT, ERR, ECHO } from '../core/shell/run.js';

const STREAM_CLASS = {
  [OUT]: 'term-out',
  [ERR]: 'term-err',
  [ECHO]: 'term-echo'
};

export default {
  id: 'terminal',
  label: 'Terminal',
  // Terminal work is a ticket: the brief and the check-in live in Mail, while the
  // typing happens in the Terminal window beside it.
  surface: 'mail',
  // A terminal ticket may ask for findings and may not: net-014 is proved by the
  // state of the zone, not by anything typed into submit.
  requiresProps: false,

  validateProps(mission) {
    const props = mission.props;
    if (!props) return;

    if (props.fields !== undefined) {
      if (!Array.isArray(props.fields) || props.fields.length === 0) {
        throw new TypeError(`${mission.id}: terminal props.fields must be a non-empty array when present`);
      }
      for (const field of props.fields) {
        if (!field.key || !field.label) {
          throw new TypeError(`${mission.id}: every terminal field needs a key and a label`);
        }
      }
    }
  },

  render(api) {
    const { mission, session, terminal } = api;

    if (!session || !session.shell) {
      return el('p', { class: 'error' }, 'This ticket has no terminal attached.');
    }

    const prompt = promptOf(session.shell.session);
    const scrollback = session.shell.output;
    const fields = (mission.props && mission.props.fields) || [];
    const answers = session.ctx.answers || {};

    function onKey(event) {
      const input = event.target;

      if (event.key === 'Enter') {
        event.preventDefault();
        api.runCommand(input.value);
        return;
      }

      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        api.recallHistory(event.key === 'ArrowUp' ? -1 : 1);
        return;
      }

      if (event.key === 'Tab') {
        event.preventDefault();
        // Only the command word completes. Completing arguments would mean
        // completing host names, which is the thing the player is meant to go
        // and find out.
        const value = input.value;
        if (value.includes(' ')) return;
        const { matches, completed } = completePrefix(value, REGISTRY);
        if (matches.length === 1) api.setDraft(`${completed} `);
        else if (matches.length > 1) api.completionHint(completed, matches);
      }
    }

    return el(
      'div',
      { class: 'engine engine-terminal' },

      el(
        'div',
        { class: 'term', 'data-scroll-bottom': 'true' },
        scrollback.length === 0
          ? el(
              'p',
              { class: 'term-hello' },
              'Type "help" to see what this machine has, or "man <command>" for any of them.'
            )
          : scrollback.map((entry) =>
              el('div', { class: `term-line ${STREAM_CLASS[entry.stream] || 'term-out'}` }, entry.text || ' ')
            ),
        terminal.hint && el('div', { class: 'term-line term-hint' }, terminal.hint),
        el(
          'div',
          { class: 'term-input-row' },
          el('span', { class: 'term-prompt' }, prompt),
          el('input', {
            class: 'term-input',
            type: 'text',
            autocomplete: 'off',
            autocapitalize: 'off',
            autocorrect: 'off',
            spellcheck: 'false',
            'aria-label': 'Terminal input',
            'data-focus': 'true',
            value: terminal.draft,
            onInput: (event) => api.setDraft(event.target.value, { quiet: true }),
            onKeyDown: onKey
          })
        )
      ),

      fields.length > 0 &&
        el(
          'div',
          { class: 'term-asks' },
          el('p', { class: 'term-asks-title' }, 'This ticket is asking for:'),
          el(
            'ul',
            {},
            fields.map((field) =>
              el(
                'li',
                { class: answers[field.key] === undefined ? '' : 'answered' },
                el('code', {}, field.key),
                ` — ${field.label}`,
                answers[field.key] !== undefined && el('span', { class: 'term-answer' }, ` = ${answers[field.key]}`)
              )
            )
          ),
          el('p', { class: 'muted' }, 'Report them with: submit field=value')
        ),

      el(
        'div',
        { class: 'term-tools' },
        button('help', () => api.runCommand('help'), { class: 'quiet' }),
        button('clear', () => api.runCommand('clear'), { class: 'quiet' })
      )
    );
  }
};
