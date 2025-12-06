/**
 * Investment Routes
 * Buy, sell, rebalance basket investments
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
  KiteOrder
} from '../types';
import { successResponse, errorResponse, decrypt, calculatePercentageChange } from '../lib/utils';
import { KiteClient } from '../lib/kite';

const investments = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Auth middleware
investments.use('*', async (c, next) => {
  const sessionId = c.req.header('X-Session-ID');
  
  if (!sessionId) {
    return c.json(errorResponse('UNAUTHORIZED', 'Session required'), 401);
  }
  
  const sessionData = await c.env.KV.get(`session:${sessionId}`, 'json') as SessionData | null;
  
  if (!sessionData || sessionData.expires_at < Date.now()) {
    return c.json(errorResponse('SESSION_EXPIRED', 'Session expired'), 401);
  }
  
  c.set('session', sessionData);
  await next();
});

/**
 * Helper to get KiteClient for an account
 */
async function getKiteClient(
  c: any,
  accountId: number
): Promise<KiteClient | null> {
  const account = await c.env.DB.prepare(
    'SELECT * FROM accounts WHERE id = ?'
  ).bind(accountId).first<Account>();
  
  if (!account?.access_token) return null;
  
  const encryptionKey = c.env.ENCRYPTION_KEY || 'stockbasket-default-key';
  let apiKey = c.env.KITE_API_KEY;
  let apiSecret = c.env.KITE_API_SECRET || '';
  
  if (account.kite_api_key && account.kite_api_secret) {
    apiKey = await decrypt(account.kite_api_key, encryptionKey);
    apiSecret = await decrypt(account.kite_api_secret, encryptionKey);
  }
  
  if (!apiKey) return null;
  
  return new KiteClient(apiKey, apiSecret, account.access_token);
}

/**
 * GET /api/investments
 * Get all investments for current account
 */
investments.get('/', async (c) => {
  const session = c.get('session') as SessionData;
  
  try {
    const userInvestments = await c.env.DB.prepare(`
      SELECT i.*, b.name as basket_name, b.theme as basket_theme
      FROM investments i
      JOIN baskets b ON i.basket_id = b.id
      WHERE i.account_id = ? AND i.status != 'SOLD'
      ORDER BY i.invested_at DESC
    `).bind(session.account_id).all();
    
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
      WHERE i.id = ? AND i.account_id = ?
    `).bind(investmentId, session.account_id).first<Investment & { basket_name: string; theme: string; benchmark_symbol: string }>();
    
    if (!investment) {
      return c.json(errorResponse('NOT_FOUND', 'Investment not found'), 404);
    }
    
    // Get holdings
    const holdings = await c.env.DB.prepare(`
      SELECT * FROM investment_holdings WHERE investment_id = ?
    `).bind(investmentId).all<InvestmentHolding>();
    
    // Get live prices
    const kite = await getKiteClient(c, session.account_id);
    let holdingsWithPrices = holdings.results;
    let currentValue = investment.current_value || investment.invested_amount;
    
    if (kite && holdings.results.length > 0) {
      try {
        const instruments = holdings.results.map(h => `${h.exchange}:${h.trading_symbol}`);
        const quotes = await kite.getLTP(instruments);
        
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
 * Buy a basket - generates order for Kite
 */
investments.post('/buy/:basketId', async (c) => {
  const basketId = parseInt(c.req.param('basketId'));
  const session = c.get('session') as SessionData;
  
  try {
    const { investment_amount } = await c.req.json<BuyBasketRequest>();
    
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
    
    // Get Kite client
    const kite = await getKiteClient(c, session.account_id);
    
    if (!kite) {
      return c.json(errorResponse('NOT_AUTHENTICATED', 'Please login to Zerodha first'), 401);
    }
    
    // Get live prices
    const instruments = stocks.results.map(s => `${s.exchange}:${s.trading_symbol}`);
    const quotes = await kite.getLTP(instruments);
    
    // Calculate orders
    const { orders, totalAmount, unusedAmount } = kite.calculateBasketOrders(
      stocks.results,
      quotes,
      investment_amount
    );
    
    if (orders.length === 0) {
      return c.json(errorResponse('INSUFFICIENT_AMOUNT', 'Investment amount too low to buy any stocks'), 400);
    }
    
    // Create transaction record
    const txResult = await c.env.DB.prepare(`
      INSERT INTO transactions (account_id, basket_id, transaction_type, total_amount, status, order_details)
      VALUES (?, ?, 'BUY', ?, 'PENDING', ?)
    `).bind(session.account_id, basketId, totalAmount, JSON.stringify(orders)).run();
    
    const transactionId = txResult.meta.last_row_id;
    
    // Generate Kite basket order data
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
  } catch (error) {
    console.error('Buy basket error:', error);
    return c.json(errorResponse('ERROR', 'Failed to generate buy order'), 500);
  }
});

/**
 * POST /api/investments/:id/confirm-buy
 * Confirm basket purchase after Kite execution
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
 * Sell investment holdings
 */
investments.post('/:id/sell', async (c) => {
  const investmentId = parseInt(c.req.param('id'));
  const session = c.get('session') as SessionData;
  
  try {
    const { percentage = 100 } = await c.req.json<SellBasketRequest>();
    
    const investment = await c.env.DB.prepare(`
      SELECT * FROM investments WHERE id = ? AND account_id = ? AND status = 'ACTIVE'
    `).bind(investmentId, session.account_id).first<Investment>();
    
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
    
    const kite = await getKiteClient(c, session.account_id);
    if (!kite) {
      return c.json(errorResponse('NOT_AUTHENTICATED', 'Please login to Zerodha'), 401);
    }
    
    // Get live prices
    const instruments = holdings.results.map(h => `${h.exchange}:${h.trading_symbol}`);
    const quotes = await kite.getLTP(instruments);
    
    // Generate sell orders
    const orders: KiteOrder[] = [];
    let totalSellValue = 0;
    
    for (const holding of holdings.results) {
      const sellQty = Math.floor(holding.quantity * (percentage / 100));
      if (sellQty > 0) {
        const key = `${holding.exchange}:${holding.trading_symbol}`;
        const price = quotes[key]?.last_price || holding.current_price || holding.average_price;
        
        orders.push({
          variety: 'regular',
          tradingsymbol: holding.trading_symbol,
          exchange: holding.exchange,
          transaction_type: 'SELL',
          order_type: 'MARKET',
          quantity: sellQty,
          product: 'CNC'
        });
        
        totalSellValue += sellQty * price;
      }
    }
    
    if (orders.length === 0) {
      return c.json(errorResponse('NO_SELLABLE', 'No sellable quantity'), 400);
    }
    
    // Create transaction
    const txResult = await c.env.DB.prepare(`
      INSERT INTO transactions (account_id, investment_id, basket_id, transaction_type, total_amount, status, order_details)
      VALUES (?, ?, ?, 'SELL', ?, 'PENDING', ?)
    `).bind(session.account_id, investmentId, investment.basket_id, totalSellValue, JSON.stringify(orders)).run();
    
    const transactionId = txResult.meta.last_row_id;
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
 * Execute rebalancing orders
 */
investments.post('/:id/rebalance', async (c) => {
  const investmentId = parseInt(c.req.param('id'));
  const session = c.get('session') as SessionData;
  
  try {
    const { threshold = 5 } = await c.req.json<{ threshold?: number }>();
    
    // Get rebalance preview first
    const previewResponse = await fetch(`${c.req.url.split('/rebalance')[0]}/rebalance-preview?threshold=${threshold}`, {
      headers: {
        'X-Session-ID': c.req.header('X-Session-ID') || ''
      }
    });
    
    // For now, directly calculate like preview
    const investment = await c.env.DB.prepare(`
      SELECT * FROM investments WHERE id = ? AND account_id = ? AND status = 'ACTIVE'
    `).bind(investmentId, session.account_id).first<Investment>();
    
    if (!investment) {
      return c.json(errorResponse('NOT_FOUND', 'Investment not found'), 404);
    }
    
    const kite = await getKiteClient(c, session.account_id);
    if (!kite) {
      return c.json(errorResponse('NOT_AUTHENTICATED', 'Please login'), 401);
    }
    
    // Get holdings and calculate orders (similar to preview)
    const holdings = await c.env.DB.prepare(
      'SELECT * FROM investment_holdings WHERE investment_id = ?'
    ).bind(investmentId).all<InvestmentHolding>();
    
    const basketStocks = await c.env.DB.prepare(
      'SELECT * FROM basket_stocks WHERE basket_id = ?'
    ).bind(investment.basket_id).all<BasketStock>();
    
    const instruments = holdings.results.map(h => `${h.exchange}:${h.trading_symbol}`);
    const quotes = await kite.getLTP(instruments);
    
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
    
    const { orders, buyAmount, sellAmount } = kite.calculateRebalanceOrders(
      holdingsWithTarget,
      quotes,
      totalValue,
      threshold
    );
    
    if (orders.length === 0) {
      return c.json(successResponse({
        message: 'No rebalancing needed',
        rebalanced: false
      }));
    }
    
    // Create transaction
    const txResult = await c.env.DB.prepare(`
      INSERT INTO transactions (account_id, investment_id, basket_id, transaction_type, total_amount, status, order_details)
      VALUES (?, ?, ?, 'REBALANCE', ?, 'PENDING', ?)
    `).bind(session.account_id, investmentId, investment.basket_id, buyAmount + sellAmount, JSON.stringify(orders)).run();
    
    const transactionId = txResult.meta.last_row_id;
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
  } catch (error) {
    console.error('Rebalance error:', error);
    return c.json(errorResponse('ERROR', 'Failed to generate rebalance orders'), 500);
  }
});

export default investments;
