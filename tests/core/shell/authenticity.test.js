/**
 * The rule that keeps this an education rather than a trivia set.
 *
 * The failure mode is specific and well documented in the genre: a game takes the
 * name of a real tool and gives it a function that tool does not have. A beginner
 * memorises it, tries it on a real machine, and has to unlearn it. That is worse
 * than not having played, because confident wrong knowledge is harder to shift
 * than no knowledge.
 *
 * So every command declares what it is — real, simplified, or a site tool — and
 * these tests enforce the consequences:
 *
 *   - nothing invented may wear a real tool's name
 *   - anything not exactly real must say what it left out, in its own manual
 *   - no command may span operating systems by pretending two tools are one
 *
 * That last one deserves its own note. `ifconfig` and `ipconfig` are different
 * programs on different systems; so are `traceroute` and `tracert`, `clear` and
 * `cls`, `nslookup` and `dig`. Wiring them together as aliases is convenient and
 * teaches something false. They are kept apart, and typing the wrong one gives
 * you the real error plus the real equivalent.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { REGISTRY, COMMAND_NAMES } from '../../../src/core/shell/registry.js';
import { runLine } from '../../../src/core/shell/run.js';
import { createSession } from '../../../src/core/shell/session.js';
import { createSeed } from '../../../src/core/world/seed.js';
import { HOST } from '../../../src/content/world/contract.js';
import {
  LEVELS, REAL, SIMPLIFIED, LOCAL,
  REAL_TOOL_NAMES, CROSS_OS_HINTS
} from '../../../src/core/shell/authenticity.js';

const commands = Object.values(REGISTRY);

const say = (line) =>
  runLine(line, { registry: REGISTRY, world: createSeed(), session: createSession(HOST.PC_IT.id), ctx: {} })
    .output.map((entry) => entry.text)
    .join('\n');

describe('every command declares what it is', () => {
  test('each one has a level from the list', () => {
    for (const command of commands) {
      assert.ok(
        LEVELS.includes(command.authenticity),
        `${command.name}: authenticity is "${command.authenticity}" — must be one of ${LEVELS.join(', ')}`
      );
    }
  });

  test('anything not exactly real explains how it differs', () => {
    for (const command of commands) {
      if (command.authenticity === REAL) continue;
      assert.ok(
        typeof command.realWorld === 'string' && command.realWorld.length >= 40,
        `${command.name} is ${command.authenticity} and must say what the real thing does differently`
      );
    }
  });

  test('a command marked real claims no exceptions', () => {
    for (const command of commands) {
      if (command.authenticity !== REAL) continue;
      assert.equal(
        command.realWorld,
        undefined,
        `${command.name} is marked real but carries a realWorld note — mark it simplified instead`
      );
    }
  });
});

describe('nothing invented wears a real tool’s name', () => {
  test('no site tool squats on the name of a real program', () => {
    for (const command of commands) {
      if (command.authenticity !== LOCAL) continue;
      assert.equal(
        REAL_TOOL_NAMES.has(command.name),
        false,
        `"${command.name}" is a real tool's name but is implemented as a site tool. ` +
          'Rename it, or implement the real behaviour. This is exactly the mistake that ' +
          'makes a player unlearn things later.'
      );
    }
  });

  test('no alias squats on a real tool’s name either', () => {
    for (const command of commands) {
      for (const alias of command.aliases || []) {
        if (!REAL_TOOL_NAMES.has(alias)) continue;
        assert.notEqual(
          command.authenticity,
          LOCAL,
          `"${alias}" is a real tool's name aliased onto the site tool "${command.name}"`
        );
      }
    }
  });

  test('a site tool says outright that it is not real, and names the real thing', () => {
    for (const command of commands) {
      if (command.authenticity !== LOCAL) continue;
      assert.match(
        command.realWorld,
        /real|no standard|does not exist|not a command/i,
        `${command.name}: its note should say plainly that it is not a real tool`
      );
    }
  });
});

describe('operating systems are not blurred together', () => {
  // ifconfig/ipconfig, traceroute/tracert, clear/cls, nslookup/dig: pairs that
  // are routinely treated as the same command and are not.
  const FORBIDDEN_PAIRS = [
    ['ifconfig', 'ipconfig'],
    ['traceroute', 'tracert'],
    ['clear', 'cls'],
    ['nslookup', 'dig'],
    ['ls', 'dir'],
    ['cat', 'type'],
    ['grep', 'findstr']
  ];

  test('no command aliases one of these pairs onto the other', () => {
    for (const command of commands) {
      const names = [command.name, ...(command.aliases || [])];
      for (const [a, b] of FORBIDDEN_PAIRS) {
        assert.equal(
          names.includes(a) && names.includes(b),
          false,
          `"${a}" and "${b}" are different programs and must not be the same command`
        );
      }
    }
  });

  test('a Windows command name is genuinely not found', () => {
    for (const name of Object.keys(CROSS_OS_HINTS)) {
      assert.equal(REGISTRY[name], undefined, `${name} should not exist on a Linux machine`);
    }
  });

  test('and failing, it says what to use instead', () => {
    const text = say('ipconfig');
    assert.match(text, /command not found/);
    assert.match(text, /Windows/);
    assert.match(text, /ip addr/);
  });

  test('tracert points at traceroute', () => {
    assert.match(say('tracert 10.20.10.10'), /traceroute/);
  });

  test('cls points at clear', () => {
    assert.match(say('cls'), /clear/);
  });

  test('nslookup and dig are separate commands with different output', () => {
    assert.notEqual(REGISTRY.nslookup, REGISTRY.dig);

    const viaNslookup = say('nslookup dc01');
    const viaDig = say('dig dc01');

    assert.match(viaNslookup, /^Server:/m);
    assert.match(viaDig, /ANSWER SECTION/);
    assert.notEqual(viaNslookup, viaDig);
  });
});

describe('the marking is visible in the terminal, not just in the source', () => {
  test('man prints a banner for a simplified tool, naming what is missing', () => {
    const text = say('man nmap');
    assert.match(text, /SIMPLIFIED/);
    assert.match(text, /scan types|options|NSE/i);
  });

  test('man prints a stronger banner for a site tool', () => {
    const text = say('man console');
    assert.match(text, /SITE TOOL/);
    assert.match(text, /not a real command/i);
    assert.match(text, /ipmitool|conserver|KVM/);
  });

  test('man prints no banner at all for a real tool', () => {
    const text = say('man arp');
    assert.ok(!text.includes('SIMPLIFIED'), 'arp is real and should carry no caveat');
    assert.ok(!text.includes('SITE TOOL'));
  });

  test('help carries the legend and tags the commands', () => {
    const text = say('help');
    assert.match(text, /\(simplified\)/);
    assert.match(text, /\(site tool\)/);
    assert.match(text, /a real tool, behaving as it really does/);
  });

  test('every simplified and site tool is tagged in help', () => {
    const text = say('help');
    for (const command of commands) {
      if (command.authenticity === REAL) continue;
      const row = text.split('\n').find((entry) => entry.trim().startsWith(command.name));
      assert.ok(row, `${command.name} is missing from help`);
      assert.match(row, /\((simplified|site tool)\)/, `${command.name} is untagged in help`);
    }
  });
});

describe('the toolkit’s own claims hold up', () => {
  test('the directory tool is samba-tool, with its real subcommands', () => {
    assert.ok(REGISTRY['samba-tool'], 'samba-tool is missing');
    assert.equal(REGISTRY.ldap, undefined, 'there is no "ldap" binary; it must not be a command');

    // The real spellings, in the real order.
    assert.match(say('samba-tool user list'), /dokafor/);
    assert.match(say('samba-tool user show rsingh'), /sAMAccountName: rsingh/);
  });

  test('samba-tool show reports the real userAccountControl values', () => {
    assert.match(say('samba-tool user show rsingh'), /userAccountControl: 512/);
    assert.match(say('samba-tool user show jhale'), /userAccountControl: 514/);
  });

  test('ifconfig does not invent a gateway field', () => {
    // A gateway is a route, not a property of an interface. Real ifconfig has
    // never printed one, and printing one here would teach a wrong mental model.
    const text = say('ifconfig');
    assert.ok(!/gateway/i.test(text), 'ifconfig must not print a gateway');
    assert.match(text, /netmask/);
    assert.match(text, /ether/);
  });

  test('route prints this machine’s routing table, not a directory of the site', () => {
    const text = say('route');
    assert.match(text, /Kernel IP routing table/);
    assert.match(text, /Destination\s+Gateway\s+Genmask/);
    assert.ok(!/VLAN/i.test(text), 'route must not print VLAN numbers — that is documentation, not a route');
  });

  test('ip link set says nothing when it works, as the real one does', () => {
    const result = runLine(`ip link set eth0 down`, {
      registry: REGISTRY,
      world: createSeed(),
      session: createSession(HOST.PC_IT.id),
      ctx: {}
    });
    const printed = result.output.filter((entry) => entry.stream !== 'echo');
    assert.deepEqual(printed, [], 'real ip is silent on success');
    assert.equal(result.events.length, 1, 'it should still have done the thing');
  });

  test('ping is honest about the one thing it changed', () => {
    assert.match(say('man ping'), /Ctrl-C|interrupt/);
  });
});
