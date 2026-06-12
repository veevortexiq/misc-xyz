#!/usr/bin/env bash
# vArena deploy — run ON the Linux box (172.190.70.72) as a sudo-capable user.
# NOTHING here touches the box automatically; run it only when you intend to deploy.
set -euo pipefail

BOX_USER=varena
APP_DIR=/opt/varena
DATA_DIR=/var/lib/varena/data
PORT_T3=3773
PORT_GW=8080

echo ">> 1. system user + dirs"
id -u "$BOX_USER" >/dev/null 2>&1 || sudo useradd --system --create-home --shell /usr/sbin/nologin "$BOX_USER"
sudo mkdir -p "$APP_DIR" "$DATA_DIR"
sudo chown -R "$BOX_USER":"$BOX_USER" "$APP_DIR" "$DATA_DIR"
sudo chmod 700 "$DATA_DIR"

# >> 2. Get the rebranded source onto the box.
#    From your dev machine (NOT this script):
#      rsync -az --exclude node_modules --exclude '**/dist' \
#        t3code/ vseadmin@172.190.70.72:/opt/varena/t3code/
#      rsync -az --exclude node_modules gateway/ vseadmin@172.190.70.72:/opt/varena/gateway/
#      scp secrets/vortexspace-sa.json vseadmin@172.190.70.72:/opt/varena/gateway/

echo ">> 3. install Vite+ and build vArena (pulls Linux node-pty native binary)"
command -v vp >/dev/null 2>&1 || curl -fsSL https://vite.plus | bash
export PATH="$HOME/.vite-plus/bin:$PATH"
cd "$APP_DIR/t3code"
vp i
# VITE_PREVIEW_URL is baked into the web bundle → the /preview iframe default.
# Point it at the public preview origin (Caddy :8443 → gateway preview :8090 → app :3000).
export VITE_PREVIEW_URL="https://172.190.70.72:8443"
vp run --filter t3 build

echo ">> 4. install gateway deps"
cd "$APP_DIR/gateway"
npm install --omit=dev

echo ">> 5. mint the vArena bearer token (token prints to stderr; capture both)"
cd "$APP_DIR/t3code"
# start vArena once headless to create state, or run issue against the base-dir directly:
TOKEN=$(node apps/server/dist/bin.mjs auth session issue --token-only --ttl 365d \
  --label varena-gateway --base-dir "$DATA_DIR" 2>&1 | grep -oE 'eyJ[A-Za-z0-9_.-]+' | tail -1)
echo "   bearer length: ${#TOKEN}"

echo ">> 6. write gateway .env (fill ALLOWLIST with your team emails!)"
SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
cat > "$APP_DIR/gateway/.env" <<EOF
PORT=$PORT_GW
T3_TARGET=http://127.0.0.1:$PORT_T3
T3_BEARER=$TOKEN
FIREBASE_PROJECT_ID=saasvortex-dryrunproai
FIREBASE_API_KEY=AIzaSyD6lw5DXGizWskm8e9ImBKmUhEF8ZLA4FQ
FIREBASE_AUTH_DOMAIN=saasvortex-dryrunproai.firebaseapp.com
GOOGLE_APPLICATION_CREDENTIALS=$APP_DIR/gateway/vortexspace-sa.json
GATEWAY_SECRET=$SECRET
ALLOWLIST=CHANGE_ME@example.com
SESSION_TTL=12h
COOKIE_SECURE=true
PREVIEW_PORT=8090
PREVIEW_TARGET=http://127.0.0.1:3000
EOF
sudo chown "$BOX_USER":"$BOX_USER" "$APP_DIR/gateway/.env"
sudo chmod 600 "$APP_DIR/gateway/.env" "$APP_DIR/gateway/vortexspace-sa.json"

echo ">> 7. systemd units + Caddy"
sudo cp "$APP_DIR/deploy/varena.service" /etc/systemd/system/
sudo cp "$APP_DIR/deploy/varena-gateway.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now varena.service varena-gateway.service
# Caddy: sudo apt install caddy; sudo cp deploy/Caddyfile /etc/caddy/Caddyfile; sudo systemctl reload caddy

echo ">> done. Edit ALLOWLIST in $APP_DIR/gateway/.env, then: sudo systemctl restart varena-gateway"
