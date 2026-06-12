# vArena — Build & Deploy Plan

Fork of `t3` (T3 Code, v0.0.27, MIT) rebranded to **vArena**, hosted multi-user on one
Linux box with Firebase (Gmail) sign-in and per-user folder isolation.

Target host: `172.190.70.72` (ssh `vseadmin`, key `vortexspace-host.pem`). **Do not deploy until explicitly told.**

---

## 1. Decisions (locked)

| Decision | Choice |
|---|---|
| Auth mechanism | **Firebase Auth** (Gmail / Google provider) — gates team access at a front gateway |
| Tenancy model | **#1 — truly shared**: one t3 process, one DB, all users share everything. No fork. |
| Trust model | **Mutually trusted team** — no per-user isolation (accepted) |
| Per-user folders | **None.** Everyone sees + edits all projects/folders/terminals. |
| Host | Single Linux box |
| Rebrand | dist-patch (string + asset swap), no rebuild |

### Scope (chosen #1 — lowest effort)
One rebranded t3 instance on the box (bound to `127.0.0.1`), behind a gateway that does Firebase Gmail
login (email allow-list = the team). On success the gateway reverse-proxies every authenticated user to the
**single** t3 instance, injecting its one bearer token. All users share one DB → one shared set of projects.

Dropped vs earlier drafts: per-user base-dirs, per-user OS accounts, per-user routing/lifecycle. Not needed
for a single shared instance.

### Consequence (accepted)
Every team member sees and can edit everyone's projects, folders, and terminals. There is no separation of
any kind. This is fine for a trusted team and is the explicit choice.

## 2. Why no fork

`t3` is single-tenant by design: one server secret, device-pairing sessions (all equal
privilege), one `state.sqlite`, and a `projection_projects` table with **no owner column**.
Adding real per-user separation inside t3 means owner-scoping every event-sourced projection +
rebuilding an exotic pinned toolchain (Effect 4.0-beta + bun + `@voidzero-dev/vite-plus`) — high
effort, high risk. Since the team is trusted and chose a single shared instance, none of that is
needed: run the published t3 as-is behind a Firebase auth gateway. Rebrand is a string/asset patch.

## 3. Target architecture

```
Internet ──TLS──> Caddy/nginx ──> Auth Gateway (Node service)
                                     │  1. Firebase Gmail login (email allow-list = team)
                                     │  2. verify Firebase ID token (Admin SDK), set gw session cookie
                                     │  3. reverse-proxy ALL users → the one vArena instance,
                                     │     inject Authorization: Bearer <instance token>
                                     ▼
   single vArena instance  ── 127.0.0.1:3773 ── one state.sqlite ── shared projects/workspaces
```

Key bridging detail: the gateway terminates Firebase auth, then injects the **instance's own
bearer token** (obtained once at bootstrap) on proxied requests. t3 never sees the Firebase token —
it only receives its own valid token. Use the **bearer** session method, NOT dpop (dpop is
sender-constrained and won't survive a proxy).

## 4. Workstreams

### W1 — Rebrand → vArena  (no rebuild)
- `bin.mjs`: replace 27 `"T3 Code"` display literals → `"vArena"`. **Do NOT touch** internal ids
  (`t3/...` service tags, `@t3tools/...`, package name `t3`).
- Client: `dist/client/index.html` `<title>T3 Code (Alpha)</title>` → vArena; swap favicon /
  apple-touch-icon / `*.png` (`.publish-bak` files prove assets are swappable).
- Deliverable: idempotent `rebrand.sh` run against a fresh install dir (post `npm install t3`),
  so it survives version bumps.

### W2 — Auth gateway (Firebase Gmail)  ← primary new code
- Frontend: Firebase Web SDK Google sign-in (or Firebase Hosted UI) → Firebase ID token.
- Gateway (Node/Hono or Express): verify ID token via **Firebase Admin SDK**, extract `email`,
  check against team allow-list (or restrict to a Google Workspace domain). Issue gw session cookie.
- Reverse-proxy authenticated requests (HTTP + WebSocket — t3 uses WS) to `127.0.0.1:3773`,
  injecting the instance bearer token. **SPIKE**: how to obtain the instance bearer token
  programmatically — `--bootstrap-fd` (read one-time secret from fd) vs parse `serve` pairing
  output vs `t3 auth` subcommand. Pick one, document it. (Only needed ONCE — single instance.)

### W3 — Linux deploy  (only when told)
- Fresh `npm install t3` **on the box** → pulls correct Linux node-pty native binary
  (do NOT copy the Windows install). Node ≥ 22.16 (engine: `^22.16 || ^23.11 || >=24.10`).
- Run W1 rebrand script. One systemd unit for vArena (bind `127.0.0.1:3773`), one for the gateway.
  Caddy/nginx + TLS on the host IP (self-signed or IP-cert CA — no LE for bare IP). Gateway is the
  sole public entry.

## 5. Open items to resolve before deploy
- **IP authorized in Firebase + TLS**: No DNS domain needed — user confirms adding the host IP
  `172.190.70.72` to Firebase authorized domains works. Still need **TLS / secure context** on the
  box (Firebase web SDK requires a secure origin; localhost is exempt, raw IP over http is not).
  Let's Encrypt won't issue for a bare IP → self-signed cert or an IP-cert CA.
- **Firebase project**: create in console, enable Google provider, set authorized domains,
  download Admin SDK service-account key for the gateway.
- **Instance bearer-token retrieval** — SOLVED: `t3 auth session issue --token-only --ttl 365d
  --label varena-gateway` mints a scoped bearer token (printed token-only). Gateway mints once at
  startup, injects `Authorization: Bearer <token>` on proxied requests. Revoke: `t3 auth session revoke`.
- **WebSocket proxying**: t3 uses WS; gateway must proxy upgrade requests, not just HTTP.

## 6. Build order
W1 (rebrand, local) → W2 gateway (local, against one local vArena instance) → W3 deploy.
Each stage testable locally before the box is touched.

## Reference — verified facts
- Package `t3@0.0.27`, MIT, bin `dist/bin.mjs` (bundled, **not** minified — patchable),
  `dist/client/` (minified React), runtime deps external in `node_modules`.
- Default port **3773**. Boots ~10s (SQLite migrate → listen → pairing token + QR).
- Auth source: `apps/server/src/auth/*` (EnvironmentAuthPolicy, PairingGrantStore, SessionStore,
  dpop). Session methods: cookie / bearer / dpop. Bootstrap: one-time-token (remote host).
- `projection_projects` columns: project_id, title, workspace_root, model_selection, scripts,
  timestamps — **no owner/user**. Single base-dir via `deriveServerPaths(baseDir)`.
- Source repo: `github.com/pingdotgg/t3code` (public, pnpm monorepo, `apps/server/src` real TS).
