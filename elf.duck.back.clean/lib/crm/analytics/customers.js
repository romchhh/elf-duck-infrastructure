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


const DAY_MS = 24 * 60 * 60 * 1000;

/** Запас после периодичности, после которого клиент становится спящим. */
export const SLEEPING_GRACE_DAYS = 7;

function finiteDayCount(value) {
  if (value == null || value === "") {
    return null;
  }

  const days = Number(value);
  return Number.isFinite(days) && days >= 0 ? days : null;
}

/**
 * Периодичность на карточке клиента:
 * среднее число дней между покупками. Нужно минимум 2 покупки.
 */
export function getCustomerIntervalDays(firstSaleAt, lastSaleAt, purchases) {
  const count = Number(purchases || 0);
  if (count < 2 || !firstSaleAt || !lastSaleAt) {
    return null;
  }

  const firstMs = new Date(firstSaleAt).getTime();
  const lastMs = new Date(lastSaleAt).getTime();
  if (Number.isNaN(firstMs) || Number.isNaN(lastMs) || lastMs < firstMs) {
    return null;
  }

  return Math.round((lastMs - firstMs) / (count - 1) / DAY_MS);
}

/** Средняя периодичность по клиентам, у которых она уже считается. */
export function getMeanCustomerIntervalDays(intervals) {
  const values = (intervals || [])
    .map((value) => finiteDayCount(value))
    .filter((value) => value != null);

  if (!values.length) {
    return null;
  }

  return Math.round(
    values.reduce((sum, value) => sum + value, 0) / values.length
  );
}

/**
 * Спящий: с последней покупки прошло больше, чем периодичность + 7 дней.
 * Личной периодичности нет (1 покупка) — берём среднюю по всем клиентам + 7.
 * Сравнение строгое: ровно на границе клиент ещё не спящий.
 */
export function isCustomerSleeping({
  lastSaleAt,
  intervalDays = null,
  averageIntervalDays = null,
  range,
}) {
  if (!lastSaleAt) {
    return true;
  }

  const personal = finiteDayCount(intervalDays);
  const average = finiteDayCount(averageIntervalDays);
  const baseline = personal != null ? personal : average;

  if (baseline == null) {
    return false;
  }

  const lastSale = new Date(lastSaleAt).getTime();
  if (Number.isNaN(lastSale)) {
    return true;
  }

  const rangeTo = range?.to ? new Date(range.to).getTime() : Date.now();
  const elapsedMs = rangeTo - lastSale;

  return elapsedMs > (baseline + SLEEPING_GRACE_DAYS) * DAY_MS;
}

export function getCustomerStatus({
  firstSaleAt,
  lastSaleAt,
  intervalDays = null,
  averageIntervalDays = null,
  range,
}) {
  const firstSale = firstSaleAt
    ? new Date(firstSaleAt)
    : null;

  const rangeTo = range?.to
    ? new Date(range.to)
    : new Date();

  const fourteenDaysMs = 14 * DAY_MS;

  if (
    isCustomerSleeping({
      lastSaleAt,
      intervalDays,
      averageIntervalDays,
      range,
    })
  ) {
    return "sleeping";
  }

  /*
   * Новый:
   * первая покупка в выбранном периоде.
   * Для period=all — первая покупка за последние 14 дней
   * (иначе почти все клиенты стали бы «новыми»).
   * Спящий имеет приоритет: просроченная первая покупка
   * не остаётся «новой».
   */
  const newFrom =
    String(range?.key || "") === "all"
      ? new Date(rangeTo.getTime() - fourteenDaysMs)
      : range?.from
        ? new Date(range.from)
        : null;

  if (
    firstSale &&
    newFrom &&
    firstSale >= newFrom &&
    firstSale < rangeTo
  ) {
    return "new";
  }

  return "active";
}

export function isCustomerActive({
  lastSaleAt,
  intervalDays = null,
  averageIntervalDays = null,
  range,
}) {
  return !isCustomerSleeping({
    lastSaleAt,
    intervalDays,
    averageIntervalDays,
    range,
  });
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

