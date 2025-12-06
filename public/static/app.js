/**
 * OpenCase Frontend Application
 * Comprehensive dashboard for managing stock baskets with direct API order placement
 */

// State management
const state = {
  sessionId: null,
  user: null,           // Current logged-in user
  brokerAccounts: [],   // User's broker accounts
  activeBrokerAccount: null, // Currently selected broker for trading
  account: null,        // Legacy - for backward compatibility
  accounts: [],
  baskets: [],
  investments: [],
  alerts: [],
  sips: [],
  holdings: [],
  zerodhaHoldings: [],
  currentView: 'dashboard',
  selectedBasket: null,
  selectedInvestment: null,
  basketStocks: [],
  searchResults: [],
  loading: true,
  instrumentsStatus: null,
  investmentAmount: 50000,  // Default investment amount for basket creation
  weightingScheme: 'custom' // 'equal' or 'custom'
};

// API Helper
const api = {
  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(state.sessionId && { 'X-Session-ID': state.sessionId })
    };

    try {
      const response = await fetch(`/api${endpoint}`, {
        ...options,
        headers: { ...headers, ...options.headers }
      });
      const data = await response.json();
      
      if (!data.success && data.error?.code === 'SESSION_EXPIRED') {
        handleLogout();
        return null;
      }
      
      return data;
    } catch (error) {
      console.error('API Error:', error);
      showNotification('Network error. Please try again.', 'error');
      return null;
    }
  },

  get: (endpoint) => api.request(endpoint),
  post: (endpoint, body) => api.request(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  put: (endpoint, body) => api.request(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (endpoint) => api.request(endpoint, { method: 'DELETE' })
};

// Initialize app
async function initApp() {
  // Use the new user_session_id for user authentication
  state.sessionId = localStorage.getItem('user_session_id');
  
  // Also check for legacy session_id from URL (for backward compatibility with broker OAuth redirects)
  const urlParams = new URLSearchParams(window.location.search);
  const legacySession = urlParams.get('session_id');
  if (legacySession) {
    localStorage.setItem('session_id', legacySession);
    window.history.replaceState({}, document.title, '/dashboard');
  }
  
  if (!state.sessionId) {
    window.location.href = '/?error=please_login';
    return;
  }

  // Check user auth status
  const userRes = await api.get('/user/status');
  
  if (userRes?.success && userRes.data.is_authenticated) {
    state.user = userRes.data.user;
    state.account = userRes.data.user; // For backward compatibility
    
    // Load broker accounts
    const brokerRes = await api.get('/broker-accounts');
    if (brokerRes?.success) {
      state.brokerAccounts = brokerRes.data;
      // Find first connected account as active
      state.activeBrokerAccount = state.brokerAccounts.find(acc => acc.is_connected);
    }
    
    // Check instruments status
    const instrStatus = await api.get('/instruments/status');
    if (instrStatus?.success) {
      state.instrumentsStatus = instrStatus.data;
    }
    
    await loadDashboardData();
    renderApp();
  } else {
    window.location.href = '/?error=please_login';
  }
}

// Load all dashboard data
async function loadDashboardData() {
  state.loading = true;
  renderLoading();

  try {
    const [basketsRes, investmentsRes, alertsRes, sipRes, accountsRes, holdingsRes] = await Promise.all([
      api.get('/baskets'),
      api.get('/investments'),
      api.get('/alerts'),
      api.get('/sip'),
      api.get('/auth/accounts'),
      api.get('/portfolio/holdings')
    ]);

    state.baskets = basketsRes?.success ? basketsRes.data : [];
    state.investments = investmentsRes?.success ? investmentsRes.data : [];
    state.alerts = alertsRes?.success ? alertsRes.data : [];
    state.sips = sipRes?.success ? sipRes.data : [];
    state.accounts = accountsRes?.success ? accountsRes.data : [];
    state.holdings = holdingsRes?.success ? holdingsRes.data : [];
  } catch (error) {
    console.error('Failed to load data:', error);
  }

  state.loading = false;
}

// Utility functions
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount || 0);
}

function formatNumber(num, decimals = 2) {
  return parseFloat(num || 0).toFixed(decimals);
}

function getThemeClass(theme) {
  const colors = {
    'Technology': 'bg-blue-100 text-blue-800',
    'Banking': 'bg-green-100 text-green-800',
    'Healthcare': 'bg-red-100 text-red-800',
    'Consumer': 'bg-purple-100 text-purple-800',
    'Automobile': 'bg-orange-100 text-orange-800',
    'Index': 'bg-indigo-100 text-indigo-800',
    'Dividend': 'bg-yellow-100 text-yellow-800',
    'Growth': 'bg-pink-100 text-pink-800'
  };
  return colors[theme] || 'bg-gray-100 text-gray-800';
}

function showNotification(message, type = 'info') {
  const colors = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    warning: 'bg-yellow-500',
    info: 'bg-blue-500'
  };
  
  const notification = document.createElement('div');
  notification.className = `fixed top-4 right-4 ${colors[type]} text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-pulse`;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => notification.remove(), 3000);
}

// Render functions
function renderApp() {
  const app = document.getElementById('app');
  app.innerHTML = `
    ${renderNav()}
    <div class="flex">
      ${renderSidebar()}
      <main class="flex-1 p-6 bg-gray-100 min-h-screen">
        ${renderMainContent()}
      </main>
    </div>
    ${renderModals()}
  `;
  
  document.getElementById('loading')?.remove();
  attachEventListeners();
}

function renderLoading() {
  const loading = document.getElementById('loading');
  if (loading) {
    loading.innerHTML = `
      <div class="text-center">
        <i class="fas fa-spinner fa-spin text-4xl text-indigo-600 mb-4"></i>
        <p class="text-gray-600">Loading your portfolio...</p>
      </div>
    `;
  }
}

function renderNav() {
  const activeBroker = state.activeBrokerAccount;
  
  return `
    <nav class="bg-white shadow-sm sticky top-0 z-40">
      <div class="max-w-full mx-auto px-4">
        <div class="flex justify-between h-16 items-center">
          <div class="flex items-center space-x-4">
            <a href="/" class="flex items-center space-x-2">
              <img src="/static/logo.svg" alt="OpenCase" class="w-10 h-10">
              <span class="text-xl font-bold text-gray-900">OpenCase</span>
            </a>
          </div>
          
          <div class="flex items-center space-x-4">
            ${state.instrumentsStatus?.needs_download ? `
              <button onclick="downloadInstruments()" class="text-sm bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full hover:bg-yellow-200">
                <i class="fas fa-download mr-1"></i> Download Instruments
              </button>
            ` : ''}
            
            <!-- Active Broker Account Indicator -->
            ${activeBroker ? `
              <div class="flex items-center space-x-2 px-3 py-1 bg-green-50 rounded-full border border-green-200">
                <i class="fas fa-circle text-green-500 text-xs"></i>
                <span class="text-sm text-green-700">${activeBroker.account_name}</span>
              </div>
            ` : `
              <a href="/accounts" class="flex items-center space-x-2 px-3 py-1 bg-yellow-50 rounded-full border border-yellow-200 hover:bg-yellow-100">
                <i class="fas fa-exclamation-circle text-yellow-500 text-xs"></i>
                <span class="text-sm text-yellow-700">Connect Broker</span>
              </a>
            `}
            
            <a href="/accounts" class="text-gray-500 hover:text-gray-700" title="Manage Accounts">
              <i class="fas fa-plug"></i>
            </a>
            
            <button onclick="showSettingsModal()" class="text-gray-500 hover:text-gray-700">
              <i class="fas fa-cog"></i>
            </button>
            
            <div class="relative group">
              <button class="flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-gray-100">
                <i class="fas fa-user-circle text-gray-500"></i>
                <span class="text-sm font-medium text-gray-700">${state.user?.name || 'User'}</span>
                <i class="fas fa-chevron-down text-xs text-gray-400"></i>
              </button>
              <div class="hidden group-hover:block absolute right-0 mt-1 w-64 bg-white rounded-lg shadow-lg border py-1 z-50">
                <!-- User Info -->
                <div class="px-4 py-3 border-b">
                  <p class="text-sm font-medium text-gray-900">${state.user?.name || 'User'}</p>
                  <p class="text-xs text-gray-500">${state.user?.email || ''}</p>
                  ${state.user?.is_admin ? '<span class="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">Admin</span>' : ''}
                </div>
                
                <!-- Broker Accounts -->
                ${state.brokerAccounts.length > 0 ? `
                  <div class="py-2">
                    <p class="px-4 text-xs text-gray-400 uppercase mb-1">Broker Accounts</p>
                    ${state.brokerAccounts.map(acc => `
                      <button onclick="switchBrokerAccount(${acc.id})" class="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-3 ${acc.id === activeBroker?.id ? 'bg-indigo-50' : ''}">
                        <i class="fas ${acc.broker_type === 'zerodha' ? 'fa-chart-line text-indigo-600' : 'fa-chart-bar text-orange-600'}"></i>
                        <div class="flex-1">
                          <p class="text-sm font-medium">${acc.account_name}</p>
                          <p class="text-xs text-gray-500">${acc.is_connected ? 'Connected' : 'Disconnected'}</p>
                        </div>
                        ${acc.id === activeBroker?.id ? '<i class="fas fa-check text-indigo-600"></i>' : ''}
                      </button>
                    `).join('')}
                  </div>
                ` : ''}
                
                <div class="border-t my-1"></div>
                <a href="/accounts" class="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-3 text-indigo-600">
                  <i class="fas fa-plus"></i>
                  <span class="text-sm">Manage Broker Accounts</span>
                </a>
                <div class="border-t my-1"></div>
                <button onclick="handleLogout()" class="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-3 text-red-600">
                  <i class="fas fa-sign-out-alt"></i>
                  <span class="text-sm">Logout</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  `;
}

function renderSidebar() {
  const navItems = [
    { id: 'dashboard', icon: 'fa-chart-pie', label: 'Dashboard' },
    { id: 'baskets', icon: 'fa-boxes', label: 'My Baskets' },
    { id: 'investments', icon: 'fa-wallet', label: 'Investments' },
    { id: 'holdings', icon: 'fa-hand-holding-usd', label: 'Holdings' },
    { id: 'explore', icon: 'fa-compass', label: 'Explore' },
    { id: 'sip', icon: 'fa-calendar-check', label: 'SIP' },
    { id: 'alerts', icon: 'fa-bell', label: 'Alerts' },
    { id: 'orders', icon: 'fa-receipt', label: 'Orders' }
  ];

  return `
    <aside class="w-64 bg-white min-h-screen shadow-sm hidden md:block">
      <nav class="p-4 space-y-1">
        ${navItems.map(item => `
          <button onclick="setView('${item.id}')" 
            class="w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition ${
              state.currentView === item.id 
                ? 'bg-indigo-50 text-indigo-600' 
                : 'text-gray-600 hover:bg-gray-50'
            }">
            <i class="fas ${item.icon} w-5"></i>
            <span>${item.label}</span>
          </button>
        `).join('')}
      </nav>
    </aside>
  `;
}

function renderMainContent() {
  switch (state.currentView) {
    case 'dashboard': return renderDashboard();
    case 'baskets': return renderBaskets();
    case 'investments': return renderInvestments();
    case 'holdings': return renderHoldings();
    case 'explore': return renderExplore();
    case 'sip': return renderSIP();
    case 'alerts': return renderAlerts();
    case 'orders': return renderOrders();
    case 'basket-detail': return renderBasketDetail();
    case 'investment-detail': return renderInvestmentDetail();
    case 'create-basket': return renderCreateBasket();
    default: return renderDashboard();
  }
}

function renderDashboard() {
  const totalInvested = state.investments.reduce((sum, inv) => sum + (inv.invested_amount || 0), 0);
  const currentValue = state.investments.reduce((sum, inv) => sum + (inv.current_value || inv.invested_amount || 0), 0);
  const totalPnL = currentValue - totalInvested;
  const pnlPercentage = totalInvested > 0 ? ((totalPnL / totalInvested) * 100).toFixed(2) : 0;

  return `
    <div class="space-y-6">
      <div class="flex justify-between items-center">
        <h1 class="text-2xl font-bold text-gray-900">Dashboard</h1>
        <button onclick="setView('create-basket')" class="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center space-x-2">
          <i class="fas fa-plus"></i>
          <span>Create Basket</span>
        </button>
      </div>

      <!-- Summary Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div class="bg-white rounded-xl p-6 shadow-sm">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-500">Total Invested</p>
              <p class="text-2xl font-bold">${formatCurrency(totalInvested)}</p>
            </div>
            <div class="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <i class="fas fa-wallet text-blue-600"></i>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-xl p-6 shadow-sm">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-500">Current Value</p>
              <p class="text-2xl font-bold">${formatCurrency(currentValue)}</p>
            </div>
            <div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <i class="fas fa-chart-line text-green-600"></i>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-xl p-6 shadow-sm">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-500">Total P&L</p>
              <p class="text-2xl font-bold ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}">
                ${totalPnL >= 0 ? '+' : ''}${formatCurrency(totalPnL)}
              </p>
              <p class="text-sm ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}">
                ${totalPnL >= 0 ? '+' : ''}${pnlPercentage}%
              </p>
            </div>
            <div class="w-12 h-12 ${totalPnL >= 0 ? 'bg-green-100' : 'bg-red-100'} rounded-full flex items-center justify-center">
              <i class="fas ${totalPnL >= 0 ? 'fa-arrow-up text-green-600' : 'fa-arrow-down text-red-600'}"></i>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-xl p-6 shadow-sm">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-500">Active SIPs</p>
              <p class="text-2xl font-bold">${state.sips.filter(s => s.status === 'ACTIVE').length}</p>
              <p class="text-sm text-gray-500">${formatCurrency(state.sips.filter(s => s.status === 'ACTIVE').reduce((sum, s) => sum + s.amount, 0))}/month</p>
            </div>
            <div class="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
              <i class="fas fa-sync-alt text-purple-600"></i>
            </div>
          </div>
        </div>
      </div>

      <!-- My Baskets & Investments -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="bg-white rounded-xl shadow-sm">
          <div class="p-6 border-b flex justify-between items-center">
            <h2 class="font-semibold text-gray-900">My Baskets</h2>
            <button onclick="setView('baskets')" class="text-sm text-indigo-600 hover:underline">View All</button>
          </div>
          <div class="p-4 space-y-3 max-h-80 overflow-y-auto">
            ${state.baskets.length === 0 ? `
              <div class="text-center py-8 text-gray-500">
                <i class="fas fa-boxes text-4xl mb-3 opacity-50"></i>
                <p>No baskets yet</p>
                <button onclick="setView('create-basket')" class="mt-3 text-indigo-600 hover:underline">Create your first basket</button>
              </div>
            ` : state.baskets.slice(0, 5).map(basket => `
              <div onclick="viewBasket(${basket.id})" class="p-4 rounded-lg bg-gray-50 hover:bg-gray-100 cursor-pointer transition">
                <div class="flex justify-between items-start">
                  <div>
                    <h3 class="font-medium text-gray-900">${basket.name}</h3>
                    <p class="text-sm text-gray-500">${basket.stock_count || 0} stocks</p>
                  </div>
                  <span class="px-2 py-1 text-xs rounded-full ${getThemeClass(basket.theme)}">${basket.theme || 'Custom'}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm">
          <div class="p-6 border-b flex justify-between items-center">
            <h2 class="font-semibold text-gray-900">Active Investments</h2>
            <button onclick="setView('investments')" class="text-sm text-indigo-600 hover:underline">View All</button>
          </div>
          <div class="p-4 space-y-3 max-h-80 overflow-y-auto">
            ${state.investments.length === 0 ? `
              <div class="text-center py-8 text-gray-500">
                <i class="fas fa-wallet text-4xl mb-3 opacity-50"></i>
                <p>No active investments</p>
                <button onclick="setView('explore')" class="mt-3 text-indigo-600 hover:underline">Explore baskets</button>
              </div>
            ` : state.investments.slice(0, 5).map(inv => {
              const pnl = (inv.current_value || inv.invested_amount) - inv.invested_amount;
              const pnlPct = inv.invested_amount > 0 ? ((pnl / inv.invested_amount) * 100).toFixed(2) : 0;
              return `
                <div onclick="viewInvestment(${inv.id})" class="p-4 rounded-lg bg-gray-50 hover:bg-gray-100 cursor-pointer transition">
                  <div class="flex justify-between items-start">
                    <div>
                      <h3 class="font-medium text-gray-900">${inv.basket_name}</h3>
                      <p class="text-sm text-gray-500">Invested: ${formatCurrency(inv.invested_amount)}</p>
                    </div>
                    <div class="text-right">
                      <p class="font-medium ${pnl >= 0 ? 'text-green-600' : 'text-red-600'}">
                        ${pnl >= 0 ? '+' : ''}${formatCurrency(pnl)}
                      </p>
                      <p class="text-xs ${pnl >= 0 ? 'text-green-600' : 'text-red-600'}">
                        ${pnl >= 0 ? '+' : ''}${pnlPct}%
                      </p>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderHoldings() {
  return `
    <div class="space-y-6">
      <div class="flex justify-between items-center">
        <h1 class="text-2xl font-bold text-gray-900">Holdings</h1>
        <div class="flex space-x-2">
          <button onclick="refreshZerodhaHoldings()" class="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
            <i class="fas fa-sync-alt mr-2"></i>Sync with Zerodha
          </button>
        </div>
      </div>

      <!-- Tabs -->
      <div class="bg-white rounded-xl shadow-sm">
        <div class="border-b">
          <nav class="flex -mb-px">
            <button onclick="showHoldingsTab('portfolio')" id="tab-portfolio" class="tab-btn px-6 py-3 border-b-2 border-indigo-500 text-indigo-600 font-medium">
              Portfolio Holdings
            </button>
            <button onclick="showHoldingsTab('zerodha')" id="tab-zerodha" class="tab-btn px-6 py-3 border-b-2 border-transparent text-gray-500 hover:text-gray-700">
              Zerodha Holdings
            </button>
          </nav>
        </div>

        <div id="holdings-content" class="p-6">
          ${renderPortfolioHoldings()}
        </div>
      </div>
    </div>
  `;
}

function renderPortfolioHoldings() {
  if (state.holdings.length === 0) {
    return `
      <div class="text-center py-16 text-gray-500">
        <i class="fas fa-hand-holding-usd text-6xl mb-4 opacity-50"></i>
        <h3 class="text-xl font-medium mb-2">No holdings yet</h3>
        <p>Start investing in baskets to see your holdings here</p>
      </div>
    `;
  }

  const totalValue = state.holdings.reduce((sum, h) => sum + (h.current_value || 0), 0);
  const totalInvested = state.holdings.reduce((sum, h) => sum + (h.invested_value || 0), 0);
  const totalPnL = totalValue - totalInvested;

  return `
    <div class="space-y-6">
      <div class="grid grid-cols-3 gap-4">
        <div class="bg-gray-50 rounded-lg p-4">
          <p class="text-sm text-gray-500">Total Invested</p>
          <p class="text-xl font-bold">${formatCurrency(totalInvested)}</p>
        </div>
        <div class="bg-gray-50 rounded-lg p-4">
          <p class="text-sm text-gray-500">Current Value</p>
          <p class="text-xl font-bold">${formatCurrency(totalValue)}</p>
        </div>
        <div class="bg-gray-50 rounded-lg p-4">
          <p class="text-sm text-gray-500">Total P&L</p>
          <p class="text-xl font-bold ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}">
            ${totalPnL >= 0 ? '+' : ''}${formatCurrency(totalPnL)}
          </p>
        </div>
      </div>

      <table class="w-full">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Symbol</th>
            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg Price</th>
            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">LTP</th>
            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">P&L</th>
          </tr>
        </thead>
        <tbody class="divide-y">
          ${state.holdings.map(h => `
            <tr class="hover:bg-gray-50">
              <td class="px-4 py-3">
                <div>
                  <p class="font-medium">${h.trading_symbol}</p>
                  <p class="text-xs text-gray-500">${h.exchange}</p>
                </div>
              </td>
              <td class="px-4 py-3 text-right">${h.total_quantity}</td>
              <td class="px-4 py-3 text-right">${formatCurrency(h.avg_price)}</td>
              <td class="px-4 py-3 text-right">${formatCurrency(h.current_price)}</td>
              <td class="px-4 py-3 text-right">${formatCurrency(h.current_value)}</td>
              <td class="px-4 py-3 text-right">
                <span class="${h.pnl >= 0 ? 'text-green-600' : 'text-red-600'}">
                  ${h.pnl >= 0 ? '+' : ''}${formatCurrency(h.pnl)}
                  <br>
                  <span class="text-xs">${h.pnl_percentage?.toFixed(2)}%</span>
                </span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderCreateBasket() {
  const minInvestment = calculateMinInvestment();
  
  return `
    <div class="space-y-6">
      <div class="flex items-center space-x-4">
        <button onclick="setView('baskets')" class="text-gray-500 hover:text-gray-700">
          <i class="fas fa-arrow-left"></i>
        </button>
        <h1 class="text-2xl font-bold text-gray-900 flex items-center">
          <span id="basketNameDisplay">Create New Basket</span>
          <button onclick="editBasketName()" class="ml-2 text-gray-400 hover:text-gray-600">
            <i class="fas fa-pencil-alt text-sm"></i>
          </button>
        </h1>
      </div>

      <div class="bg-white rounded-xl shadow-sm">
        <form id="createBasketForm" onsubmit="handleCreateBasket(event)">
          <!-- Header Section -->
          <div class="p-6 border-b">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
              <!-- Left: Basket Name & Search -->
              <div>
                <div class="mb-4">
                  <label class="block text-sm font-medium text-gray-700 mb-2">Basket Name *</label>
                  <input type="text" id="basketName" required 
                    class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" 
                    placeholder="My Tech Portfolio"
                    onchange="updateBasketNameDisplay()">
                </div>
                <div class="flex items-center space-x-2">
                  <select id="basketTheme" class="px-3 py-2 border rounded-lg text-sm">
                    <option value="">Select theme</option>
                    <option value="Technology">Technology</option>
                    <option value="Banking">Banking</option>
                    <option value="Healthcare">Healthcare</option>
                    <option value="Consumer">Consumer</option>
                    <option value="Automobile">Automobile</option>
                    <option value="Dividend">Dividend</option>
                    <option value="Growth">Growth</option>
                  </select>
                  <div class="relative flex-1">
                    <input type="text" id="stockSearch" 
                      class="w-full px-4 py-2 border rounded-lg pl-10 text-sm" 
                      placeholder="Search by name or ticker"
                      onkeyup="debounceSearch(this.value)"
                      autocomplete="off">
                    <i class="fas fa-search absolute left-3 top-3 text-gray-400"></i>
                  </div>
                </div>
                <div id="searchResults" class="mt-2 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto hidden absolute z-10 w-96"></div>
              </div>

              <!-- Center: Weighting Scheme -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Weighting Scheme</label>
                <select id="weightingScheme" class="w-full px-4 py-2 border rounded-lg" onchange="changeWeightingScheme(this.value)">
                  <option value="custom" ${state.weightingScheme === 'custom' ? 'selected' : ''}>Custom Weighted</option>
                  <option value="equal" ${state.weightingScheme === 'equal' ? 'selected' : ''}>Equal Weighted</option>
                </select>
              </div>

              <!-- Right: Minimum Investment Amount -->
              <div class="text-right">
                <label class="block text-sm font-medium text-gray-700 mb-2">Minimum Investment Amount</label>
                <div class="text-3xl font-bold text-gray-900" id="minInvestmentDisplay">
                  ${formatCurrency(minInvestment)}
                </div>
                <p class="text-xs text-gray-500 mt-1">Based on current LTP & weights</p>
              </div>
            </div>
          </div>

          <!-- Description (collapsible) -->
          <div class="px-6 py-3 border-b bg-gray-50">
            <textarea id="basketDescription" rows="1" 
              class="w-full px-3 py-2 border rounded-lg text-sm bg-white" 
              placeholder="Add a description for your basket..."></textarea>
          </div>

          <!-- Stocks Table -->
          <div class="p-6">
            ${state.basketStocks.length === 0 ? `
              <div class="text-center py-12 text-gray-500">
                <i class="fas fa-search text-4xl mb-4 opacity-50"></i>
                <p class="text-lg">Search and add stocks to your basket</p>
                <p class="text-sm">You can add up to 20 stocks</p>
              </div>
            ` : renderStocksTable()}
          </div>

          <!-- Footer -->
          <div class="px-6 py-4 border-t bg-gray-50 flex justify-between items-center">
            <div class="flex items-center space-x-6 text-sm">
              <span class="text-gray-500">Total Weight: <span id="totalWeight" class="font-bold ${getTotalWeight() === 100 ? 'text-green-600' : 'text-red-600'}">${getTotalWeight().toFixed(2)}%</span></span>
              <span class="text-gray-500"><span id="stockCount">${state.basketStocks.length}</span>/20 stocks</span>
            </div>
            <div class="flex space-x-4">
              <button type="button" onclick="setView('baskets')" class="px-6 py-2 border rounded-lg hover:bg-gray-100">
                Cancel
              </button>
              <button type="submit" class="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center" ${state.basketStocks.length === 0 ? 'disabled' : ''}>
                <i class="fas fa-save mr-2"></i>Create Basket
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  `;
}

function renderStocksTable() {
  const minInvestment = calculateMinInvestment();
  
  return `
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Price (₹)</th>
            <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Weights</th>
            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Shares | Weights</th>
            <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase"></th>
          </tr>
        </thead>
        <tbody class="divide-y">
          ${state.basketStocks.map((stock, index) => {
            const shares = calculateShares(stock, minInvestment);
            return `
              <tr class="hover:bg-gray-50">
                <td class="px-4 py-4">
                  <div class="flex items-center">
                    <a href="#" class="text-indigo-600 hover:text-indigo-800 font-medium">${stock.trading_symbol || stock.symbol}</a>
                    <span class="ml-2 text-xs text-gray-400">${stock.name || ''}</span>
                  </div>
                </td>
                <td class="px-4 py-4 text-right font-medium">
                  ${stock.last_price ? formatNumber(stock.last_price, 2) : '-'}
                </td>
                <td class="px-4 py-4">
                  <div class="flex items-center justify-center space-x-1">
                    <button type="button" onclick="adjustWeight(${index}, -0.5)" class="w-8 h-8 rounded-full border border-gray-300 hover:bg-gray-100 flex items-center justify-center text-gray-600">
                      <i class="fas fa-minus text-xs"></i>
                    </button>
                    <input type="number" 
                      class="w-16 px-2 py-1 border rounded text-center text-sm font-medium stock-weight" 
                      value="${stock.weight_percentage.toFixed(2)}" 
                      min="0.01" max="100" step="0.01"
                      onchange="updateStockWeight(${index}, this.value)">
                    <button type="button" onclick="adjustWeight(${index}, 0.5)" class="w-8 h-8 rounded-full border border-gray-300 hover:bg-gray-100 flex items-center justify-center text-gray-600">
                      <i class="fas fa-plus text-xs"></i>
                    </button>
                  </div>
                </td>
                <td class="px-4 py-4 text-right">
                  <span class="font-medium">${shares}</span>
                  <span class="text-gray-400 mx-1">|</span>
                  <span class="text-gray-600">${stock.weight_percentage.toFixed(2)}%</span>
                </td>
                <td class="px-4 py-4 text-center">
                  <button type="button" onclick="removeStock(${index})" class="text-red-500 hover:text-red-700">
                    <i class="fas fa-times"></i>
                  </button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
    
    <!-- Equal Weights Button -->
    <div class="mt-4 flex justify-end">
      <button type="button" onclick="applyEqualWeights()" class="text-sm bg-indigo-100 text-indigo-600 px-4 py-2 rounded-lg hover:bg-indigo-200">
        <i class="fas fa-balance-scale mr-2"></i>Equal Weights
      </button>
    </div>
  `;
}

function calculateMinInvestment() {
  if (state.basketStocks.length === 0) return 0;
  
  let minInvestment = 0;
  
  // For each stock, calculate minimum investment needed to buy at least 1 share
  state.basketStocks.forEach(stock => {
    if (stock.last_price && stock.weight_percentage > 0) {
      // Min investment = price / (weight/100)
      // This ensures at least 1 share for each stock based on its weight
      const minForStock = stock.last_price / (stock.weight_percentage / 100);
      if (minForStock > minInvestment) {
        minInvestment = minForStock;
      }
    }
  });
  
  // Round up to nearest 100
  return Math.ceil(minInvestment / 100) * 100;
}

function calculateShares(stock, totalInvestment) {
  if (!stock.last_price || !stock.weight_percentage || totalInvestment <= 0) {
    return 0;
  }
  
  const amountForStock = totalInvestment * (stock.weight_percentage / 100);
  const shares = Math.floor(amountForStock / stock.last_price);
  return shares;
}

function getTotalWeight() {
  return state.basketStocks.reduce((sum, s) => sum + (s.weight_percentage || 0), 0);
}

function adjustWeight(index, delta) {
  if (state.basketStocks.length <= 1) {
    // Single stock always 100%
    state.basketStocks[0].weight_percentage = 100;
    updateBasketDisplay();
    return;
  }
  
  const stock = state.basketStocks[index];
  const oldWeight = stock.weight_percentage;
  let newWeight = oldWeight + delta;
  
  // Clamp between 0.5 and 99.5 (leave room for other stocks)
  const maxWeight = 100 - (state.basketStocks.length - 1) * 0.5; // Leave at least 0.5% for each other stock
  newWeight = Math.max(0.5, Math.min(maxWeight, newWeight));
  
  const weightDiff = newWeight - oldWeight;
  
  if (Math.abs(weightDiff) < 0.01) return; // No significant change
  
  stock.weight_percentage = parseFloat(newWeight.toFixed(2));
  
  // Redistribute the weight difference proportionally among other stocks
  redistributeWeights(index, weightDiff);
  
  // Switch to custom mode
  state.weightingScheme = 'custom';
  const schemeSelect = document.getElementById('weightingScheme');
  if (schemeSelect) schemeSelect.value = 'custom';
  
  updateBasketDisplay();
}

function redistributeWeights(changedIndex, weightDiff) {
  // Get other stocks
  const otherStocks = state.basketStocks.filter((_, i) => i !== changedIndex);
  if (otherStocks.length === 0) return;
  
  // Calculate total weight of other stocks
  const otherTotalWeight = otherStocks.reduce((sum, s) => sum + s.weight_percentage, 0);
  
  if (otherTotalWeight <= 0) {
    // Edge case: distribute equally
    const equalWeight = (100 - state.basketStocks[changedIndex].weight_percentage) / otherStocks.length;
    state.basketStocks.forEach((s, i) => {
      if (i !== changedIndex) {
        s.weight_percentage = parseFloat(equalWeight.toFixed(2));
      }
    });
    return;
  }
  
  // Distribute weight change proportionally
  state.basketStocks.forEach((s, i) => {
    if (i !== changedIndex) {
      const proportion = s.weight_percentage / otherTotalWeight;
      let newWeight = s.weight_percentage - (weightDiff * proportion);
      // Ensure minimum 0.5%
      newWeight = Math.max(0.5, newWeight);
      s.weight_percentage = parseFloat(newWeight.toFixed(2));
    }
  });
  
  // Normalize to ensure total is exactly 100%
  normalizeWeights();
}

function normalizeWeights() {
  const total = getTotalWeight();
  if (Math.abs(total - 100) < 0.01) return; // Already close enough
  
  // Find the adjustment needed
  const adjustment = 100 - total;
  
  // Apply adjustment to the stock with the largest weight (to minimize relative error)
  let maxIndex = 0;
  let maxWeight = 0;
  state.basketStocks.forEach((s, i) => {
    if (s.weight_percentage > maxWeight) {
      maxWeight = s.weight_percentage;
      maxIndex = i;
    }
  });
  
  state.basketStocks[maxIndex].weight_percentage += parseFloat(adjustment.toFixed(2));
  
  // Ensure all weights are at least 0.5%
  state.basketStocks.forEach(s => {
    s.weight_percentage = Math.max(0.5, parseFloat(s.weight_percentage.toFixed(2)));
  });
}

function changeWeightingScheme(scheme) {
  state.weightingScheme = scheme;
  if (scheme === 'equal') {
    applyEqualWeights();
  }
}

function updateBasketNameDisplay() {
  const name = document.getElementById('basketName').value || 'Create New Basket';
  document.getElementById('basketNameDisplay').textContent = name;
}

function editBasketName() {
  document.getElementById('basketName').focus();
}

function updateBasketDisplay() {
  // Update the stocks table section
  const stocksContainer = document.querySelector('#createBasketForm .p-6:not(.border-b)');
  if (stocksContainer && state.basketStocks.length > 0) {
    stocksContainer.innerHTML = renderStocksTable();
  }
  
  // Update totals
  updateWeightDisplay();
  
  // Update minimum investment
  const minInvestment = calculateMinInvestment();
  const minDisplay = document.getElementById('minInvestmentDisplay');
  if (minDisplay) {
    minDisplay.textContent = formatCurrency(minInvestment);
  }
}

function renderSelectedStocks() {
  // This function is now only used as a fallback
  // The main display is handled by renderStocksTable()
  return renderStocksTable();
}

function renderBaskets() {
  return `
    <div class="space-y-6">
      <div class="flex justify-between items-center">
        <h1 class="text-2xl font-bold text-gray-900">My Baskets</h1>
        <button onclick="setView('create-basket')" class="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
          <i class="fas fa-plus mr-2"></i>Create Basket
        </button>
      </div>

      ${state.baskets.length === 0 ? `
        <div class="text-center py-16 bg-white rounded-xl">
          <i class="fas fa-boxes text-6xl text-gray-300 mb-4"></i>
          <h3 class="text-xl font-medium text-gray-600 mb-2">No baskets yet</h3>
          <p class="text-gray-500 mb-6">Create your first stock basket or explore templates</p>
          <div class="flex justify-center space-x-4">
            <button onclick="setView('create-basket')" class="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700">
              <i class="fas fa-plus mr-2"></i>Create Basket
            </button>
            <button onclick="setView('explore')" class="border border-gray-300 px-6 py-2 rounded-lg hover:bg-gray-50">
              <i class="fas fa-compass mr-2"></i>Explore Templates
            </button>
          </div>
        </div>
      ` : `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          ${state.baskets.map(basket => `
            <div class="bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-md transition cursor-pointer" onclick="viewBasket(${basket.id})">
              <div class="p-6">
                <div class="flex justify-between items-start mb-4">
                  <span class="px-3 py-1 text-xs font-medium rounded-full ${getThemeClass(basket.theme)}">${basket.theme || 'Custom'}</span>
                  ${basket.is_public ? '<i class="fas fa-globe text-gray-400"></i>' : '<i class="fas fa-lock text-gray-400"></i>'}
                </div>
                <h3 class="text-lg font-semibold text-gray-900 mb-2">${basket.name}</h3>
                <p class="text-sm text-gray-500 line-clamp-2 mb-4">${basket.description || 'No description'}</p>
                <div class="flex justify-between items-center text-sm">
                  <span class="text-gray-500">${basket.stock_count || 0} stocks</span>
                </div>
              </div>
              <div class="px-6 py-4 bg-gray-50 flex justify-between items-center">
                <button onclick="event.stopPropagation(); investInBasket(${basket.id})" class="text-indigo-600 hover:text-indigo-800 text-sm font-medium">
                  <i class="fas fa-shopping-cart mr-1"></i>Invest
                </button>
                <div class="flex space-x-3">
                  <button onclick="event.stopPropagation(); editBasket(${basket.id})" class="text-gray-400 hover:text-gray-600">
                    <i class="fas fa-edit"></i>
                  </button>
                  <button onclick="event.stopPropagation(); deleteBasket(${basket.id})" class="text-gray-400 hover:text-red-600">
                    <i class="fas fa-trash"></i>
                  </button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>
  `;
}

function renderInvestments() {
  return `
    <div class="space-y-6">
      <div class="flex justify-between items-center">
        <h1 class="text-2xl font-bold text-gray-900">My Investments</h1>
      </div>

      ${state.investments.length === 0 ? `
        <div class="text-center py-16 bg-white rounded-xl">
          <i class="fas fa-wallet text-6xl text-gray-300 mb-4"></i>
          <h3 class="text-xl font-medium text-gray-600 mb-2">No investments yet</h3>
          <p class="text-gray-500 mb-6">Start investing in your baskets</p>
          <button onclick="setView('explore')" class="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700">
            <i class="fas fa-compass mr-2"></i>Explore Baskets
          </button>
        </div>
      ` : `
        <div class="bg-white rounded-xl shadow-sm overflow-hidden">
          <table class="w-full">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Basket</th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Invested</th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Current Value</th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">P&L</th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y">
              ${state.investments.map(inv => {
                const currentValue = inv.current_value || inv.invested_amount;
                const pnl = currentValue - inv.invested_amount;
                const pnlPct = ((pnl / inv.invested_amount) * 100).toFixed(2);
                return `
                  <tr class="hover:bg-gray-50 cursor-pointer" onclick="viewInvestment(${inv.id})">
                    <td class="px-6 py-4">
                      <div>
                        <p class="font-medium text-gray-900">${inv.basket_name}</p>
                        <p class="text-sm text-gray-500">${inv.basket_theme || ''}</p>
                      </div>
                    </td>
                    <td class="px-6 py-4 text-right">${formatCurrency(inv.invested_amount)}</td>
                    <td class="px-6 py-4 text-right">${formatCurrency(currentValue)}</td>
                    <td class="px-6 py-4 text-right">
                      <span class="${pnl >= 0 ? 'text-green-600' : 'text-red-600'}">
                        ${pnl >= 0 ? '+' : ''}${formatCurrency(pnl)}
                        <br>
                        <span class="text-xs">${pnl >= 0 ? '+' : ''}${pnlPct}%</span>
                      </span>
                    </td>
                    <td class="px-6 py-4 text-right">
                      <button onclick="event.stopPropagation(); sellInvestment(${inv.id})" class="text-red-600 hover:text-red-800 text-sm mr-2">
                        Sell
                      </button>
                      <button onclick="event.stopPropagation(); rebalanceInvestment(${inv.id})" class="text-indigo-600 hover:text-indigo-800 text-sm">
                        Rebalance
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

function renderExplore() {
  return `
    <div class="space-y-6">
      <h1 class="text-2xl font-bold text-gray-900">Explore Templates</h1>
      <div id="templatesGrid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div class="animate-pulse bg-white rounded-xl p-6 h-48"></div>
        <div class="animate-pulse bg-white rounded-xl p-6 h-48"></div>
        <div class="animate-pulse bg-white rounded-xl p-6 h-48"></div>
        <div class="animate-pulse bg-white rounded-xl p-6 h-48"></div>
      </div>
    </div>
  `;
}

function renderSIP() {
  return `
    <div class="space-y-6">
      <div class="flex justify-between items-center">
        <h1 class="text-2xl font-bold text-gray-900">SIP Management</h1>
        <button onclick="showCreateSIPModal()" class="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
          <i class="fas fa-plus mr-2"></i>Create SIP
        </button>
      </div>

      ${state.sips.length === 0 ? `
        <div class="text-center py-16 bg-white rounded-xl">
          <i class="fas fa-calendar-check text-6xl text-gray-300 mb-4"></i>
          <h3 class="text-xl font-medium text-gray-600 mb-2">No SIPs yet</h3>
          <p class="text-gray-500 mb-6">Set up systematic investment plans for your baskets</p>
          <button onclick="showCreateSIPModal()" class="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700">
            <i class="fas fa-plus mr-2"></i>Create SIP
          </button>
        </div>
      ` : `
        <div class="bg-white rounded-xl shadow-sm overflow-hidden">
          <table class="w-full">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Basket</th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Frequency</th>
                <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Next Execution</th>
                <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y">
              ${state.sips.map(sip => `
                <tr class="hover:bg-gray-50">
                  <td class="px-6 py-4 font-medium">${sip.basket_name}</td>
                  <td class="px-6 py-4 text-right">${formatCurrency(sip.amount)}</td>
                  <td class="px-6 py-4 text-center capitalize">${sip.frequency}</td>
                  <td class="px-6 py-4 text-center">${sip.next_execution_date || '-'}</td>
                  <td class="px-6 py-4 text-center">
                    <span class="px-2 py-1 text-xs rounded-full ${
                      sip.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
                      sip.status === 'PAUSED' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }">${sip.status}</span>
                  </td>
                  <td class="px-6 py-4 text-right space-x-2">
                    ${sip.status === 'ACTIVE' ? `
                      <button onclick="executeSIP(${sip.id})" class="text-indigo-600 hover:text-indigo-800 text-sm">Execute Now</button>
                      <button onclick="pauseSIP(${sip.id})" class="text-yellow-600 hover:text-yellow-800 text-sm">Pause</button>
                    ` : sip.status === 'PAUSED' ? `
                      <button onclick="resumeSIP(${sip.id})" class="text-green-600 hover:text-green-800 text-sm">Resume</button>
                    ` : ''}
                    <button onclick="deleteSIP(${sip.id})" class="text-red-600 hover:text-red-800 text-sm">Cancel</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

function renderAlerts() {
  return `
    <div class="space-y-6">
      <div class="flex justify-between items-center">
        <h1 class="text-2xl font-bold text-gray-900">Alerts</h1>
        <button onclick="showCreateAlertModal()" class="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
          <i class="fas fa-plus mr-2"></i>Create Alert
        </button>
      </div>

      <div class="bg-white rounded-xl shadow-sm p-6">
        ${state.alerts.length === 0 ? `
          <div class="text-center py-8 text-gray-500">
            <i class="fas fa-bell text-4xl mb-3 opacity-50"></i>
            <p>No alerts configured</p>
          </div>
        ` : `
          <div class="space-y-4">
            ${state.alerts.map(alert => `
              <div class="flex items-center justify-between p-4 rounded-lg ${alert.is_triggered ? 'bg-yellow-50' : 'bg-gray-50'}">
                <div class="flex items-center space-x-4">
                  <i class="fas fa-bell ${alert.is_triggered ? 'text-yellow-500' : 'text-gray-400'}"></i>
                  <div>
                    <p class="font-medium">${alert.trading_symbol || alert.target_type}</p>
                    <p class="text-sm text-gray-500">${alert.condition} ${alert.threshold_value}</p>
                  </div>
                </div>
                <div class="flex items-center space-x-4">
                  <span class="text-xs px-2 py-1 rounded-full ${alert.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
                    ${alert.is_active ? 'Active' : 'Inactive'}
                  </span>
                  <button onclick="deleteAlert(${alert.id})" class="text-red-500 hover:text-red-700">
                    <i class="fas fa-trash"></i>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    </div>
  `;
}

function renderOrders() {
  return `
    <div class="space-y-6">
      <h1 class="text-2xl font-bold text-gray-900">Today's Orders</h1>
      <div id="ordersContent" class="bg-white rounded-xl shadow-sm p-6">
        <div class="text-center py-8">
          <i class="fas fa-spinner fa-spin text-2xl text-indigo-600"></i>
          <p class="mt-2 text-gray-500">Loading orders...</p>
        </div>
      </div>
    </div>
  `;
}

function renderModals() {
  return `
    <!-- Settings Modal -->
    <div id="settingsModal" class="fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50">
      <div class="bg-white rounded-xl p-8 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div class="flex justify-between items-center mb-6">
          <h3 class="text-xl font-bold">Settings</h3>
          <button onclick="hideSettingsModal()" class="text-gray-400 hover:text-gray-600">
            <i class="fas fa-times"></i>
          </button>
        </div>
        
        <div class="space-y-6">
          <!-- Broker Selection -->
          <div>
            <h4 class="font-medium mb-3">Configure Broker</h4>
            <div class="grid grid-cols-2 gap-3 mb-4">
              <label class="cursor-pointer">
                <input type="radio" name="settings_broker" value="zerodha" checked onchange="updateSettingsBrokerForm()" class="hidden">
                <div class="settings-broker-card border-2 rounded-lg p-3 text-center border-indigo-500 bg-indigo-50">
                  <i class="fas fa-chart-line text-xl text-indigo-600 mb-1"></i>
                  <p class="font-medium text-sm">Zerodha</p>
                </div>
              </label>
              <label class="cursor-pointer">
                <input type="radio" name="settings_broker" value="angelone" onchange="updateSettingsBrokerForm()" class="hidden">
                <div class="settings-broker-card border-2 rounded-lg p-3 text-center border-gray-200 hover:border-indigo-300">
                  <i class="fas fa-chart-bar text-xl text-orange-600 mb-1"></i>
                  <p class="font-medium text-sm">Angel One</p>
                </div>
              </label>
            </div>
            
            <div id="settingsBrokerHelp" class="text-sm text-blue-600 mb-4">
              <i class="fas fa-info-circle mr-1"></i>
              <a href="https://developers.kite.trade" target="_blank" class="underline">Get Zerodha API credentials</a>
            </div>
            
            <div class="space-y-3">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                <input type="text" id="settingsApiKey" class="w-full px-4 py-2 border rounded-lg" placeholder="Your API Key">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">API Secret</label>
                <input type="password" id="settingsApiSecret" class="w-full px-4 py-2 border rounded-lg" placeholder="Your API Secret">
              </div>
              <div id="settingsAngeloneFields" class="hidden space-y-3">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Client Code</label>
                  <input type="text" id="settingsClientCode" class="w-full px-4 py-2 border rounded-lg" placeholder="Your Client Code">
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">MPIN (Optional)</label>
                  <input type="password" id="settingsMpin" class="w-full px-4 py-2 border rounded-lg" placeholder="4-digit MPIN">
                </div>
              </div>
              <button onclick="updateCredentials()" class="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700">
                <i class="fas fa-save mr-2"></i>Save Credentials
              </button>
            </div>
          </div>
          
          <div class="border-t pt-6">
            <h4 class="font-medium mb-2">Master Instruments</h4>
            <p class="text-sm text-gray-500 mb-2">
              ${state.instrumentsStatus?.total_instruments || 0} instruments loaded
              ${state.instrumentsStatus?.last_download ? '<br>Last updated: ' + new Date(state.instrumentsStatus.last_download).toLocaleDateString() : ''}
            </p>
            <button onclick="downloadInstruments()" class="w-full border border-indigo-600 text-indigo-600 py-2 rounded-lg hover:bg-indigo-50">
              <i class="fas fa-download mr-2"></i>Download Instruments
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Add Account Modal -->
    <div id="addAccountModal" class="fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50">
      <div class="bg-white rounded-xl p-8 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div class="flex justify-between items-center mb-6">
          <h3 class="text-xl font-bold">Add Broker Account</h3>
          <button onclick="hideAddAccountModal()" class="text-gray-400 hover:text-gray-600">
            <i class="fas fa-times"></i>
          </button>
        </div>
        
        <!-- Step 1: Broker Selection (shown by default) -->
        <div id="addAccountStep1">
          <form onsubmit="handleAddAccount(event)">
            <!-- Broker Selection -->
            <div class="mb-6">
              <label class="block text-sm font-medium text-gray-700 mb-3">Select Broker</label>
              <div class="grid grid-cols-2 gap-3">
                <label class="cursor-pointer">
                  <input type="radio" name="add_broker" value="zerodha" checked onchange="updateAddAccountForm()" class="hidden">
                  <div class="add-broker-card border-2 rounded-lg p-4 text-center border-indigo-500 bg-indigo-50">
                    <i class="fas fa-chart-line text-2xl text-indigo-600 mb-2"></i>
                    <p class="font-semibold">Zerodha Kite</p>
                    <p class="text-xs text-gray-500">OAuth Login</p>
                  </div>
                </label>
                <label class="cursor-pointer">
                  <input type="radio" name="add_broker" value="angelone" onchange="updateAddAccountForm()" class="hidden">
                  <div class="add-broker-card border-2 rounded-lg p-4 text-center border-gray-200 hover:border-indigo-300">
                    <i class="fas fa-chart-bar text-2xl text-orange-600 mb-2"></i>
                    <p class="font-semibold">Angel One</p>
                    <p class="text-xs text-gray-500">TOTP Login</p>
                  </div>
                </label>
              </div>
            </div>
            
            <div id="addAccountHelp" class="bg-blue-50 rounded-lg p-3 mb-4">
              <p class="text-sm text-blue-800">
                <i class="fas fa-info-circle mr-1"></i>
                <span id="addAccountHelpText">Get credentials from <a href="https://developers.kite.trade" target="_blank" class="underline font-medium">Kite Connect Portal</a></span>
              </p>
            </div>
            
            <!-- Zerodha Fields -->
            <div id="zerodhaFields">
              <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Account Name</label>
                <input type="text" id="addAccountName" class="w-full px-4 py-2 border rounded-lg" placeholder="e.g., Trading Account">
              </div>
              
              <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                <input type="text" id="addAccountApiKey" class="w-full px-4 py-2 border rounded-lg" placeholder="Your API Key">
              </div>
              
              <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">API Secret</label>
                <input type="password" id="addAccountApiSecret" class="w-full px-4 py-2 border rounded-lg" placeholder="Your API Secret">
              </div>
              
              <div class="mb-6">
                <label class="flex items-center">
                  <input type="checkbox" id="addAccountUseAppCreds" class="mr-2">
                  <span class="text-sm">Use app-level credentials (if already configured)</span>
                </label>
              </div>
            </div>
            
            <!-- Angel One Fields -->
            <div id="addAccountAngeloneFields" class="hidden">
              <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Client Code <span class="text-red-500">*</span></label>
                <input type="text" id="addAccountClientCode" class="w-full px-4 py-2 border rounded-lg" placeholder="Your Angel One Client Code">
                <p class="text-xs text-gray-500 mt-1">Your Angel One demat account ID</p>
              </div>
              <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">MPIN <span class="text-red-500">*</span></label>
                <input type="password" id="addAccountMpin" class="w-full px-4 py-2 border rounded-lg" placeholder="Your 4-digit MPIN">
                <p class="text-xs text-gray-500 mt-1">Your Angel One trading MPIN</p>
              </div>
              <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">TOTP <span class="text-red-500">*</span></label>
                <input type="text" id="addAccountTotp" class="w-full px-4 py-2 border rounded-lg font-mono text-lg tracking-widest" placeholder="123456" maxlength="6" pattern="[0-9]{6}">
                <p class="text-xs text-gray-500 mt-1">6-digit code from your authenticator app (Google Authenticator, etc.)</p>
              </div>
            </div>
            
            <button type="submit" id="addAccountBtn" class="w-full bg-indigo-600 text-white py-3 rounded-lg hover:bg-indigo-700">
              <i class="fas fa-plus mr-2"></i>Add Account & Login
            </button>
          </form>
        </div>
      </div>
    </div>

    <!-- Invest Modal -->
    <div id="investModal" class="fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50">
      <div class="bg-white rounded-xl p-8 max-w-md w-full mx-4">
        <div class="flex justify-between items-center mb-6">
          <h3 class="text-xl font-bold">Invest in Basket</h3>
          <button onclick="hideInvestModal()" class="text-gray-400 hover:text-gray-600">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <form onsubmit="handleInvest(event)">
          <input type="hidden" id="investBasketId">
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-2">Investment Amount (₹)</label>
            <input type="number" id="investAmount" required min="1000" step="100"
              class="w-full px-4 py-2 border rounded-lg" placeholder="10000">
            <p class="text-xs text-gray-500 mt-1">Minimum ₹1,000</p>
          </div>
          <div class="mb-6">
            <label class="flex items-center">
              <input type="checkbox" id="useDirectApi" checked class="mr-2">
              <span class="text-sm">Place orders directly via API</span>
            </label>
            <p class="text-xs text-gray-500 mt-1">Uncheck to use Zerodha's external order page</p>
          </div>
          <button type="submit" class="w-full bg-indigo-600 text-white py-3 rounded-lg hover:bg-indigo-700">
            <i class="fas fa-shopping-cart mr-2"></i>Invest Now
          </button>
        </form>
      </div>
    </div>

    <!-- SIP Modal -->
    <div id="sipModal" class="fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50">
      <div class="bg-white rounded-xl p-8 max-w-md w-full mx-4">
        <div class="flex justify-between items-center mb-6">
          <h3 class="text-xl font-bold">Create SIP</h3>
          <button onclick="hideSIPModal()" class="text-gray-400 hover:text-gray-600">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <form onsubmit="handleCreateSIP(event)">
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Select Basket</label>
              <select id="sipBasketId" required class="w-full px-4 py-2 border rounded-lg">
                <option value="">Choose a basket</option>
                ${state.baskets.map(b => `<option value="${b.id}">${b.name}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Amount (₹)</label>
              <input type="number" id="sipAmount" required min="500" step="100"
                class="w-full px-4 py-2 border rounded-lg" placeholder="5000">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Frequency</label>
              <select id="sipFrequency" required class="w-full px-4 py-2 border rounded-lg">
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="daily">Daily</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
              <input type="date" id="sipStartDate" required class="w-full px-4 py-2 border rounded-lg">
            </div>
          </div>
          <button type="submit" class="w-full bg-indigo-600 text-white py-3 rounded-lg hover:bg-indigo-700 mt-6">
            <i class="fas fa-calendar-check mr-2"></i>Create SIP
          </button>
        </form>
      </div>
    </div>
  `;
}

// Event handlers
function setView(view) {
  state.currentView = view;
  renderApp();
  
  if (view === 'explore') {
    loadTemplates();
  } else if (view === 'orders') {
    loadOrders();
  } else if (view === 'create-basket') {
    state.basketStocks = [];
  }
}

function handleLogout() {
  // Clear both session types
  localStorage.removeItem('user_session_id');
  localStorage.removeItem('session_id');
  api.post('/user/logout');
  window.location.href = '/';
}

// Switch active broker account for trading
async function switchBrokerAccount(accountId) {
  const account = state.brokerAccounts.find(acc => acc.id === accountId);
  if (account) {
    if (!account.is_connected) {
      showNotification('Please connect this account first', 'warning');
      window.location.href = '/accounts';
      return;
    }
    state.activeBrokerAccount = account;
    renderApp();
    showNotification(`Switched to ${account.account_name}`, 'success');
  }
}

// Legacy function for backward compatibility
async function switchAccount(accountId) {
  return switchBrokerAccount(accountId);
}

function addNewAccount() {
  window.location.href = '/accounts';
}

// Search functionality
let searchTimeout;
function debounceSearch(query) {
  clearTimeout(searchTimeout);
  if (query.length < 1) {
    document.getElementById('searchResults').classList.add('hidden');
    return;
  }
  searchTimeout = setTimeout(() => searchStocks(query), 300);
}

async function searchStocks(query) {
  const res = await api.get(`/instruments/search?q=${encodeURIComponent(query)}&with_ltp=true`);
  if (res?.success) {
    state.searchResults = res.data;
    renderSearchResults();
  }
}

function renderSearchResults() {
  const container = document.getElementById('searchResults');
  if (state.searchResults.length === 0) {
    container.innerHTML = '<div class="p-4 text-gray-500">No results found</div>';
  } else {
    container.innerHTML = state.searchResults.map(stock => `
      <div class="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-0" onclick="addStock(${JSON.stringify(stock).replace(/"/g, '&quot;')})">
        <div class="flex justify-between items-center">
          <div>
            <p class="font-medium">${stock.trading_symbol || stock.symbol}</p>
            <p class="text-xs text-gray-500">${stock.name || ''} • ${stock.exchange}</p>
          </div>
          ${stock.last_price ? `<span class="text-sm font-medium">${formatCurrency(stock.last_price)}</span>` : ''}
        </div>
      </div>
    `).join('');
  }
  container.classList.remove('hidden');
}

function addStock(stock) {
  if (state.basketStocks.length >= 20) {
    showNotification('Maximum 20 stocks allowed', 'warning');
    return;
  }
  
  const tradingSymbol = stock.trading_symbol || stock.symbol;
  if (state.basketStocks.find(s => (s.trading_symbol || s.symbol) === tradingSymbol && s.exchange === stock.exchange)) {
    showNotification('Stock already added', 'warning');
    return;
  }
  
  // Ensure trading_symbol is set
  if (!stock.trading_symbol && stock.symbol) {
    stock.trading_symbol = stock.symbol;
  }
  
  stock.weight_percentage = 0;
  state.basketStocks.push(stock);
  
  // Apply equal weights or redistribute in custom mode
  if (state.weightingScheme === 'equal') {
    applyEqualWeights();
  } else {
    // In custom mode, give new stock an equal share and reduce others proportionally
    const newWeight = parseFloat((100 / state.basketStocks.length).toFixed(2));
    const scaleFactor = (100 - newWeight) / 100;
    
    state.basketStocks.forEach((s, i) => {
      if (i < state.basketStocks.length - 1) {
        s.weight_percentage = parseFloat((s.weight_percentage * scaleFactor).toFixed(2));
      } else {
        s.weight_percentage = newWeight;
      }
    });
    
    // Adjust for rounding
    const total = getTotalWeight();
    if (Math.abs(total - 100) > 0.01) {
      state.basketStocks[0].weight_percentage += parseFloat((100 - total).toFixed(2));
    }
    
    updateBasketDisplay();
  }
  
  document.getElementById('searchResults').classList.add('hidden');
  document.getElementById('stockSearch').value = '';
  
  // Re-render stocks table if we just added the first stock
  if (state.basketStocks.length === 1) {
    const stocksContainer = document.querySelector('#createBasketForm .p-6:not(.border-b)');
    if (stocksContainer) {
      stocksContainer.innerHTML = renderStocksTable();
    }
  }
}

function removeStock(index) {
  state.basketStocks.splice(index, 1);
  
  if (state.basketStocks.length === 0) {
    // No stocks left - show empty state
    const stocksContainer = document.querySelector('#createBasketForm .p-6:not(.border-b)');
    if (stocksContainer) {
      stocksContainer.innerHTML = `
        <div class="text-center py-12 text-gray-500">
          <i class="fas fa-search text-4xl mb-4 opacity-50"></i>
          <p class="text-lg">Search and add stocks to your basket</p>
          <p class="text-sm">You can add up to 20 stocks</p>
        </div>
      `;
    }
    updateWeightDisplay();
    return;
  }
  
  // Redistribute weights to maintain 100%
  // Scale up remaining stocks proportionally
  const currentTotal = getTotalWeight();
  if (currentTotal > 0 && currentTotal !== 100) {
    const scaleFactor = 100 / currentTotal;
    state.basketStocks.forEach(s => {
      s.weight_percentage = parseFloat((s.weight_percentage * scaleFactor).toFixed(2));
    });
    normalizeWeights(); // Ensure exactly 100%
  }
  
  updateBasketDisplay();
  
  // If no stocks left, re-render to show empty state
  if (state.basketStocks.length === 0) {
    const stocksContainer = document.querySelector('#createBasketForm .p-6:not(.border-b)');
    if (stocksContainer) {
      stocksContainer.innerHTML = `
        <div class="text-center py-12 text-gray-500">
          <i class="fas fa-search text-4xl mb-4 opacity-50"></i>
          <p class="text-lg">Search and add stocks to your basket</p>
          <p class="text-sm">You can add up to 20 stocks</p>
        </div>
      `;
    }
    updateWeightDisplay();
  }
}

function updateStockWeight(index, value) {
  if (state.basketStocks.length <= 1) {
    // Single stock always 100%
    state.basketStocks[0].weight_percentage = 100;
    updateBasketDisplay();
    return;
  }
  
  const newWeight = parseFloat(value) || 0;
  const oldWeight = state.basketStocks[index].weight_percentage;
  
  // Clamp between 0.5 and 99.5
  const maxWeight = 100 - (state.basketStocks.length - 1) * 0.5;
  const clampedWeight = Math.max(0.5, Math.min(maxWeight, newWeight));
  
  const weightDiff = clampedWeight - oldWeight;
  
  state.basketStocks[index].weight_percentage = parseFloat(clampedWeight.toFixed(2));
  
  // Redistribute the weight difference to other stocks
  redistributeWeights(index, weightDiff);
  
  // Switch to custom mode
  state.weightingScheme = 'custom';
  const schemeSelect = document.getElementById('weightingScheme');
  if (schemeSelect) schemeSelect.value = 'custom';
  
  updateBasketDisplay();
}

function applyEqualWeights() {
  if (state.basketStocks.length === 0) {
    updateWeightDisplay();
    return;
  }
  
  state.weightingScheme = 'equal';
  const schemeSelect = document.getElementById('weightingScheme');
  if (schemeSelect) schemeSelect.value = 'equal';
  
  const equalWeight = parseFloat((100 / state.basketStocks.length).toFixed(2));
  state.basketStocks.forEach((stock, index) => {
    stock.weight_percentage = equalWeight;
  });
  
  // Adjust last stock for rounding
  const total = state.basketStocks.reduce((sum, s) => sum + s.weight_percentage, 0);
  if (Math.abs(total - 100) > 0.01 && state.basketStocks.length > 0) {
    state.basketStocks[state.basketStocks.length - 1].weight_percentage += parseFloat((100 - total).toFixed(2));
  }
  
  updateBasketDisplay();
}

function updateWeightDisplay() {
  const total = getTotalWeight();
  const totalWeightEl = document.getElementById('totalWeight');
  const stockCountEl = document.getElementById('stockCount');
  
  if (totalWeightEl) {
    totalWeightEl.textContent = total.toFixed(2) + '%';
    totalWeightEl.className = `font-bold ${Math.abs(total - 100) < 0.1 ? 'text-green-600' : 'text-red-600'}`;
  }
  if (stockCountEl) {
    stockCountEl.textContent = state.basketStocks.length;
  }
  
  // Update min investment display
  const minInvestment = calculateMinInvestment();
  const minDisplay = document.getElementById('minInvestmentDisplay');
  if (minDisplay) {
    minDisplay.textContent = formatCurrency(minInvestment);
  }
}

async function handleCreateBasket(e) {
  e.preventDefault();
  
  if (state.basketStocks.length === 0) {
    showNotification('Please add at least one stock', 'warning');
    return;
  }
  
  const totalWeight = state.basketStocks.reduce((sum, s) => sum + s.weight_percentage, 0);
  if (Math.abs(totalWeight - 100) > 0.1) {
    showNotification('Total weight must equal 100%', 'warning');
    return;
  }
  
  const basketName = document.getElementById('basketName').value;
  if (!basketName || basketName.trim() === '') {
    showNotification('Please enter a basket name', 'warning');
    return;
  }
  
  const data = {
    name: basketName.trim(),
    description: document.getElementById('basketDescription').value || '',
    theme: document.getElementById('basketTheme').value || '',
    stocks: state.basketStocks.map(s => ({
      trading_symbol: s.trading_symbol || s.zerodha_trading_symbol || s.symbol,
      exchange: s.exchange || 'NSE',
      weight_percentage: parseFloat(s.weight_percentage.toFixed(2))
    }))
  };
  
  console.log('Creating basket:', data); // Debug log
  
  // Disable button to prevent double submission
  const submitBtn = document.querySelector('#createBasketForm button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Creating...';
  }
  
  try {
    const res = await api.post('/baskets', data);
    console.log('Create basket response:', res); // Debug log
    
    if (res?.success) {
      showNotification('Basket created successfully!', 'success');
      state.basketStocks = []; // Clear stocks
      await loadDashboardData();
      setView('baskets');
    } else {
      showNotification(res?.error?.message || 'Failed to create basket', 'error');
    }
  } catch (err) {
    console.error('Create basket error:', err);
    showNotification('Failed to create basket. Please try again.', 'error');
  } finally {
    // Re-enable button
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-save mr-2"></i>Create Basket';
    }
  }
}

async function viewBasket(basketId) {
  const res = await api.get(`/baskets/${basketId}`);
  if (res?.success) {
    state.selectedBasket = res.data;
    state.currentView = 'basket-detail';
    renderApp();
  }
}

async function viewInvestment(investmentId) {
  const res = await api.get(`/investments/${investmentId}`);
  if (res?.success) {
    state.selectedInvestment = res.data;
    state.currentView = 'investment-detail';
    renderApp();
  }
}

function investInBasket(basketId) {
  document.getElementById('investBasketId').value = basketId;
  document.getElementById('investModal').classList.remove('hidden');
  document.getElementById('investModal').classList.add('flex');
}

function hideInvestModal() {
  document.getElementById('investModal').classList.add('hidden');
  document.getElementById('investModal').classList.remove('flex');
}

async function handleInvest(e) {
  e.preventDefault();
  
  const basketId = document.getElementById('investBasketId').value;
  const amount = parseFloat(document.getElementById('investAmount').value);
  const useDirectApi = document.getElementById('useDirectApi').checked;
  
  const res = await api.post(`/investments/buy/${basketId}`, {
    investment_amount: amount,
    use_direct_api: useDirectApi
  });
  
  if (res?.success) {
    hideInvestModal();
    if (res.data.investment_id) {
      showNotification(`Investment successful! ${res.data.orders_placed} orders placed.`, 'success');
      await loadDashboardData();
      viewInvestment(res.data.investment_id);
    } else if (res.data.kite_basket_url) {
      // External Kite execution
      showNotification('Redirecting to Zerodha...', 'info');
      // In a real app, you'd POST to the Kite URL
    }
  } else {
    showNotification(res?.error?.message || 'Investment failed', 'error');
  }
}

async function sellInvestment(investmentId) {
  if (!confirm('Are you sure you want to sell this investment?')) return;
  
  const res = await api.post(`/investments/${investmentId}/sell`, { percentage: 100, use_direct_api: true });
  if (res?.success) {
    showNotification(`Sell orders placed: ${res.data.orders_placed}`, 'success');
    await loadDashboardData();
    setView('investments');
  } else {
    showNotification(res?.error?.message || 'Failed to sell', 'error');
  }
}

async function rebalanceInvestment(investmentId) {
  const res = await api.post(`/investments/${investmentId}/rebalance`, { threshold: 5, use_direct_api: true });
  if (res?.success) {
    if (res.data.rebalanced === false) {
      showNotification('No rebalancing needed', 'info');
    } else {
      showNotification(`Rebalanced: ${res.data.orders_placed} orders placed`, 'success');
      await loadDashboardData();
    }
  } else {
    showNotification(res?.error?.message || 'Rebalance failed', 'error');
  }
}

async function deleteBasket(basketId) {
  if (!confirm('Are you sure you want to delete this basket?')) return;
  
  const res = await api.delete(`/baskets/${basketId}`);
  if (res?.success) {
    showNotification('Basket deleted', 'success');
    await loadDashboardData();
    renderApp();
  }
}

// Settings
function showSettingsModal() {
  document.getElementById('settingsModal').classList.remove('hidden');
  document.getElementById('settingsModal').classList.add('flex');
}

function hideSettingsModal() {
  document.getElementById('settingsModal').classList.add('hidden');
  document.getElementById('settingsModal').classList.remove('flex');
}

function updateSettingsBrokerForm() {
  const broker = document.querySelector('input[name="settings_broker"]:checked').value;
  const angeloneFields = document.getElementById('settingsAngeloneFields');
  const helpDiv = document.getElementById('settingsBrokerHelp');
  
  // Update visual selection
  document.querySelectorAll('.settings-broker-card').forEach(card => {
    card.classList.remove('border-indigo-500', 'bg-indigo-50');
    card.classList.add('border-gray-200');
  });
  document.querySelector('input[name="settings_broker"]:checked').nextElementSibling.classList.add('border-indigo-500', 'bg-indigo-50');
  document.querySelector('input[name="settings_broker"]:checked').nextElementSibling.classList.remove('border-gray-200');
  
  if (broker === 'zerodha') {
    angeloneFields.classList.add('hidden');
    helpDiv.innerHTML = '<i class="fas fa-info-circle mr-1"></i><a href="https://developers.kite.trade" target="_blank" class="underline">Get Zerodha API credentials</a>';
  } else {
    angeloneFields.classList.remove('hidden');
    helpDiv.innerHTML = '<i class="fas fa-info-circle mr-1"></i><a href="https://smartapi.angelbroking.com" target="_blank" class="underline">Get Angel One API credentials</a>';
  }
}

async function updateCredentials() {
  const broker = document.querySelector('input[name="settings_broker"]:checked').value;
  const apiKey = document.getElementById('settingsApiKey').value;
  const apiSecret = document.getElementById('settingsApiSecret').value;
  
  if (!apiKey || !apiSecret) {
    showNotification('Please fill in API Key and Secret', 'warning');
    return;
  }
  
  const payload = {
    broker_type: broker,
    api_key: apiKey,
    api_secret: apiSecret
  };
  
  if (broker === 'angelone') {
    const clientCode = document.getElementById('settingsClientCode').value;
    if (!clientCode) {
      showNotification('Client Code is required for Angel One', 'warning');
      return;
    }
    payload.client_code = clientCode;
    const mpin = document.getElementById('settingsMpin').value;
    if (mpin) payload.mpin = mpin;
  }
  
  const res = await api.post('/setup/configure', payload);
  
  if (res?.success) {
    showNotification('Credentials saved successfully!', 'success');
    hideSettingsModal();
  } else {
    showNotification(res?.error?.message || 'Save failed', 'error');
  }
}

// Add Account Modal functions
function showAddAccountModal() {
  document.getElementById('addAccountModal').classList.remove('hidden');
  document.getElementById('addAccountModal').classList.add('flex');
  updateAddAccountForm();
}

function hideAddAccountModal() {
  document.getElementById('addAccountModal').classList.add('hidden');
  document.getElementById('addAccountModal').classList.remove('flex');
}

function updateAddAccountForm() {
  const broker = document.querySelector('input[name="add_broker"]:checked').value;
  const angeloneFields = document.getElementById('addAccountAngeloneFields');
  const zerodhaFields = document.getElementById('zerodhaFields');
  const helpText = document.getElementById('addAccountHelpText');
  const submitBtn = document.getElementById('addAccountBtn');
  
  // Update visual selection
  document.querySelectorAll('.add-broker-card').forEach(card => {
    card.classList.remove('border-indigo-500', 'bg-indigo-50');
    card.classList.add('border-gray-200');
  });
  document.querySelector('input[name="add_broker"]:checked').nextElementSibling.classList.add('border-indigo-500', 'bg-indigo-50');
  document.querySelector('input[name="add_broker"]:checked').nextElementSibling.classList.remove('border-gray-200');
  
  if (broker === 'zerodha') {
    angeloneFields.classList.add('hidden');
    zerodhaFields.classList.remove('hidden');
    helpText.innerHTML = 'Get credentials from <a href="https://developers.kite.trade" target="_blank" class="underline font-medium">Kite Connect Portal</a>';
    submitBtn.innerHTML = '<i class="fas fa-plus mr-2"></i>Add Account & Login';
  } else {
    angeloneFields.classList.remove('hidden');
    zerodhaFields.classList.add('hidden');
    helpText.innerHTML = 'Login with your Angel One credentials. Get API key from <a href="https://smartapi.angelbroking.com" target="_blank" class="underline font-medium">Angel One Smart API</a>';
    submitBtn.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Login with TOTP';
  }
}

async function handleAddAccount(e) {
  e.preventDefault();
  
  const broker = document.querySelector('input[name="add_broker"]:checked').value;
  const btn = document.getElementById('addAccountBtn');
  
  // Handle Angel One TOTP login
  if (broker === 'angelone') {
    const clientCode = document.getElementById('addAccountClientCode').value;
    const mpin = document.getElementById('addAccountMpin').value;
    const totp = document.getElementById('addAccountTotp').value;
    
    if (!clientCode || !mpin || !totp) {
      showNotification('Please enter Client Code, MPIN, and TOTP', 'warning');
      return;
    }
    
    if (totp.length !== 6 || !/^\d{6}$/.test(totp)) {
      showNotification('TOTP must be a 6-digit number', 'warning');
      return;
    }
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Logging in...';
    
    try {
      const res = await api.post('/auth/angelone-login', {
        client_code: clientCode,
        mpin: mpin,
        totp: totp
      });
      
      if (res?.success) {
        // Store session and redirect
        localStorage.setItem('session_id', res.data.session_id);
        state.sessionId = res.data.session_id;
        showNotification(`Welcome, ${res.data.account.name}! Login successful.`, 'success');
        hideAddAccountModal();
        await loadDashboardData();
        renderApp();
      } else {
        showNotification(res?.error?.message || 'Login failed. Check your credentials and TOTP.', 'error');
        // Clear TOTP field for retry
        document.getElementById('addAccountTotp').value = '';
        document.getElementById('addAccountTotp').focus();
      }
    } catch (err) {
      console.error('Angel One login error:', err);
      showNotification('Login failed. Please try again.', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Login with TOTP';
    }
    return;
  }
  
  // Handle Zerodha OAuth login
  const name = document.getElementById('addAccountName').value;
  const useAppCreds = document.getElementById('addAccountUseAppCreds').checked;
  
  const payload = {
    name: name || 'Zerodha Account',
    broker_type: broker,
    use_app_credentials: useAppCreds
  };
  
  if (!useAppCreds) {
    const apiKey = document.getElementById('addAccountApiKey').value;
    const apiSecret = document.getElementById('addAccountApiSecret').value;
    
    if (apiKey) payload.kite_api_key = apiKey;
    if (apiSecret) payload.kite_api_secret = apiSecret;
  }
  
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Adding...';
  
  try {
    const res = await api.post('/setup/add-account', payload);
    
    if (res?.success) {
      hideAddAccountModal();
      if (res.data.login_url) {
        showNotification('Redirecting to Zerodha login...', 'info');
        window.location.href = res.data.login_url;
      } else {
        showNotification('Account added! Please configure login.', 'success');
        await loadDashboardData();
        renderApp();
      }
    } else {
      showNotification(res?.error?.message || 'Failed to add account', 'error');
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-plus mr-2"></i>Add Account & Login';
  }
}

async function downloadInstruments() {
  showNotification('Downloading instruments... This may take a minute.', 'info');
  
  const res = await api.post('/instruments/download');
  if (res?.success) {
    showNotification(`Downloaded ${res.data.downloaded} instruments!`, 'success');
    state.instrumentsStatus = await (await api.get('/instruments/status')).data;
    renderApp();
  } else {
    showNotification(res?.error?.message || 'Download failed', 'error');
  }
}

// Holdings tab
function showHoldingsTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('border-indigo-500', 'text-indigo-600');
    btn.classList.add('border-transparent', 'text-gray-500');
  });
  document.getElementById(`tab-${tab}`).classList.remove('border-transparent', 'text-gray-500');
  document.getElementById(`tab-${tab}`).classList.add('border-indigo-500', 'text-indigo-600');
  
  if (tab === 'portfolio') {
    document.getElementById('holdings-content').innerHTML = renderPortfolioHoldings();
  } else {
    refreshZerodhaHoldings();
  }
}

async function refreshZerodhaHoldings() {
  document.getElementById('holdings-content').innerHTML = `
    <div class="text-center py-8">
      <i class="fas fa-spinner fa-spin text-2xl text-indigo-600"></i>
      <p class="mt-2 text-gray-500">Fetching from Zerodha...</p>
    </div>
  `;
  
  const res = await api.get('/portfolio/zerodha-holdings');
  if (res?.success) {
    state.zerodhaHoldings = res.data.holdings;
    renderZerodhaHoldings(res.data);
  } else {
    document.getElementById('holdings-content').innerHTML = `
      <div class="text-center py-8 text-red-500">
        <i class="fas fa-exclamation-circle text-4xl mb-2"></i>
        <p>${res?.error?.message || 'Failed to fetch holdings'}</p>
      </div>
    `;
  }
}

function renderZerodhaHoldings(data) {
  const { holdings, summary } = data;
  
  document.getElementById('holdings-content').innerHTML = `
    <div class="space-y-6">
      <div class="grid grid-cols-3 gap-4">
        <div class="bg-gray-50 rounded-lg p-4">
          <p class="text-sm text-gray-500">Total Invested</p>
          <p class="text-xl font-bold">${formatCurrency(summary.total_invested)}</p>
        </div>
        <div class="bg-gray-50 rounded-lg p-4">
          <p class="text-sm text-gray-500">Current Value</p>
          <p class="text-xl font-bold">${formatCurrency(summary.total_current)}</p>
        </div>
        <div class="bg-gray-50 rounded-lg p-4">
          <p class="text-sm text-gray-500">Total P&L</p>
          <p class="text-xl font-bold ${summary.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}">
            ${summary.total_pnl >= 0 ? '+' : ''}${formatCurrency(summary.total_pnl)} (${summary.total_pnl_percentage?.toFixed(2)}%)
          </p>
        </div>
      </div>

      <table class="w-full">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Symbol</th>
            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg Price</th>
            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">LTP</th>
            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">P&L</th>
          </tr>
        </thead>
        <tbody class="divide-y">
          ${holdings.map(h => `
            <tr class="hover:bg-gray-50">
              <td class="px-4 py-3">
                <div>
                  <p class="font-medium">${h.tradingsymbol}</p>
                  <p class="text-xs text-gray-500">${h.exchange}</p>
                </div>
              </td>
              <td class="px-4 py-3 text-right">${h.quantity}</td>
              <td class="px-4 py-3 text-right">${formatCurrency(h.average_price)}</td>
              <td class="px-4 py-3 text-right">${formatCurrency(h.last_price)}</td>
              <td class="px-4 py-3 text-right">${formatCurrency(h.current_value)}</td>
              <td class="px-4 py-3 text-right">
                <span class="${h.pnl >= 0 ? 'text-green-600' : 'text-red-600'}">
                  ${h.pnl >= 0 ? '+' : ''}${formatCurrency(h.pnl)}
                  <br>
                  <span class="text-xs">${h.pnl_percentage?.toFixed(2)}%</span>
                </span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// SIP functions
function showCreateSIPModal() {
  document.getElementById('sipStartDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('sipModal').classList.remove('hidden');
  document.getElementById('sipModal').classList.add('flex');
}

function hideSIPModal() {
  document.getElementById('sipModal').classList.add('hidden');
  document.getElementById('sipModal').classList.remove('flex');
}

async function handleCreateSIP(e) {
  e.preventDefault();
  
  const res = await api.post('/sip', {
    basket_id: parseInt(document.getElementById('sipBasketId').value),
    amount: parseFloat(document.getElementById('sipAmount').value),
    frequency: document.getElementById('sipFrequency').value,
    start_date: document.getElementById('sipStartDate').value
  });
  
  if (res?.success) {
    showNotification('SIP created successfully!', 'success');
    hideSIPModal();
    await loadDashboardData();
    setView('sip');
  } else {
    showNotification(res?.error?.message || 'Failed to create SIP', 'error');
  }
}

async function executeSIP(sipId) {
  const res = await api.post(`/sip/${sipId}/execute`);
  if (res?.success) {
    showNotification('SIP execution initiated', 'success');
    // Now trigger the actual buy
    await api.post(`/investments/buy/${res.data.basket_id}`, {
      investment_amount: res.data.amount,
      use_direct_api: true
    });
    await loadDashboardData();
    renderApp();
  } else {
    showNotification(res?.error?.message || 'Failed to execute SIP', 'error');
  }
}

async function pauseSIP(sipId) {
  const res = await api.post(`/sip/${sipId}/pause`);
  if (res?.success) {
    showNotification('SIP paused', 'success');
    await loadDashboardData();
    renderApp();
  }
}

async function resumeSIP(sipId) {
  const res = await api.post(`/sip/${sipId}/resume`);
  if (res?.success) {
    showNotification('SIP resumed', 'success');
    await loadDashboardData();
    renderApp();
  }
}

async function deleteSIP(sipId) {
  if (!confirm('Are you sure you want to cancel this SIP?')) return;
  
  const res = await api.delete(`/sip/${sipId}`);
  if (res?.success) {
    showNotification('SIP cancelled', 'success');
    await loadDashboardData();
    renderApp();
  }
}

// Load templates
async function loadTemplates() {
  const res = await api.get('/baskets/templates');
  if (res?.success && res.data.length > 0) {
    document.getElementById('templatesGrid').innerHTML = res.data.map(t => `
      <div class="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition cursor-pointer" onclick="viewBasket(${t.id})">
        <div class="flex items-center justify-between mb-4">
          <span class="px-3 py-1 text-xs rounded-full ${getThemeClass(t.theme)}">${t.theme || 'General'}</span>
          <span class="text-sm text-gray-500">${t.stock_count || 0} stocks</span>
        </div>
        <h3 class="text-lg font-semibold mb-2">${t.name}</h3>
        <p class="text-gray-600 text-sm mb-4 line-clamp-2">${t.description || ''}</p>
        <div class="flex items-center justify-between">
          <span class="text-xs text-gray-400">${t.clone_count || 0} clones</span>
          <button onclick="event.stopPropagation(); cloneBasket(${t.id})" class="text-indigo-600 hover:text-indigo-800 text-sm font-medium">
            Clone <i class="fas fa-copy ml-1"></i>
          </button>
        </div>
      </div>
    `).join('');
  }
}

async function cloneBasket(basketId) {
  const res = await api.post(`/baskets/${basketId}/clone`, {});
  if (res?.success) {
    showNotification('Basket cloned successfully!', 'success');
    await loadDashboardData();
    viewBasket(res.data.basket_id);
  } else {
    showNotification(res?.error?.message || 'Clone failed', 'error');
  }
}

// Load orders
async function loadOrders() {
  const res = await api.get('/portfolio/orders');
  if (res?.success) {
    const orders = res.data || [];
    document.getElementById('ordersContent').innerHTML = orders.length === 0 ? `
      <div class="text-center py-8 text-gray-500">
        <i class="fas fa-receipt text-4xl mb-2 opacity-50"></i>
        <p>No orders today</p>
      </div>
    ` : `
      <table class="w-full">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Symbol</th>
            <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Type</th>
            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Price</th>
            <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
          </tr>
        </thead>
        <tbody class="divide-y">
          ${orders.map(o => `
            <tr class="hover:bg-gray-50">
              <td class="px-4 py-3 font-medium">${o.tradingsymbol}</td>
              <td class="px-4 py-3 text-center">
                <span class="${o.transaction_type === 'BUY' ? 'text-green-600' : 'text-red-600'}">${o.transaction_type}</span>
              </td>
              <td class="px-4 py-3 text-right">${o.quantity}</td>
              <td class="px-4 py-3 text-right">${formatCurrency(o.price || o.average_price)}</td>
              <td class="px-4 py-3 text-center">
                <span class="px-2 py-1 text-xs rounded-full ${
                  o.status === 'COMPLETE' ? 'bg-green-100 text-green-800' :
                  o.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                  'bg-yellow-100 text-yellow-800'
                }">${o.status}</span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }
}

function attachEventListeners() {
  // Close modals on outside click
  document.querySelectorAll('.fixed').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      }
    });
  });
}

// Basket detail view
function renderBasketDetail() {
  const basket = state.selectedBasket;
  if (!basket) return '<p>Loading...</p>';
  
  // Calculate minimum investment
  let minInvestment = basket.min_investment_calculated || 0;
  if (!minInvestment && basket.stocks) {
    basket.stocks.forEach(stock => {
      if (stock.last_price && stock.weight_percentage > 0) {
        const minForStock = stock.last_price / (stock.weight_percentage / 100);
        if (minForStock > minInvestment) {
          minInvestment = minForStock;
        }
      }
    });
    minInvestment = Math.ceil(minInvestment / 100) * 100;
  }
  
  // Calculate shares for each stock based on min investment
  const stocksWithShares = (basket.stocks || []).map(stock => {
    let shares = 0;
    if (stock.last_price && stock.weight_percentage && minInvestment > 0) {
      const amountForStock = minInvestment * (stock.weight_percentage / 100);
      shares = Math.floor(amountForStock / stock.last_price);
    }
    return { ...stock, calculated_shares: shares };
  });
  
  return `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-4">
          <button onclick="setView('baskets')" class="text-gray-500 hover:text-gray-700">
            <i class="fas fa-arrow-left text-xl"></i>
          </button>
          <div>
            <h1 class="text-2xl font-bold text-gray-900">${basket.name}</h1>
            <p class="text-gray-500">${basket.description || ''}</p>
          </div>
        </div>
        <div class="flex items-center space-x-4">
          <button onclick="refreshBasketPrices(${basket.id})" class="text-gray-500 hover:text-gray-700" title="Refresh prices">
            <i class="fas fa-sync-alt"></i>
          </button>
          <button onclick="investInBasket(${basket.id})" class="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700">
            <i class="fas fa-shopping-cart mr-2"></i>Invest
          </button>
        </div>
      </div>

      <!-- Summary Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="bg-white rounded-xl p-4 shadow-sm">
          <p class="text-sm text-gray-500">Stocks</p>
          <p class="text-2xl font-bold">${basket.stocks?.length || 0}</p>
        </div>
        <div class="bg-white rounded-xl p-4 shadow-sm">
          <p class="text-sm text-gray-500">Theme</p>
          <p class="text-2xl font-bold">${basket.theme || 'Custom'}</p>
        </div>
        <div class="bg-white rounded-xl p-4 shadow-sm">
          <p class="text-sm text-gray-500">Min Investment</p>
          <p class="text-2xl font-bold text-indigo-600">${minInvestment > 0 ? formatCurrency(minInvestment) : 'N/A'}</p>
          <p class="text-xs text-gray-400">Based on current LTP</p>
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-sm">
        <div class="p-4 border-b flex justify-between items-center">
          <h2 class="font-semibold">Stocks (${basket.stocks?.length || 0})</h2>
          <span class="text-sm text-gray-500">
            ${basket.stocks?.some(s => s.last_price) ? 'Prices as of ' + new Date().toLocaleTimeString() : 'Prices not available - Login to fetch LTP'}
          </span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Symbol</th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Weight</th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">LTP (₹)</th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Shares</th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Value (₹)</th>
              </tr>
            </thead>
            <tbody class="divide-y">
              ${stocksWithShares.map(stock => {
                const value = stock.last_price && stock.calculated_shares ? stock.last_price * stock.calculated_shares : 0;
                return `
                  <tr class="hover:bg-gray-50">
                    <td class="px-4 py-4">
                      <p class="font-medium text-indigo-600">${stock.trading_symbol}</p>
                      <p class="text-xs text-gray-500">${stock.company_name || ''} • ${stock.exchange}</p>
                    </td>
                    <td class="px-4 py-4 text-right font-medium">${stock.weight_percentage?.toFixed(2)}%</td>
                    <td class="px-4 py-4 text-right">${stock.last_price ? formatNumber(stock.last_price, 2) : '<span class="text-gray-400">-</span>'}</td>
                    <td class="px-4 py-4 text-right font-medium">${stock.calculated_shares || '<span class="text-gray-400">-</span>'}</td>
                    <td class="px-4 py-4 text-right">${value > 0 ? formatCurrency(value) : '<span class="text-gray-400">-</span>'}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
            <tfoot class="bg-gray-50 font-medium">
              <tr>
                <td class="px-4 py-3">Total</td>
                <td class="px-4 py-3 text-right">100%</td>
                <td class="px-4 py-3 text-right"></td>
                <td class="px-4 py-3 text-right">${stocksWithShares.reduce((sum, s) => sum + (s.calculated_shares || 0), 0)}</td>
                <td class="px-4 py-3 text-right">${formatCurrency(minInvestment)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  `;
}

// Refresh basket prices
async function refreshBasketPrices(basketId) {
  showNotification('Refreshing prices...', 'info');
  const res = await api.get(`/baskets/${basketId}`);
  if (res?.success) {
    state.selectedBasket = res.data;
    renderApp();
    if (res.data.stocks?.some(s => s.last_price)) {
      showNotification('Prices updated!', 'success');
    } else {
      showNotification('Could not fetch LTP. Make sure you are logged in.', 'warning');
    }
  } else {
    showNotification('Failed to refresh prices', 'error');
  }
}

function renderInvestmentDetail() {
  const inv = state.selectedInvestment;
  if (!inv) return '<p>Loading...</p>';
  
  const pnl = (inv.current_value || inv.invested_amount) - inv.invested_amount;
  const pnlPct = inv.invested_amount > 0 ? ((pnl / inv.invested_amount) * 100).toFixed(2) : 0;
  
  return `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-4">
          <button onclick="setView('investments')" class="text-gray-500 hover:text-gray-700">
            <i class="fas fa-arrow-left"></i>
          </button>
          <div>
            <h1 class="text-2xl font-bold text-gray-900">${inv.basket_name}</h1>
            <p class="text-gray-500">Invested on ${new Date(inv.invested_at).toLocaleDateString()}</p>
          </div>
        </div>
        <div class="flex space-x-2">
          <button onclick="rebalanceInvestment(${inv.id})" class="border border-indigo-600 text-indigo-600 px-4 py-2 rounded-lg hover:bg-indigo-50">
            <i class="fas fa-sync-alt mr-2"></i>Rebalance
          </button>
          <button onclick="sellInvestment(${inv.id})" class="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700">
            <i class="fas fa-sign-out-alt mr-2"></i>Sell
          </button>
        </div>
      </div>

      <div class="grid grid-cols-4 gap-4">
        <div class="bg-white rounded-xl p-4 shadow-sm">
          <p class="text-sm text-gray-500">Invested</p>
          <p class="text-xl font-bold">${formatCurrency(inv.invested_amount)}</p>
        </div>
        <div class="bg-white rounded-xl p-4 shadow-sm">
          <p class="text-sm text-gray-500">Current Value</p>
          <p class="text-xl font-bold">${formatCurrency(inv.current_value)}</p>
        </div>
        <div class="bg-white rounded-xl p-4 shadow-sm">
          <p class="text-sm text-gray-500">P&L</p>
          <p class="text-xl font-bold ${pnl >= 0 ? 'text-green-600' : 'text-red-600'}">
            ${pnl >= 0 ? '+' : ''}${formatCurrency(pnl)}
          </p>
        </div>
        <div class="bg-white rounded-xl p-4 shadow-sm">
          <p class="text-sm text-gray-500">Returns</p>
          <p class="text-xl font-bold ${pnl >= 0 ? 'text-green-600' : 'text-red-600'}">
            ${pnl >= 0 ? '+' : ''}${pnlPct}%
          </p>
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-sm p-6">
        <h2 class="font-semibold mb-4">Holdings</h2>
        <table class="w-full">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Symbol</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg Price</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">LTP</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">P&L</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Weight</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            ${(inv.holdings || []).map(h => {
              const value = h.quantity * (h.current_price || h.average_price);
              const hPnl = value - (h.quantity * h.average_price);
              return `
                <tr class="hover:bg-gray-50">
                  <td class="px-4 py-3 font-medium">${h.trading_symbol}</td>
                  <td class="px-4 py-3 text-right">${h.quantity}</td>
                  <td class="px-4 py-3 text-right">${formatCurrency(h.average_price)}</td>
                  <td class="px-4 py-3 text-right">${formatCurrency(h.current_price)}</td>
                  <td class="px-4 py-3 text-right">${formatCurrency(value)}</td>
                  <td class="px-4 py-3 text-right">
                    <span class="${hPnl >= 0 ? 'text-green-600' : 'text-red-600'}">
                      ${hPnl >= 0 ? '+' : ''}${formatCurrency(hPnl)}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-right">
                    <div class="flex items-center justify-end space-x-2">
                      <span class="text-gray-500">${h.target_weight?.toFixed(1)}%</span>
                      <span class="${Math.abs(h.actual_weight - h.target_weight) > 5 ? 'text-orange-600' : 'text-green-600'}">
                        → ${h.actual_weight?.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// Initialize
initApp();
