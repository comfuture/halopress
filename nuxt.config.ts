// https://nuxt.com/docs/api/configuration/nuxt-config
const imageProvider = process.env.NUXT_IMAGE_PROVIDER
  || (process.env.CF_PAGES || process.env.CF_PAGES_URL ? 'cloudflare' : 'ipx')
const cloudflareBaseURL = process.env.NUXT_IMAGE_CLOUDFLARE_BASE_URL || process.env.CF_PAGES_URL

export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxt/ui', '@nuxt/image'],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  ui: {
    experimental: {
      componentDetection: true
    }
  },

  image: {
    provider: imageProvider,
    presets: {
      avatar: {
        modifiers: {
          width: 96,
          height: 96,
          fit: 'cover'
        }
      },
      card: {
        modifiers: {
          width: 640,
          height: 480,
          fit: 'cover'
        }
      },
      content: {
        modifiers: {
          width: 1200,
          fit: 'inside'
        }
      }
    },
    providers: {
      cloudflare: cloudflareBaseURL ? { baseURL: cloudflareBaseURL } : {}
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
