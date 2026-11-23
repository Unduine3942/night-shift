/**
 * The smallest possible state container.
 *
 * State is one frozen object, replaced wholesale. Nothing here is clever, and
 * that is deliberate: the interesting logic all lives in core/, where it is pure
 * and node-tested, and this exists only to hold the current value and tell the
 * renderer when it changed.
 *
 * `setQuiet` is the one concession to the DOM. A text field that re-renders on
 * every keystroke loses the caret, so typed answers update the state without
 * triggering a redraw — the field on screen is already showing the right thing.
 */

export function createStore(initial) {
  let state = initial;
  const listeners = new Set();

  const notify = () => {
    for (const listener of [...listeners]) listener(state);
  };

  return {
    get() {
      return state;
    },

    set(next) {
      if (next === state) return;
      state = next;
      notify();
    },

    /** Update state without redrawing. For inputs that are already correct on screen. */
    setQuiet(next) {
      state = next;
    },

    update(fn) {
      this.set(fn(state));
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
