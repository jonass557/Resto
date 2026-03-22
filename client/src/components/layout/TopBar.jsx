import { useSocket } from '@/contexts/SocketContext';
import { Bell, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function TopBar({ title }) {
  const { connected } = useSocket();

  return (
    <header className="sticky top-0 z-20 h-14 sm:h-16 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60 border-b flex items-center justify-between px-3 sm:px-6">
      <h1 className="text-base sm:text-xl font-bold truncate">{title}</h1>
      <div className="flex items-center gap-2">
        {connected ? (
          <Badge variant="outline" className="gap-1 text-green-600 border-green-200 bg-green-50">
            <Wifi className="h-3 w-3" />
            <span className="text-xs hidden sm:inline">En ligne</span>
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 text-red-600 border-red-200 bg-red-50">
            <WifiOff className="h-3 w-3" />
            <span className="text-xs hidden sm:inline">Hors ligne</span>
          </Badge>
        )}
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
