import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.mjs';

test('mobile app server serves the page and rule module and rejects methods and path traversal', async t => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const page = await fetch(baseUrl);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.match(await page.text(), /大宗交易委托/);

  const moduleResponse = await fetch(`${baseUrl}/src/order.js`);
  assert.equal(moduleResponse.status, 200);
  assert.match(moduleResponse.headers.get('content-type'), /javascript/);
  assert.match(await moduleResponse.text(), /validateBlockTrade/);

  assert.equal((await fetch(`${baseUrl}/healthz`)).status, 200);
  assert.equal((await fetch(`${baseUrl}/missing.js`)).status, 404);
  assert.equal((await fetch(baseUrl, { method: 'POST' })).status, 405);
  assert.notEqual((await fetch(`${baseUrl}/%2e%2e%2fpackage.json`)).status, 200);
});
