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
  normalizePushUsername,
} from "./pushText.js";
import { isCashbackExpiringSoon } from "./cashbackExpiring.js";

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

    const [
        salesHistory,
        products,
        favoriteCustomerRows,
    ] = await Promise.all([
    loadSalesHistory(
      range.to
    ),

    Product.find({

        isActive: {

            $ne: false,

        },

        })
      .select({
        productKey: 1,
        categoryKey: 1,
        title1: 1,
        title2: 1,
      })
      .lean(),

      mongoose.connection
        .collection(
            CRM_FAVORITE_CUSTOMERS_COLLECTION
        )
        .find({
            isFavorite: true,
        })
        .project({
            telegramId: 1,
        })
        .toArray(),
    ]);

    const favoriteCustomerIds =

        new Set(

            favoriteCustomerRows

            .map((row) =>

                String(

                row?.telegramId || ""

                ).trim()

            )

            .filter(Boolean)

        );

  const productByKey =
    new Map(
      products.map(
        (product) => [
          String(
            product?.productKey ||
              ""
          ),
          product,
        ]
      )
    );

  const statsByUser =
    new Map();

  for (
    const order of
    salesHistory
  ) {
    const telegramId =
      String(
        order
          ?.userTelegramId ||
          ""
      ).trim();

    if (!telegramId) {
      continue;
    }

    if (
      !statsByUser.has(
        telegramId
      )
    ) {
      statsByUser.set(
        telegramId,
        {
          purchases: 0,
          revenue: 0,

          firstSaleAt:
            null,

          lastSaleAt:
            null,

          categoryKeys:
            new Set(),

          locationKeys:
            new Set(),

          productKeys:
            new Set(),
          productQtyByKey:
            new Map(),
        }
      );
    }

    const stats =
      statsByUser.get(
        telegramId
      );

    const saleDate =
      new Date(
        order
          ?.crmSaleDate
      );

    stats.purchases += 1;

    stats.revenue +=
      Number(
        order?.totalZl ||
          0
      );

    if (
      !stats.firstSaleAt ||
      saleDate <
        stats.firstSaleAt
    ) {
      stats.firstSaleAt =
        saleDate;
    }

    if (
      !stats.lastSaleAt ||
      saleDate >
        stats.lastSaleAt
    ) {
      stats.lastSaleAt =
        saleDate;
    }

    const locationKey =
      getPushLocationKey(
        order
      );

    if (locationKey) {
      stats.locationKeys.add(
        locationKey
      );
    }

    for (
      const item of
      order?.items || []
    ) {
      const productKey =
        String(
          item?.productKey ||
            ""
        ).trim();

      if (!productKey) {
        continue;
      }

      stats.productKeys.add(
        productKey
      );

    const itemQty =
      (item?.flavors || [])
        .reduce(
          (sum, flavor) =>
            sum +
            Number(
              flavor?.qty || 0
            ),
          0
        );

      stats.productQtyByKey.set(
        productKey,
        Number(
          stats.productQtyByKey.get(
            productKey
          ) || 0
        ) + itemQty
      );

      const categoryKey =
        String(
          productByKey.get(
            productKey
          )?.categoryKey ||
            ""
        ).trim();

      if (categoryKey) {
        stats.categoryKeys.add(
          categoryKey
        );
      }
    }
  }

  const normalizedAudience =
    String(
      audience || "all"
    )
      .trim()
      .toLowerCase();

  const normalizedStatuses =
    new Set(
      (
        Array.isArray(
          statuses
        )
          ? statuses
          : []
      )
        .map(
          (value) =>
            String(
              value || ""
            )
              .trim()
              .toLowerCase()
        )
        .filter(Boolean)
    );

  const normalizedCategoryKeys =
    new Set(
      (
        Array.isArray(
          categoryKeys
        )
          ? categoryKeys
          : []
      )
        .map(
          (value) =>
            String(
              value || ""
            ).trim()
        )
        .filter(Boolean)
    );

  const normalizedLocationKeys =
    new Set(
      (
        Array.isArray(
          locationKeys
        )
          ? locationKeys
          : []
      )
        .map(
          (value) =>
            String(
              value || ""
            ).trim()
        )
        .filter(Boolean)
    );

  const normalizedTelegram =
    normalizePushUsername(
      telegram
    ).toLowerCase();

  const normalizedFavProduct =
    String(
      favProduct || ""
    )
      .trim()
      .toLowerCase();

  const safeMinCheck =
    Math.max(
      0,
      Number(
        minCheck || 0
      )
    );

  const safeMinCashback =
    Math.max(
      0,
      Number(
        minCashback || 0
      )
    );

  const activeThreshold =
    new Date(
      range.to.getTime() -
        14 *
          24 *
          60 *
          60 *
          1000
    );

  const pushUserQuery = User.find({
    telegramId: {
      $exists: true,
      $ne: "",
    },
  }).select({
    telegramId: 1,
    username: 1,
    firstName: 1,
    lastName: 1,
    createdAt: 1,
    cashbackBalance: 1,
    cashbackLedger: 1,
    referral: 1,
  });

  let matchedTotal = 0;
  const matchedSample = [];
  const matchedTelegramIds = [];

  const userMatchesPushAudience = (user) => {
        const telegramId =
          String(
            user?.telegramId ||
              ""
          ).trim();

        const username =
          String(
            user?.username ||
              ""
          ).trim();

        const stats =
          statsByUser.get(
            telegramId
          ) || null;

        /*
         * Конкретный Telegram.
         */
        if (
          normalizedTelegram
        ) {
          const byUsername =
            username.toLowerCase() ===
            normalizedTelegram;

          const byTelegramId =
            telegramId ===
            normalizedTelegram;

          if (
            !byUsername &&
            !byTelegramId
          ) {
            return false;
          }
        }

        /*
         * Аудитория: лиды.
         *
         * Лид =
         * приглашён через рефералку,
         * но ещё не совершал покупок.
         */
            if (
            normalizedAudience ===
            "leads"
            ) {
            const invitedBy = String(
              user?.referral?.invitedByTelegramId || ""
            ).trim();
            if (!invitedBy) {
              return false;
            }
            if (
                Number(
                stats?.purchases || 0
                ) > 0
            ) {
                return false;
            }
            }

        if (
          normalizedAudience ===
          "customers"
        ) {
          if (
            Number(
              stats?.purchases || 0
            ) <= 0
          ) {
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
         * Статус клиента.
         */
        if (
        normalizedStatuses.size
        ) {
        let status =
            "sleeping";

        if (
            stats?.firstSaleAt &&
            stats.firstSaleAt >=
            range.from &&
            stats.firstSaleAt <
            range.to
        ) {
            status = "new";
        } else if (
            stats?.lastSaleAt &&
            stats.lastSaleAt >=
            activeThreshold
        ) {
            status =
            "active";
        }

        const purchases =
            Number(
            stats?.purchases || 0
            );

        let segment = "";

        if (purchases === 1) {
            segment = "new";
        } else if (
            purchases >= 2 &&
            purchases <= 4
        ) {
            segment = "repeat";
        } else if (
            purchases >= 5 &&
            purchases <= 9
        ) {
            segment = "regular";
        } else if (
            purchases >= 10
        ) {
            segment = "vip";
        }

        const matchesStatus =
            normalizedStatuses.has(
            status
            );

        const matchesSegment =
            segment
            ? normalizedStatuses.has(
                segment
                )
            : false;

        if (
            !matchesStatus &&
            !matchesSegment
        ) {
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

  for await (const user of pushUserQuery.lean().cursor()) {
    if (!userMatchesPushAudience(user)) {
      continue;
    }

    matchedTotal += 1;

    if (matchedSample.length < 20) {
      matchedSample.push({
        username: String(user?.username || ""),
        name: getPushUserDisplayName(user),
        cashbackBalance: Number(user?.cashbackBalance || 0),
      });
    }

    if (
      includeTelegramIds &&
      matchedTelegramIds.length < CRM_PUSH_AUDIENCE_ID_CAP
    ) {
      const id = String(user?.telegramId || "").trim();
      if (id) {
        matchedTelegramIds.push(id);
      }
    }
  }

return {
  total: matchedTotal,

  telegramIds: includeTelegramIds ? matchedTelegramIds : [],

  audienceIdsTruncated:
    includeTelegramIds &&
    matchedTotal > matchedTelegramIds.length,
};
}
