import { useOffline } from '@/contexts/OfflineContext';
import { RefreshCw, WifiOff, CheckCircle2, AlertCircle, Loader2, Cloud, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';

const STATUS_CONFIG = {
  synced: {
    label: 'Synchronisé',
    color: 'text-green-600',
    bg: 'bg-green-50 border-green-200',
    dot: 'bg-green-500',
  },
  syncing: {
    label: 'Sync...',
    color: 'text-blue-600',
    bg: 'bg-blue-50 border-blue-200',
    dot: 'bg-blue-500',
  },
  pending: {
    label: 'En attente',
    color: 'text-orange-600',
    bg: 'bg-orange-50 border-orange-200',
    dot: 'bg-orange-500',
  },
  offline: {
    label: 'Hors-ligne',
    color: 'text-red-600',
    bg: 'bg-red-50 border-red-200',
    dot: 'bg-red-500',
  },
};

export default function SyncStatusBar({ compact = false }) {
  const {
    syncStatus,
    pendingCount,
    syncing,
    lastSyncAt,
    lastSyncError,
    isOnline,
    syncPendingActions,
    cloudPendingCount,
    cloudSyncing,
    lastCloudSyncAt,
    lastCloudSyncError,
    syncToCloud,
  } = useOffline();

  const config = STATUS_CONFIG[syncStatus] || STATUS_CONFIG.offline;

  const formatTime = (date) => {
    if (!date) return null;
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  // Compact mode for mobile top bar
  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        {/* Status dot */}
        <span className="relative flex h-2 w-2">
          {(syncing || cloudSyncing) && (
            <span className={`absolute inline-flex h-full w-full rounded-full ${config.dot} opacity-75 animate-ping`} />
          )}
          <span className={`relative inline-flex rounded-full h-2 w-2 ${config.dot}`} />
        </span>

        {/* Cloud sync button (compact) */}
        {cloudPendingCount > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-xs text-purple-600"
            onClick={syncToCloud}
            disabled={cloudSyncing}
            title={`${cloudPendingCount} en attente vers le cloud`}
          >
            <UploadCloud className={`w-3.5 h-3.5 ${cloudSyncing ? 'animate-pulse' : ''}`} />
            <span className="ml-1">{cloudPendingCount}</span>
          </Button>
        )}
      </div>
    );
  }

  // Full mode for sidebar
  return (
    <div className="space-y-2">
      {/* Local status */}
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium ${config.bg}`}>
        <span className="relative flex h-2 w-2">
          {syncing && (
            <span className={`absolute inline-flex h-full w-full rounded-full ${config.dot} opacity-75 animate-ping`} />
          )}
          <span className={`relative inline-flex rounded-full h-2 w-2 ${config.dot}`} />
        </span>

        {syncStatus === 'offline' && <WifiOff className={`w-3.5 h-3.5 ${config.color}`} />}
        {syncStatus === 'syncing' && <Loader2 className={`w-3.5 h-3.5 ${config.color} animate-spin`} />}
        {syncStatus === 'synced' && <CheckCircle2 className={`w-3.5 h-3.5 ${config.color}`} />}
        {syncStatus === 'pending' && <AlertCircle className={`w-3.5 h-3.5 ${config.color}`} />}

        <span className={`${config.color} flex-1`}>
          {config.label}
          {pendingCount > 0 && ` (${pendingCount})`}
        </span>

        {lastSyncAt && syncStatus === 'synced' && (
          <span className="text-muted-foreground">{formatTime(lastSyncAt)}</span>
        )}

        {pendingCount > 0 && isOnline && (
          <Button
            size="sm"
            variant="ghost"
            className={`h-5 px-1.5 text-xs ${config.color}`}
            onClick={() => syncPendingActions(false)}
            disabled={syncing}
          >
            <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
          </Button>
        )}
      </div>

      {/* Cloud sync */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-purple-50 border-purple-200 text-xs font-medium">
        <Cloud className="w-3.5 h-3.5 text-purple-600" />
        <span className="text-purple-600 flex-1">
          {cloudSyncing
            ? 'Envoi vers cloud...'
            : cloudPendingCount > 0
              ? `${cloudPendingCount} à envoyer`
              : 'Cloud à jour'}
        </span>

        {lastCloudSyncAt && cloudPendingCount === 0 && (
          <span className="text-muted-foreground">{formatTime(lastCloudSyncAt)}</span>
        )}

        {lastCloudSyncError && (
          <span className="text-red-500 truncate max-w-[80px]" title={lastCloudSyncError}>!</span>
        )}

        <Button
          size="sm"
          variant="ghost"
          className="h-5 px-1.5 text-xs text-purple-600"
          onClick={syncToCloud}
          disabled={cloudSyncing}
          title="Synchroniser vers le cloud"
        >
          <UploadCloud className={`w-3 h-3 ${cloudSyncing ? 'animate-pulse' : ''}`} />
        </Button>
      </div>
    </div>
  );
}
