/**
 * Walkthroughs for the networking tools.
 *
 * Every line in here is typed into a real session by the test suite and the
 * `look` text must come back, so nothing below can quietly stop being true.
 *
 * The order of the steps is the order of the reasoning, not the order of the
 * options. A tool's own manual tells you what the flags do; what a beginner
 * actually needs is what to type first, what to type next, and what the answer
 * ruled out.
 */

export const NET_TUTORIALS = [
  {
    command: 'ifconfig',
    concepts: ['cli-ipconfig', 'ip-addressing', 'cidr', 'troubleshooting-method'],

    idea:
      'Shows what this machine believes about its own network connection: which interfaces exist, which are ' +
      'running, and what address each one holds. Before you ask whether the network is broken, ask whether ' +
      'this machine has a usable address at all.',

    onTheJob:
      'This is the first command of almost every network call. "The internet is down" is a claim about the ' +
      'whole world; "eth0 has no address" is a fact about one machine, and it takes ten seconds to establish ' +
      'which one you are dealing with.',

    steps: [
      {
        title: 'Ask the machine what it thinks it is',
        line: 'ifconfig',
        look: 'inet 10.20.20.43',
        why:
          'inet is the IPv4 address. 10.20.20.43 is in the HQ staff range, which is what an IT desk machine ' +
          'should have — so this workstation is on the network it belongs to.'
      },
      {
        title: 'Read the flags before the address',
        line: 'ifconfig',
        look: 'UP,BROADCAST,RUNNING,MULTICAST',
        why:
          'UP means the software has enabled the interface. RUNNING means the cable is actually plugged into ' +
          'something. An interface that is UP but not RUNNING is a cable or switch-port problem, and no amount ' +
          'of address configuration will fix it.'
      },
      {
        title: 'Work out the size of the network from the mask',
        line: 'ifconfig',
        look: 'netmask 255.255.255.0',
        why:
          '255.255.255.0 is a /24: the first three octets are the network, the last is the host. So this ' +
          'machine can reach 10.20.20.1 to 10.20.20.254 directly, and everything else has to go via a router.'
      }
    ],

    reading: [
      { part: 'inet', means: 'the IPv4 address this interface holds' },
      { part: 'netmask', means: 'how much of that address is the network, and how much is the host' },
      { part: 'broadcast', means: 'the address that reaches every host on this network at once' },
      { part: 'ether', means: 'the MAC address — the hardware identity used on the local wire' },
      { part: 'mtu 1500', means: 'the largest frame this interface will send in one piece' }
    ],

    mistakes: [
      {
        line: 'ipconfig',
        look: 'command not found',
        why:
          'ipconfig is the Windows command. This is a Linux machine, so it does not exist here. They do a ' +
          'similar job and are not the same tool — mixing them up is the single most common CLI slip there is.'
      }
    ],

    seeAlso: ['ip', 'route', 'ping', 'arp']
  },

  {
    command: 'ip',
    concepts: ['cli-ipconfig', 'ip-addressing', 'cidr', 'routing-basics', 'default-gateway'],

    idea:
      'The modern replacement for ifconfig, route and arp all at once. It is organised by object: "ip addr" ' +
      'for addresses, "ip link" for the interfaces themselves, "ip route" for where traffic goes. It can also ' +
      'change things, not just show them.',

    onTheJob:
      'Any Linux machine built in the last decade has ip and may not have ifconfig at all — the net-tools ' +
      'package that provides the old commands is not installed by default on most distributions now. If you ' +
      'learn one of the two, learn this one.',

    steps: [
      {
        title: 'Addresses, with the prefix written the modern way',
        line: 'ip addr',
        look: 'inet 10.20.20.43/24',
        why:
          'ip writes the mask as /24 rather than 255.255.255.0. Same fact, less counting. Getting fluent at ' +
          'reading prefix lengths directly is worth the small effort.'
      },
      {
        title: 'Notice that loopback is an interface too',
        line: 'ip addr',
        look: '127.0.0.1/8',
        why:
          'lo is the machine talking to itself. If you can ping 127.0.0.1 but nothing else, the network stack ' +
          'is working and the problem is outside the machine — which is a genuinely useful thing to have ruled out.'
      },
      {
        title: 'Find the default gateway',
        line: 'ip route',
        look: 'default via 10.20.20.1',
        why:
          'This is where anything not on 10.20.20.0/24 gets sent. No default route means the machine can talk ' +
          'to its own network and nothing beyond it — which looks exactly like "the internet is down" to the user.'
      },
      {
        title: 'See the route it does not need a gateway for',
        line: 'ip route',
        look: '10.20.20.0/24 dev eth0 proto kernel scope link',
        why:
          '"scope link" means directly attached: these addresses are reachable by shouting on the wire, with no ' +
          'router involved. The kernel adds this route automatically when the interface gets an address.'
      }
    ],

    reading: [
      { part: 'ip addr', means: 'addresses on each interface' },
      { part: 'ip link', means: 'the interfaces themselves, up or down, with their MAC addresses' },
      { part: 'ip route', means: 'the routing table' },
      { part: 'ip link set <iface> up', means: 'bring an interface up — and like most Unix tools, it says nothing when it works' },
      { part: 'proto dhcp', means: 'this route came from a DHCP lease, not from someone typing it' }
    ],

    mistakes: [
      {
        line: 'ip',
        look: 'Usage: ip',
        why:
          'ip on its own does nothing useful — it needs an object. The three worth knowing are addr, link and ' +
          'route, and almost everything else is a variation on those.'
      }
    ],

    seeAlso: ['ifconfig', 'route', 'ping']
  },

  {
    command: 'ping',
    concepts: ['cli-ping', 'troubleshooting-method', 'ip-addressing', 'dns-basics'],

    idea:
      'Sends a small packet to a host and asks it to send one back. It answers exactly one question — can ' +
      'these two machines exchange packets right now — and it is the fastest way to split a vague problem ' +
      'into a reachable half and an unreachable half.',

    onTheJob:
      'Ping in a deliberate order and each result eliminates something: your own address, then your gateway, ' +
      'then a server by address, then the same server by name. The first one that fails tells you where the ' +
      'fault is, and you have not had to guess once.',

    steps: [
      {
        title: 'Reach a server by name',
        line: 'ping -c 2 srv-dc01',
        look: '64 bytes from 10.20.10.10',
        why:
          'Two things just worked at once: the name turned into an address, and packets got there and back. ' +
          'Notice ping printed the address it resolved — always read that line, because a name resolving to ' +
          'the wrong address is a common and confusing fault.'
      },
      {
        title: 'Read the round trip time',
        line: 'ping -c 2 srv-dc01',
        look: 'rtt min/avg/max/mdev',
        why:
          'A millisecond or two is a local network. Tens of milliseconds is a site-to-site link or the ' +
          'internet. A wildly varying max compared to the average points at congestion or a flaky wireless link.'
      },
      {
        title: 'Check the gateway before blaming anything further away',
        line: 'ping -c 1 10.20.20.1',
        look: '0% packet loss',
        why:
          'The gateway is the last thing you own before the packet leaves your network. If this fails, nothing ' +
          'beyond it is worth testing yet — and if it succeeds, the fault is somewhere past it.'
      },
      {
        title: 'See what silence looks like',
        line: 'ping -c 1 10.20.30.9',
        look: '100% packet loss',
        why:
          'Nothing answered. That is NOT the same as "the host is off" — it could be switched off, firewalled, ' +
          'on a different network, or simply not exist. Ping proves reachability when it succeeds; when it ' +
          'fails it only narrows the list.'
      }
    ],

    reading: [
      { part: 'icmp_seq', means: 'the packet number — gaps in the sequence mean packets were lost' },
      { part: 'ttl', means: 'time to live, counting down by one per router. 63 rather than 64 means one hop away' },
      { part: 'time', means: 'the round trip in milliseconds' },
      { part: '0% packet loss', means: 'every packet came back — the path works in both directions' },
      { part: 'Destination Host Unreachable', means: 'a router actively said it cannot get there, which is more informative than silence' }
    ],

    mistakes: [
      {
        line: 'ping srv-nowhere',
        look: 'Name or service not known',
        why:
          'The name did not resolve, so nothing was ever sent. This is a DNS problem, not a reachability ' +
          'problem — reach for nslookup, not for a longer ping.'
      }
    ],

    seeAlso: ['traceroute', 'nslookup', 'arp', 'ip']
  },

  {
    command: 'traceroute',
    concepts: ['cli-tracert', 'routing-basics', 'troubleshooting-method', 'wan-links'],

    idea:
      'Shows every router a packet passes through on the way to a destination. Where ping tells you whether ' +
      'you can get there, traceroute tells you how far you get before it stops working — which is the ' +
      'difference between knowing there is a problem and knowing whose problem it is.',

    onTheJob:
      'When a remote site is unreachable, traceroute tells you whether the packet died on your equipment, on ' +
      'the link between sites, or at the far end. That determines who you ring: your own team, the carrier, ' +
      'or the people at the other site.',

    steps: [
      {
        title: 'Trace the path to the other site',
        line: 'traceroute srv-depot01',
        look: 'traceroute to srv-depot01 (10.40.10.10), 30 hops max',
        why:
          'The header confirms the name resolved and shows the limit: 30 hops. Anything needing more than 30 ' +
          'hops is almost certainly a routing loop rather than a long path.'
      },
      {
        title: 'Read the hops in order',
        line: 'traceroute srv-depot01',
        look: '1  rtr-hq (10.20.20.1)',
        why:
          'Hop 1 is always your own default gateway — the same address ip route called "default via". If hop 1 ' +
          'does not answer, the problem is on your own network and nothing further along matters.'
      },
      {
        title: 'Watch the packet cross to the other site',
        line: 'traceroute srv-depot01',
        look: '2  rtr-depot (10.40.10.1)',
        why:
          'Hop 2 is the depot router, so the site-to-site link is up and carrying traffic. Three hops for a ' +
          'two-site company is exactly what you would expect: your router, their router, the server.'
      }
    ],

    reading: [
      { part: 'the hop number', means: 'how many routers the packet has passed through' },
      { part: 'a name and address', means: 'the router that answered at that distance' },
      { part: 'the time', means: 'how long that hop took to reply — a jump here is where latency is being added' },
      { part: 'a row of asterisks', means: 'that hop did not reply. Common and often harmless: many routers deliberately ignore these probes' }
    ],

    mistakes: [
      {
        line: 'tracert srv-depot01',
        look: 'command not found',
        why:
          'tracert is the Windows spelling and traceroute is the Unix one. Same idea, different name, and the ' +
          'shorter Windows version exists only because of an old eight-character filename limit.'
      }
    ],

    seeAlso: ['ping', 'route', 'ip']
  },

  {
    command: 'route',
    concepts: ['routing-basics', 'default-gateway', 'static-routes', 'cidr'],

    idea:
      'Prints the kernel routing table: the list of rules this machine consults to decide where to send each ' +
      'packet. Every machine has one, not just routers, and reading it explains why some destinations work ' +
      'and others do not.',

    onTheJob:
      'When one particular network is unreachable but everything else is fine, the routing table is where the ' +
      'answer usually is. A missing route to one subnet produces exactly that symptom, and no amount of ' +
      'pinging will reveal it.',

    steps: [
      {
        title: 'Print the table',
        line: 'route',
        look: 'Kernel IP routing table',
        why:
          'The machine works down this table looking for the most specific rule that matches the destination, ' +
          'and uses the first one it finds. Understanding "most specific wins" explains most routing behaviour.'
      },
      {
        title: 'Find the catch-all',
        line: 'route',
        look: '0.0.0.0         10.20.20.1      0.0.0.0',
        why:
          'Destination 0.0.0.0 with mask 0.0.0.0 matches everything, so it is the least specific rule and is ' +
          'only used when nothing else matched. That is the default gateway, written the long way round.'
      },
      {
        title: 'Find the directly attached network',
        line: 'route',
        look: '10.20.20.0      0.0.0.0         255.255.255.0',
        why:
          'A gateway of 0.0.0.0 means no gateway is needed — this network is on the wire, so the machine sends ' +
          'straight to the host. This entry is more specific than the default, so it wins for those addresses.'
      }
    ],

    reading: [
      { part: 'Destination', means: 'the network this rule is about' },
      { part: 'Gateway', means: 'the next router to hand the packet to, or 0.0.0.0 for directly attached' },
      { part: 'Genmask', means: 'how much of the destination must match' },
      { part: 'Flags U', means: 'the route is up' },
      { part: 'Flags UG', means: 'up, and it goes via a gateway' },
      { part: 'Metric', means: 'the tiebreaker when two routes are equally specific — lower wins' }
    ],

    mistakes: [
      {
        line: 'route add',
        look: 'usage',
        why:
          'This machine only shows the table; it does not edit it. On a real box you would use "ip route add", ' +
          'and the change would last until reboot unless you also wrote it into the network configuration.'
      }
    ],

    seeAlso: ['ip', 'traceroute', 'ping']
  },

  {
    command: 'arp',
    concepts: ['cli-arp', 'arp', 'osi-model', 'ip-addressing'],

    idea:
      'Shows the table mapping IP addresses to MAC addresses for machines on the local network. IP addressing ' +
      'is a layer 3 idea, but the actual delivery on an Ethernet segment happens at layer 2 using MAC ' +
      'addresses, and ARP is the translation between the two.',

    onTheJob:
      'Two machines claiming the same IP address is a classic, maddening fault — intermittent, affecting only ' +
      'some traffic, and invisible to ping. The ARP table is where you see it, because the address will be ' +
      'flipping between two different MACs.',

    steps: [
      {
        title: 'List the neighbours this machine has spoken to',
        line: 'arp -a',
        look: 'rtr-hq (10.20.20.1) at',
        why:
          'Entries appear here only after the machine has actually needed to talk to that address. An empty ' +
          'table is not a fault — it just means nothing has been contacted yet.'
      },
      {
        title: 'Notice which machines are absent',
        line: 'arp -a',
        look: 'pc-finance01 (10.20.20.42)',
        why:
          'Only addresses on this machine’s own network appear. A server at the depot will never be in this ' +
          'table however much you talk to it, because you reach it through the router — and the router’s MAC ' +
          'is what the packets are addressed to.'
      },
      {
        title: 'Confirm an address belongs to exactly one machine',
        line: 'arp -a',
        look: 'at 02:',
        why:
          'Each line pairs one IP with one MAC. The same MAC appearing against two IPs is normal — a router ' +
          'does that. The same IP appearing against two MACs is an address conflict and needs fixing.'
      }
    ],

    reading: [
      { part: 'the name and address', means: 'the neighbour this entry is about' },
      { part: 'at <mac>', means: 'the hardware address that answered for that IP' },
      { part: '[ether]', means: 'the type of hardware address — Ethernet' },
      { part: 'on eth0', means: 'which interface heard the reply' }
    ],

    mistakes: [
      {
        line: 'arp -n',
        look: 'unknown option',
        why:
          'Only -a is available here. On a real machine -n skips resolving names and prints addresses only, ' +
          'which is worth knowing because name resolution can make a simple command hang.'
      }
    ],

    seeAlso: ['ping', 'ifconfig', 'ip']
  },

  {
    command: 'nmap',
    concepts: ['ports-protocols', 'cli-netstat', 'attack-types', 'firewall-rules'],

    idea:
      'Asks a host which TCP ports are open, and therefore which services it is running. A port is open ' +
      'because something is listening on it, so a port scan is really an inventory of what a machine offers ' +
      'to the network.',

    onTheJob:
      'Two uses, pulling in opposite directions. As an administrator: confirm the service you are ' +
      'troubleshooting is actually listening before you blame the network. As a defender: find the machine ' +
      'offering something it should not be, because every open port is a way in.',

    steps: [
      {
        title: 'Scan a server',
        line: 'nmap srv-dc01',
        look: 'Nmap scan report for srv-dc01 (10.20.10.10)',
        why:
          'The header confirms which machine was actually scanned. Scanning the wrong host because a name ' +
          'resolved somewhere unexpected is an easy way to waste an hour.'
      },
      {
        title: 'Read the open ports',
        line: 'nmap srv-dc01',
        look: '22/tcp    open   ssh',
        why:
          'Port 22 is SSH by long-standing convention. The service column is nmap guessing from the port ' +
          'number, not from asking — a well-known port number is a strong hint, never a promise.'
      },
      {
        title: 'Notice what the scan did not report',
        line: 'nmap srv-dc01',
        look: 'Not shown: 998 closed tcp ports',
        why:
          'Closed means something answered and said no. That is different from filtered, where a firewall ' +
          'swallowed the probe and nothing came back at all. Closed tells you the host is alive; filtered ' +
          'tells you there is a firewall in the way.'
      },
      {
        title: 'Scan a machine with a different role',
        line: 'nmap srv-file01',
        look: 'Host is up',
        why:
          'Compare the open ports against what the machine is for. A file server offering services a file ' +
          'server has no business offering is exactly the kind of thing an access review is meant to catch.'
      }
    ],

    reading: [
      { part: 'Host is up', means: 'the machine answered' },
      { part: 'open', means: 'something is listening and accepting connections' },
      { part: 'closed', means: 'the host answered but nothing is listening on that port' },
      { part: 'filtered', means: 'no answer at all — usually a firewall dropping the probe silently' },
      { part: 'SERVICE', means: 'what conventionally runs on that port — a guess, not a measurement' }
    ],

    mistakes: [
      {
        line: 'nmap -p 22 srv-file01',
        look: 'unknown option',
        why:
          'Only -sV is available here. On a real machine -p chooses which ports to scan, and narrowing the ' +
          'range is the difference between a scan that takes a second and one that takes twenty minutes.'
      }
    ],

    seeAlso: ['ping', 'ssh', 'nslookup']
  }
];
