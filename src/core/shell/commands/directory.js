/**
 * The directory tool.
 *
 * This used to be a command called `ldap`, which was a mistake: there is no
 * `ldap` binary, and inventing syntax under the name of a real protocol is the
 * exact habit that leaves a beginner confidently typing something that does not
 * exist.
 *
 * `samba-tool` is a real program, shipped with Samba, used every day to
 * administer Active Directory domains from Linux — and its real syntax happens to
 * be short enough to type at three in the morning:
 *
 *     samba-tool user list
 *     samba-tool user show jhale
 *     samba-tool user disable jhale
 *
 * Those are the genuine subcommands, in the genuine order. What a player learns
 * here works on a real domain.
 */

import { createEvent } from '../../world/events.js';
import { selectUsers, selectUser, selectUserByLogin, selectGroups, selectGroup } from '../../world/select.js';
import { SIMPLIFIED } from '../authenticity.js';

/** Active Directory encodes account state in a bit field, and 514 is disabled. */
const UAC_ENABLED = 512;
const UAC_DISABLED = 514;

function findAccount(world, token) {
  return selectUserByLogin(world, token) || selectUser(world, token) || null;
}

function distinguishedName(world, user) {
  const zone = (world.meta && world.meta.zone) || 'meridian.local';
  const domain = zone.split('.').map((part) => `DC=${part}`).join(',');
  return `CN=${user.name},CN=Users,${domain}`;
}

function groupDn(world, group) {
  const zone = (world.meta && world.meta.zone) || 'meridian.local';
  const domain = zone.split('.').map((part) => `DC=${part}`).join(',');
  return `CN=${group},CN=Users,${domain}`;
}

export const sambaTool = {
  name: 'samba-tool',
  authenticity: SIMPLIFIED,
  realWorld:
    'Real samba-tool has many more subcommands — computer, dns, domain, spn and others — and takes ' +
    'credential flags such as -U and --use-kerberos. This build supports "user" (list, show, enable, ' +
    'disable) and "group" (list, listmembers, addmembers, removemembers). Those are spelled exactly as ' +
    'they really are, and the userAccountControl values in "show" are the real ones.',
  summary: 'Administer accounts and groups in the Active Directory domain.',
  usage: 'samba-tool user <action> [login] | samba-tool group <action> [group] [login]',
  manual: [
    'samba-tool administers an Active Directory domain from a Linux machine. It is',
    'part of Samba and is what you will actually find on a Linux box joined to a',
    'Windows domain.',
    '',
    '  samba-tool user list              every account, one per line',
    '  samba-tool user show jhale        one account in full',
    '  samba-tool user disable jhale     stop the account being used',
    '  samba-tool user enable jhale      allow it again',
    '',
    '  samba-tool group list                           every group',
    '  samba-tool group listmembers domain-admins      who is in one',
    '  samba-tool group addmembers domain-admins x     put somebody in',
    '  samba-tool group removemembers domain-admins x  take somebody out',
    '',
    'Rights are granted to groups, not to people, so membership is what actually',
    'decides what an account can reach. "user show" lists the groups an account',
    'is in; "group listmembers" asks it the other way round, which is the',
    'question an access review needs — you are not looking for a person you',
    'already suspect, you are looking at a powerful group for a name that should',
    'not be there.',
    '',
    'Look at userAccountControl in the output of "show". It is a bit field, and',
    'the two values you will meet constantly are 512 for a normal enabled account',
    'and 514 for a disabled one. The difference is a single bit.',
    '',
    'There is a "user delete" in the real tool and it is not offered here, for the',
    'same reason you should hesitate over it in real life: disabling stops the',
    'login and keeps the record of what the account could reach, which is exactly',
    'what you will want when somebody asks, six weeks later, what the leaver had',
    'access to. Deleting throws that away and cannot be undone.',
    '',
    'On Windows the equivalents are the ActiveDirectory PowerShell module:',
    'Get-ADUser, Disable-ADAccount, Enable-ADAccount.'
  ],

  run({ positional, world }) {
    const [object, action, target] = positional;

    if (!object) {
      return {
        stderr: [
          'Usage: samba-tool <subcommand>',
          '',
          'Available subcommands:',
          '  user   - User management.',
          '  group  - Group management.'
        ],
        exit: 1
      };
    }

    if (object === 'group') return runGroup({ positional, world });

    if (object !== 'user') {
      return {
        stderr: [`samba-tool: unknown subcommand "${object}"`, 'This build supports: user, group'],
        exit: 1
      };
    }

    if (!action) {
      return {
        stderr: [
          'Usage: samba-tool user <subcommand>',
          '',
          'Available subcommands:',
          '  list     - List all users.',
          '  show     - Display a user.',
          '  enable   - Enable a user.',
          '  disable  - Disable a user.'
        ],
        exit: 1
      };
    }

    /* ---- list ---- */
    if (action === 'list') {
      // Real samba-tool user list prints one sAMAccountName per line, nothing else.
      return { stdout: selectUsers(world).map((user) => user.login), exit: 0 };
    }

    /* ---- show ---- */
    if (action === 'show') {
      if (!target) return { stderr: ['Usage: samba-tool user show <username>'], exit: 1 };

      const user = findAccount(world, target);
      if (!user) return { stderr: [`ERROR: Unable to find user "${target}"`], exit: 1 };

      const groups = (user.groups || []).slice().sort();

      return {
        stdout: [
          `dn: ${distinguishedName(world, user)}`,
          'objectClass: top',
          'objectClass: person',
          'objectClass: organizationalPerson',
          'objectClass: user',
          `cn: ${user.name}`,
          `sAMAccountName: ${user.login}`,
          `displayName: ${user.name}`,
          ...(user.title ? [`title: ${user.title}`] : []),
          `userAccountControl: ${user.enabled ? UAC_ENABLED : UAC_DISABLED}`,
          ...groups.map((group) => `memberOf: ${groupDn(world, group)}`)
        ],
        exit: 0
      };
    }

    /* ---- enable / disable ---- */
    if (action === 'enable' || action === 'disable') {
      if (!target) return { stderr: [`Usage: samba-tool user ${action} <username>`], exit: 1 };

      const user = findAccount(world, target);
      if (!user) return { stderr: [`ERROR: Unable to find user "${target}"`], exit: 1 };

      const wanted = action === 'enable';
      if (user.enabled === wanted) {
        return { stdout: [`User '${user.login}' is already ${wanted ? 'enabled' : 'disabled'}.`], exit: 0 };
      }

      return {
        stdout: [`${wanted ? 'Enabled' : 'Disabled'} user '${user.login}'.`],
        events: [createEvent('identity/user-set-enabled', { userId: user.id, enabled: wanted })],
        exit: 0
      };
    }

    if (action === 'delete') {
      return {
        stderr: [
          'samba-tool: "user delete" is not available on this system.',
          '',
          'Disable the account instead. It stops the login and keeps the record of',
          'what the account could reach; deleting cannot be undone.'
        ],
        exit: 1
      };
    }

    return { stderr: [`samba-tool: unknown subcommand "user ${action}"`], exit: 1 };
  }
};

/**
 * The group half.
 *
 * `user show` answers "what is this person in?"; `group listmembers` answers
 * "who is in this?" — and an access review needs the second one, because you are
 * never looking for a person you already suspect. Opening domain-admins and
 * finding a name you did not expect is how over-privilege is actually caught.
 *
 * The events these emit already existed in the world model and simply had no
 * command behind them, so nothing the player could type could reach them.
 */
function runGroup({ positional, world }) {
  const [, action, groupToken, memberToken] = positional;

  if (!action) {
    return {
      stderr: [
        'Usage: samba-tool group <subcommand>',
        '',
        'Available subcommands:',
        '  list           - List all groups.',
        '  listmembers    - List the members of a group.',
        '  addmembers     - Add a member to a group.',
        '  removemembers  - Remove a member from a group.'
      ],
      exit: 1
    };
  }

  if (action === 'list') {
    return { stdout: selectGroups(world).map((group) => group.id), exit: 0 };
  }

  if (!['listmembers', 'addmembers', 'removemembers'].includes(action)) {
    return { stderr: [`samba-tool: unknown subcommand "group ${action}"`], exit: 1 };
  }

  if (!groupToken) return { stderr: [`Usage: samba-tool group ${action} <groupname>`], exit: 1 };

  const group = selectGroup(world, groupToken);
  if (!group) return { stderr: [`ERROR: Unable to find group "${groupToken}"`], exit: 1 };

  if (action === 'listmembers') {
    return {
      stdout: selectUsers(world)
        .filter((user) => (user.groups || []).includes(group.id))
        .map((user) => user.login),
      exit: 0
    };
  }

  if (!memberToken) {
    return { stderr: [`Usage: samba-tool group ${action} <groupname> <username>`], exit: 1 };
  }

  const user = findAccount(world, memberToken);
  if (!user) return { stderr: [`ERROR: Unable to find user "${memberToken}"`], exit: 1 };

  const adding = action === 'addmembers';
  const isMember = (user.groups || []).includes(group.id);

  if (adding === isMember) {
    return {
      stdout: [`User '${user.login}' is already ${adding ? 'in' : 'not in'} group '${group.id}'.`],
      exit: 0
    };
  }

  return {
    stdout: [adding ? `Added members to group ${group.id}` : `Removed members from group ${group.id}`],
    events: [
      createEvent(adding ? 'identity/user-group-add' : 'identity/user-group-remove', {
        userId: user.id,
        group: group.id
      })
    ],
    exit: 0
  };
}

export const DIRECTORY_COMMANDS = [sambaTool];
