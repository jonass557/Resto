import axios from 'axios';
import { queueOfflineAction } from '@/lib/offlineStorage';

const _rawApiUrl = import.meta.env.VITE_API_URL || '/api';
const API_URL = (_rawApiUrl.startsWith('http') || _rawApiUrl.startsWith('/'))
  ? _rawApiUrl
  : `https://${_rawApiUrl}`;

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' }
});

// ── In-memory GET cache (stale-while-revalidate) ──
const _cache = new Map();
const MAX_CACHE = 150;

// Per-prefix TTLs — stable data stays cached longer, volatile data expires fast
const TTL_MAP = [
  { p: '/products',      ttl: 300000 }, // 5min — menu changes rarely
  { p: '/categories',    ttl: 300000 }, // 5min — rarely changes
  { p: '/settings',      ttl: 300000 }, // 5min — rarely changes
  { p: '/users',         ttl: 120000 }, // 2min
  { p: '/clients',       ttl: 120000 }, // 2min
  { p: '/accounting',    ttl:  60000 }, // 1min
  { p: '/stats',         ttl:  60000 }, // 1min
  { p: '/orders',        ttl:  15000 }, // 15s — volatile
  { p: '/tables',        ttl:  15000 }, // 15s — volatile
  { p: '/tickets',       ttl:  15000 }, // 15s — volatile
  { p: '/cash-register', ttl:  15000 }, // 15s — volatile
];

function getTTL(url) {
  const m = TTL_MAP.find(x => url.startsWith(x.p));
  return m ? m.ttl : 60000;
}

function cacheKey(url, params) {
  return url + (params ? '?' + new URLSearchParams(params).toString() : '');
}

function pruneCache() {
  if (_cache.size > MAX_CACHE) {
    const oldest = [..._cache.entries()].sort((a, b) => a[1].ts - b[1].ts);
    for (let i = 0; i < 20; i++) _cache.delete(oldest[i][0]);
  }
}

// Invalidate cache entries matching a prefix (socket events call this before reloading)
export function invalidateCache(prefix) {
  for (const key of _cache.keys()) {
    if (key.startsWith(prefix)) _cache.delete(key);
  }
}

// Synchronous cache read — returns cached response or null (used to init component state instantly)
export function readCache(url, params) {
  const entry = _cache.get(cacheKey(url, params));
  return entry ? entry.data : null;
}

// Cached GET — returns cached data instantly if fresh, else fetches
export function cachedGet(url, params) {
  const key = cacheKey(url, params);
  const entry = _cache.get(key);
  const now = Date.now();
  const ttl = getTTL(url);

  // Fresh cache hit — return immediately (no network call)
  if (entry && now - entry.ts < ttl) {
    return Promise.resolve(entry.data);
  }

  // Fetch fresh data
  const fetchPromise = api.get(url, { params }).then(res => {
    _cache.set(key, { data: res, ts: Date.now() });
    pruneCache();
    return res;
  });

  if (entry) {
    // Stale cache — return stale instantly, refresh in background
    fetchPromise.catch(() => {});
    return Promise.resolve(entry.data);
  }

  return fetchPromise;
}

// Preload critical data in parallel at app startup (called after login)
export function prefetchCriticalData(role) {
  const common = [
    ['/products', { isAvailable: true }],
    ['/categories', null],
    ['/tables', null],
    ['/settings', null],
  ];
  const adminExtra = [['/users', null]];
  const targets = role === 'admin' ? [...common, ...adminExtra] : common;
  targets.forEach(([url, params]) => {
    const key = cacheKey(url, params);
    if (!_cache.has(key)) {
      api.get(url, { params: params || undefined })
        .then(res => { _cache.set(key, { data: res, ts: Date.now() }); })
        .catch(() => {});
    }
  });
}

// Request interceptor - add token + force local requests through
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // In local mode (relative URLs), use XMLHttpRequest adapter to bypass
  // browser's offline detection that may block requests to localhost
  if (!navigator.onLine && (!config.baseURL || config.baseURL.startsWith('/'))) {
    config.timeout = config.timeout || 5000;
  }
  return config;
});

// Response interceptor - handle 401 + offline queuing + network retry
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (!window.location.pathname.includes('/login')) {
        window.location.replace('/login');
      }
    }

    // If offline and it's a write request, queue for later sync
    // NEVER queue auth or health requests — they need real responses
    if (!navigator.onLine && error.message === 'Network Error') {
      const { method, url, data } = error.config;
      const writeMethods = ['post', 'put', 'patch', 'delete'];
      const noQueuePaths = ['/auth/', '/health', '/sync/'];
      const shouldSkipQueue = noQueuePaths.some(p => url.includes(p));
      if (writeMethods.includes(method) && !shouldSkipQueue) {
        try {
          await queueOfflineAction({ method: method.toUpperCase(), url, data: data ? JSON.parse(data) : undefined });
          return Promise.resolve({ data: { success: true, offline: true, message: 'Action enregistrée hors-ligne' } });
        } catch (e) {
          // Fall through to reject
        }
      }
    }

    return Promise.reject(error);
  }
);

// Auth
export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  getMe: () => api.get('/auth/me'),
  updateProfile: (data) => api.put('/auth/profile', data),
  changePassword: (data) => api.put('/auth/password', data),
  changeUserPassword: (userId, newPassword) => api.put(`/auth/password/${userId}`, { newPassword }),
};

// Users
export const usersAPI = {
  getAll: (params) => cachedGet('/users', params),
  getById: (id) => api.get(`/users/${id}`),
  create: (data) => api.post('/users', data).then(r => { invalidateCache('/users'); return r; }),
  update: (id, data) => api.put(`/users/${id}`, data).then(r => { invalidateCache('/users'); return r; }),
  delete: (id) => api.delete(`/users/${id}`).then(r => { invalidateCache('/users'); return r; }),
};

// Products
export const productsAPI = {
  getAll: (params) => cachedGet('/products', params),
  getById: (id) => api.get(`/products/${id}`),
  create: (data) => api.post('/products', data).then(r => { invalidateCache('/products'); return r; }),
  update: (id, data) => api.put(`/products/${id}`, data).then(r => { invalidateCache('/products'); return r; }),
  delete: (id) => api.delete(`/products/${id}`).then(r => { invalidateCache('/products'); return r; }),
  updateStock: (id, data) => api.patch(`/products/${id}/stock`, data).then(r => { invalidateCache('/products'); return r; }),
};

// Categories
export const categoriesAPI = {
  getAll: () => cachedGet('/categories'),
  create: (data) => api.post('/categories', data).then(r => { invalidateCache('/categories'); return r; }),
  update: (id, data) => api.put(`/categories/${id}`, data).then(r => { invalidateCache('/categories'); return r; }),
  delete: (id) => api.delete(`/categories/${id}`).then(r => { invalidateCache('/categories'); return r; }),
};

// Tables
export const tablesAPI = {
  getAll: (params) => cachedGet('/tables', params),
  create: (data) => api.post('/tables', data).then(r => { invalidateCache('/tables'); return r; }),
  update: (id, data) => api.put(`/tables/${id}`, data).then(r => { invalidateCache('/tables'); return r; }),
  updateStatus: (id, status) => api.patch(`/tables/${id}/status`, { status }).then(r => { invalidateCache('/tables'); return r; }),
  delete: (id) => api.delete(`/tables/${id}`).then(r => { invalidateCache('/tables'); return r; }),
};

// Orders
export const ordersAPI = {
  getAll: (params) => cachedGet('/orders', params),
  getById: (id) => api.get(`/orders/${id}`),
  create: (data) => api.post('/orders', data).then(r => { invalidateCache('/orders'); return r; }),
  updateStatus: (id, status) => api.patch(`/orders/${id}/status`, { status }).then(r => { invalidateCache('/orders'); return r; }),
  updateItemStatus: (orderId, itemId, status) => api.patch(`/orders/${orderId}/items/${itemId}/status`, { status }).then(r => { invalidateCache('/orders'); return r; }),
  delete: (id) => api.delete(`/orders/${id}`).then(r => { invalidateCache('/orders'); return r; }),
};

// Tickets
export const ticketsAPI = {
  getAll: (params) => cachedGet('/tickets', params),
  getById: (id) => api.get(`/tickets/${id}`),
  createInvoice: (tableId) => api.post(`/tickets/invoice/${tableId}`).then(r => { invalidateCache('/tickets'); return r; }),
  createInvoiceFromOrders: (orderIds) => api.post('/tickets/invoice-orders', { orderIds }).then(r => { invalidateCache('/tickets'); return r; }),
  markPrinted: (id) => api.patch(`/tickets/${id}/printed`).then(r => { invalidateCache('/tickets'); return r; }),
  markPaid: (id) => api.patch(`/tickets/${id}/mark-paid`).then(r => { invalidateCache('/tickets'); return r; }),
  delete: (id) => api.delete(`/tickets/${id}`).then(r => { invalidateCache('/tickets'); return r; }),
  adminDelete: (id, credentials) => api.post(`/tickets/${id}/admin-delete`, credentials).then(r => { invalidateCache('/tickets'); return r; }),
  getCounts: () => api.get('/tickets/counts'),
  directInvoice: (data) => api.post('/tickets/direct-invoice', data).then(r => { invalidateCache('/tickets'); return r; }),
  moveToAEncaisser: (id) => api.patch(`/tickets/${id}/a-encaisser`).then(r => { invalidateCache('/tickets'); return r; }),
  addItems: (id, items) => api.patch(`/tickets/${id}/add-items`, { items }).then(r => { invalidateCache('/tickets'); return r; }),
};

// Payments
export const paymentsAPI = {
  getAll: (params) => api.get('/payments', { params }),
  create: (data) => api.post('/payments', data),
  refund: (id) => api.post(`/payments/${id}/refund`),
};

// Cash Register
export const cashRegisterAPI = {
  getAll: (params) => cachedGet('/cash-register', params),
  getCurrent: () => cachedGet('/cash-register/current'),
  getById: (id) => api.get(`/cash-register/${id}`),
  // Caissier methods
  getAgents: () => api.get('/cash-register/agents'),
  openService: (data) => api.post('/cash-register/open-service', data).then(r => { invalidateCache('/cash-register'); return r; }),
  closeService: (data) => api.post('/cash-register/close-service', data).then(r => { invalidateCache('/cash-register'); return r; }),
  agentInvoices: (agentId) => api.get(`/cash-register/agent-invoices/${agentId}`),
  serviceReport: (agentId, params) => api.get(`/cash-register/service-report/${agentId}`, { params }),
  globalReport: (params) => api.get('/cash-register/global-report', { params }),
  dailyDetail: (params) => api.get('/cash-register/daily-detail', { params }),
  closeAll: (data) => api.post('/cash-register/close-all', data).then(r => { invalidateCache('/cash-register'); return r; }),
};

// Clients
export const clientsAPI = {
  getAll: (params) => cachedGet('/clients', params),
  getById: (id) => api.get(`/clients/${id}`),
  getHistory: (id) => api.get(`/clients/${id}/history`),
  getBalance: (id) => api.get(`/clients/${id}/balance`),
  create: (data) => api.post('/clients', data).then(r => { invalidateCache('/clients'); return r; }),
  update: (id, data) => api.put(`/clients/${id}`, data).then(r => { invalidateCache('/clients'); return r; }),
  delete: (id) => api.delete(`/clients/${id}`).then(r => { invalidateCache('/clients'); return r; }),
};

// Stats
export const statsAPI = {
  getDashboard: (params) => cachedGet('/stats/dashboard', params),
  getAgents: (params) => cachedGet('/stats/agents', params),
  getAgent: (id, params) => cachedGet(`/stats/agent/${id}`, params),
  getAgentHistory: (id, params) => cachedGet(`/stats/agent-history/${id}`, params),
  getRevenueChart: (params) => cachedGet('/stats/revenue-chart', params),
  getSales: (params) => cachedGet('/stats/sales', params),
  getProducts: (params) => cachedGet('/stats/products', params),
  getProductAnalytics: (params) => cachedGet('/stats/product-analytics', params),
  getAgentPerformance: (params) => cachedGet('/stats/agent-performance', params),
  getRevenueHistory: (params) => cachedGet('/stats/revenue-history', params),
  getDailyReport: (date) => cachedGet(`/stats/daily-report/${date}`),
  getDailyInvoices: (params) => cachedGet('/stats/daily-invoices', params),
};

// Accounting
export const accountingAPI = {
  getJournal: (params) => cachedGet('/accounting/journal', params),
  getRevenue: (params) => cachedGet('/accounting/revenue', params),
  getExpenses: (params) => cachedGet('/accounting/expenses', params),
  createExpense: (data) => api.post('/accounting/expenses', data).then(r => { invalidateCache('/accounting'); return r; }),
  updateExpense: (id, data) => api.put(`/accounting/expenses/${id}`, data).then(r => { invalidateCache('/accounting'); return r; }),
  deleteExpense: (id) => api.delete(`/accounting/expenses/${id}`).then(r => { invalidateCache('/accounting'); return r; }),
  getBalance: (params) => cachedGet('/accounting/balance', params),
  getLedger: (params) => cachedGet('/accounting/ledger', params),
};

// ── Local Print Server ──
const LOCAL_PRINT_SERVER_KEY = 'localPrintServerUrl';

// Auto-detect: if the app is served from a private IP, we're on the local server
function isServedLocally() {
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(h);
}

// When served locally, use the current origin as the local print server
function getAutoLocalUrl() {
  if (isServedLocally()) return window.location.origin;
  return '';
}

export function getLocalPrintServerUrl() {
  return localStorage.getItem(LOCAL_PRINT_SERVER_KEY) || getAutoLocalUrl();
}

export function setLocalPrintServerUrl(url) {
  if (url) {
    localStorage.setItem(LOCAL_PRINT_SERVER_KEY, url.replace(/\/+$/, ''));
  } else {
    localStorage.removeItem(LOCAL_PRINT_SERVER_KEY);
  }
}

export function isLocalPrintServerConfigured() {
  return !!(localStorage.getItem(LOCAL_PRINT_SERVER_KEY) || isServedLocally());
}

function getLocalPrinterApi() {
  const baseUrl = getLocalPrintServerUrl();
  if (!baseUrl) return null;
  // If served locally and base URL is same origin, just use the main api instance
  if (isServedLocally() && baseUrl === window.location.origin) return api;
  const instance = axios.create({
    baseURL: baseUrl + '/api',
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000,
  });
  const token = localStorage.getItem('token');
  if (token) instance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  return instance;
}

export async function pingLocalPrintServer(url) {
  try {
    const cleanUrl = (url || '').replace(/\/+$/, '');
    const { data } = await axios.get(`${cleanUrl}/api/print-server/ping`, { timeout: 3000 });
    return data?.printServer ? data : null;
  } catch {
    return null;
  }
}

// Printer — routes through local print server when configured or auto-detected, falls back to cloud
export const printerAPI = {
  test: (data) => {
    const local = getLocalPrinterApi();
    return local ? local.post('/printer/test', data) : api.post('/printer/test', data);
  },
  printTicket: (data) => {
    const local = getLocalPrinterApi();
    return local ? local.post('/printer/print-ticket', data) : api.post('/printer/print-ticket', data);
  },
  getStatus: () => {
    const local = getLocalPrinterApi();
    return local ? local.get('/printer/status') : api.get('/printer/status');
  },
  printGlobalReport: (params) => {
    const local = getLocalPrinterApi();
    return local ? local.post('/printer/print-global-report', params) : api.post('/printer/print-global-report', params);
  },
};

// Cloud Sync (tablet → cloud)
export const cloudSyncAPI = {
  getStatus: () => api.get('/sync/status'),
  push: () => api.post('/sync/push'),
};

// Settings
export const settingsAPI = {
  get: () => cachedGet('/settings'),
  update: (data) => api.put('/settings', data).then(r => { invalidateCache('/settings'); return r; }),
};

// Notifications
export const notificationsAPI = {
  getAll: (params) => api.get('/notifications', { params }),
  markAllRead: () => api.patch('/notifications/read-all'),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
  delete: (id) => api.delete(`/notifications/${id}`),
  deleteAll: () => api.delete('/notifications'),
};

export default api;
