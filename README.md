# Coke Agent Stock App

A small mobile-first securities order workflow used for validating exchange-specific order-price and block-trade minimum checks.

## Scope

The initial product scenario covers Beijing Stock Exchange block trades for securities without daily price limits. It applies both the daily-average and executed-price price boundaries, plus the alternative minimum-share or minimum-amount eligibility checks.

The bundled quote and order records are synthetic fixtures for reproducible testing. They do not represent a real brokerage account, security, order, or market feed.

## Run

Run `npm start`, then open `http://localhost:4178/` in a modern browser. The page only validates local order parameters; it does not connect to a broker or submit securities orders. Automated checks use Node's built-in test runner and do not require package installation.
