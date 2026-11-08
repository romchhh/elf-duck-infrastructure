import mongoose from "mongoose";

const customerReviewSchema = new mongoose.Schema(
  {
    telegramId: { type: String, required: true, index: true },
    username: { type: String, default: "" },
    firstName: { type: String, default: "" },
    lastName: { type: String, default: "" },

    text: { type: String, required: true },

    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    },
    orderNo: { type: String, default: "" },

    pickupPointId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PickupPoint",
      default: null,
    },
    pointTitle: { type: String, default: "" },
    pointAddress: { type: String, default: "" },
    deliveryLabel: { type: String, default: "" },

    source: { type: String, default: "" },

    rating: { type: String, default: "" },
    ratingLabel: { type: String, default: "" },

    imageUrls: { type: [String], default: [] },
    imageCount: { type: Number, default: 0 },

    telegramSent: { type: Boolean, default: false },
    telegramError: { type: String, default: "" },
  },
  {
    timestamps: true,
    collection: "customer_reviews",
  }
);

customerReviewSchema.index({ createdAt: -1 });

export default mongoose.model("CustomerReview", customerReviewSchema);
