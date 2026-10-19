import React, { useState } from "react";

import { Navigate, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  LogIn,
  User,
  Lock,
  Loader2,
} from "lucide-react";

import AuthLayout from "@/components/AuthLayout";
import { useAuth } from "@/lib/AuthContext";

export default function Login() {
  const navigate = useNavigate();

  const {
    login,
    isAuthenticated,
    isLoadingAuth,
  } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      await login(username.trim(), password);

      navigate("/", { replace: true });
    } catch (err) {
      setError(
        err.message || "Не удалось выполнить вход"
      );
    } finally {
      setLoading(false);
    }
  };

  if (isLoadingAuth) {
    return null;
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <AuthLayout
      icon={LogIn}
      title="Tegger Admin"
      subtitle="Войдите в панель управления"
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-4"
      >
        <div className="space-y-2">
          <Label htmlFor="username">
            Логин
          </Label>

          <div className="relative">
            <User
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
            />

            <Input
              id="username"
              type="text"
              autoComplete="username"
              autoFocus
              placeholder="Введите логин"
              value={username}
              onChange={(event) =>
                setUsername(event.target.value)
              }
              className="pl-10 h-12"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">
            Пароль
          </Label>

          <div className="relative">
            <Lock
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
            />

            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="Введите пароль"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              className="pl-10 h-12"
              required
            />
          </div>
        </div>

        <Button
          type="submit"
          className="w-full h-12 font-medium"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Выполняется вход...
            </>
          ) : (
            "Войти"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}