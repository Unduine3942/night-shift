/**
 * THE INFRASTRUCTURE CONTRACT — Meridian Logistics.
 *
 * This is the single source of truth for every hard parameter in the game: each
 * id, address, CIDR, VLAN, login and DNS name. Nothing else in the codebase may
 * contain those literals. The device list, the DNS zone, the directory and the
 * database tables are all *derived* from what is written here.
 *
 * ── Why it is locked ──────────────────────────────────────────────────────────
 *
 * Missions reference infrastructure by SYMBOL, never by literal:
 *
 *     HOST.APP01.ip        not  '10.20.10.30'
 *     NET.HQ_SERVERS.cidr  not  '10.20.10.0/24'
 *
 * Because a mission that hard-codes an address keeps "working" after that address
 * changes — it just quietly starts teaching something false. Symbols cannot drift;
 * either the name resolves or the build fails.
 *
 * The hard values are fingerprinted by tests/content/contract.test.js. Change one
 * and that test fails on purpose, telling you to bump INFRASTRUCTURE_VERSION and
 * re-run the mission suite. Cosmetic fields (label, blurb, title) are excluded
 * from the fingerprint, so wording can be improved freely.
 *
 * ── What belongs here ─────────────────────────────────────────────────────────
 *
 * The permanent shape of the company: what exists, where it lives, what it is
 * called, what address it holds. This is the board.
 *
 * NOT here: anything that varies during play. A broken DNS record, a disabled
 * account, a firewall rule someone added at 3am — those are EVENTS applied on top
 * by missions. The board stays still; the pieces move.
 */

export const INFRASTRUCTURE_VERSION = 1;

/* ────────────────────────────── sites ────────────────────────────── */

export const SITE = {
  HQ: {
    key: 'HQ',
    id: 'site-hq',
    code: 'HQ',
    label: 'Portside HQ',
    address: 'Unit 4, Portside Business Park',
    blurb: 'Offices, the server room, and the dispatch floor.'
  },
  DEPOT: {
    key: 'DEPOT',
    id: 'site-depot',
    code: 'DEP',
    label: 'Eastfield Depot',
    address: 'Eastfield Industrial Estate',
    blurb: 'Warehouse, loading bays, and handheld scanners that drop off the wireless.'
  }
};

/* ───────────────────────────── networks ──────────────────────────────
 *
 * 10.20.x.x is HQ, 10.40.x.x is the depot, and the third octet is the VLAN id.
 * A real convention, and one worth absorbing early: it makes "which network is
 * this?" answerable at a glance.
 */

export const NET = {
  EDGE: {
    key: 'EDGE',
    id: 'net-edge',
    label: 'Internet edge',
    cidr: '203.0.113.0/29',
    vlan: null,
    gateway: null,
    site: null,
    kind: 'edge'
  },
  WAN: {
    key: 'WAN',
    id: 'net-wan',
    label: 'HQ to depot link',
    cidr: '172.16.0.0/30',
    vlan: null,
    gateway: null,
    site: null,
    kind: 'wan'
  },

  HQ_SERVERS: {
    key: 'HQ_SERVERS',
    id: 'net-hq-srv',
    label: 'HQ Servers',
    cidr: '10.20.10.0/24',
    vlan: 10,
    gateway: '10.20.10.1',
    site: SITE.HQ,
    kind: 'lan'
  },
  HQ_STAFF: {
    key: 'HQ_STAFF',
    id: 'net-hq-staff',
    label: 'HQ Staff',
    cidr: '10.20.20.0/24',
    vlan: 20,
    gateway: '10.20.20.1',
    site: SITE.HQ,
    kind: 'lan'
  },
  HQ_VOICE: {
    key: 'HQ_VOICE',
    id: 'net-hq-voice',
    label: 'HQ Voice',
    cidr: '10.20.30.0/24',
    vlan: 30,
    gateway: '10.20.30.1',
    site: SITE.HQ,
    kind: 'lan'
  },
  HQ_MGMT: {
    key: 'HQ_MGMT',
    id: 'net-hq-mgmt',
    label: 'HQ Management',
    cidr: '10.20.99.0/24',
    vlan: 99,
    gateway: '10.20.99.1',
    site: SITE.HQ,
    kind: 'lan'
  },

  DEPOT_SERVERS: {
    key: 'DEPOT_SERVERS',
    id: 'net-depot-srv',
    label: 'Depot Servers',
    cidr: '10.40.10.0/24',
    vlan: 10,
    gateway: '10.40.10.1',
    site: SITE.DEPOT,
    kind: 'lan'
  },
  DEPOT_FLOOR: {
    key: 'DEPOT_FLOOR',
    id: 'net-depot-floor',
    label: 'Depot Floor',
    cidr: '10.40.20.0/24',
    vlan: 20,
    gateway: '10.40.20.1',
    site: SITE.DEPOT,
    kind: 'lan'
  }
};

/* ────────────────────────────── hosts ──────────────────────────────
 *
 * `ports` is listed in interface-name order, so `ip` is always the primary
 * address — the one a mission means when it says "ping APP01".
 */

function host(key, id, kind, site, label, ports) {
  return { key, id, kind, site, label, ports, ip: ports[0].ip, iface: ports[0].iface };
}

function port(iface, ip, net) {
  return { iface, ip, net };
}

export const HOST = {
  /* ── Portside HQ ── */

  FW_HQ: host('FW_HQ', 'fw-hq', 'firewall', SITE.HQ, 'Perimeter firewall', [
    port('ge-0/0/0', '203.0.113.2', NET.EDGE),
    port('ge-0/0/1', '10.20.10.2', NET.HQ_SERVERS)
  ]),

  RTR_HQ: host('RTR_HQ', 'rtr-hq', 'router', SITE.HQ, 'HQ core router', [
    port('ge-0/0/0', '10.20.10.1', NET.HQ_SERVERS),
    port('ge-0/0/1', '10.20.20.1', NET.HQ_STAFF),
    port('ge-0/0/2', '10.20.30.1', NET.HQ_VOICE),
    port('ge-0/0/3', '10.20.99.1', NET.HQ_MGMT),
    port('ge-0/0/4', '172.16.0.1', NET.WAN)
  ]),

  SW_HQ_CORE: host('SW_HQ_CORE', 'sw-hq-core', 'switch', SITE.HQ, 'HQ core switch', [
    port('vlan99', '10.20.99.11', NET.HQ_MGMT)
  ]),

  SW_HQ_ACC1: host('SW_HQ_ACC1', 'sw-hq-acc1', 'switch', SITE.HQ, 'HQ access switch, floor 1', [
    port('vlan99', '10.20.99.12', NET.HQ_MGMT)
  ]),

  DC01: host('DC01', 'srv-dc01', 'server', SITE.HQ, 'Domain controller, DNS and DHCP', [
    port('eth0', '10.20.10.10', NET.HQ_SERVERS)
  ]),

  FILE01: host('FILE01', 'srv-file01', 'server', SITE.HQ, 'File server', [
    port('eth0', '10.20.10.20', NET.HQ_SERVERS)
  ]),

  APP01: host('APP01', 'srv-app01', 'server', SITE.HQ, 'Shipping application and database', [
    port('eth0', '10.20.10.30', NET.HQ_SERVERS)
  ]),

  PC_DISPATCH: host('PC_DISPATCH', 'pc-dispatch01', 'workstation', SITE.HQ, 'Dispatch desk', [
    port('eth0', '10.20.20.41', NET.HQ_STAFF)
  ]),

  PC_FINANCE: host('PC_FINANCE', 'pc-finance01', 'workstation', SITE.HQ, 'Finance desk', [
    port('eth0', '10.20.20.42', NET.HQ_STAFF)
  ]),

  PC_IT: host('PC_IT', 'pc-it01', 'workstation', SITE.HQ, 'IT desk', [
    port('eth0', '10.20.20.43', NET.HQ_STAFF)
  ]),

  PHONE_RECEP: host('PHONE_RECEP', 'phone-recep01', 'phone', SITE.HQ, 'Reception handset', [
    port('eth0', '10.20.30.51', NET.HQ_VOICE)
  ]),

  /* ── Eastfield Depot ── */

  RTR_DEPOT: host('RTR_DEPOT', 'rtr-depot', 'router', SITE.DEPOT, 'Depot router', [
    port('ge-0/0/0', '172.16.0.2', NET.WAN),
    port('ge-0/0/1', '10.40.10.1', NET.DEPOT_SERVERS),
    port('ge-0/0/2', '10.40.20.1', NET.DEPOT_FLOOR)
  ]),

  SW_DEPOT: host('SW_DEPOT', 'sw-depot1', 'switch', SITE.DEPOT, 'Depot switch', [
    port('vlan10', '10.40.10.11', NET.DEPOT_SERVERS)
  ]),

  DEPOT01: host('DEPOT01', 'srv-depot01', 'server', SITE.DEPOT, 'Depot file and print server', [
    port('eth0', '10.40.10.10', NET.DEPOT_SERVERS)
  ]),

  PC_WAREHOUSE: host('PC_WAREHOUSE', 'pc-warehouse01', 'workstation', SITE.DEPOT, 'Warehouse office', [
    port('eth0', '10.40.20.41', NET.DEPOT_FLOOR)
  ]),

  SCAN01: host('SCAN01', 'scan-01', 'scanner', SITE.DEPOT, 'Handheld scanner 1', [
    port('wlan0', '10.40.20.61', NET.DEPOT_FLOOR)
  ]),

  SCAN02: host('SCAN02', 'scan-02', 'scanner', SITE.DEPOT, 'Handheld scanner 2', [
    port('wlan0', '10.40.20.62', NET.DEPOT_FLOOR)
  ])
};

/* ────────────────────────────── groups ────────────────────────────── */

export const GROUP = {
  STAFF: { key: 'STAFF', id: 'staff', label: 'All Staff', blurb: 'Everyone with a desk login' },
  DISPATCH: { key: 'DISPATCH', id: 'dispatch', label: 'Dispatch', blurb: 'Books and tracks shipments' },
  FINANCE: { key: 'FINANCE', id: 'finance', label: 'Finance', blurb: 'Invoicing and payroll' },
  WAREHOUSE: { key: 'WAREHOUSE', id: 'warehouse', label: 'Warehouse', blurb: 'Depot floor and scanners' },
  IT_ADMINS: { key: 'IT_ADMINS', id: 'it-admins', label: 'IT Admins', blurb: 'Helpdesk and infrastructure' },
  DOMAIN_ADMINS: { key: 'DOMAIN_ADMINS', id: 'domain-admins', label: 'Domain Admins', blurb: 'Full control of the directory' },
  VPN_USERS: { key: 'VPN_USERS', id: 'vpn-users', label: 'VPN Users', blurb: 'Permitted to connect remotely' },
  SERVICE_ACCOUNTS: { key: 'SERVICE_ACCOUNTS', id: 'service-accounts', label: 'Service Accounts', blurb: 'Non-human logins' }
};

/* ────────────────────────────── people ──────────────────────────────
 *
 * Three of these carry a deliberate teaching property, and missions depend on
 * them staying true: RAVI holds domain-admin, JORDAN left and the account is
 * still there, and SVC_BACKUP has no person behind it.
 */

export const USER = {
  DANA: {
    key: 'DANA', id: 'u-dana', login: 'dokafor', name: 'Dana Okafor',
    title: 'Dispatch Lead', site: SITE.HQ, host: HOST.PC_DISPATCH,
    enabled: true, groups: [GROUP.STAFF, GROUP.DISPATCH]
  },
  RAVI: {
    key: 'RAVI', id: 'u-ravi', login: 'rsingh', name: 'Ravi Singh',
    title: 'IT Administrator', site: SITE.HQ, host: HOST.PC_IT,
    enabled: true, groups: [GROUP.STAFF, GROUP.IT_ADMINS, GROUP.DOMAIN_ADMINS, GROUP.VPN_USERS]
  },
  LENA: {
    key: 'LENA', id: 'u-lena', login: 'lmoreau', name: 'Lena Moreau',
    title: 'Finance Manager', site: SITE.HQ, host: HOST.PC_FINANCE,
    enabled: true, groups: [GROUP.STAFF, GROUP.FINANCE]
  },
  MO: {
    key: 'MO', id: 'u-mo', login: 'mchen', name: 'Mo Chen',
    title: 'Warehouse Lead', site: SITE.DEPOT, host: HOST.PC_WAREHOUSE,
    enabled: true, groups: [GROUP.STAFF, GROUP.WAREHOUSE]
  },
  TOMAS: {
    key: 'TOMAS', id: 'u-tomas', login: 'tandersen', name: 'Tomas Andersen',
    title: 'Warehouse Operative', site: SITE.DEPOT, host: null,
    enabled: true, groups: [GROUP.STAFF, GROUP.WAREHOUSE]
  },
  JORDAN: {
    key: 'JORDAN', id: 'u-jordan', login: 'jhale', name: 'Jordan Hale',
    title: 'Dispatch Clerk (left the company)', site: SITE.HQ, host: null,
    enabled: false, groups: [GROUP.STAFF, GROUP.DISPATCH]
  },
  SVC_BACKUP: {
    key: 'SVC_BACKUP', id: 'u-svc-backup', login: 'svc-backup', name: 'Backup Service',
    title: 'Service account', site: SITE.HQ, host: null,
    enabled: true, groups: [GROUP.SERVICE_ACCOUNTS]
  }
};

/* ──────────────────────────── the DNS zone ──────────────────────────── */

export const ZONE = 'meridian.local';
export const DNS_FORWARDER = '203.0.113.1';

function a(key, label, target) {
  return { key, type: 'A', name: `${label}.${ZONE}`, value: target.ip, host: target, ttl: 3600 };
}

function cname(key, label, targetKey, ttl = 300) {
  return { key, type: 'CNAME', name: `${label}.${ZONE}`, value: `${targetKey}.${ZONE}`, ttl };
}

export const DNS_RECORD = {
  DC01: a('DC01', 'dc01', HOST.DC01),
  FILE01: a('FILE01', 'file01', HOST.FILE01),
  APP01: a('APP01', 'app01', HOST.APP01),
  DEPOT01: a('DEPOT01', 'depot01', HOST.DEPOT01),
  FW_HQ: { key: 'FW_HQ', type: 'A', name: `fw-hq.${ZONE}`, value: '10.20.10.2', host: HOST.FW_HQ, ttl: 3600 },
  GW_HQ: { key: 'GW_HQ', type: 'A', name: `gw-hq.${ZONE}`, value: '10.20.10.1', host: HOST.RTR_HQ, ttl: 3600 },
  GW_DEPOT: { key: 'GW_DEPOT', type: 'A', name: `gw-depot.${ZONE}`, value: '10.40.10.1', host: HOST.RTR_DEPOT, ttl: 3600 },
  VPN: { key: 'VPN', type: 'A', name: `vpn.${ZONE}`, value: '203.0.113.2', host: HOST.FW_HQ, ttl: 300 },
  INTRANET: cname('INTRANET', 'intranet', 'app01'),
  FILES: cname('FILES', 'files', 'file01')
};

/* ─────────────────────────── table names ─────────────────────────── */

export const TABLE = {
  EMPLOYEES: 'employees',
  ASSETS: 'assets',
  TICKETS: 'tickets',
  SHIPMENTS: 'shipments'
};

/* ──────────────────────── the fingerprint surface ────────────────────────
 *
 * Only the fields below are locked. Labels, titles and blurbs are deliberately
 * excluded so wording can be improved without a ceremony.
 */

export function hardParameters() {
  return {
    version: INFRASTRUCTURE_VERSION,
    zone: ZONE,
    forwarder: DNS_FORWARDER,
    sites: Object.values(SITE).map((site) => ({ key: site.key, id: site.id, code: site.code })),
    nets: Object.values(NET).map((net) => ({
      key: net.key, id: net.id, cidr: net.cidr, vlan: net.vlan,
      gateway: net.gateway, kind: net.kind, site: net.site ? net.site.id : null
    })),
    hosts: Object.values(HOST).map((entry) => ({
      key: entry.key, id: entry.id, kind: entry.kind, site: entry.site.id,
      ports: entry.ports.map((p) => ({ iface: p.iface, ip: p.ip, net: p.net.id }))
    })),
    groups: Object.values(GROUP).map((group) => ({ key: group.key, id: group.id })),
    users: Object.values(USER).map((user) => ({
      key: user.key, id: user.id, login: user.login, enabled: user.enabled,
      site: user.site.id, host: user.host ? user.host.id : null,
      groups: user.groups.map((group) => group.id)
    })),
    dns: Object.values(DNS_RECORD).map((record) => ({
      key: record.key, name: record.name, type: record.type, value: record.value, ttl: record.ttl
    })),
    tables: Object.values(TABLE)
  };
}
