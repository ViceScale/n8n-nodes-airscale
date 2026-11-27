# Professional email results

Professional email lookup is asynchronous. Two nodes handle the two stages:

1. Create a results workflow starting with **Airscale Email Results**. Select an **Airscale API** credential containing your workspace API key and a **Callback Secret** of 32–512 characters without spaces. Connect the trigger to your destination, such as a CRM or table update.
2. Activate that workflow. Copy the trigger's **Production URL**.
3. In the submission workflow, add **Airscale Email**, select the same Airscale API credential, and paste the Production URL into **Results Webhook URL**. Map the person's LinkedIn profile or name and company.
4. Run the submission workflow. Each item outputs `status: "accepted"` and its `request_id`. Each completed callback starts a separate results execution containing the email outcome. Connect nodes that need the email to **Airscale Email Results**, not to the submission action.

Activation validates the callback secret and records local readiness. Deactivation clears that marker; n8n removes its endpoint. Airscale accepts the callback URL per lookup and has no remote subscription to register or delete. Activation and deactivation do not make paid API calls.

The persistent production endpoint exists before the lookup starts, so a fast callback can arrive immediately. Test webhook URLs are temporary and should only be used while n8n is explicitly listening for a test event. The production URL must be publicly reachable over HTTPS without an extra login or proxy authentication. No public tunnel is created by this package.

## Data and correlation

The submission action supports multiple items. It validates every input before making any API request, then submits one contact per request. Each request is therefore within Airscale's 100-input limit. With Continue On Fail, invalid or failed items output `submission_error` with item linking; other items continue. If a request was attempted, the error retains `request_id`, `custom_id` and explicit correlation so a later callback can still be reconciled after a lost HTTP response. Prevalidation errors have no submission ID. A submission HTTP error is never automatically retried.

Airscale's `custom_id` contains an envelope with `request_id` and the optional user-defined `custom_id`. The request ID includes the n8n execution ID, node ID, run index and input item index. This allows the acceptance record and completed callback to be matched. The results trigger unwraps these fields and returns typed `status`, `email`, `provider`, `verifier`, `email_status` and `error` fields when supplied. Unknown callback fields are omitted.

**The full input item is never sent automatically.** If a results workflow needs additional context, explicitly enter a **Correlation (JSON)** object. Its field description states that this data is sent to Airscale and echoed in the callback. Choose only the fields you want to share. The results trigger returns it under `correlation`. Outgoing requests are limited to 256 KiB; incoming callbacks allow an additional bounded 32 KiB for result metadata. Each optional result string is separately limited to 1024 characters.

Statuses `success`, `not_found`, `timeout` and `error` are completed lookup outcomes. Submission `accepted` is not a completed lookup and does not establish whether an email exists or credits were consumed. There is no waiting execution or automatically generated callback-timeout result in this design.

## Authentication and delivery

The callback secret is stored in n8n's encrypted credentials and appended to the callback URL only at execution time. Never paste the secret or API key into the URL parameter or workflow JSON. The Airscale API key is never included in the callback URL. Use the same callback credential in both nodes. Its credential test validates the secret's format locally; it does not claim to prove network delivery.

The results trigger checks the token before reading or outputting the body and uses a timing-safe comparison. Requests with an invalid token receive HTTP 401; malformed payloads receive HTTP 400 and do not start a results execution. The query token and callback URL are never included in node output. The callback URL is a bearer secret: redact its query string from reverse-proxy logs and do not share it. Airscale does not sign the body; this authenticates possession of the shared secret, not a cryptographic Airscale sender identity.

Each callback starts a distinct execution. Duplicate callbacks preserve the same `request_id`; use that as a unique key in the destination if repeated updates would be unsafe. This node does not promise exactly-once processing. Airscale's inspected worker currently sends each callback once, without durable delivery retries. An unavailable endpoint or network failure can therefore lose a result. Absence of a callback does not establish a miss, cancellation or lack of charges. Production-grade recovery requires durable provider-side retries or a result-retrieval API.

Automatic Retry On Fail is rejected because email submission has no documented idempotency guarantee. Manual retries and full workflow reruns can duplicate paid work. Check Airscale's outcome before retrying a request whose acceptance is uncertain.

## Verification

`tests/email.test.cjs` covers item correlation, explicit data sharing, prevalidation, size boundaries, callback authentication, malformed callbacks, result status types, duplicate identifiers, safe error handling and credential format validation. `tests/runtime-api-mock.cjs` provides synthetic API responses and delayed local HTTP callbacks without spending credits. Runtime evidence belongs in the repository's integration verification notes.
