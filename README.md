# NIGHT SHIFT

An offline study game for networking, IT, data and security. You are the lone
technician on the overnight desk at Meridian Logistics; tickets arrive, you work
them, and the company you are fixing is the same company every mission is about.

Built here. Played somewhere else — a locked-down machine with no installs, no
admin rights and no downloads. That constraint decides nearly everything below.

---

## What you port over

**One file: `dist/NightShift.html`.** Nothing else. It has no external
references of any kind — no fonts, no images, no scripts, no stylesheets — and
the build fails if any appear.

Two routes onto the target machine, both tested:

| Route | Works | Notes |
|---|---|---|
| USB stick, double-click | yes | |
| OneDrive **sync folder**, double-click | yes | The file is on local disk, so `file://` applies normally |
| OneDrive **web UI**, click the file | **no** | SharePoint sends HTML as a download and never renders it. Tenants cannot change this |
| OneDrive web → Download → open from Downloads | yes | One extra click. Right-click → Properties → **Unblock** if Windows nags |

`preflight.html` is a separate, optional deliverable: a capability probe you can
run on the target machine first to confirm the browser and its policies will let
the game work. It is plain ES5 so it still reports usefully on a browser too old
to run the game itself.

---

## Running it

```bash
npm test          # the whole suite
npm run build     # bundle → inline → budget check, writes dist/NightShift.html
npm run check     # both
```

On Windows, if PowerShell refuses to run `npm`, use `npm.cmd` — or allow scripts
for your own user, which needs no admin rights:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Open the built file by double-clicking it. Append `#selftest` to the URL to run
the in-browser assertion suite instead of the game — that is the smoke test you
can run on the locked-down machine itself, where there are no devtools.

---

## How it is put together

```
src/
  core/        pure, node-tested, no browser globals and no clock
    world/     seed · events · reduce · select   ← the keystone
    missions/  schema · progression · runtime
    srs/       the Leitner scheduler
    game/      progress, rank, the shift clock — all derived from closed tickets
    desktop/   the window manager: stacking, clamping, tiling
    save/      serialize · payload · storage
    net/       CIDR maths
  content/     the company, the missions, the cards, the concepts
    tutorials/ a worked walkthrough per command — executable, see below
  engines/     one per minigame; the registry says which exist in this build
  ui/          DOM only, no logic
    apps/      mail · terminal · training · manual · system
build/         bundle · inline · budget
tests/         node --test, zero dependencies
```

Four rules hold the design together:

1. **Event sourced.** `world = reduceWorld(seed, events)`. Missions work in a
   scratch layer that is committed on success and thrown away on abandon, so
   mission 23 can still assume DNS is intact whatever happened in mission 12.
2. **Share IDs, not structure.** The four domains — net, identity, data, logs —
   are coupled only by `hostId`, `userId`, `ip`, `ts`.
3. **`core/world/select.js` is the only coupling seam.** Every lens reads through
   it, which is what stops the terminal and the topology view disagreeing.
4. **Determinism is structural.** No `Math.random` and no `Date.now` anywhere in
   `core/`. Time is `world.tick`; randomness is a seeded PRNG we own. Enforced by
   `tests/core/purity.test.js`.

### The infrastructure is a contract

`src/content/world/contract.js` is the single source of truth for every address,
id, VLAN, login and DNS name. Everything else derives from it, and
`tests/content/contract.test.js` holds a fingerprint of the hard parameters: change
one and the build tells you to bump `INFRASTRUCTURE_VERSION` and re-run the
mission suite. Missions reference the world by symbol only — a test scans them for
hard-coded addresses and ids.

### Every mission ships a reference solution

A mission with no executable solution does not ship. The schema requires it so
that `tests/content/missions.test.js` can play every mission head-to-tail against
the real seed world and assert both halves:

```
win(before) === false    catches a mission already solved on arrival
win(after)  === true     catches one that cannot be solved at all
```

That is what stops the catalogue rotting when the world moves underneath it. It
caught a real bug on its first run.

### Every command says how real it is

The failure mode that sinks teaching games is taking a real tool's name and giving
it a function that tool does not have. Somebody memorises it, tries it on a real
machine, and has to unlearn it — which is worse than never having played, because
confident wrong knowledge is harder to shift than none.

So every command declares one of three levels, and the terminal shows it:

| Level | Meaning | Examples |
|---|---|---|
| **real** | Name, syntax and output match closely enough to transfer. No caveats. | `ifconfig` · `route` · `arp` · `nslookup` · `exit` |
| **simplified** | Real tool, real purpose, smaller surface. Says in `man` exactly what it left out. | `ping` · `ip` · `nmap` · `dig` · `nsupdate` · `samba-tool` · `ssh` |
| **site tool** | Not a real command. May not use a real tool's name, and says outright what the real thing is. | `console` · `submit` · `tutorial` |

`tests/core/shell/authenticity.test.js` enforces it: nothing marked *site tool*
may wear a real tool's name, anything not exactly real must carry a note, and no
command may pretend two tools are one.

That last rule matters more than it sounds. `ifconfig`/`ipconfig`,
`traceroute`/`tracert`, `clear`/`cls` and `nslookup`/`dig` are pairs that get
treated as synonyms constantly, and are not. They are kept apart here. Typing the
Windows one fails exactly as it would on a real Linux box — and then tells you the
equivalent, which is a lesson you get for free at the moment you need it:

```
operator@pc-it01:~$ ipconfig
ipconfig: command not found
ipconfig is the Windows command. This is a Linux machine.
Here, use: ip addr
```

Where a real tool exists for the job, it is used even when an invented one would
be easier. Directory work goes through `samba-tool user list|show|enable|disable`
— the genuine subcommands, printing genuine LDIF with the real
`userAccountControl` values — rather than a made-up `ldap` command, which is what
this had first and which was wrong.

### Every command ships a walkthrough, and the build runs it

`man` says what a command does. That is not the same as knowing how to use it, so
every command also has a **tutorial**: what the tool is actually for, when you
reach for it on a shift, the concepts it belongs to, then numbered steps — a line
to type, the text to look for in the answer, and what that answer rules out.
Plus how to read each field of the output, and the mistakes that are easy to make.

Two places, same content. In the terminal:

```
operator@pc-it01:~$ tutorial ping
PING — a walkthrough
...
Step 3 — Check the gateway before blaming anything further away
  $ ping -c 1 10.20.20.1
  Watch for: 0% packet loss
  The gateway is the last thing you own before the packet leaves your
  network. If this fails, nothing beyond it is worth testing yet.
```

And in the Manual window under **Commands**, where the output is annotated field
by field and `see also` links jump between related tools.

**The steps are executable, and that is the whole design.** Documentation is the
one part of a project that can be wrong for a year without anyone noticing, and a
walkthrough that tells you to type something that no longer works is worse than
none — the player assumes the mistake is theirs.

So `tests/content/tutorials.test.js` types every step into a real session against
the real world, in order, and the promised text has to come back. Sequences run in
one session, so `ssh` → a command → `exit` is proved to work as a sequence. The
documented **mistakes are executable too**: a tutorial claiming "this will fail"
has to be right about how it fails, because the error text is what the player will
actually see. A command cannot ship without a tutorial, and a tutorial cannot name
a concept outside the vocabulary the missions use.

It works. Writing these surfaced eight wrong claims in my own first draft and two
real authenticity bugs in the toolkit — `ip` with no object quietly printed
addresses instead of usage, and `route add` printed the routing table as though
the add had succeeded. Both now behave as the real tools do.

### Engines gate the queue

`src/engines/registry.js` knows which minigames this build actually has. A
mission written ahead of its engine stays in the catalogue — validated,
reference-solved, counted — and is shown to the player as *not yet workable*
rather than opening onto an empty screen.

### The desktop

The game is a small windowed desktop, not a stack of screens: Mail, Terminal,
Training, Manual and System, each in a window you can move, resize, minimise and
close, over a taskbar. It opens on Mail and the Terminal side by side, because
that is how the work actually goes — you read the complaint and you work the box
at the same time.

Which window a mission appears in is **declared by its engine**, never decided by
the UI:

| Surface | What lands there | Engines |
|---|---|---|
| **mail** | Work somebody raised. Brief, hints and check-in in Mail; the typing next door in the Terminal. | `terminal` |
| **training** | Practice the player chose. Everything inline, plus the review deck. | `quiz` · `sort` · `subnet` |

That split is the point. A subnetting exercise is not a message from a person, and
having one arrive in an inbox made every ticket read like a quiz question wearing
a costume. `tests/content/surfaces.test.js` enforces it: every engine must declare
a surface, every surface must name an app that exists, only terminal work may
arrive as mail, and every inbox message must name who raised it.

The window manager is in `core/`, pure and node-tested, for one reason: **a window
dragged past the edge cannot be dragged back**, and there are no devtools on the
target machine to move it. So `clamp` runs on every move, every resize and every
viewport change, and forty-odd tests hold it to keeping a grabbable strip of title
bar on screen under every geometry — including `NaN`, a viewport smaller than the
minimum window, and two hundred consecutive nudges at the edge. Below 900px wide
there is nowhere to drag anything, so the model says so and the focused window
fills the area instead.

Dragging writes straight to the node's style and commits once on release. Going
through the store would rebuild the terminal's scrollback on every pointermove.

**The Terminal is never empty.** With no ticket open it runs a practice shell over
the live company — same commands, same output, changes discarded. It is an
ordinary mission object (`content/practice.js`) with `win: () => false`, kept out
of the catalogue, so there is still exactly one code path that can run a command.

### Saves

The save is the closed tickets plus the event log. Rank, XP and known concepts
are **derived**, never stored, because a save that can contradict itself is
unfixable once it is on somebody's USB stick.

Storage is deliberately redundant: memory, sessionStorage and localStorage, each
keeping the previous copy alongside the current one, with reads taking the newest
valid copy from anywhere. None of it is trusted — the target machine may wipe site
data when the browser closes, and `localStorage` is keyed to the exact file URL, so
a different drive letter looks like an empty save. The exported file is the only
durable copy, and export degrades from download → clipboard → text on screen.

---

## Status

Phase 1 complete, Phase 2 under way. The windowed desktop is in. Twelve playable
missions across two ranks — four terminal tickets in Mail, eight drills in
Training — 53 review cards, 20 command walkthroughs, 930 tests.

The terminal tickets are solved by typing real commands, and their reference
solutions type them too — so the build proves each one is solvable with the tools
that exist, in the syntax those tools take. A mission that emits an event directly
instead of running a command fails the suite.

| | |
|---|---|
| `dist/NightShift.html` | 250 KB of a 2 MB budget |
| Apps | Mail · Terminal · Training · Manual · System |
| Engines built | quiz · sort · subnet · **terminal** |
| Engines pending | topology · sql · loghunt · phish · crypto · scenario · regex |
| In-browser self test | 28 checks, including the desktop and a live terminal |
| Command walkthroughs | 20, every step run by the build |

Known gaps, in the order they matter:

- **The inbox is thin.** Two terminal tickets at rank 1, one or two visible at a
  time. The pacing holds — Training unlocks Mail, and the queue never dead-ends
  while work remains — but Mail is the centrepiece of the layout and wants more
  in it. More terminal tickets is the next content job.
- **Window layout is not saved.** Every launch opens on the default arrangement.
  Deliberate for now: a layout saved from a 1920px monitor reopening on a 1366px
  laptop is a class of bug worth not having yet.
- **Nothing here has been run on the target machine since it became a game.** The
  last confirmed run there was the 38.9 KB self-test-only build. Run
  `NightShift.html#selftest` there before trusting any of the above.
- CSS and layout cannot be verified headlessly. Everything tested runs against a
  stub DOM, which proves structure and behaviour, not that it looks right.

### Two bugs worth naming

Both shipped, both made the game untouchable, and the whole suite missed both —
for the same underlying reason: a stub DOM has none of a browser's rules about
what a click *is*.

1. **Raising a window redrew the desktop.** `focusApp` ran on `pointerdown` and
   went through the store, so the element under the pointer was replaced before
   the mouse came back up. A browser only delivers `click` when the press and
   the release land on the same element, so no click ever completed. Raising is
   now painted straight onto the live nodes and never redraws.
2. **The title bar swallowed its own buttons.** Close and minimise sit inside the
   bar, so their `pointerdown` bubbled into the drag handler, which called
   `preventDefault()` — which by spec suppresses the compatibility mouse events,
   `click` among them. A drag no longer starts from a control.

The harness was the real failure. It fired `click` straight at a target, so
neither the press/release pairing nor bubbling was ever modelled, and it had no
`document.querySelector` — which meant the drag code could not find its own
frame and **the entire drag path was silently skipped in every test**. All three
gaps are closed. Controls are now driven through `press()`, which bubbles a real
`pointerdown`, fails if anything default-prevents it, fails if the target is
detached, and only then clicks. A sweep presses every control on screen in five
different states.
