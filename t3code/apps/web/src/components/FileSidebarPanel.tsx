import { useCallback, useEffect, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { ChevronRightIcon, ChevronUpIcon, RefreshCwIcon } from "lucide-react";

import { scopeThreadRef } from "@t3tools/client-runtime";
import type { EnvironmentId, FilesystemBrowseResult, ThreadId } from "@t3tools/contracts";

import {
  getPrimaryEnvironmentConnection,
  subscribeEnvironmentConnections,
} from "../environments/runtime";
import { readEnvironmentApi } from "../environmentApi";
import { useComposerDraftStore } from "../composerDraftStore";

/**
 * vArena file panel — replaces the thread list in the sidebar when in "Files" mode.
 * Lists workspace entries; clicking a name inserts it as an @path reference into the
 * active thread's chat composer. A drill-in chevron navigates into folders.
 */

const ROOT = (import.meta.env.VITE_WORKSPACE_ROOT as string | undefined)?.trim() || "/";

function parentOf(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  if (idx <= 0) return "/";
  return trimmed.slice(0, idx);
}

export function FileSidebarPanel() {
  const params = useParams({ strict: false }) as {
    environmentId?: string;
    threadId?: string;
  };
  const threadEnvironmentId = params.environmentId as EnvironmentId | undefined;
  const threadId = params.threadId as ThreadId | undefined;
  const inThread = Boolean(threadEnvironmentId && threadId);

  const [primaryEnvId, setPrimaryEnvId] = useState<EnvironmentId | null>(
    () => getPrimaryEnvironmentConnection()?.environmentId ?? null,
  );
  useEffect(() => {
    const update = () => setPrimaryEnvId(getPrimaryEnvironmentConnection()?.environmentId ?? null);
    update();
    return subscribeEnvironmentConnections(update);
  }, []);

  const browseEnvId = threadEnvironmentId ?? primaryEnvId ?? undefined;
  const api = browseEnvId ? readEnvironmentApi(browseEnvId) : undefined;

  const [path, setPath] = useState<string>(ROOT);
  const browseDir = path.endsWith("/") ? path : `${path}/`;
  const [data, setData] = useState<FilesystemBrowseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    setError(null);
    try {
      setData(await api.filesystem.browse({ partialPath: browseDir }));
    } catch (e) {
      setError((e as Error)?.message ?? "Could not read this folder.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [api, browseDir]);

  useEffect(() => {
    void load();
  }, [load]);

  const addToChat = useCallback(
    (fullPath: string) => {
      if (!threadEnvironmentId || !threadId) return;
      const ref = scopeThreadRef(threadEnvironmentId, threadId);
      const store = useComposerDraftStore.getState();
      const current = store.getComposerDraft(ref)?.prompt ?? "";
      const next = current.trim().length > 0 ? `${current.trimEnd()} @${fullPath} ` : `@${fullPath} `;
      store.setPrompt(ref, next);
    },
    [threadEnvironmentId, threadId],
  );

  const entries = data?.entries ?? [];
  const currentDir = data?.parentPath ?? path;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 border-border border-b px-2 py-2">
        <button
          type="button"
          onClick={() => setPath(parentOf(path))}
          disabled={currentDir === ROOT || currentDir === "/"}
          className="inline-flex items-center rounded-md border border-input p-1 text-xs hover:bg-muted disabled:opacity-40"
          title="Up"
        >
          <ChevronUpIcon className="size-3.5" />
        </button>
        <span className="flex-1 truncate font-mono text-muted-foreground text-xs" title={currentDir}>
          {currentDir}
        </span>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center rounded-md border border-input p-1 hover:bg-muted"
          title="Refresh"
        >
          <RefreshCwIcon className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {!inThread ? (
        <p className="px-3 py-3 text-muted-foreground text-xs">
          Open a thread to add files to the chat.
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto p-1">
        {!api ? (
          <p className="px-2 py-6 text-center text-muted-foreground text-xs">Connecting…</p>
        ) : error ? (
          <p className="px-2 py-6 text-center text-destructive text-xs">{error}</p>
        ) : loading ? (
          <p className="px-2 py-6 text-center text-muted-foreground text-xs">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="px-2 py-6 text-center text-muted-foreground text-xs">Empty.</p>
        ) : (
          <ul className="flex flex-col">
            {entries.map((entry) => (
              <li key={entry.fullPath} className="group flex items-center">
                <button
                  type="button"
                  onClick={() => addToChat(entry.fullPath)}
                  disabled={!inThread}
                  className="flex-1 truncate rounded-md px-2 py-1 text-left text-xs hover:bg-muted disabled:opacity-60"
                  title={inThread ? "Add to chat" : "Open a thread first"}
                >
                  {entry.name}
                </button>
                <button
                  type="button"
                  onClick={() => setPath(entry.fullPath)}
                  className="mr-1 rounded-md p-1 opacity-0 transition group-hover:opacity-100 hover:bg-muted"
                  title="Open folder"
                >
                  <ChevronRightIcon className="size-3.5 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
