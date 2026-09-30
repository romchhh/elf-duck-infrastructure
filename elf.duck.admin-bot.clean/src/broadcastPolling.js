import { api } from "./api.js";

const broadcastPollTimers = new Map();

export function formatBroadcastJobStatus(job = {}) {
  const totalUsers = Number(job?.totalUsers || 0);
  const processed = Number(job?.processed || 0);
  const sent = Number(job?.sent || 0);
  const failed = Number(job?.failed || 0);
  const blocked = Number(job?.blocked || 0);
  const status = String(job?.status || "running");
  const percent = totalUsers > 0 ? Math.floor((processed / totalUsers) * 100) : 0;

  const title =
    status === "done" ? "✅ *Рассылка завершена*" : "📣 *Рассылка выполняется*";

  const errors = Array.isArray(job?.lastErrors)
    ? job.lastErrors.slice(-3).map((row, index) => {
        const error = String(row?.error || "UNKNOWN_ERROR").slice(0, 160);
        return `\`${index + 1}. ${error}\``;
      })
    : [];

  return [
    title,
    "",
    `ID задачи: \`${String(job?.jobId || "—")}\``,
    `Прогресс: *${processed}/${totalUsers}* — *${percent}%*`,
    `Отправлено: *${sent}*`,
    `Ошибок: *${failed}*`,
    `Заблокировали / недоступны: *${blocked}*`,
    ...(errors.length ? ["", "*Последние ошибки:*", ...errors] : []),
  ].join("\n");
}

export function startBroadcastStatusPolling(ctx, jobId, statusMessageId, bot) {
  const chatId = String(ctx?.chat?.id || "");
  const safeJobId = String(jobId || "").trim();
  const safeMessageId = Number(statusMessageId || 0);

  if (!chatId || !safeJobId || !safeMessageId || !bot) return;

  const timerKey = `${chatId}:${safeJobId}`;

  const prevTimer = broadcastPollTimers.get(timerKey);
  if (prevTimer) {
    clearTimeout(prevTimer);
    broadcastPollTimers.delete(timerKey);
  }

  let lastText = "";
  let attempts = 0;
  let stopped = false;

  const stopPolling = () => {
    stopped = true;
    const currentTimer = broadcastPollTimers.get(timerKey);
    if (currentTimer) clearTimeout(currentTimer);
    broadcastPollTimers.delete(timerKey);
  };

  const scheduleNextPoll = () => {
    if (stopped) return;
    const timer = setTimeout(() => poll(), 2000);
    broadcastPollTimers.set(timerKey, timer);
  };

  const poll = async () => {
    if (stopped) return;
    attempts += 1;

    try {
      const data = await api(
        `/admin/users/broadcast-jobs/${safeJobId}?_ts=${Date.now()}`
      );

      const job = data?.job || {};
      const text = formatBroadcastJobStatus(job);
      const status = String(job?.status || "running");

      if (text !== lastText) {
        try {
          await bot.telegram.editMessageText(
            Number(chatId),
            safeMessageId,
            undefined,
            text,
            { parse_mode: "Markdown" }
          );
          lastText = text;
        } catch (editError) {
          const description = String(
            editError?.response?.description || editError?.message || editError || ""
          );

          if (description.includes("message is not modified")) {
            lastText = text;
          } else if (["done", "failed"].includes(status)) {
            try {
              await bot.telegram.sendMessage(Number(chatId), text, {
                parse_mode: "Markdown",
              });
              lastText = text;
            } catch (fallbackError) {
              console.error(
                "[BROADCAST STATUS FALLBACK FAILED]",
                fallbackError?.response?.description || fallbackError?.message || fallbackError
              );
            }
          }
        }
      }

      if (["done", "failed"].includes(status) || attempts >= 120) {
        stopPolling();
        return;
      }

      scheduleNextPoll();
    } catch (error) {
      console.error("[BROADCAST STATUS POLLING FAILED]", {
        jobId: safeJobId,
        attempt: attempts,
        error: error?.stack || error?.message || error,
      });

      if (attempts >= 120) {
        stopPolling();
        return;
      }

      scheduleNextPoll();
    }
  };

  poll();
}
