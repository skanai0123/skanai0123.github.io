import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { KEY_PREFIX, digestSlug, handleRequest, normalizeHash } from "../cloudflare/optics-bench-links/worker.mjs";

const shareHash = value => "#ob1=" + gzipSync(JSON.stringify(value)).toString("base64url");
const origin = "https://skanai0123.github.io";

function environment(options = {}) {
  const values = new Map(options.values || []), puts = [];
  return {
    values, puts,
    LINKS: {
      async get(key) { return values.get(key) ?? null; },
      async put(key, value, settings) { values.set(key, value); puts.push({ key, value, settings }); }
    },
    LINK_LIMITER: { async limit() { return { success: options.rateLimited !== true }; } }
  };
}

const createRequest = (hash, extra = {}) => new Request("https://o.example/api/links", {
  method: "POST",
  headers: { "Content-Type": "application/json", "Origin": origin, "CF-Connecting-IP": "192.0.2.10", ...extra.headers },
  body: extra.body ?? JSON.stringify({ hash })
});

test("short-link worker stores one canonical Optics Bench payload and reuses its deterministic slug", async () => {
  const hash = shareHash({ schemaVersion: 2, title: "共有する光学系", elements: [] }), payload = normalizeHash(hash), env = environment();
  const first = await handleRequest(createRequest(hash), env), firstBody = await first.json();
  assert.equal(first.status, 201); assert.equal(firstBody.created, true);
  assert.match(firstBody.url, /^https:\/\/o\.example\/[A-Za-z0-9_-]{12}$/);
  assert.equal(firstBody.slug, (await digestSlug(payload)).slice(0, 12));
  assert.deepEqual(env.puts, [{ key: KEY_PREFIX + firstBody.slug, value: payload, settings: { metadata: { version: 1 } } }]);

  const second = await handleRequest(createRequest(hash), env), secondBody = await second.json();
  assert.equal(second.status, 200); assert.equal(secondBody.created, false); assert.equal(secondBody.url, firstBody.url);
  assert.equal(env.puts.length, 1);
});

test("short-link worker redirects a known slug only to the fixed Optics Bench destination", async () => {
  const hash = shareHash({ schemaVersion: 2, title: "固定先", elements: [] }), payload = normalizeHash(hash), slug = (await digestSlug(payload)).slice(0, 12);
  const env = environment({ values: [[KEY_PREFIX + slug, payload]] });
  const response = await handleRequest(new Request("https://o.example/" + slug, { redirect: "manual" }), env);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("Location"), "https://skanai0123.github.io/optics-bench/#ob1=" + payload);
  assert.equal(response.headers.get("X-Robots-Tag"), "noindex, nofollow");
  assert.equal((await handleRequest(new Request("https://o.example/not-found-id"), env)).status, 404);
});

test("short-link worker lengthens an ID if a shorter digest key is already occupied", async () => {
  const hash = shareHash({ schemaVersion: 2, title: "衝突回避", elements: [] }), payload = normalizeHash(hash), digest = await digestSlug(payload);
  const env = environment({ values: [[KEY_PREFIX + digest.slice(0, 12), "different-valid-looking-payload"]] });
  const response = await handleRequest(createRequest(hash), env), body = await response.json();
  assert.equal(response.status, 201); assert.equal(body.slug, digest.slice(0, 16));
  assert.equal(env.puts[0].key, KEY_PREFIX + body.slug);
});

test("short-link worker rejects other origins, arbitrary URLs, malformed gzip and oversized requests", async () => {
  const hash = shareHash({ schemaVersion: 2, elements: [] });
  let response = await handleRequest(createRequest(hash, { headers: { Origin: "https://attacker.example" } }), environment());
  assert.equal(response.status, 403);
  response = await handleRequest(createRequest("https://example.com/redirect"), environment()); assert.equal(response.status, 400);
  response = await handleRequest(createRequest("#ob1=YWJjZA"), environment()); assert.equal(response.status, 400);
  response = await handleRequest(createRequest(hash, { headers: { "Content-Length": "70000" } }), environment()); assert.equal(response.status, 413);
  response = await handleRequest(new Request("https://o.example/api/links", { method: "POST", headers: { Origin: origin, "Content-Type": "text/plain" }, body: "x" }), environment());
  assert.equal(response.status, 415);
});

test("short-link worker returns CORS preflight, rate-limit and method responses without writing KV", async () => {
  const preflight = await handleRequest(new Request("https://o.example/api/links", { method: "OPTIONS", headers: { Origin: origin } }), environment());
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), origin);
  const env = environment({ rateLimited: true });
  const limited = await handleRequest(createRequest(shareHash({ schemaVersion: 2, elements: [] })), env);
  assert.equal(limited.status, 429); assert.equal(limited.headers.get("Retry-After"), "60"); assert.equal(env.puts.length, 0);
  const method = await handleRequest(new Request("https://o.example/api/links", { method: "GET", headers: { Origin: origin } }), environment());
  assert.equal(method.status, 405); assert.equal(method.headers.get("Allow"), "POST, OPTIONS");
});
