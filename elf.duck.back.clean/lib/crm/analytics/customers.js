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


export function getCustomerStatus({
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

export function isCustomerActive(
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

export function getCustomerSegment(
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

export function getAveragePurchaseIntervalDays(
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

