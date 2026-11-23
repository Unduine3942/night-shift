/**
 * Derived from the infrastructure contract. Do not add literals here.
 * @see ./contract.js
 */

import { USER, GROUP } from './contract.js';

export const GROUPS = Object.fromEntries(
  Object.values(GROUP).map((group) => [
    group.id,
    { id: group.id, name: group.label, description: group.blurb }
  ])
);

export const USERS = Object.fromEntries(
  Object.values(USER).map((user) => [
    user.id,
    {
      id: user.id,
      login: user.login,
      name: user.name,
      title: user.title,
      siteId: user.site.id,
      hostId: user.host ? user.host.id : null,
      enabled: user.enabled,
      groups: user.groups.map((group) => group.id)
    }
  ])
);
