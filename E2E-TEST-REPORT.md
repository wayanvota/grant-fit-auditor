# Grant Fit Auditor end-to-end test report

## Scope

The harness serves the production static interface in Chromium and exercises its
real decision rendering against a deterministic local audit fixture. That
fixture uses the production decision and input-safeguard modules. Adversarial
requests are sent to the real Express application mounted under `/api`, so CORS,
body parsing, upload limits, validation, prompt-injection containment, SSRF
checks, and rate limiting run without contacting OpenAI, Anthropic, IRS, or
Kindora.

The optional OpenAI smoke is separate, credential-gated, excluded from CI, and
runs one clean eligible case through the local application. The permanent
production reliability suite remains available in `scripts/liveReliabilitySuite.mjs`.

## Required categories

| ID | Category | Expected behavior |
| --- | --- | --- |
| U01 | Public purpose and safeguards | Purpose, privacy posture, and human authority render; no key name leaks |
| U02 | Required fields | Browser blocks incomplete organization facts |
| U03 | Complete audit | Deterministic browser flow renders a PURSUE brief and evidence sections |
| U04 | Explicit hard stop | Geography failure renders DECLINE with quoted evidence |
| U05 | Closeable gap | Missing audit renders PAUSE with a next action |
| U06 | Injection review | Removed control text yields NEEDS HUMAN CHECK |
| U07 | Progress recovery | Loading state is visible and submit control recovers |
| U08 | Service failure | User receives bounded manual-review guidance |
| U09 | Application economics | Expected value and break-even time are calculated exactly |
| U10 | About and data handling | External processing, non-storage, and human authority are disclosed |
| A01 | CORS boundary | Disallowed browser origin is rejected |
| A02 | Missing required data | Incomplete organization payload fails before analysis |
| A03 | Invalid money input | Negative budget is rejected |
| A04 | Insufficient source | Short opportunity text is rejected before analysis |
| A05 | Prompt injection | Injection-dominated text produces a terminal human-check result, not a recommendation |
| A06 | Oversized text | Over-limit pasted text is rejected, not truncated |
| A07 | Malformed JSON | Parser fails closed without a stack trace |
| A08 | Unsupported upload | Non-PDF upload is rejected |
| A09 | SSRF attempt | Private-network foundation URL is rejected before research |
| A10 | Request flood | Repeated pursuit requests receive 429 and Retry-After |

## Verification record

Status: passed locally on 2026-09-11 with Node 22.16.0.

- Existing repository tests: 70 passed
- Repository-wide publication firewall: 6 passed
- Deterministic E2E categories: 20 passed, exactly U01-U10 and A01-A10
- High-severity dependency audit: 0 vulnerabilities at all severities
- Optional OpenAI smoke using the authorized local key: 1 clean eligible case passed
- GitHub Actions: pending after branch push

Reproduce with:

```bash
npm ci
npx playwright install chromium
npm run test:ci
npm audit --audit-level=high
```

Optional authorized one-case OpenAI smoke against a local server:

```bash
OPENAI_API_KEY=... PORT=4192 node server.js
AUDIT_API_BASE=http://127.0.0.1:4192 PUBLIC_SITE_URL=http://127.0.0.1:4192/ LIVE_TEST_FILTER="clean eligible" npm run test:live:openai
```

No live credential is required or read by the deterministic suite or GitHub
Actions workflow.
