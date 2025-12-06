# OpenCase - Build Your Own Stock Baskets

An open-source, self-hostable platform for creating, managing, and investing in custom stock baskets. Supports multiple brokers including Zerodha Kite and Angel One.

## Live Demo

**Sandbox URL:** https://3000-ies66ly1r6mw2sjvwpwv0-cbeee0f9.sandbox.novita.ai

**GitHub:** https://github.com/marketcalls/opencase

## Project Overview

- **Name**: OpenCase
- **Goal**: Enable users to create and manage personalized stock portfolios with multi-broker support
- **Tech Stack**: Hono + TypeScript + Cloudflare Pages/Workers + D1 Database + KV Storage

## Features

### Completed Features ✅

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

3. **Broker Account Management**
   - Add multiple broker accounts per user
   - Connect/disconnect accounts
   - TOTP-based authentication for Angel One
   - OAuth flow for Zerodha
   - Encrypted credential storage

3. **Basket Management**
   - Create custom stock baskets (up to 20 stocks)
   - Set custom weightages (must sum to 100%)
   - Equal weight allocation with auto-calculation
   - Theme-based categorization
   - Risk level classification (low/moderate/high)
   - Benchmark selection for comparison

4. **Pre-built Templates**
   - IT Leaders, Banking Giants, Pharma Champions
   - FMCG Essentials, Auto Revolution
   - Nifty 50 Core, Dividend Kings, Small Cap Stars

5. **Investment Features**
   - One-click basket purchase
   - Direct order placement via broker API
   - Investment tracking with P&L
   - Portfolio rebalancing
   - Holdings sync from broker

6. **SIP (Systematic Investment Plan)**
   - Daily/Weekly/Monthly frequency
   - Configurable investment dates
   - Pause/Resume/Cancel SIPs

7. **Alerts System**
   - Price alerts, Rebalance alerts
   - P&L alerts, SIP reminders

## API Endpoints

### Setup & Configuration
- `GET /api/setup/status` - Check configuration status (shows configured brokers)
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

### Legacy Authentication (for backward compatibility)
- `GET /api/auth/login` - Redirect to broker login
- `GET /api/auth/callback` - OAuth callback handler
- `GET /api/auth/status` - Check authentication status
- `POST /api/auth/logout` - Clear session

### Baskets
- `GET /api/baskets` - List user's baskets
- `GET /api/baskets/templates` - Get pre-built templates
- `POST /api/baskets` - Create new basket
- `PUT /api/baskets/:id` - Update basket
- `POST /api/baskets/calculate-weights` - Calculate equal weights

### Investments
- `GET /api/investments` - List investments
- `POST /api/investments/buy/:basketId` - Generate buy orders
- `POST /api/investments/:id/rebalance` - Execute rebalance

### Portfolio
- `GET /api/portfolio/summary` - Portfolio summary
- `GET /api/portfolio/holdings` - Get holdings from broker

### Instruments
- `GET /api/instruments/search?q=:query` - Search stocks with LTP
- `GET /api/instruments/download` - Download master contracts
- `GET /api/instruments/status` - Check download status

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
npm run dev:sandbox

# Or with PM2 (sandbox/Linux)
pm2 start ecosystem.config.cjs
```

### Windows Setup

1. **Prerequisites**: Node.js 18+, Git
2. **Clone**: `git clone https://github.com/marketcalls/opencase.git`
3. **Install**: `npm install`
4. **Setup DB**: `npm run db:migrate:local && npm run db:seed`
5. **Build**: `npm run build`
6. **Run**: `npm run dev:sandbox`
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
8. Start creating baskets!

**Adding Broker Accounts:**
1. Go to `/accounts` page
2. Click "Add Account"
3. Select broker type (Zerodha or Angel One)
4. Enter API credentials
5. For Zerodha: Click Connect → OAuth redirect
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

## Pending Features

- [ ] Historical performance charts
- [ ] Benchmark comparison visualization
- [ ] Email/SMS notifications
- [ ] Auto-execute SIP orders
- [ ] Dark mode UI
- [ ] Mobile responsive improvements

## License

MIT License - See LICENSE file for details.

## Disclaimer

This platform is not affiliated with Zerodha, Angel One, or Smallcase. Use at your own risk. Always verify orders before executing.

---

**Last Updated**: December 6, 2025
**Status**: ✅ Active Development
