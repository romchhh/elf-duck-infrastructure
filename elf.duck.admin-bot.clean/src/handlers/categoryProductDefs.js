import { bot } from "../bot/single.js";
import { Markup, Input } from "./_telegraf.js";
import {
  API_URL,
  BOT_TOKEN,
  ADMIN_API_TOKEN,
  WEBAPP_URL,
  ADMIN_IDS,
  SUPER_ADMIN_IDS,
} from "../config.js";
import { api, isValidUrl } from "../api.js";
import {
  isAdmin,
  isSuperAdmin,
  accessDeniedReply,
  getAdminBotUsername,
  setAdminBotUsername,
} from "../auth.js";
import { getState, setState, clearState } from "../state.js";
import {
  startBroadcastStatusPolling,
  formatBroadcastJobStatus,
} from "../broadcastPolling.js";
import { translitRuToLat } from "../utils/translit.js";
import { sendStepCard } from "../ui/sendStepCard.js";

// =====================================================
// =================== CATEGORY BUILDER =================
// =====================================================

// ----- Builder steps order -----
export const BUILDER_STEPS = [
  "variant",
  "assetsAndTitle",
  "badge",
  "sortOrder",
  "isActive",
  "confirm",
];

// =====================================================
// =================== PRODUCT BUILDER =================
// =====================================================

export const PRODUCT_BUILDER_STEPS = [
  "category",
  "titles",
  "price",
  "cardImages",
  "layout",
  "badge",
  "orderImage",
  "titleModal",
  "accentColor",
  "sortOrder",
  "isActive",
  "confirm",
];

// =================== PRODUCT BUILDER (WIZARD) ===================

// ===== Product builder: presets for layout =====
const PRODUCT_LAYOUTS = [
  {
    id: 1,
    label: "Вариант 1 — утка справа / кнопки справа",
    value: {
      classCardDuck: "productCardImageRight",
      classActions: "productActionsRight",
    },
  },
  {
    id: 2,
    label: "Вариант 2 — утка слева / кнопки слева",
    value: {
      classCardDuck: "productCardImageLeft",
      classActions: "productActionsLeft",
    },
  },
];

// ----- defaults for new product -----
export const defaultProductData = () => ({
  categoryKey: "",

  title1: "",
  title2: "",
  titleModal: "",
  price: 0,

  cardBgUrl: "",
  cardDuckUrl: "",
  orderImgUrl: "",

  classCardDuck: "",
  classActions: "",

  classNewBadge: "",
  newBadge: "",

  accentColor: "", // "32, 130, 231"

  sortOrder: 0,
  isActive: true,
});

// ===== optional: step images (can be empty) =====
export const PRODUCT_STEP_IMAGES = {
  category: "",
  titles: "",
  price: "",
  cardImages: "",
  layout: "",
  badge: "",
  orderImage: "",
  titleModal: "",
  accentColor: "",
  sortOrder: "",
  isActive: "",
  confirm: "",
};

export const renderProductPreview = (d) => {
  const lines = [];
  lines.push("🧩 *Конструктор товара — превью*");
  lines.push("");
  lines.push(`• категория: *${d.categoryKey || "—"}*`);
  lines.push(`• название (1): *${d.title1 || "—"}*`);
  lines.push(`• название (2): *${d.title2 || "—"}*`);
  lines.push(`• цена: *${Number(d.price || 0)}*`);
  lines.push(`• фон (карточка): ${d.cardBgUrl || "—"}`);
  lines.push(`• утка (карточка): ${d.cardDuckUrl || "—"}`);
  lines.push(
    `• расположение: ${d.classCardDuck ? `\`${d.classCardDuck}\`` : "—"} / ${
      d.classActions ? `\`${d.classActions}\`` : "—"
    }`
  );
  lines.push(`• бейдж: ${d.newBadge ? `*${d.newBadge}* (\`${d.classNewBadge}\`)` : "—"}`);
  lines.push(`• картинка (оформление): ${d.orderImgUrl || "—"}`);
  lines.push(`• название (оформление): *${d.titleModal || "—"}*`);
  lines.push(`• цвет (RGB): ${d.accentColor ? `\`${d.accentColor}\`` : "—"}`);
  lines.push(`• sortOrder: *${d.sortOrder}*`);
  lines.push(`• isActive: *${d.isActive ? "true" : "false"}*`);
  return lines.join("\n");
};

