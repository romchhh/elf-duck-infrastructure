import {
  LayoutDashboard, ShoppingCart, Users, UserPlus, Handshake, Gift, Send,
  Package, MapPin
} from 'lucide-react';

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
    ],
  },
  {
    label: 'Маркетинг',
    items: [
      { to: '/marketing/partners', label: 'Партнёры', icon: Handshake },
      { to: '/marketing/cashback', label: 'Кэшбэк', icon: Gift },
      { to: '/marketing/push', label: 'Push-рассылки', icon: Send },
    ],
  },
  {
    label: 'Аналитика',
    items: [
      { to: '/analytics/products', label: 'Товары', icon: Package },
      { to: '/analytics/locations', label: 'Точки', icon: MapPin },
    ],
  },
];