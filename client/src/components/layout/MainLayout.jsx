import { useState, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { Menu } from 'lucide-react';

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleCollapse = useCallback(() => setCollapsed(c => !c), []);

  const sidebarWidth = collapsed ? 'lg:ml-14' : 'lg:ml-64';
  const drawerWidth = collapsed ? 'w-14' : 'w-64';

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 h-14 bg-card border-b flex items-center px-4 gap-3">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 -ml-1 rounded-lg hover:bg-accent active:bg-accent/80 transition-colors"
          aria-label="Menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="font-semibold text-sm">Restaurant Manager</span>
      </div>

      {/* Mobile overlay */}
      <div
        className={`lg:hidden fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 ${sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={closeSidebar}
      />

      {/* Sidebar — drawer on mobile, fixed on desktop */}
      <div
        className={`fixed inset-y-0 left-0 z-50 transition-all duration-200 ease-out lg:translate-x-0 ${drawerWidth} ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <Sidebar
          onNavigate={closeSidebar}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
        />
      </div>

      {/* Main content */}
      <main className={`${sidebarWidth} pt-14 lg:pt-0 min-h-screen transition-all duration-200`}>
        <Outlet />
      </main>
    </div>
  );
}
