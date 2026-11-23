/**
 * Walkthroughs for the commands about the terminal itself.
 *
 * Shorter than the rest, and deliberately so — these are habits rather than
 * tools. The one that matters is `man`: a player who learns to look a command up
 * before guessing at it has picked up the single most transferable thing in this
 * whole game, and it works on every Unix machine they will ever sit at.
 */

export const DESK_TUTORIALS = [
  {
    command: 'help',
    concepts: ['os-basics', 'troubleshooting-method'],

    idea:
      'Lists every command this machine has, grouped by what it is for, with a tag saying how closely each ' +
      'one matches the real tool of that name. It is the map you look at when you know what you want to ' +
      'achieve but not what it is called.',

    onTheJob:
      'The real skill is not memorising commands, it is knowing roughly what exists and being quick at ' +
      'looking up the rest. Nobody remembers every flag; everybody who is good at this reaches for the ' +
      'documentation without embarrassment.',

    steps: [
      {
        title: 'See everything, grouped by purpose',
        line: 'help',
        look: 'Reaching other machines',
        why:
          'The groups follow the questions you actually have — what is this machine, can I reach that one, ' +
          'what is this name — rather than alphabetical order, which helps nobody.'
      },
      {
        title: 'Read the honesty tags',
        line: 'help',
        look: '(site tool)',
        why:
          'Every command says how real it is. "site tool" means it exists only here and its manual names the ' +
          'real-world equivalent, so you never memorise something that will not work on a real machine.'
      }
    ],

    reading: [
      { part: 'no tag', means: 'a real tool behaving as it really does — safe to carry straight to a real machine' },
      { part: '(simplified)', means: 'a real tool with a smaller set of options. The manual says what is missing' },
      { part: '(site tool)', means: 'invented for this company. The manual names what you would really use' }
    ],

    mistakes: [],

    seeAlso: ['man', 'tutorial']
  },

  {
    command: 'man',
    concepts: ['os-basics', 'troubleshooting-method'],

    idea:
      'Prints the manual for one command: what it does, how to type it, and when to reach for it. On a real ' +
      'Unix machine this is the same command with the same job, and it works offline on every box you will ' +
      'ever sit at.',

    onTheJob:
      'Reaching for man before guessing is the habit that separates people who are quick at the command line ' +
      'from people who are slow at it. Guessing at flags costs more time than reading about them, and ' +
      'occasionally costs a production system.',

    steps: [
      {
        title: 'Look up a command you have not used',
        line: 'man traceroute',
        look: 'TRACEROUTE',
        why:
          'The page opens with what the command is for, in one line. If that line is not what you wanted, you ' +
          'have saved yourself from running the wrong tool.'
      },
      {
        title: 'Read the honesty banner',
        line: 'man nmap',
        look: 'SIMPLIFIED',
        why:
          'Anything not exactly like the real tool says so here, and says what it left out. That is how you ' +
          'know which parts of what you just learned will transfer to a real machine.'
      },
      {
        title: 'Check what a site tool really corresponds to',
        line: 'man console',
        look: 'ipmitool',
        why:
          'console is invented for this company, so its manual names the real things — ipmitool, conserver, a ' +
          'vendor KVM. You learn the concept here and the actual tool name at the same time.'
      }
    ],

    reading: [
      { part: 'the first line', means: 'the command name and a one-line summary' },
      { part: 'the banner', means: 'how real this command is, and what a simplified one left out' },
      { part: 'usage', means: 'the shape of the command — what is required and what is optional' }
    ],

    mistakes: [
      {
        line: 'man nosuchthing',
        look: 'No manual entry',
        why:
          'Exactly what a real machine says. It usually means the tool is not installed rather than that it ' +
          'does not exist, which is a different problem with a different fix.'
      }
    ],

    seeAlso: ['help', 'tutorial']
  },

  {
    command: 'tutorial',
    concepts: ['os-basics', 'troubleshooting-method'],

    idea:
      'Prints a worked walkthrough for a command: what it is for, what to type, in what order, and what each ' +
      'answer rules out. Where man tells you what a command does, this shows you how it is used to get ' +
      'somewhere.',

    onTheJob:
      'This one is invented — no real machine has it. On a real box the nearest equivalents are the EXAMPLES ' +
      'section at the bottom of a man page, the tldr project, and whatever your team has written down. ' +
      'Reading examples before flags is the habit worth taking away.',

    steps: [
      {
        title: 'Walk through a command you know the name of',
        line: 'tutorial ping',
        look: 'Step 1',
        why:
          'The steps are in the order of the reasoning rather than the order of the options, so what you get ' +
          'is a way of thinking about the problem rather than a list of flags.'
      },
      {
        title: 'See which concepts it belongs to',
        line: 'tutorial ping',
        look: 'Concepts:',
        why:
          'Every walkthrough names the ideas behind the tool. Those are the same concepts the tickets are ' +
          'built from, so this is also a map of what the game is going to ask you.'
      },
      {
        title: 'Find out what has a walkthrough',
        line: 'tutorial',
        look: 'usage',
        why:
          'Every command on this machine has one. The full version, with the output annotated line by line, ' +
          'is in the Manual window.'
      }
    ],

    reading: [
      { part: 'Concepts', means: 'the ideas this tool belongs to, shared with the tickets' },
      { part: 'Step N', means: 'a line to type and what its answer tells you' },
      { part: 'Watch for', means: 'the part of the output that carries the answer' }
    ],

    mistakes: [
      {
        line: 'tutorial nosuchthing',
        look: 'No walkthrough',
        why:
          'Only commands this machine has are covered. If you are looking for a tool that is not here, help ' +
          'will show you what is.'
      }
    ],

    seeAlso: ['man', 'help']
  },

  {
    command: 'history',
    concepts: ['os-basics', 'troubleshooting-method', 'incident-response'],

    idea:
      'Lists the commands you have run this session, numbered. The terminal also recalls them one at a time ' +
      'with the up arrow, which is faster for the last few; history is for seeing the whole sequence at once.',

    onTheJob:
      'Two real uses. Writing up what you did, because "what exactly did you change" is the first question ' +
      'after an outage and memory is a poor witness. And catching your own mistake, because the command you ' +
      'meant to run and the one you actually ran are both in the list.',

    steps: [
      {
        title: 'Do a couple of things',
        line: 'ping -c 1 srv-dc01',
        look: '64 bytes from',
        why: 'Anything you type is recorded, including the commands that failed — which are often the interesting ones.'
      },
      {
        title: 'Read back what you have done',
        line: 'history',
        look: 'ping -c 1 srv-dc01',
        why:
          'Numbered in the order you ran them. This is the raw material of a handover note, and it is far more ' +
          'accurate than writing one from memory an hour later.'
      }
    ],

    reading: [
      { part: 'the number', means: 'position in this session, oldest first' },
      { part: 'the line', means: 'exactly what you typed, mistakes included' }
    ],

    mistakes: [],

    seeAlso: ['clear', 'man']
  },

  {
    command: 'clear',
    concepts: ['os-basics'],

    idea:
      'Empties the screen. Nothing is deleted and nothing is undone — the commands you ran still ran, and ' +
      'history still has every one of them. It only gives you a clean page to work on.',

    onTheJob:
      'Worth doing before a command whose output you actually need to read. Hunting for the start of a long ' +
      'output in a screen full of previous attempts is a small, constant waste of attention.',

    steps: [
      {
        title: 'Fill the screen with something',
        line: 'ip addr',
        look: 'inet 10.20.20.43/24',
        why: 'A few commands in and the useful part of the output is already scrolled away from the prompt.'
      },
      {
        title: 'Wipe it',
        line: 'clear',
        clears: true,
        why: 'A clean page. The next command’s output starts at the top where you can actually read it.'
      },
      {
        title: 'Prove nothing was lost',
        line: 'history',
        look: 'ip addr',
        why:
          'Everything you ran is still recorded. clear is cosmetic, which is exactly why it is safe to use ' +
          'whenever the screen gets noisy.'
      }
    ],

    reading: [],

    mistakes: [
      {
        line: 'cls',
        look: 'command not found',
        why:
          'cls is the Windows one. Same job, different name, and it does not exist on a Linux machine any ' +
          'more than clear exists at a Windows command prompt.'
      }
    ],

    seeAlso: ['history', 'help']
  },

  {
    command: 'submit',
    ticket: 'sec-001',
    concepts: ['ticket-triage', 'incident-response', 'user-accounts'],

    idea:
      'Reports a finding against the ticket you have open. Some tickets are proved by the state of the ' +
      'network — you fixed it, and the fix is visible. Others ask you a question, and the answer has to be ' +
      'written down before the ticket can be closed.',

    onTheJob:
      'Invented for this company, but the habit is not: a piece of work is not finished when the problem ' +
      'stops happening, it is finished when the next person can tell what was wrong and what you did. Real ' +
      'equivalents are the ticket system your organisation uses and the change record attached to it.',

    steps: [
      {
        title: 'See what the ticket is asking for',
        line: 'samba-tool user list',
        look: 'jhale',
        why:
          'SEC-001 wants a name reported, not just an account fixed. The Terminal window lists the fields the ' +
          'ticket expects, under "This ticket is asking for".'
      },
      {
        title: 'Find the answer',
        line: 'samba-tool user show jhale',
        look: 'left the company',
        why:
          'Report what you can evidence. The title records that this person has gone, which is why this ' +
          'account and not one of the others.'
      },
      {
        title: 'Record it',
        line: 'submit login=jhale',
        look: 'recorded login = jhale',
        why:
          'One field per name=value pair. It is recorded against the ticket, not applied to the network — ' +
          'reporting a finding and fixing it are separate acts, and most tickets want both.'
      }
    ],

    reading: [
      { part: 'field=value', means: 'one finding. Several can be given at once, separated by spaces' },
      { part: 'recorded ...', means: 'the answer is attached to the open ticket' },
      { part: 'the asking-for list', means: 'which fields the ticket wants, shown under the terminal' }
    ],

    mistakes: [
      {
        line: 'submit jhale',
        look: 'field=value',
        why:
          'A bare value does not say which question it answers. Tickets asking for more than one thing would ' +
          'have no way to tell the answers apart.'
      }
    ],

    seeAlso: ['samba-tool', 'man']
  }
];
