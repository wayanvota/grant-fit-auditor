import test from "node:test";
import assert from "node:assert/strict";
import {
  FUNDER_BATCH_LIMIT,
  mapWithConcurrency,
  parseApplicantSet
} from "../src/funderBatch.js";

const profile = (name) => `${name}

This fictional organization works with underserved communities across two regions. It describes its mission, programs, operating model, partnerships, evidence, and current organizational gaps in enough detail for an initial eligibility review.`;

test("applicant paste splits on delimiter and keeps declared names", () => {
  const applicants = parseApplicantSet(`${profile("Mama Mobile Health")}\n\n---\n\n${profile("SisterLink Direct")}`);

  assert.equal(applicants.length, 2);
  assert.equal(applicants[0].name, "Mama Mobile Health");
  assert.equal(applicants[1].name, "SisterLink Direct");
});

test("applicant paste enforces the visible batch cap", () => {
  const raw = Array.from({ length: FUNDER_BATCH_LIMIT + 1 }, (_, index) => profile(`Applicant ${index + 1}`)).join("\n\n---\n\n");

  assert.throws(() => parseApplicantSet(raw), /up to 6 applicants/);
});

test("bounded batch mapping isolates mapper return values in input order", async () => {
  const output = await mapWithConcurrency([3, 1, 2], 2, async (value) => {
    await new Promise((resolve) => setTimeout(resolve, value));
    return value * 2;
  });

  assert.deepEqual(output, [6, 2, 4]);
});
