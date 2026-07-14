import { readBody } from 'h3'

import { requireAdmin } from '../../utils/auth'
import { badRequest } from '../../utils/http'
import {
  SitePresentationValidationError,
  updateSitePresentation
} from '../../utils/site-presentation-settings'

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event)
  const actorId = String((session.user as { id?: string } | undefined)?.id || '').trim() || null
  const body = await readBody(event)

  try {
    return await updateSitePresentation(event, body, actorId)
  } catch (error) {
    if (error instanceof SitePresentationValidationError) throw badRequest(error.message)
    throw error
  }
})
