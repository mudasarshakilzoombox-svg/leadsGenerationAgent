// Preloaded (`node --import`) into dev child processes, and imported by the dev launchers: exit
// when the launcher that started us, or the `pnpm dev` root, is gone. On Windows, killing a parent
// does not kill its children, so without this a stopped `pnpm dev` leaves node processes holding
// ports and memory (ADR-0039).
export function watchPids(pids, onGone = () => process.exit(0)) {
  const watched = pids.filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
  if (watched.length === 0) return;
  setInterval(() => {
    for (const pid of watched) {
      try {
        process.kill(pid, 0); // signal 0: existence check only
      } catch (error) {
        // EPERM means it exists but belongs to another user (e.g. PID 1 in a container).
        if (error?.code === 'ESRCH') {
          onGone();
          return;
        }
      }
    }
  }, 2_000).unref();
}

watchPids([Number(process.env.LGA_PARENT_PID), Number(process.env.LGA_DEV_ROOT_PID)]);
