# Typed settings sections

HaloPress settings are feature-owned contracts, not a public or administrator-facing key/value editor.

The shared section registry in `shared/settings-sections.ts` owns stable Desk routes and distinguishes implemented sections from extension points. Each implemented server section must:

1. define a strict, versioned schema and safe defaults in `shared/`;
2. expose an administrator endpoint that calls `requireAdmin` before reading a body or database state;
3. store audit metadata (`groupKey`, `updatedBy`, `updatedAt`, and a descriptive note);
4. return management state instead of raw setting rows;
5. redact secrets and mark environment-managed values read-only; and
6. build any public response from an explicit projection rather than enumerating the settings table.

Site presentation is the reference implementation. `site.presentation` stores one atomic JSON document for General, Appearance, Shell, the legacy Navigation snapshot, and Footer. The update endpoint accepts complete typed General, Appearance, Shell, and Footer patches, validates the merged document, and retains referenced branding assets. Navigation writes have moved to named Site menu resources; an old Navigation patch is rejected with the stable Global menu ID and its Desk location. The public delivery endpoint returns only resolved presentation values and fallbacks, with a revision-backed ETag computed from the final canonicalized projection so SSR and hydration use the same current contract.

Site feature availability is a separate administrator-owned contract. `site.mode` stores the strict versioned `{ version: 1, enabled: boolean }` document and defaults to disabled when the row is missing or malformed. Enabling it exposes the Site administration area in Desk; disabling it hides that area without deleting `site.presentation`, content, pages, Theme artifacts, Layout resources, or menus. There is intentionally no public `site.mode` endpoint. The minimal enabled flag is projected through the public Theme manifest so anonymous Site SSR can gate only its shell adapter without reading an administrator endpoint.

## Active Site Theme

`site.theme.active` stores one strict Theme v1 document plus bootstrap ownership, source identity, audit metadata, and the last mutation token. Before the first Theme save, public resolution deterministically adapts the canonical `site.presentation.appearance` values but never establishes or mutates active bootstrap ownership; a first advertisement may append the exact immutable CSS artifact once before returning its digest URL. The administrator editor establishes/reconciles a bootstrap-owned snapshot, and its first save atomically verifies the exact legacy source row, appends the currently advertised and next CSS artifacts, then transfers ownership with a compare-and-swap. If an old Worker races an Appearance write, the Theme save detects the changed source and returns a revision conflict instead of silently losing data. Competing Theme editors are likewise fenced. After ownership transfers, new-code enabled-mode Appearance writes are rejected with the `/_desk/site/themes` location; the legacy value remains compatibility metadata. Disabling Site mode restores Appearance as the built-in shell writer without deleting the canonical Theme or its artifacts.

Immutable CSS bytes are stored append-only under `site.theme.artifact.<css-sha256>`. The active Theme document revision hashes normalized editable data, while the stylesheet revision hashes exact compiled bytes. The stable public `/api/delivery/site-theme` projection contains the trusted absolute digest URL and the Site-mode shell flag; digest routes never reconstruct customized historical artifacts from only the current row. The built-in v1 default has a pinned source-controlled digest for missing-table install requests. A malformed active value falls back visibly and safely for rendering but is not overwritten by a GET; a conflicting artifact row fails closed.

Theme v1 supports semantic colors, ordered radii, portable spacing/width tokens, base type size, body/heading line heights, and predefined local/system font stacks only. The allowlisted Public Sans stack uses the installed face in HaloPress and falls through to `ui-sans-serif`/system fonts in a portable consumer without making a network request. Raw CSS, remote URLs, credentials, arbitrary font names/files, nonfinite numbers, and unknown fields are rejected. Contrast and surface-separation findings are returned as nonblocking warnings. The published CSS contract contains only `--halo-*` variables and `.halo-content` behavior. The Nuxt Site shell maps those tokens into Nuxt UI variables in app-only infrastructure when Site mode is enabled; `--ui-*` is never stored or published as a portable contract.

Bootstrap adaptation retains the legacy primary, neutral, status, radius, and type-scale choices with Halo-owned sRGB equivalents of the source-controlled OKLCH palettes. This preserves the standard sRGB rendering path; it is not a claim of bit-identical output on wide-gamut displays.

## Site menu resources

Named menus are stored as whole, versioned documents in `site_menu_set`. Every set has a stable resource ID, a case-insensitively unique name, audit timestamps/actors, and an ordered tree limited to one child level. Persisted items use HaloPress-owned typed destinations plus an allowlisted icon, scalar badge, optional stable value, and immutable item ID; Nuxt UI runtime callbacks, router objects, classes, slots, and UI state are never stored.

Migration `0008_add_site_menu_sets` creates only the menu and normalized-reference tables. New installations establish **Global navigation** and its built-in public-shell reference before installation is marked complete; upgraded installations create them on the first new-code presentation or menu request. The resource uses the stable ID `global-navigation` and remains bootstrap-owned through rolling deployment. While that ownership remains, every new-code resolution compares the stored source timestamp and document with the current `site.presentation.navigation.items`, reconciles a newer old-Worker save with a checked update, and repeats the source read until it is stable. This closes the migration-before-deploy and read-to-commit interleavings without copying a stale value in SQL. The first successful named-menu save clears bootstrap ownership in the same checked menu update; from that atomic cutover onward, Global is the sole writable navigation source and later legacy writes are intentionally ignored. The old value then remains only as a missing-table rolling-deploy fallback. Normal public rendering and the legacy presentation GET project Global navigation, while all new writes go through `/_desk/site/menus` and `/api/site/menus`.

Menu saves replace the name and full document in one checked database update, so validation failures cannot partially apply a reorder. `site_menu_reference` stores public-resource usage with an `ON DELETE RESTRICT` foreign key. Deletion uses a single conditional statement and verifies the affected row, while the FK remains authoritative if a future Layout adds a reference concurrently. Persisted Layout-owned rows use the storage namespace `owner_type='site-layout'`; they never point at Nuxt `app/layouts/*.vue` files.

## Layout resources

`Layout` is the HaloPress domain name for a persisted public page-layout resource and rendering contract. It is not a Nuxt application layout. The boundary is intentional:

- `LayoutDocument`, `LayoutResource`, `LayoutElement`, `LayoutPreset`, and later `LayoutRenderer` describe public page regions, semantic elements, and composition.
- `SiteAdmin*` components and `/_desk/site/**` routes are administrator UI only.
- `app/layouts/*.vue` remains Nuxt application infrastructure and must never be selected, serialized, or exposed as a persisted Layout resource.
- Public rendering may consume only an explicit, validated Layout projection. It must never import Desk components, Desk routes, Nuxt layout files, component IDs, classes, templates, or runtime lookup keys as Site content.

Migration `0009_add_site_layout_documents` creates `site_layout_resource` for stable identity/current-save metadata and `site_layout_reference` for future Site/Schema/Page assignments. Every create/save appends immutable `document_revision` history with `document_kind='layout'`; a stable Layout ID always resolves its current active revision. Layout-owned Menu references are replaced in the same SQLite transaction or D1 batch, and both restrictive foreign keys remain authoritative for concurrent deletion races.

`LayoutDocument` v1 stores only finite responsive grid placement, named regions, stable semantic element IDs, and strictly typed properties. It requires exactly one Page content element. Menu elements store a live `menuSetId` and orientation rather than copied navigation items. Source-controlled presets are deep-frozen, validated, and deep-cloned only at creation time, so later code or returned-object changes cannot mutate an existing Layout. Strict parsing canonicalizes regions and elements before persistence and projection, making document JSON deterministic even when an input array arrives shuffled.

The admin APIs under `/api/site/layouts` provide list/read/create/save/rename/duplicate/delete/usage operations with optimistic revision preconditions. Malformed stored JSON produces an explicit `repair-required` management and resolver state; raw malformed data is never projected into a renderer. #73 must provide an exhaustive code-owned `LayoutRendererRegistry` keyed only by a validated semantic element `type`. That registry is not serialized or returned by the API, and runtime code must never import or resolve a component from a database string.

The Theme integration does not create or select a Layout. A later Layout renderer must still require an enabled Site mode and an explicitly selected persisted Layout before composing public regions; otherwise the existing Nuxt public shell remains active. Theme resources, Menu resources, persisted Layouts, and Nuxt application layouts remain separate contracts.

See [Layout resource contract](./site-layouts.md) for the complete document, preset, revision, API, reference, and renderer-extension rules.

Membership uses the same typed-section pattern with one atomic `auth.membership.policy` JSON value. It controls disabled, open, invitation-only, and approval-required admission separately from provider credentials. Invitation codes are email-bound, expiring, single-use values whose hashes are stored in the database. See [Public membership and authentication](./AUTH_MEMBERSHIP.md) for canonical-email migration behavior, stable Google identity linking, rate limits, session enforcement, and recovery limitations.

Future Publishing, Integrations, and Operations features should replace their intentional empty states with the same pattern. They must not add fields to the site-presentation document unless those fields are part of the public shell contract.
