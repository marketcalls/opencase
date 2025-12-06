/**
 * Zerodha Kite Connect Broker Implementation
 * API Docs: https://kite.trade/docs/connect/v3/
 */

import { BaseBroker } from './base';
import type {
  BrokerType,
  BrokerConfig,
  BrokerSession,
  UnifiedSymbol,
  UnifiedQuote,
  UnifiedLTP,
  UnifiedOrder,
  UnifiedOrderResponse,
  UnifiedHolding,
  UnifiedPosition,
  UnifiedFunds,
  HistoricalCandle,
  INDEX_SYMBOL_MAP
} from './types';

export class ZerodhaBroker extends BaseBroker {
  readonly brokerType: BrokerType = 'zerodha';
  readonly brokerName = 'Zerodha Kite';

  getConfig(): BrokerConfig {
    return {
      baseUrl: 'https://api.kite.trade',
      loginUrl: 'https://kite.zerodha.com/connect/login',
      version: '3'
    };
  }

  getLoginUrl(redirectUrl?: string): string {
    const params = new URLSearchParams({
      api_key: this.apiKey,
      v: '3'
    });
    return `${this.config.loginUrl}?${params.toString()}`;
  }

  async createSession(requestToken: string): Promise<BrokerSession> {
    const checksumInput = this.apiKey + requestToken + this.apiSecret;
    const checksum = await this.sha256(checksumInput);

    const response = await fetch(`${this.config.baseUrl}/session/token`, {
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
    
    return {
      broker: 'zerodha',
      userId: data.data.user_id,
      userName: data.data.user_name || data.data.user_id,
      email: data.data.email,
      accessToken: data.data.access_token,
      refreshToken: data.data.refresh_token
    };
  }

  protected async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this.accessToken) {
      throw new Error('Access token not set. Please login first.');
    }

    const response = await fetch(`${this.config.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'X-Kite-Version': '3',
        'Authorization': `token ${this.apiKey}:${this.accessToken}`,
        ...options.headers
      }
    });

    const data = await response.json() as any;
    
    if (data.status === 'error') {
      throw new Error(data.message || 'API request failed');
    }

    return data.data;
  }

  async downloadMasterContract(): Promise<UnifiedSymbol[]> {
    const response = await fetch(`${this.config.baseUrl}/instruments`, {
      headers: {
        'X-Kite-Version': '3',
        'Authorization': `token ${this.apiKey}:${this.accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to download instruments: ${response.status}`);
    }

    const csvText = await response.text();
    return this.parseZerodhaCsv(csvText);
  }

  private parseZerodhaCsv(csvText: string): UnifiedSymbol[] {
    const lines = csvText.split('\n');
    const headers = lines[0].split(',');
    const symbols: UnifiedSymbol[] = [];

    // Find column indices
    const colIndex: Record<string, number> = {};
    headers.forEach((h, i) => {
      colIndex[h.trim().toLowerCase()] = i;
    });

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = this.parseCSVLine(line);
      if (values.length < headers.length) continue;

      const exchange = values[colIndex['exchange']]?.trim();
      const segment = values[colIndex['segment']]?.trim();
      const instrumentType = values[colIndex['instrument_type']]?.trim();

      // Only include equity and index instruments for now
      if ((exchange === 'NSE' || exchange === 'BSE') && 
          (segment === 'NSE' || segment === 'BSE' || segment === 'INDICES') &&
          (instrumentType === 'EQ' || segment === 'INDICES')) {

        const tradingSymbol = values[colIndex['tradingsymbol']]?.trim() || '';
        const name = values[colIndex['name']]?.trim() || '';
        const expiry = values[colIndex['expiry']]?.trim() || '';

        // Convert to unified symbol format
        const unifiedSymbol = this.toUnifiedSymbol(tradingSymbol, exchange);
        const unifiedExchange = segment === 'INDICES' ? `${exchange}_INDEX` : exchange;

        symbols.push({
          symbol: unifiedSymbol,
          brokerSymbol: tradingSymbol,
          exchange: unifiedExchange,
          brokerExchange: exchange,
          token: `${values[colIndex['instrument_token']]}::::${values[colIndex['exchange_token']]}`,
          name: name,
          instrumentType: segment === 'INDICES' ? 'INDEX' : (instrumentType || 'EQ'),
          lotSize: parseInt(values[colIndex['lot_size']]) || 1,
          tickSize: parseFloat(values[colIndex['tick_size']]) || 0.05,
          expiry: expiry ? this.formatExpiry(expiry) : undefined,
          strike: parseFloat(values[colIndex['strike']]) || undefined
        });
      }
    }

    return symbols;
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    
    return result;
  }

  private formatExpiry(expiry: string): string {
    try {
      const date = new Date(expiry);
      const day = String(date.getDate()).padStart(2, '0');
      const month = date.toLocaleString('en-US', { month: 'short' }).toUpperCase();
      const year = String(date.getFullYear()).slice(-2);
      return `${day}-${month}-${year}`;
    } catch {
      return expiry;
    }
  }

  toUnifiedSymbol(brokerSymbol: string, exchange: string): string {
    // Handle common index symbols
    const indexMap: Record<string, string> = {
      'NIFTY 50': 'NIFTY',
      'NIFTY NEXT 50': 'NIFTYNXT50',
      'NIFTY FIN SERVICE': 'FINNIFTY',
      'NIFTY BANK': 'BANKNIFTY',
      'NIFTY MID SELECT': 'MIDCPNIFTY',
      'INDIA VIX': 'INDIAVIX'
    };

    if (indexMap[brokerSymbol]) {
      return indexMap[brokerSymbol];
    }

    // For equity, symbol is same
    return brokerSymbol;
  }

  toBrokerSymbol(unifiedSymbol: string, exchange: string): string {
    // Reverse mapping for indices
    const reverseIndexMap: Record<string, string> = {
      'NIFTY': 'NIFTY 50',
      'NIFTYNXT50': 'NIFTY NEXT 50',
      'FINNIFTY': 'NIFTY FIN SERVICE',
      'BANKNIFTY': 'NIFTY BANK',
      'MIDCPNIFTY': 'NIFTY MID SELECT',
      'INDIAVIX': 'INDIA VIX'
    };

    if (reverseIndexMap[unifiedSymbol]) {
      return reverseIndexMap[unifiedSymbol];
    }

    return unifiedSymbol;
  }

  async getQuotes(symbols: Array<{ symbol: string; exchange: string }>): Promise<Record<string, UnifiedQuote>> {
    if (symbols.length === 0) return {};
    
    const instruments = symbols.map(s => `${s.exchange}:${this.toBrokerSymbol(s.symbol, s.exchange)}`);
    const params = instruments.map(i => `i=${encodeURIComponent(i)}`).join('&');
    const data = await this.request<Record<string, any>>(`/quote?${params}`);
    
    const result: Record<string, UnifiedQuote> = {};
    for (const [key, quote] of Object.entries(data)) {
      const [exchange, brokerSymbol] = key.split(':');
      const unifiedSymbol = this.toUnifiedSymbol(brokerSymbol, exchange);
      const unifiedKey = `${exchange}:${unifiedSymbol}`;
      
      result[unifiedKey] = {
        symbol: unifiedSymbol,
        exchange,
        lastPrice: quote.last_price,
        open: quote.ohlc?.open || 0,
        high: quote.ohlc?.high || 0,
        low: quote.ohlc?.low || 0,
        close: quote.ohlc?.close || 0,
        volume: quote.volume || 0,
        change: quote.net_change || (quote.last_price - (quote.ohlc?.close || quote.last_price)),
        changePercent: ((quote.last_price - (quote.ohlc?.close || quote.last_price)) / (quote.ohlc?.close || quote.last_price)) * 100,
        timestamp: new Date(quote.last_trade_time || Date.now())
      };
    }
    
    return result;
  }

  async getLTP(symbols: Array<{ symbol: string; exchange: string }>): Promise<Record<string, UnifiedLTP>> {
    if (symbols.length === 0) return {};
    
    const instruments = symbols.map(s => `${s.exchange}:${this.toBrokerSymbol(s.symbol, s.exchange)}`);
    const params = instruments.map(i => `i=${encodeURIComponent(i)}`).join('&');
    const data = await this.request<Record<string, any>>(`/quote/ltp?${params}`);
    
    const result: Record<string, UnifiedLTP> = {};
    for (const [key, quote] of Object.entries(data)) {
      const [exchange, brokerSymbol] = key.split(':');
      const unifiedSymbol = this.toUnifiedSymbol(brokerSymbol, exchange);
      const unifiedKey = `${exchange}:${unifiedSymbol}`;
      
      result[unifiedKey] = {
        symbol: unifiedSymbol,
        exchange,
        lastPrice: quote.last_price
      };
    }
    
    return result;
  }

  async getHistoricalData(
    symbol: string,
    exchange: string,
    fromDate: Date,
    toDate: Date,
    interval: string = 'day'
  ): Promise<HistoricalCandle[]> {
    // Need instrument token for historical API
    // For now, return empty - needs token lookup from master contract
    const brokerSymbol = this.toBrokerSymbol(symbol, exchange);
    
    // Format dates
    const from = fromDate.toISOString().split('T')[0];
    const to = toDate.toISOString().split('T')[0];
    
    // Would need to lookup token from database
    // const token = await lookupToken(brokerSymbol, exchange);
    // const data = await this.request(`/instruments/historical/${token}/${interval}?from=${from}&to=${to}`);
    
    return [];
  }

  async placeOrder(order: UnifiedOrder): Promise<UnifiedOrderResponse> {
    const variety = order.variety || 'regular';
    const body = new URLSearchParams();
    
    const brokerSymbol = this.toBrokerSymbol(order.symbol, order.exchange);
    
    body.append('tradingsymbol', brokerSymbol);
    body.append('exchange', order.exchange);
    body.append('transaction_type', order.transactionType);
    body.append('order_type', order.orderType);
    body.append('quantity', order.quantity.toString());
    body.append('product', order.product);
    
    if (order.price) body.append('price', order.price.toString());
    if (order.triggerPrice) body.append('trigger_price', order.triggerPrice.toString());
    if (order.validity) body.append('validity', order.validity);
    if (order.tag) body.append('tag', order.tag);

    const data = await this.request<{ order_id: string }>(`/orders/${variety}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    return {
      orderId: data.order_id,
      status: 'PLACED'
    };
  }

  async modifyOrder(orderId: string, order: Partial<UnifiedOrder>): Promise<UnifiedOrderResponse> {
    const variety = order.variety || 'regular';
    const body = new URLSearchParams();
    
    if (order.orderType) body.append('order_type', order.orderType);
    if (order.quantity) body.append('quantity', order.quantity.toString());
    if (order.price) body.append('price', order.price.toString());
    if (order.triggerPrice) body.append('trigger_price', order.triggerPrice.toString());
    if (order.validity) body.append('validity', order.validity);

    const data = await this.request<{ order_id: string }>(`/orders/${variety}/${orderId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    return {
      orderId: data.order_id,
      status: 'MODIFIED'
    };
  }

  async cancelOrder(orderId: string, variety: string = 'regular'): Promise<UnifiedOrderResponse> {
    const data = await this.request<{ order_id: string }>(`/orders/${variety}/${orderId}`, {
      method: 'DELETE'
    });

    return {
      orderId: data.order_id,
      status: 'CANCELLED'
    };
  }

  async getOrders(): Promise<any[]> {
    return this.request('/orders');
  }

  async getHoldings(): Promise<UnifiedHolding[]> {
    const data = await this.request<any[]>('/portfolio/holdings');
    
    return data.map(holding => ({
      symbol: this.toUnifiedSymbol(holding.tradingsymbol, holding.exchange),
      exchange: holding.exchange,
      quantity: holding.quantity,
      averagePrice: holding.average_price,
      lastPrice: holding.last_price,
      pnl: holding.pnl,
      pnlPercent: ((holding.last_price - holding.average_price) / holding.average_price) * 100,
      value: holding.quantity * holding.last_price
    }));
  }

  async getPositions(): Promise<UnifiedPosition[]> {
    const data = await this.request<{ net: any[]; day: any[] }>('/portfolio/positions');
    
    return data.net.map(position => ({
      symbol: this.toUnifiedSymbol(position.tradingsymbol, position.exchange),
      exchange: position.exchange,
      quantity: position.quantity,
      averagePrice: position.average_price,
      lastPrice: position.last_price,
      pnl: position.pnl,
      product: position.product,
      overnight: position.overnight_quantity > 0
    }));
  }

  async getFunds(): Promise<UnifiedFunds> {
    const data = await this.request<any>('/user/margins');
    
    return {
      availableCash: data.equity?.available?.cash || 0,
      usedMargin: data.equity?.utilised?.debits || 0,
      totalBalance: data.equity?.net || 0,
      collateral: data.equity?.available?.collateral || 0
    };
  }

  async getProfile(): Promise<any> {
    return this.request('/user/profile');
  }
}
