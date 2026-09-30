import { isValidUrl } from "../api.js";

export const sendStepCard = async (ctx, { photoUrl, caption, keyboard }) => {
  const extra = {
    caption,
    parse_mode: "Markdown",
    ...(keyboard?.reply_markup ? { reply_markup: keyboard.reply_markup } : {}),
  };

  if (photoUrl && isValidUrl(photoUrl)) {
    return ctx.replyWithPhoto({ url: photoUrl }, extra);
  }

  const extraText = {
    parse_mode: "Markdown",
    ...(keyboard?.reply_markup ? { reply_markup: keyboard.reply_markup } : {}),
  };
  return ctx.reply(caption, extraText);
};
