import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const forbidden = [
  ["Mac", "Arthur"], ["100", "&", "Change"], ["100", " and ", "Change"],
  ["Lever", " for ", "Change"], ["Mc", "Govern"], ["Patrick J. ", "Mc", "Govern"], ["Intele", "health"]
].map((parts) => parts.join(""));

test("forbidden references are absent from tracked files and history", () => {
  const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], { cwd: repoRoot })
    .toString().split("\0").filter(Boolean);
  const text = files.map((file) => {
    try { return fs.readFileSync(path.join(repoRoot, file), "utf8"); } catch { return ""; }
  }).join("\n");
  const history = execFileSync("git", ["log", "--all", "--format=%B"], { cwd: repoRoot, encoding: "utf8" });
  for (const term of forbidden) {
    assert.doesNotMatch(text, new RegExp(term, "i"));
    assert.doesNotMatch(history, new RegExp(term, "i"));
  }
});

test("the public interface has one applicant workflow and no vendor labels", () => {
  const html = fs.readFileSync(path.join(repoRoot, "public", "index.html"), "utf8");
  const js = fs.readFileSync(path.join(repoRoot, "public", "app.js"), "utf8");
  assert.doesNotMatch(`${html}\n${js}`, /ChatGPT|Claude|provider|reviewer/i);
  assert.match(html, /Should this opportunity get staff time/);
  assert.match(html, /Human authority/);
});
