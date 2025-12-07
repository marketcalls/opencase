# OpenCase Architecture

## System Overview

OpenCase is a self-hosted stock basket investment platform built on modern edge computing infrastructure. It enables users to create, manage, and invest in custom stock portfolios through multiple broker integrations.

```
+------------------+     +------------------+     +------------------+
|                  |     |                  |     |                  |
|   Web Browser    |<--->|  Cloudflare      |<--->|   Broker APIs    |
|   (Frontend)     |     |  Workers/Pages   |     |  (Zerodha/Angel) |
|                  |     |                  |     |                  |
+------------------+     +--------+---------+     +------------------+
                                 |
                    +------------+------------+
                    |            |            |
              +-----v----+ +-----v----+ +-----v----+
              |          | |          | |          |
              |    D1    | |    KV    | |  Workers |
              | Database | |  Cache   | | (Cron)   |
              |          | |          | |          |
              +----------+ +----------+ +----------+
```

## Tech Stack

### Backend
- **Runtime**: Cloudflare Workers (Edge Computing)
- **Framework**: Hono (TypeScript)
- **Database**: Cloudflare D1 (SQLite)
- **Cache/Sessions**: Cloudflare KV

### Frontend
- **Framework**: Vanilla JavaScript (SPA)
- **Styling**: TailwindCSS (CDN)
- **Charts**: Chart.js
- **Icons**: Font Awesome

### Build & Deploy
- **Bundler**: Vite
- **Platform**: Cloudflare Pages
- **Container**: Docker (optional)

## Application Layers

### 1. Presentation Layer (`public/static/`)
```
public/
  static/
    app.js      # Main SPA application
    style.css   # Custom styles
    logo.svg    # Brand assets
```

### 2. API Layer (`src/routes/`)
```
src/routes/
  auth.ts           # Legacy broker OAuth
  user.ts           # User authentication
  broker-accounts.ts # Multi-broker management
  baskets.ts        # Basket CRUD operations
  investments.ts    # Investment tracking
  instruments.ts    # Stock search & data
  portfolio.ts      # Holdings & P&L
  sip.ts            # SIP management
  alerts.ts         # Alert system
  setup.ts          # Initial configuration
```

### 3. Broker Integration Layer (`src/brokers/`)
```
src/brokers/
  base.ts       # Abstract broker interface
  types.ts      # Common types
  zerodha.ts    # Zerodha Kite Connect
  angelone.ts   # Angel One Smart API
  factory.ts    # Broker factory pattern
  index.ts      # Exports
```

### 4. Data Layer
- **D1 Database**: Persistent storage for users, baskets, investments
- **KV Storage**: Session management, temporary tokens, cache

## Data Flow

### Authentication Flow
```
User -> Login Form -> /api/user/login -> Validate Credentials
                                              |
                                    Create Session in KV
                                              |
                                    Return Session ID
                                              |
                                    Store in localStorage
```

### Broker Connection Flow (Zerodha)
```
User -> Connect Broker -> Redirect to Kite Login
                                    |
                          User Authenticates
                                    |
                          Callback with Token
                                    |
                          Store Encrypted Token
                                    |
                          Mark Account Connected
```

### Broker Connection Flow (Angel One)
```
User -> Connect Broker -> Enter TOTP
                              |
                    Call Smart API Login
                              |
                    Receive Access Token
                              |
                    Store Encrypted Token
                              |
                    Mark Account Connected
```

### Order Placement Flow
```
User -> Invest in Basket -> Calculate Quantities
                                    |
                          Create Order List
                                    |
                          Call Broker API
                                    |
                          Record Investment
                                    |
                          Update Holdings
```

## Security Architecture

### Authentication
- Email/Password with secure hashing
- Session tokens stored in KV with TTL
- First user becomes admin automatically

### Broker Credentials
- API keys stored in D1 (admin-controlled)
- Access tokens encrypted with ENCRYPTION_KEY
- Tokens cleared on disconnect

### API Security
- Session validation on protected routes
- CORS configuration for API endpoints
- Rate limiting through Cloudflare

## Module Responsibilities

| Module | Responsibility |
|--------|---------------|
| `index.tsx` | App entry, routing, middleware, HTML templates |
| `renderer.tsx` | JSX renderer for SSR pages |
| `config.ts` | Environment configuration |
| `types/index.ts` | TypeScript type definitions |
| `lib/kite.ts` | Zerodha Kite API wrapper |
| `lib/angelone.ts` | Angel One Smart API wrapper |
| `lib/utils.ts` | Utility functions |
| `scheduled.ts` | Cron job handlers |

## Scalability Considerations

### Edge Computing Benefits
- Low latency: Code runs close to users
- Auto-scaling: Cloudflare handles traffic
- Global distribution: No region lock

### Limitations
- D1 has write limits (consider batching)
- KV has eventual consistency
- Worker CPU time limits (50ms default)

## Environment Configuration

### Required Bindings
```jsonc
{
  "d1_databases": [{
    "binding": "DB",
    "database_name": "opencase-db"
  }],
  "kv_namespaces": [{
    "binding": "KV"
  }]
}
```

### Environment Variables
| Variable | Description |
|----------|-------------|
| `ENCRYPTION_KEY` | 32-character key for token encryption |

## Deployment Architecture

### Development
```
npm run dev:sandbox
  -> Wrangler local server
  -> Local D1 database
  -> Local KV simulation
```

### Production
```
npm run deploy:prod
  -> Build with Vite
  -> Deploy to Cloudflare Pages
  -> Connect to D1 & KV
```

### Docker
```
docker-compose up
  -> Build container
  -> Run Wrangler inside
  -> Persistent volume for data
```
