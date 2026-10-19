import { Toaster } from "@/components/ui/toaster";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClientInstance } from "@/lib/query-client";

import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import {
  AuthProvider,
} from "@/lib/AuthContext";

import ProtectedRoute from "@/components/ProtectedRoute";

import Layout from "@/components/Layout";
import ScrollToTop from "@/components/ScrollToTop";

import Login from "@/pages/Login";

import Dashboard from "@/pages/Dashboard";
import Campaigns from "@/pages/Campaigns";
import CampaignDetail from "@/pages/CampaignDetail";

import Accounts from "@/pages/Accounts";
import AccountDetail from "@/pages/AccountDetail";

import Logs from "@/pages/Logs";
import Parser from "@/pages/Parser";
import Settings from "@/pages/Settings";

function AppRoutes() {
  return (
    <Routes>
      {/* Публичная страница */}
      <Route
        path="/login"
        element={<Login />}
      />

      {/* Приватная часть */}
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route
            path="/"
            element={<Dashboard />}
          />

          <Route
            path="/campaigns"
            element={<Campaigns />}
          />

          <Route
            path="/campaigns/:campaignId"
            element={<CampaignDetail />}
          />

          <Route
            path="/accounts"
            element={<Accounts />}
          />

          <Route
            path="/accounts/:sender"
            element={<AccountDetail />}
          />

          <Route
            path="/logs"
            element={<Logs />}
          />

          <Route path="/parser" element={<Parser />} />

          <Route
            path="/settings"
            element={<Settings />}
          />
        </Route>
      </Route>

      <Route
        path="*"
        element={<Navigate to="/" replace />}
      />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider
      client={queryClientInstance}
    >
      <AuthProvider>
        <BrowserRouter>
          <ScrollToTop />
          <AppRoutes />
        </BrowserRouter>

        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}