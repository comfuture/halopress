#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

D1_DATABASE="${HALOPRESS_D1_DATABASE:-DB}"
DEPLOY_ARGS=()
MIGRATION_ARGS=()
D1_LIST_ARGS=()
FALLBACK_MIGRATION_ARGS=()
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
      D1_LIST_ARGS+=("$flag")
      shift
      if [ "$#" -eq 0 ]; then
        echo "Missing value for ${flag}" >&2
        exit 1
      fi
      if [ "$flag" = "--env" ] || [ "$flag" = "-e" ]; then
        ENV_NAME="$1"
        FALLBACK_MIGRATION_ARGS+=("$flag" "$1")
      elif [ "$flag" = "--config" ] || [ "$flag" = "-c" ]; then
        CONFIG_PATH="$1"
      elif [ "$flag" = "--env-file" ]; then
        FALLBACK_MIGRATION_ARGS+=("$flag" "$1")
      fi
      DEPLOY_ARGS+=("$1")
      MIGRATION_ARGS+=("$1")
      D1_LIST_ARGS+=("$1")
      shift
      ;;
    --env=*|-e=*|--config=*|-c=*|--env-file=*)
      case "$1" in
        --env=*)
          ENV_NAME="${1#--env=}"
          FALLBACK_MIGRATION_ARGS+=("$1")
          ;;
        -e=*)
          ENV_NAME="${1#-e=}"
          FALLBACK_MIGRATION_ARGS+=("$1")
          ;;
        --config=*)
          CONFIG_PATH="${1#--config=}"
          ;;
        -c=*)
          CONFIG_PATH="${1#-c=}"
          ;;
        --env-file=*)
          FALLBACK_MIGRATION_ARGS+=("$1")
          ;;
      esac
      DEPLOY_ARGS+=("$1")
      MIGRATION_ARGS+=("$1")
      D1_LIST_ARGS+=("$1")
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

d1_config_value() {
  local field="$1"

  if [ ! -f "$CONFIG_PATH" ]; then
    echo "Wrangler config not found: ${CONFIG_PATH}" >&2
    exit 1
  fi

  awk -v env="$ENV_NAME" -v target="$D1_DATABASE" -v field="$field" '
    function clean(value) {
      sub(/^[^=]*=/, "", value)
      sub(/[[:space:]]+#.*$/, "", value)
      gsub(/^[[:space:]"\047]+|[[:space:]"\047]+$/, "", value)
      return value
    }
    function reset_block() {
      in_target = 0
      scope = ""
      binding = ""
      database_name = ""
      database_id = ""
      migrations_dir = ""
    }
    function field_value() {
      if (field == "binding") return binding
      if (field == "database_name") return database_name
      if (field == "database_id") return database_id
      if (field == "migrations_dir") return migrations_dir
      return ""
    }
    function emit_if_match() {
      value = ""
      if (!in_target) return
      if (binding != target && database_name != target && target != "") return
      value = field_value()
      if (scope == "env" && value != "") {
        print value
        found = 1
        exit
      }
      if (scope == "top" && top_value == "") {
        top_value = value
      }
    }
    BEGIN { reset_block() }
    /^[[:space:]]*\[\[/ {
      emit_if_match()
      if (found) exit
      header = $0
      gsub(/[[:space:]]/, "", header)
      if (env != "" && header == "[[env." env ".d1_databases]]") {
        in_target = 1
        scope = "env"
      } else if (header == "[[d1_databases]]") {
        in_target = 1
        scope = "top"
      } else {
        in_target = 0
        scope = ""
      }
      binding = ""
      database_name = ""
      database_id = ""
      migrations_dir = ""
      next
    }
    in_target && /^[[:space:]]*binding[[:space:]]*=/ {
      binding = clean($0)
      next
    }
    in_target && /^[[:space:]]*database_name[[:space:]]*=/ {
      database_name = clean($0)
      next
    }
    in_target && /^[[:space:]]*database_id[[:space:]]*=/ {
      database_id = clean($0)
      next
    }
    in_target && /^[[:space:]]*migrations_dir[[:space:]]*=/ {
      migrations_dir = clean($0)
      next
    }
    END {
      if (!found) emit_if_match()
      if (!found && top_value != "") print top_value
    }
  ' "$CONFIG_PATH" | head -n 1
}

config_scalar_value() {
  local field="$1"

  if [ ! -f "$CONFIG_PATH" ]; then
    echo "Wrangler config not found: ${CONFIG_PATH}" >&2
    exit 1
  fi

  awk -v env="$ENV_NAME" -v field="$field" '
    function clean(value) {
      sub(/^[^=]*=/, "", value)
      sub(/[[:space:]]+#.*$/, "", value)
      gsub(/^[[:space:]"\047]+|[[:space:]"\047]+$/, "", value)
      return value
    }
    BEGIN { scope = "top" }
    /^[[:space:]]*\[/ {
      header = $0
      gsub(/[[:space:]]/, "", header)
      if (env != "" && header == "[env." env "]") {
        scope = "env"
      } else {
        scope = "other"
      }
      next
    }
    scope == "top" && $0 ~ "^[[:space:]]*" field "[[:space:]]*=" {
      top_value = clean($0)
      next
    }
    scope == "env" && $0 ~ "^[[:space:]]*" field "[[:space:]]*=" {
      print clean($0)
      found = 1
      exit
    }
    END {
      if (!found && top_value != "") print top_value
    }
  ' "$CONFIG_PATH" | head -n 1
}

resolve_remote_d1_database_id() {
  local database_name="$1"

  if [ "${#D1_LIST_ARGS[@]}" -gt 0 ]; then
    pnpm wrangler d1 list --json "${D1_LIST_ARGS[@]}"
  else
    pnpm wrangler d1 list --json
  fi | node -e '
    const fs = require("node:fs")
    const databaseName = process.argv[1]
    const databases = JSON.parse(fs.readFileSync(0, "utf8"))
    const database = databases.find(item => item.name === databaseName)
    if (!database?.uuid) {
      console.error(`Could not find remote D1 database named ${databaseName}`)
      process.exit(1)
    }
    process.stdout.write(database.uuid)
  ' "$database_name"
}

run_migrations_with_resolved_database_id() {
  local binding
  local database_name
  local database_id
  local migrations_dir
  local compatibility_date
  local worker_name
  local worker_main
  local config_dir
  local temp_config
  local d1_header

  binding="$(d1_config_value binding)"
  database_name="$(d1_config_value database_name)"
  migrations_dir="$(d1_config_value migrations_dir)"

  if [ -z "$binding" ]; then
    binding="$D1_DATABASE"
  fi
  if [ -z "$database_name" ]; then
    database_name="$D1_DATABASE"
  fi
  if [ -z "$migrations_dir" ]; then
    migrations_dir="migrations"
  fi

  database_id="$(resolve_remote_d1_database_id "$database_name")"
  worker_name="$(config_scalar_value name)"
  worker_main="$(config_scalar_value main)"
  compatibility_date="$(config_scalar_value compatibility_date)"
  if [ -z "$worker_name" ]; then
    worker_name="halopress-d1-migrations"
  fi
  if [ -z "$worker_main" ]; then
    worker_main=".output/server/index.mjs"
  fi
  if [ -z "$compatibility_date" ]; then
    compatibility_date="2026-05-18"
  fi

  if [ -n "$ENV_NAME" ]; then
    d1_header="[[env.${ENV_NAME}.d1_databases]]"
  else
    d1_header="[[d1_databases]]"
  fi

  config_dir="$(cd "$(dirname "$CONFIG_PATH")" && pwd)"
  temp_config="$(mktemp "${config_dir}/.halopress-d1-migrations.XXXXXX.toml")"
  trap 'rm -f "$temp_config"' RETURN

  {
    printf 'name = "%s"\n' "$worker_name"
    printf 'main = "%s"\n' "$worker_main"
    printf 'compatibility_date = "%s"\n' "$compatibility_date"
    printf '\n%s\n' "$d1_header"
    printf 'binding = "%s"\n' "$binding"
    printf 'database_name = "%s"\n' "$database_name"
    printf 'database_id = "%s"\n' "$database_id"
    printf 'migrations_dir = "%s"\n' "$migrations_dir"
  } > "$temp_config"

  if [ "${#FALLBACK_MIGRATION_ARGS[@]}" -gt 0 ]; then
    pnpm wrangler d1 migrations apply "$binding" --remote --config "$temp_config" "${FALLBACK_MIGRATION_ARGS[@]}"
  else
    pnpm wrangler d1 migrations apply "$binding" --remote --config "$temp_config"
  fi
}

has_database_id() {
  local database_id

  database_id="$(d1_config_value database_id)"
  [ -n "$database_id" ] && [[ "$database_id" != \<*\> ]]
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

  echo "Applying D1 migrations (remote) for ${D1_DATABASE} with resolved database_id..."
  run_migrations_with_resolved_database_id

  echo "Redeploying worker after migrations..."
  run_deploy
fi
