/**
 * Playing one mission.
 *
 * A mission run is a scratch layer over the canonical world. `setup` breaks
 * something (or breaks nothing, for the missions that only ask a question), the
 * player's actions pile up as events, and the whole run is either committed or
 * thrown away — so abandoning a mission cannot leave the company half-broken,
 * and mission #23 can still assume DNS is intact no matter what happened in #12.
 *
 * Two kinds of mission share one shape:
 *
 *   performed — the world changes, and `win` reads the world
 *   answered  — nothing changes, and `win` reads `ctx.answers`
 *
 * `win(world, ctx)` receives both, so an engine never has to declare which kind
 * it is, and a mission can be half of each.
 *
 * `runReferenceSolution` is the part that keeps the catalogue honest. It plays a
 * mission head-to-tail with no browser and no UI, and reports whether the
 * mission was unsolved before and solved after. The test suite asserts both.
 */

import { createScratch, withEvent } from '../world/reduce.js';
import { createSession } from '../shell/session.js';
import { runLine } from '../shell/run.js';
import { REGISTRY } from '../shell/registry.js';

function freezeCtx(ctx, answers) {
  return Object.freeze({ ...ctx, answers: Object.freeze({ ...answers }) });
}

function applyAll(base, events) {
  return events.reduce((scratch, event) => withEvent(scratch, event), createScratch(base));
}

/**
 * Hand the player a mission: apply its setup to a scratch over `baseWorld`.
 *
 * `setup(ctx)` returns the events that create the fault. It is optional — a
 * mission that only asks a question starts on the world exactly as it is.
 */
export function beginMission(mission, baseWorld, ctx = {}) {
  const setupEvents = typeof mission.setup === 'function' ? mission.setup(ctx) || [] : [];
  if (!Array.isArray(setupEvents)) {
    throw new TypeError(`${mission.id}: setup must return an array of events`);
  }

  return Object.freeze({
    mission,
    base: baseWorld,
    setupEvents: Object.freeze([...setupEvents]),
    seedCtx: ctx,
    scratch: applyAll(baseWorld, setupEvents),
    ctx: freezeCtx(ctx, {}),
    // A terminal mission needs somewhere to be logged in. The workstation comes
    // from the caller rather than being named here, because which machine the
    // night desk sits at is content, and this is not.
    shell: ctx.workstation
      ? Object.freeze({ session: createSession(ctx.workstation), output: Object.freeze([]) })
      : null
  });
}

/**
 * Type a line at the terminal.
 *
 * Everything the command produced is folded back into the mission: events into
 * the scratch, answers onto the answer sheet, output onto the transcript. So the
 * only way a mission gets solved is the way a player would solve it, and a
 * mission whose fix cannot be expressed with the tools that exist fails the
 * moment someone tries to write its reference solution.
 */
export function runInMission(session, line, registry = REGISTRY) {
  if (!session.shell) {
    throw new Error(`${session.mission.id}: this mission has no terminal — pass ctx.workstation to beginMission`);
  }

  const result = runLine(line, {
    registry,
    world: missionWorld(session),
    session: session.shell.session,
    prompt: undefined,
    ctx: { mission: session.mission, answers: session.ctx.answers }
  });

  let scratch = session.scratch;
  for (const event of result.events) scratch = withEvent(scratch, event);

  const answers = result.answers ? { ...session.ctx.answers, ...result.answers } : session.ctx.answers;

  return Object.freeze({
    ...session,
    scratch,
    ctx: freezeCtx(session.ctx, answers),
    shell: Object.freeze({
      session: result.session,
      output: Object.freeze(result.clear ? [] : [...session.shell.output, ...result.output])
    })
  });
}

/** The world as the player currently sees it. */
export function missionWorld(session) {
  return session.scratch.world;
}

/** Apply one event. Returns a new session; a rejected event leaves the old one intact. */
export function emitToMission(session, event) {
  return Object.freeze({ ...session, scratch: withEvent(session.scratch, event) });
}

/** Record an answer. Returns a new session. */
export function answerInMission(session, key, value) {
  return Object.freeze({
    ...session,
    ctx: freezeCtx(session.ctx, { ...session.ctx.answers, [key]: value })
  });
}

/**
 * Is it done?
 *
 * A `win` predicate that throws counts as unsolved. It is content, and on the
 * target machine there are no devtools — a bad predicate should keep the ticket
 * open, not take the whole game down with it.
 */
export function isMissionSolved(session) {
  try {
    return session.mission.win(missionWorld(session), session.ctx) === true;
  } catch {
    return false;
  }
}

/** Back to the state the player was handed: the fault intact, their work undone. */
export function resetMission(session) {
  return Object.freeze({
    ...session,
    scratch: applyAll(session.base, session.setupEvents),
    ctx: freezeCtx(session.seedCtx, {}),
    shell: session.shell
      ? Object.freeze({ session: createSession(session.seedCtx.workstation), output: Object.freeze([]) })
      : null
  });
}

/**
 * Accept the run.
 * @returns {{missionId: string, xp: number, teaches: string[], world: object, events: Array}}
 */
export function finishMission(session) {
  if (!isMissionSolved(session)) {
    throw new Error(`${session.mission.id}: not solved — finishMission is only for a mission that has been won`);
  }
  return {
    missionId: session.mission.id,
    xp: session.mission.xp,
    teaches: [...session.mission.teaches],
    world: missionWorld(session),
    events: [...session.scratch.events]
  };
}

/**
 * Play a mission using its own reference solution, headlessly.
 *
 * `solvedBefore` must be false and `solvedAfter` true. The first catches a
 * mission that is already won the moment it opens; the second catches one that
 * cannot be won at all — including the common case where the world moved
 * underneath a mission written months earlier.
 *
 * A solution that throws is allowed to propagate: that is an authoring bug and
 * should read as a test failure with its own stack, not as "unsolved".
 */
export async function runReferenceSolution(mission, baseWorld, ctx = {}) {
  let session = beginMission(mission, baseWorld, ctx);
  const solvedBefore = isMissionSolved(session);

  const api = {
    get world() {
      return missionWorld(session);
    },
    get ctx() {
      return session.ctx;
    },
    emit(event) {
      session = emitToMission(session, event);
      return api;
    },
    answer(key, value) {
      session = answerInMission(session, key, value);
      return api;
    },
    /**
     * Type a line at the terminal, exactly as the player would.
     *
     * This is the strongest form the reference solution can take: it proves the
     * ticket is solvable with the commands that actually exist, in the syntax
     * they actually take. A solution that emits events directly proves only that
     * the win predicate can be satisfied — which is a much weaker claim, and one
     * that stays true long after the tool needed to satisfy it has been renamed.
     */
    run(line) {
      session = runInMission(session, line);
      return api;
    },
    get transcript() {
      return session.shell ? session.shell.output.map((entry) => entry.text) : [];
    },
    solved() {
      return isMissionSolved(session);
    }
  };

  await mission.solution(api);

  return {
    solvedBefore,
    solvedAfter: isMissionSolved(session),
    session,
    world: missionWorld(session),
    events: [...session.scratch.events]
  };
}
