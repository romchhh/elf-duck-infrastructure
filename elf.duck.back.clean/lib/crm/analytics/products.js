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
import { percentChange } from "./metrics.js";


export function getProductIdentity(item) {
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

export function collectProductSales(orders = []) {
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

export function getProductStock(product) {
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

export async function buildProductPerformance({
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
