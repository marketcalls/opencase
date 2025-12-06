/**
 * Utility functions for StockBasket
 */

import type { ApiResponse } from '../types';

/**
 * Create a success API response
 */
export function successResponse<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
    error: null,
    timestamp: new Date().toISOString()
  };
}

/**
 * Create an error API response
 */
export function errorResponse(code: string, message: string): ApiResponse<null> {
  return {
    success: false,
    data: null,
    error: { code, message },
    timestamp: new Date().toISOString()
  };
}

/**
 * Encrypt sensitive data (API keys, secrets)
 * In production, use a proper encryption library
 */
export async function encrypt(text: string, key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  
  // Derive key from password
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    derivedKey,
    data
  );
  
  // Combine salt + iv + encrypted data
  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt sensitive data
 */
export async function decrypt(encryptedText: string, key: string): Promise<string> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  
  const combined = new Uint8Array(
    atob(encryptedText).split('').map(c => c.charCodeAt(0))
  );
  
  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 28);
  const data = combined.slice(28);
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv },
    derivedKey,
    data
  );
  
  return decoder.decode(decrypted);
}

/**
 * Generate a random session ID
 */
export function generateSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Calculate percentage change
 */
export function calculatePercentageChange(current: number, original: number): number {
  if (original === 0) return 0;
  return ((current - original) / original) * 100;
}

/**
 * Format currency (INR)
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

/**
 * Format percentage
 */
export function formatPercentage(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

/**
 * Validate basket weights sum to 100
 */
export function validateBasketWeights(stocks: Array<{ weight_percentage: number }>): boolean {
  const total = stocks.reduce((sum, s) => sum + s.weight_percentage, 0);
  return Math.abs(total - 100) < 0.01; // Allow small floating point errors
}

/**
 * Calculate minimum investment for a basket
 */
export function calculateMinInvestment(
  stocks: Array<{ weight_percentage: number }>,
  prices: Record<string, { last_price: number }>,
  stockKeys: string[]
): number {
  let minInvestment = 0;
  
  for (let i = 0; i < stocks.length; i++) {
    const stock = stocks[i];
    const key = stockKeys[i];
    const priceData = prices[key];
    
    if (priceData) {
      // Minimum 1 share of each stock
      const minForStock = (priceData.last_price / stock.weight_percentage) * 100;
      minInvestment = Math.max(minInvestment, minForStock);
    }
  }
  
  return Math.ceil(minInvestment);
}

/**
 * Parse JSON safely
 */
export function safeJsonParse<T>(json: string | null, defaultValue: T): T {
  if (!json) return defaultValue;
  try {
    return JSON.parse(json);
  } catch {
    return defaultValue;
  }
}

/**
 * Get next SIP execution date
 */
export function getNextSIPDate(
  frequency: 'daily' | 'weekly' | 'monthly',
  dayOfWeek?: number,
  dayOfMonth?: number,
  fromDate?: Date
): Date {
  const date = fromDate ? new Date(fromDate) : new Date();
  date.setHours(0, 0, 0, 0);
  
  switch (frequency) {
    case 'daily':
      date.setDate(date.getDate() + 1);
      break;
      
    case 'weekly':
      const currentDay = date.getDay();
      const targetDay = dayOfWeek ?? 1; // Default to Monday
      let daysUntil = targetDay - currentDay;
      if (daysUntil <= 0) daysUntil += 7;
      date.setDate(date.getDate() + daysUntil);
      break;
      
    case 'monthly':
      const targetDate = dayOfMonth ?? 1; // Default to 1st
      date.setMonth(date.getMonth() + 1);
      date.setDate(Math.min(targetDate, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()));
      break;
  }
  
  return date;
}

/**
 * Check if market is open (IST)
 */
export function isMarketOpen(): boolean {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
  const ist = new Date(now.getTime() + istOffset);
  
  const day = ist.getUTCDay();
  const hours = ist.getUTCHours();
  const minutes = ist.getUTCMinutes();
  const totalMinutes = hours * 60 + minutes;
  
  // Market closed on weekends
  if (day === 0 || day === 6) return false;
  
  // Market hours: 9:15 AM to 3:30 PM IST
  const marketOpen = 9 * 60 + 15; // 9:15 AM
  const marketClose = 15 * 60 + 30; // 3:30 PM
  
  return totalMinutes >= marketOpen && totalMinutes <= marketClose;
}

/**
 * Get IST date string (YYYY-MM-DD)
 */
export function getISTDateString(date?: Date): string {
  const d = date || new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(d.getTime() + istOffset);
  return ist.toISOString().split('T')[0];
}

/**
 * Normalize value to base 100 for comparison
 */
export function normalizeToBase100(values: number[], baseValue?: number): number[] {
  const base = baseValue ?? values[0];
  if (base === 0) return values.map(() => 100);
  return values.map(v => (v / base) * 100);
}

/**
 * Group array by key
 */
export function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce((groups, item) => {
    const group = String(item[key]);
    groups[group] = groups[group] || [];
    groups[group].push(item);
    return groups;
  }, {} as Record<string, T[]>);
}
