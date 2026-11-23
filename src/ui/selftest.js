/**
 * In-browser self test.
 *
 * `node --test` covers core/ on the build machine, but it cannot tell us whether
 * the bundled file actually runs on the locked-down machine. This does: it
 * re-checks the core invariants in the real browser, from the real single file,
 * and doubles as the smoke test to run after copying to a USB stick or OneDrive.
 *
 * Each check throws on failure; the runner catches and reports.
 */

import { createRng } from '../core/rng.js';
import { toTick, formatStamp, formatLogStamp, describeGap } from '../core/clock.js';
import { setIn, getIn, deepFreeze } from '../core/immutable.js';
import { isIpv4, ipToInt, intToIp } from '../core/validate.js';
import { createEvent, validateEvent } from '../core/world/events.js';
import {
  applyEvent,
  reduceWorld,
  createScratch,
  withEvent,
  commitScratch
} from '../core/world/reduce.js';
import { createSeed } from '../core/world/seed.js';
import { parseCidr } from '../core/net/cidr.js';
import { createStorage } from '../core/save/storage.js';
import { createSave, encodeSave, decodeSave, emptyPayload } from '../core/save/serialize.js';
import {
  selectDevices,
  selectSites,
  selectUsers,
  selectDeviceByIp,
  selectSubnetForIp,
  selectPrimaryIp,
  selectRow,
  selectUser,
  resolveDns
} from '../core/world/select.js';
import { storageStatus } from './crash.js';
import {
  createDesktop,
  openApp,
  toggleApp,
  moveApp,
  clampAll,
  tile,
  stack,
  focusedId,
  windowOf,
  isOpen,
  KEEP_VISIBLE,
  TITLEBAR_H
} from '../core/desktop/windows.js';
import { createApp } from './app.js';
import { APPS, OPENING_LAYOUT } from './apps/index.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function throws(fn, label) {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error(`${label} should have thrown but did not`);
}

const testWorld = () =>
  deepFreeze({
    tick: 0,
    net: {
      devices: {
        'rtr-1': {
          id: 'rtr-1',
          powered: true,
          interfaces: { 'ge-0/0/0': { name: 'ge-0/0/0', ip: '10.20.10.1', prefix: 24, up: true } }
        }
      },
      dns: { records: [] }
    },
    identity: { users: { 'u-dana': { id: 'u-dana', enabled: true, groups: ['staff'] } } }
  });

/**
 * A save layer that goes nowhere.
 *
 * The desktop checks below mount a real, working copy of the game in this
 * browser. Letting that copy write to storage would mean running the smoke test
 * could overwrite the player's actual progress with an empty save — the precise
 * accident this whole file exists to catch, caused by the tool meant to catch it.
 */
function throwawayStorage() {
  let held = null;
  return {
    write(save) {
      held = save;
      return { written: ['memory'], failed: [] };
    },
    read() {
      return held ? { ok: true, save: held, source: 'memory' } : { ok: false, error: 'nothing saved' };
    },
    status() {
      return [{ name: 'memory', available: true, error: null }];
    },
    durable() {
      return false;
    },
    clear() {
      held = null;
    }
  };
}

/** Mount a throwaway game into a detached element and return it with helpers. */
function mountThrowaway() {
  const host = document.createElement('div');
  const app = createApp(host, { storage: throwawayStorage() });
  app.start();

  const walk = (node, out = []) => {
    if (!node || node.nodeType !== 1) return out;
    out.push(node);
    for (const child of node.children || []) walk(child, out);
    return out;
  };

  return {
    host,
    app,
    nodes: () => walk(host),
    text: () => host.textContent,
    frame: (appId) => walk(host).find((node) => node.getAttribute && node.getAttribute('data-app') === appId),
    task: (appId) => walk(host).find((node) => node.getAttribute && node.getAttribute('data-task') === appId)
  };
}

const VIEW = { width: 1280, height: 616 };

const CHECKS = [
  {
    group: 'determinism',
    name: 'seeded generator repeats exactly',
    run() {
      const a = createRng('meridian');
      const b = createRng('meridian');
      for (let i = 0; i < 100; i++) assert(a.next() === b.next(), 'sequences diverged');
    }
  },
  {
    group: 'determinism',
    name: 'shuffle never mutates its input',
    run() {
      const source = [1, 2, 3, 4, 5];
      const copy = [...source];
      createRng('shuffle').shuffle(source);
      assert(JSON.stringify(source) === JSON.stringify(copy), 'source array changed');
    }
  },
  {
    group: 'determinism',
    name: 'generator state survives a round-trip',
    run() {
      const rng = createRng('state');
      for (let i = 0; i < 5; i++) rng.next();
      const snapshot = rng.state();
      const expected = rng.next();
      assert(createRng(0).restore(snapshot).next() === expected, 'restore did not resume');
    }
  },
  {
    group: 'time',
    name: 'world clock formats and round-trips',
    run() {
      const tick = toTick('2026-03-05T09:07:03.000Z');
      assert(formatStamp(tick) === '2026-03-05 09:07:03', `got ${formatStamp(tick)}`);
      assert(formatLogStamp(tick) === 'Mar  5 09:07:03', `got ${formatLogStamp(tick)}`);
      assert(describeGap(3725) === '1h 2m', `got ${describeGap(3725)}`);
    }
  },
  {
    group: 'immutability',
    name: 'nested writes share untouched branches',
    run() {
      const before = testWorld();
      const after = setIn(before, ['net', 'devices', 'rtr-1', 'powered'], false);
      assert(after !== before, 'returned the same object');
      assert(after.identity === before.identity, 'untouched branch was rebuilt');
      assert(getIn(before, ['net', 'devices', 'rtr-1', 'powered']) === true, 'original changed');
    }
  },
  {
    group: 'immutability',
    name: 'a frozen world rejects direct writes',
    run() {
      const world = testWorld();
      throws(() => {
        world.tick = 99;
      }, 'writing to a frozen world');
    }
  },
  {
    group: 'validation',
    name: 'IPv4 parsing accepts and rejects correctly',
    run() {
      assert(isIpv4('10.20.30.40'), 'rejected a valid address');
      assert(!isIpv4('10.20.30.256'), 'accepted an out-of-range octet');
      assert(!isIpv4('10.00.0.1'), 'accepted a padded octet');
      assert(intToIp(ipToInt('192.168.1.1')) === '192.168.1.1', 'address round-trip failed');
    }
  },
  {
    group: 'events',
    name: 'malformed events are refused',
    run() {
      throws(() => createEvent('net/not-a-real-event', {}), 'unknown event type');
      throws(() => createEvent('net/device-power', { deviceId: 'rtr-1' }), 'missing payload field');
      throws(() => validateEvent({ type: 'world/tick', at: 0 }), 'event with no payload');
    }
  },
  {
    group: 'events',
    name: 'events are frozen and JSON-safe',
    run() {
      const event = createEvent('net/device-power', { deviceId: 'rtr-1', on: false }, 60);
      assert(Object.isFrozen(event), 'event was not frozen');
      const round = JSON.parse(JSON.stringify(event));
      assert(round.type === event.type && round.at === 60, 'event did not survive JSON');
    }
  },
  {
    group: 'world',
    name: 'reducing a log equals applying it step by step',
    run() {
      const log = [
        createEvent('world/tick', {}, 60),
        createEvent('net/device-power', { deviceId: 'rtr-1', on: false }, 120),
        createEvent('identity/user-group-add', { userId: 'u-dana', group: 'vpn' }, 180)
      ];
      const stepwise = log.reduce((world, event) => applyEvent(world, event), testWorld());
      const folded = reduceWorld(testWorld(), log);
      assert(JSON.stringify(folded) === JSON.stringify(stepwise), 'replay disagreed');
      assert(folded.tick === 180, `clock ended at ${folded.tick}`);
    }
  },
  {
    group: 'world',
    name: 'the clock never runs backwards',
    run() {
      const late = applyEvent(testWorld(), createEvent('world/tick', {}, 900));
      const early = applyEvent(late, createEvent('world/tick', {}, 30));
      assert(early.tick === 900, `clock rewound to ${early.tick}`);
    }
  },
  {
    group: 'world',
    name: 'a committed scratch equals a fresh replay',
    run() {
      const base = testWorld();
      const scratch = withEvent(
        withEvent(createScratch(base), createEvent('world/tick', {}, 60)),
        createEvent('net/device-power', { deviceId: 'rtr-1', on: false }, 90)
      );
      const { world, events } = commitScratch(scratch);
      assert(
        JSON.stringify(world) === JSON.stringify(reduceWorld(base, events)),
        'commit and replay disagreed'
      );
      assert(getIn(base, ['net', 'devices', 'rtr-1', 'powered']) === true, 'base was mutated');
    }
  },
  {
    group: 'world',
    name: 'events naming a missing target are refused',
    run() {
      throws(
        () => applyEvent(testWorld(), createEvent('net/device-power', { deviceId: 'ghost', on: true })),
        'powering a device that does not exist'
      );
    }
  },
  {
    group: 'company',
    name: 'Meridian Logistics loads',
    run() {
      const seed = createSeed();
      assert(selectSites(seed).length >= 2, 'expected at least two sites');
      assert(selectDevices(seed).length >= 12, 'expected at least a dozen devices');
      assert(selectUsers(seed).length >= 5, 'expected at least five people');
      assert(Object.isFrozen(seed), 'the seed should be frozen');
    }
  },
  {
    group: 'company',
    name: 'subnet arithmetic is right',
    run() {
      const net = parseCidr('10.20.10.0/24');
      assert(net.broadcast === '10.20.10.255', `broadcast was ${net.broadcast}`);
      assert(net.usable === 254, `usable was ${net.usable}`);
      assert(parseCidr('172.16.0.0/30').usable === 2, 'a /30 should have 2 usable addresses');
      assert(parseCidr('10.0.0.5/32').usable === 1, 'a /32 is one host');
    }
  },
  {
    group: 'company',
    name: 'every lens tells the same story about one host',
    run() {
      const seed = createSeed();

      const record = resolveDns(seed, 'dc01.meridian.local');
      assert(record, 'dc01 does not resolve');

      const hit = selectDeviceByIp(seed, record.value);
      assert(hit, `nothing holds ${record.value}`);
      assert(hit.device.id === 'srv-dc01', `DNS points at ${hit.device.id}`);

      const subnet = selectSubnetForIp(seed, record.value);
      assert(subnet && subnet.id === 'net-hq-srv', 'the address landed on the wrong subnet');
      assert(subnet.siteId === hit.device.siteId, 'the subnet and the device disagree about the site');
    }
  },
  {
    group: 'saving',
    name: 'progress survives a write and a read',
    run() {
      // A separate namespace, so this never touches real progress.
      const storage = createStorage({ namespace: 'nightshift.selftest' });
      try {
        const payload = emptyPayload();
        payload.progress.xp = 1234;
        const written = storage.write(
          createSave(payload, { savedAt: new Date().toISOString(), origin: location.href })
        );
        assert(written.written.length > 0, 'nothing would accept the save');

        const back = storage.read();
        assert(back.ok, back.error || 'the save could not be read back');
        assert(back.save.data.progress.xp === 1234, `read back ${back.save.data.progress.xp}`);
      } finally {
        storage.clear();
      }
    }
  },
  {
    group: 'saving',
    name: 'there is somewhere durable to save',
    run() {
      const storage = createStorage({ namespace: 'nightshift.selftest' });
      const usable = storage.status().filter((tier) => tier.available).map((tier) => tier.name);
      assert(
        storage.durable(),
        `only ${usable.join(', ')} is available — progress would be lost when this tab closes, so export a save file often`
      );
    }
  },
  {
    group: 'saving',
    name: 'a damaged save is refused rather than loaded wrong',
    run() {
      const good = createSave(emptyPayload(), { savedAt: '2026-03-02T09:00:00.000Z' });
      const tampered = JSON.parse(encodeSave(good));
      tampered.data.progress.xp = 999999;

      const result = decodeSave(JSON.stringify(tampered));
      assert(!result.ok, 'a corrupted save was accepted');
      assert(/corrupt|checksum/i.test(result.error), `unhelpful message: ${result.error}`);
      assert(decodeSave('{"half written').ok === false, 'truncated text was accepted');
    }
  },
  {
    group: 'saving',
    name: 'a corrupted copy falls back to the one before it',
    run() {
      const store = new Map();
      const backend = {
        getItem: (key) => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => store.set(key, String(value)),
        removeItem: (key) => store.delete(key)
      };
      const tiers = [{ name: 'disk', get: () => backend }];

      const older = emptyPayload();
      older.progress.xp = 10;
      const newer = emptyPayload();
      newer.progress.xp = 20;

      const first = createStorage({ tiers, namespace: 'nightshift.selftest' });
      first.write(createSave(older, { savedAt: '2026-03-02T09:00:00.000Z' }));
      first.write(createSave(newer, { savedAt: '2026-03-02T10:00:00.000Z' }));

      for (const [key, value] of store) {
        if (value.indexOf('"xp":20') !== -1) store.set(key, value.slice(0, 40));
      }

      // A fresh instance, the way a page reload starts with no memory copy.
      const result = createStorage({ tiers, namespace: 'nightshift.selftest' }).read();
      assert(result.ok, 'nothing was recovered');
      assert(result.save.data.progress.xp === 10, `recovered ${result.save.data.progress.xp}`);
    }
  },
  {
    group: 'company',
    name: 'the records agree with the network',
    run() {
      const seed = createSeed();
      const asset = selectRow(seed, 'assets', 'A-1005');
      assert(asset, 'asset A-1005 is missing');

      const owner = selectUser(seed, asset.owner);
      assert(owner && owner.login === 'mchen', 'the scanner has the wrong owner');

      const ip = selectPrimaryIp(seed, asset.hostId);
      assert(ip, `${asset.hostId} has no address`);
      assert(
        selectDeviceByIp(seed, ip).device.id === asset.hostId,
        'the asset row and the device list disagree'
      );
    }
  },

  /* ---------- the desktop, in this browser ---------- */

  {
    group: 'desktop',
    name: 'a window can never be dragged out of reach',
    run() {
      let desk = openApp(createDesktop(), 'mail', { x: 40, y: 40, w: 520, h: 400 }, VIEW);

      for (const [x, y] of [[9999, 9999], [-9999, -9999], [NaN, NaN], [0, VIEW.height * 4]]) {
        desk = moveApp(desk, 'mail', x, y, VIEW);
        const win = windowOf(desk, 'mail');
        assert(win.x + win.w >= KEEP_VISIBLE, `x ${win.x} left nothing to grab`);
        assert(win.x <= VIEW.width - KEEP_VISIBLE, `x ${win.x} is off the right edge`);
        assert(win.y >= 0 && win.y <= VIEW.height - TITLEBAR_H, `y ${win.y} put the title bar off screen`);
      }
    }
  },
  {
    group: 'desktop',
    name: 'a smaller screen pulls every window back in',
    run() {
      let desk = openApp(createDesktop(), 'mail', { x: 900, y: 500, w: 600, h: 400 }, VIEW);
      desk = openApp(desk, 'terminal', { x: 1100, y: 560, w: 500, h: 300 }, VIEW);

      const small = { width: 760, height: 480 };
      for (const win of stack(clampAll(desk, small))) {
        assert(win.x <= small.width - KEEP_VISIBLE, `${win.appId} is off the right edge`);
        assert(win.y <= small.height - TITLEBAR_H, `${win.appId} title bar is off screen`);
      }
    }
  },
  {
    group: 'desktop',
    name: 'a taskbar click opens, minimises and restores',
    run() {
      const box = { x: 40, y: 40, w: 520, h: 400 };
      let desk = toggleApp(createDesktop(), 'mail', box, VIEW);
      assert(focusedId(desk) === 'mail', 'the first click did not open it');

      desk = toggleApp(desk, 'mail', box, VIEW);
      assert(isOpen(desk, 'mail'), 'minimising closed it instead');
      assert(windowOf(desk, 'mail').minimized, 'the second click did not minimise it');

      desk = toggleApp(desk, 'mail', box, VIEW);
      assert(!windowOf(desk, 'mail').minimized && focusedId(desk) === 'mail', 'it would not come back');
    }
  },
  {
    group: 'desktop',
    name: 'the opening layout puts two windows side by side',
    run() {
      const desk = tile(createDesktop(), OPENING_LAYOUT, VIEW);
      const [left, right] = stack(desk).sort((a, b) => a.x - b.x);

      assert(left && right, 'the opening layout did not produce two windows');
      assert(left.x + left.w <= right.x, 'the opening windows overlap');
      assert(right.x + right.w <= VIEW.width, 'the right-hand window runs off the screen');
    }
  },
  {
    group: 'desktop',
    name: 'the game mounts and draws in this browser',
    run() {
      const game = mountThrowaway();
      const text = game.text();

      assert(/Meridian Logistics/.test(text), 'the top bar did not render');
      assert(game.frame('mail'), 'Mail did not open');
      assert(game.frame('terminal'), 'the Terminal did not open');
      assert(/operator@/.test(text), 'the terminal has no prompt');
    }
  },
  {
    group: 'desktop',
    name: 'every app opens without throwing',
    run() {
      const game = mountThrowaway();

      for (const app of APPS) {
        const button = game.task(app.id);
        assert(button, `no taskbar button for ${app.id}`);

        // Click until it is on screen: open, or raise, or restore.
        for (let attempt = 0; attempt < 3 && !game.frame(app.id); attempt++) button.click();
        assert(game.frame(app.id), `${app.id} would not open`);
      }
    }
  },
  {
    group: 'desktop',
    name: 'the terminal accepts a command before any ticket is opened',
    run() {
      const game = mountThrowaway();
      const input = game.nodes().find((node) => node.getAttribute && node.getAttribute('data-focus') === 'true');
      assert(input, 'no terminal input on screen');

      input.value = 'ping -c 1 srv-dc01';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

      assert(/64 bytes from/.test(game.text()), 'the terminal produced no output');
    }
  }
];

function runChecks() {
  return CHECKS.map((check) => {
    try {
      check.run();
      return { ...check, ok: true, detail: '' };
    } catch (error) {
      return { ...check, ok: false, detail: (error && error.message) || String(error) };
    }
  });
}

function row(result) {
  const line = document.createElement('div');
  line.className = 'st-row';

  const badge = document.createElement('span');
  badge.className = `st-badge ${result.ok ? 'ok' : 'bad'}`;
  badge.textContent = result.ok ? 'PASS' : 'FAIL';

  const name = document.createElement('span');
  name.className = 'st-name';
  name.textContent = result.name;

  const detail = document.createElement('span');
  detail.className = 'st-detail';
  detail.textContent = result.detail;

  line.append(badge, name, detail);
  return line;
}

/** Render the self test into `host`. Returns the results, for callers that care. */
export function mountSelfTest(host, meta = {}) {
  const results = runChecks();
  const failed = results.filter((r) => !r.ok);

  host.textContent = '';

  const header = document.createElement('header');
  header.className = 'st-header';

  const title = document.createElement('h1');
  // Built from text nodes rather than innerHTML, so "this game never parses
  // markup from a string" stays an invariant that grep can confirm.
  const shift = document.createElement('span');
  shift.textContent = 'SHIFT';
  title.append(document.createTextNode('NIGHT '), shift);

  const sub = document.createElement('p');
  sub.className = 'st-sub';
  sub.textContent = `build ${meta.version || '0.0.0'} · core self test`;

  header.append(title, sub);

  const verdict = document.createElement('div');
  verdict.className = `st-verdict ${failed.length ? 'bad' : 'ok'}`;
  verdict.textContent = failed.length
    ? `${failed.length} of ${results.length} checks failed`
    : `all ${results.length} checks passed`;

  const card = document.createElement('div');
  card.className = 'st-card';

  let lastGroup = null;
  for (const result of results) {
    if (result.group !== lastGroup) {
      const heading = document.createElement('div');
      heading.className = 'st-group';
      heading.textContent = result.group;
      card.append(heading);
      lastGroup = result.group;
    }
    card.append(row(result));
  }

  const env = document.createElement('p');
  env.className = 'st-env';
  env.textContent = `storage: ${storageStatus()} · ${location.protocol} · ${location.href}`;

  host.append(header, verdict, card, env);
  return results;
}
