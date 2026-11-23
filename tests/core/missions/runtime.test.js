import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { deepFreeze, getIn } from '../../../src/core/immutable.js';
import { createEvent } from '../../../src/core/world/events.js';
import {
  beginMission,
  missionWorld,
  emitToMission,
  answerInMission,
  isMissionSolved,
  resetMission,
  finishMission,
  runReferenceSolution
} from '../../../src/core/missions/runtime.js';

const base = () =>
  deepFreeze({
    tick: 0,
    net: {
      devices: {
        'srv-dc01': {
          id: 'srv-dc01', kind: 'server', siteId: 'site-hq', powered: true,
          interfaces: { eth0: { name: 'eth0', ip: '10.20.10.10', prefix: 24, up: true } }
        }
      },
      dns: { records: [{ name: 'dc01.meridian.local', type: 'A', value: '10.20.10.10', ttl: 3600 }] }
    },
    identity: { users: { 'u-dana': { id: 'u-dana', enabled: true, groups: ['staff'] } } }
  });

/** Break DNS on setup; solved once the record is back. */
const repairMission = (over = {}) => ({
  id: 'net-999',
  title: 'DNS is broken',
  domain: 'networking',
  tier: 1,
  difficulty: 1,
  complexity: 1,
  engine: 'terminal',
  kind: 'repair',
  teaches: [],
  requires: [],
  brief: 'Fix it.',
  debrief: 'DNS answers again.',
  xp: 10,
  setup: () => [createEvent('net/dns-record-remove', { name: 'dc01.meridian.local', type: 'A' })],
  win: (world) =>
    getIn(world, ['net', 'dns', 'records'], []).some(
      (record) => record.name === 'dc01.meridian.local' && record.value === '10.20.10.10'
    ),
  solution: async (api) => {
    api.emit(
      createEvent('net/dns-record-set', {
        name: 'dc01.meridian.local',
        type: 'A',
        value: '10.20.10.10'
      })
    );
  },
  ...over
});

/** Nothing is broken; the player just has to answer correctly. */
const answerMission = (over = {}) => ({
  ...repairMission(),
  id: 'it-999',
  engine: 'quiz',
  setup: undefined,
  win: (world, ctx) => ctx.answers.host === 'srv-dc01',
  solution: async (api) => {
    api.answer('host', 'srv-dc01');
  },
  ...over
});

describe('beginMission', () => {
  test('applies the setup events, so the fault exists before the player arrives', () => {
    const session = beginMission(repairMission(), base());
    assert.equal(getIn(missionWorld(session), ['net', 'dns', 'records']).length, 0);
  });

  test('leaves the base world alone', () => {
    const world = base();
    beginMission(repairMission(), world);
    assert.equal(getIn(world, ['net', 'dns', 'records']).length, 1);
  });

  test('a mission with no setup starts on the world as it is', () => {
    const session = beginMission(answerMission(), base());
    assert.equal(missionWorld(session), session.base);
  });

  test('setup events land in the scratch, so abandoning undoes them', () => {
    const session = beginMission(repairMission(), base());
    assert.equal(session.scratch.events.length, 1);
  });

  test('starts with an empty answer sheet', () => {
    assert.deepEqual(beginMission(answerMission(), base()).ctx.answers, {});
  });

  test('carries extra context through', () => {
    const session = beginMission(answerMission(), base(), { seed: 7 });
    assert.equal(session.ctx.seed, 7);
  });
});

describe('working a mission', () => {
  test('emitToMission returns a new session and leaves the old one alone', () => {
    const started = beginMission(repairMission(), base());
    const next = emitToMission(
      started,
      createEvent('net/dns-record-set', { name: 'dc01.meridian.local', type: 'A', value: '10.20.10.10' })
    );
    assert.notEqual(next, started);
    assert.equal(started.scratch.events.length, 1);
    assert.equal(next.scratch.events.length, 2);
  });

  test('answerInMission records immutably', () => {
    const started = beginMission(answerMission(), base());
    const answered = answerInMission(started, 'host', 'srv-dc01');
    assert.deepEqual(started.ctx.answers, {});
    assert.deepEqual(answered.ctx.answers, { host: 'srv-dc01' });
  });

  test('isMissionSolved reads the world and the answers', () => {
    const started = beginMission(repairMission(), base());
    assert.equal(isMissionSolved(started), false);

    const fixed = emitToMission(
      started,
      createEvent('net/dns-record-set', { name: 'dc01.meridian.local', type: 'A', value: '10.20.10.10' })
    );
    assert.equal(isMissionSolved(fixed), true);
  });

  test('a win predicate that throws counts as unsolved rather than crashing the game', () => {
    const session = beginMission(repairMission({ win: () => { throw new Error('bad predicate'); } }), base());
    assert.equal(isMissionSolved(session), false);
  });

  test('resetMission goes back to the state the player was handed', () => {
    const started = beginMission(repairMission(), base());
    const meddled = emitToMission(started, createEvent('net/device-power', { deviceId: 'srv-dc01', on: false }));
    const reset = resetMission(meddled);

    assert.equal(getIn(missionWorld(reset), ['net', 'devices', 'srv-dc01', 'powered']), true);
    assert.equal(reset.scratch.events.length, 1, 'the setup should survive a reset');
    assert.deepEqual(reset.ctx.answers, {});
  });
});

describe('finishMission', () => {
  test('hands back the world, the events, and what was earned', () => {
    const started = beginMission(repairMission({ xp: 45, teaches: ['dns-a-record'] }), base());
    const fixed = emitToMission(
      started,
      createEvent('net/dns-record-set', { name: 'dc01.meridian.local', type: 'A', value: '10.20.10.10' })
    );
    const result = finishMission(fixed);

    assert.equal(result.missionId, 'net-999');
    assert.equal(result.xp, 45);
    assert.deepEqual(result.teaches, ['dns-a-record']);
    assert.equal(result.events.length, 2);
    assert.equal(getIn(result.world, ['net', 'dns', 'records']).length, 1);
  });

  test('refuses to finish a mission that is not solved', () => {
    assert.throws(() => finishMission(beginMission(repairMission(), base())), /not solved/i);
  });
});

describe('runReferenceSolution — the check that keeps the catalogue honest', () => {
  test('reports both halves: unsolved before, solved after', async () => {
    const result = await runReferenceSolution(repairMission(), base());
    assert.equal(result.solvedBefore, false);
    assert.equal(result.solvedAfter, true);
  });

  test('works for a mission answered rather than performed', async () => {
    const result = await runReferenceSolution(answerMission(), base());
    assert.equal(result.solvedBefore, false);
    assert.equal(result.solvedAfter, true);
  });

  test('catches a solution that does not actually solve it', async () => {
    const result = await runReferenceSolution(repairMission({ solution: async () => {} }), base());
    assert.equal(result.solvedAfter, false);
  });

  test('catches a mission that was already solved before anyone touched it', async () => {
    const result = await runReferenceSolution(repairMission({ setup: undefined }), base());
    assert.equal(result.solvedBefore, true, 'a mission solved at the start is broken content');
  });

  test('reports the events the solution produced', async () => {
    const result = await runReferenceSolution(repairMission(), base());
    assert.equal(result.events.length, 2);
    assert.equal(result.events[1].type, 'net/dns-record-set');
  });

  test('a solution that throws is reported, not swallowed', async () => {
    await assert.rejects(
      () => runReferenceSolution(repairMission({ solution: async () => { throw new Error('typo in the fix'); } }), base()),
      /typo in the fix/
    );
  });
});
