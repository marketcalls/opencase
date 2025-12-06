-- Unified Symbol Format Migration
-- Creates a common symbol format across all brokers (Zerodha, AngelOne, etc.)

-- Drop and recreate master_instruments with unified schema
DROP TABLE IF EXISTS master_instruments;

CREATE TABLE IF NOT EXISTS master_instruments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    -- Unified symbol identifier
    symbol TEXT NOT NULL,              -- Common symbol (e.g., RELIANCE, TCS, INFY)
    name TEXT,                         -- Company name
    exchange TEXT NOT NULL,            -- NSE, BSE, NFO, etc.
    
    -- Instrument details
    instrument_type TEXT,              -- EQ, FUT, CE, PE, etc.
    segment TEXT,                      -- NSE-EQ, NSE-FO, BSE-EQ, etc.
    series TEXT,                       -- EQ, BE, etc.
    tick_size REAL,
    lot_size INTEGER DEFAULT 1,
    expiry TEXT,
    strike REAL,
    last_price REAL,
    
    -- Broker-specific tokens (for faster lookups)
    zerodha_token INTEGER,             -- Zerodha instrument_token
    zerodha_exchange_token INTEGER,    -- Zerodha exchange_token
    zerodha_trading_symbol TEXT,       -- Zerodha trading symbol format
    
    angelone_token TEXT,               -- Angel One symbol_token
    angelone_trading_symbol TEXT,      -- Angel One tradingsymbol format
    
    -- Metadata for filtering
    sector TEXT,
    industry TEXT,
    market_cap TEXT,                   -- 'large', 'mid', 'small'
    isin TEXT,                         -- ISIN code for cross-reference
    
    -- Source tracking
    source TEXT,                       -- 'zerodha', 'angelone', 'manual'
    last_downloaded_from TEXT,         -- Last broker source
    
    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique constraint on symbol + exchange
    UNIQUE(symbol, exchange, instrument_type, expiry, strike)
);

-- Indexes for fast searching
CREATE INDEX IF NOT EXISTS idx_mi_symbol ON master_instruments(symbol);
CREATE INDEX IF NOT EXISTS idx_mi_name ON master_instruments(name);
CREATE INDEX IF NOT EXISTS idx_mi_exchange ON master_instruments(exchange);
CREATE INDEX IF NOT EXISTS idx_mi_type ON master_instruments(instrument_type);
CREATE INDEX IF NOT EXISTS idx_mi_segment ON master_instruments(segment);
CREATE INDEX IF NOT EXISTS idx_mi_zerodha_token ON master_instruments(zerodha_token);
CREATE INDEX IF NOT EXISTS idx_mi_zerodha_symbol ON master_instruments(zerodha_trading_symbol);
CREATE INDEX IF NOT EXISTS idx_mi_angelone_token ON master_instruments(angelone_token);
CREATE INDEX IF NOT EXISTS idx_mi_angelone_symbol ON master_instruments(angelone_trading_symbol);
CREATE INDEX IF NOT EXISTS idx_mi_isin ON master_instruments(isin);
CREATE INDEX IF NOT EXISTS idx_mi_sector ON master_instruments(sector);

-- Broker accounts table update (add broker_type column)
-- First check if column exists, if not add it
ALTER TABLE accounts ADD COLUMN broker_type TEXT DEFAULT 'zerodha';
ALTER TABLE accounts ADD COLUMN client_code TEXT;
ALTER TABLE accounts ADD COLUMN mpin_encrypted TEXT;

-- Create a new table for broker-specific credentials
CREATE TABLE IF NOT EXISTS broker_credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    broker_type TEXT NOT NULL,         -- 'zerodha', 'angelone'
    api_key_encrypted TEXT NOT NULL,
    api_secret_encrypted TEXT NOT NULL,
    client_code TEXT,                  -- For AngelOne
    mpin_encrypted TEXT,               -- For AngelOne
    access_token TEXT,
    refresh_token TEXT,
    token_expiry DATETIME,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    UNIQUE(account_id, broker_type)
);

CREATE INDEX IF NOT EXISTS idx_bc_account ON broker_credentials(account_id);
CREATE INDEX IF NOT EXISTS idx_bc_broker ON broker_credentials(broker_type);

-- Symbol mapping table for cross-broker reference
CREATE TABLE IF NOT EXISTS symbol_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,              -- Unified symbol
    exchange TEXT NOT NULL,
    zerodha_symbol TEXT,               -- RELIANCE
    zerodha_full_symbol TEXT,          -- RELIANCE:NSE or RELIANCE-EQ
    angelone_symbol TEXT,              -- RELIANCE-EQ
    angelone_token TEXT,
    isin TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(symbol, exchange)
);

CREATE INDEX IF NOT EXISTS idx_sm_symbol ON symbol_mappings(symbol);
CREATE INDEX IF NOT EXISTS idx_sm_zerodha ON symbol_mappings(zerodha_symbol);
CREATE INDEX IF NOT EXISTS idx_sm_angelone ON symbol_mappings(angelone_symbol);

-- App config additions for multi-broker support
INSERT OR IGNORE INTO app_config (config_key, config_value, is_encrypted) 
VALUES ('angelone_api_key', '', 1);
INSERT OR IGNORE INTO app_config (config_key, config_value, is_encrypted) 
VALUES ('angelone_api_secret', '', 1);
INSERT OR IGNORE INTO app_config (config_key, config_value, is_encrypted) 
VALUES ('default_broker', 'zerodha', 0);
INSERT OR IGNORE INTO app_config (config_key, config_value, is_encrypted) 
VALUES ('angelone_last_download', '', 0);

-- Historical price data for performance tracking
CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    exchange TEXT NOT NULL,
    date DATE NOT NULL,
    open REAL,
    high REAL,
    low REAL,
    close REAL NOT NULL,
    volume INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(symbol, exchange, date)
);

CREATE INDEX IF NOT EXISTS idx_ph_symbol ON price_history(symbol, exchange);
CREATE INDEX IF NOT EXISTS idx_ph_date ON price_history(date);

-- Basket performance snapshots
CREATE TABLE IF NOT EXISTS basket_performance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    basket_id INTEGER NOT NULL,
    date DATE NOT NULL,
    total_value REAL NOT NULL,         -- Portfolio value on this date
    daily_return REAL,                 -- Daily return percentage
    cumulative_return REAL,            -- Cumulative return from start
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (basket_id) REFERENCES baskets(id) ON DELETE CASCADE,
    UNIQUE(basket_id, date)
);

CREATE INDEX IF NOT EXISTS idx_bp_basket ON basket_performance(basket_id);
CREATE INDEX IF NOT EXISTS idx_bp_date ON basket_performance(date);
