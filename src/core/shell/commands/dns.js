/**
 * The name tools.
 *
 * `nslookup` and `dig` are two different programs, not one with two spellings.
 * They ask the same question and present the answer completely differently, and
 * wiring them together as aliases — which this used to do — would teach that they
 * are interchangeable. They are not: a player who learns `dig` output here and
 * runs `nslookup` on a real box should be surprised, and should know why.
 *
 * `nsupdate` keeps its real name because it does the real job, but the real one
 * reads a script on standard input and this takes arguments. That is marked.
 */

import { createEvent } from '../../world/events.js';
import { resolveDns } from '../../world/select.js';
import { getIn } from '../../immutable.js';
import { hashString } from '../../rng.js';
import { REAL, SIMPLIFIED } from '../authenticity.js';
import { resolveTarget } from './resolve.js';

const DNS_TYPES = ['A', 'CNAME', 'MX', 'TXT', 'PTR', 'SRV', 'NS'];

/** The domain controller answers for the zone; that is who "Server:" is. */
function resolverOf(world) {
  const records = getIn(world, ['net', 'dns', 'records'], []);
  const zone = (world.meta && world.meta.zone) || '';
  const dc = records.find((record) => record.type === 'A' && record.name === `dc01.${zone}`);
  return dc ? { address: dc.value, name: dc.name } : { address: '127.0.0.53', name: 'localhost' };
}

function qualify(world, name) {
  const zone = (world.meta && world.meta.zone) || '';
  return name.includes('.') ? name : `${name}.${zone}`;
}

/* -------------------------------------------------------------- nslookup -- */

export const nslookup = {
  name: 'nslookup',
  authenticity: REAL,
  summary: 'Look up a name, the friendly way.',
  usage: 'nslookup [-type=A|CNAME|MX|TXT] <name>',
  manual: [
    'nslookup asks the DNS server directly instead of trusting whatever the',
    'browser happens to have cached.',
    '',
    'It prints two addresses and they are different things. "Server" is who',
    'answered. "Address", below the name, is the answer. When a name resolves for',
    'one person and not another, it is almost always because they asked different',
    'servers — so the first one is not decoration.',
    '',
    'A CNAME is shown as the chain it really is: the alias, the name it points at,',
    'and then the address — or the point at which that chain stops working.',
    '',
    'nslookup exists on Windows and Linux alike. dig does not exist on Windows by',
    'default, which is the usual reason to reach for this one.'
  ],
  flags: { type: { long: 'type', short: 'type', value: true, default: 'A' } },

  run({ positional, flags, world }) {
    if (positional.length === 0) {
      return { stderr: ['usage: nslookup [-type=A|CNAME|MX|TXT] <name>'], exit: 1 };
    }

    const type = String(flags.type).toUpperCase();
    if (!DNS_TYPES.includes(type)) {
      return { stderr: [`unknown query type: ${flags.type}`], exit: 1 };
    }

    const server = resolverOf(world);
    const head = [`Server:\t\t${server.address}`, `Address:\t${server.address}#53`, ''];
    const query = qualify(world, positional[0]);

    if (type !== 'A') {
      const record = resolveDns(world, query, type);
      return record
        ? { stdout: [...head, `${record.name}\t${type.toLowerCase()} = ${record.value}`], exit: 0 }
        : { stdout: [...head, `** server can't find ${query}: NXDOMAIN`], exit: 1 };
    }

    const resolved = resolveTarget(world, query);
    if (resolved.chain.length === 0 && !resolved.address) {
      return { stdout: [...head, `** server can't find ${query}: NXDOMAIN`], exit: 1 };
    }

    const lines = [...head];
    for (const hop of resolved.chain) {
      if (hop.type === 'CNAME') {
        lines.push(`${hop.name}\tcanonical name = ${hop.value}.`);
      } else {
        lines.push(`Name:\t${hop.name}`, `Address: ${hop.value}`);
      }
    }

    if (resolved.dangling) {
      lines.push(`** server can't find ${resolved.dangling}: NXDOMAIN`);
      if (resolved.chain.length > 0) {
        lines.push('', '(the alias resolves; the name it points at does not)');
      }
      return { stdout: lines, exit: 1 };
    }

    return { stdout: lines, exit: 0 };
  }
};

/* ------------------------------------------------------------------- dig -- */

export const dig = {
  name: 'dig',
  authenticity: SIMPLIFIED,
  realWorld:
    'Real dig prints a fuller header, an authority and additional section, EDNS details and the query ' +
    'time, and supports many more options than +short. The sections shown here, their layout and the ' +
    'meaning of the status field are the real ones.',
  summary: 'Look up a name, the detailed way.',
  usage: 'dig [+short] <name> [A|CNAME|MX|TXT]',
  manual: [
    'dig asks the same question as nslookup and shows far more of the answer.',
    '',
    '  dig app01.meridian.local            the full response',
    '  dig +short app01.meridian.local     just the answer, for scripts',
    '  dig intranet.meridian.local CNAME   one record type',
    '',
    'Read the status in the header. NOERROR with an empty answer section means the',
    'name exists and has no record of that type — which is a different fault from',
    'NXDOMAIN, where the name does not exist at all. nslookup blurs those two',
    'together and dig does not, which is the main reason to prefer it.',
    '',
    'dig is not installed on Windows by default. Use nslookup there.'
  ],
  flags: { short: { long: 'short' } },

  run({ positional, flags, argv, world }) {
    // dig takes +short rather than --short; accept the real spelling too.
    const plusShort = argv.includes('+short') || flags.short;
    const args = positional.filter((token) => !token.startsWith('+'));

    if (args.length === 0) {
      return { stderr: ['usage: dig [+short] <name> [type]'], exit: 1 };
    }

    const query = qualify(world, args[0]);
    const type = (args[1] || 'A').toUpperCase();

    if (!DNS_TYPES.includes(type)) {
      return { stderr: [`dig: unknown query type "${args[1]}"`], exit: 1 };
    }

    const server = resolverOf(world);
    // The query id must be stable for a given name: a random one would make the
    // same lookup print differently twice, and nothing here is allowed to do that.
    const id = hashString(`${query}/${type}`) % 65536;

    const direct = resolveDns(world, query, type);
    const resolved = type === 'A' ? resolveTarget(world, query) : null;
    const answers = [];

    if (type === 'A' && resolved) {
      for (const hop of resolved.chain) {
        answers.push(`${hop.name}.\t${hop.type === 'CNAME' ? 300 : 3600}\tIN\t${hop.type}\t${hop.value}${hop.type === 'CNAME' ? '.' : ''}`);
      }
    } else if (direct) {
      answers.push(`${direct.name}.\t${direct.ttl || 3600}\tIN\t${type}\t${direct.value}`);
    }

    const failed = type === 'A' ? Boolean(resolved && resolved.dangling) : !direct;
    const status = answers.length === 0 ? 'NXDOMAIN' : failed ? 'NXDOMAIN' : 'NOERROR';

    if (plusShort) {
      const values = answers.map((row) => row.split('\t').pop());
      return { stdout: values.length > 0 ? values : [], exit: failed || answers.length === 0 ? 1 : 0 };
    }

    return {
      stdout: [
        `; <<>> DiG 9.18.24 <<>> ${args.join(' ')}`,
        ';; global options: +cmd',
        ';; Got answer:',
        `;; ->>HEADER<<- opcode: QUERY, status: ${status}, id: ${id}`,
        `;; flags: qr aa rd ra; QUERY: 1, ANSWER: ${answers.length}, AUTHORITY: 0, ADDITIONAL: 0`,
        '',
        ';; QUESTION SECTION:',
        `;${query}.\t\t\tIN\t${type}`,
        '',
        ...(answers.length > 0 ? [';; ANSWER SECTION:', ...answers, ''] : []),
        `;; SERVER: ${server.address}#53(${server.address})`,
        `;; MSG SIZE  rcvd: ${60 + answers.length * 16}`
      ],
      exit: status === 'NOERROR' ? 0 : 1
    };
  }
};

/* -------------------------------------------------------------- nsupdate -- */

export const nsupdate = {
  name: 'nsupdate',
  authenticity: SIMPLIFIED,
  realWorld:
    'The real nsupdate is interactive: you run it, then type "server", "update add name ttl class type ' +
    'data" and "send". This one takes the same operation as arguments on one line. The operations, the ' +
    'record types and what is and is not a legal record are the real ones.',
  summary: 'Add or remove a record in the local zone.',
  usage: 'nsupdate add <name> <type> <value> | nsupdate delete <name> <type>',
  manual: [
    'nsupdate changes the zone.',
    '',
    '  nsupdate add app01.meridian.local A 10.20.10.30',
    '  nsupdate add intranet.meridian.local CNAME app01.meridian.local',
    '  nsupdate delete old.meridian.local A',
    '',
    'An A record holds an address. A CNAME holds another name, which then has to',
    'resolve in turn — so pointing an alias straight at an address will be refused.',
    'It looks like it would work, and it is how a zone ends up with two records to',
    'remember instead of one.',
    '',
    'The real nsupdate reads a script on standard input and sends it as one atomic',
    'update. Everything about what makes a legal record is the same.'
  ],

  run({ positional, world }) {
    const [action, rawName, rawType, value] = positional;

    if (!action) {
      return { stderr: ['nsupdate: nothing to do', `usage: ${nsupdate.usage}`], exit: 2 };
    }

    if (action !== 'add' && action !== 'delete') {
      return { stderr: [`nsupdate: unknown operation "${action}" — expected add or delete`], exit: 2 };
    }

    if (!rawName || !rawType) {
      return {
        stderr: [`nsupdate ${action}: need a name and a record type`, `usage: nsupdate ${action} <name> <type>${action === 'add' ? ' <value>' : ''}`],
        exit: 2
      };
    }

    const name = qualify(world, rawName);
    const type = String(rawType).toUpperCase();

    if (!DNS_TYPES.includes(type)) {
      return { stderr: [`nsupdate: "${rawType}" is not a record type`, `known types: ${DNS_TYPES.join(', ')}`], exit: 2 };
    }

    if (action === 'delete') {
      if (!resolveDns(world, name, type)) {
        return { stderr: [`nsupdate: no ${type} record for ${name}`], exit: 1 };
      }
      return {
        stdout: [`deleted ${type} ${name}`],
        events: [createEvent('net/dns-record-remove', { name, type })],
        exit: 0
      };
    }

    if (!value) {
      return { stderr: ['nsupdate add: need a value', 'usage: nsupdate add <name> <type> <value>'], exit: 2 };
    }

    const looksLikeAddress = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value);

    if (type === 'A' && !looksLikeAddress) {
      return { stderr: [`nsupdate: an A record holds an address, and "${value}" is not one.`, 'Did you mean CNAME?'], exit: 2 };
    }

    if (type === 'CNAME' && looksLikeAddress) {
      return {
        stderr: [
          'nsupdate: a CNAME holds a name, not an address.',
          'Point the alias at the host name and give that name an A record instead —',
          'otherwise renumbering the host means remembering two records, not one.'
        ],
        exit: 2
      };
    }

    if (type === 'A') {
      const owner = Object.values(world.net.devices).find((device) =>
        Object.values(device.interfaces || {}).some((iface) => iface.ip === value)
      );
      if (!owner) {
        return { stderr: [`nsupdate: no machine on this network has the address ${value}.`], exit: 1 };
      }
    }

    return {
      stdout: [`added ${type} ${name} -> ${value}`],
      events: [createEvent('net/dns-record-set', { name, type, value })],
      exit: 0
    };
  }
};

export const DNS_COMMANDS = [nslookup, dig, nsupdate];
