// ============================================================
// Tegger — Frontend mock data + service abstraction
// All data here is frontend-only mock, structured so it can
// later be swapped for real Python/Telethon backend calls.
// ============================================================

export const SYSTEM_STATUS = {
  system: "Работает",
  mode: "DRY RUN", // "DRY RUN" | "LIVE"
  maxConcurrentSenders: 3,
};

// ---------- Sender accounts ----------
const SENDER_NAMES = [
  "tegger", "sender_2", "sender_3", "sender_4", "sender_5",
  "sender_6", "sender_7", "sender_8", "sender_9", "sender_10",
  "sender_11", "sender_12", "sender_13", "sender_14", "sender_15",
  "sender_16", "sender_17", "sender_18",
];

const STATUS_POOL = [
  "Активен", "Активен", "Активен", "Активен", "Активен",
  "Активен", "Активен", "Активен", "Активен", "Активен",
  "Активен", "Активен", "Активен", "Активен", "Cooldown",
  "Остановлен", "Ошибка", "Не настроен",
];

export const ACCOUNTS = SENDER_NAMES.map((name, i) => {
  const status = STATUS_POOL[i];
  const dailyLimit = 14;
  const dailyCount = status === "Активен" ? (i % 5) + 6 : status === "Cooldown" ? 4 : 0;
  const telegramUser = name === "tegger" ? "@tegger_main" : `@${name}_tg`;
  const telegramId = `500${1000000 + i * 13711}`;
  return {
    id: name,
    name,
    telegram: telegramUser,
    telegramId,
    status,
    dailyCount,
    dailyLimit,
    session: status !== "Не настроен",
    proxy: status !== "Не настроен" && status !== "Ошибка",
    story: status !== "Не настроен",
    proxyUri: status !== "Не настроен"
      ? `socks5://user:••••••@host${10 + i}.tegger.io:1080`
      : null,
    storyTemplate: "https://t.me/tegger_story/{target}",
    cooldownUntil: status === "Cooldown" ? "13:42:18" : null,
    lastError: status === "Ошибка" ? "AuthKeyError: session expired" : null,
    avatar: null,
    firstName: name === "tegger" ? "Tegger" : `Sender ${i}`,
    username: telegramUser.replace("@", ""),
    bio: name === "tegger" ? "Official Tegger operator account" : "Tegger sender account",
    channel: {
      exists: false,
      creating: false,
      pinned: false,
      title: "",
      username: "",
      avatar: null,
      bio: "",
      postImage: null,
      postText: "",
      actionText: "",
      actionUrl: "",
    },
  };
});

// ---------- Campaigns ----------
export const CAMPAIGNS = [
  {
    id: "c1",
    name: "Campaign #1",
    status: "Активна",
    senderIds: SENDER_NAMES.slice(0, 18),
    totalTargets: 3707,
    processed: 1053,
    lastExecution: "2026-10-03 13:48:22",
  },
  {
    id: "c2",
    name: "Campaign #2",
    status: "Остановлена",
    senderIds: SENDER_NAMES.slice(0, 6),
    totalTargets: 840,
    processed: 312,
    lastExecution: "2026-10-02 22:14:05",
  },
  {
    id: "c3",
    name: "Campaign #3",
    status: "Завершена",
    senderIds: SENDER_NAMES.slice(0, 8),
    totalTargets: 1240,
    processed: 1240,
    lastExecution: "2026-09-30 18:02:41",
  },
];

const DIST = {};
SENDER_NAMES.forEach((n, i) => { DIST[n] = i === 17 ? 205 : 206; });

// ---------- Targets (campaign-specific) ----------
const TARGET_USERNAMES = [
  "market_news_ru", "new_target", "private_channel_x", "deleted_account",
  "crypto_signals_pro", "tech_blog_daily", "startup_hub", "design_inspire",
  "travel_stories", "foodie_channel", "fitness_motiv", "book_reviews_ru",
  "music_lovers_club", "film_critics", "science_today", "history_buff",
  "art_gallery_modern", "photography_world", "gaming_news_hub", "ai_research",
];

const TARGET_ERRORS = {
  private_channel_x: "USER_PRIVACY",
  deleted_account: "USER_DELETED",
};

const TARGET_STATUS_POOL = ["Отмечен", "Отмечен", "Отмечен", "Ожидает", "Ожидает", "Ошибка"];

function buildTargets(campaign) {
  const targets = [];
  let counter = 0;
  campaign.senderIds.forEach((senderId) => {
    const count = campaign.id === "c1" ? DIST[senderId] : Math.ceil(campaign.totalTargets / campaign.senderIds.length);
    for (let i = 0; i < Math.min(count, 40); i++) {
      const uname = TARGET_USERNAMES[counter % TARGET_USERNAMES.length];
      const status = TARGET_STATUS_POOL[counter % TARGET_STATUS_POOL.length];
      const error = status === "Ошибка" ? (TARGET_ERRORS[uname] || "FLOOD_WAIT") : null;
      targets.push({
        id: `t_${campaign.id}_${counter}`,
        username: `@${uname}_${counter}`,
        sender: senderId,
        status,
        error,
      });
      counter++;
    }
  });
  return targets;
}

export const TARGETS = {
  c1: buildTargets(CAMPAIGNS[0]),
  c2: buildTargets(CAMPAIGNS[1]),
  c3: buildTargets(CAMPAIGNS[2]),
};

// ---------- Logs ----------
const LOG_EVENTS = [
  { event: "Story published", level: "SUCCESS", detail: "target @market_news_ru marked" },
  { event: "Target processed", level: "SUCCESS", detail: "@crypto_signals_pro → @tegger_main" },
  { event: "Target error", level: "ERROR", detail: "@private_channel_x — USER_PRIVACY" },
  { event: "FloodWait", level: "WARNING", detail: "sender_4 — wait 42s" },
  { event: "Sender stopped", level: "ERROR", detail: "sender_3 — AuthKeyError" },
  { event: "Campaign started", level: "INFO", detail: "Campaign #1 — 18 senders, 3707 targets" },
  { event: "Campaign finished", level: "SUCCESS", detail: "Campaign #3 — 1240/1240" },
  { event: "Channel created", level: "INFO", detail: "tegger — @tegger_promo" },
  { event: "Channel pinned", level: "SUCCESS", detail: "tegger — @tegger_promo pinned" },
  { event: "Account configuration updated", level: "INFO", detail: "sender_7 — proxy updated" },
  { event: "Worker stopped", level: "WARNING", detail: "sender_2 — cooldown reached" },
  { event: "Circuit breaker", level: "ERROR", detail: "sender_3 — 5 consecutive errors" },
];

export const LOGS = Array.from({ length: 28 }, (_, i) => {
  const e = LOG_EVENTS[i % LOG_EVENTS.length];
  const d = new Date(2026, 9, 3, 13, 48 - i, 0);
  const pad = (n) => String(n).padStart(2, "0");
  return {
    id: `log_${i}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
    date: `2026-10-0${(i % 3) + 1}`,
    sender: ACCOUNTS[(i * 7) % ACCOUNTS.length].name,
    event: e.event,
    level: e.level,
    detail: e.detail,
  };
});

// ---------- Settings ----------
export const SETTINGS = {
  general: {
    DRY_RUN: true,
    MAX_CONCURRENT_SENDERS: 3,
  },
  limits: {
    TARGETS_PER_SENDER_PER_DAY: 14,
    TARGETS_PER_STORY_MIN: 1,
    TARGETS_PER_STORY_MAX: 200,
  },
  timings: {
    STORY_INTERVAL_MIN_SECONDS: 30,
    STORY_INTERVAL_MAX_SECONDS: 90,
    INTERACTION_STORY_DELAY: 5,
  },
  telegram: {
    API_ID: "<REDACTED>",
    API_HASH: "<REDACTED>",
  },
  notifications: {
    LOG_BOT_TOKEN: "•••••••••••••••••••••",
    LOG_CHAT_ID: "-1001234567890",
  },
};

// ---------- Account campaign stats (campaign-aware) ----------
export function getAccountStats(accountId, campaignId) {
  const campaign = CAMPAIGNS.find((c) => c.id === campaignId) || CAMPAIGNS[0];
  const idx = ACCOUNTS.findIndex((a) => a.id === accountId);
  const share = campaign.id === "c1" ? (idx === 17 ? 205 : 206) : Math.ceil(campaign.totalTargets / campaign.senderIds.length);
  const processed = Math.round(share * (campaign.processed / campaign.totalTargets));
  const remaining = share - processed;
  const daily = ACCOUNTS[idx] ? ACCOUNTS[idx].dailyCount : 0;
  return {
    dailyCount: daily,
    dailyLimit: ACCOUNTS[idx] ? ACCOUNTS[idx].dailyLimit : 14,
    remaining,
    totalCompleted: processed,
    assigned: share,
  };
}

// ---------- Service abstraction ----------
export const services = {
  system: {
    getStatus: () => Promise.resolve({ ...SYSTEM_STATUS }),
    setMode: (mode) => { SYSTEM_STATUS.mode = mode; return Promise.resolve({ ...SYSTEM_STATUS }); },
  },
  campaigns: {
    list: () => Promise.resolve(CAMPAIGNS.map((c) => ({ ...c }))),
    get: (id) => Promise.resolve({ ...(CAMPAIGNS.find((c) => c.id === id) || {}) }),
    create: (data) => {
      const id = `c${CAMPAIGNS.length + 1}`;
      const c = {
        id,
        name: data.name,
        status: "Готова к запуску",
        senderIds: data.senderIds,
        totalTargets: data.targets.length,
        processed: 0,
        lastExecution: null,
      };
      CAMPAIGNS.push(c);
      TARGETS[id] = data.targets.map((t, i) => ({ id: `t_${id}_${i}`, ...t, status: "Ожидает", error: null }));
      return Promise.resolve(c);
    },
  },
  accounts: {
    list: async () => {
      const response = await fetch(
        "http://127.0.0.1:8000/api/accounts",
        { credentials: "include" }
      );

      if (!response.ok) {
        throw new Error(`Ошибка загрузки аккаунтов: ${response.status}`);
      }

      return response.json();
    },

    get: async (id) => {
      const response = await fetch(
        `http://127.0.0.1:8000/api/accounts/${encodeURIComponent(id)}`,
        { credentials: "include" }
      );

      if (!response.ok) {
        throw new Error(`Ошибка загрузки аккаунта: ${response.status}`);
      }

      return response.json();
    },
    update: (id, data) => {
      const a = ACCOUNTS.find((x) => x.id === id);
      if (a) Object.assign(a, data);
      return Promise.resolve({ ...(a || {}) });
    },
    create: (data) => {
      const id = data.name || `sender_${ACCOUNTS.length + 1}`;
      const a = {
        id,
        name: data.name,
        telegram: data.telegram || `@${id}_tg`,
        telegramId: data.telegramId || `500${Math.floor(Math.random() * 9000000)}`,
        status: "Не настроен",
        dailyCount: 0,
        dailyLimit: 14,
        session: !!data.session,
        proxy: !!data.proxy,
        story: !!data.storyTemplate,
        proxyUri: data.proxy || null,
        storyTemplate: data.storyTemplate || "",
        cooldownUntil: null,
        lastError: null,
        avatar: null,
        firstName: data.name,
        username: data.name,
        bio: "",
        channel: { exists: false, creating: false, pinned: false, title: "", username: "", avatar: null, bio: "", postImage: null, postText: "", actionText: "", actionUrl: "" },
      };
      ACCOUNTS.push(a);
      return Promise.resolve({ ...a });
    },
  },
  targets: {
    list: (campaignId, { status, sender, search } = {}) => {
      let items = TARGETS[campaignId] || [];
      if (status && status !== "all") items = items.filter((t) => t.status === status);
      if (sender && sender !== "all") items = items.filter((t) => t.sender === sender);
      if (search) {
        const s = search.toLowerCase();
        items = items.filter((t) => t.username.toLowerCase().includes(s));
      }
      return Promise.resolve(items);
    },
    stats: (campaignId) => {
      const items = TARGETS[campaignId] || [];
      return Promise.resolve({
        total: items.length,
        done: items.filter((t) => t.status === "Отмечен").length,
        waiting: items.filter((t) => t.status === "Ожидает").length,
        errors: items.filter((t) => t.status === "Ошибка").length,
      });
    },
  },
  logs: {
    list: ({ level, search, sender } = {}) => {
      let items = LOGS;
      if (level && level !== "ALL") items = items.filter((l) => l.level === level);
      if (sender && sender !== "all") items = items.filter((l) => l.sender === sender);
      if (search) {
        const s = search.toLowerCase();
        items = items.filter((l) => l.event.toLowerCase().includes(s) || l.detail.toLowerCase().includes(s));
      }
      return Promise.resolve(items);
    },
  },
  settings: {
    get: () => Promise.resolve(JSON.parse(JSON.stringify(SETTINGS))),
    save: (data) => {
      Object.assign(SETTINGS, data);
      SYSTEM_STATUS.mode = data.general.DRY_RUN ? "DRY RUN" : "LIVE";
      return Promise.resolve({ ...SETTINGS });
    },
  },
};