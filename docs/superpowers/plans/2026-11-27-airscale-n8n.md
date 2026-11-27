# Airscale n8n Integration Implementation Plan

Goal: deliver a branded, maintainable community node with all requested API operations, an installable package and visually tested example workflows without spending Airscale credits.

Architecture: a programmatic Airscale action node handles dependent table-schema calls, pagination, readable row mapping and synchronous enrichments. A professional-email submit action sends acceptance to its next node; a separately activated persistent Email Results webhook starts a new execution on completion. Explicit correlation links the workflows, and constant-time shared-secret authentication protects callbacks. This avoids an early callback race with send-and-wait execution persistence. Credentials are stored by n8n and injected by its authenticated HTTP helper. No runtime dependencies, filesystem access or environment access in shipped nodes.

Tech stack: official n8n-node scaffold/CLI, TypeScript, n8n-workflow, Node test runner, isolated n8n development server.

1. Inspect existing scaffold, npm and GitHub packages, account access, official documentation and current API schema. Preserve unrelated Airscale checkout changes.
2. Add failing transport/normalization tests, API credentials and synchronous operations. Expose typed native JSON, item linking, deliberate timeout and retry policy.
3. Add failing table tests, searchable resource locator, dynamic resource mapper, human-readable results, friendly column builder, pagination and idempotency safeguards.
4. Add asynchronous email tests and native webhook flow, with downstream results, callback validation/correlation and duplicate/timeout safeguards.
5. Run build, lint and contract/behavior tests; review implementation against scope and code quality. Install in isolated local n8n and inspect picker, canvas, credentials, dynamic parameters and downstream mapping.
6. Run live no-credit authentication/table tests if credentials are available; never run paid enrichment without a specific budget. Export a working example and record paid operations as contract-tested only.
7. Prepare README, changelog, MIT license, installation instructions, provenance-enabled CI/publication, review metadata. Install/distribute where account access permits; distinguish local availability, npm publication and n8n verification.

Shared transport contract: nodes/Airscale/transport.ts exports airscaleRequest(context, path, method = 'POST', body?, options?) where context is IExecuteFunctions or ILoadOptionsFunctions; options supports qs, idempotencyKey and timeout. Return parsed JSON data. No automatic retry of paid requests or uncertain writes. Errors report HTTP status and Retry-After without exposing credentials.

Acceptance: all 18 requested operations available, no malformed array keys, paired items preserved, no secrets in exports, actual UI proof of branding and one result mapped downstream, honest live-test and distribution status.
