import { requireAdmin } from '../../utils/auth'
import { getMembershipSettings, listEligibleMemberRoles, toPublicMembershipSettings } from '../../utils/membership'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const [settings, roles] = await Promise.all([
    getMembershipSettings(event),
    listEligibleMemberRoles(event)
  ])
  return { ...settings, public: toPublicMembershipSettings(settings.mode), roles }
})
