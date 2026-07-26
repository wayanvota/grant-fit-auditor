import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");
const textExtensions = new Set([
  "",
  ".css",
  ".example",
  ".html",
  ".js",
  ".json",
  ".md",
  ".txt",
  ".yaml",
  ".yml"
]);

function textFiles(directory) {
  const output = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if ([".git", "node_modules", "upload-packages"].includes(entry.name)) continue;
    if (
      entry.name.startsWith(".") &&
      ![".env.example", ".gitattributes", ".gitignore"].includes(entry.name)
    ) {
      continue;
    }
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      output.push(...textFiles(fullPath));
    } else if (textExtensions.has(path.extname(entry.name))) {
      output.push(fullPath);
    }
  }
  return output;
}

test("Wednesday publication firewall excludes embargoed funder references", () => {
  const terms = [
    ["Mac", "Arthur"].join(""),
    ["100", "&", "Change"].join(""),
    ["100", " and ", "Change"].join(""),
    ["Lever", " for ", "Change"].join("")
  ];
  const repoText = textFiles(repoRoot)
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");
  const commitMessages = execFileSync(
    "git",
    ["log", "--all", "--format=%B"],
    { cwd: repoRoot, encoding: "utf8" }
  );

  for (const term of terms) {
    assert.doesNotMatch(repoText, new RegExp(term, "i"));
    assert.doesNotMatch(commitMessages, new RegExp(term, "i"));
  }
});

test("the named AI provider remains an engine only", () => {
  const subjectName = ["OpenAI", " Foundation"].join("");
  const repoText = textFiles(repoRoot)
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");

  assert.doesNotMatch(repoText, new RegExp(subjectName, "i"));
  assert.match(repoText, /value="openai"/);
  assert.match(repoText, />ChatGPT</);
});
