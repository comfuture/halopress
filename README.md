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
export NUXT_OAUTH_GOOGLE_ENCRYPTION_KEY="..." # optional provider-specific encryption key
export NUXT_SECRET_KEY="..." # encryption key for encrypted settings
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

## Cloudflare Workers deployment

Halopress is configured to run as a Cloudflare Worker with:

- D1 binding: `DB`
- R2 binding: `CONTENT_ASSETS`
- Static assets: `.output/public`
- Worker entry: `.output/server/index.mjs`
- Automatically managed Worker secret: `NUXT_AUTH_SECRET`

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/comfuture/halopress)

The Nuxt build may already have run before the deploy script in Workers Builds, while terminal deployments build during `wrangler deploy`. Both paths preserve the same publishing guarantee:

1. resolve or create the configured D1 database
2. apply all remote D1 migrations
3. only then let `wrangler deploy` publish the Worker, reusing or building the Nuxt output as needed and provisioning or attaching the R2 bucket

The first public Worker version therefore never runs against an unmigrated database.

### Option A: Deploy Button (recommended for a new site)

1. Select the Deploy to Cloudflare button above.
2. In **Set up your application**:
   - use a new, site-specific project name;
   - create an isolated D1 database and R2 bucket for a new site;
   - reuse existing resources only when redeploying that same site;
   - verify **Build command** is `pnpm build` and **Deploy command** is `pnpm run deploy` (fill them in if Cloudflare leaves either field blank).
3. Deploy. Cloudflare creates a Git repository in your account and connects it to Workers Builds.
4. Open the resulting `https://<worker-name>.<account>.workers.dev/_install` URL and follow the wizard.

No secret input is required in the Deploy Button. The deploy wrapper generates `NUXT_AUTH_SECRET` with 32 random bytes and attaches it as an encrypted Worker secret to the same first deployment. Later deployments detect and preserve that existing secret. Complete the initial wizard with email/password enabled and create the password administrator first. Google OAuth can be configured after that installation using the steps under [Secrets and custom domains](#secrets-and-custom-domains); sign in with the same email as the existing administrator after enabling Google.

The defaults in `wrangler.jsonc` are `halopress` for D1 and `halopress-content-assets` for R2. Give them site-specific names in the Deploy Button when the account will host multiple Halopress installations.

### Option B: Clone and deploy from a terminal

Install dependencies:

```bash
git clone https://github.com/comfuture/halopress.git
cd halopress
pnpm install --frozen-lockfile
```

Use different `database_name` and `bucket_name` values in `wrangler.jsonc` before the first deploy if this Cloudflare account already hosts another Halopress site. Then authenticate and deploy:

```bash
pnpm wrangler login
pnpm wrangler whoami
pnpm deploy:cf
```

The first deployment creates `NUXT_AUTH_SECRET` automatically without printing it. The D1 preparation step may write the resolved account-specific `database_id` to your local `wrangler.jsonc`; keep that value in a private fork, but do not contribute it back to the upstream template.

For later deployments, either command works:

```bash
pnpm deploy
pnpm deploy:cf
```

Use `deploy:cf` when forwarding Wrangler options. It forwards configuration and environment selection to both D1 preparation and Worker deployment:

```bash
pnpm deploy:cf -- --env staging --config wrangler.staging.jsonc
```

Custom Wrangler configuration files passed to `deploy:cf` must use JSON or JSONC. TOML cannot be safely normalized by the deployment preparation step; convert an older `wrangler.toml` to `wrangler.jsonc` before deploying.

Named environments must declare their own D1 and R2 bindings because Wrangler bindings are not inherited.

To validate the build and configuration without creating resources or applying migrations:

```bash
pnpm deploy:cf -- --dry-run
```

The preparation step is also a standalone command for diagnostics:

```bash
node scripts/prepare-cloudflare-d1.mjs DB --dry-run
```

### Option C: Connect an existing Git repository

When importing a repository from **Workers & Pages → Create application**, configure:

- Production branch: your intended release branch
- Build command: `pnpm build`
- Deploy command: `pnpm run deploy`

Workers Builds installs dependencies from `pnpm-lock.yaml` automatically. The deploy command creates the auth secret on the first deployment and preserves it thereafter. If you supply a custom API token, it needs permission to inspect Worker secrets, deploy Workers, and manage the declared D1/R2 resources.

Cloudflare does not write provisioned IDs back to the connected source repository. The deploy preparation script deterministically adopts a same-name D1 database or creates it, patches the ephemeral build checkout, applies migrations, and only then runs `wrangler deploy`.

### Secrets and custom domains

`NUXT_AUTH_SECRET` is intentionally absent from the Deploy Button form and `wrangler.jsonc`. Before a non-dry-run deployment, the wrapper checks the target Worker with `wrangler secret list`. If the secret exists, it is left unchanged. If the Worker is new or lacks the secret, the wrapper generates 32 random bytes into a mode-0600 temporary file, passes it only to that deployment with `--secrets-file`, and deletes the file even when deployment fails. Authentication and network errors fail closed before migrations.

To choose the initial value yourself for a terminal deployment, copy `.dev.vars.example` to `.dev.vars`, uncomment `NUXT_AUTH_SECRET`, and pass `--secrets-file .dev.vars`. The value must be at least 24 UTF-8 bytes; 32 random bytes are recommended (`openssl rand -hex 32`). Weak supplied values are rejected before migrations or other remote mutations. For a new Worker or one missing the secret, the file must contain that strong `NUXT_AUTH_SECRET`; the wrapper never adds a second conflicting secrets file. Including it in a supplied file for an existing Worker intentionally replaces the secret during that deployment.

The Worker infers the NuxtAuth origin from each incoming request, so `NUXT_AUTH_ORIGIN` is optional for workers.dev and normal custom-domain deployments. Set it as a Worker secret only when forcing a specific auth base URL, including `/api/auth`:

```bash
pnpm wrangler secret put NUXT_AUTH_ORIGIN
# Example value: https://cms.example.com/api/auth
```

Optional Google OAuth can be added after the initial password-admin installation. First register `https://<worker-host>/api/auth/callback/google` as an authorized redirect URI in Google, using the final workers.dev or custom-domain host. Then configure an encryption key and the Google credentials:

```bash
pnpm wrangler secret put NUXT_SECRET_KEY
pnpm wrangler secret put NUXT_OAUTH_GOOGLE_ENCRYPTION_KEY
pnpm wrangler secret put NUXT_OAUTH_GOOGLE_CLIENT_ID
pnpm wrangler secret put NUXT_OAUTH_GOOGLE_CLIENT_SECRET
```

After adding the secrets, enable Google in the Halopress authentication settings. The Google account email must match the existing Halopress administrator email.

### Verify a deployment

```bash
pnpm wrangler d1 migrations list DB --remote
pnpm wrangler deployments list
```

Then verify `/_install` reports a ready database, complete the wizard, sign in with the created administrator, and upload one asset to confirm the `CONTENT_ASSETS` R2 binding. Schema migrations belong to the deploy step; the installation wizard only claims the installation, creates the administrator, and optionally seeds starter content.
