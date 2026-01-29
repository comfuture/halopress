<script setup lang="ts">
import type { FormError, StepperItem } from '@nuxt/ui'

definePageMeta({
  layout: 'default'
})

const { data } = await useFetch('/api/system/install/status', { server: true })
if (data.value?.ready) {
  throw createError({ statusCode: 404, statusMessage: 'Not Found' })
}

const steps = [
  {
    title: 'Admin account',
    description: 'Create the first admin login for the desk',
    icon: 'i-lucide-user-cog',
    slot: 'admin' as const
  },
  {
    title: 'Sample schema',
    description: 'Decide if you want starter content',
    icon: 'i-lucide-sparkles',
    slot: 'sample' as const
  },
  {
    title: 'Review',
    description: 'Confirm and complete setup',
    icon: 'i-lucide-check-circle-2',
    slot: 'review' as const
  }
] satisfies StepperItem[]

const activeStep = ref(0)
const adminForm = ref<any>(null)

const state = reactive({
  email: '',
  name: '',
  password: '',
  passwordConfirm: '',
  sampleData: true
})

const loading = ref(false)
const toast = useToast()

const summaryItems = computed(() => [
  {
    label: 'Admin email',
    value: state.email || 'Not set yet'
  },
  {
    label: 'Admin name',
    value: state.name?.trim() ? state.name.trim() : 'Not set'
  },
  {
    label: 'Sample schema + Welcome guide',
    value: state.sampleData ? 'Create' : 'Skip'
  }
])

function validate(values: typeof state): FormError[] {
  const errors: FormError[] = []
  if (!values.email) errors.push({ name: 'email', message: 'Email is required' })
  if (!values.password) errors.push({ name: 'password', message: 'Password is required' })
  if (!values.passwordConfirm) errors.push({ name: 'passwordConfirm', message: 'Please confirm your password' })
  if (values.password && values.passwordConfirm && values.password !== values.passwordConfirm) {
    errors.push({ name: 'passwordConfirm', message: 'Passwords do not match' })
  }
  return errors
}

async function advanceFromAdmin() {
  if (loading.value) return
  const errors = await adminForm.value?.validate()
  if (errors?.length) return
  activeStep.value = 1
}

function goBack() {
  if (loading.value) return
  activeStep.value = Math.max(0, activeStep.value - 1)
}

function goNext() {
  if (loading.value) return
  activeStep.value = Math.min(2, activeStep.value + 1)
}

async function fireConfetti() {
  if (!import.meta.client) return
  const module = await import('canvas-confetti')
  const confetti = module.default
  const endAt = Date.now() + 3000
  const interval = window.setInterval(() => {
    if (Date.now() > endAt) {
      window.clearInterval(interval)
      return
    }
    confetti({
      particleCount: 6,
      spread: 70,
      startVelocity: 25,
      gravity: 0.9,
      origin: { x: Math.random(), y: 0.15 }
    })
  }, 180)
  await new Promise(resolve => setTimeout(resolve, 3000))
}

async function completeSetup() {
  if (loading.value) return
  loading.value = true
  try {
    await $fetch('/api/system/install', {
      method: 'POST',
      credentials: 'include',
      body: {
        email: state.email,
        name: state.name,
        password: state.password,
        sampleData: state.sampleData
      }
    })

    await fireConfetti()
    await navigateTo('/_desk', { replace: true })
  } catch (e: any) {
    toast.add({
      title: 'Setup failed',
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
    <div class="max-w-3xl mx-auto space-y-6">
      <div class="space-y-2">
        <h1 class="text-2xl font-semibold">
          Halopress setup wizard
        </h1>
        <p class="text-sm text-muted">
          Follow the steps below to prepare your database, create an admin account, and optionally
          generate a starter Article schema with a Welcome guide.
        </p>
      </div>

      <UCard>
        <UStepper v-model="activeStep" :items="steps" disabled class="w-full">
          <template #admin>
            <div class="space-y-6">
              <div class="space-y-2">
                <h2 class="text-lg font-semibold">
                  Step 1: Create your admin account
                </h2>
                <p class="text-sm text-muted">
                  This account will own the initial system setup and gives you access to the desk. Use
                  a real email address so you can recover access later.
                </p>
              </div>

              <UForm ref="adminForm" :state="state" :validate="validate" class="space-y-4" @submit.prevent="advanceFromAdmin">
                <UFormField
                  label="Admin email"
                  name="email"
                  required
                  help="Used for sign-in and password resets. We recommend an inbox you control."
                >
                  <UInput v-model="state.email" class="w-full" placeholder="admin@local" autocomplete="email" />
                </UFormField>

                <div class="flex flex-col gap-4 md:flex-row">
                  <UFormField
                    label="Admin password"
                    name="password"
                    required
                    help="Choose a strong password. You will use this for the first login."
                    class="flex-1"
                  >
                    <UInput v-model="state.password" class="w-full" type="password" autocomplete="new-password" />
                  </UFormField>

                  <UFormField
                    label="Confirm password"
                    name="passwordConfirm"
                    required
                    help="Type the same password again to confirm."
                    class="flex-1"
                  >
                    <UInput v-model="state.passwordConfirm" class="w-full" type="password" autocomplete="new-password" />
                  </UFormField>
                </div>

                <UFormField
                  label="Admin name"
                  name="name"
                  help="Shown in author bylines and audit trails. You can update it later."
                >
                  <UInput v-model="state.name" class="w-full" placeholder="Admin" autocomplete="name" />
                </UFormField>

                <div class="flex items-center justify-end">
                  <UButton type="submit" trailing-icon="i-lucide-arrow-right" :loading="loading">
                    Next
                  </UButton>
                </div>
              </UForm>
            </div>
          </template>

          <template #sample>
            <div class="space-y-6">
              <div class="space-y-2">
                <h2 class="text-lg font-semibold">
                  Step 2: Sample schema and data
                </h2>
                <p class="text-sm text-muted">
                  You can start with a ready-to-edit Article schema and a Welcome guide article, or
                  skip this step and build your own schema later in the desk.
                </p>
              </div>

              <UFormField
                label="Starter content"
                name="sampleData"
                help="Creates an Article schema, publishes a Welcome guide, and sets anonymous read access."
              >
                <div class="flex items-center justify-between gap-6 rounded-lg border border-muted px-4 py-3">
                  <div>
                    <p class="text-sm font-medium text-foreground">
                      Create a sample schema
                    </p>
                    <p class="text-xs text-muted">
                      Recommended for first-time setups. You can delete or modify it anytime.
                    </p>
                  </div>
                  <USwitch v-model="state.sampleData" />
                </div>
              </UFormField>

              <div class="flex items-center justify-between">
                <UButton leading-icon="i-lucide-arrow-left" variant="ghost" color="neutral" @click="goBack">
                  Back
                </UButton>
                <UButton trailing-icon="i-lucide-arrow-right" :loading="loading" @click="goNext">
                  Next
                </UButton>
              </div>
            </div>
          </template>

          <template #review>
            <div class="space-y-6">
              <div class="space-y-2">
                <h2 class="text-lg font-semibold">
                  Step 3: Review and complete
                </h2>
                <p class="text-sm text-muted">
                  Confirm the setup choices below. When you complete setup we will run migrations,
                  create the admin account, insert the default roles, and optionally generate the sample
                  schema and Welcome guide.
                </p>
              </div>

              <div class="rounded-lg border border-muted bg-default px-4 py-3">
                <div v-for="item in summaryItems" :key="item.label" class="flex items-center justify-between py-1 text-sm">
                  <span class="text-muted">{{ item.label }}</span>
                  <span class="font-medium text-foreground">{{ item.value }}</span>
                </div>
              </div>

              <div class="flex items-center justify-between">
                <UButton leading-icon="i-lucide-arrow-left" variant="ghost" color="neutral" @click="goBack">
                  Back
                </UButton>
                <UButton color="primary" :loading="loading" @click="completeSetup">
                  Complete setup
                </UButton>
              </div>
            </div>
          </template>
        </UStepper>
      </UCard>
    </div>
  </UContainer>

</template>
