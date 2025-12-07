/**
 * Basket Routes
 * CRUD operations for stock baskets
 */

import { Hono } from 'hono';
import type { 
  Bindings, 
  Variables, 
  Basket, 
  BasketStock, 
  CreateBasketRequest, 
  UpdateBasketRequest,
  SessionData,
  Account
} from '../types';
import { successResponse, errorResponse, validateBasketWeights, decrypt, calculateEqualWeights } from '../lib/utils';
import { KiteClient } from '../lib/kite';
import { AngelOneClient } from '../lib/angelone';

const baskets = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * Helper to get broker-specific stock info from master_instruments
 */
interface BrokerStockInfo {
  token: string;
  brokerSymbol: string;
}

async function getBrokerStockInfo(
  c: any,
  stocks: Array<{ trading_symbol: string; exchange: string }>,
  brokerType: string
): Promise<Record<string, BrokerStockInfo>> {
  const result: Record<string, BrokerStockInfo> = {};

  for (const stock of stocks) {
    let query: string;
    if (brokerType === 'angelone') {
      query = `SELECT symbol, exchange, angelone_token, angelone_trading_symbol
        FROM master_instruments WHERE symbol = ? AND exchange = ? AND angelone_token IS NOT NULL LIMIT 1`;
    } else {
      query = `SELECT symbol, exchange, zerodha_token, zerodha_trading_symbol
        FROM master_instruments WHERE symbol = ? AND exchange = ? AND zerodha_token IS NOT NULL LIMIT 1`;
    }

    const instrument = await c.env.DB.prepare(query).bind(stock.trading_symbol, stock.exchange).first<any>();

    if (instrument) {
      const key = `${stock.exchange}:${stock.trading_symbol}`;
      if (brokerType === 'angelone') {
        result[key] = {
          token: instrument.angelone_token,
          brokerSymbol: instrument.angelone_trading_symbol || stock.trading_symbol
        };
      } else {
        result[key] = {
          token: instrument.zerodha_token?.toString() || '',
          brokerSymbol: instrument.zerodha_trading_symbol || stock.trading_symbol
        };
      }
    }
  }

  return result;
}

// Middleware to check authentication
baskets.use('*', async (c, next) => {
  const sessionId = c.req.header('X-Session-ID');

  // Allow public access to templates and public baskets
  const path = c.req.path;
  if (path.includes('/templates') || path.includes('/public')) {
    await next();
    return;
  }

  if (!sessionId) {
    return c.json(errorResponse('UNAUTHORIZED', 'Session required'), 401);
  }

  // Check for user session
  const userSession = await c.env.KV.get(`user:${sessionId}`, 'json') as { user_id: number; email: string; name: string; is_admin: boolean; expires_at: number } | null;
  if (!userSession || userSession.expires_at < Date.now()) {
    return c.json(errorResponse('SESSION_EXPIRED', 'Session expired. Please login again.'), 401);
  }

  c.set('session', { user_id: userSession.user_id, email: userSession.email, name: userSession.name, expires_at: userSession.expires_at });
  c.set('userSession', userSession);
  await next();
});

/**
 * GET /api/baskets
 * Get user's baskets
 */
baskets.get('/', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json(errorResponse('UNAUTHORIZED', 'Session required'), 401);
  }

  try {
    const userBaskets = await c.env.DB.prepare(`
      SELECT b.*,
        (SELECT COUNT(*) FROM basket_stocks WHERE basket_id = b.id) as stock_count
      FROM baskets b
      WHERE b.user_id = ? AND b.is_active = 1
      ORDER BY b.updated_at DESC
    `).bind(session.user_id).all<Basket & { stock_count: number }>();

    return c.json(successResponse(userBaskets.results));
  } catch (error) {
    console.error('Get baskets error:', error);
    return c.json(errorResponse('DB_ERROR', 'Failed to fetch baskets'), 500);
  }
});

/**
 * GET /api/baskets/templates
 * Get pre-built basket templates (public access)
 */
baskets.get('/templates', async (c) => {
  try {
    const templates = await c.env.DB.prepare(`
      SELECT b.*, 
        (SELECT COUNT(*) FROM basket_stocks WHERE basket_id = b.id) as stock_count,
        (SELECT GROUP_CONCAT(trading_symbol) FROM basket_stocks WHERE basket_id = b.id LIMIT 5) as top_stocks
      FROM baskets b
      WHERE b.is_template = 1 AND b.is_active = 1
      ORDER BY b.clone_count DESC, b.name ASC
    `).all();
    
    return c.json(successResponse(templates.results));
  } catch (error) {
    console.error('Get templates error:', error);
    return c.json(errorResponse('DB_ERROR', 'Failed to fetch templates'), 500);
  }
});

/**
 * GET /api/baskets/public
 * Get public baskets shared by users
 */
baskets.get('/public', async (c) => {
  const theme = c.req.query('theme');
  const search = c.req.query('search');
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = parseInt(c.req.query('offset') || '0');
  
  try {
    let query = `
      SELECT b.*, a.name as creator_name,
        (SELECT COUNT(*) FROM basket_stocks WHERE basket_id = b.id) as stock_count
      FROM baskets b
      LEFT JOIN accounts a ON b.account_id = a.id
      WHERE b.is_public = 1 AND b.is_active = 1 AND b.is_template = 0
    `;
    const params: any[] = [];
    
    if (theme) {
      query += ' AND b.theme = ?';
      params.push(theme);
    }
    
    if (search) {
      query += ' AND (b.name LIKE ? OR b.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    
    query += ' ORDER BY b.clone_count DESC, b.updated_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const publicBaskets = await c.env.DB.prepare(query).bind(...params).all();
    
    return c.json(successResponse(publicBaskets.results));
  } catch (error) {
    console.error('Get public baskets error:', error);
    return c.json(errorResponse('DB_ERROR', 'Failed to fetch public baskets'), 500);
  }
});

/**
 * GET /api/baskets/:id
 * Get basket details with stocks
 */
baskets.get('/:id', async (c) => {
  const basketId = parseInt(c.req.param('id'));
  const session = c.get('session');
  
  try {
    const basket = await c.env.DB.prepare(`
      SELECT b.*, a.name as creator_name
      FROM baskets b
      LEFT JOIN accounts a ON b.account_id = a.id
      WHERE b.id = ? AND b.is_active = 1
    `).bind(basketId).first<Basket & { creator_name: string }>();
    
    if (!basket) {
      return c.json(errorResponse('NOT_FOUND', 'Basket not found'), 404);
    }
    
    // Check access: own basket, public, or template (use user_id for ownership)
    if (basket.user_id !== session?.user_id && !basket.is_public && !basket.is_template) {
      return c.json(errorResponse('FORBIDDEN', 'Access denied'), 403);
    }
    
    // Get stocks
    const stocks = await c.env.DB.prepare(`
      SELECT * FROM basket_stocks WHERE basket_id = ? ORDER BY weight_percentage DESC
    `).bind(basketId).all<BasketStock>();
    
    // Get live prices if session exists
    let stocksWithPrices = stocks.results;
    let minInvestment = basket.min_investment;

    // Get active broker from header
    const activeBrokerId = c.req.header('X-Active-Broker-ID');
    const brokerAccountId = activeBrokerId ? parseInt(activeBrokerId) : null;

    if (session && stocks.results.length > 0) {
      try {
        // Get broker account - prefer active broker, fallback to first connected
        let brokerAccount: any = null;
        if (brokerAccountId) {
          brokerAccount = await c.env.DB.prepare(
            'SELECT * FROM broker_accounts WHERE id = ? AND is_connected = 1 AND is_active = 1'
          ).bind(brokerAccountId).first<any>();
        }
        if (!brokerAccount) {
          brokerAccount = await c.env.DB.prepare(
            'SELECT * FROM broker_accounts WHERE user_id = ? AND is_connected = 1 AND is_active = 1 LIMIT 1'
          ).bind(session.user_id).first<any>();
        }

        if (brokerAccount?.access_token) {
          const encryptionKey = c.env.ENCRYPTION_KEY || 'opencase-default-key-32chars!!!';
          const brokerType = brokerAccount.broker_type || 'zerodha';
          let quotes: Record<string, { last_price: number }> = {};

          if (brokerType === 'angelone') {
            // AngelOne broker
            if (brokerAccount.api_key_encrypted) {
              const apiKey = await decrypt(brokerAccount.api_key_encrypted, encryptionKey);
              const angelClient = new AngelOneClient(apiKey, brokerAccount.access_token);

              // Get broker-specific stock info
              const brokerStockInfo = await getBrokerStockInfo(c, stocks.results, brokerType);

              const instrumentsWithTokens = stocks.results
                .filter(s => brokerStockInfo[`${s.exchange}:${s.trading_symbol}`])
                .map(s => {
                  const info = brokerStockInfo[`${s.exchange}:${s.trading_symbol}`];
                  return {
                    exchange: s.exchange,
                    tradingsymbol: info.brokerSymbol,
                    symboltoken: info.token
                  };
                });

              if (instrumentsWithTokens.length > 0) {
                const rawQuotes = await angelClient.getLTP(instrumentsWithTokens);

                // Map quotes back to unified symbols
                for (const stock of stocks.results) {
                  const info = brokerStockInfo[`${stock.exchange}:${stock.trading_symbol}`];
                  if (info && rawQuotes[`${stock.exchange}:${info.brokerSymbol}`]) {
                    quotes[`${stock.exchange}:${stock.trading_symbol}`] = rawQuotes[`${stock.exchange}:${info.brokerSymbol}`];
                  }
                }
              }
            }
          } else {
            // Zerodha broker
            let apiKey = '';
            let apiSecret = '';

            if (brokerAccount.api_key_encrypted && brokerAccount.api_secret_encrypted) {
              apiKey = await decrypt(brokerAccount.api_key_encrypted, encryptionKey);
              apiSecret = await decrypt(brokerAccount.api_secret_encrypted, encryptionKey);
            }

            // If not found, try app_config
            if (!apiKey) {
              const apiKeyConfig = await c.env.DB.prepare(
                "SELECT config_value FROM app_config WHERE config_key = 'kite_api_key'"
              ).first<{ config_value: string }>();

              const apiSecretConfig = await c.env.DB.prepare(
                "SELECT config_value FROM app_config WHERE config_key = 'kite_api_secret'"
              ).first<{ config_value: string }>();

              if (apiKeyConfig?.config_value && apiSecretConfig?.config_value) {
                apiKey = await decrypt(apiKeyConfig.config_value, encryptionKey);
                apiSecret = await decrypt(apiSecretConfig.config_value, encryptionKey);
              }
            }

            if (apiKey) {
              const kite = new KiteClient(apiKey, apiSecret, brokerAccount.access_token);
              const instruments = stocks.results.map(s => `${s.exchange}:${s.trading_symbol}`);
              quotes = await kite.getLTP(instruments);
            }
          }

          // Apply quotes to stocks
          if (Object.keys(quotes).length > 0) {
            stocksWithPrices = stocks.results.map(stock => {
              const key = `${stock.exchange}:${stock.trading_symbol}`;
              const quote = quotes[key];
              return {
                ...stock,
                last_price: quote?.last_price || null
              };
            });

            // Calculate minimum investment
            let maxMinInvestment = 0;
            for (const stock of stocksWithPrices) {
              if ((stock as any).last_price) {
                const minForStock = ((stock as any).last_price / stock.weight_percentage) * 100;
                maxMinInvestment = Math.max(maxMinInvestment, minForStock);
              }
            }
            minInvestment = Math.ceil(maxMinInvestment);
          }
        }
      } catch (priceError) {
        console.error('Failed to fetch prices:', priceError);
      }
    }
    
    return c.json(successResponse({
      ...basket,
      stocks: stocksWithPrices,
      min_investment_calculated: minInvestment
    }));
  } catch (error) {
    console.error('Get basket error:', error);
    return c.json(errorResponse('DB_ERROR', 'Failed to fetch basket'), 500);
  }
});

/**
 * POST /api/baskets
 * Create a new basket
 */
baskets.post('/', async (c) => {
  const session = c.get('session') as any;
  const userSession = c.get('userSession') as any;

  if (!session) {
    return c.json(errorResponse('UNAUTHORIZED', 'Session required'), 401);
  }

  // Use user_id from session or userSession
  const userId = session.user_id || userSession?.user_id;
  if (!userId) {
    return c.json(errorResponse('UNAUTHORIZED', 'User ID not found in session'), 401);
  }

  try {
    const body = await c.req.json<CreateBasketRequest>();

    // Validate
    if (!body.name || !body.stocks || body.stocks.length === 0) {
      return c.json(errorResponse('INVALID_INPUT', 'Name and stocks are required'), 400);
    }

    if (body.stocks.length > 20) {
      return c.json(errorResponse('INVALID_INPUT', 'Maximum 20 stocks per basket'), 400);
    }

    if (!validateBasketWeights(body.stocks)) {
      return c.json(errorResponse('INVALID_WEIGHTS', 'Stock weights must sum to 100%'), 400);
    }

    // Get a valid account_id from accounts table (legacy requirement)
    // The accounts table is from the old schema, but baskets still has a FK to it
    const anyAccount = await c.env.DB.prepare(
      'SELECT id FROM accounts LIMIT 1'
    ).first<{ id: number }>();

    // Use the found account_id or 1 as fallback (assuming at least one account exists)
    const legacyAccountId = anyAccount?.id || 1;

    // Create basket
    const result = await c.env.DB.prepare(`
      INSERT INTO baskets (account_id, user_id, name, description, theme, category, is_public, risk_level, benchmark_symbol, tags)
      VALUES (?, ?, ?, ?, ?, 'custom', ?, ?, ?, ?)
    `).bind(
      legacyAccountId,
      userId,
      body.name,
      body.description || null,
      body.theme || null,
      body.is_public ? 1 : 0,
      body.risk_level || 'moderate',
      body.benchmark_symbol || 'NSE:NIFTY 50',
      body.tags ? JSON.stringify(body.tags) : null
    ).run();
    const basketId = result.meta.last_row_id;

    // Insert stocks
    for (const stock of body.stocks) {
      await c.env.DB.prepare(`
        INSERT INTO basket_stocks (basket_id, trading_symbol, exchange, weight_percentage)
        VALUES (?, ?, ?, ?)
      `).bind(basketId, stock.trading_symbol, stock.exchange || 'NSE', stock.weight_percentage).run();
    }

    return c.json(successResponse({
      basket_id: basketId,
      message: 'Basket created successfully'
    }), 201);
  } catch (error) {
    console.error('Create basket error:', error);
    return c.json(errorResponse('DB_ERROR', 'Failed to create basket'), 500);
  }
});

/**
 * PUT /api/baskets/:id
 * Update a basket
 */
baskets.put('/:id', async (c) => {
  const basketId = parseInt(c.req.param('id'));
  const session = c.get('session');
  
  if (!session) {
    return c.json(errorResponse('UNAUTHORIZED', 'Session required'), 401);
  }

  try {
    // Check ownership
    const basket = await c.env.DB.prepare(
      'SELECT * FROM baskets WHERE id = ? AND user_id = ?'
    ).bind(basketId, session.user_id).first<Basket>();
    
    if (!basket) {
      return c.json(errorResponse('NOT_FOUND', 'Basket not found or access denied'), 404);
    }
    
    const body = await c.req.json<UpdateBasketRequest>();
    
    // Update basket fields
    const updates: string[] = [];
    const values: any[] = [];
    
    if (body.name !== undefined) {
      updates.push('name = ?');
      values.push(body.name);
    }
    if (body.description !== undefined) {
      updates.push('description = ?');
      values.push(body.description);
    }
    if (body.theme !== undefined) {
      updates.push('theme = ?');
      values.push(body.theme);
    }
    if (body.is_public !== undefined) {
      updates.push('is_public = ?');
      values.push(body.is_public ? 1 : 0);
    }
    if (body.risk_level !== undefined) {
      updates.push('risk_level = ?');
      values.push(body.risk_level);
    }
    if (body.benchmark_symbol !== undefined) {
      updates.push('benchmark_symbol = ?');
      values.push(body.benchmark_symbol);
    }
    if (body.tags !== undefined) {
      updates.push('tags = ?');
      values.push(JSON.stringify(body.tags));
    }
    
    if (updates.length > 0) {
      updates.push('updated_at = datetime("now")');
      values.push(basketId);
      
      await c.env.DB.prepare(`
        UPDATE baskets SET ${updates.join(', ')} WHERE id = ?
      `).bind(...values).run();
    }
    
    // Update stocks if provided
    if (body.stocks !== undefined) {
      if (!validateBasketWeights(body.stocks)) {
        return c.json(errorResponse('INVALID_WEIGHTS', 'Stock weights must sum to 100%'), 400);
      }
      
      // Delete existing stocks and insert new ones
      await c.env.DB.prepare('DELETE FROM basket_stocks WHERE basket_id = ?').bind(basketId).run();
      
      for (const stock of body.stocks) {
        await c.env.DB.prepare(`
          INSERT INTO basket_stocks (basket_id, trading_symbol, exchange, weight_percentage)
          VALUES (?, ?, ?, ?)
        `).bind(basketId, stock.trading_symbol, stock.exchange || 'NSE', stock.weight_percentage).run();
      }
    }
    
    return c.json(successResponse({ updated: true }));
  } catch (error) {
    console.error('Update basket error:', error);
    return c.json(errorResponse('DB_ERROR', 'Failed to update basket'), 500);
  }
});

/**
 * DELETE /api/baskets/:id
 * Delete a basket (soft delete)
 */
baskets.delete('/:id', async (c) => {
  const basketId = parseInt(c.req.param('id'));
  const session = c.get('session');
  
  if (!session) {
    return c.json(errorResponse('UNAUTHORIZED', 'Session required'), 401);
  }

  try {
    const basket = await c.env.DB.prepare(
      'SELECT * FROM baskets WHERE id = ? AND user_id = ?'
    ).bind(basketId, session.user_id).first<Basket>();
    
    if (!basket) {
      return c.json(errorResponse('NOT_FOUND', 'Basket not found or access denied'), 404);
    }
    
    // Soft delete
    await c.env.DB.prepare(
      'UPDATE baskets SET is_active = 0, updated_at = datetime("now") WHERE id = ?'
    ).bind(basketId).run();
    
    return c.json(successResponse({ deleted: true }));
  } catch (error) {
    console.error('Delete basket error:', error);
    return c.json(errorResponse('DB_ERROR', 'Failed to delete basket'), 500);
  }
});

/**
 * POST /api/baskets/:id/clone
 * Clone a basket (public or template)
 */
baskets.post('/:id/clone', async (c) => {
  const basketId = parseInt(c.req.param('id'));
  const session = c.get('session');

  if (!session) {
    return c.json(errorResponse('UNAUTHORIZED', 'Session required'), 401);
  }

  try {
    // Get original basket
    const original = await c.env.DB.prepare(`
      SELECT * FROM baskets WHERE id = ? AND is_active = 1 AND (is_public = 1 OR is_template = 1)
    `).bind(basketId).first<Basket>();

    if (!original) {
      return c.json(errorResponse('NOT_FOUND', 'Basket not found or not clonable'), 404);
    }

    const { name } = await c.req.json<{ name?: string }>();

    // Get a valid account_id from accounts table (legacy requirement)
    const anyAccount = await c.env.DB.prepare(
      'SELECT id FROM accounts LIMIT 1'
    ).first<{ id: number }>();
    const legacyAccountId = anyAccount?.id || 1;

    // Create cloned basket
    const result = await c.env.DB.prepare(`
      INSERT INTO baskets (account_id, user_id, name, description, theme, category, risk_level, benchmark_symbol, tags)
      VALUES (?, ?, ?, ?, ?, 'custom', ?, ?, ?)
    `).bind(
      legacyAccountId,
      session.user_id,
      name || `${original.name} (Copy)`,
      original.description,
      original.theme,
      original.risk_level,
      original.benchmark_symbol,
      original.tags
    ).run();
    
    const newBasketId = result.meta.last_row_id;
    
    // Copy stocks
    const stocks = await c.env.DB.prepare(
      'SELECT * FROM basket_stocks WHERE basket_id = ?'
    ).bind(basketId).all<BasketStock>();
    
    for (const stock of stocks.results) {
      await c.env.DB.prepare(`
        INSERT INTO basket_stocks (basket_id, trading_symbol, exchange, company_name, sector, weight_percentage)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(newBasketId, stock.trading_symbol, stock.exchange, stock.company_name, stock.sector, stock.weight_percentage).run();
    }
    
    // Record clone
    await c.env.DB.prepare(`
      INSERT INTO basket_clones (original_basket_id, cloned_basket_id, cloned_by)
      VALUES (?, ?, ?)
    `).bind(basketId, newBasketId, session.user_id).run();
    
    // Increment clone count
    await c.env.DB.prepare(
      'UPDATE baskets SET clone_count = clone_count + 1 WHERE id = ?'
    ).bind(basketId).run();
    
    return c.json(successResponse({
      basket_id: newBasketId,
      message: 'Basket cloned successfully'
    }), 201);
  } catch (error) {
    console.error('Clone basket error:', error);
    return c.json(errorResponse('DB_ERROR', 'Failed to clone basket'), 500);
  }
});

/**
 * POST /api/baskets/calculate-weights
 * Calculate equal weights or recalculate after adjustment
 */
baskets.post('/calculate-weights', async (c) => {
  try {
    const { stocks, fixed_stock_index, fixed_weight } = await c.req.json<{
      stocks: Array<{ trading_symbol: string; exchange: string; weight_percentage?: number }>;
      fixed_stock_index?: number;
      fixed_weight?: number;
    }>();
    
    if (!stocks || stocks.length === 0) {
      return c.json(errorResponse('INVALID_INPUT', 'At least one stock is required'), 400);
    }
    
    if (stocks.length > 20) {
      return c.json(errorResponse('INVALID_INPUT', 'Maximum 20 stocks allowed'), 400);
    }
    
    let result: Array<{ trading_symbol: string; exchange: string; weight_percentage: number }>;
    
    if (fixed_stock_index !== undefined && fixed_weight !== undefined) {
      // Recalculate weights with one stock fixed
      const totalStocks = stocks.length;
      const remainingWeight = 100 - fixed_weight;
      const remainingStocks = totalStocks - 1;
      const equalWeight = remainingStocks > 0 ? remainingWeight / remainingStocks : 0;
      
      result = stocks.map((stock, index) => ({
        trading_symbol: stock.trading_symbol,
        exchange: stock.exchange || 'NSE',
        weight_percentage: index === fixed_stock_index 
          ? fixed_weight 
          : parseFloat(equalWeight.toFixed(2))
      }));
      
      // Adjust for rounding errors
      const totalWeight = result.reduce((sum, s) => sum + s.weight_percentage, 0);
      if (Math.abs(totalWeight - 100) > 0.01) {
        const adjustment = 100 - totalWeight;
        // Find the first non-fixed stock to adjust
        const adjustIndex = result.findIndex((_, i) => i !== fixed_stock_index);
        if (adjustIndex !== -1) {
          result[adjustIndex].weight_percentage = parseFloat((result[adjustIndex].weight_percentage + adjustment).toFixed(2));
        }
      }
    } else {
      // Calculate equal weights for all stocks
      result = calculateEqualWeights(stocks);
    }
    
    return c.json(successResponse({
      stocks: result,
      total_weight: result.reduce((sum, s) => sum + s.weight_percentage, 0)
    }));
  } catch (error) {
    console.error('Calculate weights error:', error);
    return c.json(errorResponse('ERROR', 'Failed to calculate weights'), 500);
  }
});

export default baskets;
