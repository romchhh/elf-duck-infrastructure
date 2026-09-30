import express from "express";
import {
  getPeriodRange,
  loadSales,
} from "./deps.js";

const router = express.Router();

router.get(
  "/debug-revenue-gap",
  async (req, res) => {
    try {
      const range =
        getPeriodRange(
          req.query?.period || "month",
          req.query?.from || "",
          req.query?.to || ""
        );

      const orders =
        await loadSales(
          range.from,
          range.to
        );

      const byDelivery =
        new Map();

      const mismatches = [];

      let dashboardRevenue = 0;
      let productsGrossRevenue = 0;

      for (const order of orders) {
        const totalZl =
          Number(
            order?.totalZl || 0
          );

        let productsTotal = 0;

        for (
          const item of
          order?.items || []
        ) {
          for (
            const flavor of
            item?.flavors || []
          ) {
            const qty =
              Number(
                flavor?.qty || 0
              );

            const unitPrice =
              Number(
                flavor?.unitPrice || 0
              );

            productsTotal +=
              qty * unitPrice;
          }
        }

        const delta =
          Number(
            (
              totalZl -
              productsTotal
            ).toFixed(2)
          );

        dashboardRevenue +=
          totalZl;

        productsGrossRevenue +=
          productsTotal;

        let delivery =
          "other";

        if (
          order?.deliveryType ===
          "pickup"
        ) {
          delivery =
            "pickup";
        } else if (
          order?.deliveryMethod ===
          "courier"
        ) {
          delivery =
            "courier";
        } else if (
          order?.deliveryMethod ===
          "inpost"
        ) {
          delivery =
            "inpost";
        }

        if (
          !byDelivery.has(
            delivery
          )
        ) {
          byDelivery.set(
            delivery,
            {
              orders: 0,
              totalZl: 0,
              productsTotal: 0,
              delta: 0,
            }
          );
        }

        const group =
          byDelivery.get(
            delivery
          );

        group.orders += 1;
        group.totalZl += totalZl;
        group.productsTotal +=
          productsTotal;
        group.delta += delta;

        if (
          Math.abs(delta) >= 0.01
        ) {
          mismatches.push({
            id: String(
              order?._id || ""
            ),

            deliveryType:
              order?.deliveryType || "",

            deliveryMethod:
              order?.deliveryMethod || "",

            totalZl:
              Number(
                totalZl.toFixed(2)
              ),

            productsTotal:
              Number(
                productsTotal.toFixed(2)
              ),

            delta,
          });
        }
      }

      const deliveryBreakdown =
        Object.fromEntries(
          Array.from(
            byDelivery.entries()
          ).map(
            ([key, value]) => [
              key,
              {
                orders:
                  value.orders,

                totalZl:
                  Number(
                    value.totalZl.toFixed(2)
                  ),

                productsTotal:
                  Number(
                    value.productsTotal.toFixed(2)
                  ),

                delta:
                  Number(
                    value.delta.toFixed(2)
                  ),
              },
            ]
          )
        );

      mismatches.sort(
        (a, b) =>
          Math.abs(b.delta) -
          Math.abs(a.delta)
      );

      return res.json({
        ok: true,

        period: {
          key: range.key,
          from: range.from,
          to: range.to,
        },

        totals: {
          orders:
            orders.length,

          dashboardRevenue:
            Number(
              dashboardRevenue.toFixed(2)
            ),

          productsGrossRevenue:
            Number(
              productsGrossRevenue.toFixed(2)
            ),

          gap:
            Number(
              (
                dashboardRevenue -
                productsGrossRevenue
              ).toFixed(2)
            ),
        },

        byDelivery:
          deliveryBreakdown,

        mismatchCount:
          mismatches.length,

        topMismatches:
          mismatches.slice(
            0,
            30
          ),
      });
    } catch (error) {
      console.error(
        "GET /crm/debug-revenue-gap error:",
        error
      );

      return res
        .status(500)
        .json({
          ok: false,
          error:
            "DEBUG_REVENUE_GAP_FAILED",
        });
    }
  }
);

export default router;
