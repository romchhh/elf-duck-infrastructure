import express from "express";
import mongoose from "mongoose";
import crypto from "crypto";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import Category from "../models/Category.js";
import PickupPoint from "../models/PickupPoint.js";
import User from "../models/User.js";
import BroadcastCampaign from "../models/BroadcastCampaign.js";

const router = express.Router();

const CRM_TIME_ZONE = "Europe/Warsaw";

const BROADCAST_TEMPLATES_COLLECTION = "broadcast_templates";

const CRM_FAVORITE_CUSTOMERS_COLLECTION =
  "crm_favorite_customers";

const CRM_SESSION_COOKIE = "elfduck_crm_session";
const CRM_SESSION_TTL_MS =
  12 * 60 * 60 * 1000;

  const CRM_PUSH_MEDIA_MAX_BYTES =
  10 * 1024 * 1024;

const CRM_PUSH_MEDIA_ALLOWED_TYPES =
  new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

function getCrmSessionSecret() {
  return String(
    process.env.CRM_SESSION_SECRET ||
      process.env.ADMIN_API_TOKEN ||
      ""
  ).trim();
}

function parseCookieHeader(
  header = ""
) {
  const result = {};

  for (
    const chunk of
    String(header || "").split(";")
  ) {
    const index =
      chunk.indexOf("=");

    if (index <= 0) {
      continue;
    }

    const key =
      chunk
        .slice(0, index)
        .trim();

    const value =
      chunk
        .slice(index + 1)
        .trim();

    if (!key) {
      continue;
    }

    result[key] =
      decodeURIComponent(value);
  }

  return result;
}

function signCrmSession(
  payload
) {
  const secret =
    getCrmSessionSecret();

  if (!secret) {
    return "";
  }

  const encoded =
    Buffer.from(
      JSON.stringify(payload),
      "utf8"
    ).toString(
      "base64url"
    );

  const signature =
    crypto
      .createHmac(
        "sha256",
        secret
      )
      .update(encoded)
      .digest(
        "base64url"
      );

  return `${encoded}.${signature}`;
}

function verifyCrmSessionToken(
  token
) {
  const secret =
    getCrmSessionSecret();

  if (
    !secret ||
    !token
  ) {
    return false;
  }

  const [
    encoded,
    signature,
  ] =
    String(token).split(".");

  if (
    !encoded ||
    !signature
  ) {
    return false;
  }

  const expectedSignature =
    crypto
      .createHmac(
        "sha256",
        secret
      )
      .update(encoded)
      .digest(
        "base64url"
      );

  const left =
    Buffer.from(signature);

  const right =
    Buffer.from(
      expectedSignature
    );

  if (
    left.length !==
      right.length ||
    !crypto.timingSafeEqual(
      left,
      right
    )
  ) {
    return false;
  }

  try {
    const payload =
      JSON.parse(
        Buffer.from(
          encoded,
          "base64url"
        ).toString(
          "utf8"
        )
      );

    return Boolean(
      payload?.exp &&
        Number(
          payload.exp
        ) >
          Date.now()
    );
  } catch {
    return false;
  }
}

function hasValidCrmSession(
  req
) {
  const headerToken = String(
    req.headers?.["x-crm-session"] || ""
  ).trim();

  if (
    headerToken &&
    verifyCrmSessionToken(headerToken)
  ) {
    return true;
  }

  const cookies =
    parseCookieHeader(
      req.headers?.cookie ||
        ""
    );

  return verifyCrmSessionToken(
    cookies[
      CRM_SESSION_COOKIE
    ]
  );
}

function requireCrmPushAdmin(
  req,
  res,
  next
) {
  if (
    hasValidCrmSession(
      req
    )
  ) {
    return next();
  }

  const expectedToken =
    String(
      process.env.ADMIN_API_TOKEN ||
        ""
    ).trim();

  const providedToken =
    String(
      req.headers?.[
        "x-admin-token"
      ] || ""
    ).trim();

  if (!expectedToken) {
    return res
      .status(503)
      .json({
        ok: false,
        error:
          "ADMIN_API_TOKEN_NOT_CONFIGURED",
      });
  }

  if (
    !providedToken ||
    providedToken !==
      expectedToken
  ) {
    return res
      .status(401)
      .json({
        ok: false,
        error:
          "UNAUTHORIZED",
      });
  }

  next();
}

router.post(
  "/auth/login",
  express.json(),
  (req, res) => {
    const expectedPassword =
      String(
        process.env
          .CRM_ADMIN_PASSWORD ||
          ""
      ).trim();

    const password =
      String(
        req.body?.password ||
          ""
      );

    if (
      !expectedPassword
    ) {
      return res
        .status(503)
        .json({
          ok: false,
          error:
            "CRM_ADMIN_PASSWORD_NOT_CONFIGURED",
        });
    }

    const left =
      Buffer.from(
        password
      );

    const right =
      Buffer.from(
        expectedPassword
      );

    const valid =
      left.length ===
        right.length &&
      crypto.timingSafeEqual(
        left,
        right
      );

    if (!valid) {
      return res
        .status(401)
        .json({
          ok: false,
          error:
            "INVALID_CRM_PASSWORD",
        });
    }

    const token =
      signCrmSession({
        exp:
          Date.now() +
          CRM_SESSION_TTL_MS,
      });

    if (!token) {
      return res
        .status(503)
        .json({
          ok: false,
          error:
            "CRM_SESSION_SECRET_NOT_CONFIGURED",
        });
    }

    res.cookie(
      CRM_SESSION_COOKIE,
      token,
      {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge:
          CRM_SESSION_TTL_MS,
        path: "/crm",
      }
    );

return res.json({

  ok: true,

  sessionToken: token,

  expiresInMs:

    CRM_SESSION_TTL_MS,

});
  }
);

router.post(
  "/auth/logout",
  (req, res) => {
    res.clearCookie(
      CRM_SESSION_COOKIE,
      {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        path: "/crm",
      }
    );

    return res.json({
      ok: true,
    });
  }
);

router.get(
  "/auth/session",
  (req, res) => {
    return res.json({
      ok: true,
      authenticated:
        hasValidCrmSession(
          req
        ),
    });
  }
);

router.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    return next();
  }

  const openPaths = new Set([
    "/auth/login",
    "/auth/logout",
    "/auth/session",
  ]);

  if (openPaths.has(req.path)) {
    return next();
  }

  return requireCrmPushAdmin(req, res, next);
});

router.post(
  "/push/upload-media",
  express.json({
    limit: "14mb",
  }),
  requireCrmPushAdmin,
  async (req, res) => {
    try {
      const dataUrl =
        String(
          req.body?.dataUrl || ""
        ).trim();

      const match =
        dataUrl.match(
          /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/
        );

      if (!match) {
        return res
          .status(400)
          .json({
            ok: false,
            error:
              "INVALID_PUSH_MEDIA",
          });
      }

      const contentType =
        match[1];

      if (
        !CRM_PUSH_MEDIA_ALLOWED_TYPES.has(
          contentType
        )
      ) {
        return res
          .status(400)
          .json({
            ok: false,
            error:
              "UNSUPPORTED_PUSH_MEDIA_TYPE",
          });
      }

      const buffer =
        Buffer.from(
          match[2].replace(
            /\s+/g,
            ""
          ),
          "base64"
        );

      if (
        buffer.length <= 0 ||
        buffer.length >
          CRM_PUSH_MEDIA_MAX_BYTES
      ) {
        return res
          .status(400)
          .json({
            ok: false,
            error:
              "PUSH_MEDIA_TOO_LARGE",
          });
      }

      const upload =
        req.app.locals
          .uploadCrmBroadcastPhoto;

      if (
        typeof upload !==
        "function"
      ) {
        return res
          .status(503)
          .json({
            ok: false,
            error:
              "CRM_BROADCAST_MEDIA_ENGINE_UNAVAILABLE",
          });
      }

      const result =
        await upload({
          buffer,
          contentType,
        });

      const fileId =
        String(
          result?.fileId || ""
        ).trim();

      if (!fileId) {
        throw new Error(
          "TELEGRAM_FILE_ID_MISSING"
        );
      }

      const photoPreviewUrl =
  String(
    result?.photoPreviewUrl ||
      ""
  ).trim();

return res.json({

  ok: true,

  fileId,

  photoPreviewUrl,

});
} catch (error) {
  console.error(
    "[CRM PUSH MEDIA] upload failed",
    error
  );

  return res
    .status(500)
    .json({
      ok: false,

      error:
        "PUSH_MEDIA_UPLOAD_FAILED",

      message:
        String(
          error?.response
            ?.description ||
            error?.message ||
            error ||
            "PUSH_MEDIA_UPLOAD_FAILED"
        ),
    });
}
  }
);

// ======================================================
// DATE / TIME HELPERS
// ======================================================

function getWarsawParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CRM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type) =>
    Number(parts.find((part) => part.type === type)?.value || 0);

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function getWarsawOffsetMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CRM_TIME_ZONE,
    timeZoneName: "longOffset",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const offsetText = String(
    parts.find((part) => part.type === "timeZoneName")?.value ||
      "GMT+00:00"
  );

  const match = offsetText.match(/GMT([+-])(\d{2}):(\d{2})/);

  if (!match) return 0;

  const sign = match[1] === "-" ? -1 : 1;

  return (
    sign *
    (Number(match[2]) * 60 + Number(match[3]))
  );
}

function warsawLocalToUtc({
  year,
  month,
  day,
  hour = 0,
  minute = 0,
  second = 0,
}) {
  const probe = new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      hour,
      minute,
      second
    )
  );

  const offsetMinutes =
    getWarsawOffsetMinutes(probe);

  return new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      hour,
      minute,
      second
    ) -
      offsetMinutes * 60 * 1000
  );
}

function addDays(date, days) {
  return new Date(
    date.getTime() +
      Number(days) * 24 * 60 * 60 * 1000
  );
}

function parseDateOnly(value) {
  const match = String(value || "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) return null;

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function shiftCalendarMonth(
  parts,
  deltaMonths
) {
  const anchor = new Date(
    Date.UTC(
      parts.year,
      parts.month - 1 + deltaMonths,
      1
    )
  );

  const year =
    anchor.getUTCFullYear();

  const month =
    anchor.getUTCMonth() + 1;

  const daysInMonth =
    new Date(
      Date.UTC(
        year,
        month,
        0
      )
    ).getUTCDate();

  return {
    year,
    month,
    day: Math.min(
      parts.day,
      daysInMonth
    ),
  };
}

// ======================================================
// PERIODS
// ======================================================

function getPeriodRange(
  period = "month",
  fromRaw = "",
  toRaw = ""
) {
  const now = new Date();
  const nowParts = getWarsawParts(now);

  // ------------------------------
  // CUSTOM PERIOD
  // ------------------------------

  if (fromRaw || toRaw) {
    if (!fromRaw || !toRaw) {
      throw new Error("INVALID_CUSTOM_PERIOD");
    }

    const fromParts = parseDateOnly(fromRaw);
    const toParts = parseDateOnly(toRaw);

    if (!fromParts || !toParts) {
      throw new Error("INVALID_CUSTOM_PERIOD");
    }

    const from =
      warsawLocalToUtc(fromParts);

    // "to" пользователя включительно
    const toDayStart =
      warsawLocalToUtc(toParts);

    const to =
      addDays(toDayStart, 1);

    if (to <= from) {
      throw new Error("INVALID_CUSTOM_PERIOD");
    }

    const previousFromParts =
    shiftCalendarMonth(
        fromParts,
        -1
    );

    const previousToParts =
    shiftCalendarMonth(
        toParts,
        -1
    );

    const previousFrom =
    warsawLocalToUtc(
        previousFromParts
    );

    const previousToDayStart =
    warsawLocalToUtc(
        previousToParts
    );

    const previousTo =
    addDays(
        previousToDayStart,
        1
    );

    return {
    key: "custom",
    from,
    to,
    previousFrom,
    previousTo,
    };
  }

  const todayStart = warsawLocalToUtc({
    year: nowParts.year,
    month: nowParts.month,
    day: nowParts.day,
  });

  const key = String(period || "month")
    .trim()
    .toLowerCase();

  // ------------------------------
  // TODAY
  // ------------------------------

  if (key === "today") {
    const elapsedMs =
      now.getTime() -
      todayStart.getTime();

    const previousFrom =
      addDays(todayStart, -1);

    return {
      key: "today",

      from: todayStart,
      to: now,

      previousFrom,

      previousTo: new Date(
        previousFrom.getTime() +
          elapsedMs
      ),
    };
  }

  // ------------------------------
  // CURRENT CALENDAR WEEK
  // Monday -> now
  // ------------------------------

  if (key === "week") {
    const weekday =
      new Intl.DateTimeFormat(
        "en-US",
        {
          timeZone: CRM_TIME_ZONE,
          weekday: "short",
        }
      ).format(now);

    const weekdayOffset =
      {
        Mon: 0,
        Tue: 1,
        Wed: 2,
        Thu: 3,
        Fri: 4,
        Sat: 5,
        Sun: 6,
      }[weekday] ?? 0;

    const from =
      addDays(
        todayStart,
        -weekdayOffset
      );

    return {
      key: "week",

      from,
      to: now,

      previousFrom:
        addDays(from, -7),

      previousTo:
        addDays(now, -7),
    };
  }

  // ------------------------------
  // LAST 90 DAYS
  // ------------------------------

  if (key === "3m") {
    const from =
      addDays(now, -90);

    return {
      key: "3m",

      from,
      to: now,

      previousFrom:
        addDays(from, -90),

      previousTo: from,
    };
  }

  // ------------------------------
  // LAST 180 DAYS
  // ------------------------------

  if (key === "6m") {
    const from =
      addDays(now, -180);

    return {
      key: "6m",

      from,
      to: now,

      previousFrom:
        addDays(from, -180),

      previousTo: from,
    };
  }

  // ------------------------------
  // ALL TIME
  // ------------------------------

  if (key === "all") {
    return {
      key: "all",

      from:
        new Date(
          "2000-01-01T00:00:00.000Z"
        ),

      to: now,

      previousFrom: null,
      previousTo: null,
    };
  }

  // ------------------------------
  // CURRENT CALENDAR MONTH
  // 1st -> now
  // ------------------------------

  const from =
    warsawLocalToUtc({
      year: nowParts.year,
      month: nowParts.month,
      day: 1,
    });

  // предыдущий месяц
  const previousMonthAnchor =
    new Date(
      Date.UTC(
        nowParts.year,
        nowParts.month - 2,
        1
      )
    );

  const previousYear =
    previousMonthAnchor
      .getUTCFullYear();

  const previousMonth =
    previousMonthAnchor
      .getUTCMonth() + 1;

  const previousFrom =
    warsawLocalToUtc({
      year: previousYear,
      month: previousMonth,
      day: 1,
    });

  /*
   * Сравниваем одинаковую часть месяца.
   *
   * Например:
   *
   * 1 сентября -> 2 сентября 20:00
   *
   * против
   *
   * 1 августа -> 2 августа 20:00
   */

  const daysInPreviousMonth =
    new Date(
      Date.UTC(
        previousYear,
        previousMonth,
        0
      )
    ).getUTCDate();

  const comparisonDay =
    Math.min(
      nowParts.day,
      daysInPreviousMonth
    );

  const previousTo =
    warsawLocalToUtc({
      year: previousYear,
      month: previousMonth,
      day: comparisonDay,
      hour: nowParts.hour,
      minute: nowParts.minute,
      second: nowParts.second,
    });

  return {
    key: "month",

    from,
    to: now,

    previousFrom,
    previousTo,
  };
}

// ======================================================
// ORDER CONDITIONS
// ======================================================

function getCompletedOrderMatch() {
  return {
    $or: [
      // Самовывоз
      {
        deliveryType: "pickup",
        status: "completed",
        completedAt: {
          $type: "date",
        },
      },

      // Курьер
      {
        deliveryType: "delivery",
        deliveryMethod: "courier",
        status: "completed",
        completedAt: {
          $type: "date",
        },
      },

      // InPost
      {
        deliveryType: "delivery",
        deliveryMethod: "inpost",
        status: "shipped",
        shippedAt: {
          $type: "date",
        },
      },
    ],
  };
}

function getSaleDateExpression() {
  return {
    $cond: [
      {
        $and: [
          {
            $eq: [
              "$deliveryType",
              "delivery",
            ],
          },
          {
            $eq: [
              "$deliveryMethod",
              "inpost",
            ],
          },
          {
            $eq: [
              "$status",
              "shipped",
            ],
          },
        ],
      },

      "$shippedAt",

      "$completedAt",
    ],
  };
}

// ======================================================
// ANALYTICS
// ======================================================

async function loadSales(
  from,
  to
) {
  return Order.aggregate([
    {
      $match:
        getCompletedOrderMatch(),
    },

    {
      $addFields: {
        crmSaleDate:
          getSaleDateExpression(),
      },
    },

    {
      $match: {
        crmSaleDate: {
          $gte: from,
          $lt: to,
        },
      },
    },

    {
        $project: {
            userTelegramId: 1,
            totalZl: 1,
            crmSaleDate: 1,
            items: 1,
            deliveryType: 1,
            deliveryMethod: 1,
            pickupPointId: 1,
        },
    },
  ]);
}

async function loadSalesHistory(to) {
  return Order.aggregate([
    {
      $match:
        getCompletedOrderMatch(),
    },

    {
      $addFields: {
        crmSaleDate:
          getSaleDateExpression(),
      },
    },

    {
      $match: {
        crmSaleDate: {
          $lt: to,
        },
      },
    },

    {
    $project: {
        userTelegramId: 1,
        totalZl: 1,
        crmSaleDate: 1,
        items: 1,
        deliveryType: 1,
        deliveryMethod: 1,
        pickupPointId: 1,
    },
    },

    {
      $sort: {
        userTelegramId: 1,
        crmSaleDate: 1,
      },
    },
  ]);
}

const PUSH_ATTRIBUTION_WINDOW_DAYS = 7;

function getPushAttributionWindowEnd(
  startedAt,
  now = new Date()
) {
  const start = new Date(startedAt);

  if (Number.isNaN(start.getTime())) {
    return now;
  }

  const windowEnd =
    new Date(
      start.getTime() +
        PUSH_ATTRIBUTION_WINDOW_DAYS *
          24 *
          60 *
          60 *
          1000
    );

  return windowEnd < now
    ? windowEnd
    : now;
}

async function buildPushCampaignAnalytics(
  campaigns = []
) {
  if (
    !Array.isArray(campaigns) ||
    campaigns.length === 0
  ) {
    return new Map();
  }

  /*
   * result содержит только те кампании,
   * аналитику которых запросил caller.
   *
   * Для last-touch ниже мы отдельно
   * загрузим соседние кампании из Mongo.
   */
  const result = new Map(
    campaigns.map((campaign) => [
      String(campaign?._id || ""),
      {
        purchases: 0,
        buyers: new Set(),
        revenue: 0,
      },
    ])
  );

  /*
   * Определяем временные границы
   * отображаемых кампаний.
   */
  const displayedCampaigns =
    campaigns
      .map((campaign) => {
        const startedAt = new Date(
          campaign?.startedAt ||
            campaign?.createdAt ||
            ""
        );

        return {
          id: String(
            campaign?._id || ""
          ),
          startedAt,
        };
      })
      .filter(
        (campaign) =>
          campaign.id &&
          !Number.isNaN(
            campaign.startedAt.getTime()
          )
      )
      .sort(
        (a, b) =>
          a.startedAt.getTime() -
          b.startedAt.getTime()
      );

  if (
    displayedCampaigns.length === 0
  ) {
    for (
      const analytics of
      result.values()
    ) {
      analytics.buyers = 0;
      analytics.conversion = 0;
    }

    return result;
  }

  const earliestDisplayedStartedAt =
    displayedCampaigns[0].startedAt;

  /*
   * Максимальный конец attribution
   * window среди отображаемых кампаний.
   *
   * getPushAttributionWindowEnd()
   * дополнительно ограничивает окно
   * текущим временем.
   */
  const latestWindowEnd =
    displayedCampaigns.reduce(
      (latest, campaign) => {
        const end =
          getPushAttributionWindowEnd(
            campaign.startedAt
          );

        return end > latest
          ? end
          : latest;
      },
      earliestDisplayedStartedAt
    );

  /*
   * Загружаем также кампании,
   * которые могли начаться до
   * выбранного frontend-периода.
   *
   * Это необходимо для корректного
   * last-touch на границе периодов.
   */
  const campaignLookupFrom =
    new Date(
      earliestDisplayedStartedAt.getTime() -
        PUSH_ATTRIBUTION_WINDOW_DAYS *
          24 *
          60 *
          60 *
          1000
    );

  const relevantCampaignRows =
    await BroadcastCampaign.find({
      $or: [
        {
          startedAt: {
            $gte: campaignLookupFrom,
            $lt: latestWindowEnd,
          },
        },
        {
          startedAt: null,
          createdAt: {
            $gte: campaignLookupFrom,
            $lt: latestWindowEnd,
          },
        },
      ],
    })
      .select({
        _id: 1,
        startedAt: 1,
        createdAt: 1,
        sentTelegramIds: 1,
      })
      .lean();

  /*
   * ВАЖНО:
   *
   * Для attribution используем
   * sentTelegramIds.
   *
   * recipientTelegramIds здесь
   * использовать нельзя, потому что
   * туда входят blocked/failed users.
   */
  const relevantCampaigns =
    relevantCampaignRows
      .map((campaign) => {
        const startedAt = new Date(
          campaign?.startedAt ||
            campaign?.createdAt ||
            ""
        );

        const sentTelegramIds =
          new Set(
            (
              Array.isArray(
                campaign?.sentTelegramIds
              )
                ? campaign.sentTelegramIds
                : []
            )
              .map((value) =>
                String(
                  value || ""
                ).trim()
              )
              .filter(Boolean)
          );

        return {
          id: String(
            campaign?._id || ""
          ),

          startedAt,

          sentTelegramIds,
        };
      })
      .filter(
        (campaign) =>
          campaign.id &&
          !Number.isNaN(
            campaign.startedAt.getTime()
          ) &&
          campaign.sentTelegramIds.size > 0
      )
      .sort(
        (a, b) =>
          a.startedAt.getTime() -
          b.startedAt.getTime()
      );

  /*
   * Если успешных отправок вообще нет,
   * аналитика всех отображаемых
   * кампаний остаётся нулевой.
   */
  if (
    relevantCampaigns.length === 0
  ) {
    for (
      const [
        campaignId,
        analytics,
      ] of result.entries()
    ) {
      const campaign =
        campaigns.find(
          (row) =>
            String(
              row?._id || ""
            ) === campaignId
        );

      const sent =
        Number(
          campaign?.sent || 0
        );

      analytics.buyers = 0;
      analytics.revenue = 0;
      analytics.conversion =
        sent > 0 ? 0 : 0;
    }

    return result;
  }

  /*
   * Покупки нужны начиная с первой
   * реально релевантной кампании.
   */
  const earliestCampaignStartedAt =
    relevantCampaigns[0]
      .startedAt;

  const sales =
    await Order.aggregate([
      {
        $match:
          getCompletedOrderMatch(),
      },

      {
        $addFields: {
          crmSaleDate:
            getSaleDateExpression(),
        },
      },

      {
        $match: {
          crmSaleDate: {
            $gte:
              earliestCampaignStartedAt,

            $lt:
              latestWindowEnd,
          },
        },
      },

      {
        $project: {
          userTelegramId: 1,
          totalZl: 1,
          crmSaleDate: 1,
        },
      },

      {
        $sort: {
          crmSaleDate: 1,
        },
      },
    ]);

  for (const sale of sales) {
    const telegramId =
      String(
        sale?.userTelegramId ||
          ""
      ).trim();

    if (!telegramId) {
      continue;
    }

    const saleDate =
      new Date(
        sale?.crmSaleDate
      );

    if (
      Number.isNaN(
        saleDate.getTime()
      )
    ) {
      continue;
    }

    /*
     * LAST-TOUCH.
     *
     * Из всех успешно полученных
     * пользователем рассылок выбираем
     * самую последнюю перед покупкой,
     * если с неё прошло менее 7 дней.
     */
    let attributedCampaign =
      null;

    for (
      const campaign of
      relevantCampaigns
    ) {
      /*
       * Кампании после покупки
       * уже не интересуют.
       */
      if (
        campaign.startedAt >
        saleDate
      ) {
        break;
      }

      const attributionEnd =
        new Date(
          campaign.startedAt.getTime() +
            PUSH_ATTRIBUTION_WINDOW_DAYS *
              24 *
              60 *
              60 *
              1000
        );

      /*
       * Окно закончилось
       * либо пользователь не получил
       * эту рассылку.
       */
      if (
        saleDate >=
          attributionEnd ||
        !campaign
          .sentTelegramIds
          .has(telegramId)
      ) {
        continue;
      }

      /*
       * Берём самую свежую
       * подходящую рассылку.
       */
      if (
        !attributedCampaign ||
        campaign.startedAt >
          attributedCampaign.startedAt
      ) {
        attributedCampaign =
          campaign;
      }
    }

    if (!attributedCampaign) {
      continue;
    }

    /*
     * Нам может встретиться соседняя
     * кампания, которую frontend сейчас
     * не отображает.
     *
     * Она участвует в last-touch,
     * но её статистику возвращать
     * в текущем запросе не нужно.
     */
    const analytics =
      result.get(
        attributedCampaign.id
      );

    if (!analytics) {
      continue;
    }

    analytics.purchases += 1;

    analytics.buyers.add(
      telegramId
    );

    analytics.revenue +=
      Number(
        sale?.totalZl || 0
      );
  }

  /*
   * Финализируем показатели.
   */
  for (
    const [
      campaignId,
      analytics,
    ] of result.entries()
  ) {
    const campaign =
      campaigns.find(
        (row) =>
          String(
            row?._id || ""
          ) === campaignId
      );

    const sent =
      Number(
        campaign?.sent || 0
      );

    const buyers =
      analytics.buyers.size;

    analytics.buyers =
      buyers;

    analytics.revenue =
      Number(
        analytics.revenue.toFixed(2)
      );

    /*
     * Conversion =
     * уникальные покупатели /
     * успешные Telegram sends.
     */
    analytics.conversion =
      sent > 0
        ? Number(
            (
              (
                buyers /
                sent
              ) *
              100
            ).toFixed(1)
          )
        : 0;
  }

  return result;
}

async function loadCanceledCount(from, to) {
  const rows = await Order.aggregate([
    {
      $match: {
        status: {
          $in: ["canceled", "annulled"],
        },
      },
    },
    {
      $addFields: {
        crmCanceledAt: {
          $cond: [
            {
              $eq: ["$status", "annulled"],
            },
            "$annulledAt",
            "$canceledAt",
          ],
        },
      },
    },
    {
      $match: {
        crmCanceledAt: {
          $gte: from,
          $lt: to,
        },
      },
    },
    {
      $count: "count",
    },
  ]);

  return Number(rows?.[0]?.count || 0);
}

async function loadCanceledOrders(
  from,
  to
) {
  return Order.aggregate([
    {
      $match: {
        status: {
          $in: [
            "canceled",
            "annulled",
          ],
        },
      },
    },

    {
      $addFields: {
        crmCanceledAt: {
          $cond: [
            {
              $eq: [
                "$status",
                "annulled",
              ],
            },

            "$annulledAt",

            "$canceledAt",
          ],
        },
      },
    },

    {
      $match: {
        crmCanceledAt: {
          $gte: from,
          $lt: to,
        },
      },
    },

    {
      $project: {
        userTelegramId: 1,
        crmCanceledAt: 1,
        deliveryType: 1,
        deliveryMethod: 1,
        pickupPointId: 1,
      },
    },
  ]);
}

async function loadFirstSales() {
  return Order.aggregate([
    {
      $match: getCompletedOrderMatch(),
    },
    {
      $addFields: {
        crmSaleDate: getSaleDateExpression(),
      },
    },
    {
      $sort: {
        crmSaleDate: 1,
      },
    },
    {
      $group: {
        _id: "$userTelegramId",
        firstSaleAt: {
          $first: "$crmSaleDate",
        },
      },
    },
  ]);
}

function percentagePoints(current, previous) {
  return Number(
    (
      Number(current || 0) -
      Number(previous || 0)
    ).toFixed(1)
  );
}

function valueDifference(
  current,
  previous,
  digits = 0
) {
  return Number(
    (
      Number(current || 0) -
      Number(previous || 0)
    ).toFixed(digits)
  );
}

function buildMetrics(
  orders,
  from,
  to,
  canceledCount,
  firstSaleByUser
) {
  const ordersCount = orders.length;

  const revenue = Number(
    orders
      .reduce(
        (sum, order) =>
          sum + Number(order?.totalZl || 0),
        0
      )
      .toFixed(2)
  );

  const averageCheck =
    ordersCount > 0
      ? Number(
          (revenue / ordersCount).toFixed(2)
        )
      : 0;

  const ordersByCustomer = new Map();

  for (const order of orders) {
    const telegramId = String(
      order?.userTelegramId || ""
    ).trim();

    if (!telegramId) continue;

    ordersByCustomer.set(
      telegramId,
      Number(
        ordersByCustomer.get(telegramId) || 0
      ) + 1
    );
  }

  const customerIds = Array.from(
    ordersByCustomer.keys()
  );

  const newCustomerIds = customerIds.filter(
    (telegramId) => {
      const firstSaleAt =
        firstSaleByUser.get(telegramId);

      return Boolean(
        firstSaleAt &&
          firstSaleAt >= from &&
          firstSaleAt < to
      );
    }
  );

  const repeatCustomerIds =
    customerIds.filter((telegramId) => {
      const firstSaleAt =
        firstSaleByUser.get(telegramId);

      const ordersInPeriod = Number(
        ordersByCustomer.get(telegramId) || 0
      );

      return Boolean(
        firstSaleAt &&
          (
            firstSaleAt < from ||
            ordersInPeriod >= 2
          )
      );
    });

  const customersCount =
    customerIds.length;

  const newCustomersPercent =
    customersCount > 0
      ? Number(
          (
            (newCustomerIds.length /
              customersCount) *
            100
          ).toFixed(1)
        )
      : 0;

  const repeatCustomersPercent =
    customersCount > 0
      ? Number(
          (
            (repeatCustomerIds.length /
              customersCount) *
            100
          ).toFixed(1)
        )
      : 0;

  const finalOrdersCount =
    ordersCount +
    Number(canceledCount || 0);

  const cancellationsPercent =
    finalOrdersCount > 0
      ? Number(
          (
            (Number(canceledCount || 0) /
              finalOrdersCount) *
            100
          ).toFixed(1)
        )
      : 0;

  return {
    revenue,
    orders: ordersCount,
    averageCheck,
    customers: customersCount,

    newCustomers:
      newCustomerIds.length,

    newCustomersPercent,

    repeatCustomers:
      repeatCustomerIds.length,

    repeatCustomersPercent,

    cancellations:
      Number(canceledCount || 0),

    cancellationsPercent,
  };
}

function percentChange(
  current,
  previous
) {
  const currentValue =
    Number(current || 0);

  const previousValue =
    Number(previous || 0);

  if (previousValue === 0) {
    if (currentValue === 0) {
      return 0;
    }

    return 100;
  }

  return Number(
    (
      ((currentValue -
        previousValue) /
        previousValue) *
      100
    ).toFixed(1)
  );
}

function getWarsawDateKey(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CRM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}

function getProductIdentity(item) {
  const productKey = String(
    item?.productKey || ""
  ).trim();

  if (productKey) {
    return `key:${productKey}`;
  }

  const productId = String(
    item?.productId || ""
  ).trim();

  return productId
    ? `id:${productId}`
    : "";
}

function collectProductSales(orders = []) {
  const map = new Map();

  for (const order of orders) {
    const dateKey = getWarsawDateKey(
      order?.crmSaleDate
    );

    for (const item of order?.items || []) {
      const identity =
        getProductIdentity(item);

      if (!identity) continue;

      if (!map.has(identity)) {
        map.set(identity, {
          productId: String(
            item?.productId || ""
          ),
          productKey: String(
            item?.productKey || ""
          ),
          productTitle1: String(
            item?.productTitle1 || ""
          ),
          productTitle2: String(
            item?.productTitle2 || ""
          ),
          orderImgUrl: String(
            item?.orderImgUrl || ""
          ),
          revenue: 0,
          sold: 0,
          dailyRevenue: new Map(),
        });
      }

      const row = map.get(identity);

      for (const flavor of item?.flavors || []) {
        const qty = Number(
          flavor?.qty || 0
        );

        const unitPrice = Number(
          flavor?.unitPrice || 0
        );

        const revenue =
          qty * unitPrice;

        row.sold += qty;
        row.revenue += revenue;

        row.dailyRevenue.set(
          dateKey,
          Number(
            row.dailyRevenue.get(dateKey) || 0
          ) + revenue
        );
      }
    }
  }

  return map;
}

function getProductStock(product) {
  let totalQty = 0;
  let reservedQty = 0;

  for (const flavor of product?.flavors || []) {
    for (
      const stockRow of
      flavor?.stockByPickupPoint || []
    ) {
      totalQty += Number(
        stockRow?.totalQty || 0
      );

      reservedQty += Number(
        stockRow?.reservedQty || 0
      );
    }
  }

  return {
    totalQty,
    reservedQty,
    availableQty: Math.max(
      0,
      totalQty - reservedQty
    ),
  };
}

async function buildProductPerformance({
  currentOrders,
  previousOrders,
  salesHistory,
  range,
  hasComparison,
}) {
    const [products, categories] =

    await Promise.all([

        Product.find({

        isActive: {

            $ne: false,

        },

        }).lean(),

        Category.find({}).lean(),

    ]);

  const currentSales =
    collectProductSales(currentOrders);

  const previousSales =
    collectProductSales(previousOrders);

  const productPurchaseHistory = new Map();

    for (const order of salesHistory || []) {
    const orderDate = new Date(
        order?.crmSaleDate
    );

    const telegramId = String(
        order?.userTelegramId || ""
    ).trim();

    if (!telegramId) continue;

    for (const item of order?.items || []) {
        const identity =
        getProductIdentity(item);

        if (!identity) continue;

        if (
        !productPurchaseHistory.has(
            identity
        )
        ) {
        productPurchaseHistory.set(
            identity,
            new Map()
        );
        }

        const buyers =
        productPurchaseHistory.get(
            identity
        );

        if (!buyers.has(telegramId)) {
        buyers.set(
            telegramId,
            []
        );
        }

        buyers
        .get(telegramId)
        .push(orderDate);
    }
  }

  const categoryTitleByKey =
    new Map(
      categories.map((category) => [
        String(category?.key || ""),
        String(
          category?.title ||
            category?.key ||
            "Без категории"
        ),
      ])
    );

  const productByIdentity =
    new Map();

  for (const product of products) {
    const productKey = String(
      product?.productKey || ""
    ).trim();

    const productId = String(
      product?._id || ""
    ).trim();

    if (productKey) {
      productByIdentity.set(
        `key:${productKey}`,
        product
      );
    }

    if (productId) {
      productByIdentity.set(
        `id:${productId}`,
        product
      );
    }
  }

  const identities =
    new Set([
      ...currentSales.keys(),
      ...previousSales.keys(),
    ]);

  for (const product of products) {
    const productKey = String(
      product?.productKey || ""
    ).trim();

    const productId = String(
      product?._id || ""
    ).trim();

    if (productKey) {
      identities.add(
        `key:${productKey}`
      );
    } else if (productId) {
      identities.add(
        `id:${productId}`
      );
    }
  }

  const periodDays = Math.max(
    1,
    Math.ceil(
      (
        range.to.getTime() -
        range.from.getTime()
      ) /
        (
          24 *
          60 *
          60 *
          1000
        )
    )
  );

  const rows = Array.from(
    identities
  ).map((identity) => {
    const currentRow =
      currentSales.get(identity);

    const previousRow =
      previousSales.get(identity);

    let product =
      productByIdentity.get(identity);

    if (!product) {
      const fallbackProductKey =
        String(
          currentRow?.productKey ||
            previousRow?.productKey ||
            ""
        ).trim();

      const fallbackProductId =
        String(
          currentRow?.productId ||
            previousRow?.productId ||
            ""
        ).trim();

      if (fallbackProductKey) {
        product =
          productByIdentity.get(
            `key:${fallbackProductKey}`
          );
      }

      if (
        !product &&
        fallbackProductId
      ) {
        product =
          productByIdentity.get(
            `id:${fallbackProductId}`
          );
      }

      if (!product) {

        return null;

        }
    }

    const stock =
      getProductStock(product);

    const revenue = Number(
      Number(
        currentRow?.revenue || 0
      ).toFixed(2)
    );

    const previousRevenue = Number(
      Number(
        previousRow?.revenue || 0
      ).toFixed(2)
    );

    const sold = Number(
      currentRow?.sold || 0
    );

    const averageDailySold =
      sold / periodDays;

    const days =

      averageDailySold > 0

        ? Number(

            (

              stock.availableQty /

              averageDailySold

            ).toFixed(1)

          )

        : null;

    const snapshotTitle = [
      currentRow?.productTitle1 ||
        previousRow?.productTitle1 ||
        "",
      currentRow?.productTitle2 ||
        previousRow?.productTitle2 ||
        "",
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    const productTitle = [
      product?.title1 || "",
      product?.title2 || "",
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    const categoryKey = String(
      product?.categoryKey || ""
    );

    const currentProductBuyers =
  new Set();

const repeatProductBuyers =
  new Set();

for (const order of currentOrders) {
  const telegramId = String(
    order?.userTelegramId || ""
  ).trim();

  if (!telegramId) continue;

  const orderDate = new Date(
    order?.crmSaleDate
  );

  const hasProduct =
    (order?.items || []).some(
      (item) =>
        getProductIdentity(item) ===
        identity
    );

  if (!hasProduct) continue;

  currentProductBuyers.add(
    telegramId
  );

  const history =
    productPurchaseHistory
      .get(identity)
      ?.get(telegramId) || [];

  const hadEarlierPurchase =
    history.some(
      (date) =>
        date < orderDate
    );

  if (hadEarlierPurchase) {
    repeatProductBuyers.add(
      telegramId
    );
  }
}

const repeatPercent =
  currentProductBuyers.size > 0
    ? Number(
        (
          (
            repeatProductBuyers.size /
            currentProductBuyers.size
          ) *
          100
        ).toFixed(1)
      )
    : 0;

    return {
      id: String(
        product?._id ||
          currentRow?.productId ||
          previousRow?.productId ||
          identity
      ),

      productKey: String(
        product?.productKey ||
          currentRow?.productKey ||
          previousRow?.productKey ||
          ""
      ),

      name:
        productTitle ||
        snapshotTitle ||
        String(
          product?.productKey ||
            currentRow?.productKey ||
            previousRow?.productKey ||
            "Товар"
        ),

      categoryKey,

      category:
        categoryTitleByKey.get(
          categoryKey
        ) ||
        categoryKey ||
        "Без категории",

      imageUrl: String(
        product?.orderImgUrl ||
          currentRow?.orderImgUrl ||
          previousRow?.orderImgUrl ||
          ""
      ),

      revenue,
      previousRevenue,

      sold,
      buyers:

        currentProductBuyers.size,

        repeatBuyers:

        repeatProductBuyers.size,

        repeatPercent,

      trend: hasComparison
        ? percentChange(
            revenue,
            previousRevenue
          )
        : null,

        stock: stock.totalQty,
        reserved: stock.reservedQty,
        availableStock:
        stock.availableQty,

        unitPrice: Number(
        product?.price || 0
        ),

        stockValue: Number(
        (
            stock.totalQty *
            Number(product?.price || 0)
        ).toFixed(2)
        ),

        days,

      spark: Array.from(
        currentRow?.dailyRevenue?.entries?.() ||
          []
      )
        .sort((a, b) =>
          a[0].localeCompare(b[0])
        )
        .map(([, value]) =>
          Number(
            Number(value || 0).toFixed(2)
          )
        ),
    };
  }).filter(Boolean);

  rows.sort(
    (a, b) =>
      b.revenue - a.revenue
  );

  return {
    rows,

    categories: [
      "Все категории",

      ...Array.from(
        new Set(
          categories
            .map((category) =>
              String(
                category?.title ||
                  category?.key ||
                  ""
              ).trim()
            )
            .filter(Boolean)
        )
      ),
    ],
  };
}

// ======================================================
// LOCATION PERFORMANCE
// ======================================================

function getLocationIdentity(order) {
  if (
    order?.deliveryType === "pickup" &&
    order?.pickupPointId
  ) {
    return `pickup:${String(
      order.pickupPointId
    )}`;
  }

  if (
    order?.deliveryType === "delivery" &&
    order?.deliveryMethod === "courier"
  ) {
    return "delivery:courier";
  }

  if (
    order?.deliveryType === "delivery" &&
    order?.deliveryMethod === "inpost"
  ) {
    return "delivery:inpost";
  }

  return "other";
}

function collectLocationSales(
  orders = []
) {
  const map = new Map();

  for (const order of orders) {
    const identity =
      getLocationIdentity(order);

    if (!map.has(identity)) {
      map.set(identity, {
        revenue: 0,
        orders: 0,
        customers: new Set(),
      });
    }

    const row =
      map.get(identity);

    row.revenue += Number(
      order?.totalZl || 0
    );

    row.orders += 1;

    const telegramId = String(
      order?.userTelegramId || ""
    ).trim();

    if (telegramId) {
      row.customers.add(
        telegramId
      );
    }
  }

  return map;
}

async function buildLocationPerformance({
  currentOrders,
  previousOrders,
  salesHistory,
  currentCanceledOrders,
  previousCanceledOrders,
  hasComparison,
}) {
  const pickupPoints =
    await PickupPoint.find({}).lean();

  const pickupTitleById =
    new Map(
      pickupPoints.map(
        (point) => [
          String(
            point?._id || ""
          ),

          String(
            point?.title ||
              point?.address ||
              point?.key ||
              "Точка самовывоза"
          ),
        ]
      )
    );

  const current =
    collectLocationSales(
      currentOrders
    );

  const previous =
    collectLocationSales(
      previousOrders
    );

  function collectCanceledByLocation(
    orders = []
  ) {
    const map = new Map();

    for (const order of orders) {
      const identity =
        getLocationIdentity(order);

      map.set(
        identity,
        Number(
          map.get(identity) || 0
        ) + 1
      );
    }

    return map;
  }

  const currentCanceled =
    collectCanceledByLocation(
      currentCanceledOrders
    );

  const previousCanceled =
    collectCanceledByLocation(
      previousCanceledOrders
    );

  /*
   * История покупок:
   * location -> customer -> даты покупок
   */
  const locationHistory =
    new Map();

  for (
    const order of salesHistory || []
  ) {
    const identity =
      getLocationIdentity(order);

    const telegramId = String(
      order?.userTelegramId || ""
    ).trim();

    if (!telegramId) {
      continue;
    }

    if (
      !locationHistory.has(
        identity
      )
    ) {
      locationHistory.set(
        identity,
        new Map()
      );
    }

    const customers =
      locationHistory.get(
        identity
      );

    if (
      !customers.has(
        telegramId
      )
    ) {
      customers.set(
        telegramId,
        []
      );
    }

    customers
      .get(telegramId)
      .push(
        new Date(
          order.crmSaleDate
        )
      );
  }

  const identities =
    new Set([
      ...current.keys(),
      ...previous.keys(),
      ...currentCanceled.keys(),
      ...previousCanceled.keys(),
    ]);

  for (const point of pickupPoints) {
    const pointTitle = String(
      point?.title ||
        point?.key ||
        ""
    )
      .trim()
      .toLowerCase();

    const isDeliveryPoint =
      pointTitle === "курьер" ||
      pointTitle === "courier" ||
      pointTitle === "inpost";

    if (isDeliveryPoint) {
      continue;
    }

    identities.add(
      `pickup:${String(
        point?._id || ""
      )}`
    );
  }

  function getRepeatStats(
    identity,
    orders
  ) {
    const buyers =
      new Set();

    const repeatBuyers =
      new Set();

    const sortedOrders =
      [...orders]
        .filter(
          (order) =>
            getLocationIdentity(
              order
            ) === identity
        )
        .sort(
          (a, b) =>
            new Date(
              a.crmSaleDate
            ).getTime() -
            new Date(
              b.crmSaleDate
            ).getTime()
        );

    for (
      const order of sortedOrders
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

      buyers.add(
        telegramId
      );

      const orderDate =
        new Date(
          order.crmSaleDate
        );

      const history =
        locationHistory
          .get(identity)
          ?.get(telegramId) ||
        [];

      const hadEarlierPurchase =
        history.some(
          (date) =>
            date < orderDate
        );

      if (
        hadEarlierPurchase
      ) {
        repeatBuyers.add(
          telegramId
        );
      }
    }

    const percent =
      buyers.size > 0
        ? Number(
            (
              (
                repeatBuyers.size /
                buyers.size
              ) *
              100
            ).toFixed(1)
          )
        : 0;

    return {
      buyers:
        buyers.size,

      repeatBuyers:
        repeatBuyers.size,

      percent,
    };
  }

  const rows =
    Array.from(
      identities
    ).map(
      (identity) => {
        const currentRow =
          current.get(identity) || {
            revenue: 0,
            orders: 0,
            customers:
              new Set(),
          };

        const previousRow =
          previous.get(identity) || {
            revenue: 0,
            orders: 0,
            customers:
              new Set(),
          };

        const revenue =
          Number(
            Number(
              currentRow
                .revenue || 0
            ).toFixed(2)
          );

        const previousRevenue =
          Number(
            Number(
              previousRow
                .revenue || 0
            ).toFixed(2)
          );

        const orders =
          Number(
            currentRow
              .orders || 0
          );

        const previousOrdersCount =
          Number(
            previousRow
              .orders || 0
          );

        const averageCheck =
          orders > 0
            ? Number(
                (
                  revenue /
                  orders
                ).toFixed(2)
              )
            : 0;

        const previousAverageCheck =
          previousOrdersCount >
          0
            ? Number(
                (
                  previousRevenue /
                  previousOrdersCount
                ).toFixed(2)
              )
            : 0;

        const cancellations =
          Number(
            currentCanceled.get(
              identity
            ) || 0
          );

        const previousCancellations =
          Number(
            previousCanceled.get(
              identity
            ) || 0
          );

        const cancellationsPercent =
          orders +
            cancellations >
          0
            ? Number(
                (
                  (
                    cancellations /
                    (
                      orders +
                      cancellations
                    )
                  ) *
                  100
                ).toFixed(1)
              )
            : 0;

        const previousCancellationsPercent =
          previousOrdersCount +
            previousCancellations >
          0
            ? Number(
                (
                  (
                    previousCancellations /
                    (
                      previousOrdersCount +
                      previousCancellations
                    )
                  ) *
                  100
                ).toFixed(1)
              )
            : 0;

        const repeat =
          getRepeatStats(
            identity,
            currentOrders
          );

        const previousRepeat =
          getRepeatStats(
            identity,
            previousOrders
          );

        let name =
          "Другое";

        let type =
          "other";

        if (
          identity.startsWith(
            "pickup:"
          )
        ) {
          const pickupPointId =
            identity.slice(
              "pickup:".length
            );

          name =
            pickupTitleById.get(
              pickupPointId
            ) ||
            "Точка самовывоза";

          type =
            "pickup";
        } else if (
          identity ===
          "delivery:courier"
        ) {
          name =
            "Доставка — Варшава";

          type =
            "courier";
        } else if (
          identity ===
          "delivery:inpost"
        ) {
          name =
            "InPost / Польша";

          type =
            "inpost";
        }

        return {
          id:
            identity,

          name,

          type,

          revenue,

          previousRevenue:
            hasComparison
              ? previousRevenue
              : null,

          revenueChange:
            hasComparison
              ? percentChange(
                  revenue,
                  previousRevenue
                )
              : null,

          orders,

          previousOrders:
            hasComparison
              ? previousOrdersCount
              : null,

          ordersChange:
            hasComparison
              ? percentChange(
                  orders,
                  previousOrdersCount
                )
              : null,

          averageCheck,

          previousAverageCheck:
            hasComparison
              ? previousAverageCheck
              : null,

          averageCheckChange:
            hasComparison
              ? percentChange(
                  averageCheck,
                  previousAverageCheck
                )
              : null,

          customers:
            currentRow
              .customers.size,

          cancellations,

          cancellationsPercent,

          previousCancellationsPercent:
            hasComparison
              ? previousCancellationsPercent
              : null,

          cancellationsChangePoints:
            hasComparison
              ? percentagePoints(
                  cancellationsPercent,
                  previousCancellationsPercent
                )
              : null,

          repeatCustomers:
            repeat
              .repeatBuyers,

          repeatPercent:
            repeat.percent,

          previousRepeatPercent:
            hasComparison
              ? previousRepeat
                  .percent
              : null,

          repeatChangePoints:
            hasComparison
              ? percentagePoints(
                  repeat.percent,
                  previousRepeat
                    .percent
                )
              : null,
        };
      }
    );

  rows.sort(
    (a, b) =>
      b.revenue -
      a.revenue
  );

  return {
    rows,
  };
}

// ======================================================
// TOP PARTNERS
// ======================================================

async function buildTopPartners({
  currentOrders,
}) {
  const [partners, invitedUsers] =
    await Promise.all([
      User.find({
        "referral.code": {
          $type: "string",
          $ne: "",
        },
      })
        .select({
          telegramId: 1,
          username: 1,
          firstName: 1,
          lastName: 1,
          "referral.code": 1,
        })
        .lean(),

      User.find({
        "referral.invitedByTelegramId": {
          $type: "string",
          $ne: "",
        },
      })
        .select({
          telegramId: 1,
          "referral.invitedByTelegramId": 1,
        })
        .lean(),
    ]);

  const partnerByTelegramId =
    new Map(
      partners.map((partner) => [
        String(
          partner?.telegramId || ""
        ).trim(),
        partner,
      ])
    );

  const statsByPartner =
    new Map();

  for (const partner of partners) {
    const telegramId = String(
      partner?.telegramId || ""
    ).trim();

    if (!telegramId) continue;

    statsByPartner.set(
      telegramId,
      {
        invitedIds: new Set(),
        buyerIds: new Set(),
        revenue: 0,
        orders: 0,
      }
    );
  }

  const inviterByUserId =
    new Map();

  for (const user of invitedUsers) {
    const userTelegramId = String(
      user?.telegramId || ""
    ).trim();

    const inviterTelegramId = String(
      user?.referral
        ?.invitedByTelegramId || ""
    ).trim();

    if (
      !userTelegramId ||
      !inviterTelegramId ||
      !partnerByTelegramId.has(
        inviterTelegramId
      )
    ) {
      continue;
    }

    inviterByUserId.set(
      userTelegramId,
      inviterTelegramId
    );

    statsByPartner
      .get(inviterTelegramId)
      ?.invitedIds.add(
        userTelegramId
      );
  }

  for (const order of currentOrders) {
    const buyerTelegramId = String(
      order?.userTelegramId || ""
    ).trim();

    if (!buyerTelegramId) {
      continue;
    }

    const inviterTelegramId =
      inviterByUserId.get(
        buyerTelegramId
      );

    if (!inviterTelegramId) {
      continue;
    }

    const stats =
      statsByPartner.get(
        inviterTelegramId
      );

    if (!stats) {
      continue;
    }

    stats.buyerIds.add(
      buyerTelegramId
    );

    stats.orders += 1;

    stats.revenue += Number(
      order?.totalZl || 0
    );
  }

  const rows = partners
    .map((partner) => {
      const telegramId = String(
        partner?.telegramId || ""
      ).trim();

      const stats =
        statsByPartner.get(
          telegramId
        );

      const invited =
        stats?.invitedIds.size || 0;

      const buyers =
        stats?.buyerIds.size || 0;

      const orders = Number(
        stats?.orders || 0
      );

      const revenue = Number(
        Number(
          stats?.revenue || 0
        ).toFixed(2)
      );

      const conversion =
        invited > 0
          ? Number(
              (
                (buyers /
                  invited) *
                100
              ).toFixed(1)
            )
          : 0;

      const averageCheck =
        orders > 0
          ? Number(
              (
                revenue /
                orders
              ).toFixed(2)
            )
          : 0;

      const username = String(
        partner?.username || ""
      ).trim();

      const fallbackName = [
        partner?.firstName || "",
        partner?.lastName || "",
      ]
        .filter(Boolean)
        .join(" ")
        .trim();

      return {
        id: String(
          partner?._id ||
            telegramId
        ),

        telegramId,

        username:
          username ||
          fallbackName ||
          telegramId,

        referralCode: String(
          partner?.referral?.code ||
            ""
        ),

        invited,
        buyers,
        orders,
        conversion,
        revenue,
        averageCheck,
      };
    })

    .filter(

      (partner) =>

        partner.invited > 0

    )

    .sort(

      (a, b) =>

        b.revenue - a.revenue

    );

  return {

    rows,

  };
}

// ======================================================
// CUSTOMERS PAGE HELPERS
// ======================================================

function getCustomerStatus({
  firstSaleAt,
  lastSaleAt,
  range,
}) {
  const firstSale = firstSaleAt
    ? new Date(firstSaleAt)
    : null;

  const lastSale = lastSaleAt
    ? new Date(lastSaleAt)
    : null;

  /*
   * Новый:
   * первая покупка в жизни
   * попала в выбранный период.
   */
  if (
    firstSale &&
    firstSale >= range.from &&
    firstSale < range.to
  ) {
    return "new";
  }

  if (!lastSale) {
    return "sleeping";
  }

  /*
   * Активный:
   * покупал не более 14 дней назад
   * относительно конца выбранного периода.
   */
  const activeThreshold =
    new Date(
      range.to.getTime() -
        14 * 24 * 60 * 60 * 1000
    );

  if (lastSale >= activeThreshold) {
    return "active";
  }

  return "sleeping";
}

function isCustomerActive(
  lastSaleAt,
  range
) {
  if (!lastSaleAt) {
    return false;
  }

  const lastSale =
    new Date(lastSaleAt);

  const activeThreshold =
    new Date(
      range.to.getTime() -
        14 * 24 * 60 * 60 * 1000
    );

  return lastSale >= activeThreshold;
}

function getCustomerSegment(
  purchases
) {
  const count =
    Number(purchases || 0);

  if (count <= 1) {
    return "Новый";
  }

  if (count <= 4) {
    return "Повторный";
  }

  if (count <= 9) {
    return "Постоянный";
  }

  return "VIP";
}

function getAveragePurchaseIntervalDays(
  dates = []
) {
  if (dates.length < 2) {
    return null;
  }

  const sorted =
    [...dates]
      .map(
        (value) =>
          new Date(value)
      )
      .sort(
        (a, b) =>
          a.getTime() -
          b.getTime()
      );

  let totalMs = 0;
  let intervals = 0;

  for (
    let index = 1;
    index < sorted.length;
    index += 1
  ) {
    const diff =
      sorted[index].getTime() -
      sorted[index - 1].getTime();

    if (diff >= 0) {
      totalMs += diff;
      intervals += 1;
    }
  }

  if (!intervals) {
    return null;
  }

    return Math.round(

    totalMs /

    intervals /

    (

        24 *

        60 *

        60 *

        1000

    )

    );
}

// ======================================================
// ORDERS PAGE
// ======================================================

function getCrmOrderStatus(status) {
  const value = String(status || "");

  if (
    value === "canceled" ||
    value === "annulled"
  ) {
    return "cancelled";
  }

  if (
    value === "completed" ||
    value === "done" ||
    value === "shipped"
  ) {
    return "done";
  }

  return "processing";
}

function getCrmOrderDateExpression() {
  return {
    $switch: {
      branches: [
        {
          case: {
            $eq: ["$status", "annulled"],
          },
          then: {
            $ifNull: [
              "$annulledAt",
              "$createdAt",
            ],
          },
        },
        {
          case: {
            $eq: ["$status", "canceled"],
          },
          then: {
            $ifNull: [
              "$canceledAt",
              "$createdAt",
            ],
          },
        },
        {
          case: {
            $in: [
              "$status",
              ["completed", "done"],
            ],
          },
          then: {
            $ifNull: [
              "$completedAt",
              "$createdAt",
            ],
          },
        },
        {

            case: {

                $eq: [

                "$status",

                "shipped",

                ],

            },

            then: {

                $ifNull: [

                "$shippedAt",

                "$createdAt",

                ],

            },

        },
      ],
      default: "$createdAt",
    },
  };
}

function getCrmPaymentLabel(method) {
  const value = String(
    method || ""
  )
    .trim()
    .toLowerCase();

  const labels = {
    blik: "BLIK",
    cash: "Наличные",
    crypto: "Крипто",
    ua_card: "Карта",
    card: "Карта",
    cashback: "Кэшбэк",
  };

  return (
    labels[value] ||
    method ||
    "—"
  );
}

function getCrmDeliveryLabel(order) {
  if (
    order?.deliveryType === "pickup"
  ) {
    return "Самовывоз";
  }

  if (
    order?.deliveryMethod === "courier"
  ) {
    return "Курьер";
  }

  if (
    order?.deliveryMethod === "inpost"
  ) {
    return "InPost";
  }

  return "—";
}

function getCrmItemsLabel(items = []) {
  return items
    .map((item) => {
      const title = [
        item?.productTitle1 || "",
        item?.productTitle2 || "",
      ]
        .filter(Boolean)
        .join(" ")
        .trim();

      const qty = (
        item?.flavors || []
      ).reduce(
        (sum, flavor) =>
          sum +
          Number(flavor?.qty || 0),
        0
      );

      if (!title) {
        return "";
      }

      return `${title} ×${qty}`;
    })
    .filter(Boolean)
    .join(", ");
}

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

      /*
       * Для операционной страницы
       * период определяется по событию,
       * соответствующему текущему статусу.
       *
       * processing -> createdAt
       * completed -> completedAt
       * canceled -> canceledAt
       * annulled -> annulledAt
       */
      const orders =
        await Order.aggregate([
          {
            $addFields: {
              crmOrderDate:
                getCrmOrderDateExpression(),
            },
          },

          {
            $match: {
              crmOrderDate: {
                $gte: range.from,
                $lt: range.to,
              },
            },
          },

          {
            $sort: {
              crmOrderDate: -1,
              createdAt: -1,
            },
          },
        ]);

      /*
       * Получаем клиентов одним запросом.
       */
      const telegramIds =
        Array.from(
          new Set(
            orders
              .map((order) =>
                String(
                  order?.userTelegramId ||
                    ""
                ).trim()
              )
              .filter(Boolean)
          )
        );

      const users =
        telegramIds.length > 0
          ? await User.find({
              telegramId: {
                $in: telegramIds,
              },
            })
              .select({
                telegramId: 1,
                username: 1,
                firstName: 1,
                lastName: 1,
              })
              .lean()
          : [];

      const userByTelegramId =
        new Map(
          users.map((user) => [
            String(
              user?.telegramId || ""
            ),
            user,
          ])
        );

      /*
       * Названия точек.
       */
      const pickupPointIds =
        Array.from(
          new Set(
            orders
              .map((order) =>
                String(
                  order?.pickupPointId ||
                    ""
                )
              )
              .filter(Boolean)
          )
        );

      const pickupPoints =
        pickupPointIds.length > 0
          ? await PickupPoint.find({
              _id: {
                $in: pickupPointIds,
              },
            })
              .select({
                title: 1,
                address: 1,
                key: 1,
              })
              .lean()
          : [];

      const pickupById =
        new Map(
          pickupPoints.map(
            (point) => [
              String(point._id),

              String(
                point?.title ||
                  point?.address ||
                  point?.key ||
                  "Самовывоз"
              ),
            ]
          )
        );

      let rows = orders.map(
        (order) => {
          const telegramId =
            String(
              order?.userTelegramId ||
                ""
            );

          const user =
            userByTelegramId.get(
              telegramId
            );

          const fullName = [
            user?.firstName || "",
            user?.lastName || "",
          ]
            .filter(Boolean)
            .join(" ")
            .trim();

          const username =
            String(
              user?.username || ""
            ).trim();

          const customer =
            fullName ||
            (username
              ? `@${username}`
              : telegramId);

          const items =
            getCrmItemsLabel(
              order?.items || []
            );

          let location = "—";

          if (
            order?.deliveryType ===
            "pickup"
          ) {
            location =
              pickupById.get(
                String(
                  order?.pickupPointId ||
                    ""
                )
              ) || "Самовывоз";
          } else if (
            order?.deliveryMethod ===
            "courier"
          ) {
            location =
              order?.courierDistrict ||
              "Доставка — Варшава";
          } else if (
            order?.deliveryMethod ===
            "inpost"
          ) {
            location =
              "InPost / Польша";
          }

            return {
            id: String(
                order?._id || ""
            ),

            orderNo: String(
                order?.orderNo || ""
            ),

            customer,

            username,

            telegramId,

            date:
              order?.crmOrderDate,

            items,

            amount: Number(
              order?.totalZl || 0
            ),

            payment:
              getCrmPaymentLabel(
                order?.payment?.method
              ),

            delivery:
              getCrmDeliveryLabel(
                order
              ),

            location,

            status:
              getCrmOrderStatus(
                order?.status
              ),

            rawStatus:
              String(
                order?.status || ""
              ),
          };
        }
      );

      /*
       * Поиск.
       */
      if (search) {
        rows = rows.filter(
          (row) => {
            const haystack = [

            row.orderNo,

            row.customer,

            row.username,

            row.telegramId,

            row.items,

            ]

            .join(" ")

            .toLowerCase();

            return haystack.includes(
              search
            );
          }
        );
      }

      /*
       * KPI считаем после поиска?
       *
       * Нет. KPI должны показывать
       * весь выбранный период,
       * независимо от строки поиска.
       */

        const [
        completedSales,
        canceledCount,
        ] = await Promise.all([
        completedSalesPromise,
        canceledCountPromise,
        ]);

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
        },

        summary: {
          orders:
            orders.length,

          revenue,

          averageCheck,

          cancellationsPercent,
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

// ======================================================
// DEBUG: REVENUE GAP
// TEMPORARY ENDPOINT
// ======================================================

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

// ======================================================
// PUSH / BROADCAST CRM
// ======================================================

function normalizePushString(value) {
  return String(value || "").trim();
}

function normalizePushUsername(value) {
  return normalizePushString(value)
    .replace(/^@/, "");
}

function getPushUserDisplayName(user) {
  const fullName = [
    user?.firstName || "",
    user?.lastName || "",
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  const username =
    normalizePushString(
      user?.username
    );

  return (
    fullName ||
    (
      username
        ? `@${username}`
        : ""
    ) ||
    normalizePushString(
      user?.telegramId
    ) ||
    "Пользователь"
  );
}

function getPushLocationKey(order) {
  if (
    order?.deliveryType ===
    "pickup"
  ) {
    return `pickup:${String(
      order?.pickupPointId ||
        ""
    )}`;
  }

  if (
    order?.deliveryType ===
      "delivery" &&
    order?.deliveryMethod ===
      "courier"
  ) {
    return "delivery:courier";
  }

  if (
    order?.deliveryType ===
      "delivery" &&
    order?.deliveryMethod ===
      "inpost"
  ) {
    return "delivery:inpost";
  }

  return "";
}

async function buildPushAudiencePreview({
  range,
  audience = "all",
  statuses = [],
  categoryKeys = [],
  locationKeys = [],
  minCheck = 0,
  minCashback = 0,
  favProduct = "",
  telegram = "",
  includeTelegramIds = false,
}) {

    const [
        users,
        salesHistory,
        products,
        favoriteCustomerRows,
    ] = await Promise.all([
        
    User.find({
      telegramId: {
        $exists: true,
        $ne: "",
      },
    })
      .select({
        telegramId: 1,
        username: 1,
        firstName: 1,
        lastName: 1,
        createdAt: 1,
        cashbackBalance: 1,
        // favoriteProductKeys: 1,
        referral: 1,
      })
      .lean(),

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

  const matchedUsers =
    users.filter(
      (user) => {
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

            if (

                Number(

                stats?.purchases || 0

                ) > 0

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

        return true;
      }
    );

return {
  total:
    matchedUsers.length,

  telegramIds:
    includeTelegramIds
      ? matchedUsers
          .map((user) =>
            String(
              user?.telegramId || ""
            ).trim()
          )
          .filter(Boolean)
      : [],

  sample:
    matchedUsers
      .slice(0, 20)
      .map(
        (user) => ({
          username:
            String(
              user?.username || ""
            ),

          name:
            getPushUserDisplayName(
              user
            ),

          cashbackBalance:
            Number(
              user?.cashbackBalance ||
                0
            ),
        })
      ),
};
}

/*
 * Данные для фильтров
 * Push-страницы.
 */
router.get(
  "/push/meta",

  async (
    req,
    res
  ) => {
    try {
      const [
        categories,
        pickupPoints,
        products,
      ] =
        await Promise.all([
          Category.find({})
            .select({
              key: 1,
              title: 1,
            })
            .sort({
              sortOrder: 1,
              title: 1,
            })
            .lean(),

          PickupPoint.find({})
            .select({
              key: 1,
              title: 1,
              address: 1,
              isActive: 1,
            })
            .sort({
              sortOrder: 1,
              title: 1,
            })
            .lean(),

          Product.find({

            isActive: {

                $ne: false,

            },

            })
            .select({
              productKey: 1,
              title1: 1,
              title2: 1,
            })
            .sort({
              title1: 1,
              title2: 1,
            })
            .lean(),
        ]);

      return res.json({
        ok: true,

        audiences: [
          {
            key: "all",
            label: "Все",
          },
          {
            key: "leads",
            label: "Лиды",
          },
          {
            key: "favorites",
            label:
              "Избранные",
          },
        ],

        statuses: [
        {
            key: "active",
            label:
            "Активные",
        },
        {
            key: "new",
            label: "Новые",
        },
        {
            key: "sleeping",
            label:
            "Спящие",
        },
        {
            key: "repeat",
            label:
            "Повторные",
        },
        {
            key: "regular",
            label:
            "Постоянные",
        },
        {
            key: "vip",
            label: "VIP",
        },
        ],

        categories:
          categories.map(
            (category) => ({
              key: String(
                category?.key ||
                  ""
              ),

              label: String(
                category
                  ?.title ||
                  category?.key ||
                  "Категория"
              ),
            })
          ),

        locations: [
          ...pickupPoints
            .filter((point) => {
            if (
                point?.isActive === false
            ) {
                return false;
            }

            const key =
                String(
                point?.key || ""
                )
                .trim()
                .toLowerCase()
                .replace(/,+$/, "");

            const title =
                String(
                point?.title || ""
                )
                .trim()
                .toLowerCase();

            return !(
                key === "delivery" ||
                key === "delivery-2" ||
                title === "курьер" ||
                title === "courier" ||
                title === "inpost"
            );
            })
            .map(
              (point) => ({
                key:
                  `pickup:${String(
                    point?._id ||
                      ""
                  )}`,

                label:
                  String(
                    point
                      ?.title ||
                      point
                        ?.address ||
                      point?.key ||
                      "Самовывоз"
                  ),
              })
            ),

          {
            key:
              "delivery:courier",

            label:
              "Курьер",
          },

          {
            key:
              "delivery:inpost",

            label:
              "InPost",
          },
        ],

        products:
          products.map(
            (product) => ({
              key: String(
                product
                  ?.productKey ||
                  ""
              ),

              label:
                [
                  product
                    ?.title1 ||
                    "",

                  product
                    ?.title2 ||
                    "",
                ]
                  .filter(
                    Boolean
                  )
                  .join(" ")
                  .trim() ||
                String(
                  product
                    ?.productKey ||
                    "Товар"
                ),
            })
          ),
      });
    } catch (error) {
      console.error(
        "GET /crm/push/meta error:",
        error
      );

      return res
        .status(500)
        .json({
          ok: false,
          error:
            "PUSH_META_LOAD_FAILED",
        });
    }
  }
);

/*
 * Реальные шаблоны.
 */
router.get(
  "/push/templates",

  async (
    req,
    res
  ) => {
    try {
      const templates =
        await mongoose
          .connection
          .collection(
            BROADCAST_TEMPLATES_COLLECTION
          )
          .find({})
          .sort({
            isDefault: -1,
            createdAt: -1,
          })
          .toArray();

    const templateIds =
  templates
    .map(
      (template) =>
        template?._id
    )
    .filter(Boolean);

const templateCampaigns =
  templateIds.length > 0
    ? await BroadcastCampaign.find({
        templateId: {
          $in: templateIds,
        },
      })
        .select({
          _id: 1,
          templateId: 1,
          sent: 1,
          startedAt: 1,
          createdAt: 1,
        })
        .lean()
    : [];

const campaignAnalytics =
  await buildPushCampaignAnalytics(
    templateCampaigns
  );

const templateStats =
  new Map();

for (
  const campaign of
  templateCampaigns
) {
  const templateId =
    String(
      campaign?.templateId || ""
    );

  if (!templateId) {
    continue;
  }

  if (
    !templateStats.has(
      templateId
    )
  ) {
    templateStats.set(
      templateId,
      {
        sent: 0,
        buyers: 0,
      }
    );
  }

  const stats =
    templateStats.get(
      templateId
    );

  const analytics =
    campaignAnalytics.get(
      String(
        campaign?._id || ""
      )
    );

  stats.sent +=
    Number(
      campaign?.sent || 0
    );

  stats.buyers +=
    Number(
      analytics?.buyers || 0
    );
}

      return res.json({
        ok: true,

        templates:
          templates.map(
            (
              template
            ) => ({
              id: String(
                template?._id ||
                  ""
              ),

              name: String(
                template?.title ||
                  "Без названия"
              ),

              preview:
                String(
                  template?.text ||
                    ""
                ),

              title: String(
                template?.title ||
                  ""
              ),

              text: String(
                template?.text ||
                  ""
              ),

              photoUrl:
                String(
                  template
                    ?.photoUrl ||
                    ""
                ),

                photoFileId:
  String(
    template?.photoFileId ||
      ""
  ),

  photoPreviewUrl:

  String(

    template?.photoPreviewUrl ||

      ""

  ),

              buttonText:
                String(
                  template
                    ?.buttonText ||
                    ""
                ),

              buttonUrl:
                String(
                  template
                    ?.buttonUrl ||
                    ""
                ),

              isDefault:
                template
                  ?.isDefault ===
                true,

              used: Number(
                template?.used ||
                  0
              ),

            conversion: (() => {
            const stats =
                templateStats.get(
                String(
                    template?._id || ""
                )
                ) || {
                sent: 0,
                buyers: 0,
                };

            return stats.sent > 0
                ? Number(
                    (
                    (
                        stats.buyers /
                        stats.sent
                    ) *
                    100
                    ).toFixed(1)
                )
                : 0;
            })(),

              lastUsed:
                template
                  ?.lastUsed ||
                null,

              createdAt:
                template
                  ?.createdAt ||
                null,
            })
          ),
      });
    } catch (error) {
      console.error(
        "GET /crm/push/templates error:",
        error
      );

      return res
        .status(500)
        .json({
          ok: false,
          error:
            "PUSH_TEMPLATES_LOAD_FAILED",
        });
    }
  }
);

/*
 * Создание шаблона.
 */
router.post(

  "/push/templates",

  requireCrmPushAdmin,

  async (
    req,
    res
  ) => {
    try {
      const title =
        String(
          req.body?.title ||
            ""
        ).trim();

      const text =
        String(
          req.body?.text ||
            ""
        ).trim();

      const photoUrl =
        String(
          req.body
            ?.photoUrl ||
            ""
        ).trim();

//         const photoFileId =

//   normalizePushString(

//     req.body?.photoFileId

//   );

         const photoFileId =
        String(
          req.body
            ?.photoFileId ||
            ""
        ).trim();

        const photoPreviewUrl =
  String(
    req.body
      ?.photoPreviewUrl ||
      ""
  ).trim();

      const buttonText =
        String(
          req.body
            ?.buttonText ||
            ""
        ).trim();

      const buttonUrl =
        String(
          req.body
            ?.buttonUrl ||
            ""
        ).trim();

      if (!title) {
        return res
          .status(400)
          .json({
            ok: false,

            error:
              "TEMPLATE_TITLE_REQUIRED",
          });
      }

      if (!text) {
        return res
          .status(400)
          .json({
            ok: false,

            error:
              "TEMPLATE_TEXT_REQUIRED",
          });
      }

      const result =
        await mongoose
          .connection
          .collection(
            BROADCAST_TEMPLATES_COLLECTION
          )
          .insertOne({
            title,
            text,
            photoUrl,
            photoFileId,
            photoPreviewUrl,
            buttonText,
            buttonUrl,

            isDefault:
              false,

            used: 0,

            conversion: 0,

            lastUsed:
              null,

            createdAt:
              new Date(),

            updatedAt:
              new Date(),
          });

      return res.json({
        ok: true,

        id:
          String(
            result.insertedId
          ),
      });
    } catch (error) {
      console.error(
        "POST /crm/push/templates error:",
        error
      );

      if (
        Number(
          error?.code || 0
        ) === 11000
      ) {
        return res
          .status(409)
          .json({
            ok: false,

            error:
              "TEMPLATE_ALREADY_EXISTS",
          });
      }

      return res
        .status(500)
        .json({
          ok: false,

          error:
            "PUSH_TEMPLATE_SAVE_FAILED",
        });
    }
  }
);

router.delete(
  "/push/templates/:id",
  requireCrmPushAdmin,
  async (req, res) => {
    try {
      const id = String(
        req.params?.id || ""
      ).trim();

      if (!id) {
        return res.status(400).json({
          ok: false,
          error: "TEMPLATE_ID_REQUIRED",
        });
      }

      const collection =
        mongoose.connection.collection(
          BROADCAST_TEMPLATES_COLLECTION
        );

      let result = null;

      if (
        mongoose.Types.ObjectId.isValid(id)
      ) {
        result =
          await collection.deleteOne({
            _id:
              new mongoose.Types.ObjectId(
                id
              ),
          });
      }

      if (!result?.deletedCount) {
        result =
          await collection.deleteOne({
            id,
          });
      }

      if (!result?.deletedCount) {
        return res.status(404).json({
          ok: false,
          error: "TEMPLATE_NOT_FOUND",
        });
      }

      return res.json({
        ok: true,
        id,
      });
    } catch (error) {
      console.error(
        "DELETE /crm/push/templates/:id error:",
        error
      );

      return res.status(500).json({
        ok: false,
        error: "TEMPLATE_DELETE_FAILED",
      });
    }
  }
);

/*
 * Реальный подсчёт
 * аудитории.
 */
router.post(
  "/push/audience-preview",

  async (
    req,
    res
  ) => {
    try {
      const range =
        getPeriodRange(
          req.body?.period ||
            "month",

          req.body?.from ||
            "",

          req.body?.to ||
            ""
        );

      const preview =
        await buildPushAudiencePreview({
          range,
        //   includeTelegramIds: true,

          audience:
            req.body
              ?.audience ||
            "all",

          statuses:
            req.body
              ?.statuses ||
            [],

          categoryKeys:
            req.body
              ?.categoryKeys ||
            [],

          locationKeys:
            req.body
              ?.locationKeys ||
            [],

          minCheck:
            req.body
              ?.minCheck ||
            0,

          minCashback:
            req.body
              ?.minCashback ||
            0,

          favProduct:
            req.body
              ?.favProduct ||
            "",

          telegram:
            req.body
              ?.telegram ||
            "",
        });

      return res.json({
        ok: true,

        period: {
          key:
            range.key,

          from:
            range.from,

          to:
            range.to,
        },

        ...preview,
      });
    } catch (error) {
      console.error(
        "POST /crm/push/audience-preview error:",
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
            "PUSH_AUDIENCE_PREVIEW_FAILED",
        });
    }
  }
);

router.post(
  "/push/send",
  requireCrmPushAdmin,
  async (req, res) => {
    try {
      const body = req.body || {};

        const range = getPeriodRange(
            body?.period || "month",
            body?.from || "",
            body?.to || ""
        );

      const title =
        normalizePushString(
          body?.title
        );

      const text =
        normalizePushString(
          body?.text
        );

      const promo =
        normalizePushString(
          body?.promo
        );

      const photoUrl =
        normalizePushString(
          body?.photoUrl
        );

        const photoFileId =
  normalizePushString(
    body?.photoFileId
  );
        

      const buttonText =
        normalizePushString(
          body?.buttonText
        );

      const buttonUrl =
        normalizePushString(
          body?.buttonUrl
        );

      if (!title && !text && !promo) {
        return res.status(400).json({
          ok: false,
          error: "MESSAGE_REQUIRED",
        });
      }

      if (
        (buttonText && !buttonUrl) ||
        (!buttonText && buttonUrl)
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "BUTTON_TEXT_AND_URL_REQUIRED_TOGETHER",
        });
      }

      if (buttonUrl) {
        let parsedButtonUrl;

        try {
          parsedButtonUrl =
            new URL(buttonUrl);
        } catch {
          return res
            .status(400)
            .json({
              ok: false,
              error:
                "INVALID_BUTTON_URL",
            });
        }

        if (
          ![
            "http:",
            "https:",
            "tg:",
          ].includes(
            parsedButtonUrl.protocol
          )
        ) {
          return res
            .status(400)
            .json({
              ok: false,
              error:
                "INVALID_BUTTON_URL_PROTOCOL",
            });
        }
      }

        const audienceResult =
        await buildPushAudiencePreview({
            range,

            includeTelegramIds: true,

            audience:
            body?.audience ||
            "all",

          statuses:
            body?.statuses || [],

          categoryKeys:
            body?.categoryKeys ||
            [],

          locationKeys:
            body?.locationKeys ||
            [],

          minCheck:
            body?.minCheck || 0,

          minCashback:
            body?.minCashback || 0,

          favProduct:
            body?.favProduct || "",

          telegram:
            body?.telegram || "",
        });

      const telegramIds =
        Array.from(
          new Set(
            (
              Array.isArray(
                audienceResult
                  ?.telegramIds
              )
                ? audienceResult
                    .telegramIds
                : []
            )
              .map((value) =>
                String(
                  value || ""
                ).trim()
              )
              .filter(Boolean)
          )
        );

      if (!telegramIds.length) {
        return res.status(400).json({
          ok: false,
          error: "AUDIENCE_EMPTY",
        });
      }

      const runCampaign =
        req.app?.locals
          ?.runCrmBroadcastCampaign;

      if (
        typeof runCampaign !==
        "function"
      ) {
        return res.status(503).json({
          ok: false,
          error:
            "CRM_BROADCAST_ENGINE_UNAVAILABLE",
        });
      }

      const campaign =
        await BroadcastCampaign
          .create({
            name:
              normalizePushString(
                body?.name
              ) ||
              title ||
              "Рассылка",

            audience:
              String(
                body?.audience ||
                  "all"
              )
                .trim()
                .toLowerCase(),

            filters: {
              statuses:
                Array.isArray(
                  body?.statuses
                )
                  ? body.statuses
                  : [],

              categoryKeys:
                Array.isArray(
                  body?.categoryKeys
                )
                  ? body
                      .categoryKeys
                  : [],

              locationKeys:
                Array.isArray(
                  body?.locationKeys
                )
                  ? body
                      .locationKeys
                  : [],

              minCheck:
                Math.max(
                  0,
                  Number(
                    body
                      ?.minCheck || 0
                  )
                ),

              minCashback:
                Math.max(
                  0,
                  Number(
                    body
                      ?.minCashback ||
                      0
                  )
                ),

              favProduct:
                normalizePushString(
                  body?.favProduct
                ),

              telegram:
                normalizePushString(
                  body?.telegram
                ),
            },

            message: {
              title,
              text,
              promo,
              photoUrl,
              photoFileId,
              buttonText,
              buttonUrl,
            },

            templateId:
              mongoose
                .isValidObjectId(
                  body?.templateId
                )
                ? body.templateId
                : null,

            status: "queued",

            recipients:
              telegramIds.length,

            recipientTelegramIds:
              telegramIds,

            processed: 0,
            sent: 0,
            failed: 0,
            blocked: 0,

            purchases: 0,
            revenue: 0,
            conversion: 0,
          });

      try {
        await runCampaign({
          campaignId:
            String(
              campaign._id
            ),

          telegramIds,

          message: {
            title,
            text,
            promo,
            photoUrl,
            photoFileId,
            buttonText,
            buttonUrl,
          },
        });

        if (
            campaign.templateId &&
            mongoose.isValidObjectId(
                campaign.templateId
            )
            ) {
            await mongoose.connection
                .collection(
                BROADCAST_TEMPLATES_COLLECTION
                )
                .updateOne(
                {
                    _id:
                    new mongoose
                        .Types
                        .ObjectId(
                        campaign
                            .templateId
                        ),
                },

                {
                    $inc: {
                    used: 1,
                    },

                    $set: {
                    lastUsed:
                        new Date(),

                    updatedAt:
                        new Date(),
                    },
                }
                );
            }
      } catch (error) {
        await BroadcastCampaign
          .updateOne(
            {
              _id:
                campaign._id,
            },
            {
              $set: {
                status:
                  "failed",

                finishedAt:
                  new Date(),

                lastErrors: [
                  String(
                    error?.message ||
                      error ||
                      "BROADCAST_START_FAILED"
                  ),
                ],
              },
            }
          );

        throw error;
      }

      return res
        .status(202)
        .json({
          ok: true,

          campaign: {
            id: String(
              campaign._id
            ),

            name:
              campaign.name,

            status:
              "running",

            recipients:
              telegramIds.length,

            createdAt:
              campaign.createdAt,
          },
        });
    } catch (error) {
      console.error(
        "CRM push send error:",
        error
      );

      return res
        .status(500)
        .json({
          ok: false,

          error:
            error?.message ||
            "CRM_PUSH_SEND_FAILED",
        });
    }
  }
);

router.get(
  "/push/campaigns",
  async (req, res) => {
    try {

        const range = getPeriodRange(
            req.query?.period || "month",
            req.query?.from || "",
            req.query?.to || ""
        );

      const limit =
        Math.min(
          200,

          Math.max(
            1,

            Number(
              req.query?.limit ||
                100
            )
          )
        );

      const rows =
        await BroadcastCampaign
          .find({
            createdAt: {
              $gte:
                range.from,

              $lt:
                range.to,
            },
          })
          .sort({
            createdAt: -1,
          })
          .limit(limit)
          .lean();

        const analyticsByCampaign =
            await buildPushCampaignAnalytics(
                rows
            );

            const analyticsUpdates = [];

            for (const row of rows) {
            const id =
                String(
                row?._id || ""
                );

            const analytics =
                analyticsByCampaign.get(
                id
                ) || {
                purchases: 0,
                buyers: 0,
                revenue: 0,
                conversion: 0,
                };

            const purchases =
                Number(
                analytics
                    .purchases || 0
                );

            const buyers =

                Number(

                    analytics.buyers || 0

                );

            const revenue =
                Number(
                analytics
                    .revenue || 0
                );

            const conversion =
                Number(
                analytics
                    .conversion || 0
                );

            const storedPurchases =
                Number(
                row
                    ?.purchases || 0
                );

                const storedBuyers =
                Number(
                    row?.buyers || 0
                );

            const storedRevenue =
                Number(
                row
                    ?.revenue || 0
                );

            const storedConversion =
                Number(
                row
                    ?.conversion || 0
                );

            row.purchases =
                purchases;

                row.buyers = buyers;

            row.revenue =
                revenue;

            row.conversion =
                conversion;

            if (
                storedPurchases !==
                purchases ||
                storedBuyers !== buyers ||
                storedRevenue !==
                revenue ||
                storedConversion !==
                conversion
            ) {
                analyticsUpdates.push({
                updateOne: {
                    filter: {
                    _id:
                        row._id,
                    },

                    update: {
                    $set: {
                        purchases,
                        buyers,
                        revenue,
                        conversion,
                    },
                    },
                },
                });
            }
            }

            if (
            analyticsUpdates.length >
            0
            ) {
            BroadcastCampaign
                .bulkWrite(
                analyticsUpdates
                )
                .catch((error) => {
                console.error(
                    "CRM push analytics persist error:",
                    error
                );
                });
            }

      return res.json({
        ok: true,

        period: {
          key:
            range.key,

          from:
            range.from,

          to:
            range.to,
        },

        campaigns:
          rows.map((row) => ({
            id:
              String(
                row?._id ||
                  ""
              ),

            name:
              String(
                row?.name ||
                  "Рассылка"
              ),

            audience:
              String(
                row?.audience ||
                  "all"
              ),

            status:
              String(
                row?.status ||
                  "queued"
              ),

            recipients:
              Number(
                row?.recipients ||
                  0
              ),

            processed:
              Number(
                row?.processed ||
                  0
              ),

            sent:
              Number(
                row?.sent ||
                  0
              ),

            failed:
              Number(
                row?.failed ||
                  0
              ),

            blocked:
              Number(
                row?.blocked ||
                  0
              ),

            purchases:
              Number(
                row?.purchases ||
                  0
              ),

            buyers:

                Number(

                    row?.buyers || 0

                ),

            revenue:
              Number(
                row?.revenue ||
                  0
              ),

            conversion:
              Number(
                row?.conversion ||
                  0
              ),

            startedAt:
              row?.startedAt ||
              null,

            finishedAt:
              row?.finishedAt ||
              null,

            createdAt:
              row?.createdAt ||
              null,
          })),
      });
    } catch (error) {
      console.error(
        "CRM push campaigns error:",
        error
      );

      return res
        .status(500)
        .json({
          ok: false,

          error:
            error?.message ||
            "CRM_PUSH_CAMPAIGNS_FAILED",
        });
    }
  }
);

// ======================================================
// GET /crm/cashback
// ======================================================

router.get(
  "/cashback",
  async (req, res) => {
    try {
      const range =
        getPeriodRange(
          req.query?.period || "month",
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

      const filter = String(
        req.query?.filter || "all"
      )
        .trim()
        .toLowerCase();

      const users =
        await User.find({})
          .select({
            telegramId: 1,
            username: 1,
            firstName: 1,
            lastName: 1,
            cashbackBalance: 1,
            cashbackLedger: 1,
          })
          .lean();

      /*
       * Использованный кэшбэк
       * считаем по завершённым заказам.
       */
      const usedRows =
        await Order.aggregate([
          {
            $match:
              getCompletedOrderMatch(),
          },

          {
            $addFields: {
              crmSaleDate:
                getSaleDateExpression(),

              crmCashbackUsed: {
                $max: [
                  0,

                  {
                    $subtract: [
                      {
                        $ifNull: [
                          "$payment.cashbackAppliedZl",
                          0,
                        ],
                      },

                      {
                        $ifNull: [
                          "$payment.cashbackRefundedAmountZl",
                          0,
                        ],
                      },
                    ],
                  },
                ],
              },
            },
          },

          {
            $match: {
              crmSaleDate: {
                $lt: range.to,
              },

              crmCashbackUsed: {
                $gt: 0,
              },
            },
          },

          {
            $group: {
              _id:
                "$userTelegramId",

              usedTotal: {
                $sum:
                  "$crmCashbackUsed",
              },

              usedInPeriod: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        {
                          $gte: [
                            "$crmSaleDate",
                            range.from,
                          ],
                        },

                        {
                          $lt: [
                            "$crmSaleDate",
                            range.to,
                          ],
                        },
                      ],
                    },

                    "$crmCashbackUsed",

                    0,
                  ],
                },
              },
            },
          },
        ]);

      const usedByUser =
        new Map();

      let usedInPeriod = 0;

      for (
        const row of usedRows
      ) {
        const telegramId =
          String(
            row?._id || ""
          ).trim();

        usedByUser.set(
          telegramId,
          Number(
            row?.usedTotal || 0
          )
        );

        usedInPeriod +=
          Number(
            row?.usedInPeriod || 0
          );
      }

      const now =
        new Date();

      const fiveDaysMs =
        5 *
        24 *
        60 *
        60 *
        1000;

      let issuedInPeriod = 0;
      let activeBalance = 0;

      let rows =
        users.map(
          (user) => {
            const telegramId =
              String(
                user?.telegramId ||
                  ""
              ).trim();

            const ledger =
              Array.isArray(
                user?.cashbackLedger
              )
                ? user.cashbackLedger
                : [];

            /*
             * Выдано всего.
             */
            const issuedTotal =
              ledger.reduce(
                (
                  sum,
                  entry
                ) =>
                  sum +
                  Number(
                    entry?.amountZl ||
                      0
                  ),

                0
              );

            /*
             * Начислено за выбранный период.
             */
            const userIssuedInPeriod =
              ledger.reduce(
                (
                  sum,
                  entry
                ) => {
                  if (
                    !entry?.earnedAt
                  ) {
                    return sum;
                  }

                  const earnedAt =
                    new Date(
                      entry.earnedAt
                    );

                  if (
                    earnedAt <
                      range.from ||
                    earnedAt >=
                      range.to
                  ) {
                    return sum;
                  }

                  return (
                    sum +
                    Number(
                      entry?.amountZl ||
                        0
                    )
                  );
                },

                0
              );

            issuedInPeriod +=
              userIssuedInPeriod;

            const balance =
              Number(
                user?.cashbackBalance ||
                  0
              );

            activeBalance +=
              balance;

            /*
             * Ищем ближайшую дату,
             * когда сгорит ещё
             * не использованный cashback.
             */
            const activeLedger =
              ledger
                .filter(
                  (entry) => {
                    const remaining =
                      Number(
                        entry?.remainingZl ||
                          0
                      );

                    if (
                      remaining <= 0
                    ) {
                      return false;
                    }

                    if (
                      entry?.expiredAt
                    ) {
                      return false;
                    }

                    if (
                      !entry?.expiresAt
                    ) {
                      return false;
                    }

                    const expiresAt =
                      new Date(
                        entry.expiresAt
                      );

                    return (
                      expiresAt >
                      now
                    );
                  }
                )
                .sort(
                  (a, b) =>
                    new Date(
                      a.expiresAt
                    ).getTime() -
                    new Date(
                      b.expiresAt
                    ).getTime()
                );

            const nearestExpiry =
              activeLedger.length >
              0
                ? new Date(
                    activeLedger[0]
                      .expiresAt
                  )
                : null;

            const msUntilExpiry =
              nearestExpiry
                ? nearestExpiry.getTime() -
                  now.getTime()
                : null;

            const status =
              nearestExpiry &&
              msUntilExpiry >= 0 &&
              msUntilExpiry <=
                fiveDaysMs
                ? "expiring"
                : "active";

            const username =
              String(
                user?.username ||
                  ""
              ).trim();

            const fullName = [
              user?.firstName ||
                "",
              user?.lastName ||
                "",
            ]
              .filter(Boolean)
              .join(" ")
              .trim();

            const name =
              fullName ||
              (
                username
                  ? `@${username}`
                  : telegramId
              );

            return {
              id: String(
                user?._id ||
                  telegramId
              ),

              telegramId,

              username,

              name,

              handle:
                username
                  ? `@${username}`
                  : telegramId,

              balance:
                Number(
                  balance.toFixed(
                    2
                  )
                ),

              issued:
                Number(
                  issuedTotal.toFixed(
                    2
                  )
                ),

              used:
                Number(
                  Number(
                    usedByUser.get(
                      telegramId
                    ) || 0
                  ).toFixed(
                    2
                  )
                ),

              expiresAt:
                nearestExpiry,

              status,
            };
          }
        );

    rows = rows.filter(
        (row) =>
            Number(row?.balance || 0) > 0 ||
            Number(row?.issued || 0) > 0 ||
            Number(row?.used || 0) > 0
        );

      /*
       * Фильтры.
       */
      if (
        filter ===
        "balance"
      ) {
        rows =
          rows.filter(
            (row) =>
              Number(
                row?.balance || 0
              ) > 0
          );
      }

      if (
        filter ===
        "expiring"
      ) {
        rows =
          rows.filter(
            (row) =>
              row?.status ===
              "expiring"
          );
      }

      /*
       * Поиск.
       */
      if (search) {
        rows =
          rows.filter(
            (row) => {
              const haystack = [
                row.name,
                row.handle,
                row.username,
                row.telegramId,
              ]
                .join(" ")
                .toLowerCase();

              return (
                haystack.includes(
                  search
                )
              );
            }
          );
      }

      /*
       * Сначала те,
       * у кого скоро сгорит.
       */
      rows.sort(
        (a, b) => {
          if (
            a.status ===
              "expiring" &&
            b.status !==
              "expiring"
          ) {
            return -1;
          }

          if (
            a.status !==
              "expiring" &&
            b.status ===
              "expiring"
          ) {
            return 1;
          }

          const aExpiry =
            a.expiresAt
              ? new Date(
                  a.expiresAt
                ).getTime()
              : Infinity;

          const bExpiry =
            b.expiresAt
              ? new Date(
                  b.expiresAt
                ).getTime()
              : Infinity;

          if (
            aExpiry !==
            bExpiry
          ) {
            return (
              aExpiry -
              bExpiry
            );
          }

          return (
            Number(
              b.balance || 0
            ) -
            Number(
              a.balance || 0
            )
          );
        }
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
        (
          safePage - 1
        ) * limit;

      const pageRows =
        rows.slice(
          start,
          start + limit
        );

      const issued =
        Number(
          issuedInPeriod.toFixed(
            2
          )
        );

      const used =
        Number(
          usedInPeriod.toFixed(
            2
          )
        );

      const balance =
        Number(
          activeBalance.toFixed(
            2
          )
        );

      const utilisation =
        issued > 0
          ? Number(
              (
                (
                  used /
                  issued
                ) *
                100
              ).toFixed(
                1
              )
            )
          : 0;

      return res.json({
        ok: true,

        period: {
          key:
            range.key,

          from:
            range.from,

          to:
            range.to,
        },

        summary: {
          issued,
          used,
          balance,
          utilisation,
        },

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
        "GET /crm/cashback error:",
        error
      );

      return res
        .status(500)
        .json({
          ok: false,
          error:
            "CASHBACK_LOAD_FAILED",
        });
    }
  }
);

// ======================================================
// GET /crm/locations
// ======================================================

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

// ======================================================
// GET /crm/products
// ======================================================

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

      const rows =
        Array.isArray(
          productPerformance?.rows
        )
          ? productPerformance.rows
          : [];

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
          revenue,
          sold,
          bestsellers,
          slow,
          ending,
          stockValue,
        },

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

// ======================================================
// GET /crm/partners
// ======================================================

router.get(
  "/partners",
  async (req, res) => {
    try {
      const range =
        getPeriodRange(
          req.query?.period ||
            "month",

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
            ) || 25
          )
        );

      const search =
        String(
          req.query?.search || ""
        )
          .trim()
          .toLowerCase();

      const partners =
        await User.find({
          "referral.code": {
            $type: "string",
            $ne: "",
          },
        })
          .select({
            telegramId: 1,
            username: 1,
            firstName: 1,
            lastName: 1,
            "referral.code": 1,
          })
          .lean();

      const partnerTelegramIds =
        partners
          .map((partner) =>
            String(
              partner?.telegramId ||
                ""
            ).trim()
          )
          .filter(Boolean);

      /*
       * Приглашённые пользователи
       * текущего периода.
       */
      const currentInvited =
        partnerTelegramIds.length
          ? await User.find({
              "referral.invitedByTelegramId": {
                $in:
                  partnerTelegramIds,
              },

              createdAt: {
                $gte:
                  range.from,
                $lt:
                  range.to,
              },
            })
              .select({
                telegramId: 1,
                createdAt: 1,
                "referral.invitedByTelegramId": 1,
              })
              .lean()
          : [];

      /*
       * Приглашённые предыдущего
       * периода — для тренда.
       */
      const previousInvited =
        range.previousFrom &&
        range.previousTo &&
        partnerTelegramIds.length
          ? await User.find({
              "referral.invitedByTelegramId": {
                $in:
                  partnerTelegramIds,
              },

              createdAt: {
                $gte:
                  range.previousFrom,

                $lt:
                  range.previousTo,
              },
            })
              .select({
                telegramId: 1,
                "referral.invitedByTelegramId": 1,
              })
              .lean()
          : [];

      const currentInvitedIds =
        currentInvited
          .map((user) =>
            String(
              user?.telegramId ||
                ""
            ).trim()
          )
          .filter(Boolean);

      const previousInvitedIds =
        previousInvited
          .map((user) =>
            String(
              user?.telegramId ||
                ""
            ).trim()
          )
          .filter(Boolean);

      /*
       * Продажи текущего периода.
       */
      const currentSales =
        currentInvitedIds.length
          ? await Order.aggregate([
              {
                $match: {
                  ...getCompletedOrderMatch(),

                  userTelegramId: {
                    $in:
                      currentInvitedIds,
                  },
                },
              },

              {
                $addFields: {
                  crmSaleDate:
                    getSaleDateExpression(),
                },
              },

              {
                $match: {
                  crmSaleDate: {
                    $gte:
                      range.from,

                    $lt:
                      range.to,
                  },
                },
              },

              {
                $project: {
                  userTelegramId: 1,
                  totalZl: 1,
                  crmSaleDate: 1,
                },
              },
            ])
          : [];

      /*
       * Все продажи текущих
       * приглашённых до конца периода.
       *
       * Нужны для LTV.
       */
      const lifetimeSales =
        currentInvitedIds.length
          ? await Order.aggregate([
              {
                $match: {
                  ...getCompletedOrderMatch(),

                  userTelegramId: {
                    $in:
                      currentInvitedIds,
                  },
                },
              },

              {
                $addFields: {
                  crmSaleDate:
                    getSaleDateExpression(),
                },
              },

              {
                $match: {
                  crmSaleDate: {
                    $lt:
                      range.to,
                  },
                },
              },

              {
                $project: {
                  userTelegramId: 1,
                  totalZl: 1,
                  crmSaleDate: 1,
                },
              },
            ])
          : [];

      /*
       * Предыдущий период
       * нужен только для тренда.
       */
      const previousSales =
        range.previousFrom &&
        range.previousTo &&
        previousInvitedIds.length
          ? await Order.aggregate([
              {
                $match: {
                  ...getCompletedOrderMatch(),

                  userTelegramId: {
                    $in:
                      previousInvitedIds,
                  },
                },
              },

              {
                $addFields: {
                  crmSaleDate:
                    getSaleDateExpression(),
                },
              },

              {
                $match: {
                  crmSaleDate: {
                    $gte:
                      range.previousFrom,

                    $lt:
                      range.previousTo,
                  },
                },
              },

              {
                $project: {
                  userTelegramId: 1,
                  totalZl: 1,
                },
              },
            ])
          : [];

      /*
       * user -> partner
       */
      const currentPartnerByUser =
        new Map();

      for (
        const user of currentInvited
      ) {
        const telegramId =
          String(
            user?.telegramId ||
              ""
          ).trim();

        const partnerId =
          String(
            user?.referral
              ?.invitedByTelegramId ||
              ""
          ).trim();

        if (
          telegramId &&
          partnerId
        ) {
          currentPartnerByUser.set(
            telegramId,
            partnerId
          );
        }
      }

      const previousPartnerByUser =
        new Map();

      for (
        const user of previousInvited
      ) {
        const telegramId =
          String(
            user?.telegramId ||
              ""
          ).trim();

        const partnerId =
          String(
            user?.referral
              ?.invitedByTelegramId ||
              ""
          ).trim();

        if (
          telegramId &&
          partnerId
        ) {
          previousPartnerByUser.set(
            telegramId,
            partnerId
          );
        }
      }

      /*
       * partner -> stats
       */
      const stats =
        new Map();

      for (
        const partner of partners
      ) {
        const telegramId =
          String(
            partner?.telegramId ||
              ""
          ).trim();

        if (!telegramId) {
          continue;
        }

        stats.set(
          telegramId,
          {
            invited:
              new Set(),

            buyers:
              new Set(),

            orders:
              0,

            revenue:
              0,

            ltv:
              0,

            previousRevenue:
              0,
          }
        );
      }

      /*
       * Приглашённые.
       */
      for (
        const user of currentInvited
      ) {
        const userId =
          String(
            user?.telegramId ||
              ""
          ).trim();

        const partnerId =
          String(
            user?.referral
              ?.invitedByTelegramId ||
              ""
          ).trim();

        stats
          .get(partnerId)
          ?.invited.add(
            userId
          );
      }

      /*
       * Продажи периода.
       */
      for (
        const order of currentSales
      ) {
        const buyerId =
          String(
            order?.userTelegramId ||
              ""
          ).trim();

        const partnerId =
          currentPartnerByUser.get(
            buyerId
          );

        if (!partnerId) {
          continue;
        }

        const row =
          stats.get(
            partnerId
          );

        if (!row) {
          continue;
        }

        row.buyers.add(
          buyerId
        );

        row.orders += 1;

        row.revenue +=
          Number(
            order?.totalZl ||
              0
          );
      }

      /*
       * Lifetime revenue.
       */
      for (
        const order of lifetimeSales
      ) {
        const buyerId =
          String(
            order?.userTelegramId ||
              ""
          ).trim();

        const partnerId =
          currentPartnerByUser.get(
            buyerId
          );

        if (!partnerId) {
          continue;
        }

        const row =
          stats.get(
            partnerId
          );

        if (!row) {
          continue;
        }

        row.ltv +=
          Number(
            order?.totalZl ||
              0
          );
      }

      /*
       * Предыдущая выручка.
       */
      for (
        const order of previousSales
      ) {
        const buyerId =
          String(
            order?.userTelegramId ||
              ""
          ).trim();

        const partnerId =
          previousPartnerByUser.get(
            buyerId
          );

        if (!partnerId) {
          continue;
        }

        const row =
          stats.get(
            partnerId
          );

        if (!row) {
          continue;
        }

        row.previousRevenue +=
          Number(
            order?.totalZl ||
              0
          );
      }

      let rows =
        partners.map(
          (partner) => {
            const telegramId =
              String(
                partner?.telegramId ||
                  ""
              ).trim();

            const stat =
              stats.get(
                telegramId
              ) || {
                invited:
                  new Set(),

                buyers:
                  new Set(),

                orders:
                  0,

                revenue:
                  0,

                ltv:
                  0,

                previousRevenue:
                  0,
              };

            const invited =
              stat.invited.size;

            const bought =
              stat.buyers.size;

            const revenue =
              Number(
                Number(
                  stat.revenue ||
                    0
                ).toFixed(2)
              );

            const previousRevenue =
              Number(
                Number(
                  stat.previousRevenue ||
                    0
                ).toFixed(2)
              );

            const ltv =
              Number(
                Number(
                  stat.ltv ||
                    0
                ).toFixed(2)
              );

            const conversion =
              invited > 0
                ? Number(
                    (
                      (
                        bought /
                        invited
                      ) *
                      100
                    ).toFixed(1)
                  )
                : 0;

            const avgCheck =
              stat.orders > 0
                ? Number(
                    (
                      revenue /
                      stat.orders
                    ).toFixed(2)
                  )
                : 0;

            const username =
              String(
                partner
                  ?.username ||
                  ""
              )
                .trim()
                .replace(
                  /^@+/,
                  ""
                );

            const fullName =
              [
                partner
                  ?.firstName ||
                  "",

                partner
                  ?.lastName ||
                  "",
              ]
                .filter(Boolean)
                .join(" ")
                .trim();

            const name =
              fullName ||
              (
                username
                  ? `@${username}`
                  : telegramId
              );

            return {
              id:
                String(
                  partner?._id ||
                    telegramId
                ),

              telegramId,

              name,

              username,

              handle:
                username
                  ? `@${username}`
                  : telegramId,

              invited,

              bought,

              conversion,

              revenue,

              avgCheck,

              ltv,

              trend:
                range.previousFrom &&
                range.previousTo
                  ? percentChange(
                      revenue,
                      previousRevenue
                    )
                  : null,
            };
          }
        );

      /*
       * На странице нет смысла
       * показывать пользователей,
       * которые создали referral.code,
       * но вообще никого не привели.
       */
      rows =
        rows.filter(
          (row) =>
            row.invited > 0
        );

      /*
       * KPI считаем без поиска.
       */
      const totalPartners =
        rows.length;

      if (search) {
        rows =
          rows.filter(
            (row) => {
              const haystack =
                [
                  row.name,
                  row.username,
                  row.handle,
                  row.telegramId,
                ]
                  .join(" ")
                  .toLowerCase();

              return (
                haystack.includes(
                  search
                )
              );
            }
          );
      }

      rows.sort(
        (a, b) =>
          b.revenue -
          a.revenue
      );

      const total =
        rows.length;

      const pageCount =
        Math.max(
          1,
          Math.ceil(
            total /
              limit
          )
        );

      const safePage =
        Math.min(
          page,
          pageCount
        );

      const start =
        (
          safePage -
          1
        ) * limit;

      const pageRows =
        rows.slice(
          start,
          start + limit
        );

      return res.json({
        ok: true,

        period: {
          key:
            range.key,

          from:
            range.from,

          to:
            range.to,
        },

        summary: {
          totalPartners,
        },

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
        "GET /crm/partners error:",
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
            "PARTNERS_LOAD_FAILED",
        });
    }
  }
);

// ======================================================
// GET /crm/leads
// ======================================================

router.get(
  "/leads",
  async (req, res) => {
    try {
      const range =
        getPeriodRange(
          req.query?.period ||
            "month",

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
            ) || 50
          )
        );

      const search =
        String(
          req.query?.search || ""
        )
          .trim()
          .toLowerCase();

        /*
        * Лид =
        * любой пользователь,
        * который появился в User,
        * но ещё не совершил
        * завершённую покупку.
        */
        const users =
        await User.find({
            telegramId: {
            $exists: true,
            $ne: "",
            },

            createdAt: {
            $gte: range.from,
            $lt: range.to,
            },
        })
          .select({
            telegramId: 1,
            username: 1,
            firstName: 1,
            lastName: 1,
            createdAt: 1,

            "referral.invitedByTelegramId": 1,
          })
          .lean();

        const telegramIds =

        users

            .map((user) =>
            String(
              user?.telegramId || ""
            ).trim()
          )
          .filter(Boolean);

      /*
       * Ищем завершённые покупки
       * этих приглашённых пользователей.
       */
      const sales =
        telegramIds.length > 0
          ? await Order.aggregate([
              {
                $match: {
                  ...getCompletedOrderMatch(),

                  userTelegramId: {
                    $in: telegramIds,
                  },
                },
              },

              {
                $addFields: {
                  crmSaleDate:
                    getSaleDateExpression(),
                },
              },

              {
                $match: {
                  crmSaleDate: {
                    $lt: range.to,
                  },
                },
              },

              {
                $project: {
                  userTelegramId: 1,
                  totalZl: 1,
                  crmSaleDate: 1,
                },
              },

              {
                $sort: {
                  crmSaleDate: 1,
                },
              },
            ])
          : [];

      const salesByTelegramId =
        new Map();

      for (const sale of sales) {
        const telegramId =
          String(
            sale?.userTelegramId ||
              ""
          ).trim();

        if (!telegramId) {
          continue;
        }

        if (
          !salesByTelegramId.has(
            telegramId
          )
        ) {
          salesByTelegramId.set(
            telegramId,
            []
          );
        }

        salesByTelegramId
          .get(telegramId)
          .push(sale);
      }

      /*
       * Для прошлых периодов нельзя
       * считать возраст лида относительно
       * сегодняшнего дня.
       *
       * Поэтому точкой отсчёта является
       * конец выбранного периода.
       *
       * Для текущего периода — сейчас.
       */
      const now =
        new Date();

      const referenceDate =
        range.to < now
          ? range.to
          : now;

        let rows =

        users.map(
          (user) => {
            const telegramId =
              String(
                user?.telegramId ||
                  ""
              ).trim();

            const userSales =
              salesByTelegramId.get(
                telegramId
              ) || [];

            const completedPurchases =
              userSales.length;

            const completedTotal =
              Number(
                userSales
                  .reduce(
                    (
                      sum,
                      order
                    ) =>
                      sum +
                      Number(
                        order
                          ?.totalZl ||
                          0
                      ),
                    0
                  )
                  .toFixed(2)
              );

            const firstPurchaseAt =
              userSales[0]
                ?.crmSaleDate ||
              null;

            const createdAt =
              user?.createdAt
                ? new Date(
                    user.createdAt
                  )
                : null;

            const daysSinceCreated =
              createdAt
                ? Math.max(
                    0,

                    Math.floor(
                      (
                        referenceDate.getTime() -
                        createdAt.getTime()
                      ) /
                        (
                          24 *
                          60 *
                          60 *
                          1000
                        )
                    )
                  )
                : 0;

            const firstPurchaseDays =
              createdAt &&
              firstPurchaseAt
                ? Math.max(
                    0,

                    Math.floor(
                      (
                        new Date(
                          firstPurchaseAt
                        ).getTime() -
                        createdAt.getTime()
                      ) /
                        (
                          24 *
                          60 *
                          60 *
                          1000
                        )
                    )
                  )
                : null;

            /*
             * Логика статуса:
             *
             * Есть покупка -> Клиент
             *
             * Нет покупки,
             * прошло > 8 дней
             * -> Спящий лид
             *
             * Иначе -> Лид
             */
            let status =
              "lead";

            let inLeads =
              daysSinceCreated;

            if (
              completedPurchases >
              0
            ) {
              status =
                "client";

              inLeads =
                firstPurchaseDays ??
                0;
            } else if (
              daysSinceCreated >
              8
            ) {
              status =
                "sleeping";
            }

            const username =
              String(
                user?.username ||
                  ""
              )
                .trim()
                .replace(
                  /^@+/,
                  ""
                );

            const fullName =
              [
                user?.firstName ||
                  "",
                user?.lastName ||
                  "",
              ]
                .filter(Boolean)
                .join(" ")
                .trim();

            return {
              id:
                telegramId,

              telegramId,

              name:
                fullName ||
                (
                  username
                    ? `@${username}`
                    : telegramId
                ),

              username,

              handle:
                username
                  ? `@${username}`
                  : telegramId,

              inviterTelegramId:
                String(
                  user?.referral
                    ?.invitedByTelegramId ||
                    ""
                ).trim(),

              createdAt,

              inLeads,

              completedPurchases,

              completedTotal,

              firstPurchaseAt,

              status,
            };
          }
        );

        /*
        * После первой завершённой
        * покупки пользователь
        * перестаёт быть лидом.
        */
        rows =
        rows.filter(
            (row) =>
            Number(
                row?.completedPurchases || 0
            ) === 0
        );

      /*
       * KPI считаем до поиска.
       */
      const leads =
        rows.filter(
          (row) =>
            row.status ===
            "lead"
        ).length;

      const sleeping =
        rows.filter(
          (row) =>
            row.status ===
            "sleeping"
        ).length;

        const clients = 0;

      const totalInvited =
        rows.length;

        const conversion = 0;

      /*
       * Поиск.
       */
      if (search) {
        rows =
          rows.filter(
            (row) => {
              const haystack =
                [
                  row.name,
                  row.username,
                  row.handle,
                  row.telegramId,
                  row.inviterTelegramId,
                ]
                  .join(" ")
                  .toLowerCase();

              return (
                haystack.includes(
                  search
                )
              );
            }
          );
      }

      /*
       * Новые регистрации сверху.
       */
      rows.sort(
        (a, b) => {
          const aDate =
            a.createdAt
              ? new Date(
                  a.createdAt
                ).getTime()
              : 0;

          const bDate =
            b.createdAt
              ? new Date(
                  b.createdAt
                ).getTime()
              : 0;

          return (
            bDate - aDate
          );
        }
      );

      const total =
        rows.length;

      const pageCount =
        Math.max(
          1,
          Math.ceil(
            total /
              limit
          )
        );

      const safePage =
        Math.min(
          page,
          pageCount
        );

      const start =
        (
          safePage -
          1
        ) *
        limit;

      const pageRows =
        rows.slice(
          start,
          start + limit
        );

      return res.json({
        ok: true,

        period: {
          key:
            range.key,

          from:
            range.from,

          to:
            range.to,
        },

        summary: {
          leads,
          sleeping,
          clients,
          conversion,
          totalInvited,
        },

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
        "GET /crm/leads error:",
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
            "LEADS_LOAD_FAILED",
        });
    }
  }
);

// ======================================================
// GET /crm/customers
// ======================================================

router.get(
  "/customers",
  async (req, res) => {
    try {
      const range =
        getPeriodRange(
          req.query?.period ||
            "month",

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
            ) || 50
          )
        );

      const search =
        String(
          req.query?.search || ""
        )
          .trim()
          .toLowerCase();

          const sortKey = String(
  req.query?.sortKey || ""
).trim();

const sortDirection =
  String(
    req.query?.sortDirection ||
      "desc"
  ).toLowerCase() === "asc"
    ? "asc"
    : "desc";

      const statusFilter =
        String(
          req.query?.status ||
            "all"
        )
          .trim()
          .toLowerCase();

      /*
       * Берём всю историю завершённых
       * покупок до конца периода.
       *
       * Это позволяет считать:
       * - LTV
       * - первую покупку
       * - последнюю покупку
       * - количество покупок
       * - средний интервал
       */
      const salesHistory =
        await loadSalesHistory(
          range.to
        );

      const salesByCustomer =
        new Map();

      for (
        const order of salesHistory
      ) {
        const telegramId =
          String(
            order?.userTelegramId ||
              ""
          ).trim();

        if (!telegramId) {
          continue;
        }

        if (
          !salesByCustomer.has(
            telegramId
          )
        ) {
          salesByCustomer.set(
            telegramId,
            []
          );
        }

        salesByCustomer
          .get(telegramId)
          .push(order);
      }

      const telegramIds =
        Array.from(
          salesByCustomer.keys()
        );

      /*
       * Подтягиваем профили клиентов.
       */
      const users =
        telegramIds.length > 0
          ? await User.find({
              telegramId: {
                $in: telegramIds,
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

      const userByTelegramId =
        new Map(
          users.map(
            (user) => [
              String(
                user?.telegramId ||
                  ""
              ).trim(),

              user,
            ]
          )
        );

    const favoriteCustomerRows =
        telegramIds.length > 0
            ? await mongoose.connection
                .collection(
                CRM_FAVORITE_CUSTOMERS_COLLECTION
                )
                .find({
                telegramId: {
                    $in: telegramIds,
                },
                isFavorite: true,
                })
                .project({
                telegramId: 1,
                })
                .toArray()
            : [];

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

      /*
       * Собираем клиентов.
       */
      let rows =
        telegramIds.map(
          (telegramId) => {
            const orders =
              salesByCustomer.get(
                telegramId
              ) || [];

            const sortedOrders =
              [...orders].sort(
                (a, b) =>
                  new Date(
                    a.crmSaleDate
                  ).getTime() -
                  new Date(
                    b.crmSaleDate
                  ).getTime()
              );

            const firstOrder =
              sortedOrders[0] ||
              null;

            const lastOrder =
              sortedOrders[
                sortedOrders.length -
                  1
              ] || null;

            const firstSaleAt =
              firstOrder
                ?.crmSaleDate ||
              null;

            const lastSaleAt =
              lastOrder
                ?.crmSaleDate ||
              null;

            const purchases =
              sortedOrders.length;

            /*
             * LTV:
             * вся завершённая выручка
             * клиента до конца периода.
             */
            const ltv =
              Number(
                sortedOrders
                  .reduce(
                    (
                      sum,
                      order
                    ) =>
                      sum +
                      Number(
                        order
                          ?.totalZl ||
                          0
                      ),
                    0
                  )
                  .toFixed(2)
              );

            const avgCheck =
              purchases > 0
                ? Number(
                    (
                      ltv /
                      purchases
                    ).toFixed(2)
                  )
                : 0;

            const interval =
              getAveragePurchaseIntervalDays(
                sortedOrders.map(
                  (order) =>
                    order.crmSaleDate
                )
              );

            const user =
              userByTelegramId.get(
                telegramId
              );

            const name =
              [
                user?.firstName ||
                  "",
                user?.lastName ||
                  "",
              ]
                .filter(Boolean)
                .join(" ")
                .trim();

            const username =
              String(
                user?.username ||
                  ""
              )
                .trim()
                .replace(
                  /^@+/,
                  ""
                );

            const status =
              getCustomerStatus({
                firstSaleAt,
                lastSaleAt,
                range,
              });

            /*
             * Дополнительно сохраняем
             * показатели именно выбранного
             * периода. Потом пригодятся
             * для аналитики.
             */
            const ordersInPeriod =
              sortedOrders.filter(
                (order) => {
                  const saleDate =
                    new Date(
                      order.crmSaleDate
                    );

                  return (
                    saleDate >=
                      range.from &&
                    saleDate <
                      range.to
                  );
                }
              );

            const purchasesInPeriod =
              ordersInPeriod.length;

            const revenueInPeriod =
              Number(
                ordersInPeriod
                  .reduce(
                    (
                      sum,
                      order
                    ) =>
                      sum +
                      Number(
                        order
                          ?.totalZl ||
                          0
                      ),
                    0
                  )
                  .toFixed(2)
              );

            return {
              id:
                telegramId,

              telegramId,

                isFavorite:

                favoriteCustomerIds.has(

                telegramId

                ),

              name:
                name ||
                (
                  username
                    ? `@${username}`
                    : telegramId
                ),

              username,

              handle:
                username
                  ? `@${username}`
                  : telegramId,

              status,

              segment:
                getCustomerSegment(
                  purchases
                ),

              ltv,

              purchases,

              purchasesInPeriod,

              revenueInPeriod,

              interval,

              avgCheck,

              firstSaleAt,

              lastOrder:
                lastSaleAt,

              cashback:
                Number(
                  user
                    ?.cashbackBalance ||
                    0
                ),
            };
          }
        );

      /*
       * KPI считаем ДО фильтра
       * и поиска.
       */
      const customers =
        rows.length;

      /*
       * Активных считаем отдельно.
       *
       * Новый клиент тоже может быть
       * активным, поэтому здесь нельзя
       * просто считать status === active.
       */
      const active =
        rows.filter(
          (row) =>
            isCustomerActive(
              row.lastOrder,
              range
            )
        ).length;

      const topLtv =
        rows.reduce(
          (
            max,
            row
          ) =>
            Math.max(
              max,
              Number(
                row.ltv || 0
              )
            ),
          0
        );

      const totalRevenue =
        rows.reduce(
          (
            sum,
            row
          ) =>
            sum +
            Number(
              row.ltv || 0
            ),
          0
        );

      const totalPurchases =
        rows.reduce(
          (
            sum,
            row
          ) =>
            sum +
            Number(
              row.purchases ||
                0
            ),
          0
        );

      const averageCheck =
        totalPurchases > 0
          ? Number(
              (
                totalRevenue /
                totalPurchases
              ).toFixed(2)
            )
          : 0;

      /*
       * Фильтр статуса.
       */
      if (
        statusFilter !== "all"
      ) {
        rows =
          rows.filter(
            (row) =>
              row.status ===
              statusFilter
          );
      }

      /*
       * Поиск:
       * имя / username / TG ID.
       */
      if (search) {
        rows =
          rows.filter(
            (row) => {
              const haystack =
                [
                  row.name,
                  row.username,
                  row.handle,
                  row.telegramId,
                ]
                  .join(" ")
                  .toLowerCase();

              return (
                haystack.includes(
                  search
                )
              );
            }
          );
      }

/*
 * Сортировка выполняется ДО
 * пагинации, поэтому работает
 * по всей выборке клиентов,
 * а не только по текущим 50.
 */
const sortableCustomerKeys =
  new Set([
    "ltv",
    "purchases",
    "avgCheck",
    "cashback",
  ]);

if (
  sortableCustomerKeys.has(
    sortKey
  )
) {
  rows.sort(
    (a, b) => {
      const left =
        Number(
          a?.[sortKey] || 0
        );

      const right =
        Number(
          b?.[sortKey] || 0
        );

      return (
        sortDirection === "asc"
          ? left - right
          : right - left
      );
    }
  );
} else {
  /*
   * Если сортировка не выбрана —
   * оставляем старое поведение:
   * последние покупавшие сверху.
   */
  rows.sort(
    (a, b) => {
      const aDate =
        a.lastOrder
          ? new Date(
              a.lastOrder
            ).getTime()
          : 0;

      const bDate =
        b.lastOrder
          ? new Date(
              b.lastOrder
            ).getTime()
          : 0;

      return (
        bDate - aDate
      );
    }
  );
}

      const total =
        rows.length;

      const pageCount =
        Math.max(
          1,
          Math.ceil(
            total /
              limit
          )
        );

      const safePage =
        Math.min(
          page,
          pageCount
        );

      const start =
        (
          safePage -
          1
        ) * limit;

      const pageRows =
        rows.slice(
          start,
          start + limit
        );

      return res.json({
        ok: true,

        period: {
          key:
            range.key,

          from:
            range.from,

          to:
            range.to,
        },

        summary: {
          customers,
          active,
          topLtv,
          averageCheck,
        },

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
        "GET /crm/customers error:",
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
            "CUSTOMERS_LOAD_FAILED",
        });
    }
  }
);

router.patch(
  "/customers/:telegramId/favorite",
  requireCrmPushAdmin,
  express.json(),
  async (req, res) => {
    try {
      const telegramId =
        String(
          req.params?.telegramId || ""
        ).trim();

      if (!telegramId) {
        return res
          .status(400)
          .json({
            ok: false,
            error:
              "TELEGRAM_ID_REQUIRED",
          });
      }

      const userExists =
        await User.exists({
          telegramId,
        });

      if (!userExists) {
        return res
          .status(404)
          .json({
            ok: false,
            error:
              "CUSTOMER_NOT_FOUND",
          });
      }

      const isFavorite =
        req.body?.isFavorite === true;

      const now =
        new Date();

      await mongoose.connection
        .collection(
          CRM_FAVORITE_CUSTOMERS_COLLECTION
        )
        .updateOne(
          {
            telegramId,
          },
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
          {
            upsert: true,
          }
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

      return res
        .status(500)
        .json({
          ok: false,
          error:
            "CUSTOMER_FAVORITE_UPDATE_FAILED",
        });
    }
  }
);

// ======================================================
// GET /crm/dashboard
// ======================================================

router.get(
  "/dashboard",
  async (req, res) => {
    try {
      const range =
        getPeriodRange(
          req.query?.period ||
            "month",

          req.query?.from || "",

          req.query?.to || ""
        );

        let currentOrders;
        let previousOrders = [];

        let currentCanceled = 0;
        let previousCanceled = 0;

        const firstSalesPromise =
        loadFirstSales();

        const salesHistoryPromise =
        loadSalesHistory(
            range.to
        );

        if (range.key === "all") {
        [
            currentOrders,
            currentCanceled,
        ] = await Promise.all([
            loadSales(
            range.from,
            range.to
            ),

            loadCanceledCount(
            range.from,
            range.to
            ),
        ]);
        } else {
        [
            currentOrders,
            previousOrders,
            currentCanceled,
            previousCanceled,
        ] = await Promise.all([
            loadSales(
            range.from,
            range.to
            ),

            loadSales(
            range.previousFrom,
            range.previousTo
            ),

            loadCanceledCount(
            range.from,
            range.to
            ),

            loadCanceledCount(
            range.previousFrom,
            range.previousTo
            ),
        ]);
        }

        const firstSales =
        await firstSalesPromise;

        const salesHistory =
        await salesHistoryPromise;

        const firstSaleByUser =
        new Map(
            firstSales.map((row) => [
            String(row?._id || ""),
            new Date(row.firstSaleAt),
            ])
        );

        const current =
        buildMetrics(
            currentOrders,
            range.from,
            range.to,
            currentCanceled,
            firstSaleByUser
        );

        const previous =
        range.key === "all"
            ? null
            : buildMetrics(
                previousOrders,
                range.previousFrom,
                range.previousTo,
                previousCanceled,
                firstSaleByUser
            );

      const hasComparison =
        range.key !== "all";

        const productPerformance =
        await buildProductPerformance({
            currentOrders,
            previousOrders,
            salesHistory,
            range,
            hasComparison,
        });

        const [
            currentCanceledOrdersForLocations,
            previousCanceledOrdersForLocations,
        ] = await Promise.all([
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

        const locationPerformance =

        await buildLocationPerformance({

            currentOrders,

            previousOrders,

            salesHistory,

            currentCanceledOrders:

            currentCanceledOrdersForLocations,

            previousCanceledOrders:

            previousCanceledOrdersForLocations,

            hasComparison,

        });

        const topPartners =
        await buildTopPartners({
            currentOrders,
        });

        const historyByCustomer =
        new Map();

        for (
        const order of salesHistory
        ) {
        const telegramId =
            String(
            order?.userTelegramId ||
                ""
            ).trim();

        if (!telegramId) continue;

        if (
            !historyByCustomer.has(
            telegramId
            )
        ) {
            historyByCustomer.set(
            telegramId,
            []
            );
        }

        historyByCustomer
            .get(telegramId)
            .push(order);
        }

        let repeatRevenue = 0;
        let intervalTotalMs = 0;
        let intervalCount = 0;

        for (
        const orders of
        historyByCustomer.values()
        ) {
        for (
            let index = 1;
            index < orders.length;
            index += 1
        ) {
            const order =
            orders[index];

            const previousOrder =
            orders[index - 1];

            const orderDate =
            new Date(
                order.crmSaleDate
            );

            if (
            orderDate < range.from ||
            orderDate >= range.to
            ) {
            continue;
            }

            repeatRevenue +=
            Number(
                order?.totalZl || 0
            );

            const previousDate =
            new Date(
                previousOrder.crmSaleDate
            );

            const intervalMs =
            orderDate.getTime() -
            previousDate.getTime();

            if (intervalMs >= 0) {
            intervalTotalMs +=
                intervalMs;

            intervalCount += 1;
            }
        }
        }

        const averageRepeatIntervalDays =
        intervalCount > 0
            ? Number(
                (
                intervalTotalMs /
                intervalCount /
                (
                    24 *
                    60 *
                    60 *
                    1000
                )
                ).toFixed(1)
            )
            : 0;

        const retention = {
        rate:
            current
            .repeatCustomersPercent,

        change:
            hasComparison
            ? percentagePoints(
                current
                    .repeatCustomersPercent,
                previous
                    .repeatCustomersPercent
                )
            : null,

        newShare:
            current
            .newCustomersPercent,

        repeatShare:
            current
            .repeatCustomersPercent,

        averageIntervalDays:
            averageRepeatIntervalDays,

        repeatRevenue:
            Number(
            repeatRevenue.toFixed(2)
            ),
        };

    const dynamicsMap =
        new Map();

        const seenCustomersInPeriod =
        new Set();

        const sortedCurrentOrders =
        [...currentOrders].sort(
            (a, b) =>
            new Date(
                a.crmSaleDate
            ).getTime() -
            new Date(
                b.crmSaleDate
            ).getTime()
        );

        for (
        const order of
        sortedCurrentOrders
        ) {
        const dateKey =
            new Intl.DateTimeFormat(
            "en-CA",
            {
                timeZone:
                CRM_TIME_ZONE,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
            }
            ).format(
            new Date(
                order.crmSaleDate
            )
            );

        if (
            !dynamicsMap.has(
            dateKey
            )
        ) {
            dynamicsMap.set(
            dateKey,
            {
                date: dateKey,
                revenue: 0,
                orders: 0,
                cancellations: 0,
                newCustomers:
                new Set(),
                repeatCustomers:
                new Set(),
            }
            );
        }

        const row =
            dynamicsMap.get(
            dateKey
            );

        const telegramId =
            String(
            order?.userTelegramId ||
                ""
            ).trim();

        const firstSaleAt =
            firstSaleByUser.get(
            telegramId
            );

        const isFirstOrderInPeriod =
            telegramId &&
            !seenCustomersInPeriod.has(
            telegramId
            );

        row.revenue +=
            Number(
            order?.totalZl || 0
            );

        row.orders += 1;

        if (
            telegramId &&
            isFirstOrderInPeriod &&
            firstSaleAt &&
            firstSaleAt >=
            range.from &&
            firstSaleAt <
            range.to
        ) {
            row.newCustomers.add(
            telegramId
            );
        } else if (
            telegramId
        ) {
            row.repeatCustomers.add(
            telegramId
            );
        }

        if (telegramId) {
            seenCustomersInPeriod.add(
            telegramId
            );
        }
        }

        const currentCanceledOrders =
            await Order.aggregate([
                {
                $match: {
                    status: {
                    $in: [
                        "canceled",
                        "annulled",
                    ],
                    },
                },
                },

                {
                $addFields: {
                    crmCanceledAt: {
                    $cond: [
                        {
                        $eq: [
                            "$status",
                            "annulled",
                        ],
                        },

                        "$annulledAt",

                        "$canceledAt",
                    ],
                    },
                },
                },

                {
                $match: {
                    crmCanceledAt: {
                    $gte: range.from,
                    $lt: range.to,
                    },
                },
                },

                {
                $project: {
                    crmCanceledAt: 1,
                },
                },
            ]);

            for (
            const order of
            currentCanceledOrders
            ) {
            const dateKey =
                new Intl.DateTimeFormat(
                "en-CA",
                {
                    timeZone:
                    CRM_TIME_ZONE,

                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                }
                ).format(
                new Date(
                    order.crmCanceledAt
                )
                );

            if (
                !dynamicsMap.has(
                dateKey
                )
            ) {
                dynamicsMap.set(
                dateKey,
                {
                    date: dateKey,
                    revenue: 0,
                    orders: 0,
                    cancellations: 0,
                    newCustomers:
                    new Set(),
                    repeatCustomers:
                    new Set(),
                }
                );
            }

            const row =
                dynamicsMap.get(
                dateKey
                );

            row.cancellations += 1;
        }

        const businessDynamics =
        Array.from(
            dynamicsMap.values()
        )
            .sort(
            (a, b) =>
                a.date.localeCompare(
                b.date
                )
            )

            .map((row) => ({
            date:
                row.date,

            revenue:
                Number(
                row.revenue.toFixed(
                    2
                )
                ),

            orders:
                row.orders,

            cancellations:
                row.cancellations,

            cancellationsPercent:
                (
                row.orders +
                row.cancellations
                ) > 0
                ? Number(
                    (
                        (
                        row.cancellations /
                        (
                            row.orders +
                            row.cancellations
                        )
                        ) *
                        100
                    ).toFixed(1)
                    )
                : 0,

            newCustomers:
                row.newCustomers.size,

            repeatCustomers:
                row.repeatCustomers.size,
            }));

      return res.json({
        ok: true,

        period: {
          key:
            range.key,

          from:
            range.from,

          to:
            range.to,

          previousFrom:
            range.previousFrom,

          previousTo:
            range.previousTo,
        },

        revenue: {
        value:
            current.revenue,

        previousValue:
            hasComparison
            ? previous.revenue
            : null,

        changeValue:
            hasComparison
            ? valueDifference(
                current.revenue,
                previous.revenue,
                2
                )
            : null,
        },

        orders: {

        value:

            current.orders,

        previousValue:

            hasComparison

            ? previous.orders

            : null,

        changeValue:

            hasComparison

            ? valueDifference(

                current.orders,

                previous.orders

                )

            : null,

        },

        averageCheck: {

        value:

            current.averageCheck,

        previousValue:

            hasComparison

            ? previous.averageCheck

            : null,

        changeValue:

            hasComparison

            ? valueDifference(

                current.averageCheck,

                previous.averageCheck,

                2

                )

            : null,

        },

        customers: {
        value:
            current.customers,

        previousValue:
            hasComparison
            ? previous.customers
            : null,

        changeValue:
            hasComparison
            ? valueDifference(
                current.customers,
                previous.customers
                )
            : null,
        },

        newCustomers: {
        value:
            current.newCustomers,

        percent:
            current.newCustomersPercent,

        previousValue:
            hasComparison
            ? previous.newCustomers
            : null,

        previousPercent:
            hasComparison
            ? previous.newCustomersPercent
            : null,

        changePoints:
            hasComparison
            ? percentagePoints(
                current.newCustomersPercent,
                previous.newCustomersPercent
                )
            : null,
        },

        repeatPurchases: {
        value:
            current.repeatCustomers,

        percent:
            current.repeatCustomersPercent,

        previousValue:
            hasComparison
            ? previous.repeatCustomers
            : null,

        previousPercent:
            hasComparison
            ? previous.repeatCustomersPercent
            : null,

        changePoints:
            hasComparison
            ? percentagePoints(
                current.repeatCustomersPercent,
                previous.repeatCustomersPercent
                )
            : null,
        },

        cancellations: {
        value:
            current.cancellations,

        percent:
            current.cancellationsPercent,

        previousValue:
            hasComparison
            ? previous.cancellations
            : null,

        previousPercent:
            hasComparison
            ? previous.cancellationsPercent
            : null,

        changePoints:
            hasComparison
            ? percentagePoints(
                current.cancellationsPercent,
                previous.cancellationsPercent
                )
            : null,
        },
        businessDynamics,
        retention,
        products: productPerformance,
        locations: locationPerformance,
        topPartners,
      });
    } catch (error) {
      console.error(
        "GET /crm/dashboard error:",
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
            "DASHBOARD_LOAD_FAILED",
        });
    }
  }
);

export default router;