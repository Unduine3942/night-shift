/**
 * The practice shell.
 *
 * A Terminal window that says "open a ticket first" is a dead window, and a dead
 * window is the exact feeling this desktop exists to avoid. So with no ticket
 * open the terminal still works: same commands, same company, same output, on a
 * scratch layer that is thrown away the moment a real ticket starts.
 *
 * It is a mission object rather than a special case, so it goes through
 * `beginMission` and `runInMission` like everything else and there is only one
 * code path that can run a command. It is deliberately NOT in the catalogue:
 * nothing here is worth XP, `win` is never true, and progression must never see
 * it.
 */

export const PRACTICE = Object.freeze({
  id: 'practice',
  title: 'Practice shell',
  domain: 'it',
  kind: 'investigate',
  engine: 'terminal',
  tier: 1,
  difficulty: 1,
  complexity: 1,
  xp: 1,

  reporter: null,
  brief:
    'Nothing is on fire. Have a look round the network — everything you type here runs against the real Meridian ' +
    'kit, and everything you change is thrown away as soon as you open a ticket.',
  debrief: 'Practice is never closed.',

  teaches: [],
  requires: [],
  hints: [],

  // Never solvable, by design. The practice shell has nothing to submit to.
  win: () => false,
  solution: () => {
    throw new Error('the practice shell is not a mission and has no solution');
  }
});
