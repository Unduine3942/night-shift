/**
 * Everything the terminal can do.
 *
 * The plan caps this at fifteen simulated tools, and the cap is the point: a
 * command is added when a mission needs it, never because a real shell has it.
 * Every command is a surface that has to stay consistent with every other lens on
 * the same world, and the cheapest way to keep four lenses agreeing is to have
 * few of them.
 *
 * The meta commands — help, man, history, clear, submit — are not simulation and
 * do not count against that budget.
 */

import { NET_COMMANDS } from './commands/net.js';
import { DNS_COMMANDS } from './commands/dns.js';
import { DIRECTORY_COMMANDS } from './commands/directory.js';
import { META_COMMANDS } from './commands/meta.js';

const ALL = [...META_COMMANDS, ...NET_COMMANDS, ...DNS_COMMANDS, ...DIRECTORY_COMMANDS];

/** How many simulated tools this build has, for the budget test. */
export const SIMULATED_COMMANDS = [...NET_COMMANDS, ...DNS_COMMANDS, ...DIRECTORY_COMMANDS].map(
  (command) => command.name
);

export const COMMAND_BUDGET = 15;

export const REGISTRY = Object.freeze(Object.fromEntries(ALL.map((command) => [command.name, command])));

export const COMMAND_NAMES = Object.keys(REGISTRY).sort();

export function createRegistry(commands = ALL) {
  return Object.freeze(Object.fromEntries(commands.map((command) => [command.name, command])));
}
