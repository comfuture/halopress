## Nuxt UI usage

- Use the nuxt-ui MCP to learn the API and implement components and code correctly.

## PR authoring

- When writing PR bodies, do not leave literal `\n` sequences in the text; use real line breaks instead.

## Nuxt runtimeConfig notes

- For Nuxt runtimeConfig defaults, do not read `process.env.*` in `nuxt.config.ts`; set only safe defaults and rely on runtime `NUXT_*` env overrides.
- Reviewers may suggest restoring `process.env.AUTH_ORIGIN` fallbacks; we intentionally avoid that to align with Nuxt runtimeConfig guidance (build-time env reads can break at runtime).

# DB Migration
Generate migration from schema changes

<!> IMPORTANT: Always provide a descriptive name for the migration

pnpm db:generate <name>  # Example: pnpm db:generate add_user_field

# Apply migrations to database
pnpm db:migrate

# Push schema changes directly to database (development only, bypasses migrations)
pnpm db:push

# Open Drizzle Studio (GUI for database)
pnpm db:studio
