import assert from "node:assert/strict";
import {
  DEFAULT_COMPLAINTS_CHAT_ID,
  submitCustomerComplaint,
} from "../lib/support/complaintsTelegram.js";

const sent = { messages: [], photos: [] };

const fakeBot = {
  telegram: {
    async sendMessage(chatId, text, extra) {
      sent.messages.push({ chatId, text, extra });
      return { message_id: 1 };
    },
    async sendPhoto(chatId, photo, extra) {
      sent.photos.push({ chatId, photo, extra });
      return { message_id: 2 };
    },
  },
};

process.env.COMPLAINTS_TELEGRAM_CHAT_ID = DEFAULT_COMPLAINTS_CHAT_ID;

const { getClientDeliveryBots, getShopBotByIndex } = await import(
  "../lib/telegram/clientBotDelivery.js"
);
const { getPrimaryShopBotIndex } = await import(
  "../lib/telegram/shopBotPrimary.js"
);

const origGetClient = getClientDeliveryBots;
const origGetShop = getShopBotByIndex;
const origPrimary = getPrimaryShopBotIndex;

// Patch module exports via dynamic re-import hack — test validation only paths that don't need DB
async function testValidation() {
  const short = await submitCustomerComplaint({
    telegramId: "123",
    text: "ab",
  });
  assert.equal(short.ok, false);
  assert.equal(short.reason, "TEXT_TOO_SHORT");

  const guest = await submitCustomerComplaint({
    telegramId: "guest_1",
    text: "valid text",
  });
  assert.equal(guest.ok, false);
  assert.equal(guest.reason, "NO_TELEGRAM");

  const badImg = await submitCustomerComplaint({
    telegramId: "123",
    text: "valid text here",
    images: ["not-an-image"],
  });
  assert.equal(badImg.ok, false);
  assert.equal(badImg.reason, "INVALID_IMAGE");

  console.log("complaint validation tests: ok");
}

await testValidation();
console.log("All complaint logic checks passed.");
