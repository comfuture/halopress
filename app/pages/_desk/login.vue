<script setup lang="ts">
definePageMeta({
  layout: 'default'
})

const state = reactive({
  identifier: '',
  password: ''
})

const loading = ref(false)
const toast = useToast()
const { signIn } = useAuth()

async function submit() {
  loading.value = true
  try {
    const result = await signIn('credentials', {
      identifier: state.identifier,
      password: state.password,
      redirect: false,
      callbackUrl: '/_desk'
    })

    if (result?.error) {
      throw new Error(result.error)
    }

    await navigateTo('/_desk', { replace: true })
  } catch (e: any) {
    toast.add({
      title: 'Login failed',
      description: e?.statusMessage || 'Invalid credentials',
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UContainer class="py-12">
    <div class="max-w-md mx-auto">
      <UCard>
        <template #header>
          <div class="space-y-1">
            <h1 class="text-lg font-semibold">
              Desk Login
            </h1>
            <p class="text-sm text-muted">
              Sign in with the admin email/username created in `/_install` or `HALOPRESS_ADMIN_EMAIL` / `HALOPRESS_ADMIN_PASSWORD`.
            </p>
          </div>
        </template>

        <UForm :state="state" class="space-y-4" @submit.prevent="submit">
          <UFormField label="Email or username" name="identifier">
            <UInput v-model="state.identifier" placeholder="admin@local" autocomplete="username" />
          </UFormField>

          <UFormField label="Password" name="password">
            <UInput v-model="state.password" type="password" autocomplete="current-password" />
          </UFormField>

          <UButton type="submit" block :loading="loading">
            Sign in
          </UButton>
        </UForm>
      </UCard>
    </div>
  </UContainer>
</template>
