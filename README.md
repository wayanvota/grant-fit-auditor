# Grant Fit Auditor

Grant Fit Auditor demonstrates a simple editorial argument as software: use AI to apply to fewer grants and route reviewer attention more carefully.

The default applicant-side mode asks for grant guidelines and a short NGO profile. It returns extracted requirements, eligibility checks, inferred scoring pressure, ranked gaps, and a pursuit recommendation.

Reviewer-side mode reverses the comparison. A funder provides its published criteria and up to six applicant profiles. The tool returns a cited worklist grouped into `ELIGIBILITY UNCERTAIN`, `OUTSIDE STATED SCOPE`, and `MEETS STATED CRITERIA`. It never attaches a numeric or letter score to an applicant, ranks applicants by merit, or makes a funding recommendation. A human confirms every routing disposition.

## Architecture

- Frontend: static HTML, CSS, and vanilla JavaScript in `public/`.
- Backend: Express server in `server.js`.
- Audit endpoint: `POST /audit`.
- Reviewer endpoint: streaming `POST /funder-audit`.
- RFP inputs: pasted text, server-side URL fetch, or uploaded PDF.
- PDF extraction: `pdf-parse`. Version 1 does not run OCR.
- URL extraction: server-side fetch with a 30-second timeout and lightweight HTML cleanup.
- AI providers: Claude or ChatGPT, selected by the user.
- Reviewer batch: six applicants maximum, processed with concurrency of two after one criteria-extraction call. One applicant failure does not fail the batch.
- Reviewer exports: CSV download and print-to-PDF, including citations and human confirmation state.
- Data storage: none. Criteria, applicant profiles, results, and human confirmation state remain in the request or browser session.

Provider adapters live under `src/providers/`:

- `anthropic.js` uses Claude with forced tool use.
- `openai.js` uses the OpenAI Responses API with Structured Outputs.
- Both providers return the same applicant-side and reviewer-side schemas from `src/auditSchema.js`.

## Environment

Set these in Render:

```bash
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
ANTHROPIC_MODEL=claude-haiku-4-5-20251001
OPENAI_MODEL=gpt-5-mini
```

Claude is the default provider in the UI. ChatGPT is available when `OPENAI_API_KEY` is set.

## Prompt Caching

Claude uses explicit prompt caching on the system prompt and schema with a 5-minute TTL.

OpenAI prompt caching is automatic for supported models when repeated prompt prefixes match. The app places static instructions and the schema before variable user content, and sends a stable `prompt_cache_key`.

## Cost Estimate

The demo RFA plus profile is roughly 7,000 to 10,000 input tokens after normalization. A typical audit response is roughly 1,500 to 3,000 output tokens.

As of May 23, 2026:

- Claude Haiku 4.5 is listed at about $1 per 1M input tokens and $5 per 1M output tokens, with 5-minute cache writes around $1.25 per 1M tokens and cache reads around $0.10 per 1M tokens. Source: [Anthropic prompt caching docs](https://docs.claude.com/en/docs/build-with-claude/prompt-caching) and [Claude Haiku 4.5 page](https://www.anthropic.com/claude/haiku).
- OpenAI GPT-5 mini is listed at about $0.25 per 1M input tokens, $0.025 per 1M cached input tokens, and $2 per 1M output tokens. Source: [OpenAI pricing](https://platform.openai.com/docs/pricing/).

Rough per-audit estimate:

- Claude Haiku 4.5: about $0.01 to $0.03 per audit before warm-cache savings.
- GPT-5 mini: about $0.005 to $0.01 per audit before warm-cache savings.

These are estimates, not billing guarantees. Actual cost depends on RFP length, response length, cache hits, and provider pricing.

## Render Deployment

This repository includes `render.yaml` for a Render web service.

Build command:

```bash
npm install
```

Start command:

```bash
npm start
```

No Neon database is needed for version 1 because the app is stateless.

## Demo URL

After deployment, use:

```text
https://grant-fit-auditor.onrender.com/?demo=1
```

The demo query parameter preloads the SheConnects RFA text and the fictional Mama Mobile Health profile.

## FTP Files

The folder `wayan-grant-decider/` contains `index.html` and `about.html` for `wayan.com/grant-decider`.

Those pages are static landing pages that point readers to the Render-hosted tool. Update the `APP_URL` constant inside those files if the final Render URL changes.

The folder `wayan-grant-fit/` contains `index.html` and `about.html` for `wayan.com/grant-fit`.

## Verification

See [VERIFICATION.md](./VERIFICATION.md).
