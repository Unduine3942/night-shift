/**
 * One window: the chrome round an app, and the pointer work that moves it.
 *
 * Dragging deliberately does not go through the store. A store update redraws
 * the whole desktop, and doing that on every pointermove would rebuild the
 * terminal's scrollback sixty times a second — so a drag writes straight to the
 * node's own style and commits the final position once, on release. The store
 * stays authoritative; it just is not consulted mid-gesture.
 *
 * Every pointer API used here is feature-detected. The target machine is a
 * managed browser, this file runs under `file://`, and the headless test harness
 * has none of them — in all three cases a window that cannot be dragged is far
 * better than a window that throws on mousedown.
 */

import { el, button } from './dom.js';
import { MIN_W, MIN_H } from '../core/desktop/windows.js';

/**
 * Follow a pointer until it is released.
 *
 * @param event      the pointerdown that started it
 * @param onMove     (dx, dy) since the start, called on every move
 * @param onDone     (dx, dy) final, called once on release
 */
function trackPointer(event, onMove, onDone) {
  // Left button only. A drag started by a right-click never gets its pointerup.
  if (typeof event.button === 'number' && event.button !== 0) return false;

  const startX = event.clientX;
  const startY = event.clientY;
  if (!Number.isFinite(startX) || !Number.isFinite(startY)) return false;

  const target = typeof window !== 'undefined' ? window : null;
  if (!target || typeof target.addEventListener !== 'function') return false;

  let last = { dx: 0, dy: 0 };

  const move = (moveEvent) => {
    last = { dx: moveEvent.clientX - startX, dy: moveEvent.clientY - startY };
    onMove(last.dx, last.dy);
  };

  const stop = () => {
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', stop);
    target.removeEventListener('pointercancel', stop);
    // A cancelled gesture still commits: the window is already drawn where the
    // pointer left it, and not committing would snap it back on the next render.
    onDone(last.dx, last.dy);
  };

  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', stop);
  target.addEventListener('pointercancel', stop);

  if (typeof event.preventDefault === 'function') event.preventDefault();
  return true;
}

/**
 * Things inside a title bar that are not drag handles.
 *
 * The minimise and close buttons live in the bar, so their pointerdown bubbles
 * straight into the drag handler below — and that handler calls preventDefault,
 * which by spec suppresses the compatibility mouse events, `click` among them.
 * The result is a close button with a perfectly good click listener that is
 * never sent a click. Starting a drag from a control is wrong anyway: nobody
 * expects to move a window by grabbing its close button.
 */
const CONTROLS = /^(BUTTON|INPUT|SELECT|TEXTAREA|A|LABEL)$/;

function fromControl(event) {
  let node = event.target;
  while (node && node !== event.currentTarget) {
    if (node.tagName && CONTROLS.test(node.tagName)) return true;
    node = node.parentElement;
  }
  return false;
}

/**
 * The window element for an app, looked up live.
 *
 * Deliberately NOT the node the event came from. Raising a window can, in the
 * fallback path, replace the whole frame — and a drag that then writes to the
 * node it captured beforehand is writing to something no longer on the page, so
 * the window simply does not move. Ask the document afterwards instead.
 */
function liveFrame(appId) {
  try {
    return document.querySelector(`.win[data-app="${appId}"]`);
  } catch {
    return null;
  }
}

function startDrag(event, win, actions) {
  // The window still gets raised: the frame's own pointerdown handler does that,
  // and it does not preventDefault, so the button's click survives.
  if (fromControl(event)) return;

  actions.focusApp(win.appId);

  const frame = liveFrame(win.appId);
  if (!frame) return;

  const originX = win.x;
  const originY = win.y;

  const moved = trackPointer(
    event,
    (dx, dy) => {
      frame.style.left = `${originX + dx}px`;
      frame.style.top = `${originY + dy}px`;
    },
    (dx, dy) => actions.moveApp(win.appId, originX + dx, originY + dy)
  );

  if (moved) frame.classList.add('win-dragging');
}

function startResize(event, win, actions) {
  actions.focusApp(win.appId);

  const frame = liveFrame(win.appId);
  if (!frame) return;

  const originW = win.w;
  const originH = win.h;

  trackPointer(
    event,
    (dx, dy) => {
      frame.style.width = `${Math.max(MIN_W, originW + dx)}px`;
      frame.style.height = `${Math.max(MIN_H, originH + dy)}px`;
    },
    (dx, dy) => actions.resizeApp(win.appId, originW + dx, originH + dy)
  );
}

/**
 * Keyboard equivalents for everything the pointer does.
 *
 * Not decoration. `AllowFileSelectionDialogs` and friends are not the only
 * things a managed browser turns off, and the plan's budget line says
 * keyboard-first. Arrows move, shift+arrows resize, Escape minimises.
 */
function onTitleKey(event, win, actions) {
  const step = event.shiftKey ? 40 : 16;

  switch (event.key) {
    case 'ArrowLeft':
      event.preventDefault();
      if (event.altKey) actions.resizeApp(win.appId, win.w - step, win.h);
      else actions.moveApp(win.appId, win.x - step, win.y);
      return;
    case 'ArrowRight':
      event.preventDefault();
      if (event.altKey) actions.resizeApp(win.appId, win.w + step, win.h);
      else actions.moveApp(win.appId, win.x + step, win.y);
      return;
    case 'ArrowUp':
      event.preventDefault();
      if (event.altKey) actions.resizeApp(win.appId, win.w, win.h - step);
      else actions.moveApp(win.appId, win.x, win.y - step);
      return;
    case 'ArrowDown':
      event.preventDefault();
      if (event.altKey) actions.resizeApp(win.appId, win.w, win.h + step);
      else actions.moveApp(win.appId, win.x, win.y + step);
      return;
    case 'Escape':
      event.preventDefault();
      actions.minimizeApp(win.appId);
      return;
    default:
  }
}

/**
 * An app body is content in the same sense a mission is: a mistake in one must
 * not take the desktop with it. A window that cannot draw shows why, inside its
 * own frame, and every other window carries on.
 */
function safeBody(app, ctx) {
  try {
    return app.body(ctx);
  } catch (error) {
    return el(
      'div',
      { class: 'win-broken' },
      el('p', { class: 'verdict verdict-no' }, `${app.title} could not be drawn.`),
      el('p', { class: 'muted' }, String((error && error.message) || error)),
      el('p', { class: 'muted' }, 'Your progress is safe. Close this window and carry on.')
    );
  }
}

/**
 * @param app      the app definition
 * @param win      its window geometry from core/desktop
 * @param isFocused
 * @param maximized true on a narrow screen, where windows fill the desktop instead
 */
export function windowFrame(app, win, isFocused, maximized, ctx) {
  const actions = ctx.actions;
  const subtitle = typeof app.subtitle === 'function' ? app.subtitle(ctx) : null;

  const style = maximized
    ? 'left:0;top:0;width:100%;height:100%;z-index:1'
    : `left:${win.x}px;top:${win.y}px;width:${win.w}px;height:${win.h}px;z-index:${win.z}`;

  return el(
    'section',
    {
      class: `win win-${app.id}${isFocused ? ' win-focused' : ''}${maximized ? ' win-max' : ''}`,
      'data-app': app.id,
      style,
      role: 'dialog',
      'aria-label': app.title,
      onPointerDown: () => actions.focusApp(app.id)
    },

    el(
      'header',
      {
        class: 'win-bar',
        tabindex: '0',
        'aria-label': `${app.title} window. Arrow keys move it, alt and arrows resize it, escape minimises it.`,
        onPointerDown: maximized ? null : (event) => startDrag(event, win, actions),
        onKeyDown: maximized ? null : (event) => onTitleKey(event, win, actions),
        onDblClick: () => actions.tidyDesktop()
      },
      el('span', { class: `win-dot win-dot-${app.id}` }),
      el('span', { class: 'win-title' }, app.title),
      subtitle && el('span', { class: 'win-subtitle' }, subtitle),
      el(
        'span',
        { class: 'win-buttons' },
        button('–', () => actions.minimizeApp(app.id), {
          class: 'win-btn',
          'aria-label': `Minimise ${app.title}`,
          title: 'Minimise'
        }),
        button('×', () => actions.closeApp(app.id), {
          class: 'win-btn win-btn-close',
          'aria-label': `Close ${app.title}`,
          title: 'Close'
        })
      )
    ),

    el('div', { class: 'win-body', 'data-win-scroll': app.id }, safeBody(app, ctx)),

    !maximized &&
      el('div', {
        class: 'win-grip',
        'aria-hidden': 'true',
        onPointerDown: (event) => startResize(event, win, actions)
      })
  );
}
