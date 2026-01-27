<script setup lang="ts">
import type { FormError } from '@nuxt/ui'

definePageMeta({
  layout: 'default'
})

const { data } = await useFetch('/api/system/install/status', { server: true })
if (data.value?.ready) {
  throw createError({ statusCode: 404, statusMessage: 'Not Found' })
}

const state = reactive({
  email: '',
  name: '',
  password: ''
})

const loading = ref(false)
const toast = useToast()

function validate(values: typeof state): FormError[] {
  const errors: FormError[] = []
  if (!values.email) errors.push({ name: 'email', message: 'Email is required' })
  if (!values.password) errors.push({ name: 'password', message: 'Password is required' })
  return errors
}

async function submit() {
  loading.value = true
  try {
    await $fetch('/api/system/install', {
      method: 'POST',
      credentials: 'include',
      body: { email: state.email, name: state.name, password: state.password }
    })
    await navigateTo('/', { replace: true })
  } catch (e: any) {
    toast.add({
      title: 'Install failed',
      description: e?.statusMessage || 'Please check the inputs and try again.',
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UContainer class="py-12">
    <div class="max-w-lg mx-auto">
      <UCard>
        <template #header>
          <div class="space-y-1">
            <h1 class="text-lg font-semibold">
              Initial Setup
            </h1>
            <p class="text-sm text-muted">
              This will create tables, seed core roles, and bootstrap your first schema.
            </p>
          </div>
        </template>

        <UForm :state="state" :validate="validate" class="space-y-4" @submit.prevent="submit">
          <UFormField label="Admin email" name="email" required>
            <UInput v-model="state.email" placeholder="admin@local" autocomplete="email" />
          </UFormField>

          <UFormField label="Admin name" name="name">
            <UInput v-model="state.name" placeholder="Admin" autocomplete="name" />
          </UFormField>

          <UFormField label="Admin password" name="password" required>
            <UInput v-model="state.password" type="password" autocomplete="new-password" />
          </UFormField>

          <UButton type="submit" block :loading="loading">
            Proceed
          </UButton>
        </UForm>
      </UCard>
    </div>
  </UContainer>
</template>
