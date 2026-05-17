#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

D1_DATABASE="${HALOPRESS_D1_DATABASE:-DB}"
DEPLOY_ARGS=()
MIGRATION_ARGS=()
CONFIG_PATH="wrangler.toml"
ENV_NAME=""
DRY_RUN=0

if [ "$#" -gt 0 ] && [[ "$1" != -* ]]; then
  D1_DATABASE="$1"
  shift
fi

while [ "$#" -gt 0 ]; do
  case "$1" in
    --)
      shift
      ;;
    --dry-run|--dry-run=true)
      DRY_RUN=1
      DEPLOY_ARGS+=("$1")
      shift
      ;;
    --env|-e|--config|-c|--env-file)
      flag="$1"
      DEPLOY_ARGS+=("$flag")
      MIGRATION_ARGS+=("$flag")
      shift
      if [ "$#" -eq 0 ]; then
        echo "Missing value for ${flag}" >&2
        exit 1
      fi
      if [ "$flag" = "--env" ] || [ "$flag" = "-e" ]; then
        ENV_NAME="$1"
      elif [ "$flag" = "--config" ] || [ "$flag" = "-c" ]; then
        CONFIG_PATH="$1"
      fi
      DEPLOY_ARGS+=("$1")
      MIGRATION_ARGS+=("$1")
      shift
      ;;
    --env=*|-e=*|--config=*|-c=*|--env-file=*)
      case "$1" in
        --env=*)
          ENV_NAME="${1#--env=}"
          ;;
        -e=*)
          ENV_NAME="${1#-e=}"
          ;;
        --config=*)
          CONFIG_PATH="${1#--config=}"
          ;;
        -c=*)
          CONFIG_PATH="${1#-c=}"
          ;;
      esac
      DEPLOY_ARGS+=("$1")
      MIGRATION_ARGS+=("$1")
      shift
      ;;
    *)
      DEPLOY_ARGS+=("$1")
      shift
      ;;
  esac
done

run_deploy() {
  if [ "${#DEPLOY_ARGS[@]}" -gt 0 ]; then
    HALOPRESS_SKIP_WRANGLER_BUILD=1 pnpm wrangler deploy "${DEPLOY_ARGS[@]}"
  else
    HALOPRESS_SKIP_WRANGLER_BUILD=1 pnpm wrangler deploy
  fi
}

run_migrations() {
  if [ "${#MIGRATION_ARGS[@]}" -gt 0 ]; then
    pnpm wrangler d1 migrations apply "${D1_DATABASE}" --remote "${MIGRATION_ARGS[@]}"
  else
    pnpm wrangler d1 migrations apply "${D1_DATABASE}" --remote
  fi
}

has_database_id() {
  if [ ! -f "$CONFIG_PATH" ]; then
    echo "Wrangler config not found: ${CONFIG_PATH}" >&2
    exit 1
  fi

  if [ -n "$ENV_NAME" ]; then
    awk -v env="$ENV_NAME" '
      /^[[:space:]]*\[\[/ {
        header = $0
        gsub(/[[:space:]]/, "", header)
        in_d1 = (header == "[[env." env ".d1_databases]]")
      }
      in_d1 && /^[[:space:]]*database_id[[:space:]]*=/ {
        value = $0
        sub(/^[^=]*=/, "", value)
        gsub(/[[:space:]"\047]/, "", value)
        if (value != "" && value !~ /^<.*>$/) {
          found = 1
        }
      }
      END { exit found ? 0 : 1 }
    ' "$CONFIG_PATH"
  else
    awk '
      /^[[:space:]]*\[\[/ {
        header = $0
        gsub(/[[:space:]]/, "", header)
        in_d1 = (header == "[[d1_databases]]")
      }
      in_d1 && /^[[:space:]]*database_id[[:space:]]*=/ {
        value = $0
        sub(/^[^=]*=/, "", value)
        gsub(/[[:space:]"\047]/, "", value)
        if (value != "" && value !~ /^<.*>$/) {
          found = 1
        }
      }
      END { exit found ? 0 : 1 }
    ' "$CONFIG_PATH"
  fi
}

if [ "${HALOPRESS_SKIP_BUILD:-}" = "1" ]; then
  echo "Skipping Nuxt build because HALOPRESS_SKIP_BUILD=1."
else
  echo "Building Nuxt output..."
  pnpm build
fi

if [ "$DRY_RUN" = "1" ]; then
  echo "Running Wrangler deploy dry run..."
  run_deploy
  echo "Skipping D1 migrations because --dry-run was provided."
  exit 0
fi

if has_database_id; then
  echo "Applying D1 migrations (remote) for ${D1_DATABASE}..."
  run_migrations

  echo "Deploying worker..."
  run_deploy
else
  echo "Deploying worker to provision Cloudflare bindings..."
  run_deploy

  echo "Applying D1 migrations (remote) for ${D1_DATABASE}..."
  run_migrations

  echo "Redeploying worker after migrations..."
  run_deploy
fi
