import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function TopBar({ title }) {
  return (
    <header className="sticky top-0 z-20 h-14 sm:h-16 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60 border-b flex items-center justify-between px-3 sm:px-6">
      <h1 className="text-base sm:text-xl font-bold truncate">{title}</h1>
      <Button variant="ghost" size="icon" className="relative">
        <Bell className="h-4 w-4" />
      </Button>
    </header>
  );
}
