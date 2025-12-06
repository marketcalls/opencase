/**
 * Setup Routes
 * Handles initial app configuration and API key setup
 */

import { Hono } from 'hono';
import type { Bindings, Variables, SetupRequest, Account } from '../types';
import { successResponse, errorResponse, encrypt, decrypt } from '../lib/utils';
import { KiteClient } from '../lib/kite';

const setup = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * GET /api/setup/status
 * Check if the app is configured
 */
setup.get('/status', async (c) => {
  try {
    const apiKeyConfig = await c.env.DB.prepare(
      "SELECT config_value FROM app_config WHERE config_key = 'kite_api_key'"
    ).first<{ config_value: string }>();
    
    const accountsCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM accounts WHERE zerodha_user_id != "SYSTEM"'
    ).first<{ count: number }>();
    
    const hasApiKey = !!apiKeyConfig?.config_value || !!c.env.KITE_API_KEY;
    const hasAccounts = (accountsCount?.count || 0) > 0;
    
    return c.json(successResponse({
      is_configured: hasApiKey,
      has_accounts: hasAccounts,
      needs_setup: !hasApiKey
    }));
  } catch (error) {
    console.error('Setup status error:', error);
    return c.json(successResponse({
      is_configured: false,
      has_accounts: false,
      needs_setup: true
    }));
  }
});

/**
 * POST /api/setup/configure
 * Configure Kite API credentials
 */
setup.post('/configure', async (c) => {
  try {
    const { kite_api_key, kite_api_secret } = await c.req.json<SetupRequest>();
    
    if (!kite_api_key || !kite_api_secret) {
      return c.json(errorResponse('INVALID_INPUT', 'API key and secret are required'), 400);
    }
    
    // Validate credentials by attempting to get login URL
    try {
      const kite = new KiteClient(kite_api_key, kite_api_secret);
      kite.getLoginUrl(); // This will throw if API key format is invalid
    } catch (error) {
      return c.json(errorResponse('INVALID_CREDENTIALS', 'Invalid API key format'), 400);
    }
    
    const encryptionKey = c.env.ENCRYPTION_KEY || 'stockbasket-default-key';
    
    // Encrypt and store credentials
    const encryptedKey = await encrypt(kite_api_key, encryptionKey);
    const encryptedSecret = await encrypt(kite_api_secret, encryptionKey);
    
    // Upsert API key
    await c.env.DB.prepare(`
      INSERT INTO app_config (config_key, config_value, is_encrypted)
      VALUES ('kite_api_key', ?, 1)
      ON CONFLICT(config_key) DO UPDATE SET config_value = ?, updated_at = datetime('now')
    `).bind(encryptedKey, encryptedKey).run();
    
    // Upsert API secret
    await c.env.DB.prepare(`
      INSERT INTO app_config (config_key, config_value, is_encrypted)
      VALUES ('kite_api_secret', ?, 1)
      ON CONFLICT(config_key) DO UPDATE SET config_value = ?, updated_at = datetime('now')
    `).bind(encryptedSecret, encryptedSecret).run();
    
    return c.json(successResponse({
      configured: true,
      message: 'API credentials configured successfully'
    }));
  } catch (error) {
    console.error('Configure error:', error);
    return c.json(errorResponse('CONFIG_ERROR', 'Failed to save configuration'), 500);
  }
});

/**
 * POST /api/setup/add-account
 * Add a new Zerodha account with its own API credentials
 */
setup.post('/add-account', async (c) => {
  try {
    const { name, kite_api_key, kite_api_secret } = await c.req.json<{
      name: string;
      kite_api_key: string;
      kite_api_secret: string;
    }>();
    
    if (!name || !kite_api_key || !kite_api_secret) {
      return c.json(errorResponse('INVALID_INPUT', 'Name, API key and secret are required'), 400);
    }
    
    const encryptionKey = c.env.ENCRYPTION_KEY || 'stockbasket-default-key';
    
    // Encrypt credentials
    const encryptedKey = await encrypt(kite_api_key, encryptionKey);
    const encryptedSecret = await encrypt(kite_api_secret, encryptionKey);
    
    // Check if this is the first non-system account
    const existingCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM accounts WHERE zerodha_user_id != "SYSTEM"'
    ).first<{ count: number }>();
    
    const isPrimary = (existingCount?.count || 0) === 0 ? 1 : 0;
    
    // Create a temporary account entry (zerodha_user_id will be updated after login)
    const tempId = `PENDING_${Date.now()}`;
    
    const result = await c.env.DB.prepare(`
      INSERT INTO accounts (zerodha_user_id, name, kite_api_key, kite_api_secret, is_primary, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `).bind(tempId, name, encryptedKey, encryptedSecret, isPrimary).run();
    
    const accountId = result.meta.last_row_id;
    
    // Generate login URL for this account
    const kite = new KiteClient(kite_api_key, kite_api_secret);
    const loginUrl = kite.getLoginUrl();
    
    return c.json(successResponse({
      account_id: accountId,
      login_url: loginUrl,
      message: 'Account added. Please login to Zerodha to complete setup.'
    }));
  } catch (error) {
    console.error('Add account error:', error);
    return c.json(errorResponse('ERROR', 'Failed to add account'), 500);
  }
});

/**
 * DELETE /api/setup/remove-account/:id
 * Remove an account
 */
setup.delete('/remove-account/:id', async (c) => {
  const accountId = parseInt(c.req.param('id'));
  
  try {
    // Don't allow removing SYSTEM account
    const account = await c.env.DB.prepare(
      'SELECT zerodha_user_id FROM accounts WHERE id = ?'
    ).bind(accountId).first<Account>();
    
    if (!account) {
      return c.json(errorResponse('NOT_FOUND', 'Account not found'), 404);
    }
    
    if (account.zerodha_user_id === 'SYSTEM') {
      return c.json(errorResponse('FORBIDDEN', 'Cannot remove system account'), 403);
    }
    
    // Soft delete - mark as inactive
    await c.env.DB.prepare(
      'UPDATE accounts SET is_active = 0, updated_at = datetime("now") WHERE id = ?'
    ).bind(accountId).run();
    
    return c.json(successResponse({ removed: true }));
  } catch (error) {
    console.error('Remove account error:', error);
    return c.json(errorResponse('ERROR', 'Failed to remove account'), 500);
  }
});

/**
 * PUT /api/setup/update-account/:id
 * Update account settings
 */
setup.put('/update-account/:id', async (c) => {
  const accountId = parseInt(c.req.param('id'));
  const updates = await c.req.json<{
    name?: string;
    is_primary?: boolean;
    kite_api_key?: string;
    kite_api_secret?: string;
  }>();
  
  try {
    const account = await c.env.DB.prepare(
      'SELECT * FROM accounts WHERE id = ?'
    ).bind(accountId).first<Account>();
    
    if (!account) {
      return c.json(errorResponse('NOT_FOUND', 'Account not found'), 404);
    }
    
    const encryptionKey = c.env.ENCRYPTION_KEY || 'stockbasket-default-key';
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    
    if (updates.name !== undefined) {
      updateFields.push('name = ?');
      updateValues.push(updates.name);
    }
    
    if (updates.is_primary !== undefined) {
      // If setting as primary, unset all others first
      if (updates.is_primary) {
        await c.env.DB.prepare('UPDATE accounts SET is_primary = 0').run();
      }
      updateFields.push('is_primary = ?');
      updateValues.push(updates.is_primary ? 1 : 0);
    }
    
    if (updates.kite_api_key && updates.kite_api_secret) {
      const encryptedKey = await encrypt(updates.kite_api_key, encryptionKey);
      const encryptedSecret = await encrypt(updates.kite_api_secret, encryptionKey);
      updateFields.push('kite_api_key = ?', 'kite_api_secret = ?');
      updateValues.push(encryptedKey, encryptedSecret);
    }
    
    if (updateFields.length > 0) {
      updateFields.push('updated_at = datetime("now")');
      updateValues.push(accountId);
      
      await c.env.DB.prepare(`
        UPDATE accounts SET ${updateFields.join(', ')} WHERE id = ?
      `).bind(...updateValues).run();
    }
    
    return c.json(successResponse({ updated: true }));
  } catch (error) {
    console.error('Update account error:', error);
    return c.json(errorResponse('ERROR', 'Failed to update account'), 500);
  }
});

/**
 * POST /api/setup/create-family-group
 * Create a family/team group
 */
setup.post('/create-family-group', async (c) => {
  const sessionId = c.req.header('X-Session-ID');
  
  if (!sessionId) {
    return c.json(errorResponse('UNAUTHORIZED', 'Session required'), 401);
  }
  
  const sessionData = await c.env.KV.get(`session:${sessionId}`, 'json') as any;
  if (!sessionData) {
    return c.json(errorResponse('UNAUTHORIZED', 'Invalid session'), 401);
  }
  
  try {
    const { name, description, member_ids } = await c.req.json<{
      name: string;
      description?: string;
      member_ids?: number[];
    }>();
    
    if (!name) {
      return c.json(errorResponse('INVALID_INPUT', 'Group name is required'), 400);
    }
    
    // Create group
    const result = await c.env.DB.prepare(`
      INSERT INTO account_groups (name, description, created_by)
      VALUES (?, ?, ?)
    `).bind(name, description || null, sessionData.account_id).run();
    
    const groupId = result.meta.last_row_id;
    
    // Add creator as admin
    await c.env.DB.prepare(`
      INSERT INTO account_group_members (group_id, account_id, role)
      VALUES (?, ?, 'admin')
    `).bind(groupId, sessionData.account_id).run();
    
    // Add other members
    if (member_ids && member_ids.length > 0) {
      for (const memberId of member_ids) {
        if (memberId !== sessionData.account_id) {
          await c.env.DB.prepare(`
            INSERT INTO account_group_members (group_id, account_id, role)
            VALUES (?, ?, 'member')
          `).bind(groupId, memberId).run();
        }
      }
    }
    
    return c.json(successResponse({
      group_id: groupId,
      message: 'Family group created successfully'
    }));
  } catch (error) {
    console.error('Create family group error:', error);
    return c.json(errorResponse('ERROR', 'Failed to create family group'), 500);
  }
});

/**
 * GET /api/setup/family-groups
 * Get family groups for current user
 */
setup.get('/family-groups', async (c) => {
  const sessionId = c.req.header('X-Session-ID');
  
  if (!sessionId) {
    return c.json(errorResponse('UNAUTHORIZED', 'Session required'), 401);
  }
  
  const sessionData = await c.env.KV.get(`session:${sessionId}`, 'json') as any;
  if (!sessionData) {
    return c.json(errorResponse('UNAUTHORIZED', 'Invalid session'), 401);
  }
  
  try {
    const groups = await c.env.DB.prepare(`
      SELECT g.*, m.role
      FROM account_groups g
      JOIN account_group_members m ON g.id = m.group_id
      WHERE m.account_id = ?
      ORDER BY g.name
    `).bind(sessionData.account_id).all();
    
    return c.json(successResponse(groups.results));
  } catch (error) {
    console.error('Get family groups error:', error);
    return c.json(errorResponse('ERROR', 'Failed to fetch family groups'), 500);
  }
});

export default setup;
