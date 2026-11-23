/**
 * Boundary validation.
 *
 * Every event payload, every piece of authored content, and every save file that
 * comes back off disk is checked here before it reaches a reducer. The game ships
 * as one HTML file with no devtools guarantee on the target machine, so a bad
 * value has to fail loudly at the edge with a message naming the field — not
 * three layers deeper as `undefined is not a function`.
 */

const IPV4_OCTET = /^(0|[1-9]\d{0,2})$/;

/* ---------- predicates ---------- */

export function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isBoolean(value) {
  return typeof value === 'boolean';
}

export function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}

/** Dotted-quad IPv4. Rejects padded octets like 10.00.0.1, which hide typos. */
export function isIpv4(value) {
  if (typeof value !== 'string') return false;
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!IPV4_OCTET.test(part)) return false;
    const n = Number(part);
    return n >= 0 && n <= 255;
  });
}

/** CIDR prefix length, 0-32. */
export function isPrefixLength(value) {
  return Number.isInteger(value) && value >= 0 && value <= 32;
}

/* ---------- conversion ---------- */

/** Dotted-quad -> unsigned 32-bit integer. */
export function ipToInt(ip) {
  requireIpv4(ip, 'ip');
  return ip.split('.').reduce((acc, part) => acc * 256 + Number(part), 0);
}

/** Unsigned 32-bit integer -> dotted-quad. */
export function intToIp(value) {
  check(isFiniteNumber(value) && value >= 0 && value <= 0xffffffff, `intToIp: ${value} is not a 32-bit address`);
  return [
    Math.floor(value / 16777216) % 256,
    Math.floor(value / 65536) % 256,
    Math.floor(value / 256) % 256,
    value % 256
  ].join('.');
}

/* ---------- assertions ---------- */

/** Throw a TypeError carrying `message` unless `condition` is truthy. */
export function check(condition, message) {
  if (!condition) throw new TypeError(message);
  return condition;
}

export function requireString(value, label) {
  check(isNonEmptyString(value), `${label} must be a non-empty string, got ${describe(value)}`);
  return value;
}

export function requireBoolean(value, label) {
  check(isBoolean(value), `${label} must be true or false, got ${describe(value)}`);
  return value;
}

export function requireInteger(value, label, { min, max } = {}) {
  check(Number.isInteger(value), `${label} must be an integer, got ${describe(value)}`);
  if (min !== undefined) check(value >= min, `${label} must be at least ${min}, got ${value}`);
  if (max !== undefined) check(value <= max, `${label} must be at most ${max}, got ${value}`);
  return value;
}

export function requireOneOf(value, allowed, label) {
  check(allowed.includes(value), `${label} must be one of ${allowed.join(', ')}, got ${describe(value)}`);
  return value;
}

export function requireIpv4(value, label) {
  check(isIpv4(value), `${label} must be an IPv4 address, got ${describe(value)}`);
  return value;
}

function describe(value) {
  if (typeof value === 'string') return `"${value}"`;
  if (value === null) return 'null';
  if (Array.isArray(value)) return `an array of ${value.length}`;
  return String(value);
}
