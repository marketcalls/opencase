/**
 * Broker Factory - Creates broker instances based on type
 */

import type { BrokerClient, BrokerType, BrokerCredentials } from './types';
import { ZerodhaBroker } from './zerodha';
import { AngelOneBroker } from './angelone';

/**
 * Create a broker client instance
 */
export function createBrokerClient(
  type: BrokerType,
  credentials: BrokerCredentials
): BrokerClient {
  switch (type) {
    case 'zerodha':
      return new ZerodhaBroker(credentials);
    case 'angelone':
      return new AngelOneBroker(credentials);
    default:
      throw new Error(`Unsupported broker type: ${type}`);
  }
}

/**
 * Get supported brokers
 */
export function getSupportedBrokers(): Array<{
  type: BrokerType;
  name: string;
  description: string;
  docUrl: string;
  features: string[];
}> {
  return [
    {
      type: 'zerodha',
      name: 'Zerodha Kite',
      description: 'India\'s largest retail stockbroker',
      docUrl: 'https://developers.kite.trade',
      features: ['Market Orders', 'Limit Orders', 'GTT Orders', 'Holdings', 'Positions', 'Live Quotes']
    },
    {
      type: 'angelone',
      name: 'Angel One',
      description: 'Full-service broker with Smart API',
      docUrl: 'https://smartapi.angelbroking.com/docs',
      features: ['Market Orders', 'Limit Orders', 'Holdings', 'Positions', 'Live Quotes', 'Historical Data']
    }
  ];
}

/**
 * Validate broker credentials format
 */
export function validateBrokerCredentials(
  type: BrokerType,
  credentials: Partial<BrokerCredentials>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!credentials.apiKey) {
    errors.push('API Key is required');
  }
  
  switch (type) {
    case 'zerodha':
      if (!credentials.apiSecret) {
        errors.push('API Secret is required for Zerodha');
      }
      break;
      
    case 'angelone':
      if (!credentials.apiSecret) {
        errors.push('API Secret is required for Angel One');
      }
      if (credentials.accessToken && !credentials.refreshToken) {
        // Refresh token is optional but recommended
      }
      break;
      
    default:
      errors.push(`Unknown broker type: ${type}`);
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get broker display name
 */
export function getBrokerDisplayName(type: BrokerType): string {
  const brokers: Record<BrokerType, string> = {
    zerodha: 'Zerodha Kite',
    angelone: 'Angel One'
  };
  return brokers[type] || type;
}

/**
 * Get broker login URL generator
 */
export function getBrokerLoginUrl(type: BrokerType, apiKey: string, redirectUrl: string): string | null {
  switch (type) {
    case 'zerodha':
      return `https://kite.zerodha.com/connect/login?v=3&api_key=${apiKey}&redirect_url=${encodeURIComponent(redirectUrl)}`;
    case 'angelone':
      // Angel One uses TOTP-based login, no direct OAuth URL
      return null;
    default:
      return null;
  }
}

/**
 * Check if broker supports OAuth login
 */
export function supportsOAuthLogin(type: BrokerType): boolean {
  return type === 'zerodha';
}

/**
 * Get broker-specific configuration requirements
 */
export function getBrokerRequirements(type: BrokerType): {
  requiresOAuth: boolean;
  requiresTOTP: boolean;
  requiresClientCode: boolean;
  requiresMpin: boolean;
  additionalFields: string[];
} {
  switch (type) {
    case 'zerodha':
      return {
        requiresOAuth: true,
        requiresTOTP: false,
        requiresClientCode: false,
        requiresMpin: false,
        additionalFields: []
      };
    case 'angelone':
      return {
        requiresOAuth: false,
        requiresTOTP: true,
        requiresClientCode: true,
        requiresMpin: true,
        additionalFields: ['clientCode', 'mpin', 'totp']
      };
    default:
      return {
        requiresOAuth: false,
        requiresTOTP: false,
        requiresClientCode: false,
        requiresMpin: false,
        additionalFields: []
      };
  }
}
