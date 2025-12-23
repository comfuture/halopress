#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DB_NAME="${1:-}"
if [ -z "$DB_NAME" ] && [ -f wrangler.toml ]; then
  if command -v rg >/dev/null 2>&1; then
    DB_NAME="$(rg -No 'database_name\\s*=\\s*\"([^\"]+)\"' -r '$1' wrangler.toml | head -n 1 || true)"
  else
    DB_NAME="$(grep -E 'database_name\\s*=\\s*\"[^\"]+\"' wrangler.toml | sed -E 's/.*\"([^\"]+)\".*/\\1/' | head -n 1 || true)"
  fi
fi

if [ -z "$DB_NAME" ]; then
  echo "Usage: $0 <D1_DATABASE_NAME>" >&2
  echo "Or set database_name in wrangler.toml." >&2
  exit 1
fi

echo "Building Nuxt output..."
pnpm build

echo "Applying D1 migrations (remote) for ${DB_NAME}..."
npx wrangler d1 migrations apply "${DB_NAME}" --remote

echo "Deploying worker..."
npx wrangler deploy
