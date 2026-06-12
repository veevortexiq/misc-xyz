import { createFileRoute } from "@tanstack/react-router";

import { SourceControlSettingsPanel } from "../components/settings/SourceControlSettings";
import { VarenaGitTokenCard } from "../components/settings/VarenaGitTokenCard";

function SourceControlSettingsRoute() {
  return (
    <div className="flex flex-col gap-4">
      <VarenaGitTokenCard />
      <SourceControlSettingsPanel />
    </div>
  );
}

export const Route = createFileRoute("/settings/source-control")({
  component: SourceControlSettingsRoute,
});
