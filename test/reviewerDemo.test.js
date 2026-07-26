import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertFunderApplicantResult,
  assertFunderCriteriaResult
} from "../src/auditSchema.js";
import { parseApplicantSet } from "../src/funderBatch.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");

global.window = {};
await import("../public/demo.js");
const applicantDemoBeforeReviewerFixture = structuredClone(window.GRANT_FIT_DEMO);
await import("../public/reviewer-demo.js");

const demo = window.GRANT_FIT_FUNDER_DEMO;
const expectedRoutes = {
  "Lakeshore Workforce Collaborative": [
    "MEETS STATED CRITERIA",
    "ROUTE TO FULL REVIEW"
  ],
  "Grand Prairie Skills Center": [
    "ELIGIBILITY UNCERTAIN",
    "NEEDS HUMAN CHECK"
  ],
  "Sun Valley Opportunity Network": [
    "OUTSIDE STATED SCOPE",
    "CONFIRM AGAINST SCOPE"
  ],
  "Great Lakes Arts Alliance": [
    "OUTSIDE STATED SCOPE",
    "CONFIRM AGAINST SCOPE"
  ],
  "Cuyahoga Small Business Lab": [
    "MEETS STATED CRITERIA",
    "ROUTE TO FULL REVIEW"
  ]
};

test("reviewer demo loads the five US institutional applicants and expected routes", () => {
  const applicants = parseApplicantSet(demo.applicantSet);

  assert.deepEqual(
    applicants.map((applicant) => applicant.name),
    Object.keys(expectedRoutes)
  );
  assert.match(demo.criteriaText, /US-based 501\(c\)\(3\) public charity/);
  assert.match(demo.criteriaText, /\$500,000 and \$10 million/);
  assert.match(demo.criteriaText, /Michigan, Ohio, Indiana, Illinois, or Wisconsin/);

  assert.equal(demo.result.applicants.length, 5);
  for (const applicant of demo.result.applicants) {
    assert.deepEqual(
      [
        applicant.result.eligibility_bucket,
        applicant.result.triage_disposition
      ],
      expectedRoutes[applicant.name]
    );
  }
});

test("saved reviewer worklist passes the production schemas and every bucket is represented", () => {
  const criteriaResult = {
    criteria_extracted: demo.result.criteria_extracted,
    warnings: demo.result.criteria_warnings
  };
  assert.equal(assertFunderCriteriaResult(criteriaResult), criteriaResult);

  for (const applicant of demo.result.applicants) {
    assert.equal(
      assertFunderApplicantResult(applicant.result, {
        criteriaExtracted: demo.result.criteria_extracted
      }),
      applicant.result
    );
  }

  assert.deepEqual(
    new Set(demo.result.applicants.map((applicant) => applicant.result.eligibility_bucket)),
    new Set([
      "MEETS STATED CRITERIA",
      "ELIGIBILITY UNCERTAIN",
      "OUTSIDE STATED SCOPE"
    ])
  );
});

test("silence remains uncertain and optional priorities do not disqualify Cuyahoga", () => {
  const grandPrairie = demo.result.applicants.find(
    (applicant) => applicant.name === "Grand Prairie Skills Center"
  );
  const cuyahoga = demo.result.applicants.find(
    (applicant) => applicant.name === "Cuyahoga Small Business Lab"
  );

  assert.equal(grandPrairie.result.eligibility_bucket, "ELIGIBILITY UNCERTAIN");
  const grandPrairieMissingFacts = grandPrairie.result.missing_or_ambiguous
    .map((item) => item.item)
    .join("\n");
  assert.match(grandPrairieMissingFacts, /501\(c\)\(3\).*public charity/i);
  assert.match(grandPrairieMissingFacts, /operating budget/i);
  assert.match(grandPrairieMissingFacts, /operating history/i);
  assert.equal(cuyahoga.result.eligibility_bucket, "MEETS STATED CRITERIA");
  assert.match(cuyahoga.result.warnings.join(" "), /funding priorities.*not mandatory/i);
});

test("reviewer demo contains no legacy global-development scenario or applicant scoring fields", () => {
  const serialized = JSON.stringify(demo);
  assert.doesNotMatch(
    serialized,
    /SheConnects|Mama Mobile Health|Sub-Saharan|community health worker|maternal health|ICT4D|international development/i
  );
  assert.doesNotMatch(serialized, /"(?:score|rank|grade|rating|percentage|stars?)"\s*:/i);
});

test("applicant demo is unchanged and the saved reviewer path is explicit", () => {
  assert.deepEqual(window.GRANT_FIT_DEMO, applicantDemoBeforeReviewerFixture);
  assert.match(window.GRANT_FIT_DEMO.rfpText, /SheConnects Digital Accelerator/);
  assert.match(window.GRANT_FIT_DEMO.ngoProfile, /Mama Mobile Health/);

  const appSource = fs.readFileSync(path.join(repoRoot, "public", "app.js"), "utf8");
  const pageSource = fs.readFileSync(path.join(repoRoot, "public", "index.html"), "utf8");
  const csvStart = appSource.indexOf("function exportReviewerCsv");
  const pdfStart = appSource.indexOf("function exportReviewerPdf");
  const csvSource = appSource.slice(csvStart, pdfStart);

  assert.match(appSource, /reviewer-demo/);
  assert.match(appSource, /Saved fictional example loaded instantly/);
  assert.match(pageSource, /Triage order for reviewer attention/);
  assert.match(csvSource, /Ordering note/);
  assert.match(csvSource, /Triage order for reviewer attention/);
  assert.doesNotMatch(csvSource, /score|grade|percentage|star rating/i);
});
