import express from "express";
import {
  getCustomerStatus,
  isCustomerActive,
  getCustomerSegment,
  getAveragePurchaseIntervalDays,
  CRM_FAVORITE_CUSTOMERS_COLLECTION,
  requireCrmPushAdmin,
  getPeriodRange,
  mongoose,
  User,
} from "./deps.js";
import { buildCustomerSalesStats } from "../../lib/crm/sales.js";

const router = express.Router();

router.get(
  "/customers",
  async (req, res) => {
    try {
      const range = getPeriodRange(
        req.query?.period || "month",
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
        .toLowerCase();

      const sortKey = String(req.query?.sortKey || "").trim();

      const sortDirection =
        String(req.query?.sortDirection || "desc").toLowerCase() ===
        "asc"
          ? "asc"
          : "desc";

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

      const salesByCustomer = await buildCustomerSalesStats(
        range.to,
        {
          from: range.from,
          ...(onlyFavorites && favoriteCustomerIds.size > 0
            ? {
                telegramIds: Array.from(favoriteCustomerIds),
              }
            : {}),
        }
      );

      const telegramIds = onlyFavorites
        ? Array.from(favoriteCustomerIds).filter((telegramId) =>
            salesByCustomer.has(telegramId)
          )
        : Array.from(salesByCustomer.keys());

      const users =
        telegramIds.length > 0
          ? await User.find({
              telegramId: { $in: telegramIds },
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
        users.map((user) => [
          String(user?.telegramId || "").trim(),
          user,
        ])
      );

      let rows = telegramIds.map((telegramId) => {
        const stats = salesByCustomer.get(telegramId) || {
          ltv: 0,
          purchases: 0,
          firstSaleAt: null,
          lastSaleAt: null,
          saleDates: [],
          revenueInPeriod: 0,
          purchasesInPeriod: 0,
        };

        const firstSaleAt = stats.firstSaleAt || null;
        const lastSaleAt = stats.lastSaleAt || null;
        const purchases = Number(stats.purchases || 0);
        const ltv = Number(stats.ltv || 0);

        const avgCheck =
          purchases > 0
            ? Number((ltv / purchases).toFixed(2))
            : 0;

        const interval = getAveragePurchaseIntervalDays(
          stats.saleDates || []
        );

        const user = userByTelegramId.get(telegramId);

        const name = [user?.firstName || "", user?.lastName || ""]
          .filter(Boolean)
          .join(" ")
          .trim();

        const username = String(user?.username || "")
          .trim()
          .replace(/^@+/, "");

        const status = getCustomerStatus({
          firstSaleAt,
          lastSaleAt,
          range,
        });

        return {
          id: telegramId,
          telegramId,
          isFavorite: favoriteCustomerIds.has(telegramId),
          name: name || (username ? `@${username}` : telegramId),
          username,
          handle: username ? `@${username}` : telegramId,
          status,
          segment: getCustomerSegment(purchases),
          ltv,
          purchases,
          purchasesInPeriod: Number(stats.purchasesInPeriod || 0),
          revenueInPeriod: Number(stats.revenueInPeriod || 0),
          interval,
          avgCheck,
          firstSaleAt,
          lastOrder: lastSaleAt,
          cashback: Number(user?.cashbackBalance || 0),
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

      if (statusFilter === "favorites") {
        rows = rows.filter((row) => row.isFavorite);
      } else if (statusFilter !== "all") {
        rows = rows.filter((row) => row.status === statusFilter);
      }

      if (search) {
        rows = rows.filter((row) => {
          const haystack = [
            row.name,
            row.username,
            row.handle,
            row.telegramId,
          ]
            .join(" ")
            .toLowerCase();

          return haystack.includes(search);
        });
      }

      const sortableCustomerKeys = new Set([
        "ltv",
        "purchases",
        "avgCheck",
        "cashback",
      ]);

      if (sortableCustomerKeys.has(sortKey)) {
        rows.sort((a, b) => {
          const left = Number(a?.[sortKey] || 0);
          const right = Number(b?.[sortKey] || 0);
          return sortDirection === "asc" ? left - right : right - left;
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
      const pageRows = rows.slice(start, start + limit);

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
    } = await import("../../lib/usersExport.js");

    const rows = await buildUsersExportRows();
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
