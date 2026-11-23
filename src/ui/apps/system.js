/**
 * System — saving, and moving progress between machines.
 *
 * This app exists because the storage on the target machine cannot be trusted to
 * survive the browser closing, and because the game is meant to travel — USB
 * stick to OneDrive folder and back, which are separate origins with separate
 * storage that will never see each other's saves.
 *
 * Export degrades rather than fails: a real download, then the clipboard, then
 * the text on screen to select by hand. Something always works.
 */

import { el, button, panel } from '../dom.js';

function saveScreen(ctx) {
  const { state, actions, durability, stats } = ctx;
  const transfer = state.transfer;

  return el(
    'div',
    { class: 'screen screen-save' },

    panel(
      'Where your progress is',
      el('p', { class: `hud-storage-${durability.level}` }, durability.text),
      el(
        'p',
        { class: 'muted' },
        `${stats.completed} ${stats.completed === 1 ? 'ticket' : 'tickets'} closed · ${stats.xp} XP.`
      ),
      el(
        'p',
        { class: 'muted' },
        'Browser storage is tied to this exact file in this exact place. Copy the game to another folder or a ' +
          'different drive letter and it will look empty — the save is still there, under the old location. ' +
          'Keeping an exported file beside the game is what makes it follow you.'
      )
    ),

    panel(
      'Take a copy',
      el('p', {}, 'Downloads first, the clipboard if downloads are blocked, and the text on screen if both are.'),
      button('Export my progress', () => actions.exportSave(), { class: 'primary' }),
      transfer &&
        transfer.kind === 'export' &&
        el('p', { class: transfer.ok ? 'verdict verdict-yes' : 'verdict verdict-no' }, transfer.message),
      transfer &&
        transfer.text &&
        el('textarea', {
          class: 'save-text',
          readonly: 'readonly',
          rows: '8',
          spellcheck: 'false',
          onFocus: (event) => event.target.select(),
          text: transfer.text
        })
    ),

    panel(
      'Bring progress in',
      el('p', {}, 'Load a save exported from another copy of this file. It replaces what is here.'),
      el(
        'div',
        { class: 'actions' },
        button('Choose a save file', () => actions.importFromFile()),
        button('Paste one instead', () => actions.togglePaste())
      ),
      state.pasting &&
        el(
          'div',
          { class: 'paste-box' },
          el('textarea', {
            class: 'save-text',
            rows: '8',
            spellcheck: 'false',
            placeholder: 'Paste the contents of a Night Shift save file here',
            onInput: (event) => actions.setPasteText(event.target.value, { quiet: true })
          }),
          button('Load it', () => actions.importFromText(), { class: 'primary' })
        ),
      transfer &&
        transfer.kind === 'import' &&
        el('p', { class: transfer.ok ? 'verdict verdict-yes' : 'verdict verdict-no' }, transfer.message)
    ),

    panel(
      'Start again',
      el('p', { class: 'muted' }, 'Clears every closed ticket and your review deck from this browser. Exported files are untouched.'),
      state.confirmingReset
        ? el(
            'div',
            { class: 'actions' },
            button('Yes, wipe it', () => actions.resetEverything(), { class: 'danger' }),
            button('No, keep it', () => actions.cancelReset())
          )
        : button('Wipe my progress', () => actions.askReset())
    )
  );
}

export default {
  id: 'system',
  title: 'System',
  short: 'System',
  defaultSize: { w: 600, h: 580 },

  subtitle(ctx) {
    return ctx.durability.level === 'browser' ? 'saved' : 'export me';
  },

  body(ctx) {
    return saveScreen(ctx);
  }
};
