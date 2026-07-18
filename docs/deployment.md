# Deployment and Desk onboarding

HaloPress runs in local Nuxt development, on a production Node server, or on
Cloudflare Workers. The Desk setup checklist adapts to the runtime that is
actually serving the request.

| Runtime | Setup checklist | Media processing |
| --- | --- | --- |
| Local development | Schema, content, Google OAuth | IPX; no domain or Cloudflare Images task |
| Node production | Schema, content, public site URL, Google OAuth | IPX; no Cloudflare Images task |
| Cloudflare Workers | Schema, content, custom domain, Image Transformations, Google OAuth | Cloudflare Images with raw-asset fallback |

Nuxt development mode selects local setup, including when the Cloudflare Nitro
preset supplies emulated Worker context to the dev server. Outside development,
the server selects Cloudflare only when the Worker runtime supplies Cloudflare
request context; a production request without that context selects Node. A
request `Host` can report whether the already-selected Node or Cloudflare domain
recommendation is complete, but it cannot enable Cloudflare links, probes, or
capabilities.

## Local development

Run the standard development server:

```bash
pnpm dev
```

With this repository's Cloudflare Nitro preset, `pnpm dev` supplies local D1 and
R2 emulation. Development with no Cloudflare bindings instead uses
`.data/halopress.sqlite` and `.data/r2/`. In either case, Nuxt development uses
the local onboarding checklist and the IPX image provider. A custom domain and
Cloudflare Image Transformations are not local setup requirements, so neither
appears in the Desk checklist or blocks its completion.

## Node production

Build HaloPress for Nitro's Node server preset and start the generated entry
point:

```bash
pnpm exec nuxt build --preset node-server
NODE_ENV=production HOST=0.0.0.0 PORT=3000 node .output/server/index.mjs
```

Set a strong `NUXT_AUTH_SECRET`, the public authentication origin, and the
canonical site origin in the runtime environment. The auth origin includes
`/api/auth`; the canonical origin is origin-only:

```bash
export NUXT_AUTH_SECRET="replace-with-a-strong-random-secret"
export NUXT_AUTH_ORIGIN="https://cms.example.com/api/auth"
export NUXT_CANONICAL_ORIGIN="https://cms.example.com"
```

Put TLS and any public routing in front of the Node process with the hosting
platform or a reverse proxy. The proxy must overwrite `Host`, forwarded host,
and forwarded protocol with the canonical external authority instead of passing
caller-supplied values. Production Node delivery fails closed without
`NUXT_CANONICAL_ORIGIN`; mismatched requests cannot influence absolute API,
asset, or stylesheet URLs. A provider-assigned hostname and a custom domain are both valid public
origins; loopback, private-address, single-label, and
internal-only hosts remain incomplete in the advisory Desk checklist.

Node uses the same SQLite and filesystem asset adapters as local development.
Mount persistent storage for `.data/halopress.sqlite` and `.data/r2/`; an
ephemeral application filesystem will lose content and uploads when the instance
is replaced. Database or asset adapter redesign and provider-specific packaging
are outside this guide.

## Cloudflare production

Cloudflare deployments continue to use D1, R2, and the Worker deployment flow in
the [README](../README.md#cloudflare-deployment-details). The Desk keeps both
Cloudflare-specific recommendations:

- Add a [Workers custom domain](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).
  A `workers.dev` or `pages.dev` platform hostname leaves this recommendation
  open; a custom hostname completes it.
- Enable [Image Transformations](https://developers.cloudflare.com/images/optimization/transformations/overview/).
  HaloPress completes this recommendation only after a live image request returns
  transformed WebP output with Cloudflare resize evidence.

Cloudflare-looking request hostnames do not activate these recommendations on
Node or local runtimes. Worker request context—not a caller-controlled header—is
the platform authority. `NUXT_CANONICAL_ORIGIN` is optional on Cloudflare when
the platform Request URL is the intended public origin; configure it to require
a specific custom domain and reject alternate workers.dev authority.

## Checklist completion and dismissal

Schema creation, content publication, and Google OAuth status keep the same
completion rules in every runtime. Platform-specific items count only when they
apply. The progress maximum and completed count therefore vary with the runtime,
and the widget automatically hides after every applicable item is complete.

Dismissal remains browser-local through the Desk onboarding cookie. Dismissing
the widget prevents its initial status request in that browser; it does not mark
server-side setup tasks complete or change another browser's checklist.
