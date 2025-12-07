/**
 * OpenCase Configuration
 * Reads from opencase.config.yaml and environment variables
 */

export interface AppConfig {
  tokenCleanup: {
    enabled: boolean;
    time: string;           // User-friendly time like "03:00"
    timezone: string;       // User timezone like "Asia/Kolkata"
    cronExpression: string; // Computed UTC cron expression
  };
  session: {
    expiryDays: number;
  };
  broker: {
    tokenExpiryHours: number;
  };
}

/**
 * Timezone offsets in minutes from UTC
 * Positive = ahead of UTC, Negative = behind UTC
 */
const TIMEZONE_OFFSETS: Record<string, number> = {
  // India
  'Asia/Kolkata': 330,      // UTC+5:30
  'IST': 330,

  // US
  'America/New_York': -300,  // UTC-5 (EST) / -240 (EDT)
  'America/Chicago': -360,   // UTC-6 (CST)
  'America/Denver': -420,    // UTC-7 (MST)
  'America/Los_Angeles': -480, // UTC-8 (PST)
  'EST': -300,
  'PST': -480,

  // Europe
  'Europe/London': 0,        // UTC+0 (GMT) / +60 (BST)
  'Europe/Paris': 60,        // UTC+1 (CET)
  'Europe/Berlin': 60,
  'GMT': 0,
  'CET': 60,

  // Asia
  'Asia/Dubai': 240,         // UTC+4
  'Asia/Singapore': 480,     // UTC+8
  'Asia/Tokyo': 540,         // UTC+9
  'Asia/Shanghai': 480,      // UTC+8

  // Australia
  'Australia/Sydney': 660,   // UTC+11 (AEDT) / +600 (AEST)

  // UTC
  'UTC': 0,
};

/**
 * Convert local time + timezone to UTC cron expression
 * @param time - Time in "HH:MM" format (e.g., "03:00")
 * @param timezone - Timezone name (e.g., "Asia/Kolkata")
 * @returns Cron expression in UTC
 */
export function convertToUTCCron(time: string, timezone: string): string {
  const [hours, minutes] = time.split(':').map(Number);

  if (isNaN(hours) || isNaN(minutes)) {
    // Invalid time format, use default 3:00 AM IST
    return '30 21 * * *';
  }

  const offsetMinutes = TIMEZONE_OFFSETS[timezone];

  if (offsetMinutes === undefined) {
    // Unknown timezone, treat as UTC
    return `${minutes} ${hours} * * *`;
  }

  // Convert local time to UTC
  let totalMinutes = hours * 60 + minutes - offsetMinutes;

  // Handle day wrap-around
  if (totalMinutes < 0) {
    totalMinutes += 24 * 60;
  } else if (totalMinutes >= 24 * 60) {
    totalMinutes -= 24 * 60;
  }

  const utcHours = Math.floor(totalMinutes / 60);
  const utcMinutes = totalMinutes % 60;

  return `${utcMinutes} ${utcHours} * * *`;
}

/**
 * Parse simple YAML config
 * Handles basic key-value and nested structures
 */
export function parseYamlConfig(yamlContent: string): Record<string, any> {
  const config: Record<string, any> = {};
  const lines = yamlContent.split('\n');
  const stack: { indent: number; obj: Record<string, any> }[] = [{ indent: -1, obj: config }];

  for (const line of lines) {
    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const indent = line.search(/\S/);
    const content = line.trim();

    // Parse key: value
    const colonIndex = content.indexOf(':');
    if (colonIndex === -1) continue;

    const key = content.substring(0, colonIndex).trim();
    let value: any = content.substring(colonIndex + 1).trim();

    // Remove quotes from string values
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else if (value === 'true') {
      value = true;
    } else if (value === 'false') {
      value = false;
    } else if (value !== '' && !isNaN(Number(value))) {
      value = Number(value);
    }

    // Pop stack until we find the parent
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].obj;

    if (value === '') {
      // This is a parent key, create nested object
      parent[key] = {};
      stack.push({ indent, obj: parent[key] });
    } else {
      parent[key] = value;
    }
  }

  return config;
}

/**
 * Default configuration (used when YAML not available)
 */
export const defaultConfig: AppConfig = {
  tokenCleanup: {
    enabled: true,
    time: '03:00',
    timezone: 'Asia/Kolkata',
    cronExpression: '30 21 * * *',
  },
  session: {
    expiryDays: 60,
  },
  broker: {
    tokenExpiryHours: 24,
  },
};

/**
 * Get configuration from YAML content and environment overrides
 */
export function getConfigFromYaml(yamlContent: string, env?: Record<string, string | undefined>): AppConfig {
  const yaml = parseYamlConfig(yamlContent);

  const time = env?.TOKEN_CLEANUP_TIME || yaml.tokenCleanup?.time || defaultConfig.tokenCleanup.time;
  const timezone = env?.TOKEN_CLEANUP_TIMEZONE || yaml.tokenCleanup?.timezone || defaultConfig.tokenCleanup.timezone;

  return {
    tokenCleanup: {
      enabled: env?.TOKEN_CLEANUP_ENABLED !== 'false' && yaml.tokenCleanup?.enabled !== false,
      time,
      timezone,
      cronExpression: convertToUTCCron(time, timezone),
    },
    session: {
      expiryDays: parseInt(env?.SESSION_EXPIRY_DAYS || '') || yaml.session?.expiryDays || defaultConfig.session.expiryDays,
    },
    broker: {
      tokenExpiryHours: parseInt(env?.TOKEN_EXPIRY_HOURS || '') || yaml.broker?.tokenExpiryHours || defaultConfig.broker.tokenExpiryHours,
    },
  };
}

/**
 * Get configuration from environment variables only (fallback)
 */
export function getConfig(env: Record<string, string | undefined>): AppConfig {
  const time = env.TOKEN_CLEANUP_TIME || defaultConfig.tokenCleanup.time;
  const timezone = env.TOKEN_CLEANUP_TIMEZONE || defaultConfig.tokenCleanup.timezone;

  return {
    tokenCleanup: {
      enabled: env.TOKEN_CLEANUP_ENABLED !== 'false',
      time,
      timezone,
      cronExpression: convertToUTCCron(time, timezone),
    },
    session: {
      expiryDays: parseInt(env.SESSION_EXPIRY_DAYS || '') || defaultConfig.session.expiryDays,
    },
    broker: {
      tokenExpiryHours: parseInt(env.TOKEN_EXPIRY_HOURS || '') || defaultConfig.broker.tokenExpiryHours,
    },
  };
}
