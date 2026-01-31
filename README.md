# Halopress

Multi-schema CMS MVP built with Nuxt 4 and Nuxt UI.

## Features (MVP scope)

- Viewer (`/`): schema list, content list, content detail
- Desk (`/_desk/**`): schema draft/publish, content CRUD, asset upload
- Schema builder → AST → JSON Schema + registry on publish
- Editor uses Nuxt UI `u-editor`
- DB: local SQLite via `node:sqlite`, Cloudflare D1 when bound
- Assets: local filesystem (`.data/r2/**`), Cloudflare R2 when bound

Checklist: `docs/MVP_CHECKLIST.md`

## Local development

### 1) Environment variables

```bash
export NUXT_AUTH_ORIGIN="http://localhost:3000/api/auth"
export NUXT_AUTH_SECRET="dev-secret-change-me"
```

Optional OAuth (Google) env variables:

```bash
export NUXT_OAUTH_SETTINGS_SOURCE="env+db"
export NUXT_OAUTH_PROVIDERS="google"
export NUXT_OAUTH_CREDENTIALS_ENABLED="true"
export NUXT_OAUTH_GOOGLE_ENABLED="true"
export NUXT_OAUTH_GOOGLE_CLIENT_ID="..."
export NUXT_OAUTH_GOOGLE_CLIENT_SECRET="..."
export NUXT_OAUTH_GOOGLE_ENCRYPTION_KEY="..."  # provider-specific decrypt key
export NUXT_SECRET="..." # fallback decrypt key for encrypted settings
```

DB settings keys (scope: `global`) for OAuth:

- `auth.oauth.google.enabled` (boolean)
- `auth.oauth.google.clientId` (string)
- `auth.oauth.google.clientSecret` (string, encrypted)
- `auth.oauth.credentials.enabled` (boolean)

### 2) Install dependencies

```bash
pnpm install
```

### 3) Start dev server

```bash
pnpm dev
```

## Local database migrations (SQLite)

Drizzle migrations are stored in `server/db/migrations`.

### Generate a new migration (required: descriptive name)

```bash
pnpm db:generate add_user_field
```

### Apply migrations to local SQLite

```bash
pnpm db:migrate
```

### Push schema directly (dev only, bypass migrations)

```bash
pnpm db:push
```

### Open Drizzle Studio

```bash
pnpm db:studio
```

## Cloudflare D1 + Wrangler deployment

### 1) Create and configure `wrangler.toml`

Update `wrangler.toml` with your real D1 database values:

- `database_name`
- `database_id`

Environment variables should be set via Wrangler secrets:

```bash
npx wrangler secret put NUXT_AUTH_SECRET
npx wrangler secret put NUXT_AUTH_ORIGIN
```

### 2) Apply D1 migrations (remote)

```bash
pnpm db:d1:apply:remote -- <D1_DATABASE_NAME>
```

### 3) Deploy (build → migrate → deploy)

```bash
pnpm deploy:cf -- <D1_DATABASE_NAME>
```

This script runs:

1) `pnpm build`
2) `wrangler d1 migrations apply --remote`
3) `wrangler deploy`
