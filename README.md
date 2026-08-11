# Grant Fit Auditor

Grant Fit Auditor helps a US nonprofit decide whether a grant opportunity deserves staff time. It is a stateless Express application with a browser interface and one `POST /audit` endpoint.

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

## Data and safety

The service uses no database and stores no submitted profiles or results. User-controlled text is treated as untrusted data, screened for model-control instructions, stripped once, and revalidated. A detected injection, repeated schema failure, timeout, unresolved funder identity, or unusable filing returns a visible human-check state without a fabricated judgment.

The filing client in `src/irs990.js` calls the public ProPublica Nonprofit Explorer API and requires no key. Provider credentials remain server-side environment variables.

## Run locally

```bash
npm install
npm test
npm start
```

Set at least one supported analysis credential in the environment. The deployed service uses its existing server-side credential.

## Release

GitHub Actions runs the complete test suite plus the repository-wide forbidden-content check. The static Wayan.com package is in `wayan-grant-fit-auditor/`; its `.htaccess` contains the old-path redirect rule.
