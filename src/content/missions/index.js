/**
 * The catalogue.
 *
 * One file per mission, listed here once. Everything about ordering, gating and
 * availability is computed from the missions themselves — see
 * core/missions/progression.js — so this list carries no sequence information and
 * adding a mission means adding two lines.
 *
 * tests/content/missions.test.js validates the whole set: shapes, the concept
 * dependency graph, reachability from a standing start, and every reference
 * solution run against the real seed world.
 */

import it001 from './it-001-identify-host.js';
import it002 from './it-002-what-gets-picked-up-first.js';
import it003 from './it-003-osi-triage.js';
import sec001 from './sec-001-reenabled-leaver.js';
import sec002 from './sec-002-one-account-for-everything.js';
import net001 from './net-001-scanner-offline.js';
import net002 from './net-002-staff-subnet.js';
import net003 from './net-003-name-to-address.js';
import net004 from './net-004-off-network.js';
import net005 from './net-005-why-voice-is-separate.js';
import net006 from './net-006-split-the-depot-floor.js';
import net007 from './net-007-where-does-the-depot-traffic-go.js';
import net014 from './net-014-shipping-app-dns.js';
import it004 from './it-004-who-is-on-this-address.js';
import sec003 from './sec-003-new-starter-cannot-log-in.js';
import sec004 from './sec-004-too-many-domain-admins.js';

export const MISSIONS = [
  it001, it002, it003, it004,
  sec001, sec002, sec003, sec004,
  net001, net002, net003, net004, net005, net006, net007, net014
];

export function missionById(id) {
  return MISSIONS.find((mission) => mission.id === id) || null;
}
