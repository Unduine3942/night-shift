/**
 * Where you are logged in.
 *
 * The night desk works from one workstation and reaches everything else over the
 * network, so `ssh` does not open a new terminal — it pushes a host onto a stack,
 * and `exit` pops it. The prompt is the only thing telling you which machine you
 * are about to run a command on, which is exactly the habit worth building: the
 * most expensive mistakes in operations are commands run on the right box at the
 * wrong time, or the wrong box at the right time.
 *
 * Immutable like everything else in core. Every function returns a new session.
 */

export const OPERATOR = 'operator';
export const HOME = '/home/operator';

/** How many commands to keep. Enough to scroll back through a shift. */
export const HISTORY_LIMIT = 200;

/** @param workstationId the device the player is sitting at */
export function createSession(workstationId) {
  return Object.freeze({
    user: OPERATOR,
    stack: Object.freeze([workstationId]),
    cwd: HOME,
    history: Object.freeze([]),
    lastExit: 0
  });
}

/** The machine commands currently run on. */
export function currentHost(session) {
  return session.stack[session.stack.length - 1];
}

/** The machine the player is physically at, whatever they have connected to. */
export function homeHost(session) {
  return session.stack[0];
}

export function isRemote(session) {
  return session.stack.length > 1;
}

export function pushHost(session, hostId) {
  return Object.freeze({ ...session, stack: Object.freeze([...session.stack, hostId]), cwd: HOME });
}

/** Disconnect. Returns the session unchanged when already at the workstation. */
export function popHost(session) {
  if (session.stack.length <= 1) return session;
  return Object.freeze({
    ...session,
    stack: Object.freeze(session.stack.slice(0, -1)),
    cwd: HOME
  });
}

/** Record a typed line. Blank lines and exact repeats are not worth keeping. */
export function withHistory(session, line) {
  const trimmed = line.trim();
  if (trimmed === '') return session;
  if (session.history[session.history.length - 1] === trimmed) return session;

  const history = [...session.history, trimmed];
  return Object.freeze({
    ...session,
    history: Object.freeze(history.length > HISTORY_LIMIT ? history.slice(-HISTORY_LIMIT) : history)
  });
}

export function withExit(session, code) {
  return session.lastExit === code ? session : Object.freeze({ ...session, lastExit: code });
}

/** `operator@pc-it01:~$` — the hostname is the device id, as it would be. */
export function promptOf(session) {
  const path = session.cwd === HOME ? '~' : session.cwd;
  return `${session.user}@${currentHost(session)}:${path}$`;
}
