// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  ui: {
    experimental: {
      componentDetection: true
    }
  },

  compatibilityDate: '2025-01-15',

  vite: {
    optimizeDeps: {
      include: [
        'prosemirror-state',
        'prosemirror-view'
      ]
    }
  },

  runtimeConfig: {
    authSecret: process.env.HALOPRESS_AUTH_SECRET || 'dev-secret-change-me',
    adminEmail: process.env.HALOPRESS_ADMIN_EMAIL || 'admin@local',
    adminPassword: process.env.HALOPRESS_ADMIN_PASSWORD || 'admin'
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
