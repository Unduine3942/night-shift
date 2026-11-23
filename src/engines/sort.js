/**
 * The sort engine — put each item in the right bucket.
 *
 * Buttons rather than drag-and-drop. Drag-and-drop is the obvious choice and the
 * wrong one here: it is unusable by keyboard, awkward on a trackpad, and it would
 * be the single most fragile thing in a file that has to work first time on a
 * machine with no devtools to debug it on.
 */

import { el, button } from '../ui/dom.js';

export default {
  id: 'sort',
  label: 'Sorting',
  // A drill is practice the player chose, not a ticket somebody raised, so it
  // belongs in Training rather than the inbox.
  surface: 'training',
  requiresProps: true,

  validateProps(mission) {
    const props = mission.props;
    if (!props) throw new TypeError(`${mission.id}: sort needs props`);

    if (typeof props.answerKey !== 'string' || props.answerKey === '') {
      throw new TypeError(`${mission.id}: sort needs props.answerKey — the answer is one object, not one value per item`);
    }
    if (!Array.isArray(props.items) || props.items.length === 0) {
      throw new TypeError(`${mission.id}: sort needs props.items`);
    }
    if (!Array.isArray(props.buckets) || props.buckets.length < 2) {
      throw new TypeError(`${mission.id}: sort needs at least two buckets, or there is nothing to decide`);
    }
    for (const item of props.items) {
      if (!item.id || !item.text) throw new TypeError(`${mission.id}: every sort item needs an id and text`);
    }
    for (const bucket of props.buckets) {
      if (!bucket.id || !bucket.label) throw new TypeError(`${mission.id}: every bucket needs an id and a label`);
    }
  },

  render(api) {
    const { mission, answers } = api;
    const { answerKey, items, buckets } = mission.props;
    const placements = answers[answerKey] || {};

    const place = (itemId, bucketId) =>
      api.answer(answerKey, { ...placements, [itemId]: bucketId });

    return el(
      'div',
      { class: 'engine engine-sort' },
      items.map((item) =>
        el(
          'div',
          { class: placements[item.id] ? 'sort-row sort-row-placed' : 'sort-row' },
          el('p', { class: 'sort-item' }, item.text),
          el(
            'div',
            { class: 'options' },
            buckets.map((bucket) =>
              button(bucket.label, () => place(item.id, bucket.id), {
                class: placements[item.id] === bucket.id ? 'option option-chosen' : 'option',
                'aria-pressed': placements[item.id] === bucket.id ? 'true' : 'false',
                'data-key': item.id,
                'data-value': bucket.id
              })
            )
          )
        )
      )
    );
  }
};
