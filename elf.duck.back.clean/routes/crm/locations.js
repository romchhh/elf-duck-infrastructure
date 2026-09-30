import express from "express";
import {
  buildLocationPerformance,
  getPeriodRange,
  loadSales,
  loadSalesHistory,
  loadCanceledOrders,
} from "./deps.js";

const router = express.Router();

router.get(
  "/locations",
  async (req, res) => {
    try {
      const range =
        getPeriodRange(
          req.query?.period || "month",
          req.query?.from || "",
          req.query?.to || ""
        );

      const hasComparison =
        Boolean(
          range.previousFrom &&
          range.previousTo
        );

      const [
        currentOrders,
        previousOrders,
        salesHistory,
        currentCanceledOrders,
        previousCanceledOrders,
      ] = await Promise.all([
        loadSales(
          range.from,
          range.to
        ),

        hasComparison
          ? loadSales(
              range.previousFrom,
              range.previousTo
            )
          : Promise.resolve([]),

        loadSalesHistory(
          range.to
        ),

        loadCanceledOrders(
          range.from,
          range.to
        ),

        hasComparison
          ? loadCanceledOrders(
              range.previousFrom,
              range.previousTo
            )
          : Promise.resolve([]),
      ]);

      const performance =
        await buildLocationPerformance({
          currentOrders,
          previousOrders,
          salesHistory,
          currentCanceledOrders,
          previousCanceledOrders,
          hasComparison,
        });

      return res.json({
        ok: true,

        period: {
          key: range.key,
          from: range.from,
          to: range.to,
          previousFrom:
            range.previousFrom,
          previousTo:
            range.previousTo,
        },

        rows:
          Array.isArray(
            performance?.rows
          )
            ? performance.rows
            : [],
      });
    } catch (error) {
      console.error(
        "GET /crm/locations error:",
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
            "LOCATIONS_LOAD_FAILED",
        });
    }
  }
);

export default router;
