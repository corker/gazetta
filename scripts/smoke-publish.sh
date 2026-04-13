#!/usr/bin/env bash
#
# Pre-publish smoke test for the gazetta npm package.
#
# - Builds the package + admin bundle
# - `npm pack`s it into a tarball
# - Installs the tarball into a temp project as if it were from npm
# - Runs `gazetta init` and `gazetta dev`
# - HTTP-checks site root + admin + admin API
#
# Run locally: npm run smoke       (uses port 3999)
#              SMOKE_PORT=4444 npm run smoke
#
# CI: called from .github/workflows/publish.yml before `npm publish`.
# If this fails, the version does not ship.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${SMOKE_PORT:-3999}"
SMOKE_DIR="$(mktemp -d -t gazetta-smoke-XXXXXX 2>/dev/null || mktemp -d)"

DEV_PID=""

cleanup() {
  local exit_code=$?
  if [ -n "$DEV_PID" ] && kill -0 "$DEV_PID" 2>/dev/null; then
    kill "$DEV_PID" 2>/dev/null || true
    wait "$DEV_PID" 2>/dev/null || true
  fi
  rm -rf "$SMOKE_DIR"
  if [ "$exit_code" -ne 0 ]; then
    echo "✗ smoke failed (exit $exit_code)"
  fi
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

# ── 1. Build & pack ──────────────────────────────────────────────
step "Build gazetta package"
cd "$REPO_ROOT"
npm run build -w packages/gazetta
npm run build:admin -w packages/gazetta

step "npm pack"
cd "$REPO_ROOT/packages/gazetta"
TARBALL_NAME="$(npm pack --silent | tail -1)"
# Use file:// URL so npm install accepts the path the same way on all OSes
# (Windows path quirks with backslashes etc.)
TARBALL_ABS="$REPO_ROOT/packages/gazetta/$TARBALL_NAME"
trap 'rm -f "$TARBALL_ABS"; cleanup' EXIT INT TERM
echo "tarball: $TARBALL_ABS"

# ── 2. Init a fresh project using the tarball ────────────────────
step "gazetta init from tarball"
cd "$SMOKE_DIR"
# `gazetta init` creates the directory and scaffolds files; it auto-runs
# `npm install` at the end using 'gazetta' from npm. We need it to use
# OUR tarball instead. Strategy: run init, then overwrite the dep and
# reinstall.
npx --package="$TARBALL_ABS" -y gazetta init my-site

step "Install local tarball into generated project"
cd "$SMOKE_DIR/my-site"
# Overwrite admin/ and templates/ gazetta deps to use the tarball
for ws in admin templates; do
  if [ -d "$ws" ]; then
    (cd "$ws" && npm install "$TARBALL_ABS" --no-save --silent)
  fi
done

# ── 3. Start dev server ──────────────────────────────────────────
step "Start gazetta dev on port $PORT"
LOG="$SMOKE_DIR/dev.log"

# On Windows the bin is .cmd; elsewhere it's a symlink to the JS entry.
if [ -f "./node_modules/.bin/gazetta.cmd" ]; then
  GAZETTA_BIN="./node_modules/.bin/gazetta.cmd"
else
  GAZETTA_BIN="./node_modules/.bin/gazetta"
fi

"$GAZETTA_BIN" dev --port "$PORT" > "$LOG" 2>&1 &
DEV_PID=$!

# ── 4. Wait for ready (up to 30s) ───────────────────────────────
step "Waiting for server ready..."
for i in $(seq 1 60); do
  if curl -fs "http://localhost:$PORT/admin" > /dev/null 2>&1; then
    echo "ready after ${i} tries"
    break
  fi
  if ! kill -0 "$DEV_PID" 2>/dev/null; then
    echo "✗ dev server died — log:"
    cat "$LOG"
    exit 1
  fi
  sleep 0.5
done

# ── 5. Assertions ────────────────────────────────────────────────
step "HTTP assertions"

# Site root returns HTML
body="$(curl -fsS "http://localhost:$PORT/" || true)"
if ! echo "$body" | grep -qi "<html"; then
  echo "✗ GET / did not return HTML"
  echo "body: ${body:0:200}"
  exit 1
fi
echo "✓ GET /"

# Admin returns HTML
body="$(curl -fsS "http://localhost:$PORT/admin" || true)"
if ! echo "$body" | grep -qi "<html"; then
  echo "✗ GET /admin did not return HTML"
  exit 1
fi
echo "✓ GET /admin"

# Admin API returns site manifest
body="$(curl -fsS "http://localhost:$PORT/admin/api/site" || true)"
if ! echo "$body" | grep -q "\"name\""; then
  echo "✗ GET /admin/api/site did not return site manifest"
  echo "body: $body"
  exit 1
fi
echo "✓ GET /admin/api/site"

# Pages list
body="$(curl -fsS "http://localhost:$PORT/admin/api/pages" || true)"
if ! echo "$body" | grep -q "home"; then
  echo "✗ GET /admin/api/pages did not list the home page"
  echo "body: $body"
  exit 1
fi
echo "✓ GET /admin/api/pages"

echo ""
echo "✓ smoke passed — tarball publishes a working package"
