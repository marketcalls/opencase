/**
 * SIP Routes
 * Systematic Investment Plan management
 */

import { Hono } from 'hono';
import type { 
  Bindings, 
  Variables, 
  SIP,
  SessionData,
  CreateSIPRequest
} from '../types';
import { successResponse, errorResponse, getNextSIPDate } from '../lib/utils';

const sip = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Auth middleware
sip.use('*', async (c, next) => {
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
 * GET /api/sip
 * Get all SIPs for current account
 */
sip.get('/', async (c) => {
  const session = c.get('session') as SessionData;
  
  try {
    const sips = await c.env.DB.prepare(`
      SELECT s.*, b.name as basket_name, b.theme as basket_theme
      FROM sips s
      JOIN baskets b ON s.basket_id = b.id
      WHERE s.account_id = ?
      ORDER BY s.status, s.next_execution_date
    `).bind(session.account_id).all();
    
    return c.json(successResponse(sips.results));
  } catch (error) {
    console.error('Get SIPs error:', error);
    return c.json(errorResponse('DB_ERROR', 'Failed to fetch SIPs'), 500);
  }
});

/**
 * GET /api/sip/:id
 * Get SIP details with execution history
 */
sip.get('/:id', async (c) => {
  const sipId = parseInt(c.req.param('id'));
  const session = c.get('session') as SessionData;
  
  try {
    const sipData = await c.env.DB.prepare(`
      SELECT s.*, b.name as basket_name, b.theme as basket_theme
      FROM sips s
      JOIN baskets b ON s.basket_id = b.id
      WHERE s.id = ? AND s.account_id = ?
    `).bind(sipId, session.account_id).first();
    
    if (!sipData) {
      return c.json(errorResponse('NOT_FOUND', 'SIP not found'), 404);
    }
    
    // Get execution history
    const executions = await c.env.DB.prepare(`
      SELECT * FROM sip_executions
      WHERE sip_id = ?
      ORDER BY scheduled_date DESC
      LIMIT 20
    `).bind(sipId).all();
    
    return c.json(successResponse({
      ...sipData,
      executions: executions.results
    }));
  } catch (error) {
    console.error('Get SIP error:', error);
    return c.json(errorResponse('DB_ERROR', 'Failed to fetch SIP'), 500);
  }
});

/**
 * POST /api/sip
 * Create a new SIP
 */
sip.post('/', async (c) => {
  const session = c.get('session') as SessionData;
  
  try {
    const body = await c.req.json<CreateSIPRequest>();
    
    // Validate
    if (!body.basket_id || !body.amount || !body.frequency || !body.start_date) {
      return c.json(errorResponse('INVALID_INPUT', 'basket_id, amount, frequency, and start_date are required'), 400);
    }
    
    if (body.amount < 500) {
      return c.json(errorResponse('INVALID_AMOUNT', 'Minimum SIP amount is Rs. 500'), 400);
    }
    
    // Validate basket exists
    const basket = await c.env.DB.prepare(
      'SELECT id FROM baskets WHERE id = ? AND is_active = 1'
    ).bind(body.basket_id).first();
    
    if (!basket) {
      return c.json(errorResponse('NOT_FOUND', 'Basket not found'), 404);
    }
    
    // Calculate next execution date
    const startDate = new Date(body.start_date);
    let nextExecutionDate = startDate;
    
    if (startDate <= new Date()) {
      nextExecutionDate = getNextSIPDate(body.frequency, body.day_of_week, body.day_of_month);
    }
    
    // Create SIP
    const result = await c.env.DB.prepare(`
      INSERT INTO sips (
        account_id, basket_id, amount, frequency, 
        day_of_week, day_of_month, start_date, end_date, next_execution_date
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      session.account_id,
      body.basket_id,
      body.amount,
      body.frequency,
      body.day_of_week ?? null,
      body.day_of_month ?? null,
      body.start_date,
      body.end_date ?? null,
      nextExecutionDate.toISOString().split('T')[0]
    ).run();
    
    const sipId = result.meta.last_row_id;
    
    return c.json(successResponse({
      sip_id: sipId,
      next_execution_date: nextExecutionDate.toISOString().split('T')[0],
      message: 'SIP created successfully'
    }), 201);
  } catch (error) {
    console.error('Create SIP error:', error);
    return c.json(errorResponse('DB_ERROR', 'Failed to create SIP'), 500);
  }
});

/**
 * PUT /api/sip/:id
 * Update SIP
 */
sip.put('/:id', async (c) => {
  const sipId = parseInt(c.req.param('id'));
  const session = c.get('session') as SessionData;
  
  try {
    const sipData = await c.env.DB.prepare(
      'SELECT * FROM sips WHERE id = ? AND account_id = ?'
    ).bind(sipId, session.account_id).first<SIP>();
    
    if (!sipData) {
      return c.json(errorResponse('NOT_FOUND', 'SIP not found'), 404);
    }
    
    const body = await c.req.json<Partial<CreateSIPRequest>>();
    
    const updates: string[] = [];
    const values: any[] = [];
    
    if (body.amount !== undefined) {
      if (body.amount < 500) {
        return c.json(errorResponse('INVALID_AMOUNT', 'Minimum SIP amount is Rs. 500'), 400);
      }
      updates.push('amount = ?');
      values.push(body.amount);
    }
    
    if (body.frequency !== undefined) {
      updates.push('frequency = ?');
      values.push(body.frequency);
    }
    
    if (body.day_of_week !== undefined) {
      updates.push('day_of_week = ?');
      values.push(body.day_of_week);
    }
    
    if (body.day_of_month !== undefined) {
      updates.push('day_of_month = ?');
      values.push(body.day_of_month);
    }
    
    if (body.end_date !== undefined) {
      updates.push('end_date = ?');
      values.push(body.end_date);
    }
    
    if (updates.length > 0) {
      // Recalculate next execution date if frequency changed
      if (body.frequency) {
        const nextDate = getNextSIPDate(
          body.frequency,
          body.day_of_week ?? sipData.day_of_week ?? undefined,
          body.day_of_month ?? sipData.day_of_month ?? undefined
        );
        updates.push('next_execution_date = ?');
        values.push(nextDate.toISOString().split('T')[0]);
      }
      
      updates.push('updated_at = datetime("now")');
      values.push(sipId);
      
      await c.env.DB.prepare(`
        UPDATE sips SET ${updates.join(', ')} WHERE id = ?
      `).bind(...values).run();
    }
    
    return c.json(successResponse({ updated: true }));
  } catch (error) {
    console.error('Update SIP error:', error);
    return c.json(errorResponse('DB_ERROR', 'Failed to update SIP'), 500);
  }
});

/**
 * POST /api/sip/:id/pause
 * Pause a SIP
 */
sip.post('/:id/pause', async (c) => {
  const sipId = parseInt(c.req.param('id'));
  const session = c.get('session') as SessionData;
  
  try {
    const result = await c.env.DB.prepare(`
      UPDATE sips SET status = 'PAUSED', updated_at = datetime('now')
      WHERE id = ? AND account_id = ? AND status = 'ACTIVE'
    `).bind(sipId, session.account_id).run();
    
    if (result.meta.changes === 0) {
      return c.json(errorResponse('NOT_FOUND', 'SIP not found or not active'), 404);
    }
    
    return c.json(successResponse({ paused: true }));
  } catch (error) {
    console.error('Pause SIP error:', error);
    return c.json(errorResponse('DB_ERROR', 'Failed to pause SIP'), 500);
  }
});

/**
 * POST /api/sip/:id/resume
 * Resume a paused SIP
 */
sip.post('/:id/resume', async (c) => {
  const sipId = parseInt(c.req.param('id'));
  const session = c.get('session') as SessionData;
  
  try {
    const sipData = await c.env.DB.prepare(
      'SELECT * FROM sips WHERE id = ? AND account_id = ? AND status = "PAUSED"'
    ).bind(sipId, session.account_id).first<SIP>();
    
    if (!sipData) {
      return c.json(errorResponse('NOT_FOUND', 'SIP not found or not paused'), 404);
    }
    
    // Calculate next execution date
    const nextDate = getNextSIPDate(
      sipData.frequency,
      sipData.day_of_week ?? undefined,
      sipData.day_of_month ?? undefined
    );
    
    await c.env.DB.prepare(`
      UPDATE sips SET status = 'ACTIVE', next_execution_date = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(nextDate.toISOString().split('T')[0], sipId).run();
    
    return c.json(successResponse({ 
      resumed: true,
      next_execution_date: nextDate.toISOString().split('T')[0]
    }));
  } catch (error) {
    console.error('Resume SIP error:', error);
    return c.json(errorResponse('DB_ERROR', 'Failed to resume SIP'), 500);
  }
});

/**
 * DELETE /api/sip/:id
 * Cancel a SIP
 */
sip.delete('/:id', async (c) => {
  const sipId = parseInt(c.req.param('id'));
  const session = c.get('session') as SessionData;
  
  try {
    const result = await c.env.DB.prepare(`
      UPDATE sips SET status = 'CANCELLED', updated_at = datetime('now')
      WHERE id = ? AND account_id = ? AND status IN ('ACTIVE', 'PAUSED')
    `).bind(sipId, session.account_id).run();
    
    if (result.meta.changes === 0) {
      return c.json(errorResponse('NOT_FOUND', 'SIP not found or already cancelled'), 404);
    }
    
    return c.json(successResponse({ cancelled: true }));
  } catch (error) {
    console.error('Cancel SIP error:', error);
    return c.json(errorResponse('DB_ERROR', 'Failed to cancel SIP'), 500);
  }
});

/**
 * GET /api/sip/pending-executions
 * Get SIPs due for execution (for scheduled job)
 */
sip.get('/pending-executions', async (c) => {
  const today = new Date().toISOString().split('T')[0];
  
  try {
    const pendingSips = await c.env.DB.prepare(`
      SELECT s.*, a.zerodha_user_id, b.name as basket_name
      FROM sips s
      JOIN accounts a ON s.account_id = a.id
      JOIN baskets b ON s.basket_id = b.id
      WHERE s.status = 'ACTIVE' 
        AND s.next_execution_date <= ?
        AND (s.end_date IS NULL OR s.end_date >= ?)
    `).bind(today, today).all();
    
    return c.json(successResponse(pendingSips.results));
  } catch (error) {
    console.error('Get pending SIPs error:', error);
    return c.json(errorResponse('DB_ERROR', 'Failed to fetch pending SIPs'), 500);
  }
});

/**
 * POST /api/sip/:id/execute
 * Execute a pending SIP (manual or scheduled)
 */
sip.post('/:id/execute', async (c) => {
  const sipId = parseInt(c.req.param('id'));
  const session = c.get('session') as SessionData;
  
  try {
    const sipData = await c.env.DB.prepare(`
      SELECT s.*, b.name as basket_name
      FROM sips s
      JOIN baskets b ON s.basket_id = b.id
      WHERE s.id = ? AND s.account_id = ? AND s.status = 'ACTIVE'
    `).bind(sipId, session.account_id).first<SIP & { basket_name: string }>();
    
    if (!sipData) {
      return c.json(errorResponse('NOT_FOUND', 'SIP not found or not active'), 404);
    }
    
    // Check if already executed today
    const today = new Date().toISOString().split('T')[0];
    const existingExecution = await c.env.DB.prepare(`
      SELECT * FROM sip_executions 
      WHERE sip_id = ? AND scheduled_date = ? AND status IN ('COMPLETED', 'PENDING')
    `).bind(sipId, today).first();
    
    if (existingExecution) {
      return c.json(errorResponse('ALREADY_EXECUTED', 'SIP already executed today'), 400);
    }
    
    // Create execution record
    const execResult = await c.env.DB.prepare(`
      INSERT INTO sip_executions (sip_id, scheduled_date, amount, status)
      VALUES (?, ?, ?, 'PENDING')
    `).bind(sipId, today, sipData.amount).run();
    
    const executionId = execResult.meta.last_row_id;
    
    // Trigger buy order (redirect to investments buy endpoint internally)
    // This would be called via the investments route
    
    // Update next execution date
    const nextDate = getNextSIPDate(
      sipData.frequency,
      sipData.day_of_week ?? undefined,
      sipData.day_of_month ?? undefined,
      new Date()
    );
    
    await c.env.DB.prepare(`
      UPDATE sips SET 
        next_execution_date = ?,
        completed_installments = completed_installments + 1,
        total_invested = total_invested + ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).bind(nextDate.toISOString().split('T')[0], sipData.amount, sipId).run();
    
    return c.json(successResponse({
      execution_id: executionId,
      sip_id: sipId,
      amount: sipData.amount,
      basket_id: sipData.basket_id,
      next_execution_date: nextDate.toISOString().split('T')[0],
      message: 'SIP execution initiated. Please complete the buy order.'
    }));
  } catch (error) {
    console.error('Execute SIP error:', error);
    return c.json(errorResponse('ERROR', 'Failed to execute SIP'), 500);
  }
});

/**
 * GET /api/sip/:id/history
 * Get SIP execution history
 */
sip.get('/:id/history', async (c) => {
  const sipId = parseInt(c.req.param('id'));
  const session = c.get('session') as SessionData;
  const limit = parseInt(c.req.query('limit') || '50');
  
  try {
    // Verify ownership
    const sipData = await c.env.DB.prepare(
      'SELECT * FROM sips WHERE id = ? AND account_id = ?'
    ).bind(sipId, session.account_id).first();
    
    if (!sipData) {
      return c.json(errorResponse('NOT_FOUND', 'SIP not found'), 404);
    }
    
    const history = await c.env.DB.prepare(`
      SELECT e.*, t.total_amount as transaction_amount, t.status as transaction_status
      FROM sip_executions e
      LEFT JOIN transactions t ON e.transaction_id = t.id
      WHERE e.sip_id = ?
      ORDER BY e.scheduled_date DESC
      LIMIT ?
    `).bind(sipId, limit).all();
    
    return c.json(successResponse(history.results));
  } catch (error) {
    console.error('SIP history error:', error);
    return c.json(errorResponse('ERROR', 'Failed to fetch SIP history'), 500);
  }
});

export default sip;
