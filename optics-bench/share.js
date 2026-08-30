(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./state.js'));
  else root.OpticsShare = factory(root.OpticsState);
})(typeof window === 'undefined' ? this : window, function (S) {
  'use strict';
  // ob1 = UTF-8 scene JSON, one gzip member, unpadded base64url.
  const PREFIX = '#ob1=', MAX_HASH_CHARS = 65536;
  const PUBLIC_URL = 'https://skanai0123.github.io/optics-bench/';
  const SHORT_LINK_API = 'https://optics-bench-links.shun-kanai-a7.workers.dev/api/links';
  const fail = message => { throw new Error(message); };
  function base64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 4096) binary += String.fromCharCode(...bytes.subarray(i, i + 4096));
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  async function transform(bytes, decompress) {
    const Codec = decompress ? globalThis.DecompressionStream : globalThis.CompressionStream;
    if (typeof Codec !== 'function') fail('このブラウザーは圧縮リンクに未対応です。対応する新しいブラウザーを使用してください。');
    const limit = decompress ? S.MAX_BYTES : Math.floor((MAX_HASH_CHARS - PREFIX.length) * 3 / 4);
    // Small input chunks bound decompressor overshoot before checking output size.
    let offset = 0;
    const source = new ReadableStream({ pull(controller) {
      if (offset === bytes.length) { controller.close(); return; }
      const end = Math.min(offset + 512, bytes.length);
      controller.enqueue(bytes.subarray(offset, end)); offset = end;
    } });
    const reader = source.pipeThrough(new Codec('gzip')).getReader(), chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > limit) fail(decompress ? '展開した共有データが256 KiBを超えています。' : '共有リンクが長すぎます。部品や名前を減らすかJSON保存を使用してください。');
        chunks.push(value);
      }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    finally { reader.releaseLock(); }
    const output = new Uint8Array(size); let position = 0;
    for (const chunk of chunks) { output.set(chunk, position); position += chunk.byteLength; }
    return output;
  }
  async function encode(scene) {
    // Snapshot before the first await. Keep full precision and the existing schema.
    const json = JSON.stringify(JSON.parse(S.serialize(scene)));
    const bytes = await transform(new TextEncoder().encode(json), false);
    return PREFIX + base64(bytes);
  }
  function isShareHash(hash) { return typeof hash === 'string' && /^#ob\d*(?:=|$)/.test(hash); }
  async function decode(hash) {
    if (!isShareHash(hash)) return null;
    if (hash.length > MAX_HASH_CHARS) fail('共有リンクが長すぎます（上限65,536文字）。');
    if (!hash.startsWith(PREFIX)) fail('未対応の共有リンク形式です。新しい版のOptics Benchで開いてください。');
    const payload = hash.slice(PREFIX.length);
    if (!/^[A-Za-z0-9_-]+$/.test(payload) || payload.length % 4 === 1) fail('共有リンクが欠けているか、書式が不正です。');
    let bytes;
    try {
      const binary = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
      bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
      if (base64(bytes) !== payload) fail('非正規のbase64url');
    } catch (_) { fail('共有リンクの文字列が不正です。URL全体をコピーしてください。'); }
    let json;
    try { json = new TextDecoder('utf-8', { fatal: true }).decode(await transform(bytes, true)); }
    catch (error) {
      if (/256 KiB|未対応/.test(error.message)) throw error;
      fail('共有リンクが壊れているか、途中で切れています。URL全体をコピーしてください。');
    }
    // The same allowlist, types, ranges and link validation as file import.
    return S.parse(json);
  }
  function target(href) {
    const current = new URL(href), local = current.protocol === 'file:' ||
      /^(localhost|.*\.localhost|127(?:\.\d+){3}|0\.0\.0\.0|\[::1\])$/i.test(current.hostname);
    if (!local && !['http:', 'https:'].includes(current.protocol)) fail('このURLからは共有リンクを作れません。');
    current.hash = ''; current.search = '';
    return { url: local ? PUBLIC_URL : current.href, local };
  }
  async function shorten(hash, request = globalThis.fetch) {
    if (typeof hash !== 'string' || !hash.startsWith(PREFIX) || hash.length > MAX_HASH_CHARS) fail('短縮する共有データが不正です。');
    if (typeof request !== 'function') fail('短縮URLサービスへ接続できません。');
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 10000) : null;
    let response, data;
    try {
      response = await request(SHORT_LINK_API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hash }),
        ...(controller ? { signal: controller.signal } : {})
      });
      data = await response.json();
    } catch (_) { fail('短縮URLサービスへ接続できません。'); }
    finally { if (timer !== null) clearTimeout(timer); }
    if (!response.ok) {
      if (response.status === 429) fail('短縮URLの作成回数が上限に達しました。1分ほど待ってください。');
      if (response.status === 400 || response.status === 413) fail('この設計データは短縮URLにできません。');
      fail('短縮URLサービスが一時的に利用できません。');
    }
    let url;
    try { url = new URL(data?.url); }
    catch (_) { fail('短縮URLサービスから不正な応答が返りました。'); }
    const service = new URL(SHORT_LINK_API);
    if (url.origin !== service.origin || url.search || url.hash || !/^\/[A-Za-z0-9_-]{12,43}$/.test(url.pathname)) {
      fail('短縮URLサービスから不正な応答が返りました。');
    }
    return url.href;
  }
  return Object.freeze({ PREFIX, MAX_HASH_CHARS, PUBLIC_URL, SHORT_LINK_API, encode, decode, isShareHash, target, shorten });
});
