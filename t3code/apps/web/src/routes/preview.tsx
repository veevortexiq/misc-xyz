import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ExternalLinkIcon, RefreshCwIcon, GlobeIcon } from "lucide-react";

/**
 * vArena in-app preview — full-page route at /preview.
 *
 * Shows a local app (e.g. a Next dev server) in an iframe. The app is served at its
 * own origin via the gateway preview proxy (PREVIEW_PORT → PREVIEW_TARGET), so the
 * app's relative /api calls resolve to the app itself, not to vArena.
 *
 * Default URL comes from VITE_PREVIEW_URL (baked at build); it can be overridden in the
 * URL bar. External sites that send X-Frame-Options/CSP frame-ancestors will refuse to
 * embed — this pane is intended for local/dev apps you control.
 */

const DEFAULT_PREVIEW_URL =
  (import.meta.env.VITE_PREVIEW_URL as string | undefined)?.trim() || "";

function PreviewRoute() {
  const [url, setUrl] = useState<string>(DEFAULT_PREVIEW_URL);
  const [draft, setDraft] = useState<string>(DEFAULT_PREVIEW_URL);
  const [reloadKey, setReloadKey] = useState(0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = draft.trim();
    setUrl(next);
    setReloadKey((k) => k + 1);
  };

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-background text-foreground">
      <header className="flex items-center gap-2 border-input border-b px-4 py-3">
        <GlobeIcon className="size-5 text-muted-foreground" />
        <h1 className="font-semibold text-sm">Preview</h1>
        <form onSubmit={submit} className="ml-2 flex flex-1 items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            placeholder="http://… (your app)"
            className="flex-1 rounded-md border border-input bg-card px-2 py-1 font-mono text-xs outline-none focus:border-ring"
          />
          <button
            type="submit"
            className="rounded-md border border-input px-2 py-1 text-xs hover:bg-muted"
          >
            Go
          </button>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="inline-flex items-center rounded-md border border-input p-1.5 hover:bg-muted"
            title="Reload"
          >
            <RefreshCwIcon className="size-3.5" />
          </button>
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-md border border-input p-1.5 hover:bg-muted"
              title="Open in new tab"
            >
              <ExternalLinkIcon className="size-3.5" />
            </a>
          ) : null}
        </form>
      </header>

      <div className="min-h-0 flex-1">
        {url ? (
          <iframe
            key={reloadKey}
            src={url}
            title="App preview"
            className="h-full w-full border-0 bg-white"
            allow="clipboard-read; clipboard-write; fullscreen"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-muted-foreground text-sm">
            Enter your app URL above (e.g. the gateway preview origin) to load it here.
          </div>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/preview")({
  component: PreviewRoute,
});
