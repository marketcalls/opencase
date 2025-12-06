/**
 * Setup Routes
 * Zero-config API key setup, credential management
 * Supports multiple brokers: Zerodha, AngelOne
 */

import { Hono } from 'hono';
import type { Bindings, Variables, Account, SessionData, BrokerType } from '../types';
import { successResponse, errorResponse, encrypt, decrypt } from '../lib/utils';
import { KiteClient } from '../lib/kite';
import { 
  createBrokerClient, 
  getSupportedBrokers, 
  validateBrokerCredentials,
  getBrokerDisplayName,
  getBrokerRequirements 
} from '../brokers';

// Extended setup request supporting multiple brokers
interface SetupRequest {
  broker_type: BrokerType;
  api_key: string;
  api_secret: string;
  client_code?: string;  // For AngelOne
  mpin?: string;         // For AngelOne
}

const setup = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * GET /api/setup/brokers
 * Get list of supported brokers
 */
setup.get('/brokers', (c) => {
  const brokers = getSupportedBrokers();
  return c.json(successResponse(brokers));
});

/**
 * GET /api/setup/broker-requirements/:type
 * Get broker-specific requirements
 */
setup.get('/broker-requirements/:type', (c) => {
  const brokerType = c.req.param('type') as BrokerType;
  const requirements = getBrokerRequirements(brokerType);
  return c.json(successResponse(requirements));
});

/**
 * GET /api/setup/status
 * Check if the app is configured (zero-config check)
 */
setup.get('/status', async (c) => {
  try {
    // Check for any broker API key in database
    const zerodhaKey = await c.env.DB.prepare(
      "SELECT config_value FROM app_config WHERE config_key = 'kite_api_key'"
    ).first<{ config_value: string }>();
    
    const angeloneKey = await c.env.DB.prepare(
      "SELECT config_value FROM app_config WHERE config_key = 'angelone_api_key'"
    ).first<{ config_value: string }>();
    
    const defaultBroker = await c.env.DB.prepare(
      "SELECT config_value FROM app_config WHERE config_key = 'default_broker'"
    ).first<{ config_value: string }>();
    
    const accountsCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM accounts WHERE zerodha_user_id != "SYSTEM"'
    ).first<{ count: number }>();
    
    // Check if master instruments are downloaded
    const instrumentsCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM master_instruments'
    ).first<{ count: number }>();
    
    const lastDownload = await c.env.DB.prepare(
      "SELECT config_value FROM app_config WHERE config_key = 'instruments_last_download'"
    ).first<{ config_value: string }>();
    
    const hasZerodha = !!zerodhaKey?.config_value;
    const hasAngelone = !!angeloneKey?.config_value;
    const hasAnyBroker = hasZerodha || hasAngelone;
    const hasAccounts = (accountsCount?.count || 0) > 0;
    const hasInstruments = (instrumentsCount?.count || 0) > 0;
    
    return c.json(successResponse({
      is_configured: hasAnyBroker,
      configured_brokers: {
        zerodha: hasZerodha,
        angelone: hasAngelone
      },
      default_broker: defaultBroker?.config_value || (hasZerodha ? 'zerodha' : hasAngelone ? 'angelone' : null),
      has_accounts: hasAccounts,
      has_instruments: hasInstruments,
      instruments_count: instrumentsCount?.count || 0,
      instruments_last_download: lastDownload?.config_value || null,
      needs_setup: !hasAnyBroker,
      needs_instruments_download: !hasInstruments,
      supported_brokers: getSupportedBrokers()
    }));
  } catch (error) {
    console.error('Setup status error:', error);
    return c.json(successResponse({
      is_configured: false,
      configured_brokers: { zerodha: false, angelone: false },
      default_broker: null,
      has_accounts: false,
      has_instruments: false,
      instruments_count: 0,
      instruments_last_download: null,
      needs_setup: true,
      needs_instruments_download: true,
      supported_brokers: getSupportedBrokers()
    }));
  }
});

/**
 * POST /api/setup/configure
 * Configure broker API credentials (supports Zerodha and AngelOne)
 */
setup.post('/configure', async (c) => {
  try {
    const body = await c.req.json<SetupRequest | { kite_api_key: string; kite_api_secret: string }>();
    
    // Support both old format (kite_api_key) and new format (broker_type + api_key)
    let brokerType: BrokerType;
    let apiKey: string;
    let apiSecret: string;
    let clientCode: string | undefined;
    let mpin: string | undefined;
    
    if ('broker_type' in body) {
      brokerType = body.broker_type;
      apiKey = body.api_key;
      apiSecret = body.api_secret;
      clientCode = body.client_code;
      mpin = body.mpin;
    } else {
      // Legacy format - assume Zerodha
      brokerType = 'zerodha';
      apiKey = body.kite_api_key;
      apiSecret = body.kite_api_secret;
    }
    
    if (!apiKey || !apiSecret) {
      return c.json(errorResponse('INVALID_INPUT', 'API key and secret are required'), 400);
    }
    
    // Validate credentials format
    const validation = validateBrokerCredentials(brokerType, { apiKey, apiSecret });
    if (!validation.valid) {
      return c.json(errorResponse('INVALID_CREDENTIALS', validation.errors.join(', ')), 400);
    }
    
    // Additional validation for AngelOne
    if (brokerType === 'angelone') {
      if (!clientCode) {
        return c.json(errorResponse('INVALID_INPUT', 'Client Code is required for Angel One'), 400);
      }
    }
    
    // Validate Zerodha credentials by attempting to get login URL
    if (brokerType === 'zerodha') {
      try {
        const kite = new KiteClient(apiKey, apiSecret);
        kite.getLoginUrl();
      } catch (error) {
        return c.json(errorResponse('INVALID_CREDENTIALS', 'Invalid API key format'), 400);
      }
    }
    
    // Use a default encryption key for zero-config setup
    const encryptionKey = c.env.ENCRYPTION_KEY || 'opencase-default-key-32chars!!!';
    
    // Encrypt credentials
    const encryptedKey = await encrypt(apiKey, encryptionKey);
    const encryptedSecret = await encrypt(apiSecret, encryptionKey);
    
    // Store credentials based on broker type
    if (brokerType === 'zerodha') {
      await c.env.DB.prepare(`
        INSERT INTO app_config (config_key, config_value, is_encrypted)
        VALUES ('kite_api_key', ?, 1)
        ON CONFLICT(config_key) DO UPDATE SET config_value = ?, updated_at = datetime('now')
      `).bind(encryptedKey, encryptedKey).run();
      
      await c.env.DB.prepare(`
        INSERT INTO app_config (config_key, config_value, is_encrypted)
        VALUES ('kite_api_secret', ?, 1)
        ON CONFLICT(config_key) DO UPDATE SET config_value = ?, updated_at = datetime('now')
      `).bind(encryptedSecret, encryptedSecret).run();
    } else if (brokerType === 'angelone') {
      await c.env.DB.prepare(`
        INSERT INTO app_config (config_key, config_value, is_encrypted)
        VALUES ('angelone_api_key', ?, 1)
        ON CONFLICT(config_key) DO UPDATE SET config_value = ?, updated_at = datetime('now')
      `).bind(encryptedKey, encryptedKey).run();
      
      await c.env.DB.prepare(`
        INSERT INTO app_config (config_key, config_value, is_encrypted)
        VALUES ('angelone_api_secret', ?, 1)
        ON CONFLICT(config_key) DO UPDATE SET config_value = ?, updated_at = datetime('now')
      `).bind(encryptedSecret, encryptedSecret).run();
      
      // Store client code (encrypted)
      if (clientCode) {
        const encryptedClientCode = await encrypt(clientCode, encryptionKey);
        await c.env.DB.prepare(`
          INSERT INTO app_config (config_key, config_value, is_encrypted)
          VALUES ('angelone_client_code', ?, 1)
          ON CONFLICT(config_key) DO UPDATE SET config_value = ?, updated_at = datetime('now')
        `).bind(encryptedClientCode, encryptedClientCode).run();
      }
      
      // Store MPIN (encrypted) if provided
      if (mpin) {
        const encryptedMpin = await encrypt(mpin, encryptionKey);
        await c.env.DB.prepare(`
          INSERT INTO app_config (config_key, config_value, is_encrypted)
          VALUES ('angelone_mpin', ?, 1)
          ON CONFLICT(config_key) DO UPDATE SET config_value = ?, updated_at = datetime('now')
        `).bind(encryptedMpin, encryptedMpin).run();
      }
    }
    
    // Set as default broker if no default exists
    const existingDefault = await c.env.DB.prepare(
      "SELECT config_value FROM app_config WHERE config_key = 'default_broker'"
    ).first<{ config_value: string }>();
    
    if (!existingDefault?.config_value) {
      await c.env.DB.prepare(`
        INSERT INTO app_config (config_key, config_value, is_encrypted)
        VALUES ('default_broker', ?, 0)
        ON CONFLICT(config_key) DO UPDATE SET config_value = ?, updated_at = datetime('now')
      `).bind(brokerType, brokerType).run();
    }
    
    const brokerName = getBrokerDisplayName(brokerType);
    return c.json(successResponse({
      configured: true,
      broker_type: brokerType,
      message: `${brokerName} credentials configured successfully. You can now login.`
    }));
  } catch (error) {
    console.error('Configure error:', error);
    return c.json(errorResponse('CONFIG_ERROR', 'Failed to save configuration'), 500);
  }
});

/**
 * PUT /api/setup/default-broker
 * Set the default broker
 */
setup.put('/default-broker', async (c) => {
  try {
    const { broker_type } = await c.req.json<{ broker_type: BrokerType }>();
    
    if (!broker_type || !['zerodha', 'angelone'].includes(broker_type)) {
      return c.json(errorResponse('INVALID_INPUT', 'Valid broker type required'), 400);
    }
    
    await c.env.DB.prepare(`
      INSERT INTO app_config (config_key, config_value, is_encrypted)
      VALUES ('default_broker', ?, 0)
      ON CONFLICT(config_key) DO UPDATE SET config_value = ?, updated_at = datetime('now')
    `).bind(broker_type, broker_type).run();
    
    return c.json(successResponse({
      default_broker: broker_type,
      message: `Default broker set to ${getBrokerDisplayName(broker_type)}`
    }));
  } catch (error) {
    console.error('Set default broker error:', error);
    return c.json(errorResponse('ERROR', 'Failed to set default broker'), 500);
  }
});

/**
 * GET /api/setup/credentials
 * Get current API credentials status (requires auth)
 */
setup.get('/credentials', async (c) => {
  const sessionId = c.req.header('X-Session-ID');
  
  if (!sessionId) {
    return c.json(errorResponse('UNAUTHORIZED', 'Session required'), 401);
  }
  
  const sessionData = await c.env.KV.get(`session:${sessionId}`, 'json') as SessionData | null;
  if (!sessionData) {
    return c.json(errorResponse('UNAUTHORIZED', 'Invalid session'), 401);
  }
  
  try {
    const encryptionKey = c.env.ENCRYPTION_KEY || 'opencase-default-key-32chars!!!';
    
    // Get app-level credentials
    const apiKeyConfig = await c.env.DB.prepare(
      "SELECT config_value FROM app_config WHERE config_key = 'kite_api_key'"
    ).first<{ config_value: string }>();
    
    let apiKeyMasked = '';
    if (apiKeyConfig?.config_value) {
      const apiKey = await decrypt(apiKeyConfig.config_value, encryptionKey);
      apiKeyMasked = apiKey.substring(0, 4) + '****' + apiKey.substring(apiKey.length - 4);
    }
    
    // Get account-level credentials
    const account = await c.env.DB.prepare(
      'SELECT kite_api_key, kite_api_secret FROM accounts WHERE id = ?'
    ).bind(sessionData.account_id).first<{ kite_api_key: string | null; kite_api_secret: string | null }>();
    
    let accountApiKeyMasked = '';
    if (account?.kite_api_key) {
      const accountApiKey = await decrypt(account.kite_api_key, encryptionKey);
      accountApiKeyMasked = accountApiKey.substring(0, 4) + '****' + accountApiKey.substring(accountApiKey.length - 4);
    }
    
    return c.json(successResponse({
      app_api_key: apiKeyMasked,
      account_api_key: accountApiKeyMasked,
      has_app_credentials: !!apiKeyConfig?.config_value,
      has_account_credentials: !!account?.kite_api_key
    }));
  } catch (error) {
    console.error('Get credentials error:', error);
    return c.json(errorResponse('ERROR', 'Failed to get credentials'), 500);
  }
});

/**
 * PUT /api/setup/credentials
 * Update API credentials (requires auth)
 */
setup.put('/credentials', async (c) => {
  const sessionId = c.req.header('X-Session-ID');
  
  if (!sessionId) {
    return c.json(errorResponse('UNAUTHORIZED', 'Session required'), 401);
  }
  
  const sessionData = await c.env.KV.get(`session:${sessionId}`, 'json') as SessionData | null;
  if (!sessionData) {
    return c.json(errorResponse('UNAUTHORIZED', 'Invalid session'), 401);
  }
  
  try {
    const { kite_api_key, kite_api_secret, update_type = 'app' } = await c.req.json<{
      kite_api_key: string;
      kite_api_secret: string;
      update_type?: 'app' | 'account';
    }>();
    
    if (!kite_api_key || !kite_api_secret) {
      return c.json(errorResponse('INVALID_INPUT', 'API key and secret are required'), 400);
    }
    
    // Validate credentials
    try {
      const kite = new KiteClient(kite_api_key, kite_api_secret);
      kite.getLoginUrl();
    } catch (error) {
      return c.json(errorResponse('INVALID_CREDENTIALS', 'Invalid API key format'), 400);
    }
    
    const encryptionKey = c.env.ENCRYPTION_KEY || 'opencase-default-key-32chars!!!';
    const encryptedKey = await encrypt(kite_api_key, encryptionKey);
    const encryptedSecret = await encrypt(kite_api_secret, encryptionKey);
    
    if (update_type === 'account') {
      // Update account-specific credentials
      await c.env.DB.prepare(`
        UPDATE accounts SET 
          kite_api_key = ?,
          kite_api_secret = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `).bind(encryptedKey, encryptedSecret, sessionData.account_id).run();
      
      return c.json(successResponse({
        updated: true,
        type: 'account',
        message: 'Account credentials updated. Please re-login to Zerodha.'
      }));
    } else {
      // Update app-level credentials
      await c.env.DB.prepare(`
        INSERT INTO app_config (config_key, config_value, is_encrypted)
        VALUES ('kite_api_key', ?, 1)
        ON CONFLICT(config_key) DO UPDATE SET config_value = ?, updated_at = datetime('now')
      `).bind(encryptedKey, encryptedKey).run();
      
      await c.env.DB.prepare(`
        INSERT INTO app_config (config_key, config_value, is_encrypted)
        VALUES ('kite_api_secret', ?, 1)
        ON CONFLICT(config_key) DO UPDATE SET config_value = ?, updated_at = datetime('now')
      `).bind(encryptedSecret, encryptedSecret).run();
      
      return c.json(successResponse({
        updated: true,
        type: 'app',
        message: 'App credentials updated. All accounts will use new credentials.'
      }));
    }
  } catch (error) {
    console.error('Update credentials error:', error);
    return c.json(errorResponse('ERROR', 'Failed to update credentials'), 500);
  }
});

/**
 * POST /api/setup/add-account
 * Add a new Zerodha account with its own API credentials
 */
setup.post('/add-account', async (c) => {
  try {
    const { name, kite_api_key, kite_api_secret, use_app_credentials } = await c.req.json<{
      name: string;
      kite_api_key?: string;
      kite_api_secret?: string;
      use_app_credentials?: boolean;
    }>();
    
    if (!name) {
      return c.json(errorResponse('INVALID_INPUT', 'Account name is required'), 400);
    }
    
    const encryptionKey = c.env.ENCRYPTION_KEY || 'opencase-default-key-32chars!!!';
    let encryptedKey: string | null = null;
    let encryptedSecret: string | null = null;
    let loginApiKey: string;
    let loginApiSecret: string;
    
    if (use_app_credentials || (!kite_api_key && !kite_api_secret)) {
      // Use app-level credentials
      const apiKeyConfig = await c.env.DB.prepare(
        "SELECT config_value FROM app_config WHERE config_key = 'kite_api_key'"
      ).first<{ config_value: string }>();
      
      const apiSecretConfig = await c.env.DB.prepare(
        "SELECT config_value FROM app_config WHERE config_key = 'kite_api_secret'"
      ).first<{ config_value: string }>();
      
      if (!apiKeyConfig?.config_value || !apiSecretConfig?.config_value) {
        return c.json(errorResponse('NO_CREDENTIALS', 'Please configure API credentials first'), 400);
      }
      
      loginApiKey = await decrypt(apiKeyConfig.config_value, encryptionKey);
      loginApiSecret = await decrypt(apiSecretConfig.config_value, encryptionKey);
    } else {
      // Use account-specific credentials
      if (!kite_api_key || !kite_api_secret) {
        return c.json(errorResponse('INVALID_INPUT', 'API key and secret are required'), 400);
      }
      
      encryptedKey = await encrypt(kite_api_key, encryptionKey);
      encryptedSecret = await encrypt(kite_api_secret, encryptionKey);
      loginApiKey = kite_api_key;
      loginApiSecret = kite_api_secret;
    }
    
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
    
    // Generate login URL
    const kite = new KiteClient(loginApiKey, loginApiSecret);
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
    
    const encryptionKey = c.env.ENCRYPTION_KEY || 'opencase-default-key-32chars!!!';
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
  
  const sessionData = await c.env.KV.get(`session:${sessionId}`, 'json') as SessionData | null;
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
  
  const sessionData = await c.env.KV.get(`session:${sessionId}`, 'json') as SessionData | null;
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
