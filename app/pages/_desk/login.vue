<script setup lang="ts">
definePageMeta({
  layout: 'blank'
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
  <div class="min-h-screen bg-muted/60 px-6 py-12 flex items-center justify-center">
    <div class="w-full max-w-md">
      <UCard variant="subtle" class="shadow-lg ring-1 ring-muted/30">
        <template #header>
          <div class="space-y-1">
            <h1 class="text-xl font-semibold">
              HaloPress Login
            </h1>
          </div>
        </template>

        <UForm :state="state" class="space-y-4" @submit.prevent="submit">
          <UFormField label="Email or username" name="identifier">
            <UInput v-model="state.identifier" class="w-full" placeholder="admin@local" autocomplete="username" />
          </UFormField>

          <UFormField label="Password" name="password">
            <UInput v-model="state.password" class="w-full" type="password" autocomplete="current-password" />
          </UFormField>

          <UButton type="submit" block :loading="loading">
            Sign in
          </UButton>
        </UForm>
      </UCard>
    </div>
  </div>
</template>
