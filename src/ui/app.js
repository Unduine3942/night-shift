/**
 * The app — state, actions, and one render function.
 *
 * Everything that decides anything lives in core/ and is node-tested. This file
 * holds the state machine that strings those decisions into a shift: read the
 * mail, work a ticket at the terminal, check it in, drill in Training, look
 * things up in the Manual, clock out.
 *
 * The screen is a desktop of windows rather than one page at a time, because the
 * work it is imitating is: you read the complaint and you work the box, both at
 * once. Which window a ticket appears in is declared by its engine (see
 * `surfaceOf`), never decided here.
 *
 * Derived values are recomputed on every render rather than cached. The world is
 * a fold over a few dozen events and the catalogue is a handful of missions, so
 * it costs nothing — and a cache is one more thing that can disagree with the
 * save, which is the failure this whole design is arranged to avoid.
 */

import { el, button, render } from './dom.js';
import { createStore } from './store.js';
import { createPersistence } from './persist.js';
import { desktop as drawDesktop } from './desktop.js';
import { APP, OPENING_LAYOUT } from './apps/index.js';

import { MISSIONS, missionById } from '../content/missions/index.js';
import { PRACTICE } from '../content/practice.js';
import { CARDS, CARD_IDS, cardsForConcepts } from '../content/cards.js';
import { partitionByEngine, surfaceOf } from '../engines/registry.js';

import { createSeed } from '../core/world/seed.js';
import { reduceWorld } from '../core/world/reduce.js';
import { availableMissions } from '../core/missions/progression.js';
import {
  beginMission,
  missionWorld as worldOf,
  emitToMission,
  answerInMission,
  runInMission,
  isMissionSolved,
  resetMission,
  finishMission
} from '../core/missions/runtime.js';
import { HOST } from '../content/world/contract.js';
import { createProgress, recordCompletion, playerOf, progressStats, tierOf } from '../core/game/progress.js';
import { shiftClock } from '../core/game/shift.js';
import {
  createDesktop,
  openApp,
  closeApp,
  focusApp,
  minimizeApp,
  toggleApp,
  moveApp,
  resizeApp,
  clampAll,
  cascadeAt,
  tile,
  isOpen,
  windowOf,
  focusedId,
  isNarrow
} from '../core/desktop/windows.js';
import {
  createDeck,
  introduce,
  pruneDeck,
  dueCards,
  review as gradeCard,
  endSession,
  deckStats
} from '../core/srs/scheduler.js';
import { createRng, hashString } from '../core/rng.js';
import { exportSave, importSaveFromFile, importSaveFromText } from './savefile.js';

/** How many cards one sitting should ask for. Long enough to matter, short enough to finish. */
const REVIEW_BATCH = 8;

const { playable: PLAYABLE, pending: PENDING } = partitionByEngine(MISSIONS);

/**
 * Rank and progress are measured against the missions this build can actually
 * run, not the whole catalogue.
 *
 * Measuring against everything looks more honest and is in fact a trap: a rank
 * that needs three quarters of its tier cleared can never be earned while some
 * of that tier is waiting on an unbuilt tool, so the player runs out of tickets
 * and the queue simply stops. Promotion has to be earned from work that is
 * possible.
 */
const RANKED = PLAYABLE;

/** The machine the night desk sits at. Terminal tickets log in from here. */
const WORKSTATION = HOST.PC_IT.id;

const NO_TERMINAL = Object.freeze({ draft: '', historyIndex: null, hint: null });

/** Elements that hold a caret, and must never have it taken away by a redraw. */
const TEXT_FIELDS = /^(INPUT|TEXTAREA|SELECT)$/;

/** A safe guess before the real window has been measured. */
const FALLBACK_VIEWPORT = Object.freeze({ width: 1280, height: 720 });

/**
 * The desk area, not the whole page: the two bars are outside it, and a window
 * placed against the full height would sit under the taskbar with its own
 * buttons unreachable.
 */
const BAR_SPACE = 104;

function now() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function measureViewport() {
  try {
    const width = Math.max(320, Number(window.innerWidth) || FALLBACK_VIEWPORT.width);
    const height = Math.max(240, (Number(window.innerHeight) || FALLBACK_VIEWPORT.height) - BAR_SPACE);
    return { width, height };
  } catch {
    return FALLBACK_VIEWPORT;
  }
}

/**
 * @param host     the element to render into
 * @param options  `options.storage` substitutes the save layer. The self test
 *                 uses it to mount a throwaway desktop in the real browser
 *                 WITHOUT touching the player's actual progress — running a
 *                 smoke test must never be able to cost somebody their save.
 */
export function createApp(host, options = {}) {
  const persistence = createPersistence(
    {
      missionIds: MISSIONS.map((mission) => mission.id),
      cardIds: CARD_IDS
    },
    options.storage ? { storage: options.storage } : {}
  );

  const loaded = persistence.load();
  const startProgress = loaded.found ? loaded.progress : createProgress();
  const viewport = measureViewport();

  const store = createStore({
    progress: startProgress,
    // Reconciled against this build's content before anything can render it.
    deck: syncDeck(loaded.found ? loaded.deck : createDeck(), startProgress),
    desktop: tile(createDesktop(), OPENING_LAYOUT, viewport),
    viewport,
    session: null,
    practice: null,
    attempted: false,
    solved: false,
    hintsShown: 0,
    debrief: null,
    review: null,
    trainingTab: 'drills',
    // The Manual opens on the command walkthroughs, because that is what a
    // player who does not yet know the toolkit needs first.
    manualTab: 'commands',
    manualCommand: null,
    terminal: NO_TERMINAL,
    notice: loaded.warnings.length > 0 ? loaded.warnings.join(' ') : null,
    transfer: null,
    pasting: false,
    pasteText: '',
    confirmingReset: false
  });

  /* ---------- derived ---------- */

  function derive(state) {
    const world = reduceWorld(createSeed(), state.progress.events);
    const player = playerOf(state.progress, RANKED);
    const closed = new Set(player.completed);
    const open = availableMissions(PLAYABLE, player);
    const waiting = PENDING.filter((mission) => mission.tier <= player.tier && !closed.has(mission.id));

    const activeSurface = state.session ? surfaceOf(state.session.mission) : null;

    // The terminal draws the ticket's session when one is being worked at the
    // terminal, and the practice session otherwise — so the window is never
    // empty and there is only ever one shell on screen.
    const shellSession = activeSurface === 'mail' ? state.session : state.practice;

    return {
      state,
      world,
      player,
      stats: progressStats(state.progress, RANKED),
      clock: shiftClock(state.progress.completed.length),

      inbox: open.filter((mission) => surfaceOf(mission) === 'mail'),
      drills: open.filter((mission) => surfaceOf(mission) === 'training'),
      lockedInbox: waiting.filter((mission) => mission.engine === 'terminal'),
      lockedDrills: waiting.filter((mission) => mission.engine !== 'terminal'),

      activeSurface,
      shellSession,
      dueCount: deckStats(state.deck, now()).due,
      durability: persistence.describeDurability(),
      missionWorld: state.session ? worldOf(state.session) : shellSession ? worldOf(shellSession) : world,
      terminal: state.terminal,
      desktop: state.desktop,
      viewport: state.viewport,
      actions
    };
  }

  /* ---------- persistence ---------- */

  /**
   * Always called AFTER `store.set`, never before.
   *
   * `store.set` renders synchronously, so a state that cannot be drawn throws
   * before it reaches disk. Writing first meant a state that crashes the page
   * was already saved, and every subsequent load reproduced the crash — a
   * permanent lockout from a single bad render.
   */
  function persist(state) {
    persistence.write({ progress: state.progress, deck: state.deck });
  }

  /** Every card the player has earned the right to see. */
  function earnedCardIds(progress) {
    return cardsForConcepts(playerOf(progress, MISSIONS).concepts).map((card) => card.id);
  }

  /**
   * Make the deck exactly the earned set: add what is newly earned, drop what is
   * no longer.
   *
   * The dropping half is the part that matters. Content evolves, and a save that
   * closed a mission this build no longer has loses the concepts it taught — but
   * the cards for those concepts are still sitting in the deck, still valid ids,
   * and will come due. Without this the review pane opens on a card the player
   * is no longer meant to have, which is a crash, and the crash is written to
   * storage, so it repeats on every load.
   */
  function syncDeck(deck, progress) {
    const earned = earnedCardIds(progress);
    return pruneDeck(introduce(deck, earned, now()), earned);
  }

  /** A fresh practice shell over the world as it currently stands. */
  function freshPractice(progress) {
    return beginMission(PRACTICE, reduceWorld(createSeed(), progress.events), { workstation: WORKSTATION });
  }

  /* ---------- window helpers ---------- */

  function geometryFor(state, appId) {
    const app = APP[appId];
    return cascadeAt(state.desktop, state.viewport, (app && app.defaultSize) || { w: 600, h: 440 });
  }

  /**
   * Apply a new stacking order to the nodes already on screen.
   *
   * Returns false if the DOM and the model have drifted apart, in which case the
   * caller falls back to a full render — better a lost click than a desktop that
   * disagrees with itself.
   */
  function paintFocus(desk) {
    try {
      const top = focusedId(desk);
      const frames = host.querySelectorAll('[data-app]');
      if (frames.length === 0) return false;

      for (const node of frames) {
        const win = windowOf(desk, node.getAttribute('data-app'));
        if (!win || win.minimized) return false;
        node.style.zIndex = String(win.z);
        node.classList.toggle('win-focused', win.appId === top);
      }

      for (const node of host.querySelectorAll('[data-task]')) {
        const isTop = node.getAttribute('data-task') === top;
        node.classList.toggle('task-focused', isTop);
        node.setAttribute('aria-pressed', isTop ? 'true' : 'false');
      }

      return true;
    } catch {
      return false;
    }
  }

  /** Open an app if it is closed, and always bring it forward. */
  function surface(state, appId) {
    const desk = isOpen(state.desktop, appId)
      ? focusApp(state.desktop, appId)
      : openApp(state.desktop, appId, geometryFor(state, appId), state.viewport);
    return { ...state, desktop: desk };
  }

  /* ---------- actions ---------- */

  const actions = {
    /* --- windows --- */

    /**
     * Raise a window — WITHOUT redrawing, which is the whole point.
     *
     * This runs on pointerdown, and a browser only fires `click` when the press
     * and the release land on the same element. Rebuilding the desktop here
     * replaces that element between the two, so the click never happens: every
     * button in the game becomes dead, and every drag writes to a node that has
     * already been thrown away. That is exactly what this did.
     *
     * Two things prevent it. A focus change that changes nothing returns without
     * touching the store at all; a real one is painted straight onto the existing
     * nodes, because stacking order and a highlight are the only things it
     * affects — nothing moves, nothing re-flows, and no node needs replacing.
     */
    focusApp(appId) {
      const state = store.get();
      const desktop = focusApp(state.desktop, appId);
      if (desktop === state.desktop) return;

      const next = { ...state, desktop };

      // A narrow layout draws only the focused window, so there the change really
      // is structural and has to go through a render. It is reached by taskbar
      // clicks, which have already completed by the time this runs.
      if (!isNarrow(state.viewport) && paintFocus(desktop)) {
        store.setQuiet(next);
        return;
      }

      store.set(next);
    },

    toggleApp(appId) {
      store.update((state) => ({
        ...state,
        desktop: toggleApp(state.desktop, appId, geometryFor(state, appId), state.viewport)
      }));
    },

    openWindow(appId) {
      store.update((state) => surface(state, appId));
    },

    closeApp(appId) {
      store.update((state) => ({ ...state, desktop: closeApp(state.desktop, appId) }));
    },

    minimizeApp(appId) {
      store.update((state) => ({ ...state, desktop: minimizeApp(state.desktop, appId) }));
    },

    moveApp(appId, x, y) {
      store.update((state) => ({ ...state, desktop: moveApp(state.desktop, appId, x, y, state.viewport) }));
    },

    resizeApp(appId, w, h) {
      store.update((state) => ({ ...state, desktop: resizeApp(state.desktop, appId, w, h, state.viewport) }));
    },

    /** Put Mail and the Terminal back side by side, whatever has happened since. */
    tidyDesktop() {
      store.update((state) => ({ ...state, desktop: tile(state.desktop, OPENING_LAYOUT, state.viewport) }));
    },

    /**
     * The browser window changed size. Every window is pulled back into reach —
     * otherwise a maximise-then-restore leaves half the desktop unreachable with
     * no devtools to fix it from.
     */
    viewportChanged() {
      store.update((state) => {
        const next = measureViewport();
        if (next.width === state.viewport.width && next.height === state.viewport.height) return state;
        return { ...state, viewport: next, desktop: clampAll(state.desktop, next) };
      });
    },

    /* --- missions --- */

    openMission(missionId) {
      const mission = missionById(missionId);
      if (!mission) return;

      store.update((state) => {
        const world = reduceWorld(createSeed(), state.progress.events);
        const where = surfaceOf(mission);

        const started = {
          ...state,
          session: beginMission(mission, world, { workstation: WORKSTATION }),
          attempted: false,
          solved: false,
          hintsShown: 0,
          debrief: null,
          terminal: NO_TERMINAL,
          notice: null
        };

        // Bring up whatever the ticket is worked in. For a terminal ticket that
        // is both windows: the brief in Mail and the shell beside it, because
        // one without the other is half a ticket.
        let placed = surface(started, where);
        if (where === 'mail') placed = surface(placed, 'terminal');
        return placed;
      });
    },

    /**
     * `quiet` keeps a text field from losing its caret: the value is already on
     * screen, so the state is updated without a redraw.
     */
    answer(key, value, options = {}) {
      const state = store.get();
      if (!state.session) return;

      const next = { ...state, session: answerInMission(state.session, key, value) };
      if (options.quiet) store.setQuiet(next);
      else store.set(next);
    },

    /**
     * A rejected event leaves the session untouched and tells the player, rather
     * than throwing out of a click handler into the crash panel. Engines are
     * content, and content gets edited.
     */
    emit(event) {
      store.update((state) => {
        if (!state.session) return state;
        try {
          return { ...state, session: emitToMission(state.session, event) };
        } catch (error) {
          return { ...state, notice: `That change could not be applied: ${error.message}` };
        }
      });
    },

    /* --- the terminal --- */

    setDraft(text, options = {}) {
      const next = { ...store.get(), terminal: { ...store.get().terminal, draft: text, hint: null } };
      if (options.quiet) store.setQuiet(next);
      else store.set(next);
    },

    /**
     * One entry point for every command, whether it is doing real work or
     * practice. Which session it lands in is the only difference, and it is
     * decided by the same rule the terminal window draws by.
     */
    runCommand(line) {
      const state = store.get();
      const onTicket = Boolean(state.session) && surfaceOf(state.session.mission) === 'mail';
      const target = onTicket ? state.session : state.practice;
      if (!target || !target.shell) return;

      const ran = runInMission(target, line);

      store.set({
        ...state,
        session: onTicket ? ran : state.session,
        practice: onTicket ? state.practice : ran,
        terminal: { draft: '', historyIndex: null, hint: null },
        // Typing again after a failed check clears the verdict: it is stale the
        // moment anything changes.
        attempted: false
      });
    },

    /** Walk the shell history. -1 is older, +1 is newer. */
    recallHistory(direction) {
      const state = store.get();
      const onTicket = Boolean(state.session) && surfaceOf(state.session.mission) === 'mail';
      const target = onTicket ? state.session : state.practice;
      if (!target || !target.shell) return;

      const history = target.shell.session.history;
      if (history.length === 0) return;

      const current = state.terminal.historyIndex;
      let next;

      if (direction < 0) {
        next = current === null ? history.length - 1 : Math.max(0, current - 1);
      } else {
        if (current === null) return;
        next = current + 1;
        if (next >= history.length) {
          store.set({ ...state, terminal: { ...state.terminal, draft: '', historyIndex: null, hint: null } });
          return;
        }
      }

      store.set({ ...state, terminal: { draft: history[next], historyIndex: next, hint: null } });
    },

    completionHint(completed, matches) {
      const state = store.get();
      store.set({
        ...state,
        terminal: { ...state.terminal, draft: completed, historyIndex: null, hint: matches.join('   ') }
      });
    },

    showHint() {
      store.update((state) =>
        state.session
          ? { ...state, hintsShown: Math.min(state.hintsShown + 1, state.session.mission.hints.length) }
          : state
      );
    },

    resetMission() {
      store.update((state) =>
        state.session
          ? { ...state, session: resetMission(state.session), attempted: false, solved: false, terminal: NO_TERMINAL }
          : state
      );
    },

    abandonMission() {
      // The scratch is discarded whole, so nothing the player tried is kept.
      store.update((state) => ({
        ...state,
        session: null,
        attempted: false,
        solved: false,
        hintsShown: 0,
        terminal: NO_TERMINAL,
        practice: freshPractice(state.progress)
      }));
    },

    submitMission() {
      const state = store.get();
      if (!state.session) return;

      if (!isMissionSolved(state.session)) {
        store.set({ ...state, attempted: true, solved: false });
        return;
      }

      const result = finishMission(state.session);
      const mission = state.session.mission;
      const where = surfaceOf(mission);

      const tierBefore = tierOf(state.progress, RANKED);
      const progress = recordCompletion(state.progress, result);
      const tierAfter = tierOf(progress, RANKED);

      const cardsBefore = Object.keys(state.deck.cards).length;
      const deck = syncDeck(state.deck, progress);

      const next = {
        ...state,
        progress,
        deck,
        session: null,
        // The company has changed, so the practice shell is rebuilt over the new
        // world. Keeping the old one would show the player a network that no
        // longer exists.
        practice: freshPractice(progress),
        attempted: false,
        solved: true,
        terminal: NO_TERMINAL,
        debrief: {
          surface: where,
          mission,
          xp: result.xp,
          hintsUsed: state.hintsShown,
          newCards: Object.keys(deck.cards).length - cardsBefore,
          promotedTo: tierAfter > tierBefore ? tierAfter : null
        }
      };

      const placed = surface(next, where);
      store.set(placed);
      persist(placed);
    },

    clearDebrief() {
      store.update((state) => ({ ...state, debrief: null, solved: false, hintsShown: 0 }));
    },

    /* --- training and review --- */

    setTrainingTab(tab) {
      store.update((state) => ({ ...state, trainingTab: tab }));
    },

    setManualTab(tab) {
      store.update((state) => ({ ...state, manualTab: tab }));
    },

    /**
     * Open one command's walkthrough, or go back to the index with null.
     *
     * It also brings the Manual forward, so a "see also" link followed from one
     * walkthrough works even when the window has been buried behind the terminal.
     */
    showCommand(name) {
      store.update((state) =>
        surface({ ...state, manualTab: 'commands', manualCommand: name || null }, 'manual')
      );
    },

    startReview() {
      store.update((state) => {
        const queue = dueCards(state.deck, now(), REVIEW_BATCH).map((card) => card.id);
        return {
          ...surface(state, 'training'),
          trainingTab: 'review',
          notice: null,
          review:
            queue.length === 0
              ? { queue: [], index: 0, correct: 0, answer: null, options: [] }
              : openCard(queue, 0, 0)
        };
      });
    },

    endReview() {
      store.update((state) => ({ ...state, review: null }));
    },

    answerCard(choice) {
      const state = store.get();
      const review = state.review;
      if (!review || review.answer !== null) return;

      const cardId = review.queue[review.index];
      const card = cardOf(cardId);
      if (!card) return;

      const correct = choice === card.answer;

      const next = {
        ...state,
        deck: gradeCard(state.deck, cardId, correct, now()),
        review: { ...review, answer: choice, correct: review.correct + (correct ? 1 : 0) }
      };

      store.set(next);
      persist(next);
    },

    nextCard() {
      store.update((state) => {
        const review = state.review;
        const index = review.index + 1;
        return {
          ...state,
          review:
            index >= review.queue.length
              ? { ...review, index, answer: null, options: [] }
              : { ...openCard(review.queue, index, review.correct) }
        };
      });
    },

    /* --- end of shift --- */

    clockOut() {
      const next = {
        ...store.get(),
        deck: endSession(store.get().deck),
        session: null,
        review: null,
        debrief: null,
        notice: 'Shift banked. Reviews will come round next time you sit down.'
      };

      store.set(next);
      persist(next);
    },

    /* --- moving progress --- */

    async exportSave() {
      const state = store.get();
      const save = persistence.snapshot({ progress: state.progress, deck: state.deck });
      const result = await exportSave(save);

      store.update((current) => ({
        ...current,
        transfer: {
          kind: 'export',
          ok: result.ok,
          message: result.ok
            ? result.note || 'Saved. Keep it beside the game so your progress travels with it.'
            : 'Downloads and the clipboard are both blocked here. Select the text below and copy it by hand.',
          text: result.ok ? null : result.text
        }
      }));
    },

    togglePaste() {
      store.update((state) => ({ ...state, pasting: !state.pasting, transfer: null }));
    },

    setPasteText(text, options = {}) {
      const next = { ...store.get(), pasteText: text };
      if (options.quiet) store.setQuiet(next);
      else store.set(next);
    },

    importFromText() {
      const result = importSaveFromText(store.get().pasteText);
      adopt(result);
    },

    async importFromFile() {
      adopt(await importSaveFromFile());
    },

    askReset() {
      store.update((state) => ({ ...state, confirmingReset: true }));
    },

    cancelReset() {
      store.update((state) => ({ ...state, confirmingReset: false }));
    },

    resetEverything() {
      persistence.clear();
      const progress = createProgress();
      store.set({
        ...store.get(),
        progress,
        deck: createDeck(),
        session: null,
        practice: freshPractice(progress),
        review: null,
        debrief: null,
        confirmingReset: false,
        transfer: null,
        notice: 'Everything has been cleared. Fresh start.'
      });
    }
  };

  function adopt(result) {
    if (!result.ok) {
      store.update((state) => ({
        ...state,
        transfer: { kind: 'import', ok: false, message: result.cancelled ? 'No file was chosen.' : result.error }
      }));
      return;
    }

    const brought = persistence.adopt(result.save);
    const next = {
      ...store.get(),
      progress: brought.progress,
      deck: syncDeck(brought.deck, brought.progress),
      session: null,
      practice: freshPractice(brought.progress),
      review: null,
      debrief: null,
      pasting: false,
      pasteText: '',
      transfer: {
        kind: 'import',
        ok: true,
        message: [
          `Loaded ${brought.progress.completed.length} closed ${brought.progress.completed.length === 1 ? 'ticket' : 'tickets'}.`,
          result.warning,
          ...brought.warnings
        ]
          .filter(Boolean)
          .join(' ')
      }
    };

    store.set(next);
    persist(next);
  }

  /* ---------- review helpers ---------- */

  /**
   * The deck is the authority on what is in play, so a card is looked up in the
   * full card table rather than re-derived from concepts. Re-deriving made this
   * disagree with the review pane, which reads the table directly — and a
   * disagreement between the two is an undefined card and a crash.
   */
  function cardOf(cardId) {
    return CARDS[cardId] || null;
  }

  /**
   * Shuffle with the seeded PRNG, keyed on the card id, so a card's options are
   * in the same order every time it is shown and the game stays reproducible.
   *
   * A card id with no card behind it is skipped rather than rendered. It should
   * be impossible now that the deck is kept in sync, but this is the last thing
   * standing between a content edit and a review pane that cannot be opened.
   */
  function openCard(queue, index, correct) {
    let at = index;
    while (at < queue.length && !cardOf(queue[at])) at++;

    if (at >= queue.length) {
      return { queue, index: queue.length, correct, answer: null, options: [] };
    }

    const card = cardOf(queue[at]);
    const rng = createRng(hashString(card.id));
    return { queue, index: at, correct, answer: null, options: rng.shuffle(card.options) };
  }

  /* ---------- rendering ---------- */

  /**
   * A desktop that cannot draw must not take the game with it.
   *
   * `isMissionSolved` already refuses to let a bad `win` predicate crash the
   * page; app bodies and engines are content in exactly the same way and get the
   * same treatment — one broken window draws its own error inside its own frame
   * and every other window carries on (see `safeBody` in window.js). This is the
   * outer net, for a failure in the desktop itself.
   *
   * If the fallback itself throws, the error is allowed through to the crash
   * handler — at that point the panel really is the right answer.
   */
  let recovering = false;

  function draw() {
    const before = captureView();

    try {
      render(host, drawDesktop(derive(store.get())));
      settle(before);
      recovering = false;
    } catch (error) {
      if (recovering) throw error;
      recovering = true;
      drawFailure(error);
    }
  }

  /**
   * Three things a full re-render loses: where each window was scrolled to,
   * where the caret was, and how far down the terminal scrollback had gone.
   *
   * Window scroll is the one that would be felt on every keystroke — the Manual
   * open at the routing table would jump back to the top each time a character
   * is typed next door. It is read before the render and written back after.
   */
  function captureView() {
    const seen = {};
    let mayTakeCaret = true;

    try {
      for (const node of host.querySelectorAll('[data-win-scroll]')) {
        seen[node.getAttribute('data-win-scroll')] = node.scrollTop;
      }

      // If the player is typing somewhere that is not the terminal — a subnet
      // answer, the paste box in System — the terminal must not take the caret
      // back after the render. A window redrawing for its own reasons used to
      // yank the cursor out of the field being typed in, which reads as the
      // keyboard being broken.
      const active = document.activeElement;
      const typing = active && TEXT_FIELDS.test(active.tagName) && active.getAttribute('data-focus') !== 'true';
      mayTakeCaret = !typing;
    } catch {
      /* a DOM that cannot be queried simply gets no restoration */
    }

    return { scrolls: seen, mayTakeCaret };
  }

  function settle(before) {
    try {
      for (const node of host.querySelectorAll('[data-win-scroll]')) {
        const was = before.scrolls[node.getAttribute('data-win-scroll')];
        if (typeof was === 'number') node.scrollTop = was;
      }

      const scroller = host.querySelector('[data-scroll-bottom]');
      if (scroller) scroller.scrollTop = scroller.scrollHeight;

      if (!before.mayTakeCaret) return;

      const focus = host.querySelector('[data-focus]');
      if (focus && document.activeElement !== focus) {
        focus.focus();
        if (typeof focus.setSelectionRange === 'function') {
          const end = focus.value.length;
          focus.setSelectionRange(end, end);
        }
      }
    } catch {
      /* a browser that will not focus is not a reason to lose the screen */
    }
  }

  function drawFailure(error) {
    render(
      host,
      el(
        'main',
        { class: 'main' },
        el(
          'section',
          { class: 'panel' },
          el('h2', {}, 'The desktop could not be drawn'),
          el('p', { class: 'verdict verdict-no' }, String((error && error.message) || error)),
          el('p', {}, 'Your progress has not been lost. Put the windows back, or take a copy of your save first.'),
          el(
            'div',
            { class: 'actions' },
            button('Reset the windows', () => actions.tidyDesktop(), { class: 'primary' }),
            button('Open System', () => actions.openWindow('system'))
          )
        )
      )
    );
  }

  store.subscribe(draw);

  return {
    start() {
      // The practice shell is built before the first draw, so the Terminal
      // window is never empty — not even for one frame.
      store.setQuiet({ ...store.get(), practice: freshPractice(store.get().progress) });

      // The one place the save goes first, and deliberately.
      //
      // The storage line is only honest once a write has actually been
      // attempted: a tier can be perfectly readable and still refuse every
      // setItem under a quota or a policy, and reporting "saved in this browser"
      // in that case is the exact false reassurance this design exists to avoid.
      //
      // Writing first is safe here and nowhere else, because this state is the
      // one just loaded from disk — already pruned of anything that cannot be
      // replayed — so it cannot be a state that crashes the render.
      persist(store.get());
      draw();

      try {
        window.addEventListener('resize', () => actions.viewportChanged());
      } catch {
        /* a browser with no resize event just keeps the layout it opened with */
      }
    },
    actions,
    store
  };
}
