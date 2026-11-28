#!/usr/bin/env bash
# One-time (and re-runnable) hardening and setup of the production VPS: Hostinger KVM 2,
# Ubuntu 24.04 LTS (ARCHITECTURE §17, SECURITY §11.1, ADR-0012, ADR-0040).
#
#   sudo bash bootstrap-server.sh --deploy-key "ssh-ed25519 AAAA... you@laptop" [--ssh-allow 203.0.113.7/32]
#   sudo bash bootstrap-server.sh --dry-run --deploy-key "..."   # print every action, change nothing
#
# What it does (idempotent: safe to run again after an upgrade or on a fresh replacement server):
#   - non-root `deploy` user (docker group, no sudo) with your SSH key; root and password logins off
#   - ufw: deny inbound except 22 (optionally only from --ssh-allow), 80, 443; fail2ban on sshd
#   - unattended security upgrades with a 04:30 UTC reboot window; chrony time sync
#   - 4 GB swap, vm.swappiness=10; Docker Engine + Compose plugin from Docker's apt repository
#   - Docker daemon: `local` log driver with rotation; /opt/lga/{env,state,compose} owned by deploy
# Docker publishes container ports around ufw, so only nginx publishes ports (compose files).
set -euo pipefail

DEPLOY_USER=deploy
DEPLOY_KEY=""
SSH_ALLOW=""
DRY_RUN=0
SWAP_SIZE=4G

while [ $# -gt 0 ]; do
  case "$1" in
    --deploy-key) DEPLOY_KEY="$2"; shift 2 ;;
    --ssh-allow) SSH_ALLOW="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

[[ "$DEPLOY_KEY" =~ ^(ssh-ed25519|ecdsa-sha2-nistp256|ssh-rsa)\ [A-Za-z0-9+/=]+ ]] ||
  { echo "Pass your public key: --deploy-key \"ssh-ed25519 AAAA... comment\"" >&2; exit 2; }
if [ -n "$SSH_ALLOW" ] && ! [[ "$SSH_ALLOW" =~ ^[0-9a-fA-F:.]+(/[0-9]{1,3})?$ ]]; then
  echo "--ssh-allow must be an IP or CIDR" >&2
  exit 2
fi
if [ "$DRY_RUN" = 0 ] && [ "$(id -u)" != 0 ]; then
  echo "Run as root (sudo), or use --dry-run." >&2
  exit 2
fi

step() { printf '\n==> %s\n' "$*"; }
run() {
  # Each action is one shell string (pipes, redirects, ||), evaluated as written.
  if [ "$DRY_RUN" = 1 ]; then printf '  + %s\n' "$*"; else eval "$*"; fi
}
write_file() {
  # write_file <path> <mode> <<'EOF' ... EOF
  local path="$1" mode="$2" content
  content="$(cat)"
  if [ "$DRY_RUN" = 1 ]; then
    printf '  + write %s (mode %s, %s lines)\n' "$path" "$mode" "$(printf '%s\n' "$content" | wc -l)"
    return
  fi
  install -d "$(dirname "$path")"
  printf '%s\n' "$content" >"$path"
  chmod "$mode" "$path"
}

if [ "$DRY_RUN" = 0 ]; then
  # shellcheck source=/dev/null
  . /etc/os-release
  [ "${ID:-}" = ubuntu ] && [ "${VERSION_ID:-}" = "24.04" ] ||
    echo "Warning: written for Ubuntu 24.04; this is ${PRETTY_NAME:-unknown}." >&2
fi

step "Base packages and security updates"
run "export DEBIAN_FRONTEND=noninteractive"
run "apt-get update -q"
run "apt-get -yq upgrade"
run "apt-get install -yq ca-certificates curl gnupg ufw fail2ban unattended-upgrades chrony jq"

step "Automatic security updates (reboot window 04:30 UTC)"
write_file /etc/apt/apt.conf.d/20auto-upgrades 0644 <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
write_file /etc/apt/apt.conf.d/52lga-unattended 0644 <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:30";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
EOF
run "systemctl enable --now unattended-upgrades chrony"

step "Deploy user '$DEPLOY_USER' (docker group, no sudo)"
run "id -u $DEPLOY_USER >/dev/null 2>&1 || adduser --disabled-password --gecos '' $DEPLOY_USER"
run "install -d -m 700 -o $DEPLOY_USER -g $DEPLOY_USER /home/$DEPLOY_USER/.ssh"
write_file "/home/$DEPLOY_USER/.ssh/authorized_keys" 0600 <<EOF
$DEPLOY_KEY
EOF
run "chown $DEPLOY_USER:$DEPLOY_USER /home/$DEPLOY_USER/.ssh/authorized_keys"

step "SSH: keys only, no root login"
write_file /etc/ssh/sshd_config.d/10-lga-hardening.conf 0644 <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AllowUsers deploy
MaxAuthTries 3
LoginGraceTime 30
X11Forwarding no
EOF
run "sshd -t"
run "systemctl reload ssh"

step "Firewall (ufw) and fail2ban"
run "ufw default deny incoming"
run "ufw default allow outgoing"
if [ -n "$SSH_ALLOW" ]; then
  run "ufw allow from $SSH_ALLOW to any port 22 proto tcp"
else
  run "ufw limit 22/tcp"
fi
run "ufw allow 80/tcp"
run "ufw allow 443/tcp"
run "ufw --force enable"
write_file /etc/fail2ban/jail.d/sshd.local 0644 <<'EOF'
[sshd]
enabled = true
maxretry = 5
findtime = 10m
bantime = 1h
EOF
run "systemctl enable --now fail2ban"
run "systemctl restart fail2ban"

step "Swap ($SWAP_SIZE) and memory settings"
run "[ -f /swapfile ] || { fallocate -l $SWAP_SIZE /swapfile && chmod 600 /swapfile && mkswap /swapfile; }"
run "swapon --show | grep -q /swapfile || swapon /swapfile"
run "grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab"
write_file /etc/sysctl.d/90-lga.conf 0644 <<'EOF'
vm.swappiness = 10
vm.overcommit_memory = 1
EOF
run "sysctl --system >/dev/null"

step "Docker Engine and Compose plugin (Docker's apt repository)"
run "install -m 0755 -d /etc/apt/keyrings"
run "[ -f /etc/apt/keyrings/docker.asc ] || curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc"
run "chmod a+r /etc/apt/keyrings/docker.asc"
write_file /etc/apt/sources.list.d/docker.list 0644 <<'EOF'
deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable
EOF
run "apt-get update -q"
run "apt-get install -yq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin"
write_file /etc/docker/daemon.json 0644 <<'EOF'
{
  "log-driver": "local",
  "log-opts": { "max-size": "10m", "max-file": "3" },
  "live-restore": true,
  "no-new-privileges": true
}
EOF
run "systemctl enable docker"
run "systemctl restart docker"
run "usermod -aG docker $DEPLOY_USER"

step "Application directories"
run "install -d -m 755 -o $DEPLOY_USER -g $DEPLOY_USER /opt/lga /opt/lga/compose /opt/lga/state"
run "install -d -m 700 -o $DEPLOY_USER -g $DEPLOY_USER /opt/lga/env"

step "Done"
cat <<EOF
Next (docs/OPS_SETUP.md):
  1. From your laptop: ssh $DEPLOY_USER@<server>   (root login is now disabled)
  2. Create /opt/lga/env/production.env and staging.env (mode 600), then log Docker in to GHCR.
  3. Issue the first TLS certificate, then push a v* tag to deploy.
EOF
