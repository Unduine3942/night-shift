/**
 * Derived from the infrastructure contract. Do not add literals here.
 *
 * Because A records carry their target HOST rather than a copied address, a
 * record can never drift away from the machine it names.
 *
 * @see ./contract.js
 */

import { DNS_RECORD, ZONE, DNS_FORWARDER } from './contract.js';

export const DNS = {
  zone: ZONE,
  forwarders: [DNS_FORWARDER],
  records: Object.values(DNS_RECORD).map((record) => ({
    name: record.name,
    type: record.type,
    value: record.value,
    ttl: record.ttl
  }))
};
