import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { startServer } from '../server.mjs';

const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const server = await startServer({ host: '127.0.0.1', port: 0 });
const address = server.address();
assert(address && typeof address === 'object', 'The local trade-page server must bind an ephemeral port');

let browser;
try {
  browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const pageErrors = [];
  const nonGetRequests = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    if (request.method() !== 'GET') nonGetRequests.push(`${request.method()} ${request.url()}`);
  });

  await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: 'load' });
  assert.equal(await page.title(), 'Coke Securities · 交易');
  assert.deepEqual(await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    touch: navigator.maxTouchPoints > 0,
    noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth,
  })), { width: 390, height: 844, touch: true, noHorizontalOverflow: true });

  const thresholdState = page.locator('#threshold-state');
  const notice = page.locator('#notice');
  assert.equal(await thresholdState.getAttribute('data-state'), 'eligible', 'The initial order should meet the amount threshold');
  assert.equal(await page.locator('#amount').textContent(), '¥1,124,400.00');

  await page.getByRole('button', { name: '1 万股' }).click();
  assert.equal(await thresholdState.getAttribute('data-state'), 'ineligible');
  await page.getByRole('button', { name: '校验委托' }).first().click();
  assert.match(await notice.textContent(), /均未达到大宗交易最低门槛/);

  await page.locator('#price').fill('19.13');
  await page.locator('#quantity').fill('100000');
  await page.locator('#validate-order').click();
  assert.match(await notice.textContent(), /委托价格超出有效范围/);

  await page.locator('#price').fill('18.74');
  await page.locator('#validate-order').click();
  assert.match(await notice.textContent(), /委托参数符合规则校验/);
  await page.getByRole('button', { name: '卖出' }).click();
  assert.equal(await page.locator('#sell').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#buy').getAttribute('aria-pressed'), 'false');

  await page.getByRole('button', { name: '撤单' }).click();
  assert.match(await notice.textContent(), /当前没有可撤销委托/);
  assert.equal(await page.locator('#price').inputValue(), '18.74', 'A cancel action must not modify the draft price');
  assert.equal(await page.locator('#quantity').inputValue(), '100000', 'A cancel action must not modify the draft quantity');
  assert.equal(await page.locator('#sell').getAttribute('aria-pressed'), 'true', 'A cancel action must not silently change trade direction');
  assert.deepEqual(pageErrors, [], 'The mobile trade page must not emit browser errors');
  assert.deepEqual(nonGetRequests, [], 'Rule validation must not submit an order to a server');

  await context.close();
  console.log('PASS mobile Chrome trade-page E2E: price range, amount/share thresholds, direction controls, cancel semantics, and no order submission');
} finally {
  await browser?.close().catch(() => undefined);
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
