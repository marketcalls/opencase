/**
 * OpenCase - Open Source Stock Basket Platform
 * Main Application Entry Point
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { Bindings, Variables } from './types';

// Import routes
import auth from './routes/auth';
import setup from './routes/setup';
import user from './routes/user';
import brokerAccounts from './routes/broker-accounts';
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
app.route('/api/user', user);
app.route('/api/broker-accounts', brokerAccounts);
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
    service: 'OpenCase',
    timestamp: new Date().toISOString()
  });
});

// Landing Page - New User Flow with Signup/Login
app.get('/', async (c) => {
  // Check if app needs initial setup (no users exist)
  let needsSetup = true;
  try {
    const userCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM users'
    ).first<{ count: number }>();
    needsSetup = (userCount?.count || 0) === 0;
  } catch (e) {
    // Table might not exist yet
    needsSetup = true;
  }
  
  return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OpenCase - Build Your Own Stock Baskets</title>
    <link rel="icon" type="image/svg+xml" href="/static/logo.svg">
    <link rel="apple-touch-icon" href="/static/logo.svg">
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
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
                    <img src="/static/logo.svg" alt="OpenCase" class="w-10 h-10">
                    <span class="text-xl font-bold text-gray-900">OpenCase</span>
                </div>
                <div class="flex items-center space-x-4">
                    <button id="loginBtn" onclick="showLoginModal()" class="text-gray-600 hover:text-indigo-600">
                        <i class="fas fa-sign-in-alt mr-1"></i> Login
                    </button>
                    <button id="signupBtn" onclick="showSignupModal()" class="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition">
                        <i class="fas fa-user-plus mr-1"></i> Sign Up
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
                <button onclick="showSignupModal()" class="bg-white text-indigo-600 px-6 py-3 rounded-lg font-semibold hover:bg-gray-100 transition">
                    <i class="fas fa-rocket mr-2"></i>Get Started Free
                </button>
                <a href="#features" class="border-2 border-white text-white px-6 py-3 rounded-lg font-semibold hover:bg-white hover:text-indigo-600 transition">
                    <i class="fas fa-info-circle mr-2"></i>Learn More
                </a>
            </div>
        </div>
    </div>

    ${needsSetup ? `
    <!-- First User Banner -->
    <div class="bg-green-50 border-l-4 border-green-400 p-4">
        <div class="max-w-7xl mx-auto flex items-center">
            <i class="fas fa-star text-green-400 mr-3"></i>
            <div>
                <p class="text-green-700 font-medium">Be the First!</p>
                <p class="text-green-600 text-sm">Sign up now to become the admin and set up your trading platform.</p>
            </div>
            <button onclick="showSignupModal()" class="ml-auto bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600">
                <i class="fas fa-user-plus mr-1"></i> Create Admin Account
            </button>
        </div>
    </div>
    ` : ''}

    <!-- Features Section -->
    <section id="features" class="py-16 bg-white">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 class="text-3xl font-bold text-center text-gray-900 mb-12">Why OpenCase?</h2>
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
                    <h3 class="text-xl font-semibold mb-2">Multi-Broker Support</h3>
                    <p class="text-gray-600">Connect Zerodha, Angel One, and manage multiple accounts.</p>
                </div>
            </div>
        </div>
    </section>

    <!-- How It Works Section -->
    <section id="how-it-works" class="py-16 bg-gray-50">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 class="text-3xl font-bold text-center text-gray-900 mb-4">How It Works</h2>
            <p class="text-center text-gray-600 mb-12">Get started in 3 simple steps</p>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div class="text-center">
                    <div class="w-16 h-16 bg-indigo-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">1</div>
                    <h3 class="text-xl font-semibold mb-2">Sign Up</h3>
                    <p class="text-gray-600">Create your account with email and password. First user becomes admin.</p>
                </div>
                <div class="text-center">
                    <div class="w-16 h-16 bg-indigo-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">2</div>
                    <h3 class="text-xl font-semibold mb-2">Add Broker</h3>
                    <p class="text-gray-600">Connect your Zerodha or Angel One trading account with API credentials.</p>
                </div>
                <div class="text-center">
                    <div class="w-16 h-16 bg-indigo-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">3</div>
                    <h3 class="text-xl font-semibold mb-2">Start Investing</h3>
                    <p class="text-gray-600">Create baskets, set up SIPs, and manage your portfolio.</p>
                </div>
            </div>
        </div>
    </section>

    <!-- Templates Section -->
    <section id="templates" class="py-16 bg-white">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 class="text-3xl font-bold text-center text-gray-900 mb-4">Pre-built Templates</h2>
            <p class="text-center text-gray-600 mb-12">Start with expertly curated baskets or create your own</p>
            <div id="templatesGrid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div class="animate-pulse bg-gray-100 rounded-xl p-6 h-48"></div>
                <div class="animate-pulse bg-gray-100 rounded-xl p-6 h-48"></div>
                <div class="animate-pulse bg-gray-100 rounded-xl p-6 h-48"></div>
                <div class="animate-pulse bg-gray-100 rounded-xl p-6 h-48"></div>
            </div>
        </div>
    </section>

    <!-- Signup Modal -->
    <div id="signupModal" class="fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50">
        <div class="bg-white rounded-xl p-8 max-w-md w-full mx-4">
            <div class="flex justify-between items-center mb-6">
                <h3 class="text-xl font-bold">Create Account</h3>
                <button onclick="hideSignupModal()" class="text-gray-400 hover:text-gray-600">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <form id="signupForm" onsubmit="handleSignup(event)">
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                    <input type="text" id="signupName" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="John Doe">
                </div>
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 mb-2">Email</label>
                    <input type="email" id="signupEmail" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="you@example.com">
                </div>
                <div class="mb-6">
                    <label class="block text-sm font-medium text-gray-700 mb-2">Password</label>
                    <input type="password" id="signupPassword" required minlength="6" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Min 6 characters">
                </div>
                
                <button type="submit" id="signupSubmitBtn" class="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition">
                    <i class="fas fa-user-plus mr-2"></i>Create Account
                </button>
                
                <p class="text-center text-sm text-gray-500 mt-4">
                    Already have an account? 
                    <a href="#" onclick="hideSignupModal();showLoginModal();return false;" class="text-indigo-600 hover:underline">Login</a>
                </p>
            </form>
        </div>
    </div>

    <!-- Login Modal -->
    <div id="loginModal" class="fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50">
        <div class="bg-white rounded-xl p-8 max-w-md w-full mx-4">
            <div class="flex justify-between items-center mb-6">
                <h3 class="text-xl font-bold">Login</h3>
                <button onclick="hideLoginModal()" class="text-gray-400 hover:text-gray-600">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <form id="loginForm" onsubmit="handleLogin(event)">
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 mb-2">Email</label>
                    <input type="email" id="loginEmail" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="you@example.com">
                </div>
                <div class="mb-6">
                    <label class="block text-sm font-medium text-gray-700 mb-2">Password</label>
                    <input type="password" id="loginPassword" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Your password">
                </div>
                
                <button type="submit" id="loginSubmitBtn" class="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition">
                    <i class="fas fa-sign-in-alt mr-2"></i>Login
                </button>
                
                <p class="text-center text-sm text-gray-500 mt-4">
                    Don't have an account? 
                    <a href="#" onclick="hideLoginModal();showSignupModal();return false;" class="text-indigo-600 hover:underline">Sign Up</a>
                </p>
            </form>
        </div>
    </div>

    <!-- Footer -->
    <footer class="bg-gray-900 text-white py-8">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <p class="text-gray-400">OpenCase - Open source stock basket platform</p>
            <p class="text-gray-500 text-sm mt-2">Not affiliated with Zerodha or Smallcase. Use at your own risk.</p>
        </div>
    </footer>

    <script>
        // Check session on load
        const sessionId = localStorage.getItem('user_session_id');
        
        if (sessionId) {
            checkAuthStatus();
        }
        
        async function checkAuthStatus() {
            try {
                const res = await fetch('/api/user/status', {
                    headers: { 'X-Session-ID': sessionId }
                });
                const data = await res.json();
                
                if (data.success && data.data.is_authenticated) {
                    // User is logged in, redirect to dashboard
                    window.location.href = '/dashboard';
                }
            } catch (e) {
                console.error('Auth check failed:', e);
            }
        }
        
        function showSignupModal() {
            document.getElementById('signupModal').classList.remove('hidden');
            document.getElementById('signupModal').classList.add('flex');
        }
        
        function hideSignupModal() {
            document.getElementById('signupModal').classList.add('hidden');
            document.getElementById('signupModal').classList.remove('flex');
        }
        
        function showLoginModal() {
            document.getElementById('loginModal').classList.remove('hidden');
            document.getElementById('loginModal').classList.add('flex');
        }
        
        function hideLoginModal() {
            document.getElementById('loginModal').classList.add('hidden');
            document.getElementById('loginModal').classList.remove('flex');
        }
        
        async function handleSignup(e) {
            e.preventDefault();
            const name = document.getElementById('signupName').value;
            const email = document.getElementById('signupEmail').value;
            const password = document.getElementById('signupPassword').value;
            
            const submitBtn = document.getElementById('signupSubmitBtn');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Creating account...';
            
            try {
                const res = await fetch('/api/user/signup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, password })
                });
                const data = await res.json();
                
                if (data.success) {
                    localStorage.setItem('user_session_id', data.data.session_id);
                    showNotification(data.data.message || 'Account created!', 'success');
                    hideSignupModal();
                    // Redirect to onboarding
                    setTimeout(() => window.location.href = '/onboarding', 1000);
                } else {
                    showNotification(data.error?.message || 'Signup failed', 'error');
                }
            } catch (e) {
                showNotification('Error creating account', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-user-plus mr-2"></i>Create Account';
            }
        }
        
        async function handleLogin(e) {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            
            const submitBtn = document.getElementById('loginSubmitBtn');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Logging in...';
            
            try {
                const res = await fetch('/api/user/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await res.json();
                
                if (data.success) {
                    localStorage.setItem('user_session_id', data.data.session_id);
                    showNotification('Welcome back!', 'success');
                    hideLoginModal();
                    // Redirect to dashboard
                    setTimeout(() => window.location.href = '/dashboard', 1000);
                } else {
                    showNotification(data.error?.message || 'Login failed', 'error');
                }
            } catch (e) {
                showNotification('Error logging in', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Login';
            }
        }
        
        function showNotification(message, type = 'info') {
            const colors = {
                success: 'bg-green-500',
                error: 'bg-red-500',
                info: 'bg-blue-500',
                warning: 'bg-yellow-500'
            };
            const notification = document.createElement('div');
            notification.className = 'fixed top-4 right-4 ' + colors[type] + ' text-white px-6 py-3 rounded-lg shadow-lg z-[100]';
            const icon = type === 'success' ? 'check' : type === 'error' ? 'exclamation-circle' : 'info-circle';
            notification.innerHTML = '<i class="fas fa-' + icon + ' mr-2"></i>' + message;
            document.body.appendChild(notification);
            setTimeout(function() { notification.remove(); }, 4000);
        }
        
        // Load templates
        async function loadTemplates() {
            try {
                const res = await fetch('/api/baskets/templates');
                const data = await res.json();
                
                if (data.success && data.data && data.data.length > 0) {
                    const grid = document.getElementById('templatesGrid');
                    grid.innerHTML = data.data.map(t => \`
                        <div class="bg-white rounded-xl p-6 card-hover shadow-sm border">
                            <div class="flex items-center justify-between mb-4">
                                <span class="px-3 py-1 bg-\${getThemeColor(t.theme)}-100 text-\${getThemeColor(t.theme)}-800 rounded-full text-sm">\${t.theme || 'General'}</span>
                                <span class="text-sm text-gray-500">\${t.stock_count || 0} stocks</span>
                            </div>
                            <h3 class="text-lg font-semibold mb-2">\${t.name}</h3>
                            <p class="text-gray-600 text-sm mb-4 line-clamp-2">\${t.description || ''}</p>
                            <button onclick="showSignupModal()" class="w-full text-center text-indigo-600 hover:text-indigo-800 text-sm font-medium py-2 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition">
                                Sign up to invest <i class="fas fa-arrow-right ml-1"></i>
                            </button>
                        </div>
                    \`).join('');
                } else {
                    document.getElementById('templatesGrid').innerHTML = \`
                        <div class="col-span-4 text-center py-8 text-gray-500">
                            <i class="fas fa-boxes text-4xl mb-4 opacity-50"></i>
                            <p>No templates available yet. Sign up to create your own!</p>
                        </div>
                    \`;
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
        
        // Check for messages in URL
        const urlParams = new URLSearchParams(window.location.search);
        const error = urlParams.get('error');
        const success = urlParams.get('success');
        if (error) showNotification(error.replace(/_/g, ' '), 'error');
        if (success) showNotification(success.replace(/_/g, ' '), 'success');
    </script>
</body>
</html>
  `);
});

// Onboarding Page - Add first broker account after signup
app.get('/onboarding', async (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Setup Your Broker - OpenCase</title>
    <link rel="icon" type="image/svg+xml" href="/static/logo.svg">
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <style>
      .broker-option input:checked + .broker-card { border-color: #6366f1; background-color: #eef2ff; }
      .broker-option input:not(:checked) + .broker-card { border-color: #e5e7eb; background-color: white; }
      .broker-option input:not(:checked) + .broker-card:hover { border-color: #a5b4fc; }
    </style>
</head>
<body class="bg-gray-50 min-h-screen">
    <div class="min-h-screen flex items-center justify-center p-4">
        <div class="max-w-lg w-full">
            <!-- Progress indicator -->
            <div class="flex items-center justify-center mb-8">
                <div class="flex items-center">
                    <div class="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                        <i class="fas fa-check"></i>
                    </div>
                    <span class="ml-2 text-sm text-gray-600">Account Created</span>
                </div>
                <div class="w-16 h-1 bg-indigo-500 mx-4"></div>
                <div class="flex items-center">
                    <div class="w-8 h-8 bg-indigo-500 text-white rounded-full flex items-center justify-center text-sm font-bold">2</div>
                    <span class="ml-2 text-sm text-gray-900 font-medium">Add Broker</span>
                </div>
                <div class="w-16 h-1 bg-gray-300 mx-4"></div>
                <div class="flex items-center">
                    <div class="w-8 h-8 bg-gray-300 text-gray-600 rounded-full flex items-center justify-center text-sm font-bold">3</div>
                    <span class="ml-2 text-sm text-gray-400">Connect</span>
                </div>
            </div>

            <div class="bg-white rounded-xl shadow-lg p-8">
                <div class="text-center mb-6">
                    <img src="/static/logo.svg" alt="OpenCase" class="w-16 h-16 mx-auto mb-4">
                    <h1 class="text-2xl font-bold text-gray-900">Add Your Broker Account</h1>
                    <p class="text-gray-600 mt-2">Connect your trading account to start investing</p>
                </div>

                <form id="addBrokerForm" onsubmit="handleAddBroker(event)">
                    <!-- Broker Selection -->
                    <div class="mb-6">
                        <label class="block text-sm font-medium text-gray-700 mb-3">Select Broker</label>
                        <div class="grid grid-cols-2 gap-4">
                            <label class="broker-option cursor-pointer">
                                <input type="radio" name="broker_type" value="zerodha" checked onchange="updateBrokerFields()" class="hidden">
                                <div class="border-2 rounded-lg p-4 text-center transition broker-card">
                                    <i class="fas fa-chart-line text-2xl text-indigo-600 mb-2"></i>
                                    <span class="block font-semibold text-gray-900">Zerodha Kite</span>
                                    <span class="text-xs text-gray-500">OAuth Login</span>
                                </div>
                            </label>
                            <label class="broker-option cursor-pointer">
                                <input type="radio" name="broker_type" value="angelone" onchange="updateBrokerFields()" class="hidden">
                                <div class="border-2 rounded-lg p-4 text-center transition broker-card">
                                    <i class="fas fa-chart-bar text-2xl text-orange-600 mb-2"></i>
                                    <span class="block font-semibold text-gray-900">Angel One</span>
                                    <span class="text-xs text-gray-500">TOTP Login</span>
                                </div>
                            </label>
                        </div>
                    </div>

                    <!-- Account Name -->
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-2">Account Name</label>
                        <input type="text" id="accountName" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="My Trading Account">
                    </div>

                    <!-- API Credentials Help -->
                    <div id="brokerHelp" class="bg-blue-50 rounded-lg p-4 mb-4">
                        <p class="text-sm text-blue-800">
                            <i class="fas fa-info-circle mr-2"></i>
                            <span id="brokerHelpText">Get API credentials from <a href="https://developers.kite.trade" target="_blank" class="underline font-medium">Kite Connect Portal</a></span>
                        </p>
                    </div>
                    
                    <!-- Zerodha Redirect URL Section -->
                    <div id="zerodhaRedirectSection" class="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-4">
                        <div class="flex items-start">
                            <div class="flex-shrink-0">
                                <i class="fas fa-link text-indigo-600 mt-1"></i>
                            </div>
                            <div class="ml-3 flex-1">
                                <h4 class="text-sm font-semibold text-indigo-900">Redirect URL for Kite Connect App</h4>
                                <p class="text-xs text-indigo-700 mt-1 mb-2">Use this URL when creating your Kite Connect app on the Zerodha developer portal</p>
                                <div class="flex items-center bg-white rounded border border-indigo-200">
                                    <input type="text" id="onboardingRedirectUrl" readonly class="flex-1 px-3 py-2 text-sm text-gray-700 bg-transparent border-0 focus:ring-0 font-mono" value="">
                                    <button type="button" onclick="copyRedirectUrl('onboardingRedirectUrl')" class="px-3 py-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 border-l border-indigo-200 transition rounded-r">
                                        <i class="fas fa-copy"></i>
                                    </button>
                                </div>
                                <p class="text-xs text-indigo-600 mt-2">
                                    <i class="fas fa-lightbulb mr-1"></i>
                                    Paste this URL in the "Redirect URL" field when registering your Kite Connect app
                                </p>
                            </div>
                        </div>
                    </div>

                    <!-- API Key -->
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-2">API Key</label>
                        <input type="text" id="apiKey" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="Your API Key">
                    </div>

                    <!-- API Secret -->
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-2">API Secret</label>
                        <input type="password" id="apiSecret" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="Your API Secret">
                    </div>

                    <!-- Angel One Specific Fields -->
                    <div id="angeloneFields" class="hidden">
                        <div class="mb-4">
                            <label class="block text-sm font-medium text-gray-700 mb-2">Client Code *</label>
                            <input type="text" id="clientCode" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="Your Angel One Client Code">
                        </div>
                        <div class="mb-4">
                            <label class="block text-sm font-medium text-gray-700 mb-2">MPIN *</label>
                            <input type="password" id="mpin" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="Your 4-digit MPIN">
                        </div>
                    </div>

                    <button type="submit" id="submitBtn" class="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition mt-6">
                        <i class="fas fa-plus mr-2"></i>Add Broker Account
                    </button>

                    <button type="button" onclick="skipOnboarding()" class="w-full text-gray-500 py-2 mt-4 hover:text-gray-700">
                        Skip for now
                    </button>
                </form>
            </div>
        </div>
    </div>

    <script>
        const sessionId = localStorage.getItem('user_session_id');
        
        if (!sessionId) {
            window.location.href = '/?error=please_login';
        }
        
        // Set the redirect URL on page load
        const redirectUrl = window.location.origin + '/api/auth/callback';
        document.getElementById('onboardingRedirectUrl').value = redirectUrl;
        
        function copyRedirectUrl(inputId) {
            const input = document.getElementById(inputId);
            navigator.clipboard.writeText(input.value).then(() => {
                showNotification('Redirect URL copied to clipboard!', 'success');
            }).catch(err => {
                // Fallback for older browsers
                input.select();
                document.execCommand('copy');
                showNotification('Redirect URL copied to clipboard!', 'success');
            });
        }
        
        function updateBrokerFields() {
            const brokerType = document.querySelector('input[name="broker_type"]:checked').value;
            const angeloneFields = document.getElementById('angeloneFields');
            const zerodhaRedirectSection = document.getElementById('zerodhaRedirectSection');
            const brokerHelpText = document.getElementById('brokerHelpText');
            const clientCode = document.getElementById('clientCode');
            const mpin = document.getElementById('mpin');
            
            if (brokerType === 'zerodha') {
                angeloneFields.classList.add('hidden');
                zerodhaRedirectSection.classList.remove('hidden');
                clientCode.removeAttribute('required');
                mpin.removeAttribute('required');
                brokerHelpText.innerHTML = 'Get API credentials from <a href="https://developers.kite.trade" target="_blank" class="underline font-medium">Kite Connect Portal</a>';
            } else {
                angeloneFields.classList.remove('hidden');
                zerodhaRedirectSection.classList.add('hidden');
                clientCode.setAttribute('required', 'required');
                mpin.setAttribute('required', 'required');
                brokerHelpText.innerHTML = 'Get API credentials from <a href="https://smartapi.angelbroking.com" target="_blank" class="underline font-medium">Angel One Smart API Portal</a>';
            }
        }
        
        async function handleAddBroker(e) {
            e.preventDefault();
            const submitBtn = document.getElementById('submitBtn');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Adding...';
            
            const brokerType = document.querySelector('input[name="broker_type"]:checked').value;
            const payload = {
                broker_type: brokerType,
                account_name: document.getElementById('accountName').value,
                api_key: document.getElementById('apiKey').value,
                api_secret: document.getElementById('apiSecret').value
            };
            
            if (brokerType === 'angelone') {
                payload.client_code = document.getElementById('clientCode').value;
                payload.mpin = document.getElementById('mpin').value;
            }
            
            try {
                const res = await fetch('/api/broker-accounts', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-Session-ID': sessionId
                    },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                
                if (data.success) {
                    showNotification('Broker account added!', 'success');
                    // Redirect to accounts page to connect
                    setTimeout(() => window.location.href = '/accounts', 1000);
                } else {
                    showNotification(data.error?.message || 'Failed to add broker', 'error');
                }
            } catch (e) {
                showNotification('Error adding broker', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-plus mr-2"></i>Add Broker Account';
            }
        }
        
        function skipOnboarding() {
            window.location.href = '/dashboard';
        }
        
        function showNotification(message, type = 'info') {
            const colors = { success: 'bg-green-500', error: 'bg-red-500', info: 'bg-blue-500' };
            const notification = document.createElement('div');
            notification.className = 'fixed top-4 right-4 ' + colors[type] + ' text-white px-6 py-3 rounded-lg shadow-lg z-50';
            notification.innerHTML = '<i class="fas fa-' + (type === 'success' ? 'check' : 'exclamation-circle') + ' mr-2"></i>' + message;
            document.body.appendChild(notification);
            setTimeout(() => notification.remove(), 4000);
        }
    </script>
</body>
</html>
  `);
});

// Accounts Management Page
app.get('/accounts', async (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Broker Accounts - OpenCase</title>
    <link rel="icon" type="image/svg+xml" href="/static/logo.svg">
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <style>
      .broker-option input:checked + .broker-card { border-color: #6366f1; background-color: #eef2ff; }
      .broker-option input:not(:checked) + .broker-card { border-color: #e5e7eb; background-color: white; }
    </style>
</head>
<body class="bg-gray-100 min-h-screen">
    <!-- Navigation -->
    <nav class="bg-white shadow-sm sticky top-0 z-40">
        <div class="max-w-7xl mx-auto px-4">
            <div class="flex justify-between h-16 items-center">
                <div class="flex items-center space-x-4">
                    <a href="/dashboard" class="flex items-center space-x-2">
                        <img src="/static/logo.svg" alt="OpenCase" class="w-10 h-10">
                        <span class="text-xl font-bold text-gray-900">OpenCase</span>
                    </a>
                </div>
                <div class="flex items-center space-x-4">
                    <a href="/dashboard" class="text-gray-600 hover:text-indigo-600">
                        <i class="fas fa-chart-pie mr-1"></i> Dashboard
                    </a>
                    <button onclick="handleLogout()" class="text-gray-500 hover:text-gray-700">
                        <i class="fas fa-sign-out-alt"></i> Logout
                    </button>
                </div>
            </div>
        </div>
    </nav>

    <div class="max-w-4xl mx-auto p-6">
        <div class="flex justify-between items-center mb-6">
            <div>
                <h1 class="text-2xl font-bold text-gray-900">Broker Accounts</h1>
                <p class="text-gray-600">Manage your connected trading accounts</p>
            </div>
            <button onclick="showAddModal()" class="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
                <i class="fas fa-plus mr-2"></i>Add Account
            </button>
        </div>

        <!-- Accounts List -->
        <div id="accountsList" class="space-y-4">
            <div class="text-center py-12">
                <i class="fas fa-spinner fa-spin text-3xl text-indigo-600"></i>
                <p class="text-gray-500 mt-2">Loading accounts...</p>
            </div>
        </div>
    </div>

    <!-- Add Account Modal -->
    <div id="addModal" class="fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50">
        <div class="bg-white rounded-xl p-8 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div class="flex justify-between items-center mb-6">
                <h3 class="text-xl font-bold">Add Broker Account</h3>
                <button onclick="hideAddModal()" class="text-gray-400 hover:text-gray-600">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <form id="addBrokerForm" onsubmit="handleAddBroker(event)">
                <!-- Broker Selection -->
                <div class="mb-6">
                    <label class="block text-sm font-medium text-gray-700 mb-3">Select Broker</label>
                    <div class="grid grid-cols-2 gap-4">
                        <label class="broker-option cursor-pointer">
                            <input type="radio" name="broker_type" value="zerodha" checked onchange="updateBrokerFields()" class="hidden">
                            <div class="border-2 rounded-lg p-4 text-center transition broker-card">
                                <i class="fas fa-chart-line text-2xl text-indigo-600 mb-2"></i>
                                <span class="block font-semibold text-gray-900">Zerodha Kite</span>
                            </div>
                        </label>
                        <label class="broker-option cursor-pointer">
                            <input type="radio" name="broker_type" value="angelone" onchange="updateBrokerFields()" class="hidden">
                            <div class="border-2 rounded-lg p-4 text-center transition broker-card">
                                <i class="fas fa-chart-bar text-2xl text-orange-600 mb-2"></i>
                                <span class="block font-semibold text-gray-900">Angel One</span>
                            </div>
                        </label>
                    </div>
                </div>

                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 mb-2">Account Name</label>
                    <input type="text" id="accountName" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="My Trading Account">
                </div>

                <div id="brokerHelp" class="bg-blue-50 rounded-lg p-4 mb-4">
                    <p class="text-sm text-blue-800">
                        <i class="fas fa-info-circle mr-2"></i>
                        <span id="brokerHelpText">Get API credentials from <a href="https://developers.kite.trade" target="_blank" class="underline font-medium">Kite Connect Portal</a></span>
                    </p>
                </div>
                
                <!-- Zerodha Redirect URL Section -->
                <div id="zerodhaRedirectSection" class="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-4">
                    <div class="flex items-start">
                        <div class="flex-shrink-0">
                            <i class="fas fa-link text-indigo-600 mt-1"></i>
                        </div>
                        <div class="ml-3 flex-1">
                            <h4 class="text-sm font-semibold text-indigo-900">Redirect URL for Kite Connect App</h4>
                            <p class="text-xs text-indigo-700 mt-1 mb-2">Use this URL when creating your Kite Connect app on the Zerodha developer portal</p>
                            <div class="flex items-center bg-white rounded border border-indigo-200">
                                <input type="text" id="accountsRedirectUrl" readonly class="flex-1 px-3 py-2 text-sm text-gray-700 bg-transparent border-0 focus:ring-0 font-mono" value="">
                                <button type="button" onclick="copyRedirectUrl('accountsRedirectUrl')" class="px-3 py-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 border-l border-indigo-200 transition rounded-r">
                                    <i class="fas fa-copy"></i>
                                </button>
                            </div>
                            <p class="text-xs text-indigo-600 mt-2">
                                <i class="fas fa-lightbulb mr-1"></i>
                                Paste this URL in the "Redirect URL" field when registering your Kite Connect app
                            </p>
                        </div>
                    </div>
                </div>

                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 mb-2">API Key</label>
                    <input type="text" id="apiKey" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="Your API Key">
                </div>

                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 mb-2">API Secret</label>
                    <input type="password" id="apiSecret" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="Your API Secret">
                </div>

                <div id="angeloneFields" class="hidden">
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-2">Client Code *</label>
                        <input type="text" id="clientCode" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="Your Angel One Client Code">
                    </div>
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-2">MPIN *</label>
                        <input type="password" id="mpin" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="Your 4-digit MPIN">
                    </div>
                </div>

                <button type="submit" id="addSubmitBtn" class="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition">
                    <i class="fas fa-plus mr-2"></i>Add Account
                </button>
            </form>
        </div>
    </div>

    <!-- Connect (TOTP) Modal for Angel One -->
    <div id="totpModal" class="fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50">
        <div class="bg-white rounded-xl p-8 max-w-md w-full mx-4">
            <div class="flex justify-between items-center mb-6">
                <h3 class="text-xl font-bold">Enter TOTP</h3>
                <button onclick="hideTotpModal()" class="text-gray-400 hover:text-gray-600">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <form id="totpForm" onsubmit="handleTotpSubmit(event)">
                <input type="hidden" id="totpAccountId">
                <div class="mb-6">
                    <label class="block text-sm font-medium text-gray-700 mb-2">TOTP Code</label>
                    <input type="text" id="totpCode" required maxlength="6" pattern="[0-9]{6}" class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-center text-2xl tracking-widest" placeholder="000000">
                    <p class="text-sm text-gray-500 mt-2">Enter the 6-digit code from your authenticator app</p>
                </div>
                
                <button type="submit" id="totpSubmitBtn" class="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition">
                    <i class="fas fa-plug mr-2"></i>Connect
                </button>
            </form>
        </div>
    </div>

    <script>
        const sessionId = localStorage.getItem('user_session_id');
        
        if (!sessionId) {
            window.location.href = '/?error=please_login';
        }
        
        // Set the redirect URL for Zerodha
        const redirectUrl = window.location.origin + '/api/auth/callback';
        document.getElementById('accountsRedirectUrl').value = redirectUrl;
        
        function copyRedirectUrl(inputId) {
            const input = document.getElementById(inputId);
            navigator.clipboard.writeText(input.value).then(() => {
                showNotification('Redirect URL copied to clipboard!', 'success');
            }).catch(err => {
                // Fallback for older browsers
                input.select();
                document.execCommand('copy');
                showNotification('Redirect URL copied to clipboard!', 'success');
            });
        }
        
        // Load accounts on page load
        loadAccounts();
        
        async function loadAccounts() {
            try {
                const res = await fetch('/api/broker-accounts', {
                    headers: { 'X-Session-ID': sessionId }
                });
                const data = await res.json();
                
                if (data.success) {
                    renderAccounts(data.data);
                } else {
                    document.getElementById('accountsList').innerHTML = '<p class="text-red-500">Failed to load accounts</p>';
                }
            } catch (e) {
                document.getElementById('accountsList').innerHTML = '<p class="text-red-500">Error loading accounts</p>';
            }
        }
        
        function renderAccounts(accounts) {
            const list = document.getElementById('accountsList');
            
            if (!accounts || accounts.length === 0) {
                list.innerHTML = \`
                    <div class="text-center py-12 bg-white rounded-xl border-2 border-dashed">
                        <i class="fas fa-plug text-5xl text-gray-300 mb-4"></i>
                        <h3 class="text-lg font-medium text-gray-900 mb-2">No broker accounts</h3>
                        <p class="text-gray-500 mb-4">Add your first broker account to start trading</p>
                        <button onclick="showAddModal()" class="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700">
                            <i class="fas fa-plus mr-2"></i>Add Account
                        </button>
                    </div>
                \`;
                return;
            }
            
            list.innerHTML = accounts.map(acc => \`
                <div class="bg-white rounded-xl p-6 shadow-sm border">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center space-x-4">
                            <div class="w-12 h-12 rounded-full flex items-center justify-center \${acc.broker_type === 'zerodha' ? 'bg-indigo-100' : 'bg-orange-100'}">
                                <i class="fas \${acc.broker_type === 'zerodha' ? 'fa-chart-line text-indigo-600' : 'fa-chart-bar text-orange-600'} text-xl"></i>
                            </div>
                            <div>
                                <h3 class="font-semibold text-gray-900">\${acc.account_name}</h3>
                                <p class="text-sm text-gray-500">\${acc.broker_type === 'zerodha' ? 'Zerodha Kite' : 'Angel One'} \${acc.broker_user_id ? '• ' + acc.broker_user_id : ''}</p>
                            </div>
                        </div>
                        <div class="flex items-center space-x-3">
                            <span class="px-3 py-1 rounded-full text-sm \${acc.is_connected ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
                                <i class="fas fa-circle text-xs mr-1"></i>
                                \${acc.connection_status || 'disconnected'}
                            </span>
                            \${acc.is_connected ? \`
                                <button onclick="disconnectAccount(\${acc.id})" class="text-gray-400 hover:text-red-500" title="Disconnect">
                                    <i class="fas fa-unlink"></i>
                                </button>
                            \` : \`
                                <button onclick="connectAccount(\${acc.id}, '\${acc.broker_type}')" class="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 text-sm">
                                    <i class="fas fa-plug mr-1"></i>Connect
                                </button>
                            \`}
                            <button onclick="deleteAccount(\${acc.id})" class="text-gray-400 hover:text-red-500" title="Remove">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    \${acc.is_connected && acc.broker_name ? \`
                        <div class="mt-4 pt-4 border-t flex items-center text-sm text-gray-600">
                            <i class="fas fa-user mr-2"></i>
                            <span>\${acc.broker_name}</span>
                            \${acc.broker_email ? '<span class="mx-2">•</span><span>' + acc.broker_email + '</span>' : ''}
                            <span class="mx-2">•</span>
                            <span>Connected \${acc.last_connected_at ? new Date(acc.last_connected_at).toLocaleDateString() : 'today'}</span>
                        </div>
                    \` : ''}
                </div>
            \`).join('');
        }
        
        async function connectAccount(accountId, brokerType) {
            if (brokerType === 'angelone') {
                // Show TOTP modal for Angel One
                document.getElementById('totpAccountId').value = accountId;
                showTotpModal();
            } else {
                // Zerodha - redirect to OAuth
                try {
                    const res = await fetch('/api/broker-accounts/' + accountId + '/connect', {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'X-Session-ID': sessionId 
                        }
                    });
                    const data = await res.json();
                    
                    if (data.success && data.data.login_url) {
                        window.location.href = data.data.login_url;
                    } else {
                        showNotification(data.error?.message || 'Failed to connect', 'error');
                    }
                } catch (e) {
                    showNotification('Error connecting account', 'error');
                }
            }
        }
        
        async function handleTotpSubmit(e) {
            e.preventDefault();
            const accountId = document.getElementById('totpAccountId').value;
            const totp = document.getElementById('totpCode').value;
            const submitBtn = document.getElementById('totpSubmitBtn');
            
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Connecting...';
            
            try {
                const res = await fetch('/api/broker-accounts/' + accountId + '/connect', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-Session-ID': sessionId 
                    },
                    body: JSON.stringify({ totp })
                });
                const data = await res.json();
                
                if (data.success && data.data.connected) {
                    showNotification('Connected successfully!', 'success');
                    hideTotpModal();
                    loadAccounts();
                } else {
                    showNotification(data.error?.message || 'Connection failed', 'error');
                }
            } catch (e) {
                showNotification('Error connecting', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-plug mr-2"></i>Connect';
            }
        }
        
        async function disconnectAccount(accountId) {
            if (!confirm('Disconnect this account?')) return;
            
            try {
                const res = await fetch('/api/broker-accounts/' + accountId + '/disconnect', {
                    method: 'POST',
                    headers: { 'X-Session-ID': sessionId }
                });
                const data = await res.json();
                
                if (data.success) {
                    showNotification('Disconnected', 'success');
                    loadAccounts();
                } else {
                    showNotification(data.error?.message || 'Failed to disconnect', 'error');
                }
            } catch (e) {
                showNotification('Error disconnecting', 'error');
            }
        }
        
        async function deleteAccount(accountId) {
            if (!confirm('Remove this broker account? This action cannot be undone.')) return;
            
            try {
                const res = await fetch('/api/broker-accounts/' + accountId, {
                    method: 'DELETE',
                    headers: { 'X-Session-ID': sessionId }
                });
                const data = await res.json();
                
                if (data.success) {
                    showNotification('Account removed', 'success');
                    loadAccounts();
                } else {
                    showNotification(data.error?.message || 'Failed to remove', 'error');
                }
            } catch (e) {
                showNotification('Error removing account', 'error');
            }
        }
        
        function showAddModal() {
            document.getElementById('addModal').classList.remove('hidden');
            document.getElementById('addModal').classList.add('flex');
        }
        
        function hideAddModal() {
            document.getElementById('addModal').classList.add('hidden');
            document.getElementById('addModal').classList.remove('flex');
            document.getElementById('addBrokerForm').reset();
        }
        
        function showTotpModal() {
            document.getElementById('totpModal').classList.remove('hidden');
            document.getElementById('totpModal').classList.add('flex');
            document.getElementById('totpCode').focus();
        }
        
        function hideTotpModal() {
            document.getElementById('totpModal').classList.add('hidden');
            document.getElementById('totpModal').classList.remove('flex');
            document.getElementById('totpForm').reset();
        }
        
        function updateBrokerFields() {
            const brokerType = document.querySelector('input[name="broker_type"]:checked').value;
            const angeloneFields = document.getElementById('angeloneFields');
            const zerodhaRedirectSection = document.getElementById('zerodhaRedirectSection');
            const brokerHelpText = document.getElementById('brokerHelpText');
            const clientCode = document.getElementById('clientCode');
            const mpin = document.getElementById('mpin');
            
            if (brokerType === 'zerodha') {
                angeloneFields.classList.add('hidden');
                zerodhaRedirectSection.classList.remove('hidden');
                clientCode.removeAttribute('required');
                mpin.removeAttribute('required');
                brokerHelpText.innerHTML = 'Get API credentials from <a href="https://developers.kite.trade" target="_blank" class="underline font-medium">Kite Connect Portal</a>';
            } else {
                angeloneFields.classList.remove('hidden');
                zerodhaRedirectSection.classList.add('hidden');
                clientCode.setAttribute('required', 'required');
                mpin.setAttribute('required', 'required');
                brokerHelpText.innerHTML = 'Get API credentials from <a href="https://smartapi.angelbroking.com" target="_blank" class="underline font-medium">Angel One Smart API Portal</a>';
            }
        }
        
        async function handleAddBroker(e) {
            e.preventDefault();
            const submitBtn = document.getElementById('addSubmitBtn');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Adding...';
            
            const brokerType = document.querySelector('input[name="broker_type"]:checked').value;
            const payload = {
                broker_type: brokerType,
                account_name: document.getElementById('accountName').value,
                api_key: document.getElementById('apiKey').value,
                api_secret: document.getElementById('apiSecret').value
            };
            
            if (brokerType === 'angelone') {
                payload.client_code = document.getElementById('clientCode').value;
                payload.mpin = document.getElementById('mpin').value;
            }
            
            try {
                const res = await fetch('/api/broker-accounts', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-Session-ID': sessionId
                    },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                
                if (data.success) {
                    showNotification('Account added!', 'success');
                    hideAddModal();
                    loadAccounts();
                } else {
                    showNotification(data.error?.message || 'Failed to add', 'error');
                }
            } catch (e) {
                showNotification('Error adding account', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-plus mr-2"></i>Add Account';
            }
        }
        
        function handleLogout() {
            localStorage.removeItem('user_session_id');
            window.location.href = '/?success=logged_out';
        }
        
        function showNotification(message, type = 'info') {
            const colors = { success: 'bg-green-500', error: 'bg-red-500', info: 'bg-blue-500' };
            const notification = document.createElement('div');
            notification.className = 'fixed top-4 right-4 ' + colors[type] + ' text-white px-6 py-3 rounded-lg shadow-lg z-50';
            notification.innerHTML = '<i class="fas fa-' + (type === 'success' ? 'check' : 'exclamation-circle') + ' mr-2"></i>' + message;
            document.body.appendChild(notification);
            setTimeout(() => notification.remove(), 4000);
        }
        
        // Check for messages in URL
        const urlParams = new URLSearchParams(window.location.search);
        const error = urlParams.get('error');
        const success = urlParams.get('success');
        if (error) showNotification(error.replace(/_/g, ' '), 'error');
        if (success) showNotification(success.replace(/_/g, ' '), 'success');
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
    <title>Dashboard - OpenCase</title>
    <link rel="icon" type="image/svg+xml" href="/static/logo.svg">
    <link rel="apple-touch-icon" href="/static/logo.svg">
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
