-- ============================================
-- PRODUCTION-READY SEED SCRIPT
-- ⚠️ WARNING: FOR LOCAL/DEV ENVIRONMENTS ONLY
-- ============================================


-- Step 1: Create account (using test email)
INSERT OR IGNORE INTO accounts (
  id, zerodha_user_id, name, email, broker_type, 
  is_primary, is_active, created_at, updated_at
) VALUES (
  1, 'AB1234', 'Test Trading Account', 'test@example.com', 'zerodha',
  1, 1, datetime('now'), datetime('now')
);


-- Step 2: Create broker account
INSERT OR IGNORE INTO broker_accounts (
  user_id, broker_type, account_name, broker_user_id,
  is_connected, is_active, connection_status, created_at, updated_at
) VALUES (
  1, 'zerodha', 'My Trading Account', 'AB1234',
  1, 1, 'connected', datetime('now'), datetime('now')
);


-- Step 3: Create baskets
INSERT OR IGNORE INTO baskets (
  user_id, account_id, name, description, theme, category, 
  is_active, is_public, is_template, min_investment, risk_level, 
  benchmark_symbol, created_at, updated_at
) VALUES 
(1, 1, 'Tech Leaders', 'Top technology stocks from India', 'Technology', 'custom', 1, 0, 0, 25000, 'moderate', 'NIFTY IT', datetime('now', '-180 days'), datetime('now')),
(1, 1, 'Banking Giants', 'Leading banking and financial services', 'Banking', 'custom', 1, 0, 0, 30000, 'low', 'NIFTY BANK', datetime('now', '-240 days'), datetime('now')),
(1, 1, 'Pharma Power', 'Pharmaceutical and healthcare stocks', 'Healthcare', 'custom', 1, 0, 0, 20000, 'high', 'NIFTY PHARMA', datetime('now', '-120 days'), datetime('now'));


-- Step 4: Create basket stocks
INSERT OR IGNORE INTO basket_stocks (basket_id, trading_symbol, exchange, weight_percentage, company_name, sector, created_at) VALUES
(1, 'TCS', 'NSE', 25.0, 'Tata Consultancy Services', 'IT', datetime('now')),
(1, 'INFY', 'NSE', 25.0, 'Infosys Limited', 'IT', datetime('now')),
(1, 'WIPRO', 'NSE', 25.0, 'Wipro Limited', 'IT', datetime('now')),
(1, 'HCLTECH', 'NSE', 25.0, 'HCL Technologies', 'IT', datetime('now')),
(2, 'HDFCBANK', 'NSE', 30.0, 'HDFC Bank', 'Banking', datetime('now')),
(2, 'ICICIBANK', 'NSE', 30.0, 'ICICI Bank', 'Banking', datetime('now')),
(2, 'AXISBANK', 'NSE', 20.0, 'Axis Bank', 'Banking', datetime('now')),
(2, 'KOTAKBANK', 'NSE', 20.0, 'Kotak Mahindra Bank', 'Banking', datetime('now')),
(3, 'SUNPHARMA', 'NSE', 30.0, 'Sun Pharma', 'Pharma', datetime('now')),
(3, 'DRREDDY', 'NSE', 30.0, 'Dr Reddys Labs', 'Pharma', datetime('now')),
(3, 'CIPLA', 'NSE', 20.0, 'Cipla', 'Pharma', datetime('now')),
(3, 'DIVISLAB', 'NSE', 20.0, 'Divis Laboratories', 'Pharma', datetime('now'));


-- Step 5: Create investments
INSERT OR IGNORE INTO investments (
  user_id, account_id, basket_id, broker_account_id,
  invested_amount, current_value, units, invested_at, 
  last_synced_at, status
) VALUES 
(1, 1, 1, 1, 50000, 55000, 1, date('now', '-180 days'), datetime('now'), 'ACTIVE'),
(1, 1, 2, 1, 75000, 78500, 1, date('now', '-240 days'), datetime('now'), 'ACTIVE'),
(1, 1, 3, 1, 40000, 44000, 1, date('now', '-120 days'), datetime('now'), 'ACTIVE');


-- Step 6: Create investment holdings
INSERT OR IGNORE INTO investment_holdings (investment_id, trading_symbol, exchange, quantity, average_price, current_price, target_weight, actual_weight, pnl, pnl_percentage, last_updated) VALUES
(1, 'TCS', 'NSE', 3, 4166.67, 4350.00, 25.0, 25.0, 550, 4.4, datetime('now')),
(1, 'INFY', 'NSE', 8, 1562.50, 1625.00, 25.0, 25.0, 500, 4.0, datetime('now')),
(1, 'WIPRO', 'NSE', 25, 500.00, 530.00, 25.0, 25.0, 750, 6.0, datetime('now')),
(1, 'HCLTECH', 'NSE', 9, 1388.89, 1450.00, 25.0, 25.0, 550, 4.4, datetime('now')),
(2, 'HDFCBANK', 'NSE', 14, 1607.14, 1650.00, 30.0, 30.0, 600, 2.7, datetime('now')),
(2, 'ICICIBANK', 'NSE', 22, 1022.73, 1050.00, 30.0, 30.0, 600, 2.7, datetime('now')),
(2, 'AXISBANK', 'NSE', 15, 1000.00, 1020.00, 20.0, 20.0, 300, 2.0, datetime('now')),
(2, 'KOTAKBANK', 'NSE', 9, 1666.67, 1700.00, 20.0, 20.0, 300, 2.0, datetime('now')),
(3, 'SUNPHARMA', 'NSE', 8, 1500.00, 1575.00, 30.0, 30.0, 600, 5.0, datetime('now')),
(3, 'DRREDDY', 'NSE', 2, 6000.00, 6300.00, 30.0, 30.0, 600, 5.0, datetime('now')),
(3, 'CIPLA', 'NSE', 7, 1142.86, 1200.00, 20.0, 20.0, 400, 5.0, datetime('now')),
(3, 'DIVISLAB', 'NSE', 2, 4000.00, 4200.00, 20.0, 20.0, 400, 5.0, datetime('now'));


-- Step 7: Populate investment_history
-- ⚠️ SAFETY: Only delete test investment data (IDs: 1, 2, 3)
DELETE FROM investment_history WHERE investment_id IN (1, 2, 3);

INSERT INTO investment_history (investment_id, recorded_date, invested_amount, current_value, day_change, day_change_percentage, total_pnl, total_pnl_percentage, created_at)
SELECT i.id, date(i.invested_at, '+' || n.day || ' days'), i.invested_amount, 
  CAST(i.invested_amount * (1.0 + (n.day * 0.0003) + ((ABS(RANDOM()) % 200 - 100) / 10000.0)) AS REAL), 
  0, 0, 0, 0, datetime('now')
FROM investments i 
CROSS JOIN (WITH RECURSIVE days(day) AS (SELECT 0 UNION ALL SELECT day + 1 FROM days WHERE day < 365) SELECT day FROM days) n
WHERE i.id IN (1, 2, 3) AND date(i.invested_at, '+' || n.day || ' days') <= date('now');

UPDATE investment_history SET 
  total_pnl = current_value - invested_amount, 
  total_pnl_percentage = ((current_value - invested_amount) / invested_amount) * 100
WHERE investment_id IN (1, 2, 3);


-- Step 8: Add benchmark historical data
INSERT OR IGNORE INTO benchmark_data (symbol, recorded_date, close_price, created_at)
SELECT 'NIFTY 50', date('now', '-' || n.day || ' days'), 
  CAST(24500 - (n.day * 10) + ((ABS(RANDOM()) % 500 - 250)) AS REAL), datetime('now')
FROM (WITH RECURSIVE days(day) AS (SELECT 1 UNION ALL SELECT day + 1 FROM days WHERE day < 365) SELECT day FROM days) n;

INSERT OR IGNORE INTO benchmark_data (symbol, recorded_date, close_price, created_at)
SELECT 'NIFTY IT', date('now', '-' || n.day || ' days'), 
  CAST(38000 - (n.day * 15) + ((ABS(RANDOM()) % 400 - 200)) AS REAL), datetime('now')
FROM (WITH RECURSIVE days(day) AS (SELECT 1 UNION ALL SELECT day + 1 FROM days WHERE day < 365) SELECT day FROM days) n;

INSERT OR IGNORE INTO benchmark_data (symbol, recorded_date, close_price, created_at)
SELECT 'NIFTY BANK', date('now', '-' || n.day || ' days'), 
  CAST(52000 - (n.day * 20) + ((ABS(RANDOM()) % 600 - 300)) AS REAL), datetime('now')
FROM (WITH RECURSIVE days(day) AS (SELECT 1 UNION ALL SELECT day + 1 FROM days WHERE day < 365) SELECT day FROM days) n;

INSERT OR IGNORE INTO benchmark_data (symbol, recorded_date, close_price, created_at)
SELECT 'NIFTY PHARMA', date('now', '-' || n.day || ' days'), 
  CAST(21000 - (n.day * 8) + ((ABS(RANDOM()) % 300 - 150)) AS REAL), datetime('now')
FROM (WITH RECURSIVE days(day) AS (SELECT 1 UNION ALL SELECT day + 1 FROM days WHERE day < 365) SELECT day FROM days) n;
