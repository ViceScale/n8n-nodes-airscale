# Verification — 27 November 2026

Package: n8n-nodes-airscale 0.2.0. Tested in the actual n8n 2.49.7 editor and runtime, using an isolated loopback instance and a development-only synthetic API fixture. No live enrichment credits were spent.

## Automated checks

- Official `n8n-node` build and strict lint passed.
- Node test runner: 58 passed, 0 failed.
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

These tests establish integration behavior against synthetic responses and published API contracts. They do not establish live enrichment quality, provider latency, paid billing behavior, or public internet callback delivery. All paid lookup operations remain untested against production. The earlier stale local key returned HTTP 403. A current workspace key was subsequently selected from Airscale Settings and saved only in an encrypted n8n credential restricted to api.airscale.io. Its real connection test succeeded. Execution 8 called the live POST /v1/credits endpoint and mapped the numeric result into a downstream node successfully, without spending credits or exposing the balance in this repository.

The n8n Cloud trial was created on 27 November 2026. The authenticated dashboard, owner account, and community-node settings were verified in the owner's actual Chrome browser (Cloud n8n 2.49.8). No payment method was added. The custom Airscale nodes are not installed on Cloud.

## Distribution and review

Version 0.1.1 was published publicly with GitHub provenance on 27 November. The release workflow passed all checks: https://github.com/ViceScale/n8n-nodes-airscale/actions/runs/45998501350. Registry SHA-1: `1243c64134ec1043d515a9d9a70da48e3b0275c9`. The GitHub-built tarball was inspected and all 17 compiled code/JSON/logo assets matched the previously tested build.

The owner approved a staging-only npm trusted publisher scoped to `ViceScale/n8n-nodes-airscale` / `publish.yml`, and creation of the Airscale Creator account. The Creator account was activated, package ownership confirmed by email, and the package submitted at https://creators.n8n.io/nodes/n8n-nodes-airscale/integration.

The automated review of 0.1.1 required changes: its scanner ignores inline lint exceptions, unlike the local CLI. Version 0.2.0 addresses the seven reported errors. It consolidates encrypted email credentials, validates webhook activation and cleanup, declares AI tool support, and preserves safe error status/guidance. The official `@n8n/scan-community-package@0.45.0` local-source scan passed. The optional Correlation JSON field is deliberately retained for explicitly shared user metadata; its scanner warning does not represent missing configuration. The scanner runs in CI and before every staged release.

The 0.2.0 tarball was installed into the isolated runtime. In the actual editor, Email showed one credential selector and correct setup instructions. Execution 9 submitted a synthetic lookup and mapped acceptance. Execution 10 received the authenticated callback and mapped the email result. Activation and deactivation both succeeded; the Results workflow was unpublished afterward. All 58 tests and build passed. Paid calls remain blocked by the development-only fixture guard.

Public registry publication and n8n approval are separate checks. Version 0.2.0 is prepared for provenance-enabled publication and resubmission; no n8n verification is claimed. The original unprovenanced local 0.1.0 bootstrap stage remains unapproved.
