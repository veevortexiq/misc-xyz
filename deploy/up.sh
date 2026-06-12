#!/usr/bin/env bash
# One-command redeploy of vArena on this box. Reads stashed secrets from ~/.varena-secrets.
#   GITHUB_TOKEN=ghp_xxx bash up.sh   (token only needed while the repo is private)
set -euo pipefail

SECRETS="$HOME/.varena-secrets"
APP="$HOME/varena"
REPO_HTTPS="https://github.com/veevortexiq/misc-xyz.git"

[ -f "$SECRETS/varena.env" ] || { echo "Missing $SECRETS/varena.env — run init-secrets.sh before teardown."; exit 1; }
# shellcheck disable=SC1090
. "$SECRETS/varena.env"   # FIREBASE_API_KEY, GATEWAY_SECRET, ALLOWLIST, optional GITHUB_TOKEN

echo ">> 1/6 clone source"
rm -rf "$APP"
TOKEN="${GITHUB_TOKEN:-}"
if [ -n "$TOKEN" ]; then
  git clone --quiet "https://veevortexiq:${TOKEN}@github.com/veevortexiq/misc-xyz.git" "$APP"
  git -C "$APP" remote set-url origin "$REPO_HTTPS"
else
  git clone --quiet "$REPO_HTTPS" "$APP"
fi

export PATH="$HOME/.vite-plus/bin:$PATH"

echo ">> 2/6 build (vp i + build)"
cd "$APP/t3code"
vp i
export VITE_PREVIEW_URL="http://172.190.70.72:8443"
export VITE_WORKSPACE_ROOT="/home/vseadmin"
vp run --filter t3 build

echo ">> 3/6 gateway deps + secrets + shim"
cd "$APP/gateway" && npm install --omit=dev --no-audit --no-fund
cp "$SECRETS/vortexspace-sa.json" "$APP/gateway/vortexspace-sa.json"
mkdir -p "$APP/data" "$APP/shim" "$APP/workspaces"
for b in git gh; do
  printf '#!/bin/sh\necho "vArena: %s is disabled in the terminal. Use the Source Control panel." >&2\nexit 1\n' "$b" > "$APP/shim/$b"
  chmod +x "$APP/shim/$b"
done

echo ">> 4/6 mint bearer + write gateway .env"
TOKEN_BEARER=$(node "$APP/t3code/apps/server/dist/bin.mjs" auth session issue --token-only --ttl 365d \
  --label varena-gateway --base-dir "$APP/data" 2>&1 | grep -oE 'eyJ[A-Za-z0-9_.-]+' | tail -1)
cat > "$APP/gateway/.env" <<EOF
PORT=8543
T3_TARGET=http://127.0.0.1:3773
T3_BEARER=$TOKEN_BEARER
FIREBASE_PROJECT_ID=saasvortex-dryrunproai
FIREBASE_API_KEY=$FIREBASE_API_KEY
FIREBASE_AUTH_DOMAIN=saasvortex-dryrunproai.firebaseapp.com
GOOGLE_APPLICATION_CREDENTIALS=$APP/gateway/vortexspace-sa.json
GATEWAY_SECRET=$GATEWAY_SECRET
ALLOWLIST=$ALLOWLIST
SESSION_TTL=12h
COOKIE_SECURE=false
PREVIEW_PORT=8443
PREVIEW_TARGET=http://127.0.0.1:3000
EOF
chmod 600 "$APP/gateway/.env" "$APP/gateway/vortexspace-sa.json"

echo ">> 5/6 systemd units"
sudo cp "$APP/deploy/varena.box.service" /etc/systemd/system/varena.service
sudo cp "$APP/deploy/varena-gateway.box.service" /etc/systemd/system/varena-gateway.service
sudo systemctl daemon-reload
sudo systemctl enable --now varena varena-gateway

echo ">> 6/6 status"
sleep 6
echo "varena=$(systemctl is-active varena) gateway=$(systemctl is-active varena-gateway)"
echo "vArena up at http://172.190.70.72:8543"
