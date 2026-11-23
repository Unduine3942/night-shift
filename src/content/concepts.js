/**
 * The concept vocabulary.
 *
 * Every mission declares what it `teaches` and what it `requires`, drawn from
 * here. That turns the catalogue into a dependency graph, which is what lets the
 * game order itself: a mission is offered when you have already met everything it
 * assumes, and never before.
 *
 * It also makes a whole class of authoring mistake checkable. A mission that
 * requires a concept nothing teaches is unreachable. Two missions that require
 * each other's concepts deadlock. Neither is visible by reading the content —
 * both are caught by walking this graph.
 *
 * Concepts are deliberately fine-grained. "Networking" is not a concept;
 * "what a CNAME does" is.
 */

function concept(id, domain, label, blurb) {
  return { id, domain, label, blurb };
}

const LIST = [
  /* ───────────────── networking ───────────────── */
  concept('osi-model', 'networking', 'The OSI layers', 'Which layer a problem lives at, and why that narrows the search.'),
  concept('ip-addressing', 'networking', 'IP addresses', 'Dotted quads, what each octet means, public versus private ranges.'),
  concept('cidr', 'networking', 'CIDR notation', 'Reading /24 as a mask, and what the prefix length buys you.'),
  concept('subnetting', 'networking', 'Subnetting', 'Splitting a block: network, broadcast, first and last usable host.'),
  concept('vlsm', 'networking', 'Variable length masks', 'Carving one block into differently sized subnets.'),
  concept('default-gateway', 'networking', 'The default gateway', 'Where a host sends anything not on its own network.'),
  concept('vlan', 'networking', 'VLANs', 'One switch, several separate networks, and what tagging means.'),
  concept('arp', 'networking', 'ARP', 'How an IP address becomes a MAC address on the local wire.'),
  concept('dns-basics', 'networking', 'How DNS resolves', 'Name to address, resolvers, forwarders, and caching.'),
  concept('dns-a-record', 'networking', 'A records', 'A name pointing directly at an address.'),
  concept('dns-cname', 'networking', 'CNAME records', 'A name pointing at another name, and the extra hop it costs.'),
  concept('dhcp', 'networking', 'DHCP', 'Leases, scopes, and what a client does when the server is unreachable.'),
  concept('routing-basics', 'networking', 'Routing', 'How a packet is handed on, hop by hop, toward a network it is not on.'),
  concept('static-routes', 'networking', 'Static routes', 'Telling a router about a network it cannot see for itself.'),
  concept('nat', 'networking', 'NAT', 'Many private addresses behind one public one.'),
  concept('ports-protocols', 'networking', 'Ports and protocols', 'What is listening where, and which well-known port belongs to what.'),
  concept('firewall-rules', 'networking', 'Firewall rules', 'Order of evaluation, and why the last rule is usually deny.'),
  concept('wan-links', 'networking', 'Site-to-site links', 'Point-to-point addressing between two sites.'),

  /* ───────────────── tool skills ───────────────── */
  concept('cli-ipconfig', 'networking', 'Reading a host config', 'ipconfig and ip addr: what this machine thinks it is.'),
  concept('cli-ping', 'networking', 'ping', 'Proving reachability, and what a timeout does and does not mean.'),
  concept('cli-nslookup', 'networking', 'nslookup and dig', 'Asking a resolver directly instead of trusting the browser.'),
  concept('cli-tracert', 'networking', 'traceroute', 'Finding the hop where a path stops working.'),
  concept('cli-netstat', 'networking', 'netstat and ss', 'What this machine has open, and to whom.'),
  concept('cli-arp', 'networking', 'arp', 'Reading and clearing the local address table.'),
  concept('troubleshooting-method', 'it', 'A method for troubleshooting', 'Narrow the fault: layer by layer, halving the search each time.'),

  /* ───────────────── IT and sysadmin ───────────────── */
  concept('os-basics', 'it', 'Operating system basics', 'Processes, services, the filesystem, and where logs live.'),
  concept('file-permissions', 'it', 'File permissions', 'Read, write, execute, and who is being asked.'),
  concept('user-accounts', 'it', 'User accounts', 'Identity, login names, and what disabling really does.'),
  concept('groups-membership', 'it', 'Groups', 'Granting rights to a role rather than to a person.'),
  concept('active-directory', 'it', 'Directory services', 'One place that answers "who is this and what may they do".'),
  concept('least-privilege', 'it', 'Least privilege', 'Why an everyday account should not be able to do everything.'),
  concept('service-accounts', 'it', 'Service accounts', 'Logins with no human behind them, and why they are dangerous.'),
  concept('ticket-triage', 'it', 'Triaging tickets', 'Turning a vague complaint into a testable statement.'),
  concept('backup-basics', 'it', 'Backups', 'What is protected, how far back, and whether it restores.'),
  concept('wireless-basics', 'it', 'Wireless', 'Coverage, interference, and roaming between access points.'),

  /* ───────────────── data ───────────────── */
  concept('table-basics', 'data', 'Tables, rows, columns', 'How records are shaped before you can ask anything of them.'),
  concept('select-where', 'data', 'SELECT and WHERE', 'Asking for the rows you want and no others.'),
  concept('order-limit', 'data', 'ORDER BY and LIMIT', 'Sorting an answer and taking only the top of it.'),
  concept('joins', 'data', 'Joins', 'Answering a question that spans two tables.'),
  concept('aggregates', 'data', 'COUNT, SUM, AVG', 'Turning many rows into one number.'),
  concept('group-by', 'data', 'GROUP BY', 'One number per category instead of one overall.'),
  concept('data-types', 'data', 'Data types', 'Why a date stored as text sorts wrongly.'),
  concept('normalization', 'data', 'Normalisation', 'Storing a fact once so it cannot disagree with itself.'),
  concept('csv-json', 'data', 'CSV and JSON', 'The two shapes data arrives in, and how they differ.'),
  concept('regex-basics', 'data', 'Regular expressions', 'Describing a pattern precisely enough for a machine.'),
  concept('data-cleaning', 'data', 'Cleaning data', 'Duplicates, blanks, and values that lie about their type.'),

  /* ───────────────── security ───────────────── */
  concept('cia-triad', 'security', 'Confidentiality, integrity, availability', 'The three things security is actually protecting.'),
  concept('attack-types', 'security', 'Common attacks', 'What the usual suspects look like from the defending side.'),
  concept('phishing', 'security', 'Phishing', 'Reading a message for what it is asking rather than what it says.'),
  concept('hashing', 'security', 'Hashing', 'One-way fingerprints, and why they are not encryption.'),
  concept('encryption-symmetric', 'security', 'Symmetric encryption', 'One shared key, and the problem of getting it to the other end.'),
  concept('encryption-asymmetric', 'security', 'Public key encryption', 'Two keys, and what each one is good for.'),
  concept('tls-handshake', 'security', 'How TLS starts', 'Agreeing on a secret in the open, then switching to it.'),
  concept('authentication', 'security', 'Authentication', 'Proving who you are, and the three ways of doing it.'),
  concept('mfa', 'security', 'Multi-factor', 'Why a second factor defeats a stolen password.'),
  concept('access-control', 'security', 'Access control models', 'Who may do what, decided consistently.'),
  concept('log-analysis', 'security', 'Reading logs', 'Finding the one line that matters in fifty thousand.'),
  concept('siem-basics', 'security', 'Alerting', 'Turning a pattern in the logs into something that wakes someone up.'),
  concept('incident-response', 'security', 'Incident response', 'Contain, eradicate, recover — in that order, for a reason.'),
  concept('dormant-accounts', 'security', 'Dormant accounts', 'Why the account of someone who left is worth more than yours.'),
  concept('privilege-escalation', 'security', 'Privilege escalation', 'Getting from a foothold to control, and how it shows up in logs.')
];

export const CONCEPTS = Object.fromEntries(LIST.map((entry) => [entry.id, entry]));

export const CONCEPT_IDS = LIST.map((entry) => entry.id);

export function conceptsInDomain(domain) {
  return LIST.filter((entry) => entry.domain === domain);
}
