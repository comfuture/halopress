# Korean full-text search operations

HaloPress treats the D1 FTS5 index as rebuildable derived data. Content and
immutable publication revisions remain authoritative. Publishing, unpublishing,
deleting, and publishing a Schema write a durable `full_text_job` row in the same
SQLite transaction or D1 batch as the source mutation. Queue delivery only wakes
the auxiliary Worker; the five-minute scheduled reconciler redispatches pending
or expired leases after a failed wake-up.

## Topology

- The main `halopress` Worker publishes small job identities to
  `SEARCH_INDEX_QUEUE`. It never imports the Garu model or WASM.
- The separate `halopress-search` Worker consumes one job per invocation, reads
  the immutable `publication_revision`, tokenizes at most ten sentences and
  24 KiB per durable checkpoint, and writes ordinary `full_text_chunk` staging
  rows.
- One final D1 batch rechecks the current publication revision and field
  eligibility, replaces the FTS rows, and activates the complete generation.
  Partial staging rows never affect MATCH or BM25.
- Both Workers bind the same D1 database. `scripts/prepare-cloudflare-d1.mjs`
  writes the resolved `database_id` and `database_name` to both Wrangler files
  before applying migrations.

The pinned analyzer generation is reported in Desk under
**Settings → Operations**. A field rename keeps its stable `fieldId`; a disable,
unpublish, delete, or schema purge removes public eligibility immediately and
queues physical cleanup.

## Build, test, and deploy

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm test:deploy
pnpm deploy:cf -- --dry-run
pnpm deploy:cf
```

The deployment wrapper validates the main Worker secret first, resolves D1,
applies migrations, creates the Queue when missing, deploys the search Worker,
and deploys the main Worker last. The auxiliary deployment receives no
`NUXT_AUTH_SECRET` or caller secrets file. A search-Worker failure stops the main
deployment so the main Worker cannot be published with missing producer
topology.

For a custom main Wrangler file, place the auxiliary file at
`workers/search/wrangler.jsonc` relative to it, or set:

```bash
export HALOPRESS_SEARCH_WRANGLER_CONFIG=/absolute/path/to/search.wrangler.jsonc
```

For multiple HaloPress sites in one Cloudflare account, give the main Worker,
search Worker, Queue, D1 database, and R2 bucket site-specific names. Keep the
main `SEARCH_WORKER.service` equal to the auxiliary Worker name and use the same
Queue name in both Wrangler files.

## Recovery

The Operations screen reports pending, active, failed, ready, and stale work,
chunk progress, the tokenizer generation, query epoch, and latest error.

- **Retry failed** returns failed jobs to `pending` while preserving their
  checkpoint and staging generation.
- **Reindex all** creates bounded schema fan-out jobs. Existing complete rows
  remain active until each replacement generation is complete.
- If a Queue wake-up is lost or the Queue quota is exhausted, content publication
  still succeeds. Jobs remain pending in D1 and the scheduled reconciler retries.
- If the model cannot initialize, attempts use bounded exponential delay and
  become `failed` after five claims. Repair the deployment, then retry.
- If D1 is unavailable, indexing and queries remain unavailable; source content
  is not lost. Restore D1, apply migrations, and run a full reindex.

## Cloudflare limits

Queue messages contain only a job ID, far below Cloudflare's 128 KB message
limit. The configuration uses a batch size of one and two concurrent consumers.
Cloudflare documents a 15-minute Queue-consumer wall-time limit and a default
30-second CPU limit; the measured tokenizer chunks stay well below that CPU
window. On Workers Free, Queue retention is fixed at 24 hours. The durable D1
outbox is therefore authoritative even after Queue retention expires.

Current limits:

- <https://developers.cloudflare.com/queues/platform/limits/>
- <https://developers.cloudflare.com/workers/platform/limits/>
- <https://developers.cloudflare.com/d1/platform/limits/>

## D1 smoke tests

Apply the migration and verify that D1 created an FTS5 virtual table:

```bash
pnpm db:d1:apply:local
pnpm wrangler d1 execute DB --local --command \
  "SELECT sql FROM sqlite_master WHERE name = 'full_text_fts';"
```

After a remote deployment and one indexed publication:

```bash
pnpm wrangler d1 execute DB --remote --command \
  "SELECT status, count(*) AS jobs FROM full_text_job GROUP BY status;"
pnpm wrangler d1 execute DB --remote --command \
  "SELECT content_id FROM full_text_fts WHERE full_text_fts MATCH 'morph_text : \"학교\"' LIMIT 5;"
```

Never edit `full_text_fts`, `full_text_chunk`, or index-state rows as source
content. Use the Operations reindex action to recover derived data.

## Query deployment modes

`GET /api/keyword-search/capabilities` advertises one rendering-neutral contract:

- `browser` mode lazy-loads the shared browser tokenizer and sends bounded
  `rawTerms` and `morphTerms` to `POST /api/keyword-search`. The main Worker only
  validates tokens, builds a quoted FTS expression, and reads D1.
- `server` mode sends bounded raw text directly to
  `https://<search-worker>/v1/search`. Morphology and D1 execution stay in the
  auxiliary Worker. Configure its CORS allowlist with
  `SEARCH_ALLOWED_ORIGINS`; `*` is the public-search default.

Configure Nuxt public runtime values through normal `NUXT_PUBLIC_*` overrides:

```bash
NUXT_PUBLIC_KEYWORD_SEARCH_MODE=server
NUXT_PUBLIC_KEYWORD_SEARCH_WORKER_URL=https://halopress-search.example.workers.dev
NUXT_PUBLIC_KEYWORD_SEARCH_BROWSER_FALLBACK=true
```

The browser-token request uses contract version `1`, the advertised tokenizer
generation, at most 64 combined normalized tokens, `all` or `any` semantics,
optional schema/stable-field scopes, up to four validated scalar filters, a
limit of 1–50, and an opaque cursor. No endpoint accepts raw MATCH grammar.
Raw terms receive BM25 weight 8 and morphology terms weight 3. Results sort by
rank and content ID. The cursor binds query fingerprint, tokenizer generation,
and the D1 query epoch; any publication/index change rejects stale traversal
with a retryable `409`.

Every candidate rechecks the complete active index generation, current
`published_revision_id`, published listing, active Schema, anonymous `can_read`,
enabled full-text field, and canonical content route. Responses contain only
safe listing metadata and canonical `to`; morphology streams and job errors are
never returned. The first backend contract intentionally omits snippets.

Public search requests are size- and count-bounded and return short public cache
directives. Operators expecting hostile or high-volume traffic should attach a
Cloudflare Rate Limiting rule to `/api/keyword-search` and the auxiliary
`/v1/search` route. Rate limiting is deployment policy rather than hidden
application state, so local and browser-only deployments retain the same API.
