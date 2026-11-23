/**
 * Running a line.
 *
 * A command is a pure function of (arguments, world, session). It returns lines
 * of output and, if it changed something, the events that changed it — it never
 * touches the world directly. That is what lets every command be tested headlessly
 * and what lets a mission's reference solution drive the terminal exactly the way
 * a player does.
 *
 * Three rules hold the whole thing together:
 *
 *   1. A command never throws. A thrown command is a dead terminal, and a dead
 *      terminal on the target machine is a dead game. Anything that escapes is
 *      caught here and printed as an internal error.
 *   2. Errors go to stderr and set a non-zero exit, as they would in a real shell.
 *   3. An unknown command says so in the shell's words and, where it can, names
 *      the command that was probably meant.
 */

import { parseLine, parseFlags } from './parse.js';
import { withHistory, withExit } from './session.js';
import { CROSS_OS_HINTS } from './authenticity.js';

/** Output lines carry a stream so the view can colour them. */
export const OUT = 'out';
export const ERR = 'err';
export const ECHO = 'echo';

const line = (stream, text) => ({ stream, text });

/**
 * Levenshtein distance, capped — used only to say "did you mean nslookup?".
 * Cheap at these lengths, and the suggestion is most of what makes a typo
 * recoverable when there is no manual open.
 */
function distance(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const previous = Array.from({ length: b.length + 1 }, (unused, index) => index);

  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diagonal = temp;
    }
  }
  return previous[b.length];
}

function suggest(name, registry) {
  const names = Object.keys(registry);
  let best = null;
  let bestScore = 3;

  for (const candidate of names) {
    const score = distance(name.toLowerCase(), candidate);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

/** Look a command up by name or alias. */
export function resolveCommand(registry, name) {
  if (Object.prototype.hasOwnProperty.call(registry, name)) return registry[name];
  for (const command of Object.values(registry)) {
    if (command.aliases && command.aliases.includes(name)) return command;
  }
  return null;
}

function usageLines(command) {
  const out = [`usage: ${command.usage}`];
  if (command.summary) out.push(`       ${command.summary}`);
  return out;
}

/**
 * Run one stage.
 * @returns {{stdout: string[], stderr: string[], exit: number, events: Array, session: object}}
 */
function runStage(stage, context, stdin) {
  const { registry, world, session } = context;
  const command = resolveCommand(registry, stage.name);

  if (!command) {
    // A Windows command name is not wired up as an alias — it genuinely does not
    // exist here, exactly as on a real Linux box. Failing and then naming the
    // equivalent teaches the difference; aliasing them would teach that there
    // isn't one.
    const crossOs = CROSS_OS_HINTS[stage.name.toLowerCase()];
    if (crossOs) {
      return {
        stdout: [],
        stderr: [
          `${stage.name}: command not found`,
          crossOs.note,
          `Here, use: ${crossOs.instead}`
        ],
        exit: 127,
        events: [],
        answers: null,
        clear: false,
        session
      };
    }

    const guess = suggest(stage.name, registry);
    return {
      stdout: [],
      stderr: [
        `${stage.name}: command not found`,
        ...(guess ? [`Did you mean "${guess}"?`] : ['Type "help" to see what this machine has.'])
      ],
      exit: 127,
      events: [],
      answers: null,
      clear: false,
      session
    };
  }

  const { flags, positional, errors } = parseFlags(stage.argv, command.flags || {});

  if (flags.help) {
    return { stdout: usageLines(command), stderr: [], exit: 0, events: [], answers: null, clear: false, session };
  }

  if (errors.length > 0) {
    return {
      stdout: [],
      stderr: [...errors.map((message) => `${command.name}: ${message}`), `usage: ${command.usage}`],
      exit: 2,
      events: [],
      answers: null,
      clear: false,
      session
    };
  }

  try {
    const result = command.run({
      argv: stage.argv,
      flags,
      positional,
      stdin,
      world,
      session,
      registry,
      ctx: context.ctx || {}
    }) || {};

    return {
      stdout: result.stdout || [],
      stderr: result.stderr || [],
      exit: result.exit === undefined ? (result.stderr && result.stderr.length > 0 ? 1 : 0) : result.exit,
      events: result.events || [],
      answers: result.answers || null,
      clear: result.clear === true,
      session: result.session || session
    };
  } catch (error) {
    // A command that throws is a bug in content, not a reason to lose the terminal.
    return {
      stdout: [],
      stderr: [`${command.name}: internal error — ${(error && error.message) || error}`],
      exit: 70,
      events: [],
      answers: null,
      clear: false,
      session
    };
  }
}

/**
 * Run a whole line, pipeline and all.
 *
 * @param raw     what the player typed
 * @param context {registry, world, session, ctx}
 * @returns {{session, output: Array<{stream, text}>, events: Array, exit: number}}
 */
export function runLine(raw, context) {
  const prompt = context.prompt === undefined ? null : context.prompt;
  const output = [];
  if (prompt !== null) output.push(line(ECHO, `${prompt} ${raw}`));

  let session = withHistory(context.session, raw);
  const parsed = parseLine(raw);

  if (!parsed.ok) {
    output.push(line(ERR, parsed.error));
    return { session: withExit(session, 2), output, events: [], exit: 2, answers: null, clear: false };
  }

  if (parsed.stages.length === 0) {
    return { session, output, events: [], exit: 0, answers: null, clear: false };
  }

  const events = [];
  let answers = null;
  let clearScreen = false;
  let stdin = [];
  let exit = 0;

  for (let index = 0; index < parsed.stages.length; index++) {
    const isLast = index === parsed.stages.length - 1;
    const result = runStage(parsed.stages[index], { ...context, session }, stdin);

    session = result.session;
    events.push(...result.events);
    exit = result.exit;
    if (result.clear) clearScreen = true;
    if (result.answers) answers = { ...(answers || {}), ...result.answers };

    // stderr is never piped — it goes straight to the screen, as in a real shell.
    for (const text of result.stderr) output.push(line(ERR, text));

    if (isLast) {
      for (const text of result.stdout) output.push(line(OUT, text));
    } else if (result.exit !== 0) {
      // A failed stage stops the pipeline rather than feeding rubbish onward.
      break;
    } else {
      stdin = result.stdout;
    }
  }

  return { session: withExit(session, exit), output, events, exit, answers, clear: clearScreen };
}

/**
 * Names for tab completion, sorted. Aliases included, because a player who has
 * learned `dig` should be able to complete `dig`.
 */
export function completionNames(registry) {
  const names = new Set();
  for (const command of Object.values(registry)) {
    names.add(command.name);
    for (const alias of command.aliases || []) names.add(alias);
  }
  return [...names].sort();
}

/** The longest common prefix of the candidates, for what tab should insert. */
export function completePrefix(partial, registry) {
  const matches = completionNames(registry).filter((name) => name.startsWith(partial));
  if (matches.length === 0) return { matches: [], completed: partial };
  if (matches.length === 1) return { matches, completed: matches[0] };

  let prefix = matches[0];
  for (const match of matches) {
    while (!match.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  return { matches, completed: prefix };
}
