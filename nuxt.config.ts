// https://nuxt.com/docs/api/configuration/nuxt-config
const isCloudflareBuild = process.env.WORKERS_CI === '1'
  || Boolean(process.env.CF_PAGES || process.env.CF_PAGES_URL)
const imageProvider = process.env.NUXT_IMAGE_PROVIDER
  || (isCloudflareBuild ? 'cloudflare' : 'ipx')
const cloudflareBaseURL = process.env.NUXT_IMAGE_CLOUDFLARE_BASE_URL || process.env.CF_PAGES_URL
const ipxAssetsAlias = process.env.NUXT_IPX_ALIAS_ASSETS || 'http://localhost:3000/assets'

export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxt/ui', '@nuxt/image', '@sidebase/nuxt-auth'],

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
    alias: imageProvider === 'ipx'
      ? { '/assets': ipxAssetsAlias }
      : {},
    cloudflare: cloudflareBaseURL ? { baseURL: cloudflareBaseURL } : {},
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
    }
  },

  compatibilityDate: '2026-05-18',

  nitro: {
    preset: 'cloudflare-module'
  },

  hooks: {
    'nitro:config'(nitroConfig) {
      // Sidebase's production origin assertion runs at Worker startup without a request.
      // On Cloudflare Workers the canonical origin is available from each request host.
      nitroConfig.plugins = nitroConfig.plugins?.filter(
        plugin => plugin && !plugin.includes('@sidebase/nuxt-auth/dist/runtime/server/plugins/assertOrigin')
      )
    }
  },

  vite: {
    optimizeDeps: {
      include: [
        'prosemirror-state',
        'prosemirror-view'
      ]
    }
  },

  runtimeConfig: {
    authSecret: 'dev-secret-change-me',
    authOrigin: 'http://localhost:3000/api/auth',
    installToken: '',
    secretKey: '',
    oauthGoogleEncryptionKey: '',
    oauthSettingsSource: 'env+db',
    oauthProviders: '',
    oauthCredentialsEnabled: '',
    oauthGoogleEnabled: '',
    oauthGoogleClientId: '',
    oauthGoogleClientSecret: ''
  },

  auth: {
    originEnvKey: 'NUXT_AUTH_ORIGIN',
    baseURL: '/api/auth',
    // Cloudflare Workers cannot make an HTTP request back to the same Worker.
    // Load the session in the browser after hydration instead of during SSR.
    disableServerSideAuth: true,
    provider: {
      type: 'authjs',
      trustHost: true,
      defaultProvider: 'credentials',
      addDefaultCallbackUrl: true
    },
    globalAppMiddleware: false
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
