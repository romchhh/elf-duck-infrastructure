import React from "react";
import { Outlet } from "react-router-dom";
import Sidebar, { MobileTopBar, MobileNav } from "@/components/Sidebar";

export default function Layout() {
  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <MobileTopBar />
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-8 max-w-[1280px] w-full mx-auto">
          <Outlet />
        </main>
        <MobileNav />
      </div>
    </div>
  );
}