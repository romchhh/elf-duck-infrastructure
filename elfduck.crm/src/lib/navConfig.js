import {
  LayoutDashboard, ShoppingCart, Users, UserPlus, Handshake, Gift, Send,
  Package, MapPin, Boxes, LayoutGrid, Tags, TicketPercent
} from 'lucide-react';

export const TEGGER_URL = String(
  import.meta.env.VITE_TEGGER_URL || 'https://tegger.telebots.site'
).trim();

export const groups = [
  {
    label: 'Главное',
    items: [{ to: '/', label: 'Дашборд', icon: LayoutDashboard, end: true }],
  },
  {
    label: 'Продажи',
    items: [
      { to: '/sales/orders', label: 'Заказы', icon: ShoppingCart },
      { to: '/sales/customers', label: 'Клиенты', icon: Users },
      { to: '/sales/leads', label: 'Лиды', icon: UserPlus },
      { to: '/sales/stock', label: 'Остатки', icon: Boxes },
      { to: '/catalog', label: 'Каталог', icon: LayoutGrid },
    ],
  },
  {
    label: 'Маркетинг',
    items: [
      { to: '/marketing/partners', label: 'Партнёры', icon: Handshake },
      { to: '/marketing/cashback', label: 'Кэшбэк', icon: Gift },
      { to: '/marketing/promo-codes', label: 'Промокоды', icon: TicketPercent },
      { to: '/marketing/push', label: 'Push-рассылки', icon: Send },
      ...(TEGGER_URL
        ? [{ href: TEGGER_URL, label: 'Tegger', icon: Tags, external: true }]
        : []),
    ],
  },
  {
    label: 'Аналитика',
    items: [
      { to: '/analytics/products', label: 'Аналитика товаров', icon: Package },
      { to: '/analytics/locations', label: 'Точки', icon: MapPin },
    ],
  },
];