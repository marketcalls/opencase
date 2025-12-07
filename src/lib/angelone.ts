/**
 * AngelOne Smart API Client
 * Handles all interactions with AngelOne API including direct order placement
 * Based on OpenAlgo implementation
 */

const ANGELONE_API_BASE = 'https://apiconnect.angelbroking.com';

export interface AngelOneOrder {
  variety?: string;
  tradingsymbol: string;
  symboltoken: string;
  exchange: string;
  transaction_type: 'BUY' | 'SELL';
  order_type: 'MARKET' | 'LIMIT' | 'STOPLOSS_LIMIT' | 'STOPLOSS_MARKET';
  quantity: number;
  product: string;
  price?: number;
  trigger_price?: number;
  duration?: string;
  tag?: string;
}

export interface AngelOneOrderResponse {
  orderid: string;
}

export interface AngelOneLTP {
  exchange: string;
  tradingsymbol: string;
  symboltoken: string;
  ltp: number;
}

export class AngelOneClient {
  private apiKey: string;
  private accessToken: string;

  constructor(apiKey: string, accessToken: string) {
    this.apiKey = apiKey;
    this.accessToken = accessToken;
  }

  /**
   * Get standard headers for AngelOne API requests
   */
  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-UserType': 'USER',
      'X-SourceID': 'WEB',
      'X-ClientLocalIP': 'CLIENT_LOCAL_IP',
      'X-ClientPublicIP': 'CLIENT_PUBLIC_IP',
      'X-MACAddress': 'MAC_ADDRESS',
      'X-PrivateKey': this.apiKey
    };
  }

  /**
   * Make authenticated API request
   */
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${ANGELONE_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...options.headers
      }
    });

    const data = await response.json() as any;

    if (data.status !== true && data.message !== 'SUCCESS') {
      throw new Error(data.message || 'API request failed');
    }

    return data.data;
  }

  /**
   * Map product type from standard to AngelOne format
   */
  private mapProductType(product: string): string {
    const productMap: Record<string, string> = {
      'CNC': 'DELIVERY',
      'MIS': 'INTRADAY',
      'NRML': 'CARRYFORWARD'
    };
    return productMap[product] || 'DELIVERY';
  }

  /**
   * Map order type from standard to AngelOne format
   */
  private mapOrderType(orderType: string): string {
    const orderTypeMap: Record<string, string> = {
      'MARKET': 'MARKET',
      'LIMIT': 'LIMIT',
      'SL': 'STOPLOSS_LIMIT',
      'SL-M': 'STOPLOSS_MARKET'
    };
    return orderTypeMap[orderType] || 'MARKET';
  }

  /**
   * Map variety based on order type
   */
  private mapVariety(orderType: string): string {
    const varietyMap: Record<string, string> = {
      'MARKET': 'NORMAL',
      'LIMIT': 'NORMAL',
      'SL': 'STOPLOSS',
      'SL-M': 'STOPLOSS',
      'STOPLOSS_LIMIT': 'STOPLOSS',
      'STOPLOSS_MARKET': 'STOPLOSS'
    };
    return varietyMap[orderType] || 'NORMAL';
  }

  /**
   * Get LTP for instruments using AngelOne Quote API
   * Based on OpenAlgo data.py implementation
   * @param instruments Array of { exchange, tradingsymbol, symboltoken }
   */
  async getLTP(instruments: Array<{ exchange: string; tradingsymbol: string; symboltoken: string }>): Promise<Record<string, { last_price: number }>> {
    if (instruments.length === 0) return {};

    const result: Record<string, { last_price: number }> = {};

    // Build exchangeTokens object: { "NSE": ["token1", "token2"], "BSE": ["token3"] }
    const exchangeTokens: Record<string, string[]> = {};
    const tokenToSymbolMap: Record<string, string> = {}; // Map token to tradingsymbol for response parsing

    for (const inst of instruments) {
      if (!inst.symboltoken) {
        console.warn(`Missing symboltoken for ${inst.tradingsymbol}`);
        continue;
      }

      const exchange = inst.exchange;
      if (!exchangeTokens[exchange]) {
        exchangeTokens[exchange] = [];
      }
      exchangeTokens[exchange].push(inst.symboltoken);

      // Store mapping for response parsing
      tokenToSymbolMap[`${exchange}:${inst.symboltoken}`] = inst.tradingsymbol;
    }

    if (Object.keys(exchangeTokens).length === 0) {
      console.warn('No valid instruments with tokens to fetch LTP');
      return result;
    }

    // Prepare payload exactly as OpenAlgo does
    const payload = {
      mode: 'LTP',
      exchangeTokens: exchangeTokens
    };

    console.log('AngelOne LTP request payload:', JSON.stringify(payload, null, 2));

    try {
      const response = await fetch(`${ANGELONE_API_BASE}/rest/secure/angelbroking/market/v1/quote/`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload)
      });

      const responseText = await response.text();
      console.log('AngelOne LTP raw response:', responseText.substring(0, 500));

      if (!responseText) {
        throw new Error('Empty response from AngelOne LTP API');
      }

      const data = JSON.parse(responseText) as any;

      if (!data.status) {
        throw new Error(data.message || 'Failed to fetch LTP');
      }

      // Parse fetched data
      const fetchedData = data.data?.fetched || [];
      console.log(`AngelOne LTP: Fetched ${fetchedData.length} quotes`);

      for (const quote of fetchedData) {
        const exchange = quote.exchange;
        const symbolToken = quote.symbolToken || quote.symboltoken;
        const tradingSymbol = quote.tradingSymbol || quote.tradingsymbol || tokenToSymbolMap[`${exchange}:${symbolToken}`];

        if (tradingSymbol && quote.ltp !== undefined) {
          const key = `${exchange}:${tradingSymbol}`;
          result[key] = { last_price: parseFloat(quote.ltp) };
          console.log(`  ${key} = ${quote.ltp}`);
        }
      }

      // Log unfetched if any
      const unfetchedData = data.data?.unfetched || [];
      if (unfetchedData.length > 0) {
        console.warn('AngelOne LTP unfetched:', unfetchedData);
      }

    } catch (error) {
      console.error('Failed to fetch LTP from AngelOne:', error);
      throw error;
    }

    return result;
  }

  /**
   * Place a single order directly via API
   */
  async placeOrder(order: AngelOneOrder): Promise<AngelOneOrderResponse> {
    const variety = order.variety || this.mapVariety(order.order_type);

    const payload = {
      variety: variety,
      tradingsymbol: order.tradingsymbol,
      symboltoken: order.symboltoken,
      transactiontype: order.transaction_type,
      exchange: order.exchange,
      ordertype: this.mapOrderType(order.order_type),
      producttype: this.mapProductType(order.product),
      duration: order.duration || 'DAY',
      price: order.price?.toString() || '0',
      triggerprice: order.trigger_price?.toString() || '0',
      squareoff: '0',
      stoploss: '0',
      quantity: order.quantity.toString()
    };

    console.log('AngelOne order payload:', JSON.stringify(payload, null, 2));

    const response = await fetch(`${ANGELONE_API_BASE}/rest/secure/angelbroking/order/v1/placeOrder`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload)
    });

    const data = await response.json() as any;
    console.log('AngelOne order response:', JSON.stringify(data, null, 2));

    if (data.status !== true) {
      throw new Error(data.message || 'Failed to place order');
    }

    return {
      orderid: data.data.orderid
    };
  }

  /**
   * Place multiple orders directly via API
   */
  async placeMultipleOrders(orders: AngelOneOrder[]): Promise<Array<{ order: AngelOneOrder; result: AngelOneOrderResponse | null; error: string | null }>> {
    const results: Array<{ order: AngelOneOrder; result: AngelOneOrderResponse | null; error: string | null }> = [];

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
   * Get order book
   */
  async getOrders(): Promise<any[]> {
    return this.request('/rest/secure/angelbroking/order/v1/getOrderBook');
  }

  /**
   * Get holdings
   */
  async getHoldings(): Promise<any[]> {
    return this.request('/rest/secure/angelbroking/portfolio/v1/getAllHolding');
  }

  /**
   * Get positions
   */
  async getPositions(): Promise<any[]> {
    return this.request('/rest/secure/angelbroking/order/v1/getPosition');
  }

  /**
   * Get funds/RMS
   */
  async getFunds(): Promise<any> {
    return this.request('/rest/secure/angelbroking/user/v1/getRMS');
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string, variety: string = 'NORMAL'): Promise<any> {
    return this.request('/rest/secure/angelbroking/order/v1/cancelOrder', {
      method: 'POST',
      body: JSON.stringify({
        variety: variety,
        orderid: orderId
      })
    });
  }

  /**
   * Calculate order quantities for basket investment
   * Similar to KiteClient but includes symboltoken
   */
  calculateBasketOrders(
    stocks: Array<{ trading_symbol: string; exchange: string; weight_percentage: number; symbol_token: string }>,
    prices: Record<string, { last_price: number }>,
    investmentAmount: number
  ): { orders: AngelOneOrder[]; totalAmount: number; unusedAmount: number } {
    const orders: AngelOneOrder[] = [];
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
          variety: 'NORMAL',
          tradingsymbol: stock.trading_symbol,
          symboltoken: stock.symbol_token,
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
    holdings: Array<{ trading_symbol: string; exchange: string; quantity: number; target_weight: number; symbol_token: string }>,
    prices: Record<string, { last_price: number }>,
    totalValue: number,
    threshold: number = 5
  ): { orders: AngelOneOrder[]; buyAmount: number; sellAmount: number } {
    const orders: AngelOneOrder[] = [];
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
            sellAmount += quantityDiff * priceData.last_price;
            orders.push({
              variety: 'NORMAL',
              tradingsymbol: holding.trading_symbol,
              symboltoken: holding.symbol_token,
              exchange: holding.exchange,
              transaction_type: 'SELL',
              order_type: 'MARKET',
              quantity: Math.min(quantityDiff, holding.quantity),
              product: 'CNC'
            });
          } else {
            buyAmount += quantityDiff * priceData.last_price;
            orders.push({
              variety: 'NORMAL',
              tradingsymbol: holding.trading_symbol,
              symboltoken: holding.symbol_token,
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
   * Check if client has access token
   */
  hasAccessToken(): boolean {
    return !!this.accessToken;
  }
}

/**
 * Create AngelOneClient from credentials
 */
export function createAngelOneClient(apiKey: string, accessToken: string): AngelOneClient {
  return new AngelOneClient(apiKey, accessToken);
}
