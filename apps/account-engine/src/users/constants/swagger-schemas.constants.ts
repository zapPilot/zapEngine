/**
 * Shared Swagger response schemas and descriptions for Users API
 */

// Error descriptions
export const USER_NOT_FOUND_DESC = 'User not found';
export const WALLET_NOT_FOUND_DESC = 'Wallet not found';
export const BAD_REQUEST_DESC = 'Invalid request data';

// Success response schema (with success flag and message)
export const SUCCESS_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    message: { type: 'string' },
  },
} as const;

// Wallet added response schema (with wallet_id and message)
export const WALLET_ADDED_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    wallet_id: { type: 'string', format: 'uuid' },
    message: { type: 'string' },
  },
} as const;

// Message-only response schema
export const MESSAGE_ONLY_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    message: { type: 'string' },
  },
} as const;

// ETL job base properties (shared across ETL schemas)
const ETL_JOB_BASE_PROPERTIES = {
  job_id: { type: 'string', format: 'uuid' },
  status: { type: 'string' },
};

// ETL job response schemas
export const ETL_JOB_QUEUED_SCHEMA = {
  type: 'object',
  properties: {
    ...ETL_JOB_BASE_PROPERTIES,
    message: { type: 'string' },
  },
} as const;

// Connect wallet response schema
export const CONNECT_WALLET_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    user_id: { type: 'string', format: 'uuid' },
    is_new_user: { type: 'boolean' },
    etl_job: {
      type: 'object',
      nullable: true,
      properties: {
        job_id: { type: 'string', nullable: true },
        status: { type: 'string' },
        message: { type: 'string' },
        rate_limited: { type: 'boolean' },
      },
    },
  },
} as const;

// Wallet list item schema
const WALLET_ITEM_PROPERTIES = {
  id: { type: 'string', format: 'uuid' },
  user_id: { type: 'string', format: 'uuid' },
  wallet: { type: 'string' },
  label: { type: 'string' },
  created_at: { type: 'string', format: 'date-time' },
};

// User wallets array response schema
export const USER_WALLETS_RESPONSE_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: WALLET_ITEM_PROPERTIES,
  },
} as const;

// User profile response schema
export const USER_PROFILE_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    user: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        email: { type: 'string' },
        created_at: { type: 'string', format: 'date-time' },
      },
    },
    wallets: {
      type: 'array',
      items: {
        type: 'object',
        properties: WALLET_ITEM_PROPERTIES,
      },
    },
    subscription: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        user_id: { type: 'string', format: 'uuid' },
        plan_code: { type: 'string' },
        starts_at: { type: 'string', format: 'date-time' },
        ends_at: { type: 'string', format: 'date-time' },
        is_canceled: { type: 'boolean' },
        created_at: { type: 'string', format: 'date-time' },
        plan: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            name: { type: 'string' },
            tier: { type: 'number' },
          },
        },
      },
    },
  },
} as const;

// Telegram token response schema
export const TELEGRAM_TOKEN_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    token: { type: 'string', description: '32-character hex token' },
    botName: { type: 'string', description: 'Telegram bot username' },
    deepLink: {
      type: 'string',
      description: 'Deep link URL to open Telegram',
    },
    expiresAt: {
      type: 'string',
      format: 'date-time',
      description: 'Token expiration timestamp',
    },
  },
} as const;

// Telegram status response schema
export const TELEGRAM_STATUS_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    isConnected: {
      type: 'boolean',
      description: 'Whether Telegram is connected',
    },
    isEnabled: {
      type: 'boolean',
      description: 'Whether notifications are enabled',
    },
    connectedAt: {
      type: 'string',
      format: 'date-time',
      description: 'When user connected (if connected)',
      nullable: true,
    },
  },
} as const;

// Reusable API parameter decorators
export const USER_ID_PARAM = {
  name: 'userId',
  type: 'string',
  format: 'uuid',
} as const;

export const WALLET_ADDRESS_PARAM = {
  name: 'walletAddress',
  type: 'string',
  description: 'Ethereum wallet address',
} as const;
