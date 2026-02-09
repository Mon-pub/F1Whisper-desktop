#!/usr/bin/env bash
set -euo pipefail

# Create OpenCode directories on the host if necessary.
mkdir -p "${HOME}/.config/opencode"
mkdir -p "${HOME}/.local/share/opencode"
touch "${HOME}/.local/share/opencode/auth.json"

# Create shared profile directory on the host if necessary.
mkdir -p "${HOME}/.local/share/threema-desktop-devcontainer/ThreemaDesktop"

# On non-Wayland hosts (macOS, X11 Linux), create a dummy path so the Wayland bind mount in
# `devcontainer.json` resolves to a valid file.
if [ -z "${WAYLAND_DISPLAY:-}" ]; then
    mkdir -p /tmp/devcontainer-no-wayland
    touch /tmp/devcontainer-no-wayland/no-wayland
fi
