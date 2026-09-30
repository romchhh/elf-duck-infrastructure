import mongoose from "mongoose";
import Order from "../../../models/Order.js";
import Product from "../../../models/Product.js";
import PickupPoint from "../../../models/PickupPoint.js";
import User from "../../../models/User.js";
import BroadcastCampaign from "../../../models/BroadcastCampaign.js";
import { PUSH_ATTRIBUTION_WINDOW_DAYS } from "../constants.js";
import {
  getCompletedOrderMatch,
  getSaleDateExpression,
  loadSales,
  loadSalesHistory,
  loadCanceledCount,
  loadCanceledOrders,
} from "../sales.js";
import { getPeriodRange, getWarsawDateKey } from "../datetime.js";


export async function buildTopPartners({
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
