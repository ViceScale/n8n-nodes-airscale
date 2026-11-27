# n8n review corrections

The 0.1.1 registry scanner passed provenance but rejected seven source lint violations. Unlike the local CLI, review ignores inline rule exceptions. The user authorized completing the integration and routine implementation decisions autonomously.

## Design

Use one Airscale API credential for both email nodes, containing the workspace key and an optional, encrypted callback secret. Balance and other operations do not require a callback secret. Email operations validate it before submission or activation. The previous callback-only credential remains readable for migration, but users of 0.1.1 must select their Airscale API credential in Results and copy their existing secret into it. This change ships as 0.2.0.

Airscale accepts a callback URL per request and has no remote webhook-subscription API. Implement the n8n lifecycle to validate activation and maintain a local readiness flag; n8n still owns endpoint registration/removal. Do not invent remote registration calls or perform paid requests during activation.

Preserve safe HTTP error status, guidance and item context when wrapping errors. Keep explicit correlation JSON optional because it is arbitrary user data echoed in callbacks, not hidden configuration. Add the official registry scanner as a local-source CI gate; provenance is still checked after publication.

## Execution

- Add failing regressions for shared credential lookup, invalid activation secret and idempotent lifecycle cleanup.
- Update credential fields, email nodes, error handling, examples and migration documentation.
- Run build, lint, full tests and the official local scanner.
- Install the resulting tarball into the existing isolated runtime; test email submit/callback and free live balance mapping in the actual editor.
- Publish 0.2.0 through the staged GitHub workflow, run the registry scanner, and resubmit to n8n.

Paid lookups and public internet callback delivery remain outside the current test budget. Keep all example workflows inactive and exports free of credentials and customer values.
