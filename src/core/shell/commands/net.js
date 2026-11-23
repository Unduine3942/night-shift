/**
 * The network tools.
 *
 * Output here is modelled on what the real tools actually print on Linux, down to
 * the wording of the failures, because that wording IS the lesson. "Request timed
 * out" and "Destination Host Unreachable" mean different things on a real
 * network; a player who learns the difference here has learned something that
 * transfers, and one who learns a made-up version has learned something they will
 * have to unlearn.
 *
 * Note what is deliberately NOT here: `ipconfig` and `tracert` are not aliases for
 * their Linux counterparts, because they are different commands on a different
 * operating system. Typing them fails, exactly as it would on a real Linux box,
 * and then says what to type instead.
 */

import { createEvent } from '../../world/events.js';
import { selectDevice, selectInterfaces, selectSubnetForIp } from '../../world/select.js';
import { parseCidr } from '../../net/cidr.js';
import { currentHost, isRemote, pushHost, popHost } from '../session.js';
import { REAL, SIMPLIFIED, LOCAL } from '../authenticity.js';
import {
  pathBetween, hopsBetween, hostStatus, findHost,
  POWERED_OFF, IFACE_DOWN, NO_ADDRESS, NO_SUCH_HOST, GATEWAY_DOWN, NO_GATEWAY
} from '../reach.js';
import { resolveTarget } from './resolve.js';

const pad = (value, width) => String(value).padEnd(width);

// macFor now lives in core/net/mac.js, because ifconfig, ip, arp and the
// missions all need the same answer. Re-exported so nothing that imported it
// from here has to change.
export { macFor } from '../../net/mac.js';
import { macFor } from '../../net/mac.js';

function broadcastOf(ip, prefix) {
  return parseCidr(`${ip}/${prefix}`).broadcast;
}

/* ------------------------------------------------------------------ ping -- */

export const ping = {
  name: 'ping',
  authenticity: SIMPLIFIED,
  realWorld:
    'Real ping keeps sending until you interrupt it with Ctrl-C. There is no interrupt here, so this ' +
    'one always stops after -c packets, defaulting to 4. Everything else — the reply lines, the ' +
    'statistics, and the difference between a timeout and an unreachable — matches.',
  summary: 'Send ICMP echo requests to a host.',
  usage: 'ping [-c count] <host>',
  manual: [
    'ping sends an ICMP echo request and waits for a reply.',
    '',
    'A reply proves the whole path works in both directions. Silence proves almost',
    'nothing on its own — the host may be off, its interface may be down, a router',
    'may be missing, or a firewall may be discarding the request.',
    '',
    'Read the wording, because the two failures are not the same thing:',
    '',
    '  100% packet loss and nothing else    nothing came back. Cause unknown.',
    '  Destination Host Unreachable         a router told you it could not get',
    '                                       there. That is a real answer, and a',
    '                                       much more useful one.'
  ],
  flags: { count: { short: 'c', value: true, default: '4' } },

  run({ positional, flags, world, session }) {
    if (positional.length === 0) {
      return { stderr: ['ping: usage error: Destination address required'], exit: 2 };
    }

    const target = positional[0];
    const found = resolveTarget(world, target);

    if (!found.device && !found.address) {
      return { stderr: [`ping: ${target}: Name or service not known`], exit: 2 };
    }

    const count = Math.max(1, Math.min(10, Number(flags.count) || 4));
    const path = found.device
      ? pathBetween(world, currentHost(session), found.device.id)
      : { ok: false, reason: NO_SUCH_HOST };
    const address = found.address || path.targetIp || target;
    const header = `PING ${target} (${address}) 56(84) bytes of data.`;
    const stats = (received) => [
      '',
      `--- ${target} ping statistics ---`,
      `${count} packets transmitted, ${received} received, ${Math.round(((count - received) / count) * 100)}% packet loss, time ${count * 1000}ms`
    ];

    if (!path.ok) {
      const unreachable = path.reason === GATEWAY_DOWN || path.reason === NO_GATEWAY;
      const body = [];

      if (unreachable) {
        // A router answering "I cannot get there" is a different message from silence.
        const from = path.via || address;
        for (let seq = 1; seq <= count; seq++) {
          body.push(`From ${from} icmp_seq=${seq} Destination Host Unreachable`);
        }
      }

      return { stdout: [header, ...body, ...stats(0)], exit: 1 };
    }

    // Latency is a function of the hop count, not a random number: the world is
    // deterministic, and a made-up millisecond would be the first crack in that.
    const time = path.sameSubnet ? '0.412' : '1.834';
    const ttl = path.sameSubnet ? 64 : 63;
    const replies = [];
    for (let seq = 1; seq <= count; seq++) {
      replies.push(`64 bytes from ${address}: icmp_seq=${seq} ttl=${ttl} time=${time} ms`);
    }

    return {
      stdout: [
        header,
        ...replies,
        ...stats(count),
        `rtt min/avg/max/mdev = ${time}/${time}/${time}/0.000 ms`
      ],
      exit: 0
    };
  }
};

/* -------------------------------------------------------------- ifconfig -- */

export const ifconfig = {
  name: 'ifconfig',
  authenticity: REAL,
  summary: 'Show this machine’s network interfaces (the older tool).',
  usage: 'ifconfig',
  manual: [
    'ifconfig reports the interfaces on the machine you are on: their addresses,',
    'their masks, and their flags.',
    '',
    'Read the flags, not just the address. An interface with an address and',
    'without UP in its flags is configured and switched off, which looks fine in a',
    'screenshot and does not work.',
    '',
    'ifconfig is the older tool and is missing from many modern systems. It also',
    'cannot change anything. "ip" replaces it and can — prefer ip when you have it.',
    '',
    'Note that there is no gateway here. A gateway is a route, not a property of',
    'an interface, and you will find it with "ip route" or "route -n".'
  ],

  run({ world, session }) {
    const deviceId = currentHost(session);
    const lines = [];

    for (const iface of selectInterfaces(world, deviceId)) {
      const flags = iface.up ? '4163<UP,BROADCAST,RUNNING,MULTICAST>' : '4098<BROADCAST,MULTICAST>';
      lines.push(`${iface.name}: flags=${flags}  mtu 1500`);
      if (iface.ip) {
        const block = parseCidr(`${iface.ip}/${iface.prefix}`);
        lines.push(`        inet ${iface.ip}  netmask ${block.mask}  broadcast ${block.broadcast}`);
      }
      lines.push(`        ether ${macFor(deviceId, iface.name)}  txqueuelen 1000  (Ethernet)`);
      lines.push('');
    }

    return { stdout: lines.length > 0 ? lines : ['(no interfaces)'], exit: 0 };
  }
};

/* -------------------------------------------------------------------- ip -- */

function ipAddrLines(world, deviceId) {
  const lines = ['1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000', '    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00', '    inet 127.0.0.1/8 scope host lo'];
  let index = 1;

  for (const iface of selectInterfaces(world, deviceId)) {
    index++;
    const flags = iface.up ? '<BROADCAST,MULTICAST,UP,LOWER_UP>' : '<BROADCAST,MULTICAST>';
    lines.push(`${index}: ${iface.name}: ${flags} mtu 1500 qdisc fq_codel state ${iface.up ? 'UP' : 'DOWN'} group default qlen 1000`);
    lines.push(`    link/ether ${macFor(deviceId, iface.name)} brd ff:ff:ff:ff:ff:ff`);
    if (iface.ip) {
      lines.push(`    inet ${iface.ip}/${iface.prefix} brd ${broadcastOf(iface.ip, iface.prefix)} scope global ${iface.name}`);
    }
  }
  return lines;
}

function ipLinkLines(world, deviceId) {
  const lines = ['1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN mode DEFAULT group default qlen 1000', '    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00'];
  let index = 1;

  for (const iface of selectInterfaces(world, deviceId)) {
    index++;
    const flags = iface.up ? '<BROADCAST,MULTICAST,UP,LOWER_UP>' : '<BROADCAST,MULTICAST>';
    lines.push(`${index}: ${iface.name}: ${flags} mtu 1500 qdisc fq_codel state ${iface.up ? 'UP' : 'DOWN'} mode DEFAULT group default qlen 1000`);
    lines.push(`    link/ether ${macFor(deviceId, iface.name)} brd ff:ff:ff:ff:ff:ff`);
  }
  return lines;
}

function ipRouteLines(world, deviceId) {
  const lines = [];
  for (const iface of selectInterfaces(world, deviceId)) {
    if (!iface.up || !iface.ip) continue;
    const subnet = selectSubnetForIp(world, iface.ip);
    if (!subnet) continue;
    if (subnet.gateway && subnet.gateway !== iface.ip) {
      lines.push(`default via ${subnet.gateway} dev ${iface.name} proto dhcp src ${iface.ip} metric 100`);
    }
    lines.push(`${parseCidr(subnet.cidr).network}/${parseCidr(subnet.cidr).prefix} dev ${iface.name} proto kernel scope link src ${iface.ip} metric 100`);
  }
  return lines.length > 0 ? lines : ['(no routes)'];
}

export const ip = {
  name: 'ip',
  authenticity: SIMPLIFIED,
  realWorld:
    'The real ip has many more objects and options — neigh, rule, netns, addresses with lifetimes, and ' +
    'so on. This one supports addr, link and route, which is most of what the job needs. The syntax ' +
    'and the output format are the real ones.',
  summary: 'Show and change addresses, interfaces and routes.',
  usage: 'ip addr | ip link show | ip link set <iface> up|down | ip route',
  manual: [
    'ip is the tool that replaced ifconfig and route, and unlike ifconfig it can',
    'change things.',
    '',
    '  ip addr                    addresses on every interface',
    '  ip link show               interfaces and whether they are up',
    '  ip link set eth0 up        bring an interface up',
    '  ip link set eth0 down      take it down',
    '  ip route                   where traffic goes, including the default route',
    '',
    'It acts on the machine you are currently on. Check the prompt before running',
    'the form of this command that changes something.',
    '',
    'When "ip link set" works it prints nothing at all — that is the real',
    'behaviour, not a bug. Confirm it with "ip link show".'
  ],

  run({ positional, world, session }) {
    const deviceId = currentHost(session);
    const [object, action, ifaceName, state] = positional;

    // Real ip needs an object and says so. Quietly defaulting to `addr` taught
    // that `ip` alone means `ip addr`, which is wrong everywhere else.
    if (!object) {
      return {
        stderr: [
          'Usage: ip [ OPTIONS ] OBJECT { COMMAND | help }',
          'where  OBJECT := { addr | link | route }'
        ],
        exit: 255
      };
    }

    if (object === 'addr' || object === 'a' || object === 'address') {
      return { stdout: ipAddrLines(world, deviceId), exit: 0 };
    }

    if (object === 'route' || object === 'r') {
      return { stdout: ipRouteLines(world, deviceId), exit: 0 };
    }

    if (object !== 'link' && object !== 'l') {
      return { stderr: [`Object "${object}" is unknown, try "ip help".`], exit: 1 };
    }

    if (!action || action === 'show' || action === 'list') {
      return { stdout: ipLinkLines(world, deviceId), exit: 0 };
    }

    if (action !== 'set') {
      return { stderr: [`Command "${action}" is unknown, try "ip link help".`], exit: 1 };
    }

    if (!ifaceName || !state) {
      return { stderr: ['Not enough information: "dev" argument is required.'], exit: 1 };
    }

    const iface = selectInterfaces(world, deviceId).find((entry) => entry.name === ifaceName);
    if (!iface) {
      return { stderr: [`Cannot find device "${ifaceName}"`], exit: 1 };
    }

    if (state !== 'up' && state !== 'down') {
      return { stderr: [`Error: argument "${state}" is wrong: Unknown state`], exit: 1 };
    }

    const wanted = state === 'up';
    if (iface.up === wanted) return { stdout: [], exit: 0 };

    // Real ip says nothing on success. Keeping that means the player has to
    // verify, which is the habit worth building.
    return {
      stdout: [],
      events: [createEvent('net/iface-state', { deviceId, iface: ifaceName, up: wanted })],
      exit: 0
    };
  }
};

/* ------------------------------------------------------------------- ssh -- */

export const ssh = {
  name: 'ssh',
  authenticity: SIMPLIFIED,
  realWorld:
    'No keys, no known_hosts, no password prompt — you are already trusted on this estate. Real ssh ' +
    'also runs a single command if you give it one, which this does not. Connecting, the prompt ' +
    'changing, and "No route to host" all behave as they really do.',
  summary: 'Log in to another machine over the network.',
  usage: 'ssh <host>',
  manual: [
    'ssh opens a shell on another machine. The prompt changes to show which one.',
    'Type "exit" to come back.',
    '',
    'It needs the network to be working, which is the catch: the machine you most',
    'need to fix is usually the one you cannot reach. When ssh cannot get there,',
    'reach for "console" instead.'
  ],

  run({ positional, world, session }) {
    if (positional.length === 0) return { stderr: ['usage: ssh <host>'], exit: 255 };

    const target = positional[0];
    const found = resolveTarget(world, target);
    if (!found.device) {
      return { stderr: [`ssh: Could not resolve hostname ${target}: Name or service not known`], exit: 255 };
    }

    if (found.device.id === currentHost(session)) {
      return { stderr: [`ssh: you are already logged in to ${found.device.id}`], exit: 1 };
    }

    const path = pathBetween(world, currentHost(session), found.device.id);
    if (!path.ok) {
      return {
        stderr: [
          `ssh: connect to host ${target} port 22: No route to host`,
          '',
          'The machine cannot be reached over the network. If it has power, its',
          'management console does not need the network — try "console".'
        ],
        exit: 255
      };
    }

    return {
      stdout: [
        `Linux ${found.device.id} 6.1.0-18-amd64 x86_64`,
        '',
        `Last login: from ${currentHost(session)}`,
        `${found.device.label}`
      ],
      session: pushHost(session, found.device.id),
      exit: 0
    };
  }
};

/* --------------------------------------------------------------- console -- */

export const consoleCommand = {
  name: 'console',
  authenticity: LOCAL,
  realWorld:
    'There is no standard command called "console". This is Meridian’s wrapper around the console ' +
    'server. In the real world the same job is done by "ipmitool -I lanplus -H <host> sol activate", ' +
    'a conserver client, "virsh console" on a virtual machine, or a vendor KVM in a browser. The ' +
    'concept — out-of-band access that does not use the production network — is entirely real, and is ' +
    'the reason serial consoles still exist.',
  summary: 'Attach to a machine’s management console, network or no network.',
  usage: 'console <host>',
  manual: [
    'console attaches to a managed device over its out-of-band management path —',
    'the serial console, the lights-out card, the KVM. It does not use the',
    'production network, which is the entire reason it exists.',
    '',
    'When a machine has no address, or its interface is down, or somebody has',
    'configured it onto the wrong subnet, ssh cannot reach it and this can. It is',
    'how a device that is off the network gets put back on it.',
    '',
    'It still needs the machine to have power. Nothing reaches a box that is off.'
  ],

  run({ positional, world, session }) {
    if (positional.length === 0) return { stderr: ['usage: console <host>'], exit: 2 };

    const target = positional[0];
    const device = findHost(world, target) || resolveTarget(world, target).device;
    if (!device) return { stderr: [`console: no managed device called ${target}`], exit: 2 };

    if (device.id === currentHost(session)) {
      return { stderr: [`console: you are already on ${device.id}`], exit: 1 };
    }

    const status = hostStatus(world, device.id);
    if (status === POWERED_OFF) {
      return { stderr: [`console: ${device.id} is powered off. The console is up; the machine is not.`], exit: 1 };
    }
    if (status === NO_SUCH_HOST) {
      return { stderr: [`console: no managed device called ${target}`], exit: 2 };
    }

    return {
      stdout: [
        `[connected to console server, port ${device.id}]`,
        `${device.id} (${device.label})`,
        'Out-of-band session. Type "exit" to disconnect.'
      ],
      session: pushHost(session, device.id),
      exit: 0
    };
  }
};

export const exitCommand = {
  name: 'exit',
  aliases: ['logout'],
  authenticity: REAL,
  summary: 'Log out of the machine you are on.',
  usage: 'exit',
  manual: ['Ends the current ssh or console session and returns you to your own workstation.'],

  run({ session }) {
    if (!isRemote(session)) {
      return { stdout: ['You are at your own desk. There is nothing to log out of.'], exit: 0 };
    }
    const host = currentHost(session);
    return { stdout: [`Connection to ${host} closed.`], session: popHost(session), exit: 0 };
  }
};

/* ------------------------------------------------------------------ nmap -- */

/** What a device of each kind plausibly listens on. */
function portsFor(device) {
  switch (device.kind) {
    case 'server':
      return [
        { number: 22, service: 'ssh', version: 'OpenSSH 9.2p1 Debian 2' },
        { number: 443, service: 'https', version: 'nginx 1.24.0' }
      ];
    case 'router':
    case 'firewall':
    case 'switch':
      return [{ number: 22, service: 'ssh', version: 'OpenSSH 9.2p1 Debian 2' }];
    case 'workstation':
      return [{ number: 3389, service: 'ms-wbt-server', version: 'Microsoft Terminal Services' }];
    case 'phone':
      return [{ number: 5060, service: 'sip', version: 'Polycom SIP 5.9' }];
    default:
      return [];
  }
}

export const nmap = {
  name: 'nmap',
  authenticity: SIMPLIFIED,
  realWorld:
    'Real nmap has dozens of scan types, timing templates, NSE scripts and output formats. This one ' +
    'does a default TCP scan and -sV for service versions, against a single host. The command shape, ' +
    'the report layout and what -sV adds are the real ones.',
  summary: 'Scan a host for open ports and the services behind them.',
  usage: 'nmap [-sV] <host>',
  manual: [
    'nmap asks a host which doors are open.',
    '',
    '  nmap <host>       which TCP ports answer',
    '  nmap -sV <host>   and what is listening on each one',
    '',
    'A host that answers ping but refuses the port you want is not a network',
    'problem — the path works and the service does not. Separating those two is',
    'most of what this command is for.',
    '',
    'Scan only what you are responsible for. On the estate you look after that is',
    'ordinary work; anywhere else it is not yours to scan.'
  ],
  flags: { service: { short: 'sV' } },

  run({ positional, flags, world, session }) {
    if (positional.length === 0) {
      return { stderr: ['Nmap: no target specified', 'usage: nmap [-sV] <host>'], exit: 1 };
    }

    const target = positional[0];
    const found = resolveTarget(world, target);
    const banner = 'Starting Nmap 7.94';

    if (!found.device && !found.address) {
      return { stdout: [banner, `Failed to resolve "${target}".`, 'WARNING: No targets were specified, so 0 hosts scanned.'], exit: 1 };
    }

    const path = found.device
      ? pathBetween(world, currentHost(session), found.device.id)
      : { ok: false };
    const address = found.address || path.targetIp || target;

    if (!path.ok) {
      return {
        stdout: [
          banner,
          `Note: Host seems down. If it is really up, but blocking our ping probes, try -Pn`,
          'Nmap done: 1 IP address (0 hosts up) scanned in 3.05 seconds'
        ],
        exit: 0
      };
    }

    const ports = portsFor(found.device);
    const rows = ports.map((port) =>
      flags.service
        ? `${pad(`${port.number}/tcp`, 10)}${pad('open', 7)}${pad(port.service, 16)}${port.version}`
        : `${pad(`${port.number}/tcp`, 10)}${pad('open', 7)}${port.service}`
    );

    return {
      stdout: [
        banner,
        `Nmap scan report for ${target} (${address})`,
        'Host is up (0.0012s latency).',
        `Not shown: ${1000 - ports.length} closed tcp ports (reset)`,
        flags.service
          ? `${pad('PORT', 10)}${pad('STATE', 7)}${pad('SERVICE', 16)}VERSION`
          : `${pad('PORT', 10)}${pad('STATE', 7)}SERVICE`,
        ...rows,
        '',
        'Nmap done: 1 IP address (1 host up) scanned in 0.14 seconds'
      ],
      exit: 0
    };
  }
};

/* ------------------------------------------------------------ traceroute -- */

export const traceroute = {
  name: 'traceroute',
  authenticity: SIMPLIFIED,
  realWorld:
    'Real traceroute sends three probes per hop and prints three times, and has options for the probe ' +
    'protocol and port. This one sends one and prints one. Where the trace stops, and what that means, ' +
    'is the real behaviour.',
  summary: 'Show the routers a packet passes through on the way to a host.',
  usage: 'traceroute <host>',
  manual: [
    'traceroute lists every hop between here and there.',
    '',
    'Its value is in where it stops. A trace that dies at the first router is a',
    'different problem from one that crosses the link to the other site and dies',
    'there, and ping cannot tell you which of those happened.',
    '',
    'A row of asterisks is a hop that did not answer. That is common and not',
    'necessarily a fault — plenty of routers are configured not to reply.'
  ],

  run({ positional, world, session }) {
    if (positional.length === 0) {
      return { stderr: ['Usage: traceroute <host>'], exit: 2 };
    }

    const target = positional[0];
    const found = resolveTarget(world, target);
    if (!found.device) {
      return { stderr: [`traceroute: unknown host ${target}`], exit: 2 };
    }

    const result = hopsBetween(world, currentHost(session), found.device.id);
    const header = `traceroute to ${target} (${found.address || ''}), 30 hops max, 60 byte packets`;

    if (!result.ok) {
      return { stdout: [header, ' 1  * * *', ' 2  * * *', ' 3  * * *'], exit: 0 };
    }

    return {
      stdout: [
        header,
        ...result.hops.map(
          (hop, index) => ` ${String(index + 1).padStart(2)}  ${hop.deviceId} (${hop.ip})  ${index === 0 ? '0.412' : '1.834'} ms`
        )
      ],
      exit: 0
    };
  }
};

/* ----------------------------------------------------------------- route -- */

export const route = {
  name: 'route',
  authenticity: REAL,
  summary: 'Show the kernel routing table of this machine (the older tool).',
  usage: 'route [-n]',
  manual: [
    'route prints this machine’s routing table — where IT sends traffic. It is',
    'not a directory of the company’s networks; for that, open the Codex.',
    '',
    'The line with a destination of 0.0.0.0 is the default route: everything not',
    'matched by a more specific line goes to that gateway. A machine with no',
    'default route can talk to its own network and nowhere else.',
    '',
    '-n skips name lookups and prints addresses, which is what you want when DNS',
    'is the thing you are trying to diagnose.',
    '',
    'Like ifconfig, route is the older tool. "ip route" is its replacement.'
  ],
  flags: { numeric: { short: 'n' } },

  run({ positional, world, session }) {
    // This build reads the table and does not edit it. Printing the table in
    // reply to `route add` would look like the add had worked.
    if (positional.length > 0) {
      return {
        stderr: [
          `route: this machine can show the routing table but not change it (asked for "${positional[0]}").`,
          'usage: route [-n]',
          'On a real machine you would use "ip route add", and the change would last until reboot.'
        ],
        exit: 2
      };
    }

    const deviceId = currentHost(session);
    const rows = [];

    for (const iface of selectInterfaces(world, deviceId)) {
      if (!iface.up || !iface.ip) continue;
      const subnet = selectSubnetForIp(world, iface.ip);
      if (!subnet) continue;

      const block = parseCidr(subnet.cidr);
      if (subnet.gateway && subnet.gateway !== iface.ip) {
        rows.push(`${pad('0.0.0.0', 16)}${pad(subnet.gateway, 16)}${pad('0.0.0.0', 16)}${pad('UG', 6)}${pad(100, 7)}${pad(0, 4)}${pad(0, 4)}${iface.name}`);
      }
      rows.push(`${pad(block.network, 16)}${pad('0.0.0.0', 16)}${pad(block.mask, 16)}${pad('U', 6)}${pad(100, 7)}${pad(0, 4)}${pad(0, 4)}${iface.name}`);
    }

    return {
      stdout: [
        'Kernel IP routing table',
        `${pad('Destination', 16)}${pad('Gateway', 16)}${pad('Genmask', 16)}${pad('Flags', 6)}${pad('Metric', 7)}${pad('Ref', 4)}${pad('Use', 4)}Iface`,
        ...(rows.length > 0 ? rows : ['(no routes)'])
      ],
      exit: 0
    };
  }
};

/* ------------------------------------------------------------------- arp -- */

export const arp = {
  name: 'arp',
  authenticity: REAL,
  summary: 'Show the table of neighbours this machine has resolved.',
  usage: 'arp -a',
  manual: [
    'arp lists the neighbours this machine has resolved to hardware addresses.',
    '',
    'Only ever the local network. Anything further away is reached through the',
    'gateway, so the gateway is the only entry you will see for it — a machine at',
    'another site will never appear here, and its absence is not a fault.',
    '',
    'A neighbour you expected to see and do not means the two have never managed',
    'to talk at all, which puts the fault below the network layer.'
  ],
  flags: { all: { short: 'a' } },

  run({ world, session }) {
    const me = currentHost(session);
    const rows = [];

    for (const iface of selectInterfaces(world, me)) {
      if (!iface.up || !iface.ip) continue;
      const subnet = selectSubnetForIp(world, iface.ip);
      if (!subnet) continue;

      for (const device of Object.values(world.net.devices)) {
        if (device.id === me || !device.powered) continue;
        for (const other of selectInterfaces(world, device.id)) {
          if (!other.up || !other.ip) continue;
          if (selectSubnetForIp(world, other.ip) !== subnet) continue;
          rows.push(`${device.id} (${other.ip}) at ${macFor(device.id, other.name)} [ether] on ${iface.name}`);
        }
      }
    }

    return { stdout: rows.length > 0 ? rows : [], exit: 0 };
  }
};

export const NET_COMMANDS = [ping, ifconfig, ip, ssh, consoleCommand, exitCommand, nmap, traceroute, route, arp];
