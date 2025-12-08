# OpenCase - Build Your Own Stock Baskets

An open-source, self-hostable platform for creating, managing, and investing in custom stock baskets. Supports multiple brokers including Zerodha Kite and Angel One with unified symbol format.

## Project Overview

- **Name**: OpenCase
- **Goal**: Enable users to create and manage personalized stock portfolios with multi-broker support
- **Tech Stack**: Hono + TypeScript + Cloudflare Pages/Workers + D1 Database + KV Storage

## Features

### Core Features

1. **User Authentication System**
   - Email/Password signup and login
   - First user automatically becomes admin
   - Session management with KV storage
   - Profile management

2. **Multi-Broker Support**
   - Zerodha Kite Connect API (OAuth)
   - Angel One Smart API (TOTP)
   - Modular architecture for adding new brokers
   - Unified symbol format across brokers
   - Common holdings format for both brokers

3. **Broker Account Management**
   - Add multiple broker accounts per user
   - Connect/disconnect accounts
   - TOTP-based authentication for Angel One
   - OAuth flow for Zerodha
   - Encrypted credential storage
   - Active broker selection

4. **Basket Management**
   - Create custom stock baskets (up to 100 stocks)
   - Set custom weightages (must sum to 100%)
   - Equal weight allocation with auto-calculation
   - Theme-based categorization
   - Risk level classification (low/moderate/high)
   - Benchmark selection for comparison

5. **Pre-built Templates**
   - IT Leaders, Banking Giants, Pharma Champions
   - FMCG Essentials, Auto Revolution
   - Nifty 50 Core, Dividend Kings, Small Cap Stars

6. **Investment Features**
   - One-click basket purchase
   - Direct order placement via broker API
   - Investment tracking with P&L
   - Portfolio rebalancing
   - Holdings sync from broker

7. **SIP (Systematic Investment Plan)**
   - Daily/Weekly/Monthly frequency
   - Configurable investment dates
   - Pause/Resume/Cancel SIPs

8. **Alerts System**
   - Price alerts, Rebalance alerts
   - P&L alerts, SIP reminders

### Master Instruments & Indices

9. **Unified Instrument Database**
   - Download instruments from Zerodha and AngelOne
   - Merged master instruments with unified symbols
   - Broker-specific tokens preserved for API calls
   - Real-time LTP fetching from connected broker

10. **Index Support for Benchmarking**
    - NSE indices (NSE_INDEX exchange)
    - BSE indices (BSE_INDEX exchange)
    - Normalized index symbols (NIFTY, BANKNIFTY, FINNIFTY, etc.)
    - 190+ NSE indices, 110+ BSE indices
    - Common format across Zerodha and AngelOne

### Holdings & Portfolio

11. **Broker Holdings Integration**
    - Fetch holdings from connected broker (Zerodha/AngelOne)
    - Common holdings format: symbol, exchange, quantity, product, pnl
    - Unified symbol lookup from master instruments
    - OpenCase holdings vs Broker holdings comparison

## API Endpoints

### Setup & Configuration
- `GET /api/setup/status` - Check configuration status
- `GET /api/setup/brokers` - List supported brokers
- `POST /api/setup/configure` - Save broker API credentials
- `PUT /api/setup/default-broker` - Set default broker

### User Authentication
- `GET /api/user/status` - Check user auth status
- `POST /api/user/signup` - Create new account (first user = admin)
- `POST /api/user/login` - Login with email/password
- `POST /api/user/logout` - Clear session
- `GET /api/user/profile` - Get user profile
- `PUT /api/user/profile` - Update profile

### Broker Accounts
- `GET /api/broker-accounts` - List user's broker accounts
- `POST /api/broker-accounts` - Add new broker account
- `DELETE /api/broker-accounts/:id` - Remove broker account
- `POST /api/broker-accounts/:id/connect` - Connect to broker (OAuth/TOTP)
- `POST /api/broker-accounts/:id/disconnect` - Disconnect from broker
- `GET /api/broker-accounts/active` - Get active connected account

### Baskets
- `GET /api/baskets` - List user's baskets
- `GET /api/baskets/templates` - Get pre-built templates
- `POST /api/baskets` - Create new basket (up to 100 stocks)
- `PUT /api/baskets/:id` - Update basket
- `DELETE /api/baskets/:id` - Delete basket
- `POST /api/baskets/calculate-weights` - Calculate equal weights

### Investments
- `GET /api/investments` - List investments
- `POST /api/investments/buy/:basketId` - Generate buy orders
- `GET /api/investments/:id` - Get investment details
- `POST /api/investments/:id/rebalance` - Execute rebalance

### Portfolio
- `GET /api/portfolio/summary` - Portfolio summary with P&L
- `GET /api/portfolio/holdings` - Get OpenCase holdings
- `GET /api/portfolio/broker-holdings` - Get holdings from connected broker

### Instruments
- `GET /api/instruments/search?q=:query` - Search stocks with LTP
- `GET /api/instruments/indices` - List all indices for benchmarking
- `GET /api/instruments/indices?exchange=NSE_INDEX` - NSE indices only
- `GET /api/instruments/indices?q=NIFTY` - Search indices
- `GET /api/instruments/popular` - Popular stocks with LTP
- `GET /api/instruments/ltp?symbols=NSE:TCS,NSE:INFY` - Get LTP for symbols
- `POST /api/instruments/download` - Download Zerodha instruments
- `POST /api/instruments/download-angelone` - Download AngelOne instruments
- `GET /api/instruments/status` - Check download status with counts

### SIP
- `GET /api/sip` - List user's SIPs
- `POST /api/sip` - Create new SIP
- `PUT /api/sip/:id` - Update SIP
- `POST /api/sip/:id/pause` - Pause SIP
- `POST /api/sip/:id/resume` - Resume SIP
- `DELETE /api/sip/:id` - Cancel SIP

### Legacy Authentication
- `GET /api/auth/login` - Redirect to broker login
- `GET /api/auth/callback` - OAuth callback handler
- `GET /api/auth/status` - Check authentication status
- `POST /api/auth/logout` - Clear session

## Documentation

- **[Design Documentation](./design/)** - Architecture, UI/UX, Components, Database, API specs
- **[Common Indices Reference](./docs/COMMON-INDICES.md)** - Index symbol mapping for Zerodha & AngelOne

## Local Development

### Quick Start

```bash
# Install dependencies
npm install

# Apply database migrations
npm run db:migrate:local

# Seed with template data
npm run db:seed

# Build the project
npm run build

# Start development server
npm run dev
```

### Windows Setup

1. **Prerequisites**: Node.js 18+, Git
2. **Clone**: `git clone https://github.com/marketcalls/opencase.git`
3. **Install**: `npm install`
4. **Setup DB**: `npm run db:migrate:local && npm run db:seed`
5. **Build**: `npm run build`
6. **Run**: `npm run dev`
7. **Open**: http://localhost:3000

### User Flow

**New User Setup:**
1. Open http://localhost:3000
2. Click "Sign Up" (first user becomes admin)
3. Enter name, email, and password
4. After signup, you'll be redirected to onboarding
5. Add your first broker account (Zerodha or Angel One)
6. Enter API credentials
7. Click "Connect" to authenticate with your broker
8. Download master instruments from `/contracts` page
9. Start creating baskets!

**Adding Broker Accounts:**
1. Go to `/accounts` page
2. Click "Add Account"
3. Select broker type (Zerodha or Angel One)
4. Enter API credentials
5. For Zerodha: Click Connect -> OAuth redirect
6. For Angel One: Enter TOTP code when prompted

**Get API credentials from:**
- Zerodha: https://developers.kite.trade
- Angel One: https://smartapi.angelbroking.com

## NPM Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Vite dev server with hot reload |
| `npm run dev:sandbox` | Wrangler Pages dev (local D1) |
| `npm run build` | Build for production |
| `npm run db:migrate:local` | Apply migrations |
| `npm run db:seed` | Seed templates |
| `npm run db:reset` | Reset local database |
| `npm run deploy` | Deploy to Cloudflare Pages |

## Docker Deployment

### Quick Start with Docker

```bash
# Build and run with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Docker Commands

```bash
# Build the image
docker build -t opencase .

# Run container
docker run -d -p 3000:3000 --name opencase opencase

# Run with persistent data
docker run -d -p 3000:3000 \
  -v opencase-data:/app/.wrangler/state/v3/d1 \
  -e ENCRYPTION_KEY=your-secure-key-32chars!! \
  --name opencase opencase
```

### Development with Docker

```bash
# Run with hot-reload (mounts source code)
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# Rebuild after changes
docker-compose up --build
```

### Docker Files

| File | Description |
|------|-------------|
| `Dockerfile` | Multi-stage production build |
| `Dockerfile.dev` | Development build with all dependencies |
| `docker-compose.yml` | Production compose configuration |
| `docker-compose.dev.yml` | Development override with volume mounts |
| `.dockerignore` | Files excluded from build context |

## Deployment to Cloudflare

```bash
# Create D1 database
npx wrangler d1 create opencase-db

# Apply migrations
npm run db:migrate:prod

# Deploy
npm run deploy:prod

# Set secrets
npx wrangler pages secret put ENCRYPTION_KEY --project-name opencase
```

## Configuration

### wrangler.jsonc
```jsonc
{
  "name": "opencase",
  "compatibility_date": "2025-12-06",
  "pages_build_output_dir": "./dist",
  "d1_databases": [{
    "binding": "DB",
    "database_name": "opencase-db",
    "database_id": "your-database-id"
  }],
  "kv_namespaces": [{
    "binding": "KV",
    "id": "your-kv-id"
  }]
}
```

## Tech Stack

- **Backend**: Hono (TypeScript)
- **Database**: Cloudflare D1 (SQLite)
- **Cache**: Cloudflare KV
- **Frontend**: Vanilla JS + TailwindCSS (CDN)
- **Charts**: Chart.js
- **Build**: Vite
- **Deployment**: Cloudflare Pages

## Project Structure

```
opencase/
├── src/
│   ├── index.tsx          # Main app with HTML routes
│   ├── routes/            # API route handlers
│   │   ├── auth.ts        # Legacy auth routes
│   │   ├── baskets.ts     # Basket CRUD
│   │   ├── broker.ts      # Broker account management
│   │   ├── instruments.ts # Stock search, indices, downloads
│   │   ├── investments.ts # Investment operations
│   │   ├── portfolio.ts   # Holdings & portfolio
│   │   ├── setup.ts       # Platform setup
│   │   ├── sip.ts         # SIP management
│   │   └── user.ts        # User authentication
│   ├── lib/               # Utility libraries
│   │   ├── kite.ts        # Zerodha API client
│   │   ├── angelone.ts    # AngelOne API client
│   │   └── utils.ts       # Common utilities
│   └── types/             # TypeScript definitions
├── public/
│   └── static/
│       └── app.js         # Frontend JavaScript
├── migrations/            # D1 database migrations
├── design/                # Design documentation
│   ├── ARCHITECTURE.md
│   ├── UI-UX-SPEC.md
│   ├── COMPONENTS.md
│   ├── DATABASE.md
│   └── API.md
├── docs/                  # Additional documentation
│   └── COMMON-INDICES.md  # Index symbol reference
└── wrangler.jsonc         # Cloudflare configuration
```

## Pending Features

- [ ] Historical performance charts
- [ ] Benchmark comparison visualization
- [ ] Email/SMS notifications
- [ ] Auto-execute SIP orders
- [ ] Dark mode UI
- [ ] Mobile responsive improvements
- [ ] Export portfolio reports (PDF/Excel)
- [ ] Dividend tracking
- [ ] Corporate actions handling

## License

AGPL3 License - See LICENSE file for details.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines.

## Disclaimer

This platform is not affiliated with Zerodha, Angel One, or Smallcase. Use at your own risk. Always verify orders before executing. This is not investment advice.

---

**Last Updated**: December 8, 2025
**Status**: Active Development
**Version**: 1.0.0
