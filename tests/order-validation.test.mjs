import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedPriceRange, validateOrderPrice } from '../src/order.js';

const quote = { market: 'BSE', orderType: 'block-trade', hasDailyPriceLimit: false, dailyAverage: 18.36, highestExecuted: 19.12, lowestExecuted: 17.90 };

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
