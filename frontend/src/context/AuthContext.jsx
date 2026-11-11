import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

const TOKEN_KEY = 'lm_token';
const USER_KEY = 'lm_user';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session on boot
  useEffect(() => {
    const boot = async () => {
      const savedToken = localStorage.getItem(TOKEN_KEY);
      const savedUser = localStorage.getItem(USER_KEY);

      if (!savedToken) {
        setLoading(false);
        return;
      }

      setToken(savedToken);
      if (savedUser) {
        try {
          setUser(JSON.parse(savedUser));
        } catch {
          /* ignore corrupt cache */
        }
      }

      try {
        const { data } = await authAPI.me();
        const nextUser = data.user || data;
        setUser(nextUser);
        localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    boot();
  }, []);

  const persistSession = useCallback((nextToken, nextUser) => {
    localStorage.setItem(TOKEN_KEY, nextToken);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  const login = useCallback(
    async (email, password) => {
      const { data } = await authAPI.login({ email, password });
      const nextToken = data?.token;
      const nextUser = data?.user;
      if (!nextToken || !nextUser) {
        throw new Error('Invalid login response from server');
      }
      persistSession(nextToken, nextUser);
      return nextUser;
    },
    [persistSession]
  );

  const register = useCallback(
    async ({ name, email, password, role }) => {
      const payload = { name, email, password };
      if (role) payload.role = role;

      const { data } = await authAPI.register(payload);
      const nextToken = data.token;
      const nextUser = data.user;

      // Some backends register without auto-login — handle both
      if (nextToken && nextUser) {
        persistSession(nextToken, nextUser);
        return nextUser;
      }

      // Fallback: login after register
      return login(email, password);
    },
    [login, persistSession]
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const updateUser = useCallback((updatedUser) => {
    setUser((prev) => {
      const merged = { ...(prev || {}), ...updatedUser };
      localStorage.setItem(USER_KEY, JSON.stringify(merged));
      return merged;
    });
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      isAuthenticated: Boolean(token && user),
      isAdmin: user?.role === 'admin',
      login,
      register,
      logout,
      updateUser,
    }),
    [user, token, loading, login, register, logout, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

export default AuthContext;