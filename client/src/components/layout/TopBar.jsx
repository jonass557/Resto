import { useAuth } from '@/contexts/AuthContext';
import { useSocket } from '@/contexts/SocketContext';
import { Bell, Wifi, WifiOff, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

export default function TopBar({ title }) {
  const { user } = useAuth();
  const { connected } = useSocket();

  return (
    <header className="sticky top-0 z-30 h-16 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60 border-b flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-bold">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Rechercher..." className="pl-9 w-64 h-9" />
        </div>

        <div className="flex items-center gap-1">
          {connected ? (
            <Badge variant="outline" className="gap-1 text-green-600 border-green-200 bg-green-50">
              <Wifi className="h-3 w-3" />
              <span className="text-xs">En ligne</span>
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-red-600 border-red-200 bg-red-50">
              <WifiOff className="h-3 w-3" />
              <span className="text-xs">Hors ligne</span>
            </Badge>
          )}
        </div>

        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        </Button>
      </div>
    </header>
  );
}
