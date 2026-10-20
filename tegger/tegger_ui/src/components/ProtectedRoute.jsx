import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "@/lib/AuthContext";

export default function ProtectedRoute() {
  const location = useLocation();
  const {
    isAuthenticated,
    isLoadingAuth,
  } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}${location.hash || window.location.hash || ""}`;
    const loginTo =
      returnTo && returnTo !== "/"
        ? `/login?returnTo=${encodeURIComponent(returnTo)}`
        : "/login";
    return <Navigate to={loginTo} replace />;
  }

  return <Outlet />;
}