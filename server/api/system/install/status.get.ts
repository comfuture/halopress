import { getDb } from '../../../db/db'
import { getInstallStatus } from '../../../utils/install'

export default defineEventHandler(async (event) => {
  const db = await getDb(event)
  return await getInstallStatus(db)
})
