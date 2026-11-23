import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  createDesktop,
  openApp,
  closeApp,
  focusApp,
  minimizeApp,
  toggleApp,
  moveApp,
  resizeApp,
  clamp,
  clampAll,
  cascadeAt,
  tile,
  stack,
  focused,
  focusedId,
  isOpen,
  windowOf,
  isNarrow,
  MIN_W,
  MIN_H,
  KEEP_VISIBLE,
  TITLEBAR_H,
  NARROW_WIDTH
} from '../../../src/core/desktop/windows.js';

const VIEW = { width: 1280, height: 720 };
const BOX = { x: 40, y: 40, w: 600, h: 400 };

describe('opening and closing', () => {
  test('a new desktop has nothing on it', () => {
    const desktop = createDesktop();
    assert.deepEqual(stack(desktop), []);
    assert.equal(focused(desktop), null);
    assert.equal(focusedId(desktop), null);
  });

  test('opening an app puts a window on the desktop', () => {
    const desktop = openApp(createDesktop(), 'mail', BOX, VIEW);

    assert.equal(isOpen(desktop, 'mail'), true);
    assert.equal(windowOf(desktop, 'mail').appId, 'mail');
    assert.equal(focusedId(desktop), 'mail');
  });

  test('an app that is not open has no window', () => {
    const desktop = createDesktop();
    assert.equal(isOpen(desktop, 'mail'), false);
    assert.equal(windowOf(desktop, 'mail'), null);
  });

  test('closing removes the window and hands focus to what is left', () => {
    let desktop = openApp(createDesktop(), 'mail', BOX, VIEW);
    desktop = openApp(desktop, 'terminal', BOX, VIEW);
    assert.equal(focusedId(desktop), 'terminal');

    desktop = closeApp(desktop, 'terminal');
    assert.equal(isOpen(desktop, 'terminal'), false);
    assert.equal(focusedId(desktop), 'mail');
  });

  test('closing an app that was never open changes nothing', () => {
    const desktop = openApp(createDesktop(), 'mail', BOX, VIEW);
    assert.equal(closeApp(desktop, 'manual'), desktop);
  });

  test('one app can only have one window', () => {
    let desktop = openApp(createDesktop(), 'mail', BOX, VIEW);
    desktop = openApp(desktop, 'mail', { x: 500, y: 500, w: 400, h: 300 }, VIEW);

    assert.equal(stack(desktop).length, 1);
  });

  test('re-opening never moves the window the player placed', () => {
    let desktop = openApp(createDesktop(), 'mail', BOX, VIEW);
    desktop = moveApp(desktop, 'mail', 200, 150, VIEW);
    desktop = openApp(desktop, 'mail', { x: 0, y: 0, w: 400, h: 300 }, VIEW);

    const win = windowOf(desktop, 'mail');
    assert.equal(win.x, 200);
    assert.equal(win.y, 150);
    assert.equal(win.w, BOX.w, 'size is the players too');
  });
});

describe('stacking order', () => {
  test('the last app opened is on top', () => {
    let desktop = openApp(createDesktop(), 'mail', BOX, VIEW);
    desktop = openApp(desktop, 'terminal', BOX, VIEW);
    desktop = openApp(desktop, 'manual', BOX, VIEW);

    assert.deepEqual(stack(desktop).map((win) => win.appId), ['mail', 'terminal', 'manual']);
    assert.equal(focusedId(desktop), 'manual');
  });

  test('focusing raises a window above everything else', () => {
    let desktop = openApp(createDesktop(), 'mail', BOX, VIEW);
    desktop = openApp(desktop, 'terminal', BOX, VIEW);
    desktop = openApp(desktop, 'manual', BOX, VIEW);

    desktop = focusApp(desktop, 'mail');
    assert.equal(focusedId(desktop), 'mail');
    assert.deepEqual(stack(desktop).map((win) => win.appId), ['terminal', 'manual', 'mail']);
  });

  test('focusing what is already on top is a no-op, not a z bump', () => {
    let desktop = openApp(createDesktop(), 'mail', BOX, VIEW);
    desktop = openApp(desktop, 'terminal', BOX, VIEW);

    assert.equal(focusApp(desktop, 'terminal'), desktop);
  });

  test('focusing an app that is not open changes nothing', () => {
    const desktop = openApp(createDesktop(), 'mail', BOX, VIEW);
    assert.equal(focusApp(desktop, 'training'), desktop);
  });

  test('z never runs out of room within a long session', () => {
    let desktop = openApp(createDesktop(), 'mail', BOX, VIEW);
    desktop = openApp(desktop, 'terminal', BOX, VIEW);
    for (let index = 0; index < 500; index++) {
      desktop = focusApp(desktop, index % 2 === 0 ? 'mail' : 'terminal');
    }
    assert.ok(Number.isSafeInteger(desktop.nextZ));
    assert.equal(stack(desktop).length, 2);
  });
});

describe('minimising', () => {
  test('a minimised window stays open but cannot hold focus', () => {
    let desktop = openApp(createDesktop(), 'mail', BOX, VIEW);
    desktop = openApp(desktop, 'terminal', BOX, VIEW);

    desktop = minimizeApp(desktop, 'terminal');

    assert.equal(isOpen(desktop, 'terminal'), true, 'minimising is not closing');
    assert.equal(windowOf(desktop, 'terminal').minimized, true);
    assert.equal(focusedId(desktop), 'mail');
  });

  test('minimising the only window leaves nothing focused', () => {
    let desktop = openApp(createDesktop(), 'mail', BOX, VIEW);
    desktop = minimizeApp(desktop, 'mail');
    assert.equal(focusedId(desktop), null);
  });

  test('focusing restores a minimised window', () => {
    let desktop = openApp(createDesktop(), 'mail', BOX, VIEW);
    desktop = minimizeApp(desktop, 'mail');
    desktop = focusApp(desktop, 'mail');

    assert.equal(windowOf(desktop, 'mail').minimized, false);
    assert.equal(focusedId(desktop), 'mail');
  });

  test('minimising twice is idempotent', () => {
    let desktop = minimizeApp(openApp(createDesktop(), 'mail', BOX, VIEW), 'mail');
    assert.equal(minimizeApp(desktop, 'mail'), desktop);
  });
});

describe('the taskbar button', () => {
  const geom = () => BOX;

  test('opens an app that is closed', () => {
    const desktop = toggleApp(createDesktop(), 'mail', geom(), VIEW);
    assert.equal(isOpen(desktop, 'mail'), true);
    assert.equal(focusedId(desktop), 'mail');
  });

  test('minimises an app that is open and focused', () => {
    let desktop = toggleApp(createDesktop(), 'mail', geom(), VIEW);
    desktop = toggleApp(desktop, 'mail', geom(), VIEW);

    assert.equal(isOpen(desktop, 'mail'), true);
    assert.equal(windowOf(desktop, 'mail').minimized, true);
  });

  test('raises an app that is open but buried', () => {
    let desktop = toggleApp(createDesktop(), 'mail', geom(), VIEW);
    desktop = toggleApp(desktop, 'terminal', geom(), VIEW);
    assert.equal(focusedId(desktop), 'terminal');

    desktop = toggleApp(desktop, 'mail', geom(), VIEW);
    assert.equal(focusedId(desktop), 'mail');
    assert.equal(windowOf(desktop, 'mail').minimized, false);
  });

  test('restores an app that is minimised', () => {
    let desktop = toggleApp(createDesktop(), 'mail', geom(), VIEW);
    desktop = minimizeApp(desktop, 'mail');
    desktop = toggleApp(desktop, 'mail', geom(), VIEW);

    assert.equal(windowOf(desktop, 'mail').minimized, false);
    assert.equal(focusedId(desktop), 'mail');
  });
});

/**
 * The clamp is the whole reason this file is in core/ and not in ui/.
 *
 * On the target machine there is no devtools. A window dragged past the edge is
 * a window that cannot be dragged back, and the game stays broken until someone
 * clears storage they do not know how to find.
 */
describe('a window can always be grabbed again', () => {
  test('it cannot be dragged off the right edge', () => {
    const win = clamp({ appId: 'mail', x: 5000, y: 100, w: 600, h: 400 }, VIEW);
    assert.ok(win.x <= VIEW.width - KEEP_VISIBLE, `x ${win.x} left nothing to grab`);
  });

  test('it cannot be dragged off the left edge', () => {
    const win = clamp({ appId: 'mail', x: -5000, y: 100, w: 600, h: 400 }, VIEW);
    assert.ok(win.x + win.w >= KEEP_VISIBLE, `x ${win.x} left nothing to grab`);
  });

  test('the title bar never goes above the top edge', () => {
    const win = clamp({ appId: 'mail', x: 100, y: -400, w: 600, h: 400 }, VIEW);
    assert.equal(win.y, 0);
  });

  test('the title bar never goes below the bottom edge', () => {
    const win = clamp({ appId: 'mail', x: 100, y: 99999, w: 600, h: 400 }, VIEW);
    assert.ok(win.y <= VIEW.height - TITLEBAR_H, `y ${win.y} put the title bar off screen`);
  });

  test('a window is never smaller than it can be used at', () => {
    const win = clamp({ appId: 'mail', x: 10, y: 10, w: 1, h: 1 }, VIEW);
    assert.equal(win.w, MIN_W);
    assert.equal(win.h, MIN_H);
  });

  test('a window is never bigger than the screen', () => {
    const win = clamp({ appId: 'mail', x: 0, y: 0, w: 9000, h: 9000 }, VIEW);
    assert.equal(win.w, VIEW.width);
    assert.equal(win.h, VIEW.height);
  });

  test('a viewport smaller than the minimum still produces a usable window', () => {
    const tiny = { width: 200, height: 120 };
    const win = clamp({ appId: 'mail', x: 0, y: 0, w: 600, h: 400 }, tiny);

    assert.equal(win.w, MIN_W, 'the minimum wins over a viewport that cannot hold it');
    assert.equal(win.h, MIN_H);
    assert.ok(Number.isFinite(win.x) && Number.isFinite(win.y));
  });

  test('nonsense coordinates do not produce NaN geometry', () => {
    for (const bad of [NaN, Infinity, -Infinity, undefined, null, '400']) {
      const win = clamp({ appId: 'mail', x: bad, y: bad, w: bad, h: bad }, VIEW);
      for (const key of ['x', 'y', 'w', 'h']) {
        assert.ok(Number.isFinite(win[key]), `${key} became ${win[key]} from ${String(bad)}`);
      }
    }
  });

  test('clamping an already-legal window returns the same object', () => {
    const win = Object.freeze({ appId: 'mail', x: 40, y: 40, w: 600, h: 400 });
    assert.equal(clamp(win, VIEW), win);
  });

  test('shrinking the viewport pulls every window back into reach', () => {
    let desktop = openApp(createDesktop(), 'mail', { x: 900, y: 500, w: 600, h: 400 }, VIEW);
    desktop = openApp(desktop, 'terminal', { x: 1000, y: 600, w: 500, h: 300 }, VIEW);

    const small = { width: 800, height: 600 };
    const pulled = clampAll(desktop, small);

    for (const win of stack(pulled)) {
      assert.ok(win.x <= small.width - KEEP_VISIBLE, `${win.appId} is off the right edge`);
      assert.ok(win.x + win.w >= KEEP_VISIBLE, `${win.appId} is off the left edge`);
      assert.ok(win.y >= 0 && win.y <= small.height - TITLEBAR_H, `${win.appId} title bar is off screen`);
    }
  });

  test('clampAll on an already-legal desktop returns the same object', () => {
    const desktop = openApp(createDesktop(), 'mail', BOX, VIEW);
    assert.equal(clampAll(desktop, VIEW), desktop);
  });

  test('moving is clamped, so no drag can strand a window', () => {
    let desktop = openApp(createDesktop(), 'mail', BOX, VIEW);
    desktop = moveApp(desktop, 'mail', 99999, 99999, VIEW);

    const win = windowOf(desktop, 'mail');
    assert.ok(win.x <= VIEW.width - KEEP_VISIBLE);
    assert.ok(win.y <= VIEW.height - TITLEBAR_H);
  });

  test('resizing is clamped, so no drag can shrink a window away', () => {
    let desktop = openApp(createDesktop(), 'mail', BOX, VIEW);
    desktop = resizeApp(desktop, 'mail', 0, 0, VIEW);

    const win = windowOf(desktop, 'mail');
    assert.equal(win.w, MIN_W);
    assert.equal(win.h, MIN_H);
  });

  test('moving or resizing an app that is not open changes nothing', () => {
    const desktop = openApp(createDesktop(), 'mail', BOX, VIEW);
    assert.equal(moveApp(desktop, 'manual', 10, 10, VIEW), desktop);
    assert.equal(resizeApp(desktop, 'manual', 500, 500, VIEW), desktop);
  });

  test('a move that changes nothing returns the same object', () => {
    const desktop = openApp(createDesktop(), 'mail', BOX, VIEW);
    assert.equal(moveApp(desktop, 'mail', BOX.x, BOX.y, VIEW), desktop);
  });

  test('every window ever opened is reachable, whatever geometry was asked for', () => {
    const viewports = [
      { width: 1920, height: 1080 },
      { width: 1280, height: 720 },
      { width: 1024, height: 640 },
      { width: 640, height: 480 }
    ];
    const asks = [
      { x: -9999, y: -9999, w: 10, h: 10 },
      { x: 9999, y: 9999, w: 9999, h: 9999 },
      { x: 0, y: 0, w: 300, h: 180 },
      { x: NaN, y: NaN, w: NaN, h: NaN }
    ];

    for (const viewport of viewports) {
      for (const ask of asks) {
        const desktop = openApp(createDesktop(), 'mail', ask, viewport);
        const win = windowOf(desktop, 'mail');

        assert.ok(win.x + win.w >= KEEP_VISIBLE, `${viewport.width}x${viewport.height}: off the left`);
        assert.ok(win.x <= viewport.width - KEEP_VISIBLE, `${viewport.width}x${viewport.height}: off the right`);
        assert.ok(win.y >= 0, `${viewport.width}x${viewport.height}: above the top`);
        assert.ok(win.y <= Math.max(0, viewport.height - TITLEBAR_H), `${viewport.width}x${viewport.height}: below the bottom`);
        assert.ok(win.w >= MIN_W && win.h >= MIN_H, 'too small to use');
      }
    }
  });
});

describe('default placement', () => {
  test('cascading puts each new window somewhere the last one is not', () => {
    let desktop = createDesktop();
    const seen = new Set();

    for (const appId of ['mail', 'terminal', 'manual', 'training']) {
      const where = cascadeAt(desktop, VIEW, { w: 600, h: 400 });
      desktop = openApp(desktop, appId, where, VIEW);
      const key = `${where.x},${where.y}`;
      assert.ok(!seen.has(key), `${appId} landed exactly on top of another window`);
      seen.add(key);
    }
  });

  test('a cascade never places a window off screen', () => {
    let desktop = createDesktop();
    for (let index = 0; index < 12; index++) {
      const where = cascadeAt(desktop, VIEW, { w: 600, h: 400 });
      desktop = openApp(desktop, `app-${index}`, where, VIEW);
    }
    for (const win of stack(desktop)) {
      assert.ok(win.x <= VIEW.width - KEEP_VISIBLE && win.x + win.w >= KEEP_VISIBLE);
      assert.ok(win.y >= 0 && win.y <= VIEW.height - TITLEBAR_H);
    }
  });

  test('a cascade fits the window to a small viewport', () => {
    const where = cascadeAt(createDesktop(), { width: 700, height: 500 }, { w: 1200, h: 900 });
    assert.ok(where.w <= 700 && where.h <= 500);
  });
});

describe('tiling', () => {
  test('two columns sit side by side and fill the screen', () => {
    const desktop = tile(createDesktop(), [{ appId: 'mail', weight: 2 }, { appId: 'terminal', weight: 3 }], VIEW);

    const mail = windowOf(desktop, 'mail');
    const terminal = windowOf(desktop, 'terminal');

    assert.ok(mail.x < terminal.x, 'mail is on the left');
    assert.ok(mail.x + mail.w <= terminal.x, 'the two columns do not overlap');
    assert.ok(terminal.w > mail.w, 'the heavier column is wider');
    assert.equal(mail.y, terminal.y, 'both start at the same height');
    assert.equal(mail.h, terminal.h);
  });

  test('tiling moves windows that were already placed', () => {
    let desktop = openApp(createDesktop(), 'mail', { x: 700, y: 400, w: 400, h: 300 }, VIEW);
    desktop = tile(desktop, [{ appId: 'mail', weight: 1 }, { appId: 'terminal', weight: 1 }], VIEW);

    const mail = windowOf(desktop, 'mail');
    assert.ok(mail.x < 400, 'tiling did not reposition an existing window');
  });

  test('tiling nothing changes nothing', () => {
    const desktop = createDesktop();
    assert.equal(tile(desktop, [], VIEW), desktop);
  });

  test('tiled windows stay on screen even when the screen is small', () => {
    const small = { width: 900, height: 600 };
    const desktop = tile(createDesktop(), [{ appId: 'mail', weight: 2 }, { appId: 'terminal', weight: 3 }], small);

    for (const win of stack(desktop)) {
      assert.ok(win.x + win.w >= KEEP_VISIBLE && win.x <= small.width - KEEP_VISIBLE);
      assert.ok(win.w >= MIN_W && win.h >= MIN_H);
    }
  });
});

describe('narrow screens', () => {
  test('a floating desktop is declared unusable below the threshold', () => {
    assert.equal(isNarrow({ width: NARROW_WIDTH - 1, height: 700 }), true);
    assert.equal(isNarrow({ width: NARROW_WIDTH, height: 700 }), false);
    assert.equal(isNarrow({ width: 1280, height: 720 }), false);
  });
});

describe('nothing here mutates', () => {
  test('every operation leaves the desktop it was given untouched', () => {
    const start = openApp(createDesktop(), 'mail', BOX, VIEW);
    const before = JSON.stringify(start);

    openApp(start, 'terminal', BOX, VIEW);
    closeApp(start, 'mail');
    focusApp(start, 'mail');
    minimizeApp(start, 'mail');
    toggleApp(start, 'mail', BOX, VIEW);
    moveApp(start, 'mail', 1, 1, VIEW);
    resizeApp(start, 'mail', 900, 500, VIEW);
    clampAll(start, { width: 400, height: 300 });
    tile(start, [{ appId: 'mail', weight: 1 }], VIEW);

    assert.equal(JSON.stringify(start), before);
  });

  test('the windows themselves are frozen', () => {
    const desktop = openApp(createDesktop(), 'mail', BOX, VIEW);
    assert.throws(() => {
      windowOf(desktop, 'mail').x = 999;
    }, TypeError);
  });

  test('stack returns a fresh array a caller cannot corrupt', () => {
    const desktop = openApp(createDesktop(), 'mail', BOX, VIEW);
    stack(desktop).push('nonsense');
    assert.equal(stack(desktop).length, 1);
  });
});
