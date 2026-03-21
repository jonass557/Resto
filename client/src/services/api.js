import axios from 'axios';

const API_URL = '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' }
});

// Request interceptor - add token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor - handle 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
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
};

// Users
export const usersAPI = {
  getAll: (params) => api.get('/users', { params }),
  getById: (id) => api.get(`/users/${id}`),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
};

// Products
export const productsAPI = {
  getAll: (params) => api.get('/products', { params }),
  getById: (id) => api.get(`/products/${id}`),
  create: (data) => api.post('/products', data),
  update: (id, data) => api.put(`/products/${id}`, data),
  delete: (id) => api.delete(`/products/${id}`),
  updateStock: (id, data) => api.patch(`/products/${id}/stock`, data),
};

// Categories
export const categoriesAPI = {
  getAll: () => api.get('/categories'),
  create: (data) => api.post('/categories', data),
  update: (id, data) => api.put(`/categories/${id}`, data),
  delete: (id) => api.delete(`/categories/${id}`),
};

// Tables
export const tablesAPI = {
  getAll: (params) => api.get('/tables', { params }),
  create: (data) => api.post('/tables', data),
  update: (id, data) => api.put(`/tables/${id}`, data),
  updateStatus: (id, status) => api.patch(`/tables/${id}/status`, { status }),
  delete: (id) => api.delete(`/tables/${id}`),
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
  getDashboard: (params) => api.get('/stats/dashboard', { params }),
  getAgents: (params) => api.get('/stats/agents', { params }),
  getAgent: (id, params) => api.get(`/stats/agent/${id}`, { params }),
  getSales: (params) => api.get('/stats/sales', { params }),
  getProducts: (params) => api.get('/stats/products', { params }),
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

// Printer
export const printerAPI = {
  test: (data) => api.post('/printer/test', data),
  printTicket: (data) => api.post('/printer/print-ticket', data),
  getStatus: () => api.get('/printer/status'),
};

// Settings
export const settingsAPI = {
  get: () => api.get('/settings'),
  update: (data) => api.put('/settings', data),
};

export default api;
