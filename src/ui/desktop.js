/**
 * The desktop: wallpaper, the windows on it, and the two bars.
 *
 * Narrow screens get a different shape entirely. Below the threshold there is no
 * room to have two windows side by side and nowhere to drag them to, so the
 * focused window fills the working area and the taskbar becomes the only way to
 * switch. That is not a degraded desktop, it is the right interface for the size
 * — and it means the game is still usable if the target machine turns out to be
 * a 1366×768 laptop with a zoom level set by policy.
 */

import { el } from './dom.js';
import { topBar, taskbar } from './taskbar.js';
import { windowFrame } from './window.js';
import { appById } from './apps/index.js';
import { stack, focusedId, isNarrow } from '../core/desktop/windows.js';

function emptyDesktop(ctx) {
  return el(
    'div',
    { class: 'desk-empty' },
    el('p', { class: 'desk-empty-title' }, 'Nothing open'),
    el('p', { class: 'muted' }, 'Pick an app from the bar along the bottom.')
  );
}

export function desktop(ctx) {
  const narrow = isNarrow(ctx.viewport);
  const onTop = focusedId(ctx.desktop);
  const windows = stack(ctx.desktop).filter((win) => !win.minimized);

  // On a narrow screen only the focused window is drawn, at full size. Drawing
  // the others behind it would be several hundred elements nobody can see.
  const drawn = narrow ? windows.filter((win) => win.appId === onTop) : windows;

  const frames = drawn
    .map((win) => {
      const app = appById(win.appId);
      // A window for an app this build no longer has is dropped rather than
      // drawn as a hole. It can only come from a layout written by an older
      // build, and there is nothing useful to show.
      return app ? windowFrame(app, win, win.appId === onTop, narrow, ctx) : null;
    })
    .filter(Boolean);

  return el(
    'div',
    { class: `desk${narrow ? ' desk-narrow' : ''}` },
    topBar(ctx),
    el(
      'div',
      { class: 'desk-area', 'data-desk': 'true' },
      frames.length === 0 ? emptyDesktop(ctx) : frames
    ),
    taskbar(ctx)
  );
}
