import axios from 'axios';
import { queueOfflineAction } from '@/lib/offlineStorage';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' }
});

// ── In-memory GET cache (stale-while-revalidate) ──
const _cache = new Map();
const CACHE_TTL = 30000; // 30s default — serve instantly, revalidate in background
const CACHE_TTL_SHORT = 15000; // 15s for volatile data (orders, tables, tickets)
const MAX_CACHE = 100;

// URLs that change frequently and need a shorter TTL
const SHORT_TTL_PREFIXES = ['/orders', '/tables', '/tickets', '/stats/supervision'];

function cacheKey(url, params) {
  return url + (params ? '?' + new URLSearchParams(params).toString() : '');
}

function pruneCache() {
  if (_cache.size > MAX_CACHE) {
    const oldest = [..._cache.entries()].sort((a, b) => a[1].ts - b[1].ts);
    for (let i = 0; i < 20; i++) _cache.delete(oldest[i][0]);
  }
}

// Invalidate cache entries matching a prefix (called on write ops)
export function invalidateCache(prefix) {
  for (const key of _cache.keys()) {
    if (key.startsWith(prefix)) _cache.delete(key);
  }
}

// Cached GET — returns cached data instantly if fresh, else fetches
export function cachedGet(url, params) {
  const key = cacheKey(url, params);
  const entry = _cache.get(key);
  const now = Date.now();
  const ttl = SHORT_TTL_PREFIXES.some(p => url.startsWith(p)) ? CACHE_TTL_SHORT : CACHE_TTL;

  // Fresh cache hit — return immediately
  if (entry && now - entry.ts < ttl) {
    return Promise.resolve(entry.data);
  }

  // Stale cache — return stale data but refresh in background
  const fetchPromise = api.get(url, { params }).then(res => {
    _cache.set(key, { data: res, ts: Date.now() });
    pruneCache();
    return res;
  });

  if (entry) {
    // Trigger background revalidation, return stale immediately
    fetchPromise.catch(() => {});
    return Promise.resolve(entry.data);
  }

  return fetchPromise;
}

// Request interceptor - add token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
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
      window.location.href = '/login';
    }

    // If offline and it's a write request, queue for later sync
    if (!navigator.onLine && error.message === 'Network Error') {
      const { method, url, data } = error.config;
      const writeMethods = ['post', 'put', 'patch', 'delete'];
      if (writeMethods.includes(method)) {
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
  getAll: (params) => api.get('/orders', { params }),
  getById: (id) => api.get(`/orders/${id}`),
  create: (data) => api.post('/orders', data),
  updateStatus: (id, status) => api.patch(`/orders/${id}/status`, { status }),
  updateItemStatus: (orderId, itemId, status) => api.patch(`/orders/${orderId}/items/${itemId}/status`, { status }),
  delete: (id) => api.delete(`/orders/${id}`),
};

// Tickets
export const ticketsAPI = {
  getAll: (params) => api.get('/tickets', { params }),
  getById: (id) => api.get(`/tickets/${id}`),
  createInvoice: (tableId) => api.post(`/tickets/invoice/${tableId}`),
  createInvoiceFromOrders: (orderIds) => api.post('/tickets/invoice-orders', { orderIds }),
  markPrinted: (id) => api.patch(`/tickets/${id}/printed`),
  markPaid: (id) => api.patch(`/tickets/${id}/mark-paid`),
  delete: (id) => api.delete(`/tickets/${id}`),
};

// Payments
export const paymentsAPI = {
  getAll: (params) => api.get('/payments', { params }),
  create: (data) => api.post('/payments', data),
  refund: (id) => api.post(`/payments/${id}/refund`),
};

// Cash Register
export const cashRegisterAPI = {
  getAll: (params) => api.get('/cash-register', { params }),
  getCurrent: () => api.get('/cash-register/current'),
  open: (data) => api.post('/cash-register/open', data),
  close: (data) => api.post('/cash-register/close', data),
  getById: (id) => api.get(`/cash-register/${id}`),
};

// Clients
export const clientsAPI = {
  getAll: (params) => api.get('/clients', { params }),
  getById: (id) => api.get(`/clients/${id}`),
  getHistory: (id) => api.get(`/clients/${id}/history`),
  getBalance: (id) => api.get(`/clients/${id}/balance`),
  create: (data) => api.post('/clients', data),
  update: (id, data) => api.put(`/clients/${id}`, data),
  delete: (id) => api.delete(`/clients/${id}`),
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
  getJournal: (params) => api.get('/accounting/journal', { params }),
  getRevenue: (params) => api.get('/accounting/revenue', { params }),
  getExpenses: (params) => api.get('/accounting/expenses', { params }),
  createExpense: (data) => api.post('/accounting/expenses', data),
  updateExpense: (id, data) => api.put(`/accounting/expenses/${id}`, data),
  deleteExpense: (id) => api.delete(`/accounting/expenses/${id}`),
  getBalance: (params) => api.get('/accounting/balance', { params }),
  getLedger: (params) => api.get('/accounting/ledger', { params }),
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
};

// Settings
export const settingsAPI = {
  get: () => api.get('/settings'),
  update: (data) => api.put('/settings', data),
};

// Notifications
export const notificationsAPI = {
  getAll: (params) => api.get('/notifications', { params }),
  markAllRead: () => api.patch('/notifications/read-all'),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
};

export default api;
