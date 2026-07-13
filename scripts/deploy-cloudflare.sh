#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

AUTH_SECRET_NAME="NUXT_AUTH_SECRET"
D1_DATABASE="${HALOPRESS_D1_DATABASE:-DB}"
PREPARE_ARGS=()
SECRET_SCOPE_ARGS=()
DEPLOY_ARGS=()
DRY_RUN=0
USER_SECRETS_FILE=""
GENERATED_SECRETS_DIR=""
GENERATED_SECRETS_FILE=""
SECRET_LIST_STDERR_FILE=""

cleanup_generated_secrets() {
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

node scripts/prepare-cloudflare-d1.mjs "$D1_DATABASE" "${PREPARE_ARGS[@]}"

if [ "$DRY_RUN" -eq 0 ] && [ "$SECRET_STATUS" = "missing" ] && [ -z "$USER_SECRETS_FILE" ]; then
  create_generated_secrets_file
  DEPLOY_ARGS+=(--secrets-file "$GENERATED_SECRETS_FILE")
  echo "Generated ${AUTH_SECRET_NAME} for this Worker; the value was not printed and will be preserved on later deploys."
fi

echo 'Deploying Cloudflare Worker...'
run_wrangler deploy "${DEPLOY_ARGS[@]}"
