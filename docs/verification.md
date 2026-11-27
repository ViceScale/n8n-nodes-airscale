# Verification — 27 November 2026

Candidate: n8n-nodes-airscale 0.1.0. Tested in the actual n8n 2.49.7 editor and runtime, using an isolated loopback instance and a development-only synthetic API fixture. No live enrichment credits were spent.

## Automated checks

- Official `n8n-node` build and strict lint passed.
- Node test runner: 56 passed, 0 failed.
- Coverage includes all requested endpoint contracts, validation, item pairing, response normalization, JSON type preservation, cursor pagination/cycles, idempotency across loop runs, retry guards, safe error messages, and callback authentication/schema checks.
- `npm pack --dry-run`: no tests, fixture data, local runtime, credentials, environment files, or node_modules included. Five workflow examples contain credential names only, not secrets or account-specific credential IDs.

## Actual editor and runtime

| Flow | Evidence |
| --- | --- |
| Credit balance → downstream mapping | Execution 1 succeeded; next node received numeric 1234 and the explicit synthetic-data label. |
| Paginated rows → downstream mapping | Execution 3 succeeded across two fixture pages with three rows. Objects, arrays, null, zero and false survived. The initial example used an overly restrictive object mapping; changed the example to native JSON and reran successfully. |
| Professional email submission | Execution 4 succeeded and returned acceptance plus request/contact IDs. |
| Professional email callback → downstream mapping | Separate execution 5 started from the persistent Results trigger and succeeded; mapped sample@example.com, success, sample-contact-001, the matching request ID, and explicit correlation. Callback returned HTTP 200. |
| Table creation → row creation → row update → table get → row readback | Execution 6 succeeded; mapped Synthetic Contact, numeric 9 and null after clearing a cell. |
| Table selector | Opened the real searchable dropdown; table names appeared, including Fixture Prospects and Fixture Companies. |
| Dynamic writable columns | Loaded through the real editor: Name, Email, Count, Metadata. Count rendered as a numeric input. |
| Callback rejection | Actual webhook rejected missing/wrong secret with 401 and malformed callback with 400. Rejected callbacks did not create workflow executions. |
| Credential flow | Opened the actual Airscale credential dialog; masked API-key field, correct Airscale logo, and successful POST /v1/credits connection test using the fixture. |
| Installed package | Built a tarball, installed it with npm into the isolated n8n nodes directory (no source symlink), restarted n8n and reran the credit mapping successfully. |
| Logo | Airscale icons rendered in the actual app picker for all three nodes, on the canvas, and in node/credential dialogs; loaded light/dark SVG assets verified through the browser. |

The results trigger was unpublished after verification and is loopback-only in this fixture environment. Example exports are inactive and require configuration before publishing. The example webhook hostname is deliberately non-operational.

## Limits

These tests establish integration behavior against synthetic responses and published API contracts. They do not establish live enrichment quality, provider latency, paid billing behavior, or public internet callback delivery. All paid lookup operations remain untested against production. The available local API credential returned HTTP 403 on the no-credit balance/table checks; a current authorized workspace API key is still required for a live smoke test.

The n8n Cloud trial was created on 27 November 2026. The authenticated dashboard, owner account, and community-node settings were verified in the owner's actual Chrome browser (Cloud n8n 2.49.8). No payment method was added. The custom Airscale nodes are not installed on Cloud. npm publication requires publisher authentication; `npm whoami` returned HTTP 401. Public availability and n8n verification are not claimed. See distribution.md for the release and review path.

Source validation: GitHub CI passed on commit `7b9f844668b3ec72b09732b6f8694580a8360c33`: https://github.com/ViceScale/n8n-nodes-airscale/actions/runs/45923704623.
