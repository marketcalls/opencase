/**
 * Authentication Routes
 * Handles Zerodha OAuth flow and session management
 */

import { Hono } from 'hono';
import type { Bindings, Variables, Account, SessionData } from '../types';
import { KiteClient } from '../lib/kite';
import { successResponse, errorResponse, generateSessionId, decrypt } from '../lib/utils';

const auth = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * GET /api/auth/status
 * Check authentication status and return account info
 */
auth.get('/status', async (c) => {
  const sessionId = c.req.header('X-Session-ID') || c.req.query('session_id');
  
  if (!sessionId) {
    return c.json(successResponse({ authenticated: false, account: null }));
  }
  
  try {
    const sessionData = await c.env.KV.get(`session:${sessionId}`, 'json') as SessionData | null;
    
    if (!sessionData || sessionData.expires_at < Date.now()) {
      return c.json(successResponse({ authenticated: false, account: null }));
    }
    
    // Get account details
    const account = await c.env.DB.prepare(
      'SELECT id, zerodha_user_id, name, email, avatar_url, is_primary FROM accounts WHERE id = ?'
    ).bind(sessionData.account_id).first<Account>();
    
    if (!account) {
      return c.json(successResponse({ authenticated: false, account: null }));
    }
    
    return c.json(successResponse({
      authenticated: true,
      account: {
        id: account.id,
        zerodha_user_id: account.zerodha_user_id,
        name: account.name,
        email: account.email,
        avatar_url: account.avatar_url,
        is_primary: account.is_primary
      }
    }));
  } catch (error) {
    console.error('Auth status error:', error);
    return c.json(errorResponse('AUTH_ERROR', 'Failed to check authentication status'));
  }
});

/**
 * GET /api/auth/login
 * Redirect to Zerodha login page
 */
auth.get('/login', async (c) => {
  const accountId = c.req.query('account_id');
  
  try {
    let apiKey: string | undefined;
    let apiSecret: string | undefined;
    
    if (accountId) {
      // Get credentials for specific account
      const account = await c.env.DB.prepare(
        'SELECT kite_api_key, kite_api_secret FROM accounts WHERE id = ?'
      ).bind(accountId).first<Account>();
      
      if (account?.kite_api_key && account?.kite_api_secret) {
        const encryptionKey = c.env.ENCRYPTION_KEY || 'stockbasket-default-key-32chars!';
        apiKey = await decrypt(account.kite_api_key, encryptionKey);
        apiSecret = await decrypt(account.kite_api_secret, encryptionKey);
      }
    }
    
    // Fall back to app-level credentials
    if (!apiKey) {
      const config = await c.env.DB.prepare(
        "SELECT config_value FROM app_config WHERE config_key = 'kite_api_key'"
      ).first<{ config_value: string }>();
      
      if (config?.config_value) {
        const encryptionKey = c.env.ENCRYPTION_KEY || 'stockbasket-default-key-32chars!';
        apiKey = await decrypt(config.config_value, encryptionKey);
      }
    }
    
    if (!apiKey) {
      apiKey = c.env.KITE_API_KEY;
    }
    
    if (!apiKey) {
      return c.json(errorResponse('NO_API_KEY', 'Kite API key not configured. Please set up your API credentials.'), 400);
    }
    
    const kite = new KiteClient(apiKey, '');
    const loginUrl = kite.getLoginUrl();
    
    // Store account_id in KV for callback
    if (accountId) {
      await c.env.KV.put(`login:${accountId}`, accountId, { expirationTtl: 600 });
    }
    
    return c.redirect(loginUrl);
  } catch (error) {
    console.error('Login error:', error);
    return c.json(errorResponse('LOGIN_ERROR', 'Failed to initiate login'), 500);
  }
});

/**
 * GET /api/auth/callback
 * Handle Zerodha OAuth callback
 */
auth.get('/callback', async (c) => {
  const requestToken = c.req.query('request_token');
  const status = c.req.query('status');
  
  if (status === 'cancelled') {
    return c.redirect('/?error=login_cancelled');
  }
  
  if (!requestToken) {
    return c.redirect('/?error=no_request_token');
  }
  
  try {
    // Get API credentials
    let apiKey: string | undefined;
    let apiSecret: string | undefined;
    const encryptionKey = c.env.ENCRYPTION_KEY || 'stockbasket-default-key-32chars!';
    
    // Try app-level credentials first
    const keyConfig = await c.env.DB.prepare(
      "SELECT config_value FROM app_config WHERE config_key = 'kite_api_key'"
    ).first<{ config_value: string }>();
    
    const secretConfig = await c.env.DB.prepare(
      "SELECT config_value FROM app_config WHERE config_key = 'kite_api_secret'"
    ).first<{ config_value: string }>();
    
    if (keyConfig?.config_value && secretConfig?.config_value) {
      apiKey = await decrypt(keyConfig.config_value, encryptionKey);
      apiSecret = await decrypt(secretConfig.config_value, encryptionKey);
    } else {
      apiKey = c.env.KITE_API_KEY;
      apiSecret = c.env.KITE_API_SECRET;
    }
    
    if (!apiKey || !apiSecret) {
      return c.redirect('/?error=api_credentials_missing');
    }
    
    // Exchange request token for access token
    const kite = new KiteClient(apiKey, apiSecret);
    const session = await kite.createSession(requestToken);
    
    // Check if account exists
    let account = await c.env.DB.prepare(
      'SELECT * FROM accounts WHERE zerodha_user_id = ?'
    ).bind(session.user_id).first<Account>();
    
    if (account) {
      // Update existing account
      await c.env.DB.prepare(`
        UPDATE accounts SET 
          name = ?,
          email = ?,
          access_token = ?,
          refresh_token = ?,
          access_token_expiry = datetime('now', '+1 day'),
          last_login_at = datetime('now'),
          updated_at = datetime('now')
        WHERE id = ?
      `).bind(
        session.user_name,
        session.email,
        session.access_token,
        session.refresh_token || null,
        account.id
      ).run();
    } else {
      // Create new account
      const result = await c.env.DB.prepare(`
        INSERT INTO accounts (zerodha_user_id, name, email, access_token, refresh_token, access_token_expiry, is_primary, last_login_at)
        VALUES (?, ?, ?, ?, ?, datetime('now', '+1 day'), 1, datetime('now'))
      `).bind(
        session.user_id,
        session.user_name,
        session.email,
        session.access_token,
        session.refresh_token || null
      ).run();
      
      account = await c.env.DB.prepare(
        'SELECT * FROM accounts WHERE zerodha_user_id = ?'
      ).bind(session.user_id).first<Account>();
    }
    
    if (!account) {
      return c.redirect('/?error=account_creation_failed');
    }
    
    // Create session
    const sessionId = generateSessionId();
    const sessionData: SessionData = {
      account_id: account.id,
      zerodha_user_id: session.user_id,
      access_token: session.access_token,
      name: session.user_name,
      email: session.email,
      expires_at: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
    };
    
    await c.env.KV.put(`session:${sessionId}`, JSON.stringify(sessionData), {
      expirationTtl: 86400 // 24 hours
    });
    
    // Redirect to dashboard with session
    return c.redirect(`/dashboard?session_id=${sessionId}`);
  } catch (error) {
    console.error('Callback error:', error);
    return c.redirect(`/?error=auth_failed&message=${encodeURIComponent(String(error))}`);
  }
});

/**
 * POST /api/auth/logout
 * Clear session
 */
auth.post('/logout', async (c) => {
  const sessionId = c.req.header('X-Session-ID');
  
  if (sessionId) {
    await c.env.KV.delete(`session:${sessionId}`);
  }
  
  return c.json(successResponse({ logged_out: true }));
});

/**
 * GET /api/auth/accounts
 * Get all linked accounts (for multi-account management)
 */
auth.get('/accounts', async (c) => {
  const sessionId = c.req.header('X-Session-ID');
  
  if (!sessionId) {
    return c.json(errorResponse('UNAUTHORIZED', 'Session required'), 401);
  }
  
  const sessionData = await c.env.KV.get(`session:${sessionId}`, 'json') as SessionData | null;
  
  if (!sessionData) {
    return c.json(errorResponse('UNAUTHORIZED', 'Invalid session'), 401);
  }
  
  try {
    const accounts = await c.env.DB.prepare(`
      SELECT id, zerodha_user_id, name, email, avatar_url, is_primary, is_active, last_login_at
      FROM accounts
      WHERE is_active = 1
      ORDER BY is_primary DESC, name ASC
    `).all<Account>();
    
    return c.json(successResponse(accounts.results));
  } catch (error) {
    console.error('Get accounts error:', error);
    return c.json(errorResponse('DB_ERROR', 'Failed to fetch accounts'), 500);
  }
});

/**
 * POST /api/auth/switch-account
 * Switch to a different account
 */
auth.post('/switch-account', async (c) => {
  const sessionId = c.req.header('X-Session-ID');
  const { account_id } = await c.req.json<{ account_id: number }>();
  
  if (!sessionId) {
    return c.json(errorResponse('UNAUTHORIZED', 'Session required'), 401);
  }
  
  try {
    const account = await c.env.DB.prepare(
      'SELECT * FROM accounts WHERE id = ? AND is_active = 1'
    ).bind(account_id).first<Account>();
    
    if (!account) {
      return c.json(errorResponse('NOT_FOUND', 'Account not found'), 404);
    }
    
    if (!account.access_token) {
      return c.json(errorResponse('NOT_AUTHENTICATED', 'Account needs to login'), 400);
    }
    
    // Update session
    const sessionData: SessionData = {
      account_id: account.id,
      zerodha_user_id: account.zerodha_user_id,
      access_token: account.access_token,
      name: account.name,
      email: account.email,
      expires_at: Date.now() + (24 * 60 * 60 * 1000)
    };
    
    await c.env.KV.put(`session:${sessionId}`, JSON.stringify(sessionData), {
      expirationTtl: 86400
    });
    
    return c.json(successResponse({ switched: true, account_id: account.id }));
  } catch (error) {
    console.error('Switch account error:', error);
    return c.json(errorResponse('ERROR', 'Failed to switch account'), 500);
  }
});

export default auth;
