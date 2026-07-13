export default defineNuxtRouteMiddleware(async (to) => {
  if (!to.path.startsWith('/_desk')) return
  if (to.path === '/_desk/login') return

  // Protected Desk APIs validate the request cookie directly on the server.
  // Avoid a second SSR call to /api/auth/session: Cloudflare Workers cannot
  // make an HTTP request back to the same Worker while rendering the page.
  if (import.meta.server) return

  const { status, data, getSession } = useAuth()
  if (status.value === 'authenticated' && data.value?.user) return
  if (status.value === 'unauthenticated') return await navigateTo('/_desk/login')

  const session = await getSession()
  if (!session) return await navigateTo('/_desk/login')
})
