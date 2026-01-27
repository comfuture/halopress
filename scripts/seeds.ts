import { getDb } from '../server/db/db'
import { ensureAdminUser, runMigrations, seedRoles } from '../server/utils/install'

async function run() {
  const db = await getDb()
  await runMigrations(db)
  await seedRoles(db)

  const email = (process.env.HP_ADMIN_EMAIL || process.env.HALOPRESS_ADMIN_EMAIL || '').trim().toLowerCase()
  const name = (process.env.HP_ADMIN_NAME || '').trim()
  const password = process.env.HP_ADMIN_PASSWORD || process.env.HALOPRESS_ADMIN_PASSWORD || ''

  if (email && password) {
    await ensureAdminUser(db, { email, name, password })
  }
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
