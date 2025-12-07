# OpenCase Component Design Guide

## Component Overview

OpenCase uses a vanilla JavaScript SPA architecture with template literals for rendering. All components are functions that return HTML strings.

## Component Architecture

```
app.js
  |-- State Management (global state object)
  |-- API Module (fetch wrapper)
  |-- Utility Functions
  |-- Render Functions (components)
  |-- Event Handlers
  |-- View Controllers
```

## State Management

### Global State Object
```javascript
const state = {
  // User & Auth
  sessionId: null,
  user: null,

  // Broker
  brokerAccounts: [],
  activeBrokerAccount: null,

  // Data
  baskets: [],
  investments: [],
  alerts: [],
  sips: [],
  holdings: [],

  // UI State
  currentView: 'dashboard',
  selectedBasket: null,
  selectedInvestment: null,
  loading: true,

  // Form State
  basketStocks: [],
  searchResults: [],
  investmentAmount: 50000,
  weightingScheme: 'custom',
  editingBasketId: null
};
```

## Core Components

### 1. Navigation Component

**File**: `app.js` - `renderNav()`

**Purpose**: Top navigation bar with branding, broker status, and user menu

**Structure**:
```html
<nav>
  <div class="logo-section">
    <img src="/static/logo.svg" />
    <span>OpenCase</span>
  </div>
  <div class="actions">
    <broker-indicator />
    <settings-button />
    <user-dropdown />
  </div>
</nav>
```

**States**:
- Broker connected (green indicator)
- Broker not connected (yellow warning)
- Instruments need download (download button)

### 2. Sidebar Component

**File**: `app.js` - `renderSidebar()`

**Purpose**: Main navigation for views

**Navigation Items**:
| ID | Icon | Label |
|----|------|-------|
| dashboard | `fa-chart-pie` | Dashboard |
| baskets | `fa-boxes` | My Baskets |
| investments | `fa-wallet` | Investments |
| holdings | `fa-hand-holding-usd` | Holdings |
| explore | `fa-compass` | Explore |
| sip | `fa-calendar-check` | SIP |
| alerts | `fa-bell` | Alerts |
| orders | `fa-receipt` | Orders |

**Active State**: Indigo background with indigo text

### 3. Dashboard Component

**File**: `app.js` - `renderDashboard()`

**Purpose**: Overview of portfolio performance

**Sub-components**:
- Summary Cards (4-column grid)
  - Total Invested
  - Current Value
  - Total P&L
  - Active SIPs
- My Baskets List
- Active Investments List

### 4. Basket Card Component

**Usage**: Dashboard, Baskets view, Explore view

**Structure**:
```html
<div class="basket-card">
  <header>
    <h3>{basket.name}</h3>
    <span class="theme-badge">{basket.theme}</span>
  </header>
  <p class="stock-count">{basket.stock_count} stocks</p>
</div>
```

**Variants**:
- Compact (dashboard list)
- Expanded (explore view with description)
- Template (with clone action)

### 5. Investment Card Component

**Usage**: Dashboard, Investments view

**Structure**:
```html
<div class="investment-card">
  <header>
    <h3>{investment.basket_name}</h3>
  </header>
  <p>Invested: {invested_amount}</p>
  <div class="pnl">
    <span class="value">{pnl}</span>
    <span class="percent">{pnl_percentage}%</span>
  </div>
</div>
```

**Color Coding**:
- Positive P&L: Green text
- Negative P&L: Red text

### 6. Summary Card Component

**Usage**: Dashboard, Portfolio view

**Structure**:
```html
<div class="summary-card">
  <div class="content">
    <p class="label">{label}</p>
    <p class="value">{value}</p>
    <p class="subtext">{subtext}</p>
  </div>
  <div class="icon-wrapper">
    <i class="{icon}"></i>
  </div>
</div>
```

**Variants by Type**:
| Type | Icon | Icon BG | Icon Color |
|------|------|---------|------------|
| Total Invested | `fa-wallet` | blue-100 | blue-600 |
| Current Value | `fa-chart-line` | green-100 | green-600 |
| P&L (positive) | `fa-arrow-up` | green-100 | green-600 |
| P&L (negative) | `fa-arrow-down` | red-100 | red-600 |
| Active SIPs | `fa-sync-alt` | purple-100 | purple-600 |

### 7. Basket Creation Form

**File**: `app.js` - `renderCreateBasket()`

**Sections**:
1. **Header Section** (3-column)
   - Basket name + theme select + stock search
   - Weighting scheme selector
   - Investment amount slider

2. **Stock List Section**
   - Table with drag-reorder capability
   - Inline weight editing
   - LTP display
   - Remove action

3. **Footer Section**
   - Weight validation message
   - Cancel/Save buttons

**Form Fields**:
| Field | Type | Validation |
|-------|------|------------|
| name | text | required |
| theme | select | optional |
| stocks | array | min 1, max 20 |
| weights | array | sum = 100% |
| investmentAmount | number | min varies by basket |

### 8. Holdings Table

**File**: `app.js` - `renderPortfolioHoldings()`

**Columns**:
| Column | Alignment | Format |
|--------|-----------|--------|
| Symbol | left | text + exchange tag |
| Qty | right | number |
| Avg Price | right | currency |
| LTP | right | currency |
| Value | right | currency |
| P&L | right | currency + % (colored) |

### 9. Modal Component

**Generic Modal Structure**:
```html
<div class="modal-overlay">
  <div class="modal-content">
    <header>
      <h3>{title}</h3>
      <button class="close-btn">X</button>
    </header>
    <body>
      {content}
    </body>
    <footer>
      {actions}
    </footer>
  </div>
</div>
```

**Modal Types**:
- Login Modal
- Signup Modal
- Settings Modal
- TOTP Input Modal
- Investment Confirmation Modal
- Alert Creation Modal

### 10. Notification Component

**File**: `app.js` - `showNotification()`

**Types**:
| Type | Background |
|------|------------|
| success | green-500 |
| error | red-500 |
| warning | yellow-500 |
| info | blue-500 |

**Behavior**:
- Appears top-right
- Auto-dismiss after 3 seconds
- Pulse animation

## Page Components

### Landing Page (`/`)

**Sections**:
1. Navigation bar
2. Hero section (gradient background)
3. First user banner (conditional)
4. Features grid (6 cards)
5. How it works (3 steps)
6. Template preview grid
7. Footer
8. Modals (login/signup)

### Dashboard Page (`/dashboard`)

**Layout**: Nav + Sidebar + Main Content

**Views** (based on `state.currentView`):
- `dashboard` - Overview
- `baskets` - Basket list
- `investments` - Investment list
- `holdings` - Holdings table
- `explore` - Browse templates
- `sip` - SIP management
- `alerts` - Alert list
- `orders` - Order history
- `basket-detail` - Single basket view
- `investment-detail` - Single investment view
- `create-basket` - Basket form

### Accounts Page (`/accounts`)

**Sections**:
1. Header with "Add Account" button
2. Account cards grid
3. Add account modal
4. TOTP input modal (for Angel One)

### Contracts Page (`/contracts`)

**Purpose**: Master instruments management

**Sections**:
1. Download status indicator
2. Last download timestamp
3. Download buttons by broker
4. Search interface
5. Results table

## Utility Components

### Theme Badge

**Usage**: Categorizing baskets

**Implementation**:
```javascript
function getThemeClass(theme) {
  const colors = {
    'Technology': 'bg-blue-100 text-blue-800',
    'Banking': 'bg-green-100 text-green-800',
    'Healthcare': 'bg-red-100 text-red-800',
    // ...
  };
  return colors[theme] || 'bg-gray-100 text-gray-800';
}
```

### Currency Formatter

**Format**: Indian Rupee with locale formatting

```javascript
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount || 0);
}
```

### Loading Skeleton

**Usage**: Data loading states

```html
<div class="animate-pulse bg-gray-100 rounded-xl p-6 h-48"></div>
```

### Empty State

**Structure**:
```html
<div class="empty-state">
  <i class="fas {icon}"></i>
  <h3>{title}</h3>
  <p>{description}</p>
  <button>{actionText}</button>
</div>
```

## Event Handling

### View Navigation
```javascript
function setView(viewId) {
  state.currentView = viewId;
  renderApp();
}
```

### API Interactions
```javascript
async function handleCreateBasket(event) {
  event.preventDefault();
  // Validation
  // API call
  // State update
  // Re-render
}
```

### Real-time Updates
```javascript
function attachEventListeners() {
  // Add all DOM event listeners after render
}
```

## Component Patterns

### Conditional Rendering
```javascript
${condition ? `
  <div>Content when true</div>
` : `
  <div>Content when false</div>
`}
```

### List Rendering
```javascript
${items.map(item => `
  <div class="item">${item.name}</div>
`).join('')}
```

### Dynamic Classes
```javascript
class="${isActive ? 'bg-indigo-50 text-indigo-600' : 'text-gray-600'}"
```

## Best Practices

1. **Keep components pure**: Components should only depend on their parameters and global state
2. **Minimize DOM manipulation**: Re-render entire sections rather than patching
3. **Use semantic HTML**: Proper heading hierarchy, ARIA labels
4. **Handle empty states**: Always provide meaningful empty states
5. **Loading feedback**: Show spinners during async operations
6. **Error handling**: Display user-friendly error messages
