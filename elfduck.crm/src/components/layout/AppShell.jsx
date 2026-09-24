import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopHeader from './TopHeader';
import MobileNav from './MobileNav';

const meta = {
  '/': { title: 'Дашборд', subtitle: 'Обзор бизнеса ElfDuck за период' },
  '/sales/orders': { title: 'Заказы', subtitle: 'Операционная таблица заказов' },
  '/sales/customers': { title: 'Клиенты', subtitle: 'База клиентов и сегментация' },
  '/sales/leads': { title: 'Лиды', subtitle: 'Воронка продаж' },
  '/marketing/partners': { title: 'Партнёры', subtitle: 'Партнёрская программа' },
  '/marketing/cashback': { title: 'Кэшбэк', subtitle: 'Программа лояльности' },
  '/marketing/push': { title: 'Push-рассылки', subtitle: 'Создание и аналитика кампаний' },
  '/analytics/products': { title: 'Товары', subtitle: 'Продажи и состояние склада' },
  '/analytics/locations': { title: 'Точки', subtitle: 'Сравнение точек продаж' },
};

export default function AppShell() {
  const loc = useLocation();
  const m = meta[loc.pathname] || { title: 'ElfDuck', subtitle: '' };
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar />
      <MobileNav open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopHeader title={m.title} subtitle={m.subtitle} onMenu={() => setNavOpen(true)} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin px-4 py-4 sm:px-6 lg:px-7 lg:py-6">
          <div className="min-w-0">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}