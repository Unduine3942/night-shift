/**
 * Missions against the engines that have to render them.
 *
 * A mission's `props` are engine-specific, so the schema cannot check them — it
 * does not know what a quiz needs that a subnet drill does not. Each engine
 * validates its own, and this is where that validation is actually run.
 *
 * The second half matters as much: a mission whose engine does not exist yet must
 * be excluded from the queue rather than offered. The registry is what decides
 * that, and if it ever said yes to an engine that is not built, a player would
 * open a ticket onto an empty screen.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { MISSIONS } from '../../src/content/missions/index.js';
import { ENGINES } from '../../src/core/missions/schema.js';
import {
  ENGINE_REGISTRY,
  IMPLEMENTED_ENGINES,
  getEngine,
  isPlayable,
  partitionByEngine
} from '../../src/engines/registry.js';
import { createSeed } from '../../src/core/world/seed.js';
import { simulateProgression } from '../../src/core/missions/progression.js';
import { createProgress, recordCompletion, tierOf } from '../../src/core/game/progress.js';

const { playable, pending } = partitionByEngine(MISSIONS);

describe('the registry', () => {
  test('every registered engine is one the schema knows about', () => {
    for (const id of IMPLEMENTED_ENGINES) {
      assert.ok(ENGINES.includes(id), `"${id}" is registered but is not a valid engine name`);
    }
  });

  test('every registered engine can validate and render', () => {
    for (const id of IMPLEMENTED_ENGINES) {
      const engine = getEngine(id);
      assert.equal(typeof engine.validateProps, 'function', `${id}: no validateProps`);
      assert.equal(typeof engine.render, 'function', `${id}: no render`);
      assert.equal(engine.id, id);
    }
  });

  test('an engine that does not exist is not playable', () => {
    assert.equal(getEngine('telepathy'), null);
    assert.equal(isPlayable({ engine: 'telepathy' }), false);
  });

  test('the split accounts for every mission', () => {
    assert.equal(playable.length + pending.length, MISSIONS.length);
  });

  test('something is playable', () => {
    assert.ok(playable.length > 0, 'no mission in the catalogue can be played by this build');
  });
});

/**
 * The trap this catches is invisible by reading.
 *
 * A mission the build CAN render, whose prerequisites are only taught by a
 * mission the build CANNOT render, never becomes available. The catalogue
 * validates, the reachability walk passes — because that walk uses the whole
 * catalogue — and the player simply never sees the ticket, with nothing anywhere
 * saying why.
 *
 * So the playable subset has to be walkable on its own.
 */
describe('the playable subset stands on its own', () => {
  const taughtByPlayable = new Set(playable.flatMap((mission) => mission.teaches));

  test('no playable mission needs something only an unplayable one teaches', () => {
    for (const mission of playable) {
      for (const concept of mission.requires) {
        assert.ok(
          taughtByPlayable.has(concept),
          `${mission.id} requires "${concept}", which only a mission this build cannot run teaches — ` +
            'it would never appear in the queue'
        );
      }
    }
  });

  test('the playable missions are reachable from a standing start', () => {
    const walk = simulateProgression(playable);
    assert.deepEqual(
      walk.unreachable,
      [],
      'some playable missions can never be reached using only the playable ones'
    );
  });

  test('there is enough to play at the first rank', () => {
    const tierOne = playable.filter((mission) => mission.tier === 1);
    assert.ok(tierOne.length >= 2, `only ${tierOne.length} playable tickets at tier 1`);
  });

  test('promotion out of tier one is achievable with playable work alone', () => {
    let progress = createProgress();
    for (const mission of playable.filter((entry) => entry.tier === 1)) {
      progress = recordCompletion(progress, { missionId: mission.id, xp: mission.xp, events: [] });
    }
    assert.ok(
      tierOf(progress, playable) > 1,
      'clearing every playable tier-1 ticket does not earn a promotion, so the queue dead-ends'
    );
  });
});

describe('props', () => {
  for (const mission of playable) {
    test(`${mission.id} satisfies the ${mission.engine} engine`, () => {
      assert.doesNotThrow(() => ENGINE_REGISTRY[mission.engine].validateProps(mission));
    });
  }

  test('every engine says whether it needs props at all', () => {
    for (const id of IMPLEMENTED_ENGINES) {
      assert.equal(
        typeof getEngine(id).requiresProps,
        'boolean',
        `${id}: must declare requiresProps, so the check below knows what to expect`
      );
    }
  });

  test('an engine that needs props rejects a mission without them', () => {
    for (const mission of playable) {
      const engine = ENGINE_REGISTRY[mission.engine];
      if (!engine.requiresProps) continue;
      assert.throws(
        () => engine.validateProps({ ...mission, props: undefined }),
        `${mission.engine} accepted a mission with no props`
      );
    }
  });

  test('an engine that does not need props accepts a mission without them', () => {
    for (const id of IMPLEMENTED_ENGINES) {
      const engine = getEngine(id);
      if (engine.requiresProps) continue;
      assert.doesNotThrow(() => engine.validateProps({ id: 'x', props: undefined }));
    }
  });
});

describe('option lists are read from the world', () => {
  // The whole premise is that the game is one company seen through many lenses.
  // A quiz whose options are typed out by hand is a lens that can lie.
  const world = createSeed();

  for (const mission of playable.filter((entry) => entry.engine === 'quiz')) {
    test(`${mission.id} offers real choices, including the right one`, () => {
      for (const question of mission.props.questions) {
        const options = typeof question.options === 'function' ? question.options(world) : question.options;

        assert.ok(options.length >= 2, `${mission.id}/${question.key}: fewer than two options`);
        assert.equal(
          new Set(options.map((option) => option.value)).size,
          options.length,
          `${mission.id}/${question.key}: duplicate option values`
        );
        for (const option of options) {
          assert.ok(option.value !== undefined, `${mission.id}/${question.key}: an option with no value`);
          assert.ok(option.label, `${mission.id}/${question.key}: an option with no label`);
        }
      }
    });
  }

  for (const mission of playable.filter((entry) => entry.engine === 'subnet')) {
    test(`${mission.id} reads its block from the world`, () => {
      const block = mission.props.blockOf(world);
      assert.ok(block, `${mission.id}: blockOf returned nothing`);
      assert.match(block.cidr, /^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/, `${mission.id}: blockOf gave no usable CIDR`);
    });
  }
});
