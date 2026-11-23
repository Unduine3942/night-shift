/**
 * Review cards.
 *
 * A card belongs to exactly one concept, and a concept is only taught by a
 * mission — so a card can never appear before the thing it tests has been
 * explained. That is the whole gating rule, and it falls out of the dependency
 * graph the missions already declare.
 *
 * Every card is multiple choice rather than self-graded. Self-grading is the
 * usual Leitner shortcut and it is the weakest part of Leitner: "did you know
 * that?" is answered by the same brain that just read the answer. Four options
 * and a wrong one you nearly picked is a real signal, and it is the signal the
 * scheduler is being handed.
 *
 * The first option is always the correct one. The UI shuffles with the seeded
 * PRNG, so the order is stable for a given session but not for the author.
 */

/**
 * @param id       unique, prefixed by domain
 * @param concept  must exist in concepts.js — enforced by tests
 * @param front    the question, as a person would ask it
 * @param options  correct answer first, then the distractors
 */
function card(id, concept, front, ...options) {
  return { id, concept, front, answer: options[0], options };
}

const LIST = [
  /* ───────────── ip-addressing ───────────── */
  card(
    'net-ip-1',
    'ip-addressing',
    'A host is configured with 10.20.20.42/24. Which part identifies the network?',
    'The first three octets — 10.20.20',
    'The last octet — 42',
    'The whole address',
    'Only the first octet — 10'
  ),
  card(
    'net-ip-2',
    'ip-addressing',
    'Which of these is a private address, usable inside a company without registering it?',
    '10.20.10.30',
    '8.8.8.8',
    '203.0.113.2',
    '1.1.1.1'
  ),
  card(
    'net-ip-3',
    'ip-addressing',
    'Two machines are on 10.20.20.41 and 10.20.30.51, both /24. Can they talk without a router?',
    'No — different networks, so it has to go via a gateway',
    'Yes — they share the first two octets',
    'Yes — /24 covers both',
    'Only if they are on the same switch'
  ),

  /* ───────────── cli-ipconfig ───────────── */
  card(
    'net-ipconfig-1',
    'cli-ipconfig',
    'A user says "the internet is down". What does reading their own IP configuration first tell you?',
    'Whether the machine has a usable address and gateway at all',
    'Whether the remote website is up',
    'Whether DNS is resolving',
    'Whether the firewall is blocking them'
  ),
  card(
    'net-ipconfig-2',
    'cli-ipconfig',
    'A workstation reports an address of 169.254.x.x. What has happened?',
    'It asked for an address and nothing answered, so it made one up',
    'It has been assigned a public address',
    'Its interface is switched off',
    'It has been moved to another VLAN'
  ),

  /* ───────────── cli-ping ───────────── */
  card(
    'net-ping-1',
    'cli-ping',
    'A ping to a server times out. What has that actually ruled out?',
    'Almost nothing — a dozen causes all look like this',
    'That the server is powered off',
    'That DNS is broken',
    'That the cable is unplugged'
  ),
  card(
    'net-ping-2',
    'cli-ping',
    'Ping to an address succeeds, but ping to the name fails. Where is the fault?',
    'Name resolution — the network path itself is fine',
    'The cable or the interface',
    'The default gateway',
    'The remote server is down'
  ),
  card(
    'net-ping-3',
    'cli-ping',
    'Why is a second, working machine on the same network so useful when something fails?',
    'Everything the two have in common is proven innocent',
    'It doubles the available bandwidth',
    'It can ping places the broken one cannot reach',
    'It shows whether the server is overloaded'
  ),

  /* ───────────── troubleshooting-method ───────────── */
  card(
    'it-method-1',
    'troubleshooting-method',
    'What is the most useful first question when a fault is reported?',
    'What still works?',
    'When was the last backup?',
    'Who touched it last?',
    'Has it been restarted?'
  ),
  card(
    'it-method-2',
    'troubleshooting-method',
    'One person cannot reach a service and forty others can. Where should you look first?',
    'At that one person — the shared parts are working for everyone else',
    'At the server, since that is what everyone uses',
    'At the core switch',
    'At the internet connection'
  ),

  /* ───────────── osi-model ───────────── */
  card(
    'it-osi-1',
    'osi-model',
    'A browser loads a page but warns the certificate is not trusted. Which layer is the fault at?',
    'Application — you reached the server and had a conversation',
    'Physical — the link is unreliable',
    'Network — the route is wrong',
    'Transport — the port is closed'
  ),
  card(
    'it-osi-2',
    'osi-model',
    'A server answers ping but refuses connections on 443. Which layer does that point at?',
    'Transport and above — the network layer clearly works',
    'Physical — the cable is faulty',
    'Network — there is no route',
    'Link — the switch port is disabled'
  ),
  card(
    'it-osi-3',
    'osi-model',
    'What is the practical value of thinking in layers?',
    'Each layer you rule out removes everything below it from the search',
    'It tells you which vendor is responsible',
    'It predicts which component will fail next',
    'It is required for the paperwork'
  ),

  /* ───────────── cidr ───────────── */
  card(
    'net-cidr-1',
    'cidr',
    'What does the /24 in 10.20.20.0/24 actually say?',
    'The first 24 bits are the network; the rest is yours for hosts',
    'There are 24 usable addresses',
    'It is the twenty-fourth subnet',
    'The address ends at .24'
  ),
  card(
    'net-cidr-2',
    'cidr',
    'Which mask is the same as /24?',
    '255.255.255.0',
    '255.255.0.0',
    '255.255.255.240',
    '255.0.0.0'
  ),
  card(
    'net-cidr-3',
    'cidr',
    'A link between two routers needs exactly two addresses. Which prefix fits it best?',
    '/30 — two usable addresses',
    '/24 — plenty of room',
    '/32 — one address each',
    '/29 — six usable addresses'
  ),

  /* ───────────── subnetting ───────────── */
  card(
    'net-subnet-1',
    'subnetting',
    'How many usable host addresses are in a /24?',
    '254 — 256 minus the network and broadcast addresses',
    '256 — all of them',
    '255 — all but the broadcast',
    '253 — the gateway is also reserved'
  ),
  card(
    'net-subnet-2',
    'subnetting',
    'In 10.40.20.0/24, which address is the broadcast?',
    '10.40.20.255',
    '10.40.20.0',
    '10.40.20.1',
    '10.40.20.254'
  ),
  card(
    'net-subnet-3',
    'subnetting',
    'Why can a host never be given the lowest address in its block?',
    'That address names the network itself',
    'It is always reserved for the gateway',
    'It is reserved for DHCP',
    'It is used for broadcasts'
  ),

  /* ───────────── dns-basics ───────────── */
  card(
    'net-dns-1',
    'dns-basics',
    'Why ask a resolver directly instead of trusting what the browser shows you?',
    'It caches and retries, so it can show a page whose name no longer resolves',
    'It cannot resolve names inside the company zone at all',
    'It only ever queries the forwarder, never the local zone',
    'It resolves names more slowly than the operating system does'
  ),
  card(
    'net-dns-2',
    'dns-basics',
    'A name inside the company zone resolves for you and not for a colleague. What is the likeliest cause?',
    'You are asking different resolvers',
    'The server is down for them only',
    'Their cable is faulty',
    'They typed the name wrongly'
  ),
  card(
    'net-dns-3',
    'dns-basics',
    'What does a DNS forwarder do?',
    'Passes on any query the local zone cannot answer',
    'Caches the local zone for faster lookups',
    'Blocks lookups of unapproved names',
    'Copies the zone to the second site'
  ),

  /* ───────────── cli-nslookup ───────────── */
  card(
    'net-nslookup-1',
    'cli-nslookup',
    'A name lookup returns two addresses. What are they?',
    'The answer, and the resolver that gave it to you',
    'The IPv4 and IPv6 addresses',
    'The primary and secondary servers',
    'The name and its alias'
  ),
  card(
    'net-nslookup-2',
    'cli-nslookup',
    'Why does it matter which resolver answered your lookup?',
    'When a name resolves differently for two people, the resolver is usually why',
    'Some resolvers are faster than others',
    'It determines the TTL',
    'It shows which site you are at'
  ),

  /* ───────────── dns-a-record ───────────── */
  card(
    'net-arecord-1',
    'dns-a-record',
    'What does an A record hold?',
    'A name and the address it resolves to',
    'A name and another name',
    'An address and the name it belongs to',
    'A mail server for a domain'
  ),
  card(
    'net-arecord-2',
    'dns-a-record',
    'A server is renumbered. Which record has to change?',
    'Its A record — that is the only place the address is written',
    'Every alias that points at it',
    'The reverse record only',
    'Nothing — DNS updates itself'
  ),

  /* ───────────── dns-cname ───────────── */
  card(
    'net-cname-1',
    'dns-cname',
    'What does a CNAME hold?',
    'Another name, which then has to be resolved in turn',
    'An address',
    'An address and a port',
    'A list of servers to try in order'
  ),
  card(
    'net-cname-2',
    'dns-cname',
    'An alias stops working but the server it points at is healthy. What should you check?',
    'Whether the name the alias points at still resolves',
    'Whether the server is powered on',
    'Whether the firewall changed',
    'Whether the alias TTL expired'
  ),
  card(
    'net-cname-3',
    'dns-cname',
    'Why not point an alias straight at the address instead of at a name?',
    'Renumbering the server would then mean remembering two records instead of one',
    'Aliases are not allowed to hold addresses',
    'It resolves more slowly',
    'The resolver would reject it'
  ),

  /* ───────────── default-gateway ───────────── */
  card(
    'net-gw-1',
    'default-gateway',
    'What does a host actually use its default gateway for?',
    'Anything addressed outside its own network',
    'Every packet it sends, without exception',
    'Name lookups only',
    'Traffic leaving the building for the internet'
  ),
  card(
    'net-gw-2',
    'default-gateway',
    'A machine can reach its neighbours and nothing else. What is the likeliest cause?',
    'Its gateway is missing or wrong',
    'Its cable is faulty',
    'DNS has stopped answering',
    'The switch port has been disabled'
  ),
  card(
    'net-gw-3',
    'default-gateway',
    'Why does the gateway address have to be on the same network as the hosts using it?',
    'They reach it directly, and direct only works on your own network',
    'Routers can only be given the first address in a block',
    'Otherwise the mask would be wrong',
    'So that broadcasts can find it'
  ),

  /* ───────────── routing-basics ───────────── */
  card(
    'net-route-1',
    'routing-basics',
    'What decision does a host make before it sends anything?',
    'Whether the destination is on its own network or not',
    'Which of its interfaces is least busy',
    'Whether the destination is reachable',
    'How many hops away the destination is'
  ),
  card(
    'net-route-2',
    'routing-basics',
    'A packet crosses four routers to reach the other site. What did each one do?',
    'Handed it on toward a network it was not itself on',
    'Opened it to check what was inside',
    'Rewrote its source address',
    'Copied it to every interface it had'
  ),

  /* ───────────── vlan ───────────── */
  card(
    'net-vlan-1',
    'vlan',
    'What does a VLAN actually give you?',
    'Two separate networks running over the same switches',
    'A faster link for important traffic',
    'Encryption between ports on a switch',
    'A way to give one machine two addresses'
  ),
  card(
    'net-vlan-2',
    'vlan',
    'Why are phones usually put on a VLAN of their own?',
    'So other traffic cannot interfere with calls',
    'Because handsets use a different kind of address',
    'Because it needs fewer switch ports',
    'Because voice cannot be routed'
  ),
  card(
    'net-vlan-3',
    'vlan',
    'Two machines are on the same switch but different VLANs. Can they talk directly?',
    'No — they are on separate networks, so it has to go via a router',
    'Yes, because they share a switch',
    'Yes, but only broadcasts get through',
    'Only if they have the same subnet mask'
  ),

  /* ───────────── vlsm ───────────── */
  card(
    'net-vlsm-1',
    'vlsm',
    'You split a /24 into two equal halves. What is the prefix of each half?',
    '/25',
    '/23',
    '/26',
    '/24 — splitting does not change it'
  ),
  card(
    'net-vlsm-2',
    'vlsm',
    'Why do two halves of a /24 give 126 usable addresses each, not 127?',
    'Each half is a block, so each loses its own network and broadcast address',
    'One address is always reserved for the gateway',
    'The split itself consumes an address',
    'One address is kept back for DHCP'
  ),
  card(
    'net-vlsm-3',
    'vlsm',
    'What goes wrong if the second half is written starting one address too low?',
    'The two blocks overlap, and the fault will be intermittent and hard to reproduce',
    'The second block is simply one address smaller',
    'Nothing — the router works it out',
    'The broadcast address moves but nothing else changes'
  ),

  /* ───────────── groups-membership ───────────── */
  card(
    'it-groups-1',
    'groups-membership',
    'Why grant rights to a group rather than to a person?',
    'The rights outlive the person, and can be reviewed in one place',
    'Groups are processed faster by the directory',
    'Individual accounts cannot hold rights',
    'It reduces the number of accounts needed'
  ),
  card(
    'it-groups-2',
    'groups-membership',
    'Someone changes role. What is the tidy way to move their access?',
    'Change which groups they are in',
    'Edit the rights on their account directly',
    'Delete the account and make a new one',
    'Copy the rights from a colleague in the new role'
  ),

  /* ───────────── least-privilege ───────────── */
  card(
    'sec-priv-1',
    'least-privilege',
    'An administrator reads email from the account that holds their admin rights. Why is that a problem?',
    'One bad link hands an attacker everything that account can do',
    'It makes the mailbox larger than it should be',
    'Admin accounts are not licensed for email',
    'It slows down the directory'
  ),
  card(
    'sec-priv-2',
    'least-privilege',
    'What is the usual fix for an administrator who needs admin rights?',
    'A second account used only for administration',
    'Taking the rights away and escalating to someone else',
    'A shared admin account the team all use',
    'Leaving it, since they need the rights anyway'
  ),
  card(
    'sec-priv-3',
    'least-privilege',
    'What does least privilege actually ask you to minimise?',
    'What an account can do at the moment it is compromised',
    'The number of accounts in the directory',
    'How often people have to ask for access',
    'The number of groups in use'
  ),

  /* ───────────── ticket-triage ───────────── */
  card(
    'it-triage-1',
    'ticket-triage',
    'Two tickets arrive: a whole site is down, and one person cannot print. Which first, and why?',
    'The site — it stops the most people working',
    'The printer — it will take two minutes',
    'Whichever was raised first',
    'Whichever came from the more senior person'
  ),
  card(
    'it-triage-2',
    'ticket-triage',
    'Why does a reported phishing reply jump the queue?',
    'The damage is still spreading while the ticket waits',
    'It is the most serious kind of ticket by policy',
    'It always affects the whole company',
    'It cannot be worked on later'
  ),
  card(
    'it-triage-3',
    'ticket-triage',
    'What is "it has always done that" usually telling you?',
    'It has waited this long, so it can wait a little longer',
    'It is a hardware fault',
    'Nobody has reported it properly before',
    'It will never be fixed'
  ),

  /* ───────────── user-accounts ───────────── */
  card(
    'sec-user-1',
    'user-accounts',
    'What does disabling an account do that deleting it does not?',
    'Keeps the history, so you can still see what it had access to',
    'Frees the licence immediately',
    'Removes it from every group',
    'Stops it appearing in the directory'
  ),
  card(
    'sec-user-2',
    'user-accounts',
    'Why leave a disabled account in its groups?',
    'The group membership is the record of what it could reach',
    'So it can be re-enabled instantly',
    'Groups cannot be edited on a disabled account',
    'It keeps the group counts accurate'
  ),

  /* ───────────── dormant-accounts ───────────── */
  card(
    'sec-dormant-1',
    'dormant-accounts',
    'Why is a leaver’s account worth more to an attacker than an active one?',
    'Nobody is watching it, and nobody will report it behaving oddly',
    'It usually has a weaker password',
    'It is exempt from multi-factor authentication',
    'It cannot be locked out'
  ),
  card(
    'sec-dormant-2',
    'dormant-accounts',
    'An access review finds an enabled account for someone who left. What is the first action?',
    'Disable it, and keep it for the audit trail',
    'Delete it immediately',
    'Change its password and leave it enabled',
    'Remove it from all groups and leave it enabled'
  ),
  card(
    'sec-dormant-3',
    'dormant-accounts',
    'How does a leaver’s account usually end up enabled again?',
    'Someone needed one file from it and nobody turned it off afterwards',
    'The directory re-enables accounts automatically',
    'A password reset re-enables it',
    'It was never disabled in the first place'
  ),
  /* ───────────── arp ───────────── */
  card(
    'net-arp-1',
    'arp',
    'What does ARP actually translate between?',
    'An IP address and the MAC address that answers for it on the local network',
    'A hostname and an IP address',
    'A private address and a public one',
    'A port number and the service behind it'
  ),
  card(
    'net-arp-2',
    'arp',
    'Why does a server at the other site never appear in your ARP table, however much you talk to it?',
    'ARP only resolves neighbours on your own network — anything further is reached via the router',
    'Its entries expire from the cache faster than you are able to run the command and read them',
    'Routers are configured to block ARP between sites because it would be a security risk',
    'It appears only once DNS has cached the name, and the cache is cleared every night'
  ),
  card(
    'net-arp-3',
    'arp',
    'The same IP appears in the ARP table against two different MAC addresses. What is that?',
    'Two machines are claiming the same address — an IP conflict',
    'Normal: a router answers for several addresses',
    'The ARP cache needs clearing and means nothing',
    'The machine has two network cards, which is fine'
  ),

  /* ───────────── cli-arp ───────────── */
  card(
    'net-cliarp-1',
    'cli-arp',
    'You ran "arp -a" and the machine you care about is not listed. What does that tell you?',
    'Nothing yet — entries only appear after this machine has needed to talk to it. Ping it first',
    'The machine is switched off, because a running host always registers itself in the table',
    'The machine is on a different VLAN, which is the only reason an entry would ever be absent',
    'The ARP table has become corrupt and needs to be cleared before it will show anything'
  ),
  card(
    'net-cliarp-2',
    'cli-arp',
    'In "rtr-hq (10.20.20.1) at 02:6f:40:c4:84:48 [ether] on eth0", which part is the hardware address?',
    '02:6f:40:c4:84:48',
    '10.20.20.1',
    'rtr-hq',
    'eth0'
  ),

  /* ───────────── cli-tracert ───────────── */
  card(
    'net-clitracert-1',
    'cli-tracert',
    'What does traceroute tell you that ping cannot?',
    'How far the packet gets, and which router it stops at',
    'Whether the destination is switched on',
    'Which port the service is listening on',
    'How much bandwidth the link has'
  ),
  card(
    'net-clitracert-2',
    'cli-tracert',
    'A traceroute shows a row of asterisks at hop 4, then normal replies at hops 5 and 6. What is wrong?',
    'Nothing — that router is configured not to reply, and the traffic passes through it fine',
    'The path is broken at hop 4 and the rest is invented',
    'Hop 4 is overloaded and dropping all traffic',
    'A firewall has blocked the whole route'
  ),
  card(
    'net-clitracert-3',
    'cli-tracert',
    'Which router will always be hop 1 in a trace leaving your machine?',
    'Your own default gateway',
    'The destination network’s router',
    'Whichever router is least busy',
    'The DNS server'
  ),

  /* ───────────── wan-links ───────────── */
  card(
    'net-wan-1',
    'wan-links',
    'Why is a site-to-site link usually addressed with a /30 rather than a /24?',
    'Only two addresses are needed — one router at each end — and a /30 provides exactly two',
    'Carriers will not route a block larger than a /30 across their own backbone network',
    'A /30 carries traffic faster than a /24 because there are fewer addresses to search',
    'It keeps the link in the same VLAN as the LAN at each end, which routing requires'
  ),
  card(
    'net-wan-2',
    'wan-links',
    'Users at the depot say everything is slow. A trace shows normal times to your own router and a jump at the next hop. Where is the problem?',
    'On the link between the sites, which is the carrier’s to answer for',
    'On the user’s own workstation, since the first hop timed normally for everyone',
    'On your own core switch, which every packet crosses before reaching the router',
    'In DNS at the depot, because slow name resolution delays every connection'
  ),

  /* ───────────── authentication ───────────── */
  card(
    'sec-auth-1',
    'authentication',
    'Three things must be true before a login succeeds. Which is NOT one of them?',
    'The user is sitting at a machine on the same network as the server',
    'The account exists',
    'The credential is correct',
    'The account is allowed to be used'
  ),
  card(
    'sec-auth-2',
    'authentication',
    'A user swears the password is right and is still refused. What is worth checking before resetting it?',
    'Whether the account is disabled or locked out',
    'Whether their network cable is in',
    'Whether DNS is resolving',
    'Whether the password is long enough'
  ),
  card(
    'sec-auth-3',
    'authentication',
    'The three classic factors are something you know, something you have, and what?',
    'Something you are — a fingerprint, a face, a biometric',
    'Somewhere you are — your location',
    'Something you remember — a security question',
    'Someone you know — a colleague who vouches for you'
  ),

  /* ───────────── active-directory ───────────── */
  card(
    'it-ad-1',
    'active-directory',
    'What question does a directory service exist to answer?',
    'Who is this, and what are they allowed to do',
    'Which machine holds which IP address',
    'Where the backups are stored',
    'What is listening on which port'
  ),
  card(
    'it-ad-2',
    'active-directory',
    'In "samba-tool user show", what does userAccountControl: 514 mean?',
    'The account exists but is disabled',
    'The account has 514 group memberships',
    'The password expires in 514 days',
    'The account has administrator rights'
  ),
  card(
    'it-ad-3',
    'active-directory',
    'What is a distinguished name, the "dn:" line in a directory entry?',
    'The entry’s full unique path through the directory tree',
    'The person’s preferred display name',
    'The login they type at the prompt',
    'A hash of the account password'
  ),

  /* ───────────── access-control ───────────── */
  card(
    'sec-access-1',
    'access-control',
    'Why are rights granted to groups rather than to individual people?',
    'A role changes far less often than the people in it, so the rules stay correct as staff move',
    'Directories are not technically able to grant a right to one named individual account',
    'It uses considerably less storage in the directory than listing people one at a time',
    'It makes each account’s password harder for an attacker to guess or brute force'
  ),
  card(
    'sec-access-2',
    'access-control',
    'You are reviewing who has administrator rights. Which approach actually finds over-privilege?',
    'Open the admin group and read the members — you are looking for a name you did not expect',
    'Look at each person you suspect and check their groups',
    'Ask each department who their admins are',
    'Check the login logs for administrative actions'
  ),
  card(
    'sec-access-3',
    'access-control',
    'Someone has one group membership too many. What is the right correction?',
    'Remove that one membership and leave everything else alone',
    'Disable the account until they explain why they had it',
    'Remove them from every group and add back what they ask for',
    'Delete the account and create a new one'
  ),

  /* ───────────── privilege-escalation ───────────── */
  card(
    'sec-privesc-1',
    'privilege-escalation',
    'Why is a domain admin account that belongs to an ordinary clerk so dangerous?',
    'An attacker who phishes that one mailbox owns the whole domain with no further steps to take',
    'Clerks reliably choose weaker passwords than administrators do, so the account is easier to crack',
    'It slows the directory down, because admin accounts are checked against more rules on every login',
    'It breaks the licensing terms, which count administrator accounts separately from ordinary ones'
  ),
  card(
    'sec-privesc-2',
    'privilege-escalation',
    'An account that normally only reads files suddenly starts creating users. What is that most likely to be?',
    'Privilege escalation — someone has got more rights than that account should have',
    'A scheduled backup running under the wrong name',
    'A directory replication error',
    'Normal behaviour for an account in the staff group'
  ),
  card(
    'sec-privesc-3',
    'privilege-escalation',
    'Why does least privilege limit the damage of a break-in rather than prevent it?',
    'It cannot stop the first foothold, but it decides how far the attacker can get from there',
    'It stops phishing emails from being delivered to the accounts that matter most',
    'It encrypts the files an attacker would otherwise be able to read once inside',
    'It forces an attacker to pass a second factor before any account can be used'
  )

];

export const CARDS = Object.fromEntries(LIST.map((entry) => [entry.id, entry]));

export const CARD_IDS = LIST.map((entry) => entry.id);

/** The cards a player has earned the right to see. */
export function cardsForConcepts(concepts) {
  const known = concepts instanceof Set ? concepts : new Set(concepts);
  return LIST.filter((entry) => known.has(entry.concept));
}

export function cardsForConcept(conceptId) {
  return LIST.filter((entry) => entry.concept === conceptId);
}
