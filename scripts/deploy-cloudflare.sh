#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

AUTH_SECRET_NAME="NUXT_AUTH_SECRET"
D1_DATABASE="${HALOPRESS_D1_DATABASE:-DB}"
PREPARE_ARGS=()
SECRET_SCOPE_ARGS=()
DEPLOY_ARGS=()
SEARCH_DEPLOY_ARGS=()
DRY_RUN=0
MAIN_CONFIG_PATH=""
MAIN_WORKER_NAME_OVERRIDE=""
WRANGLER_ENV=""
USER_SECRETS_FILE=""
GENERATED_SECRETS_DIR=""
GENERATED_SECRETS_FILE=""
SECRET_LIST_STDERR_FILE=""
TOPOLOGY_BACKUP_DIR=""
TOPOLOGY_MAIN_CONFIG_PATH=""
TOPOLOGY_SEARCH_CONFIG_PATH=""

cleanup_generated_secrets() {
  if [ -n "$TOPOLOGY_BACKUP_DIR" ]; then
    cp "$TOPOLOGY_BACKUP_DIR/main.jsonc" "$TOPOLOGY_MAIN_CONFIG_PATH"
    cp "$TOPOLOGY_BACKUP_DIR/search.jsonc" "$TOPOLOGY_SEARCH_CONFIG_PATH"
    rm -rf -- "$TOPOLOGY_BACKUP_DIR"
  fi
  if [ -n "$GENERATED_SECRETS_DIR" ]; then
    rm -rf -- "$GENERATED_SECRETS_DIR"
  fi
  if [ -n "$SECRET_LIST_STDERR_FILE" ]; then
    rm -f -- "$SECRET_LIST_STDERR_FILE"
  fi
}

trap cleanup_generated_secrets EXIT
trap 'exit 130' INT
trap 'exit 143' HUP TERM

run_wrangler() {
  if [ -n "${HALOPRESS_WRANGLER_BIN:-}" ]; then
    "${HALOPRESS_WRANGLER_BIN}" "$@"
  else
    pnpm wrangler "$@"
  fi
}

parse_secret_list_status() {
  node -e '
let input = ""
process.stdin.setEncoding("utf8")
process.stdin.on("data", chunk => { input += chunk })
process.stdin.on("end", () => {
  try {
    const secrets = JSON.parse(input)
    if (!Array.isArray(secrets)) throw new Error("expected an array")
    const present = secrets.some(secret => secret && secret.name === process.argv[1])
    process.stdout.write(present ? "present" : "missing")
  } catch {
    process.exitCode = 1
  }
})
' "$AUTH_SECRET_NAME"
}

inspect_user_secrets_file() {
  node -e '
const { readFileSync } = require("node:fs")
const { extname } = require("node:path")

try {
  const file = process.argv[1]
  const secretName = process.argv[2]
  const contents = readFileSync(file, "utf8")
  let value

  if (extname(file).toLowerCase() === ".json" || contents.trimStart().startsWith("{")) {
    const secrets = JSON.parse(contents)
    value = secrets && typeof secrets === "object" ? secrets[secretName] : undefined
  } else {
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
      if (!match || match[1] !== secretName) continue
      let candidate = match[2].trim()
      if ((candidate.startsWith("\"") && candidate.endsWith("\""))
        || (candidate.startsWith("\x27") && candidate.endsWith("\x27"))) {
        candidate = candidate.slice(1, -1)
      } else {
        candidate = candidate.replace(/\s+#.*$/, "").trim()
      }
      value = candidate
    }
  }

  const normalized = typeof value === "string" ? value.trim() : ""
  if (!normalized) {
    process.stdout.write("missing")
  } else {
    process.stdout.write(Buffer.byteLength(normalized, "utf8") >= 24 ? "valid" : "weak")
  }
} catch {
  process.exitCode = 1
}
' "$USER_SECRETS_FILE" "$AUTH_SECRET_NAME"
}

create_generated_secrets_file() {
  local temp_root="${TMPDIR:-/tmp}"
  local secret_value

  GENERATED_SECRETS_DIR="$(mktemp -d "${temp_root%/}/halopress-secrets.XXXXXX")"
  chmod 700 "$GENERATED_SECRETS_DIR"
  GENERATED_SECRETS_FILE="$GENERATED_SECRETS_DIR/.env"
  secret_value="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
  (umask 077 && printf '%s=%s\n' "$AUTH_SECRET_NAME" "$secret_value" > "$GENERATED_SECRETS_FILE")
  unset secret_value
}

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
      PREPARE_ARGS+=("$1")
      DEPLOY_ARGS+=("$1")
      SEARCH_DEPLOY_ARGS+=("$1")
      shift
      ;;
    --env|-e|--config|-c)
      flag="$1"
      shift
      if [ "$#" -eq 0 ]; then
        echo "Missing value for ${flag}" >&2
        exit 1
      fi
      PREPARE_ARGS+=("$flag" "$1")
      SECRET_SCOPE_ARGS+=("$flag" "$1")
      DEPLOY_ARGS+=("$flag" "$1")
      if [ "$flag" = "--config" ] || [ "$flag" = "-c" ]; then
        MAIN_CONFIG_PATH="$1"
      else
        WRANGLER_ENV="$1"
      fi
      shift
      ;;
    --env-file)
      flag="$1"
      shift
      if [ "$#" -eq 0 ]; then
        echo "Missing value for ${flag}" >&2
        exit 1
      fi
      PREPARE_ARGS+=("$flag" "$1")
      DEPLOY_ARGS+=("$flag" "$1")
      shift
      ;;
    --name)
      flag="$1"
      shift
      if [ "$#" -eq 0 ]; then
        echo "Missing value for ${flag}" >&2
        exit 1
      fi
      SECRET_SCOPE_ARGS+=("$flag" "$1")
      DEPLOY_ARGS+=("$flag" "$1")
      MAIN_WORKER_NAME_OVERRIDE="$1"
      shift
      ;;
    --secrets-file)
      flag="$1"
      shift
      if [ "$#" -eq 0 ]; then
        echo "Missing value for ${flag}" >&2
        exit 1
      fi
      if [ -n "$USER_SECRETS_FILE" ]; then
        echo 'Only one --secrets-file can be supplied.' >&2
        exit 1
      fi
      USER_SECRETS_FILE="$1"
      DEPLOY_ARGS+=("$flag" "$1")
      shift
      ;;
    --env=*|-e=*|--config=*|-c=*)
      PREPARE_ARGS+=("$1")
      SECRET_SCOPE_ARGS+=("$1")
      DEPLOY_ARGS+=("$1")
      if [[ "$1" == --config=* ]] || [[ "$1" == -c=* ]]; then
        MAIN_CONFIG_PATH="${1#*=}"
      else
        WRANGLER_ENV="${1#*=}"
      fi
      shift
      ;;
    --env-file=*)
      PREPARE_ARGS+=("$1")
      DEPLOY_ARGS+=("$1")
      shift
      ;;
    --name=*)
      SECRET_SCOPE_ARGS+=("$1")
      DEPLOY_ARGS+=("$1")
      MAIN_WORKER_NAME_OVERRIDE="${1#*=}"
      shift
      ;;
    --secrets-file=*)
      if [ -n "$USER_SECRETS_FILE" ]; then
        echo 'Only one --secrets-file can be supplied.' >&2
        exit 1
      fi
      USER_SECRETS_FILE="${1#*=}"
      if [ -z "$USER_SECRETS_FILE" ]; then
        echo 'Missing value for --secrets-file' >&2
        exit 1
      fi
      DEPLOY_ARGS+=("$1")
      shift
      ;;
    *)
      DEPLOY_ARGS+=("$1")
      shift
      ;;
  esac
done

if [ -n "${HALOPRESS_SEARCH_WRANGLER_CONFIG:-}" ]; then
  SEARCH_CONFIG_PATH="$HALOPRESS_SEARCH_WRANGLER_CONFIG"
elif [ -n "$MAIN_CONFIG_PATH" ]; then
  SEARCH_CONFIG_PATH="$(cd "$(dirname "$MAIN_CONFIG_PATH")" && pwd)/workers/search/wrangler.jsonc"
else
  SEARCH_CONFIG_PATH="$ROOT_DIR/workers/search/wrangler.jsonc"
fi
if [ -z "$MAIN_CONFIG_PATH" ]; then
  MAIN_CONFIG_PATH="$ROOT_DIR/wrangler.jsonc"
fi
if [ ! -f "$SEARCH_CONFIG_PATH" ]; then
  echo "Missing required search Worker configuration: $SEARCH_CONFIG_PATH" >&2
  echo 'Set HALOPRESS_SEARCH_WRANGLER_CONFIG when using a custom main Wrangler configuration.' >&2
  exit 1
fi

if [ "$DRY_RUN" -eq 1 ]; then
  topology_backup_dir="$(mktemp -d "${TMPDIR:-/tmp}/halopress-topology.XXXXXX")"
  cp "$MAIN_CONFIG_PATH" "$topology_backup_dir/main.jsonc"
  cp "$SEARCH_CONFIG_PATH" "$topology_backup_dir/search.jsonc"
  TOPOLOGY_MAIN_CONFIG_PATH="$MAIN_CONFIG_PATH"
  TOPOLOGY_SEARCH_CONFIG_PATH="$SEARCH_CONFIG_PATH"
  TOPOLOGY_BACKUP_DIR="$topology_backup_dir"
fi

TOPOLOGY_ARGS=(--config "$MAIN_CONFIG_PATH" --search-config "$SEARCH_CONFIG_PATH")
if [ -n "$WRANGLER_ENV" ]; then
  TOPOLOGY_ARGS+=(--env "$WRANGLER_ENV")
fi
if [ -n "$MAIN_WORKER_NAME_OVERRIDE" ]; then
  TOPOLOGY_ARGS+=(--main-name "$MAIN_WORKER_NAME_OVERRIDE")
fi
if [ -n "${HALOPRESS_SEARCH_WORKER_NAME:-}" ]; then
  TOPOLOGY_ARGS+=(--search-worker-name "$HALOPRESS_SEARCH_WORKER_NAME")
fi
if [ -n "${HALOPRESS_SEARCH_QUEUE_NAME:-}" ]; then
  TOPOLOGY_ARGS+=(--search-queue-name "$HALOPRESS_SEARCH_QUEUE_NAME")
fi
TOPOLOGY_JSON="$(node scripts/prepare-cloudflare-search-topology.mjs "${TOPOLOGY_ARGS[@]}")"
SEARCH_WORKER_NAME="$(node -e '
const topology = JSON.parse(process.argv[1])
if (!topology.searchWorkerName) process.exit(1)
process.stdout.write(topology.searchWorkerName)
' "$TOPOLOGY_JSON")"
SEARCH_QUEUE_NAME="$(node -e '
const topology = JSON.parse(process.argv[1])
if (!topology.searchQueueName) process.exit(1)
process.stdout.write(topology.searchQueueName)
' "$TOPOLOGY_JSON")"

USER_SECRET_STATUS="missing"
if [ -n "$USER_SECRETS_FILE" ]; then
  if ! USER_SECRET_STATUS="$(inspect_user_secrets_file)"; then
    echo 'Could not read the supplied --secrets-file; refusing to deploy.' >&2
    exit 1
  fi
  if [ "$USER_SECRET_STATUS" = "weak" ]; then
    echo "${AUTH_SECRET_NAME} in --secrets-file must be at least 24 UTF-8 bytes." >&2
    echo 'Use 32 random bytes; for example, generate a value with `openssl rand -hex 32`.' >&2
    exit 1
  fi
fi

SECRET_STATUS="missing"
if [ "$DRY_RUN" -eq 0 ]; then
  SECRET_LIST_STDERR_FILE="$(mktemp "${TMPDIR:-/tmp}/halopress-secret-list.XXXXXX")"
  chmod 600 "$SECRET_LIST_STDERR_FILE"
  set +e
  SECRET_LIST_OUTPUT="$(run_wrangler secret list --format json "${SECRET_SCOPE_ARGS[@]}" 2> "$SECRET_LIST_STDERR_FILE")"
  SECRET_LIST_EXIT=$?
  set -e
  SECRET_LIST_ERROR="$(< "$SECRET_LIST_STDERR_FILE")"
  rm -f -- "$SECRET_LIST_STDERR_FILE"
  SECRET_LIST_STDERR_FILE=""

  if [ "$SECRET_LIST_EXIT" -eq 0 ]; then
    if ! SECRET_STATUS="$(printf '%s' "$SECRET_LIST_OUTPUT" | parse_secret_list_status)"; then
      echo 'Could not parse the Wrangler secret list response; refusing to deploy.' >&2
      exit 1
    fi
  elif [[ "$SECRET_LIST_ERROR" == *' not found.'* \
    && "$SECRET_LIST_ERROR" == *'If this is a new Worker, run `wrangler deploy` first'* ]]; then
    SECRET_STATUS="missing"
  else
    if [ -n "$SECRET_LIST_OUTPUT" ]; then
      printf '%s\n' "$SECRET_LIST_OUTPUT" >&2
    fi
    if [ -n "$SECRET_LIST_ERROR" ]; then
      printf '%s\n' "$SECRET_LIST_ERROR" >&2
    fi
    exit "$SECRET_LIST_EXIT"
  fi

  if [ "$SECRET_STATUS" = "missing" ] && [ -n "$USER_SECRETS_FILE" ]; then
    if [ "$USER_SECRET_STATUS" != "valid" ]; then
      echo "The supplied --secrets-file must contain ${AUTH_SECRET_NAME} with at least 24 UTF-8 bytes for a new Worker or a Worker that does not have it yet." >&2
      echo 'Remove --secrets-file to let Halopress generate 32 random bytes, or add a strong secret to that file.' >&2
      exit 1
    fi
  fi
fi

node scripts/prepare-cloudflare-d1.mjs \
  "$D1_DATABASE" \
  --search-config "$SEARCH_CONFIG_PATH" \
  "${PREPARE_ARGS[@]}"

if [ "$DRY_RUN" -eq 0 ] && [ "$SECRET_STATUS" = "missing" ] && [ -z "$USER_SECRETS_FILE" ]; then
  create_generated_secrets_file
  DEPLOY_ARGS+=(--secrets-file "$GENERATED_SECRETS_FILE")
  echo "Generated ${AUTH_SECRET_NAME} for this Worker; the value was not printed and will be preserved on later deploys."
fi

if [ "$DRY_RUN" -eq 0 ]; then
  if ! run_wrangler queues info "$SEARCH_QUEUE_NAME" --config "$SEARCH_CONFIG_PATH"; then
    echo "Creating Cloudflare Queue ${SEARCH_QUEUE_NAME}..."
    run_wrangler queues create "$SEARCH_QUEUE_NAME" --config "$SEARCH_CONFIG_PATH"
  fi
fi

node workers/search/scripts/prepare-assets.mjs
echo 'Deploying search Worker...'
if [ "${#SEARCH_DEPLOY_ARGS[@]}" -gt 0 ]; then
  run_wrangler deploy --config "$SEARCH_CONFIG_PATH" --name "$SEARCH_WORKER_NAME" "${SEARCH_DEPLOY_ARGS[@]}"
else
  run_wrangler deploy --config "$SEARCH_CONFIG_PATH" --name "$SEARCH_WORKER_NAME"
fi

echo 'Deploying main Cloudflare Worker...'
run_wrangler deploy "${DEPLOY_ARGS[@]}"
