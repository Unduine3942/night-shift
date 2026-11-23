/**
 * World time.
 *
 * The game never reads the wall clock. Every timestamp the player sees — a log
 * line, a ticket SLA, a DHCP lease, a shift start — is derived from a single
 * integer `tick`, which is whole seconds since the world epoch.
 *
 * That matters for more than tidiness: if log timestamps came from Date.now(),
 * a mission authored today would not line up with the same mission replayed
 * tomorrow, and nothing in the log lens could be tested.
 *
 * Every function here is pure. All calendar maths is UTC, so the world reads the
 * same in Tokyo and in London.
 */

/** Monday, so "first shift of the week" narratives land correctly. */
export const EPOCH_ISO = '2026-03-02T00:00:00.000Z';
const EPOCH_MS = Date.parse(EPOCH_ISO);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const SECOND = 1;
const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;

export { SECOND, MINUTE, HOUR, DAY };

function assertTick(tick) {
  if (!Number.isFinite(tick)) {
    throw new TypeError(`clock: tick must be a finite number, got ${tick}`);
  }
}

function assertAmount(amount) {
  if (!Number.isFinite(amount)) {
    throw new TypeError(`clock: amount must be a finite number, got ${amount}`);
  }
}

function pad(value, width = 2) {
  return String(value).padStart(width, '0');
}

/** Tick -> Date. */
export function toDate(tick) {
  assertTick(tick);
  return new Date(EPOCH_MS + tick * 1000);
}

/** ISO timestamp -> tick. */
export function toTick(iso) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) {
    throw new TypeError(`clock: unparseable timestamp "${iso}"`);
  }
  return Math.floor((ms - EPOCH_MS) / 1000);
}

/* ---------- arithmetic (pure: a new tick every time) ---------- */

export function addSeconds(tick, amount) {
  assertTick(tick);
  assertAmount(amount);
  return tick + amount * SECOND;
}

export function addMinutes(tick, amount) {
  assertTick(tick);
  assertAmount(amount);
  return tick + amount * MINUTE;
}

export function addHours(tick, amount) {
  assertTick(tick);
  assertAmount(amount);
  return tick + amount * HOUR;
}

export function addDays(tick, amount) {
  assertTick(tick);
  assertAmount(amount);
  return tick + amount * DAY;
}

/* ---------- formatting ---------- */

/** "09:07:03" */
export function formatTime(tick) {
  const date = toDate(tick);
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

/** "2026-03-05" */
export function formatDate(tick) {
  const date = toDate(tick);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** "2026-03-05 09:07:03" — sortable, used in tables and tickets. */
export function formatStamp(tick) {
  return `${formatDate(tick)} ${formatTime(tick)}`;
}

/** Standard ISO, used in saves and structured log records. */
export function formatIso(tick) {
  return toDate(tick).toISOString();
}

/** "Mar  5 09:07:03" — the syslog shape, day space-padded to width 2. */
export function formatLogStamp(tick) {
  const date = toDate(tick);
  const day = String(date.getUTCDate()).padStart(2, ' ');
  return `${MONTHS[date.getUTCMonth()]} ${day} ${formatTime(tick)}`;
}

/* ---------- calendar ---------- */

/** 0-23 */
export function hourOfDay(tick) {
  return toDate(tick).getUTCHours();
}

/** 0 = Sunday ... 6 = Saturday */
export function dayOfWeek(tick) {
  return toDate(tick).getUTCDay();
}

/** Monday-Friday, 08:00-17:59. Drives whether activity looks normal or suspicious. */
export function isWorkHours(tick) {
  const day = dayOfWeek(tick);
  const hour = hourOfDay(tick);
  return day >= 1 && day <= 5 && hour >= 8 && hour < 18;
}

/** Human-readable duration: "45s", "1m 30s", "1h 2m", "1d 1h". Sign is ignored. */
export function describeGap(seconds) {
  assertAmount(seconds);
  const total = Math.abs(Math.trunc(seconds));

  if (total < MINUTE) return `${total}s`;

  if (total < HOUR) {
    const minutes = Math.floor(total / MINUTE);
    const rest = total % MINUTE;
    return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
  }

  if (total < DAY) {
    const hours = Math.floor(total / HOUR);
    const minutes = Math.floor((total % HOUR) / MINUTE);
    return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  const days = Math.floor(total / DAY);
  const hours = Math.floor((total % DAY) / HOUR);
  return hours ? `${days}d ${hours}h` : `${days}d`;
}
