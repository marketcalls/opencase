-- StockBasket Enhanced Schema
-- Self-hostable multi-account stock basket platform

-- ============================================
-- CORE TABLES
-- ============================================

-- App Configuration (stores encrypted API credentials)
CREATE TABLE IF NOT EXISTS app_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    config_key TEXT UNIQUE NOT NULL,
    config_value TEXT NOT NULL,
    is_encrypted INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Accounts table - supports multiple Zerodha accounts (family management)
CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    zerodha_user_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    avatar_url TEXT,
    kite_api_key TEXT,
    kite_api_secret TEXT,
    access_token TEXT,
    refresh_token TEXT,
    access_token_expiry DATETIME,
    is_primary INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    last_login_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Account Groups (family/team grouping)
CREATE TABLE IF NOT EXISTS account_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES accounts(id) ON DELETE SET NULL
);

-- Account Group Members
CREATE TABLE IF NOT EXISTS account_group_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    account_id INTEGER NOT NULL,
    role TEXT DEFAULT 'member', -- 'admin', 'member', 'viewer'
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES account_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    UNIQUE(group_id, account_id)
);

-- ============================================
-- BASKET TABLES
-- ============================================

-- Baskets table - user-created stock baskets
CREATE TABLE IF NOT EXISTS baskets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    theme TEXT,
    category TEXT, -- 'custom', 'template', 'shared'
    is_active INTEGER DEFAULT 1,
    is_public INTEGER DEFAULT 0, -- For basket sharing
    is_template INTEGER DEFAULT 0, -- Pre-built template
    min_investment REAL DEFAULT 0,
    risk_level TEXT DEFAULT 'moderate', -- 'low', 'moderate', 'high'
    benchmark_symbol TEXT DEFAULT 'NSE:NIFTY 50', -- For comparison
    tags TEXT, -- JSON array of tags
    clone_count INTEGER DEFAULT 0, -- Times this basket was cloned
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- Basket stocks table - stocks in each basket with weights
CREATE TABLE IF NOT EXISTS basket_stocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    basket_id INTEGER NOT NULL,
    trading_symbol TEXT NOT NULL,
    exchange TEXT NOT NULL DEFAULT 'NSE',
    instrument_token INTEGER,
    company_name TEXT,
    sector TEXT,
    weight_percentage REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (basket_id) REFERENCES baskets(id) ON DELETE CASCADE,
    CONSTRAINT weight_check CHECK (weight_percentage > 0 AND weight_percentage <= 100),
    UNIQUE(basket_id, trading_symbol, exchange)
);

-- Basket clones tracking
CREATE TABLE IF NOT EXISTS basket_clones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_basket_id INTEGER NOT NULL,
    cloned_basket_id INTEGER NOT NULL,
    cloned_by INTEGER NOT NULL,
    cloned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (original_basket_id) REFERENCES baskets(id) ON DELETE CASCADE,
    FOREIGN KEY (cloned_basket_id) REFERENCES baskets(id) ON DELETE CASCADE,
    FOREIGN KEY (cloned_by) REFERENCES accounts(id) ON DELETE CASCADE
);

-- ============================================
-- INVESTMENT TABLES
-- ============================================

-- User investments table - tracks basket investments
CREATE TABLE IF NOT EXISTS investments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    basket_id INTEGER NOT NULL,
    invested_amount REAL NOT NULL,
    current_value REAL,
    units REAL DEFAULT 1,
    invested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_rebalanced_at DATETIME,
    last_synced_at DATETIME,
    status TEXT DEFAULT 'ACTIVE', -- 'ACTIVE', 'SOLD', 'PARTIAL'
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    FOREIGN KEY (basket_id) REFERENCES baskets(id) ON DELETE CASCADE
);

-- Investment holdings table - individual stock holdings per investment
CREATE TABLE IF NOT EXISTS investment_holdings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    investment_id INTEGER NOT NULL,
    trading_symbol TEXT NOT NULL,
    exchange TEXT NOT NULL DEFAULT 'NSE',
    quantity INTEGER NOT NULL,
    average_price REAL NOT NULL,
    current_price REAL,
    target_weight REAL,
    actual_weight REAL,
    pnl REAL DEFAULT 0,
    pnl_percentage REAL DEFAULT 0,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (investment_id) REFERENCES investments(id) ON DELETE CASCADE
);

-- ============================================
-- TRANSACTION TABLES
-- ============================================

-- Transactions table - buy/sell/rebalance logs
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    investment_id INTEGER,
    basket_id INTEGER NOT NULL,
    transaction_type TEXT NOT NULL, -- 'BUY', 'SELL', 'REBALANCE', 'SIP'
    total_amount REAL NOT NULL,
    status TEXT DEFAULT 'PENDING', -- 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'PARTIAL'
    kite_order_ids TEXT, -- JSON array of order IDs
    order_details TEXT, -- JSON of order breakdown
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    FOREIGN KEY (investment_id) REFERENCES investments(id) ON DELETE SET NULL,
    FOREIGN KEY (basket_id) REFERENCES baskets(id) ON DELETE CASCADE
);

-- Transaction Orders (individual orders within a transaction)
CREATE TABLE IF NOT EXISTS transaction_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL,
    trading_symbol TEXT NOT NULL,
    exchange TEXT NOT NULL,
    order_type TEXT NOT NULL, -- 'BUY', 'SELL'
    quantity INTEGER NOT NULL,
    price REAL,
    executed_price REAL,
    kite_order_id TEXT,
    status TEXT DEFAULT 'PENDING',
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    executed_at DATETIME,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
);

-- ============================================
-- SIP TABLES
-- ============================================

-- SIP (Systematic Investment Plan) configurations
CREATE TABLE IF NOT EXISTS sips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    basket_id INTEGER NOT NULL,
    investment_id INTEGER, -- Links to existing investment if any
    amount REAL NOT NULL,
    frequency TEXT NOT NULL, -- 'daily', 'weekly', 'monthly'
    day_of_week INTEGER, -- 0-6 for weekly (0=Sunday)
    day_of_month INTEGER, -- 1-31 for monthly
    start_date DATE NOT NULL,
    end_date DATE,
    next_execution_date DATE,
    total_installments INTEGER DEFAULT 0,
    completed_installments INTEGER DEFAULT 0,
    total_invested REAL DEFAULT 0,
    status TEXT DEFAULT 'ACTIVE', -- 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    FOREIGN KEY (basket_id) REFERENCES baskets(id) ON DELETE CASCADE,
    FOREIGN KEY (investment_id) REFERENCES investments(id) ON DELETE SET NULL
);

-- SIP execution history
CREATE TABLE IF NOT EXISTS sip_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sip_id INTEGER NOT NULL,
    transaction_id INTEGER,
    scheduled_date DATE NOT NULL,
    executed_date DATETIME,
    amount REAL NOT NULL,
    status TEXT DEFAULT 'PENDING', -- 'PENDING', 'COMPLETED', 'FAILED', 'SKIPPED'
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sip_id) REFERENCES sips(id) ON DELETE CASCADE,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
);

-- ============================================
-- ALERTS TABLES
-- ============================================

-- Alerts configuration
CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    alert_type TEXT NOT NULL, -- 'price', 'rebalance', 'pnl', 'sip_reminder'
    target_type TEXT NOT NULL, -- 'stock', 'basket', 'investment'
    target_id INTEGER, -- basket_id or investment_id
    trading_symbol TEXT, -- For stock-level alerts
    exchange TEXT,
    condition TEXT NOT NULL, -- 'above', 'below', 'crosses', 'deviation_exceeds'
    threshold_value REAL NOT NULL,
    current_value REAL,
    message TEXT,
    is_active INTEGER DEFAULT 1,
    is_triggered INTEGER DEFAULT 0,
    last_triggered_at DATETIME,
    notification_channels TEXT DEFAULT '["app"]', -- JSON: ['app', 'email', 'sms']
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- Alert notifications sent
CREATE TABLE IF NOT EXISTS alert_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_id INTEGER NOT NULL,
    channel TEXT NOT NULL, -- 'app', 'email', 'sms'
    message TEXT NOT NULL,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_read INTEGER DEFAULT 0,
    read_at DATETIME,
    FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE CASCADE
);

-- ============================================
-- HISTORICAL DATA TABLES
-- ============================================

-- Investment value history (for performance charts)
CREATE TABLE IF NOT EXISTS investment_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    investment_id INTEGER NOT NULL,
    recorded_date DATE NOT NULL,
    invested_amount REAL NOT NULL,
    current_value REAL NOT NULL,
    day_change REAL DEFAULT 0,
    day_change_percentage REAL DEFAULT 0,
    total_pnl REAL DEFAULT 0,
    total_pnl_percentage REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (investment_id) REFERENCES investments(id) ON DELETE CASCADE,
    UNIQUE(investment_id, recorded_date)
);

-- Basket NAV history (for template/public basket performance)
CREATE TABLE IF NOT EXISTS basket_nav_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    basket_id INTEGER NOT NULL,
    recorded_date DATE NOT NULL,
    nav REAL NOT NULL, -- Normalized to 100 at creation
    day_change REAL DEFAULT 0,
    day_change_percentage REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (basket_id) REFERENCES baskets(id) ON DELETE CASCADE,
    UNIQUE(basket_id, recorded_date)
);

-- Benchmark data cache
CREATE TABLE IF NOT EXISTS benchmark_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL, -- 'NIFTY 50', 'SENSEX', 'NIFTYBANK', etc.
    recorded_date DATE NOT NULL,
    close_price REAL NOT NULL,
    normalized_value REAL, -- Normalized to 100 for comparison
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(symbol, recorded_date)
);

-- ============================================
-- INSTRUMENT CACHE
-- ============================================

-- Cached instruments list (updated daily)
CREATE TABLE IF NOT EXISTS instruments_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instrument_token INTEGER NOT NULL,
    exchange_token INTEGER,
    trading_symbol TEXT NOT NULL,
    name TEXT,
    last_price REAL,
    expiry TEXT,
    strike REAL,
    tick_size REAL,
    lot_size INTEGER,
    instrument_type TEXT,
    segment TEXT,
    exchange TEXT NOT NULL,
    sector TEXT,
    industry TEXT,
    market_cap TEXT, -- 'large', 'mid', 'small'
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(trading_symbol, exchange)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_accounts_zerodha_user_id ON accounts(zerodha_user_id);
CREATE INDEX IF NOT EXISTS idx_baskets_account_id ON baskets(account_id);
CREATE INDEX IF NOT EXISTS idx_baskets_is_public ON baskets(is_public);
CREATE INDEX IF NOT EXISTS idx_baskets_is_template ON baskets(is_template);
CREATE INDEX IF NOT EXISTS idx_baskets_category ON baskets(category);
CREATE INDEX IF NOT EXISTS idx_basket_stocks_basket_id ON basket_stocks(basket_id);
CREATE INDEX IF NOT EXISTS idx_investments_account_id ON investments(account_id);
CREATE INDEX IF NOT EXISTS idx_investments_basket_id ON investments(basket_id);
CREATE INDEX IF NOT EXISTS idx_investment_holdings_investment_id ON investment_holdings(investment_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_basket_id ON transactions(basket_id);
CREATE INDEX IF NOT EXISTS idx_sips_account_id ON sips(account_id);
CREATE INDEX IF NOT EXISTS idx_sips_next_execution ON sips(next_execution_date);
CREATE INDEX IF NOT EXISTS idx_alerts_account_id ON alerts(account_id);
CREATE INDEX IF NOT EXISTS idx_alerts_is_active ON alerts(is_active);
CREATE INDEX IF NOT EXISTS idx_investment_history_investment_id ON investment_history(investment_id);
CREATE INDEX IF NOT EXISTS idx_investment_history_date ON investment_history(recorded_date);
CREATE INDEX IF NOT EXISTS idx_basket_nav_history_basket_id ON basket_nav_history(basket_id);
CREATE INDEX IF NOT EXISTS idx_instruments_cache_symbol ON instruments_cache(trading_symbol);
CREATE INDEX IF NOT EXISTS idx_instruments_cache_exchange ON instruments_cache(exchange);
