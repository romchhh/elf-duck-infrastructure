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
import { mainMenu } from "./menu.js";
import { fetchMyPickupPoints } from "./pickupPointHelpers.js";

// =====================================================
// =================== FLAVOR BUILDER ==================
// =====================================================

export const slugify = (s) =>
  translitRuToLat(String(s || ""))
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 32) || "flavor";

export const isHex = (s) => /^#[0-9a-fA-F]{6}$/.test(String(s || "").trim());

export const FL_BUILDER_STEPS = [
  "product",      // выбрать товар
  "mode",         // новый вкус или наличие существующего
  "newFlavor",    // ввод label + 2 цвета
  "pickFlavor",   // выбрать существующий вкус
  "bulkEdit",
  "pickupPoint",  // выбрать точку
  "qty",          // ввести количество
  "confirm",      // подтвердить
];

/** Быстрый остаток: точка → товар → массовое редактирование всех вкусов */
export const FL_QUICK_STEPS = ["pickupPoint", "product", "bulkEdit"];

export const isFlavorFlowMode = (mode) =>
  mode === "fl_builder" || mode === "fl_quick";

export const defaultFlavorBuilderData = () => ({

  categoryKey: "",

  categoryTitle: "",

  productId: "",

  productTitle: "",

  mode: "",

  flavorId: "",
  flavorKey: "",
  label: "",
  gradient: ["", ""],

  pickupPointId: "",
  pickupPointLabel: "",

  totalQty: null,

  bulkEditText: "",
  bulkEdits: [],
});

const renderFlavorBuilderPreview = (d = {}) => {
  const lines = [];
  lines.push("🍓 *Вкусы / наличие*");

  // показываем ТОЛЬКО заполненное (без “—”)
  if (d.productTitle) lines.push(`\nТовар: *${String(d.productTitle)}*`);

  if (d.mode) {
    const modeLabel =
      d.mode === "new" ? "добавить новый вкус" :
      d.mode === "stock" ? "обновить наличие" : "";
    if (modeLabel) lines.push(`Действие: *${modeLabel}*`);
  }

  if (d.label) lines.push(`Вкус: *${String(d.label)}*`);

  if (Array.isArray(d.gradient) && d.gradient[0] && d.gradient[1]) {
    lines.push(`Цвета: \`${d.gradient[0]}\`, \`${d.gradient[1]}\``);
  }

  if (d.pickupPointLabel) lines.push(`Точка: *${String(d.pickupPointLabel)}*`);

  // qty показываем только если реально вводили
  if (typeof d.totalQty === "number") {
    lines.push(`Количество: *${d.totalQty}*`);
  }

  if (d.bulkEditText) lines.push(`Массовое изменение: *да*`);

  return lines.join("\n");
};

export { fetchMyPickupPoints } from "./pickupPointHelpers.js";

export const nextQuickStockStep = async (ctx) => {
  const st = getState(ctx.chat.id);
  st.step += 1;
  setState(ctx.chat.id, st);
  return askQuickStockStep(ctx);
};

export const askQuickStockStep = async (ctx) => {
  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "fl_quick") return;

  const step = FL_QUICK_STEPS[st.step];
  const d = st.data || {};
  const preview = renderFlavorBuilderPreview(d);

  if (step === "pickupPoint") {
    const points = await fetchMyPickupPoints(ctx);

    if (!points.length) {
      return ctx.reply(
        "❌ У тебя нет доступных точек самовывоза. Добавь свой telegramId в точку (allowedAdminTelegramIds)."
      );
    }

    const kb = Markup.inlineKeyboard([
      ...points
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map((p) => {
          const pointTitle = String(p?.title || "").trim();
          const pointAddress = String(p?.address || "").trim();
          const pointLabel =
            pointTitle && pointAddress
              ? `${pointTitle} (${pointAddress})`
              : pointTitle || pointAddress || "Без названия";

          return [
            Markup.button.callback(
              `${p.isActive ? "✅" : "⛔️"} ${pointLabel}`,
              `fl_pick_point:${p._id}`
            ),
          ];
        }),
      [
        Markup.button.callback("🍓 Полный мастер", "fl_builder_start"),
        Markup.button.callback("✖️ Отмена", "fl_cancel"),
      ],
    ]);

    return sendStepCard(ctx, {
      photoUrl: "",
      caption: `⚡ *Быстрое наличие*\n\n1️⃣ Выберите *точку*:`,
      keyboard: kb,
    });
  }

  if (step === "product") {
    if (!d.categoryKey) {
      const r = await fetch(`${API_URL}/categories?active=0`);
      const data = await r.json().catch(() => ({}));
      const categories = Array.isArray(data) ? data : data.categories || [];

      if (!categories.length) {
        clearState(ctx.chat.id);
        return ctx.reply("Категорий пока нет.", mainMenu(ctx));
      }

      const kb = Markup.inlineKeyboard([
        ...categories
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
          .map((c) => [
            Markup.button.callback(
              `${c.isActive ? "✅" : "⛔️"} ${c.title}`,
              `fl_category:${c.key}`
            ),
          ]),
        [
          Markup.button.callback("⬅️ К точкам", "fl_back"),
          Markup.button.callback("✖️ Отмена", "fl_cancel"),
        ],
      ]);

      return sendStepCard(ctx, {
        photoUrl: "",
        caption: `${preview}\n\n2️⃣ Выберите *категорию* и *товар*:`,
        keyboard: kb,
      });
    }

    const r = await fetch(`${API_URL}/products?active=0`);
    const data = await r.json().catch(() => ({}));
    const products = (data.products || []).filter(
      (p) => String(p.categoryKey || "") === String(d.categoryKey)
    );

    if (!products.length) {
      return sendStepCard(ctx, {
        photoUrl: "",
        caption: `В этой категории пока нет товаров.`,
        keyboard: Markup.inlineKeyboard([
          [Markup.button.callback("⬅️ К категориям", "fl_category_back")],
          [Markup.button.callback("✖️ Отмена", "fl_cancel")],
        ]),
      });
    }

    const kb = Markup.inlineKeyboard([
      ...products
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map((p) => [
          Markup.button.callback(
            `${p.isActive ? "✅" : "⛔️"} ${(p.title1 || "").trim()} ${(p.title2 || "").trim()}`.trim(),
            `fl_pick_product:${p._id}`
          ),
        ]),
      [
        Markup.button.callback("⬅️ К категориям", "fl_category_back"),
        Markup.button.callback("✖️ Отмена", "fl_cancel"),
      ],
    ]);

    return sendStepCard(ctx, {
      photoUrl: "",
      caption: `${preview}\n\nВыберите *товар*:`,
      keyboard: kb,
    });
  }

  if (step === "bulkEdit") {
    const r = await fetch(`${API_URL}/products?active=0`);
    const data = await r.json().catch(() => ({}));
    const products = data.products || [];
    const prod = products.find((p) => String(p._id) === String(d.productId));
    const flavors = Array.isArray(prod?.flavors)
      ? prod.flavors.filter((f) => f.isActive !== false)
      : [];

    if (!flavors.length) {
      return ctx.reply(
        "У этого товара пока нет вкусов. Открой *Полный мастер* и добавь вкус.",
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("🍓 Полный мастер", "fl_builder_start")],
            [Markup.button.callback("✖️ Отмена", "fl_cancel")],
          ]),
        }
      );
    }

    const flavorLines = flavors.map((f) => {
      const label = String(f?.label || f?.flavorKey || "Вкус").trim();
      const stockRow = (Array.isArray(f?.stockByPickupPoint) ? f.stockByPickupPoint : []).find(
        (row) => String(row?.pickupPointId || "") === String(d.pickupPointId || "")
      );
      const currentQty = Math.max(0, Number(stockRow?.totalQty || 0));
      return `${label}=${currentQty}`;
    });

    const caption =
      `${preview}\n\n` +
      `3️⃣ Отредактируй *количество* по каждому вкусу (одно сообщение, каждый вкус с новой строки):\n\n` +
      `\`\`\`\n${flavorLines.join("\n")}\n\`\`\``;

    return sendStepCard(ctx, {
      photoUrl: "",
      caption,
      keyboard: Markup.inlineKeyboard([
        [Markup.button.callback("⬅️ Назад", "fl_back"), Markup.button.callback("✖️ Отмена", "fl_cancel")],
      ]),
    });
  }
};

export const askFlavorStep = async (ctx) => {
  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "fl_builder") return;

  const step = FL_BUILDER_STEPS[st.step];
  const d = st.data || {};
  const preview = renderFlavorBuilderPreview(d);

  // 1) сначала выбрать категорию, затем товар
  if (step === "product") {
    if (!d.categoryKey) {
      const r = await fetch(`${API_URL}/categories?active=0`);
      const data = await r.json().catch(() => ({}));

      const categories = Array.isArray(data)
        ? data
        : data.categories || [];

      if (!categories.length) {
        clearState(ctx.chat.id);

        return ctx.reply(
          "Категорий пока нет. Сначала создай категорию.",
          mainMenu(ctx)
        );
      }

      const kb = Markup.inlineKeyboard([
        ...categories
          .sort(
            (a, b) =>
              (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
          )
          .map((c) => [
            Markup.button.callback(
              `${c.isActive ? "✅" : "⛔️"} ${c.title}`,
              `fl_category:${c.key}`
            ),
          ]),

        [
          Markup.button.callback(
            "✖️ Отмена",
            "fl_cancel"
          ),
        ],
      ]);

      return sendStepCard(ctx, {
        photoUrl: "",
        caption: `Выберите *категорию*:`,
        keyboard: kb,
      });
    }

    const r = await fetch(
      `${API_URL}/products?active=0`
    );

    const data = await r.json().catch(() => ({}));

    const products = (data.products || []).filter(
      (p) =>
        String(p.categoryKey || "") ===
        String(d.categoryKey)
    );

    if (!products.length) {
      const kb = Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "⬅️ К категориям",
            "fl_category_back"
          ),
        ],

        [
          Markup.button.callback(
            "✖️ Отмена",
            "fl_cancel"
          ),
        ],
      ]);

      return sendStepCard(ctx, {
        photoUrl: "",
        caption: `В этой категории пока нет товаров.`,
        keyboard: kb,
      });
    }

    const kb = Markup.inlineKeyboard([
      ...products
        .sort(
          (a, b) =>
            (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
        )
        .map((p) => [
          Markup.button.callback(
            `${p.isActive ? "✅" : "⛔️"} ${(
              p.title1 || ""
            ).trim()} ${(p.title2 || "").trim()}`.trim(),

            `fl_pick_product:${p._id}`
          ),
        ]),

      [
        Markup.button.callback(
          "⬅️ К категориям",
          "fl_category_back"
        ),
      ],

      [
        Markup.button.callback(
          "✖️ Отмена",
          "fl_cancel"
        ),
      ],
    ]);

    return sendStepCard(ctx, {
      photoUrl: "",
      caption: `Выберите *товар*:`,
      keyboard: kb,
    });
  }

  // 2) действие с выбранной моделью
  if (step === "mode") {
    const kb = Markup.inlineKeyboard([
      [
        Markup.button.callback(
          "➕ Добавить вкус",
          "fl_set_mode:new"
        ),
      ],

      [
        Markup.button.callback(
          "✏️ Изменить наличие",
          "fl_set_mode:stock"
        ),
      ],

      [
        Markup.button.callback(
          "❌ Удалить модель",
          `fl_delete_ask:${d.productId}`
        ),
      ],

      [
        Markup.button.callback(
          "⬅️ Назад",
          "fl_back"
        ),

        Markup.button.callback(
          "✖️ Отмена",
          "fl_cancel"
        ),
      ],
    ]);

    return sendStepCard(ctx, {
      photoUrl: "",
      caption: `Выберите *действие*:`,
      keyboard: kb,
    });
  }

  // 3) новый вкус: ввод label + цвета
  if (step === "newFlavor") {
    const caption =
      `${preview}\n\n` +
      `Отправь *одним сообщением* через запятую:\n` +
      `*название вкуса, #ЦВЕТ1, #ЦВЕТ2*\n\n` +
      `Пример:\nCool Menthol, #92B8CB, #31460E`;

    return sendStepCard(ctx, {
      photoUrl: "",
      caption,
      keyboard: Markup.inlineKeyboard([
        [Markup.button.callback("⬅️ Назад", "fl_back"), Markup.button.callback("✖️ Отмена", "fl_cancel")],
      ]),
    });
  }

  // 4) выбрать существующий вкус
  if (step === "pickFlavor") {
    // грузим товар, чтобы взять актуальные flavors
    const r = await fetch(`${API_URL}/products?active=0`);
    const data = await r.json().catch(() => ({}));
    const products = data.products || [];
    const prod = products.find((p) => String(p._id) === String(d.productId));

    const flavors = (prod?.flavors || []).filter((f) => f.isActive !== false);

    if (!flavors.length) {
      // если вкусов нет — отправим в newFlavor
      st.step = FL_BUILDER_STEPS.indexOf("newFlavor");
      st.data.mode = "new";
      setState(ctx.chat.id, st);
      return askFlavorStep(ctx);
    }

    const kb = Markup.inlineKeyboard([
      [Markup.button.callback("✏️ Массово изменить", "fl_bulk_edit_start")],
      ...flavors.map((f) => [
        Markup.button.callback(f.label || f.flavorKey, `fl_pick_flavor:${f._id}`),
      ]),
      [Markup.button.callback("⬅️ Назад", "fl_back"), Markup.button.callback("✖️ Отмена", "fl_cancel")],
    ]);

    return sendStepCard(ctx, {
      photoUrl: "",
      caption: `${preview}\n\nВыберите *вкус*:`,
      keyboard: kb,
    });
  }

  // 5) bulk edit for all flavors of one product
  if (step === "bulkEdit") {
    if (!d.pickupPointId) {
      st.step = FL_BUILDER_STEPS.indexOf("pickupPoint");
      setState(ctx.chat.id, st);
      return askFlavorStep(ctx);
    }

    const r = await fetch(`${API_URL}/products?active=0`);
    const data = await r.json().catch(() => ({}));
    const products = data.products || [];
    const prod = products.find((p) => String(p._id) === String(d.productId));
    const flavors = Array.isArray(prod?.flavors) ? prod.flavors.filter((f) => f.isActive !== false) : [];

    if (!flavors.length) {
      st.step = FL_BUILDER_STEPS.indexOf("newFlavor");
      st.data.mode = "new";
      setState(ctx.chat.id, st);
      return askFlavorStep(ctx);
    }

    const flavorLines = flavors.map((f) => {
      const label = String(f?.label || f?.flavorKey || "Вкус").trim();
      const stockRow = (Array.isArray(f?.stockByPickupPoint) ? f.stockByPickupPoint : []).find(
        (row) => String(row?.pickupPointId || "") === String(d.pickupPointId || "")
      );
      const currentQty = Math.max(0, Number(stockRow?.totalQty || 0));
      return `${label}=${currentQty}`;
    });

    const caption =
      `${preview}\n\n` +
      `Отправь изменения *одним сообщением*, каждый вкус с новой цифрой с новой строки.\n\n` +
      `Поддерживаются оба формата:\n` +
      `\`Blueberry Ice=10\`\n` +
      `\`1=10\`\n\n` +
      `Скопируй список ниже, отредактируй цифры и отправь обратно:\n\n` +
      `\`\`\`\n${flavorLines.join("\n")}\n\`\`\``;

    return sendStepCard(ctx, {
      photoUrl: "",
      caption,
      keyboard: Markup.inlineKeyboard([
        [Markup.button.callback("⬅️ Назад", "fl_back"), Markup.button.callback("✖️ Отмена", "fl_cancel")],
      ]),
    });
  }

  // 5) выбрать точку
  if (step === "pickupPoint") {
    const points = await fetchMyPickupPoints(ctx);

    if (!points.length) {
      return ctx.reply("❌ У тебя нет доступных точек самовывоза. Добавь свой telegramId в точку (allowedAdminTelegramIds).");
    }

    const kb = Markup.inlineKeyboard([
      ...points
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map((p) => {
          const pointTitle = String(p?.title || "").trim();
          const pointAddress = String(p?.address || "").trim();
          const pointLabel = pointTitle && pointAddress
            ? `${pointTitle} (${pointAddress})`
            : pointTitle || pointAddress || "Без названия";

          return [
            Markup.button.callback(`${p.isActive ? "✅" : "⛔️"} ${pointLabel}`, `fl_pick_point:${p._id}`),
          ];
        }),
      [Markup.button.callback("⬅️ Назад", "fl_back"), Markup.button.callback("✖️ Отмена", "fl_cancel")],
    ]);

    return sendStepCard(ctx, {
      photoUrl: "",
      caption: `${preview}\n\nВыберите *точку самовывоза*:`,
      keyboard: kb,
    });
  }

  // 6) qty
  if (step === "qty") {
    // показываем текущее количество по выбранному вкусу на выбранной точке
    let currentQty = 0;

    try {
      const r = await fetch(`${API_URL}/products?active=0`);
      const data = await r.json().catch(() => ({}));
      const products = data.products || [];

      const prod = products.find((p) => String(p._id) === String(d.productId));

      if (prod) {
        // вкус может быть выбран по _id (flavorId) или по flavorKey
        const flavor =
          (prod.flavors || []).find((f) => String(f._id) === String(d.flavorId)) ||
          (prod.flavors || []).find((f) => String(f.flavorKey) === String(d.flavorKey));

        if (flavor) {
          const row = (flavor.stockByPickupPoint || []).find(
            (s) => String(s.pickupPointId) === String(d.pickupPointId)
          );
          currentQty = Number(row?.totalQty || 0);
        }
      }
    } catch (e) {
      // не ломаем шаг — просто покажем 0
      currentQty = 0;
    }

    return sendStepCard(ctx, {
      photoUrl: "",
      caption:
        `${preview}\n\n` +
        `Текущее количество на точке: *${currentQty}*\n\n` +
        `Введите *количество* (число 0+):`,
      keyboard: Markup.inlineKeyboard([
        [Markup.button.callback("⬅️ Назад", "fl_back"), Markup.button.callback("✖️ Отмена", "fl_cancel")],
      ]),
    });
  }

  // 7) confirm
  if (step === "confirm") {
    const kb = Markup.inlineKeyboard([
      [Markup.button.callback("✅ Сохранить", "fl_confirm")],
      [Markup.button.callback("⬅️ Назад", "fl_back"), Markup.button.callback("✖️ Отмена", "fl_cancel")],
    ]);

    return sendStepCard(ctx, {
      photoUrl: "",
      caption: `${preview}\n\nПодтвердить сохранение?`,
      keyboard: kb,
    });
  }
};

export const nextFlavorStep = async (ctx) => {
  const st = getState(ctx.chat.id);
  st.step += 1;
  setState(ctx.chat.id, st);
  return askFlavorStep(ctx);
};

const productNavKeyboard = (stepIndex) => {
  const backBtn = stepIndex > 0 ? Markup.button.callback("⬅️ Назад", "prod_builder_back") : null;
  const cancelBtn = Markup.button.callback("✖️ Отмена", "prod_builder_cancel");
  return backBtn
    ? Markup.inlineKeyboard([[backBtn, cancelBtn]])
    : Markup.inlineKeyboard([[cancelBtn]]);
};

