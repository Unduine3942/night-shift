/**
 * The company's records — what the SQL lens queries.
 *
 * Rows are business data, not infrastructure, so they live here rather than in
 * the contract. But every foreign key is a contract SYMBOL, never a copied
 * string: `USER.DANA.id`, not `'u-dana'`. A query like "which scanners belong to
 * someone on the warehouse team" therefore has to agree with what `ping` says,
 * because both resolve through the same constant.
 *
 * Dates are literal strings; nothing here may read the wall clock.
 *
 * @see ./contract.js
 */

import { USER, HOST, SITE } from './contract.js';

export const TABLES = {
  employees: [
    { id: 1, name: 'Dana Okafor', dept: 'Dispatch', siteId: SITE.HQ.id, userId: USER.DANA.id, startDate: '2021-03-15' },
    { id: 2, name: 'Ravi Singh', dept: 'IT', siteId: SITE.HQ.id, userId: USER.RAVI.id, startDate: '2019-07-01' },
    { id: 3, name: 'Lena Moreau', dept: 'Finance', siteId: SITE.HQ.id, userId: USER.LENA.id, startDate: '2022-01-10' },
    { id: 4, name: 'Mo Chen', dept: 'Warehouse', siteId: SITE.DEPOT.id, userId: USER.MO.id, startDate: '2020-11-02' },
    { id: 5, name: 'Tomas Andersen', dept: 'Warehouse', siteId: SITE.DEPOT.id, userId: USER.TOMAS.id, startDate: '2023-05-22' },
    { id: 6, name: 'Jordan Hale', dept: 'Dispatch', siteId: SITE.HQ.id, userId: USER.JORDAN.id, startDate: '2018-02-05' }
  ],

  assets: [
    { id: 'A-1001', hostId: HOST.PC_DISPATCH.id, kind: 'workstation', owner: USER.DANA.id, purchased: '2023-01-12' },
    { id: 'A-1002', hostId: HOST.PC_FINANCE.id, kind: 'workstation', owner: USER.LENA.id, purchased: '2023-01-12' },
    { id: 'A-1003', hostId: HOST.PC_IT.id, kind: 'workstation', owner: USER.RAVI.id, purchased: '2022-06-30' },
    { id: 'A-1004', hostId: HOST.PC_WAREHOUSE.id, kind: 'workstation', owner: USER.MO.id, purchased: '2023-09-01' },
    { id: 'A-1005', hostId: HOST.SCAN01.id, kind: 'scanner', owner: USER.MO.id, purchased: '2024-02-14' },
    { id: 'A-1006', hostId: HOST.SCAN02.id, kind: 'scanner', owner: USER.TOMAS.id, purchased: '2024-02-14' }
  ],

  tickets: [
    { id: 'T-4101', opened: '2026-02-24', priority: 'high', status: 'open', requesterId: USER.DANA.id, summary: 'Cannot reach the shipping app' },
    { id: 'T-4102', opened: '2026-02-24', priority: 'low', status: 'open', requesterId: USER.LENA.id, summary: 'Printer queue stuck' },
    { id: 'T-4103', opened: '2026-02-25', priority: 'high', status: 'open', requesterId: USER.MO.id, summary: 'Scanners drop off the wireless in bay 3' },
    { id: 'T-4104', opened: '2026-02-25', priority: 'medium', status: 'closed', requesterId: USER.RAVI.id, summary: 'Rotate the backup service password' },
    { id: 'T-4105', opened: '2026-02-26', priority: 'medium', status: 'open', requesterId: USER.TOMAS.id, summary: 'New starter needs a depot login' },
    { id: 'T-4106', opened: '2026-02-26', priority: 'low', status: 'open', requesterId: USER.DANA.id, summary: 'Intranet shortcut opens the wrong page' }
  ],

  shipments: [
    { id: 'S-9001', origin: 'Portside', destination: 'Eastfield', status: 'delivered', weightKg: 412, carrier: 'Northline', userId: USER.DANA.id, dispatchedAt: '2026-02-18' },
    { id: 'S-9002', origin: 'Eastfield', destination: 'Harbourgate', status: 'delivered', weightKg: 1180, carrier: 'Northline', userId: USER.DANA.id, dispatchedAt: '2026-02-19' },
    { id: 'S-9003', origin: 'Portside', destination: 'Caldwell', status: 'in-transit', weightKg: 76, carrier: 'Redfern Freight', userId: USER.JORDAN.id, dispatchedAt: '2026-02-20' },
    { id: 'S-9004', origin: 'Eastfield', destination: 'Portside', status: 'in-transit', weightKg: 2340, carrier: 'Northline', userId: USER.MO.id, dispatchedAt: '2026-02-21' },
    { id: 'S-9005', origin: 'Caldwell', destination: 'Eastfield', status: 'delayed', weightKg: 55, carrier: 'Redfern Freight', userId: USER.DANA.id, dispatchedAt: '2026-02-21' },
    { id: 'S-9006', origin: 'Portside', destination: 'Harbourgate', status: 'booked', weightKg: 890, carrier: 'Coastway', userId: USER.MO.id, dispatchedAt: '2026-02-24' },
    { id: 'S-9007', origin: 'Harbourgate', destination: 'Portside', status: 'delivered', weightKg: 143, carrier: 'Coastway', userId: USER.TOMAS.id, dispatchedAt: '2026-02-22' },
    { id: 'S-9008', origin: 'Eastfield', destination: 'Caldwell', status: 'booked', weightKg: 610, carrier: 'Northline', userId: USER.DANA.id, dispatchedAt: '2026-02-25' }
  ]
};
