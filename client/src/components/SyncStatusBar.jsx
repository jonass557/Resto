import { useOffline } from '@/contexts/OfflineContext';
import { RefreshCw, Wifi, WifiOff, CheckCircle2, AlertCircle, Loader2, CloudOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

const STATUS_CONFIG = {
  synced: {
    icon: CheckCircle2,
    label: 'Synchronisé',
    color: 'text-green-600',
    bg: 'bg-green-50 border-green-200',
    dot: 'bg-green-500',
  },
  syncing: {
    icon: Loader2,
    label: 'Synchronisation...',
    color: 'text-blue-600',
    bg: 'bg-blue-50 border-blue-200',
    dot: 'bg-blue-500',
  },
  pending: {
    icon: AlertCircle,
    label: 'En attente',
    color: 'text-orange-600',
    bg: 'bg-orange-50 border-orange-200',
    dot: 'bg-orange-500',
  },
  offline: {
    icon: WifiOff,
    label: 'Hors-ligne',
    color: 'text-red-600',
    bg: 'bg-red-50 border-red-200',
    dot: 'bg-red-500',
  },
};

export default function SyncStatusBar() {
  const {
    syncStatus,
    pendingCount,
    syncing,
    lastSyncAt,
    lastSyncError,
    isOnline,
    syncPendingActions,
  } = useOffline();

  const config = STATUS_CONFIG[syncStatus] || STATUS_CONFIG.offline;
  const Icon = config.icon;

  const formatTime = (date) => {
    if (!date) return null;
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium ${config.bg}`}>
      {/* Status dot */}
      <span className="relative flex h-2 w-2">
        {syncStatus === 'syncing' && (
          <span className={`absolute inline-flex h-full w-full rounded-full ${config.dot} opacity-75 animate-ping`} />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${config.dot}`} />
      </span>

      {/* Icon */}
      <Icon className={`w-3.5 h-3.5 ${config.color} ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />

      {/* Label */}
      <span className={config.color}>
        {config.label}
        {pendingCount > 0 && ` (${pendingCount})`}
      </span>

      {/* Last sync time */}
      {lastSyncAt && syncStatus === 'synced' && (
        <span className="text-muted-foreground ml-1">
          {formatTime(lastSyncAt)}
        </span>
      )}

      {/* Error indicator */}
      {lastSyncError && syncStatus === 'pending' && (
        <span className="text-red-500 truncate max-w-[120px]" title={lastSyncError}>
          {lastSyncError}
        </span>
      )}

      {/* Sync button */}
      {pendingCount > 0 && isOnline && (
        <Button
          size="sm"
          variant="ghost"
          className={`h-6 px-2 text-xs ${config.color} hover:${config.color}`}
          onClick={() => syncPendingActions(false)}
          disabled={syncing}
        >
          <RefreshCw className={`w-3 h-3 mr-1 ${syncing ? 'animate-spin' : ''}`} />
          Sync
        </Button>
      )}
    </div>
  );
}
