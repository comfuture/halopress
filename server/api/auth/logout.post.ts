import { clearAuthSession } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  clearAuthSession(event)
  return { ok: true }
})
