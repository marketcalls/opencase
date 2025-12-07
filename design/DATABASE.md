# OpenCase Database Schema

## Overview

OpenCase uses Cloudflare D1 (SQLite) as its primary database. The schema is designed to support:
- Multi-user authentication
- Multi-broker account management
- Stock basket creation and management
- Investment tracking
- SIP scheduling
- Alerts and notifications
- Historical performance data

## Entity Relationship Diagram

```
+------------+       +------------------+       +------------+
|   users    |------>| broker_accounts  |<------| baskets    |
+------------+       +------------------+       +------------+
      |                     |                        |
      |                     |                        |
      v                     v                        v
+------------+       +------------------+     +---------------+
| app_config |       |   investments    |---->| basket_stocks |
+------------+       +------------------+     +---------------+
                            |
                            v
                     +------------------+
                     |   transactions   |
                     +------------------+
                            |
                     +------+------+
                     |             |
                     v             v
              +----------+  +------------------+
              |   sips   |  | transaction_orders |
              +----------+  +------------------+
                     |
                     v
              +------------------+
              |  sip_executions  |
              +------------------+
```

## Core Tables

### users

Primary user authentication table.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTO | User ID |
| email | TEXT | UNIQUE, NOT NULL | Login email |
| password_hash | TEXT | NOT NULL | Hashed password |
| name | TEXT | NOT NULL | Display name |
| is_admin | INTEGER | DEFAULT 0 | Admin flag (first user = admin) |
| is_active | INTEGER | DEFAULT 1 | Account active status |
| avatar_url | TEXT | | Profile picture URL |
| last_login_at | DATETIME | | Last login timestamp |
| created_at | DATETIME | DEFAULT NOW | Creation timestamp |
| updated_at | DATETIME | DEFAULT NOW | Last update |

**Indexes**: `idx_users_email`

### broker_accounts

Broker account credentials and connection status.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTO | Account ID |
| user_id | INTEGER | FK -> users, NOT NULL | Owner user |
| broker_type | TEXT | NOT NULL | 'zerodha' or 'angelone' |
| account_name | TEXT | NOT NULL | User-friendly name |
| broker_user_id | TEXT | | Broker's user ID |
| client_code | TEXT | | Angel One client code |
| api_key_encrypted | TEXT | | Encrypted API key |
| api_secret_encrypted | TEXT | | Encrypted API secret |
| mpin_encrypted | TEXT | | Angel One MPIN |
| access_token | TEXT | | Current session token |
| refresh_token | TEXT | | Token refresh key |
| feed_token | TEXT | | Angel One feed token |
| token_expiry | DATETIME | | Token expiration |
| is_connected | INTEGER | DEFAULT 0 | Connection status |
| is_active | INTEGER | DEFAULT 1 | Account enabled |
| connection_status | TEXT | DEFAULT 'disconnected' | Status string |
| last_connected_at | DATETIME | | Last successful connection |
| broker_name | TEXT | | Name from broker profile |
| broker_email | TEXT | | Email from broker profile |
| created_at | DATETIME | DEFAULT NOW | |
| updated_at | DATETIME | DEFAULT NOW | |

**Unique**: `(user_id, broker_type, broker_user_id)`

**Indexes**: `idx_ba_user`, `idx_ba_broker`, `idx_ba_connected`

### app_config

Application-wide configuration settings.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTO | Config ID |
| config_key | TEXT | UNIQUE, NOT NULL | Configuration key |
| config_value | TEXT | NOT NULL | Configuration value |
| is_encrypted | INTEGER | DEFAULT 0 | Value encryption flag |
| created_at | DATETIME | DEFAULT NOW | |
| updated_at | DATETIME | DEFAULT NOW | |

**Common Keys**:
- `zerodha_api_key`, `zerodha_api_secret`
- `angelone_api_key`, `angelone_api_secret`
- `default_broker`
- `instruments_last_download`
- `app_initialized`

## Basket Tables

### baskets

User-created stock baskets.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTO | Basket ID |
| user_id | INTEGER | FK -> users | Owner user |
| account_id | INTEGER | FK -> accounts | Legacy field |
| name | TEXT | NOT NULL | Basket name |
| description | TEXT | | Basket description |
| theme | TEXT | | Theme category |
| category | TEXT | | 'custom', 'template', 'shared' |
| is_active | INTEGER | DEFAULT 1 | Basket enabled |
| is_public | INTEGER | DEFAULT 0 | Public sharing |
| is_template | INTEGER | DEFAULT 0 | Pre-built template |
| min_investment | REAL | DEFAULT 0 | Minimum investment required |
| risk_level | TEXT | DEFAULT 'moderate' | 'low', 'moderate', 'high' |
| benchmark_symbol | TEXT | DEFAULT 'NSE:NIFTY 50' | Comparison benchmark |
| tags | TEXT | | JSON array of tags |
| clone_count | INTEGER | DEFAULT 0 | Times cloned |
| created_at | DATETIME | DEFAULT NOW | |
| updated_at | DATETIME | DEFAULT NOW | |

**Indexes**: `idx_baskets_account_id`, `idx_baskets_is_public`, `idx_baskets_is_template`, `idx_baskets_category`

### basket_stocks

Individual stocks within a basket.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTO | Stock entry ID |
| basket_id | INTEGER | FK -> baskets, NOT NULL | Parent basket |
| trading_symbol | TEXT | NOT NULL | Stock symbol |
| exchange | TEXT | DEFAULT 'NSE' | Exchange |
| instrument_token | INTEGER | | Broker token |
| company_name | TEXT | | Full company name |
| sector | TEXT | | Stock sector |
| weight_percentage | REAL | NOT NULL, CHECK (0-100) | Allocation weight |
| created_at | DATETIME | DEFAULT NOW | |

**Unique**: `(basket_id, trading_symbol, exchange)`

**Indexes**: `idx_basket_stocks_basket_id`

## Investment Tables

### investments

User investments in baskets.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTO | Investment ID |
| user_id | INTEGER | FK -> users | Owner user |
| account_id | INTEGER | FK -> accounts | Legacy field |
| basket_id | INTEGER | FK -> baskets, NOT NULL | Invested basket |
| broker_account_id | INTEGER | FK -> broker_accounts | Broker used |
| invested_amount | REAL | NOT NULL | Total invested |
| current_value | REAL | | Current market value |
| units | REAL | DEFAULT 1 | Investment units |
| invested_at | DATETIME | DEFAULT NOW | |
| last_rebalanced_at | DATETIME | | Last rebalance |
| last_synced_at | DATETIME | | Last data sync |
| status | TEXT | DEFAULT 'ACTIVE' | 'ACTIVE', 'SOLD', 'PARTIAL' |

**Indexes**: `idx_investments_account_id`, `idx_investments_basket_id`, `idx_investments_broker`

### investment_holdings

Individual stock holdings per investment.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTO | Holding ID |
| investment_id | INTEGER | FK -> investments, NOT NULL | Parent investment |
| trading_symbol | TEXT | NOT NULL | Stock symbol |
| exchange | TEXT | DEFAULT 'NSE' | Exchange |
| quantity | INTEGER | NOT NULL | Shares held |
| average_price | REAL | NOT NULL | Average cost |
| current_price | REAL | | Market price |
| target_weight | REAL | | Target allocation |
| actual_weight | REAL | | Current allocation |
| pnl | REAL | DEFAULT 0 | Profit/Loss |
| pnl_percentage | REAL | DEFAULT 0 | P&L percentage |
| last_updated | DATETIME | DEFAULT NOW | |

**Indexes**: `idx_investment_holdings_investment_id`

## Transaction Tables

### transactions

Order transaction logs.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTO | Transaction ID |
| user_id | INTEGER | FK -> users | Owner user |
| account_id | INTEGER | FK -> accounts, NOT NULL | Legacy field |
| investment_id | INTEGER | FK -> investments | Related investment |
| basket_id | INTEGER | FK -> baskets, NOT NULL | Related basket |
| broker_account_id | INTEGER | FK -> broker_accounts | Broker used |
| transaction_type | TEXT | NOT NULL | 'BUY', 'SELL', 'REBALANCE', 'SIP' |
| total_amount | REAL | NOT NULL | Transaction value |
| status | TEXT | DEFAULT 'PENDING' | Transaction status |
| kite_order_ids | TEXT | | JSON array of order IDs |
| order_details | TEXT | | JSON order breakdown |
| error_message | TEXT | | Error details |
| created_at | DATETIME | DEFAULT NOW | |
| completed_at | DATETIME | | Completion time |

**Status Values**: 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'PARTIAL'

**Indexes**: `idx_transactions_account_id`, `idx_transactions_basket_id`, `idx_transactions_broker`

### transaction_orders

Individual orders within a transaction.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTO | Order ID |
| transaction_id | INTEGER | FK -> transactions, NOT NULL | Parent transaction |
| trading_symbol | TEXT | NOT NULL | Stock symbol |
| exchange | TEXT | NOT NULL | Exchange |
| order_type | TEXT | NOT NULL | 'BUY', 'SELL' |
| quantity | INTEGER | NOT NULL | Order quantity |
| price | REAL | | Limit price |
| executed_price | REAL | | Fill price |
| kite_order_id | TEXT | | Broker order ID |
| status | TEXT | DEFAULT 'PENDING' | Order status |
| error_message | TEXT | | Error details |
| created_at | DATETIME | DEFAULT NOW | |
| executed_at | DATETIME | | Execution time |

## SIP Tables

### sips

Systematic Investment Plan configurations.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTO | SIP ID |
| user_id | INTEGER | FK -> users | Owner user |
| account_id | INTEGER | FK -> accounts, NOT NULL | Legacy field |
| basket_id | INTEGER | FK -> baskets, NOT NULL | Target basket |
| investment_id | INTEGER | FK -> investments | Linked investment |
| amount | REAL | NOT NULL | SIP amount |
| frequency | TEXT | NOT NULL | 'daily', 'weekly', 'monthly' |
| day_of_week | INTEGER | | 0-6 for weekly |
| day_of_month | INTEGER | | 1-31 for monthly |
| start_date | DATE | NOT NULL | SIP start |
| end_date | DATE | | SIP end (optional) |
| next_execution_date | DATE | | Next scheduled date |
| total_installments | INTEGER | DEFAULT 0 | Total planned |
| completed_installments | INTEGER | DEFAULT 0 | Completed count |
| total_invested | REAL | DEFAULT 0 | Cumulative invested |
| status | TEXT | DEFAULT 'ACTIVE' | SIP status |
| created_at | DATETIME | DEFAULT NOW | |
| updated_at | DATETIME | DEFAULT NOW | |

**Status Values**: 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'

**Indexes**: `idx_sips_account_id`, `idx_sips_next_execution`

### sip_executions

SIP execution history.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTO | Execution ID |
| sip_id | INTEGER | FK -> sips, NOT NULL | Parent SIP |
| transaction_id | INTEGER | FK -> transactions | Resulting transaction |
| scheduled_date | DATE | NOT NULL | Planned date |
| executed_date | DATETIME | | Actual execution |
| amount | REAL | NOT NULL | Invested amount |
| status | TEXT | DEFAULT 'PENDING' | Execution status |
| error_message | TEXT | | Error details |
| created_at | DATETIME | DEFAULT NOW | |

**Status Values**: 'PENDING', 'COMPLETED', 'FAILED', 'SKIPPED'

## Alert Tables

### alerts

User alert configurations.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTO | Alert ID |
| user_id | INTEGER | FK -> users | Owner user |
| account_id | INTEGER | FK -> accounts, NOT NULL | Legacy field |
| alert_type | TEXT | NOT NULL | Alert category |
| target_type | TEXT | NOT NULL | 'stock', 'basket', 'investment' |
| target_id | INTEGER | | basket_id or investment_id |
| trading_symbol | TEXT | | For stock alerts |
| exchange | TEXT | | Stock exchange |
| condition | TEXT | NOT NULL | Condition type |
| threshold_value | REAL | NOT NULL | Trigger threshold |
| current_value | REAL | | Current value |
| message | TEXT | | Alert message |
| is_active | INTEGER | DEFAULT 1 | Alert enabled |
| is_triggered | INTEGER | DEFAULT 0 | Has triggered |
| last_triggered_at | DATETIME | | Last trigger time |
| notification_channels | TEXT | DEFAULT '["app"]' | JSON channels |
| created_at | DATETIME | DEFAULT NOW | |
| updated_at | DATETIME | DEFAULT NOW | |

**Alert Types**: 'price', 'rebalance', 'pnl', 'sip_reminder'

**Conditions**: 'above', 'below', 'crosses', 'deviation_exceeds'

**Indexes**: `idx_alerts_account_id`, `idx_alerts_is_active`

## Instrument Tables

### master_instruments

Unified instrument master data.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTO | Instrument ID |
| symbol | TEXT | NOT NULL | Unified symbol |
| name | TEXT | | Company name |
| exchange | TEXT | NOT NULL | Exchange |
| instrument_type | TEXT | | 'EQ', 'FUT', etc. |
| segment | TEXT | | Market segment |
| series | TEXT | | Stock series |
| tick_size | REAL | | Price increment |
| lot_size | INTEGER | DEFAULT 1 | Trading lot |
| expiry | TEXT | | F&O expiry |
| strike | REAL | | Option strike |
| last_price | REAL | | Last traded price |
| zerodha_token | INTEGER | | Zerodha token |
| zerodha_exchange_token | INTEGER | | Zerodha exchange token |
| zerodha_trading_symbol | TEXT | | Zerodha symbol format |
| angelone_token | TEXT | | Angel One token |
| angelone_trading_symbol | TEXT | | Angel One symbol format |
| sector | TEXT | | Industry sector |
| industry | TEXT | | Industry sub-category |
| market_cap | TEXT | | 'large', 'mid', 'small' |
| isin | TEXT | | ISIN code |
| source | TEXT | | Data source |
| last_downloaded_from | TEXT | | Last broker source |
| created_at | DATETIME | DEFAULT NOW | |
| updated_at | DATETIME | DEFAULT NOW | |

**Unique**: `(symbol, exchange, instrument_type, expiry, strike)`

**Indexes**: Multiple indexes for symbol, token, and name lookups

## Historical Data Tables

### investment_history

Daily investment value snapshots.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTO | Record ID |
| investment_id | INTEGER | FK -> investments, NOT NULL | Investment |
| recorded_date | DATE | NOT NULL | Snapshot date |
| invested_amount | REAL | NOT NULL | Amount invested |
| current_value | REAL | NOT NULL | Market value |
| day_change | REAL | DEFAULT 0 | Daily change |
| day_change_percentage | REAL | DEFAULT 0 | Daily % change |
| total_pnl | REAL | DEFAULT 0 | Total P&L |
| total_pnl_percentage | REAL | DEFAULT 0 | Total % P&L |
| created_at | DATETIME | DEFAULT NOW | |

**Unique**: `(investment_id, recorded_date)`

### price_history

Historical price data for symbols.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTO | Record ID |
| symbol | TEXT | NOT NULL | Stock symbol |
| exchange | TEXT | NOT NULL | Exchange |
| date | DATE | NOT NULL | Price date |
| open | REAL | | Open price |
| high | REAL | | High price |
| low | REAL | | Low price |
| close | REAL | NOT NULL | Close price |
| volume | INTEGER | | Trading volume |
| created_at | DATETIME | DEFAULT NOW | |

**Unique**: `(symbol, exchange, date)`

## Migration History

| Version | File | Description |
|---------|------|-------------|
| 0001 | initial_schema.sql | Core tables: accounts, baskets, investments, transactions, SIPs, alerts |
| 0002 | master_instruments.sql | Instrument cache table |
| 0003 | unified_symbols.sql | Multi-broker symbol mapping |
| 0004 | user_auth.sql | Separate users from broker accounts |
| 0005 | investment_broker_link.sql | Link investments to broker accounts |

## D1 Considerations

1. **Write Limits**: D1 has write limits; batch operations when possible
2. **JSON Fields**: Use TEXT for JSON storage, parse in application
3. **No ALTER COLUMN**: Must recreate tables to modify columns
4. **Indexes**: Essential for performance on larger datasets
5. **Transactions**: Use transactions for multi-table operations
