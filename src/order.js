export const security = {
  market: 'BSE',
  orderType: 'block-trade',
  hasDailyPriceLimit: false,
  ruleEffectiveFrom: '2026-10-26',
  tradeDate: '2026-10-26',
  dailyAverage: 18.36,
  highestExecuted: 19.12,
  lowestExecuted: 17.90,
};

export function allowedPriceRange(quote) {
  if (quote.market !== 'BSE' || quote.orderType !== 'block-trade' || quote.hasDailyPriceLimit) return null;
  const averageCents = Math.round(Number(quote.dailyAverage) * 100);
  const highCents = Math.round(Number(quote.highestExecuted) * 100);
  const lowCents = Math.round(Number(quote.lowestExecuted) * 100);
  if (![averageCents, highCents, lowCents].every(Number.isFinite)) throw new TypeError('BSE block-trade quote is incomplete');
  return {
    lower: Math.max(Math.ceil(averageCents * 70 / 100), lowCents) / 100,
    upper: Math.min(Math.floor(averageCents * 130 / 100), highCents) / 100,
  };
}

export function validateOrderPrice(price, quote = security) {
  const range = allowedPriceRange(quote);
  if (!range) return { valid: true, code: 'NOT_APPLICABLE', range: null };
  if (!Number.isFinite(price) || price < range.lower || price > range.upper) {
    return { valid: false, code: 'PRICE_OUT_OF_RANGE', range };
  }
  return { valid: true, code: 'OK', range };
}

if (typeof document !== 'undefined') {
  const priceInput = document.querySelector('#price');
  const quantityInput = document.querySelector('#quantity');
  const amount = document.querySelector('#amount');
  const notice = document.querySelector('#notice');
  const submit = document.querySelector('#submit');
  const updateAmount = () => {
    const total = Number(priceInput.value) * Number(quantityInput.value);
    amount.textContent = Number.isFinite(total) ? `¥${total.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
  };
  priceInput.addEventListener('input', updateAmount);
  quantityInput.addEventListener('input', updateAmount);
  submit.addEventListener('click', () => {
    const result = validateOrderPrice(Number(priceInput.value));
    notice.className = `notice ${result.valid ? 'ok' : 'error'}`;
    notice.textContent = result.valid ? '委托信息校验通过，请核对后继续。' : `委托价格超出允许范围（${result.range.lower.toFixed(2)}–${result.range.upper.toFixed(2)} 元），请调整后重试。`;
  });
}
