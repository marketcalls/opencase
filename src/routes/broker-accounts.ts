/**
 * Broker Accounts Routes
 * Manages multiple broker accounts (Zerodha, Angel One, etc.)
 * Users can add, remove, connect, and switch between broker accounts
 */

import { Hono } from 'hono';
import type { Bindings, Variables, BrokerType } from '../types';
import { successResponse, errorResponse, encrypt, decrypt, generateSessionId } from '../lib/utils';
import { KiteClient } from '../lib/kite';
import { AngelOneBroker } from '../brokers/angelone';

interface BrokerAccount {
  id: number;
  user_id: number;
  broker_type: BrokerType;
  account_name: string;
  broker_user_id: string | null;
  client_code: string | null;
  api_key_encrypted: string | null;
  api_secret_encrypted: string | null;
  mpin_encrypted: string | null;
  access_token: string | null;
  refresh_token: string | null;
  feed_token: string | null;
  token_expiry: string | null;
  is_connected: number;
  is_active: number;
  connection_status: string;
  last_connected_at: string | null;
  broker_name: string | null;
  broker_email: string | null;
  created_at: string;
  updated_at: string;
}

interface UserSession {
  user_id: number;
  email: string;
  name: string;
  is_admin: boolean;
  expires_at: number;
}

const brokerAccounts = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Middleware to check user session
async function getUserSession(c: any): Promise<UserSession | null> {
  const sessionId = c.req.header('X-Session-ID');
  if (!sessionId) return null;
  
  const sessionData = await c.env.KV.get(`user:${sessionId}`, 'json') as UserSession | null;
  if (!sessionData || sessionData.expires_at < Date.now()) return null;
  
  return sessionData;
}

/**
 * GET /api/broker-accounts
 * List all broker accounts for the current user
 */
brokerAccounts.get('/', async (c) => {
  const session = await getUserSession(c);
  if (!session) {
    return c.json(errorResponse('UNAUTHORIZED', 'Please login first'), 401);
  }
  
  try {
    const accounts = await c.env.DB.prepare(`
      SELECT id, broker_type, account_name, broker_user_id, client_code,
             is_connected, connection_status, last_connected_at,
             broker_name, broker_email, created_at
      FROM broker_accounts
      WHERE user_id = ? AND is_active = 1
      ORDER BY created_at ASC
    `).bind(session.user_id).all<BrokerAccount>();
    
    return c.json(successResponse(accounts.results));
  } catch (error) {
    console.error('List broker accounts error:', error);
    return c.json(errorResponse('ERROR', 'Failed to list accounts'), 500);
  }
});

/**
 * POST /api/broker-accounts
 * Add a new broker account
 */
brokerAccounts.post('/', async (c) => {
  const session = await getUserSession(c);
  if (!session) {
    return c.json(errorResponse('UNAUTHORIZED', 'Please login first'), 401);
  }
  
  try {
    const { broker_type, account_name, api_key, api_secret, client_code, mpin } = await c.req.json<{
      broker_type: BrokerType;
      account_name: string;
      api_key: string;
      api_secret: string;
      client_code?: string;  // Required for Angel One
      mpin?: string;         // Required for Angel One
    }>();
    
    if (!broker_type || !account_name || !api_key || !api_secret) {
      return c.json(errorResponse('INVALID_INPUT', 'Broker type, account name, API key, and API secret are required'), 400);
    }
    
    // Validate Angel One specific fields
    if (broker_type === 'angelone' && !client_code) {
      return c.json(errorResponse('INVALID_INPUT', 'Client Code is required for Angel One'), 400);
    }
    
    const encryptionKey = c.env.ENCRYPTION_KEY || 'opencase-default-key-32chars!!!';
    
    // Encrypt credentials
    const apiKeyEncrypted = await encrypt(api_key, encryptionKey);
    const apiSecretEncrypted = await encrypt(api_secret, encryptionKey);
    const mpinEncrypted = mpin ? await encrypt(mpin, encryptionKey) : null;
    
    // Create broker account
    const result = await c.env.DB.prepare(`
      INSERT INTO broker_accounts (
        user_id, broker_type, account_name, client_code,
        api_key_encrypted, api_secret_encrypted, mpin_encrypted,
        connection_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'disconnected')
    `).bind(
      session.user_id,
      broker_type,
      account_name,
      client_code || null,
      apiKeyEncrypted,
      apiSecretEncrypted,
      mpinEncrypted
    ).run();
    
    const accountId = result.meta.last_row_id;
    
    return c.json(successResponse({
      id: accountId,
      broker_type,
      account_name,
      message: `${broker_type === 'zerodha' ? 'Zerodha' : 'Angel One'} account added. Click "Connect" to login.`
    }));
  } catch (error: any) {
    console.error('Add broker account error:', error);
    if (error.message?.includes('UNIQUE constraint')) {
      return c.json(errorResponse('DUPLICATE', 'This broker account already exists'), 400);
    }
    return c.json(errorResponse('ERROR', 'Failed to add account'), 500);
  }
});

/**
 * DELETE /api/broker-accounts/:id
 * Remove a broker account
 */
brokerAccounts.delete('/:id', async (c) => {
  const session = await getUserSession(c);
  if (!session) {
    return c.json(errorResponse('UNAUTHORIZED', 'Please login first'), 401);
  }
  
  const accountId = parseInt(c.req.param('id'));
  
  try {
    // Verify ownership
    const account = await c.env.DB.prepare(
      'SELECT id FROM broker_accounts WHERE id = ? AND user_id = ?'
    ).bind(accountId, session.user_id).first();
    
    if (!account) {
      return c.json(errorResponse('NOT_FOUND', 'Account not found'), 404);
    }
    
    // Soft delete
    await c.env.DB.prepare(
      'UPDATE broker_accounts SET is_active = 0, updated_at = datetime("now") WHERE id = ?'
    ).bind(accountId).run();
    
    return c.json(successResponse({ deleted: true }));
  } catch (error) {
    console.error('Delete broker account error:', error);
    return c.json(errorResponse('ERROR', 'Failed to delete account'), 500);
  }
});

/**
 * POST /api/broker-accounts/:id/connect
 * Initiate connection to broker (returns login URL for Zerodha, or expects TOTP for Angel One)
 */
brokerAccounts.post('/:id/connect', async (c) => {
  const session = await getUserSession(c);
  if (!session) {
    return c.json(errorResponse('UNAUTHORIZED', 'Please login first'), 401);
  }
  
  const accountId = parseInt(c.req.param('id'));
  
  try {
    const account = await c.env.DB.prepare(
      'SELECT * FROM broker_accounts WHERE id = ? AND user_id = ? AND is_active = 1'
    ).bind(accountId, session.user_id).first<BrokerAccount>();
    
    if (!account) {
      return c.json(errorResponse('NOT_FOUND', 'Account not found'), 404);
    }
    
    const encryptionKey = c.env.ENCRYPTION_KEY || 'opencase-default-key-32chars!!!';
    
    if (account.broker_type === 'zerodha') {
      // For Zerodha, return OAuth login URL
      if (!account.api_key_encrypted) {
        return c.json(errorResponse('NO_CREDENTIALS', 'API credentials not configured'), 400);
      }
      
      const apiKey = await decrypt(account.api_key_encrypted, encryptionKey);
      
      // Build login URL with redirect_uri containing account ID
      // Note: The redirect_uri must match what's configured in Kite Connect app settings
      const loginUrl = `https://kite.zerodha.com/connect/login?api_key=${apiKey}&v=3`;
      
      // Store account ID for callback - will be retrieved by request_token or session
      await c.env.KV.put(`broker_login:${apiKey}`, String(accountId), { expirationTtl: 600 });
      
      return c.json(successResponse({
        broker_type: 'zerodha',
        login_url: loginUrl,
        account_id: accountId,
        message: 'Redirecting to Zerodha login...',
        note: 'Make sure your Kite Connect redirect URL is set to: ' + new URL(c.req.url).origin + '/api/broker-accounts/zerodha/callback'
      }));
    } else if (account.broker_type === 'angelone') {
      // For Angel One, need TOTP from request body
      const { totp } = await c.req.json<{ totp?: string }>().catch(() => ({ totp: undefined }));
      
      if (!totp) {
        return c.json(successResponse({
          broker_type: 'angelone',
          requires_totp: true,
          account_id: accountId,
          message: 'Please provide TOTP to connect'
        }));
      }
      
      if (!account.api_key_encrypted || !account.client_code || !account.mpin_encrypted) {
        return c.json(errorResponse('NO_CREDENTIALS', 'API credentials, Client Code, or MPIN not configured'), 400);
      }
      
      const apiKey = await decrypt(account.api_key_encrypted, encryptionKey);
      const mpin = await decrypt(account.mpin_encrypted, encryptionKey);
      
      // Login to Angel One
      const angelone = new AngelOneBroker(apiKey, '');
      
      try {
        const brokerSession = await angelone.createSession(account.client_code, mpin, totp);
        
        // Update account with session info
        await c.env.DB.prepare(`
          UPDATE broker_accounts SET
            broker_user_id = ?,
            access_token = ?,
            refresh_token = ?,
            feed_token = ?,
            token_expiry = datetime('now', '+1 day'),
            is_connected = 1,
            connection_status = 'connected',
            last_connected_at = datetime('now'),
            broker_name = ?,
            broker_email = ?,
            updated_at = datetime('now')
          WHERE id = ?
        `).bind(
          account.client_code,
          brokerSession.accessToken,
          brokerSession.refreshToken || null,
          null, // feed_token if available
          brokerSession.userName,
          brokerSession.email || null,
          accountId
        ).run();
        
        return c.json(successResponse({
          broker_type: 'angelone',
          connected: true,
          account_id: accountId,
          broker_name: brokerSession.userName,
          message: 'Connected to Angel One successfully!'
        }));
      } catch (loginError: any) {
        return c.json(errorResponse('AUTH_FAILED', loginError.message || 'Login failed. Check credentials and TOTP.'), 401);
      }
    }
    
    return c.json(errorResponse('UNSUPPORTED', 'Unsupported broker type'), 400);
  } catch (error) {
    console.error('Connect broker error:', error);
    return c.json(errorResponse('ERROR', 'Failed to connect'), 500);
  }
});

/**
 * POST /api/broker-accounts/:id/disconnect
 * Disconnect from broker
 */
brokerAccounts.post('/:id/disconnect', async (c) => {
  const session = await getUserSession(c);
  if (!session) {
    return c.json(errorResponse('UNAUTHORIZED', 'Please login first'), 401);
  }
  
  const accountId = parseInt(c.req.param('id'));
  
  try {
    await c.env.DB.prepare(`
      UPDATE broker_accounts SET
        access_token = NULL,
        refresh_token = NULL,
        feed_token = NULL,
        is_connected = 0,
        connection_status = 'disconnected',
        updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).bind(accountId, session.user_id).run();
    
    return c.json(successResponse({ disconnected: true }));
  } catch (error) {
    console.error('Disconnect broker error:', error);
    return c.json(errorResponse('ERROR', 'Failed to disconnect'), 500);
  }
});

/**
 * GET /api/broker-accounts/zerodha/callback
 * Handle Zerodha OAuth callback - finds account by stored API key mapping
 */
brokerAccounts.get('/zerodha/callback', async (c) => {
  const requestToken = c.req.query('request_token');
  const status = c.req.query('status');
  const apiKey = c.req.query('api_key'); // Zerodha includes this in callback
  
  if (status === 'cancelled') {
    return c.redirect('/accounts?error=login_cancelled');
  }
  
  if (!requestToken) {
    return c.redirect('/accounts?error=no_request_token');
  }
  
  try {
    const encryptionKey = c.env.ENCRYPTION_KEY || 'opencase-default-key-32chars!!!';
    
    // Try to find account ID from KV store (stored during connect)
    let accountId: number | null = null;
    if (apiKey) {
      const storedAccountId = await c.env.KV.get(`broker_login:${apiKey}`);
      if (storedAccountId) {
        accountId = parseInt(storedAccountId);
        await c.env.KV.delete(`broker_login:${apiKey}`);
      }
    }
    
    // If no account ID found, try to find by decrypting all Zerodha accounts
    if (!accountId) {
      const accounts = await c.env.DB.prepare(
        'SELECT * FROM broker_accounts WHERE broker_type = ? AND is_active = 1'
      ).bind('zerodha').all<BrokerAccount>();
      
      for (const acc of accounts.results) {
        if (acc.api_key_encrypted) {
          const decryptedKey = await decrypt(acc.api_key_encrypted, encryptionKey);
          if (decryptedKey === apiKey) {
            accountId = acc.id;
            break;
          }
        }
      }
    }
    
    if (!accountId) {
      return c.redirect('/accounts?error=account_not_found');
    }
    
    const account = await c.env.DB.prepare(
      'SELECT * FROM broker_accounts WHERE id = ? AND is_active = 1'
    ).bind(accountId).first<BrokerAccount>();
    
    if (!account || !account.api_key_encrypted || !account.api_secret_encrypted) {
      return c.redirect('/accounts?error=account_not_found');
    }
    
    const decryptedApiKey = await decrypt(account.api_key_encrypted, encryptionKey);
    const apiSecret = await decrypt(account.api_secret_encrypted, encryptionKey);
    
    // Exchange request token for access token
    const kite = new KiteClient(decryptedApiKey, apiSecret);
    const brokerSession = await kite.createSession(requestToken);
    
    // Update account with session info
    await c.env.DB.prepare(`
      UPDATE broker_accounts SET
        broker_user_id = ?,
        access_token = ?,
        refresh_token = ?,
        token_expiry = datetime('now', '+1 day'),
        is_connected = 1,
        connection_status = 'connected',
        last_connected_at = datetime('now'),
        broker_name = ?,
        broker_email = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      brokerSession.user_id,
      brokerSession.access_token,
      brokerSession.refresh_token || null,
      brokerSession.user_name,
      brokerSession.email || null,
      accountId
    ).run();
    
    return c.redirect('/accounts?success=connected');
  } catch (error) {
    console.error('Zerodha callback error:', error);
    return c.redirect('/accounts?error=auth_failed');
  }
});

/**
 * GET /api/broker-accounts/:id/callback
 * Handle Zerodha OAuth callback (legacy - with account ID in URL)
 */
brokerAccounts.get('/:id/callback', async (c) => {
  const accountId = parseInt(c.req.param('id'));
  const requestToken = c.req.query('request_token');
  const status = c.req.query('status');
  
  if (status === 'cancelled') {
    return c.redirect('/accounts?error=login_cancelled');
  }
  
  if (!requestToken) {
    return c.redirect('/accounts?error=no_request_token');
  }
  
  try {
    const account = await c.env.DB.prepare(
      'SELECT * FROM broker_accounts WHERE id = ? AND is_active = 1'
    ).bind(accountId).first<BrokerAccount>();
    
    if (!account || !account.api_key_encrypted || !account.api_secret_encrypted) {
      return c.redirect('/accounts?error=account_not_found');
    }
    
    const encryptionKey = c.env.ENCRYPTION_KEY || 'opencase-default-key-32chars!!!';
    const apiKey = await decrypt(account.api_key_encrypted, encryptionKey);
    const apiSecret = await decrypt(account.api_secret_encrypted, encryptionKey);
    
    // Exchange request token for access token
    const kite = new KiteClient(apiKey, apiSecret);
    const brokerSession = await kite.createSession(requestToken);
    
    // Update account with session info
    await c.env.DB.prepare(`
      UPDATE broker_accounts SET
        broker_user_id = ?,
        access_token = ?,
        refresh_token = ?,
        token_expiry = datetime('now', '+1 day'),
        is_connected = 1,
        connection_status = 'connected',
        last_connected_at = datetime('now'),
        broker_name = ?,
        broker_email = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      brokerSession.user_id,
      brokerSession.access_token,
      brokerSession.refresh_token || null,
      brokerSession.user_name,
      brokerSession.email || null,
      accountId
    ).run();
    
    return c.redirect('/accounts?success=connected');
  } catch (error) {
    console.error('Zerodha callback error:', error);
    return c.redirect(`/accounts?error=auth_failed`);
  }
});

/**
 * PUT /api/broker-accounts/:id
 * Update broker account settings
 */
brokerAccounts.put('/:id', async (c) => {
  const session = await getUserSession(c);
  if (!session) {
    return c.json(errorResponse('UNAUTHORIZED', 'Please login first'), 401);
  }
  
  const accountId = parseInt(c.req.param('id'));
  
  try {
    const { account_name, api_key, api_secret, mpin } = await c.req.json<{
      account_name?: string;
      api_key?: string;
      api_secret?: string;
      mpin?: string;
    }>();
    
    // Verify ownership
    const account = await c.env.DB.prepare(
      'SELECT id FROM broker_accounts WHERE id = ? AND user_id = ?'
    ).bind(accountId, session.user_id).first();
    
    if (!account) {
      return c.json(errorResponse('NOT_FOUND', 'Account not found'), 404);
    }
    
    const encryptionKey = c.env.ENCRYPTION_KEY || 'opencase-default-key-32chars!!!';
    const updates: string[] = [];
    const values: any[] = [];
    
    if (account_name) {
      updates.push('account_name = ?');
      values.push(account_name);
    }
    
    if (api_key) {
      updates.push('api_key_encrypted = ?');
      values.push(await encrypt(api_key, encryptionKey));
    }
    
    if (api_secret) {
      updates.push('api_secret_encrypted = ?');
      values.push(await encrypt(api_secret, encryptionKey));
    }
    
    if (mpin) {
      updates.push('mpin_encrypted = ?');
      values.push(await encrypt(mpin, encryptionKey));
    }
    
    if (updates.length > 0) {
      updates.push('updated_at = datetime("now")');
      values.push(accountId);
      
      await c.env.DB.prepare(`
        UPDATE broker_accounts SET ${updates.join(', ')} WHERE id = ?
      `).bind(...values).run();
    }
    
    return c.json(successResponse({ updated: true }));
  } catch (error) {
    console.error('Update broker account error:', error);
    return c.json(errorResponse('ERROR', 'Failed to update account'), 500);
  }
});

/**
 * GET /api/broker-accounts/active
 * Get the currently active/connected broker account for trading
 */
brokerAccounts.get('/active', async (c) => {
  const session = await getUserSession(c);
  if (!session) {
    return c.json(errorResponse('UNAUTHORIZED', 'Please login first'), 401);
  }
  
  try {
    // Get first connected account
    const account = await c.env.DB.prepare(`
      SELECT id, broker_type, account_name, broker_user_id, broker_name, broker_email,
             is_connected, connection_status, last_connected_at
      FROM broker_accounts
      WHERE user_id = ? AND is_active = 1 AND is_connected = 1
      ORDER BY last_connected_at DESC
      LIMIT 1
    `).bind(session.user_id).first<BrokerAccount>();
    
    if (!account) {
      return c.json(successResponse({
        has_active_account: false,
        account: null
      }));
    }
    
    return c.json(successResponse({
      has_active_account: true,
      account: account
    }));
  } catch (error) {
    console.error('Get active account error:', error);
    return c.json(errorResponse('ERROR', 'Failed to get active account'), 500);
  }
});

export default brokerAccounts;
