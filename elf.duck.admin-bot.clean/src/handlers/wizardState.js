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
import { getBroadcastTemplateById, loadBroadcastTemplates } from "./broadcastTemplates.js";

export { loadBroadcastTemplates };

// =====================================================
// ===================== BOT STATE ======================
// =====================================================
export const defaultCashbackGrantData = () => ({
  username: "",
  amountZl: 0,
});

export const defaultPromoCodeData = () => ({

  code: "",

  amountZl: 0,

  expiresAt: null,

  expiresAtInput: "без срока",

});

export const PROMO_CODE_STEPS = [

  "code",

  "amount",

  "expiresAt",

  "confirm",

];

export const normalizePromoCodeInput = (value) =>

  String(value || "")

    .trim()

    .toUpperCase()

    .replace(/\s+/g, "")

    .replace(/[^A-Z0-9_-]/g, "")

    .slice(0, 32);

export const renderPromoCodePreview = (data = {}) => {
  const code = String(
    data?.code || ""
  ).trim();

  const amountZl = Number(
    data?.amountZl || 0
  );

  const expiresAtInput = String(
    data?.expiresAtInput || "без срока"
  ).trim();

  return [
    "🎟 *Промокод — превью*",
    "",
    `• код: *${code || "—"}*`,
    `• начисление: *${
      amountZl > 0
        ? amountZl.toFixed(2)
        : "0.00"
    } PLN*`,
    `• действует до: *${
      expiresAtInput || "без срока"
    }*`,
  ].join("\n");
};

export const promoCodeNavKeyboard = (stepIndex) => {
  if (stepIndex > 0) {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback("⬅️ Назад", "promo_code_back"),
        Markup.button.callback("✖️ Отмена", "promo_code_cancel"),
      ],
    ]);
  }

  return Markup.inlineKeyboard([
    [Markup.button.callback("✖️ Отмена", "promo_code_cancel")],
  ]);
};

export const askPromoCodeStep = async (ctx) => {
  const st = getState(ctx.chat.id);

  if (!st || st.mode !== "promo_code_create") {
    return;
  }

  const step = PROMO_CODE_STEPS[st.step];
  const preview = renderPromoCodePreview(st.data || {});

  if (step === "code") {
    return ctx.reply(
      `${preview}\n\nВведите *промокод* латиницей.\n\nПример: \`ELFDUCK25\``,
      {
        parse_mode: "Markdown",
        ...promoCodeNavKeyboard(st.step),
      }
    );
  }

  if (step === "amount") {
    return ctx.reply(
      `${preview}\n\nВведите *сумму начисления* в PLN.\n\nПример: \`25\` или \`37.5\``,
      {
        parse_mode: "Markdown",
        ...promoCodeNavKeyboard(st.step),
      }
    );
  }

  if (step === "expiresAt") {
  return ctx.reply(
    [
      preview,
      "",
      "Введите *срок действия промокода* по времени Варшавы.",
      "",
      "Формат: `ДД.ММ.ГГГГ ЧЧ:ММ`",
      "Пример: `31.08.2026 23:59`",
      "",
      "Для промокода без ограничения отправьте: `без срока`",
    ].join("\n"),
    {
      parse_mode: "Markdown",
      ...promoCodeNavKeyboard(
        st.step
      ),
    }
  );
}

  return ctx.reply(
    `${preview}\n\nСоздать и активировать этот промокод?`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "✅ Создать промокод",
            "promo_code_confirm"
          ),
        ],
        [
          Markup.button.callback(
            "⬅️ Назад",
            "promo_code_back"
          ),
          Markup.button.callback(
            "✖️ Отмена",
            "promo_code_cancel"
          ),
        ],
      ]),
    }
  );
};

export const defaultCourierMessageData = () => ({
  pickupPointId: "",
  username: "",
  text: "",
  photoUrl: "",
});

const BROADCAST_STEPS = [
  "audienceType",
  "segmentType",
  "segmentValue",
  "templateChoice",
  "photo",
  "text",
  "buttonText",
  "buttonUrl",
  "confirm",
];

export const defaultBroadcastData = () => ({

  audienceType: "all",

  segmentType: "",

  segmentValue: "",

  username: "",

  templateId: "",

  photoUrl: "",

  text: "",

  buttonText: "Открыть ELF DUCK",

  buttonUrl: `${WEBAPP_URL}/referral`,

});

const BROADCAST_TEMPLATE_STEPS = [
  "title",
  "photoUrl",
  "text",
  "buttonText",
  "buttonUrl",
  "confirm",
];

export const defaultBroadcastTemplateData = () => ({
  id: "",
  title: "",
  photoUrl: "",
  text: "",
  buttonText: "",
  buttonUrl: "",
});

const renderBroadcastTemplatePreview = (d = {}) => [
  "📂 *Шаблон*",
  "",
  `Название: *${d.title || "—"}*`,
  `Фото: ${d.photoUrl ? "✅" : "—"}`,
  `Текст: ${d.text ? "✅" : "—"}`,
  `Кнопка: *${d.buttonText || "—"}*`,
  `Ссылка: ${d.buttonUrl || "—"}`,
].join("\n");

const broadcastTemplateNav = (step) => {
  if (step > 0) {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback(
          "⬅️ Назад",
          "broadcast_template_back"
        ),
        Markup.button.callback(
          "✖️ Отмена",
          "broadcast_templates"
        ),
      ],
    ]);
  }

  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        "✖️ Отмена",
        "broadcast_templates"
      ),
    ],
  ]);
};

export const askBroadcastTemplateStep = async (ctx) => {

  const st = getState(ctx.chat.id);

  if (!st) return;

  if (
    st.mode !== "broadcast_template_create" &&
    st.mode !== "broadcast_template_edit"
  ) {
    return;
  }

  const step =
    BROADCAST_TEMPLATE_STEPS[st.step];

  const preview =
    renderBroadcastTemplatePreview(st.data);

  switch (step) {

    case "title":

      return ctx.reply(
        preview +
          "\n\nВведите название шаблона.",
        {
          parse_mode: "Markdown",
          ...broadcastTemplateNav(st.step),
        }
      );

    case "photoUrl":

      return ctx.reply(
        preview +
          "\n\nОтправьте URL картинки.",
        {
          parse_mode: "Markdown",
          ...broadcastTemplateNav(st.step),
        }
      );

    case "text":

      return ctx.reply(
        preview +
          "\n\nВведите текст сообщения.",
        {
          parse_mode: "Markdown",
          ...broadcastTemplateNav(st.step),
        }
      );

    case "buttonText":

      return ctx.reply(
        preview +
          "\n\nВведите текст кнопки.",
        {
          parse_mode: "Markdown",
          ...broadcastTemplateNav(st.step),
        }
      );

    case "buttonUrl":

      return ctx.reply(
        preview +
          "\n\nВведите ссылку кнопки.",
        {
          parse_mode: "Markdown",
          ...broadcastTemplateNav(st.step),
        }
      );

    case "confirm":

      return ctx.reply(
        preview +
          "\n\nСохранить шаблон?",
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                "💾 Сохранить",
                "broadcast_template_save"
              ),
            ],
            [
              Markup.button.callback(
                "⬅️ Назад",
                "broadcast_template_back"
              ),
            ],
          ]),
        }
      );
  }

};

const renderBroadcastPreview = (d = {}) => {
  let audienceLabel = "Массовая — всем клиентам";

  if (d.audienceType === "username") {
    audienceLabel = `Точечная — @${
      String(d.username || "")
        .trim()
        .replace(/^@/, "") || "—"
    }`;
  }

  if (d.audienceType === "segment") {
    audienceLabel = `Сегмент — ${
      d.segmentType || "—"
    } / ${d.segmentValue || "—"}`;
  }

  const template = getBroadcastTemplateById(
    d.templateId
  );

  const lines = [];

  lines.push("📣 *Push-уведомление*");
  lines.push("");

  lines.push(
    `• аудитория: *${audienceLabel}*`
  );

  lines.push(
    `• шаблон: *${
      template?.title || "Свой текст"
    }*`
  );

  lines.push(
    `• фото: ${
      d.photoUrl ? "*прикреплено*" : "—"
    }`
  );

  lines.push(
    `• текст: ${
      d.text ? "*заполнен*" : "—"
    }`
  );

  lines.push(
    `• кнопка: *${d.buttonText || "—"}*`
  );

  lines.push(
    `• ссылка: ${d.buttonUrl || "—"}`
  );

  return lines.join("\n");
};

const broadcastNavKeyboard = (stepIndex) => {
  if (stepIndex > 0) {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback("⬅️ Назад", "broadcast_back"),
        Markup.button.callback("✖️ Отмена", "broadcast_cancel"),
      ],
    ]);
  }

  return Markup.inlineKeyboard([
    [Markup.button.callback("✖️ Отмена", "broadcast_cancel")],
  ]);
};

export const askBroadcastStep = async (ctx) => {
  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "broadcast") return;

  const step = BROADCAST_STEPS[st.step];
  const d = st.data || {};
  const preview = renderBroadcastPreview(d);

  if (step === "audienceType") {
    return ctx.reply("📣 *Выберите аудиторию рассылки*", {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "👥 Всем клиентам",
            "broadcast_audience:all"
          ),
        ],
        [
          Markup.button.callback(
            "🎯 По сегменту",
            "broadcast_audience:segment"
          ),
        ],
        [
          Markup.button.callback(
            "👤 По username",
            "broadcast_audience:username"
          ),
        ],
        [
          Markup.button.callback(
            "✖️ Отмена",
            "broadcast_cancel"
          ),
        ],
      ]),
    });
  }

  if (step === "segmentType") {
    if (d.audienceType === "username") {
      return ctx.reply(
        `${preview}\n\nВведите *username клиента* в формате: \`@username\``,
        {
          parse_mode: "Markdown",
          ...broadcastNavKeyboard(st.step),
        }
      );
    }

    return ctx.reply("🎯 *Выберите тип сегмента*", {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "📦 Категория товара",
            "broadcast_segment_type:category"
          ),
        ],
        [
          Markup.button.callback(
            "🏪 Точка самовывоза",
            "broadcast_segment_type:pickupPoint"
          ),
        ],
        [
          Markup.button.callback(
            "🚚 Способ получения",
            "broadcast_segment_type:deliveryMethod"
          ),
        ],
        [
          Markup.button.callback(
            "⬅️ Назад",
            "broadcast_back"
          ),
          Markup.button.callback(
            "✖️ Отмена",
            "broadcast_cancel"
          ),
        ],
      ]),
    });
  }

  if (step === "segmentValue") {
    if (d.segmentType === "category") {
      return ctx.reply(
        "📦 *Выберите категорию товара*",
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                "Жидкости",
                "broadcast_segment_value:liquids"
              ),
            ],
            [
              Markup.button.callback(
                "Одноразки",
                "broadcast_segment_value:disposables"
              ),
            ],
            [
              Markup.button.callback(
                "Поды",
                "broadcast_segment_value:pods"
              ),
            ],
            [
              Markup.button.callback(
                "Картриджи",
                "broadcast_segment_value:cartridges"
              ),
            ],
            [
              Markup.button.callback(
                "⬅️ Назад",
                "broadcast_back"
              ),
              Markup.button.callback(
                "✖️ Отмена",
                "broadcast_cancel"
              ),
            ],
          ]),
        }
      );
    }

    if (d.segmentType === "deliveryMethod") {
      return ctx.reply(
        "🚚 *Выберите способ получения*",
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                "Самовывоз",
                "broadcast_segment_value:pickup"
              ),
            ],
            [
              Markup.button.callback(
                "Доставка курьером",
                "broadcast_segment_value:courier"
              ),
            ],
            [
              Markup.button.callback(
                "InPost",
                "broadcast_segment_value:inpost"
              ),
            ],
            [
              Markup.button.callback(
                "⬅️ Назад",
                "broadcast_back"
              ),
              Markup.button.callback(
                "✖️ Отмена",
                "broadcast_cancel"
              ),
            ],
          ]),
        }
      );
    }

    const pointsData = await api(
      `/pickup-points?active=0&_ts=${Date.now()}`
    );

    const points = Array.isArray(
      pointsData?.pickupPoints
    )
      ? pointsData.pickupPoints
      : Array.isArray(pointsData)
      ? pointsData
      : [];

    return ctx.reply(
      "🏪 *Выберите точку самовывоза*",
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          ...points.map((point) => [
            Markup.button.callback(
              String(
                point?.title ||
                  point?.address ||
                  point?.key ||
                  "Точка"
              ),
              `broadcast_segment_value:${String(
                point?._id || point?.key || ""
              )}`
            ),
          ]),
          [
            Markup.button.callback(
              "⬅️ Назад",
              "broadcast_back"
            ),
            Markup.button.callback(
              "✖️ Отмена",
              "broadcast_cancel"
            ),
          ],
        ]),
      }
    );
  }

  if (step === "templateChoice") {
    return ctx.reply(
      "🗂 *Выберите шаблон или создайте уведомление вручную*",
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          ...BROADCAST_TEMPLATES.map((template) => [
            Markup.button.callback(
              template.title,
                `broadcast_template:${template._id}`
            ),
          ]),
          [
            Markup.button.callback(
              "✍️ Свой текст",
              "broadcast_template:custom"
            ),
          ],
          [
            Markup.button.callback(
              "⬅️ Назад",
              "broadcast_back"
            ),
            Markup.button.callback(
              "✖️ Отмена",
              "broadcast_cancel"
            ),
          ],
        ]),
      }
    );
  }

  if (step === "photo") {
    return ctx.reply(
      `${preview}\n\nПрикрепите *фото* для пуш-уведомления одним сообщением.`,
      {
        parse_mode: "Markdown",
        ...broadcastNavKeyboard(st.step),
      }
    );
  }

  if (step === "text") {
    return ctx.reply(
      `${preview}\n\nВведите *текст уведомления*.\n\nМожно использовать HTML: <b>жирный</b>, <i>курсив</i>.`,
      {
        parse_mode: "Markdown",
        ...broadcastNavKeyboard(st.step),
      }
    );
  }

  if (step === "buttonText") {
    return ctx.reply(
      `${preview}\n\nВведите *текст кнопки*.\n\nПример: \`Открыть ELF DUCK\``,
      {
        parse_mode: "Markdown",
        ...broadcastNavKeyboard(st.step),
      }
    );
  }

  if (step === "buttonUrl") {
    return ctx.reply(
      `${preview}\n\nВведите *ссылку кнопки для Mini App*.\n\nПример: \`${WEBAPP_URL}/referral\``,
      {
        parse_mode: "Markdown",
        ...broadcastNavKeyboard(st.step),
      }
    );
  }

  const sendButtonText =
    d.audienceType === "username"
      ? "✅ Отправить клиенту"
      : d.audienceType === "segment"
      ? "✅ Отправить сегменту"
      : "✅ Отправить всем";

  const confirmKeyboard = Markup.inlineKeyboard([
    // [
    //   Markup.button.callback(
    //     "🧪 Тест на 5 пользователей",
    //     "broadcast_test"
    //   ),
    // ],
    [
      Markup.button.callback(
        sendButtonText,
        "broadcast_confirm"
      ),
    ],
    [
      Markup.button.callback(
        "⬅️ Назад",
        "broadcast_back"
      ),
      Markup.button.callback(
        "✖️ Отмена",
        "broadcast_cancel"
      ),
    ],
  ]);

  if (d.photoUrl && isValidUrl(d.photoUrl)) {
    await ctx.reply("👇 Ниже показано, как уведомление будет выглядеть у клиента:");

    return ctx.replyWithPhoto(
      { url: d.photoUrl },
      {
        caption: d.text || " ",
        parse_mode: "HTML",
        reply_markup: confirmKeyboard.reply_markup,
      }
    );
  }

  return ctx.reply(
    `${preview}\n\nПроверь сообщение перед отправкой.`,
    {
      parse_mode: "Markdown",
      ...confirmKeyboard,
    }
  );
};

const renderCourierMessagePreview = (d = {}) => {
  const lines = [];
  lines.push("📨 *Сообщение клиенту от курьера*");
  lines.push("");
  lines.push(`• username: *${d.username || "—"}*`);
  lines.push(`• текст: ${d.text ? `*${d.text}*` : "—"}`);
  lines.push(`• фото: ${d.photoUrl ? "*прикреплено*" : "—"}`);
  return lines.join("\n");
};

export const askCourierMessageStep = async (ctx) => {
  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "courier_msg") return;

  const d = st.data || {};
  const preview = renderCourierMessagePreview(d);

  if (st.step === 0) {
    return ctx.reply(
      `${preview}\n\nВведите *username клиента* в формате: \`@username\``,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([[Markup.button.callback("✖️ Отмена", "courier_msg_cancel")]]),
      }
    );
  }

  if (st.step === 1) {
    return ctx.reply(
      `${preview}\n\nВведите *текст сообщения* для клиента`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("⬅️ Назад", "courier_msg_back"),
            Markup.button.callback("✖️ Отмена", "courier_msg_cancel"),
          ],
        ]),
      }
    );
  }

  if (st.step === 2) {
    return ctx.reply(
      `${preview}\n\nПрикрепите *фото* одним сообщением или отправьте \`-\`, если без картинки`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("⬅️ Назад", "courier_msg_back"),
            Markup.button.callback("✖️ Отмена", "courier_msg_cancel"),
          ],
        ]),
      }
    );
  }

  // if (st.step === 3) {
  //   return ctx.reply(
  //     `${preview}\n\nВведите *текст кнопки* или \`-\`, чтобы оставить стандартный`,
  //     {
  //       parse_mode: "Markdown",
  //       ...Markup.inlineKeyboard([
  //         [
  //           Markup.button.callback("⬅️ Назад", "courier_msg_back"),
  //           Markup.button.callback("✖️ Отмена", "courier_msg_cancel"),
  //         ],
  //       ]),
  //     }
  //   );
  // }

  return ctx.reply(
    `${preview}\n\nОтправить это сообщение клиенту?`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("✅ Отправить", "courier_msg_confirm")],
        [
          Markup.button.callback("⬅️ Назад", "courier_msg_back"),
          Markup.button.callback("✖️ Отмена", "courier_msg_cancel"),
        ],
      ]),
    }
  );
};

