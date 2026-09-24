import { currency, num } from '@/lib/mockData';

export const sortOptions = [

  { key: 'revenue', label: 'Выручка' },

  { key: 'orders', label: 'Заказы' },

  { key: 'averageCheck', label: 'Средний чек' },

  { key: 'growth', label: 'Рост' },

  { key: 'cancellations', label: 'Отмены' },

  { key: 'repeat', label: 'Повторные' },

];

export const metricConfig = {
  revenue: { label: 'Выручка', primary: (l) => currency(l.revenue), chart: (l) => l.revenueSpark, trend: (l) => l.delta, goodPositive: true, chartColor: 'hsl(255 100% 68%)' },
  orders: { label: 'Заказы', primary: (l) => `${num(l.orders)} заказов`, chart: (l) => l.ordersSpark, trend: (l) => l.ordersTrend, goodPositive: true, chartColor: 'hsl(255 100% 68%)' },
  avgCheck: { label: 'Средний чек', primary: (l) => `${l.avgCheck} zł`, chart: (l) => l.avgCheckSpark, trend: (l) => l.avgCheckTrend, goodPositive: true, chartColor: 'hsl(255 100% 68%)' },
  delta: { label: 'Рост', primary: (l) => `${l.delta > 0 ? '+' : ''}${l.delta}%`, chart: (l) => l.deltaSpark, trend: (l) => l.delta, goodPositive: true, chartColor: null },
  cancel: { label: 'Отмены', primary: (l) => `${l.cancel}%`, chart: (l) => l.cancelSpark, trend: (l) => l.cancelTrend, goodPositive: false, chartColor: null },
  repeatShare: { label: 'Повторные клиенты', primary: (l) => `${l.repeatShare}%`, chart: (l) => l.repeatSpark, trend: (l) => l.repeatTrend, goodPositive: true, chartColor: 'hsl(255 100% 68%)' },
};

export function chartColorFor(metric, l) {
  const cfg = metricConfig[metric];
  if (cfg.chartColor) return cfg.chartColor;
  if (metric === 'delta') return l.delta >= 0 ? 'hsl(142 64% 47%)' : 'hsl(0 72% 58%)';
  if (metric === 'cancel') return l.cancelTrend <= 0 ? 'hsl(142 64% 47%)' : 'hsl(0 72% 58%)';
  return 'hsl(255 100% 68%)';
}

// Scale location aggregate values to the selected period length (baseline = 30 days).
// avgCheck / delta / cancel / repeatShare are rates and do not scale.
export function scaleLocation(l, days) {
  if (days == null) return l;
  const f = days / 30;
  return { ...l, revenue: Math.round(l.revenue * f), orders: Math.round(l.orders * f) };
}