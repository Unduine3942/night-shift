/**
 * Which window each kind of work appears in.
 *
 * The split — tickets in Mail, drills in Training — is the thing the desktop is
 * for, and it is the thing that will quietly rot. A new engine added without a
 * surface routes its missions nowhere; a drill engine given the mail surface puts
 * a subnetting exercise in an inbox as a message from a person, which is the
 * exact mixing the split was made to stop.
 *
 * Both are one-line mistakes and neither shows up as a crash, so they are checked
 * here rather than discovered by opening the game and feeling that something is
 * off.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  ENGINE_REGISTRY,
  IMPLEMENTED_ENGINES,
  SURFACES,
  surfaceOf,
  partitionByEngine,
  partitionBySurface
} from '../../src/engines/registry.js';
import { APPS, APP, OPENING_LAYOUT, appById } from '../../src/ui/apps/index.js';
import { MISSIONS } from '../../src/content/missions/index.js';

const { playable: PLAYABLE } = partitionByEngine(MISSIONS);

describe('every engine says where its work appears', () => {
  test('each one declares a surface from the known set', () => {
    for (const id of IMPLEMENTED_ENGINES) {
      const engine = ENGINE_REGISTRY[id];
      assert.ok(
        SURFACES.includes(engine.surface),
        `${id}: surface is ${JSON.stringify(engine.surface)}, not one of ${SURFACES.join(', ')}`
      );
    }
  });

  test('every surface names an app that exists', () => {
    for (const surface of SURFACES) {
      assert.ok(appById(surface), `surface "${surface}" has no app to render it`);
    }
  });

  test('every playable mission routes somewhere', () => {
    for (const mission of PLAYABLE) {
      assert.ok(surfaceOf(mission), `${mission.id}: engine "${mission.engine}" routes to no window`);
    }
  });

  test('an engine this build does not have routes nowhere rather than guessing', () => {
    assert.equal(surfaceOf({ engine: 'topology' }), null);
    assert.equal(surfaceOf({ engine: 'nonsense' }), null);
  });

  test('the two halves partition the playable catalogue exactly once each', () => {
    const split = partitionBySurface(PLAYABLE);
    const total = SURFACES.reduce((sum, surface) => sum + split[surface].length, 0);
    assert.equal(total, PLAYABLE.length, 'a mission was dropped or counted twice');

    const seen = new Set();
    for (const surface of SURFACES) {
      for (const mission of split[surface]) {
        assert.ok(!seen.has(mission.id), `${mission.id} appears in more than one window`);
        seen.add(mission.id);
      }
    }
  });
});

/**
 * The fiction has to hold. A ticket is something a person raised; a drill is
 * practice the player chose. The engine decides which, so the engine has to agree
 * with what the mission actually is.
 */
describe('the inbox holds tickets and Training holds drills', () => {
  test('only terminal work arrives as mail', () => {
    for (const mission of partitionBySurface(PLAYABLE).mail) {
      assert.equal(
        mission.engine,
        'terminal',
        `${mission.id} is in the inbox but worked with the ${mission.engine} tool — an inbox message has to be work somebody raised`
      );
    }
  });

  test('no drill-kind mission is presented as a message from a person', () => {
    for (const mission of partitionBySurface(PLAYABLE).mail) {
      assert.notEqual(mission.kind, 'drill', `${mission.id} is a drill and belongs in Training`);
    }
  });

  test('a mail ticket names who raised it', () => {
    for (const mission of partitionBySurface(PLAYABLE).mail) {
      assert.ok(
        typeof mission.reporter === 'string' && mission.reporter.length > 0,
        `${mission.id} is an inbox message with no name on it`
      );
    }
  });

  test('both windows have something to do at the opening rank', () => {
    const startingTier = PLAYABLE.filter((mission) => mission.tier === 1);
    const split = partitionBySurface(startingTier);

    for (const surface of SURFACES) {
      assert.ok(
        split[surface].length > 0,
        `nothing at tier 1 opens in ${surface} — a new player would find that window empty`
      );
    }
  });
});

describe('the app catalogue', () => {
  test('every app has the pieces the desktop draws', () => {
    for (const app of APPS) {
      assert.ok(app.id, 'an app with no id');
      assert.ok(app.title, `${app.id}: no title`);
      assert.equal(typeof app.body, 'function', `${app.id}: no body`);
      assert.ok(app.defaultSize && app.defaultSize.w > 0 && app.defaultSize.h > 0, `${app.id}: no default size`);
    }
  });

  test('ids are unique and the lookup agrees with the list', () => {
    const ids = APPS.map((app) => app.id);
    assert.equal(new Set(ids).size, ids.length, 'two apps share an id');
    for (const app of APPS) assert.equal(APP[app.id], app);
  });

  test('an unknown app id resolves to nothing rather than throwing', () => {
    assert.equal(appById('nope'), null);
    assert.equal(appById(undefined), null);
  });

  test('the opening layout names apps that exist', () => {
    for (const column of OPENING_LAYOUT) {
      assert.ok(appById(column.appId), `the opening layout wants "${column.appId}", which is not an app`);
    }
  });

  test('a default size fits the smallest screen the plan commits to', () => {
    for (const app of APPS) {
      assert.ok(app.defaultSize.w <= 1280, `${app.id} opens wider than 1280`);
      assert.ok(app.defaultSize.h <= 616, `${app.id} opens taller than the desk area at 720`);
    }
  });
});
