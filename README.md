# Grant Fit Auditor

This service supports two nonprofit-side decisions. Grant Fit Auditor tests a specific opportunity. Funder Pursuit Advisor researches a foundation before staff commit time to prospect research, cultivation, relationship-building, or proposal work.

The public interfaces are `https://wayan.com/grant-fit-auditor/` and `https://wayan.com/grant-decider/`. A stateless Express service on Render provides the `POST /audit` and `POST /pursuit` APIs but does not serve a second public interface.

## Decision workflow

The tool accepts structured organization facts plus pasted guidelines, a URL, or a text-based PDF. It returns one of four recommendations: `PURSUE`, `PAUSE`, `DECLINE`, or `NEEDS HUMAN CHECK`.

The evidence page contains, in order:

1. Explicit hard eligibility stops, with exact quotations and source sections.
2. Ranked, closeable fit gaps.
3. An optional filing-backed funding durability read using a funder EIN.
4. Expected value per application and break-even staff hours when every required input is disclosed.
5. A dated announcement check against the latest usable tax year.
6. One visible statement of what staff must verify.

The analysis engine extracts cited facts. Deterministic application code applies the recommendation rules, calculates filing ratios, performs cost math, and checks dates and domains. Missing application volume is never estimated.

## Foundation pursuit workflow

`POST /pursuit` accepts a foundation identity, a structured nonprofit profile, access context, and the staff hours at risk. The service first retrieves bounded structured foundation, 990, itemized-grant, giving-statistics, and open-program records from Kindora's read-only public MCP. OpenAI web search then gathers direct foundation sources, public filing records, grantee announcements, and credible public reporting. The application applies deterministic rules and returns `PURSUE`, `PARK`, `DECLINE`, or `NEEDS HUMAN CHECK`.

Every decision includes the decisive reason, a next action, a reopening condition where relevant, hard-gate findings, access findings, observed grant patterns, counterevidence, missing evidence, a dated evidence ledger, and the staff cost at risk. A source URL not returned by the research tools is withheld from the ledger. The endpoint does not estimate success odds, infer relationships, contact funders, or draft proposals.

## Data and safety

The service uses no database and stores no submitted profiles or results. OpenAI requests set `store: false`. User-controlled text is treated as untrusted data, screened for model-control instructions, stripped once, and revalidated. A detected injection, repeated schema failure, timeout, unresolved funder identity, or unusable filing returns a visible human-check state without a fabricated judgment.

The filing client in `src/irs990.js` calls the public ProPublica Nonprofit Explorer API and requires no key. The Kindora client in `src/kindora.js` calls only a fixed read-only allowlist, identifies the integration with `X-Kindora-Client`, and requires no key for the public tier. It sends only the foundation identity and bounded tool arguments, not the nonprofit profile. Set `KINDORA_ENABLED=false` to disable it, `KINDORA_MCP_URL` to override the endpoint, or `KINDORA_TIMEOUT_MS` to change the per-call timeout. Provider credentials remain server-side environment variables. The pursuit workflow requires the existing `OPENAI_API_KEY` because it uses OpenAI web search; submitted data is sent with `store: false`.

## Run locally

```bash
npm install
npm test
npm start
```

Set at least one supported analysis credential in the environment. The deployed service uses its existing server-side credential. Local browser testing may use an origin such as `http://localhost:4173`; production browser requests are restricted to Wayan.com.

## Release

GitHub Actions runs the complete test suite plus the repository-wide forbidden-content check. The complete Wayan.com interface is in `wayan-grant-fit-auditor/`. Its `.htaccess` redirects the former separate About page into the About section on the canonical page. Render redirects `/`, `/index.html`, `/about`, and `/about.html` to the Wayan.com interface while retaining `/audit` and `/health` as service endpoints.
