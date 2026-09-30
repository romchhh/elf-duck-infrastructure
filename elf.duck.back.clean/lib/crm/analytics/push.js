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


export function getPushAttributionWindowEnd(
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

export async function buildPushCampaignAnalytics(
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
