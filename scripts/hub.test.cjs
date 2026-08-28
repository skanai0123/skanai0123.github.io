const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

const html = readFileSync(join(__dirname, '../index.html'), 'utf8');
const body = html.match(/<body\b[^>]*>/)[0];
const pageMetadata = {
  pageVersion: body.match(/data-page-version="([^"]+)"/)?.[1],
  pageUpdated: body.match(/data-page-updated="([^"]+)"/)?.[1]
};

function loadMetadata(dataset, fetch) {
  const initial = html.match(/let hubVersionText = (.+);/)[1];
  const block = html.slice(html.indexOf('      function normalizeDate(value)'),
    html.indexOf("      const agingToggleBtn = document.getElementById('agingToggleBtn');"));
  // Execute the page's real metadata handling without the unrelated star simulation.
  return new Function('document', 'fetch', `
    let hubVersionText = ${initial};
    const hudCopyrightEl = { title: '' };
    function updateUniverseHud() {}
    ${block.replace('Promise.all([', 'const ready = Promise.all([')}
    return { ready, state: () => ({ version: hubVersionText, title: hudCopyrightEl.title }) };
  `)({ body: { dataset } }, fetch);
}

const github = async url => ({
  ok: true,
  json: async () => url.includes('/tags?') ? [{ name: '9.8.7' }] :
    [{ commit: { committer: { date: '2030-01-02T12:00:00Z' } } }]
});

test('Hub exposes one Oil Timer bookmark pointing directly to the existing lab', () => {
  const nav = html.match(/<nav\b[^>]*aria-label="Bookmarks"[^>]*>([\s\S]*?)<\/nav>/)[1];
  const links = [...nav.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>\s*Oil Timer\s*<\/a>/g)];
  assert.equal(links.length, 1);
  const url = new URL(links[0][1], 'https://skanai0123.github.io/');
  assert.equal(url.href, 'https://skanai0123.github.io/oil-timer-lab/');
  assert.ok(existsSync(join(__dirname, '..', url.pathname, 'index.html')));
});

test('Hub exposes the optical bench from local and hosted bookmarks', () => {
  const nav = html.match(/<nav\b[^>]*aria-label="Bookmarks"[^>]*>([\s\S]*?)<\/nav>/)[1];
  const links = [...nav.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>\s*Optics Bench\s*<\/a>/g)];
  assert.equal(links.length, 1);
  for (const origin of ['https://skanai0123.github.io/', 'http://127.0.0.1:8877/']) {
    const target = new URL(links[0][1], origin);
    assert.equal(target.pathname, '/optics-bench/');
    assert.equal(target.origin, new URL(origin).origin);
    assert.ok(existsSync(join(__dirname, '..', target.pathname, 'index.html')));
  }
});

test('Hub page version and date appear immediately and cannot be overwritten by repository metadata', async () => {
  assert.ok(pageMetadata.pageVersion && pageMetadata.pageUpdated);
  const state = loadMetadata(pageMetadata, github);
  const expected = { version: pageMetadata.pageVersion, title: 'Updated: ' + pageMetadata.pageUpdated };
  assert.deepEqual(state.state(), expected);
  await state.ready;
  assert.deepEqual(state.state(), expected);
});

test('Hub retains page metadata when GitHub is unavailable', async () => {
  const state = loadMetadata(pageMetadata, async () => { throw new Error('offline'); });
  await state.ready;
  assert.deepEqual(state.state(), { version: pageMetadata.pageVersion, title: 'Updated: ' + pageMetadata.pageUpdated });
});

test('Hub keeps the existing GitHub fallback when page metadata is absent', async () => {
  const state = loadMetadata({}, github);
  await state.ready;
  assert.deepEqual(state.state(), { version: '9.8.7', title: 'Updated: 2030-01-02' });
  const offline = loadMetadata({}, async () => { throw new Error('offline'); });
  await offline.ready;
  assert.deepEqual(offline.state(), { version: '0.0.0', title: '' });
});
