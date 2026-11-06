import express from "express";
import CustomerReview from "../../models/CustomerReview.js";
import { getPeriodRange } from "./deps.js";

const router = express.Router();

router.get("/reviews", async (req, res) => {
  try {
    const range = getPeriodRange(
      req.query?.period || "month",
      req.query?.from || "",
      req.query?.to || ""
    );

    const page = Math.max(1, Number.parseInt(req.query?.page, 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(req.query?.limit, 10) || 50)
    );
    const search = String(req.query?.search || "")
      .trim()
      .toLowerCase();

    const match = {
      createdAt: {
        $gte: range.from,
        $lt: range.to,
      },
    };

    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "i");
      match.$or = [
        { text: regex },
        { username: regex },
        { firstName: regex },
        { lastName: regex },
        { orderNo: regex },
        { telegramId: regex },
        { pointTitle: regex },
        { deliveryLabel: regex },
      ];
    }

    const [total, rows, totalsAgg] = await Promise.all([
      CustomerReview.countDocuments(match),
      CustomerReview.find(match)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      CustomerReview.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            withOrder: {
              $sum: {
                $cond: [{ $ne: ["$orderNo", ""] }, 1, 0],
              },
            },
            withImages: {
              $sum: {
                $cond: [{ $gt: ["$imageCount", 0] }, 1, 0],
              },
            },
          },
        },
      ]),
    ]);

    const stats = totalsAgg[0] || {
      total: 0,
      withOrder: 0,
      withImages: 0,
    };

    return res.json({
      ok: true,
      stats: {
        total: Number(stats.total || 0),
        withOrder: Number(stats.withOrder || 0),
        withImages: Number(stats.withImages || 0),
      },
      rows: rows.map((row) => ({
        id: String(row._id),
        createdAt: row.createdAt,
        telegramId: String(row.telegramId || ""),
        username: String(row.username || ""),
        firstName: String(row.firstName || ""),
        lastName: String(row.lastName || ""),
        text: String(row.text || ""),
        orderId: row.orderId ? String(row.orderId) : "",
        orderNo: String(row.orderNo || ""),
        pointTitle: String(row.pointTitle || ""),
        pointAddress: String(row.pointAddress || ""),
        deliveryLabel: String(row.deliveryLabel || ""),
        source: String(row.source || ""),
        imageUrls: Array.isArray(row.imageUrls) ? row.imageUrls : [],
        imageCount: Number(row.imageCount || 0),
        telegramSent: Boolean(row.telegramSent),
      })),
      pagination: {
        page,
        limit,
        total,
        pageCount: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    console.error("GET /crm/reviews error:", error);
    return res.status(500).json({
      ok: false,
      error: "REVIEWS_LOAD_FAILED",
    });
  }
});

export default router;
