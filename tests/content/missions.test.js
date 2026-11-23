/**
 * The catalogue harness.
 *
 * Everything here runs against the REAL seed world, not a fixture. That is the
 * whole value: a mission written today encodes assumptions about Meridian's
 * addressing, its DNS zone and its directory, and the ordinary way content rots
 * is that the world moves and nobody notices the mission became unsolvable.
 *
 * Each mission is played head-to-tail by its own reference solution, and both
 * halves are asserted:
 *
 *   win(before) === false   catches a mission that is already solved on arrival
 *   win(after)  === true    catches one that cannot be solved at all
 *
 * A mission that cannot pass both does not ship. There is no way to opt out —
 * `solution` is required by the schema precisely so this file can be exhaustive.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { MISSIONS, missionById } from '../../src/content/missions/index.js';
import { validateCatalog, validateMission, DOMAINS } from '../../src/core/missions/schema.js';
import { simulateProgression, orderMissions } from '../../src/core/missions/progression.js';
import { runReferenceSolution, beginMission, missionWorld } from '../../src/core/missions/runtime.js';
import { createSeed } from '../../src/core/world/seed.js';
import { CONCEPTS } from '../../src/content/concepts.js';

/** Where the night desk sits. Terminal missions need somewhere to be logged in. */
const WORKSTATION = { workstation: 'pc-it01' };
import { SITE, NET, HOST, USER, GROUP } from '../../src/content/world/contract.js';

const MISSION_DIR = 'src/content/missions';

const missionFiles = () =>
  readdirSync(MISSION_DIR).filter((file) => file.endsWith('.js') && file !== 'index.js');

describe('the catalogue is well-formed', () => {
  test('it is not empty', () => {
    assert.ok(MISSIONS.length > 0, 'no missions are registered in src/content/missions/index.js');
  });

  test('every mission passes the schema', () => {
    for (const mission of MISSIONS) {
      assert.doesNotThrow(() => validateMission(mission), `${mission && mission.id}`);
    }
  });

  test('the catalogue as a whole is valid and fully reachable', () => {
    const report = validateCatalog(MISSIONS);
    assert.equal(
      report.ok,
      true,
      report.problems.map((problem) => `${problem.missionId}: ${problem.problem}`).join('\n')
    );
  });

  test('ids are unique', () => {
    const ids = MISSIONS.map((mission) => mission.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test('missionById finds every registered mission, and nothing else', () => {
    for (const mission of MISSIONS) assert.equal(missionById(mission.id), mission);
    assert.equal(missionById('net-nope'), null);
  });

  test('every file in the mission directory is registered', () => {
    const files = missionFiles();
    assert.equal(
      files.length,
      MISSIONS.length,
      `${files.length} mission files but ${MISSIONS.length} registered — someone added a file and forgot index.js`
    );
  });
});

describe('every reference solution actually solves its mission', () => {
  for (const mission of orderMissions(MISSIONS)) {
    test(`${mission.id} — ${mission.title}`, async () => {
      const result = await runReferenceSolution(mission, createSeed(), { ...WORKSTATION });

      assert.equal(
        result.solvedBefore,
        false,
        `${mission.id} is already solved the moment it opens — its setup does not create the fault, or win is too loose`
      );
      assert.equal(
        result.solvedAfter,
        true,
        `${mission.id} cannot be solved by its own reference solution — the world has moved underneath it`
      );
    });
  }
});

describe('a terminal ticket is solved at the terminal', () => {
  // A solution that emits events directly proves only that the win predicate can
  // be satisfied. A solution that types commands proves the ticket is solvable
  // with the tools that exist, in the syntax they take — and fails loudly if a
  // tool is ever renamed or removed out from under it.
  for (const mission of MISSIONS.filter((entry) => entry.engine === 'terminal')) {
    test(`${mission.id} types its way to the answer`, () => {
      const source = mission.solution.toString();
      assert.match(source, /api\.run\(/, `${mission.id}: a terminal mission must solve itself by running commands`);
      assert.ok(
        !/api\.emit\(/.test(source),
        `${mission.id}: emits an event directly instead of using a command — if no command can do it, the command is missing`
      );
    });
  }

  test('a terminal mission that asks for findings declares the fields', () => {
    for (const mission of MISSIONS.filter((entry) => entry.engine === 'terminal')) {
      const source = mission.solution.toString();
      if (!/submit /.test(source)) continue;
      assert.ok(
        mission.props && Array.isArray(mission.props.fields) && mission.props.fields.length > 0,
        `${mission.id}: its solution submits an answer, so it must declare props.fields for the player to see`
      );
    }
  });
});

describe('setup is honest', () => {
  test('a mission with setup changes the world; a mission without one does not', () => {
    const seed = createSeed();
    for (const mission of MISSIONS) {
      const session = beginMission(mission, seed, { ...WORKSTATION });
      const changed = missionWorld(session) !== seed;
      assert.equal(
        changed,
        typeof mission.setup === 'function',
        `${mission.id}: setup and the world it produces disagree`
      );
    }
  });

  test('setup is deterministic — two runs produce the same events', () => {
    for (const mission of MISSIONS) {
      if (typeof mission.setup !== 'function') continue;
      assert.deepEqual(
        mission.setup({}),
        mission.setup({}),
        `${mission.id}: setup is not deterministic, so the same ticket would differ between sessions`
      );
    }
  });

  test('every setup event applies against the real seed without error', () => {
    for (const mission of MISSIONS) {
      assert.doesNotThrow(
        () => beginMission(mission, createSeed(), { ...WORKSTATION }),
        `${mission.id}: setup names something that does not exist in the world`
      );
    }
  });
});

describe('the content reads like a job, not a quiz', () => {
  test('every brief and debrief is substantial', () => {
    for (const mission of MISSIONS) {
      assert.ok(mission.brief.length >= 80, `${mission.id}: brief is too thin to set a scene`);
      assert.ok(mission.debrief.length >= 120, `${mission.id}: debrief is too thin to teach anything`);
    }
  });

  test('every mission offers hints', () => {
    for (const mission of MISSIONS) {
      assert.ok(
        Array.isArray(mission.hints) && mission.hints.length >= 2,
        `${mission.id}: needs at least two hints — there are no devtools on the target machine`
      );
    }
  });

  test('every mission teaches something', () => {
    for (const mission of MISSIONS) {
      assert.ok(mission.teaches.length > 0, `${mission.id}: teaches nothing, so it earns no place in the graph`);
    }
  });

  test('no two missions teach the same concept', () => {
    const owner = new Map();
    for (const mission of MISSIONS) {
      for (const concept of mission.teaches) {
        assert.equal(
          owner.has(concept),
          false,
          `${concept} is taught by both ${owner.get(concept)} and ${mission.id} — one of them should require it instead`
        );
        owner.set(concept, mission.id);
      }
    }
  });

  test('every concept a mission names is in the vocabulary', () => {
    for (const mission of MISSIONS) {
      for (const concept of [...mission.teaches, ...mission.requires]) {
        assert.ok(CONCEPTS[concept], `${mission.id}: ${concept} is not a known concept`);
      }
    }
  });
});

/**
 * The same rule the world contract is held to, extended to the content that acts
 * on it. An address typed into a mission is an address that will disagree with
 * the world the first time anything is renumbered.
 *
 * Template literals are stripped before scanning, because briefs legitimately
 * quote addresses — but they quote them by interpolating the symbol. A literal
 * outside a template is an author typing a number they should have imported.
 */
describe('missions reference the infrastructure by symbol', () => {
  /**
   * The forbidden ids are taken from the contract itself rather than guessed from
   * prefixes. A prefix rule cannot tell `site-hq` (a world id, which must be
   * imported) from `site-down` (a sort item belonging to one mission, which is
   * none of the contract's business), and the version that guessed flagged the
   * second one.
   */
  const WORLD_IDS = [
    ...Object.values(SITE).map((entry) => entry.id),
    ...Object.values(NET).map((entry) => entry.id),
    ...Object.values(HOST).map((entry) => entry.id),
    ...Object.values(USER).map((entry) => entry.id),
    ...Object.values(GROUP).map((entry) => entry.id)
  ];

  const stripAnswerKey = (source) =>
    source.replace(/const ANSWER_KEY = \{[\s\S]*?\n\};/g, 'const ANSWER_KEY = {};');
  const stripTemplates = (source) => source.replace(/`[\s\S]*?`/g, '``');
  const stripComments = (source) =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  const scannable = (file) =>
    stripTemplates(stripAnswerKey(stripComments(readFileSync(join(MISSION_DIR, file), 'utf8'))));

  for (const file of missionFiles()) {
    test(`${file} hard-codes no addresses`, () => {
      const found = scannable(file).match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g) || [];
      assert.deepEqual(
        found,
        [],
        `${file} hard-codes ${found.join(', ')} — import the symbol from world/contract.js instead`
      );
    });

    test(`${file} hard-codes no world ids`, () => {
      const source = scannable(file);
      const found = WORLD_IDS.filter((id) => source.includes(`'${id}'`) || source.includes(`"${id}"`));
      assert.deepEqual(
        found,
        [],
        `${file} hard-codes ${found.join(', ')} — import the symbol from world/contract.js instead`
      );
    });
  }
});

describe('the shape of the catalogue', () => {
  test('a player starting from nothing reaches every mission', () => {
    const walk = simulateProgression(MISSIONS);
    assert.deepEqual(walk.unreachable, []);
    assert.equal(walk.order.length, MISSIONS.length);
  });

  test('the first mission requires nothing and sits at tier 1', () => {
    const first = missionById(simulateProgression(MISSIONS).order[0]);
    assert.deepEqual(first.requires, []);
    assert.equal(first.tier, 1);
  });

  test('tier 1 has something in it', () => {
    const tierOne = MISSIONS.filter((mission) => mission.tier === 1);
    assert.ok(tierOne.length > 0, 'nothing at tier 1 means a new player has nothing to do');
  });

  test('nothing in tier 1 is punishing', () => {
    for (const mission of MISSIONS.filter((m) => m.tier === 1)) {
      assert.ok(
        mission.difficulty + mission.complexity <= 6,
        `${mission.id}: too punishing for a first shift`
      );
    }
  });

  test('the catalogue spans more than one domain', () => {
    const used = new Set(MISSIONS.map((mission) => mission.domain));
    for (const domain of used) assert.ok(DOMAINS.includes(domain));
    assert.ok(used.size >= 2, 'a catalogue in one domain is not the game that was designed');
  });
});
