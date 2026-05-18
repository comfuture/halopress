// https://nuxt.com/docs/api/configuration/nuxt-config
const imageProvider = process.env.NUXT_IMAGE_PROVIDER
  || (process.env.CF_PAGES || process.env.CF_PAGES_URL ? 'cloudflare' : 'ipx')
const cloudflareBaseURL = process.env.NUXT_IMAGE_CLOUDFLARE_BASE_URL || process.env.CF_PAGES_URL
const siteURL = process.env.NUXT_PUBLIC_SITE_URL || process.env.CF_PAGES_URL || 'http://localhost:3000'
const siteHost = (() => {
  try {
    return new URL(siteURL).hostname
  } catch {
    return 'localhost'
  }
})()
const ipxHttpDomains = (process.env.NUXT_IPX_HTTP_DOMAINS
  ? process.env.NUXT_IPX_HTTP_DOMAINS.split(',').map(domain => domain.trim()).filter(Boolean)
  : [siteHost, 'localhost', '127.0.0.1'].filter(Boolean))
const ipxAssetsAlias = process.env.NUXT_IPX_ALIAS_ASSETS || `${siteURL}/assets`

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
    domains: ipxHttpDomains,
    alias: {
      '/assets': ipxAssetsAlias
    },
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

  compatibilityDate: '2026-05-18',

  nitro: {
    preset: 'cloudflare-module'
  },

  routeRules: {
    '/_install': {
      // Sidebase reads this custom nested route rule, but Nuxt's routeRules type does not include it.
      auth: {
        disableServerSideAuth: true
      }
    } as any
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
