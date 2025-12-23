# Halopress MVP Checklist

## 0. Local setup
- [ ] Set env: `HALOPRESS_AUTH_SECRET`, `HALOPRESS_ADMIN_EMAIL`, `HALOPRESS_ADMIN_PASSWORD`
- [ ] `pnpm install`
- [ ] `pnpm dev`

## 1. DB (SQLite / D1-compatible)
- [x] Idempotent init migration (`server/db/migrations/0001_init.sql`)
- [x] Drizzle schema definitions (`server/db/schema.ts`)
- [x] DB adapter (local `node:sqlite` + Cloudflare D1 binding hook) (`server/db/db.ts`)

## 2. Auth (Desk)
- [x] Admin login (`/api/auth/login`) using env credentials
- [x] Session cookie (JWT HS256)
- [x] Desk route guard (`app/middleware/desk-auth.global.ts`)
- [ ] Replace env-login with OAuth (better-auth) (post-MVP)

## 3. Schema management
- [x] Draft save/load (`/api/schema/:schemaKey/draft`)
- [x] Publish version (`/api/schema/:schemaKey/publish`) → `schema` + `schema_active`
- [x] Compiler: AST → JSON Schema + registry (`server/cms/compiler.ts`)
- [ ] Diff events (real structural diff) (post-MVP)

## 4. Content management
- [x] CRUD APIs (`/api/content/:schemaKey/**`)
- [x] Simple relation sync (`server/cms/ref-sync.ts`) (MVP: top-level only)
- [x] Schema-driven editor (Nuxt UI + `u-editor`)
- [x] Searchable EAV tables (`content_*_data`) + `content_fields` metadata
- [x] Search/filter/sort toggles in schema editor field dialog
- [x] Content write indexing + publish-time reindex for search toggles
- [x] Search API (`/api/search`) with EXISTS-based filters + range support
- [ ] Nested object/array fields (post-MVP)

## 5. Assets (local / R2)
- [x] Upload API (multipart → local filesystem, or R2 when bound)
- [x] Asset serving endpoint (`/assets/:assetId/raw`)
- [x] Add Nuxt Image module + presets (avatar/card/content) for thumbnails
- [x] Replace asset preview `<img>` tags with `<NuxtImg>` (preset-driven)
- [x] Use IPX locally and Cloudflare provider when deployed (env/detect)
- [x] Remove unused `asset_variant` table with migration
- [ ] Direct-to-R2 presigned uploads (post-MVP)
- [ ] Variants/thumb pipeline (Cloudflare Images) (post-MVP)

## 6. UI
- [x] Viewer: home / collection / detail pages
- [x] Desk: dashboard / schemas / content / assets
- [ ] Polishing: validations, empty states, better relation picker (iterative)
