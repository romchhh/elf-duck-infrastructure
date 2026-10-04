import { Routes, Route, useLocation, useNavigate } from "react-router-dom";
import React, { useEffect, Suspense } from "react";
import MainPage from "./pages/MainPage";
import DesktopShell from "./components/DesktopShell.jsx";
import { subscribeDesktopLayout } from "./utils/desktopLayout.js";

const ReferralPage = React.lazy(() => import("./pages/ReferralPage"));
const CartPage = React.lazy(() => import("./pages/CartPage"));
const OrdersPage = React.lazy(() => import("./pages/OrdersPage"));
const FavoritePage = React.lazy(() => import("./pages/FavoritePage"));
const ManagersPage = React.lazy(() => import("./pages/ManagersPage"));
const PromoPage = React.lazy(() => import("./pages/PromoPage"));

if (typeof window !== "undefined") {
  const warmupCheckoutRoutes = () => {
    import("./pages/CartPage");
    import("./pages/OrdersPage");
  };

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(warmupCheckoutRoutes, { timeout: 4000 });
  } else {
    setTimeout(warmupCheckoutRoutes, 2500);
  }
}

const routeFallbackStyle = {
  flex: 1,
  minHeight: 0,
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "#000",
};

function RouteFallback() {
  return (
    <div style={routeFallbackStyle} aria-busy="true">
      <div
        style={{
          width: 38,
          height: 38,
          border: "3px solid rgba(255,255,255,0.08)",
          borderTopColor: "rgba(255,255,255,0.55)",
          borderRadius: "50%",
          animation: "appRouteSpin 0.8s linear infinite",
        }}
      />
    </div>
  );
}

const App = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => subscribeDesktopLayout(), []);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    const bb = tg?.BackButton;
    if (!bb) return;

    const isHome = location.pathname === "/";

    const handleBack = () => {
      // если есть куда назад — идём назад
      if (window.history.length > 1) navigate(-1);
      else navigate("/"); // fallback
    };

    if (!isHome) {
      bb.show();
      bb.onClick(handleBack);
    } else {
      bb.hide();
      bb.offClick(handleBack);
    }

    return () => {
      bb.offClick(handleBack);
    };
  }, [location.pathname, navigate]);

  return (
    <DesktopShell>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<MainPage />} />
          <Route path="/referral" element={<ReferralPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/favorites" element={<FavoritePage />} />
          <Route path="/managers" element={<ManagersPage />} />
          <Route path="/promo" element={<PromoPage />} />
        </Routes>
      </Suspense>
    </DesktopShell>
  );
};

export default App;