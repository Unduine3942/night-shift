/**
 * What a command tutorial is.
 *
 * A tutorial is DATA, like a mission, and for the same reason: so the build can
 * check it. Every step carries a line to type and a string that must appear in
 * what comes back, and `tests/content/tutorials.test.js` types every line into a
 * real session against the real world and asserts the string is there.
 *
 * That is the whole design. Documentation rots silently — it is the one part of
 * a project that can be wrong for a year without anybody noticing, and a
 * walkthrough that tells you to type something that no longer works is worse
 * than no walkthrough, because the player assumes they made the mistake. Making
 * the steps executable means a tutorial cannot drift from the tool it documents:
 * change the output format and the tutorial fails the build.
 *
 * `mistakes` are executable too. A tutorial that says "this will fail" has to be
 * right about how it fails, and the failure text is often the most useful thing
 * on the page.
 */

import { CONCEPTS } from '../../content/concepts.js';
import { check, isPlainObject, isNonEmptyString } from '../validate.js';

/** Long enough that a stub cannot pass for an explanation. */
export const MIN_IDEA = 80;
export const MIN_WHY = 40;

function requireProse(value, min, field, label) {
  check(isNonEmptyString(value), `${label}: ${field} must be a non-empty string`);
  check(
    value.trim().length >= min,
    `${label}: ${field} is ${value.trim().length} characters — under ${min} it is a placeholder, not an explanation`
  );
}

function validateStep(step, index, label) {
  const where = `${label}: step ${index + 1}`;
  check(isPlainObject(step), `${where} must be an object`);

  check(isNonEmptyString(step.title), `${where}: needs a title`);
  check(isNonEmptyString(step.line), `${where}: needs a line to type`);

  // Every step has to be checkable. Almost all of them name text that must come
  // back; `clears` is for the one command whose whole job is to leave nothing
  // behind, where an empty screen IS the observable result.
  if (step.clears === true) {
    check(
      step.look === undefined,
      `${where}: a step that clears the screen has no output to look for`
    );
  } else {
    check(
      isNonEmptyString(step.look),
      `${where}: needs "look" — the text that must appear in the output, which is what makes this checkable`
    );
  }

  requireProse(step.why, MIN_WHY, 'why', where);
}

function validateMistake(mistake, index, label) {
  const where = `${label}: mistake ${index + 1}`;
  check(isPlainObject(mistake), `${where} must be an object`);
  check(isNonEmptyString(mistake.line), `${where}: needs the line that goes wrong`);
  check(isNonEmptyString(mistake.look), `${where}: needs the text the failure actually prints`);
  requireProse(mistake.why, MIN_WHY, 'why', where);
}

/**
 * Check one tutorial's shape. Throws a TypeError naming the offending field.
 * @returns the tutorial, so it can be used inline
 */
export function validateTutorial(tutorial) {
  check(isPlainObject(tutorial), 'a tutorial must be an object');

  const label = isNonEmptyString(tutorial.command) ? tutorial.command : '(tutorial with no command)';
  check(isNonEmptyString(tutorial.command), `${label}: command must name the command it explains`);

  requireProse(tutorial.idea, MIN_IDEA, 'idea', label);
  requireProse(tutorial.onTheJob, MIN_IDEA, 'onTheJob', label);

  check(Array.isArray(tutorial.concepts) && tutorial.concepts.length > 0, `${label}: needs at least one concept`);
  for (const id of tutorial.concepts) {
    check(
      Object.prototype.hasOwnProperty.call(CONCEPTS, id),
      `${label}: names concept "${id}", which is not in the vocabulary`
    );
  }

  check(Array.isArray(tutorial.steps) && tutorial.steps.length > 0, `${label}: needs at least one step`);
  tutorial.steps.forEach((step, index) => validateStep(step, index, label));

  const mistakes = tutorial.mistakes || [];
  check(Array.isArray(mistakes), `${label}: mistakes must be an array`);
  mistakes.forEach((mistake, index) => validateMistake(mistake, index, label));

  const reading = tutorial.reading || [];
  check(Array.isArray(reading), `${label}: reading must be an array`);
  for (const row of reading) {
    check(isPlainObject(row) && isNonEmptyString(row.part) && isNonEmptyString(row.means),
      `${label}: every reading row needs a part and what it means`);
  }

  const seeAlso = tutorial.seeAlso || [];
  check(Array.isArray(seeAlso) && seeAlso.every(isNonEmptyString), `${label}: seeAlso must be command names`);

  check(
    tutorial.ticket === undefined || isNonEmptyString(tutorial.ticket),
    `${label}: ticket must be a mission id when present — it is the ticket the steps are run inside`
  );

  return tutorial;
}

/**
 * Check a whole set against the commands that exist.
 *
 * @returns {{ok: boolean, problems: Array<{command: string, problem: string}>}}
 */
export function validateTutorials(tutorials, commandNames) {
  const problems = [];
  const add = (command, problem) => problems.push({ command, problem });

  const known = new Set(commandNames);
  const seen = new Set();

  for (const tutorial of tutorials) {
    const label = (tutorial && tutorial.command) || '(unnamed)';
    try {
      validateTutorial(tutorial);
    } catch (error) {
      add(label, error.message);
      continue;
    }

    if (seen.has(tutorial.command)) add(tutorial.command, 'two tutorials for the same command');
    seen.add(tutorial.command);

    if (!known.has(tutorial.command)) {
      add(tutorial.command, 'explains a command this build does not have');
    }

    for (const other of tutorial.seeAlso || []) {
      if (!known.has(other)) add(tutorial.command, `seeAlso names "${other}", which is not a command`);
      if (other === tutorial.command) add(tutorial.command, 'seeAlso points at itself');
    }
  }

  for (const name of commandNames) {
    if (!seen.has(name)) add(name, 'has no tutorial — every command the player can type must be explained');
  }

  return { ok: problems.length === 0, problems };
}

/** Index a set by command name. */
export function byCommand(tutorials) {
  return Object.freeze(Object.fromEntries(tutorials.map((tutorial) => [tutorial.command, tutorial])));
}
