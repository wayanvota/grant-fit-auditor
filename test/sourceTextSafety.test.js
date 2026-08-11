import test from "node:test";
import assert from "node:assert/strict";
import { assertPublicHttpUrl, extractSourceText } from "../src/sourceText.js";

test("source URLs must use public HTTP or HTTPS addresses", async () => {
  await assert.rejects(() => assertPublicHttpUrl("file:///etc/passwd"), /public HTTP or HTTPS/);
  await assert.rejects(() => assertPublicHttpUrl("http://127.0.0.1/admin"), /Private and local/);
  await assert.rejects(() => assertPublicHttpUrl("http://localhost:3000/health"), /public HTTP or HTTPS/);
  await assert.rejects(
    () => assertPublicHttpUrl("https://internal.example/path", async () => [{ address: "10.0.0.8", family: 4 }]),
    /private or local network/
  );
  const accepted = await assertPublicHttpUrl("https://fund.example/guidelines", async () => [{ address: "93.184.216.34", family: 4 }]);
  assert.equal(accepted.hostname, "fund.example");
});

test("malformed uploaded PDFs return a clean client error", async () => {
  await assert.rejects(
    () => extractSourceText({
      pastedText: "",
      url: "",
      pdfFile: { buffer: Buffer.from("not a pdf"), originalname: "bad.pdf" }
    }),
    (error) => error.statusCode === 400 && /PDF could not be read/.test(error.publicMessage)
  );
});
