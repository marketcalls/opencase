/**
 * Instruments Routes
 * Master contract download, stock search with LTP
 */

import { Hono } from 'hono';
import type { 
  Bindings, 
  Variables, 
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

// User session interface
interface UserSession {
  user_id: number;
  email: string;
  name: string;
  is_admin: boolean;
  expires_at: number;
}

/**
 * Helper to get authenticated KiteClient from user's connected broker accounts
 */
async function getAuthenticatedKiteClient(c: any, userId: number): Promise<KiteClient | null> {
  const encryptionKey = c.env.ENCRYPTION_KEY || 'opencase-default-key-32chars!!!';
  
  // Get user's connected Zerodha broker account
  const brokerAccount = await c.env.DB.prepare(
    `SELECT * FROM broker_accounts 
     WHERE user_id = ? AND broker_type = 'zerodha' AND is_connected = 1 AND is_active = 1
     ORDER BY last_connected_at DESC LIMIT 1`
  ).bind(userId).first<any>();
  
  if (!brokerAccount?.access_token || !brokerAccount?.api_key_encrypted) {
    return null;
  }
  
  const apiKey = await decrypt(brokerAccount.api_key_encrypted, encryptionKey);
  const apiSecret = await decrypt(brokerAccount.api_secret_encrypted, encryptionKey);
  
  return new KiteClient(apiKey, apiSecret, brokerAccount.access_token);
}

/**
 * GET /api/instruments/status
 * Get master instruments download status
 */
instruments.get('/status', async (c) => {
  try {
    // Get Zerodha download timestamp
    const zerodhaLastDownload = await c.env.DB.prepare(
      "SELECT config_value FROM app_config WHERE config_key = 'instruments_last_download'"
    ).first<{ config_value: string }>();

    // Get AngelOne download timestamp
    const angeloneLastDownload = await c.env.DB.prepare(
      "SELECT config_value FROM app_config WHERE config_key = 'angelone_last_download'"
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

    // Count instruments with Zerodha tokens
    const zerodhaCount = await c.env.DB.prepare(
      "SELECT COUNT(*) as count FROM master_instruments WHERE zerodha_token IS NOT NULL"
    ).first<{ count: number }>();

    // Count instruments with AngelOne tokens
    const angeloneCount = await c.env.DB.prepare(
      "SELECT COUNT(*) as count FROM master_instruments WHERE angelone_token IS NOT NULL"
    ).first<{ count: number }>();

    // Count instruments with both broker tokens
    const bothCount = await c.env.DB.prepare(
      "SELECT COUNT(*) as count FROM master_instruments WHERE zerodha_token IS NOT NULL AND angelone_token IS NOT NULL"
    ).first<{ count: number }>();

    return c.json(successResponse({
      last_download: zerodhaLastDownload?.config_value || null,
      zerodha_last_download: zerodhaLastDownload?.config_value || null,
      angelone_last_download: angeloneLastDownload?.config_value || null,
      total_instruments: count?.count || 0,
      nse_instruments: nseCount?.count || 0,
      bse_instruments: bseCount?.count || 0,
      zerodha_instruments: zerodhaCount?.count || 0,
      angelone_instruments: angeloneCount?.count || 0,
      both_brokers: bothCount?.count || 0,
      needs_download: !zerodhaLastDownload?.config_value || (count?.count || 0) === 0,
      needs_angelone_download: !angeloneLastDownload?.config_value
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
  
  const userSession = await c.env.KV.get(`user:${sessionId}`, 'json') as UserSession | null;
  
  if (!userSession || userSession.expires_at < Date.now()) {
    return c.json(errorResponse('UNAUTHORIZED', 'Invalid session'), 401);
  }
  
  try {
    const kite = await getAuthenticatedKiteClient(c, userSession.user_id);
    
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
    
    // Clear existing Zerodha instruments for NSE, BSE, and indices (keep AngelOne data if any)
    // Option 1: Delete rows that only have Zerodha data (no AngelOne data)
    await c.env.DB.prepare(
      "DELETE FROM master_instruments WHERE exchange IN ('NSE', 'BSE', 'NSE_INDEX', 'BSE_INDEX') AND source = 'zerodha' AND angelone_token IS NULL"
    ).run();

    // Option 2: Clear Zerodha columns from rows that have both brokers' data
    await c.env.DB.prepare(
      "UPDATE master_instruments SET zerodha_token = NULL, zerodha_exchange_token = NULL, zerodha_trading_symbol = NULL, last_downloaded_from = 'angelone' WHERE exchange IN ('NSE', 'BSE', 'NSE_INDEX', 'BSE_INDEX') AND angelone_token IS NOT NULL"
    ).run();

    console.log('[Zerodha] Cleared existing Zerodha data');
    
    // Process and insert instruments (only NSE/BSE equity)
    let inserted = 0;
    const batchSize = 500; // Increased batch size since we use D1 batch API
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
      
      // Only include NSE and BSE equity instruments (and indices)
      if ((exchange === 'NSE' || exchange === 'BSE') &&
          (segment === 'NSE' || segment === 'BSE' || segment === 'INDICES') &&
          (instrumentType === 'EQ' || segment === 'INDICES')) {

        const brokerSymbol = values[colIndex['tradingsymbol']]?.trim() || '';
        // Unified symbol: for equity, tradingsymbol IS the unified symbol (Zerodha uses TCS, INFY)
        const unifiedSymbol = brokerSymbol;

        // Map exchange for indices (same as OpenAlgo)
        let finalExchange = exchange;
        if (segment === 'INDICES') {
          if (exchange === 'NSE') finalExchange = 'NSE_INDEX';
          else if (exchange === 'BSE') finalExchange = 'BSE_INDEX';
        }

        // For equity instruments, expiry and strike should be NULL
        const instType = segment === 'INDICES' ? 'INDEX' : (instrumentType || 'EQ');
        const isEquity = instType === 'EQ' || instType === 'INDEX';

        // Only set expiry/strike for derivatives
        const expiryVal = values[colIndex['expiry']]?.trim();
        const strikeVal = parseFloat(values[colIndex['strike']]);
        const expiry = (!isEquity && expiryVal) ? expiryVal : null;
        const strike = (!isEquity && strikeVal > 0) ? strikeVal : null;

        // Zerodha CSV has tick_size already in decimal (0.05), no division needed
        const tickSize = parseFloat(values[colIndex['tick_size']]) || 0;
        const lotSize = parseInt(values[colIndex['lot_size']]) || 1;

        batch.push({
          instrument_token: parseInt(values[colIndex['instrument_token']]) || 0,
          exchange_token: parseInt(values[colIndex['exchange_token']]) || 0,
          trading_symbol: brokerSymbol,           // Original: RELIANCE, TCS, INFY
          symbol: unifiedSymbol,                  // Unified: same as trading_symbol for Zerodha
          name: values[colIndex['name']]?.trim() || '',
          exchange: finalExchange,                // NSE, BSE, NSE_INDEX, BSE_INDEX
          segment: segment,
          instrument_type: instType,
          tick_size: tickSize,                    // Already in decimal: 0.05, 0.01, etc.
          lot_size: lotSize,
          expiry: expiry,
          strike: strike
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
 * POST /api/instruments/download-angelone
 * Download master instruments from AngelOne API (no auth required, public JSON)
 */
instruments.post('/download-angelone', async (c) => {
  const sessionId = c.req.header('X-Session-ID');

  if (!sessionId) {
    return c.json(errorResponse('UNAUTHORIZED', 'Session required'), 401);
  }

  const userSession = await c.env.KV.get(`user:${sessionId}`, 'json') as UserSession | null;

  if (!userSession || userSession.expires_at < Date.now()) {
    return c.json(errorResponse('UNAUTHORIZED', 'Invalid session'), 401);
  }

  try {
    // AngelOne provides public JSON file with all instruments
    const angelOneUrl = 'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json';

    console.log('[AngelOne] Downloading instruments from:', angelOneUrl);
    const response = await fetch(angelOneUrl);

    if (!response.ok) {
      return c.json(errorResponse('DOWNLOAD_FAILED', `Failed to download: ${response.status}`), 500);
    }

    const jsonData = await response.json() as any[];
    console.log('[AngelOne] Downloaded', jsonData.length, 'total instruments');

    if (!jsonData || jsonData.length === 0) {
      return c.json(errorResponse('DOWNLOAD_FAILED', 'Empty response from AngelOne'), 500);
    }

    // Filter for NSE and BSE equity instruments only
    const equityInstruments = jsonData.filter((inst: any) => {
      const exchange = inst.exch_seg;
      const instrumentType = inst.instrumenttype;

      // Only include NSE/BSE equity and indices
      return (exchange === 'NSE' || exchange === 'BSE') &&
             (instrumentType === 'EQ' || instrumentType === '' || instrumentType === 'AMXIDX');
    });

    console.log('[AngelOne] Filtered to', equityInstruments.length, 'NSE/BSE equity instruments');

    // Clear existing AngelOne data before fresh download
    // Option 1: Delete rows that only have AngelOne data (no Zerodha data)
    await c.env.DB.prepare(
      "DELETE FROM master_instruments WHERE exchange IN ('NSE', 'BSE', 'NSE_INDEX', 'BSE_INDEX', 'MCX_INDEX') AND source = 'angelone' AND zerodha_token IS NULL"
    ).run();

    // Option 2: Clear AngelOne columns from rows that have both brokers' data
    await c.env.DB.prepare(
      "UPDATE master_instruments SET angelone_token = NULL, angelone_trading_symbol = NULL, last_downloaded_from = 'zerodha' WHERE exchange IN ('NSE', 'BSE', 'NSE_INDEX', 'BSE_INDEX', 'MCX_INDEX') AND zerodha_token IS NOT NULL"
    ).run();

    console.log('[AngelOne] Cleared existing AngelOne data');

    // Process and insert instruments in batches
    let inserted = 0;
    const batchSize = 500;
    let batch: any[] = [];

    for (const inst of equityInstruments) {
      // Clean symbol: remove -EQ, -BE, -MF, -SG suffixes to get unified symbol
      const unifiedSymbol = (inst.symbol || '').replace(/-EQ$|-BE$|-MF$|-SG$/, '');
      const brokerSymbol = inst.symbol || '';  // Original broker symbol
      const originalExchange = inst.exch_seg;

      if (!unifiedSymbol || !inst.token) continue;

      // Map exchange for indices (same as OpenAlgo)
      let exchange = originalExchange;
      if (inst.instrumenttype === 'AMXIDX') {
        if (originalExchange === 'NSE') exchange = 'NSE_INDEX';
        else if (originalExchange === 'BSE') exchange = 'BSE_INDEX';
        else if (originalExchange === 'MCX') exchange = 'MCX_INDEX';
      }

      // For equity instruments, expiry and strike should be NULL to match Zerodha
      const instrumentType = inst.instrumenttype === 'AMXIDX' ? 'INDEX' : (inst.instrumenttype || 'EQ');
      const isEquity = instrumentType === 'EQ' || instrumentType === 'INDEX' || instrumentType === '';

      // Only set expiry/strike for derivatives (FUT, CE, PE, etc.)
      const expiry = (!isEquity && inst.expiry) ? inst.expiry : null;
      const strike = (!isEquity && inst.strike && parseFloat(inst.strike) > 0)
        ? parseFloat(inst.strike) / 100
        : null;

      // AngelOne tick_size is in paise (5 = 0.05), divide by 100 as per OpenAlgo
      const tickSize = parseFloat(inst.tick_size) / 100 || 0;
      const lotSize = parseInt(inst.lotsize) || 1;

      batch.push({
        symbol: unifiedSymbol,                    // Unified: TCS, INFY, RELIANCE
        name: inst.name || '',
        exchange: exchange,                        // NSE, BSE, NSE_INDEX, BSE_INDEX
        instrument_type: instrumentType,
        segment: originalExchange,                 // Original segment
        tick_size: tickSize,                       // Converted: 5 -> 0.05, 1 -> 0.01
        lot_size: lotSize,
        expiry: expiry,
        strike: strike,
        angelone_token: inst.token,
        angelone_trading_symbol: brokerSymbol      // Broker-specific: TCS-EQ, INFY-EQ, TCS
      });

      if (batch.length >= batchSize) {
        await insertAngelOneInstrumentsBatch(c.env.DB, batch);
        inserted += batch.length;
        batch = [];
      }
    }

    // Insert remaining batch
    if (batch.length > 0) {
      await insertAngelOneInstrumentsBatch(c.env.DB, batch);
      inserted += batch.length;
    }

    // Update last download timestamp
    const now = new Date().toISOString();
    await c.env.DB.prepare(`
      INSERT INTO app_config (config_key, config_value, is_encrypted)
      VALUES ('angelone_last_download', ?, 0)
      ON CONFLICT(config_key) DO UPDATE SET config_value = ?, updated_at = datetime('now')
    `).bind(now, now).run();

    return c.json(successResponse({
      downloaded: inserted,
      timestamp: now,
      message: `Successfully downloaded ${inserted} AngelOne instruments`
    }));
  } catch (error) {
    console.error('AngelOne download error:', error);
    return c.json(errorResponse('DOWNLOAD_ERROR', `Failed to download: ${(error as Error).message}`), 500);
  }
});

/**
 * Helper to insert AngelOne instruments in batch
 * Updates existing rows with angelone_token or inserts new rows
 */
async function insertAngelOneInstrumentsBatch(db: D1Database, instruments: any[]): Promise<void> {
  if (instruments.length === 0) return;

  // Build batch of prepared statements
  const statements = instruments.map(inst => {
    return db.prepare(`
      INSERT INTO master_instruments (
        symbol, name, exchange, instrument_type, segment, tick_size, lot_size, expiry, strike,
        angelone_token, angelone_trading_symbol, source, last_downloaded_from
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'angelone', 'angelone')
      ON CONFLICT(symbol, exchange, instrument_type, expiry, strike) DO UPDATE SET
        name = COALESCE(master_instruments.name, excluded.name),
        segment = COALESCE(master_instruments.segment, excluded.segment),
        tick_size = COALESCE(master_instruments.tick_size, excluded.tick_size),
        lot_size = COALESCE(master_instruments.lot_size, excluded.lot_size),
        angelone_token = excluded.angelone_token,
        angelone_trading_symbol = excluded.angelone_trading_symbol,
        last_downloaded_from = CASE
          WHEN master_instruments.zerodha_token IS NOT NULL THEN 'both'
          ELSE 'angelone'
        END,
        updated_at = datetime('now')
    `).bind(
      inst.symbol,
      inst.name,
      inst.exchange,
      inst.instrument_type,
      inst.segment,
      inst.tick_size,
      inst.lot_size,
      inst.expiry,
      inst.strike,
      inst.angelone_token,
      inst.angelone_trading_symbol
    );
  });

  // Execute all statements in a single batch (single round trip)
  await db.batch(statements);
}

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
 * Helper to insert instruments in batch (Unified schema)
 * Uses D1 batch API for much faster inserts
 */
async function insertInstrumentsBatch(db: D1Database, instruments: any[]): Promise<void> {
  if (instruments.length === 0) return;

  // Build batch of prepared statements
  const statements = instruments.map(inst => {
    // Use pre-computed unified symbol (already extracted in download logic)
    const symbol = inst.symbol || inst.trading_symbol;

    return db.prepare(`
      INSERT INTO master_instruments (
        symbol, name, exchange, instrument_type, segment, tick_size, lot_size, expiry, strike,
        zerodha_token, zerodha_exchange_token, zerodha_trading_symbol, source, last_downloaded_from
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'zerodha', 'zerodha')
      ON CONFLICT(symbol, exchange, instrument_type, expiry, strike) DO UPDATE SET
        name = excluded.name,
        segment = excluded.segment,
        tick_size = excluded.tick_size,
        lot_size = excluded.lot_size,
        zerodha_token = excluded.zerodha_token,
        zerodha_exchange_token = excluded.zerodha_exchange_token,
        zerodha_trading_symbol = excluded.zerodha_trading_symbol,
        last_downloaded_from = CASE
          WHEN master_instruments.angelone_token IS NOT NULL THEN 'both'
          ELSE 'zerodha'
        END,
        updated_at = datetime('now')
    `).bind(
      symbol,                    // Unified symbol: TCS, INFY, RELIANCE
      inst.name,
      inst.exchange,             // NSE, BSE, NSE_INDEX, BSE_INDEX
      inst.instrument_type,
      inst.segment,
      inst.tick_size,
      inst.lot_size,
      inst.expiry,
      inst.strike,
      inst.instrument_token,     // Zerodha token
      inst.exchange_token,       // Zerodha exchange token
      inst.trading_symbol        // Broker symbol: same as unified for Zerodha
    );
  });

  // Execute all statements in a single batch (single round trip)
  await db.batch(statements);
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
    // Determine which broker is selected (from X-Active-Broker-ID header)
    let activeBroker: 'zerodha' | 'angelone' | null = null;
    let userSession: UserSession | null = null;
    let activeBrokerAccountId = c.req.header('X-Active-Broker-ID');

    if (sessionId) {
      userSession = await c.env.KV.get(`user:${sessionId}`, 'json') as UserSession | null;
      if (userSession && userSession.expires_at > Date.now()) {
        // Use the specifically selected broker account if provided
        if (activeBrokerAccountId) {
          const selectedBroker = await c.env.DB.prepare(`
            SELECT broker_type FROM broker_accounts
            WHERE id = ? AND user_id = ? AND is_connected = 1 AND is_active = 1
          `).bind(parseInt(activeBrokerAccountId), userSession.user_id).first<{ broker_type: string }>();

          if (selectedBroker) {
            activeBroker = selectedBroker.broker_type as 'zerodha' | 'angelone';
          }
        }

        // Fallback: if no specific broker selected, use most recently connected
        if (!activeBroker) {
          const connectedBroker = await c.env.DB.prepare(`
            SELECT broker_type FROM broker_accounts
            WHERE user_id = ? AND is_connected = 1 AND is_active = 1
            ORDER BY last_connected_at DESC LIMIT 1
          `).bind(userSession.user_id).first<{ broker_type: string }>();

          if (connectedBroker) {
            activeBroker = connectedBroker.broker_type as 'zerodha' | 'angelone';
          }
        }
      }
    }

    // Build query based on connected broker
    let sql = `
      SELECT
        id, symbol, name, exchange, instrument_type, segment, tick_size, lot_size, expiry, strike,
        zerodha_token, zerodha_exchange_token, zerodha_trading_symbol,
        angelone_token, angelone_trading_symbol,
        sector, industry, market_cap, isin, source, last_price,
        created_at, updated_at,
        -- Aliases for backward compatibility
        zerodha_token as instrument_token,
        zerodha_exchange_token as exchange_token,
        COALESCE(zerodha_trading_symbol, symbol) as trading_symbol
      FROM master_instruments
      WHERE (symbol LIKE ? OR zerodha_trading_symbol LIKE ? OR angelone_trading_symbol LIKE ? OR name LIKE ?)
        AND instrument_type = 'EQ'
    `;
    const params: any[] = [`${query}%`, `${query}%`, `${query}%`, `%${query}%`];

    // Filter by broker if connected - only show instruments with tokens for that broker
    if (activeBroker === 'zerodha') {
      sql += ' AND zerodha_token IS NOT NULL';
    } else if (activeBroker === 'angelone') {
      sql += ' AND angelone_token IS NOT NULL';
    }

    if (exchange) {
      sql += ' AND exchange = ?';
      params.push(exchange);
    } else {
      sql += ' AND exchange IN ("NSE", "BSE")';
    }

    sql += ' ORDER BY CASE WHEN symbol = ? THEN 0 WHEN symbol LIKE ? THEN 1 ELSE 2 END, symbol LIMIT ?';
    params.push(query, `${query}%`, limit);

    const results = await c.env.DB.prepare(sql).bind(...params).all<MasterInstrument>();
    let instrumentsWithLtp = results.results;
    
    // Fetch LTP if requested and authenticated
    if (withLtp && userSession && activeBroker && results.results.length > 0) {
      if (activeBroker === 'zerodha') {
        const kite = await getAuthenticatedKiteClient(c, userSession.user_id);

        if (kite) {
          try {
            // Use zerodha_trading_symbol for Kite API calls
            const symbols = results.results.map(i => {
              const tradingSymbol = (i as any).zerodha_trading_symbol || i.symbol;
              return `${i.exchange}:${tradingSymbol}`;
            });
            const ltpData = await kite.getLTP(symbols);

            instrumentsWithLtp = results.results.map(inst => {
              const tradingSymbol = (inst as any).zerodha_trading_symbol || inst.symbol;
              const key = `${inst.exchange}:${tradingSymbol}`;
              return {
                ...inst,
                last_price: ltpData[key]?.last_price || null
              };
            });
          } catch (e) {
            console.error('Failed to fetch LTP from Zerodha:', e);
          }
        }
      } else if (activeBroker === 'angelone') {
        // TODO: Implement AngelOne LTP fetching
        // For now, use stored last_price from instruments table
        console.log('AngelOne LTP fetching not yet implemented, using stored prices');
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
    
    // Use unified schema: symbol column instead of trading_symbol
    const results = await c.env.DB.prepare(`
      SELECT 
        id, symbol, name, exchange, instrument_type, segment, tick_size, lot_size, expiry, strike,
        zerodha_token, zerodha_exchange_token, zerodha_trading_symbol,
        angelone_token, angelone_trading_symbol,
        sector, industry, market_cap, isin, source, last_price,
        created_at, updated_at,
        -- Aliases for backward compatibility
        zerodha_token as instrument_token,
        zerodha_exchange_token as exchange_token,
        COALESCE(zerodha_trading_symbol, symbol) as trading_symbol
      FROM master_instruments
      WHERE symbol IN (${placeholders}) AND exchange = 'NSE'
      ORDER BY symbol
    `).bind(...popularSymbols).all<MasterInstrument>();
    
    let instrumentsWithLtp = results.results;
    
    // Fetch LTP if authenticated
    if (sessionId && results.results.length > 0) {
      const userSession = await c.env.KV.get(`user:${sessionId}`, 'json') as UserSession | null;
      
      if (userSession && userSession.expires_at > Date.now()) {
        const kite = await getAuthenticatedKiteClient(c, userSession.user_id);
        
        if (kite) {
          try {
            // Use zerodha_trading_symbol for Kite API calls
            const symbols = results.results.map(i => {
              const tradingSymbol = (i as any).zerodha_trading_symbol || (i as any).trading_symbol || i.symbol;
              return `${i.exchange}:${tradingSymbol}`;
            });
            const ltpData = await kite.getLTP(symbols);
            
            instrumentsWithLtp = results.results.map(inst => {
              const tradingSymbol = (inst as any).zerodha_trading_symbol || (inst as any).trading_symbol || inst.symbol;
              const key = `${inst.exchange}:${tradingSymbol}`;
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
      const userSession = await c.env.KV.get(`user:${sessionId}`, 'json') as UserSession | null;
      
      if (userSession && userSession.expires_at > Date.now()) {
        const kite = await getAuthenticatedKiteClient(c, userSession.user_id);
        
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
      const userSession = await c.env.KV.get(`user:${sessionId}`, 'json') as UserSession | null;
      
      if (userSession && userSession.expires_at > Date.now()) {
        const kite = await getAuthenticatedKiteClient(c, userSession.user_id);
        
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
    // Use zerodha_token in unified schema
    const instrument = await c.env.DB.prepare(`
      SELECT 
        id, symbol, name, exchange, instrument_type, segment, tick_size, lot_size, expiry, strike,
        zerodha_token, zerodha_exchange_token, zerodha_trading_symbol,
        angelone_token, angelone_trading_symbol,
        sector, industry, market_cap, isin, source, last_price,
        created_at, updated_at,
        -- Aliases for backward compatibility
        zerodha_token as instrument_token,
        zerodha_exchange_token as exchange_token,
        COALESCE(zerodha_trading_symbol, symbol) as trading_symbol
      FROM master_instruments WHERE zerodha_token = ?
    `).bind(token).first<MasterInstrument>();
    
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
