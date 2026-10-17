export const security = {
  market: 'BSE',
  orderType: 'block-trade',
  hasDailyPriceLimit: false,
  ruleEffectiveFrom: '2026-10-26',
  dailyAverage: 18.36,
  highestExecuted: 19.12,
  lowestExecuted: 17.90,
  minimumShares: 100_000,
  minimumAmountCents: 100_000_000,
};

function cents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const scaled = amount * 100;
  const rounded = Math.round(scaled);
  return Math.abs(scaled - rounded) <= 1e-7 ? rounded : null;
}

export function allowedPriceRange(quote) {
  if (quote.market !== 'BSE' || quote.orderType !== 'block-trade' || quote.hasDailyPriceLimit) return null;
  const averageCents = cents(quote.dailyAverage);
  const highCents = cents(quote.highestExecuted);
  const lowCents = cents(quote.lowestExecuted);
  if ([averageCents, highCents, lowCents].some(value => value === null)) {
    throw new TypeError('BSE block-trade quote is incomplete');
  }
  return {
    lower: Math.max(Math.ceil(averageCents * 70 / 100), lowCents) / 100,
    upper: Math.min(Math.floor(averageCents * 130 / 100), highCents) / 100,
  };
}

export function validateOrderPrice(price, quote = security) {
  const range = allowedPriceRange(quote);
  if (!range) return { valid: true, code: 'NOT_APPLICABLE', range: null };
  const priceCents = cents(price);
  if (priceCents === null) return { valid: false, code: 'INVALID_PRICE', range };
  if (priceCents < Math.round(range.lower * 100) || priceCents > Math.round(range.upper * 100)) {
    return { valid: false, code: 'PRICE_OUT_OF_RANGE', range };
  }
  return { valid: true, code: 'OK', range };
}

export function validateBlockTrade(price, quantity, quote = security) {
  const priceResult = validateOrderPrice(price, quote);
  if (priceResult.code === 'NOT_APPLICABLE') {
    return { valid: true, code: 'NOT_APPLICABLE', range: null, amountCents: null, sharesEligible: true, amountEligible: true };
  }

  const quantityNumber = Number(quantity);
  const quantityValid = Number.isSafeInteger(quantityNumber) && quantityNumber > 0;
  const priceCents = cents(price);
  const amountCents = quantityValid && priceCents !== null ? priceCents * quantityNumber : null;
  const sharesEligible = quantityValid && quantityNumber >= (quote.minimumShares ?? 100_000);
  const amountEligible = amountCents !== null && amountCents >= (quote.minimumAmountCents ?? 100_000_000);
  const thresholdEligible = sharesEligible || amountEligible;

  if (!priceResult.valid) {
    return { ...priceResult, quantityValid, amountCents, sharesEligible, amountEligible, thresholdEligible };
  }
  if (!quantityValid) {
    return { valid: false, code: 'INVALID_QUANTITY', range: priceResult.range, quantityValid, amountCents, sharesEligible, amountEligible, thresholdEligible: false };
  }
  if (!thresholdEligible) {
    return { valid: false, code: 'BELOW_BLOCK_TRADE_MINIMUM', range: priceResult.range, quantityValid, amountCents, sharesEligible, amountEligible, thresholdEligible: false };
  }
  return { valid: true, code: 'OK', range: priceResult.range, quantityValid, amountCents, sharesEligible, amountEligible, thresholdEligible: true };
}

if (typeof document !== 'undefined') {
  const priceInput = document.querySelector('#price');
  const quantityInput = document.querySelector('#quantity');
  const amount = document.querySelector('#amount');
  const notice = document.querySelector('#notice');
  const threshold = document.querySelector('#threshold-state');
  const thresholdCopy = document.querySelector('#threshold-copy');
  const lower = document.querySelector('#lower');
  const upper = document.querySelector('#upper');
  const validateButtons = [document.querySelector('#validate-order'), document.querySelector('#bottom-validate')];

  const money = amountCents => amountCents === null
    ? '—'
    : `¥${(amountCents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const update = () => {
    const result = validateBlockTrade(priceInput.value, quantityInput.value);
    amount.textContent = money(result.amountCents);
    if (result.range) {
      lower.textContent = result.range.lower.toFixed(2);
      upper.textContent = result.range.upper.toFixed(2);
    }
    threshold.dataset.state = result.thresholdEligible ? 'eligible' : 'ineligible';
    if (!result.quantityValid) {
      thresholdCopy.textContent = '请输入大于 0 的整数股数。';
    } else if (result.thresholdEligible) {
      thresholdCopy.textContent = result.sharesEligible
        ? '满足大宗交易门槛：申报数量不少于 10 万股。'
        : '满足大宗交易门槛：预计金额不少于 100 万元。';
    } else {
      thresholdCopy.textContent = `未达到大宗交易门槛：单笔申报需不少于 10 万股或 100 万元，当前金额 ${money(result.amountCents)}。`;
    }
    return result;
  };

  const showValidation = () => {
    const result = update();
    notice.className = `notice ${result.valid ? 'ok' : 'error'}`;
    if (result.code === 'PRICE_OUT_OF_RANGE') {
      notice.textContent = `委托价格超出有效范围（${result.range.lower.toFixed(2)}–${result.range.upper.toFixed(2)} 元），请调整后重试。`;
    } else if (result.code === 'INVALID_PRICE') {
      notice.textContent = '请输入符合 0.01 元最小变动单位的有效价格。';
    } else if (result.code === 'INVALID_QUANTITY') {
      notice.textContent = '委托数量必须为大于 0 的整数。';
    } else if (result.code === 'BELOW_BLOCK_TRADE_MINIMUM') {
      notice.textContent = '单笔申报数量和预计金额均未达到大宗交易最低门槛。';
    } else {
      notice.textContent = '委托参数符合规则校验。本次仅完成本地校验，未提交至交易系统。';
    }
  };

  priceInput.addEventListener('input', () => { notice.className = 'notice'; update(); });
  quantityInput.addEventListener('input', () => { notice.className = 'notice'; update(); });
  document.querySelectorAll('[data-quantity]').forEach(button => button.addEventListener('click', () => {
    quantityInput.value = button.dataset.quantity;
    notice.className = 'notice';
    update();
  }));
  document.querySelector('#buy').addEventListener('click', event => {
    event.currentTarget.setAttribute('aria-pressed', 'true');
    document.querySelector('#sell').setAttribute('aria-pressed', 'false');
  });
  document.querySelector('#sell').addEventListener('click', event => {
    event.currentTarget.setAttribute('aria-pressed', 'true');
    document.querySelector('#buy').setAttribute('aria-pressed', 'false');
  });
  validateButtons.forEach(button => button.addEventListener('click', showValidation));
  document.querySelector('.cancel').addEventListener('click', () => {
    notice.className = 'notice info';
    notice.textContent = '当前没有可撤销委托。';
  });
  update();
}
