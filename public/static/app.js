/**
 * StockBasket Frontend Application
 * Comprehensive dashboard for managing stock baskets
 */

// State management
const state = {
  sessionId: null,
  account: null,
  accounts: [],
  baskets: [],
  investments: [],
  alerts: [],
  sips: [],
  currentView: 'dashboard',
  selectedBasket: null,
  selectedInvestment: null,
  loading: true
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
  // Get session from URL or localStorage
  const urlParams = new URLSearchParams(window.location.search);
  state.sessionId = urlParams.get('session_id') || localStorage.getItem('session_id');
  
  if (state.sessionId) {
    localStorage.setItem('session_id', state.sessionId);
    // Clean URL
    if (urlParams.get('session_id')) {
      window.history.replaceState({}, document.title, '/dashboard');
    }
  }

  // Check auth status
  const authRes = await api.get('/auth/status');
  
  if (authRes?.success && authRes.data.authenticated) {
    state.account = authRes.data.account;
    await loadDashboardData();
    renderApp();
  } else {
    // Redirect to home for login
    window.location.href = '/?error=please_login';
  }
}

// Load all dashboard data
async function loadDashboardData() {
  state.loading = true;
  renderLoading();

  try {
    const [basketsRes, investmentsRes, alertsRes, sipRes, accountsRes] = await Promise.all([
      api.get('/baskets'),
      api.get('/investments'),
      api.get('/alerts'),
      api.get('/sip'),
      api.get('/auth/accounts')
    ]);

    state.baskets = basketsRes?.success ? basketsRes.data : [];
    state.investments = investmentsRes?.success ? investmentsRes.data : [];
    state.alerts = alertsRes?.success ? alertsRes.data : [];
    state.sips = sipRes?.success ? sipRes.data : [];
    state.accounts = accountsRes?.success ? accountsRes.data : [];
  } catch (error) {
    console.error('Failed to load data:', error);
  }

  state.loading = false;
}

// Render functions
function renderApp() {
  const app = document.getElementById('app');
  app.innerHTML = `
    ${renderNav()}
    <div class="flex">
      ${renderSidebar()}
      <main class="flex-1 p-6">
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
  return `
    <nav class="bg-white shadow-sm sticky top-0 z-40">
      <div class="max-w-full mx-auto px-4">
        <div class="flex justify-between h-16 items-center">
          <div class="flex items-center space-x-4">
            <a href="/" class="flex items-center space-x-2">
              <i class="fas fa-layer-group text-2xl text-indigo-600"></i>
              <span class="text-xl font-bold text-gray-900">StockBasket</span>
            </a>
          </div>
          
          <div class="flex items-center space-x-4">
            <!-- Account Switcher -->
            <div class="relative group">
              <button class="flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-gray-100">
                <i class="fas fa-user-circle text-gray-500"></i>
                <span class="text-sm font-medium text-gray-700">${state.account?.name || 'Account'}</span>
                <i class="fas fa-chevron-down text-xs text-gray-400"></i>
              </button>
              <div class="hidden group-hover:block absolute right-0 mt-1 w-64 bg-white rounded-lg shadow-lg border py-1 z-50">
                ${state.accounts.map(acc => `
                  <button onclick="switchAccount(${acc.id})" class="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-3 ${acc.id === state.account?.id ? 'bg-indigo-50' : ''}">
                    <i class="fas fa-user text-gray-400"></i>
                    <div class="flex-1">
                      <p class="text-sm font-medium">${acc.name}</p>
                      <p class="text-xs text-gray-500">${acc.zerodha_user_id}</p>
                    </div>
                    ${acc.id === state.account?.id ? '<i class="fas fa-check text-indigo-600"></i>' : ''}
                  </button>
                `).join('')}
                <div class="border-t my-1"></div>
                <button onclick="addNewAccount()" class="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-3 text-indigo-600">
                  <i class="fas fa-plus"></i>
                  <span class="text-sm">Add Another Account</span>
                </button>
              </div>
            </div>
            
            <button onclick="handleLogout()" class="text-gray-500 hover:text-gray-700">
              <i class="fas fa-sign-out-alt"></i>
            </button>
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
    { id: 'explore', icon: 'fa-compass', label: 'Explore' },
    { id: 'sip', icon: 'fa-calendar-check', label: 'SIP' },
    { id: 'alerts', icon: 'fa-bell', label: 'Alerts' },
    { id: 'performance', icon: 'fa-chart-line', label: 'Performance' }
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
            ${item.id === 'alerts' && state.alerts.filter(a => !a.is_read).length > 0 ? 
              `<span class="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">${state.alerts.filter(a => !a.is_read).length}</span>` : ''
            }
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
    case 'explore': return renderExplore();
    case 'sip': return renderSIP();
    case 'alerts': return renderAlerts();
    case 'performance': return renderPerformance();
    case 'basket-detail': return renderBasketDetail();
    case 'investment-detail': return renderInvestmentDetail();
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
        <button onclick="showCreateBasketModal()" class="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center space-x-2">
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
        <!-- My Baskets -->
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
                <button onclick="showCreateBasketModal()" class="mt-3 text-indigo-600 hover:underline">Create your first basket</button>
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

        <!-- Active Investments -->
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
                <button onclick="setView('explore')" class="mt-3 text-indigo-600 hover:underline">Explore baskets to invest</button>
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

      <!-- Alerts Preview -->
      ${state.alerts.filter(a => a.is_active && !a.is_triggered).length > 0 ? `
        <div class="bg-white rounded-xl shadow-sm p-6">
          <h2 class="font-semibold text-gray-900 mb-4">Active Alerts</h2>
          <div class="space-y-2">
            ${state.alerts.filter(a => a.is_active).slice(0, 3).map(alert => `
              <div class="flex items-center justify-between p-3 rounded-lg ${alert.is_triggered ? 'bg-yellow-50' : 'bg-gray-50'}">
                <div class="flex items-center space-x-3">
                  <i class="fas fa-bell ${alert.is_triggered ? 'text-yellow-500' : 'text-gray-400'}"></i>
                  <div>
                    <p class="text-sm font-medium">${alert.trading_symbol || 'Portfolio Alert'}</p>
                    <p class="text-xs text-gray-500">${alert.condition} ${alert.threshold_value}</p>
                  </div>
                </div>
                <span class="text-xs px-2 py-1 rounded-full ${alert.is_triggered ? 'bg-yellow-200 text-yellow-800' : 'bg-gray-200 text-gray-600'}">
                  ${alert.is_triggered ? 'Triggered' : 'Active'}
                </span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderBaskets() {
  return `
    <div class="space-y-6">
      <div class="flex justify-between items-center">
        <h1 class="text-2xl font-bold text-gray-900">My Baskets</h1>
        <button onclick="showCreateBasketModal()" class="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center space-x-2">
          <i class="fas fa-plus"></i>
          <span>Create Basket</span>
        </button>
      </div>

      ${state.baskets.length === 0 ? `
        <div class="text-center py-16 bg-white rounded-xl">
          <i class="fas fa-boxes text-6xl text-gray-300 mb-4"></i>
          <h3 class="text-xl font-medium text-gray-600 mb-2">No baskets yet</h3>
          <p class="text-gray-500 mb-6">Create your first stock basket or explore templates</p>
          <div class="flex justify-center space-x-4">
            <button onclick="showCreateBasketModal()" class="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700">
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
                  ${basket.is_public ? '<i class="fas fa-globe text-gray-400" title="Public"></i>' : '<i class="fas fa-lock text-gray-400" title="Private"></i>'}
                </div>
                <h3 class="text-lg font-semibold text-gray-900 mb-2">${basket.name}</h3>
                <p class="text-sm text-gray-500 line-clamp-2 mb-4">${basket.description || 'No description'}</p>
                <div class="flex justify-between items-center text-sm">
                  <span class="text-gray-500">${basket.stock_count || 0} stocks</span>
                  <span class="text-gray-500">Min: ${formatCurrency(basket.min_investment || 0)}</span>
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
                  <button onclick="event.stopPropagation(); confirmDeleteBasket(${basket.id})" class="text-gray-400 hover:text-red-600">
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
        <button onclick="setView('explore')" class="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
          <i class="fas fa-plus mr-2"></i>New Investment
        </button>
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
            <tbody class="divide-y divide-gray-100">
              ${state.investments.map(inv => {
                const currentValue = inv.current_value || inv.invested_amount;
                const pnl = currentValue - inv.invested_amount;
                const pnlPct = ((pnl / inv.invested_amount) * 100).toFixed(2);
                return `
                  <tr class="hover:bg-gray-50 cursor-pointer" onclick="viewInvestment(${inv.id})">
                    <td class="px-6 py-4">
                      <div class="flex items-center">
                        <div>
                          <p class="font-medium text-gray-900">${inv.basket_name}</p>
                          <p class="text-sm text-gray-500">${inv.basket_theme || 'Custom'}</p>
                        </div>
                      </div>
                    </td>
                    <td class="px-6 py-4 text-right">${formatCurrency(inv.invested_amount)}</td>
                    <td class="px-6 py-4 text-right">${formatCurrency(currentValue)}</td>
                    <td class="px-6 py-4 text-right">
                      <span class="${pnl >= 0 ? 'text-green-600' : 'text-red-600'}">
                        ${pnl >= 0 ? '+' : ''}${formatCurrency(pnl)}
                        <br><span class="text-xs">(${pnl >= 0 ? '+' : ''}${pnlPct}%)</span>
                      </span>
                    </td>
                    <td class="px-6 py-4 text-right">
                      <div class="flex justify-end space-x-2">
                        <button onclick="event.stopPropagation(); rebalanceInvestment(${inv.id})" class="text-indigo-600 hover:text-indigo-800 p-2" title="Rebalance">
                          <i class="fas fa-sync-alt"></i>
                        </button>
                        <button onclick="event.stopPropagation(); sellInvestment(${inv.id})" class="text-red-600 hover:text-red-800 p-2" title="Sell">
                          <i class="fas fa-sign-out-alt"></i>
                        </button>
                      </div>
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
      <div class="flex justify-between items-center">
        <h1 class="text-2xl font-bold text-gray-900">Explore Baskets</h1>
      </div>

      <!-- Templates Section -->
      <div>
        <h2 class="text-lg font-semibold text-gray-800 mb-4">Pre-built Templates</h2>
        <div id="templatesGrid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div class="animate-pulse bg-white rounded-xl p-6 h-48"></div>
          <div class="animate-pulse bg-white rounded-xl p-6 h-48"></div>
          <div class="animate-pulse bg-white rounded-xl p-6 h-48"></div>
          <div class="animate-pulse bg-white rounded-xl p-6 h-48"></div>
        </div>
      </div>

      <!-- Public Baskets Section -->
      <div>
        <h2 class="text-lg font-semibold text-gray-800 mb-4">Community Baskets</h2>
        <div id="publicBasketsGrid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div class="animate-pulse bg-white rounded-xl p-6 h-48"></div>
          <div class="animate-pulse bg-white rounded-xl p-6 h-48"></div>
        </div>
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
          <h3 class="text-xl font-medium text-gray-600 mb-2">No SIPs active</h3>
          <p class="text-gray-500 mb-6">Set up systematic investment plans for your baskets</p>
          <button onclick="showCreateSIPModal()" class="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700">
            <i class="fas fa-plus mr-2"></i>Create SIP
          </button>
        </div>
      ` : `
        <div class="grid gap-6">
          ${state.sips.map(sip => `
            <div class="bg-white rounded-xl shadow-sm p-6">
              <div class="flex justify-between items-start">
                <div>
                  <h3 class="text-lg font-semibold">${sip.basket_name || 'Basket #' + sip.basket_id}</h3>
                  <p class="text-gray-500 text-sm capitalize">${sip.frequency} SIP</p>
                </div>
                <span class="px-3 py-1 rounded-full text-sm ${sip.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
                  ${sip.status}
                </span>
              </div>
              <div class="mt-4 grid grid-cols-3 gap-4">
                <div>
                  <p class="text-sm text-gray-500">Amount</p>
                  <p class="font-semibold">${formatCurrency(sip.amount)}</p>
                </div>
                <div>
                  <p class="text-sm text-gray-500">Next Date</p>
                  <p class="font-semibold">${sip.next_execution_date || 'N/A'}</p>
                </div>
                <div>
                  <p class="text-sm text-gray-500">Total Invested</p>
                  <p class="font-semibold">${formatCurrency(sip.total_invested)}</p>
                </div>
              </div>
              <div class="mt-4 flex space-x-3">
                ${sip.status === 'ACTIVE' ? `
                  <button onclick="pauseSIP(${sip.id})" class="text-yellow-600 hover:text-yellow-800">
                    <i class="fas fa-pause mr-1"></i>Pause
                  </button>
                ` : sip.status === 'PAUSED' ? `
                  <button onclick="resumeSIP(${sip.id})" class="text-green-600 hover:text-green-800">
                    <i class="fas fa-play mr-1"></i>Resume
                  </button>
                ` : ''}
                <button onclick="cancelSIP(${sip.id})" class="text-red-600 hover:text-red-800">
                  <i class="fas fa-times mr-1"></i>Cancel
                </button>
              </div>
            </div>
          `).join('')}
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

      ${state.alerts.length === 0 ? `
        <div class="text-center py-16 bg-white rounded-xl">
          <i class="fas fa-bell text-6xl text-gray-300 mb-4"></i>
          <h3 class="text-xl font-medium text-gray-600 mb-2">No alerts configured</h3>
          <p class="text-gray-500 mb-6">Set up price and rebalance alerts</p>
          <button onclick="showCreateAlertModal()" class="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700">
            <i class="fas fa-plus mr-2"></i>Create Alert
          </button>
        </div>
      ` : `
        <div class="space-y-4">
          ${state.alerts.map(alert => `
            <div class="bg-white rounded-xl shadow-sm p-6 flex items-center justify-between">
              <div class="flex items-center space-x-4">
                <div class="w-10 h-10 rounded-full ${alert.is_triggered ? 'bg-yellow-100' : 'bg-gray-100'} flex items-center justify-center">
                  <i class="fas fa-bell ${alert.is_triggered ? 'text-yellow-600' : 'text-gray-500'}"></i>
                </div>
                <div>
                  <p class="font-medium">${alert.trading_symbol || alert.alert_type} Alert</p>
                  <p class="text-sm text-gray-500">${alert.condition} ${alert.threshold_value}</p>
                </div>
              </div>
              <div class="flex items-center space-x-4">
                <span class="px-3 py-1 rounded-full text-sm ${alert.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
                  ${alert.is_active ? 'Active' : 'Paused'}
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
  `;
}

function renderPerformance() {
  return `
    <div class="space-y-6">
      <h1 class="text-2xl font-bold text-gray-900">Performance</h1>
      
      <div class="bg-white rounded-xl shadow-sm p-6">
        <h2 class="font-semibold mb-4">Portfolio Performance vs Benchmarks</h2>
        <canvas id="performanceChart" height="300"></canvas>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="bg-white rounded-xl shadow-sm p-6">
          <h3 class="font-semibold mb-4">Sector Allocation</h3>
          <canvas id="sectorChart" height="250"></canvas>
        </div>
        <div class="bg-white rounded-xl shadow-sm p-6">
          <h3 class="font-semibold mb-4">Top Holdings</h3>
          <div class="space-y-3" id="topHoldings">
            <p class="text-gray-500 text-center">Loading holdings...</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderBasketDetail() {
  const basket = state.selectedBasket;
  if (!basket) return '<p>Loading...</p>';

  return `
    <div class="space-y-6">
      <div class="flex items-center space-x-4">
        <button onclick="setView('baskets')" class="text-gray-500 hover:text-gray-700">
          <i class="fas fa-arrow-left"></i>
        </button>
        <h1 class="text-2xl font-bold text-gray-900">${basket.name}</h1>
        <span class="px-3 py-1 text-sm rounded-full ${getThemeClass(basket.theme)}">${basket.theme || 'Custom'}</span>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 space-y-6">
          <!-- Basket Info -->
          <div class="bg-white rounded-xl shadow-sm p-6">
            <p class="text-gray-600 mb-4">${basket.description || 'No description'}</p>
            <div class="grid grid-cols-3 gap-4">
              <div>
                <p class="text-sm text-gray-500">Min Investment</p>
                <p class="font-semibold">${formatCurrency(basket.min_investment_calculated || basket.min_investment || 0)}</p>
              </div>
              <div>
                <p class="text-sm text-gray-500">Risk Level</p>
                <p class="font-semibold capitalize">${basket.risk_level}</p>
              </div>
              <div>
                <p class="text-sm text-gray-500">Benchmark</p>
                <p class="font-semibold">${basket.benchmark_symbol || 'NIFTY 50'}</p>
              </div>
            </div>
          </div>

          <!-- Stocks -->
          <div class="bg-white rounded-xl shadow-sm overflow-hidden">
            <div class="p-6 border-b">
              <h2 class="font-semibold">Stocks (${basket.stocks?.length || 0})</h2>
            </div>
            <table class="w-full">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                  <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Weight</th>
                  <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">LTP</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                ${(basket.stocks || []).map(stock => `
                  <tr class="hover:bg-gray-50">
                    <td class="px-6 py-4">
                      <p class="font-medium">${stock.trading_symbol}</p>
                      <p class="text-sm text-gray-500">${stock.company_name || stock.exchange}</p>
                    </td>
                    <td class="px-6 py-4 text-right">
                      <div class="flex items-center justify-end space-x-2">
                        <div class="w-24 bg-gray-200 rounded-full h-2">
                          <div class="bg-indigo-600 h-2 rounded-full" style="width: ${stock.weight_percentage}%"></div>
                        </div>
                        <span>${stock.weight_percentage}%</span>
                      </div>
                    </td>
                    <td class="px-6 py-4 text-right">${stock.last_price ? formatCurrency(stock.last_price) : '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Sidebar -->
        <div class="space-y-6">
          <div class="bg-white rounded-xl shadow-sm p-6">
            <h3 class="font-semibold mb-4">Invest in this Basket</h3>
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Investment Amount (₹)</label>
                <input type="number" id="investAmount" min="${basket.min_investment_calculated || 1000}" step="100" 
                  value="${basket.min_investment_calculated || 10000}"
                  class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
              </div>
              <button onclick="buyBasket(${basket.id})" class="w-full bg-indigo-600 text-white py-3 rounded-lg hover:bg-indigo-700 font-medium">
                <i class="fas fa-shopping-cart mr-2"></i>Buy Basket
              </button>
              <button onclick="showCreateSIPModal(${basket.id})" class="w-full border border-indigo-600 text-indigo-600 py-3 rounded-lg hover:bg-indigo-50 font-medium">
                <i class="fas fa-sync-alt mr-2"></i>Start SIP
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderInvestmentDetail() {
  const inv = state.selectedInvestment;
  if (!inv) return '<p>Loading...</p>';

  const pnl = (inv.current_value || inv.invested_amount) - inv.invested_amount;
  const pnlPct = ((pnl / inv.invested_amount) * 100).toFixed(2);

  return `
    <div class="space-y-6">
      <div class="flex items-center space-x-4">
        <button onclick="setView('investments')" class="text-gray-500 hover:text-gray-700">
          <i class="fas fa-arrow-left"></i>
        </button>
        <h1 class="text-2xl font-bold text-gray-900">${inv.basket_name}</h1>
      </div>

      <!-- Summary Cards -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="bg-white rounded-xl p-6 shadow-sm">
          <p class="text-sm text-gray-500">Invested</p>
          <p class="text-xl font-bold">${formatCurrency(inv.invested_amount)}</p>
        </div>
        <div class="bg-white rounded-xl p-6 shadow-sm">
          <p class="text-sm text-gray-500">Current Value</p>
          <p class="text-xl font-bold">${formatCurrency(inv.current_value || inv.invested_amount)}</p>
        </div>
        <div class="bg-white rounded-xl p-6 shadow-sm">
          <p class="text-sm text-gray-500">P&L</p>
          <p class="text-xl font-bold ${pnl >= 0 ? 'text-green-600' : 'text-red-600'}">${pnl >= 0 ? '+' : ''}${formatCurrency(pnl)}</p>
          <p class="text-sm ${pnl >= 0 ? 'text-green-600' : 'text-red-600'}">${pnl >= 0 ? '+' : ''}${pnlPct}%</p>
        </div>
        <div class="bg-white rounded-xl p-6 shadow-sm flex flex-col justify-center">
          <div class="flex space-x-2">
            <button onclick="rebalanceInvestment(${inv.id})" class="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 text-sm">
              <i class="fas fa-sync-alt mr-1"></i>Rebalance
            </button>
            <button onclick="sellInvestment(${inv.id})" class="flex-1 bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 text-sm">
              <i class="fas fa-sign-out-alt mr-1"></i>Sell
            </button>
          </div>
        </div>
      </div>

      <!-- Holdings Table -->
      <div class="bg-white rounded-xl shadow-sm overflow-hidden">
        <div class="p-6 border-b">
          <h2 class="font-semibold">Holdings</h2>
        </div>
        <table class="w-full">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
              <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
              <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg Price</th>
              <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">LTP</th>
              <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
              <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">P&L</th>
              <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Weight</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            ${(inv.holdings || []).map(h => {
              const value = h.quantity * (h.current_price || h.average_price);
              const hPnl = h.pnl || (value - h.quantity * h.average_price);
              return `
                <tr class="hover:bg-gray-50">
                  <td class="px-6 py-4 font-medium">${h.trading_symbol}</td>
                  <td class="px-6 py-4 text-right">${h.quantity}</td>
                  <td class="px-6 py-4 text-right">${formatCurrency(h.average_price)}</td>
                  <td class="px-6 py-4 text-right">${formatCurrency(h.current_price || h.average_price)}</td>
                  <td class="px-6 py-4 text-right">${formatCurrency(value)}</td>
                  <td class="px-6 py-4 text-right ${hPnl >= 0 ? 'text-green-600' : 'text-red-600'}">
                    ${hPnl >= 0 ? '+' : ''}${formatCurrency(hPnl)}
                  </td>
                  <td class="px-6 py-4 text-right">${(h.actual_weight || 0).toFixed(1)}%</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// Modals
function renderModals() {
  return `
    <!-- Create Basket Modal -->
    <div id="createBasketModal" class="fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50">
      <div class="bg-white rounded-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div class="p-6 border-b flex justify-between items-center sticky top-0 bg-white">
          <h3 class="text-xl font-bold">Create New Basket</h3>
          <button onclick="hideModal('createBasketModal')" class="text-gray-400 hover:text-gray-600">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <form id="createBasketForm" onsubmit="handleCreateBasket(event)" class="p-6 space-y-6">
          <div class="grid grid-cols-2 gap-4">
            <div class="col-span-2">
              <label class="block text-sm font-medium text-gray-700 mb-1">Basket Name *</label>
              <input type="text" name="name" required class="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder="My Stock Basket">
            </div>
            <div class="col-span-2">
              <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea name="description" rows="2" class="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder="What's this basket about?"></textarea>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Theme</label>
              <select name="theme" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                <option value="">Select Theme</option>
                <option value="Technology">Technology</option>
                <option value="Banking">Banking</option>
                <option value="Healthcare">Healthcare</option>
                <option value="Consumer">Consumer</option>
                <option value="Automobile">Automobile</option>
                <option value="Index">Index</option>
                <option value="Dividend">Dividend</option>
                <option value="Growth">Growth</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Risk Level</label>
              <select name="risk_level" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                <option value="moderate">Moderate</option>
                <option value="low">Low</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          <div>
            <div class="flex justify-between items-center mb-2">
              <label class="block text-sm font-medium text-gray-700">Stocks *</label>
              <span class="text-sm text-gray-500">Total: <span id="totalWeight">0</span>%</span>
            </div>
            <div id="stocksList" class="space-y-2"></div>
            <button type="button" onclick="addStockRow()" class="mt-3 text-indigo-600 hover:text-indigo-800 text-sm">
              <i class="fas fa-plus mr-1"></i>Add Stock
            </button>
          </div>

          <div class="flex items-center">
            <input type="checkbox" name="is_public" id="isPublic" class="mr-2">
            <label for="isPublic" class="text-sm text-gray-600">Make this basket public</label>
          </div>

          <div class="flex space-x-4">
            <button type="button" onclick="hideModal('createBasketModal')" class="flex-1 border border-gray-300 py-3 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" class="flex-1 bg-indigo-600 text-white py-3 rounded-lg hover:bg-indigo-700">
              Create Basket
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Invest Modal -->
    <div id="investModal" class="fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50">
      <div class="bg-white rounded-xl max-w-md w-full mx-4">
        <div class="p-6 border-b flex justify-between items-center">
          <h3 class="text-xl font-bold">Confirm Investment</h3>
          <button onclick="hideModal('investModal')" class="text-gray-400 hover:text-gray-600">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div id="investModalContent" class="p-6">
          <!-- Content populated dynamically -->
        </div>
      </div>
    </div>

    <!-- Notification Toast -->
    <div id="notification" class="fixed bottom-4 right-4 transform translate-y-full transition-transform duration-300 z-50">
      <div class="bg-gray-800 text-white px-6 py-3 rounded-lg shadow-lg flex items-center space-x-3">
        <i id="notificationIcon" class="fas fa-check-circle"></i>
        <span id="notificationMessage">Notification</span>
      </div>
    </div>
  `;
}

// Event Handlers
function attachEventListeners() {
  // Load explore data if on explore view
  if (state.currentView === 'explore') {
    loadExploreData();
  }
  
  // Initialize performance charts if on that view
  if (state.currentView === 'performance') {
    initializeCharts();
  }
}

// Navigation
function setView(view) {
  state.currentView = view;
  state.selectedBasket = null;
  state.selectedInvestment = null;
  renderApp();
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

// Basket Operations
function showCreateBasketModal() {
  document.getElementById('createBasketModal').classList.remove('hidden');
  document.getElementById('createBasketModal').classList.add('flex');
  document.getElementById('stocksList').innerHTML = '';
  addStockRow();
  addStockRow();
  addStockRow();
}

function addStockRow() {
  const stocksList = document.getElementById('stocksList');
  const row = document.createElement('div');
  row.className = 'flex space-x-2 items-center stock-row';
  row.innerHTML = `
    <input type="text" placeholder="Symbol (e.g., TCS)" class="flex-1 px-3 py-2 border border-gray-300 rounded-lg stock-symbol" required>
    <select class="w-24 px-2 py-2 border border-gray-300 rounded-lg stock-exchange">
      <option value="NSE">NSE</option>
      <option value="BSE">BSE</option>
    </select>
    <input type="number" placeholder="Weight %" class="w-24 px-3 py-2 border border-gray-300 rounded-lg stock-weight" min="1" max="100" required onchange="updateTotalWeight()">
    <button type="button" onclick="removeStockRow(this)" class="text-red-500 hover:text-red-700 p-2">
      <i class="fas fa-times"></i>
    </button>
  `;
  stocksList.appendChild(row);
}

function removeStockRow(btn) {
  btn.closest('.stock-row').remove();
  updateTotalWeight();
}

function updateTotalWeight() {
  const weights = document.querySelectorAll('.stock-weight');
  let total = 0;
  weights.forEach(w => total += parseFloat(w.value) || 0);
  document.getElementById('totalWeight').textContent = total;
  document.getElementById('totalWeight').className = total === 100 ? 'text-green-600' : 'text-red-600';
}

async function handleCreateBasket(event) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  
  const stocks = [];
  document.querySelectorAll('.stock-row').forEach(row => {
    const symbol = row.querySelector('.stock-symbol').value.trim().toUpperCase();
    const exchange = row.querySelector('.stock-exchange').value;
    const weight = parseFloat(row.querySelector('.stock-weight').value) || 0;
    if (symbol && weight > 0) {
      stocks.push({ trading_symbol: symbol, exchange, weight_percentage: weight });
    }
  });

  if (stocks.length === 0) {
    showNotification('Add at least one stock', 'error');
    return;
  }

  const totalWeight = stocks.reduce((sum, s) => sum + s.weight_percentage, 0);
  if (Math.abs(totalWeight - 100) > 0.01) {
    showNotification('Stock weights must sum to 100%', 'error');
    return;
  }

  const basket = {
    name: formData.get('name'),
    description: formData.get('description'),
    theme: formData.get('theme'),
    risk_level: formData.get('risk_level'),
    is_public: formData.get('is_public') === 'on',
    stocks
  };

  const res = await api.post('/baskets', basket);
  if (res?.success) {
    showNotification('Basket created successfully!', 'success');
    hideModal('createBasketModal');
    await loadDashboardData();
    renderApp();
  } else {
    showNotification(res?.error?.message || 'Failed to create basket', 'error');
  }
}

async function buyBasket(basketId) {
  const amount = parseFloat(document.getElementById('investAmount')?.value || 10000);
  
  const res = await api.post(`/investments/buy/${basketId}`, { investment_amount: amount });
  if (res?.success) {
    // Show order preview and redirect to Kite
    const data = res.data;
    const modalContent = document.getElementById('investModalContent');
    modalContent.innerHTML = `
      <div class="space-y-4">
        <div class="bg-gray-50 rounded-lg p-4">
          <p class="text-sm text-gray-500 mb-2">Order Summary</p>
          ${data.orders.map(o => `
            <div class="flex justify-between text-sm py-1">
              <span>${o.trading_symbol}</span>
              <span>${o.quantity} shares</span>
            </div>
          `).join('')}
          <div class="border-t mt-2 pt-2 flex justify-between font-semibold">
            <span>Total Amount</span>
            <span>${formatCurrency(data.total_amount)}</span>
          </div>
          ${data.unused_amount > 0 ? `<p class="text-xs text-gray-500 mt-2">Unused: ${formatCurrency(data.unused_amount)}</p>` : ''}
        </div>
        
        <p class="text-sm text-gray-600">You will be redirected to Zerodha Kite to place these orders.</p>
        
        <form action="${data.kite_basket_url}" method="POST" target="_blank">
          <input type="hidden" name="api_key" value="${data.kite_basket_data.api_key}">
          <input type="hidden" name="data" value='${data.kite_basket_data.data}'>
          <button type="submit" onclick="handleKiteRedirect(${data.transaction_id})" class="w-full bg-indigo-600 text-white py-3 rounded-lg hover:bg-indigo-700">
            <i class="fas fa-external-link-alt mr-2"></i>Place Order on Kite
          </button>
        </form>
        
        <button onclick="hideModal('investModal')" class="w-full border border-gray-300 py-2 rounded-lg hover:bg-gray-50">
          Cancel
        </button>
      </div>
    `;
    
    document.getElementById('investModal').classList.remove('hidden');
    document.getElementById('investModal').classList.add('flex');
  } else {
    showNotification(res?.error?.message || 'Failed to create order', 'error');
  }
}

function handleKiteRedirect(transactionId) {
  // Store transaction ID to confirm later
  localStorage.setItem('pending_transaction', transactionId);
  showNotification('Complete the order on Kite, then return here', 'info');
}

async function rebalanceInvestment(investmentId) {
  const res = await api.get(`/investments/${investmentId}/rebalance-preview?threshold=5`);
  if (res?.success) {
    const data = res.data;
    if (!data.summary.rebalance_needed) {
      showNotification('Portfolio is already balanced!', 'success');
      return;
    }
    
    const modalContent = document.getElementById('investModalContent');
    modalContent.innerHTML = `
      <div class="space-y-4">
        <h4 class="font-semibold">Rebalance Preview</h4>
        <div class="bg-gray-50 rounded-lg p-4 max-h-60 overflow-y-auto">
          ${data.recommendations.filter(r => r.action !== 'HOLD').map(r => `
            <div class="flex justify-between text-sm py-1 ${r.action === 'BUY' ? 'text-green-600' : 'text-red-600'}">
              <span>${r.action} ${r.trading_symbol}</span>
              <span>${r.quantity} shares (${formatCurrency(r.amount)})</span>
            </div>
          `).join('')}
        </div>
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div class="bg-green-50 p-3 rounded-lg">
            <p class="text-green-600">To Buy</p>
            <p class="font-semibold">${formatCurrency(data.summary.buy_amount)}</p>
          </div>
          <div class="bg-red-50 p-3 rounded-lg">
            <p class="text-red-600">To Sell</p>
            <p class="font-semibold">${formatCurrency(data.summary.sell_amount)}</p>
          </div>
        </div>
        <button onclick="executeRebalance(${investmentId})" class="w-full bg-indigo-600 text-white py-3 rounded-lg hover:bg-indigo-700">
          Execute Rebalance
        </button>
      </div>
    `;
    
    document.getElementById('investModal').classList.remove('hidden');
    document.getElementById('investModal').classList.add('flex');
  }
}

async function executeRebalance(investmentId) {
  const res = await api.post(`/investments/${investmentId}/rebalance`, { threshold: 5 });
  if (res?.success) {
    // Redirect to Kite for order execution
    const data = res.data;
    if (data.kite_basket_url) {
      // Similar flow as buy
      showNotification('Rebalance orders generated. Complete on Kite.', 'success');
    }
    hideModal('investModal');
  }
}

async function sellInvestment(investmentId) {
  if (!confirm('Are you sure you want to sell all holdings in this investment?')) return;
  
  const res = await api.post(`/investments/${investmentId}/sell`, { percentage: 100 });
  if (res?.success) {
    showNotification('Sell order generated. Complete on Kite.', 'success');
  }
}

async function confirmDeleteBasket(basketId) {
  if (!confirm('Are you sure you want to delete this basket?')) return;
  
  const res = await api.delete(`/baskets/${basketId}`);
  if (res?.success) {
    showNotification('Basket deleted', 'success');
    await loadDashboardData();
    renderApp();
  }
}

// Account Operations
async function switchAccount(accountId) {
  const res = await api.post('/auth/switch-account', { account_id: accountId });
  if (res?.success) {
    showNotification('Switched account', 'success');
    await loadDashboardData();
    const authRes = await api.get('/auth/status');
    if (authRes?.success) {
      state.account = authRes.data.account;
    }
    renderApp();
  }
}

function addNewAccount() {
  window.location.href = '/api/auth/login';
}

function handleLogout() {
  api.post('/auth/logout');
  localStorage.removeItem('session_id');
  window.location.href = '/';
}

// SIP Operations
async function showCreateSIPModal(basketId) {
  // TODO: Implement SIP creation modal
  showNotification('SIP creation coming soon!', 'info');
}

async function pauseSIP(sipId) {
  const res = await api.put(`/sip/${sipId}`, { status: 'PAUSED' });
  if (res?.success) {
    showNotification('SIP paused', 'success');
    await loadDashboardData();
    renderApp();
  }
}

async function resumeSIP(sipId) {
  const res = await api.put(`/sip/${sipId}`, { status: 'ACTIVE' });
  if (res?.success) {
    showNotification('SIP resumed', 'success');
    await loadDashboardData();
    renderApp();
  }
}

// Alert Operations
async function showCreateAlertModal() {
  showNotification('Alert creation coming soon!', 'info');
}

async function deleteAlert(alertId) {
  const res = await api.delete(`/alerts/${alertId}`);
  if (res?.success) {
    showNotification('Alert deleted', 'success');
    await loadDashboardData();
    renderApp();
  }
}

// Explore Data
async function loadExploreData() {
  const [templatesRes, publicRes] = await Promise.all([
    api.get('/baskets/templates'),
    api.get('/baskets/public')
  ]);

  const templatesGrid = document.getElementById('templatesGrid');
  const publicGrid = document.getElementById('publicBasketsGrid');

  if (templatesRes?.success && templatesGrid) {
    templatesGrid.innerHTML = templatesRes.data.length === 0 
      ? '<p class="col-span-4 text-center text-gray-500 py-8">No templates available</p>'
      : templatesRes.data.map(renderBasketCard).join('');
  }

  if (publicRes?.success && publicGrid) {
    publicGrid.innerHTML = publicRes.data.length === 0
      ? '<p class="col-span-4 text-center text-gray-500 py-8">No public baskets yet</p>'
      : publicRes.data.map(renderBasketCard).join('');
  }
}

function renderBasketCard(basket) {
  return `
    <div class="bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-md transition cursor-pointer" onclick="viewBasket(${basket.id})">
      <div class="p-6">
        <div class="flex justify-between items-start mb-3">
          <span class="px-3 py-1 text-xs font-medium rounded-full ${getThemeClass(basket.theme)}">${basket.theme || 'Custom'}</span>
          <span class="text-xs text-gray-400">${basket.clone_count || 0} clones</span>
        </div>
        <h3 class="font-semibold text-gray-900 mb-2">${basket.name}</h3>
        <p class="text-sm text-gray-500 line-clamp-2 mb-4">${basket.description || ''}</p>
        <div class="flex justify-between text-sm text-gray-500">
          <span>${basket.stock_count || 0} stocks</span>
          <span class="capitalize">${basket.risk_level || 'moderate'} risk</span>
        </div>
      </div>
      <div class="px-6 py-3 bg-gray-50 flex justify-between">
        <button onclick="event.stopPropagation(); cloneBasket(${basket.id})" class="text-indigo-600 hover:text-indigo-800 text-sm">
          <i class="fas fa-copy mr-1"></i>Clone
        </button>
        <button onclick="event.stopPropagation(); investInBasket(${basket.id})" class="text-green-600 hover:text-green-800 text-sm">
          <i class="fas fa-shopping-cart mr-1"></i>Invest
        </button>
      </div>
    </div>
  `;
}

async function cloneBasket(basketId) {
  const name = prompt('Name for your cloned basket:');
  if (!name) return;
  
  const res = await api.post(`/baskets/${basketId}/clone`, { name });
  if (res?.success) {
    showNotification('Basket cloned!', 'success');
    await loadDashboardData();
    viewBasket(res.data.basket_id);
  }
}

async function investInBasket(basketId) {
  await viewBasket(basketId);
}

function editBasket(basketId) {
  // TODO: Implement edit modal
  viewBasket(basketId);
}

// Charts
function initializeCharts() {
  // Performance chart placeholder
  const ctx = document.getElementById('performanceChart');
  if (ctx) {
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        datasets: [{
          label: 'Portfolio',
          data: [100, 105, 103, 110, 115, 118],
          borderColor: '#4F46E5',
          tension: 0.1
        }, {
          label: 'Nifty 50',
          data: [100, 102, 101, 105, 108, 110],
          borderColor: '#9CA3AF',
          tension: 0.1
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'top' }
        }
      }
    });
  }
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

function getThemeClass(theme) {
  const classes = {
    'Technology': 'bg-blue-100 text-blue-800',
    'Banking': 'bg-green-100 text-green-800',
    'Healthcare': 'bg-red-100 text-red-800',
    'Consumer': 'bg-purple-100 text-purple-800',
    'Automobile': 'bg-orange-100 text-orange-800',
    'Index': 'bg-indigo-100 text-indigo-800',
    'Dividend': 'bg-yellow-100 text-yellow-800',
    'Growth': 'bg-pink-100 text-pink-800'
  };
  return classes[theme] || 'bg-gray-100 text-gray-800';
}

function hideModal(modalId) {
  document.getElementById(modalId).classList.add('hidden');
  document.getElementById(modalId).classList.remove('flex');
}

function showNotification(message, type = 'info') {
  const notification = document.getElementById('notification');
  const icon = document.getElementById('notificationIcon');
  const msg = document.getElementById('notificationMessage');
  
  msg.textContent = message;
  icon.className = `fas ${type === 'success' ? 'fa-check-circle text-green-400' : type === 'error' ? 'fa-exclamation-circle text-red-400' : 'fa-info-circle text-blue-400'}`;
  
  notification.classList.remove('translate-y-full');
  setTimeout(() => notification.classList.add('translate-y-full'), 3000);
}

// Initialize
document.addEventListener('DOMContentLoaded', initApp);
