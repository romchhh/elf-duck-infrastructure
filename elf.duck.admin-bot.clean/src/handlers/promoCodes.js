import { bot } from "../bot/single.js";
import { api } from "../api.js";
import { getState, setState, clearState } from "../state.js";
import { mainMenu } from "./menu.js";
import {
  defaultPromoCodeData,
  askPromoCodeStep,
} from "./wizardState.js";

bot.action("promo_codes_menu", async (ctx) => {
  await ctx.answerCbQuery();

  setState(ctx.chat.id, {
    mode: "promo_code_create",
    step: 0,
    data: defaultPromoCodeData(),
  });

  return askPromoCodeStep(ctx);
});

bot.action("promo_code_cancel", async (ctx) => {
  await ctx.answerCbQuery();

  clearState(ctx.chat.id);

  return ctx.reply(
    "❌ Создание промокода отменено.",
    mainMenu(ctx)
  );
});

bot.action("promo_code_back", async (ctx) => {
  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);

  if (!st || st.mode !== "promo_code_create") {
    return;
  }

  st.step = Math.max(0, st.step - 1);

  setState(ctx.chat.id, st);

  return askPromoCodeStep(ctx);
});

bot.action(
  "promo_code_confirm",
  async (ctx) => {
    await ctx.answerCbQuery();

    const st = getState(
      ctx.chat.id
    );

    if (
      !st ||
      st.mode !==
        "promo_code_create"
    ) {
      return;
    }

    try {
      const res = await api(
        "/admin/promo-codes",
        {
          method: "POST",

          body: JSON.stringify({
            code:
              st.data.code,

            amountZl:
              st.data.amountZl,

            expiresAt:
              st.data?.expiresAt ||
              null,
          }),
        }
      );

      const expiresAtInput =
        String(
          st.data
            ?.expiresAtInput ||
            "без срока"
        );

      clearState(
        ctx.chat.id
      );

      return ctx.reply(
        [
          `✅ Промокод *${res.promoCode.code}* создан.`,
          "",
          `💰 Начисление: *${Number(
            res.promoCode
              .amountZl
          ).toFixed(2)} PLN*`,
          `⏳ Действует до: *${expiresAtInput}*`,
        ].join("\n"),
        {
          parse_mode:
            "Markdown",

          ...mainMenu(ctx),
        }
      );
    } catch (e) {
      return ctx.reply(
        `❌ Ошибка:\n\n${e.message}`
      );
    }
  }
);
