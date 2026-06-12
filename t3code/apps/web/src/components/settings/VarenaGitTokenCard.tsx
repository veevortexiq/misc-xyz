import { useCallback, useEffect, useState } from "react";

/**
 * vArena per-user GitHub token card.
 *
 * Talks to the vArena gateway (same origin) at /__varena/git-token. The gateway stores
 * each user's PAT encrypted, keyed by their Firebase email, and injects it into vArena
 * requests so git/source-control runs under the signed-in user's identity.
 *
 * This is plain fetch (not a t3 RPC) — the endpoints are owned by the gateway, not vArena.
 */

type TokenMeta = { connected: boolean; login?: string; provider?: string };

const ENDPOINT = "/__varena/git-token";

export function VarenaGitTokenCard() {
  const [meta, setMeta] = useState<TokenMeta | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const resp = await fetch(ENDPOINT, { headers: { Accept: "application/json" } });
      if (resp.ok) setMeta(await resp.json());
      else setMeta({ connected: false });
    } catch {
      setMeta({ connected: false });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const connect = useCallback(async () => {
    setError(null);
    const value = token.trim();
    if (!value) return;
    setBusy(true);
    try {
      const resp = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: value }),
      });
      const body = await resp.json().catch(() => ({}));
      if (resp.ok) {
        setToken("");
        setMeta(body);
      } else {
        setError(body.error || "Could not save token.");
      }
    } catch {
      setError("Request failed.");
    } finally {
      setBusy(false);
    }
  }, [token]);

  const disconnect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await fetch(ENDPOINT, { method: "DELETE" });
      setMeta({ connected: false });
    } catch {
      setError("Request failed.");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="rounded-2xl border border-input bg-card/40 p-4 sm:p-5">
      <h3 className="font-medium text-foreground text-sm">Your GitHub access</h3>
      <p className="mt-1 text-muted-foreground text-xs">
        Add a personal access token so git and source-control run as <em>you</em>. Stored encrypted
        per account; never shared with other users.
      </p>

      {meta?.connected ? (
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-foreground text-sm">
            Connected{meta.login ? ` as ${meta.login}` : ""}.
          </span>
          <button
            type="button"
            onClick={disconnect}
            disabled={busy}
            className="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ghp_… (GitHub personal access token)"
            autoComplete="off"
            spellCheck={false}
            className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs outline-none focus:border-ring"
          />
          <button
            type="button"
            onClick={connect}
            disabled={busy || token.trim().length === 0}
            className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground text-xs hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Connect"}
          </button>
        </div>
      )}

      {error ? <p className="mt-2 text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
