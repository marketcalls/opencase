-- Master Instruments Table for NSE/BSE equity symbols
-- Downloaded from Zerodha Kite API daily

-- Drop existing instruments_cache and replace with more comprehensive master_instruments
DROP TABLE IF EXISTS master_instruments;

CREATE TABLE IF NOT EXISTS master_instruments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instrument_token INTEGER NOT NULL,
    exchange_token INTEGER,
    trading_symbol TEXT NOT NULL,
    name TEXT,
    exchange TEXT NOT NULL,
    segment TEXT,
    instrument_type TEXT,
    tick_size REAL,
    lot_size INTEGER DEFAULT 1,
    expiry TEXT,
    strike REAL,
    last_price REAL,
    -- Metadata
    sector TEXT,
    industry TEXT,
    market_cap TEXT, -- 'large', 'mid', 'small'
    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    -- Unique constraint
    UNIQUE(trading_symbol, exchange)
);

-- Indexes for fast searching
CREATE INDEX IF NOT EXISTS idx_master_instruments_symbol ON master_instruments(trading_symbol);
CREATE INDEX IF NOT EXISTS idx_master_instruments_name ON master_instruments(name);
CREATE INDEX IF NOT EXISTS idx_master_instruments_exchange ON master_instruments(exchange);
CREATE INDEX IF NOT EXISTS idx_master_instruments_type ON master_instruments(instrument_type);
CREATE INDEX IF NOT EXISTS idx_master_instruments_token ON master_instruments(instrument_token);
CREATE INDEX IF NOT EXISTS idx_master_instruments_segment ON master_instruments(segment);

-- SIP Executions tracking improvements
CREATE TABLE IF NOT EXISTS sip_execution_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sip_id INTEGER NOT NULL,
    scheduled_date DATE NOT NULL,
    status TEXT DEFAULT 'PENDING', -- 'PENDING', 'QUEUED', 'EXECUTING', 'COMPLETED', 'FAILED'
    attempt_count INTEGER DEFAULT 0,
    last_attempt_at DATETIME,
    error_message TEXT,
    transaction_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sip_id) REFERENCES sips(id) ON DELETE CASCADE,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,
    UNIQUE(sip_id, scheduled_date)
);

CREATE INDEX IF NOT EXISTS idx_sip_queue_status ON sip_execution_queue(status);
CREATE INDEX IF NOT EXISTS idx_sip_queue_date ON sip_execution_queue(scheduled_date);

-- Add last_download_at to app_config for tracking instrument downloads
INSERT OR IGNORE INTO app_config (config_key, config_value, is_encrypted) 
VALUES ('instruments_last_download', '', 0);
