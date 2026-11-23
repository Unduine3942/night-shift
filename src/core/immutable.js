/**
 * Immutable updates with structural sharing.
 *
 * The world is one deep object rebuilt by event reducers. Copying it wholesale on
 * every event would be slow and would quietly break identity checks; mutating it
 * in place would break replay, undo, and every test that compares two states.
 *
 * So each helper returns a NEW value with only the touched path rebuilt. Branches
 * that did not change keep their original reference, which is what makes
 * "did this part of the world change?" a cheap `===` rather than a deep compare.
 *
 * Paths are arrays of keys: ['net', 'devices', 'rtr-1', 'up'].
 * A numeric key addresses an array index.
 */

function isContainer(value) {
  return value !== null && typeof value === 'object';
}

/**
 * Keys that are never data.
 *
 * Paths here are built from event payloads, which arrive in save files that have
 * been through a USB stick and possibly a text editor. A device id of
 * `'__proto__'` would make `setIn` rewrite the prototype of the branch it is
 * writing into, and one of `'toString'` would make a truthiness check on `getIn`
 * find an inherited function and conclude the device exists. Both were real:
 * neither is reachable now.
 */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Own properties only — an inherited member is not data and must not read as one. */
function own(container, key) {
  return Object.prototype.hasOwnProperty.call(container, key);
}

function cloneShallow(value) {
  return Array.isArray(value) ? [...value] : { ...value };
}

function emptyFor(key) {
  return typeof key === 'number' ? [] : {};
}

/**
 * Read a nested value.
 * @param {*} target
 * @param {Array<string|number>} path
 * @param {*} [fallback] returned when the path is missing or holds undefined
 */
export function getIn(target, path, fallback = undefined) {
  let current = target;
  for (const key of path) {
    if (!isContainer(current) || !own(current, key)) return fallback;
    current = current[key];
  }
  return current === undefined ? fallback : current;
}

/**
 * Write a nested value, creating missing intermediate containers.
 * An empty path replaces the target outright.
 */
export function setIn(target, path, value) {
  if (!Array.isArray(path)) {
    throw new TypeError('setIn: path must be an array of keys');
  }
  if (path.length === 0) return value;

  const [key, ...rest] = path;
  if (FORBIDDEN_KEYS.has(key)) {
    throw new TypeError(`setIn: "${key}" is not a writable key`);
  }

  const next = isContainer(target) ? cloneShallow(target) : emptyFor(key);
  next[key] = rest.length === 0 ? value : setIn(next[key], rest, value);
  return next;
}

/**
 * Replace a nested value with the result of `updater(currentValue)`.
 * The updater receives undefined when the path does not exist yet.
 */
export function updateIn(target, path, updater) {
  return setIn(target, path, updater(getIn(target, path)));
}

/**
 * Delete an object key, or splice out an array index.
 * Returns the target unchanged if the path is not there.
 */
export function removeIn(target, path) {
  if (!Array.isArray(path)) {
    throw new TypeError('removeIn: path must be an array of keys');
  }
  if (path.length === 0) return undefined;

  const parentPath = path.slice(0, -1);
  const key = path[path.length - 1];
  const parent = getIn(target, parentPath);
  if (!isContainer(parent)) return target;

  let nextParent;
  if (Array.isArray(parent)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= parent.length) return target;
    nextParent = parent.filter((_, i) => i !== index);
  } else {
    if (!Object.prototype.hasOwnProperty.call(parent, key)) return target;
    nextParent = { ...parent };
    delete nextParent[key];
  }

  return parentPath.length === 0 ? nextParent : setIn(target, parentPath, nextParent);
}

/** Append to a nested array. A missing path is treated as an empty array. */
export function pushIn(target, path, ...items) {
  const list = getIn(target, path, []);
  if (!Array.isArray(list)) {
    throw new TypeError(`pushIn: ${path.join('.')} is not an array`);
  }
  return setIn(target, path, [...list, ...items]);
}

/**
 * Recursively freeze a value. Used on the seed and on each committed world so an
 * accidental in-place write throws in development instead of corrupting a replay.
 * Safe on cycles and primitives.
 */
export function deepFreeze(value) {
  if (!isContainer(value) || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return value;
}
