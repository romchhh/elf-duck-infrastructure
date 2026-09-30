import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config({
  path: path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../.env"
  ),
});

import express from "express";
import cors from "cors";
import compression from "compression";

import Product from "./models/Product.js";
import Order from "./models/Order.js";
import Cart from "./models/Cart.js";
import User from "./models/User.js";
import PickupPoint from "./models/PickupPoint.js";
import Category from "./models/Category.js";
import BroadcastCampaign from "./models/BroadcastCampaign.js";
import DailyStatsDispatch from "./models/DailyStatsDispatch.js";
import crmRouter from "./routes/crm.js";

import mongoose from "mongoose";
import helpers from "./lib/server/helpers/index.js";
import { setServerContext } from "./lib/server/context.js";
import { bindApiGlobals } from "./routes/api/bindApiGlobals.js";
import { registerShopApiRoutes } from "./routes/api/index.js";
import { bootstrapShopTelegramBots } from "./lib/telegram/shopBots.js";
import { startServerIntervals } from "./lib/server/intervals.js";
import { bot, getActiveUserBots } from "./lib/server/botRegistry.js";

const APP_URL = String(
  process.env.APP_URL ||
    process.env.WEBAPP_URL ||
    "https://elfduck.telebots.site"
).trim();

const serverRuntime = {
  ...helpers,
  mongoose,
  bot,
  getActiveUserBots,
  User,
  Product,
  Category,
  PickupPoint,
  Cart,
  Order,
  BroadcastCampaign,
  DailyStatsDispatch,
};

setServerContext(serverRuntime);
bindApiGlobals();

const {
  ensurePromoCodeIndexes,
  ensureBroadcastTemplateIndexes,
} = helpers;

const app = express();

// CORS
const CRM_ALLOWED_ORIGINS = new Set(
  String(
    process.env.CRM_ALLOWED_ORIGINS ||
      "https://elfduck-crm.telebots.site"
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

const corsOptions = {
  origin(origin, cb) {
    if (!origin) {
      return cb(null, true);
    }

    if (origin === APP_URL) {
      return cb(null, true);
    }

    if (CRM_ALLOWED_ORIGINS.has(origin)) {
      return cb(null, true);
    }

    try {
      const url = new URL(origin);

      const isTelebotsSite =
        url.protocol === "https:" &&
        (url.hostname === "telebots.site" ||
          url.hostname.endsWith(".telebots.site"));

      if (isTelebotsSite) {
        return cb(null, true);
      }

      const isLocalDev =
        process.env.NODE_ENV !== "production" &&
        (url.hostname === "localhost" ||
          url.hostname === "127.0.0.1");

      if (isLocalDev) {
        return cb(null, true);
      }
    } catch {}

    console.warn("[CORS DENIED]", {
      origin,
      appUrl: APP_URL,
      allowedOrigins: Array.from(
        CRM_ALLOWED_ORIGINS
      ),
    });

    return cb(
      new Error(
        "CORS_ORIGIN_DENIED"
      )
    );
  },

  credentials: true,

  methods: [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
  ],

allowedHeaders: [

  "Content-Type",

  "x-admin-token",

  "x-telegram-init-data",

  "x-crm-session",

],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(compression());

app.use(
  "/crm/push/upload-media",
  express.json({
    limit: "14mb",
  })
);

app.use(express.json());
app.use("/crm", crmRouter);

registerShopApiRoutes(app);

mongoose
  .connect(process.env.MONGODB_URI, {
    maxPoolSize: 20,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    autoIndex: process.env.NODE_ENV !== "production",
  })
  .then(async () => {
    const dbName =
      mongoose.connection?.db?.databaseName || "unknown";
    console.log(`✅ MongoDB connected (database: ${dbName})`);

    await ensurePromoCodeIndexes();

    await ensureBroadcastTemplateIndexes();

    const { ensureDbIndexes } = await import("./lib/ensureDbIndexes.js");
    await ensureDbIndexes();

    if (

      String(

        process.env.CLEAR_ALL_RESERVED_QTY_ON_STARTUP || ""

      ).trim() === "1"

    ) {

      try {

        const result = await Product.updateMany(

          {},

          [

            {

              $set: {

                flavors: {

                  $map: {

                    input: { $ifNull: ["$flavors", []] },

                    as: "flavor",

                    in: {

                      $mergeObjects: [

                        "$$flavor",

                        {

                          stockByPickupPoint: {

                            $map: {

                              input: {

                                $ifNull: [

                                  "$$flavor.stockByPickupPoint",

                                  [],

                                ],

                              },

                              as: "stock",

                              in: {

                                $mergeObjects: [

                                  "$$stock",

                                  {

                                    reservedQty: 0,

                                  },

                                ],

                              },

                            },

                          },

                        },

                      ],

                    },

                  },

                },

              },

            },

          ]

        );

        console.log(

          "[MAINTENANCE][CLEAR ALL RESERVES] completed",

          {

            matchedCount: Number(

              result?.matchedCount || 0

            ),

            modifiedCount: Number(

              result?.modifiedCount || 0

            ),

          }

        );

      } catch (error) {

        console.error(

          "[MAINTENANCE][CLEAR ALL RESERVES] failed",

          error

        );

      }

    }

    if (process.env.SKIP_INDEX_SYNC !== "1") {
      setImmediate(async () => {
        try {
          await Promise.all([
            Product.syncIndexes(),
            Order.syncIndexes(),
            Cart.syncIndexes(),
            User.syncIndexes(),
            PickupPoint.syncIndexes(),
            Category.syncIndexes(),
            BroadcastCampaign.syncIndexes(),
            DailyStatsDispatch.syncIndexes(),
          ]);
          if (typeof app.locals.resumeCrmBroadcastCampaigns === "function") {
            await app.locals.resumeCrmBroadcastCampaigns();
          }
          console.log("✅ MongoDB indexes synced");
        } catch (err) {
          console.error("⚠️  Index sync failed:", err?.message || err);
        }
      });
    }
  })
  .catch((err) => console.error("❌ MongoDB error:", err));

await bootstrapShopTelegramBots(app);

startServerIntervals();

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
