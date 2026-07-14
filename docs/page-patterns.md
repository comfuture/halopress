# Page block and pattern library

HaloPress keeps atomic page blocks and reusable patterns as two different contracts.
Atomic blocks are the only stored component keys that the renderer accepts. Patterns
are reviewed, versioned JSON document fragments made only from those blocks.

## Included patterns

The first library includes centered and split heroes, a feature grid, a
media/content section, testimonial plus social proof, FAQ, closing CTA, and a
complete marketing starter page. New pages explicitly start blank or from the
starter. Every inserted block remains an ordinary top-level page block, so authors
can select, edit, move, duplicate, or delete it independently.

Patterns contain authored placeholders such as `[Add your primary promise]` and
`requiredAction` media notes. They never contain site-specific remote assets,
arbitrary component names, utility classes, event handlers, or executable values.

## Validation and compatibility

Each pattern declares:

- a stable key and positive integer version;
- the page editor and pattern-contract version it supports;
- the atomic block-registry version it targets;
- every required allowlisted block key.

The pattern validator rejects empty fragments, non-block nodes, unknown blocks,
undeclared required blocks, extra properties, unsafe URLs, malformed typed values,
and non-empty advanced payloads. Draft storage continues to preserve unknown legacy
blocks, while publish validation continues to reject unknown or malformed blocks.

## Upgrade behavior

Pattern insertion is **copy-on-insert**. The editor deep-clones the selected
version and materializes its blocks in one undoable transaction. Pattern identity
and version are not stored as a live template link.

Existing pages are never rewritten automatically when a pattern changes. A pattern
change publishes a new version for future insertions. Any future migration of
already inserted blocks must be explicit, separately reviewed, and compatible with
the normal draft and publish validation rules.

## Visual regression fixtures

`tests/fixtures/page-patterns.ts` provides stable, local-only documents and capture
metadata for every shipped pattern. Each version has both of these targets:

- desktop light mode at 1280 × 900;
- mobile dark mode at 390 × 844.

The matrix is derived from the registry, so adding a pattern without both targets
fails the completeness test. Fixtures use no remote assets and expose stable
pattern/version selectors for a screenshot runner. Responsive behavior comes from
the reviewed Nuxt UI page primitives; the FAQ uses Nuxt UI's keyboard-accessible
accordion.
