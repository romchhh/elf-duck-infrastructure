export const PUSH_PERIOD_MAP = {
  Сегодня: 'today',
  Неделя: 'week',
  Месяц: 'month',
  '3 мес': '3m',
  '3 месяца': '3m',
  '6 мес': '6m',
  '6 месяцев': '6m',
  Всё: 'all',
  'Все время': 'all',
  'Всё время': 'all',
};

export function toDateOnly(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getPeriodPayload(period, range) {
  const standardPeriod =
    PUSH_PERIOD_MAP[String(period || '')];

  if (standardPeriod) {
    return { period: standardPeriod };
  }

  if (range?.start && range?.end) {
    return {
      from: toDateOnly(range.start),
      to: toDateOnly(range.end),
    };
  }

  return { period: 'month' };
}

export function buildPeriodQuery(period, range) {
  return new URLSearchParams(
    getPeriodPayload(period, range)
  ).toString();
}
