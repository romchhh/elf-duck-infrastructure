// Shared mock data for the ElfDuck CRM desktop dashboard.
// Polish vape-commerce business analytics. Generated datasets are deterministic
// (seeded) so numbers stay consistent across pages — ready to swap for a real API.

export const currency = (n) =>
  new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 }).format(n);

export const num = (n) => new Intl.NumberFormat('pl-PL').format(n);

// ---------- helpers ----------
function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];
function genSeries(seed, base, n, slope = 0) {
  const r = mulberry(seed); const arr = []; let v = base;
  for (let i = 0; i < n; i++) { v = Math.max(base * 0.3, v + (r() - 0.5) * base * 0.2 + slope); arr.push(v); }
  return arr;
}

const firstNames = ['Иван','Анна','Пётр','Мария','Камиль','Зофия','Томаш','Агата','Михал','Барбара','Ольга','Дамиан','Ева','Рафал','Магда','Якуб','Лукаш','Натали','Грег','Сильвия','Марек','Алекс','Юлия','Войцех','Катаржина','Павел','Моника','Адам','Кароль','Стефан'];
const lastNames = ['Петров','Коваль','Зелиньский','Новак','Войчик','Лех','Мазур','Дембска','Каминьский','Юзеф','Соколова','Краус','Громска','Собчик','Шмидт','Берг','Павлов','Орт','Дуда','Войчик','Зайонц','Ковальчик','Вильчек','Степанюк','Левандовская'];

// ---------- Dashboard KPIs ----------
export const kpis = {
  revenue: { value: 42666, delta: 12.4, series: [18, 22, 19, 28, 24, 33, 31, 38, 35, 42] },
  orders: { value: 277, delta: 8.1, series: [12, 14, 11, 18, 16, 22, 19, 24, 21, 27] },
  avgCheck: { value: 154, delta: 3.2, series: [120, 128, 131, 134, 140, 138, 145, 148, 151, 154] },
  customers: { value: 284, delta: 6.8, series: [210, 224, 233, 241, 250, 258, 266, 271, 278, 284] },
  repeat: { value: 68, delta: 6.4, series: [55, 57, 58, 60, 61, 63, 64, 65, 66, 68] },
  cancel: { value: 7.4, delta: -1.2, series: [9.1, 8.8, 8.6, 8.4, 8.1, 7.9, 7.8, 7.6, 7.5, 7.4] },
  newCustomers: { value: 20, delta: 2.1, series: [14, 15, 16, 16, 17, 18, 18, 19, 19, 20] },
};

export const insights = [
  { id: 'king', tone: 'success', icon: 'trending', title: 'ELF KING вырос на 34%', line: '47 продаж за неделю', metric: '+12 к прошлой неделе' },
  { id: 'd3', tone: 'warning', icon: 'alert', title: 'ELF D3 заканчивается на Wola', line: 'Остатка примерно на 2 дня', metric: '12 шт.' },
  { id: 'push', tone: 'primary', icon: 'send', title: 'Push «Вернуть спящих»', line: '19 вернувшихся клиентов', metric: '1 482 zł выручки' },
  { id: 'slow', tone: 'info', icon: 'box', title: '6 товаров продаются медленно', line: 'в складских остатках', metric: '4 820 zł' },
];

export const revenueSeries = [
  { date: '1 июн', revenue: 8200, orders: 54, newCustomers: 11, repeat: 61 },
  { date: '8 июн', revenue: 9100, orders: 58, newCustomers: 13, repeat: 63 },
  { date: '15 июн', revenue: 8800, orders: 56, newCustomers: 12, repeat: 62 },
  { date: '22 июн', revenue: 10400, orders: 64, newCustomers: 15, repeat: 64 },
  { date: '29 июн', revenue: 11200, orders: 69, newCustomers: 16, repeat: 65 },
  { date: '6 июл', revenue: 10800, orders: 66, newCustomers: 14, repeat: 66 },
  { date: '13 июл', revenue: 12100, orders: 72, newCustomers: 17, repeat: 66 },
  { date: '20 июл', revenue: 11800, orders: 71, newCustomers: 15, repeat: 67 },
  { date: '27 июл', revenue: 13250, orders: 78, newCustomers: 19, repeat: 68 },
  { date: '3 авг', revenue: 12800, orders: 75, newCustomers: 18, repeat: 68 },
  { date: '10 авг', revenue: 14200, orders: 82, newCustomers: 21, repeat: 69 },
  { date: '12 авг', revenue: 13250, orders: 79, newCustomers: 19, repeat: 68 },
];

export const retention = {
  rate: 68, delta: 6.4, newShare: 20, repeatShare: 80, avgIntervalDays: 11, repeatRevenue: 31420,
};

// ---------- Products ----------
export const productCategories = ['Все категории', 'Жидкости', 'Одноразки', 'Поды', 'Картриджи'];

const dispBrands = ['ELF KING', 'ELF BAR', 'GEEK BAR', 'LOST MARY', 'WAKA', 'HQD', 'CRYSTAL', 'VOZOL', 'NEXA', 'ELFA'];
const liquidBrands = ['NAKED 100', 'DINNER LADY', 'NASTY JUICE', 'RIPE VAPES', 'VOZOL JUICE'];
const podBrands = ['UWELL CALIBURN', 'VOOPOO VINCI', 'SMOK NOVO', 'VAPORESSO XROS'];
const cartBrands = ['VOOPOO PNP', 'SMOK RPM', 'UWELL COIL', 'NEXA POD'];
const flavors = ['Mango Ice', 'Grape Ice', 'Blueberry Sour', 'Watermelon', 'Cola Ice', 'Strawberry', 'Mint', 'Banana', 'Peach Ice', 'Lush Ice', 'Energy', 'Cuban Tobacco'];

function buildProducts() {
  const rnd = mulberry(12345);
  const arr = [];
  let fi = 0;
  const make = (brand, cat, unitPrice) => {
    const flavor = flavors[fi % flavors.length]; fi++;
    const sold = Math.floor(rnd() * 70) + 5;
    const revenue = sold * unitPrice;
    const trend = Math.floor(rnd() * 50) - 12;
    const repeat = Math.floor(rnd() * 40) + 30;
    const stock = Math.floor(rnd() * 200) + 4;
    const daily = Math.max(0.5, sold / 7);
    const days = Math.max(1, Math.round(stock / daily));
    const stockValue = Math.round(stock * unitPrice * 0.4);
    const spark = Array.from({ length: 8 }, () => Math.round(sold * (rnd() * 0.4 + 0.6)));
    return { id: 'PR-' + (1000 + arr.length), name: `${brand} ${flavor}`, category: cat, revenue, sold, trend, repeat, stock, days, stockValue, spark, unitPrice };
  };
  dispBrands.forEach((b) => { for (let k = 0; k < 5; k++) arr.push(make(b, 'Одноразки', Math.floor(rnd() * 40) + 60)); });
  liquidBrands.forEach((b) => { for (let k = 0; k < 4; k++) arr.push(make(b, 'Жидкости', Math.floor(rnd() * 30) + 40)); });
  podBrands.forEach((b) => { for (let k = 0; k < 2; k++) arr.push(make(b, 'Поды', Math.floor(rnd() * 50) + 80)); });
  cartBrands.forEach((b) => { for (let k = 0; k < 2; k++) arr.push(make(b, 'Картриджи', Math.floor(rnd() * 15) + 15)); });
  return arr.slice(0, 84);
}
export const allProducts = buildProducts();
export const products = allProducts;

// ---------- Locations (with per-metric series) ----------
const baseLocations = [
  { name: 'Wola', revenue: 42666, delta: 12.4, orders: 277, avgCheck: 154, cancel: 7.4, newShare: 20, repeatShare: 80, top: 'ELF KING 30K', risk: 'ELF D3 — запаса примерно на 2 дня', spark: [28, 31, 30, 34, 36, 38, 40, 42] },
  { name: 'Centrum', revenue: 31280, delta: 6.1, orders: 198, avgCheck: 158, cancel: 6.8, newShare: 24, repeatShare: 76, top: 'ELF BAR BC5000', risk: null, spark: [24, 25, 26, 27, 28, 29, 30, 31] },
  { name: 'Praga', revenue: 22410, delta: -2.4, orders: 152, avgCheck: 147, cancel: 9.1, newShare: 28, repeatShare: 72, top: 'GEEK BAR PULSE', risk: 'CRYSTAL — запаса примерно на 1 день', spark: [26, 25, 24, 24, 23, 23, 22, 22] },
  { name: 'Makowiec', revenue: 18920, delta: 4.8, orders: 131, avgCheck: 144, cancel: 8.2, newShare: 22, repeatShare: 78, top: 'LOST MARY BM600', risk: null, spark: [18, 19, 20, 20, 21, 22, 22, 19] },
  { name: 'Доставка — Варшава', revenue: 14760, delta: 18.2, orders: 118, avgCheck: 125, cancel: 5.4, newShare: 34, repeatShare: 66, top: 'ELF KING 30K', risk: null, spark: [10, 12, 13, 14, 15, 16, 17, 15] },
  { name: 'InPost / Польша', revenue: 9840, delta: 9.6, orders: 79, avgCheck: 124, cancel: 4.8, newShare: 30, repeatShare: 70, top: 'WAKA SMASH', risk: null, spark: [7, 8, 8, 9, 9, 10, 10, 10] },
];
const ordersTrends = [8.2, 6.4, -3.1, 4.8, 18.2, 9.6];
const avgCheckTrends = [3.1, 2.4, -1.8, 1.6, 5.2, 2.8];
const cancelTrends = [-1.2, -0.8, 0.6, -0.4, -1.6, -0.6];
const repeatTrends = [1.4, 1.0, -0.8, 0.6, 2.2, 1.2];
export const locations = baseLocations.map((l, i) => ({
  ...l,
  revenueSpark: l.spark,
  ordersSpark: genSeries(i * 100 + 1, l.orders / 8, 8, 0.5).map(Math.round),
  avgCheckSpark: genSeries(i * 100 + 2, l.avgCheck, 8, 0.3).map(Math.round),
  cancelSpark: genSeries(i * 100 + 3, l.cancel, 8, -0.05).map((v) => Math.round(v * 10) / 10),
  repeatSpark: genSeries(i * 100 + 4, l.repeatShare, 8, 0.2).map((v) => Math.round(v * 10) / 10),
  deltaSpark: genSeries(i * 100 + 5, l.delta, 8, 0.1).map((v) => Math.round(v * 10) / 10),
  ordersTrend: ordersTrends[i],
  avgCheckTrend: avgCheckTrends[i],
  cancelTrend: cancelTrends[i],
  repeatTrend: repeatTrends[i],
}));

// ---------- Partners ----------
const partnerNames = ['VapeWorld PL', 'SmokeHub', 'CloudMarket', 'DirectShop', 'ElfaClub', 'VapeNation', 'ElfStore', 'CloudNine', 'VapeMasters', 'PolishVape', 'VapeExpress', 'VapeHub', 'MistyShop', 'VaporLine', 'ElfBar PL'];
function buildPartners() {
  const rnd = mulberry(424242);
  const arr = [];
  for (let i = 0; i < 124; i++) {
    const base = pick(rnd, partnerNames);
    const name = i < partnerNames.length ? base : `${base} ${String.fromCharCode(65 + (i % 26))}${Math.floor(rnd() * 9)}`;
    const handle = '@' + base.toLowerCase().replace(/[^a-z]/g, '').slice(0, 6) + '_' + Math.floor(rnd() * 99);
    const invited = Math.floor(rnd() * 400) + 20;
    const bought = Math.max(1, Math.floor(invited * (rnd() * 0.5 + 0.1)));
    const conversion = Math.round((bought / invited) * 1000) / 10;
    const avgCheck = Math.floor(rnd() * 80) + 120;
    const revenue = bought * avgCheck;
    const ltv = Math.floor(rnd() * 200) + 200;
    const trend = Math.floor(rnd() * 40) - 10;
    arr.push({ id: 'P-' + (100 + i), name, handle, invited, bought, conversion, revenue, avgCheck, ltv, trend });
  }
  return arr;
}
export const allPartners = buildPartners();
export const partners = allPartners;

// ---------- Orders ----------
const payments = ['Карта', 'BLIK', 'Наличные'];
const deliveries = ['Самовывоз', 'InPost', 'Курьер'];
const orderStatusRoll = (rnd) => { const r = rnd(); if (r < 0.70) return 'done'; if (r < 0.88) return 'processing'; return 'cancelled'; };
function buildOrders() {
  const rnd = mulberry(55);
  const arr = [];
  const today = new Date('2026-08-27T12:00:00');
  const locNames = locations.map((l) => l.name);
  for (let i = 0; i < 641; i++) {
    const fn = pick(rnd, firstNames); const ln = pick(rnd, lastNames);
    const daysAgo = Math.floor(rnd() * 180);
    const d = new Date(today.getTime() - daysAgo * 86400000);
    const dateStr = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ', ' + String(Math.floor(rnd() * 24)).padStart(2, '0') + ':' + String(Math.floor(rnd() * 60)).padStart(2, '0');
    const prod = pick(rnd, allProducts);
    const qty = Math.floor(rnd() * 3) + 1;
    const status = orderStatusRoll(rnd);
    const amount = Math.round(prod.unitPrice * qty * (rnd() * 0.3 + 0.85));
    arr.push({
      id: '#' + (1000 + i), customer: `${fn} ${ln}`, orderDate: d, date: dateStr,
      items: `${prod.name} ×${qty}`, amount, payment: pick(rnd, payments), delivery: pick(rnd, deliveries),
      location: pick(rnd, locNames), status,
    });
  }
  return arr;
}
export const allOrders = buildOrders();
export const orders = allOrders;

// ---------- Leads ----------
// Raw lead records; status is derived in the UI from purchase history.
function buildLeads() {
  const rnd = mulberry(990011);
  const arr = [];
  const today = new Date('2026-08-27T12:00:00');
  for (let i = 0; i < 438; i++) {
    const fn = pick(rnd, firstNames); const ln = pick(rnd, lastNames);
    const name = `${fn} ${ln}`;
    const handle = '@' + (fn.toLowerCase().slice(0, 4) + ln.toLowerCase().slice(0, 3)) + Math.floor(rnd() * 90 + 10);
    const daysSinceCreated = Math.floor(rnd() * 60);
    const createdDate = new Date(today.getTime() - daysSinceCreated * 86400000);
    const isClient = rnd() < 0.24;
    let completedPurchases = 0, completedTotal = 0, firstPurchaseDays = null;
    if (isClient) {
      completedPurchases = Math.floor(rnd() * 5) + 1;
      let tot = 0;
      for (let k = 0; k < completedPurchases; k++) tot += Math.floor(rnd() * 250) + 60;
      completedTotal = tot;
      firstPurchaseDays = Math.max(1, Math.floor(rnd() * Math.min(daysSinceCreated || 1, 30)) + 1);
      if (firstPurchaseDays > daysSinceCreated) firstPurchaseDays = daysSinceCreated || 1;
    }
    arr.push({ id: 'L-' + (300 + i), name, handle, createdDate, daysSinceCreated, completedPurchases, completedTotal, firstPurchaseDays });
  }
  return arr;
}
export const allLeads = buildLeads();
export const leads = allLeads;

export const leadSources = [
  { source: 'Telegram', leads: 14, conversions: 5, conversion: 35.7, revenue: 6200 },
  { source: 'Instagram', leads: 11, conversions: 3, conversion: 27.3, revenue: 3800 },
  { source: 'Сайт', leads: 9, conversions: 4, conversion: 44.4, revenue: 5100 },
  { source: 'Рефералы', leads: 6, conversions: 3, conversion: 50.0, revenue: 4200 },
  { source: 'Другое', leads: 4, conversions: 1, conversion: 25.0, revenue: 1200 },
];

// ---------- Cashback ----------
export const cashback = {
  issued: 18420, used: 12640, balance: 5780, utilisation: 68.7,
  distribution: [
    { label: 'Активный баланс', value: 5780, share: 31 },
    { label: 'Использовано за период', value: 4260, share: 23 },
    { label: 'Начислено за период', value: 6840, share: 37 },
    { label: 'Сгорело', value: 1520, share: 9 },
  ],
};

// ---------- Push ----------
export const pushTemplates = [
  { id: 't1', name: 'Новый вкус недели', preview: 'Свежий вкус уже в продаже — попробуй первым!', used: 12, conversion: 15.2, lastUsed: '24 авг' },
  { id: 't2', name: 'Дожимаем спящих', preview: 'Соскучился по вкусам? Вернись и получи −15%.', used: 8, conversion: 9.4, lastUsed: '21 авг' },
  { id: 't3', name: 'Трать кэшбэк', preview: 'У тебя 140 zł кэшбэка — потрать их до конца недели.', used: 5, conversion: 11.8, lastUsed: '18 авг' },
  { id: 't4', name: 'Скидка ELF KING', preview: 'ELF KING 30K со скидкой 20% только сегодня.', used: 14, conversion: 13.6, lastUsed: '23 авг' },
  { id: 't5', name: 'Осенний старт', preview: 'Осенняя коллекция уже доступна.', used: 3, conversion: 7.1, lastUsed: '15 авг' },
  { id: 't6', name: 'Чёрная пятница', preview: 'Чёрная пятница: −30% на всё.', used: 22, conversion: 18.4, lastUsed: '26 авг' },
  { id: 't7', name: 'Летняя распродажа', preview: 'Последние дни лета — скидки до 40%.', used: 9, conversion: 10.2, lastUsed: '12 авг' },
  { id: 't8', name: 'VIP-бонус', preview: 'Спасибо, что с нами! Дарим 50 zł бонусом.', used: 6, conversion: 14.0, lastUsed: '20 авг' },
  { id: 't9', name: 'Повтори заказ', preview: 'Забыли пополнить запасы? Повторите последний заказ.', used: 4, conversion: 8.8, lastUsed: '10 авг' },
  { id: 't10', name: 'Новый ELF D3', preview: 'ELF D3 уже в продаже — попробуй новинку.', used: 7, conversion: 12.5, lastUsed: '22 авг' },
  { id: 't11', name: 'Двойной кэшбэк', preview: 'Только сегодня — двойной кэшбэк на одноразки.', used: 5, conversion: 11.0, lastUsed: '17 авг' },
  { id: 't12', name: 'Верни друга', preview: 'Пригласи друга и получите по 30 zł.', used: 3, conversion: 6.4, lastUsed: '8 авг' },
  { id: 't13', name: 'Ночная доставка', preview: 'Заказывай до полуночи — доставка утром.', used: 2, conversion: 5.2, lastUsed: '5 авг' },
  { id: 't14', name: 'Комбо-набор', preview: 'Попробуй 3 вкуса со скидкой 25%.', used: 6, conversion: 9.9, lastUsed: '14 авг' },
  { id: 't15', name: 'Напоминание о корзине', preview: 'Ты забыл корзину — оформи за 2 минуты.', used: 11, conversion: 14.8, lastUsed: '25 авг' },
  { id: 't16', name: 'Эксклюзив для подписчиков', preview: 'Только для подписчиков: ранний доступ к новинкам.', used: 4, conversion: 10.5, lastUsed: '11 авг' },
  { id: 't17', name: 'Сгорает кэшбэк', preview: 'Твой кэшбэк сгорит через 3 дня — потрать сейчас.', used: 8, conversion: 13.1, lastUsed: '19 авг' },
  { id: 't18', name: 'Итоги месяца', preview: 'Спасибо за покупки! Твой кэшбэк за месяц — 120 zł.', used: 1, conversion: 4.0, lastUsed: '2 авг' },
];

const campaignNames = ['Вернуть спящих', 'Новый вкус недели', 'Скидка ELF KING', 'Трать кэшбэк', 'Осенний старт', 'Чёрная пятница', 'Летняя распродажа', 'VIP-бонус', 'Повтори заказ', 'Новый ELF D3', 'Двойной кэшбэк', 'Верни друга'];
const campaignAudiences = ['Все', 'Активные', 'Новые', 'Спящие', 'Есть баланс', 'Избранные', 'Лиды'];
function buildCampaigns() {
  const rnd = mulberry(777);
  const arr = [];
  for (let i = 0; i < 47; i++) {
    const draft = i < 3;
    const name = i < campaignNames.length ? campaignNames[i] : `${pick(rnd, campaignNames)} ${i}`;
    const sent = draft ? 0 : Math.floor(rnd() * 2000) + 200;
    const delivered = draft ? 0 : Math.round(sent * (rnd() * 0.1 + 0.9));
    const purchases = draft ? 0 : Math.floor(delivered * (rnd() * 0.06 + 0.01));
    const conversion = sent ? Math.round((purchases / sent) * 1000) / 10 : 0;
    const revenue = purchases * (Math.floor(rnd() * 80) + 80);
    const daysAgo = Math.floor(rnd() * 120);
    arr.push({ id: 'PC-' + (10 + i), name, audience: pick(rnd, campaignAudiences), sent, delivered, purchases, conversion, revenue, status: draft ? 'draft' : 'done', daysAgo });
  }
  return arr;
}
export const allCampaigns = buildCampaigns();
export const pushCampaigns = allCampaigns;

export const pushAudienceOptions = {
  audience: ['Все', 'Избранные', 'Лиды'],
  status: ['Активные', 'Новые', 'Спящие'],
  category: ['Жидкости', 'Одноразки', 'Поды', 'Картриджи'],
  location: ['Wola', 'Centrum', 'Praga', 'Makowiec', 'Доставка по Варшаве', 'InPost / Польша'],
};

// ---------- Employees / history (kept for reference, removed from nav) ----------
export const employees = [
  { name: 'Алекс Соколов', role: 'Администратор', location: 'Wola', orders: 142, revenue: 18400, active: true },
  { name: 'Натали Берг', role: 'Менеджер', location: 'Centrum', orders: 118, revenue: 15200, active: true },
  { name: 'Грег Павлов', role: 'Продавец', location: 'Praga', orders: 96, revenue: 12100, active: true },
];
export const actionHistory = [
  { user: 'Алекс Соколов', action: 'Изменил статус заказа #1042', time: '25 авг, 14:22' },
  { user: 'Натали Берг', action: 'Создала push-рассылку «Новый вкус недели»', time: '25 авг, 11:04' },
];

export const periodOptions = ['Сегодня', 'Неделя', 'Месяц', '3 мес', '6 мес', 'Всё время', 'Свой период'];

// ---------- Generated clients + cashback clients ----------
const clientStatuses = ['active', 'sleeping', 'new'];
const clientStatusWeights = [0.70, 0.18, 0.12];

function weightedStatus(rnd) {
  const r = rnd(); let acc = 0;
  for (let i = 0; i < clientStatusWeights.length; i++) { acc += clientStatusWeights[i]; if (r <= acc) return clientStatuses[i]; }
  return 'active';
}

function buildClients() {
  const rnd = mulberry(20260826);
  const arr = [];
  for (let i = 0; i < 284; i++) {
    const fn = pick(rnd, firstNames); const ln = pick(rnd, lastNames);
    const name = `${fn} ${ln}`;
    const handle = '@' + (fn.toLowerCase().slice(0, 4) + ln.toLowerCase().slice(0, 3)) + Math.floor(rnd() * 90 + 10);
    const status = weightedStatus(rnd);
    const seg = status === 'active' ? (rnd() > 0.7 ? 'VIP' : 'Постоянный') : status === 'new' ? 'Новый' : 'Спящий';
    const purchases = status === 'new' ? Math.floor(rnd() * 3) + 1 : Math.floor(rnd() * 40) + 4;
    const ltv = purchases * (Math.floor(rnd() * 80) + 50);
    const interval = status === 'new' ? 0 : status === 'sleeping' ? Math.floor(rnd() * 25) + 20 : Math.floor(rnd() * 12) + 6;
    const avgCheck = Math.floor(rnd() * 70) + 60;
    const cashback = Math.floor(rnd() * 160) + 10;
    const lastOrder = status === 'sleeping' ? `${Math.floor(rnd() * 30) + 5} июл` : `${Math.floor(rnd() * 25) + 1} авг`;
    arr.push({ id: 'C-' + (1000 + i), name, handle, status, segment: seg, ltv, purchases, interval, avgCheck, lastOrder, cashback });
  }
  return arr;
}
export const allCustomers = buildClients();

function buildCashbackClients() {
  const rnd = mulberry(778899);
  const arr = [];
  const today = new Date('2026-08-26');
  for (let i = 0; i < 284; i++) {
    const fn = pick(rnd, firstNames); const ln = pick(rnd, lastNames);
    const name = `${fn} ${ln}`;
    const handle = '@' + (fn.toLowerCase().slice(0, 4) + ln.toLowerCase().slice(0, 3)) + Math.floor(rnd() * 90 + 10);
    const issued = Math.floor(rnd() * 400) + 40;
    const used = Math.floor(issued * (rnd() * 0.7 + 0.1));
    const balance = issued - used;
    const noExpire = rnd() > 0.78;
    const daysToExpire = noExpire ? null : Math.floor(rnd() * 40) + 2;
    const expireDate = noExpire ? null : new Date(today.getTime() + daysToExpire * 86400000);
    const expireLabel = noExpire ? 'Не сгорает' : expireDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    const status = balance <= 0 ? 'used' : !noExpire && daysToExpire <= 10 ? 'expiring' : 'active';
    arr.push({ id: 'CB-' + (2000 + i), name, handle, balance, issued, used, expireLabel, expireDays: daysToExpire, noExpire, status });
  }
  return arr;
}
export const allCashbackClients = buildCashbackClients();