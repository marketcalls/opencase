# OpenCase API Design

## Overview

OpenCase exposes a RESTful JSON API built with the Hono framework. All endpoints are prefixed with `/api`.

## Authentication

### Session-Based Auth

User authentication uses session tokens stored in Cloudflare KV.

**Headers**:
```
X-Session-ID: <session_token>
X-Active-Broker-ID: <broker_account_id>  (optional)
```

**Session Storage**:
- Key: `user:<session_id>`
- Value: `{ user_id, email, name, is_admin, expires_at }`
- TTL: 24 hours

### Authentication Flow

```
POST /api/user/login
  -> Validate credentials
  -> Create session in KV
  -> Return session_id

GET /api/user/status
  -> Check X-Session-ID header
  -> Validate session in KV
  -> Return user info
```

## Response Format

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional success message"
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | No session or invalid session |
| `SESSION_EXPIRED` | 401 | Session has expired |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `BROKER_ERROR` | 500 | Broker API failure |
| `INTERNAL_ERROR` | 500 | Server error |

## API Endpoints

### User Authentication

#### GET /api/user/status
Check authentication status.

**Response**:
```json
{
  "success": true,
  "data": {
    "is_authenticated": true,
    "user": {
      "id": 1,
      "email": "user@example.com",
      "name": "John Doe",
      "is_admin": true
    }
  }
}
```

#### POST /api/user/signup
Create new user account.

**Request**:
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "session_id": "abc123...",
    "user": { ... },
    "is_first_user": true
  }
}
```

#### POST /api/user/login
Login with credentials.

**Request**:
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "session_id": "abc123...",
    "user": { ... }
  }
}
```

#### POST /api/user/logout
End current session.

**Response**:
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

#### GET /api/user/profile
Get user profile.

**Response**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "email": "user@example.com",
    "name": "John Doe",
    "is_admin": true,
    "avatar_url": null,
    "created_at": "2025-12-01T00:00:00Z"
  }
}
```

#### PUT /api/user/profile
Update user profile.

**Request**:
```json
{
  "name": "John Smith",
  "avatar_url": "https://..."
}
```

### Broker Accounts

#### GET /api/broker-accounts
List user's broker accounts.

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "broker_type": "zerodha",
      "account_name": "Trading Account",
      "broker_user_id": "AB1234",
      "is_connected": true,
      "connection_status": "connected",
      "last_connected_at": "2025-12-06T10:00:00Z"
    }
  ]
}
```

#### POST /api/broker-accounts
Add new broker account.

**Request**:
```json
{
  "broker_type": "zerodha",
  "account_name": "My Trading Account",
  "api_key": "your_api_key",
  "api_secret": "your_api_secret"
}
```

For Angel One:
```json
{
  "broker_type": "angelone",
  "account_name": "Angel Account",
  "api_key": "your_api_key",
  "client_code": "A12345",
  "mpin": "1234"
}
```

#### DELETE /api/broker-accounts/:id
Remove broker account.

#### POST /api/broker-accounts/:id/connect
Connect to broker.

**Zerodha Response** (redirect):
```json
{
  "success": true,
  "data": {
    "redirect_url": "https://kite.zerodha.com/connect/login?..."
  }
}
```

**Angel One Request**:
```json
{
  "totp": "123456"
}
```

**Angel One Response**:
```json
{
  "success": true,
  "data": {
    "connected": true,
    "broker_name": "JOHN DOE",
    "broker_user_id": "A12345"
  }
}
```

#### POST /api/broker-accounts/:id/disconnect
Disconnect from broker.

#### GET /api/broker-accounts/active
Get currently active broker account.

### Setup & Configuration

#### GET /api/setup/status
Check platform configuration.

**Response**:
```json
{
  "success": true,
  "data": {
    "is_configured": true,
    "brokers": {
      "zerodha": { "configured": true },
      "angelone": { "configured": false }
    },
    "default_broker": "zerodha"
  }
}
```

#### GET /api/setup/brokers
List supported brokers.

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "zerodha",
      "name": "Zerodha Kite",
      "auth_type": "oauth",
      "fields": ["api_key", "api_secret"]
    },
    {
      "id": "angelone",
      "name": "Angel One",
      "auth_type": "totp",
      "fields": ["api_key", "client_code", "mpin"]
    }
  ]
}
```

#### POST /api/setup/configure
Save broker API credentials (admin only).

**Request**:
```json
{
  "broker": "zerodha",
  "api_key": "...",
  "api_secret": "..."
}
```

#### PUT /api/setup/default-broker
Set default broker (admin only).

**Request**:
```json
{
  "broker": "angelone"
}
```

### Baskets

#### GET /api/baskets
List user's baskets.

**Query Parameters**:
- `include_templates=true` - Include template baskets

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "IT Leaders",
      "theme": "Technology",
      "stock_count": 5,
      "min_investment": 25000,
      "risk_level": "moderate",
      "created_at": "2025-12-01T00:00:00Z"
    }
  ]
}
```

#### GET /api/baskets/templates
Get pre-built template baskets.

#### POST /api/baskets
Create new basket.

**Request**:
```json
{
  "name": "My Tech Basket",
  "description": "Top tech stocks",
  "theme": "Technology",
  "risk_level": "moderate",
  "benchmark_symbol": "NSE:NIFTY IT",
  "stocks": [
    {
      "trading_symbol": "TCS",
      "exchange": "NSE",
      "weight_percentage": 25,
      "company_name": "Tata Consultancy Services"
    },
    {
      "trading_symbol": "INFY",
      "exchange": "NSE",
      "weight_percentage": 25
    }
  ]
}
```

**Validation**:
- Name: required, max 100 chars
- Stocks: 1-100 stocks
- Weights: must sum to 100%

#### PUT /api/baskets/:id
Update basket.

#### DELETE /api/baskets/:id
Delete basket.

#### POST /api/baskets/calculate-weights
Calculate equal weights.

**Request**:
```json
{
  "stocks": ["TCS", "INFY", "WIPRO", "HCLTECH"]
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "weight_per_stock": 25,
    "total": 100
  }
}
```

### Investments

#### GET /api/investments
List user's investments.

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "basket_id": 1,
      "basket_name": "IT Leaders",
      "invested_amount": 50000,
      "current_value": 52500,
      "pnl": 2500,
      "pnl_percentage": 5,
      "status": "ACTIVE",
      "invested_at": "2025-12-01T00:00:00Z"
    }
  ]
}
```

#### POST /api/investments/buy/:basketId
Generate buy orders for basket.

**Request**:
```json
{
  "amount": 50000
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "investment_id": 1,
    "transaction_id": 1,
    "orders": [
      {
        "trading_symbol": "TCS",
        "exchange": "NSE",
        "quantity": 3,
        "price": 4200,
        "amount": 12600
      }
    ],
    "total_amount": 49800,
    "broker_redirect_url": "https://..."
  }
}
```

#### GET /api/investments/:id
Get investment details.

#### POST /api/investments/:id/rebalance
Execute portfolio rebalance.

**Response**:
```json
{
  "success": true,
  "data": {
    "rebalance_orders": [
      {
        "trading_symbol": "TCS",
        "action": "BUY",
        "quantity": 1,
        "reason": "Underweight by 2%"
      }
    ]
  }
}
```

### Portfolio

#### GET /api/portfolio/summary
Get portfolio summary.

**Response**:
```json
{
  "success": true,
  "data": {
    "total_invested": 150000,
    "current_value": 157500,
    "total_pnl": 7500,
    "total_pnl_percentage": 5,
    "day_change": 1200,
    "day_change_percentage": 0.76
  }
}
```

#### GET /api/portfolio/holdings
Get holdings from broker.

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "trading_symbol": "TCS",
      "exchange": "NSE",
      "total_quantity": 10,
      "avg_price": 4100,
      "current_price": 4250,
      "current_value": 42500,
      "invested_value": 41000,
      "pnl": 1500,
      "pnl_percentage": 3.66
    }
  ]
}
```

### Instruments

#### GET /api/instruments/search
Search stocks.

**Query Parameters**:
- `q` - Search query (symbol or name)
- `exchange` - Filter by exchange (NSE, BSE)
- `limit` - Max results (default 20)

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "symbol": "TCS",
      "name": "Tata Consultancy Services Ltd",
      "exchange": "NSE",
      "instrument_type": "EQ",
      "last_price": 4250,
      "zerodha_token": 2953217,
      "angelone_token": "11536"
    }
  ]
}
```

#### GET /api/instruments/download
Download master instruments from broker.

**Query Parameters**:
- `broker` - Broker to download from (zerodha, angelone)

#### GET /api/instruments/status
Check instrument download status.

**Response**:
```json
{
  "success": true,
  "data": {
    "needs_download": false,
    "last_download": "2025-12-06T06:00:00Z",
    "total_instruments": 15000,
    "sources": {
      "zerodha": "2025-12-06T06:00:00Z",
      "angelone": "2025-12-06T06:30:00Z"
    }
  }
}
```

### SIP

#### GET /api/sip
List user's SIPs.

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "basket_id": 1,
      "basket_name": "IT Leaders",
      "amount": 10000,
      "frequency": "monthly",
      "day_of_month": 1,
      "next_execution_date": "2026-01-01",
      "status": "ACTIVE",
      "total_invested": 20000,
      "completed_installments": 2
    }
  ]
}
```

#### POST /api/sip
Create new SIP.

**Request**:
```json
{
  "basket_id": 1,
  "amount": 10000,
  "frequency": "monthly",
  "day_of_month": 1,
  "start_date": "2025-12-01"
}
```

#### PUT /api/sip/:id
Update SIP.

#### POST /api/sip/:id/pause
Pause SIP.

#### POST /api/sip/:id/resume
Resume SIP.

#### DELETE /api/sip/:id
Cancel SIP.

### Alerts

#### GET /api/alerts
List user's alerts.

#### POST /api/alerts
Create new alert.

**Request**:
```json
{
  "alert_type": "price",
  "target_type": "stock",
  "trading_symbol": "TCS",
  "exchange": "NSE",
  "condition": "above",
  "threshold_value": 4500,
  "notification_channels": ["app"]
}
```

#### PUT /api/alerts/:id
Update alert.

#### DELETE /api/alerts/:id
Delete alert.

### Legacy Auth (Broker OAuth)

#### GET /api/auth/login
Redirect to broker login.

**Query Parameters**:
- `broker` - Broker type (zerodha)

#### GET /api/auth/callback
OAuth callback handler.

**Query Parameters**:
- `request_token` - Token from broker
- `status` - success/failure

#### GET /api/auth/status
Check broker authentication status.

#### POST /api/auth/logout
Clear broker session.

### Admin Endpoints

#### POST /api/admin/cleanup-tokens
Disconnect all broker accounts (admin only).

### Health Check

#### GET /api/health
Service health check.

**Response**:
```json
{
  "status": "ok",
  "service": "OpenCase",
  "timestamp": "2025-12-06T12:00:00Z"
}
```

## Rate Limiting

Rate limiting is handled at the Cloudflare level:
- General API: 100 requests/minute
- Search endpoints: 30 requests/minute
- Auth endpoints: 10 requests/minute

## Versioning

Currently all endpoints are v1 (no version prefix). Future versions may use `/api/v2/` prefix.

## CORS Configuration

```javascript
cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-Session-ID', 'X-Active-Broker-ID', 'Authorization']
})
```

## Error Handling

All endpoints return consistent error responses:

```javascript
// 400 Bad Request
return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: '...' } }, 400);

// 401 Unauthorized
return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: '...' } }, 401);

// 404 Not Found
return c.json({ success: false, error: { code: 'NOT_FOUND', message: '...' } }, 404);

// 500 Internal Error
return c.json({ success: false, error: { code: 'INTERNAL_ERROR', message: '...' } }, 500);
```
