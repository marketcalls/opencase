/**
 * Alert Routes
 * Price alerts, rebalance reminders, and notifications
 */

import { Hono } from 'hono';
import type { 
  Bindings, 
  Variables, 
  Alert,
  SessionData,
  CreateAlertRequest
} from '../types';
import { successResponse, errorResponse } from '../lib/utils';

const alerts = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Auth middleware
alerts.use('*', async (c, next) => {
  const sessionId = c.req.header('X-Session-ID');

  if (!sessionId) {
    return c.json(errorResponse('UNAUTHORIZED', 'Session required'), 401);
  }

  // Check for user session
  const userSession = await c.env.KV.get(`user:${sessionId}`, 'json') as { user_id: number; email: string; name: string; is_admin: boolean; expires_at: number } | null;
  if (!userSession || userSession.expires_at < Date.now()) {
    return c.json(errorResponse('SESSION_EXPIRED', 'Session expired'), 401);
  }

  c.set('session', { user_id: userSession.user_id, email: userSession.email, name: userSession.name, expires_at: userSession.expires_at });
  c.set('userSession', userSession);
  await next();
});

/**
 * GET /api/alerts
 * Get all alerts for current user
 */
alerts.get('/', async (c) => {
  const session = c.get('session');
  const active_only = c.req.query('active_only') === 'true';

  try {
    let query = `
      SELECT * FROM alerts
      WHERE user_id = ?
    `;

    if (active_only) {
      query += ' AND is_active = 1';
    }

    query += ' ORDER BY created_at DESC';

    const userAlerts = await c.env.DB.prepare(query)
      .bind(session.user_id)
      .all<Alert>();

    return c.json(successResponse(userAlerts.results));
  } catch (error) {
    console.error('Get alerts error:', error);
    return c.json(errorResponse('DB_ERROR', 'Failed to fetch alerts'), 500);
  }
});

/**
 * GET /api/alerts/notifications
 * Get unread notifications
 */
alerts.get('/notifications', async (c) => {
  const session = c.get('session') as SessionData;
  const unread_only = c.req.query('unread_only') !== 'false';
  
  try {
    let query = `
      SELECT n.*, a.alert_type, a.trading_symbol, a.target_type
      FROM alert_notifications n
      JOIN alerts a ON n.alert_id = a.id
      WHERE a.account_id = ?
    `;
    
    if (unread_only) {
      query += ' AND n.is_read = 0';
    }
    
    query += ' ORDER BY n.sent_at DESC LIMIT 50';
    
    const notifications = await c.env.DB.prepare(query)
      .bind(session.account_id)
      .all();
    
    return c.json(successResponse(notifications.results));
  } catch (error) {
    console.error('Get notifications error:', error);
    return c.json(errorResponse('DB_ERROR', 'Failed to fetch notifications'), 500);
  }
});

/**
 * POST /api/alerts/notifications/:id/read
 * Mark notification as read
 */
alerts.post('/notifications/:id/read', async (c) => {
  const notificationId = parseInt(c.req.param('id'));
  const session = c.get('session') as SessionData;
  
  try {
    // Verify ownership through alert
    const notification = await c.env.DB.prepare(`
      SELECT n.* FROM alert_notifications n
      JOIN alerts a ON n.alert_id = a.id
      WHERE n.id = ? AND a.account_id = ?
    `).bind(notificationId, session.account_id).first();
    
    if (!notification) {
      return c.json(errorResponse('NOT_FOUND', 'Notification not found'), 404);
    }
    
    await c.env.DB.prepare(`
      UPDATE alert_notifications SET is_read = 1, read_at = datetime('now')
      WHERE id = ?
    `).bind(notificationId).run();
    
    return c.json(successResponse({ marked_read: true }));
  } catch (error) {
    console.error('Mark read error:', error);
    return c.json(errorResponse('DB_ERROR', 'Failed to mark notification as read'), 500);
  }
});

/**
 * POST /api/alerts/notifications/read-all
 * Mark all notifications as read
 */
alerts.post('/notifications/read-all', async (c) => {
  const session = c.get('session') as SessionData;
  
  try {
    await c.env.DB.prepare(`
      UPDATE alert_notifications SET is_read = 1, read_at = datetime('now')
      WHERE alert_id IN (SELECT id FROM alerts WHERE account_id = ?) AND is_read = 0
    `).bind(session.account_id).run();
    
    return c.json(successResponse({ marked_all_read: true }));
  } catch (error) {
    console.error('Mark all read error:', error);
    return c.json(errorResponse('DB_ERROR', 'Failed to mark notifications as read'), 500);
  }
});

/**
 * GET /api/alerts/:id
 * Get alert details
 */
alerts.get('/:id', async (c) => {
  const alertId = parseInt(c.req.param('id'));
  const session = c.get('session') as SessionData;
  
  try {
    const alert = await c.env.DB.prepare(`
      SELECT * FROM alerts WHERE id = ? AND account_id = ?
    `).bind(alertId, session.account_id).first<Alert>();
    
    if (!alert) {
      return c.json(errorResponse('NOT_FOUND', 'Alert not found'), 404);
    }
    
    // Get recent notifications for this alert
    const notifications = await c.env.DB.prepare(`
      SELECT * FROM alert_notifications
      WHERE alert_id = ?
      ORDER BY sent_at DESC
      LIMIT 10
    `).bind(alertId).all();
    
    return c.json(successResponse({
      ...alert,
      recent_notifications: notifications.results
    }));
  } catch (error) {
    console.error('Get alert error:', error);
    return c.json(errorResponse('DB_ERROR', 'Failed to fetch alert'), 500);
  }
});

/**
 * POST /api/alerts
 * Create a new alert
 */
alerts.post('/', async (c) => {
  const session = c.get('session') as SessionData;
  
  try {
    const body = await c.req.json<CreateAlertRequest>();
    
    // Validate
    if (!body.alert_type || !body.target_type || !body.condition || body.threshold_value === undefined) {
      return c.json(errorResponse('INVALID_INPUT', 'alert_type, target_type, condition, and threshold_value are required'), 400);
    }
    
    // Validate alert type specific requirements
    if (body.alert_type === 'price' && (!body.trading_symbol || !body.exchange)) {
      return c.json(errorResponse('INVALID_INPUT', 'Price alerts require trading_symbol and exchange'), 400);
    }
    
    if (['rebalance', 'pnl'].includes(body.alert_type) && !body.target_id) {
      return c.json(errorResponse('INVALID_INPUT', 'Rebalance and PnL alerts require target_id'), 400);
    }
    
    const result = await c.env.DB.prepare(`
      INSERT INTO alerts (
        account_id, alert_type, target_type, target_id,
        trading_symbol, exchange, condition, threshold_value,
        message, notification_channels
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      session.account_id,
      body.alert_type,
      body.target_type,
      body.target_id ?? null,
      body.trading_symbol ?? null,
      body.exchange ?? null,
      body.condition,
      body.threshold_value,
      body.message ?? null,
      JSON.stringify(body.notification_channels || ['app'])
    ).run();
    
    const alertId = result.meta.last_row_id;
    
    return c.json(successResponse({
      alert_id: alertId,
      message: 'Alert created successfully'
    }), 201);
  } catch (error) {
    console.error('Create alert error:', error);
    return c.json(errorResponse('DB_ERROR', 'Failed to create alert'), 500);
  }
});

/**
 * PUT /api/alerts/:id
 * Update an alert
 */
alerts.put('/:id', async (c) => {
  const alertId = parseInt(c.req.param('id'));
  const session = c.get('session') as SessionData;
  
  try {
    const alert = await c.env.DB.prepare(
      'SELECT * FROM alerts WHERE id = ? AND account_id = ?'
    ).bind(alertId, session.account_id).first<Alert>();
    
    if (!alert) {
      return c.json(errorResponse('NOT_FOUND', 'Alert not found'), 404);
    }
    
    const body = await c.req.json<Partial<CreateAlertRequest> & { is_active?: boolean }>();
    
    const updates: string[] = [];
    const values: any[] = [];
    
    if (body.threshold_value !== undefined) {
      updates.push('threshold_value = ?');
      values.push(body.threshold_value);
    }
    
    if (body.condition !== undefined) {
      updates.push('condition = ?');
      values.push(body.condition);
    }
    
    if (body.message !== undefined) {
      updates.push('message = ?');
      values.push(body.message);
    }
    
    if (body.notification_channels !== undefined) {
      updates.push('notification_channels = ?');
      values.push(JSON.stringify(body.notification_channels));
    }
    
    if (body.is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(body.is_active ? 1 : 0);
      
      // Reset triggered state when reactivating
      if (body.is_active) {
        updates.push('is_triggered = 0');
      }
    }
    
    if (updates.length > 0) {
      updates.push('updated_at = datetime("now")');
      values.push(alertId);
      
      await c.env.DB.prepare(`
        UPDATE alerts SET ${updates.join(', ')} WHERE id = ?
      `).bind(...values).run();
    }
    
    return c.json(successResponse({ updated: true }));
  } catch (error) {
    console.error('Update alert error:', error);
    return c.json(errorResponse('DB_ERROR', 'Failed to update alert'), 500);
  }
});

/**
 * DELETE /api/alerts/:id
 * Delete an alert
 */
alerts.delete('/:id', async (c) => {
  const alertId = parseInt(c.req.param('id'));
  const session = c.get('session') as SessionData;
  
  try {
    const result = await c.env.DB.prepare(
      'DELETE FROM alerts WHERE id = ? AND account_id = ?'
    ).bind(alertId, session.account_id).run();
    
    if (result.meta.changes === 0) {
      return c.json(errorResponse('NOT_FOUND', 'Alert not found'), 404);
    }
    
    return c.json(successResponse({ deleted: true }));
  } catch (error) {
    console.error('Delete alert error:', error);
    return c.json(errorResponse('DB_ERROR', 'Failed to delete alert'), 500);
  }
});

/**
 * POST /api/alerts/:id/toggle
 * Toggle alert active state
 */
alerts.post('/:id/toggle', async (c) => {
  const alertId = parseInt(c.req.param('id'));
  const session = c.get('session') as SessionData;
  
  try {
    const alert = await c.env.DB.prepare(
      'SELECT is_active FROM alerts WHERE id = ? AND account_id = ?'
    ).bind(alertId, session.account_id).first<{ is_active: number }>();
    
    if (!alert) {
      return c.json(errorResponse('NOT_FOUND', 'Alert not found'), 404);
    }
    
    const newState = alert.is_active ? 0 : 1;
    
    await c.env.DB.prepare(`
      UPDATE alerts SET is_active = ?, is_triggered = 0, updated_at = datetime('now')
      WHERE id = ?
    `).bind(newState, alertId).run();
    
    return c.json(successResponse({ 
      is_active: newState === 1,
      toggled: true 
    }));
  } catch (error) {
    console.error('Toggle alert error:', error);
    return c.json(errorResponse('DB_ERROR', 'Failed to toggle alert'), 500);
  }
});

export default alerts;
