/**
 * The honesty rules for the toolkit.
 *
 * A player who learns `nmap -sV` here and types it on a real machine must get
 * roughly what they expected. The failure mode this exists to prevent is the one
 * that sinks teaching games: taking a real tool's name and giving it a function
 * it does not have. Somebody memorises it, tries it on a real box, and has to
 * unlearn it — which is worse than never having played.
 *
 * So every command declares exactly one of three levels, and the terminal shows
 * it:
 *
 *   real        name, syntax and output match closely enough to transfer.
 *   simplified  real tool, real purpose, smaller surface. Says what it left out.
 *   local       not a real tool. Must not squat on a real tool's name, and says
 *               outright that it exists only here, plus what the real thing is.
 *
 * `local` is the escape hatch for the things a simulated company genuinely needs
 * — a ticket system, a console server wrapper — and the price of using it is
 * saying so, every time, in the manual.
 *
 * tests/core/shell/authenticity.test.js enforces all of this.
 */

export const REAL = 'real';
export const SIMPLIFIED = 'simplified';
export const LOCAL = 'local';

export const LEVELS = [REAL, SIMPLIFIED, LOCAL];

/**
 * Names that belong to real tools.
 *
 * Nothing marked `local` may use one. The list is deliberately broad — it covers
 * tools this game does not have and may never have — because its job is to stop
 * a future command being named `lynx` or `hydra` and given an invented purpose.
 */
export const REAL_TOOL_NAMES = new Set([
  // shell and files
  'ls', 'cat', 'cd', 'pwd', 'cp', 'mv', 'rm', 'mkdir', 'touch', 'find', 'grep', 'egrep', 'awk',
  'sed', 'sort', 'uniq', 'wc', 'head', 'tail', 'less', 'more', 'chmod', 'chown', 'ln', 'tar',
  'gzip', 'diff', 'file', 'strings', 'base64', 'xxd', 'tee', 'which', 'whereis', 'echo', 'nano',
  'vi', 'vim', 'man', 'history', 'clear', 'exit', 'logout', 'help', 'alias', 'export', 'env',
  // processes and services
  'ps', 'top', 'htop', 'kill', 'killall', 'systemctl', 'journalctl', 'service', 'crontab', 'df', 'du',
  // networking
  'ping', 'ping6', 'ifconfig', 'ip', 'iwconfig', 'route', 'arp', 'netstat', 'ss', 'traceroute',
  'tracepath', 'mtr', 'nmap', 'tcpdump', 'telnet', 'nc', 'ncat', 'socat', 'curl', 'wget', 'lynx',
  'ethtool', 'nmcli', 'dhclient', 'iptables', 'nft', 'ufw', 'ssh', 'scp', 'sftp', 'rsync',
  'ssh-keygen', 'ssh-copy-id',
  // names
  'dig', 'nslookup', 'host', 'whois', 'nsupdate', 'resolvectl', 'systemd-resolve', 'getent',
  // directory and identity
  'ldapsearch', 'ldapmodify', 'ldapadd', 'ldapdelete', 'samba-tool', 'kinit', 'klist', 'realm',
  'useradd', 'usermod', 'userdel', 'passwd', 'id', 'groups', 'who', 'w', 'last', 'sudo', 'su',
  // security tooling
  'hydra', 'john', 'hashcat', 'sqlmap', 'msfconsole', 'msfvenom', 'metasploit', 'aircrack-ng',
  'openssl', 'gpg', 'sha256sum', 'md5sum', 'nikto', 'wireshark', 'tshark', 'setoolkit',
  // windows
  'ipconfig', 'tracert', 'cls', 'dir', 'type', 'netsh', 'net', 'nbtstat', 'pathping', 'tasklist',
  'taskkill', 'findstr', 'dsquery', 'dsmod', 'powershell', 'pwsh', 'reg', 'wmic', 'robocopy',
  'xcopy', 'del', 'copy', 'move', 'gpupdate', 'gpresult'
]);

/**
 * Windows names that do not exist on a Linux box, and what to reach for instead.
 *
 * Typing `ipconfig` here fails exactly as it would on a real Linux machine — and
 * then says what the Linux equivalent is. That is a lesson the player gets for
 * free at the precise moment they need it, and it is only possible because the
 * two are NOT wired together as aliases.
 */
export const CROSS_OS_HINTS = {
  ipconfig: { instead: 'ip addr', note: 'ipconfig is the Windows command. This is a Linux machine.' },
  tracert: { instead: 'traceroute', note: 'tracert is the Windows spelling.' },
  cls: { instead: 'clear', note: 'cls is the Windows/DOS command.' },
  dir: { instead: 'ls', note: 'dir is the Windows/DOS command.' },
  type: { instead: 'cat', note: 'type is the Windows/DOS command for printing a file.' },
  findstr: { instead: 'grep', note: 'findstr is the Windows equivalent.' },
  tasklist: { instead: 'ps aux', note: 'tasklist is the Windows command.' },
  taskkill: { instead: 'kill', note: 'taskkill is the Windows command.' },
  netsh: { instead: 'ip', note: 'netsh is the Windows network configuration shell.' },
  where: { instead: 'which', note: 'where is the Windows command.' },
  del: { instead: 'rm', note: 'del is the Windows/DOS command.' },
  copy: { instead: 'cp', note: 'copy is the Windows/DOS command.' },
  pathping: { instead: 'mtr', note: 'pathping is the Windows command. The closest Linux tool is mtr.' }
};

/** The banner `man` prints above a command that is not the real thing. */
export function authenticityBanner(command) {
  if (command.authenticity === SIMPLIFIED) {
    return [
      'SIMPLIFIED — real tool, real purpose, smaller surface.',
      ...wrap(command.realWorld)
    ];
  }
  if (command.authenticity === LOCAL) {
    return [
      'SITE TOOL — this is not a real command. It exists only at Meridian.',
      ...wrap(command.realWorld)
    ];
  }
  return [];
}

/** The short marker shown beside a command in `help`. */
export function authenticityTag(command) {
  if (command.authenticity === SIMPLIFIED) return '(simplified)';
  if (command.authenticity === LOCAL) return '(site tool)';
  return '';
}

export const LEGEND = [
  'Commands are marked so you always know what will transfer:',
  '',
  '  (nothing)     a real tool, behaving as it really does',
  '  (simplified)  a real tool with a smaller set of options than the real one',
  '  (site tool)   not a real command — it exists only inside Meridian',
  '',
  '"man <command>" says exactly what any of them left out.'
];

function wrap(text, width = 74) {
  if (!text) return [];
  const words = String(text).split(/\s+/);
  const lines = [];
  let current = '  ';

  for (const word of words) {
    if (current.length + word.length + 1 > width && current.trim() !== '') {
      lines.push(current);
      current = '  ';
    }
    current += (current === '  ' ? '' : ' ') + word;
  }
  if (current.trim() !== '') lines.push(current);
  return lines;
}
