#!/bin/bash
# =============================================================================
# YedidiaGMC Backend — Server Setup Script
# Tested on Ubuntu 22.04 LTS / Debian 12
# Run as root or with sudo
# =============================================================================

set -euo pipefail

APP_NAME="yedidiagmc-backend"
APP_DIR="/opt/yedidiagmc"
APP_USER="yedidiagmc"
NODE_VERSION="18"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[SETUP]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 0. Check root
# ---------------------------------------------------------------------------
if [[ $EUID -ne 0 ]]; then
  err "This script must be run as root. Use: sudo bash setup.sh"
fi

log "Starting YedidiaGMC backend setup..."

# ---------------------------------------------------------------------------
# 1. Install Node.js 18 via NodeSource
# ---------------------------------------------------------------------------
log "Installing Node.js ${NODE_VERSION}..."

if ! command -v node &>/dev/null || [[ "$(node --version | cut -d. -f1 | tr -d 'v')" -lt "$NODE_VERSION" ]]; then
  apt-get update -qq
  apt-get install -y -qq curl gnupg ca-certificates
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
  apt-get install -y -qq nodejs
else
  log "Node.js $(node --version) already installed"
fi

# Verify
node --version || err "Node.js installation failed"
npm --version  || err "npm installation failed"

# ---------------------------------------------------------------------------
# 2. Create application user
# ---------------------------------------------------------------------------
log "Creating system user: ${APP_USER}..."
if ! id -u "$APP_USER" &>/dev/null; then
  useradd --system --shell /bin/false --home-dir "$APP_DIR" --create-home "$APP_USER"
else
  log "User ${APP_USER} already exists"
fi

# ---------------------------------------------------------------------------
# 3. Create application directory and copy files
# ---------------------------------------------------------------------------
log "Setting up application directory: ${APP_DIR}..."

mkdir -p "$APP_DIR"
mkdir -p "$APP_DIR/data"
mkdir -p "$APP_DIR/logs"

# Copy application files (assumes this script is run from the backend directory)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cp -r "$SCRIPT_DIR/src"    "$APP_DIR/"
cp -r "$SCRIPT_DIR/admin"  "$APP_DIR/"
cp    "$SCRIPT_DIR/package.json" "$APP_DIR/"

# Set up .env
if [[ ! -f "$APP_DIR/.env" ]]; then
  if [[ -f "$SCRIPT_DIR/.env" ]]; then
    cp "$SCRIPT_DIR/.env" "$APP_DIR/.env"
    log "Copied existing .env to ${APP_DIR}/.env"
  else
    cp "$SCRIPT_DIR/.env.example" "$APP_DIR/.env"
    warn ".env created from .env.example — EDIT ${APP_DIR}/.env BEFORE STARTING!"
    warn "Set: JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, ENCRYPTION_KEY"
  fi
else
  log ".env already exists, not overwriting"
fi

# ---------------------------------------------------------------------------
# 4. Install npm dependencies
# ---------------------------------------------------------------------------
log "Installing npm dependencies..."
cd "$APP_DIR"
npm install --omit=dev --prefer-offline 2>&1 | tail -5
cd - > /dev/null

# ---------------------------------------------------------------------------
# 5. Set permissions
# ---------------------------------------------------------------------------
log "Setting file permissions..."
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
chmod 750 "$APP_DIR"
chmod 600 "$APP_DIR/.env"
chmod 750 "$APP_DIR/data"
chmod 750 "$APP_DIR/logs"

# ---------------------------------------------------------------------------
# 6. Create systemd service
# ---------------------------------------------------------------------------
log "Creating systemd service: ${APP_NAME}..."

cat > "/etc/systemd/system/${APP_NAME}.service" <<EOF
[Unit]
Description=YedidiaGMC Backend (GM Digital Key Management)
Documentation=https://github.com/yedidiagmc/backend
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=$(which node) ${APP_DIR}/src/app.js
Restart=always
RestartSec=5
StandardOutput=append:${APP_DIR}/logs/app.log
StandardError=append:${APP_DIR}/logs/error.log

# Security hardening
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=${APP_DIR}/data ${APP_DIR}/logs

# Process limits
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$APP_NAME"

log "Systemd service created and enabled"

# ---------------------------------------------------------------------------
# 7. Set up log rotation
# ---------------------------------------------------------------------------
cat > "/etc/logrotate.d/${APP_NAME}" <<EOF
${APP_DIR}/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0640 ${APP_USER} ${APP_USER}
    sharedscripts
    postrotate
        systemctl kill -s USR1 ${APP_NAME} 2>/dev/null || true
    endscript
}
EOF

log "Log rotation configured"

# ---------------------------------------------------------------------------
# 8. Firewall — allow HTTP/HTTPS (optional, skip if ufw not present)
# ---------------------------------------------------------------------------
if command -v ufw &>/dev/null; then
  ufw allow 80/tcp  comment "HTTP"  2>/dev/null || true
  ufw allow 443/tcp comment "HTTPS" 2>/dev/null || true
  log "UFW rules added for HTTP/HTTPS"
fi

# ---------------------------------------------------------------------------
# Done — print next steps
# ---------------------------------------------------------------------------
echo ""
echo "================================================================"
echo "  YedidiaGMC Backend Setup Complete"
echo "================================================================"
echo ""
echo "NEXT STEPS:"
echo ""
echo "1. Edit the environment file:"
echo "   sudo nano ${APP_DIR}/.env"
echo ""
echo "   Required values to change:"
echo "   - JWT_SECRET     : 64-character random string"
echo "   - ADMIN_PASSWORD : Strong admin password"
echo "   - ENCRYPTION_KEY : 64-character hex string (32 bytes for AES-256)"
echo ""
echo "   Generate values:"
echo "   JWT_SECRET:      openssl rand -hex 32 | tr -d '\\n'"
echo "   ENCRYPTION_KEY:  openssl rand -hex 32 | tr -d '\\n'"
echo ""
echo "2. Start the service:"
echo "   sudo systemctl start ${APP_NAME}"
echo "   sudo systemctl status ${APP_NAME}"
echo ""
echo "3. View logs:"
echo "   sudo journalctl -u ${APP_NAME} -f"
echo "   tail -f ${APP_DIR}/logs/app.log"
echo ""
echo "4. (RECOMMENDED) Set up Nginx reverse proxy + SSL:"
echo ""
echo "   a) Install Nginx and Certbot:"
echo "      sudo apt-get install -y nginx certbot python3-certbot-nginx"
echo ""
echo "   b) Create Nginx site config:"
echo "      sudo nano /etc/nginx/sites-available/yedidiagmc"
echo ""
echo "      Paste the following (replace YOUR_DOMAIN):"
echo "      -----------------------------------------------"
cat <<'NGINX'
      server {
          listen 80;
          server_name YOUR_DOMAIN;

          location / {
              proxy_pass http://127.0.0.1:3000;
              proxy_http_version 1.1;
              proxy_set_header Upgrade $http_upgrade;
              proxy_set_header Connection 'upgrade';
              proxy_set_header Host $host;
              proxy_set_header X-Real-IP $remote_addr;
              proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
              proxy_set_header X-Forwarded-Proto $scheme;
              proxy_cache_bypass $http_upgrade;
              proxy_read_timeout 60s;
              client_max_body_size 1m;
          }
      }
NGINX
echo "      -----------------------------------------------"
echo ""
echo "   c) Enable the site and obtain SSL certificate:"
echo "      sudo ln -s /etc/nginx/sites-available/yedidiagmc /etc/nginx/sites-enabled/"
echo "      sudo nginx -t && sudo systemctl reload nginx"
echo "      sudo certbot --nginx -d YOUR_DOMAIN"
echo ""
echo "5. Access the admin panel:"
echo "   http://YOUR_DOMAIN/admin"
echo ""
echo "================================================================"
