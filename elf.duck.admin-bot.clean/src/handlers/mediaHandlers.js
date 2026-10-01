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
import {
  BROADCAST_STEPS,
  defaultBroadcastData,
  askBroadcastStep,
  askCourierMessageStep,
} from "./wizardState.js";

bot.on("photo", async (ctx, next) => {
  try {
    const st = getState(ctx.chat.id);

    if (st?.mode === "broadcast") {
      if (!isSuperAdmin(ctx)) {
        clearState(ctx.chat.id);
        return ctx.reply("Недостаточно прав.");
      }

      const step = BROADCAST_STEPS[st.step];

      if (step !== "photo") {
        return ctx.reply("Сейчас нужно отправить текст, а не фото.");
      }

      const d = st.data || defaultBroadcastData();
      const photos = Array.isArray(ctx.message?.photo) ? ctx.message.photo : [];
      const bestPhoto = photos.length ? photos[photos.length - 1] : null;

      if (!bestPhoto?.file_id) {
        return ctx.reply("Прикрепите фото одним сообщением.");
      }

      const file = await ctx.telegram.getFile(bestPhoto.file_id);
      const filePath = String(file?.file_path || "").trim();

      if (!filePath) {
        return ctx.reply("❌ Не удалось получить путь к фото. Попробуйте ещё раз.");
      }

      d.photoUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
      st.data = d;
      st.step = BROADCAST_STEPS.indexOf("text");

      setState(ctx.chat.id, st);
      return askBroadcastStep(ctx);
    }

    if (!st || st.mode !== "courier_msg" || Number(st.step) !== 2) {
      return next();
    }

    const photos = Array.isArray(ctx.message?.photo) ? ctx.message.photo : [];
    const bestPhoto = photos[photos.length - 1];
    const fileId = String(bestPhoto?.file_id || "").trim();

    if (!fileId) {
      return ctx.reply("❌ Не удалось прочитать фото. Попробуйте отправить ещё раз.");
    }

    const file = await ctx.telegram.getFile(fileId);
    const filePath = String(file?.file_path || "").trim();

    if (!filePath) {
      return ctx.reply("❌ Не удалось получить путь к фото. Попробуйте ещё раз.");
    }

    const photoUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

    st.data = st.data || {};
    st.data.photoUrl = photoUrl;
    st.step = 3;
    setState(ctx.chat.id, st);

    return askCourierMessageStep(ctx);
  } catch (e) {
    console.error("courier_msg photo handler error:", e);
    return ctx.reply(`❌ Ошибка: ${e.message}`);
  }
});
