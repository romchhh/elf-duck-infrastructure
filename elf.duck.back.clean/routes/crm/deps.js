/**
 * Спільні імпорти для CRM-роутів (щоб не дублювати 70+ рядків у кожному файлі).
 */
import express from "express";
import mongoose from "mongoose";
import crypto from "crypto";
import Order from "../../models/Order.js";
import Product from "../../models/Product.js";
import Category from "../../models/Category.js";
import PickupPoint from "../../models/PickupPoint.js";
import User from "../../models/User.js";
import BroadcastCampaign from "../../models/BroadcastCampaign.js";
import { fetchCrmOrdersPage } from "../../lib/crm/ordersList.js";
import {
  getPushAttributionWindowEnd,
  buildPushCampaignAnalytics,
  loadFirstSales,
  buildMetrics,
  percentChange,
  collectProductSales,
  getProductIdentity,
  getProductStock,
  buildProductPerformance,
  getLocationIdentity,
  collectLocationSales,
  buildLocationPerformance,
  buildTopPartners,
  getCustomerStatus,
  isCustomerActive,
  getCustomerSegment,
  getAveragePurchaseIntervalDays,
  percentagePoints,
  valueDifference,
} from "../../lib/crm/analytics.js";
import {
  CRM_TIME_ZONE,
  BROADCAST_TEMPLATES_COLLECTION,
  CRM_FAVORITE_CUSTOMERS_COLLECTION,
  CRM_SESSION_COOKIE,
  CRM_SESSION_TTL_MS,
  CRM_PUSH_MEDIA_MAX_BYTES,
  CRM_PUSH_MEDIA_ALLOWED_TYPES,
  CRM_PUSH_AUDIENCE_ID_CAP,
  PUSH_ATTRIBUTION_WINDOW_DAYS,
} from "../../lib/crm/constants.js";
import {
  getCrmSessionSecret,
  parseCookieHeader,
  signCrmSession,
  verifyCrmSessionToken,
  hasValidCrmSession,
  requireCrmPushAdmin,
} from "../../lib/crm/session.js";
import {
  getPeriodRange,
  getWarsawParts,
  getWarsawOffsetMinutes,
  warsawLocalToUtc,
  addDays,
  parseDateOnly,
  shiftCalendarMonth,
} from "../../lib/crm/datetime.js";
import {
  getCompletedOrderMatch,
  getSaleDateExpression,
  loadSales,
  loadSalesHistory,
  loadCanceledCount,
  loadCanceledOrders,
} from "../../lib/crm/sales.js";
import {
  getCrmOrderStatus,
  getCrmPaymentLabel,
  getCrmDeliveryLabel,
  getCrmItemsLabel,
} from "../../lib/crm/orderFormatters.js";
import {
  normalizePushString,
  normalizePushUsername,
  getPushUserDisplayName,
  getPushLocationKey,
} from "../../lib/crm/pushText.js";
import { buildPushAudiencePreview } from "../../lib/crm/pushAudience.js";

export {
  express,
  mongoose,
  crypto,
  Order,
  Product,
  Category,
  PickupPoint,
  User,
  BroadcastCampaign,
  fetchCrmOrdersPage,
  getPushAttributionWindowEnd,
  buildPushCampaignAnalytics,
  loadFirstSales,
  buildMetrics,
  percentChange,
  collectProductSales,
  getProductIdentity,
  getProductStock,
  buildProductPerformance,
  getLocationIdentity,
  collectLocationSales,
  buildLocationPerformance,
  buildTopPartners,
  getCustomerStatus,
  isCustomerActive,
  getCustomerSegment,
  getAveragePurchaseIntervalDays,
  percentagePoints,
  valueDifference,
  CRM_TIME_ZONE,
  BROADCAST_TEMPLATES_COLLECTION,
  CRM_FAVORITE_CUSTOMERS_COLLECTION,
  CRM_SESSION_COOKIE,
  CRM_SESSION_TTL_MS,
  CRM_PUSH_MEDIA_MAX_BYTES,
  CRM_PUSH_MEDIA_ALLOWED_TYPES,
  CRM_PUSH_AUDIENCE_ID_CAP,
  PUSH_ATTRIBUTION_WINDOW_DAYS,
  getCrmSessionSecret,
  parseCookieHeader,
  signCrmSession,
  verifyCrmSessionToken,
  hasValidCrmSession,
  requireCrmPushAdmin,
  getPeriodRange,
  getWarsawParts,
  getWarsawOffsetMinutes,
  warsawLocalToUtc,
  addDays,
  parseDateOnly,
  shiftCalendarMonth,
  getCompletedOrderMatch,
  getSaleDateExpression,
  loadSales,
  loadSalesHistory,
  loadCanceledCount,
  loadCanceledOrders,
  getCrmOrderStatus,
  getCrmPaymentLabel,
  getCrmDeliveryLabel,
  getCrmItemsLabel,
  normalizePushString,
  normalizePushUsername,
  getPushUserDisplayName,
  getPushLocationKey,
  buildPushAudiencePreview,
};
