import express from "express";
import {
  getCustomerStatus,
  isCustomerActive,
  getCustomerSegment,
  CRM_FAVORITE_CUSTOMERS_COLLECTION,
  requireCrmPushAdmin,
  getPeriodRange,
  mongoose,
  User,
} from "./deps.js";
import { buildCustomerSalesStats } from "../../lib/crm/sales.js";
import {
  emptyLanguageStats,
  languageStatsFromUsers,
} from "../../lib/crm/userLanguage.js";

const router = express.Router();

const CUSTOMER_STATS_CACHE_TTL_MS = 5 * 60_000;
const customerStatsCache = new Map();

function averageIntervalDays(firstSaleAt, lastSaleAt, purchases) {
  const count = Number(purchases || 0);
  if (count < 2 || !firstSaleAt || !lastSaleAt) {
    return null;
  }

  const firstMs = new Date(firstSaleAt).getTime();
  const lastMs = new Date(lastSaleAt).getTime();
  if (Number.isNaN(firstMs) || Number.isNaN(lastMs) || lastMs < firstMs) {
    return null;
  }

  // Σ consecutive gaps = last − first → mean = (last − first) / (n − 1)
  return Math.round(
    (lastMs - firstMs) / (count - 1) / (24 * 60 * 60 * 1000)
  );
}

function getCustomerStatsCacheKey(range) {
  const fromMs = range?.from ? new Date(range.from).getTime() : 0;
  const toMs = range?.to ? new Date(range.to).getTime() : 0;
  // Bucket "to" by minute so consecutive filter/sort clicks reuse one aggregate.
  const toBucket = Math.floor(toMs / 60_000);
  return `${range?.key || "custom"}:${fromMs}:${toBucket}`;
}

async function loadCustomerSalesStatsCached(range, options = {}) {
  const scoped = Array.isArray(options?.telegramIds);
  if (scoped) {
    return buildCustomerSalesStats(range.to, options);
  }

  const key = getCustomerStatsCacheKey(range);
  const hit = customerStatsCache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value;
  }

  const value = await buildCustomerSalesStats(range.to, options);
  customerStatsCache.set(key, {
    value,
    expiresAt: Date.now() + CUSTOMER_STATS_CACHE_TTL_MS,
  });

  // Keep the map small.
  if (customerStatsCache.size > 8) {
    const oldestKey = customerStatsCache.keys().next().value;
    customerStatsCache.delete(oldestKey);
  }

  return value;
}

router.get(
  "/customers",
  async (req, res) => {
    try {
      const range = getPeriodRange(
        req.query?.period || "all",
        req.query?.from || "",
        req.query?.to || ""
      );

      const page = Math.max(
        1,
        Number.parseInt(req.query?.page, 10) || 1
      );

      const limit = Math.min(
        100,
        Math.max(1, Number.parseInt(req.query?.limit, 10) || 50)
      );

      const search = String(req.query?.search || "")
        .trim()
        .toLowerCase()
        .replace(/^@+/, "");

      const { parseSortQuery, sortRows } = await import(
        "../../lib/crm/sortRows.js"
      );

      const sortableCustomerKeys = [
        "name",
        "status",
        "segment",
        "ltv",
        "purchases",
        "interval",
        "avgCheck",
        "lastOrder",
        "cashback",
      ];

      const { sortKey, sortDirection } = parseSortQuery(
        req.query,
        sortableCustomerKeys
      );

      const statusFilter = String(req.query?.status || "all")
        .trim()
        .toLowerCase();

      const favoriteCustomerRows = await mongoose.connection
        .collection(CRM_FAVORITE_CUSTOMERS_COLLECTION)
        .find({ isFavorite: true })
        .project({ telegramId: 1 })
        .toArray();

      const favoriteCustomerIds = new Set(
        favoriteCustomerRows
          .map((row) => String(row?.telegramId || "").trim())
          .filter(Boolean)
      );

      const onlyFavorites = statusFilter === "favorites";

      let searchTelegramIds = null;

      if (search) {
        const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const searchUsers = await User.find({
          $or: [
            { username: { $regex: escaped, $options: "i" } },
            { firstName: { $regex: escaped, $options: "i" } },
            { lastName: { $regex: escaped, $options: "i" } },
            { telegramId: { $regex: escaped, $options: "i" } },
          ],
        })
          .select({ telegramId: 1 })
          .limit(500)
          .lean();

        searchTelegramIds = searchUsers
          .map((user) => String(user?.telegramId || "").trim())
          .filter(Boolean);

        if (searchTelegramIds.length === 0) {
          return res.json({
            ok: true,
            period: {
              key: range.key,
              from: range.from,
              to: range.to,
            },
            summary: {
              customers: 0,
              active: 0,
              topLtv: 0,
              averageCheck: 0,
            },
            rows: [],
            pagination: {
              page: 1,
              limit,
              total: 0,
              pageCount: 1,
            },
          });
        }
      }

      const scopedTelegramIds = (() => {
        if (onlyFavorites && searchTelegramIds) {
          const favoriteSet = favoriteCustomerIds;
          return searchTelegramIds.filter((id) => favoriteSet.has(id));
        }

        if (onlyFavorites) {
          return Array.from(favoriteCustomerIds);
        }

        if (searchTelegramIds) {
          return searchTelegramIds;
        }

        return null;
      })();

      if (scopedTelegramIds && scopedTelegramIds.length === 0) {
        return res.json({
          ok: true,
          period: {
            key: range.key,
            from: range.from,
            to: range.to,
          },
          summary: {
            customers: 0,
            active: 0,
            topLtv: 0,
            averageCheck: 0,
          },
          rows: [],
          pagination: {
            page: 1,
            limit,
            total: 0,
            pageCount: 1,
          },
        });
      }

      const salesByCustomer = await loadCustomerSalesStatsCached(range, {
        from: range.from,
        ...(scopedTelegramIds
          ? { telegramIds: scopedTelegramIds }
          : {}),
      });

      const telegramIds = scopedTelegramIds
        ? scopedTelegramIds.filter((telegramId) =>
            salesByCustomer.has(telegramId)
          )
        : Array.from(salesByCustomer.keys());

      // Build stats-only rows first so sort/filter/page do not wait on User.find
      // for the whole customer base (~2k docs).
      let rows = telegramIds.map((telegramId) => {
        const stats = salesByCustomer.get(telegramId) || {
          ltv: 0,
          purchases: 0,
          firstSaleAt: null,
          lastSaleAt: null,
          revenueInPeriod: 0,
          purchasesInPeriod: 0,
        };

        const firstSaleAt = stats.firstSaleAt || null;
        const lastSaleAt = stats.lastSaleAt || null;
        const purchases = Number(stats.purchases || 0);
        const ltv = Number(stats.ltv || 0);

        return {
          id: telegramId,
          telegramId,
          isFavorite: favoriteCustomerIds.has(telegramId),
          name: telegramId,
          username: "",
          handle: telegramId,
          status: getCustomerStatus({
            firstSaleAt,
            lastSaleAt,
            range,
          }),
          segment: getCustomerSegment(purchases),
          ltv,
          purchases,
          purchasesInPeriod: Number(stats.purchasesInPeriod || 0),
          revenueInPeriod: Number(stats.revenueInPeriod || 0),
          interval: averageIntervalDays(firstSaleAt, lastSaleAt, purchases),
          avgCheck:
            purchases > 0
              ? Number((ltv / purchases).toFixed(2))
              : 0,
          firstSaleAt,
          lastOrder: lastSaleAt,
          cashback: 0,
        };
      });

      const customers = rows.length;

      const active = rows.filter((row) =>
        isCustomerActive(row.lastOrder, range)
      ).length;

      const topLtv = rows.reduce(
        (max, row) => Math.max(max, Number(row.ltv || 0)),
        0
      );

      const totalRevenue = rows.reduce(
        (sum, row) => sum + Number(row.ltv || 0),
        0
      );

      const totalPurchases = rows.reduce(
        (sum, row) => sum + Number(row.purchases || 0),
        0
      );

      const averageCheck =
        totalPurchases > 0
          ? Number((totalRevenue / totalPurchases).toFixed(2))
          : 0;

      let languages = emptyLanguageStats();
      if (telegramIds.length > 0) {
        const languageUsers = await User.find({
          telegramId: { $in: telegramIds },
        })
          .select({ language: 1 })
          .lean();
        languages = languageStatsFromUsers(languageUsers);
      }

      if (statusFilter === "favorites") {
        rows = rows.filter((row) => row.isFavorite);
      } else if (statusFilter !== "all") {
        rows = rows.filter((row) => row.status === statusFilter);
      }

      // Enrich identity/cashback before sort when those columns are active.
      if (
        (sortKey === "cashback" || sortKey === "name") &&
        rows.length > 0
      ) {
        const sortUsers = await User.find({
          telegramId: { $in: rows.map((row) => row.telegramId) },
        })
          .select({
            telegramId: 1,
            username: 1,
            firstName: 1,
            lastName: 1,
            cashbackBalance: 1,
          })
          .lean();

        const userById = new Map(
          sortUsers.map((user) => [
            String(user?.telegramId || "").trim(),
            user,
          ])
        );

        for (const row of rows) {
          const user = userById.get(row.telegramId);
          if (!user) continue;

          if (sortKey === "cashback") {
            row.cashback = Number(user?.cashbackBalance || 0);
          }

          if (sortKey === "name") {
            const name = [user?.firstName || "", user?.lastName || ""]
              .filter(Boolean)
              .join(" ")
              .trim();
            const username = String(user?.username || "")
              .trim()
              .replace(/^@+/, "");
            row.name =
              name || (username ? `@${username}` : row.telegramId);
            row.username = username;
            row.handle = username ? `@${username}` : row.telegramId;
          }
        }
      }

      if (sortKey) {
        rows = sortRows(rows, sortKey, sortDirection, {
          name: (row) => row.name || row.handle || row.telegramId || "",
          status: (row) => row.status || "",
          segment: (row) => row.segment || "",
          lastOrder: (row) => row.lastOrder || null,
          interval: (row) => Number(row.interval || 0),
          ltv: (row) => Number(row.ltv || 0),
          purchases: (row) => Number(row.purchases || 0),
          avgCheck: (row) => Number(row.avgCheck || 0),
          cashback: (row) => Number(row.cashback || 0),
        });
      } else {
        rows.sort((a, b) => {
          if (a.isFavorite !== b.isFavorite) {
            return a.isFavorite ? -1 : 1;
          }

          const aDate = a.lastOrder
            ? new Date(a.lastOrder).getTime()
            : 0;
          const bDate = b.lastOrder
            ? new Date(b.lastOrder).getTime()
            : 0;

          return bDate - aDate;
        });
      }

      const total = rows.length;
      const pageCount = Math.max(1, Math.ceil(total / limit));
      const safePage = Math.min(page, pageCount);
      const start = (safePage - 1) * limit;
      const pageRowsRaw = rows.slice(start, start + limit);

      const pageUsers =
        pageRowsRaw.length > 0
          ? await User.find({
              telegramId: {
                $in: pageRowsRaw.map((row) => row.telegramId),
              },
            })
              .select({
                telegramId: 1,
                username: 1,
                firstName: 1,
                lastName: 1,
                cashbackBalance: 1,
              })
              .lean()
          : [];

      const userByTelegramId = new Map(
        pageUsers.map((user) => [
          String(user?.telegramId || "").trim(),
          user,
        ])
      );

      const pageRows = pageRowsRaw.map((row) => {
        const user = userByTelegramId.get(row.telegramId);
        const name = [user?.firstName || "", user?.lastName || ""]
          .filter(Boolean)
          .join(" ")
          .trim();
        const username = String(user?.username || "")
          .trim()
          .replace(/^@+/, "");

        return {
          ...row,
          name: name || (username ? `@${username}` : row.telegramId),
          username,
          handle: username ? `@${username}` : row.telegramId,
          cashback: Number(user?.cashbackBalance || row.cashback || 0),
        };
      });

      return res.json({
        ok: true,
        period: {
          key: range.key,
          from: range.from,
          to: range.to,
        },
        summary: {
          customers,
          active,
          topLtv,
          averageCheck,
          languages,
        },
        rows: pageRows,
        pagination: {
          page: safePage,
          limit,
          total,
          pageCount,
        },
      });
    } catch (error) {
      console.error("GET /crm/customers error:", error);

      if (String(error?.message || "") === "INVALID_CUSTOM_PERIOD") {
        return res.status(400).json({
          ok: false,
          error: "INVALID_CUSTOM_PERIOD",
        });
      }

      return res.status(500).json({
        ok: false,
        error: "CUSTOMERS_LOAD_FAILED",
      });
    }
  }
);

router.get("/customers/export", async (req, res) => {
  try {
    const {
      buildUsersExportRows,
      sendUsersExportCsvResponse,
      sendTeggerUsersExportCsvResponse,
    } = await import("../../lib/usersExport.js");

    const rows = await buildUsersExportRows();
    const format = String(req.query?.format || "")
      .trim()
      .toLowerCase();

    if (format === "tegger") {
      return sendTeggerUsersExportCsvResponse(res, rows);
    }

    return sendUsersExportCsvResponse(res, rows);
  } catch (error) {
    console.error("GET /crm/customers/export error:", error);

    return res.status(500).json({
      ok: false,
      error: "USERS_EXPORT_FAILED",
    });
  }
});

router.patch(
  "/customers/:telegramId/favorite",
  requireCrmPushAdmin,
  express.json(),
  async (req, res) => {
    try {
      const telegramId = String(req.params?.telegramId || "").trim();

      if (!telegramId) {
        return res.status(400).json({
          ok: false,
          error: "TELEGRAM_ID_REQUIRED",
        });
      }

      const userExists = await User.exists({ telegramId });

      if (!userExists) {
        return res.status(404).json({
          ok: false,
          error: "CUSTOMER_NOT_FOUND",
        });
      }

      const isFavorite = req.body?.isFavorite === true;
      const now = new Date();

      await mongoose.connection
        .collection(CRM_FAVORITE_CUSTOMERS_COLLECTION)
        .updateOne(
          { telegramId },
          {
            $set: {
              telegramId,
              isFavorite,
              updatedAt: now,
            },
            $setOnInsert: {
              createdAt: now,
            },
          },
          { upsert: true }
        );

      return res.json({
        ok: true,
        telegramId,
        isFavorite,
      });
    } catch (error) {
      console.error(
        "PATCH /crm/customers/:telegramId/favorite error:",
        error
      );

      return res.status(500).json({
        ok: false,
        error: "CUSTOMER_FAVORITE_UPDATE_FAILED",
      });
    }
  }
);

export default router;
