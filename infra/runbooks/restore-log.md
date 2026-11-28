# Restore log

Every restore drill appends a row here (13-backup-recovery §4). `infra/backup/restore-drill.sh`
writes it automatically. Launch targets: RTO 8 h, restore test < 60 min, RPO 24 h.

| When (UTC) | Backup | Source | Restore | Total | Result |
|------------|--------|--------|---------|-------|--------|
| 2026-11-28T00:53Z | 2026/11/28/lga-20261128T005142Z.dump.age | local | 11s | 30s | PASS |
