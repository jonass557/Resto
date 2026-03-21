import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function MainLayout() {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="ml-64">
        <Outlet />
      </main>
    </div>
  );
}
