import type { H3Event } from 'h3'
import { getSettingValue } from './settings'

export type OAuthProviderId = 'google'

type SettingsSource = {
  useEnv: boolean
  useDb: boolean
}

type OAuthProviderConfig = {
  enabled?: boolean
  clientId?: string
  clientSecret?: string
  autoProvision?: boolean
}

const DEFAULT_SCOPE = 'global'

function parseBoolean(value?: string) {
  if (value === undefined) return undefined
  const normalized = value.trim().toLowerCase()
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true
  if (['false', '0', 'no', 'off'].includes(normalized)) return false
  return undefined
}

function parseProvidersList(value?: string) {
  if (!value) return null
  return value.split(',').map(item => item.trim().toLowerCase()).filter(Boolean)
}

function resolveSettingsSource(): SettingsSource {
  const raw = (process.env.NUXT_OAUTH_SETTINGS_SOURCE || 'env+db').toLowerCase()
  if (raw === 'env') return { useEnv: true, useDb: false }
  if (raw === 'db') return { useEnv: false, useDb: true }
  if (raw === 'db+env') return { useEnv: true, useDb: true }
  return { useEnv: true, useDb: true }
}

function getProviderEnvPrefix(providerId: string) {
  return `NUXT_OAUTH_${providerId.toUpperCase()}`
}

function resolveEncryptionKey(providerId: string) {
  const providerKey = `${getProviderEnvPrefix(providerId)}_ENCRYPTION_KEY`
  return process.env[providerKey] || process.env.NUXT_SECRET
}

function buildEnvConfig(providerId: string): OAuthProviderConfig {
  const prefix = getProviderEnvPrefix(providerId)
  const providersList = parseProvidersList(process.env.NUXT_OAUTH_PROVIDERS)
  const enabledOverride = parseBoolean(process.env[`${prefix}_ENABLED`])
  const clientId = process.env[`${prefix}_CLIENT_ID`]
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`]

  let enabled: boolean | undefined = enabledOverride
  if (enabled === undefined && providersList) {
    enabled = providersList.includes(providerId.toLowerCase())
  }
  if (enabled === undefined && clientId && clientSecret) {
    enabled = true
  }

  return {
    enabled,
    clientId,
    clientSecret
  }
}

async function buildDbConfig(providerId: string, event?: H3Event): Promise<OAuthProviderConfig> {
  const baseKey = `auth.oauth.${providerId}`
  const decryptKey = resolveEncryptionKey(providerId)
  const enabled = await getSettingValue<boolean>(DEFAULT_SCOPE, `${baseKey}.enabled`, undefined, event)
  const clientId = await getSettingValue<string>(DEFAULT_SCOPE, `${baseKey}.clientId`, undefined, event)
  const clientSecret = await getSettingValue<string>(DEFAULT_SCOPE, `${baseKey}.clientSecret`, { decryptKey }, event)
  const autoProvision = await getSettingValue<boolean>(DEFAULT_SCOPE, `${baseKey}.autoProvision`, undefined, event)
  return {
    enabled: enabled ?? undefined,
    clientId: clientId ?? undefined,
    clientSecret: clientSecret ?? undefined,
    autoProvision: autoProvision ?? undefined
  }
}

function mergeDefined(base: OAuthProviderConfig, override: OAuthProviderConfig) {
  const merged: OAuthProviderConfig = { ...base }
  for (const [key, value] of Object.entries(override)) {
    if (value !== undefined) {
      merged[key as keyof OAuthProviderConfig] = value as any
    }
  }
  return merged
}

export async function resolveOAuthProviderConfig(providerId: OAuthProviderId, event?: H3Event) {
  const source = resolveSettingsSource()
  const envConfig = source.useEnv ? buildEnvConfig(providerId) : {}
  const dbConfig = source.useDb ? await buildDbConfig(providerId, event) : {}
  return source.useEnv
    ? mergeDefined(dbConfig as OAuthProviderConfig, envConfig as OAuthProviderConfig)
    : dbConfig
}

export async function resolveCredentialsEnabled(event?: H3Event) {
  const source = resolveSettingsSource()
  const providersList = parseProvidersList(process.env.NUXT_OAUTH_PROVIDERS)
  const envEnabledOverride = parseBoolean(process.env.NUXT_OAUTH_CREDENTIALS_ENABLED)
  let enabled: boolean | undefined = envEnabledOverride

  if (enabled === undefined && providersList) {
    enabled = providersList.includes('credentials')
  }

  if (source.useDb) {
    const dbEnabled = await getSettingValue<boolean>(DEFAULT_SCOPE, 'auth.oauth.credentials.enabled', undefined, event)
    enabled = enabled ?? (dbEnabled ?? undefined)
  }

  return enabled ?? true
}
