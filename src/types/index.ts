// Cloudflare Bindings
export interface Bindings {
  DB: D1Database;
  KV: KVNamespace;
  KITE_API_KEY?: string;
  KITE_API_SECRET?: string;
  KITE_REDIRECT_URL?: string;
  ENCRYPTION_KEY?: string;
}

// Variables type for Hono
export type Variables = {
  account: Account | null;
  session: SessionData | null;
};

// ============================================
// Database Models
// ============================================

export interface AppConfig {
  id: number;
  config_key: string;
  config_value: string;
  is_encrypted: number;
  created_at: string;
  updated_at: string;
}

export interface Account {
  id: number;
  zerodha_user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  kite_api_key: string | null;
  kite_api_secret: string | null;
  access_token: string | null;
  refresh_token: string | null;
  access_token_expiry: string | null;
  is_primary: number;
  is_active: number;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccountGroup {
  id: number;
  name: string;
  description: string | null;
  created_by: number | null;
  created_at: string;
}

export interface AccountGroupMember {
  id: number;
  group_id: number;
  account_id: number;
  role: 'admin' | 'member' | 'viewer';
  joined_at: string;
}

export interface Basket {
  id: number;
  account_id: number;
  name: string;
  description: string | null;
  theme: string | null;
  category: 'custom' | 'template' | 'shared';
  is_active: number;
  is_public: number;
  is_template: number;
  min_investment: number;
  risk_level: 'low' | 'moderate' | 'high';
  benchmark_symbol: string;
  tags: string | null;
  clone_count: number;
  created_at: string;
  updated_at: string;
}

export interface BasketStock {
  id: number;
  basket_id: number;
  trading_symbol: string;
  exchange: string;
  instrument_token: number | null;
  company_name: string | null;
  sector: string | null;
  weight_percentage: number;
  created_at: string;
}

export interface Investment {
  id: number;
  account_id: number;
  basket_id: number;
  invested_amount: number;
  current_value: number | null;
  units: number;
  invested_at: string;
  last_rebalanced_at: string | null;
  last_synced_at: string | null;
  status: 'ACTIVE' | 'SOLD' | 'PARTIAL';
}

export interface InvestmentHolding {
  id: number;
  investment_id: number;
  trading_symbol: string;
  exchange: string;
  quantity: number;
  average_price: number;
  current_price: number | null;
  target_weight: number | null;
  actual_weight: number | null;
  pnl: number;
  pnl_percentage: number;
  last_updated: string;
}

export interface Transaction {
  id: number;
  account_id: number;
  investment_id: number | null;
  basket_id: number;
  transaction_type: 'BUY' | 'SELL' | 'REBALANCE' | 'SIP';
  total_amount: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'PARTIAL';
  kite_order_ids: string | null;
  order_details: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface SIP {
  id: number;
  account_id: number;
  basket_id: number;
  investment_id: number | null;
  amount: number;
  frequency: 'daily' | 'weekly' | 'monthly';
  day_of_week: number | null;
  day_of_month: number | null;
  start_date: string;
  end_date: string | null;
  next_execution_date: string | null;
  total_installments: number;
  completed_installments: number;
  total_invested: number;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  created_at: string;
  updated_at: string;
}

export interface Alert {
  id: number;
  account_id: number;
  alert_type: 'price' | 'rebalance' | 'pnl' | 'sip_reminder';
  target_type: 'stock' | 'basket' | 'investment';
  target_id: number | null;
  trading_symbol: string | null;
  exchange: string | null;
  condition: 'above' | 'below' | 'crosses' | 'deviation_exceeds';
  threshold_value: number;
  current_value: number | null;
  message: string | null;
  is_active: number;
  is_triggered: number;
  last_triggered_at: string | null;
  notification_channels: string;
  created_at: string;
  updated_at: string;
}

export interface InvestmentHistory {
  id: number;
  investment_id: number;
  recorded_date: string;
  invested_amount: number;
  current_value: number;
  day_change: number;
  day_change_percentage: number;
  total_pnl: number;
  total_pnl_percentage: number;
  created_at: string;
}

export interface BasketNAVHistory {
  id: number;
  basket_id: number;
  recorded_date: string;
  nav: number;
  day_change: number;
  day_change_percentage: number;
  created_at: string;
}

export interface BenchmarkData {
  id: number;
  symbol: string;
  recorded_date: string;
  close_price: number;
  normalized_value: number | null;
  created_at: string;
}

export interface InstrumentCache {
  id: number;
  instrument_token: number;
  exchange_token: number | null;
  trading_symbol: string;
  name: string | null;
  last_price: number | null;
  expiry: string | null;
  strike: number | null;
  tick_size: number | null;
  lot_size: number | null;
  instrument_type: string | null;
  segment: string | null;
  exchange: string;
  sector: string | null;
  industry: string | null;
  market_cap: 'large' | 'mid' | 'small' | null;
  updated_at: string;
}

// ============================================
// Kite API Types
// ============================================

export interface KiteSession {
  user_id: string;
  user_name: string;
  user_shortname: string;
  email: string;
  user_type: string;
  broker: string;
  exchanges: string[];
  products: string[];
  order_types: string[];
  avatar_url: string | null;
  access_token: string;
  public_token: string;
  refresh_token: string;
  enctoken: string;
  login_time: string;
}

export interface KiteQuote {
  instrument_token: number;
  timestamp: string;
  last_trade_time: string;
  last_price: number;
  last_quantity: number;
  buy_quantity: number;
  sell_quantity: number;
  volume: number;
  average_price: number;
  oi: number;
  net_change: number;
  lower_circuit_limit: number;
  upper_circuit_limit: number;
  ohlc: {
    open: number;
    high: number;
    low: number;
    close: number;
  };
}

export interface KiteLTP {
  instrument_token: number;
  last_price: number;
}

export interface KiteHolding {
  tradingsymbol: string;
  exchange: string;
  instrument_token: number;
  isin: string;
  product: string;
  quantity: number;
  average_price: number;
  last_price: number;
  close_price: number;
  pnl: number;
  day_change: number;
  day_change_percentage: number;
}

export interface KiteOrder {
  variety: 'regular' | 'amo' | 'co';
  tradingsymbol: string;
  exchange: string;
  transaction_type: 'BUY' | 'SELL';
  order_type: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
  quantity: number;
  product: 'CNC' | 'NRML' | 'MIS';
  price?: number;
  trigger_price?: number;
  validity?: 'DAY' | 'IOC';
  readonly?: boolean;
  tag?: string;
}

// ============================================
// API Request/Response Types
// ============================================

export interface SetupRequest {
  kite_api_key: string;
  kite_api_secret: string;
}

export interface CreateBasketRequest {
  name: string;
  description?: string;
  theme?: string;
  is_public?: boolean;
  risk_level?: 'low' | 'moderate' | 'high';
  benchmark_symbol?: string;
  tags?: string[];
  stocks: Array<{
    trading_symbol: string;
    exchange: string;
    weight_percentage: number;
  }>;
}

export interface UpdateBasketRequest {
  name?: string;
  description?: string;
  theme?: string;
  is_public?: boolean;
  risk_level?: 'low' | 'moderate' | 'high';
  benchmark_symbol?: string;
  tags?: string[];
  stocks?: Array<{
    trading_symbol: string;
    exchange: string;
    weight_percentage: number;
  }>;
}

export interface BuyBasketRequest {
  investment_amount: number;
}

export interface SellBasketRequest {
  percentage?: number; // Optional, defaults to 100 (full exit)
}

export interface CreateSIPRequest {
  basket_id: number;
  amount: number;
  frequency: 'daily' | 'weekly' | 'monthly';
  day_of_week?: number;
  day_of_month?: number;
  start_date: string;
  end_date?: string;
}

export interface CreateAlertRequest {
  alert_type: 'price' | 'rebalance' | 'pnl' | 'sip_reminder';
  target_type: 'stock' | 'basket' | 'investment';
  target_id?: number;
  trading_symbol?: string;
  exchange?: string;
  condition: 'above' | 'below' | 'crosses' | 'deviation_exceeds';
  threshold_value: number;
  message?: string;
  notification_channels?: string[];
}

export interface RebalancePreview {
  trading_symbol: string;
  exchange: string;
  company_name: string | null;
  target_weight: number;
  actual_weight: number;
  deviation: number;
  action: 'BUY' | 'SELL' | 'HOLD';
  quantity: number;
  amount: number;
  current_price: number;
}

export interface PortfolioSummary {
  total_invested: number;
  current_value: number;
  total_pnl: number;
  total_pnl_percentage: number;
  day_change: number;
  day_change_percentage: number;
  investments_count: number;
  baskets_count: number;
  active_sips: number;
  pending_alerts: number;
}

export interface BasketWithStocks extends Basket {
  stocks: BasketStock[];
  current_value?: number;
  min_investment_calculated?: number;
}

export interface InvestmentWithDetails extends Investment {
  basket: Basket;
  holdings: InvestmentHolding[];
  pnl: number;
  pnl_percentage: number;
}

export interface PerformanceData {
  dates: string[];
  values: number[];
  benchmark_values: number[];
  benchmark_name: string;
}

// API Response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: {
    code: string;
    message: string;
  } | null;
  timestamp: string;
}

// Session data stored in KV
export interface SessionData {
  account_id: number;
  zerodha_user_id: string;
  access_token: string;
  name: string | null;
  email: string | null;
  expires_at: number;
}
