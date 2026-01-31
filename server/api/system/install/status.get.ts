import { getDb } from '../../../db/db'
import { getInstallStatus } from '../../../utils/install'

export default defineEventHandler(async (event) => {
  const db = await getDb(event)
  const status = await getInstallStatus(db)
  return {
    ...status,
    hasSecret: Boolean(process.env.NUXT_SECRET),
    oauthEnv: {
      googleClientId: Boolean(process.env.NUXT_OAUTH_GOOGLE_CLIENT_ID),
      googleClientSecret: Boolean(process.env.NUXT_OAUTH_GOOGLE_CLIENT_SECRET)
    }
  }
})
