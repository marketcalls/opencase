# StockBasket - Build Your Own Smallcase

A self-hostable SaaS platform for creating, managing, and investing in custom stock baskets using the Zerodha Kite API.

## Live Demo

**Sandbox URL:** https://3000-ies66ly1r6mw2sjvwpwv0-cbeee0f9.sandbox.novita.ai

## Project Overview

- **Name**: StockBasket
- **Goal**: Enable users to create and manage personalized stock portfolios (Smallcases) with Zerodha Kite integration
- **Tech Stack**: Hono + TypeScript + Cloudflare Pages/Workers + D1 Database + KV Storage

## Features

### Completed Features ✅

1. **Authentication & Multi-Account Support**
   - Zerodha Kite OAuth login
   - Multi-account management (family accounts)
   - Session management with KV storage
   - Secure API credential encryption

2. **Basket Management**
   - Create custom stock baskets (up to 20 stocks)
   - Set custom weightages (must sum to 100%)
   - Theme-based categorization
   - Risk level classification (low/moderate/high)
   - Benchmark selection for comparison

3. **Pre-built Templates**
   - IT Leaders (TCS, Infosys, HCL, etc.)
   - Banking Giants (HDFC Bank, ICICI Bank, SBI, etc.)
   - Pharma Champions (Sun Pharma, Dr. Reddys, Cipla, etc.)
   - FMCG Essentials (HUL, ITC, Nestle, etc.)
   - Auto Revolution (Tata Motors, Maruti, M&M, etc.)
   - Nifty 50 Core (Top 10 by weight)
   - Dividend Kings (High yield stocks)
   - Small Cap Stars (Growth-focused)

4. **Investment Features**
   - One-click basket purchase via Kite
   - Investment tracking with P&L
   - Portfolio rebalancing with deviation threshold
   - Sell holdings (partial or full)

5. **Basket Sharing**
   - Make baskets public/private
   - Clone public baskets and templates
   - Track clone count

6. **SIP (Systematic Investment Plan)**
   - Daily/Weekly/Monthly frequency options
   - Configurable investment dates
   - Pause/Resume/Cancel SIPs
   - Track total SIP investments

7. **Alerts System**
   - Price alerts (above/below threshold)
   - Rebalance alerts (deviation threshold)
   - P&L alerts
   - SIP reminder alerts

## API Endpoints

### Authentication
- `GET /api/auth/login` - Redirect to Zerodha login
- `GET /api/auth/callback` - OAuth callback handler
- `GET /api/auth/status` - Check authentication status
- `POST /api/auth/logout` - Clear session
- `GET /api/auth/accounts` - List all linked accounts
- `POST /api/auth/switch-account` - Switch active account

### Setup
- `POST /api/setup/configure` - Save Kite API credentials
- `GET /api/setup/status` - Check configuration status

### Baskets
- `GET /api/baskets` - List user's baskets
- `GET /api/baskets/templates` - Get pre-built templates
- `GET /api/baskets/public` - Browse public baskets
- `GET /api/baskets/:id` - Get basket details with stocks
- `POST /api/baskets` - Create new basket
- `PUT /api/baskets/:id` - Update basket
- `DELETE /api/baskets/:id` - Delete basket (soft delete)
- `POST /api/baskets/:id/clone` - Clone a basket

### Investments
- `GET /api/investments` - List user's investments
- `GET /api/investments/:id` - Get investment details with holdings
- `POST /api/investments/buy/:basketId` - Generate buy orders
- `POST /api/investments/:id/confirm-buy` - Confirm purchase
- `POST /api/investments/:id/sell` - Generate sell orders
- `GET /api/investments/:id/rebalance-preview` - Preview rebalance
- `POST /api/investments/:id/rebalance` - Execute rebalance

### SIP
- `GET /api/sip` - List user's SIPs
- `GET /api/sip/:id` - Get SIP details
- `POST /api/sip` - Create new SIP
- `PUT /api/sip/:id` - Update SIP (pause/resume)
- `DELETE /api/sip/:id` - Cancel SIP

### Alerts
- `GET /api/alerts` - List user's alerts
- `POST /api/alerts` - Create new alert
- `PUT /api/alerts/:id` - Update alert
- `DELETE /api/alerts/:id` - Delete alert

### Portfolio
- `GET /api/portfolio/summary` - Get portfolio summary
- `GET /api/portfolio/holdings` - Get aggregated holdings
- `GET /api/portfolio/sync` - Sync with Kite holdings

### Instruments
- `GET /api/instruments/search?q=:query` - Search stocks
- `GET /api/instruments/:exchange/:symbol` - Get instrument details
- `POST /api/instruments/refresh` - Refresh instrument cache

## Data Models

### Core Tables
- `accounts` - Zerodha user accounts with credentials
- `account_groups` - Family/team grouping
- `baskets` - Stock basket definitions
- `basket_stocks` - Stocks in each basket with weights
- `investments` - User investments in baskets
- `investment_holdings` - Individual stock holdings per investment

### Feature Tables
- `transactions` - Buy/sell/rebalance transaction logs
- `sips` - SIP configurations
- `sip_executions` - SIP execution history
- `alerts` - Alert configurations
- `alert_notifications` - Sent notifications

### Historical Data
- `investment_history` - Daily investment value snapshots
- `basket_nav_history` - Basket NAV history for charts
- `benchmark_data` - Index data for comparison

## User Guide

### Getting Started

1. **Setup API Credentials**
   - Go to [Kite Connect Developer Portal](https://developers.kite.trade)
   - Create an app and get API Key and Secret
   - On StockBasket homepage, click "Setup Now" to configure

2. **Login with Zerodha**
   - Click "Login with Zerodha"
   - Authorize the app on Kite
   - You'll be redirected to the dashboard

3. **Create Your First Basket**
   - Click "Create Basket" on the dashboard
   - Enter basket name and description
   - Add stocks with their weights (must sum to 100%)
   - Choose theme and risk level
   - Save the basket

4. **Invest in a Basket**
   - Open a basket (yours or a template)
   - Enter investment amount
   - Click "Buy Basket"
   - Complete the orders on Kite

5. **Set Up SIP**
   - Open a basket
   - Click "Start SIP"
   - Choose frequency and amount
   - Set start date

6. **Rebalance Investments**
   - Go to Investments
   - Click "Rebalance" on an investment
   - Review changes and execute on Kite

### Multi-Account Setup (Family)
- Add additional Zerodha accounts via the account dropdown
- Switch between accounts to manage portfolios separately
- Each account maintains its own baskets and investments

## Local Development

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

# Or with PM2
pm2 start ecosystem.config.cjs
```

## Deployment to Cloudflare Pages

```bash
# Setup Cloudflare API key
setup_cloudflare_api_key  # Run this in the sandbox

# Create D1 database (production)
npx wrangler d1 create stockbasket-db

# Apply migrations to production
npm run db:migrate:prod

# Deploy
npm run deploy:prod

# Set secrets
npx wrangler pages secret put KITE_API_SECRET --project-name stockbasket
npx wrangler pages secret put ENCRYPTION_KEY --project-name stockbasket
```

## Configuration

### Environment Variables
- `KITE_API_KEY` - Your Kite Connect API key
- `KITE_API_SECRET` - Your Kite Connect API secret  
- `KITE_REDIRECT_URL` - OAuth callback URL
- `ENCRYPTION_KEY` - Key for encrypting sensitive data

### wrangler.jsonc
```jsonc
{
  "name": "stockbasket",
  "compatibility_date": "2025-12-06",
  "pages_build_output_dir": "./dist",
  "d1_databases": [{
    "binding": "DB",
    "database_name": "stockbasket-db",
    "database_id": "your-database-id"
  }],
  "kv_namespaces": [{
    "binding": "KV",
    "id": "your-kv-id"
  }]
}
```

## Pending Features

- [ ] Historical performance charts with Chart.js
- [ ] Full benchmark comparison visualization
- [ ] Email/SMS notifications for alerts
- [ ] Auto-execute SIP orders (requires manual confirmation currently)
- [ ] Dark mode UI
- [ ] Mobile responsive improvements
- [ ] PDF portfolio reports
- [ ] Tax-loss harvesting suggestions

## Tech Stack

- **Backend**: Hono (TypeScript)
- **Database**: Cloudflare D1 (SQLite)
- **Cache**: Cloudflare KV
- **Frontend**: Vanilla JS + TailwindCSS (CDN)
- **Charts**: Chart.js
- **Build**: Vite
- **Deployment**: Cloudflare Pages

## License

MIT License - See LICENSE file for details.

## Disclaimer

This platform is not affiliated with Zerodha or Smallcase. Use at your own risk. Always verify orders on Kite before executing. Past performance is not indicative of future results.

---

**Last Updated**: December 6, 2025
**Status**: ✅ Active Development
