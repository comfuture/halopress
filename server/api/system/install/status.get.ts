import { getDb } from '../../../db/db'
import { getInstallStatus } from '../../../utils/install'
import { resolveEncryptionKey } from '../../../utils/oauth'

export default defineEventHandler(async (event) => {
  const db = await getDb(event)
  const config = useRuntimeConfig(event)
  const status = await getInstallStatus(db)
  const googleEncryptionKey = resolveEncryptionKey('google', event)
  return {
    ...status,
    hasSecret: Boolean(googleEncryptionKey),
    oauthEnv: {
      googleClientId: Boolean(config.oauthGoogleClientId),
      googleClientSecret: Boolean(config.oauthGoogleClientSecret)
    }
  }
})
