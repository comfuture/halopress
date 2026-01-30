## Nuxt UI usage

- Use the nuxt-ui MCP to learn the API and implement components and code correctly.

## PR authoring

- When writing PR bodies, do not leave literal `\n` sequences in the text; use real line breaks instead.

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
