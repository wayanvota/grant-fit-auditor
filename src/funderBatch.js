export const FUNDER_BATCH_LIMIT = 6;
export const FUNDER_BATCH_CONCURRENCY = 2;

export function parseApplicantSet(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) {
    throw publicInputError("Paste at least one applicant profile before running reviewer triage.");
  }

  const blocks = raw
    .split(/\n\s*(?:---+|===+)\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length > FUNDER_BATCH_LIMIT) {
    throw publicInputError(
      `This version accepts up to ${FUNDER_BATCH_LIMIT} applicants per run. Split the set into smaller batches.`
    );
  }

  const applicants = blocks.map((profile, index) => {
    if (profile.length < 80) {
      throw publicInputError(
        `Applicant ${index + 1} needs a fuller profile. Include mission, geography, programs, scale, and evidence where available.`
      );
    }

    return {
      id: `applicant_${index + 1}`,
      name: applicantName(profile, index),
      profile
    };
  });

  return applicants;
}

export async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  const workerCount = Math.min(Math.max(1, limit), items.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

function applicantName(profile, index) {
  const firstLine = profile.split("\n").find((line) => line.trim())?.trim() || "";
  const cleaned = firstLine
    .replace(/^#{1,6}\s*/, "")
    .replace(/^(?:applicant|organization|name)\s*:\s*/i, "")
    .split(/\s+[|:]\s+|\s+[–—-]\s+/)[0]
    .trim();

  if (cleaned && cleaned.length <= 100) return cleaned;
  return `Applicant ${index + 1}`;
}

function publicInputError(message) {
  const error = new Error(message);
  error.publicMessage = message;
  error.statusCode = 400;
  return error;
}
