/**
 * What time it is on the night desk.
 *
 * Flavour, but load-bearing flavour: a clock that never moves makes the desktop
 * feel like a form, and a clock that reads the real time would put `Date.now()`
 * into a build whose whole determinism story rests on not having it. So the
 * clock is a pure function of work done — the shift advances because you closed
 * a ticket, which is also the only honest thing it could mean here.
 */

/** The desk is yours from ten at night. */
export const SHIFT_START_MINUTES = 22 * 60;

/** How long the shift runs before the morning crew take over. */
export const SHIFT_LENGTH_MINUTES = 8 * 60;

/** Roughly how long a ticket takes, once you count the walk to the comms room. */
export const MINUTES_PER_TICKET = 25;

const DAY = 24 * 60;

function pad(value) {
  return String(value).padStart(2, '0');
}

/**
 * @param {number} closedTickets
 * @returns {{minutes: number, label: string, elapsed: number, remaining: number, overrun: boolean}}
 */
export function shiftClock(closedTickets) {
  const done = Number.isFinite(closedTickets) && closedTickets > 0 ? Math.floor(closedTickets) : 0;
  const elapsed = done * MINUTES_PER_TICKET;
  const minutes = (SHIFT_START_MINUTES + elapsed) % DAY;

  return {
    minutes,
    label: `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`,
    elapsed,
    remaining: Math.max(0, SHIFT_LENGTH_MINUTES - elapsed),
    overrun: elapsed >= SHIFT_LENGTH_MINUTES
  };
}

/** A word for the part of the night, for the greeting line. */
export function shiftPhase(closedTickets) {
  const { minutes, overrun } = shiftClock(closedTickets);
  if (overrun) return 'Handover';
  if (minutes >= 22 * 60 || minutes < 1 * 60) return 'Early';
  if (minutes < 4 * 60) return 'Deep night';
  return 'Small hours';
}
