/**
 * StockBasket - Smallcase-like Stock Basket Platform
 * Main Application Entry Point
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { Bindings, Variables } from './types';

// Import routes
import auth from './routes/auth';
import setup from './routes/setup';
import baskets from './routes/baskets';
import investments from './routes/investments';
import sip from './routes/sip';
import alerts from './routes/alerts';
import portfolio from './routes/portfolio';
import instruments from './routes/instruments';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Middleware
app.use('*', logger());
app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-Session-ID', 'Authorization']
}));

// API Routes
app.route('/api/auth', auth);
app.route('/api/setup', setup);
app.route('/api/baskets', baskets);
app.route('/api/investments', investments);
app.route('/api/sip', sip);
app.route('/api/alerts', alerts);
app.route('/api/portfolio', portfolio);
app.route('/api/instruments', instruments);

// Health check
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'StockBasket',
    timestamp: new Date().toISOString()
  });
});

// Landing Page
app.get('/', async (c) => {
  // Check if setup is complete
  let isConfigured = false;
  try {
    const config = await c.env.DB.prepare(
      "SELECT config_value FROM app_config WHERE config_key = 'kite_api_key'"
    ).first();
    isConfigured = !!config?.config_value || !!c.env.KITE_API_KEY;
  } catch (e) {
    // DB might not be initialized
  }
  
  return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>StockBasket - Build Your Own Smallcase</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
      .gradient-bg { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
      .card-hover { transition: transform 0.2s, box-shadow 0.2s; }
      .card-hover:hover { transform: translateY(-4px); box-shadow: 0 12px 24px rgba(0,0,0,0.15); }
    </style>
</head>
<body class="bg-gray-50 min-h-screen">
    <!-- Navigation -->
    <nav class="bg-white shadow-sm sticky top-0 z-50">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between h-16 items-center">
                <div class="flex items-center space-x-2">
                    <i class="fas fa-layer-group text-2xl text-indigo-600"></i>
                    <span class="text-xl font-bold text-gray-900">StockBasket</span>
                </div>
                <div class="flex items-center space-x-4">
                    <a href="/dashboard" class="text-gray-600 hover:text-indigo-600">
                        <i class="fas fa-chart-pie mr-1"></i> Dashboard
                    </a>
                    <button id="loginBtn" onclick="handleLogin()" class="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition">
                        <i class="fas fa-sign-in-alt mr-1"></i> Login with Zerodha
                    </button>
                </div>
            </div>
        </div>
    </nav>

    <!-- Hero Section -->
    <div class="gradient-bg text-white py-20">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 class="text-4xl md:text-5xl font-bold mb-6">Build Your Own Stock Baskets</h1>
            <p class="text-xl md:text-2xl mb-8 opacity-90">Create, invest, and rebalance thematic stock portfolios with ease. Your personal Smallcase platform.</p>
            <div class="flex justify-center space-x-4">
                <a href="#features" class="bg-white text-indigo-600 px-6 py-3 rounded-lg font-semibold hover:bg-gray-100 transition">
                    <i class="fas fa-info-circle mr-2"></i>Learn More
                </a>
                <a href="#templates" class="border-2 border-white text-white px-6 py-3 rounded-lg font-semibold hover:bg-white hover:text-indigo-600 transition">
                    <i class="fas fa-boxes mr-2"></i>View Templates
                </a>
            </div>
        </div>
    </div>

    ${!isConfigured ? `
    <!-- Setup Banner -->
    <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4">
        <div class="max-w-7xl mx-auto flex items-center">
            <i class="fas fa-exclamation-triangle text-yellow-400 mr-3"></i>
            <div>
                <p class="text-yellow-700 font-medium">Setup Required</p>
                <p class="text-yellow-600 text-sm">Configure your Zerodha Kite API credentials to get started.</p>
            </div>
            <button onclick="showSetupModal()" class="ml-auto bg-yellow-500 text-white px-4 py-2 rounded-lg hover:bg-yellow-600">
                <i class="fas fa-cog mr-1"></i> Setup Now
            </button>
        </div>
    </div>
    ` : ''}

    <!-- Features Section -->
    <section id="features" class="py-16 bg-white">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 class="text-3xl font-bold text-center text-gray-900 mb-12">Why StockBasket?</h2>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div class="text-center p-6 card-hover rounded-xl bg-gray-50">
                    <div class="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i class="fas fa-cubes text-2xl text-indigo-600"></i>
                    </div>
                    <h3 class="text-xl font-semibold mb-2">Custom Baskets</h3>
                    <p class="text-gray-600">Create personalized stock baskets with your own themes and weightages.</p>
                </div>
                <div class="text-center p-6 card-hover rounded-xl bg-gray-50">
                    <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i class="fas fa-sync-alt text-2xl text-green-600"></i>
                    </div>
                    <h3 class="text-xl font-semibold mb-2">Auto Rebalancing</h3>
                    <p class="text-gray-600">Keep your portfolio aligned with target allocations automatically.</p>
                </div>
                <div class="text-center p-6 card-hover rounded-xl bg-gray-50">
                    <div class="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i class="fas fa-calendar-check text-2xl text-purple-600"></i>
                    </div>
                    <h3 class="text-xl font-semibold mb-2">SIP Support</h3>
                    <p class="text-gray-600">Set up systematic investments in your favorite baskets.</p>
                </div>
                <div class="text-center p-6 card-hover rounded-xl bg-gray-50">
                    <div class="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i class="fas fa-chart-line text-2xl text-blue-600"></i>
                    </div>
                    <h3 class="text-xl font-semibold mb-2">Benchmark Comparison</h3>
                    <p class="text-gray-600">Track performance against Nifty, Sensex, and sector indices.</p>
                </div>
                <div class="text-center p-6 card-hover rounded-xl bg-gray-50">
                    <div class="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i class="fas fa-bell text-2xl text-orange-600"></i>
                    </div>
                    <h3 class="text-xl font-semibold mb-2">Smart Alerts</h3>
                    <p class="text-gray-600">Get notified on price movements and rebalance opportunities.</p>
                </div>
                <div class="text-center p-6 card-hover rounded-xl bg-gray-50">
                    <div class="w-16 h-16 bg-pink-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i class="fas fa-users text-2xl text-pink-600"></i>
                    </div>
                    <h3 class="text-xl font-semibold mb-2">Family Management</h3>
                    <p class="text-gray-600">Manage multiple Zerodha accounts for your family.</p>
                </div>
            </div>
        </div>
    </section>

    <!-- Templates Section -->
    <section id="templates" class="py-16 bg-gray-50">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 class="text-3xl font-bold text-center text-gray-900 mb-4">Pre-built Templates</h2>
            <p class="text-center text-gray-600 mb-12">Start with expertly curated baskets or create your own</p>
            <div id="templatesGrid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <!-- Templates will be loaded here -->
                <div class="animate-pulse bg-white rounded-xl p-6 h-48"></div>
                <div class="animate-pulse bg-white rounded-xl p-6 h-48"></div>
                <div class="animate-pulse bg-white rounded-xl p-6 h-48"></div>
                <div class="animate-pulse bg-white rounded-xl p-6 h-48"></div>
            </div>
        </div>
    </section>

    <!-- Setup Modal -->
    <div id="setupModal" class="fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50">
        <div class="bg-white rounded-xl p-8 max-w-md w-full mx-4">
            <div class="flex justify-between items-center mb-6">
                <h3 class="text-xl font-bold">Setup Kite API</h3>
                <button onclick="hideSetupModal()" class="text-gray-400 hover:text-gray-600">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <p class="text-gray-600 mb-6">
                Get your API credentials from 
                <a href="https://developers.kite.trade" target="_blank" class="text-indigo-600 hover:underline">Kite Connect Developer Portal</a>
            </p>
            <form id="setupForm" onsubmit="handleSetup(event)">
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 mb-2">API Key</label>
                    <input type="text" id="apiKey" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Your Kite API Key">
                </div>
                <div class="mb-6">
                    <label class="block text-sm font-medium text-gray-700 mb-2">API Secret</label>
                    <input type="password" id="apiSecret" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Your Kite API Secret">
                </div>
                <button type="submit" class="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition">
                    <i class="fas fa-save mr-2"></i>Save Configuration
                </button>
            </form>
        </div>
    </div>

    <!-- Footer -->
    <footer class="bg-gray-900 text-white py-8">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <p class="text-gray-400">StockBasket - Self-hosted stock basket platform</p>
            <p class="text-gray-500 text-sm mt-2">Not affiliated with Zerodha or Smallcase. Use at your own risk.</p>
        </div>
    </footer>

    <script>
        // Check session on load
        const sessionId = new URLSearchParams(window.location.search).get('session_id') || localStorage.getItem('session_id');
        
        if (sessionId) {
            localStorage.setItem('session_id', sessionId);
            checkAuthStatus();
        }
        
        async function checkAuthStatus() {
            try {
                const res = await fetch('/api/auth/status', {
                    headers: { 'X-Session-ID': sessionId }
                });
                const data = await res.json();
                
                if (data.success && data.data.authenticated) {
                    document.getElementById('loginBtn').innerHTML = '<i class="fas fa-user mr-1"></i> ' + (data.data.account.name || 'Account');
                    document.getElementById('loginBtn').onclick = () => window.location.href = '/dashboard?session_id=' + sessionId;
                }
            } catch (e) {
                console.error('Auth check failed:', e);
            }
        }
        
        function handleLogin() {
            window.location.href = '/api/auth/login';
        }
        
        function showSetupModal() {
            document.getElementById('setupModal').classList.remove('hidden');
            document.getElementById('setupModal').classList.add('flex');
        }
        
        function hideSetupModal() {
            document.getElementById('setupModal').classList.add('hidden');
            document.getElementById('setupModal').classList.remove('flex');
        }
        
        async function handleSetup(e) {
            e.preventDefault();
            const apiKey = document.getElementById('apiKey').value;
            const apiSecret = document.getElementById('apiSecret').value;
            
            try {
                const res = await fetch('/api/setup/configure', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ kite_api_key: apiKey, kite_api_secret: apiSecret })
                });
                const data = await res.json();
                
                if (data.success) {
                    alert('Configuration saved! You can now login with Zerodha.');
                    hideSetupModal();
                    window.location.reload();
                } else {
                    alert('Error: ' + (data.error?.message || 'Failed to save'));
                }
            } catch (e) {
                alert('Error saving configuration');
            }
        }
        
        // Load templates
        async function loadTemplates() {
            try {
                const res = await fetch('/api/baskets/templates');
                const data = await res.json();
                
                if (data.success && data.data.length > 0) {
                    const grid = document.getElementById('templatesGrid');
                    grid.innerHTML = data.data.map(t => \`
                        <div class="bg-white rounded-xl p-6 card-hover shadow-sm">
                            <div class="flex items-center justify-between mb-4">
                                <span class="px-3 py-1 bg-\${getThemeColor(t.theme)}-100 text-\${getThemeColor(t.theme)}-800 rounded-full text-sm">\${t.theme || 'General'}</span>
                                <span class="text-sm text-gray-500">\${t.stock_count || 0} stocks</span>
                            </div>
                            <h3 class="text-lg font-semibold mb-2">\${t.name}</h3>
                            <p class="text-gray-600 text-sm mb-4 line-clamp-2">\${t.description || ''}</p>
                            <div class="flex items-center justify-between">
                                <span class="text-xs text-gray-400">\${t.clone_count || 0} clones</span>
                                <a href="/dashboard?view=basket&id=\${t.id}" class="text-indigo-600 hover:text-indigo-800 text-sm font-medium">
                                    View <i class="fas fa-arrow-right ml-1"></i>
                                </a>
                            </div>
                        </div>
                    \`).join('');
                }
            } catch (e) {
                console.error('Failed to load templates:', e);
            }
        }
        
        function getThemeColor(theme) {
            const colors = {
                'Technology': 'blue',
                'Banking': 'green',
                'Healthcare': 'red',
                'Consumer': 'purple',
                'Automobile': 'orange',
                'Index': 'indigo',
                'Dividend': 'yellow',
                'Growth': 'pink'
            };
            return colors[theme] || 'gray';
        }
        
        // Load templates on page load
        loadTemplates();
        
        // Check for error in URL
        const error = new URLSearchParams(window.location.search).get('error');
        if (error) {
            alert('Error: ' + error.replace(/_/g, ' '));
        }
    </script>
</body>
</html>
  `);
});

// Dashboard Page
app.get('/dashboard', async (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dashboard - StockBasket</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
</head>
<body class="bg-gray-100 min-h-screen">
    <div id="app">
        <!-- Loading State -->
        <div id="loading" class="fixed inset-0 bg-white flex items-center justify-center z-50">
            <div class="text-center">
                <i class="fas fa-spinner fa-spin text-4xl text-indigo-600 mb-4"></i>
                <p class="text-gray-600">Loading dashboard...</p>
            </div>
        </div>
    </div>
    
    <script src="/static/app.js"></script>
</body>
</html>
  `);
});

export default app;
