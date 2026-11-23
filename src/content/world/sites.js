/**
 * Derived from the infrastructure contract. Do not add literals here.
 * @see ./contract.js
 */

import { SITE } from './contract.js';

export const SITES = Object.fromEntries(
  Object.values(SITE).map((site) => [
    site.id,
    {
      id: site.id,
      name: site.label,
      code: site.code,
      address: site.address,
      blurb: site.blurb
    }
  ])
);
