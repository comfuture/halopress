export default defineNuxtRouteMiddleware(async (to) => {
  if (!to.path.startsWith('/_desk')) return
  if (to.path === '/_desk/login') return

  const { status, data, getSession } = useAuth()
  if (status.value === 'authenticated' && data.value?.user) return
  if (status.value === 'unauthenticated') return await navigateTo('/_desk/login')

  const session = await getSession()
  if (!session) return await navigateTo('/_desk/login')
})
