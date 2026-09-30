#!/usr/bin/env bash
# ============================================================================
# One-shot VPS setup for PWD Works Tracker  (Ubuntu 22.04/24.04, Debian 12)
# Usage on the VPS:  sudo bash setup-vps.sh yourdomain.com
# Prerequisite: domain's DNS  A record  @  and  www  -> this VPS's IP
# ============================================================================
set -e
DOMAIN="${1:?usage: sudo bash setup-vps.sh yourdomain.com}"
EMAIL="${2:-admin@$DOMAIN}"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y curl git nginx

# Node.js 20
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
npm i -g pm2

# App code (private repo: use  git clone https://<TOKEN>@github.com/Mukesh931/pwd-tracker.git
# or upload the zip from GitHub and unzip it to /opt/pwd-tracker)
mkdir -p /opt
if [ ! -d /opt/pwd-tracker/server.js ] && [ ! -f /opt/pwd-tracker/server.js ]; then
  echo ">> Place the app at /opt/pwd-tracker (git clone or unzip) and re-run this script."
  exit 1
fi
cd /opt/pwd-tracker
npm install --omit=dev

# Run forever + on boot
pm2 delete pwd 2>/dev/null || true
pm2 start server.js --name pwd
pm2 save
pm2 startup systemd | tail -1 | bash || true

# Nginx reverse proxy
cat > /etc/nginx/sites-available/pwd <<EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    client_max_body_size 25M;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
ln -sf /etc/nginx/sites-available/pwd /etc/nginx/sites-enabled/pwd
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# Free HTTPS (Let's Encrypt) + auto-renewal + http->https redirect
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --redirect --non-interactive --agree-tos -m "$EMAIL" || \
  echo "!! certbot failed - usually DNS not propagated yet. Re-run: certbot --nginx -d $DOMAIN -d www.$DOMAIN --redirect"

echo
echo "============================================================"
echo "  DONE  ->  https://$DOMAIN"
echo "  App service: pm2 status | pm2 logs pwd"
echo "  Data lives in /opt/pwd-tracker/data/tracker.db (back it up!)"
echo "============================================================"
