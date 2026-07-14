export default defineNuxtRouteMiddleware(async (to) => {
  if (!to.path.startsWith('/_desk')) return
  if (to.path === '/_desk/login') return await navigateTo('/login?callbackUrl=/_desk')

  // Protected Desk APIs validate the request cookie directly on the server.
  // Avoid a second SSR call to /api/auth/session: Cloudflare Workers cannot
  // make an HTTP request back to the same Worker while rendering the page.
  if (import.meta.server) return

  const { status, data, getSession } = useAuth()
  if (status.value === 'authenticated' && data.value?.user) {
    return data.value.user.role === 'admin' && data.value.user.accountType === 'staff'
      ? undefined
      : await navigateTo('/')
  }
  if (status.value === 'unauthenticated') {
    return await navigateTo(`/login?callbackUrl=${encodeURIComponent(to.fullPath)}`)
  }

  const session = await getSession()
  if (!session?.user) return await navigateTo(`/login?callbackUrl=${encodeURIComponent(to.fullPath)}`)
  if (session.user.role !== 'admin' || session.user.accountType !== 'staff') return await navigateTo('/')
})
