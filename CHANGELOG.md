# Changelog

## 0.2.0 — 2026-11-27

- Email nodes now share one encrypted Airscale API credential with an optional Callback Secret. Users upgrading from 0.1.1 must copy their existing secret into this credential and select it in both email nodes. The legacy credential remains available for migration.
- Validate callback configuration during activation and clean up local readiness on deactivation; Airscale has no remote webhook subscription API.
- Preserve HTTP status and safe retry guidance in n8n errors; expose email submission as an explicitly configured AI tool.
- Add the official n8n review scanner to CI/release checks and verify a free live credit-balance workflow with downstream mapping.

## 0.1.1 — 2026-11-27

- First public release built through GitHub Actions with npm provenance. Version 0.1.0 was reserved for the initial unapproved bootstrap stage.
- Added self-hosted installation instructions and the approved npm staging workflow; node behavior is unchanged from 0.1.0.

## 0.1.0 — 2026-11-27

Initial development candidate with 18 requested API operations, professional-email result trigger, encrypted API/callback credentials, Airscale branding, dynamic table/column controls, readable row outputs, pagination, timeout handling and retry protection. Includes contract/behavior tests and synthetic example workflows. No public npm release or n8n verification yet.
