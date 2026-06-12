# vArena deploy assets

> **Do not run until you intend to deploy.** Nothing here contacts the box automatically.

Target box: `172.190.70.72` (ssh `vseadmin`, key `vortexspace-host.pem`).

## Files
- `varena.service` — systemd unit for the shared vArena server (binds `127.0.0.1:3773`).
- `varena-gateway.service` — systemd unit for the Firebase auth gateway (`:8080`).
- `Caddyfile` — TLS reverse proxy. Bare-IP uses `tls internal` (browser warning); a real domain
  gets auto-TLS. Host IP is already in Firebase authorized domains.
- `deploy.sh` — end-to-end box setup (system user, build, bearer mint, env, systemd, Caddy).

## Procedure (when authorized)
1. From dev machine, rsync the rebranded `t3code/` and `gateway/` + the SA JSON to the box.
2. SSH in, run `deploy.sh` (installs vp, `vp i`, `vp build` → Linux node-pty; mints bearer; writes env).
3. **Edit `ALLOWLIST`** in `/opt/varena/gateway/.env` with the team's Gmail addresses.
4. `sudo systemctl restart varena-gateway`.
5. Install/point Caddy at the Caddyfile for TLS.

## Notes
- node-pty: do NOT copy the Windows `node_modules`; `vp i` on the box fetches the Linux native binary.
- Trust model: one shared instance, all users see everything. Front-door auth only.
