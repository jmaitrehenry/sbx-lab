#!/usr/bin/env bash
# Starts the lab as a Labspace whose terminal runs on this machine:
#   - the bridge (bridge/server.js) on http://localhost:8085, natively, with your shell
#   - the Labspace interface in a container on http://localhost:3030
# Ctrl-C stops both.
#
# Running it again while the Labspace runs is safe: it reuses the running bridge, makes sure the
# interface is up, opens the browser and returns.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
export BRIDGE_PORT="${BRIDGE_PORT:-8085}"
url="http://localhost:3030"
export LABSPACE_INTERFACE_IMAGE="${LABSPACE_INTERFACE_IMAGE:-dockersamples/labspace-interface:latest}"

command -v node >/dev/null || { echo "Node.js 20+ is required for the bridge." >&2; exit 1; }
command -v docker >/dev/null || { echo "Docker is required for the Labspace interface." >&2; exit 1; }

# The token the interface sends to the bridge with every Run and Save. It is kept in a file
# (readable by you only), so that the bridge and the interface of every start agree on it.
token_file="$here/.token"
if [ ! -s "$token_file" ]; then
  (umask 077 && node -e 'console.log(require("crypto").randomBytes(24).toString("hex"))' > "$token_file")
fi
LABSPACE_TOKEN="$(cat "$token_file")"
export LABSPACE_TOKEN

open_browser() {
  if [ -n "${LABSPACE_NO_OPEN:-}" ]; then :
  elif command -v open >/dev/null; then open "$url"
  elif command -v xdg-open >/dev/null; then xdg-open "$url" >/dev/null 2>&1
  elif command -v cmd.exe >/dev/null; then cmd.exe //c start "" "$url" # Windows (Git Bash)
  fi
}

# The interface's own index.html, with theme.css added: it gives the Labspace the look of the
# simulated lab. Taken from the image, so it always matches the image's assets.
docker image inspect "$LABSPACE_INTERFACE_IMAGE" >/dev/null 2>&1 || docker pull -q "$LABSPACE_INTERFACE_IMAGE" >/dev/null
# On Windows, Git Bash (MSYS) rewrites arguments that look like Unix paths into Windows paths
# ("/bin/cat" becomes "C:/Program Files/Git/usr/bin/cat"): these are paths in the container.
MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL="*" \
  docker run --rm --entrypoint /bin/cat "$LABSPACE_INTERFACE_IMAGE" /usr/local/app/public/index.html \
  | node "$here/content.mjs" --themed-index "$here/.ui/index.html"

# Already running? Then the bridge answers its health check: keep it and its shells, make sure the
# interface is up (Compose leaves it alone when nothing changed), and leave the running start in
# charge of stopping everything.
if curl -fsS --max-time 2 "http://127.0.0.1:$BRIDGE_PORT/healthz" >/dev/null 2>&1; then
  docker compose -f "$here/compose.yaml" up -d --pull missing --wait
  echo
  echo "Labspace already running: $url"
  echo "Stop it with Ctrl-C where it was started."
  open_browser
  exit 0
fi
if (exec 3<>"/dev/tcp/127.0.0.1/$BRIDGE_PORT") 2>/dev/null; then
  echo "Port $BRIDGE_PORT is used by another program: stop it, or start with BRIDGE_PORT set to a free port." >&2
  exit 1
fi

if [ ! -d "$here/bridge/node_modules/yaml" ]; then
  echo "Installing the bridge dependencies..."
  (cd "$here/bridge" && npm install --no-audit --no-fund --loglevel=error)
fi
# node-pty ships macOS and Windows binaries; its install script, which recent npm versions may skip,
# is what makes the macOS helper executable.
chmod +x "$here"/bridge/node_modules/node-pty/prebuilds/darwin-*/spawn-helper 2>/dev/null || true

cleanup() {
  trap - EXIT INT TERM
  echo
  echo "Stopping..."
  docker compose -f "$here/compose.yaml" down --remove-orphans >/dev/null 2>&1 || true
  [ -n "${bridge_pid:-}" ] && kill "$bridge_pid" 2>/dev/null || true
  [ -n "${content_pid:-}" ] && kill "$content_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# instructions/ as the Labspace shows it (without the GitHub navigation footers), kept current
node "$here/content.mjs" "$here/.content"
node "$here/content.mjs" "$here/.content" --watch &
content_pid=$!

node "$here/bridge/server.js" &
bridge_pid=$!

docker compose -f "$here/compose.yaml" up -d --pull missing --wait

echo
echo "Labspace ready: $url"
echo "The right panel is a terminal on this machine. Ctrl-C to stop."
open_browser

wait "$bridge_pid"
