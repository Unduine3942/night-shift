/**
 * Walkthroughs for the name tools.
 *
 * nslookup and dig are deliberately separate commands in this game, and separate
 * tutorials here, because treating them as synonyms is one of the most common
 * and most costly CLI habits. They ask the same question and give you very
 * different amounts of evidence.
 */

export const NAME_TUTORIALS = [
  {
    command: 'nslookup',
    concepts: ['cli-nslookup', 'dns-basics', 'dns-a-record', 'troubleshooting-method'],

    idea:
      'Asks a DNS server to turn a name into an address, and prints which server answered. It is the quickest ' +
      'way to find out whether a name problem is really a name problem, and it bypasses every cache a browser ' +
      'or application might be holding.',

    onTheJob:
      '"The website is down" is nearly always one of three things: the name does not resolve, it resolves to ' +
      'the wrong address, or it resolves correctly and the service is genuinely down. One nslookup separates ' +
      'the first two from the third, and you have not had to open a browser.',

    steps: [
      {
        title: 'Look up a name that works',
        line: 'nslookup app01.meridian.local',
        look: 'Address: 10.20.10.30',
        why:
          'The name resolved to an address. Cross-check it against what you expect — a name resolving to a ' +
          'stale address is far more confusing than one that does not resolve at all, because everything ' +
          'appears to work and simply goes to the wrong place.'
      },
      {
        title: 'Notice who answered',
        line: 'nslookup app01.meridian.local',
        look: 'Server:',
        why:
          'The answer is only as trustworthy as the server that gave it. Here that is the domain controller at ' +
          '10.20.10.10, which is authoritative for meridian.local — so this is the real answer, not a cached copy.'
      },
      {
        title: 'See what a missing name looks like',
        line: 'nslookup wms.meridian.local',
        look: 'NXDOMAIN',
        why:
          'NXDOMAIN means the server is working perfectly and is telling you this name does not exist. That is ' +
          'a definite answer, not a failure — it points at a missing record, not a broken DNS server.'
      },
      {
        title: 'Follow an alias to its target',
        line: 'nslookup intranet.meridian.local',
        look: '10.20.10.30',
        why:
          'intranet is an alias for app01, so you end up at the same address by a different route. Notice you ' +
          'cannot tell from this output that an alias was involved at all — which is exactly what dig is for.'
      }
    ],

    reading: [
      { part: 'Server', means: 'which DNS server was asked' },
      { part: 'Address (near the top)', means: 'that server’s own address and port — 53 is the DNS port' },
      { part: 'Name', means: 'the name that was actually resolved' },
      { part: 'Address (near the bottom)', means: 'the answer you came for' },
      { part: 'NXDOMAIN', means: 'no such name. The server is fine; the record is missing' }
    ],

    mistakes: [
      {
        line: 'nslookup',
        look: 'usage',
        why:
          'Real nslookup drops into an interactive mode when given no arguments, which traps people who do not ' +
          'know to type "exit". Giving it the name on the command line avoids the whole problem.'
      }
    ],

    seeAlso: ['dig', 'nsupdate', 'ping']
  },

  {
    command: 'dig',
    concepts: ['cli-nslookup', 'dns-basics', 'dns-cname', 'dns-a-record'],

    idea:
      'Asks the same question as nslookup and shows you the entire answer: the status code, how many records ' +
      'came back, each record with its type and time to live, and which server replied. When a name behaves ' +
      'strangely, this is the tool that explains why.',

    onTheJob:
      'Reach for dig the moment the simple answer stops making sense — a name that resolves but goes to the ' +
      'wrong place, a change that has not taken effect, an alias chain nobody documented. Its output is also ' +
      'what you paste into a ticket, because it is evidence rather than a claim.',

    steps: [
      {
        title: 'Ask for just the answer',
        line: 'dig +short app01.meridian.local',
        look: '10.20.10.30',
        why:
          '+short strips everything except the answer. Use it when you only want the address; use the full ' +
          'output when you want to know why the address is what it is.'
      },
      {
        title: 'Read the status line',
        line: 'dig app01.meridian.local',
        look: 'status: NOERROR',
        why:
          'NOERROR with an answer count above zero is a genuine success. NOERROR with zero answers means the ' +
          'name exists but has no record of the type you asked for — a distinction nslookup hides from you.'
      },
      {
        title: 'Watch an alias resolve in two steps',
        line: 'dig intranet.meridian.local',
        look: 'CNAME\tapp01.meridian.local.',
        why:
          'Here is the thing nslookup did not show: intranet is not an address, it is a pointer to another ' +
          'name. The resolver had to look up app01 as well, which is why the answer section has two records.'
      },
      {
        title: 'Read the time to live on each record',
        line: 'dig intranet.meridian.local',
        look: '3600\tIN\tA',
        why:
          'The number before IN is the TTL in seconds — how long a resolver may cache this record. The alias ' +
          'has a short TTL and the A record a long one, so a change to where intranet points takes effect ' +
          'quickly while the underlying address stays cached. That is a deliberate design choice.'
      }
    ],

    reading: [
      { part: 'HEADER', means: 'the status and the query id' },
      { part: 'status: NOERROR', means: 'the query was understood and answered' },
      { part: 'status: NXDOMAIN', means: 'no such name' },
      { part: 'ANSWER: 2', means: 'how many records came back — with an alias you get the pointer and its target' },
      { part: 'QUESTION SECTION', means: 'what was actually asked, which catches typos' },
      { part: 'ANSWER SECTION', means: 'name, TTL, class, type, value — one line per record' },
      { part: 'flags: aa', means: 'authoritative answer: this server owns the zone rather than caching it' }
    ],

    mistakes: [
      {
        line: 'dig wms.meridian.local',
        look: 'status: NXDOMAIN',
        why:
          'Zero answers and NXDOMAIN together mean the name does not exist. If you were expecting it to, the ' +
          'fix is to add the record, not to restart anything.'
      }
    ],

    seeAlso: ['nslookup', 'nsupdate', 'ping']
  },

  {
    command: 'nsupdate',
    concepts: ['dns-basics', 'dns-a-record', 'dns-cname', 'troubleshooting-method'],

    idea:
      'Adds and removes records in the local zone. This is the write half of DNS — everything else here only ' +
      'reads. A new server needs a name before anyone can use it, and a decommissioned one needs its name ' +
      'taken away before it points at whoever gets that address next.',

    onTheJob:
      'Stale DNS records are a quiet, recurring source of outages and a genuine security problem: a name still ' +
      'pointing at an address that has been reassigned sends traffic, and sometimes credentials, to whatever ' +
      'now lives there.',

    steps: [
      {
        title: 'Check the name is free before claiming it',
        line: 'dig wms.meridian.local',
        look: 'status: NXDOMAIN',
        why:
          'NXDOMAIN means the name is unused, so it is safe to claim. Adding a record for a name that already ' +
          'exists is how you take a working service offline without touching the service itself.'
      },
      {
        title: 'Point a new name at a real machine',
        line: 'nsupdate add wms.meridian.local A 10.20.10.30',
        look: 'added A wms.meridian.local -> 10.20.10.30',
        why:
          'An A record maps a name directly to an address. The address has to belong to a machine that ' +
          'actually exists — this zone will not let you point a name at nothing.'
      },
      {
        title: 'Confirm the change took',
        line: 'dig +short wms.meridian.local',
        look: '10.20.10.30',
        why:
          'Never trust a change you have not verified through a second tool. Making the change and reading it ' +
          'back are two different operations, and only the second one is evidence.'
      },
      {
        title: 'Remove it again',
        line: 'nsupdate delete wms.meridian.local A',
        look: 'deleted A wms.meridian.local',
        why:
          'Removing a record you added is the same discipline as removing a firewall rule you added for a ' +
          'test. The temporary change nobody undid is a category of outage all its own.'
      }
    ],

    reading: [
      { part: 'add <name> A <address>', means: 'point a name straight at an address' },
      { part: 'add <name> CNAME <other name>', means: 'make one name an alias for another' },
      { part: 'delete <name> <type>', means: 'remove that record — the type is required, because one name can hold several' }
    ],

    mistakes: [
      {
        line: 'nsupdate add broken.meridian.local A 10.20.10.99',
        look: 'no machine on this network has the address',
        why:
          'Pointing a name at an address nothing answers on produces a name that resolves perfectly and then ' +
          'times out — one of the most misleading faults there is, because DNS looks healthy.'
      },
      {
        line: 'nsupdate add bad.meridian.local A app01.meridian.local',
        look: 'A record',
        why:
          'An A record takes an address, never another name. Pointing one name at another is what CNAME is ' +
          'for, and mixing the two up is the most common mistake people make when they first edit a zone.'
      }
    ],

    seeAlso: ['dig', 'nslookup', 'ping']
  }
];
