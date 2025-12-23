## Nuxt UI 사용

- nuxt-ui mcp 를 이용하여 사용법을 숙지하고 컴포넌트 및 코드를 작성합니다.

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
