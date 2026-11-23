/**
 * Manual — the reference sheet the player builds by playing.
 *
 * Two halves. The concepts they have been taught, which grows as tickets close;
 * and Meridian itself — the sites, the networks, the machines and the zone —
 * which is the thing every mission is about and which nobody should have to hold
 * in their head.
 *
 * The infrastructure half is drawn from the live world rather than from the
 * contract, so it shows the network as it is now, including anything the player
 * has changed. A reference that disagrees with the terminal would be worse than
 * no reference at all.
 *
 * Being a window rather than a screen is most of its value: the subnet table
 * stays open beside the terminal while you type against it, instead of being
 * somewhere you navigate away to and then have to remember.
 */

import { el, button, panel } from '../dom.js';
import { CONCEPTS, conceptsInDomain } from '../../content/concepts.js';
import { selectSites, selectSubnets, selectDevices, selectInterfaces } from '../../core/world/select.js';
import { TUTORIAL_GROUPS, tutorialFor } from '../../content/tutorials/index.js';
import { REGISTRY } from '../../core/shell/registry.js';
import { authenticityTag } from '../../core/shell/authenticity.js';

const DOMAIN_LABEL = {
  networking: 'Networking',
  it: 'IT and systems',
  data: 'Data',
  security: 'Security'
};

function conceptSection(domain, known) {
  const learned = conceptsInDomain(domain).filter((concept) => known.has(concept.id));
  if (learned.length === 0) return null;

  return el(
    'div',
    { class: 'codex-group' },
    el('h3', {}, DOMAIN_LABEL[domain] || domain),
    el(
      'dl',
      { class: 'codex-list' },
      learned.map((concept) => [
        el('dt', {}, concept.label),
        el('dd', {}, concept.blurb)
      ])
    )
  );
}

function networkTable(world) {
  const subnets = selectSubnets(world);
  return el(
    'table',
    { class: 'ref-table' },
    el(
      'thead',
      {},
      el('tr', {}, el('th', {}, 'Network'), el('th', {}, 'Range'), el('th', {}, 'VLAN'), el('th', {}, 'Gateway'))
    ),
    el(
      'tbody',
      {},
      subnets.map((subnet) =>
        el(
          'tr',
          {},
          el('td', {}, subnet.name),
          el('td', {}, el('code', {}, subnet.cidr)),
          el('td', {}, subnet.vlan === undefined || subnet.vlan === null ? '—' : String(subnet.vlan)),
          el('td', {}, subnet.gateway ? el('code', {}, subnet.gateway) : '—')
        )
      )
    )
  );
}

function deviceTable(world, siteId) {
  const devices = selectDevices(world).filter((device) => device.siteId === siteId);

  return el(
    'table',
    { class: 'ref-table' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Host'), el('th', {}, 'What it is'), el('th', {}, 'Addresses'))),
    el(
      'tbody',
      {},
      devices.map((device) => {
        const addresses = selectInterfaces(world, device.id)
          .filter((iface) => iface.ip)
          .map((iface) => `${iface.ip}${iface.up ? '' : ' (down)'}`);

        return el(
          'tr',
          { class: device.powered ? '' : 'row-off' },
          el('td', {}, el('code', {}, device.id)),
          el('td', {}, device.label),
          el('td', {}, addresses.length > 0 ? el('code', {}, addresses.join(', ')) : '—')
        );
      })
    )
  );
}

/* ---------------- the commands half ---------------- */

/**
 * A walkthrough, laid out.
 *
 * Every line of shell in here is one the test suite has typed into a real
 * session, and the "look for" text is what actually came back. That is why this
 * can be this specific without the risk that it quietly stops being true.
 */
function walkthrough(tutorial, command, actions) {
  return el(
    'article',
    { class: 'walk' },

    el(
      'div',
      { class: 'walk-head' },
      el('h3', { class: 'walk-name' }, tutorial.command),
      command && el('span', { class: 'walk-tag' }, authenticityTag(command) || 'real tool'),
      el('p', { class: 'walk-summary' }, command ? command.summary : '')
    ),

    el('p', { class: 'walk-idea' }, tutorial.idea),

    panel('On the job', el('p', {}, tutorial.onTheJob)),

    el(
      'div',
      { class: 'walk-concepts' },
      tutorial.concepts.map((id) =>
        el('span', { class: 'chip chip-concept', title: CONCEPTS[id] ? CONCEPTS[id].blurb : id },
          CONCEPTS[id] ? CONCEPTS[id].label : id)
      )
    ),

    panel(
      'Step by step',
      el(
        'ol',
        { class: 'walk-steps' },
        tutorial.steps.map((step) =>
          el(
            'li',
            { class: 'walk-step' },
            el('p', { class: 'walk-step-title' }, step.title),
            el('code', { class: 'walk-line' }, `$ ${step.line}`),
            step.look && el('p', { class: 'walk-look' }, `Look for: ${step.look}`),
            step.clears && el('p', { class: 'walk-look' }, 'The screen empties. Nothing is lost.'),
            el('p', { class: 'walk-why' }, step.why)
          )
        )
      )
    ),

    (tutorial.reading || []).length > 0 &&
      panel(
        'Reading the output',
        el(
          'dl',
          { class: 'walk-reading' },
          (tutorial.reading || []).map((row) => [
            el('dt', {}, el('code', {}, row.part)),
            el('dd', {}, row.means)
          ])
        )
      ),

    (tutorial.mistakes || []).length > 0 &&
      panel(
        'Easy mistakes',
        el(
          'ul',
          { class: 'walk-mistakes' },
          (tutorial.mistakes || []).map((mistake) =>
            el(
              'li',
              {},
              el('code', { class: 'walk-line walk-line-bad' }, `$ ${mistake.line}`),
              el('p', { class: 'walk-look' }, `You get: ${mistake.look}`),
              el('p', { class: 'walk-why' }, mistake.why)
            )
          )
        )
      ),

    (tutorial.seeAlso || []).length > 0 &&
      el(
        'p',
        { class: 'walk-see' },
        'See also: ',
        (tutorial.seeAlso || []).map((other) =>
          button(other, () => actions.showCommand(other), { class: 'link' })
        )
      )
  );
}

function commandIndex(ctx) {
  const { actions, state } = ctx;

  return el(
    'div',
    { class: 'walk-index' },
    el(
      'p',
      { class: 'muted' },
      'Every command this machine has, with a worked walkthrough. The same walkthroughs are in the terminal: ' +
        'type "tutorial <command>".'
    ),
    TUTORIAL_GROUPS.map((group) =>
      el(
        'div',
        { class: 'walk-group' },
        el('h3', {}, group.title),
        el(
          'div',
          { class: 'walk-list' },
          group.commands.map((name) => {
            const command = REGISTRY[name];
            const tutorial = tutorialFor(name);
            if (!command || !tutorial) return null;

            return el(
              'button',
              {
                type: 'button',
                class: state.manualCommand === name ? 'walk-pick walk-pick-on' : 'walk-pick',
                onClick: () => actions.showCommand(name)
              },
              el('span', { class: 'walk-pick-name' }, name),
              el('span', { class: 'walk-pick-summary' }, command.summary)
            );
          })
        )
      )
    )
  );
}

function commandsPane(ctx) {
  const { state, actions } = ctx;
  const chosen = state.manualCommand;
  const tutorial = chosen ? tutorialFor(chosen) : null;

  if (!tutorial) return commandIndex(ctx);

  return el(
    'div',
    { class: 'walk-open' },
    button('\u2190 All commands', () => actions.showCommand(null), { class: 'quiet' }),
    walkthrough(tutorial, REGISTRY[chosen], actions)
  );
}

/* ---------------- what you have learned ---------------- */

function codexScreen(ctx) {
  const { player, world } = ctx;
  const known = player.concepts instanceof Set ? player.concepts : new Set(player.concepts);
  const sections = ['networking', 'it', 'data', 'security']
    .map((domain) => conceptSection(domain, known))
    .filter(Boolean);

  return el(
    'div',
    { class: 'screen screen-codex' },

    panel(
      `What you have learned (${known.size} of ${Object.keys(CONCEPTS).length})`,
      sections.length === 0
        ? el('p', { class: 'empty' }, 'Nothing yet. Close a ticket and it will start filling up.')
        : el('div', { class: 'codex-groups' }, sections)
    ),

    panel(
      'Meridian Logistics — networks',
      el('p', { class: 'muted' }, 'As the network stands right now, including anything you have changed.'),
      networkTable(world)
    ),

    ...selectSites(world).map((site) =>
      panel(`Meridian Logistics — ${site.name || site.id}`, deviceTable(world, site.id))
    )
  );
}

function tabs(ctx) {
  const { state, actions } = ctx;
  const on = state.manualTab;

  return el(
    'div',
    { class: 'tabs', role: 'tablist' },
    button('Commands', () => actions.setManualTab('commands'), {
      class: on === 'commands' ? 'tab tab-on' : 'tab',
      role: 'tab'
    }),
    button('Reference', () => actions.setManualTab('reference'), {
      class: on === 'reference' ? 'tab tab-on' : 'tab',
      role: 'tab'
    })
  );
}

export default {
  id: 'manual',
  title: 'Manual',
  short: 'Manual',
  defaultSize: { w: 680, h: 580 },

  subtitle(ctx) {
    if (ctx.state.manualTab === 'commands') {
      return ctx.state.manualCommand || `${Object.keys(REGISTRY).length} commands`;
    }
    const known = ctx.player.concepts instanceof Set ? ctx.player.concepts : new Set(ctx.player.concepts);
    return `${known.size} entries`;
  },

  body(ctx) {
    return el(
      'div',
      { class: 'pane pane-manual' },
      tabs(ctx),
      ctx.state.manualTab === 'commands' ? commandsPane(ctx) : codexScreen(ctx)
    );
  }
};
