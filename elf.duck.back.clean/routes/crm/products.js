import express from "express";
import {
  buildProductPerformance,
  getPeriodRange,
  loadSales,
  loadSalesHistory,
} from "./deps.js";

const router = express.Router();

router.get(
  "/products",
  async (req, res) => {
    try {
      const range =
        getPeriodRange(
          req.query?.period || "month",
          req.query?.from || "",
          req.query?.to || ""
        );

      const page =
        Math.max(
          1,
          Number.parseInt(
            req.query?.page,
            10
          ) || 1
        );

      const limit =
        Math.min(
          100,
          Math.max(
            1,
            Number.parseInt(
              req.query?.limit,
              10
            ) || 10
          )
        );

      const segment = String(
        req.query?.segment || "all"
      )
        .trim()
        .toLowerCase();

      const hasComparison =
        Boolean(
          range.previousFrom &&
          range.previousTo
        );

      const [
        currentOrders,
        previousOrders,
        salesHistory,
      ] =
        await Promise.all([
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
        ]);

      const productPerformance =
        await buildProductPerformance({
          currentOrders,
          previousOrders,
          salesHistory,
          range,
          hasComparison,
        });

      let rows =
        Array.isArray(
          productPerformance?.rows
        )
          ? productPerformance.rows
          : [];

      if (segment === "bestsellers") {
        rows = rows.filter((row) =>
          hasComparison
            ? Number(row?.trend || 0) > 20
            : Number(row?.sold || 0) > 0
        );

        if (!hasComparison) {
          rows.sort(
            (a, b) =>
              Number(b?.sold || 0) -
              Number(a?.sold || 0)
          );
        }
      } else if (segment === "slow") {
        rows = hasComparison
          ? rows.filter(
              (row) =>
                Number(row?.trend || 0) < 0
            )
          : rows.filter(
              (row) => Number(row?.sold || 0) === 0
            );
      }

      const revenue =
        Number(
          rows
            .reduce(
              (sum, row) =>
                sum +
                Number(
                  row?.revenue || 0
                ),
              0
            )
            .toFixed(2)
        );

      const sold =
        rows.reduce(
          (sum, row) =>
            sum +
            Number(
              row?.sold || 0
            ),
          0
        );

      const bestsellers =
        hasComparison
          ? rows.filter(
              (row) =>
                Number(
                  row?.trend || 0
                ) > 20
            ).length
          : 0;

      const slow =
        hasComparison
          ? rows.filter(
              (row) =>
                Number(
                  row?.trend || 0
                ) < 0
            ).length
          : 0;

      const ending =
        rows.filter(
          (row) =>
            row?.days !== null &&
            row?.days !== undefined &&
            Number(row.days) <= 2
        ).length;

      const stockValue =
        Number(
          rows
            .reduce(
              (sum, row) =>
                sum +
                Number(
                  row?.stockValue || 0
                ),
              0
            )
            .toFixed(2)
        );

      const total =
        rows.length;

      const pageCount =
        Math.max(
          1,
          Math.ceil(
            total / limit
          )
        );

      const safePage =
        Math.min(
          page,
          pageCount
        );

      const start =
        (safePage - 1) *
        limit;

      const pageRows =
        rows.slice(
          start,
          start + limit
        );

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

        summary: {
          sold,
          bestsellers,
          slow,
        },

        segment,

        rows:
          pageRows,

        pagination: {
          page:
            safePage,

          limit,

          total,

          pageCount,
        },
      });
    } catch (error) {
      console.error(
        "GET /crm/products error:",
        error
      );

      if (
        String(
          error?.message ||
            ""
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
            "PRODUCTS_LOAD_FAILED",
        });
    }
  }
);

export default router;
