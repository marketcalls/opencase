/**
 * Base Broker Interface
 * All broker implementations must follow this interface
 */

import type {
  BrokerType,
  BrokerConfig,
  BrokerCredentials,
  BrokerSession,
  UnifiedSymbol,
  UnifiedQuote,
  UnifiedLTP,
  UnifiedOrder,
  UnifiedOrderResponse,
  UnifiedHolding,
  UnifiedPosition,
  UnifiedFunds,
  HistoricalCandle
} from './types';

export abstract class BaseBroker {
  protected apiKey: string;
  protected apiSecret: string;
  protected accessToken: string | null = null;
  protected config: BrokerConfig;
  
  abstract readonly brokerType: BrokerType;
  abstract readonly brokerName: string;

  constructor(apiKey: string, apiSecret: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.config = this.getConfig();
  }

  /**
   * Get broker-specific configuration
   */
  abstract getConfig(): BrokerConfig;

  /**
   * Generate login URL for OAuth flow
   */
  abstract getLoginUrl(redirectUrl?: string): string;

  /**
   * Create session from callback data
   */
  abstract createSession(requestToken: string, ...args: any[]): Promise<BrokerSession>;

  /**
   * Download and process master contract
   * Returns unified symbol list
   */
  abstract downloadMasterContract(): Promise<UnifiedSymbol[]>;

  /**
   * Convert broker symbol to unified format
   */
  abstract toUnifiedSymbol(brokerSymbol: string, exchange: string): string;

  /**
   * Convert unified symbol to broker format
   */
  abstract toBrokerSymbol(unifiedSymbol: string, exchange: string): string;

  /**
   * Get quotes for symbols
   */
  abstract getQuotes(symbols: Array<{ symbol: string; exchange: string }>): Promise<Record<string, UnifiedQuote>>;

  /**
   * Get LTP for symbols
   */
  abstract getLTP(symbols: Array<{ symbol: string; exchange: string }>): Promise<Record<string, UnifiedLTP>>;

  /**
   * Get historical data
   */
  abstract getHistoricalData(
    symbol: string,
    exchange: string,
    fromDate: Date,
    toDate: Date,
    interval: string
  ): Promise<HistoricalCandle[]>;

  /**
   * Place an order
   */
  abstract placeOrder(order: UnifiedOrder): Promise<UnifiedOrderResponse>;

  /**
   * Place multiple orders
   */
  async placeMultipleOrders(orders: UnifiedOrder[]): Promise<Array<{ order: UnifiedOrder; result: UnifiedOrderResponse | null; error: string | null }>> {
    const results: Array<{ order: UnifiedOrder; result: UnifiedOrderResponse | null; error: string | null }> = [];
    
    for (const order of orders) {
      try {
        const result = await this.placeOrder(order);
        results.push({ order, result, error: null });
      } catch (error) {
        results.push({ order, result: null, error: (error as Error).message });
      }
      
      // Add small delay between orders to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return results;
  }

  /**
   * Modify an order
   */
  abstract modifyOrder(orderId: string, order: Partial<UnifiedOrder>): Promise<UnifiedOrderResponse>;

  /**
   * Cancel an order
   */
  abstract cancelOrder(orderId: string): Promise<UnifiedOrderResponse>;

  /**
   * Get all orders for the day
   */
  abstract getOrders(): Promise<any[]>;

  /**
   * Get holdings
   */
  abstract getHoldings(): Promise<UnifiedHolding[]>;

  /**
   * Get positions
   */
  abstract getPositions(): Promise<UnifiedPosition[]>;

  /**
   * Get funds/margins
   */
  abstract getFunds(): Promise<UnifiedFunds>;

  /**
   * Get user profile
   */
  abstract getProfile(): Promise<any>;

  /**
   * Set access token
   */
  setAccessToken(token: string): void {
    this.accessToken = token;
  }

  /**
   * Get access token
   */
  getAccessToken(): string | null {
    return this.accessToken;
  }

  /**
   * Check if authenticated
   */
  hasAccessToken(): boolean {
    return !!this.accessToken;
  }

  /**
   * Get API key
   */
  getApiKey(): string {
    return this.apiKey;
  }

  /**
   * SHA256 hash helper
   */
  protected async sha256(message: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Make authenticated API request
   */
  protected abstract request<T>(endpoint: string, options?: RequestInit): Promise<T>;

  /**
   * Calculate basket orders for investment
   */
  calculateBasketOrders(
    stocks: Array<{ symbol: string; exchange: string; weightPercentage: number }>,
    prices: Record<string, { lastPrice: number }>,
    investmentAmount: number
  ): { orders: UnifiedOrder[]; totalAmount: number; unusedAmount: number; shares: Record<string, number> } {
    const orders: UnifiedOrder[] = [];
    let totalAmount = 0;
    const shares: Record<string, number> = {};

    for (const stock of stocks) {
      const key = `${stock.exchange}:${stock.symbol}`;
      const priceData = prices[key];
      
      if (!priceData) continue;

      const allocation = (investmentAmount * stock.weightPercentage) / 100;
      const quantity = Math.floor(allocation / priceData.lastPrice);
      
      shares[key] = quantity;
      
      if (quantity > 0) {
        const amount = quantity * priceData.lastPrice;
        totalAmount += amount;
        
        orders.push({
          symbol: stock.symbol,
          exchange: stock.exchange,
          transactionType: 'BUY',
          orderType: 'MARKET',
          quantity: quantity,
          product: 'CNC'
        });
      }
    }

    return {
      orders,
      totalAmount,
      unusedAmount: investmentAmount - totalAmount,
      shares
    };
  }

  /**
   * Calculate minimum investment amount for a basket
   */
  calculateMinInvestment(
    stocks: Array<{ symbol: string; exchange: string; weightPercentage: number }>,
    prices: Record<string, { lastPrice: number }>
  ): number {
    let minInvestment = 0;

    for (const stock of stocks) {
      const key = `${stock.exchange}:${stock.symbol}`;
      const priceData = prices[key];
      
      if (priceData) {
        // Minimum 1 share of each stock
        const minForStock = (priceData.lastPrice / stock.weightPercentage) * 100;
        minInvestment = Math.max(minInvestment, minForStock);
      }
    }

    return Math.ceil(minInvestment);
  }

  /**
   * Calculate rebalance orders
   */
  calculateRebalanceOrders(
    holdings: Array<{ symbol: string; exchange: string; quantity: number; targetWeight: number }>,
    prices: Record<string, { lastPrice: number }>,
    totalValue: number,
    threshold: number = 5
  ): { orders: UnifiedOrder[]; buyAmount: number; sellAmount: number } {
    const orders: UnifiedOrder[] = [];
    let buyAmount = 0;
    let sellAmount = 0;

    for (const holding of holdings) {
      const key = `${holding.exchange}:${holding.symbol}`;
      const priceData = prices[key];
      
      if (!priceData) continue;

      const currentValue = holding.quantity * priceData.lastPrice;
      const actualWeight = (currentValue / totalValue) * 100;
      const deviation = actualWeight - holding.targetWeight;

      if (Math.abs(deviation) > threshold) {
        const targetValue = (holding.targetWeight / 100) * totalValue;
        const valueDiff = targetValue - currentValue;
        const quantityDiff = Math.floor(Math.abs(valueDiff) / priceData.lastPrice);

        if (quantityDiff > 0) {
          if (deviation > 0) {
            // Over-allocated, need to sell
            sellAmount += quantityDiff * priceData.lastPrice;
            orders.push({
              symbol: holding.symbol,
              exchange: holding.exchange,
              transactionType: 'SELL',
              orderType: 'MARKET',
              quantity: Math.min(quantityDiff, holding.quantity),
              product: 'CNC'
            });
          } else {
            // Under-allocated, need to buy
            buyAmount += quantityDiff * priceData.lastPrice;
            orders.push({
              symbol: holding.symbol,
              exchange: holding.exchange,
              transactionType: 'BUY',
              orderType: 'MARKET',
              quantity: quantityDiff,
              product: 'CNC'
            });
          }
        }
      }
    }

    return { orders, buyAmount, sellAmount };
  }
}
