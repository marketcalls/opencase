-- Link investments to specific broker accounts
-- This allows filtering investments by broker

-- Add broker_account_id to investments table
ALTER TABLE investments ADD COLUMN broker_account_id INTEGER REFERENCES broker_accounts(id);

-- Add broker_account_id to transactions table for tracking
ALTER TABLE transactions ADD COLUMN broker_account_id INTEGER REFERENCES broker_accounts(id);

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_investments_broker ON investments(broker_account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_broker ON transactions(broker_account_id);
