#!/bin/bash
# =============================================================================
#  Yedidia Motors — Server Setup Script
#  Ubuntu 24.04 LTS
#  Usage: sudo bash setup-server.sh
# =============================================================================
set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; RESET='\033[0m'

ok()   { echo -e "${GREEN}  ✓ $1${RESET}"; }
info() { echo -e "${YELLOW}  → $1${RESET}"; }
err()  { echo -e "${RED}  ✗ $1${RESET}"; exit 1; }
step() { echo -e "\n${BOLD}${BLUE}━━━ $1 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"; }

# ── Banner ────────────────────────────────────────────────────────────────────
clear
echo -e "${BOLD}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║        YEDIDIA MOTORS — SERVER SETUP     ║"
echo "  ║           Ubuntu 24.04 LTS               ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${RESET}"

# ── 0. Preflight ──────────────────────────────────────────────────────────────
step "0/12  Preflight checks"

[[ $EUID -ne 0 ]] && err "הרץ את הסקריפט עם sudo: sudo bash setup-server.sh"

if ! grep -q "24.04" /etc/os-release 2>/dev/null; then
  echo -e "${YELLOW}  ⚠  לא זוהה Ubuntu 24.04. ממשיך בכל מקרה...${RESET}"
fi
ok "Preflight passed"

# ── Collect user input up-front ───────────────────────────────────────────────
step "Input  הגדרות ראשוניות"

echo -e "${BOLD}  תיקיית התקנה (ברירת מחדל: /opt/yedidia):${RESET}"
read -rp "  > " INSTALL_DIR
INSTALL_DIR="${INSTALL_DIR:-/opt/yedidia}"

echo -e "${BOLD}  פורט השרת (ברירת מחדל: 3000):${RESET}"
read -rp "  > " APP_PORT
APP_PORT="${APP_PORT:-3000}"

echo -e "${BOLD}  שם דומיין (השאר ריק אם אין עדיין):${RESET}"
read -rp "  > " DOMAIN
DOMAIN="${DOMAIN:-}"

echo -e "${BOLD}  אימייל Admin:${RESET}"
read -rp "  > " ADMIN_EMAIL
[[ -z "$ADMIN_EMAIL" ]] && err "אימייל Admin חובה"

echo -e "${BOLD}  סיסמת Admin:${RESET}"
read -rsp "  > " ADMIN_PASSWORD
echo
[[ ${#ADMIN_PASSWORD} -lt 8 ]] && err "הסיסמה חייבת להיות לפחות 8 תווים"

# Auto-generate secrets
JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 16)   # 32 chars hex = 16 bytes
BACKUP_DIR="$HOME/backups"

ok "הגדרות נשמרו"

# ── 1. System update ──────────────────────────────────────────────────────────
step "1/12  System update"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq
ok "המערכת עודכנה"

# ── 2. Base packages ──────────────────────────────────────────────────────────
step "2/12  Base packages"
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  curl git unzip ufw fail2ban nginx certbot python3-certbot-nginx
ok "חבילות בסיס הותקנו"

# ── 3. Node.js 20 LTS ─────────────────────────────────────────────────────────
step "3/12  Node.js 20 LTS"
if command -v node &>/dev/null && node --version | grep -q "^v20"; then
  ok "Node.js 20 כבר מותקן ($(node --version))"
else
  info "מתקין Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs
  ok "Node.js $(node --version) הותקן"
fi

# ── 4. PM2 ────────────────────────────────────────────────────────────────────
step "4/12  PM2 Process Manager"
if command -v pm2 &>/dev/null; then
  ok "PM2 כבר מותקן"
else
  npm install -g pm2 --quiet
  ok "PM2 הותקן"
fi

# ── 5. Project setup ──────────────────────────────────────────────────────────
step "5/12  Project setup"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "$INSTALL_DIR"

if [[ "$SCRIPT_DIR" != "$INSTALL_DIR" ]]; then
  info "מעתיק קבצים ל-$INSTALL_DIR ..."
  cp -r "$SCRIPT_DIR"/. "$INSTALL_DIR/"
fi

cd "$INSTALL_DIR"
info "מתקין npm dependencies..."
npm install --quiet --production
ok "פרויקט מוגדר ב-$INSTALL_DIR"

# ── 6. .env ───────────────────────────────────────────────────────────────────
step "6/12  Environment configuration"

ENV_FILE="$INSTALL_DIR/.env"

cat > "$ENV_FILE" <<EOF
PORT=$APP_PORT
NODE_ENV=production

JWT_SECRET=$JWT_SECRET
ENCRYPTION_KEY=$ENCRYPTION_KEY

ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD=$ADMIN_PASSWORD

DB_PATH=./data/yedidia.db
EOF

chmod 600 "$ENV_FILE"
ok ".env נוצר (הרשאות 600)"

# ── 7. Nginx ──────────────────────────────────────────────────────────────────
step "7/12  Nginx configuration"

NGINX_CONF="/etc/nginx/sites-available/yedidia"

if [[ -n "$DOMAIN" ]]; then
  SERVER_NAME="$DOMAIN"
else
  SERVER_NAME="_"
fi

cat > "$NGINX_CONF" <<NGINX
server {
    listen 80;
    server_name $SERVER_NAME;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header X-XSS-Protection "1; mode=block";

    # API
    location /api {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 60s;
    }

    # Admin panel
    location /admin {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    # Health check
    location /health {
        proxy_pass http://127.0.0.1:$APP_PORT;
    }

    # Block hidden files
    location ~ /\. { deny all; }
}
NGINX

# Disable default site, enable ours
rm -f /etc/nginx/sites-enabled/default
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/yedidia

nginx -t -q
systemctl restart nginx
ok "Nginx מוגדר ופועל"

# ── 8. SSL ────────────────────────────────────────────────────────────────────
step "8/12  SSL Certificate"

if [[ -n "$DOMAIN" ]]; then
  info "מתקין תעודת SSL עבור $DOMAIN ..."
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos \
    --email "$ADMIN_EMAIL" --redirect
  ok "SSL הופעל — https://$DOMAIN"
else
  info "לא הוזן דומיין — SSL דולג. ניתן להפעיל מאוחר יותר:"
  info "  sudo certbot --nginx -d your-domain.co.il"
fi

# ── 9. UFW Firewall ───────────────────────────────────────────────────────────
step "9/12  Firewall (UFW)"

ufw --force reset >/dev/null 2>&1
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null
ok "Firewall פעיל — SSH + HTTP/HTTPS מורשים"

# ── 10. fail2ban ──────────────────────────────────────────────────────────────
step "10/12  fail2ban"

cat > /etc/fail2ban/jail.local <<'F2B'
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true

[nginx-http-auth]
enabled = true
F2B

systemctl enable fail2ban --quiet
systemctl restart fail2ban
ok "fail2ban פעיל"

# ── 11. Backup cron ───────────────────────────────────────────────────────────
step "11/12  Automated backups"

mkdir -p "$BACKUP_DIR"

CRON_JOB="0 3 * * * cp $INSTALL_DIR/data/yedidia.db $BACKUP_DIR/yedidia-\$(date +\\%Y\\%m\\%d).db 2>/dev/null; find $BACKUP_DIR -name 'yedidia-*.db' -mtime +30 -delete 2>/dev/null"

# Add only if not already present
if ! crontab -l 2>/dev/null | grep -q "yedidia.db"; then
  (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
fi
ok "גיבוי יומי (3:00 לילה) → $BACKUP_DIR"

# ── 12. PM2 start ─────────────────────────────────────────────────────────────
step "12/12  Start application"

cd "$INSTALL_DIR"

# Stop existing instance if running
pm2 delete yedidia-backend 2>/dev/null || true

pm2 start src/app.js \
  --name yedidia-backend \
  --env production \
  --log "$INSTALL_DIR/logs/app.log" \
  --error "$INSTALL_DIR/logs/error.log" \
  --time

pm2 save --force >/dev/null

# Setup startup script
PM2_STARTUP=$(pm2 startup systemd -u root --hp /root 2>&1 | grep "sudo" | tail -1 || true)
if [[ -n "$PM2_STARTUP" ]]; then
  eval "$PM2_STARTUP" >/dev/null 2>&1 || true
fi

ok "האפליקציה פועלת עם PM2"

# ── Summary ───────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}${GREEN}"
echo "  ╔══════════════════════════════════════════════════════════╗"
echo "  ║              ✓  ההתקנה הושלמה בהצלחה!                  ║"
echo "  ╚══════════════════════════════════════════════════════════╝"
echo -e "${RESET}"

# Determine base URL
if [[ -n "$DOMAIN" ]]; then
  BASE_URL="https://$DOMAIN"
else
  PUBLIC_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || echo "IP-שלך")
  BASE_URL="http://$PUBLIC_IP"
fi

echo -e "${BOLD}  URLs:${RESET}"
echo "    Admin dashboard:  $BASE_URL/admin"
echo "    API:              $BASE_URL/api"
echo "    Health check:     $BASE_URL/health"

echo -e "\n${BOLD}  פרטי גישה:${RESET}"
echo "    אימייל Admin:  $ADMIN_EMAIL"
echo "    סיסמת Admin:   $ADMIN_PASSWORD"

echo -e "\n${BOLD}  סודות שנוצרו (שמור אותם!):${RESET}"
echo "    JWT_SECRET:        $JWT_SECRET"
echo "    ENCRYPTION_KEY:    $ENCRYPTION_KEY"
echo "    קובץ .env:         $ENV_FILE"

echo -e "\n${BOLD}  פקודות שימושיות:${RESET}"
echo "    pm2 status                  — מצב השרת"
echo "    pm2 logs yedidia-backend    — לוגים חיים"
echo "    pm2 restart yedidia-backend — הפעלה מחדש"
echo "    sudo systemctl status nginx — מצב Nginx"
echo "    sudo ufw status             — מצב Firewall"

if [[ -z "$DOMAIN" ]]; then
  echo -e "\n${YELLOW}  ⚠  לא הוגדר דומיין — HTTPS לא פעיל."
  echo -e "     להפעלת SSL בעתיד: sudo certbot --nginx -d your-domain.co.il${RESET}"
fi

echo -e "\n${BOLD}  ⚠  חשוב — לא לשכוח:${RESET}"
echo "    1. Port forwarding בראוטר: פורט 80 ו-443 → IP פנימי של השרת"
echo "    2. לבקש IP סטטי חיצוני מספק האינטרנט"
echo "    3. לגבות את $ENV_FILE במקום בטוח"
echo ""
