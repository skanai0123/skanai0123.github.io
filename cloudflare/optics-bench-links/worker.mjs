const APP_URL = "https://skanai0123.github.io/optics-bench/";
const HASH_PREFIX = "#ob1=";
const MAX_HASH_CHARS = 65_536;
const MAX_BODY_CHARS = 66_000;
const KEY_PREFIX = "link:v1:";
const SLUG_LENGTHS = Object.freeze([12, 16, 20, 32, 43]);

function securityHeaders(extra = {}) {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
    ...extra
  };
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: securityHeaders({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers })
  });
}

function allowedOrigin(origin) {
  if (origin === "null" || origin === "https://skanai0123.github.io") return origin;
  if (!origin) return null;
  try {
    const url = new URL(origin);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return /^(localhost|.*\.localhost|127(?:\.\d+){3}|0\.0\.0\.0|\[::1\])$/i.test(url.hostname) ? origin : null;
  } catch (_) { return null; }
}

function corsHeaders(origin) {
  const allowed = allowedOrigin(origin);
  return allowed ? {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  } : { "Vary": "Origin" };
}

function base64Url(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 4096) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 4096));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(payload) {
  const padding = "=".repeat((4 - payload.length % 4) % 4);
  const binary = atob(payload.replace(/-/g, "+").replace(/_/g, "/") + padding);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function normalizeHash(hash) {
  if (typeof hash !== "string" || hash.length > MAX_HASH_CHARS) throw new Error("invalid_hash");
  const normalized = hash.startsWith("#") ? hash : "#" + hash;
  if (!normalized.startsWith(HASH_PREFIX)) throw new Error("invalid_hash");
  const payload = normalized.slice(HASH_PREFIX.length);
  if (!payload || !/^[A-Za-z0-9_-]+$/.test(payload) || payload.length % 4 === 1) throw new Error("invalid_hash");
  let bytes;
  try { bytes = decodeBase64Url(payload); }
  catch (_) { throw new Error("invalid_hash"); }
  if (base64Url(bytes) !== payload || bytes.length < 10 || bytes[0] !== 0x1f || bytes[1] !== 0x8b || bytes[2] !== 8) {
    throw new Error("invalid_hash");
  }
  return payload;
}

async function digestSlug(payload) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload)));
  return base64Url(digest);
}

async function storeLink(payload, links) {
  if (!links?.get || !links?.put) throw new Error("storage_unavailable");
  const digest = await digestSlug(payload);
  for (const length of SLUG_LENGTHS) {
    const slug = digest.slice(0, length), key = KEY_PREFIX + slug;
    const existing = await links.get(key);
    if (existing === payload) return { slug, created: false };
    if (existing === null || existing === undefined) {
      await links.put(key, payload, { metadata: { version: 1 } });
      return { slug, created: true };
    }
  }
  throw new Error("slug_collision");
}

async function createLink(request, env) {
  const origin = request.headers.get("Origin"), cors = corsHeaders(origin);
  if (!allowedOrigin(origin)) return json({ error: "origin_not_allowed" }, 403, cors);
  const contentType = request.headers.get("Content-Type") || "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) return json({ error: "json_required" }, 415, cors);
  const contentLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_CHARS) return json({ error: "payload_too_large" }, 413, cors);
  if (env.LINK_LIMITER?.limit) {
    const actor = request.headers.get("CF-Connecting-IP") || "anonymous";
    const { success } = await env.LINK_LIMITER.limit({ key: "create:" + actor });
    if (!success) return json({ error: "rate_limited" }, 429, { ...cors, "Retry-After": "60" });
  }
  let body;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_CHARS) return json({ error: "payload_too_large" }, 413, cors);
    body = JSON.parse(text);
  } catch (_) { return json({ error: "invalid_json" }, 400, cors); }
  let payload;
  try { payload = normalizeHash(body?.hash); }
  catch (_) { return json({ error: "invalid_share_hash" }, 400, cors); }
  try {
    const stored = await storeLink(payload, env.LINKS);
    const shortUrl = new URL("/" + stored.slug, request.url).href;
    return json({ url: shortUrl, slug: stored.slug, created: stored.created }, stored.created ? 201 : 200, cors);
  } catch (error) {
    return json({ error: error.message === "slug_collision" ? "slug_collision" : "storage_unavailable" }, 503, cors);
  }
}

async function redirectLink(request, env, slug) {
  if (!/^[A-Za-z0-9_-]{12,43}$/.test(slug)) return json({ error: "not_found" }, 404);
  let payload;
  try { payload = await env.LINKS?.get(KEY_PREFIX + slug); }
  catch (_) { return json({ error: "storage_unavailable" }, 503); }
  if (!payload) return json({ error: "not_found" }, 404);
  try { normalizeHash(HASH_PREFIX + payload); }
  catch (_) { return json({ error: "stored_link_invalid" }, 410); }
  return new Response(null, {
    status: 302,
    headers: securityHeaders({ "Location": APP_URL + HASH_PREFIX + payload, "Cache-Control": "public, max-age=300" })
  });
}

async function handleRequest(request, env = {}) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS" && url.pathname === "/api/links") {
    const origin = request.headers.get("Origin"), cors = corsHeaders(origin);
    return new Response(null, { status: allowedOrigin(origin) ? 204 : 403, headers: securityHeaders(cors) });
  }
  if (url.pathname === "/api/links") {
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { "Allow": "POST, OPTIONS", ...corsHeaders(request.headers.get("Origin")) });
    return createLink(request, env);
  }
  if (url.pathname === "/") {
    if (!new Set(["GET", "HEAD"]).has(request.method)) return json({ error: "method_not_allowed" }, 405, { "Allow": "GET, HEAD" });
    return json({ service: "Optics Bench short links", status: "ok" });
  }
  if (!new Set(["GET", "HEAD"]).has(request.method)) return json({ error: "method_not_allowed" }, 405, { "Allow": "GET, HEAD" });
  const parts = url.pathname.split("/").filter(Boolean);
  return parts.length === 1 ? redirectLink(request, env, parts[0]) : json({ error: "not_found" }, 404);
}

export { APP_URL, HASH_PREFIX, MAX_HASH_CHARS, KEY_PREFIX, allowedOrigin, normalizeHash, digestSlug, storeLink, handleRequest };
export default { fetch: handleRequest };
