import { getDb } from '../../../db/db'
import { getInstallStatus } from '../../../utils/install'
import { resolveEncryptionKey } from '../../../utils/oauth'

export default defineEventHandler(async (event) => {
  const db = await getDb(event)
  const status = await getInstallStatus(db)
  const googleEncryptionKey = resolveEncryptionKey('google')
  return {
    ...status,
    hasSecret: Boolean(googleEncryptionKey),
    oauthEnv: {
      googleClientId: Boolean(process.env.NUXT_OAUTH_GOOGLE_CLIENT_ID),
      googleClientSecret: Boolean(process.env.NUXT_OAUTH_GOOGLE_CLIENT_SECRET)
    }
  }
})
