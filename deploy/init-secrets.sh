#!/usr/bin/env bash
# Run ONCE on the box (before teardown). Stashes durable secrets OUTSIDE ~/varena so they
# survive down.sh and make up.sh need zero manual secret handling.
set -euo pipefail
SRC=/home/vseadmin/varena/gateway
DST="$HOME/.varena-secrets"

mkdir -p "$DST"
chmod 700 "$DST"

cp "$SRC/vortexspace-sa.json" "$DST/vortexspace-sa.json"

# Persist the durable values from the live gateway .env (GATEWAY_SECRET kept → sessions survive).
grep -E '^(FIREBASE_API_KEY|GATEWAY_SECRET|ALLOWLIST)=' "$SRC/.env" > "$DST/varena.env"
# Optionally add a GitHub token line for no-prompt private-repo clone on redeploy:
#   echo 'GITHUB_TOKEN=ghp_xxx' >> ~/.varena-secrets/varena.env

chmod 600 "$DST"/*
echo "Stashed to $DST:"
ls -la "$DST"
