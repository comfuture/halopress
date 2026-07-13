import { and, eq, ne, sql } from 'drizzle-orm'
import { getRequestURL } from 'h3'

import { getDb } from '../../db/db'
import { content as contentTable, schema as schemaTable, schemaActive as schemaActiveTable } from '../../db/schema'
import { requireAdmin } from '../../utils/auth'
import { BOOTSTRAP_CONTENT_ID, isBootstrapSchema } from '../../utils/bootstrap'
import { getGoogleAuthenticationSettings } from '../../utils/google-authentication-settings'
import { hasCustomDomain, hasImageTransformations } from '../../utils/onboarding'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const db = await getDb(event)
  const requestUrl = getRequestURL(event)

  const [activeSchemas, publishedContent, googleOAuth, imageTransformations] = await Promise.all([
    db
      .select({
        schemaKey: schemaActiveTable.schemaKey,
        version: schemaActiveTable.activeVersion,
        note: schemaTable.note
      })
      .from(schemaActiveTable)
      .innerJoin(schemaTable, and(
        eq(schemaTable.schemaKey, schemaActiveTable.schemaKey),
        eq(schemaTable.version, schemaActiveTable.activeVersion)
      ))
      .orderBy(schemaActiveTable.schemaKey),
    db
      .select({ total: sql<number>`count(1)` })
      .from(contentTable)
      .where(and(eq(contentTable.status, 'published'), ne(contentTable.id, BOOTSTRAP_CONTENT_ID)))
      .get(),
    getGoogleAuthenticationSettings(event),
    hasImageTransformations(event)
  ])

  const customSchemas = activeSchemas.filter((schema: { schemaKey: string, version: number, note: string | null }) => !isBootstrapSchema(schema))
  const publishedContentCount = Number(publishedContent?.total ?? 0)
  const isCloudflareRuntime = Boolean((event as any).context?.cloudflare)

  return {
    schemas: {
      complete: customSchemas.length > 0,
      count: customSchemas.length,
      firstSchemaKey: customSchemas[0]?.schemaKey ?? null
    },
    content: {
      complete: publishedContentCount > 0,
      count: publishedContentCount
    },
    customDomain: {
      complete: isCloudflareRuntime && hasCustomDomain(requestUrl.hostname),
      hostname: requestUrl.hostname
    },
    imageTransformations: {
      complete: imageTransformations
    },
    googleOAuth: {
      complete: googleOAuth.configured && googleOAuth.enabled,
      configured: googleOAuth.configured,
      enabled: googleOAuth.enabled
    }
  }
})
