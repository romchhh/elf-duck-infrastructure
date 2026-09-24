import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { crmFetch } from '@/lib/crmFetch';
import {
  clearCrmSessionToken,
  getCrmSessionToken,
  setCrmSessionToken,
} from '@/lib/crmSession';

export default function CrmAuthGate({ children }) {
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['crm-auth-session'],
    queryFn: async () => {
      const response = await crmFetch('/crm/auth/session');
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.ok === false) {
        throw new Error(result?.error || 'SESSION_CHECK_FAILED');
      }
      return result;
    },
    retry: false,
  });

  useEffect(() => {
    if (data?.authenticated === false && getCrmSessionToken()) {
      clearCrmSessionToken();
    }
  }, [data?.authenticated]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoginError('');
    setLoginLoading(true);

    try {
      const response = await crmFetch('/crm/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || result?.ok === false) {
        setLoginError(
          result?.error === 'INVALID_CRM_PASSWORD'
            ? 'Неверный пароль'
            : result?.error === 'CRM_ADMIN_PASSWORD_NOT_CONFIGURED'
              ? 'На сервере не задан CRM_ADMIN_PASSWORD'
              : result?.error === 'CRM_SESSION_SECRET_NOT_CONFIGURED'
                ? 'На сервере не задан CRM_SESSION_SECRET'
                : result?.error || 'Ошибка входа'
        );
        return;
      }

      if (result?.sessionToken) {
        setCrmSessionToken(result.sessionToken);
      }

      setPassword('');
      await queryClient.invalidateQueries({ queryKey: ['crm-auth-session'] });
      await refetch();
    } catch {
      setLoginError('Не удалось подключиться к API');
    } finally {
      setLoginLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Проверка доступа…
      </div>
    );
  }

  if (isError || !data?.authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm"
        >
          <h1 className="text-lg font-semibold text-foreground">ElfDuck CRM</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Введите пароль администратора для доступа к панели.
          </p>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-4 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="Пароль CRM"
          />
          {loginError ? (
            <p className="mt-2 text-sm text-destructive">{loginError}</p>
          ) : null}
          <button
            type="submit"
            disabled={loginLoading || !password.trim()}
            className="mt-4 w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {loginLoading ? 'Вход…' : 'Войти'}
          </button>
        </form>
      </div>
    );
  }

  return children;
}
