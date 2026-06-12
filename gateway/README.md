# vArena gateway

Firebase (Gmail) auth gateway + reverse proxy in front of one shared vArena (t3) instance.
Only the gateway is public; vArena binds `127.0.0.1` and is reached only through here.

## Flow
1. Unauthenticated browser → `/__varena/login` → Firebase Google sign-in (popup) → Firebase ID token.
2. Browser POSTs the ID token to `/__varena/session`. Gateway verifies it with the Firebase Admin SDK,
   checks the email against `ALLOWLIST`, and sets a signed httpOnly session cookie.
3. All other requests (HTTP + WebSocket) with a valid cookie are reverse-proxied to vArena, with
   `Authorization: Bearer <T3_BEARER>` injected. vArena only ever sees its own bearer token.

> Trust model: mutually trusted team. This is front-door access control, not per-user isolation —
> everyone shares the one vArena instance (projects, folders, terminals).

## Setup
```bash
npm install
cp .env.example .env     # fill in T3_BEARER, GATEWAY_SECRET, ALLOWLIST
# mint the bearer against the running vArena instance:
#   t3 auth session issue --token-only --ttl 365d --label varena-gateway
npm start
```

## Endpoints
- `GET  /__varena/login`   — sign-in page
- `POST /__varena/session` — exchange Firebase ID token for a gateway session cookie
- `GET  /__varena/logout`  — clear session
- everything else          — proxied to vArena when authenticated

## Production
Put Caddy/nginx with TLS in front (Firebase web SDK needs a secure context; the host IP is in
Firebase authorized domains). Run vArena + gateway as systemd units. See `../PLAN-vArena.md`.
