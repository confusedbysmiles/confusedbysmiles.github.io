#!/bin/bash
# setup_dvwa.sh
# Configures a fresh Ubuntu 22.04 EC2 instance as a DVWA web server for the
# SCS275 cybersecurity lab.
#
# Run as root on a clean Ubuntu 22.04 instance:
#   sudo bash setup_dvwa.sh
#
# What this script does:
#   1. Updates apt and installs Docker Engine
#   2. Installs Docker Compose (v2 plugin + standalone wrapper)
#   3. Writes a docker-compose.yml for DVWA + MariaDB
#   4. Creates a systemd service so DVWA auto-starts on reboot
#   5. Prints access URL and default credentials

set -e

echo "=== SCS275 Lab: DVWA Server Setup ==="
echo "Host: $(hostname)  |  Date: $(date)"
echo ""

# ─────────────────────────────────────────────────────────────────
# BLOCK 1 — Refresh package index
# Always do this first so we install the latest package metadata.
# ─────────────────────────────────────────────────────────────────
echo "[1/6] Refreshing package index..."
apt-get update -y

# ─────────────────────────────────────────────────────────────────
# BLOCK 2 — Install Docker Engine from Docker's official apt repo
#
# We do NOT use Ubuntu's built-in docker.io package because it lags
# several major versions behind upstream. Instead we:
#   a) Install prerequisite packages needed to add an HTTPS apt source
#   b) Import Docker's GPG signing key into /etc/apt/keyrings/
#   c) Add the official Docker stable apt repository
#   d) Install docker-ce and its companion packages
# ─────────────────────────────────────────────────────────────────
echo "[2/6] Installing Docker Engine..."

apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# Create the keyrings directory if it doesn't already exist
install -m 0755 -d /etc/apt/keyrings

# Import Docker's official GPG key so apt can verify package signatures
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

# Add the Docker stable repository for this Ubuntu codename (e.g. jammy)
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update -y

# docker-ce            = the Docker daemon
# docker-ce-cli        = the docker command-line tool
# containerd.io        = low-level container runtime
# docker-buildx-plugin = BuildKit plugin (needed by Compose)
# docker-compose-plugin= provides "docker compose" (v2, no hyphen)
apt-get install -y \
    docker-ce \
    docker-ce-cli \
    containerd.io \
    docker-buildx-plugin \
    docker-compose-plugin

# Enable Docker to start on every boot and start it now
systemctl enable docker
systemctl start docker
echo "    Docker Engine installed: $(docker --version)"

# ─────────────────────────────────────────────────────────────────
# BLOCK 3 — Install the standalone docker-compose v2 wrapper
#
# The docker-compose-plugin above gives us "docker compose" (space).
# Some older scripts and tools still call "docker-compose" (hyphen),
# so we install the standalone binary from GitHub releases as well.
# ─────────────────────────────────────────────────────────────────
echo "[3/6] Installing Docker Compose standalone wrapper..."

COMPOSE_VERSION=$(curl -fsSL \
    https://api.github.com/repos/docker/compose/releases/latest \
    | grep '"tag_name"' \
    | sed -E 's/.*"([^"]+)".*/\1/')

curl -fsSL \
    "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" \
    -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
echo "    docker-compose installed: $(docker-compose --version)"

# ─────────────────────────────────────────────────────────────────
# BLOCK 4 — Write the Docker Compose project for DVWA
#
# Project lives in /opt/dvwa/
#
# Services:
#   dvwa  — The Damn Vulnerable Web Application (PHP + Apache).
#            Image: ghcr.io/digininja/dvwa:latest (official upstream).
#            DVWA_SECURITY_LEVEL=low means students hit every vulnerability
#            without needing to change settings in the UI first.
#   db    — MariaDB 10.6. DVWA requires a MySQL-compatible backend.
#            A named volume (dvwa_db) persists the database across restarts.
#
# Port mapping: host:80 -> container:80
# Health-check on the database ensures DVWA only starts once MariaDB is ready.
# ─────────────────────────────────────────────────────────────────
echo "[4/6] Writing Docker Compose configuration..."
mkdir -p /opt/dvwa

cat > /opt/dvwa/docker-compose.yml << 'COMPOSE_EOF'
version: "3.9"

services:
  dvwa:
    image: ghcr.io/digininja/dvwa:latest
    restart: unless-stopped
    ports:
      # Expose DVWA on the host's port 80 so students reach it via plain HTTP
      - "80:80"
    environment:
      # Security level: low | medium | high | impossible
      # "low" disables all mitigations so students can exploit every vector
      - DVWA_SECURITY_LEVEL=low
      # Database connection settings — must match the 'db' service below
      - DB_SERVER=db
      - DB_DATABASE=dvwa
      - DB_USERNAME=dvwa
      - DB_PASSWORD=p@ssw0rd
      - DB_PORT=3306
    depends_on:
      db:
        condition: service_healthy   # wait until MariaDB passes its health-check

  db:
    image: mariadb:10.6
    restart: unless-stopped
    environment:
      - MYSQL_ROOT_PASSWORD=dvwa
      - MYSQL_DATABASE=dvwa
      - MYSQL_USER=dvwa
      - MYSQL_PASSWORD=p@ssw0rd
    volumes:
      # Named volume keeps the database data between container restarts
      - dvwa_db:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-udvwa", "-pp@ssw0rd"]
      interval: 10s
      timeout: 5s
      retries: 12

volumes:
  dvwa_db:
COMPOSE_EOF

echo "    Compose file written to /opt/dvwa/docker-compose.yml"

# ─────────────────────────────────────────────────────────────────
# BLOCK 5 — Create a systemd service for DVWA
#
# The service unit calls "docker-compose up -d" on start and
# "docker-compose down" on stop.  It depends on docker.service so
# the daemon is guaranteed to be running before we try to pull images.
# WantedBy=multi-user.target means it starts during normal boot.
# ─────────────────────────────────────────────────────────────────
echo "[5/6] Creating systemd service (dvwa.service)..."

cat > /etc/systemd/system/dvwa.service << 'UNIT_EOF'
[Unit]
Description=DVWA (Damn Vulnerable Web Application) – Docker Compose
Documentation=https://github.com/digininja/DVWA
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/dvwa
# Pull latest images and start containers in detached mode
ExecStart=/usr/local/bin/docker-compose up -d --remove-orphans
# Gracefully stop all containers when the service is stopped/rebooted
ExecStop=/usr/local/bin/docker-compose down
# Give containers up to 5 minutes to pull images on first start
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
UNIT_EOF

# Reload systemd so it picks up the new unit file, then enable + start
systemctl daemon-reload
systemctl enable dvwa.service
systemctl start dvwa.service

echo "    dvwa.service enabled and started"

# ─────────────────────────────────────────────────────────────────
# BLOCK 6 — Print success banner with access URL and credentials
#
# On EC2 we query the instance metadata endpoint for the public IP.
# If that fails (non-AWS environment) we fall back to the first
# private IP from `hostname -I`.
# ─────────────────────────────────────────────────────────────────
echo "[6/6] Setup complete — gathering access information..."

PUBLIC_IP=$(curl -sf --connect-timeout 3 \
    http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null \
    || hostname -I | awk '{print $1}')

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║           DVWA is now running!                       ║"
echo "╠══════════════════════════════════════════════════════╣"
printf  "║  URL      :  http://%-32s║\n" "${PUBLIC_IP}"
echo "║  Username :  admin                                   ║"
echo "║  Password :  password                                ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  IMPORTANT: On first visit click                     ║"
echo "║  'Setup / Reset Database' at the bottom of the page. ║"
echo "║  Security level is pre-set to: LOW                   ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "Useful commands:"
echo "  systemctl status dvwa"
echo "  docker-compose -f /opt/dvwa/docker-compose.yml logs -f"
