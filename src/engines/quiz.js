/**
 * The quiz engine — one or more questions, each answered by picking an option.
 *
 * Options are usually a FUNCTION of the world rather than a written list, so the
 * choices on offer are the machines and people that actually exist right now. A
 * hand-written option list is one more place for the content to drift away from
 * the infrastructure, and this is a game whose entire premise is that it does not.
 */

import { el, button } from '../ui/dom.js';

function optionsFor(question, world) {
  return typeof question.options === 'function' ? question.options(world) : question.options;
}

export default {
  id: 'quiz',
  label: 'Questions',
  // A drill is practice the player chose, not a ticket somebody raised, so it
  // belongs in Training rather than the inbox.
  surface: 'training',
  requiresProps: true,

  validateProps(mission) {
    const props = mission.props;
    if (!props || !Array.isArray(props.questions) || props.questions.length === 0) {
      throw new TypeError(`${mission.id}: quiz needs props.questions`);
    }
    for (const question of props.questions) {
      if (typeof question.key !== 'string' || question.key === '') {
        throw new TypeError(`${mission.id}: every quiz question needs a key`);
      }
      if (typeof question.prompt !== 'string' || question.prompt.length < 10) {
        throw new TypeError(`${mission.id}: question "${question.key}" needs a prompt`);
      }
      if (typeof question.options !== 'function' && !Array.isArray(question.options)) {
        throw new TypeError(`${mission.id}: question "${question.key}" needs options, or a function returning them`);
      }
    }
  },

  render(api) {
    const { mission, world, answers } = api;

    return el(
      'div',
      { class: 'engine engine-quiz' },
      mission.props.questions.map((question) => {
        const chosen = answers[question.key];
        const options = optionsFor(question, world);

        return el(
          'fieldset',
          { class: 'question' },
          el('legend', {}, question.prompt),
          el(
            'div',
            { class: 'options' },
            options.map((option) =>
              button(option.label, () => api.answer(question.key, option.value), {
                class: option.value === chosen ? 'option option-chosen' : 'option',
                'aria-pressed': option.value === chosen ? 'true' : 'false',
                // Lets the build test drive the shipped file by value rather than
                // by matching label text, which is content and may change.
                'data-key': question.key,
                'data-value': String(option.value)
              })
            )
          )
        );
      })
    );
  }
};
