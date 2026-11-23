/**
 * The commands about the terminal itself.
 *
 * `help` and `man` are load-bearing rather than decoration. There is no internet
 * on the machine this runs on and no second screen to look things up on, so the
 * manual has to be in the terminal — and a player who learns to reach for `man`
 * when they are stuck has learned the single most transferable habit here.
 *
 * `submit` is how a ticket that asks a question gets answered. Repairs are proved
 * by the state of the network; findings have to be reported, the same way they
 * would be on a real shift.
 */

import { REAL, SIMPLIFIED, LOCAL, authenticityBanner, authenticityTag, LEGEND } from '../authenticity.js';
import { tutorialFor } from '../../../content/tutorials/index.js';

const pad = (value, width) => String(value).padEnd(width);

const GROUPS = [
  { title: 'Finding your way', names: ['help', 'man', 'tutorial', 'history', 'clear'] },
  { title: 'This machine', names: ['ifconfig', 'ip'] },
  { title: 'Reaching other machines', names: ['ping', 'traceroute', 'nmap', 'arp', 'route'] },
  { title: 'Names', names: ['nslookup', 'dig', 'nsupdate'] },
  { title: 'Accounts', names: ['samba-tool'] },
  { title: 'Working somewhere else', names: ['ssh', 'console', 'exit'] },
  { title: 'The ticket', names: ['submit'] }
];

export const help = {
  name: 'help',
  authenticity: SIMPLIFIED,
  realWorld:
    'bash has a builtin called help, and it lists bash’s own builtins — if, for, cd, export — not the ' +
    'programs installed on the machine. This one lists the toolkit instead, which is the question you ' +
    'actually have. On a real box the equivalents are "apropos <topic>", "ls /usr/bin", or your ' +
    'distribution’s package list.',
  summary: 'List the commands this machine has.',
  usage: 'help [command]',
  manual: [
    'help on its own lists everything, grouped by what it is for.',
    'help <command> is the same as man <command>.'
  ],

  run({ positional, registry }) {
    if (positional.length > 0) return man.run({ positional, registry });

    const lines = ['Commands on this machine. "man <command>" explains any of them.', '', ...LEGEND, ''];
    const listed = new Set();

    for (const group of GROUPS) {
      const rows = group.names
        .map((name) => registry[name])
        .filter(Boolean)
        .map((command) => {
          listed.add(command.name);
          const tag = authenticityTag(command);
          return `  ${pad(command.name, 14)}${pad(command.summary, 52)}${tag}`.trimEnd();
        });
      if (rows.length === 0) continue;
      lines.push(group.title, ...rows, '');
    }

    const rest = Object.values(registry).filter((command) => !listed.has(command.name));
    if (rest.length > 0) {
      lines.push(
        'Other',
        ...rest.map((command) => `  ${pad(command.name, 14)}${pad(command.summary, 52)}${authenticityTag(command)}`.trimEnd()),
        ''
      );
    }

    return { stdout: lines, exit: 0 };
  }
};

export const man = {
  name: 'man',
  authenticity: REAL,
  summary: 'Explain one command in full.',
  usage: 'man <command>',
  manual: ['man prints what a command is for, how to type it, and when to reach for it.'],

  run({ positional, registry }) {
    if (positional.length === 0) {
      return { stderr: ['What manual page do you want?', 'usage: man <command>'], exit: 2 };
    }

    const wanted = positional[0];
    const command =
      registry[wanted] ||
      Object.values(registry).find((entry) => (entry.aliases || []).includes(wanted));

    if (!command) {
      return { stderr: [`No manual entry for ${wanted}`, 'Type "help" for the list.'], exit: 1 };
    }

    const aliasLine =
      command.aliases && command.aliases.length > 0 ? [`also: ${command.aliases.join(', ')}`] : [];
    const banner = authenticityBanner(command);

    // A manual says what a command does; the walkthrough shows it being used to
    // get somewhere. Pointing at it from here is how anybody finds it.
    const walkthrough = tutorialFor(command.name)
      ? ['', `A step-by-step walkthrough is available: tutorial ${command.name}`]
      : [];

    return {
      stdout: [
        `${command.name.toUpperCase()} — ${command.summary}`,
        ...(banner.length > 0 ? ['', ...banner] : []),
        '',
        `usage: ${command.usage}`,
        ...aliasLine,
        '',
        ...(command.manual || ['(no further detail)']),
        ...walkthrough
      ],
      exit: 0
    };
  }
};

/**
 * The walkthrough for a command, in the terminal.
 *
 * A site tool, and honestly labelled as one: no real machine has a `tutorial`
 * command. It earns its place because the target machine has no internet and no
 * second screen to look things up on, and because a worked example is what
 * people actually need — the flags are the easy part.
 *
 * The full version, with the output annotated line by line, is in the Manual
 * window. This prints the part you want while your hands are on the keyboard.
 */
export const tutorial = {
  name: 'tutorial',
  authenticity: LOCAL,
  realWorld:
    'No such command exists on a real machine. The nearest equivalents are the EXAMPLES section at the ' +
    'bottom of a man page, the tldr project (tldr <command>), your distribution’s documentation, and ' +
    'whatever your own team has written down. Reading examples before flags is the habit worth keeping.',
  summary: 'Walk through a command step by step.',
  usage: 'tutorial <command>',
  manual: [
    'tutorial <command> prints what the command is for, the ideas behind it, and',
    'a numbered set of steps — each one a line to type and what its answer rules',
    'out.',
    '',
    'The steps are in the order of the reasoning, not the order of the options.',
    '',
    'The full walkthrough, with the output annotated line by line and the common',
    'mistakes spelled out, is in the Manual window under Commands.'
  ],

  run({ positional, registry }) {
    if (positional.length === 0) {
      const covered = Object.keys(registry)
        .filter((name) => tutorialFor(name))
        .sort();
      return {
        stderr: [
          'Which command do you want walking through?',
          'usage: tutorial <command>',
          '',
          `Walkthroughs: ${covered.join(', ')}`
        ],
        exit: 2
      };
    }

    const wanted = positional[0];
    const command =
      registry[wanted] || Object.values(registry).find((entry) => (entry.aliases || []).includes(wanted));
    const found = command ? tutorialFor(command.name) : tutorialFor(wanted);

    if (!found) {
      return {
        stderr: [`No walkthrough for ${wanted}.`, 'Type "tutorial" for the list, or "help" for every command.'],
        exit: 1
      };
    }

    const lines = [
      `${found.command.toUpperCase()} — a walkthrough`,
      '',
      ...wrapText(found.idea),
      '',
      'On the job',
      ...wrapText(found.onTheJob, '  '),
      '',
      ...wrapText(`Concepts: ${found.concepts.join(', ')}`),
      ''
    ];

    found.steps.forEach((step, index) => {
      lines.push(`Step ${index + 1} — ${step.title}`);
      lines.push(`  $ ${step.line}`);
      if (step.look) lines.push(`  Watch for: ${step.look}`);
      lines.push(...wrapText(step.why, '  '));
      lines.push('');
    });

    if ((found.mistakes || []).length > 0) {
      lines.push('Easy mistakes');
      for (const mistake of found.mistakes) {
        lines.push(`  $ ${mistake.line}`);
        lines.push(...wrapText(mistake.why, '    '));
      }
      lines.push('');
    }

    if ((found.seeAlso || []).length > 0) lines.push(`See also: ${found.seeAlso.join(', ')}`);
    lines.push('The annotated version is in the Manual window, under Commands.');

    return { stdout: lines, exit: 0 };
  }
};

/** Wrap prose to the terminal, which has no reflow of its own. */
function wrapText(text, indent = '') {
  const width = 76 - indent.length;
  const out = [];
  let line = '';

  for (const word of String(text).split(/\s+/)) {
    if (line.length === 0) line = word;
    else if (line.length + 1 + word.length <= width) line += ` ${word}`;
    else {
      out.push(indent + line);
      line = word;
    }
  }
  if (line.length > 0) out.push(indent + line);
  return out;
}

export const clear = {
  name: 'clear',
  authenticity: REAL,
  summary: 'Empty the screen.',
  usage: 'clear',
  manual: ['Clears what is on screen. Nothing is lost — "history" still has every command.'],

  run() {
    return { clear: true, exit: 0 };
  }
};

export const history = {
  name: 'history',
  authenticity: REAL,
  summary: 'Show the commands you have run this shift.',
  usage: 'history',
  manual: [
    'Lists what you have typed, oldest first.',
    '',
    'Up and down arrows walk the same list without printing it.'
  ],

  run({ session }) {
    if (session.history.length === 0) return { stdout: ['(nothing yet)'], exit: 0 };
    return {
      stdout: session.history.map((entry, index) => `${String(index + 1).padStart(4)}  ${entry}`),
      exit: 0
    };
  }
};

export const submit = {
  name: 'submit',
  aliases: ['report'],
  authenticity: LOCAL,
  realWorld:
    'Not a command that exists anywhere. It is how this game receives an answer, standing in for typing ' +
    'your findings into a ticket in Jira, ServiceNow or whatever your employer uses.',
  summary: 'Report a finding against the open ticket.',
  usage: 'submit <field>=<value> [<field>=<value> ...]',
  manual: [
    'Some tickets are closed by fixing something, and the network itself is the',
    'proof. Others ask you a question, and this is how you answer it.',
    '',
    '  submit login=jhale',
    '  submit address=10.20.10.10 resolver=10.20.10.10',
    '',
    'The ticket names the fields it wants. Submitting is free and can be repeated —',
    'a later answer replaces an earlier one, and nothing is graded until you have',
    'answered everything the ticket asked for.'
  ],

  run({ positional, ctx }) {
    if (!ctx || !ctx.mission) {
      return { stderr: ['submit: no ticket is open.', 'Open one from Mail first.'], exit: 1 };
    }

    if (positional.length === 0) {
      const wanted = (ctx.mission.props && ctx.mission.props.fields) || [];
      return {
        stderr: [
          'submit: nothing to report',
          `usage: ${submit.usage}`,
          ...(wanted.length > 0 ? ['', 'This ticket is asking for:', ...wanted.map((field) => `  ${field.key}   ${field.label}`)] : [])
        ],
        exit: 2
      };
    }

    const answers = {};
    const bad = [];

    for (const token of positional) {
      const at = token.indexOf('=');
      if (at <= 0) {
        bad.push(token);
        continue;
      }
      answers[token.slice(0, at)] = token.slice(at + 1);
    }

    if (bad.length > 0) {
      return {
        stderr: [
          `submit: ${bad.join(', ')} — each answer must be written field=value`,
          `usage: ${submit.usage}`
        ],
        exit: 2
      };
    }

    return {
      stdout: Object.entries(answers).map(([key, value]) => `recorded ${key} = ${value}`),
      answers,
      exit: 0
    };
  }
};

export const META_COMMANDS = [
  tutorial,help, man, clear, history, submit];
