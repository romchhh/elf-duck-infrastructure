import { Markup } from "./_telegraf.js";
import { getState, setState, clearState } from "../state.js";
import { api } from "../api.js";
import { mainMenu } from "./menu.js";

// =====================================================
// ================= CASHBACK ADMIN WIZARDS ===============
// =====================================================

export const CASHBACK_GRANT_STEPS = ["username", "amount", "confirm"];
export const CASHBACK_DEDUCT_STEPS = ["username", "amount", "confirm"];
export const CASHBACK_LOOKUP_STEPS = ["username"];

const renderCashbackGrantPreview = (d = {}) => {
  const lines = [];
  lines.push("💰 *Начисление кэшбека — превью*");
  lines.push("");
  lines.push(`• username: *${d.username || "—"}*`);
  lines.push(`• сумма: *${Number(d.amountZl || 0).toFixed(2)} zł*`);
  return lines.join("\n");
};

const renderCashbackDeductPreview = (d = {}) => {
  const lines = [];
  lines.push("➖ *Списание кэшбека — превью*");
  lines.push("");
  lines.push(`• username: *${d.username || "—"}*`);
  lines.push(`• сумма: *${Number(d.amountZl || 0).toFixed(2)} zł*`);
  return lines.join("\n");
};

const renderCashbackLookupPreview = (d = {}) => {
  const lines = [];
  lines.push("🔎 *Проверка баланса кэшбека*");
  lines.push("");
  lines.push(`• username: *${d.username || "—"}*`);
  return lines.join("\n");
};

const cashbackGrantNavKeyboard = (stepIndex, cancelAction = "cashback_grant_cancel") => {
  const backBtn = stepIndex > 0
    ? Markup.button.callback("⬅️ Назад", "cashback_grant_back")
    : null;

  const cancelBtn = Markup.button.callback("✖️ Отмена", cancelAction);

  return backBtn
    ? Markup.inlineKeyboard([[backBtn, cancelBtn]])
    : Markup.inlineKeyboard([[cancelBtn]]);
};

const cashbackDeductNavKeyboard = (stepIndex) => {
  const backBtn = stepIndex > 0
    ? Markup.button.callback("⬅️ Назад", "cashback_deduct_back")
    : null;

  const cancelBtn = Markup.button.callback("✖️ Отмена", "cashback_deduct_cancel");

  return backBtn
    ? Markup.inlineKeyboard([[backBtn, cancelBtn]])
    : Markup.inlineKeyboard([[cancelBtn]]);
};

export const cashbackMenuKeyboard = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback("➕ Начислить", "cashback_grant_start")],
    [Markup.button.callback("➖ Списать", "cashback_deduct_start")],
    [Markup.button.callback("🔎 Проверить баланс", "cashback_lookup_start")],
    [Markup.button.callback("✖️ Закрыть", "cashback_menu_close")],
  ]);

export const askCashbackGrantStep = async (ctx) => {
  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "cashback_grant") return;

  const step = CASHBACK_GRANT_STEPS[st.step];
  const preview = renderCashbackGrantPreview(st.data || {});

  if (step === "username") {
    return ctx.reply(
      `${preview}\n\nВведите *username пользователя* в формате: \`@username\``,
      { parse_mode: "Markdown", ...cashbackGrantNavKeyboard(st.step) }
    );
  }

  if (step === "amount") {
    return ctx.reply(
      `${preview}\n\nВведите *сумму начисления* в zł, пример: \`25\` или \`37.5\``,
      { parse_mode: "Markdown", ...cashbackGrantNavKeyboard(st.step) }
    );
  }

  if (step === "confirm") {
    return ctx.reply(
      `${preview}\n\nПодтвердить начисление кэшбека?`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("✅ Начислить", "cashback_grant_confirm")],
          [
            Markup.button.callback("⬅️ Назад", "cashback_grant_back"),
            Markup.button.callback("✖️ Отмена", "cashback_grant_cancel"),
          ],
        ]),
      }
    );
  }
};

export const askCashbackDeductStep = async (ctx) => {
  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "cashback_deduct") return;

  const step = CASHBACK_DEDUCT_STEPS[st.step];
  const preview = renderCashbackDeductPreview(st.data || {});

  if (step === "username") {
    return ctx.reply(
      `${preview}\n\nВведите *username пользователя* в формате: \`@username\``,
      { parse_mode: "Markdown", ...cashbackDeductNavKeyboard(st.step) }
    );
  }

  if (step === "amount") {
    return ctx.reply(
      `${preview}\n\nВведите *сумму списания* в zł, пример: \`10\` или \`12.5\``,
      { parse_mode: "Markdown", ...cashbackDeductNavKeyboard(st.step) }
    );
  }

  if (step === "confirm") {
    return ctx.reply(
      `${preview}\n\nПодтвердить списание кэшбека?`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("✅ Списать", "cashback_deduct_confirm")],
          [
            Markup.button.callback("⬅️ Назад", "cashback_deduct_back"),
            Markup.button.callback("✖️ Отмена", "cashback_deduct_cancel"),
          ],
        ]),
      }
    );
  }
};

export const askCashbackLookupStep = async (ctx) => {
  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "cashback_lookup") return;

  const preview = renderCashbackLookupPreview(st.data || {});

  return ctx.reply(
    `${preview}\n\nВведите *username пользователя* в формате: \`@username\``,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("✖️ Отмена", "cashback_lookup_cancel")],
      ]),
    }
  );
};

export async function runCashbackLookup(ctx, usernameRaw) {
  const username = String(usernameRaw || "").trim().replace(/^@+/, "");
  if (!username) {
    return ctx.reply("❌ Укажи username пользователя.");
  }

  const result = await api(
    `/admin/users/cashback/by-username?username=${encodeURIComponent(username)}`,
    { method: "GET" }
  );

  const balance = Number(result?.cashbackBalance || 0).toFixed(2);
  const lots = Array.isArray(result?.activeLots) ? result.activeLots : [];
  const lotLines = lots.slice(0, 8).map((row, i) => {
    const exp = row?.expiresAt
      ? new Date(row.expiresAt).toLocaleDateString("ru-RU")
      : "—";
    return `${i + 1}. ${Number(row?.remainingZl || 0).toFixed(2)} zł (до ${exp})`;
  });

  return ctx.reply(
    [
      "🔎 Баланс кэшбека",
      `username: @${username}`,
      `баланс: ${balance} zł`,
      `активных начислений: ${Number(result?.activeLotsCount || lots.length)}`,
      lotLines.length ? `\n${lotLines.join("\n")}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    mainMenu(ctx)
  );
}
