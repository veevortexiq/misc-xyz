#!/usr/bin/env node
/**
 * vArena gateway
 *
 * One shared vArena (t3) instance sits on 127.0.0.1; this gateway is the only
 * public entry. It authenticates the team via Firebase (Gmail), then reverse-
 * proxies every authenticated request (HTTP + WebSocket) to vArena, injecting
 * the instance's bearer token. vArena never sees the Firebase token — only its
 * own bearer (issued once via `t3 auth session issue --token-only`).
 *
 * Trust model: mutually trusted team. This is access control at the front door,
 * NOT per-user isolation — everyone shares the one vArena instance.
 */
import http from "node:http";
import https from "node:https";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import httpProxy from "http-proxy";
import jwt from "jsonwebtoken";
import * as cookie from "cookie";
import admin from "firebase-admin";
import { createTokenStore } from "./tokenStore.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const env = process.env;
const PORT = Number(env.PORT || 8080);
const T3_TARGET = env.T3_TARGET || "http://127.0.0.1:3773";
const T3_BEARER = env.T3_BEARER;
const FIREBASE_PROJECT_ID = env.FIREBASE_PROJECT_ID;
const FIREBASE_API_KEY = env.FIREBASE_API_KEY;
const FIREBASE_AUTH_DOMAIN =
  env.FIREBASE_AUTH_DOMAIN || (FIREBASE_PROJECT_ID ? `${FIREBASE_PROJECT_ID}.firebaseapp.com` : undefined);
const GATEWAY_SECRET = env.GATEWAY_SECRET;
const ALLOWLIST = env.ALLOWLIST || ""; // comma-separated emails, or "*" for any verified Google account
const SESSION_TTL = env.SESSION_TTL || "12h";
const COOKIE_SECURE = (env.COOKIE_SECURE || "true") !== "false";
const COOKIE_NAME = "varena_gw";

// Optional in-app preview proxy: serves a local app (e.g. Next dev server) at its OWN origin
// so the app's relative /api calls resolve to the app, not vArena. Disabled unless PREVIEW_PORT set.
const PREVIEW_PORT = env.PREVIEW_PORT ? Number(env.PREVIEW_PORT) : null;
const PREVIEW_TARGET = env.PREVIEW_TARGET || "http://127.0.0.1:3000";

// Optional direct TLS: when TLS_CERT + TLS_KEY are set the gateway serves HTTPS itself
// (Node serves the one cert regardless of SNI — needed for bare-IP access where browsers
// send no SNI). Without them it serves HTTP (e.g. behind a TLS-terminating proxy).
const TLS_CERT = env.TLS_CERT;
const TLS_KEY = env.TLS_KEY;
const tlsOptions = TLS_CERT && TLS_KEY ? { cert: readFileSync(TLS_CERT), key: readFileSync(TLS_KEY) } : null;
const createServer = (handler) =>
  tlsOptions ? https.createServer(tlsOptions, handler) : http.createServer(handler);

// GOOGLE_APPLICATION_CREDENTIALS must point at the service-account JSON.
const required = { T3_BEARER, FIREBASE_PROJECT_ID, FIREBASE_API_KEY, GATEWAY_SECRET };
for (const [k, v] of Object.entries(required)) {
  if (!v) {
    console.error(`[varena-gateway] missing required env: ${k}`);
    process.exit(1);
  }
}
if (!env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("[varena-gateway] missing GOOGLE_APPLICATION_CREDENTIALS (path to service-account JSON)");
  process.exit(1);
}

admin.initializeApp({
  projectId: FIREBASE_PROJECT_ID,
  credential: admin.credential.applicationDefault(),
});

const allow = ALLOWLIST.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const allowAll = allow.includes("*");
if (allow.length === 0) {
  console.error("[varena-gateway] ALLOWLIST is empty — refusing to start (set emails or '*').");
  process.exit(1);
}
const emailAllowed = (email) => allowAll || allow.includes(String(email).toLowerCase());

// Per-user git token store (SQLite, encrypted with GATEWAY_SECRET).
const GIT_TOKEN_DB = env.GIT_TOKEN_DB || path.join(__dirname, "git-tokens.sqlite");
const tokenStore = createTokenStore({ dbPath: GIT_TOKEN_DB, secret: GATEWAY_SECRET });

// Validate a GitHub PAT and return its login, or null if invalid.
async function validateGitHubToken(token) {
  try {
    const resp = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${token}`, "User-Agent": "varena-gateway", Accept: "application/vnd.github+json" },
    });
    if (!resp.ok) return null;
    const body = await resp.json();
    return typeof body.login === "string" ? body.login : null;
  } catch {
    return null;
  }
}

const loginHtml = readFileSync(path.join(__dirname, "public", "login.html"), "utf8")
  .replaceAll("__API_KEY__", FIREBASE_API_KEY)
  .replaceAll("__AUTH_DOMAIN__", FIREBASE_AUTH_DOMAIN)
  .replaceAll("__PROJECT_ID__", FIREBASE_PROJECT_ID);

function setSession(res, email) {
  const token = jwt.sign({ email }, GATEWAY_SECRET, { expiresIn: SESSION_TTL });
  res.setHeader(
    "Set-Cookie",
    cookie.serialize(COOKIE_NAME, token, {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: "lax",
      path: "/",
    }),
  );
}

function getSession(req) {
  const parsed = cookie.parse(req.headers.cookie || "");
  const token = parsed[COOKIE_NAME];
  if (!token) return null;
  try {
    return jwt.verify(token, GATEWAY_SECRET);
  } catch {
    return null;
  }
}

const proxy = httpProxy.createProxyServer({
  target: T3_TARGET,
  ws: true,
  changeOrigin: true,
  xfwd: true,
});
// Inject the vArena instance bearer token on every proxied request.
proxy.on("proxyReq", (proxyReq) => proxyReq.setHeader("Authorization", `Bearer ${T3_BEARER}`));
proxy.on("proxyReqWs", (proxyReq) => proxyReq.setHeader("Authorization", `Bearer ${T3_BEARER}`));
proxy.on("error", (err, _req, res) => {
  console.error("[varena-gateway] proxy error:", err.message);
  if (res && res.writeHead && !res.headersSent) {
    res.writeHead(502, { "content-type": "text/plain" });
    res.end("vArena upstream unavailable");
  }
});

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > limit) reject(new Error("body too large"));
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

// Inject verified per-user identity + that user's git token for vArena. Loopback only;
// strip any client-supplied spoof of these headers first.
function injectUserHeaders(req, email) {
  delete req.headers["x-varena-user"];
  delete req.headers["x-varena-git-token"];
  delete req.headers["x-varena-git-login"];
  req.headers["x-varena-user"] = email;
  const token = tokenStore.getToken(email);
  if (token) {
    req.headers["x-varena-git-token"] = token;
    const meta = tokenStore.getMeta(email);
    if (meta.login) req.headers["x-varena-git-login"] = meta.login;
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://gateway.local");

  // --- auth endpoints (gateway-owned, prefixed to avoid colliding with vArena) ---
  if (url.pathname === "/__varena/login") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(loginHtml);
  }

  if (url.pathname === "/__varena/session" && req.method === "POST") {
    try {
      const { idToken } = JSON.parse((await readBody(req)) || "{}");
      const decoded = await admin.auth().verifyIdToken(idToken);
      if (!decoded.email || decoded.email_verified === false) {
        res.writeHead(403, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: "email not verified" }));
      }
      if (!emailAllowed(decoded.email)) {
        res.writeHead(403, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: "not on the allow-list" }));
      }
      setSession(res, decoded.email);
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(401, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: "invalid token" }));
    }
  }

  if (url.pathname === "/__varena/logout") {
    res.setHeader("Set-Cookie", cookie.serialize(COOKIE_NAME, "", { path: "/", maxAge: 0 }));
    res.writeHead(302, { Location: "/__varena/login" });
    return res.end();
  }

  // --- everything else requires a valid gateway session ---
  const session = getSession(req);
  if (!session) {
    if ((req.headers.accept || "").includes("text/html")) {
      res.writeHead(302, { Location: "/__varena/login" });
      return res.end();
    }
    res.writeHead(401, { "content-type": "text/plain" });
    return res.end("unauthorized");
  }

  // --- per-user git token (GitHub PAT) — entered via vArena settings, stored per email ---
  if (url.pathname === "/__varena/git-token") {
    if (req.method === "GET") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(tokenStore.getMeta(session.email)));
    }
    if (req.method === "POST") {
      try {
        const { token } = JSON.parse((await readBody(req)) || "{}");
        if (!token || typeof token !== "string") {
          res.writeHead(400, { "content-type": "application/json" });
          return res.end(JSON.stringify({ error: "token required" }));
        }
        const login = await validateGitHubToken(token.trim());
        if (!login) {
          res.writeHead(400, { "content-type": "application/json" });
          return res.end(JSON.stringify({ error: "invalid GitHub token" }));
        }
        tokenStore.set(session.email, { token: token.trim(), provider: "github", login });
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ connected: true, provider: "github", login }));
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: "bad request" }));
      }
    }
    if (req.method === "DELETE") {
      tokenStore.remove(session.email);
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ connected: false }));
    }
    res.writeHead(405, { "content-type": "application/json" });
    return res.end(JSON.stringify({ error: "method not allowed" }));
  }

  injectUserHeaders(req, session.email);
  proxy.web(req, res);
});

// WebSocket upgrades — vArena uses WS; authenticate the cookie before proxying.
server.on("upgrade", (req, socket, head) => {
  const session = getSession(req);
  if (!session) {
    socket.destroy();
    return;
  }
  injectUserHeaders(req, session.email);
  proxy.ws(req, socket, head);
});

server.listen(PORT, () => {
  console.log(`[varena-gateway] listening on :${PORT} → ${T3_TARGET}`);
  console.log(`[varena-gateway] allow-list: ${allowAll ? "* (any verified Google account)" : allow.join(", ")}`);
});

// --- preview proxy: app preview iframe target, own origin, same login cookie ---
if (PREVIEW_PORT) {
  const previewProxy = httpProxy.createProxyServer({
    target: PREVIEW_TARGET,
    ws: true,
    changeOrigin: true,
    xfwd: true,
  });
  previewProxy.on("error", (err, _req, res) => {
    console.error("[varena-gateway] preview proxy error:", err.message);
    if (res && res.writeHead && !res.headersSent) {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end("preview app not running");
    }
  });
  // Proxy EVERY path (/, /api, /_next, …) to the app so it runs at its own origin root.
  // No vArena bearer here — this is the user's app, not vArena.
  const previewServer = createServer((req, res) => {
    if (!getSession(req)) {
      res.writeHead(401, { "content-type": "text/plain" });
      return res.end("unauthorized");
    }
    previewProxy.web(req, res);
  });
  previewServer.on("upgrade", (req, socket, head) => {
    if (!getSession(req)) {
      socket.destroy();
      return;
    }
    previewProxy.ws(req, socket, head);
  });
  previewServer.listen(PREVIEW_PORT, () => {
    console.log(`[varena-gateway] preview on :${PREVIEW_PORT} → ${PREVIEW_TARGET}`);
  });
}
