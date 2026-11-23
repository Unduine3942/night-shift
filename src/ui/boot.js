/**
 * Entry point. esbuild bundles from here.
 *
 * Order matters: the crash handler goes on before anything else can throw, so a
 * failure during start-up still produces a readable panel rather than a blank
 * page. There are no devtools on the machine this runs on, so a white screen is
 * unrecoverable and the panel is the only diagnostic there will ever be.
 *
 * `#selftest` in the URL hash opens the in-browser assertion suite instead of the
 * game. That is the smoke test that can be run on the locked-down machine itself.
 */

import { installCrashHandler, showCrash } from './crash.js';
import { mountSelfTest } from './selftest.js';
import { createApp } from './app.js';

const VERSION = '0.1.0';
const META = { version: VERSION };

installCrashHandler(META);

function wantsSelfTest() {
  try {
    return location.hash.toLowerCase().indexOf('selftest') !== -1;
  } catch {
    return false;
  }
}

try {
  const host = document.getElementById('app');
  if (!host) throw new Error('boot: #app is missing from the page');

  if (wantsSelfTest()) {
    mountSelfTest(host, META);
  } else {
    createApp(host).start();
  }
} catch (error) {
  showCrash('Failed to start', error, META);
}
