import { getDb } from '../../../db/db'
import { getInstallationSessionAccess, getRuntimeInstallStatus } from '../../../utils/install'
import {
  clearSetupSessionCookie,
  getMissingCloudflareBindings,
  hashSetupSessionToken,
  readSetupSessionToken
} from '../../../utils/install-session'
import { isAuthRuntimeReady, resolveAuthSigningSecret } from '../../../utils/install-token'

export default defineEventHandler(async (event) => {
  const isCloudflareRuntime = Boolean((event as any)?.context?.cloudflare)
  const missingBindings = getMissingCloudflareBindings(event)
  if (missingBindings.length) {
    return {
      ready: false,
      canStartSetup: false,
      canInstall: false,
      setupSessionOwned: false,
      phase: 'binding_missing' as const,
      missingBindings,
      missingTables: []
    }
  }

  const db = await getDb(event)
  const status = await getRuntimeInstallStatus(db, { isCloudflareRuntime })
  const signingSecret = resolveAuthSigningSecret(event)
  const runtimeSecretReady = isAuthRuntimeReady(isCloudflareRuntime, signingSecret)

  if (status.phase !== 'migration_required' && !runtimeSecretReady) {
    return {
      ...status,
      ready: false,
      canStartSetup: false,
      canInstall: false,
      setupSessionOwned: false,
      phase: 'configuration_required' as const,
      missingBindings
    }
  }

  if (status.ready) {
    clearSetupSessionCookie(event, isCloudflareRuntime)
    return {
      ...status,
      canStartSetup: false,
      canInstall: false,
      setupSessionOwned: false,
      missingBindings
    }
  }

  if (status.phase === 'migration_required') {
    return {
      ...status,
      canStartSetup: false,
      canInstall: false,
      setupSessionOwned: false,
      missingBindings
    }
  }

  const setupSessionToken = readSetupSessionToken(event)
  const setupSessionHash = setupSessionToken
    ? await hashSetupSessionToken(setupSessionToken, signingSecret)
    : null
  const access = await getInstallationSessionAccess(db, setupSessionHash)
  const setupLocked = access.locked && !access.owned

  return {
    ...status,
    phase: setupLocked ? 'setup_locked' as const : status.phase,
    canStartSetup: status.canInstall && !access.owned && !setupLocked,
    canInstall: status.canInstall && access.owned,
    setupSessionOwned: access.owned,
    retryAfterSeconds: setupLocked ? access.retryAfterSeconds : undefined,
    missingBindings
  }
})
