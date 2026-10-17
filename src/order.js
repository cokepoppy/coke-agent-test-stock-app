export const security = {
  market: 'BSE',
  orderType: 'block-trade',
  hasDailyPriceLimit: false,
  dailyAverage: 18.36,
  highestExecuted: 19.12,
  lowestExecuted: 17.90,
};

export function allowedPriceRange(quote) {
  return {
    lower: quote.dailyAverage * 0.7,
    upper: quote.dailyAverage * 1.3,
  };
}

export function validateOrderPrice(price, quote = security) {
  const range = allowedPriceRange(quote);
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
    notice.textContent = result.valid ? '委托信息校验通过，请核对后继续。' : '委托价格超出允许范围，请调整后重试。';
  });
}
