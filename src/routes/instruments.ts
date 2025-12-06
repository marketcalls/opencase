/**
 * Instruments Routes
 * Stock search and market data
 */

import { Hono } from 'hono';
import type { 
  Bindings, 
  Variables, 
  Account,
  SessionData,
  InstrumentCache
} from '../types';
import { successResponse, errorResponse, decrypt } from '../lib/utils';
import { KiteClient } from '../lib/kite';

const instruments = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * GET /api/instruments/search
 * Search for stocks
 */
instruments.get('/search', async (c) => {
  const query = c.req.query('q')?.toUpperCase();
  const exchange = c.req.query('exchange');
  const limit = parseInt(c.req.query('limit') || '20');
  
  if (!query || query.length < 2) {
    return c.json(successResponse([]));
  }
  
  try {
    let sql = `
      SELECT * FROM instruments_cache
      WHERE (trading_symbol LIKE ? OR name LIKE ?)
        AND instrument_type = 'EQ'
    `;
    const params: any[] = [`${query}%`, `%${query}%`];
    
    if (exchange) {
      sql += ' AND exchange = ?';
      params.push(exchange);
    } else {
      sql += ' AND exchange IN ("NSE", "BSE")';
    }
    
    sql += ' ORDER BY CASE WHEN trading_symbol = ? THEN 0 WHEN trading_symbol LIKE ? THEN 1 ELSE 2 END, trading_symbol LIMIT ?';
    params.push(query, `${query}%`, limit);
    
    const results = await c.env.DB.prepare(sql).bind(...params).all<InstrumentCache>();
    
    return c.json(successResponse(results.results));
  } catch (error) {
    console.error('Search error:', error);
    return c.json(errorResponse('ERROR', 'Search failed'), 500);
  }
});

/**
 * GET /api/instruments/popular
 * Get popular stocks
 */
instruments.get('/popular', async (c) => {
  try {
    const popularSymbols = [
      'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
      'HINDUNILVR', 'ITC', 'SBIN', 'BHARTIARTL', 'KOTAKBANK',
      'LT', 'AXISBANK', 'WIPRO', 'HCLTECH', 'ASIANPAINT',
      'MARUTI', 'TITAN', 'SUNPHARMA', 'BAJFINANCE', 'NESTLEIND'
    ];
    
    const placeholders = popularSymbols.map(() => '?').join(',');
    
    const results = await c.env.DB.prepare(`
      SELECT * FROM instruments_cache
      WHERE trading_symbol IN (${placeholders}) AND exchange = 'NSE'
      ORDER BY trading_symbol
    `).bind(...popularSymbols).all<InstrumentCache>();
    
    return c.json(successResponse(results.results));
  } catch (error) {
    console.error('Popular stocks error:', error);
    return c.json(errorResponse('ERROR', 'Failed to fetch popular stocks'), 500);
  }
});

/**
 * GET /api/instruments/sectors
 * Get sector-wise stocks
 */
instruments.get('/sectors', async (c) => {
  try {
    const sectors = await c.env.DB.prepare(`
      SELECT DISTINCT sector FROM instruments_cache
      WHERE sector IS NOT NULL AND sector != ''
      ORDER BY sector
    `).all<{ sector: string }>();
    
    return c.json(successResponse(sectors.results.map(s => s.sector)));
  } catch (error) {
    console.error('Sectors error:', error);
    return c.json(errorResponse('ERROR', 'Failed to fetch sectors'), 500);
  }
});

/**
 * GET /api/instruments/by-sector/:sector
 * Get stocks by sector
 */
instruments.get('/by-sector/:sector', async (c) => {
  const sector = c.req.param('sector');
  const limit = parseInt(c.req.query('limit') || '50');
  
  try {
    const results = await c.env.DB.prepare(`
      SELECT * FROM instruments_cache
      WHERE sector = ? AND exchange = 'NSE' AND instrument_type = 'EQ'
      ORDER BY trading_symbol
      LIMIT ?
    `).bind(sector, limit).all<InstrumentCache>();
    
    return c.json(successResponse(results.results));
  } catch (error) {
    console.error('Sector stocks error:', error);
    return c.json(errorResponse('ERROR', 'Failed to fetch sector stocks'), 500);
  }
});

/**
 * GET /api/instruments/quotes
 * Get live quotes for instruments (requires auth)
 */
instruments.get('/quotes', async (c) => {
  const sessionId = c.req.header('X-Session-ID');
  const symbols = c.req.query('symbols')?.split(',');
  
  if (!symbols || symbols.length === 0) {
    return c.json(errorResponse('INVALID_INPUT', 'symbols parameter required'), 400);
  }
  
  if (symbols.length > 500) {
    return c.json(errorResponse('INVALID_INPUT', 'Maximum 500 symbols allowed'), 400);
  }
  
  try {
    let quotes: Record<string, any> = {};
    
    if (sessionId) {
      const sessionData = await c.env.KV.get(`session:${sessionId}`, 'json') as SessionData | null;
      
      if (sessionData) {
        const account = await c.env.DB.prepare(
          'SELECT * FROM accounts WHERE id = ?'
        ).bind(sessionData.account_id).first<Account>();
        
        if (account?.access_token) {
          const encryptionKey = c.env.ENCRYPTION_KEY || 'stockbasket-default-key';
          let apiKey = c.env.KITE_API_KEY;
          let apiSecret = c.env.KITE_API_SECRET || '';
          
          if (account.kite_api_key && account.kite_api_secret) {
            apiKey = await decrypt(account.kite_api_key, encryptionKey);
            apiSecret = await decrypt(account.kite_api_secret, encryptionKey);
          }
          
          if (apiKey) {
            const kite = new KiteClient(apiKey, apiSecret, account.access_token);
            quotes = await kite.getQuotes(symbols);
          }
        }
      }
    }
    
    return c.json(successResponse(quotes));
  } catch (error) {
    console.error('Quotes error:', error);
    return c.json(errorResponse('ERROR', 'Failed to fetch quotes'), 500);
  }
});

/**
 * GET /api/instruments/ltp
 * Get LTP for instruments (requires auth)
 */
instruments.get('/ltp', async (c) => {
  const sessionId = c.req.header('X-Session-ID');
  const symbols = c.req.query('symbols')?.split(',');
  
  if (!symbols || symbols.length === 0) {
    return c.json(errorResponse('INVALID_INPUT', 'symbols parameter required'), 400);
  }
  
  if (symbols.length > 1000) {
    return c.json(errorResponse('INVALID_INPUT', 'Maximum 1000 symbols allowed'), 400);
  }
  
  try {
    let ltp: Record<string, any> = {};
    
    if (sessionId) {
      const sessionData = await c.env.KV.get(`session:${sessionId}`, 'json') as SessionData | null;
      
      if (sessionData) {
        const account = await c.env.DB.prepare(
          'SELECT * FROM accounts WHERE id = ?'
        ).bind(sessionData.account_id).first<Account>();
        
        if (account?.access_token) {
          const encryptionKey = c.env.ENCRYPTION_KEY || 'stockbasket-default-key';
          let apiKey = c.env.KITE_API_KEY;
          let apiSecret = c.env.KITE_API_SECRET || '';
          
          if (account.kite_api_key && account.kite_api_secret) {
            apiKey = await decrypt(account.kite_api_key, encryptionKey);
            apiSecret = await decrypt(account.kite_api_secret, encryptionKey);
          }
          
          if (apiKey) {
            const kite = new KiteClient(apiKey, apiSecret, account.access_token);
            ltp = await kite.getLTP(symbols);
          }
        }
      }
    }
    
    return c.json(successResponse(ltp));
  } catch (error) {
    console.error('LTP error:', error);
    return c.json(errorResponse('ERROR', 'Failed to fetch LTP'), 500);
  }
});

/**
 * POST /api/instruments/refresh
 * Refresh instruments cache from Kite (admin only, called daily)
 */
instruments.post('/refresh', async (c) => {
  // For now, just seed some popular instruments
  // In production, this would fetch from Kite API
  
  try {
    const popularInstruments = [
      { trading_symbol: 'RELIANCE', name: 'Reliance Industries', exchange: 'NSE', instrument_token: 738561, sector: 'Oil & Gas', market_cap: 'large' },
      { trading_symbol: 'TCS', name: 'Tata Consultancy Services', exchange: 'NSE', instrument_token: 2953217, sector: 'IT', market_cap: 'large' },
      { trading_symbol: 'HDFCBANK', name: 'HDFC Bank', exchange: 'NSE', instrument_token: 341249, sector: 'Banking', market_cap: 'large' },
      { trading_symbol: 'INFY', name: 'Infosys', exchange: 'NSE', instrument_token: 408065, sector: 'IT', market_cap: 'large' },
      { trading_symbol: 'ICICIBANK', name: 'ICICI Bank', exchange: 'NSE', instrument_token: 1270529, sector: 'Banking', market_cap: 'large' },
      { trading_symbol: 'HINDUNILVR', name: 'Hindustan Unilever', exchange: 'NSE', instrument_token: 356865, sector: 'FMCG', market_cap: 'large' },
      { trading_symbol: 'ITC', name: 'ITC Limited', exchange: 'NSE', instrument_token: 424961, sector: 'FMCG', market_cap: 'large' },
      { trading_symbol: 'SBIN', name: 'State Bank of India', exchange: 'NSE', instrument_token: 779521, sector: 'Banking', market_cap: 'large' },
      { trading_symbol: 'BHARTIARTL', name: 'Bharti Airtel', exchange: 'NSE', instrument_token: 2714625, sector: 'Telecom', market_cap: 'large' },
      { trading_symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank', exchange: 'NSE', instrument_token: 492033, sector: 'Banking', market_cap: 'large' },
      { trading_symbol: 'LT', name: 'Larsen & Toubro', exchange: 'NSE', instrument_token: 2939649, sector: 'Infrastructure', market_cap: 'large' },
      { trading_symbol: 'AXISBANK', name: 'Axis Bank', exchange: 'NSE', instrument_token: 1510401, sector: 'Banking', market_cap: 'large' },
      { trading_symbol: 'WIPRO', name: 'Wipro', exchange: 'NSE', instrument_token: 969473, sector: 'IT', market_cap: 'large' },
      { trading_symbol: 'HCLTECH', name: 'HCL Technologies', exchange: 'NSE', instrument_token: 1850625, sector: 'IT', market_cap: 'large' },
      { trading_symbol: 'TECHM', name: 'Tech Mahindra', exchange: 'NSE', instrument_token: 3465729, sector: 'IT', market_cap: 'large' },
      { trading_symbol: 'ASIANPAINT', name: 'Asian Paints', exchange: 'NSE', instrument_token: 60417, sector: 'Consumer', market_cap: 'large' },
      { trading_symbol: 'MARUTI', name: 'Maruti Suzuki', exchange: 'NSE', instrument_token: 2815745, sector: 'Auto', market_cap: 'large' },
      { trading_symbol: 'TITAN', name: 'Titan Company', exchange: 'NSE', instrument_token: 897537, sector: 'Consumer', market_cap: 'large' },
      { trading_symbol: 'SUNPHARMA', name: 'Sun Pharmaceutical', exchange: 'NSE', instrument_token: 857857, sector: 'Pharma', market_cap: 'large' },
      { trading_symbol: 'BAJFINANCE', name: 'Bajaj Finance', exchange: 'NSE', instrument_token: 81153, sector: 'Finance', market_cap: 'large' },
      { trading_symbol: 'NESTLEIND', name: 'Nestle India', exchange: 'NSE', instrument_token: 4598529, sector: 'FMCG', market_cap: 'large' },
      { trading_symbol: 'TATAMOTORS', name: 'Tata Motors', exchange: 'NSE', instrument_token: 884737, sector: 'Auto', market_cap: 'large' },
      { trading_symbol: 'M&M', name: 'Mahindra & Mahindra', exchange: 'NSE', instrument_token: 519937, sector: 'Auto', market_cap: 'large' },
      { trading_symbol: 'DRREDDY', name: 'Dr. Reddys Laboratories', exchange: 'NSE', instrument_token: 225537, sector: 'Pharma', market_cap: 'large' },
      { trading_symbol: 'CIPLA', name: 'Cipla', exchange: 'NSE', instrument_token: 177665, sector: 'Pharma', market_cap: 'large' },
      { trading_symbol: 'COALINDIA', name: 'Coal India', exchange: 'NSE', instrument_token: 5215745, sector: 'Mining', market_cap: 'large' },
      { trading_symbol: 'POWERGRID', name: 'Power Grid Corp', exchange: 'NSE', instrument_token: 3834113, sector: 'Power', market_cap: 'large' },
      { trading_symbol: 'ONGC', name: 'ONGC', exchange: 'NSE', instrument_token: 633601, sector: 'Oil & Gas', market_cap: 'large' },
      { trading_symbol: 'NTPC', name: 'NTPC', exchange: 'NSE', instrument_token: 2977281, sector: 'Power', market_cap: 'large' },
      { trading_symbol: 'LTIM', name: 'LTIMindtree', exchange: 'NSE', instrument_token: 4561409, sector: 'IT', market_cap: 'large' },
      { trading_symbol: 'DIVISLAB', name: 'Divis Laboratories', exchange: 'NSE', instrument_token: 2800641, sector: 'Pharma', market_cap: 'large' },
      { trading_symbol: 'BRITANNIA', name: 'Britannia Industries', exchange: 'NSE', instrument_token: 140033, sector: 'FMCG', market_cap: 'large' },
      { trading_symbol: 'DABUR', name: 'Dabur India', exchange: 'NSE', instrument_token: 197633, sector: 'FMCG', market_cap: 'large' },
      { trading_symbol: 'MARICO', name: 'Marico', exchange: 'NSE', instrument_token: 1041153, sector: 'FMCG', market_cap: 'large' },
      { trading_symbol: 'BAJAJ-AUTO', name: 'Bajaj Auto', exchange: 'NSE', instrument_token: 4267265, sector: 'Auto', market_cap: 'large' },
      { trading_symbol: 'HEROMOTOCO', name: 'Hero MotoCorp', exchange: 'NSE', instrument_token: 345089, sector: 'Auto', market_cap: 'large' },
      { trading_symbol: 'EICHERMOT', name: 'Eicher Motors', exchange: 'NSE', instrument_token: 232961, sector: 'Auto', market_cap: 'large' },
      { trading_symbol: 'APOLLOHOSP', name: 'Apollo Hospitals', exchange: 'NSE', instrument_token: 40193, sector: 'Healthcare', market_cap: 'large' },
      { trading_symbol: 'BIOCON', name: 'Biocon', exchange: 'NSE', instrument_token: 2911489, sector: 'Pharma', market_cap: 'large' },
      { trading_symbol: 'INDUSINDBK', name: 'IndusInd Bank', exchange: 'NSE', instrument_token: 1346049, sector: 'Banking', market_cap: 'large' },
      { trading_symbol: 'BPCL', name: 'BPCL', exchange: 'NSE', instrument_token: 134657, sector: 'Oil & Gas', market_cap: 'large' },
      { trading_symbol: 'IOC', name: 'Indian Oil Corp', exchange: 'NSE', instrument_token: 415745, sector: 'Oil & Gas', market_cap: 'large' },
      { trading_symbol: 'RECLTD', name: 'REC Limited', exchange: 'NSE', instrument_token: 3930881, sector: 'Finance', market_cap: 'large' }
    ];
    
    for (const inst of popularInstruments) {
      await c.env.DB.prepare(`
        INSERT INTO instruments_cache (instrument_token, trading_symbol, name, exchange, sector, market_cap, instrument_type)
        VALUES (?, ?, ?, ?, ?, ?, 'EQ')
        ON CONFLICT(trading_symbol, exchange) DO UPDATE SET
          name = excluded.name,
          sector = excluded.sector,
          market_cap = excluded.market_cap,
          updated_at = datetime('now')
      `).bind(
        inst.instrument_token,
        inst.trading_symbol,
        inst.name,
        inst.exchange,
        inst.sector,
        inst.market_cap
      ).run();
    }
    
    return c.json(successResponse({
      refreshed: popularInstruments.length,
      message: 'Instruments cache updated'
    }));
  } catch (error) {
    console.error('Refresh error:', error);
    return c.json(errorResponse('ERROR', 'Failed to refresh instruments'), 500);
  }
});

export default instruments;
