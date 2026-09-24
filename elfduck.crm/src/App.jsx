import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClientInstance } from "@/lib/query-client";
import {
  BrowserRouter as Router,
  Route,
  Routes,
  Navigate,
} from "react-router-dom";

import ScrollToTop from "./components/ScrollToTop";
import { PeriodProvider } from "@/lib/PeriodContext";

import AppShell from "@/components/layout/AppShell";
import CrmAuthGate from "@/components/CrmAuthGate";

import Dashboard from "@/pages/Dashboard";
import Orders from "@/pages/Orders";
import Customers from "@/pages/Customers";
import Leads from "@/pages/Leads";
import Partners from "@/pages/Partners";
import Cashback from "@/pages/Cashback";
import Push from "@/pages/Push";
import Products from "@/pages/Products";
import Locations from "@/pages/Locations";

function AppRoutes() {
  return (
    <Routes>
      <Route
        element={
          <CrmAuthGate>
            <AppShell />
          </CrmAuthGate>
        }
      >
        <Route path="/" element={<Dashboard />} />

        <Route path="/sales/orders" element={<Orders />} />
        <Route path="/sales/customers" element={<Customers />} />
        <Route path="/sales/leads" element={<Leads />} />

        <Route path="/marketing/partners" element={<Partners />} />
        <Route path="/marketing/cashback" element={<Cashback />} />
        <Route path="/marketing/push" element={<Push />} />

        <Route path="/analytics/products" element={<Products />} />
        <Route path="/analytics/locations" element={<Locations />} />
      </Route>

      {/* Старые страницы авторизации больше не существуют */}
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/register" element={<Navigate to="/" replace />} />
      <Route path="/forgot-password" element={<Navigate to="/" replace />} />
      <Route path="/reset-password" element={<Navigate to="/" replace />} />

      {/* Любой неизвестный адрес ведёт на дашборд */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <Router>
        <ScrollToTop />

        <PeriodProvider>
          <AppRoutes />
        </PeriodProvider>
      </Router>

      <Toaster />
    </QueryClientProvider>
  );
}

export default App;