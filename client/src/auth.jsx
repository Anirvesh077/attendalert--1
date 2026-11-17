import { createContext, useContext, useState } from 'react';
import { api, tokenStore } from './api.js';

const AuthContext = createContext(null);
const USER_KEY = 'attendalert.user';

function loadUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY)) ?? null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => (tokenStore.get() ? loadUser() : null));

  async function login(role, identifier, password) {
    const { token, user: u } = await api.login({ role, identifier, password });
    tokenStore.set(token);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setUser(u);
    return u;
  }

  function logout() {
    tokenStore.clear();
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
