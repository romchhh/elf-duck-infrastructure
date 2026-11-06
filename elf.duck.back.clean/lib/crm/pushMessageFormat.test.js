import assert from "node:assert/strict";
import {
  buildPushMessageHtml,
  isInternalCrmPushTitle,
  promoAlreadyInPushText,
  pushTitleForTelegram,
  resolvePushPhotoForLanguage,
} from "./pushMessageFormat.js";

assert.equal(isInternalCrmPushTitle("PL · Nowi klienci — powitanie"), true);
assert.equal(isInternalCrmPushTitle("PL Oferta dla nowych"), true);
assert.equal(isInternalCrmPushTitle(""), false);
assert.equal(isInternalCrmPushTitle("Ваш кэшбек сгорает"), false);

const withCrmTitle = buildPushMessageHtml({
  title: "PL · Nowi klienci — powitanie",
  text: "Cześć!",
});
assert.equal(withCrmTitle.includes("Nowi klienci — powitanie"), false);
assert.equal(withCrmTitle.includes("Cześć!"), true);

const withRealTitle = buildPushMessageHtml({
  title: "Важно",
  text: "Текст",
});
assert.equal(withRealTitle.startsWith("<b>Важно</b>"), true);

assert.equal(
  pushTitleForTelegram({ title: "RU · Тест" }),
  ""
);

const dupPromo = buildPushMessageHtml({
  text: "Kod: `NOWY15`",
  promo: "NOWY15",
});
assert.equal(dupPromo.includes("🎁 Промокод"), false);
assert.equal(dupPromo.includes("NOWY15"), true);

const extraPromo = buildPushMessageHtml({
  text: "Tylko dziś rabat",
  promo: "NOWY15",
});
assert.equal(extraPromo.includes("🎁 Промокод"), true);

assert.equal(promoAlreadyInPushText("code `ABC`", "ABC"), true);

assert.deepEqual(
  resolvePushPhotoForLanguage(
    { photoUrl: "legacy.jpg", photoFileId: "fid0" },
    "ru"
  ),
  { photoUrl: "legacy.jpg", photoFileId: "fid0" }
);
assert.deepEqual(
  resolvePushPhotoForLanguage(
    {
      photoUrlRu: "ru.jpg",
      photoUrlPl: "pl.jpg",
      photoFileIdRu: "ru-id",
      photoFileIdPl: "pl-id",
      photoUrl: "legacy.jpg",
    },
    "pl"
  ),
  { photoUrl: "pl.jpg", photoFileId: "pl-id" }
);
assert.deepEqual(
  resolvePushPhotoForLanguage(
    { photoUrlRu: "ru.jpg", photoFileIdRu: "ru-id" },
    "pl"
  ),
  { photoUrl: "", photoFileId: "" }
);

console.log("pushMessageFormat tests ok");
