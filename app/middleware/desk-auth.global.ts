export default defineNuxtRouteMiddleware(async (to) => {
  if (!to.path.startsWith('/_desk')) return
  if (to.path === '/_desk/login') return

  const { data } = await useFetch('/api/auth/me')
  if (!data.value?.user) return await navigateTo('/_desk/login')
})

