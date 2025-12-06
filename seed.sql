-- Seed data for StockBasket
-- Pre-built basket templates

-- Insert system account for templates
INSERT OR IGNORE INTO accounts (zerodha_user_id, name, email, is_primary, is_active)
VALUES ('SYSTEM', 'StockBasket Templates', 'templates@stockbasket.app', 0, 1);

-- Get system account ID (should be 1)
-- Insert pre-built basket templates

-- IT Sector Basket
INSERT OR IGNORE INTO baskets (account_id, name, description, theme, category, is_public, is_template, risk_level, benchmark_symbol, tags)
VALUES (
    1,
    'IT Leaders',
    'Top Indian IT companies with strong fundamentals and global presence. Ideal for long-term growth.',
    'Technology',
    'template',
    1,
    1,
    'moderate',
    'NSE:NIFTY IT',
    '["technology", "large-cap", "export", "digital"]'
);

INSERT OR IGNORE INTO basket_stocks (basket_id, trading_symbol, exchange, company_name, sector, weight_percentage)
VALUES 
    (1, 'TCS', 'NSE', 'Tata Consultancy Services', 'IT', 25),
    (1, 'INFY', 'NSE', 'Infosys', 'IT', 25),
    (1, 'HCLTECH', 'NSE', 'HCL Technologies', 'IT', 15),
    (1, 'WIPRO', 'NSE', 'Wipro', 'IT', 15),
    (1, 'TECHM', 'NSE', 'Tech Mahindra', 'IT', 10),
    (1, 'LTIM', 'NSE', 'LTIMindtree', 'IT', 10);

-- Banking Sector Basket
INSERT OR IGNORE INTO baskets (account_id, name, description, theme, category, is_public, is_template, risk_level, benchmark_symbol, tags)
VALUES (
    1,
    'Banking Giants',
    'Leading private and public sector banks with strong asset quality and growth potential.',
    'Banking',
    'template',
    1,
    1,
    'moderate',
    'NSE:NIFTY BANK',
    '["banking", "financial", "large-cap", "domestic"]'
);

INSERT OR IGNORE INTO basket_stocks (basket_id, trading_symbol, exchange, company_name, sector, weight_percentage)
VALUES 
    (2, 'HDFCBANK', 'NSE', 'HDFC Bank', 'Banking', 25),
    (2, 'ICICIBANK', 'NSE', 'ICICI Bank', 'Banking', 20),
    (2, 'KOTAKBANK', 'NSE', 'Kotak Mahindra Bank', 'Banking', 15),
    (2, 'SBIN', 'NSE', 'State Bank of India', 'Banking', 15),
    (2, 'AXISBANK', 'NSE', 'Axis Bank', 'Banking', 15),
    (2, 'INDUSINDBK', 'NSE', 'IndusInd Bank', 'Banking', 10);

-- Pharma Sector Basket
INSERT OR IGNORE INTO baskets (account_id, name, description, theme, category, is_public, is_template, risk_level, benchmark_symbol, tags)
VALUES (
    1,
    'Pharma Champions',
    'Diversified pharmaceutical companies with strong R&D and global presence.',
    'Healthcare',
    'template',
    1,
    1,
    'moderate',
    'NSE:NIFTY PHARMA',
    '["pharma", "healthcare", "defensive", "export"]'
);

INSERT OR IGNORE INTO basket_stocks (basket_id, trading_symbol, exchange, company_name, sector, weight_percentage)
VALUES 
    (3, 'SUNPHARMA', 'NSE', 'Sun Pharmaceutical', 'Pharma', 25),
    (3, 'DRREDDY', 'NSE', 'Dr. Reddys Laboratories', 'Pharma', 20),
    (3, 'CIPLA', 'NSE', 'Cipla', 'Pharma', 20),
    (3, 'DIVISLAB', 'NSE', 'Divis Laboratories', 'Pharma', 15),
    (3, 'APOLLOHOSP', 'NSE', 'Apollo Hospitals', 'Healthcare', 10),
    (3, 'BIOCON', 'NSE', 'Biocon', 'Pharma', 10);

-- FMCG Basket
INSERT OR IGNORE INTO baskets (account_id, name, description, theme, category, is_public, is_template, risk_level, benchmark_symbol, tags)
VALUES (
    1,
    'FMCG Essentials',
    'Consumer staples companies with strong brands and consistent cash flows.',
    'Consumer',
    'template',
    1,
    1,
    'low',
    'NSE:NIFTY FMCG',
    '["fmcg", "consumer", "defensive", "dividend"]'
);

INSERT OR IGNORE INTO basket_stocks (basket_id, trading_symbol, exchange, company_name, sector, weight_percentage)
VALUES 
    (4, 'HINDUNILVR', 'NSE', 'Hindustan Unilever', 'FMCG', 25),
    (4, 'ITC', 'NSE', 'ITC Limited', 'FMCG', 20),
    (4, 'NESTLEIND', 'NSE', 'Nestle India', 'FMCG', 20),
    (4, 'BRITANNIA', 'NSE', 'Britannia Industries', 'FMCG', 15),
    (4, 'DABUR', 'NSE', 'Dabur India', 'FMCG', 10),
    (4, 'MARICO', 'NSE', 'Marico', 'FMCG', 10);

-- Auto Sector Basket
INSERT OR IGNORE INTO baskets (account_id, name, description, theme, category, is_public, is_template, risk_level, benchmark_symbol, tags)
VALUES (
    1,
    'Auto Revolution',
    'Leading automobile and EV companies riding the mobility transformation.',
    'Automobile',
    'template',
    1,
    1,
    'high',
    'NSE:NIFTY AUTO',
    '["auto", "ev", "manufacturing", "cyclical"]'
);

INSERT OR IGNORE INTO basket_stocks (basket_id, trading_symbol, exchange, company_name, sector, weight_percentage)
VALUES 
    (5, 'TATAMOTORS', 'NSE', 'Tata Motors', 'Auto', 20),
    (5, 'M&M', 'NSE', 'Mahindra & Mahindra', 'Auto', 20),
    (5, 'MARUTI', 'NSE', 'Maruti Suzuki', 'Auto', 20),
    (5, 'BAJAJ-AUTO', 'NSE', 'Bajaj Auto', 'Auto', 15),
    (5, 'HEROMOTOCO', 'NSE', 'Hero MotoCorp', 'Auto', 15),
    (5, 'EICHERMOT', 'NSE', 'Eicher Motors', 'Auto', 10);

-- Nifty 50 Index Basket
INSERT OR IGNORE INTO baskets (account_id, name, description, theme, category, is_public, is_template, risk_level, benchmark_symbol, tags)
VALUES (
    1,
    'Nifty 50 Core',
    'Top 10 Nifty 50 companies by weight - diversified large-cap exposure.',
    'Index',
    'template',
    1,
    1,
    'moderate',
    'NSE:NIFTY 50',
    '["index", "large-cap", "diversified", "blue-chip"]'
);

INSERT OR IGNORE INTO basket_stocks (basket_id, trading_symbol, exchange, company_name, sector, weight_percentage)
VALUES 
    (6, 'RELIANCE', 'NSE', 'Reliance Industries', 'Conglomerate', 15),
    (6, 'HDFCBANK', 'NSE', 'HDFC Bank', 'Banking', 12),
    (6, 'ICICIBANK', 'NSE', 'ICICI Bank', 'Banking', 10),
    (6, 'INFY', 'NSE', 'Infosys', 'IT', 10),
    (6, 'TCS', 'NSE', 'Tata Consultancy Services', 'IT', 10),
    (6, 'BHARTIARTL', 'NSE', 'Bharti Airtel', 'Telecom', 8),
    (6, 'ITC', 'NSE', 'ITC Limited', 'FMCG', 8),
    (6, 'SBIN', 'NSE', 'State Bank of India', 'Banking', 7),
    (6, 'LT', 'NSE', 'Larsen & Toubro', 'Infrastructure', 7),
    (6, 'HINDUNILVR', 'NSE', 'Hindustan Unilever', 'FMCG', 6),
    (6, 'KOTAKBANK', 'NSE', 'Kotak Mahindra Bank', 'Banking', 7);

-- High Dividend Yield Basket
INSERT OR IGNORE INTO baskets (account_id, name, description, theme, category, is_public, is_template, risk_level, benchmark_symbol, tags)
VALUES (
    1,
    'Dividend Kings',
    'High dividend yield stocks with consistent payout history.',
    'Dividend',
    'template',
    1,
    1,
    'low',
    'NSE:NIFTY 50',
    '["dividend", "income", "value", "defensive"]'
);

INSERT OR IGNORE INTO basket_stocks (basket_id, trading_symbol, exchange, company_name, sector, weight_percentage)
VALUES 
    (7, 'COALINDIA', 'NSE', 'Coal India', 'Mining', 15),
    (7, 'ITC', 'NSE', 'ITC Limited', 'FMCG', 15),
    (7, 'POWERGRID', 'NSE', 'Power Grid Corp', 'Power', 15),
    (7, 'ONGC', 'NSE', 'ONGC', 'Oil & Gas', 12),
    (7, 'NTPC', 'NSE', 'NTPC', 'Power', 12),
    (7, 'BPCL', 'NSE', 'BPCL', 'Oil & Gas', 10),
    (7, 'IOC', 'NSE', 'Indian Oil Corp', 'Oil & Gas', 10),
    (7, 'RECLTD', 'NSE', 'REC Limited', 'Finance', 11);

-- Small Cap Growth Basket
INSERT OR IGNORE INTO baskets (account_id, name, description, theme, category, is_public, is_template, risk_level, benchmark_symbol, tags)
VALUES (
    1,
    'Small Cap Stars',
    'High-growth small cap companies with strong fundamentals.',
    'Growth',
    'template',
    1,
    1,
    'high',
    'NSE:NIFTY SMALLCAP 100',
    '["small-cap", "growth", "emerging", "high-risk"]'
);

INSERT OR IGNORE INTO basket_stocks (basket_id, trading_symbol, exchange, company_name, sector, weight_percentage)
VALUES 
    (8, 'CDSL', 'NSE', 'CDSL', 'Finance', 15),
    (8, 'ROUTE', 'NSE', 'Route Mobile', 'IT', 12),
    (8, 'ANGELONE', 'NSE', 'Angel One', 'Finance', 12),
    (8, 'KAYNES', 'NSE', 'Kaynes Technology', 'Electronics', 12),
    (8, 'HAPPSTMNDS', 'NSE', 'Happiest Minds', 'IT', 12),
    (8, 'CAMS', 'NSE', 'CAMS', 'Finance', 12),
    (8, 'AFFLE', 'NSE', 'Affle India', 'IT', 12),
    (8, 'BSOFT', 'NSE', 'Birlasoft', 'IT', 13);

-- Insert benchmark symbols
INSERT OR IGNORE INTO benchmark_data (symbol, recorded_date, close_price, normalized_value)
VALUES 
    ('NIFTY 50', DATE('now'), 24500, 100),
    ('SENSEX', DATE('now'), 80000, 100),
    ('NIFTY BANK', DATE('now'), 52000, 100),
    ('NIFTY IT', DATE('now'), 38000, 100),
    ('NIFTY PHARMA', DATE('now'), 21000, 100),
    ('NIFTY FMCG', DATE('now'), 58000, 100),
    ('NIFTY AUTO', DATE('now'), 23000, 100);
