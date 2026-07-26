window.GRANT_FIT_FUNDER_DEMO = {
  criteriaText: String.raw`**Riverbend Opportunity Fund, 2026 Economic Mobility Open Call** (fictional demo funder)

The Riverbend Opportunity Fund supports nonprofits that expand economic mobility for low-income adults across the Great Lakes region. This open call awards unrestricted grants of $150,000 over two years.

**Mandatory eligibility.** An applicant must meet all of the following to advance to full review:
1. Be a US-based 501(c)(3) public charity in good standing with the IRS.
2. Report a total annual operating budget between $500,000 and $10 million.
3. Primarily serve residents of the Great Lakes region, defined as Michigan, Ohio, Indiana, Illinois, or Wisconsin.
4. Operate programs whose primary purpose is workforce training, job placement, or small-business support for low-income adults.
5. Have at least three years of operating history.

**Funding priorities** (considered after eligibility, not required):
- Formal partnerships with community colleges or regional employers.
- Documented job-placement or business-formation outcomes.

Applications that do not meet all mandatory criteria will not advance to full review.`,
  applicantSet: String.raw`Lakeshore Workforce Collaborative

Lakeshore Workforce Collaborative is a 501(c)(3) public charity in good standing with the IRS, founded in 2016 and based in Detroit, Michigan. We operate adult workforce training and job-placement programs for low-income residents across Michigan and northern Ohio. Our annual operating budget is $2.1 million. We partner with Wayne County Community College District to deliver credentialing, and last year we placed 640 participants into full-time employment with an eighteen-month retention rate of 71 percent.

---

Grand Prairie Skills Center

Grand Prairie Skills Center runs job-readiness and vocational training for low-income adults in and around Springfield, Illinois. Our programs focus on manufacturing and healthcare-support credentials, and we work closely with Lincoln Land Community College. Participants consistently report improved earnings after completing our tracks.

---

Sun Valley Opportunity Network

Sun Valley Opportunity Network is a 501(c)(3) founded in 2018 with an annual operating budget of $1.5 million. We provide workforce training and job placement for low-income adults across Arizona and New Mexico, with a focus on the solar and construction trades.

---

Great Lakes Arts Alliance

Great Lakes Arts Alliance is a 501(c)(3) public charity established in 2009, headquartered in Milwaukee, Wisconsin, with an annual operating budget of $3.2 million. We provide community arts education, public mural programs, and youth cultural programming across Wisconsin and Illinois.

---

Cuyahoga Small Business Lab

Cuyahoga Small Business Lab is a 501(c)(3) public charity in good standing with the IRS, founded in 2021 and based in Cleveland, Ohio, with an annual operating budget of $780,000. We provide microloans, coaching, and small-business support to low-income entrepreneurs in Cuyahoga County. We are early in building our outcomes-tracking system and do not yet have formal community-college or employer partnerships.`,
  result: {
    "provider": "openai",
    "model": "gpt-5-mini",
    "criteria_extracted": [
      {
        "criterion_id": "criterion_501c3_public_charity",
        "criterion": "Be a US-based 501(c)(3) public charity in good standing with the IRS.",
        "mandatory": true,
        "source_citation": "RFP para 3",
        "source_quote": "Be a US-based 501(c)(3) public charity in good standing with the IRS."
      },
      {
        "criterion_id": "criterion_annual_operating_budget_range",
        "criterion": "Report a total annual operating budget between $500,000 and $10 million.",
        "mandatory": true,
        "source_citation": "RFP para 3",
        "source_quote": "Report a total annual operating budget between $500,000 and $10 million."
      },
      {
        "criterion_id": "criterion_serve_great_lakes_region",
        "criterion": "Primarily serve residents of the Great Lakes region, defined as Michigan, Ohio, Indiana, Illinois, or Wisconsin.",
        "mandatory": true,
        "source_citation": "RFP para 3",
        "source_quote": "Primarily serve residents of the Great Lakes region, defined as Michigan, Ohio, Indiana, Illinois, or Wisconsin."
      },
      {
        "criterion_id": "criterion_program_primary_purpose",
        "criterion": "Operate programs whose primary purpose is workforce training, job placement, or small-business support for low-income adults.",
        "mandatory": true,
        "source_citation": "RFP para 3",
        "source_quote": "Operate programs whose primary purpose is workforce training, job placement, or small-business support for low-income adults."
      },
      {
        "criterion_id": "criterion_three_years_history",
        "criterion": "Have at least three years of operating history.",
        "mandatory": true,
        "source_citation": "RFP para 3",
        "source_quote": "Have at least three years of operating history."
      },
      {
        "criterion_id": "criterion_scope_expand_economic_mobility",
        "criterion": "Support nonprofits that expand economic mobility for low-income adults across the Great Lakes region.",
        "mandatory": false,
        "source_citation": "RFP para 2",
        "source_quote": "supports nonprofits that expand economic mobility for low-income adults across the Great Lakes region."
      },
      {
        "criterion_id": "criterion_priority_formal_partnerships",
        "criterion": "Formal partnerships with community colleges or regional employers.",
        "mandatory": false,
        "source_citation": "RFP para 4",
        "source_quote": "Formal partnerships with community colleges or regional employers."
      },
      {
        "criterion_id": "criterion_priority_documented_outcomes",
        "criterion": "Documented job-placement or business-formation outcomes.",
        "mandatory": false,
        "source_citation": "RFP para 4",
        "source_quote": "Documented job-placement or business-formation outcomes."
      }
    ],
    "criteria_warnings": [],
    "applicants": [
      {
        "id": "applicant_1",
        "name": "Lakeshore Workforce Collaborative",
        "status": "complete",
        "result": {
          "eligibility_bucket": "MEETS STATED CRITERIA",
          "bucket_reasoning": "The applicant provides explicit, supporting statements for each mandatory criterion: 501(c)(3) status in good standing; an annual budget of $2.1 million (within $500k–$10M); primary service area in Michigan and northern Ohio (both within the Great Lakes states list); operation of adult workforce training and job-placement programs for low-income residents; and founding year 2016 (more than three years of operation).",
          "bucket_citations": {
            "criteria": [
              {
                "source_citation": "RFP para 3",
                "source_quote": "Be a US-based 501(c)(3) public charity in good standing with the IRS."
              },
              {
                "source_citation": "RFP para 3",
                "source_quote": "Report a total annual operating budget between $500,000 and $10 million."
              },
              {
                "source_citation": "RFP para 3",
                "source_quote": "Primarily serve residents of the Great Lakes region, defined as Michigan, Ohio, Indiana, Illinois, or Wisconsin."
              },
              {
                "source_citation": "RFP para 3",
                "source_quote": "Operate programs whose primary purpose is workforce training, job placement, or small-business support for low-income adults."
              },
              {
                "source_citation": "RFP para 3",
                "source_quote": "Have at least three years of operating history."
              }
            ],
            "applicant": [
              {
                "source_citation": "Applicant para 2",
                "source_quote": "a 501(c)(3) public charity in good standing with the IRS"
              },
              {
                "source_citation": "Applicant para 2",
                "source_quote": "Our annual operating budget is $2.1 million."
              },
              {
                "source_citation": "Applicant para 2",
                "source_quote": "we operate adult workforce training and job-placement programs for low-income residents across Michigan and northern Ohio."
              },
              {
                "source_citation": "Applicant para 2",
                "source_quote": "we operate adult workforce training and job-placement programs for low-income residents"
              },
              {
                "source_citation": "Applicant para 2",
                "source_quote": "founded in 2016"
              }
            ]
          },
          "flagged_mismatches": [],
          "missing_or_ambiguous": [],
          "triage_disposition": "ROUTE TO FULL REVIEW",
          "disposition_reasoning": "All mandatory eligibility criteria in RFP para 3 are directly supported by applicant statements in Applicant para 2, so the application should advance to full review.",
          "warnings": []
        }
      },
      {
        "id": "applicant_2",
        "name": "Grand Prairie Skills Center",
        "status": "complete",
        "result": {
          "eligibility_bucket": "ELIGIBILITY UNCERTAIN",
          "bucket_reasoning": "Applicant materials show programs for low-income adults in Springfield, Illinois and vocational/job-readiness training (matches region and program-purpose criteria). Applicant does not state IRS 501(c)(3) status, total annual operating budget, or years of operation, so three mandatory criteria cannot be confirmed from the provided text.",
          "bucket_citations": {
            "criteria": [
              {
                "source_citation": "RFP para 3",
                "source_quote": "Be a US-based 501(c)(3) public charity in good standing with the IRS."
              },
              {
                "source_citation": "RFP para 3",
                "source_quote": "Report a total annual operating budget between $500,000 and $10 million."
              },
              {
                "source_citation": "RFP para 3",
                "source_quote": "Primarily serve residents of the Great Lakes region, defined as Michigan, Ohio, Indiana, Illinois, or Wisconsin."
              },
              {
                "source_citation": "RFP para 3",
                "source_quote": "Operate programs whose primary purpose is workforce training, job placement, or small-business support for low-income adults."
              },
              {
                "source_citation": "RFP para 3",
                "source_quote": "Have at least three years of operating history."
              }
            ],
            "applicant": [
              {
                "source_citation": "Applicant para 2",
                "source_quote": "Grand Prairie Skills Center runs job-readiness and vocational training for low-income adults in and around Springfield, Illinois."
              },
              {
                "source_citation": "Applicant para 2",
                "source_quote": "Grand Prairie Skills Center runs job-readiness and vocational training for low-income adults in and around Springfield, Illinois."
              },
              {
                "source_citation": "Applicant para 2",
                "source_quote": "Grand Prairie Skills Center runs job-readiness and vocational training for low-income adults in and around Springfield, Illinois."
              },
              {
                "source_citation": "Applicant para 2",
                "source_quote": "Our programs focus on manufacturing and healthcare-support credentials, and we work closely with Lincoln Land Community College."
              },
              {
                "source_citation": "Applicant para 2",
                "source_quote": "Grand Prairie Skills Center runs job-readiness and vocational training for low-income adults in and around Springfield, Illinois."
              }
            ]
          },
          "flagged_mismatches": [],
          "missing_or_ambiguous": [
            {
              "item": "501(c)(3) public charity status and good standing with the IRS",
              "why_needed": "RFP requires applicant to be a US-based 501(c)(3) public charity in good standing to advance to full review.",
              "criteria_citation": "RFP para 3",
              "applicant_citation": "Applicant para 2",
              "applicant_quote": "Grand Prairie Skills Center runs job-readiness and vocational training for low-income adults in and around Springfield, Illinois."
            },
            {
              "item": "Total annual operating budget",
              "why_needed": "RFP requires reporting a total annual operating budget between $500,000 and $10 million to advance to full review.",
              "criteria_citation": "RFP para 3",
              "applicant_citation": "Applicant para 2",
              "applicant_quote": "Grand Prairie Skills Center runs job-readiness and vocational training for low-income adults in and around Springfield, Illinois."
            },
            {
              "item": "Length of operating history (at least three years)",
              "why_needed": "RFP requires at least three years of operating history to advance to full review.",
              "criteria_citation": "RFP para 3",
              "applicant_citation": "Applicant para 2",
              "applicant_quote": "Grand Prairie Skills Center runs job-readiness and vocational training for low-income adults in and around Springfield, Illinois."
            }
          ],
          "triage_disposition": "NEEDS HUMAN CHECK",
          "disposition_reasoning": "Two mandatory criteria (serve region and operate workforce-training programs for low-income adults) are supported by the applicant text. Three mandatory criteria (501(c)(3) status, annual operating budget, and at least three years of operating history) are not stated in the provided applicant materials and require human verification.",
          "warnings": [
            "Applicant notes a partnership with Lincoln Land Community College; that addresses a funding priority (RFP para 4) but is not a required eligibility criterion."
          ]
        }
      },
      {
        "id": "applicant_3",
        "name": "Sun Valley Opportunity Network",
        "status": "complete",
        "result": {
          "eligibility_bucket": "OUTSIDE STATED SCOPE",
          "bucket_reasoning": "The applicant states it primarily serves Arizona and New Mexico, which directly conflicts with the mandatory criterion requiring primary service to residents of Michigan, Ohio, Indiana, Illinois, or Wisconsin. Other mandatory criteria are present or partially present in the application, but the geographic conflict makes the applicant outside the funder's stated scope.",
          "bucket_citations": {
            "criteria": [
              {
                "source_citation": "RFP para 3",
                "source_quote": "Primarily serve residents of the Great Lakes region, defined as Michigan, Ohio, Indiana, Illinois, or Wisconsin."
              },
              {
                "source_citation": "RFP para 3",
                "source_quote": "Be a US-based 501(c)(3) public charity in good standing with the IRS."
              },
              {
                "source_citation": "RFP para 3",
                "source_quote": "Report a total annual operating budget between $500,000 and $10 million."
              },
              {
                "source_citation": "RFP para 3",
                "source_quote": "Operate programs whose primary purpose is workforce training, job placement, or small-business support for low-income adults."
              },
              {
                "source_citation": "RFP para 3",
                "source_quote": "Have at least three years of operating history."
              }
            ],
            "applicant": [
              {
                "source_citation": "Applicant para 2",
                "source_quote": "We provide workforce training and job placement for low-income adults"
              },
              {
                "source_citation": "Applicant para 2",
                "source_quote": "Sun Valley Opportunity Network is a 501(c)(3) founded in 2018"
              },
              {
                "source_citation": "Applicant para 2",
                "source_quote": "annual operating budget of $1.5 million"
              },
              {
                "source_citation": "Applicant para 2",
                "source_quote": "across Arizona and New Mexico"
              },
              {
                "source_citation": "Applicant para 2",
                "source_quote": "founded in 2018"
              }
            ]
          },
          "flagged_mismatches": [
            {
              "criterion_id": "criterion_serve_great_lakes_region",
              "mismatch": "Applicant states primary service area is Arizona and New Mexico, which conflicts with the criterion requiring primary service to Michigan, Ohio, Indiana, Illinois, or Wisconsin.",
              "criteria_citation": "RFP para 3",
              "criteria_quote": "Primarily serve residents of the Great Lakes region, defined as Michigan, Ohio, Indiana, Illinois, or Wisconsin.",
              "applicant_citation": "Applicant para 2",
              "applicant_quote": "We provide workforce training and job placement for low-income adults across Arizona and New Mexico"
            }
          ],
          "missing_or_ambiguous": [
            {
              "item": "Explicit statement that the organization is a 'public charity' and 'in good standing with the IRS.'",
              "why_needed": "The mandatory criterion requires: \"Be a US-based 501(c)(3) public charity in good standing with the IRS.\" (RFP para 3).",
              "criteria_citation": "RFP para 3",
              "applicant_citation": "Applicant para 2",
              "applicant_quote": "Sun Valley Opportunity Network is a 501(c)(3) founded in 2018"
            }
          ],
          "triage_disposition": "CONFIRM AGAINST SCOPE",
          "disposition_reasoning": "Because the applicant's stated geographic service area (Arizona and New Mexico) directly conflicts with the RFP requirement to primarily serve residents of the Great Lakes states, route this application for human review to confirm exclusion under scope. Human reviewer should also verify the applicant's 501(c)(3) public charity status and IRS standing if needed.",
          "warnings": [
            "Applicant's primary service area is outside the funder's defined Great Lakes region.",
            "Applicant claims 501(c)(3) status but does not explicitly state 'public charity' or 'in good standing with the IRS.'",
            "Do not infer that service in Arizona and New Mexico satisfies the Great Lakes geographic requirement."
          ]
        }
      },
      {
        "id": "applicant_4",
        "name": "Great Lakes Arts Alliance",
        "status": "complete",
        "result": {
          "eligibility_bucket": "OUTSIDE STATED SCOPE",
          "bucket_reasoning": "The applicant states its primary programs are arts education, public murals, and youth cultural programming, which directly conflicts with the mandatory criterion that programs' primary purpose be workforce training, job placement, or small-business support for low-income adults. The applicant also does not explicitly state IRS 'good standing.'",
          "bucket_citations": {
            "criteria": [
              {
                "source_citation": "RFP para 3",
                "source_quote": "Operate programs whose primary purpose is workforce training, job placement, or small-business support for low-income adults."
              },
              {
                "source_citation": "RFP para 3",
                "source_quote": "Be a US-based 501(c)(3) public charity in good standing with the IRS."
              },
              {
                "source_citation": "RFP para 3",
                "source_quote": "Report a total annual operating budget between $500,000 and $10 million."
              },
              {
                "source_citation": "RFP para 3",
                "source_quote": "Primarily serve residents of the Great Lakes region, defined as Michigan, Ohio, Indiana, Illinois, or Wisconsin."
              },
              {
                "source_citation": "RFP para 3",
                "source_quote": "Have at least three years of operating history."
              }
            ],
            "applicant": [
              {
                "source_citation": "Applicant para 2",
                "source_quote": "We provide community arts education, public mural programs, and youth cultural programming across Wisconsin and Illinois."
              },
              {
                "source_citation": "Applicant para 2",
                "source_quote": "Great Lakes Arts Alliance is a 501(c)(3) public charity established in 2009, headquartered in Milwaukee, Wisconsin, with an annual operating budget of $3.2 million."
              },
              {
                "source_citation": "Applicant para 2",
                "source_quote": "with an annual operating budget of $3.2 million."
              },
              {
                "source_citation": "Applicant para 2",
                "source_quote": "headquartered in Milwaukee, Wisconsin, with ... programs across Wisconsin and Illinois."
              },
              {
                "source_citation": "Applicant para 2",
                "source_quote": "established in 2009"
              }
            ]
          },
          "flagged_mismatches": [
            {
              "criterion_id": "criterion_program_primary_purpose",
              "mismatch": "Applicant describes primary programs as arts education, murals, and youth cultural programming rather than workforce training, job placement, or small-business support for low-income adults.",
              "criteria_citation": "RFP para 3: \"Operate programs whose primary purpose is workforce training, job placement, or small-business support for low-income adults.\"",
              "criteria_quote": "Operate programs whose primary purpose is workforce training, job placement, or small-business support for low-income adults.",
              "applicant_citation": "Applicant para 2: \"We provide community arts education, public mural programs, and youth cultural programming across Wisconsin and Illinois.\"",
              "applicant_quote": "We provide community arts education, public mural programs, and youth cultural programming across Wisconsin and Illinois."
            }
          ],
          "missing_or_ambiguous": [
            {
              "item": "IRS good standing status",
              "why_needed": "Criterion requires the applicant be \"a US-based 501(c)(3) public charity in good standing with the IRS.\" The applicant states it is a 501(c)(3) public charity but does not state it is in good standing.",
              "criteria_citation": "RFP para 3: \"Be a US-based 501(c)(3) public charity in good standing with the IRS.\"",
              "applicant_citation": "Applicant para 2",
              "applicant_quote": "Great Lakes Arts Alliance is a 501(c)(3) public charity established in 2009, headquartered in Milwaukee, Wisconsin, with an annual operating budget of $3.2 million."
            }
          ],
          "triage_disposition": "CONFIRM AGAINST SCOPE",
          "disposition_reasoning": "The applicant's stated primary programs do not match the mandatory program-purpose criterion, which directly places the application outside the funder's stated scope. Also note the applicant does not explicitly assert IRS 'good standing'; if the reviewer considers the program-purpose conflict potentially resolvable (for example if the applicant runs workforce programs not described here), the reviewer should confirm program purposes and IRS standing.",
          "warnings": [
            "Applicant does not explicitly state it is 'in good standing with the IRS.'",
            "Applicant's described activities focus on arts and youth cultural programming rather than the mandatory workforce/job-placement/small-business support for low-income adults."
          ]
        }
      },
      {
        "id": "applicant_5",
        "name": "Cuyahoga Small Business Lab",
        "status": "complete",
        "result": {
          "eligibility_bucket": "MEETS STATED CRITERIA",
          "bucket_reasoning": "The applicant statement provides explicit evidence for each mandatory criterion: 501(c)(3) status in good standing, an annual budget of $780,000 (within $500k–$10M), primary service to Cuyahoga County (Ohio) residents in the Great Lakes region, programs providing small-business support to low-income entrepreneurs, and a founding year of 2021 supporting at least three years of operation.",
          "bucket_citations": {
            "criteria": [
              {
                "source_citation": "RFP para 3",
                "source_quote": "Be a US-based 501(c)(3) public charity in good standing with the IRS."
              },
              {
                "source_citation": "RFP para 3",
                "source_quote": "Report a total annual operating budget between $500,000 and $10 million."
              },
              {
                "source_citation": "RFP para 3",
                "source_quote": "Primarily serve residents of the Great Lakes region, defined as Michigan, Ohio, Indiana, Illinois, or Wisconsin."
              },
              {
                "source_citation": "RFP para 3",
                "source_quote": "Operate programs whose primary purpose is workforce training, job placement, or small-business support for low-income adults."
              },
              {
                "source_citation": "RFP para 3",
                "source_quote": "Have at least three years of operating history."
              }
            ],
            "applicant": [
              {
                "source_citation": "Applicant para 2",
                "source_quote": "Cuyahoga Small Business Lab is a 501(c)(3) public charity in good standing with the IRS"
              },
              {
                "source_citation": "Applicant para 2",
                "source_quote": "annual operating budget of $780,000"
              },
              {
                "source_citation": "Applicant para 2",
                "source_quote": "based in Cleveland, Ohio ... provide ... to low-income entrepreneurs in Cuyahoga County"
              },
              {
                "source_citation": "Applicant para 2",
                "source_quote": "We provide microloans, coaching, and small-business support to low-income entrepreneurs in Cuyahoga County."
              },
              {
                "source_citation": "Applicant para 2",
                "source_quote": "founded in 2021"
              }
            ]
          },
          "flagged_mismatches": [],
          "missing_or_ambiguous": [],
          "triage_disposition": "ROUTE TO FULL REVIEW",
          "disposition_reasoning": "All mandatory eligibility criteria have corresponding applicant statements in the profile; advance to full review for programmatic and priority assessment.",
          "warnings": [
            "Applicant notes they are early in building outcomes-tracking and do not yet have formal community-college or employer partnerships; these are listed as funding priorities in the RFP but are not mandatory criteria."
          ]
        }
      }
    ],
    "source": {
      "type": "text",
      "label": "Saved fictional Riverbend Opportunity Fund example",
      "characterCount": 1137,
      "warnings": []
    },
    "savedExample": true
  }
};
