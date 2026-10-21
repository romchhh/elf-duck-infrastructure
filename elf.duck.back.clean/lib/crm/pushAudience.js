import mongoose from "mongoose";
import Product from "../../models/Product.js";
import User from "../../models/User.js";
import {
  CRM_FAVORITE_CUSTOMERS_COLLECTION,
  CRM_PUSH_AUDIENCE_ID_CAP,
} from "./constants.js";
import { loadSalesHistory } from "./sales.js";
import {
  getPushUserDisplayName,
  parsePushAudienceTokens,
  getPushLocationKey,
} from "./pushText.js";
import { isCashbackExpiringSoon } from "./cashbackExpiring.js";
import { getCustomerStatus } from "./analytics/customers.js";

const SALES_STATS_CACHE_TTL_MS = 60_000;
let salesStatsCache = {
  expiresAt: 0,
  toMs: 0,
  statsByUser: null,
  productByKey: null,
};

async function loadSalesStatsBundle(range) {
  const toMs = range?.to ? new Date(range.to).getTime() : 0;
  const cacheHit =
    salesStatsCache.statsByUser &&
    salesStatsCache.productByKey &&
    salesStatsCache.toMs === toMs &&
    salesStatsCache.expiresAt > Date.now();

  if (cacheHit) {
    return {
      statsByUser: salesStatsCache.statsByUser,
      productByKey: salesStatsCache.productByKey,
    };
  }

  const [salesHistory, products] = await Promise.all([
    loadSalesHistory(range.to, { slimItems: true }),
    Product.find({ isActive: { $ne: false } })
      .select({
        productKey: 1,
        categoryKey: 1,
        title1: 1,
        title2: 1,
      })
      .lean(),
  ]);

  const productByKey = new Map(
    products.map((product) => [
      String(product?.productKey || ""),
      product,
    ])
  );

  const statsByUser = new Map();

  for (const order of salesHistory) {
    const telegramId = String(order?.userTelegramId || "").trim();
    if (!telegramId) continue;

    if (!statsByUser.has(telegramId)) {
      statsByUser.set(telegramId, {
        purchases: 0,
        revenue: 0,
        firstSaleAt: null,
        lastSaleAt: null,
        categoryKeys: new Set(),
        locationKeys: new Set(),
        productKeys: new Set(),
        productQtyByKey: new Map(),
      });
    }

    const stats = statsByUser.get(telegramId);
    const saleDate = new Date(order?.crmSaleDate);

    stats.purchases += 1;
    stats.revenue += Number(order?.totalZl || 0);

    if (!stats.firstSaleAt || saleDate < stats.firstSaleAt) {
      stats.firstSaleAt = saleDate;
    }

    if (!stats.lastSaleAt || saleDate > stats.lastSaleAt) {
      stats.lastSaleAt = saleDate;
    }

    const locationKey = getPushLocationKey(order);
    if (locationKey) {
      stats.locationKeys.add(locationKey);
    }

    for (const item of order?.items || []) {
      const productKey = String(item?.productKey || "").trim();
      if (!productKey) continue;

      stats.productKeys.add(productKey);

      const itemQty = (item?.flavors || []).reduce(
        (sum, flavor) => sum + Number(flavor?.qty || 0),
        0
      );

      stats.productQtyByKey.set(
        productKey,
        Number(stats.productQtyByKey.get(productKey) || 0) + itemQty
      );

      const categoryKey = String(
        productByKey.get(productKey)?.categoryKey || ""
      ).trim();

      if (categoryKey) {
        stats.categoryKeys.add(categoryKey);
      }
    }
  }

  salesStatsCache = {
    expiresAt: Date.now() + SALES_STATS_CACHE_TTL_MS,
    toMs,
    statsByUser,
    productByKey,
  };

  return { statsByUser, productByKey };
}

export async function buildPushAudiencePreview({
  range,
  audience = "all",
  statuses = [],
  categoryKeys = [],
  locationKeys = [],
  minCheck = 0,
  minCashback = 0,
  favProduct = "",
  telegram = "",
  cashbackExpiringSoon = false,
  includeTelegramIds = false,
}) {
  const audienceTokens = parsePushAudienceTokens(telegram);
  const audienceTokenSet = new Set(audienceTokens);

  const normalizedAudience = String(audience || "all")
    .trim()
    .toLowerCase();

  const normalizedStatuses = new Set(
    (Array.isArray(statuses) ? statuses : [])
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean)
  );

  const normalizedCategoryKeys = new Set(
    (Array.isArray(categoryKeys) ? categoryKeys : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  );

  const normalizedLocationKeys = new Set(
    (Array.isArray(locationKeys) ? locationKeys : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  );

  const normalizedFavProduct = String(favProduct || "")
    .trim()
    .toLowerCase();

  const safeMinCheck = Math.max(0, Number(minCheck || 0));
  const safeMinCashback = Math.max(0, Number(minCashback || 0));
  const isGuestTelegramId = (id) =>
    String(id || "")
      .trim()
      .toLowerCase()
      .startsWith("guest_");

  // «Все» = усі User (клієнти + ліди). Лід = без завершеної покупки
  // (як у /crm/leads), включно з тими, хто лише відкрив бота.
  const isCrmUniverseAudience =
    normalizedAudience === "all" || !normalizedAudience;

  // Sales history потрібна там, де фільтр дивиться на покупки / CRM-аудиторію.
  const needsSalesStats =
    isCrmUniverseAudience ||
    normalizedAudience === "customers" ||
    normalizedAudience === "leads" ||
    normalizedStatuses.size > 0 ||
    normalizedCategoryKeys.size > 0 ||
    normalizedLocationKeys.size > 0 ||
    safeMinCheck > 0 ||
    Boolean(normalizedFavProduct);

  const needsFavorites = normalizedAudience === "favorites";
  const hasTokenFilter = audienceTokenSet.size > 0;
  const hasExtraFilters =
    normalizedStatuses.size > 0 ||
    normalizedCategoryKeys.size > 0 ||
    normalizedLocationKeys.size > 0 ||
    safeMinCheck > 0 ||
    safeMinCashback > 0 ||
    Boolean(normalizedFavProduct) ||
    cashbackExpiringSoon;

  const baseUserMatch = {
    telegramId: {
      $exists: true,
      $ne: "",
      $not: { $regex: /^guest_/i },
    },
  };

  // Швидкий підрахунок без зайвих фільтрів.
  const canFastAudience =
    (isCrmUniverseAudience ||
      normalizedAudience === "customers" ||
      normalizedAudience === "leads") &&
    !hasTokenFilter &&
    !needsFavorites &&
    !hasExtraFilters;

  if (canFastAudience) {
    const emptyPreview = (total, telegramIds = []) => {
      const truncated = total > CRM_PUSH_AUDIENCE_ID_CAP;
      return {
        total,
        requestedUsernames: 0,
        matchedUsernames: 0,
        missingUsernames: [],
        sample: [],
        telegramIds: includeTelegramIds
          ? telegramIds.slice(0, CRM_PUSH_AUDIENCE_ID_CAP)
          : [],
        audienceIdsTruncated: truncated,
        audienceIdCap: CRM_PUSH_AUDIENCE_ID_CAP,
      };
    };

    // «Все» = усі валідні User (≈ клієнти ∪ ліди).
    if (isCrmUniverseAudience) {
      if (!includeTelegramIds) {
        const total = await User.countDocuments(baseUserMatch);
        return emptyPreview(total);
      }

      const rows = await User.find(baseUserMatch)
        .select({ telegramId: 1 })
        .lean();
      const ids = [];
      for (const row of rows) {
        const id = String(row?.telegramId || "").trim();
        if (!id || isGuestTelegramId(id)) continue;
        ids.push(id);
      }
      return emptyPreview(ids.length, ids);
    }

    const { statsByUser } = await loadSalesStatsBundle(range);
    const buyerIds = new Set(
      [...statsByUser.keys()]
        .map((id) => String(id || "").trim())
        .filter((id) => id && !isGuestTelegramId(id))
    );

    if (normalizedAudience === "customers") {
      const ids = [...buyerIds];
      return emptyPreview(ids.length, ids);
    }

    // «Лиды» = User без завершеної покупки (як у CRM Лиды).
    const rows = await User.find(baseUserMatch)
      .select({ telegramId: 1 })
      .lean();
    const leadIds = [];
    for (const row of rows) {
      const id = String(row?.telegramId || "").trim();
      if (!id || isGuestTelegramId(id)) continue;
      if (buyerIds.has(id)) continue;
      leadIds.push(id);
    }
    return emptyPreview(leadIds.length, leadIds);
  }

  const [favoriteCustomerRows, cachedBundle] = await Promise.all([
    needsFavorites
      ? mongoose.connection
          .collection(CRM_FAVORITE_CUSTOMERS_COLLECTION)
          .find({ isFavorite: true })
          .project({ telegramId: 1 })
          .toArray()
      : Promise.resolve([]),
    needsSalesStats
      ? loadSalesStatsBundle(range)
      : Promise.resolve({
          statsByUser: new Map(),
          productByKey: new Map(),
        }),
  ]);

  const { statsByUser, productByKey } = cachedBundle;

  const favoriteCustomerIds = new Set(
    favoriteCustomerRows
      .map((row) => String(row?.telegramId || "").trim())
      .filter(Boolean)
  );

  const userSelect = {
    telegramId: 1,
    username: 1,
    firstName: 1,
    lastName: 1,
    createdAt: 1,
    cashbackBalance: 1,
    cashbackLedger: 1,
    referral: 1,
  };

  // Список @username / id — шукаємо напряму, без повного скану бази.
  let candidateUsers;
  if (hasTokenFilter) {
    const tokenList = [...audienceTokenSet];
    candidateUsers = await User.find({
      ...baseUserMatch,
      $or: [
        { telegramId: { $in: tokenList } },
        {
          username: {
            $regex: `^(${tokenList
              .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
              .join("|")})$`,
            $options: "i",
          },
        },
      ],
    })
      .select(userSelect)
      .lean();
  } else {
    candidateUsers = null;
  }

  const pushUserQuery = candidateUsers
    ? null
    : User.find(baseUserMatch).select(userSelect);

  let matchedTotal = 0;
  let matchedWithTelegramId = 0;
  const matchedSample = [];
  const matchedTelegramIds = [];
  const matchedTokenHits = new Set();

  const userMatchesPushAudience = (user) => {
        const telegramId =
          String(
            user?.telegramId ||
              ""
          ).trim();

        if (!telegramId || isGuestTelegramId(telegramId)) {
          return false;
        }

        const username =
          String(
            user?.username ||
              ""
          ).trim();

        const stats =
          statsByUser.get(
            telegramId
          ) || null;

        const purchases = Number(stats?.purchases || 0);

        /*
         * Список @username / telegramId (один або багато).
         */
        if (audienceTokenSet.size > 0) {
          const uname = username.toLowerCase();
          const tid = telegramId.toLowerCase();
          const hitUsername = uname && audienceTokenSet.has(uname);
          const hitId =
            audienceTokenSet.has(telegramId) ||
            audienceTokenSet.has(tid);

          if (!hitUsername && !hitId) {
            return false;
          }
        }

        /*
         * «Все» = усі валідні User (клієнти + ліди).
         * Додатковий відсів не потрібен — baseUserMatch уже без guest_.
         */

        /*
         * Аудитория: лиды.
         * Як у /crm/leads: будь-хто без завершеної покупки
         * (включно з тими, хто лише відкрив бота; реферал не обов'язковий).
         */
        if (normalizedAudience === "leads") {
          if (purchases > 0) {
            return false;
          }
        }

        if (
          normalizedAudience ===
          "customers"
        ) {
          if (purchases <= 0) {
            return false;
          }
        }

        /*
         * Аудитория:
         * есть избранные товары.
         */
        if (
        normalizedAudience ===
        "favorites"
        ) {
        if (
            !favoriteCustomerIds.has(
            telegramId
            )
        ) {
            return false;
        }
        }

        /*
         * Статус клиента (як на сторінці Клиенты).
         */
        if (normalizedStatuses.size) {
          const status = getCustomerStatus({
            firstSaleAt: stats?.firstSaleAt || null,
            lastSaleAt: stats?.lastSaleAt || null,
            range,
          });

          if (!normalizedStatuses.has(status)) {
            return false;
          }
        }

        /*
         * Категории.
         */
        if (
          normalizedCategoryKeys.size
        ) {
          if (!stats) {
            return false;
          }

          const hasCategory =
            Array.from(
              normalizedCategoryKeys
            ).some(
              (
                categoryKey
              ) =>
                stats.categoryKeys.has(
                  categoryKey
                )
            );

          if (!hasCategory) {
            return false;
          }
        }

        /*
         * Точки / доставка.
         */
        if (
          normalizedLocationKeys.size
        ) {
          if (!stats) {
            return false;
          }

          const hasLocation =
            Array.from(
              normalizedLocationKeys
            ).some(
              (
                locationKey
              ) =>
                stats.locationKeys.has(
                  locationKey
                )
            );

          if (!hasLocation) {
            return false;
          }
        }

        /*
         * Минимальный средний чек.
         */
        if (
          safeMinCheck > 0
        ) {
          const purchases =
            Number(
              stats?.purchases ||
                0
            );

          const averageCheck =
            purchases > 0
              ? Number(
                  stats?.revenue ||
                    0
                ) /
                purchases
              : 0;

          if (
            averageCheck <
            safeMinCheck
          ) {
            return false;
          }
        }

        /*
         * Минимальный cashback.
         */
        if (
          safeMinCashback >
          0
        ) {
          if (
            Number(
              user
                ?.cashbackBalance ||
                0
            ) <
            safeMinCashback
          ) {
            return false;
          }
        }

/*
 * Любимый товар =
 * товар, которого клиент
 * купил больше всего штук
 * за всю историю успешных заказов.
 */
if (
  normalizedFavProduct
) {
  const productQtyEntries =
    stats?.productQtyByKey
      ? Array.from(
          stats.productQtyByKey.entries()
        )
      : [];

  let maxQty = 0;

  for (
    const [, qty] of
    productQtyEntries
  ) {
    maxQty = Math.max(
      maxQty,
      Number(qty || 0)
    );
  }

  const favoriteKeys =
    maxQty > 0
      ? productQtyEntries
          .filter(
            ([, qty]) =>
              Number(qty || 0) ===
              maxQty
          )
          .map(
            ([productKey]) =>
              String(
                productKey || ""
              )
          )
      : [];

  const matchesFavorite =
    favoriteKeys.some(
      (productKey) => {
        const product =
          productByKey.get(
            productKey
          );

        const title =
          [
            product?.title1 || "",
            product?.title2 || "",
          ]
            .filter(Boolean)
            .join(" ")
            .trim()
            .toLowerCase();

        return (
          productKey
            .toLowerCase()
            .includes(
              normalizedFavProduct
            ) ||
          title.includes(
            normalizedFavProduct
          )
        );
      }
    );

  if (!matchesFavorite) {
    return false;
  }
}

        if (cashbackExpiringSoon) {
          if (!isCashbackExpiringSoon(user)) {
            return false;
          }
        }

        return true;
  };

  const consumeUser = (user) => {
    if (!userMatchesPushAudience(user)) {
      return;
    }

    matchedTotal += 1;

    const telegramId = String(user?.telegramId || "").trim();
    const username = String(user?.username || "").trim().toLowerCase();
    if (username && audienceTokenSet.has(username)) {
      matchedTokenHits.add(username);
    }
    if (telegramId) {
      const tid = telegramId.toLowerCase();
      if (audienceTokenSet.has(telegramId) || audienceTokenSet.has(tid)) {
        matchedTokenHits.add(tid);
      }
    }

    if (matchedSample.length < 20) {
      matchedSample.push({
        username: String(user?.username || ""),
        name: getPushUserDisplayName(user),
        cashbackBalance: Number(user?.cashbackBalance || 0),
      });
    }

    if (telegramId) {
      matchedWithTelegramId += 1;
      if (
        includeTelegramIds &&
        matchedTelegramIds.length < CRM_PUSH_AUDIENCE_ID_CAP
      ) {
        matchedTelegramIds.push(telegramId);
      }
    }
  };

  if (candidateUsers) {
    for (const user of candidateUsers) {
      consumeUser(user);
    }
  } else {
    for await (const user of pushUserQuery.lean().cursor({ batchSize: 500 })) {
      consumeUser(user);
    }
  }

  const missingUsernames = audienceTokens.filter((token) => {
    if (matchedTokenHits.has(token)) return false;
    // telegramId hit may store original casing
    for (const hit of matchedTokenHits) {
      if (String(hit).toLowerCase() === token) return false;
    }
    return true;
  });

  const truncated = matchedWithTelegramId > CRM_PUSH_AUDIENCE_ID_CAP;

  return {
    total: matchedTotal,
    requestedUsernames: audienceTokens.length,
    matchedUsernames: audienceTokens.length - missingUsernames.length,
    missingUsernames,
    sample: matchedSample,
    telegramIds: includeTelegramIds ? matchedTelegramIds : [],
    audienceIdsTruncated: truncated,
    audienceIdCap: CRM_PUSH_AUDIENCE_ID_CAP,
  };
}
