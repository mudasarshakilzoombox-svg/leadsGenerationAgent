// Stop leftover dev processes of THIS repo (ADR-0039): node processes whose command line
// contains the repo path, plus node processes listening on the dev ports. Never kills by name
// alone, never touches other projects, and skips itself and its parents.
//   pnpm dev:stop            # stop them
//   pnpm dev:stop --dry-run  # only list them
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { 'dry-run': { type: 'boolean', default: false } } });
const root = path.resolve(import.meta.dirname, '../..');
const DEV_PORTS = [3300, 4000, 4100];
const windows = process.platform === 'win32';

/** @returns {{ pid: number, ppid: number, cmd: string }[]} */
function nodeProcesses() {
  if (windows) {
    const out = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        'Get-CimInstance Win32_Process -Filter "Name=\'node.exe\'" | ' +
          'Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress',
      ],
      { encoding: 'utf8' },
    ).trim();
    if (!out) return [];
    const rows = [JSON.parse(out)].flat();
    return rows.map((r) => ({
      pid: r.ProcessId,
      ppid: r.ParentProcessId,
      cmd: r.CommandLine ?? '',
    }));
  }
  const out = execFileSync('ps', ['-eo', 'pid=,ppid=,args='], { encoding: 'utf8' });
  return out
    .split('\n')
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
    .filter((m) => m && /(^|\/)node(\s|$)/.test(m[3].split(' ')[0]))
    .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), cmd: m[3] }));
}

function listeningPids() {
  try {
    if (windows) {
      const out = execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          `Get-NetTCPConnection -State Listen -LocalPort ${DEV_PORTS.join(',')} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess`,
        ],
        { encoding: 'utf8' },
      );
      return new Set(out.split(/\s+/).filter(Boolean).map(Number));
    }
    const out = execFileSync(
      'lsof',
      ['-t', ...DEV_PORTS.flatMap((p) => ['-i', `TCP:${p}`, '-s', 'TCP:LISTEN'])],
      {
        encoding: 'utf8',
      },
    );
    return new Set(out.split(/\s+/).filter(Boolean).map(Number));
  } catch {
    return new Set();
  }
}

const all = nodeProcesses();
const byPid = new Map(all.map((p) => [p.pid, p]));
// Never stop ourselves or the pnpm/node chain that launched us.
const protectedPids = new Set([process.pid]);
for (let p = byPid.get(process.pid); p && !protectedPids.has(p.ppid); p = byPid.get(p.ppid)) {
  protectedPids.add(p.ppid);
}
protectedPids.add(process.ppid);

const norm = (s) => s.replaceAll('\\', '/').toLowerCase();
const rootKey = norm(root);
const ports = listeningPids();
const targets = all.filter(
  (p) => !protectedPids.has(p.pid) && (norm(p.cmd).includes(rootKey) || ports.has(p.pid)),
);

if (targets.length === 0) {
  console.log('dev:stop: no dev processes of this repo are running.');
  process.exit(0);
}
for (const t of targets) {
  const short = t.cmd.length > 140 ? `${t.cmd.slice(0, 137)}...` : t.cmd;
  console.log(`${values['dry-run'] ? 'would stop' : 'stopping'} ${t.pid}  ${short}`);
  if (values['dry-run']) continue;
  if (windows) spawnSync('taskkill', ['/PID', String(t.pid), '/T', '/F'], { stdio: 'ignore' });
  else {
    try {
      process.kill(t.pid, 'SIGTERM');
    } catch {
      // already gone
    }
  }
}
if (!values['dry-run']) console.log(`dev:stop: stopped ${targets.length} process(es).`);
