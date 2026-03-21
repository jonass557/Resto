const DB_NAME = 'restaurant_offline_db';
const DB_VERSION = 1;
const STORES = {
  pendingActions: 'pendingActions',
  cachedData: 'cachedData'
};

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORES.pendingActions)) {
        db.createObjectStore(STORES.pendingActions, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORES.cachedData)) {
        db.createObjectStore(STORES.cachedData, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Queue an API action to be synced when back online
export async function queueOfflineAction(action) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.pendingActions, 'readwrite');
    const store = tx.objectStore(STORES.pendingActions);
    store.add({ ...action, timestamp: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Get all pending actions
export async function getPendingActions() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.pendingActions, 'readonly');
    const store = tx.objectStore(STORES.pendingActions);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Remove a synced action
export async function removePendingAction(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.pendingActions, 'readwrite');
    const store = tx.objectStore(STORES.pendingActions);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Clear all pending actions
export async function clearPendingActions() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.pendingActions, 'readwrite');
    const store = tx.objectStore(STORES.pendingActions);
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Cache data for offline use
export async function cacheData(key, data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.cachedData, 'readwrite');
    const store = tx.objectStore(STORES.cachedData);
    store.put({ key, data, updatedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Get cached data
export async function getCachedData(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.cachedData, 'readonly');
    const store = tx.objectStore(STORES.cachedData);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result?.data || null);
    request.onerror = () => reject(request.error);
  });
}

// Get count of pending actions
export async function getPendingCount() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.pendingActions, 'readonly');
    const store = tx.objectStore(STORES.pendingActions);
    const request = store.count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
