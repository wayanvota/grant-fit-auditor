# Verification

## Required workflow coverage

- A department inside a larger institution fails an explicit exclusion and returns `DECLINE`.
- Contributions above 90% of total revenue produce the `one-time injection` durability classification.
- Explicit non-renewal language controls over a filing that otherwise appears recurring.
- An announcement later than the latest tax year is flagged, and only a matching official domain confirms the source.
- A filing without usable financial detail returns `NEEDS HUMAN CHECK`; missing application volume prevents expected-value math.

## Retained safety coverage

- Prompt injection is removed once, revalidated, and always returns a terminal human-check result.
- Ordinary grant instructions and scoring language are preserved as source data.
- A malformed structured response retries once on the same analysis engine.
- A second schema failure and a timeout return a valid human-check result.
- API credentials are redacted from public errors.
- Forbidden repository content is checked in local tests and GitHub Actions, including commit history.
- The public interface contains one nonprofit-side workflow and exposes no vendor labels.

Run `npm run check` before release.
