/**
 * The window manager, as data.
 *
 * Every rule about where a window may be, which one is on top, and what a
 * taskbar click does lives here — pure, immutable, and node-tested. The UI layer
 * only draws the result and reports pointer positions back.
 *
 * The rule that earns this file its place is the clamp. A window dragged so its
 * title bar leaves the screen cannot be dragged back, and on the target machine
 * there is no devtools to reach in and fix it: the game is simply broken until
 * someone clears storage they cannot find. So `clamp` is not a polish pass, it is
 * the difference between a desktop and a trap, and it runs on every move, every
 * resize, and every viewport change.
 *
 * One window per app, deliberately. Two Mail windows would each need their own
 * scroll position, their own selection and their own answer to "which one is the
 * real one" — all cost, no gain, for a game with five apps.
 */

import { deepFreeze } from '../immutable.js';

/** Small enough to be worth having, big enough to still be usable. */
export const MIN_W = 300;
export const MIN_H = 180;

/** How much of a window must stay reachable, whatever the player does to it. */
export const KEEP_VISIBLE = 96;

/** The title bar's height, in the same units as everything else here. */
export const TITLEBAR_H = 30;

/**
 * Below this width a floating desktop stops being usable — windows overlap into
 * illegibility and there is nowhere to drag them. The model reports it; the UI
 * responds by showing one app at a time.
 */
export const NARROW_WIDTH = 900;

export function createDesktop() {
  return deepFreeze({ windows: {}, order: [], nextZ: 1 });
}

/* ---------- reading ---------- */

export function isOpen(desktop, appId) {
  return Object.prototype.hasOwnProperty.call(desktop.windows, appId);
}

export function windowOf(desktop, appId) {
  return isOpen(desktop, appId) ? desktop.windows[appId] : null;
}

/** Open windows, back to front. The render order. */
export function stack(desktop) {
  return desktop.order
    .filter((appId) => isOpen(desktop, appId))
    .map((appId) => desktop.windows[appId])
    .sort((a, b) => a.z - b.z);
}

/** The window the player is working in: highest z among those not minimised. */
export function focused(desktop) {
  let best = null;
  for (const win of stack(desktop)) {
    if (win.minimized) continue;
    if (!best || win.z > best.z) best = win;
  }
  return best;
}

export function focusedId(desktop) {
  const win = focused(desktop);
  return win ? win.appId : null;
}

export function isNarrow(viewport) {
  return viewport.width < NARROW_WIDTH;
}

/* ---------- geometry ---------- */

function clampNumber(value, low, high) {
  if (!Number.isFinite(value)) return low;
  return Math.min(high, Math.max(low, value));
}

/**
 * Put a window somewhere it can still be used.
 *
 * Size is capped to the viewport first, because clamping a position against a
 * window wider than the screen has no answer that is right. Then the position is
 * held so that a strip of the title bar at least KEEP_VISIBLE wide stays on
 * screen, and the title bar itself never goes above the top edge — those two
 * together guarantee there is always something to grab.
 */
export function clamp(win, viewport) {
  const w = clampNumber(win.w, MIN_W, Math.max(MIN_W, viewport.width));
  const h = clampNumber(win.h, MIN_H, Math.max(MIN_H, viewport.height));

  const minX = KEEP_VISIBLE - w;
  const maxX = Math.max(minX, viewport.width - KEEP_VISIBLE);
  const maxY = Math.max(0, viewport.height - TITLEBAR_H);

  const x = clampNumber(win.x, minX, maxX);
  const y = clampNumber(win.y, 0, maxY);

  if (x === win.x && y === win.y && w === win.w && h === win.h) return win;
  return deepFreeze({ ...win, x, y, w, h });
}

export function clampAll(desktop, viewport) {
  let changed = false;
  const windows = {};

  for (const [appId, win] of Object.entries(desktop.windows)) {
    const next = clamp(win, viewport);
    windows[appId] = next;
    if (next !== win) changed = true;
  }

  return changed ? deepFreeze({ ...desktop, windows }) : desktop;
}

/**
 * Where a window goes when nothing says otherwise.
 *
 * Cascading from the top-left by a fixed step, keyed on how many windows are
 * already open, so a newly opened app never lands exactly on top of the one
 * beneath it — and so the position is a pure function of the state rather than
 * of a counter that drifts.
 */
export function cascadeAt(desktop, viewport, size) {
  const step = 28;
  const depth = Object.keys(desktop.windows).length % 6;
  const w = Math.min(size.w, Math.max(MIN_W, viewport.width - 48));
  const h = Math.min(size.h, Math.max(MIN_H, viewport.height - 48));

  return {
    x: Math.max(0, Math.round((viewport.width - w) / 2) - 60 + depth * step),
    y: Math.max(0, Math.round((viewport.height - h) / 3) - 40 + depth * step),
    w,
    h
  };
}

/* ---------- writing ---------- */

function withWindow(desktop, appId, win) {
  return deepFreeze({
    ...desktop,
    windows: { ...desktop.windows, [appId]: win },
    order: desktop.order.includes(appId) ? desktop.order : [...desktop.order, appId]
  });
}

/**
 * Open an app, or bring it forward if it is already there.
 *
 * Re-opening never moves a window. The player put it where they put it, and a
 * taskbar click that also teleports the window is the behaviour every real
 * desktop is careful not to have.
 */
export function openApp(desktop, appId, geometry, viewport) {
  const existing = windowOf(desktop, appId);
  const z = desktop.nextZ;

  const win = existing
    ? { ...existing, minimized: false, z }
    : { appId, ...geometry, z, minimized: false };

  return withWindow(deepFreeze({ ...desktop, nextZ: z + 1 }), appId, clamp(win, viewport));
}

export function closeApp(desktop, appId) {
  if (!isOpen(desktop, appId)) return desktop;

  const windows = { ...desktop.windows };
  delete windows[appId];

  return deepFreeze({
    ...desktop,
    windows,
    order: desktop.order.filter((id) => id !== appId)
  });
}

export function focusApp(desktop, appId) {
  const win = windowOf(desktop, appId);
  if (!win) return desktop;
  if (win.z === desktop.nextZ - 1 && !win.minimized) return desktop;

  return withWindow(
    deepFreeze({ ...desktop, nextZ: desktop.nextZ + 1 }),
    appId,
    deepFreeze({ ...win, z: desktop.nextZ, minimized: false })
  );
}

export function minimizeApp(desktop, appId) {
  const win = windowOf(desktop, appId);
  if (!win || win.minimized) return desktop;
  return withWindow(desktop, appId, deepFreeze({ ...win, minimized: true }));
}

/**
 * What a taskbar button does, which is three different things depending on the
 * window's state — and the same three in every desktop ever shipped, because
 * anything else surprises people.
 */
export function toggleApp(desktop, appId, geometry, viewport) {
  const win = windowOf(desktop, appId);
  if (!win) return openApp(desktop, appId, geometry, viewport);
  if (win.minimized) return focusApp(desktop, appId);
  if (focusedId(desktop) === appId) return minimizeApp(desktop, appId);
  return focusApp(desktop, appId);
}

export function moveApp(desktop, appId, x, y, viewport) {
  const win = windowOf(desktop, appId);
  if (!win) return desktop;
  const next = clamp({ ...win, x, y }, viewport);
  if (next.x === win.x && next.y === win.y) return desktop;
  return withWindow(desktop, appId, next);
}

export function resizeApp(desktop, appId, w, h, viewport) {
  const win = windowOf(desktop, appId);
  if (!win) return desktop;
  const next = clamp({ ...win, w, h }, viewport);
  if (next.w === win.w && next.h === win.h) return desktop;
  return withWindow(desktop, appId, next);
}

/**
 * Lay out a set of apps across the working area in one pass.
 *
 * Used for the opening arrangement and for the "tidy up" button. Weights are
 * relative columns; every window gets the full height of the area.
 */
export function tile(desktop, columns, viewport, gap = 12) {
  const open = columns.filter((column) => column.appId);
  if (open.length === 0) return desktop;

  const total = open.reduce((sum, column) => sum + (column.weight || 1), 0);
  const usableW = Math.max(MIN_W, viewport.width - gap * (open.length + 1));
  const height = Math.max(MIN_H, viewport.height - gap * 2);

  let next = desktop;
  let x = gap;

  for (const column of open) {
    const width = Math.max(MIN_W, Math.round((usableW * (column.weight || 1)) / total));
    next = openApp(next, column.appId, { x, y: gap, w: width, h: height }, viewport);
    // Re-open with explicit geometry: openApp preserves an existing position, so
    // tiling has to place the window itself rather than ask for it.
    next = withWindow(next, column.appId, clamp({ ...next.windows[column.appId], x, y: gap, w: width, h: height }, viewport));
    x += width + gap;
  }

  return next;
}
