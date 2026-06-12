# vArena

A rebranded, self-hosted fork of **t3** (T3 Code) running as **one shared instance** behind a
**Firebase (Gmail) auth gateway**, on a single Linux box. Adds a workspace file browser, an
app-preview iframe, a Jira integration, and a per-user PAT path — all in the sidebar.

- **Live URL:** `http://172.190.70.72:8543` (HTTP; Firebase Google sign-in works over HTTP)
- **Repo:** `github.com/veevortexiq/misc-xyz`
- **Box:** `172.190.70.72`, ssh `vseadmin` (key `vortexspace-host.pem`)

## Architecture
```
Internet ──:8543──> gateway (gateway/server.mjs)
                      │  verifies Firebase ID token (Admin SDK), checks email allow-list
                      │  injects vArena bearer + per-user identity headers
                      ▼
   vArena server (t3code/apps/server) ── 127.0.0.1:3773 ── SQLite state in ~/varena/data
```
The gateway is the only public entry; vArena binds loopback. NSG opens `8543` (+`8443` preview).
The box's existing orchestrator (`:8080`) + Caddy domain are untouched.

## Features (left sidebar: Chat · Files · Jira · Preview)
- **Rebrand** T3 Code → vArena (incl. logo wordmark). **Claude-only** provider.
- **Firebase Gmail auth** at the gateway; `ALLOWLIST=*` (any Google account) — lock to team emails for prod.
- **Files** — workspace file browser, confined to `VARENA_WORKSPACE_ROOT` (`/home/vseadmin`); click a file → `@path` into chat.
- **Jira** — list/search Cloud tickets, full-page detail view, "Add to chat" injects the ticket + description into a thread.
- **Preview** — iframe a local app (e.g. Next dev server) via the gateway preview origin so its `/api` resolves correctly.
- **Terminal git blocked** (`git`/`gh` shimmed) — git goes through the Source Control UI.
- t3's **pairing screen removed** (gateway handles auth).

## Secrets (never committed)
Live only in `~/.varena-secrets/` on the box (survives teardown):
- `vortexspace-sa.json` — Firebase Admin key
- `varena.env` — `FIREBASE_API_KEY`, `GATEWAY_SECRET` (persisted → logins survive redeploy),
  `ALLOWLIST`, `JIRA_CLOUD_SITE_URL`, `JIRA_CLOUD_API_TOKEN_BASE64`
- `up.sh` — staged copy of the redeploy script (survives `down.sh`)

## Redeploy (one command)
```bash
ssh -i vortexspace-host.pem vseadmin@172.190.70.72
GITHUB_TOKEN=<github-token> bash ~/.varena-secrets/up.sh
```
~3–5 min → live again. It reads everything from `~/.varena-secrets/`, clones this repo, runs
`vp i` + `vp build` (with `VITE_PREVIEW_URL` + `VITE_WORKSPACE_ROOT`), mints the bearer, writes the
gateway `.env`, installs systemd units, and starts. The GitHub token is the only manual input
(private repo) — add `GITHUB_TOKEN=ghp_…` to `varena.env`, or make the repo public, to drop it.

## Teardown
```bash
ssh -i vortexspace-host.pem vseadmin@172.190.70.72
git clone https://github.com/veevortexiq/misc-xyz.git ~/varena && bash ~/varena/deploy/down.sh
```
`down.sh` stops + removes the systemd units, deletes `~/varena` (app + chat history) and the
project workspaces it created (explicit list only — never touches `~/app`, `~/vse`, or secrets).

## Build env (required for `vp build`)
- `VITE_PREVIEW_URL=http://172.190.70.72:8443`
- `VITE_WORKSPACE_ROOT=/home/vseadmin`
Server systemd env: `VARENA_SHIM_DIR=/home/vseadmin/varena/shim`, `VARENA_WORKSPACE_ROOT=/home/vseadmin`.

## Repo layout
- `t3code/` — rebranded t3 monorepo (build with Vite+ `vp`). vArena code:
  `apps/web/src/components/{FileSidebarPanel,JiraSidebarPanel,AppSidebarLayout}.tsx`,
  `apps/web/src/routes/{files,preview,jira.$ticketKey}.tsx`,
  `apps/server/src/ws.ts` (terminal guard), `apps/server/src/workspace/Layers/WorkspaceEntries.ts` (confinement + file listing).
- `gateway/` — Firebase auth + reverse proxy + Jira + per-user-token gateway (Node, no build).
- `deploy/` — `up.sh`, `down.sh`, `init-secrets.sh`, systemd units, `PORTABLE.md`.
- `secrets/` — gitignored; box only.
