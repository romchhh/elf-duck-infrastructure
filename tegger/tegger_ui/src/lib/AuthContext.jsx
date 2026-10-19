import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import { teggerClient } from "@/api/teggerClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  const isAuthenticated = Boolean(user);

  const checkUserAuth = async () => {
    try {
      const currentUser = await teggerClient.auth.me();

      setUser(currentUser);

      return currentUser;
    } catch {
      setUser(null);

      return null;
    } finally {
      setIsLoadingAuth(false);
    }
  };

  useEffect(() => {
    checkUserAuth();
  }, []);

  const login = async (username, password) => {
    const response = await teggerClient.auth.login(
      username,
      password
    );

    setUser(response.user);

    return response.user;
  };

  const logout = async () => {
    try {
      await teggerClient.auth.logout();
    } finally {
      setUser(null);
    }
  };

  const value = {
    user,
    isAuthenticated,
    isLoadingAuth,
    login,
    logout,
    checkUserAuth,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used within AuthProvider"
    );
  }

  return context;
}