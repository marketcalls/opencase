/**
 * User Authentication Routes
 * Handles user signup, login, and session management
 * Single user app - first user becomes admin
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../types';
import { successResponse, errorResponse, generateSessionId } from '../lib/utils';

interface User {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  is_admin: number;
  is_active: number;
  avatar_url: string | null;
  last_login_at: string | null;
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

const user = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * Simple password hashing using Web Crypto API
 * Note: For production, consider using bcrypt or argon2 via a library
 */
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'opencase-salt-v1');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const computedHash = await hashPassword(password);
  return computedHash === hash;
}

/**
 * GET /api/user/status
 * Check if app needs initial setup (no users exist)
 */
user.get('/status', async (c) => {
  try {
    const userCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM users'
    ).first<{ count: number }>();
    
    const needsSetup = (userCount?.count || 0) === 0;
    
    // Check if user is logged in
    const sessionId = c.req.header('X-Session-ID');
    let currentUser = null;
    
    if (sessionId) {
      const sessionData = await c.env.KV.get(`user:${sessionId}`, 'json') as UserSession | null;
      if (sessionData && sessionData.expires_at > Date.now()) {
        currentUser = {
          id: sessionData.user_id,
          email: sessionData.email,
          name: sessionData.name,
          is_admin: sessionData.is_admin
        };
      }
    }
    
    return c.json(successResponse({
      needs_setup: needsSetup,
      is_authenticated: !!currentUser,
      user: currentUser
    }));
  } catch (error) {
    // Table might not exist yet
    return c.json(successResponse({
      needs_setup: true,
      is_authenticated: false,
      user: null
    }));
  }
});

/**
 * POST /api/user/signup
 * Create new user account (first user becomes admin)
 */
user.post('/signup', async (c) => {
  try {
    const { email, password, name } = await c.req.json<{
      email: string;
      password: string;
      name: string;
    }>();
    
    if (!email || !password || !name) {
      return c.json(errorResponse('INVALID_INPUT', 'Email, password, and name are required'), 400);
    }
    
    if (password.length < 6) {
      return c.json(errorResponse('WEAK_PASSWORD', 'Password must be at least 6 characters'), 400);
    }
    
    // Check if email already exists
    const existingUser = await c.env.DB.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).bind(email.toLowerCase()).first();
    
    if (existingUser) {
      return c.json(errorResponse('EMAIL_EXISTS', 'An account with this email already exists'), 400);
    }
    
    // Check if this is the first user (becomes admin)
    const userCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM users'
    ).first<{ count: number }>();
    
    const isFirstUser = (userCount?.count || 0) === 0;
    
    // Hash password and create user
    const passwordHash = await hashPassword(password);
    
    const result = await c.env.DB.prepare(`
      INSERT INTO users (email, password_hash, name, is_admin, last_login_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).bind(email.toLowerCase(), passwordHash, name, isFirstUser ? 1 : 0).run();
    
    const userId = result.meta.last_row_id;
    
    // Mark app as initialized
    if (isFirstUser) {
      await c.env.DB.prepare(`
        INSERT INTO app_config (config_key, config_value, is_encrypted)
        VALUES ('app_initialized', '1', 0)
        ON CONFLICT(config_key) DO UPDATE SET config_value = '1', updated_at = datetime('now')
      `).run();
    }
    
    // Create session
    const sessionId = generateSessionId();
    const sessionData: UserSession = {
      user_id: userId as number,
      email: email.toLowerCase(),
      name: name,
      is_admin: isFirstUser,
      expires_at: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
    };
    
    await c.env.KV.put(`user:${sessionId}`, JSON.stringify(sessionData), {
      expirationTtl: 604800 // 7 days
    });
    
    return c.json(successResponse({
      session_id: sessionId,
      user: {
        id: userId,
        email: email.toLowerCase(),
        name: name,
        is_admin: isFirstUser
      },
      message: isFirstUser ? 'Welcome! You are the admin.' : 'Account created successfully.'
    }));
  } catch (error) {
    console.error('Signup error:', error);
    return c.json(errorResponse('SIGNUP_ERROR', 'Failed to create account'), 500);
  }
});

/**
 * POST /api/user/login
 * Login with email and password
 */
user.post('/login', async (c) => {
  try {
    const { email, password } = await c.req.json<{
      email: string;
      password: string;
    }>();
    
    if (!email || !password) {
      return c.json(errorResponse('INVALID_INPUT', 'Email and password are required'), 400);
    }
    
    // Find user
    const dbUser = await c.env.DB.prepare(
      'SELECT * FROM users WHERE email = ? AND is_active = 1'
    ).bind(email.toLowerCase()).first<User>();
    
    if (!dbUser) {
      return c.json(errorResponse('INVALID_CREDENTIALS', 'Invalid email or password'), 401);
    }
    
    // Verify password
    const isValid = await verifyPassword(password, dbUser.password_hash);
    if (!isValid) {
      return c.json(errorResponse('INVALID_CREDENTIALS', 'Invalid email or password'), 401);
    }
    
    // Update last login
    await c.env.DB.prepare(
      'UPDATE users SET last_login_at = datetime("now"), updated_at = datetime("now") WHERE id = ?'
    ).bind(dbUser.id).run();
    
    // Create session
    const sessionId = generateSessionId();
    const sessionData: UserSession = {
      user_id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      is_admin: dbUser.is_admin === 1,
      expires_at: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
    };
    
    await c.env.KV.put(`user:${sessionId}`, JSON.stringify(sessionData), {
      expirationTtl: 604800 // 7 days
    });
    
    return c.json(successResponse({
      session_id: sessionId,
      user: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        is_admin: dbUser.is_admin === 1
      }
    }));
  } catch (error) {
    console.error('Login error:', error);
    return c.json(errorResponse('LOGIN_ERROR', 'Failed to login'), 500);
  }
});

/**
 * POST /api/user/logout
 * Clear user session
 */
user.post('/logout', async (c) => {
  const sessionId = c.req.header('X-Session-ID');
  
  if (sessionId) {
    await c.env.KV.delete(`user:${sessionId}`);
  }
  
  return c.json(successResponse({ logged_out: true }));
});

/**
 * GET /api/user/profile
 * Get current user profile
 */
user.get('/profile', async (c) => {
  const sessionId = c.req.header('X-Session-ID');
  
  if (!sessionId) {
    return c.json(errorResponse('UNAUTHORIZED', 'Login required'), 401);
  }
  
  const sessionData = await c.env.KV.get(`user:${sessionId}`, 'json') as UserSession | null;
  
  if (!sessionData || sessionData.expires_at < Date.now()) {
    return c.json(errorResponse('SESSION_EXPIRED', 'Please login again'), 401);
  }
  
  try {
    const dbUser = await c.env.DB.prepare(
      'SELECT id, email, name, is_admin, avatar_url, created_at FROM users WHERE id = ?'
    ).bind(sessionData.user_id).first<User>();
    
    if (!dbUser) {
      return c.json(errorResponse('NOT_FOUND', 'User not found'), 404);
    }
    
    return c.json(successResponse({
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      is_admin: dbUser.is_admin === 1,
      avatar_url: dbUser.avatar_url,
      created_at: dbUser.created_at
    }));
  } catch (error) {
    console.error('Profile error:', error);
    return c.json(errorResponse('ERROR', 'Failed to get profile'), 500);
  }
});

/**
 * PUT /api/user/profile
 * Update user profile
 */
user.put('/profile', async (c) => {
  const sessionId = c.req.header('X-Session-ID');
  
  if (!sessionId) {
    return c.json(errorResponse('UNAUTHORIZED', 'Login required'), 401);
  }
  
  const sessionData = await c.env.KV.get(`user:${sessionId}`, 'json') as UserSession | null;
  
  if (!sessionData || sessionData.expires_at < Date.now()) {
    return c.json(errorResponse('SESSION_EXPIRED', 'Please login again'), 401);
  }
  
  try {
    const { name, current_password, new_password } = await c.req.json<{
      name?: string;
      current_password?: string;
      new_password?: string;
    }>();
    
    const updates: string[] = [];
    const values: any[] = [];
    
    if (name) {
      updates.push('name = ?');
      values.push(name);
    }
    
    // Password change
    if (current_password && new_password) {
      const dbUser = await c.env.DB.prepare(
        'SELECT password_hash FROM users WHERE id = ?'
      ).bind(sessionData.user_id).first<{ password_hash: string }>();
      
      if (!dbUser || !(await verifyPassword(current_password, dbUser.password_hash))) {
        return c.json(errorResponse('INVALID_PASSWORD', 'Current password is incorrect'), 400);
      }
      
      if (new_password.length < 6) {
        return c.json(errorResponse('WEAK_PASSWORD', 'New password must be at least 6 characters'), 400);
      }
      
      updates.push('password_hash = ?');
      values.push(await hashPassword(new_password));
    }
    
    if (updates.length > 0) {
      updates.push('updated_at = datetime("now")');
      values.push(sessionData.user_id);
      
      await c.env.DB.prepare(`
        UPDATE users SET ${updates.join(', ')} WHERE id = ?
      `).bind(...values).run();
    }
    
    return c.json(successResponse({ updated: true }));
  } catch (error) {
    console.error('Update profile error:', error);
    return c.json(errorResponse('ERROR', 'Failed to update profile'), 500);
  }
});

export default user;
