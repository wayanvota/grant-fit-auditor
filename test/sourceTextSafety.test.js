import test from "node:test";
import assert from "node:assert/strict";
import { assertPublicHttpUrl, extractSourceText, fetchPublicSource } from "../src/sourceText.js";

test("source URLs must use public HTTP or HTTPS addresses", async () => {
  await assert.rejects(() => assertPublicHttpUrl("file:///etc/passwd"), /public HTTP or HTTPS/);
  await assert.rejects(() => assertPublicHttpUrl("http://127.0.0.1/admin"), /Private and local/);
  await assert.rejects(() => assertPublicHttpUrl("http://localhost:3000/health"), /public HTTP or HTTPS/);
  await assert.rejects(() => assertPublicHttpUrl("http://192.0.2.1/test"), /Private and local/);
  await assert.rejects(() => assertPublicHttpUrl("http://[2001:db8::1]/test"), /Private and local/);
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

test("redirects are revalidated before a second request", async () => {
  let requests = 0;
  const dnsLookup = async () => [{ address: "93.184.216.34", family: 4 }];
  const request = async () => {
    requests += 1;
    return {
      response: { ok: false, status: 302, headers: { location: "http://127.0.0.1/private" } },
      body: Buffer.alloc(0)
    };
  };
  await assert.rejects(
    () => fetchPublicSource("https://fund.example/start", { dnsLookup, request }),
    /Private and local/
  );
  assert.equal(requests, 1);
});

test("remote fetches receive only validated addresses", async () => {
  const dnsLookup = async () => [{ address: "93.184.216.34", family: 4 }];
  let received;
  const request = async (resolved) => {
    received = resolved;
    return {
      response: { ok: true, status: 200, headers: { "content-type": "text/plain" } },
      body: Buffer.from("Public opportunity text")
    };
  };
  const result = await fetchPublicSource("https://fund.example/rfp", { dnsLookup, request });
  assert.equal(result.body.toString(), "Public opportunity text");
  assert.deepEqual(received.addresses, [{ address: "93.184.216.34", family: 4 }]);
});

test("normalization remains fast for long runs of tabs", async () => {
  const started = performance.now();
  const result = await extractSourceText({ pastedText: `Heading${"\t".repeat(100_000)}\nBody`, url: "" });
  assert.equal(result.text, "Heading\nBody");
  assert.ok(performance.now() - started < 1_000);
});
