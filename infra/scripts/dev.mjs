// `pnpm dev`: runs `turbo run dev` as the root of the dev process tree (ADR-0039).
// Windows does not kill child processes when their parent dies, so a closed terminal or a killed
// `pnpm dev` used to leave turbo, SWC watchers, Next.js and the API/worker running. This root:
//   - exports LGA_DEV_ROOT_PID to every descendant (launchers and children exit when it is gone);
//   - exits, killing turbo's whole tree, when its own parent disappears;
//   - forwards Ctrl+C so turbo can stop the tasks gracefully.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const require = createRequire(path.join(root, 'package.json'));
const turboBin = path.join(path.dirname(require.resolve('turbo/package.json')), 'bin', 'turbo');

const turbo = spawn(process.execPath, [turboBin, 'run', 'dev', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, LGA_DEV_ROOT_PID: String(process.pid) },
});

function killTree() {
  if (turbo.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(turbo.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    turbo.kill('SIGTERM');
  }
}

/**
 * Every ancestor, not just the parent: on Windows a wrapper (shell, pnpm shim, terminal) can be
 * killed while the processes between it and us survive. Looked up once at start.
 */
function exists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM'; // alive, owned by someone else
  }
}

function ancestors() {
  if (process.platform !== 'win32') return [process.ppid];
  try {
    const rows = JSON.parse(
      execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress',
        ],
        { encoding: 'utf8' },
      ),
    );
    const parentOf = new Map(rows.map((r) => [r.ProcessId, r.ParentProcessId]));
    const chain = [];
    let pid = parentOf.get(process.pid);
    for (; pid && parentOf.has(pid) && !chain.includes(pid); pid = parentOf.get(pid)) {
      chain.push(pid);
    }
    // The topmost parent may be invisible to CIM (e.g. a Git Bash / MSYS shell). Watch it too,
    // but only if it answers now, so a stale id can never stop dev right after start.
    if (pid && !chain.includes(pid) && exists(pid)) chain.push(pid);
    return chain.length ? chain : [process.ppid];
  } catch {
    return [process.ppid];
  }
}

const watched = ancestors();
setInterval(() => {
  for (const pid of watched) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error?.code !== 'ESRCH') continue; // EPERM: alive, owned by someone else
      killTree();
      process.exit(0);
    }
  }
}, 2_000).unref();

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    turbo.kill(signal);
    // If turbo does not stop in time, take the whole tree down.
    setTimeout(() => {
      killTree();
      process.exit(0);
    }, 10_000).unref();
  });
}
turbo.on('exit', (code) => process.exit(code ?? 0));
