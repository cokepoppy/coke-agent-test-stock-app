# Coke Agent Stock App

A small mobile-first securities order-entry application used for validating exchange-specific order-price checks.

## Scope

The initial product scenario covers Beijing Stock Exchange block trades for securities without daily price limits. It must apply both the daily-average and executed-price boundaries from the applicable exchange rules.

The bundled quote and order records are synthetic fixtures for reproducible testing. They do not represent a real brokerage account, security, order, or market feed.

## Run

Open `index.html` in a modern browser. Automated checks use Node's built-in test runner and do not require package installation.
