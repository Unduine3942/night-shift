/**
 * The strip along the top and the strip along the bottom.
 *
 * The top bar is who you are and how the shift is going. The bottom bar is the
 * apps. Between them they hold the two facts the player needs at all times and
 * should never have to go looking for: how far through the rank they are, and
 * whether their progress is actually being saved.
 *
 * The storage line is in the top bar, at full size, in colour. On the target
 * machine it is the single most consequential sentence on the screen, and
 * burying it in a settings panel is how somebody loses an evening.
 */

import { el, button } from './dom.js';
import { tierName } from '../content/tiers.js';
import { APPS } from './apps/index.js';
import { isOpen, focusedId, windowOf } from '../core/desktop/windows.js';

export function topBar(ctx) {
  const { stats, durability, clock } = ctx;
  const pct = stats.tierTotal === 0 ? 0 : Math.round((stats.tierCompleted / stats.tierTotal) * 100);

  return el(
    'header',
    { class: 'topbar' },

    el(
      'div',
      { class: 'topbar-identity' },
      el('span', { class: 'topbar-company' }, 'Meridian Logistics'),
      el('span', { class: 'topbar-rank' }, `${tierName(stats.tier)} · night shift`)
    ),

    el(
      'div',
      { class: 'topbar-progress' },
      el(
        'div',
        { class: 'topbar-bar', role: 'img', 'aria-label': `${pct}% through this rank` },
        el('div', { class: 'topbar-bar-fill', style: `width:${pct}%` })
      ),
      el('span', { class: 'topbar-counts' }, `${stats.tierCompleted}/${stats.tierTotal} · ${stats.xp} XP`)
    ),

    el('p', { class: `hud-storage hud-storage-${durability.level}` }, durability.text),

    el('span', { class: 'topbar-clock', title: 'Shift time — it moves when you close work' }, clock.label)
  );
}

function taskButton(app, ctx) {
  const { desktop, actions } = ctx;
  const open = isOpen(desktop, app.id);
  const win = windowOf(desktop, app.id);
  const focused = focusedId(desktop) === app.id;
  const badge = typeof app.badge === 'function' ? app.badge(ctx) : null;

  const classes = ['task'];
  if (open) classes.push('task-open');
  if (focused) classes.push('task-focused');
  if (win && win.minimized) classes.push('task-min');

  return el(
    'button',
    {
      type: 'button',
      class: classes.join(' '),
      'data-task': app.id,
      'aria-pressed': focused ? 'true' : 'false',
      title: app.title,
      onClick: () => actions.toggleApp(app.id)
    },
    el('span', { class: `task-dot win-dot-${app.id}` }),
    el('span', { class: 'task-label' }, app.short || app.title),
    badge !== null && badge !== undefined && el('span', { class: 'task-badge' }, String(badge))
  );
}

export function taskbar(ctx) {
  return el(
    'footer',
    { class: 'taskbar', role: 'toolbar', 'aria-label': 'Open applications' },
    el('div', { class: 'taskbar-apps' }, APPS.map((app) => taskButton(app, ctx))),
    el(
      'div',
      { class: 'taskbar-right' },
      button('Tidy up', () => ctx.actions.tidyDesktop(), {
        class: 'task task-quiet',
        title: 'Put Mail and the Terminal back side by side'
      })
    )
  );
}
