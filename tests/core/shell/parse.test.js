/**
 * Parsing a command line.
 *
 * The whole premise of the terminal is that the commands have the right names
 * and the right syntax — so the parser has to behave like a shell, including
 * when the player gets it wrong. A typo must produce the error a real shell
 * produces, not a silent misread that leaves them wondering why nothing worked.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, parseLine, parseFlags } from '../../../src/core/shell/parse.js';

describe('tokenize', () => {
  test('splits on whitespace', () => {
    assert.deepEqual(tokenize('ping 10.20.10.10'), ['ping', '10.20.10.10']);
  });

  test('collapses runs of whitespace and trims', () => {
    assert.deepEqual(tokenize('  nmap   -sV   10.20.10.30  '), ['nmap', '-sV', '10.20.10.30']);
  });

  test('keeps a double-quoted span together', () => {
    assert.deepEqual(tokenize('grep "failed login" auth.log'), ['grep', 'failed login', 'auth.log']);
  });

  test('keeps a single-quoted span together', () => {
    assert.deepEqual(tokenize("grep 'failed login' auth.log"), ['grep', 'failed login', 'auth.log']);
  });

  test('a quote inside the other kind of quote is literal', () => {
    assert.deepEqual(tokenize(`grep "it's here"`), ['grep', "it's here"]);
  });

  test('a backslash escapes the next character', () => {
    assert.deepEqual(tokenize('cat my\\ file.txt'), ['cat', 'my file.txt']);
  });

  test('an empty quoted string is a real, empty argument', () => {
    assert.deepEqual(tokenize('grep ""'), ['grep', '']);
  });

  test('an empty line is no tokens', () => {
    assert.deepEqual(tokenize(''), []);
    assert.deepEqual(tokenize('   '), []);
  });

  test('an unclosed quote is reported rather than guessed at', () => {
    assert.throws(() => tokenize('grep "failed login'), /unterminated/i);
  });
});

describe('parseLine', () => {
  test('a simple command', () => {
    const line = parseLine('ping 10.20.10.10');
    assert.equal(line.ok, true);
    assert.equal(line.stages.length, 1);
    assert.equal(line.stages[0].name, 'ping');
    assert.deepEqual(line.stages[0].argv, ['10.20.10.10']);
  });

  test('the command name is kept as typed, so the error can quote it back', () => {
    assert.equal(parseLine('Ping 10.0.0.1').stages[0].name, 'Ping');
  });

  test('a pipeline splits into stages', () => {
    const line = parseLine('cat auth.log | grep denied | sort');
    assert.deepEqual(line.stages.map((stage) => stage.name), ['cat', 'grep', 'sort']);
    assert.deepEqual(line.stages[1].argv, ['denied']);
  });

  test('a pipe inside quotes is not a pipe', () => {
    const line = parseLine('grep "a | b" notes.txt');
    assert.equal(line.stages.length, 1);
    assert.deepEqual(line.stages[0].argv, ['a | b', 'notes.txt']);
  });

  test('an empty line parses to nothing, which is not an error', () => {
    const line = parseLine('   ');
    assert.equal(line.ok, true);
    assert.deepEqual(line.stages, []);
  });

  test('a pipe with nothing after it is a syntax error, as in a real shell', () => {
    const line = parseLine('cat auth.log |');
    assert.equal(line.ok, false);
    assert.match(line.error, /syntax error/i);
  });

  test('a pipe with nothing before it is a syntax error', () => {
    assert.equal(parseLine('| grep denied').ok, false);
  });

  test('an unterminated quote is reported, not thrown', () => {
    const line = parseLine('grep "denied');
    assert.equal(line.ok, false);
    assert.match(line.error, /unterminated/i);
  });

  test('the raw line is kept for the history and the transcript', () => {
    assert.equal(parseLine('  ping  10.0.0.1 ').raw, '  ping  10.0.0.1 ');
  });
});

describe('parseFlags', () => {
  const spec = {
    count: { short: 'c', value: true, default: 4 },
    verbose: { short: 'v' },
    service: { short: 'sV' },
    type: { long: 'type', value: true }
  };

  test('bare arguments come back as positional', () => {
    const parsed = parseFlags(['10.20.10.10'], spec);
    assert.deepEqual(parsed.positional, ['10.20.10.10']);
    assert.deepEqual(parsed.errors, []);
  });

  test('a short flag with a separate value', () => {
    const parsed = parseFlags(['-c', '2', 'host'], spec);
    assert.equal(parsed.flags.count, '2');
    assert.deepEqual(parsed.positional, ['host']);
  });

  test('a short boolean flag', () => {
    assert.equal(parseFlags(['-v', 'host'], spec).flags.verbose, true);
  });

  test('a multi-letter short flag, as nmap uses', () => {
    assert.equal(parseFlags(['-sV', 'host'], spec).flags.service, true);
  });

  test('a long flag with an equals sign', () => {
    assert.equal(parseFlags(['--type=A', 'host'], spec).flags.type, 'A');
  });

  test('a long flag with a separate value', () => {
    assert.equal(parseFlags(['--type', 'CNAME'], spec).flags.type, 'CNAME');
  });

  test('defaults are filled in for flags that were not given', () => {
    assert.equal(parseFlags(['host'], spec).flags.count, 4);
  });

  test('an unknown flag is an error naming the flag', () => {
    const parsed = parseFlags(['-z', 'host'], spec);
    assert.match(parsed.errors[0], /-z/);
  });

  test('a flag that needs a value and does not get one is an error', () => {
    const parsed = parseFlags(['-c'], spec);
    assert.match(parsed.errors[0], /requires? a value|expects/i);
  });

  test('--help is always understood, without being in the spec', () => {
    assert.equal(parseFlags(['--help'], spec).flags.help, true);
    assert.equal(parseFlags(['-h'], spec).flags.help, true);
  });

  test('everything after -- is positional, even if it looks like a flag', () => {
    const parsed = parseFlags(['--', '-v'], spec);
    assert.deepEqual(parsed.positional, ['-v']);
    assert.equal(parsed.flags.verbose, undefined);
  });

  test('a lone dash is an ordinary argument', () => {
    assert.deepEqual(parseFlags(['-'], spec).positional, ['-']);
  });
});
