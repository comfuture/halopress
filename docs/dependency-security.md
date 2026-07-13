# Dependency security maintenance

## 2026-07-13 baseline

Before this refresh, GitHub reported 120 open Dependabot alerts: 2 critical, 50 high, 51 medium, and 17 low. Fourteen alerts were direct and 106 were transitive. `pnpm audit` reported 123 vulnerable paths (2 critical, 52 high, 51 moderate, and 18 low), while `pnpm audit --prod` reported 113 paths (2 critical, 48 high, 47 moderate, and 16 low).

The coordinated upgrade keeps Nuxt, database, Cloudflare, and editor owners on their patched compatible releases. Two narrowly scoped compatibility rules remain necessary.

## Auth.js v4 compatibility bridge

- **Owners:** Sidebase and Auth.js.
- **Pinned graph:** `@sidebase/nuxt-auth@1.3.1` and `next-auth@4.24.14`.
- **Upstream status:** Sidebase still imports the framework-neutral `AuthHandler` from the private `next-auth/core` path and declares `next-auth ~4.21.1`. The compatibility break is tracked in [sidebase/nuxt-auth#514](https://github.com/sidebase/nuxt-auth/issues/514), and the supported migration away from this private v4 API remains open in [sidebase/nuxt-auth#673](https://github.com/sidebase/nuxt-auth/issues/673). The current implementation is visible in [Sidebase's v1.3.1 handler](https://github.com/sidebase/nuxt-auth/blob/v1.3.1/src/runtime/server/services/authjs/nuxtAuthHandler.ts).
- **Patch:** `patches/next-auth@4.24.14.patch` restores only the `./core` export that `next-auth@4.24.14` still ships as `core/index.js` and `core/index.d.ts`. No Auth.js runtime code is changed.
- **Peer rules:** The package-scoped pnpm overrides remove only `next-auth@4.24.14`'s unused `next`, `react`, and `react-dom` peers. HaloPress is a Nuxt application and reaches NextAuth through Sidebase's core handler, provider factories, and JWT helpers; it does not use the Next.js adapter or React client. pnpm documents both [package-scoped overrides and peer removal](https://pnpm.io/settings#overrides). The Sidebase-only `allowedVersions` entry records the tested patched v4 exception without weakening other peer checks.
- **Removal condition:** Remove the export patch and peer rules when Sidebase publishes a stable release that supports a patched NextAuth v4 export contract or completes its stable `@auth/core` migration. Re-run the auth, Nitro, and Cloudflare smoke tests before removing the exact version pins.

The private `next-auth/core` API is the residual compatibility risk. Exact versions, a patch checksum in the lockfile, dependency-contract tests, and build/runtime smoke tests prevent it from drifting silently.

## Tiptap alignment

- **Owners:** Tiptap and Nuxt UI.
- **Rule:** All ordinary Tiptap packages are exact-aligned at `3.27.3`; `@tiptap/y-tiptap` follows its separate release line at `3.0.6`. Direct Nuxt UI editor peers are explicit so pnpm cannot auto-install an older peer cohort.
- **Reason:** Tiptap extensions share core and ProseMirror types at runtime. HaloPress previously documented a mixed-version editor failure in [PR #6](https://github.com/comfuture/halopress/pull/6), while Nuxt UI 4.9 declares Tiptap 3 peers in its [package manifest](https://github.com/nuxt/ui/blob/v4.9.0/package.json). Shared editor profiles are also tracked by [issue #25](https://github.com/comfuture/halopress/issues/25).
- **Removal condition:** Remove explicit peer packages or overrides only after Nuxt UI and every direct editor consumer resolve one cohort without them, then pass the dependency-contract test, server-side rich-text rendering test, typecheck, and production build.
