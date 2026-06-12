/**
 * Per-user git token store for the vArena gateway.
 *
 * Tokens are encrypted at rest (AES-256-GCM, key derived from GATEWAY_SECRET) and
 * keyed by the user's Firebase email. Backed by a local SQLite file (node:sqlite).
 */
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";

export function createTokenStore({ dbPath, secret }) {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS git_tokens (
      email      TEXT PRIMARY KEY,
      provider   TEXT NOT NULL DEFAULT 'github',
      login      TEXT,
      enc        TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // 32-byte key derived from the gateway secret.
  const key = crypto.scryptSync(secret, "varena-git-token-store", 32);

  function encrypt(plaintext) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString("base64")}.${tag.toString("base64")}.${ct.toString("base64")}`;
  }

  function decrypt(blob) {
    const [ivB, tagB, ctB] = blob.split(".");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB, "base64"));
    decipher.setAuthTag(Buffer.from(tagB, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(ctB, "base64")), decipher.final()]).toString("utf8");
  }

  const upsert = db.prepare(
    `INSERT INTO git_tokens (email, provider, login, enc, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET provider=excluded.provider, login=excluded.login,
       enc=excluded.enc, updated_at=excluded.updated_at`,
  );
  const selectByEmail = db.prepare(`SELECT provider, login, enc, updated_at FROM git_tokens WHERE email = ?`);
  const deleteByEmail = db.prepare(`DELETE FROM git_tokens WHERE email = ?`);

  return {
    /** Store/replace a user's token. */
    set(email, { token, provider = "github", login = null }) {
      upsert.run(email, provider, login, encrypt(token), Date.now());
    },
    /** Return the decrypted token (or null) for a user. */
    getToken(email) {
      const row = selectByEmail.get(email);
      if (!row) return null;
      try {
        return decrypt(row.enc);
      } catch {
        return null;
      }
    },
    /** Return non-secret metadata for a user: { connected, provider, login, updatedAt }. */
    getMeta(email) {
      const row = selectByEmail.get(email);
      if (!row) return { connected: false };
      return { connected: true, provider: row.provider, login: row.login, updatedAt: row.updated_at };
    },
    remove(email) {
      deleteByEmail.run(email);
    },
  };
}
