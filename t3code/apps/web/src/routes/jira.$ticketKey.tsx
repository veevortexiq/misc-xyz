import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react";

type Ticket = { key: string; summary: string; status: string; description: string; url: string };

function JiraTicketRoute() {
  const navigate = useNavigate();
  const { ticketKey } = Route.useParams();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const resp = await fetch(`/__varena/jira/tickets?q=${encodeURIComponent(ticketKey)}`, {
          headers: { Accept: "application/json" },
        });
        const body = await resp.json();
        if (cancelled) return;
        if (body.error) {
          setError(String(body.error));
        } else {
          const list: Ticket[] = Array.isArray(body.tickets) ? body.tickets : [];
          setTicket(list.find((t) => t.key === ticketKey) ?? list[0] ?? null);
        }
      } catch {
        if (!cancelled) setError("Request failed.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ticketKey]);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-background text-foreground">
      <header className="flex items-center gap-2 border-input border-b px-4 py-3">
        <button
          type="button"
          onClick={() => navigate({ to: "/" })}
          className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-muted"
          title="Back to chat"
        >
          <ArrowLeftIcon className="size-3.5" /> Chat
        </button>
        <span className="font-mono text-foreground text-sm">{ticketKey}</span>
        {ticket?.status ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">
            {ticket.status}
          </span>
        ) : null}
        <div className="flex-1" />
        {ticket?.url ? (
          <a
            href={ticket.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-muted"
          >
            Open in Jira <ExternalLinkIcon className="size-3.5" />
          </a>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
        {loading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : error ? (
          <p className="text-destructive text-sm">{error}</p>
        ) : ticket ? (
          <div className="mx-auto max-w-3xl">
            <h1 className="font-semibold text-foreground text-lg">{ticket.summary}</h1>
            <pre className="mt-4 whitespace-pre-wrap break-words font-sans text-foreground/90 text-sm leading-relaxed">
              {ticket.description || "(no description)"}
            </pre>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Ticket not found.</p>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/jira/$ticketKey")({
  component: JiraTicketRoute,
});
