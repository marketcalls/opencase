/**
 * Zerodha Kite Connect API Client
 * Handles all interactions with Kite API
 */

import type { KiteSession, KiteQuote, KiteLTP, KiteHolding, KiteOrder } from '../types';

const KITE_API_BASE = 'https://api.kite.trade';
const KITE_LOGIN_URL = 'https://kite.zerodha.com/connect/login';
const KITE_BASKET_URL = 'https://kite.zerodha.com/connect/basket';

export class KiteClient {
  private apiKey: string;
  private apiSecret: string;
  private accessToken: string | null;

  constructor(apiKey: string, apiSecret: string, accessToken?: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.accessToken = accessToken || null;
  }

  /**
   * Generate login URL for OAuth flow
   */
  getLoginUrl(): string {
    const params = new URLSearchParams({
      api_key: this.apiKey,
      v: '3'
    });
    return `${KITE_LOGIN_URL}?${params.toString()}`;
  }

  /**
   * Exchange request token for access token
   */
  async createSession(requestToken: string): Promise<KiteSession> {
    const checksumInput = this.apiKey + requestToken + this.apiSecret;
    const checksum = await this.sha256(checksumInput);

    const response = await fetch(`${KITE_API_BASE}/session/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Kite-Version': '3'
      },
      body: new URLSearchParams({
        api_key: this.apiKey,
        request_token: requestToken,
        checksum: checksum
      })
    });

    const data = await response.json() as any;
    
    if (data.status === 'error') {
      throw new Error(data.message || 'Failed to create session');
    }

    this.accessToken = data.data.access_token;
    return data.data;
  }

  /**
   * Get authorization header
   */
  private getAuthHeader(): string {
    if (!this.accessToken) {
      throw new Error('Access token not set. Please login first.');
    }
    return `token ${this.apiKey}:${this.accessToken}`;
  }

  /**
   * Make authenticated API request
   */
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${KITE_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'X-Kite-Version': '3',
        'Authorization': this.getAuthHeader(),
        ...options.headers
      }
    });

    const data = await response.json() as any;
    
    if (data.status === 'error') {
      throw new Error(data.message || 'API request failed');
    }

    return data.data;
  }

  /**
   * Get user profile
   */
  async getProfile(): Promise<any> {
    return this.request('/user/profile');
  }

  /**
   * Get user's equity holdings
   */
  async getHoldings(): Promise<KiteHolding[]> {
    return this.request('/portfolio/holdings');
  }

  /**
   * Get user's positions
   */
  async getPositions(): Promise<{ net: any[]; day: any[] }> {
    return this.request('/portfolio/positions');
  }

  /**
   * Get market quotes for instruments
   * @param instruments Array of exchange:tradingsymbol (e.g., ['NSE:INFY', 'NSE:TCS'])
   */
  async getQuotes(instruments: string[]): Promise<Record<string, KiteQuote>> {
    if (instruments.length === 0) return {};
    const params = instruments.map(i => `i=${encodeURIComponent(i)}`).join('&');
    return this.request(`/quote?${params}`);
  }

  /**
   * Get LTP for instruments
   * @param instruments Array of exchange:tradingsymbol
   */
  async getLTP(instruments: string[]): Promise<Record<string, KiteLTP>> {
    if (instruments.length === 0) return {};
    const params = instruments.map(i => `i=${encodeURIComponent(i)}`).join('&');
    return this.request(`/quote/ltp?${params}`);
  }

  /**
   * Get OHLC for instruments
   */
  async getOHLC(instruments: string[]): Promise<Record<string, any>> {
    if (instruments.length === 0) return {};
    const params = instruments.map(i => `i=${encodeURIComponent(i)}`).join('&');
    return this.request(`/quote/ohlc?${params}`);
  }

  /**
   * Place a single order
   */
  async placeOrder(order: KiteOrder): Promise<{ order_id: string }> {
    const variety = order.variety || 'regular';
    const body = new URLSearchParams();
    
    body.append('tradingsymbol', order.tradingsymbol);
    body.append('exchange', order.exchange);
    body.append('transaction_type', order.transaction_type);
    body.append('order_type', order.order_type);
    body.append('quantity', order.quantity.toString());
    body.append('product', order.product);
    
    if (order.price) body.append('price', order.price.toString());
    if (order.trigger_price) body.append('trigger_price', order.trigger_price.toString());
    if (order.validity) body.append('validity', order.validity);
    if (order.tag) body.append('tag', order.tag);

    return this.request(`/orders/${variety}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });
  }

  /**
   * Get all orders for the day
   */
  async getOrders(): Promise<any[]> {
    return this.request('/orders');
  }

  /**
   * Get order history
   */
  async getOrderHistory(orderId: string): Promise<any[]> {
    return this.request(`/orders/${orderId}`);
  }

  /**
   * Get user margins
   */
  async getMargins(): Promise<any> {
    return this.request('/user/margins');
  }

  /**
   * Get available funds (equity segment)
   */
  async getAvailableFunds(): Promise<number> {
    const margins = await this.getMargins();
    return margins.equity?.available?.cash || 0;
  }

  /**
   * Generate basket order data for offsite execution
   * Returns form data to be POSTed to Kite
   */
  generateBasketOrderData(orders: KiteOrder[]): { url: string; formData: { api_key: string; data: string } } {
    const basketOrders = orders.map(order => ({
      variety: order.variety || 'regular',
      tradingsymbol: order.tradingsymbol,
      exchange: order.exchange,
      transaction_type: order.transaction_type,
      order_type: order.order_type,
      quantity: order.quantity,
      product: order.product,
      price: order.price || 0,
      readonly: order.readonly ?? false
    }));

    return {
      url: KITE_BASKET_URL,
      formData: {
        api_key: this.apiKey,
        data: JSON.stringify(basketOrders)
      }
    };
  }

  /**
   * Calculate order quantities for basket investment
   */
  calculateBasketOrders(
    stocks: Array<{ trading_symbol: string; exchange: string; weight_percentage: number }>,
    prices: Record<string, { last_price: number }>,
    investmentAmount: number
  ): { orders: KiteOrder[]; totalAmount: number; unusedAmount: number } {
    const orders: KiteOrder[] = [];
    let totalAmount = 0;

    for (const stock of stocks) {
      const key = `${stock.exchange}:${stock.trading_symbol}`;
      const priceData = prices[key];
      
      if (!priceData) continue;

      const allocation = (investmentAmount * stock.weight_percentage) / 100;
      const quantity = Math.floor(allocation / priceData.last_price);
      
      if (quantity > 0) {
        const amount = quantity * priceData.last_price;
        totalAmount += amount;
        
        orders.push({
          variety: 'regular',
          tradingsymbol: stock.trading_symbol,
          exchange: stock.exchange,
          transaction_type: 'BUY',
          order_type: 'MARKET',
          quantity: quantity,
          product: 'CNC'
        });
      }
    }

    return {
      orders,
      totalAmount,
      unusedAmount: investmentAmount - totalAmount
    };
  }

  /**
   * Calculate rebalance orders
   */
  calculateRebalanceOrders(
    holdings: Array<{ trading_symbol: string; exchange: string; quantity: number; target_weight: number }>,
    prices: Record<string, { last_price: number }>,
    totalValue: number,
    threshold: number = 5 // deviation threshold percentage
  ): { orders: KiteOrder[]; buyAmount: number; sellAmount: number } {
    const orders: KiteOrder[] = [];
    let buyAmount = 0;
    let sellAmount = 0;

    for (const holding of holdings) {
      const key = `${holding.exchange}:${holding.trading_symbol}`;
      const priceData = prices[key];
      
      if (!priceData) continue;

      const currentValue = holding.quantity * priceData.last_price;
      const actualWeight = (currentValue / totalValue) * 100;
      const deviation = actualWeight - holding.target_weight;

      if (Math.abs(deviation) > threshold) {
        const targetValue = (holding.target_weight / 100) * totalValue;
        const valueDiff = targetValue - currentValue;
        const quantityDiff = Math.floor(Math.abs(valueDiff) / priceData.last_price);

        if (quantityDiff > 0) {
          if (deviation > 0) {
            // Over-allocated, need to sell
            sellAmount += quantityDiff * priceData.last_price;
            orders.push({
              variety: 'regular',
              tradingsymbol: holding.trading_symbol,
              exchange: holding.exchange,
              transaction_type: 'SELL',
              order_type: 'MARKET',
              quantity: Math.min(quantityDiff, holding.quantity),
              product: 'CNC'
            });
          } else {
            // Under-allocated, need to buy
            buyAmount += quantityDiff * priceData.last_price;
            orders.push({
              variety: 'regular',
              tradingsymbol: holding.trading_symbol,
              exchange: holding.exchange,
              transaction_type: 'BUY',
              order_type: 'MARKET',
              quantity: quantityDiff,
              product: 'CNC'
            });
          }
        }
      }
    }

    return { orders, buyAmount, sellAmount };
  }

  /**
   * SHA256 hash helper
   */
  private async sha256(message: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Set access token for authenticated requests
   */
  setAccessToken(token: string): void {
    this.accessToken = token;
  }

  /**
   * Get API key
   */
  getApiKey(): string {
    return this.apiKey;
  }
}

/**
 * Create KiteClient from account credentials
 */
export function createKiteClient(apiKey: string, apiSecret: string, accessToken?: string): KiteClient {
  return new KiteClient(apiKey, apiSecret, accessToken);
}
