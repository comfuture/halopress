import { createError, readBody } from 'h3'

import { getAuthSession } from '../../../utils/auth'
import { createGoogleLinkIntent, ExternalIdentityError } from '../../../utils/external-identities'

export default defineEventHandler(async (event) => {
  const session = await getAuthSession(event)
  const userId = session?.user?.id
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Sign in before linking Google' })
  const body = await readBody<{ password?: string }>(event)
  try {
    await createGoogleLinkIntent(event, userId, String(body?.password || ''))
    return { ok: true, provider: 'google' }
  } catch (error) {
    if (error instanceof ExternalIdentityError) {
      throw createError({ statusCode: 401, statusMessage: error.message })
    }
    throw error
  }
})
