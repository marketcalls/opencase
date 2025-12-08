/**
 * Investment Routes
 * Buy, sell, rebalance basket investments with direct API order placement
 */

import { Hono } from 'hono';
import type { 
  Bindings, 
  Variables, 
  Basket, 
  BasketStock, 
  Investment,
  InvestmentHolding,
  Account,
  SessionData,
  BuyBasketRequest,
  SellBasketRequest,
  RebalancePreview,
  KiteOrder,
  PerformanceData, InvestmentHistory, BenchmarkData
} from '../types';
import { successResponse, errorResponse, decrypt, calculatePercentageChange, normalizeToBase100, getISTDateString } from '../lib/utils';
import { KiteClient } from '../lib/kite';
import { AngelOneClient, AngelOneOrder } from '../lib/angelone';

const investments = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Auth middleware
investments.use('*', async (c, next) => {
  const sessionId = c.req.header('X-Session-ID');

  if (!sessionId) {
    return c.json(errorResponse('UNAUTHORIZED', 'Session required'), 401);
  }

  // Check for user session
  const userSession = await c.env.KV.get(`user:${sessionId}`, 'json') as { user_id: number; email: string; name: string; is_admin: boolean; expires_at: number } | null;
  if (!userSession || userSession.expires_at < Date.now()) {
    return c.json(errorResponse('SESSION_EXPIRED', 'Session expired'), 401);
  }

  c.set('session', { user_id: userSession.user_id, email: userSession.email, name: userSession.name, expires_at: userSession.expires_at });
  c.set('userSession', userSession);
  await next();
});

/**
 * Helper to get broker client for a broker account (new architecture)
 * Returns { client, brokerType } or null
 */
async function getBrokerClient(
  c: any,
  brokerAccountId: number
): Promise<{ client: KiteClient | AngelOneClient; brokerType: string } | null> {
  // Get broker account from new table
  const brokerAccount = await c.env.DB.prepare(
    'SELECT * FROM broker_accounts WHERE id = ? AND is_connected = 1 AND is_active = 1'
  ).bind(brokerAccountId).first<any>();

  if (!brokerAccount?.access_token) return null;

  const brokerType = brokerAccount.broker_type || 'zerodha';
  const encryptionKey = c.env.ENCRYPTION_KEY || 'opencase-default-key-32chars!!!';

  if (brokerType === 'angelone') {
    // AngelOne broker
    if (brokerAccount.api_key_encrypted) {
      const apiKey = await decrypt(brokerAccount.api_key_encrypted, encryptionKey);
      return { client: new AngelOneClient(apiKey, brokerAccount.access_token), brokerType };
    }
    return null;
  }

  // Zerodha broker
  if (brokerAccount.api_key_encrypted && brokerAccount.api_secret_encrypted) {
    const apiKey = await decrypt(brokerAccount.api_key_encrypted, encryptionKey);
    const apiSecret = await decrypt(brokerAccount.api_secret_encrypted, encryptionKey);
    return { client: new KiteClient(apiKey, apiSecret, brokerAccount.access_token), brokerType };
  }

  // Fall back to app config for Zerodha
  const apiKeyConfig = await c.env.DB.prepare(
    "SELECT config_value FROM app_config WHERE config_key = 'kite_api_key'"
  ).first<{ config_value: string }>();

  const apiSecretConfig = await c.env.DB.prepare(
    "SELECT config_value FROM app_config WHERE config_key = 'kite_api_secret'"
  ).first<{ config_value: string }>();

  if (apiKeyConfig?.config_value && apiSecretConfig?.config_value) {
    const apiKey = await decrypt(apiKeyConfig.config_value, encryptionKey);
    const apiSecret = await decrypt(apiSecretConfig.config_value, encryptionKey);
    return { client: new KiteClient(apiKey, apiSecret, brokerAccount.access_token), brokerType };
  }

  return null;
}

/**
 * Stock info with broker-specific details
 */
interface BrokerStockInfo {
  token: string;
  brokerSymbol: string;  // Broker-specific trading symbol
  exchange: string;
}

/**
 * Helper to get broker-specific stock info from master_instruments
 * Returns token AND correct broker trading symbol for each stock
 */
async function getBrokerStockInfo(
  c: any,
  stocks: Array<{ trading_symbol: string; exchange: string }>,
  brokerType: string
): Promise<Record<string, BrokerStockInfo>> {
  const stockInfoMap: Record<string, BrokerStockInfo> = {};

  for (const stock of stocks) {
    // Look up the instrument from master_instruments using the unified symbol
    // Basket stocks use unified symbol format (TCS, INFY, RELIANCE)
    // Query specifically for rows that have the broker's token (handles duplicate rows)
    let query: string;

    if (brokerType === 'angelone') {
      // Exclude rows where angelone_token is string 'null' or actual NULL
      query = `
        SELECT symbol, exchange, angelone_token, angelone_trading_symbol
        FROM master_instruments
        WHERE symbol = ? AND exchange = ?
        AND angelone_token IS NOT NULL
        AND angelone_token != 'null'
        AND angelone_token != ''
        LIMIT 1
      `;
    } else {
      query = `
        SELECT symbol, exchange, zerodha_token, zerodha_trading_symbol
        FROM master_instruments
        WHERE symbol = ? AND exchange = ?
        AND zerodha_token IS NOT NULL
        AND zerodha_token != 'null'
        LIMIT 1
      `;
    }

    const instrument = await c.env.DB.prepare(query)
      .bind(stock.trading_symbol, stock.exchange)
      .first<any>();

    if (instrument) {
      const key = `${stock.exchange}:${stock.trading_symbol}`;

      if (brokerType === 'angelone' && instrument.angelone_token) {
        stockInfoMap[key] = {
          token: instrument.angelone_token,
          brokerSymbol: instrument.angelone_trading_symbol || stock.trading_symbol,
          exchange: stock.exchange
        };
      } else if (brokerType === 'zerodha' && instrument.zerodha_token) {
        stockInfoMap[key] = {
          token: instrument.zerodha_token.toString(),
          brokerSymbol: instrument.zerodha_trading_symbol || stock.trading_symbol,
          exchange: stock.exchange
        };
      }
    } else {
      console.warn(`No instrument found for ${stock.trading_symbol} on ${stock.exchange} for ${brokerType}`);
    }
  }

  return stockInfoMap;
}

/**
 * Helper to get KiteClient for an account (legacy - uses old accounts table)
 */
async function getKiteClient(
  c: any,
  accountId: number
): Promise<KiteClient | null> {
  const account = await c.env.DB.prepare(
    'SELECT * FROM accounts WHERE id = ?'
  ).bind(accountId).first<Account>();

  if (!account?.access_token) return null;

  const encryptionKey = c.env.ENCRYPTION_KEY || 'opencase-default-key-32chars!!!';

  // Try account-specific credentials first
  if (account.kite_api_key && account.kite_api_secret) {
    const apiKey = await decrypt(account.kite_api_key, encryptionKey);
    const apiSecret = await decrypt(account.kite_api_secret, encryptionKey);
    return new KiteClient(apiKey, apiSecret, account.access_token);
  }

  // Fall back to app config
  const apiKeyConfig = await c.env.DB.prepare(
    "SELECT config_value FROM app_config WHERE config_key = 'kite_api_key'"
  ).first<{ config_value: string }>();

  const apiSecretConfig = await c.env.DB.prepare(
    "SELECT config_value FROM app_config WHERE config_key = 'kite_api_secret'"
  ).first<{ config_value: string }>();

  if (apiKeyConfig?.config_value && apiSecretConfig?.config_value) {
    const apiKey = await decrypt(apiKeyConfig.config_value, encryptionKey);
    const apiSecret = await decrypt(apiSecretConfig.config_value, encryptionKey);
    return new KiteClient(apiKey, apiSecret, account.access_token);
  }

  return null;
}

/**
 * GET /api/investments
 * Get all investments for current user, optionally filtered by broker account
 */
investments.get('/', async (c) => {
  const session = c.get('session');

  // Get active broker from header for filtering
  const activeBrokerId = c.req.header('X-Active-Broker-ID');
  const brokerAccountId = activeBrokerId ? parseInt(activeBrokerId) : null;

  try {
    let query: string;
    let params: any[];

    if (brokerAccountId) {
      // Filter by specific broker account
      query = `
        SELECT i.*, b.name as basket_name, b.theme as basket_theme, ba.account_name as broker_account_name, ba.broker_type
        FROM investments i
        JOIN baskets b ON i.basket_id = b.id
        LEFT JOIN broker_accounts ba ON i.broker_account_id = ba.id
        WHERE i.user_id = ? AND i.status != 'SOLD' AND i.broker_account_id = ?
        ORDER BY i.invested_at DESC
      `;
      params = [session.user_id, brokerAccountId];
    } else {
      // Return all investments with broker info
      query = `
        SELECT i.*, b.name as basket_name, b.theme as basket_theme, ba.account_name as broker_account_name, ba.broker_type
        FROM investments i
        JOIN baskets b ON i.basket_id = b.id
        LEFT JOIN broker_accounts ba ON i.broker_account_id = ba.id
        WHERE i.user_id = ? AND i.status != 'SOLD'
        ORDER BY i.invested_at DESC
      `;
      params = [session.user_id];
    }

    const userInvestments = await c.env.DB.prepare(query).bind(...params).all();

    return c.json(successResponse(userInvestments.results));
  } catch (error) {
    console.error('Get investments error:', error);
    return c.json(errorResponse('DB_ERROR', 'Failed to fetch investments'), 500);
  }
});

/**
 * GET /api/investments/:id
 * Get investment details with holdings
 */
investments.get('/:id', async (c) => {
  const investmentId = parseInt(c.req.param('id'));
  const session = c.get('session') as SessionData;
  
  try {
    const investment = await c.env.DB.prepare(`
      SELECT i.*, b.name as basket_name, b.theme, b.benchmark_symbol
      FROM investments i
      JOIN baskets b ON i.basket_id = b.id
      WHERE i.id = ? AND i.user_id = ?
    `).bind(investmentId, session.user_id).first<Investment & { basket_name: string; theme: string; benchmark_symbol: string }>();
    
    if (!investment) {
      return c.json(errorResponse('NOT_FOUND', 'Investment not found'), 404);
    }
    
    // Get holdings
    const holdings = await c.env.DB.prepare(`
      SELECT * FROM investment_holdings WHERE investment_id = ?
    `).bind(investmentId).all<InvestmentHolding>();

    // Get active broker from header or find a connected broker account
    const activeBrokerId = c.req.header('X-Active-Broker-ID');
    const brokerAccountId = activeBrokerId ? parseInt(activeBrokerId) : null;

    // Get live prices using broker client
    let brokerClient: { client: KiteClient | AngelOneClient; brokerType: string } | null = null;
    if (brokerAccountId) {
      brokerClient = await getBrokerClient(c, brokerAccountId);
    }

    let holdingsWithPrices = holdings.results;
    let currentValue = investment.current_value || investment.invested_amount;

    if (brokerClient && holdings.results.length > 0) {
      try {
        const { client, brokerType } = brokerClient;
        let quotes: Record<string, { last_price: number }>;

        if (brokerType === 'angelone') {
          // Get broker-specific info for holdings
          const brokerInfo = await getBrokerStockInfo(c, holdings.results, brokerType);
          const angelClient = client as AngelOneClient;

          const instrumentsWithTokens = holdings.results
            .filter(h => brokerInfo[`${h.exchange}:${h.trading_symbol}`])
            .map(h => {
              const info = brokerInfo[`${h.exchange}:${h.trading_symbol}`];
              return { exchange: h.exchange, tradingsymbol: info.brokerSymbol, symboltoken: info.token };
            });

          const rawQuotes = await angelClient.getLTP(instrumentsWithTokens);

          // Map back to unified symbols
          quotes = {};
          for (const h of holdings.results) {
            const info = brokerInfo[`${h.exchange}:${h.trading_symbol}`];
            if (info && rawQuotes[`${h.exchange}:${info.brokerSymbol}`]) {
              quotes[`${h.exchange}:${h.trading_symbol}`] = rawQuotes[`${h.exchange}:${info.brokerSymbol}`];
            }
          }
        } else {
          const kiteClient = client as KiteClient;
          const instruments = holdings.results.map(h => `${h.exchange}:${h.trading_symbol}`);
          quotes = await kiteClient.getLTP(instruments);
        }

        currentValue = 0;
        holdingsWithPrices = holdings.results.map(holding => {
          const key = `${holding.exchange}:${holding.trading_symbol}`;
          const quote = quotes[key];
          const currentPrice = quote?.last_price || holding.current_price || holding.average_price;
          const value = holding.quantity * currentPrice;
          currentValue += value;

          return {
            ...holding,
            current_price: currentPrice,
            pnl: value - (holding.quantity * holding.average_price),
            pnl_percentage: calculatePercentageChange(currentPrice, holding.average_price)
          };
        });
        
        // Calculate actual weights
        holdingsWithPrices = holdingsWithPrices.map(h => ({
          ...h,
          actual_weight: (h.quantity * (h.current_price || h.average_price) / currentValue) * 100
        }));
      } catch (priceError) {
        console.error('Failed to fetch prices:', priceError);
      }
    }
    
    const pnl = currentValue - investment.invested_amount;
    const pnlPercentage = calculatePercentageChange(currentValue, investment.invested_amount);
    
    return c.json(successResponse({
      ...investment,
      holdings: holdingsWithPrices,
      current_value: currentValue,
      pnl,
      pnl_percentage: pnlPercentage
    }));
  } catch (error) {
    console.error('Get investment error:', error);
    return c.json(errorResponse('DB_ERROR', 'Failed to fetch investment'), 500);
  }
});

/**
 * POST /api/investments/buy/:basketId
 * Buy a basket - directly places orders via broker API (Zerodha or AngelOne)
 */
investments.post('/buy/:basketId', async (c) => {
  const basketId = parseInt(c.req.param('basketId'));
  const session = c.get('session') as SessionData;

  // Get active broker account ID from header
  const activeBrokerId = c.req.header('X-Active-Broker-ID');
  const brokerAccountId = activeBrokerId ? parseInt(activeBrokerId) : null;

  if (!brokerAccountId) {
    return c.json(errorResponse('NO_BROKER', 'Please select an active broker account'), 400);
  }

  try {
    const { investment_amount, use_direct_api = true } = await c.req.json<BuyBasketRequest & { use_direct_api?: boolean }>();

    if (!investment_amount || investment_amount <= 0) {
      return c.json(errorResponse('INVALID_INPUT', 'Valid investment amount required'), 400);
    }

    // Get basket
    const basket = await c.env.DB.prepare(
      'SELECT * FROM baskets WHERE id = ? AND is_active = 1'
    ).bind(basketId).first<Basket>();

    if (!basket) {
      return c.json(errorResponse('NOT_FOUND', 'Basket not found'), 404);
    }

    // Get stocks
    const stocks = await c.env.DB.prepare(
      'SELECT * FROM basket_stocks WHERE basket_id = ?'
    ).bind(basketId).all<BasketStock>();

    if (stocks.results.length === 0) {
      return c.json(errorResponse('EMPTY_BASKET', 'Basket has no stocks'), 400);
    }

    // Get broker client using new architecture
    const brokerClient = await getBrokerClient(c, brokerAccountId);

    if (!brokerClient) {
      return c.json(errorResponse('NOT_AUTHENTICATED', 'Please login to your broker first'), 401);
    }

    const { client, brokerType } = brokerClient;
    const isAngelOne = brokerType === 'angelone';

    // Get broker-specific stock info (token + correct broker trading symbol)
    const brokerStockInfo = await getBrokerStockInfo(c, stocks.results, brokerType);

    // Check if we have info for all stocks
    const stocksWithInfo = stocks.results.filter(s => brokerStockInfo[`${s.exchange}:${s.trading_symbol}`]);
    const missingStocks = stocks.results.filter(s => !brokerStockInfo[`${s.exchange}:${s.trading_symbol}`]);

    if (missingStocks.length > 0) {
      console.warn('Missing broker info for stocks:', missingStocks.map(s => `${s.exchange}:${s.trading_symbol}`));
    }

    if (stocksWithInfo.length === 0) {
      return c.json(errorResponse('NO_INSTRUMENTS', 'No instruments found in master contracts. Please download master contracts first.'), 400);
    }

    // Get live prices based on broker type
    let quotes: Record<string, { last_price: number }>;

    if (isAngelOne) {
      const angelClient = client as AngelOneClient;
      // Prepare instruments with broker-specific symbols and tokens
      const instrumentsWithTokens = stocksWithInfo.map(s => {
        const info = brokerStockInfo[`${s.exchange}:${s.trading_symbol}`];
        return {
          exchange: s.exchange,
          tradingsymbol: info.brokerSymbol,
          symboltoken: info.token
        };
      });

      const rawQuotes = await angelClient.getLTP(instrumentsWithTokens);

      // Map quotes back to unified symbol format for order calculation
      quotes = {};
      for (const stock of stocksWithInfo) {
        const info = brokerStockInfo[`${stock.exchange}:${stock.trading_symbol}`];
        const brokerKey = `${stock.exchange}:${info.brokerSymbol}`;
        const unifiedKey = `${stock.exchange}:${stock.trading_symbol}`;

        if (rawQuotes[brokerKey]) {
          quotes[unifiedKey] = rawQuotes[brokerKey];
        }
      }
    } else {
      const kiteClient = client as KiteClient;
      const instruments = stocksWithInfo.map(s => `${s.exchange}:${s.trading_symbol}`);
      quotes = await kiteClient.getLTP(instruments);
    }

    // Calculate orders based on broker type
    let orders: (KiteOrder | AngelOneOrder)[];
    let totalAmount: number;
    let unusedAmount: number;

    if (isAngelOne) {
      const angelClient = client as AngelOneClient;
      // Build stocks array with broker-specific info
      const stocksForOrders = stocksWithInfo.map(s => {
        const info = brokerStockInfo[`${s.exchange}:${s.trading_symbol}`];
        return {
          trading_symbol: info.brokerSymbol,  // Use broker-specific symbol (TCS for BSE, INFY-EQ for NSE)
          exchange: s.exchange,
          weight_percentage: s.weight_percentage,
          symbol_token: info.token
        };
      });

      // Map quotes to broker symbol format for order calculation
      const brokerQuotes: Record<string, { last_price: number }> = {};
      for (const stock of stocksWithInfo) {
        const info = brokerStockInfo[`${stock.exchange}:${stock.trading_symbol}`];
        const unifiedKey = `${stock.exchange}:${stock.trading_symbol}`;
        const brokerKey = `${stock.exchange}:${info.brokerSymbol}`;

        if (quotes[unifiedKey]) {
          brokerQuotes[brokerKey] = quotes[unifiedKey];
        }
      }

      const result = angelClient.calculateBasketOrders(stocksForOrders, brokerQuotes, investment_amount);
      orders = result.orders;
      totalAmount = result.totalAmount;
      unusedAmount = result.unusedAmount;
    } else {
      const kiteClient = client as KiteClient;
      const result = kiteClient.calculateBasketOrders(stocksWithInfo, quotes, investment_amount);
      orders = result.orders;
      totalAmount = result.totalAmount;
      unusedAmount = result.unusedAmount;
    }

    if (orders.length === 0) {
      return c.json(errorResponse('INSUFFICIENT_AMOUNT', 'Investment amount too low to buy any stocks'), 400);
    }

    // Get a valid legacy account_id for foreign key constraint
    const anyAccount = await c.env.DB.prepare('SELECT id FROM accounts LIMIT 1').first<{ id: number }>();
    const legacyAccountId = anyAccount?.id || 1;

    // Create transaction record
    const txResult = await c.env.DB.prepare(`
      INSERT INTO transactions (account_id, user_id, broker_account_id, basket_id, transaction_type, total_amount, status, order_details)
      VALUES (?, ?, ?, ?, 'BUY', ?, 'PENDING', ?)
    `).bind(legacyAccountId, session.user_id, brokerAccountId, basketId, totalAmount, JSON.stringify(orders)).run();

    const transactionId = txResult.meta.last_row_id;

    if (use_direct_api) {
      // Place orders directly via broker API
      try {
        let orderResults: Array<{ order: any; result: any | null; error: string | null }>;

        if (isAngelOne) {
          const angelClient = client as AngelOneClient;
          orderResults = await angelClient.placeMultipleOrders(orders as AngelOneOrder[]);
        } else {
          const kiteClient = client as KiteClient;
          orderResults = await kiteClient.placeMultipleOrders(orders as KiteOrder[]);
        }

        const successfulOrders = orderResults.filter(r => r.result !== null);
        const failedOrders = orderResults.filter(r => r.error !== null);

        const orderIds = successfulOrders.map(r =>
          isAngelOne ? r.result!.orderid : r.result!.order_id
        );

        // Update transaction with order IDs
        await c.env.DB.prepare(`
          UPDATE transactions SET
            kite_order_ids = ?,
            status = ?,
            error_message = ?
          WHERE id = ?
        `).bind(
          JSON.stringify(orderIds),
          failedOrders.length > 0 ? (successfulOrders.length > 0 ? 'PARTIAL' : 'FAILED') : 'PROCESSING',
          failedOrders.length > 0 ? JSON.stringify(failedOrders.map(f => ({ symbol: f.order.tradingsymbol, error: f.error }))) : null,
          transactionId
        ).run();

        if (successfulOrders.length > 0) {
          // Create investment record
          const actualAmount = successfulOrders.reduce((sum, o) => {
            const tradingSymbol = o.order.tradingsymbol.replace('-EQ', '');
            const key = `${o.order.exchange}:${tradingSymbol}`;
            return sum + (o.order.quantity * (quotes[key]?.last_price || 0));
          }, 0);

          const invResult = await c.env.DB.prepare(`
            INSERT INTO investments (account_id, user_id, broker_account_id, basket_id, invested_amount, current_value, status)
            VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')
          `).bind(legacyAccountId, session.user_id, brokerAccountId, basketId, actualAmount, actualAmount).run();

          const investmentId = invResult.meta.last_row_id;

          // Get basket stocks for target weights
          const stockWeightMap: Record<string, number> = {};
          stocks.results.forEach(s => {
            stockWeightMap[`${s.exchange}:${s.trading_symbol}`] = s.weight_percentage;
          });

          // Create holdings for successful orders
          for (const orderResult of successfulOrders) {
            // Normalize trading symbol (remove -EQ suffix for storage)
            const tradingSymbol = orderResult.order.tradingsymbol.replace('-EQ', '');
            const key = `${orderResult.order.exchange}:${tradingSymbol}`;
            const price = quotes[key]?.last_price || 0;

            await c.env.DB.prepare(`
              INSERT INTO investment_holdings (investment_id, trading_symbol, exchange, quantity, average_price, current_price, target_weight)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).bind(
              investmentId,
              tradingSymbol,
              orderResult.order.exchange,
              orderResult.order.quantity,
              price,
              price,
              stockWeightMap[key] || 0
            ).run();
          }

          // Update transaction
          await c.env.DB.prepare(`
            UPDATE transactions SET
              investment_id = ?,
              status = 'COMPLETED',
              completed_at = datetime('now')
            WHERE id = ?
          `).bind(investmentId, transactionId).run();

          return c.json(successResponse({
            transaction_id: transactionId,
            investment_id: investmentId,
            order_ids: orderIds,
            orders_placed: successfulOrders.length,
            orders_failed: failedOrders.length,
            total_amount: actualAmount,
            unused_amount: investment_amount - actualAmount,
            broker_type: brokerType,
            failed_orders: failedOrders.map(f => ({ symbol: f.order.tradingsymbol, error: f.error })),
            message: failedOrders.length > 0
              ? `Partially completed: ${successfulOrders.length} orders placed, ${failedOrders.length} failed`
              : `Successfully placed ${successfulOrders.length} orders via ${brokerType === 'angelone' ? 'AngelOne' : 'Zerodha'}`
          }));
        } else {
          return c.json(errorResponse('ORDER_FAILED', 'All orders failed: ' + failedOrders.map(f => f.error).join(', ')), 500);
        }
      } catch (orderError) {
        // Update transaction as failed
        await c.env.DB.prepare(`
          UPDATE transactions SET status = 'FAILED', error_message = ? WHERE id = ?
        `).bind((orderError as Error).message, transactionId).run();
        
        return c.json(errorResponse('ORDER_ERROR', (orderError as Error).message), 500);
      }
    } else {
      // Return Kite basket order data for external execution (legacy)
      const basketOrderData = kite.generateBasketOrderData(orders);
      
      return c.json(successResponse({
        transaction_id: transactionId,
        orders: orders.map(o => ({
          trading_symbol: o.tradingsymbol,
          exchange: o.exchange,
          quantity: o.quantity,
          estimated_amount: o.quantity * (quotes[`${o.exchange}:${o.tradingsymbol}`]?.last_price || 0)
        })),
        total_amount: totalAmount,
        unused_amount: unusedAmount,
        kite_basket_url: basketOrderData.url,
        kite_basket_data: basketOrderData.formData
      }));
    }
  } catch (error) {
    console.error('Buy basket error:', error);
    return c.json(errorResponse('ERROR', 'Failed to process buy order'), 500);
  }
});

/**
 * POST /api/investments/:id/confirm-buy
 * Confirm basket purchase after Kite execution (legacy)
 */
investments.post('/:id/confirm-buy', async (c) => {
  const transactionId = parseInt(c.req.param('id'));
  const session = c.get('session') as SessionData;
  
  try {
    const { order_ids } = await c.req.json<{ order_ids?: string[] }>();
    
    // Get transaction
    const transaction = await c.env.DB.prepare(`
      SELECT * FROM transactions WHERE id = ? AND account_id = ? AND status = 'PENDING'
    `).bind(transactionId, session.account_id).first<any>();
    
    if (!transaction) {
      return c.json(errorResponse('NOT_FOUND', 'Transaction not found'), 404);
    }
    
    const orders = JSON.parse(transaction.order_details || '[]') as KiteOrder[];
    
    // Create investment record
    const invResult = await c.env.DB.prepare(`
      INSERT INTO investments (account_id, basket_id, invested_amount, current_value, status)
      VALUES (?, ?, ?, ?, 'ACTIVE')
    `).bind(session.account_id, transaction.basket_id, transaction.total_amount, transaction.total_amount).run();
    
    const investmentId = invResult.meta.last_row_id;
    
    // Get basket stocks for target weights
    const basketStocks = await c.env.DB.prepare(
      'SELECT * FROM basket_stocks WHERE basket_id = ?'
    ).bind(transaction.basket_id).all<BasketStock>();
    
    const stockWeightMap: Record<string, number> = {};
    basketStocks.results.forEach(s => {
      stockWeightMap[`${s.exchange}:${s.trading_symbol}`] = s.weight_percentage;
    });
    
    // Get current prices for average price estimation
    const kite = await getKiteClient(c, session.account_id);
    let priceMap: Record<string, number> = {};
    
    if (kite) {
      const instruments = orders.map(o => `${o.exchange}:${o.tradingsymbol}`);
      const quotes = await kite.getLTP(instruments);
      Object.entries(quotes).forEach(([key, value]) => {
        priceMap[key] = value.last_price;
      });
    }
    
    // Create holdings
    for (const order of orders) {
      const key = `${order.exchange}:${order.tradingsymbol}`;
      const price = priceMap[key] || 0;
      
      await c.env.DB.prepare(`
        INSERT INTO investment_holdings (investment_id, trading_symbol, exchange, quantity, average_price, current_price, target_weight)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        investmentId,
        order.tradingsymbol,
        order.exchange,
        order.quantity,
        price,
        price,
        stockWeightMap[key] || 0
      ).run();
    }
    
    // Update transaction
    await c.env.DB.prepare(`
      UPDATE transactions SET 
        investment_id = ?,
        status = 'COMPLETED',
        kite_order_ids = ?,
        completed_at = datetime('now')
      WHERE id = ?
    `).bind(investmentId, JSON.stringify(order_ids || []), transactionId).run();
    
    return c.json(successResponse({
      investment_id: investmentId,
      message: 'Investment created successfully'
    }));
  } catch (error) {
    console.error('Confirm buy error:', error);
    return c.json(errorResponse('ERROR', 'Failed to confirm purchase'), 500);
  }
});

/**
 * POST /api/investments/:id/sell
 * Sell investment holdings directly via API (supports both Zerodha and AngelOne)
 */
investments.post('/:id/sell', async (c) => {
  const investmentId = parseInt(c.req.param('id'));
  const session = c.get('session') as SessionData;

  // Get active broker account ID from header
  const activeBrokerId = c.req.header('X-Active-Broker-ID');
  const brokerAccountId = activeBrokerId ? parseInt(activeBrokerId) : null;

  if (!brokerAccountId) {
    return c.json(errorResponse('NO_BROKER', 'Please select an active broker account'), 400);
  }

  try {
    const { percentage = 100, use_direct_api = true } = await c.req.json<SellBasketRequest & { use_direct_api?: boolean }>();

    // Get a valid legacy account_id for foreign key constraint
    const anyAccount = await c.env.DB.prepare('SELECT id FROM accounts LIMIT 1').first<{ id: number }>();
    const legacyAccountId = anyAccount?.id || 1;

    const investment = await c.env.DB.prepare(`
      SELECT * FROM investments WHERE id = ? AND user_id = ? AND status = 'ACTIVE'
    `).bind(investmentId, session.user_id).first<Investment>();

    if (!investment) {
      return c.json(errorResponse('NOT_FOUND', 'Investment not found'), 404);
    }

    // Get holdings
    const holdings = await c.env.DB.prepare(
      'SELECT * FROM investment_holdings WHERE investment_id = ?'
    ).bind(investmentId).all<InvestmentHolding>();

    if (holdings.results.length === 0) {
      return c.json(errorResponse('NO_HOLDINGS', 'No holdings to sell'), 400);
    }

    // Get broker client using new architecture
    const brokerClient = await getBrokerClient(c, brokerAccountId);
    if (!brokerClient) {
      return c.json(errorResponse('NOT_AUTHENTICATED', 'Please login to your broker first'), 401);
    }

    const { client, brokerType } = brokerClient;
    const isAngelOne = brokerType === 'angelone';

    // Get broker-specific stock info for holdings
    const brokerStockInfo = await getBrokerStockInfo(c, holdings.results, brokerType);

    // Get live prices based on broker type
    let quotes: Record<string, { last_price: number }>;

    if (isAngelOne) {
      const angelClient = client as AngelOneClient;
      const instrumentsWithTokens = holdings.results
        .filter(h => brokerStockInfo[`${h.exchange}:${h.trading_symbol}`])
        .map(h => {
          const info = brokerStockInfo[`${h.exchange}:${h.trading_symbol}`];
          return {
            exchange: h.exchange,
            tradingsymbol: info.brokerSymbol,
            symboltoken: info.token
          };
        });

      const rawQuotes = await angelClient.getLTP(instrumentsWithTokens);

      // Map quotes back to unified symbol format
      quotes = {};
      for (const holding of holdings.results) {
        const info = brokerStockInfo[`${holding.exchange}:${holding.trading_symbol}`];
        if (info) {
          const brokerKey = `${holding.exchange}:${info.brokerSymbol}`;
          const unifiedKey = `${holding.exchange}:${holding.trading_symbol}`;
          if (rawQuotes[brokerKey]) {
            quotes[unifiedKey] = rawQuotes[brokerKey];
          }
        }
      }
    } else {
      const kiteClient = client as KiteClient;
      const instruments = holdings.results.map(h => `${h.exchange}:${h.trading_symbol}`);
      quotes = await kiteClient.getLTP(instruments);
    }

    // Generate sell orders
    const orders: (KiteOrder | AngelOneOrder)[] = [];
    let totalSellValue = 0;

    for (const holding of holdings.results) {
      const sellQty = Math.floor(holding.quantity * (percentage / 100));
      if (sellQty > 0) {
        const key = `${holding.exchange}:${holding.trading_symbol}`;
        const price = quotes[key]?.last_price || holding.current_price || holding.average_price;

        if (isAngelOne) {
          const info = brokerStockInfo[key];
          if (info) {
            orders.push({
              variety: 'NORMAL',
              tradingsymbol: info.brokerSymbol,
              symboltoken: info.token,
              exchange: holding.exchange,
              transaction_type: 'SELL',
              order_type: 'MARKET',
              quantity: sellQty,
              product: 'CNC'
            } as AngelOneOrder);
          }
        } else {
          orders.push({
            variety: 'regular',
            tradingsymbol: holding.trading_symbol,
            exchange: holding.exchange,
            transaction_type: 'SELL',
            order_type: 'MARKET',
            quantity: sellQty,
            product: 'CNC'
          } as KiteOrder);
        }

        totalSellValue += sellQty * price;
      }
    }

    if (orders.length === 0) {
      return c.json(errorResponse('NO_SELLABLE', 'No sellable quantity'), 400);
    }

    // Create transaction
    const txResult = await c.env.DB.prepare(`
      INSERT INTO transactions (account_id, user_id, broker_account_id, investment_id, basket_id, transaction_type, total_amount, status, order_details)
      VALUES (?, ?, ?, ?, ?, 'SELL', ?, 'PENDING', ?)
    `).bind(legacyAccountId, session.user_id, brokerAccountId, investmentId, investment.basket_id, totalSellValue, JSON.stringify(orders)).run();

    const transactionId = txResult.meta.last_row_id;

    if (use_direct_api) {
      // Place sell orders directly
      try {
        let orderResults: Array<{ order: any; result: any | null; error: string | null }>;

        if (isAngelOne) {
          const angelClient = client as AngelOneClient;
          orderResults = await angelClient.placeMultipleOrders(orders as AngelOneOrder[]);
        } else {
          const kiteClient = client as KiteClient;
          orderResults = await kiteClient.placeMultipleOrders(orders as KiteOrder[]);
        }

        const successfulOrders = orderResults.filter(r => r.result !== null);
        const failedOrders = orderResults.filter(r => r.error !== null);
        const orderIds = successfulOrders.map(r =>
          isAngelOne ? r.result!.orderid : r.result!.order_id
        );
        
        // Update transaction
        await c.env.DB.prepare(`
          UPDATE transactions SET 
            kite_order_ids = ?,
            status = ?,
            error_message = ?,
            completed_at = datetime('now')
          WHERE id = ?
        `).bind(
          JSON.stringify(orderIds),
          failedOrders.length > 0 ? (successfulOrders.length > 0 ? 'PARTIAL' : 'FAILED') : 'COMPLETED',
          failedOrders.length > 0 ? JSON.stringify(failedOrders.map(f => ({ symbol: f.order.tradingsymbol, error: f.error }))) : null,
          transactionId
        ).run();
        
        // Update holdings for successful sell orders
        for (const orderResult of successfulOrders) {
          const holding = holdings.results.find(h => 
            h.trading_symbol === orderResult.order.tradingsymbol && 
            h.exchange === orderResult.order.exchange
          );
          
          if (holding) {
            const newQty = holding.quantity - orderResult.order.quantity;
            
            if (newQty <= 0) {
              await c.env.DB.prepare(
                'DELETE FROM investment_holdings WHERE id = ?'
              ).bind(holding.id).run();
            } else {
              await c.env.DB.prepare(`
                UPDATE investment_holdings SET quantity = ?, last_updated = datetime('now') WHERE id = ?
              `).bind(newQty, holding.id).run();
            }
          }
        }
        
        // Check if all holdings sold
        const remainingHoldings = await c.env.DB.prepare(
          'SELECT COUNT(*) as count FROM investment_holdings WHERE investment_id = ?'
        ).bind(investmentId).first<{ count: number }>();
        
        if ((remainingHoldings?.count || 0) === 0) {
          await c.env.DB.prepare(`
            UPDATE investments SET status = 'SOLD' WHERE id = ?
          `).bind(investmentId).run();
        } else if (percentage < 100) {
          await c.env.DB.prepare(`
            UPDATE investments SET status = 'PARTIAL' WHERE id = ?
          `).bind(investmentId).run();
        }
        
        return c.json(successResponse({
          transaction_id: transactionId,
          order_ids: orderIds,
          orders_placed: successfulOrders.length,
          orders_failed: failedOrders.length,
          total_sell_value: totalSellValue,
          failed_orders: failedOrders.map(f => ({ symbol: f.order.tradingsymbol, error: f.error })),
          message: `Successfully placed ${successfulOrders.length} sell orders`
        }));
      } catch (orderError) {
        await c.env.DB.prepare(`
          UPDATE transactions SET status = 'FAILED', error_message = ? WHERE id = ?
        `).bind((orderError as Error).message, transactionId).run();
        
        return c.json(errorResponse('ORDER_ERROR', (orderError as Error).message), 500);
      }
    } else {
      // Legacy: return basket order data
      const basketOrderData = kite.generateBasketOrderData(orders);
      
      return c.json(successResponse({
        transaction_id: transactionId,
        orders: orders.map(o => ({
          trading_symbol: o.tradingsymbol,
          exchange: o.exchange,
          quantity: o.quantity,
          estimated_amount: o.quantity * (quotes[`${o.exchange}:${o.tradingsymbol}`]?.last_price || 0)
        })),
        total_sell_value: totalSellValue,
        kite_basket_url: basketOrderData.url,
        kite_basket_data: basketOrderData.formData
      }));
    }
  } catch (error) {
    console.error('Sell investment error:', error);
    return c.json(errorResponse('ERROR', 'Failed to generate sell order'), 500);
  }
});

/**
 * GET /api/investments/:id/rebalance-preview
 * Get rebalancing recommendations
 */
investments.get('/:id/rebalance-preview', async (c) => {
  const investmentId = parseInt(c.req.param('id'));
  const session = c.get('session') as SessionData;
  const threshold = parseFloat(c.req.query('threshold') || '5');
  
  try {
    const investment = await c.env.DB.prepare(`
      SELECT i.*, b.name as basket_name
      FROM investments i
      JOIN baskets b ON i.basket_id = b.id
      WHERE i.id = ? AND i.account_id = ? AND i.status = 'ACTIVE'
    `).bind(investmentId, session.account_id).first<Investment & { basket_name: string }>();
    
    if (!investment) {
      return c.json(errorResponse('NOT_FOUND', 'Investment not found'), 404);
    }
    
    // Get holdings
    const holdings = await c.env.DB.prepare(
      'SELECT * FROM investment_holdings WHERE investment_id = ?'
    ).bind(investmentId).all<InvestmentHolding>();
    
    // Get basket stocks for target weights
    const basketStocks = await c.env.DB.prepare(
      'SELECT * FROM basket_stocks WHERE basket_id = ?'
    ).bind(investment.basket_id).all<BasketStock>();
    
    const targetWeightMap: Record<string, { weight: number; name: string | null }> = {};
    basketStocks.results.forEach(s => {
      targetWeightMap[`${s.exchange}:${s.trading_symbol}`] = {
        weight: s.weight_percentage,
        name: s.company_name
      };
    });
    
    const kite = await getKiteClient(c, session.account_id);
    if (!kite) {
      return c.json(errorResponse('NOT_AUTHENTICATED', 'Please login to Zerodha'), 401);
    }
    
    // Get live prices
    const instruments = holdings.results.map(h => `${h.exchange}:${h.trading_symbol}`);
    const quotes = await kite.getLTP(instruments);
    
    // Calculate current values and total
    let totalValue = 0;
    const holdingValues: Record<string, { value: number; quantity: number; price: number }> = {};
    
    for (const holding of holdings.results) {
      const key = `${holding.exchange}:${holding.trading_symbol}`;
      const price = quotes[key]?.last_price || holding.current_price || holding.average_price;
      const value = holding.quantity * price;
      totalValue += value;
      holdingValues[key] = { value, quantity: holding.quantity, price };
    }
    
    // Calculate rebalance recommendations
    const recommendations: RebalancePreview[] = [];
    let buyAmount = 0;
    let sellAmount = 0;
    
    for (const holding of holdings.results) {
      const key = `${holding.exchange}:${holding.trading_symbol}`;
      const targetInfo = targetWeightMap[key] || { weight: 0, name: null };
      const targetWeight = targetInfo.weight;
      const currentData = holdingValues[key];
      const actualWeight = (currentData.value / totalValue) * 100;
      const deviation = actualWeight - targetWeight;
      
      let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
      let quantity = 0;
      let amount = 0;
      
      if (Math.abs(deviation) > threshold) {
        const targetValue = (targetWeight / 100) * totalValue;
        const valueDiff = targetValue - currentData.value;
        quantity = Math.floor(Math.abs(valueDiff) / currentData.price);
        amount = quantity * currentData.price;
        
        if (deviation > 0) {
          action = 'SELL';
          sellAmount += amount;
        } else {
          action = 'BUY';
          buyAmount += amount;
        }
      }
      
      recommendations.push({
        trading_symbol: holding.trading_symbol,
        exchange: holding.exchange,
        company_name: targetInfo.name,
        target_weight: targetWeight,
        actual_weight: actualWeight,
        deviation,
        action,
        quantity,
        amount,
        current_price: currentData.price
      });
    }
    
    return c.json(successResponse({
      investment_id: investmentId,
      basket_name: investment.basket_name,
      total_value: totalValue,
      threshold,
      recommendations: recommendations.sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation)),
      summary: {
        buy_amount: buyAmount,
        sell_amount: sellAmount,
        net_amount: buyAmount - sellAmount,
        rebalance_needed: recommendations.some(r => r.action !== 'HOLD')
      }
    }));
  } catch (error) {
    console.error('Rebalance preview error:', error);
    return c.json(errorResponse('ERROR', 'Failed to generate rebalance preview'), 500);
  }
});

/**
 * POST /api/investments/:id/rebalance
 * Execute rebalancing orders directly via API (supports both Zerodha and AngelOne)
 */
investments.post('/:id/rebalance', async (c) => {
  const investmentId = parseInt(c.req.param('id'));
  const session = c.get('session') as SessionData;

  // Get active broker account ID from header
  const activeBrokerId = c.req.header('X-Active-Broker-ID');
  const brokerAccountId = activeBrokerId ? parseInt(activeBrokerId) : null;

  if (!brokerAccountId) {
    return c.json(errorResponse('NO_BROKER', 'Please select an active broker account'), 400);
  }

  try {
    const { threshold = 5, use_direct_api = true } = await c.req.json<{ threshold?: number; use_direct_api?: boolean }>();

    // Get a valid legacy account_id for foreign key constraint
    const anyAccount = await c.env.DB.prepare('SELECT id FROM accounts LIMIT 1').first<{ id: number }>();
    const legacyAccountId = anyAccount?.id || 1;

    const investment = await c.env.DB.prepare(`
      SELECT * FROM investments WHERE id = ? AND user_id = ? AND status = 'ACTIVE'
    `).bind(investmentId, session.user_id).first<Investment>();

    if (!investment) {
      return c.json(errorResponse('NOT_FOUND', 'Investment not found'), 404);
    }

    // Get broker client using new architecture
    const brokerClient = await getBrokerClient(c, brokerAccountId);
    if (!brokerClient) {
      return c.json(errorResponse('NOT_AUTHENTICATED', 'Please login to your broker first'), 401);
    }

    const { client, brokerType } = brokerClient;
    const isAngelOne = brokerType === 'angelone';

    // Get holdings and calculate orders
    const holdings = await c.env.DB.prepare(
      'SELECT * FROM investment_holdings WHERE investment_id = ?'
    ).bind(investmentId).all<InvestmentHolding>();

    const basketStocks = await c.env.DB.prepare(
      'SELECT * FROM basket_stocks WHERE basket_id = ?'
    ).bind(investment.basket_id).all<BasketStock>();

    // Get broker-specific stock info for holdings
    const brokerStockInfo = await getBrokerStockInfo(c, holdings.results, brokerType);

    // Get live prices based on broker type
    let quotes: Record<string, { last_price: number }>;

    if (isAngelOne) {
      const angelClient = client as AngelOneClient;
      const instrumentsWithTokens = holdings.results
        .filter(h => brokerStockInfo[`${h.exchange}:${h.trading_symbol}`])
        .map(h => {
          const info = brokerStockInfo[`${h.exchange}:${h.trading_symbol}`];
          return {
            exchange: h.exchange,
            tradingsymbol: info.brokerSymbol,
            symboltoken: info.token
          };
        });

      const rawQuotes = await angelClient.getLTP(instrumentsWithTokens);

      // Map quotes back to unified symbol format
      quotes = {};
      for (const holding of holdings.results) {
        const info = brokerStockInfo[`${holding.exchange}:${holding.trading_symbol}`];
        if (info) {
          const brokerKey = `${holding.exchange}:${info.brokerSymbol}`;
          const unifiedKey = `${holding.exchange}:${holding.trading_symbol}`;
          if (rawQuotes[brokerKey]) {
            quotes[unifiedKey] = rawQuotes[brokerKey];
          }
        }
      }
    } else {
      const kiteClient = client as KiteClient;
      const instruments = holdings.results.map(h => `${h.exchange}:${h.trading_symbol}`);
      quotes = await kiteClient.getLTP(instruments);
    }

    const holdingsWithTarget = holdings.results.map(h => {
      const stock = basketStocks.results.find(s =>
        s.trading_symbol === h.trading_symbol && s.exchange === h.exchange
      );
      return {
        ...h,
        target_weight: stock?.weight_percentage || 0
      };
    });

    let totalValue = 0;
    for (const h of holdings.results) {
      const key = `${h.exchange}:${h.trading_symbol}`;
      totalValue += h.quantity * (quotes[key]?.last_price || h.average_price);
    }

    // Calculate rebalance orders based on broker type
    let orders: (KiteOrder | AngelOneOrder)[];
    let buyAmount: number;
    let sellAmount: number;

    if (isAngelOne) {
      const angelClient = client as AngelOneClient;
      // Build holdings with broker-specific info for AngelOne
      const holdingsForRebalance = holdingsWithTarget
        .filter(h => brokerStockInfo[`${h.exchange}:${h.trading_symbol}`])
        .map(h => {
          const info = brokerStockInfo[`${h.exchange}:${h.trading_symbol}`];
          return {
            trading_symbol: info.brokerSymbol,
            exchange: h.exchange,
            quantity: h.quantity,
            target_weight: h.target_weight,
            symbol_token: info.token
          };
        });

      // Map quotes to broker symbol format for order calculation
      const brokerQuotes: Record<string, { last_price: number }> = {};
      for (const holding of holdings.results) {
        const info = brokerStockInfo[`${holding.exchange}:${holding.trading_symbol}`];
        if (info) {
          const unifiedKey = `${holding.exchange}:${holding.trading_symbol}`;
          const brokerKey = `${holding.exchange}:${info.brokerSymbol}`;
          if (quotes[unifiedKey]) {
            brokerQuotes[brokerKey] = quotes[unifiedKey];
          }
        }
      }

      const result = angelClient.calculateRebalanceOrders(holdingsForRebalance, brokerQuotes, totalValue, threshold);
      orders = result.orders;
      buyAmount = result.buyAmount;
      sellAmount = result.sellAmount;
    } else {
      const kiteClient = client as KiteClient;
      const result = kiteClient.calculateRebalanceOrders(holdingsWithTarget, quotes, totalValue, threshold);
      orders = result.orders;
      buyAmount = result.buyAmount;
      sellAmount = result.sellAmount;
    }

    if (orders.length === 0) {
      return c.json(successResponse({
        message: 'No rebalancing needed',
        rebalanced: false
      }));
    }

    // Create transaction
    const txResult = await c.env.DB.prepare(`
      INSERT INTO transactions (account_id, user_id, broker_account_id, investment_id, basket_id, transaction_type, total_amount, status, order_details)
      VALUES (?, ?, ?, ?, ?, 'REBALANCE', ?, 'PENDING', ?)
    `).bind(legacyAccountId, session.user_id, brokerAccountId, investmentId, investment.basket_id, buyAmount + sellAmount, JSON.stringify(orders)).run();

    const transactionId = txResult.meta.last_row_id;

    if (use_direct_api) {
      // Place rebalance orders directly
      try {
        let orderResults: Array<{ order: any; result: any | null; error: string | null }>;

        if (isAngelOne) {
          const angelClient = client as AngelOneClient;
          orderResults = await angelClient.placeMultipleOrders(orders as AngelOneOrder[]);
        } else {
          const kiteClient = client as KiteClient;
          orderResults = await kiteClient.placeMultipleOrders(orders as KiteOrder[]);
        }

        const successfulOrders = orderResults.filter(r => r.result !== null);
        const failedOrders = orderResults.filter(r => r.error !== null);
        const orderIds = successfulOrders.map(r =>
          isAngelOne ? r.result!.orderid : r.result!.order_id
        );
        
        // Update transaction
        await c.env.DB.prepare(`
          UPDATE transactions SET 
            kite_order_ids = ?,
            status = ?,
            error_message = ?,
            completed_at = datetime('now')
          WHERE id = ?
        `).bind(
          JSON.stringify(orderIds),
          failedOrders.length > 0 ? (successfulOrders.length > 0 ? 'PARTIAL' : 'FAILED') : 'COMPLETED',
          failedOrders.length > 0 ? JSON.stringify(failedOrders.map(f => ({ symbol: f.order.tradingsymbol, error: f.error }))) : null,
          transactionId
        ).run();
        
        // Update holdings for successful orders
        for (const orderResult of successfulOrders) {
          const holding = holdings.results.find(h => 
            h.trading_symbol === orderResult.order.tradingsymbol && 
            h.exchange === orderResult.order.exchange
          );
          
          if (holding) {
            const key = `${orderResult.order.exchange}:${orderResult.order.tradingsymbol}`;
            const price = quotes[key]?.last_price || holding.average_price;
            
            if (orderResult.order.transaction_type === 'BUY') {
              const newQty = holding.quantity + orderResult.order.quantity;
              const newAvgPrice = ((holding.quantity * holding.average_price) + (orderResult.order.quantity * price)) / newQty;
              
              await c.env.DB.prepare(`
                UPDATE investment_holdings SET quantity = ?, average_price = ?, last_updated = datetime('now') WHERE id = ?
              `).bind(newQty, newAvgPrice, holding.id).run();
            } else {
              const newQty = holding.quantity - orderResult.order.quantity;
              
              if (newQty <= 0) {
                await c.env.DB.prepare(
                  'DELETE FROM investment_holdings WHERE id = ?'
                ).bind(holding.id).run();
              } else {
                await c.env.DB.prepare(`
                  UPDATE investment_holdings SET quantity = ?, last_updated = datetime('now') WHERE id = ?
                `).bind(newQty, holding.id).run();
              }
            }
          }
        }
        
        // Update last rebalanced
        await c.env.DB.prepare(
          'UPDATE investments SET last_rebalanced_at = datetime("now") WHERE id = ?'
        ).bind(investmentId).run();
        
        return c.json(successResponse({
          transaction_id: transactionId,
          order_ids: orderIds,
          orders_placed: successfulOrders.length,
          orders_failed: failedOrders.length,
          buy_amount: buyAmount,
          sell_amount: sellAmount,
          failed_orders: failedOrders.map(f => ({ symbol: f.order.tradingsymbol, error: f.error })),
          message: `Rebalanced with ${successfulOrders.length} orders`
        }));
      } catch (orderError) {
        await c.env.DB.prepare(`
          UPDATE transactions SET status = 'FAILED', error_message = ? WHERE id = ?
        `).bind((orderError as Error).message, transactionId).run();
        
        return c.json(errorResponse('ORDER_ERROR', (orderError as Error).message), 500);
      }
    } else {
      // Legacy: return basket order data
      const basketOrderData = kite.generateBasketOrderData(orders);
      
      // Update last rebalanced
      await c.env.DB.prepare(
        'UPDATE investments SET last_rebalanced_at = datetime("now") WHERE id = ?'
      ).bind(investmentId).run();
      
      return c.json(successResponse({
        transaction_id: transactionId,
        orders: orders.map(o => ({
          trading_symbol: o.tradingsymbol,
          exchange: o.exchange,
          transaction_type: o.transaction_type,
          quantity: o.quantity
        })),
        buy_amount: buyAmount,
        sell_amount: sellAmount,
        kite_basket_url: basketOrderData.url,
        kite_basket_data: basketOrderData.formData
      }));
    }
  } catch (error) {
    console.error('Rebalance error:', error);
    return c.json(errorResponse('ERROR', 'Failed to generate rebalance orders'), 500);
  }
});

/**
 * GET /api/investments/:id/transactions
 * Get transaction history for a specific investment (BUY, SELL, REBALANCE)
 */
investments.get('/:id/transactions', async (c) => {
  const investmentId = parseInt(c.req.param('id'));
  const session = c.get('session') as SessionData;
  const type = c.req.query('type'); // Optional filter: BUY, SELL, REBALANCE
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  try {
    // Verify investment belongs to user
    const investment = await c.env.DB.prepare(`
      SELECT i.*, b.name as basket_name
      FROM investments i
      JOIN baskets b ON i.basket_id = b.id
      WHERE i.id = ? AND i.user_id = ?
    `).bind(investmentId, session.user_id).first<Investment & { basket_name: string }>();

    if (!investment) {
      return c.json(errorResponse('NOT_FOUND', 'Investment not found'), 404);
    }

    // Build query for transactions
    let query = `
      SELECT
        t.id,
        t.transaction_type,
        t.total_amount,
        t.status,
        t.order_details,
        t.kite_order_ids,
        t.error_message,
        t.created_at,
        t.completed_at
      FROM transactions t
      WHERE t.investment_id = ?
    `;
    const params: any[] = [investmentId];

    if (type) {
      query += ' AND t.transaction_type = ?';
      params.push(type);
    }

    query += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const transactions = await c.env.DB.prepare(query).bind(...params).all();

    // Parse order_details JSON for each transaction
    const transactionsWithDetails = transactions.results.map((tx: any) => {
      let orderDetails = [];
      let orderIds = [];

      try {
        if (tx.order_details) {
          orderDetails = JSON.parse(tx.order_details);
        }
        if (tx.kite_order_ids) {
          orderIds = JSON.parse(tx.kite_order_ids);
        }
      } catch (e) {
        // Ignore parse errors
      }

      return {
        ...tx,
        order_details: orderDetails,
        order_ids: orderIds,
        orders_count: orderDetails.length,
        buy_orders: orderDetails.filter((o: any) => o.transaction_type === 'BUY').length,
        sell_orders: orderDetails.filter((o: any) => o.transaction_type === 'SELL').length
      };
    });

    // Get total count
    let countQuery = 'SELECT COUNT(*) as count FROM transactions WHERE investment_id = ?';
    const countParams: any[] = [investmentId];
    if (type) {
      countQuery += ' AND transaction_type = ?';
      countParams.push(type);
    }
    const countResult = await c.env.DB.prepare(countQuery).bind(...countParams).first<{ count: number }>();

    return c.json(successResponse({
      investment_id: investmentId,
      basket_name: investment.basket_name,
      transactions: transactionsWithDetails,
      pagination: {
        total: countResult?.count || 0,
        limit,
        offset,
        has_more: (countResult?.count || 0) > offset + limit
      }
    }));
  } catch (error) {
    console.error('Get investment transactions error:', error);
    return c.json(errorResponse('ERROR', 'Failed to fetch transaction history'), 500);
  }
});

/**
 * GET /api/investments/:id/rebalance-history
 * Get rebalance history specifically for an investment
 */
investments.get('/:id/rebalance-history', async (c) => {
  const investmentId = parseInt(c.req.param('id'));
  const session = c.get('session') as SessionData;
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = parseInt(c.req.query('offset') || '0');

  try {
    // Verify investment belongs to user
    const investment = await c.env.DB.prepare(`
      SELECT i.*, b.name as basket_name
      FROM investments i
      JOIN baskets b ON i.basket_id = b.id
      WHERE i.id = ? AND i.user_id = ?
    `).bind(investmentId, session.user_id).first<Investment & { basket_name: string }>();

    if (!investment) {
      return c.json(errorResponse('NOT_FOUND', 'Investment not found'), 404);
    }

    // Get rebalance transactions
    const rebalances = await c.env.DB.prepare(`
      SELECT
        t.id,
        t.total_amount,
        t.status,
        t.order_details,
        t.kite_order_ids,
        t.error_message,
        t.created_at,
        t.completed_at
      FROM transactions t
      WHERE t.investment_id = ? AND t.transaction_type = 'REBALANCE'
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(investmentId, limit, offset).all();

    // Parse and enrich rebalance data
    const rebalanceHistory = rebalances.results.map((tx: any) => {
      let orderDetails = [];
      let orderIds = [];
      let buyOrders: any[] = [];
      let sellOrders: any[] = [];
      let totalBuyAmount = 0;
      let totalSellAmount = 0;

      try {
        if (tx.order_details) {
          orderDetails = JSON.parse(tx.order_details);
          buyOrders = orderDetails.filter((o: any) => o.transaction_type === 'BUY');
          sellOrders = orderDetails.filter((o: any) => o.transaction_type === 'SELL');

          // Calculate amounts (approximate since we store quantity not price)
          buyOrders.forEach((o: any) => {
            totalBuyAmount += o.quantity * (o.price || 0);
          });
          sellOrders.forEach((o: any) => {
            totalSellAmount += o.quantity * (o.price || 0);
          });
        }
        if (tx.kite_order_ids) {
          orderIds = JSON.parse(tx.kite_order_ids);
        }
      } catch (e) {
        // Ignore parse errors
      }

      return {
        id: tx.id,
        rebalanced_at: tx.created_at,
        completed_at: tx.completed_at,
        status: tx.status,
        total_amount: tx.total_amount,
        summary: {
          total_orders: orderDetails.length,
          buy_orders: buyOrders.length,
          sell_orders: sellOrders.length,
          net_amount: totalBuyAmount - totalSellAmount
        },
        orders: orderDetails.map((o: any) => ({
          symbol: o.tradingsymbol,
          exchange: o.exchange,
          type: o.transaction_type,
          quantity: o.quantity
        })),
        order_ids: orderIds,
        error_message: tx.error_message
      };
    });

    // Get counts
    const countResult = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM transactions
      WHERE investment_id = ? AND transaction_type = 'REBALANCE'
    `).bind(investmentId).first<{ count: number }>();

    return c.json(successResponse({
      investment_id: investmentId,
      basket_name: investment.basket_name,
      last_rebalanced_at: investment.last_rebalanced_at,
      rebalance_count: countResult?.count || 0,
      history: rebalanceHistory,
      pagination: {
        total: countResult?.count || 0,
        limit,
        offset,
        has_more: (countResult?.count || 0) > offset + limit
      }
    }));
  } catch (error) {
    console.error('Get rebalance history error:', error);
    return c.json(errorResponse('ERROR', 'Failed to fetch rebalance history'), 500);
  }
});

/**
 * GET /api/investments/:id/performance
 * Get historical performance data for investment with benchmark comparison
 * 
 * Query Parameters:
 * - period: '1M' | '3M' | '6M' | '1Y' | 'ALL' (default: '1Y')
 * - benchmark: Benchmark symbol (default: from basket.benchmark_symbol)
 */
investments.get('/:id/performance', async (c) => {
  try {
    const session = c.get('session');
    if (!session) {
      return c.json(errorResponse('UNAUTHORIZED', 'Authentication required'), 401);
    }

    const investmentId = parseInt(c.req.param('id'));
    const period = c.req.query('period') || '1Y';
    const customBenchmark = c.req.query('benchmark');

    // Validate investment exists and belongs to user
    const investment = await c.env.DB.prepare(`
      SELECT 
        i.id,
        i.user_id,
        i.basket_id,
        i.invested_at,
        b.benchmark_symbol,
        b.name as basket_name
      FROM investments i
      JOIN baskets b ON b.id = i.basket_id
      WHERE i.id = ? AND i.user_id = ?
    `).bind(investmentId, session.user_id).first<{
      id: number;
      user_id: number;
      basket_id: number;
      invested_at: string;
      benchmark_symbol: string;
      basket_name: string;
    }>();

    if (!investment) {
      return c.json(errorResponse('NOT_FOUND', 'Investment not found'), 404);
    }

    // Calculate date range based on period
    const endDate = new Date();
    let startDate = new Date(endDate); // Clone endDate, not invested_at

    switch (period) {
  case '1M':
    startDate.setMonth(startDate.getMonth() - 1);
    break;
  case '3M':
    startDate.setMonth(startDate.getMonth() - 3);
    break;
  case '6M':
    startDate.setMonth(startDate.getMonth() - 6);
    break;
  case '1Y':
    startDate.setFullYear(startDate.getFullYear() - 1);
    break;
  case 'ALL':
    startDate = new Date(investment.invested_at);
    break;
  default:
    startDate.setFullYear(startDate.getFullYear() - 1);

}

    // Ensure startDate is not before investment date
const investmentStartDate = new Date(investment.invested_at);
if (startDate < investmentStartDate) {
  startDate = investmentStartDate;
}

    const startDateStr = getISTDateString(startDate);
    const endDateStr = getISTDateString(endDate);

    // Fetch investment history
    const investmentHistory = await c.env.DB.prepare(`
      SELECT 
        recorded_date,
        current_value,
        total_pnl,
        total_pnl_percentage
      FROM investment_history
      WHERE investment_id = ?
        AND recorded_date >= ?
        AND recorded_date <= ?
      ORDER BY recorded_date ASC
    `).bind(investmentId, startDateStr, endDateStr).all<InvestmentHistory>();

    if (!investmentHistory.results || investmentHistory.results.length === 0) {
      return c.json(errorResponse('NO_DATA', 'No historical data available for this investment. Data is recorded daily.'), 404);
    }

    // Determine benchmark symbol
    const benchmarkSymbol = customBenchmark || investment.benchmark_symbol || 'NIFTY 50';

// Fetch benchmark data
const benchmarkHistory = await c.env.DB.prepare(`
  SELECT 
    recorded_date,
    close_price
  FROM benchmark_data
  WHERE symbol = ?
    AND recorded_date >= ?
    AND recorded_date <= ?
  ORDER BY recorded_date ASC
`).bind(benchmarkSymbol, startDateStr, endDateStr).all<BenchmarkData>();



// Create maps for quick lookup
const investmentMap = new Map(
  investmentHistory.results.map(row => [row.recorded_date, row.current_value])
);
const benchmarkMap = new Map(
  benchmarkHistory.results?.map(row => [row.recorded_date, row.close_price]) || []
);


// Prepare dates array - use investment dates as primary
const dates = investmentHistory.results.map(row => row.recorded_date);

// Fill data arrays (forward-fill missing dates)
const investmentValues: number[] = [];
const benchmarkValues: number[] = [];
let lastInvestmentValue = investmentHistory.results[0].current_value;
if (!benchmarkHistory.results || benchmarkHistory.results.length === 0) {
  return c.json(
    errorResponse(
      'NO_BENCHMARK_DATA',
      `No benchmark data available for ${benchmarkSymbol}. The portfolio chart will still display.`
    ),
    404
  );
}

let lastBenchmarkValue = benchmarkHistory.results[0].close_price;

dates.forEach((date, index) => {
  // Investment value
  if (investmentMap.has(date)) {
    lastInvestmentValue = investmentMap.get(date)!;
  }
  investmentValues.push(lastInvestmentValue);

  // Benchmark value
  if (benchmarkMap.has(date)) {
    lastBenchmarkValue = benchmarkMap.get(date)!;
  }
  benchmarkValues.push(lastBenchmarkValue);
  
  // Debug first few and last few
  if (index < 3 || index > dates.length - 3) {
    console.log(`[DEBUG] Date ${date}: investment=${lastInvestmentValue}, benchmark=${lastBenchmarkValue}`);
  }
});




    // Normalize both series to base 100
    const normalizedInvestment = normalizeToBase100(investmentValues);
    const normalizedBenchmark = normalizeToBase100(benchmarkValues);

    // Prepare response
    const performanceData: PerformanceData = {
      dates,
      values: normalizedInvestment,
      benchmark_values: normalizedBenchmark,
      benchmark_name: benchmarkSymbol
    };

    return c.json(successResponse(performanceData));

  } catch (error) {
    console.error('Error fetching performance data:', error);
    return c.json(
      errorResponse('INTERNAL_ERROR', 'Failed to fetch performance data'),
      500
    );
  }
});

export default investments;
