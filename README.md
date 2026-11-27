# Airscale for n8n

Contact enrichment and table operations using the [Airscale API](https://docs.airscale.io/api-reference/api-overview).

**Status:** development candidate. Not published to npm or verified by n8n. Private self-hosted installation is available from source. n8n Cloud requires verification before this package can be installed.

## Nodes and operations

- **Airscale:** find mobile phone, personal email, person profile URL, person profile, company profile, company profile URL, profile from email, profile from phone, verify email, website technologies, credit balance; list/get/create tables and list/create/update rows.
- **Airscale Email:** submit professional email lookups. Outputs `accepted`, not a finished email result.
- **Airscale Email Results:** receive completed professional email callbacks and map `status`, `email`, `request_id`, `custom_id`, and optional explicit `correlation` into downstream nodes.

## Connections

Create an **Airscale API** credential with a current workspace API key from Airscale Settings. n8n encrypts credentials at rest. Authentication uses the Bearer header; the connection test calls `POST /v1/credits` without spending credits. API keys never belong in node parameters or workflow exports.

For professional email, also create **Airscale Callback API** with a random secret of at least 32 characters. Use the same callback credential in both email nodes. Publish the Results workflow first, copy its Production URL into the Submit node, then run submissions. The submit node adds the shared secret to the callback URL. Treat complete callback URLs as secrets and avoid logging them at your reverse proxy. Exported workflows contain credential references, not secret values.

A callback starts a separate workflow execution. This avoids the race where a fast result arrives before a waiting execution is persisted. Production webhook URLs must be publicly reachable HTTPS URLs. Test webhook URLs are temporary and suitable for one test only. Airscale currently attempts callback delivery once; outages can lose delivery. This integration does not promise exactly-once delivery: use `request_id` or your `custom_id` to make downstream writes idempotent. Do not resubmit a lookup merely because delivery is uncertain.

Original input items are **not** sent as callback metadata automatically. Optional Correlation JSON is explicitly sent to Airscale and echoed back. Include only the fields you need.

## Tables

An active Airscale paid subscription is required. Table operations do not spend enrichment credits or start enrichments. Select tables by name or enter an ID/expression. Writable columns load dynamically with readable labels; numeric values remain numbers. JSON columns accept native JSON expressions including arrays and null. The column builder supports text, email, phone, URL, number and JSON; raw JSON is optional.

Rows expose `fields` keyed by readable column labels, `values` keyed by stable IDs, and `_airscale.columns` metadata. Duplicate labels are disambiguated. Updates change only supplied cells; null clears a cell. Enrichment/formula/date columns are read-only. Updates return `updated`, `ids`, and `notFound`.

Lists support Limit, Return All and an optional cursor. `_airscale.nextCursor` exposes continuation. Safety caps are 10,000 results / 100 requests. Airscale permits 30 table reads and 10 writes per minute per workspace, with one concurrent write. Rate-limit errors include retry guidance; the node does not blindly retry.

## Credits, timeouts and retries

Enrichment uses Airscale credits according to [current API pricing](https://docs.airscale.io/api-reference/api-overview). Credit balance and table operations are free of enrichment charges. Each incoming item can start one paid lookup. Email verification permits 150 seconds; other synchronous calls permit 130 seconds. Configure your workflow/hosting execution limit accordingly.

Automatic Retry On Fail is rejected for operations without API deduplication and for row updates. Supported create operations and company-URL lookups get an idempotency key based on execution, node, loop run and item. For a manual retry in a new execution, provide the original stable business-operation key and identical request data. Otherwise it is a new operation. After an uncertain PATCH, read the row before trying again. No hidden polling or automatic paid resubmission is performed.

## Development and private installation

Use Node 24.15 or newer supported LTS.

```sh
npm ci
npm run build
npm run lint
node --test tests/*.test.cjs
npm pack
```

Install the resulting tarball into the `nodes` directory of an isolated self-hosted n8n user folder, then restart n8n. Follow [n8n private-node installation](https://docs.n8n.io/connect/create-nodes/deploy-your-node/install-private-nodes). Do not put n8n's user folder inside this repository when using a linked development package: that creates recursive file traversal.

`npm run dev` uses the official n8n-node CLI. Development nodes can be named `CUSTOM.airscale`; installed community packages use `n8n-nodes-airscale.airscale`. Workflow type names must match the installation mode.

## Examples and verification

`examples/credit-balance.json`, `examples/table-row-mapping.json`, and `examples/table-write-readback.json` demonstrate downstream mapping and table CRUD. `examples/professional-email-submit.json` and `examples/professional-email-results.json` demonstrate the two-workflow callback flow; replace the example callback URL before use. They use synthetic fixture names/IDs: select your own credential and table after import. Keep workflows unpublished until configured. No credentials are embedded.

`tests/runtime-api-mock.cjs` is a **development-only** preload, excluded from the npm package. The special fixture key produces synthetic results; paid calls with real keys are blocked in this test mode. It must never be used as a production API adapter. Unit tests verify API contracts, type preservation, pagination, idempotency, credential handling, callback authentication, and malformed responses. Live paid enrichment has not been tested without an approved budget.

See [verification evidence](docs/verification.md) and [distribution status and release steps](docs/distribution.md).

## Support

[Airscale documentation](https://docs.airscale.io) · [Contact Airscale](https://airscale.io/contact) · [Report an integration issue](https://github.com/ViceScale/n8n-nodes-airscale/issues)

MIT license. This package integrates Airscale; it is not an n8n approval or endorsement.
