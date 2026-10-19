export const security = {
  market: 'BSE',
  orderType: 'block-trade',
  hasDailyPriceLimit: false,
  tradeDate: '2026-10-26',
  ruleEffectiveFrom: '2026-10-26',
  lastPrice: 18.74,
  change: 0.38,
  changePercent: 2.07,
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

function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function quoteReadiness(quote, marketDate = quote?.tradeDate) {
  if (!quote) return { valid: false, code: 'QUOTE_UNAVAILABLE' };
  if (quote.market !== 'BSE' || quote.orderType !== 'block-trade' || quote.hasDailyPriceLimit) {
    return { valid: true, code: 'NOT_APPLICABLE' };
  }
  if (!isDate(marketDate) || !isDate(quote.tradeDate)) return { valid: false, code: 'QUOTE_UNAVAILABLE' };
  if (quote.tradeDate !== marketDate) return { valid: false, code: 'STALE_QUOTE' };
  if (!isDate(quote.ruleEffectiveFrom)) return { valid: false, code: 'QUOTE_UNAVAILABLE' };
  const averageCents = cents(quote.dailyAverage);
  const highCents = cents(quote.highestExecuted);
  const lowCents = cents(quote.lowestExecuted);
  if ([averageCents, highCents, lowCents].some(value => value === null)
    || lowCents > averageCents || averageCents > highCents) {
    return { valid: false, code: 'QUOTE_UNAVAILABLE' };
  }
  if (marketDate < quote.ruleEffectiveFrom) return { valid: false, code: 'RULE_NOT_EFFECTIVE' };
  return { valid: true, code: 'OK' };
}

export function allowedPriceRange(quote, marketDate = quote?.tradeDate) {
  if (!quote || quote.market !== 'BSE' || quote.orderType !== 'block-trade' || quote.hasDailyPriceLimit) return null;
  if (!quoteReadiness(quote, marketDate).valid) return null;
  const averageCents = cents(quote.dailyAverage);
  const highCents = cents(quote.highestExecuted);
  const lowCents = cents(quote.lowestExecuted);
  return {
    lower: Math.max(Math.ceil(averageCents * 70 / 100), lowCents) / 100,
    upper: Math.min(Math.floor(averageCents * 130 / 100), highCents) / 100,
  };
}

export function validateOrderPrice(price, quote = security, marketDate = quote?.tradeDate) {
  if (!quote) return { valid: false, code: 'QUOTE_UNAVAILABLE', range: null };
  if (quote.market !== 'BSE' || quote.orderType !== 'block-trade' || quote.hasDailyPriceLimit) {
    return { valid: true, code: 'NOT_APPLICABLE', range: null };
  }
  const readiness = quoteReadiness(quote, marketDate);
  if (!readiness.valid) return { valid: false, code: readiness.code, range: null };
  const range = allowedPriceRange(quote, marketDate);
  if (!range) return { valid: true, code: 'NOT_APPLICABLE', range: null };
  const priceCents = cents(price);
  if (priceCents === null) return { valid: false, code: 'INVALID_PRICE', range };
  if (priceCents < Math.round(range.lower * 100) || priceCents > Math.round(range.upper * 100)) {
    return { valid: false, code: 'PRICE_OUT_OF_RANGE', range };
  }
  return { valid: true, code: 'OK', range };
}

export function validateBlockTrade(price, quantity, quote = security, marketDate = quote?.tradeDate) {
  const priceResult = validateOrderPrice(price, quote, marketDate);
  if (priceResult.code === 'NOT_APPLICABLE') {
    return { valid: true, code: 'NOT_APPLICABLE', range: null, amountCents: null, sharesEligible: true, amountEligible: true };
  }
  if (['QUOTE_UNAVAILABLE', 'STALE_QUOTE', 'RULE_NOT_EFFECTIVE'].includes(priceResult.code)) {
    return {
      ...priceResult,
      amountCents: null,
      quantityValid: false,
      sharesEligible: false,
      amountEligible: false,
      thresholdEligible: false,
    };
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
  const quoteDate = document.querySelector('#quote-date');
  const quoteStatus = document.querySelector('#quote-status');
  const quoteLast = document.querySelector('#last-price');
  const quoteChange = document.querySelector('#price-change');
  const quoteAverage = document.querySelector('#quote-average');
  const quoteHigh = document.querySelector('#quote-high');
  const quoteLow = document.querySelector('#quote-low');
  const validateButtons = [document.querySelector('#validate-order'), document.querySelector('#bottom-validate')];
  let currentQuote = null;
  let marketDate = null;

  const money = amountCents => amountCents === null
    ? '—'
    : `¥${(amountCents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const priceText = value => Number.isFinite(value) ? value.toFixed(2) : '—';

  const update = () => {
    const result = validateBlockTrade(priceInput.value, quantityInput.value, currentQuote, marketDate);
    amount.textContent = money(result.amountCents);
    lower.textContent = result.range ? result.range.lower.toFixed(2) : '—';
    upper.textContent = result.range ? result.range.upper.toFixed(2) : '—';
    threshold.dataset.state = result.thresholdEligible ? 'eligible' : ['QUOTE_UNAVAILABLE', 'STALE_QUOTE', 'RULE_NOT_EFFECTIVE'].includes(result.code) ? 'unknown' : 'ineligible';
    if (result.code === 'QUOTE_UNAVAILABLE') {
      thresholdCopy.textContent = '行情数据缺失或无当日成交，暂不能校验委托。';
    } else if (result.code === 'STALE_QUOTE') {
      thresholdCopy.textContent = '行情日期与当前交易日不一致，已阻止使用旧行情。';
    } else if (result.code === 'RULE_NOT_EFFECTIVE') {
      thresholdCopy.textContent = `该价格规则将于 ${currentQuote.ruleEffectiveFrom} 生效，当前日期无法按新规校验。`;
    } else if (!result.quantityValid) {
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
    if (result.code === 'QUOTE_UNAVAILABLE') {
      notice.textContent = '当前无有效行情或当日尚无成交，买入和卖出均不能进行规则校验。';
    } else if (result.code === 'STALE_QUOTE') {
      notice.textContent = `行情日期（${currentQuote.tradeDate}）与当前交易日（${marketDate}）不一致，已阻止校验。请刷新当日行情。`;
    } else if (result.code === 'RULE_NOT_EFFECTIVE') {
      notice.textContent = `北交所该项价格规则自 ${currentQuote.ruleEffectiveFrom} 起实施，当前日期无法按新规校验。`;
    } else if (result.code === 'PRICE_OUT_OF_RANGE') {
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

  const renderQuote = payload => {
    marketDate = payload?.marketDate ?? null;
    currentQuote = payload?.quote ?? null;
    quoteDate.textContent = currentQuote?.tradeDate ?? '—';
    quoteLast.textContent = priceText(currentQuote?.lastPrice);
    quoteChange.textContent = currentQuote && Number.isFinite(currentQuote.change) && Number.isFinite(currentQuote.changePercent)
      ? `${currentQuote.change >= 0 ? '+' : ''}${currentQuote.change.toFixed(2)}　${currentQuote.changePercent >= 0 ? '+' : ''}${currentQuote.changePercent.toFixed(2)}%`
      : '行情暂不可用';
    quoteAverage.textContent = priceText(currentQuote?.dailyAverage);
    quoteHigh.textContent = priceText(currentQuote?.highestExecuted);
    quoteLow.textContent = priceText(currentQuote?.lowestExecuted);
    if (currentQuote) {
      priceInput.value = Number.isFinite(currentQuote.lastPrice) ? currentQuote.lastPrice.toFixed(2) : '';
      const readiness = quoteReadiness(currentQuote, marketDate);
      quoteStatus.textContent = readiness.code === 'OK' ? '行情可用'
        : readiness.code === 'STALE_QUOTE' ? '行情日期不匹配'
          : readiness.code === 'RULE_NOT_EFFECTIVE' ? '新规尚未生效'
            : '行情需核验';
    } else {
      priceInput.value = '';
      quoteStatus.textContent = '行情暂不可用';
    }
    update();
  };

  const loadQuote = async () => {
    try {
      const response = await fetch('/api/quote', { cache: 'no-store' });
      if (!response.ok) throw new Error(`行情请求失败 (${response.status})`);
      renderQuote(await response.json());
    } catch {
      renderQuote(null);
      quoteStatus.textContent = '行情请求失败';
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
  void loadQuote();
}
