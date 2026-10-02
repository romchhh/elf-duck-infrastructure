import mongoose from "mongoose";
import { Telegraf, Markup } from "telegraf";
import User from "../../models/User.js";
import Category from "../../models/Category.js";
import Product from "../../models/Product.js";
import PickupPoint from "../../models/PickupPoint.js";
import Cart from "../../models/Cart.js";
import Order from "../../models/Order.js";
import BroadcastCampaign from "../../models/BroadcastCampaign.js";
import { getServerContext } from "../server/context.js";
import { setUserBots, bot, userBots } from "../server/botRegistry.js";
import { getTelegramBotTokens } from "./botTokens.js";
import { createShopBotClient } from "./shopBotClient.js";
import { setShopBotUsername } from "./shopBotReferralLink.js";
import { getStartBannerUrl } from "../config/rootConfig.js";

export async function bootstrapShopTelegramBots(app) {
  Object.assign(globalThis, getServerContext());

// ==== Telegram бот ====

function normalizeManagerCallbackOrderId(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  if (mongoose.isValidObjectId(trimmed)) {
    return String(trimmed);
  }
  const hexPrefix = trimmed.match(/^([a-f0-9]{24})/i);
  return hexPrefix ? hexPrefix[1] : trimmed;
}

async function findOrderForManagerCallback(orderIdRaw, ctx) {
  const orderId = normalizeManagerCallbackOrderId(orderIdRaw);
  if (!orderId) {
    await ctx.answerCbQuery("Заказ не найден").catch(() => {});
    return null;
  }

  let order = null;
  if (mongoose.isValidObjectId(orderId)) {
    order = await Order.findById(orderId);
  }
  if (!order && /^ED[-\d]/i.test(orderId)) {
    order = await Order.findOne({
      orderNo: orderId.toUpperCase(),
    });
  }

  if (!order) {
    console.error("[manager-bot] order not found for callback", {
      orderId,
      orderIdLength: orderId.length,
      dbName: mongoose.connection?.db?.databaseName || "",
      mongoReadyState: mongoose.connection?.readyState,
      from: ctx?.from?.id,
      callbackData: ctx?.callbackQuery?.data,
    });
    await ctx.answerCbQuery("Заказ не найден").catch(() => {});
    return null;
  }

  return order;
}

async function answerManagerCallbackQuery(ctx, text, extra) {
  try {
    if (text) {
      await ctx.answerCbQuery(text, extra);
    } else {
      await ctx.answerCbQuery(extra);
    }
  } catch (_) {}
}

function getCallbackMessageIds(ctx) {
  const msg = ctx?.callbackQuery?.message;
  const chatId = msg?.chat?.id;
  const messageId = msg?.message_id;
  if (chatId == null || messageId == null) return null;
  return { chatId, messageId };
}

async function editManagerCallbackKeyboard(ctx, inlineKeyboard) {
  const ids = getCallbackMessageIds(ctx);
  if (!ids) {
    throw new Error("CALLBACK_MESSAGE_MISSING");
  }

  const replyMarkup = { inline_keyboard: inlineKeyboard };

  await ctx.telegram.editMessageReplyMarkup(
    ids.chatId,
    ids.messageId,
    undefined,
    replyMarkup
  );
}

const TG_BOT_TOKENS = getTelegramBotTokens();
const WEBAPP_URL = process.env.WEBAPP_URL || "";
const START_BANNER_URL = getStartBannerUrl();

if (TG_BOT_TOKENS.length) {
  const __botInstances = TG_BOT_TOKENS.map((token) => new Telegraf(token));
  setUserBots(__botInstances);
  console.log(
    `[bot] Configured ${userBots.length} user bot token(s) for polling`
  );

  app.locals.uploadCrmBroadcastPhoto =
  async ({
    buffer,
    contentType,
  }) => {
    if (!bot) {
      throw new Error(
        "BOT_DISABLED"
      );
    }

const adminChatId = String(
  process.env.CRM_MEDIA_UPLOAD_CHAT_ID ||
    process.env.ADMIN_CHAT_ID ||
    process.env.ADMIN_TELEGRAM_ID ||
    ""
).trim();

    if (!adminChatId) {
      throw new Error(
        "CRM_MEDIA_UPLOAD_CHAT_NOT_CONFIGURED"
      );
    }

    const extension =
      contentType ===
      "image/png"
        ? "png"
        : contentType ===
            "image/webp"
          ? "webp"
          : "jpg";

    const sent =
      await bot.telegram.sendPhoto(
        adminChatId,
        {
          source: buffer,
          filename:
            `crm-push-${Date.now()}.${extension}`,
        }
      );

    const photos =
      Array.isArray(
        sent?.photo
      )
        ? sent.photo
        : [];

    const fileId =
      String(
        photos[
          photos.length - 1
        ]?.file_id || ""
      ).trim();

    if (!fileId) {
      throw new Error(
        "TELEGRAM_FILE_ID_MISSING"
      );
    }

    const fileLink =
  await bot.telegram
    .getFileLink(
      fileId
    );

const photoPreviewUrl =
  String(
    fileLink || ""
  ).trim();

    try {
      await bot.telegram
        .deleteMessage(
          adminChatId,
          sent.message_id
        );
    } catch {}

return {
  fileId,
  photoPreviewUrl,
};
  };

app.locals.runCrmBroadcastCampaign =
  async ({
    campaignId,
    telegramIds = [],
    message = {},
  }) => {
    const safeCampaignId =
      String(
        campaignId || ""
      ).trim();

    const safeTelegramIds =
      Array.from(
        new Set(
          (
            Array.isArray(
              telegramIds
            )
              ? telegramIds
              : []
          )
            .map((value) =>
              String(
                value || ""
              ).trim()
            )
            .filter(Boolean)
        )
      );

    if (!safeCampaignId) {
      throw new Error(
        "CAMPAIGN_ID_REQUIRED"
      );
    }

    if (!bot) {
      throw new Error(
        "BOT_DISABLED"
      );
    }

    const campaign =
      await BroadcastCampaign
        .findById(
          safeCampaignId
        )
        .lean();

    if (!campaign) {
      throw new Error(
        "CAMPAIGN_NOT_FOUND"
      );
    }

    /*
     * Telegram ID, которые уже
     * были обработаны до возможного
     * рестарта Railway.
     */
    const processedTelegramIds =
      new Set(
        (
          Array.isArray(
            campaign
              ?.processedTelegramIds
          )
            ? campaign
                .processedTelegramIds
            : []
        )
          .map((value) =>
            String(
              value || ""
            ).trim()
          )
          .filter(Boolean)
      );

      const sentTelegramIds = new Set(
  (
    Array.isArray(
      campaign?.sentTelegramIds
    )
      ? campaign.sentTelegramIds
      : []
  )
    .map((value) =>
      String(value || "").trim()
    )
    .filter(Boolean)
);

    /*
     * После рестарта отправляем
     * только тем, кого ещё
     * не обрабатывали.
     */
    const pendingTelegramIds =
      safeTelegramIds.filter(
        (telegramId) =>
          !processedTelegramIds.has(
            telegramId
          )
      );

    const title =
      String(
        message?.title || ""
      ).trim();

    const text =
      String(
        message?.text || ""
      ).trim();

    const promo =
      String(
        message?.promo || ""
      ).trim();

    const photoUrl =
      String(
        message?.photoUrl || ""
      ).trim();

      const photoFileId =
  String(
    message?.photoFileId || ""
  ).trim();

    const buttonText =
      String(
        message?.buttonText || ""
      ).trim();

    const buttonUrl =
      String(
        message?.buttonUrl || ""
      ).trim();

    const messageText =
      [
        title
          ? `<b>${escapeHtml(
              title
            )}</b>`
          : "",

        text
          ? escapeHtml(text)
          : "",

        promo
          ? `🎁 Промокод: <code>${escapeHtml(
              promo
            )}</code>`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");

    if (!messageText) {
      throw new Error(
        "MESSAGE_REQUIRED"
      );
    }

    const replyMarkup =
      buttonText &&
      buttonUrl
        ? {
            inline_keyboard: [
              [
                {
                  text:
                    buttonText,

                  url:
                    buttonUrl,
                },
              ],
            ],
          }
        : undefined;

    /*
     * Продолжаем старые counters,
     * а не начинаем с нуля.
     */
    let processed =
      Number(
        campaign?.processed || 0
      );

    let sent =
      Number(
        campaign?.sent || 0
      );

    let failed =
      Number(
        campaign?.failed || 0
      );

    let blocked =
      Number(
        campaign?.blocked || 0
      );

    let lastErrors =
      Array.isArray(
        campaign?.lastErrors
      )
        ? campaign.lastErrors.slice(
            -20
          )
        : [];

    /*
     * Если всех уже обработали,
     * просто закрываем кампанию.
     */
    if (
      pendingTelegramIds.length ===
      0
    ) {
      await BroadcastCampaign
        .updateOne(
          {
            _id:
              safeCampaignId,
          },

          {
            $set: {
              status:
                "completed",

              processed,
              sent,
              failed,
              blocked,

              processedTelegramIds:
                Array.from(
                  processedTelegramIds
                ),

              finishedAt:
                campaign
                  ?.finishedAt ||
                new Date(),
            },
          }
        );

      return;
    }

    const runningUpdate = {
      status:
        "running",

      finishedAt:
        null,
    };

    /*
     * При resume сохраняем
     * первоначальный startedAt.
     */
    if (!campaign?.startedAt) {
      runningUpdate.startedAt =
        new Date();
    }

    await BroadcastCampaign
      .updateOne(
        {
          _id:
            safeCampaignId,
        },

        {
          $set:
            runningUpdate,
        }
      );

    setImmediate(
      async () => {
        try {
          for (
            const telegramId of
            pendingTelegramIds
          ) {
            try {
if (photoFileId) {
  await bot.telegram
    .sendPhoto(
      telegramId,

      photoFileId,

      {
        caption:
          messageText,

        parse_mode:
          "HTML",

        ...(replyMarkup
          ? {
              reply_markup:
                replyMarkup,
            }
          : {}),
      }
    );
} else if (photoUrl) {
  await bot.telegram
    .sendPhoto(
      telegramId,

      {
        url: photoUrl,
      },

      {
        caption:
          messageText,

        parse_mode:
          "HTML",

        ...(replyMarkup
          ? {
              reply_markup:
                replyMarkup,
            }
          : {}),
      }
    );
} else {
  await bot.telegram
    .sendMessage(
      telegramId,

      messageText,

      {
        parse_mode:
          "HTML",

        disable_web_page_preview:
          true,

        ...(replyMarkup
          ? {
              reply_markup:
                replyMarkup,
            }
          : {}),
      }
    );
}

              sentTelegramIds.add(

                telegramId

              );

              sent += 1;
            } catch (error) {
              failed += 1;

              const description =
                String(
                  error?.response
                    ?.description ||
                    error?.message ||
                    error ||
                    "SEND_FAILED"
                );

              const lower =
                description
                  .toLowerCase();

              const isBlocked =
                lower.includes(
                  "bot was blocked"
                ) ||
                lower.includes(
                  "user is deactivated"
                ) ||
                lower.includes(
                  "chat not found"
                ) ||
                lower.includes(
                  "forbidden"
                );

              if (isBlocked) {
                blocked += 1;
              }

              lastErrors.push(
                `${telegramId}: ${description}`
              );

              lastErrors =
                lastErrors.slice(
                  -20
                );
            }

            /*
             * ВАЖНО:
             * добавляем ID после
             * попытки отправки.
             *
             * Даже failed не нужно
             * бесконечно повторять
             * после каждого рестарта.
             */
            processedTelegramIds.add(
              telegramId
            );

            processed += 1;

            /*
             * Сохраняем checkpoint
             * каждые 20 пользователей.
             */
            if (
              processedTelegramIds
                .size %
                  20 ===
                0 ||
              telegramId ===
                pendingTelegramIds[
                  pendingTelegramIds.length -
                    1
                ]
            ) {
              await BroadcastCampaign
                .updateOne(
                  {
                    _id:
                      safeCampaignId,
                  },

                  {
                    $set: {
                      processed,
                      sent,
                      failed,
                      blocked,

                      processedTelegramIds:
                        Array.from(
                          processedTelegramIds
                        ),

                      sentTelegramIds:
                        Array.from(
                          sentTelegramIds
                        ),

                      lastErrors,
                    },
                  }
                );
            }

            await new Promise(
              (resolve) =>
                setTimeout(
                  resolve,
                  60
                )
            );
          }

          await BroadcastCampaign
            .updateOne(
              {
                _id:
                  safeCampaignId,
              },

              {
                $set: {
                  status:
                    "completed",

                  processed,
                  sent,
                  failed,
                  blocked,

                  processedTelegramIds:
                    Array.from(
                      processedTelegramIds
                    ),

                  lastErrors,

                  finishedAt:
                    new Date(),
                },
              }
            );
        } catch (error) {
          const description =
            String(
              error?.message ||
                error ||
                "BROADCAST_FAILED"
            );

          lastErrors.push(
            description
          );

          lastErrors =
            lastErrors.slice(
              -20
            );

          await BroadcastCampaign
            .updateOne(
              {
                _id:
                  safeCampaignId,
              },

              {
                $set: {
                  /*
                   * Оставляем running.
                   *
                   * Тогда после
                   * рестарта/startup
                   * система попробует
                   * продолжить кампанию.
                   */
                  status:
                    "running",

                  processed,
                  sent,
                  failed,
                  blocked,

                  processedTelegramIds:
                    Array.from(
                      processedTelegramIds
                    ),

                  lastErrors,
                },
              }
            );
        }
      }
    );
  };

  async function resumeCrmBroadcastCampaigns() {
  const campaigns =
    await BroadcastCampaign
      .find({
        status: {
          $in: [
            "queued",
            "running",
          ],
        },
      })
      .sort({
        createdAt: 1,
      })
      .lean();

  if (!campaigns.length) {
    return;
  }

  console.log(
    `CRM broadcast recovery: ${campaigns.length} campaign(s)`
  );

  for (const campaign of campaigns) {
    const campaignId =
      String(
        campaign?._id || ""
      );

    const telegramIds =
      Array.isArray(
        campaign
          ?.recipientTelegramIds
      )
        ? campaign
            .recipientTelegramIds
        : [];

    if (!telegramIds.length) {
      await BroadcastCampaign
        .updateOne(
          {
            _id:
              campaign._id,
          },

          {
            $set: {
              status:
                "failed",

              finishedAt:
                new Date(),

              lastErrors: [
                ...(
                  Array.isArray(
                    campaign
                      ?.lastErrors
                  )
                    ? campaign
                        .lastErrors
                    : []
                ),

                "EMPTY_RECIPIENTS",
              ].slice(-20),
            },
          }
        );

      continue;
    }

    try {
      await app.locals
        .runCrmBroadcastCampaign({
          campaignId,

          telegramIds,

          message:
            campaign?.message ||
            {},
        });

      console.log(
        `CRM broadcast resumed: ${campaignId}`
      );
    } catch (error) {
      const description =
        String(
          error?.message ||
            error ||
            "RESUME_FAILED"
        );

      console.error(
        "CRM broadcast resume error:",
        campaignId,
        error
      );

      await BroadcastCampaign
        .updateOne(
          {
            _id:
              campaign._id,
          },

          {
            $set: {
              status:
                "failed",

              finishedAt:
                new Date(),

              lastErrors: [
                ...(
                  Array.isArray(
                    campaign
                      ?.lastErrors
                  )
                    ? campaign
                        .lastErrors
                    : []
                ),

                description,
              ].slice(-20),
            },
          }
        );
    }
  }
}

  app.locals.resumeCrmBroadcastCampaigns =
    resumeCrmBroadcastCampaigns;

  const registerUserBotHandlers = (activeBot) => {
  activeBot.use(handleManagerClientMessageText);

  console.log(

    "[MANAGER CLIENT MESSAGE] middleware registered"

  );

  activeBot.start(async (ctx) => {
    try {
      const payload = String(ctx.startPayload || "").trim();
      const tgId = String(ctx.from?.id || "").trim();
      const username = String(ctx.from?.username || "").trim() || null;
      const firstName = String(ctx.from?.first_name || "").trim() || null;
      const lastName = String(ctx.from?.last_name || "").trim() || null;

      if (!tgId) {
        throw new Error("TG_ID_MISSING");
      }

      let me = await User.findOne({ telegramId: tgId });

      if (!me) {
        me = await User.create({
          telegramId: tgId,
          username,
          firstName,
          lastName,
          cashbackBalance: 0,
          cashbackLedger: [],
          referral: {
            code: "",
            usedCode: "",
            rewardGroups: [],
          },
        });
      } else {
        let changed = false;

        if (me.username !== username) {
          me.username = username;
          changed = true;
        }

        if (me.firstName !== firstName) {
          me.firstName = firstName;
          changed = true;
        }

        if (me.lastName !== lastName) {
          me.lastName = lastName;
          changed = true;
        }

        if (!me.referral || typeof me.referral !== "object") {
          me.referral = {
            code: "",
            usedCode: "",
            rewardGroups: [],
          };
          changed = true;
        }

        if (!Array.isArray(me.referral.rewardGroups)) {
          me.referral.rewardGroups = [];
          changed = true;
        }

        if (changed) {
          await me.save();
        }
      }

      let myRefCode = String(me?.referral?.code || "").trim();

      if (!myRefCode) {
        if (typeof ensureUserRefCode === "function") {
          myRefCode = await ensureUserRefCode(me);
        } else {
          myRefCode = genRefCode();
          me.referral = me.referral || {};
          me.referral.code = myRefCode;
          if (!Array.isArray(me.referral.rewardGroups)) {
            me.referral.rewardGroups = [];
          }
          await me.save();
        }
      }

      let openLink = String(WEBAPP_URL || "").trim();
      if (!openLink) {
        throw new Error("WEBAPP_URL_MISSING");
      }

      try {
        const u = new URL(openLink);
        if (payload) u.searchParams.set("startapp", payload);
        if (myRefCode) u.searchParams.set("ref", myRefCode);
        openLink = u.toString();
      } catch {
        const params = new URLSearchParams();
        if (payload) params.set("startapp", payload);
        if (myRefCode) params.set("ref", myRefCode);
        openLink = `${String(WEBAPP_URL || "").trim()}${params.toString() ? "?" + params.toString() : ""}`;
      }

      const caption = "Добро пожаловать в ELF DUCK SHOP!";
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.webApp("💨 Посетить магазин 🛍️", openLink)],
      ]);

      if (START_BANNER_URL) {
        try {
          await ctx.replyWithPhoto(START_BANNER_URL, { caption, ...keyboard });
          return;
        } catch (photoErr) {
          console.error("[BOT_START] replyWithPhoto failed:", photoErr);
        }
      }

      await ctx.reply(caption, keyboard);
    } catch (e) {
      console.error("bot.start error:", e);
      try {
        await ctx.reply("Произошла ошибка при открытии магазина. Попробуйте ещё раз.");
      } catch {}
    }
  });

  async function notifyPickupClientAfterManagerPaymentStatus(
    order,
    managerTelegramId
  ) {
    if (!order || !getActiveUserBots().length) {
      return false;
    }

    if (
      String(order?.deliveryType || "")
        .trim()
        .toLowerCase() !== "pickup"
    ) {
      return false;
    }

    const clientTelegramId = String(
      order?.userTelegramId || ""
    ).trim();

    if (!clientTelegramId) {
      return false;
    }

    const point =
      await resolveOrderNotificationPoint(
        order
      );

    const arrivalTime =
      String(
        order?.arrivalTime || ""
      ).trim() || "указанное время";

    const pointAddress = String(
      point?.address ||
        order?.pickupPointAddress ||
        order?.methodLabel ||
        "указанная точка самовывоза"
    ).trim();

    const paymentMethod = String(
      order?.payment?.method || ""
    )
      .trim()
      .toLowerCase();

    const paymentStatus = String(
      order?.payment?.status || ""
    )
      .trim()
      .toLowerCase();

    let text = "";

    /*
    * Наличные:
    * менеджер нажал «Ожидаю».
    */
    if (
      paymentMethod === "cash" &&
      paymentStatus === "awaiting"
    ) {
      const remainingToPayZl = Number(
        order?.payment
          ?.cashbackRemainingToPayZl ||
          order?.totalZl ||
          0
      );

      text = [
        "✅ <b>ВАШ ЗАКАЗ В ПРОЦЕССЕ СБОРА!</b>",
        "",
        `Ожидаем вас в <b>${escapeHtml(
          arrivalTime
        )}</b>.`,
        `К оплате: <b>${remainingToPayZl.toFixed(
          2
        )} PLN</b>.`,
        `Локация: <b>${escapeHtml(
          pointAddress
        )}</b>.`,
      ].join("\n");
    }

    /*
    * BLIK / крипта / украинская карта:
    * менеджер нажал «Оплачено».
    */
    else if (
      paymentStatus === "paid"
    ) {
      text = [
        "✅ <b>ОПЛАТА ПОДТВЕРЖДЕНА!</b>",
        "",
        "Ваш заказ в процессе сбора.",
        `Ожидаем вас в <b>${escapeHtml(
          arrivalTime
        )}</b>.`,
        `Локация: <b>${escapeHtml(
          pointAddress
        )}</b>.`,
      ].join("\n");
    } else {
      return false;
    }

    /*
    * Получаем ссылку именно для точки,
    * где был оформлен заказ.
    */
    const managerTelegramUrl =
      await getOrderManagerTelegramUrl(
        order
      );

    console.log(
      "[PICKUP MANAGER LINK]",
      {
        orderNo: String(
          order?.orderNo || ""
        ),

        pickupPointId: String(
          order?.pickupPointId || ""
        ),

        pointKey: String(
          point?.key || ""
        ),

        pointTitle: String(
          point?.title || ""
        ),

        managerTelegramId: String(
          managerTelegramId || ""
        ),

        managerTelegramUrl,
      }
    );

    const replyMarkup =
      managerTelegramUrl
        ? {
            inline_keyboard: [
              [
                {
                  text:
                    "💬 Связаться с менеджером",

                  url:
                    managerTelegramUrl,
                },
              ],
            ],
          }
        : undefined;

    await sendClientTelegramMessage(
      clientTelegramId,
      text,
      {
        parse_mode: "HTML",

        disable_web_page_preview:
          true,

        ...(replyMarkup
          ? {
              reply_markup:
                replyMarkup,
            }
          : {}),
      },
      { order }
    );

    return true;
  }

  async function sendCourierClientMessage(
    order,
    type
  ) {
    if (!order || !getActiveUserBots().length) {
      return false;
    }

    const clientTelegramId = String(
      order?.userTelegramId || ""
    ).trim();

    if (!clientTelegramId) {
      return false;
    }

      const notifyPoint =
        await resolveOrderNotificationPoint(order).catch(() => null);

      const pointManagerTelegramId = String(
        Array.isArray(
          notifyPoint?.allowedAdminTelegramIds
        )
          ? notifyPoint.allowedAdminTelegramIds[0] || ""
          : ""
      ).trim();

      const pointManagerUser =
        pointManagerTelegramId
          ? await User.findOne(
              {
                telegramId: pointManagerTelegramId,
              },
              {
                username: 1,
                firstName: 1,
                telegramId: 1,
              }
            ).lean()
          : null;

      const managerContactUsernameRaw = String(
        pointManagerUser?.username ||
        pointManagerUser?.firstName ||
        ""
      ).trim();

      const managerContactUsername =
        pointManagerUser?.username
          ? (
              managerContactUsernameRaw.startsWith("@")
                ? managerContactUsernameRaw
                : `@${managerContactUsernameRaw}`
            )
          : managerContactUsernameRaw || "—";

    const deliveryWindow = String(
      order?.deliveryTimeWindow ||
      order?.arrivalTime ||
      "указанный промежуток времени"
    ).trim();

    let text = "";

    if (type === "accepted") {
      text = [
        "✅ <b>Ваш заказ принят!</b>",
        "",
        "Мы в процессе сбора вашего заказа.",
        `Ожидайте курьера в промежутке <b>${escapeHtml(
          deliveryWindow
        )}</b>.`,
      ].join("\n");
    }

    if (type === "soon") {
      text = [
        "🚗 <b>Курьер выехал и будет через 15 минут!</b>",
        "",
        "Ищите серую Honda с номерами WB 084CY.",
        "",
        "Пожалуйста, выйдите навстречу — курьер может ожидать не более 5 минут. В случае опоздания курьер вправе уехать, а повторная доставка оплачивается в двойном размере.",
      ].join("\n");
    }

    if (type === "arrived") {
      text = [
        "📍 <b>Курьер на месте!</b>",
        "",
        "Если не видите курьера — свяжитесь с менеджером.",
      ].join("\n");
    }

    if (!text) {
      return false;
    }

  const replyMarkup =
    pointManagerTelegramId
        ? {
            inline_keyboard: [
              [
                {
                  text:
                    "💬 Связаться с менеджером",
                  url:
                    `tg://user?id=${encodeURIComponent(
                      pointManagerTelegramId
                    )}`,
                },
              ],
            ],
          }
        : undefined;

    const preferredBotIndex = Number(order?.shopBotIndex);

    await sendViaUserShopBot(
      clientTelegramId,
      (clientBot) =>
        clientBot.telegram.sendMessage(clientTelegramId, text, {
          parse_mode: "HTML",
          disable_web_page_preview: true,
          ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        }),
      {
        preferredBotIndex: Number.isFinite(preferredBotIndex)
          ? preferredBotIndex
          : undefined,
      }
    );

    return true;
  }

  activeBot.action(/mgr_courier_soon:(.+)/, async (ctx) => {
      try {
        const orderId = String(
          ctx.match?.[1] || ""
        ).trim();

        const order =
          await Order.findById(
            orderId
          );

        if (!order) {
          await ctx.answerCbQuery(
            "Заказ не найден"
          );

          return;
        }

        const isCourierOrder =
          String(
            order?.deliveryType || ""
          )
            .trim()
            .toLowerCase() ===
            "delivery" &&
          String(
            order?.deliveryMethod || ""
          )
            .trim()
            .toLowerCase() ===
            "courier";

        if (!isCourierOrder) {
          await ctx.answerCbQuery(
            "Доступно только для курьерской доставки",
            {
              show_alert: true,
            }
          );

          return;
        }

        order.courierUsername =
          String(
            ctx.from?.username || ""
          ).trim();

        order.courierTelegramId =
          String(
            ctx.from?.id || ""
          ).trim();

        order.handledByTelegramId =
          String(
            ctx.from?.id || ""
          ).trim();

        await order.save();

        await sendCourierClientMessage(
          order,
          "soon"
        );

        await ctx.answerCbQuery(
          "Клиент уведомлён"
        );
      } catch (error) {
        console.error(
          "mgr_courier_soon error:",
          error
        );

        try {
          await ctx.answerCbQuery(
            "Не удалось уведомить клиента",
            {
              show_alert: true,
            }
          );
        } catch {}
      }
    }
  );

  activeBot.action(/mgr_courier_arrived:(.+)/, async (ctx) => {
      try {
        const orderId = String(
          ctx.match?.[1] || ""
        ).trim();

        const order =
          await Order.findById(
            orderId
          );

        if (!order) {
          await ctx.answerCbQuery(
            "Заказ не найден"
          );

          return;
        }

        const isCourierOrder =
          String(
            order?.deliveryType || ""
          )
            .trim()
            .toLowerCase() ===
            "delivery" &&
          String(
            order?.deliveryMethod || ""
          )
            .trim()
            .toLowerCase() ===
            "courier";

        if (!isCourierOrder) {
          await ctx.answerCbQuery(
            "Доступно только для курьерской доставки",
            {
              show_alert: true,
            }
          );

          return;
        }

        order.courierUsername =
          String(
            ctx.from?.username || ""
          ).trim();

        order.courierTelegramId =
          String(
            ctx.from?.id || ""
          ).trim();

        order.handledByTelegramId =
          String(
            ctx.from?.id || ""
          ).trim();

        await order.save();

        await sendCourierClientMessage(
          order,
          "arrived"
        );

        await ctx.answerCbQuery(
          "Клиент уведомлён"
        );
      } catch (error) {
        console.error(
          "mgr_courier_arrived error:",
          error
        );

        try {
          await ctx.answerCbQuery(
            "Не удалось уведомить клиента",
            {
              show_alert: true,
            }
          );
        } catch {}
      }
    }
  );

  activeBot.action(/mgr_pay_paid:(.+)/, async (ctx) => {
    try {
      const order = await findOrderForManagerCallback(
        ctx.match?.[1],
        ctx
      );
      if (!order) return;

      const previousPaymentStatus =
      String(
        order?.payment?.status || ""
      )
        .trim()
        .toLowerCase();

      // списываем склад только один раз
      if (String(order?.payment?.method || "").trim().toLowerCase() !== "cash") {
        await commitOrderStock(order);
        order.stockCommittedAt = new Date();
      }

      const isCourierOrder =
        String(order?.deliveryType || "")
          .trim()
          .toLowerCase() ===
          "delivery" &&
        String(order?.deliveryMethod || "")
          .trim()
          .toLowerCase() ===
          "courier";

      const isInpostOrder =

        String(order?.deliveryType || "")

          .trim()

          .toLowerCase() === "delivery" &&

        String(order?.deliveryMethod || "")

          .trim()

          .toLowerCase() === "inpost";

      const isCashPayment =
        String(order?.payment?.method || "")
          .trim()
          .toLowerCase() ===
          "cash";

      const shouldMarkAwaiting =
        (
          String(
            order?.deliveryType || ""
          )
            .trim()
            .toLowerCase() ===
            "pickup" ||
          isCourierOrder
        ) &&
        isCashPayment;

      order.payment = {
        ...(order.payment?.toObject ? order.payment.toObject() : order.payment || {}),
        status: shouldMarkAwaiting
          ? "awaiting"
          : "paid",

        paidAt: shouldMarkAwaiting
          ? null
          : new Date(),
        checkedAt: new Date(),
        checkedByTelegramId: String(ctx.from?.id || ""),
      };

      if (isCourierOrder) {
        order.courierUsername = String(ctx.from?.username || "").trim();
        order.courierTelegramId = String(ctx.from?.id || "").trim();
      }

      // После подтверждения оплаты заказ остается "assembled"
      // и только потом отдельно отмечается как shipped/completed.
      order.status = "assembled";
      // --- PATCH 1: replace block ---
      await order.save();

      // await applyOrderCashback(order);

      const freshPaidOrder = await Order.findById(order._id);
      if (!freshPaidOrder) {
        throw new Error("ORDER_NOT_FOUND_AFTER_PAY");
      }

      await refreshManagerOrderMessage(freshPaidOrder);
      stopPaymentReminder(order._id);

      const nextPaymentStatus =
        String(
          freshPaidOrder?.payment?.status ||
            ""
        )
          .trim()
          .toLowerCase();

      /*
      * Не отправляем одинаковое сообщение
      * повторно при повторном нажатии кнопки.
      */

      if (
        previousPaymentStatus !==
        nextPaymentStatus
      ) {
        try {
          if (isCourierOrder) {
            await sendCourierClientMessage(
              freshPaidOrder,
              "accepted"
            );
          } else if (isInpostOrder) {
            const inpostPaidText = [
              "✅ <b>МЕНЕДЖЕР ПОДТВЕРДИЛ ВАШУ ТРАНЗАКЦИЮ!</b>",
              "",
              `Заказ <b>#${escapeHtml(
                freshPaidOrder?.orderNo || "—"
              )}</b> оплачен.`,
              "",
              "Мы в процессе сбора вашего заказа и отправим его до конца рабочего дня.",
              "",
              "Ожидайте дальнейших сообщений.",
            ].join("\n");

            const inpostPaidExtra = {
              parse_mode: "HTML",
              disable_web_page_preview: true,
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "💬 Связаться с менеджером",
                      url: "https://t.me/elfduck_inpost",
                    },
                  ],
                ],
              },
            };

            const preferredBotIndex = Number(
              freshPaidOrder?.shopBotIndex
            );

            await sendViaUserShopBot(
              freshPaidOrder?.userTelegramId,
              (clientBot) =>
                clientBot.telegram.sendMessage(
                  String(freshPaidOrder?.userTelegramId || ""),
                  inpostPaidText,
                  inpostPaidExtra
                ),
              {
                preferredBotIndex: Number.isFinite(preferredBotIndex)
                  ? preferredBotIndex
                  : undefined,
              }
            );
          } else {
            await notifyPickupClientAfterManagerPaymentStatus(
              freshPaidOrder,
              String(ctx.from?.id || "")
            );
          }
        } catch (notifyError) {
          console.error(
            "mgr_pay_paid client notification error:",
            notifyError
          );
        }
      }

      // --- END PATCH 1 ---

      // Для доставки отправляем отдельное сообщение-напоминание менеджеру
      if (

        String(
          order?.deliveryType || ""
        ) === "delivery" &&

        String(
          order?.deliveryMethod || ""
        ) === "inpost"

      ) {
        try {
          const managerChatId = String(order?.payment?.managerMessageChatId || "").trim();
          const managerMessageId = Number(order?.payment?.managerMessageId || 0);
          const orderNo = escapeHtml(order?.orderNo || "—");
          const isInpost = String(order?.deliveryMethod || "").trim() === "inpost";

          const deliveryTitle = isInpost
            ? `📦 <b>ЗАКАЗ ГОТОВ К ОТПРАВКЕ</b>`
            : `🚚 <b>ЗАКАЗ ГОТОВ К ДОСТАВКЕ</b>`;

          // const courierUsernameRaw = String(order?.courierUsername || order?.courier?.username || "").trim();
          // const courierUsername = courierUsernameRaw
          //   ? (courierUsernameRaw.startsWith("@") ? courierUsernameRaw : `@${courierUsernameRaw}`)
          //   : "—";

          const deliveryText = isInpost
            ? `Когда вы отправите с помощью пачкомата этот заказ (<b>#${orderNo}</b>) нажмите кнопку <b>ЗАКАЗ ОТПРАВЛЕН</b>, чтобы клиент был уведомлен.`
            : `Когда вы прибудете на адрес по заказу <b>#${orderNo}</b>, нажмите кнопку <b>ЗАКАЗ ДОСТАВЛЕН</b>, чтобы клиент был уведомлен.`;

          const deliveryButton = isInpost
            ? { text: "📦 ЗАКАЗ ОТПРАВЛЕН", callback_data: `mgr_order_shipped:${order._id}` }
            : { text: "🚚 ЗАКАЗ ДОСТАВЛЕН", callback_data: `mgr_order_delivered:${order._id}` };

          const deliveryDetails = [];
          if (!isInpost && order?.courierAddress) deliveryDetails.push(`📍 <b>Адрес:</b> ${escapeHtml(order.courierAddress)}`);
          if (!isInpost && order?.deliveryTimeWindow) deliveryDetails.push(`🕒 <b>Время:</b> ${escapeHtml(order.deliveryTimeWindow)}`);
          if (isInpost && order?.inpostData?.lockerAddress) deliveryDetails.push(`📦 <b>Пачкомат:</b> ${escapeHtml(order.inpostData.lockerAddress)}`);
          if (isInpost && order?.inpostData?.fullName) deliveryDetails.push(`👤 <b>Получатель:</b> ${escapeHtml(order.inpostData.fullName)}`);
          if (order.comment) deliveryDetails.push(`💬 <b>Комментарий:</b> ${escapeHtml(order.comment)}`);

          if (managerChatId && managerMessageId) {
            const sent = await bot.telegram.sendMessage(
              managerChatId,
              [
                deliveryTitle,
                ``,
                ...(deliveryDetails.length ? [...deliveryDetails, ``] : []),
                deliveryText,
              ].join("\n"),
              {
                parse_mode: "HTML",
                reply_to_message_id: managerMessageId,
                allow_sending_without_reply: true,
                reply_markup: {
                  inline_keyboard: [[deliveryButton]],
                },
              }
            );

            await Order.updateOne(
              { _id: order._id },
              {
                $push: {
                  managerDeliveryMessageIds: String(sent?.message_id || ""),
                },
              }
            );
          }
        } catch (e) {
          console.error("mgr_pay_paid delivery notify error:", e);
        }
      }

      await ctx.answerCbQuery(
        shouldMarkAwaiting ? "Клиент ожидается на точке" : "Оплата подтверждена"
      );
    } catch (e) {
      console.error("mgr_pay_paid error:", e);
      try {
        await ctx.answerCbQuery("Ошибка");
      } catch {}
    }
  });

  activeBot.action(/mgr_pay_unpaid:(.+)/, async (ctx) => {
    try {
      const order = await findOrderForManagerCallback(
        ctx.match?.[1],
        ctx
      );
      if (!order) return;

      // снимаем резерв только один раз
      if (!order.stockReleasedAt) {
        await releaseOrderReservedStock(order);
        order.stockReleasedAt = new Date();
      }

      // возвращаем кэшбек, если он был применён
      await refundOrderCashback(order);

      const freshOrderAfterRefund = await Order.findById(order._id);
      if (!freshOrderAfterRefund) {
        throw new Error("ORDER_NOT_FOUND_AFTER_REFUND");
      }

      order.payment = {
        ...(freshOrderAfterRefund.payment?.toObject
          ? freshOrderAfterRefund.payment.toObject()
          : freshOrderAfterRefund.payment || {}),
        status: "unpaid",
        paidAt: null,
        checkedAt: new Date(),
        checkedByTelegramId: String(ctx.from?.id || ""),
      };

      order.status = "canceled";

      order.canceledAt =
        new Date();

      order.canceledByTelegramId =
        String(
          ctx.from?.id || ""
        );

      order.managerEditedAt =
        new Date();

      order.managerEditedByTelegramId =
        String(
          ctx.from?.id || ""
        );

      // --- PATCH 3: replace block for unpaid status ---
      await order.save();

      const freshUnpaidOrder = await Order.findById(order._id);
      if (!freshUnpaidOrder) {
        throw new Error("ORDER_NOT_FOUND_AFTER_UNPAID");
      }

      await refreshManagerOrderMessage(freshUnpaidOrder);

      stopPaymentReminder(order._id);

      await ctx.answerCbQuery("Оплата отклонена, кэшбек возвращён");
    } catch (e) {
      console.error("mgr_pay_unpaid error:", e);
      try {
        await ctx.answerCbQuery("Ошибка");
      } catch {}
    }
  });

  activeBot.action(/mgr_order_shipped:(.+)/, async (ctx) => {
    try {
      const orderId = String(
        ctx.match?.[1] || ""
      ).trim();

      const order = await Order.findById(
        orderId
      );

      if (!order) {
        await ctx.answerCbQuery(
          "Заказ не найден"
        );
        return;
      }

      const deliveryType = String(
        order?.deliveryType || ""
      )
        .trim()
        .toLowerCase();

      const deliveryMethod = String(
        order?.deliveryMethod || ""
      )
        .trim()
        .toLowerCase();

      if (
        deliveryType !== "delivery" ||
        deliveryMethod !== "inpost"
      ) {
        await ctx.answerCbQuery(
          "Этот заказ не относится к InPost"
        );
        return;
      }

      const trackingNumber =
        normalizeInpostTrackingNumber(
          order?.inpostTrackingNumber || ""
        );

      if (trackingNumber) {
        await completeInpostShipment(
          order,
          String(ctx.from?.id || "")
        );

        const callbackChatId = String(
          ctx?.callbackQuery?.message?.chat?.id ||
          ctx?.chat?.id ||
          ""
        ).trim();

        const callbackMessageId = Number(
          ctx?.callbackQuery?.message?.message_id ||
          0
        );

        if (
          callbackChatId &&
          callbackMessageId
        ) {
          try {
            await bot.telegram.editMessageText(
              callbackChatId,
              callbackMessageId,
              undefined,
              [
                "✅ <b>ЗАКАЗ ОТПРАВЛЕН</b>",
                "",
                `📦 Трекинг-номер: <code>${escapeHtml(
                  order?.inpostTrackingNumber ||
                  "—"
                )}</code>`,
                "",
                "Заказ отмечен как отправленный.",
              ].join("\n"),
              {
                parse_mode: "HTML",
                disable_web_page_preview: true,

                reply_markup: {
                  inline_keyboard: [],
                },
              }
            );
          } catch (editError) {
            const description = String(
              editError?.response?.description ||
              editError?.message ||
              ""
            ).toLowerCase();

            if (
              !description.includes(
                "message is not modified"
              ) &&
              !description.includes(
                "message to edit not found"
              )
            ) {
              console.error(
                "[INPOST SHIPMENT][READY MESSAGE EDIT FAILED]",
                editError
              );
            }
          }
        }

        await ctx.answerCbQuery(
          "Заказ отмечен как отправленный"
        );

        return;
      }

      const stateKey = String(

        ctx.from?.id ||

        ctx.chat?.id ||

        ""

      );

      await ctx.answerCbQuery();

      const promptMessage = await ctx.reply(

        [

          "📦 <b>Введите трекинг-номер InPost</b>",

          "",

          `Заказ: <b>#${escapeHtml(

            order?.orderNo || "—"

          )}</b>`,

          "",

          "Отправьте трекинг-номер следующим сообщением.",

        ].join("\n"),

        {

          parse_mode: "HTML",

          reply_markup: {

            inline_keyboard: [

              [

                {

                  text: "❌ Отмена",

                  callback_data:

                    `mgr_inpost_tracking_cancel:${order._id}`,

                },

              ],

            ],

          },

        }

      );

      inpostTrackingInputState.set(

        stateKey,

        {

          orderId: String(order._id),

          chatId: String(

            ctx.chat?.id || ""

          ),

          requestedAt: Date.now(),

          promptMessageId: Number(

            promptMessage?.message_id || 0

          ),

          readyMessageId: Number(

            ctx.callbackQuery

              ?.message

              ?.message_id || 0

          ),

        }

      );
    } catch (error) {
      console.error(
        "mgr_order_shipped error:",
        error
      );

      try {
        await ctx.answerCbQuery(
          "Не удалось начать отправку заказа",
          {
            show_alert: true,
          }
        );
      } catch {}
    }
  });

  activeBot.action(/mgr_inpost_tracking_cancel:(.+)/, async (ctx) => {
      try {
        const orderId = String(
          ctx.match?.[1] || ""
        ).trim();

        const stateKey = String(
          ctx.from?.id ||
          ctx.chat?.id ||
          ""
        );

        const currentState =
          inpostTrackingInputState.get(
            stateKey
          );

        if (
          currentState &&
          String(
            currentState?.orderId || ""
          ) === orderId
        ) {
          inpostTrackingInputState.delete(
            stateKey
          );
        }

        await ctx.answerCbQuery(
          "Ввод трекинга отменён"
        );

        try {
          await ctx.editMessageText(
            "❌ Ввод трекинг-номера отменён."
          );
        } catch {}
      } catch (error) {
        console.error(
          "mgr_inpost_tracking_cancel error:",
          error
        );

        try {
          await ctx.answerCbQuery(
            "Не удалось отменить ввод",
            {
              show_alert: true,
            }
          );
        } catch {}
      }
    }
  );

  activeBot.action(/mgr_inpost_tracking_confirm:(.+)/, async (ctx) => {
      try {
        const orderId = String(
          ctx.match?.[1] || ""
        ).trim();

        const stateKey = String(
          ctx.from?.id ||
          ctx.chat?.id ||
          ""
        );

        const currentState =
          inpostTrackingInputState.get(
            stateKey
          );

        if (
          !currentState ||
          String(
            currentState?.orderId || ""
          ) !== orderId
        ) {
          await ctx.answerCbQuery(
            "Данные ввода устарели",
            {
              show_alert: true,
            }
          );

          return;
        }

        const trackingNumber =
          normalizeInpostTrackingNumber(
            currentState?.trackingNumber ||
              ""
          );

        if (!trackingNumber) {
          await ctx.answerCbQuery(
            "Трекинг-номер не найден",
            {
              show_alert: true,
            }
          );

          return;
        }

        const order =
          await Order.findById(orderId);

        if (!order) {
          inpostTrackingInputState.delete(
            stateKey
          );

          await ctx.answerCbQuery(
            "Заказ не найден",
            {
              show_alert: true,
            }
          );

          return;
        }

        order.inpostTrackingNumber =
          trackingNumber;

        order.inpostTrackingAddedAt =
          new Date();

        order.inpostTrackingAddedByTelegramId =
          String(ctx.from?.id || "");

        order.inpostShippedNotifiedAt =
          null;

        await order.save();

        await completeInpostShipment(
          order,
          String(ctx.from?.id || "")
        );

        const readyMessageId = Number(
  currentState?.readyMessageId || 0
);

const readyMessageChatId = String(
  currentState?.chatId ||
  ctx.chat?.id ||
  ""
).trim();

if (
  readyMessageChatId &&
  readyMessageId
) {
  try {
    await ctx.telegram.editMessageText(
      readyMessageChatId,
      readyMessageId,
      undefined,
      [
        "✅ <b>ЗАКАЗ ОТПРАВЛЕН</b>",
        "",
        `📦 <b>Заказ:</b> #${escapeHtml(
          order?.orderNo || "—"
        )}`,
        `📦 <b>Трекинг-номер:</b> <code>${escapeHtml(
          trackingNumber
        )}</code>`,
        "",
        "Заказ отмечен как отправленный.",
      ].join("\n"),
      {
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [],
        },
      }
    );
  } catch (editError) {
    const description = String(
      editError?.response?.description ||
      editError?.message ||
      ""
    ).toLowerCase();

    if (
      !description.includes(
        "message is not modified"
      ) &&
      !description.includes(
        "message to edit not found"
      )
    ) {
      console.error(
        "[INPOST SHIPMENT][READY MESSAGE EDIT FAILED]",
        editError
      );
    }
  }
}

        const chatId = String(
          ctx.chat?.id ||
          currentState?.chatId ||
          ""
        );

        const messageIdsToDelete = [
          Number(
            currentState?.promptMessageId || 0
          ),

          Number(
            currentState?.inputMessageId || 0
          ),

          // Number(
          //   currentState?.readyMessageId || 0
          // ),

          Number(
            ctx.callbackQuery
              ?.message
              ?.message_id || 0
          ),
        ].filter(Boolean);

        for (
          const messageId of new Set(
            messageIdsToDelete
          )
        ) {
          try {
            if (chatId && messageId) {
              await ctx.telegram.deleteMessage(
                chatId,
                messageId
              );
            }
          } catch {}
        }

        inpostTrackingInputState.delete(
          stateKey
        );

        await ctx.answerCbQuery(
          "Заказ отправлен"
        );

        const resultText = [
          "✅ <b>Заказ отмечен как отправленный</b>",
          "",
          `Трекинг-номер: <code>${escapeHtml(
            trackingNumber
          )}</code>`,
          "",
          "Клиент получил уведомление со ссылкой на отслеживание.",
        ].join("\n");

        const originalOrderMessageId =
          Number(
            order?.payment
              ?.managerMessageId || 0
          );

        await ctx.telegram.sendMessage(
          chatId,
          resultText,
          {
            parse_mode: "HTML",

            disable_web_page_preview:
              true,

            ...(originalOrderMessageId
              ? {
                  reply_parameters: {
                    message_id:
                      originalOrderMessageId,

                    allow_sending_without_reply:
                      true,
                  },
                }
              : {}),
          }
        );
      } catch (error) {
        console.error(
          "mgr_inpost_tracking_confirm error:",
          error
        );

        try {
          await ctx.answerCbQuery(
            "Не удалось отправить заказ",
            {
              show_alert: true,
            }
          );
        } catch {}
      }
    }
  );

  activeBot.on("text", async (ctx, next) => {
//       const managerTelegramId = String(
//         ctx?.from?.id || ""
//       ).trim();

//   const clientMessageState =
//     managerClientMessageState.get(
//       managerTelegramId
//     );

//   if (clientMessageState) {
//     const currentChatId = String(
//       ctx?.chat?.id || ""
//     );

//     const expectedChatId = String(
//       clientMessageState
//         ?.managerChatId || ""
//     );

//     if (
//       expectedChatId &&
//       currentChatId !== expectedChatId
//     ) {
//       return next();
//     }

//     const messageText = String(
//       ctx?.message?.text || ""
//     ).trim();

//     if (!messageText) {
//       return next();
//     }

//     managerClientMessageState.delete(
//       managerTelegramId
//     );

//     console.log(
//       "[MANAGER CLIENT MESSAGE][SEND]",
//       {
//         orderId:
//           clientMessageState.orderId,
//         orderNo:
//           clientMessageState.orderNo,
//         managerTelegramId,
//         clientTelegramId:
//           clientMessageState
//             .clientTelegramId,
//       }
//     );

//     try {
//     await bot.telegram.sendMessage(
//     clientMessageState.clientTelegramId,
//     [
//       "💬 <b>Сообщение от менеджера</b>",
//       "",
//       `Заказ: <b>#${escapeHtml(
//         clientMessageState.orderNo || "—"
//       )}</b>`,
//       "",
//       escapeHtml(messageText),
//     ].join("\n"),
//     {
//     parse_mode: "HTML",
//   }
// );

// const confirmationMessage =
//   await ctx.reply(
//     "✅ Сообщение отправлено клиенту."
//   );

// /*
//  * Небольшая задержка, чтобы менеджер
//  * успел увидеть подтверждение.
//  */
// await new Promise((resolve) =>
//   setTimeout(resolve, 100)
// );

// const managerChatId = String(
//   clientMessageState.managerChatId ||
//     ctx?.chat?.id ||
//     ""
// ).trim();

// const messageIdsToDelete = [
//   /*
//    * Сообщение-инструкция.
//    */
//   Number(
//     clientMessageState
//       .instructionMessageId || 0
//   ),

//   /*
//    * Текст, который написал менеджер.
//    */
//   Number(
//     ctx?.message?.message_id || 0
//   ),

//   /*
//    * Подтверждение успешной отправки.
//    */
//   Number(
//     confirmationMessage?.message_id || 0
//   ),
// ].filter(Boolean);

// if (managerChatId) {
//   const deleteResults =
//     await Promise.allSettled(
//       messageIdsToDelete.map(
//         (messageId) =>
//           bot.telegram.deleteMessage(
//             managerChatId,
//             messageId
//           )
//       )
//     );

//   deleteResults.forEach(
//     (result, index) => {
//       if (result.status === "rejected") {
//         console.warn(
//           "manager client message cleanup failed:",
//           {
//             managerChatId,

//             messageId:
//               messageIdsToDelete[index],

//             error:
//               result.reason?.response
//                 ?.description ||
//               result.reason?.message ||
//               result.reason,
//           }
//         );
//       }
//     }
//   );
// }
//     } catch (error) {
//       console.error(
//         "manager client message send error:",
//         error
//       );

//       await ctx.reply(
//         "❌ Не удалось отправить сообщение клиенту. Возможно, клиент заблокировал бота или не запускал его."
//       );
//     }

//     return;
//   }

      const stateKey = String(
        ctx.from?.id ||
        ctx.chat?.id ||
        ""
      );

      const currentState =
        inpostTrackingInputState.get(
          stateKey
        );

      if (!currentState) {
        return next();
      }

      try {
        const currentChatId = String(
          ctx.chat?.id || ""
        );

        const expectedChatId = String(
          currentState?.chatId || ""
        );

        if (
          expectedChatId &&
          currentChatId !== expectedChatId
        ) {
          return next();
        }

        const requestedAt = Number(
          currentState?.requestedAt || 0
        );

        if (
          requestedAt > 0 &&
          Date.now() - requestedAt >
            15 * 60 * 1000
        ) {
          inpostTrackingInputState.delete(
            stateKey
          );

          await ctx.reply(
            "⌛ Время ввода трекинг-номера истекло. Нажмите «Отправлен» ещё раз."
          );

          return;
        }

        const orderId = String(
          currentState?.orderId || ""
        ).trim();

        const trackingNumber =
          normalizeInpostTrackingNumber(
            ctx.message?.text || ""
          );

        if (!orderId) {
          inpostTrackingInputState.delete(
            stateKey
          );

          return next();
        }

        if (
          !trackingNumber ||
          trackingNumber.length < 8
        ) {
          await ctx.reply(
            [
              "⚠️ <b>Некорректный трекинг-номер</b>",
              "",
              "Проверьте номер и отправьте его ещё раз.",
            ].join("\n"),
            {
              parse_mode: "HTML",
            }
          );

          return;
        }

        const order =
          await Order.findById(orderId);

        if (!order) {
          inpostTrackingInputState.delete(
            stateKey
          );

          await ctx.reply(
            "Заказ не найден."
          );

          return;
        }

        inpostTrackingInputState.set(
          stateKey,
          {
            ...currentState,

            trackingNumber,

            receivedAt: Date.now(),

            inputMessageId: Number(
              ctx.message?.message_id || 0
            ),
          }
        );

        const trackingUrl =
          getInpostTrackingUrl(
            trackingNumber
          );

        await ctx.reply(
          [
            "📦 <b>Проверьте трекинг-номер</b>",
            "",
            `Заказ: <b>#${escapeHtml(
              order?.orderNo || "—"
            )}</b>`,
            `Трекинг: <code>${escapeHtml(
              trackingNumber
            )}</code>`,
            "",
            "После подтверждения заказ получит статус «Отправлен», а клиенту придёт уведомление.",
          ].join("\n"),
          {
            parse_mode: "HTML",
            disable_web_page_preview:
              true,

            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text:
                      "✅ Подтвердить отправку",

                    callback_data:
                      `mgr_inpost_tracking_confirm:${order._id}`,
                  },
                ],
                [
                  {
                    text:
                      "📦 Проверить трекинг",

                    url: trackingUrl,
                  },
                ],
                [
                  {
                    text: "❌ Отмена",

                    callback_data:
                      `mgr_inpost_tracking_cancel:${order._id}`,
                  },
                ],
              ],
            },
          }
        );
      } catch (error) {
        console.error(
          "inpost tracking text input error:",
          error
        );

        await ctx.reply(
          "Не удалось обработать трекинг-номер. Попробуйте ещё раз."
        );
      }
    }
  );

  activeBot.action(/mgr_order_delivered:(.+)/, async (ctx) => {
    try {
      const order = await findOrderForManagerCallback(
        ctx.match?.[1],
        ctx
      );
      if (!order) return;

      if (String(order.status || "") === "completed") {
        await ctx.answerCbQuery("Заказ уже доставлен");
        return;
      }

      if (!order.stockCommittedAt) {
        await commitOrderStock(order);
        order.stockCommittedAt = new Date();
      }

      order.status = "completed";
      order.completedAt = new Date();
      await order.save();
    
      await applyOrderCashback(order);

      const deliveryMessageIds = Array.isArray(order.managerDeliveryMessageIds)
        ? order.managerDeliveryMessageIds.filter(Boolean)
        : [];

      const deliveryChatId = String(order?.payment?.managerMessageChatId || "").trim();

      for (const messageId of deliveryMessageIds) {
        try {
          if (deliveryChatId && messageId) {
            await bot.telegram.deleteMessage(deliveryChatId, Number(messageId));
          }
        } catch (_) {}
      }

      if (deliveryMessageIds.length) {
        order.managerDeliveryMessageIds = [];
        await order.save();
      }

      const freshDeliveredOrder = await Order.findById(order._id);
      if (!freshDeliveredOrder) {
        throw new Error("ORDER_NOT_FOUND_AFTER_DELIVERED");
      }

      await refreshManagerOrderMessage(freshDeliveredOrder);

      try {
        const mainChatId = String(freshDeliveredOrder?.payment?.managerMessageChatId || "").trim();
        const mainMessageId = Number(freshDeliveredOrder?.payment?.managerMessageId || 0);

        if (mainChatId && mainMessageId) {
          await bot.telegram.editMessageReplyMarkup(mainChatId, mainMessageId, undefined, {
            inline_keyboard: [
              [{ text: "🚚 Заказ доставлен", callback_data: `mgr_order_completed_done:${freshDeliveredOrder._id}` }],
            ],
          });
        }
      } catch (e) {
        const msg = String(e?.response?.description || e?.message || "").toLowerCase();

        if (!msg.includes("message is not modified")) {
          console.error("mgr_order_delivered main message markup error:", e);
        }
      }

    try {
      const safeTelegramId = String(order?.userTelegramId || "").trim();

      if (safeTelegramId && getActiveUserBots().length) {

        const orderNo = escapeHtml(order?.orderNo || "—");
        const notifyPoint = await resolveOrderNotificationPoint(freshDeliveredOrder || order).catch(() => null);

        const courierTelegramId = String(
          order?.courierTelegramId || ""
        ).trim();

        const courierUser = courierTelegramId
          ? await User.findOne(
              { telegramId: courierTelegramId },
              {
                telegramId: 1,
                username: 1,
                firstName: 1,
              }
            ).lean()
          : null;

        const managerContactUsernameRaw = String(
          pointManagerUser?.username ||
          notifyPoint?.managerUsername ||
          freshDeliveredOrder?.courierUsername ||
          order?.courierUsername ||
          ""
        ).trim();

        const managerContactUsername =
          managerContactUsernameRaw
            ? (
                managerContactUsernameRaw.startsWith("@")
                  ? managerContactUsernameRaw
                  : `@${managerContactUsernameRaw}`
              )
            : "—";

        const courierUsername = courierUsernameRaw
          ? (courierUsernameRaw.startsWith("@")
              ? courierUsernameRaw
              : `@${courierUsernameRaw}`)
          : "—";

          await sendClientTelegramMessage(
            safeTelegramId,
            [
              `🚚 <b>КУРЬЕР ПРИБЫЛ НА АДРЕС</b>`,
              ``,
              `Курьер прибыл по заказу <b>#${orderNo}</b>.`,
              ``,
              `📲 <b>Связь с менеджером:</b> ${escapeHtml(managerContactUsername)}`,
            ].join("\n"),
            {
              parse_mode: "HTML",
              disable_web_page_preview: true,
            },
            { order: freshDeliveredOrder || order }
          );
        } else {
          console.warn("mgr_order_delivered client notify skipped:", {
            hasBot: getActiveUserBots().length > 0,
            safeTelegramId,
            orderId: String(order?._id || ""),
            orderNo: String(order?.orderNo || ""),
          });
        }
      } catch (e) {
        console.error("mgr_order_delivered client notify error:", {
          orderId: String(order?._id || ""),
          orderNo: String(order?.orderNo || ""),
          userTelegramId: String(order?.userTelegramId || ""),
          error: e?.response?.description || e?.message || String(e),
        });
      }

      await ctx.answerCbQuery("Клиент уведомлен о прибытии курьера");

      try {
        await ctx.deleteMessage();
      } catch (_) {}
    } catch (e) {
      console.error("mgr_order_delivered error:", e);
      try {
        await ctx.answerCbQuery("Не удалось отметить заказ как доставленный");
      } catch {}
    }
  });

  activeBot.action(/^mgr_change_status:(.+)$/, async (ctx) => {
    const orderIdRaw = ctx.match?.[1];

    try {
      const order = await findOrderForManagerCallback(orderIdRaw, ctx);
      if (!order) {
        return;
      }

      const deliveryType = String(order?.deliveryType || "")
        .trim()
        .toLowerCase();
      const deliveryMethod = String(order?.deliveryMethod || "")
        .trim()
        .toLowerCase();

      const canManagerChangeStatus =
        deliveryType === "pickup" ||
        (deliveryType === "delivery" &&
          ["inpost", "courier"].includes(deliveryMethod));

      if (!canManagerChangeStatus) {
        await answerManagerCallbackQuery(ctx, "Изменение статуса недоступно для этого заказа", {
          show_alert: true,
        });
        return;
      }

      const orderKey = String(order._id || orderIdRaw || "").trim();

      await editManagerCallbackKeyboard(ctx, [
        [
          {
            text: "✅ Заказ выполнен",
            callback_data: `mgr_change_status_apply:completed:${orderKey}`,
          },
        ],
        [
          {
            text: "❌ Заказ отменён",
            callback_data: `mgr_change_status_apply:canceled:${orderKey}`,
          },
        ],
        [
          {
            text: "⬅️ Назад",
            callback_data: `mgr_change_status_back:${orderKey}`,
          },
        ],
      ]);

      await answerManagerCallbackQuery(ctx);
    } catch (error) {
      console.error("mgr_change_status error:", {
        error: error?.response?.description || error?.message || error,
        callbackData: ctx?.callbackQuery?.data,
        from: ctx?.from?.id,
        chatId: ctx?.callbackQuery?.message?.chat?.id,
        messageId: ctx?.callbackQuery?.message?.message_id,
      });

      await answerManagerCallbackQuery(ctx, "Не удалось открыть смену статуса", {
        show_alert: true,
      });
    }
  });

  activeBot.action(
    /mgr_change_status_back:(.+)/,
    async (ctx) => {
      try {
        const orderId = String(
          ctx.match?.[1] || ""
        ).trim();

        const order =
          await Order.findById(orderId);

        if (!order) {
          await ctx.answerCbQuery(
            "Заказ не найден"
          );

          return;
        }

        await refreshManagerOrderMessage(
          order
        );

        await ctx.answerCbQuery();
      } catch (error) {
        console.error(
          "mgr_change_status_back error:",
          error
        );

        try {
          await ctx.answerCbQuery(
            "Не удалось вернуться"
          );
        } catch {}
      }
    }
  );

  activeBot.action(
    /mgr_change_status_apply:(completed|canceled):(.+)/,
    async (ctx) => {
      try {
        const nextStatus = String(
          ctx.match?.[1] || ""
        ).trim();

        const orderId = String(
          ctx.match?.[2] || ""
        ).trim();

        const order =
          await Order.findById(orderId);

        if (!order) {
          await ctx.answerCbQuery(
            "Заказ не найден"
          );

          return;
        }

        const changedOrder =
          await changePickupOrderStatusByManager(
            order,
            nextStatus,
            String(ctx.from?.id || "")
          );

        await refreshManagerOrderMessage(
          changedOrder
        );

        await ctx.answerCbQuery(
          nextStatus === "completed"
            ? "Заказ отмечен как выполненный"
            : "Заказ отмечен как отменённый"
        );
      } catch (error) {
      const errorCode = String(

        error?.message || ""

      );

      const message =

        errorCode ===

        "INSUFFICIENT_CASHBACK_BALANCE_FOR_STATUS_CHANGE"

          ? "У клиента недостаточно кэшбека для возврата статуса"

          : errorCode ===

            "INSUFFICIENT_CASHBACK_BALANCE_FOR_ORDER_CANCELLATION"

          ? "Клиент уже потратил начисленный за заказ кэшбек. Отмена заблокирована"

          : "Не удалось изменить статус";

        try {
          await ctx.answerCbQuery(
            message,
            {
              show_alert: true,
            }
          );
        } catch {}
      }
    }
  );

  activeBot.action(/mgr_order_completed:(.+)/, async (ctx) => {
    try {
      const order = await findOrderForManagerCallback(
        ctx.match?.[1],
        ctx
      );
      if (!order) return;

      if (String(order.status || "") === "completed") {
        await ctx.answerCbQuery("Заказ уже выполнен");
        return;
      }

      if (!order.stockCommittedAt) {
        await commitOrderStock(order);
        order.stockCommittedAt = new Date();
      }

      order.status = "completed";
      order.completedAt = new Date();
      await order.save();

      await applyOrderCashback(order);

      const arrivalMessageIds = Array.isArray(order.managerArrivalMessageIds)
        ? order.managerArrivalMessageIds.filter(Boolean)
        : [];

      const arrivalChatId = String(order?.payment?.managerMessageChatId || "").trim();

      for (const messageId of arrivalMessageIds) {
        try {
          if (arrivalChatId && messageId) {
            await bot.telegram.deleteMessage(arrivalChatId, Number(messageId));
          }
        } catch (_) {}
      }

      if (arrivalMessageIds.length) {
        order.managerArrivalMessageIds = [];
        await order.save();
      }

      await refreshManagerOrderMessage(order);
      await ctx.answerCbQuery("Заказ отмечен как выполненный");

      try {
        await ctx.deleteMessage();
      } catch (_) {}
    } catch (e) {
      console.error("mgr_order_completed error:", e);
      await ctx.answerCbQuery("Не удалось завершить заказ");
    }
  });

  activeBot.action(/mgr_done:(.+)/, async (ctx) => {
    try {
      await ctx.answerCbQuery("Статус уже обновлён");
    } catch {}
  });

  activeBot.action(/^manager_message_client:(.+)$/, async (ctx) => {
    try {
      const orderDoc = await findOrderForManagerCallback(
        ctx.match?.[1],
        ctx
      );

      if (!orderDoc) {
        return;
      }

      await ctx.answerCbQuery();

      const order =
        orderDoc?.toObject ? orderDoc.toObject() : orderDoc;

      const clientTelegramId = String(
        order?.userTelegramId || ""
      ).trim();

      if (!clientTelegramId) {
        return ctx.reply(
          "❌ У клиента отсутствует Telegram ID."
        );
      }

      const managerTelegramId = String(
        ctx?.from?.id || ""
      ).trim();

      if (!managerTelegramId) {
        return;
      }

      console.log(
        "[MANAGER CLIENT MESSAGE][OPEN]",
        {
          orderId: String(order?._id || ""),
          orderNo: String(
            order?.orderNo || ""
          ),
          managerTelegramId,
          clientTelegramId,
        }
      );

      const clientContact =
        await resolveManagerOrderClientContact(order);

const instructionMessage =
  await ctx.reply(
    [
      "✉️ <b>СООБЩЕНИЕ КЛИЕНТУ</b>",
      "",
      `Заказ: <b>#${escapeHtml(
        order?.orderNo || "—"
      )}</b>`,
      `Клиент: <b>${escapeHtml(
        clientContact.displayLabel
      )}</b>`,
      "",
      "Ответьте на это сообщение текстом, который нужно передать клиенту.",
    ].join("\n"),
    {
      parse_mode: "HTML",

      reply_markup: {
        force_reply: true,
        selective: true,

        input_field_placeholder:
          "Введите сообщение клиенту",
      },
    }
  );

managerClientMessageState.set(
  managerTelegramId,
  {
    orderId: String(order._id),

    orderNo: String(
      order?.orderNo || ""
    ),

    clientTelegramId,
    managerTelegramId,

    managerChatId: String(
      ctx?.chat?.id || ""
    ),

    instructionMessageId: Number(
      instructionMessage?.message_id || 0
    ),
  }
);

managerClientMessageStateByChat.set(

  String(ctx?.chat?.id || ""),

  {

    orderId: String(order._id),

    orderNo: String(

      order?.orderNo || ""

    ),

    clientTelegramId,

    managerTelegramId,

    managerChatId: String(

      ctx?.chat?.id || ""

    ),

    instructionMessageId: Number(

      instructionMessage

        ?.message_id || 0

    ),

  }

);

return instructionMessage;
    } catch (error) {
      console.error(
        "manager_message_client action error:",
        error
      );

      try {
        await ctx.answerCbQuery(
          "Не удалось открыть отправку сообщения",
          {
            show_alert: true,
          }
        );
      } catch {}
    }
  }
);

  };

  for (const activeBot of userBots) {
    registerUserBotHandlers(activeBot);

    activeBot.catch((err, ctx) => {
      console.error("[bot] unhandled error:", {
        updateType: ctx?.updateType,
        callbackData: ctx?.callbackQuery?.data,
        error: err?.response?.description || err?.message || err,
      });

      if (ctx?.callbackQuery) {
        answerManagerCallbackQuery(
          ctx,
          "Внутренняя ошибка бота. Проверьте docker compose logs api",
          { show_alert: true }
        );
      }
    });
  }

  async function launchUserBotPolling() {
    const dbName =
      mongoose.connection?.db?.databaseName || "unknown";

    await Promise.all(
      userBots.map(async (activeBot, botIndex) => {
        try {
          const webhookInfo = await activeBot.telegram.getWebhookInfo();
          if (String(webhookInfo?.url || "").trim()) {
            console.warn(
              `[bot] Webhook was set (${webhookInfo.url}) — clearing for long polling`
            );
            await activeBot.telegram.deleteWebhook({
              drop_pending_updates: false,
            });
          }

          const me = await activeBot.telegram.getMe();
          setShopBotUsername(botIndex, me.username);
          console.log(
            `[bot] Launching polling as @${me.username} (id ${me.id}), pid=${process.pid}, db=${dbName}`
          );

          // launch() never resolves while polling — do not await in a serial loop
          activeBot
            .launch()
            .then(() => {
              console.log(
                `✅ User bot polling stopped @${me.username}`
              );
            })
            .catch((e) => {
              console.error(
                `❌ bot.launch error @${me.username}:`,
                e
              );
            });

          console.log(
            `✅ User bot launched @${me.username}`
          );
        } catch (e) {
          console.error("❌ bot pre-launch error:", e);
        }
      })
    );
  }

  launchUserBotPolling();

  const stopAllUserBots = (signal) => {
    for (const activeBot of userBots) {
      try {
        activeBot?.stop(signal);
      } catch {}
    }
  };

  process.once("SIGINT", () => stopAllUserBots("SIGINT"));
  process.once("SIGTERM", () => stopAllUserBots("SIGTERM"));

} else {
  console.warn("⚠️ TELEGRAM_BOT_TOKEN(S) not set — bot disabled");
}
}
