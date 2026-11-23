/**
 * The seed — Meridian Logistics at tick zero, before anything has happened.
 *
 * Everything the player ever sees is `reduceWorld(seed, events)`. The seed is
 * fixed authored data and is deep-frozen, so a stray write throws in the shipped
 * build (which runs in strict mode) instead of silently corrupting a replay.
 *
 * The content lives in src/content/world/* as plain data. This module only
 * assembles it, which keeps "what the company is" separate from "how a world is
 * put together".
 *
 * Its structural invariants — addresses on declared subnets, DNS pointing at real
 * hosts, table rows referencing real people and machines — are enforced by
 * tests/core/world/seed.test.js rather than by care.
 */

import { deepFreeze } from '../immutable.js';
import { SITES } from '../../content/world/sites.js';
import { SUBNETS } from '../../content/world/subnets.js';
import { DEVICES } from '../../content/world/devices.js';
import { DNS } from '../../content/world/dns.js';
import { USERS, GROUPS } from '../../content/world/identity.js';
import { TABLES } from '../../content/world/tables.js';

/** Bump when the world's shape changes, so saves can be migrated. */
export const SEED_VERSION = 1;

const SEED = deepFreeze({
  tick: 0,
  meta: {
    company: 'Meridian Logistics',
    zone: DNS.zone,
    version: SEED_VERSION
  },
  sites: SITES,
  net: {
    subnets: SUBNETS,
    devices: DEVICES,
    dns: DNS
  },
  identity: {
    users: USERS,
    groups: GROUPS
  },
  data: {
    tables: TABLES
  }
});

/**
 * The starting world.
 *
 * Returns the shared frozen seed rather than a copy: it cannot be modified, and
 * every change goes through an event anyway, so there is nothing to protect
 * against and a great deal of copying to avoid.
 */
export function createSeed() {
  return SEED;
}
