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
  context.on('page', currentPage => currentPage.on('pageerror', error => pageErrors.push(error.message)));
  context.on('request', request => {
    if (request.method() !== 'GET') nonGetRequests.push(`${request.method()} ${request.url()}`);
  });

  const baseUrl = `http://127.0.0.1:${address.port}/`;
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
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
  assert.equal(await page.locator('#quote-status').textContent(), '行情可用');
  assert.equal(await page.locator('#quote-date').textContent(), '2026-10-26');
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

  const makeScenarioPage = async payload => {
    const scenarioPage = await context.newPage();
    await scenarioPage.route('**/api/quote', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    }));
    await scenarioPage.goto(baseUrl, { waitUntil: 'networkidle' });
    return scenarioPage;
  };
  const preEffectiveQuote = {
    ...quotePayload('2026-10-25'),
  };
  const preEffectivePage = await makeScenarioPage(preEffectiveQuote);
  await preEffectivePage.locator('#validate-order').click();
  assert.match(await preEffectivePage.locator('#notice').textContent(), /自 2026-10-26 起实施/);
  assert.equal(await preEffectivePage.locator('#notice').getAttribute('class'), 'notice error');

  const staleQuote = { ...quotePayload('2026-10-27'), quote: { ...quotePayload('2026-10-26').quote } };
  const stalePage = await makeScenarioPage(staleQuote);
  for (const side of ['buy', 'sell']) {
    await stalePage.locator(`#${side}`).click();
    await stalePage.locator('#validate-order').click();
    assert.match(await stalePage.locator('#notice').textContent(), /与当前交易日（2026-10-27）不一致/);
    assert.equal(await stalePage.locator('#notice').getAttribute('class'), 'notice error');
  }

  const emptyQuotePage = await makeScenarioPage({ marketDate: '2026-10-27', quote: null });
  for (const side of ['buy', 'sell']) {
    await emptyQuotePage.locator(`#${side}`).click();
    await emptyQuotePage.locator('#validate-order').click();
    assert.match(await emptyQuotePage.locator('#notice').textContent(), /当前无有效行情或当日尚无成交/);
    assert.equal(await emptyQuotePage.locator('#notice').getAttribute('class'), 'notice error');
  }

  const nextDayQuote = quotePayload('2026-10-27', {
    lastPrice: 21.5,
    dailyAverage: 20,
    highestExecuted: 24,
    lowestExecuted: 18,
  });
  const nextDayPage = await makeScenarioPage(nextDayQuote);
  assert.equal(await nextDayPage.locator('#quote-date').textContent(), '2026-10-27');
  assert.equal(await nextDayPage.locator('#quote-average').textContent(), '20.00');
  assert.equal(await nextDayPage.locator('#lower').textContent(), '18.00');
  assert.equal(await nextDayPage.locator('#upper').textContent(), '24.00');
  await nextDayPage.locator('#price').fill('21.00');
  await nextDayPage.locator('#quantity').fill('100000');
  await nextDayPage.locator('#validate-order').click();
  assert.match(await nextDayPage.locator('#notice').textContent(), /委托参数符合规则校验/);

  assert.deepEqual(pageErrors, [], 'The mobile trade page must not emit browser errors');
  assert.deepEqual(nonGetRequests, [], 'Rule validation must not submit an order to a server');

  await preEffectivePage.close();
  await stalePage.close();
  await emptyQuotePage.close();
  await nextDayPage.close();
  await context.close();
  console.log('PASS mobile Chrome trade-page E2E: thresholds, effective date, missing/stale quotes, next-day refresh, buy/sell fail-closed behavior, and no order submission');
} finally {
  await browser?.close().catch(() => undefined);
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

function quotePayload(tradeDate, fields = {}) {
  const quote = {
    market: 'BSE',
    orderType: 'block-trade',
    hasDailyPriceLimit: false,
    tradeDate,
    ruleEffectiveFrom: '2026-10-26',
    lastPrice: 18.74,
    change: 0.38,
    changePercent: 2.07,
    dailyAverage: 18.36,
    highestExecuted: 19.12,
    lowestExecuted: 17.9,
    minimumShares: 100_000,
    minimumAmountCents: 100_000_000,
    ...fields,
  };
  return { marketDate: tradeDate, quote };
}
