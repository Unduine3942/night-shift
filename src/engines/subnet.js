/**
 * The subnet engine — typed answers about a block of addresses.
 *
 * Free text, not multiple choice. Recognising 10.20.20.255 in a list is a
 * different skill from working it out, and only one of them is any use at two in
 * the morning with a router in front of you.
 *
 * The block being asked about is read from the world, never written in the
 * mission, so a renumbering changes the question rather than invalidating it.
 */

import { el } from '../ui/dom.js';

export default {
  id: 'subnet',
  label: 'Subnetting',
  // A drill is practice the player chose, not a ticket somebody raised, so it
  // belongs in Training rather than the inbox.
  surface: 'training',
  requiresProps: true,

  validateProps(mission) {
    const props = mission.props;
    if (!props) throw new TypeError(`${mission.id}: subnet needs props`);

    if (typeof props.blockOf !== 'function') {
      throw new TypeError(`${mission.id}: subnet needs props.blockOf(world) — the block is read from the world, not written down`);
    }
    if (!Array.isArray(props.fields) || props.fields.length === 0) {
      throw new TypeError(`${mission.id}: subnet needs props.fields`);
    }
    for (const field of props.fields) {
      if (!field.key || !field.label) {
        throw new TypeError(`${mission.id}: every subnet field needs a key and a label`);
      }
    }
  },

  render(api) {
    const { mission, world, answers } = api;
    const block = mission.props.blockOf(world);

    return el(
      'div',
      { class: 'engine engine-subnet' },
      el(
        'div',
        { class: 'subnet-block' },
        el('span', { class: 'subnet-block-label' }, block.name || block.label || 'Block'),
        el('code', { class: 'subnet-block-cidr' }, block.cidr)
      ),
      el(
        'div',
        { class: 'fields' },
        mission.props.fields.map((field) => {
          const id = `field-${field.key}`;
          return el(
            'label',
            { class: 'field', for: id },
            el('span', { class: 'field-label' }, field.label),
            el('input', {
              id,
              class: 'field-input',
              type: 'text',
              autocomplete: 'off',
              spellcheck: 'false',
              inputmode: field.numeric ? 'numeric' : 'text',
              placeholder: field.placeholder || '',
              value: answers[field.key] === undefined ? '' : String(answers[field.key]),
              onInput: (event) => api.answer(field.key, event.target.value.trim(), { quiet: true })
            }),
            field.hint && el('span', { class: 'field-hint' }, field.hint)
          );
        })
      )
    );
  }
};
