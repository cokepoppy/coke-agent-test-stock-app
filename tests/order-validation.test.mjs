import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedPriceRange, quoteReadiness, validateBlockTrade, validateOrderPrice } from '../src/order.js';

const quote = { market: 'BSE', orderType: 'block-trade', hasDailyPriceLimit: false, tradeDate: '2026-10-26', ruleEffectiveFrom: '2026-10-26', dailyAverage: 18.36, highestExecuted: 19.12, lowestExecuted: 17.90 };

test('unlimited-price BSE block-trade range is bounded by both average and execution extremes', () => {
  assert.deepEqual(allowedPriceRange(quote), { lower: 17.90, upper: 19.12 });
  assert.equal(validateOrderPrice(19.50, quote).valid, false);
  assert.equal(validateOrderPrice(19.12, quote).valid, true);
  assert.equal(validateOrderPrice(17.90, quote).valid, true);
  assert.equal(validateOrderPrice(17.50, quote).valid, false);
});

test('the block-trade no-limit rule does not apply to other order types', () => {
  const other = { ...quote, orderType: 'limit-order' };
  assert.equal(validateOrderPrice(19.50, other).code, 'NOT_APPLICABLE');
});

test('the average price can be the stricter bound and price ticks round inward', () => {
  const averageBound = { ...quote, highestExecuted: 30, lowestExecuted: 5 };
  assert.deepEqual(allowedPriceRange(averageBound), { lower: 12.86, upper: 23.86 });
  assert.equal(validateOrderPrice(12.85, averageBound).valid, false);
  assert.equal(validateOrderPrice(23.87, averageBound).valid, false);
});

test('the special rule is not applied to price-limited stocks or non-BSE venues', () => {
  assert.equal(validateOrderPrice(19.50, { ...quote, hasDailyPriceLimit: true }).code, 'NOT_APPLICABLE');
  assert.equal(validateOrderPrice(19.50, { ...quote, market: 'SSE' }).code, 'NOT_APPLICABLE');
});

test('BSE block-trade orders satisfy either the 100,000-share or CNY 1,000,000 threshold', () => {
  const amountQualified = validateBlockTrade(18.74, 60_000, quote);
  assert.equal(amountQualified.valid, true);
  assert.equal(amountQualified.sharesEligible, false);
  assert.equal(amountQualified.amountEligible, true);
  assert.equal(amountQualified.amountCents, 112_440_000);

  const sharesQualified = validateBlockTrade(18.74, 100_000, quote);
  assert.equal(sharesQualified.valid, true);
  assert.equal(sharesQualified.sharesEligible, true);
  assert.equal(sharesQualified.amountEligible, true);
});

test('below both BSE block-trade minimum thresholds is rejected', () => {
  const result = validateBlockTrade(18.74, 10_000, quote);
  assert.equal(result.valid, false);
  assert.equal(result.code, 'BELOW_BLOCK_TRADE_MINIMUM');
  assert.equal(result.sharesEligible, false);
  assert.equal(result.amountEligible, false);
});

test('the CNY 1,000,000 threshold is inclusive and a sub-cent price is rejected', () => {
  const exactAmountQuote = { ...quote, dailyAverage: 20, highestExecuted: 20, lowestExecuted: 20 };
  const exactAmount = validateBlockTrade(20, 50_000, exactAmountQuote);
  assert.equal(exactAmount.valid, true);
  assert.equal(exactAmount.amountEligible, true);
  assert.equal(validateBlockTrade(18.741, 100_000, quote).code, 'INVALID_PRICE');
});

test('invalid share counts do not pass the BSE minimum threshold', () => {
  assert.equal(validateBlockTrade(18.74, 0, quote).code, 'INVALID_QUANTITY');
  assert.equal(validateBlockTrade(18.74, 10_000.5, quote).code, 'INVALID_QUANTITY');
});

test('the revised BSE band is unavailable before its effective date and active on the date', () => {
  const beforeEffective = { ...quote, tradeDate: '2026-10-25' };
  assert.equal(quoteReadiness(beforeEffective, '2026-10-25').code, 'RULE_NOT_EFFECTIVE');
  assert.equal(allowedPriceRange(beforeEffective, '2026-10-25'), null);
  assert.equal(validateBlockTrade(18.74, 100_000, beforeEffective, '2026-10-25').code, 'RULE_NOT_EFFECTIVE');
  assert.equal(validateBlockTrade(18.74, 100_000, quote, '2026-10-26').valid, true);
});

test('missing, no-trade, and malformed quotes fail closed without throwing', () => {
  assert.equal(validateBlockTrade(18.74, 100_000, null, '2026-10-26').code, 'QUOTE_UNAVAILABLE');
  assert.equal(validateBlockTrade(18.74, 100_000, { ...quote, highestExecuted: null, lowestExecuted: null }).code, 'QUOTE_UNAVAILABLE');
  assert.equal(validateBlockTrade(18.74, 100_000, { ...quote, lowestExecuted: 19.20 }).code, 'QUOTE_UNAVAILABLE');
});

test('a prior trading day quote is rejected and a refreshed next-day quote recalculates the band', () => {
  assert.equal(validateBlockTrade(18.74, 100_000, quote, '2026-10-27').code, 'STALE_QUOTE');
  const nextDay = { ...quote, tradeDate: '2026-10-27', dailyAverage: 20.00, highestExecuted: 24.00, lowestExecuted: 18.00 };
  assert.deepEqual(allowedPriceRange(nextDay, '2026-10-27'), { lower: 18, upper: 24 });
  assert.equal(validateBlockTrade(17.90, 100_000, nextDay, '2026-10-27').code, 'PRICE_OUT_OF_RANGE');
});
