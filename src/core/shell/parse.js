/**
 * Turning a typed line into something runnable.
 *
 * The terminal only teaches anything if the syntax is real, which means the
 * parser has to behave like a shell when the player gets it right AND when they
 * get it wrong. An unterminated quote says "unterminated quote"; a dangling pipe
 * says "syntax error near |". Guessing what they meant would be friendlier and
 * would teach them nothing that transfers to a real machine.
 *
 * Deliberately not supported: variables, subshells, globbing, background jobs,
 * redirection to files. Pipes are in because reading a log through `grep` is one
 * of the genuinely useful habits this is trying to build; the rest is scope that
 * would cost more than it teaches.
 */

const QUOTES = new Set(['"', "'"]);

/**
 * Split a line into tokens, respecting quotes and backslash escapes.
 * @throws {Error} on an unterminated quote
 */
export function tokenize(line) {
  const tokens = [];
  let current = '';
  let started = false;
  let quote = null;

  for (let index = 0; index < line.length; index++) {
    const char = line[index];

    if (char === '\\' && index + 1 < line.length) {
      current += line[++index];
      started = true;
      continue;
    }

    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }

    if (QUOTES.has(char)) {
      quote = char;
      started = true;
      continue;
    }

    if (char === ' ' || char === '\t') {
      if (started) {
        tokens.push(current);
        current = '';
        started = false;
      }
      continue;
    }

    current += char;
    started = true;
  }

  if (quote) {
    throw new Error(`unterminated ${quote === '"' ? 'double' : 'single'} quote`);
  }
  if (started) tokens.push(current);

  return tokens;
}

/**
 * Parse a whole line into pipeline stages.
 *
 * Never throws — a syntax error is a result the terminal prints, not an
 * exception. This runs inside a keypress handler on a machine with no devtools.
 *
 * @returns {{ok: boolean, raw: string, stages: Array<{name: string, argv: string[]}>, error?: string}}
 */
export function parseLine(raw) {
  let tokens;
  try {
    tokens = tokenize(raw);
  } catch (error) {
    return { ok: false, raw, stages: [], error: error.message };
  }

  if (tokens.length === 0) return { ok: true, raw, stages: [] };

  const stages = [];
  let current = [];

  for (const token of tokens) {
    if (token === '|') {
      if (current.length === 0) {
        return { ok: false, raw, stages: [], error: 'syntax error near unexpected token `|`' };
      }
      stages.push(current);
      current = [];
      continue;
    }
    current.push(token);
  }

  if (current.length === 0) {
    return { ok: false, raw, stages: [], error: 'syntax error near unexpected token `|`' };
  }
  stages.push(current);

  return {
    ok: true,
    raw,
    stages: stages.map((parts) => ({ name: parts[0], argv: parts.slice(1) }))
  };
}

/**
 * Interpret a command's arguments against its flag specification.
 *
 * A spec entry is `{short, long, value, default}`. `short` may be more than one
 * letter, because the tools being imitated do that — `nmap -sV` is one flag, not
 * `-s -V`, and pretending otherwise would teach the wrong syntax.
 *
 * Errors are collected rather than thrown, so a command can print all of them at
 * once instead of one per attempt.
 *
 * @returns {{flags: object, positional: string[], errors: string[]}}
 */
export function parseFlags(argv, spec = {}) {
  const byShort = new Map();
  const byLong = new Map();

  for (const [name, entry] of Object.entries(spec)) {
    if (entry.short) byShort.set(entry.short, { name, ...entry });
    byLong.set(entry.long || name, { name, ...entry });
  }

  const flags = {};
  const positional = [];
  const errors = [];
  let onlyPositional = false;

  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];

    if (onlyPositional || token === '-' || !token.startsWith('-')) {
      positional.push(token);
      continue;
    }

    if (token === '--') {
      onlyPositional = true;
      continue;
    }

    // --help and -h are understood by every command, spec or not.
    if (token === '--help' || token === '-h') {
      flags.help = true;
      continue;
    }

    const isLong = token.startsWith('--');
    const body = token.slice(isLong ? 2 : 1);
    const [key, inlineValue] = isLong && body.includes('=')
      ? [body.slice(0, body.indexOf('=')), body.slice(body.indexOf('=') + 1)]
      : [body, undefined];

    const entry = isLong ? byLong.get(key) : byShort.get(key);
    if (!entry) {
      errors.push(`unknown option: ${token}`);
      continue;
    }

    if (!entry.value) {
      flags[entry.name] = true;
      continue;
    }

    if (inlineValue !== undefined) {
      flags[entry.name] = inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (next === undefined || (next.startsWith('-') && next !== '-')) {
      errors.push(`option ${token} requires a value`);
      continue;
    }

    flags[entry.name] = next;
    index++;
  }

  for (const [name, entry] of Object.entries(spec)) {
    if (flags[name] === undefined && entry.default !== undefined) {
      flags[name] = entry.default;
    }
  }

  return { flags, positional, errors };
}
