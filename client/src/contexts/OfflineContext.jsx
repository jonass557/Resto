import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getPendingActions, removePendingAction, getPendingCount, queueOfflineAction, clearPendingActions } from '@/lib/offlineStorage';
import api from '@/services/api';
import toast from 'react-hot-toast';

const OfflineContext = createContext();

export function OfflineProvider({ children }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  // Listen to online/offline events
  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      toast.success('Connexion rétablie', { icon: '🟢', duration: 3000 });
    };
    const goOffline = () => {
      setIsOnline(false);
      toast('Mode hors-ligne activé', { icon: '🔴', duration: 4000 });
    };

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Refresh pending count
  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getPendingCount();
      setPendingCount(count);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && pendingCount > 0) {
      syncPendingActions();
    }
  }, [isOnline]);

  // Queue an action for offline sync
  const addOfflineAction = async (action) => {
    await queueOfflineAction(action);
    await refreshPendingCount();
  };

  // Sync all pending actions to server
  const syncPendingActions = async () => {
    if (syncing || !isOnline) return;
    setSyncing(true);

    try {
      const actions = await getPendingActions();
      if (actions.length === 0) {
        setSyncing(false);
        return;
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

      if (successCount > 0) {
        toast.success(`${successCount} action(s) synchronisée(s)`, { icon: '🔄', duration: 4000 });
      }
      if (failCount > 0) {
        toast.error(`${failCount} action(s) échouée(s) lors de la synchronisation`);
      }
    } catch (error) {
      console.error('Sync error:', error);
      toast.error('Erreur de synchronisation');
    } finally {
      setSyncing(false);
    }
  };

  // Force clear all pending
  const clearAllPending = async () => {
    await clearPendingActions();
    await refreshPendingCount();
  };

  return (
    <OfflineContext.Provider value={{
      isOnline,
      pendingCount,
      syncing,
      addOfflineAction,
      syncPendingActions,
      clearAllPending,
      refreshPendingCount
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
