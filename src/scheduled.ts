/**
 * Scheduled Tasks Handler
 * Handles Cloudflare Cron Triggers for automated tasks
 */

import type { Bindings } from './types';
import { getConfig } from './config';

/**
 * Disconnect all broker accounts and clear tokens
 * Runs at configured time (default: 3:00 AM IST)
 */
async function cleanupExpiredTokens(env: Bindings): Promise<{ disconnected: number; errors: string[] }> {
  const errors: string[] = [];
  let disconnected = 0;

  try {
    // Get all connected broker accounts
    const connectedAccounts = await env.DB.prepare(`
      SELECT id, broker_type, account_name, broker_user_id, last_connected_at
      FROM broker_accounts
      WHERE is_connected = 1 AND is_active = 1
    `).all<{
      id: number;
      broker_type: string;
      account_name: string;
      broker_user_id: string | null;
      last_connected_at: string | null;
    }>();

    console.log(`Found ${connectedAccounts.results.length} connected broker accounts to disconnect`);

    // Disconnect each account
    for (const account of connectedAccounts.results) {
      try {
        await env.DB.prepare(`
          UPDATE broker_accounts SET
            access_token = NULL,
            refresh_token = NULL,
            feed_token = NULL,
            is_connected = 0,
            connection_status = 'disconnected',
            updated_at = datetime('now')
          WHERE id = ?
        `).bind(account.id).run();

        disconnected++;
        console.log(`Disconnected broker account: ${account.account_name} (${account.broker_type})`);
      } catch (error) {
        const errorMsg = `Failed to disconnect account ${account.id}: ${(error as Error).message}`;
        errors.push(errorMsg);
        console.error(errorMsg);
      }
    }

    // Also clean up expired user sessions from KV
    // Note: KV keys with TTL will auto-expire, but we can't enumerate them
    // This is handled by the TTL set during session creation

    console.log(`Token cleanup completed: ${disconnected} accounts disconnected`);
  } catch (error) {
    const errorMsg = `Token cleanup failed: ${(error as Error).message}`;
    errors.push(errorMsg);
    console.error(errorMsg);
  }

  return { disconnected, errors };
}

/**
 * Main scheduled event handler
 * Called by Cloudflare Workers cron trigger
 */
export async function handleScheduled(
  event: ScheduledEvent,
  env: Bindings,
  ctx: ExecutionContext
): Promise<void> {
  const config = getConfig(env as unknown as Record<string, string | undefined>);

  console.log(`Scheduled task triggered at ${new Date().toISOString()}`);
  console.log(`Cron expression: ${event.cron}`);
  console.log(`Configured time: ${config.tokenCleanup.time} ${config.tokenCleanup.timezone}`);
  console.log(`Computed UTC cron: ${config.tokenCleanup.cronExpression}`);

  // Check if token cleanup is enabled
  if (!config.tokenCleanup.enabled) {
    console.log('Token cleanup is disabled, skipping...');
    return;
  }

  // Run token cleanup
  const result = await cleanupExpiredTokens(env);

  // Log results
  console.log(`Cleanup result: ${result.disconnected} accounts disconnected`);
  if (result.errors.length > 0) {
    console.error(`Cleanup errors: ${result.errors.join(', ')}`);
  }
}

/**
 * Export for testing - manually trigger cleanup
 */
export { cleanupExpiredTokens };
