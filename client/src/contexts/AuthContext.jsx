import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { authAPI, prefetchCriticalData } from '../services/api';

const AuthContext = createContext(null);

// Read cached user from localStorage instantly (no async)
function getCachedUser() {
  try {
    const cached = localStorage.getItem('user');
    return cached ? JSON.parse(cached) : null;
  } catch { return null; }
}

export function AuthProvider({ children }) {
  const storedToken = localStorage.getItem('token');
  const cachedUser = getCachedUser();

  const [user, setUser] = useState(storedToken ? cachedUser : null);
  const [token, setToken] = useState(storedToken);
  // If we have a cached user + token, skip the loading state entirely
  const [loading, setLoading] = useState(storedToken && !cachedUser);
  const didRefresh = useRef(false);

  // Background refresh: validate token + update user data silently
  useEffect(() => {
    if (!token || didRefresh.current) return;
    didRefresh.current = true;

    // If we have no cached user, we must wait for this call
    const mustWait = !cachedUser;

    const refresh = async () => {
      try {
        const { data } = await authAPI.getMe();
        setUser(data.data);
        localStorage.setItem('user', JSON.stringify(data.data));
        prefetchCriticalData(data.data.role);
      } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setToken(null);
        setUser(null);
      } finally {
        if (mustWait) setLoading(false);
      }
    };
    refresh();
  }, [token]);

  const login = async (email, password) => {
    const { data } = await authAPI.login({ email, password });
    const { user: userData, token: newToken } = data.data;
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(userData));
    didRefresh.current = true; // Données fraîches reçues du login — skip getMe()
    setToken(newToken);
    setUser(userData);
    prefetchCriticalData(userData.role);
    return userData;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    didRefresh.current = false;
  };

  const updateUser = (userData) => {
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
  };

  return (
    <AuthContext.Provider value={{
      user, token, loading, login, logout, updateUser,
      isAdmin: user?.role === 'admin',
      isAgent: user?.role === 'agent',
      isCaissier: user?.role === 'caissier',
      isAuthenticated: !!user
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
