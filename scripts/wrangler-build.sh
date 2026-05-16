#!/usr/bin/env bash
set -euo pipefail

if [ "${HALOPRESS_SKIP_WRANGLER_BUILD:-}" = "1" ]; then
  echo "Skipping Wrangler build hook because HALOPRESS_SKIP_WRANGLER_BUILD=1."
  exit 0
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

D1_DATABASE="${HALOPRESS_D1_DATABASE:-DB}"

echo "Building Nuxt output for Cloudflare Workers..."
pnpm build

if [ "${WRANGLER_COMMAND:-}" = "deploy" ]; then
  echo "Applying D1 migrations (remote) for ${D1_DATABASE}..."
  pnpm wrangler d1 migrations apply "${D1_DATABASE}" --remote
fi
