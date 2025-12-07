# OpenCase Design Documentation

This folder contains comprehensive design documentation for the OpenCase stock basket platform.

## Documentation Index

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture, tech stack, data flows |
| [UI-UX-SPEC.md](./UI-UX-SPEC.md) | Design system, colors, typography, layouts |
| [COMPONENTS.md](./COMPONENTS.md) | Frontend component specifications |
| [DATABASE.md](./DATABASE.md) | Database schema and entity relationships |
| [API.md](./API.md) | REST API endpoints and contracts |

## Quick Reference

### Tech Stack
- **Backend**: Hono + TypeScript on Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Frontend**: Vanilla JS + TailwindCSS
- **Charts**: Chart.js

### Primary Colors
- Primary: `#4F46E5` (Indigo 600)
- Success: `#10B981` (Green 500)
- Error: `#EF4444` (Red 500)
- Background: `#F9FAFB` (Gray 50)

### Key Entities
- **Users**: App authentication (email/password)
- **Broker Accounts**: Trading account connections (Zerodha, Angel One)
- **Baskets**: Custom stock portfolios with weighted allocations
- **Investments**: User purchases of baskets
- **SIPs**: Systematic investment plans

### API Authentication
All protected endpoints require:
```
X-Session-ID: <session_token>
```

## Architecture Overview

```
Browser (SPA)
    |
    v
Cloudflare Pages
    |
    +-- Hono API Routes
    |       |
    |       +-- D1 Database
    |       +-- KV Sessions
    |
    +-- Broker APIs
            |
            +-- Zerodha Kite
            +-- Angel One Smart API
```

## Design Principles

1. **Simplicity**: Clean, uncluttered interfaces
2. **Consistency**: Unified design language across all pages
3. **Performance**: Edge computing for low latency
4. **Security**: Encrypted credentials, session-based auth
5. **Extensibility**: Modular broker integration architecture

## Contributing

When making changes:

1. Update relevant design documents
2. Follow established patterns and conventions
3. Maintain consistency with existing color palette
4. Test on both desktop and mobile viewports
5. Ensure accessibility compliance
