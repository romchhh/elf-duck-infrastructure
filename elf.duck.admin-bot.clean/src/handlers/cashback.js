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
// ================= CASHBACK GRANT WIZARD ==============
// =====================================================

export const CASHBACK_GRANT_STEPS = ["username", "amount", "confirm"];

const renderCashbackGrantPreview = (d = {}) => {
  const lines = [];
  lines.push("💰 *Начисление кэшбека — превью*");
  lines.push("");
  lines.push(`• username: *${d.username || "—"}*`);
  lines.push(`• сумма: *${Number(d.amountZl || 0).toFixed(2)} zł*`);
  // lines.push(`• комментарий: ${d.note ? `*${d.note}*` : "—"}`);
  return lines.join("\n");
};

const cashbackGrantNavKeyboard = (stepIndex) => {
  const backBtn = stepIndex > 0
    ? Markup.button.callback("⬅️ Назад", "cashback_grant_back")
    : null;

  const cancelBtn = Markup.button.callback("✖️ Отмена", "cashback_grant_cancel");

  return backBtn
    ? Markup.inlineKeyboard([[backBtn, cancelBtn]])
    : Markup.inlineKeyboard([[cancelBtn]]);
};

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

  // if (step === "note") {
  //   return ctx.reply(
  //     `${preview}\n\nВведите *комментарий* для истории начисления или отправьте \`-\`, если без комментария.`,
  //     { parse_mode: "Markdown", ...cashbackGrantNavKeyboard(st.step) }
  //   );
  // }

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

