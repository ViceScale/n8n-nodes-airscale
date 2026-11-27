# Distribution

Package: `n8n-nodes-airscale` version 0.1.0. Author: Airscale, victor@airscale.io. Website: https://airscale.io. Support: https://airscale.io/contact. Documentation: https://docs.airscale.io/api-reference/api-overview. Categories: Sales and Data & Storage; callback nodes also Marketing & Content. License: MIT. Intended source: https://github.com/ViceScale/n8n-nodes-airscale.

The package is a local development candidate, not npm-published, submitted, or n8n-verified. Cloud signup is awaiting a fresh email verification code after the browser session changed; a password has been prepared in private storage outside this repository. Local installation does not confer Cloud availability.

Before release, record actual runtime and UI checks, inspect `npm pack --dry-run` for secrets/fixtures, and ensure the repository is public. Publish through GitHub Actions with provenance; current n8n submissions require this. Configure an npm trusted publisher for this repository and `publish.yml` (or a package-scoped publishing token in GitHub's NPM_TOKEN secret). The local npm session currently returns HTTP 401; no successful publish is claimed.

Create a version tag matching package.json, then manually dispatch Publish on that tag. It validates, tests and calls npm publish with provenance. `RELEASE_MODE=true` permits the official n8n-node prerelease lifecycle; lint/build are still enforced. No branch push automatically publishes.

After npm publication, submit the package through https://creators.n8n.io/nodes. Provide a reviewer account/test budget only with owner authorization. Do not claim paid modules have been live-tested when only fixtures were used. Complete reviewer-required fields using confirmed company details and actual evidence. Acceptance and Cloud discovery are external n8n decisions.

Official requirements: https://docs.n8n.io/connect/create-nodes/build-your-node/reference/verification-guidelines and https://docs.n8n.io/connect/create-nodes/deploy-your-node/submit-community-nodes.
