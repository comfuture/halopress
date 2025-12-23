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
- [ ] Nested object/array fields (post-MVP)
- [ ] `content_field_kv` exact/range filters (optional)

## 5. Assets (local / R2)
- [x] Upload API (multipart → local filesystem, or R2 when bound)
- [x] Asset serving endpoint (`/assets/:assetId/raw`)
- [ ] Direct-to-R2 presigned uploads (post-MVP)
- [ ] Variants/thumb pipeline (Cloudflare Images) (post-MVP)

## 6. UI
- [x] Viewer: home / collection / detail pages
- [x] Desk: dashboard / schemas / content / assets
- [ ] Polishing: validations, empty states, better relation picker (iterative)
