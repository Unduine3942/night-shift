/**
 * Structural guard for the two rules that the whole architecture leans on.
 *
 * 1. Determinism — nothing in core/ may read the wall clock or Math.random().
 *    A log-hunt mission has to produce the same 10,000 lines every time or it
 *    cannot be graded, replayed, or tested.
 *
 * 2. The core/ui boundary — core/ must stay free of browser globals, because
 *    that is the only reason `node --test` can cover it without a DOM or any
 *    test dependency.
 *
 * These are cheap to enforce now and very expensive to retrofit later, which is
 * exactly what a guard test is for.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const CORE_DIR = fileURLToPath(new URL('../../src/core', import.meta.url));

/** The single sanctioned adapter for browser storage. Everything else stays pure. */
const BROWSER_ACCESS_ALLOWED = ['save/storage.js'];

function collectJsFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...collectJsFiles(full));
    else if (entry.endsWith('.js')) found.push(full);
  }
  return found;
}

/** Remove block and line comments so prose about a banned API is not a violation. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1');
}

function relPath(file) {
  return relative(CORE_DIR, file).split(sep).join('/');
}

const NON_DETERMINISTIC = [
  [/\bMath\.random\s*\(/, 'Math.random() — use createRng() from core/rng.js'],
  [/\bDate\.now\s*\(/, 'Date.now() — time is the world tick, see core/clock.js'],
  [/\bnew\s+Date\s*\(\s*\)/, 'new Date() with no argument — same reason'],
  [/\bperformance\.now\s*\(/, 'performance.now() — not reproducible']
];

const BROWSER_GLOBALS = [
  [/\bdocument\s*\./, 'document'],
  [/\bwindow\s*\./, 'window'],
  [/\blocalStorage\b/, 'localStorage'],
  [/\bsessionStorage\b/, 'sessionStorage'],
  [/\bindexedDB\b/, 'indexedDB'],
  [/\bfetch\s*\(/, 'fetch()'],
  [/\bnew\s+Worker\s*\(/, 'Worker']
];

const files = collectJsFiles(CORE_DIR);

describe('core/ is deterministic', () => {
  test('there is something to check', () => {
    assert.ok(files.length > 0, 'found no .js files under src/core');
  });

  for (const file of files) {
    test(`${relPath(file)} avoids non-deterministic sources`, () => {
      const code = stripComments(readFileSync(file, 'utf8'));
      for (const [pattern, why] of NON_DETERMINISTIC) {
        assert.ok(!pattern.test(code), `${relPath(file)} uses ${why}`);
      }
    });
  }
});

describe('core/ does not reach into the browser', () => {
  for (const file of files) {
    const name = relPath(file);
    if (BROWSER_ACCESS_ALLOWED.includes(name)) continue;

    test(`${name} stays free of browser globals`, () => {
      const code = stripComments(readFileSync(file, 'utf8'));
      for (const [pattern, global] of BROWSER_GLOBALS) {
        assert.ok(
          !pattern.test(code),
          `${name} touches ${global}; move that into ui/ or core/save/storage.js`
        );
      }
    });
  }
});
