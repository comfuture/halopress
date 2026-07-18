# Portable authored content

HaloPress keeps editor JSON as the canonical revision format and adds a safe HTML projection for consumers that do not run Vue, Nuxt UI, Tailwind, or HaloPress application code. The same projection is used by published Page delivery, public structured-content rich text, and the isolated Page editor preview.

## Page delivery

`GET /api/delivery/page/:id` preserves the existing Page response, including its raw `content`, and adds `rendering`:

```json
{
  "id": "welcome",
  "content": { "type": "doc", "content": [] },
  "rendering": {
    "contractVersion": 1,
    "html": "<article class=\"halo-content halo-page\">…</article>",
    "stylesheets": [
      "https://site.example/_halo/content/v1/CSS_SHA256.css"
    ],
    "themeRevision": "default"
  }
}
```

A headless client should insert the listed stylesheets once, then place `rendering.html` in its content slot. The HTML is server-sanitized and contains semantic elements, fixed `halo-*` classes, allowlisted `data-halo-*` values, and renderer-owned inline SVG icons. It contains no author-supplied HTML, class, style, ID, event handler, script, component identity, or runtime dependency.

The example at [`examples/portable-content/index.html`](../examples/portable-content/index.html) is a separate plain-HTML consumer. Set its fixed `data-halopress-origin` to the trusted HaloPress site, serve it from any static origin, and enter a published Page ID. It does not accept an auto-loading endpoint URL. Its content presentation comes only from that trusted API envelope and the referenced Halo stylesheet.

## Structured content

Public `GET /api/content/:schemaKey/:id` responses retain structured `content` and add a field-keyed projection:

```json
{
  "content": {
    "title": "Example",
    "body": { "type": "doc", "content": [] }
  },
  "rendering": {
    "contractVersion": 1,
    "stylesheets": [
      "https://site.example/_halo/content/v1/CSS_SHA256.css"
    ],
    "themeRevision": "default",
    "fields": {
      "body": {
        "fieldId": "body-field-id",
        "fieldKey": "body",
        "html": "<article class=\"halo-content halo-richtext\">…</article>"
      }
    }
  }
}
```

Field discovery uses the exact schema version that owns the returned working or published revision. Every schema-declared `richtext` field is projected, including a rich-text field assigned to the presentation description slot. Aggregate field, node, mark, recursion-depth, and output limits protect the projection; `rendering.truncated: true` reports aggregate exhaustion without changing the raw JSON.

Authenticated preview endpoints expose the same projection only after authorization. They remain `private, no-store`, include `X-Robots-Tag: noindex, nofollow, noarchive`, and do not enable public cross-origin caching.

## URLs, assets, and cache identity

Absolute URLs are derived at request time from a trusted canonical origin. Deployment domains are never stored in content rows. Production Node deployments must set the origin-only `NUXT_CANONICAL_ORIGIN`; Cloudflare can use its platform Request authority or set the same value to force a custom canonical domain. Host and forwarding headers must agree with that authority, so a merely syntactically valid Host is never trusted in production. This server-only seam is also the canonical source for future theme stylesheet URLs.

Link and media rules are separate: links allow safe HTTP(S), mail, telephone, and fragment destinations, while rich-text media must resolve to the delivery origin. Page block media and logos have the narrower `/assets/:id/raw` contract. Credentials, protocol-relative URLs, executable schemes, conflicting forwarded hosts, generic same-origin private paths, and untrusted origins are rejected.

New Page block media and logo values must use a site-owned `/assets/:id/raw` path. The editor advertises this form and save/publish validation rejects external logo or block-media URLs. Historical external logo JSON remains untouched; delivery renders an explicit text fallback instead of requesting the external image. Supported icon names are a finite authoring enum rendered from Halo-owned SVG geometry.

The base CSS URL contains the SHA-256 of its bytes. It is append-only and may therefore use one-year immutable caching plus a strong ETag. A compatible CSS correction creates a new digest URL and all new envelopes reference it; an incompatible markup or selector change introduces contract v2 while the v1 resource remains available.

Asset IDs are replaceable, so `/assets/:id/raw` is deliberately mutable: `Cache-Control: public, max-age=0, must-revalidate`. Its strong ETag is derived from the fetched object identity and selected content type. Replacement or a new representation changes the validator, and matching public conditional requests receive `304`. Public API envelopes include origin-dependent absolute URLs in their ETag identity and vary on the forwarded protocol.

## Malformed and retired content

Raw document keys and values are preserved for revisions and API compatibility. Save and publish paths validate currently supported blocks, icons, URLs, colors, variants, and site-owned assets. Delivery is lenient so historical unknown icons are omitted without discarding their otherwise valid block, while malformed, unknown, or retired blocks do not fail the whole response and become deterministic visible `halo-block-fallback` markup. Unsupported rich-text nodes and unavailable media likewise produce visible safe fallbacks.

Contract v1 markup and CSS are an external API. Additive response metadata and compatible CSS fixes may retain v1. Any change that removes or redefines stable v1 markup, attributes, or selector behavior requires a new contract version and coexistence with the old resources during client migration.
