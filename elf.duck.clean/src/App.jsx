import { Routes, Route, useLocation, useNavigate } from "react-router-dom";
import React, { useEffect, Suspense } from "react";
import MainPage from "./pages/MainPage";

const ReferralPage = React.lazy(() => import("./pages/ReferralPage"));
const CartPage = React.lazy(() => import("./pages/CartPage"));
const OrdersPage = React.lazy(() => import("./pages/OrdersPage"));
const FavoritePage = React.lazy(() => import("./pages/FavoritePage"));
const ManagersPage = React.lazy(() => import("./pages/ManagersPage"));
const PromoPage = React.lazy(() => import("./pages/PromoPage"));

if (typeof window !== "undefined") {
  const warmup = () => {
    import("./pages/CartPage");
    import("./pages/OrdersPage");
    import("./pages/FavoritePage");
    import("./pages/ReferralPage");
    import("./pages/ManagersPage");
    import("./pages/PromoPage");
  };
  // Запускаем warmup как можно раньше: сначала через rAF (мгновенно после paint),
  // потом через requestIdleCallback как fallback с timeout 500ms
  if (typeof requestAnimationFrame !== "undefined") {
    requestAnimationFrame(() => {
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(warmup, { timeout: 500 });
      } else {
        setTimeout(warmup, 0);
      }
    });
  } else {
    setTimeout(warmup, 300);
  }
}

const routeFallbackStyle = {
  position: "fixed",
  inset: 0,
  backgroundColor: "#000",
  zIndex: -1,
};

const App = () => {
  const location = useLocation();
  const navigate = useNavigate();

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
    <Suspense fallback={<div style={routeFallbackStyle} />}>
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
  );
};

export default App;