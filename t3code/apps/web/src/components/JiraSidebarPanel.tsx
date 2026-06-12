import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { PlusIcon, RefreshCwIcon, SearchIcon } from "lucide-react";

import { scopeThreadRef } from "@t3tools/client-runtime";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";

import { useComposerDraftStore } from "../composerDraftStore";

/**
 * vArena Jira panel. Lists tickets (via gateway /__varena/jira/tickets — token server-side),
 * with a search box (ticket id or text). Click a ticket to open its full detail in the main
 * area (/jira/$ticketKey). The + button injects the ticket + description into the chat composer.
 */

type Ticket = { key: string; summary: string; status: string; description: string; url: string };

export function JiraSidebarPanel() {
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { environmentId?: string; threadId?: string };
  const environmentId = params.environmentId as EnvironmentId | undefined;
  const threadId = params.threadId as ThreadId | undefined;
  const inThread = Boolean(environmentId && threadId);

  const [query, setQuery] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = q.trim() ? `/__varena/jira/tickets?q=${encodeURIComponent(q.trim())}` : "/__varena/jira/tickets";
      const resp = await fetch(url, { headers: { Accept: "application/json" } });
      const body = await resp.json();
      if (body.error) {
        setError(String(body.error));
        setTickets([]);
      } else {
        setTickets(Array.isArray(body.tickets) ? body.tickets : []);
      }
    } catch {
      setError("Request failed.");
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load("");
  }, [load]);

  const addToChat = useCallback(
    (t: Ticket) => {
      if (!environmentId || !threadId) return;
      const ref = scopeThreadRef(environmentId, threadId);
      const store = useComposerDraftStore.getState();
      const current = store.getComposerDraft(ref)?.prompt ?? "";
      const block = `[${t.key}] ${t.summary}\n${t.description}`.trim();
      const next = current.trim().length > 0 ? `${current.trimEnd()}\n\n${block}\n` : `${block}\n`;
      store.setPrompt(ref, next);
    },
    [environmentId, threadId],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 border-border border-b px-2 py-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void load(query);
          }}
          className="flex items-center gap-1"
        >
          <div className="flex flex-1 items-center gap-1 rounded-md border border-input bg-card px-2">
            <SearchIcon className="size-3.5 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ticket id or text…"
              spellCheck={false}
              className="w-full bg-transparent py-1 text-xs outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              void load("");
            }}
            className="inline-flex items-center rounded-md border border-input p-1 hover:bg-muted"
            title="Reset / refresh"
          >
            <RefreshCwIcon className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </form>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-1">
        {error ? (
          <p className="px-2 py-6 text-center text-destructive text-xs">{error}</p>
        ) : loading ? (
          <p className="px-2 py-6 text-center text-muted-foreground text-xs">Loading…</p>
        ) : tickets.length === 0 ? (
          <p className="px-2 py-6 text-center text-muted-foreground text-xs">No tickets.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {tickets.map((t) => (
              <li key={t.key} className="group flex items-start">
                <button
                  type="button"
                  onClick={() => navigate({ to: "/jira/$ticketKey", params: { ticketKey: t.key } })}
                  className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-left hover:bg-muted"
                  title="Open details"
                >
                  <span className="font-mono text-[11px] text-muted-foreground">{t.key}</span>
                  {t.status ? (
                    <span className="ml-1 rounded bg-muted px-1 text-[10px] text-muted-foreground">
                      {t.status}
                    </span>
                  ) : null}
                  <span className="block truncate text-foreground text-xs">{t.summary}</span>
                </button>
                <button
                  type="button"
                  onClick={() => addToChat(t)}
                  disabled={!inThread}
                  className="mt-1 mr-1 rounded-md p-1 opacity-0 transition group-hover:opacity-100 hover:bg-muted disabled:opacity-30"
                  title={inThread ? "Add to chat" : "Open a thread first"}
                >
                  <PlusIcon className="size-3.5 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
