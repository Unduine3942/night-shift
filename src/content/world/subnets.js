/**
 * Derived from the infrastructure contract. Do not add literals here.
 * @see ./contract.js
 */

import { NET } from './contract.js';

export const SUBNETS = Object.fromEntries(
  Object.values(NET).map((net) => [
    net.id,
    {
      id: net.id,
      name: net.label,
      cidr: net.cidr,
      vlan: net.vlan,
      siteId: net.site ? net.site.id : null,
      gateway: net.gateway,
      kind: net.kind
    }
  ])
);
