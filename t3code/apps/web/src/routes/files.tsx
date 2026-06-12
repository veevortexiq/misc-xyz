import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronUpIcon, FolderIcon, RefreshCwIcon, CopyIcon } from "lucide-react";

import type { EnvironmentId, FilesystemBrowseResult } from "@t3tools/contracts";
import {
  getPrimaryEnvironmentConnection,
  subscribeEnvironmentConnections,
} from "../environments/runtime";
import { readEnvironmentApi } from "../environmentApi";

/**
 * vArena file browser — full-page route at /files.
 *
 * Navigates the shared instance's filesystem using the `filesystem.browse` RPC
 * (the same call the command palette uses for path completion). v1 is navigation
 * only: directory listing, drill-in, breadcrumb, copy-path. A content viewer would
 * need a new server-side read-file RPC (not currently exposed over WebSocket).
 */

function usePrimaryEnvironmentId(): EnvironmentId | null {
  const [id, setId] = useState<EnvironmentId | null>(
    () => getPrimaryEnvironmentConnection()?.environmentId ?? null,
  );
  useEffect(() => {
    const update = () => setId(getPrimaryEnvironmentConnection()?.environmentId ?? null);
    update();
    return subscribeEnvironmentConnections(update);
  }, []);
  return id;
}

function parentOf(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  if (idx <= 0) return "/";
  return trimmed.slice(0, idx);
}

function FileBrowserRoute() {
  const environmentId = usePrimaryEnvironmentId();
  const api = environmentId ? readEnvironmentApi(environmentId) : undefined;

  const [path, setPath] = useState<string>("/");
  const [pathInput, setPathInput] = useState<string>("/");

  const browseDir = useMemo(() => (path.endsWith("/") ? path : `${path}/`), [path]);

  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: ["varenaFileBrowser", environmentId, browseDir],
    queryFn: async (): Promise<FilesystemBrowseResult | null> => {
      if (!api) return null;
      return api.filesystem.browse({ partialPath: browseDir });
    },
    enabled: Boolean(api) && browseDir.length > 0,
    staleTime: 5_000,
  });

  const navigate = useCallback((next: string) => {
    setPath(next);
    setPathInput(next);
  }, []);

  const entries = data?.entries ?? [];
  const currentDir = data?.parentPath ?? path;

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <header className="flex items-center gap-2 border-input border-b px-4 py-3">
        <FolderIcon className="size-5 text-muted-foreground" />
        <h1 className="font-semibold text-sm">Files</h1>
        <div className="ml-2 flex flex-1 items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(parentOf(path))}
            disabled={currentDir === "/"}
            className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-muted disabled:opacity-40"
            title="Up one level"
          >
            <ChevronUpIcon className="size-3.5" /> Up
          </button>
          <form
            className="flex flex-1 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(pathInput.trim() || "/");
            }}
          >
            <input
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              spellCheck={false}
              className="flex-1 rounded-md border border-input bg-card px-2 py-1 font-mono text-xs outline-none focus:border-ring"
              placeholder="/absolute/path"
            />
          </form>
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center rounded-md border border-input p-1.5 hover:bg-muted"
            title="Refresh"
          >
            <RefreshCwIcon className={`size-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      <div className="px-4 py-2 font-mono text-muted-foreground text-xs">{currentDir}</div>

      <div className="min-h-0 flex-1 overflow-auto px-2 pb-4">
        {!api ? (
          <p className="px-2 py-8 text-center text-muted-foreground text-sm">
            Waiting for vArena connection…
          </p>
        ) : error ? (
          <p className="px-2 py-8 text-center text-sm text-destructive">
            {(error as Error)?.message ?? "Could not read this directory."}
          </p>
        ) : isPending ? (
          <p className="px-2 py-8 text-center text-muted-foreground text-sm">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="px-2 py-8 text-center text-muted-foreground text-sm">Empty directory.</p>
        ) : (
          <ul className="flex flex-col">
            {entries.map((entry) => (
              <li key={entry.fullPath} className="group flex items-center">
                <button
                  type="button"
                  onClick={() => navigate(entry.fullPath)}
                  className="flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{entry.name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(entry.fullPath)}
                  className="mr-1 rounded-md p-1.5 opacity-0 transition group-hover:opacity-100 hover:bg-muted"
                  title="Copy path"
                >
                  <CopyIcon className="size-3.5 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/files")({
  component: FileBrowserRoute,
});
