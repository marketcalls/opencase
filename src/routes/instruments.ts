/**
 * Instruments Routes
 * Master contract download, stock search with LTP
 */

import { Hono } from 'hono';
import type { 
  Bindings, 
  Variables, 
  Account,
  SessionData,
  MasterInstrument
} from '../types';
import { successResponse, errorResponse, decrypt } from '../lib/utils';
import { KiteClient } from '../lib/kite';

const instruments = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * Helper to get KiteClient from app config or account
 */
async function getKiteClientFromConfig(c: any): Promise<KiteClient | null> {
  const encryptionKey = c.env.ENCRYPTION_KEY || 'opencase-default-key-32chars!!!';
  
  // First try to get from app_config
  const apiKeyConfig = await c.env.DB.prepare(
    "SELECT config_value FROM app_config WHERE config_key = 'kite_api_key'"
  ).first<{ config_value: string }>();
  
  const apiSecretConfig = await c.env.DB.prepare(
    "SELECT config_value FROM app_config WHERE config_key = 'kite_api_secret'"
  ).first<{ config_value: string }>();
  
  if (apiKeyConfig?.config_value && apiSecretConfig?.config_value) {
    const apiKey = await decrypt(apiKeyConfig.config_value, encryptionKey);
    const apiSecret = await decrypt(apiSecretConfig.config_value, encryptionKey);
    return new KiteClient(apiKey, apiSecret);
  }
  
  return null;
}

/**
 * Helper to get authenticated KiteClient
 */
async function getAuthenticatedKiteClient(c: any, accountId: number): Promise<KiteClient | null> {
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
 * GET /api/instruments/status
 * Get master instruments download status
 */
instruments.get('/status', async (c) => {
  try {
    const lastDownload = await c.env.DB.prepare(
      "SELECT config_value FROM app_config WHERE config_key = 'instruments_last_download'"
    ).first<{ config_value: string }>();
    
    const count = await c.env.DB.prepare(
      "SELECT COUNT(*) as count FROM master_instruments"
    ).first<{ count: number }>();
    
    const nseCount = await c.env.DB.prepare(
      "SELECT COUNT(*) as count FROM master_instruments WHERE exchange = 'NSE'"
    ).first<{ count: number }>();
    
    const bseCount = await c.env.DB.prepare(
      "SELECT COUNT(*) as count FROM master_instruments WHERE exchange = 'BSE'"
    ).first<{ count: number }>();
    
    return c.json(successResponse({
      last_download: lastDownload?.config_value || null,
      total_instruments: count?.count || 0,
      nse_instruments: nseCount?.count || 0,
      bse_instruments: bseCount?.count || 0,
      needs_download: !lastDownload?.config_value || (count?.count || 0) === 0
    }));
  } catch (error) {
    console.error('Instruments status error:', error);
    return c.json(errorResponse('ERROR', 'Failed to get status'), 500);
  }
});

/**
 * POST /api/instruments/download
 * Download master instruments from Zerodha Kite API (requires auth)
 */
instruments.post('/download', async (c) => {
  const sessionId = c.req.header('X-Session-ID');
  
  if (!sessionId) {
    return c.json(errorResponse('UNAUTHORIZED', 'Session required'), 401);
  }
  
  const sessionData = await c.env.KV.get(`session:${sessionId}`, 'json') as SessionData | null;
  
  if (!sessionData) {
    return c.json(errorResponse('UNAUTHORIZED', 'Invalid session'), 401);
  }
  
  try {
    const kite = await getAuthenticatedKiteClient(c, sessionData.account_id);
    
    if (!kite) {
      return c.json(errorResponse('NOT_AUTHENTICATED', 'Please login to Zerodha first'), 401);
    }
    
    // Download instruments CSV from Kite
    const csvData = await kite.downloadInstruments();
    
    if (!csvData || csvData.length === 0) {
      return c.json(errorResponse('DOWNLOAD_FAILED', 'Failed to download instruments'), 500);
    }
    
    // Parse CSV
    const lines = csvData.split('\n');
    const headers = lines[0].split(',');
    
    // Find column indices
    const colIndex: Record<string, number> = {};
    headers.forEach((h, i) => {
      colIndex[h.trim().toLowerCase()] = i;
    });
    
    // Clear existing instruments for NSE and BSE
    await c.env.DB.prepare(
      "DELETE FROM master_instruments WHERE exchange IN ('NSE', 'BSE')"
    ).run();
    
    // Process and insert instruments (only NSE/BSE equity)
    let inserted = 0;
    const batchSize = 100;
    let batch: any[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Parse CSV line (handle commas in quotes)
      const values = parseCSVLine(line);
      if (values.length < headers.length) continue;
      
      const exchange = values[colIndex['exchange']]?.trim();
      const segment = values[colIndex['segment']]?.trim();
      const instrumentType = values[colIndex['instrument_type']]?.trim();
      
      // Only include NSE and BSE equity instruments
      if ((exchange === 'NSE' || exchange === 'BSE') && 
          (segment === 'NSE' || segment === 'BSE') &&
          (instrumentType === 'EQ' || segment === 'INDICES')) {
        
        batch.push({
          instrument_token: parseInt(values[colIndex['instrument_token']]) || 0,
          exchange_token: parseInt(values[colIndex['exchange_token']]) || 0,
          trading_symbol: values[colIndex['tradingsymbol']]?.trim() || '',
          name: values[colIndex['name']]?.trim() || '',
          exchange: exchange,
          segment: segment,
          instrument_type: instrumentType || 'EQ',
          tick_size: parseFloat(values[colIndex['tick_size']]) || 0.05,
          lot_size: parseInt(values[colIndex['lot_size']]) || 1,
          expiry: values[colIndex['expiry']]?.trim() || null,
          strike: parseFloat(values[colIndex['strike']]) || null
        });
        
        if (batch.length >= batchSize) {
          await insertInstrumentsBatch(c.env.DB, batch);
          inserted += batch.length;
          batch = [];
        }
      }
    }
    
    // Insert remaining batch
    if (batch.length > 0) {
      await insertInstrumentsBatch(c.env.DB, batch);
      inserted += batch.length;
    }
    
    // Update last download timestamp
    const now = new Date().toISOString();
    await c.env.DB.prepare(`
      INSERT INTO app_config (config_key, config_value, is_encrypted)
      VALUES ('instruments_last_download', ?, 0)
      ON CONFLICT(config_key) DO UPDATE SET config_value = ?, updated_at = datetime('now')
    `).bind(now, now).run();
    
    return c.json(successResponse({
      downloaded: inserted,
      timestamp: now,
      message: `Successfully downloaded ${inserted} instruments`
    }));
  } catch (error) {
    console.error('Download error:', error);
    return c.json(errorResponse('DOWNLOAD_ERROR', `Failed to download: ${(error as Error).message}`), 500);
  }
});

/**
 * Helper to parse CSV line (handles quoted values)
 */
function parseCSVLine(line: string): string[] {
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

/**
 * Helper to insert instruments in batch
 */
async function insertInstrumentsBatch(db: D1Database, instruments: any[]): Promise<void> {
  for (const inst of instruments) {
    await db.prepare(`
      INSERT INTO master_instruments (
        instrument_token, exchange_token, trading_symbol, name, exchange,
        segment, instrument_type, tick_size, lot_size, expiry, strike
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(trading_symbol, exchange) DO UPDATE SET
        instrument_token = excluded.instrument_token,
        exchange_token = excluded.exchange_token,
        name = excluded.name,
        segment = excluded.segment,
        instrument_type = excluded.instrument_type,
        tick_size = excluded.tick_size,
        lot_size = excluded.lot_size,
        expiry = excluded.expiry,
        strike = excluded.strike,
        updated_at = datetime('now')
    `).bind(
      inst.instrument_token,
      inst.exchange_token,
      inst.trading_symbol,
      inst.name,
      inst.exchange,
      inst.segment,
      inst.instrument_type,
      inst.tick_size,
      inst.lot_size,
      inst.expiry,
      inst.strike
    ).run();
  }
}

/**
 * GET /api/instruments/search
 * Search for stocks with optional LTP
 */
instruments.get('/search', async (c) => {
  const query = c.req.query('q')?.toUpperCase();
  const exchange = c.req.query('exchange');
  const limit = parseInt(c.req.query('limit') || '20');
  const withLtp = c.req.query('with_ltp') === 'true';
  const sessionId = c.req.header('X-Session-ID');
  
  if (!query || query.length < 1) {
    return c.json(successResponse([]));
  }
  
  try {
    let sql = `
      SELECT * FROM master_instruments
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
    
    const results = await c.env.DB.prepare(sql).bind(...params).all<MasterInstrument>();
    let instrumentsWithLtp = results.results;
    
    // Fetch LTP if requested and authenticated
    if (withLtp && sessionId && results.results.length > 0) {
      const sessionData = await c.env.KV.get(`session:${sessionId}`, 'json') as SessionData | null;
      
      if (sessionData) {
        const kite = await getAuthenticatedKiteClient(c, sessionData.account_id);
        
        if (kite) {
          try {
            const symbols = results.results.map(i => `${i.exchange}:${i.trading_symbol}`);
            const ltpData = await kite.getLTP(symbols);
            
            instrumentsWithLtp = results.results.map(inst => {
              const key = `${inst.exchange}:${inst.trading_symbol}`;
              return {
                ...inst,
                last_price: ltpData[key]?.last_price || null
              };
            });
          } catch (e) {
            console.error('Failed to fetch LTP:', e);
          }
        }
      }
    }
    
    return c.json(successResponse(instrumentsWithLtp));
  } catch (error) {
    console.error('Search error:', error);
    return c.json(errorResponse('ERROR', 'Search failed'), 500);
  }
});

/**
 * GET /api/instruments/popular
 * Get popular stocks with LTP
 */
instruments.get('/popular', async (c) => {
  const sessionId = c.req.header('X-Session-ID');
  
  try {
    const popularSymbols = [
      'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
      'HINDUNILVR', 'ITC', 'SBIN', 'BHARTIARTL', 'KOTAKBANK',
      'LT', 'AXISBANK', 'WIPRO', 'HCLTECH', 'ASIANPAINT',
      'MARUTI', 'TITAN', 'SUNPHARMA', 'BAJFINANCE', 'NESTLEIND'
    ];
    
    const placeholders = popularSymbols.map(() => '?').join(',');
    
    const results = await c.env.DB.prepare(`
      SELECT * FROM master_instruments
      WHERE trading_symbol IN (${placeholders}) AND exchange = 'NSE'
      ORDER BY trading_symbol
    `).bind(...popularSymbols).all<MasterInstrument>();
    
    let instrumentsWithLtp = results.results;
    
    // Fetch LTP if authenticated
    if (sessionId && results.results.length > 0) {
      const sessionData = await c.env.KV.get(`session:${sessionId}`, 'json') as SessionData | null;
      
      if (sessionData) {
        const kite = await getAuthenticatedKiteClient(c, sessionData.account_id);
        
        if (kite) {
          try {
            const symbols = results.results.map(i => `${i.exchange}:${i.trading_symbol}`);
            const ltpData = await kite.getLTP(symbols);
            
            instrumentsWithLtp = results.results.map(inst => {
              const key = `${inst.exchange}:${inst.trading_symbol}`;
              return {
                ...inst,
                last_price: ltpData[key]?.last_price || null
              };
            });
          } catch (e) {
            console.error('Failed to fetch LTP:', e);
          }
        }
      }
    }
    
    return c.json(successResponse(instrumentsWithLtp));
  } catch (error) {
    console.error('Popular stocks error:', error);
    return c.json(errorResponse('ERROR', 'Failed to fetch popular stocks'), 500);
  }
});

/**
 * GET /api/instruments/ltp
 * Get LTP for multiple instruments
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
        const kite = await getAuthenticatedKiteClient(c, sessionData.account_id);
        
        if (kite) {
          ltp = await kite.getLTP(symbols);
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
 * GET /api/instruments/quotes
 * Get full quotes for instruments
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
        const kite = await getAuthenticatedKiteClient(c, sessionData.account_id);
        
        if (kite) {
          quotes = await kite.getQuotes(symbols);
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
 * GET /api/instruments/by-token/:token
 * Get instrument by token
 */
instruments.get('/by-token/:token', async (c) => {
  const token = parseInt(c.req.param('token'));
  
  try {
    const instrument = await c.env.DB.prepare(
      'SELECT * FROM master_instruments WHERE instrument_token = ?'
    ).bind(token).first<MasterInstrument>();
    
    if (!instrument) {
      return c.json(errorResponse('NOT_FOUND', 'Instrument not found'), 404);
    }
    
    return c.json(successResponse(instrument));
  } catch (error) {
    console.error('Get instrument error:', error);
    return c.json(errorResponse('ERROR', 'Failed to fetch instrument'), 500);
  }
});

export default instruments;
