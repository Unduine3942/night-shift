/**
 * Walkthroughs for getting onto other machines, and for the directory.
 *
 * These are the commands that change something rather than just look at it, so
 * the steps are written with the habit that matters most attached: read the
 * state, make the change, read it back. Every one of them is verified by the
 * test suite typing it into a real session.
 */

export const ACCESS_TUTORIALS = [
  {
    command: 'ssh',
    concepts: ['authentication', 'ports-protocols', 'os-basics', 'least-privilege'],

    idea:
      'Opens a shell on another machine over the network, encrypted end to end. Once connected, every command ' +
      'you type runs there rather than here — which is obvious until the moment you forget it and run ' +
      'something destructive on the wrong box.',

    onTheJob:
      'Almost all server administration is this. You are rarely in the same room as the machine, and often ' +
      'not in the same building, so the working assumption is that everything gets done over SSH and the ' +
      'physical console is the fallback for when SSH is what broke.',

    steps: [
      {
        title: 'Confirm the service is listening before you try',
        line: 'nmap srv-dc01',
        look: '22/tcp    open   ssh',
        why:
          'Port 22 is open, so the SSH daemon is running and accepting connections. Thirty seconds of checking ' +
          'beats a connection attempt that hangs and leaves you unsure whether it is the network or the service.'
      },
      {
        title: 'Connect',
        line: 'ssh srv-dc01',
        look: 'Linux srv-dc01',
        why:
          'The banner names the machine you have landed on. Read it every single time — this is the last ' +
          'cheap moment to notice you are not where you meant to be.'
      },
      {
        title: 'Prove you have actually moved',
        line: 'ip addr',
        look: 'inet 10.20.10.10/24',
        why:
          'The same command that showed 10.20.20.43 at your desk now shows the domain controller’s address, ' +
          'because it is running there. This is the whole point of SSH and the whole danger of it.'
      },
      {
        title: 'Go back',
        line: 'exit',
        look: 'Connection to srv-dc01 closed',
        why:
          'You are at your own desk again. Leaving sessions open on servers is untidy and, on a shared ' +
          'workstation, a genuine way for someone else to inherit your access.'
      }
    ],

    reading: [
      { part: 'the banner', means: 'which machine you are now on, and what it runs' },
      { part: 'the prompt', means: 'it changes to the remote hostname — the clearest signal of where you are' },
      { part: 'Connection to ... closed', means: 'you are back on the machine you started from' }
    ],

    mistakes: [
      {
        line: 'ssh srv-nowhere',
        look: 'Could not resolve',
        why:
          'The name did not resolve, so no connection was attempted. Nothing is wrong with SSH — this is a ' +
          'DNS answer wearing an SSH error message, and the tool to reach for is nslookup.'
      }
    ],

    seeAlso: ['console', 'exit', 'nmap', 'samba-tool']
  },

  {
    command: 'console',
    concepts: ['troubleshooting-method', 'os-basics', 'incident-response'],

    idea:
      'Reaches a machine’s management console over a separate path that does not depend on the ordinary ' +
      'network. This is how you get to a switch after you have just broken its network configuration — the ' +
      'situation SSH cannot help you with, because SSH is the thing that stopped working.',

    onTheJob:
      'Out-of-band access is what stands between a bad config change and a drive to the data centre at three ' +
      'in the morning. Every serious network estate has some form of it, and the time to find out yours works ' +
      'is before you need it.',

    steps: [
      {
        title: 'Check the ordinary path first',
        line: 'ping -c 1 sw-hq-core',
        look: '0% packet loss',
        why:
          'The switch answers on the management network, so today you could simply ssh to it. Console is ' +
          'what you reach for when this ping is the thing that has stopped working.'
      },
      {
        title: 'Connect the other way instead',
        line: 'console sw-hq-core',
        look: 'connected to console server',
        why:
          'The connection goes through a console server rather than across the production network. That is ' +
          'why it still works when the device’s own networking does not.'
      },
      {
        title: 'Notice that the line is yours alone',
        line: 'console sw-hq-core',
        look: 'already on sw-hq-core',
        why:
          'Out-of-band means "not over the thing you are fixing". There is one console line per device, so ' +
          'asking again tells you it is already yours — and on a real console server it would tell you when ' +
          'it was somebody else’s.'
      },
      {
        title: 'Disconnect',
        line: 'exit',
        look: 'closed',
        why:
          'Console ports are usually a single shared line. Leaving a session attached means the next person ' +
          'who needs it — possibly you, during an outage — finds it busy.'
      }
    ],

    reading: [
      { part: 'connected to console server', means: 'you reached it by the management path, not the network' },
      { part: 'the device name and role', means: 'confirmation of which console you landed on' }
    ],

    mistakes: [
      {
        line: 'console',
        look: 'usage',
        why:
          'It needs to know which machine. On a real console server you would list the ports first, because ' +
          'port names rarely match hostnames and the mapping is somebody’s decade-old spreadsheet.'
      }
    ],

    seeAlso: ['ssh', 'exit', 'ping']
  },

  {
    command: 'exit',
    concepts: ['os-basics', 'least-privilege'],

    idea:
      'Ends the current session and returns you to wherever you connected from. With no session to leave, it ' +
      'logs you out. It is the counterpart to ssh and console, and the habit of using it deliberately is what ' +
      'keeps you sure which machine you are on.',

    onTheJob:
      'The genuinely dangerous moment in server work is not knowing which box your prompt belongs to. ' +
      'Exiting as soon as you are finished, rather than leaving connections stacked up, is the cheapest ' +
      'protection against running the right command in the wrong place.',

    steps: [
      {
        title: 'Go somewhere',
        line: 'ssh srv-file01',
        look: 'Linux srv-file01',
        why: 'You are now on the file server, and everything you type lands there instead of at your desk.'
      },
      {
        title: 'Come back',
        line: 'exit',
        look: 'Connection to srv-file01 closed',
        why:
          'One exit unwinds one connection. If you had connected onwards from there you would need another — ' +
          'sessions nest, and so does getting out of them.'
      }
    ],

    reading: [
      { part: 'Connection to ... closed', means: 'that session has ended and you are one level back' },
      { part: 'logout', means: 'an alias for the same thing' }
    ],

    mistakes: [],

    seeAlso: ['ssh', 'console']
  },

  {
    command: 'samba-tool',
    concepts: [
      'active-directory',
      'user-accounts',
      'groups-membership',
      'dormant-accounts',
      'least-privilege',
      'access-control'
    ],

    idea:
      'Administers accounts in the Active Directory domain: who exists, what groups they are in, and whether ' +
      'their account can be used. The directory is the single place that answers "who is this person and what ' +
      'are they allowed to do", so this is where identity problems are actually fixed.',

    onTheJob:
      'Access reviews, leavers, and the endless question of why somebody can or cannot open a particular ' +
      'folder all end up here. Disabling a leaver’s account is one of the highest-value five-second jobs in ' +
      'the whole discipline.',

    steps: [
      {
        title: 'List every account in the domain',
        line: 'samba-tool user list',
        look: 'rsingh',
        why:
          'The starting point of any access review. Read it looking for names you do not recognise and names ' +
          'you recognise as having left.'
      },
      {
        title: 'Look at one account in full',
        line: 'samba-tool user show rsingh',
        look: 'userAccountControl: 512',
        why:
          'This is LDIF, the standard text form for directory entries — the same shape you would get from ' +
          'ldapsearch against any LDAP directory. 512 means a normal, enabled account.'
      },
      {
        title: 'Read the group memberships',
        line: 'samba-tool user show rsingh',
        look: 'memberOf: CN=domain-admins',
        why:
          'Rights are granted to groups, not to people, so memberOf is what actually determines access. ' +
          'domain-admins is total control of the directory — a membership that should be rare and deliberate.'
      },
      {
        title: 'Find an account that should not be enabled',
        line: 'samba-tool user show jhale',
        look: 'left the company',
        why:
          'The title says outright that this person has gone. Check userAccountControl against that: an ' +
          'enabled account belonging to a leaver is exactly what an access review exists to catch.'
      },
      {
        title: 'Disable rather than delete',
        line: 'samba-tool user disable mchen',
        look: "Disabled user 'mchen'",
        why:
          'Disabling stops the account being used while keeping its history and group memberships. Deleting ' +
          'destroys the evidence you will want when somebody asks what that account had access to.'
      },
      {
        title: 'Read the change back',
        line: 'samba-tool user show mchen',
        look: 'userAccountControl: 514',
        why:
          '514 is disabled. Never trust a change you have not verified — the command reporting success and the ' +
          'directory actually holding the new value are two different facts.'
      },
      {
        title: 'Turn the question round',
        line: 'samba-tool group listmembers domain-admins',
        look: 'rsingh',
        why:
          'user show asks "what is this person in?". This asks "who is in this?" and an access review ' +
          'needs the second one, because you are never looking for a person you already suspect. You open ' +
          'the powerful group and read it for a name that should not be there.'
      },
      {
        title: 'Grant a right the wrong way, so you can see it',
        line: 'samba-tool group addmembers domain-admins mchen',
        look: 'Added members to group domain-admins',
        why:
          'Mo Chen now has total control of the directory, and nothing about the account looks unusual ' +
          'from the outside. This is how over-privilege actually arrives: a membership added for one ' +
          'afternoon and never taken off again.'
      },
      {
        title: 'Take back the one right, and nothing else',
        line: 'samba-tool group removemembers domain-admins mchen',
        look: 'Removed members from group domain-admins',
        why:
          'One membership gone; the account still works and still has the groups it needs for the job. ' +
          'Stripping somebody of everything because they had one right too many is the overcorrection ' +
          'that gets access reviews quietly ignored the next time they run.'
      },
      {
        title: 'Put it back',
        line: 'samba-tool user enable mchen',
        look: "Enabled user 'mchen'",
        why:
          'Mo Chen has not left; that was practice. Undoing a change you made for a test is part of making it, ' +
          'not a separate optional step.'
      }
    ],

    reading: [
      { part: 'dn', means: 'the distinguished name — the entry’s full unique path in the directory tree' },
      { part: 'sAMAccountName', means: 'the login name, the thing people actually type' },
      { part: 'userAccountControl: 512', means: 'a normal, enabled account' },
      { part: 'userAccountControl: 514', means: 'the same account, disabled' },
      { part: 'memberOf', means: 'a group this account belongs to — one line per group' },
      { part: 'title', means: 'the job title, which is often where "has left" is recorded first' },
      { part: 'group list', means: 'every group in the domain' },
      { part: 'group listmembers <group>', means: 'who is in one, which is the access-review question' },
      { part: 'group addmembers / removemembers', means: 'change one membership without touching the account' }
    ],

    mistakes: [
      {
        line: 'samba-tool user delete jhale',
        look: 'Disable the account instead',
        why:
          'Deletion is withheld here on purpose. In real incident work the account of someone who has left is ' +
          'evidence, and the group memberships attached to it are the record of what they could reach.'
      },
      {
        line: 'samba-tool user show nobody',
        look: 'Unable to find user',
        why:
          'Login names are not display names. If a lookup fails, list the accounts and check the spelling ' +
          'before concluding the account has gone.'
      }
    ],

    seeAlso: ['ssh', 'submit']
  }
];
