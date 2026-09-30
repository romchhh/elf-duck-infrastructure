import express from "express";
import {
  getPeriodRange,
  loadSales,
  loadCanceledCount,
  getCrmOrderStatus,
  getCrmPaymentLabel,
  getCrmDeliveryLabel,
  getCrmItemsLabel,
  PickupPoint,
  User,
  fetchCrmOrdersPage,
} from "./deps.js";

const router = express.Router();

router.get(
  "/orders",
  async (req, res) => {
    try {
      const range =
        getPeriodRange(
          req.query?.period ||
            "month",

          req.query?.from || "",

          req.query?.to || ""
        );

      const page = Math.max(
        1,
        Number.parseInt(
          req.query?.page,
          10
        ) || 1
      );

      const limit = Math.min(
        100,
        Math.max(
          1,
          Number.parseInt(
            req.query?.limit,
            10
          ) || 50
        )
      );

      const search = String(
        req.query?.search || ""
      )
        .trim()
        .toLowerCase();

     const completedSalesPromise =
        loadSales(
            range.from,
            range.to
        );

        const canceledCountPromise =
        loadCanceledCount(
            range.from,
            range.to
        );

      const [
        pageResult,
        completedSales,
        canceledCount,
      ] = await Promise.all([
        fetchCrmOrdersPage({
          range,
          page,
          limit,
          search,
        }),
        completedSalesPromise,
        canceledCountPromise,
      ]);

      const orders = pageResult.orders;

      const telegramIds = Array.from(
        new Set(
          orders
            .map((order) =>
              String(order?.userTelegramId || "").trim()
            )
            .filter(Boolean)
        )
      );

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
              })
              .lean()
          : [];

      const userByTelegramId = new Map(
        users.map((user) => [
          String(user?.telegramId || ""),
          user,
        ])
      );

      const pickupPointIds = Array.from(
        new Set(
          orders
            .map((order) =>
              String(order?.pickupPointId || "")
            )
            .filter(Boolean)
        )
      );

      const pickupPoints =
        pickupPointIds.length > 0
          ? await PickupPoint.find({
              _id: { $in: pickupPointIds },
            })
              .select({
                title: 1,
                address: 1,
                key: 1,
              })
              .lean()
          : [];

      const pickupById = new Map(
        pickupPoints.map((point) => [
          String(point._id),
          String(
            point?.title ||
              point?.address ||
              point?.key ||
              "Самовывоз"
          ),
        ])
      );

      const pageRows = orders.map((order) => {
        const telegramId = String(order?.userTelegramId || "");
        const user = userByTelegramId.get(telegramId);

        const fullName = [user?.firstName || "", user?.lastName || ""]
          .filter(Boolean)
          .join(" ")
          .trim();

        const username = String(user?.username || "").trim();

        const customer =
          fullName ||
          (username ? `@${username}` : telegramId);

        const items = getCrmItemsLabel(order?.items || []);

        let location = "—";

        if (order?.deliveryType === "pickup") {
          location =
            pickupById.get(String(order?.pickupPointId || "")) ||
            "Самовывоз";
        } else if (order?.deliveryMethod === "courier") {
          location = order?.courierDistrict || "Доставка — Варшава";
        } else if (order?.deliveryMethod === "inpost") {
          location = "InPost / Польша";
        }

        return {
          id: String(order?._id || ""),
          orderNo: String(order?.orderNo || ""),
          customer,
          username,
          telegramId,
          date: order?.crmOrderDate,
          items,
          amount: Number(order?.totalZl || 0),
          payment: getCrmPaymentLabel(order?.payment?.method),
          delivery: getCrmDeliveryLabel(order),
          location,
          status: getCrmOrderStatus(order?.status),
          rawStatus: String(order?.status || ""),
        };
      });

        const completedSalesCount =
        completedSales.length;

        const revenue = Number(
        completedSales
            .reduce(
            (sum, order) =>
                sum +
                Number(
                order?.totalZl || 0
                ),
            0
            )
            .toFixed(2)
        );

        const averageCheck =
        completedSalesCount > 0
            ? Number(
                (
                revenue /
                completedSalesCount
                ).toFixed(2)
            )
            : 0;

        const finalOrders =
        completedSalesCount +
        Number(canceledCount || 0);

        const cancellationsPercent =
        finalOrders > 0
            ? Number(
                (
                (
                    Number(
                    canceledCount || 0
                    ) /
                    finalOrders
                ) *
                100
                ).toFixed(1)
            )
            : 0;

      return res.json({
        ok: true,

        period: {
          key: range.key,
          from: range.from,
          to: range.to,
        },

        summary: {
          orders: completedSalesCount,

          revenue,

          averageCheck,

          cancellationsPercent,
        },

        rows: pageRows,

        pagination: pageResult.pagination,
      });
    } catch (error) {
      console.error(
        "GET /crm/orders error:",
        error
      );

      if (
        String(
          error?.message || ""
        ) ===
        "INVALID_CUSTOM_PERIOD"
      ) {
        return res
          .status(400)
          .json({
            ok: false,
            error:
              "INVALID_CUSTOM_PERIOD",
          });
      }

      return res
        .status(500)
        .json({
          ok: false,
          error:
            "ORDERS_LOAD_FAILED",
        });
    }
  }
);

export default router;
