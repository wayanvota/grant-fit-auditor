# Verification

## Demo Source

The preloaded RFA text is drawn from the publicly shared SheConnects Digital Accelerator: Africa Request for Applications, Accelerator Round 2: Partnerships for Women's Digital Empowerment at Scale.

Source URL: https://drive.google.com/file/d/145ONFA4tCQACoGhuOMRuoNRMCIaB_GHY/view

The PDF was downloaded on May 23, 2026, extracted with `pdftotext`, and cleaned to remove page headers, footers, and page numbers.

## Fictional NGO Profile

Mama Mobile Health is a fictional composite designed for demonstration. It is constructed to be plausibly competitive on some criteria and visibly gapped on others.

The intended demo result is `PURSUE WITH WORK`, with visible gaps around Direct-to-Participant delivery, technology-facilitated GBV risk practices, privacy documentation, monitoring and evaluation at 50,000-user scale, and regional expansion beyond Kenya.

## Editorial Framework

The tool audits against the editorial framework Wayan Vota described for the piece "Grant teams need to use AI to apply to fewer grants, not more."

The software boundary is deliberate:

- Humans define what the organization will pursue or refuse.
- AI extracts explicit requirements and scoring pressure from the RFP.
- AI flags gaps from the provided profile.
- Humans verify evidence, funder context, and strategy.

## Verification Performed

- Confirmed the RFA source is a 7-page PDF.
- Extracted readable text from the PDF, confirming it is not image-only.
- Embedded the cleaned RFA text in the `?demo=1` path.
- Added the SheConnects AI-text note to the demo UI.
- Implemented server-side source extraction for pasted text, URL, and PDF upload.
- Implemented provider adapters for Claude and ChatGPT behind one shared schema.
- Implemented the static FTP pages in `wayan-grant-decider/`.
