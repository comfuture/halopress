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

Site feature availability is a separate administrator-owned contract. `site.mode` stores the strict versioned `{ version: 1, enabled: boolean }` document and defaults to disabled when the row is missing or malformed. Enabling it exposes the Site administration area in Desk; disabling it hides that area without deleting `site.presentation`, content, pages, or future Theme, SiteLayout, and Menu resources. There is intentionally no public `site.mode` endpoint.

## Site menu resources

Named menus are stored as whole, versioned documents in `site_menu_set`. Every set has a stable resource ID, a case-insensitively unique name, audit timestamps/actors, and an ordered tree limited to one child level. Persisted items use HaloPress-owned typed destinations plus an allowlisted icon, scalar badge, optional stable value, and immutable item ID; Nuxt UI runtime callbacks, router objects, classes, slots, and UI state are never stored.

Migration `0008_add_site_menu_sets` creates only the menu and normalized-reference tables. New installations establish **Global navigation** and its built-in public-shell reference before installation is marked complete; upgraded installations create them on the first new-code presentation or menu request. The resource uses the stable ID `global-navigation` and remains bootstrap-owned through rolling deployment. While that ownership remains, every new-code resolution compares the stored source timestamp and document with the current `site.presentation.navigation.items`, reconciles a newer old-Worker save with a checked update, and repeats the source read until it is stable. This closes the migration-before-deploy and read-to-commit interleavings without copying a stale value in SQL. The first successful named-menu save clears bootstrap ownership in the same checked menu update; from that atomic cutover onward, Global is the sole writable navigation source and later legacy writes are intentionally ignored. The old value then remains only as a missing-table rolling-deploy fallback. Normal public rendering and the legacy presentation GET project Global navigation, while all new writes go through `/_desk/site/menus` and `/api/site/menus`.

Menu saves replace the name and full document in one checked database update, so validation failures cannot partially apply a reorder. `site_menu_reference` stores public-resource usage with an `ON DELETE RESTRICT` foreign key. Deletion uses a single conditional statement and verifies the affected row, while the FK remains authoritative if a future `SiteLayout` adds a reference concurrently. This is the extension seam for persisted `SiteLayout` references; it must never point at Nuxt `app/layouts/*.vue` files.

## SiteLayout boundary

`SiteLayout` is the HaloPress domain name for a persisted public page-layout resource and rendering contract. It is not a Nuxt application layout. The boundary is intentional:

- `SiteLayout*` models and services may describe public page regions, elements, and composition.
- `SiteAdmin*` components and `/_desk/site/**` routes are administrator UI only.
- `app/layouts/*.vue` remains Nuxt application infrastructure and must never be selected, serialized, or exposed as a SiteLayout resource.
- Public rendering may consume only an explicit, validated SiteLayout projection. It must never import Desk components, Desk routes, or Nuxt layout files as Site content.

The Site foundation does not change public rendering. A later renderer integration must require an enabled Site mode and an explicitly selected SiteLayout before composing the public page; otherwise the existing public presentation remains active.

Membership uses the same typed-section pattern with one atomic `auth.membership.policy` JSON value. It controls disabled, open, invitation-only, and approval-required admission separately from provider credentials. Invitation codes are email-bound, expiring, single-use values whose hashes are stored in the database. See [Public membership and authentication](./AUTH_MEMBERSHIP.md) for canonical-email migration behavior, stable Google identity linking, rate limits, session enforcement, and recovery limitations.

Future Publishing, Integrations, and Operations features should replace their intentional empty states with the same pattern. They must not add fields to the site-presentation document unless those fields are part of the public shell contract.
