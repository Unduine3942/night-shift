/**
 * The apps this desktop has, and how it starts.
 *
 * The order here is the taskbar order, which is also the order they are worth
 * opening in: the work arrives in Mail, gets done in the Terminal, gets
 * practised in Training, gets looked up in the Manual, and gets saved in System.
 */

import mail from './mail.js';
import terminal from './terminal.js';
import training from './training.js';
import manual from './manual.js';
import system from './system.js';

export const APPS = Object.freeze([mail, terminal, training, manual, system]);

export const APP = Object.freeze(Object.fromEntries(APPS.map((app) => [app.id, app])));

export function appById(id) {
  return APP[id] || null;
}

/**
 * The layout the game opens on: the inbox on the left, the terminal on the
 * right, sized so a ticket and its shell are both readable at 1280×720 — the
 * smallest screen the plan commits to.
 */
export const OPENING_LAYOUT = Object.freeze([
  Object.freeze({ appId: 'mail', weight: 2 }),
  Object.freeze({ appId: 'terminal', weight: 3 })
]);
