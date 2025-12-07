/**
 * Portfolio Routes
 * Dashboard, analytics, and historical performance
 */

import { Hono } from 'hono';
import type { 
  Bindings, 
  Variables, 
  Investment,
  InvestmentHolding,
  Account,
  SessionData,
  PortfolioSummary,
  PerformanceData
} from '../types';
import { successResponse, errorResponse, decrypt, calculatePercentageChange, normalizeToBase100 } from '../lib/utils';
import { KiteClient } from '../lib/kite';

const portfolio = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Auth middleware
portfolio.use('*', async (c, next) => {
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
 * Helper to get KiteClient
 */
async function getKiteClient(c: any, accountId: number): Promise<KiteClient | null> {
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
 * GET /api/portfolio/summary
 * Get portfolio summary for dashboard
 */
portfolio.get('/summary', async (c) => {
  const session = c.get('session') as SessionData;
  
  try {
    // Get all active investments
    const investments = await c.env.DB.prepare(`
      SELECT i.*, b.name as basket_name
      FROM investments i
      JOIN baskets b ON i.basket_id = b.id
      WHERE i.account_id = ? AND i.status = 'ACTIVE'
    `).bind(session.account_id).all<Investment & { basket_name: string }>();
    
    // Get holdings for all investments
    let totalInvested = 0;
    let currentValue = 0;
    
    const kite = await getKiteClient(c, session.account_id);
    
    for (const inv of investments.results) {
      totalInvested += inv.invested_amount;
      
      const holdings = await c.env.DB.prepare(
        'SELECT * FROM investment_holdings WHERE investment_id = ?'
      ).bind(inv.id).all<InvestmentHolding>();
      
      if (kite && holdings.results.length > 0) {
        try {
          const instruments = holdings.results.map(h => `${h.exchange}:${h.trading_symbol}`);
          const quotes = await kite.getLTP(instruments);
          
          for (const holding of holdings.results) {
            const key = `${holding.exchange}:${holding.trading_symbol}`;
            const price = quotes[key]?.last_price || holding.current_price || holding.average_price;
            currentValue += holding.quantity * price;
          }
        } catch (e) {
          // Fall back to stored values
          currentValue += inv.current_value || inv.invested_amount;
        }
      } else {
        currentValue += inv.current_value || inv.invested_amount;
      }
    }
    
    // Get counts
    const basketsCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM baskets WHERE account_id = ? AND is_active = 1'
    ).bind(session.account_id).first<{ count: number }>();
    
    const activeSips = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM sips WHERE account_id = ? AND status = "ACTIVE"'
    ).bind(session.account_id).first<{ count: number }>();
    
    const pendingAlerts = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM alert_notifications n
      JOIN alerts a ON n.alert_id = a.id
      WHERE a.account_id = ? AND n.is_read = 0
    `).bind(session.account_id).first<{ count: number }>();
    
    // Calculate day change (simplified - would need historical data)
    const dayChange = 0; // TODO: Implement with historical data
    const dayChangePercentage = 0;
    
    const pnl = currentValue - totalInvested;
    const pnlPercentage = totalInvested > 0 ? calculatePercentageChange(currentValue, totalInvested) : 0;
    
    const summary: PortfolioSummary = {
      total_invested: totalInvested,
      current_value: currentValue,
      total_pnl: pnl,
      total_pnl_percentage: pnlPercentage,
      day_change: dayChange,
      day_change_percentage: dayChangePercentage,
      investments_count: investments.results.length,
      baskets_count: basketsCount?.count || 0,
      active_sips: activeSips?.count || 0,
      pending_alerts: pendingAlerts?.count || 0
    };
    
    return c.json(successResponse(summary));
  } catch (error) {
    console.error('Portfolio summary error:', error);
    return c.json(errorResponse('ERROR', 'Failed to fetch portfolio summary'), 500);
  }
});

/**
 * GET /api/portfolio/holdings
 * Get aggregated holdings across all investments
 */
portfolio.get('/holdings', async (c) => {
  const session = c.get('session');

  try {
    // Get all holdings grouped by stock
    const holdings = await c.env.DB.prepare(`
      SELECT
        h.trading_symbol,
        h.exchange,
        SUM(h.quantity) as total_quantity,
        AVG(h.average_price) as avg_price,
        GROUP_CONCAT(DISTINCT b.name) as basket_names
      FROM investment_holdings h
      JOIN investments i ON h.investment_id = i.id
      JOIN baskets b ON i.basket_id = b.id
      WHERE i.user_id = ? AND i.status = 'ACTIVE'
      GROUP BY h.trading_symbol, h.exchange
      ORDER BY SUM(h.quantity * h.average_price) DESC
    `).bind(session.user_id).all();

    // Return holdings without live prices for now (user needs to connect broker)
    return c.json(successResponse(holdings.results));
  } catch (error) {
    console.error('Portfolio holdings error:', error);
    return c.json(errorResponse('ERROR', 'Failed to fetch holdings'), 500);
  }
});

/**
 * GET /api/portfolio/performance/:investmentId
 * Get historical performance for an investment with benchmark comparison
 */
portfolio.get('/performance/:investmentId', async (c) => {
  const investmentId = parseInt(c.req.param('investmentId'));
  const session = c.get('session') as SessionData;
  const period = c.req.query('period') || '1M'; // 1W, 1M, 3M, 6M, 1Y, ALL
  
  try {
    // Get investment
    const investment = await c.env.DB.prepare(`
      SELECT i.*, b.benchmark_symbol, b.name as basket_name
      FROM investments i
      JOIN baskets b ON i.basket_id = b.id
      WHERE i.id = ? AND i.account_id = ?
    `).bind(investmentId, session.account_id).first<Investment & { benchmark_symbol: string; basket_name: string }>();
    
    if (!investment) {
      return c.json(errorResponse('NOT_FOUND', 'Investment not found'), 404);
    }
    
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    
    switch (period) {
      case '1W': startDate.setDate(endDate.getDate() - 7); break;
      case '1M': startDate.setMonth(endDate.getMonth() - 1); break;
      case '3M': startDate.setMonth(endDate.getMonth() - 3); break;
      case '6M': startDate.setMonth(endDate.getMonth() - 6); break;
      case '1Y': startDate.setFullYear(endDate.getFullYear() - 1); break;
      case 'ALL': startDate.setTime(new Date(investment.invested_at).getTime()); break;
    }
    
    // Get historical data
    const history = await c.env.DB.prepare(`
      SELECT recorded_date, current_value, invested_amount
      FROM investment_history
      WHERE investment_id = ? AND recorded_date >= ? AND recorded_date <= ?
      ORDER BY recorded_date ASC
    `).bind(investmentId, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]).all();
    
    // Get benchmark data
    const benchmarkSymbol = investment.benchmark_symbol?.replace('NSE:', '') || 'NIFTY 50';
    const benchmark = await c.env.DB.prepare(`
      SELECT recorded_date, close_price
      FROM benchmark_data
      WHERE symbol = ? AND recorded_date >= ? AND recorded_date <= ?
      ORDER BY recorded_date ASC
    `).bind(benchmarkSymbol, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]).all();
    
    // Normalize values to base 100 for comparison
    const dates = history.results.map((h: any) => h.recorded_date);
    const investmentValues = history.results.map((h: any) => h.current_value);
    const benchmarkValues = benchmark.results.map((b: any) => b.close_price);
    
    const normalizedInvestment = normalizeToBase100(investmentValues);
    const normalizedBenchmark = normalizeToBase100(benchmarkValues);
    
    const performance: PerformanceData = {
      dates,
      values: normalizedInvestment,
      benchmark_values: normalizedBenchmark,
      benchmark_name: benchmarkSymbol
    };
    
    // Calculate returns
    const investmentReturn = investmentValues.length > 1 
      ? calculatePercentageChange(investmentValues[investmentValues.length - 1], investmentValues[0])
      : 0;
    const benchmarkReturn = benchmarkValues.length > 1
      ? calculatePercentageChange(benchmarkValues[benchmarkValues.length - 1], benchmarkValues[0])
      : 0;
    
    return c.json(successResponse({
      investment_id: investmentId,
      basket_name: investment.basket_name,
      period,
      performance,
      returns: {
        investment: investmentReturn,
        benchmark: benchmarkReturn,
        alpha: investmentReturn - benchmarkReturn
      }
    }));
  } catch (error) {
    console.error('Performance error:', error);
    return c.json(errorResponse('ERROR', 'Failed to fetch performance data'), 500);
  }
});

/**
 * GET /api/portfolio/transactions
 * Get transaction history for the current user
 */
portfolio.get('/transactions', async (c) => {
  const session = c.get('session') as SessionData;
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');
  const type = c.req.query('type'); // BUY, SELL, REBALANCE, SIP

  try {
    let query = `
      SELECT t.*, b.name as basket_name
      FROM transactions t
      JOIN baskets b ON t.basket_id = b.id
      WHERE t.user_id = ?
    `;
    const params: any[] = [session.user_id];

    if (type) {
      query += ' AND t.transaction_type = ?';
      params.push(type);
    }

    query += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const transactions = await c.env.DB.prepare(query).bind(...params).all();

    // Parse order_details for each transaction
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
        orders_count: orderDetails.length
      };
    });

    // Get total count
    let countQuery = 'SELECT COUNT(*) as count FROM transactions WHERE user_id = ?';
    const countParams: any[] = [session.user_id];
    if (type) {
      countQuery += ' AND transaction_type = ?';
      countParams.push(type);
    }
    const countResult = await c.env.DB.prepare(countQuery).bind(...countParams).first<{ count: number }>();

    return c.json(successResponse({
      transactions: transactionsWithDetails,
      pagination: {
        total: countResult?.count || 0,
        limit,
        offset,
        has_more: (countResult?.count || 0) > offset + limit
      }
    }));
  } catch (error) {
    console.error('Transactions error:', error);
    return c.json(errorResponse('ERROR', 'Failed to fetch transactions'), 500);
  }
});

/**
 * POST /api/portfolio/sync
 * Sync holdings with Zerodha
 */
portfolio.post('/sync', async (c) => {
  const session = c.get('session') as SessionData;
  
  try {
    const kite = await getKiteClient(c, session.account_id);
    
    if (!kite) {
      return c.json(errorResponse('NOT_AUTHENTICATED', 'Please login to Zerodha'), 401);
    }
    
    // Get holdings from Zerodha
    const zerodhaHoldings = await kite.getHoldings();
    
    // Get all active investments
    const investments = await c.env.DB.prepare(`
      SELECT i.id, i.basket_id FROM investments i
      WHERE i.account_id = ? AND i.status = 'ACTIVE'
    `).bind(session.account_id).all<Investment>();
    
    let synced = 0;
    
    for (const inv of investments.results) {
      const holdings = await c.env.DB.prepare(
        'SELECT * FROM investment_holdings WHERE investment_id = ?'
      ).bind(inv.id).all<InvestmentHolding>();
      
      for (const holding of holdings.results) {
        // Find matching Zerodha holding
        const zerodhaHolding = zerodhaHoldings.find(
          zh => zh.tradingsymbol === holding.trading_symbol && zh.exchange === holding.exchange
        );
        
        if (zerodhaHolding) {
          // Update with live data
          await c.env.DB.prepare(`
            UPDATE investment_holdings SET
              quantity = ?,
              current_price = ?,
              average_price = ?,
              pnl = ?,
              pnl_percentage = ?,
              last_updated = datetime('now')
            WHERE id = ?
          `).bind(
            zerodhaHolding.quantity,
            zerodhaHolding.last_price,
            zerodhaHolding.average_price,
            zerodhaHolding.pnl,
            zerodhaHolding.day_change_percentage,
            holding.id
          ).run();
          
          synced++;
        }
      }
      
      // Update investment current value
      const updatedHoldings = await c.env.DB.prepare(`
        SELECT SUM(quantity * COALESCE(current_price, average_price)) as total_value
        FROM investment_holdings WHERE investment_id = ?
      `).bind(inv.id).first<{ total_value: number }>();
      
      await c.env.DB.prepare(`
        UPDATE investments SET current_value = ?, last_synced_at = datetime('now')
        WHERE id = ?
      `).bind(updatedHoldings?.total_value || 0, inv.id).run();
    }
    
    return c.json(successResponse({
      synced_holdings: synced,
      message: 'Portfolio synced successfully'
    }));
  } catch (error) {
    console.error('Sync error:', error);
    return c.json(errorResponse('ERROR', 'Failed to sync portfolio'), 500);
  }
});

/**
 * GET /api/portfolio/zerodha-holdings
 * Get holdings directly from Zerodha account (legacy endpoint)
 */
portfolio.get('/zerodha-holdings', async (c) => {
  const session = c.get('session') as SessionData;

  try {
    const kite = await getKiteClient(c, session.account_id);

    if (!kite) {
      return c.json(errorResponse('NOT_AUTHENTICATED', 'Please login to Zerodha'), 401);
    }

    // Get holdings from Zerodha
    const holdings = await kite.getHoldings();

    // Calculate totals
    let totalInvested = 0;
    let totalCurrent = 0;

    const holdingsWithPnL = holdings.map(h => {
      const invested = h.quantity * h.average_price;
      const current = h.quantity * h.last_price;
      totalInvested += invested;
      totalCurrent += current;

      return {
        ...h,
        invested_value: invested,
        current_value: current,
        pnl_percentage: h.average_price > 0 ? ((h.last_price - h.average_price) / h.average_price) * 100 : 0
      };
    });

    return c.json(successResponse({
      holdings: holdingsWithPnL,
      summary: {
        total_invested: totalInvested,
        total_current: totalCurrent,
        total_pnl: totalCurrent - totalInvested,
        total_pnl_percentage: totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested) * 100 : 0,
        holdings_count: holdings.length
      }
    }));
  } catch (error) {
    console.error('Zerodha holdings error:', error);
    return c.json(errorResponse('ERROR', 'Failed to fetch Zerodha holdings'), 500);
  }
});

/**
 * GET /api/portfolio/broker-holdings
 * Get holdings from the active broker account (Zerodha or Angel One)
 * Returns data in OpenAlgo common format
 */
portfolio.get('/broker-holdings', async (c) => {
  const userSession = c.get('userSession') as { user_id: number; email: string; name: string; is_admin: boolean; expires_at: number };
  const activeBrokerId = c.req.header('X-Active-Broker-ID');

  console.log('[broker-holdings] User ID:', userSession?.user_id, 'Active Broker ID:', activeBrokerId);

  try {
    // Get the active broker account
    let brokerAccount: any;

    if (activeBrokerId) {
      brokerAccount = await c.env.DB.prepare(`
        SELECT * FROM broker_accounts
        WHERE id = ? AND user_id = ? AND is_connected = 1
      `).bind(parseInt(activeBrokerId), userSession.user_id).first();
      console.log('[broker-holdings] Found by active broker ID:', brokerAccount?.id, brokerAccount?.broker_type);
    } else {
      // Get any connected broker account for the user
      brokerAccount = await c.env.DB.prepare(`
        SELECT * FROM broker_accounts
        WHERE user_id = ? AND is_connected = 1
        ORDER BY last_connected_at DESC
        LIMIT 1
      `).bind(userSession.user_id).first();
      console.log('[broker-holdings] Found by user lookup:', brokerAccount?.id, brokerAccount?.broker_type);
    }

    if (!brokerAccount) {
      console.log('[broker-holdings] No broker account found');
      return c.json(errorResponse('NOT_CONNECTED', 'No broker account connected. Please connect your broker first.'), 401);
    }

    if (!brokerAccount.access_token) {
      console.log('[broker-holdings] No access token');
      return c.json(errorResponse('NOT_AUTHENTICATED', 'Broker session expired. Please reconnect.'), 401);
    }

    console.log('[broker-holdings] Broker type:', brokerAccount.broker_type, 'Has token:', !!brokerAccount.access_token);

    const encryptionKey = c.env.ENCRYPTION_KEY || 'opencase-default-key-32chars!!!';

    let apiKey: string | null = null;
    let apiSecret: string | null = null;

    // Try account-specific credentials first
    if (brokerAccount.api_key_encrypted && brokerAccount.api_secret_encrypted) {
      console.log('[broker-holdings] Using account-specific credentials');
      apiKey = await decrypt(brokerAccount.api_key_encrypted, encryptionKey);
      apiSecret = await decrypt(brokerAccount.api_secret_encrypted, encryptionKey);
    } else {
      // Fall back to app_config
      const configKeyPrefix = brokerAccount.broker_type === 'zerodha' ? 'kite' : 'angelone';
      console.log('[broker-holdings] Falling back to app_config with prefix:', configKeyPrefix);

      const apiKeyConfig = await c.env.DB.prepare(
        `SELECT config_value FROM app_config WHERE config_key = ?`
      ).bind(`${configKeyPrefix}_api_key`).first<{ config_value: string }>();

      const apiSecretConfig = await c.env.DB.prepare(
        `SELECT config_value FROM app_config WHERE config_key = ?`
      ).bind(`${configKeyPrefix}_api_secret`).first<{ config_value: string }>();

      console.log('[broker-holdings] API key found:', !!apiKeyConfig?.config_value, 'API secret found:', !!apiSecretConfig?.config_value);

      if (apiKeyConfig?.config_value && apiSecretConfig?.config_value) {
        apiKey = await decrypt(apiKeyConfig.config_value, encryptionKey);
        apiSecret = await decrypt(apiSecretConfig.config_value, encryptionKey);
      }
    }

    if (!apiKey || !apiSecret) {
      console.log('[broker-holdings] API credentials not configured for', brokerAccount.broker_type);
      return c.json(errorResponse('NOT_CONFIGURED', `${brokerAccount.broker_type} API credentials not configured. Please set up API keys in Settings.`), 400);
    }

    console.log('[broker-holdings] Credentials found, fetching holdings...');

    // Helper function to get unified symbol from master_instruments
    const getUnifiedSymbol = async (brokerSymbol: string, exchange: string, brokerType: string): Promise<string> => {
      const column = brokerType === 'zerodha' ? 'zerodha_trading_symbol' : 'angelone_trading_symbol';
      const result = await c.env.DB.prepare(
        `SELECT symbol FROM master_instruments WHERE ${column} = ? AND exchange = ? LIMIT 1`
      ).bind(brokerSymbol, exchange).first<{ symbol: string }>();

      // Fallback: strip common suffixes if not found in DB
      if (!result?.symbol) {
        return brokerSymbol.replace(/-EQ|-BE|-MF|-SG/g, '');
      }
      return result.symbol;
    };

    let holdings: any[] = [];
    let totalInvested = 0;
    let totalCurrent = 0;

    if (brokerAccount.broker_type === 'zerodha') {
      // Zerodha holdings
      const kite = new KiteClient(apiKey, apiSecret, brokerAccount.access_token);
      const rawHoldings = await kite.getHoldings();

      // Process holdings with unified symbol lookup
      holdings = await Promise.all(rawHoldings.map(async (h) => {
        const invested = h.quantity * h.average_price;
        const current = h.quantity * h.last_price;
        totalInvested += invested;
        totalCurrent += current;

        // Get unified symbol
        const unifiedSymbol = await getUnifiedSymbol(h.tradingsymbol, h.exchange, 'zerodha');

        // Common format (OpenAlgo style)
        return {
          symbol: unifiedSymbol,
          broker_symbol: h.tradingsymbol,
          exchange: h.exchange,
          quantity: h.quantity,
          product: 'CNC',
          average_price: h.average_price,
          last_price: h.last_price,
          invested_value: invested,
          current_value: current,
          pnl: h.pnl,
          pnl_percent: h.average_price > 0 ? ((h.last_price - h.average_price) / h.average_price) * 100 : 0
        };
      }));
    } else if (brokerAccount.broker_type === 'angelone') {
      // Angel One holdings
      const response = await fetch('https://apiconnect.angelbroking.com/rest/secure/angelbroking/portfolio/v1/getAllHolding', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${brokerAccount.access_token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-UserType': 'USER',
          'X-SourceID': 'WEB',
          'X-ClientLocalIP': '127.0.0.1',
          'X-ClientPublicIP': '127.0.0.1',
          'X-MACAddress': '00:00:00:00:00:00',
          'X-PrivateKey': apiKey
        }
      });

      const data = await response.json() as any;

      if (!data.status || !data.data) {
        return c.json(errorResponse('BROKER_ERROR', data.message || 'Failed to fetch holdings from Angel One'), 500);
      }

      const rawHoldings = data.data.holdings || [];
      const totalHolding = data.data.totalholding || {};

      // Process holdings with unified symbol lookup
      holdings = await Promise.all(rawHoldings.map(async (h: any) => {
        const quantity = parseInt(h.quantity) || 0;
        const avgPrice = parseFloat(h.averageprice) || 0;
        const ltp = parseFloat(h.ltp) || 0;
        const invested = quantity * avgPrice;
        const current = quantity * ltp;
        totalInvested += invested;
        totalCurrent += current;

        // Get unified symbol
        const brokerSymbol = h.tradingsymbol || h.symbolname;
        const unifiedSymbol = await getUnifiedSymbol(brokerSymbol, h.exchange, 'angelone');

        // Common format (OpenAlgo style)
        return {
          symbol: unifiedSymbol,
          broker_symbol: brokerSymbol,
          exchange: h.exchange,
          quantity: quantity,
          product: h.product === 'DELIVERY' ? 'CNC' : h.product,
          average_price: avgPrice,
          last_price: ltp,
          invested_value: invested,
          current_value: current,
          pnl: parseFloat(h.profitandloss) || (current - invested),
          pnl_percent: parseFloat(h.pnlpercentage) || (avgPrice > 0 ? ((ltp - avgPrice) / avgPrice) * 100 : 0)
        };
      }));

      // Use Angel One's calculated totals if available
      if (totalHolding.totalholdingvalue) {
        totalCurrent = parseFloat(totalHolding.totalholdingvalue) || totalCurrent;
        totalInvested = parseFloat(totalHolding.totalinvvalue) || totalInvested;
      }
    } else {
      return c.json(errorResponse('UNSUPPORTED_BROKER', `Broker type ${brokerAccount.broker_type} is not supported`), 400);
    }

    const totalPnl = totalCurrent - totalInvested;
    const totalPnlPercent = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

    return c.json(successResponse({
      broker: {
        type: brokerAccount.broker_type,
        name: brokerAccount.broker_type === 'zerodha' ? 'Zerodha' : 'Angel One',
        account_name: brokerAccount.account_name,
        user_id: brokerAccount.broker_user_id || brokerAccount.client_code
      },
      holdings: holdings,
      summary: {
        total_invested: totalInvested,
        total_current: totalCurrent,
        total_pnl: totalPnl,
        total_pnl_percent: totalPnlPercent,
        holdings_count: holdings.length
      }
    }));
  } catch (error) {
    console.error('Broker holdings error:', error);
    return c.json(errorResponse('ERROR', 'Failed to fetch broker holdings'), 500);
  }
});

/**
 * GET /api/portfolio/positions
 * Get current day positions from Zerodha
 */
portfolio.get('/positions', async (c) => {
  const session = c.get('session') as SessionData;
  
  try {
    const kite = await getKiteClient(c, session.account_id);
    
    if (!kite) {
      return c.json(errorResponse('NOT_AUTHENTICATED', 'Please login to Zerodha'), 401);
    }
    
    const positions = await kite.getPositions();
    
    return c.json(successResponse(positions));
  } catch (error) {
    console.error('Positions error:', error);
    return c.json(errorResponse('ERROR', 'Failed to fetch positions'), 500);
  }
});

/**
 * GET /api/portfolio/orders
 * Get today's orders from Zerodha
 */
portfolio.get('/orders', async (c) => {
  const session = c.get('session') as SessionData;
  
  try {
    const kite = await getKiteClient(c, session.account_id);
    
    if (!kite) {
      return c.json(errorResponse('NOT_AUTHENTICATED', 'Please login to Zerodha'), 401);
    }
    
    const orders = await kite.getOrders();
    
    return c.json(successResponse(orders));
  } catch (error) {
    console.error('Orders error:', error);
    return c.json(errorResponse('ERROR', 'Failed to fetch orders'), 500);
  }
});

/**
 * GET /api/portfolio/margins
 * Get account margins from Zerodha
 */
portfolio.get('/margins', async (c) => {
  const session = c.get('session') as SessionData;
  
  try {
    const kite = await getKiteClient(c, session.account_id);
    
    if (!kite) {
      return c.json(errorResponse('NOT_AUTHENTICATED', 'Please login to Zerodha'), 401);
    }
    
    const margins = await kite.getMargins();
    
    return c.json(successResponse(margins));
  } catch (error) {
    console.error('Margins error:', error);
    return c.json(errorResponse('ERROR', 'Failed to fetch margins'), 500);
  }
});

/**
 * GET /api/portfolio/benchmarks
 * Get available benchmarks for comparison
 */
portfolio.get('/benchmarks', async (c) => {
  try {
    const benchmarks = [
      { symbol: 'NIFTY 50', name: 'Nifty 50', type: 'index' },
      { symbol: 'SENSEX', name: 'BSE Sensex', type: 'index' },
      { symbol: 'NIFTY BANK', name: 'Nifty Bank', type: 'sectoral' },
      { symbol: 'NIFTY IT', name: 'Nifty IT', type: 'sectoral' },
      { symbol: 'NIFTY PHARMA', name: 'Nifty Pharma', type: 'sectoral' },
      { symbol: 'NIFTY FMCG', name: 'Nifty FMCG', type: 'sectoral' },
      { symbol: 'NIFTY AUTO', name: 'Nifty Auto', type: 'sectoral' },
      { symbol: 'NIFTY FINANCIAL SERVICES', name: 'Nifty Financial Services', type: 'sectoral' },
      { symbol: 'NIFTY METAL', name: 'Nifty Metal', type: 'sectoral' },
      { symbol: 'NIFTY REALTY', name: 'Nifty Realty', type: 'sectoral' },
      { symbol: 'NIFTY MIDCAP 100', name: 'Nifty Midcap 100', type: 'market_cap' },
      { symbol: 'NIFTY SMALLCAP 100', name: 'Nifty Smallcap 100', type: 'market_cap' }
    ];
    
    return c.json(successResponse(benchmarks));
  } catch (error) {
    return c.json(errorResponse('ERROR', 'Failed to fetch benchmarks'), 500);
  }
});

export default portfolio;
