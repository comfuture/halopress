# Typed settings sections

HaloPress settings are feature-owned contracts, not a public or administrator-facing key/value editor.

The shared section registry in `shared/settings-sections.ts` owns stable Desk routes and distinguishes implemented sections from extension points. Each implemented server section must:

1. define a strict, versioned schema and safe defaults in `shared/`;
2. expose an administrator endpoint that calls `requireAdmin` before reading a body or database state;
3. store audit metadata (`groupKey`, `updatedBy`, `updatedAt`, and a descriptive note);
4. return management state instead of raw setting rows;
5. redact secrets and mark environment-managed values read-only; and
6. build any public response from an explicit projection rather than enumerating the settings table.

Site presentation is the reference implementation. `site.presentation` stores one atomic JSON document for General, Appearance, Shell, Navigation, and Footer. The update endpoint accepts complete typed section patches, validates the merged document, and retains referenced branding assets. The public delivery endpoint returns only resolved presentation values and fallbacks, with a revision-backed ETag and immediate revalidation so SSR and hydration use the same current contract.

Future Membership, Publishing, Integrations, and Operations features should replace their intentional empty states with the same pattern. They must not add fields to the site-presentation document unless those fields are part of the public shell contract.
