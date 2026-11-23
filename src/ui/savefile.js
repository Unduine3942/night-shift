/**
 * The durable copy.
 *
 * Browser storage on the target is governed by `DefaultCookiesSetting = SessionOnly`,
 * so it may be wiped whenever Edge closes. A file the player holds is the only
 * copy nothing can take away, and it is also how progress moves between the USB
 * stick and the OneDrive folder, which are separate origins with separate storage.
 *
 * Every route out is tried in turn, because enterprise policy can close any one
 * of them:
 *   1. a real file download  (blocked by DownloadRestrictions = 3)
 *   2. the clipboard          (blocked by clipboard policy)
 *   3. a textarea to select and copy by hand (blocked by nothing)
 *
 * The third always works, which is the point — export can degrade, never fail.
 */

import { encodeSave, decodeSave } from '../core/save/serialize.js';

/** nightshift-save-2026-03-02.json */
export function saveFilename(savedAt) {
  const day = typeof savedAt === 'string' && savedAt.length >= 10 ? savedAt.slice(0, 10) : 'progress';
  return `nightshift-save-${day}.json`;
}

/** Route 1: a real file. Must be called from inside a click handler. */
export function downloadSave(save, filename) {
  try {
    const text = encodeSave(save);
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || saveFilename(save.meta && save.meta.savedAt);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return { ok: true, method: 'download' };
  } catch (error) {
    return { ok: false, method: 'download', error: String((error && error.message) || error) };
  }
}

/** Route 2: the clipboard, with the old execCommand path as a second chance. */
export async function copySaveToClipboard(save) {
  const text = encodeSave(save);

  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return { ok: true, method: 'clipboard' };
    } catch {
      /* fall through to the older route */
    }
  }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const worked = document.execCommand('copy');
    area.remove();
    return worked
      ? { ok: true, method: 'clipboard-legacy' }
      : { ok: false, method: 'clipboard', error: 'the browser refused to copy' };
  } catch (error) {
    return { ok: false, method: 'clipboard', error: String((error && error.message) || error) };
  }
}

/**
 * Try every route out, in order of how pleasant it is.
 * Route 3 is not attempted here — it is the caller showing the text on screen,
 * which is why this always reports what to fall back to.
 */
export async function exportSave(save, options = {}) {
  const downloaded = downloadSave(save, options.filename);
  if (downloaded.ok) return downloaded;

  const copied = await copySaveToClipboard(save);
  if (copied.ok) return { ...copied, note: 'Downloads are blocked here, so the save was copied to your clipboard instead.' };

  return {
    ok: false,
    method: 'manual',
    error: 'Neither downloading nor copying is allowed here.',
    text: encodeSave(save)
  };
}

/**
 * Ask for a file and read it back.
 * Resolves rather than rejects, because "they closed the dialog" is not an error.
 * @returns {Promise<{ok: boolean, save?: object, error?: string, warning?: string, cancelled?: boolean}>}
 */
export function importSaveFromFile(options = {}) {
  return new Promise((resolve) => {
    let input;
    try {
      input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json,text/plain';
      input.style.display = 'none';
    } catch (error) {
      resolve({ ok: false, error: 'This browser will not open a file picker.' });
      return;
    }

    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      input.remove();

      if (!file) {
        resolve({ ok: false, cancelled: true, error: 'No file was chosen.' });
        return;
      }

      const reader = new FileReader();
      reader.onload = () => resolve(importSaveFromText(String(reader.result), options));
      reader.onerror = () => resolve({ ok: false, error: `Could not read ${file.name}.` });
      reader.readAsText(file);
    });

    document.body.appendChild(input);
    input.click();
  });
}

/** For pasted text — the other half of the clipboard route. */
export function importSaveFromText(text, options = {}) {
  const decoded = decodeSave(text, options);
  if (!decoded.ok) return { ok: false, error: decoded.error };
  return {
    ok: true,
    save: decoded.save,
    warning: decoded.warning,
    needsMigration: decoded.needsMigration
  };
}

/**
 * Where a save came from, so we can tell a player whose storage looks empty
 * that their old progress is under a different drive letter or folder.
 */
export function describeOrigin(save) {
  const origin = save && save.meta && save.meta.origin;
  if (!origin) return 'an unknown location';
  if (origin === location.href) return 'this same file';
  return origin;
}
