/**
 * Last-resort error surface.
 *
 * On the target machine devtools may be disabled by policy, so an uncaught error
 * would otherwise be a white screen with no way to find out anything. This turns
 * any crash into a readable panel plus a one-click diagnostics dump the player can
 * paste back to me.
 *
 * It deliberately uses nothing clever: no framework, no modules of ours beyond
 * plain DOM, so it still works when the thing that broke is our own code.
 */

const CRASH_ID = 'crash';
const APP_ID = 'app';

/** Probe browser storage without ever letting it throw upward. */
export function storageStatus() {
  try {
    const probe = '__nightshift_probe__';
    window.localStorage.setItem(probe, '1');
    const ok = window.localStorage.getItem(probe) === '1';
    window.localStorage.removeItem(probe);
    return ok ? 'available' : 'unreliable (wrote a value, read something else)';
  } catch (error) {
    return `blocked (${(error && error.name) || 'unknown'})`;
  }
}

function errorText(error) {
  if (!error) return '(no detail)';
  if (typeof error === 'string') return error;
  if (error.stack) return String(error.stack);
  if (error.message) return `${error.name || 'Error'}: ${error.message}`;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function diagnostics(label, error, meta) {
  return [
    `Night Shift ${meta.version || '(unknown version)'}`,
    `when     ${new Date().toISOString()}`,
    `where    ${location.href}`,
    `browser  ${navigator.userAgent}`,
    `storage  ${storageStatus()}`,
    `viewport ${window.innerWidth}x${window.innerHeight}`,
    '',
    `problem  ${label}`,
    errorText(error)
  ].join('\n');
}

function copyToClipboard(text, button) {
  const restore = (message) => {
    button.textContent = message;
    setTimeout(() => {
      button.textContent = 'Copy diagnostics';
    }, 2500);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      () => restore('Copied'),
      () => restore('Could not copy — select the text above')
    );
    return;
  }
  restore('Could not copy — select the text above');
}

/** Replace the screen with the crash panel. Safe to call more than once. */
export function showCrash(label, error, meta = {}) {
  const host = document.getElementById(CRASH_ID);
  if (!host) return;

  const app = document.getElementById(APP_ID);
  if (app) app.hidden = true;

  const report = diagnostics(label, error, meta);

  host.textContent = '';
  host.hidden = false;

  const title = document.createElement('b');
  title.textContent = 'Night Shift hit a problem and stopped.';

  const lead = document.createElement('div');
  lead.textContent = 'Copy the details below and send them to me. Then try one of the buttons.';

  const pre = document.createElement('pre');
  pre.textContent = report;

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = 'Copy diagnostics';
  copy.addEventListener('click', () => copyToClipboard(report, copy));

  host.append(title, lead, pre, copy, recoveryActions(report));
}

/**
 * A way out.
 *
 * Without this the panel is a dead end, and that is what turns any crash into a
 * permanent lockout: the state that caused it is already in storage, so every
 * reload reproduces it and there is no screen left from which to clear it.
 *
 * Reloading is offered first because most failures are transient. Clearing
 * stored progress is last, behind a confirmation, and only after the player has
 * been given the chance to copy their save out — which is why the save text is
 * shown rather than just discarded.
 */
function recoveryActions(report) {
  const row = document.createElement('div');
  row.className = 'crash-actions';

  const reload = document.createElement('button');
  reload.type = 'button';
  reload.textContent = 'Reload the page';
  reload.addEventListener('click', () => {
    try {
      location.reload();
    } catch {
      /* nothing else to try */
    }
  });

  const rescue = document.createElement('button');
  rescue.type = 'button';
  rescue.textContent = 'Show my save so I can copy it';
  rescue.addEventListener('click', () => {
    const area = document.createElement('textarea');
    area.rows = 8;
    area.readOnly = true;
    area.value = readStoredSave() || 'No stored progress was found in this browser.';
    rescue.replaceWith(area);
    area.focus();
    area.select();
  });

  const wipe = document.createElement('button');
  wipe.type = 'button';
  wipe.textContent = 'Clear stored progress and start fresh';
  wipe.addEventListener('click', () => {
    if (wipe.dataset.armed !== 'yes') {
      wipe.dataset.armed = 'yes';
      wipe.textContent = 'Really clear it? This cannot be undone';
      return;
    }
    clearStoredSave();
    wipe.textContent = 'Cleared — reload the page';
    wipe.disabled = true;
  });

  row.append(reload, rescue, wipe);
  return row;
}

/** Reads storage directly: whatever crashed, this must still work. */
function readStoredSave() {
  for (const name of ['localStorage', 'sessionStorage']) {
    for (const slot of ['current', 'previous']) {
      try {
        const text = window[name].getItem(`nightshift.save.${slot}`);
        if (text) return text;
      } catch {
        /* try the next one */
      }
    }
  }
  return null;
}

function clearStoredSave() {
  for (const name of ['localStorage', 'sessionStorage']) {
    for (const slot of ['current', 'previous']) {
      try {
        window[name].removeItem(`nightshift.save.${slot}`);
      } catch {
        /* a tier that will not clear is not worth failing over */
      }
    }
  }
}

/** Catch everything that escapes, including rejected promises. */
export function installCrashHandler(meta = {}) {
  window.addEventListener('error', (event) => {
    showCrash('Uncaught error', event.error || event.message, meta);
  });

  window.addEventListener('unhandledrejection', (event) => {
    showCrash('Unhandled promise rejection', event.reason, meta);
  });
}
