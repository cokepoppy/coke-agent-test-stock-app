# BSE block-trade price range

## Rule and effective date

The Beijing Stock Exchange Trading Rules, Article 3.6.1, allow block trades for a single stock order of at least 100,000 shares **or** at least CNY 1,000,000. The threshold is inclusive and the two paths are alternatives.

The Beijing Stock Exchange notice 北证公告〔2026〕43号 states that the revised provisions in Trading Rule 3.6.5(2) and (3) for block trades in stocks without daily price limits take effect on 2026-10-26. The revised reference is the live average price of that day's auction trades. The valid band is the intersection of the 70%/130% average-price band and the observed low/high executed prices:

- upper bound: the lower of 130% of the live average and the highest executed price;
- lower bound: the higher of 70% of the live average and the lowest executed price.

This change is limited to BSE block trades in no-price-limit securities. It does not define the price band for other exchanges, order types, or securities that have daily price limits.

Primary sources:

- [Implementation notice 北证公告〔2026〕43号](https://www.bse.cn/jygl_list/200029608.html)
- [Revised BSE Trading Rules 北证公告〔2026〕17号](https://www.bse.cn/jygl_list/200028217.html)

## Validation behavior

Prices are entered in 0.01 CNY ticks. The calculated lower threshold rounds up to the next tick, and the upper threshold rounds down, so accepted prices never exceed the exact rule band. For the bundled case (average 18.36, high 19.12, low 17.90), the accepted range is 17.90–19.12. The order form accepts a block trade only when the price is in range, the share quantity is a positive integer, and either the share or amount minimum is reached.

## Scenario provenance

The application shell, security identifier, market observations, account, and order are synthetic fixtures created for an internal software workflow rehearsal. They are not a real brokerage account, live quote, or exchange submission. This provenance belongs in repository and task documentation; the product-style UI stays free of rehearsal labels.
