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

const baskets = new Hono<{ Bindings: Bindings; Variables: Variables }>();

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
  
  const sessionData = await c.env.KV.get(`session:${sessionId}`, 'json') as SessionData | null;
  
  if (!sessionData || sessionData.expires_at < Date.now()) {
    return c.json(errorResponse('SESSION_EXPIRED', 'Session expired. Please login again.'), 401);
  }
  
  c.set('session', sessionData);
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
      WHERE b.account_id = ? AND b.is_active = 1
      ORDER BY b.updated_at DESC
    `).bind(session.account_id).all<Basket & { stock_count: number }>();
    
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
    
    // Check access: own basket, public, or template
    if (basket.account_id !== session?.account_id && !basket.is_public && !basket.is_template) {
      return c.json(errorResponse('FORBIDDEN', 'Access denied'), 403);
    }
    
    // Get stocks
    const stocks = await c.env.DB.prepare(`
      SELECT * FROM basket_stocks WHERE basket_id = ? ORDER BY weight_percentage DESC
    `).bind(basketId).all<BasketStock>();
    
    // Get live prices if session exists
    let stocksWithPrices = stocks.results;
    let minInvestment = basket.min_investment;
    
    if (session && stocks.results.length > 0) {
      try {
        const account = await c.env.DB.prepare(
          'SELECT * FROM accounts WHERE id = ?'
        ).bind(session.account_id).first<Account>();
        
        if (account?.access_token) {
          const encryptionKey = c.env.ENCRYPTION_KEY || 'stockbasket-default-key';
          let apiKey = c.env.KITE_API_KEY;
          let apiSecret = c.env.KITE_API_SECRET || '';
          
          // Try account-specific credentials
          if (account.kite_api_key && account.kite_api_secret) {
            apiKey = await decrypt(account.kite_api_key, encryptionKey);
            apiSecret = await decrypt(account.kite_api_secret, encryptionKey);
          }
          
          if (apiKey) {
            const kite = new KiteClient(apiKey, apiSecret, account.access_token);
            const instruments = stocks.results.map(s => `${s.exchange}:${s.trading_symbol}`);
            const quotes = await kite.getLTP(instruments);
            
            stocksWithPrices = stocks.results.map(stock => {
              const key = `${stock.exchange}:${stock.trading_symbol}`;
              const quote = quotes[key];
              return {
                ...stock,
                last_price: quote?.last_price || null
              };
            });
            
            // Calculate minimum investment
            if (Object.keys(quotes).length > 0) {
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
  const session = c.get('session');
  if (!session) {
    return c.json(errorResponse('UNAUTHORIZED', 'Session required'), 401);
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
    
    // Create basket
    const result = await c.env.DB.prepare(`
      INSERT INTO baskets (account_id, name, description, theme, category, is_public, risk_level, benchmark_symbol, tags)
      VALUES (?, ?, ?, ?, 'custom', ?, ?, ?, ?)
    `).bind(
      session.account_id,
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
      'SELECT * FROM baskets WHERE id = ? AND account_id = ?'
    ).bind(basketId, session.account_id).first<Basket>();
    
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
      'SELECT * FROM baskets WHERE id = ? AND account_id = ?'
    ).bind(basketId, session.account_id).first<Basket>();
    
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
    
    // Create cloned basket
    const result = await c.env.DB.prepare(`
      INSERT INTO baskets (account_id, name, description, theme, category, risk_level, benchmark_symbol, tags)
      VALUES (?, ?, ?, ?, 'custom', ?, ?, ?)
    `).bind(
      session.account_id,
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
    `).bind(basketId, newBasketId, session.account_id).run();
    
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
