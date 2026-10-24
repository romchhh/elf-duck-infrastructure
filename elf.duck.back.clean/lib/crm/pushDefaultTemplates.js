import mongoose from "mongoose";
import { BROADCAST_TEMPLATES_COLLECTION } from "./constants.js";

/**
 * Готові шаблони CRM Push (PL) для аудиторії «Лиды» / nowi klienci.
 * slug — стабільний ключ; текст можна правити в CRM, повторний seed не перезаписує.
 */
export const DEFAULT_PUSH_TEMPLATES = [
  {
    slug: "pl-leads-welcome",
    title: "PL · Nowi klienci — powitanie",
    suggestedAudience: "leads",
    language: "pl",
    text: [
      "Cześć! 👋 Witamy w **ELF DUCK**.",
      "",
      "Na start masz rabat na pierwszy zakup.",
      "Użyj kodu: `NOWY15`",
      "",
      "Otwórz sklep, wybierz smak i złóż pierwsze zamówienie 👇",
    ].join("\n"),
    buttons: [
      { text: "Otwórz sklep", kind: "web_app", path: "/", url: "" },
    ],
  },
  {
    slug: "pl-leads-reminder",
    title: "PL · Nowi klienci — przypomnienie",
    suggestedAudience: "leads",
    language: "pl",
    text: [
      "Hej! Widzimy, że jeszcze nie złożyłeś u nas pierwszego zamówienia.",
      "",
      "Twój kod **`NOWY15`** (−15 zł) nadal działa.",
      "Odbiór osobisty lub dostawa — jak wygodniej.",
      "",
      "Zamów dziś 👇",
    ].join("\n"),
    buttons: [
      { text: "Zamawiam", kind: "web_app", path: "/", url: "" },
    ],
  },
  {
    slug: "pl-leads-assortment",
    title: "PL · Nowi klienci — asortyment",
    suggestedAudience: "leads",
    language: "pl",
    text: [
      "**ELF DUCK** — świeży asortyment już czeka.",
      "",
      "Jednorazówki, płyny, pody i więcej.",
      "Dla nowych: kod `NOWY15` (−15 zł na start).",
      "",
      "Wejdź do sklepu i wybierz smak 👇",
    ].join("\n"),
    buttons: [
      { text: "Zobacz katalog", kind: "web_app", path: "/", url: "" },
    ],
  },
  {
    slug: "pl-leads-promo-custom",
    title: "PL · Nowi klienci — z Twoim promo",
    suggestedAudience: "leads",
    language: "pl",
    text: [
      "Cześć! Jeszcze nie zrobiłeś u nas pierwszego zamówienia?",
      "",
      "Mamy dla Ciebie rabat na start.",
      "Kod promocyjny: `TWOJ_KOD`",
      "",
      "_(Podmień TWOJ_KOD na swój kod z CRM → Promokody.)_",
      "",
      "Otwórz miniapp i złóż zamówienie 👇",
    ].join("\n"),
    buttons: [
      { text: "Otwórz sklep", kind: "web_app", path: "/", url: "" },
      { text: "Mam kod", kind: "web_app", path: "/promo", url: "" },
    ],
  },
];

export async function ensureDefaultPushTemplates() {
  const collection = mongoose.connection.collection(
    BROADCAST_TEMPLATES_COLLECTION
  );

  try {
    await collection.createIndex(
      { slug: 1 },
      { unique: true, sparse: true, name: "broadcast_templates_slug_unique" }
    );
  } catch (error) {
    // index may already exist with another name
    if (Number(error?.code) !== 85 && Number(error?.code) !== 86) {
      console.warn(
        "ensureDefaultPushTemplates index:",
        error?.message || error
      );
    }
  }

  const now = new Date();
  let inserted = 0;

  for (const template of DEFAULT_PUSH_TEMPLATES) {
    const slug = String(template.slug || "").trim();
    if (!slug) continue;

    const existing = await collection.findOne(
      { slug },
      { projection: { _id: 1 } }
    );
    if (existing) continue;

    await collection.insertOne({
      slug,
      title: template.title,
      text: template.text,
      language: template.language || "pl",
      suggestedAudience: template.suggestedAudience || "leads",
      photoUrl: "",
      photoFileId: "",
      photoPreviewUrl: "",
      buttonText: "",
      buttonUrl: "",
      buttons: Array.isArray(template.buttons) ? template.buttons : [],
      isDefault: true,
      used: 0,
      conversion: 0,
      lastUsed: null,
      createdAt: now,
      updatedAt: now,
      createdVia: "crm-default-seed",
    });
    inserted += 1;
  }

  return { inserted, total: DEFAULT_PUSH_TEMPLATES.length };
}
