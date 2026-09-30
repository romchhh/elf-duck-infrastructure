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
import { defaultCashbackGrantData } from "./wizardState.js";
import {
  askCashbackGrantStep,
  askCashbackDeductStep,
  askCashbackLookupStep,
  cashbackMenuKeyboard,
  runCashbackLookup,
} from "./cashback.js";
import { mainMenu } from "./menu.js";

// =====================================================
// ======================= COMMANDS =====================
// =====================================================

bot.action("menu", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  clearState(ctx.chat.id);
  return ctx.reply("🛠️ ELF DUCK — Admin Panel", mainMenu(ctx));
});

bot.command("id", async (ctx) => {
  const userId = String(ctx.from?.id || "—");
  const username = String(ctx.from?.username || "").trim();
  const lines = [
    `🆔 Ваш Telegram ID: \`${userId}\``,
    username ? `Username: @${username}` : "",
    isAdmin(ctx)
      ? "✅ Доступ к admin-панели есть."
      : "⛔️ Этого ID нет в ADMIN_IDS / SUPER_ADMIN_IDS на сервере.",
  ].filter(Boolean);

  return ctx.reply(lines.join("\n"), { parse_mode: "Markdown" });
});

bot.start(async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.reply(accessDeniedReply(ctx), { parse_mode: "Markdown" });
  }
  clearState(ctx.chat.id);

  return ctx.reply("🛠️ ELF DUCK — Admin Panel", mainMenu(ctx));
});

async function fetchUsersExportCsvBuffer(requesterTelegramId) {
  const res = await fetch(`${API_URL}/admin/users/export`, {
    headers: {
      "x-admin-token": ADMIN_API_TOKEN,
      "x-admin-telegram-id": String(requesterTelegramId || ""),
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `HTTP ${res.status}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

async function handleUsersExport(ctx) {
  if (!isAdmin(ctx)) return;

  if (!isSuperAdmin(ctx)) {
    if (ctx.answerCbQuery) {
      await ctx.answerCbQuery("Только для супер-админов", { show_alert: true }).catch(() => {});
    }
    return ctx.reply("⛔️ Выгрузка базы доступна только супер-админам.");
  }

  if (ctx.answerCbQuery) {
    await ctx.answerCbQuery().catch(() => {});
  }

  const waitMsg = await ctx.reply("⏳ Готовлю CSV с базой клиентов…");

  try {
    const buffer = await fetchUsersExportCsvBuffer(ctx.from?.id);
    const stamp = new Date().toISOString().slice(0, 10);

    await ctx.replyWithDocument(
      Input.fromBuffer(buffer, `elfduck-users-${stamp}.csv`),
      {
        caption: "✅ Выгрузка базы клиентов (CSV, UTF-8)",
      }
    );
  } catch (e) {
    console.error("users_export error:", e);
    await ctx.reply(`❌ Ошибка выгрузки: ${String(e?.message || e)}`);
  } finally {
    try {
      await ctx.deleteMessage(waitMsg.message_id);
    } catch {}
  }
}

bot.action("users_export", handleUsersExport);

bot.action("cashback_menu_start", async (ctx) => {
  try {
    await ctx.answerCbQuery();
    if (!isAdmin(ctx)) return;
    return ctx.reply("💰 Кэшбек — выберите действие:", cashbackMenuKeyboard());
  } catch (e) {
    console.error("cashback_menu_start error:", e);
  }
});

bot.action("cashback_menu_close", async (ctx) => {
  try {
    await ctx.answerCbQuery("Закрыто");
    if (!isAdmin(ctx)) return;
    return ctx.reply("Меню кэшбека закрыто.", mainMenu(ctx));
  } catch (e) {
    console.error("cashback_menu_close error:", e);
  }
});

bot.action("cashback_grant_start", async (ctx) => {
  try {
    await ctx.answerCbQuery();
    if (!isAdmin(ctx)) return;

    setState(ctx.chat.id, {
      mode: "cashback_grant",
      step: 0,
      data: defaultCashbackGrantData(),
    });

    return askCashbackGrantStep(ctx);
  } catch (e) {
    console.error("cashback_grant_start error:", e);
  }
});

bot.action("cashback_grant_back", async (ctx) => {
  try {
    await ctx.answerCbQuery();
    if (!isAdmin(ctx)) return;

    const st = getState(ctx.chat.id);
    if (!st || st.mode !== "cashback_grant") return;

    st.step = Math.max(0, Number(st.step || 0) - 1);
    setState(ctx.chat.id, st);
    return askCashbackGrantStep(ctx);
  } catch (e) {
    console.error("cashback_grant_back error:", e);
  }
});

bot.action("cashback_grant_cancel", async (ctx) => {
  try {
    await ctx.answerCbQuery("Отменено");
    if (!isAdmin(ctx)) return;

    clearState(ctx.chat.id);
    return ctx.reply("Начисление кэшбека отменено.", mainMenu(ctx));
  } catch (e) {
    console.error("cashback_grant_cancel error:", e);
  }
});

bot.action("cashback_grant_confirm", async (ctx) => {
  try {
    await ctx.answerCbQuery();
    if (!isAdmin(ctx)) return;

    const st = getState(ctx.chat.id);
    if (!st || st.mode !== "cashback_grant") return;

    const username = String(st.data?.username || "").trim().replace(/^@+/, "");
    const amountZl = Number(st.data?.amountZl || 0);
    // const note = String(st.data?.note || "").trim();

    if (!username) return ctx.reply("❌ Укажи username пользователя.");
    if (!(amountZl > 0)) return ctx.reply("❌ Сумма должна быть больше 0.");

    const result = await api("/admin/users/cashback/grant-by-username", {
      method: "POST",
      body: JSON.stringify({
        username,
        amountZl,
        // note,
        grantedByTelegramId: String(ctx.from?.id || ""),
        grantedByUsername: String(ctx.from?.username || ""),
      }),
    });

    clearState(ctx.chat.id);

    return ctx.reply(
      [
        "✅ Кэшбек начислен",
        `username: @${username}`,
        `сумма: ${amountZl.toFixed(2)} zł`,
        `новый баланс: ${Number(result?.cashbackBalance || 0).toFixed(2)} zł`,
      ].join("\n"),
      mainMenu(ctx)
    );
  } catch (e) {
    console.error("cashback_grant_confirm error:", e);
    return ctx.reply(`❌ Ошибка начисления: ${e.message}`);
  }
});

bot.action("cashback_deduct_start", async (ctx) => {
  try {
    await ctx.answerCbQuery();
    if (!isAdmin(ctx)) return;

    setState(ctx.chat.id, {
      mode: "cashback_deduct",
      step: 0,
      data: defaultCashbackGrantData(),
    });

    return askCashbackDeductStep(ctx);
  } catch (e) {
    console.error("cashback_deduct_start error:", e);
  }
});

bot.action("cashback_deduct_back", async (ctx) => {
  try {
    await ctx.answerCbQuery();
    if (!isAdmin(ctx)) return;

    const st = getState(ctx.chat.id);
    if (!st || st.mode !== "cashback_deduct") return;

    st.step = Math.max(0, Number(st.step || 0) - 1);
    setState(ctx.chat.id, st);
    return askCashbackDeductStep(ctx);
  } catch (e) {
    console.error("cashback_deduct_back error:", e);
  }
});

bot.action("cashback_deduct_cancel", async (ctx) => {
  try {
    await ctx.answerCbQuery("Отменено");
    if (!isAdmin(ctx)) return;

    clearState(ctx.chat.id);
    return ctx.reply("Списание кэшбека отменено.", mainMenu(ctx));
  } catch (e) {
    console.error("cashback_deduct_cancel error:", e);
  }
});

bot.action("cashback_deduct_confirm", async (ctx) => {
  try {
    await ctx.answerCbQuery();
    if (!isAdmin(ctx)) return;

    const st = getState(ctx.chat.id);
    if (!st || st.mode !== "cashback_deduct") return;

    const username = String(st.data?.username || "").trim().replace(/^@+/, "");
    const amountZl = Number(st.data?.amountZl || 0);

    if (!username) return ctx.reply("❌ Укажи username пользователя.");
    if (!(amountZl > 0)) return ctx.reply("❌ Сумма должна быть больше 0.");

    const result = await api("/admin/users/cashback/deduct-by-username", {
      method: "POST",
      body: JSON.stringify({
        username,
        amountZl,
        grantedByTelegramId: String(ctx.from?.id || ""),
        grantedByUsername: String(ctx.from?.username || ""),
      }),
    });

    clearState(ctx.chat.id);

    return ctx.reply(
      [
        "✅ Кэшбек списан",
        `username: @${username}`,
        `сумма: ${amountZl.toFixed(2)} zł`,
        `новый баланс: ${Number(result?.cashbackBalance || 0).toFixed(2)} zł`,
      ].join("\n"),
      mainMenu(ctx)
    );
  } catch (e) {
    console.error("cashback_deduct_confirm error:", e);
    const msg = String(e?.message || e);
    if (msg === "INSUFFICIENT_CASHBACK_BALANCE") {
      return ctx.reply("❌ Недостаточно кэшбека на балансе пользователя.");
    }
    return ctx.reply(`❌ Ошибка списания: ${msg}`);
  }
});

bot.action("cashback_lookup_start", async (ctx) => {
  try {
    await ctx.answerCbQuery();
    if (!isAdmin(ctx)) return;

    setState(ctx.chat.id, {
      mode: "cashback_lookup",
      step: 0,
      data: defaultCashbackGrantData(),
    });

    return askCashbackLookupStep(ctx);
  } catch (e) {
    console.error("cashback_lookup_start error:", e);
  }
});

bot.action("cashback_lookup_cancel", async (ctx) => {
  try {
    await ctx.answerCbQuery("Отменено");
    if (!isAdmin(ctx)) return;

    clearState(ctx.chat.id);
    return ctx.reply("Проверка баланса отменена.", mainMenu(ctx));
  } catch (e) {
    console.error("cashback_lookup_cancel error:", e);
  }
});

const formatPickupScheduleDates = (scheduleByDate) => {
  const source =
    scheduleByDate &&
    typeof scheduleByDate === "object"
      ? scheduleByDate
      : {};

      const warsawDateParts =
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Warsaw",
        year: "numeric",
        month: "2-digit",
      }).formatToParts(new Date());

    const warsawDateValues =
      Object.fromEntries(
        warsawDateParts.map((part) => [
          part.type,
          part.value,
        ])
      );

    const currentYear = String(
      warsawDateValues.year || ""
    );

    const currentMonth = String(
      warsawDateValues.month || ""
    ).padStart(2, "0");

    const rows = Object.entries(source)
      .filter(([dateKey]) => {
        const dateMatch = String(
          dateKey
        ).match(
          /^(\d{4})-(\d{2})-(\d{2})$/
        );

        if (!dateMatch) {
          return false;
        }

        return (
          dateMatch[1] === currentYear &&
          dateMatch[2] === currentMonth
        );
      })
      .map(([dateKey, value]) => {
      const dateMatch = String(
        dateKey
      ).match(
        /^(\d{4})-(\d{2})-(\d{2})$/
      );

      if (!dateMatch) {
        return null;
      }

      const displayDate =
        `${dateMatch[3]}.${dateMatch[2]}.${dateMatch[1]}`;

      const timestamp = Date.UTC(
        Number(dateMatch[1]),
        Number(dateMatch[2]) - 1,
        Number(dateMatch[3])
      );

      if (value?.isOpen !== true) {
        return {
          timestamp,
          text:
            `• ${displayDate} — закрыто`,
        };
      }

      const periods = Array.isArray(
        value?.periods
      )
        ? value.periods
            .map((period) => {
              const from = String(
                period?.from ||
                  period?.openFrom ||
                  ""
              ).trim();

              const to = String(
                period?.to ||
                  period?.openTo ||
                  ""
              ).trim();

              return from && to
                ? `${from}-${to}`
                : "";
            })
            .filter(Boolean)
        : [];

      const fallbackFrom = String(
        value?.from ||
          value?.openFrom ||
          ""
      ).trim();

      const fallbackTo = String(
        value?.to ||
          value?.openTo ||
          ""
      ).trim();

      const scheduleLabel =
        periods.length
          ? periods.join(" / ")
          : fallbackFrom && fallbackTo
          ? `${fallbackFrom}-${fallbackTo}`
          : "график не указан";

      return {
        timestamp,
        text:
          `• ${displayDate} — ${scheduleLabel}`,
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        a.timestamp - b.timestamp
    );

  return rows.length

    ? rows

        .map((row) => row.text)

        .join("\n")

    : "В текущем месяце добавленных дат пока нет.";
};

