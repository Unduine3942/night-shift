/**
 * The terminal, driven against the real Meridian world.
 *
 * These are the tests that keep the promise the whole design rests on: every tool
 * reads the same world through the same selectors, so `ping`, `nslookup`, `nmap`
 * and the Codex cannot end up telling you different things about the same host.
 *
 * They also pin the OUTPUT FORMAT, not just the facts. A tool that prints
 * something the real tool never prints is teaching a fiction, and the fiction is
 * only discovered later, on a real machine, by someone who trusted this. See
 * authenticity.test.js for the rule; this file is where the wording gets held to
 * it in practice.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { REGISTRY, SIMULATED_COMMANDS, COMMAND_BUDGET, COMMAND_NAMES } from '../../../src/core/shell/registry.js';
import { runLine, completePrefix, resolveCommand } from '../../../src/core/shell/run.js';
import { createSession, currentHost, promptOf } from '../../../src/core/shell/session.js';
import { createSeed } from '../../../src/core/world/seed.js';
import { reduceWorld } from '../../../src/core/world/reduce.js';
import { HOST, USER, NET, DNS_RECORD } from '../../../src/content/world/contract.js';

const WORKSTATION = HOST.PC_IT.id;

/** Run a series of lines, threading session and world through as the UI does. */
function shell(lines, startWorld = createSeed()) {
  let session = createSession(WORKSTATION);
  let world = startWorld;
  let events = [];
  let answers = {};
  let output = [];

  for (const line of [].concat(lines)) {
    const result = runLine(line, { registry: REGISTRY, world, session, ctx: {} });
    session = result.session;
    output = result.clear ? [] : [...output, ...result.output];
    events = [...events, ...result.events];
    if (result.answers) answers = { ...answers, ...result.answers };
    world = reduceWorld(world, result.events);
  }

  return { session, world, events, answers, output, text: output.map((entry) => entry.text).join('\n') };
}

const say = (lines, startWorld) => shell(lines, startWorld).text;

/** Just the printed lines, without the echoed prompt. */
const printed = (lines, startWorld) =>
  shell(lines, startWorld).output.filter((entry) => entry.stream !== 'echo').map((entry) => entry.text);

describe('the toolkit is deliberately small', () => {
  test('it stays inside the command budget', () => {
    assert.ok(
      SIMULATED_COMMANDS.length <= COMMAND_BUDGET,
      `${SIMULATED_COMMANDS.length} simulated commands, budget is ${COMMAND_BUDGET}`
    );
  });

  test('every command has a summary, a usage line and a manual', () => {
    for (const name of COMMAND_NAMES) {
      const command = REGISTRY[name];
      assert.ok(command.summary, `${name}: no summary`);
      assert.ok(command.usage, `${name}: no usage`);
      assert.ok(Array.isArray(command.manual) && command.manual.length > 0, `${name}: no manual`);
    }
  });

  test('every command is reachable by its own name', () => {
    for (const name of COMMAND_NAMES) assert.equal(resolveCommand(REGISTRY, name).name, name);
  });

  test('the only aliases are genuine synonyms', () => {
    // logout really is a synonym for exit. ipconfig, tracert, cls and dig are
    // NOT synonyms for anything here — they are other programs, or other systems.
    assert.equal(resolveCommand(REGISTRY, 'logout').name, 'exit');
    assert.equal(resolveCommand(REGISTRY, 'ipconfig'), null);
    assert.equal(resolveCommand(REGISTRY, 'tracert'), null);
    assert.equal(resolveCommand(REGISTRY, 'cls'), null);
  });
});

describe('the shell behaves like a shell', () => {
  test('the prompt names the machine you are on', () => {
    assert.equal(promptOf(createSession(WORKSTATION)), `operator@${WORKSTATION}:~$`);
  });

  test('an unknown command says so and guesses at the typo', () => {
    const text = say('nslokup dc01');
    assert.match(text, /command not found/);
    assert.match(text, /nslookup/);
  });

  test('an empty line does nothing at all', () => {
    assert.deepEqual(printed(['', '   ']), []);
  });

  test('a syntax error is printed, not thrown', () => {
    assert.match(say('ping "dc01'), /unterminated/i);
    assert.match(say('ping dc01 |'), /syntax error/i);
  });

  test('history records what was typed', () => {
    assert.match(say(['ping dc01', 'history']), /1 {2}ping dc01/);
  });

  test('clear empties the screen', () => {
    assert.equal(shell(['ping dc01', 'clear']).output.length, 0);
  });

  test('--help works on every command without being asked for', () => {
    for (const name of COMMAND_NAMES) {
      assert.match(say(`${name} --help`), /usage:/, `${name} --help printed no usage`);
    }
  });

  test('man explains a command', () => {
    assert.match(say('man ping'), /PING —/);
    assert.match(say('man nosuchthing'), /No manual entry/);
  });

  test('help lists the tools', () => {
    const text = say('help');
    for (const name of ['ping', 'nslookup', 'dig', 'samba-tool', 'ssh', 'console']) {
      assert.match(text, new RegExp(`\\b${name}\\b`), `help never mentions ${name}`);
    }
  });

  test('tab completion finds the common prefix', () => {
    assert.equal(completePrefix('nsl', REGISTRY).completed, 'nslookup');
    assert.deepEqual(completePrefix('zzz', REGISTRY).matches, []);
    assert.ok(completePrefix('n', REGISTRY).matches.length > 1);
  });

  test('a command never throws, whatever it is given', () => {
    const nonsense = [
      'ping', 'ping -c', 'nmap -sV', 'samba-tool', 'samba-tool user show',
      'nsupdate add', 'ssh', 'console', 'ip link set', 'dig', 'ip nonsense'
    ];
    for (const line of nonsense) assert.doesNotThrow(() => shell(line), line);
  });
});

describe('ping, in the words real ping uses', () => {
  test('a healthy host replies', () => {
    const text = say(`ping ${HOST.DC01.id}`);
    assert.match(text, /^PING /m);
    assert.match(text, /64 bytes from 10\.20\.10\.10: icmp_seq=1 ttl=\d+ time=/);
    assert.match(text, /0% packet loss/);
    assert.match(text, /rtt min\/avg\/max\/mdev/);
  });

  test('an address works as well as a name', () => {
    assert.match(say(`ping ${HOST.DC01.ip}`), /64 bytes from/);
  });

  test('a DNS name resolves to the same address', () => {
    assert.match(say(`ping ${DNS_RECORD.DC01.name}`), new RegExp(HOST.DC01.ip.replace(/\./g, '\\.')));
  });

  test('a host with its interface down is simply silent', () => {
    const { world } = shell([`console ${HOST.SCAN01.id}`, `ip link set ${HOST.SCAN01.iface} down`, 'exit']);
    const text = say(`ping -c 2 ${HOST.SCAN01.id}`, world);

    assert.match(text, /100% packet loss/);
    assert.ok(!/64 bytes from/.test(text), 'nothing should have come back');
    assert.ok(!/Unreachable/.test(text), 'silence is not the same as being told it is unreachable');
  });

  test('a name that does not resolve fails at the resolver', () => {
    assert.match(say('ping nothing.meridian.local'), /Name or service not known/);
  });

  test('-c controls how many are sent', () => {
    assert.match(say(`ping -c 2 ${HOST.DC01.id}`), /2 packets transmitted, 2 received/);
  });
});

describe('ssh needs the network; console does not', () => {
  test('ssh reaches a healthy host and the prompt follows', () => {
    const result = shell(`ssh ${HOST.DC01.id}`);
    assert.equal(currentHost(result.session), HOST.DC01.id);
    assert.match(promptOf(result.session), new RegExp(`@${HOST.DC01.id}`));
  });

  test('exit comes back, and words it as ssh does', () => {
    const result = shell([`ssh ${HOST.DC01.id}`, 'exit']);
    assert.equal(currentHost(result.session), WORKSTATION);
    assert.match(result.text, /Connection to .* closed\./);
  });

  test('ssh cannot reach a host whose interface is down, and says to use console', () => {
    const { world } = shell([`console ${HOST.SCAN01.id}`, `ip link set ${HOST.SCAN01.iface} down`, 'exit']);
    const text = say(`ssh ${HOST.SCAN01.id}`, world);

    assert.match(text, /No route to host/);
    assert.match(text, /console/);
  });

  test('console reaches the same host anyway — that is what it is for', () => {
    const broken = shell([`console ${HOST.SCAN01.id}`, `ip link set ${HOST.SCAN01.iface} down`, 'exit']);
    const result = shell(`console ${HOST.SCAN01.id}`, broken.world);
    assert.equal(currentHost(result.session), HOST.SCAN01.id);
  });

  test('exit at your own desk is harmless', () => {
    const result = shell('exit');
    assert.equal(currentHost(result.session), WORKSTATION);
    assert.match(result.text, /your own desk/);
  });
});

describe('ip', () => {
  test('taking an interface down emits an event and shows in ip link show', () => {
    const result = shell([`console ${HOST.SCAN01.id}`, `ip link set ${HOST.SCAN01.iface} down`, 'ip link show']);

    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].type, 'net/iface-state');
    assert.match(result.text, /state DOWN/);
  });

  test('bringing it back up fixes the ping', () => {
    const down = shell([`console ${HOST.SCAN01.id}`, `ip link set ${HOST.SCAN01.iface} down`, 'exit']);
    const up = shell([`console ${HOST.SCAN01.id}`, `ip link set ${HOST.SCAN01.iface} up`, 'exit'], down.world);
    assert.match(say(`ping ${HOST.SCAN01.id}`, up.world), /64 bytes from/);
  });

  test('a change that is already in effect does nothing, silently', () => {
    const result = shell([`console ${HOST.SCAN01.id}`, `ip link set ${HOST.SCAN01.iface} up`]);
    assert.deepEqual(result.events, []);
  });

  test('an interface that does not exist is named, the way ip words it', () => {
    assert.match(say('ip link set wlan9 up'), /Cannot find device "wlan9"/);
  });

  test('ip addr shows the address with its prefix', () => {
    assert.match(say('ip addr'), /inet 10\.20\.20\.43\/24 brd 10\.20\.20\.255 scope global eth0/);
  });

  test('ip route shows the default route and the local network', () => {
    const text = say('ip route');
    assert.match(text, /^default via 10\.20\.20\.1 dev eth0/m);
    assert.match(text, /10\.20\.20\.0\/24 dev eth0 proto kernel/);
  });
});

describe('nslookup and dig are different tools', () => {
  test('nslookup reports the answer and who answered', () => {
    const text = say(`nslookup ${DNS_RECORD.DC01.name}`);
    assert.match(text, /^Server:/m);
    assert.match(text, /Address:\t10\.20\.10\.10#53/);
    assert.match(text, /Address: 10\.20\.10\.10/);
  });

  test('a short name is qualified with the local zone', () => {
    assert.match(say('nslookup dc01'), /10\.20\.10\.10/);
  });

  test('a CNAME is shown as the chain it is', () => {
    const text = say(`nslookup ${DNS_RECORD.INTRANET.name}`);
    assert.match(text, /canonical name = app01/);
    assert.match(text, new RegExp(HOST.APP01.ip.replace(/\./g, '\\.')));
  });

  test('a missing name is NXDOMAIN', () => {
    assert.match(say('nslookup nothing.meridian.local'), /NXDOMAIN/);
  });

  test('a dangling alias says which half is broken', () => {
    const { world } = shell(`nsupdate delete ${DNS_RECORD.APP01.name} A`);
    const text = say(`nslookup ${DNS_RECORD.INTRANET.name}`, world);

    assert.match(text, /canonical name/);
    assert.match(text, /NXDOMAIN/);
    assert.match(text, /the alias resolves; the name it points at does not/);
  });

  test('dig prints the sections dig prints, and is not nslookup', () => {
    const text = say('dig dc01');
    assert.match(text, /ANSWER SECTION/);
    assert.match(text, /status: NOERROR/);
    assert.match(text, /IN\tA\t10\.20\.10\.10/);
    assert.notEqual(text, say('nslookup dc01'));
  });

  test('dig +short prints only the answer', () => {
    assert.deepEqual(printed('dig +short dc01'), ['10.20.10.10']);
  });

  test('dig reports NXDOMAIN in its header', () => {
    assert.match(say('dig nothing.meridian.local'), /status: NXDOMAIN/);
  });

  test('the same lookup twice prints the same query id', () => {
    // Nothing in this game may be random, including the parts nobody reads.
    assert.equal(say('dig dc01'), say('dig dc01'));
  });
});

describe('nsupdate', () => {
  test('deleting a record removes it', () => {
    const { world } = shell(`nsupdate delete ${DNS_RECORD.APP01.name} A`);
    assert.match(say(`nslookup ${DNS_RECORD.APP01.name}`, world), /NXDOMAIN/);
  });

  test('adding it back restores it', () => {
    const gone = shell(`nsupdate delete ${DNS_RECORD.APP01.name} A`);
    const back = shell(`nsupdate add ${DNS_RECORD.APP01.name} A ${HOST.APP01.ip}`, gone.world);
    assert.match(say(`nslookup ${DNS_RECORD.INTRANET.name}`, back.world), new RegExp(HOST.APP01.ip.replace(/\./g, '\\.')));
  });

  test('an A record pointing at a name is refused, and suggests CNAME', () => {
    const text = say('nsupdate add thing.meridian.local A app01.meridian.local');
    assert.match(text, /an A record holds an address/);
    assert.match(text, /CNAME/);
  });

  test('a CNAME pointing at an address is refused, with the reason', () => {
    const text = say(`nsupdate add alias.meridian.local CNAME ${HOST.APP01.ip}`);
    assert.match(text, /a CNAME holds a name/);
    assert.match(text, /renumbering/);
  });

  test('an A record for an address no machine has is refused', () => {
    assert.match(say('nsupdate add ghost.meridian.local A 10.20.10.199'), /no machine on this network/);
  });

  test('deleting something that is not there says so', () => {
    assert.match(say('nsupdate delete nothing.meridian.local A'), /no A record/);
  });
});

describe('samba-tool', () => {
  test('user list prints one login per line, as the real one does', () => {
    const lines = printed('samba-tool user list');
    assert.ok(lines.includes(USER.DANA.login));
    assert.ok(lines.includes(USER.JORDAN.login));
    assert.ok(lines.every((row) => !row.includes(' ')), 'list should be bare logins, nothing else');
  });

  test('user show returns LDIF with the real attribute names', () => {
    const text = say(`samba-tool user show ${USER.RAVI.login}`);
    assert.match(text, /^dn: CN=Ravi Singh,CN=Users,DC=meridian,DC=local/m);
    assert.match(text, /sAMAccountName: rsingh/);
    assert.match(text, /memberOf: CN=domain-admins/);
  });

  test('userAccountControl distinguishes enabled from disabled', () => {
    assert.match(say(`samba-tool user show ${USER.DANA.login}`), /userAccountControl: 512/);
    assert.match(say(`samba-tool user show ${USER.JORDAN.login}`), /userAccountControl: 514/);
  });

  test('disable emits the event and words it as samba-tool does', () => {
    const enabled = shell(`samba-tool user enable ${USER.JORDAN.login}`);
    const result = shell(`samba-tool user disable ${USER.JORDAN.login}`, enabled.world);

    assert.equal(result.events[0].type, 'identity/user-set-enabled');
    assert.equal(result.events[0].payload.enabled, false);
    assert.match(result.text, /Disabled user 'jhale'\./);
  });

  test('delete is withheld, and says why', () => {
    const text = say(`samba-tool user delete ${USER.JORDAN.login}`);
    assert.match(text, /not available/);
    assert.match(text, /cannot be undone/);
  });

  test('an unknown account is named in the error', () => {
    assert.match(say('samba-tool user show nobody'), /Unable to find user "nobody"/);
  });

  test('a subcommand with no action lists the ones that exist', () => {
    const text = say('samba-tool user');
    for (const action of ['list', 'show', 'enable', 'disable']) {
      assert.match(text, new RegExp(`\\b${action}\\b`));
    }
  });
});

describe('the lenses agree with each other', () => {
  test('ping, nslookup, dig, nmap and traceroute report the same address for a host', () => {
    const pattern = new RegExp(HOST.APP01.ip.replace(/\./g, '\\.'));

    assert.match(say(`ping ${DNS_RECORD.APP01.name}`), pattern);
    assert.match(say(`nslookup ${DNS_RECORD.APP01.name}`), pattern);
    assert.match(say(`dig ${DNS_RECORD.APP01.name}`), pattern);
    assert.match(say(`nmap ${DNS_RECORD.APP01.name}`), pattern);
    assert.match(say(`traceroute ${HOST.APP01.id}`), pattern);
  });

  test('route shows this machine’s own table, not a directory of the company', () => {
    const text = say('route');
    assert.match(text, /Kernel IP routing table/);
    assert.ok(text.includes(NET.HQ_STAFF.gateway), 'the default gateway should be in the table');
    assert.ok(!text.includes(NET.DEPOT_FLOOR.cidr), 'a remote site is not in this host’s routing table');
  });

  test('ifconfig on a host matches what the contract says it is', () => {
    assert.match(shell([`ssh ${HOST.DC01.id}`, 'ifconfig']).text, new RegExp(HOST.DC01.ip.replace(/\./g, '\\.')));
  });

  test('arp only ever shows neighbours on the same network', () => {
    const text = say('arp -a');
    assert.ok(text.includes(HOST.PC_DISPATCH.ip), 'a neighbour on the staff network is missing');
    assert.ok(!text.includes(HOST.DEPOT01.ip), 'a machine at the other site should not be in the local arp table');
  });

  test('traceroute crosses a router to reach the other site, and not for a neighbour', () => {
    const far = say(`traceroute ${HOST.DEPOT01.id}`).split('\n').filter((row) => /^\s*\d+\s/.test(row));
    const near = say(`traceroute ${HOST.PC_DISPATCH.id}`).split('\n').filter((row) => /^\s*\d+\s/.test(row));

    assert.ok(far.length > near.length, 'the depot should be further away than the desk next door');
    assert.equal(near.length, 1);
  });

  test('nmap -sV adds a version column and nmap alone does not', () => {
    assert.match(say(`nmap -sV ${HOST.APP01.id}`), /VERSION/);
    assert.ok(!say(`nmap ${HOST.APP01.id}`).includes('VERSION'));
  });
});

describe('submit', () => {
  const withTicket = (line, mission) =>
    runLine(line, {
      registry: REGISTRY,
      world: createSeed(),
      session: createSession(WORKSTATION),
      ctx: { mission }
    });

  const text = (result) => result.output.map((entry) => entry.text).join('\n');
  const mission = { id: 'net-003', props: { fields: [{ key: 'address', label: 'The address' }] } };

  test('records field=value pairs', () => {
    const result = withTicket('submit address=10.20.10.10 resolver=10.20.10.10', mission);
    assert.deepEqual(result.answers, { address: '10.20.10.10', resolver: '10.20.10.10' });
  });

  test('refuses an answer that is not field=value, and says the shape', () => {
    const result = withTicket('submit 10.20.10.10', mission);
    assert.equal(result.answers, null);
    assert.match(text(result), /field=value/);
  });

  test('with no ticket open it says so instead of failing silently', () => {
    assert.match(text(withTicket('submit address=1.2.3.4', undefined)), /no ticket is open/);
  });

  test('with no arguments it lists what the ticket wants', () => {
    assert.match(text(withTicket('submit', mission)), /address\s+The address/);
  });
});

describe('pipelines', () => {
  test('output flows from one stage to the next', () => {
    assert.match(shell(['ping dc01', 'ping app01', 'history']).text, /ping app01/);
  });

  test('a failing stage stops the pipeline', () => {
    assert.match(say('nosuchcommand | history'), /command not found/);
  });
});
