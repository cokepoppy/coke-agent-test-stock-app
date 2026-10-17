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
