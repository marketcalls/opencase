-- User Authentication Migration
-- Single user app - first user becomes admin
-- Separate users table from broker accounts

-- ============================================
-- USERS TABLE (App Login)
-- ============================================

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,           -- First user becomes admin
    is_active INTEGER DEFAULT 1,
    avatar_url TEXT,
    last_login_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================
-- BROKER ACCOUNTS TABLE (Separate from users)
-- ============================================

-- Rename and restructure accounts table to broker_accounts
-- Each user can have multiple broker accounts

CREATE TABLE IF NOT EXISTS broker_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,             -- Links to users table
    
    -- Broker info
    broker_type TEXT NOT NULL,            -- 'zerodha', 'angelone'
    account_name TEXT NOT NULL,           -- User-friendly name like "My Trading Account"
    
    -- Broker-specific identifiers
    broker_user_id TEXT,                  -- Zerodha user_id or Angel client_code
    client_code TEXT,                     -- Angel One client code
    
    -- API Credentials (encrypted)
    api_key_encrypted TEXT,
    api_secret_encrypted TEXT,
    mpin_encrypted TEXT,                  -- For Angel One
    
    -- Session tokens
    access_token TEXT,
    refresh_token TEXT,
    feed_token TEXT,                      -- Angel One feed token
    token_expiry DATETIME,
    
    -- Status
    is_connected INTEGER DEFAULT 0,       -- Whether currently connected/logged in
    is_active INTEGER DEFAULT 1,
    connection_status TEXT DEFAULT 'disconnected',  -- 'connected', 'disconnected', 'expired'
    last_connected_at DATETIME,
    
    -- Metadata from broker
    broker_name TEXT,                     -- Full name from broker
    broker_email TEXT,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, broker_type, broker_user_id)
);

CREATE INDEX IF NOT EXISTS idx_ba_user ON broker_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_ba_broker ON broker_accounts(broker_type);
CREATE INDEX IF NOT EXISTS idx_ba_connected ON broker_accounts(is_connected);

-- ============================================
-- UPDATE FOREIGN KEYS
-- ============================================

-- We'll need to update baskets, investments, etc. to reference user_id
-- For now, we'll add user_id columns and migrate later

ALTER TABLE baskets ADD COLUMN user_id INTEGER REFERENCES users(id);
ALTER TABLE investments ADD COLUMN user_id INTEGER REFERENCES users(id);
ALTER TABLE sips ADD COLUMN user_id INTEGER REFERENCES users(id);
ALTER TABLE alerts ADD COLUMN user_id INTEGER REFERENCES users(id);
ALTER TABLE transactions ADD COLUMN user_id INTEGER REFERENCES users(id);

-- ============================================
-- APP CONFIG FOR AUTH
-- ============================================

INSERT OR IGNORE INTO app_config (config_key, config_value, is_encrypted) 
VALUES ('app_initialized', '0', 0);
INSERT OR IGNORE INTO app_config (config_key, config_value, is_encrypted) 
VALUES ('require_signup', '1', 0);
