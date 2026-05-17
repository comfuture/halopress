#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

D1_DATABASE="${HALOPRESS_D1_DATABASE:-DB}"

if [ "$#" -gt 0 ] && [[ "$1" != -* ]]; then
  D1_DATABASE="$1"
  shift
fi

if [ "${HALOPRESS_SKIP_BUILD:-}" = "1" ]; then
  echo "Skipping Nuxt build because HALOPRESS_SKIP_BUILD=1."
else
  echo "Building Nuxt output..."
  pnpm build
fi

echo "Deploying worker and provisioning Cloudflare bindings..."
HALOPRESS_SKIP_WRANGLER_BUILD=1 pnpm wrangler deploy "$@"

echo "Applying D1 migrations (remote) for ${D1_DATABASE}..."
pnpm wrangler d1 migrations apply "${D1_DATABASE}" --remote
