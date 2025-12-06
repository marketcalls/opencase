/**
 * Common Broker Types
 * Unified interface for all broker integrations
 */

// Supported brokers
export type BrokerType = 'zerodha' | 'angelone';

// Common symbol format (OpenAlgo style)
export interface UnifiedSymbol {
  symbol: string;          // Common symbol (e.g., 'RELIANCE', 'NIFTY24DEC25000CE')
  brokerSymbol: string;    // Broker-specific symbol
  exchange: string;        // Common exchange (NSE, BSE, NFO, MCX, etc.)
  brokerExchange: string;  // Broker-specific exchange
  token: string;           // Instrument token
  name: string;            // Company/instrument name
  instrumentType: string;  // EQ, FUT, CE, PE, INDEX
  lotSize: number;
  tickSize: number;
  expiry?: string;         // DD-MMM-YY format
  strike?: number;
}

// Quote data
export interface UnifiedQuote {
  symbol: string;
  exchange: string;
  lastPrice: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePercent: number;
  timestamp: Date;
}

// LTP data
export interface UnifiedLTP {
  symbol: string;
  exchange: string;
  lastPrice: number;
}

// Order types
export type OrderType = 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
export type TransactionType = 'BUY' | 'SELL';
export type ProductType = 'CNC' | 'MIS' | 'NRML';
export type OrderVariety = 'regular' | 'amo' | 'bo' | 'co' | 'iceberg';
export type OrderValidity = 'DAY' | 'IOC' | 'TTL';

// Unified order request
export interface UnifiedOrder {
  symbol: string;
  exchange: string;
  transactionType: TransactionType;
  orderType: OrderType;
  quantity: number;
  product: ProductType;
  price?: number;
  triggerPrice?: number;
  validity?: OrderValidity;
  variety?: OrderVariety;
  tag?: string;
}

// Order response
export interface UnifiedOrderResponse {
  orderId: string;
  status: string;
  message?: string;
}

// Holding
export interface UnifiedHolding {
  symbol: string;
  exchange: string;
  quantity: number;
  averagePrice: number;
  lastPrice: number;
  pnl: number;
  pnlPercent: number;
  value: number;
}

// Position
export interface UnifiedPosition {
  symbol: string;
  exchange: string;
  quantity: number;
  averagePrice: number;
  lastPrice: number;
  pnl: number;
  product: ProductType;
  overnight: boolean;
}

// Historical candle data
export interface HistoricalCandle {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Session/auth data
export interface BrokerSession {
  broker: BrokerType;
  userId: string;
  userName: string;
  email?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

// Broker credentials
export interface BrokerCredentials {
  broker: BrokerType;
  apiKey: string;
  apiSecret: string;
  // AngelOne specific
  clientId?: string;
  password?: string;
  totp?: string;
}

// Funds/margin info
export interface UnifiedFunds {
  availableCash: number;
  usedMargin: number;
  totalBalance: number;
  collateral?: number;
}

// Broker API configuration
export interface BrokerConfig {
  baseUrl: string;
  loginUrl: string;
  version: string;
}

// Common index symbol mapping
export const INDEX_SYMBOL_MAP: Record<string, string> = {
  'Nifty 50': 'NIFTY',
  'NIFTY 50': 'NIFTY',
  'Nifty Next 50': 'NIFTYNXT50',
  'NIFTY NEXT 50': 'NIFTYNXT50',
  'Nifty Fin Service': 'FINNIFTY',
  'NIFTY FIN SERVICE': 'FINNIFTY',
  'Nifty Bank': 'BANKNIFTY',
  'NIFTY BANK': 'BANKNIFTY',
  'NIFTY MID SELECT': 'MIDCPNIFTY',
  'India VIX': 'INDIAVIX',
  'INDIA VIX': 'INDIAVIX',
  'SNSX50': 'SENSEX50',
  'SENSEX': 'SENSEX'
};

// Exchange mapping
export const EXCHANGE_MAP: Record<string, Record<string, string>> = {
  zerodha: {
    'NSE': 'NSE',
    'BSE': 'BSE',
    'NFO': 'NFO',
    'CDS': 'CDS',
    'MCX': 'MCX',
    'BFO': 'BFO',
    'BCD': 'BCD',
    'NSE_INDEX': 'NSE',
    'BSE_INDEX': 'BSE'
  },
  angelone: {
    'NSE': 'NSE',
    'BSE': 'BSE',
    'NFO': 'NFO',
    'CDS': 'CDS',
    'MCX': 'MCX',
    'BFO': 'BFO',
    'NSE_INDEX': 'NSE',
    'BSE_INDEX': 'BSE',
    'MCX_INDEX': 'MCX'
  }
};
