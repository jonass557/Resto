import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getPendingActions, removePendingAction, getPendingCount, queueOfflineAction, clearPendingActions } from '@/lib/offlineStorage';
import api from '@/services/api';
import { cloudSyncAPI } from '@/services/api';
import toast from 'react-hot-toast';

const OfflineContext = createContext();

// Sync retry interval when pending actions exist (30s)
const RETRY_INTERVAL = 30000;

export function OfflineProvider({ children }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isServerReachable, setIsServerReachable] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [lastSyncError, setLastSyncError] = useState(null);
  const retryTimer = useRef(null);

  // Listen to online/offline events
  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      toast.success('Connexion rétablie', { icon: '🟢', duration: 3000 });
    };
    const goOffline = () => {
      setIsOnline(false);
      setIsServerReachable(false);
      toast('Mode hors-ligne activé', { icon: '🔴', duration: 4000 });
    };

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Ping server to check real connectivity (not just WiFi link)
  // On local WiFi without internet, navigator.onLine is often false
  // but the local server IS reachable — this ping is the source of truth
  const checkServerReachable = useCallback(async () => {
    try {
      await api.get('/health', { timeout: 5000 });
      setIsServerReachable(true);
      return true;
    } catch {
      setIsServerReachable(false);
      return false;
    }
  }, []);

  // Check server when navigator goes online AND periodically
  // (handles local WiFi where navigator.onLine stays false)
  useEffect(() => {
    checkServerReachable();
    const interval = setInterval(checkServerReachable, 15000);
    return () => clearInterval(interval);
  }, [checkServerReachable]);

  // Refresh pending count
  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getPendingCount();
      setPendingCount(count);
      return count;
    } catch { return 0; }
  }, []);

  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  // Queue an action for offline sync
  const addOfflineAction = async (action) => {
    await queueOfflineAction(action);
    await refreshPendingCount();
  };

  // Sync all pending actions to server
  const syncPendingActions = useCallback(async (silent = false) => {
    if (syncing) return { success: 0, failed: 0 };
    setSyncing(true);
    setLastSyncError(null);

    try {
      const reachable = await checkServerReachable();
      if (!reachable) {
        if (!silent) toast.error('Serveur inaccessible — synchronisation impossible');
        setLastSyncError('Serveur inaccessible');
        return { success: 0, failed: 0 };
      }

      const actions = await getPendingActions();
      if (actions.length === 0) {
        setLastSyncAt(new Date());
        if (!silent) toast.success('Tout est synchronisé', { icon: '✅', duration: 2000 });
        return { success: 0, failed: 0 };
      }

      let successCount = 0;
      let failCount = 0;

      for (const action of actions) {
        try {
          const { method, url, data } = action;
          if (method === 'POST') {
            await api.post(url, data);
          } else if (method === 'PUT') {
            await api.put(url, data);
          } else if (method === 'PATCH') {
            await api.patch(url, data);
          } else if (method === 'DELETE') {
            await api.delete(url);
          }
          await removePendingAction(action.id);
          successCount++;
        } catch (error) {
          console.error('Sync failed for action:', action, error);
          failCount++;
        }
      }

      await refreshPendingCount();
      setLastSyncAt(new Date());

      if (successCount > 0 && !silent) {
        toast.success(`${successCount} action(s) synchronisée(s)`, { icon: '🔄', duration: 4000 });
      }
      if (failCount > 0) {
        const msg = `${failCount} action(s) échouée(s)`;
        setLastSyncError(msg);
        if (!silent) toast.error(msg);
      }

      return { success: successCount, failed: failCount };
    } catch (error) {
      console.error('Sync error:', error);
      setLastSyncError(error.message);
      if (!silent) toast.error('Erreur de synchronisation');
      return { success: 0, failed: 0 };
    } finally {
      setSyncing(false);
    }
  }, [syncing, checkServerReachable, refreshPendingCount]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && pendingCount > 0) {
      const timer = setTimeout(() => syncPendingActions(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [isOnline]);

  // Periodic retry when pending actions exist
  useEffect(() => {
    if (retryTimer.current) clearInterval(retryTimer.current);

    if (pendingCount > 0) {
      retryTimer.current = setInterval(async () => {
        if (!syncing && navigator.onLine) {
          await syncPendingActions(true);
        }
      }, RETRY_INTERVAL);
    }

    return () => {
      if (retryTimer.current) clearInterval(retryTimer.current);
    };
  }, [pendingCount, syncing]);

  // Force clear all pending
  const clearAllPending = async () => {
    await clearPendingActions();
    await refreshPendingCount();
  };

  // ── Cloud sync (tablet DB → Render cloud) ─────────────────────────────────
  const [cloudPendingCount, setCloudPendingCount] = useState(0);
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [lastCloudSyncAt, setLastCloudSyncAt] = useState(null);
  const [lastCloudSyncError, setLastCloudSyncError] = useState(null);

  // Refresh how many documents need to be synced to cloud
  const refreshCloudStatus = useCallback(async () => {
    try {
      const { data } = await cloudSyncAPI.getStatus();
      setCloudPendingCount(data.data?.total || 0);
      return data.data?.total || 0;
    } catch { return 0; }
  }, []);

  // Refresh cloud status on mount and periodically
  useEffect(() => {
    refreshCloudStatus();
    const interval = setInterval(refreshCloudStatus, 60000);
    return () => clearInterval(interval);
  }, [refreshCloudStatus]);

  // Push all unsynced data to cloud
  const syncToCloud = useCallback(async () => {
    if (cloudSyncing) return;
    setCloudSyncing(true);
    setLastCloudSyncError(null);

    try {
      const { data } = await cloudSyncAPI.push();
      setLastCloudSyncAt(new Date());
      await refreshCloudStatus();

      if (data.success) {
        toast.success(data.message, { icon: '☁️', duration: 5000 });
      } else {
        setLastCloudSyncError(data.message);
        toast.error(data.message, { duration: 5000 });
      }
      return data;
    } catch (error) {
      const msg = error.response?.data?.message || error.message;
      setLastCloudSyncError(msg);
      toast.error(`Erreur sync cloud: ${msg}`, { duration: 5000 });
      return null;
    } finally {
      setCloudSyncing(false);
    }
  }, [cloudSyncing, refreshCloudStatus]);

  // Derived status for UI
  // Use isServerReachable as primary indicator (works even when navigator.onLine is false on local WiFi)
  const syncStatus = syncing
    ? 'syncing'
    : pendingCount > 0
      ? 'pending'
      : isServerReachable
        ? 'synced'
        : 'offline';

  return (
    <OfflineContext.Provider value={{
      isOnline,
      isServerReachable,
      pendingCount,
      syncing,
      lastSyncAt,
      lastSyncError,
      syncStatus,
      addOfflineAction,
      syncPendingActions,
      clearAllPending,
      refreshPendingCount,
      checkServerReachable,
      cloudPendingCount,
      cloudSyncing,
      lastCloudSyncAt,
      lastCloudSyncError,
      syncToCloud,
      refreshCloudStatus
    }}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  const context = useContext(OfflineContext);
  if (!context) throw new Error('useOffline must be used within OfflineProvider');
  return context;
}
