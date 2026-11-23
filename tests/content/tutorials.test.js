/**
 * The tutorials, played rather than read.
 *
 * Documentation is the one part of a project that can be wrong for a year
 * without anyone noticing, and a walkthrough that tells you to type something
 * that no longer works is worse than no walkthrough at all — the player assumes
 * the mistake is theirs.
 *
 * So every step is typed into a real session against the real world, in order,
 * and the text the tutorial promised has to come back. Change a command's output
 * format and the tutorials that quote it fail the build. This is the same bargain
 * the missions make with their reference solutions, and it is the only way a
 * hundred-odd assertions about tool behaviour stay true.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { TUTORIALS, TUTORIAL, TUTORIAL_GROUPS, tutorialFor } from '../../src/content/tutorials/index.js';
import { validateTutorial, validateTutorials, MIN_IDEA, MIN_WHY } from '../../src/core/shell/tutorial.js';
import { REGISTRY, COMMAND_NAMES } from '../../src/core/shell/registry.js';
import { CONCEPTS } from '../../src/content/concepts.js';
import { MISSIONS, missionById } from '../../src/content/missions/index.js';
import { PRACTICE } from '../../src/content/practice.js';
import { HOST } from '../../src/content/world/contract.js';
import { createSeed } from '../../src/core/world/seed.js';
import { beginMission, runInMission } from '../../src/core/missions/runtime.js';

/* ---------------- running a tutorial for real ---------------- */

/**
 * Play every line of a tutorial in one session, the way a player would.
 *
 * One session, not one per step, because the steps are a sequence: `ssh` then a
 * command then `exit` only makes sense if the state carries. That also means a
 * tutorial whose steps contradict each other fails here.
 */
function play(tutorial, lines) {
  const mission = tutorial.ticket ? missionById(tutorial.ticket) : PRACTICE;
  assert.ok(mission, `${tutorial.command}: names ticket "${tutorial.ticket}", which does not exist`);

  let session = beginMission(mission, createSeed(), { workstation: HOST.PC_IT.id });
  const transcript = [];

  for (const line of lines) {
    const before = session.shell.output.length;
    session = runInMission(session, line);
    const fresh = session.shell.output.slice(before).filter((entry) => entry.stream !== 'echo');

    transcript.push({
      line,
      text: fresh.map((entry) => entry.text || '').join('\n'),
      empty: session.shell.output.length === 0
    });
  }

  return transcript;
}

/* ---------------- shape ---------------- */

describe('every command is explained', () => {
  test('the set is valid against the commands this build has', () => {
    const result = validateTutorials(TUTORIALS, COMMAND_NAMES);
    assert.ok(
      result.ok,
      `tutorials are not valid:\n${result.problems.map((p) => `  ${p.command}: ${p.problem}`).join('\n')}`
    );
  });

  test('no command can ship without one', () => {
    for (const name of COMMAND_NAMES) {
      assert.ok(tutorialFor(name), `${name} has no tutorial`);
    }
  });

  test('no tutorial explains a command that does not exist', () => {
    for (const tutorial of TUTORIALS) {
      assert.ok(REGISTRY[tutorial.command], `${tutorial.command} is documented but not implemented`);
    }
  });

  test('every concept named is in the vocabulary the missions use', () => {
    for (const tutorial of TUTORIALS) {
      for (const id of tutorial.concepts) {
        assert.ok(CONCEPTS[id], `${tutorial.command}: "${id}" is not a concept`);
      }
    }
  });

  test('the Manual groups cover every command exactly once', () => {
    const listed = TUTORIAL_GROUPS.flatMap((group) => group.commands);
    assert.equal(new Set(listed).size, listed.length, 'a command appears in two groups');

    for (const name of COMMAND_NAMES) {
      assert.ok(listed.includes(name), `${name} is in no Manual group, so it cannot be browsed to`);
    }
    for (const name of listed) {
      assert.ok(REGISTRY[name], `the Manual groups list "${name}", which is not a command`);
    }
  });

  test('a malformed tutorial is refused with a message naming the field', () => {
    assert.throws(() => validateTutorial({}), /command/);
    assert.throws(() => validateTutorial({ command: 'ping' }), /idea/);
    assert.throws(
      () => validateTutorial({ command: 'ping', idea: 'too short', onTheJob: 'x'.repeat(MIN_IDEA) }),
      /idea is \d+ characters/
    );
    assert.throws(
      () =>
        validateTutorial({
          command: 'ping',
          idea: 'x'.repeat(MIN_IDEA),
          onTheJob: 'x'.repeat(MIN_IDEA),
          concepts: ['not-a-concept'],
          steps: [{ title: 't', line: 'l', look: 'x', why: 'y'.repeat(MIN_WHY) }]
        }),
      /not in the vocabulary/
    );
    assert.throws(
      () =>
        validateTutorial({
          command: 'ping',
          idea: 'x'.repeat(MIN_IDEA),
          onTheJob: 'x'.repeat(MIN_IDEA),
          concepts: ['cli-ping'],
          steps: [{ title: 't', line: 'l', why: 'y'.repeat(MIN_WHY) }]
        }),
      /look/
    );
  });

  test('seeAlso only points at commands, and never at itself', () => {
    for (const tutorial of TUTORIALS) {
      for (const other of tutorial.seeAlso || []) {
        assert.ok(REGISTRY[other], `${tutorial.command}: seeAlso names "${other}"`);
        assert.notEqual(other, tutorial.command, `${tutorial.command}: seeAlso points at itself`);
      }
    }
  });
});

/* ---------------- the part that matters ---------------- */

describe('every step actually works', () => {
  for (const tutorial of TUTORIALS) {
    test(`${tutorial.command}: the steps run and say what they promise`, () => {
      const transcript = play(tutorial, tutorial.steps.map((step) => step.line));

      tutorial.steps.forEach((step, index) => {
        const result = transcript[index];
        const where = `${tutorial.command} step ${index + 1} ("${step.line}")`;

        if (step.clears) {
          assert.equal(result.empty, true, `${where}: the screen was meant to be empty afterwards`);
          return;
        }

        assert.ok(
          result.text.includes(step.look),
          `${where}: promised "${step.look}" but got:\n${result.text || '(nothing)'}`
        );
      });
    });
  }

  test('no step quietly runs a command that does not exist', () => {
    for (const tutorial of TUTORIALS) {
      const transcript = play(tutorial, tutorial.steps.map((step) => step.line));
      transcript.forEach((result, index) => {
        assert.ok(
          !/command not found/.test(result.text),
          `${tutorial.command} step ${index + 1} ("${result.line}") is not a command this machine has`
        );
      });
    }
  });
});

/**
 * The failures are documentation too, and are wrong just as easily.
 *
 * "This will fail" is a claim about the error text, and the error text is often
 * the most useful thing on the page — it is what the player will actually see
 * when they make the mistake for real.
 */
describe('every documented mistake fails the way it says', () => {
  for (const tutorial of TUTORIALS) {
    if ((tutorial.mistakes || []).length === 0) continue;

    test(`${tutorial.command}: the easy mistakes produce the errors described`, () => {
      // Run each in a session that has already been through the steps, so the
      // world is in the state the tutorial has just described.
      const lines = [...tutorial.steps.map((step) => step.line), ...tutorial.mistakes.map((m) => m.line)];
      const transcript = play(tutorial, lines);

      tutorial.mistakes.forEach((mistake, index) => {
        const result = transcript[tutorial.steps.length + index];
        assert.ok(
          result.text.includes(mistake.look),
          `${tutorial.command} mistake "${mistake.line}": promised "${mistake.look}" but got:\n${result.text || '(nothing)'}`
        );
      });
    });
  }
});

/* ---------------- the terminal command ---------------- */

describe('the tutorial command', () => {
  const say = (line, ticket) => {
    const [result] = play({ command: 'tutorial', ticket }, [line]);
    return result.text;
  };

  test('it prints a walkthrough for a command that has one', () => {
    const text = say('tutorial ping');
    assert.match(text, /PING — a walkthrough/);
    assert.match(text, /Step 1 —/);
    assert.match(text, /Concepts:/);
    assert.match(text, /On the job/);
  });

  test('it prints every step, in order', () => {
    const text = say('tutorial samba-tool');
    for (let index = 0; index < TUTORIAL['samba-tool'].steps.length; index++) {
      assert.match(text, new RegExp(`Step ${index + 1} —`), `step ${index + 1} is missing`);
    }
  });

  test('with no argument it lists what is covered', () => {
    const text = say('tutorial');
    assert.match(text, /usage: tutorial <command>/);
    assert.match(text, /Walkthroughs: /);
    assert.match(text, /samba-tool/);
  });

  test('it says so when there is no walkthrough', () => {
    assert.match(say('tutorial nosuchthing'), /No walkthrough for nosuchthing/);
  });

  test('an alias reaches the tutorial of the command it aliases', () => {
    assert.match(say('tutorial logout'), /EXIT — a walkthrough/);
  });

  test('man points at the walkthrough', () => {
    assert.match(say('man ping'), /tutorial ping/);
  });

  test('every line it prints fits a terminal', () => {
    for (const name of COMMAND_NAMES) {
      for (const line of say(`tutorial ${name}`).split('\n')) {
        assert.ok(line.length <= 90, `tutorial ${name} printed a ${line.length}-character line: ${line}`);
      }
    }
  });

  test('it is honest about not being a real command', () => {
    const text = say('man tutorial');
    assert.match(text, /site tool|only exists/i);
    assert.match(text, /tldr|man page|EXAMPLES/i, 'it should name the real-world equivalents');
  });
});
