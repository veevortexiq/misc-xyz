# vArena — teardown + one-command redeploy (same box)

Goal: delete today's vArena deploy from `172.190.70.72` now, redeploy in ~2 days with a single
command. Same server only. Do NOT touch the user's existing services.

## What I deployed today (the box footprint)
DELETE on teardown:
- `~/varena/` (3.1 GB) — t3code clone, gateway, dist, `data/` (SQLite state, threads, projects), `tls/`, `shim/`, `workspaces/`, `secrets/`.
- systemd units: `/etc/systemd/system/varena.service`, `varena-gateway.service`.

KEEP (so redeploy is trivial — these are reusable / not "today's mess"):
- Node 24 (NodeSource), `vp` (Vite+), build-essential/python3 — toolchain, harmless.
- Firebase: SA `vortexspace@…`, its key, IP in authorized domains, the apiKey API-restriction.
- GitHub repo `veevortexiq/misc-xyz` — the source of truth for redeploy.
- NSG inbound 8543 (+8443) — leave open; redeploy reuses them.

NOT affected by vArena (leave as-is):
- Their orchestrator (PM2, port 8080) and Caddy. vArena serves HTTP on `:8543` directly via the
  gateway + NSG; it does NOT go through Caddy. Caddy only serves `vortexspace.vortexiq.ai`.
  (Caveat: today I consolidated their domain from their manual `~/vse/caddy` to systemd `caddy`.
  Functionally identical. To fully restore the manual setup, see "Optional Caddy restore" below.)

## Make redeploy need ZERO manual secret handling
Today's secrets live inside `~/varena/` and would die on teardown. Before teardown, stash the
durable ones OUTSIDE the app dir, in `~/.varena-secrets/` (survives `down.sh`):
- `vortexspace-sa.json` (Firebase Admin key)
- `varena.env` holding: `FIREBASE_API_KEY`, `GATEWAY_SECRET`, `ALLOWLIST` (and any overrides)

Then `up.sh` reads from `~/.varena-secrets/` — no scp, no re-entering secrets on redeploy.
(`T3_BEARER` is re-minted each deploy; `GATEWAY_SECRET` can persist so existing cookies survive,
or be regenerated to force re-login.)

## Scripts to add to the repo (deploy/)
1. **`deploy/init-secrets.sh`** (run ONCE, now) — writes `~/.varena-secrets/{vortexspace-sa.json,varena.env}`
   from the current running config, so they outlive teardown.
2. **`deploy/down.sh`** (teardown):
   ```
   sudo systemctl disable --now varena-gateway varena 2>/dev/null
   sudo rm -f /etc/systemd/system/varena.service /etc/systemd/system/varena-gateway.service
   sudo systemctl daemon-reload
   rm -rf ~/varena
   echo "vArena removed. Secrets kept in ~/.varena-secrets. Their orchestrator + domain untouched."
   ```
3. **`deploy/up.sh`** (one-command redeploy):
   ```
   # clone source (private repo — token via gh or a PAT arg), into ~/varena
   git clone https://github.com/veevortexiq/misc-xyz.git ~/varena
   cd ~/varena/t3code
   export PATH="$HOME/.vite-plus/bin:$PATH"
   vp i
   export VITE_PREVIEW_URL=http://172.190.70.72:8443 VITE_WORKSPACE_ROOT=/home/vseadmin
   vp run --filter t3 build
   cd ~/varena/gateway && npm install --omit=dev
   cp ~/.varena-secrets/vortexspace-sa.json ~/varena/gateway/
   mkdir -p ~/varena/{data,shim,workspaces}
   # shim git/gh
   for b in git gh; do printf '#!/bin/sh\necho "vArena: %s disabled in terminal." >&2; exit 1\n' "$b" > ~/varena/shim/$b; chmod +x ~/varena/shim/$b; done
   # bearer
   TOKEN=$(node ~/varena/t3code/apps/server/dist/bin.mjs auth session issue --token-only --ttl 365d --base-dir ~/varena/data 2>&1 | grep -oE 'eyJ[A-Za-z0-9_.-]+' | tail -1)
   # gateway .env from persisted secrets + bearer
   . ~/.varena-secrets/varena.env
   cat > ~/varena/gateway/.env <<EOF
   PORT=8543
   T3_TARGET=http://127.0.0.1:3773
   T3_BEARER=$TOKEN
   FIREBASE_PROJECT_ID=saasvortex-dryrunproai
   FIREBASE_API_KEY=$FIREBASE_API_KEY
   FIREBASE_AUTH_DOMAIN=saasvortex-dryrunproai.firebaseapp.com
   GOOGLE_APPLICATION_CREDENTIALS=/home/vseadmin/varena/gateway/vortexspace-sa.json
   GATEWAY_SECRET=$GATEWAY_SECRET
   ALLOWLIST=$ALLOWLIST
   SESSION_TTL=12h
   COOKIE_SECURE=false
   PREVIEW_PORT=8443
   PREVIEW_TARGET=http://127.0.0.1:3000
   EOF
   # systemd units (templated in repo deploy/) + env
   sudo cp ~/varena/deploy/varena.box.service /etc/systemd/system/varena.service
   sudo cp ~/varena/deploy/varena-gateway.service /etc/systemd/system/varena-gateway.service
   sudo systemctl daemon-reload
   sudo systemctl enable --now varena varena-gateway
   echo "vArena up at http://172.190.70.72:8543"
   ```
   Redeploy time: ~3–5 min (vp i + build). Single command: `bash ~/varena/deploy/up.sh` after clone,
   or a tiny bootstrap that clones then runs it.

## systemd units to commit (box-specific, with the env)
`deploy/varena.box.service` — ExecStart `node apps/server/dist/bin.mjs serve --no-browser --host 127.0.0.1 --port 3773 --base-dir /home/vseadmin/varena/data`, `Environment=VARENA_SHIM_DIR=/home/vseadmin/varena/shim`, `Environment=VARENA_WORKSPACE_ROOT=/home/vseadmin`, `User=vseadmin`, `WorkingDirectory=/home/vseadmin/varena/t3code`.
`deploy/varena-gateway.service` — already in repo (EnvironmentFile=.../gateway/.env).

## Optional Caddy restore (only if you want the exact pre-today state)
- `sudo systemctl disable --now caddy`
- `cd ~/vse && nohup ./caddy run --config ./Caddyfile --adapter caddyfile >caddy.log 2>&1 &`
Otherwise leave systemd caddy serving the domain (works, cleaner).

## Open decisions for you
- Keep `GATEWAY_SECRET` persistent (sessions survive) or regenerate (force re-login)? → persistent recommended.
- Lock `ALLOWLIST` to team emails before redeploy (currently `*` = open to any Google account).
- Remove NSG 8543/8443 on teardown, or leave for redeploy? → leave.
