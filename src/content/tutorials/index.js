/**
 * Every command walkthrough in this build.
 *
 * Grouped the same way the commands themselves are, so a new command and its
 * tutorial are written next to each other. `tests/content/tutorials.test.js`
 * refuses to let a command ship without one, and types every step into a real
 * session to prove the walkthrough still works.
 */

import { NET_TUTORIALS } from './net.js';
import { NAME_TUTORIALS } from './names.js';
import { ACCESS_TUTORIALS } from './access.js';
import { DESK_TUTORIALS } from './desk.js';

import { byCommand } from '../../core/shell/tutorial.js';

export const TUTORIALS = Object.freeze([
  ...DESK_TUTORIALS,
  ...NET_TUTORIALS,
  ...NAME_TUTORIALS,
  ...ACCESS_TUTORIALS
]);

export const TUTORIAL = byCommand(TUTORIALS);

export function tutorialFor(command) {
  return TUTORIAL[command] || null;
}

/**
 * The order the Manual lists them in: the same grouping `help` uses, because a
 * player who has just read `help` should find the walkthroughs arranged the way
 * they have already seen them.
 */
export const TUTORIAL_GROUPS = Object.freeze([
  Object.freeze({ title: 'Finding your way', commands: ['help', 'man', 'tutorial', 'history', 'clear'] }),
  Object.freeze({ title: 'This machine', commands: ['ifconfig', 'ip'] }),
  Object.freeze({ title: 'Reaching other machines', commands: ['ping', 'traceroute', 'nmap', 'arp', 'route'] }),
  Object.freeze({ title: 'Names', commands: ['nslookup', 'dig', 'nsupdate'] }),
  Object.freeze({ title: 'Accounts', commands: ['samba-tool'] }),
  Object.freeze({ title: 'Working somewhere else', commands: ['ssh', 'console', 'exit'] }),
  Object.freeze({ title: 'The ticket', commands: ['submit'] })
]);
