# syntax=docker/dockerfile:1.7
# Nightly backup job (13-backup-recovery §3.1): PostgreSQL client tools of the same major version
# as the server, age for streaming encryption, rclone for Backblaze B2, supercronic for cron
# without root. Also used by infra/backup/restore-drill.sh on the operator machine.
FROM postgres:18-alpine
RUN apk add --no-cache age rclone supercronic ca-certificates tzdata \
  && mkdir -p /etc/backup
COPY --chmod=0555 infra/backup/backup.sh /usr/local/bin/backup.sh
COPY --chmod=0444 infra/backup/crontab /etc/backup/crontab
ENV TZ=UTC
# The postgres image's unprivileged user; nothing here needs root.
USER postgres
WORKDIR /tmp
ENTRYPOINT []
CMD ["supercronic", "-passthrough-logs", "/etc/backup/crontab"]
