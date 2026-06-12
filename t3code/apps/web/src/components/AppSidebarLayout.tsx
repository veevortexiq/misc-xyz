import { useEffect, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { FolderIcon, GlobeIcon } from "lucide-react";

import ThreadSidebar from "./Sidebar";
import { Sidebar, SidebarProvider, SidebarRail } from "./ui/sidebar";
import {
  clearShortcutModifierState,
  syncShortcutModifierStateFromKeyboardEvent,
} from "../shortcutModifierState";

const THREAD_SIDEBAR_WIDTH_STORAGE_KEY = "chat_thread_sidebar_width";
const THREAD_SIDEBAR_MIN_WIDTH = 13 * 16;
const THREAD_MAIN_CONTENT_MIN_WIDTH = 40 * 16;
export function AppSidebarLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      syncShortcutModifierStateFromKeyboardEvent(event);
    };
    const onWindowKeyUp = (event: KeyboardEvent) => {
      syncShortcutModifierStateFromKeyboardEvent(event);
    };
    const onWindowBlur = () => {
      clearShortcutModifierState();
    };

    window.addEventListener("keydown", onWindowKeyDown, true);
    window.addEventListener("keyup", onWindowKeyUp, true);
    window.addEventListener("blur", onWindowBlur);

    return () => {
      window.removeEventListener("keydown", onWindowKeyDown, true);
      window.removeEventListener("keyup", onWindowKeyUp, true);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, []);

  useEffect(() => {
    const onMenuAction = window.desktopBridge?.onMenuAction;
    if (typeof onMenuAction !== "function") {
      return;
    }

    const unsubscribe = onMenuAction((action) => {
      if (action === "open-settings") {
        void navigate({ to: "/settings" });
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [navigate]);

  return (
    <SidebarProvider className="h-dvh! min-h-0!" defaultOpen>
      <Sidebar
        side="left"
        collapsible="offcanvas"
        className="border-r border-border bg-card text-foreground"
        resizable={{
          minWidth: THREAD_SIDEBAR_MIN_WIDTH,
          shouldAcceptWidth: ({ nextWidth, wrapper }) =>
            wrapper.clientWidth - nextWidth >= THREAD_MAIN_CONTENT_MIN_WIDTH,
          storageKey: THREAD_SIDEBAR_WIDTH_STORAGE_KEY,
        }}
      >
        <div className="flex gap-1 border-border border-b px-2 py-2">
          <Link
            to="/files"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs hover:bg-muted"
          >
            <FolderIcon className="size-3.5" /> Files
          </Link>
          <Link
            to="/preview"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs hover:bg-muted"
          >
            <GlobeIcon className="size-3.5" /> Preview
          </Link>
        </div>
        <ThreadSidebar />
        <SidebarRail />
      </Sidebar>
      {children}
    </SidebarProvider>
  );
}
