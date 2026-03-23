#!/usr/bin/env bash
set -euo pipefail

# Create Claude Code directories on the host if necessary.
mkdir -p "${HOME}/.config/claude/commands"
for f in settings.json .credentials.json .claude.json; do
  [ -f "${HOME}/.config/claude/$f" ] || echo '{}' > "${HOME}/.config/claude/$f"
done
touch "${HOME}/.config/claude/CLAUDE.md"

# Create shared profile directory on the host if necessary.
mkdir -p "${HOME}/.local/share/threema-desktop-devcontainer/ThreemaDesktop"

# On non-Wayland hosts (macOS, X11 Linux), create a dummy path so the Wayland bind mount in
# `devcontainer.json` resolves to a valid file.
if [ -z "${WAYLAND_DISPLAY:-}" ]; then
    mkdir -p /tmp/devcontainer-no-wayland
    touch /tmp/devcontainer-no-wayland/no-wayland
fi
