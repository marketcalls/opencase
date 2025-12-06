/**
 * AngelOne Smart API Broker Implementation
 * API Docs: https://smartapi.angelbroking.com/docs
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
  HistoricalCandle
} from './types';

export class AngelOneBroker extends BaseBroker {
  readonly brokerType: BrokerType = 'angelone';
  readonly brokerName = 'AngelOne';
  
  private clientId: string = '';
  private jwtToken: string = '';
  private refreshToken: string = '';
  private feedToken: string = '';

  constructor(apiKey: string, apiSecret: string, clientId?: string) {
    super(apiKey, apiSecret);
    if (clientId) {
      this.clientId = clientId;
    }
  }

  getConfig(): BrokerConfig {
    return {
      baseUrl: 'https://apiconnect.angelbroking.com',
      loginUrl: 'https://smartapi.angelbroking.com/publisher-login',
      version: '3'
    };
  }

  getLoginUrl(redirectUrl?: string): string {
    const params = new URLSearchParams({
      api_key: this.apiKey
    });
    if (redirectUrl) {
      params.append('redirect_url', redirectUrl);
    }
    return `${this.config.loginUrl}?${params.toString()}`;
  }

  /**
   * Create session with AngelOne
   * AngelOne uses client ID, password, and TOTP for login
   */
  async createSession(clientId: string, password: string, totp: string): Promise<BrokerSession> {
    this.clientId = clientId;
    
    const response = await fetch(`${this.config.baseUrl}/rest/auth/angelbroking/user/v1/loginByPassword`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-UserType': 'USER',
        'X-SourceID': 'WEB',
        'X-ClientLocalIP': '127.0.0.1',
        'X-ClientPublicIP': '127.0.0.1',
        'X-MACAddress': '00:00:00:00:00:00',
        'X-PrivateKey': this.apiKey
      },
      body: JSON.stringify({
        clientcode: clientId,
        password: password,
        totp: totp
      })
    });

    const data = await response.json() as any;
    
    if (!data.status || data.message !== 'SUCCESS') {
      throw new Error(data.message || 'Failed to create session');
    }

    this.jwtToken = data.data.jwtToken;
    this.refreshToken = data.data.refreshToken;
    this.feedToken = data.data.feedToken;
    this.accessToken = this.jwtToken;

    return {
      broker: 'angelone',
      userId: clientId,
      userName: data.data.name || clientId,
      email: data.data.email,
      accessToken: this.jwtToken,
      refreshToken: this.refreshToken
    };
  }

  protected async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this.jwtToken) {
      throw new Error('Not authenticated. Please login first.');
    }

    const response = await fetch(`${this.config.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-UserType': 'USER',
        'X-SourceID': 'WEB',
        'X-ClientLocalIP': '127.0.0.1',
        'X-ClientPublicIP': '127.0.0.1',
        'X-MACAddress': '00:00:00:00:00:00',
        'X-PrivateKey': this.apiKey,
        'Authorization': `Bearer ${this.jwtToken}`,
        ...options.headers
      }
    });

    const data = await response.json() as any;
    
    if (!data.status || (data.message && data.message !== 'SUCCESS')) {
      throw new Error(data.message || 'API request failed');
    }

    return data.data;
  }

  async downloadMasterContract(): Promise<UnifiedSymbol[]> {
    const url = 'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json';
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download instruments: ${response.status}`);
    }

    const data = await response.json() as any[];
    return this.parseAngelMasterContract(data);
  }

  private parseAngelMasterContract(data: any[]): UnifiedSymbol[] {
    const symbols: UnifiedSymbol[] = [];

    for (const item of data) {
      const exchange = item.exch_seg;
      const instrumentType = item.instrumenttype;

      // Only include equity and index for now
      if ((exchange === 'NSE' || exchange === 'BSE') && 
          (instrumentType === 'EQ' || instrumentType === 'AMXIDX' || !instrumentType)) {

        const brokerSymbol = item.symbol;
        const unifiedSymbol = this.toUnifiedSymbol(brokerSymbol, exchange);
        
        let unifiedExchange = exchange;
        if (instrumentType === 'AMXIDX') {
          unifiedExchange = `${exchange}_INDEX`;
        }

        symbols.push({
          symbol: unifiedSymbol,
          brokerSymbol: brokerSymbol,
          exchange: unifiedExchange,
          brokerExchange: exchange,
          token: item.token,
          name: item.name || '',
          instrumentType: instrumentType === 'AMXIDX' ? 'INDEX' : 'EQ',
          lotSize: parseInt(item.lotsize) || 1,
          tickSize: parseFloat(item.tick_size) / 100 || 0.05,
          expiry: item.expiry ? this.formatExpiry(item.expiry) : undefined,
          strike: item.strike ? parseFloat(item.strike) / 100 : undefined
        });
      }
    }

    return symbols;
  }

  private formatExpiry(expiry: string): string {
    // Convert from '19MAR2024' to '19-MAR-24'
    try {
      const match = expiry.match(/^(\d{2})([A-Z]{3})(\d{4})$/);
      if (match) {
        return `${match[1]}-${match[2]}-${match[3].slice(-2)}`;
      }
      return expiry;
    } catch {
      return expiry;
    }
  }

  toUnifiedSymbol(brokerSymbol: string, exchange: string): string {
    // Remove -EQ, -BE, -MF, -SG suffixes
    let symbol = brokerSymbol.replace(/-EQ|-BE|-MF|-SG/g, '');

    // Handle common index symbols
    const indexMap: Record<string, string> = {
      'Nifty 50': 'NIFTY',
      'Nifty Next 50': 'NIFTYNXT50',
      'Nifty Fin Service': 'FINNIFTY',
      'Nifty Bank': 'BANKNIFTY',
      'NIFTY MID SELECT': 'MIDCPNIFTY',
      'India VIX': 'INDIAVIX',
      'SNSX50': 'SENSEX50'
    };

    if (indexMap[symbol]) {
      return indexMap[symbol];
    }

    return symbol;
  }

  toBrokerSymbol(unifiedSymbol: string, exchange: string): string {
    // For equity, append -EQ suffix
    if (exchange === 'NSE' || exchange === 'BSE') {
      // Check if it's an index
      const reverseIndexMap: Record<string, string> = {
        'NIFTY': 'Nifty 50',
        'NIFTYNXT50': 'Nifty Next 50',
        'FINNIFTY': 'Nifty Fin Service',
        'BANKNIFTY': 'Nifty Bank',
        'MIDCPNIFTY': 'NIFTY MID SELECT',
        'INDIAVIX': 'India VIX'
      };

      if (reverseIndexMap[unifiedSymbol]) {
        return reverseIndexMap[unifiedSymbol];
      }

      return `${unifiedSymbol}-EQ`;
    }

    return unifiedSymbol;
  }

  private getAngelExchange(exchange: string): string {
    const exchangeMap: Record<string, string> = {
      'NSE': 'NSE',
      'BSE': 'BSE',
      'NFO': 'NFO',
      'MCX': 'MCX',
      'CDS': 'CDS',
      'BFO': 'BFO',
      'NSE_INDEX': 'NSE',
      'BSE_INDEX': 'BSE'
    };
    return exchangeMap[exchange] || exchange;
  }

  async getQuotes(symbols: Array<{ symbol: string; exchange: string }>): Promise<Record<string, UnifiedQuote>> {
    // AngelOne requires token-based quote fetching
    // This would require looking up tokens from master contract
    const result: Record<string, UnifiedQuote> = {};
    
    // For now, use LTP and construct partial quote
    const ltpData = await this.getLTP(symbols);
    
    for (const [key, ltp] of Object.entries(ltpData)) {
      result[key] = {
        symbol: ltp.symbol,
        exchange: ltp.exchange,
        lastPrice: ltp.lastPrice,
        open: 0,
        high: 0,
        low: 0,
        close: 0,
        volume: 0,
        change: 0,
        changePercent: 0,
        timestamp: new Date()
      };
    }
    
    return result;
  }

  async getLTP(symbols: Array<{ symbol: string; exchange: string }>): Promise<Record<string, UnifiedLTP>> {
    if (symbols.length === 0) return {};

    // Would need to lookup tokens from database and use market data API
    // For now, return placeholder
    const result: Record<string, UnifiedLTP> = {};
    
    // AngelOne LTP API requires exchange + symbol token
    // POST /rest/secure/angelbroking/market/v1/getLTPData
    // Body: { "exchange": "NSE", "tradingsymbol": "SBIN-EQ", "symboltoken": "3045" }
    
    try {
      const ltpRequests = symbols.map(s => ({
        exchange: this.getAngelExchange(s.exchange),
        tradingsymbol: this.toBrokerSymbol(s.symbol, s.exchange),
        symboltoken: '' // Would need token lookup
      }));

      // Note: This would need actual token lookup to work
      // For demo purposes, we'll make individual requests
      for (const req of ltpRequests) {
        try {
          const data = await this.request<any>('/rest/secure/angelbroking/market/v1/getLTPData', {
            method: 'POST',
            body: JSON.stringify(req)
          });
          
          if (data?.ltp) {
            const key = `${req.exchange}:${this.toUnifiedSymbol(req.tradingsymbol, req.exchange)}`;
            result[key] = {
              symbol: this.toUnifiedSymbol(req.tradingsymbol, req.exchange),
              exchange: req.exchange,
              lastPrice: parseFloat(data.ltp)
            };
          }
        } catch (e) {
          // Skip failed requests
        }
      }
    } catch (error) {
      console.error('Failed to fetch LTP:', error);
    }
    
    return result;
  }

  async getHistoricalData(
    symbol: string,
    exchange: string,
    fromDate: Date,
    toDate: Date,
    interval: string = 'ONE_DAY'
  ): Promise<HistoricalCandle[]> {
    // AngelOne historical data API
    // POST /rest/secure/angelbroking/historical/v1/getCandleData
    
    const intervalMap: Record<string, string> = {
      'day': 'ONE_DAY',
      '1m': 'ONE_MINUTE',
      '5m': 'FIVE_MINUTE',
      '15m': 'FIFTEEN_MINUTE',
      '1h': 'ONE_HOUR'
    };

    const angelInterval = intervalMap[interval] || 'ONE_DAY';
    
    const formatDate = (d: Date) => d.toISOString().split('T')[0] + ' 09:15';

    try {
      const data = await this.request<any[]>('/rest/secure/angelbroking/historical/v1/getCandleData', {
        method: 'POST',
        body: JSON.stringify({
          exchange: this.getAngelExchange(exchange),
          symboltoken: '', // Would need token lookup
          interval: angelInterval,
          fromdate: formatDate(fromDate),
          todate: formatDate(toDate)
        })
      });

      return data.map((candle: any[]) => ({
        date: new Date(candle[0]),
        open: candle[1],
        high: candle[2],
        low: candle[3],
        close: candle[4],
        volume: candle[5]
      }));
    } catch (error) {
      console.error('Failed to fetch historical data:', error);
      return [];
    }
  }

  async placeOrder(order: UnifiedOrder): Promise<UnifiedOrderResponse> {
    const variety = this.mapVariety(order.variety);
    
    const orderData = {
      variety: variety,
      tradingsymbol: this.toBrokerSymbol(order.symbol, order.exchange),
      symboltoken: '', // Would need token lookup
      transactiontype: order.transactionType,
      exchange: this.getAngelExchange(order.exchange),
      ordertype: order.orderType,
      producttype: this.mapProductType(order.product),
      duration: order.validity || 'DAY',
      price: order.price?.toString() || '0',
      squareoff: '0',
      stoploss: '0',
      quantity: order.quantity.toString()
    };

    if (order.triggerPrice) {
      orderData['triggerprice'] = order.triggerPrice.toString();
    }

    const data = await this.request<{ orderid: string }>('/rest/secure/angelbroking/order/v1/placeOrder', {
      method: 'POST',
      body: JSON.stringify(orderData)
    });

    return {
      orderId: data.orderid,
      status: 'PLACED'
    };
  }

  private mapVariety(variety?: string): string {
    const varietyMap: Record<string, string> = {
      'regular': 'NORMAL',
      'amo': 'AMO',
      'bo': 'ROBO',
      'co': 'NORMAL'
    };
    return varietyMap[variety || 'regular'] || 'NORMAL';
  }

  private mapProductType(product: string): string {
    const productMap: Record<string, string> = {
      'CNC': 'DELIVERY',
      'MIS': 'INTRADAY',
      'NRML': 'CARRYFORWARD'
    };
    return productMap[product] || 'DELIVERY';
  }

  async modifyOrder(orderId: string, order: Partial<UnifiedOrder>): Promise<UnifiedOrderResponse> {
    const modifyData: any = {
      variety: this.mapVariety(order.variety),
      orderid: orderId
    };

    if (order.orderType) modifyData.ordertype = order.orderType;
    if (order.quantity) modifyData.quantity = order.quantity.toString();
    if (order.price) modifyData.price = order.price.toString();
    if (order.triggerPrice) modifyData.triggerprice = order.triggerPrice.toString();

    const data = await this.request<{ orderid: string }>('/rest/secure/angelbroking/order/v1/modifyOrder', {
      method: 'POST',
      body: JSON.stringify(modifyData)
    });

    return {
      orderId: data.orderid,
      status: 'MODIFIED'
    };
  }

  async cancelOrder(orderId: string, variety: string = 'NORMAL'): Promise<UnifiedOrderResponse> {
    const data = await this.request<{ orderid: string }>('/rest/secure/angelbroking/order/v1/cancelOrder', {
      method: 'POST',
      body: JSON.stringify({
        variety: variety,
        orderid: orderId
      })
    });

    return {
      orderId: data.orderid,
      status: 'CANCELLED'
    };
  }

  async getOrders(): Promise<any[]> {
    return this.request('/rest/secure/angelbroking/order/v1/getOrderBook');
  }

  async getHoldings(): Promise<UnifiedHolding[]> {
    const data = await this.request<any[]>('/rest/secure/angelbroking/portfolio/v1/getHolding');
    
    return data.map(holding => ({
      symbol: this.toUnifiedSymbol(holding.tradingsymbol, holding.exchange),
      exchange: holding.exchange,
      quantity: parseInt(holding.quantity),
      averagePrice: parseFloat(holding.averageprice),
      lastPrice: parseFloat(holding.ltp),
      pnl: parseFloat(holding.profitandloss),
      pnlPercent: parseFloat(holding.pnlpercentage),
      value: parseInt(holding.quantity) * parseFloat(holding.ltp)
    }));
  }

  async getPositions(): Promise<UnifiedPosition[]> {
    const data = await this.request<any[]>('/rest/secure/angelbroking/order/v1/getPosition');
    
    return data.map(position => ({
      symbol: this.toUnifiedSymbol(position.tradingsymbol, position.exchange),
      exchange: position.exchange,
      quantity: parseInt(position.netqty),
      averagePrice: parseFloat(position.averageprice),
      lastPrice: parseFloat(position.ltp),
      pnl: parseFloat(position.pnl),
      product: position.producttype === 'DELIVERY' ? 'CNC' : 'MIS',
      overnight: parseInt(position.cfbuyqty) > 0 || parseInt(position.cfsellqty) > 0
    }));
  }

  async getFunds(): Promise<UnifiedFunds> {
    const data = await this.request<any>('/rest/secure/angelbroking/user/v1/getRMS');
    
    return {
      availableCash: parseFloat(data.availablecash) || 0,
      usedMargin: parseFloat(data.utiliseddebits) || 0,
      totalBalance: parseFloat(data.net) || 0,
      collateral: parseFloat(data.collateral) || 0
    };
  }

  async getProfile(): Promise<any> {
    return this.request('/rest/secure/angelbroking/user/v1/getProfile');
  }

  /**
   * Refresh session token
   */
  async refreshSession(): Promise<void> {
    const data = await this.request<{ jwtToken: string; refreshToken: string; feedToken: string }>(
      '/rest/auth/angelbroking/jwt/v1/generateTokens',
      {
        method: 'POST',
        body: JSON.stringify({
          refreshToken: this.refreshToken
        })
      }
    );

    this.jwtToken = data.jwtToken;
    this.refreshToken = data.refreshToken;
    this.feedToken = data.feedToken;
    this.accessToken = this.jwtToken;
  }

  /**
   * Logout
   */
  async logout(): Promise<void> {
    await this.request('/rest/secure/angelbroking/user/v1/logout', {
      method: 'POST',
      body: JSON.stringify({
        clientcode: this.clientId
      })
    });

    this.jwtToken = '';
    this.refreshToken = '';
    this.feedToken = '';
    this.accessToken = null;
  }
}
