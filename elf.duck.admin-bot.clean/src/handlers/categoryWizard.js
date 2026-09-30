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
import { BUILDER_STEPS } from "./categoryProductDefs.js";
import { defaultCategoryData, CATEGORY_VARIANTS } from "./productFlow.js";
import { askStep, nextStep } from "./pickupFlow.js";

// =====================================================
// ============ CATEGORY BUILDER (FULL WIZARD) ===========
// =====================================================
bot.action("cat_builder_start", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  setState(ctx.chat.id, { mode: "cat_builder", step: 0, data: defaultCategoryData() });
  return askStep(ctx);
});

bot.action("cat_builder_cancel", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  clearState(ctx.chat.id);
  return ctx.reply("Ок, отменено.", mainMenu(ctx));
});

bot.action("cat_builder_back", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);
  if (!st || (st.mode !== "cat_builder" && st.mode !== "cat_edit")) return;

  st.step = Math.max(0, st.step - 1);
  setState(ctx.chat.id, st);
  return askStep(ctx);
});

// ----- button setters -----
bot.action(/cat_builder_set_showOverlay:(true|false)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);
  if (!st || (st.mode !== "cat_builder" && st.mode !== "cat_edit")) return;

  st.data.showOverlay = ctx.match[1] === "true";
  setState(ctx.chat.id, st);
  return nextStep(ctx);
});

bot.action(/cat_builder_set_classCardDuck:(.+)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);
  if (!st || (st.mode !== "cat_builder" && st.mode !== "cat_edit")) return;

  const val = ctx.match[1];
  st.data.classCardDuck = DUCK_CLASS_OPTIONS.some((o) => o.value === val) ? val : "cardImageLeft";
  setState(ctx.chat.id, st);
  return nextStep(ctx);
});

bot.action(/cat_builder_set_titleClass:(.+)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);
  if (!st || (st.mode !== "cat_builder" && st.mode !== "cat_edit")) return;

  const val = ctx.match[1];
  st.data.titleClass = TITLE_CLASS_OPTIONS.some((o) => o.value === val) ? val : "cardTitle";
  setState(ctx.chat.id, st);
  return nextStep(ctx);
});

bot.action(/cat_builder_set_isActive:(true|false)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);
  if (!st || (st.mode !== "cat_builder" && st.mode !== "cat_edit")) return;

  st.data.isActive = ctx.match[1] === "true";
  setState(ctx.chat.id, st);
  return nextStep(ctx);
});

// ----- confirm create -----
bot.action("cat_builder_confirm", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "cat_builder") return;

  try {
    const payload = { ...st.data };

    const created = await api("/admin/categories", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    clearState(ctx.chat.id);
    return ctx.reply(
      `✅ Категория создана:\n${created.category.title} (${created.category.key})`,
      mainMenu(ctx)
    );
  } catch (e) {
    return ctx.reply(`❌ Ошибка: ${e.message}`, mainMenu(ctx));
  }
});

bot.action("cat_edit_confirm", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "cat_edit") return;

  try {
    const payload = { ...st.data };

    const updated = await api(`/admin/categories/${st.editId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });

    clearState(ctx.chat.id);

    return ctx.reply(
      `✅ Категория обновлена:\n${updated.category.title} (${updated.category.key})`,
      mainMenu(ctx)
    );
  } catch (e) {
    return ctx.reply(`❌ Ошибка: ${e.message}`, mainMenu(ctx));
  }
});

bot.action(/prod_set_layout:(1|2)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "prod_builder") return;

  const id = Number(ctx.match[1]);
  const preset = PRODUCT_LAYOUTS.find((x) => x.id === id);
  if (!preset) return;

  st.data.classCardDuck = preset.value.classCardDuck;
  st.data.classActions = preset.value.classActions;

  setState(ctx.chat.id, st);
  return nextProductStep(ctx);
});

bot.action(/prod_set_category:(.+)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "prod_builder") return;

  st.data.categoryKey = ctx.match[1];
  setState(ctx.chat.id, st);
  return nextProductStep(ctx);
});

bot.action(
  /^broadcast_audience:(all|segment|username)$/,
  async (ctx) => {
    if (!isAdmin(ctx)) {
      return ctx.answerCbQuery("No access");
    }

    await ctx.answerCbQuery();

    const st = getState(ctx.chat.id);

    if (!st || st.mode !== "broadcast") return;

    st.data.audienceType = ctx.match[1];

    st.data.segmentType = "";
    st.data.segmentValue = "";
    st.data.username = "";

    if (st.data.audienceType === "all") {

      st.step = st.data.templateId

        ? BROADCAST_STEPS.indexOf("confirm")

        : BROADCAST_STEPS.indexOf("templateChoice");

    } else {

      st.step = BROADCAST_STEPS.indexOf("segmentType");

    }

    setState(ctx.chat.id, st);

    return askBroadcastStep(ctx);
  }
);

bot.action(
  /^broadcast_segment_type:(category|pickupPoint|deliveryMethod)$/,
  async (ctx) => {
    if (!isAdmin(ctx)) {
      return ctx.answerCbQuery("No access");
    }

    await ctx.answerCbQuery();

    const st = getState(ctx.chat.id);

    if (!st || st.mode !== "broadcast") return;

    st.data.segmentType = ctx.match[1];
    st.data.segmentValue = "";

    st.step =
      BROADCAST_STEPS.indexOf(
        "segmentValue"
      );

    setState(ctx.chat.id, st);

    return askBroadcastStep(ctx);
  }
);

bot.action(
  /^broadcast_segment_value:(.+)$/,
  async (ctx) => {
    if (!isAdmin(ctx)) {
      return ctx.answerCbQuery("No access");
    }

    await ctx.answerCbQuery();

    const st = getState(ctx.chat.id);

    if (!st || st.mode !== "broadcast") return;

    st.data.segmentValue = String(
      ctx.match[1] || ""
    ).trim();

    st.step = st.data.templateId
      ? BROADCAST_STEPS.indexOf("confirm")
      : BROADCAST_STEPS.indexOf("templateChoice");

    setState(ctx.chat.id, st);

    return askBroadcastStep(ctx);
  }
);

bot.action("broadcast_start", async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.answerCbQuery("Недостаточно прав");
  }

  await ctx.answerCbQuery();

  return ctx.reply("📣 *Рассылки*", {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [
        Markup.button.callback(
          "📨 Новая рассылка",
          "broadcast_new"
        ),
      ],
      [
        Markup.button.callback(
          "📂 Шаблоны",
          "broadcast_templates"
        ),
      ],
      [
        Markup.button.callback(
          "⬅️ В админ-панель",
          "admin_panel"
        ),
      ],
    ]),
  });
});

bot.action("broadcast_new", async (ctx) => {

  if (!isAdmin(ctx)) {

    return ctx.answerCbQuery(

      "Недостаточно прав"

    );

  }

  await ctx.answerCbQuery();
  await ctx.answerCbQuery();

  setState(ctx.chat.id, {
    mode: "broadcast",
    step: 0,
    data: defaultBroadcastData(),
  });

  return askBroadcastStep(ctx);
});

bot.action("broadcast_cancel", async (ctx) => {
    if (!isAdmin(ctx)) {

    return ctx.answerCbQuery(

      "Недостаточно прав"

    );

  }
  await ctx.answerCbQuery();
  clearState(ctx.chat.id);
  return ctx.reply("Рассылка отменена.", mainMenu(ctx));
});

bot.action("broadcast_back", async (ctx) => {
    if (!isAdmin(ctx)) {

    return ctx.answerCbQuery(

      "Недостаточно прав"

    );

  }
  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "broadcast") return;

  st.step = Math.max(0, Number(st.step || 0) - 1);
  setState(ctx.chat.id, st);

  return askBroadcastStep(ctx);
});

const runBroadcastFromState = async (ctx, options = {}) => {
  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "broadcast") return null;

  const d = st.data || {};
  const limit = Math.max(0, Number(options?.limit || 0));

  const data = await api(
    options?.async
      ? "/admin/users/broadcast-photo-async"
      : "/admin/users/broadcast-photo",
    {
      method: "POST",
      body: JSON.stringify({

        dryRun: false,

        limit,

        audienceType: d.audienceType || "all",

        segmentType: d.segmentType || "",

        segmentValue: d.segmentValue || "",

        username: d.username || "",

        templateId: d.templateId || "",

        photoUrl: d.photoUrl,

        text: d.text,

        buttonText: d.buttonText,

        buttonUrl: d.buttonUrl,

      }),
    }
  );

  return data;
};

bot.action("broadcast_test", async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.answerCbQuery("Недостаточно прав");
  }

  await ctx.answerCbQuery("Отправляю тест...");

  try {
    const data = await runBroadcastFromState(ctx, { limit: 5 });

    const errorSamples = Array.isArray(data?.results)
      ? data.results
          .filter((row) => row && row.ok === false)
          .slice(0, 5)
          .map((row, index) => {
            const error = String(row?.error || "UNKNOWN_ERROR").slice(0, 300);
            return `${index + 1}. ${error}`;
          })
      : [];

    return ctx.reply(
      [
        "🧪 *Тестовая рассылка отправлена*",
        "",
        `Найдено пользователей: *${Number(data?.totalUsers || 0)}*`,
        `Отправлено: *${Number(data?.sent || 0)}*`,
        `Ошибок: *${Number(data?.failed || 0)}*`,
        `Заблокировали бота / недоступны: *${Number(data?.blocked || 0)}*`,
        ...(errorSamples.length
          ? ["", "*Ошибки Telegram:*", ...errorSamples.map((x) => `\`${x}\``)]
          : []),
      ].join("\n"),
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    return ctx.reply(`❌ Ошибка тестовой рассылки: ${String(e?.message || e)}`);
  }
});

bot.action("broadcast_confirm", async (ctx) => {
    if (!isAdmin(ctx)) {
    return ctx.answerCbQuery("Недостаточно прав");
  }

  await ctx.answerCbQuery("Запускаю рассылку...");

  try {
    const data = await runBroadcastFromState(ctx, { async: true });
    clearState(ctx.chat.id);

    const statusMessage = await ctx.reply(formatBroadcastJobStatus({
      jobId: data?.jobId,
      status: "running",
      totalUsers: Number(data?.totalUsers || 0),
      processed: 0,
      sent: 0,
      failed: 0,
      blocked: 0,
      lastErrors: [],
    }), {
      parse_mode: "Markdown",
      ...mainMenu(ctx),
    });

    startBroadcastStatusPolling(ctx, data?.jobId, statusMessage?.message_id, bot);
    return statusMessage;
  } catch (e) {
    return ctx.reply(`❌ Ошибка рассылки: ${String(e?.message || e)}`);
  }
});

