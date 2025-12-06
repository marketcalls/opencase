/**
 * Broker Module Exports
 * 
 * This module provides a unified interface for multiple broker integrations.
 * Currently supports:
 * - Zerodha Kite Connect API
 * - Angel One Smart API
 */

// Types
export type {
  BrokerType,
  BrokerCredentials,
  BrokerClient,
  UserProfile,
  Holdings,
  Holding,
  Position,
  Order,
  OrderParams,
  Quote,
  LTPData,
  Instrument,
  InstrumentDownloadResult,
  OrderResponse,
  MarginData,
  GTTOrder,
  GTTOrderParams
} from './types';

// Base implementation
export { BaseBroker } from './base';

// Broker implementations
export { ZerodhaBroker } from './zerodha';
export { AngelOneBroker } from './angelone';

// Factory and utilities
export {
  createBrokerClient,
  getSupportedBrokers,
  validateBrokerCredentials,
  getBrokerDisplayName,
  getBrokerLoginUrl,
  supportsOAuthLogin,
  getBrokerRequirements
} from './factory';

/**
 * Default encryption key for credentials
 * In production, this should come from environment variables
 */
export const DEFAULT_ENCRYPTION_KEY = 'stockbasket-default-key-32chars!';

/**
 * Broker-specific exchange mappings
 */
export const EXCHANGE_MAPPINGS: Record<string, { zerodha: string; angelone: string }> = {
  'NSE': { zerodha: 'NSE', angelone: 'NSE' },
  'BSE': { zerodha: 'BSE', angelone: 'BSE' },
  'NFO': { zerodha: 'NFO', angelone: 'NFO' },
  'BFO': { zerodha: 'BFO', angelone: 'BFO' },
  'MCX': { zerodha: 'MCX', angelone: 'MCX' },
  'CDS': { zerodha: 'CDS', angelone: 'CDS' }
};

/**
 * Convert exchange from one broker format to another
 */
export function convertExchange(
  exchange: string,
  fromBroker: 'zerodha' | 'angelone',
  toBroker: 'zerodha' | 'angelone'
): string {
  // Currently exchanges are same across brokers
  return exchange;
}

/**
 * Standard trading symbol format
 * Format: SYMBOL:EXCHANGE (e.g., RELIANCE:NSE)
 */
export function formatTradingSymbol(symbol: string, exchange: string): string {
  return `${symbol}:${exchange}`;
}

/**
 * Parse trading symbol to extract symbol and exchange
 */
export function parseTradingSymbol(formattedSymbol: string): { symbol: string; exchange: string } {
  const [symbol, exchange = 'NSE'] = formattedSymbol.split(':');
  return { symbol, exchange };
}

/**
 * Check if a symbol is an index
 */
export function isIndex(symbol: string): boolean {
  const indices = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'NIFTY50', 'SENSEX'];
  const upperSymbol = symbol.toUpperCase();
  return indices.some(idx => upperSymbol.includes(idx));
}

/**
 * Get lot size for F&O instruments
 */
export function getLotSize(symbol: string): number {
  const lotSizes: Record<string, number> = {
    'NIFTY': 50,
    'BANKNIFTY': 15,
    'FINNIFTY': 40,
    'MIDCPNIFTY': 75
  };
  return lotSizes[symbol.toUpperCase()] || 1;
}
