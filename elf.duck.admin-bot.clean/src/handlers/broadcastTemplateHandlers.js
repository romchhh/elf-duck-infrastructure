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
import {
  defaultPromoCodeData,
  PROMO_CODE_STEPS,
  normalizePromoCodeInput,
  askPromoCodeStep,
  defaultBroadcastData,
  askBroadcastStep,
  askBroadcastTemplateStep,
  defaultBroadcastTemplateData,
  askCourierMessageStep,
  defaultCourierMessageData,
} from "./wizardState.js";
import { askCashbackGrantStep } from "./cashback.js";
import { loadBroadcastTemplates, getBroadcastTemplateById } from "./broadcastTemplates.js";
import {
  FL_BUILDER_STEPS,
  FL_QUICK_STEPS,
  isFlavorFlowMode,
  askFlavorStep,
  askQuickStockStep,
} from "./flavorFlow.js";
import { BUILDER_STEPS } from "./categoryProductDefs.js";
import { PRODUCT_BUILDER_STEPS } from "./categoryProductDefs.js";
import { nextProductStep } from "./productFlow.js";
bot.action(/^broadcast_template:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const value = ctx.match[1];

  const st = getState(ctx.chat.id);

  if (!st || st.mode !== "broadcast") return;

  if (value === "custom") {
    st.data.templateId = "";
    st.step++;

    setState(ctx.chat.id, st);

    return askBroadcastStep(ctx);
  }

  const template = getBroadcastTemplateById(value);

  if (!template) {
    return ctx.reply("❌ Шаблон не найден.");
  }

  st.data.templateId = String(template._id);
  st.data.photoUrl = template.photoUrl || "";
  st.data.text = template.text || "";
  st.data.buttonText = template.buttonText || "";
  st.data.buttonUrl = template.buttonUrl || "";

  st.step = BROADCAST_STEPS.indexOf("confirm");

  setState(ctx.chat.id, st);

  return askBroadcastStep(ctx);
});

bot.action("broadcast_templates", async (ctx) => {

  if (!isAdmin(ctx)) {

    return ctx.answerCbQuery(

      "Недостаточно прав"

    );

  }

  await ctx.answerCbQuery();

  await loadBroadcastTemplates();

  return ctx.reply(
    "📂 *Шаблоны рассылок*",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "➕ Создать шаблон",
            "broadcast_template_create"
          ),
        ],

        ...BROADCAST_TEMPLATES.map((template) => [
          Markup.button.callback(
            `${template.isDefault ? "⭐ " : ""}${template.title}`,
            `broadcast_template_manage:${template._id}`
          ),
        ]),

        [
          Markup.button.callback(
            "⬅️ Назад",
            "broadcast_start"
          ),
        ],
      ]),
    }
  );
});

bot.action("broadcast_template_create", async (ctx) => {
  await ctx.answerCbQuery();

  setState(ctx.chat.id, {
    mode: "broadcast_template_create",
    step: 0,
    data: {
      title: "",
      photoUrl: "",
      text: "",
      buttonText: "",
      buttonUrl: "",
    },
  });

  return ctx.reply(
    "📝 Введите название шаблона."
  );
});

bot.action(
  /^broadcast_template_manage:(.+)$/,
  async (ctx) => {
        if (!isAdmin(ctx)) {

      return ctx.answerCbQuery(

        "Недостаточно прав"

      );

    }
    await ctx.answerCbQuery();

    await loadBroadcastTemplates();

    const template = getBroadcastTemplateById(
      ctx.match[1]
    );

    if (!template) {
      return ctx.reply("❌ Шаблон не найден.");
    }

    const rows = [
      [
        Markup.button.callback(
          "🚀 Использовать",
          `broadcast_template_use:${template._id}`
        ),
      ],

      [
        Markup.button.callback(
          "✏️ Изменить",
          `broadcast_edit_template:${template._id}`
        ),
      ],
    ];

    if (isSuperAdmin(ctx)) {
      rows.push([
        Markup.button.callback(
          template.isDefault
            ? "⭐ По умолчанию"
            : "⭐ Сделать по умолчанию",
          `broadcast_default_template:${template._id}`
        ),
      ]);
    }

    rows.push([
      Markup.button.callback(
        "🗑 Удалить",
        `broadcast_delete_template:${template._id}`
      ),
    ]);

    rows.push([
      Markup.button.callback(
        "⬅️ Назад",
        "broadcast_templates"
      ),
    ]);

    return ctx.reply(
      `📄 *${template.title}*`,
      {
        parse_mode: "Markdown",

        ...Markup.inlineKeyboard(
          rows
        ),
      }
    );
  }
);

bot.action(/^broadcast_template_use:(.+)$/, async (ctx) => {

  if (!isAdmin(ctx)) {

    return ctx.answerCbQuery(

      "Недостаточно прав"

    );

  }

  await ctx.answerCbQuery();

  const templateId = ctx.match[1];

  await loadBroadcastTemplates();

  const template = getBroadcastTemplateById(templateId);

  if (!template) {
    return ctx.reply("❌ Шаблон не найден.");
  }

  setState(ctx.chat.id, {
    mode: "broadcast",
    step: BROADCAST_STEPS.indexOf("audienceType"),
    data: {
      ...defaultBroadcastData(),

      templateId: String(template._id),
      photoUrl: template.photoUrl || "",
      text: template.text || "",
      buttonText: template.buttonText || "",
      buttonUrl: template.buttonUrl || "",
    },
  });

  return askBroadcastStep(ctx);
});

bot.action(
  /^broadcast_default_template:(.+)$/,
  async (ctx) => {
        if (!isAdmin(ctx)) {

      return ctx.answerCbQuery(

        "Недостаточно прав"

      );

    }
    await ctx.answerCbQuery("Сохраняю...");

    try {
      await api(
        `/admin/broadcast/templates/${ctx.match[1]}/default`,
        {
          method: "POST",
        }
      );

      await loadBroadcastTemplates();

      const template = getBroadcastTemplateById(
        ctx.match[1]
      );

      return ctx.reply(
        `⭐ Шаблон "${template?.title || ""}" теперь используется по умолчанию.`,
        {
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                "⬅️ К шаблонам",
                "broadcast_templates"
              ),
            ],
          ]),
        }
      );
    } catch (e) {
      return ctx.reply(`❌ ${e.message}`);
    }
  }
);

bot.action(
  /^broadcast_delete_template:(.+)$/,
  async (ctx) => {
if (!isAdmin(ctx)) {

  return ctx.answerCbQuery(

    "Недостаточно прав"

  );

}
    await ctx.answerCbQuery();

    const template =
      getBroadcastTemplateById(ctx.match[1]);

    if (!template) {
      return ctx.reply("❌ Шаблон не найден.");
    }

    return ctx.reply(
      `Удалить шаблон *${template.title}*?`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "🗑 Да, удалить",
              `broadcast_delete_template_confirm:${template._id}`
            ),
          ],
          [
            Markup.button.callback(
              "⬅️ Назад",
              `broadcast_template_manage:${template._id}`
            ),
          ],
        ]),
      }
    );
  }
);

bot.action(
  /^broadcast_delete_template_confirm:(.+)$/,
  async (ctx) => {
    if (!isAdmin(ctx)) {
      return ctx.answerCbQuery(
        "Недостаточно прав"
      );
    }
    await ctx.answerCbQuery("Удаляю...");

    try {
      await api(
        `/admin/broadcast/templates/${ctx.match[1]}`,
        {
          method: "DELETE",
        }
      );

      await loadBroadcastTemplates();

      return bot.telegram.sendMessage(
        ctx.chat.id,
        "✅ Шаблон удалён.",
        {
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                "📂 Шаблоны",
                "broadcast_templates"
              ),
            ],
          ]),
        }
      );
    } catch (e) {
      return ctx.reply(`❌ ${e.message}`);
    }
  }
);

bot.action("broadcast_template_back", async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.answerCbQuery(
      "Недостаточно прав"
    );
  }

  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);

  if (
    !st ||
    (
      st.mode !== "broadcast_template_create" &&
      st.mode !== "broadcast_template_edit"
    )
  ) {
    return;
  }

  st.step = Math.max(0, st.step - 1);

  setState(ctx.chat.id, st);

  return askBroadcastTemplateStep(ctx);
});

bot.action("broadcast_template_save", async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.answerCbQuery(
      "Недостаточно прав"
    );
  }

  await ctx.answerCbQuery(
    "Сохраняю..."
  );

  const st = getState(ctx.chat.id);

  if (
    !st ||
    (
      st.mode !== "broadcast_template_create" &&
      st.mode !== "broadcast_template_edit"
    )
  ) {
    return;
  }

  try {
    if (st.mode === "broadcast_template_create") {

      await api("/admin/broadcast/templates", {
        method: "POST",
        body: JSON.stringify({
          title: st.data.title,
          photoUrl: st.data.photoUrl,
          text: st.data.text,
          buttonText: st.data.buttonText,
          buttonUrl: st.data.buttonUrl,
        }),
      });

    } else {

      await api(
        `/admin/broadcast/templates/${st.data.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            title: st.data.title,
            photoUrl: st.data.photoUrl,
            text: st.data.text,
            buttonText: st.data.buttonText,
            buttonUrl: st.data.buttonUrl,
          }),
        }
      );

    }

    await loadBroadcastTemplates();

    clearState(ctx.chat.id);

    return ctx.reply(
      "✅ Шаблон сохранён.",
      {
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "📂 К шаблонам",
              "broadcast_templates"
            ),
          ],
        ]),
      }
    );

  } catch (e) {
    return ctx.reply(`❌ ${e.message}`);
  }
});

bot.action(
  /^broadcast_edit_template:(.+)$/,
  async (ctx) => {
        if (!isAdmin(ctx)) {

      return ctx.answerCbQuery(

        "Недостаточно прав"

      );

    }

    await ctx.answerCbQuery();

    await loadBroadcastTemplates();

    const template =
      getBroadcastTemplateById(ctx.match[1]);

    if (!template) {
      return ctx.reply("❌ Шаблон не найден.");
    }

    setState(ctx.chat.id, {
      mode: "broadcast_template_edit",
      step: 0,
      data: {
        id: String(template._id),
        title: template.title || "",
        photoUrl: template.photoUrl || "",
        text: template.text || "",
        buttonText: template.buttonText || "",
        buttonUrl: template.buttonUrl || "",
      },
    });

    return askBroadcastTemplateStep(ctx);

  }
);

// ----- text inputs for steps -----
