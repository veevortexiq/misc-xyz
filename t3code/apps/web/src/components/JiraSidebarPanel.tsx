import { useCallback, useEffect, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { ChevronDownIcon, ChevronRightIcon, ExternalLinkIcon, RefreshCwIcon } from "lucide-react";

import { scopeThreadRef } from "@t3tools/client-runtime";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";

import { useComposerDraftStore } from "../composerDraftStore";

/**
 * vArena Jira panel — sidebar mode listing Jira tickets (via the gateway /__varena/jira/tickets,
 * which holds the token server-side). Expand a ticket to read its description; "Add to chat"
 * inserts the ticket + description into the active thread's composer.
 */

type Ticket = {
  key: string;
  summary: string;
  status: string;
  description: string;
  url: string;
};

export function JiraSidebarPanel() {
  const params = useParams({ strict: false }) as { environmentId?: string; threadId?: string };
  const environmentId = params.environmentId as EnvironmentId | undefined;
  const threadId = params.threadId as ThreadId | undefined;
  const inThread = Boolean(environmentId && threadId);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/__varena/jira/tickets", { headers: { Accept: "application/json" } });
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
    void load();
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
      <div className="flex items-center gap-2 border-border border-b px-3 py-2">
        <span className="flex-1 font-medium text-foreground text-xs">Jira tickets</span>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center rounded-md border border-input p-1 hover:bg-muted"
          title="Refresh"
        >
          <RefreshCwIcon className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
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
            {tickets.map((t) => {
              const open = expanded === t.key;
              return (
                <li key={t.key} className="rounded-md">
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : t.key)}
                    className="flex w-full items-start gap-1.5 rounded-md px-2 py-1.5 text-left hover:bg-muted"
                  >
                    {open ? (
                      <ChevronDownIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRightIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="font-mono text-[11px] text-muted-foreground">{t.key}</span>
                      {t.status ? (
                        <span className="ml-1 rounded bg-muted px-1 text-[10px] text-muted-foreground">
                          {t.status}
                        </span>
                      ) : null}
                      <span className="block truncate text-foreground text-xs">{t.summary}</span>
                    </span>
                  </button>
                  {open ? (
                    <div className="px-2 pb-2">
                      <pre className="whitespace-pre-wrap break-words rounded-md bg-card/50 p-2 text-[11px] text-muted-foreground">
                        {t.description || "(no description)"}
                      </pre>
                      <div className="mt-1 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => addToChat(t)}
                          disabled={!inThread}
                          className="rounded-md bg-primary px-2 py-1 font-medium text-[11px] text-primary-foreground hover:opacity-90 disabled:opacity-50"
                          title={inThread ? "Add to chat" : "Open a thread first"}
                        >
                          Add to chat
                        </button>
                        <a
                          href={t.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                        >
                          Open <ExternalLinkIcon className="size-3" />
                        </a>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
