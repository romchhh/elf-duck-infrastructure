import express from "express";
import {
  Product,
  Category,
  PickupPoint,
} from "./deps.js";

const router = express.Router();

function toDisplayCategoryLabel(raw) {
  const s = String(raw || "").trim();
  if (!s) return "Категория";
  // if mostly uppercase (e.g. LIQUIDS), title-case words
  if (s === s.toUpperCase() && /[A-ZА-Я]/.test(s)) {
    return s
      .toLowerCase()
      .replace(/(^|\s|\-|_)(\S)/g, (_, a, b) => a + b.toUpperCase());
  }
  return s;
}

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
            key: "customers",
            label: "Клиенты",
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
            label: "Активные",
          },
          {
            key: "sleeping",
            label: "Спящие",
          },
          {
            key: "new",
            label: "Новые",
          },
        ],

        categories:
          categories.map(
            (category) => ({
              key: String(
                category?.key ||
                  ""
              ),

              label: toDisplayCategoryLabel(
                category?.title ||
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
              "Dostawa",
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

export default router;
