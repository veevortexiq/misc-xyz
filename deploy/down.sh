#!/usr/bin/env bash
# Teardown: remove today's vArena deploy. Keeps ~/.varena-secrets, Node, vp, Firebase, repo, NSG.
# Does NOT touch the orchestrator (8080) or Caddy/domain.
set -euo pipefail

if [ ! -d "$HOME/.varena-secrets" ]; then
  echo "WARNING: ~/.varena-secrets not found — run init-secrets.sh FIRST or redeploy will need secrets re-entered."
  read -r -p "Continue teardown anyway? [y/N] " ans
  [ "$ans" = "y" ] || exit 1
fi

sudo systemctl disable --now varena-gateway varena 2>/dev/null || true
sudo rm -f /etc/systemd/system/varena.service /etc/systemd/system/varena-gateway.service
sudo systemctl daemon-reload
rm -rf "$HOME/varena"

# Project workspaces to delete (vArena projects living outside ~/varena). EXPLICIT list only —
# never touch ~/app (orchestrator), ~/vse (caddy), ~/node_modules, ~/.varena-secrets.
PROJECT_DIRS=(
  "$HOME/FolderVEe"
  "$HOME/Hey"
)
for d in "${PROJECT_DIRS[@]}"; do
  if [ -e "$d" ]; then rm -rf "$d"; echo "deleted project: $d"; fi
done

echo "vArena removed + project workspaces deleted. Secrets kept in ~/.varena-secrets."
echo "Orchestrator (8080) + Caddy domain untouched. Redeploy: bash deploy/up.sh (after cloning)."
